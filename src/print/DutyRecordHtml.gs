/**
 * 월말 근무 기록표 HTML 렌더러(D7, 임시 양식 — 학교 양식을 받으면 엑셀로 대체). 소유: DESIGN. 순수 함수.
 *
 *   printRenderDutyRecord_(model, opts) → HTML 문서 문자열(A4 가로, 보통 한 쪽). 모양: 교사 × 날짜 칸(21:30·23:00·단독·예),
 *                                         교사별 근무 합계(크게)·조별 횟수(작게)·예비 지정, 합계 줄, 교대 목록(여러 단), 만든 시각·마지막 변경 시각(머리말 줄).
 *   printDutyRecordCounts_(model)      → 칸에서 센 교사별 합계(렌더러와 테스트가 같은 숫자를 쓴다).
 *
 * model 모양은 docs/design/duty-record-model.md. 합계는 모델이 주는 값이 아니라 **칸에서 센다**(칸 = 합계가 늘 맞는다).
 * 칸 = teachers[].cells[날짜] 코드 배열('21:30조'·'23:00조'·'단독', R8이 저장한 그대로, 끝의 '조'는 뗀다) + teachers[].standby 날짜 배열('예').
 * 근무 = 코드 하나당 1회(같은 날 두 조를 맡으면 2회). 예비 지정은 따로 센다(결정 46): 대신 근무한 날은 R8이 근무로 주고 standby에서 뺀다.
 * 21:30조·23:00조 수당은 같다(결정 47): 근무 합계가 주 숫자이고 조별 횟수는 작은 참고 글자다.
 * 글자가 사라지지 않게 칸을 자르지 않는다(overflow:hidden 없음). 흑백 인쇄: 회색 농도·굵기·글자로 구분한다.
 * // shortcut: 31일 달의 날짜 칸 글자는 6pt대로 print-layout 7pt 기준보다 작다(기록표는 책상에서 읽는 표) — 인쇄해 읽기 어려우면 날짜 칸 폭을 늘린다.
 * 날짜 요일·월 일수는 rules의 ymdWeekdayKo_·ymdDaysInMonth_를 쓴다. 전역 이름은 print 접두어.
 */

var PRINT_DR_SHIFTS = ['21:30', '23:00', '단독'];   // 근무로 세는 코드(끝의 '조' 뗀 값)

/** '2027-03' → {y, m, n(일수)} */
function printDutyMonth_(month) {
  var mm = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!mm || Number(mm[2]) < 1 || Number(mm[2]) > 12) throw new Error('근무 기록표 월 형식이 아닙니다(yyyy-MM): ' + month);
  return { y: Number(mm[1]), m: Number(mm[2]), n: ymdDaysInMonth_(Number(mm[1]), Number(mm[2])) };
}

function printDutyDate_(mo, d) {
  return mo.y + '-' + (mo.m < 10 ? '0' : '') + mo.m + '-' + (d < 10 ? '0' : '') + d;
}

/** 칸 값 하나 → '21:30'·'23:00'·'단독'(앞뒤 공백·'*'·끝의 '조' 뗌, '단' = 단독)·null(알 수 없음). 빈 값은 '' */
function printDutyCode_(v) {
  var t = String(v === null || v === undefined ? '' : v).replace(/[*\s]/g, '').replace(/조$/, '');
  if (t === '') return '';
  if (t === '단') t = '단독';
  return PRINT_DR_SHIFTS.indexOf(t) >= 0 ? t : null;
}

/** 칸 하나의 값(배열 또는 하나) → 코드 배열(빈 값 제외, 알 수 없는 값은 null로 남긴다) */
function printDutyCodes_(v) {
  var list = Array.isArray(v) ? v : (v === null || v === undefined ? [] : [v]);
  var out = [];
  list.forEach(function (x) { var c = printDutyCode_(x); if (c !== '') out.push(c); });
  return out;
}

/**
 * 교사별 합계를 칸에서 센다. 이 달 밖 날짜·알 수 없는 값은 세지 않고 unknown에 센다.
 * → {rows:[{name, work, s2130, s2300, solo, standby}], total:{…}, byDay:{날짜:n}, unknown:n, closedWork:[{date, names:[]}]}
 */
function printDutyRecordCounts_(model) {
  var mo = printDutyMonth_(model && model.month);
  var days = {};
  for (var d = 1; d <= mo.n; d++) days[printDutyDate_(mo, d)] = true;
  var closed = {};
  printArr_(model.closedDates).forEach(function (x) { closed[x] = true; });
  var total = { work: 0, s2130: 0, s2300: 0, solo: 0, standby: 0 };
  var byDay = {};
  var unknown = 0;
  var closedNames = {};
  var rows = (model.teachers || []).map(function (t) {
    var r = { name: String(t && t.name !== undefined ? t.name : ''), work: 0, s2130: 0, s2300: 0, solo: 0, standby: 0 };
    var cells = (t && t.cells) || {};
    Object.keys(cells).forEach(function (date) {
      printDutyCodes_(cells[date]).forEach(function (code) {
        if (code === null || !days[date]) { unknown++; return; }
        r.work++; total.work++;
        if (code === '21:30') { r.s2130++; total.s2130++; } else if (code === '23:00') { r.s2300++; total.s2300++; } else { r.solo++; total.solo++; }
        byDay[date] = (byDay[date] || 0) + 1;
        if (closed[date]) { var list = (closedNames[date] = closedNames[date] || []); if (list.indexOf(r.name) < 0) list.push(r.name); }
      });
    });
    var seen = {};
    printArr_(t && t.standby).forEach(function (date) {
      if (!days[date]) { unknown++; return; }
      if (seen[date]) return;
      seen[date] = true;
      r.standby++; total.standby++;
    });
    return r;
  });
  var closedWork = Object.keys(closedNames).sort().map(function (date) { return { date: date, names: closedNames[date] }; });
  return { rows: rows, total: total, byDay: byDay, unknown: unknown, closedWork: closedWork };
}

function printDutyCell_(style, text) {
  return '<td style="' + style + '">' + text + '</td>';
}

/** 교대 목록: 건수에 따라 1~3단(칸 사이는 표 하나에 나란히 — flex·grid 없이) */
function printDutySwapsHtml_(swaps, line) {
  var cols = swaps.length <= 6 ? 1 : (swaps.length <= 14 ? 2 : 3);
  var per = Math.ceil(swaps.length / cols);
  var th = ['날짜', '칸', '원래 → 실제 근무자', '구분'].map(function (h) { return '<th style="padding:1pt 3pt;border:' + line + ';text-align:left">' + h + '</th>'; }).join('');
  function one(list) {
    return '<table style="border-collapse:collapse;font-size:7.5pt;width:100%"><thead><tr style="background:#e6e6e6">' + th + '</tr></thead><tbody>' +
      list.map(function (w) {
        var td = 'padding:1pt 3pt;border:' + line + ';';
        var nw = td + 'white-space:nowrap;';
        return '<tr style="page-break-inside:avoid">' + printDutyCell_(nw, printEsc_(printDateKo_(w.date, ''))) + printDutyCell_(nw, printEsc_(w.slot)) +
          printDutyCell_(td, printEsc_(w.from) + ' → <b>' + printEsc_(w.to) + '</b>') + printDutyCell_(nw, printEsc_(w.kind || '교대')) + '</tr>';
      }).join('') + '</tbody></table>';
  }
  var tds = '';
  for (var c = 0; c < cols; c++) tds += '<td style="vertical-align:top;padding:0 ' + (c < cols - 1 ? 8 : 0) + 'pt 0 0;width:' + printNum_(100 / cols) + '%">' + one(swaps.slice(c * per, (c + 1) * per)) + '</td>';
  return '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>' + tds + '</tr></table>';
}

function printRenderDutyRecord_(model, opts) {
  opts = opts || {};
  if (!model || typeof model !== 'object') throw new Error('근무 기록표 모델이 없습니다.');
  var mo = printDutyMonth_(model.month);
  var counts = printDutyRecordCounts_(model);
  var title = printEsc_(model.title || '신한학사 근무 기록표');
  var closed = {};
  printArr_(model.closedDates).forEach(function (d) { closed[d] = true; });
  var matched = {};   // 별표를 실제로 붙인 키
  var swapTo = {};   // 날짜|이름|칸코드 → true: 교대·대신 근무로 실제 근무자가 된 칸(* 표시). 칸코드는 '예비'(예비 칸끼리 교대)도 된다
  var swaps = (model.swaps || []).filter(function (w) { return w && w.date; });
  swaps.forEach(function (w) {
    var slot = String(w.slot === undefined ? '' : w.slot).replace(/\s/g, '');
    swapTo[w.date + '|' + w.to + '|' + (slot === '예비' ? '예비' : printDutyCode_(slot))] = true;
  });

  // 열 너비(pt): 이름 52 + 날짜 n칸 + 합계 5칸 = 796
  var nameW = 52, sumW = [30, 24, 24, 26, 34];
  var sumTotal = 0;
  sumW.forEach(function (w) { sumTotal += w; });
  var dayW = Math.floor((PRINT_PAGE_W_PT - nameW - sumTotal) / mo.n * 10) / 10;
  if (dayW > 26) dayW = 26;
  var cellPt = printClamp_((dayW - 1.5) / 3.0, 5.5, 8);   // "21:30" 한 칸에 한 줄(숫자·쌍점 0.6em × 5)
  var tableW = nameW + sumTotal + dayW * mo.n;
  var line = '0.5pt solid #555';
  var base = 'padding:3.5pt 0;text-align:center;border:' + line + ';';

  var colgroup = '<colgroup><col style="width:' + nameW + 'pt">' + new Array(mo.n + 1).join('<col style="width:' + printNum_(dayW) + 'pt">') +
    sumW.map(function (w) { return '<col style="width:' + w + 'pt">'; }).join('') + '</colgroup>';

  var head1 = '<tr><th rowspan="2" style="' + base + 'background:#e6e6e6;font-size:8pt">교사</th>';
  var head2 = '<tr>';
  for (var d = 1; d <= mo.n; d++) {
    var date = printDutyDate_(mo, d);
    var wd = ymdWeekdayKo_(date);
    var shade = closed[date] ? 'background:#c8c8c8;' : (wd === '토' || wd === '일' ? 'background:#ececec;' : 'background:#f8f8f8;');
    head1 += '<th style="' + base + shade + 'font-size:7.5pt">' + d + '</th>';
    head2 += '<th style="' + base + shade + 'font-size:6.5pt;font-weight:normal">' + wd + '</th>';
  }
  var sumHead = [['근무', '8pt'], ['21:30', '6.5pt'], ['23:00', '6.5pt'], ['단독', '6.5pt'], ['예비 지정', '6.5pt']];
  sumHead.forEach(function (h) { head1 += '<th rowspan="2" style="' + base + 'background:#e6e6e6;font-size:' + h[1] + '">' + printEsc_(h[0]) + '</th>'; });
  head1 += '</tr>';
  head2 += '</tr>';

  var body = '';
  counts.rows.forEach(function (r, i) {
    var t = model.teachers[i] || {};
    var standby = {};
    printArr_(t.standby).forEach(function (x) { standby[x] = true; });
    var tr = '<tr style="page-break-inside:avoid"><th scope="row" style="' + base + 'text-align:left;padding-left:2pt;font-size:8pt">' + printEsc_(r.name) + '</th>';
    for (var dd = 1; dd <= mo.n; dd++) {
      var dt = printDutyDate_(mo, dd);
      var raw = (t.cells || {})[dt];
      var parts = [];
      var work = false;
      (Array.isArray(raw) ? raw : (raw === null || raw === undefined ? [] : [raw])).forEach(function (x) {
        var code = printDutyCode_(x);
        if (code === '') return;
        if (code === null) { parts.push('?'); return; }
        work = true;
        var kk = dt + '|' + r.name + '|' + code;
        if (swapTo[kk]) matched[kk] = true;
        parts.push(code + (swapTo[kk] ? '*' : ''));
      });
      if (standby[dt]) {
        var ks = dt + '|' + r.name + '|예비';
        if (swapTo[ks]) matched[ks] = true;
        parts.push('예' + (swapTo[ks] ? '*' : ''));
      }
      var bg = closed[dt] ? 'background:#c8c8c8;' : '';
      var weight = work ? 'font-weight:bold;' : (parts.length ? 'color:#444;' : '');
      tr += printDutyCell_(base + bg + 'font-size:' + printNum_(cellPt) + 'pt;white-space:nowrap;' + weight, parts.map(printEsc_).join('<br>'));
    }
    tr += printDutyCell_(base + 'font-size:10pt;font-weight:bold;background:#f2f2f2', r.work) +
      printDutyCell_(base + 'font-size:7pt;color:#333', r.s2130) + printDutyCell_(base + 'font-size:7pt;color:#333', r.s2300) +
      printDutyCell_(base + 'font-size:7pt;color:#333', r.solo) + printDutyCell_(base + 'font-size:8pt', r.standby) + '</tr>';
    body += tr;
  });
  var totalRow = '<tr style="page-break-inside:avoid"><th scope="row" style="' + base + 'background:#e0e0e0;text-align:left;padding-left:2pt;font-size:8pt">합계</th>';
  for (var d3 = 1; d3 <= mo.n; d3++) {
    var dt3 = printDutyDate_(mo, d3);
    var n3 = counts.byDay[dt3] || 0;
    totalRow += printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', closed[dt3] && !n3 ? '—' : n3);
  }
  var tt = counts.total;
  totalRow += printDutyCell_(base + 'background:#e0e0e0;font-size:10pt;font-weight:bold', tt.work) + printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', tt.s2130) +
    printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', tt.s2300) + printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', tt.solo) +
    printDutyCell_(base + 'background:#e0e0e0;font-size:8pt;font-weight:bold', tt.standby) + '</tr>';

  var grid = counts.rows.length
    ? '<table style="width:' + printNum_(tableW) + 'pt;border-collapse:collapse;table-layout:fixed">' + colgroup + '<thead>' + head1 + head2 + '</thead><tbody>' + body + totalRow + '</tbody></table>'
    : '<div style="font-size:11pt;padding:12pt 0">이 달 근무 기록이 없습니다. 근무표에서 먼저 편성해 주세요.</div>';

  var swapHtml = '<div style="font-size:9pt;font-weight:bold;margin:8pt 0 3pt">교대 ' + swaps.length + '건</div>' +
    (swaps.length ? printDutySwapsHtml_(swaps, line) : '<div style="font-size:8pt">이 달 교대가 없습니다.</div>');

  var notes = ['근무 = 21:30조 + 23:00조 + 단독(금·토·일). 같은 날 두 조를 맡으면 둘 다 셉니다. 칸의 * 는 교대·대신 근무로 실제 근무자가 된 날(예비 칸끼리 바꾼 날은 "예*")입니다. 21:30조·23:00조 수당은 같아 조별 횟수는 참고입니다.',
    '예비 지정은 근무로 세지 않고 따로 셉니다(칸의 "예"). 예비 감독이 대신 근무한 날은 근무 칸이 되어 예비 지정에서 빠집니다. 회색 칸은 운영 안 하는 날입니다.'];
  var warnings = printArr_(model.warnings);
  if (counts.unknown) warnings.push('알 수 없는 칸 값 또는 이 달 밖 날짜 ' + counts.unknown + '개는 세지 않았습니다.');
  var lost = swaps.filter(function (w) {
    var slot = String(w.slot === undefined ? '' : w.slot).replace(/\s/g, '');
    return !matched[w.date + '|' + w.to + '|' + (slot === '예비' ? '예비' : printDutyCode_(slot))];
  });
  if (lost.length) warnings.push('교대 ' + swaps.length + '건 중 ' + lost.length + '건은 실제 근무자 칸이 없어 *를 붙이지 못했습니다(' + lost.map(function (w) { return printDateKo_(w.date, '') + ' ' + w.to + ' ' + w.slot; }).join(', ') + ').');
  counts.closedWork.forEach(function (c) {
    warnings.push('운영 안 하는 날(' + printDateKo_(c.date, '') + ')에 근무가 기록되어 있습니다: ' + c.names.join(', ') + ' — 근무로 셌습니다. 근무표를 확인해 주세요.');
  });
  var foot = '<div style="font-size:7.5pt;line-height:10pt;margin-top:8pt">' + notes.map(printEsc_).join('<br>') +
    (warnings.length ? '<br><b>※ ' + warnings.map(printEsc_).join(' / ') + '</b>' : '') + '</div>';

  var head = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + title + '</title>' +
    '<style>@page { size: A4 landscape; margin: 8mm; } html, body { margin: 0; padding: 0; } ' +
    'body { font-family: ' + PRINT_FONT + '; color: #000; background: #fff; ' + PRINT_COLOR_EXACT + ' } table { empty-cells: show; }</style></head><body>';
  var stamp = '만든 시각 ' + printEsc_(model.generatedAt || '') + ' · 그 달 마지막 변경 ' + printEsc_(model.lastChangedAt || '');
  var top = '<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0;font-size:15pt;font-weight:bold;line-height:20pt">' + title +
    '&nbsp;&nbsp;<span style="font-size:12pt">' + mo.y + '년 ' + mo.m + '월</span>&nbsp;&nbsp;<span style="font-size:9pt;font-weight:normal">' + printEsc_(model.termName || '') + ' · 실제 근무자 기준</span></td>' +
    '<td style="padding:0;text-align:right;font-size:7.5pt;line-height:10pt;vertical-align:bottom">' + stamp + '<br>출력한 뒤 근무표가 바뀌었는지 확인할 때 씁니다.</td></tr></table>';
  return head + '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;min-height:' + PRINT_PAGE_H_PT + 'pt;' + PRINT_COLOR_EXACT + '">' + top + grid + swapHtml + foot + '</section></body></html>';
}
