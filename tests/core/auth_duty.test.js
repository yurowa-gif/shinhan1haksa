/** C8s 근무교사 범위: R4 gas-fakes 환경에서 requirePermission_('out.save')와 열람 키를 직접 부른다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const T1 = 'test.teacher@example.com', T2 = 'fake.t2@example.com', T3 = 'fake.t3@example.com', T4 = 'fake.t4@example.com', ATT = 'test.attendance@example.com',
  ADMIN = 'test.admin@example.com';
const TODAY = '2027-03-03', YESTERDAY = '2027-03-02', TWO_AGO = '2027-03-01';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  const acc = env.seedFake({ stage1: true });
  env.asOwner((c) => [T2, T3, T4].forEach((e, i) => c.addUser(e, '가짜교사' + (i + 2), 'hall_teacher')));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const notMine = env.rows('students').find((s) => enr.some((e) => e.student_id === s.id && e.teacher_email !== T1));   // T1이 담당이 아닌 등록 학생
  const mine = env.rows('students').find((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  const duty = (date, slot, original, actual, extra) => env.asOwner((c) => c.appendRecord_('duty_slots', Object.assign({
    date, slot, end_time: slot === '23:00조' ? '23:00' : '21:30', original_email: original, actual_email: actual === undefined ? original : actual,
    swapped_at: '', swapped_by: '', status: '유효', memo: '' }, extra || {}), ADMIN));
  // 권한 판정만 본다: requirePermission_의 예외 여부
  const check = (who, key, ctx) => env.errorOf(who, (c) => c.requirePermission_(key, ctx));
  return { env, acc, notMine, mine, duty, check, unenrolled: acc.unenrolledStudentId };
}
const denied = (x, who, key, ctx) => { const e = x.check(who, key, ctx); assert.ok(e && /권한이 없습니다/.test(e.message), who + ' ' + key + ' ' + JSON.stringify(ctx) + ' 가 거부되어야 한다'); };
const allowed = (x, who, key, ctx) => assert.strictEqual(x.check(who, key, ctx), null, who + ' ' + key + ' ' + JSON.stringify(ctx) + ' 가 허용되어야 한다');

test('out.save: 발생일(ymd)의 실제 근무자는 담당이 아닌 등록 학생도 통과 — 오늘 근무자는 오늘 사건, 어제 근무자는 어제 사건(다음 날까지)', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2); x.duty(YESTERDAY, '23:00조', T3);
  allowed(x, T2, 'out.save', { studentId: x.notMine.id, ymd: TODAY });
  allowed(x, T3, 'out.save', { studentId: x.notMine.id, ymd: YESTERDAY });
  allowed(x, T1, 'out.save', { studentId: x.mine.id, ymd: TWO_AGO }, '담당교사는 날짜와 상관없이');
});

test('out.save 거부: 어제 근무자가 오늘 사건, 오늘 근무자가 어제 사건, 이틀 이상 지난 근무일 + denied:out.save 기록', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2); x.duty(YESTERDAY, '23:00조', T3); x.duty(TWO_AGO, '21:30조', T4);
  const before = x.env.auditActions('denied:out.save').length;
  denied(x, T3, 'out.save', { studentId: x.notMine.id, ymd: TODAY });       // 어제 근무자가 오늘(근무 아님) 사건
  denied(x, T2, 'out.save', { studentId: x.notMine.id, ymd: YESTERDAY });   // 오늘 근무자가 어제(근무 아님) 사건
  denied(x, T4, 'out.save', { studentId: x.notMine.id, ymd: TWO_AGO });     // 근무일은 맞지만 이틀 지남(창 밖)
  assert.strictEqual(x.env.auditActions('denied:out.save').length, before + 3);
  denied(x, T2, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-04' }, '미래 날짜는 아직 근무가 아니다');
});

test('근무교사 범위 거부: 미등록 학생·예비 지정만·교대로 넘긴 원래 근무자·근무표가 없는 교사', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2);
  x.duty(TODAY, '23:00조', T3, T4);                  // T3 → T4로 교대: 실제 근무자는 T4
  x.duty(YESTERDAY, '예비', T1);                     // 예비 지정만(근무 아님)
  allowed(x, T2, 'out.save', { studentId: x.notMine.id, ymd: TODAY });
  allowed(x, T4, 'out.save', { studentId: x.notMine.id, ymd: TODAY });
  denied(x, T2, 'out.save', { studentId: x.unenrolled, ymd: TODAY });         // 근무자여도 이번 기간 등록이 아니면 거부(찾은 것 1)
  denied(x, T3, 'out.save', { studentId: x.notMine.id, ymd: TODAY });         // 교대로 넘긴 원래 근무자
  denied(x, T1, 'out.save', { studentId: x.notMine.id, ymd: YESTERDAY });     // 예비 지정만
  const x2 = makeEnv();                                                       // 근무표가 비어 있다
  denied(x2, T2, 'out.save', { studentId: x2.notMine.id, ymd: TODAY });
});

test('취소된 근무 칸은 근무가 아니다, 근무교사여도 역할이 hall_teacher가 아니면 거부(출결 담당)', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2, undefined, { status: '취소' });
  denied(x, T2, 'out.save', { studentId: x.notMine.id, ymd: TODAY });
  x.duty(TODAY, '23:00조', ATT);
  denied(x, ATT, 'out.save', { studentId: x.notMine.id, ymd: TODAY });
});

test('duty_slots를 읽지 못해도(탭이 없어도) 오류 없이 거부한다', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2);
  const e = x.env.errorOf(T2, (c) => {
    const read = c.readAll_;
    c.readAll_ = (name, kind) => { if (name === 'duty_slots') throw new Error('시트가 없습니다: duty_slots'); return read(name, kind); };
    return c.requirePermission_('out.save', { studentId: x.notMine.id, ymd: TODAY });
  });
  assert.ok(e && /권한이 없습니다/.test(e.message), '권한 오류로 거부(탭 오류가 새지 않는다)');
});

test('열람·쓰기 키는 그대로: 근무 교사의 student.view는 넓은 보기(C8v) 때문에 통과, status.edit·exception.save·counsel.save는 근무일이어도 담당이 아니면 거부', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2);
  allowed(x, T2, 'student.view', { studentId: x.notMine.id });
  denied(x, T2, 'student.view', { studentId: x.unenrolled });
  for (const key of ['status.edit', 'exception.save', 'counsel.save']) denied(x, T2, key, { studentId: x.notMine.id });
  allowed(x, ADMIN, 'out.save', { studentId: x.notMine.id, ymd: TWO_AGO });
});

test('dutyWindow가 없으면 창은 0 — 어제 근무자는 ymd = 어제여도 통과하지 못하고, 창 1이면 통과한다(studentFacts_)', () => {
  const x = makeEnv();
  x.duty(YESTERDAY, '23:00조', T3); x.duty(TODAY, '21:30조', T2);
  const on = (who, ymd, win) => x.env.as(who, (c) => c.studentFacts_(c.getCurrentUser_(), c.findById_('students', x.notMine.id), ymd, win).isOnDuty);
  assert.strictEqual(on(T3, YESTERDAY, undefined), false, '창 0: 어제 근무자가 어제 날짜로 열람해도 오늘 근무자가 아니다');
  assert.strictEqual(on(T3, YESTERDAY, 1), true, '창 1(out.save)');
  assert.strictEqual(on(T2, '', undefined), true, 'ymd가 없으면 오늘의 실제 근무자');
  assert.strictEqual(on(T2, TODAY, 0), true);
  assert.strictEqual(on(T2, YESTERDAY, 1), false, '오늘 근무자는 어제 근무가 아니다');
});
