/**
 * 월말 근무 기록표 xlsx(결정 67, 48). 순수 함수 — Apps Script 서비스·현재 시각 금지. 출력물에는 교사 이름만(학생 이름·이메일 없음).
 *
 *   printDutyRecordWorkbook_(model) → printXlsxFiles_가 받는 통합 문서({sheets:[…]}).
 *
 * model = DutyRecordHtml과 같은 모양(docs/design/duty-record-model.md: month·title·termName·closedDates·teachers·swaps·generatedAt·lastChangedAt·warnings)
 *   + calendar: { 'yyyy-MM-dd': { closed: bool, slots: [{label:'21:30'|'23:00'|'', name, from}], standby: [{name, from}] } }
 *     (그 달의 모든 날짜. slots는 그날 근무 틀의 칸 전부 — 빈 칸은 name '', 단독은 label ''. from = 교대 전 원래 근무자, 없으면 '')
 *
 * 시트1 '월별 근무표': 운영 파일의 월별 근무표 모양 — 일~토 달력, 평일 2명(21:30조·23:00조), 주말 1명 + (예비), 교대는 '원래=>바뀐'.
 * 시트2 '합계·교대': 교사별 근무 합계(크게)·조별 횟수(작게, 결정 47)·예비 지정, 합계 줄, 교대 목록, 만든 시각·마지막 변경 시각·경고.
 * 합계는 모델이 주는 값이 아니라 칸에서 센다(printDutyRecordCounts_, PDF 렌더러와 같은 숫자).
 * // ASSUMPTION: 시트1의 칸 안 글 배치(줄 순서·괄호 위치)는 디자인 세션의 docs/design/duty-record.md가 나오면 맞춘다(임시).
 */
var PRINT_DRX_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 'yyyy-MM-dd' → 요일 번호(0=일). UTC로 계산해 시간대와 상관없다 */
function printDrxDow_(ymd) {
  var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return new Date(Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]))).getUTCDay();
}

/** '2027-03-05' → '3월 5일(금)' */
function printDrxDateKo_(ymd) {
  var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!p) return String(ymd);
  return Number(p[2]) + '월 ' + Number(p[3]) + '일(' + PRINT_DRX_WEEK[printDrxDow_(ymd)] + ')';
}

/** 근무자 한 칸의 글: 교대 전 원래 근무자가 있으면 '원래=>바뀐', 비었으면 '(비어 있음)' */
function printDrxWho_(name, from) {
  var n = String(name || '').trim(), f = String(from || '').trim();
  if (!n) return '(비어 있음)';
  return f && f !== n ? f + '=>' + n : n;
}

/** 그날 칸의 글 줄들(날짜 줄 제외) */
function printDrxDayLines_(day) {
  var lines = [];
  if (!day) return lines;
  if (day.closed) lines.push('(운영 안 함)');
  var slots = Array.isArray(day.slots) ? day.slots : [];
  slots.forEach(function (s) {
    var who = printDrxWho_(s && s.name, s && s.from);
    lines.push(s && s.label ? s.label + ' ' + who : who);
  });
  (Array.isArray(day.standby) ? day.standby : []).forEach(function (s) {
    lines.push('(' + printDrxWho_(s && s.name, s && s.from) + ')');
  });
  return lines;
}

/** 합친 칸 안의 긴 글 한 줄(합친 칸은 엑셀이 높이를 맞추지 않으므로 글자 수로 높이를 정한다). width = 그 칸들의 글자 수 폭 */
function printDrxNote_(text, width) {
  var t = String(text);
  var lines = Math.max(1, Math.ceil(t.length / Math.max(width || 60, 20)));
  return { h: lines * 14 + 4, cells: [{ v: t, s: 'note' }] };
}

function printDrxSheet1_(model, mo) {
  var cal = model.calendar || {};
  var cols = [16, 16, 16, 16, 16, 16, 16];
  var rows = [];
  var title = (model.title || '신한학사 근무 기록표') + ' · ' + mo.y + '년 ' + mo.m + '월' + (model.termName ? ' · ' + model.termName : '');
  rows.push({ h: 24, cells: [{ v: title, s: 'title' }] });
  rows.push([{ v: '만든 시각 ' + (model.generatedAt || '') + (model.lastChangedAt ? ' · 근무표 마지막 변경 ' + model.lastChangedAt : ''), s: 'note' }]);
  rows.push({ h: 20, cells: PRINT_DRX_WEEK.map(function (w) { return { v: w, s: 'dayhead' }; }) });
  var merges = ['A1:G1', 'A2:G2'];
  var first = printDrxDow_(printDutyDate_(mo, 1));
  var week = [], maxLines = 0, d;
  var flush = function () {
    while (week.length < 7) week.push({ v: '', s: 'dim' });
    rows.push({ h: Math.max(32, 16 * (maxLines + 1) + 4), cells: week });
    week = []; maxLines = 0;
  };
  for (var i = 0; i < first; i++) week.push({ v: '', s: 'dim' });
  for (d = 1; d <= mo.n; d++) {
    var date = printDutyDate_(mo, d), day = cal[date], lines = printDrxDayLines_(day);
    if (lines.length > maxLines) maxLines = lines.length;
    week.push({ v: [d + '일'].concat(lines).join('\n'), s: day && day.closed ? 'dim' : 'day' });
    if (week.length === 7) flush();
  }
  if (week.length) flush();
  rows.push([]);
  rows.push(printDrxNote_('교대는 원래=>바뀐으로 적었고, 괄호는 예비 감독입니다. 주말은 근무 1명 + (예비)입니다.', 100));
  merges.push('A' + rows.length + ':G' + rows.length);
  return { name: '월별 근무표', cols: cols, rows: rows, merges: merges, landscape: true };
}

function printDrxSheet2_(model, mo) {
  var counts = printDutyRecordCounts_(model);
  var rows = [], merges = [];
  var merge = function () { merges.push('A' + rows.length + ':F' + rows.length); };
  rows.push({ h: 24, cells: [{ v: '교사별 근무 합계 · ' + mo.y + '년 ' + mo.m + '월', s: 'title' }] }); merge();
  rows.push([{ v: '만든 시각 ' + (model.generatedAt || '') + (model.lastChangedAt ? ' · 근무표 마지막 변경 ' + model.lastChangedAt : ''), s: 'note' }]); merge();
  rows.push([]);
  rows.push({ h: 22, cells: ['교사', '근무 합계', '21:30조', '23:00조', '단독', '예비 지정(따로 셈)'].map(function (h) { return { v: h, s: 'head' }; }) });
  counts.rows.forEach(function (r) {
    rows.push({ h: 22, cells: [{ v: r.name, s: 'text' }, { v: r.work, s: 'big' }, { v: r.s2130, s: 'small' }, { v: r.s2300, s: 'small' }, { v: r.solo, s: 'small' }, { v: r.standby, s: 'num' }] });
  });
  var t = counts.total;
  rows.push({ h: 22, cells: [{ v: '합계', s: 'total' }, { v: t.work, s: 'total' }, { v: t.s2130, s: 'total' }, { v: t.s2300, s: 'total' }, { v: t.solo, s: 'total' }, { v: t.standby, s: 'total' }] });
  rows.push(printDrxNote_('근무 합계가 수당 기준입니다. 조별 횟수는 참고용입니다(21:30조·23:00조 수당이 같음, 결정 47). 예비 지정만 된 날은 따로 세고, 대신 근무한 날은 근무로만 셉니다(결정 46). 금액은 계산하지 않습니다.', 70));
  merge();
  rows.push([]);
  rows.push([{ v: '교대 목록', s: 'label' }]);
  rows.push({ h: 22, cells: ['날짜', '칸', '원래 근무자', '실제 근무자', '구분'].map(function (h) { return { v: h, s: 'head' }; }) });
  var swaps = printDrxArr_(model.swaps);
  if (!swaps.length) {
    rows.push(printDrxNote_('이 달 교대가 없습니다.', 70)); merge();
  } else {
    swaps.forEach(function (s) {
      rows.push({ h: 20, cells: [{ v: printDrxDateKo_(String(s.date || '')), s: 'text' }, { v: String(s.slot || ''), s: 'text' }, { v: String(s.from || ''), s: 'text' }, { v: String(s.to || ''), s: 'text' }, { v: String(s.kind || '교대'), s: 'text' }] });
    });
  }
  var notes = [];
  if (counts.unknown) notes.push('알 수 없는 칸 값 ' + counts.unknown + '건은 세지 않았습니다.');
  counts.closedWork.forEach(function (c) { notes.push(printDrxDateKo_(c.date) + '은 운영 안 하는 날인데 근무 기록이 있어 근무로 셌습니다(' + c.names.join(', ') + ').'); });
  printDrxArr_(model.warnings).forEach(function (w) { notes.push(String(w)); });
  if (notes.length) {
    rows.push([]);
    rows.push([{ v: '확인할 것', s: 'label' }]);
    notes.forEach(function (n) { rows.push(printDrxNote_(n, 70)); merge(); });
  }
  return { name: '합계·교대', cols: [18, 12, 10, 10, 10, 16], rows: rows, merges: merges, landscape: false };
}

function printDrxArr_(x) { return Array.isArray(x) ? x : []; }

/** 월말 근무 기록표 통합 문서(시트 둘) */
function printDutyRecordWorkbook_(model) {
  var mo = printDutyMonth_(model && model.month);
  return { sheets: [printDrxSheet1_(model, mo), printDrxSheet2_(model, mo)] };
}
