/**
 * D19 2단계(시안만, 코드 병합 없음): 전체 컨셉 A·B·C를 실제 src/ui 화면(가짜 서버)에 CSS만 덧씌워 찍고, 안마다 화면 묶음 보드를 만든다.
 * 실행: node design/preview/concepts.js [now a b c] [--font150]
 *   → design/preview/out/concepts/<안>-<화면>.png, 보드 board-<안>-phone.png · board-<안>-laptop.png · summary.png, 측정 report.json
 * 쓸 사진은 docs/design/concepts/ 로 복사한다(out/은 Git에 올리지 않는다). 이름·숫자는 모두 가짜 데이터, 가짜 오늘 2027-03-26 15:20.
 * 덧씌우는 CSS는 design/preview/concepts/<안>.css. Styles.html·화면 파일은 건드리지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');
const { rootCss } = require('./concepts/palette.js');

const OUT = path.join(__dirname, 'out', 'concepts');
const E = { admin: 'test.admin@example.com', att: 'test.attendance@example.com', hall: 'test.teacher@example.com', hr: 'test.homeroom@example.com', student: 'test.student@example.com', parent: 'test.parent@example.com' };
const NOW = '2027-03-26T15:20:00';
const SPECS = [['병결', 'ALL'], ['학원(보강 포함)', '20:10-21:30'], ['가정사유(가족여행 포함)', '18:30-20:00'], ['병결', 'ALL'], ['학원(보강 포함)', '18:30-20:00'], ['병지각', '18:30-20:00']];
const CONCEPTS = [{ id: 'now', label: '지금' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
const PHONE = { w: 360, h: 760 }, LAPTOP = { w: 1366, h: 768 };

const click = async (s, loc) => { await loc.first().click({ timeout: 4000 }).catch((e) => console.log('   (누르기 실패: ' + e.message.split('\n')[0] + ')')); await s.settle(); await s.page.waitForTimeout(400); };
const SCREENS = [
  { id: 'p-home-hall', dev: 'phone', label: '학사교사 홈', email: E.hall, query: 'role=hall_teacher' },
  { id: 'p-home-admin', dev: 'phone', label: '관리자 홈', email: E.admin, query: 'role=admin' },
  { id: 'p-home-student', dev: 'phone', label: '학생 홈', email: E.student, query: '' },
  { id: 'p-home-parent', dev: 'phone', label: '학부모 홈', email: E.parent, query: '' },
  { id: 'p-inbox', dev: 'phone', label: '확인함', email: E.admin, query: 'page=inbox' },
  { id: 'p-requests', dev: 'phone', label: '요청 처리(특이사항)', email: E.att, query: 'page=exceptions', act: async (s) => { await click(s, s.page.locator('.seg', { hasText: '요청 처리' })); } },
  { id: 'p-facility', dev: 'phone', label: '시설 일지 쓰기', email: E.student, query: 'page=facility',
    act: async (s) => { await s.page.getByText('특강실', { exact: true }).first().click().catch(() => {}); await s.page.getByLabel('시작').fill('15:30').catch(() => {}); await s.page.getByLabel('끝나는 시각').fill('17:00').catch(() => {}); } },
  { id: 'p-confirm', dev: 'phone', label: '확인 창', email: E.att, query: 'page=exceptions', fixed: true, act: async (s) => { await openConfirm(s); } },
  { id: 'l-home-admin', dev: 'laptop', label: '관리자 홈', email: E.admin, query: 'role=admin' },
  { id: 'l-home-att', dev: 'laptop', label: '출결 담당 홈', email: E.att, query: 'role=attendance' },
  { id: 'l-results', dev: 'laptop', label: '출결 결과 격자', email: E.att, query: 'page=results' },
  { id: 'l-counsel', dev: 'laptop', label: '상담일지 목록 | 상세', email: E.hall, query: 'page=counsel', act: async (s) => { await click(s, s.page.locator('.ld-pick')); } }
];
/** 요청 한 건을 열어 '취소 처리' 확인 창(사유 입력)을 띄운다 — 화면마다 버튼 이름이 달라 차례로 시도 */
async function openConfirm(s) {
  await click(s, s.page.locator('.seg', { hasText: '요청 처리' }));
  for (const name of [/취소/, /확정/]) { const b = s.page.locator('main').getByRole('button', { name }).filter({ visible: true }); if (await b.count()) await click(s, b); if (await s.page.locator('.sheet').count()) return; }
}

function prep(app) {
  const stu = app.env.rows('students');
  stu.slice(0, 6).forEach((st, i) => { try { app.env.call(E.att, 'saveException', { studentId: st.id, from: '2027-03-26', to: i % 3 === 0 ? '2027-03-27' : '2027-03-26', blocks: SPECS[i][1], type: SPECS[i][0], reason: '가짜 사유' }); } catch (e) { /* 권한 밖 */ } });
  let n = 0;
  stu.slice(6).forEach((st) => { if (n >= 3) return; [E.hr, E.hall].forEach((who) => { if (n >= 3) return; try { const r = app.env.call(who, 'saveException', { studentId: st.id, from: '2027-03-29', to: '2027-03-29', blocks: 'ALL', type: '병결', reason: '가짜' }); if (r && r.ok) n++; } catch (e) { /* 권한 밖 */ } }); });
}

/** 기준 측정: 가로 넘침, 48px 미만 누르는 칸(휴대폰), 화면에 보이는 글자의 최저 대비(WCAG) */
async function measure(page, phone) {
  return page.evaluate((phone) => {
    const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[aria-hidden="true"]'); };
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true }), memo = {};   // oklch()·color-mix()도 읽게 캔버스로 풀어 낸다
    const rgba = (s) => { if (memo[s]) return memo[s]; cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = String(s); cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; const a = d[3] / 255; return (memo[s] = a ? [d[0], d[1], d[2], Math.round(a * 100) / 100] : [0, 0, 0, 0]); };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
    const over = (top, bot) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)).concat(1); };
    const bgOf = (el) => { const st = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/tablewrap/.test(e.className)) return null; const c = rgba(cs.backgroundColor); if (c[3] > 0) { st.push(c); if (c[3] === 1) break; } } let b = [255, 255, 255, 1]; for (let i = st.length - 1; i >= 0; i--) b = over(st[i], b); return b; };
    let worst = { r: 99, what: '' }; const small = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (!vis(el) || el.closest('.sr-only')) return;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      const cs = getComputedStyle(el), bg = bgOf(el); if (!bg) return;
      const fg = over(rgba(cs.color), bg), a = lum(fg), b = lum(bg), r = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      if (r < worst.r) worst = { r: Math.round(r * 100) / 100, what: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' "' + el.textContent.trim().slice(0, 12) + '"' };
    });
    if (phone) document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary').forEach((el) => {
      if (!vis(el)) return; const t = (el.type || '').toLowerCase(); const lab = (t === 'checkbox' || t === 'radio') ? el.closest('label') : null; const r = (lab || el).getBoundingClientRect();
      if (r.height < 47.5 || r.width < 47.5) small.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    });
    return { over: document.documentElement.scrollWidth > window.innerWidth + 1, small, worst };
  }, phone);
}

async function shootAll(browser, want, font150) {
  const report = {};
  for (const c of CONCEPTS) {
    if (want.length && !want.includes(c.id)) continue;
    const read = (f) => fs.readFileSync(path.join(__dirname, 'concepts', f), 'utf8');
    const css = c.id === 'now' ? '' : rootCss(c.id) + read('common.css') + read(c.id + '.css');
    for (const sc of SCREENS) {
      if (font150 && sc.dev !== 'phone') continue;
      const app = makeApp({ now: NOW }); seed(app.env); prep(app);
      const size = sc.dev === 'phone' ? PHONE : LAPTOP;
      const s = await openPage(browser, app, { email: sc.email, query: sc.query, size, context: Object.assign({ timezoneId: 'Asia/Seoul', deviceScaleFactor: font150 ? 1 : 2 }) });
      if (css) await s.page.addStyleTag({ content: css });
      if (font150) await s.page.addStyleTag({ content: 'html { font-size: 27px !important; }' });
      await s.settle();
      if (sc.act) await sc.act(s);
      await s.settle(); await s.page.waitForTimeout(300);
      const m = await measure(s.page, sc.dev === 'phone');
      (report[c.id] = report[c.id] || {})[sc.id] = m;
      if (!font150) {
        const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
        if (!sc.fixed) await s.page.setViewportSize({ width: size.w, height: Math.min(Math.max(size.h, h), sc.dev === 'phone' ? 2400 : 1500) });
        await s.page.waitForTimeout(150);
        await s.page.screenshot({ path: path.join(OUT, c.id + '-' + sc.id + '.png') });
      }
      console.log(`${font150 ? '150% ' : ''}${c.id}-${sc.id} 넘침=${m.over} 48px미만=${m.small.length}${m.small.length ? ' [' + m.small.slice(0, 3).join(', ') + ']' : ''} 최저대비=${m.worst.r} ${m.worst.r < 4.5 ? m.worst.what : ''}`);
      await s.close();
    }
  }
  fs.writeFileSync(path.join(OUT, (font150 ? 'report150-' : 'report-') + (want.join('') || 'all') + '.json'), JSON.stringify(report, null, 1));
}

/** 보드: 찍은 사진들을 한 장에 묶는다(화면 이름 표시). 휴대폰은 위쪽 cropH만 */
async function board(browser, file, title, sub, items, o) {
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
  const html = `<meta charset="utf-8"><style>
    body{margin:0;padding:40px 44px 44px;background:#e9eaee;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;color:#16181d;width:${o.width}px;box-sizing:border-box}
    h1{font-size:34px;margin:0 0 6px;letter-spacing:0} .sub{font-size:19px;color:#4a4f5a;margin:0 0 28px;max-width:1500px;line-height:1.5}
    .grid{display:grid;grid-template-columns:repeat(${o.cols},1fr);gap:${o.gap || 28}px ${o.gap || 28}px;align-items:start}
    figure{margin:0} figcaption{font-size:18px;font-weight:700;margin:0 0 8px;color:#16181d} figcaption small{font-weight:400;color:#5b616e;font-size:15px;margin-left:6px}
    .f{overflow:hidden;border-radius:${o.phone ? 22 : 10}px;box-shadow:0 2px 14px rgba(20,24,36,.16);background:#fff;${o.cropH ? 'max-height:' + o.cropH + 'px;' : ''}}
    .f img{display:block;width:100%}
  </style><h1>${title}</h1><p class="sub">${sub}</p><div class="grid">${items.map((it) => `<figure><figcaption>${it.label}${it.note ? '<small>' + it.note + '</small>' : ''}</figcaption><div class="f"><img src="${img(it.file)}"></div></figure>`).join('')}</div>`;
  const page = await browser.newPage({ viewport: { width: o.width, height: 800 }, deviceScaleFactor: 1 });
  await page.setContent(html); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  await page.close();
  console.log('보드: ' + file);
}

const INFO = fs.existsSync(path.join(__dirname, 'concepts', 'info.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'concepts', 'info.json'), 'utf8')) : {};
async function boards(browser, want) {
  for (const c of CONCEPTS) {
    if (want.length && !want.includes(c.id)) continue;
    const inf = INFO[c.id] || { name: c.label, line: '' };
    await board(browser, `board-${c.id}-phone.png`, `${inf.name} — 휴대폰`, inf.line, SCREENS.filter((s) => s.dev === 'phone').map((s) => ({ label: s.label, file: `${c.id}-${s.id}.png` })), { width: 1720, cols: 4, cropH: 860, phone: true });
    await board(browser, `board-${c.id}-laptop.png`, `${inf.name} — 노트북`, inf.line, SCREENS.filter((s) => s.dev === 'laptop').map((s) => ({ label: s.label, file: `${c.id}-${s.id}.png` })), { width: 2400, cols: 2, cropH: 720 });
  }
  if (!want.length || want.length === CONCEPTS.length) {
    for (const [sid, name] of [['p-home-admin', '관리자 홈'], ['p-home-student', '학생 홈']])
      await board(browser, `summary-${sid}.png`, `같은 화면 나란히 — ${name}`, '왼쪽부터 지금 · A · B · C. 실제 화면에 색·글자·간격 규칙만 덧씌운 시안입니다(이름·숫자는 가짜).', CONCEPTS.map((c) => ({ label: (INFO[c.id] || {}).name || c.label, file: `${c.id}-${sid}.png` })), { width: 1720, cols: 4, cropH: 1500, phone: true });
  }
}

async function main() {
  const args = process.argv.slice(2), font150 = args.includes('--font150'), only = args.includes('--boards');
  const want = args.filter((a) => !a.startsWith('--'));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try { if (!only) await shootAll(browser, want, font150); if (!font150) await boards(browser, want); } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { SCREENS, E, NOW, PHONE, LAPTOP, prep, measure, board };
