/**
 * F5 좌석 격자·수동 배치(C6). PRD 3.5·F5, docs/plan/stage1.md C6.
 *
 * - 공간(spaces)·좌석 칸(seats): 격자 편집은 관리자만(seat.layout). 칸을 좌석·기둥·비상문·창문·빈칸으로 정한다.
 * - 기간별 배정(seat_assignments): 관리자·학사 교사(seat.edit). 담임 등은 보기만(seat.view).
 *   미배정 학생을 자리에 앉히기, 두 자리 맞바꾸기(한쪽이 비면 이동), 배정 풀기.
 * - 지우지 않는다: 칸 삭제·배정 풀기는 status '취소'. 맞바꾸기·이동은 배정 행을 제자리에서 고쳐 audit_log에 남는다.
 * - 자동 초안과 규칙 위반 빨간 표시는 3단계. 여기서는 성별 구역이 어긋나면 경고 문구만 돌려준다(막지 않는다).
 * - 이 단계의 배정은 기간 전체(valid_from·valid_to 빈칸). 날짜를 좁힌 배정(방학 날짜별 자리표)은 3단계 — 있으면 고치지 않고 알린다.
 *
 * 순수 함수(parseSeatGridTsv_·seatGridPlan_·planSeatSwap_·planSeatAssign_)는 tests/features/seats.test.js가 검사한다.
 * ASSUMPTION: 좌석표 붙여넣기에서 이름 칸("1. 이름")은 자리만 가져오고 이름은 버린다(학생 배정은 따로).
 * ASSUMPTION: 격자 편집(공간 구조)은 관리자만, 학생 배정은 관리자·학사 교사.
 */

var SEAT_KIND_EN = { '좌석': 'seat', '기둥': 'pillar', '비상문': 'door', '창문': 'window' };
var SEAT_KINDS = ['좌석', '기둥', '비상문', '창문'];
var SEAT_MAX_ROWS = 40;
var SEAT_MAX_COLS = 30;
var SEAT_GENDERS = ['남', '여', '혼성'];

/**
 * 선생님 좌석표(시트에서 복사한 표) → 격자.
 * 칸 글자: '공석'·'1. 이름' 모양(숫자. 이름)=좌석, '기둥'·'비상문'·'창문', 빈칸=통로. 그 밖의 글자는 오류(칸 위치와 함께).
 * @return {{rows:number, cols:number, cells:{row:number,col:number,kind:string}[], seatCount:number, namedCount:number,
 *           errors:{line:number,column:number,message:string}[]}}
 */
function parseSeatGridTsv_(text) {
  var parsed = rosterParseText_(text);
  var errors = parsed.errors.map(function (e) { return { line: e.line, column: 0, message: e.message }; });
  var rows = parsed.rows;
  var cells = [], seatCount = 0, namedCount = 0, width = 0;
  rows.forEach(function (r, i) {
    width = Math.max(width, r.length);
    r.forEach(function (v, j) {
      if (v === '') return;
      var kind = '';
      if (v === '공석') kind = '좌석';
      else if (/^\d+\.\s*\S+/.test(v)) { kind = '좌석'; namedCount++; }
      else if (SEAT_KIND_EN[v] && v !== '좌석') kind = v;
      else if (v === '좌석') kind = '좌석';
      if (!kind) {
        errors.push({ line: i + 1, column: j + 1, message: i + 1 + '행 ' + (j + 1) + '열 "' + v.slice(0, 12) + '"을(를) 알 수 없습니다. 칸에는 공석·"1. 이름"·기둥·비상문·창문 중 하나(또는 빈칸)만 적어 주세요.' });
        return;
      }
      if (kind === '좌석') seatCount++;
      cells.push({ row: i + 1, col: j + 1, kind: kind });
    });
  });
  if (!errors.length) {
    if (!rows.length || !cells.length) errors.push({ line: 0, column: 0, message: '붙여넣은 표에 칸이 없습니다. 시트에서 좌석표를 복사해 붙여넣어 주세요.' });
    if (rows.length > SEAT_MAX_ROWS) errors.push({ line: 0, column: 0, message: '행이 ' + SEAT_MAX_ROWS + '개를 넘습니다.' });
    if (width > SEAT_MAX_COLS) errors.push({ line: 0, column: 0, message: '열이 ' + SEAT_MAX_COLS + '개를 넘습니다.' });
  }
  return { rows: rows.length, cols: width, cells: cells, seatCount: seatCount, namedCount: namedCount, errors: errors };
}

/** 좌석 칸 번호(라벨): 좌석만 행 우선으로 1부터. 그 밖의 칸은 ''. cells = [{row,col,kind}] → 같은 순서의 라벨 배열은 아니고 {'r,c': label} */
function seatLabelsFor_(cells) {
  var seats = cells.filter(function (c) { return c.kind === '좌석'; })
    .sort(function (a, b) { return a.row - b.row || a.col - b.col; });
  var out = {};
  seats.forEach(function (c, i) { out[c.row + ',' + c.col] = String(i + 1); });
  return out;
}

/**
 * 한 공간의 격자를 새 모양으로 바꾸는 계획(순수).
 * existing = 그 공간의 지금 유효한 seats 행, desired = [{row,col,kind}] (빈칸은 넣지 않는다),
 * assignedSeatIds = 지금 유효한 배정이 있는 좌석 id 배열, rows·cols = 공간 크기.
 * 배정이 있는 좌석을 좌석이 아닌 것으로 바꾸거나 없애면 거부한다(먼저 배정을 풀어야 한다).
 * @return {{ok, errors:string[], create:Object[], update:{id,patch}[], cancel:{id,patch}[]}}
 */
function seatGridPlan_(existing, desired, assignedSeatIds, rows, cols) {
  var errors = [];
  var assigned = {};
  (assignedSeatIds || []).forEach(function (id) { assigned[id] = true; });
  var want = {};
  (desired || []).forEach(function (c) {
    if (!(c.row >= 1 && c.row <= rows && c.col >= 1 && c.col <= cols) || SEAT_KINDS.indexOf(c.kind) < 0) {
      errors.push('격자 밖이거나 알 수 없는 칸입니다: ' + c.row + '행 ' + c.col + '열');
      return;
    }
    want[c.row + ',' + c.col] = c;
  });
  var have = {};
  (existing || []).forEach(function (s) { have[s.row + ',' + s.col] = s; });
  var labels = seatLabelsFor_(Object.keys(want).map(function (k) { return want[k]; }));
  var create = [], update = [], cancel = [];
  Object.keys(want).forEach(function (k) {
    var c = want[k], s = have[k], label = labels[k] || '';
    if (!s) { create.push({ row: String(c.row), col: String(c.col), kind: c.kind, label: label, status: '유효' }); return; }
    var patch = {};
    if (s.kind !== c.kind) {
      if (s.kind === '좌석' && assigned[s.id]) {
        errors.push(c.row + '행 ' + c.col + '열은 학생이 앉아 있어 바꿀 수 없습니다. 먼저 배정을 풀어 주세요.');
        return;
      }
      patch.kind = c.kind;
    }
    if (String(s.label || '') !== label) patch.label = label;
    if (Object.keys(patch).length) update.push({ id: s.id, patch: patch });
  });
  Object.keys(have).forEach(function (k) {
    if (want[k]) return;
    var s = have[k];
    if (s.kind === '좌석' && assigned[s.id]) {
      errors.push(s.row + '행 ' + s.col + '열은 학생이 앉아 있어 없앨 수 없습니다. 먼저 배정을 풀어 주세요.');
      return;
    }
    cancel.push({ id: s.id, patch: { status: '취소' } });
  });
  return { ok: errors.length === 0, errors: errors, create: create, update: update, cancel: cancel };
}

function seatLiveAssignments_(assignments, termId) {
  return (assignments || []).filter(function (a) { return String(a.status || '').trim() !== '취소' && a.term_id === termId; });
}

/** 한 자리의 유효한 배정 행(기간 전체). 날짜를 좁힌 배정이면 {bounded:true} */
function seatAssignmentAt_(live, seatId) {
  var rows = live.filter(function (a) { return a.seat_id === seatId; });
  if (rows.some(function (a) { return a.valid_from || a.valid_to; })) return { bounded: true };
  return { row: rows.length ? rows[rows.length - 1] : null };
}

/**
 * 미배정 학생을 자리에 앉힌다(이미 다른 자리에 있으면 옮긴다). 순수 함수.
 * live = 그 기간의 유효한 배정 행, seatKinds = {seatId: 종류}, enrolledIds = 이 기간 등록 학생 id 배열,
 * staleSeatIds = 배정된 학생이 퇴실해서 지금은 비어 보이는 자리 id(새 학생이 앉으면 이전 배정을 취소하고 바꾼다).
 * 입실 예정(미입실) 학생이 배정된 자리는 stale이 아니다 — 먼저 배정을 풀어야 한다.
 * @return {{ok, error?:string, ops:Object[], noop?:boolean}} ops: {op:'create', row} | {op:'update', id, patch} | {op:'cancel', id}
 */
function planSeatAssign_(live, termId, seatId, studentId, seatKinds, enrolledIds, staleSeatIds) {
  if (seatKinds[seatId] !== '좌석') return { ok: false, error: '좌석이 아닌 칸입니다.', ops: [] };
  if (enrolledIds.indexOf(studentId) < 0) return { ok: false, error: '이 기간에 등록된 학생이 아닙니다.', ops: [] };
  var target = seatAssignmentAt_(live, seatId);
  if (target.bounded) return { ok: false, error: '날짜를 좁힌 배정이 있는 자리입니다(3단계에서 다룹니다).', ops: [] };
  var ops = [];
  if (target.row) {
    if (target.row.student_id === studentId) return { ok: true, ops: [], noop: true };
    if ((staleSeatIds || []).indexOf(seatId) < 0) {
      return { ok: false, error: '이미 학생이 배정된 자리입니다. 두 자리를 차례로 눌러 맞바꾸거나, 먼저 배정을 풀어 주세요.', ops: [] };
    }
    ops.push({ op: 'cancel', id: target.row.id });
  }
  var mine = live.filter(function (a) { return a.student_id === studentId && (!target.row || a.id !== target.row.id); });
  if (mine.some(function (a) { return a.valid_from || a.valid_to; })) {
    return { ok: false, error: '이 학생에게 날짜를 좁힌 배정이 있습니다(3단계에서 다룹니다).', ops: [] };
  }
  if (mine.length) ops.push({ op: 'update', id: mine[0].id, patch: { seat_id: seatId } });
  else ops.push({ op: 'create', row: { term_id: termId, seat_id: seatId, student_id: studentId, valid_from: '', valid_to: '', status: '배정', memo: '' } });
  return { ok: true, ops: ops };
}

/**
 * 두 자리 맞바꾸기(순수). 한쪽만 앉아 있으면 그 학생을 빈 자리로 옮긴다. 둘 다 비면 할 일 없음.
 * 배정 행의 student_id(또는 seat_id)를 제자리에서 고친다. 퇴실한 학생의 배정만 남은 자리(stale)는 빈 자리로 보고,
 * 그 자리로 학생이 옮겨 가면 이전 배정을 취소한다.
 * @return {{ok, error?, ops:Object[], noop?:boolean}}
 */
function planSeatSwap_(live, a, b, seatKinds, staleSeatIds) {
  if (a === b) return { ok: false, error: '같은 자리입니다. 다른 자리를 골라 주세요.', ops: [] };
  if (seatKinds[a] !== '좌석' || seatKinds[b] !== '좌석') return { ok: false, error: '좌석이 아닌 칸은 바꿀 수 없습니다.', ops: [] };
  var ra = seatAssignmentAt_(live, a), rb = seatAssignmentAt_(live, b);
  if (ra.bounded || rb.bounded) return { ok: false, error: '날짜를 좁힌 배정이 있는 자리입니다(3단계에서 다룹니다).', ops: [] };
  var stale = staleSeatIds || [];
  var eff = function (r, id) { return r.row && stale.indexOf(id) < 0 ? r.row : null; };
  var ea = eff(ra, a), eb = eff(rb, b);
  if (!ea && !eb) return { ok: true, ops: [], noop: true };
  if (ea && eb) {
    return { ok: true, ops: [{ op: 'update', id: ea.id, patch: { student_id: eb.student_id } },
      { op: 'update', id: eb.id, patch: { student_id: ea.student_id } }] };
  }
  var from = ea || eb, toId = ea ? b : a, toRow = ea ? rb.row : ra.row;
  var ops = [];
  if (toRow) ops.push({ op: 'cancel', id: toRow.id });
  ops.push({ op: 'update', id: from.id, patch: { seat_id: toId } });
  return { ok: true, ops: ops };
}

/** 성별 구역이 어긋나면 경고 문구(막지 않는다). space.gender '남'·'여'·'혼성' */
function seatGenderWarning_(space, student) {
  if (!space || !student || space.gender === '혼성' || !space.gender) return '';
  if (student.gender && student.gender !== space.gender) {
    return student.name + ' 학생(' + student.gender + ')이(가) ' + space.gender + ' 전용 ' + space.name + '에 앉았습니다.';
  }
  return '';
}

/** 화면에 보일 학생 글자 '1. 이름' */
function seatDisplay_(student) { return student.grade + '. ' + student.name; }

/** 그 기간의 좌석표 기준일: 오늘이 기간 안이면 오늘, 시작 전이면 시작일, 끝난 뒤면 종료일 */
function seatBaseYmd_(term, today) {
  if (today < term.start_date) return term.start_date;
  if (today > term.end_date) return term.end_date;
  return today;
}

/* ───────────── 읽기 도우미 ───────────── */

function seatActive_(rows) { return rows.filter(function (r) { return String(r.status || '').trim() !== '취소'; }); }

function seatLoad_() {
  return {
    terms: readAll_('terms'), spaces: seatActive_(readAll_('spaces')), seats: seatActive_(readAll_('seats')),
    assignments: readAll_('seat_assignments'), enrollments: readAll_('enrollments'),
    students: readAll_('students'), changes: readAll_('status_changes')
  };
}

function seatFresh_() {
  ['spaces', 'seats', 'seat_assignments', 'enrollments', 'students', 'status_changes', 'terms'].forEach(function (n) { invalidate_('db', n); });
}

function seatFindTerm_(terms, termId) {
  var t = terms.filter(function (x) { return x.id === termId; })[0];
  if (!t) throw new Error('운영 기간을 골라 주세요.');
  return t;
}

function seatKindMap_(seats) {
  var m = {};
  seats.forEach(function (s) { m[s.id] = s.kind; });
  return m;
}

/** 쓰기 계획 적용(락 안). ops: create/update/cancel */
function seatApplyOps_(sheet, ops, email) {
  var creates = ops.filter(function (o) { return o.op === 'create'; }).map(function (o) { return o.row; });
  var updates = ops.filter(function (o) { return o.op === 'update'; }).map(function (o) { return { id: o.id, patch: o.patch }; });
  var cancels = ops.filter(function (o) { return o.op === 'cancel'; }).map(function (o) { return { id: o.id, patch: { status: '취소' } }; });
  updates.concat(cancels).forEach(function (u) { updateRecord_(sheet, u.id, u.patch, email); });
  creates.forEach(function (r) { appendRecord_(sheet, r, email); });
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 좌석표 한 기간 전체: 공간·칸·앉은 학생·미배정 학생.
 * 앉은 자리는 seatMapOn_(R2)로 계산한다(퇴실·미입실은 공석으로 보인다).
 */
function getSeatData(termId) {
  var user = requirePermission_('seat.view');
  var d = seatLoad_();
  var term = seatFindTerm_(d.terms, String(termId || '') || (getCurrentTerm_() || {}).id);
  var ymd = seatBaseYmd_(term, today_());
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, ymd);
  var studentById = {};
  d.students.forEach(function (s) { studentById[s.id] = s; });
  var enrolled = {};
  d.enrollments.forEach(function (e) { if (e.term_id === term.id) enrolled[e.student_id] = e; });
  var holder = {};   // 자리 → 배정된 학생(앉아 있지 않아도: 퇴실·입실 전)
  seatLiveAssignments_(d.assignments, term.id).forEach(function (a) { holder[a.seat_id] = a.student_id; });
  var spaces = d.spaces.slice().sort(function (a, b) { return (+a.sort_order || 0) - (+b.sort_order || 0); }).map(function (sp) {
    var cells = d.seats.filter(function (s) { return s.space_id === sp.id; }).map(function (s) {
      var m = map.bySeat[s.id], st = m && m.studentId ? studentById[m.studentId] : null;
      return { id: s.id, row: +s.row, col: +s.col, kind: SEAT_KIND_EN[s.kind] || 'seat', seatLabel: s.label || '',
        text: st ? seatDisplay_(st) : '', vacant: s.kind === '좌석' && !st, reason: m && !st ? m.reason : '', studentId: st ? st.id : '',
        hold: !st && holder[s.id] && studentById[holder[s.id]] ? seatDisplay_(studentById[holder[s.id]]) : '' };
    });
    return { id: sp.id, name: sp.name, gender: sp.gender, rows: +sp.rows, cols: +sp.cols, sortOrder: +sp.sort_order || 0, cells: cells };
  });
  var pickStudent = function (id) {
    var s = studentById[id] || {};
    return { id: id, name: s.name || '', grade: +s.grade || 0, classNo: s.class_no || '', number: s.number || '', studentNo: s.student_no || '',
      gender: s.gender || '', veritas: !!enrolled[id] && isTruthy_(enrolled[id].veritas), display: s.name ? seatDisplay_(s) : '' };
  };
  return {
    term: { id: term.id, name: term.name }, ymd: ymd, terms: d.terms.map(function (t) { return { id: t.id, name: t.name }; }),
    canEdit: hasAnyAllowedRole_(user.roles, permissions_()['seat.edit'].roles),
    canLayout: hasAnyAllowedRole_(user.roles, permissions_()['seat.layout'].roles),
    spaces: spaces, unseated: map.unseated.map(pickStudent), warnings: map.warnings
  };
}

function seatValidateSpace_(input, spaces) {
  var errors = [];
  var name = String(input.name || '').trim();
  var gender = String(input.gender || '').trim();
  var rows = +input.rows, cols = +input.cols;
  if (!name) errors.push({ field: 'name', message: '공간 이름을 적어 주세요. 예: 1층 자습실, SA1실' });
  if (name.length > 30) errors.push({ field: 'name', message: '이름은 30자 안으로 적어 주세요.' });
  if (SEAT_GENDERS.indexOf(gender) < 0) errors.push({ field: 'gender', message: '성별 구역을 남·여·혼성 중에서 골라 주세요.' });
  if (!(rows >= 1 && rows <= SEAT_MAX_ROWS && rows === Math.floor(rows))) errors.push({ field: 'rows', message: '행 수는 1~' + SEAT_MAX_ROWS + ' 사이 숫자로 적어 주세요.' });
  if (!(cols >= 1 && cols <= SEAT_MAX_COLS && cols === Math.floor(cols))) errors.push({ field: 'cols', message: '열 수는 1~' + SEAT_MAX_COLS + ' 사이 숫자로 적어 주세요.' });
  if (name && spaces.some(function (s) { return s.id !== String(input.id || '') && String(s.name).trim() === name; })) {
    errors.push({ field: 'name', message: '같은 이름의 공간이 이미 있습니다. 다른 이름으로 적어 주세요.' });
  }
  return { ok: errors.length === 0, errors: errors, record: { name: name, gender: gender, rows: String(rows), cols: String(cols) } };
}

/** 공간 추가·수정(이름·성별·크기). 줄이는 크기 밖에 칸이 있으면 거부. 관리자만. */
function saveSpace(input) {
  var user = requirePermission_('seat.layout');
  input = input || {};
  return withLock_(function () {
    seatFresh_();
    var spaces = seatActive_(readAll_('spaces'));
    var v = seatValidateSpace_(input, spaces);
    if (!v.ok) return { ok: false, errors: v.errors };
    var id = String(input.id || '');
    if (!id) {
      var order = spaces.reduce(function (m, s) { return Math.max(m, +s.sort_order || 0); }, 0) + 1;
      var rec = appendRecord_('spaces', Object.assign({ sort_order: String(order), status: '유효', memo: '' }, v.record), user.email);
      return { ok: true, id: rec.id };
    }
    var cur = spaces.filter(function (s) { return s.id === id; })[0];
    if (!cur) throw new Error('수정할 공간을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
    var out = seatActive_(readAll_('seats')).filter(function (s) { return s.space_id === id && (+s.row > +v.record.rows || +s.col > +v.record.cols); });
    if (out.length) return { ok: false, errors: [{ field: 'rows', message: '줄이려는 크기 밖에 칸이 ' + out.length + '개 있습니다. 격자 편집에서 그 칸을 먼저 비워 주세요.' }] };
    updateRecord_('spaces', id, v.record, user.email);
    return { ok: true, id: id };
  });
}

/**
 * 한 공간의 칸을 통째로 저장한다. cells = [{row, col, kind}] (kind: 좌석·기둥·비상문·창문, 빈칸은 넣지 않는다). 관리자만.
 * 앉은 학생이 있는 좌석을 없애거나 바꾸면 거부한다.
 */
function saveSpaceGrid(spaceId, cells) {
  var user = requirePermission_('seat.layout');
  return withLock_(function () {
    seatFresh_();
    var sp = seatActive_(readAll_('spaces')).filter(function (s) { return s.id === String(spaceId || ''); })[0];
    if (!sp) throw new Error('공간을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
    var seats = seatActive_(readAll_('seats')).filter(function (s) { return s.space_id === sp.id; });
    var ids = {};
    seats.forEach(function (s) { ids[s.id] = true; });
    var assigned = readAll_('seat_assignments').filter(function (a) { return String(a.status || '').trim() !== '취소' && ids[a.seat_id]; })
      .map(function (a) { return a.seat_id; });
    var plan = seatGridPlan_(seats.map(function (s) { return { id: s.id, row: +s.row, col: +s.col, kind: s.kind, label: s.label }; }),
      (cells || []).map(function (c) { return { row: +c.row, col: +c.col, kind: c.kind }; }), assigned, +sp.rows, +sp.cols);
    if (!plan.ok) return { ok: false, errors: plan.errors };
    bulkUpdateRecords_('seats', plan.update.concat(plan.cancel), user.email);
    bulkAppend_('seats', plan.create.map(function (c) { return Object.assign({ space_id: sp.id }, c); }), user.email);
    return { ok: true, created: plan.create.length, updated: plan.update.length, cancelled: plan.cancel.length };
  });
}

/** 붙여넣은 좌석표 미리보기(쓰기 없음). 관리자만. */
function previewSeatGrid(text) {
  requirePermission_('seat.layout');
  var g = parseSeatGridTsv_(text);
  return { ok: g.errors.length === 0, errors: g.errors.slice(0, 30), errorCount: g.errors.length,
    rows: g.rows, cols: g.cols, seatCount: g.seatCount, namedCount: g.namedCount };
}

/** 붙여넣은 좌석표로 새 공간을 만든다(이름은 버리고 자리만). 관리자만. */
function importSeatGrid(text, input) {
  var user = requirePermission_('seat.layout');
  input = input || {};
  return withLock_(function () {
    seatFresh_();
    var g = parseSeatGridTsv_(text);
    if (g.errors.length) return { ok: false, errors: g.errors.slice(0, 30).map(function (e) { return { field: 'text', message: e.message }; }) };
    var spaces = seatActive_(readAll_('spaces'));
    var v = seatValidateSpace_({ name: input.name, gender: input.gender, rows: g.rows, cols: g.cols }, spaces);
    if (!v.ok) return { ok: false, errors: v.errors };
    var order = spaces.reduce(function (m, s) { return Math.max(m, +s.sort_order || 0); }, 0) + 1;
    var sp = appendRecord_('spaces', Object.assign({ sort_order: String(order), status: '유효', memo: '좌석표 붙여넣기' }, v.record), user.email);
    var labels = seatLabelsFor_(g.cells);
    bulkAppend_('seats', g.cells.map(function (c) {
      return { space_id: sp.id, row: String(c.row), col: String(c.col), kind: c.kind, label: labels[c.row + ',' + c.col] || '', status: '유효' };
    }), user.email);
    return { ok: true, id: sp.id, seats: g.seatCount, ignoredNames: g.namedCount };
  });
}

/** 공통: 배정 쓰기 계획을 받아 적용하고 성별 경고를 붙인다 */
function seatAssignCommon_(termId, build) {
  seatFresh_();
  var d = seatLoad_();
  var term = seatFindTerm_(d.terms, String(termId || ''));
  var live = seatLiveAssignments_(d.assignments, term.id);
  var kinds = seatKindMap_(d.seats);
  var enrolledIds = d.enrollments.filter(function (e) { return e.term_id === term.id; }).map(function (e) { return e.student_id; });
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, seatBaseYmd_(term, today_()));
  var stale = Object.keys(map.bySeat).filter(function (id) { return map.bySeat[id].reason === '퇴실'; });
  var plan = build(live, kinds, enrolledIds, term, d, stale);
  if (!plan.ok) return { ok: false, error: plan.error };
  return { ok: true, plan: plan, data: d, term: term, kinds: kinds };
}

function seatWarningsFor_(d, seatIds, studentIds) {
  var out = [];
  var seatById = {}, spaceById = {}, stuById = {};
  d.seats.forEach(function (s) { seatById[s.id] = s; });
  d.spaces.forEach(function (s) { spaceById[s.id] = s; });
  d.students.forEach(function (s) { stuById[s.id] = s; });
  seatIds.forEach(function (sid, i) {
    var seat = seatById[sid], st = stuById[studentIds[i]];
    var w = seat ? seatGenderWarning_(spaceById[seat.space_id], st) : '';
    if (w) out.push(w);
  });
  return out;
}

/** 미배정 학생을 자리에 앉힌다(이미 다른 자리에 있으면 옮긴다). 관리자·학사 교사. */
function assignSeat(termId, seatId, studentId) {
  var user = requirePermission_('seat.edit');
  return withLock_(function () {
    var r = seatAssignCommon_(termId, function (live, kinds, enrolledIds, term, d, stale) {
      return planSeatAssign_(live, term.id, String(seatId || ''), String(studentId || ''), kinds, enrolledIds, stale);
    });
    if (!r.ok) return r;
    seatApplyOps_('seat_assignments', r.plan.ops, user.email);
    return { ok: true, warnings: seatWarningsFor_(r.data, [String(seatId)], [String(studentId)]) };
  });
}

/** 두 자리를 맞바꾼다(한쪽이 비면 이동). 관리자·학사 교사. 한 락 안에서 두 행을 고친다. */
function swapSeats(termId, seatA, seatB) {
  var user = requirePermission_('seat.edit');
  return withLock_(function () {
    var r = seatAssignCommon_(termId, function (live, kinds, enrolledIds, term, d, stale) {
      return planSeatSwap_(live, String(seatA || ''), String(seatB || ''), kinds, stale);
    });
    if (!r.ok) return r;
    seatApplyOps_('seat_assignments', r.plan.ops, user.email);
    var live = seatLiveAssignments_(readAll_('seat_assignments'), r.term.id);
    var at = function (id) { var x = seatAssignmentAt_(live, id).row; return x ? x.student_id : ''; };
    var warns = seatWarningsFor_(r.data, [String(seatA), String(seatB)], [at(String(seatA)), at(String(seatB))]);
    return { ok: true, noop: !!r.plan.noop, warnings: warns };
  });
}

/** 한 자리의 배정을 푼다(status '취소'). 관리자·학사 교사. */
function unassignSeat(termId, seatId) {
  var user = requirePermission_('seat.edit');
  return withLock_(function () {
    var r = seatAssignCommon_(termId, function (live) {
      var t = seatAssignmentAt_(live, String(seatId || ''));
      if (t.bounded) return { ok: false, error: '날짜를 좁힌 배정이 있는 자리입니다(3단계에서 다룹니다).', ops: [] };
      if (!t.row) return { ok: false, error: '이미 비어 있는 자리입니다.', ops: [] };
      return { ok: true, ops: [{ op: 'cancel', id: t.row.id }] };
    });
    if (!r.ok) return r;
    seatApplyOps_('seat_assignments', r.plan.ops, user.email);
    return { ok: true };
  });
}
