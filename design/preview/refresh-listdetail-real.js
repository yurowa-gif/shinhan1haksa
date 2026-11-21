/**
 * D15 ⑤ 실제 화면 사진: 상담일지·출결 특이사항 목록 탭을 노트북 1366·1093과 휴대폰 360으로 찍는다(이름·숫자 모두 가짜, 가짜 오늘 2027-03-26).
 * 실행: node design/preview/refresh-listdetail-real.js <이름 before|after>   → design/preview/out/ld/<이름>-<화면>-<기기>.png
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const OUT = path.join(__dirname, 'out', 'ld');
const ADMIN = 'test.admin@example.com', ATT = 'test.attendance@example.com';
const NOW = '2027-03-26T10:00:00';
const DEV = [{ id: '1366', w: 1366, h: 768 }, { id: '1093', w: 1093, h: 560 }, { id: 'phone', w: 360, h: 800 }];

async function main() {
  const label = process.argv[2] || 'after';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try {
    for (const dev of DEV) {
      // 상담일지: 목록 → 학생 열기
      {
        const app = makeApp({ now: NOW }); seed(app.env);
        const s = await openPage(browser, app, { email: ADMIN, query: 'page=counsel', size: { w: dev.w, h: dev.h } });
        await s.settle();
        await s.page.screenshot({ path: path.join(OUT, label + '-counsel-list-' + dev.id + '.png') });
        await s.page.locator('.ld-pick').first().click(); await s.page.waitForTimeout(900); await s.settle();
        if (dev.id === 'phone') await s.page.setViewportSize({ width: dev.w, height: dev.h });
        await s.page.screenshot({ path: path.join(OUT, label + '-counsel-open-' + dev.id + '.png') });
        console.log('찍음 상담일지 ' + dev.id, await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? '가로 넘침' : '넘침 없음'));
        await s.close();
      }
      // 특이사항 목록 탭
      {
        const app = makeApp({ now: NOW }); const ctx = seed(app.env);
        const kids = (ctx.kids || []).slice(0, 5).concat([ctx.A]).filter(Boolean);
        const types = ['병결', '학원(보강 포함)', '가정사유(가족여행 포함)', '병결', '병조퇴', '학원(보강 포함)'];
        kids.forEach((k, i) => {
          const r = app.env.call(ATT, 'saveException', { studentId: k.id, from: '2027-03-26', to: i % 2 ? '2027-03-27' : '2027-03-26', blocks: 'ALL', type: types[i], reason: '가짜 사유 ' + (i + 1) });
          if (!r || r.ok === false) console.log('저장 실패', i, JSON.stringify(r).slice(0, 160));
        });
        const s = await openPage(browser, app, { email: ATT, query: 'page=exceptions&tab=list', size: { w: dev.w, h: dev.h } });
        await s.settle();
        if (dev.id === 'phone') { const h = await s.page.evaluate(() => document.documentElement.scrollHeight); await s.page.setViewportSize({ width: dev.w, height: Math.min(h, 1800) }); }
        await s.page.screenshot({ path: path.join(OUT, label + '-exceptions-' + dev.id + '.png') });
        console.log('찍음 특이사항 ' + dev.id, await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? '가로 넘침' : '넘침 없음'));
        await s.close();
      }
    }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
