/** S6-0 가짜 데이터(seedFakeStage6): 판정표(stage6-rules-draft 2절)에 필요한 경우가 모두 있고, 실제 정보가 없고, 두 번 돌려도 +0. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com';

function seededEnv(opts) {
  const env = createGasEnv({ owner: OWNER, now: '2027-04-20T10:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = 'test.teacher@example.com';
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  if (!(opts && opts.noStage1)) env.asOwner((c) => c.seedFakeStage1());
  env.strictLock = true;
  return env;
}
const DB = ['career_profiles', 'course_plans', 'inquiry_records', 'feedback'];
const CN = ['counsel_requests', 'counsel_notes'];
const all = (env) => DB.map((t) => env.rows(t)).concat(CN.map((t) => env.rows(t, 'counsel')));
const snap = (env) => JSON.stringify(all(env));

test('seedFakeStage6: 새 탭 6개를 채우고(줄 수 고정), 두 번 실행해도 +0·그대로', () => {
  const env = seededEnv();
  const out = env.asOwner((c) => c.seedFakeStage6());
  assert.strictEqual(out, '가짜 6단계 데이터: terms.career_due 2027-03-31, career_profiles +10, course_plans +6, inquiry_records +6, feedback +4, counsel_requests +5, counsel_notes +3');
  const first = snap(env);
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage6()), '가짜 6단계 데이터: career_profiles +0, course_plans +0, inquiry_records +0, feedback +0, counsel_requests +0, counsel_notes +0');
  assert.strictEqual(snap(env), first);
  assert.strictEqual(env.rows('terms').find((t) => t.name === '2027 1학기').career_due, '2027-03-31');
});

test('진로 프로필: 0번 3버전(공개가 바뀜), 1번 공개 거둠, 취소 뒤 번호를 다시 쓰지 않음, 마감 뒤 제출, 6번 이후 미제출', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage6());
  const rows = env.rows('career_profiles');
  const students = env.rows('students').sort((a, b) => String(a.student_no).localeCompare(String(b.student_no)));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enrolled = students.filter((s) => env.rows('enrollments').some((e) => e.term_id === term.id && e.student_id === s.id));
  const of = (i) => rows.filter((r) => r.student_id === enrolled[i].id).sort((a, b) => Number(a.version) - Number(b.version));
  assert.deepStrictEqual(of(0).map((r) => [r.version, r.parent_fields, r.status]), [['1', '', '유효'], ['2', 'hopes;targets', '유효'], ['3', 'hopes', '유효']]);
  assert.deepStrictEqual(of(1).map((r) => [r.version, r.parent_fields]), [['1', 'hopes;targets;interests'], ['2', '']]);
  assert.deepStrictEqual(of(3).map((r) => [r.version, r.status, !!r.cancel_reason]), [['1', '취소', true], ['2', '유효', false]]);
  assert.ok(of(5)[0].submitted_at > '2027-03-31T23:59:59', '마감 뒤 제출');
  assert.strictEqual(of(6).length, 0, '6번 이후는 미제출');
  rows.forEach((r) => {
    assert.ok(r.term_id === term.id && /^\d+$/.test(r.version) && r.submitted_at);
    assert.ok(JSON.parse(r.hopes).length >= 1 && JSON.parse(r.hopes)[0].rank === 1 && JSON.parse(r.targets)[0].university.startsWith('가짜'));
    r.parent_fields.split(';').filter(Boolean).forEach((f) => assert.ok(['hopes', 'targets', 'interests', 'strengths', 'concerns'].includes(f), f));
  });
});

test('이수 계획·탐구 기록·피드백: 확정/계획·취소+새 줄·공개 섞임·이름 다름·완료 링크·피드백 대상 id가 실제 행', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage6());
  const plans = env.rows('course_plans'), inq = env.rows('inquiry_records'), fb = env.rows('feedback'), prof = env.rows('career_profiles');
  assert.deepStrictEqual([...new Set(plans.map((r) => r.state))].sort(), ['계획', '확정']);
  assert.ok(plans.some((r) => r.status === '취소' && r.cancel_reason) && plans.filter((r) => r.show_to_parent === 'TRUE').length >= 2 && plans.some((r) => r.show_to_parent === 'FALSE'));
  plans.filter((r) => r.state === '확정').forEach((r) => assert.ok(r.confirmed_by && r.confirmed_at));
  assert.ok(plans.filter((r) => r.state === '계획').every((r) => !r.confirmed_by));
  assert.deepStrictEqual([...new Set(inq.map((r) => r.progress))].sort(), ['관심', '완료', '진행 중']);
  assert.deepStrictEqual([...new Set(inq.map((r) => r.source))].sort(), ['기본 추천', '연결 예시', 'ChatGPT'].sort());
  assert.ok(inq.some((r) => r.name_mismatch === 'TRUE') && inq.some((r) => r.status === '취소') && inq.some((r) => r.show_to_parent === 'TRUE') && inq.some((r) => r.show_to_parent === 'FALSE'));
  inq.forEach((r) => { assert.strictEqual(r.standards.split(';').length, 2); assert.ok(r.file_id.startsWith('fake-')); assert.ok(r.result_link === '' || r.result_link.startsWith('https://example.com/')); });
  assert.strictEqual(new Set(inq.map((r) => r.student_id + '|' + r.source_id)).size, inq.length, '학생마다 원본 기록 id가 유일');
  const ids = { '진로 프로필': prof, '이수 계획': plans, '탐구 기록': inq };
  assert.deepStrictEqual([...new Set(fb.map((r) => r.target_kind))].sort(), Object.keys(ids).sort());
  fb.forEach((r) => assert.ok(ids[r.target_kind].some((x) => x.id === r.target_id && x.student_id === r.student_id), '피드백 대상: ' + r.target_kind));
  assert.ok(fb.some((r) => r.status === '취소' && r.cancel_reason) && fb.every((r) => r.teacher_email));
});

test('상담 신청·상담일지: 상태 5가지, 열린 신청(신청·확정)은 학생마다 1건 이하, 완료는 일지와 서로 연결, 합의 사항 공개 섞임', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage6());
  const req = env.rows('counsel_requests', 'counsel'), notes = env.rows('counsel_notes', 'counsel');
  assert.deepStrictEqual([...new Set(req.map((r) => r.status))].sort(), ['반려', '신청', '완료', '취소', '확정'].sort());
  const open = {}; req.filter((r) => ['신청', '확정'].includes(r.status)).forEach((r) => { open[r.student_id] = (open[r.student_id] || 0) + 1; });
  assert.ok(Object.values(open).every((n) => n === 1));
  req.forEach((r) => { assert.ok(r.wish_dates.split(';').length <= 3 && r.requester_email.endsWith('@example.com') && ['생활', '학습', '진로', '진학', '기타'].includes(r.topic)); });
  const done = req.find((r) => r.status === '완료'), n = notes.find((x) => x.id === done.linked_note_id);
  assert.ok(n && n.request_id === done.id && n.student_id === done.student_id, '완료 신청 ↔ 상담일지');
  assert.ok(req.filter((r) => ['반려', '취소'].includes(r.status)).every((r) => r.cancel_reason), '반려·취소는 사유');
  assert.ok(req.find((r) => r.status === '확정').decided_date && req.find((r) => r.status === '신청').decided_date === '');
  assert.deepStrictEqual(notes.map((x) => x.agreement_to_parent).sort(), ['FALSE', 'FALSE', 'TRUE']);
  assert.ok(notes.some((x) => x.agreement && x.agreement_to_parent === 'TRUE') && notes.some((x) => x.agreement && x.agreement_to_parent === 'FALSE') && notes.some((x) => !x.agreement));
  assert.ok(notes.every((x) => x.content.startsWith('가짜 ') && ['TRUE', 'FALSE'].includes(x.show_to_parent)) && notes.some((x) => x.profile_version) && notes.some((x) => x.target === '학부모'));
});

test('실제 정보 없음: 새 탭의 모든 값이 가짜 표시·example.com 이메일·가짜 파일 id뿐이고, audit_log에는 글 내용이 없고 글자 수만 있다', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage6());
  const cells = [];
  all(env).forEach((rows, k) => rows.forEach((r) => Object.entries(r).forEach(([col, v]) => { if (!/^(id|created_|updated_)/.test(col)) cells.push([k, col, String(v)]); })));
  const emails = cells.filter(([, , v]) => /@/.test(v));
  assert.ok(emails.length > 0 && emails.every(([, , v]) => /@example\.com$/.test(v)), JSON.stringify(emails.slice(0, 3)));
  const text = ['hopes', 'targets', 'interests', 'strengths', 'concerns', 'title', 'question', 'memo', 'content', 'agreement', 'cancel_reason'];
  cells.filter(([, col, v]) => text.includes(col) && v && !/^\[|^\{/.test(v)).forEach(([, col, v]) => assert.ok(/^가짜|^학생이 취소/.test(v), col + ': ' + v));
  const audit = env.rows('audit_log').filter((a) => /career_profiles|inquiry_records|feedback|counsel_requests|counsel_notes/.test(a.sheet));
  assert.ok(audit.length >= 10, '쓴 탭마다 감사 기록(일괄 추가는 한 줄, 상담 파일은 행마다)');
  audit.forEach((a) => assert.ok(!/가짜 (직업|분야|강점|고민|관심|탐구 주제|중심 질문|피드백|상담 내용|합의|메모)/.test(a.before + a.after), a.sheet + ' ' + a.action));
  const create = audit.filter((a) => a.action === 'create' && /counsel_notes/.test(a.sheet))[0];
  assert.ok(/\(내용 생략, \d+자\)/.test(create.after), create.after);
});

test('seedFakeStage6 보호: stage1 없이·실제 학생이 섞인 DB에서는 쓰지 않는다', () => {
  const env = seededEnv({ noStage1: true });
  assert.throws(() => env.asOwner((c) => c.seedFakeStage6()), /seedFakeStage1/);
  const e2 = seededEnv();
  const id = e2.rows('students')[0].id;
  e2.asOwner((c) => c.updateRecord_('students', id, { memo: '실제 학생' }, OWNER));
  assert.throws(() => e2.asOwner((c) => c.seedFakeStage6()), /가짜 학생.*만 있는 DB/);
  assert.strictEqual(e2.rows('career_profiles').length, 0);
});
