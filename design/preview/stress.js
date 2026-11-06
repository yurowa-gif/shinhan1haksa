/**
 * 출석부 적대적 입력 점검(소유: DESIGN). 실행: node design/preview/stress.js [--png]
 * 평범한 픽스처 4종은 잘 들어가도, 이름이 길거나 미배정이 많거나 블록이 5개이거나 행이 많은 날 칸이 잘리면 안 된다.
 * 각 입력을 크로미움 A4 가로로 그려 ① 어느 section 이든 내용이 넘치면(scrollHeight/Width) 실패 ② 좌석(이름 칸) 수가
 * 모델과 다르면(그려지지 않은 좌석) 실패 ③ 미배정·특이사항 이름이 하나라도 안 보이면 실패한다. 결과는 design/preview/out/ (Git 제외).
 */
const fs = require('fs');
const path = require('path');
const { loadGs } = require('../../tests/helpers/harness');
const { buildModel } = require('./fixtures');

const OUT = path.join(__dirname, 'out');

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function seatCells(m) { const out = []; m.spaces.forEach((sp) => sp.cells.forEach((c) => { if (c.kind === 'seat') out.push(c); })); return out; }

function cases() {
  const base = () => buildModel('mon_thu');
  const list = [];
  const add = (name, mut, day) => { const m = day ? buildModel(day) : base(); mut(m); list.push({ name, model: m }); };
  add('긴 이름 1명', (m) => { const c = seatCells(m).find((x) => x.occupant); c.occupant = { grade: 1, name: '가나다라마바사', display: '1. 가나다라마바사' }; });
  add('긴 공석 문구(옵션)', () => {}, null);
  list[list.length - 1].opts = { vacantLabel: '재적 아님(퇴실 처리 대기)' };
  add('블록 5개', (m) => {
    m.blocks = [1, 2, 3, 4, 5].map((i) => ({ seq: i, start: (13 + i * 2) + ':00', end: (15 + i * 2) + ':00', label: (13 + i * 2) + '–' + (15 + i * 2) }));
    seatCells(m).forEach((c) => { c.marks = m.blocks.map((b, i) => (c.marks[i] || { seq: b.seq, code: 'NONE', text: '' })).map((x, i) => Object.assign({}, x, { seq: i + 1 })); });
  });
  add('1층 21행', (m) => {
    const sp = m.spaces[0]; sp.rows = 21;
    sp.cells.push({ row: 21, col: 3, kind: 'seat', seatLabel: '3-19', occupant: { grade: 1, name: '가온', display: '1. 가온' }, vacant: false, marks: m.blocks.map((b) => ({ seq: b.seq, code: 'NONE', text: '' })) });
  });
  add('3글자 약어', (m) => { seatCells(m).filter((x) => x.occupant).slice(0, 40).forEach((c) => { c.marks = c.marks.map((x) => ({ seq: x.seq, code: 'EXC', text: '병결외' })); }); });
  add('미배정 30명', (m) => { m.unseated = Array.from({ length: 30 }, (_, i) => ({ display: ((i % 3) + 1) + '. 가짜' + (i + 1) })); });
  add('미배정 180명', (m) => { m.unseated = Array.from({ length: 180 }, (_, i) => ({ display: ((i % 3) + 1) + '. 가짜' + (i + 1) })); });
  add('특이사항 120명', (m) => {
    let n = 0;
    seatCells(m).filter((c) => c.occupant).forEach((c) => { if (n++ < 120) c.marks = c.marks.map((x, i) => (i === 0 ? { seq: 1, code: 'EXC', text: '병결' } : x)); });
  }, 'mon_thu');
  add('공간 순서 바뀜(SA가 먼저)', (m) => { m.spaces.push(m.spaces.shift()); });
  add('공간이 없음', (m) => { m.spaces = []; });
  add('긴 공간 이름', (m) => { m.spaces[1].name = 'SA1실(남자 베리타스 전용 자습실 별관)'; });
  add('근무자 이름이 배열이 아님', (m) => { m.dutyNames = '박선생'; m.standbyNames = null; });
  add('일요일 + 특이사항 120명', (m) => {
    let n = 0;
    seatCells(m).filter((c) => c.occupant).forEach((c) => { if (n++ < 120) c.marks = c.marks.map((x, i) => (i === 0 ? { seq: 1, code: 'EXC', text: '병결' } : x)); });
  }, 'sun');
  return list;
}

async function runAll(browser) {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = loadGs(['src/print/AttendanceSheetHtml.gs']);
  let bad = 0;
  for (const c of cases().concat(['mon_thu', 'fri', 'sat', 'sun'].map((d) => ({ name: '기본 ' + d, model: buildModel(d) })))) {
    let html;
    try { html = ctx.printRenderSheet_(clone(c.model), c.opts || {}); } catch (e) { console.log('✗ ' + c.name + ': 예외 ' + e.message); bad++; continue; }
    const file = path.join(OUT, 'stress-' + c.name.replace(/[^\w가-힣]/g, '_') + '.html');
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 1 });
    await page.goto('file://' + file);
    const info = await page.evaluate(() => {
      const secs = Array.from(document.querySelectorAll('section.page'));
      return {
        pages: secs.length,
        over: secs.map((s, i) => ({ i, h: s.scrollHeight - s.clientHeight, w: s.scrollWidth - s.clientWidth })).filter((x) => x.h > 1 || x.w > 1),
        // overflow:hidden 인 칸·상자 안에서 내용이 칸을 넘으면 잘린 것이다(가로·세로)
        clipped: Array.from(document.querySelectorAll('td,div,span')).filter((e) => {
          const st = getComputedStyle(e);
          return (st.overflow === 'hidden' || e.tagName === 'SECTION') && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
        }).slice(0, 3).map((e) => e.textContent.trim().slice(0, 18) + ' [' + (e.scrollWidth - e.clientWidth) + ',' + (e.scrollHeight - e.clientHeight) + ']'),
        names: document.querySelectorAll('td.n').length, text: document.body.innerText
      };
    });
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    const problems = [];
    if (info.over.length) problems.push('넘침 ' + JSON.stringify(info.over));
    if (info.clipped.length) problems.push('잘림 ' + JSON.stringify(info.clipped));
    if (pdfPages !== info.pages) problems.push('PDF ' + pdfPages + '쪽 ≠ section ' + info.pages);
    const model = c.model;
    if (model.operating !== false && model.spaces.length) {
      const seats = seatCells(model).length;
      if (info.names !== seats) problems.push('그려진 좌석 ' + info.names + ' ≠ 모델 ' + seats);
      (model.unseated || []).forEach((u) => { if (info.text.indexOf(u.display) < 0) problems.push('미배정 안 보임: ' + u.display); });
    }
    if (process.argv.includes('--png')) await page.screenshot({ path: file.replace('.html', '.png'), fullPage: true });
    await page.close();
    if (problems.length) bad++;
    console.log((problems.length ? '✗ ' : '✓ ') + c.name + ' — ' + info.pages + '쪽' + (problems.length ? ': ' + problems.join('; ') : ''));
  }
  console.log(bad ? '\n적대적 입력 점검 실패 ' + bad + '건' : '\n적대적 입력 점검 모두 통과');
  return bad;
}

async function main() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const bad = await runAll(browser);
  await browser.close();
  if (bad) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { cases, runAll };
