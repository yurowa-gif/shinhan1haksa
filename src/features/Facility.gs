/**
 * F10 시설 사용 일지(C35, 7단계, 결정 83). 전역 이름 접두어 fac. PRD F10, docs/design/stage7-screens.md 3절.
 * - 학생이 그날 근무교사에게 말한 뒤 앱에 직접 쓴다: 시설(settings facility.names)·날짜(오늘~과거 7일)·시작·종료·함께 쓴 학생·목적.
 *   쓰기·취소는 학생 본인만(facility.write, scope student → 신원은 portalWho_ 한 곳). 근무교사는 그날 일지(facility.view, dutyWindow 0 = 그날 실제 근무자만, 관리자는 어느 날이든),
 *   관리자는 학생 × 날짜 누적(facility.report). 락·감사·삭제 없음(취소 = status 취소 + 사유, 행은 남는다).
 * - 학생 응답에 넣지 않는 것: 다른 학생의 정보(함께 쓴 학생 후보와 내 일지의 함께 쓴 학생은 **이름만**), 다른 학생의 일지, 이메일·전화.
 * ASSUMPTION(총괄에게 알림):
 *   - 같은 시설·같은 시간이 겹치면 저장 전에 막고(needsConfirm) 학생이 [그래도 저장]을 눌러야 저장한다(시안은 오류, 총괄 지시는 '겹침 경고').
 *   - 본인 취소는 사유를 받지 않고 확인만 한다(총괄 결정 2026-11-19, 시안과 같음). cancel_reason에는 '본인 취소'를 남기고 audit_log에도 남는다. 본인의 유효한 일지는 날짜와 상관없이 취소할 수 있다.
 *   - 함께 쓴 학생도 그 시설을 쓴 것으로 누적표에 센다(작성자와 같은 시간).
 *   - 함께 쓴 학생 후보는 한꺼번에 내려주지 않고 이름·초성으로 찾을 때마다 최대 8명(searchFacilityStudents)만 이름과 **불투명 표식(handle)** 으로 돌려준다 — 다른 학생의 id·학번·학년·반이 학생 응답에 없다.
 *     그날 학사 입실 중인 그 기간 학사생만 후보이고, 저장할 때 표식을 서버가 다시 풀어(그날 후보인지 다시 확인) id로 쓴다.
 *   - 목적은 선택(100자 이내).
 */
var FAC_PAST_DAYS = 7;
var FAC_MAX_COMPANIONS = 10;
var FAC_PURPOSE_MAX = 100;
var FAC_SELF_CANCEL = '본인 취소';
var FAC_REPORT_MAX_DAYS = 62;
var FAC_MY_DAYS = 30;

/* ───────────── 순수 도우미 ───────────── */

/** 초성(순수): '김가온' → 'ㄱㄱㅇ' (한글 음절만) */
function facChosung_(str) {
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', out = '';
  String(str || '').split('').forEach(function (ch) {
    var c = ch.charCodeAt(0);
    out += (c >= 0xAC00 && c <= 0xD7A3) ? CHO.charAt(Math.floor((c - 0xAC00) / 588)) : ch;
  });
  return out;
}

/** 이름 검색(순수): 초성만 적으면 초성, 아니면 이름 일부. 빈 검색어는 아무도 찾지 않는다 */
function facNameMatch_(query, name) {
  var q = String(query || '').replace(/\s+/g, '');
  if (!q) return false;
  if (/^[ㄱ-ㅎ]+$/.test(q)) return facChosung_(name).indexOf(q) >= 0;
  return String(name || '').indexOf(q) >= 0;
}

/** 학생 id의 불투명 표식(함께 쓴 학생 고르기용). 소금은 스크립트 속성(처음 쓸 때 만든다) — 표식으로 id를 알아낼 수 없고 남이 만들 수도 없다 */
function facHandle_(id) {
  var props = PropertiesService.getScriptProperties(), salt = props.getProperty('FAC_HANDLE_SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('FAC_HANDLE_SALT', salt); }
  return 'h' + dtyHash_(salt + '|' + id);
}

/** settings facility.names → 시설 목록(쉼표 구분, 빈 값이면 기본값). rows = settings 행 */
function facNames_(settingRows) {
  var kv = '';
  (settingRows || []).forEach(function (r) { if (String(r.key || '').trim() === 'facility.names') kv = String(r.value || ''); });
  if (!kv.trim()) DEFAULT_SETTINGS.forEach(function (s) { if (s[0] === 'facility.names') kv = s[1]; });
  var out = [];
  kv.split(',').forEach(function (x) { x = x.trim(); if (x && out.indexOf(x) < 0) out.push(x); });
  return out;
}

/**
 * 입력 검사(순수). input = {facility, date, start, end, companions:[id], purpose}, ctx = {today, names, eligible:{학생id:true}(그날 학사 입실 중인 그 기간 학사생), selfId}
 * → {errors:[{field, message}], rec:{facility, date, start, end, companions:[id], purpose}}
 */
function facValidate_(input, ctx) {
  input = input || {};
  var errors = [], add = function (field, message) { errors.push({ field: field, message: message }); };
  var facility = String(input.facility || '').trim();
  if (!facility) add('facility', '시설을 골라 주세요.');
  else if (ctx.names.indexOf(facility) < 0) add('facility', '목록에 없는 시설입니다. 목록에서 골라 주세요.');
  var date = String(input.date || '').trim();
  if (!ymdIsValid_(date)) add('date', '날짜를 골라 주세요.');
  else if (date > ctx.today) add('date', '아직 오지 않은 날은 적을 수 없습니다.');
  else if (date < ymdAddDays_(ctx.today, -FAC_PAST_DAYS)) add('date', '오늘부터 ' + FAC_PAST_DAYS + '일 전까지만 적을 수 있습니다.');
  var start = hmNorm_(input.start), end = hmNorm_(input.end);
  if (!start) add('start', '시작 시각을 24시간 형식(예: 15:30)으로 적어 주세요.');
  if (!end) add('end', '끝나는 시각을 24시간 형식(예: 17:00)으로 적어 주세요.');
  if (start && end && hmToMin_(start) >= hmToMin_(end)) add('end', '끝나는 시각이 시작 시각보다 늦어야 합니다.');
  var raw = Array.isArray(input.companions) ? input.companions : [];
  var comp = [];
  if (raw.length > FAC_MAX_COMPANIONS) add('companions', '함께 쓴 학생은 ' + FAC_MAX_COMPANIONS + '명까지 고를 수 있습니다.');
  raw.forEach(function (id) {
    id = String(id || '').trim();
    if (!id || id === ctx.selfId || comp.indexOf(id) >= 0) return;
    if (!ctx.eligible[id]) { add('companions', '함께 쓴 학생을 다시 골라 주세요.'); return; }   // 이유(없는 학생·다른 기간·입실 아님)는 알려 주지 않는다
    comp.push(id);
  });
  var purpose = String(input.purpose || '').trim();
  if (purpose.length > FAC_PURPOSE_MAX) add('purpose', '목적은 ' + FAC_PURPOSE_MAX + '자 안으로 적어 주세요.');
  return { errors: errors, rec: { facility: facility, date: date, start: start || '', end: end || '', companions: comp, purpose: purpose } };
}

/** 같은 시설·같은 날·시간이 겹치는 살아 있는 일지(순수). rows = 그 기간 탭 행. → [{start, end}] */
function facOverlaps_(rows, rec) {
  if (!rec.start || !rec.end) return [];
  var s = hmToMin_(rec.start), e = hmToMin_(rec.end), out = [];
  (rows || []).forEach(function (r) {
    if (String(r.status || '').trim() !== '유효' || String(r.facility) !== rec.facility || String(r.date) !== rec.date) return;
    var rs = hmNorm_(r.start), re = hmNorm_(r.end);
    if (!rs || !re) return;
    if (s < hmToMin_(re) && hmToMin_(rs) < e) out.push({ start: rs, end: re });
  });
  return out;
}

/** 일지 한 줄의 사용 분(순수) */
function facMinutes_(row) {
  var s = hmNorm_(row.start), e = hmNorm_(row.end);
  return s && e && hmToMin_(e) > hmToMin_(s) ? hmToMin_(e) - hmToMin_(s) : 0;
}

/** 학생 id 쉼표 문자열 → 배열(순수) */
function facSplitIds_(s) {
  var out = [];
  String(s || '').split(',').forEach(function (x) { x = x.trim(); if (x && out.indexOf(x) < 0) out.push(x); });
  return out;
}

/**
 * 학생 × 날짜 누적(순수). logs = [{date, student_id, companions, facility, start, end, status}](유효만 센다), from·to 범위.
 * 작성자와 함께 쓴 학생 모두에게 같은 시간을 센다(한 일지는 사람마다 1번).
 * → {byStudent:{id:{days:{date:분}, total, count}}}
 */
function facReport_(logs, from, to) {
  var by = {};
  (logs || []).forEach(function (r) {
    var d = String(r.date);
    if (String(r.status || '').trim() !== '유효' || d < from || d > to) return;
    var min = facMinutes_(r);
    var people = [String(r.student_id)].concat(facSplitIds_(r.companions));
    var seen = {};
    people.forEach(function (id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      var b = by[id] = by[id] || { days: {}, total: 0, count: 0 };
      b.days[d] = (b.days[d] || 0) + min; b.total += min; b.count++;
    });
  });
  return { byStudent: by };
}

/* ───────────── 읽기 도우미 ───────────── */

function facRows_(term) {
  try { return readAll_(termSheetName_('facility_logs', term.id)); } catch (e) {
    if (String(e.message).indexOf('탭이 없습니다') >= 0) return [];
    throw e;
  }
}

/** 그날 그 기간 학사 입실 중인 학사생 id 집합 */
function facEligible_(term, date, enrollments, changes) {
  var out = Object.create(null);
  enrollments.forEach(function (e) {
    if (e.term_id === term.id && statusOn_(changes, e.student_id, '학사', date) === '입실') out[e.student_id] = true;
  });
  return out;
}

function facStaffOne_(s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number }; }

function facDenied_(user, action, why) {
  logDenied_(user.email, action, why);
  throw new Error('권한이 없습니다.');
}

/* ───────────── 학생: 쓰기·내 기록·취소 ───────────── */

/**
 * 쓰기 화면 시작값(학생 본인만): 시설 목록, 날짜 범위, 함께 쓸 수 있는 학생(이름만), 내 일지(최근 30일).
 */
function getFacilityForm() {
  var user = requirePermission_('facility.write', { studentId: portalWho_().studentId });
  var me = portalWho_().studentId, today = today_();
  var terms = readAll_('terms'), term = termOnDate_(today, terms) || getCurrentTerm_();
  var students = readAll_('students'), byId = {};
  students.forEach(function (s) { byId[s.id] = s; });
  var out = { ok: true, today: today, minDate: ymdAddDays_(today, -FAC_PAST_DAYS), names: facNames_(readAll_('settings', 'config')), term: term ? { id: term.id, name: term.name } : null,
    student: { name: byId[me] ? byId[me].name : '' }, logs: [] };
  if (!term) return out;
  var enrollments = readAll_('enrollments'), changes = readAll_('status_changes');
  var enrolledMe = enrollments.some(function (e) { return e.term_id === term.id && e.student_id === me; });
  out.enrolled = enrolledMe;
  // 내 일지: 오늘의 기간 + 7일 전이 속한 기간(기간 경계)
  var from = ymdAddDays_(today, -FAC_MY_DAYS), seenTerm = {};
  [term, termOnDate_(from, terms)].forEach(function (t) {
    if (!t || seenTerm[t.id]) return;
    seenTerm[t.id] = true;
    facRows_(t).forEach(function (r) {
      if (r.student_id !== me || String(r.date) < from || String(r.date) > today) return;
      out.logs.push({ id: r.id, termId: t.id, date: r.date, weekdayKo: ymdWeekdayKo_(r.date), facility: r.facility, start: hmNorm_(r.start) || r.start, end: hmNorm_(r.end) || r.end,
        companions: facSplitIds_(r.companions).map(function (id) { return byId[id] ? byId[id].name : '(알 수 없음)'; }), purpose: r.purpose || '', status: r.status });
    });
  });
  out.logs.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.start < b.start ? 1 : -1); });
  return out;
}

/**
 * 일지 저장(학생 본인). input = {facility, date, start, end, companions:[학생 id], purpose, confirmOverlap}.
 * 같은 시설·같은 시간이 겹치면 {ok:false, needsConfirm:true, warnings} — confirmOverlap이 참이어야 저장한다(ASSUMPTION).
 */
function saveFacilityLog(input) {
  var user = requirePermission_('facility.write', { studentId: portalWho_().studentId });
  var me = portalWho_().studentId;
  input = input || {};
  return withLock_(function () {
    ['terms', 'students', 'enrollments', 'status_changes'].forEach(function (n) { invalidate_('db', n); });
    invalidate_('config', 'settings');
    var today = today_(), terms = readAll_('terms');
    var names = facNames_(readAll_('settings', 'config'));
    var date = String(input.date || '').trim();
    var term = ymdIsValid_(date) ? termOnDate_(date, terms) : null;
    var eligible = term ? facEligible_(term, date, readAll_('enrollments'), readAll_('status_changes')) : Object.create(null);
    // 함께 쓴 학생은 표식(handle)으로 받는다 → 그날 후보의 id로 되돌린다(후보가 아니거나 모르는 표식은 그대로 두어 검사에서 거절)
    var byHandle = {};
    Object.keys(eligible).forEach(function (id) { byHandle[facHandle_(id)] = id; });
    var asIds = Array.isArray(input.companions) ? input.companions.map(function (h) { h = String(h || '').trim(); return byHandle[h] || ('?' + h); }) : [];
    var v = facValidate_(Object.assign({}, input, { companions: asIds }), { today: today, names: names, eligible: eligible, selfId: me });
    if (!v.errors.length && !term) v.errors.push({ field: 'date', message: '이 날짜는 어떤 운영 기간에도 속하지 않습니다.' });
    if (!v.errors.length && !eligible[me]) v.errors.push({ field: 'date', message: '그날은 학사 입실 상태가 아니라 적을 수 없습니다.' });
    if (v.errors.length) return { ok: false, errors: v.errors };
    var tab = termSheetName_('facility_logs', term.id);
    try { readAll_(tab); } catch (e) { if (String(e.message).indexOf('탭이 없습니다') >= 0) ensureTermSheet_('facility_logs', term.id); else throw e; }
    invalidate_('db', tab);
    var rows = readAll_(tab);
    var dup = rows.some(function (r) { return String(r.status) === '유효' && r.student_id === me && String(r.date) === v.rec.date && r.facility === v.rec.facility && hmNorm_(r.start) === v.rec.start && hmNorm_(r.end) === v.rec.end; });
    if (dup) return { ok: false, errors: [{ field: 'start', message: '같은 시설·같은 시간의 일지를 이미 썼습니다.' }] };
    var over = facOverlaps_(rows, v.rec);
    if (over.length && !input.confirmOverlap) {
      return { ok: false, needsConfirm: true, errors: [{ field: 'end', message: '같은 시간에 이미 쓴 기록이 있습니다(' + v.rec.facility + ' ' + over[0].start + '–' + over[0].end + '). 시간을 바꿔 주세요.' }],
        warnings: ['같은 시간에 이미 쓴 기록이 있습니다(' + v.rec.facility + ' ' + over[0].start + '–' + over[0].end + ').'] };
    }
    var rec = appendRecord_(tab, { term_id: term.id, student_id: me, facility: v.rec.facility, date: v.rec.date, start: v.rec.start, end: v.rec.end,
      companions: v.rec.companions.join(','), purpose: v.rec.purpose, status: '유효', cancel_reason: '' }, user.email);
    return { ok: true, id: rec.id, termId: term.id, overlapped: over.length > 0 };
  });
}

/** 내 일지 취소(학생 본인, 사유 없이 확인만 — 총괄 결정). 행은 남고 status '취소' + cancel_reason '본인 취소', audit_log update. */
function cancelFacilityLog(termId, id) {
  var user = requirePermission_('facility.write', { studentId: portalWho_().studentId });
  var me = portalWho_().studentId;
  return withLock_(function () {
    invalidate_('db', 'terms');
    var term = readAll_('terms').filter(function (t) { return t.id === String(termId || ''); })[0];
    if (!term) return { ok: false, error: '운영 기간을 찾지 못했습니다. 새로 불러와 주세요.' };
    var tab = termSheetName_('facility_logs', term.id);
    invalidate_('db', tab);
    var row = facRows_(term).filter(function (r) { return r.id === String(id || ''); })[0];
    if (!row) return { ok: false, stale: true, error: '기록을 찾지 못했습니다. 새로 불러와 주세요.' };
    if (row.student_id !== me) facDenied_(user, 'facility.write', '남의 일지 취소 시도');   // 남의 일지는 거부(기록 남김)
    if (String(row.status).trim() !== '유효') return { ok: false, stale: true, error: '이미 취소된 일지입니다.' };
    updateRecord_(tab, row.id, { status: '취소', cancel_reason: FAC_SELF_CANCEL }, user.email);
    return { ok: true };
  });
}

/**
 * 함께 쓴 학생 찾기(학생 본인). query = 이름 일부 또는 초성, date = 일지 날짜(없으면 오늘). 그날 학사 입실 중인 그 기간 학사생(본인 제외) 중 최대 8명.
 * → {ok, results:[{handle, name}], more}  이름과 불투명 표식뿐이다(학년·반·번호·학번·id·이메일 없음).
 */
function searchFacilityStudents(query, date) {
  var user = requirePermission_('facility.write', { studentId: portalWho_().studentId });
  var me = portalWho_().studentId, today = today_();
  var d = String(date || '').trim() || today;
  var q = String(query || '').trim().slice(0, 20);
  if (!ymdIsValid_(d) || d > today || d < ymdAddDays_(today, -FAC_PAST_DAYS) || !q.replace(/\s+/g, '')) return { ok: true, results: [], more: 0 };
  var term = termOnDate_(d, readAll_('terms'));
  if (!term) return { ok: true, results: [], more: 0 };
  var eligible = facEligible_(term, d, readAll_('enrollments'), readAll_('status_changes'));
  var hits = [];
  readAll_('students').forEach(function (s) {
    if (s.id !== me && eligible[s.id] && facNameMatch_(q, s.name)) hits.push(s);
  });
  hits.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  return { ok: true, results: hits.slice(0, 8).map(function (s) { return { handle: facHandle_(s.id), name: s.name }; }), more: Math.max(0, hits.length - 8) };
}

/* ───────────── 근무교사·관리자: 그날 일지 ───────────── */

/**
 * 그날 일지(시설별). 관리자는 어느 날이든, 학사 교사는 그날 실제 근무자만(오늘 일지). date를 비우면 오늘.
 */
function getFacilityDay(date) {
  var user = requirePermission_('facility.view');
  var today = today_(), d = String(date || '').trim() || today;
  if (!ymdIsValid_(d)) return { ok: false, error: '날짜를 골라 주세요.' };
  var isAdmin = hasRole_(user, 'admin');
  if (!isAdmin) {
    // dutyWindow 0: 그날(오늘)의 실제 근무자만
    if (d !== today || !isOnDutyFor_(user.email, d, permissions_()['facility.view'].dutyWindow)) {
      logDenied_(user.email, 'facility.view', '근무교사 아님 ' + d);
      return { ok: false, error: '시설 일지는 그날 근무 선생님만 볼 수 있습니다.' };
    }
  }
  var term = termOnDate_(d, readAll_('terms'));
  var out = { ok: true, date: d, weekdayKo: ymdWeekdayKo_(d), isAdmin: isAdmin, today: today, names: facNames_(readAll_('settings', 'config')), facilities: [] };
  if (!term) return out;
  var byId = {};
  readAll_('students').forEach(function (s) { byId[s.id] = s; });
  var items = facRows_(term).filter(function (r) { return String(r.date) === d; });
  var by = {};
  items.forEach(function (r) {
    var f = by[r.facility] = by[r.facility] || [];
    f.push({ id: r.id, start: hmNorm_(r.start) || r.start, end: hmNorm_(r.end) || r.end, status: r.status, purpose: r.purpose || '',
      student: byId[r.student_id] ? facStaffOne_(byId[r.student_id]) : null,
      companions: facSplitIds_(r.companions).map(function (id) { return byId[id] ? facStaffOne_(byId[id]) : null; }).filter(function (x) { return x; }) });
  });
  var order = out.names.slice();
  Object.keys(by).forEach(function (f) { if (order.indexOf(f) < 0) order.push(f); });   // 설정에서 지워진 시설의 옛 기록도 보인다
  order.forEach(function (f) {
    if (!by[f]) return;
    by[f].sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    out.facilities.push({ facility: f, items: by[f] });
  });
  return out;
}

/* ───────────── 관리자: 학생 × 날짜 누적 ───────────── */

/**
 * 누적표. filter = {from, to, facility(선택)}. 기간이 여러 운영 기간에 걸치면 걸친 기간 탭을 모두 읽는다. 최대 62일.
 * → {ok, from, to, dates:[{date, weekdayKo}], students:[{id, name, grade, classNo, number, days:{date:분}, total, count}], totalMinutes}
 */
function getFacilityReport(filter) {
  var user = requirePermission_('facility.report');
  filter = filter || {};
  var from = String(filter.from || '').trim(), to = String(filter.to || '').trim() || from;
  if (!ymdIsValid_(from) || !ymdIsValid_(to)) return { ok: false, error: '날짜를 골라 주세요.' };
  if (to < from) return { ok: false, error: '끝 날짜가 시작 날짜보다 앞입니다.' };
  if (ymdDiffDays_(from, to) + 1 > FAC_REPORT_MAX_DAYS) return { ok: false, error: '한 번에 ' + FAC_REPORT_MAX_DAYS + '일까지 볼 수 있습니다.' };
  var wantFacility = String(filter.facility || '').trim();
  var logs = [];
  readAll_('terms').forEach(function (t) {
    if (!t.start_date || !t.end_date || t.end_date < from || t.start_date > to) return;
    facRows_(t).forEach(function (r) { if (!wantFacility || r.facility === wantFacility) logs.push(r); });
  });
  var rep = facReport_(logs, from, to);
  var byId = {};
  readAll_('students').forEach(function (s) { byId[s.id] = s; });
  var students = Object.keys(rep.byStudent).filter(function (id) { return byId[id]; }).map(function (id) {
    var b = rep.byStudent[id], s = facStaffOne_(byId[id]);
    s.days = b.days; s.total = b.total; s.count = b.count;
    return s;
  }).sort(function (a, b) { return (a.grade - b.grade) || (+a.classNo - +b.classNo) || (+a.number - +b.number) || String(a.name).localeCompare(String(b.name)); });
  var dates = ymdRange_(from, to, FAC_REPORT_MAX_DAYS).map(function (d) { return { date: d, weekdayKo: ymdWeekdayKo_(d) }; });
  var total = 0;
  students.forEach(function (s) { total += s.total; });
  return { ok: true, from: from, to: to, facility: wantFacility, names: facNames_(readAll_('settings', 'config')), dates: dates, students: students, totalMinutes: total };
}

/* ───────────── 홈 카드(근무교사·관리자) ───────────── */

/**
 * 홈 훅: 관리자는 오늘 일지 수와 링크, 학사 교사는 오늘 근무일 때만 오늘 일지 수(근무가 아니면 onDuty false = 카드 없음).
 * 내용은 건수뿐(이름 없음).
 */
function facHomeInfo_(user, role) {
  var today = today_();
  var isAdmin = role === 'admin' && hasRole_(user, 'admin');
  var onDuty = isAdmin || isOnDutyFor_(user.email, today, permissions_()['facility.view'].dutyWindow);
  var out = { isAdmin: isAdmin, onDuty: onDuty, count: 0 };
  if (!onDuty) return out;
  var term = termOnDate_(today, readAll_('terms'));
  if (term) out.count = facRows_(term).filter(function (r) { return String(r.date) === today && String(r.status) === '유효'; }).length;
  return out;
}
