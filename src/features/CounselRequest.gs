/**
 * C49-A F17 상담 신청(전역 이름 접두어 crq). 규칙은 R24(CounselRules.gs counselRequestCheck_·counselRequestNext_, Stage6Rules.gs s6Visible_·s6Pick_·s6CanWrite_)가 정한다.
 * 근거: 결정 16(신청은 학생만)·90·94~97·103, docs/plan/stage6-rules-draft.md 2절, docs/design/stage6/screens.md 2·6절.
 * 신청은 상담일지와 같은 상담 파일의 counsel_requests 탭(kind 'counsel')에 쌓인다. 삭제하지 않고 status(신청·확정·완료·반려·취소)만 바꾼다.
 *
 * - 학생: 신청(희망 날짜 1~3개·주제 5가지·메모)·취소·내 목록. 열린(신청·확정) 신청은 1건(결정 95). 신원은 portalWho_ 한 곳(결정 82) — 화면이 보낸 studentId는 믿지 않는다.
 * - 담당교사: 목록·확정(희망 날짜 중 하나)·반려(사유 필수, 학생에게 보임). 확정 뒤 상담을 못 한 경우도 반려(화면 버튼 이름만 '상담 못 함', 결정 103).
 *   '완료'는 상담일지를 저장할 때 같은 락 안에서 일지와 이어서 바꾼다(C49-B, counselRequestNext_ complete).
 * - 담임: 날짜·주제·상태만(메모 없음, 결정 96). 서버 응답은 s6Visible_이 돌려준 칸만 담는다(s6Pick_) — 화면에서 숨기는 것은 보안이 아니다.
 * - 결정 97: 'assigned'는 그 신청의 term_id 기간에 담당이었던 교사. 권한 키는 '지금' 담당을 보므로 지난 신청은 여기서 term_id로 다시 판정한다.
 * - 메일(PRD "이메일 알림"): 새 신청은 담당교사에게, 확정·반려는 학생에게. 본문에 학생 이름·메모·사유를 넣지 않는다(결정 49 — 앱 주소로 확인).
 *   메일은 락 밖에서 notifyMail_로, 실패해도 저장은 되돌리지 않는다.
 * ASSUMPTION: 신청한 날(created_at)은 판정표(S6_TABLE.request)에 없는 칸이라 응답에 넣지 않는다 — 목록은 새 신청이 위로 정렬만 한다(RULES 세션이 칸을 더하면 화면에 붙인다).
 */
var CRQ_SHEET = 'counsel_requests';

function crqLoad_() {
  ['terms', 'students', 'enrollments', 'status_changes', 'users'].forEach(function (n) { invalidate_('db', n); });
  invalidate_('counsel', CRQ_SHEET);
  return { terms: readAll_('terms'), students: readAll_('students'), enrollments: readAll_('enrollments'), changes: readAll_('status_changes'), today: today_() };
}

function crqNames_() {
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || ''); });
  return names;
}

/** 그 기간(termId)에 그 학생의 담당교사 이메일(소문자). 없으면 '' */
function crqTeacherOf_(enrollments, termId, studentId) {
  var e = enrollments.filter(function (x) { return x.term_id === termId && x.student_id === studentId; })[0];
  return e ? normalizeEmail_(e.teacher_email) : '';
}

/**
 * 이 접속자가 그 학생의 그 기간(termId) 신청을 어떤 자격으로 보나 → s6Visible_의 viewer.
 * 학생 본인 > 관리자 > 그 기간 담당교사('assigned', 결정 97) > 자기 반 담임 > none. 학부모는 신청을 보지 못한다(none).
 */
function crqViewer_(user, student, termId, enrollments) {
  if (portalWho_().ownStudentIds.indexOf(student.id) >= 0 && hasRole_(user, 'student')) return { role: 'student', isSelf: true, isChild: false };
  if (hasRole_(user, 'admin')) return { role: 'admin', isSelf: false, isChild: false };
  if (hasRole_(user, 'hall_teacher') && crqTeacherOf_(enrollments, termId, student.id) === user.email) return { role: 'assigned', isSelf: false, isChild: false };
  if (hasRole_(user, 'homeroom') && sameClass_(user.homeroomClass, student.grade, student.class_no)) return { role: 'homeroom', isSelf: false, isChild: false };
  return { role: 'none', isSelf: false, isChild: false };
}

/** 한 신청을 보는 사람에 맞게 줄인다(s6Visible_이 돌려준 칸만) + 희망 날짜 배열. 못 보면 null */
function crqView_(row, viewer) {
  var v = s6Pick_(row, s6Visible_(viewer, 'request', row), {});
  if (!v) return null;
  if (v.wish_dates !== undefined) { v.wishDates = ruleStr_(v.wish_dates).split(';').filter(Boolean); delete v.wish_dates; }
  return v;
}

function crqStudentView_(s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number }; }

function crqErrors_(list) { return list.map(function (m) { return { field: '', message: m }; }); }

/** 그 학생이 지금 학사 입실인가(s6CanWrite_ ctx.active, 결정 97) */
function crqActive_(changes, studentId, today) { return statusOn_(changes, studentId, '학사', today) === '입실'; }

function crqMail_(to, subject, body, actorEmail) {
  var link = '';
  try { link = ScriptApp.getService().getUrl(); } catch (e) { link = ''; }
  try { return notifyMail_(to, subject, body + (link ? '\n\n' + link : ''), actorEmail).notified; } catch (e) { console.warn('상담 신청 알림 실패: ' + e.message); return false; }
}

/* ───────────── 읽기 ───────────── */

/**
 * 한 학생의 상담 신청(보는 사람에 맞는 칸만). 학생 본인(studentId를 비우면 본인)·담당교사·담임·관리자(counsel.request.view).
 * → {ok, student, teacherName, today, topics, role, canRequest, whyNot, canDecide, requests:[{id, term_id?, student_id, wishDates, topic, memo?, status, decided_date?, cancel_reason?}]}
 * canRequest는 학생 본인에게만 참(학사 입실 + 열린 신청 없음), canDecide는 지금 담당교사(또는 그 학생의 담당)일 때. 새 신청이 위.
 */
function getCounselRequestsOfStudent(studentId) {
  var user = requirePermission_('counsel.request.view', { studentId: studentId || portalWho_().studentId });   // 학생이 빈 값을 보내면 본인(화면이 자기 id를 몰라도 된다)
  var sid = String(studentId || portalWho_().studentId || '');
  var d = crqLoad_(), student = d.students.filter(function (s) { return s.id === sid; })[0];
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  var term = getCurrentTerm_(), names = crqNames_();
  var rows = readAll_(CRQ_SHEET, 'counsel').filter(function (r) { return ruleStr_(r.student_id) === sid; })
    .sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : String(a.created_at) > String(b.created_at) ? -1 : 0; });
  var requests = [];
  rows.forEach(function (r) {
    var v = crqView_(r, crqViewer_(user, student, r.term_id, d.enrollments));
    if (v) requests.push(v);
  });
  var now = term ? crqViewer_(user, student, term.id, d.enrollments) : { role: 'none' };
  var open = rows.some(function (r) { return COUNSEL_REQ_OPEN.indexOf(ruleStr_(r.status)) >= 0; });
  var active = crqActive_(d.changes, sid, d.today), can = { ok: false, reason: '' };
  if (now.role === 'student') can = s6CanWrite_(now, 'request.create', { active: active });
  var whyNot = now.role !== 'student' ? '' : !can.ok ? can.reason : open ? '진행 중인 신청이 있어 새로 신청할 수 없습니다. 선생님이 처리하거나 내가 취소하면 다시 신청할 수 있습니다.' : '';
  var tEmail = term ? crqTeacherOf_(d.enrollments, term.id, sid) : '';
  return { ok: true, student: crqStudentView_(student), teacherName: tEmail ? names[tEmail] || '' : '', today: d.today, topics: COUNSEL_REQ_TOPICS.slice(), role: now.role,
    canRequest: now.role === 'student' && can.ok && !open, whyNot: whyNot,
    canDecide: now.role === 'assigned' && s6CanWrite_(now, 'request.process', { active: active }).ok, requests: requests };
}

/**
 * 담당교사·관리자의 상담 신청 목록(counsel.request.list는 역할만 — 학생별 범위는 여기서 계산).
 * 담당교사 = 지금 자기 담당 학생(이번 기간 등록)의 신청 전부(지난 기간 신청 포함), 관리자 = 이번 기간 학사생 전체의 신청.
 * 지난 기간 담당이었지만 지금 담당이 아닌 교사는 이 목록에 넣지 않는다(결정 97 — 그 학생 화면에서 학생별로 본다).
 * → {ok, today, open:n(날짜를 아직 안 정한 '신청' 건수), requests:[{…crqView_, student:{id,name,grade,classNo,number}, canDecide}]}
 * 순서: 신청 → 확정 → 지난 신청. 신청·확정은 가장 이른 희망·확정 날짜 순(급한 것이 위), 지난 신청은 새 것이 위
 */
function getCounselRequestList() {
  var user = requirePermission_('counsel.request.list');
  var d = crqLoad_(), term = getCurrentTerm_();
  if (!term) return { ok: true, today: d.today, open: 0, requests: [] };
  var byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  var mine = {};
  d.enrollments.forEach(function (e) {
    if (e.term_id !== term.id || !byId[e.student_id]) return;
    if (hasRole_(user, 'admin') || (hasRole_(user, 'hall_teacher') && normalizeEmail_(e.teacher_email) === user.email)) mine[e.student_id] = true;
  });
  var out = [], open = 0;
  readAll_(CRQ_SHEET, 'counsel').forEach(function (r) {
    var s = byId[ruleStr_(r.student_id)];
    if (!s || !mine[s.id]) return;
    var viewer = crqViewer_(user, s, r.term_id, d.enrollments);
    var v = crqView_(r, viewer);
    if (!v) return;
    v.student = crqStudentView_(s);
    v.canDecide = viewer.role === 'assigned';   // 버튼을 그릴지만 알린다(처리할 때 서버가 다시 판정)
    v._at = String(r.created_at);
    v._first = v.status === '확정' ? ruleStr_(v.decided_date) : (v.wishDates || []).slice().sort()[0] || '';
    if (v.status === '신청') open++;
    out.push(v);
  });
  var rank = { '신청': 0, '확정': 1 };
  out.sort(function (a, b) {   // 처리할 것(신청·확정)은 가장 이른 날짜(희망·확정) 순, 지난 신청은 새 것이 위
    var ra = rank[a.status] === undefined ? 2 : rank[a.status], rb = rank[b.status] === undefined ? 2 : rank[b.status];
    if (ra !== rb) return ra - rb;
    if (ra < 2 && a._first !== b._first) return a._first < b._first ? -1 : 1;
    return a._at < b._at ? 1 : a._at > b._at ? -1 : 0;
  });
  out.forEach(function (v) { delete v._at; delete v._first; });
  return { ok: true, today: d.today, open: open, requests: out };
}

/** 담당교사 홈 카드(getHomeData 훅, 숫자만 — 이름·메모 없음). 날짜를 아직 안 정한 신청 수, 확정(상담 전·후) 수, 가장 빠른 희망 날짜 */
function crqHomeInfo_(user, role) {
  if (role !== 'hall_teacher' && role !== 'admin') return null;
  var term = getCurrentTerm_();
  if (!term) return { open: 0, fixed: 0, earliest: '' };
  var mine = {};
  readAll_('enrollments').forEach(function (e) {
    if (e.term_id === term.id && (role === 'admin' || normalizeEmail_(e.teacher_email) === user.email)) mine[e.student_id] = true;
  });
  var open = 0, fixed = 0, earliest = '';
  readAll_(CRQ_SHEET, 'counsel').forEach(function (r) {
    if (!mine[ruleStr_(r.student_id)]) return;
    var st = ruleStr_(r.status);
    if (st === '신청') {
      open++;
      var first = ruleStr_(r.wish_dates).split(';').filter(Boolean).sort()[0] || '';
      if (first && (!earliest || first < earliest)) earliest = first;
    } else if (st === '확정') fixed++;
  });
  return { open: open, fixed: fixed, earliest: earliest };
}

/* ───────────── 학생 쓰기 ───────────── */

/**
 * 상담 신청(학생 본인). input = {dates:['yyyy-MM-dd'…], topic, memo}. studentId는 받지 않는다(로그인 계정 = portalWho_).
 * 락 안에서 다시 읽고 counselRequestCheck_(열린 신청 1건 포함)와 s6CanWrite_(지금 학사생)를 판정한다.
 * → {ok:true, id} | {ok:false, errors:[{field,message}]}. 담당교사에게 메일(락 밖, 이름·메모 없음).
 */
function submitCounselRequest(input) {
  var user = requirePermission_('counsel.request.create', { studentId: portalWho_().studentId });
  var me = portalWho_().studentId;
  var res = withLock_(function () {
    var d = crqLoad_(), term = getCurrentTerm_();
    if (!term) return { ok: false, errors: crqErrors_(['지금은 운영 기간이 아니라 신청할 수 없습니다.']) };
    var w = s6CanWrite_({ role: 'student', isSelf: true }, 'request.create', { active: crqActive_(d.changes, me, d.today) });
    if (!w.ok) return { ok: false, errors: crqErrors_([w.reason]) };
    var teacher = crqTeacherOf_(d.enrollments, term.id, me);
    if (!teacher) return { ok: false, errors: crqErrors_(['담당 선생님이 정해지지 않아 신청할 수 없습니다. 관리자 선생님께 알려 주세요.']) };
    var c = counselRequestCheck_(Object.assign({}, input || {}, { studentId: me }), d.today, readAll_(CRQ_SHEET, 'counsel'));
    if (c.errors.length) return { ok: false, errors: crqErrors_(c.errors) };
    var saved = appendRecord_(CRQ_SHEET, Object.assign({}, c.row, { term_id: term.id, requester_email: user.email, decided_date: '', linked_note_id: '', cancel_reason: '' }), user.email, 'counsel');
    return { ok: true, id: saved.id, _mail: teacher };
  });
  if (res._mail) {
    crqMail_([res._mail], '[신한1학사] 상담 신청', '상담 신청이 들어왔습니다. 앱에서 확인해 주세요.', user.email);
    delete res._mail;
  }
  return res;
}

/** 락 안에서: 신청 행을 찾고 그 학생이 이 접속자(본인)인지 확인한다 → {row} | {error} */
function crqOwnRequest_(requestId, user) {
  var row = findById_(CRQ_SHEET, String(requestId || ''), 'counsel');
  if (!row) return { error: '상담 신청을 찾을 수 없습니다. 화면을 새로 불러와 주세요.' };
  if (portalWho_().ownStudentIds.indexOf(ruleStr_(row.student_id)) < 0 || normalizeEmail_(row.requester_email) !== user.email) {
    logDenied_(user.email, 'counsel.request.cancel', '남의 신청');
    throw new Error(DENIED_MESSAGE);
  }
  return { row: row };
}

/**
 * 상담 신청 취소(학생 본인, 신청·확정일 때만). 지우지 않고 status '취소'로 바꾼다. 사유는 선택(200자).
 * counsel.request.cancel은 역할만 보므로 본인 신청인지는 락 안에서 확인한다(남의 신청은 denied 기록 + 거부).
 * → {ok:true} | {ok:false, errors}
 */
function cancelCounselRequest(requestId, reason) {
  var user = requirePermission_('counsel.request.cancel');
  return withLock_(function () {
    var d = crqLoad_();
    var own = crqOwnRequest_(requestId, user);
    if (own.error) return { ok: false, stale: true, errors: crqErrors_([own.error]) };
    var n = counselRequestNext_(own.row, 'cancel', { role: 'student', isSelf: true }, { reason: reason }, d.today);
    if (n.errors.length) return { ok: false, stale: true, errors: crqErrors_(n.errors) };
    updateRecord_(CRQ_SHEET, own.row.id, n.patch, user.email, 'counsel');
    return { ok: true };
  });
}

/* ───────────── 담당교사 처리 ───────────── */

/**
 * 담당교사가 신청을 처리한다. input = {studentId, requestId, action:'confirm'|'reject', date, reason}.
 * counsel.request.decide(scope student·담당교사만)를 studentId로 판정하고, 락 안에서 그 신청이 그 학생 것인지·그 신청의 기간에 내가 담당이었는지·그 학생이 지금 학사생인지 다시 본다.
 * confirm = 학생이 고른 희망 날짜 중 하나로 확정, reject = 사유(학생에게 보임)와 함께 반려(확정 뒤 '상담 못 함'도 같다).
 * 완료는 여기서 하지 않는다 — 상담일지를 저장할 때 일지와 이어서 한다(C49-B).
 * → {ok:true, status} | {ok:false, stale?, errors}. 학생에게 메일(락 밖, 날짜·사유 없음).
 */
function decideCounselRequest(input) {
  var user = requirePermission_('counsel.request.decide', { studentId: input && input.studentId });
  input = input || {};
  var action = String(input.action || '');
  if (action !== 'confirm' && action !== 'reject') return { ok: false, errors: crqErrors_(['처리할 수 없는 동작입니다. 확정이나 반려를 눌러 주세요.']) };
  var res = withLock_(function () {
    var d = crqLoad_();
    var row = findById_(CRQ_SHEET, String(input.requestId || ''), 'counsel');
    if (!row || ruleStr_(row.student_id) !== String(input.studentId)) return { ok: false, stale: true, errors: crqErrors_(['상담 신청을 찾을 수 없습니다. 화면을 새로 불러와 주세요.']) };
    var student = d.students.filter(function (s) { return s.id === row.student_id; })[0];
    var viewer = student ? crqViewer_(user, student, row.term_id, d.enrollments) : { role: 'none' };
    if (viewer.role !== 'assigned') { logDenied_(user.email, 'counsel.request.decide', '그 기간 담당이 아님'); throw new Error(DENIED_MESSAGE); }
    var w = s6CanWrite_(viewer, 'request.process', { active: crqActive_(d.changes, student.id, d.today) });
    if (!w.ok) return { ok: false, errors: crqErrors_([w.reason]) };
    var n = counselRequestNext_(row, action, { role: 'assigned', isSelf: false }, { date: input.date, reason: input.reason }, d.today);
    if (n.errors.length) return { ok: false, stale: ['신청', '확정'].indexOf(ruleStr_(row.status)) < 0, errors: crqErrors_(n.errors) };
    updateRecord_(CRQ_SHEET, row.id, n.patch, user.email, 'counsel');
    var mailTo = ruleStr_(row.requester_email);
    return { ok: true, status: n.patch.status, _mail: { to: mailTo, status: n.patch.status } };
  });
  if (res._mail) {
    crqMail_([res._mail.to], '[신한1학사] 상담 신청 결과', res._mail.status === '확정' ? '상담 신청의 날짜가 정해졌습니다. 앱에서 확인해 주세요.' : '상담 신청이 반려되었습니다. 앱에서 사유를 확인해 주세요.', user.email);
    delete res._mail;
  }
  return res;
}
