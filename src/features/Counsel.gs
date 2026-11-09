/**
 * F12 최소(2단계, CODING-A): 2OUT 학부모 면담 기록과 퇴실 확정 관문. 전역 이름 접두어 cns. docs/plan/stage2.md C13.
 * 면담 행은 상담일지 파일(kind 'counsel')에만 쓴다. 내용(content)은 운영 DB audit_log에는 글자 수만 남고(Db.gs), 이 파일의 어떤 응답에도 나가지 않는다.
 */

var CNS_TYPE_OUT2 = '2OUT 학부모 면담';
var CNS_CONTENT_MAX = 2000;

/** 퇴실 관문이 읽는 면담 목록(내용 없이) */
function cnsNotesForGate_() {
  return readAll_('counsel_notes', 'counsel').map(function (n) {
    return { id: n.id, student_id: n.student_id, date: n.date, teacher_email: n.teacher_email, type: n.type, linked_violation_id: n.linked_violation_id, status: n.status };
  });
}

/**
 * 한 학생의 이번 기간 퇴실 확정 관문(R9 outDismissalGate_ 그대로) + 연결될 둘째 OUT 행. 읽기만 한다.
 * 저장·확정이 같은 락 안에서 다시 부른다(C20 saveMove도).
 * → {gate, term, trigger(둘째 OUT 행|null)}
 */
function cnsGateFor_(studentId) {
  var term = getCurrentTerm_();
  if (!term) throw new Error('운영 기간이 없습니다.');
  var rows = vioViolations_(term);
  var gate = outDismissalGate_(rows, cnsNotesForGate_(), readAll_('status_changes'), String(studentId || ''), term.id, today_());
  var trigger = gate.triggerOutId ? rows.filter(function (v) { return String(v.id) === gate.triggerOutId; })[0] || null : null;
  return { gate: gate, term: term, trigger: trigger };
}

/**
 * 2OUT 학부모 면담 기록(담당교사). input = {studentId, date, content}.
 * 락 안에서 2OUT 이상인지·면담 날짜(둘째 OUT 발생일 이상, 오늘 이하)를 확인하고 연결 OUT(linked_violation_id)은 서버가 정한다. 이미 면담이 있으면 취소 뒤에 다시.
 * → {ok:true, meeting:{date, teacher}} | {ok:false, errors:[{field,message}]}
 */
function saveOutMeeting(input) {
  var user = requirePermission_('counsel.save', { studentId: input && input.studentId });
  input = input || {};
  var err = function (field, message) { return { ok: false, errors: [{ field: field, message: message }] }; };
  var date = String(input.date || '').trim();
  if (!ymdIsValid_(date)) return err('date', '면담 날짜를 골라 주세요.');
  var content = String(input.content === undefined || input.content === null ? '' : input.content).trim();
  if (!content) return err('content', '면담 내용을 적어 주세요.');
  if (content.length > CNS_CONTENT_MAX) return err('content', '면담 내용은 ' + CNS_CONTENT_MAX + '자 안으로 적어 주세요.');
  return withLock_(function () {
    ['terms', 'enrollments', 'status_changes', 'students'].forEach(function (t) { invalidate_('db', t); });
    var term0 = getCurrentTerm_();
    if (term0) invalidate_('db', termSheetName_('violations', term0.id));
    invalidate_('counsel', 'counsel_notes');
    var student = findById_('students', String(input.studentId || ''));
    if (!student) return err('studentId', '학생을 찾을 수 없습니다.');
    var g = cnsGateFor_(student.id);
    if (g.gate.alreadyLeft) return err('studentId', '이미 퇴실했거나 퇴실이 잡혀 있는 학생입니다.');
    if (g.gate.count < 2) return err('studentId', '2OUT이 된 학생만 학부모 면담을 기록합니다.');
    if (g.gate.meetingNote) return err('date', '이미 면담이 기록되어 있습니다. 고치려면 먼저 그 면담을 취소해 주세요.');
    var from = String(g.trigger.occurred_at).slice(0, 10);
    if (date < from) return err('date', '면담 날짜는 2OUT이 된 날(' + (+from.slice(5, 7)) + '월 ' + (+from.slice(8, 10)) + '일) 이후여야 합니다.');
    if (date > today_()) return err('date', '앞으로의 날짜는 기록할 수 없습니다.');
    appendRecord_('counsel_notes', {
      student_id: student.id, date: date, teacher_email: user.email, type: CNS_TYPE_OUT2, target: '학부모', linked_violation_id: g.gate.triggerOutId,
      content: content, show_to_parent: 'TRUE', status: '유효', cancel_reason: ''
    }, user.email, 'counsel');
    return { ok: true, meeting: { date: date, teacher: String(user.name || '') } };
  });
}

/**
 * 면담 취소(작성한 담당교사 본인만). 첫 줄은 역할만 보고, 락 안에서 다시 읽어 본인 면담인지 확인한 뒤(아니면 거부 기록) 그 학생이 아직 담당인지 counsel.save로 다시 판정한다.
 * 이미 퇴실이 잡힌 학생의 면담은 취소할 수 없다(ASSUMPTION: 퇴실 확정의 근거를 없애지 않는다).
 * → {ok:true} | {ok:false, errors}
 */
function cancelOutMeeting(noteId, reason) {
  var user = requirePermission_('counsel.cancel');
  var err = function (field, message) { return { ok: false, errors: [{ field: field, message: message }] }; };
  var why = String(reason === undefined || reason === null ? '' : reason).trim();
  if (why.length < 2 || why.length > 200) return err('reason', '취소 사유를 2자 이상 200자 안으로 적어 주세요.');
  return withLock_(function () {
    ['terms', 'enrollments', 'status_changes', 'students'].forEach(function (t) { invalidate_('db', t); });
    var term0 = getCurrentTerm_();
    if (term0) invalidate_('db', termSheetName_('violations', term0.id));
    invalidate_('counsel', 'counsel_notes');
    var note = findById_('counsel_notes', String(noteId || ''), 'counsel');
    if (!note || String(note.type).trim() !== CNS_TYPE_OUT2) return err('noteId', '면담 기록을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.');
    if (normalizeEmail_(note.teacher_email) !== user.email) {
      logDenied_(user.email, 'counsel.cancel', '남이 쓴 면담');
      throw new Error('권한이 없습니다.');
    }
    requirePermission_('counsel.save', { studentId: note.student_id });   // 지금도 그 학생의 담당교사여야 한다
    if (!ruleRowLive_(note)) return err('noteId', '이미 취소된 면담입니다.');
    var g = cnsGateFor_(note.student_id);
    if (g.gate.alreadyLeft) return err('noteId', '이미 퇴실이 잡힌 학생의 면담은 취소할 수 없습니다.');
    updateRecord_('counsel_notes', note.id, { status: '취소', cancel_reason: why }, user.email, 'counsel');
    return { ok: true };
  });
}
