/**
 * F4 OUT·F12 2OUT 학부모 면담(2단계, CODING-A). 전역 이름 접두어 vio. docs/plan/stage2.md 2절.
 * C11a: OUT 직접 입력(getOutContext·previewOut·saveOut). 목록·취소는 C11b, 면담은 C13.
 */

/**
 * 교사 홈의 OUT 카드 데이터(getHomeData가 부른다). 아직 없으면 null.
 * 보고 있는 홈 역할(role)이 out.view를 가질 때만 불린다. 던진 오류는 getHomeData가 잡아 {error}로 바꾼다.
 * → {canRecord(기록 카드는 학사 교사·관리자만), out1, out2(이번 기간 1OUT·퇴실 대상 학생 수), today(오늘 건수), perStudent(담임: 우리 반 학생별 OUT 수)}
 */
function vioHomeInfo_(user, role) {
  var out = { canRecord: role === 'hall_teacher' || role === 'admin', out1: 0, out2: 0, today: 0, perStudent: {}, list: [], periodWord: vioPeriodWord_(getCurrentTerm_()), mailOn: PropertiesService.getScriptProperties().getProperty('MAIL_ENABLED') === 'true' };
  var term = getCurrentTerm_();
  if (!term) return out;
  var vu = Object.assign({}, user, { roles: [role] });   // 보고 있는 홈 역할 하나로만 센다
  // 홈은 학사 교사에게 '내 담당 학생'만(면담할 사람이 자기 학생을 알아보게). 목록 화면의 넓은 보기(결정 45·53)와 다르다
  var visible = vioVisibleIds_(vu, readAll_('enrollments'), readAll_('students'), term.id, false);
  var live = vioViolations_(term).filter(function (v) { return ruleRowLive_(v) && visible[String(v.student_id)]; });
  var per = Object.create(null), today = today_();
  var changes0 = readAll_('status_changes');
  live.forEach(function (v) { if (String(v.occurred_at).slice(0, 10) === today) out.today++; });   // 오늘 건수는 [오늘] 탭과 같게 퇴실 학생 행도 센다
  live = live.filter(function (v) { return !vioIsLeft_(changes0, v.student_id, today); });   // 1OUT·퇴실 대상 학생 수에서만 퇴실 처리된 학생을 뺀다(목록과 같은 규칙)
  live.forEach(function (v) { per[v.student_id] = (per[v.student_id] || 0) + 1; });
  var byStu = {};
  readAll_('students').forEach(function (s) { byStu[s.id] = s; });
  Object.keys(per).forEach(function (id) {
    if (per[id] >= 2) out.out2++; else out.out1++;
    if (role === 'homeroom') out.perStudent[id] = per[id];
    var st = byStu[id];
    if (st) out.list.push({ studentId: id, student: { name: st.name, grade: +st.grade, classNo: st.class_no, number: st.number }, count: per[id] });
  });
  out.list.sort(function (a, b) { return b.count - a.count; });
  out.list = out.list.slice(0, 6);   // 홈 카드에는 많은 순 6명만
  if (role === 'admin') {   // 2OUT 대상 N명 · 면담 필요 N · 확정 가능 N
    var byId = {};
    readAll_('students').forEach(function (s) { byId[s.id] = s; });
    var ids = Object.keys(per).filter(function (id) { return per[id] >= 2; });
    var info = vioMeetingInfo_(vu, term, ids, byId, vioViolations_(term));
    out.targets = { n: 0, need: 0, ready: 0 };   // 퇴실 처리된 학생은 세지 않는다
    Object.keys(info).forEach(function (id) { if (info[id].state === 'left') return; out.targets.n++; if (info[id].state === 'need') out.targets.need++; if (info[id].state === 'recorded') out.targets.ready++; });
  }
  return out;
}

var VIO_MEMO_MAX = 200;

/**
 * 퇴실 처리됨인가(보기용, 누구에게 보여도 되는 status_changes 값): ymd에 학사 퇴실이거나, 앞으로 적용될 살아 있는 2OUT 퇴실(메모 [2OUT]·사유 '2OUT 퇴실')이 잡혀 있음.
 * R9 outDismissalGate_의 alreadyLeft와 같은 기준이라 목록·홈·관문이 어긋나지 않는다.
 */
function vioIsLeft_(changes, studentId, ymd) {
  var sid = ruleStr_(studentId);
  if (statusOn_(changes, sid, '학사', ymd) === '퇴실') return true;
  return (changes || []).some(function (c) {
    return c && ruleRowLive_(c) && ruleStr_(c.student_id) === sid && ruleStr_(c.item) === '학사' && ruleStr_(c.value) === '퇴실' &&
      ruleStr_(c.effective_date) > ymd && (ruleStr_(c.memo).indexOf('[2OUT]') === 0 || ruleStr_(c.reason) === '2OUT 퇴실');
  });
}

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

function vioTabMissing_(term) {
  try { readAll_(termSheetName_('violations', term.id)); return false; } catch (e) { if (String(e.message).indexOf('탭이 없습니다') < 0) throw e; return true; }
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
    students: [], levels: {}, isAdmin: hasRole_(user, 'admin'), canRecord: false, dateOk: false, dateReason: '', now: nowIso_().slice(11, 16), periodWord: vioPeriodWord_(term), dutyYesterday: false };
  if (!term) return out;
  var isAdmin = hasRole_(user, 'admin'), isTeacher = hasRole_(user, 'hall_teacher');
  out.canRecord = isAdmin || isTeacher;   // 역할이 기록할 수 있는가. 날짜가 되는지는 dateOk
  if (!out.canRecord) return out;
  // 어제 근무자(오늘 아침 열면 어제 밤 일을 입력할 수 있다): 오늘이 기록 불가인 사이 날에도 알려 준다
  out.dutyYesterday = isTeacher && ymd === today_() && isOnDutyFor_(user.email, ymdAddDays_(ymd, -1), 1);
  // 날짜가 되는가(저장 검사와 같은 기준): 운영 기간 안, 오늘까지, 기간이 끝난 다음 날까지
  var why = !termOn ? '운영 기간 밖의 날짜입니다.' : ymd > today_() ? '앞으로의 날짜입니다.' : today_() > ymdAddDays_(termOn.end_date, 1) ? '끝난 운영 기간입니다.' : '';
  out.dateOk = !why;
  out.dateReason = why;
  if (!out.dateOk) return out;
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
    if (vioTabMissing_(c.term)) ensureTermSheet_('violations', c.term.id);   // 기간 탭이 아직 없을 때만 만든다(미리보기는 되는데 저장이 던지지 않게)
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


/* ───── C11b: 목록·취소 ───── */

/** 보기 범위가 넓은지: 권한표 out.view의 wideView 표시(학사 교사도 이번 기간 학사생 전체, 결정 45·53). 쓰기(out.save)에는 쓰지 않는다 */
function vioViewWide_() { return !!permissions_()['out.view'].wideView; }

/**
 * 이 사용자가 볼 수 있는 학생 id 집합(순수): 그 기간 등록 학생 중 관리자·출결 담당 = 전체, 학사 교사 = wide면 전체(근무 여부는 보지 않는다)·아니면 담당 학생,
 * 담임 = 자기 반(여러 역할이면 합집합). 범위는 excVisibleIds_(Exceptions.gs)와 같다 — 그 파일에 기대지 않으려고 따로 둔다.
 */
function vioVisibleIds_(user, enrollments, students, termId, wide) {
  var byId = {};
  (students || []).forEach(function (s) { byId[s.id] = s; });
  var ids = Object.create(null);
  var roles = user.roles || [];
  var all = roles.indexOf('admin') >= 0 || roles.indexOf('attendance') >= 0;
  (enrollments || []).forEach(function (e) {
    if (e.term_id !== termId) return;
    var s = byId[e.student_id];
    if (!s) return;
    if (all ||
        (roles.indexOf('hall_teacher') >= 0 && (wide || normalizeEmail_(e.teacher_email) === user.email)) ||
        (roles.indexOf('homeroom') >= 0 && sameClass_(user.homeroomClass, s.grade, s.class_no))) ids[s.id] = true;
  });
  return ids;
}

/** 입력·취소가 닫힌 기간인가: 끝난 다음 날까지만 열려 있다(저장 검사와 같은 기준) */
function vioTermClosed_(term) { return today_() > ymdAddDays_(term.end_date, 1); }

/**
 * OUT 목록. filter = {scope:'student'|'term'|'today', termId, studentId, date}
 *  - term: 그 기간 전체(기본 이번 기간)  - student: 한 학생의 그 기간 누적  - today: 오늘(또는 date) 발생한 것
 * 볼 수 있는 학생(vioVisibleIds_)만. 이메일은 내보내지 않고 이름으로 바꾼다. 지난 기간도 조회는 된다.
 * → {ok, term, terms:[{id,name}], items:[...], summary:[{studentId, student, count, label}], canCancel}
 */
function listOuts(filter) {
  var user = requirePermission_('out.view');
  filter = filter || {};
  var scope = String(filter.scope || 'term');
  if (['student', 'term', 'today', 'targets'].indexOf(scope) < 0) throw new Error('볼 범위를 다시 골라 주세요.');
  var terms = readAll_('terms').filter(function (t) { return t.start_date && t.end_date; }).sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; });
  var today = String(filter.date || '').trim() || today_();
  if (scope === 'today' && !ymdIsValid_(today)) throw new Error('날짜를 골라 주세요.');
  var term;
  if (scope === 'today') term = termOnDate_(today, terms) || getCurrentTerm_();   // 오늘 탭은 고른 기간과 상관없이 그날이 속한 기간
  else if (filter.termId) {
    term = terms.filter(function (t) { return t.id === String(filter.termId); })[0];
    if (!term) throw new Error('운영 기간을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.');
  } else term = getCurrentTerm_();
  var out = { ok: true, date: today, term: null, terms: terms.map(function (t) { return { id: t.id, name: t.name }; }), items: [], summary: [], canCancel: false, isAdmin: hasRole_(user, 'admin') };
  if (!term) return out;
  var enrollments = readAll_('enrollments'), students = readAll_('students'), changes = readAll_('status_changes');
  var visible = vioVisibleIds_(user, enrollments, students, term.id, vioViewWide_());
  var myStudents = {};   // 내 담당 학생(보기 범위와 별개로 [내 담당] 표시용)
  enrollments.forEach(function (e) { if (e.term_id === term.id && normalizeEmail_(e.teacher_email) === user.email) myStudents[e.student_id] = true; });
  if (scope === 'student' && !visible[String(filter.studentId || '')]) {
    logDenied_(user.email, 'out.view', '범위 밖 학생');
    throw new Error('권한이 없습니다.');
  }
  var closed = vioTermClosed_(term);
  out.term = { id: term.id, name: term.name, type: term.type, start_date: term.start_date, end_date: term.end_date, closed: closed };
  out.canCancel = hasRole_(user, 'admin') && !closed;
  var names = {}, byEmail = {}, byId = {};
  readAll_('users').forEach(function (u) { byEmail[normalizeEmail_(u.email)] = u; });
  students.forEach(function (s) { byId[s.id] = s; });
  var rows = vioViolations_(term).filter(function (v) { return visible[String(v.student_id)]; });
  // 적발 교사 칸은 이메일 하나 또는 자동 OUT의 근무자 여럿('a@x,b@x')일 수 있다: 각각 이름으로 바꿔 '·'로 잇고, 없는 사람만 미등록으로 적는다
  var nameOf = function (emails) {
    return String(emails || '').split(',').map(function (e) { return e.trim(); }).filter(Boolean).map(function (e) {
      var u = byEmail[normalizeEmail_(e)]; return u && String(u.name || '') ? String(u.name) : '(등록 안 된 교사)';
    }).join('·');
  };
  var count = Object.create(null);
  rows.forEach(function (v) { if (ruleRowLive_(v)) count[v.student_id] = (count[v.student_id] || 0) + 1; });
  var shown = rows.filter(function (v) {
    if (scope === 'targets') return ruleRowLive_(v) && count[v.student_id] >= 2;   // 퇴실 대상 학생의 살아 있는 OUT
    if (scope === 'student') return String(v.student_id) === String(filter.studentId);
    if (scope === 'today') return String(v.occurred_at).slice(0, 10) === today;
    return true;
  }).sort(function (a, b) { return String(a.occurred_at) < String(b.occurred_at) ? 1 : -1; });
  var label = function (n) { return n >= 2 ? '퇴실 대상' : n === 1 ? '1OUT' : ''; };
  out.items = shown.map(function (v) {
    var s = byId[v.student_id] || {};
    var live = ruleRowLive_(v);
    return { id: v.id, termId: term.id, studentId: v.student_id, student: { name: s.name || '', grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no },
      occurredAt: String(v.occurred_at), ruleName: v.rule_name, memo: v.memo || '', detectedBy: v.detected_by ? nameOf(v.detected_by) : '(모름)',
      enteredBy: nameOf(v.entered_by), source: v.source, status: live ? '유효' : '취소', cancelReason: v.cancel_reason || '',
      canCancel: out.canCancel && live };
  });
  var seen = Object.create(null);
  (scope === 'term' || scope === 'targets' ? Object.keys(count) : shown.map(function (v) { return v.student_id; })).forEach(function (id) {
    if (seen[id]) return; seen[id] = true;
    var s = byId[id] || {};
    var mine = rows.filter(function (v) { return ruleRowLive_(v) && String(v.student_id) === id; }).sort(function (a, b) { return String(a.occurred_at) < String(b.occurred_at) ? 1 : -1; })[0];
    out.summary.push({ studentId: id, student: { name: s.name || '', grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no }, count: count[id] || 0, label: label(count[id] || 0),
      isMine: !!myStudents[id], left: vioIsLeft_(changes, id, today_()),
      latest: mine ? { occurredAt: String(mine.occurred_at), ruleName: mine.rule_name, source: mine.source } : null });
  });
  // 퇴실 처리된 학생은 맨 뒤로 보내고 1OUT·퇴실 대상 학생 수에서 뺀다
  out.hasMine = Object.keys(myStudents).length > 0;
  out.stats = { records: 0, out1Students: 0, out2Students: 0 };
  rows.forEach(function (v) { if (ruleRowLive_(v)) out.stats.records++; });
  Object.keys(count).forEach(function (id) {
    var sm = out.summary.filter(function (x) { return x.studentId === id; })[0];
    if (sm && sm.left) return;
    if (count[id] >= 2) out.stats.out2Students++; else if (count[id] === 1) out.stats.out1Students++;
  });
  out.summary.sort(function (a, b) { return (a.left ? 1 : 0) - (b.left ? 1 : 0) || b.count - a.count || String(a.student.studentNo).localeCompare(String(b.student.studentNo)); });   // 퇴실 처리됨은 맨 뒤
  // 2OUT 학생의 면담 칸(상담 보기 범위를 통과한 학생만)
  var targetIds = out.summary.filter(function (x) { return x.count >= 2; }).map(function (x) { return x.studentId; });
  var info = vioMeetingInfo_(user, term, targetIds, byId, vioViolations_(term));
  out.summary.forEach(function (x) { if (info[x.studentId]) Object.assign(x, info[x.studentId]); });
  if (scope === 'targets') out.summary = out.summary.filter(function (x) { return x.count >= 2; });
  return out;
}

/**
 * OUT 취소(관리자만): status를 '취소'로 바꾸고 사유를 남긴다(삭제하지 않는다, audit). 사유 2~200자.
 * '[자동]'으로 시작하는 사유는 규칙이 자동 취소할 때만 쓰는 머리말이라 거부(vocabulary.md). 닫힌 기간(끝난 다음 날 이후)은 거부.
 */
function cancelOut(termId, id, reason) {
  var user = requirePermission_('out.cancel');
  var err = function (field, message) { return { ok: false, errors: [{ field: field, message: message }] }; };
  if (typeof reason !== 'string') return err('reason', '취소 사유를 적어 주세요.');
  var why = reason.trim();
  if (why.length < 2 || why.length > 200) return err('reason', '취소 사유를 2자 이상 200자 안으로 적어 주세요.');
  if (why.indexOf('[자동]') === 0) return err('reason', '[자동]으로 시작하는 사유는 쓸 수 없습니다.');
  return withLock_(function () {
    ['terms', 'enrollments', 'students'].forEach(function (t) { invalidate_('db', t); });
    var term = readAll_('terms').filter(function (t) { return t.id === String(termId || ''); })[0];
    if (!term) return err('termId', '운영 기간을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.');
    if (vioTermClosed_(term)) return err('termId', '끝난 운영 기간의 OUT은 볼 수만 있습니다.');
    var sheet = termSheetName_('violations', term.id);
    invalidate_('db', sheet);
    var row = vioViolations_(term).filter(function (v) { return v.id === String(id || ''); })[0];
    if (!row) return err('id', 'OUT 기록을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.');
    if (!ruleRowLive_(row)) return err('id', '이미 취소된 OUT입니다.');
    updateRecord_(sheet, row.id, { status: '취소', cancel_reason: why }, user.email);
    var rows = vioViolations_(term);
    return { ok: true, after: outLevel_(rows, row.student_id, term.id) };
  });
}


/* ───── C13: 2OUT 면담 칸·퇴실 확정 관문 ───── */

/**
 * 2OUT(살아 있는 OUT 2건 이상) 학생마다 면담 상태. 면담 날짜·교사는 상담 보기 범위(counsel.view, 근무 여부 안 봄)를 통과한 학생에게만 준다 — 담당이 아닌 학사 교사·출결 담당은 빈칸.
 * 이번 기간(getCurrentTerm_)만 본다(지난 기간은 조회용). 상담 파일은 볼 수 있는 학생이 있을 때만 읽는다. 내용(content)은 어디에도 없다.
 * → {studentId: {state:'need'|'recorded'|'left', meeting:{date, teacher, noteId?}|null, canMeeting, canConfirm}} (볼 수 없는 학생은 키가 없다)
 */
function vioMeetingInfo_(user, term, studentIds, byId, rows) {
  var cur = getCurrentTerm_();
  var out = {};
  if (!cur || cur.id !== term.id || !studentIds.length) return out;
  var allowedRoles = permissions_()['counsel.view'].roles, ok = [], facts = {};
  studentIds.forEach(function (id) {
    var s = byId[id];
    if (!s) return;
    var f = studentFacts_(user, s, today_(), 0, true);   // 근무 여부는 보지 않는다(noDuty)
    f.isOnDuty = false;   // 이 PR만으로도 근무교사가 면담 칸을 못 보게(studentFacts_의 noDuty에 기대지 않는다)
    if (canAccessStudentByFacts_(user.roles, f, allowedRoles, false)) { ok.push(id); facts[id] = f; }
  });
  if (!ok.length) return out;
  var changes = readAll_('status_changes'), notes = cnsNotesForGate_(changes), names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || ''); });
  var isTeacher = hasRole_(user, 'hall_teacher'), isAdmin = hasRole_(user, 'admin');
  ok.forEach(function (id) {
    var g = outDismissalGate_(rows, notes, changes, id, term.id, today_());
    var state = g.alreadyLeft ? 'left' : g.meetingNote ? 'recorded' : 'need';
    var mine = g.meetingNote && normalizeEmail_(g.meetingNote.teacher_email) === user.email;
    out[id] = { state: state,
      meeting: g.meetingNote ? { date: g.meetingNote.date, teacher: names[normalizeEmail_(g.meetingNote.teacher_email)] || '(등록 안 된 교사)', noteId: mine ? g.meetingNote.id : undefined } : null,
      // 결정 51: 면담이 있었는데 연결한 OUT이 취소돼 인정되지 않는 경우(카드가 '면담 필요'로 돌아가고 안내가 붙는다)
      // 연결한 OUT이 이번 기간 violations 행(취소 포함)일 때만 stale — 지난 기간 면담은 해당 없음
      staleMeeting: state === 'need' && notes.some(function (n) { return n.student_id === id && ruleRowLive_(n) && String(n.type).trim() === CNS_TYPE_OUT2 && rows.some(function (v) { return String(v.id) === String(n.linked_violation_id); }); }),
      prevExit: state === 'left' ? '' : cnsLastOut2Exit_(changes, id),   // 재입실 학생에 '이전 퇴실 처리됨(M월 D일)'
      trigger: g.triggerOutId ? (function () { var t = rows.filter(function (v) { return String(v.id) === g.triggerOutId; })[0]; return t ? { occurredAt: String(t.occurred_at), ruleName: t.rule_name } : null; })() : null,
      canMeeting: isTeacher && !!facts[id].isAssigned && state === 'need', canConfirm: isAdmin && state === 'recorded' };
  });
  return out;
}

/**
 * 퇴실 확정 관문(관리자): 통과하면 {ok:true, prefill} — 입퇴실 화면이 이 값으로 신청서를 미리 채운다(Q8: 사유 '2OUT 퇴실', 적용일 확정 다음 날, 유형은 고르게).
 * 막히면 {ok:false, reason}(업무 차단이라 거부 기록은 남기지 않는다): '퇴실 대상 아님' | '면담 기록 필요' | '이미 퇴실'.
 * 면담 날짜·교사는 이 응답의 면담 칸에만 있다. 내용은 없다.
 */
function confirmOutDismissal(studentId) {
  requirePermission_('out.dismiss');
  var student = findById_('students', String(studentId || ''));
  if (!student) return { ok: false, reason: '학생을 찾을 수 없습니다.' };
  var g = cnsGateFor_(student.id);
  if (!g.gate.ok) return { ok: false, reason: g.gate.reason };
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || ''); });
  var m = g.gate.meetingNote;
  return { ok: true, prefill: {
    studentId: student.id, student: { name: student.name, grade: +student.grade, classNo: student.class_no, number: student.number },
    reason: '2OUT 퇴실', effectiveDate: ymdAddDays_(today_(), 1),
    meeting: { date: m.date, teacher: names[normalizeEmail_(m.teacher_email)] || '(등록 안 된 교사)' } } };
}

/* ───── C15: OUT 항목 관리(관리자) ───── */

var VIO_RULE_NAME_MAX = 60;
var VIO_RULE_DESC_MAX = 100;

function vioRuleView_(r) {
  return { id: r.id, name: String(r.name), description: String(r.description || ''), active: isTruthy_(r.active), sortOrder: +r.sort_order || 0,
    isAuto: vioRuleKey_(r.name) === vioRuleKey_(DEFAULT_VIOLATION_RULES[0][0]) };
}

/** 항목 이름 비교용: 앞뒤·중복 공백을 정리한다 */
function vioRuleKey_(name) {
  var t = String(name === undefined || name === null ? '' : name);
  try { t = t.normalize('NFC'); } catch (e) { /* 정규화를 못 하는 환경이면 그대로 */ }
  return t.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, ' ').trim();   // 영폭 문자 제거·공백 정리
}

/** 관리자: 항목 전체(꺼진 것 포함, sort_order 순). 자동 항목은 isAuto. */
function getOutRules() {
  requirePermission_('out.rules');
  return { ok: true, rules: readAll_('violation_rules').map(vioRuleView_).sort(function (a, b) { return a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : 1); }) };
}

/**
 * 항목 추가·수정(관리자). input = {id?, name, description, active, sortOrder}. 지우지 않는다(끄기만).
 * 자동 항목('무단 지각·결석·이탈')은 이름을 고칠 수 없고 끌 수 없다(R5가 이 이름으로 읽는다). 새 항목은 자동 항목 이름을 쓸 수 없다.
 * 항목 이름은 겹칠 수 없다(공백 정리 뒤 비교). 이미 쌓인 OUT 행은 rule_name을 그대로 갖고 있어 이름을 바꿔도 옛 기록은 안 바뀐다.
 * → {ok:true, rule} | {ok:false, errors:[{field,message}]}
 */
function saveOutRule(input) {
  var user = requirePermission_('out.rules');
  input = input || {};
  var errors = [], add = function (field, message) { errors.push({ field: field, message: message }); };
  var name = vioRuleKey_(input.name);
  var hasDesc = input.description !== undefined && input.description !== null;
  var desc = hasDesc ? String(input.description).trim() : '';
  if (!name) add('name', '항목 이름을 적어 주세요.');
  else if (name.length > VIO_RULE_NAME_MAX) add('name', '항목 이름은 ' + VIO_RULE_NAME_MAX + '자 안으로 적어 주세요.');
  if (desc.length > VIO_RULE_DESC_MAX) add('description', '설명은 ' + VIO_RULE_DESC_MAX + '자 안으로 적어 주세요.');
  var order = input.sortOrder === undefined || input.sortOrder === null || input.sortOrder === '' ? null : Number(input.sortOrder);
  if (order !== null && (!isFinite(order) || order % 1 !== 0 || order < 0 || order > 999)) add('sortOrder', '순서는 0~999 사이의 정수로 적어 주세요.');
  if (input.active !== undefined && input.active !== null && input.active !== true && input.active !== false) add('active', '켜기·끄기 값이 올바르지 않습니다.');
  if (errors.length) return { ok: false, errors: errors };
  return withLock_(function () {
    invalidate_('db', 'violation_rules');
    var rows = readAll_('violation_rules'), autoName = vioRuleKey_(DEFAULT_VIOLATION_RULES[0][0]);
    var cur = input.id ? rows.filter(function (r) { return String(r.id) === String(input.id); })[0] : null;
    if (input.id && !cur) return { ok: false, errors: [{ field: 'id', message: '항목을 찾을 수 없습니다. 새로 고친 뒤 다시 해 주세요.' }] };
    var isAuto = !!cur && vioRuleKey_(cur.name) === autoName;
    if (isAuto && name !== autoName) return { ok: false, errors: [{ field: 'name', message: '자동 항목의 이름은 바꿀 수 없습니다.' }] };
    if (!isAuto && (name === autoName || name.indexOf(autoName + '(') === 0)) return { ok: false, errors: [{ field: 'name', message: '자동 항목과 같은 이름은 쓸 수 없습니다.' }] };
    if (rows.some(function (r) { return (!cur || r.id !== cur.id) && vioRuleKey_(r.name) === name; })) return { ok: false, errors: [{ field: 'name', message: '같은 이름의 항목이 이미 있습니다.' }] };
    var active = input.active === undefined || input.active === null ? (cur ? isTruthy_(cur.active) : true) : input.active === true;
    if (isAuto) active = true;   // 자동 항목은 늘 켜짐(시트에서 꺼졌다면 저장 때 되돌린다)
    if (isAuto && input.active === false) return { ok: false, errors: [{ field: 'active', message: '자동 항목은 끌 수 없습니다.' }] };
    var sort = order === null ? (cur ? +cur.sort_order || 0 : Math.min(999, rows.reduce(function (m, r) { return Math.max(m, +r.sort_order || 0); }, 0) + 1)) : order;
    var rec = { name: name, description: hasDesc ? desc : (cur ? String(cur.description || '') : ''), active: active ? 'TRUE' : 'FALSE', sort_order: String(sort) };
    var saved = cur ? updateRecord_('violation_rules', cur.id, rec, user.email) : appendRecord_('violation_rules', rec, user.email);
    return { ok: true, rule: vioRuleView_(Object.assign({ id: saved.id }, saved)) };
  });
}
