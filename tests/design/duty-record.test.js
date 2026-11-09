/** D7: 월말 근무 기록표 렌더러(printRenderDutyRecord_) — 합계는 칸에서 센다, 그려진 HTML 칸을 읽어 센 값과 맞춘다, 이스케이프, 월 경계, 이상한 입력 */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');
const { buildModel } = require('../../design/preview/duty-record-fixture');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/DutyRecordHtml.gs']);
const clone = (x) => JSON.parse(JSON.stringify(x));
const render = (m) => ctx.printRenderDutyRecord_(clone(m), {});
const counts = (m) => JSON.parse(JSON.stringify(ctx.printDutyRecordCounts_(clone(m))));
const count = (s, sub) => s.split(sub).length - 1;
const dateOf = (n) => '2027-03-' + (n < 10 ? '0' : '') + n;

/** 기록표 표(<tbody>)를 읽는다: 행마다 {name, cells:[날짜 칸 글자('|'로 줄바꿈 표시)], sums:[근무, 21:30, 23:00, 단독, 예비 지정]} */
function readGrid(html) {
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  return body.split('<tr').slice(1).map((tr) => {
    const cells = [...tr.matchAll(/<(th|td)[^>]*>(.*?)<\/\1>/g)].map((m) => m[2].replace(/<br>/g, '|'));
    return { name: cells[0], cells: cells.slice(1, -5), sums: cells.slice(-5).map((x) => (x === '—' ? x : Number(x))) };
  });
}

/** 모델에서 칸 글자를 따로 계산한다(렌더러 코드를 다시 쓰지 않고 규칙만): 코드('조' 뗌, 단 = 단독) + 예, 교대로 바뀐 칸은 * */
function expectedCell(m, teacher, dateStr) {
  const parts = [];
  const raw = teacher.cells[dateStr];
  [].concat(raw === undefined ? [] : raw).forEach((x) => {
    let c = String(x).replace(/[*\s]/g, '').replace(/조$/, '');
    if (c === '단') c = '단독';
    if (!['21:30', '23:00', '단독'].includes(c)) { parts.push('?'); return; }
    const star = m.swaps.some((w) => w.date === dateStr && w.to === teacher.name && String(w.slot).replace(/조$/, '') === c);
    parts.push(c + (star ? '*' : ''));
  });
  if ((teacher.standby || []).includes(dateStr)) parts.push('예' + (m.swaps.some((w) => w.date === dateStr && w.to === teacher.name && w.slot === '예비') ? '*' : ''));
  return parts.join('|');
}

test('기록표 합계는 칸에서 센다: 근무 = 21:30 + 23:00 + 단독, 예비 지정은 따로(D6 시안과 같은 숫자)', () => {
  const c = counts(buildModel());
  assert.deepStrictEqual(c.rows.map((r) => [r.name, r.work, r.s2130, r.s2300, r.solo, r.standby]),
    [['박선생', 8, 3, 3, 2, 2], ['김선생', 8, 3, 3, 2, 2], ['이선생', 7, 3, 3, 1, 2], ['최선생', 9, 3, 3, 3, 1], ['정선생', 8, 3, 3, 2, 2], ['한선생', 8, 3, 3, 2, 2]]);
  assert.deepStrictEqual(c.total, { work: 48, s2130: 18, s2300: 18, solo: 12, standby: 11 });
  assert.strictEqual(Object.keys(c.byDay).reduce((n, d) => n + c.byDay[d], 0), 48, '날짜별 합계의 합 = 근무 합계');
});

test('그려진 HTML 칸을 읽어 센 값과 맞춘다: 교사 줄·합계 줄·날짜별 합 = 근무 합계, 칸 글자는 모델에서 따로 계산한 값과 같다(21:30·23:00 횟수가 다른 교사, 같은 날 두 조 포함)', () => {
  const m = buildModel();
  // 박선생에게 3/24(수)에 두 조를 모두 맡기고(둘 다 센다), 3/25 한 조를 더 얹어 21:30 ≠ 23:00 횟수가 되게 한다
  m.teachers[0].cells[dateOf(24)] = ['21:30조', '23:00조'];
  m.teachers[0].cells[dateOf(25)] = ['21:30조'];
  const c = counts(m);
  assert.deepStrictEqual([c.rows[0].s2130, c.rows[0].s2300], [5, 4], '박선생 21:30 3 + 3/24 + 3/25 = 5, 23:00 3 + 3/24 = 4 (3/24·3/25의 다른 교사 칸은 그대로여서 그날 근무가 겹쳐 센다)');
  const grid = readGrid(render(m));
  assert.strictEqual(grid.length, 7);
  m.teachers.forEach((t, i) => {
    const row = grid[i];
    assert.strictEqual(row.name, t.name);
    for (let d = 1; d <= 31; d++) assert.strictEqual(row.cells[d - 1], expectedCell(m, t, dateOf(d)), t.name + ' ' + d + '일 칸');
    const r = c.rows[i];
    assert.deepStrictEqual(row.sums, [r.work, r.s2130, r.s2300, r.solo, r.standby], t.name + ' 합계 칸');
    const worked = row.cells.reduce((n, x) => n + x.split('|').filter((p) => /^(21:30|23:00|단독)\*?$/.test(p)).length, 0);
    assert.strictEqual(worked, r.work, t.name + ': 칸에 보이는 근무 코드 수 = 근무 합계');
    const stood = row.cells.reduce((n, x) => n + x.split('|').filter((p) => /^예\*?$/.test(p)).length, 0);
    assert.strictEqual(stood, r.standby, t.name + ': 칸의 "예" 수 = 예비 지정');
  });
  const total = grid[6];
  assert.strictEqual(total.name, '합계');
  assert.deepStrictEqual(total.sums, [c.total.work, c.total.s2130, c.total.s2300, c.total.solo, c.total.standby]);
  total.cells.forEach((x, i) => assert.strictEqual(x, (c.byDay[dateOf(i + 1)] || 0) === 0 && dateOf(i + 1) === '2027-03-02' ? '—' : String(c.byDay[dateOf(i + 1)] || 0), (i + 1) + '일 합계 칸'));
  assert.strictEqual(total.cells.filter((x) => x !== '—').reduce((n, x) => n + Number(x), 0), total.sums[0], '합계 줄 날짜 칸의 합 = 근무 합계');
  assert.strictEqual(grid.slice(0, 6).reduce((n, r) => n + r.sums[0], 0), total.sums[0], '교사 줄 근무의 합 = 합계 줄');
});

test('칸 값 읽기: 저장한 그대로("21:30조")·옛 표기("단")·하나만 준 값, 알 수 없는 값은 ?로 보이고 세지 않으며 경고, 예비 칸 교대는 "예*"', () => {
  const m = { month: '2027-03', teachers: [
    { name: '가', cells: { '2027-03-01': ['21:30조'], '2027-03-05': '단', '2027-03-06': ['23:00 조'], '2027-03-07': ['야간'], '2027-04-01': ['21:30조'] }, standby: ['2027-03-12', '2027-03-12', '2027-05-01'] },
    { name: '나', cells: {}, standby: ['2027-03-13'] }], swaps: [{ date: '2027-03-13', slot: '예비', from: '다', to: '나', kind: '교대' }, { date: '2027-03-01', slot: '21:30조', from: '다', to: '가', kind: '교대' }] };
  const c = counts(m);
  assert.deepStrictEqual(c.rows.map((r) => [r.work, r.s2130, r.s2300, r.solo, r.standby]), [[3, 1, 1, 1, 1], [0, 0, 0, 0, 1]]);
  assert.strictEqual(c.unknown, 3, '알 수 없는 값 1 + 이 달 밖 근무 1 + 이 달 밖 예비 1');
  const html = render(m);
  const grid = readGrid(html);
  assert.strictEqual(grid[0].cells[0], '21:30*');
  assert.strictEqual(grid[0].cells[4], '단독');
  assert.strictEqual(grid[0].cells[5], '23:00');
  assert.strictEqual(grid[0].cells[6], '?');
  assert.strictEqual(grid[0].cells[11], '예', '같은 날짜를 두 번 줘도 예비 한 번');
  assert.strictEqual(grid[1].cells[12], '예*');
  assert.ok(html.indexOf('알 수 없는 칸 값 또는 이 달 밖 날짜 3개는 세지 않았습니다') > 0);
  assert.ok(html.indexOf('예비 칸끼리 바꾼 날은 &quot;예*&quot;') > 0);
});

test('운영 안 하는 날에 근무가 있으면 — 대신 숫자를 찍고 그날 이름을 경고하며, 근무가 없는 운영 안 함 날만 —', () => {
  const m = buildModel();
  m.teachers[0].cells['2027-03-02'] = ['23:00조'];
  m.teachers[1].cells['2027-03-02'] = ['21:30조'];
  const html = render(m);
  const grid = readGrid(html);
  assert.strictEqual(grid[6].cells[1], '2');
  assert.strictEqual(grid[6].cells.filter((x) => x === '—').length, 0);
  assert.ok(html.indexOf('운영 안 하는 날(2027년 3월 2일(화))에 근무가 기록되어 있습니다: 박선생, 김선생') > 0);
  assert.strictEqual(grid[6].cells.filter((x) => x !== '—').reduce((n, x) => n + Number(x), 0), grid[6].sums[0], '날짜별 합 = 총합');
  assert.strictEqual(readGrid(render(buildModel()))[6].cells[1], '—');
  assert.ok(render(buildModel()).indexOf('근무가 기록되어 있습니다') < 0);
});

test('기록표 HTML: 머리말 줄에 시각, 열 머리, 교대 목록(구분 칸)·단 수, 칸을 자르지 않음', () => {
  const html = render(buildModel());
  ['2027년 3월', '만든 시각 2027-03-31 18:20', '그 달 마지막 변경 2027-03-20 21:05', '예비 지정', '단독', '교대 3건', '대신 근무'].forEach((t) => assert.ok(html.indexOf(t) > 0, t));
  assert.ok(html.indexOf('이선생 → <b>최선생</b>') > 0 && html.indexOf('한선생 → <b>김선생</b>') > 0);
  assert.ok(html.indexOf('overflow:hidden') < 0 && !/flex|grid|@import|url\(|<script/.test(html));
  assert.ok(html.indexOf('undefined') < 0 && html.indexOf('NaN') < 0 && html.indexOf('null') < 0);
  const swapCols = (n) => {
    const m = buildModel();
    m.swaps = Array.from({ length: n }, (_, i) => ({ date: dateOf(i + 1), slot: '단독', from: '가', to: '나', kind: '교대' }));
    return count(render(m), '<thead><tr style="background:#e6e6e6">');
  };
  assert.deepStrictEqual([swapCols(1), swapCols(6), swapCols(7), swapCols(14), swapCols(15), swapCols(30)], [1, 1, 2, 2, 3, 3], '교대 건수에 따라 1~3단');
  const m30 = buildModel();
  m30.swaps = Array.from({ length: 30 }, (_, i) => ({ date: dateOf((i % 28) + 1), slot: '단독', from: '가', to: '나', kind: '교대' }));
  assert.strictEqual(count(render(m30), '교대</td>'), 30, '교대 30건이 모두 나온다');
});

test('기록표 월 경계: 28일(2월)·31일(3월)·29일(윤년) 열 수, 월 형식이 틀리면 오류', () => {
  const colCount = (month) => count(render({ month, teachers: [{ name: '가', cells: {} }] }), '<col style="width:') - 6;   // 이름 1 + 합계 5 제외하면 날짜 열
  assert.strictEqual(colCount('2027-02'), 28);
  assert.strictEqual(colCount('2027-03'), 31);
  assert.strictEqual(colCount('2028-02'), 29);
  ['2027-13', '2027/03', '', undefined, '2027-3'].forEach((m) => assert.throws(() => render({ month: m, teachers: [] }), /근무 기록표 월 형식/));
  assert.throws(() => ctx.printRenderDutyRecord_(null, {}), /모델이 없습니다/);
});

test('기록표 이스케이프·이상한 입력: 이름·교대자의 <script>·따옴표, 교사 없음 안내, 순수(같은 입력 같은 출력·모델 불변)', () => {
  const m = buildModel();
  m.title = '<b>제목</b>"&';
  m.teachers[0].name = '<script>alert(1)</script>';
  m.swaps[0].to = '"><img src=x>';
  const before = JSON.stringify(m);
  const html = ctx.printRenderDutyRecord_(m, {});
  assert.strictEqual(JSON.stringify(m), before);
  assert.strictEqual(html, ctx.printRenderDutyRecord_(clone(m), {}));
  assert.ok(html.indexOf('<script>') < 0 && html.indexOf('<img') < 0 && html.indexOf('<b>제목') < 0);
  assert.ok(html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') > 0 && html.indexOf('&quot;&gt;&lt;img') > 0);
  const empty = render({ month: '2027-03', teachers: [], swaps: [] });
  assert.ok(empty.indexOf('이 달 근무 기록이 없습니다') > 0 && empty.indexOf('이 달 교대가 없습니다') > 0);
  assert.ok(render({ month: '2027-03' }).indexOf('이 달 근무 기록이 없습니다') > 0, 'teachers 없음');
  assert.ok(html.indexOf('@page { size: A4 landscape') > 0);
});
