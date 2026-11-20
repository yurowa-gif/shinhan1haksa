/**
 * D15 ③: refresh-tour.js가 찍은 사진을 묶음 그림으로 만든다.
 *   sheet-<label>-phone-N.png  = 홈 아닌 화면 24개를 휴대폰 360px로 6개씩(위쪽 1250px까지)
 *   sheet-<label>-laptop-N.png = 같은 화면을 노트북 1366×768로 4개씩(2×2)
 *   compare-fixes.png          = 이번에 고친 화면(OUT 탭·상담일지·연락처·일정)의 고치기 전 | 후
 * 실행: node design/preview/refresh-tour-sheets.js <label: after> [before-label: now]
 */
const fs = require('fs');
const path = require('path');
const { launchKo } = require('./browser.js');
const OUT = path.join(__dirname, 'out', 'tour');
const label = process.argv[2] || 'after', before = process.argv[3] || 'now';
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
const name = (f) => f.replace(label + '-', '').replace(/-(phone|laptop)\.png/, '');
async function main() {
  const files = fs.readdirSync(OUT).filter((f) => f.startsWith(label + '-') && !f.includes('home-') && f.endsWith('.png') && !f.startsWith(label + '-sheet'));
  const phones = files.filter((f) => f.endsWith('-phone.png')).sort(), laps = files.filter((f) => f.endsWith('-laptop.png')).sort();
  const browser = await launchKo();
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const mk = async (file, items, w, maxh, perRow) => {
      const cells = items.map((f) => `<figure><figcaption>${name(f)}</figcaption><div style="width:${w}px;max-height:${maxh}px;overflow:hidden"><img style="width:${w}px;display:block" src="${uri(f)}"></div></figure>`).join('');
      await page.setContent(`<style>body{margin:12px;background:#cfd4dc;font:600 13px sans-serif}.g{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;max-width:${perRow * (w + 12)}px}figure{margin:0}img{box-shadow:0 1px 6px rgba(0,0,0,.3);background:#fff}</style><div class=g>${cells}</div>`);
      await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, file), fullPage: true }); console.log(file);
    };
    for (let i = 0; i < phones.length; i += 6) await mk('sheet-' + label + '-phone-' + (i / 6 + 1) + '.png', phones.slice(i, i + 6), 240, 1250, 6);
    for (let i = 0; i < laps.length; i += 4) await mk('sheet-' + label + '-laptop-' + (i / 4 + 1) + '.png', laps.slice(i, i + 4), 620, 360, 2);
    // 고친 화면 고치기 전 | 후
    const fixed = ['outs', 'counsel', 'contacts', 'schedule'];
    const cells = fixed.map((id) => `<div class="pair"><figure><figcaption>${id} · 고치기 전</figcaption><div class="s"><img src="${uri(before + '-' + id + '-phone.png')}"></div></figure><figure><figcaption>${id} · 고친 뒤</figcaption><div class="s"><img src="${uri(label + '-' + id + '-phone.png')}"></div></figure></div>`).join('');
    await page.setContent(`<style>body{margin:12px;background:#cfd4dc;font:700 14px sans-serif}.row{display:flex;gap:18px;flex-wrap:wrap}.pair{display:flex;gap:10px}figure{margin:0}.s{width:300px;max-height:640px;overflow:hidden}img{width:300px;display:block;box-shadow:0 1px 6px rgba(0,0,0,.3);background:#fff}</style><div class=row>${cells}</div>`);
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, 'compare-fixes.png'), fullPage: true }); console.log('compare-fixes.png');
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
