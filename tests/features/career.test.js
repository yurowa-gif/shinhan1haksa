/** C50 F15 진로 프로필: 제출(새 버전·이어받기)·부모님께 보이기·학부모는 공개 항목만·피드백·학사생이 아니면 쓰기 막힘·홈 숫자. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', ST = 'test.student@example.com', PA = 'test.parent@example.com', T1 = 'test.teacher@example.com',
  HR = 'test.homeroom@example.com', AD = 'test.admin@example.com', T2 = 'fake.teacher1@example.com';

function newEnv() {
  const env = createGasEnv({ owner: OWNER, now: '2027-04-20T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: T1, TEST_STUDENT_EMAIL: ST, TEST_PARENT_EMAIL: PA, TEST_HOMEROOM_EMAIL: HR });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage6());
  env.asOwner((c) => c.addUser(AD, '시험 관리자', 'admin'));
  return env;
}
const OK = { hopes: [{ rank: 1, field: '가짜 분야', job: '가짜 직업' }], targets: [{ university: '가짜대학교', unit: '가짜학과', track: '학생부종합' }], interests: '가짜 관심', strengths: '가짜 강점', concerns: '가짜 고민' };
const me = (env) => env.rows('students').find((s) => s.email === ST);
const profs = (env, sid) => env.rows('career_profiles').filter((r) => r.student_id === sid).sort((a, b) => Number(a.version) - Number(b.version));

test('제출: 새 버전으로 쌓고(덮어쓰지 않음) 지난 공개 항목을 이어받는다 — 보이기를 켠 항목만 fields로 바꾼다', () => {
  const env = newEnv(), sid = me(env).id;
  const before = profs(env, sid), last = before[before.length - 1];
  assert.ok(last.parent_fields, '가짜 데이터의 가장 최근 버전은 공개 항목이 있다');
  const r = env.call(ST, 'submitCareerProfile', OK);
  assert.deepStrictEqual(plain(r), { ok: true, version: before.length + 1 });
  const now = profs(env, sid);
  assert.strictEqual(now.length, before.length + 1);
  assert.deepStrictEqual(plain(now.slice(0, before.length)), plain(before), '지난 기록은 그대로');
  const added = now[now.length - 1];
  assert.strictEqual(added.parent_fields, last.parent_fields, '이어받기');
  assert.strictEqual(added.status, '유효'); assert.ok(added.submitted_at.startsWith('2027-04-20'));
  const r2 = env.call(ST, 'submitCareerProfile', Object.assign({}, OK, { fields: { hopes: false, interests: true } }));
  const v2 = profs(env, sid).pop();
  assert.strictEqual(r2.version, before.length + 2);
  assert.ok(!v2.parent_fields.split(';').includes('hopes') && v2.parent_fields.split(';').includes('interests'));
  assert.ok(env.auditActions().includes('create'));
  assert.ok(!env.rows('audit_log').some((a) => /career_profiles/.test(a.sheet) && /가짜 관심/.test(a.after)), '글 내용은 audit에 없다');
});

test('제출 오류(1순위 없음·긴 글)는 아무것도 쓰지 않고 문장으로 알린다 · 취소된 번호를 다시 쓰지 않는다', () => {
  const env = newEnv(), sid = me(env).id, n = profs(env, sid).length;
  const bad = env.call(ST, 'submitCareerProfile', Object.assign({}, OK, { hopes: [], concerns: 'ㄱ'.repeat(1001) }));
  assert.strictEqual(bad.ok, false); assert.ok(bad.errors.some((e) => /1순위/.test(e)) && bad.errors.some((e) => /1000자/.test(e)));
  assert.strictEqual(profs(env, sid).length, n);
  const mid = profs(env, sid)[0];
  env.asOwner((c) => c.updateRecord_('career_profiles', mid.id, { status: '취소', cancel_reason: '시험' }, OWNER));
  assert.strictEqual(env.call(ST, 'submitCareerProfile', OK).version, n + 1);
});

test('부모님께 보이기: 가장 최근 버전만 켜고 끈다, 끄면 안내(결정 92), 남의 기록·옛 버전은 거부, audit에 바뀐 값', () => {
  const env = newEnv(), sid = me(env).id, rows = profs(env, sid), last = rows[rows.length - 1];
  const on = env.call(ST, 'setCareerPublish', last.id, { strengths: true });
  assert.strictEqual(on.ok, true); assert.ok(on.parentFields.includes('strengths')); assert.strictEqual(on.notice, '');
  const off = env.call(ST, 'setCareerPublish', last.id, { hopes: false });
  assert.strictEqual(off.notice, '학부모님이 이미 보신 내용은 되돌릴 수 없습니다.'); assert.ok(!off.parentFields.includes('hopes'));
  assert.strictEqual(env.call(ST, 'setCareerPublish', rows[0].id, { hopes: true }).ok, false);
  const other = env.rows('career_profiles').find((r) => r.student_id !== sid);
  assert.strictEqual(env.call(ST, 'setCareerPublish', other.id, { hopes: true }).ok, false);
  assert.strictEqual(env.call(ST, 'setCareerPublish', last.id, { nope: true }).ok, false);
  assert.ok(env.rows('audit_log').some((a) => /career_profiles/.test(a.sheet) && a.action === 'update' && /parent_fields/.test(a.after)));
  env.expectDenied(PA, 'career.publish', 'setCareerPublish', last.id, { hopes: true });
  env.expectDenied(T1, 'career.publish', 'setCareerPublish', last.id, { hopes: true });
});

test('학부모: 가장 최근 버전의 공개 항목만 응답에 있다 — 켜지 않은 항목 이름·피드백·버전 목록은 가지 않고, 안 냄·공개 안 함·껐음은 같은 응답', () => {
  const env = newEnv(), sid = me(env).id, last = profs(env, sid).pop();
  const r = env.call(PA, 'getCareerStudent', sid, 0);
  assert.strictEqual(r.ok, true);
  const shown = last.parent_fields.split(';').filter(Boolean);
  assert.deepStrictEqual(Object.keys(r.current).filter((k) => ['hopes', 'targets', 'interests', 'strengths', 'concerns'].includes(k)).sort(), shown.sort());
  assert.ok(!('parentFields' in r.current) && !('versions' in r) && !('feedback' in r) && !('canFeedback' in r));
  ['version', 'parentFields', 'teacherName', 'feedback', 'versions', 'canWrite', 'canFeedback', 'total'].forEach((k) => assert.ok(!JSON.stringify(r).includes('"' + k + '"'), '학부모 응답에 ' + k + ' 키가 없다'));
  assert.ok(!JSON.stringify(r).includes('teacher'), '교사 이메일·이름 없음');
  assert.deepStrictEqual(plain(env.call(PA, 'getCareerStudent', sid, 1)), plain(r), '옛 버전을 달라고 해도 가장 최근 것');
  // 끄면 바로 사라진다 → 안 냄과 같은 응답 모양
  env.call(ST, 'setCareerPublish', last.id, Object.fromEntries(shown.map((f) => [f, false])));
  const none = env.call(PA, 'getCareerStudent', sid, 0);
  assert.deepStrictEqual(Object.keys(none).sort(), ['none', 'ok', 'student', 'viewer']);
  const kids = env.rows('guardian_links').filter((g) => g.parent_email === PA).map((g) => g.student_id).filter((id) => id !== sid);
  const never = env.rows('students').find((s) => !profs(env, s.id).length && kids.indexOf(s.id) < 0);
  const stranger = env.rows('students').find((s) => kids.indexOf(s.id) < 0 && s.id !== sid);
  env.expectDenied(PA, 'career.view', 'getCareerStudent', stranger.id, 0);
  assert.ok(never);
});

test('교사: 목록(미제출·유예·제출)·모든 버전과 공개 꼬리표 · 담당이 아니면 거부 · 담임·관리자도 본다', () => {
  const env = newEnv();
  const c = env.call(T1, 'getCareerContext', 'hall_teacher');
  assert.strictEqual(c.mode, 'staff'); assert.ok(c.total > 0 && c.list.length === c.total);
  const miss = c.list.filter((s) => s.state === '미제출');
  assert.strictEqual(miss.length, c.missing);
  assert.ok(c.list.every((s, i, a) => i === 0 || { '미제출': 0, '유예': 1, '제출': 2 }[a[i - 1].state] <= { '미제출': 0, '유예': 1, '제출': 2 }[s.state]), '미제출이 위');
  assert.ok(c.list.every((s) => !('email' in s) && !('phone' in s)));
  const sub = c.list.find((s) => s.state === '제출');
  const d = env.call(T1, 'getCareerStudent', sub.id, 0);
  assert.ok(d.versions.length >= 1 && d.current && d.canFeedback === true && 'parentFields' in d.current);
  const first = d.versions[0].version;
  assert.strictEqual(env.call(T1, 'getCareerStudent', sub.id, first).current.version, first);
  const otherTeacher = env.rows('enrollments').find((e) => e.teacher_email !== T1).student_id;
  env.expectDenied(T1, 'career.view', 'getCareerStudent', otherTeacher, 0);
  assert.strictEqual(env.call(AD, 'getCareerContext', 'admin').total >= c.total, true);
  assert.strictEqual(env.call(AD, 'getCareerStudent', sub.id, 0).canFeedback, false, '관리자는 보기만');
  env.call(HR, 'getCareerContext', 'homeroom');
  env.expectAllowed(HR, 'getCareerContext', 'homeroom');
});

test('피드백: 담당교사만 쓰고(관리자·담임·학생·학부모 거부), 학생에게만 보이며(교사 이메일 없음), 취소 처리는 쓴 교사만·삭제 없음', () => {
  const env = newEnv(), sid = me(env).id, last = profs(env, sid).pop();
  const before = env.rows('feedback').length;
  assert.strictEqual(env.call(T1, 'addCareerFeedback', sid, last.id, '   ').ok, false);
  assert.strictEqual(env.call(T1, 'addCareerFeedback', sid, last.id, 'ㄱ'.repeat(1001)).ok, false);
  assert.strictEqual(env.call(T1, 'addCareerFeedback', sid, last.id, '가짜 피드백 내용').ok, true);
  const row = env.rows('feedback').pop();
  assert.strictEqual(env.rows('feedback').length, before + 1);
  assert.deepStrictEqual(plain([row.target_kind, row.target_id, row.student_id, row.teacher_email, row.status]), ['진로 프로필', last.id, sid, T1, '유효']);
  ['career.view', 'feedback.write'].forEach(() => {});
  [AD, HR, ST, PA].forEach((who) => env.expectDenied(who, 'feedback.write', 'addCareerFeedback', sid, last.id, '가짜'));
  const s = env.call(ST, 'getCareerStudent', sid, 0);
  assert.ok(s.feedback.some((f) => f.content === '가짜 피드백 내용' && f.teacherName), '학생은 본다');
  assert.ok(!JSON.stringify(s).includes(T1), '교사 이메일은 응답에 없다');
  assert.ok(!('feedback' in env.call(PA, 'getCareerStudent', sid, 0)));
  assert.strictEqual(env.call(T1, 'getCareerStudent', sid, 0).feedback.find((f) => f.id === row.id).mine, true);
  assert.strictEqual(env.call(T1, 'cancelCareerFeedback', row.id, '네').ok, false, '사유 2자 이상');
  env.expectDenied(ST, 'feedback.cancel', 'cancelCareerFeedback', row.id, '잘못 씀');
  assert.strictEqual(env.call(T1, 'cancelCareerFeedback', row.id, '잘못 썼습니다').ok, true);
  assert.strictEqual(env.rows('feedback').length, before + 1, '지우지 않는다');
  assert.strictEqual(env.rows('feedback').find((f) => f.id === row.id).status, '취소');
  assert.ok(!env.call(ST, 'getCareerStudent', sid, 0).feedback.some((f) => f.id === row.id));
});

test('학사생이 아니게 된 뒤(결정 97): 제출·공개·피드백이 막히고 보기는 된다', () => {
  const env = newEnv(), sid = me(env).id, last = profs(env, sid).pop();
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: sid, item: '학사', value: '퇴실', effective_date: '2027-04-19', effective_date_auto: '2027-04-19',
    requested_at: '2027-04-19T08:00:00', reason: '시험', memo: '', source: 'F6', status: '유효', doc_submitted: 'FALSE', linked_change_id: '', cancel_reason: '' }, OWNER));
  const n = profs(env, sid).length, fb = env.rows('feedback').length;
  assert.strictEqual(env.call(ST, 'submitCareerProfile', OK).ok, false);
  assert.strictEqual(env.call(ST, 'setCareerPublish', last.id, { hopes: true }).ok, false);
  assert.strictEqual(env.call(T1, 'addCareerFeedback', sid, last.id, '가짜 피드백').ok, false);
  assert.strictEqual(profs(env, sid).length, n); assert.strictEqual(env.rows('feedback').length, fb);
  const v = env.call(ST, 'getCareerStudent', sid, 0);
  assert.ok(v.current && v.canWrite === false && v.active === false);
  assert.strictEqual(env.call(ST, 'getCareerContext', 'student').active, false);
});

test('홈: 학사 교사 홈에만 미제출 숫자(관리자·담임 없음), 학생 홈에 냈는지, 학부모는 화면 링크만', () => {
  const env = newEnv();
  const t = env.call(T1, 'getHomeData', 'hall_teacher');
  const ctx = env.call(T1, 'getCareerContext', 'hall_teacher');
  assert.strictEqual(t.career.missing, ctx.missing); assert.ok(t.career.dueKo);
  assert.ok(!env.call(AD, 'getHomeData', 'admin').career);
  assert.ok(!env.call(HR, 'getHomeData', 'homeroom').career);
  const s = env.call(ST, 'getHomeData', 'student');
  assert.strictEqual(s.career.submitted, true); assert.ok(s.career.version >= 1 && s.career.at);
  assert.ok(!('career' in env.call(PA, 'getHomeData', 'parent')));
});

test('응답 칸은 판정표가 돌려준 것만: 판정표에서 칸을 빼면 응답에서도 빠진다(프로필·피드백)', () => {
  const env = newEnv(), sid = me(env).id, last = profs(env, sid).pop();
  env.call(T1, 'addCareerFeedback', sid, last.id, '가짜 피드백');
  const base = env.call(ST, 'getCareerStudent', sid, 0);
  assert.ok('concerns' in base.current && base.feedback.length && base.feedback[0].content);
  const cut = plain(env.as(ST, (c) => {
    c.S6_TABLE.profile.student = c.S6_TABLE.profile.cols.filter((x) => x !== 'concerns' && x !== 'version');
    c.S6_TABLE.feedback.student = c.S6_TABLE.feedback.student.filter((x) => x !== 'content');
    return c.getCareerStudent(sid, 0);
  }));
  assert.ok(!('concerns' in cut.current) && !('version' in cut.current), '판정표에 없는 칸은 응답에도 없다');
  assert.ok(cut.feedback.length && cut.feedback.every((f) => !('content' in f)));
  const noParent = plain(env.as(PA, (c) => { c.S6_TABLE.profile.parent = []; return c.getCareerStudent(sid, 0); }));
  assert.strictEqual(noParent.none, true);
});

test('운영 기간이 없으면 제출은 "운영 기간이 아니라 낼 수 없습니다"로 알린다', () => {
  const env = newEnv(), n = env.rows('career_profiles').length;
  const r = plain(env.as(ST, (c) => { c.getCurrentTerm_ = () => null; return c.submitCareerProfile(OK); }));
  assert.deepStrictEqual(r, { ok: false, errors: ['지금은 운영 기간이 아니라 낼 수 없습니다.'] });
  assert.strictEqual(env.rows('career_profiles').length, n);
});

test('결정 104: 지금 담당은 지난 기간 버전도 보고, 전 담당은 자기 기간 버전만 보며 피드백은 못 쓴다', () => {
  const env = newEnv(), sid = me(env).id;
  const all = profs(env, sid);
  assert.ok(all.length >= 2, '가짜 데이터에 버전이 둘 이상');
  const old = all[0];
  env.asOwner((c) => {
    c.updateRecord_('career_profiles', old.id, { term_id: 'T-OLD' }, OWNER);
    c.appendRecord_('enrollments', { term_id: 'T-OLD', student_id: sid, teacher_email: T2 }, OWNER);
  });
  const vers = (r) => r.versions.map((v) => v.version);
  const cur = plain(env.call(T1, 'getCareerStudent', sid, Number(old.version)));
  assert.ok(vers(cur).includes(Number(old.version)), '지금 담당은 지난 기간 버전도 본다');
  assert.strictEqual(cur.current.version, Number(old.version));
  assert.strictEqual(cur.canFeedback, true, '지금 담당은 지난 버전에도 피드백을 쓸 수 있다');
  const past = plain(env.call(T2, 'getCareerStudent', sid));
  assert.deepStrictEqual(vers(past), [Number(old.version)], '전 담당은 자기 기간 버전만');
  assert.strictEqual(past.canFeedback, false, '전 담당은 쓰지 못한다');
  env.expectDenied(T2, 'feedback.write', 'addCareerFeedback', sid, old.id, '가짜 피드백');
});
