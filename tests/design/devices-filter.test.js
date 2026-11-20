/** T8 기기 행렬: 콘솔 오류 거르기는 하네스(가짜 시계)가 만든 그 문구 하나만 — 다른 오류는 그대로 잡는다 */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { HARNESS_NOISE, isHarnessNoise } = require('../../design/preview/console-filter');

test('기기 행렬 콘솔 거르기: 가짜 시계가 sandbox iframe에서 막힌 문구만 거르고, 다른 오류·비슷한 문구는 남긴다', () => {
  assert.strictEqual(isHarnessNoise(HARNESS_NOISE), true);
  assert.strictEqual(isHarnessNoise(HARNESS_NOISE + ' 덧붙은 말'), true, 'Chromium이 뒤에 덧붙여도');
  for (const other of [
    'Uncaught TypeError: Cannot read properties of undefined',
    "Blocked script execution in 'https://script.google.com/' because the document's frame is sandboxed",   // 다른 프레임
    "Blocked script execution in 'about:srcdoc' because of a CSP",   // 다른 이유
    'x ' + HARNESS_NOISE,   // 앞에 다른 말
    ''
  ]) assert.strictEqual(isHarnessNoise(other), false, other);
});
