/**
 * C32 F12 상담일지(교사 쪽, 5단계). 전역 이름 접두어 cnl. PRD F12, 결정 42, docs/plan/stage6-rules-draft.md 2절 공개 판정표(교사 쪽 줄).
 * 일반 상담을 2단계의 2OUT 면담(Counsel.gs)과 같은 상담일지 파일·같은 탭(counsel_notes, kind 'counsel')에 쓴다 — 열 추가 없음.
 *
 * - 쓰기(counsel.save): 그 학생의 담당교사만. 학생·날짜·유형·대상(학생/학부모)·내용(2000자)·학부모에게 상담 여부 보이기(기본 보임).
 *   유형은 settings counsel.types(기본 학업·생활·진로·건강·가정·기타). '2OUT 학부모 면담'은 OUT 화면에서만 쓰는 예약어라 이 화면에서 고를 수 없다.
 * - 고치기 = 취소 + 새 행(내용을 제자리에서 고치지 않는다, 결정 42). 취소 사유 필수. 취소·고치기는 쓴 담당교사 본인만.
 * - 보기(counsel.view): 담당교사·담임(자기 반)·관리자만. 다른 학사 교사·출결 담당·근무표 담당자는 응답 자체가 없다(권한 거부).
 *   내용은 이 파일의 응답에만 나가고, 운영 DB audit_log에는 글자 수만 남는다(Db.gs 상담 kind 마스크).
 * - 학부모에게는 '상담 날짜·교사'만 보인다(show_to_parent가 TRUE일 때, 학부모 화면은 0단계 진단 뒤 — 이 파일에서는 표시값만 정하고 보이지 않는다).
 * - 2OUT 학부모 면담 행은 목록에 읽기 전용으로 보인다(취소는 OUT 화면에서만, saveOutMeeting·cancelOutMeeting 몫).
 * ASSUMPTION: 상담 날짜는 오늘 이하이고 그 날짜가 속한 운영 기간에 그 학생이 등록돼 있어야 한다(학사생만, 결정 11).
 * ASSUMPTION: 같은 교사가 같은 학생·날짜·유형·대상·내용을 다시 보내면(두 번 누르기) 한 번만 저장한다.
 */
var CNL_TYPES_KEY = 'counsel.types';
var CNL_DEFAULT_TYPES = ['학업', '생활', '진로', '건강', '가정', '기타'];
var CNL_TARGETS = ['학생', '학부모'];
var CNL_REASON_MIN = 2;
var CNL_REASON_MAX = 200;

/** settings counsel.types(쉼표 목록, 빈칸·행 없음 = 기본값). 예약어 '2OUT 학부모 면담'과 겹치는 이름·중복은 뺀다. */
function cnlTypes_() {
  var row = readAll_('settings', 'config').filter(function (r) { return String(r.key || '').trim() === CNL_TYPES_KEY; })[0];
  var list = row ? String(row.value || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; }) : [];
  var out = [];
  (list.length ? list : CNL_DEFAULT_TYPES).forEach(function (t) { if (t !== CNS_TYPE_OUT2 && out.indexOf(t) < 0) out.push(t); });
  return out.length ? out : CNL_DEFAULT_TYPES.slice();
}

function cnlOne_(s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no }; }

/** 이번 기간 그 교사의 담당 학생인가(보기 편의 — 서버 함수가 counsel.save로 다시 판정한다) */
function cnlIsMine_(user, enrollments, term, studentId) {
  return !!term && hasRole_(user, 'hall_teacher') && enrollments.some(function (e) { return e.term_id === term.id && e.student_id === studentId && normalizeEmail_(e.teacher_email) === user.email; });
}

/** 입력 검사(순수). input = {date, type, target, content, showToParent} → {errors:[{field,message}], rec} */
function cnlValidate_(input, ctx) {
  input = input || {};
  var errors = [], err = function (field, message) { errors.push({ field: field, message: message }); };
  var date = String(input.date || '').trim();
  if (!ymdIsValid_(date)) err('date', '상담 날짜를 골라 주세요.');
  else if (date > ctx.today) err('date', '앞으로의 날짜는 기록할 수 없습니다.');
  var type = String(input.type || '').trim();
  if (type === CNS_TYPE_OUT2) err('type', "'2OUT 학부모 면담'은 OUT 화면의 [퇴실 대상]에서만 기록합니다. 다른 유형을 골라 주세요.");
  else if (ctx.types.indexOf(type) < 0) err('type', '유형을 목록에서 골라 주세요.');
  var target = String(input.target || '').trim();
  if (CNL_TARGETS.indexOf(target) < 0) err('target', '상담 대상(학생 또는 학부모)을 골라 주세요.');
  var content = String(input.content === undefined || input.content === null ? '' : input.content).trim();
  if (!content) err('content', '상담 내용을 적어 주세요.');
  else if (content.length > CNS_CONTENT_MAX) err('content', '상담 내용은 ' + CNS_CONTENT_MAX + '자 안으로 적어 주세요.');
  var show = input.showToParent === undefined || input.showToParent === null ? true : input.showToParent === true;   // 기본 보임
  return { errors: errors, rec: errors.length ? null : { date: date, type: type, target: target, content: content, show: show } };
}

/** 그 날짜가 속한 기간에 등록돼 있는 학생인지 → 오류 문구('' = 통과) */
function cnlEnrollError_(studentId, date, terms, enrollments) {
  var term = termOnDate_(date, terms);
  if (!term) return '상담 날짜가 어떤 운영 기간에도 속하지 않습니다.';
  return enrollments.some(function (e) { return e.term_id === term.id && e.student_id === studentId; }) ? '' : '"' + term.name + '" 명단에 없는 학생입니다(학사생만 기록합니다).';
}

function cnlLoad_() {
  ['terms', 'students', 'enrollments', 'users'].forEach(function (n) { invalidate_('db', n); });
  invalidate_('config', 'settings');
  invalidate_('counsel', 'counsel_notes');
  return { terms: readAll_('terms'), students: readAll_('students'), enrollments: readAll_('enrollments'), today: today_() };
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 시작값: 유형 목록과 볼 수 있는 학생 목록(내용 없음). 담당교사 = 내 담당 학생, 담임 = 자기 반(이번 기간 등록), 관리자 = 이번 기간 학사생 전체.
 * 목록 권한 counsel.list는 역할만(학생 범위는 이 함수가 계산 — 학생 한 명의 기록은 counsel.view가 다시 판정한다).
 */
function getCounselContext() {
  var user = requirePermission_('counsel.list');
  var term = getCurrentTerm_();
  var students = readAll_('students'), byId = {};
  students.forEach(function (s) { byId[s.id] = s; });
  var ids = {};
  if (term) {
    readAll_('enrollments').forEach(function (e) {
      if (e.term_id !== term.id || !byId[e.student_id]) return;
      var s = byId[e.student_id];
      if (hasRole_(user, 'admin') || (hasRole_(user, 'hall_teacher') && normalizeEmail_(e.teacher_email) === user.email) ||
        (hasRole_(user, 'homeroom') && sameClass_(user.homeroomClass, s.grade, s.class_no))) ids[e.student_id] = true;
    });
  }
  var mine = {};
  if (term) readAll_('enrollments').forEach(function (e) { if (e.term_id === term.id && normalizeEmail_(e.teacher_email) === user.email && hasRole_(user, 'hall_teacher')) mine[e.student_id] = true; });
  return { today: today_(), term: term ? { id: term.id, name: term.name } : null, types: cnlTypes_(),
    students: students.filter(function (s) { return ids[s.id]; }).sort(function (a, b) { return String(a.student_no).localeCompare(String(b.student_no)); })
      .map(function (s) { var o = cnlOne_(s); o.mine = !!mine[s.id]; return o; }) };
}

/**
 * 한 학생의 상담 기록(내용 포함 — 담당교사·담임(자기 반)·관리자만, 그 밖은 권한 거부). 취소된 행도 사유와 함께 보인다(지우지 않는다). 새로 쓴 것이 위.
 * → {student, canWrite, types, notes:[{id, date, dateKo, type, target, teacher, content, showToParent, status, cancelReason, fixed(2OUT 면담), mine, canEdit}]}
 */
function getCounselNotes(studentId) {
  var user = requirePermission_('counsel.view', { studentId: studentId });
  var sid = String(studentId || '');
  var student = findById_('students', sid);
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  var term = getCurrentTerm_(), enr = readAll_('enrollments');
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || ''); });
  var mine = cnlIsMine_(user, enr, term, sid);
  var notes = readAll_('counsel_notes', 'counsel').filter(function (n) { return ruleStr_(n.student_id) === sid; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1); })
    .map(function (n) {
      var fixed = String(n.type).trim() === CNS_TYPE_OUT2, live = ruleRowLive_(n), author = normalizeEmail_(n.teacher_email) === user.email;
      return { id: n.id, date: String(n.date), dateKo: ymdIsValid_(String(n.date)) ? foodDateKo_(n.date) : String(n.date), type: String(n.type), target: String(n.target || ''),
        teacher: names[normalizeEmail_(n.teacher_email)] || '(등록 안 된 교사)', content: String(n.content || ''), showToParent: String(n.show_to_parent).toUpperCase() !== 'FALSE',
        status: live ? '유효' : '취소', cancelReason: String(n.cancel_reason || ''), fixed: fixed, mine: author, canEdit: live && !fixed && author && mine };
    });
  var enrolled = term ? enr.filter(function (e) { return e.term_id === term.id && e.student_id === sid; })[0] : null;
  var one = cnlOne_(student);
  one.teacher = enrolled ? (names[normalizeEmail_(enrolled.teacher_email)] || '') : '';   // 담당교사 이름(화면 머리줄)
  return { student: one, canWrite: mine, types: cnlTypes_(), notes: notes };
}

function cnlFindNote_(noteId) { return findById_('counsel_notes', String(noteId || ''), 'counsel'); }

/** 같은 상담(학생·날짜·유형·대상·교사·내용이 같은 유효 행)이 이미 있나 */
function cnlDuplicate_(studentId, rec, email) {
  return readAll_('counsel_notes', 'counsel').filter(function (n) {
    return ruleRowLive_(n) && ruleStr_(n.student_id) === studentId && String(n.date) === rec.date && String(n.type).trim() === rec.type && String(n.target).trim() === rec.target &&
      normalizeEmail_(n.teacher_email) === email && String(n.content) === rec.content;
  })[0] || null;
}

function cnlRow_(studentId, rec, email) {
  return { student_id: studentId, date: rec.date, teacher_email: email, type: rec.type, target: rec.target, linked_violation_id: '', content: rec.content,
    show_to_parent: rec.show ? 'TRUE' : 'FALSE', status: '유효', cancel_reason: '' };
}

/**
 * 상담 기록 저장(그 학생의 담당교사만). input = {studentId, date, type, target, content, showToParent?}. 락 안에서 다시 읽고 다시 검사한다.
 * → {ok:true, id} | {ok:true, duplicate:true, id} | {ok:false, errors:[{field,message}]}
 */
function saveCounselNote(input) {
  var user = requirePermission_('counsel.save', { studentId: input && input.studentId });
  var err = function (field, message) { return { ok: false, errors: [{ field: field, message: message }] }; };
  return withLock_(function () {
    var d = cnlLoad_();
    var sid = String((input && input.studentId) || '');
    if (!findById_('students', sid)) return err('studentId', '학생을 찾을 수 없습니다.');
    var v = cnlValidate_(input, { today: d.today, types: cnlTypes_() });
    if (v.errors.length) return { ok: false, errors: v.errors };
    var bad = cnlEnrollError_(sid, v.rec.date, d.terms, d.enrollments);
    if (bad) return err('date', bad);
    var dup = cnlDuplicate_(sid, v.rec, user.email);
    if (dup) return { ok: true, duplicate: true, id: dup.id };
    var saved = appendRecord_('counsel_notes', cnlRow_(sid, v.rec, user.email), user.email, 'counsel');
    return { ok: true, id: saved.id };
  });
}

/**
 * 쓴 담당교사 본인의 상담을 확인하고(아니면 거부 기록) 그 학생이 아직 담당인지 counsel.save로 다시 판정한다. 락 안에서 부른다.
 * → {error} | {note, user}
 */
function cnlOwnNote_(noteId, user) {
  var note = cnlFindNote_(noteId);
  if (!note) return { error: '상담 기록을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.' };
  if (String(note.type).trim() === CNS_TYPE_OUT2) return { error: "'2OUT 학부모 면담'은 OUT 화면의 [퇴실 대상]에서만 취소합니다." };
  if (normalizeEmail_(note.teacher_email) !== user.email) {
    logDenied_(user.email, 'counsel.cancel', '남이 쓴 상담');
    throw new Error('권한이 없습니다.');
  }
  requirePermission_('counsel.save', { studentId: note.student_id });   // 지금도 그 학생의 담당교사여야 한다
  if (!ruleRowLive_(note)) return { error: '이미 취소된 상담입니다. 새로 고친 뒤 다시 해 주세요.' };
  return { note: note };
}

function cnlReasonError_(reason) {
  var why = String(reason === undefined || reason === null ? '' : reason).trim();
  if (why.length < CNL_REASON_MIN || why.length > CNL_REASON_MAX) return '취소 사유를 ' + CNL_REASON_MIN + '자 이상 ' + CNL_REASON_MAX + '자 안으로 적어 주세요.';
  return '';
}

/** 상담 취소(쓴 담당교사 본인만, 사유 필수). 지우지 않고 status를 '취소'로 바꾼다. → {ok:true} | {ok:false, errors} */
function cancelCounselNote(noteId, reason) {
  var user = requirePermission_('counsel.cancel');
  var bad = cnlReasonError_(reason);
  if (bad) return { ok: false, errors: [{ field: 'reason', message: bad }] };
  return withLock_(function () {
    cnlLoad_();
    var o = cnlOwnNote_(noteId, user);
    if (o.error) return { ok: false, errors: [{ field: 'noteId', message: o.error }] };
    updateRecord_('counsel_notes', o.note.id, { status: '취소', cancel_reason: String(reason).trim() }, user.email, 'counsel');
    return { ok: true };
  });
}

/**
 * 상담 고치기 = 취소 + 새 행(내용을 제자리에서 고치지 않는다, 결정 42). 쓴 담당교사 본인만, 취소 사유 필수. 학생은 바꿀 수 없다.
 * 새 행을 먼저 쓰고 옛 행을 취소한다(중간에 끊기면 기록이 사라지지 않고 겹칠 뿐이다). input = saveCounselNote와 같은 값(studentId는 무시).
 * → {ok:true, id(새 행)} | {ok:false, errors}
 */
function reviseCounselNote(noteId, input, reason) {
  var user = requirePermission_('counsel.cancel');
  var bad = cnlReasonError_(reason);
  if (bad) return { ok: false, errors: [{ field: 'reason', message: bad }] };
  return withLock_(function () {
    var d = cnlLoad_();
    var o = cnlOwnNote_(noteId, user);
    if (o.error) return { ok: false, errors: [{ field: 'noteId', message: o.error }] };
    var sid = ruleStr_(o.note.student_id);
    var v = cnlValidate_(input, { today: d.today, types: cnlTypes_() });
    if (v.errors.length) return { ok: false, errors: v.errors };
    var enrollBad = cnlEnrollError_(sid, v.rec.date, d.terms, d.enrollments);
    if (enrollBad) return { ok: false, errors: [{ field: 'date', message: enrollBad }] };
    var saved = appendRecord_('counsel_notes', cnlRow_(sid, v.rec, user.email), user.email, 'counsel');
    updateRecord_('counsel_notes', o.note.id, { status: '취소', cancel_reason: String(reason).trim() }, user.email, 'counsel');
    return { ok: true, id: saved.id };
  });
}

/**
 * 담당교사 홈 '상담일지' 카드(getHomeData 훅, 숫자만 — 내용·이름 없음). 담당교사만 값이 있다.
 * → {mine30(내가 최근 30일 안에 쓴 상담 수), withoutNote(이번 기간 상담 기록이 없는 내 담당 학생 수), total(내 담당 학생 수)} | null
 */
function cnlHomeInfo_(user, role) {
  if (role !== 'hall_teacher') return null;
  var term = getCurrentTerm_(), today = today_();
  if (!term) return { mine30: 0, withoutNote: 0, total: 0 };
  var mineIds = {}, total = 0;
  readAll_('enrollments').forEach(function (e) { if (e.term_id === term.id && normalizeEmail_(e.teacher_email) === user.email) { mineIds[e.student_id] = true; total++; } });
  var from = ymdAddDays_(today, -30), had = {}, mine30 = 0;
  readAll_('counsel_notes', 'counsel').forEach(function (n) {
    if (!ruleRowLive_(n)) return;
    if (mineIds[n.student_id] && String(n.date) >= term.start_date && String(n.date) <= term.end_date) had[n.student_id] = true;
    if (normalizeEmail_(n.teacher_email) === user.email && String(n.date) >= from && String(n.date) <= today && String(n.type).trim() !== CNS_TYPE_OUT2) mine30++;
  });
  return { mine30: mine30, withoutNote: Object.keys(mineIds).filter(function (id) { return !had[id]; }).length, total: total };
}
