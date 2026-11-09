/** C10 출석부 머리말 이름: 근무표(duty_slots)에서 읽고, 그날 칸이 하나도 없을 때만 손 입력. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ATT = 'test.attendance@example.com', ADMIN = 'test.admin@example.com', T1 = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const A = 'fake.a@example.com', B = 'fake.b@example.com', C = 'fake.c@example.com';
const WED = '2027-03-03', FRI = '2027-03-05';

function makeEnv() {
  const env = createGasEnv({ now: WED + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => { c.addUser(A, '가나다선생', 'hall_teacher'); c.addUser(B, '라마바선생', 'hall_teacher'); c.addUser(C, '사아자선생', 'hall_teacher'); });
  const slot = (date, slotName, original, actual, extra) => env.asOwner((c) => c.appendRecord_('duty_slots', Object.assign({
    date, slot: slotName, end_time: '', original_email: original, actual_email: actual === undefined ? original : actual,
    swapped_at: '', swapped_by: '', status: '유효', memo: '' }, extra || {}), ADMIN));
  return { env, slot, sheet: (date, names, who) => plain(env.call(who || ATT, 'getAttendanceSheet', date, names || {})) };
}

test('월~목: 근무표 이름이 21:30조 → 23:00조 순서로 머리말에 들어가고 dutySource는 "근무표" — 같은 모델로 PDF도 만든다', () => {
  const x = makeEnv();
  x.slot(WED, '23:00조', B); x.slot(WED, '21:30조', A);          // 입력 순서와 상관없이 조 순서
  const r = x.sheet(WED);
  assert.deepStrictEqual([r.ok, r.dutySource, r.dutyNames, r.standbyNames], [true, '근무표', ['가나다선생', '라마바선생'], []]);
  assert.ok(r.html.includes('가나다선생') && r.html.includes('라마바선생'));
  assert.ok(r.html.indexOf('가나다선생') < r.html.indexOf('라마바선생'));
  assert.ok(!JSON.stringify(Object.assign({}, r, { html: '' })).includes('@') && !/@[a-z0-9-]+\./i.test(r.html), '응답에 이메일 없음(인쇄 CSS의 @page는 제외)');
});

test('금·토·일: 단독 근무와 예비 감독 이름, 예비가 대신 근무한 날은 근무에만 들어가고 예비 이름에서는 빠진다(중복 없음)', () => {
  const x = makeEnv();
  x.slot(FRI, '단독', A); x.slot(FRI, '예비', B);
  const a = x.sheet(FRI);
  assert.deepStrictEqual([a.dutySource, a.dutyNames, a.standbyNames], ['근무표', ['가나다선생'], ['라마바선생']]);
  x.env.asOwner((c) => c.updateRecord_('duty_slots', x.env.rows('duty_slots').find((q) => q.slot === '단독').id, { actual_email: B, swapped_by: ADMIN, swapped_at: WED + 'T10:00:00' }, ADMIN));
  const b = x.sheet(FRI);
  assert.deepStrictEqual([b.dutyNames, b.standbyNames], [['라마바선생'], []], '대신 근무한 예비는 근무로만');
});

test('그날 칸이 하나도 없을 때만 손 입력을 쓴다(dutySource "손 입력"), 칸이 있으면 손 입력은 무시한다', () => {
  const x = makeEnv();
  const manual = { dutyNames: ['손1', '손2', '손3', '손4', '손5'], standbyNames: ['예1', '예2', '예3'] };
  const a = x.sheet(WED, manual);
  assert.deepStrictEqual([a.dutySource, a.dutyNames, a.standbyNames], ['손 입력', ['손1', '손2', '손3', '손4'], ['예1', '예2']], '손 입력은 지금처럼 4명·2명');
  assert.strictEqual(x.sheet(WED).dutySource, '', '이름이 없으면 출처도 없다');
  x.slot(WED, '21:30조', A);
  const b = x.sheet(WED, manual);
  assert.deepStrictEqual([b.dutySource, b.dutyNames, b.standbyNames], ['근무표', ['가나다선생'], []], '칸이 하나라도 있으면 손 입력은 쓰지 않는다');
  assert.ok(!b.html.includes('손1'));
});

test('취소된 칸만 있으면 칸이 없는 것으로 본다, 다른 날 칸은 상관없다, 근무표 이름은 근무 2명·예비 1명까지·12자까지', () => {
  const x = makeEnv();
  x.slot(WED, '21:30조', A, undefined, { status: '취소' }); x.slot('2027-03-04', '21:30조', B);
  assert.strictEqual(x.sheet(WED, { dutyNames: ['손1'] }).dutySource, '손 입력');
  const y = makeEnv();
  y.env.asOwner((c) => c.addUser('fake.long@example.com', '아주아주긴이름의선생님입니다', 'hall_teacher'));
  y.slot(WED, '21:30조', 'fake.long@example.com'); y.slot(WED, '23:00조', B);
  const r = y.sheet(WED);
  assert.deepStrictEqual(r.dutyNames, ['아주아주긴이름의선생님입니다'.slice(0, 12), '라마바선생']);
  assert.strictEqual(r.dutyNames[0].length <= 12, true);
  // 한 날 근무 칸이 3개 이상 들어 있어도(잘못된 자료) 근무 2명·예비 1명까지
  const z = makeEnv();
  z.slot(FRI, '단독', A); z.slot(FRI, '예비', B); z.slot(FRI, '21:30조', C); z.slot(FRI, '23:00조', T1);
  const w = z.sheet(FRI);
  assert.ok(w.dutyNames.length <= 2 && w.standbyNames.length <= 1);
});

test('운영 안 하는 날은 출석부를 만들지 않아도 응답 모양은 같다, 권한은 그대로(담임은 거부)', () => {
  const x = makeEnv();
  x.env.call(ADMIN, 'saveDaySchedule', { date: WED, operating: false, memo: '행사' });
  const r = x.sheet(WED);
  assert.deepStrictEqual([r.ok, r.operating], [true, false]);
  x.env.expectDenied(HOMEROOM, 'sheet.view', 'getAttendanceSheet', WED, {});
  x.env.expectAllowed(T1, 'getAttendanceSheet', FRI, {});
});
