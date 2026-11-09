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

/* ───── C10 후속(총괄 검토 nit) ───── */
const SAT = '2027-03-06';
const noEmail = (r) => !JSON.stringify(Object.assign({}, r, { html: '' })).includes('@') && !/@[a-z0-9-]+\.[a-z]/i.test(r.html);

test('이메일은 절대 인쇄하지 않는다: users에 없는 근무자·이름이 빈 사용자는 "(등록 안 된 교사)"이고 응답·HTML에 이메일 모양이 없다', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.addUser('fake.noname@example.com', '이름있음', 'hall_teacher'));
  x.env.asOwner((c) => c.updateRecord_('users', x.env.rows('users').find((u) => u.email === 'fake.noname@example.com').id, { name: '' }, ADMIN));   // 이름이 빈 칸
  x.slot(FRI, '단독', 'fake.ghost@example.com');            // users에 없는 근무자
  x.slot(FRI, '예비', 'fake.noname@example.com');
  const r = x.sheet(FRI);
  assert.deepStrictEqual([r.dutyNames, r.standbyNames], [['(등록 안 된 교사)'], ['(등록 안 된 교사)']]);
  assert.ok(noEmail(r), '이메일 모양 없음');
  assert.ok(!r.html.includes('ghost') && !r.html.includes('noname'));
});

test('같은 이름의 두 교사는 하나로 합쳐지지 않는다(이메일로 구분), 이메일 대문자도 같은 사람으로 이름을 찾는다', () => {
  const x = makeEnv();
  x.env.asOwner((c) => { c.addUser('fake.same1@example.com', '김선생', 'hall_teacher'); c.addUser('fake.same2@example.com', '김선생', 'hall_teacher'); });
  x.slot(WED, '21:30조', 'fake.same1@example.com'); x.slot(WED, '23:00조', 'fake.same2@example.com');
  assert.deepStrictEqual(x.sheet(WED).dutyNames, ['김선생', '김선생']);
  const y = makeEnv();
  y.slot(WED, '21:30조', ' FAKE.A@EXAMPLE.COM ');           // 대문자·공백이 섞인 칸 이메일
  assert.deepStrictEqual(y.sheet(WED).dutyNames, ['가나다선생']);
});

test('그날 틀 밖 칸은 머리말에서 빼고 경고한다: 진짜 단독 근무자를 밀어내지 않고, 틀 밖 칸뿐이면 칸이 없는 것으로 보고 손 입력을 쓴다', () => {
  const x = makeEnv();
  x.slot(SAT, '21:30조', B); x.slot(SAT, '23:00조', C); x.slot(SAT, '단독', A);   // 토요일 틀은 단독·예비
  const r = x.sheet(SAT);
  assert.deepStrictEqual([r.dutySource, r.dutyNames], ['근무표', ['가나다선생']], '틀 밖 21:30·23:00 칸이 단독 근무자를 밀어내지 않는다');
  assert.ok(r.warnings.some((w) => w.includes('틀에 없는 칸') && /\d+월 \d+일\([가-힣]\)/.test(w) && !/\d{4}-\d\d-\d\d/.test(w)), JSON.stringify(r.warnings));
  const y = makeEnv();
  y.slot(SAT, '21:30조', B);
  const z = y.sheet(SAT, { dutyNames: ['손1'] });
  assert.deepStrictEqual([z.dutySource, z.dutyNames], ['손 입력', ['손1']], '틀 안의 칸이 없으면 칸이 없는 것으로 본다(hasSlots의 뜻)');
  assert.ok(z.warnings.some((w) => w.includes('틀에 없는 칸')));
});

test('예비만 있는 날: 근무는 비어 있고 출처는 근무표(예비 이름만), 근무표 탭이 없으면 오류 없이 손 입력', () => {
  const x = makeEnv();
  x.slot(SAT, '예비', B);
  const r = x.sheet(SAT, { dutyNames: ['손1'] });
  assert.deepStrictEqual([r.dutySource, r.dutyNames, r.standbyNames], ['근무표', [], ['라마바선생']]);
  const y = makeEnv();
  const out = plain(y.env.as(ATT, (c) => {
    const read = c.readAll_;
    c.readAll_ = (name, kind) => { if (name === 'duty_slots') throw new Error('탭이 없습니다: duty_slots (setup()을 다시 실행하세요)'); return read(name, kind); };
    return c.getAttendanceSheet(WED, { dutyNames: ['손1'], standbyNames: [] });
  }));
  assert.deepStrictEqual([out.ok, out.dutySource, out.dutyNames], [true, '손 입력', ['손1']]);
});

test('PDF도 근무표 이름을 쓴다(같은 sheetRender_ HTML), 근무표를 고칠 수 있는 역할만 dutyCanEdit', () => {
  const x = makeEnv();
  x.slot(WED, '21:30조', A);
  let htmlSeen = '';
  const pdf = plain(x.env.as(ATT, (c) => { c.sheetMakePdf_ = (html) => { c.__html = html; return { getBytes: () => [1, 2, 3] }; }; c.Utilities = { base64Encode: () => 'AQID', formatDate: c.Utilities.formatDate, newBlob: c.Utilities.newBlob }; const r = c.getAttendanceSheetPdf(WED, {}); return { r, html: c.__html }; }));
  assert.ok(pdf.r.ok, JSON.stringify(pdf.r)); htmlSeen = pdf.html;
  assert.ok(htmlSeen.includes('가나다선생'), 'PDF 원본 HTML에 근무표 이름');
  assert.deepStrictEqual([x.sheet(WED, {}, ADMIN).dutyCanEdit, x.sheet(WED, {}, ATT).dutyCanEdit, x.sheet(WED, {}, T1).dutyCanEdit], [true, false, false]);
});
