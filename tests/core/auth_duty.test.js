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
const denied = (x, who, key, ctx, msg) => { const e = x.check(who, key, ctx); assert.ok(e && /권한이 없습니다/.test(e.message), (msg ? msg + ': ' : '') + who + ' ' + key + ' ' + JSON.stringify(ctx) + ' 가 거부되어야 한다'); };
const allowed = (x, who, key, ctx, msg) => assert.strictEqual(x.check(who, key, ctx), null, (msg ? msg + ': ' : '') + who + ' ' + key + ' ' + JSON.stringify(ctx) + ' 가 허용되어야 한다');

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
  x.duty('2027-03-04', '21:30조', T2);    // 내일 근무 칸이 있어도 오늘은 아직 그 날의 근무가 아니다(ymd = 내일)
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
  for (const key of ['status.edit', 'exception.save', 'counsel.save', 'counsel.view']) denied(x, T2, key, { studentId: x.notMine.id });
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

test('주말 칸: 단독 근무자는 허용, 예비 지정만은 거부, 예비가 단독을 대신 맡으면(실제 근무자) 허용되고 원래 단독 근무자는 거부', () => {
  const x = makeEnv();
  x.env.setNow('2027-03-06T20:00:00');   // 토요일
  x.duty('2027-03-06', '단독', T2); x.duty('2027-03-06', '예비', T3);
  allowed(x, T2, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-06' }, '단독 근무자');
  denied(x, T3, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-06' }, '예비 지정만');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', x.env.rows('duty_slots').find((r) => r.slot === '단독').id, { actual_email: T3 }, ADMIN));   // 예비가 대신 근무
  allowed(x, T3, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-06' }, '대신 근무한 예비');
  denied(x, T2, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-06' }, '넘긴 원래 단독 근무자');
});

test('자정 경계: 3/3 23:59:59에는 오늘 근무자(창 0), 3/4 00:00:01에는 창 0은 거짓·out.save(창 1)는 다음 날이라 허용, 3/5 00:00:01에는 out.save도 거부', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2);
  const win0 = (who) => x.env.as(who, (c) => c.studentFacts_(c.getCurrentUser_(), c.findById_('students', x.notMine.id), TODAY, 0).isOnDuty);
  x.env.setNow('2027-03-03T23:59:59');
  assert.strictEqual(win0(T2), true); allowed(x, T2, 'out.save', { studentId: x.notMine.id, ymd: TODAY });
  x.env.setNow('2027-03-04T00:00:01');
  assert.strictEqual(win0(T2), false, '열람 키(창 0)는 자정이 지나면 끝');
  allowed(x, T2, 'out.save', { studentId: x.notMine.id, ymd: TODAY }, '다음 날까지');
  x.env.setNow('2027-03-05T00:00:01');
  denied(x, T2, 'out.save', { studentId: x.notMine.id, ymd: TODAY }, '이틀 뒤');
});

test('한 실행 안에서 창 0과 창 1 호출을 섞어도 서로 영향이 없다(캐시 키)', () => {
  const x = makeEnv();
  x.duty(YESTERDAY, '23:00조', T3);
  const seq = x.env.as(T3, (c) => {
    const u = c.getCurrentUser_(), st = c.findById_('students', x.notMine.id);
    return [0, 1, 0, 1].map((w) => c.studentFacts_(u, st, YESTERDAY, w).isOnDuty);
  });
  assert.deepStrictEqual(Array.from(seq), [false, true, false, true]);
});

test('noDuty 키(counsel.view 등)는 근무표를 읽지 않는다', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2);
  const reads = x.env.as(T2, (c) => {
    let n = 0; const read = c.readAll_;
    c.readAll_ = (name, kind) => { if (name === 'duty_slots') n++; return read(name, kind); };
    try { c.requirePermission_('counsel.view', { studentId: x.notMine.id }); } catch (e) { /* 거부 */ }
    return n;
  });
  assert.strictEqual(reads, 0);
});

test('근무교사 목록엔 있고 요청 고르기엔 없다: 실제 근무 행이 있는 근무교사는 담당이 아닌 학생의 특이사항을 목록에서 보지만 입력 화면 학생 선택에는 담당 학생만', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T1);
  const saved = x.env.call(ATT, 'saveException', { studentId: x.notMine.id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  assert.strictEqual(saved.ok, true, JSON.stringify(saved));
  const list = x.env.call(T1, 'listExceptions', { scope: 'range', from: '2027-03-12', to: '2027-03-12' });
  assert.ok(list.groups.some((g) => g.studentId === x.notMine.id), '목록에는 담당 아닌 학생도');
  const ctxStudents = x.env.call(T1, 'getExceptionContext').students.map((s) => s.id);
  assert.ok(!ctxStudents.includes(x.notMine.id) && ctxStudents.length > 0, '요청 고르기에는 담당 학생만');
});

test('미래 날짜는 날짜 때문에 거부된다(엉뚱한 이유가 아니다): 같은 칸이 그 날이 되면 허용, 어제가 되면 창 1 안이라 허용, 이틀 뒤에는 거부', () => {
  const x = makeEnv();
  x.duty('2027-03-04', '21:30조', T2);
  denied(x, T2, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-04' }, '3/3에는 아직 미래');
  x.env.setNow('2027-03-04T10:00:00');
  allowed(x, T2, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-04' }, '그 날이 되면 같은 칸·같은 학생이 허용(거부 이유는 날짜뿐)');
  x.env.setNow('2027-03-05T10:00:00');
  allowed(x, T2, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-04' }, '다음 날 아침까지(창 1)');
  x.env.setNow('2027-03-06T10:00:00');
  denied(x, T2, 'out.save', { studentId: x.notMine.id, ymd: '2027-03-04' }, '이틀 뒤는 창 밖');
});

test('근무표 읽기 오류(탭 없음이 아닌 것)는 거부하되 console.warn으로 남고, 탭 없음은 조용하다', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2);
  const run = (message) => {
    const warns = [];
    const e = x.env.errorOf(T2, (c) => {
      const read = c.readAll_, warn = c.console && c.console.warn;
      c.console = { warn: (m) => warns.push(String(m)), error() {}, log() {} };
      c.readAll_ = (name, kind) => { if (name === 'duty_slots') throw new Error(message); return read(name, kind); };
      try { return c.requirePermission_('out.save', { studentId: x.notMine.id, ymd: TODAY }); } finally { void warn; }
    });
    return { e, warns };
  };
  const odd = run('스프레드시트 오류(가짜)');
  assert.ok(odd.e && /권한이 없습니다/.test(odd.e.message));
  assert.ok(odd.warns.some((w) => w.includes('근무표를 읽지 못해')), JSON.stringify(odd.warns));
  const missing = run('탭이 없습니다: duty_slots (setup()을 다시 실행하세요)');
  assert.ok(missing.e && /권한이 없습니다/.test(missing.e.message));
  assert.ok(!missing.warns.some((w) => w.includes('근무표를 읽지 못해')), '탭 없음은 조용히 거짓');
});
