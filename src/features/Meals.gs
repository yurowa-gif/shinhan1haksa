/**
 * F7 급식 변경 저장(2단계, CODING-B). 전역 이름 접두어 food. docs/plan/stage2.md 2절 C17a.
 * 규칙(적용일·취소·이어 쓰기)은 src/rules/MealRules.gs의 mealPlanChange_가 정한다. 여기는 입력 검사·권한·락 안 다시 계획·쓰기만 한다.
 * 메일은 보내지 않는다. 학생 기록 보기·서류는 C17b, 입퇴실(F6)은 C18a가 같은 foodWrite_로 쓴다.
 */

/** 화면 칩 → (item, value). 값 글자는 docs/contracts/vocabulary.md */
var FOOD_CHIPS = [
  { id: 'b_on', label: '조식 실시', item: '조식', value: '실시' },
  { id: 'b_off', label: '조식 미실시', item: '조식', value: '미실시' },
  { id: 'd_hall', label: '석식 실시', item: '석식', value: '학사 석식' },
  { id: 'd_off', label: '석식 미실시', item: '석식', value: '미실시' },
  { id: 'd_gen', label: '일반 석식으로 변경', item: '석식', value: '일반 석식' }
];

var FOOD_RULE_TEXT = {
  same_day: '마감 시각 전 신청이라 신청일 당일부터 적용됩니다.',
  next_day: '마감 시각 이후 신청이라 다음 날부터 적용됩니다.',
  next_monday: '월·화 신청이라 다음 주 월요일부터 적용됩니다.',
  monday_after_next: '수~일 신청이라 다다음 주 월요일부터 적용됩니다.',
  initial: '지금 그 급식이 없어 신청일부터 적용됩니다.',
  manual: '선생님이 직접 고친 날짜입니다.'
};

/**
 * 교사 홈의 급식·서류 카드(getHomeData가 부른다). 서류 미제출 = 이번 기간 등록 학생의 유효한 대표 행 중 doc_submitted FALSE.
 * 입력한 사람이 아니라 담당교사 기준(관리자 홈은 전체). 담임은 숫자 없이 열람 링크만 쓴다.
 */
function foodHomeInfo_(user, role) {
  if (role !== 'admin' && role !== 'hall_teacher') return {};
  var term = getCurrentTerm_();
  if (!term) return { docMissing: 0 };
  var mineIds = {};
  readAll_('enrollments').forEach(function (e) {
    if (e.term_id === term.id && (role === 'admin' || normalizeEmail_(e.teacher_email) === user.email)) mineIds[e.student_id] = true;
  });
  return { docMissing: readAll_('status_changes').filter(function (c) { return foodIsMissingDoc_(c) && mineIds[c.student_id]; }).length };
}

/* ───────────── 순수·읽기 도우미 ───────────── */

/** 설정 meal.morning_cutoff. 비어 있으면 기본값, 시각이 아니면 기본값으로 바꾸지 않고 오류(조용히 다른 마감으로 계산하지 않게). */
function foodCutoff_(settingRows) {
  var raw = '';
  (settingRows || []).forEach(function (r) { if (String(r.key || '').trim() === 'meal.morning_cutoff') raw = String(r.value || '').trim(); });
  if (!raw) DEFAULT_SETTINGS.forEach(function (s) { if (s[0] === 'meal.morning_cutoff') raw = s[1]; });
  var hm = hmNorm_(raw);
  if (!hm) throw new Error('설정 "meal.morning_cutoff" 값("' + raw + '")이 시각(예: 11:30)이 아닙니다. 설정을 고친 뒤 다시 시도해 주세요.');
  return hm;
}

/** 'yyyy-MM-ddTHH:mm(:ss)'만 받는다(Z·오프셋·공백 구분은 거부). → 'yyyy-MM-ddTHH:mm:ss' 또는 '' */
function foodNormAt_(s) {
  var m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.exec(String(s === undefined || s === null ? '' : s).trim());
  if (!m || !ymdIsValid_(m[1])) return '';
  return m[1] + 'T' + m[2] + ':' + m[3] + (m[4] || ':00');
}

/** 권한 검사에 넘길 신청일(yyyy-MM-dd). 형식이 아니면 ''(오늘의 기간) — 형식 오류는 검사 단계가 알려 준다 */
function foodYmd_(input) {
  var d = String((input && input.requestedAt) || '').slice(0, 10);
  return ymdIsValid_(d) ? d : '';
}

function foodDateKo_(ymd) {
  var p = ymd.split('-');
  return (+p[1]) + '월 ' + (+p[2]) + '일(' + ymdWeekdayKo_(ymd) + ')';
}

function foodChip_(id) {
  return FOOD_CHIPS.filter(function (c) { return c.id === id; })[0] || null;
}

/**
 * 입력 검사(순수). input = {studentId, chip, requestedAt, effectiveDate, reason, docSubmitted}
 * ctx = {now, terms, enrollments} → {errors:[{field, message}], rec, term}
 * 적용일이 자동 계산값과 같은지는 계획을 세운 뒤 foodPlan_이 본다(사유 필수 여부도 거기서).
 */
function foodValidate_(input, ctx) {
  input = input || {};
  var errors = [];
  var err = function (field, message) { errors.push({ field: field, message: message }); };
  var studentId = String(input.studentId || '').trim();
  if (!studentId) err('studentId', '학생을 골라 주세요.');
  var chip = foodChip_(String(input.chip || ''));
  if (!chip) err('chip', '무엇을 바꿀지 골라 주세요.');
  var at = foodNormAt_(input.requestedAt);
  if (!at) err('requestedAt', '신청 일시를 날짜와 시각까지 입력해 주세요(예: 2027-03-03T10:45).');
  else if (at > ctx.now) err('requestedAt', '신청 일시가 지금보다 늦습니다. 서류를 받은 날짜·시각을 입력해 주세요.');
  var eff = String(input.effectiveDate || '').trim();
  if (eff && !ymdIsValid_(eff)) err('effectiveDate', '적용일을 날짜로 입력해 주세요.');
  else if (eff && at && eff < at.slice(0, 10)) err('effectiveDate', '적용일은 신청일 이후여야 합니다.');
  var term = null;
  if (studentId && at) {
    // 기간 사이(예: 2/28 끝·3/2 시작 사이 3/1)에 받은 신청은 곧 시작하는 기간의 명단으로 본다
    term = termOnDate_(at.slice(0, 10), ctx.terms) || ctx.terms.filter(function (t) { return t.start_date > at.slice(0, 10); })
      .sort(function (x, y) { return x.start_date < y.start_date ? -1 : 1; })[0] || null;
    if (!term) err('requestedAt', '그 날짜가 속한 운영 기간이 없습니다.');
    else if (term.end_date < ctx.today) err('requestedAt', '"' + term.name + '"은(는) 끝난 기간입니다. 끝난 기간의 급식 신청은 받지 않습니다.');
    else if (!ctx.enrollments.some(function (e) { return e.term_id === term.id && e.student_id === studentId; })) {
      err('studentId', '"' + term.name + '" 명단에 없는 학생입니다. 명단 올리기에서 먼저 등록해 주세요.');
    }
  }
  return { errors: errors, term: term, rec: chip && at ? {
    studentId: studentId, item: chip.item, value: chip.value, chipLabel: chip.label, requestedAt: at, effectiveDate: eff,
    reason: String(input.reason || '').trim(), doc: input.docSubmitted === true
  } : null };
}

/**
 * 계획 하나를 세운다(순수). 고친 적용일이 자동 계산과 같으면 자동으로 취급한다(사유 불필요).
 * → {errors, plan, manual}. plan은 mealPlanChange_ 결과.
 */
function foodPlan_(rec, changes, today, cutoff) {
  var opts = { today: today, cutoff: cutoff };
  var plan = mealPlanChange_(changes, rec.studentId, rec.item, rec.value, rec.requestedAt, opts);
  var manual = !!rec.effectiveDate && rec.effectiveDate !== plan.autoDate;
  var errors = [];
  if (manual) {
    if (rec.reason.length < 2) errors.push({ field: 'reason', message: '적용일을 고친 사유를 2자 이상 적어 주세요.' });
    plan = mealPlanChange_(changes, rec.studentId, rec.item, rec.value, rec.requestedAt,
      { today: today, cutoff: cutoff, effectiveDate: rec.effectiveDate });
  }
  return { errors: errors, plan: plan, manual: manual };
}

/** 화면에 보이는 이유 한 줄(screens.md F7-1) */
function foodReasonText_(plan, manual, today, cutoff) {
  var when = plan.date === today ? '오늘(' + foodDateKo_(plan.date) + ')' : foodDateKo_(plan.date);
  var text = when + '부터 적용됩니다. ' + (FOOD_RULE_TEXT[manual ? plan.rule : plan.rule] || '');
  if (manual) text += ' 자동 계산: ' + foodDateKo_(plan.autoDate) + '.';
  else if (plan.rule === 'same_day') text = when + '부터 적용됩니다. ' + cutoff + ' 전 신청입니다.';
  else if (plan.rule === 'next_day') text = when + '부터 적용됩니다. ' + cutoff + ' 이후 신청이라 다음 날부터입니다.';
  return text;
}

/** 저장 직전 화면 값과 락 안 계획이 같은지 보는 서명. 쓸 행(적용일·취소할 행·이어 쓸 행)이 하나라도 달라지면 달라진다. */
function foodSignature_(plan) {
  return JSON.stringify({
    d: plan.date, k: plan.kind, b: plan.blocked, s: plan.superseded,
    c: plan.toCancel.map(function (c) { return c.id; }).sort(),
    f: plan.followUps.map(function (f) { return [f.item, f.value, f.effective_date, f.source]; })
  });
}

function foodLoad_(studentId) {
  var all = readAll_('status_changes');
  return {
    terms: readAll_('terms'), enrollments: readAll_('enrollments'),
    changes: all.filter(function (c) { return c.student_id === studentId; }),
    cutoff: foodCutoff_(readAll_('settings', 'config'))
  };
}

/** 미리보기·저장이 같이 쓰는 검사 + 계획. → {errors, rec, term, plan, manual} (오류가 있으면 plan 없음) */
function foodCheck_(input, d) {
  var v = foodValidate_(input, { now: nowIso_(), today: today_(), terms: d.terms, enrollments: d.enrollments });
  if (v.errors.length) return { errors: v.errors };
  var p = foodPlan_(v.rec, d.changes, today_(), d.cutoff);
  return { errors: p.errors, rec: v.rec, term: v.term, plan: p.plan, manual: p.manual };
}

/** 서류 미제출 대표 행: 유효 + 연결 행 아님 + doc_submitted FALSE. 명단업로드 행은 서류가 없으므로(가짜 데이터에 FALSE가 남아 있어도) 세지 않는다 */
function foodIsMissingDoc_(c) {
  return String(c.status || '유효') === '유효' && c.source !== '명단업로드' && !String(c.linked_change_id || '') && String(c.doc_submitted).toUpperCase() === 'FALSE';
}

/** 현황표 비고 문장(real-layout-2025.md): "3.3 석식 미실시(3.15~)" 쉼표로 이음. 신청 행만(명단·연결 행·취소 제외), 신청 일시 순 */
function foodRemark_(rows) {
  var md = function (ymd) { var p = String(ymd).split('-'); return (+p[1]) + '.' + (+p[2]); };
  return (rows || []).filter(function (c) {
    return String(c.status || '유효') === '유효' && c.source !== '명단업로드' && !String(c.linked_change_id || '') && (c.source === 'F6' || c.source === 'F7') && ymdIsValid_(String(c.effective_date)) &&
      ymdIsValid_(String(c.requested_at).slice(0, 10));
  }).sort(function (a, b) { return a.requested_at < b.requested_at ? -1 : a.requested_at > b.requested_at ? 1 : 0; }).map(function (c) {
    return md(String(c.requested_at).slice(0, 10)) + ' ' + c.item + ' ' + c.value + '(' + md(c.effective_date) + '~)';
  }).join(', ');
}

/* ───────────── 쓰기 ───────────── */

/**
 * status_changes에 쓴다(F7·F6 공용). 반드시 withLock_ 안에서 부른다.
 *  head: 대표 행 데이터(id는 만들어진다). linked: 연결 행 데이터 배열(linked_change_id = 대표 id, doc_submitted '' 이 기본).
 *  cancels: [{id, cancel_reason}] — status '취소', cancel_reason = '[자동] <대표 id> <사유>'(되살릴 때 꼬리표로 찾는다).
 *  행마다 appendRecord_(audit create), 취소는 bulkUpdateRecords_(audit bulk_update). 지우지 않는다.
 * → {head, linked}
 */
function foodWrite_(head, linked, cancels, actorEmail) {
  var base = { linked_change_id: '', doc_submitted: '', status: '유효', memo: '', cancel_reason: '' };
  var h = appendRecord_('status_changes', Object.assign({}, base, head), actorEmail);
  var rows = (linked || []).map(function (l) {
    return appendRecord_('status_changes', Object.assign({}, base, { student_id: h.student_id, requested_at: h.requested_at }, l,
      { linked_change_id: h.id }), actorEmail);
  });
  if (cancels && cancels.length) {
    bulkUpdateRecords_('status_changes', cancels.map(function (c) {
      return { id: c.id, patch: { status: '취소', cancel_reason: '[자동] ' + h.id + ' ' + (c.cancel_reason || '새 신청으로 대체') } };
    }), actorEmail);
  }
  return { head: h, linked: rows };
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 급식 변경 화면 시작값: 지금 시각·마감·칩·이 사람이 신청할 수 있는 학생(관리자 = 이번 기간 전체, 학사 교사 = 담당 학생)과 각자의 오늘 값.
 * 담임·출결 담당은 화면은 열지만 학생 목록이 비고 canEdit false(쓰기는 status.edit이 막는다).
 */
function getMealContext() {
  var user = requirePermission_('status.list');
  var term = getCurrentTerm_();
  var today = today_();
  var out = { now: nowIso_(), today: today, cutoff: foodCutoff_(readAll_('settings', 'config')),
    term: term ? { id: term.id, name: term.name } : null, canEdit: false,
    chips: FOOD_CHIPS.map(function (c) { return { id: c.id, label: c.label }; }), students: [], viewStudents: [] };
  if (!term) return out;
  var editRule = permissions_()['status.edit'], viewRule = permissions_()['status.view'];
  out.canEdit = user.roles.some(function (r) { return editRule.roles.indexOf(r) >= 0; });
  var studentById = {};
  readAll_('students').forEach(function (s) { studentById[s.id] = s; });
  var changes = readAll_('status_changes');
  var seen = {};
  readAll_('enrollments').forEach(function (e) {
    var s = studentById[e.student_id];
    if (e.term_id !== term.id || !s || seen[s.id]) return;
    var facts = { isEnrolled: true, isAssigned: normalizeEmail_(e.teacher_email) === user.email, isOnDuty: false,
      inHomeroom: sameClass_(user.homeroomClass, s.grade, s.class_no) };
    var canView = canAccessStudentByFacts_(user.roles, facts, viewRule.roles, true);
    var canEdit = out.canEdit && canAccessStudentByFacts_(user.roles, facts, editRule.roles);
    if (!canView && !canEdit) return;
    seen[s.id] = true;
    var item = { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no };
    if (canView) out.viewStudents.push(item);
    if (canEdit) {
      var st = {};
      ['학사', '기숙사', '조식', '석식'].forEach(function (it) { st[it] = statusOn_(changes, s.id, it, today); });
      out.students.push(Object.assign({ status: st }, item));
    }
  });
  var bySerial = function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); };
  out.students.sort(bySerial); out.viewStudents.sort(bySerial);
  return out;
}

/** 저장 전 확인: 적용일·이유·같이 취소될 행·이어 쓸 행·경고. 아무것도 쓰지 않는다. */
function previewMealChange(input) {
  requirePermission_('status.edit', { studentId: input && input.studentId, ymd: foodYmd_(input) });
  var c = foodCheck_(input, foodLoad_(String(input.studentId)));
  if (!c.plan) return { ok: false, errors: c.errors };
  var plan = c.plan;
  var ok = !c.errors.length && !plan.blocked;   // 덮인 신청서(superseded)도 기록으로 저장한다(결정 58)
  return {
    ok: ok, errors: c.errors, blocked: plan.blocked, superseded: plan.superseded, kind: plan.kind,
    date: plan.date, dateKo: plan.date ? foodDateKo_(plan.date) : '', autoDate: plan.autoDate, autoDateKo: foodDateKo_(plan.autoDate),
    manual: c.manual, rule: plan.rule, reasonText: plan.date ? foodReasonText_(plan, c.manual, today_(), foodLoad_(String(input.studentId)).cutoff) : '',
    warnings: plan.warnings, cancel: plan.toCancel.map(function (x) { return { date: x.effective_date, value: x.value }; }),
    followUps: plan.followUps.map(function (f) { return { item: f.item, value: f.value, date: f.effective_date }; }),
    label: c.rec.chipLabel, expect: foodSignature_(plan)
  };
}

/**
 * 급식 변경 저장. 락 안에서 다시 읽고 다시 계획한다(화면 값을 믿지 않는다).
 * expect(미리보기가 준 서명)와 계획이 다르면 {ok:false, stale:true}. blocked·superseded이면 쓰지 않는다.
 * 대표 행(source F7, 서류 TRUE/FALSE) + 이어 쓰기(규칙이 준 source 그대로) + 대체된 대기 행 취소. 메일은 없다.
 */
function saveMealChange(input, expect) {
  var user = requirePermission_('status.edit', { studentId: input && input.studentId, ymd: foodYmd_(input) });
  return withLock_(function () {
    ['terms', 'students', 'enrollments', 'status_changes'].forEach(function (n) { invalidate_('db', n); });
    invalidate_('config', 'settings');
    var c = foodCheck_(input, foodLoad_(String(input.studentId)));
    if (!c.plan || c.errors.length) return { ok: false, errors: c.errors };
    var plan = c.plan;
    if (plan.blocked) return { ok: false, blocked: plan.blocked };
    if (String(expect || '') !== foodSignature_(plan)) {
      return { ok: false, stale: true, error: '확인한 뒤 다른 변경이 있었습니다. 다시 확인해 주세요.' };
    }
    var rec = c.rec;
    // 결정 58: 더 새 신청에 덮인 신청서도 종이 기록으로 남긴다(status 취소). 덮은 행이 나중에 취소되면 되살릴 수 있다.
    // supersededBy는 규칙(R11a)이 주는 필드 — 아직 없으면 id 없이 꼬리표만 쓴다.
    var dead = plan.superseded ? { status: '취소', cancel_reason: '[자동] ' + ((plan.supersededBy || [])[0] ? plan.supersededBy[0] + ' ' : '') + '더 새 신청' } : {};
    var w = foodWrite_(Object.assign({
      student_id: rec.studentId, item: rec.item, value: rec.value, requested_at: rec.requestedAt,
      effective_date: plan.superseded ? (c.manual ? rec.effectiveDate : plan.autoDate) : plan.date,
      effective_date_auto: plan.autoDate, reason: c.manual ? rec.reason : '', doc_submitted: rec.doc ? 'TRUE' : 'FALSE', source: 'F7'
    }, dead), plan.followUps.map(function (f) {
      return { item: f.item, value: f.value, effective_date: f.effective_date, effective_date_auto: f.effective_date, source: f.source,
        reason: f.source === 'F6' ? '학사 퇴실 정리' : '재입실일부터 이어짐' };
    }), plan.toCancel.map(function (x) { return { id: x.id, cancel_reason: '새 신청으로 대체' }; }), user.email);
    return { ok: true, id: w.head.id, superseded: plan.superseded, date: plan.date, dateKo: plan.date ? foodDateKo_(plan.date) : '', label: rec.chipLabel, cancelCount: plan.toCancel.length,
      followUpCount: w.linked.length, doc: rec.doc };
  });
}

/**
 * 학생 한 명의 급식·입퇴실 기록(보기). 관리자·출결 담당·학사 교사 = 이번 기간 학사생 전체, 담임 = 우리 반(status.view).
 * memo는 내보내지 않는다(2OUT 연결 id가 들어 있을 수 있다). 서류 표시 버튼은 canMarkDoc(쓰기 권한)일 때만 켠다.
 */
function listStudentStatus(studentId) {
  var user = requirePermission_('status.view', { studentId: studentId });
  var today = today_();
  var rows = readAll_('status_changes').filter(function (c) { return c.student_id === studentId; });
  var student = findById_('students', studentId);
  var term = getCurrentTerm_();
  var enr = term ? readAll_('enrollments').filter(function (e) { return e.term_id === term.id && e.student_id === studentId; })[0] : null;
  var canEdit = user.roles.indexOf('admin') >= 0 || (user.roles.indexOf('hall_teacher') >= 0 && !!enr && normalizeEmail_(enr.teacher_email) === user.email);
  var live = rows.filter(function (c) { return String(c.status || '유효') === '유효' && ymdIsValid_(String(c.effective_date)); });
  var now = {};
  ['학사', '기숙사', '조식', '석식'].forEach(function (it) { now[it] = statusOn_(rows, studentId, it, today); });
  var view = function (c) {
    var head = !String(c.linked_change_id || '');
    return { id: c.id, item: c.item, value: c.value, requestedAt: c.requested_at, date: c.effective_date,
      edited: !!c.effective_date_auto && c.effective_date_auto !== c.effective_date, autoDate: c.effective_date_auto, reason: c.reason,
      doc: head ? String(c.doc_submitted).toUpperCase() : '', source: c.source, status: String(c.status || '유효'), cancelReason: c.cancel_reason,
      head: head, canMarkDoc: canEdit && foodIsMissingDoc_(c) };
  };
  return {
    student: { id: student.id, name: student.name, grade: +student.grade, classNo: student.class_no, number: student.number, studentNo: student.student_no },
    today: today, now: now, remark: foodRemark_(rows), canEdit: canEdit,
    pending: live.filter(function (c) { return c.effective_date > today; }).sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : 1; }).map(view),
    history: rows.slice().sort(function (a, b) { return String(b.requested_at || b.created_at) < String(a.requested_at || a.created_at) ? -1 : 1; }).map(view)
  };
}

/**
 * 서류 제출 표시(대표 행만 FALSE → TRUE). 행 id만 받으므로 첫 줄은 역할만 보고(status.list),
 * 락 안에서 행을 다시 읽은 뒤 그 학생에 대한 status.edit(담당교사·관리자)를 다시 확인한다.
 */
function setDocSubmitted(changeId) {
  var user = requirePermission_('status.list');
  return withLock_(function () {
    invalidate_('db', 'status_changes');
    var row = findById_('status_changes', String(changeId || ''));
    if (!row) return { ok: false, error: '기록을 찾을 수 없습니다.' };
    requirePermission_('status.edit', { studentId: row.student_id, ymd: ymdIsValid_(String(row.effective_date)) ? row.effective_date : '' });
    if (String(row.doc_submitted).toUpperCase() === 'TRUE' && !String(row.linked_change_id || '') && row.source !== '명단업로드') return { ok: true, already: true };
    if (!foodIsMissingDoc_(row)) return { ok: false, error: '서류 제출을 표시할 수 있는 신청 행이 아닙니다.' };
    updateRecord_('status_changes', row.id, { doc_submitted: 'TRUE' }, user.email);
    return { ok: true };
  });
}
