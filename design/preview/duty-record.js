/**
 * D7 미리보기: 근무 기록표(2027-03 가짜 데이터)를 크로미움 A4 가로로 그려 PDF 쪽 수 1과 PNG를 확인한다.
 * 실행: node design/preview/duty-record.js → design/preview/out/duty-record.{html,pdf,png}. npm test 에는 넣지 않는다(브라우저 필요).
 */
const fs = require('fs');
const path = require('path');
const { loadGs } = require('../../tests/helpers/harness');
const { buildModel } = require('./duty-record-fixture');

const OUT = path.join(__dirname, 'out');

/** 스트레스 입력: 이름이 길고 교사·교대가 많아도 머리말·합계 줄이 한 쪽에 남는지 본다 */
function cases() {
  const base = buildModel();
  const many = (teachers, swaps, longName) => {
    const m = JSON.parse(JSON.stringify(base));
    const names = Array.from({ length: teachers }, (_, i) => (longName ? '가나다라마바사아자' + (i + 1) + '선생' : '교사' + (i + 1)));
    m.teachers = names.map((name, i) => ({ name, cells: {}, standby: [] }));
    let k = 0;
    for (let d = 1; d <= 31; d++) {
      const wd = (d - 1) % 7;
      if (d === 2) continue;
      const slots = wd <= 3 ? ['21:30조', '23:00조'] : ['단독'];
      slots.forEach((c) => { const t = m.teachers[k++ % teachers]; (t.cells['2027-03-' + (d < 10 ? '0' : '') + d] = t.cells['2027-03-' + (d < 10 ? '0' : '') + d] || []).push(c); });
    }
    m.swaps = Array.from({ length: swaps }, (_, i) => ({ date: '2027-03-' + ((i % 28) + 1 < 10 ? '0' : '') + ((i % 28) + 1), slot: i % 3 ? '23:00조' : '단독', from: names[i % teachers], to: names[(i + 1) % teachers], kind: i % 4 ? '교대' : '대신 근무' }));
    return m;
  };
  return [
    ['기본(교사 6·교대 3)', base, 1],
    ['교사 8명 × 교대 20건 + 긴 이름', many(8, 20, true), 1],
    ['교사 12명 × 교대 30건', many(12, 30, false), 1],
    ['교사 14명 × 교대 36건 + 긴 이름(한 쪽을 넘으면 자르지 않고 다음 쪽으로 이어진다)', many(14, 36, true), 2]
  ];
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/DutyRecordHtml.gs']);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  let bad = 0;
  for (const [name, model, want] of cases()) {
    const html = ctx.printRenderDutyRecord_(model, {});
    const slug = name === cases()[0][0] ? 'duty-record' : 'duty-record-stress-' + name.replace(/[^0-9A-Za-z가-힣]+/g, '_');
    const file = path.join(OUT, slug + '.html');
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 });
    await page.goto('file://' + file);
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (slug === 'duty-record') fs.writeFileSync(path.join(OUT, 'duty-record.pdf'), pdf);
    const info = await page.evaluate(() => {
      const s = document.querySelector('section.page');
      return { h: Math.round(s.getBoundingClientRect().height), w: s.scrollWidth - s.clientWidth };
    });
    await page.locator('section.page').screenshot({ path: path.join(OUT, slug + '.png') });
    await page.close();
    const ok = pages === want && info.w <= 1;
    if (!ok) bad++;
    console.log(name + ': PDF ' + pages + '쪽(기대 ' + want + '쪽), 쪽 높이 ' + info.h + 'px, 가로 넘침 ' + info.w + 'px' + (ok ? ' ✓' : ' ✗'));
  }
  await browser.close();
  if (bad) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
