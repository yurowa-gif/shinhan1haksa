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
  var terms = readAll_('terms'), students = readAll_('students'), changes = readAll_('status_changes');
  var label = function (id) { var st = students.filter(function (x) { return x.id === id; })[0]; return st ? st.number + '. ' + st.name : '(알 수 없음)'; };
  if (role === 'admin' || role === 'hall_teacher') {
    var miss = foodMissingDocs_(changes, readAll_('enrollments'), terms);
    if (role === 'hall_teacher') miss = miss.filter(function (m) { return m.teacher === user.email; });
    var seen = {}, list = [];
    miss.forEach(function (m) {   // 학생·종류마다 한 줄(이메일·memo 없음)
      var kind = m.row.source === 'F6' ? '입퇴실' : '급식 변경', k = m.studentId + '|' + kind;
      if (!seen[k]) { seen[k] = true; list.push({ studentId: m.studentId, label: label(m.studentId), kind: kind }); }
    });
    var out = { docMissing: miss.length, docList: role === 'hall_teacher' ? list.slice(0, 10) : [] };
    if (role === 'admin') {   // 관리자 홈: 오늘 인원과 자습실·SA 공석(C19). 기숙사 정원 대비 공석은 넣지 않는다(F8)
      var tm = foodTermOf_(today_(), terms) || getCurrentTerm_();
      if (tm) {
        var tday = today_();
        var counts = mealCountsOn_(students, readAll_('enrollments'), changes, tm.id, tday);
        var all = counts.groups['전체'] || {};
        out.counts = { date: tday, hall: all.hall, dorm: all.dorm, dormMale: (counts.groups['남 합계'] || {}).dorm, dormFemale: (counts.groups['여 합계'] || {}).dorm,
          nonDorm: all.nonDorm, breakfast: all.breakfast, hallDinner: all.hallDinner, generalDinner: all.generalDinner };
        out.vacancy = foodVacancy_(tm, tday);
      }
    }
    return out;
  }
  if (role === 'homeroom') {   // 담임: 우리 반 이번 주 변경(보기만)
    var today = today_(), from = ymdMondayOf_(today), to = ymdAddDays_(from, 6);
    var term = foodTermOf_(today, terms) || getCurrentTerm_();
    var mine = {};
    if (term) readAll_('enrollments').forEach(function (e) { if (e.term_id === term.id) mine[e.student_id] = true; });
    var week = changes.filter(function (c) {
      var st = students.filter(function (x) { return x.id === c.student_id; })[0];
      return mine[c.student_id] && st && sameClass_(user.homeroomClass, st.grade, st.class_no) && String(c.status || '유효') === '유효' && c.source !== '명단업로드' &&
        !String(c.linked_change_id || '') && ymdIsValid_(String(c.effective_date)) && c.effective_date >= from && c.effective_date <= to;
    }).sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : 1; }).slice(0, 20).map(function (c) {
      return { studentId: c.student_id, label: label(c.student_id), what: c.item + ' ' + c.value, dateKo: foodDateKo_(c.effective_date), missing: foodIsMissingDoc_(c) };
    });
    return { week: week };
  }
  return {};
}

/** 자습실·SA 공간별 좌석 수와 공석 수(그날, 퇴실·미배정·미입실 모두 공석) */
function foodVacancy_(term, ymd) {
  var d = seatLoad_();
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, ymd);
  return d.spaces.slice().sort(function (a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); }).map(function (sp) {
    var mine = d.seats.filter(function (x) { return x.space_id === sp.id && x.kind === '좌석' && map.bySeat[x.id]; });
    return { name: sp.name, gender: sp.gender, total: mine.length, vacant: mine.filter(function (x) { return map.bySeat[x.id].vacant; }).length };
  });
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
 * 입력 검사(순수). input = {studentId, chip, requestedAt, effectiveDate, reason, docSubmitted}, ctx = {now}
 * 기간·명단 검사는 계획을 세운 뒤 foodCheck_가 한다(결정 60: 급식 신청의 기간 = 적용일이 속한 기간).
 * → {errors:[{field, message}], rec}
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
  var reason = String(input.reason || '').trim();
  if (reason.length > EXC_REASON_MAX) err('reason', '사유는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.');
  return { errors: errors, rec: chip && at ? {
    studentId: studentId, item: chip.item, value: chip.value, chipLabel: chip.label, requestedAt: at, effectiveDate: eff,
    reason: reason, doc: input.docSubmitted === true
  } : null };
}

/** 급식 신청의 기간(결정 60): 적용일이 속한 기간, 기간 사이(예: 3/1)면 곧 시작하는 기간. 없으면 null */
function foodTermOf_(ymd, terms) {
  return termOnDate_(ymd, terms) || terms.filter(function (t) { return t.start_date > ymd; })
    .sort(function (x, y) { return x.start_date < y.start_date ? -1 : 1; })[0] || null;
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
  if (manual) return when + '부터 적용됩니다. ' + FOOD_RULE_TEXT.manual + ' 자동 계산: ' + foodDateKo_(plan.autoDate) + '.';
  if (plan.rule === 'same_day') return when + '부터 적용됩니다. ' + cutoff + ' 전 신청입니다.';
  if (plan.rule === 'next_day') return when + '부터 적용됩니다. ' + cutoff + ' 이후 신청이라 다음 날부터입니다.';
  return when + '부터 적용됩니다. ' + (FOOD_RULE_TEXT[plan.rule] || '');
}

/** 규칙 원문 대신 교사에게 보일 경고(숫자 날짜는 입력 칸에만 — design/rules.md 5절). 구조 정보로 만든다 */
function foodWarnTexts_(rec, plan, manual, eff, changes, today, terms) {
  var w = [], add = function (t) { if (w.indexOf(t) < 0) w.push(t); };
  if (plan.superseded) add('이미 더 새 신청이 먼저 적용되어 이 신청은 값을 바꾸지 않습니다. 기록으로만 남습니다.');
  if (manual && rec.value === '미실시' && rec.effectiveDate < plan.autoDate) add('급식실 준비 기간(다음 주 월요일 규칙)보다 이른 날짜입니다. 그래도 저장하면 이 날짜로 적용됩니다.');
  if (eff && eff < today) add('지난 날짜의 식수 집계가 바뀝니다.');
  if (manual && !termOnDate_(eff, terms)) add('그 날짜는 등록된 운영 기간 밖입니다.');
  if (!plan.superseded && !plan.blocked) {
    var gone = {};
    plan.toCancel.forEach(function (c) { gone[c.id] = true; });
    changes.forEach(function (c) {
      var e = String(c.effective_date);
      if (c.item !== rec.item || String(c.status || '유효') !== '유효' || gone[c.id] || c.value === rec.value || !ymdIsValid_(e)) return;
      if (e > eff) add(foodDateKo_(e) + '부터 ' + c.value + '(으)로 바뀌는 신청이 있어 이 신청을 덮습니다.');
      else if (e > today && e < eff) add(foodDateKo_(e) + '부터 ' + c.value + '(으)로 바뀌는 대기 신청이 먼저 적용됩니다. 필요하면 직접 취소해 주세요.');
    });
  }
  return w;
}

/** 저장 직전 화면 값과 락 안 계획이 같은지 보는 서명. 쓸 행(적용일·취소할 행·이어 쓸 행)과 경고가 달라지면 달라진다. */
function foodSignature_(plan, warnings) {
  return JSON.stringify({
    d: plan.date, k: plan.kind, b: plan.blocked, s: plan.superseded, w: warnings,
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

/**
 * 미리보기·저장이 같이 쓰는 검사 + 계획. 기간은 적용일이 속한 기간 하나(결정 60)로 등록·끝난 기간을 보고,
 * 권한 검사의 날짜(permYmd)도 그 기간 안의 날짜로 정한다. 오류가 있으면 plan이 없을 수 있다.
 */
function foodCheck_(input, d) {
  var today = today_();
  var v = foodValidate_(input, { now: nowIso_() });
  if (v.errors.length) return { errors: v.errors, permYmd: '' };
  var rec = v.rec;
  var p = foodPlan_(rec, d.changes, today, d.cutoff);
  var plan = p.plan, errors = p.errors.slice();
  var eff = plan.date || (p.manual ? rec.effectiveDate : plan.autoDate);
  var term = foodTermOf_(eff, d.terms);
  if (!term) errors.push({ field: 'effectiveDate', message: '적용일이 속한 운영 기간이 없습니다.' });
  else if (term.end_date < today) errors.push({ field: 'effectiveDate', message: '"' + term.name + '"은(는) 끝난 기간입니다. 끝난 기간의 급식 신청은 받지 않습니다.' });
  else if (!d.enrollments.some(function (e) { return e.term_id === term.id && e.student_id === rec.studentId; })) {
    errors.push({ field: 'studentId', message: '"' + term.name + '" 명단에 없는 학생입니다. 관리자에게 명단 등록을 요청해 주세요.' });
  }
  return { errors: errors, rec: rec, term: term, plan: plan, manual: p.manual, eff: eff,
    permYmd: term ? (eff > term.start_date ? eff : term.start_date) : '',
    warnings: foodWarnTexts_(rec, plan, p.manual, eff, d.changes, today, d.terms),
    blocked: plan.blocked ? foodDateKo_(eff) + '에는 학사 퇴실 상태라 ' + rec.item + ' ' + rec.value + '을(를) 새로 신청할 수 없습니다.' : '' };
}

/** 계획의 기간으로 학생 범위(담당교사·관리자)를 판정한다. 읽기 도우미를 거친 뒤에 부른다(오류 응답보다 먼저 거부가 나가게) */
function foodAuthorize_(input, c) {
  return requirePermission_('status.edit', { studentId: String((input && input.studentId) || ''), ymd: c.permYmd });
}

/** 같은 신청서(학생·항목·값·신청 일시, F7)가 이미 있나(유효 또는 덮여서 취소된 기록) — 다시 눌러도 한 번만 쓴다 */
function foodFindDuplicate_(rec, changes) {
  return changes.filter(function (c) {
    return c.item === rec.item && c.value === rec.value && c.requested_at === rec.requestedAt && c.source === 'F7' && !String(c.linked_change_id || '') &&
      (String(c.status || '유효') === '유효' || /더 새 신청$/.test(String(c.cancel_reason || '')));
  })[0] || null;
}

/** 서류 미제출 대표 행: 유효 + 연결 행 아님 + doc_submitted FALSE. 명단업로드 행은 서류가 없으므로(가짜 데이터에 FALSE가 남아 있어도) 세지 않는다 */
function foodIsMissingDoc_(c) {
  return String(c.status || '유효') === '유효' && c.source !== '명단업로드' && !String(c.linked_change_id || '') && String(c.doc_submitted).toUpperCase() === 'FALSE';
}

/**
 * 서류 미제출 집계 하나(홈·학생 기록·식수 집계가 같이 쓴다, 결정 60): 행마다 "적용일이 속한(사이면 다음) 기간의 담당교사"가 책임진다.
 * 기간이 바뀌어도 서류를 표시할 때까지 남는다(결정 3). 기간을 못 찾으면 teacher '' (관리자만). → [{row, studentId, termId, teacher}]
 */
function foodMissingDocs_(changes, enrollments, terms) {
  var teacherOf = {};
  enrollments.forEach(function (e) { teacherOf[e.term_id + '|' + e.student_id] = normalizeEmail_(e.teacher_email); });
  return changes.filter(foodIsMissingDoc_).map(function (c) {
    var term = ymdIsValid_(String(c.effective_date)) ? foodTermOf_(c.effective_date, terms) : null;
    return { row: c, studentId: c.student_id, termId: term ? term.id : '', teacher: term ? (teacherOf[term.id + '|' + c.student_id] || '') : '' };
  });
}

/**
 * 현황표 비고 문장(real-layout-2025.md): 신청 하나는 "신청일 변경내용(적용일~), 변경내용(적용일~)"로 연결 행을 묶고, 신청끼리는 " / "로 잇는다.
 * 명단 행·취소·덮인 신청서는 뺀다. 석식은 '학사 석식'·'일반 석식으로 변경'·'석식 미실시'로 쓴다(값을 반복하지 않는다).
 */
function foodRemark_(rows) {
  var md = function (ymd) { var p = String(ymd).split('-'); return (+p[1]) + '.' + (+p[2]); };
  var order = { '학사': 0, '기숙사': 1, '조식': 2, '석식': 3 };
  var label = function (c) {
    if (c.item === '석식') return c.value === '일반 석식' ? '일반 석식으로 변경' : c.value === '미실시' ? '석식 미실시' : '학사 석식';
    return c.item + ' ' + c.value;
  };
  var live = (rows || []).filter(function (c) { return String(c.status || '유효') === '유효' && c.source !== '명단업로드' && ymdIsValid_(String(c.effective_date)); });
  return live.filter(function (c) { return !String(c.linked_change_id || '') && (c.source === 'F6' || c.source === 'F7') && ymdIsValid_(String(c.requested_at).slice(0, 10)); })
    .sort(function (a, b) { return a.requested_at < b.requested_at ? -1 : a.requested_at > b.requested_at ? 1 : 0; }).map(function (h) {
      var parts = [h].concat(live.filter(function (c) { return c.linked_change_id === h.id; })
        .sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : order[a.item] - order[b.item]; }));
      return md(String(h.requested_at).slice(0, 10)) + ' ' + parts.map(function (p) { return label(p) + '(' + md(p.effective_date) + '~)'; }).join(', ');
    }).join(' / ');
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
  var today = today_();
  // 저장 판정(결정 60)과 같은 기간: 오늘이 기간 사이(예: 3/1)면 곧 시작하는 기간의 학생을 보여 준다. 다음 기간이 없으면 가장 최근 기간
  var terms = readAll_('terms');
  var term = foodTermOf_(today, terms) || getCurrentTerm_();
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
  requirePermission_('status.list');
  var d = foodLoad_(String((input && input.studentId) || ''));
  var c = foodCheck_(input, d);
  foodAuthorize_(input, c);
  if (!c.plan) return { ok: false, errors: c.errors, now: nowIso_() };
  var plan = c.plan;
  return {
    ok: !c.errors.length && !c.blocked, errors: c.errors, blocked: c.blocked, superseded: plan.superseded, kind: plan.kind,
    date: plan.date, dateKo: plan.date ? foodDateKo_(plan.date) : '', autoDate: plan.autoDate, autoDateKo: foodDateKo_(plan.autoDate),
    manual: c.manual, rule: plan.rule, reasonText: plan.date ? foodReasonText_(plan, c.manual, today_(), d.cutoff) : '',
    warnings: c.warnings, now: nowIso_(),
    cancel: plan.toCancel.map(function (x) { return { date: x.effective_date, value: x.value }; }),
    followUps: plan.followUps.map(function (f) { return { item: f.item, value: f.value, date: f.effective_date }; }),
    label: c.rec.chipLabel, expect: foodSignature_(plan, c.warnings)
  };
}

/**
 * 급식 변경 저장. 락 안에서 다시 읽고 다시 계획한다(화면 값을 믿지 않는다). 첫 줄은 역할만 보고(status.list),
 * 학생 범위(status.edit)는 계획한 기간으로 락 안에서 판정한다.
 * 같은 신청서(학생·항목·값·신청 일시)가 이미 있으면 쓰지 않고 {ok:true, duplicate:true}(다시 눌러도 한 번만).
 * expect(미리보기가 준 서명)와 계획이 다르면 {ok:false, stale:true}. blocked이면 쓰지 않는다.
 * 대표 행(source F7, 서류 TRUE/FALSE) + 이어 쓰기(규칙이 준 source 그대로) + 대체된 대기 행 취소. 덮인 신청서는 취소 행으로(결정 58). 메일은 없다.
 */
function saveMealChange(input, expect) {
  requirePermission_('status.list');
  return withLock_(function () {
    ['terms', 'students', 'enrollments', 'status_changes'].forEach(function (n) { invalidate_('db', n); });
    invalidate_('config', 'settings');
    var d = foodLoad_(String((input && input.studentId) || ''));
    var c = foodCheck_(input, d);
    var user = foodAuthorize_(input, c);
    if (!c.plan || c.errors.length) return { ok: false, errors: c.errors };
    var rec = c.rec, plan = c.plan;
    var dup = foodFindDuplicate_(rec, d.changes);
    if (dup) return { ok: true, duplicate: true, id: dup.id, superseded: String(dup.status) === '취소', date: dup.effective_date,
      dateKo: ymdIsValid_(String(dup.effective_date)) ? foodDateKo_(dup.effective_date) : '', label: rec.chipLabel, cancelCount: 0, followUpCount: 0, doc: rec.doc };
    if (c.blocked) return { ok: false, blocked: c.blocked };
    if (String(expect || '') !== foodSignature_(plan, c.warnings)) {
      return { ok: false, stale: true, error: '확인한 뒤 다른 변경이 있었습니다. 다시 확인해 주세요.' };
    }
    // 결정 58: 더 새 신청에 덮인 신청서도 종이 기록으로 남긴다(status 취소). 덮은 행이 나중에 취소되면 되살릴 수 있다.
    // supersededBy는 규칙(R11a)이 주는 필드 — 아직 없으면 id 없이 꼬리표만 쓴다.
    var dead = plan.superseded ? { status: '취소', cancel_reason: '[자동] ' + ((plan.supersededBy || [])[0] ? plan.supersededBy[0] + ' ' : '') + '더 새 신청' } : {};
    var w = foodWrite_(Object.assign({
      student_id: rec.studentId, item: rec.item, value: rec.value, requested_at: rec.requestedAt,
      effective_date: plan.superseded ? c.eff : plan.date,
      effective_date_auto: plan.autoDate, reason: c.manual ? rec.reason : '', doc_submitted: rec.doc ? 'TRUE' : 'FALSE', source: 'F7'
    }, dead), plan.followUps.map(function (f) {
      return { item: f.item, value: f.value, effective_date: f.effective_date, effective_date_auto: f.effective_date, source: f.source,
        reason: f.source === 'F6' ? '학사 퇴실 정리' : '재입실일부터 이어짐' };
    }), plan.toCancel.map(function (x) { return { id: x.id, cancel_reason: '새 신청으로 대체' }; }), user.email);
    return { ok: true, id: w.head.id, superseded: plan.superseded, date: plan.date, dateKo: plan.date ? foodDateKo_(plan.date) : '', label: rec.chipLabel,
      cancelCount: plan.toCancel.length, followUpCount: w.linked.length, doc: rec.doc };
  });
}

/* ───────────── 식수 집계(C19) ───────────── */

/** 그 날짜의 식수 집계 모델(캐시 없음 — 입력 즉시 반영, PRD 성공 기준). 신청 기준 인원: 결석·외박은 반영하지 않는다 */
function foodCountsModel_(ymd) {
  var terms = readAll_('terms');
  var term = termOnDate_(ymd, terms);
  if (!term) throw new Error('그 날짜가 속한 운영 기간이 없습니다.');
  var students = readAll_('students'), enr = readAll_('enrollments'), changes = readAll_('status_changes');
  var counts = mealCountsOn_(students, enr, changes, term.id, ymd);
  var plan = resolveDayPlan_(ymd, { termType: calTermTypeOn_(terms, ymd), daySchedule: pickDaySchedule_(readAll_('day_schedules'), ymd),
    blocks: readAll_('blocks'), defaults: calDefaults_(readAll_('settings', 'config')) });
  var miss = {}, name = {};
  students.forEach(function (s) { name[s.id] = s.name; });
  foodMissingDocs_(changes, enr, terms).forEach(function (m) { miss[m.studentId] = true; });   // 홈과 같은 집계: 기간이 바뀌어도 표시할 때까지 남는다
  return { date: ymd, term: term, counts: counts, operating: plan.operating, docUnsubmitted: Object.keys(miss).length, name: name };
}

function foodCountsDate_(date) {
  var ymd = String(date || '').trim() || today_();
  if (!ymdIsValid_(ymd)) throw new Error('날짜를 골라 주세요.');
  return ymd;
}

/**
 * 식수 집계(관리자). 행 순서는 여1…전체(출력물과 같다). unknown = 성별·학년을 알 수 없어 줄에 넣지 못한 학생(이름은 관리자 화면에만).
 * 서류 미제출은 학생 수(이름 없음). 퇴실 후 석식 유지 = 학사 퇴실했지만 석식 중단일 전이라 학사 석식에 포함된 학생.
 */
function getMealCounts(date) {
  requirePermission_('meal.count');
  var m = foodCountsModel_(foodCountsDate_(date));
  var c = m.counts;
  return {
    date: m.date, dateKo: foodDateKo_(m.date), term: { id: m.term.id, name: m.term.name }, operating: m.operating,
    rows: printMealRowOrder_(Object.keys(c.groups)).map(function (k) { return Object.assign({ key: k }, c.groups[k]); }),
    afterLeaveHallDinner: c.afterLeaveHallDinner, docUnsubmitted: m.docUnsubmitted,
    unknown: c.unknownGroup.map(function (id) { return { id: id, name: m.name[id] || '(알 수 없음)' }; }),
    warnings: c.warnings.filter(function (w) { return w.indexOf(' 학생의 ') < 0; })
  };
}

/** 식수 집계 PDF(급식실 제출용 임시 양식, 방식은 sheetMakePdf_ — C0 결과로 바뀔 수 있다). 공유·저장 없이 base64로 내려준다 */
function getMealCountsPdf(date) {
  var user = requirePermission_('meal.count');
  var m = foodCountsModel_(foodCountsDate_(date));
  var html = printRenderMealCounts_({ date: m.date, termName: m.term.name, operating: m.operating, counts: m.counts, docUnsubmitted: m.docUnsubmitted,
    preparedBy: user.name, generatedAt: nowIso_().slice(0, 16).replace('T', ' ') });
  var name = '식수집계_' + m.date + '(' + ymdWeekdayKo_(m.date) + ').pdf';
  var bytes = sheetMakePdf_(html, name).getBytes();
  return { ok: true, name: name, base64: Utilities.base64Encode(bytes), bytes: bytes.length };
}

/** 기록 줄에 보일 말: 시스템 글자(F7·[자동] <id>) 대신 교사용 말 */
function foodSourceLabel_(src) { return src === 'F7' ? '급식 변경' : src === 'F6' ? '입퇴실' : src === '명단업로드' ? '명단' : ''; }
function foodCancelText_(reason) {
  var t = String(reason || '').replace(/^\[자동\]\s+\S+\s*/, '').trim();
  return t ? (/대체|더 새 신청/.test(t) ? '새 신청으로 대체됨' : t) : (String(reason || '').indexOf('[자동]') === 0 ? '새 신청으로 대체됨' : '');
}
function foodAtKo_(iso) {
  var s = String(iso || '');
  return ymdIsValid_(s.slice(0, 10)) ? foodDateKo_(s.slice(0, 10)) + (s.length >= 16 ? ' ' + s.slice(11, 16) : '') : '';
}

/**
 * 학생 한 명의 급식·입퇴실 기록(보기). 관리자·출결 담당·학사 교사 = 이번 기간 학사생 전체, 담임 = 우리 반(status.view).
 * memo는 내보내지 않는다(2OUT 연결 id가 들어 있을 수 있다). 서류 표시 버튼(canMarkDoc)은 그 행의 담당교사(적용일 기간, 결정 60)·관리자에게만.
 */
function listStudentStatus(studentId) {
  var user = requirePermission_('status.view', { studentId: studentId });
  var today = today_();
  var rows = readAll_('status_changes').filter(function (c) { return c.student_id === studentId; });
  var student = findById_('students', studentId);
  var miss = {};
  foodMissingDocs_(rows, readAll_('enrollments'), readAll_('terms')).forEach(function (m) { miss[m.row.id] = m; });
  var live = rows.filter(function (c) { return String(c.status || '유효') === '유효' && ymdIsValid_(String(c.effective_date)); });
  var now = {};
  ['학사', '기숙사', '조식', '석식'].forEach(function (it) { now[it] = statusOn_(rows, studentId, it, today); });
  var pendingRows = live.filter(function (c) { return c.effective_date > today; }).sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : 1; });
  var pendingId = {};
  pendingRows.forEach(function (c) { pendingId[c.id] = true; });
  var view = function (c, noButton) {
    var head = !String(c.linked_change_id || '');
    var m = miss[c.id];
    var mineDoc = !!m && (user.roles.indexOf('admin') >= 0 || (user.roles.indexOf('hall_teacher') >= 0 && m.teacher === user.email));
    return { id: c.id, item: c.item, value: c.value, requestedKo: foodAtKo_(c.requested_at), date: c.effective_date,
      dateKo: ymdIsValid_(String(c.effective_date)) ? foodDateKo_(c.effective_date) : '', edited: !!c.effective_date_auto && c.effective_date_auto !== c.effective_date,
      reason: c.reason, sourceLabel: foodSourceLabel_(c.source), status: String(c.status || '유효'), cancelText: foodCancelText_(c.cancel_reason),
      docState: m ? 'missing' : (head && c.source !== '명단업로드' && String(c.doc_submitted).toUpperCase() === 'TRUE' ? 'done' : ''),
      head: head, canMarkDoc: mineDoc && !noButton };
  };
  return {
    student: { id: student.id, name: student.name, grade: +student.grade, classNo: student.class_no, number: student.number, studentNo: student.student_no },
    today: today, now: now, remark: foodRemark_(rows),
    pending: pendingRows.map(function (c) { return view(c, false); }),
    history: rows.slice().sort(function (a, b) { return String(b.requested_at || b.created_at) < String(a.requested_at || a.created_at) ? -1 : 1; })
      .map(function (c) { return view(c, !!pendingId[c.id]); })   // 대기 행의 버튼은 위 "대기 중인 변경"에만
  };
}

/**
 * 서류 제출 표시(대표 행만 FALSE → TRUE). 행 id만 받으므로 첫 줄은 역할만 보고(status.list),
 * 락 안에서 행을 다시 읽은 뒤 그 행의 담당교사(적용일이 속한 기간, 결정 60)·관리자인지 status.edit로 다시 확인한다.
 */
function setDocSubmitted(changeId) {
  var user = requirePermission_('status.list');
  if (typeof changeId !== 'string' || !changeId) return { ok: false, error: '기록을 찾을 수 없습니다.' };
  return withLock_(function () {
    invalidate_('db', 'status_changes');
    invalidate_('db', 'enrollments');
    var row = findById_('status_changes', changeId);
    if (!row) return { ok: false, error: '기록을 찾을 수 없습니다.' };
    var term = ymdIsValid_(String(row.effective_date)) ? foodTermOf_(row.effective_date, readAll_('terms')) : null;
    requirePermission_('status.edit', { studentId: row.student_id, ymd: term ? (row.effective_date > term.start_date ? row.effective_date : term.start_date) : '' });
    if (String(row.doc_submitted).toUpperCase() === 'TRUE' && !String(row.linked_change_id || '') && row.source !== '명단업로드') return { ok: true, already: true };
    if (!foodIsMissingDoc_(row)) return { ok: false, error: '서류 제출을 표시할 수 있는 신청 행이 아닙니다.' };
    updateRecord_('status_changes', row.id, { doc_submitted: 'TRUE' }, user.email);
    return { ok: true };
  });
}
