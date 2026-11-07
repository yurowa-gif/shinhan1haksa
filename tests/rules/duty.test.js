/** R8 DutyRules — 근무 칸 틀, 그날 근무자, 근무 중 판정, 월 근무 기록. 표 형식, 가짜 이메일만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/DutyRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

// 2027-03-01 월 … 03-07 일
const PLAN = (date, extra) => Object.assign({ date, operating: true, dayType: plain(ctx.baseDayType_(date)), start: '18:00', end: '23:00', blocks: [], memo: '', warnings: [] }, extra || {});
const slots = (plan) => plain(ctx.dutySlotsFor_(plan));
let seq = 0;
const ROW = (date, slot, original, extra) => Object.assign({ id: 'd' + (++seq), date, slot, end_time: '', original_email: original, actual_email: '',
  swapped_at: '', swapped_by: '', status: '유효', memo: '', updated_at: '2027-02-20T10:00:00' }, extra || {});
const on = (rows, ymd) => plain(ctx.dutyOn_(rows, ymd));

/* ───── dutySlotsFor_ ───── */

table('dutySlotsFor_: 요일 7개 — 월~목 21:30조·23:00조, 금·토·일 단독·예비', [
  ['2027-03-01', [['21:30조', '21:30'], ['23:00조', '23:00']]], ['2027-03-02', [['21:30조', '21:30'], ['23:00조', '23:00']]],
  ['2027-03-03', [['21:30조', '21:30'], ['23:00조', '23:00']]], ['2027-03-04', [['21:30조', '21:30'], ['23:00조', '23:00']]],
  ['2027-03-05', [['단독', '23:00'], ['예비', '']]], ['2027-03-06', [['단독', '23:00'], ['예비', '']]], ['2027-03-07', [['단독', '23:00'], ['예비', '']]]
], ([date, want]) => assert.deepStrictEqual(slots(PLAN(date)).map((s) => [s.slot, s.end]), want));

table('dutySlotsFor_: 끝 시각 = min(조 시각, 그날 종료) — 22:00으로 당긴 날·방학(종료가 다른 날)·특별 요일(exam)은 실제 달력 요일로(가정)', [
  [PLAN('2027-03-02', { end: '22:00' }), [['21:30조', '21:30'], ['23:00조', '22:00']]],
  [PLAN('2027-07-27', { end: '22:00' }), [['21:30조', '21:30'], ['23:00조', '22:00']]],     // 방학 화요일(같은 틀)
  [PLAN('2027-07-30', { end: '21:00' }), [['단독', '21:00'], ['예비', '']]],                // 방학 금요일
  [PLAN('2027-03-04', { dayType: 'exam' }), [['21:30조', '21:30'], ['23:00조', '23:00']]], // exam 목 → 월~목 틀
  [PLAN('2027-03-05', { dayType: 'exam' }), [['단독', '23:00'], ['예비', '']]],            // exam 금 → 금 틀
  [PLAN('2027-03-05', { end: '22:30:00' }), [['단독', '22:30'], ['예비', '']]]              // 시트 시각 표기
], ([plan, want]) => assert.deepStrictEqual(slots(plan).map((s) => [s.slot, s.end]), want));

test('dutySlotsFor_: 운영 안 하는 날·plan 없음은 []', () => {
  assert.deepStrictEqual(slots(PLAN('2027-03-02', { operating: false })), []);
  assert.deepStrictEqual(slots(null), []);
});

/* ───── dutyOn_ ───── */

test('dutyOn_: 교대 전(actual_email 빈칸)에는 원래 근무자(가정), 교대 뒤에는 실제 근무자 + swappedFrom, 순서 21:30조→23:00조', () => {
  const rows = [ROW('2027-03-02', '23:00조', 'b@example.com', { end_time: '23:00' }), ROW('2027-03-02', '21:30조', 'a@example.com', { end_time: '21:30' })];
  assert.deepStrictEqual(on(rows, '2027-03-02').duty, [
    { slot: '21:30조', email: 'a@example.com', end: '21:30', swappedFrom: '' }, { slot: '23:00조', email: 'b@example.com', end: '23:00', swappedFrom: '' }]);
  rows[1].actual_email = 'c@example.com';
  assert.deepStrictEqual(on(rows, '2027-03-02').duty[0], { slot: '21:30조', email: 'c@example.com', end: '21:30', swappedFrom: 'a@example.com' });
});

test('dutyOn_: A→B→C 교대 뒤에는 C(칸에는 마지막 교대만, 원래 근무자 A)', () => {
  const r = ROW('2027-03-02', '21:30조', 'a@example.com', { actual_email: 'c@example.com', swapped_at: '2027-03-01T12:00:00' });
  assert.deepStrictEqual(on([r], '2027-03-02').duty.map((d) => [d.email, d.swappedFrom]), [['c@example.com', 'a@example.com']]);
});

test('dutyOn_: 예비가 단독을 대신 근무하면 단독 = 예비 교사, 예비 지정은 standby에 그대로', () => {
  const rows = [ROW('2027-03-05', '단독', 'a@example.com', { actual_email: 'p@example.com' }), ROW('2027-03-05', '예비', 'p@example.com')];
  const r = on(rows, '2027-03-05');
  assert.deepStrictEqual(r.duty.map((d) => [d.slot, d.email, d.swappedFrom]), [['단독', 'p@example.com', 'a@example.com']]);
  assert.deepStrictEqual(r.standby, ['p@example.com']);
});

test('dutyOn_: 취소 행·다른 날짜 행은 무시, 이메일은 소문자·공백 없이', () => {
  const rows = [ROW('2027-03-02', '21:30조', 'x@example.com', { status: '취소', updated_at: '2027-03-01T00:00:00' }),
    ROW('2027-03-02', '21:30조', '  A@Example.COM '), ROW('2027-03-03', '23:00조', 'z@example.com')];
  const r = on(rows, '2027-03-02');
  assert.deepStrictEqual(r.duty.map((d) => d.email), ['a@example.com']);
  assert.deepStrictEqual(r.warnings, []);
});

test('dutyOn_: 같은 칸 중복은 updated_at 최신 1행(같으면 아래 행) + 경고', () => {
  const old = ROW('2027-03-02', '21:30조', 'a@example.com', { updated_at: '2027-03-01T09:00:00' });
  const neu = ROW('2027-03-02', '21:30조', 'b@example.com', { updated_at: '2027-03-01 10:00:00' });
  let r = on([neu, old], '2027-03-02');
  assert.deepStrictEqual(r.duty.map((d) => d.email), ['b@example.com']);
  assert.strictEqual(r.warnings.length, 1);
  r = on([old, Object.assign({}, old, { id: 'later', original_email: 'c@example.com' })], '2027-03-02');
  assert.deepStrictEqual(r.duty.map((d) => d.email), ['c@example.com']);
});

test('dutyOn_: 근무자 이메일이 빈 칸·모르는 칸 이름은 빼고 경고', () => {
  const r = on([ROW('2027-03-02', '21:30조', ''), ROW('2027-03-02', '24:00조', 'a@example.com')], '2027-03-02');
  assert.deepStrictEqual(r.duty, []);
  assert.strictEqual(r.warnings.length, 2);
});

/* ───── dutyIsOn_ ───── */

const ISON = [ROW('2027-03-31', '21:30조', 'a@example.com', { actual_email: 'b@example.com' }), ROW('2027-12-31', '단독', 'c@example.com'),
  ROW('2027-12-31', '예비', 'p@example.com')];
table('dutyIsOn_: 그날 실제 근무자만, windowDays 0이면 당일만·1이면 다음 날까지, 미래는 거짓, 월말·연말 경계', [
  ['b@example.com', '2027-03-31', '2027-03-31', 0, true],
  ['B@example.com ', '2027-03-31', '2027-03-31', undefined, true],   // 기본 0, 대소문자·공백
  ['b@example.com', '2027-03-31', '2027-04-01', 0, false],
  ['b@example.com', '2027-03-31', '2027-04-01', 1, true],            // 월말 → 다음 달 1일
  ['b@example.com', '2027-03-31', '2027-04-02', 1, false],
  ['b@example.com', '2027-03-31', '2027-03-30', 1, false],           // 근무일이 미래
  ['a@example.com', '2027-03-31', '2027-03-31', 0, false],           // 교대로 넘긴 원래 근무자
  ['c@example.com', '2027-12-31', '2028-01-01', 1, true],            // 연말
  ['p@example.com', '2027-12-31', '2027-12-31', 0, false],           // 예비 지정만
  ['', '2027-12-31', '2027-12-31', 0, false],
  ['c@example.com', '2027-12-31', '2027-12-31', -1, false],          // 잘못된 windowDays는 넓히지 않는다(0보다 좁게 = 거짓)
  ['c@example.com', '2027-12-31', '2028-01-01', 1.5, false],
  ['c@example.com', '2027-12-31', '날짜', 0, false]
], ([email, ymd, today, w, want]) => assert.strictEqual(ctx.dutyIsOn_(ISON, email, ymd, today, w), want));

/* ───── dutyRecord_ ───── */

test('dutyRecord_: 교대 3건(일반·교대의 교대·예비 대신 근무)인 달의 교사별 합계 = 실제 근무자(PRD F3 완료 기준), 원래 근무자에게는 세지 않음', () => {
  const rows = [
    ROW('2027-03-01', '21:30조', 'a@example.com'), ROW('2027-03-01', '23:00조', 'b@example.com'),
    ROW('2027-03-02', '21:30조', 'a@example.com', { actual_email: 'b@example.com', swapped_at: '2027-03-01T08:00:00', swapped_by: 'a@example.com' }),   // 일반 교대
    ROW('2027-03-02', '23:00조', 'c@example.com', { actual_email: 'a@example.com', swapped_at: '2027-03-01T09:00:00', swapped_by: 'mgr@example.com' }), // 교대의 교대(c→d→a)
    ROW('2027-03-05', '단독', 'c@example.com', { actual_email: 'p@example.com', swapped_at: '2027-03-05T17:00:00', swapped_by: 'mgr@example.com' }),   // 예비 대신 근무
    ROW('2027-03-05', '예비', 'p@example.com'), ROW('2027-03-06', '예비', 'b@example.com'), ROW('2027-03-06', '단독', 'c@example.com')];
  const r = plain(ctx.dutyRecord_(rows, '2027-03', {}));
  const t = Object.fromEntries(r.teachers.map((x) => [x.email, [x.total, x.bySlot['21:30조'], x.bySlot['23:00조'], x.bySlot['단독']]]));
  assert.deepStrictEqual(t, { 'a@example.com': [2, 1, 1, 0], 'b@example.com': [2, 1, 1, 0], 'c@example.com': [1, 0, 0, 1], 'p@example.com': [1, 0, 0, 1] });
  assert.deepStrictEqual(r.swaps.map((s) => [s.date, s.slot, s.from, s.to, s.by]), [
    ['2027-03-02', '21:30조', 'a@example.com', 'b@example.com', 'a@example.com'], ['2027-03-02', '23:00조', 'c@example.com', 'a@example.com', 'mgr@example.com'],
    ['2027-03-05', '단독', 'c@example.com', 'p@example.com', 'mgr@example.com']]);
  assert.deepStrictEqual(r.standby, [{ email: 'b@example.com', count: 1 }]);   // p는 3/5에 대신 근무 → 예비 칸에서 뺌(결정 46)
  assert.deepStrictEqual(r.teachers.find((x) => x.email === 'c@example.com').dates, [{ date: '2027-03-06', slot: '단독', end: '', swappedFrom: '' }]);
});

test('dutyRecord_: 예비 지정은 근무 합계와 따로 센다, 그날 대신 근무한 예비는 근무로만 세고 예비 칸에서는 뺀다(결정 46)', () => {
  const rows = [ROW('2027-03-05', '단독', 'c@example.com', { actual_email: 'p@example.com' }), ROW('2027-03-05', '예비', 'p@example.com'),
    ROW('2027-03-06', '단독', 'c@example.com'), ROW('2027-03-06', '예비', 'b@example.com'), ROW('2027-03-07', '예비', 'b@example.com')];
  const r = plain(ctx.dutyRecord_(rows, '2027-03'));
  assert.deepStrictEqual(r.teachers.map((x) => [x.email, x.total]), [['c@example.com', 1], ['p@example.com', 1]]);
  assert.deepStrictEqual(r.standby, [{ email: 'b@example.com', count: 2 }]);
});

test('dutyRecord_: 같은 칸 중복이면 교대 목록도 그날 근무자로 쓴 행(최신 수정)의 교대 일시·누른 사람', () => {
  const rows = [ROW('2027-03-02', '21:30조', 'a@example.com', { actual_email: 'b@example.com', swapped_by: 'new@example.com', updated_at: '2027-03-01T10:00:00' }),
    ROW('2027-03-02', '21:30조', 'a@example.com', { actual_email: 'c@example.com', swapped_by: 'old@example.com', updated_at: '2027-03-01T09:00:00' })];
  const r = plain(ctx.dutyRecord_(rows, '2027-03'));
  assert.deepStrictEqual(r.swaps.map((x) => [x.to, x.by]), [['b@example.com', 'new@example.com']]);
});

test('dutyRecord_: 월 경계(1/31·2/1)는 그 달 행만 센다', () => {
  const rows = [ROW('2027-01-31', '단독', 'a@example.com'), ROW('2027-02-01', '21:30조', 'a@example.com')];
  assert.deepStrictEqual(plain(ctx.dutyRecord_(rows, '2027-01')).teachers.map((x) => [x.email, x.total]), [['a@example.com', 1]]);
  assert.deepStrictEqual(plain(ctx.dutyRecord_(rows, '2027-02')).teachers[0].dates.map((d) => d.date), ['2027-02-01']);
});

test('dutyRecord_: 운영 안 하는 날의 행은 세되 경고(가정: 조용히 빼면 실제 근무를 놓친다), 빈 근무자 경고', () => {
  const rows = [ROW('2027-03-02', '21:30조', 'a@example.com'), ROW('2027-03-03', '21:30조', '')];
  const r = plain(ctx.dutyRecord_(rows, '2027-03', { operatingByDate: { '2027-03-02': false } }));
  assert.deepStrictEqual(r.teachers.map((x) => [x.email, x.total]), [['a@example.com', 1]]);
  assert.strictEqual(r.warnings.filter((w) => w.indexOf('2027-03-02') === 0).length, 1);
  assert.strictEqual(r.warnings.filter((w) => w.indexOf('2027-03-03') === 0).length, 1);
});

test('dutyRecord_: 잘못된 달은 Error', () => {
  assert.throws(() => ctx.dutyRecord_([], '2027-13'), /yyyy-MM/);
  assert.throws(() => ctx.dutyRecord_([], '2027-3'), /yyyy-MM/);
});
