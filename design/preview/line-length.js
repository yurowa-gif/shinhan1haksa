/**
 * 기기 행렬 '줄 너무 김' 판정(의존성 없음 — tests/design/devices-line.test.js가 검사).
 * 노트북·데스크톱 칸에서 글 덩어리(p·li·.muted 등)의 **실제로 그려진 가장 긴 한 줄**이 45em(그 요소 글자 크기 기준)과 760px 중 작은 값을 넘으면 실패.
 * 줄이 길면 눈이 다음 줄 처음을 찾기 어렵다(읽기 좋은 길이는 한국어 약 30~40자). 표·격자(table, .rg, .seatgrid)는 재지 않는다.
 */
const LINE_MAX_EM = 45, LINE_MAX_PX = 760;
const LINE_SELECTOR = 'p, li, .muted, .hint, .note, dd, blockquote, figcaption';
const LINE_SKIP = 'table, .rg, .seatgrid';
function lineLimitPx(fontPx) { return Math.min(LINE_MAX_EM * fontPx, LINE_MAX_PX); }
/** lines = [{what, linePx, fontPx}] → 넘는 것만 '이름 폭px>한계px' 글로 */
function longLines(lines) {
  return (lines || []).filter((l) => l.linePx > lineLimitPx(l.fontPx) + 0.5).map((l) => l.what + ' ' + Math.round(l.linePx) + 'px>' + Math.round(lineLimitPx(l.fontPx)) + 'px');
}
module.exports = { LINE_MAX_EM, LINE_MAX_PX, LINE_SELECTOR, LINE_SKIP, lineLimitPx, longLines };
