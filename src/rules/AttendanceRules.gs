/**
 * 출석부 칸 규칙(RULES 세션 소유, docs/contracts/rules-api.md·sheet-model.md, PRD 3.4·F1·F2·F9).
 *
 * 순수 함수만 둔다. DateRules.gs의 함수(hm…·ymd…·ruleStr_·ruleIso_·hmNorm_)를 부른다.
 * 칸 우선순위: 확정 사전 특이사항(EXC) > 확정 고정 일정 '학'·'가'(FIXED) > 23:00 종료 "정상 종료"(END) > 빈칸(NONE).
 * 시트 행(문자열)은 그대로 받는다. 값 글자는 docs/contracts/vocabulary.md.
 *   exceptions_<기간>: id, student_id, date, blocks('ALL' | 'HH:mm-HH:mm;…'), type, status(요청·확정·취소), confirmed_at, updated_at …
 *   fixed_schedules:   id, student_id, month(yyyy-MM), weekday(월~일), blocks, code(학·가), status(제출·동의·확정·반려·취소),
 *                      teacher_confirmed_at, updated_at …
 */

/**
 * 블록 표기 해석. 'ALL'(대소문자·공백 무시) 또는 'HH:mm-HH:mm;HH:mm-HH:mm'.
 * → {all:boolean, ranges:[{start,end}](시작 순, 겹치거나 맞닿은 범위는 합침), errors:[문자열]}
 * 범위는 시작 < 끝, 끝은 '24:00'까지('15:00부터 귀가' = '15:00-24:00'). '9:00'처럼 한 자리 시도 받는다.
 * 잘못된 조각은 errors에 적고 뺀다. 빈 표기도 오류.
 */
function parseBlockSpec_(spec) {
  var s = ruleStr_(spec);
  if (s.toUpperCase() === 'ALL') return { all: true, ranges: [], errors: [] };
  var errors = [], ranges = [];
  if (!s) return { all: false, ranges: [], errors: ['블록 표기가 비어 있습니다'] };
  s.split(';').forEach(function (part) {
    var p = part.trim();
    if (!p) return;
    var m = /^(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})$/.exec(p);
    var a = m && hmNorm_(m[1]), b = m && hmNorm_(m[2]);
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
  var p = parseBlockSpec_((parsed.ranges || []).map(function (r) { return ruleStr_(r.start) + '-' + ruleStr_(r.end); }).join(';'));
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
  var bs = hmNorm_(block.start), be = hmNorm_(block.end);
  if (!bs || !be) return false;
  var s = hmToMin_(bs), e = hmToMin_(be);
  return (p.ranges || []).some(function (r) { return hmToMin_(r.start) < e && s < hmToMin_(r.end); });
}

/**
 * 그날 쓸 고정 일정 행(F9 "확정 전에는 기존 시간표 유지", 결정 31·84, vocabulary.md fixed_schedules).
 * 그 학생의 적용월(month) <= ymd의 달 중 그날 살아 있던 확정 행이 있는 가장 최근 달을 고르고, 그 달의 그 행 중 '학'·'가'를 돌려준다
 * (요일은 resolveCell_이 고른다). 그 달이 code '없음' 행뿐이면 [] — 앞 달 시간표가 이어지지 않는다(결정 31).
 * 확정 행이 있는 달이 없으면 []. 적용월이 'yyyy-MM'이 아닌 행은 무시.
 * 그날 살아 있던 확정 행(결정 84, R24): 적용 시작일(attFixedStart_) <= ymd 이고,
 *   status '확정'이거나, status '취소'인데 확정된 적이 있고(teacher_confirmed_at) 취소한 날(updated_at의 날짜) > ymd —
 *   담당교사가 달 중간에 대신 입력해 바꾼 시간표는 그 전 날까지 옛 확정 시간표가 그대로 쓰인다(지난 출석부·격자가 바뀌지 않게).
 * ASSUMPTION: 취소 행의 updated_at = 취소한 시각(Db bulkUpdateRecords_가 적는다). updated_at이 없거나 틀린 취소 행은 쓰지 않는다.
 * ASSUMPTION: 한 달의 일부 행만 확정되고 나머지가 아직 제출·동의 상태이면(교사가 행마다 확정하는 중)
 *   그 달로 바꾸지 않고 앞 달을 유지한다(결정 31의 "확정 행이 있는 가장 최근 달"에 더한 조건, R3에서 총괄 승인).
 */
function effectiveFixedRows_(rows, studentId, ymd) {
  var sid = ruleStr_(studentId), day = ruleStr_(ymd), ym = day.slice(0, 7);
  var byMonth = {};
  (rows || []).forEach(function (r) {
    if (!r || ruleStr_(r.student_id) !== sid) return;
    var mo = ruleStr_(r.month);
    if (!/^\d{4}-\d{2}$/.test(mo) || mo > ym) return;
    var m = byMonth[mo] = byMonth[mo] || { confirmed: [], pending: false };
    var st = ruleStr_(r.status);
    if (st === '제출' || st === '동의') { m.pending = true; return; }
    if (attFixedStart_(r) > day) return;
    if (st === '확정') { m.confirmed.push(r); return; }
    var off = ruleIso_(r.updated_at).slice(0, 10);
    if (st === '취소' && ruleStr_(r.teacher_confirmed_at) && ymdIsValid_(off) && off > day) m.confirmed.push(r);
  });
  var months = Object.keys(byMonth).filter(function (mo) {
    return byMonth[mo].confirmed.length && !byMonth[mo].pending;
  }).sort();
  if (!months.length) return [];
  return byMonth[months[months.length - 1]].confirmed.filter(function (r) {
    var code = ruleStr_(r.code);
    return code === '학' || code === '가';
  });
}

/**
 * 고정 일정 행이 출석부에 쓰이기 시작하는 날(결정 84, R24). 보통은 적용월 1일.
 * 담당교사가 대신 입력한 행(학부모 동의 없이 확정 — parent_agreed_at 빈칸, teacher_confirmed_at 있음)은
 * 적용월 1일과 입력한 날(teacher_confirmed_at의 날짜) 중 늦은 날 — 달 중간에 넣으면 그날부터.
 */
function attFixedStart_(r) {
  var first = ruleStr_(r.month) + '-01', at = ruleIso_(r.teacher_confirmed_at).slice(0, 10);
  if (ruleStr_(r.parent_agreed_at) || !ymdIsValid_(at)) return first;
  return at > first ? at : first;
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
  var t = ruleStr_(type);
  if (Object.prototype.hasOwnProperty.call(map, t)) return ruleStr_(map[t]);
  var base = attTypeBase_(t);
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    if (attTypeBase_(keys[i]) === base) return ruleStr_(map[keys[i]]);
  }
  return base || t;
}

/** 유형 이름에서 끝의 괄호 설명을 뗀다: '가정사유(가족여행 포함)' → '가정사유'. */
function attTypeBase_(t) {
  return ruleStr_(t).replace(/\s*\(.*\)\s*$/, '').trim();
}

/** 요일 글자 → 기본 요일 유형. */
function attWeekdayBaseType_(weekdayKo) {
  return { '월': 'mon_thu', '화': 'mon_thu', '수': 'mon_thu', '목': 'mon_thu', '금': 'fri', '토': 'sat', '일': 'sun' }[ruleStr_(weekdayKo)] || '';
}

/** 행 a가 b보다 최근 확정인지(확정 시각 → updated_at, 같으면 a = 나중 행이 이김). */
function attNewer_(a, b, confirmedKey) {
  var ca = ruleIso_(a[confirmedKey]), cb = ruleIso_(b[confirmedKey]);
  if (ca !== cb) return ca > cb;
  return ruleIso_(a.updated_at) >= ruleIso_(b.updated_at);
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
 *   요일로 판정, 휴일 holiday는 실제 요일로 보지 않음 — 결정 72) 마지막 블록이며, 그 블록과 그날 자습(dayEnd)이 모두 종료 시각보다 늦게 끝날 때.
 *   ASSUMPTION: 날짜별 종료를 23:00 이하로 당긴 날(22:30·23:00)은 모두 그 시각에 귀가하므로 표시하지 않는다.
 */
function resolveCell_(c) {
  c = c || {};
  var opts = c.opts || {};
  var block = c.block || {};

  var exc = (c.exceptions || []).filter(function (e) {
    return e && ruleStr_(e.status) === '확정' && blockSpecCovers_(ruleStr_(e.blocks), block);
  });
  if (exc.length) {
    var top = exc.reduce(function (m, e) { return !m || attNewer_(e, m, 'confirmed_at') ? e : m; }, null);
    var more = exc.length - 1;
    var text = attTypeShort_(top.type, opts.typeShort) + (more ? ' 외 ' + more : '');
    return { code: 'EXC', text: text, exceptionId: ruleStr_(top.id), more: more };
  }

  var wk = ruleStr_(c.weekdayKo);
  var fixed = (c.fixedRows || []).filter(function (f) {
    if (!f) return false;
    var code = ruleStr_(f.code);
    return ruleStr_(f.status) === '확정' && ruleStr_(f.weekday) === wk && (code === '학' || code === '가') &&
      blockSpecCovers_(ruleStr_(f.blocks), block);
  });
  if (fixed.length) {
    var ft = fixed.reduce(function (m, f) { return !m || attNewer_(f, m, 'teacher_confirmed_at') ? f : m; }, null);
    return { code: 'FIXED', text: ruleStr_(ft.code), exceptionId: '', more: 0 };
  }

  var endTime = hmNorm_(opts.endTime) || '23:00';
  var dayTypes = (opts.endTypeDayTypes || ['mon_thu']).map(ruleStr_);
  var dt = ruleStr_(c.dayType);
  // ASSUMPTION: 특별 요일 유형(exam 등)으로 바꾼 날은 실제 달력 요일의 기본 유형으로 판정한다(목요일 exam → mon_thu).
  // 휴일(holiday, 결정 72)은 그 자체가 기본 유형이다 — 목요일 휴일도 mon_thu로 보지 않는다(endTypeDayTypes에 holiday가 없으면 END 없음)
  var isBase = ['mon_thu', 'fri', 'sat', 'sun', 'holiday'].indexOf(dt) >= 0;
  var dayOk = dayTypes.indexOf(dt) >= 0 || (!isBase && dayTypes.indexOf(attWeekdayBaseType_(c.weekdayKo)) >= 0);
  var be = hmNorm_(block.end);
  var dayEnd = hmNorm_(c.dayEnd);
  if (c.isLastBlock && hmNorm_(c.endType) === endTime && dayOk && be && hmToMin_(be) > hmToMin_(endTime) &&
      (!dayEnd || hmToMin_(dayEnd) > hmToMin_(endTime))) {
    return { code: 'END', text: ruleStr_(opts.endLabel) || '정상 종료', exceptionId: '', more: 0 };
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
  var date = ruleStr_(plan.date);
  var exceptions = (s.exceptions || []).filter(function (e) {
    return e && ruleStr_(e.date) === date;   // 날짜가 비었거나 다른 행은 쓰지 않는다(빈 날짜가 모든 날에 찍히지 않게)
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

/* ───── F11 출결 결과 정리 격자(R22, PRD F11, docs/plan/f11-notes.md) ─────
 * 결과는 새 탭 없이 확정 사전 특이사항(exceptions) 행으로 저장한다(총괄 전제): 종이 출석부의 ×·△·조를 결과 유형으로 고른다.
 * 그래서 격자 칸 = 출석부 칸(resolveStudentDay_, 같은 우선순위) + 그날 확정 특이사항에서 읽은 결과, 누적은 그 결과를 센다.
 */

/**
 * 결과 유형 대응표(상수, 유형 이름 = 괄호 설명을 뗀 이름 기준, 총괄 답 ④). → {이름: {kind, mark, recognized}}
 * 격자에서 고르는 결과 선택지는 이 여섯 유형뿐이다(총괄 답 ④). settings exception.types에서 이 여섯 이름을 바꾸면 결과로 읽히지 않는다(시험이 지킨다).
 * 결정 81(선생님 답): 그 밖의 유형(가정사유·학원·학사 외/내 프로그램·기타·모르는 유형)으로 빠진 것도 누적에 **인정**으로 센다 —
 * 종류는 덮은 블록으로(attResultByBlocks_), OUT은 생기지 않는다. 고정 일정 '학'·'가'는 특이사항이 아니라 결석·지각·조퇴로 세지 않고 학습량의 빠진 시간에만 든다.
 */
function attResultTable_() {
  return {
    '병결': { kind: '결석', mark: '×', recognized: true }, '미인정결석': { kind: '결석', mark: '×', recognized: false },
    '병지각': { kind: '지각', mark: '△', recognized: true }, '미인정지각': { kind: '지각', mark: '△', recognized: false },
    '병조퇴': { kind: '조퇴', mark: '조', recognized: true }, '미인정조퇴': { kind: '조퇴', mark: '조', recognized: false }
  };
}

/** 특이사항 유형 → 결과 {kind, mark, recognized} 또는 null(결과 유형이 아님). 괄호 설명은 뗀다. */
function attResultKind_(type) {
  var r = attResultTable_()[attTypeBase_(type)];
  return r ? { kind: r.kind, mark: r.mark, recognized: r.recognized } : null;
}

/**
 * 결과 유형이 아닌 빠짐의 종류(결정 81): 덮은 블록으로 정한다. blocks = resolveDayPlan_ 블록(시작 순).
 * 모든 블록 → 결석, 첫 블록은 덮고 마지막은 아님 → 지각(늦게 옴), 마지막은 덮고 첫 블록은 아님 → 조퇴(일찍 감),
 * 그 밖(가운데만·처음과 끝만)·덮은 블록 없음 → ''(종류로 세지 않지만 학습량에는 빠진 블록으로 남는다). 블록이 없는 날은 'ALL'만 결석.
 */
function attResultByBlocks_(spec, blocks) {
  var p = parseBlockSpec_(spec), list = blocks || [];
  if (!list.length) return p.all ? '결석' : '';
  var cov = list.map(function (b) { return blockSpecCovers_(p, b); });
  if (cov.every(Boolean)) return '결석';
  var first = cov[0], last = cov[cov.length - 1];
  return first && !last ? '지각' : last && !first ? '조퇴' : '';
}

/** 격자 결과 선택지: 설정 유형 목록(exception.types) 중 결과 유형만, 설정 순서대로. → [{type, kind, mark, recognized}] */
function attResultChoices_(types) {
  return (types || []).map(ruleStr_).filter(function (t) { return attResultKind_(t); }).map(function (t) {
    var r = attResultKind_(t);
    return { type: t, kind: r.kind, mark: r.mark, recognized: r.recognized };
  });
}

/**
 * 격자 한 칸(학생 × 날짜). plan = resolveDayPlan_ 결과, s = {exceptions(그 학생 행), fixedRows(effectiveFixedRows_ 결과), endType},
 * opts = resolveCell_ opts(typeShort 등).
 * → {date, operating, marks:[{seq, code, text}](출석부 칸과 같은 판정 — resolveStudentDay_), results:[{kind, mark, recognized, exceptionIds, types}],
 *    study:{blocks, studiedBlocks, minutes, studiedMinutes, missed:[{seq, code, text, minutes}]}, warnings}
 * - results: 그날(date) 확정 특이사항을 **종류마다 하루 1번**으로 묶는다(결정 81 총괄 가정: 여러 블록·여러 행의 미인정지각도 그날 지각 1회).
 *   결과 유형(attResultKind_)은 그 종류·인정 여부 그대로, 그 밖의 유형은 인정이고 종류는 덮은 블록으로(attResultByBlocks_, 결정 81).
 *   고정 일정 '학'·'가'는 results에 들지 않는다(학습량에서만 빠진 시간).
 *   결석이 있으면 그날은 결석 하나만(지각·조퇴는 세지 않음). 지각과 조퇴는 같은 날 둘 다 셀 수 있다. 한 종류에 인정·미인정 행이 섞이면 미인정
 *   (결정 81 총괄 가정 — 엄한 쪽). 순서: 결석·지각·조퇴.
 * - study(학습량, 선생님 지시): 그날 블록마다 출석부 칸 판정으로 — 사전 특이사항(EXC)·고정 일정 '학'·'가'(FIXED) 블록은 빠진 블록
 *   (블록 전체, ASSUMPTION: 블록 일부만 덮어도 그 블록은 빠짐), 빈칸·23:00 종료(END)는 공부.
 *   minutes = 그 학생이 있어야 하는 시간(총괄 결정): 23:00 종료 학생의 마지막 블록은 opts.endTime(기본 23:00)까지만 — 빠진 블록이어도 같다.
 *   그래서 늘 studiedMinutes + missed 분 합 = minutes. missed에 빠진 블록과 칸 글자(약어·'학'·'가')를 남긴다.
 * - 운영 안 하는 날은 marks·results가 비고 study는 0, 그날 확정 특이사항이 있으면 경고(결정 81 총괄 가정: 세지 않는다).
 */
function attGridCell_(plan, s, opts) {
  s = s || {};
  var date = ruleStr_(plan && plan.date), operating = !!(plan && plan.operating);
  var exc = (s.exceptions || []).filter(function (e) { return e && ruleStr_(e.status) === '확정' && ruleStr_(e.date) === date; });
  var out = { date: date, operating: operating, marks: [], results: [], study: { blocks: 0, studiedBlocks: 0, minutes: 0, studiedMinutes: 0, missed: [] }, warnings: [] };
  if (!operating) {
    if (exc.length) out.warnings.push(date + ' 운영 안 하는 날의 특이사항 ' + exc.length + '건은 결과로 세지 않습니다');
    return out;
  }
  out.marks = resolveStudentDay_(plan, s, opts).map(function (m) { return { seq: m.seq, code: m.code, text: m.text }; });
  var by = {};
  exc.forEach(function (e) {
    var k = attResultKind_(e.type);
    if (!k) {   // 결정 81: 결과 유형이 아닌 빠짐(가정사유·학원·프로그램·기타)도 인정, 종류는 덮은 블록으로
      var kind = attResultByBlocks_(e.blocks, plan.blocks);
      if (!kind) return;
      k = { kind: kind, mark: { '결석': '×', '지각': '△', '조퇴': '조' }[kind], recognized: true };
    }
    var r = by[k.kind] = by[k.kind] || { kind: k.kind, mark: k.mark, recognized: true, exceptionIds: [], types: [] };
    r.recognized = r.recognized && k.recognized;
    r.exceptionIds.push(ruleStr_(e.id));
    if (r.types.indexOf(ruleStr_(e.type)) < 0) r.types.push(ruleStr_(e.type));
  });
  out.results = by['결석'] ? [by['결석']] : ['지각', '조퇴'].filter(function (k) { return by[k]; }).map(function (k) { return by[k]; });
  // 학습량의 전체 = 그 학생이 있어야 하는 시간(총괄 결정): 23:00 종료 학생의 마지막 블록은 종료 시각까지만(특이사항·고정 일정으로 빠져도 같다)
  // — 그래서 늘 studiedMinutes + 빠진 분 = minutes. 23:00 종료 여부는 특이사항·고정 일정을 뺀 칸 판정(resolveCell_ END)으로 본다
  var endMin = hmToMin_(hmNorm_((opts || {}).endTime) || '23:00'), st = out.study, blocks = plan.blocks || [];
  var weekdayKo = ymdWeekdayKo_(date);
  blocks.forEach(function (b, i) {
    var bs = hmToMin_(hmNorm_(b.start)), be = hmToMin_(hmNorm_(b.end)), m = out.marks[i] || {};
    var ends = resolveCell_({ block: b, isLastBlock: i === blocks.length - 1, dayType: plan.dayType, weekdayKo: weekdayKo, dayEnd: plan.end,
      exceptions: [], fixedRows: [], endType: s.endType, opts: opts }).code === 'END';
    var len = ends ? Math.max(0, Math.min(be, endMin) - bs) : be - bs;
    st.blocks++; st.minutes += len;
    if (m.code === 'EXC' || m.code === 'FIXED') { st.missed.push({ seq: b.seq, code: m.code, text: m.text, minutes: len }); return; }
    st.studiedBlocks++; st.studiedMinutes += len;
  });
  return out;
}

/**
 * 격자 칸들(attGridCell_ 결과, 한 학생의 날짜 범위)의 누적.
 * → {결석:{인정, 미인정}, 지각:{…}, 조퇴:{…}, 학습량:{days, blocks, studiedBlocks, minutes, studiedMinutes, missedMinutes:{칸 글자: 분}}}
 * 결석·지각·조퇴는 칸마다 종류당 1. 학습량은 운영한 날의 블록·분 합, missedMinutes는 빠진 까닭(칸 글자 — '가정'·'학원'·'학'·'무지' 등)별 분.
 */
function attResultTotals_(cells) {
  var t = {};
  ['결석', '지각', '조퇴'].forEach(function (k) { t[k] = { '인정': 0, '미인정': 0 }; });
  var s = t['학습량'] = { days: 0, blocks: 0, studiedBlocks: 0, minutes: 0, studiedMinutes: 0, missedMinutes: {} };
  (cells || []).forEach(function (c) {
    if (!c) return;
    (c.results || []).forEach(function (r) { if (t[r.kind]) t[r.kind][r.recognized ? '인정' : '미인정']++; });
    if (!c.operating || !c.study) return;
    s.days++;
    ['blocks', 'studiedBlocks', 'minutes', 'studiedMinutes'].forEach(function (k) { s[k] += c.study[k]; });
    c.study.missed.forEach(function (m) { s.missedMinutes[m.text] = (s.missedMinutes[m.text] || 0) + m.minutes; });
  });
  return t;
}

/** 격자 결과의 묶음(group_id, 결정 22): 같은 학생·같은 날 = 한 묶음(하루 1OUT, 총괄 답 ①). 날짜가 다르면 다른 묶음. */
function attResultGroupId_(studentId, ymd) {
  var sid = ruleStr_(studentId), d = ruleStr_(ymd);
  if (!sid || !ymdIsValid_(d)) throw new Error('학생·날짜가 필요합니다: ' + sid + ' ' + d);
  return 'F11:' + sid + ':' + d;
}

/**
 * 결과를 저장할 때 대체(취소)할 사전 특이사항(총괄 답 ⑤): 같은 학생·같은 날의 살아 있는(요청·확정) 행 중 블록이 결과 블록과 겹치는 것.
 * 겹치지 않는 부분 특이사항은 둘 다 둔다. 'ALL'은 무엇과도 겹친다(맞닿기만 하면 겹치지 않음 — blockSpecCovers_와 같음).
 * → [id](행 순서). 결과 블록 표기가 틀리면 Error. keepIds(선택)에 든 행(같은 저장에서 그대로 두는 행)은 빼고 본다.
 */
function attResultReplaces_(exceptions, studentId, ymd, blocks, keepIds) {
  var p = parseBlockSpec_(blocks);
  if (p.errors.length) throw new Error(p.errors[0]);
  var sid = ruleStr_(studentId), d = ruleStr_(ymd), keep = (keepIds || []).map(ruleStr_);
  return (exceptions || []).filter(function (e) {
    if (!e || ruleStr_(e.student_id) !== sid || ruleStr_(e.date) !== d || keep.indexOf(ruleStr_(e.id)) >= 0) return false;
    var st = ruleStr_(e.status);
    if (st !== '요청' && st !== '확정') return false;
    var q = parseBlockSpec_(e.blocks);
    if (p.all) return true;
    return p.ranges.some(function (r) { return blockSpecCovers_(q, r); });
  }).map(function (e) { return ruleStr_(e.id); });
}

/**
 * 격자에 결과를 쓸 수 있는 칸인지(총괄 답: 끝난 기간은 종료 후 14일까지). term = 그 날짜가 속한 기간(terms 행), ymd = 칸 날짜, today.
 * → {ok, reason}. 날짜가 기간 밖·오늘보다 뒤(아직 오지 않은 날의 결과)·종료일 + graceDays(기본 14) 지남이면 거부.
 */
function attGridWritable_(term, ymd, today, graceDays) {
  var d = ruleStr_(ymd), t = ruleStr_(today), s = ruleStr_(term && term.start_date), e = ruleStr_(term && term.end_date);
  var g = graceDays === undefined || graceDays === null || graceDays === '' ? 14 : Number(graceDays);
  if (!ymdIsValid_(d) || !ymdIsValid_(t)) return { ok: false, reason: '날짜 형식이 아닙니다' };
  if (!ymdIsValid_(s) || !ymdIsValid_(e) || d < s || d > e) return { ok: false, reason: d + '은(는) 이 기간의 날짜가 아닙니다' };
  if (d > t) return { ok: false, reason: '아직 오지 않은 날의 결과는 적을 수 없습니다' };
  if (!(g >= 0) || g % 1 !== 0) throw new Error('graceDays는 0 이상 정수: ' + graceDays);
  if (t > ymdAddDays_(e, g)) return { ok: false, reason: '기간이 끝나고 ' + g + '일이 지나 결과를 고칠 수 없습니다' };
  return { ok: true, reason: '' };
}
