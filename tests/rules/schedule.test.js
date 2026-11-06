/** R1 ScheduleRules — 표 형식. PRD 3.3 기본 블록, stage1 4절 d·6번. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

/* PRD 3.3 기본값(금 18:30 시작은 결정 23 ⑦) */
const DEFAULTS = {
  mon_thu: { start: '18:30', end: '23:50' }, fri: { start: '18:30', end: '23:00' },
  sat: { start: '09:00', end: '17:00' }, sun: { start: '14:00', end: '22:00' }
};
function blk(term_type, day_type, seq, start, end, extra) {
  return Object.assign({ term_type, day_type, seq: String(seq), start, end, label: '', status: '',
    updated_at: '2026-11-01T09:00:00' }, extra || {});
}
const BLOCKS = [
  blk('학기', 'mon_thu', 1, '18:00', '20:00'), blk('학기', 'mon_thu', 2, '20:00', '22:00'),
  blk('학기', 'mon_thu', 3, '22:00', '24:00'),
  blk('학기', 'fri', 1, '18:00', '19:30'), blk('학기', 'fri', 2, '19:30', '22:00'), blk('학기', 'fri', 3, '22:00', '23:00'),
  blk('학기', 'sat', 1, '09:00', '12:00'), blk('학기', 'sat', 2, '14:00', '15:30'), blk('학기', 'sat', 3, '15:30', '17:00'),
  blk('학기', 'sun', 1, '14:00', '15:30'), blk('학기', 'sun', 2, '15:30', '17:00'),
  blk('학기', 'sun', 3, '19:00', '20:30'), blk('학기', 'sun', 4, '20:30', '22:00')
];
function plan(ymd, over) {
  return plain(ctx.resolveDayPlan_(ymd, Object.assign({ termType: '학기', daySchedule: null, blocks: BLOCKS, defaults: DEFAULTS }, over || {})));
}
const keys = (p) => p.blocks.map((b) => b.key);
function ds(date, extra) {
  return Object.assign({ date, operating: '', start: '', end: '', day_type: '', memo: '', status: '',
    updated_at: '2026-11-02T10:00:00' }, extra || {});
}

// 2027-03-01 월 … 03-07 일. 2026-12-31 목, 2027-01-01 금, 2028-02-29 화
table('baseDayType_: 월~목 mon_thu, 금 fri, 토 sat, 일 sun', [
  ['2027-03-01', 'mon_thu'], ['2027-03-02', 'mon_thu'], ['2027-03-03', 'mon_thu'], ['2027-03-04', 'mon_thu'],
  ['2027-03-05', 'fri'], ['2027-03-06', 'sat'], ['2027-03-07', 'sun'],
  ['2026-12-31', 'mon_thu'], ['2027-01-01', 'fri'], ['2028-02-29', 'mon_thu']
], ([d, want]) => assert.strictEqual(ctx.baseDayType_(d), want));

table('resolveDayPlan_: 기본 요일별 블록 수 3/3/3/4, 시작·종료는 기본값', [
  ['2027-03-03', 'mon_thu', '18:30', '23:50', ['18:00-20:00', '20:00-22:00', '22:00-24:00'], ['18–20', '20–22', '22–24']],
  ['2027-03-05', 'fri', '18:30', '23:00', ['18:00-19:30', '19:30-22:00', '22:00-23:00'], ['18–19:30', '19:30–22', '22–23']],
  ['2027-03-06', 'sat', '09:00', '17:00', ['09:00-12:00', '14:00-15:30', '15:30-17:00'], ['09–12', '14–15:30', '15:30–17']],
  ['2027-03-07', 'sun', '14:00', '22:00', ['14:00-15:30', '15:30-17:00', '19:00-20:30', '20:30-22:00'],
    ['14–15:30', '15:30–17', '19–20:30', '20:30–22']]
], ([d, type, start, end, k, labels]) => {
  const p = plan(d);
  assert.strictEqual(p.date, d);
  assert.strictEqual(p.operating, true);
  assert.strictEqual(p.dayType, type);
  assert.strictEqual(p.start, start);
  assert.strictEqual(p.end, end);
  assert.deepStrictEqual(keys(p), k);
  assert.deepStrictEqual(p.blocks.map((b) => b.label), labels);
  assert.deepStrictEqual(p.blocks.map((b) => b.seq), k.map((_, i) => i + 1));
  assert.deepStrictEqual(p.warnings, []);
  assert.strictEqual(p.memo, '');
});

test('resolveDayPlan_: 결과 모양(계약 필드), JSON으로 그대로 바뀐다', () => {
  const p = ctx.resolveDayPlan_('2027-03-03', { termType: '학기', daySchedule: null, blocks: BLOCKS, defaults: DEFAULTS });
  assert.deepStrictEqual(Object.keys(p).sort(), ['blocks', 'date', 'dayType', 'end', 'memo', 'operating', 'start', 'warnings']);
  assert.deepStrictEqual(Object.keys(p.blocks[0]).sort(), ['end', 'key', 'label', 'seq', 'start']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p)), plain(p));
});

test('resolveDayPlan_: 블록 행의 label이 있으면 그대로 쓴다', () => {
  const rows = BLOCKS.map((b) => b.day_type === 'mon_thu' && b.seq === '1' ? Object.assign({}, b, { label: '1교시' }) : b);
  assert.strictEqual(plan('2027-03-03', { blocks: rows }).blocks[0].label, '1교시');
});

table('운영 안 하는 날: operating=false, blocks 없음, 메모 유지(가정: 여러 표기)', [
  'FALSE', 'false', 'N', 'n', 'no', 'X', 'x', '×', '0', 'OFF', '아니오', '아니요', '미운영', '운영 안 함', '운영안함',
  '운영X', '휴무', '휴일', false, 0
], (v) => {
  const p = plan('2027-11-17', { daySchedule: ds('2027-11-17', { operating: v, memo: '수능 전일' }) });
  assert.strictEqual(p.operating, false);
  assert.deepStrictEqual(p.blocks, []);
  assert.strictEqual(p.memo, '수능 전일');
  assert.deepStrictEqual(p.warnings, []);
});

table('알 수 없는 운영 값(오타)은 운영 안 함 + 경고(가정: 잘못된 출석부가 조용히 나오지 않게)', [
  '운영함?', 'ㅌ', 'maybe', '2'
], (v) => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { operating: v }) });
  assert.strictEqual(p.operating, false);
  assert.deepStrictEqual(p.blocks, []);
  assert.ok(p.warnings.some((w) => w.indexOf('운영 여부 값을 알 수 없어') >= 0), p.warnings.join('/'));
  assert.strictEqual(ctx.schedOperatingValue_(v), false);
});

test('운영 안 하는 특별 유형 날에는 시작·종료 경고를 내지 않는다', () => {
  const p = plan('2027-11-17', { daySchedule: ds('2027-11-17', { operating: 'FALSE', day_type: '수능전일' }) });
  assert.strictEqual(p.operating, false);
  assert.deepStrictEqual(p.warnings, []);
});

table('운영하는 날로 읽는 값: 빈칸·TRUE·Y·YES·O·1·예·운영', ['', 'TRUE', 'true', 'Y', 'yes', 'O', '1', '예', '운영', ' 운영 ', true, undefined, null], (v) => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { operating: v }) });
  assert.strictEqual(p.operating, true);
  assert.strictEqual(p.blocks.length, 3);
  assert.deepStrictEqual(p.warnings, []);
});

table('날짜별 종료를 당기면 그 시각 이후에 시작하는 블록이 빠진다(가정 d)', [
  ['2027-03-01', '22:00', ['18:00-20:00', '20:00-22:00']],   // 월요일 22:00 종료 → 22–24 사라짐
  ['2027-03-01', '21:59', ['18:00-20:00', '20:00-22:00']],
  ['2027-03-01', '22:01', ['18:00-20:00', '20:00-22:00', '22:00-24:00']],  // 22–24 블록 안에서 끝나면 남는다
  ['2027-03-01', '23:00', ['18:00-20:00', '20:00-22:00', '22:00-24:00']],
  ['2027-03-01', '20:00', ['18:00-20:00']],
  ['2027-03-01', '18:00', []],
  ['2027-03-07', '19:00', ['14:00-15:30', '15:30-17:00']],       // 일요일 19:00 종료 → 19–20:30·20:30–22 빠짐
  ['2027-03-05', '22:00', ['18:00-19:30', '19:30-22:00']]
], ([d, end, want]) => {
  const p = plan(d, { daySchedule: ds(d, { end }) });
  assert.strictEqual(p.end, end);
  assert.deepStrictEqual(keys(p), want);
  assert.deepStrictEqual(p.blocks.map((b) => b.seq), want.map((_, i) => i + 1), 'seq는 1부터 다시');
});

table('시트에서 흔한 시각 표기(초 00, 한 자리 시)도 읽는다', [
  [{ end: '22:00:00' }, '22:00', 2], [{ end: '21:30:00' }, '21:30', 2], [{ end: ' 22:00 ' }, '22:00', 2],
  [{ start: '9:00', day_type: 'sat' }, '17:00', 3]
], ([over, end, n]) => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', over) });
  assert.strictEqual(p.end, end);
  assert.strictEqual(p.blocks.length, n);
  assert.deepStrictEqual(p.warnings, []);
  if (over.start) assert.strictEqual(p.start, '09:00');
});

test('초가 00이 아닌 값·날짜로 바뀐 시각(1899-12-30)은 무시하고 경고', () => {
  for (const v of ['21:30:15', '1899-12-30', '24:00:00x']) {
    const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { end: v }) });
    assert.strictEqual(p.end, '23:50', v);
    assert.strictEqual(p.warnings.length, 1, v);
  }
});

test('날짜별 시작 24:00은 잘못된 값(블록 시작과 같은 규칙)', () => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { start: '24:00' }) });
  assert.strictEqual(p.start, '18:30');
  assert.strictEqual(p.warnings.length, 1);
  const q = plan('2027-03-03', { daySchedule: ds('2027-03-03', { end: '24:00' }) });
  assert.strictEqual(q.end, '24:00');
  assert.deepStrictEqual(q.warnings, []);
});

test('다른 날짜의 일정 행이 넘어오면 무시하고 경고', () => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-04', { operating: 'FALSE' }) });
  assert.strictEqual(p.operating, true);
  assert.strictEqual(p.blocks.length, 3);
  assert.ok(p.warnings.some((w) => w.indexOf('다른 날짜') >= 0));
});

test('기본 요일 유형인데 기본 시각이 없으면 블록 시각을 쓰고 경고', () => {
  const p = plan('2027-03-05', { defaults: { mon_thu: DEFAULTS.mon_thu } });
  assert.strictEqual(p.start, '18:00');
  assert.strictEqual(p.end, '23:00');
  assert.ok(p.warnings.some((w) => w.indexOf('기본 자습 시각이 없어') >= 0));
  assert.strictEqual(plan('2027-03-05', { defaults: undefined }).blocks.length, 3);
});

test('겹치는 블록 행이 시트에 있으면 출석부에는 나오되 경고', () => {
  const rows = BLOCKS.concat([blk('학기', 'mon_thu', 4, '21:00', '23:00')]);
  const p = plan('2027-03-03', { blocks: rows });
  assert.strictEqual(p.blocks.length, 4);
  assert.ok(p.warnings.some((w) => w.indexOf('겹칩니다') >= 0), p.warnings.join('/'));
});

test('방학 블록 행이 모두 잘못되어 학기 블록을 쓰면 그 사실을 경고', () => {
  const rows = BLOCKS.concat([blk('방학', 'mon_thu', 1, '1899-12-30', '1899-12-30')]);
  const p = plan('2027-07-26', { termType: '방학', blocks: rows });
  assert.deepStrictEqual(keys(p), ['18:00-20:00', '20:00-22:00', '22:00-24:00']);
  assert.ok(p.warnings.some((w) => w.indexOf('학기 블록을 썼습니다') >= 0), p.warnings.join('/'));
  assert.deepStrictEqual(plan('2027-07-26', { termType: '방학' }).warnings, []);
});

test('시작 시각만 바꾸면 블록은 그대로(가정 d)', () => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { start: '18:00' }) });
  assert.strictEqual(p.start, '18:00');
  assert.strictEqual(p.end, '23:50');
  assert.strictEqual(p.blocks.length, 3);
  const late = plan('2027-03-03', { daySchedule: ds('2027-03-03', { start: '20:30' }) });
  assert.deepStrictEqual(keys(late), ['18:00-20:00', '20:00-22:00', '22:00-24:00']);
});

table('요일 유형 바꾸기: 그 유형의 블록·기본 시각을 쓴다', [
  ['2027-03-03', 'fri', '18:30', '23:00', 3],   // 수요일을 금요일처럼
  ['2027-03-05', 'mon_thu', '18:30', '23:50', 3],
  ['2027-03-03', 'sun', '14:00', '22:00', 4],
  ['2027-03-07', 'sat', '09:00', '17:00', 3]
], ([d, type, start, end, n]) => {
  const p = plan(d, { daySchedule: ds(d, { day_type: type }) });
  assert.strictEqual(p.dayType, type);
  assert.strictEqual(p.start, start);
  assert.strictEqual(p.end, end);
  assert.strictEqual(p.blocks.length, n);
});

test('특별 요일 유형: 그 유형 블록을 쓰고, 기본값이 없으면 블록 처음·끝을 시작·종료로', () => {
  const rows = BLOCKS.concat([blk('학기', 'exam', 1, '13:00', '15:00'), blk('학기', 'exam', 2, '15:00', '17:00')]);
  const p = plan('2027-03-03', { blocks: rows, daySchedule: ds('2027-03-03', { day_type: 'exam' }) });
  assert.strictEqual(p.dayType, 'exam');
  assert.deepStrictEqual(keys(p), ['13:00-15:00', '15:00-17:00']);
  assert.strictEqual(p.start, '13:00');
  assert.strictEqual(p.end, '17:00');
  assert.deepStrictEqual(p.warnings, []);
  const q = plan('2027-03-03', { blocks: rows, daySchedule: ds('2027-03-03', { day_type: 'exam', end: '15:00' }) });
  assert.deepStrictEqual(keys(q), ['13:00-15:00']);
});

test('블록이 없는 특별 유형: 빈 블록 + 경고(출석부 생성은 멈추지 않음)', () => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { day_type: 'none_such' }) });
  assert.deepStrictEqual(p.blocks, []);
  assert.ok(p.warnings.some((w) => w.indexOf('블록이 없습니다') >= 0), p.warnings.join('/'));
  assert.ok(p.warnings.some((w) => w.indexOf('시작·종료') >= 0), p.warnings.join('/'));
});

test('방학 블록이 없으면 학기 블록 사용(가정)', () => {
  const p = plan('2027-07-26', { termType: '방학' });
  assert.deepStrictEqual(keys(p), ['18:00-20:00', '20:00-22:00', '22:00-24:00']);
});

test('방학 블록이 있으면 그것만 쓴다(학기 블록과 섞지 않음)', () => {
  const rows = BLOCKS.concat([blk('방학', 'mon_thu', 1, '09:00', '12:00'), blk('방학', 'mon_thu', 2, '13:00', '17:00')]);
  assert.deepStrictEqual(keys(plan('2027-07-26', { termType: '방학', blocks: rows })), ['09:00-12:00', '13:00-17:00']);
  assert.deepStrictEqual(keys(plan('2027-03-03', { termType: '학기', blocks: rows })), ['18:00-20:00', '20:00-22:00', '22:00-24:00']);
  // 방학 월~목은 있고 토요일 블록은 없으면 토요일만 학기 블록
  assert.deepStrictEqual(keys(plan('2027-07-31', { termType: '방학', blocks: rows })), ['09:00-12:00', '14:00-15:30', '15:30-17:00']);
});

test('방학 블록이 모두 취소되었으면 학기 블록 사용(가정)', () => {
  const rows = BLOCKS.concat([blk('방학', 'mon_thu', 1, '09:00', '12:00', { status: '취소' })]);
  assert.deepStrictEqual(keys(plan('2027-07-26', { termType: '방학', blocks: rows })), ['18:00-20:00', '20:00-22:00', '22:00-24:00']);
});

test('취소된 블록은 빠지고, 같은 순서가 둘이면 updated_at 최신 것 + 경고', () => {
  const rows = BLOCKS.filter((b) => !(b.day_type === 'mon_thu' && b.seq === '2')).concat([
    blk('학기', 'mon_thu', 2, '20:00', '22:00', { status: '취소' }),
    blk('학기', 'mon_thu', 2, '20:00', '21:30', { updated_at: '2026-11-01T09:00:00' }),
    blk('학기', 'mon_thu', 2, '20:00', '22:00', { updated_at: '2026-11-03T09:00:00' })
  ]);
  const p = plan('2027-03-03', { blocks: rows });
  assert.deepStrictEqual(keys(p), ['18:00-20:00', '20:00-22:00', '22:00-24:00']);
  assert.ok(p.warnings.some((w) => w.indexOf('같은 순서') >= 0));
  const onlyCancelled = BLOCKS.map((b) => b.day_type === 'mon_thu' && b.seq === '3' ? Object.assign({}, b, { status: ' 취소 ' }) : b);
  assert.deepStrictEqual(keys(plan('2027-03-03', { blocks: onlyCancelled })), ['18:00-20:00', '20:00-22:00']);
});

test('블록 행 순서가 뒤섞여 있어도 시작 시각 순으로 나온다', () => {
  const rows = BLOCKS.slice().reverse();
  assert.deepStrictEqual(keys(plan('2027-03-07', { blocks: rows })), ['14:00-15:30', '15:30-17:00', '19:00-20:30', '20:30-22:00']);
});

test('잘못된 블록 행은 건너뛰고 경고', () => {
  const rows = BLOCKS.concat([blk('학기', 'mon_thu', 4, '24:00', '24:00'), blk('학기', 'mon_thu', 5, '9:0', '10:00'),
    blk('학기', 'mon_thu', 0, '08:00', '09:00'), blk('학기', 'mon_thu', 6, '17:00', '16:00')]);
  const p = plan('2027-03-03', { blocks: rows });
  assert.strictEqual(p.blocks.length, 3);
  assert.strictEqual(p.warnings.filter((w) => w.indexOf('잘못된 블록') >= 0).length, 4);
});

test('날짜별 일정의 잘못된 시각은 무시하고 기본값 + 경고', () => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { end: '25:00', start: '6시' }) });
  assert.strictEqual(p.end, '23:50');
  assert.strictEqual(p.start, '18:30');
  assert.strictEqual(p.warnings.length, 2);
  const q = plan('2027-03-03', { daySchedule: ds('2027-03-03', { start: '23:00', end: '22:00' }) });
  assert.ok(q.warnings.some((w) => w.indexOf('늦습니다') >= 0));
});

test('취소된 날짜별 일정을 넘겨도 무시한다', () => {
  const p = plan('2027-03-03', { daySchedule: ds('2027-03-03', { operating: 'N', status: '취소' }) });
  assert.strictEqual(p.operating, true);
  assert.strictEqual(p.blocks.length, 3);
});

test('resolveDayPlan_: 잘못된 날짜는 Error, termType 빈칸은 학기', () => {
  assert.throws(() => ctx.resolveDayPlan_('2027-02-29', { blocks: BLOCKS, defaults: DEFAULTS }));
  assert.strictEqual(plain(ctx.resolveDayPlan_('2027-03-03', { blocks: BLOCKS, defaults: DEFAULTS })).blocks.length, 3);
});

test('윤년·연말 날짜도 요일대로 계산', () => {
  assert.strictEqual(plan('2028-02-29').dayType, 'mon_thu');
  assert.strictEqual(plan('2026-12-31').blocks.length, 3);
  assert.strictEqual(plan('2027-01-01').dayType, 'fri');
  assert.strictEqual(plan('2027-01-03').blocks.length, 4);
});

/* ───── pickDaySchedule_ ───── */

test('pickDaySchedule_: 취소 제외, 같은 날짜면 updated_at 최신(같으면 아래 행)', () => {
  const rows = [
    ds('2027-03-03', { memo: 'a', updated_at: '2026-11-02T10:00:00' }),
    ds('2027-03-03', { memo: 'b', updated_at: '2026-11-05T10:00:00' }),
    ds('2027-03-03', { memo: 'c', updated_at: '2026-11-09T10:00:00', status: '취소' }),
    ds('2027-03-04', { memo: 'd', updated_at: '2026-11-09T10:00:00' }),
    ds('2027-03-03', { memo: 'e', updated_at: '2026-11-04T10:00:00' })
  ];
  assert.strictEqual(ctx.pickDaySchedule_(rows, '2027-03-03').memo, 'b');
  assert.strictEqual(ctx.pickDaySchedule_(rows, '2027-03-04').memo, 'd');
  assert.strictEqual(ctx.pickDaySchedule_(rows, '2027-03-05'), null);
  assert.strictEqual(ctx.pickDaySchedule_([], '2027-03-05'), null);
  assert.strictEqual(ctx.pickDaySchedule_(null, '2027-03-05'), null);
  const tie = [ds('2027-03-03', { memo: 'x' }), ds('2027-03-03', { memo: 'y' })];
  assert.strictEqual(ctx.pickDaySchedule_(tie, '2027-03-03').memo, 'y');
  const allCancelled = [ds('2027-03-03', { status: '취소' })];
  assert.strictEqual(ctx.pickDaySchedule_(allCancelled, '2027-03-03'), null);
});

/* ───── validateBlocks_ ───── */

test('validateBlocks_: 기본 블록은 문제 없음', () => {
  assert.deepStrictEqual(plain(ctx.validateBlocks_(BLOCKS)), []);
  assert.deepStrictEqual(plain(ctx.validateBlocks_([])), []);
  assert.deepStrictEqual(plain(ctx.validateBlocks_(null)), []);
});

table('validateBlocks_: 형식 오류와 겹침을 행 위치와 함께 찾는다', [
  // [행들, 문제가 있는 index 목록, 메시지에 들어갈 낱말]
  [[blk('학기', 'mon_thu', 1, '18:00', '20:00'), blk('학기', 'mon_thu', 2, '19:00', '22:00')], [1], '겹칩니다'],
  [[blk('학기', 'mon_thu', 1, '18:00', '20:00'), blk('학기', 'mon_thu', 1, '20:00', '22:00')], [1], '순서 1'],
  [[blk('학기', 'mon_thu', 1, '20:00', '18:00')], [0], '앞이어야'],
  [[blk('학기', 'mon_thu', 1, '20:00', '20:00')], [0], '앞이어야'],
  [[blk('학기', 'mon_thu', 1, '8:0', '10:00')], [0], '시작 시각'],
  [[blk('학기', 'mon_thu', 1, '1899-12-30', '1899-12-30')], [0], '시작 시각'],
  [[blk('', 'mon_thu', 1, '18:00', '20:00')], [0], '기간 유형'],
  [[blk('여름방학', 'mon_thu', 1, '18:00', '20:00')], [0], '기간 유형'],
  [[blk('학기', '', 1, '18:00', '20:00')], [0], '요일 유형'],
  // 순서가 잘못된 행도 시각이 맞으면 겹침을 함께 알려 준다
  [[blk('학기', 'mon_thu', 1, '18:00', '20:00'), blk('학기', 'mon_thu', '', '19:00', '21:00')], [1], '겹칩니다'],
  [[blk('학기', 'mon_thu', 1, '24:00', '24:00')], [0], '시작 시각'],
  [[blk('학기', 'mon_thu', 1, '22:00', '24:30')], [0], '끝 시각'],
  [[blk('학기', 'mon_thu', 0, '18:00', '20:00')], [0], '순서는'],
  [[blk('학기', 'mon_thu', 'a', '18:00', '20:00')], [0], '순서는'],
  [[blk('학기', 'mon_thu', 1.5, '18:00', '20:00')], [0], '순서는'],
  [[blk('학기', 'mon_thu', 2, '18:00', '20:00'), blk('학기', 'mon_thu', 1, '20:00', '22:00')], [1], '시각 순서'],
  // 한 블록이 다른 블록을 감싸는 겹침
  [[blk('학기', 'sun', 1, '14:00', '22:00'), blk('학기', 'sun', 2, '15:30', '17:00'), blk('학기', 'sun', 3, '19:00', '20:30')], [1, 2], '겹칩니다']
], ([rows, idx, word]) => {
  const errs = plain(ctx.validateBlocks_(rows));
  assert.deepStrictEqual([...new Set(errs.map((e) => e.index))], idx, JSON.stringify(errs));
  assert.ok(errs.some((e) => e.message.indexOf(word) >= 0), JSON.stringify(errs));
});

test('validateBlocks_: 끝과 시작이 맞닿은 것은 겹침이 아니고, 다른 요일·기간 유형끼리는 비교하지 않는다', () => {
  const rows = [blk('학기', 'mon_thu', 1, '18:00', '20:00'), blk('학기', 'mon_thu', 2, '20:00', '22:00'),
    blk('학기', 'fri', 1, '18:00', '20:00'), blk('방학', 'mon_thu', 1, '18:00', '20:00')];
  assert.deepStrictEqual(plain(ctx.validateBlocks_(rows)), []);
});

test('validateBlocks_: 취소된 행은 검사하지 않는다(취소된 행과 겹쳐도 됨)', () => {
  const rows = [blk('학기', 'mon_thu', 1, '18:00', '20:00'), blk('학기', 'mon_thu', 1, '19:00', '21:00', { status: '취소' }),
    blk('학기', 'mon_thu', 2, 'xx', '', { status: '취소' })];
  assert.deepStrictEqual(plain(ctx.validateBlocks_(rows)), []);
});
