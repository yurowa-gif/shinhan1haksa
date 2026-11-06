/**
 * 출석부 HTML 렌더러(D4, D4.1에서 실제 운영 시트 모양으로 맞춤). 소유: DESIGN. 순수 함수 — Apps Script 서비스·현재 시각을 쓰지 않는다.
 *
 *   printRenderSheet_(model, opts) → HTML 문서 문자열. 공간마다 <section class="page"> 하나(A4 가로 한 장).
 *   printSheetPlan_(model, opts)   → 쪽마다 칸 크기·글자 크기·넘침 여부(테스트·C7 진단용).
 *
 * model 모양은 docs/contracts/sheet-model.md(변경 없음). 렌더러는 marks[].text를 바꾸지 않고 이스케이프만 한다.
 * PDF 변환기(Utilities 서비스의 Blob 변환)가 이해하도록 표(table) 기반·인라인 CSS만 쓴다(flex·grid·웹폰트·외부 리소스 없음).
 * 흑백 인쇄로도 구분되게 색 대신 회색 바탕·굵기·글자로 나타낸다.
 *
 * 실제 출석부(docs/reference/real-layout-2025.md 4.1)처럼 그린다:
 *  - 좌석 하나 = 표 한 줄: [이름 칸] + [표시 칸(블록) n개]. 이름 칸은 '학년. 이름' 또는 '공석'.
 *  - 격자의 열 하나 = 세로 줄 하나. 통로 열이 없이 붙은 두 줄은 '짝줄'이라 이름 칸이 등을 맞대고 표시 칸이 바깥쪽에 온다.
 *    홑줄은 표시 칸이 가운데(통로) 쪽에 온다. 표시 칸은 어느 줄이든 왼쪽→오른쪽이 ①②③ 순서다.
 *  - 줄 머리 칸 "공석 수/좌석 수"(예 5/19)를 줄마다 위에 쓴다.
 *  - 머리말: 가운데 "신한학사 출석부", 오른쪽 날짜·요일, 왼쪽 공간 이름·근무자(없으면 밑줄).
 * 글자 크기: 이름 8pt·표시 칸 7pt 이상. 표시 칸이 너무 좁으면(13pt 미만) 좌우 두 쪽으로 나눈다.
 * 설계 근거·확인 항목: docs/design/print-layout.md, docs/design/print-check.md. 전역 이름은 모두 print 접두어.
 */

var PRINT_PAGE_W_PT = 796;       // A4 가로 281mm(여백 8mm씩 뺀 폭)
var PRINT_PAGE_H_PT = 544;       // 같은 방식 192mm(194mm에서 여유 2mm: 넘침으로 빈 쪽이 생기는 것을 막는다)
var PRINT_HEAD_PT = 36;          // 머리말 높이
var PRINT_LINEHEAD_PT = 12;      // 줄 머리 칸(공석 수/좌석 수) 높이
var PRINT_FOOT_PT = 12;          // 아래 줄(배정 안 된 학생) 높이
var PRINT_MIN_ROW_PT = 22.5;     // 좌석 한 줄 기본 높이(7pt 글자 3줄이 들어간다)
var PRINT_MARK_PT = 7.2;         // 표시 칸 글자 줄 높이(7pt 글자, 배율 1)
var PRINT_NAME_PT = 8;           // 이름 글자(배율 1)
var PRINT_MIN_SCALE = 0.9;       // 줄바꿈이 많아 빠듯하면 칸 높이를 이만큼까지 줄인다(글자 크기는 줄이지 않는다)
var PRINT_MAX_SCALE = 2.2;       // SA실처럼 칸이 적을 때 키우는 한계
var PRINT_MAX_LINE_PT = 190;     // 줄(이름 칸 + 표시 칸) 최대 너비
var PRINT_GAP_PT = 4;            // 통로(빈) 열 너비
var PRINT_FIXED_COL_PT = 28;     // 기둥·비상문·창문만 있는 열 너비
var PRINT_MIN_MARK_CELL_PT = 13; // 표시 칸 최소 너비(이보다 좁으면 쪽을 나눈다)
var PRINT_ROW_SLACK_PT = 0.8;    // 이름 칸 테두리(0.8pt)가 행마다 더하는 높이(크롬에서 잰 0.75pt) 여유
var PRINT_SLACK_PT = 2;          // 그 밖의 여유
var PRINT_FONT = '"Nanum Gothic","Malgun Gothic","Apple SD Gothic Neo",sans-serif';

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

/** 공간 안 열 범위 [from, to]에서 좌석이 있는 열(seat)·기둥/문/창만 있는 열(fixed)·빈 열(empty)을 나눈다 */
function printColumnKinds_(space, from, to) {
  var kinds = {};
  var c;
  for (c = from; c <= to; c++) kinds[c] = 'empty';
  (space.cells || []).forEach(function (cell) {
    if (cell.col < from || cell.col > to) return;
    if (cell.kind === 'seat') kinds[cell.col] = 'seat';
    else if (kinds[cell.col] === 'empty') kinds[cell.col] = 'fixed';
  });
  return kinds;
}

/**
 * 열 목록: [{col, role:'seat'|'fixed'|'gap', side:'left'|'right'}].
 * 통로 없이 붙은 좌석 열 묶음이 짝줄이다. side = 표시 칸이 이름 칸의 어느 쪽에 오는지
 * (짝줄은 바깥쪽: 왼쪽 줄 left·오른쪽 줄 right, 홑줄은 가운데 쪽: 맨 오른쪽 홑줄만 left, 나머지는 right).
 */
function printColumns_(kinds, from, to) {
  var runs = [];
  var cur = null;
  var c;
  for (c = from; c <= to; c++) {
    if (kinds[c] === 'seat') {
      if (!cur) { cur = []; runs.push(cur); }
      cur.push(c);
    } else {
      cur = null;
    }
  }
  var side = {};
  runs.forEach(function (run, ri) {
    run.forEach(function (col, i) {
      if (run.length === 1) side[col] = (runs.length > 1 && ri === runs.length - 1) ? 'left' : 'right';
      else side[col] = i < run.length / 2 ? 'left' : 'right';
    });
  });
  var cols = [];
  for (c = from; c <= to; c++) {
    cols.push({ col: c, role: kinds[c] === 'seat' ? 'seat' : (kinds[c] === 'fixed' ? 'fixed' : 'gap'), side: side[c] || 'right' });
  }
  return cols;
}

/**
 * 한 쪽(공간의 열 범위)의 크기 계획.
 * @return {{from,to,kinds,cols,lineW,nameW,markW,scale,fontScale,nameScale,rowH:number[],extraRows:number[],fits,narrow,seatCols,warnings:string[]}}
 */
function printPlanPage_(space, model, from, to, hasFoot, opts) {
  var n = model.blocks.length;
  var kinds = printColumnKinds_(space, from, to);
  var cols = printColumns_(kinds, from, to);
  var fixedSum = 0;
  var seatCols = 0;
  cols.forEach(function (c) {
    if (c.role === 'seat') seatCols++;
    else fixedSum += c.role === 'fixed' ? PRINT_FIXED_COL_PT : PRINT_GAP_PT;
  });
  var lineW = seatCols ? Math.min(PRINT_MAX_LINE_PT, Math.floor((PRINT_PAGE_W_PT - 2 - fixedSum) / seatCols * 10) / 10) : 0;
  var rows = space.rows;
  var gridH = PRINT_PAGE_H_PT - PRINT_HEAD_PT - PRINT_LINEHEAD_PT - (hasFoot ? PRINT_FOOT_PT : 0) -
    PRINT_SLACK_PT - rows * PRINT_ROW_SLACK_PT;

  var vacantLabel = (opts && opts.vacantLabel) || '공석';
  var maxNameEm = printTextEm_(vacantLabel);
  var seatCells = (space.cells || []).filter(function (cell) {
    return cell.kind === 'seat' && cell.col >= from && cell.col <= to;
  });
  seatCells.forEach(function (cell) {
    if (cell.occupant) maxNameEm = Math.max(maxNameEm, printTextEm_(cell.occupant.display));
  });

  var scale = 1;
  var nameScale = 1, nameW = 0, markW = 0, fontScale = 1;
  var cellLines = [];
  var extraRows = [];
  var base = gridH / rows;
  for (var it = 0; it < 6; it++) {
    // 이름 칸 너비: 이름이 한 줄에 들어가는 만큼(줄 너비의 절반까지)
    nameScale = printClamp_((lineW * 0.5 - 3) / (maxNameEm * PRINT_NAME_PT), 1, Math.max(1, scale));
    // 표시 칸이 좁은 쪽(4블록 일요일)은 이름을 키우지 않는다: 한 칸에 7pt 글자 두 개("병결")가 들어가야 한다
    if (seatCols && (lineW - Math.ceil(maxNameEm * PRINT_NAME_PT + 3)) / n < 15) nameScale = 1;
    nameW = seatCols ? Math.min(lineW * 0.5, Math.max(24, Math.ceil(maxNameEm * PRINT_NAME_PT * nameScale + 3))) : 0;
    markW = seatCols ? (lineW - nameW) / n : 0;
    // 표시 칸마다 7pt 글자가 몇 줄 필요한지(칸이 좁으면 줄바꿈). 한 칸에 capLines줄까지는 행 높이를 늘리지 않는다
    var avail = Math.max(1, markW - 0.4);   // 칸 안 글자 폭: 겹친 테두리 0.5의 절반씩 + 여유(표시 칸 안쪽 여백은 0)
    var capLines = Math.max(1, Math.floor((PRINT_MIN_ROW_PT * scale - 1) / PRINT_MARK_PT + 0.1));
    var baseLines = {};
    cellLines = [];
    extraRows = [];
    var r;
    for (r = 0; r <= rows; r++) extraRows.push(0);
    seatCells.forEach(function (cell) {
      var maxLines = 1;
      (cell.marks || []).forEach(function (m) {
        if (!m.text) return;
        if (baseLines[m.text] === undefined) baseLines[m.text] = printWrapLines_(m.text, 7, avail);
        if (baseLines[m.text] > maxLines) maxLines = baseLines[m.text];
      });
      cellLines.push({ row: cell.row, lines: maxLines });
      var extra = Math.max(0, maxLines - capLines) * PRINT_MARK_PT * scale;
      if (extra > extraRows[cell.row]) extraRows[cell.row] = extra;
    });
    var sumExtra = 0;
    for (r = 1; r <= rows; r++) sumExtra += extraRows[r];
    base = (gridH - sumExtra) / rows;
    var next = printClamp_(base / PRINT_MIN_ROW_PT, PRINT_MIN_SCALE, PRINT_MAX_SCALE);
    // 글자를 키워도(배율 f) 줄 수가 늘지 않는 가장 큰 배율
    fontScale = Math.max(1, next);
    var texts = Object.keys(baseLines);
    while (fontScale > 1.001) {
      var same = true;
      for (var ti = 0; ti < texts.length && same; ti++) {
        if (printWrapLines_(texts[ti], 7 * fontScale, avail) !== baseLines[texts[ti]]) same = false;
      }
      if (same) break;
      fontScale -= 0.02;
    }
    if (fontScale < 1) fontScale = 1;
    if (Math.abs(next - scale) < 0.005) { scale = next; break; }
    scale = next;
  }
  var rowH = [];
  for (var rr = 1; rr <= rows; rr++) rowH.push(PRINT_MIN_ROW_PT * scale + extraRows[rr]);
  var totalH = 0;
  rowH.forEach(function (h) { totalH += h; });

  var warnings = [];
  var fits = totalH <= gridH + 0.5;
  if (!fits) warnings.push('행이 너무 많아 한 장에 들어가지 않습니다(' + rows + '행).');
  if (fits && scale < 1) warnings.push('칸 높이를 줄여 빠듯합니다(줄바꿈이 많음).');
  var narrow = seatCols > 0 && markW < PRINT_MIN_MARK_CELL_PT;
  if (narrow) warnings.push('표시 칸이 너무 좁습니다(' + printNum_(markW) + 'pt).');
  return {
    from: from, to: to, kinds: kinds, cols: cols, lineW: lineW, nameW: nameW, markW: markW, scale: scale,
    fontScale: fontScale, nameScale: nameScale, rowH: rowH, extraRows: extraRows, fits: fits, narrow: narrow,
    seatCols: seatCols, warnings: warnings
  };
}

/** 좁은 쪽은 통로 열(없으면 가운데)에서 좌우로 나눈다. 최대 4쪽까지. → [{from,to}] */
function printPartitions_(space, model, from, to, depth, opts) {
  var plan = printPlanPage_(space, model, from, to, false, opts);
  if (!plan.narrow || plan.seatCols < 4 || (depth || 0) >= 2) return [{ from: from, to: to }];
  var mid = Math.floor((from + to) / 2);
  var best = -1;
  var c;
  for (c = from + 1; c < to; c++) {
    if (plan.kinds[c] !== 'seat' && (best < 0 || Math.abs(c - mid) < Math.abs(best - mid))) best = c;
  }
  var left = best >= 0 ? best : mid;           // 통로 열은 왼쪽 쪽에 붙인다
  return printPartitions_(space, model, from, left, (depth || 0) + 1, opts)
    .concat(printPartitions_(space, model, left + 1, to, (depth || 0) + 1, opts));
}

/** 쪽 목록: 공간 순서대로, 좁으면 나눠서 [{space, from, to, part, parts, foot, plan}] */
function printPages_(model, opts) {
  var pages = [];
  (model.spaces || []).forEach(function (space) {
    var parts = printPartitions_(space, model, 1, space.cols, 0, opts);
    parts.forEach(function (p, i) {
      pages.push({ space: space, from: p.from, to: p.to, part: i + 1, parts: parts.length });
    });
  });
  var hasUnseated = !!(model.unseated && model.unseated.length);
  pages.forEach(function (pg, i) {
    pg.foot = hasUnseated && i === 0;
    pg.plan = printPlanPage_(pg.space, model, pg.from, pg.to, pg.foot, opts);
  });
  return pages;
}

/** 진단용: 쪽마다 크기 계획 요약 */
function printSheetPlan_(model, opts) {
  if (!model.operating) return [];
  return printPages_(model, opts).map(function (pg) {
    var p = pg.plan;
    return {
      spaceId: pg.space.id, name: pg.space.name, part: pg.part, parts: pg.parts, from: pg.from, to: pg.to,
      seatCols: p.seatCols, lineW: p.lineW, nameW: p.nameW, markW: p.markW, scale: p.scale,
      nameFontPt: 8 * p.nameScale, markFontPt: 7 * p.fontScale, rowHeightPt: PRINT_MIN_ROW_PT * p.scale,
      fits: p.fits, narrow: p.narrow, warnings: p.warnings
    };
  });
}

/* ───────────── HTML 조립 ───────────── */

function printHeadHtml_(model, pg) {
  var title = printEsc_(model.title || '신한학사 출석부');
  var duty = model.dutyNames && model.dutyNames.length
    ? printEsc_(model.dutyNames.join(', ')) : '________________';
  var spaceName = printEsc_(pg.space.name) + (pg.parts > 1 ? ' (' + pg.part + '/' + pg.parts + ')' : '');
  var blocks = (model.blocks || []).map(function (b) {
    return printCircled_(b.seq) + printEsc_(b.label);
  }).join('&nbsp;&nbsp;');
  var legend = (model.legend || []).map(function (l) {
    return '<b>' + printEsc_(l.mark) + '</b>&nbsp;' + printEsc_(l.text);
  }).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  var td = 'padding:0;vertical-align:bottom;white-space:nowrap;';
  return '<table style="width:100%;border-collapse:collapse;table-layout:auto;height:' + PRINT_HEAD_PT + 'pt">' +
    '<tr><td style="' + td + 'width:30%;font-size:11pt;font-weight:bold;line-height:18pt">' + spaceName + '</td>' +
    '<td style="' + td + 'text-align:center;font-size:16pt;font-weight:bold;line-height:18pt">' + title + '</td>' +
    '<td style="' + td + 'width:30%;text-align:right;font-size:12pt;font-weight:bold;line-height:18pt">' +
    printEsc_(printDateKo_(model.date, model.weekdayKo)) + '</td></tr>' +
    '<tr><td style="' + td + 'font-size:10pt;line-height:14pt">근무: ' + duty + '</td>' +
    '<td colspan="2" style="' + td + 'text-align:right;font-size:8pt;line-height:14pt"><b>표시 칸(왼쪽→오른쪽)</b>&nbsp;' + blocks +
    '&nbsp;&nbsp;|&nbsp;&nbsp;' + legend + '</td></tr></table>';
}

function printFixedLabel_(cell) {
  return cell.kind === 'pillar' ? '기둥' : (cell.kind === 'door' ? '비상문' : (cell.kind === 'window' ? '창문' : ''));
}

function printFixedStyle_(cell, rowHeightPt) {
  var style = 'height:' + printNum_(rowHeightPt) + 'pt;padding:0;text-align:center;vertical-align:middle;overflow:hidden;font-size:7pt;line-height:8pt;';
  if (cell.kind === 'pillar') {
    // 회색 빗금(변환기가 gradient를 못 그려도 회색 바탕 + "기둥" 글자로 구분된다)
    style += 'background-color:#b5b5b5;background-image:repeating-linear-gradient(45deg,#8a8a8a 0,#8a8a8a 1pt,#b5b5b5 1pt,#b5b5b5 4pt);border:0.5pt solid #555;';
  } else {
    style += 'border:0.5pt dashed #555;';
  }
  return style;
}

/** 좌석 한 줄: 이름 칸 + 표시 칸 n개. side='right'면 [이름][표시…], 'left'면 [표시…][이름] */
function printSeatCellsHtml_(cell, side, plan, model, opts, h) {
  var vacantLabel = (opts && opts.vacantLabel) || '공석';
  var vacant = !cell.occupant;
  var shade = vacant ? 'background:#f2f2f2;' : '';
  var nameFont = 8 * plan.nameScale;
  var name = '<td class="n" style="height:' + printNum_(h) + 'pt;padding:0 1pt;overflow:hidden;white-space:nowrap;vertical-align:middle;' +
    'border:0.8pt solid #222;font-size:' + printNum_(nameFont) + 'pt;line-height:' + printNum_(nameFont + 1.5) + 'pt;' +
    (vacant ? 'color:#666;' + shade : 'font-weight:bold;') + '">' + printEsc_(vacant ? vacantLabel : cell.occupant.display) + '</td>';
  var marks = [];
  var n = model.blocks.length;
  var markFont = 7 * plan.fontScale;
  for (var i = 0; i < n; i++) {
    var m = (cell.marks || [])[i] || { text: '', code: 'NONE' };
    var filled = m.text !== '';
    marks.push('<td class="m" style="height:' + printNum_(h) + 'pt;padding:0;overflow:hidden;text-align:center;vertical-align:top;word-break:break-all;' +
      'border:0.5pt solid #555;font-size:' + printNum_(markFont) + 'pt;line-height:' + printNum_(PRINT_MARK_PT * plan.fontScale) + 'pt;' +
      (filled ? 'background:#e2e2e2;' + (m.code === 'EXC' ? 'font-weight:bold;' : '') : shade) + '">' + printEsc_(m.text) + '</td>');
  }
  return side === 'left' ? marks.join('') + name : name + marks.join('');
}

function printGridHtml_(pg, model, opts) {
  var space = pg.space, plan = pg.plan;
  var n = model.blocks.length;
  var byPos = {};
  var count = {};   // 열별 {seats, vacant}
  (space.cells || []).forEach(function (c) {
    byPos[c.row + ',' + c.col] = c;
    if (c.kind === 'seat' && c.col >= pg.from && c.col <= pg.to) {
      var k = count[c.col] || (count[c.col] = { seats: 0, vacant: 0 });
      k.seats++;
      if (!c.occupant) k.vacant++;
    }
  });
  var widths = [];
  var totalW = 0;
  plan.cols.forEach(function (c) {
    var w = [];
    if (c.role === 'gap') w = [PRINT_GAP_PT];
    else if (c.role === 'fixed') w = [PRINT_FIXED_COL_PT];
    else {
      var marks = [];
      for (var i = 0; i < n; i++) marks.push(plan.markW);
      w = c.side === 'left' ? marks.concat([plan.nameW]) : [plan.nameW].concat(marks);
    }
    w.forEach(function (x) { widths.push(x); totalW += x; });
  });
  var out = [];
  out.push('<table style="width:' + printNum_(totalW) + 'pt;border-collapse:collapse;table-layout:fixed;margin:0 auto">');
  out.push('<colgroup>' + widths.map(function (w) { return '<col style="width:' + printNum_(w) + 'pt">'; }).join('') + '</colgroup>');
  // 줄 머리: 공석 수/좌석 수
  out.push('<tr style="height:' + PRINT_LINEHEAD_PT + 'pt">');
  plan.cols.forEach(function (c) {
    if (c.role === 'seat') {
      var k = count[c.col] || { seats: 0, vacant: 0 };
      out.push('<td class="h" colspan="' + (n + 1) + '" style="padding:0;text-align:center;vertical-align:bottom;font-size:8pt;font-weight:bold;line-height:11pt">' +
        k.vacant + '/' + k.seats + '</td>');
    } else {
      out.push('<td style="padding:0;border:0"></td>');
    }
  });
  out.push('</tr>');
  for (var r = 1; r <= space.rows; r++) {
    var h = plan.rowH[r - 1];
    out.push('<tr style="height:' + printNum_(h) + 'pt">');
    plan.cols.forEach(function (c) {
      var cell = byPos[r + ',' + c.col];
      if (c.role === 'gap') { out.push('<td class="g" style="padding:0;border:0"></td>'); return; }
      if (c.role === 'fixed') {
        out.push(cell ? '<td class="x" style="' + printFixedStyle_(cell, h) + '">' + printFixedLabel_(cell) + '</td>' : '<td style="padding:0;border:0"></td>');
        return;
      }
      if (!cell) { out.push('<td colspan="' + (n + 1) + '" style="padding:0;border:0"></td>'); return; }
      if (cell.kind !== 'seat') { out.push('<td class="x" colspan="' + (n + 1) + '" style="' + printFixedStyle_(cell, h) + '">' + printFixedLabel_(cell) + '</td>'); return; }
      out.push(printSeatCellsHtml_(cell, c.side, plan, model, opts, h));
    });
    out.push('</tr>');
  }
  out.push('</table>');
  return out.join('');
}

function printPageHtml_(pg, model, opts, isLast) {
  var foot = '';
  if (pg.foot) {
    foot = '<div style="height:' + PRINT_FOOT_PT + 'pt;font-size:8pt;line-height:' + PRINT_FOOT_PT + 'pt;overflow:hidden;white-space:nowrap">' +
      '<b>자리 배정 안 됨</b>&nbsp;' + model.unseated.map(function (u) { return printEsc_(u.display); }).join(', ') + '</div>';
  }
  return '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt;overflow:hidden;' +
    'page-break-after:' + (isLast ? 'auto' : 'always') + '">' +
    printHeadHtml_(model, pg) + printGridHtml_(pg, model, opts) + foot + '</section>';
}

/**
 * 출석부 HTML 문서. 운영 안 하는 날(model.operating === false)은 안내 한 쪽만 돌려준다
 * (C7은 이 경우 렌더러를 부르지 않고 화면에 안내한다 — 방어용).
 */
function printRenderSheet_(model, opts) {
  opts = opts || {};
  if (!model || typeof model !== 'object') throw new Error('출석부 모델이 없습니다.');
  var head = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + printEsc_(model.title || '출석부') + '</title>' +
    '<style>@page { size: A4 landscape; margin: 8mm; } html, body { margin: 0; padding: 0; } ' +
    'body { font-family: ' + PRINT_FONT + '; color: #000; background: #fff; } table { empty-cells: show; }</style></head><body>';
  if (!model.operating) {
    return head + '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt">' +
      '<div style="font-size:16pt;font-weight:bold;padding-top:40pt;text-align:center">' + printEsc_(printDateKo_(model.date, model.weekdayKo)) +
      ' 은(는) 운영하지 않는 날입니다.</div></section></body></html>';
  }
  if (!model.blocks || !model.blocks.length) throw new Error('블록이 없어 출석부를 그릴 수 없습니다.');
  var pages = printPages_(model, opts);
  var html = pages.map(function (pg, i) { return printPageHtml_(pg, model, opts, i === pages.length - 1); });
  return head + html.join('') + '</body></html>';
}
