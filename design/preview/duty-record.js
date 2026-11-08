/**
 * D7 미리보기: 근무 기록표(2027-03 가짜 데이터)를 크로미움 A4 가로로 그려 PDF 쪽 수 1과 PNG를 확인한다.
 * 실행: node design/preview/duty-record.js → design/preview/out/duty-record.{html,pdf,png}. npm test 에는 넣지 않는다(브라우저 필요).
 */
const fs = require('fs');
const path = require('path');
const { loadGs } = require('../../tests/helpers/harness');
const { buildModel } = require('./duty-record-fixture');

const OUT = path.join(__dirname, 'out');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/DutyRecordHtml.gs']);
  const html = ctx.printRenderDutyRecord_(buildModel(), {});
  const file = path.join(OUT, 'duty-record.html');
  fs.writeFileSync(file, html);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 });
  await page.goto('file://' + file);
  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  fs.writeFileSync(path.join(OUT, 'duty-record.pdf'), pdf);
  const info = await page.evaluate(() => {
    const s = document.querySelector('section.page');
    return { h: Math.round(s.getBoundingClientRect().height), w: s.scrollWidth - s.clientWidth };
  });
  await page.locator('section.page').screenshot({ path: path.join(OUT, 'duty-record.png') });
  await browser.close();
  const ok = pages === 1 && info.w <= 1;
  console.log('근무 기록표: PDF ' + pages + '쪽(기대 1쪽), 쪽 높이 ' + info.h + 'px, 가로 넘침 ' + info.w + 'px' + (ok ? ' ✓' : ' ✗'));
  if (!ok) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
