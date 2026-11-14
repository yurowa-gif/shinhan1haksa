/**
 * D12 정적 시안: 4단계 화면(C27 서류 체크리스트, C28 프로그램 + 참가자). 실행: node design/preview/stage4.js [id…]
 * stage2.js와 같은 틀(360px·1280px PNG, 가로 스크롤·48px·오류 점검). 도우미는 stage2-screens.js 앞부분을 그대로 가져온다.
 * 결과: design/preview/out/stage4/<id>-360.png·-1280.png. 실제 화면 코드가 아니다(서버 호출 없음, 이름은 가짜).
 */
const fs = require('fs');
const path = require('path');
const { main } = require('./stage2.js');

const helpers = fs.readFileSync(path.join(__dirname, 'stage2-screens.js'), 'utf8');
const cut = helpers.indexOf('/* ═════════ 역할별 홈');
if (cut < 0) throw new Error('stage2-screens.js 에서 도우미 끝(역할별 홈 표시)을 못 찾음');
const screens = helpers.slice(0, cut) + '\n' + fs.readFileSync(path.join(__dirname, 'stage4-screens.js'), 'utf8');

if (require.main === module) main(path.join(__dirname, 'out', 'stage4'), screens).catch((e) => { console.error(e); process.exit(1); });
module.exports = { screens };
