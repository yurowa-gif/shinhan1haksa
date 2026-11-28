/**
 * C49-B F17 학생·학부모가 보는 상담 기록(전역 이름 접두어 cms). 규칙은 R24 Stage6Rules.gs s6Visible_·s6CanWrite_, CounselRules.gs counselView_이 정한다.
 * 근거: 결정 90(합의 사항은 건마다 학생이 '부모님께 보이기'를 켜야 학부모에게 보임, 기본 비공개)·92(끄면 바로 사라짐, audit_log에 남김)·94(학생은 날짜·교사·합의 사항만)·97, CLAUDE.md 6번.
 *
 * - getMyCounselNotes(studentId): 학생 본인(비우면 본인) 또는 연결된 자녀의 학부모. 응답은 counselView_가 돌려준 칸만 —
 *   학생은 날짜·교사 이름·합의 사항, 학부모는 show_to_parent가 TRUE인 상담의 날짜·교사 이름 + 학생이 공개한 합의 사항. 상담 내용·유형·대상·교사 이메일은 없다.
 * - setAgreementShare(noteId, on): 학생 본인만, 건마다. 락 안에서 본인 상담인지·지금 학사생인지(결정 97) 다시 본다.
 */

function cmsNames_() {
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || ''); });
  return names;
}

/** 이 접속자가 그 학생을 어떤 자격으로 보나 → s6Visible_ viewer. 학생 본인 > 학부모(연결 자녀). 둘 다 아니면 role 'none' */
function cmsViewer_(user, studentId) {
  var who = portalWho_();
  if (hasRole_(user, 'student') && who.ownStudentIds.indexOf(studentId) >= 0) return { role: 'student', isSelf: true, isChild: false };
  if (hasRole_(user, 'parent') && who.childIds.indexOf(studentId) >= 0) return { role: 'parent', isSelf: false, isChild: true };
  return { role: 'none', isSelf: false, isChild: false };
}

/**
 * 내 상담 기록(학생) · 자녀 상담 기록(학부모). → {ok, viewer:'student'|'parent', student:{id,name}, canShare, notes:[{id, date, dateKo, teacher_name, agreement?, agreement_to_parent?}]}
 * 새 상담이 위. 취소된 상담은 학생·학부모에게 없다(s6Visible_). canShare = 학생 본인이고 지금 학사 입실(결정 97).
 */
function getMyCounselNotes(studentId) {
  var user = requirePermission_('counsel.note.view', { studentId: studentId || portalWho_().studentId });
  var sid = String(studentId || portalWho_().studentId || '');
  var student = findById_('students', sid);
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  var viewer = cmsViewer_(user, sid), names = cmsNames_();
  var notes = [];
  readAll_('counsel_notes', 'counsel').filter(function (n) { return ruleStr_(n.student_id) === sid && ymdIsValid_(String(n.date)); })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1); })
    .forEach(function (n) {
      var v = counselView_(n, viewer, { teacherName: names[normalizeEmail_(n.teacher_email)] || '' });
      if (!v) return;
      v.dateKo = foodDateKo_(v.date);
      notes.push(v);
    });
  var active = statusOn_(readAll_('status_changes'), sid, '학사', today_()) === '입실';
  return { ok: true, viewer: viewer.role, student: { id: student.id, name: student.name }, canShare: viewer.role === 'student' && s6CanWrite_(viewer, 'note.publish', { active: active }).ok, notes: notes };
}

/**
 * 합의 사항을 학부모에게 보이기/거두기(학생 본인만, 건마다). 켜면 학부모 화면에 바로 나오고, 끄면 바로 사라진다(결정 92).
 * counsel.agreement.publish는 역할만 보므로 본인 상담인지는 락 안에서 확인한다(남의 상담은 denied 기록 + 거부). 합의 사항이 비어 있으면 켤 수 없다.
 * 켜고 끈 것은 audit_log(update, agreement_to_parent 값)에 남는다 — 합의 사항 글은 글자 수만(결정 42).
 * → {ok:true, on} | {ok:false, stale?, errors:[{field,message}]}
 */
function setAgreementShare(noteId, on) {
  var user = requirePermission_('counsel.agreement.publish');
  var want = on === true || /^true$/i.test(String(on));
  return withLock_(function () {
    invalidate_('counsel', 'counsel_notes');
    ['terms', 'status_changes'].forEach(function (n) { invalidate_('db', n); });
    var note = findById_('counsel_notes', String(noteId || ''), 'counsel');
    if (!note) return { ok: false, stale: true, errors: [{ field: '', message: '상담 기록을 찾을 수 없습니다. 화면을 새로 불러와 주세요.' }] };
    var sid = ruleStr_(note.student_id);
    if (!hasRole_(user, 'student') || portalWho_().ownStudentIds.indexOf(sid) < 0) { logDenied_(user.email, 'counsel.agreement.publish', '남의 상담'); throw new Error(DENIED_MESSAGE); }
    if (!ruleRowLive_(note)) return { ok: false, stale: true, errors: [{ field: '', message: '취소된 상담입니다. 화면을 새로 불러와 주세요.' }] };
    var w = s6CanWrite_({ role: 'student', isSelf: true }, 'note.publish', { active: statusOn_(readAll_('status_changes'), sid, '학사', today_()) === '입실' });
    if (!w.ok) return { ok: false, errors: [{ field: '', message: w.reason }] };
    if (!ruleStr_(note.agreement)) return { ok: false, errors: [{ field: '', message: '합의 사항이 없는 상담은 부모님께 보일 내용이 없습니다.' }] };
    if (s6True_(note.agreement_to_parent) !== want) updateRecord_('counsel_notes', note.id, { agreement_to_parent: want ? 'TRUE' : 'FALSE' }, user.email, 'counsel');
    return { ok: true, on: want };
  });
}
