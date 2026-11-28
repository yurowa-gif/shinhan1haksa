/** C51 F15 이수 계획 + 권장 이수 과목: 고르기(택N 초과 막기)·바꾸면 취소 + 새 줄·줄마다 학부모 공개·담당교사 확정·권장 과목 참고·빠진 과목 표시·홈 숫자. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', ST = 'test.student@example.com', PA = 'test.parent@example.com', T1 = 'test.teacher@example.com',
  HR = 'test.homeroom@example.com', AD = 'test.admin@example.com';

function newEnv() {
  const env = createGasEnv({ owner: OWNER, now: '2027-04-20T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: T1, TEST_STUDENT_EMAIL: ST, TEST_PARENT_EMAIL: PA, TEST_HOMEROOM_EMAIL: HR });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage6());
  env.asOwner((c) => c.addUser(AD, '시험 관리자', 'admin'));
  // 이 시험의 계획은 시험이 직접 만든다(가짜 데이터의 이수 계획 줄은 치운다 — 취소 처리)
  env.rows('course_plans').forEach((r) => env.asOwner((c) => c.updateRecord_('course_plans', r.id, { status: '취소', cancel_reason: '시험' }, OWNER)));
  return env;
}
const me = (env) => env.rows('students').find((s) => s.email === ST);
const entryOf = (env) => String(2027 - Number(me(env).grade) + 1);
const head = 'entry_year,grade,semester,choice_group,pick_n,course';
function upload(env, entry) {
  const t = [head, `${entry},2,1,,,공통국어1`, `${entry},2,1,선택군 A,2,화법과 언어`, `${entry},2,1,선택군 A,2,독서와 작문`, `${entry},2,1,선택군 A,2,대수`, `${entry},2,2,B,1,기하`, `${entry},2,2,B,1,확률과 통계`].join('\n');
  const p = env.call(AD, 'previewCurriculum', 'curriculum', t);
  assert.strictEqual(env.call(AD, 'saveCurriculum', 'curriculum', t, { kind: 'curriculum', counts: p.counts }).ok, true);
}
const sel = (g, s, grp, c) => ({ grade: g, semester: s, choice_group: grp, course: c });
const live = (env, sid) => env.rows('course_plans').filter((r) => r.student_id === sid && r.status !== '취소');
function seeded() { const env = newEnv(); upload(env, entryOf(env)); return env; }

test('고르기: 편제표의 살아 있는 줄에서만, 택N 초과·없는 과목·같은 과목 두 번은 막고(아무것도 쓰지 않음), 저장하면 계획 줄 + 기본 비공개', () => {
  const env = seeded(), sid = me(env).id;
  const bad = [
    [[sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '1', '선택군 A', '독서와 작문'), sel('2', '1', '선택군 A', '대수')], /2과목까지/],
    [[sel('2', '1', '선택군 A', '없는 과목')], /과목이 없습니다/],
    [[sel('2', '1', '선택군 A', '대수'), sel('2', '1', '선택군 A', '대수')], /두 번 골랐습니다/]];
  bad.forEach(([s, re]) => { const r = env.call(ST, 'saveCoursePlan', s); assert.strictEqual(r.ok, false); assert.ok(re.test(r.errors.join(' ')), r.errors.join(' ')); });
  assert.strictEqual(live(env, sid).length, 0);
  const ok = env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '2', 'B', '기하')]);
  assert.deepStrictEqual(plain([ok.ok, ok.added, ok.cancelled]), [true, 2, 0]);
  const rows = live(env, sid);
  assert.ok(rows.every((r) => r.state === '계획' && r.show_to_parent === 'FALSE' && r.entry_year === entryOf(env) && r.term_id));
  assert.ok(env.auditActions().includes('bulk_create'));
});

test('바꾸기: 같은 과목은 그대로(확정 유지), 바뀐 과목은 취소 + 새 줄(계획), 확정 과목을 빼면 경고 — 지우지 않는다', () => {
  const env = seeded(), sid = me(env).id;
  env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '1', '선택군 A', '대수')]);
  env.call(T1, 'confirmCoursePlan', sid, []);
  const before = live(env, sid), all0 = env.rows('course_plans').length;
  assert.ok(before.every((r) => r.state === '확정'));
  const r = env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '1', '선택군 A', '독서와 작문')]);
  assert.deepStrictEqual(plain([r.added, r.cancelled, r.same]), [1, 1, 1]);
  assert.ok(r.warnings.some((w) => /대수/.test(w) && /다시 확인/.test(w)));
  const now = live(env, sid), kept = now.find((x) => x.course === '화법과 언어'), added = now.find((x) => x.course === '독서와 작문');
  assert.strictEqual(kept.state, '확정'); assert.strictEqual(added.state, '계획');
  assert.strictEqual(env.rows('course_plans').length, all0 + 1, '지우지 않고 줄이 늘어난다');
  assert.strictEqual(env.rows('course_plans').find((x) => x.course === '대수' && x.student_id === sid).status, '취소');
  assert.strictEqual(env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '1', '선택군 A', '독서와 작문')]).added, 0, '같은 계획을 다시 저장하면 0건');
});

test('부모님께 보이기: 과목 줄마다(본인 줄만), 끄면 안내, 학부모는 켠 줄만 — 권장 과목·피드백·고르기 옵션은 응답에 없다', () => {
  const env = seeded(), sid = me(env).id;
  env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '2', 'B', '기하')]);
  const [a, b] = live(env, sid);
  assert.strictEqual(env.call(ST, 'setCoursePlanPublish', a.id, true).ok, true);
  assert.strictEqual(live(env, sid).find((x) => x.id === a.id).show_to_parent, 'TRUE');
  const p = env.call(PA, 'getCoursePlanStudent', sid);
  assert.deepStrictEqual(plain(p.semesters.map((s) => s.rows.map((r) => r.course))), [[a.course]]);
  const keys = JSON.stringify(p);
  ['options', 'recs', 'feedback', 'canWrite', 'canConfirm', 'dropped', 'confirmed_by', 'show_to_parent'].forEach((k) => assert.ok(!keys.includes('"' + k + '"'), '학부모 응답에 ' + k + ' 없음'));
  assert.deepStrictEqual(Object.keys(p.semesters[0].rows[0]).sort(), ['choice_group', 'course', 'grade', 'semester', 'state'].sort());
  assert.strictEqual(env.call(ST, 'setCoursePlanPublish', a.id, false).notice, '학부모님이 이미 보신 내용은 되돌릴 수 없습니다.');
  assert.strictEqual(env.call(PA, 'getCoursePlanStudent', sid).semesters.length, 0, '끄면 바로 사라진다');
  const other = env.rows('course_plans').find((x) => x.student_id !== sid);
  assert.ok(other, '다른 학생의 줄(가짜 데이터)');
  assert.strictEqual(env.call(ST, 'setCoursePlanPublish', other.id, true).ok, false);
  env.expectDenied(T1, 'plan.publish', 'setCoursePlanPublish', b.id, true);
  env.expectDenied(PA, 'plan.publish', 'setCoursePlanPublish', b.id, true);
});

test('확정: 지금 담당 교사만(관리자·담임·다른 교사·학생·학부모 거부), 관리자이면서 담당 교사인 사람은 켜진다, 이미 확정은 0건', () => {
  const env = seeded(), sid = me(env).id;
  env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '2', 'B', '기하')]);
  const [a, b] = live(env, sid);
  const t = env.call(T1, 'getCoursePlanStudent', sid);
  assert.strictEqual(t.canConfirm, true); assert.strictEqual(t.viewer.role, 'assigned');
  assert.strictEqual(env.call(AD, 'getCoursePlanStudent', sid).canConfirm, false, '관리자는 보기만');
  assert.strictEqual(env.call(HR, 'getCoursePlanStudent', sid).canConfirm, false, '담임은 보기만');
  const other = env.rows('enrollments').find((e) => e.teacher_email !== T1 && e.student_id !== sid);
  [AD, HR, ST, PA, 'fake.teacher1@example.com'].forEach((who) => env.expectDenied(who, 'plan.confirm', 'confirmCoursePlan', sid, [a.id]));
  const r = env.call(T1, 'confirmCoursePlan', sid, [a.id]);
  assert.deepStrictEqual(plain(r), { ok: true, count: 1 });
  const row = live(env, sid).find((x) => x.id === a.id);
  assert.deepStrictEqual(plain([row.state, row.confirmed_by]), ['확정', T1]); assert.ok(row.confirmed_at.startsWith('2027-04-20'));
  assert.strictEqual(live(env, sid).find((x) => x.id === b.id).state, '계획', '고르지 않은 줄은 그대로');
  assert.strictEqual(env.call(T1, 'confirmCoursePlan', sid, [a.id]).count, 0, '이미 확정은 0건');
  assert.strictEqual(env.call(T1, 'confirmCoursePlan', sid, ['없는 id']).ok, false);
  // 관리자이면서 학사 교사: 담당일 때 '담당'으로 판정되어 확정 버튼이 켜진다(순서 본인 > 담당 > 관리자 > 담임)
  const urow = env.rows('users').find((u) => u.email === T1);
  env.asOwner((c) => c.updateRecord_('users', urow.id, { roles: 'hall_teacher,admin' }, OWNER));
  const both = env.call(T1, 'getCoursePlanStudent', sid);
  assert.strictEqual(both.viewer.role, 'assigned'); assert.strictEqual(both.canConfirm, true);
  assert.strictEqual(env.call(T1, 'confirmCoursePlan', sid, [b.id]).count, 1);
  assert.ok(other, 'dummy');
});

test('권장 이수 과목: 가장 최근 진로 프로필의 목표 학과에 맞는 줄을 학생·교사에게만 참고로, 고르기 목록에 핵심 권장·권장 꼬리표, 자료에 없는 학과는 빈 목록', () => {
  const env = seeded(), sid = me(env).id;
  const recHead = 'base_year,university,unit,core_courses,recommended_courses,source_url,source_title,note';
  const t = [recHead, '2099,가짜대학교 1,가짜학과 1,대수,독서와 작문,https://example.com/a,가짜 출처,'].join('\n');
  const p = env.call(AD, 'previewCurriculum', 'recommendations', t);
  env.call(AD, 'saveCurriculum', 'recommendations', t, { kind: 'recommendations', counts: p.counts });
  const s = env.call(ST, 'getCoursePlanStudent', sid);
  assert.strictEqual(s.recs.hasTargets, true);
  assert.ok(s.recs.list.length >= 1 && s.recs.list[0].university === '가짜대학교 1' && s.recs.list[0].sourceUrl === 'https://example.com/a' && s.recs.list[0].baseYear === '2099');
  assert.ok(s.recs.list[0].core.includes('대수') && s.recs.list[0].recommended.includes('독서와 작문'));
  const grp = s.options.find((o) => o.grade === '2' && o.semester === '1').groups[0];
  assert.deepStrictEqual(plain(grp.courses.map((c, i) => [c, grp.tags[i]])), [['화법과 언어', ''], ['독서와 작문', '권장'], ['대수', '핵심 권장']]);
  assert.ok(env.call(T1, 'getCoursePlanStudent', sid).recs.list.length >= 1, '담당 교사도 본다');
  assert.ok(!('recs' in env.call(PA, 'getCoursePlanStudent', sid)), '학부모에게는 없다');
  const none = env.call(AD, 'getCoursePlanStudent', env.rows('students').find((x) => x.id !== sid && !env.rows('career_profiles').some((r) => r.student_id === x.id)).id);
  assert.deepStrictEqual(plain(none.recs.list), []);
});

test('교육과정에서 빠진 과목: 이미 고른 줄에 dropped 표시(줄은 그대로), 학사생이 아니면 고르기·확정 막힘, 빈 교육과정이면 ready false', () => {
  const env = seeded(), sid = me(env).id, entry = entryOf(env);
  env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어'), sel('2', '1', '선택군 A', '대수')]);
  const t = [head, `${entry},2,1,,,공통국어1`, `${entry},2,1,선택군 A,2,화법과 언어`, `${entry},2,1,선택군 A,2,독서와 작문`, `${entry},2,2,B,1,기하`, `${entry},2,2,B,1,확률과 통계`].join('\n');
  const p = env.call(AD, 'previewCurriculum', 'curriculum', t);
  assert.ok(p.warnings.some((w) => /"대수"/.test(w) && /이미 고른 학생이 1명/.test(w)));
  env.call(AD, 'saveCurriculum', 'curriculum', t, { kind: 'curriculum', counts: p.counts });
  const s = env.call(ST, 'getCoursePlanStudent', sid), rows = s.semesters.flatMap((x) => x.rows);
  assert.deepStrictEqual(plain(rows.map((r) => [r.course, r.dropped])), [['화법과 언어', false], ['대수', true]]);
  assert.strictEqual(env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '대수')]).ok, false, '빠진 과목은 새로 고를 수 없다');
  // 학사 퇴실
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: sid, item: '학사', value: '퇴실', effective_date: '2027-04-19', effective_date_auto: '2027-04-19', requested_at: '2027-04-19T08:00:00', reason: '시험', memo: '', source: 'F6', status: '유효', doc_submitted: 'FALSE', linked_change_id: '', cancel_reason: '' }, OWNER));
  assert.strictEqual(env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '독서와 작문')]).ok, false);
  assert.strictEqual(env.call(T1, 'confirmCoursePlan', sid, []).ok, false);
  assert.strictEqual(env.call(ST, 'setCoursePlanPublish', live(env, sid)[0].id, true).ok, false);
  assert.ok(env.call(ST, 'getCoursePlanStudent', sid).semesters.length, '보기는 된다');
  const empty = newEnv();
  assert.strictEqual(empty.call(ST, 'getCoursePlanContext', 'student').ready, false);
});

test('피드백(학생 단위): 담당교사만 쓰고 학생에게만 보이며 쓴 날이 있다, 고른 과목이 없으면 거부, 취소 처리는 쓴 교사만', () => {
  const env = seeded(), sid = me(env).id;
  assert.strictEqual(env.call(T1, 'addPlanFeedback', sid, '가짜 이수 피드백').ok, false, '고른 과목이 없다');
  env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어')]);
  assert.strictEqual(env.call(T1, 'addPlanFeedback', sid, '가짜 이수 피드백').ok, true);
  const row = env.rows('feedback').find((f) => f.content === '가짜 이수 피드백');
  assert.deepStrictEqual(plain([row.target_kind, row.student_id, row.teacher_email]), ['이수 계획', sid, T1]);
  [AD, HR, ST, PA].forEach((who) => env.expectDenied(who, 'feedback.write', 'addPlanFeedback', sid, '가짜'));
  const s = env.call(ST, 'getCoursePlanStudent', sid);
  assert.ok(s.feedback.some((f) => f.content === '가짜 이수 피드백' && f.teacherName && f.at === row.created_at));
  assert.ok(!JSON.stringify(s).includes(T1));
  assert.ok(!('feedback' in env.call(PA, 'getCoursePlanStudent', sid)));
  assert.strictEqual(env.call(T1, 'cancelCareerFeedback', row.id, '잘못 썼습니다').ok, true);
  assert.ok(!env.call(ST, 'getCoursePlanStudent', sid).feedback.some((f) => f.id === row.id));
});

test('목록·홈: 확인할 학생이 위, 학사 교사 홈에만 plan.pending(관리자·담임 홈 없음)', () => {
  const env = seeded(), sid = me(env).id;
  env.call(ST, 'saveCoursePlan', [sel('2', '1', '선택군 A', '화법과 언어')]);
  const c = env.call(T1, 'getCoursePlanContext', 'hall_teacher');
  assert.strictEqual(c.mode, 'staff'); assert.strictEqual(c.list[0].id, sid); assert.strictEqual(c.list[0].state, '확인'); assert.strictEqual(c.pending, 1);
  assert.strictEqual(env.call(T1, 'getHomeData', 'hall_teacher').plan.pending, 1);
  assert.ok(!env.call(AD, 'getHomeData', 'admin').plan && !env.call(HR, 'getHomeData', 'homeroom').plan);
  env.call(T1, 'confirmCoursePlan', sid, []);
  assert.strictEqual(env.call(T1, 'getHomeData', 'hall_teacher').plan.pending, 0);
  assert.strictEqual(env.call(T1, 'getCoursePlanContext', 'hall_teacher').list.find((s) => s.id === sid).state, '확정');
  assert.deepStrictEqual(plain(env.call(PA, 'getCoursePlanContext', 'parent')), { ok: true, mode: 'parent' }, '학부모는 진로 화면의 카드로 본다');
  env.expectDenied('test.parent@example.com', 'plan.view', 'getCoursePlanStudent', env.rows('students').find((s) => !env.rows('guardian_links').some((g) => g.parent_email === PA && g.student_id === s.id)).id);
});
