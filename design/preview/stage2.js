/**
 * D6 정적 시안: 2단계 화면(F3 근무표·교대, F4 OUT, F6 입퇴실, F7 급식·식수, 역할별 홈)을
 * Styles + Client + Components(UI.*)로 한 쪽씩 그려 360px·1280px PNG로 찍는다. 실행: node design/preview/stage2.js [id…]
 * 실제 화면 코드가 아니다(서버 호출 없음, 이름은 모두 가짜). 결과: design/preview/out/stage2/<id>-360.png·-1280.png, index.html
 * 확인: 가로 스크롤 없음(360), 누르는 칸 48px 이상, 브라우저 오류 없음. npm test 에는 넣지 않는다(브라우저 필요).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'stage2');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const inc = (f) => read(f).replace(/<\?!=[^?]*\?>/g, '');
const SIZES = [{ w: 360, h: 800 }, { w: 1280, h: 800 }];

function build() {
  const note = '<style>.proto-note{border:1.5px dashed var(--accent);background:var(--accent-weak);color:var(--accent-ink);border-radius:var(--radius-sm);padding:8px 12px;margin-bottom:12px;font-size:var(--font-sm)}.proto-note::before{content:"시안 · ";font-weight:700}</style>';
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    inc('src/ui/Styles.html') + note + '</head><body><div id="app"></div>' + inc('src/ui/Client.html') + inc('src/ui/Components.html') +
    '<script>' + fs.readFileSync(path.join(__dirname, 'stage2-screens.js'), 'utf8') + '</script></body></html>';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'index.html');
  fs.writeFileSync(file, build());
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const probe = await browser.newPage();
  await probe.goto('file://' + file);
  const ids = await probe.evaluate(() => ORDER.map((k) => ({ id: k, sheet: SCREENS[k].sheet, label: SCREENS[k].label })));
  await probe.close();
  const want = process.argv.slice(2);
  const problems = [];
  for (const s of ids.filter((x) => !want.length || want.includes(x.id))) {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, locale: 'ko-KR' });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('file://' + file + '#' + s.id);
      await page.waitForSelector('body[data-ready="1"]');
      await page.waitForTimeout(60);
      const info = await page.evaluate(() => {
        const vis = (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
        const small = Array.from(document.querySelectorAll('.btn,.chip,.seg,.tab,.picker-item,.cal-day,.back,select,input:not([type=checkbox]),.check,textarea'))
          .filter((e) => vis(e) && e.offsetHeight < 48).map((e) => (e.className || e.tagName) + ':' + e.offsetHeight);
        return { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, small };
      });
      const conf = await page.evaluate(() => {
        const o = window.__confirm; if (!o) return null;
        return { want: { lead: o.lead || '', lines: o.lines || [], confirmText: o.confirmText || '', danger: !!o.danger },
          got: { lead: (document.querySelector('.sheet .sheet-lead') || {}).textContent || '', lines: Array.from(document.querySelectorAll('.sheet .sheet-body li')).map((e) => e.textContent),
            confirmText: Array.from(document.querySelectorAll('.sheet .sheet-actions .btn')).pop().textContent, danger: !!document.querySelector('.sheet .sheet-actions .btn.danger') } };
      });
      if (conf && JSON.stringify(conf.want) !== JSON.stringify(conf.got)) problems.push(s.id + '@' + size.w + ' 확인창이 준 값과 다르게 그려짐 ' + JSON.stringify(conf));
      if (info.scrollW > size.w) problems.push(s.id + '@' + size.w + ' 가로 스크롤 ' + info.scrollW);
      if (info.small.length) problems.push(s.id + '@' + size.w + ' 48px 미만 ' + info.small.join(','));
      if (errors.length) problems.push(s.id + '@' + size.w + ' 오류 ' + errors.join('|'));
      if (!s.sheet) await page.setViewportSize({ width: size.w, height: Math.min(Math.max(size.h, info.scrollH), 3200) });
      await page.screenshot({ path: path.join(OUT, s.id + '-' + size.w + '.png') });
      await page.close();
    }
    console.log('찍음: ' + s.id + ' — ' + s.label);
  }
  await browser.close();
  if (problems.length) { console.error('문제 ' + problems.length + '건\n' + problems.join('\n')); process.exit(1); }
  console.log('통과: ' + ids.length + '화면 × 2크기, 가로 스크롤·48px·오류 없음 → ' + OUT);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { build };
