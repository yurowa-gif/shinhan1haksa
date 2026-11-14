/**
 * 확인서 두 종 HTML 렌더러(D9, 결정 67·68). 소유: DESIGN. 순수 함수 — Apps Script 서비스·현재 시각·인자 없는 Date 생성 금지.
 *
 *   printRenderMealConfirm_(model, opts)  → 학교급식(미)실시 확인서(2025판) 한 장
 *   printRenderMoveConfirm_(model, opts)  → 기숙사 및 신한학사 입․퇴실 확인서(2025판) 한 장
 *
 * 칸·문구·여백은 docs/reference/meal-confirm-form.md(선생님이 준 2025판 양식)를 그대로 옮겼다: A4 세로, 여백 위 20·아래 15·좌우 30mm
 * → 인쇄 폭 150mm = 425.2pt라 내용 폭은 425pt. 제목(가운데) → 2열 표(왼쪽 항목, 오른쪽 내용) → 날짜 → 확인자 줄.
 * 확인자 줄에는 그 학생의 담당교사 이름, 서명·도장(인) 자리는 빈칸(종이에 한다). 학생 이름은 모델로만 받는다(출력할 때만 쓰고 Drive에 남기지 않는다).
 * 모델 모양·칸 채우는 규칙은 docs/design/confirm-forms-model.md. 모르는 값은 조용히 넘기지 않고 오류를 던진다(틀린 서류를 내지 않는다).
 * 고른 항목은 ○(괄호 안) 또는 손으로 동그라미 친 듯한 둥근 테두리, 체크칸은 ✓로 표시한다 — 흑백 인쇄에서도 보인다. 전역 이름은 printCf 접두어.
 */

var PRINT_CF_WIDTH_PT = 425;   // A4 210mm − 좌우 여백 30mm × 2 = 150mm = 425.2pt
var PRINT_CF_LINE = '1pt solid #000';
var PRINT_CF_MEAL_REASONS = ['전입', '전출', '장기결석', '대회출전', '기타'];
var PRINT_CF_BREAKFAST_CAUSES = ['기숙사 입실', '미실시 사유 소멸', '기숙사 퇴실', '건강상의 사유'];
var PRINT_CF_SERVE = ['실시', '미실시'];
var PRINT_CF_SCOPES = ['기숙사', '신한학사'];

function printCfText_(v) { return v === undefined || v === null ? '' : String(v); }

/** 손으로 ○표 한 것처럼: on이면 글자에 둥근 테두리 */
function printCfCircle_(text, on) {
  if (!on) return printEsc_(text);
  return '<span style="display:inline-block;border:1.2pt solid #000;border-radius:50%;padding:0 4pt;line-height:1.35">' + printEsc_(text) + '</span>';
}
/** "( ○ )" 칸: 고르면 ○, 아니면 빈 괄호 */
function printCfParen_(on) {
  return '(&nbsp;' + (on ? '<b>○</b>' : '&nbsp;&nbsp;') + '&nbsp;)';
}
/** "[ ✓ ]" 체크칸 */
function printCfBox_(on) {
  return '[&nbsp;' + (on ? '<b>✓</b>' : '&nbsp;&nbsp;') + '&nbsp;]';
}
function printCfInArr_(arr, v) { for (var i = 0; i < arr.length; i++) { if (arr[i] === v) return true; } return false; }

/** 'yyyy-MM-dd' → '2027년 3월 15일'. 틀린 날짜는 오류 */
function printCfDate_(ymd, what) {
  if (!ymdIsValid_(ymd)) throw new Error(what + ' 날짜 형식이 아닙니다(yyyy-MM-dd): ' + printCfText_(ymd));
  var p = ymd.split('-');
  return Number(p[0]) + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일';
}
/** '2027. 3. 15.' (기간 칸) */
function printCfDateDots_(ymd, what) {
  if (!ymdIsValid_(ymd)) throw new Error(what + ' 날짜 형식이 아닙니다(yyyy-MM-dd): ' + printCfText_(ymd));
  var p = ymd.split('-');
  return Number(p[0]) + '. ' + Number(p[1]) + '. ' + Number(p[2]) + '.';
}

/** 이름·학년·반·번호 — 비어 있으면 빈칸(손으로 쓴다). 학년·반·번호는 숫자만 받는다 */
function printCfStudent_(student) {
  var s = student || {};
  function num(v, what) {
    var t = printCfText_(v).replace(/^\s+|\s+$/g, '');
    if (t === '') return '';
    if (!/^\d{1,3}$/.test(t)) throw new Error('학생 ' + what + '은(는) 숫자여야 합니다: ' + t);
    return String(Number(t));
  }
  return { name: printCfText_(s.name).replace(/^\s+|\s+$/g, ''), grade: num(s.grade, '학년'), classNo: num(s.classNo, '반'), number: num(s.number, '번호') };
}
function printCfBlank_(v, w) { return v === '' ? '<span style="display:inline-block;min-width:' + (w || 28) + 'pt">&nbsp;</span>' : printEsc_(v); }
function printCfGradeLine_(st, withClass) {
  return printCfBlank_(st.grade, 24) + ' 학년&nbsp;&nbsp;' + printCfBlank_(st.classNo, 24) + ' 반&nbsp;&nbsp;' + (withClass ? printCfBlank_(st.number, 24) + ' 번' : '');
}

function printCfCell_(html, opts) {
  opts = opts || {};
  var st = 'border:' + PRINT_CF_LINE + ';padding:6pt 10pt;font-size:12pt;line-height:19pt;vertical-align:middle;' + (opts.h ? 'height:' + opts.h + ';' : '');
  return '<td' + (opts.colspan ? ' colspan="' + opts.colspan + '"' : '') + ' style="' + st + (opts.center ? 'text-align:center;' : 'text-align:left;') + (opts.top ? 'vertical-align:top;' : '') + '">' + html + '</td>';
}
function printCfRow_(label, html, opts) {
  opts = opts || {};
  return '<tr>' + printCfCell_(label, { center: true, h: opts.h, top: false }) + printCfCell_(html, { h: opts.h, top: opts.top }) + '</tr>';
}

/** 확인자 줄: 신한고등학교 확인자 : 직) 교사 성명) 담당교사 이름 (인) — 서명·도장은 빈칸 */
function printCfConfirmer_(confirmer) {
  var name = printCfText_((confirmer || {}).name).replace(/^\s+|\s+$/g, '');
  return '<div style="font-size:12pt;line-height:22pt;text-align:right;margin-top:14pt">신한고등학교&nbsp;&nbsp;&nbsp;확인자&nbsp;:&nbsp;&nbsp;직)&nbsp;교사&nbsp;&nbsp;&nbsp;성명)&nbsp;' +
    (name === '' ? '<span style="display:inline-block;min-width:60pt;border-bottom:0.6pt solid #000">&nbsp;</span>' : '<b>' + printEsc_(name) + '</b>') +
    '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)</div>';
}

function printCfDocument_(titleText, tableRows, dateYmd, confirmer) {
  var title = printEsc_(titleText);
  var table = '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:22pt"><colgroup><col style="width:30%"><col style="width:70%"></colgroup><tbody>' + tableRows + '</tbody></table>';
  var date = '<div style="font-size:13pt;line-height:24pt;text-align:center;margin-top:20pt">' + printCfDate_(dateYmd, '확인서') + '</div>';
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + title + '</title>' +
    '<style>@page { size: A4 portrait; margin: 20mm 30mm 15mm 30mm; } html, body { margin: 0; padding: 0; } ' +
    'body { font-family: ' + PRINT_FONT + '; color: #000; background: #fff; ' + PRINT_COLOR_EXACT + ' } table { empty-cells: show; }</style></head><body>' +
    '<section class="page" style="width:' + PRINT_CF_WIDTH_PT + 'pt;' + PRINT_COLOR_EXACT + '">' +
    '<div style="font-size:22pt;font-weight:bold;line-height:30pt;text-align:center;letter-spacing:2pt">' + title + '</div>' +
    table + date + printCfConfirmer_(confirmer) + '</section></body></html>';
}

/**
 * 학교급식(미)실시 확인서(2025판).
 * model = { date:'yyyy-MM-dd'(신청 일시의 날짜),
 *           student:{name, grade, classNo, number},
 *           serving:{breakfast:'실시'|'미실시'|null, dinner:'실시'|'미실시'|null}  // 신청에 맞는 체크칸(둘 중 하나 이상)
 *           reason:'전입'|'전출'|'장기결석'|'대회출전'|'기타'|null, reasonOther:'',
 *           breakfastCause:'기숙사 입실'|'미실시 사유 소멸'|'기숙사 퇴실'|'건강상의 사유'|null,
 *           period:{from:'yyyy-MM-dd'(적용일), to:''}, confirmer:{name:'담당교사 이름'} }
 */
function printRenderMealConfirm_(model, opts) {
  if (!model || typeof model !== 'object') throw new Error('급식 확인서 모델이 없습니다.');
  var sv = model.serving || {};
  var b = sv.breakfast === undefined || sv.breakfast === null ? '' : sv.breakfast;
  var d = sv.dinner === undefined || sv.dinner === null ? '' : sv.dinner;
  [['조식', b], ['석식', d]].forEach(function (x) { if (x[1] !== '' && !printCfInArr_(PRINT_CF_SERVE, x[1])) throw new Error(x[0] + ' 값은 실시·미실시 중 하나여야 합니다: ' + x[1]); });
  if (b === '' && d === '') throw new Error('조식·석식 중 바뀌는 끼니가 없습니다(실시·미실시가 바뀌는 신청에만 확인서를 만듭니다).');
  var reason = model.reason === undefined || model.reason === null ? '' : model.reason;
  if (reason !== '' && !printCfInArr_(PRINT_CF_MEAL_REASONS, reason)) throw new Error('사유 구분은 전입·전출·장기결석·대회출전·기타 중 하나여야 합니다: ' + reason);
  var cause = model.breakfastCause === undefined || model.breakfastCause === null ? '' : model.breakfastCause;
  if (cause !== '' && !printCfInArr_(PRINT_CF_BREAKFAST_CAUSES, cause)) throw new Error('조식 사유가 양식에 없는 값입니다: ' + cause);
  var st = printCfStudent_(model.student);
  var serve = b === '실시' || d === '실시', stop = b === '미실시' || d === '미실시';   // 섞이면(조식 실시 + 석식 미실시) 둘 다 ○

  var period = model.period || {};
  var periodLine = period.from ? printCfDateDots_(period.from, '기간 시작') + '&nbsp;~' + (period.to ? '&nbsp;' + printCfDateDots_(period.to, '기간 끝') : '') : '&nbsp;';
  var reasonHtml = PRINT_CF_MEAL_REASONS.slice(0, 4).map(function (r) { return printCfCircle_(r, reason === r); }).join(',&nbsp; ') + ',<br>' +
    printCfCircle_('기타', reason === '기타') + ' (&nbsp;' + (reason === '기타' && model.reasonOther ? printEsc_(model.reasonOther) : '<span style="display:inline-block;min-width:80pt">&nbsp;</span>') + '&nbsp;)';
  var bigLine = 'line-height:26pt;';
  var mealBox = '<div style="' + bigLine + '"><b>조식 실시</b>&nbsp;' + printCfBox_(b === '실시') + '&nbsp;&nbsp;<span style="font-size:10pt">(사유:&nbsp;' + printCfCircle_('기숙사 입실', cause === '기숙사 입실') + ' / ' + printCfCircle_('미실시 사유 소멸', cause === '미실시 사유 소멸') + ')</span></div>' +
    '<div style="' + bigLine + '"><b>조식 미실시</b>&nbsp;' + printCfBox_(b === '미실시') + '&nbsp;&nbsp;<span style="font-size:10pt">(사유:&nbsp;' + printCfCircle_('기숙사 퇴실', cause === '기숙사 퇴실') + ' / ' + printCfCircle_('건강상의 사유', cause === '건강상의 사유') + '*증빙서류)</span></div>' +
    '<div style="' + bigLine + '"><b>석식 실시</b>&nbsp;' + printCfBox_(d === '실시') + '</div>' +
    '<div style="' + bigLine + '"><b>석식 미실시</b>&nbsp;' + printCfBox_(d === '미실시') + '</div>';

  var rows = printCfRow_('구분 (○표)', '급식실시 ' + printCfParen_(serve) + ' ,&nbsp; 급식미실시 ' + printCfParen_(stop), { h: '34pt' }) +
    printCfRow_('이&nbsp;&nbsp;&nbsp;름', st.name === '' ? '&nbsp;' : printEsc_(st.name), { h: '34pt' }) +
    printCfRow_('학 년ㆍ반', printCfGradeLine_(st, true), { h: '34pt' }) +
    printCfRow_('구분 (○표)', reasonHtml, { h: '60pt' }) +
    printCfRow_('기&nbsp;&nbsp;&nbsp;간', '<div style="line-height:22pt">' + periodLine + '</div><div style="font-size:10pt;line-height:16pt;margin-top:8pt">(전입자일 경우에는 급식실시일 기재)</div>', { h: '60pt' }) +
    '<tr>' + printCfCell_(mealBox, { colspan: 2, h: '145pt' }) + '</tr>';
  return printCfDocument_('학교급식(미)실시 확인서', rows, model.date, model.confirmer);
}

/**
 * 기숙사 및 신한학사 입․퇴실 확인서(2025판).
 * model = { date:'yyyy-MM-dd'(신청일), kind:'입실'|'퇴실', scopes:['기숙사','신한학사'](하나 이상 — 학사 및 기숙사 퇴실이면 둘 다),
 *           effectiveDate:'yyyy-MM-dd'(적용일 = 입․퇴실일), student:{name, grade, classNo, number}, note:'사유(비고)', confirmer:{name} }
 */
function printRenderMoveConfirm_(model, opts) {
  if (!model || typeof model !== 'object') throw new Error('입퇴실 확인서 모델이 없습니다.');
  if (model.kind !== '입실' && model.kind !== '퇴실') throw new Error('입실·퇴실 중 하나여야 합니다: ' + printCfText_(model.kind));
  var scopes = Array.isArray(model.scopes) ? model.scopes : [];
  if (!scopes.length) throw new Error('기숙사·신한학사 중 하나 이상을 골라야 합니다.');
  scopes.forEach(function (s) { if (!printCfInArr_(PRINT_CF_SCOPES, s)) throw new Error('구분은 기숙사·신한학사 중 하나여야 합니다: ' + s); });
  var st = printCfStudent_(model.student);
  var note = printCfText_(model.note);
  var rows = printCfRow_('입․퇴실(○표)', '입&nbsp;&nbsp;실' + printCfParen_(model.kind === '입실') + ' ,&nbsp; 퇴&nbsp;&nbsp;실&nbsp;' + printCfParen_(model.kind === '퇴실'), { h: '34pt' }) +
    printCfRow_('구분 (○표)', '기숙사' + printCfParen_(printCfInArr_(scopes, '기숙사')) + ' ,&nbsp; 신한학사' + printCfParen_(printCfInArr_(scopes, '신한학사')), { h: '34pt' }) +
    printCfRow_('입․퇴실일', model.effectiveDate ? printCfDate_(model.effectiveDate, '입․퇴실') : '&nbsp;', { h: '34pt' }) +
    printCfRow_('이&nbsp;&nbsp;&nbsp;름', st.name === '' ? '&nbsp;' : printEsc_(st.name), { h: '34pt' }) +
    printCfRow_('학 년ㆍ반ㆍ번호', printCfGradeLine_(st, true), { h: '34pt' }) +
    printCfRow_('★ 비&nbsp;&nbsp;고', note === '' ? '&nbsp;' : printEsc_(note), { h: '145pt', top: true });
  return printCfDocument_('기숙사 및 신한학사 입․퇴실 확인서', rows, model.date, model.confirmer);
}
