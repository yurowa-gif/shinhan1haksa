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
  add('미배정 30명', (m) => { m.unseated = Array.from({ length: 30 }, (_, i) => ({ display: ((i % 3) + 1) + '. 가짜' + String(i + 1).padStart(3, '0') })); });
  add('미배정 180명', (m) => { m.unseated = Array.from({ length: 180 }, (_, i) => ({ display: ((i % 3) + 1) + '. 가짜' + String(i + 1).padStart(3, '0') })); });
  add('특이사항 120명', (m) => {
    let n = 0;
    seatCells(m).filter((c) => c.occupant).forEach((c) => { if (n++ < 120) c.marks = c.marks.map((x, i) => (i === 0 ? { seq: 1, code: 'EXC', text: '병결' } : x)); });
  }, 'mon_thu');
  add('공간 순서 바뀜(SA가 먼저)', (m) => { m.spaces.push(m.spaces.shift()); });
  add('공간이 없음', (m) => { m.spaces = []; });
  add('긴 공간 이름', (m) => { m.spaces[1].name = 'SA1실(남자 베리타스 전용 자습실 별관)'; });
  add('근무자 이름이 배열이 아님', (m) => { m.dutyNames = '박선생'; m.standbyNames = null; });
  add('일요일 4칸 약어가 모두 다름', (m) => {
    const words = ['병결', '무지', '외출 1', '상담'];
    seatCells(m).filter((c) => c.occupant).slice(0, 14).forEach((c) => { c.marks = c.marks.map((x, i) => ({ seq: i + 1, code: 'EXC', text: words[i] })); });
  }, 'sun');
  add('작은 방 3줄×5행 + 2줄×30행', (m) => {
    const mk = (id, name, cols, rows) => {
      const cells = [];
      for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
        cells.push({ row: r, col: c, kind: 'seat', seatLabel: String(cells.length + 1), occupant: { grade: 1 + (r % 3), name: '방' + id + r + c, display: (1 + (r % 3)) + '. 방' + id + r + c }, vacant: false, marks: m.blocks.map((b) => ({ seq: b.seq, code: 'NONE', text: '' })) });
      }
      return { id, name, gender: '혼성', rows, cols, cells };
    };
    m.spaces.push(mk('X1', '3줄방', 3, 5), mk('X2', '긴 2줄방', 2, 30));
  });
  add('큰 2층 공간 추가(20행×8줄)', (m) => {
    const big = clone(m.spaces[0]); big.id = 'f2'; big.name = '2층 자습실';
    big.cells.forEach((c) => { if (c.occupant) { c.occupant.name = '이층' + c.seatLabel; c.occupant.display = c.occupant.grade + '. 이층' + c.seatLabel; } });
    m.spaces.push(big);
  });
  add('영문 대문자 이름 미배정 60명', (m) => { m.unseated = Array.from({ length: 60 }, (_, i) => ({ display: '1. WWWWWMMMM' + String(i).padStart(2, '0') })); });
  add('긴 제목 + 근무자 5명', (m) => { m.title = '신한학사 출석부 특별 보충 자습 시간 운영 결과 기록용 아주 긴 제목'; m.dutyNames = ['가나다라마', '바사아자차', '카타파하가', '나다라마바', '사아자차카']; m.standbyNames = ['타파하가나', '다라마바사']; });
  add('특별 코드 평일(dayType 가 holiday)', (m) => { m.dayType = 'holiday'; });
  list[list.length - 1].mustNot = ['예비'];   // 실제 요일이 수요일이라 예비 감독 칸이 없어야 한다
  add('격자 밖 좌석 2개', (m) => {
    const base = m.spaces[1].cells.find((c) => c.kind === 'seat');
    [1, 2].forEach((k) => m.spaces[1].cells.push(Object.assign(clone(base), { row: 30 + k, col: 1, seatLabel: 'X' + k })));
  });
  list[list.length - 1].must = ['격자 밖 좌석 2개'];
  add('1줄방 40행 + 긴 이름 + 1층 16행', (m) => {
    m.spaces[0].rows = 16; m.spaces[0].cells = m.spaces[0].cells.filter((c) => c.row <= 16);
    const cells = [];
    for (let r = 1; r <= 40; r++) cells.push({ row: r, col: 1, kind: 'seat', seatLabel: String(r), occupant: { grade: 1, name: r === 5 ? '가나다라마바사아자' : '줄' + r, display: '1. ' + (r === 5 ? '가나다라마바사아자' : '줄' + r) }, vacant: false, marks: m.blocks.map((b) => ({ seq: b.seq, code: 'NONE', text: '' })) });
    m.spaces.push({ id: 'one', name: '한 줄 방', gender: '혼성', rows: 40, cols: 1, cells });
  });
  add('평일 + 상담실 옆 자습실 1줄×2행 + 미배정 2명', (m) => {
    const cells = [1, 2].map((r) => ({ row: r, col: 1, kind: 'seat', seatLabel: String(r), occupant: { grade: 2, name: '옆방' + r, display: '2. 옆방' + r }, vacant: false, marks: m.blocks.map((b) => ({ seq: b.seq, code: 'NONE', text: '' })) }));
    m.spaces.push({ id: 'side', name: '상담실 옆 자습실', gender: '혼성', rows: 2, cols: 1, cells });
    m.unseated = [{ display: '3. 미배정가' }, { display: '3. 미배정나' }];
  });
  [13, 14].forEach((n) => add('mw 이름 미배정 ' + n + '명', (m) => { m.unseated = Array.from({ length: n }, (_, i) => ({ display: '1. mwmwmwmwmw' + String(i).padStart(2, '0') })); }));
  add('같은 칸에 좌석 둘', (m) => {
    const a = m.spaces[1].cells.find((c) => c.kind === 'seat');
    m.spaces[1].cells.push(Object.assign(clone(a), { occupant: { grade: 3, name: '겹침이', display: '3. 겹침이' } }));
  });
  list[list.length - 1].must = ['가려진 학생 3. 겹침이'];
  add('빈 공간(cells 없음·rows 0)', (m) => {
    m.spaces.push({ id: 'e1', name: '빈 공간 가', gender: '혼성', rows: 5, cols: 2, cells: [] }, { id: 'e2', name: '빈 공간 나', gender: '혼성', rows: 0, cols: 0, cells: [] });
  });
  add('블록 label 없음', (m) => { m.blocks.forEach((b) => { delete b.label; }); });
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
        over: secs.map((s, i) => ({ i, h: Math.round(s.getBoundingClientRect().height - 544 * 4 / 3), w: s.scrollWidth - s.clientWidth })).filter((x) => x.h > 1 || x.w > 1),
        // overflow:hidden 인 칸·상자 안에서 내용이 칸을 넘으면 잘린 것이다(가로·세로)
        clipped: Array.from(document.querySelectorAll('td,div,span')).filter((e) => {
          const st = getComputedStyle(e);
          return (st.overflow === 'hidden' || e.tagName === 'SECTION') && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
        }).slice(0, 3).map((e) => e.textContent.trim().slice(0, 18) + ' [' + (e.scrollWidth - e.clientWidth) + ',' + (e.scrollHeight - e.clientHeight) + ']'),
        names: document.querySelectorAll('td.n').length
      };
    });
    // 글자가 실제로 보이는가: 글자 상자(Range)가 자기를 감싼 overflow:hidden 상자와 쪽 안에 들어 있어야 한다(innerText 는 잘린 글자도 센다)
    const need = (c.model.unseated || []).map((u) => u.display).concat(ctx.printEntries_(clone(c.model)).map((e) => e.display));
    const hidden = await page.evaluate((strings) => {
      const clipRects = (node) => { const out = []; for (let e = node.parentElement; e; e = e.parentElement) { if (e.tagName === 'SECTION') { const b = e.getBoundingClientRect(); out.push({ left: b.left, right: b.left + 796 * 4 / 3, top: b.top, bottom: b.top + 544 * 4 / 3 }); } else if (getComputedStyle(e).overflow === 'hidden') out.push(e.getBoundingClientRect()); } return out; };
      const seen = (str) => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const i = n.nodeValue.indexOf(str);
          if (i < 0) continue;
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + str.length);
          const rects = Array.from(r.getClientRects()); const clips = clipRects(n);
          if (rects.length && rects.every((q) => clips.every((k) => q.left >= k.left - 1 && q.right <= k.right + 1 && q.top >= k.top - 1 && q.bottom <= k.bottom + 1))) return true;
        }
        return false;
      };
      return strings.filter((t) => !seen(t)).slice(0, 5);
    }, need);
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    const problems = [];
    if (info.over.length) problems.push('넘침 ' + JSON.stringify(info.over));
    ['undefined', 'NaN', 'null'].forEach((w) => { if (html.indexOf(w) >= 0) problems.push('글자 "' + w + '" 이 인쇄됨'); });
    (c.must || []).forEach((w) => { if (html.indexOf(w) < 0) problems.push('있어야 할 글자 없음: ' + w); });
    (c.mustNot || []).forEach((w) => { if (html.indexOf(w) >= 0) problems.push('없어야 할 글자: ' + w); });
    if (info.clipped.length) problems.push('잘림 ' + JSON.stringify(info.clipped));
    if (pdfPages !== info.pages) problems.push('PDF ' + pdfPages + '쪽 ≠ section ' + info.pages);
    const model = c.model;
    if (model.operating !== false && model.spaces.length) {
      const inGrid = model.spaces.reduce((k, sp) => k + new Set(sp.cells.filter((x) => x.kind === 'seat' && x.row >= 1 && x.row <= sp.rows && x.col >= 1 && x.col <= sp.cols).map((x) => x.row + ',' + x.col)).size, 0);
      if (info.names !== inGrid) problems.push('그려진 좌석 ' + info.names + ' ≠ 격자 안 좌석 ' + inGrid);
      if (hidden.length) problems.push('안 보이는 글자(잘림): ' + JSON.stringify(hidden));
      const plan = ctx.printSheetPlan_(clone(model), c.opts || {});
      if (plan && plan.pages !== info.pages) problems.push('계획 쪽 수 ' + plan.pages + ' ≠ 그려진 ' + info.pages);
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
