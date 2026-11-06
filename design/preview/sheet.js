/**
 * D4 미리보기: 픽스처 4종 → HTML(design/preview/out/sheet-*.html) → 크로미움 인쇄(A4 가로, 배율 100%) → PDF 쪽 수 확인 + PNG.
 * 실행: node design/preview/sheet.js [--png]   (out/은 Git에 올리지 않는다)
 * 끝에서 적대적 입력(긴 이름·미배정 180명·블록 5개·행 21개·특이사항 120명 등, design/preview/stress.js)도 점검한다. 어느 쪽이든 내용이 잘리면 실패.
 * 쪽 수가 기대(보통 1쪽, 특이사항 목록이 넘치면 뒷면 포함 2쪽)와 다르면 오류로 끝난다.
 */
const fs = require('fs');
const path = require('path');
const { loadGs } = require('../../tests/helpers/harness');

const OUT = path.join(__dirname, 'out');
const DAYS = ['mon_thu', 'fri', 'sat', 'sun'];

function render(day) {
  const ctx = loadGs(['src/print/AttendanceSheetHtml.gs']);
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sheet-model.' + day + '.json'), 'utf8'));
  return { model, html: ctx.printRenderSheet_(model, {}) };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  let bad = 0;
  for (const day of DAYS) {
    const { model, html } = render(day);
    const file = path.join(OUT, 'sheet-' + day + '.html');
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 });
    await page.goto('file://' + file);
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    fs.writeFileSync(path.join(OUT, 'sheet-' + day + '.pdf'), pdf);
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('section.page')).map((s, i) => ({
      i, over: s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1
    })).filter((x) => x.over));
    const want = loadGs(['src/print/AttendanceSheetHtml.gs']).printSheetPlan_(model, {}).pages;
    const ok = pages === want && !overflow.length;
    if (!ok) bad++;
    console.log(day + ': PDF ' + pages + '쪽(기대 ' + want + '쪽, 공간 ' + model.spaces.length + '개를 한 장에)' + (overflow.length ? ', 넘침 ' + JSON.stringify(overflow) : '') + (ok ? ' ✓' : ' ✗'));
    if (process.argv.includes('--png') || day === 'mon_thu' || day === 'sun') {
      const secs = page.locator('section.page');
      await secs.nth(0).screenshot({ path: path.join(OUT, 'sheet-' + day + '.png') });
      if (await secs.count() > 1) await secs.nth(1).screenshot({ path: path.join(OUT, 'sheet-' + day + '-back.png') });
    }
    await page.close();
  }
  const stressBad = await require('./stress').runAll(browser);
  await browser.close();
  if (bad || stressBad) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { render };
