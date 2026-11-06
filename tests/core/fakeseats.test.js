/** 가짜 좌석 배치(src/dev/FakeSeats.gs) — PRD 2절 숫자 */
const assert = require('assert');
const { test, loadGs, plain, readFile } = require('../helpers/harness');
const checks = require('../helpers/source-checks');

const ctx = loadGs(['src/dev/FakeSeats.gs']);  // 다른 파일 없이 혼자 돈다
const L = plain(ctx.buildFakeSeatLayout_());
const seatsOf = (key, kind) => L.seats.filter((s) => s.spaceKey === key && (!kind || s.kind === kind));

test('공간 7개: 1층 자습실(혼성) + SA1·2(남) + SA3~6(여), key 중복 없음', () => {
  assert.deepStrictEqual(L.spaces.map((s) => s.key), ['1F', 'SA1', 'SA2', 'SA3', 'SA4', 'SA5', 'SA6']);
  assert.deepStrictEqual(L.spaces.map((s) => s.gender), ['혼성', '남', '남', '여', '여', '여', '여']);
  assert.strictEqual(L.spaces[0].name, '1층 자습실');
  for (const s of L.spaces) {
    assert.ok(s.name && s.rows > 0 && s.cols > 0, s.key);
    assert.deepStrictEqual(Object.keys(s).sort(), ['cols', 'gender', 'key', 'name', 'rows']);
  }
});

test('좌석 수: 1층 146, 남 SA1 9·SA2 8(17), 여 SA3 9·SA4 9·SA5 8·SA6 8(34)', () => {
  const want = { '1F': 146, SA1: 9, SA2: 8, SA3: 9, SA4: 9, SA5: 8, SA6: 8 };
  for (const k of Object.keys(want)) assert.strictEqual(seatsOf(k, '좌석').length, want[k], k);
  const byGender = (g) => L.spaces.filter((s) => s.gender === g)
    .reduce((n, s) => n + seatsOf(s.key, '좌석').length, 0);
  assert.strictEqual(byGender('남'), 17);
  assert.strictEqual(byGender('여'), 34);
});

test('1층에 기둥·비상문·창문 칸과 빈칸(seats에 없는 칸)이 있다', () => {
  for (const kind of ['기둥', '비상문', '창문']) assert.ok(seatsOf('1F', kind).length > 0, kind);
  const f = L.spaces[0];
  assert.ok(seatsOf('1F').length < f.rows * f.cols, '빈칸 없음');
});

test('모든 칸: 종류가 정해진 값, 행·열이 격자 안, (공간, 행, 열) 중복 없음', () => {
  const spaces = {};
  for (const s of L.spaces) spaces[s.key] = s;
  const seen = new Set();
  for (const c of L.seats) {
    const sp = spaces[c.spaceKey];
    assert.ok(sp, '없는 공간: ' + c.spaceKey);
    assert.ok(['좌석', '기둥', '비상문', '창문'].includes(c.kind), c.kind);
    assert.ok(Number.isInteger(c.row) && c.row >= 1 && c.row <= sp.rows, c.spaceKey + ' row ' + c.row);
    assert.ok(Number.isInteger(c.col) && c.col >= 1 && c.col <= sp.cols, c.spaceKey + ' col ' + c.col);
    const k = c.spaceKey + '|' + c.row + '|' + c.col;
    assert.ok(!seen.has(k), '중복 칸 ' + k);
    seen.add(k);
  }
});

test('라벨: 좌석은 공간 안에서 비어 있지 않고 겹치지 않음, 좌석이 아닌 칸은 빈 라벨', () => {
  for (const sp of L.spaces) {
    const labels = seatsOf(sp.key, '좌석').map((c) => c.label);
    assert.ok(labels.every((x) => typeof x === 'string' && x !== ''), sp.key);
    assert.strictEqual(new Set(labels).size, labels.length, sp.key + ' 라벨 중복');
  }
  for (const c of L.seats.filter((x) => x.kind !== '좌석')) assert.strictEqual(c.label, '');
});

test('언제 실행해도 같은 결과(새 vm에서 다시 만들어도 같음)', () => {
  assert.strictEqual(JSON.stringify(ctx.buildFakeSeatLayout_()), JSON.stringify(L));
  const again = loadGs(['src/dev/FakeSeats.gs']);
  assert.strictEqual(JSON.stringify(again.buildFakeSeatLayout_()), JSON.stringify(L));
});

test('FakeSeats.gs는 난수·현재 시각·Apps Script 서비스를 쓰지 않는다', () => {
  const src = readFile('src/dev/FakeSeats.gs');
  assert.deepStrictEqual(checks.findImpureCalls(src), []);
  assert.ok(!/Math\s*\.\s*random/.test(src), 'Math.random');
});
