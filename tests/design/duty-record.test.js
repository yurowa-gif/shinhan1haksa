/** D7: 월말 근무 기록표 렌더러(printRenderDutyRecord_) — 합계는 칸에서 센다, 이스케이프, 월 경계, 이상한 입력 */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');
const { buildModel } = require('../../design/preview/duty-record-fixture');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/DutyRecordHtml.gs']);
const clone = (x) => JSON.parse(JSON.stringify(x));
const render = (m) => ctx.printRenderDutyRecord_(clone(m), {});
const count = (s, sub) => s.split(sub).length - 1;

test('기록표 합계는 칸에서 센다: 근무 = 21:30 + 23:00 + 단독, 예비 지정은 따로(D6 시안과 같은 숫자)', () => {
  const c = JSON.parse(JSON.stringify(ctx.printDutyRecordCounts_(buildModel())));
  assert.deepStrictEqual(c.rows.map((r) => [r.name, r.work, r.s2130, r.s2300, r.solo, r.standby]),
    [['박선생', 8, 3, 3, 2, 2], ['김선생', 8, 3, 3, 2, 2], ['이선생', 7, 3, 3, 1, 2], ['최선생', 9, 3, 3, 3, 1], ['정선생', 8, 3, 3, 2, 2], ['한선생', 8, 3, 3, 2, 2]]);
  assert.deepStrictEqual(c.total, { work: 48, s2130: 18, s2300: 18, solo: 12, standby: 11 });
  c.rows.forEach((r) => assert.strictEqual(r.work, r.s2130 + r.s2300 + r.solo));
  assert.strictEqual(c.total.work, c.rows.reduce((n, r) => n + r.work, 0));
  assert.strictEqual(Object.keys(c.byDay).reduce((n, d) => n + c.byDay[d], 0), c.total.work, '날짜별 합계의 합 = 근무 합계');
});

test('기록표 HTML: 교사별 합계·합계 줄·교대 3건·열 머리·만든 시각이 있고, 칸을 자르지 않는다', () => {
  const html = render(buildModel());
  ['박선생', '최선생', '합계', '예비 지정', '단독', '교대 3건', '대신 근무', '만든 시각 2027-03-31 18:20', '그 달 마지막 변경 2027-03-20 21:05', '2027년 3월'].forEach((t) => assert.ok(html.indexOf(t) > 0, t));
  assert.ok(html.indexOf('이선생 → <b>최선생</b>') > 0);
  assert.strictEqual(count(html, '*</td>'), 3, '교대·대신 근무로 실제 근무자가 된 칸(*)은 교대 수와 같다');
  assert.ok(html.indexOf('overflow:hidden') < 0 && !/flex|grid|@import|url\(|<script/.test(html));
  assert.ok(html.indexOf('undefined') < 0 && html.indexOf('NaN') < 0 && html.indexOf('null') < 0);
  assert.strictEqual(count(html, '<th scope="row"'), 7, '교사 6 + 합계');
});

test('기록표 월 경계: 28일(2월)·31일(3월) 열 수, 윤년 29일, 월 형식이 틀리면 오류', () => {
  const colCount = (month) => count(render({ month, teachers: [{ name: '가', cells: {} }] }), '<col style="width:') - 6;   // 이름 1 + 합계 5 제외하면 날짜 열
  assert.strictEqual(colCount('2027-02'), 28 + 0);
  assert.strictEqual(colCount('2027-03'), 31);
  assert.strictEqual(colCount('2028-02'), 29);
  ['2027-13', '2027/03', '', undefined, '2027-3'].forEach((m) => assert.throws(() => render({ month: m, teachers: [] }), /근무 기록표 월 형식/));
  assert.throws(() => ctx.printRenderDutyRecord_(null, {}), /모델이 없습니다/);
});

test('기록표 이스케이프·이상한 입력: 이름·사유의 <script>·따옴표, 알 수 없는 칸 값·이 달 밖 날짜는 세지 않고 경고, 교사 없음 안내', () => {
  const m = buildModel();
  m.title = '<b>제목</b>"&';
  m.teachers[0].name = '<script>alert(1)</script>';
  m.teachers[1].cells['2027-03-05'] = '야간';
  m.teachers[1].cells['2027-04-01'] = '21:30';
  m.swaps[0].to = '"><img src=x>';
  const html = render(m);
  assert.ok(html.indexOf('<script>') < 0 && html.indexOf('<img') < 0 && html.indexOf('<b>제목') < 0);
  assert.ok(html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') > 0 && html.indexOf('&quot;&gt;&lt;img') > 0);
  assert.ok(html.indexOf('알 수 없는 칸 값 또는 이 달 밖 날짜 2개는 세지 않았습니다') > 0);
  assert.strictEqual(ctx.printDutyRecordCounts_(m).unknown, 2);
  const empty = render({ month: '2027-03', teachers: [], swaps: [] });
  assert.ok(empty.indexOf('이 달 근무 기록이 없습니다') > 0 && empty.indexOf('이 달 교대가 없습니다') > 0);
  assert.ok(render({ month: '2027-03' }).indexOf('이 달 근무 기록이 없습니다') > 0, 'teachers 없음');
});

test('기록표 순수: 같은 입력은 같은 출력이고 모델을 바꾸지 않으며, 운영 안 하는 날은 회색·— 로 표시', () => {
  const m = buildModel();
  const before = JSON.stringify(m);
  const a = ctx.printRenderDutyRecord_(m, {});
  assert.strictEqual(JSON.stringify(m), before);
  assert.strictEqual(a, ctx.printRenderDutyRecord_(clone(m), {}));
  assert.ok(a.indexOf('—') > 0 && a.indexOf('background:#c8c8c8') > 0);
  assert.ok(a.indexOf('@page { size: A4 landscape') > 0);
});
