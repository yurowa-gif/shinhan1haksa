/**
 * D10 정적 시안: 3단계 화면(F5 좌석 초안·규칙 위반, 떨어뜨릴 짝, F8 방 배정·정원 현황판).
 * 실행: node design/preview/stage3.js [id…]. stage2.js와 같은 틀(360px·1280px PNG, 가로 스크롤·48px·오류 점검)을 쓴다.
 * 도우미(def·frame·card…)는 stage2-screens.js 앞부분을 그대로 가져온다. 결과: design/preview/out/stage3/<id>-360.png·-1280.png
 */
const fs = require('fs');
const path = require('path');
const { main } = require('./stage2.js');

const helpers = fs.readFileSync(path.join(__dirname, 'stage2-screens.js'), 'utf8');
const cut = helpers.indexOf('/* ═════════ 역할별 홈');
if (cut < 0) throw new Error('stage2-screens.js 에서 도우미 끝(역할별 홈 표시)을 못 찾음');
const screens = helpers.slice(0, cut) + '\n' + fs.readFileSync(path.join(__dirname, 'stage3-screens.js'), 'utf8');

if (require.main === module) main(path.join(__dirname, 'out', 'stage3'), screens).catch((e) => { console.error(e); process.exit(1); });
module.exports = { screens };
