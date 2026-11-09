/**
 * F6 입퇴실 저장(2단계, CODING-B). 전역 이름 접두어 inout. docs/plan/stage2.md 2절 C18a.
 * 규칙(퇴실 정리·적용일·상태 검사)은 src/rules/MoveRules.gs의 movePlan_이 정한다. 저장은 Meals.gs의 foodWrite_(F7과 같은 쓰기)를 쓴다.
 * 결과의 toCancel·toRestore·rows·warnings·errors 모양에만 기대고 규칙 안쪽은 복사하지 않는다. 메일은 보내지 않는다.
 */

var INOUT_TYPES = ['학사 입실', '학사 퇴실', '기숙사 입실', '기숙사 퇴실', '학사 및 기숙사 퇴실'];

/** 규칙·검사가 준 문장 속 숫자 날짜(yyyy-MM-dd)를 "3월 5일(금)"로 바꿔 교사에게 보인다 */
function inoutKo_(text) {
  return String(text).replace(/\d{4}-\d{2}-\d{2}/g, function (d) { return ymdIsValid_(d) ? foodDateKo_(d) : d; });
}

/** 그 상태에서 고를 수 있는 유형(순수). 학사 퇴실은 기숙사생에게 꺼 두고 안내(결정 50), 입실 유형은 입실할 수 있을 때만 보인다 */
function inoutTypeChips_(hall, dorm) {
  var inHall = hall === '입실', inDorm = dorm === '입실';
  var out = [];
  if (!inHall) out.push({ type: '학사 입실', enabled: true, hint: '' });
  if (inHall && !inDorm) out.push({ type: '기숙사 입실', enabled: true, hint: '' });
  out.push({ type: '학사 퇴실', enabled: inHall && !inDorm, hint: inHall && inDorm ? "기숙사생은 '학사 퇴실'만 할 수 없습니다. '학사 및 기숙사 퇴실'로 신청해 주세요." : (inHall ? '' : '이미 학사 퇴실 상태입니다.') });
  out.push({ type: '기숙사 퇴실', enabled: inDorm, hint: inDorm ? '' : '기숙사에 입실한 학생이 아닙니다.' });
  out.push({ type: '학사 및 기숙사 퇴실', enabled: inHall && inDorm, hint: inHall && inDorm ? '' : '학사·기숙사에 모두 입실한 학생만 고를 수 있습니다.' });
  return out;
}

/**
 * 입력 검사(순수). input = {studentId, type, requestedAt, effectiveDate, dinner, breakfastWithDorm, breakfastStopWithDorm, reason, docSubmitted}
 * → {errors:[{field, message}], rec}. 신청 일시는 날짜+시각 전체(미래 거부), 학사 퇴실 계열은 석식 선택이 필수(기본값 없음).
 */
function inoutValidate_(input, ctx) {
  input = input || {};
  var errors = [], err = function (field, message) { errors.push({ field: field, message: message }); };
  var studentId = String(input.studentId || '').trim();
  if (!studentId) err('studentId', '학생을 골라 주세요.');
  var type = String(input.type || '');
  if (INOUT_TYPES.indexOf(type) < 0) err('type', '입퇴실 유형을 골라 주세요.');
  var at = foodNormAt_(input.requestedAt);
  if (!at) err('requestedAt', '신청 일시를 날짜와 시각까지 입력해 주세요(예: 2027-03-03T10:45).');
  else if (at > ctx.now) err('requestedAt', '신청 일시가 지금보다 늦습니다. 서류를 받은 날짜·시각을 입력해 주세요.');
  var eff = String(input.effectiveDate || '').trim();
  if (!ymdIsValid_(eff)) err('effectiveDate', '적용일을 날짜로 입력해 주세요.');
  var hallLeave = type === '학사 퇴실' || type === '학사 및 기숙사 퇴실';
  var dinner = String(input.dinner || '');
  if (hallLeave && dinner !== '중단' && dinner !== '일반 석식') err('dinner', '석식을 골라 주세요(중단 또는 일반 석식으로).');
  var reason = String(input.reason || '').trim();
  if (reason.length > EXC_REASON_MAX) err('reason', '사유는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.');
  return { errors: errors, rec: errors.length ? null : {
    studentId: studentId, type: type, requestedAt: at, effectiveDate: eff, dinner: dinner, reason: reason, doc: input.docSubmitted === true,
    breakfastWithDorm: input.breakfastWithDorm !== false, breakfastStopWithDorm: input.breakfastStopWithDorm !== false
  } };
}

/** 확인창용 한 줄들(순수): 날짜를 크게 보이는 lead와 바뀌는 것 목록 */
function inoutSummary_(rec, plan) {
  var lead = foodDateKo_(rec.effectiveDate) + '부터 ' + rec.type;
  var lines = [];
  if (rec.type === '학사 퇴실' || rec.type === '학사 및 기숙사 퇴실') lines.push('자리 공석');
  plan.rows.slice(1).forEach(function (r) {
    var d = foodDateKo_(r.effective_date);
    if (r.item === '기숙사') lines.push('기숙사 ' + d + ' ' + r.value);
    else if (r.item === '조식') lines.push(r.value === '미실시' ? '조식 ' + d + ' 중단' : '조식 ' + d + '부터 ' + r.value);
    else if (r.item === '석식') lines.push(r.value === '미실시' ? '석식 ' + d + ' 중단' : '석식 ' + d + '부터 ' + r.value);
  });
  if (plan.toCancel.length) lines.push('대체되어 취소되는 대기 신청 ' + plan.toCancel.length + '개');
  if (plan.toRestore.length) lines.push('다시 살아나는 신청 ' + plan.toRestore.length + '개');
  return { lead: lead, lines: lines };
}

function inoutSignature_(plan) {
  return JSON.stringify({
    r: plan.rows.map(function (r) { return [r.item, r.value, r.effective_date, r.source]; }),
    c: plan.toCancel.map(function (c) { return c.id; }).sort(), s: plan.toRestore.map(function (c) { return c.id; }).sort(),
    e: plan.errors, w: plan.warnings
  });
}

/**
 * 검사 + 계획(미리보기·저장 공용). 기간은 적용일이 속한 기간(없으면 곧 시작하는 기간, 결정 60과 같은 방식)이고
 * 끝난 기간·명단 밖 학생은 오류. permYmd = 권한 검사 날짜(기간 안의 날짜).
 */
function inoutCheck_(input, d) {
  var today = today_();
  var v = inoutValidate_(input, { now: nowIso_() });
  if (v.errors.length) return { errors: v.errors, permYmd: '' };
  var rec = v.rec;
  var term = foodTermFor_(rec.studentId, rec.effectiveDate, d.terms, d.enrollments);   // 급식 신청과 같은 기간 판정(결정 60 보충)
  var errors = [];
  if (!term) errors.push({ field: 'effectiveDate', message: '적용일이 속한 운영 기간이 없습니다.' });
  else if (term.end_date < today) errors.push({ field: 'effectiveDate', message: '"' + term.name + '"은(는) 끝난 기간입니다. 끝난 기간의 입퇴실은 받지 않습니다.' });
  else if (!d.enrollments.some(function (e) { return e.term_id === term.id && e.student_id === rec.studentId; })) {
    errors.push({ field: 'studentId', message: '"' + term.name + '" 명단에 없는 학생입니다. 관리자에게 명단 등록을 요청해 주세요.' });
  }
  var permYmd = foodPermYmd_(term, rec.effectiveDate);
  if (errors.length) return { errors: errors, rec: rec, term: term, eff: rec.effectiveDate, permYmd: permYmd };
  var plan = movePlan_(d.changes, rec.studentId, { type: rec.type, effectiveDate: rec.effectiveDate, requestedAt: rec.requestedAt, dinner: rec.dinner,
    breakfastWithDorm: rec.breakfastWithDorm, breakfastStopWithDorm: rec.breakfastStopWithDorm }, { today: today, cutoff: d.cutoff });
  plan.errors = plan.errors.map(inoutKo_);
  plan.warnings = plan.warnings.map(inoutKo_);
  return { errors: plan.errors.map(function (m) { return { field: 'type', message: m }; }), rec: rec, term: term, eff: rec.effectiveDate, plan: plan, permYmd: permYmd };
}

function inoutAuthorize_(input, c) { return foodAuthorize_(input, c); }   // 다른 기간 담당교사 안내 포함

/** 유형 → 대표 행의 항목·값·적용일 */
function inoutHeadOf_(type, eff) {
  var m = /^(학사|기숙사)( 및 기숙사)? (입실|퇴실)$/.exec(type);
  return { item: m[1], value: m[3], effective_date: eff };
}

/** 같은 입퇴실 신청서(학생·항목·값·적용일·신청 일시, F6 대표 행)가 이미 있나 — 다시 눌러도 한 번만 쓴다 */
function inoutFindDuplicate_(rec, head, changes) {
  return changes.filter(function (c) {
    return c.item === head.item && c.value === head.value && c.effective_date === head.effective_date && c.requested_at === rec.requestedAt &&
      c.source === 'F6' && !String(c.linked_change_id || '') && String(c.status || '유효') === '유효';
  })[0] || null;
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/** 학생 한 명의 오늘 값과 지금 고를 수 있는 입퇴실 유형(보기 범위: status.view) */
function getMoveContext(studentId) {
  requirePermission_('status.view', { studentId: studentId });
  var today = today_();
  var rows = readAll_('status_changes').filter(function (c) { return c.student_id === studentId; });
  var now = {};
  ['학사', '기숙사', '조식', '석식'].forEach(function (it) { now[it] = statusOn_(rows, studentId, it, today); });
  return { today: today, now: now, types: inoutTypeChips_(now['학사'], now['기숙사']) };
}

/** 저장 전 확인: 적용일·바뀌는 것·경고. 아무것도 쓰지 않는다. */
function previewMove(input) {
  requirePermission_('status.list');
  var d = foodLoad_(String((input && input.studentId) || ''));
  var c = inoutCheck_(input, d);
  inoutAuthorize_(input, c);
  if (!c.plan) return { ok: false, errors: c.errors, now: nowIso_() };
  var s = inoutSummary_(c.rec, c.plan);
  return { ok: !c.errors.length, errors: c.errors, warnings: c.plan.warnings, lead: s.lead, lines: s.lines, now: nowIso_(),
    cancel: c.plan.toCancel.length, restore: c.plan.toRestore.length, expect: inoutSignature_(c.plan) };
}

/**
 * 입퇴실 저장. 락 안에서 다시 읽고 다시 계획한다(화면 값을 믿지 않는다). 첫 줄은 역할만(status.list), 학생 범위(status.edit)는 계획한 기간으로
 * 락 안에서 판정한다. 같은 신청서가 이미 있으면 {ok:true, duplicate:true}. expect와 계획이 다르면 {stale:true}.
 * 대표 행(F6, 서류 TRUE/FALSE) + 연결 행(규칙이 준 source 그대로, linked_change_id) + 대체된 대기 행 취소 + 되살림(toRestore). 메일 없음.
 */
function saveMove(input, expect) {
  requirePermission_('status.list');
  return withLock_(function () {
    ['terms', 'students', 'enrollments', 'status_changes'].forEach(function (n) { invalidate_('db', n); });
    invalidate_('config', 'settings');
    var d = foodLoad_(String((input && input.studentId) || ''));
    var c = inoutCheck_(input, d);
    var user = inoutAuthorize_(input, c);
    // 같은 신청서를 다시 보내면(다시 누르기·재시도) 이미 퇴실 상태라 상태 오류가 나므로, 오류보다 먼저 중복을 본다
    var dup = c.rec ? inoutFindDuplicate_(c.rec, inoutHeadOf_(c.rec.type, c.rec.effectiveDate), d.changes) : null;
    if (dup) return { ok: true, duplicate: true, id: dup.id, lead: foodDateKo_(c.rec.effectiveDate) + '부터 ' + c.rec.type, doc: c.rec.doc };
    if (!c.plan || c.errors.length) return { ok: false, errors: c.errors };
    var rec = c.rec, plan = c.plan, head = plan.rows[0];
    var s = inoutSummary_(rec, plan);
    if (String(expect || '') !== inoutSignature_(plan)) return { ok: false, stale: true, error: '확인한 뒤 다른 변경이 있었습니다. 다시 확인해 주세요.' };
    var w = foodWrite_({
      student_id: rec.studentId, item: head.item, value: head.value, requested_at: head.requested_at, effective_date: head.effective_date,
      effective_date_auto: head.effective_date_auto, reason: rec.reason, doc_submitted: rec.doc ? 'TRUE' : 'FALSE', source: 'F6'
    }, plan.rows.slice(1).map(function (r) {
      return { item: r.item, value: r.value, effective_date: r.effective_date, effective_date_auto: r.effective_date_auto, requested_at: r.requested_at,
        reason: r.reason, source: r.source };
    }), plan.toCancel, user.email, plan.toRestore);
    return { ok: true, id: w.head.id, lead: s.lead, lines: s.lines, cancelCount: plan.toCancel.length, restoreCount: plan.toRestore.length, doc: rec.doc };
  });
}
