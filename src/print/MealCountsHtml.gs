/**
 * 식수 집계 HTML 렌더러(D8, 급식실 보고용 임시 양식 — 급식실 양식을 받으면 맞춘다). 소유: DESIGN. 순수 함수.
 *
 *   printRenderMealCounts_(model, opts) → HTML 문서 문자열(A4 세로 한 쪽, 여백 14mm → 인쇄 폭 515.9pt라 내용 폭은 515pt).
 *
 * model 모양은 docs/design/meal-counts-model.md: R12 mealCountsOn_ 결과(counts)를 그대로 받고, 머리말·참고 정보를 더한다.
 * 행 = counts.groups의 줄(여1…·여 합계·남1…·남 합계·N학년·전체), 열 = 학사 / 기숙 / 비기숙 / 조식 / 석식(학사·일반·계).
 * 신청 기준 인원이다(결석·외박을 반영하지 않음, PRD §12). 퇴실 후 석식 유지 인원·서류 미제출 수·알 수 없는 학생 경고를 아래에 적는다.
 * 렌더러는 숫자를 바꾸지 않는다. 다만 합계가 부분 합과 맞는지 검사해서 안 맞으면 경고 줄에 어느 줄인지 적는다(조용히 틀린 표를 내지 않는다).
 * 흑백 인쇄: 합계 줄은 굵은 글씨 + 회색 바탕. 칸을 자르지 않는다(overflow:hidden 없음). 전역 이름은 print 접두어.
 */

var PRINT_MC_COLS = [['hall', '학사'], ['dorm', '기숙'], ['nonDorm', '비기숙'], ['breakfast', '조식'], ['hallDinner', '석식 학사'], ['generalDinner', '석식 일반']];

/** 줄 이름 순서: 여1…·여 합계·남1…·남 합계·1학년…·전체, 모르는 이름은 끝(버리지 않는다) */
function printMealRowOrder_(keys) {
  function rank(k) {
    var m;
    if ((m = /^(여|남)(\d+)$/.exec(k))) return [m[1] === '여' ? 0 : 2, Number(m[2])];
    if (k === '여 합계') return [1, 0];
    if (k === '남 합계') return [3, 0];
    if ((m = /^(\d+)학년$/.exec(k))) return [4, Number(m[1])];
    if (k === '전체') return [5, 0];
    return [6, 0];
  }
  return keys.slice().sort(function (a, b) {
    var ra = rank(a), rb = rank(b);
    return ra[0] !== rb[0] ? ra[0] - rb[0] : (ra[1] !== rb[1] ? ra[1] - rb[1] : (a < b ? -1 : a > b ? 1 : 0));
  });
}

/** 인원 수로 읽는다: 0 이상 정수이거나 숫자만 든 문자열('2', ' 3 ')만 받고, 빈 문자열·null·true·소수·글자 섞인 값은 null(칸에는 ?) */
function printMealNum_(v) {
  if (typeof v === 'number') return isFinite(v) && v >= 0 && Math.floor(v) === v ? v : null;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v);
  return null;
}

/** 합계 검사: 학사 = 기숙 + 비기숙, 성별 합계·학년 합계·전체 = 부분 합. → 어긋난 줄 설명 목록 */
function printMealCheck_(groups) {
  var bad = [];
  var keys = Object.keys(groups);
  function g(k, m) { return groups[k] ? (printMealNum_(groups[k][m]) || 0) : 0; }
  keys.forEach(function (k) {
    if (g(k, 'hall') !== g(k, 'dorm') + g(k, 'nonDorm')) bad.push(k + ': 학사 ≠ 기숙 + 비기숙');
  });
  function sumRows(rows, m) { return rows.reduce(function (n, r) { return n + g(r, m); }, 0); }
  function check(total, parts) {
    if (!groups[total]) return;
    PRINT_MC_COLS.forEach(function (c) { if (g(total, c[0]) !== sumRows(parts, c[0])) bad.push(total + ': ' + c[1] + ' ≠ 부분 합'); });
  }
  ['여', '남'].forEach(function (s) { check(s + ' 합계', keys.filter(function (k) { return new RegExp('^' + s + '\\d+$').test(k); })); });
  keys.filter(function (k) { return /^\d+학년$/.test(k); }).forEach(function (k) {
    var gr = k.replace('학년', '');
    check(k, ['여' + gr, '남' + gr].filter(function (x) { return groups[x]; }));
  });
  check('전체', ['여 합계', '남 합계']);
  return bad;
}

function printRenderMealCounts_(model, opts) {
  opts = opts || {};
  if (!model || typeof model !== 'object') throw new Error('식수 집계 모델이 없습니다.');
  if (!ymdIsValid_(model.date)) throw new Error('식수 집계 날짜 형식이 아닙니다(yyyy-MM-dd): ' + model.date);
  var counts = model.counts || {};
  var groups = counts.groups || {};
  var keys = printMealRowOrder_(Object.keys(groups));
  var title = printEsc_(model.title || '신한학사 식수 집계');
  var line = '0.6pt solid #555';
  var td = 'padding:5pt 6pt;text-align:right;border:' + line + ';font-size:11pt;';
  var thS = 'padding:5pt 6pt;border:' + line + ';background:#e6e6e6;font-size:9pt;';
  var head = '<tr><th style="' + thS + 'text-align:left">구분</th>' + PRINT_MC_COLS.map(function (c) { return '<th style="' + thS + 'text-align:right">' + printEsc_(c[1]) + '</th>'; }).join('') +
    '<th style="' + thS + 'text-align:right">석식 계</th></tr>';
  var rows = keys.map(function (k) {
    var v = groups[k] || {};
    var total = /합계$/.test(k) || k === '전체' || /^\d+학년$/.test(k);
    var st = total ? 'font-weight:bold;background:#e8e8e8;' : '';
    var cells = PRINT_MC_COLS.map(function (c) {
      var n = printMealNum_(v[c[0]]);
      return '<td style="' + td + st + '">' + (n === null ? '?' : n) + '</td>';
    });
    var d1 = printMealNum_(v.hallDinner), d2 = printMealNum_(v.generalDinner);
    var dn = d1 === null || d2 === null ? '?' : d1 + d2;
    return '<tr style="page-break-inside:avoid"><th scope="row" style="' + td + 'text-align:left;' + st + '">' + printEsc_(k) + '</th>' + cells.join('') +
      '<td style="' + td + 'font-weight:bold;' + (total ? 'background:#e8e8e8;' : 'background:#f4f4f4;') + '">' + dn + '</td></tr>';
  }).join('');
  var table = keys.length ? '<table style="width:100%;border-collapse:collapse;margin-top:10pt"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>'
    : '<div style="font-size:11pt;padding:12pt 0">집계할 학생이 없습니다. 이 기간 명단을 먼저 올려 주세요.</div>';

  var notes = ['신청 기준 인원입니다(결석·외박은 반영하지 않습니다).',
    '학사 = 기숙 + 비기숙. 석식 계 = 석식 학사 + 석식 일반. 퇴실한 학생도 석식 중단일 전까지는 학사 석식에 포함됩니다.'];
  var after = printMealNum_(counts.afterLeaveHallDinner);
  notes.push('퇴실 후 석식 유지 ' + (after === null ? '?' : after) + '명(학사 퇴실했지만 석식 중단일 전이라 학사 석식에 포함).');
  if (model.docUnsubmitted !== undefined && model.docUnsubmitted !== null) notes.push('서류 미제출 ' + (printMealNum_(model.docUnsubmitted) === null ? '?' : printMealNum_(model.docUnsubmitted)) + '명(집계에는 이미 포함, 이름은 담당교사 화면에서 봅니다).');
  var unknown = printArr_(counts.unknownGroup);
  // 학생마다 반복되는 R12 경고("<학생 id> 학생의 성별·학년을 알 수 없어 …")는 급식실에 내는 종이에 싣지 않는다(이름은 교사 화면 몫). 요약 한 줄만 남긴다
  var warnings = printArr_(counts.warnings).filter(function (w) {
    return !unknown.some(function (id) { return id !== '' && w.indexOf(id + ' 학생') === 0; });
  });
  if (unknown.length) warnings.push('성별·학년을 알 수 없는 학생 ' + unknown.length + '명은 어느 줄에도 넣지 않았습니다.');
  printMealCheck_(groups).forEach(function (b) { warnings.push('합계가 맞지 않습니다 — ' + b); });
  var foot = '<div style="font-size:9pt;line-height:13pt;margin-top:10pt">' + notes.map(printEsc_).join('<br>') +
    warnings.map(function (w) { return '<br><b>※ ' + printEsc_(w) + '</b>'; }).join('') + '</div>';

  var wd = ymdWeekdayKo_(model.date);
  var p = model.date.split('-');
  var op = model.operating === false ? ' · 이 날은 자습 운영 안 함(참고)' : (model.operating === true ? ' · 이 날 자습 운영(참고)' : '');
  var top = '<div style="font-size:18pt;font-weight:bold;line-height:24pt">' + title + '</div>' +
    '<div style="font-size:13pt;line-height:20pt">' + Number(p[0]) + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일(' + wd + ')' +
    '<span style="font-size:10pt"> · ' + printEsc_(model.termName || '') + printEsc_(op) + '</span></div>';
  var sign = '<table style="width:100%;border-collapse:collapse;margin-top:14pt;font-size:9pt"><tr><td style="padding:6pt;border:' + line + ';width:50%">작성: ' + printEsc_(model.preparedBy || '') + '<br><span style="color:#444">만든 시각 ' + printEsc_(model.generatedAt || '') + '</span></td>' +
    '<td style="padding:6pt;border:' + line + '">급식실 확인(서명)<br><br></td></tr></table>';
  var doc = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + title + '</title>' +
    '<style>@page { size: A4 portrait; margin: 14mm; } html, body { margin: 0; padding: 0; } ' +
    'body { font-family: ' + PRINT_FONT + '; color: #000; background: #fff; ' + PRINT_COLOR_EXACT + ' } table { empty-cells: show; }</style></head><body>';
  return doc + '<section class="page" style="width:515pt;' + PRINT_COLOR_EXACT + '">' + top + table + foot + sign + '</section></body></html>';
}
