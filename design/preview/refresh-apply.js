/**
 * D15 2단계(src 적용) 사진·점검: 실제 src/ui 화면을 가짜 서버에 띄워 360px로 찍고, 가로 넘침(360px·글자 150%)과 48px 미만을 잰다.
 * 실행: node design/preview/refresh-apply.js <이름: before|after> [화면 id …]   → design/preview/out/apply/<이름>-<화면>.png (+ font150-)
 *   before = 고치기 전 main, after = 고친 뒤. 같은 가짜 데이터·같은 계정으로 찍어 나란히 비교한다(refresh-apply-compare.js).
 * 이름·숫자는 모두 가짜 데이터, 가짜 오늘 2027-03-26. 쓸 사진은 docs/design/refresh/apply/ 로 복사한다(out/은 Git에 올리지 않는다).
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');

const OUT = path.join(__dirname, 'out', 'apply');
const A = {
  admin: 'test.admin@example.com', attendance: 'test.attendance@example.com', duty: 'test.duty@example.com', hall: 'test.teacher@example.com',
  homeroom: 'test.homeroom@example.com', student: 'test.student@example.com', parent: 'test.parent@example.com'
};
const PHONE = { w: 360, h: 800 };
const NOW = '2027-03-26T10:00:00';

/** 화면 목록: id, 계정, 쿼리. 홈 7개 + (나머지 화면 점검용) 대표 화면들 */
const SCREENS = [
  { id: 'home-admin', email: A.admin, query: '', group: 'home' },
  { id: 'home-attendance', email: A.attendance, query: '', group: 'home' },
  { id: 'home-duty', email: A.duty, query: '', group: 'home' },
  { id: 'home-hall', email: A.hall, query: '', group: 'home' },
  { id: 'home-homeroom', email: A.homeroom, query: '', group: 'home' },
  { id: 'home-student', email: A.student, query: '', group: 'home' },
  { id: 'home-parent', email: A.parent, query: '', group: 'home' },
  { id: 'facility', email: A.student, query: 'page=facility', group: 'portal' },
  { id: 'timetable-student', email: A.student, query: 'page=timetable&role=student', group: 'portal' },
  { id: 'timetable-teacher', email: A.hall, query: 'page=timetable&role=hall_teacher', group: 'portal' }
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
      if (want.length && !want.includes(sc.id) && !want.includes(sc.group)) continue;
      for (const f150 of [false, true]) {
        const app = makeApp({ now: NOW });
        seed(app.env);
        const s = await openPage(browser, app, { email: sc.email, query: sc.query, size: PHONE });
        if (f150) await s.page.addStyleTag({ content: 'html { font-size: 27px !important; }' });
        await s.settle();
        const prefix = f150 ? 'font150-' : '';
        const shot = await s.shot(prefix + label + '-' + sc.id);
        fs.copyFileSync(shot, path.join(OUT, prefix + label + '-' + sc.id + '.png'));
        const over = await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const small = await s.page.evaluate(() => [...document.querySelectorAll('a.btn, button.btn, .row-link, .chip, .tab, .seg, a.back')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 47.5).map((e) => (e.className + ' ' + (e.textContent || '').trim().slice(0, 14))));
        console.log(`찍음: ${prefix}${label}-${sc.id} 넘침=${over} 48px미만=${small.length}` + (small.length ? ' ' + JSON.stringify(small.slice(0, 3)) : ''));
        (report[sc.id] = report[sc.id] || {})[f150 ? 'f150' : 'f100'] = { over, small: small.length };
        await s.close();
      }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, 'report-' + label + '.json'), JSON.stringify(report, null, 1));
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { SCREENS };
