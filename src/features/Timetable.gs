/**
 * C37 F9 학원·희망 자습 시간표(학생 제출 → 학부모 동의 → 담당교사 확인, 7단계). 전역 이름 접두어 ttc. PRD F9, 결정 31·82, R23(TimetableRules.gs).
 * 열은 fixed_schedules 그대로(새 열 없음). 상태는 R23 ttTransition_이 정하고(달 단위), 이 파일은 권한·저장·화면용 모양만 한다.
 * - 학생: 본인만 제출(신원은 portalWho_ 한 곳). 학부모: 연결된 자녀만 동의·동의하지 않음. 담당교사(자기 학생)·관리자: 확인·돌려보냄.
 * - 쓰기는 withLock_ 안에서 행을 다시 읽고 ttTransition_으로 다시 판정한다(그 사이 상태가 바뀌었으면 거부). 지우지 않는다(취소 = status '취소').
 * - 출석부에 반영: 확정되면 effectiveFixedRows_가 그 달부터 읽는다(확정 전에는 앞 달 확정 시간표 유지 — R23).
 * ASSUMPTION: 돌려보낸 사람·사유(교사 [돌려보내기]·부모 [동의하지 않습니다])는 새 열이 없어 audit_log(action 'timetable:return')에 남기고 학생 화면이 거기서 읽는다. 선생님 답에 따라 열로 옮길 수 있다.
 * ASSUMPTION: 평일 종료 유형(23:00/23:50)은 학생이 고른 값을 audit_log('timetable:submit')에 두었다가 교사가 [확인]할 때 enrollments.end_type을 바꾼다(총괄 결정, 새 열 없음). 바로 지금 달 출석부에도 적용된다.
 * ASSUMPTION: 학부모 [동의하지 않습니다]·교사 [돌려보내기]는 R23의 reject(상태 '반려')를 쓴다. 규칙 세션의 parentReturn·teacherReturn이 들어오면 이름만 바꾼다.
 * ASSUMPTION: [지난달 그대로 가져오기]는 이 파일의 ttcCopyPrevious_(앞 달 살아 있는 학·가 행)이다. 규칙 세션의 ttCopyPrevious_가 들어오면 그것으로 바꾼다.
 */
var TTC_END_TYPES = ['23:00', '23:50'];
var TTC_REASON_MAX = 100;
var TTC_RETURN_MIN = 2;
var TTC_RETURN_ACTION = 'reject';   // 규칙 세션이 parentReturn·teacherReturn을 넣으면 여기만 바꾼다

/* ───────────── 읽기 도우미 ───────────── */

function ttcCfg_() {
  var kv = {};
  readAll_('settings', 'config').forEach(function (r) { kv[String(r.key || '').trim()] = String(r.value === undefined ? '' : r.value).trim(); });
  return { startDay: kv['timetable.submit_start_day'], endDay: kv['timetable.submit_end_day'] };
}

function ttcLoad_() {
  ['fixed_schedules', 'enrollments', 'students', 'terms', 'blocks', 'users'].forEach(function (n) { invalidate_('db', n); });
  invalidate_('config', 'settings');
  return { rows: readAll_('fixed_schedules'), today: today_() };
}

function ttcMonthKo_(m) { return (+m.slice(5, 7)) + '월'; }

/** 그 달 요일별 출석 블록(① ② …) — 학기·방학 종류는 그 달 1일이 속한 기간(없으면 지금 기간). */
function ttcSlots_(month) {
  var term = termOnDate_(month + '-01') || getCurrentTerm_(), tt = term ? String(term.type || '').trim() : '';
  var blocks = readAll_('blocks').filter(function (b) { return String(b.status || '').trim() !== '취소' && String(b.term_type || '').trim() === tt; });
  var out = {};
  TT_WEEKDAYS.forEach(function (w) {
    var dt = attWeekdayBaseType_(w);
    out[w] = blocks.filter(function (b) { return String(b.day_type || '').trim() === dt; })
      .sort(function (a, b) { return hmNorm_(a.start) < hmNorm_(b.start) ? -1 : 1; })
      .map(function (b, i) { return { seq: i + 1, start: hmNorm_(b.start), end: hmNorm_(b.end) }; });
  });
  return out;
}

/** 그 달 살아 있는 학·가 행(없음 행 제외) → 화면용 [{weekday, blocks, code}] */
function ttcEntries_(rows, sid, month) {
  return ttMonthState_(rows, sid, month).rows.filter(function (r) { return ruleStr_(r.code) !== '없음' && ruleStr_(r.weekday); })
    .map(function (r) { return { weekday: ruleStr_(r.weekday), blocks: ruleStr_(r.blocks), code: ruleStr_(r.code) }; });
}

/** 앞 달('yyyy-MM') */
function ttcPrevMonth_(m) {
  var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1;
  if (mo < 1) { y -= 1; mo = 12; }
  return y + '-' + ('0' + mo).slice(-2);
}

/** 지난달 그대로 가져오기(ASSUMPTION: 앞 달에 살아 있는 학·가 행, 상태는 따지지 않는다). 없으면 [] */
function ttcCopyPrevious_(rows, sid, month) { return ttcEntries_(rows, sid, ttcPrevMonth_(month)); }

function ttcAuditRows_(action) {
  return readAll_('audit_log').filter(function (a) { return String(a.action) === action; });
}

/** audit_log의 가장 최근 기록 중 그 학생·달의 것(detail JSON {s, m, …}) → 객체 또는 null */
function ttcLastAudit_(action, sid, month) {
  var best = null;
  ttcAuditRows_(action).forEach(function (a) {
    var d; try { d = JSON.parse(String(a.detail)); } catch (e) { return; }
    if (d && d.s === sid && d.m === month && (!best || String(a.created_at) >= String(best.at))) best = { at: String(a.created_at), d: d };
  });
  return best ? best.d : null;
}

function ttcSaveAudit_(action, user, obj) {
  writeAudit_('fixed_schedules', '', action, null, null, user.email, 'db', JSON.stringify(obj));
}

/** 반려 상태일 때 돌려보낸 사람·사유(이메일 없음) */
function ttcReturnInfo_(sid, month, status) {
  if (status !== '반려') return null;
  var d = ttcLastAudit_('timetable:return', sid, month);
  return d ? { by: d.by === 'parent' ? 'parent' : 'teacher', byName: String(d.n || ''), reason: String(d.r || '') } : { by: 'teacher', byName: '', reason: '' };
}

function ttcEnrollment_(sid, month) {
  var term = termOnDate_(month + '-01') || getCurrentTerm_();
  return term ? readAll_('enrollments').filter(function (e) { return e.term_id === term.id && e.student_id === sid; })[0] || null : null;
}

function ttcStudent_(s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number }; }

function ttcDateKo_(iso) { return iso && ymdIsValid_(String(iso).slice(0, 10)) ? foodDateKo_(String(iso).slice(0, 10)) : ''; }

/** 제출 기간 알림용 {open, month, start, end, reason, startKo, endKo} */
function ttcWindow_(today) {
  var w = ttSubmitWindow_(today, ttcCfg_());
  return { open: w.open, month: w.month, start: w.start, end: w.end, reason: w.reason || '', startKo: ttcDateKo_(w.start), endKo: ttcDateKo_(w.end), monthKo: ttcMonthKo_(w.month) };
}

/** 이 학생·달의 화면용 상태 묶음(학생·학부모·교사가 같이 쓴다). 이메일은 없다. */
function ttcView_(rows, sid, month) {
  var st = ttMonthState_(rows, sid, month), live = st.rows;
  var sub = live.reduce(function (a, r) { return a || ruleStr_(r.submitted_at); }, '');
  var agr = live.reduce(function (a, r) { return a || ruleStr_(r.parent_agreed_at); }, '');
  var con = live.reduce(function (a, r) { return a || ruleStr_(r.teacher_confirmed_at); }, '');
  var sd = ttcLastAudit_('timetable:submit', sid, month);
  var enr = ttcEnrollment_(sid, month);
  return { month: month, monthKo: ttcMonthKo_(month), status: st.status, entries: ttcEntries_(rows, sid, month), submittedKo: ttcDateKo_(sub), agreedKo: ttcDateKo_(agr), confirmedKo: ttcDateKo_(con),
    endType: sd && sd.e ? sd.e : (enr && enr.end_type ? String(enr.end_type) : ''), currentEndType: enr && enr.end_type ? String(enr.end_type) : '',
    returned: ttcReturnInfo_(sid, month, st.status), slots: ttcSlots_(month) };
}

/** 계획(ttTransition_ 결과)을 쓴다. 새 행을 먼저 쓰고 옛 행을 취소한다. 락 안에서 부른다. */
function ttcApply_(plan, email) {
  if (plan.add.length) bulkAppend_('fixed_schedules', plan.add, email);
  var patches = plan.update.map(function (u) { return { id: u.id, patch: u.set }; }).concat(plan.cancel.map(function (id) { return { id: id, patch: { status: '취소' } }; }));
  if (patches.length) bulkUpdateRecords_('fixed_schedules', patches, email);
}

function ttcFail_(message, field) { return { ok: false, errors: [{ field: field || '', message: message }] }; }

function ttcMonthOk_(m) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || '')); }

/** 학생 본인 id(신원은 portalWho_ 한 곳). 없으면 '' */
function ttcOwnId_() { return portalWho_().studentId; }

/* ───────────── 학생 ───────────── */

/**
 * 학생 화면 시작값. 제출 기간·낸 상태·표·종료 시각·돌려보냄 안내.
 * → {ok:true, student, today, window, view(ttcView_), hasPrev} | {ok:false, reason}
 */
function getTimetableContext() {
  requirePermission_('timetable.mine');
  var sid = ttcOwnId_();
  if (!sid) return { ok: false, reason: '학생 명단에서 내 계정을 찾지 못했습니다. 담당 선생님께 알려 주세요.' };
  var d = ttcLoad_(), win = ttcWindow_(d.today);
  var view = ttcView_(d.rows, sid, win.month);
  return { ok: true, student: ttcStudent_(findById_('students', sid)), today: d.today, window: win, view: view, hasPrev: ttcCopyPrevious_(d.rows, sid, win.month).length > 0 };
}

/** [지난달 그대로 가져오기] 내용(저장하지 않는다). → {ok, entries, monthKo} */
function getPreviousTimetable(month) {
  requirePermission_('timetable.mine');
  var sid = ttcOwnId_();
  if (!sid || !ttcMonthOk_(month)) return ttcFail_('가져올 수 없습니다.');
  var d = ttcLoad_(), entries = ttcCopyPrevious_(d.rows, sid, String(month));
  return entries.length ? { ok: true, entries: entries, monthKo: ttcMonthKo_(ttcPrevMonth_(String(month))) } : ttcFail_('지난달에 낸 시간표가 없습니다.');
}

/**
 * 시간표 제출·다시 제출(학생 본인만). input = {month, entries:[{weekday, blocks, code}], endType?}. 제출 기간·중복·상태는 R23이 판정한다.
 * → {ok:true, status} | {ok:false, errors}
 */
function submitTimetable(input) {
  var user = requirePermission_('timetable.submit');
  var sid = ttcOwnId_();
  if (!sid) return ttcFail_('학생 명단에서 내 계정을 찾지 못했습니다.');
  input = input || {};
  var month = String(input.month || '');
  if (!ttcMonthOk_(month)) return ttcFail_('적용월을 확인할 수 없습니다. 새로 고친 뒤 다시 해 주세요.', 'month');
  var endType = String(input.endType || '').trim();
  if (endType && TTC_END_TYPES.indexOf(endType) < 0) return ttcFail_('평일 자습 끝나는 시각은 23:00 또는 23:50 중에서 골라 주세요.', 'endType');
  return withLock_(function () {
    var d = ttcLoad_();
    var plan = ttTransition_(d.rows, sid, month, 'submit', { now: nowIso_(), entries: Array.isArray(input.entries) ? input.entries : [], window: ttcCfg_() });
    if (!plan.ok) return ttcFail_(plan.reason);
    ttcApply_(plan, user.email);
    ttcSaveAudit_('timetable:submit', user, { s: sid, m: month, e: endType });
    return { ok: true, status: '제출', warnings: plan.warnings };
  });
}

/* ───────────── 학부모 ───────────── */

/**
 * 자녀의 동의할 시간표(학부모, 연결된 자녀만). 동의할 달 = 제출·동의 상태가 있는 가장 늦은 달, 없으면 가장 늦은 달.
 * → {ok:true, student, view, canAgree} | {ok:true, none:true, student}
 */
function getChildTimetable(studentId) {
  requirePermission_('timetable.parent', { studentId: studentId });
  var sid = String(studentId || '');
  var student = findById_('students', sid);
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  var d = ttcLoad_();
  var months = {};
  d.rows.forEach(function (r) { if (ruleStr_(r.student_id) === sid && ruleStr_(r.status) !== '취소' && ttcMonthOk_(ruleStr_(r.month))) months[ruleStr_(r.month)] = true; });
  var list = Object.keys(months).sort().reverse();
  if (!list.length) return { ok: true, none: true, student: ttcStudent_(student) };
  var pick = list.filter(function (m) { var s = ttMonthState_(d.rows, sid, m).status; return s === '제출' || s === '동의'; })[0] || list[0];
  var view = ttcView_(d.rows, sid, pick);
  return { ok: true, student: ttcStudent_(student), view: view, canAgree: view.status === '제출' };
}

/** 학부모 동의(연결된 자녀만). 락 안에서 상태를 다시 본다. → {ok:true} | {ok:false, errors} */
function agreeTimetable(studentId, month) {
  var user = requirePermission_('timetable.agree', { studentId: studentId });
  var sid = String(studentId || '');
  if (!ttcMonthOk_(month)) return ttcFail_('적용월을 확인할 수 없습니다.');
  return withLock_(function () {
    var d = ttcLoad_();
    var plan = ttTransition_(d.rows, sid, String(month), 'agree', { now: nowIso_() });
    if (!plan.ok) return ttcFail_(plan.reason);
    ttcApply_(plan, user.email);
    return { ok: true };
  });
}

/** 학부모 [동의하지 않습니다]: 사유 한 줄(선택, 100자). 학생에게 '돌려보냄'으로 돌아간다. → {ok:true} | {ok:false, errors} */
function declineTimetable(studentId, month, reason) {
  var user = requirePermission_('timetable.agree', { studentId: studentId });
  var sid = String(studentId || ''), why = String(reason === undefined || reason === null ? '' : reason).trim();
  if (!ttcMonthOk_(month)) return ttcFail_('적용월을 확인할 수 없습니다.');
  if (why.length > TTC_REASON_MAX) return ttcFail_('사유는 ' + TTC_REASON_MAX + '자 안으로 적어 주세요.', 'reason');
  return withLock_(function () {
    var d = ttcLoad_();
    var plan = ttTransition_(d.rows, sid, String(month), TTC_RETURN_ACTION, { now: nowIso_() });
    if (!plan.ok) return ttcFail_(plan.reason);
    var st = ttMonthState_(d.rows, sid, String(month)).status;
    if (st !== '제출') return ttcFail_('지금 상태(' + st + ')에서는 돌려보낼 수 없습니다. 새로 고쳐 주세요.');   // 부모는 동의 전(제출)에서만 돌려보낸다
    ttcApply_(plan, user.email);
    ttcSaveAudit_('timetable:return', user, { s: sid, m: String(month), by: 'parent', n: String(user.name || ''), r: why });
    return { ok: true };
  });
}

/* ───────────── 담당교사·관리자 ───────────── */

var TTC_LABEL = { '': '제출 안 함', '제출': '동의 기다림', '동의': '확인 필요', '확정': '확정', '반려': '돌려보냄', '혼합': '확인 필요' };

/**
 * 담당 학생(관리자는 이번 기간 학사생 전체)의 시간표 상태. month 비우면 제출 기간이면 그 적용월, 아니면 이번 달.
 * → {ok, month, months, deadline:{open, daysLeft, endKo}, counts:{todo, total, missing}, items:[{id, name, grade, classNo, number, status, label, todo}]}
 */
function listTimetables(month) {
  var user = requirePermission_('timetable.list');
  var d = ttcLoad_(), win = ttcWindow_(d.today), term = getCurrentTerm_();
  var m = ttcMonthOk_(month) ? String(month) : (win.open ? win.month : d.today.slice(0, 7));
  var out = { ok: true, month: m, monthKo: ttcMonthKo_(m), months: [d.today.slice(0, 7), win.open ? win.month : ttNextMonth_(d.today.slice(0, 7))].filter(function (x, i, a) { return a.indexOf(x) === i; }),
    deadline: { open: win.open, endKo: win.endKo, daysLeft: win.open ? ymdDiffDays_(d.today, win.end) : null }, counts: { todo: 0, total: 0, missing: 0 }, items: [] };
  if (!term) return out;
  var byId = {};
  readAll_('students').forEach(function (s) { byId[s.id] = s; });
  var admin = hasRole_(user, 'admin');
  var ids = readAll_('enrollments').filter(function (e) { return e.term_id === term.id && byId[e.student_id] && (admin || normalizeEmail_(e.teacher_email) === user.email); }).map(function (e) { return e.student_id; });
  ids.sort(function (a, b) { return String(byId[a].student_no).localeCompare(String(byId[b].student_no)); });
  var missing = ttMissing_(d.rows, ids, m);
  ids.forEach(function (id) {
    var st = ttMonthState_(d.rows, id, m).status, label = TTC_LABEL[st] || st;
    var todo = st === '동의' || st === '혼합' || st === '';
    out.items.push(Object.assign(ttcStudent_(byId[id]), { status: st, label: label, todo: todo }));
  });
  out.counts = { todo: out.items.filter(function (i) { return i.todo; }).length, total: out.items.length, missing: missing.length };
  return out;
}

/** 한 학생의 한 달 시간표(담당교사·관리자). → {ok:true, student, view} */
function getTimetableEntry(studentId, month) {
  requirePermission_('timetable.view', { studentId: studentId });
  var sid = String(studentId || '');
  var student = findById_('students', sid);
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  if (!ttcMonthOk_(month)) return ttcFail_('적용월을 확인할 수 없습니다.');
  var d = ttcLoad_();
  return { ok: true, student: ttcStudent_(student), view: ttcView_(d.rows, sid, String(month)) };
}

/**
 * 담당교사 확인(담당 학생·관리자). 학부모 동의가 있어야 한다(R23). endType을 주면 enrollments.end_type을 바꾼다(ASSUMPTION: 바로 적용).
 * → {ok:true} | {ok:false, errors}
 */
function confirmTimetable(studentId, month, endType) {
  var user = requirePermission_('timetable.confirm', { studentId: studentId });
  var sid = String(studentId || ''), et = String(endType || '').trim();
  if (!ttcMonthOk_(month)) return ttcFail_('적용월을 확인할 수 없습니다.');
  if (et && TTC_END_TYPES.indexOf(et) < 0) return ttcFail_('평일 자습 끝나는 시각은 23:00 또는 23:50 중에서 골라 주세요.', 'endType');
  return withLock_(function () {
    var d = ttcLoad_();
    var plan = ttTransition_(d.rows, sid, String(month), 'confirm', { now: nowIso_() });
    if (!plan.ok) return ttcFail_(plan.reason);
    var enr = et ? ttcEnrollment_(sid, String(month)) : null;
    ttcApply_(plan, user.email);
    if (enr && String(enr.end_type || '') !== et) updateRecord_('enrollments', enr.id, { end_type: et }, user.email);
    return { ok: true };
  });
}

/** 담당교사 돌려보내기(사유 필수 2~100자). 학생에게 '돌려보냄'으로 돌아간다. → {ok:true} | {ok:false, errors} */
function returnTimetable(studentId, month, reason) {
  var user = requirePermission_('timetable.confirm', { studentId: studentId });
  var sid = String(studentId || ''), why = String(reason === undefined || reason === null ? '' : reason).trim();
  if (!ttcMonthOk_(month)) return ttcFail_('적용월을 확인할 수 없습니다.');
  if (why.length < TTC_RETURN_MIN || why.length > TTC_REASON_MAX) return ttcFail_('돌려보내는 사유를 ' + TTC_RETURN_MIN + '자 이상 ' + TTC_REASON_MAX + '자 안으로 적어 주세요.', 'reason');
  return withLock_(function () {
    var d = ttcLoad_();
    var plan = ttTransition_(d.rows, sid, String(month), TTC_RETURN_ACTION, { now: nowIso_() });
    if (!plan.ok) return ttcFail_(plan.reason);
    ttcApply_(plan, user.email);
    ttcSaveAudit_('timetable:return', user, { s: sid, m: String(month), by: 'teacher', n: String(user.name || ''), r: why });
    return { ok: true };
  });
}

/* ───────────── 홈 카드 훅 ───────────── */

/**
 * 담당교사 홈 '시간표' 카드(getHomeData 훅, 숫자만). → {todo, missing, total, deadlineEndKo, daysLeft, open} | null(학사 교사가 아니면)
 */
function ttcHomeInfo_(user, role) {
  if (role !== 'hall_teacher') return null;
  var d = today_(), win = ttcWindow_(d), term = getCurrentTerm_();
  var m = win.open ? win.month : d.slice(0, 7), info = { month: m, monthKo: ttcMonthKo_(m), todo: 0, missing: 0, total: 0, open: win.open, endKo: win.endKo, daysLeft: win.open ? ymdDiffDays_(d, win.end) : null };
  if (!term) return info;
  var rows = readAll_('fixed_schedules');
  var ids = readAll_('enrollments').filter(function (e) { return e.term_id === term.id && normalizeEmail_(e.teacher_email) === user.email; }).map(function (e) { return e.student_id; });
  info.total = ids.length;
  info.missing = ttMissing_(rows, ids, m).length;
  info.todo = ids.filter(function (id) { var s = ttMonthState_(rows, id, m).status; return s === '동의' || s === '혼합'; }).length;
  return info;
}

/**
 * 학생·학부모 홈 '할 일' 한 칸(getPortalStudent에서 부른다). 학생: 제출 기간이고 아직 안 냈거나 돌려보내졌으면 {kind:'submit'|'returned'},
 * 학부모(자녀): 동의를 기다리는 시간표가 있으면 {kind:'agree'}. 할 일이 없으면 null. 이메일 없음.
 */
function ttcTodo_(sid, isOwn, today) {
  var rows = readAll_('fixed_schedules');
  if (isOwn) {
    var win = ttcWindow_(today);
    if (!win.open) return null;
    var st = ttMonthState_(rows, sid, win.month).status;
    if (st === '반려') return { kind: 'returned', monthKo: win.monthKo, endKo: win.endKo };
    return st === '' ? { kind: 'submit', monthKo: win.monthKo, startKo: win.startKo, endKo: win.endKo } : null;
  }
  var months = {};
  rows.forEach(function (r) { if (ruleStr_(r.student_id) === sid && ruleStr_(r.status) === '제출') months[ruleStr_(r.month)] = true; });
  var m = Object.keys(months).sort().reverse()[0];
  return m ? { kind: 'agree', month: m, monthKo: ttcMonthKo_(m) } : null;
}
