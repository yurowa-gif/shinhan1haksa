/**
 * F1 사전 특이사항(C5). PRD F1, docs/design/screens.md 2절, docs/contracts/vocabulary.md.
 *
 * - 출결 담당·관리자: 학사생 전체에 입력하면 바로 '확정'. 담임(자기 반)·학생별 담당교사(담당 학생)는 '요청'만 남기고,
 *   출결 담당이 확정하거나 사유를 적어 취소한다.
 * - 기간 입력은 날짜마다 1행, 같은 묶음(group_id). 확정·취소는 묶음 단위. 기록은 지우지 않는다(취소 = status '취소' + cancel_reason,
 *   변경 전후 값은 audit_log).
 * - 미인정 유형(exception.auto_out_types)을 확정하면 그 묶음마다 자동 1OUT이 기록된다(2단계 C12, AutoOuts.gs). 취소하면 그 OUT도 함께 취소된다.
 * - 출석부 칸에는 유형 약어만 나간다(사유 메모는 안 나감, decisions 23 ⑥).
 *
 * 순수 함수(exc…)는 tests/features/exceptions.test.js가 R4 gas-fakes 환경에서 검사한다.
 * ASSUMPTION: 한 번에 넣는 기간은 62일까지, 한 운영 기간 안에서만(여러 기간에 걸치면 나누어 입력).
 * ASSUMPTION: 기간 입력에는 운영 안 하는 날도 행으로 들어간다(출석부는 운영 안 하는 날을 그리지 않는다).
 * 겹침(결정 22·R5): 같은 학생·날짜에 블록이 겹치는 요청·확정이 있으면 저장·확정 모두 경고하고 확인(confirmOverlap / acknowledge)을 받는다.
 *   확인 없이 오면 서버가 거부한다(미인정 유형끼리 겹치면 2단계에서 OUT이 2건이 되어 퇴실 대상이 될 수 있다). 겹침 자체는 막지 않는다(칸에는 최근 것 + "외 N", 결정 23 ②).
 * 취소는 묶음 전체 또는 "이 날만"(그 날 행 하나, 묶음은 그대로 한 묶음).
 * 목록·배지는 끝나지 않은 모든 운영 기간 탭을 읽는다(다음 기간 날짜로 낸 요청도 바로 보인다).
 * ASSUMPTION: 저장 권한은 담당·담임·출결·관리자만 — 근무일(isOnDuty) 교사는 범위에 넣지 않는다(F3 이후에도).
 */

var EXC_MAX_DAYS = 62;
var EXC_REASON_MAX = 200;
var EXC_CANCEL_REASON_MIN = 2;
var EXC_LIVE = ['요청', '확정'];

/** 설정 행(config/settings) → {types:[이름], typeShort:{유형:약어}, autoOut:[유형]}. 비어 있으면 기본값(Schema.gs DEFAULT_SETTINGS). */
function excSettings_(rows) {
  var kv = {};
  (rows || []).forEach(function (r) { kv[String(r.key || '').trim()] = String(r.value || ''); });
  var defaults = {};
  DEFAULT_SETTINGS.forEach(function (s) { defaults[s[0]] = s[1]; });
  var get = function (k) { return kv[k] !== undefined && kv[k].trim() !== '' ? kv[k] : defaults[k] || ''; };
  var split = function (s) { return String(s).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; }); };
  var typeShort = {};
  split(get('exception.type_short')).forEach(function (p) {
    var i = p.lastIndexOf(':');
    if (i > 0) typeShort[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return { types: split(get('exception.types')), typeShort: typeShort, autoOut: split(get('exception.auto_out_types')) };
}

/** 화면 칩용 유형 목록: [{name, short, auto}] (auto = 미인정 유형: 확정하면 자동 1OUT이 기록된다) */
function excTypeChips_(settings) {
  return settings.types.map(function (t) {
    return { name: t, short: attTypeShort_(t, settings.typeShort) || t, auto: settings.autoOut.indexOf(t) >= 0 };
  });
}

/**
 * 입력 검사(순수).
 * @param {Object} input {studentId, from, to, blocks, type, reason}
 * @param {{terms:Object[], types:string[]}} ctx
 * @return {{ok, errors:{field,message}[], dates:string[], term:Object|null, rec:{blocks,type,reason}}}
 */
function excValidate_(input, ctx) {
  input = input || {};
  var errors = [];
  var add = function (field, message) { errors.push({ field: field, message: message }); };
  if (!String(input.studentId || '').trim()) add('studentId', '학생을 골라 주세요.');
  var from = String(input.from || '').trim();
  var to = String(input.to || '').trim() || from;
  var dates = [], term = null;
  if (!ymdIsValid_(from)) add('from', '날짜를 골라 주세요.');
  else if (!ymdIsValid_(to)) add('to', '종료일을 날짜로 골라 주세요.');
  else if (to < from) add('to', '종료일이 시작일보다 빠릅니다. 종료일을 같은 날이나 뒤로 고쳐 주세요.');
  else if (ymdDiffDays_(from, to) + 1 > EXC_MAX_DAYS) add('to', '한 번에 ' + EXC_MAX_DAYS + '일까지 입력할 수 있습니다. 나누어 입력해 주세요.');
  else {
    term = termOnDate_(from, ctx.terms);
    if (!term) add('from', '이 날짜는 어떤 운영 기간에도 속하지 않습니다. 운영 기간을 먼저 만들어 주세요.');
    else if (to > term.end_date) add('to', '종료일이 "' + term.name + '" 운영 기간(' + foodDateKo_(term.end_date) + '까지)을 넘습니다. 날짜를 나누어 입력해 주세요.');
    else dates = ymdRange_(from, to, EXC_MAX_DAYS);
  }
  var spec = String(input.blocks || '').trim() || 'ALL';
  var parsed = parseBlockSpec_(spec);
  if (parsed.errors.length) add('blocks', '시간을 다시 골라 주세요. ' + parsed.errors[0]);
  var type = String(input.type || '').trim();
  if (!type) add('type', '유형을 골라 주세요.');
  else if ((ctx.types || []).indexOf(type) < 0) add('type', '목록에 없는 유형입니다. 목록에서 골라 주세요.');
  var reason = String(input.reason || '').trim();
  if (reason.length > EXC_REASON_MAX) add('reason', '메모는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요. 건강 정보는 길게 적지 않는 것이 좋습니다.');
  return { ok: errors.length === 0, errors: errors, dates: dates, term: term,
    rec: { blocks: parsed.errors.length ? '' : (parsed.all ? 'ALL' : formatBlockSpec_(parsed)), type: type, reason: reason } };
}

/** 두 블록 표기가 겹치는지(ALL은 하루 전체, 맞닿기만 하면 겹치지 않음) */
function excSpecsOverlap_(a, b) {
  var pa = parseBlockSpec_(a), pb = parseBlockSpec_(b);
  if (pa.errors.length || pb.errors.length) return false;
  if (pa.all || pb.all) return true;
  return pa.ranges.some(function (x) {
    return pb.ranges.some(function (y) { return hmToMin_(x.start) < hmToMin_(y.end) && hmToMin_(y.start) < hmToMin_(x.end); });
  });
}

/** 블록 표기 → 화면 글자(ALL = 전체) */
function excBlocksText_(blocks) {
  return blocks === 'ALL' ? '전체' : String(blocks).split(';').map(function (x) { return x.trim(); }).join(' · ');
}

/** 같은 학생·날짜에 이미 있는(요청·확정) 특이사항과 겹치면 경고 문구 목록: "이미 겹치는 특이사항이 있습니다(유형·블록)" */
function excOverlapWarnings_(rows, studentId, dates, spec) {
  var out = [];
  var days = {};
  dates.forEach(function (d) { days[d] = true; });
  var seen = {};
  rows.forEach(function (r) {
    if (r.student_id !== studentId || !days[r.date] || EXC_LIVE.indexOf(String(r.status).trim()) < 0) return;
    if (!excSpecsOverlap_(spec, r.blocks)) return;
    var key = r.type + '|' + r.blocks + '|' + r.status;
    if (seen[key]) return;
    seen[key] = true;
    out.push('이미 겹치는 특이사항이 있습니다(' + r.type + '·' + excBlocksText_(r.blocks) + (r.status === '요청' ? ', 요청 중' : '') + '). 그래도 저장하면 두 건이 됩니다.');
  });
  return out;
}

/**
 * 시트 행 → 묶음 목록(순수). 묶음 상태: 모두 취소면 '취소', 하나라도 요청이면 '요청', 아니면 '확정'.
 * @return {{groupId, studentId, dates:string[], blocks, type, reason, status, requestedBy, requestedAt, confirmedBy, confirmedAt, cancelReason, ids:string[]}[]} 날짜 늦은 순
 */
function excGroups_(rows) {
  var by = {}, order = [];
  rows.forEach(function (r) {
    var g = r.group_id || r.id;
    if (!by[g]) { by[g] = []; order.push(g); }
    by[g].push(r);
  });
  var out = order.map(function (g) {
    var rs = by[g].slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var live = rs.filter(function (r) { return String(r.status).trim() !== '취소'; });
    var status = !live.length ? '취소' : (live.some(function (r) { return r.status === '요청'; }) ? '요청' : '확정');
    var first = rs[0];
    return { groupId: g, studentId: first.student_id, dates: rs.map(function (r) { return r.date; }), liveDates: live.map(function (r) { return r.date; }), blocks: first.blocks, type: first.type,
      reason: first.reason || '', status: status, requestedBy: first.requested_by, requestedAt: first.requested_at,
      confirmedBy: live.length ? (live[0].confirmed_by || '') : '', confirmedAt: live.length ? (live[0].confirmed_at || '') : '',
      cancelReason: first.cancel_reason || '', ids: rs.map(function (r) { return r.id; }) };
  });
  return out.sort(function (a, b) { var x = a.dates[0], y = b.dates[0]; return x < y ? 1 : x > y ? -1 : 0; });
}

/**
 * 이 사용자가 볼 수 있는 학생 id 집합(순수): 이번 기간 등록 학생 중
 * 관리자·출결 담당 = 전체, 학사 교사 = 담당 학생(wide면 전체, 결정 45 보기용), 담임 = 자기 반(여러 역할이면 합집합).
 * 입력 화면의 학생 선택은 wide를 주지 않는다(저장 범위와 같아야 한다).
 */
function excVisibleIds_(user, enrollments, students, termId, wide) {   // wide = excViewWide_() — 보기 목록만 true
  var enrolled = enrollments.filter(function (e) { return e.term_id === termId; });
  var byId = {};
  students.forEach(function (s) { byId[s.id] = s; });
  var ids = Object.create(null);   // 'constructor' 같은 학생 id가 범위 검사를 지나지 않게
  var all = user.roles.indexOf('admin') >= 0 || user.roles.indexOf('attendance') >= 0;
  enrolled.forEach(function (e) {
    var s = byId[e.student_id];
    if (!s) return;
    if (all ||
        (user.roles.indexOf('hall_teacher') >= 0 && (wide || normalizeEmail_(e.teacher_email) === user.email)) ||
        (user.roles.indexOf('homeroom') >= 0 && sameClass_(user.homeroomClass, s.grade, s.class_no))) ids[s.id] = true;
  });
  return ids;
}

/** 보기(목록·학생별)가 넓은지: 권한표 exception.view의 wideView 표시를 읽는다(저장·입력 선택에는 쓰지 않는다) */
function excViewWide_() { return !!permissions_()['exception.view'].wideView; }

/** 저장·검사가 쓰는 시작일과 같은 값(trim) — 권한 판정도 이 날짜의 기간으로 한다 */
function excYmd_(input) { return String((input && input.from) || '').trim(); }

function excDisplay_(s) { return s.grade + '. ' + s.name; }

function excCanConfirm_(user) { return hasAnyAllowedRole_(user.roles, permissions_()['exception.confirm'].roles); }

/** 끝난 운영 기간인가(끝난 기간은 보기만) */
function excTermEnded_(term) { return term.end_date < today_(); }

var EXC_ENDED_MSG = '끝난 운영 기간의 특이사항은 볼 수만 있습니다.';

/** 저장할 기간의 오류: 끝난 기간은 보기만, 학생은 그 기간 명단에 있어야 한다(관리자도 마찬가지 — 목록에 안 보여 취소할 수 없는 기록을 막는다) */
function excTermErrors_(enrollments, studentId, term) {
  if (excTermEnded_(term)) return [{ field: 'from', message: '"' + term.name + '" 운영 기간은 이미 끝났습니다. ' + EXC_ENDED_MSG }];
  var ok = enrollments.some(function (e) { return e.term_id === term.id && e.student_id === studentId; });
  return ok ? [] : [{ field: 'studentId', message: '"' + term.name + '" 명단에 없는 학생입니다. 명단 올리기에서 먼저 등록해 주세요.' }];
}

/* ───────────── 읽기 도우미 ───────────── */

function excLoad_() {
  return { terms: readAll_('terms'), students: readAll_('students'), enrollments: readAll_('enrollments'),
    changes: readAll_('status_changes'), settings: excSettings_(readAll_('settings', 'config')) };
}

/** 그 기간의 특이사항 행. 탭이 아직 없으면 빈 목록과 missing 표시 */
function excRows_(term) {
  try {
    return { rows: readAll_(termSheetName_('exceptions', term.id)), missing: false };
  } catch (e) {
    if (String(e.message).indexOf('탭이 없습니다') >= 0) return { rows: [], missing: true };
    throw e;
  }
}

function excDenied_(user, action, why) {
  logDenied_(user.email, action, why);
  throw new Error(DENIED_MESSAGE);
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 입력 화면 시작값: 기간·유형 칩·고를 수 있는 학생(역할별)·입력 방식(확정 또는 요청).
 * date를 비우면 오늘.
 */
function getExceptionContext(date) {
  var user = requirePermission_('exception.view');
  var d = excLoad_();
  var today = today_();
  var ymd = String(date || '').trim() || today;
  if (!ymdIsValid_(ymd)) throw new Error('날짜를 골라 주세요.');
  var term = termOnDate_(ymd, d.terms) || getCurrentTerm_();
  if (!term) throw new Error('운영 기간이 없습니다. 관리자 선생님께 운영 기간을 만들어 달라고 요청해 주세요.');
  var base = ymd < term.start_date ? term.start_date : (ymd > term.end_date ? term.end_date : ymd);
  var enrByStudent = {};
  d.enrollments.forEach(function (e) { if (e.term_id === term.id) enrByStudent[e.student_id] = e; });
  var pick = function (visible) {
    return d.students.filter(function (s) { return visible[s.id] && isActiveOn_(d.changes, enrByStudent[s.id], base); })
      .sort(function (a, b) { return String(a.student_no).localeCompare(String(b.student_no)); })
      .map(function (s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no }; });
  };
  var students = pick(excVisibleIds_(user, d.enrollments, d.students, term.id));   // 입력용: 저장할 수 있는 학생만
  var viewStudents = pick(excVisibleIds_(user, d.enrollments, d.students, term.id, excViewWide_()));   // 학생별 보기용(그 기간 등록 학생)
  return {
    today: today, date: ymd, tomorrow: ymdAddDays_(today, 1), term: { id: term.id, name: term.name, start_date: term.start_date, end_date: term.end_date },
    mode: excCanConfirm_(user) ? 'confirm' : 'request', types: excTypeChips_(d.settings), students: students, viewStudents: viewStudents,
    canConfirm: excCanConfirm_(user)
  };
}

/** 그 날짜의 출석 블록(블록 칩용). 운영 안 하는 날이면 operating false. */
function getDayBlocks(date) {
  requirePermission_('exception.view');
  var ymd = String(date || '').trim();
  if (!ymdIsValid_(ymd)) throw new Error('날짜를 골라 주세요.');
  var terms = readAll_('terms');
  var plan = resolveDayPlan_(ymd, {
    termType: calTermTypeOn_(terms, ymd), daySchedule: pickDaySchedule_(readAll_('day_schedules'), ymd),
    blocks: readAll_('blocks'), defaults: calDefaults_(readAll_('settings', 'config'))
  });
  return { date: ymd, operating: plan.operating, memo: plan.memo, warnings: plan.warnings,
    blocks: plan.blocks.map(function (b) { return { seq: b.seq, start: b.start, end: b.end, label: b.label }; }) };
}

/** 저장 전 확인: 검사 결과·겹침 경고·미인정 안내. 아무것도 쓰지 않는다. */
function previewException(input) {
  var user = requirePermission_('exception.save', { studentId: input && input.studentId, ymd: excYmd_(input) });
  var d = excLoad_();
  var v = excValidate_(input, { terms: d.terms, types: d.settings.types });
  if (v.term) v.errors = v.errors.concat(excTermErrors_(d.enrollments, String(input.studentId), v.term));
  v.ok = !v.errors.length;
  var out = { ok: v.ok, errors: v.errors, mode: excCanConfirm_(user) ? 'confirm' : 'request', dayCount: v.dates.length, warnings: [],
    autoOut: v.ok && d.settings.autoOut.indexOf(v.rec.type) >= 0 };
  if (v.ok) out.warnings = excOverlapWarnings_(excRows_(v.term).rows, String(input.studentId), v.dates, v.rec.blocks);
  return out;
}

/**
 * 특이사항 저장. 출결 담당·관리자는 바로 '확정', 담임·학사 교사는 '요청'. 날짜마다 1행(같은 묶음).
 * 학생 범위는 첫 줄의 권한 검사가 서버에서 판정한다(담임 = 자기 반, 학사 교사 = 담당 학생). 판정 기준은 입력한 시작일(from)이 속한 기간.
 * 겹치는 특이사항이 있으면 input.confirmOverlap이 true일 때만 저장한다(아니면 {ok:false, needsConfirm:true, warnings}).
 */
function saveException(input) {
  var user = requirePermission_('exception.save', { studentId: input && input.studentId, ymd: excYmd_(input) });
  var res = withLock_(function () {
    ['terms', 'students', 'enrollments'].forEach(function (n) { invalidate_('db', n); });
    var d = excLoad_();
    var v = excValidate_(input, { terms: d.terms, types: d.settings.types });
    var studentId = String(input.studentId);
    if (v.term) v.errors = v.errors.concat(excTermErrors_(d.enrollments, studentId, v.term));
    if (v.errors.length) return { ok: false, errors: v.errors };
    var student = d.students.filter(function (s) { return s.id === studentId; })[0];
    var existing = excRows_(v.term);
    if (existing.missing) ensureTermSheet_('exceptions', v.term.id);
    var sheet = termSheetName_('exceptions', v.term.id);
    invalidate_('db', sheet);
    var warnings = excOverlapWarnings_(existing.rows, studentId, v.dates, v.rec.blocks);
    if (warnings.length && !input.confirmOverlap) return { ok: false, needsConfirm: true, warnings: warnings };
    var confirm = excCanConfirm_(user);
    var now = nowIso_();
    var group = Utilities.getUuid();
    var since = confirm ? vioAutoSince_(d.settings.autoOut, now) : null;   // 쓰기 전에, confirmed_at에 쓰는 바로 그 now로
    bulkAppend_(sheet, v.dates.map(function (date) {
      return { term_id: v.term.id, group_id: group, student_id: studentId, date: date, blocks: v.rec.blocks, type: v.rec.type,
        reason: v.rec.reason, status: confirm ? '확정' : '요청', requested_by: user.email, requested_at: now,
        confirmed_by: confirm ? user.email : '', confirmed_at: confirm ? now : '', cancel_reason: '' };
    }), user.email);
    var auto = confirm ? vioAfterExceptionWrite_(v.term, [studentId], user.email, since, [group]) : { out: { created: 0, canceled: 0, level: {} }, mails: [] };
    return { ok: true, groupId: group, count: v.dates.length, status: confirm ? '확정' : '요청', warnings: warnings,
      display: excDisplay_(student), type: v.rec.type, from: v.dates[0], to: v.dates[v.dates.length - 1],
      autoOut: d.settings.autoOut.indexOf(v.rec.type) >= 0, out: auto.out, _mails: auto.mails };
  });
  return excFinishAuto_(res, user);
}

/** 락이 끝난 뒤: 자동 OUT 알림을 보내고(실패해도 저장은 그대로) 응답에서 내부 칸을 뗀다 */
function excFinishAuto_(res, user) {
  if (!res || !res._mails) return res;
  var mails = res._mails;
  delete res._mails;
  if (mails.length) { var m = vioSendAutoMail_(mails, user.email); res.out = Object.assign({}, res.out, { notified: m.notified, notifyWarn: m.warn }); }
  return res;
}

function excGroupView_(g, term, d, namesByEmail, studentById, user, range, outIds) {
  var s = studentById[g.studentId] || {};
  var chip = excTypeChips_(d.settings).filter(function (c) { return c.name === g.type; })[0];
  var mine = g.requestedBy === user.email;
  var rangeDates = range ? g.dates.filter(function (x) { return x >= range.from && x <= range.to; }) : [];
  var liveInRange = range ? g.liveDates.filter(function (x) { return x >= range.from && x <= range.to; }) : [];
  var ended = excTermEnded_(term);
  return {
    groupId: g.groupId, termId: term.id, termName: term.name, studentId: g.studentId, display: s.name ? excDisplay_(s) : '(알 수 없음)',
    dates: g.dates, canceledDates: g.dates.filter(function (x) { return g.liveDates.indexOf(x) < 0; }), rangeDates: rangeDates,
    rangeCanceled: !!range && !!rangeDates.length && !liveInRange.length,   // 이 날(조회 범위)은 이미 취소된 날
    blocks: g.blocks, blocksText: excBlocksText_(g.blocks),
    type: g.type, short: chip ? chip.short : g.type, auto: !!chip && chip.auto,
    hasOut: g.ids.some(function (id) { return !!(outIds && outIds[id]); }),   // 이 묶음에 살아 있는 자동 1OUT이 있는가(설정만 보고 1OUT이라 하지 않는다)
    reason: g.reason, status: g.status,
    requestedAt: String(g.requestedAt || ''),   // 요청한 시각(읽기 전용) — 화면이 경과 시간을 보인다
    requestedByName: namesByEmail[normalizeEmail_(g.requestedBy)] || '(등록 안 된 교사)', mine: mine,   // users에 없으면 메일 주소를 내보내지 않는다(Duty와 같은 말)
    cancelReason: g.cancelReason,
    // 끝난 기간은 보기만 — 눌러도 늘 거부되는 버튼은 보이지 않게 한다
    canConfirm: !ended && g.status === '요청' && excCanConfirm_(user),
    canCancel: !ended && g.status !== '취소' && (excCanConfirm_(user) || (mine && g.status === '요청'))
  };
}

/** 끝나지 않은 모든 운영 기간(지금·앞으로). 다음 기간 날짜로 낸 요청도 기간이 시작되기 전에 처리할 수 있게 한다 */
function excLiveTerms_(terms, today) {
  return terms.filter(function (t) { return t.end_date && t.end_date >= today; })
    .sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });
}

/**
 * 목록. filter = {scope:'pending'|'mine'|'range'|'student', from, to, studentId, termId}
 *  - pending: 확정할 요청(출결 담당·관리자만)  - mine: 내가 보낸 요청·입력  - range: 날짜 범위  - student: 한 학생의 누적(날짜 역순)
 * pending·mine은 끝나지 않은 모든 기간의 탭을, range는 그 범위에 걸치는 모든 기간의 탭을 읽는다(기간 경계에 걸친 '이번 주'는 두 탭).
 * 묶음 카드는 묶음 전체 날짜(dates)를 보여 주고, 조회 범위에 든 날은 rangeDates. 묶음마다 termId가 있다.
 * 역할별로 볼 수 있는 학생(excVisibleIds_)만 나온다.
 */
function listExceptions(filter) {
  var user = requirePermission_('exception.view');
  filter = filter || {};
  var d = excLoad_();
  var today = today_();
  var scope = String(filter.scope || 'range');
  var terms = [], range = null;
  if (scope === 'pending' || scope === 'mine') {
    terms = excLiveTerms_(d.terms, today);
  } else if (scope === 'range') {
    var from = String(filter.from || today), to = String(filter.to || from);
    if (!ymdIsValid_(from) || !ymdIsValid_(to)) throw new Error('날짜를 골라 주세요.');
    range = { from: from, to: to };
    terms = d.terms.filter(function (t) { return t.start_date && t.end_date && t.start_date <= to && t.end_date >= from; })
      .sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });
  } else {
    var one = (filter.termId ? d.terms.filter(function (t) { return t.id === filter.termId; })[0] : null) ||
      termOnDate_(String(filter.from || today), d.terms) || getCurrentTerm_();
    terms = one ? [one] : [];
  }
  if (scope === 'pending' && !excCanConfirm_(user)) excDenied_(user, 'exception.view', '요청 처리 목록은 출결 담당·관리자 선생님만');
  if (scope === 'student') {
    var anyVisible = terms.some(function (t) { return excVisibleIds_(user, d.enrollments, d.students, t.id, excViewWide_())[String(filter.studentId || '')]; });   // 학생 id는 prototype 없는 집합에서만 찾는다
    if (!anyVisible) excDenied_(user, 'exception.view', '범위 밖 학생 ' + String(filter.studentId || ''));
  }
  if (!terms.length) return { ok: true, groups: [], term: null, total: 0 };
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = u.name; });
  var byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  var groups = [];
  terms.forEach(function (term) {
    var visible = excVisibleIds_(user, d.enrollments, d.students, term.id, excViewWide_());
    var liveOutIds = {};   // 살아 있는 F1자동 OUT이 가리키는 특이사항 행 id
    try { vioViolations_(term).forEach(function (v) { if (ruleRowLive_(v) && String(v.source) === 'F1자동') liveOutIds[String(v.source_exception_id)] = true; }); } catch (e) { liveOutIds = {}; }
    var rows = excRows_(term).rows.filter(function (r) { return visible[r.student_id] || (scope === 'mine' && r.requested_by === user.email); });
    if (scope === 'pending') rows = rows.filter(function (r) { return r.status === '요청'; });
    else if (scope === 'mine') rows = rows.filter(function (r) { return r.requested_by === user.email; });
    else if (scope === 'student') rows = rows.filter(function (r) { return r.student_id === String(filter.studentId); });
    // 범위 조회는 행이 아니라 묶음 단위로 고른다(하루만 걸쳐도 묶음 전체를 보여 준다)
    var inRange = null;
    if (range) {
      inRange = {};
      rows.forEach(function (r) { if (r.date >= range.from && r.date <= range.to) inRange[r.group_id || r.id] = true; });
    }
    excGroups_(rows).forEach(function (g) {
      if (inRange && !inRange[g.groupId]) return;
      groups.push(excGroupView_(g, term, d, names, byId, user, range, liveOutIds));
    });
  });
  if (scope === 'range') groups.sort(function (a, b) { return a.rangeDates[0] < b.rangeDates[0] ? -1 : a.rangeDates[0] > b.rangeDates[0] ? 1 : 0; });
  else groups.sort(function (a, b) { return a.dates[0] < b.dates[0] ? 1 : a.dates[0] > b.dates[0] ? -1 : 0; });
  var live = {};   // 살아 있는(취소 아닌, 조회 범위의 그 날이 취소되지 않은) 묶음의 학생 수 — 홈 "오늘 N명"과 같은 기준
  groups.forEach(function (g) { if (g.status !== '취소' && !g.rangeCanceled) live[g.studentId] = true; });
  return { ok: true, term: { id: terms[0].id, name: terms[0].name }, groups: groups.slice(0, 300), total: groups.length, liveStudentCount: Object.keys(live).length };
}

function excFindTerm_(termId) {
  var term = readAll_('terms').filter(function (t) { return t.id === String(termId || ''); })[0];
  if (!term) throw new Error('운영 기간을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
  return term;
}

/**
 * 요청 한 묶음을 확정한다. 출결 담당·관리자만. 이미 처리됐으면 안내.
 * 그 기간에 등록된 학생만 확정한다. 같은 학생·날짜에 블록이 겹치는 다른 특이사항이 있으면 acknowledge가 true일 때만 확정한다
 * (아니면 {ok:false, needsConfirm:true, warnings}) — 미인정끼리 겹치면 2단계에서 OUT이 2건이 된다(R5 가정).
 */
function confirmException(termId, groupId, acknowledge) {
  var user = requirePermission_('exception.confirm');
  var gid = String(groupId || '').trim();
  if (!gid) return { ok: false, error: '묶음을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };   // 빈 id가 group_id가 빈 여러 행과 맞지 않게
  var res = withLock_(function () {
    var term = excFindTerm_(termId);
    if (excTermEnded_(term)) return { ok: false, error: EXC_ENDED_MSG };
    var sheet = termSheetName_('exceptions', term.id);
    invalidate_('db', sheet);
    invalidate_('db', 'enrollments');
    var all = excRows_(term).rows;
    var rows = all.filter(function (r) { return r.group_id === gid; });
    var pending = rows.filter(function (r) { return r.status === '요청'; });
    if (!pending.length) return { ok: false, error: '이미 처리된 요청입니다. 목록을 새로 불러와 주세요.' };
    var enrolled = {};
    readAll_('enrollments').forEach(function (e) { if (e.term_id === term.id) enrolled[e.student_id] = true; });
    if (pending.some(function (r) { return !enrolled[r.student_id]; })) {
      return { ok: false, error: '이 운영 기간에 등록된 학생이 아니어서 확정할 수 없습니다. 명단을 확인해 주세요.' };
    }
    var others = all.filter(function (r) { return r.group_id !== gid; });
    var warnings = [];
    pending.forEach(function (r) {
      excOverlapWarnings_(others, r.student_id, [r.date], r.blocks).forEach(function (w) { if (warnings.indexOf(w) < 0) warnings.push(w); });
    });
    if (warnings.length && !acknowledge) return { ok: false, needsConfirm: true, warnings: warnings };
    var now = nowIso_();
    var since = vioAutoSince_(excSettings_(readAll_('settings', 'config')).autoOut, now);   // 쓰기 전에, confirmed_at에 쓰는 바로 그 now로
    bulkUpdateRecords_(sheet, pending.map(function (r) { return { id: r.id, patch: { status: '확정', confirmed_by: user.email, confirmed_at: now } }; }), user.email);
    var auto = vioAfterExceptionWrite_(term, excUnique_(pending.map(function (r) { return r.student_id; })), user.email, since, [gid]);
    return { ok: true, count: pending.length, out: auto.out, _mails: auto.mails };
  });
  return excFinishAuto_(res, user);
}

function excUnique_(list) { var seen = {}, out = []; list.forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } }); return out; }

/**
 * 한 묶음을 취소한다(사유 필수, 행은 남고 status '취소'). onlyDate(YYYY-MM-DD)를 주면 그 날 행 하나만 취소하고 묶음은 그대로 둔다.
 * 출결 담당·관리자는 모두, 담임·학사 교사는 자기가 보낸 '요청'만. 자기가 보낸 요청이 이미 확정됐으면 안내(거부 기록 없음).
 */
function cancelException(termId, groupId, reason, onlyDate) {
  var user = requirePermission_('exception.cancel');
  var gid = String(groupId || '').trim();
  if (!gid) return { ok: false, error: '묶음을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };
  var res = withLock_(function () {
    var why = String(reason || '').trim();
    var term = excFindTerm_(termId);
    if (excTermEnded_(term)) return { ok: false, error: EXC_ENDED_MSG };
    var sheet = termSheetName_('exceptions', term.id);
    invalidate_('db', sheet);
    var rows = excRows_(term).rows.filter(function (r) { return r.group_id === gid; });
    var live = rows.filter(function (r) { return String(r.status).trim() !== '취소'; });
    if (!live.length) return { ok: false, error: '이미 취소된 기록입니다. 목록을 새로 불러와 주세요.' };
    // 소유 검사가 먼저: 남의 묶음이면 날짜가 맞든 안 맞든 거부 기록을 남긴다
    if (!excCanConfirm_(user) && live.some(function (r) { return r.requested_by !== user.email; })) excDenied_(user, 'exception.cancel', '내가 보낸 요청이 아님');
    var only = String(onlyDate || '').trim();
    if (only) {
      live = live.filter(function (r) { return r.date === only; });
      if (!live.length) return { ok: false, error: '고른 날(' + only + ')이 이 묶음에 없거나 이미 취소되었습니다. 목록을 새로 불러와 주세요.' };
    }
    if (!excCanConfirm_(user) && live.some(function (r) { return r.status !== '요청'; })) {
      return { ok: false, error: '이미 확정되어 출결 담당 선생님만 취소할 수 있습니다. 출결 담당 선생님께 취소를 요청해 주세요.' };
    }
    if (why.length < EXC_CANCEL_REASON_MIN) return { ok: false, error: '취소 사유를 ' + EXC_CANCEL_REASON_MIN + '자 이상 적어 주세요.' };
    if (why.length > EXC_REASON_MAX) return { ok: false, error: '취소 사유는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.' };
    var since = vioAutoSince_(excSettings_(readAll_('settings', 'config')).autoOut, nowIso_());
    bulkUpdateRecords_(sheet, live.map(function (r) { return { id: r.id, patch: { status: '취소', cancel_reason: why } }; }), user.email);
    var auto = vioAfterExceptionWrite_(term, excUnique_(live.map(function (r) { return r.student_id; })), user.email, since);
    return { ok: true, count: live.length, out: auto.out, _mails: auto.mails };
  });
  return excFinishAuto_(res, user);
}

/* ───────────── C45 결정 86: 경고 없는 요청 일괄 확정 ───────────── */

var EXC_BULK_MAX = 300;
var EXC_BULK_REASON = {
  warn: '같은 날 겹치는 특이사항이 있어 하나씩 확인해야 합니다.',
  auto: '미인정 유형이라 하나씩 확정해야 합니다(자동 1OUT이 생깁니다).',
  enroll: '이 운영 기간 명단에 없는 학생이라 확정할 수 없습니다.',
  done: '이미 처리된 요청입니다. 목록을 새로 불러와 주세요.'
};

/** 묶음의 현재 모습(행 id·상태·고친 시각) 요약 — 미리 보기와 확정 사이에 바뀌었는지 가리는 표 */
function excGroupSig_(rows) {
  return dtyHash_(rows.map(function (r) { return r.id + '|' + String(r.status).trim() + '|' + (r.updated_at || ''); }).sort().join(';'));
}

/**
 * 순수: 그 기간 행에서 일괄 확정 대상을 가른다. 대상 = 요청이 남은 묶음 중 하나씩 확정할 때 경고·거부가 없는 것
 * (명단 밖 학생 없음, 같은 학생·날짜에 겹치는 다른 요청·확정 없음, 미인정 유형 아님).
 * → {confirmable:[{groupId, sig, rows}], skipped:[{groupId, kind:'warn'|'auto'|'enroll', reason}]}  요청이 하나도 없는 묶음은 어느 쪽에도 없다
 */
function excBulkPlan_(rows, enrolled, autoOut) {
  var groups = {}, order = [];
  rows.forEach(function (r) {
    var g = excGroupOf_(r);
    if (!groups[g]) { groups[g] = []; order.push(g); }
    groups[g].push(r);
  });
  var plan = { confirmable: [], skipped: [] };
  order.forEach(function (gid) {
    var mine = groups[gid], pending = mine.filter(function (r) { return String(r.status).trim() === '요청'; });
    if (!pending.length) return;
    var skip = function (kind) { plan.skipped.push({ groupId: gid, kind: kind, reason: EXC_BULK_REASON[kind] }); };
    if (autoOut.indexOf(String(mine[0].type)) >= 0) { skip('auto'); return; }
    if (pending.some(function (r) { return !enrolled[r.student_id]; })) { skip('enroll'); return; }
    var others = rows.filter(function (r) { return excGroupOf_(r) !== gid; });
    var warned = pending.some(function (r) { return excOverlapWarnings_(others, r.student_id, [r.date], r.blocks).length > 0; });
    if (warned) { skip('warn'); return; }
    plan.confirmable.push({ groupId: gid, sig: excGroupSig_(mine), rows: pending });
  });
  return plan;
}

function excEnrolledMap_(term) {
  var enrolled = {};
  readAll_('enrollments').forEach(function (e) { if (e.term_id === term.id) enrolled[e.student_id] = true; });
  return enrolled;
}

/** token = "묶음id.표;묶음id.표…" — 묶음마다 미리 볼 때의 모습을 담아 확정 때 그 묶음만 stale로 남긴다 */
function excBulkToken_(confirmable) { return confirmable.map(function (c) { return c.groupId + '.' + c.sig; }).join(';'); }
function excBulkTokenMap_(token) {
  var m = Object.create(null);
  String(token || '').split(';').forEach(function (p) { var i = p.lastIndexOf('.'); if (i > 0) m[p.slice(0, i)] = p.slice(i + 1); });
  return m;
}

/**
 * 일괄 확정 미리 보기. 출결 담당·관리자만(exception.confirm). 아무것도 쓰지 않는다.
 * → {ok, ended, confirmable:[groupId], skipped:[{groupId, kind, reason}], token, counts:{confirm, kept, warn, auto, other}}
 */
function previewBulkConfirm(termId) {
  requirePermission_('exception.confirm');
  var term = excFindTerm_(termId);
  var empty = { ok: true, ended: false, confirmable: [], skipped: [], token: '', counts: { confirm: 0, kept: 0, warn: 0, auto: 0, other: 0 } };
  if (excTermEnded_(term)) { empty.ended = true; return empty; }
  var plan = excBulkPlan_(excRows_(term).rows, excEnrolledMap_(term), excSettings_(readAll_('settings', 'config')).autoOut);
  var count = function (k) { return plan.skipped.filter(function (x) { return x.kind === k; }).length; };
  return { ok: true, ended: false, confirmable: plan.confirmable.map(function (c) { return c.groupId; }), skipped: plan.skipped, token: excBulkToken_(plan.confirmable),
    counts: { confirm: plan.confirmable.length, kept: plan.skipped.length, warn: count('warn'), auto: count('auto'), other: count('enroll') } };
}

/**
 * 고른 묶음을 하나씩 확정과 똑같이 확정한다(묶음마다 audit_log 한 줄, 확정자·시각 기록). 락 안에서 다시 판정해
 * 그사이 바뀐 묶음(미리 볼 때와 모습이 다름)·경고가 생긴 묶음·미인정 묶음은 확정하지 않고 남긴다. 일부가 실패해도 나머지는 진행한다.
 * → {ok, confirmed:N, kept:M, failed:K, details:[{groupId, result:'kept'|'failed', reason}]}
 */
function confirmExceptionGroups(termId, groupIds, token) {
  var user = requirePermission_('exception.confirm');
  var ids = excUnique_((Array.isArray(groupIds) ? groupIds : []).map(function (g) { return String(g || '').trim(); }).filter(function (g) { return g; }));
  if (!ids.length) return { ok: false, error: '확정할 요청을 골라 주세요.' };
  if (ids.length > EXC_BULK_MAX) return { ok: false, error: '한 번에 ' + EXC_BULK_MAX + '건까지 확정할 수 있습니다.' };
  var seen = excBulkTokenMap_(token);
  return withLock_(function () {
    var term = excFindTerm_(termId);
    if (excTermEnded_(term)) return { ok: false, error: EXC_ENDED_MSG };
    if (!excCanConfirm_(user)) excDenied_(user, 'exception.confirm', '일괄 확정 권한 재확인');
    var sheet = termSheetName_('exceptions', term.id);
    invalidate_('db', sheet);
    invalidate_('db', 'enrollments');
    var plan = excBulkPlan_(excRows_(term).rows, excEnrolledMap_(term), excSettings_(readAll_('settings', 'config')).autoOut);
    var byConfirm = {}, bySkip = {};
    plan.confirmable.forEach(function (c) { byConfirm[c.groupId] = c; });
    plan.skipped.forEach(function (x) { bySkip[x.groupId] = x; });
    var out = { ok: true, confirmed: 0, kept: 0, failed: 0, details: [] };
    var keep = function (gid, reason) { out.kept++; out.details.push({ groupId: gid, result: 'kept', reason: reason }); };
    ids.forEach(function (gid) {
      var c = byConfirm[gid];
      if (!c) { keep(gid, bySkip[gid] ? bySkip[gid].reason : EXC_BULK_REASON.done); return; }
      if (seen[gid] !== c.sig) { keep(gid, STALE_MESSAGE); return; }   // 미리 본 뒤 다른 선생님이 고쳤거나 미리 보기에 없던 묶음
      try {
        var now = nowIso_();
        bulkUpdateRecords_(sheet, c.rows.map(function (r) { return { id: r.id, patch: { status: '확정', confirmed_by: user.email, confirmed_at: now } }; }), user.email);
        out.confirmed++;
      } catch (e) {
        out.failed++; out.details.push({ groupId: gid, result: 'failed', reason: '저장하지 못했습니다. 이 요청은 그대로 남았으니 하나씩 확정해 주세요.' });
      }
    });
    return out;
  });
}

/* ───────────── C43 G2·G4: 요청 카드 펼침(그날 칸)·기록 보기 ───────────── */

var EXC_PEEK_MAX = 7;   // 한 묶음에서 그날 칸을 보여 주는 날 수(긴 묶음은 앞 7일)
var EXC_FIXED_LABEL = { '학': '학원', '가': '가정' };

/** 묶음의 한 행 id → 묶음 id(group_id가 빈 옛 행은 자기 id) */
function excGroupOf_(r) { return String(r.group_id || r.id); }

/**
 * G2 순수: 그 학생의 날짜마다 "그날 칸" 한 줄 — 그날 쓰이는 고정 일정('학'·'가')과 이미 있는(요청·확정) 다른 묶음의 특이사항.
 * 사유·이메일·이름은 넣지 않는다. → [{date, dateKo, fixed:[{code,label,blocksText}], exceptions:[{type,status,blocksText}], line}]
 */
function excDayLines_(studentId, groupId, dates, rows, fixedRows) {
  return dates.slice(0, EXC_PEEK_MAX).map(function (date) {
    var wk = ymdWeekdayKo_(date);
    var fixed = effectiveFixedRows_(fixedRows, studentId, date).filter(function (f) { return String(f.weekday || '').trim() === wk; }).map(function (f) {
      var code = String(f.code || '').trim();
      return { code: code, label: EXC_FIXED_LABEL[code] || code, blocksText: excBlocksText_(String(f.blocks || '').trim() || 'ALL') };
    });
    var exceptions = rows.filter(function (r) {
      return r.student_id === studentId && String(r.date) === date && excGroupOf_(r) !== groupId && EXC_LIVE.indexOf(String(r.status).trim()) >= 0;
    }).map(function (r) { return { type: String(r.type), status: String(r.status).trim(), blocksText: excBlocksText_(r.blocks) }; });
    var parts = fixed.map(function (f) { return '고정 일정 ' + f.label + '(' + f.code + ') ' + f.blocksText; })
      .concat(exceptions.map(function (e) { return '이미 있는 특이사항 ' + e.type + ' ' + e.blocksText + '(' + e.status + ')'; }));
    return { date: date, dateKo: foodDateKo_(date), fixed: fixed, exceptions: exceptions, line: foodDateKo_(date) + ': ' + (parts.length ? parts.join(' · ') : '겹치는 일정 없음') };
  });
}

/**
 * G2: 요청 카드를 펼칠 때 부른다 — 그 묶음 학생의 그날 칸(고정 일정·이미 있는 특이사항). 요청 처리와 같은 권한(exception.confirm).
 * → {ok, days:[{dateKo, line, fixed, exceptions}], moreDays}
 */
function getExceptionDayView(termId, groupId) {
  requirePermission_('exception.confirm');
  var gid = String(groupId || '').trim();
  if (!gid) return { ok: false, error: '묶음을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };
  var term = excFindTerm_(termId);
  var rows = excRows_(term).rows;
  var mine = rows.filter(function (r) { return excGroupOf_(r) === gid; });
  if (!mine.length) return { ok: false, error: '묶음을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };
  var dates = mine.filter(function (r) { return String(r.status).trim() !== '취소'; }).map(function (r) { return String(r.date); }).sort();
  var days = excDayLines_(mine[0].student_id, gid, dates, rows, readAll_('fixed_schedules'));
  return { ok: true, days: days, moreDays: Math.max(0, dates.length - days.length) };
}

var EXC_HIST_COLS = { status: '상태', type: '유형', blocks: '블록', reason: '사유', date: '날짜' };
var EXC_HIST_MAX = 60;

/** 자유 글(사유·취소 사유)에 섞였을 수 있는 전화번호·이메일을 가린다 */
function excScrub_(t) {
  return String(t === undefined || t === null ? '' : t).replace(/[^\s@]+@[^\s@]+/g, '(이메일 생략)').replace(/\+?\d[\d\s-]{6,}\d/g, '(번호 생략)').slice(0, EXC_REASON_MAX);
}

function excJson_(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

/**
 * G4 순수: audit_log 줄 중 이 묶음(행 id 집합 ids) 것만 골라 사람이 읽는 줄로. 이메일·다른 학생·전체 JSON은 내보내지 않는다.
 * groupRows = 그 묶음의 행(등록 줄에서 유형·날짜·블록을 읽는 데만 쓴다).
 * → [{at(YYYY-MM-DDTHH:mm), atKo, who, what, why}] 오래된 순
 */
function excHistoryEntries_(auditRows, sheetName, ids, groupRows, namesByEmail) {
  var first = groupRows[0] || {};
  var dates = groupRows.map(function (r) { return String(r.date); }).sort();
  var dateRange = !dates.length ? '' : dates.length === 1 || dates[0] === dates[dates.length - 1] ? foodDateKo_(dates[0]) : foodDateKo_(dates[0]) + ' ~ ' + foodDateKo_(dates[dates.length - 1]);
  var dateOf = {};
  groupRows.forEach(function (r) { dateOf[r.id] = String(r.date); });
  var out = [];
  // 요청 상태로 등록했다가 나중에 확정한 묶음인가(확정 줄이 audit_log에 있으면 등록 때는 요청이었다)
  var confirmedLater = auditRows.some(function (a) {
    if (String(a.sheet) !== sheetName || String(a.action) !== 'bulk_update') return false;
    var b = excJson_(a.before) || {}, n = excJson_(a.after) || {};
    return Object.keys(n).some(function (id) { return ids[id] && n[id] && n[id].status === '확정' && b[id] && b[id].status === '요청'; });
  });
  auditRows.forEach(function (a) {
    if (String(a.sheet) !== sheetName) return;
    var act = String(a.action), who = namesByEmail[normalizeEmail_(a.created_by)] || '(등록 안 된 교사)';
    var at = String(a.created_at || '');
    var entry = { at: at.slice(0, 16), atKo: ymdIsValid_(at.slice(0, 10)) ? foodDateKo_(at.slice(0, 10)) + ' ' + at.slice(11, 16) : '', who: who, what: '', why: '' };
    if (act === 'bulk_create' || act === 'create') {
      var made = act === 'create' ? [String(a.row_id)] : (excJson_(a.after) || []);
      if (!made.some(function (id) { return ids[id]; })) return;
      entry.what = (confirmedLater ? '요청 등록' : String(first.status) === '요청' ? '요청 등록' : '등록(바로 확정)') + ': ' + [first.type, excBlocksText_(first.blocks), dateRange].join(' · ');
      entry.why = excScrub_(first.reason);
      out.push(entry); return;
    }
    if (act !== 'bulk_update' && act !== 'update') return;
    var before = act === 'update' ? (a.row_id ? (function () { var o = {}; o[a.row_id] = excJson_(a.before) || {}; return o; })() : {}) : (excJson_(a.before) || {});
    var after = act === 'update' ? (a.row_id ? (function () { var o = {}; o[a.row_id] = excJson_(a.after) || {}; return o; })() : {}) : (excJson_(a.after) || {});
    var changes = {}, touched = [], why = '';
    Object.keys(after).forEach(function (id) {
      if (!ids[id]) return;
      touched.push(id);
      var b = before[id] || {}, n = after[id] || {};
      Object.keys(EXC_HIST_COLS).forEach(function (col) {
        if (n[col] === undefined || String(n[col]) === String(b[col] === undefined ? '' : b[col])) return;
        var key = col + '\u0001' + String(b[col] === undefined ? '' : b[col]) + '\u0001' + String(n[col]);
        changes[key] = changes[key] || { col: col, from: b[col] === undefined ? '' : b[col], to: n[col] };
      });
      if (n.cancel_reason && !why) why = n.cancel_reason;
    });
    if (!touched.length) return;
    var text = Object.keys(changes).map(function (k) {
      var c = changes[k], show = function (v) { return c.col === 'reason' ? excScrub_(v) : c.col === 'blocks' ? excBlocksText_(v) : c.col === 'date' && ymdIsValid_(String(v)) ? foodDateKo_(String(v)) : String(v); };
      return EXC_HIST_COLS[c.col] + ' ' + (show(c.from) || '(없음)') + ' → ' + show(c.to);
    });
    if (!text.length) return;   // 확인한 시각·고친 사람 같은 내부 칸만 바뀐 줄
    var part = touched.length < groupRows.length ? ' (' + (touched.length <= 3 ? touched.map(function (id) { return foodDateKo_(dateOf[id] || ''); }).join(', ') : touched.length + '일') + '만)' : '';
    entry.what = text.join(' · ') + part;
    entry.why = excScrub_(why);
    out.push(entry);
  });
  return out.sort(function (x, y) { return x.at < y.at ? -1 : x.at > y.at ? 1 : 0; }).slice(0, EXC_HIST_MAX);
}

/**
 * G4: "기록 보기" — 그 요청(묶음)의 audit_log 줄만: 누가(이름)·언제·무엇(이전 → 새 값)·왜. 그 요청을 볼 수 있는 사람만(보기 범위 또는 내가 낸 요청).
 * → {ok, entries:[{atKo, who, what, why}]}
 */
function getExceptionHistory(termId, groupId) {
  var user = requirePermission_('exception.view');
  var gid = String(groupId || '').trim();
  if (!gid) return { ok: false, error: '묶음을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };
  var term = excFindTerm_(termId);
  var d = excLoad_();
  var mine = excRows_(term).rows.filter(function (r) { return excGroupOf_(r) === gid; });
  if (!mine.length) return { ok: false, error: '묶음을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };
  var visible = excVisibleIds_(user, d.enrollments, d.students, term.id, excViewWide_());
  if (!visible[mine[0].student_id] && mine[0].requested_by !== user.email) excDenied_(user, 'exception.view', '범위 밖 요청 기록');
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = u.name; });
  var ids = Object.create(null);
  mine.forEach(function (r) { ids[r.id] = true; });
  var entries = excHistoryEntries_(readAll_('audit_log'), termSheetName_('exceptions', term.id), ids, mine, names);
  return { ok: true, entries: entries.map(function (e) { return { atKo: e.atKo, who: e.who, what: e.what, why: e.why }; }) };
}

/**
 * 홈 카드용 요약(getHomeData가 부른다). 출결 담당·관리자: 확정할 요청 수(끝나지 않은 모든 기간)와 오늘·내일 특이사항 학생 수,
 * 학사 교사·담임: 내가 보낸 요청의 처리 상태 수, 담임은 학생별 요청 중 건수(perStudent). 기간·탭이 없으면 0.
 */
function excHomeInfo_(user) {
  var d = { terms: readAll_('terms') };
  var today = today_(), tomorrow = ymdAddDays_(today, 1);
  var out = { pending: 0, today: 0, tomorrow: 0, mine: { requested: 0, confirmed: 0, canceled: 0 }, canConfirm: excCanConfirm_(user), perStudent: {} };
  var days = { today: {}, tomorrow: {} };
  var pendingGroups = 0;
  var isHomeroom = user.roles.indexOf('homeroom') >= 0;
  var enrollments = readAll_('enrollments');
  var students = readAll_('students');
  excLiveTerms_(d.terms, today).forEach(function (term) {
    var rows = excRows_(term).rows;
    if (out.canConfirm) {
      var vis = excVisibleIds_(user, enrollments, students, term.id);   // 요청 처리 목록과 같은 기준(그 기간 명단의 학생만)
      var shown = rows.filter(function (r) { return vis[r.student_id]; });
      pendingGroups += excGroups_(shown.filter(function (r) { return r.status === '요청'; })).length;
      shown.forEach(function (r) {
        if (EXC_LIVE.indexOf(String(r.status).trim()) < 0) return;
        if (r.date === today) days.today[r.student_id] = true;
        if (r.date === tomorrow) days.tomorrow[r.student_id] = true;
      });
    }
    excGroups_(rows.filter(function (r) { return r.requested_by === user.email; })).forEach(function (g) {
      if (g.status === '요청') out.mine.requested++; else if (g.status === '확정') out.mine.confirmed++; else out.mine.canceled++;
    });
    if (isHomeroom) {
      var visible = excVisibleIds_(user, enrollments, students, term.id);
      excGroups_(rows.filter(function (r) { return r.status === '요청' && visible[r.student_id]; })).forEach(function (g) {
        out.perStudent[g.studentId] = (out.perStudent[g.studentId] || 0) + 1;
      });
    }
  });
  out.pending = pendingGroups;
  out.today = Object.keys(days.today).length;
  out.tomorrow = Object.keys(days.tomorrow).length;
  return out;
}
