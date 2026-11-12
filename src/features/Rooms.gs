/**
 * F8 기숙사 방 배정(C23, 결정 24·64, 접두어 room). docs/plan/stage3.md.
 * 규칙(초안·위반·정원 현황)은 src/rules/RoomRules.gs(R15)가 정한다. 여기는 읽기·권한·저장만 한다.
 *
 * 흐름: 초안(previewRoomDraft) → 맞바꾸기·옮기기(화면이 고친 목록을 previewRoomPlan으로 다시 계산) → 저장(saveRoomAssignments).
 * 저장은 락 안에서 다시 읽고 다시 검사한다(화면 값을 믿지 않는다). expect(token) = 화면이 본 지금 배정의 표시: 달라졌으면 거부.
 * - 정원 초과·성별 불일치는 저장을 막는다(stage3.md C23). 같은 학년·떨어뜨릴 짝 위반은 표시만 하고 저장은 된다.
 * - 짝 정보(어느 학생이 짝인지, 짝 위반 줄)는 avoid.view가 있는 사람에게만 보낸다(결정 64). room.view만 있는 사람(출결·근무표 담당)은
 *   학생 이름·위반 줄 없이 숫자(정원 현황판)만 받는다.
 * - 기숙사생 = 그날 기숙사 '입실'인 이번 기간 등록생. 기숙사 퇴실 적용일부터 그 학생의 방 자리는 공석으로 센다(배정 행은 지우지 않는다).
 * - 배정은 학기마다 한 벌. 기록은 지우지 않는다. 저장은 좌석 초안(C22)과 같은 방식이다: 기준일 D(오늘이 기간 안이면 오늘)부터 바뀌므로
 *   바뀐 학생의 옛 행은 valid_to = D - 1로 끝내고(지난 날짜의 현황은 그때 배정 그대로), D 이후에야 효력이 생기는 행(valid_from, 없으면 기간 시작일이 D 이상)은
 *   지난 기록이 없으므로 status '취소'로 둔다. 새 행은 valid_from = D(D가 기간 시작일 이하이면 빈칸 = 기간 전체), status '배정'.
 * ASSUMPTION: 방 성별과 학생 성별이 다른 배정도 정원 초과처럼 저장을 막는다(층마다 성별 고정, 결정 64 ②).
 * ASSUMPTION: 저장은 바뀐 학생의 배정만 끝내고 새로 쓴다(같은 방에 그대로인 배정 행은 건드리지 않는다). 결과 상태는 전체를 끝내고 새로 쓰는 것과 같다.
 */

var ROOM_BLOCKING = ['정원 초과', '성별'];

function roomFresh_() {
  ['rooms', 'room_assignments', 'enrollments', 'students', 'status_changes', 'avoid_pairs', 'terms'].forEach(function (n) { invalidate_('db', n); });
}

function roomCan_(user, action) { return hasAnyAllowedRole_(user.roles, permissions_()[action].roles); }

/** 한 기간의 방 배정에 필요한 시트를 한 번씩 읽는다. 기준일 ymd = 오늘이 기간 안이면 오늘, 아니면 가까운 끝 */
function roomLoad_(termId) {
  var terms = readAll_('terms');
  var term = String(termId || '') ? terms.filter(function (t) { return t.id === String(termId); })[0] : getCurrentTerm_();
  if (!term) throw new Error('운영 기간을 골라 주세요.');
  var today = today_();
  var ymd = today < term.start_date ? term.start_date : (today > term.end_date ? term.end_date : today);
  var enrolled = {};
  readAll_('enrollments').forEach(function (e) { if (e.term_id === term.id) enrolled[e.student_id] = true; });
  var members = readAll_('students').filter(function (s) { return enrolled[s.id]; });
  var changes = readAll_('status_changes');
  var dorm = members.filter(function (s) { return statusOn_(changes, s.id, '기숙사', ymd) === '입실'; });
  var byId = {};
  members.forEach(function (s) { byId[s.id] = s; });
  var live = roomLiveRows_(readAll_('room_assignments'), term.id, ymd);
  return { term: term, today: today, ymd: ymd, rooms: readAll_('rooms'), members: members, dorm: dorm, byId: byId, changes: changes,
    avoids: readAll_('avoid_pairs'), live: live };
}

/** 그 기간의 취소되지 않은 배정 행 중 기준일 전에 끝나지 않은 것(지난 기록은 다른 배정을 막지 않는다) */
function roomLiveRows_(rows, termId, ymd) {
  return rows.filter(function (a) { return a.term_id === termId && String(a.status || '').trim() !== '취소' && !(a.valid_to && a.valid_to < ymd); });
}

/** 기준일 D부터 이 행의 배정을 끝내는 쓰기(좌석 seatEndOp_와 같다): 지난 기록이 없는 행(D 이후에야 시작)은 취소, 아니면 valid_to = D - 1 */
function roomEndPatch_(row, ymd, termStart) {
  var from = row.valid_from || termStart || '';
  return from && from >= ymd ? { status: '취소', memo: '재배정' } : { valid_to: ymdAddDays_(ymd, -1) };
}

function roomDisplay_(s) { return (Number(s.grade) || s.grade) + '. ' + s.name; }

/** 지금 효력이 있는 배정(그날 기숙사생인 학생의 살아 있는 행, 기간을 좁힌 행은 그날 안일 때만): [{room_id, student_id}] */
function roomCurrent_(d) {
  var dormIds = {};
  d.dorm.forEach(function (s) { dormIds[s.id] = true; });
  return d.live.filter(function (a) {
    return dormIds[a.student_id] && (!a.valid_from || a.valid_from <= d.ymd) && (!a.valid_to || a.valid_to >= d.ymd);
  }).map(function (a) { return { room_id: a.room_id, student_id: a.student_id }; });
}

/** 화면이 본 지금 배정의 표시(저장 때 비교). 살아 있는 모든 행 기준 */
function roomToken_(live) {
  var keys = live.map(function (a) { return a.room_id + '|' + a.student_id + '|' + (a.valid_from || '') + '|' + (a.valid_to || ''); }).sort();
  var h = 5381, s = keys.join(';');
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return keys.length + ':' + (h >>> 0).toString(36);
}

/** 받은 목록 정리 + 입력 검사. → {pairs, errors}. 모르는 방·기숙사생이 아닌 학생·같은 학생 두 번은 오류 */
function roomNormalize_(d, assignments) {
  var errors = [], pairs = [], seen = {};
  var rooms = {};
  roomList_(d.rooms).forEach(function (r) { rooms[r.id] = r; });
  var dormIds = {};
  d.dorm.forEach(function (s) { dormIds[s.id] = true; });
  if (!Array.isArray(assignments)) return { pairs: [], errors: [{ field: '', message: '배정 목록이 올바르지 않습니다.' }] };
  assignments.forEach(function (a) {
    var rid = String((a && a.room_id) || ''), sid = String((a && a.student_id) || '');
    if (!rooms[rid]) { errors.push({ field: '', message: '없는 방이 있습니다.' }); return; }
    if (!dormIds[sid]) { errors.push({ field: '', message: '기숙사 입실 상태가 아닌 학생은 방에 배정할 수 없습니다.' }); return; }
    if (seen[sid]) { errors.push({ field: '', message: '같은 학생이 두 방에 있습니다.' }); return; }
    seen[sid] = true;
    pairs.push({ room_id: rid, student_id: sid });
  });
  return { pairs: pairs, errors: errors.filter(function (e, i, all) { return all.map(function (x) { return x.message; }).indexOf(e.message) === i; }) };
}

/**
 * 한 배정 목록의 화면용 모양: 방 카드(학생), 위반 줄(문구·막는지), 정원 현황, 방 없는 기숙사생.
 * opts = {names: 학생 이름을 줄지, avoid: 짝 위반(과 짝 학생)을 줄지}. avoid가 아니면 짝 목록을 규칙에 넣지 않아 짝 위반 줄이 아예 없다.
 */
function roomView_(d, pairs, opts) {
  var list = roomList_(d.rooms);
  var students = d.dorm.map(function (s) { return { id: s.id, gender: s.gender, grade: s.grade }; });
  var avoids = opts.avoid ? d.avoids : [];
  var viol = roomViolations_(d.rooms, students, pairs, avoids);
  var board = roomBoard_(d.rooms, students, pairs);
  var inRoom = {}, placed = {};
  list.forEach(function (r) { inRoom[r.id] = []; });
  pairs.forEach(function (a) { if (inRoom[a.room_id]) { inRoom[a.room_id].push(a.student_id); placed[a.student_id] = true; } });
  var nameOf = function (id) { return d.byId[id] ? roomDisplay_(d.byId[id]) : '(알 수 없음)'; };
  var avoidMap = opts.avoid ? seatAvoidMap_(d.avoids, ['방', '둘 다']) : {};
  var roomOf = {};
  list.forEach(function (r) { roomOf[r.id] = r; });
  // 떨어뜨릴 짝 위반의 짝 학생(규칙이 방마다 정렬한 차례로 한 줄씩 준다)
  var pairsIn = {};
  list.forEach(function (r) {
    var ps = inRoom[r.id].slice().sort(), out = [];
    ps.forEach(function (p, i) { ps.slice(i + 1).forEach(function (q) { if (avoidMap[p] && avoidMap[p][q]) out.push([p, q]); }); });
    pairsIn[r.id] = out;
  });
  var used = {};
  var violations = viol.map(function (v) {
    var r = roomOf[v.roomId], label = r.floor + '층 ' + r.room_no + '호', o = { roomId: v.roomId, kind: v.kind, studentId: v.studentId, blocking: ROOM_BLOCKING.indexOf(v.kind) >= 0, text: '' };
    if (v.kind === '정원 초과') o.text = label + ' · 정원 초과 (' + inRoom[v.roomId].length + '/' + r.capacity + ')';
    else if (v.kind === '성별') o.text = label + ' · 성별이 다릅니다' + (opts.names ? ' (' + nameOf(v.studentId) + ')' : '');
    else if (v.kind === '같은 학년') o.text = label + ' · 같은 학년만 있는 방';
    else {
      var k = used[v.roomId] || 0; used[v.roomId] = k + 1;
      var pr = pairsIn[v.roomId][k] || [];
      o.studentIds = pr;
      o.text = label + ' · 떨어뜨릴 짝' + (opts.names && pr.length ? ' (' + pr.map(nameOf).join(' · ') + ')' : '');
    }
    return o;
  });
  var badIds = {};
  violations.forEach(function (v) { (v.studentIds || []).forEach(function (id) { badIds[id] = true; }); if (v.kind === '성별' && v.studentId) badIds[v.studentId] = true; });
  var rooms = list.map(function (r) {
    return { id: r.id, floor: Number(r.floor) || r.floor, roomNo: r.room_no, gender: r.gender, capacity: r.capacity, count: inRoom[r.id].length,
      members: opts.names ? inRoom[r.id].slice().sort().map(function (id) {
        var s = d.byId[id] || {};
        return { id: id, name: s.name || '', grade: Number(s.grade) || s.grade, display: nameOf(id), bad: !!badIds[id] };
      }) : [] };
  });
  var unassigned = !opts.names ? [] : d.dorm.filter(function (s) { return !placed[s.id]; }).sort(function (a, b) {
    return (Number(a.grade) - Number(b.grade)) || (a.name < b.name ? -1 : 1);
  }).map(function (s) { return { id: s.id, display: roomDisplay_(s), gender: s.gender, grade: Number(s.grade) || s.grade }; });
  return { rooms: rooms, violations: violations, board: board, unassigned: unassigned, unassignedCount: d.dorm.filter(function (s) { return !placed[s.id]; }).length };
}

function roomTermOut_(d) { return { id: d.term.id, name: d.term.name, start: d.term.start_date, end: d.term.end_date, ymd: d.ymd }; }

/** 학생 없는 가벼운 현황판 모양(홈·현황판·출결/근무표 담당자용) */
function roomBoardOut_(board) {
  var tot = function (g) { return board.total[g] || { capacity: 0, count: 0, vacant: 0, byGrade: {} }; };
  return { floors: board.floors, male: tot('남'), female: tot('여') };
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 방 배정 화면 전체. room.view 모두 부를 수 있지만 학생 이름·위반 줄·방 없는 학생은 방을 고칠 수 있는 사람(room.edit)에게만 보낸다.
 * 짝 위반 줄은 그중에서도 avoid.view가 있는 사람에게만. token = 지금 배정의 표시(저장 때 expect).
 */
function getRoomData(termId) {
  var user = requirePermission_('room.view');
  roomFresh_();
  var d = roomLoad_(termId);
  var canEdit = roomCan_(user, 'room.edit') && d.today <= d.term.end_date;
  var detail = roomCan_(user, 'room.edit');
  var v = roomView_(d, roomCurrent_(d), { names: detail, avoid: roomCan_(user, 'avoid.view') });
  return { term: roomTermOut_(d), canEdit: canEdit, detail: detail, token: roomToken_(d.live), rooms: v.rooms, violations: detail ? v.violations : [],
    unassigned: v.unassigned, unassignedCount: v.unassignedCount, board: roomBoardOut_(v.board), dormCount: d.dorm.length };
}

/** 정원 현황판(층·성별·학년): 숫자만. room.view 모두. */
function getRoomStats(termId) {
  var user = requirePermission_('room.view');
  roomFresh_();
  var d = roomLoad_(termId);
  var v = roomView_(d, roomCurrent_(d), { names: false, avoid: false });
  return { term: roomTermOut_(d), canEdit: roomCan_(user, 'room.edit'), floors: v.board.floors, male: roomBoardOut_(v.board).male, female: roomBoardOut_(v.board).female,
    dormCount: d.dorm.length, unassignedCount: v.unassignedCount };
}

/** 같은 입력은 같은 결과. 입력 seed(정수)가 없으면 현재 시각에서 만든다 */
function roomSeedOf_(seed) {
  var n = Number(seed);
  if (isFinite(n) && n >= 0) return Math.floor(n) % 2147483647;
  var s = nowIso_(), h = 7;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647;
  return h;
}

/** 방 초안 미리보기(저장하지 않는다). → {ok, assignments, changed, violations, board, unplaced, warnings, seed} */
function previewRoomDraft(termId, seed) {
  var user = requirePermission_('room.edit');
  roomFresh_();
  var d = roomLoad_(termId);
  if (d.today > d.term.end_date) return { ok: false, errors: [{ field: '', message: '끝난 기간의 방 배정은 바꿀 수 없습니다.' }] };
  var sd = roomSeedOf_(seed);
  var draft = roomDraft_(d.rooms, d.dorm.map(function (s) { return { id: s.id, gender: s.gender, grade: s.grade }; }), d.changes, d.avoids, d.ymd, sd);
  var cur = {};
  roomCurrent_(d).forEach(function (a) { cur[a.student_id] = a.room_id; });
  var changed = draft.assignments.filter(function (a) { return cur[a.student_id] !== a.room_id; }).length;
  var v = roomView_(d, draft.assignments, { names: true, avoid: roomCan_(user, 'avoid.view') });
  var nameOf = function (id) { return d.byId[id] ? roomDisplay_(d.byId[id]) : id; };
  return { ok: true, seed: sd, assignments: draft.assignments, changed: changed, rooms: v.rooms, violations: v.violations, board: roomBoardOut_(v.board), unassigned: v.unassigned,
    unplaced: draft.unplaced.map(nameOf), warnings: draft.warnings.map(function (w) { return draft.unplaced.reduce(function (t, id) { return t.split(id).join(nameOf(id)); }, w); }) };
}

/** 고친 배정(맞바꾸기·옮기기 뒤)을 다시 계산한다(저장하지 않는다). 정원 초과·성별은 blocking 위반으로 나온다. */
function previewRoomPlan(termId, assignments) {
  var user = requirePermission_('room.edit');
  roomFresh_();
  var d = roomLoad_(termId);
  var n = roomNormalize_(d, assignments);
  if (n.errors.length) return { ok: false, errors: n.errors };
  var v = roomView_(d, n.pairs, { names: true, avoid: roomCan_(user, 'avoid.view') });
  var cur = {};
  roomCurrent_(d).forEach(function (a) { cur[a.student_id] = a.room_id; });
  return { ok: true, rooms: v.rooms, violations: v.violations, board: roomBoardOut_(v.board), unassigned: v.unassigned,
    changed: n.pairs.filter(function (a) { return cur[a.student_id] !== a.room_id; }).length, blocked: v.violations.some(function (x) { return x.blocking; }) };
}

/**
 * 방 배정 저장. 첫 줄 권한(room.edit) → 락 안에서 다시 읽고 다시 검사 → expect(token)와 지금 배정이 다르면 {stale} → 정원 초과·성별은 거부 →
 * 바뀐 배정만 기준일 전날로 끝내고(또는 취소) 새로 쓴다(한 번의 갱신 + 한 번의 추가). 바뀐 것이 없으면 {ok:true, unchanged:true}(두 번 눌러도 한 벌).
 */
function saveRoomAssignments(termId, assignments, expect) {
  var user = requirePermission_('room.edit');
  return withLock_(function () {
    roomFresh_();
    var d = roomLoad_(termId);
    if (d.today > d.term.end_date) return { ok: false, errors: [{ field: '', message: '끝난 기간의 방 배정은 바꿀 수 없습니다.' }] };
    var n = roomNormalize_(d, assignments);
    if (n.errors.length) return { ok: false, errors: n.errors };
    var key = function (a) { return a.room_id + '|' + a.student_id; };
    var want = {};
    n.pairs.forEach(function (a) { want[key(a)] = a; });
    var have = {};
    d.live.forEach(function (a) { have[key(a)] = a; });
    var ended = d.live.filter(function (a) { return !want[key(a)]; });
    var creates = n.pairs.filter(function (a) { return !have[key(a)]; });
    if (!ended.length && !creates.length) return { ok: true, unchanged: true, token: roomToken_(d.live) };
    if (String(expect || '') !== roomToken_(d.live)) return { ok: false, stale: true, error: '확인한 뒤 방 배정이 바뀌었습니다. 다시 불러와 주세요.' };
    var v = roomView_(d, n.pairs, { names: false, avoid: roomCan_(user, 'avoid.view') });
    var blocking = v.violations.filter(function (x) { return x.blocking; });
    if (blocking.length) return { ok: false, errors: blocking.map(function (x) { return { field: '', message: x.text }; }) };
    var from = d.ymd <= d.term.start_date ? '' : d.ymd;   // 기준일이 기간 시작일 이하면 기간 전체(나중에 시작일을 앞당겨도 잠기지 않는다)
    var patches = ended.map(function (a) { return { id: a.id, patch: roomEndPatch_(a, d.ymd, d.term.start_date) }; });
    bulkUpdateRecords_('room_assignments', patches, user.email);   // 수정을 먼저 쓰고 추가를 나중에 써서, 중간에 멈춰도 한 학생이 두 방에 있지는 않다
    bulkAppend_('room_assignments', creates.map(function (a) {
      return { term_id: d.term.id, room_id: a.room_id, student_id: a.student_id, valid_from: from, valid_to: '', status: '배정', memo: '' };
    }), user.email);
    roomFresh_();
    var after = roomLiveRows_(readAll_('room_assignments'), d.term.id, d.ymd);
    return { ok: true, cancelCount: patches.filter(function (x) { return x.patch.status === '취소'; }).length, endedCount: patches.filter(function (x) { return x.patch.valid_to; }).length,
      createCount: creates.length, violationCount: v.violations.length, token: roomToken_(after) };
  });
}

/** 관리자·학사 교사 홈 카드: 기숙사 빈 자리(남·여). 방 구성이 없거나 기간이 없으면 null. 학생 이름은 없다. */
function roomHomeInfo_() {
  try {
    roomFresh_();
    var d = roomLoad_('');
    if (!roomList_(d.rooms).length) return null;
    var v = roomView_(d, roomCurrent_(d), { names: false, avoid: false });
    var b = roomBoardOut_(v.board);
    return { termName: d.term.name, male: { capacity: b.male.capacity, count: b.male.count, vacant: b.male.vacant }, female: { capacity: b.female.capacity, count: b.female.count, vacant: b.female.vacant },
      dormCount: d.dorm.length, unassignedCount: v.unassignedCount };
  } catch (e) {
    return null;   // 홈의 다른 카드가 이 때문에 멈추지 않게
  }
}
