/**
 * D21 시안 2차본(코드 병합 없음): **tweakcn 프리셋 4개**(Mono·Vintage Paper·Starry Night·Supabase) + shadcn/ui 부품 규격 + 21st.dev식 hero + 눈누 한글 웹폰트 + Lucide 아이콘.
 * 1차본(concepts2.js, 직접 지은 색 값)은 그대로 두고, 이 파일은 v2/ 폴더의 테마·CSS를 쓴다.
 * 실행: FONT_DIR=<글꼴 npm 패키지를 받은 폴더> node design/preview/concepts2-v2.js [m p n s] [--font150] [--boards]
 *   → design/preview/out/concepts2v2/<안>-<화면>.png, v2-board-<안>-phone.png · v2-board-<안>-laptop.png · v2-compare-*.png(지금·1차 3안·2차 4안), report.json
 *   비교 그림에는 1차본 사진(out/concepts2/t*.png — concepts2.js로 먼저 찍는다)이 필요하다.
 * 글꼴은 저장소에 넣지 않는다: npm i pretendard wanted-sans @fontsource-variable/hahmlet. 아이콘은 concepts2/icons/*.svg (Lucide, ISC).
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const { SCREENS, NOW, PHONE, LAPTOP, prep, measure, board } = require('./concepts.js');
const { THEMES, rootCss } = require('./concepts2/v2/themes.js');

const DIR = path.join(__dirname, 'concepts2', 'v2'), ICONS = path.join(__dirname, 'concepts2', 'icons'), OUT = path.join(__dirname, 'out', 'concepts2v2'), OUT1 = path.join(__dirname, 'out', 'concepts'), OUTV1 = path.join(__dirname, 'out', 'concepts2');
const FONT_DIR = process.env.FONT_DIR || '', FONT_URL = 'https://fonts.local/';
const FONT_CSS = {   // 글꼴마다: 패키지 안 CSS(잘게 나눈 subset, unicode-range) 위치
  wanted: 'wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.css',
  pretendard: 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css',
  suit: '@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.css',
  hahmlet: '@fontsource-variable/hahmlet/wght.css',
  blackhan: '@fontsource/black-han-sans/korean-400.css'
};
const IDS = ['now', 'm', 'p', 'n', 's'];
const V1 = [['t1', '1차 ① 흑백과 형광펜'], ['t2', '1차 ② 한지와 먹'], ['t3', '1차 ③ 감색 면']];
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

/** Lucide SVG → CSS 변수(--i-이름: url(data:…)) */
function iconCss() {
  const vars = fs.readdirSync(ICONS).filter((f) => f.endsWith('.svg')).map((f) => {
    const svg = fs.readFileSync(path.join(ICONS, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/currentColor/g, '#000').trim();
    return `  --i-${f.replace('.svg', '')}: url("data:image/svg+xml,${encodeURIComponent(svg)}");`;
  });
  return ':root {\n' + vars.join('\n') + '\n}\n';
}
function fontCss(id) {
  if (!FONT_DIR) return '';
  return THEMES[id].use.map((k) => { const rel = FONT_CSS[k], base = FONT_URL + path.dirname(rel) + '/'; return fs.readFileSync(path.join(FONT_DIR, 'node_modules', rel), 'utf8').replace(/url\((['"]?)\.\//g, 'url($1' + base); }).join('\n');
}
async function serveFonts(page, stats) {
  await page.route(FONT_URL + '**', (route) => {
    const file = path.join(FONT_DIR, 'node_modules', decodeURIComponent(route.request().url().slice(FONT_URL.length).split('?')[0]));
    if (!FONT_DIR || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const body = fs.readFileSync(file); stats.bytes += body.length; stats.files++;
    route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body });
  });
}
/** hero: 지금 화면의 첫 카드(오늘·전체 현황·이름)를 '오늘 한눈에' 영역으로 바꾼다. 숫자·글자는 화면에 이미 있는 것만 옮긴다(새 데이터 없음).
 *  실제로 넣을 때는 UI.hero 부품을 만들고 서버 값은 그대로 쓴다. 글자 기호(←·●)도 여기서 지운다(아이콘으로 바뀜) */
async function makeHero(page, bento) {
  await page.evaluate((bento) => {
    if (bento) document.documentElement.dataset.bento = '1';
    document.querySelectorAll('.back').forEach((b) => { b.textContent = b.textContent.replace(/^[←\s]+/, ''); });
    document.querySelectorAll('.pill').forEach((p) => { p.childNodes.forEach((n) => { if (n.nodeType === 3) n.textContent = n.textContent.replace(/^[\s•●▲✓…⊘⛔]+\s*/, ''); }); });
    const home = document.getElementById('home'); if (!home) return;
    const card = home.querySelector('.home-head .card') || home.querySelector(':scope > div > .card'); if (!card) return;
    const text = (el) => (el ? el.textContent.trim() : '');
    const stamp = home.querySelector('.stamp');
    const el = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    card.classList.add('hero');
    const h2 = text(card.querySelector('h2')), sub = text(card.querySelector(':scope > .muted:not(#home-duty)'));
    const todoH = text(home.querySelector('.home-main .home-h')), m = todoH.match(/(\d+)건/);
    const front = [], art = '<div class="hero-art" aria-hidden="true"></div>';
    const cta = card.querySelector(':scope > .row-link:last-of-type') && [...card.querySelectorAll(':scope > .row-link')].find((a) => /확인함/.test(a.textContent));
    if (home.querySelector('.home-main')) {   // 교사 화면: 오늘 날짜 + 처리할 건수 + 버튼 하나(확인함)
      const date = /^오늘/.test(h2) ? h2.replace(/^오늘\s*/, '') + (sub ? ' · ' + sub : '') : sub;
      front.push(el('hero-eyebrow', esc(date)));
      front.push(el('hero-row', '<span class="hero-big">' + (m ? m[1] : '0') + '</span><span class="hero-unit">건</span><span class="hero-cap">오늘 처리할 일</span>'));
    } else {   // 학생·학부모: 이름 + 이번 학기 OUT n/2 + 할 일
      const out = text(home.querySelector('.pt-outline')).match(/(\d+)\s*\/\s*(\d+)/), todo = home.querySelectorAll('.card.todo').length;
      front.push(el('hero-eyebrow', esc(sub)));
      front.push(el('hero-name', esc(h2)));
      front.push(el('hero-facts', (out ? '<div class="hero-fact"><b>' + out[1] + '<small> / ' + out[2] + '</small></b>이번 학기 OUT</div>' : '') + '<div class="hero-fact"><b>' + todo + '<small> 건</small></b>지금 할 일</div>'));
    }
    const main = el('bento-main', art);   // 큰 칸(벤토 배치에서는 이 칸이 가장 큼)
    front.forEach((n) => main.appendChild(n));
    if (cta) { cta.classList.add('hero-cta'); cta.textContent = '확인함 열기'; main.appendChild(cta); }
    card.insertBefore(main, card.firstChild);
    if (!document.documentElement.dataset.bento) { while (main.lastChild) card.insertBefore(main.lastChild, main.nextSibling || null); main.remove(); [...card.children].filter((c) => /hero-(art|eyebrow|row|name|facts)|hero-cta/.test(c.className)).reverse().forEach((c) => card.insertBefore(c, card.firstChild)); const order = ['hero-art', 'hero-eyebrow', 'hero-row', 'hero-name', 'hero-facts', 'hero-cta']; [...card.children].filter((c) => order.some((o) => c.classList.contains(o))).sort((x, y) => order.findIndex((o) => x.classList.contains(o)) - order.findIndex((o) => y.classList.contains(o))).forEach((c, i, arr) => card.insertBefore(c, i === 0 ? card.firstChild : arr[i - 1].nextSibling)); }
    if (stamp) card.parentNode.insertBefore(stamp, card.nextSibling);   // 기준 시각은 hero 아래로
  }, bento);
}

async function shootAll(browser, want, font150) {
  const report = {};
  for (const id of IDS.filter((x) => x !== 'now')) {
    if (want.length && !want.includes(id)) continue;
    const css = rootCss(id) + iconCss() + fontCss(id) + read('base.css') + read(id + '.css');
    for (const sc of SCREENS) {
      if (font150 && sc.dev !== 'phone') continue;
      const app = makeApp({ now: NOW }); seed(app.env); prep(app);
      const size = sc.dev === 'phone' ? PHONE : LAPTOP, stats = { bytes: 0, files: 0 };
      const s = await openPage(browser, app, { email: sc.email, query: sc.query, size, context: { timezoneId: 'Asia/Seoul', deviceScaleFactor: font150 ? 1 : 2 }, onPage: (p) => serveFonts(p, stats) });
      await s.page.addStyleTag({ content: css });
      if (font150) await s.page.addStyleTag({ content: 'html { font-size: 27px !important; }' });
      await s.settle();
      if (sc.act) await sc.act(s);
      await s.settle(); await makeHero(s.page, id === 's');
      await s.page.evaluate(() => document.fonts.ready); await s.page.waitForTimeout(500);
      const m = await measure(s.page, sc.dev === 'phone');
      m.fontKB = Math.round(stats.bytes / 1024); m.fontFiles = stats.files;
      m.fonts = await s.page.evaluate(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))]);
      (report[id] = report[id] || {})[sc.id] = m;
      if (!font150) {
        const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
        if (!sc.fixed) await s.page.setViewportSize({ width: size.w, height: Math.min(Math.max(size.h, h), sc.dev === 'phone' ? 2400 : 1500) });
        await s.page.waitForTimeout(150);
        await s.page.screenshot({ path: path.join(OUT, id + '-' + sc.id + '.png') });
      }
      console.log(`${font150 ? '150% ' : ''}${id}-${sc.id} 넘침=${m.over} 48px미만=${m.small.length}${m.small.length ? ' [' + m.small.slice(0, 3).join(', ') + ']' : ''} 최저대비=${m.worst.r}${m.worst.r < 4.5 ? ' ' + m.worst.what : ''} 글꼴=${m.fontKB}KB/${m.fontFiles}개 ${m.fonts.join('+')}`);
      await s.close();
    }
  }
  fs.writeFileSync(path.join(OUT, (font150 ? 'report150-' : 'report-') + (want.join('') || 'all') + '.json'), JSON.stringify(report, null, 1));
}
async function boards(browser, want) {
  // board()는 out/concepts 를 읽는다 → 같은 함수를 쓰려고 '지금' 사진을 이쪽 폴더로 복사해 두고 OUT 기준 상대 경로로 넘긴다
  const rel = (f) => path.relative(OUT1, path.join(OUT, f));
  for (const sc of SCREENS) { const src = path.join(OUT1, 'now-' + sc.id + '.png'); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, 'now-' + sc.id + '.png')); }
  for (const id of IDS.filter((x) => x !== 'now')) {
    if (want.length && !want.includes(id)) continue;
    const t = THEMES[id];
    await board(browser, rel(`v2-board-${id}-phone.png`), `${t.name} — 휴대폰`, t.line, SCREENS.filter((s) => s.dev === 'phone').map((s) => ({ label: s.label, file: rel(`${id}-${s.id}.png`) })), { width: 1720, cols: 4, cropH: 860, phone: true });
    await board(browser, rel(`v2-board-${id}-laptop.png`), `${t.name} — 노트북`, t.line, SCREENS.filter((s) => s.dev === 'laptop').map((s) => ({ label: s.label, file: rel(`${id}-${s.id}.png`) })), { width: 2400, cols: 2, cropH: 720 });
  }
  if (!want.length) for (const [sid, name] of [['p-home-admin', '관리자 홈'], ['p-home-hall', '학사교사 홈'], ['p-home-student', '학생 홈']]) {
    const v1 = V1.filter(([id]) => fs.existsSync(path.join(OUTV1, `${id}-${sid}.png`))).map(([id, label]) => ({ label, file: path.relative(OUT1, path.join(OUTV1, `${id}-${sid}.png`)) }));
    const items = [{ label: '지금', file: rel(`now-${sid}.png`) }].concat(v1, IDS.filter((x) => x !== 'now').map((id) => ({ label: '2차 ' + THEMES[id].name, file: rel(`${id}-${sid}.png`) })));
    await board(browser, rel(`v2-compare-${sid}.png`), `1차 대 2차 — ${name}`, '윗줄: 지금 화면과 1차본 세 안(직접 지은 색 값). 아랫줄: 2차본 네 안(tweakcn 프리셋 값 그대로). 실제 화면에 덧씌운 시안이며 이름·숫자는 가짜입니다.', items, { width: 1720, cols: 4, cropH: 1300, phone: true });
  }
}
async function main() {
  const args = process.argv.slice(2), font150 = args.includes('--font150'), only = args.includes('--boards');
  const want = args.filter((a) => !a.startsWith('--'));
  fs.mkdirSync(OUT, { recursive: true });
  if (!FONT_DIR) console.log('FONT_DIR가 없어 웹폰트 없이 찍습니다(기기 기본 글꼴).');
  const browser = await launchKo();
  try { if (!only) await shootAll(browser, want, font150); if (!font150) await boards(browser, want); } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
