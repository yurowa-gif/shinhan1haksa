/**
 * D15 ③: 모든 화면(역할별 홈 7 + SCREENS 전부 = 31개)을 휴대폰 360×800과 노트북 1366×768로 찍어, 눈으로 점검할 수 있게 묶음 그림(contact sheet)으로 만든다.
 * 실행: node design/preview/refresh-tour.js [label] [화면 id …]   → design/preview/out/tour/<label>-<화면>-<phone|laptop>.png, 묶음은 sheet-<label>-<번호>.png
 *   기기 행렬(devices.js)은 숫자로 재고, 이 도구는 눈으로 본다. 이름·숫자는 모두 가짜.
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const { screenList } = require('./devices.js');

const OUT = path.join(__dirname, 'out', 'tour');
const NOW = '2027-03-26T10:00:00';
const SIZES = { phone: { w: 360, h: 800 }, laptop: { w: 1366, h: 768 } };

async function main() {
  const label = process.argv[2] || 'now';
  const want = process.argv.slice(3);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try {
    const probe = makeApp({ now: NOW });
    const list = screenList(probe);
    for (const sc of list) {
      if (want.length && !want.includes(sc.id)) continue;
      for (const kind of Object.keys(SIZES)) {
        const app = makeApp({ now: NOW });
        seed(app.env);
        const s = await openPage(browser, app, { email: sc.email, query: sc.query, size: SIZES[kind] });
        await s.settle();
        const safe = sc.id.replace(/[:]/g, '-');
        if (kind === 'phone') {
          const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
          await s.page.setViewportSize({ width: SIZES.phone.w, height: Math.min(Math.max(800, h), 2200) });
        }
        await s.page.screenshot({ path: path.join(OUT, label + '-' + safe + '-' + kind + '.png') });
        console.log('찍음: ' + label + '-' + safe + '-' + kind);
        await s.close();
      }
    }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
