/**
 * D23 전 화면 보드: 기기 행렬(devices.js)이 도는 모든 화면을 휴대폰 360·노트북 1366으로 찍어 한 장씩 묶는다(화면 이름 표시).
 * 실행: [PRETENDARD_DIR=<npm 패키지 pretendard 폴더>] node design/preview/all-screens.js [이름(기본 after)] [화면이름 …]
 *   → design/preview/out/all-screens/<이름>-<화면>-<phone|laptop>.png, <이름>-board-phone.png · <이름>-board-laptop.png
 * main의 실제 화면(가짜 서버), 이름·숫자는 모두 가짜 데이터. 쓸 사진은 docs/design/ 로 복사한다.
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { screenList, seed, NOW } = require('./devices.js');
const { board } = require('./concepts.js');

const OUT = path.join(__dirname, 'out', 'all-screens'), REL = '../all-screens/';
const DEV = [{ id: 'phone', w: 360, h: 760, context: { isMobile: true, hasTouch: true } }, { id: 'laptop', w: 1366, h: 768 }];
const safe = (id) => id.replace(/[:]/g, '_');

async function main() {
  const label = process.argv[2] || 'after', only = process.argv.slice(3);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try {
    const list = screenList(makeApp({ now: NOW })).filter((s) => !only.length || only.includes(s.id));
    for (const sc of list) {
      for (const dev of DEV) {
        const app = makeApp({ now: NOW }); seed(app.env);
        const s = await openPage(browser, app, { email: sc.email, query: sc.query, size: { w: dev.w, h: dev.h }, context: Object.assign({ timezoneId: 'Asia/Seoul', deviceScaleFactor: 1 }, dev.context || {}) });
        await s.settle(); await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(300);
        const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
        await s.page.setViewportSize({ width: dev.w, height: Math.min(Math.max(dev.h, h), dev.id === 'phone' ? 1800 : 1400) });
        await s.page.waitForTimeout(100);
        await s.page.screenshot({ path: path.join(OUT, `${label}-${safe(sc.id)}-${dev.id}.png`) });
        await s.close();
      }
      process.stdout.write('.');
    }
    console.log(' ' + list.length + '화면');
    if (!only.length) {
      await board(browser, REL + label + '-board-phone.png', '전 화면 — 휴대폰 360px', '기기 행렬이 도는 ' + list.length + '개 화면의 위쪽. main의 실제 화면, 이름·숫자는 가짜.', list.map((s) => ({ label: s.id, file: REL + `${label}-${safe(s.id)}-phone.png` })), { width: 2600, cols: 8, cropH: 620, phone: true, gap: 20 });
      await board(browser, REL + label + '-board-laptop.png', '전 화면 — 노트북 1366px', '기기 행렬이 도는 ' + list.length + '개 화면의 위쪽. main의 실제 화면, 이름·숫자는 가짜.', list.map((s) => ({ label: s.id, file: REL + `${label}-${safe(s.id)}-laptop.png` })), { width: 3000, cols: 4, cropH: 420, gap: 20 });
    }
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
