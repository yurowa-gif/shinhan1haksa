/**
 * D9 미리보기: 월말 근무 기록표 xlsx 두 시트의 칸 배치(docs/design/duty-record.md)를 가짜 데이터로 계산해 엑셀처럼 그린다.
 * `dutyXlsxGrid(model)`은 칸 배치의 기준 구현이다(C14b는 이 모양을 Utilities.zip으로 만드는 xlsx에 옮긴다). 실제 xlsx를 만들지는 않는다.
 * node design/preview/duty-xlsx.js → design/preview/out/duty-xlsx-sheet{1,2}.{html,png}. 모델은 docs/design/duty-record-model.md(D7)와 같고 dayMemos(선택)만 더했다.
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const SLOT_ORDER = ['21:30조', '23:00조', '단독', '예비'];
const pad = (n) => (n < 10 ? '0' : '') + n;

function parseMonth(m) { const [y, mo] = m.split('-').map(Number); return { y, mo, days: new Date(Date.UTC(y, mo, 0)).getUTCDate(), first: new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() }; }
const slotOf = (code) => { const c = String(code).replace(/조$/, ''); return c === '단' || c === '단독' ? '단독' : c + '조'; };

/** → { sheet1: {cols, rows:[[{v, s, merge?}]]}, sheet2: {…} } — v = 글자·숫자, s = 스타일 이름(doc 4절 표) */
function dutyXlsxGrid(model) {
  const { y, mo, days, first } = parseMonth(model.month);
  const ymd = (d) => y + '-' + pad(mo) + '-' + pad(d);
  const closed = new Set(model.closedDates || []);
  const swapAt = {};   // 날짜|칸 → {from, to}
  (model.swaps || []).forEach((s) => { swapAt[s.date + '|' + s.slot] = s; });
  const who = (d, slot) => model.teachers.filter((t) => (t.cells[ymd(d)] || []).map(slotOf).includes(slot)).map((t) => t.name);
  const standby = (d) => model.teachers.filter((t) => (t.standby || []).includes(ymd(d))).map((t) => t.name);
  const cellName = (d, slot) => {
    const sw = swapAt[ymd(d) + '|' + slot];
    if (sw) return { v: sw.from + '=>' + sw.to, s: 'nameBold' };
    const n = who(d, slot);
    return n.length ? { v: n.join(', '), s: 'name' } : { v: '미편성', s: 'nameBold' };
  };

  const rows = [];
  rows.push([{ v: y + '년 ' + mo + '월 근무표', s: 'title', merge: 7 }]);
  rows.push([{ v: (model.termName ? model.termName + ' · ' : '') + '실제 근무자 기준(교대 반영)' + (model.generatedAt ? ' · 만든 시각 ' + model.generatedAt : ''), s: 'sub', merge: 7 }]);
  rows.push(WD.map((w) => ({ v: w, s: 'head' })));
  const weeks = Math.ceil((first + days) / 7);
  for (let w = 0; w < weeks; w++) {
    const a = [], b = [], c = [];
    for (let k = 0; k < 7; k++) {
      const d = w * 7 + k - first + 1;
      if (d < 1 || d > days) { a.push({ v: '', s: 'other' }); b.push({ v: '', s: 'other' }); c.push({ v: '', s: 'other' }); continue; }
      const memo = (model.dayMemos || {})[ymd(d)];
      const wk = k === 0 || k === 6 ? '주말' : (k === 5 ? '금요일' : '');
      const head = String(d) + (wk ? ' ' + wk : '') + (memo ? ' · ' + memo : '');
      if (closed.has(ymd(d))) { a.push({ v: String(d) + ' 운영 안 함' + (memo ? ' · ' + memo : ''), s: 'dateOff' }); b.push({ v: '', s: 'nameOff' }); c.push({ v: '', s: 'nameOff' }); continue; }
      a.push({ v: head, s: 'date' });
      if (k >= 1 && k <= 4) { b.push(cellName(d, '21:30조')); c.push(cellName(d, '23:00조')); }
      else {
        b.push(cellName(d, '단독'));
        const sb = standby(d), sw = swapAt[ymd(d) + '|예비'];
        c.push(sw ? { v: '(' + sw.from + '=>' + sw.to + ')', s: 'nameBold' } : { v: sb.length ? '(' + sb.join(', ') + ')' : '', s: 'name' });
      }
    }
    rows.push(a, b, c);
  }
  rows.push([{ v: '', s: 'none' }]);
  rows.push([{ v: '교대·대신 근무: 원래 근무자=>실제 근무자 · ( ) 안은 예비 감독 · 회색은 운영 안 하는 날 · 미편성은 근무자가 아직 정해지지 않은 칸', s: 'note', merge: 7 }]);
  (model.warnings || []).forEach((t) => rows.push([{ v: '※ ' + t, s: 'note', merge: 7 }]));

  // 시트 2: 교사별 합계 + 교대 목록
  const count = (t, slot) => Object.keys(t.cells).filter((k) => k.startsWith(model.month)).reduce((n, k) => n + t.cells[k].map(slotOf).filter((x) => x === slot).length, 0);
  const r2 = [];
  r2.push([{ v: y + '년 ' + mo + '월 근무 기록 — 교사별 합계', s: 'title', merge: 6 }]);
  r2.push([{ v: (model.termName ? model.termName + ' · ' : '') + '실제 근무자 기준' + (model.generatedAt ? ' · 만든 시각 ' + model.generatedAt : '') + (model.lastChangedAt ? ' · 근무표 마지막 변경 ' + model.lastChangedAt : ''), s: 'sub', merge: 6 }]);
  r2.push([]);
  r2.push(['교사', '근무 합계', '21:30조(참고)', '23:00조(참고)', '단독(참고)', '예비 지정(따로)'].map((v) => ({ v, s: 'head' })));
  const tot = [0, 0, 0, 0, 0];
  model.teachers.forEach((t) => {
    const a = count(t, '21:30조'), b = count(t, '23:00조'), s = count(t, '단독'), sb = (t.standby || []).filter((d) => d.startsWith(model.month)).length;
    const v = [a + b + s, a, b, s, sb]; v.forEach((n, i) => { tot[i] += n; });
    r2.push([{ v: t.name, s: 'listName' }, { v: v[0], s: 'sumBig' }, { v: v[1], s: 'numSmall' }, { v: v[2], s: 'numSmall' }, { v: v[3], s: 'numSmall' }, { v: v[4], s: 'numSmall' }]);
  });
  r2.push([{ v: '전체', s: 'totalName' }].concat(tot.map((n) => ({ v: n, s: 'totalNum' }))));
  r2.push([]);
  r2.push([{ v: '교대·대신 근무 목록', s: 'sectionTitle', merge: 6 }]);
  r2.push(['날짜', '칸', '원래 근무자', '실제 근무자', '구분'].map((v) => ({ v, s: 'head' })));
  const sw = (model.swaps || []).slice().sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : SLOT_ORDER.indexOf(p.slot) - SLOT_ORDER.indexOf(q.slot)));
  if (!sw.length) r2.push([{ v: '이 달 교대가 없습니다.', s: 'list', merge: 5 }]);
  sw.forEach((s) => {
    const p = s.date.split('-').map(Number);
    const dt = p[1] + '월 ' + p[2] + '일(' + WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ')';
    r2.push([{ v: dt, s: 'list' }, { v: s.slot, s: 'list' }, { v: s.from, s: 'list' }, { v: s.to, s: 'list' }, { v: s.kind || '교대', s: 'list' }]);
  });
  r2.push([]);
  r2.push([{ v: '※ 합계는 실제 근무자 기준입니다(원래 근무자에게는 세지 않음). 21:30조·23:00조 수당은 같아 근무 합계를 기준으로 하고 조별 횟수는 참고입니다(결정 47). 예비 지정은 따로 셉니다(결정 46). 금액은 계산하지 않습니다.', s: 'note', merge: 6 }]);
  return { sheet1: { cols: [17, 17, 17, 17, 17, 17, 17], rows }, sheet2: { cols: [15, 13, 14, 14, 13, 15], rows: r2 } };
}

const STYLE = {
  title: 'font-weight:bold;font-size:14pt;text-align:center;border:0;', sub: 'font-size:9pt;color:#595959;text-align:center;border:0;',
  head: 'font-weight:bold;background:#d9d9d9;text-align:center;', date: 'font-weight:bold;background:#ededed;text-align:left;', dateOff: 'font-weight:bold;background:#bfbfbf;text-align:left;',
  name: 'text-align:center;', nameBold: 'text-align:center;font-weight:bold;', nameOff: 'background:#f2f2f2;', other: 'background:#f2f2f2;', none: 'border:0;',
  note: 'font-size:9pt;text-align:left;border:0;white-space:normal;', sectionTitle: 'font-weight:bold;font-size:11pt;text-align:left;border:0;',
  listName: 'text-align:left;', sumBig: 'font-weight:bold;font-size:12pt;text-align:center;', numSmall: 'font-size:9pt;color:#595959;text-align:center;',
  totalName: 'font-weight:bold;background:#d9d9d9;text-align:center;', totalNum: 'font-weight:bold;background:#d9d9d9;text-align:center;', list: 'text-align:left;'
};
function sheetHtml(sheet, name) {
  const body = sheet.rows.map((r, i) => (r.length === 0 ? '<tr><td style="border:0;height:10px"></td></tr>' :
    '<tr>' + r.map((c) => '<td' + (c.merge ? ' colspan="' + c.merge + '"' : '') + ' style="border:1px solid #999;padding:3px 5px;font-size:10pt;height:20px;' + (STYLE[c.s] || '') + '">' + String(c.v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</td>').join('') + '</tr>')).join('');
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + name + '</title></head><body style="margin:0;padding:12px;background:#fff;font-family:\'Malgun Gothic\',\'Noto Sans CJK KR\',sans-serif">' +
    '<div style="display:inline-block"><div style="font-size:10pt;background:#e8f0e8;border:1px solid #999;border-bottom:0;padding:3px 8px">시트: <b>' + name + '</b></div>' +
    '<table style="border-collapse:collapse;table-layout:fixed;background:#fff"><colgroup>' + sheet.cols.map((w) => '<col style="width:' + Math.round(w * 7.2 + 6) + 'px">').join('') + '</colgroup><tbody>' + body + '</tbody></table></div></body></html>';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { buildModel } = require('./duty-record-fixture');
  const model = buildModel();
  model.dayMemos = { '2027-03-02': '학교 행사', '2027-03-20': '학부모 총회' };
  const g = dutyXlsxGrid(model);
  const { chromium } = require('playwright');
  const browser = await require('./browser.js').launchKo();
  for (const [key, name] of [['sheet1', '근무표'], ['sheet2', '근무 합계']]) {
    const file = path.join(OUT, 'duty-xlsx-' + key + '.html');
    fs.writeFileSync(file, sheetHtml(g[key], name));
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, locale: 'ko-KR' });
    await page.goto('file://' + file);
    await page.locator('body > div').screenshot({ path: path.join(OUT, 'duty-xlsx-' + key + '.png') });
    await page.close();
  }
  await browser.close();
  const t = g.sheet2.rows.find((r) => r[0] && r[0].v === '전체');
  console.log('근무 기록표 xlsx 칸 배치: 시트1 ' + g.sheet1.rows.length + '줄 × 7열, 시트2 ' + g.sheet2.rows.length + '줄 × 6열, 전체 근무 ' + t[1].v + '(기대 48) · 예비 ' + t[5].v + '(기대 11)');
  if (t[1].v !== 48 || t[5].v !== 11) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { dutyXlsxGrid };
