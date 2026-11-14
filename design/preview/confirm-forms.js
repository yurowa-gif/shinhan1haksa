/** D9 미리보기: 확인서 두 종(가짜 학생)을 크로미움 A4 세로로 그려 PDF 1쪽 + 실제 종이 모양 PNG를 만든다.
 *  node design/preview/confirm-forms.js → design/preview/out/confirm-<이름>.{html,pdf,png}. 폭이 425pt(인쇄 폭 150mm)를 넘거나 2쪽이면 실패한다. */
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { loadGs } = require('../../tests/helpers/harness');
const fx = require('./confirm-forms-fixture');
const OUT = path.join(__dirname, 'out');
const CASES = [['meal-stop', 'printRenderMealConfirm_', fx.mealStop], ['meal-serve', 'printRenderMealConfirm_', fx.mealServe],
  ['move-leave', 'printRenderMoveConfirm_', fx.moveLeave], ['move-enter', 'printRenderMoveConfirm_', fx.moveEnter]];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/ConfirmFormsHtml.gs']);
  const browser = await require('./browser.js').launchKo();
  let bad = 0;
  for (const [name, fn, make] of CASES) {
    const html = ctx[fn](make(), {});
    const file = path.join(OUT, 'confirm-' + name + '.html');
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2, locale: 'ko-KR' });
    await page.goto('file://' + file);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    const pdfFile = path.join(OUT, 'confirm-' + name + '.pdf');
    fs.writeFileSync(pdfFile, pdf);
    const w = await page.evaluate(() => { const s = document.querySelector('section.page'); return { section: s.getBoundingClientRect().width, inner: s.scrollWidth, h: s.getBoundingClientRect().height }; });
    await page.close();
    try { execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', pdfFile, path.join(OUT, 'confirm-' + name)]); } catch (e) { console.log('pdftoppm이 없어 PNG는 건너뜀: ' + pdfFile); }
    const fit = w.section <= 425.2 * 4 / 3 + 0.5 && w.inner <= w.section + 0.5;   // 150mm = 425.2pt
    const ok = pages === 1 && fit;
    if (!ok) bad++;
    console.log('확인서 ' + name + ': PDF ' + pages + '쪽(기대 1쪽), 내용 폭 ' + Math.round(w.section * 3 / 4 * 10) / 10 + 'pt(≤425.2), 내용 높이 ' + Math.round(w.h * 3 / 4) + 'pt' + (ok ? ' ✓' : ' ✗'));
  }
  await browser.close();
  if (bad) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
