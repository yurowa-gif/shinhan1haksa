/**
 * C22 좌석 초안 만들기(F5, 접두어 sdr). 규칙은 SeatRules(R14)의 seatDraft_·seatViolations_가 정하고, 여기서는
 * 읽기(등록·상태·지난 기간·짝) → 미리보기 → 저장(기존 배정을 끝내고 새로 쓰기, 한 락)만 한다.
 * - previewSeatDraft: 아무것도 쓰지 않는다. 같은 입력 + 같은 seed = 같은 결과라서, 저장 때 서버가 다시 계산해 미리보기와 같은지(sig) 확인한다.
 * - saveSeatDraft: 락 안에서 다시 계산 → 미리보기와 다르면(명단·짝이 그 사이 바뀜) 거부 → 이미 같은 배정이면 noop(두 번 눌러도 한 벌)
 *   → 미리보기 뒤 다른 선생님이 좌석을 바꿨으면(base) 거부 → 쓰기.
 * - 지난 날짜 좌석표를 지키려고 seat_assignments의 옛 행은 지우거나 취소로 덮지 않고, 기준일부터 끝낸다(Seats.gs의 seatEndOp_: 기준일 이후에야
 *   효력이 생기는 행만 취소, 나머지는 valid_to = 기준일 - 1). 새 행은 기준일부터(기간 시작일 이하면 기간 전체). 그대로인 자리(같은 좌석·같은 학생)는 건드리지 않는다.
 * - 떨어뜨릴 짝(결정 64): 응답의 '떨어뜨릴 짝' 위반은 avoid.view가 있는 사람(관리자·학사 교사)에게만 준다. 없는 사람에게는 항목째 뺀다(이름만 가리면
 *   자리표로 짝을 알아낼 수 있다). avoid.view가 없으면 짝 시트는 읽지도 않는다.
 */
var SDR_MAX_FIXED = 400;

function sdrErr_(message, extra) {
  var r = { ok: false, error: message };
  Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
  return r;
}

/** 짧은 문자열 해시(djb2 변형) — 미리보기 서명용. 보안이 아니라 '같은가' 확인용 */
function sdrHash_(text) {
  var h = 5381, i;
  text = String(text);
  for (i = 0; i < text.length; i++) h = (Math.imul(h, 33) + text.charCodeAt(i)) | 0;
  var h2 = 52711;
  for (i = text.length - 1; i >= 0; i--) h2 = (Math.imul(h2, 31) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

function sdrCanAvoid_(user) { return hasAnyAllowedRole_(user.roles, permissions_()['avoid.view'].roles); }

/** 떨어뜨릴 짝 행. 탭이 없거나 못 읽으면 빈 목록(좌석 화면은 짝 없이도 돌아야 한다) */
function sdrAvoids_() {
  try { invalidate_('db', 'avoid_pairs'); return readAll_('avoid_pairs'); } catch (e) {
    if (!/탭이 없습니다/.test(String(e && e.message))) console.warn('떨어뜨릴 짝을 읽지 못함: ' + e.message);
    return [];
  }
}

/** 그날 학사 입실인 이번 기간 등록 학생 → [{id, gender, grade, veritas}] (초안·위반 입력) */
function sdrStudents_(d, term, ymd) {
  var byId = {}, out = [], seen = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  d.enrollments.forEach(function (e) {
    if (e.term_id !== term.id || seen[e.student_id] || !byId[e.student_id]) return;
    seen[e.student_id] = true;
    if (!isActiveOn_(d.changes, e, ymd)) return;
    var s = byId[e.student_id];
    out.push({ id: s.id, gender: s.gender, grade: s.grade, veritas: isTruthy_(e.veritas) });
  });
  return out;
}

/** 지난 기간 마지막 날의 배정 → [{seat_id, student_id}] 학생마다 한 줄. 배정이 있는 가장 가까운 지난 기간을 쓴다 */
function sdrPrev_(d, term) {
  if (!term.start_date) return [];
  var older = d.terms.filter(function (t) { return t.id !== term.id && t.end_date && t.end_date < term.start_date; })
    .sort(function (a, b) { return a.end_date < b.end_date ? 1 : (a.end_date > b.end_date ? -1 : 0); });
  for (var i = 0; i < older.length; i++) {
    var end = older[i].end_date;
    var rows = seatLiveAssignments_(d.assignments, older[i].id).filter(function (a) { return !seatEnded_(a, end) && !(a.valid_from && a.valid_from > end); });
    if (!rows.length) continue;
    var byStudent = {};
    rows.forEach(function (a) { byStudent[a.student_id] = a; });   // 같은 학생이 둘이면 시트에서 아래 행
    return Object.keys(byStudent).sort().map(function (sid) { return { seat_id: byStudent[sid].seat_id, student_id: sid }; });
  }
  return [];
}

function sdrSeedOk_(seed) { return typeof seed === 'number' && seed === Math.floor(seed) && seed >= 1 && seed <= 2147483647; }

/** 읽기 묶음: 기간·기준일·학생·지난 배정·짝·지금 배정 */
function sdrContext_(termId) {
  seatFresh_();
  var d = seatLoad_();
  var term = seatFindTerm_(d.terms, String(termId || '') || (getCurrentTerm_() || {}).id);
  var today = today_();
  if (seatTermEnded_(term, today)) return { error: '끝난 운영 기간의 좌석표는 바꿀 수 없습니다.' };
  var ymd = seatBaseYmd_(term, today);
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, ymd);
  var liveActive = seatLiveAssignments_(d.assignments, term.id).filter(function (a) { return !seatEnded_(a, ymd); });
  var students = sdrStudents_(d, term, ymd);
  var byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  return { d: d, term: term, ymd: ymd, map: map, liveActive: liveActive, students: students, byId: byId,
    prev: sdrPrev_(d, term), avoids: sdrAvoids_(),
    bounded: liveActive.some(function (a) { return a.valid_to || (a.valid_from && a.valid_from > ymd); }) };
}

/** 지금 앉은 학생 → {seatId: studentId} (퇴실·미입실 자리는 공석) */
function sdrCurrent_(c) {
  var cur = {};
  Object.keys(c.map.bySeat).forEach(function (sid) { if (c.map.bySeat[sid].studentId) cur[sid] = c.map.bySeat[sid].studentId; });
  return cur;
}

/** 고정 자리 입력 검사 → {ok, fixed:[{seat_id, student_id}]} (화면은 seatId·studentId로 보낸다) */
function sdrFixedIn_(c, list) {
  if (list === undefined || list === null) return { ok: true, fixed: [] };
  if (!Array.isArray(list) || list.length > SDR_MAX_FIXED) return { ok: false, error: '고정할 자리 목록이 올바르지 않습니다.' };
  var cur = sdrCurrent_(c), out = [], seenSeat = {}, seenStu = {};
  for (var i = 0; i < list.length; i++) {
    var f = list[i], sid = f && typeof f.seatId === 'string' ? f.seatId : '', pid = f && typeof f.studentId === 'string' ? f.studentId : '';
    if (!sid || !pid) return { ok: false, error: '고정할 자리 목록이 올바르지 않습니다.' };
    if (seenSeat[sid] || seenStu[pid]) continue;
    seenSeat[sid] = true; seenStu[pid] = true;
    out.push({ seat_id: sid, student_id: pid });
  }
  return { ok: true, fixed: out };
}

function sdrAssignKey_(assignments) {
  return assignments.map(function (a) { return a.seat_id + '|' + a.student_id; }).sort().join('\n');
}

function sdrBaseKey_(c) {
  return c.liveActive.map(function (a) { return [a.id, a.seat_id, a.student_id, a.valid_from || '', a.valid_to || '', a.updated_at || ''].join('|'); }).sort().join('\n');
}

/** 지금 앉은 배정의 규칙 위반(빨간 칸) → {violations, bad:{seatId:true}}. 짝 위반은 avoid.view가 있을 때만 계산·포함한다(짝 시트를 읽지도 않는다) */
function sdrCurrentViolations_(d, term, ymd, map, canAvoid) {
  var byId = {}, holder = {}, assignments = [];
  d.students.forEach(function (s) { byId[s.id] = s; });
  Object.keys(map.bySeat).forEach(function (sid) {
    var st = map.bySeat[sid].studentId;
    if (st) { holder[sid] = st; assignments.push({ seat_id: sid, student_id: st }); }
  });
  var vios = seatViolations_(d.spaces, d.seats, sdrStudents_(d, term, ymd), assignments, canAvoid ? sdrAvoids_() : []);
  var shown = sdrViolationsOut_({ d: d, byId: byId }, vios, holder, canAvoid), bad = {};
  shown.forEach(function (v) { bad[v.seatId] = true; });
  return { violations: shown, bad: bad };
}

/** 학생 id → '학년. 이름' 으로 바꾼 경고(경고 글에는 학생 id가 들어 있다) */
function sdrWarn_(c, warnings) {
  return warnings.map(function (w) {
    var t = String(w);
    Object.keys(c.byId).forEach(function (id) { if (t.indexOf(id) >= 0) t = t.split(id).join(seatDisplay_(c.byId[id])); });
    return t;
  });
}

/** 위반 → 화면용. 짝 위반은 canAvoid일 때만(아니면 항목째 뺀다). text·withText = 그 칸·상대 칸 학생 */
function sdrViolationsOut_(c, vios, holder, canAvoid) {
  var seatLabel = {};
  c.d.seats.forEach(function (s) { seatLabel[s.id] = s.label || ''; });
  var text = function (sid) { var p = holder[sid]; return p && c.byId[p] ? seatDisplay_(c.byId[p]) : ''; };
  return vios.filter(function (v) { return v.kind !== '떨어뜨릴 짝' || canAvoid; }).map(function (v) {
    return { seatId: v.seatId, kind: v.kind, with: v.with, seatLabel: seatLabel[v.seatId] || '', text: text(v.seatId), withText: v.with ? text(v.with) : '' };
  });
}

/** 공간·칸 모양(미리보기 격자): holder = {seatId: studentId} */
function sdrSpacesView_(c, holder, bad, pinned) {
  return c.d.spaces.slice().sort(function (a, b) { return (+a.sort_order || 0) - (+b.sort_order || 0); }).map(function (sp) {
    var cells = c.d.seats.filter(function (s) { return s.space_id === sp.id; }).map(function (s) {
      var st = holder[s.id] ? c.byId[holder[s.id]] : null;
      return { id: s.id, row: +s.row, col: +s.col, kind: seatKindEn_(s.kind), seatLabel: s.label || '', text: st ? seatDisplay_(st) : '',
        vacant: s.kind === '좌석' && !st, bad: !!bad[s.id], pinned: !!pinned[s.id] };
    });
    return { id: sp.id, name: sp.name, gender: sp.gender, rows: +sp.rows, cols: +sp.cols, sortOrder: +sp.sort_order || 0, cells: cells };
  });
}

/** 초안 계산(미리보기·저장 공통) → {draft, vios(원본), sig, assignments} */
function sdrCompute_(c, fixed, seed) {
  var draft = seatDraft_(c.d.spaces, c.d.seats, c.students, c.prev, fixed, c.avoids, seed);
  return { draft: draft, sig: sdrHash_(seed + '\n' + sdrAssignKey_(draft.assignments)) };
}

/**
 * 초안 미리보기(저장하지 않음). fixedSeatIds = 화면에서 '이 자리 고정'으로 고른 자리(지금 앉은 학생 그대로 둔다), seed = 없으면 새로 뽑는다.
 * → {ok, seed, sig, base, fixed:[{seatId, studentId}], changed, violationCount, violations, warnings, unplaced:[표시], spaces}
 */
function previewSeatDraft(termId, fixedSeatIds, seed) {
  var user = requirePermission_('seat.edit');
  var c = sdrContext_(termId);
  if (c.error) return sdrErr_(c.error);
  if (c.bounded) return sdrErr_('날짜를 좁힌 배정이 있는 기간은 초안을 만들 수 없습니다(방학 날짜별 좌석표).');
  if (seed === undefined || seed === null) seed = Math.floor(Math.random() * 2147483646) + 1;
  if (!sdrSeedOk_(seed)) return sdrErr_('초안 번호가 올바르지 않습니다.');
  var cur = sdrCurrent_(c), pairs = [];
  if (fixedSeatIds !== undefined && fixedSeatIds !== null) {
    if (!Array.isArray(fixedSeatIds) || fixedSeatIds.length > SDR_MAX_FIXED) return sdrErr_('고정할 자리 목록이 올바르지 않습니다.');
    fixedSeatIds.forEach(function (sid) { if (typeof sid === 'string' && cur[sid]) pairs.push({ seatId: sid, studentId: cur[sid] }); });
  }
  var fx = sdrFixedIn_(c, pairs);
  if (!fx.ok) return sdrErr_(fx.error);
  var r = sdrCompute_(c, fx.fixed, seed);
  var holder = {}, canAvoid = sdrCanAvoid_(user);
  r.draft.assignments.forEach(function (a) { holder[a.seat_id] = a.student_id; });
  var vios = r.draft.violations;
  var shown = sdrViolationsOut_(c, vios, holder, canAvoid);
  var bad = {};
  shown.forEach(function (v) { bad[v.seatId] = true; });
  var pinned = {};
  fx.fixed.forEach(function (f) { pinned[f.seat_id] = true; });
  var changed = 0, seats = {};
  Object.keys(cur).forEach(function (sid) { seats[sid] = true; });
  Object.keys(holder).forEach(function (sid) { seats[sid] = true; });
  Object.keys(seats).forEach(function (sid) { if (cur[sid] !== holder[sid]) changed++; });
  return {
    ok: true, seed: seed, sig: r.sig, base: sdrHash_(sdrBaseKey_(c)),
    fixed: fx.fixed.map(function (f) { return { seatId: f.seat_id, studentId: f.student_id }; }),
    changed: changed, violationCount: shown.length, violations: shown, warnings: sdrWarn_(c, r.draft.warnings),
    unplaced: r.draft.unplaced.map(function (id) { return c.byId[id] ? seatDisplay_(c.byId[id]) : ''; }).filter(Boolean),
    spaces: sdrSpacesView_(c, holder, bad, pinned), ymd: c.ymd, termName: c.term.name
  };
}

/**
 * 미리보기를 저장한다. draft = {seed, sig, base, fixed:[{seatId, studentId}]}(미리보기가 준 값 그대로).
 * 락 안에서 다시 계산해 sig가 다르면 거부, 이미 같은 배정이면 noop, base가 다르면(그 사이 다른 선생님이 좌석을 바꿈) 거부, 아니면 쓴다.
 */
function saveSeatDraft(termId, draft) {
  var user = requirePermission_('seat.edit');
  if (!draft || typeof draft !== 'object' || !sdrSeedOk_(draft.seed) || typeof draft.sig !== 'string' || typeof draft.base !== 'string') return sdrErr_('미리보기를 다시 만들어 주세요.', { stale: true });
  return withLock_(function () {
    var c = sdrContext_(termId);
    if (c.error) return sdrErr_(c.error);
    if (c.bounded) return sdrErr_('날짜를 좁힌 배정이 있는 기간은 초안을 만들 수 없습니다(방학 날짜별 좌석표).');
    var fx = sdrFixedIn_(c, draft.fixed);
    if (!fx.ok) return sdrErr_(fx.error);
    var r = sdrCompute_(c, fx.fixed, draft.seed);
    if (r.sig !== draft.sig) return sdrErr_('미리보기 뒤에 명단이나 떨어뜨릴 짝이 바뀌었습니다. 초안을 다시 만들어 주세요.', { stale: true });
    var want = {};
    r.draft.assignments.forEach(function (a) { want[a.seat_id + '|' + a.student_id] = a; });
    var keep = {}, ops = [], same = 0;
    c.liveActive.forEach(function (a) {
      var k = a.seat_id + '|' + a.student_id;
      if (want[k] && !keep[k]) { keep[k] = true; same++; return; }   // 그대로인 자리는 건드리지 않는다
      ops.push(seatEndOp_(a, c.ymd, c.term.start_date));
    });
    var from = seatFrom_(c.ymd, c.term.start_date), created = 0;
    r.draft.assignments.forEach(function (a) {
      if (keep[a.seat_id + '|' + a.student_id]) return;
      ops.push({ op: 'create', row: seatNewRow_(c.term.id, a.seat_id, a.student_id, from) });
      created++;
    });
    if (!ops.length) return { ok: true, noop: true, created: 0, ended: 0 };   // 이미 이 배정(두 번 눌렀거나 그대로)
    if (sdrHash_(sdrBaseKey_(c)) !== draft.base) return sdrErr_(SEAT_STALE_MSG, { stale: true });
    seatApplyOps_('seat_assignments', ops, user.email);
    return { ok: true, noop: false, created: created, ended: ops.length - created, kept: same };
  });
}
