/**
 * D24 정적 시안: 6단계(상담·진로진학, F15~F17) 화면 — 결정 88 안, 결정 89~101 반영.
 * 실행: [PRETENDARD_DIR=<npm 패키지 pretendard 폴더>] node design/preview/stage6b.js [id…]. stage2.js와 같은 틀(360px·1280px PNG, 가로 스크롤·48px·오류 점검).
 * 결과: design/preview/out/stage6b/<id>-360.png·-1280.png. 쓸 사진은 docs/design/stage6/photos/ 로 복사한다. 설명서: docs/design/stage6/screens.md
 */
const fs = require('fs');
const path = require('path');
const { main } = require('./stage2.js');

const helpers = fs.readFileSync(path.join(__dirname, 'stage2-screens.js'), 'utf8');
const cut = helpers.indexOf('/* ═════════ 역할별 홈');
if (cut < 0) throw new Error('stage2-screens.js 에서 도우미 끝(역할별 홈 표시)을 못 찾음');
const screens = helpers.slice(0, cut) + '\n' + fs.readFileSync(path.join(__dirname, 'stage6b-screens.js'), 'utf8');

if (require.main === module) main(path.join(__dirname, 'out', 'stage6b'), screens).catch((e) => { console.error(e); process.exit(1); });
module.exports = { screens };
