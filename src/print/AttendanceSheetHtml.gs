/**
 * 출석부 HTML 렌더러(D4). 소유: DESIGN. 순수 함수 — Apps Script 서비스·현재 시각을 쓰지 않는다.
 *
 *   printRenderSheet_(model, opts) → HTML 문서 문자열. 공간마다 <section class="page"> 하나(A4 가로 한 장).
 *   printSheetPlan_(model, opts)   → 쪽마다 칸 크기·글자 크기·넘침 여부(테스트·C7 진단용).
 *
 * model 모양은 docs/contracts/sheet-model.md. 렌더러는 marks[].text를 바꾸지 않고 이스케이프만 한다.
 * PDF 변환기(Utilities 서비스의 Blob 변환)가 이해하도록 표(table) 기반·인라인 CSS만 쓴다
 * (flex·grid·웹폰트·외부 리소스 없음). 흑백 인쇄로도 구분되게 색 대신 회색 바탕·굵기·글자로 나타낸다.
 * 좌석 칸 = 1줄 "1. 이름"(또는 공석) · 2줄 블록 칸(미리 채운 학·가·병결·정상 종료, 빈칸은 손으로 ○×△조)
 *          · 3줄 손으로 사유 쓰는 칸('조' 아래). 블록 시간은 머리말에 한 번만 쓴다.
 * 글자 크기: 칸 안 이름 8pt·블록 7pt 이상. 열이 너무 좁으면(블록 칸 14pt 미만) 좌우 두 쪽으로 나눈다.
 * 설계 근거·확인 항목: docs/design/print-check.md. 전역 이름은 모두 print 접두어.
 */

var PRINT_PAGE_W_PT = 796;       // A4 가로 281mm(여백 8mm씩 뺀 폭)
var PRINT_PAGE_H_PT = 544;       // 같은 방식 192mm(194mm에서 여유 2mm: 넘침으로 빈 쪽이 생기는 것을 막는다)
var PRINT_HEAD_PT = 30;          // 머리말 높이
var PRINT_FOOT_PT = 12;          // 아래 줄(배정 안 된 학생) 높이
var PRINT_MIN_ROW_PT = 23;       // 칸 한 줄 최소 높이: 이름 8.5 + 블록 7.5 + 사유 7(테두리 2pt 포함)
var PRINT_NAME_PT = 8.5;         // 기준 높이(배율 1)
var PRINT_MARK_PT = 7.5;
var PRINT_REASON_PT = 7;
var PRINT_MIN_SCALE = 0.9;       // 줄바꿈이 많아 빠듯하면 칸 높이를 이만큼까지 줄인다(글자 크기는 줄이지 않는다)
var PRINT_MAX_SCALE = 2.2;       // SA실처럼 칸이 적을 때 키우는 한계
var PRINT_MAX_SEAT_COL_PT = 170; // 좌석 열 최대 너비
var PRINT_AISLE_PT = 6;          // 통로(빈) 열 너비
var PRINT_FIXED_COL_PT = 28;     // 기둥·비상문·창문만 있는 열 너비
var PRINT_MIN_MARK_CELL_PT = 14; // 블록 칸 최소 너비(이보다 좁으면 쪽을 나눈다)
var PRINT_ROW_SLACK_PT = 0.4;    // 칸 테두리가 행마다 더하는 높이(크롬에서 잰 0.35pt) 여유
var PRINT_SLACK_PT = 2;          // 그 밖의 여유
var PRINT_BORDER_PT = 2;         // 칸 테두리가 차지하는 높이 여유
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

function printCircled_(n) {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : '(' + n + ')';
}

/** '2027-03-03' + '수' → '2027년 3월 3일(수)' (Date를 쓰지 않는다) */
function printDateKo_(date, weekdayKo) {
  var p = String(date || '').split('-');
  if (p.length !== 3) return String(date || '');
  return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일(' + (weekdayKo || '') + ')';
}

/** 공간 안 열 범위 [from, to]에서 좌석 열·고정 칸 열·빈 열을 나눈다 */
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
 * 한 쪽(공간의 열 범위)의 크기 계획.
 * @return {{from,to,kinds,colW:number[],seatW,markW,scale,rowH:number[],extraRows:number[],fits,narrow,seatCols,warnings:string[]}}
 */
function printPlanPage_(space, model, from, to, hasFoot) {
  var n = model.blocks.length;
  var kinds = printColumnKinds_(space, from, to);
  var fixedSum = 0;
  var seatCols = 0;
  var c;
  for (c = from; c <= to; c++) {
    if (kinds[c] === 'seat') seatCols++;
    else fixedSum += kinds[c] === 'fixed' ? PRINT_FIXED_COL_PT : PRINT_AISLE_PT;
  }
  var seatW = seatCols ? Math.min(PRINT_MAX_SEAT_COL_PT, Math.floor((PRINT_PAGE_W_PT - 2 - fixedSum) / seatCols * 10) / 10) : 0;
  var colW = [];
  for (c = from; c <= to; c++) {
    colW.push(kinds[c] === 'seat' ? seatW : (kinds[c] === 'fixed' ? PRINT_FIXED_COL_PT : PRINT_AISLE_PT));
  }
  var markW = seatW / n;
  var gridH = PRINT_PAGE_H_PT - PRINT_HEAD_PT - (hasFoot ? PRINT_FOOT_PT : 0) - PRINT_SLACK_PT - space.rows * PRINT_ROW_SLACK_PT;
  var rows = space.rows;

  // 1) 글자 7pt 기준으로 블록 칸마다 몇 줄이 필요한지 센다(넘치면 줄바꿈 = 그 행만 높아진다)
  var avail = Math.max(1, markW - 1);
  var cellLines = [];
  var fitLimit = Infinity;   // 줄 수가 늘지 않는 한 글자를 키울 수 있는 배율 한계
  var maxNameEm = 0;
  (space.cells || []).forEach(function (cell) {
    if (cell.kind !== 'seat' || cell.col < from || cell.col > to) return;
    var maxLines = 1;
    (cell.marks || []).forEach(function (m) {
      var em = printTextEm_(m.text);
      if (!em) return;
      var lines = Math.max(1, Math.ceil(em * 7 / avail));
      if (lines > maxLines) maxLines = lines;
      fitLimit = Math.min(fitLimit, lines * avail / (em * 7));
    });
    if (cell.occupant) maxNameEm = Math.max(maxNameEm, printTextEm_(cell.occupant.display));
    cellLines.push({ row: cell.row, lines: maxLines });
  });
  // 2) 줄바꿈으로 늘어나는 높이를 빼고 남는 높이로 배율을 정한다(늘어난 높이는 배율에 따라 달라서 몇 번 맞춘다)
  var scale = 1;
  var extraRows = [];
  var base = gridH / rows;
  for (var it = 0; it < 5; it++) {
    extraRows = [];
    var r;
    for (r = 0; r <= rows; r++) extraRows.push(0);
    cellLines.forEach(function (cl) {
      var extra = (cl.lines - 1) * PRINT_MARK_PT * scale;
      if (extra > extraRows[cl.row]) extraRows[cl.row] = extra;
    });
    var sumExtra = 0;
    for (r = 1; r <= rows; r++) sumExtra += extraRows[r];
    base = (gridH - sumExtra) / rows;
    var next = printClamp_(base / PRINT_MIN_ROW_PT, PRINT_MIN_SCALE, PRINT_MAX_SCALE);
    if (Math.abs(next - scale) < 0.005) { scale = next; break; }
    scale = next;
  }
  var fontScale = printClamp_(fitLimit === Infinity ? scale : fitLimit, 1, Math.max(1, scale));
  var nameScale = printClamp_(maxNameEm ? (seatW - 3) / (maxNameEm * 8) : scale, 1, Math.max(1, scale));
  var rowH = [];
  for (var rr = 1; rr <= rows; rr++) rowH.push(PRINT_MIN_ROW_PT * scale + extraRows[rr]);
  var totalH = 0;
  rowH.forEach(function (h) { totalH += h; });

  var warnings = [];
  var fits = totalH <= gridH + 0.5;
  if (!fits) warnings.push('행이 너무 많아 한 장에 들어가지 않습니다(' + rows + '행).');
  if (fits && scale < 1) warnings.push('칸 높이를 줄여 빠듯합니다(줄바꿈이 많음).');
  var narrow = seatCols > 0 && markW < PRINT_MIN_MARK_CELL_PT;
  if (narrow) warnings.push('블록 칸이 너무 좁습니다(' + printNum_(markW) + 'pt).');
  return {
    from: from, to: to, kinds: kinds, colW: colW, seatW: seatW, markW: markW, scale: scale,
    fontScale: fontScale, nameScale: nameScale, rowH: rowH, extraRows: extraRows, fits: fits, narrow: narrow, seatCols: seatCols, warnings: warnings
  };
}

/** 좁은 쪽은 통로 열(없으면 가운데)에서 좌우로 나눈다. 최대 4쪽까지. → [{from,to}] */
function printPartitions_(space, model, from, to, depth) {
  var plan = printPlanPage_(space, model, from, to, false);
  if (!plan.narrow || plan.seatCols < 4 || (depth || 0) >= 2) return [{ from: from, to: to }];
  var mid = Math.floor((from + to) / 2);
  var best = -1;
  var c;
  for (c = from + 1; c < to; c++) {
    if (plan.kinds[c] !== 'seat' && (best < 0 || Math.abs(c - mid) < Math.abs(best - mid))) best = c;
  }
  var left = best >= 0 ? best : mid;           // 통로 열은 왼쪽 쪽에 붙인다
  return printPartitions_(space, model, from, left, (depth || 0) + 1)
    .concat(printPartitions_(space, model, left + 1, to, (depth || 0) + 1));
}

/** 쪽 목록: 공간 순서대로, 좁으면 나눠서 [{space, from, to, part, parts, first}] */
function printPages_(model, opts) {
  var pages = [];
  (model.spaces || []).forEach(function (space) {
    var parts = printPartitions_(space, model, 1, space.cols, 0);
    parts.forEach(function (p, i) {
      pages.push({ space: space, from: p.from, to: p.to, part: i + 1, parts: parts.length });
    });
  });
  var hasUnseated = !!(model.unseated && model.unseated.length);
  pages.forEach(function (pg, i) {
    pg.foot = hasUnseated && i === 0;
    pg.plan = printPlanPage_(pg.space, model, pg.from, pg.to, pg.foot);
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
      seatCols: p.seatCols, seatW: p.seatW, markW: p.markW, scale: p.scale,
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
  var td = 'padding:0;vertical-align:bottom;';
  return '<table style="width:100%;border-collapse:collapse;table-layout:auto;height:' + PRINT_HEAD_PT + 'pt">' +
    '<tr><td style="' + td + 'font-size:13pt;font-weight:bold;line-height:16pt;white-space:nowrap">' + title + ' · ' +
    printEsc_(printDateKo_(model.date, model.weekdayKo)) + ' · ' + spaceName + '</td>' +
    '<td style="' + td + 'font-size:11pt;line-height:16pt;text-align:right;white-space:nowrap">근무: ' + duty + '</td></tr>' +
    '<tr><td colspan="2" style="' + td + 'font-size:8pt;line-height:11pt"><b>칸(위→아래 순서)</b>&nbsp;' + blocks +
    '&nbsp;&nbsp;|&nbsp;&nbsp;' + legend + '</td></tr></table>';
}

function printSeatHtml_(cell, plan, model, opts, rowHeightPt) {
  var n = model.blocks.length;
  var s = plan.scale;
  var nameH = PRINT_NAME_PT * s, markH = PRINT_MARK_PT * s, reasonH = PRINT_REASON_PT * s;
  var vacantLabel = (opts && opts.vacantLabel) || '공석';
  var name = cell.occupant ? cell.occupant.display : vacantLabel;
  var vacant = !cell.occupant;
  var out = [];
  out.push('<table style="width:100%;height:' + printNum_(rowHeightPt - PRINT_BORDER_PT) + 'pt;border-collapse:collapse;table-layout:fixed">');
  out.push('<tr><td colspan="' + n + '" style="height:' + printNum_(nameH) + 'pt;padding:0 1.5pt;overflow:hidden;white-space:nowrap;' +
    'font-size:' + printNum_(8 * plan.nameScale) + 'pt;line-height:' + printNum_(nameH) + 'pt;font-weight:bold;' +
    (vacant ? 'color:#666;font-weight:normal;' : '') + '">' + printEsc_(name) + '</td></tr>');
  out.push('<tr>');
  var marks = cell.marks || [];
  for (var i = 0; i < n; i++) {
    var m = marks[i] || { text: '', code: 'NONE' };
    var filled = m.text !== '';
    out.push('<td style="height:' + printNum_(rowHeightPt - nameH - reasonH) + 'pt;padding:0;overflow:hidden;text-align:center;vertical-align:middle;' +
      'border-top:0.5pt solid #555;' + (i > 0 ? 'border-left:0.5pt solid #555;' : '') +
      'font-size:' + printNum_(7 * plan.fontScale) + 'pt;line-height:' + printNum_(PRINT_MARK_PT * plan.fontScale) + 'pt;' +
      (filled ? 'background:#e2e2e2;' + (m.code === 'EXC' ? 'font-weight:bold;' : '') : '') + '">' + printEsc_(m.text) + '</td>');
  }
  out.push('</tr>');
  out.push('<tr><td colspan="' + n + '" style="height:' + printNum_(reasonH - PRINT_BORDER_PT) + 'pt;padding:0;border-top:0.5pt dotted #777"></td></tr>');
  out.push('</table>');
  return out.join('');
}

function printFixedHtml_(cell, rowHeightPt) {
  var label = cell.kind === 'pillar' ? '기둥' : (cell.kind === 'door' ? '비상문' : (cell.kind === 'window' ? '창문' : ''));
  var style = 'height:' + printNum_(rowHeightPt) + 'pt;padding:0;text-align:center;vertical-align:middle;overflow:hidden;font-size:7pt;line-height:8pt;';
  if (cell.kind === 'pillar') {
    // 회색 빗금(변환기가 gradient를 못 그려도 회색 바탕 + "기둥" 글자로 구분된다)
    style += 'background-color:#b5b5b5;background-image:repeating-linear-gradient(45deg,#8a8a8a 0,#8a8a8a 1pt,#b5b5b5 1pt,#b5b5b5 4pt);border:0.5pt solid #555;';
  } else {
    style += 'border:0.5pt dashed #555;';
  }
  return '<td style="' + style + '">' + label + '</td>';
}

function printGridHtml_(pg, model, opts) {
  var space = pg.space, plan = pg.plan;
  var byPos = {};
  (space.cells || []).forEach(function (c) { byPos[c.row + ',' + c.col] = c; });
  var totalW = 0;
  plan.colW.forEach(function (w) { totalW += w; });
  var out = [];
  out.push('<table style="width:' + printNum_(totalW) + 'pt;border-collapse:collapse;table-layout:fixed;margin:0 auto">');
  out.push('<colgroup>' + plan.colW.map(function (w) { return '<col style="width:' + printNum_(w) + 'pt">'; }).join('') + '</colgroup>');
  for (var r = 1; r <= space.rows; r++) {
    var h = plan.rowH[r - 1];
    out.push('<tr style="height:' + printNum_(h) + 'pt">');
    for (var c = pg.from; c <= pg.to; c++) {
      var cell = byPos[r + ',' + c];
      if (!cell) { out.push('<td style="padding:0;border:0"></td>'); continue; }
      if (cell.kind !== 'seat') { out.push(printFixedHtml_(cell, h)); continue; }
      out.push('<td style="padding:0;border:0.8pt solid #222;vertical-align:top;overflow:hidden;' +
        (!cell.occupant ? 'background:#f4f4f4;' : '') + '">' + printSeatHtml_(cell, plan, model, opts, h) + '</td>');
    }
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
