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
  var terms = readAll_('terms'), students = readAll_('students'), changes = readAll_('status_changes'), enrollments = readAll_('enrollments');
  var label = function (id) { var st = students.filter(function (x) { return x.id === id; })[0]; return st ? excDisplay_(st) : '(알 수 없음)'; };
  if (role === 'admin' || role === 'hall_teacher') {
    var miss = foodMissingDocs_(changes, enrollments, terms);
    if (role === 'hall_teacher') miss = miss.filter(function (m) { return m.teacher === user.email; });
    else miss.sort(function (a, b) { return (a.teacher === '' ? 0 : 1) - (b.teacher === '' ? 0 : 1); });   // 관리자: 책임 교사가 없는 행을 먼저
    var seen = {}, list = [];
    miss.forEach(function (m) {   // 학생·종류마다 한 줄(이메일·memo 없음). ymd = 그 행의 기간 안 날짜(링크가 그 기간 기준으로 열리게)
      var kind = m.row.source === 'F6' ? '입퇴실' : '급식 변경', k = m.studentId + '|' + kind;
      if (!seen[k]) { seen[k] = true; list.push({ studentId: m.studentId, label: label(m.studentId), kind: kind, ymd: m.ymd }); }
    });
    var shown = {};
    list.slice(0, 10).forEach(function (x) { shown[x.studentId + '|' + x.kind] = true; });
    var hidden = miss.filter(function (m) { return !shown[m.studentId + '|' + (m.row.source === 'F6' ? '입퇴실' : '급식 변경')]; }).length;   // 가려진 줄에 속한 행 수(제목의 건수와 맞춘다)
    var out = { docMissing: miss.length, docList: list.slice(0, 10), docMore: hidden };
    if (role === 'admin') {   // 관리자 홈: 오늘 인원과 자습실·SA 공석(C19, 식수 집계 화면과 같은 모델). 기숙사 정원 대비 공석은 넣지 않는다(F8)
      var today = today_(), m = foodCountsModel_(today, { terms: terms, students: students, enrollments: enrollments, changes: changes });
      out.counts = null; out.noTerm = !m.term;
      if (m.term) {
        var all = m.counts.groups['전체'] || {};
        out.counts = { date: today, dateKo: foodDateKo_(today), termName: m.term.name, hall: all.hall, dorm: all.dorm, dormMale: (m.counts.groups['남 합계'] || {}).dorm,
          dormFemale: (m.counts.groups['여 합계'] || {}).dorm, nonDorm: all.nonDorm, breakfast: all.breakfast, hallDinner: all.hallDinner, generalDinner: all.generalDinner,
          afterLeaveHallDinner: Number(m.counts.afterLeaveHallDinner) || 0 };
        out.vacancy = foodVacancy_(m.term, today);
      }
    }
    return out;
  }
  if (role === 'homeroom') {   // 담임: 우리 반 이번 주 신청(보기만)
    var today = today_(), from = ymdMondayOf_(today), to = ymdAddDays_(from, 6);
    var term = foodTermOf_(today, terms) || getCurrentTerm_();
    var mine = {};
    if (term) enrollments.forEach(function (e) { if (e.term_id === term.id) mine[e.student_id] = true; });
    var week = changes.filter(function (c) {
      var st = students.filter(function (x) { return x.id === c.student_id; })[0], req = String(c.requested_at).slice(0, 10);
      return mine[c.student_id] && st && sameClass_(user.homeroomClass, st.grade, st.class_no) && String(c.status || '유효') === '유효' && (c.source === 'F6' || c.source === 'F7') &&
        !String(c.linked_change_id || '') && ymdIsValid_(String(c.effective_date)) && ymdIsValid_(req) && req >= from && req <= to;
    }).sort(function (a, b) { return a.requested_at < b.requested_at ? 1 : -1; }).slice(0, 20).map(function (c) {
      return { studentId: c.student_id, label: label(c.student_id), what: foodChangeLabel_(c), dateKo: foodDateKo_(c.effective_date),
        missing: foodIsMissingDoc_(c), done: String(c.doc_submitted).toUpperCase() === 'TRUE', ymd: foodPermYmd_(foodTermFor_(c.student_id, c.effective_date, terms, enrollments), c.effective_date) };
    });
    return { week: week };
  }
  return {};
}

/** 자습실·SA실 좌석 수와 공석 수(그날, 퇴실·미배정·미입실 모두 공석). SA1~6은 "SA실" 하나로 묶는다 */
function foodVacancy_(term, ymd) {
  var d = seatLoad_();
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, ymd);
  var groups = { '자습실': { label: '자습실', total: 0, vacant: 0 }, 'SA실': { label: 'SA실', total: 0, vacant: 0 } };
  var spaceName = {};
  d.spaces.forEach(function (sp) { spaceName[sp.id] = String(sp.name || ''); });
  d.seats.forEach(function (x) {
    if (x.kind !== '좌석' || !map.bySeat[x.id]) return;
    var g = groups[/^SA/i.test(spaceName[x.space_id] || '') ? 'SA실' : '자습실'];
    g.total++; if (map.bySeat[x.id].vacant) g.vacant++;
  });
  return [groups['자습실'], groups['SA실']].filter(function (g) { return g.total > 0; });
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
  if (!at) err('requestedAt', '신청 일시를 날짜와 시각까지 입력해 주세요.');
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
 * 급식·입퇴실 신청의 기간(결정 60 + 보충): 적용일이 속한(사이면 다음) 기간이되, 그 기간에 이 학생 등록이 없으면
 * 적용일 이전에서 가장 가까운 이 학생의 등록 기간(보통 신청일의 기간)을 쓴다. 권한·등록 검사·서류 담당 모두 이 함수 하나로 정한다.
 */
function foodTermFor_(studentId, eff, terms, enrollments) {
  var enrolled = function (t) { return enrollments.some(function (e) { return e.term_id === t.id && e.student_id === studentId; }); };
  var cand = foodTermOf_(eff, terms);
  if (cand && enrolled(cand)) return cand;
  var back = terms.filter(function (t) { return enrolled(t) && t.start_date <= eff; }).sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; })[0];
  return back || cand;
}

/** 권한 검사에 넘길 날짜: 그 기간 안으로 맞춘다(기간 밖 날짜면 학생 범위 판정이 다른 기간을 보지 않게) */
function foodPermYmd_(term, eff) {
  return !term ? '' : (eff < term.start_date ? term.start_date : eff > term.end_date ? term.end_date : eff);
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
  var term = foodTermFor_(rec.studentId, eff, d.terms, d.enrollments);
  errors = errors.concat(foodTermErrors_(rec.studentId, eff, term, d.terms, d.enrollments, today, '급식 신청'));
  return { errors: errors, rec: rec, term: term, plan: plan, manual: p.manual, eff: eff,
    permYmd: foodPermYmd_(term, eff),
    warnings: foodWarnTexts_(rec, plan, p.manual, eff, d.changes, today, d.terms),
    blocked: plan.blocked ? foodDateKo_(eff) + '에는 학사 퇴실 상태라 ' + rec.item + ' ' + rec.value + '을(를) 새로 신청할 수 없습니다.' : '' };
}

/**
 * 신청의 기간(term = foodTermFor_ 결과)에 대한 오류(급식·입퇴실 공용). 대체 기간이 이미 끝났는데 적용일은 다른 기간이면
 * 할 일은 적용일 기간의 명단 등록이므로 그렇게 안내한다.
 */
function foodTermErrors_(studentId, eff, term, terms, enrollments, today, what) {
  if (!term) return [{ field: 'effectiveDate', message: '적용일이 속한 운영 기간이 없습니다.' }];
  var effTerm = foodTermOf_(eff, terms);
  var noList = function (t) { return [{ field: 'studentId', message: '"' + t.name + '" 명단에 없는 학생입니다. 관리자에게 명단 등록을 요청해 주세요.' }]; };
  if (term.end_date < today) {
    return effTerm && effTerm.id !== term.id ? noList(effTerm) : [{ field: 'effectiveDate', message: '"' + term.name + '"은(는) 끝난 기간입니다. 끝난 기간의 ' + what + '은 받지 않습니다.' }];
  }
  return enrollments.some(function (e) { return e.term_id === term.id && e.student_id === studentId; }) ? [] : noList(term);
}

/** 계획의 기간으로 학생 범위(담당교사·관리자)를 판정한다. 읽기 도우미를 거친 뒤에 부른다(오류 응답보다 먼저 거부가 나가게) */
function foodAuthorize_(input, c) {
  var sid = String((input && input.studentId) || '');
  try {
    return requirePermission_('status.edit', { studentId: sid, ymd: c.permYmd });
  } catch (e) {
    // 다른 기간의 담당교사(예: 2학기 담당이 3월 적용 신청을 하려는 경우)에게는 이유를 알려 준다. 거부 기록은 이미 남았다. 그 학생과 아무 관계 없는 교사는 그대로 거부
    var u = getCurrentUser_();
    // 안내는 틀리지 않을 때만: 역할은 되는 교사(출결 전용 계정 등 제외)가 그 학생의 다른 기간 담당이고, 대상 기간이 끝나지 않았고 학생이 그 기간 명단에 있을 때
    var mine = readAll_('enrollments').filter(function (en) { return en.student_id === sid && normalizeEmail_(en.teacher_email) === u.email; });
    var inTerm = c.term ? readAll_('enrollments').some(function (en) { return en.term_id === c.term.id && en.student_id === sid; }) : false;
    if (c.term && c.eff && e.message === '권한이 없습니다.' && c.term.end_date >= today_() && inTerm && mine.length && hasAnyAllowedRole_(u.roles, permissions_()['status.edit'].roles)) {
      throw new Error('이 신청(적용일 ' + foodDateKo_(c.eff) + ')은 ' + c.term.name + ' 담당교사나 관리자가 합니다.');
    }
    throw e;
  }
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
    var term = ymdIsValid_(String(c.effective_date)) ? foodTermFor_(c.student_id, c.effective_date, terms, enrollments) : null;   // 권한·등록 검사와 같은 기간
    return { row: c, studentId: c.student_id, termId: term ? term.id : '', teacher: term ? (teacherOf[term.id + '|' + c.student_id] || '') : '',
      ymd: foodPermYmd_(term, c.effective_date) };
  });
}

/**
 * 현황표 비고 문장(real-layout-2025.md): 신청 하나는 "신청일 변경내용(적용일~), 변경내용(적용일~)"로 연결 행을 묶고, 신청끼리는 " / "로 잇는다.
 * 명단 행·취소·덮인 신청서는 뺀다. 석식은 '학사 석식'·'일반 석식으로 변경'·'석식 미실시'로 쓴다(값을 반복하지 않는다).
 */
/** 변경 한 줄 이름: '학사 퇴실'·'조식 미실시'·'학사 석식'·'일반 석식으로 변경'·'석식 미실시' */
function foodChangeLabel_(c) {
  if (c.item === '석식') return c.value === '일반 석식' ? '일반 석식으로 변경' : c.value === '미실시' ? '석식 미실시' : '학사 석식';
  return c.item + ' ' + c.value;
}

function foodRemark_(rows) {
  var md = function (ymd) { var p = String(ymd).split('-'); return (+p[1]) + '.' + (+p[2]); };
  var order = { '학사': 0, '기숙사': 1, '조식': 2, '석식': 3 };
  var label = foodChangeLabel_;
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
 *  restores: [{id}] — 꼬리표로 취소됐던 행을 되살린다(status 유효, cancel_reason 비움, 퇴실 정리·F6 쪽 되살림).
 *  대표+연결 행은 bulkAppend_ 한 번(audit bulk_create 한 줄), 취소·되살림은 bulkUpdateRecords_ 한 번(audit bulk_update 한 줄). 지우지 않는다.
 * → {head, linked}
 */
function foodWrite_(head, linked, cancels, actorEmail, restores) {
  var base = { linked_change_id: '', doc_submitted: '', status: '유효', memo: '', cancel_reason: '' };
  var id = Utilities.getUuid();   // 대표 id를 먼저 정해 대표+연결 행을 한 번에 쓴다(중간에 끊겨 대표 행만 남는 일이 없게)
  var h = Object.assign({}, base, head, { id: id });
  var rows = (linked || []).map(function (l) {
    return Object.assign({}, base, { student_id: h.student_id, requested_at: h.requested_at }, l, { id: Utilities.getUuid(), linked_change_id: id });
  });
  bulkAppend_('status_changes', [h].concat(rows), actorEmail);
  // 취소와 되살림은 한 번의 bulkUpdateRecords_(한 번의 setValues)로 쓴다 — 둘 사이에서 끊겨 되살림만 빠지는 일이 없게
  var patches = (cancels || []).map(function (c) {   // 규칙이 이미 '[자동] <원인 행 id> …'를 준 사유(되살린 신청이 다시 취소하는 행)는 그대로 쓴다
    var r = String(c.cancel_reason || '');
    return { id: c.id, patch: { status: '취소', cancel_reason: /^\[자동\] /.test(r) ? r : '[자동] ' + id + ' ' + (r || '새 신청으로 대체') } };
  }).concat((restores || []).map(function (r) { return { id: r.id, patch: { status: '유효', cancel_reason: '' } }; }));
  if (patches.length) bulkUpdateRecords_('status_changes', patches, actorEmail);
  return { head: h, linked: rows };
}

/** 이 대표 행과 연결 행을 빼고, 이 대표 행이 취소한 행을 되살려 "저장 전" 모양으로 되돌린다(재시도 때 원래 계획을 다시 세우려고) */
function foodBefore_(changes, headId) {
  return changes.filter(function (c) { return c.id !== headId && c.linked_change_id !== headId; }).map(function (c) {
    return String(c.cancel_reason || '').indexOf('[자동] ' + headId + ' ') === 0 ? Object.assign({}, c, { status: '유효', cancel_reason: '' }) : c;
  });
}

var FOOD_UNFINISHED = '이전 저장이 중간에 끊겨 덜 끝났습니다. 관리자에게 알려 주세요.';

/**
 * 저장했다는 대표 행이 있는데 취소 쓰기가 빠졌나(다시 눌렀을 때 "이미 저장"으로 넘기지 않으려고).
 * 대표+연결 행은 한 번에, 취소·되살림도 한 번에 쓰므로 반쯤 쓰이는 일은 없고, 끊길 수 있는 곳은 그 둘 사이뿐이다.
 * plan = 저장 전 모양(foodBefore_)으로 다시 세운 계획. 그 계획이 취소할 행이 있는데 이 대표 행의 "[자동] <대표 id>" 꼬리표가 붙은 행이 하나도 없으면 덜 끝난 것이다.
 * 나중 저장이 이 저장의 행을 취소·되살려도 꼬리표는 남으므로 끝난 저장을 거짓으로 덜 끝났다고 하지 않는다.
 * 덮여서 취소된 신청서(superseded 기록)는 취소 쓰기가 없으니 검사하지 않는다(부르는 쪽).
 */
function foodUnfinished_(plan, changes, headId) {
  if (!plan.toCancel.length) return false;
  // '더 새 신청'으로 끝나는 꼬리표는 덮인 신청서(superseded 기록)가 덮은 행 id를 달고 있는 것이라 이 대표의 취소 꼬리표가 아니다
  return !changes.some(function (c) { var r = String(c.cancel_reason || ''); return r.indexOf('[자동] ' + headId + ' ') === 0 && !/더 새 신청$/.test(r); });
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
  // 목록은 이번 기간 ∪ 곧 시작하는 기간(있으면): 학기 말 신청의 적용일은 다음 기간이라 그 기간 담당교사도 신청할 수 있어야 한다
  var nextTerm = terms.filter(function (t) { return t.start_date > today; }).sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; })[0];
  var listTerms = {};
  [term, getCurrentTerm_(), nextTerm].forEach(function (t) { if (t) listTerms[t.id] = true; });   // 사이 날(3/1)에는 막 끝난 기간의 담당교사도 본다
  var out = { now: nowIso_(), today: today, cutoff: foodCutoff_(readAll_('settings', 'config')),
    term: term ? { id: term.id, name: term.name } : null, canEdit: false,
    chips: FOOD_CHIPS.map(function (c) { return { id: c.id, label: c.label }; }), students: [], viewStudents: [] };
  if (!term) return out;
  var editRule = permissions_()['status.edit'], viewRule = permissions_()['status.view'];
  out.canEdit = user.roles.some(function (r) { return editRule.roles.indexOf(r) >= 0; });
  var studentById = {};
  readAll_('students').forEach(function (s) { studentById[s.id] = s; });
  var changes = readAll_('status_changes');
  var seenView = {}, seenEdit = {};   // 같은 학생이 두 기간에 등록돼 있어도(담당이 기간마다 다름) 보기·신청 목록을 따로 모은다
  readAll_('enrollments').forEach(function (e) {
    var s = studentById[e.student_id];
    if (!listTerms[e.term_id] || !s) return;
    var facts = { isEnrolled: true, isAssigned: normalizeEmail_(e.teacher_email) === user.email, isOnDuty: false,
      inHomeroom: sameClass_(user.homeroomClass, s.grade, s.class_no) };
    var item = { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no };
    // 이번 기간 등록이면 ymd '', 다음·막 끝난 기간에만 등록된 학생이면 그 기간 안 날짜(기록 탭이 그 기간 기준으로 열도록)
    var etm = terms.filter(function (t) { return t.id === e.term_id; })[0];
    var viewItem = Object.assign({ ymd: e.term_id === (getCurrentTerm_() || {}).id || !etm ? '' : foodPermYmd_(etm, today) }, item);   // ymd 없이 열면 getCurrentTerm_ 기준으로 판정되므로 그 기간 등록이면 빈 값
    if (!seenView[s.id] && canAccessStudentByFacts_(user.roles, facts, viewRule.roles, true)) { seenView[s.id] = true; out.viewStudents.push(viewItem); }
    if (!seenEdit[s.id] && out.canEdit && canAccessStudentByFacts_(user.roles, facts, editRule.roles)) {
      seenEdit[s.id] = true;
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
    if (dup) {
      // 이미 저장된 신청서: 그 저장이 끝까지 갔는지(연결 행·취소)를 저장 전 모양에서 다시 세운 계획으로 확인한다. 덜 끝났으면 성공이라 하지 않는다
      var again = foodPlan_(rec, foodBefore_(d.changes, dup.id), today_(), d.cutoff).plan;
      if (String(dup.status || '유효') === '유효' && foodUnfinished_(again, d.changes, dup.id)) return { ok: false, errors: [{ field: '', message: FOOD_UNFINISHED }] };
      return { ok: true, duplicate: true, id: dup.id, superseded: String(dup.status) === '취소', date: dup.effective_date,
        dateKo: ymdIsValid_(String(dup.effective_date)) ? foodDateKo_(dup.effective_date) : '', label: rec.chipLabel, cancelCount: 0, followUpCount: 0, doc: String(dup.doc_submitted).toUpperCase() === 'TRUE' };
    }
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

/**
 * 그 날짜의 식수 집계 모델(캐시 없음 — 입력 즉시 반영, PRD 성공 기준). 신청 기준 인원: 결석·외박은 반영하지 않는다.
 * 운영 기간이 아닌 날(기간 사이·첫 기간 전·마지막 기간 뒤)에는 term이 null이고 counts가 없다(화면이 멈추지 않게 던지지 않는다).
 * docRows = 서류 미제출 행 수(날짜와 무관한 전체), docUnsubmitted = 그 행이 있는 학생 수. src = 이미 읽은 시트 행(홈이 재사용)
 */
function foodCountsModel_(ymd, src) {
  src = src || {};
  var terms = src.terms || readAll_('terms'), students = src.students || readAll_('students'), enr = src.enrollments || readAll_('enrollments'), changes = src.changes || readAll_('status_changes');
  var term = termOnDate_(ymd, terms);
  var miss = {}, name = {}, rows = foodMissingDocs_(changes, enr, terms);
  students.forEach(function (s) { name[s.id] = s.name; });
  rows.forEach(function (m) { miss[m.studentId] = true; });   // 홈과 같은 집계: 기간이 바뀌어도 표시할 때까지 남는다
  var out = { date: ymd, term: term, counts: null, operating: false, docRows: rows.length, docUnsubmitted: Object.keys(miss).length, name: name };
  if (!term) return out;
  out.counts = mealCountsOn_(students, enr, changes, term.id, ymd);
  out.operating = resolveDayPlan_(ymd, { termType: calTermTypeOn_(terms, ymd), daySchedule: pickDaySchedule_(readAll_('day_schedules'), ymd),
    blocks: readAll_('blocks'), defaults: calDefaults_(readAll_('settings', 'config')) }).operating;
  return out;
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
  if (!m.term) {   // 운영 기간이 아닌 날: 던지지 않고 안내만(화면이 그 날짜에서 ‹ ›로 계속 넘어갈 수 있게)
    return { date: m.date, dateKo: foodDateKo_(m.date), term: null, operating: false, rows: [], afterLeaveHallDinner: 0, docUnsubmitted: m.docUnsubmitted, docRows: m.docRows,
      unknown: [], warnings: [], message: '운영 기간이 아닙니다.' };
  }
  var c = m.counts;
  return {
    date: m.date, dateKo: foodDateKo_(m.date), term: { id: m.term.id, name: m.term.name }, operating: m.operating,
    rows: printMealRowOrder_(Object.keys(c.groups)).map(function (k) { return Object.assign({ key: k }, c.groups[k]); }),
    afterLeaveHallDinner: c.afterLeaveHallDinner, docUnsubmitted: m.docUnsubmitted, docRows: m.docRows,
    unknown: c.unknownGroup.map(function (id) { return { id: id, name: m.name[id] || '(알 수 없음)' }; }),
    warnings: c.warnings.filter(function (w) { return w.indexOf(' 학생의 ') < 0; })
  };
}

/** 식수 집계 PDF(급식실 제출용 임시 양식, 방식은 sheetMakePdf_ — C0 결과로 바뀔 수 있다). 공유·저장 없이 base64로 내려준다 */
function getMealCountsPdf(date) {
  var user = requirePermission_('meal.count');
  var m = foodCountsModel_(foodCountsDate_(date));
  if (!m.term) return { ok: false, error: '운영 기간이 아닌 날은 출력할 수 없습니다.' };
  var html = printRenderMealCounts_({ date: m.date, termName: m.term.name, operating: m.operating, counts: m.counts, docUnsubmitted: m.docUnsubmitted, docRows: m.docRows,
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
/** 오늘과 해가 다르면 연도를 붙인다("2026년 12월 30일(수)") */
function foodDateKoY_(ymd, today) { return (String(ymd).slice(0, 4) !== String(today).slice(0, 4) ? Number(String(ymd).slice(0, 4)) + '년 ' : '') + foodDateKo_(ymd); }
function foodAtKo_(iso, today) {
  var s = String(iso || '');
  return ymdIsValid_(s.slice(0, 10)) ? foodDateKoY_(s.slice(0, 10), today) + (s.length >= 16 ? ' ' + s.slice(11, 16) : '') : '';
}

/**
 * 학생 한 명의 급식·입퇴실 기록(보기). 관리자·출결 담당·학사 교사 = 이번 기간 학사생 전체, 담임 = 우리 반(status.view).
 * memo는 내보내지 않는다(2OUT 연결 id가 들어 있을 수 있다). 서류 표시 버튼(canMarkDoc)은 그 행의 담당교사(적용일 기간, 결정 60)·관리자에게만.
 */
function listStudentStatus(studentId, ymd) {
  var user = requirePermission_('status.view', { studentId: studentId, ymd: typeof ymd === 'string' && ymdIsValid_(ymd) ? ymd : '' });   // ymd = 그 기록이 속한 기간의 날짜(지난·다음 기간 학생의 미제출을 열 수 있게)
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
  var enrAll = readAll_('enrollments'), termsAll = readAll_('terms'), isAdmin = user.roles.indexOf('admin') >= 0;
  /** [퇴실 취소] 버튼을 보일 행(보기 편의일 뿐 — cancelMove가 서버에서 다시 판정한다): F6 퇴실 대표, 적용일 전이면 책임 교사·관리자, 지난 뒤나 2OUT 퇴실이면 관리자 */
  var canCancel = function (c) {
    if (c.source !== 'F6' || String(c.linked_change_id || '') || c.value !== '퇴실' || String(c.status || '유효') !== '유효') return false;
    if (isAdmin) return true;
    if (c.effective_date < today || (String(c.reason || '') === '2OUT 퇴실' && String(c.memo || '').indexOf('[2OUT]') === 0) || user.roles.indexOf('hall_teacher') < 0) return false;
    var term = ymdIsValid_(String(c.effective_date)) ? foodTermFor_(studentId, c.effective_date, termsAll, enrAll) : null;
    return !!term && enrAll.some(function (e) { return e.term_id === term.id && e.student_id === studentId && normalizeEmail_(e.teacher_email) === user.email; });
  };
  var view = function (c, noButton) {
    var head = !String(c.linked_change_id || '');
    var m = miss[c.id];
    var mineDoc = !!m && (user.roles.indexOf('admin') >= 0 || (user.roles.indexOf('hall_teacher') >= 0 && m.teacher === user.email));
    return { id: c.id, item: c.item, value: c.value, what: foodChangeLabel_(c), requestedKo: foodAtKo_(c.requested_at, today), date: c.effective_date,
      dateKo: ymdIsValid_(String(c.effective_date)) ? foodDateKoY_(c.effective_date, today) : '', edited: !!c.effective_date_auto && c.effective_date_auto !== c.effective_date,
      reason: c.reason, sourceLabel: foodSourceLabel_(c.source), status: String(c.status || '유효'), cancelText: foodCancelText_(c.cancel_reason),
      docState: m ? 'missing' : (head && c.source !== '명단업로드' && String(c.doc_submitted).toUpperCase() === 'TRUE' ? 'done' : ''),
      head: head, canMarkDoc: mineDoc && !noButton, canCancelMove: !noButton && canCancel(c) };
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
    var term = ymdIsValid_(String(row.effective_date)) ? foodTermFor_(row.student_id, row.effective_date, readAll_('terms'), readAll_('enrollments')) : null;
    requirePermission_('status.edit', { studentId: row.student_id, ymd: foodPermYmd_(term, row.effective_date) });
    if (String(row.doc_submitted).toUpperCase() === 'TRUE' && !String(row.linked_change_id || '') && row.source !== '명단업로드') return { ok: true, already: true };
    if (!foodIsMissingDoc_(row)) return { ok: false, error: '서류 제출을 표시할 수 있는 신청 행이 아닙니다.' };
    updateRecord_('status_changes', row.id, { doc_submitted: 'TRUE' }, user.email);
    return { ok: true };
  });
}
