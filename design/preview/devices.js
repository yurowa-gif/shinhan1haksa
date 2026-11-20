/**
 * T8 기기 행렬 자동 점검: **모든 실제 화면 × 기기 크기**를 크로미움으로 띄워 자동으로 판정한다(real-screens.js 하네스, 가짜 데이터만).
 * 실행: npm run devices [-- 화면이름 …] [--base=기준선.json]   (예: npm run devices -- home:student timetable)
 *   --base=docs/design/devices-baseline.json 을 주면 기준선과 칸마다 비교해 '나빠진 칸·좋아진 칸'을 report.md 맨 위에 적는다(D15 PR마다)
 *   → design/preview/out/devices/report.md(화면 × 기기 표) · report.json · 실패한 칸만 사진(<화면>__<기기>.png)
 * 느려서(수 분) npm test 기본에는 넣지 않는다. 화면 새 단장(D15) 전후를 같은 잣대로 재는 데 쓴다.
 *
 * 브라우저는 **Chromium 하나뿐**이다(이 환경에 WebKit·Firefox 없음). 아이폰 칸은 아이폰 화면 크기·터치·모바일 뷰포트를 흉내 낸 크로미움이지
 * Safari가 아니다. 실제 Safari·삼성 인터넷·카카오톡 인앱 브라우저는 docs/design/devices-baseline.md의 '실기기 확인 목록'으로 사람이 본다.
 *
 * 판정(실패 이유 코드):
 *   넘침     가로 넘침: 문서 scrollWidth > 창 폭(+1px)
 *   작은칸   휴대폰 칸에서 누르는 요소(버튼·링크·입력·체크 라벨)가 48px 미만(가로 또는 세로). 체크·라디오는 감싼 label 크기로 본다
 *   입력글자 휴대폰 칸에서 input·select·textarea 글자가 16px 미만(아이폰 Safari는 확대해 버린다)
 *   가림     아래 고정 바(.actionbar 등 position:fixed·아래쪽)가 마지막 내용이나 누르는 요소를 가린다(맨 아래까지 내려도)
 *   잘림     overflow가 숨김인 글 요소에서 scrollWidth > clientWidth(글이 잘려 안 보임)
 *   포커스   Tab으로 갈 때 보이지 않는 요소에 가거나, 포커스 표시(outline·box-shadow)가 없거나, tabindex>0
 *   콘솔     콘솔 오류·페이지 오류
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');

const OUT = path.join(__dirname, 'out', 'devices');
const NOW = '2027-03-26T10:00:00', TODAY = '2027-03-26';   // 시간표 제출 기간이 열린 날(stage7-real.js와 같음)
const ACC = {
  admin: 'test.admin@example.com', hall_teacher: 'test.teacher@example.com', attendance: 'test.attendance@example.com', homeroom: 'test.homeroom@example.com',
  duty_manager: 'test.duty@example.com', student: 'test.student@example.com', parent: 'test.parent@example.com'
};
const MOBILE = { isMobile: true, hasTouch: true };
const DEVICES = [
  { id: 'android-360', w: 360, h: 800, phone: true, context: MOBILE, note: '안드로이드(갤럭시 보급형)' },
  { id: 'iphone-390', w: 390, h: 844, phone: true, context: MOBILE, note: '아이폰 14·15 크기(Chromium 흉내)' },
  { id: 'iphone-375', w: 375, h: 667, phone: true, context: MOBILE, note: '아이폰 SE 크기(Chromium 흉내)' },
  { id: 'android-360-font150', w: 360, h: 800, phone: true, context: MOBILE, font150: true, note: '360px + 기기 글자 150%(html 27px)' },
  { id: 'tablet-768', w: 768, h: 1024, phone: false, context: MOBILE, note: '태블릿 세로' },
  { id: 'laptop-1366', w: 1366, h: 768, phone: false, note: '노트북(윈도우 크롬)' },
  { id: 'laptop-1536', w: 1536, h: 864, phone: false, note: '노트북 125% 배율(윈도우 크롬)' },
  { id: 'desktop-1920', w: 1920, h: 1080, phone: false, note: '데스크톱' }
];

/** 화면 목록: 역할별 홈 + SCREENS의 모든 화면(열 수 있는 첫 계정으로). 한 화면을 여러 역할이 쓰면 역할마다 */
function screenList(app) {
  const list = Object.keys(ACC).map((role) => ({ id: 'home:' + role, email: ACC[role], query: 'role=' + role }));
  const pages = app.env.as(ACC.admin, (c) => Object.keys(c.SCREENS));
  const order = ['admin', 'hall_teacher', 'attendance', 'homeroom', 'duty_manager', 'student', 'parent'];
  const rolesOf = (email) => String((app.env.rows('users').find((u) => u.email === email) || {}).roles).split(',').map((r) => r.trim());
  for (const page of pages) {
    const can = order.filter((r) => app.env.as(ACC.admin, (c) => c.screenResolve_(page, rolesOf(ACC[r])).ok));
    if (!can.length) continue;
    if (page === 'timetable') can.filter((r) => ['student', 'parent', 'hall_teacher'].includes(r)).forEach((r) => list.push({ id: page + ':' + r, email: ACC[r], query: 'page=' + page + '&role=' + r }));
    else if (page === 'facilityday') list.push({ id: page, email: ACC.hall_teacher, query: 'page=' + page });   // 오늘 근무교사(seed)
    else list.push({ id: page, email: ACC[can[0]], query: 'page=' + page });
  }
  return list;
}

/** 가짜 데이터 보충: 오늘 근무교사 = 시험교사, 학생 시설 일지 한 건(그날 일지에 줄이 보이게) */
function seed(env) {
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '21:30조', end_time: '21:30', original_email: ACC.hall_teacher, actual_email: ACC.hall_teacher, swapped_at: '', swapped_by: '', status: '유효', memo: '가짜 T8' }, ACC.admin));
}

/** 페이지 안에서 판정 → {넘침, 작은칸:[…], 입력글자:[…], 가림:[…], 잘림:[…]} */
async function inspect(page, dev) {
  return page.evaluate(([phone, devW]) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[aria-hidden="true"]'); };
    const label = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + ((el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 16)) + '"');
    // 휴대폰 흉내(isMobile)에서는 내용이 넓으면 창 폭(innerWidth)까지 늘어나 축소 보기가 된다 → 기기 폭과 비교
    const W = Math.min(window.innerWidth, devW);
    const out = { over: document.documentElement.scrollWidth > W + 1, overBy: document.documentElement.scrollWidth - W, small: [], inputFont: [], covered: [], clipped: [] };
    const fixedAncestor = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed') return e; } return null; };
    const targets = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary, [tabindex="0"]')].filter(vis).slice(0, 400);
    if (phone) {
      for (const el of targets) {
        const t = (el.type || '').toLowerCase();
        const lab = (t === 'checkbox' || t === 'radio') ? (el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'))) : null;
        const r = (lab || el).getBoundingClientRect();
        if (r.height < 47.5 || r.width < 47.5) out.small.push(label(lab || el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
        if (/^(input|select|textarea)$/i.test(el.tagName) && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(t) && parseFloat(getComputedStyle(el).fontSize) < 16) out.inputFont.push(label(el) + ' ' + getComputedStyle(el).fontSize);
      }
    }
    // 잘림: 글이 있고 overflow가 숨김인데 내용이 더 넓다
    document.querySelectorAll('body *').forEach((el) => {
      if (!vis(el) || !el.innerText || !el.innerText.trim()) return;
      const cs = getComputedStyle(el);
      if (!/hidden|clip/.test(cs.overflowX + cs.overflow) && cs.textOverflow !== 'ellipsis') return;
      if (el.scrollWidth > el.clientWidth + 1 && el.children.length === 0) out.clipped.push(label(el));
    });
    // 가림: 아래 고정 바 위쪽 경계, 맨 아래까지 내렸을 때 마지막 내용·누르는 요소가 그 아래로 들어가는지
    const bars = [...document.querySelectorAll('body *')].filter((el) => vis(el) && getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().bottom >= window.innerHeight - 2 && el.getBoundingClientRect().top > window.innerHeight / 2);
    if (bars.length) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const barTop = Math.min(...bars.map((b) => b.getBoundingClientRect().top));
      for (const el of targets) {
        if (fixedAncestor(el)) continue;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
        const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 2), y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 2);
        const hit = document.elementFromPoint(x, y);
        if (hit && !el.contains(hit) && !hit.contains(el) && fixedAncestor(hit) && r.top + r.height / 2 > barTop - 1) out.covered.push(label(el));
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      const flow = [...document.querySelectorAll('main *, .page *, body > *')].filter((el) => vis(el) && !fixedAncestor(el) && el.children.length === 0 && (el.innerText || '').trim());
      const lastBottom = Math.max(0, ...flow.map((el) => el.getBoundingClientRect().bottom));
      if (lastBottom > barTop + 1) out.covered.push('마지막 내용(아래 ' + Math.round(lastBottom - barTop) + 'px 가림)');
      window.scrollTo(0, 0);
    }
    return out;
  }, [!!dev.phone, dev.w]);
}

/** Tab 순서·포커스 표시: Tab을 최대 n번 눌러 포커스가 간 요소마다 본다 */
async function focusCheck(page, n) {
  const bad = [];
  const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((e) => +e.getAttribute('tabindex') > 0).length);
  if (positive) bad.push('tabindex>0 ' + positive + '개');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      const key = el.tagName + '|' + (el.id || '') + '|' + Math.round(r.top + scrollY) + '|' + Math.round(r.left);
      return { key, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden', ring, what: el.tagName.toLowerCase() + ' "' + ((el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 16)) + '"' };
    });
    if (!f) continue;
    if (seen.has(f.key)) break;   // 한 바퀴 돌았다
    seen.add(f.key);
    if (!f.visible) bad.push('안 보이는 곳에 포커스: ' + f.what);
    else if (!f.ring) bad.push('포커스 표시 없음: ' + f.what);
  }
  return bad;
}

async function checkOne(browser, app, sc, dev) {
  const consoleErr = [];
  const s = await openPage(browser, app, {
    email: sc.email, query: sc.query, size: { w: dev.w, h: dev.h }, context: dev.context,
    onPage: (page) => page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 120)); })
  });
  try {
    if (dev.font150) { await s.page.addStyleTag({ content: 'html { font-size: 27px !important; }' }); await s.settle(); }
    const r = await inspect(s.page, dev);
    const focus = await focusCheck(s.page, 40);
    const fails = {};
    if (r.over) fails['넘침'] = ['+' + r.overBy + 'px'];
    if (r.small.length) fails['작은칸'] = r.small;
    if (r.inputFont.length) fails['입력글자'] = r.inputFont;
    if (r.covered.length) fails['가림'] = r.covered;
    if (r.clipped.length) fails['잘림'] = r.clipped;
    if (focus.length) fails['포커스'] = focus;
    const errs = consoleErr.concat(s.errors.map((e) => 'pageerror: ' + e.slice(0, 120)));
    if (errs.length) fails['콘솔'] = errs;
    let shot = null;
    if (Object.keys(fails).length) {
      await s.page.evaluate(() => window.scrollTo(0, 0));
      const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
      await s.page.setViewportSize({ width: dev.w, height: Math.min(Math.max(dev.h, h), 4000) });
      shot = path.join(OUT, sc.id.replace(/:/g, '-') + '__' + dev.id + '.png');
      await s.page.screenshot({ path: shot });
      shot = path.basename(shot);
    }
    return { fails, shot };
  } finally { await s.close(); }
}

/** 기준선과 비교: 칸마다 실패 이유 코드 집합이 늘었으면 나빠짐, 줄었으면 좋아짐 */
function compare(base, results, screens) {
  const worse = [], better = [];
  for (const sc of screens) for (const d of DEVICES) {
    const a = base.results[sc.id] && base.results[sc.id][d.id], b = results[sc.id] && results[sc.id][d.id];
    if (!a || !b) continue;
    const ka = new Set(a.error ? ['오류'] : Object.keys(a.fails)), kb = new Set(b.error ? ['오류'] : Object.keys(b.fails));
    const add = [...kb].filter((k) => !ka.has(k)), gone = [...ka].filter((k) => !kb.has(k));
    if (add.length) worse.push(sc.id + ' · ' + d.id + ': +' + add.join(',+'));
    if (gone.length) better.push(sc.id + ' · ' + d.id + ': −' + gone.join(',−'));
  }
  return ['## 기준선과 비교', '', '나빠진 칸 ' + worse.length + ' · 좋아진 칸 ' + better.length, ''].concat(worse.map((x) => '- 나빠짐 ' + x), better.map((x) => '- 좋아짐 ' + x), ['']).join('\n') + '\n';
}

function reportMd(results, screens) {
  const codes = ['넘침', '작은칸', '입력글자', '가림', '잘림', '포커스', '콘솔'];
  const lines = ['# 기기 행렬 점검 결과', '', '실행: `npm run devices` · 기준 시각(가짜) ' + NOW + ' · 브라우저: Chromium만(아이폰 칸은 크기·터치 흉내, Safari 아님)', '',
    '칸: `통과` 또는 실패 이유 코드(개수). 코드 뜻은 design/preview/devices.js 머리말.', '',
    '| 화면 | ' + DEVICES.map((d) => d.id).join(' | ') + ' |', '| --- |' + DEVICES.map(() => ' --- |').join('')];
  for (const sc of screens) {
    lines.push('| ' + sc.id + ' | ' + DEVICES.map((d) => {
      const r = results[sc.id] && results[sc.id][d.id];
      if (!r) return '—';
      if (r.error) return '오류';
      const k = codes.filter((c) => r.fails[c]);
      return k.length ? k.map((c) => c + '(' + r.fails[c].length + ')').join(' ') : '통과';
    }).join(' | ') + ' |');
  }
  const total = { cells: 0, pass: 0 }, byCode = {};
  for (const sc of screens) for (const d of DEVICES) {
    const r = results[sc.id] && results[sc.id][d.id];
    if (!r || r.error) continue;
    total.cells++;
    const k = Object.keys(r.fails);
    if (!k.length) total.pass++;
    k.forEach((c) => { byCode[c] = (byCode[c] || 0) + 1; });
  }
  lines.push('', '합계: ' + total.cells + '칸 중 통과 ' + total.pass + '칸. 이유별 실패 칸: ' + (codes.filter((c) => byCode[c]).map((c) => c + ' ' + byCode[c]).join(', ') || '없음'), '');
  lines.push('## 실패 자세히(이유마다 앞 5개)', '');
  for (const sc of screens) for (const d of DEVICES) {
    const r = results[sc.id] && results[sc.id][d.id];
    if (!r) continue;
    if (r.error) { lines.push('- **' + sc.id + ' · ' + d.id + '** 오류: ' + r.error); continue; }
    const k = Object.keys(r.fails);
    if (!k.length) continue;
    lines.push('- **' + sc.id + ' · ' + d.id + '**' + (r.shot ? ' (사진 ' + r.shot + ')' : ''));
    k.forEach((c) => lines.push('  - ' + c + ': ' + r.fails[c].slice(0, 5).join(' / ') + (r.fails[c].length > 5 ? ' … 외 ' + (r.fails[c].length - 5) : '')));
  }
  return lines.join('\n') + '\n';
}

/**
 * 판정 도구 자체 점검(매번 먼저): 일곱 가지 문제를 일부러 심은 페이지에서 모두 잡고, 깨끗한 페이지에서는 하나도 잡지 않아야 한다.
 */
const BAD_PAGE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif}
  .wide{width:600px;height:10px} .bar{position:fixed;left:0;right:0;bottom:0;height:80px;background:#ccc}
  .cut{width:60px;overflow:hidden;white-space:nowrap} button{outline:none} input{font-size:13px}</style>
  <div class=wide></div><button style="height:30px">작다</button><input aria-label="글"><div class=cut>아주아주긴글자가잘린다</div>
  <div style="height:1200px"></div><button style="height:60px;width:200px">마지막</button><div class=bar></div>
  <script>console.error('일부러 낸 오류')</script>`;
const GOOD_PAGE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif;padding-bottom:100px}
  .bar{position:fixed;left:0;right:0;bottom:0;height:80px;background:#ccc} button{min-height:48px;min-width:48px} input{font-size:16px;min-height:48px}
  :focus{outline:3px solid blue}</style><button>좋다</button><input aria-label="글"><div style="height:1200px"></div><button>마지막</button><div class=bar></div>`;
async function selfTest(browser) {
  const run = async (html) => {
    const page = await browser.newPage(Object.assign({ viewport: { width: 360, height: 800 } }, MOBILE));
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.setContent(html);
    const r = await inspect(page, { phone: true, w: 360 });
    const f = await focusCheck(page, 10);
    await page.close();
    return { 넘침: r.over, 작은칸: r.small.length > 0, 입력글자: r.inputFont.length > 0, 가림: r.covered.length > 0, 잘림: r.clipped.length > 0, 포커스: f.length > 0, 콘솔: errs.length > 0 };
  };
  const bad = await run(BAD_PAGE), good = await run(GOOD_PAGE);
  const missed = Object.keys(bad).filter((k) => !bad[k]), noisy = Object.keys(good).filter((k) => good[k]);
  if (missed.length || noisy.length) throw new Error('판정 도구 자체 점검 실패 — 못 잡음: ' + missed.join(',') + ' / 깨끗한 페이지에서 잡음: ' + noisy.join(','));
  console.log('판정 도구 자체 점검: 일곱 가지 모두 잡고, 깨끗한 페이지는 통과');
}

async function main() {
  const args = process.argv.slice(2);
  const baseArg = (args.find((a) => a.startsWith('--base=')) || '').slice(7);
  const want = args.filter((a) => !a.startsWith('--'));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = makeApp({ now: NOW, seed });
  const screens = screenList(app).filter((sc) => !want.length || want.some((w) => sc.id === w || sc.id.split(':')[0] === w));
  const browser = await launchKo();
  await selfTest(browser);
  const results = {};
  const t0 = Date.now();
  try {
    for (const sc of screens) {
      for (const dev of DEVICES) {
        let r;
        try { r = await checkOne(browser, app, sc, dev); } catch (e) { r = { error: String(e.message || e).split('\n')[0].slice(0, 160) }; }
        (results[sc.id] = results[sc.id] || {})[dev.id] = r;
      }
      const row = DEVICES.map((d) => { const r = results[sc.id][d.id]; return r.error ? 'E' : Object.keys(r.fails).length ? 'x' : '.'; }).join('');
      console.log(row + '  ' + sc.id);
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ now: NOW, devices: DEVICES, screens, results }, null, 1));
  const cmp = baseArg ? compare(JSON.parse(fs.readFileSync(baseArg, 'utf8')), results, screens) : '';
  fs.writeFileSync(path.join(OUT, 'report.md'), cmp + reportMd(results, screens));
  if (cmp) console.log(cmp.split('\n').slice(2, 3).join(''));
  console.log('끝: ' + screens.length + '화면 × ' + DEVICES.length + '기기, ' + Math.round((Date.now() - t0) / 1000) + '초 → ' + path.relative(process.cwd(), path.join(OUT, 'report.md')));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { DEVICES, screenList, inspect, focusCheck };
