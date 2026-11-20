/** T8 기기 행렬 '줄 너무 김': 45em과 760px 중 작은 값을 넘는 한 줄만 실패 */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { lineLimitPx, longLines } = require('../../design/preview/line-length');

test('줄 길이 판정: 18px 글은 760px까지(45em=810보다 작은 쪽), 14px 글은 630px(45em)까지 — 1093px 한 줄은 실패, 720px 판은 통과', () => {
  assert.deepStrictEqual([lineLimitPx(18), lineLimitPx(14)], [760, 630]);
  assert.deepStrictEqual(longLines([{ what: 'p "긴 줄"', linePx: 1061, fontPx: 18 }]), ['p "긴 줄" 1061px>760px'], '화면 끝까지 가는 한 줄');
  assert.deepStrictEqual(longLines([{ what: 'p', linePx: 720, fontPx: 18 }, { what: 'li', linePx: 760, fontPx: 18 }]), [], '720px 판·딱 한계는 통과');
  assert.deepStrictEqual(longLines([{ what: '.muted', linePx: 700, fontPx: 14 }]).length, 1, '작은 글은 45em이 먼저 걸린다');
});
