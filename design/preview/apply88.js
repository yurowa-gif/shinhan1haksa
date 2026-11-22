/**
 * D22 사진(결정 88 적용 전/후): main의 실제 화면을 가짜 서버에 띄워 휴대폰 360·노트북 1366으로 찍고, 전/후를 한 장에 나란히 묶는다.
 * 실행: [PRETENDARD_DIR=<npm 패키지 pretendard 폴더>] node design/preview/apply88.js <before|after|nofont>   → design/preview/out/apply88/<이름>-<화면>.png
 *        node design/preview/apply88.js boards   → compare-*.png (before·after·nofont 사진이 있어야 한다)
 *   before = 적용 전 Styles.html로 찍은 것, after = 적용 후 + 글꼴 받음, nofont = 적용 후 + 글꼴 주소가 막힌 경우(PRETENDARD_DIR 없이 실행 → 기기 기본 글꼴)
 * 이름·숫자는 모두 가짜 데이터, 가짜 오늘 2027-03-26 15:20. 쓸 사진은 docs/design/apply88/ 로 복사한다.
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const { SCREENS, E, NOW, PHONE, LAPTOP, prep, measure, board } = require('./concepts.js');

const OUT = path.join(__dirname, 'out', 'apply88'), REL = '../apply88/';
const tap = async (s, loc) => { await loc.first().click({ timeout: 4000 }).catch(() => {}); await s.settle(); await s.page.waitForTimeout(400); };
const EXTRA = [
  { id: 'p-sheet', dev: 'phone', label: '출석부', email: E.att, query: 'page=sheet' },
  { id: 'l-sheet', dev: 'laptop', label: '출석부', email: E.att, query: 'page=sheet' },
  { id: 'l-exceptions', dev: 'laptop', label: '특이사항 목록', email: E.att, query: 'page=exceptions', act: async (s) => { await tap(s, s.page.locator('.seg', { hasText: '목록' })); await tap(s, s.page.locator('.ld-pick')); } }
];
const ALL = SCREENS.concat(EXTRA);

async function shoot(label) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo(), report = {};
  try {
    for (const sc of ALL) {
      const app = makeApp({ now: NOW }); seed(app.env); prep(app);
      const size = sc.dev === 'phone' ? PHONE : LAPTOP;
      const s = await openPage(browser, app, { email: sc.email, query: sc.query, size, context: { timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 } });
      await s.settle(); if (sc.act) await sc.act(s);
      await s.settle(); await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(400);
      const m = await measure(s.page, sc.dev === 'phone');
      m.fonts = await s.page.evaluate(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))]);
      report[sc.id] = m;
      const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
      if (!sc.fixed) await s.page.setViewportSize({ width: size.w, height: Math.min(Math.max(size.h, h), sc.dev === 'phone' ? 2400 : 1500) });
      await s.page.waitForTimeout(150);
      await s.page.screenshot({ path: path.join(OUT, label + '-' + sc.id + '.png') });
      console.log(`${label}-${sc.id} 넘침=${m.over} 48px미만=${m.small.length} 최저대비=${m.worst.r}${m.worst.r < 4.5 ? ' ' + m.worst.what : ''} 글꼴=${m.fonts.join('+') || '기기 기본'}`);
      await s.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, 'report-' + label + '.json'), JSON.stringify(report, null, 1));
}
async function boards() {
  const browser = await launchKo();
  const pair = (ids, a, b, la, lb) => ids.map(([id, l]) => ({ label: la + ' · ' + l, file: REL + a + '-' + id + '.png' })).concat(ids.map(([id, l]) => ({ label: lb + ' · ' + l, file: REL + b + '-' + id + '.png' })));
  const side = (ids, a, b, la, lb) => ids.flatMap(([id, l]) => [{ label: la + ' · ' + l, file: REL + a + '-' + id + '.png' }, { label: lb + ' · ' + l, file: REL + b + '-' + id + '.png' }]);
  const note = 'main의 실제 화면, 이름·숫자는 가짜. hero는 넣지 않았습니다.';
  try {
    const homes = [['p-home-admin', '관리자 홈'], ['p-home-hall', '학사교사 홈'], ['p-home-student', '학생 홈'], ['p-home-parent', '학부모 홈']];
    await board(browser, REL + 'compare-phone-home.png', '적용 전 → 후 — 휴대폰 360px, 홈', '윗줄: 적용 전(결정 85 코발트·노란 띠). 아랫줄: 적용 후(결정 88 감색·살구·Pretendard). ' + note, pair(homes, 'before', 'after', '전', '후'), { width: 1720, cols: 4, cropH: 1100, phone: true });
    const work = [['p-inbox', '확인함'], ['p-requests', '특이사항 요청 처리'], ['p-sheet', '출석부'], ['p-confirm', '확인 창']];
    await board(browser, REL + 'compare-phone-work.png', '적용 전 → 후 — 휴대폰 360px, 업무 화면', '윗줄: 적용 전. 아랫줄: 적용 후. ' + note, pair(work, 'before', 'after', '전', '후'), { width: 1720, cols: 4, cropH: 900, phone: true });
    await board(browser, REL + 'compare-laptop.png', '적용 전 → 후 — 노트북 1366px', '왼쪽: 적용 전. 오른쪽: 적용 후. ' + note, side([['l-home-admin', '관리자 홈'], ['l-home-att', '출결 담당 홈'], ['l-results', '출결 결과 격자'], ['l-exceptions', '특이사항 목록 | 상세'], ['l-counsel', '상담일지 목록 | 상세']], 'before', 'after', '전', '후'), { width: 2400, cols: 2, cropH: 720 });
    await board(browser, REL + 'compare-nofont.png', '글꼴을 못 받았을 때 — 휴대폰 360px', '윗줄: Pretendard를 받은 화면. 아랫줄: 글꼴 주소가 막힌 화면(기기 기본 글꼴). 글자 모양만 다르고 배치·색·누르는 칸은 같습니다. ' + note, pair([['p-home-admin', '관리자 홈'], ['p-home-student', '학생 홈'], ['p-requests', '특이사항 요청 처리'], ['p-facility', '시설 일지 쓰기']], 'after', 'nofont', '받음', '못 받음'), { width: 1720, cols: 4, cropH: 900, phone: true });
  } finally { await browser.close(); }
}
const cmd = process.argv[2];
(cmd === 'boards' ? boards() : shoot(cmd || 'after')).catch((e) => { console.error(e); process.exit(1); });
