/**
 * D15 ⑤b 실제 화면 사진: ③ 출결 결과 반 고르기(학년 먼저) · ④ 서류(상태 알약 + 열기 + 시트 토글)를 휴대폰 360·노트북 1366·1093으로 찍는다.
 * 실행: node design/preview/refresh-docs-results.js <이름 before|after>   → design/preview/out/dr/<이름>-<화면>-<기기>.png (이름·숫자 모두 가짜)
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const OUT = path.join(__dirname, 'out', 'dr');
const ADMIN = 'test.admin@example.com';
const NOW = '2027-03-26T10:00:00';
const DEV = [{ id: '1366', w: 1366, h: 768 }, { id: '1093', w: 1093, h: 560 }, { id: 'phone', w: 360, h: 800 }];

/** 반이 28개가 되게 학생 반을 흩뜨린다(1학년 10반·2학년 10반·3학년 8반) */
function spread(app) {
  const stu = app.env.rows('students');
  stu.forEach((s, i) => {
    const k = i % 28, grade = k < 10 ? 1 : k < 20 ? 2 : 3, cls = k < 10 ? k + 1 : k < 20 ? k - 9 : k - 19;
    app.env.asOwner((c) => c.updateRecord_('students', s.id, { grade: grade, class_no: cls }, 'owner@example.com'));
  });
}
async function main() {
  const label = process.argv[2] || 'after';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try {
    for (const dev of DEV) {
      {   // 서류: 미제출 목록 → 열기 시트
        const app = makeApp({ now: NOW }); seed(app.env);
        const s = await openPage(browser, app, { email: ADMIN, query: 'page=docs', size: { w: dev.w, h: dev.h } });
        await s.settle();
        if (dev.id === 'phone') { const h = await s.page.evaluate(() => document.documentElement.scrollHeight); await s.page.setViewportSize({ width: dev.w, height: Math.min(h, 1600) }); }
        await s.page.screenshot({ path: path.join(OUT, label + '-docs-' + dev.id + '.png') });
        console.log('찍음 서류 ' + dev.id, await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? '가로 넘침' : '넘침 없음'));
        const open = s.page.locator('.doc-row .row-open').first();
        if (label === 'after' && await open.count()) {
          if (dev.id === 'phone') await s.page.setViewportSize({ width: dev.w, height: dev.h });
          await open.click(); await s.page.waitForTimeout(700);
          await s.page.screenshot({ path: path.join(OUT, label + '-docs-sheet-' + dev.id + '.png') });
        }
        await s.close();
      }
      {   // 출결 결과: 반 고르기
        const app = makeApp({ now: NOW }); seed(app.env); spread(app);
        const s = await openPage(browser, app, { email: ADMIN, query: 'page=results&tab=total', size: { w: dev.w, h: dev.h } });
        await s.settle();
        if (dev.id === 'phone') { const h = await s.page.evaluate(() => document.documentElement.scrollHeight); await s.page.setViewportSize({ width: dev.w, height: Math.min(h, 1400) }); }
        await s.page.screenshot({ path: path.join(OUT, label + '-results-' + dev.id + '.png') });
        console.log('찍음 결과 ' + dev.id, await s.page.evaluate(() => document.querySelectorAll('.res-classes .chip').length + '개 칩, ' + (document.documentElement.scrollWidth > window.innerWidth + 1 ? '가로 넘침' : '넘침 없음')));
        await s.close();
      }
    }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
