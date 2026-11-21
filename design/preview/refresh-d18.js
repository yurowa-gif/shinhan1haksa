/**
 * D18 사진(관리자 홈 현황 접기·출결 담당 홈): 관리자 홈·출결 담당 홈('오늘 처리할 것' + '전체 기능')·학사 교사 홈('오늘 빠지는 학생')을 휴대폰 360, 노트북 1366으로 찍는다.
 * 실행: node design/preview/refresh-d18.js <이름 before|after>   → design/preview/out/d17/<이름>-<화면>-<기기>.png (이름·숫자 모두 가짜, 가짜 오늘 2027-03-26 15:20)
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const OUT = path.join(__dirname, 'out', 'd18');
const E = { admin: 'test.admin@example.com', att: 'test.attendance@example.com', hall: 'test.teacher@example.com', hr: 'test.homeroom@example.com' };
const NOW = '2027-03-26T15:20:00';
const DEV = [{ id: 'phone', w: 360, h: 800 }, { id: '1366', w: 1366, h: 768 }];
const SPECS = [['병결', 'ALL'], ['학원(보강 포함)', '20:10-21:30'], ['가정사유(가족여행 포함)', '18:30-20:00'], ['병결', 'ALL'], ['학원(보강 포함)', '18:30-20:00'], ['병지각', '18:30-20:00']];

function prep(app) {
  const stu = app.env.rows('students');
  stu.slice(0, 6).forEach((st, i) => {   // 출결 담당이 확정한 오늘 특이사항(블록이 여러 가지)
    try { app.env.call(E.att, 'saveException', { studentId: st.id, from: '2027-03-26', to: i % 3 === 0 ? '2027-03-27' : '2027-03-26', blocks: SPECS[i][1], type: SPECS[i][0], reason: '가짜 사유' }); } catch (e) { /* 권한 밖 */ }
  });
  let n = 0;   // 담임·학사 교사가 보낸 요청(확인 대기)
  stu.slice(6).forEach((st) => { if (n >= 2) return; [E.hr, E.hall].forEach((who) => { if (n >= 2) return; try { const r = app.env.call(who, 'saveException', { studentId: st.id, from: '2027-03-29', to: '2027-03-29', blocks: 'ALL', type: '병결', reason: '가짜' }); if (r && r.ok) n++; } catch (e) { /* 권한 밖 */ } }); });
}
async function main() {
  const label = process.argv[2] || 'after';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try {
    for (const dev of DEV) {
      for (const [id, who] of [['home-admin', E.admin], ['home-attendance', E.att]]) {
        const app = makeApp({ now: NOW }); seed(app.env); prep(app);
        const s = await openPage(browser, app, { email: who, query: '', size: { w: dev.w, h: dev.h }, context: { timezoneId: 'Asia/Seoul' } });
        await s.settle(); await s.page.waitForTimeout(500);
        if (dev.id === 'phone') { const h = await s.page.evaluate(() => document.documentElement.scrollHeight); await s.page.setViewportSize({ width: dev.w, height: Math.min(h, 3000) }); }
        const hClosed = await s.page.evaluate(() => document.documentElement.scrollHeight);   // 접힌 상태의 전체 길이
        await s.page.screenshot({ path: path.join(OUT, label + '-' + id + '-' + dev.id + '.png') });
        if (label === 'after' && id === 'home-admin' && await s.page.locator('details.fold > summary').count()) {   // 접힌 '현황'을 펼친 모습
          await s.page.locator('details.fold > summary').click(); await s.page.waitForTimeout(300);
          if (dev.id === 'phone') { const h2 = await s.page.evaluate(() => document.documentElement.scrollHeight); await s.page.setViewportSize({ width: dev.w, height: Math.min(h2, 5000) }); }
          await s.page.screenshot({ path: path.join(OUT, label + '-home-admin-open-' + dev.id + '.png') });
        }
        console.log('찍음 ' + id + ' ' + dev.id, await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? '가로 넘침' : '넘침 없음'), hClosed + 'px(접힌 길이)');
        await s.close();
      }
    }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
