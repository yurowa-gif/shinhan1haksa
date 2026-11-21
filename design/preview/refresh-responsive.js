/**
 * D15 ② 반응형 사진: 같은 화면을 휴대폰 3종(안드로이드 360×800, 아이폰 390×844, 아이폰 SE 375×667)과
 * 노트북 3종(1366×768, 1920×1080, 1093×560 = 1366×768 화면 배율 125%의 보이는 영역)으로 찍는다.
 * 실행: node design/preview/refresh-responsive.js <이름 before|after> [화면 id …]   → design/preview/out/resp/<이름>-<화면>-<기기>.png
 *   노트북은 처음 보이는 화면(스크롤 전)만, 휴대폰은 위쪽 1400px까지. 이름·숫자는 모두 가짜, 가짜 오늘 2027-03-26.
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');

const OUT = path.join(__dirname, 'out', 'resp');
const A = { admin: 'test.admin@example.com', hall: 'test.teacher@example.com', student: 'test.student@example.com', parent: 'test.parent@example.com', attendance: 'test.attendance@example.com' };
const PHONES = [{ id: 'android-360', w: 360, h: 800 }, { id: 'iphone-390', w: 390, h: 844 }, { id: 'iphone-se-375', w: 375, h: 667 }];
const LAPTOPS = [{ id: 'laptop-1366', w: 1366, h: 768 }, { id: 'laptop-1920', w: 1920, h: 1080 }, { id: 'laptop-1093', w: 1093, h: 560 }];   // 1093×560 = 1366×768 화면을 배율 125%로 쓸 때(브라우저 주소창·탭 줄을 뺀 보이는 높이)
const NOW = '2027-03-26T10:00:00';
const SCREENS = [
  { id: 'home-hall', email: A.hall, query: '' },
  { id: 'home-admin', email: A.admin, query: '' },
  { id: 'home-owner', email: 'owner@example.com', query: '' },
  { id: 'home-student', email: A.student, query: '' },
  { id: 'home-parent', email: A.parent, query: '' },
  { id: 'facility-write', email: A.student, query: 'page=facility' },
  { id: 'mealcount', email: A.admin, query: 'page=mealcount' },
  { id: 'results', email: A.admin, query: 'page=results&tab=total' },
  { id: 'seats', email: A.admin, query: 'page=seats' },
  { id: 'timetable-confirm', email: A.hall, query: 'page=timetable&role=hall_teacher', sheet: true }
];

async function main() {
  const label = process.argv[2];
  if (!label) throw new Error('이름(before|after)을 주세요');
  const want = process.argv.slice(3);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  const report = {};
  try {
    for (const sc of SCREENS) {
      if (want.length && !want.includes(sc.id)) continue;
      for (const dev of PHONES.concat(LAPTOPS)) {
        const app = makeApp({ now: NOW });
        const ctx = seed(app.env);
        if (sc.sheet) {   // 학생 A가 시간표를 내고 학부모가 동의한 상태 → 교사가 줄을 눌러 확인 시트를 연다
          const call = (who, fn, ...a) => app.env.call(who, fn, ...a);
          call(A.student, 'submitTimetable', { month: '2027-04', entries: [{ weekday: '월', blocks: '18:30-20:00', code: '학' }, { weekday: '수', blocks: 'ALL', code: '가' }] });
          call(A.parent, 'agreeTimetable', ctx.A.id, '2027-04');
        }
        const s = await openPage(browser, app, { email: sc.email, query: sc.query, size: { w: dev.w, h: dev.h } });
        if (sc.id === 'facility-write') {
          await s.page.getByText('특강실', { exact: true }).first().click().catch(() => {});
          await s.page.getByLabel('시작').fill('15:30').catch(() => {});
          await s.page.getByLabel('끝나는 시각').fill('17:00').catch(() => {});
        }
        if (sc.sheet) {
          await s.page.locator('.tt-row').filter({ hasText: ctx.A.name }).first().click();
          await s.page.waitForTimeout(900);
        }
        await s.settle();
        const file = path.join(OUT, label + '-' + sc.id + '-' + dev.id + '.png');
        const isPhone = PHONES.indexOf(dev) >= 0;
        if (isPhone) {
          const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
          await s.page.setViewportSize({ width: dev.w, height: Math.min(Math.max(dev.h, h), sc.sheet ? dev.h : 1400) });
        }
        await s.page.screenshot({ path: file });
        const info = await s.page.evaluate(() => ({ over: document.documentElement.scrollWidth > window.innerWidth + 1 }));
        console.log(`찍음: ${label}-${sc.id}-${dev.id} 넘침=${info.over}`);
        (report[sc.id] = report[sc.id] || {})[dev.id] = info;
        await s.close();
      }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, 'report-' + label + '.json'), JSON.stringify(report, null, 1));
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { SCREENS, PHONES, LAPTOPS };
