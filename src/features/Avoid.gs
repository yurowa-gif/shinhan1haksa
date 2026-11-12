/**
 * C21 떨어뜨릴 짝 관리(결정 64, 접두어 avd). 좌석·방 초안이 두 학생을 붙이지 않도록 하는 목록.
 * 짝과 사유는 관리자·학사 교사만 본다(avoid.view·avoid.edit). 다른 어떤 화면·응답에도 짝 정보를 싣지 않는다 —
 * 좌석·방 화면의 위반 표시는 보는 사람 권한에 따라 서버가 거른다(C22·C23).
 * 행은 지우지 않는다: 취소는 status '취소' + audit_log(avoid_pairs 탭에는 취소 사유 열이 없다). 학생 둘은 바꿀 수 없다(취소 후 새로 추가).
 * ASSUMPTION: 짝으로 고를 수 있는 학생은 이번 기간에 등록된 학생. 이미 만든 짝은 퇴실·등록 해제 뒤에도 목록에 남는다(inTerm:false 표시).
 */
var AVD_SCOPES = ['좌석', '방', '둘 다'];
var AVD_REASON_MAX = 200;

function avdErr_(field, message) { return { ok: false, errors: [{ field: field, message: message }] }; }

/** 두 학생 id를 순서 없이 한 키로 */
function avdKey_(a, b) { return String(a) < String(b) ? a + '|' + b : b + '|' + a; }

function avdLive_(row) { return String(row.status || '').trim() !== '취소'; }

function avdStudent_(s, inTerm) {
  return { id: s.id, grade: Number(s.grade) || 0, classNo: s.class_no || '', name: s.name, gender: s.gender, display: (Number(s.grade) || s.grade) + '. ' + s.name, inTerm: inTerm };
}

function avdLoad_() {
  ['avoid_pairs', 'students', 'enrollments', 'terms'].forEach(function (t) { invalidate_('db', t); });
  var term = getCurrentTerm_();
  var students = readAll_('students'), byId = {};
  students.forEach(function (s) { byId[s.id] = s; });
  var enrolled = {};
  if (term) readAll_('enrollments').forEach(function (e) { if (e.term_id === term.id) enrolled[e.student_id] = true; });
  return { term: term, byId: byId, enrolled: enrolled, pairs: readAll_('avoid_pairs') };
}

function avdPairOut_(row, d) {
  var a = d.byId[row.student_a], b = d.byId[row.student_b];
  return {
    id: row.id, live: avdLive_(row), scope: row.scope, reason: row.reason || '', updatedAt: row.updated_at || '', updatedBy: row.updated_by || '',
    a: a ? avdStudent_(a, !!d.enrolled[a.id]) : { id: row.student_a, display: '(알 수 없는 학생)', inTerm: false },
    b: b ? avdStudent_(b, !!d.enrolled[b.id]) : { id: row.student_b, display: '(알 수 없는 학생)', inTerm: false }
  };
}

/** 짝 목록(살아 있는 것 먼저, 최근 고친 순) + 고를 수 있는 학생(이번 기간 등록) → {pairs, students, canEdit, termName} */
function getAvoidPairs() {
  var user = requirePermission_('avoid.view');
  var d = avdLoad_();
  var pairs = d.pairs.map(function (r) { return avdPairOut_(r, d); }).sort(function (x, y) {
    if (x.live !== y.live) return x.live ? -1 : 1;
    return x.updatedAt < y.updatedAt ? 1 : (x.updatedAt > y.updatedAt ? -1 : 0);
  });
  var students = Object.keys(d.enrolled).map(function (id) { return d.byId[id]; }).filter(Boolean)
    .sort(function (x, y) { return (Number(x.grade) - Number(y.grade)) || (Number(x.class_no) - Number(y.class_no)) || (Number(x.number) - Number(y.number)) || (x.name < y.name ? -1 : 1); })
    .map(function (s) { var o = avdStudent_(s, true); o.number = Number(s.number) || 0; o.studentNo = s.student_no || ''; return o; });   // 학생 찾기(UI.studentPicker)용 — 이 응답은 avoid.view만 받는다
  return { pairs: pairs, students: students, canEdit: hasAnyAllowedRole_(user.roles, permissions_()['avoid.edit'].roles), termName: d.term ? d.term.name : '', scopes: AVD_SCOPES };
}

/** 사유 검사: 선택 항목, 200자 이내, 문자열만 → {ok, value} 또는 오류 */
function avdReason_(reason) {
  if (reason === undefined || reason === null) return { ok: true, value: '' };
  if (typeof reason !== 'string') return avdErr_('reason', '사유는 글로 적어 주세요.');
  var v = reason.trim();
  if (v.length > AVD_REASON_MAX) return avdErr_('reason', '사유는 ' + AVD_REASON_MAX + '자 안으로 적어 주세요.');
  return { ok: true, value: v };
}

/** 짝 추가 input = {studentA, studentB, scope, reason?} → {ok, id} */
function saveAvoidPair(input) {
  var user = requirePermission_('avoid.edit');
  if (!input || typeof input !== 'object') return avdErr_('studentA', '짝으로 만들 두 학생을 골라 주세요.');
  var a = String(input.studentA || ''), b = String(input.studentB || '');
  if (!a) return avdErr_('studentA', '첫 번째 학생을 골라 주세요.');
  if (!b) return avdErr_('studentB', '두 번째 학생을 골라 주세요.');
  if (a === b) return avdErr_('studentB', '서로 다른 두 학생을 골라 주세요.');
  if (typeof input.scope !== 'string' || AVD_SCOPES.indexOf(input.scope) < 0) return avdErr_('scope', '적용 범위(좌석·방·둘 다)를 골라 주세요.');
  var why = avdReason_(input.reason);
  if (!why.ok) return why;
  return withLock_(function () {
    var d = avdLoad_();
    if (!d.term) return avdErr_('studentA', '운영 기간을 찾을 수 없습니다.');
    if (!d.byId[a] || !d.enrolled[a]) return avdErr_('studentA', '이번 기간에 등록된 학생이 아닙니다. 새로 고친 뒤 다시 골라 주세요.');
    if (!d.byId[b] || !d.enrolled[b]) return avdErr_('studentB', '이번 기간에 등록된 학생이 아닙니다. 새로 고친 뒤 다시 골라 주세요.');
    var key = avdKey_(a, b);
    var dup = d.pairs.filter(function (r) { return avdLive_(r) && avdKey_(r.student_a, r.student_b) === key; })[0];
    if (dup) return avdErr_('studentB', '이미 같은 짝이 있습니다(' + dup.scope + '). 범위를 바꾸려면 그 짝을 고치세요.');
    var rec = appendRecord_('avoid_pairs', { student_a: a, student_b: b, scope: input.scope, reason: why.value, status: '유효' }, user.email);
    return { ok: true, id: rec.id };
  });
}

/** 범위·사유 고치기 patch = {scope?, reason?}. 학생 둘은 못 바꾼다 */
function updateAvoidPair(id, patch) {
  var user = requirePermission_('avoid.edit');
  if (!patch || typeof patch !== 'object') return avdErr_('scope', '고칠 내용이 없습니다.');
  var change = {};
  if (patch.scope !== undefined) {
    if (typeof patch.scope !== 'string' || AVD_SCOPES.indexOf(patch.scope) < 0) return avdErr_('scope', '적용 범위(좌석·방·둘 다)를 골라 주세요.');
    change.scope = patch.scope;
  }
  if (patch.reason !== undefined) {
    var why = avdReason_(patch.reason);
    if (!why.ok) return why;
    change.reason = why.value;
  }
  if (!Object.keys(change).length) return avdErr_('scope', '고칠 내용이 없습니다.');
  return withLock_(function () {
    var d = avdLoad_();
    var row = d.pairs.filter(function (r) { return r.id === String(id || ''); })[0];
    if (!row) return avdErr_('id', '짝을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.');
    if (!avdLive_(row)) return avdErr_('id', '이미 취소된 짝은 고칠 수 없습니다. 새로 추가해 주세요.');
    if ((change.scope === undefined || change.scope === row.scope) && (change.reason === undefined || change.reason === (row.reason || ''))) return { ok: true, noop: true };
    updateRecord_('avoid_pairs', row.id, change, user.email);
    return { ok: true };
  });
}

/** 짝 취소(삭제 아님). 이미 취소됐으면 오류 */
function cancelAvoidPair(id) {
  var user = requirePermission_('avoid.edit');
  return withLock_(function () {
    var d = avdLoad_();
    var row = d.pairs.filter(function (r) { return r.id === String(id || ''); })[0];
    if (!row) return avdErr_('id', '짝을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.');
    if (!avdLive_(row)) return avdErr_('id', '이미 취소된 짝입니다.');
    updateRecord_('avoid_pairs', row.id, { status: '취소' }, user.email);
    return { ok: true };
  });
}
