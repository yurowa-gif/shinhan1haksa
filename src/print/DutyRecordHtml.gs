/**
 * 월말 근무 기록표 HTML 렌더러(D7, 임시 양식 — 학교 양식을 받으면 엑셀로 대체). 소유: DESIGN. 순수 함수.
 *
 *   printRenderDutyRecord_(model, opts) → HTML 문서 문자열(A4 가로, 보통 한 쪽). 모양: 교사 × 날짜 칸(21:30·23:00·단독·예비),
 *                                         교사별 근무 합계(크게)·조별 횟수(작게)·예비 지정, 합계 줄, 교대 목록, 만든 시각·마지막 변경 시각.
 *   printDutyRecordCounts_(model)      → 칸에서 센 교사별 합계(렌더러와 테스트가 같은 숫자를 쓴다).
 *
 * model 모양은 docs/design/duty-record-model.md. 합계는 모델이 주는 값이 아니라 **칸에서 센다**(칸 = 합계가 늘 맞는다).
 * 근무 = 21:30 + 23:00 + 단독. 예비 지정은 따로 센다(결정 46): 대신 근무한 날은 근무 칸이 되므로 예비에서 빠진다(모델이 칸을 그렇게 준다).
 * 21:30조·23:00조 수당은 같다(결정 47): 근무 합계가 주 숫자이고 조별 횟수는 작은 참고 글자다.
 * 글자가 사라지지 않게 칸을 자르지 않는다(overflow:hidden 없음). 흑백 인쇄: 회색 농도·굵기·글자로 구분한다.
 * 날짜 요일·월 일수는 rules의 ymdWeekdayKo_·ymdDaysInMonth_를 쓴다. 전역 이름은 print 접두어.
 */

var PRINT_DR_SHIFTS = ['21:30', '23:00', '단독'];   // 근무로 세는 칸 값
var PRINT_DR_STANDBY = '예비';                        // 예비 지정만 된 칸 값(근무로 세지 않음)

/** '2027-03' → {y, m, n(일수)} */
function printDutyMonth_(month) {
  var mm = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!mm || Number(mm[2]) < 1 || Number(mm[2]) > 12) throw new Error('근무 기록표 월 형식이 아닙니다(yyyy-MM): ' + month);
  return { y: Number(mm[1]), m: Number(mm[2]), n: ymdDaysInMonth_(Number(mm[1]), Number(mm[2])) };
}

function printDutyDate_(mo, d) {
  return mo.y + '-' + (mo.m < 10 ? '0' : '') + mo.m + '-' + (d < 10 ? '0' : '') + d;
}

/** 칸 값 앞뒤 공백·'*'를 떼고 표준 값으로: '21:30'·'23:00'·'단독'·'예비'·''(빈 칸)·그 밖은 null(알 수 없음) */
function printDutyCode_(v) {
  var t = String(v === null || v === undefined ? '' : v).replace(/[*\s]/g, '');
  if (t === '') return '';
  if (t === '단') t = '단독';
  return (PRINT_DR_SHIFTS.indexOf(t) >= 0 || t === PRINT_DR_STANDBY) ? t : null;
}

/** 교사별 합계를 칸에서 센다. 이 달 밖 날짜·알 수 없는 값은 세지 않고 unknown에 센다. → {rows:[{name, work, s2130, s2300, solo, standby}], total:{…}, byDay:{날짜:n}, unknown:n} */
function printDutyRecordCounts_(model) {
  var mo = printDutyMonth_(model && model.month);
  var days = {};
  for (var d = 1; d <= mo.n; d++) days[printDutyDate_(mo, d)] = true;
  var total = { work: 0, s2130: 0, s2300: 0, solo: 0, standby: 0 };
  var byDay = {};
  var unknown = 0;
  var rows = (model.teachers || []).map(function (t) {
    var r = { name: String(t && t.name !== undefined ? t.name : ''), work: 0, s2130: 0, s2300: 0, solo: 0, standby: 0 };
    Object.keys((t && t.cells) || {}).forEach(function (date) {
      var code = printDutyCode_(t.cells[date]);
      if (code === '') return;
      if (code === null || !days[date]) { unknown++; return; }
      if (code === PRINT_DR_STANDBY) { r.standby++; total.standby++; return; }
      r.work++; total.work++;
      if (code === '21:30') { r.s2130++; total.s2130++; } else if (code === '23:00') { r.s2300++; total.s2300++; } else { r.solo++; total.solo++; }
      byDay[date] = (byDay[date] || 0) + 1;
    });
    return r;
  });
  return { rows: rows, total: total, byDay: byDay, unknown: unknown };
}

function printDutyCell_(style, text) {
  return '<td style="' + style + '">' + text + '</td>';
}

function printRenderDutyRecord_(model, opts) {
  opts = opts || {};
  if (!model || typeof model !== 'object') throw new Error('근무 기록표 모델이 없습니다.');
  var mo = printDutyMonth_(model.month);
  var counts = printDutyRecordCounts_(model);
  var title = printEsc_(model.title || '신한학사 근무 기록표');
  var closed = {};
  printArr_(model.closedDates).forEach(function (d) { closed[d] = true; });
  var swapTo = {};   // 날짜|이름 → true: 교대·대신 근무로 실제 근무자가 된 칸(* 표시)
  var swaps = (model.swaps || []).filter(function (w) { return w && w.date; });
  swaps.forEach(function (w) { swapTo[w.date + '|' + w.to] = true; });

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
    var t = model.teachers[i];
    var tr = '<tr style="page-break-inside:avoid"><th scope="row" style="' + base + 'text-align:left;padding-left:2pt;font-size:8pt">' + printEsc_(r.name) + '</th>';
    for (var dd = 1; dd <= mo.n; dd++) {
      var dt = printDutyDate_(mo, dd);
      var code = printDutyCode_((t.cells || {})[dt]);
      var bg = closed[dt] ? 'background:#c8c8c8;' : '';
      var txt = '';
      if (code === null) txt = '?';
      else if (code === PRINT_DR_STANDBY) txt = '예';
      else if (code !== '') txt = code + (swapTo[dt + '|' + r.name] ? '*' : '');
      var weight = code && code !== PRINT_DR_STANDBY ? 'font-weight:bold;' : (code === PRINT_DR_STANDBY ? 'color:#444;' : '');
      tr += printDutyCell_(base + bg + 'font-size:' + printNum_(cellPt) + 'pt;white-space:nowrap;' + weight, printEsc_(txt));
    }
    tr += printDutyCell_(base + 'font-size:10pt;font-weight:bold;background:#f2f2f2', r.work) +
      printDutyCell_(base + 'font-size:7pt;color:#333', r.s2130) + printDutyCell_(base + 'font-size:7pt;color:#333', r.s2300) +
      printDutyCell_(base + 'font-size:7pt;color:#333', r.solo) + printDutyCell_(base + 'font-size:8pt', r.standby) + '</tr>';
    body += tr;
  });
  var totalRow = '<tr style="page-break-inside:avoid"><th scope="row" style="' + base + 'background:#e0e0e0;text-align:left;padding-left:2pt;font-size:8pt">합계</th>';
  for (var d3 = 1; d3 <= mo.n; d3++) {
    var dt3 = printDutyDate_(mo, d3);
    totalRow += printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', closed[dt3] ? '—' : (counts.byDay[dt3] || 0));
  }
  var tt = counts.total;
  totalRow += printDutyCell_(base + 'background:#e0e0e0;font-size:10pt;font-weight:bold', tt.work) + printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', tt.s2130) +
    printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', tt.s2300) + printDutyCell_(base + 'background:#e0e0e0;font-size:7pt;font-weight:bold', tt.solo) +
    printDutyCell_(base + 'background:#e0e0e0;font-size:8pt;font-weight:bold', tt.standby) + '</tr>';

  var grid = counts.rows.length
    ? '<table style="width:' + printNum_(tableW) + 'pt;border-collapse:collapse;table-layout:fixed">' + colgroup + '<thead>' + head1 + head2 + '</thead><tbody>' + body + totalRow + '</tbody></table>'
    : '<div style="font-size:11pt;padding:12pt 0">이 달 근무 기록이 없습니다. 근무표에서 먼저 편성해 주세요.</div>';

  var swapRows = swaps.map(function (w) {
    return '<tr style="page-break-inside:avoid">' + printDutyCell_('padding:1.5pt 4pt;border:' + line, printEsc_(printDateKo_(w.date, ''))) +
      printDutyCell_('padding:1.5pt 4pt;border:' + line, printEsc_(w.slot)) +
      printDutyCell_('padding:1.5pt 4pt;border:' + line, printEsc_(w.from) + ' → <b>' + printEsc_(w.to) + '</b>') +
      printDutyCell_('padding:1.5pt 4pt;border:' + line, printEsc_(w.kind || '교대')) + '</tr>';
  }).join('');
  var swapHtml = '<div style="font-size:9pt;font-weight:bold;margin:8pt 0 3pt">교대 ' + swaps.length + '건</div>' +
    (swaps.length ? '<table style="border-collapse:collapse;font-size:8pt;min-width:300pt"><thead><tr style="background:#e6e6e6">' +
      ['날짜', '칸', '원래 → 실제 근무자', '구분'].map(function (h) { return '<th style="padding:1.5pt 4pt;border:' + line + ';text-align:left">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + swapRows + '</tbody></table>'
      : '<div style="font-size:8pt">이 달 교대가 없습니다.</div>');

  var notes = ['근무 = 21:30조 + 23:00조 + 단독(금·토·일). 칸의 * 는 교대·대신 근무로 실제 근무자가 된 날입니다. 21:30조·23:00조 수당은 같아 조별 횟수는 참고입니다.',
    '예비 지정은 근무로 세지 않고 따로 셉니다(칸의 "예"). 예비 감독이 대신 근무한 날은 근무 칸이 되어 예비 지정에서 빠집니다. 회색 칸은 운영 안 하는 날입니다.'];
  var warnings = printArr_(model.warnings);
  if (counts.unknown) warnings.push('알 수 없는 칸 값 또는 이 달 밖 날짜 ' + counts.unknown + '개는 세지 않았습니다.');
  var foot = '<div style="font-size:7.5pt;line-height:10pt;margin-top:8pt">' + notes.map(printEsc_).join('<br>') +
    (warnings.length ? '<br><b>※ ' + warnings.map(printEsc_).join(' / ') + '</b>' : '') +
    '<br>만든 시각 ' + printEsc_(model.generatedAt || '') + ' · 그 달 마지막 변경 ' + printEsc_(model.lastChangedAt || '') + ' · 출력한 뒤 근무표가 바뀌었는지 확인할 때 씁니다.</div>';

  var head = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + title + '</title>' +
    '<style>@page { size: A4 landscape; margin: 8mm; } html, body { margin: 0; padding: 0; } ' +
    'body { font-family: ' + PRINT_FONT + '; color: #000; background: #fff; ' + PRINT_COLOR_EXACT + ' } table { empty-cells: show; }</style></head><body>';
  var top = '<div style="font-size:15pt;font-weight:bold;line-height:20pt">' + title + '&nbsp;&nbsp;<span style="font-size:12pt">' + mo.y + '년 ' + mo.m + '월</span>' +
    '&nbsp;&nbsp;<span style="font-size:9pt;font-weight:normal">' + printEsc_(model.termName || '') + ' · 실제 근무자 기준</span></div>';
  return head + '<section class="page" style="width:' + PRINT_PAGE_W_PT + 'pt;min-height:' + PRINT_PAGE_H_PT + 'pt;' + PRINT_COLOR_EXACT + '">' + top + grid + swapHtml + foot + '</section></body></html>';
}
