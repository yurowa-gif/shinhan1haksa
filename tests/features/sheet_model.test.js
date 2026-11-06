/** C7 출석부: 모델 계약(docs/contracts/sheet-model.md)·미리보기·PDF 서버 함수(R4 가짜 서비스, 가짜 데이터만) */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { validateSheetModel } = require('../design/sheet-model-shape');

const ADMIN = 'owner@example.com';
const ATT = 'test.attendance@example.com';
const WED = '2027-03-03', FRI = '2027-03-05', SAT = '2027-03-06', SUN = '2027-03-07', OFF = '2027-03-10';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.addUser('fake.admin@example.com', '가짜관리자', 'admin'));
  return env;
}
const env = makeEnv();
const model = (d) => plain(env.asOwner((c) => c.sheetModelFor_(d))).model;
const preview = (who, d) => plain(env.call(who, 'getAttendanceSheet', d));

test('모델이 계약(validateSheetModel)을 지킨다: 평일·금·토·일', () => {
  [WED, FRI, SAT, SUN].forEach((d) => {
    const m = model(d);
    assert.deepStrictEqual(validateSheetModel(m), [], d + ' ' + JSON.stringify(validateSheetModel(m)));
    assert.ok(m.operating); assert.ok(m.blocks.length >= 3);
    assert.ok(m.spaces.length > 0);
  });
  assert.strictEqual(model(SUN).blocks.length, 4);
});

test('운영 안 하는 날(2027-03-10)은 블록·칸이 비고 계약은 여전히 통과', () => {
  const m = model(OFF);
  assert.strictEqual(m.operating, false); assert.deepStrictEqual(m.blocks, []); assert.deepStrictEqual(m.spaces, []);
  assert.deepStrictEqual(validateSheetModel(m), []);
});

test('모델에는 학년·이름·표시 문구만 있고 학번·이메일·사유는 없다', () => {
  const s = JSON.stringify(model(WED));
  assert.ok(!/@/.test(s), '이메일이 모델에 있음');
  model(WED).spaces.forEach((sp) => sp.cells.forEach((c) => {
    if (c.occupant) assert.deepStrictEqual(Object.keys(c.occupant).sort(), ['display', 'grade', 'name']);
  }));
});

test('특이사항이 칸 표시에 반영된다(수요일 ALL 병결 → 기호 있는 칸이 있음)', () => {
  const m = model(WED);
  const codes = new Set();
  m.spaces.forEach((sp) => sp.cells.forEach((c) => c.marks.forEach((k) => codes.add(k.code))));
  assert.ok(codes.has('EXC'), [...codes].join(','));
  assert.ok(codes.has('END') || codes.has('NONE'));
});

test('공석 칸은 NONE 표시뿐이고 빈자리 수가 요약과 맞는다', () => {
  const m = model(WED);
  let vacant = 0;
  m.spaces.forEach((sp) => sp.cells.forEach((c) => {
    if (c.kind === 'seat' && c.vacant) { vacant++; assert.ok(c.marks.every((k) => k.code === 'NONE')); assert.strictEqual(c.occupant, null); }
  }));
  const r = preview(ATT, WED);
  assert.strictEqual(r.vacantCount, vacant);
});

test('getAttendanceSheet: 운영일은 HTML·요약, 운영 안 하는 날은 안내만, 기간 밖은 오류 문구', () => {
  const r = preview(ATT, WED);
  assert.ok(r.ok && r.operating); assert.ok(/<html|<!doctype/i.test(r.html)); assert.ok(r.pageCount >= 1);
  assert.ok(r.seatCount > 0); assert.strictEqual(r.blockLabels.length, 3);
  const off = preview(ATT, OFF);
  assert.ok(off.ok && !off.operating && !off.html && /운영하지 않는/.test(off.message));
  const none = preview(ATT, '2035-01-01');
  assert.ok(!none.ok && /운영 기간/.test(none.error));
});

test('날짜를 비우면 오늘, 형식이 틀리면 오류', () => {
  assert.strictEqual(preview(ATT, '').date, WED);
  assert.throws(() => env.call(ATT, 'getAttendanceSheet', '2027/3/3'), /날짜/);
});

test('권한: admin·attendance·hall_teacher 허용, 학생·학부모·담임·근무표담당·계정없음 거부(denied:sheet.view)', () => {
  const e = makeEnv();
  ['owner@example.com', 'fake.admin@example.com', ATT, 'fake.teacher1@example.com'].forEach((who) => e.expectAllowed(who, 'getAttendanceSheet', WED));
  ['test.student@example.com', 'test.parent@example.com', 'test.homeroom@example.com', 'test.duty@example.com', 'nobody@example.com']
    .forEach((who) => { e.expectDenied(who, 'sheet.view', 'getAttendanceSheet', WED); e.expectDenied(who, 'sheet.view', 'getAttendanceSheetPdf', WED); });
});

test('getAttendanceSheet는 아무것도 쓰지 않는다(시트·audit 그대로)', () => {
  const e = makeEnv();
  const snap = () => JSON.stringify(['students', 'enrollments', 'seat_assignments', 'audit_log'].map((n) => e.rows(n)));
  const before = snap();
  e.call(ATT, 'getAttendanceSheet', WED);
  assert.strictEqual(snap(), before);
});

test('getAttendanceSheetPdf: 이름·base64·바이트 수(PDF 변환은 가짜로 대체), 운영 안 하는 날은 PDF 없음', () => {
  const e = makeEnv();
  const run = (d) => plain(e.as(ATT, (c) => {
    c.sheetMakePdf_ = (html, name) => ({ getBytes: () => Array.from(Buffer.from('%PDF-fake ' + html.length)), setName: () => this });
    return c.getAttendanceSheetPdf(d);
  }));
  const r = run(WED);
  assert.ok(r.ok); assert.strictEqual(r.name, '출석부_2027-03-03(수).pdf');
  assert.ok(Buffer.from(r.base64, 'base64').toString().startsWith('%PDF-fake')); assert.strictEqual(r.bytes, Buffer.from(r.base64, 'base64').length);
  const off = run(OFF);
  assert.ok(!off.ok && /운영하지 않는/.test(off.error));
});
