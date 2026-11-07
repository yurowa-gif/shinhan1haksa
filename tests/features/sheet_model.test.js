/** C7 출석부: 모델 계약(docs/contracts/sheet-model.md)·미리보기·PDF 서버 함수(R4 가짜 서비스, 가짜 데이터만) */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

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

test('블록 수는 평일 3·금 3·토 3·일 4이고 공간·좌석이 있다', () => {
  assert.deepStrictEqual([WED, FRI, SAT, SUN].map((d) => model(d).blocks.length), [3, 3, 3, 4]);
  [WED, FRI, SAT, SUN].forEach((d) => assert.ok(model(d).operating && model(d).spaces.length > 0));
});

test('운영 안 하는 날(2027-03-10)은 블록·칸이 비어 있다', () => {
  const m = model(OFF);
  assert.strictEqual(m.operating, false); assert.deepStrictEqual(m.blocks, []); assert.deepStrictEqual(m.spaces, []);
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

/* ───── 총괄 1차 검토 반영 ───── */

const cellsOf = (m) => m.spaces.flatMap((sp) => sp.cells).filter((c) => c.kind === 'seat');
const byName = (m, display) => cellsOf(m).find((c) => c.occupant && c.occupant.display === display);
const students = () => env.rows('students');
const dispOf = (st) => st.grade + '. ' + st.name;

test('머리말: 제목·날짜·"근무: ____" 빈칸, 손으로 넣은 근무·예비 이름은 인쇄물에 나오고 저장되지 않는다', () => {
  const blank = preview(ATT, WED);
  assert.ok(blank.html.includes('신한학사 출석부') && blank.html.includes('2027년 3월 3일(수)'), '제목·날짜');
  assert.ok(blank.html.includes('________'), '근무 빈칸');
  const before = JSON.stringify(['students', 'seat_assignments', 'audit_log', 'settings'].map((n) => env.rows(n)));
  const named = plain(env.call(ATT, 'getAttendanceSheet', WED, { dutyNames: ['김가짜', '이가짜'], standbyNames: ['박가짜'] }));
  assert.ok(named.html.includes('김가짜') && named.html.includes('이가짜'), '근무 이름이 머리말에');
  assert.strictEqual(JSON.stringify(['students', 'seat_assignments', 'audit_log', 'settings'].map((n) => env.rows(n))), before, '저장하지 않는다');
  assert.ok(!preview(ATT, WED).html.includes('김가짜'), '다음 미리보기에는 남지 않는다');
});

test('sheetNames_: 배열·쉼표·줄바꿈 입력, 12자·인원 제한, 중복·빈 이름·제어문자 제거(나쁜 입력)', () => {
  const n = (x) => plain(env.as(ATT, (c) => c.sheetNames_(x)));
  assert.deepStrictEqual(n({ dutyNames: '김가짜, 이가짜\n김가짜,, ', standbyNames: ['박가짜'] }), { dutyNames: ['김가짜', '이가짜'], standbyNames: ['박가짜'] });
  assert.deepStrictEqual(n({ dutyNames: ['가', '나', '다', '라', '마'], standbyNames: ['A', 'B', 'C'] }), { dutyNames: ['가', '나', '다', '라'], standbyNames: ['A', 'B'] });
  assert.strictEqual(n({ dutyNames: ['ㄱ'.repeat(30)] }).dutyNames[0].length, 12);
  assert.deepStrictEqual(n({ dutyNames: ['김\u0000가\u0007짜'] }).dutyNames, ['김 가 짜']);
  assert.deepStrictEqual(n(null), { dutyNames: [], standbyNames: [] });
  assert.deepStrictEqual(n({ dutyNames: [null, undefined, 5] }).dutyNames, ['5']);
  const html = plain(env.call(ATT, 'getAttendanceSheet', WED, { dutyNames: ['<b>x</b>'] })).html;
  assert.ok(!html.includes('<b>x</b>'), '이름은 이스케이프되어 인쇄 HTML에 태그로 들어가지 않는다');
});

test('칸 우선순위: 확정 특이사항 > 고정 일정 > 23:00 종료(월~목만) > 빈칸', () => {
  const m = model(WED);
  const ex = students().find((s) => s.memo === '가짜 데이터');   // 3/3 전체 병결(확정)
  const exCell = byName(m, dispOf(ex));
  assert.ok(exCell.marks.every((k) => k.code === 'EXC'), '하루 전체 특이사항은 모든 블록이 EXC');
  const fixedStu = env.rows('fixed_schedules').find((f) => f.weekday === '수' && f.code === '학');
  const fcell = byName(m, dispOf(students().find((s) => s.id === fixedStu.student_id)));
  assert.strictEqual(fcell.marks[0].code, 'FIXED'); assert.strictEqual(fcell.marks[0].text, '학');
  const ends = cellsOf(m).filter((c) => c.marks.some((k) => k.code === 'END'));
  assert.ok(ends.length > 0, '23:00 종료 유형 학생은 월~목에 정상 종료가 나온다');
  assert.ok(ends.every((c) => c.marks[c.marks.length - 1].code === 'END'), '정상 종료는 마지막 블록에');
  // 같은 칸에 확정 특이사항이 겹치면 특이사항이 이긴다
  env.asOwner((c) => c.appendRecord_(c.termSheetName_('exceptions', env.rows('terms').find((t) => t.name === '2027 1학기').id), {
    term_id: env.rows('terms').find((t) => t.name === '2027 1학기').id, group_id: 'g-prio', student_id: fixedStu.student_id, date: WED, blocks: '18:00-20:00',
    type: '병결', reason: '', status: '확정', requested_by: ADMIN, requested_at: '2027-03-03T10:00:00', confirmed_by: ADMIN, confirmed_at: '2027-03-03T10:00:00', cancel_reason: ''
  }, ADMIN));
  const after = byName(model(WED), dispOf(students().find((s) => s.id === fixedStu.student_id)));
  assert.strictEqual(after.marks[0].code, 'EXC', '특이사항 > 고정 일정');
  const friEnd = model(FRI);
  assert.ok(cellsOf(friEnd).every((c) => c.marks.every((k) => k.code !== 'END')), '금요일은 23:00 종료를 적용하지 않는다');
  const vacant = cellsOf(m).find((c) => c.vacant);
  assert.ok(vacant.marks.every((k) => k.code === 'NONE'));
});

test('퇴실 적용일부터 그 자리는 공석: 퇴실 전날(3/9)은 앉아 있고 3/11에는 공석, 중도 입실자는 입실 전에는 없고 입실 뒤 미배정 목록에 나온다', () => {
  const leaver = env.rows('status_changes').find((c) => c.item === '학사' && c.value === '퇴실');
  const lst = students().find((s) => s.id === leaver.student_id);
  assert.ok(byName(model('2027-03-09'), dispOf(lst)), '퇴실 전날은 자리가 있다');
  assert.ok(!byName(model('2027-03-11'), dispOf(lst)), '퇴실 뒤에는 자리에서 빠진다');
  const late = env.rows('status_changes').find((c) => c.item === '학사' && c.effective_date === '2027-03-15');
  const ls = students().find((s) => s.id === late.student_id);
  assert.ok(!model('2027-03-12').unseated.some((u) => u.display === dispOf(ls)), '입실 전에는 미배정 목록에 없다');
  assert.ok(model('2027-03-16').unseated.some((u) => u.display === dispOf(ls)), '입실 뒤 자리가 없으면 미배정 목록');
  const u = model('2027-03-16').unseated.map((x) => x.display);
  assert.deepStrictEqual(Object.keys(model('2027-03-16').unseated[0]), ['display']);
  assert.ok(u.every((d) => /^[1-3]\. \S+/.test(d)));
});

test('취소된 공간 좌석에 배정이 남은 학생은 미배정 목록에 나온다(사라지지 않는다)', () => {
  const m0 = model(WED);
  const sp = m0.spaces.find((s) => s.name === 'SA3실');
  const seated = sp.cells.find((c) => c.occupant);
  assert.ok(seated, '가짜 데이터에서 SA3실에 앉은 학생이 있다');
  env.asOwner((c) => c.updateRecord_('spaces', sp.id, { status: '취소' }, ADMIN));
  const m1 = model(WED);
  assert.ok(!m1.spaces.some((s) => s.name === 'SA3실'), '취소된 공간은 모델에 없다');
  assert.ok(m1.unseated.some((u) => u.display === seated.occupant.display), '그 학생은 미배정 목록에 나온다');
  env.asOwner((c) => c.updateRecord_('spaces', sp.id, { status: '유효' }, ADMIN));   // 되돌린다
});

test('경고에 학생 UUID 대신 "학년. 이름", "이 기간 좌석 배치가 없습니다" 경고는 이 기간 배정으로 판정한다', () => {
  const e = createGasEnv({ now: '2027-03-03T20:00:00' });
  e.seedFake({ stage1: true });
  const m = () => plain(e.asOwner((c) => c.sheetModelFor_(WED))).model;
  // 한 학생을 두 자리에 배정
  const asg = e.rows('seat_assignments').filter((a) => a.status === '배정');
  const dup = asg[0];
  const other = asg.find((a) => a.seat_id !== dup.seat_id && a.student_id !== dup.student_id);
  e.asOwner((c) => c.appendRecord_('seat_assignments', { term_id: dup.term_id, seat_id: other.seat_id, student_id: dup.student_id, valid_from: '2027-03-03', valid_to: '', status: '배정', memo: '' }, ADMIN));
  const w = m().warnings.join(' ');
  const stu = e.rows('students').find((s) => s.id === dup.student_id);
  assert.ok(w.includes(stu.grade + '. ' + stu.name), w);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(w), 'UUID가 경고에 없다: ' + w);
  // 이 기간 배정이 모두 없으면(공간·좌석은 그대로) 배정 없음 경고
  const fresh = createGasEnv({ now: '2027-03-03T20:00:00' });
  fresh.seedFake({ stage1: true });
  fresh.rows('seat_assignments').forEach((a) => fresh.asOwner((c) => c.updateRecord_('seat_assignments', a.id, { status: '취소' }, ADMIN)));
  const fw = plain(fresh.asOwner((c) => c.sheetModelFor_(WED))).model.warnings;
  assert.ok(fw.some((x) => x.includes('이 기간에 좌석 배정이 없습니다')), JSON.stringify(fw));
  assert.ok(!fw.some((x) => x.includes('공간이 없습니다')));
  assert.ok(!m().warnings.some((x) => x.includes('좌석 배정이 없습니다')), '배정이 있으면 경고 없음');
});

test('단계별 소요 시간(timings)이 응답에 있다 — 캐시 없이 실측용(개인정보 없음)', () => {
  const r = preview(ATT, WED);
  assert.deepStrictEqual(Object.keys(r.timings).sort(), ['buildMs', 'loadMs', 'renderMs', 'totalMs']);
  assert.ok(Object.values(r.timings).every((v) => typeof v === 'number' && v >= 0));
  const e = createGasEnv({ now: '2027-03-03T20:00:00' }); e.seedFake({ stage1: true });
  const pdf = plain(e.as(ATT, (c) => {
    c.sheetMakePdf_ = (html) => ({ getBytes: () => Array.from(Buffer.from('%PDF ' + html.length)), setName: () => this });
    return c.getAttendanceSheetPdf(WED, { dutyNames: ['김가짜'] });
  }));
  assert.ok(pdf.ok && typeof pdf.timings.pdfMs === 'number');
});

test('렌더러 쪽지 경고(printSheetPlan_ warnings)와 쪽 수가 미리보기 응답에 나온다', () => {
  const e = createGasEnv({ now: '2027-03-03T20:00:00' }); e.seedFake({ stage1: true });
  const r = plain(e.as(ATT, (c) => {
    c.printSheetPlan_ = () => ({ pages: 3, warnings: ['표시 칸이 손글씨 하한(4.5mm)보다 좁습니다.'] });
    return c.getAttendanceSheet(WED);
  }));
  assert.deepStrictEqual(r.warnings.filter((w) => w.includes('4.5mm')), ['표시 칸이 손글씨 하한(4.5mm)보다 좁습니다.']);
  assert.strictEqual(r.pageCount, 3);
});

test('응답에 실제 오늘(today)이 있다 — ?date=로 들어와도 "오늘" 칩이 오늘을 가리키게', () => {
  assert.strictEqual(preview(ATT, '2027-03-12').today, WED);
  assert.strictEqual(preview(ATT, '2027-03-12').date, '2027-03-12');
});

test('예비 감독: 금요일은 미리보기·PDF 직전 HTML 머리말에 "예비 박선생", 월~목은 예비 칸이 없다', () => {
  const FRI_ = '2027-03-05';
  const names = { dutyNames: '김선생', standbyNames: '박선생' };
  const pv = plain(env.call(ATT, 'getAttendanceSheet', FRI_, names));
  assert.ok(pv.html.includes('예비 박선생') && pv.html.includes('김선생'), '미리보기 머리말');
  let pdfHtml = '';
  const pdf = plain(env.as(ATT, (c) => {
    c.sheetMakePdf_ = (html) => { pdfHtml = html; return { getBytes: () => [37, 80, 68, 70], setName: () => this }; };
    return c.getAttendanceSheetPdf(FRI_, names);
  }));
  assert.ok(pdf.ok); assert.ok(pdfHtml.includes('예비 박선생') && pdfHtml.includes('김선생'), 'PDF로 바꾸기 직전 HTML 머리말');
  assert.strictEqual(pdfHtml, pv.html, 'PDF는 미리보기와 같은 HTML');
  const wed = plain(env.call(ATT, 'getAttendanceSheet', WED, { dutyNames: '김선생' }));
  assert.ok(!wed.html.includes('예비'), '월~목에는 예비 칸이 없다');
  assert.ok(plain(env.call(ATT, 'getAttendanceSheet', FRI_)).html.includes('예비 ________'), '금요일 이름이 없으면 빈칸');
});
