/**
 * D11 정적 시안: 6단계 학생 상담 신청 화면(UI 프롬프트 틀 채운 예시). 확정이 아니라 "틀 쓰는 법 예시"다.
 * 실행: node design/preview/stage6.js [id…]. stage2.js와 같은 틀(360px·1280px PNG, 가로 스크롤·48px·오류 점검).
 * 도우미(def·frame·card…)는 stage2-screens.js 앞부분을 그대로 가져온다. 결과: design/preview/out/stage6/<id>-360.png·-1280.png
 */
const fs = require('fs');
const path = require('path');
const { main } = require('./stage2.js');

const helpers = fs.readFileSync(path.join(__dirname, 'stage2-screens.js'), 'utf8');
const cut = helpers.indexOf('/* ═════════ 역할별 홈');
if (cut < 0) throw new Error('stage2-screens.js 에서 도우미 끝(역할별 홈 표시)을 못 찾음');
const screens = helpers.slice(0, cut) + '\n' + fs.readFileSync(path.join(__dirname, 'stage6-screens.js'), 'utf8');

if (require.main === module) main(path.join(__dirname, 'out', 'stage6'), screens).catch((e) => { console.error(e); process.exit(1); });
module.exports = { screens };
