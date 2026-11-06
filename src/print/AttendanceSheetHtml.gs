/**
 * 출석부 HTML 렌더러(D4.1 재설계: 1층 + SA1~6실을 A4 가로 한 장에). 소유: DESIGN. 순수 함수 — Apps Script 서비스·현재 시각을 쓰지 않는다.
 *
 *   printRenderSheet_(model, opts) → HTML 문서 문자열. 쪽 1 = 출석부 한 장(모든 공간), 쪽 2 = 특이사항 목록이 1쪽에 다 안 들어갈 때만(뒷면).
 *   printSheetPlan_(model, opts)   → 배치 진단(줄 너비·칸 크기·SA 열 수·목록 칸 수·넘침 여부, 테스트·C7용).
 *
 * model 모양은 docs/contracts/sheet-model.md. 렌더러는 marks[].text를 바꾸지 않고 이스케이프만 한다.
 * 선택 필드(없어도 된다): model.standbyNames(예비 감독 이름). 출석부에는 학년·이름만 싣는다(OUT 표시 없음, 결정 36).
 * PDF 변환기(Utilities 서비스의 Blob 변환)가 이해하도록 표(table) 기반·인라인 CSS만 쓴다(flex·grid·웹폰트·외부 리소스 없음).
 * 흑백 인쇄로도 구분되게 색 대신 회색 바탕·굵기·글자로 나타낸다.
 *
 * 배치(docs/design/print-layout.md): 왼쪽에 1층(세로 줄 그대로), 오른쪽에 SA실(3열 또는 2열 자동) + 오늘 특이사항 목록 + 메모 칸.
 * 좌석 하나 = 이름 칸(위) + 표시 칸 n개(아래). 줄 너비 = 표시 칸 n개의 너비라 일요일 4칸도 한 장에 들어간다.
 * 손으로 ○ × △ 조를 쓰는 칸은 너비 4.5mm(12.8pt) 이상·높이 5mm 안팎. 글자는 이름 8pt·표시 칸 7pt 이상.
 * 전역 이름은 모두 print 접두어.
 */

var PRINT_PAGE_W_PT = 796;       // A4 가로 281mm(여백 8mm씩 뺀 폭)
var PRINT_PAGE_H_PT = 544;       // 같은 방식 192mm(194mm에서 여유 2mm: 넘침으로 빈 쪽이 생기는 것을 막는다)
var PRINT_HEAD_PT = 30;          // 머리말 높이(두 줄)
var PRINT_FOOT_PT = 11;          // 아래 줄(배정 안 된 학생) 높이
var PRINT_TITLE_PT = 10;         // 공간 이름 줄 높이
var PRINT_LINEHEAD_PT = 9;       // 줄 머리(공석 수/좌석 수) 높이
var PRINT_GAP_PT = 3;            // 통로(빈) 열 너비
var PRINT_FIXED_COL_PT = 24;     // 기둥·비상문·창문만 있는 열 너비
var PRINT_SEP_PT = 8;            // 1층과 오른쪽 영역 사이
var PRINT_ROOMGAP_PT = 5;        // SA실 사이(가로)
var PRINT_ROOMVGAP_PT = 4;       // SA실 사이(세로)
var PRINT_NAME_PT = 8.5;         // 이름 칸 높이(8pt 글자)
var PRINT_MARK_LINE_PT = 7;      // 표시 칸 글자 줄 높이(7pt 글자)
var PRINT_MIN_PITCH_PT = 23;     // 좌석 한 줄(이름 + 표시 칸) 최소 높이 ≈ 8.1mm
var PRINT_MAX_PITCH_PT = 30;
var PRINT_MARK_MIN_W_PT = 14.5;  // 표시 칸 너비 목표: 7pt 글자 두 개("병결")가 한 줄에 들어간다. 하한은 12.8pt(4.5mm)
var PRINT_HAND_MIN_W_PT = 12.8;  // 손글씨 칸 최소 너비 4.5mm
var PRINT_MAX_LINE_PT = 96;      // 줄 최대 너비(공간이 하나뿐일 때)
var PRINT_ROW_SLACK_PT = 0.8;    // 좌석 한 줄(tr 두 개)에 테두리가 더하는 높이 여유
var PRINT_SLACK_PT = 4;          // 그 밖의 여유
var PRINT_LIST_LINE_PT = 8.5;    // 특이사항 목록 줄 높이(7pt 글자)
var PRINT_MEMO_PT = 30;          // 메모 칸 높이
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

function printNameText_(cell, vacantLabel) {
  return cell.occupant ? cell.occupant.display : vacantLabel;
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

/** 오늘 특이사항(EXC) 학생 목록: [{display, seqs, text}] 학년→이름 순 */
function printEntries_(model) {
  var out = [];
  (model.spaces || []).forEach(function (sp) {
    printSeatCells_(sp).forEach(function (cell) {
      if (!cell.occupant) return;
      var seqs = [];
      var texts = [];
      (cell.marks || []).forEach(function (m, i) {
        if (m.code === 'EXC') {
          seqs.push(i + 1);
          if (texts.indexOf(m.text) < 0) texts.push(m.text);
        }
      });
      if (seqs.length) out.push({ display: cell.occupant.display, grade: cell.occupant.grade, name: cell.occupant.name, seqs: seqs, text: texts.join('/') });
    });
  });
  out.sort(function (a, b) {
    if (a.grade !== b.grade) return a.grade - b.grade;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return out;
}

function printEntryText_(e) {
  return e.display + ' ' + e.seqs.map(printCircled_).join('') + ' ' + e.text;
}

/** 인원 요약: 재적(자리 있는 학생)·공석·특이사항 학생 수·학·가 학생 수 */
function printSummary_(model) {
  var s = { enrolled: 0, vacant: 0, special: 0, hak: 0, ga: 0 };
  (model.spaces || []).forEach(function (sp) {
    printSeatCells_(sp).forEach(function (cell) {
      if (!cell.occupant) { s.vacant++; return; }
      s.enrolled++;
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
  return s;
}

/**
 * 한 공간(블록)의 행 계획: 표시 칸 글자가 줄바꿈으로 칸을 넘치면 그 행만 높인다.
 * @return {{cellLines:Object, extraRows:number[], sumExtra:number}}
 */
function printBlockWraps_(space, markW, markH) {
  var avail = Math.max(1, markW - 0.4);
  var cap = Math.max(1, Math.floor((markH + 0.1) / PRINT_MARK_LINE_PT));
  var cache = {};
  var extra = [];
  var r;
  for (r = 0; r <= space.rows; r++) extra.push(0);
  printSeatCells_(space).forEach(function (cell) {
    var maxLines = 1;
    (cell.marks || []).forEach(function (m) {
      if (!m.text) return;
      if (cache[m.text] === undefined) cache[m.text] = printWrapLines_(m.text, 7, avail);
      if (cache[m.text] > maxLines) maxLines = cache[m.text];
    });
    var e = Math.max(0, maxLines - cap) * PRINT_MARK_LINE_PT;
    if (e > extra[cell.row]) extra[cell.row] = e;
  });
  var sum = 0;
  for (r = 1; r <= space.rows; r++) sum += extra[r];
  return { extraRows: extra, sumExtra: sum, cap: cap };
}

/**
 * 배치 계획. SA실 열 수(3 → 2 → 1)는 표시 칸이 목표 너비(14.5pt)를 넘기는 가장 큰 값으로 정한다
 * (3열이면 목록 칸이 넓고, 일요일 4칸처럼 칸이 좁으면 2열로 줄여 칸을 넓힌다).
 */
function printLayout_(model, opts) {
  var n = model.blocks.length;
  var spaces = model.spaces || [];
  var main = spaces[0];
  var rooms = spaces.slice(1);
  var vacantLabel = (opts && opts.vacantLabel) || '공석';
  var warnings = [];
  var mainCols = printColumns_(main);
  var roomCols = rooms.map(printColumns_);
  var maxNameEm = printTextEm_(vacantLabel);
  spaces.forEach(function (sp) {
    printSeatCells_(sp).forEach(function (cell) {
      maxNameEm = Math.max(maxNameEm, printTextEm_(printNameText_(cell, vacantLabel)));
    });
  });
  var minL = Math.max(Math.ceil(maxNameEm * 8 + 3), Math.ceil(n * PRINT_MARK_MIN_W_PT));
  var mainLines = printSeatLineCount_(mainCols);
  var mainOther = printBlockWidth_(mainCols, 0);
  var roomLines = 0, roomOther = 0, roomRows = 0;
  roomCols.forEach(function (cols, i) {
    roomLines = Math.max(roomLines, printSeatLineCount_(cols));
    roomOther = Math.max(roomOther, printBlockWidth_(cols, 0));
    roomRows = Math.max(roomRows, rooms[i].rows);
  });
  var bodyH = PRINT_PAGE_H_PT - PRINT_HEAD_PT - PRINT_FOOT_PT - PRINT_SLACK_PT;

  function tryC(c) {
    var width = PRINT_PAGE_W_PT - 2 - mainOther - (c ? PRINT_SEP_PT + c * roomOther + (c - 1) * PRINT_ROOMGAP_PT : 0);
    var lines = mainLines + c * roomLines;
    var L = Math.min(PRINT_MAX_LINE_PT, Math.floor(width / lines * 10) / 10);
    var markW = L / n;
    var mainRows = main.rows;
    // 이름 칸 높이는 고정, 표시 칸 높이는 남는 높이에서 정한다(줄바꿈이 많으면 그 행만 높인다)
    var markH = 14;
    var wraps = printBlockWraps_(main, markW, markH);
    var pitch = (bodyH - PRINT_TITLE_PT - PRINT_LINEHEAD_PT - wraps.sumExtra) / mainRows - PRINT_ROW_SLACK_PT;
    pitch = printClamp_(pitch, 0, PRINT_MAX_PITCH_PT);
    var fits = pitch >= PRINT_MIN_PITCH_PT - 0.5;
    markH = pitch - PRINT_NAME_PT;
    wraps = printBlockWraps_(main, markW, markH);   // 높이가 정해진 뒤 다시(칸 수 cap이 바뀔 수 있다)
    pitch = printClamp_((bodyH - PRINT_TITLE_PT - PRINT_LINEHEAD_PT - wraps.sumExtra) / mainRows - PRINT_ROW_SLACK_PT, 0, PRINT_MAX_PITCH_PT);
    fits = pitch >= PRINT_MIN_PITCH_PT - 0.5;
    var R = c ? Math.ceil(rooms.length / c) : 0;
    var roomBlockH = PRINT_TITLE_PT + PRINT_LINEHEAD_PT + roomRows * (pitch + PRINT_ROW_SLACK_PT);
    var roomsH = R ? R * roomBlockH + (R - 1) * PRINT_ROOMVGAP_PT : 0;
    var listH = c ? bodyH - roomsH - PRINT_ROOMVGAP_PT : 0;
    var roomsFit = !c || roomsH <= bodyH - 40;
    return { c: c, L: L, markW: markW, pitch: pitch, nameH: PRINT_NAME_PT, markH: pitch - PRINT_NAME_PT, wraps: wraps,
      fits: fits && roomsFit, R: R, roomsH: roomsH, listH: listH, roomBlockH: roomBlockH, mainRows: mainRows, minOk: L >= minL, roomsFit: roomsFit };
  }

  var chosen = null;
  var tries = [];
  var cMax = rooms.length ? Math.min(3, rooms.length) : 0;
  var c;
  for (c = cMax; c >= (rooms.length ? 1 : 0); c--) {
    var t = tryC(c);
    tries.push(t);
    if (!chosen && t.minOk && t.fits) chosen = t;
    if (!rooms.length) break;
  }
  if (!chosen) {
    // 어느 것도 목표를 못 맞춘다: 표시 칸이 가장 넓은 것을 고르고 경고한다
    chosen = tries.slice().sort(function (a, b) { return b.markW - a.markW; })[0];
    if (!chosen.minOk) warnings.push('표시 칸이 목표(' + PRINT_MARK_MIN_W_PT + 'pt)보다 좁습니다(' + printNum_(chosen.markW) + 'pt).');
    if (!chosen.fits) warnings.push('한 장에 들어가지 않습니다(행이 너무 많거나 SA실이 너무 큼).');
  }
  var nameFont = printClamp_((chosen.L - 3) / maxNameEm, 8, 9);
  var entries = printEntries_(model);
  var listCols = 2;
  var memoH = chosen.listH >= 80 ? PRINT_MEMO_PT : 0;
  var capacity = chosen.c ? Math.max(0, Math.floor((chosen.listH - 11 - memoH - 3) / PRINT_LIST_LINE_PT)) * listCols : 0;
  var overflow = entries.length > capacity;
  var listPage = (opts && opts.listPage) || 'auto';
  var needPage2 = listPage === 'always' || (listPage !== 'never' && overflow);
  if (chosen.pitch < PRINT_MIN_PITCH_PT) warnings.push('칸 높이가 기준(' + PRINT_MIN_PITCH_PT + 'pt)보다 낮습니다(' + printNum_(chosen.pitch) + 'pt).');
  return {
    n: n, main: main, rooms: rooms, mainCols: mainCols, roomCols: roomCols, c: chosen.c, R: chosen.R, L: chosen.L,
    markW: chosen.markW, pitch: chosen.pitch, nameH: chosen.nameH, markH: chosen.markH, nameFont: nameFont,
    wraps: chosen.wraps, listH: chosen.listH, roomsH: chosen.roomsH, roomBlockH: chosen.roomBlockH, memoH: memoH,
    capacity: capacity, entries: entries, overflow: overflow, needPage2: needPage2, fits: chosen.fits, warnings: warnings,
    minL: minL, bodyH: bodyH, vacantLabel: vacantLabel, summary: printSummary_(model), mainLines: mainLines
  };
}

/** 진단용: 배치 요약 */
function printSheetPlan_(model, opts) {
  if (!model.operating) return null;
  var p = printLayout_(model, opts);
  return {
    pages: p.needPage2 ? 2 : 1, roomColumns: p.c, roomRows: p.R, lineW: p.L, markW: p.markW, markWmm: p.markW / 72 * 25.4,
    pitch: p.pitch, pitchMm: p.pitch / 72 * 25.4, markHmm: p.markH / 72 * 25.4, nameFontPt: p.nameFont, markFontPt: 7,
    listCapacity: p.capacity, listCount: p.entries.length, listOverflow: p.overflow, listHeight: p.listH,
    fits: p.fits, warnings: p.warnings, summary: p.summary
  };
}

/* ───────────── HTML 조립 ───────────── */

function printDutyText_(model) {
  if (model.dutyNames && model.dutyNames.length) return printEsc_(model.dutyNames.join(', '));
  return model.dayType === 'mon_thu' ? '________ ________' : '________';
}

function printHeadHtml_(model, lay) {
  var title = printEsc_(model.title || '신한학사 출석부');
  var first = model.blocks[0], last = model.blocks[model.blocks.length - 1];
  var standby = model.standbyNames && model.standbyNames.length ? printEsc_(model.standbyNames.join(', ')) : '________';
  var blocks = model.blocks.map(function (b) { return printCircled_(b.seq) + printEsc_(b.label); }).join('&nbsp;&nbsp;');
  var legend = (model.legend || []).map(function (l) {
    return '<b>' + printEsc_(l.mark) + '</b>&nbsp;' + printEsc_(l.text);
  }).join('&nbsp;·&nbsp;');
  var s = lay.summary;
  var td = 'padding:0;vertical-align:bottom;white-space:nowrap;';
  return '<table style="width:100%;border-collapse:collapse;table-layout:auto;height:' + PRINT_HEAD_PT + 'pt">' +
    '<tr><td style="' + td + 'font-size:15pt;font-weight:bold;line-height:18pt">' + title +
    '&nbsp;&nbsp;<span style="font-size:12pt">' + printEsc_(printDateKo_(model.date, model.weekdayKo)) + '</span>' +
    '&nbsp;&nbsp;<span style="font-size:10pt;font-weight:normal">자습 ' + printEsc_(first.start) + '–' + printEsc_(last.end) + '</span></td>' +
    '<td style="' + td + 'text-align:right;font-size:10pt;line-height:18pt">근무 ' + printDutyText_(model) + '&nbsp;&nbsp;예비 ' + standby + '</td></tr>' +
    '<tr><td colspan="2" style="' + td + 'font-size:7pt;line-height:11pt"><b>재적 ' + s.enrolled + '</b>&nbsp;·&nbsp;공석 ' + s.vacant +
    '&nbsp;·&nbsp;특이사항 ' + s.special + '명&nbsp;·&nbsp;학 ' + s.hak + '&nbsp;·&nbsp;가 ' + s.ga +
    '&nbsp;&nbsp;|&nbsp;&nbsp;<b>표시 칸(왼쪽→오른쪽)</b>&nbsp;' + blocks + '&nbsp;&nbsp;|&nbsp;&nbsp;' + legend + '</td></tr></table>';
}

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
 * 한 공간 표: 제목 줄 · 줄 머리(공석 수/좌석 수) · 좌석마다 두 줄(이름 칸 / 표시 칸 n개).
 * 이름 칸이 위, 표시 칸이 아래라서 줄 너비 = 표시 칸 n개 너비다.
 */
function printBlockHtml_(space, lay, model) {
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
  var wraps = printBlockWraps_(space, markW, lay.markH);
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
  out.push('<tr style="height:' + PRINT_TITLE_PT + 'pt"><td class="t" colspan="' + total + '" style="padding:0;font-size:8pt;font-weight:bold;line-height:' + PRINT_TITLE_PT + 'pt;white-space:nowrap">' +
    printEsc_(space.name) + (space.gender && space.gender !== '혼성' ? ' · ' + printEsc_(space.gender) : '') + ' · ' + printSeatCells_(space).length + '석</td></tr>');
  out.push('<tr style="height:' + PRINT_LINEHEAD_PT + 'pt">');
  cols.forEach(function (c) {
    if (c.role === 'seat') {
      var k = count[c.col] || { seats: 0, vacant: 0 };
      out.push('<td class="h" colspan="' + n + '" style="padding:0;text-align:center;vertical-align:bottom;font-size:7pt;font-weight:bold;line-height:' + PRINT_LINEHEAD_PT + 'pt">' + k.vacant + '/' + k.seats + '</td>');
    } else {
      out.push('<td style="padding:0;border:0"></td>');
    }
  });
  out.push('</tr>');
  var nameFont = lay.nameFont;
  for (var r = 1; r <= space.rows; r++) {
    var extra = wraps.extraRows[r];
    var markH = lay.markH + extra;
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
      var shade = vacant ? 'background:#f2f2f2;' : '';
      rows1.push('<td class="n" colspan="' + n + '" style="padding:0 1pt;overflow:hidden;white-space:nowrap;vertical-align:middle;border:0.8pt solid #222;border-bottom:0.5pt solid #555;' +
        'font-size:' + printNum_(nameFont) + 'pt;line-height:' + lay.nameH + 'pt;' + (vacant ? 'color:#666;' + shade : 'font-weight:bold;') + '">' + printEsc_(printNameText_(cell, lay.vacantLabel)) + '</td>');
      for (var i = 0; i < n; i++) {
        var m = (cell.marks || [])[i] || { text: '', code: 'NONE' };
        var filled = m.text !== '';
        rows2.push('<td class="m" style="padding:0;overflow:hidden;text-align:center;vertical-align:top;word-break:break-all;border:0.5pt solid #555;' +
          'font-size:7pt;line-height:' + PRINT_MARK_LINE_PT + 'pt;' + (filled ? 'background:#e2e2e2;' + (m.code === 'EXC' ? 'font-weight:bold;' : '') : shade) + '">' + printEsc_(m.text) + '</td>');
      }
    });
    out.push('<tr style="height:' + lay.nameH + 'pt">' + rows1.join('') + '</tr>');
    out.push('<tr style="height:' + printNum_(markH) + 'pt">' + rows2.join('') + '</tr>');
  }
  out.push('</table>');
  return { html: out.join(''), width: totalW };
}

function printListHtml_(lay, width) {
  var entries = lay.entries;
  var shown = lay.overflow ? entries.slice(0, lay.capacity) : entries;
  var half = Math.ceil(shown.length / 2);
  var colA = shown.slice(0, half), colB = shown.slice(half);
  var li = function (arr) {
    return arr.map(function (e) {
      return '<div style="font-size:7pt;line-height:' + PRINT_LIST_LINE_PT + 'pt;white-space:nowrap;overflow:hidden">' + printEsc_(printEntryText_(e)) + '</div>';
    }).join('');
  };
  var note = lay.overflow ? (lay.needPage2 ? '&nbsp;(나머지는 뒷면)' : '&nbsp;(자리가 모자라 일부만)') : '';
  var out = '<div style="width:' + printNum_(width) + 'pt;height:' + printNum_(lay.listH) + 'pt;overflow:hidden">' +
    '<div style="font-size:8pt;font-weight:bold;line-height:11pt;border-bottom:0.5pt solid #555">오늘 특이사항 ' + entries.length + '명' + note + '</div>' +
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr><td style="padding:0;vertical-align:top">' + (shown.length ? li(colA) : '<div style="font-size:7pt;line-height:' + PRINT_LIST_LINE_PT + 'pt">없음</div>') +
    '</td><td style="padding:0 0 0 4pt;vertical-align:top">' + li(colB) + '</td></tr></table>';
  if (lay.memoH) {
    out += '<div style="margin-top:2pt;height:' + (lay.memoH - 2) + 'pt;border:0.5pt solid #555;font-size:7pt;line-height:8pt">&nbsp;무단·기타 메모</div>';
  }
  return out + '</div>';
}

function printPageHtml_(model, opts, lay, isLast) {
  var main = printBlockHtml_(lay.main, lay, model);
  var right = '';
  var rightW = 0;
  if (lay.rooms.length) {
    var roomBlocks = lay.rooms.map(function (sp) { return printBlockHtml_(sp, lay, model); });
    var roomW = 0;
    roomBlocks.forEach(function (b) { roomW = Math.max(roomW, b.width); });
    var rowsHtml = [];
    for (var r = 0; r < lay.R; r++) {
      var tds = [];
      for (var k = 0; k < lay.c; k++) {
        var idx = r * lay.c + k;
        tds.push('<td style="padding:0;vertical-align:top;width:' + printNum_(roomW) + 'pt">' + (roomBlocks[idx] ? roomBlocks[idx].html : '') + '</td>');
        if (k < lay.c - 1) tds.push('<td style="padding:0;width:' + PRINT_ROOMGAP_PT + 'pt"></td>');
      }
      rowsHtml.push('<tr>' + tds.join('') + '</tr>');
      if (r < lay.R - 1) rowsHtml.push('<tr><td colspan="' + (lay.c * 2 - 1) + '" style="padding:0;height:' + PRINT_ROOMVGAP_PT + 'pt"></td></tr>');
    }
    rightW = lay.c * roomW + (lay.c - 1) * PRINT_ROOMGAP_PT;
    right = '<table style="width:' + printNum_(rightW) + 'pt;border-collapse:collapse;table-layout:fixed">' + rowsHtml.join('') + '</table>' +
      '<div style="height:' + PRINT_ROOMVGAP_PT + 'pt"></div>' + printListHtml_(lay, rightW);
  }
  var foot = '';
  if (model.unseated && model.unseated.length) {
    foot = '<div style="height:' + PRINT_FOOT_PT + 'pt;font-size:7pt;line-height:' + PRINT_FOOT_PT + 'pt;overflow:hidden;white-space:nowrap">' +
      '<b>자리 배정 안 됨</b>&nbsp;' + model.unseated.map(function (u) { return printEsc_(u.display); }).join(', ') + '</div>';
  }
  var body = '<table style="border-collapse:collapse;table-layout:fixed;width:' + PRINT_PAGE_W_PT + 'pt"><tr>' +
    '<td style="padding:0;vertical-align:top;width:' + printNum_(main.width) + 'pt">' + main.html + '</td>' +
    (right ? '<td style="padding:0;width:' + PRINT_SEP_PT + 'pt"></td><td style="padding:0;vertical-align:top">' + right + '</td>' : '<td></td>') +
    '</tr></table>';
  return '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt;overflow:hidden;' +
    'page-break-after:' + (isLast ? 'auto' : 'always') + '">' + printHeadHtml_(model, lay) + body + foot + '</section>';
}

/** 뒷면: 오늘 특이사항 전체 목록 + 무단·기타 메모 줄 */
function printListPageHtml_(model, lay) {
  var entries = lay.entries;
  var colsN = 3;
  var per = Math.max(1, Math.ceil(entries.length / colsN));
  var tds = [];
  for (var k = 0; k < colsN; k++) {
    var part = entries.slice(k * per, (k + 1) * per);
    tds.push('<td style="padding:0 6pt 0 0;vertical-align:top;width:33%">' + part.map(function (e) {
      return '<div style="font-size:9pt;line-height:13pt;white-space:nowrap;border-bottom:0.3pt dotted #999">' + printEsc_(printEntryText_(e)) + '</div>';
    }).join('') + '</td>');
  }
  var memo = '';
  for (var i = 0; i < 8; i++) memo += '<div style="height:16pt;border-bottom:0.5pt solid #777"></div>';
  return '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;height:' + PRINT_PAGE_H_PT + 'pt;overflow:hidden;page-break-after:auto">' +
    '<div style="font-size:14pt;font-weight:bold;line-height:20pt">' + printEsc_(model.title || '신한학사 출석부') + ' · ' +
    printEsc_(printDateKo_(model.date, model.weekdayKo)) + ' · 오늘 특이사항 ' + entries.length + '명 (뒷면)</div>' +
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>' + tds.join('') + '</tr></table>' +
    '<div style="margin-top:10pt;font-size:10pt;font-weight:bold;line-height:16pt">무단·기타 메모</div>' + memo + '</section>';
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
  if (!model.spaces || !model.spaces.length) throw new Error('공간이 없어 출석부를 그릴 수 없습니다.');
  var lay = printLayout_(model, opts);
  var html = printPageHtml_(model, opts, lay, !lay.needPage2);
  if (lay.needPage2) html += printListPageHtml_(model, lay);
  return head + html + '</body></html>';
}
