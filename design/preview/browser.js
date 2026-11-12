/** 미리보기용 브라우저를 한국 휴대폰처럼 띄운다. 날짜 칸이 "mm/dd/yyyy"가 아니라 "2027. 04. 14."로 보이려면
 *  Playwright locale 만으로는 모자라고 브라우저 언어(--lang=ko)와 환경 로캘(LANG·LC_ALL)이 함께 한국어여야 한다. */
const { chromium } = require('playwright');
function launchKo() {
  return chromium.launch({ args: ['--lang=ko'], env: Object.assign({}, process.env, { LANG: 'ko_KR.UTF-8', LANGUAGE: 'ko', LC_ALL: 'ko_KR.UTF-8' }) });
}
module.exports = { launchKo };
