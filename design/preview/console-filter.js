/**
 * 기기 행렬(devices.js)의 콘솔 오류 중 **하네스가 만든 것**만 가려낸다(의존성 없음 — tests/design/devices-filter.test.js가 검사).
 * Playwright page.clock.install(가짜 시계)은 모든 프레임에 스크립트를 넣는다. 출석부 인쇄 미리보기 iframe은
 * sandbox="allow-same-origin"(스크립트 금지)이라 그 주입이 막히며 이 문구가 찍힌다. 서버가 주는 미리보기 HTML에는 <script>가 없고,
 * 실제 브라우저(가짜 시계 없음)에서는 나지 않는다(빈 페이지 재현: 시계 없이 0건, clock.install만 넣으면 1건).
 * 문구 전체를 앞에서부터 맞춰 보며, 다른 콘솔 오류는 그대로 둔다.
 */
const HARNESS_NOISE = "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";
function isHarnessNoise(text) { return String(text).indexOf(HARNESS_NOISE) === 0; }
module.exports = { HARNESS_NOISE, isHarnessNoise };
