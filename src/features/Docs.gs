/**
 * C27 학기 초 서류 체크리스트(결정 75①, 접두어 doc). 서류 종류는 관리자가 정하고(doc_types), 학생·서류 종류마다 제출 여부를 기간별 탭(student_docs_<기간>)에 둔다.
 * - 행이 없으면 '미제출'. 상태: 제출·미제출·해당없음. 되돌려도 같은 행을 고치고(audit_log에 이전·이후) 지우지 않는다. 서류 종류는 '취소'로 끄고 행은 남는다.
 * - 보기: 관리자·출결 담당은 이번 기간 학사생 전체(보기만), 학사 교사는 담당 학생(그날 근무교사는 전체). 표시·변경은 doc.edit(학생 범위: 담당·근무교사·관리자, 서버 판정).
 * - 저장은 화면이 본 값(expect)과 지금 값이 같을 때만(다르면 {stale:true}): 두 선생님이 같은 칸을 동시에 바꾸는 일을 막는다.
 * - 기간은 이번 기간(getCurrentTerm_). 서류 미제출 표시(급식·입퇴실 신청서의 doc_submitted, 결정 60)와는 별개다.
 */
var DOC_STATES = ['제출', '미제출', '해당없음'];
var DOC_NAME_MAX = 40;
var DOC_DESC_MAX = 100;
var DOC_STALE_MSG = '다른 선생님이 먼저 바꿨습니다. 새로 불러온 뒤 다시 해 주세요.';
var DOC_NO_TAB_MSG = '이 기간의 서류 탭이 아직 없습니다. 관리자가 편집기에서 setup()을 한 번 실행해 주세요.';

function docLiveTypes_() {
  return readAll_('doc_types').filter(function (t) { return String(t.status || '').trim() !== '취소'; })
    .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name).localeCompare(String(b.name)); });
}

/** 그 기간의 student_docs 행. 탭이 아직 없으면 {rows:[], missing:true} */
function docRows_(term) {
  if (!term) return { rows: [], missing: false, sheet: '' };
  var sheet = termSheetName_('student_docs', term.id);
  try { return { rows: readAll_(sheet), missing: false, sheet: sheet }; } catch (e) {
    if (String(e.message).indexOf('탭이 없습니다') >= 0) return { rows: [], missing: true, sheet: sheet };
    throw e;
  }
}

/** {학생id: {서류종류id: 행}} (같은 칸에 여러 행이면 최근 수정한 것) */
function docIndex_(rows) {
  var idx = {};
  rows.forEach(function (r) {
    var s = (idx[r.student_id] = idx[r.student_id] || {});
    if (!s[r.doc_type_id] || String(r.updated_at) >= String(s[r.doc_type_id].updated_at)) s[r.doc_type_id] = r;
  });
  return idx;
}

function docStateOf_(idx, studentId, typeId) {
  var r = (idx[studentId] || {})[typeId];
  return r && DOC_STATES.indexOf(r.state) >= 0 ? r.state : '미제출';
}

/** 내가 서류를 볼 수 있는 학생 id 집합(이번 기간 학사생) */
function docVisibleIds_(user, term) {
  var enr = readAll_('enrollments').filter(function (e) { return term && e.term_id === term.id; });
  var all = hasRole_(user, 'admin') || hasRole_(user, 'attendance') || (hasRole_(user, 'hall_teacher') && isOnDutyFor_(user.email, '', 0));
  var ids = {};
  enr.forEach(function (e) {
    if (all || (hasRole_(user, 'hall_teacher') && normalizeEmail_(e.teacher_email) === user.email)) ids[e.student_id] = true;
  });
  return ids;
}

/** 순수: 학생 목록 + 서류 종류 + 색인 → 미제출 건수 */
function docMissingCount_(studentIds, types, idx) {
  var students = 0, total = 0;
  studentIds.forEach(function (sid) {
    var n = types.filter(function (t) { return docStateOf_(idx, sid, t.id) === '미제출'; }).length;
    if (n) { students++; total += n; }
  });
  return { students: students, items: total };
}

/** 서류 체크리스트 화면 자료 */
function getDocData() {
  var user = requirePermission_('doc.view');
  var term = getCurrentTerm_();
  var types = docLiveTypes_();
  var loaded = docRows_(term), idx = docIndex_(loaded.rows);
  var ids = docVisibleIds_(user, term);
  var teacherName = {};
  readAll_('users').forEach(function (u) { teacherName[normalizeEmail_(u.email)] = u.name; });
  var enrOf = {};
  readAll_('enrollments').forEach(function (e) { if (term && e.term_id === term.id) enrOf[e.student_id] = e; });
  var students = readAll_('students').filter(function (s) { return ids[s.id]; })
    .sort(function (a, b) { return String(a.student_no).localeCompare(String(b.student_no)); })
    .map(function (s) {
      var docs = {};
      types.forEach(function (t) { docs[t.id] = docStateOf_(idx, s.id, t.id); });
      var en = enrOf[s.id];
      return { id: s.id, student_no: s.student_no, name: s.name, display: s.student_no + ' ' + s.name, teacher: en ? teacherName[normalizeEmail_(en.teacher_email)] || '' : '', docs: docs };
    });
  var missing = docMissingCount_(students.map(function (s) { return s.id; }), types, idx);
  return {
    term: term ? term.name : '', hasTerm: !!term, missingTab: loaded.missing,
    canEdit: hasAnyAllowedRole_(user.roles, permissions_()['doc.edit'].roles),
    canTypes: hasAnyAllowedRole_(user.roles, permissions_()['doc.types'].roles),
    types: types.map(function (t) { return { id: t.id, name: t.name, description: t.description || '', sort_order: Number(t.sort_order) || 0, token: String(t.updated_at || '') }; }),
    students: students, missing: missing
  };
}

/** 한 칸 저장. input = {studentId, docTypeId, state, expect}. expect = 화면이 본 상태(다르면 stale) */
function saveDocState(input) {
  var user = requirePermission_('doc.edit', { studentId: String((input && input.studentId) || '') });
  input = input || {};
  var studentId = String(input.studentId || ''), typeId = String(input.docTypeId || ''), state = String(input.state || '');
  if (DOC_STATES.indexOf(state) < 0) return { ok: false, error: '제출·미제출·해당없음 중에서 골라 주세요.' };
  return withLock_(function () {
    ['doc_types', 'enrollments'].forEach(function (t) { invalidate_('db', t); });
    var term = getCurrentTerm_();
    if (!term) return { ok: false, error: '운영 기간이 없습니다.' };
    var enrolled = readAll_('enrollments').some(function (e) { return e.term_id === term.id && e.student_id === studentId; });
    if (!enrolled) return { ok: false, error: '이번 기간 학사생이 아닙니다.' };
    if (!docLiveTypes_().some(function (t) { return t.id === typeId; })) return { ok: false, error: '없어졌거나 취소된 서류 종류입니다. 새로 불러와 주세요.', stale: true };
    var sheet = termSheetName_('student_docs', term.id);
    var loaded = docRows_(term);
    if (loaded.missing) return { ok: false, error: DOC_NO_TAB_MSG };
    invalidate_('db', sheet);
    var cur = docIndex_(readAll_(sheet));
    var now = docStateOf_(cur, studentId, typeId);
    if (typeof input.expect !== 'string' || input.expect !== now) return { ok: false, stale: true, error: DOC_STALE_MSG };
    if (now === state) return { ok: true, state: state, unchanged: true };
    var row = (cur[studentId] || {})[typeId];
    var patch = { state: state, submitted_date: state === '제출' ? today_() : '' };
    if (row) updateRecord_(sheet, row.id, patch, user.email);
    else appendRecord_(sheet, { term_id: term.id, student_id: studentId, doc_type_id: typeId, state: state, submitted_date: patch.submitted_date, memo: '' }, user.email);
    return { ok: true, state: state };
  });
}

/** 서류 종류 추가·고치기(관리자). input = {id?, name, description, sort_order, token}. 고칠 때 token = 화면이 본 updated_at */
function saveDocType(input) {
  var user = requirePermission_('doc.types');
  input = input || {};
  var name = String(input.name || '').trim(), desc = String(input.description || '').trim();
  var errors = [];
  if (!name) errors.push({ field: 'name', message: '서류 이름을 적어 주세요.' });
  if (name.length > DOC_NAME_MAX) errors.push({ field: 'name', message: '이름은 ' + DOC_NAME_MAX + '자 안으로 적어 주세요.' });
  if (desc.length > DOC_DESC_MAX) errors.push({ field: 'description', message: '설명은 ' + DOC_DESC_MAX + '자 안으로 적어 주세요.' });
  var order = String(input.sort_order === undefined || input.sort_order === null ? '' : input.sort_order).trim();
  if (order !== '' && !/^\d{1,4}$/.test(order)) errors.push({ field: 'sort_order', message: '순서는 0~9999 숫자로 적어 주세요.' });
  if (errors.length) return { ok: false, errors: errors };
  return withLock_(function () {
    invalidate_('db', 'doc_types');
    var live = docLiveTypes_();
    if (live.some(function (t) { return t.name === name && t.id !== input.id; })) return { ok: false, errors: [{ field: 'name', message: '같은 이름의 서류가 이미 있습니다.' }] };
    if (input.id) {
      var row = live.filter(function (t) { return t.id === input.id; })[0];
      if (!row) return { ok: false, stale: true, error: DOC_STALE_MSG };
      if (typeof input.token !== 'string' || input.token !== String(row.updated_at || '')) return { ok: false, stale: true, error: DOC_STALE_MSG };
      updateRecord_('doc_types', row.id, { name: name, description: desc, sort_order: order === '' ? row.sort_order : order }, user.email);
      return { ok: true, id: row.id };
    }
    var max = live.reduce(function (m, t) { return Math.max(m, Number(t.sort_order) || 0); }, 0);
    var made = appendRecord_('doc_types', { name: name, description: desc, sort_order: order === '' ? String(max + 1) : order, status: '유효' }, user.email);
    return { ok: true, id: made.id };
  });
}

/** 서류 종류 끄기('취소', 제출 기록은 남는다). 관리자만 */
function cancelDocType(id, token) {
  var user = requirePermission_('doc.types');
  return withLock_(function () {
    invalidate_('db', 'doc_types');
    var row = docLiveTypes_().filter(function (t) { return t.id === String(id || ''); })[0];
    if (!row) return { ok: false, stale: true, error: DOC_STALE_MSG };
    if (typeof token !== 'string' || token !== String(row.updated_at || '')) return { ok: false, stale: true, error: DOC_STALE_MSG };
    updateRecord_('doc_types', row.id, { status: '취소' }, user.email);
    return { ok: true };
  });
}

/** 홈 카드용 요약({items, students} 또는 null). 실패해도 홈이 막히지 않게 호출하는 쪽이 try로 감싼다 */
function docHomeInfo_(user) {
  var term = getCurrentTerm_();
  if (!term) return { items: 0, students: 0, types: 0 };
  var types = docLiveTypes_();
  var idx = docIndex_(docRows_(term).rows);
  var ids = Object.keys(docVisibleIds_(user, term));
  var m = docMissingCount_(ids, types, idx);
  return { items: m.items, students: m.students, types: types.length };
}
