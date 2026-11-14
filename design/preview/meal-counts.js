/** D8 미리보기: 식수 집계(가짜 데이터)를 크로미움 A4 세로로 그려 PDF 1쪽과 PNG를 확인한다(학기 날짜 + 방학 날짜 중식 열). node design/preview/meal-counts.js → design/preview/out/meal-counts[-vacation].{html,pdf,png} */
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { loadGs } = require('../../tests/helpers/harness');
const { buildModel } = require('./meal-counts-fixture');
const OUT = path.join(__dirname, 'out');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/MealCountsHtml.gs']);
  const browser = await require('./browser.js').launchKo();
  let bad = 0;
  for (const [name, model] of [['meal-counts', buildModel()], ['meal-counts-vacation', buildModel({ vacation: true })]]) {
    const html = ctx.printRenderMealCounts_(model, {});
    const file = path.join(OUT, name + '.html');
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2, locale: 'ko-KR' });
    await page.goto('file://' + file);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    const pdfFile = path.join(OUT, name + '.pdf');
    fs.writeFileSync(pdfFile, pdf);
    // 여백 14mm → A4 세로 인쇄 폭 515.9pt(= 687.9px). 내용이 더 넓으면 크롬은 조용히 줄여서 맞추고 Apps Script 변환기는 오른쪽이 잘릴 수 있다
    const w = await page.evaluate(() => ({ section: document.querySelector('section.page').getBoundingClientRect().width, inner: document.querySelector('section.page').scrollWidth }));
    await page.locator('section.page').screenshot({ path: path.join(OUT, name + '-section.png') });
    await page.close();
    // 실제 PDF 쪽을 그림으로 찍어 여백·축소가 보이게 한다
    try {
      execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', pdfFile, path.join(OUT, name)]);
    } catch (e) {
      console.log('pdftoppm이 없어 PDF 쪽 그림(' + name + '.png)은 건너뜀. PDF: ' + pdfFile + ', 내용 그림: ' + path.join(OUT, name + '-section.png'));
    }
    const fit = w.section <= 515.9 * 4 / 3 + 0.5 && w.inner <= w.section + 0.5;
    console.log('식수 집계(' + name + '): PDF ' + pages + '쪽(기대 1쪽), 내용 폭 ' + Math.round(w.section * 3 / 4 * 10) / 10 + 'pt(인쇄 폭 515.9pt 이내여야 함)' + (pages === 1 && fit ? ' ✓' : ' ✗'));
    if (pages !== 1 || !fit) bad++;
  }
  await browser.close();
  if (bad) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
