/**
 * F0 운영 기간(terms) 관리 — C1. PRD 3.1.
 * 1학기·여름방학·2학기·겨울방학을 각각 하나의 운영 기간으로 둔다.
 *
 * 기록은 지우지 않는다: 삭제 함수를 만들지 않고, 수정은 updateRecord_가 audit_log에 전후 값을 남긴다.
 * terms 탭에는 status 열이 없다(plan 5절에 없음). 잘못 만든 기간은 이름·날짜를 고쳐 쓴다.
 *
 * 순수 함수(termValidate_ 등)는 tests/features/terms.test.js가 검사한다.
 * 이전 학기 명단 이어받기: RULES의 carryOverEnrollments_(R2)로 초안을 만들어 보여 주고, 관리자가 확인하면 등록(enrollments)을 추가한다.
 * 방학 기간에는 이어받기가 없다(방학에 나올 학생은 명단 올리기로 올린다). 학생·상태 기록은 그대로 두고 등록만 만든다.
 * ASSUMPTION: 기간이 겹치면 막지 않고 경고만 한다(getCurrentTerm_이 나중에 시작한 기간을 고른다).
 */

var TERM_TYPES = ['학기', '방학'];
var TERM_NAME_MAX = 40;

/** 'yyyy-MM-dd' 형식이고 실제로 있는 날짜인지(규칙 세션의 ymdIsValid_ 병합 전까지 쓰는 자체 검사) */
function termYmdOk_(s) {
  return ymdIsValid_(String(s || '').trim());   // 규칙 함수(carryOverEnrollments_ 등)와 같은 판정(0100~0999년 거부)
}

/**
 * 입력 검사(순수 함수).
 * @param {Object} input {id?, name, type, start_date, end_date, memo}
 * @param {Object[]} terms 지금 있는 기간 행들
 * @return {{ok:boolean, errors:{field:string,message:string}[], warnings:string[], record:Object}}
 */
function termValidate_(input, terms) {
  input = input || {};
  terms = terms || [];
  var errors = [];
  var warnings = [];
  var id = String(input.id || '');
  var rec = {
    name: String(input.name || '').trim(),
    type: String(input.type || '').trim(),
    start_date: String(input.start_date || '').trim(),
    end_date: String(input.end_date || '').trim(),
    memo: String(input.memo || '').trim()
  };
  var add = function (field, message) { errors.push({ field: field, message: message }); };

  if (!rec.name) add('name', '기간 이름을 적어 주세요. 예: 2027 1학기');
  else if (rec.name.length > TERM_NAME_MAX) add('name', '이름은 ' + TERM_NAME_MAX + '자 안으로 적어 주세요.');
  if (TERM_TYPES.indexOf(rec.type) < 0) add('type', '유형을 학기 또는 방학 중에서 골라 주세요.');
  var startOk = termYmdOk_(rec.start_date);
  var endOk = termYmdOk_(rec.end_date);
  if (!startOk) add('start_date', '시작일을 날짜로 골라 주세요.');
  if (!endOk) add('end_date', '종료일을 날짜로 골라 주세요.');
  if (startOk && endOk && rec.start_date > rec.end_date) {
    add('end_date', '종료일이 시작일보다 앞입니다. 종료일을 시작일 이후로 고쳐 주세요.');
  }

  var others = terms.filter(function (t) { return String(t.id) !== id; });
  if (rec.name && others.some(function (t) { return String(t.name).trim() === rec.name; })) {
    add('name', '같은 이름의 기간이 이미 있습니다. 다른 이름으로 적어 주세요.');
  }
  if (startOk && endOk && rec.start_date <= rec.end_date) {
    others.forEach(function (t) {
      if (t.start_date && t.end_date && rec.start_date <= t.end_date && t.start_date <= rec.end_date) {
        warnings.push('"' + t.name + '"(' + t.start_date + ' ~ ' + t.end_date + ')과 날짜가 겹칩니다.');
      }
    });
  }
  return { ok: errors.length === 0, errors: errors, warnings: warnings, record: rec };
}

/** 시작일 빠른 순(같으면 이름 순) */
function termSort_(terms) {
  return terms.slice().sort(function (a, b) {
    if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

/** 화면에 내보내는 모양(_row 같은 내부 값은 뺀다) */
function termView_(t, currentId) {
  return {
    id: t.id, name: t.name, type: t.type, start_date: t.start_date, end_date: t.end_date,
    memo: t.memo || '', isCurrent: !!currentId && t.id === currentId
  };
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/** 운영 기간 목록(시작일 순)과 오늘 날짜·현재 기간 */
function listTerms() {
  var user = requirePermission_('term.view');
  var current = getCurrentTerm_();
  var currentId = current ? current.id : '';
  return {
    today: today_(),
    canEdit: hasAnyAllowedRole_(user.roles, permissions_()['term.edit'].roles),
    types: TERM_TYPES.slice(),
    terms: termSort_(readAll_('terms')).map(function (t) { return termView_(t, currentId); })
  };
}

/**
 * 기간 추가(id 없음) 또는 수정(id 있음). 관리자만.
 * 검사에 걸리면 저장하지 않고 {ok:false, errors}를 돌려준다.
 */
function saveTerm(input) {
  var user = requirePermission_('term.edit');
  return withLock_(function () {
    invalidate_('db', 'terms');
    var terms = readAll_('terms');
    var check = termValidate_(input, terms);
    if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings };
    var id = String((input && input.id) || '');
    var saved;
    if (id) {
      if (!findById_('terms', id)) throw new Error('수정할 기간을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
      saved = updateRecord_('terms', id, check.record, user.email);
    } else {
      saved = appendRecord_('terms', check.record, user.email);
      ensureTermSheet_('exceptions', saved.id);   // 새 기간의 기간별 탭(특이사항)
    }
    return { ok: true, id: saved.id, warnings: check.warnings };
  });
}

/* ───────────── 이전 학기 명단 이어받기 ───────────── */

/**
 * 이어받기 계획(순수). terms·enrollments·changes·students는 시트 행.
 * @return {{ok:boolean, error?:string, applicable?:boolean, message?:string, term?:Object, fromTerm:Object|null,
 *           count?:number, drafts?:Object[], students?:{student_no:string,name:string}[]}}
 */
function termCarryPlan_(terms, enrollments, changes, students, termId) {
  var term = (terms || []).filter(function (t) { return t.id === String(termId || ''); })[0];
  if (!term) return { ok: false, error: '이어받을 기간을 골라 주세요.' };
  if (term.type !== '학기') {
    return { ok: true, applicable: false, term: term, fromTerm: null, count: 0, drafts: [], students: [],
      message: '방학 기간에는 이어받기가 없습니다. 방학에 나오는 학생은 "명단 올리기"로 올려 주세요.' };
  }
  var prev = null;
  (terms || []).forEach(function (t) {
    if (t.id === term.id || t.type !== '학기' || !(t.start_date < term.start_date)) return;
    if (!prev || t.start_date > prev.start_date) prev = t;
  });
  if (!prev) {
    return { ok: true, applicable: true, term: term, fromTerm: null, count: 0, drafts: [], students: [],
      message: '이어받을 직전 학기가 없습니다. 첫 학기는 "명단 올리기"로 올려 주세요.' };
  }
  var drafts = carryOverEnrollments_(terms, enrollments, changes, term);
  var byId = {};
  (students || []).forEach(function (s) { byId[s.id] = s; });
  return {
    ok: true, applicable: true, term: term, fromTerm: prev, count: drafts.length, drafts: drafts,
    students: drafts.map(function (d) { var s = byId[d.student_id] || {}; return { student_no: s.student_no || '', name: s.name || '' }; }),
    message: drafts.length ? '' : '이어받을 학생이 없습니다. 직전 학기("' + prev.name + '")에서 새 학기 시작일에 학사생인 학생이 이미 모두 등록되어 있거나 없습니다.'
  };
}

function termCarryView_(plan) {
  if (!plan.ok) return { ok: false, error: plan.error };
  return { ok: true, applicable: plan.applicable, message: plan.message, termName: plan.term.name,
    fromTermName: plan.fromTerm ? plan.fromTerm.name : '', count: plan.count, students: plan.students.slice(0, 200) };
}

function termCarryLoad_() {
  return { terms: readAll_('terms'), enrollments: readAll_('enrollments'), changes: readAll_('status_changes'), students: readAll_('students') };
}

/** 이어받기 미리보기(쓰기 없음). 관리자만. */
function previewCarryOver(termId) {
  requirePermission_('term.edit');
  var d = termCarryLoad_();
  return termCarryView_(termCarryPlan_(d.terms, d.enrollments, d.changes, d.students, termId));
}

/**
 * 이어받기 저장: 직전 학기 학사생의 등록을 새 기간에 만든다. 관리자만.
 * expectCount = 미리보기가 보여 준 인원. 락 안에서 다시 계산해 다르면 거부한다. 다시 눌러도 이미 등록된 학생은 건너뛴다.
 */
function commitCarryOver(termId, expectCount) {
  var user = requirePermission_('term.edit');
  return withLock_(function () {
    ['terms', 'enrollments', 'status_changes', 'students'].forEach(function (n) { invalidate_('db', n); });
    var d = termCarryLoad_();
    var plan = termCarryPlan_(d.terms, d.enrollments, d.changes, d.students, termId);
    if (!plan.ok) return { ok: false, error: plan.error };
    if (!plan.applicable || !plan.count) return { ok: false, error: plan.message || '이어받을 학생이 없습니다.' };
    if (plan.count !== Number(expectCount)) {
      return { ok: false, stale: true, error: '미리보기 이후 데이터가 바뀌었습니다. [미리보기]를 다시 눌러 인원을 확인해 주세요.' };
    }
    bulkAppend_('enrollments', plan.drafts.map(function (x) {
      return { term_id: x.term_id, student_id: x.student_id, teacher_email: x.teacher_email, veritas: x.veritas,
        commute_type: x.commute_type, end_type: x.end_type, memo: x.memo };
    }), user.email);
    return { ok: true, count: plan.count };
  });
}
