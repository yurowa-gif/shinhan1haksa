/**
 * D16 사진(G1·G3·G5·G8): 학생 홈(포털)·교사 홈·요청 처리 목록·결과 격자를 휴대폰 360, 노트북 1366으로 찍는다(이름·숫자 모두 가짜, 가짜 오늘 2027-03-26).
 * 실행: node design/preview/refresh-d16.js <이름 before|after>   → design/preview/out/d16/<이름>-<화면>-<기기>.png
 * 요청 목록의 '경과'는 서버가 requestedAt을 아직 안 줘서, 사진에서만 화면 안 call 결과에 가짜 requestedAt을 덧붙인다(실제 서버 변경은 코딩 몫).
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const OUT = path.join(__dirname, 'out', 'd16');
const E = { admin: 'test.admin@example.com', att: 'test.attendance@example.com', hall: 'test.teacher@example.com', stu: 'test.student@example.com', par: 'test.parent@example.com', hr: 'test.homeroom@example.com' };
const NOW = '2027-03-26T15:20:00';
const DEV = [{ id: 'phone', w: 360, h: 800 }, { id: '1366', w: 1366, h: 768 }];
const AGES = ['2027-03-26T09:10:00', '2027-03-25T16:00:00', '2027-03-22T11:30:00', '2027-03-26T13:00:00'];

async function shoot(browser, label, id, dev, who, query, prep, after, tall) {
  const app = makeApp({ now: NOW }); const ctx = seed(app.env);
  if (prep) prep(app, ctx);
  const s = await openPage(browser, app, { email: who, query, size: { w: dev.w, h: dev.h }, context: { timezoneId: 'Asia/Seoul' } });   // 학교 기기는 한국 시각
  await s.settle();
  if (after) { await after(s.page); await s.page.waitForTimeout(500); }
  if (dev.id === 'phone' && tall) { const h = await s.page.evaluate(() => document.documentElement.scrollHeight); await s.page.setViewportSize({ width: dev.w, height: Math.min(h, tall) }); }
  await s.page.screenshot({ path: path.join(OUT, label + '-' + id + '-' + dev.id + '.png') });
  console.log('찍음 ' + id + ' ' + dev.id, await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? '가로 넘침' : '넘침 없음'));
  await s.close();
}
async function main() {
  const label = process.argv[2] || 'after';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try {
    for (const dev of DEV) {
      await shoot(browser, label, 'home-student', dev, E.stu, '', null, null, 1500);
      await shoot(browser, label, 'home-parent', dev, E.par, '', null, null, 1500);
      await shoot(browser, label, 'home-hall', dev, E.hall, '', null, null, 1500);
      const req = (app) => {   // 담임·학사 교사가 자기 학생에게 보낸 요청 4건(권한이 되는 학생만 저장된다)
        let n = 0;
        app.env.rows('students').forEach((st, i) => {
          if (n >= 4) return;
          [E.hr, E.hall].forEach((who) => {
            if (n >= 4) return;
            try { const r = app.env.call(who, 'saveException', { studentId: st.id, from: '2027-03-29', to: '2027-03-29', blocks: 'ALL', type: n % 2 ? '학원(보강 포함)' : '병결', reason: '가짜 사유' }); if (r && r.ok) n++; } catch (e) { /* 권한 밖 학생 */ }
          });
        });
        console.log('요청 ' + n + '건');
      };
      const inject = async (page) => {   // 사진용: 서버가 아직 안 주는 requestedAt을 화면 안 call 결과에 덧붙인다
        await page.evaluate((ages) => {
          const orig = window.call; let n = 0;
          window.call = function (fn) { return orig.apply(this, arguments).then(function (r) { if (fn === 'listExceptions' && r && r.groups) r.groups.forEach(function (g, i) { g.requestedAt = ages[(n + i) % ages.length]; }); n = 0; return r; }); };
        }, AGES);
        await page.getByText('요청 처리', { exact: true }).first().click(); await page.waitForTimeout(300);
        await page.getByText('입력', { exact: true }).first().click(); await page.waitForTimeout(200);
        await page.getByText('요청 처리', { exact: true }).first().click();
      };
      await shoot(browser, label, 'requests', dev, E.att, 'page=exceptions&tab=requests', req, inject, 1600);
      const oneClass = (app) => app.env.rows('students').forEach((st) => app.env.asOwner((c) => c.updateRecord_('students', st.id, { grade: 1, class_no: 1 }, 'owner@example.com')));   // 한 반에 학생이 많은 모습(고정 확인용)
      await shoot(browser, label, 'results-grid', dev, E.admin, 'page=results', oneClass, async (page) => {
        const w = page.locator('.res-wrap').first(); if (await w.count()) await w.evaluate((n) => { n.scrollTop = 220; n.scrollLeft = 120; });
      }, 1000);
    }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
