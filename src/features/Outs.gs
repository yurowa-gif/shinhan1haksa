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

/** '이번 학기' | '이번 기간'(방학) */
function vioPeriodWord_(term) { return term && String(term.type).trim() === '방학' ? '이번 기간' : '이번 학기'; }

/**
 * 알림 받을 사람(순수): 담당교사·그 반 담임(활성만), 처음 2OUT이 되는 저장이면 관리자도(결정 49). 입력한 본인은 뺀다. C12(자동 OUT)도 쓴다.
 * → 이메일 배열(정규화·중복 없음)
 */
function vioNotifyTo_(users, enrollment, student, beforeCount, afterCount, actorEmail) {
  var seen = {}, to = [];
  var add = function (e) { var m = normalizeEmail_(e); if (m && m !== actorEmail && !seen[m]) { seen[m] = true; to.push(m); } };
  var teacher = normalizeEmail_(enrollment && enrollment.teacher_email);
  (users || []).forEach(function (u) {
    if (!isTruthy_(u.active)) return;
    var roles = parseRoles_(u.roles), email = normalizeEmail_(u.email);
    if (email === teacher) add(email);
    if (roles.indexOf('homeroom') >= 0 && sameClass_(u.homeroom_class, student.grade, student.class_no)) add(email);
    if (beforeCount < 2 && afterCount >= 2 && roles.indexOf('admin') >= 0) add(email);   // 처음 2OUT이 될 때만 관리자도
  });
  return to;
}

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
function vioValidate_(input, user) {
  var errors = [], add = function (field, message) { errors.push({ field: field, message: message }); };
  input = input || {};
  var when = vioYmd_(input);
  if (!when) add('occurredAt', '날짜와 시각을 다시 골라 주세요.');
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
  if (!rule || vioPickableRules_([rule]).length === 0) {
    var isAuto = rule && String(rule.name).trim() === DEFAULT_VIOLATION_RULES[0][0];
    add('ruleId', !rule ? '항목을 골라 주세요.' : isAuto ? '이 항목은 직접 입력할 수 없습니다(무단 지각·결석·이탈은 출결 담당의 미인정 특이사항으로 자동 기록).' : '지금 쓰지 않는 항목입니다. 다른 항목을 골라 주세요.');
  }
  var memo = String(input.memo === undefined || input.memo === null ? '' : input.memo).trim();
  if (memo.length > VIO_MEMO_MAX) add('memo', '메모는 ' + VIO_MEMO_MAX + '자 안으로 적어 주세요.');
  var detectedName = '', detectedEmail = '';
  if (input.detectedBy) {
    var t = vioActiveTeachers_(readAll_('users')).filter(function (u) { return u.id === String(input.detectedBy); })[0];
    if (!t) add('detectedBy', '적발 교사를 목록에서 골라 주세요.'); else { detectedName = String(t.name || ''); detectedEmail = normalizeEmail_(t.email); }
  }
  if (errors.length) return out;
  var rows = vioViolations_(term);
  var before = outLevel_(rows, student.id, term.id);
  var n = before.count + 1, level = n >= 2 ? 2 : n;
  Object.assign(out, { ok: true, term: term, student: student, enrollment: enrollment, rule: rule, detectedName: detectedName, detectedEmail: detectedEmail, memo: memo, rows: rows,
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
  var termOn = termOnDate_(ymd, terms);
  var term = termOn || getCurrentTerm_();
  var users = readAll_('users');
  var out = { today: today_(), date: ymd, term: term ? { id: term.id, name: term.name, start_date: term.start_date, end_date: term.end_date } : null,
    rules: vioPickableRules_(readAll_('violation_rules')).map(function (r) { return { id: r.id, name: r.name }; }),
    teachers: vioActiveTeachers_(users).map(function (u) { return { id: u.id, name: u.name, me: normalizeEmail_(u.email) === user.email }; }),
    students: [], levels: {}, canRecord: false, now: nowIso_().slice(11, 16), periodWord: vioPeriodWord_(term), dutyYesterday: false };
  if (!term) return out;
  var isAdmin = hasRole_(user, 'admin'), isTeacher = hasRole_(user, 'hall_teacher');
  // 미래 날짜·기간 밖 날짜·끝난 지 하루가 넘은 기간은 기록할 수 없다(저장 검사와 같은 기준)
  out.canRecord = (isAdmin || isTeacher) && !!termOn && ymd <= today_() && today_() <= ymdAddDays_(termOn.end_date, 1);
  if (!out.canRecord) return out;
  out.dutyYesterday = isTeacher && ymd === today_() && isOnDutyFor_(user.email, ymdAddDays_(ymd, -1), 1);
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
  var c = vioValidate_(input, user);
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
    var c = vioValidate_(input, user);
    if (!c.ok) return { ok: false, errors: c.errors };
    if (c.warnings.length && !(input && input.acknowledge === true)) return { ok: false, needsConfirm: true, warnings: c.warnings, before: c.before, after: c.after };
    ensureTermSheet_('violations', c.term.id);   // 기간 탭이 아직 없으면 만든다(미리보기는 되는데 저장이 던지지 않게)
    appendRecord_(termSheetName_('violations', c.term.id), {
      term_id: c.term.id, student_id: c.student.id, occurred_at: c.vio.at, rule_id: c.rule.id, rule_name: c.rule.name, memo: c.memo,
      detected_by: c.detectedEmail, entered_by: user.email, status: '유효', source: '직접', source_exception_id: '', cancel_reason: ''
    }, user.email);
    var to = vioNotifyTo_(readAll_('users'), c.enrollment, c.student, c.before.count, c.after.count, user.email);
    return { ok: true, after: c.after, mail: { to: to,
      body: [vioDayKo_(c.vio.ymd) + ' ' + c.rule.name + ' OUT이 기록되었습니다.', vioPeriodWord_(c.term) + ' ' + c.after.count + 'OUT' + (c.after.level >= 2 ? '(퇴실 대상)' : '') + '입니다.', '자세한 내용은 앱에서 확인해 주세요.'].join('\n') } };
  });
  if (!res.mail) return res;
  // 락 밖: 학생 이름·상황 메모는 메일에 넣지 않는다(결정 49). 앱 주소를 못 읽어도 저장은 그대로, 메일은 주소만 빼고 간다
  var link = '';
  try { link = ScriptApp.getService().getUrl(); } catch (e) { link = ''; }
  var enabled = PropertiesService.getScriptProperties().getProperty('MAIL_ENABLED') === 'true';
  var sent = notifyMail_(res.mail.to, '[신한1학사] OUT 알림', res.mail.body + (link ? '\n\n' + link : ''), user.email);
  // 경고는 보내려 했는데 못 간 경우(할당량·발송 실패)에만. 메일이 꺼져 있거나 받을 사람이 없는 것은 문제가 아니다
  var reason = '';
  if (!sent.notified) {
    if (!enabled) reason = 'off';
    else if (!res.mail.to.length) reason = 'noRecipients';
    else if (sent.failed > 0) reason = 'failed';
    else {   // 한 통도 시도하지 않았다: 한도 부족이면 문제, 보낼 수 있는 주소가 하나도 없으면(가짜 주소 등) 문제 아님
      var quota = -1;
      try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { quota = -1; }
      reason = quota >= 0 && quota < res.mail.to.length || quota < 0 ? 'quota' : 'noRecipients';
    }
  }
  return { ok: true, after: res.after, notified: sent.notified, notifyWarn: reason === 'failed' || reason === 'quota', notifyReason: reason };
}
