/**
 * F4 OUT·F12 2OUT 학부모 면담(2단계, CODING-A). 전역 이름 접두어 vio. docs/plan/stage2.md 2절.
 * C11a: OUT 직접 입력(getOutContext·previewOut·saveOut). 목록·취소는 C11b, 면담은 C13.
 */

/**
 * 교사 홈의 OUT 카드 데이터(getHomeData가 부른다). 아직 없으면 null.
 * 보고 있는 홈 역할(role)이 out.view를 가질 때만 불린다. 던진 오류는 getHomeData가 잡아 {error}로 바꾼다.
 * C11a: OUT 기록 카드는 기록할 수 있는 역할(학사 교사·관리자)에게만. 숫자 카드는 C11b.
 */
function vioHomeInfo_(user, role) {
  return { canRecord: role === 'hall_teacher' || role === 'admin' };
}

var VIO_MEMO_MAX = 200;

/** '3월 3일(수)' */
function vioDayKo_(ymd) { return (+ymd.slice(5, 7)) + '월 ' + (+ymd.slice(8, 10)) + '일(' + ymdWeekdayKo_(ymd) + ')'; }

/**
 * 발생 일시 한 곳: input.occurredAt에서 권한용 날짜(ymd)와 저장할 occurred_at을 **같은 값**으로 얻는다(#77 검토).
 * 로컬 'yyyy-MM-ddTHH:mm' 또는 'yyyy-MM-ddTHH:mm:ss'만 받는다. Z·시간대 오프셋·공백 섞인 값·따로 보낸 날짜는 받지 않는다(null).
 * → {ymd, at:'yyyy-MM-ddTHH:mm:ss'} | null
 */
function vioYmd_(input) {
  var raw = input && typeof input.occurredAt === 'string' ? input.occurredAt.trim() : '';
  var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!m || !ymdIsValid_(m[1]) || +m[2] > 23 || +m[3] > 59 || (m[4] !== undefined && +m[4] > 59)) return null;
  return { ymd: m[1], at: m[1] + 'T' + m[2] + ':' + m[3] + ':' + (m[4] || '00') };
}

/** OUT 항목 중 사람이 고를 수 있는 것: 켜져 있고(active) 자동 항목('무단 지각·결석·이탈')이 아닌 것. sort_order 순 */
function vioPickableRules_(rules) {
  var autoName = DEFAULT_VIOLATION_RULES[0][0];
  return (rules || []).filter(function (r) { return isTruthy_(r.active) && String(r.name).trim() !== autoName; })
    .sort(function (a, b) { return (+a.sort_order || 0) - (+b.sort_order || 0); });
}

var VIO_TEACHER_ROLES = ['admin', 'attendance', 'hall_teacher', 'duty_manager', 'homeroom'];

function vioActiveTeachers_(users) {
  return (users || []).filter(function (u) { return isTruthy_(u.active) && parseRoles_(u.roles).some(function (r) { return VIO_TEACHER_ROLES.indexOf(r) >= 0; }); });
}

function vioViolations_(term) {
  try { return readAll_(termSheetName_('violations', term.id)); } catch (e) { if (String(e.message).indexOf('탭이 없습니다') < 0) throw e; return []; }
}

/**
 * 같은 날 같은 항목이 이미 있거나 그날 자동 OUT이 있으면 확인 문구(순수). rows = 그 기간 violations 행
 * → string[]
 */
function vioDupWarnings_(rows, studentId, ymd, ruleId) {
  var warnings = [], same = false, auto = false;
  (rows || []).forEach(function (v) {
    if (!ruleRowLive_(v) || String(v.student_id).trim() !== String(studentId) || String(v.occurred_at).trim().slice(0, 10) !== ymd) return;
    if (String(v.source).trim() === 'F1자동') auto = true;
    else if (String(v.rule_id).trim() === String(ruleId)) same = true;
  });
  if (same) warnings.push('같은 학생·같은 날 같은 항목 OUT이 이미 있습니다.');
  if (auto) warnings.push('그날 미인정 특이사항으로 자동 기록된 OUT이 이미 있습니다.');
  return warnings;
}

/**
 * 직접 입력 검사 — 읽기만 한다(미리보기와 저장이 같은 함수를 쓴다, 저장은 락 안에서 다시 부른다).
 * input = {studentId, occurredAt, ruleId, detectedBy(교사 users.id, 빈칸=모름), memo}
 * → {ok, errors:[{field,message}], term, student, enrollment, rule, detectedName, vio:{ymd,at}, rows, before:{count,level,label}, after, warnings}
 */
function vioCheck_(input, user) {
  var errors = [], add = function (field, message) { errors.push({ field: field, message: message }); };
  input = input || {};
  var when = vioYmd_(input);
  if (!when) add('occurredAt', '날짜와 시각을 2027-03-03T21:40 같은 형식으로 골라 주세요.');
  var out = { ok: false, errors: errors, warnings: [], vio: when };
  var student = input.studentId ? findById_('students', String(input.studentId)) : null;
  if (!student) add('studentId', '학생을 골라 주세요.');
  var terms = readAll_('terms');
  var term = when ? termOnDate_(when.ymd, terms) : null;
  if (when && !term) add('occurredAt', '운영 기간에 속하지 않는 날짜입니다.');
  if (when && when.at > nowIso_()) add('occurredAt', '앞으로의 일시는 기록할 수 없습니다.');
  if (term && today_() > ymdAddDays_(term.end_date, 1)) add('occurredAt', '끝난 운영 기간에는 기록할 수 없습니다(기간이 끝난 다음 날까지만 입력할 수 있습니다).');
  var enrollment = null;
  if (student && term) {
    enrollment = readAll_('enrollments').filter(function (e) { return e.term_id === term.id && e.student_id === student.id; })[0] || null;
    if (!enrollment || !isActiveOn_(readAll_('status_changes'), enrollment, when.ymd)) add('studentId', '그날 학사생이 아닙니다(그 기간 명단에 없거나 입실 전·퇴실 뒤).');
  }
  var rule = readAll_('violation_rules').filter(function (r) { return String(r.id) === String(input.ruleId || ''); })[0] || null;
  if (!rule || vioPickableRules_([rule]).length === 0) add('ruleId', rule ? '이 항목은 직접 입력할 수 없습니다(무단 지각·결석·이탈은 출결 담당의 미인정 특이사항으로 자동 기록).' : '항목을 골라 주세요.');
  var memo = String(input.memo === undefined || input.memo === null ? '' : input.memo).trim();
  if (memo.length > VIO_MEMO_MAX) add('memo', '메모는 ' + VIO_MEMO_MAX + '자 안으로 적어 주세요.');
  var detectedName = '';
  if (input.detectedBy) {
    var t = vioActiveTeachers_(readAll_('users')).filter(function (u) { return u.id === String(input.detectedBy); })[0];
    if (!t) add('detectedBy', '적발 교사를 목록에서 골라 주세요.'); else detectedName = String(t.name || '');
  }
  if (errors.length) return out;
  var rows = vioViolations_(term);
  var before = outLevel_(rows, student.id, term.id);
  var n = before.count + 1, level = n >= 2 ? 2 : n;
  Object.assign(out, { ok: true, term: term, student: student, enrollment: enrollment, rule: rule, detectedName: detectedName, memo: memo, rows: rows,
    before: before, after: { count: n, level: level, label: ['', '1OUT', '퇴실 대상'][level] },
    warnings: vioDupWarnings_(rows, student.id, when.ymd, rule.id) });
  return out;
}

/** 입력 화면 시작값: 활성 항목·적발 교사 목록·기록할 수 있는 학생(담당 학생 + 그날 근무 창 안이면 그날 등록 학생 전체, 관리자는 전체)과 학생별 이번 기간 OUT 수 */
function getOutContext(date) {
  var user = requirePermission_('out.view');
  var ymd = String(date || '').trim() || today_();
  if (!ymdIsValid_(ymd)) throw new Error('날짜를 골라 주세요.');
  var terms = readAll_('terms');
  var term = termOnDate_(ymd, terms) || getCurrentTerm_();
  var users = readAll_('users');
  var out = { today: today_(), date: ymd, term: term ? { id: term.id, name: term.name, start_date: term.start_date, end_date: term.end_date } : null,
    rules: vioPickableRules_(readAll_('violation_rules')).map(function (r) { return { id: r.id, name: r.name }; }),
    teachers: vioActiveTeachers_(users).map(function (u) { return { id: u.id, name: u.name, me: normalizeEmail_(u.email) === user.email }; }),
    students: [], levels: {}, canRecord: false };
  if (!term) return out;
  var isAdmin = hasRole_(user, 'admin'), isTeacher = hasRole_(user, 'hall_teacher');
  out.canRecord = isAdmin || isTeacher;
  if (!out.canRecord) return out;
  var onDuty = isTeacher && isOnDutyFor_(user.email, ymd, 1);
  var enr = readAll_('enrollments').filter(function (e) { return e.term_id === term.id; });
  var changes = readAll_('status_changes');
  var allowed = {};
  enr.forEach(function (e) {
    if (!isActiveOn_(changes, e, ymd)) return;
    if (isAdmin || onDuty || (isTeacher && normalizeEmail_(e.teacher_email) === user.email)) allowed[e.student_id] = true;
  });
  out.students = readAll_('students').filter(function (s) { return allowed[s.id]; })
    .sort(function (a, b) { return String(a.student_no).localeCompare(String(b.student_no)); })
    .map(function (s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no }; });
  var rows = vioViolations_(term);
  out.students.forEach(function (s) { out.levels[s.id] = outLevel_(rows, s.id, term.id).count; });
  return out;
}

/** 저장 전 확인(아무것도 쓰지 않는다): 검사 결과·같은 날 중복 경고·"저장하면 N OUT" 안내 */
function previewOut(input) {
  var user = requirePermission_('out.save', { studentId: input && input.studentId, ymd: (vioYmd_(input) || {}).ymd || '' });
  var c = vioCheck_(input, user);
  if (!c.ok) return { ok: false, errors: c.errors };
  return { ok: true, warnings: c.warnings, before: c.before, after: c.after };
}

/**
 * OUT 직접 입력 저장. 첫 줄 권한의 날짜와 저장하는 occurred_at은 vioYmd_ 하나에서 나온다.
 * 같은 학생·날·항목이 있거나 그날 자동 OUT이 있으면 {ok:false, needsConfirm:true, warnings} — acknowledge:true로 다시 보내면 저장.
 * 알림 메일(결정 49)은 락을 푼 뒤: 학생 이름·메모 없이 날짜·항목·몇 OUT인지 + 앱 링크. 메일이 안 가도 저장은 되돌리지 않는다.
 */
function saveOut(input) {
  var user = requirePermission_('out.save', { studentId: input && input.studentId, ymd: (vioYmd_(input) || {}).ymd || '' });
  var res = withLock_(function () {
    ['terms', 'enrollments', 'status_changes', 'violation_rules', 'users', 'students'].forEach(function (t) { invalidate_('db', t); });
    var term0 = vioYmd_(input) ? termOnDate_(vioYmd_(input).ymd) : null;
    if (term0) invalidate_('db', termSheetName_('violations', term0.id));
    var c = vioCheck_(input, user);
    if (!c.ok) return { ok: false, errors: c.errors };
    if (c.warnings.length && !(input && input.acknowledge === true)) return { ok: false, needsConfirm: true, warnings: c.warnings, before: c.before, after: c.after };
    appendRecord_(termSheetName_('violations', c.term.id), {
      term_id: c.term.id, student_id: c.student.id, occurred_at: c.vio.at, rule_id: c.rule.id, rule_name: c.rule.name, memo: c.memo,
      detected_by: c.detectedName, entered_by: user.email, status: '유효', source: '직접', source_exception_id: '', cancel_reason: ''
    }, user.email);
    var users = readAll_('users');
    var to = [normalizeEmail_(c.enrollment.teacher_email)];
    users.forEach(function (u) {
      if (!isTruthy_(u.active)) return;
      var roles = parseRoles_(u.roles);
      if (roles.indexOf('homeroom') >= 0 && sameClass_(u.homeroom_class, c.student.grade, c.student.class_no)) to.push(normalizeEmail_(u.email));
      if (c.after.level >= 2 && roles.indexOf('admin') >= 0) to.push(normalizeEmail_(u.email));   // 2OUT이 되면 관리자도
    });
    return { ok: true, after: c.after, mail: { to: to.filter(function (e) { return e && e !== user.email; }),
      body: [vioDayKo_(c.vio.ymd) + ' ' + c.rule.name + ' OUT이 기록되었습니다.', '이번 학기 ' + c.after.label + '입니다.', '자세한 내용은 앱에서 확인해 주세요.'].join('\n') } };
  });
  if (!res.mail) return res;
  // 락 밖: 학생 이름·상황 메모는 메일에 넣지 않는다(결정 49)
  var sent = notifyMail_(res.mail.to, '[신한1학사] OUT 알림', res.mail.body + '\n\n' + ScriptApp.getService().getUrl(), user.email);
  return { ok: true, after: res.after, notified: sent.notified };
}
