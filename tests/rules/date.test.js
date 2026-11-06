/** R1 DateRules — 표 형식. TZ=Asia/Seoul·UTC 두 번 돈다(npm test). */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

table('ymdIsValid_: 윤년·월말·형식', [
  ['2028-02-29', true], ['2027-02-29', false], ['2000-02-29', true], ['2100-02-29', false],
  ['2027-02-28', true], ['2027-04-31', false], ['2027-04-30', true], ['2027-12-31', true],
  ['2027-13-01', false], ['2027-00-10', false], ['2027-01-00', false], ['2027-01-32', false],
  ['2027-1-01', false], ['2027-01-1', false], ['27-01-01', false], ['2027/01/01', false],
  [' 2027-01-01', false], ['2027-01-01 ', false], ['2027-01-01T00:00:00', false],
  ['', false], [null, false], [undefined, false], [20270101, false]
], ([s, want]) => assert.strictEqual(ctx.ymdIsValid_(s), want));

table('ymdAddDays_: 월말·연말·윤년을 넘는다', [
  ['2028-02-28', 1, '2028-02-29'], ['2028-02-29', 1, '2028-03-01'], ['2027-02-28', 1, '2027-03-01'],
  ['2028-03-01', -1, '2028-02-29'], ['2027-03-01', -1, '2027-02-28'],
  ['2026-12-31', 1, '2027-01-01'], ['2027-01-01', -1, '2026-12-31'],
  ['2027-01-31', 1, '2027-02-01'], ['2027-04-30', 1, '2027-05-01'],
  ['2026-12-30', 12, '2027-01-11'], ['2027-03-01', 0, '2027-03-01'],
  ['2027-01-01', 365, '2028-01-01'], ['2028-01-01', 366, '2029-01-01'], ['2028-01-01', -365, '2027-01-01'],
  // 서머타임이 있는 시간대에서도 하루 = 24시간이 아닌 경계가 없다(UTC 계산)
  ['2027-03-14', 1, '2027-03-15'], ['2027-11-07', 1, '2027-11-08']
], ([d, n, want]) => assert.strictEqual(ctx.ymdAddDays_(d, n), want));

test('ymdAddDays_: 잘못된 입력은 Error', () => {
  assert.throws(() => ctx.ymdAddDays_('2027-02-29', 1));
  assert.throws(() => ctx.ymdAddDays_('2027-03-01', 1.5));
  assert.throws(() => ctx.ymdAddDays_('2027-03-01', '1'));
  assert.throws(() => ctx.ymdAddDays_('2027-03-01', NaN));
  // 결과가 yyyy-MM-dd 범위를 벗어나면 Error(자기 검사기를 통과하지 못하는 값을 돌려주지 않음)
  assert.throws(() => ctx.ymdAddDays_('1000-01-01', -1));
  assert.throws(() => ctx.ymdAddDays_('9999-12-31', 1));
  assert.throws(() => ctx.ymdAddDays_('2026-03-01', 1e9));
});

// 2027-03-01 월, 2026-12-31 목, 2028-02-29 화, 2027-01-03 일
table('ymdWeekday_·ymdWeekdayKo_', [
  ['2027-03-01', 1, '월'], ['2027-03-02', 2, '화'], ['2027-03-03', 3, '수'], ['2027-03-04', 4, '목'],
  ['2027-03-05', 5, '금'], ['2027-03-06', 6, '토'], ['2027-03-07', 0, '일'],
  ['2026-12-31', 4, '목'], ['2027-01-01', 5, '금'], ['2028-02-29', 2, '화'], ['2026-11-06', 5, '금']
], ([d, w, ko]) => {
  assert.strictEqual(ctx.ymdWeekday_(d), w);
  assert.strictEqual(ctx.ymdWeekdayKo_(d), ko);
});

table('ymdMondayOf_: 월~일 주, 일요일은 앞 월요일, 연말·윤년 넘김', [
  ['2027-03-01', '2027-03-01'], ['2027-03-03', '2027-03-01'], ['2027-03-06', '2027-03-01'],
  ['2027-03-07', '2027-03-01'], ['2027-03-08', '2027-03-08'],
  ['2027-01-01', '2026-12-28'], ['2027-01-03', '2026-12-28'], ['2026-12-31', '2026-12-28'],
  ['2028-03-01', '2028-02-28'], ['2028-03-05', '2028-02-28']
], ([d, want]) => assert.strictEqual(ctx.ymdMondayOf_(d), want));

test('ymdRange_: 양 끝 포함, 윤년 2월, 연말, 거꾸로면 빈 배열', () => {
  assert.deepStrictEqual(plain(ctx.ymdRange_('2028-02-27', '2028-03-01')),
    ['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepStrictEqual(plain(ctx.ymdRange_('2026-12-30', '2027-01-02')),
    ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepStrictEqual(plain(ctx.ymdRange_('2027-03-01', '2027-03-01')), ['2027-03-01']);
  assert.deepStrictEqual(plain(ctx.ymdRange_('2027-03-02', '2027-03-01')), []);
});

test('ymdRange_: 기본 최대 366일, maxDays로 바꿈, 넘으면 Error', () => {
  assert.strictEqual(ctx.ymdRange_('2028-01-01', '2028-12-31').length, 366);
  assert.throws(() => ctx.ymdRange_('2027-01-01', '2028-01-02'));
  assert.strictEqual(ctx.ymdRange_('2027-03-01', '2027-03-07', 7).length, 7);
  assert.throws(() => ctx.ymdRange_('2027-03-01', '2027-03-08', 7));
  assert.throws(() => ctx.ymdRange_('2027-02-30', '2027-03-08'));
  for (const bad of [NaN, '5', 0, -1, 2.5]) assert.throws(() => ctx.ymdRange_('2027-03-01', '2027-03-02', bad), String(bad));
  assert.strictEqual(ctx.ymdRange_('2027-03-01', '2027-03-02', null).length, 2);
});

table('ymdDiffDays_', [
  ['2027-03-01', '2027-03-08', 7], ['2027-03-08', '2027-03-01', -7], ['2026-12-31', '2027-01-01', 1],
  ['2028-02-28', '2028-03-01', 2], ['2027-02-28', '2027-03-01', 1], ['2027-01-01', '2028-01-01', 365]
], ([a, b, want]) => assert.strictEqual(ctx.ymdDiffDays_(a, b), want));

table('hmToMin_·minToHm_: 왕복, 24:00 = 1440', [
  ['00:00', 0], ['00:01', 1], ['11:29', 689], ['11:30', 690], ['18:30', 1110], ['23:50', 1430],
  ['23:59', 1439], ['24:00', 1440]
], ([hm, min]) => {
  assert.strictEqual(ctx.hmToMin_(hm), min);
  assert.strictEqual(ctx.minToHm_(min), hm);
});

table('hmIsValid_: 형식 오류', [
  ['9:00', false], ['09:0', false], ['24:01', false], ['25:00', false], ['12:60', false],
  ['12:30:00', false], ['', false], [null, false], [1830, false], [' 18:30', false],
  ['00:00', true], ['24:00', true], ['23:59', true]
], ([hm, want]) => {
  assert.strictEqual(ctx.hmIsValid_(hm), want);
  if (!want) assert.throws(() => ctx.hmToMin_(hm));
});

test('minToHm_: 범위 밖·소수는 Error', () => {
  for (const v of [-1, 1441, 1.5, NaN, '60']) assert.throws(() => ctx.minToHm_(v), String(v));
});

table('isoLocalSplit_: 초까지 읽고 min은 초를 버린다(11:29:59 < 11:30 마감)', [
  ['2027-03-01T11:29:59', '2027-03-01', 689, 41399],
  ['2027-03-01T11:30:00', '2027-03-01', 690, 41400],
  ['2027-03-01T00:00:00', '2027-03-01', 0, 0],
  ['2027-03-01T23:59:59', '2027-03-01', 1439, 86399],
  ['2027-03-01T11:30', '2027-03-01', 690, 41400],
  ['2027-03-01 11:30:00', '2027-03-01', 690, 41400],
  ['2028-02-29T08:00:00', '2028-02-29', 480, 28800],
  ['2026-12-31T23:59:59', '2026-12-31', 1439, 86399]
], ([iso, date, min, sec]) => {
  assert.deepStrictEqual(plain(ctx.isoLocalSplit_(iso)), { date, min, sec });
});

table('isoLocalSplit_: 잘못된 일시와 시간대가 붙은 값은 Error', [
  '2027-02-29T10:00:00', '2027-03-01T24:00:00', '2027-03-01T12:60:00', '2027-03-01T12:00:60',
  '2027-03-01', '2027-03-01T9:00:00', '2027-03-01T11:30:00Z', '2027-03-01T11:30:00+09:00',
  '2027-03-01T11:30:00.000', '', null
], (iso) => assert.throws(() => ctx.isoLocalSplit_(iso)));
