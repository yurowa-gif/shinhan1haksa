/** C0 인쇄 스파이크의 순수 함수(src/dev/PrintSpike.gs). 시트·Drive는 편집기에서 선생님이 확인한다. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/dev/FakeData.gs', 'src/dev/FakeSeats.gs', 'src/dev/PrintSpike.gs']);
const model = plain(ctx.spikeBuildModel_());

test('스파이크 모델: 1층 146석, 4블록, 12열×20행, 실행마다 같다', () => {
  assert.strictEqual(model.seatCount, 146);
  assert.strictEqual(model.blocks.length, 4);
  assert.strictEqual(model.cols, 12);
  assert.strictEqual(model.rows, 20);
  assert.deepStrictEqual(plain(ctx.spikeBuildModel_()), model);
  const seats = model.cells.filter((c) => c.kind === '좌석');
  assert.strictEqual(seats.length, 146);
  for (const s of seats) assert.strictEqual(s.marks.length, 4, '좌석마다 블록 칸 4개');
});

test('스파이크 모델: 이름은 가짜 학생 30명을 반복해서 쓴다(새 인물 없음)', () => {
  const fake = new Set(plain(ctx.buildFakeData_({}).students).map((s) => s.grade + '. ' + s.name));
  for (const c of model.cells.filter((x) => x.kind === '좌석')) assert.ok(fake.has(c.display), c.display);
});

test('A안 HTML: A4 가로 @page, 좌석 146개, 표 기반(flex·grid 없음)', () => {
  const html = ctx.spikeBuildHtml_(model);
  assert.ok(html.includes('size: A4 landscape'));
  assert.strictEqual(html.split('font-weight:bold;font-size:8pt').length - 1, 146);
  assert.ok(!/display\s*:\s*(flex|grid)/.test(html));
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes('2027년 3월 3일(수)'));
});

test('A안 HTML: 이름의 <script>와 &는 이스케이프된다(나쁜 입력)', () => {
  const bad = plain(model);
  bad.cells.find((c) => c.kind === '좌석').display = '1. <script>x</script>&';
  const html = ctx.spikeBuildHtml_(bad);
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;&amp;'));
});

test('B안 시트 값: 머리말 1줄 + 20행 × 12열, 좌석 칸은 3줄 글자', () => {
  const b = plain(ctx.spikeBuildSheetValues_(model));
  assert.strictEqual(b.values.length, 21);
  for (const row of b.values) assert.strictEqual(row.length, 12);
  let seats = 0;
  for (let i = 1; i < b.values.length; i++) {
    for (let j = 0; j < 12; j++) {
      if (b.kinds[i][j] === '좌석') {
        seats++;
        assert.strictEqual(b.values[i][j].split('\n').length, 3, '이름 / 블록 / 빈 줄');
      }
    }
  }
  assert.strictEqual(seats, 146);
});
