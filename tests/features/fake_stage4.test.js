/**
 * T5 가짜 데이터 보강(seedFakeStage4): 휴일 블록·휴일 2일·시험 기간 1주·학기 중 추가 입실 3명. 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';

function seededEnv(opts) {
  const env = createGasEnv({ owner: ADMIN, now: '2027-03-09T15:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = 'test.teacher@example.com';
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  if (!(opts && opts.noStage1)) env.asOwner((c) => c.seedFakeStage1());
  env.strictLock = true;
  return env;
}
const tabs = ['blocks', 'day_schedules', 'students', 'enrollments', 'status_changes'];
const counts = (env) => tabs.map((t) => env.rows(t).length);

test('seedFakeStage4: 휴일 블록 5·휴일 2일·시험 기간 5일·추가 입실 3명(학생·등록·상태 행), 두 번 실행해도 +0', () => {
  const env = seededEnv();
  const before = counts(env);
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage4()), '가짜 4단계 데이터: blocks +5, day_schedules +7, students +3, enrollments +3, status_changes +8');
  const first = tabs.map((t) => JSON.stringify(env.rows(t)));
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage4()), '가짜 4단계 데이터: blocks +0, day_schedules +0, students +0, enrollments +0, status_changes +0');
  assert.deepStrictEqual(tabs.map((t) => JSON.stringify(env.rows(t))), first, '두 번째 실행 뒤 그대로');
  assert.deepStrictEqual(counts(env), before.map((n, i) => n + [5, 7, 3, 3, 8][i]));

  const days = env.rows('day_schedules');
  assert.deepStrictEqual(days.filter((d) => d.day_type === 'holiday').map((d) => [d.date, d.start, d.end]), [['2027-05-05', '09:00', '21:50'], ['2027-06-03', '09:00', '21:50']]);
  assert.deepStrictEqual(days.filter((d) => d.memo === '가짜: 시험 기간').map((d) => d.date), ['2027-04-19', '2027-04-20', '2027-04-21', '2027-04-22', '2027-04-23']);
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const extra = env.rows('students').filter((s) => s.memo === '가짜 데이터(4단계 추가 입실)');
  assert.strictEqual(extra.length, 3);
  assert.strictEqual(new Set(env.rows('students').map((s) => s.student_no)).size, env.rows('students').length, '학번 겹침 없음');
  extra.forEach((s) => {
    assert.ok(env.rows('enrollments').some((e) => e.student_id === s.id && e.term_id === term.id), s.name + ' 이번 기간 등록');
    const ch = env.rows('status_changes').filter((c) => c.student_id === s.id);
    assert.ok(ch.length >= 2 && ch.every((c) => c.effective_date === '2027-04-01' && c.source === '명단업로드'), s.name + ' 4/1 입실 행');
  });
  assert.strictEqual(env.rows('status_changes').filter((c) => extra.some((s) => s.id === c.student_id) && c.item === '기숙사').length, 1, '기숙사생 1명');
});

test('seedFakeStage4 뒤 출석부: 휴일은 휴일 블록 5칸, 시험 기간은 운영, 추가 입실 학생은 3/31에는 없고 4/1부터 미배정으로', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage4());
  const sheet = (d) => { env.setNow(d + 'T15:00:00'); return plain(env.call(ADMIN, 'getAttendanceSheet', d, true)); };
  const hol = sheet('2027-05-05');
  assert.strictEqual(hol.ok && hol.operating, true, JSON.stringify(hol).slice(0, 200));
  assert.deepStrictEqual(hol.blockLabels, ['09–12', '14–15:30', '15:30–17', '19–20:30', '20:30–21:50']);
  const exam = sheet('2027-04-20');
  assert.strictEqual(exam.ok && exam.operating, true);
  const names = ['가추가', '나추가', '다추가'];
  const before = JSON.stringify(sheet('2027-03-31')), after = sheet('2027-04-01');
  names.forEach((n) => assert.ok(!before.includes(n), n + ' 3/31 없음'));
  names.forEach((n) => assert.ok(JSON.stringify(after).includes(n), n + ' 4/1 있음'));
  assert.strictEqual(after.unseatedCount, 4, '3/15 중도 입실 1 + 추가 입실 3(자리 미배정)');
});

test('seedFakeStage4: 1단계가 없거나·가짜가 아닌 학생이 있거나·그날 다른 일정이 있으면 쓰지 않는다, 뒤에는 1~3단계 시드가 다시 돌지 않는다', () => {
  const env0 = seededEnv({ noStage1: true });
  assert.ok(/seedFakeStage1/.test(env0.errorOf(ADMIN, (c) => c.seedFakeStage4()).message));

  const env1 = seededEnv();
  env1.as(ADMIN, (c) => c.appendRecord_('day_schedules', { date: '2027-05-05', operating: 'FALSE', start: '', end: '', day_type: '', memo: '관리자', status: '유효' }, ADMIN));
  const n = counts(env1);
  assert.ok(/다른 일정 1개/.test(env1.errorOf(ADMIN, (c) => c.seedFakeStage4()).message));
  assert.deepStrictEqual(counts(env1), n, '쓰기 없음');

  const env2 = seededEnv();
  env2.as(ADMIN, (c) => c.appendRecord_('students', { name: '진짜', memo: '' }, ADMIN));
  assert.ok(/가짜 학생/.test(env2.errorOf(ADMIN, (c) => c.seedFakeStage4()).message));

  const env3 = seededEnv();
  env3.asOwner((c) => c.seedFakeStage4());
  assert.ok(/가짜 학생/.test(env3.errorOf(ADMIN, (c) => c.seedFakeStage1()).message), '추가 입실 뒤 1단계 시드는 거부(학생 수 기반 시드가 어긋나지 않게)');
});
