/**
 * C28 학사 프로그램 + 참가자 → 사전 특이사항('학사 내 프로그램') 일괄 생성·함께 취소(결정 75②, docs/plan/s4-0-design.md).
 * 전역 이름 접두어 prg. 탭: programs(프로그램 1개 = 1날짜), program_participants(참가자 1명 = 1행, exception_id = 그 참가로 만든 특이사항 행).
 *
 * - 보기(program.view): 관리자·출결 담당·학사 교사. 만들기·참가자·취소(program.edit): 관리자·출결 담당·학사 교사(학생 범위 없음 — 특강은 학년·학생을 가리지 않는다).
 * - 만들면 참가 학생마다 특이사항 1행(유형 = 설정의 '학사 내 프로그램', 상태 '확정', 묶음 id는 참가자마다 새로 — 한 묶음 = 한 학생). 만든 사람은 audit_log.
 * - 프로그램을 취소하면 참가자와 아직 살아 있는 특이사항이 함께 '취소'된다(지우지 않는다). 참가자 한 명만 빼도 그 학생 특이사항만 취소된다.
 * - 특이사항 쪽에서 따로 취소된 행은 참가자 행은 그대로 두고 화면에 '특이사항 취소됨'으로 보인다.
 * - 쓰기는 모두 락 안에서 다시 읽고 다시 검사한다. 끝난 기간의 프로그램은 볼 수만 있다. 메일은 보내지 않는다(자동 OUT 알림은 기존 특이사항 경로와 같다).
 * ASSUMPTION: 프로그램을 고치는 화면은 없다. 이름·날짜·블록이 틀리면 취소하고 새로 만든다(특이사항 행이 날짜·블록을 복사해 가지므로 한쪽만 고치면 어긋난다).
 * ASSUMPTION: 같은 날짜·같은 이름의 살아 있는 프로그램은 둘 만들지 않는다(두 번 누르기·재시도 방지).
 * ASSUMPTION: 취소 사유는 programs에 칸이 없어 programs.memo 끝에 "[취소] 사유"로 붙인다(시트 구조 변경 없음).
 */
var PRG_NAME_MAX = 60;
var PRG_MEMO_MAX = 200;
var PRG_REASON_MIN = 2;
var PRG_TYPE_BASE = '학사 내 프로그램';

function prgOne_(r) { return { name: r.name, grade: +r.grade, classNo: r.class_no, number: r.number }; }

function prgTypeOf_(settings) {
  return (settings.types || []).filter(function (t) { return attTypeBase_(t) === PRG_TYPE_BASE; })[0] || '';
}

function prgLive_(r) { return String(r.status).trim() !== '취소'; }

/** 입력 검사(순수). input = {name, date, blocks, memo, studentIds[]} → {ok, errors, rec} */
function prgValidate_(input, ctx) {
  input = input || {};
  var errors = [], add = function (field, message) { errors.push({ field: field, message: message }); };
  var name = String(input.name === undefined || input.name === null ? '' : input.name).trim();
  if (!name) add('name', '프로그램 이름을 적어 주세요.');
  else if (name.length > PRG_NAME_MAX) add('name', '프로그램 이름은 ' + PRG_NAME_MAX + '자 안으로 적어 주세요.');
  var date = String(input.date || '').trim(), term = null;
  if (!ymdIsValid_(date)) add('date', '날짜를 골라 주세요.');
  else {
    term = termOnDate_(date, ctx.terms);
    if (!term) add('date', '이 날짜는 어떤 운영 기간에도 속하지 않습니다. 운영 기간을 먼저 만들어 주세요.');
    else if (term.end_date < ctx.today) add('date', '"' + term.name + '"은(는) 끝난 기간입니다. 끝난 운영 기간의 프로그램은 볼 수만 있습니다.');
  }
  var spec = String(input.blocks || '').trim() || 'ALL', parsed = parseBlockSpec_(spec);
  if (parsed.errors.length) add('blocks', '시간을 다시 골라 주세요. ' + parsed.errors[0]);
  var memo = String(input.memo === undefined || input.memo === null ? '' : input.memo).trim();
  if (memo.length > PRG_MEMO_MAX) add('memo', '메모는 ' + PRG_MEMO_MAX + '자 안으로 적어 주세요.');
  var ids = [];
  (Array.isArray(input.studentIds) ? input.studentIds : []).forEach(function (x) { x = String(x || '').trim(); if (x && ids.indexOf(x) < 0) ids.push(x); });
  if (ctx.needStudents && !ids.length) add('studentIds', '참가 학생을 한 명 이상 골라 주세요.');
  if (!prgTypeOf_(ctx.settings)) add('name', '사전 특이사항 유형에 "' + PRG_TYPE_BASE + '"이(가) 없습니다. 설정(exception.types)에 먼저 넣어 주세요.');
  return { ok: !errors.length, errors: errors, term: term,
    rec: { name: name, date: date, blocks: parsed.errors.length ? '' : (parsed.all ? 'ALL' : formatBlockSpec_(parsed)), memo: memo, studentIds: ids } };
}

function prgLoad_() {
  var d = excLoad_();
  d.today = today_();
  d.programs = readAll_('programs');
  d.participants = readAll_('program_participants');
  return d;
}

/**
 * 참가 학생 검사: 그 기간 명단에 있어야 한다. 그날 학사 입실이 아니거나 같은 시간에 다른 특이사항이 있으면 경고만(막지 않고, 그대로 따로 만든다).
 * 경고는 학생 수로 모아 한 줄씩 낸다(이름 없음). → {errors, warnings, overlap(같은 시간 특이사항이 있는 학생 수), inactive}
 */
function prgStudentChecks_(d, term, date, ids, rows, blocks) {
  var errors = [], warnings = [], overlap = 0, inactive = 0;
  var byId = {}, enr = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  d.enrollments.forEach(function (e) { if (e.term_id === term.id) enr[e.student_id] = e; });
  ids.forEach(function (id) {
    var s = byId[id];
    if (!s) { errors.push({ field: 'studentIds', message: '찾을 수 없는 학생이 있습니다. 새로 불러온 뒤 다시 해 주세요.' }); return; }
    if (!enr[id]) { errors.push({ field: 'studentIds', message: s.name + ' 학생은 "' + term.name + '" 명단에 없습니다. 명단 올리기에서 먼저 등록해 주세요.' }); return; }
    if (!isActiveOn_(d.changes, enr[id], date)) inactive++;
    if (excOverlapWarnings_(rows, id, [date], blocks).length) overlap++;
  });
  if (inactive) warnings.push(inactive + '명은 이 날 학사 입실 상태가 아닙니다.');
  if (overlap) warnings.push(overlap + '명은 같은 시간에 다른 특이사항이 있습니다. 그대로 두고 프로그램 특이사항을 따로 만듭니다.');
  return { errors: errors, warnings: warnings, overlap: overlap, inactive: inactive };
}

function prgExceptionRow_(term, p, studentId, type, user, now, id) {
  return { id: id, term_id: term.id, group_id: Utilities.getUuid(), student_id: studentId, date: p.date, blocks: p.blocks, type: type,
    reason: '프로그램: ' + p.name, status: '확정', requested_by: user.email, requested_at: now, confirmed_by: user.email, confirmed_at: now, cancel_reason: '' };
}

/** 프로그램 날짜가 속한 기간과 그 기간의 특이사항 행(탭이 없으면 만든다 — 쓰기 전용) */
function prgExcSheet_(term) {
  if (excRows_(term).missing) ensureTermSheet_('exceptions', term.id);
  var sheet = termSheetName_('exceptions', term.id);
  invalidate_('db', sheet);
  return sheet;
}

/** 락 안: 쓰기 뒤 자동 OUT을 맞춘다(특이사항 저장·취소와 같은 경로). 프로그램 유형이 미인정 유형으로 설정돼 있지 않으면 아무 일도 없다. */
function prgAfterWrite_(term, studentIds, user, since) {
  return studentIds.length ? vioAfterExceptionWrite_(term, studentIds, user.email, since) : { out: { created: 0, canceled: 0, level: {} }, mails: [] };
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/** 화면 시작값: 기간·고를 수 있는 학생(편집 권한이 있을 때만)·그날 블록. date를 비우면 오늘. */
function getProgramContext(date) {
  var user = requirePermission_('program.view');
  var canEdit = hasAnyAllowedRole_(user.roles, permissions_()['program.edit'].roles);
  var d = excLoad_(), today = today_();
  var ymd = String(date || '').trim() || today;
  if (!ymdIsValid_(ymd)) throw new Error('날짜를 골라 주세요.');
  var term = termOnDate_(ymd, d.terms) || getCurrentTerm_();
  if (!term) throw new Error('운영 기간이 없습니다. 관리자에게 운영 기간을 만들어 달라고 요청해 주세요.');
  var out = { today: today, date: ymd, canEdit: canEdit, term: { id: term.id, name: term.name, start_date: term.start_date, end_date: term.end_date, ended: term.end_date < today }, students: [], blocks: [], operating: true };
  var plan = resolveDayPlan_(ymd, { termType: calTermTypeOn_(d.terms, ymd), daySchedule: pickDaySchedule_(readAll_('day_schedules'), ymd),
    blocks: readAll_('blocks'), defaults: calDefaults_(readAll_('settings', 'config')) });
  out.operating = plan.operating;
  out.blocks = plan.blocks.map(function (b) { return { seq: b.seq, start: b.start, end: b.end, label: b.label }; });
  if (canEdit) {
    var enr = {};
    d.enrollments.forEach(function (e) { if (e.term_id === term.id) enr[e.student_id] = e; });
    var base = ymd < term.start_date ? term.start_date : (ymd > term.end_date ? term.end_date : ymd);
    out.students = d.students.filter(function (s) { return enr[s.id] && isActiveOn_(d.changes, enr[s.id], base); })
      .sort(function (a, b) { return String(a.student_no).localeCompare(String(b.student_no)); })
      .map(function (s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number, studentNo: s.student_no, dorm: statusOn_(d.changes, s.id, '기숙사', base) === '입실' }; });
  }
  return out;
}

/** 프로그램 목록(그 기간, 날짜순). filter = {termId?} 없으면 지금 기간. 참가자 이름은 살아 있는 참가자만. */
function listPrograms(filter) {
  var user = requirePermission_('program.view');
  var canEdit = hasAnyAllowedRole_(user.roles, permissions_()['program.edit'].roles);
  var d = prgLoad_();
  var term = filter && filter.termId ? d.terms.filter(function (t) { return t.id === String(filter.termId); })[0] : (termOnDate_(d.today, d.terms) || getCurrentTerm_());
  if (!term) throw new Error('운영 기간이 없습니다. 관리자에게 운영 기간을 만들어 달라고 요청해 주세요.');
  var byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  var exById = {};
  excRows_(term).rows.forEach(function (r) { exById[r.id] = r; });
  var ended = term.end_date < d.today;
  var items = d.programs.filter(function (p) { return p.date >= term.start_date && p.date <= term.end_date; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.name < b.name ? -1 : 1); })
    .map(function (p) {
      var live = prgLive_(p);
      var people = d.participants.filter(function (x) { return x.program_id === p.id && prgLive_(x); }).map(function (x) {
        var s = byId[x.student_id] || {}, ex = exById[x.exception_id];
        return { studentId: x.student_id, student: prgOne_(s), exceptionLive: !!ex && EXC_LIVE.indexOf(String(ex.status).trim()) >= 0 };
      }).sort(function (a, b) { return (a.student.grade - b.student.grade) || String(a.student.classNo).localeCompare(String(b.student.classNo)) || (Number(a.student.number) - Number(b.student.number)); });
      return { id: p.id, name: p.name, date: p.date, dateKo: foodDateKo_(p.date), blocks: p.blocks, blocksText: excBlocksText_(p.blocks), memo: p.memo || '', status: live ? '유효' : '취소',
        participants: live ? people : [], count: live ? people.length : 0, exceptionCount: live ? people.filter(function (q) { return q.exceptionLive; }).length : 0, canCancel: canEdit && live && !ended };
    });
  return { today: d.today, term: { id: term.id, name: term.name, ended: ended }, canEdit: canEdit, items: items };
}

/** 저장 전 확인: 검사 결과·경고. 아무것도 쓰지 않는다. */
function previewProgram(input) {
  requirePermission_('program.edit');
  var d = prgLoad_();
  var v = prgValidate_(input, { terms: d.terms, settings: d.settings, today: d.today, needStudents: true });
  var out = { ok: false, errors: v.errors, warnings: [], count: v.rec.studentIds.length, overlap: 0, inactive: 0 };
  if (v.term && !v.errors.length) {
    var c = prgStudentChecks_(d, v.term, v.rec.date, v.rec.studentIds, excRows_(v.term).rows, v.rec.blocks);
    out.errors = out.errors.concat(c.errors); out.warnings = c.warnings; out.overlap = c.overlap; out.inactive = c.inactive;
    if (d.programs.some(function (p) { return prgLive_(p) && p.date === v.rec.date && p.name === v.rec.name; })) out.errors.push({ field: 'name', message: '같은 날짜에 같은 이름의 프로그램이 이미 있습니다.' });
  }
  out.ok = !out.errors.length;
  return out;
}

/**
 * 프로그램 만들기 + 참가자 특이사항 일괄 생성. input = {name, date, blocks, memo, studentIds, confirmOverlap?}.
 * 겹치는 특이사항·입실 상태가 아닌 학생 경고가 있으면 confirmOverlap이 true일 때만 저장한다(아니면 {ok:false, needsConfirm:true, warnings}).
 * → {ok:true, id, count} | {ok:false, errors} | {ok:false, needsConfirm, warnings}
 */
function saveProgram(input) {
  var user = requirePermission_('program.edit');
  var res = withLock_(function () {
    ['terms', 'students', 'enrollments', 'programs', 'program_participants'].forEach(function (n) { invalidate_('db', n); });
    invalidate_('config', 'settings');
    var d = prgLoad_();
    var v = prgValidate_(input, { terms: d.terms, settings: d.settings, today: d.today, needStudents: true });
    if (v.errors.length) return { ok: false, errors: v.errors };
    if (d.programs.some(function (p) { return prgLive_(p) && p.date === v.rec.date && p.name === v.rec.name; })) {
      return { ok: false, errors: [{ field: 'name', message: '같은 날짜에 같은 이름의 프로그램이 이미 있습니다. 이미 저장된 프로그램이면 목록에서 확인해 주세요.' }] };
    }
    var c = prgStudentChecks_(d, v.term, v.rec.date, v.rec.studentIds, excRows_(v.term).rows, v.rec.blocks);
    if (c.errors.length) return { ok: false, errors: c.errors };
    if (c.warnings.length && !(input && input.confirmOverlap === true)) return { ok: false, needsConfirm: true, warnings: c.warnings };
    var now = nowIso_(), type = prgTypeOf_(d.settings);
    var since = vioAutoSince_(d.settings.autoOut, now);
    var sheet = prgExcSheet_(v.term);
    var prog = appendRecord_('programs', { name: v.rec.name, date: v.rec.date, blocks: v.rec.blocks, memo: v.rec.memo, status: '유효' }, user.email);
    var exRows = [], people = [];
    v.rec.studentIds.forEach(function (sid) {
      var exId = Utilities.getUuid();
      exRows.push(prgExceptionRow_(v.term, v.rec, sid, type, user, now, exId));
      people.push({ program_id: prog.id, student_id: sid, exception_id: exId, status: '유효' });
    });
    bulkAppend_(sheet, exRows, user.email);
    bulkAppend_('program_participants', people, user.email);
    var auto = prgAfterWrite_(v.term, v.rec.studentIds, user, since);
    return { ok: true, id: prog.id, count: people.length, warnings: c.warnings, out: auto.out, _mails: auto.mails };
  });
  return excFinishAuto_(res, user);
}

/** 한 프로그램과 그 기간을 락 안에서 다시 읽어 확인한다(없음·취소됨·끝난 기간은 오류 문구). → {error}|{d, prog, term} */
function prgFind_(programId, needLive) {
  ['terms', 'students', 'enrollments', 'programs', 'program_participants'].forEach(function (n) { invalidate_('db', n); });
  invalidate_('config', 'settings');
  var d = prgLoad_();
  var prog = d.programs.filter(function (p) { return p.id === String(programId || ''); })[0];
  if (!prog) return { error: '프로그램을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };
  if (needLive && !prgLive_(prog)) return { error: '이미 취소된 프로그램입니다. 목록을 새로 불러와 주세요.' };
  var term = termOnDate_(prog.date, d.terms);
  if (!term) return { error: '이 날짜는 어떤 운영 기간에도 속하지 않습니다.' };
  if (term.end_date < d.today) return { error: EXC_ENDED_MSG };
  return { d: d, prog: prog, term: term };
}

function prgReasonError_(reason) {
  var why = String(reason === undefined || reason === null ? '' : reason).trim();
  if (why.length < PRG_REASON_MIN) return '취소 사유를 ' + PRG_REASON_MIN + '자 이상 적어 주세요.';
  if (why.length > EXC_REASON_MAX) return '취소 사유는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.';
  return '';
}

/** 살아 있는 참가자들의 특이사항 행을 취소하는 패치와 참가자 취소 패치 */
function prgCancelPatches_(people, exRows, why) {
  var exById = {};
  exRows.forEach(function (r) { exById[r.id] = r; });
  var exPatches = [], pPatches = [], studentIds = [];
  people.forEach(function (x) {
    pPatches.push({ id: x.id, patch: { status: '취소' } });
    var ex = exById[x.exception_id];
    if (ex && EXC_LIVE.indexOf(String(ex.status).trim()) >= 0) { exPatches.push({ id: ex.id, patch: { status: '취소', cancel_reason: why } }); studentIds.push(x.student_id); }
  });
  return { ex: exPatches, p: pPatches, studentIds: studentIds };
}

/** 프로그램 취소: 참가자와 아직 살아 있는 특이사항을 함께 취소한다(사유 필수). */
function cancelProgram(programId, reason) {
  var user = requirePermission_('program.edit');
  var bad = prgReasonError_(reason);
  if (bad) return { ok: false, error: bad };
  var why = String(reason).trim();
  var res = withLock_(function () {
    var f = prgFind_(programId, true);
    if (f.error) return { ok: false, error: f.error };
    var sheet = prgExcSheet_(f.term);
    var people = f.d.participants.filter(function (x) { return x.program_id === f.prog.id && prgLive_(x); });
    var cp = prgCancelPatches_(people, excRows_(f.term).rows, '프로그램 취소: ' + why);
    var since = vioAutoSince_(f.d.settings.autoOut, nowIso_());
    if (cp.ex.length) bulkUpdateRecords_(sheet, cp.ex, user.email);
    if (cp.p.length) bulkUpdateRecords_('program_participants', cp.p, user.email);
    updateRecord_('programs', f.prog.id, { status: '취소', memo: (String(f.prog.memo || '') + (f.prog.memo ? '\n' : '') + '[취소] ' + why).slice(0, 400) }, user.email);
    var auto = prgAfterWrite_(f.term, cp.studentIds, user, since);
    return { ok: true, count: people.length, canceledExceptions: cp.ex.length, out: auto.out, _mails: auto.mails };
  });
  return excFinishAuto_(res, user);
}

/** 참가자 더하기. studentIds는 이미 참가 중인 학생을 건너뛴다. confirmOverlap은 saveProgram과 같다. */
function addProgramStudents(programId, studentIds, confirmOverlap) {
  var user = requirePermission_('program.edit');
  var res = withLock_(function () {
    var f = prgFind_(programId, true);
    if (f.error) return { ok: false, errors: [{ field: 'programId', message: f.error }] };
    var ids = [];
    (Array.isArray(studentIds) ? studentIds : []).forEach(function (x) { x = String(x || '').trim(); if (x && ids.indexOf(x) < 0) ids.push(x); });
    if (!ids.length) return { ok: false, errors: [{ field: 'studentIds', message: '더할 학생을 한 명 이상 골라 주세요.' }] };
    var type = prgTypeOf_(f.d.settings);
    if (!type) return { ok: false, errors: [{ field: 'studentIds', message: '사전 특이사항 유형에 "' + PRG_TYPE_BASE + '"이(가) 없습니다. 설정(exception.types)에 먼저 넣어 주세요.' }] };
    var already = {};
    f.d.participants.forEach(function (x) { if (x.program_id === f.prog.id && prgLive_(x)) already[x.student_id] = true; });
    var fresh = ids.filter(function (id) { return !already[id]; });
    if (!fresh.length) return { ok: true, count: 0, skipped: ids.length };
    var c = prgStudentChecks_(f.d, f.term, f.prog.date, fresh, excRows_(f.term).rows, f.prog.blocks);
    if (c.errors.length) return { ok: false, errors: c.errors };
    if (c.warnings.length && confirmOverlap !== true) return { ok: false, needsConfirm: true, warnings: c.warnings };
    var now = nowIso_(), since = vioAutoSince_(f.d.settings.autoOut, now), sheet = prgExcSheet_(f.term);
    var exRows = [], people = [];
    fresh.forEach(function (sid) {
      var exId = Utilities.getUuid();
      exRows.push(prgExceptionRow_(f.term, { date: f.prog.date, blocks: f.prog.blocks, name: f.prog.name }, sid, type, user, now, exId));
      people.push({ program_id: f.prog.id, student_id: sid, exception_id: exId, status: '유효' });
    });
    bulkAppend_(sheet, exRows, user.email);
    bulkAppend_('program_participants', people, user.email);
    var auto = prgAfterWrite_(f.term, fresh, user, since);
    return { ok: true, count: people.length, skipped: ids.length - fresh.length, warnings: c.warnings, out: auto.out, _mails: auto.mails };
  });
  return excFinishAuto_(res, user);
}

/** 참가자 한 명 빼기: 그 학생의 참가자 행과 아직 살아 있는 특이사항만 취소한다(사유 필수). */
function removeProgramStudent(programId, studentId, reason) {
  var user = requirePermission_('program.edit');
  var bad = prgReasonError_(reason);
  if (bad) return { ok: false, error: bad };
  var why = String(reason).trim();
  var res = withLock_(function () {
    var f = prgFind_(programId, true);
    if (f.error) return { ok: false, error: f.error };
    var people = f.d.participants.filter(function (x) { return x.program_id === f.prog.id && x.student_id === String(studentId || '') && prgLive_(x); });
    if (!people.length) return { ok: false, error: '이미 빠졌거나 이 프로그램의 참가자가 아닙니다. 목록을 새로 불러와 주세요.' };
    var sheet = prgExcSheet_(f.term);
    var cp = prgCancelPatches_(people, excRows_(f.term).rows, '프로그램 참가 취소: ' + why);
    var since = vioAutoSince_(f.d.settings.autoOut, nowIso_());
    if (cp.ex.length) bulkUpdateRecords_(sheet, cp.ex, user.email);
    bulkUpdateRecords_('program_participants', cp.p, user.email);
    var auto = prgAfterWrite_(f.term, cp.studentIds, user, since);
    return { ok: true, canceledExceptions: cp.ex.length, out: auto.out, _mails: auto.mails };
  });
  return excFinishAuto_(res, user);
}
