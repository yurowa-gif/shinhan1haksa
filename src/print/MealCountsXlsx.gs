/**
 * 식수 집계 xlsx 통합 문서(결정 67 ①, C19b). 순수 함수 — Apps Script 서비스·현재 시각 금지. 학생 이름·이메일은 넣지 않는다.
 *
 *   printMealCountsWorkbook_(model) → printXlsxFiles_가 받는 {sheets:[…]}
 *
 * model = MealCountsHtml(PDF)과 같은 모양: {date, termName, operating, counts(mealCountsOn_ 결과), docRows, docUnsubmitted, preparedBy, generatedAt}.
 * 시트 '식수 집계': 열 학사·기숙·비기숙·조식·석식(학사·일반·계). 행 순서는 결정 67: 여1·여2·여3·남1·남2·남3 → 여 합계·남 합계 → 1·2·3학년 → 전체.
 * 숫자는 계산하지 않고 counts.groups 그대로 옮긴다(석식 계만 학사+일반). 합계 검사는 PDF 렌더러와 같은 printMealCheck_.
 */

/** 줄 이름 순서: 여1…·남1…(성별·학년) → 여 합계·남 합계 → N학년 → 전체 → 모르는 이름(버리지 않는다). PDF 렌더러의 순서와 같아야 한다(디자인 세션이 맞춘다). */
function printMcxOrder_(keys) {
  function rank(k) {
    var m;
    if ((m = /^(여|남)(\d+)$/.exec(k))) return [m[1] === '여' ? 0 : 1, Number(m[2])];
    if (k === '여 합계') return [2, 0];
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

function printMealCountsWorkbook_(model) {
  if (!model || typeof model !== 'object') throw new Error('식수 집계 모델이 없습니다.');
  if (!ymdIsValid_(model.date)) throw new Error('식수 집계 날짜 형식이 아닙니다(yyyy-MM-dd): ' + model.date);
  var counts = model.counts || {}, groups = counts.groups || {};
  var keys = printMcxOrder_(Object.keys(groups));
  var cols = [['hall', '학사'], ['dorm', '기숙'], ['nonDorm', '비기숙'], ['breakfast', '조식'], ['hallDinner', '석식 학사'], ['generalDinner', '석식 일반']];
  var num = function (v) { var n = printMealNum_(v); return n === null ? '?' : n; };   // 읽을 수 없는 값은 조용히 0으로 두지 않고 ?로 보인다
  var p = model.date.split('-');
  var rows = [
    { h: 28, cells: [{ v: model.title || '신한학사 식수 집계', s: 'title' }] },
    [{ v: Number(p[0]) + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일(' + ymdWeekdayKo_(model.date) + ') · ' + (model.termName || ''), s: 'label' }],
    [],
    { h: 22, cells: [{ v: '구분', s: 'head' }].concat(cols.map(function (c) { return { v: c[1], s: 'head' }; })).concat([{ v: '석식 계', s: 'head' }]) }
  ];
  keys.forEach(function (k) {
    var v = groups[k] || {}, total = /합계$/.test(k) || k === '전체' || /^\d+학년$/.test(k);
    var d1 = printMealNum_(v.hallDinner), d2 = printMealNum_(v.generalDinner);
    rows.push([{ v: k, s: total ? 'total' : 'text' }].concat(cols.map(function (c) { return { v: num(v[c[0]]), s: total ? 'total' : 'num' }; }))
      .concat([{ v: d1 === null || d2 === null ? '?' : d1 + d2, s: total ? 'total' : 'num' }]));
  });
  if (!keys.length) rows.push([{ v: '집계할 학생이 없습니다. 이 기간 명단을 먼저 올려 주세요.', s: 'note' }]);
  rows.push([]);
  var notes = ['신청 기준 인원입니다(결석·외박은 반영하지 않습니다).',
    '학사 = 기숙 + 비기숙. 석식 계 = 석식 학사 + 석식 일반. 퇴실한 학생도 석식 중단일 전까지는 학사 석식에 포함됩니다.',
    '퇴실 후 석식 유지 ' + num(counts.afterLeaveHallDinner) + '명(학사 퇴실했지만 석식 중단일 전이라 학사 석식에 포함).'];
  if (model.docRows !== undefined && model.docRows !== null) notes.push('아직 서류가 없는 신청 ' + num(model.docRows) + '건(전체 기준, 집계에는 이미 포함).');
  var unknown = Array.isArray(counts.unknownGroup) ? counts.unknownGroup : [];
  if (unknown.length) notes.push('※ 성별·학년을 알 수 없는 학생 ' + unknown.length + '명은 어느 줄에도 넣지 않았습니다.');
  printMealCheck_(groups).forEach(function (b) { notes.push('※ 합계가 맞지 않습니다 — ' + b); });
  if (model.preparedBy || model.generatedAt) notes.push('작성: ' + (model.preparedBy || '') + (model.generatedAt ? ' · 만든 시각 ' + model.generatedAt : ''));
  notes.forEach(function (t) { rows.push([{ v: t, s: 'note' }]); });
  return { sheets: [{ name: '식수 집계', cols: [14, 9, 9, 9, 9, 11, 11, 9], rows: rows, merges: ['A1:H1'], freeze: { rows: 4, cols: 1 }, landscape: false }] };
}
