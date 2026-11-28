/**
 * C50 F15 진로 프로필(결정 89·91·92·97·98). 규칙은 src/rules(CareerRules R25·Stage6Rules R24)에 있고 여기서는 시트를 읽고 쓰기만 한다.
 *  - 학생: 본인 프로필을 새 버전으로 낸다(덮어쓰지 않음, 지난 공개 항목 이어받기), 항목별 '부모님께 보이기'(가장 최근 버전만).
 *  - 학부모: 연결된 자녀의 **가장 최근 버전에서 공개된 항목만**. 응답에 그 칸만 담긴다(s6Visible_·s6Pick_) — 피드백·공개 안 한 항목은 이름조차 가지 않는다.
 *  - 담당교사·담임·관리자: 모든 항목·모든 버전 보기. 피드백(학생에게만 보임)은 기록의 운영 기간 담당교사만 쓴다(결정 97).
 *  - 학사생이 아니게 된 뒤에는 새로 쓰거나 고칠 수 없다(s6CanWrite_ active). 기록은 삭제하지 않는다(피드백은 취소 처리).
 * 신원은 portalWho_ 한 곳. 응답에는 보는 사람이 볼 수 있는 칸만 담긴다.
 */

var CAR_FIELDS = ['hopes', 'targets', 'interests', 'strengths', 'concerns'];
var CAR_STAFF_ROLES = ['hall_teacher', 'homeroom', 'admin'];

function carLoad_() {
  return { terms: readAll_('terms'), students: readAll_('students'), enrollments: readAll_('enrollments'), changes: readAll_('status_changes'),
    profiles: readAll_('career_profiles'), users: readAll_('users') };
}

function carStudentLabel_(s) { return s.grade + '학년 ' + s.class_no + '반 ' + s.number + '번'; }

function carEnrollment_(d, sid, termId) {
  return d.enrollments.filter(function (e) { return e.term_id === termId && e.student_id === sid; })[0] || null;
}

/** 학사생인가: 지금 운영 기간 등록 + 학사 입실(결정 97). 기간·등록이 없으면 아니다 */
function carActive_(d, sid, today) {
  var term = getCurrentTerm_();
  return !!term && isActiveOn_(d.changes, carEnrollment_(d, sid, term.id), today);
}

/**
 * 보는 사람의 role(s6Visible_ 입력). 교사는 기록의 운영 기간(termId)의 담당교사였는지로 판정한다(결정 97).
 * 우선순위: 담당 > 관리자 > 담임(자기 반, 그 기간 등록) > 그 밖(none)
 */
function carViewer_(user, d, sid, termId) {
  var who = portalWho_();
  if (who.ownStudentIds.indexOf(sid) >= 0) return { role: 'student', isSelf: true, isChild: false };
  if (who.childIds.indexOf(sid) >= 0) return { role: 'parent', isSelf: false, isChild: true };
  var en = carEnrollment_(d, sid, termId);
  if (hasRole_(user, 'hall_teacher') && en && normalizeEmail_(en.teacher_email) === user.email) return { role: 'assigned', isSelf: false, isChild: false };
  if (hasRole_(user, 'admin')) return { role: 'admin', isSelf: false, isChild: false };
  var st = d.students.filter(function (s) { return s.id === sid; })[0];
  if (hasRole_(user, 'homeroom') && en && st && sameClass_(user.homeroomClass, st.grade, st.class_no)) return { role: 'homeroom', isSelf: false, isChild: false };
  return { role: 'none', isSelf: false, isChild: false };
}

function carJson_(text) { try { var v = JSON.parse(String(text || '[]')); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

/** 프로필 행 → 응답. 판정표(s6Visible_)가 돌려준 칸만 담는다 — version·submitted_at·id도 그 칸이 있을 때만(학부모에게는 공개 항목뿐, 총괄 확정) */
function carProfileOut_(row, fields) {
  var p = s6Pick_(row, fields), out = {};
  if (!p) return null;
  if ('id' in p) out.id = row.id;
  if ('version' in p) out.version = Number(row.version);
  if ('submitted_at' in p) out.submittedAt = String(row.submitted_at || '');
  CAR_FIELDS.forEach(function (f) {
    if (f in p) out[f] = (f === 'hopes' || f === 'targets') ? carJson_(p[f]) : String(p[f] || '');
  });
  if ('parent_fields' in p) out.parentFields = s6ParentFields_(row, 'profile');
  return out;
}

function carUserName_(d, email) {
  var u = d.users.filter(function (x) { return normalizeEmail_(x.email) === normalizeEmail_(email); })[0];
  return u ? u.name : '';
}

function carFeedbackOut_(d, user, sid, profilesById) {
  return readAll_('feedback').filter(function (f) { return f.student_id === sid && f.target_kind === '진로 프로필' && ruleStr_(f.status) !== '취소'; })
    .sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : -1; })
    .map(function (f) {
      var fields = s6Visible_(carViewer_(user, d, sid, f.term_id), 'feedback', f);
      var p = s6Pick_(f, fields, { teacherName: carUserName_(d, f.teacher_email) });
      if (!p) return null;
      var out = { id: f.id };
      if ('content' in p) out.content = p.content;
      if ('teacher_name' in p) out.teacherName = p.teacher_name;
      else if ('teacher_email' in p) out.teacherName = carUserName_(d, f.teacher_email);   // 교사 화면: 이메일 대신 이름만 내보낸다
      if ('created_at' in p) out.at = String(f.created_at || '');
      if ('target_id' in p) { var pr = profilesById[p.target_id]; out.version = pr ? Number(pr.version) : 0; }
      if ('teacher_email' in p) out.mine = normalizeEmail_(f.teacher_email) === user.email;
      return out;
    }).filter(Boolean);
}

function carDue_(term, today) {
  var due = term ? ruleStr_(term.career_due) : '';
  return due && ymdIsValid_(due) ? { ymd: due, ko: foodDateKo_(due), passed: today > due } : null;
}

/** 이 사람이 열 화면의 역할: 요청한 역할이 있으면 그것, 없으면 학생 > 학부모 > 담당교사 > 담임 > 관리자 중 가진 첫 역할 */
function carRoleFor_(role) {
  var user = getCurrentUser_();
  var r = String(role || '');
  if (['student', 'parent', 'hall_teacher', 'homeroom', 'admin'].indexOf(r) >= 0) return r;
  return ['student', 'parent', 'hall_teacher', 'homeroom', 'admin'].filter(function (x) { return user.roles.indexOf(x) >= 0; })[0] || '';
}

/**
 * 화면 시작값. role = 'student'|'parent'|'hall_teacher'|'homeroom'|'admin'(없으면 가진 역할 중 첫 번째).
 * 학생 → {mode:'student', student, active, due} / 학부모 → {mode:'parent', children} /
 * 교사·관리자 → {mode:'staff', role, due, missing, total, list:[{id, label, name, state:'미제출'|'유예'|'제출', line}]}
 */
function getCareerContext(role) {
  var user = requirePermission_('home.view', { role: carRoleFor_(role) });
  var r = carRoleFor_(role), d = carLoad_(), term = getCurrentTerm_(), today = today_();
  var due = carDue_(term, today);
  if (r === 'student') {
    var sid = portalWho_().studentId, me = d.students.filter(function (s) { return s.id === sid; })[0];
    if (!me) return { ok: false, reason: '학생 명단에서 내 계정을 찾지 못했습니다. 담당 선생님께 알려 주세요.' };
    return { ok: true, mode: 'student', student: { id: me.id, name: me.name, label: carStudentLabel_(me) }, active: carActive_(d, sid, today), due: due };
  }
  if (r === 'parent') {
    return { ok: true, mode: 'parent', children: d.students.filter(function (s) { return portalWho_().childIds.indexOf(s.id) >= 0; })
      .map(function (s) { return { id: s.id, name: s.name, label: s.grade + '학년 ' + s.class_no + '반' }; }) };
  }
  if (CAR_STAFF_ROLES.indexOf(r) < 0) return { ok: false, reason: '이 화면은 볼 수 있는 역할이 아닙니다.' };
  if (!term) return { ok: true, mode: 'staff', role: r, due: null, missing: 0, total: 0, list: [] };
  var enrolled = d.enrollments.filter(function (e) { return e.term_id === term.id; });
  var mineIds = enrolled.filter(function (e) {
    if (r === 'admin') return true;
    if (r === 'hall_teacher') return normalizeEmail_(e.teacher_email) === user.email;
    var st = d.students.filter(function (s) { return s.id === e.student_id; })[0];
    return !!st && sameClass_(user.homeroomClass, st.grade, st.class_no);
  }).map(function (e) { return e.student_id; });
  var missing = {};
  careerMissing_(enrolled.filter(function (e) { return mineIds.indexOf(e.student_id) >= 0; }), d.changes, d.profiles, term, today).forEach(function (m) { missing[m.studentId] = m; });
  var list = d.students.filter(function (s) { return mineIds.indexOf(s.id) >= 0 && isActiveOn_(d.changes, carEnrollment_(d, s.id, term.id), today); }).sort(byClassNumber_).map(function (s) {
    var latest = careerLatest_(d.profiles, s.id, { termId: term.id }), m = missing[s.id], line, state;
    if (latest) { state = '제출'; line = Number(latest.version) + '번째 기록 · ' + foodDateKo_(String(latest.submitted_at).slice(0, 10)) + '에 냄'; }
    else if (m) { state = '미제출'; line = '낸 적 없음' + (due ? ' · 마감 ' + due.ko + ' 지남' : ''); }
    else { state = '유예'; line = '아직 안 냄' + (due ? ' · 마감 ' + due.ko : ''); }
    return { id: s.id, label: excDisplay_(s), name: s.name, state: state, line: line };
  });
  list.sort(function (a, b) { var o = { '미제출': 0, '유예': 1, '제출': 2 }; return o[a.state] - o[b.state]; });
  return { ok: true, mode: 'staff', role: r, due: due, missing: Object.keys(missing).length, total: list.length, list: list };
}

/**
 * 한 학생의 진로 프로필(보는 사람에 맞는 칸만). version을 주면 그 버전(없으면 가장 최근).
 * → {ok, student, viewer:{role}, total, versions:[{version, submittedAt}], current, isLatest, feedback, canWrite, canFeedback, due, active}
 * 학부모는 가장 최근 버전의 공개 항목만(versions·feedback 없음), 공개한 것이 없으면 {ok:true, none:true}.
 */
function getCareerStudent(studentId, version) {
  var user = requirePermission_('career.view', { studentId: studentId });
  var sid = String(studentId), d = carLoad_(), term = getCurrentTerm_(), today = today_();
  var st = d.students.filter(function (s) { return s.id === sid; })[0];
  if (!st) throw new Error('학생을 찾을 수 없습니다.');
  var all = careerRowsOf_(d.profiles, sid).sort(function (a, b) { return Number(a.version) - Number(b.version); });
  var latest = careerLatest_(d.profiles, sid);
  var head = { id: st.id, name: st.name, title: st.grade + '. ' + st.name, label: carStudentLabel_(st), track: st.track || '' };
  var en = term ? carEnrollment_(d, sid, term.id) : null;
  var active = carActive_(d, sid, today), due = carDue_(term, today);
  var base = carViewer_(user, d, sid, term ? term.id : '');
  if (en && base.role !== 'parent' && base.role !== 'student') head.teacherName = carUserName_(d, en.teacher_email);   // 학부모·학생 응답에는 교사 이름을 싣지 않는다
  if (base.role === 'parent') {
    var fields = latest ? s6Visible_(base, 'profile', latest, { isLatest: true }) : [];
    if (!fields.length) return { ok: true, none: true, student: head, viewer: { role: 'parent' } };
    return { ok: true, student: head, viewer: { role: 'parent' }, current: carProfileOut_(latest, fields), isLatest: true };
  }
  // 버전마다 보는 사람의 역할이 그 기록의 운영 기간으로 다시 정해진다(결정 97)
  var seen = all.filter(function (r) { return s6Visible_(carViewer_(user, d, sid, r.term_id), 'profile', r, { isLatest: latest && r.id === latest.id }).length > 0; });
  var pick = null;
  if (seen.length) pick = (version ? seen.filter(function (r) { return Number(r.version) === Number(version); })[0] : null) || seen[seen.length - 1];
  var out = { ok: true, student: head, viewer: { role: base.role }, total: seen.length, versions: seen.map(function (r) { return { version: Number(r.version), submittedAt: String(r.submitted_at) }; }),
    active: active, due: due, current: null, isLatest: false, feedback: [], canWrite: false, canFeedback: false };
  out.canWrite = s6CanWrite_(base, 'profile.submit', { active: active }).ok;
  if (!pick) return out;   // 아직 안 냄(학생·교사 화면의 빈 상태)
  var row = pick, rv = carViewer_(user, d, sid, row.term_id);
  out.isLatest = !!latest && row.id === latest.id;
  out.current = carProfileOut_(row, s6Visible_(rv, 'profile', row, { isLatest: out.isLatest }));
  var byId = {};
  all.forEach(function (r) { byId[r.id] = r; });
  out.feedback = carFeedbackOut_(d, user, sid, byId);
  out.canFeedback = s6CanWrite_(rv, 'feedback.write', { active: active }).ok;
  return out;
}

function carFail_(errors) { return { ok: false, errors: (Array.isArray(errors) ? errors : [errors]).map(String) }; }

/**
 * 진로 프로필 제출(학생 본인). input = {hopes, targets, interests, strengths, concerns, fields:{hopes:true,…}}.
 * 새 버전으로 쌓는다(덮어쓰지 않음). 학부모 공개 항목은 지난 버전 것을 이어받고, fields가 있으면 그 값으로 정한다.
 * → {ok:true, version} | {ok:false, errors:[문장]}
 */
function submitCareerProfile(input) {
  var user = requirePermission_('career.submit', { studentId: portalWho_().studentId });
  var sid = portalWho_().studentId;
  if (!sid) return carFail_('학생 명단에서 내 계정을 찾지 못했습니다.');
  input = input || {};
  var chk = careerProfileCheck_(input);
  if (!chk.row) return carFail_(chk.errors);
  return withLock_(function () {
    var d = carLoad_(), term = getCurrentTerm_(), today = today_();
    if (!term) return carFail_('지금은 운영 기간이 아니라 낼 수 없습니다.');
    var w = s6CanWrite_({ role: 'student', isSelf: true }, 'profile.submit', { active: carActive_(d, sid, today) });
    if (!w.ok) return carFail_(w.reason);
    var inherited = careerNextParentFields_(d.profiles, sid);
    var plan = careerPublishPlan_({ parent_fields: inherited }, { fields: input.fields || {} });
    if (plan.errors.length) return carFail_(plan.errors);
    var version = careerNextVersion_(d.profiles, sid);
    appendRecord_('career_profiles', Object.assign({ term_id: term.id, student_id: sid, version: String(version) }, chk.row,
      { parent_fields: plan.patch.parent_fields, submitted_at: nowIso_(), status: '유효', cancel_reason: '' }), user.email);
    return { ok: true, version: version };
  });
}

/**
 * '부모님께 보이기' 켜고 끄기(학생 본인, 가장 최근 버전만). fields = {hopes:true, targets:false, …}(적지 않은 항목은 그대로).
 * → {ok:true, parentFields, notice} | {ok:false, errors}. 끄면 notice에 '이미 보신 내용은 되돌릴 수 없습니다.'(결정 92). audit_log에 바뀐 값이 남는다.
 */
function setCareerPublish(profileId, fields) {
  var user = requirePermission_('career.publish', { studentId: portalWho_().studentId });
  var sid = portalWho_().studentId;
  return withLock_(function () {
    var d = carLoad_();
    var row = d.profiles.filter(function (r) { return r.id === String(profileId); })[0];
    if (!row || row.student_id !== sid || ruleStr_(row.status) === '취소') return carFail_('기록을 찾을 수 없습니다. 화면을 새로 불러와 주세요.');
    var latest = careerLatest_(d.profiles, sid);
    if (!latest || latest.id !== row.id) return carFail_('부모님께 보이기는 가장 최근 기록에서만 바꿀 수 있습니다. 화면을 새로 불러와 주세요.');
    var w = s6CanWrite_({ role: 'student', isSelf: true }, 'profile.publish', { active: carActive_(d, sid, today_()) });
    if (!w.ok) return carFail_(w.reason);
    var plan = careerPublishPlan_(row, { fields: fields || {} });
    if (plan.errors.length) return carFail_(plan.errors);
    if (plan.added.length || plan.removed.length) updateRecord_('career_profiles', row.id, plan.patch, user.email);
    return { ok: true, parentFields: s6ParentFields_(plan.patch, 'profile'), notice: plan.notice };
  });
}

/** 피드백 남기기(그 기록의 운영 기간 담당교사만). content 1~1000자. → {ok} | {ok:false, errors} */
function addCareerFeedback(studentId, profileId, content) {
  var user = requirePermission_('feedback.write', { studentId: studentId });
  var text = ruleStr_(content).trim();
  if (!text) return carFail_('피드백 내용을 적어 주세요.');
  if (text.length > CAREER_TEXT_MAX) return carFail_('피드백은 ' + CAREER_TEXT_MAX + '자까지 적을 수 있습니다. 지금 ' + text.length + '자입니다.');
  return withLock_(function () {
    var d = carLoad_(), sid = String(studentId);
    var row = d.profiles.filter(function (r) { return r.id === String(profileId) && r.student_id === sid && ruleStr_(r.status) !== '취소'; })[0];
    if (!row) return carFail_('기록을 찾을 수 없습니다. 화면을 새로 불러와 주세요.');
    var w = s6CanWrite_(carViewer_(user, d, sid, row.term_id), 'feedback.write', { active: carActive_(d, sid, today_()) });
    if (!w.ok) return carFail_(w.reason);
    appendRecord_('feedback', { term_id: row.term_id, student_id: sid, target_kind: '진로 프로필', target_id: row.id, content: text, teacher_email: user.email, status: '유효', cancel_reason: '' }, user.email);
    return { ok: true };
  });
}

/** 피드백 취소 처리(쓴 교사만, 지우지 않음). reason 2자 이상. */
function cancelCareerFeedback(feedbackId, reason) {
  var user = requirePermission_('feedback.cancel');
  var why = ruleStr_(reason).trim();
  if (why.length < 2) return carFail_('취소 사유를 2자 이상 적어 주세요.');
  return withLock_(function () {
    var row = readAll_('feedback').filter(function (f) { return f.id === String(feedbackId); })[0];
    if (!row || ruleStr_(row.status) === '취소') return carFail_('피드백을 찾을 수 없습니다. 화면을 새로 불러와 주세요.');
    requirePermission_('feedback.write', { studentId: row.student_id });
    if (normalizeEmail_(row.teacher_email) !== user.email) return carFail_('내가 쓴 피드백만 취소할 수 있습니다.');
    updateRecord_('feedback', row.id, { status: '취소', cancel_reason: why }, user.email);
    return { ok: true };
  });
}

/* ───────────── 홈 ───────────── */

/** 학사 교사 홈 숫자: 담당 학생 중 진로 프로필 미제출(결정 98). 관리자·담임 홈에는 없다(처리하는 사람이 아니다) */
function carHomeInfo_(user, role) {
  if (role !== 'hall_teacher') return null;
  var term = getCurrentTerm_();
  if (!term) return { missing: 0 };
  var d = carLoad_(), today = today_();
  var mine = d.enrollments.filter(function (e) { return e.term_id === term.id && normalizeEmail_(e.teacher_email) === user.email; });
  var list = careerMissing_(mine, d.changes, d.profiles, term, today);
  var due = carDue_(term, today);
  return { missing: list.length, dueKo: due ? due.ko : '' };
}

/** 학생 홈 한 칸: 이번 운영 기간에 냈는지·마감 */
function carStudentHome_(user) {
  var sid = portalWho_().studentId;
  if (!sid) return null;
  var term = getCurrentTerm_(), d = carLoad_(), today = today_();
  var latest = term ? careerLatest_(d.profiles, sid, { termId: term.id }) : null;
  var due = carDue_(term, today);
  return { submitted: !!latest, version: latest ? Number(latest.version) : 0, at: latest ? String(latest.submitted_at).slice(0, 10) : '', dueKo: due ? due.ko : '', duePassed: !!(due && due.passed), active: carActive_(d, sid, today) };
}
