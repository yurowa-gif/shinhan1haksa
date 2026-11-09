/** C14 월말 근무 기록표: 2027-01 가짜 근무표(교대 3건)로 R4 gas-fakes. 합계는 실제 근무자 기준. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const MON = '2027-01';

function makeEnv() {
  // seedFakeStage2는 가짜 학생(seedFakeData)만 있는 DB에서만 돈다 — 미등록 학생을 더하는 env.seedFake()는 쓰지 않는다
  const env = createGasEnv({ owner: 'owner@example.com', now: '2027-01-31T21:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: T1, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT, TEST_HOMEROOM_EMAIL: HOMEROOM });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => { c.addUser(ADMIN, '시험 관리자', 'admin'); c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTY, '시험 담당자', 'duty_manager'); });
  env.asOwner((c) => c.seedFakeStage2());
  const users = env.rows('users'), nameOf = (email) => (users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || {}).name;
  const slots = env.rows('duty_slots').filter((r) => r.date.slice(0, 7) === MON);
  return { env, slots, nameOf };
}
/** 독립 계산(R8을 쓰지 않는다): 날짜마다 살아 있는 칸의 실제 근무자, 예비 지정만은 따로 */
function oracle(slots) {
  const work = {}, standby = {}, bySlot = {};
  const byDate = {};
  slots.filter((r) => r.status !== '취소').forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  Object.keys(byDate).forEach((date) => {
    const duty = new Set();
    byDate[date].filter((r) => r.slot !== '예비').forEach((r) => {
      const e = (r.actual_email || r.original_email).toLowerCase();
      duty.add(e); work[e] = (work[e] || 0) + 1; (bySlot[e] = bySlot[e] || {})[r.slot] = ((bySlot[e] || {})[r.slot] || 0) + 1;
    });
    byDate[date].filter((r) => r.slot === '예비').forEach((r) => { const e = (r.actual_email || r.original_email).toLowerCase(); if (!duty.has(e)) standby[e] = (standby[e] || 0) + 1; });
  });
  return { work, standby, bySlot };
}
const rec = (x, who, month) => plain(x.env.call(who, 'getDutyRecord', month || MON));

test('교사별 합계 = 실제 근무자(독립 계산과 일치), 교대 3건에서 원래 근무자에게는 세지 않고, 예비 지정만은 따로, 운영 안 하는 날(취소 칸)은 뺀다', () => {
  const x = makeEnv();
  const o = oracle(x.slots), r = rec(x, DUTY);
  const want = Object.keys(o.work).map((e) => [x.nameOf(e), o.work[e], o.standby[e] || 0]).sort();
  const got = r.teachers.filter((t) => t.total > 0).map((t) => [t.name, t.total, t.standby]).sort();
  assert.deepStrictEqual(got, want);
  assert.strictEqual(r.totals.total, Object.values(o.work).reduce((a, b) => a + b, 0), '합계 줄 = 교사별 합');
  assert.strictEqual(r.totals.bySlot['21:30조'] + r.totals.bySlot['23:00조'] + r.totals.bySlot['단독'], r.totals.total);
  assert.deepStrictEqual(r.swaps.map((s) => [s.date, s.kind]).sort(), [['2027-01-05', '교대'], ['2027-01-13', '교대'], ['2027-01-23', '대신 근무']]);
  assert.ok(r.closedDates.includes('2027-01-01'));
  assert.ok(x.slots.filter((s) => s.date === '2027-01-01' && s.status === '취소').length > 0, '1/1(운영 안 함)의 취소된 칸이 시트에 있다');
  // 교대로 넘긴 원래 근무자에게는 세지 않는다: 1/5 21:30조
  const sw = x.slots.find((s) => s.date === '2027-01-05' && s.slot === '21:30조');
  assert.notStrictEqual(sw.original_email, sw.actual_email);
  assert.ok(r.swaps.find((s) => s.date === '2027-01-05').to === x.nameOf(sw.actual_email) && r.swaps.find((s) => s.date === '2027-01-05').from === x.nameOf(sw.original_email));
});

test('응답에 이메일이 없고, 만든 시각과 그 달 마지막 변경 시각을 함께 준다(출력 뒤 바뀌었는지 확인용)', () => {
  const x = makeEnv();
  const r = rec(x, DUTY);
  assert.ok(!JSON.stringify(r).includes('@'));
  assert.ok(/^2027-01-31 21:00$/.test(r.generatedAt), r.generatedAt);
  const last = x.slots.map((s) => String(s.updated_at)).sort().pop();
  assert.strictEqual(r.lastChangedAt, last.replace('T', ' ').slice(0, 16));
  // 근무표를 고치면 마지막 변경 시각이 바뀐다
  x.env.setNow('2027-01-31T22:30:00');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', x.slots.find((s) => s.status === '유효').id, { memo: '수정' }, ADMIN));
  assert.strictEqual(rec(x, DUTY).lastChangedAt, '2027-01-31 22:30');
});

test('학사 교사·출결 담당은 본인 행과 본인이 낀 교대만(전체 합계·내려받기 없음), 근무표 담당자·관리자는 전체', () => {
  const x = makeEnv();
  const me = rec(x, T1);
  assert.deepStrictEqual(me.teachers.map((t) => t.name), [x.nameOf(T1)]);
  assert.ok(me.teachers[0].total > 0 && me.totals === undefined && me.canFile === false);
  assert.ok(me.swaps.every((s) => s.from === x.nameOf(T1) || s.to === x.nameOf(T1)));
  const all = rec(x, ADMIN);
  assert.ok(all.teachers.length >= 4 && all.canFile && all.swaps.length === 3);
  assert.strictEqual(rec(x, DUTY).teachers.length, all.teachers.length);
  assert.deepStrictEqual(rec(x, ATT).teachers, [], '출결 담당은 근무자가 아니라 본인 행이 없다');
  for (const who of [HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.view', 'getDutyRecord', MON);
  assert.throws(() => x.env.call(DUTY, 'getDutyRecord', '2027-13'), /yyyy-MM/);
});

/** sheetMakePdf_를 바꿔 끼워 렌더 HTML을 잡는다 */
function file(x, who, month, fmt) {
  return plain(x.env.as(who, (c) => {
    c.sheetMakePdf_ = (html) => { c.__html = html; return { getBytes: () => [1, 2, 3] }; };
    c.Utilities = { base64Encode: () => 'AQID', formatDate: c.Utilities.formatDate, newBlob: c.Utilities.newBlob };
    const r = c.getDutyRecordFile(month, fmt);
    return { r, html: c.__html || '' };
  }));
}

test('getDutyRecordFile: 근무표 담당자·관리자는 PDF(임시 양식)를 받고, 학사 교사·출결 담당은 거부 + denied:duty.record, 렌더 HTML에 교사별 합계와 교대 3건', () => {
  const x = makeEnv();
  const o = oracle(x.slots);
  for (const who of [DUTY, ADMIN]) {
    const { r, html } = file(x, who, MON, 'pdf');
    assert.deepStrictEqual([r.ok, r.name, r.base64], [true, '근무기록표_2027-01.pdf', 'AQID'], who);
    assert.ok(html.includes('교대 3건') || /교대\s*3\s*건/.test(html), '교대 3건');
    for (const e of Object.keys(o.work)) assert.ok(html.includes(x.nameOf(e)), x.nameOf(e));
    assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(html), '이메일 모양 없음');
  }
  for (const who of [T1, ATT]) x.env.expectDenied(who, 'duty.record', 'getDutyRecordFile', MON, 'pdf');
  for (const who of [HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.record', 'getDutyRecordFile', MON, 'pdf');
  const xl = file(x, DUTY, MON, 'xlsx').r;
  assert.deepStrictEqual([xl.ok, /엑셀/.test(xl.error)], [false, true], '엑셀은 학교 양식을 받은 뒤(C14b)');
  assert.throws(() => file(x, DUTY, '2027-13', 'pdf'), /yyyy-MM/);
});

test('운영 안 하는 날에 근무 행이 남아 있으면 세고 경고(R8), 근무가 없는 달은 빈 목록', () => {
  const x = makeEnv();
  // 옛 상태 재현: 운영 안 하는 날(1/1)의 취소 칸을 되살린다
  const closed = x.slots.find((s) => s.date === '2027-01-01');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', closed.id, { status: '유효' }, ADMIN));
  const r = rec(x, DUTY);
  assert.ok(r.warnings.some((w) => w.includes('운영 안 하는 날')), JSON.stringify(r.warnings));
  const empty = rec(x, DUTY, '2027-05');
  assert.deepStrictEqual([empty.teachers, empty.swaps, empty.totals.total], [[], [], 0]);
});
