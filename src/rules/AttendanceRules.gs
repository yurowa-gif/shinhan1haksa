/**
 * 출석부 칸 규칙(RULES 세션 소유, docs/contracts/rules-api.md·sheet-model.md, PRD 3.4·F1·F2·F9).
 *
 * 순수 함수만 둔다. DateRules.gs의 함수(hm…·ymd…)를 부른다.
 * 칸 우선순위: 확정 사전 특이사항(EXC) > 확정 고정 일정 '학'·'가'(FIXED) > 23:00 종료 "정상 종료"(END) > 빈칸(NONE).
 * 시트 행(문자열)은 그대로 받는다. 값 글자는 docs/contracts/vocabulary.md.
 *   exceptions_<기간>: id, student_id, date, blocks('ALL' | 'HH:mm-HH:mm;…'), type, status(요청·확정·취소), confirmed_at, updated_at …
 *   fixed_schedules:   id, student_id, month(yyyy-MM), weekday(월~일), blocks, code(학·가), status(제출·동의·확정·반려·취소),
 *                      teacher_confirmed_at, updated_at …
 */

function attStr_(v) {
  return String(v === undefined || v === null ? '' : v).trim();
}

/** 'H:mm'·'HH:mm'·초가 00인 'HH:mm:ss' → 'HH:mm', 아니면 null. */
function attHm_(s) {
  var m = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(attStr_(s));
  if (!m) return null;
  var hm = (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2];
  return hmIsValid_(hm) ? hm : null;
}

/** 일시 비교용(공백 구분도 T 형식과 같은 순서로). */
function attIso_(v) {
  return attStr_(v).replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
}

/**
 * 블록 표기 해석. 'ALL'(대소문자·공백 무시) 또는 'HH:mm-HH:mm;HH:mm-HH:mm'.
 * → {all:boolean, ranges:[{start,end}](시작 순, 겹치거나 맞닿은 범위는 합침), errors:[문자열]}
 * 범위는 시작 < 끝, 끝은 '24:00'까지('15:00부터 귀가' = '15:00-24:00'). '9:00'처럼 한 자리 시도 받는다.
 * 잘못된 조각은 errors에 적고 뺀다. 빈 표기도 오류.
 */
function parseBlockSpec_(spec) {
  var s = attStr_(spec);
  if (s.toUpperCase() === 'ALL') return { all: true, ranges: [], errors: [] };
  var errors = [], ranges = [];
  if (!s) return { all: false, ranges: [], errors: ['블록 표기가 비어 있습니다'] };
  s.split(';').forEach(function (part) {
    var p = part.trim();
    if (!p) return;
    var m = /^(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})$/.exec(p);
    var a = m && attHm_(m[1]), b = m && attHm_(m[2]);
    if (!a || !b || a === '24:00' || hmToMin_(a) >= hmToMin_(b)) {
      errors.push('블록 표기가 아닙니다(HH:mm-HH:mm): ' + p);
      return;
    }
    ranges.push({ start: a, end: b });
  });
  if (!ranges.length && !errors.length) errors.push('블록 표기가 비어 있습니다');
  ranges.sort(function (x, y) { return hmToMin_(x.start) - hmToMin_(y.start) || hmToMin_(x.end) - hmToMin_(y.end); });
  var merged = [];
  ranges.forEach(function (r) {
    var last = merged[merged.length - 1];
    if (last && hmToMin_(r.start) <= hmToMin_(last.end)) {
      if (hmToMin_(r.end) > hmToMin_(last.end)) last.end = r.end;
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  });
  return { all: false, ranges: merged, errors: errors };
}

/** parseBlockSpec_ 결과 → 저장용 문자열('ALL' 또는 'HH:mm-HH:mm;…'). 범위가 없으면 ''. */
function formatBlockSpec_(parsed) {
  if (!parsed) return '';
  if (parsed.all) return 'ALL';
  var p = parseBlockSpec_((parsed.ranges || []).map(function (r) { return attStr_(r.start) + '-' + attStr_(r.end); }).join(';'));
  return p.ranges.map(function (r) { return r.start + '-' + r.end; }).join(';');
}

/**
 * 블록 표기(문자열 또는 parseBlockSpec_ 결과)가 블록 {start,end}와 겹치는지. 'ALL'이면 늘 true.
 * 맞닿기만 하면(18:00-20:00 과 20:00-22:00) 겹치지 않는다. 잘못된 표기는 false.
 */
function blockSpecCovers_(spec, block) {
  var p = typeof spec === 'string' || spec === undefined || spec === null ? parseBlockSpec_(spec) : spec;
  if (p.all) return true;
  if (!block) return false;
  var bs = attHm_(block.start), be = attHm_(block.end);
  if (!bs || !be) return false;
  var s = hmToMin_(bs), e = hmToMin_(be);
  return (p.ranges || []).some(function (r) { return hmToMin_(r.start) < e && s < hmToMin_(r.end); });
}

/**
 * 그날 쓸 고정 일정 행(F9 "확정 전에는 기존 시간표 유지").
 * 그 학생의 적용월(month) <= ymd의 달 중, 확정 행이 있고 아직 확정 전인 행(제출·동의)이 없는 가장 최근 달을 고르고
 * 그 달의 확정 행을 모두 돌려준다(요일은 resolveCell_이 고른다). 없으면 []. 적용월이 'yyyy-MM'이 아닌 행은 무시.
 * - 한 달의 일부 행만 확정되었으면(교사가 행마다 확정하는 중) 그 달로 바꾸지 않고 앞 달을 유지한다.
 * ASSUMPTION: '학'·'가'가 하나도 없는 달은 행이 없어 나타낼 수 없으므로, 그런 달에도 앞 달 시간표가 이어진다.
 *   F9(3단계)에서 "이번 달 확정, 고정 일정 없음"을 저장하는 방법을 정해야 한다.
 */
function effectiveFixedRows_(rows, studentId, ymd) {
  var sid = attStr_(studentId), ym = attStr_(ymd).slice(0, 7);
  var byMonth = {};
  (rows || []).forEach(function (r) {
    if (!r || attStr_(r.student_id) !== sid) return;
    var mo = attStr_(r.month);
    if (!/^\d{4}-\d{2}$/.test(mo) || mo > ym) return;
    var m = byMonth[mo] = byMonth[mo] || { confirmed: [], pending: false };
    var st = attStr_(r.status);
    if (st === '확정') m.confirmed.push(r);
    else if (st === '제출' || st === '동의') m.pending = true;
  });
  var months = Object.keys(byMonth).filter(function (mo) {
    return byMonth[mo].confirmed.length && !byMonth[mo].pending;
  }).sort();
  return months.length ? byMonth[months[months.length - 1]].confirmed : [];
}

/** 유형 약어 기본값(sheet-model.md, 설정 exception.type_short). */
function attDefaultTypeShort_() {
  return { '병결': '병결', '병지각': '병지', '병조퇴': '병조', '가정사유': '가정', '학원': '학원',
    '학사 외 프로그램': '외부', '학사 내 프로그램': '내부', '미인정지각': '무지', '미인정조퇴': '무조',
    '미인정결석': '무결', '기타': '기타' };
}

/**
 * 유형 → 칸에 쓸 약어. 설정의 유형 이름에는 괄호 설명이 붙어 있다('가정사유(가족여행 포함)')
 * — 그대로 찾고, 없으면 양쪽 모두 괄호를 뗀 이름끼리 비교하고(관리자가 괄호 설명을 고쳐도 옛 행이 맞도록),
 * 그래도 없으면 괄호를 뗀 이름을 그대로 쓴다.
 */
function attTypeShort_(type, typeShort) {
  var map = typeShort || attDefaultTypeShort_();
  var t = attStr_(type);
  if (Object.prototype.hasOwnProperty.call(map, t)) return attStr_(map[t]);
  var base = attTypeBase_(t);
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    if (attTypeBase_(keys[i]) === base) return attStr_(map[keys[i]]);
  }
  return base || t;
}

/** 유형 이름에서 끝의 괄호 설명을 뗀다: '가정사유(가족여행 포함)' → '가정사유'. */
function attTypeBase_(t) {
  return attStr_(t).replace(/\s*\(.*\)\s*$/, '').trim();
}

/** 요일 글자 → 기본 요일 유형. */
function attWeekdayBaseType_(weekdayKo) {
  return { '월': 'mon_thu', '화': 'mon_thu', '수': 'mon_thu', '목': 'mon_thu', '금': 'fri', '토': 'sat', '일': 'sun' }[attStr_(weekdayKo)] || '';
}

/** 행 a가 b보다 최근 확정인지(확정 시각 → updated_at, 같으면 a = 나중 행이 이김). */
function attNewer_(a, b, confirmedKey) {
  var ca = attIso_(a[confirmedKey]), cb = attIso_(b[confirmedKey]);
  if (ca !== cb) return ca > cb;
  return attIso_(a.updated_at) >= attIso_(b.updated_at);
}

/**
 * 한 학생·한 블록 칸.
 * c = {block:{seq,start,end}, isLastBlock, dayType, weekdayKo, exceptions:rows[], fixedRows:rows[], endType:'23:00'|'23:50'|'',
 *      dayEnd:'HH:mm'(그날 자습 종료, 선택 — R3 추가), opts:{endTypeDayTypes:['mon_thu'], endTime:'23:00', typeShort:{유형:약어}, endLabel:'정상 종료'}}
 * → {code:'EXC'|'FIXED'|'END'|'NONE', text, exceptionId, more}
 * - exceptions는 그 학생·그날 행(날짜는 resolveStudentDay_가 거른다). status '확정'만, '요청'·'취소'는 무시.
 *   겹치는 확정 특이사항이 여럿이면 가장 최근 확정(confirmed_at → updated_at) 1건의 약어 + ' 외 N'(more = N)(가정 c).
 * - fixedRows는 effectiveFixedRows_ 결과. status '확정', weekday === weekdayKo, 블록이 겹치는 행. 여럿이면 최근 확정.
 * - END: endType이 opts.endTime(기본 '23:00')이고 dayType이 endTypeDayTypes(기본 mon_thu)에 있고(특별 유형이면 실제
 *   요일로 판정) 마지막 블록이며, 그 블록과 그날 자습(dayEnd)이 모두 종료 시각보다 늦게 끝날 때.
 *   ASSUMPTION: 날짜별 종료를 23:00 이하로 당긴 날(22:30·23:00)은 모두 그 시각에 귀가하므로 표시하지 않는다.
 */
function resolveCell_(c) {
  c = c || {};
  var opts = c.opts || {};
  var block = c.block || {};

  var exc = (c.exceptions || []).filter(function (e) {
    return e && attStr_(e.status) === '확정' && blockSpecCovers_(attStr_(e.blocks), block);
  });
  if (exc.length) {
    var top = exc.reduce(function (m, e) { return !m || attNewer_(e, m, 'confirmed_at') ? e : m; }, null);
    var more = exc.length - 1;
    var text = attTypeShort_(top.type, opts.typeShort) + (more ? ' 외 ' + more : '');
    return { code: 'EXC', text: text, exceptionId: attStr_(top.id), more: more };
  }

  var wk = attStr_(c.weekdayKo);
  var fixed = (c.fixedRows || []).filter(function (f) {
    if (!f) return false;
    var code = attStr_(f.code);
    return attStr_(f.status) === '확정' && attStr_(f.weekday) === wk && (code === '학' || code === '가') &&
      blockSpecCovers_(attStr_(f.blocks), block);
  });
  if (fixed.length) {
    var ft = fixed.reduce(function (m, f) { return !m || attNewer_(f, m, 'teacher_confirmed_at') ? f : m; }, null);
    return { code: 'FIXED', text: attStr_(ft.code), exceptionId: '', more: 0 };
  }

  var endTime = attHm_(opts.endTime) || '23:00';
  var dayTypes = (opts.endTypeDayTypes || ['mon_thu']).map(attStr_);
  var dt = attStr_(c.dayType);
  // ASSUMPTION: 특별 요일 유형(exam 등)으로 바꾼 날은 실제 달력 요일의 기본 유형으로 판정한다(목요일 exam → mon_thu).
  var isBase = ['mon_thu', 'fri', 'sat', 'sun'].indexOf(dt) >= 0;
  var dayOk = dayTypes.indexOf(dt) >= 0 || (!isBase && dayTypes.indexOf(attWeekdayBaseType_(c.weekdayKo)) >= 0);
  var be = attHm_(block.end);
  var dayEnd = attHm_(c.dayEnd);
  if (c.isLastBlock && attHm_(c.endType) === endTime && dayOk && be && hmToMin_(be) > hmToMin_(endTime) &&
      (!dayEnd || hmToMin_(dayEnd) > hmToMin_(endTime))) {
    return { code: 'END', text: attStr_(opts.endLabel) || '정상 종료', exceptionId: '', more: 0 };
  }
  return { code: 'NONE', text: '', exceptionId: '', more: 0 };
}

/**
 * 한 학생의 하루 칸들. plan = resolveDayPlan_ 결과, s = {exceptions, fixedRows, endType}, opts = resolveCell_의 opts.
 * → [{seq, code, text, exceptionId, more}] (plan.blocks 순서, 운영 안 하는 날은 []).
 * exceptions는 date가 plan.date인 행만 쓴다(날짜가 빈 행은 쓰지 않는다). 그날 종료(plan.end)를 dayEnd로 넘긴다.
 * fixedRows는 effectiveFixedRows_ 결과를 넘긴다. 요일은 실제 달력 요일(ymdWeekdayKo_)로 고른다.
 * sheet-model의 marks에는 seq·code·text만 옮긴다.
 */
function resolveStudentDay_(plan, s, opts) {
  if (!plan || !plan.operating) return [];
  s = s || {};
  var blocks = plan.blocks || [];
  var date = attStr_(plan.date);
  var exceptions = (s.exceptions || []).filter(function (e) {
    return e && attStr_(e.date) === date;   // 날짜가 비었거나 다른 행은 쓰지 않는다(빈 날짜가 모든 날에 찍히지 않게)
  });
  var weekdayKo = ymdWeekdayKo_(date);
  return blocks.map(function (b, i) {
    var r = resolveCell_({
      block: b, isLastBlock: i === blocks.length - 1, dayType: plan.dayType, weekdayKo: weekdayKo, dayEnd: plan.end,
      exceptions: exceptions, fixedRows: s.fixedRows || [], endType: s.endType, opts: opts
    });
    return { seq: b.seq, code: r.code, text: r.text, exceptionId: r.exceptionId, more: r.more };
  });
}
