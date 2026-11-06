/**
 * 출석부 HTML 렌더러(D4.1: 1층 + SA1~6실을 A4 가로 한 장에). 소유: DESIGN. 순수 함수 — Apps Script 서비스·현재 시각을 쓰지 않는다.
 *
 *   printRenderSheet_(model, opts) → HTML 문서 문자열. 쪽 1 = 출석부 앞면(모든 공간·메모 칸), 뒤 쪽 = 앞면에 다 못 담은 것
 *                                    (이어지는 공간, 미배정 학생 전체, 오늘 특이사항 전체). **내용을 자르지 않는다.**
 *   printSheetPlan_(model, opts)   → 배치 진단(줄 너비·칸 크기·SA 열 수·쪽 수·경고, 테스트·C7용).
 *
 * model 모양은 docs/contracts/sheet-model.md. 렌더러는 marks[].text를 바꾸지 않고 이스케이프만 한다.
 * 출석부에는 학년·이름만 싣는다(OUT 표시 없음, 결정 36). 범례는 model.legend를 그대로 그린다.
 * PDF 변환기(Utilities 서비스의 Blob 변환)가 이해하도록 표(table) 기반·인라인 CSS만 쓴다(flex·grid·웹폰트·외부 리소스 없음).
 * 흑백 인쇄로도 구분되게 색 대신 회색 농도(공석 연함·미리 채운 칸 진함)·굵기·글자로 나타낸다.
 *
 * 배치(docs/design/print-layout.md): 왼쪽에 큰 공간(좌석 수가 가장 많은 공간 = 1층), 오른쪽에 나머지 공간(3열→2열→1열 자동)
 * + 오늘 특이사항 목록 + 메모 칸(앞면에 늘). 좌석 하나 = 이름 칸(위) + 표시 칸 n개(아래).
 * 손으로 ○ × △ 조를 쓰는 칸은 너비 4.5mm(12.8pt) 이상·높이 4.5mm 이상. 글자는 이름 8pt·표시 칸 7pt 이상(아주 긴 이름만 7pt까지 줄이고 줄바꿈).
 * 전역 이름은 모두 print 접두어.
 */

var PRINT_PAGE_W_PT = 796;       // A4 가로 281mm(여백 8mm씩 뺀 폭)
var PRINT_PAGE_H_PT = 544;       // 같은 방식 192mm(194mm에서 여유 2mm: 넘침으로 빈 쪽이 생기는 것을 막는다)
var PRINT_HEAD1_PT = 20;         // 머리말 첫 줄 높이
var PRINT_HEAD2_PT = 10;         // 머리말 둘째 줄(요약·범례) 한 줄 높이(7pt 글자)
var PRINT_FOOT_LINE_PT = 8.5;    // 아래 줄(배정 안 된 학생) 한 줄 높이
var PRINT_FOOT_MAX_LINES = 2;    // 앞면 아래 줄 최대 줄 수(넘치면 "외 N명(뒷면)")
var PRINT_TITLE_PT = 10;         // 공간 이름 줄 한 줄 높이
var PRINT_LINEHEAD_PT = 9.5;      // 줄 머리("18석 공3") 높이
var PRINT_GAP_PT = 3;            // 통로(빈) 열 너비
var PRINT_FIXED_COL_PT = 24;     // 기둥·비상문·창문만 있는 열 너비
var PRINT_SEP_PT = 8;            // 큰 공간과 오른쪽 영역 사이
var PRINT_ROOMGAP_PT = 5;        // 작은 공간 사이(가로)
var PRINT_ROOMVGAP_PT = 4;       // 작은 공간 사이(세로)
var PRINT_NAME_PT = 8.5;         // 이름 칸 높이(9pt 글자)
var PRINT_NAME_FONT_PT = 9;      // 이름 글자
var PRINT_NAME_MIN_FONT_PT = 7;  // 아주 긴 이름만 여기까지 줄이고 그래도 넘치면 줄바꿈
var PRINT_MARK_LINE_PT = 6.8;    // 표시 칸 글자 줄 높이(7pt 글자, 두 줄 = 13.6pt)
var PRINT_MIN_PITCH_PT = 22;     // 좌석 한 줄(이름 + 표시 칸) 기준 최소 높이: 표시 칸이 7pt 글자 두 줄(13.6pt)
var PRINT_FLOOR_PITCH_PT = 21.5; // 절대 하한: 이름 8.5 + 표시 칸 13(≥4.5mm). 이보다 낮아지면 행을 다음 쪽으로 넘긴다
var PRINT_MAX_PITCH_PT = 30;
var PRINT_MARK_MIN_W_PT = 14.5;  // 표시 칸 너비 목표: 7pt 글자 두 개("병결")가 한 줄에 들어간다
var PRINT_HAND_MIN_W_PT = 12.8;  // 손글씨 칸 최소 너비 4.5mm
var PRINT_MAX_LINE_PT = 96;      // 줄 최대 너비
var PRINT_REGION_ONLY_PT = 150;  // 작은 공간이 없을 때 목록·메모 영역 너비
var PRINT_ROW_SLACK_PT = 1.3;    // 좌석 한 줄(tr 두 개)에 테두리가 더하는 높이 여유(크롬 실측 1.2)
var PRINT_SLACK_PT = 4;          // 그 밖의 여유
var PRINT_LIST_LINE_PT = 8.5;    // 특이사항 목록 한 줄 높이(7pt 글자)
var PRINT_LIST_TITLE_PT = 11;
var PRINT_MEMO_PT = 40;          // 메모 칸 높이(앞면에 늘 있다)
var PRINT_BACK_LINE_PT = 10.5;   // 뒷면 목록 한 줄 높이(8pt 글자)
var PRINT_BACK_COLS = 3;
var PRINT_FILLED_BG = '#d4d4d4'; // 미리 채운 칸(진한 회색)
var PRINT_VACANT_BG = '#f4f4f4'; // 공석(연한 회색)
var PRINT_FONT = '"Nanum Gothic","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
var PRINT_COLOR_EXACT = '-webkit-print-color-adjust:exact;print-color-adjust:exact;';

function printEsc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function printNum_(x) {
  return String(Math.round(x * 10) / 10);
}

function printClamp_(x, lo, hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

/** 글자 폭 어림(em): 한글·전각 1, 숫자·영문 0.55, 공백 0.3 */
function printTextEm_(s) {
  var em = 0;
  var str = String(s === null || s === undefined ? '' : s);
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c === 32) em += 0.3;
    else if (c < 128) em += 0.55;
    else em += 1;
  }
  return em;
}

/** 글자가 칸 너비(pt)에 몇 줄로 나뉘는지: 글자 단위로 줄바꿈(word-break:break-all)하고 줄 맨 앞 공백은 건너뛴다 */
function printWrapLines_(text, fontPt, availPt) {
  var str = String(text === null || text === undefined ? '' : text);
  var lines = 1;
  var w = 0;
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    var cw = printTextEm_(ch) * fontPt;
    if (ch === ' ') {
      if (w === 0) continue;
      if (w + cw > availPt) { lines++; w = 0; continue; }
      w += cw;
      continue;
    }
    if (w + cw > availPt && w > 0) { lines++; w = 0; }
    w += cw;
  }
  return lines;
}

function printCircled_(n) {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : '(' + n + ')';
}

/** '2027-03-03' + '수' → '2027년 3월 3일(수)' (Date를 쓰지 않는다) */
function printDateKo_(date, weekdayKo) {
  var p = String(date || '').split('-');
  if (p.length !== 3) return String(date || '');
  return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일(' + (weekdayKo || '') + ')';
}

function printArr_(x) {
  if (Array.isArray(x)) return x.map(function (v) { return String(v === null || v === undefined ? '' : v); });
  if (x === undefined || x === null || x === '') return [];
  return [String(x)];
}

/** 열 종류: 좌석이 있는 열(seat)·기둥/문/창만 있는 열(fixed)·빈 열(gap). → [{col, role}] */
function printColumns_(space) {
  var kinds = {};
  var c;
  for (c = 1; c <= space.cols; c++) kinds[c] = 'gap';
  (space.cells || []).forEach(function (cell) {
    if (cell.kind === 'seat') kinds[cell.col] = 'seat';
    else if (kinds[cell.col] === 'gap') kinds[cell.col] = 'fixed';
  });
  var cols = [];
  for (c = 1; c <= space.cols; c++) cols.push({ col: c, role: kinds[c] });
  return cols;
}

function printSeatCells_(space) {
  return (space.cells || []).filter(function (cell) { return cell.kind === 'seat'; });
}

/** 큰 블록 = 좌석 수가 가장 많은 공간(같으면 앞). 나머지는 작은 공간(원래 순서). */
function printPickMain_(spaces) {
  var best = 0;
  var bestCount = -1;
  spaces.forEach(function (sp, i) {
    var k = printSeatCells_(sp).length;
    if (k > bestCount) { best = i; bestCount = k; }
  });
  return { main: spaces[best], rooms: spaces.filter(function (sp, i) { return i !== best; }) };
}

function printNameText_(cell, vacantLabel) {
  return cell.occupant ? String(cell.occupant.display) : vacantLabel;
}

/** 이름 글자 크기·줄 수: 칸 너비(L)에 한 줄로 들어가면 9pt, 모자라면 7pt까지 줄이고, 그래도 넘치면 7pt로 줄바꿈 */
function printNameFont_(text, L) {
  var em = Math.max(0.1, printTextEm_(text));
  var f = (L - 3) / em;
  if (f >= PRINT_NAME_FONT_PT) return { pt: PRINT_NAME_FONT_PT, lines: 1 };
  if (f >= PRINT_NAME_MIN_FONT_PT) return { pt: f, lines: 1 };
  return { pt: PRINT_NAME_MIN_FONT_PT, lines: printWrapLines_(text, PRINT_NAME_MIN_FONT_PT, L - 3) };
}

/** 블록(공간) 안에서 열이 차지하는 너비(pt). L = 줄 너비 */
function printBlockWidth_(cols, L) {
  var w = 0;
  cols.forEach(function (c) { w += c.role === 'seat' ? L : (c.role === 'fixed' ? PRINT_FIXED_COL_PT : PRINT_GAP_PT); });
  return w;
}

function printSeatLineCount_(cols) {
  var k = 0;
  cols.forEach(function (c) { if (c.role === 'seat') k++; });
  return k;
}

function printTitleText_(space) {
  return String(space.name) + (space.gender && space.gender !== '혼성' ? ' · ' + space.gender : '') + ' · ' + printSeatCells_(space).length + '석';
}

/** 공간 이름 줄 높이: 이름이 길면 줄바꿈해서 그만큼 높인다(8pt 글자) */
function printTitleH_(space, width) {
  return Math.max(1, printWrapLines_(printTitleText_(space), 8, Math.max(20, width - 2))) * PRINT_TITLE_PT;
}

/**
 * 한 공간의 행마다 늘어나는 높이: 이름이 길어 줄바꿈하면 name, 표시 칸 글자가 cap줄을 넘으면 mark.
 * @return {{name:number[], mark:number[], sumName:number, sumMark:number}} (행 번호 1부터)
 */
function printExtras_(space, markW, L, cap, vacantLabel) {
  var avail = Math.max(1, markW - 0.4);
  var cache = {};
  var name = [];
  var mark = [];
  var r;
  for (r = 0; r <= space.rows; r++) { name.push(0); mark.push(0); }
  printSeatCells_(space).forEach(function (cell) {
    var maxLines = 1;
    (cell.marks || []).forEach(function (m) {
      if (!m.text) return;
      if (cache[m.text] === undefined) cache[m.text] = printWrapLines_(m.text, 7, avail);
      if (cache[m.text] > maxLines) maxLines = cache[m.text];
    });
    var em = Math.max(0, maxLines - cap) * PRINT_MARK_LINE_PT;
    if (em > mark[cell.row]) mark[cell.row] = em;
    var nm = (printNameFont_(printNameText_(cell, vacantLabel), L).lines - 1) * PRINT_NAME_PT;
    if (nm > name[cell.row]) name[cell.row] = nm;
  });
  var sn = 0, sm = 0;
  for (r = 1; r <= space.rows; r++) { sn += name[r]; sm += mark[r]; }
  return { name: name, mark: mark, sumName: sn, sumMark: sm };
}

/** 오늘 특이사항(EXC) 학생 목록: [{display, grade, name, parts:[{seqs,text}]}] 학년→이름 순. 사유 메모는 없다(유형 약어만). */
function printEntries_(model) {
  var out = [];
  (model.spaces || []).forEach(function (sp) {
    printSeatCells_(sp).forEach(function (cell) {
      if (!cell.occupant) return;
      var parts = [];
      (cell.marks || []).forEach(function (m, i) {
        if (m.code !== 'EXC') return;
        var seq = Number(m.seq) || (i + 1);
        for (var k = 0; k < parts.length; k++) {
          if (parts[k].text === m.text) { parts[k].seqs.push(seq); return; }
        }
        parts.push({ seqs: [seq], text: String(m.text) });
      });
      if (parts.length) out.push({ display: String(cell.occupant.display), grade: Number(cell.occupant.grade) || 0, name: String(cell.occupant.name), parts: parts });
    });
  });
  out.sort(function (a, b) {
    if (a.grade !== b.grade) return a.grade - b.grade;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return out;
}

/** "이름 ① 무지 · ②③ 병결": 어느 블록이 어느 약어인지 */
function printEntryText_(e) {
  return e.display + '  ' + e.parts.map(function (p) {
    return p.seqs.map(function (q) { return printCircled_(Number(q)); }).join('') + ' ' + p.text;
  }).join(' · ');
}

/** 인원 요약: 재적(자리 있는 학생 + 자리 없는 학사생)·공석·특이사항 학생 수·학·가 학생 수·미배정 */
function printSummary_(model) {
  var s = { enrolled: 0, seated: 0, unseated: (model.unseated || []).length, vacant: 0, special: 0, hak: 0, ga: 0 };
  (model.spaces || []).forEach(function (sp) {
    printSeatCells_(sp).forEach(function (cell) {
      if (!cell.occupant) { s.vacant++; return; }
      s.seated++;
      var hasExc = false, hasHak = false, hasGa = false;
      (cell.marks || []).forEach(function (m) {
        if (m.code === 'EXC') hasExc = true;
        if (m.code === 'FIXED' && m.text === '학') hasHak = true;
        if (m.code === 'FIXED' && m.text === '가') hasGa = true;
      });
      if (hasExc) s.special++;
      if (hasHak) s.hak++;
      if (hasGa) s.ga++;
    });
  });
  s.enrolled = s.seated + s.unseated;
  return s;
}

/* ───────────── 머리말·아래 줄 ───────────── */

function printDutyText_(model) {
  var names = printArr_(model.dutyNames);
  if (names.length) return printEsc_(names.join(', '));
  return model.dayType === 'mon_thu' ? '________ ________' : '________';
}

/** 둘째 줄 조각: 요약 · 표시 칸 순서 · 범례. 글자 폭을 재서 줄 수(높이)도 정한다 */
function printHeadSegments_(model) {
  var s = printSummary_(model);
  var summary = [{ t: '재적 ' + s.enrolled + (s.unseated ? '(미배정 ' + s.unseated + ')' : ''), b: true }, { t: '공석 ' + s.vacant },
    { t: '특이사항 ' + s.special + '명' }, { t: '학 ' + s.hak }, { t: '가 ' + s.ga }];
  var blocks = (model.blocks || []).map(function (b, i) { return printCircled_(Number(b.seq) || (i + 1)) + String(b.label); });
  var legend = (model.legend || []).map(function (l) { return { m: String(l.mark), t: String(l.text) }; });
  return { summary: summary, blocks: blocks, legend: legend };
}

function printHeadInfo_(model) {
  var seg = printHeadSegments_(model);
  var plain = seg.summary.map(function (x) { return x.t; }).join(' · ') + '  |  표시 칸(왼쪽→오른쪽) ' + seg.blocks.join('  ') + '  |  ' +
    seg.legend.map(function (l) { return l.m + ' ' + l.t; }).join(' · ');
  var lines = Math.max(1, Math.ceil(printTextEm_(plain) * 7 / (PRINT_PAGE_W_PT * 0.96)));
  return { seg: seg, lines: lines, h: PRINT_HEAD1_PT + lines * PRINT_HEAD2_PT };
}

function printHeadHtml_(model, lay) {
  var title = printEsc_(model.title || '신한학사 출석부');
  var first = model.blocks[0], last = model.blocks[model.blocks.length - 1];
  var standby = printArr_(model.standbyNames);
  var showStandby = model.dayType !== 'mon_thu' || standby.length > 0;
  var seg = lay.head.seg;
  var td = 'padding:0;vertical-align:top;';
  var summary = seg.summary.map(function (x) { return x.b ? '<b>' + printEsc_(x.t) + '</b>' : printEsc_(x.t); }).join('&nbsp;·&nbsp;');
  var blocks = seg.blocks.map(printEsc_).join('&nbsp;&nbsp;');
  var legend = seg.legend.map(function (l) { return '<b>' + printEsc_(l.m) + '</b>&nbsp;' + printEsc_(l.t); }).join('&nbsp;·&nbsp;');
  return '<table style="width:100%;border-collapse:collapse;table-layout:auto;height:' + printNum_(lay.head.h) + 'pt">' +
    '<tr><td style="' + td + '"><div style="height:' + PRINT_HEAD1_PT + 'pt;overflow:hidden;white-space:nowrap;font-size:15pt;font-weight:bold;line-height:' + PRINT_HEAD1_PT + 'pt">' + title +
    '&nbsp;&nbsp;<span style="font-size:12pt;line-height:10pt">' + printEsc_(printDateKo_(model.date, model.weekdayKo)) + '</span>' +
    '&nbsp;&nbsp;<span style="font-size:10pt;font-weight:normal;line-height:10pt">자습 ' + printEsc_(first.start) + '–' + printEsc_(last.end) + '</span></div></td>' +
    '<td style="' + td + '"><div style="height:' + PRINT_HEAD1_PT + 'pt;overflow:hidden;text-align:right;white-space:nowrap;font-size:10pt;line-height:' + PRINT_HEAD1_PT + 'pt">근무 ' + printDutyText_(model) +
    (showStandby ? '&nbsp;&nbsp;예비 ' + (standby.length ? printEsc_(standby.join(', ')) : '________') : '') + '</div></td></tr>' +
    '<tr><td colspan="2" style="' + td + '"><div style="height:' + (lay.head.lines * PRINT_HEAD2_PT) + 'pt;overflow:hidden;font-size:7pt;line-height:' + PRINT_HEAD2_PT + 'pt"><b>' + summary + '</b>' +
    '&nbsp;&nbsp;|&nbsp;&nbsp;<b>표시 칸(왼쪽→오른쪽)</b>&nbsp;' + blocks + '&nbsp;&nbsp;|&nbsp;&nbsp;' + legend + '</div></td></tr></table>';
}

/** 앞면 아래 줄 "자리 배정 안 됨": 최대 2줄, 넘치면 "외 N명(뒷면)" */
function printFootInfo_(model, warnLine) {
  var items = (model.unseated || []).map(function (u) { return String(u && u.display !== undefined ? u.display : ''); });
  var warnH = warnLine ? PRINT_FOOT_LINE_PT : 0;
  if (!items.length) return { items: [], shown: 0, over: false, h: warnH, lines: 0, warnLine: !!warnLine };
  var budget = PRINT_FOOT_MAX_LINES * PRINT_PAGE_W_PT * 0.94;
  var label = 8 * 7;
  var total = label;
  items.forEach(function (t) { total += printTextEm_(t) * 7 + 4.5; });
  var over = total > budget;
  var shown = items.length;
  if (over) {
    var used = label + 64;
    shown = 0;
    for (var i = 0; i < items.length; i++) {
      var w = printTextEm_(items[i]) * 7 + 4.5;
      if (used + w > budget) break;
      used += w;
      shown++;
    }
  }
  var lines = Math.min(PRINT_FOOT_MAX_LINES, Math.max(1, Math.ceil((over ? budget : total) / (PRINT_PAGE_W_PT * 0.94))));
  return { items: items, shown: shown, over: over, h: lines * PRINT_FOOT_LINE_PT + warnH, lines: lines, warnLine: !!warnLine };
}

function printFootHtml_(foot, warnText) {
  if (!foot.items.length && !foot.warnLine) return '';
  var text = foot.items.slice(0, foot.shown).map(printEsc_).join(', ');
  var warn = foot.warnLine ? '<div style="height:' + PRINT_FOOT_LINE_PT + 'pt;overflow:hidden;font-weight:bold">※ ' + printEsc_(warnText) + '</div>' : '';
  var list = foot.items.length ? '<div style="height:' + printNum_(foot.lines * PRINT_FOOT_LINE_PT) + 'pt;overflow:hidden"><b>자리 배정 안 됨</b>&nbsp;' + text +
    (foot.over ? ' <b>외 ' + (foot.items.length - foot.shown) + '명(뒷면에 전체)</b>' : '') + '</div>' : '';
  return '<div style="height:' + printNum_(foot.h) + 'pt;font-size:7pt;line-height:' + PRINT_FOOT_LINE_PT + 'pt;overflow:hidden">' + warn + list + '</div>';
}

/** 글자를 칸(열) 여러 개에 위에서 아래로 채운다. 한 칸 안에서 못 넣으면 다음 열. → {columns:[[text…]], count} */
function printPackColumns_(texts, cols, linesPerCol, colW, fontPt) {
  var columns = [];
  var k;
  for (k = 0; k < cols; k++) columns.push([]);
  if (linesPerCol < 1) return { columns: columns, count: 0 };
  var col = 0, used = 0, count = 0;
  for (var i = 0; i < texts.length; i++) {
    var lines = Math.min(linesPerCol, printWrapLines_(texts[i], fontPt, colW));
    if (used + lines > linesPerCol) { col++; used = 0; if (col >= cols) break; }
    columns[col].push(texts[i]);
    used += lines;
    count++;
  }
  return { columns: columns, count: count };
}

/** 뒷면 쪽 나누기: 항목 {text, title} 목록을 열 3개짜리 쪽 여러 개에 채운다. 제목은 다음 항목과 같은 열에 둔다. → [[열[항목…]…]…] */
function printPackPages_(items, cols, linesPerCol, colW, fontPt) {
  var pages = [];
  var page = null, col = 0, used = 0;
  function fresh() { page = []; for (var k = 0; k < cols; k++) page.push([]); pages.push(page); col = 0; used = 0; }
  function nextCol() { col++; used = 0; if (col >= cols) fresh(); }
  fresh();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var lines = it.title ? 2 : Math.min(linesPerCol, printWrapLines_(it.text, fontPt, colW));
    var need = lines + (it.title ? 1 : 0);
    if (used + need > linesPerCol) nextCol();
    page[col].push(it);
    used += lines;
  }
  return pages;
}

/* ───────────── 배치 계획 ───────────── */

/** 행을 위에서부터 높이 안에 넣을 수 있는 만큼: 행마다 pitch + 여유 + 늘어난 높이 */
function printFitRows_(from, to, avail, pitch, ex) {
  var h = 0;
  var k = 0;
  for (var r = from; r <= to; r++) {
    var cost = pitch + PRINT_ROW_SLACK_PT + ex.name[r] + ex.mark[r];
    if (h + cost > avail + 0.01) break;
    h += cost;
    k++;
  }
  return k;
}

function printRowsH_(from, to, pitch, ex) {
  var h = 0;
  for (var r = from; r <= to; r++) h += pitch + PRINT_ROW_SLACK_PT + ex.name[r] + ex.mark[r];
  return h;
}

/**
 * 열 수 c(작은 공간 열 수)로 배치를 시험한다. 앞면에 다 들어가는지, 못 들어가는 것은 무엇인지(이어지는 쪽으로 보낸다).
 */
function printTryColumns_(model, opts, picked, c, base) {
  var n = base.n;
  var main = picked.main, rooms = picked.rooms;
  var regionOnly = rooms.length === 0;
  var roomW0 = base.roomOther;
  var width = PRINT_PAGE_W_PT - 2 - base.mainOther - PRINT_SEP_PT - (regionOnly ? PRINT_REGION_ONLY_PT : c * roomW0 + (c - 1) * PRINT_ROOMGAP_PT);
  var lines = base.mainLines + (regionOnly ? 0 : c * base.roomLines);
  var L = Math.min(PRINT_MAX_LINE_PT, Math.floor(width / lines * 10) / 10);
  var markW = L / n;
  var mainW = printBlockWidth_(base.mainCols, L);
  var roomW = 0;
  base.roomCols.forEach(function (cols) { roomW = Math.max(roomW, printBlockWidth_(cols, L)); });
  var rightW = regionOnly ? PRINT_REGION_ONLY_PT : c * roomW + (c - 1) * PRINT_ROOMGAP_PT;
  var mainTitleH = printTitleH_(main, mainW);
  var availMain = base.bodyH - mainTitleH - PRINT_LINEHEAD_PT;

  function sizing(cap) {
    var ex = printExtras_(main, markW, L, cap, base.vacantLabel);
    return { cap: cap, ex: ex, pitch: (availMain - ex.sumName - ex.sumMark) / main.rows - PRINT_ROW_SLACK_PT };
  }
  var sz = sizing(2);
  if (sz.pitch < PRINT_MIN_PITCH_PT) sz = sizing(1);
  var pitch = printClamp_(sz.pitch, 0, PRINT_MAX_PITCH_PT);
  var mainRowsFront = main.rows;
  if (pitch < PRINT_FLOOR_PITCH_PT) {
    pitch = PRINT_FLOOR_PITCH_PT;
    mainRowsFront = Math.max(1, printFitRows_(1, main.rows, availMain, pitch, sz.ex));
  }
  var cap = sz.cap;

  // 작은 공간: 앞면에 들어가는 줄(행 묶음)까지, 나머지는 이어지는 쪽
  var roomEx = rooms.map(function (sp) { return printExtras_(sp, markW, L, cap, base.vacantLabel); });
  function roomH(i) {
    var sp = rooms[i];
    return printTitleH_(sp, roomW) + PRINT_LINEHEAD_PT + printRowsH_(1, sp.rows, pitch, roomEx[i]);
  }
  var roomsAvail = base.bodyH - PRINT_MEMO_PT - PRINT_ROOMVGAP_PT * 2;
  var front = [];
  var roomsH = 0;
  var i;
  if (!regionOnly) {
    for (i = 0; i < rooms.length; i += c) {
      var rowH = 0;
      for (var k = i; k < Math.min(rooms.length, i + c); k++) rowH = Math.max(rowH, roomH(k));
      var add = rowH + (roomsH ? PRINT_ROOMVGAP_PT : 0);
      if (roomsH + add > roomsAvail + 0.01) break;
      roomsH += add;
      for (var k2 = i; k2 < Math.min(rooms.length, i + c); k2++) front.push(k2);
    }
  }
  var contRooms = [];
  for (i = front.length; i < rooms.length; i++) contRooms.push(i);
  var listH = base.bodyH - roomsH - PRINT_MEMO_PT - PRINT_ROOMVGAP_PT * (roomsH ? 2 : 1);
  var allFit = mainRowsFront === main.rows && contRooms.length === 0;
  return {
    c: c, L: L, markW: markW, pitch: pitch, cap: cap, mainRowsFront: mainRowsFront, mainEx: sz.ex, roomEx: roomEx,
    frontRooms: front, contRooms: contRooms, roomsH: roomsH, listH: listH, mainW: mainW, roomW: roomW, rightW: rightW,
    allFit: allFit, tier1: allFit && markW >= PRINT_MARK_MIN_W_PT, tier2: allFit && markW >= PRINT_HAND_MIN_W_PT - 0.05
  };
}

/** 이어지는 쪽 나누기: 앞면에 못 담은 큰 공간 행·작은 공간을 쪽 높이에 맞춰 나눈다. → [{mainFrom, mainTo, rooms:[index…]}] */
function printContPages_(lay, picked, base) {
  var pages = [];
  var main = picked.main, rooms = picked.rooms;
  var contBody = PRINT_PAGE_H_PT - 24 - PRINT_SLACK_PT;
  var nextRow = lay.mainRowsFront + 1;
  var pendingRooms = lay.contRooms.slice();
  var guard = 0;
  while ((nextRow <= main.rows || pendingRooms.length) && guard++ < 50) {
    var page = { mainFrom: 0, mainTo: -1, rooms: [] };
    if (nextRow <= main.rows) {
      var availM = contBody - printTitleH_(main, lay.mainW) - PRINT_LINEHEAD_PT;
      var k = Math.max(1, printFitRows_(nextRow, main.rows, availM, lay.pitch, lay.mainEx));
      page.mainFrom = nextRow;
      page.mainTo = nextRow + k - 1;
      nextRow += k;
    }
    var used = 0;
    var takenIdx = 0;
    while (pendingRooms.length && takenIdx < pendingRooms.length) {
      var rowIdx = pendingRooms.slice(takenIdx, takenIdx + lay.c);
      var rowH = 0;
      rowIdx.forEach(function (ri) {
        rowH = Math.max(rowH, printTitleH_(rooms[ri], lay.roomW) + PRINT_LINEHEAD_PT + printRowsH_(1, rooms[ri].rows, lay.pitch, lay.roomEx[ri]));
      });
      var add = rowH + (used ? PRINT_ROOMVGAP_PT : 0);
      if (used && used + add > contBody) break;
      used += add;
      rowIdx.forEach(function (ri) { page.rooms.push(ri); });
      takenIdx += rowIdx.length;
    }
    pendingRooms = pendingRooms.slice(takenIdx);
    pages.push(page);
  }
  return pages;
}

/** 앞면에 다 못 담은 것이 있으면 아래 줄에 "※ …뒷면에 이어집니다"를 보이도록 한 번 더 계산한다(경고 줄도 높이를 차지하므로) */
function printLayout_(model, opts) {
  var lay = printLayoutOnce_(model, opts, false);
  if (!lay.allFit) lay = printLayoutOnce_(model, opts, true);
  return lay;
}

function printLayoutOnce_(model, opts, warnLine) {
  opts = opts || {};
  var n = model.blocks.length;
  var spaces = model.spaces;
  var picked = printPickMain_(spaces);
  var main = picked.main;
  var rooms = picked.rooms;
  var head = printHeadInfo_(model);
  var foot = printFootInfo_(model, warnLine);
  var vacantLabel = String(opts.vacantLabel || '공석');
  var base = {
    n: n, vacantLabel: vacantLabel, mainCols: printColumns_(main), roomCols: rooms.map(printColumns_),
    bodyH: PRINT_PAGE_H_PT - head.h - foot.h - PRINT_SLACK_PT, mainLines: 0, mainOther: 0, roomLines: 0, roomOther: 0
  };
  base.mainLines = printSeatLineCount_(base.mainCols);
  base.mainOther = printBlockWidth_(base.mainCols, 0);
  base.roomCols.forEach(function (cols) {
    base.roomLines = Math.max(base.roomLines, printSeatLineCount_(cols));
    base.roomOther = Math.max(base.roomOther, printBlockWidth_(cols, 0));
  });
  var cs = rooms.length ? [Math.min(3, rooms.length), Math.min(2, rooms.length), 1] : [0];
  var seen = {};
  cs = cs.filter(function (c) { if (seen[c]) return false; seen[c] = true; return true; });
  var tries = cs.map(function (c) { return printTryColumns_(model, opts, picked, c, base); });
  var chosen = null;
  tries.forEach(function (t) { if (!chosen && t.tier1) chosen = t; });
  tries.forEach(function (t) { if (!chosen && t.tier2) chosen = t; });
  var warnings = [];
  if (!chosen) {
    // 한 장에 다 못 담는다: 이어지는 쪽이 가장 적고 표시 칸이 넓은 것을 고른다
    chosen = tries.slice().sort(function (a, b) {
      var ca = (a.mainRowsFront < picked.main.rows ? 1 : 0) + a.contRooms.length;
      var cb = (b.mainRowsFront < picked.main.rows ? 1 : 0) + b.contRooms.length;
      return ca !== cb ? ca - cb : b.markW - a.markW;
    })[0];
  }
  var lay = chosen;
  lay.n = n; lay.main = main; lay.rooms = rooms; lay.mainCols = base.mainCols; lay.roomCols = base.roomCols;
  lay.head = head; lay.foot = foot; lay.bodyH = base.bodyH; lay.vacantLabel = vacantLabel; lay.summary = printSummary_(model);
  lay.markH = lay.pitch - PRINT_NAME_PT;
  lay.cont = lay.allFit ? [] : printContPages_(lay, picked, base);

  // 앞면 특이사항 목록 칸
  lay.entries = printEntries_(model);
  var listW = (lay.rightW - 4) / 2;
  var linesPerCol = Math.floor((lay.listH - PRINT_LIST_TITLE_PT - 2) / PRINT_LIST_LINE_PT);
  var texts = lay.entries.map(printEntryText_);
  var pack = printPackColumns_(texts, 2, linesPerCol, listW, 7);
  lay.listPack = pack;
  lay.listShown = pack.count;
  lay.listCapacity = pack.count;
  lay.listOverflow = pack.count < texts.length;
  lay.listTexts = texts;
  lay.listW = listW;

  // 뒷면(목록) 쪽
  var listPage = opts.listPage || 'auto';
  var backItems = [];
  if (foot.over) {
    backItems.push({ title: true, text: '자리 배정 안 됨 ' + foot.items.length + '명' });
    foot.items.forEach(function (t) { backItems.push({ text: t }); });
  }
  if (listPage === 'always' || (listPage !== 'never' && lay.listOverflow)) {
    backItems.push({ title: true, text: '오늘 특이사항 ' + lay.entries.length + '명' });
    texts.forEach(function (t) { backItems.push({ text: t }); });
    if (!texts.length) backItems.push({ text: '없음' });
  }
  var backColW = PRINT_PAGE_W_PT / PRINT_BACK_COLS - 6;   // 열 padding-right 6pt를 뺀 내용 너비
  var backLines = Math.floor((PRINT_PAGE_H_PT - 24 - PRINT_SLACK_PT - 4) / (PRINT_BACK_LINE_PT + 0.5));
  lay.back = backItems.length ? printPackPages_(backItems, PRINT_BACK_COLS, backLines, backColW - 1, 8) : [];
  lay.backColW = backColW;
  lay.pages = 1 + lay.cont.length + lay.back.length;
  lay.needPage2 = lay.pages > 1;

  // 경고: 실제 원인대로
  if (lay.markW < PRINT_HAND_MIN_W_PT) warnings.push('표시 칸이 손글씨 하한(' + printNum_(PRINT_HAND_MIN_W_PT) + 'pt)보다 좁습니다(' + printNum_(lay.markW) + 'pt). 블록이 너무 많습니다.');
  else if (lay.markW < PRINT_MARK_MIN_W_PT) warnings.push('표시 칸이 목표(' + PRINT_MARK_MIN_W_PT + 'pt)보다 좁습니다(' + printNum_(lay.markW) + 'pt).');
  if (lay.mainRowsFront < main.rows) warnings.push('큰 공간이 ' + main.rows + '행이라 앞면에 ' + lay.mainRowsFront + '행만 들어가 나머지는 뒷면에 이어집니다.');
  if (lay.contRooms.length) warnings.push('작은 공간 ' + lay.contRooms.length + '개가 앞면에 안 들어가 뒷면에 이어집니다.');
  if (foot.over) warnings.push('자리 배정 안 된 학생 ' + foot.items.length + '명 중 일부만 앞면에 있습니다(전체는 뒷면).');
  if (lay.listOverflow) warnings.push('오늘 특이사항 ' + lay.entries.length + '명 중 ' + lay.listShown + '명만 앞면에 있습니다' + (listPage === 'never' ? '.' : '(전체는 뒷면).'));
  if (lay.pitch < PRINT_MIN_PITCH_PT) warnings.push('좌석 한 줄 높이가 기준(' + PRINT_MIN_PITCH_PT + 'pt)보다 낮습니다(' + printNum_(lay.pitch) + 'pt).');
  lay.warnings = warnings;
  lay.warnText = '큰 공간 ' + (lay.mainRowsFront < main.rows ? '일부 행' : '') + (lay.contRooms.length ? (lay.mainRowsFront < main.rows ? '과 ' : '') + '작은 공간 ' + lay.contRooms.length + '개' : '') + '가 앞면에 다 안 들어가 뒷면에 이어집니다.';
  lay.fits = lay.allFit;     // 앞면 한 장에 공간이 모두 들어갔는가(뒷면이 목록뿐이면 true)
  return lay;
}

/** 진단용: 배치 요약 */
function printSheetPlan_(model, opts) {
  if (!model.operating || !model.spaces || !model.spaces.length || !model.blocks || !model.blocks.length) return null;
  var p = printLayout_(model, opts);
  return {
    pages: p.pages, frontPage: 1, contPages: p.cont.length, backPages: p.back.length,
    roomColumns: p.c, roomRows: p.c ? Math.ceil(p.frontRooms.length / p.c) : 0, frontRooms: p.frontRooms.length, contRooms: p.contRooms.length,
    mainRowsFront: p.mainRowsFront, lineW: p.L, markW: p.markW, markWmm: p.markW / 72 * 25.4,
    pitch: p.pitch, pitchMm: p.pitch / 72 * 25.4, markHmm: p.markH / 72 * 25.4, nameFontPt: PRINT_NAME_FONT_PT, markFontPt: 7,
    listCapacity: p.listCapacity, listCount: p.entries.length, listOverflow: p.listOverflow, listHeight: p.listH,
    fits: p.fits, warnings: p.warnings, summary: p.summary, footOver: p.foot.over, unseated: p.foot.items.length
  };
}

/* ───────────── HTML 조립 ───────────── */

function printFixedLabel_(cell) {
  return cell.kind === 'pillar' ? '기둥' : (cell.kind === 'door' ? '비상문' : (cell.kind === 'window' ? '창문' : ''));
}

function printFixedStyle_(cell) {
  var style = 'padding:0;text-align:center;vertical-align:middle;overflow:hidden;font-size:7pt;line-height:8pt;';
  if (cell.kind === 'pillar') {
    // 회색 빗금(변환기가 gradient를 못 그려도 회색 바탕 + "기둥" 글자로 구분된다)
    style += 'background-color:#b5b5b5;background-image:repeating-linear-gradient(45deg,#8a8a8a 0,#8a8a8a 1pt,#b5b5b5 1pt,#b5b5b5 4pt);border:0.5pt solid #555;';
  } else {
    style += 'border:0.5pt dashed #555;';
  }
  return style;
}

/**
 * 한 공간 표(행 rowFrom~rowTo): 제목 줄 · 줄 머리("18석 공3") · 좌석마다 두 줄(이름 칸 / 표시 칸 n개).
 * 이름 칸이 위, 표시 칸이 아래라서 줄 너비 = 표시 칸 n개 너비다.
 */
function printBlockHtml_(space, lay, ex, rowFrom, rowTo, suffix) {
  var n = lay.n;
  var cols = printColumns_(space);
  var L = lay.L, markW = lay.markW;
  var byPos = {};
  var count = {};
  (space.cells || []).forEach(function (c) {
    byPos[c.row + ',' + c.col] = c;
    if (c.kind === 'seat') {
      var k = count[c.col] || (count[c.col] = { seats: 0, vacant: 0 });
      k.seats++;
      if (!c.occupant) k.vacant++;
    }
  });
  var widths = [];
  cols.forEach(function (c) {
    if (c.role === 'seat') { for (var i = 0; i < n; i++) widths.push(markW); }
    else widths.push(c.role === 'fixed' ? PRINT_FIXED_COL_PT : PRINT_GAP_PT);
  });
  var total = widths.length;
  var totalW = 0;
  widths.forEach(function (w) { totalW += w; });
  var out = [];
  out.push('<table style="width:' + printNum_(totalW) + 'pt;border-collapse:collapse;table-layout:fixed">');
  out.push('<colgroup>' + widths.map(function (w) { return '<col style="width:' + printNum_(w) + 'pt">'; }).join('') + '</colgroup>');
  var titleH = printTitleH_(space, totalW);
  out.push('<tr style="height:' + titleH + 'pt"><td class="t" colspan="' + total + '" style="padding:0;font-size:8pt;font-weight:bold;line-height:' + PRINT_TITLE_PT +
    'pt;word-break:break-all">' + printEsc_(printTitleText_(space)) + (suffix ? ' ' + printEsc_(suffix) : '') + '</td></tr>');
  out.push('<tr style="height:' + PRINT_LINEHEAD_PT + 'pt">');
  cols.forEach(function (c) {
    if (c.role === 'seat') {
      var k = count[c.col] || { seats: 0, vacant: 0 };
      out.push('<td class="h" colspan="' + n + '" style="padding:0;text-align:center;vertical-align:bottom;font-size:7pt;font-weight:bold;line-height:' + PRINT_LINEHEAD_PT + 'pt">' + k.seats + '석 공' + k.vacant + '</td>');
    } else {
      out.push('<td style="padding:0;border:0"></td>');
    }
  });
  out.push('</tr>');
  for (var r = rowFrom; r <= rowTo; r++) {
    var nameH = PRINT_NAME_PT + ex.name[r];
    var markH = lay.markH + ex.mark[r];
    var rows1 = [];
    var rows2 = [];
    cols.forEach(function (c) {
      var cell = byPos[r + ',' + c.col];
      if (c.role === 'gap') { rows1.push('<td class="g" rowspan="2" style="padding:0;border:0"></td>'); return; }
      if (c.role === 'fixed') {
        rows1.push(cell ? '<td class="x" rowspan="2" style="' + printFixedStyle_(cell) + '">' + printFixedLabel_(cell) + '</td>' : '<td rowspan="2" style="padding:0;border:0"></td>');
        return;
      }
      if (!cell) { rows1.push('<td colspan="' + n + '" rowspan="2" style="padding:0;border:0"></td>'); return; }
      if (cell.kind !== 'seat') { rows1.push('<td class="x" colspan="' + n + '" rowspan="2" style="' + printFixedStyle_(cell) + '">' + printFixedLabel_(cell) + '</td>'); return; }
      var vacant = !cell.occupant;
      var shade = vacant ? 'background:' + PRINT_VACANT_BG + ';' : '';
      var text = printNameText_(cell, lay.vacantLabel);
      var nf = printNameFont_(text, L);
      rows1.push('<td class="n" colspan="' + n + '" style="padding:0 1pt;overflow:hidden;vertical-align:middle;border:0.8pt solid #222;border-bottom:0.5pt solid #555;' +
        'white-space:' + (nf.lines > 1 ? 'normal;word-break:break-all' : 'nowrap') + ';font-size:' + printNum_(nf.pt) + 'pt;line-height:' + PRINT_NAME_PT + 'pt;' +
        (vacant ? 'color:#555;' + shade : 'font-weight:bold;') + '">' + printEsc_(text) + '</td>');
      for (var i = 0; i < n; i++) {
        var m = (cell.marks || [])[i] || { text: '', code: 'NONE' };
        var filled = m.text !== '' && m.text !== undefined && m.text !== null;
        rows2.push('<td class="m" style="padding:0;overflow:hidden;text-align:center;vertical-align:top;word-break:break-all;border:0.5pt solid #555;' +
          'font-size:7pt;line-height:' + PRINT_MARK_LINE_PT + 'pt;' + (filled ? 'background:' + PRINT_FILLED_BG + ';' + (m.code === 'EXC' ? 'font-weight:bold;' : '') : shade) + '">' + printEsc_(filled ? m.text : '') + '</td>');
      }
    });
    out.push('<tr style="height:' + printNum_(nameH) + 'pt">' + rows1.join('') + '</tr>');
    out.push('<tr style="height:' + printNum_(markH) + 'pt">' + rows2.join('') + '</tr>');
  }
  out.push('</table>');
  return { html: out.join(''), width: totalW };
}

/** 작은 공간들을 c열로 늘어놓은 표. idx = 공간 번호 목록 */
function printRoomsHtml_(idx, lay) {
  var rowsHtml = [];
  var c = lay.c;
  for (var r = 0; r * c < idx.length; r++) {
    var tds = [];
    for (var k = 0; k < c; k++) {
      var at = r * c + k;
      var i = idx[at];
      var sp = i === undefined ? null : lay.rooms[i];
      tds.push('<td style="padding:0;vertical-align:top;width:' + printNum_(lay.roomW) + 'pt">' +
        (sp ? printBlockHtml_(sp, lay, lay.roomEx[i], 1, sp.rows, '').html : '') + '</td>');
      if (k < c - 1) tds.push('<td style="padding:0;width:' + PRINT_ROOMGAP_PT + 'pt"></td>');
    }
    rowsHtml.push('<tr>' + tds.join('') + '</tr>');
    if ((r + 1) * c < idx.length) rowsHtml.push('<tr><td colspan="' + (c * 2 - 1) + '" style="padding:0;height:' + PRINT_ROOMVGAP_PT + 'pt"></td></tr>');
  }
  return '<table style="width:' + printNum_(lay.rightW) + 'pt;border-collapse:collapse;table-layout:fixed">' + rowsHtml.join('') + '</table>';
}

function printListDivs_(items) {
  return items.map(function (t) {
    return '<div style="font-size:7pt;line-height:' + PRINT_LIST_LINE_PT + 'pt;word-break:break-all">' + printEsc_(t) + '</div>';
  }).join('');
}

function printListHtml_(lay) {
  var note = lay.listOverflow ? (lay.back.length && lay.listOverflow ? '&nbsp;(전체는 뒷면)' : '&nbsp;(자리가 모자라 일부만)') : '';
  var cols = lay.listPack.columns;
  var body = lay.entries.length ? printListDivs_(cols[0]) : '<div style="font-size:7pt;line-height:' + PRINT_LIST_LINE_PT + 'pt">없음</div>';
  var out = '<div style="width:' + printNum_(lay.rightW) + 'pt;height:' + printNum_(Math.max(PRINT_LIST_TITLE_PT, lay.listH)) + 'pt;overflow:hidden">' +
    '<div style="font-size:8pt;font-weight:bold;line-height:' + PRINT_LIST_TITLE_PT + 'pt;border-bottom:0.5pt solid #555">오늘 특이사항 ' + lay.entries.length + '명' + note + '</div>' +
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr><td style="padding:0;vertical-align:top;width:50%">' + body +
    '</td><td style="padding:0 0 0 4pt;vertical-align:top">' + printListDivs_(cols[1]) + '</td></tr></table></div>';
  return out;
}

function printMemoHtml_(lay) {
  return '<div style="height:' + (PRINT_MEMO_PT - 2) + 'pt;border:0.5pt solid #555;font-size:7pt;line-height:8pt;overflow:hidden">&nbsp;메모 (조퇴 사유·무단 사항)</div>';
}

function printFrontHtml_(model, lay, isLast) {
  var main = printBlockHtml_(lay.main, lay, lay.mainEx, 1, lay.mainRowsFront, lay.mainRowsFront < lay.main.rows ? '(1/앞)' : '');
  var right = (lay.rooms.length ? printRoomsHtml_(lay.frontRooms, lay) + '<div style="height:' + PRINT_ROOMVGAP_PT + 'pt"></div>' : '') +
    printListHtml_(lay) + '<div style="height:' + PRINT_ROOMVGAP_PT + 'pt"></div>' + printMemoHtml_(lay);
  var body = '<table style="border-collapse:collapse;table-layout:fixed;width:' + PRINT_PAGE_W_PT + 'pt"><tr>' +
    '<td style="padding:0;vertical-align:top;width:' + printNum_(main.width) + 'pt">' + main.html + '</td>' +
    '<td style="padding:0;width:' + PRINT_SEP_PT + 'pt"></td><td style="padding:0;vertical-align:top">' + right + '</td></tr></table>';
  return '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt;overflow:hidden;' + PRINT_COLOR_EXACT +
    'page-break-after:' + (isLast ? 'auto' : 'always') + '">' + printHeadHtml_(model, lay) + body + printFootHtml_(lay.foot, lay.warnText) + '</section>';
}

function printMiniHead_(model, label) {
  return '<div style="height:24pt;font-size:12pt;font-weight:bold;line-height:22pt;white-space:nowrap;overflow:hidden">' +
    printEsc_(model.title || '신한학사 출석부') + ' · ' + printEsc_(printDateKo_(model.date, model.weekdayKo)) + ' · ' + printEsc_(label) + '</div>';
}

function printContHtml_(model, lay, cp, label, isLast) {
  var left = cp.mainTo >= cp.mainFrom ? printBlockHtml_(lay.main, lay, lay.mainEx, cp.mainFrom, cp.mainTo, '(이어서)') : null;
  var right = cp.rooms.length ? printRoomsHtml_(cp.rooms, lay) : '';
  var body = '<table style="border-collapse:collapse;table-layout:fixed;width:' + PRINT_PAGE_W_PT + 'pt"><tr>' +
    '<td style="padding:0;vertical-align:top;width:' + printNum_(left ? left.width : 0) + 'pt">' + (left ? left.html : '') + '</td>' +
    '<td style="padding:0;width:' + PRINT_SEP_PT + 'pt"></td><td style="padding:0;vertical-align:top">' + right + '</td></tr></table>';
  return '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt;overflow:hidden;' + PRINT_COLOR_EXACT +
    'page-break-after:' + (isLast ? 'auto' : 'always') + '">' + printMiniHead_(model, label) + body + '</section>';
}

function printBackHtml_(model, lay, page, label, isLast) {
  var tds = page.map(function (col) {
    return '<td style="padding:0 6pt 0 0;vertical-align:top;width:' + printNum_(lay.backColW) + 'pt">' + col.map(function (it) {
      if (it.title) return '<div style="font-size:10pt;font-weight:bold;line-height:' + (PRINT_BACK_LINE_PT * 2) + 'pt;border-bottom:0.5pt solid #555">' + printEsc_(it.text) + '</div>';
      return '<div style="font-size:8pt;line-height:' + PRINT_BACK_LINE_PT + 'pt;word-break:break-all;border-bottom:0.3pt dotted #999">' + printEsc_(it.text) + '</div>';
    }).join('') + '</td>';
  });
  return '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt;overflow:hidden;' + PRINT_COLOR_EXACT +
    'page-break-after:' + (isLast ? 'auto' : 'always') + '">' + printMiniHead_(model, label) +
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>' + tds.join('') + '</tr></table></section>';
}

function printNoticePage_(model, text) {
  return '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt;overflow:hidden">' +
    '<div style="font-size:16pt;font-weight:bold;padding-top:40pt;text-align:center">' + printEsc_(printDateKo_(model.date, model.weekdayKo)) + ' ' + printEsc_(text) + '</div></section>';
}

/**
 * 출석부 HTML 문서. 운영 안 하는 날·공간 없음·블록 없음은 안내 한 쪽만 돌려준다(C7은 보통 렌더러를 부르기 전에 안내한다 — 방어용).
 */
function printRenderSheet_(model, opts) {
  opts = opts || {};
  if (!model || typeof model !== 'object') throw new Error('출석부 모델이 없습니다.');
  var head = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + printEsc_(model.title || '출석부') + '</title>' +
    '<style>@page { size: A4 landscape; margin: 8mm; } html, body { margin: 0; padding: 0; } ' +
    'body { font-family: ' + PRINT_FONT + '; color: #000; background: #fff; ' + PRINT_COLOR_EXACT + ' } table { empty-cells: show; }</style></head><body>';
  if (!model.operating) return head + printNoticePage_(model, '은(는) 운영하지 않는 날입니다.') + '</body></html>';
  if (!model.spaces || !model.spaces.length) return head + printNoticePage_(model, '은(는) 출석부에 쓸 공간(좌석 배치)이 없습니다. 좌석 배치에서 먼저 공간과 좌석을 만들어 주세요.') + '</body></html>';
  if (!model.blocks || !model.blocks.length) return head + printNoticePage_(model, '은(는) 자습 블록이 없습니다. 자습 일정·블록에서 확인해 주세요.') + '</body></html>';
  var lay = printLayout_(model, opts);
  var total = lay.pages;
  var out = [];
  var k = 1;
  out.push(printFrontHtml_(model, lay, total === 1));
  lay.cont.forEach(function (cp) { k++; out.push(printContHtml_(model, lay, cp, '앞면에 이어서 (' + k + '/' + total + ')', k === total)); });
  lay.back.forEach(function (pg) { k++; out.push(printBackHtml_(model, lay, pg, '뒷면 목록 (' + k + '/' + total + ')', k === total)); });
  return head + out.join('') + '</body></html>';
}
