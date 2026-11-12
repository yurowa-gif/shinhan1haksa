/** C9 근무 교대·대신 근무 + 알림: R4 gas-fakes. 메일은 실행 안에서 MailApp을 바꿔 끼운다. 가짜 데이터만. */
const assert = require('assert');
const { test, plain, loadGs } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com',
  T1 = 'test.teacher@example.com', T2 = 'fake.t2@example.com', T3 = 'fake.t3@example.com', T4 = 'fake.t4@example.com', HOMEROOM = 'test.homeroom@example.com',
  STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03', YESTERDAY = '2027-03-02', TOMORROW = '2027-03-04', FRI = '2027-03-05';
// 메일 함수는 @example.com을 늘 빼므로, 받는 사람을 확인하는 시험은 실제처럼 보이는 가짜 주소(.invalid)의 계정을 따로 만든다
const R1 = 'fake.r1@fakeschool.invalid', R2 = 'fake.r2@fakeschool.invalid', R3 = 'fake.r3@fakeschool.invalid', RM = 'fake.rm@fakeschool.invalid';

function makeEnv(opts) {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => {
    c.addUser(T2, '가짜교사2', 'hall_teacher'); c.addUser(T3, '가짜교사3', 'hall_teacher'); c.addUser(T4, '가짜교사4', 'hall_teacher');
    c.addUser(R1, '실가짜1', 'hall_teacher'); c.addUser(R2, '실가짜2', 'hall_teacher'); c.addUser(R3, '실가짜3', 'hall_teacher'); c.addUser(RM, '실가짜담당', 'duty_manager');
  });
  const users = () => env.rows('users');
  const id = (email) => users().find((u) => u.email === email).id;
  const slot = (date, slotName, original, actual, extra) => env.asOwner((c) => c.appendRecord_('duty_slots', Object.assign({
    date, slot: slotName, end_time: slotName === '23:00조' ? '23:00' : (slotName === '21:30조' ? '21:30' : ''), original_email: original,
    actual_email: actual === undefined ? original : actual, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, extra || {}), ADMIN));
  const rows = () => env.rows('duty_slots');
  if (!opts || opts.mail !== false) env.scriptProps.MAIL_ENABLED = 'true';
  return { env, id, slot, rows, t2: id(T2), t3: id(T3), t4: id(T4), r1: id(R1), r2: id(R2), r3: id(R3) };
}
/** MailApp을 바꿔 끼워 swapDuty를 부른다 → {r, sent:[to], locks:[보낼 때 락 보유]} */
function swap(x, who, slotId, toId, o, mailOpts) {
  mailOpts = mailOpts || {};
  const sent = [], locks = [];
  const r = plain(x.env.as(who, (c) => {
    c.MailApp = { sendEmail(to, subject, body) { locks.push(c.LockService.getScriptLock().hasLock()); if (mailOpts.fail) throw new Error('발송 실패(가짜)'); sent.push({ to, subject, body }); },
      getRemainingDailyQuota: () => 100 };
    return c.swapDuty(slotId, toId, o);
  }));
  return { r, sent, locks };
}
const expectDenied = (x, who, slotId, toId, msg) => {
  const w = JSON.stringify(x.rows());
  const e = x.env.errorOf(who, (c) => c.swapDuty(slotId, toId));
  assert.ok(e && /권한이 없습니다/.test(e.message), (msg || '') + ' 거부되어야 한다');
  // 같은 사람·같은 기능의 거부 기록은 10분에 한 번만 남는다(logDenied_) — 그 사람의 기록이 있는지 본다
  assert.ok(x.env.rows('audit_log').some((a) => a.action === 'denied:duty.swap' && a.created_by === who), (msg || '') + ' denied:duty.swap 기록');
  assert.strictEqual(JSON.stringify(x.rows()), w, (msg || '') + ' 쓰기 0건');
};

/* ───── 순수 판정 dtySwapCheck_ ───── */
const pure = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/DutyRules.gs', 'src/features/Schedule.gs', 'src/features/Duty.gs']);
const chk = (ctx, row, to) => plain(pure.dtySwapCheck_(Object.assign({ today: TODAY, canEdit: false, email: 'a@x' }, ctx), Object.assign({ date: TODAY, slot: '21:30조', original_email: 'a@x', actual_email: 'a@x' }, row), to || 'b@x'));

test('dtySwapCheck_ 표: 본인 칸(오늘 이후)·담당자 대리 기록만 허용, 남의 칸·지난 날·예비 칸(학사 교사)·같은 사람은 거부', () => {
  assert.strictEqual(chk({}, {}).ok, true, '본인 칸 오늘');
  assert.strictEqual(chk({}, { date: TOMORROW }).ok, true, '본인 칸 내일');
  assert.strictEqual(chk({}, { actual_email: 'z@x' }).denied, true, '남의 칸');
  assert.strictEqual(chk({}, { original_email: 'a@x', actual_email: 'z@x' }).denied, true, '원래 근무자였어도 이미 넘겼으면 남의 칸');
  assert.strictEqual(chk({}, { date: YESTERDAY }).denied, true, '학사 교사는 지난 날짜 불가');
  assert.strictEqual(chk({}, { slot: '예비' }).denied, true, '예비 감독 본인은 열지 않는다');
  assert.strictEqual(chk({ canEdit: true, email: 'm@x' }, { date: YESTERDAY, actual_email: 'z@x' }).ok, true, '담당자: 남의 칸·지난 날짜 가능');
  assert.strictEqual(chk({ canEdit: true, email: 'm@x' }, { slot: '예비', actual_email: 'z@x' }).ok, true);
  assert.deepStrictEqual([chk({}, {}, 'a@x').ok, chk({}, {}, 'a@x').denied], [false, undefined], '지금 근무자와 같은 사람은 입력 오류(거부 기록 아님)');
  assert.strictEqual(chk({}, { status: '취소' }).denied, true, '취소된 칸');
});

/* ───── swapDuty ───── */
test('본인 칸 교대: 실제 근무자·교대 일시·교대한 사람이 바뀌고(원래 근무자는 그대로), audit update에 전후 값이 남고, 메일은 락 밖에서 이전·새 근무자와 담당자에게(누른 사람은 빼고)', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1);
  const row = x.rows()[0];
  const { r, sent, locks } = swap(x, R1, row.id, x.r2);
  assert.deepStrictEqual([r.ok, r.changed, r.notified], [true, true, true]);
  const after = x.rows()[0];
  assert.deepStrictEqual([after.original_email, after.actual_email, after.swapped_by], [R1, R2, R1]);
  assert.ok(/^2027-03-03T/.test(after.swapped_at));
  const au = x.env.rows('audit_log').filter((a) => a.action === 'update' && a.sheet === 'duty_slots' && a.row_id === row.id);
  assert.strictEqual(au.length, 1);
  assert.ok(JSON.stringify(au[0]).includes(R1) && JSON.stringify(au[0]).includes(R2), 'audit에 전후 actual_email');
  assert.deepStrictEqual(locks, sent.map(() => false), '메일은 락 밖에서');
  assert.deepStrictEqual(sent.map((m) => m.to).sort(), [R2, RM].sort(), '이전 근무자(누른 사람)는 빠지고 새 근무자·활성 근무표 담당자');
  assert.ok(sent.every((m) => m.body.includes('3월 4일(목)') && m.body.includes('21:30조') && m.body.includes('실가짜1') && m.body.includes('실가짜2') && !/학생/.test(m.body)), sent[0].body);
});

test('받는 사람: 근무표 담당자가 없으면 관리자, 담당자가 교대를 눌렀으면 그 사람은 빠진다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '23:00조', R1);
  x.env.asOwner((c) => c.addUser('fake.radmin@fakeschool.invalid', '실가짜관리', 'admin'));
  // 담당자(RM)가 대신 근무 기록: 받는 사람 = 이전(R1)·새(R2)·(담당자 RM은 누른 사람이라 빠짐)
  const row = x.rows()[0];
  const { r, sent } = swap(x, RM, row.id, x.r2);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(sent.map((m) => m.to).sort(), [R1, R2].sort());
  // 활성 근무표 담당자가 아무도 없으면 관리자에게
  const y = makeEnv();
  y.slot(TOMORROW, '23:00조', R1);
  y.env.asOwner((c) => {
    y.env.rows('users').filter((u) => /duty_manager/.test(u.roles)).forEach((u) => c.updateRecord_('users', u.id, { active: 'FALSE' }, ADMIN));   // 시드의 담당자 계정까지 모두 비활성
    c.addUser('fake.radmin@fakeschool.invalid', '실가짜관리', 'admin');
  });
  const o = swap(y, R1, y.rows()[0].id, y.r2);
  assert.ok(o.sent.some((m) => m.to === 'fake.radmin@fakeschool.invalid'), '담당자가 없으면 관리자');
});

test('메일을 못 보내도(꺼짐·발송 오류) 교대는 저장되어 있고 notified:false — 화면이 "직접 알려 주세요"를 보인다', () => {
  const x = makeEnv({ mail: false });   // MAIL_ENABLED 꺼짐
  x.slot(TOMORROW, '21:30조', R1);
  const a = swap(x, R1, x.rows()[0].id, x.r2);
  assert.deepStrictEqual([a.r.ok, a.r.notified, a.sent.length], [true, false, 0]);
  assert.strictEqual(x.rows()[0].actual_email, R2);
  const y = makeEnv();
  y.slot(TOMORROW, '21:30조', R1);
  const b = swap(y, R1, y.rows()[0].id, y.r2, undefined, { fail: true });
  assert.deepStrictEqual([b.r.ok, b.r.notified], [true, false]);
  assert.strictEqual(y.rows()[0].actual_email, R2, 'sendEmail 오류에도 교대는 저장');
});

test('거부: 남의 칸·이미 넘긴 원래 근무자·지난 날짜의 본인 칸·예비 감독 칸·취소된 칸·없는 칸 — 학사 교사, denied:duty.swap 기록과 쓰기 0건', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1);            // 다른 사람 칸
  x.slot(TOMORROW, '23:00조', R2, R3);        // R2가 R3에게 넘김(원래 근무자 R2)
  x.slot(YESTERDAY, '21:30조', R1);           // 지난 날짜의 본인 칸
  x.slot(FRI, '단독', R2); x.slot(FRI, '예비', R1);   // 예비 감독 본인
  x.slot(FRI, '23:00조', R1, undefined, { status: '취소' });
  const [a, b, c, d, e] = x.rows();
  expectDenied(x, R2, a.id, x.r3, '남의 칸');
  expectDenied(x, R2, b.id, x.r1, '이미 넘긴 원래 근무자');
  expectDenied(x, R1, c.id, x.r2, '지난 날짜의 본인 칸');
  expectDenied(x, R1, e.id, x.r2, '예비 감독 본인');
  // 취소된 칸·없는 칸은 denied가 아니라 '바뀌었습니다' 오류(아래 별도 테스트)
  for (const who of [HOMEROOM, STUDENT, PARENT, ATT]) {
    const err = x.env.errorOf(who, (cc) => cc.swapDuty(a.id, x.r2));
    assert.ok(err && /권한이 없습니다/.test(err.message), who);
  }
});

test('학사 교사가 남의 칸(특히 어제)에 자기를 넣는 길은 없다: 거부되고, 그 교사의 어제 out.save는 계속 거부', () => {
  const x = makeEnv();
  x.slot(YESTERDAY, '21:30조', R1); x.slot(TOMORROW, '21:30조', R1);
  const [yest, tom] = x.rows();
  expectDenied(x, R2, yest.id, x.r2, '남의 어제 칸에 자기를 넣기');
  expectDenied(x, R2, tom.id, x.r2, '남의 칸에 자기를 넣기');
  const stu = x.env.rows('students')[0];
  const e = x.env.errorOf(R2, (c) => c.requirePermission_('out.save', { studentId: stu.id, ymd: YESTERDAY }));
  assert.ok(e && /권한이 없습니다/.test(e.message), '어제 근무자가 아닌 R2는 어제 OUT을 못 넣는다');
});

test('담당자(근무표 담당자·관리자)는 지난 날짜·남의 칸·예비 칸도 대신 근무로 기록(사실 기록, audit)하고, 담당자 본인을 실제 근무자로 넣을 수도 있다', () => {
  const x = makeEnv();
  x.slot(YESTERDAY, '21:30조', R1);
  const row = x.rows()[0];
  const { r } = swap(x, RM, row.id, x.r2, { reason: '병가 대신 근무' });
  assert.deepStrictEqual([r.ok, r.changed], [true, true]);
  const after = x.rows()[0];
  assert.deepStrictEqual([after.original_email, after.actual_email, after.swapped_by, after.memo], [R1, R2, RM, '병가 대신 근무']);
  assert.strictEqual(swap(x, ADMIN, row.id, x.r3).r.ok, true, '관리자도 가능');
  assert.strictEqual(x.rows()[0].actual_email, R3);
  // 예비 감독이 대신 근무: 근무 칸 실제 근무자를 예비 교사로
  x.slot(FRI, '단독', R1); x.slot(FRI, '예비', R2);
  const [, sole, stand] = x.rows();
  const o = swap(x, RM, sole.id, x.r2);
  assert.strictEqual(o.r.ok, true, '예비 교사가 대신 근무해도 같은 날 예비 칸 경고는 없다');
  assert.strictEqual(x.env.call(ADMIN, 'getDutyMonth', '2027-03').days.find((d) => d.date === FRI).slots[0].name, '실가짜2');
  assert.ok(stand.id);
});

test('대상 검사: 활성 학사 교사만(비활성·학사 교사 아님·없는 id 거부), 지금 근무자와 같으면 입력 오류, 같은 날 다른 칸에 있으면 확인 후 저장', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1); x.slot(TOMORROW, '23:00조', R2);
  const [a] = x.rows();
  const w = JSON.stringify(x.rows());
  const adminId = x.id(ADMIN);
  for (const to of ['no-such', adminId, x.id(R1)]) {
    const r = swap(x, R1, a.id, to).r;
    assert.strictEqual(r.ok, false, String(to)); assert.ok(r.errors && r.errors[0].field === 'to', JSON.stringify(r));
  }
  x.env.asOwner((c) => c.updateRecord_('users', x.r3, { active: 'FALSE' }, ADMIN));
  assert.strictEqual(swap(x, R1, a.id, x.r3).r.ok, false, '비활성 교사');
  assert.strictEqual(JSON.stringify(x.rows()), w);
  const warn = swap(x, R1, a.id, x.r2).r;       // R2는 같은 날 23:00조에 있다
  assert.deepStrictEqual([warn.ok, warn.needsConfirm], [false, true]); assert.ok(warn.warnings[0].includes('이미 23:00조에 편성'), warn.warnings[0]);
  assert.strictEqual(JSON.stringify(x.rows()), w, '경고 응답은 쓰지 않는다');
  assert.strictEqual(swap(x, R1, a.id, x.r2, { acknowledge: true }).r.ok, true);
});

test('락: 바깥 락을 못 잡으면 "다른 사람이 저장 중" 오류·쓰기 0건·메일 0통, 락 안에서 다시 읽어 그 사이 바뀐 칸은 다시 검사한다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1);
  const row = x.rows()[0], w = JSON.stringify(x.rows());
  x.env.lock.failNext = 1;
  assert.throws(() => swap(x, R1, row.id, x.r2), /다른 사람이 저장 중/);
  assert.strictEqual(JSON.stringify(x.rows()), w);
  // 첫 사람이 R1 칸을 R2에게 넘긴 뒤, 같은 칸을 R1이 다시 넘기려 하면(이제 R2 칸) 거부
  assert.strictEqual(swap(x, R1, row.id, x.r2).r.ok, true);
  expectDenied(x, R1, row.id, x.r3, '넘긴 뒤 같은 칸');
});

test('운영 안 하는 날의 칸은 교대할 수 없다(입력 오류), 같은 사람에게 되돌리면(원래 근무자) 교대 표시가 없어진다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1);
  const row = x.rows()[0];
  x.env.call(DUTY, 'setDutyOperating', { date: TOMORROW, operating: false, confirmIds: x.env.call(DUTY, 'setDutyOperating', { date: TOMORROW, operating: false }).confirmIds });
  assert.strictEqual(x.rows()[0].status, '취소', '운영 안 함으로 바꾸면 그날 칸은 취소된다(결정 54)');
  const err = x.env.errorOf(R1, (c) => c.swapDuty(row.id, x.r2));
  assert.ok(err && /바뀌었습니다/.test(err.message), '취소된 칸은 낡은 화면 오류');
  const y = makeEnv();
  y.slot(TOMORROW, '21:30조', R1);
  const r0 = y.rows()[0];
  swap(y, R1, r0.id, y.r2);
  swap(y, RM, r0.id, y.r1);               // 담당자가 원래 근무자로 되돌림
  const d = y.env.call(ADMIN, 'getDutyMonth', '2027-03').days.find((q) => q.date === TOMORROW).slots[0];
  assert.deepStrictEqual([d.name, d.swapped], ['실가짜1', false]);
});

test('getDutyMonth: 칸마다 slotId·canSwap — 학사 교사는 오늘 이후 본인 근무 칸만, 담당자·관리자는 근무 칸(예비 제외)이면 지난 날짜도, 보기만 하는 출결 담당은 없음', () => {
  const x = makeEnv();
  x.slot(YESTERDAY, '21:30조', R1); x.slot(TOMORROW, '21:30조', R1); x.slot(TOMORROW, '23:00조', R2); x.slot(FRI, '단독', R1); x.slot(FRI, '예비', R2);
  const days = (who) => x.env.call(who, 'getDutyMonth', '2027-03').days;
  const flags = (who, date) => days(who).find((d) => d.date === date).slots.map((s) => s.canSwap);
  assert.deepStrictEqual([flags(R1, YESTERDAY), flags(R1, TOMORROW), flags(R1, FRI)], [[false, false], [true, false], [true, false]]);
  assert.deepStrictEqual([flags(R2, TOMORROW), flags(R2, FRI)], [[false, true], [false, false]], '본인 근무 칸(23:00조)만 버튼, 예비 감독 본인 칸은 없다');
  assert.deepStrictEqual([flags(RM, YESTERDAY), flags(RM, TOMORROW), flags(RM, FRI)], [[true, false], [true, true], [true, false]]);
  assert.deepStrictEqual(flags(ATT, TOMORROW), [false, false]);
  assert.ok(days(R1).find((d) => d.date === TOMORROW).slots[0].slotId, 'slotId는 교대 호출에 쓴다');
  assert.ok(!JSON.stringify(days(R1)).includes('@'), '응답에 이메일 없음');
});

test('swapDuty는 공개 함수 권한표에 duty.swap으로 등록되어 있고 첫 줄이 requirePermission_이다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1);
  for (const who of [STUDENT, PARENT, HOMEROOM]) x.env.expectDenied(who, 'duty.swap', 'swapDuty', x.rows()[0].id, x.r2);
  x.env.expectAllowed(R1, 'swapDuty', x.rows()[0].id, x.r2);
});

/* ───── #81 검토 반영 ───── */
test('같은 (날짜, 칸)에 살아 있는 행이 둘이면 R8이 쓰는 최신 행만 교대할 수 있다 — 옛 행 id로 남의 근무를 빼앗고 out.save를 얻는 길이 없다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R2);          // 옛 행(손으로 고친 시트 등으로 남은 중복)
  x.slot(TOMORROW, '21:30조', R1);          // 새 행: R8은 아래 행(= 지금 근무자 R1)을 쓴다
  const [oldRow, newRow] = x.rows();
  const w = JSON.stringify(x.rows());
  const e = x.env.errorOf(R2, (c) => c.swapDuty(oldRow.id, x.r3));
  assert.ok(e && /바뀌었습니다/.test(e.message), '낡은 행은 "근무표가 바뀌었습니다" 오류: ' + (e && e.message));
  assert.strictEqual(JSON.stringify(x.rows()), w, '쓰기 0건');
  // R2는 그 날 근무자가 아니므로 out.save도 계속 거부
  const stu = x.env.rows('students')[0].id;
  const denied = x.env.errorOf(R2, (c) => c.requirePermission_('out.save', { studentId: stu, ymd: TOMORROW }));
  assert.ok(denied && /권한이 없습니다/.test(denied.message));
  // 진짜 근무자(R1)는 새 행 id로 교대할 수 있다
  assert.strictEqual(swap(x, R1, newRow.id, x.r3).r.ok, true);
});

test('취소된 칸·없는 칸·낡은 화면은 공격처럼 보이는 denied 기록 대신 "근무표가 바뀌었습니다" 오류(쓰기 0건), 진짜 거부(남의 칸·지난 날짜·예비)만 denied:duty.swap', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1, undefined, { status: '취소' });
  x.slot(TOMORROW, '23:00조', R1);
  const [dead, live] = x.rows();
  const a = x.env.rows('audit_log').length;
  for (const id of [dead.id, 'no-such-row']) {
    const e = x.env.errorOf(R1, (c) => c.swapDuty(id, x.r2));
    assert.ok(e && /바뀌었습니다/.test(e.message), id);
  }
  assert.strictEqual(x.env.rows('audit_log').length, a, '거부 기록이 남지 않는다');
  const e2 = x.env.errorOf(R2, (c) => c.swapDuty(live.id, x.r3));
  assert.ok(e2 && /권한이 없습니다/.test(e2.message));
  const row = x.env.rows('audit_log').find((r) => r.action === 'denied:duty.swap');
  assert.ok(row && row.detail.includes(x.r3), '거부 기록 detail에 대상(toUserId)');
});

test('교대마다 이유(memo)를 새로 정한다: 학사 교사는 이유를 못 넣고(옛 이유도 지움), 담당자만 넣을 수 있고, 원래 근무자로 되돌리면 교대 표시(swapped_at·by·memo)가 정리된다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1);
  const row = x.rows()[0];
  swap(x, RM, row.id, x.r2, { reason: '병가 대신' });                 // 담당자 대신 근무: 이유 기록
  assert.strictEqual(x.rows()[0].memo, '병가 대신');
  swap(x, R2, row.id, x.r3, { reason: '내가 쓴 이유' });              // 학사 교사: 이유는 받지 않고 옛 이유는 지운다
  assert.strictEqual(x.rows()[0].memo, '');
  swap(x, RM, row.id, x.r1);                                          // 원래 근무자 R1로 되돌림
  const back = x.rows()[0];
  assert.deepStrictEqual([back.actual_email, back.swapped_at, back.swapped_by, back.memo], [R1, '', '', '']);
  const d = x.env.call(ADMIN, 'getDutyMonth', '2027-03').days.find((q) => q.date === TOMORROW).slots[0];
  assert.deepStrictEqual([d.name, d.swapped], ['실가짜1', false]);
});

test('앱 주소를 못 읽어도(ScriptApp 오류) 교대는 저장되고 메일은 주소만 빼고 나간다(notified:true)', () => {
  const x = makeEnv();
  const sent = [];
  x.slot(TOMORROW, '21:30조', R1);
  const r = plain(x.env.as(R1, (c) => {
    c.MailApp = { sendEmail(m) { sent.push(m); }, getRemainingDailyQuota: () => 100 };
    c.ScriptApp = { getService: () => { throw new Error('서비스 주소 오류(가짜)'); } };
    return c.swapDuty(x.rows()[0].id, x.r2);
  }));
  assert.deepStrictEqual([r.ok, r.notified], [true, true]);
  assert.ok(sent.length >= 1 && sent.every((m) => !/https?:/.test(JSON.stringify(m))), '주소 없이 발송');
  assert.strictEqual(x.rows()[0].actual_email, R2);
});

test('같은 id를 가진 줄이 둘(시트 복사·붙여넣기)이면 누구도 그 id로 교대할 수 없고(쓰기 0건), 오늘 근무가 아닌 사람은 out.save도 얻지 못한다. 빈 id는 낡은 칸', () => {
  const x = makeEnv();
  x.slot(TODAY, '21:30조', R1);
  const first = x.rows()[0];
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { id: first.id, date: TODAY, slot: '21:30조', end_time: '21:30', original_email: R1, actual_email: R1, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  assert.strictEqual(x.rows().length, 2);
  const w = JSON.stringify(x.rows());
  for (const who of [R2, R1, RM]) {
    const e = x.env.errorOf(who, (c) => c.swapDuty(first.id, x.r3));
    assert.ok(e && /같은 칸이 여러 줄/.test(e.message), who + ': ' + (e && e.message));
  }
  assert.strictEqual(JSON.stringify(x.rows()), w, '쓰기 0건');
  const stu = x.env.rows('students')[0].id;
  for (const who of [R2, R3]) {
    const d = x.env.errorOf(who, (c) => c.requirePermission_('out.save', { studentId: stu, ymd: TODAY }));
    assert.ok(d && /권한이 없습니다/.test(d.message), '오늘 근무가 아닌 ' + who + '는 오늘 out.save 거부');
  }
  const e0 = x.env.errorOf(R2, (c) => c.swapDuty('', x.r3));
  assert.ok(e0 && /바뀌었습니다/.test(e0.message));
});

test('칸 이름 뒤 공백("예비 ")이 있어도 학사 교사는 예비 칸을 넘길 수 없다(denied)', () => {
  const x = makeEnv();
  x.slot(FRI, '단독', R2); x.slot(FRI, '예비 ', R1);
  const standby = x.rows()[1];
  expectDenied(x, R1, standby.id, x.r3, '공백 있는 예비 칸');
});

test('칸 이름 뒤 공백이 있어도 메일·확인 문구에 "undefined"가 없다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조 ', R1);
  const row = x.rows()[0];
  const { r, sent } = swap(x, R1, row.id, x.r2);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(sent.length && sent.every((m) => !m.body.includes('undefined') && m.body.includes('21:30조')), sent[0] && sent[0].body);
});

test('칸 이름 뒤 공백: 확인 경고(acknowledge 없이)는 "23:00조에 편성"으로 나오고 undefined가 없으며, 금요일 "단독 " 칸의 메일 본문에 라벨이 trim되어 들어간다', () => {
  const x = makeEnv();
  x.slot(TOMORROW, '21:30조', R1); x.slot(TOMORROW, '23:00조 ', R2);
  const first = x.rows()[0];
  const a = swap(x, R1, first.id, x.r2).r;
  assert.strictEqual(a.needsConfirm, true, JSON.stringify(a));
  assert.ok(a.warnings[0].includes('23:00조에 편성') && !a.warnings[0].includes('undefined'), a.warnings[0]);
  const y = makeEnv();
  y.slot(FRI, '단독 ', R1);
  const { r, sent } = swap(y, R1, y.rows()[0].id, y.r2);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(sent.length && sent.every((m) => m.body.includes('(금) 근무 ') && !m.body.includes('undefined')), sent[0] && sent[0].body);
});

/* ───── 결정 66: 이미 시작한 근무는 학사 교사가 넘길 수 없다 ───── */
const STARTED_MSG = '이미 시작한 근무는 근무표 담당자에게 대신 근무로 기록해 달라고 하세요.';

test('dtySwapCheck_: 시작한 칸은 학사 교사에게 안내 오류(거부 기록 아님), 남의 칸이면 안내보다 먼저 거부, 담당자·시작 전은 그대로', () => {
  const r = chk({ started: true }, {});
  assert.deepStrictEqual([r.ok, r.started, r.denied, r.error], [false, true, undefined, STARTED_MSG]);
  assert.strictEqual(chk({ started: true }, { actual_email: 'z@x' }).denied, true, '남의 칸은 안내 없이 거부');
  assert.strictEqual(chk({ started: true }, { date: YESTERDAY }).denied, true, '지난 날짜는 거부');
  assert.strictEqual(chk({ canEdit: true, email: 'm@x', started: true }, { actual_email: 'z@x' }).ok, true, '담당자·관리자는 시작한 칸도 기록(결정 57)');
  assert.strictEqual(chk({ started: false }, {}).ok, true, '시작 전 오늘 칸');
});

test('dtySlotStarted_: 월~목 21:30조는 자습 시작, 23:00조는 21:30부터, 다른 날짜는 날짜로 정한다', () => {
  const started = (slot, date, now, start) => pure.dtySlotStarted_({ date, slot }, start === undefined ? { start: '19:00' } : { start }, now);
  assert.strictEqual(started('21:30조', TODAY, TODAY + 'T18:59:59'), false);
  assert.strictEqual(started('21:30조', TODAY, TODAY + 'T19:00:00'), true);
  assert.strictEqual(started('23:00조', TODAY, TODAY + 'T21:29:59'), false);
  assert.strictEqual(started('23:00조', TODAY, TODAY + 'T21:30:00'), true);
  assert.strictEqual(started('23:00조', TODAY, TODAY + 'T23:40:00'), true, '근무가 끝난 뒤');
  assert.strictEqual(started('단독', FRI, TODAY + 'T23:59:00'), false, '앞 날짜 칸');
  assert.strictEqual(started('단독', YESTERDAY, TODAY + 'T00:00:00'), true, '지난 날짜 칸');
  assert.strictEqual(started('21:30조', TODAY, TODAY + 'T00:00:00', ''), true, '시작 시각을 모르면 00:00');
});

test('swapDuty: 근무가 이미 시작한 오늘 칸은 학사 교사가 못 넘기고(안내, 쓰기·메일 없음), 담당자는 기록할 수 있다. 시작 전·다른 날 칸은 그대로 된다', () => {
  const x = makeEnv();
  x.slot(TODAY, '21:30조', R1); x.slot(TODAY, '23:00조', R2);
  const [s1, s2] = x.rows();
  const before = JSON.stringify(x.rows());
  // 20:00: 21:30조(자습 시작 뒤)는 이미 시작, 23:00조는 21:30부터라 아직
  const a = swap(x, R1, s1.id, x.r3);
  assert.strictEqual(a.r.ok, false);
  assert.deepStrictEqual(a.r.errors, [{ field: 'slot', message: STARTED_MSG }]);
  assert.deepStrictEqual(a.sent, []);
  assert.strictEqual(JSON.stringify(x.rows()), before, '거부되면 쓰지 않는다');
  assert.ok(!x.env.rows('audit_log').some((l) => l.action === 'denied:duty.swap'), '거부 기록이 아니라 안내');
  assert.strictEqual(swap(x, RM, s1.id, x.r3).r.ok, true, '담당자는 시작한 칸도 대신 근무로 기록');
  assert.strictEqual(swap(x, R2, s2.id, x.t4).r.ok, true, '23:00조는 20:00에 아직 시작 전');
});

test('swapDuty: 23:00조는 21:30부터 시작이라 21:40·23:40에는 학사 교사가 못 넘기고, 이른 아침의 오늘 칸·내일 칸은 넘길 수 있다', () => {
  const y = makeEnv();
  y.slot(TODAY, '23:00조', R2);
  y.env.setNow(TODAY + 'T21:40:00');
  const late = swap(y, R2, y.rows()[0].id, y.r3);
  assert.deepStrictEqual([late.r.ok, late.r.errors && late.r.errors[0].message], [false, STARTED_MSG]);
  y.env.setNow(TODAY + 'T23:40:00');   // 총괄이 든 재현: 근무가 끝난 뒤 넘기면 out.save 권한이 뒤바뀐다
  assert.strictEqual(swap(y, R2, y.rows()[0].id, y.r3).r.ok, false);
  assert.strictEqual(y.rows()[0].actual_email, R2, '그대로');
  const z = makeEnv();
  z.slot(TODAY, '21:30조', R1); z.slot(TOMORROW, '21:30조', R1);
  z.env.setNow(TODAY + 'T06:00:00');
  assert.strictEqual(swap(z, R1, z.rows()[0].id, z.r3).r.ok, true, '아직 시작 전인 아침');
  z.env.setNow(TODAY + 'T23:40:00');
  assert.strictEqual(swap(z, R1, z.rows()[1].id, z.r2).r.ok, true, '내일 칸은 오늘 시각과 상관없다');
});

test('getDutyMonth: 이미 시작한 오늘 칸은 학사 교사에게 [교대] 버튼(canSwap)이 없고, 담당자에게는 있다', () => {
  const x = makeEnv();
  x.slot(TODAY, '21:30조', R1);
  const month = (who) => plain(x.env.call(who, 'getDutyMonth', '2027-03'));
  const cell = (d) => d.days.find((day) => day.date === TODAY).slots.find((s) => s.slot === '21:30조');
  assert.strictEqual(cell(month(R1)).canSwap, false, '20:00 — 이미 시작');
  assert.strictEqual(cell(month(RM)).canSwap, true);
  x.env.setNow(TODAY + 'T06:00:00');
  assert.strictEqual(cell(month(R1)).canSwap, true, '아침 — 아직 시작 전');
});
