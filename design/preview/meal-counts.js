/** D8 미리보기: 식수 집계(가짜 데이터)를 크로미움 A4 세로로 그려 PDF 1쪽과 PNG를 확인한다. node design/preview/meal-counts.js → design/preview/out/meal-counts.{html,pdf,png} */
const fs = require('fs');
const path = require('path');
const { loadGs } = require('../../tests/helpers/harness');
const { buildModel } = require('./meal-counts-fixture');
const OUT = path.join(__dirname, 'out');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/MealCountsHtml.gs']);
  const html = ctx.printRenderMealCounts_(buildModel(), {});
  const file = path.join(OUT, 'meal-counts.html');
  fs.writeFileSync(file, html);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await page.goto('file://' + file);
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  fs.writeFileSync(path.join(OUT, 'meal-counts.pdf'), pdf);
  await page.locator('section.page').screenshot({ path: path.join(OUT, 'meal-counts.png') });
  await browser.close();
  console.log('식수 집계: PDF ' + pages + '쪽(기대 1쪽)' + (pages === 1 ? ' ✓' : ' ✗'));
  if (pages !== 1) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
