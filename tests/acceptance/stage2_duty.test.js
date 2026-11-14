/**
 * T2 끝까지 ①(stage2.md 7절): 1월 근무표로 월말 근무 기록표를 뽑는다. PRD F3 "교대 3건 달 = 실제 근무자".
 * seedFakeStage2(교대 3건) → 학사 교사가 화면 함수로 교대 1건 더(swapDuty) → getDutyRecord 합계가 실제 근무자 → getDutyRecordFile 모델·HTML.
 * 한계: 가짜 1월은 학기 기간이다(T1a). 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const TESTER = 'test.teacher@example.com', DUTY = 'fake.teacher2@example.com', ADMIN = 'owner@example.com';
const T1 = 'fake.teacher1@example.com', T3 = 'fake.teacher3@example.com';
const MON = '2027-01';

/** setup → seedFakeData → seedFakeStage1 → seedFakeStage2 (가짜 학생만 있는 DB) */
function seededEnv(now) {
  const env = createGasEnv({ owner: ADMIN, now });
  env.scriptProps.TEST_TEACHER_EMAIL = TESTER;
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage2());
  return env;
}
/** 독립 계산: 날짜·칸마다 살아 있는 행의 실제 근무자(빈칸이면 원래 근무자)를 센다. 예비 칸은 빼고 */
function actualCount(rows) {
  const n = {};
  rows.filter((r) => r.date.slice(0, 7) === MON && r.status !== '취소' && r.slot !== '예비')
    .forEach((r) => { const e = (r.actual_email || r.original_email).toLowerCase(); n[e] = (n[e] || 0) + 1; });
  return n;
}

test('끝까지 ①: 교대 3건 + 화면에서 1건 더 → 기록표 교사별 합계 = 실제 근무자(원래 근무자 아님) → 파일 HTML에 합계·교대 4건', () => {
  const env = seededEnv('2027-01-26T21:00:00');
  const users = env.rows('users');
  const nameOf = (e) => users.find((u) => u.email.toLowerCase() === e).name;
  const idOf = (e) => users.find((u) => u.email.toLowerCase() === e).id;

  // 1/27(수) 21:30조는 시험 교사 칸이다. 시험 교사가 그날 비는 가짜교사2에게 넘긴다(본인 칸·오늘 이후 → 허용)
  const slot = env.rows('duty_slots').find((r) => r.date === '2027-01-27' && r.slot === '21:30조' && r.status === '유효');
  assert.strictEqual(slot.actual_email, TESTER, '시드: 1/27 21:30조 = 시험 교사');
  const before = actualCount(env.rows('duty_slots'));
  const sw = plain(env.call(TESTER, 'swapDuty', slot.id, idOf(DUTY), { expect: env.asOwner((c) => c.dtySlotToken_(c.readAll_('duty_slots').find((r) => r.id === slot.id))) }));
  assert.strictEqual(sw.ok, true, JSON.stringify(sw));

  const rows = env.rows('duty_slots');
  const after = actualCount(rows);
  assert.strictEqual(after[TESTER], before[TESTER] - 1, '넘긴 사람 -1');
  assert.strictEqual(after[DUTY], before[DUTY] + 1, '받은 사람 +1');
  const original = {};
  rows.filter((r) => r.date.slice(0, 7) === MON && r.status !== '취소' && r.slot !== '예비')
    .forEach((r) => { original[r.original_email] = (original[r.original_email] || 0) + 1; });
  assert.notDeepStrictEqual(after, original, '원래 근무자로 세면 다르다(교대 4건)');

  // 근무표 담당자 화면: 교사별 합계 = 실제 근무자
  const rec = plain(env.call(DUTY, 'getDutyRecord', MON));
  const got = Object.fromEntries(rec.teachers.filter((t) => t.total > 0).map((t) => [t.name, t.total]));
  const want = Object.fromEntries(Object.keys(after).map((e) => [nameOf(e), after[e]]));
  assert.deepStrictEqual(got, want);
  assert.deepStrictEqual(rec.teachers.map((t) => t.name).sort(), [T1, DUTY, T3, TESTER].map(nameOf).sort());
  assert.strictEqual(rec.totals.total, 46, '운영 30일 = 월~목 16일×2 + 금토일 14일');
  assert.deepStrictEqual(rec.swaps.map((s) => [s.date, s.kind, s.from, s.to]), [
    ['2027-01-05', '교대', nameOf(DUTY), nameOf(TESTER)],
    ['2027-01-13', '교대', nameOf(T3), nameOf(T1)],
    ['2027-01-23', '대신 근무', nameOf(TESTER), nameOf(T1)],
    ['2027-01-27', '교대', nameOf(TESTER), nameOf(DUTY)]]);
  assert.ok(!/[\w.]+@[\w-]+\.[\w.]+/.test(JSON.stringify(rec)), '응답에 이메일 없음');

  // 학사 교사 본인 화면: 본인 행만, 합계 줄 없음
  const mine = plain(env.call(TESTER, 'getDutyRecord', MON));
  assert.deepStrictEqual(mine.teachers.map((t) => [t.name, t.total]), [[nameOf(TESTER), after[TESTER]]]);
  assert.strictEqual(mine.totals, undefined);

  // 파일(지금은 PDF 임시 양식): 렌더 HTML에 교사별 합계와 교대 4건. PDF 변환은 바꿔 끼운다(gas-fakes에 Drive 없음)
  const file = env.as(DUTY, (c) => {
    c.sheetMakePdf_ = (html) => { c.__html = html; return { getBytes: () => [1, 2, 3] }; };
    return { r: plain(c.getDutyRecordFile(MON, 'pdf')), html: c.__html };
  });
  assert.strictEqual(file.r.ok, true, JSON.stringify(file.r));
  assert.ok(!/[\w.]+@[\w-]+\.[\w.]+/.test(file.html), '파일에 이메일 없음');
  for (const e of Object.keys(after)) assert.ok(file.html.includes(nameOf(e)), nameOf(e));
  // 교사별 줄의 근무 합계(끝에서 다섯째 칸 = 근무 합계, duty_record.test.js와 같은 읽기)
  const cells = (tr) => tr.replace(/<[^>]*>/g, '|').split('|').map((q) => q.trim()).filter((q) => q && !/^ ?style=/.test(q));
  const trs = file.html.split('<tr').filter((t) => t.includes('scope="row"')).map(cells);
  for (const e of Object.keys(after)) {
    const tr = trs.find((r) => r[0] === nameOf(e));
    assert.ok(tr, '파일에 ' + nameOf(e) + ' 줄');
    assert.strictEqual(Number(tr.slice(-5)[0]), after[e], nameOf(e) + ' 파일의 근무 합계 = 실제 근무자');
  }
  for (const d of ['1월 5일', '1월 13일', '1월 23일', '1월 27일']) assert.ok(file.html.includes('2027년 ' + d), '교대 날짜 ' + d);
  env.expectDenied(TESTER, 'duty.record', 'getDutyRecordFile', MON, 'pdf');
});
