/**
 * F5 좌석 격자·수동 배치(C6). PRD 3.5·F5, docs/plan/stage1.md C6.
 *
 * - 공간(spaces)·좌석 칸(seats): 격자 편집은 관리자만(seat.layout). 칸을 좌석·기둥·비상문·창문·빈칸으로 정한다.
 * - 기간별 배정(seat_assignments): 관리자·학사 교사(seat.edit). 담임 등은 보기만(seat.view).
 *   미배정 학생을 자리에 앉히기, 두 자리 맞바꾸기(한쪽이 비면 이동), 배정 풀기.
 * - 지우지 않는다: 칸 삭제는 status '취소'. 배정 변경(앉히기·맞바꾸기·이동·풀기)은 행을 제자리에서 고치지 않고 옛 행을 기준일 전날로 끝낸 뒤
 *   새 행을 만든다(바뀐 칸은 audit_log에 남는다). 기준일 이후에야 효력이 생기는 행은 취소한다.
 * - 자동 초안과 규칙 위반 빨간 표시는 3단계. 여기서는 성별 구역이 어긋나면 경고 문구만 돌려준다(막지 않는다).
 * - 배정 행: 기준일(적용일) D가 기간 시작일 이하이면 새 행의 valid_from·valid_to는 빈칸(기간 전체 — 나중에 기간 시작일을 앞당겨도 잠기지 않는다),
 *   시작 뒤이면 valid_from = D. 날짜를 좁힌 배정(방학 날짜별 자리표)은 3단계 — 있으면 고치지 않고 알린다.
 * - 옛 행은 valid_to = D - 1로 끝내므로 지난 날짜의 좌석표·출석부가 그때 앉았던 학생을 그대로 보인다. 기준일 전에 끝난 행은 다른 배정을 막지 않는다.
 * - 격자 변경: 이번(또는 앞으로) 운영 기간에 학생이 앉았던 기록이 있는 좌석은 배정을 풀어도 기간이 끝날 때까지 바꿀 수 없다(결정 37).
 *   지난 기간 배정만 있는 좌석은 경고 후 허용한다.
 * - 동시 편집: 화면이 본 자리의 배정 표(token)를 함께 보내고, 락 안에서 다르면 거부한다("다른 선생님이 먼저 바꿨습니다").
 *   assignSeat는 이미 배정된 학생을 옮기지 않는다(이동은 맞바꾸기 경로로만).
 * - 여러 행 쓰기는 bulkUpdateRecords_ 한 번 + bulkAppend_ 한 번. 수정을 먼저 하고 추가를 나중에 해서, 중간에 멈춰도 한 학생이 두 자리에 있지는 않다.
 *   공간 이름을 바꿔 번호 방식이 바뀔 때도 번호(seats)를 먼저 쓰고 이름(spaces)을 나중에 쓴다 — 번호 쓰기가 실패해도 이름이 바뀐 채 남지 않는다.
 * - 끝난 운영 기간의 좌석표는 보기만(결정 37).
 * - 좌석 번호(결정 37): 1층 등은 "줄-순번"(좌석이 있는 열을 왼쪽부터 센 줄 번호 + 앞(1행 쪽)에서부터 순번), SA실은 방 안 순번.
 *   ASSUMPTION: 방 이름이 "SA"+숫자로 시작하면 SA실, 그 밖은 줄-순번(시트 구조를 바꾸지 않으려고 이름으로 구분한다).
 *
 * 순수 함수(parseSeatGridTsv_·seatGridPlan_·planSeatSwap_·planSeatAssign_)는 tests/features/seats.test.js가 검사한다.
 * ASSUMPTION: 좌석표 붙여넣기에서 이름 칸("1. 이름")은 자리만 가져오고 이름은 버린다(학생 배정은 따로).
 * ASSUMPTION: 격자 편집(공간 구조)은 관리자만, 학생 배정은 관리자·학사 교사.
 */

var SEAT_KIND_EN = { '좌석': 'seat', '기둥': 'pillar', '비상문': 'door', '창문': 'window' };
var SEAT_KINDS = ['좌석', '기둥', '비상문', '창문'];
var SEAT_MAX_ROWS = 40;
var SEAT_MAX_COLS = 40;
var SEAT_GENDERS = ['남', '여', '혼성'];

/** 칸 종류 → 영문(화면·출석부 모델용). 모르는 값은 'seat'. 'constructor' 같은 이름이 통과하지 않게 목록으로 확인한다. */
function seatKindEn_(kind) { return SEAT_KINDS.indexOf(kind) >= 0 ? SEAT_KIND_EN[kind] : 'seat'; }

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
  var cells = [], seatCount = 0, namedCount = 0, width = 0, skippedHeads = 0, rowOffset = 0;
  var headLike = function (v) { return /^\d+(\/\d+)?$/.test(v); };
  // 맨 윗행이 줄 머리("5/19" 같은 숫자 칸)뿐이면 그 행 전체를 건너뛴다(실제 1층은 세로 줄이라 줄 머리가 윗행에 있다)
  var firstFilled = -1;   // 맨 위 빈 행(탭만 있는 행)은 건너뛰고 첫 채워진 행을 본다
  rows.some(function (r, i) { if (r.some(function (v) { return v !== ''; })) { firstFilled = i; return true; } return false; });
  if (firstFilled >= 0 && rows[firstFilled].every(function (v) { return v === '' || headLike(v); })) {
    skippedHeads += rows[firstFilled].filter(function (v) { return v !== ''; }).length;
    rows = rows.slice(firstFilled + 1);   // 빈 행과 줄 머리 행을 함께 버린다
    rowOffset = firstFilled + 1;
  }
  rows.forEach(function (r, i) {
    width = Math.max(width, r.length);
    r.forEach(function (v, j) {
      if (v === '') return;
      // 줄 머리 칸("5", "5/19"처럼 숫자만 있는 첫 칸)은 좌석표가 아니라 줄 이름이므로 건너뛴다(선택 개선)
      if (j === 0 && headLike(v)) { skippedHeads++; return; }
      var kind = '';
      if (v === '공석') kind = '좌석';
      else if (/^\d+\.\s*\S+/.test(v)) { kind = '좌석'; namedCount++; }
      else if (SEAT_KINDS.indexOf(v) >= 0) kind = v;
      if (!kind) {
        errors.push({ line: i + 1 + rowOffset, column: j + 1, message: i + 1 + rowOffset + '행 ' + (j + 1) + '열 "' + v.slice(0, 12) + '"을(를) 알 수 없습니다. 칸에는 공석·"1. 이름"·기둥·비상문·창문 중 하나(또는 빈칸)만 적어 주세요.' });
        return;
      }
      if (kind === '좌석') seatCount++;
      cells.push({ row: i + 1, col: j + 1, kind: kind });
    });
  });
  if (skippedHeads && !cells.some(function (c) { return c.col === 1; })) {   // 첫 열이 줄 머리뿐이면 한 칸 당긴다
    cells.forEach(function (c) { c.col -= 1; });
    width = Math.max(0, width - 1);
  }
  if (!errors.length) {
    if (!rows.length || !cells.length) errors.push({ line: 0, column: 0, message: '붙여넣은 표에 칸이 없습니다. 시트에서 좌석표를 복사해 붙여넣어 주세요.' });
    if (rows.length > SEAT_MAX_ROWS) errors.push({ line: 0, column: 0, message: '행이 ' + SEAT_MAX_ROWS + '개를 넘습니다.' });
    if (width > SEAT_MAX_COLS) errors.push({ line: 0, column: 0, message: '열이 ' + SEAT_MAX_COLS + '개를 넘습니다.' });
  }
  return { rows: rows.length, cols: width, cells: cells, seatCount: seatCount, namedCount: namedCount, skippedHeads: skippedHeads, errors: errors };
}

/** 번호 방식: "SA"+숫자로 시작하는 방 이름(SA1실…)은 방 안 순번('room'), 그 밖은 줄-순번('line'). ASSUMPTION(결정 37, 위 머리말) */
function seatLabelStyle_(spaceName) { return /^\s*SA\s*\d/i.test(String(spaceName || '')) ? 'room' : 'line'; }

/**
 * 좌석 칸 번호(라벨) → {'행,열': 번호}. 좌석이 아닌 칸은 없다.
 * 'line'(1층): 좌석이 있는 열을 왼쪽부터 세어 줄 번호, 그 줄 안에서 앞(1행)부터 순번 → "3-7". 'room'(SA실): 방 안에서 행 우선 1부터.
 */
function seatLabelsFor_(cells, style) {
  var seats = cells.filter(function (c) { return c.kind === '좌석'; });
  var out = {};
  if (style === 'room') {
    seats.sort(function (a, b) { return a.row - b.row || a.col - b.col; });
    seats.forEach(function (c, i) { out[c.row + ',' + c.col] = String(i + 1); });
    return out;
  }
  var cols = [];
  seats.forEach(function (c) { if (cols.indexOf(c.col) < 0) cols.push(c.col); });
  cols.sort(function (a, b) { return a - b; });
  cols.forEach(function (col, i) {
    seats.filter(function (c) { return c.col === col; }).sort(function (a, b) { return a.row - b.row; })
      .forEach(function (c, k) { out[c.row + ',' + c.col] = (i + 1) + '-' + (k + 1); });
  });
  return out;
}

/**
 * 한 공간의 격자를 새 모양으로 바꾸는 계획(순수).
 * existing = 그 공간의 지금 유효한 seats 행, desired = [{row,col,kind}] (빈칸은 넣지 않는다), rows·cols = 공간 크기,
 * assignedSeatIds = 지금·앞으로의 기간에 배정 행이 하나라도 있는 좌석 id(오늘 끝난 행만 남아도 포함 — 결정 37),
 * historySeatIds = 그중 지금 앉은 학생은 없고 이번 기간 기록만 남은 좌석(문구는 같다, 호환용), pastOnlySeatIds = 지난 기간 배정만 있는 좌석 id,
 * style = 번호 방식('line'|'room', seatLabelStyle_).
 * 지금·앞으로 기간에 배정 기록이 있는 좌석을 좌석이 아닌 것으로 바꾸거나 없애면 거부한다(배정을 풀어도 기간이 끝날 때까지).
 * 지난 기간 배정만 있는 좌석은 경고만 하고 허용한다(지난 날짜 출석부를 다시 뽑으면 바뀐 격자로 나온다).
 * @return {{ok, errors:string[], warnings:string[], relabelAssigned:number, create:Object[], update:{id,patch}[], cancel:{id,patch}[]}}
 *   relabelAssigned = 번호가 바뀌는 배정 좌석 수(라벨이 바뀌어도 배정은 좌석 id로 이어진다)
 */
function seatGridPlan_(existing, desired, assignedSeatIds, rows, cols, style, pastOnlySeatIds, historySeatIds) {
  var errors = [], warnings = [];
  var assigned = {}, pastOnly = {}, history = {};
  (historySeatIds || []).forEach(function (id) { history[id] = true; });
  (assignedSeatIds || []).forEach(function (id) { assigned[id] = true; });
  (pastOnlySeatIds || []).forEach(function (id) { pastOnly[id] = true; });
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
  var labels = seatLabelsFor_(Object.keys(want).map(function (k) { return want[k]; }), style || 'line');
  var create = [], update = [], cancel = [], relabelAssigned = 0, pastWarned = {};
  // 배정을 풀어도 이번 기간 기록(끝난 행)이 남으므로, 앉아 있든 앉았던 기록만 있든 기간이 끝난 뒤에야 바꿀 수 있다(결정 37)
  var blockMsg = function (s) {
    return s.row + '행 ' + s.col + '열은 이번 운영 기간에 학생이 앉았던 자리라 기간이 끝난 뒤 바꿀 수 있습니다.';
  };
  var warnPast = function (s, what) {
    if (!pastOnly[s.id] || pastWarned[s.id]) return;
    pastWarned[s.id] = true;
    warnings.push(s.row + '행 ' + s.col + '열은 지난 기간에 쓰인 자리입니다. ' + what + ' 지난 날짜의 출석부를 다시 뽑으면 바뀐 격자로 나옵니다.');
  };
  Object.keys(want).forEach(function (k) {
    var c = want[k], s = have[k], label = labels[k] || '';
    if (!s) { create.push({ row: String(c.row), col: String(c.col), kind: c.kind, label: label, status: '유효' }); return; }
    var patch = {};
    if (s.kind !== c.kind) {
      if (s.kind === '좌석' && assigned[s.id]) {
        errors.push(blockMsg(s));
        return;
      }
      if (s.kind === '좌석') warnPast(s, '좌석을 다른 칸으로 바꿉니다.');
      patch.kind = c.kind;
    }
    if (String(s.label || '') !== label) {
      patch.label = label;
      if (s.kind === '좌석' && c.kind === '좌석') {
        if (assigned[s.id]) relabelAssigned++;
        else warnPast(s, '번호가 바뀝니다.');
      }
    }
    if (Object.keys(patch).length) update.push({ id: s.id, patch: patch });
  });
  Object.keys(have).forEach(function (k) {
    if (want[k]) return;
    var s = have[k];
    if (s.kind === '좌석' && assigned[s.id]) {
      errors.push(blockMsg(s));
      return;
    }
    if (s.kind === '좌석') warnPast(s, '좌석을 없앱니다.');
    cancel.push({ id: s.id, patch: { status: '취소' } });
  });
  return { ok: errors.length === 0, errors: errors, warnings: warnings, relabelAssigned: relabelAssigned, create: create, update: update, cancel: cancel };
}

function seatLiveAssignments_(assignments, termId) {
  return (assignments || []).filter(function (a) { return String(a.status || '').trim() !== '취소' && a.term_id === termId; });
}

/** 배정 행이 기준일 전에 끝났으면 true(지난 기록 — 다른 배정을 막지 않는다) */
function seatEnded_(a, ymd) { return !!a.valid_to && a.valid_to < ymd; }

/** 한 자리의 유효한 배정 행(기준일 기준). 날짜를 좁힌 배정(앞으로 끝나거나 아직 시작 안 함)이면 {bounded:true}. 기준일 전에 끝난 행은 무시 */
function seatAssignmentAt_(live, seatId, ymd) {
  var rows = live.filter(function (a) { return a.seat_id === seatId && !seatEnded_(a, ymd); });
  if (rows.some(function (a) { return a.valid_to || (a.valid_from && a.valid_from > ymd); })) return { bounded: true };
  return { row: rows.length ? rows[rows.length - 1] : null };
}

/**
 * 화면이 본 자리 배정 상태 표. 락 안에서 다시 계산해 다르면 "다른 선생님이 먼저 바꿨다"로 거부한다. 빈 자리는 ''.
 * reason = seatMapOn_의 그 자리 상태('', '퇴실', '미입실', '미배정') — 퇴실이 취소돼 "옮기기"가 "맞바꾸기"로 바뀌는 것도 막는다.
 */
function seatToken_(live, seatId, ymd, reason) {
  var t = seatAssignmentAt_(live, seatId, ymd);
  if (t.bounded) return 'bounded';
  return t.row ? [t.row.id, t.row.student_id, t.row.valid_from || '', t.row.valid_to || '', reason || ''].join('|') : '';
}

/**
 * 기준일(적용일) D부터 이 행의 배정을 끝내는 쓰기: 옛 행은 valid_to = D - 1로 끝낸다(지난 날짜는 그대로).
 * 기준일 이후에야 효력이 생기는 행(valid_from, 없으면 기간 시작일이 D 이상)은 지난 기록이 없으므로 취소한다.
 */
function seatEndOp_(row, ymd, termStart) {
  var from = row.valid_from || termStart || '';
  if (from && from >= ymd) return { op: 'cancel', id: row.id };
  return { op: 'update', id: row.id, patch: { valid_to: ymdAddDays_(ymd, -1) } };
}

/** 새 배정 행의 valid_from: 적용일이 기간 시작일 이하이면 빈칸(기간 전체), 아니면 적용일 */
function seatFrom_(ymd, termStart) { return termStart && ymd <= termStart ? '' : ymd; }

function seatNewRow_(termId, seatId, studentId, validFrom) {
  return { term_id: termId, seat_id: seatId, student_id: studentId, valid_from: validFrom || '', valid_to: '', status: '배정', memo: '' };
}

/**
 * 미배정 학생을 빈 자리에 앉힌다. 순수 함수. 이미 다른 자리에 배정된 학생은 옮기지 않고 거부한다(이동은 맞바꾸기로만).
 * live = 그 기간의 유효한 배정 행, seatKinds = {seatId: 종류}, enrolledIds = 이 기간 등록 학생 id 배열, ymd = 기준일,
 * staleSeatIds = 배정된 학생이 퇴실해서 지금은 비어 보이는 자리 id.
 * stale 자리에 앉히면 이전 행을 취소하지 않고 valid_to = 기준일 - 1로 끝내고 새 행(valid_from = 기준일)을 만든다(지난 기록 보존).
 * 입실 예정(미입실) 학생이 배정된 자리는 stale이 아니다 — 먼저 배정을 풀어야 한다.
 * @return {{ok, error?:string, ops:Object[], noop?:boolean}} ops: {op:'create', row} | {op:'update', id, patch} | {op:'cancel', id}
 */
function planSeatAssign_(live, termId, seatId, studentId, seatKinds, enrolledIds, staleSeatIds, ymd, termStart) {
  if (seatKinds[seatId] !== '좌석') return { ok: false, error: '좌석이 아닌 칸입니다.', ops: [] };
  if (enrolledIds.indexOf(studentId) < 0) return { ok: false, error: '이 기간에 등록된 학생이 아닙니다.', ops: [] };
  var target = seatAssignmentAt_(live, seatId, ymd);
  if (target.bounded) return { ok: false, error: '날짜를 좁힌 배정이 있는 자리입니다(3단계에서 다룹니다).', ops: [] };
  var mine = live.filter(function (a) { return a.student_id === studentId && !seatEnded_(a, ymd); });
  if (target.row && target.row.student_id === studentId) return { ok: true, ops: [], noop: true };
  if (mine.length) return { ok: false, error: '이미 다른 자리에 배정된 학생입니다. 두 자리를 차례로 눌러 옮겨 주세요.', ops: [] };
  var ops = [];
  if (target.row) {
    if ((staleSeatIds || []).indexOf(seatId) < 0) {
      return { ok: false, error: '이미 학생이 배정된 자리입니다. 두 자리를 차례로 눌러 맞바꾸거나, 먼저 배정을 풀어 주세요.', ops: [] };
    }
    ops.push(seatEndOp_(target.row, ymd, termStart));
  }
  ops.push({ op: 'create', row: seatNewRow_(termId, seatId, studentId, seatFrom_(ymd, termStart)) });
  return { ok: true, ops: ops };
}

/**
 * 두 자리 맞바꾸기(순수). 한쪽만 앉아 있으면 그 학생을 빈 자리로 옮긴다. 둘 다 비면 할 일 없음.
 * 모든 변경은 기준일 D부터: 관련된 옛 행은 valid_to = D - 1로 끝내고(D 이후에야 효력이 생기는 행은 취소),
 * 새 행은 valid_from = D로 만든다. 행을 제자리에서 고치지 않으므로 지난 날짜 좌석표는 그대로다.
 * 퇴실한 학생의 배정만 남은 자리(stale)는 빈 자리로 보고, 거기로 옮겨 가면 그 행도 같은 방식으로 끝낸다.
 * @return {{ok, error?, ops:Object[], noop?:boolean}}
 */
function planSeatSwap_(live, a, b, seatKinds, staleSeatIds, ymd, termId, termStart) {
  if (a === b) return { ok: false, error: '같은 자리입니다. 다른 자리를 골라 주세요.', ops: [] };
  if (seatKinds[a] !== '좌석' || seatKinds[b] !== '좌석') return { ok: false, error: '좌석이 아닌 칸은 바꿀 수 없습니다.', ops: [] };
  var ra = seatAssignmentAt_(live, a, ymd), rb = seatAssignmentAt_(live, b, ymd);
  if (ra.bounded || rb.bounded) return { ok: false, error: '날짜를 좁힌 배정이 있는 자리입니다(3단계에서 다룹니다).', ops: [] };
  var stale = staleSeatIds || [];
  var eff = function (r, id) { return r.row && stale.indexOf(id) < 0 ? r.row : null; };
  var ea = eff(ra, a), eb = eff(rb, b);
  if (!ea && !eb) return { ok: true, ops: [], noop: true };
  if (ea && eb) {
    return { ok: true, ops: [seatEndOp_(ea, ymd, termStart), seatEndOp_(eb, ymd, termStart),
      { op: 'create', row: seatNewRow_(termId, a, eb.student_id, seatFrom_(ymd, termStart)) }, { op: 'create', row: seatNewRow_(termId, b, ea.student_id, seatFrom_(ymd, termStart)) }] };
  }
  var from = ea || eb, toId = ea ? b : a, toRow = ea ? rb.row : ra.row;
  var ops = [seatEndOp_(from, ymd, termStart)];
  if (toRow) ops.push(seatEndOp_(toRow, ymd, termStart));   // 퇴실 학생의 자리: 그 행도 기준일부터 끝낸다(지난 기록은 남는다)
  ops.push({ op: 'create', row: seatNewRow_(termId, toId, from.student_id, seatFrom_(ymd, termStart)) });
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

/**
 * 쓰기 계획 적용(락 안). ops: create/update/cancel.
 * 수정·취소는 bulkUpdateRecords_ 한 번(시트를 한 번 읽고 한 번 쓴다 — 맞바꾸기에서 첫 행만 쓰이는 일이 없다),
 * 추가는 bulkAppend_ 한 번. 수정을 먼저 하므로 중간에 멈춰도 한 학생이 두 자리에 있지는 않다(자리가 비거나 학생이 미배정이 될 뿐).
 */
function seatApplyOps_(sheet, ops, email) {
  var patches = [];
  ops.forEach(function (o) {
    if (o.op === 'update') patches.push({ id: o.id, patch: o.patch });
    else if (o.op === 'cancel') patches.push({ id: o.id, patch: { status: '취소' } });
  });
  var creates = ops.filter(function (o) { return o.op === 'create'; }).map(function (o) { return o.row; });
  bulkUpdateRecords_(sheet, patches, email);
  bulkAppend_(sheet, creates, email);
}

/** 그 기간이 이미 끝났는가(끝난 기간은 보기만) */
function seatTermEnded_(term, today) { return !!term.end_date && today > term.end_date; }

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 좌석표 한 기간 전체: 공간·칸·앉은 학생·미배정 학생.
 * 앉은 자리는 seatMapOn_(R2)로 계산한다(퇴실·미입실은 공석으로 보인다).
 * 칸마다 token(그 자리의 배정 상태 표)이 있어, 배정·맞바꾸기·풀기 때 화면이 본 상태를 서버가 확인한다.
 * 끝난 기간은 canEdit=false. 미배정 학생의 학번·반·번호·성별·베리타스는 배정할 수 있는 사람(canEdit)에게만 보낸다.
 */
function getSeatData(termId) {
  var user = requirePermission_('seat.view');
  var d = seatLoad_();
  var term = seatFindTerm_(d.terms, String(termId || '') || (getCurrentTerm_() || {}).id);
  var today = today_();
  var ymd = seatBaseYmd_(term, today);
  var ended = seatTermEnded_(term, today);
  var canEdit = !ended && hasAnyAllowedRole_(user.roles, permissions_()['seat.edit'].roles);
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, ymd);
  var live = seatLiveAssignments_(d.assignments, term.id);
  var studentById = {};
  d.students.forEach(function (s) { studentById[s.id] = s; });
  var enrolled = {};
  d.enrollments.forEach(function (e) { if (e.term_id === term.id) enrolled[e.student_id] = e; });
  var holder = {};   // 자리 → 배정된 학생(앉아 있지 않아도: 퇴실·입실 전)
  live.forEach(function (a) { if (!seatEnded_(a, ymd)) holder[a.seat_id] = a.student_id; });
  var spaces = d.spaces.slice().sort(function (a, b) { return (+a.sort_order || 0) - (+b.sort_order || 0); }).map(function (sp) {
    var cells = d.seats.filter(function (s) { return s.space_id === sp.id; }).map(function (s) {
      var m = map.bySeat[s.id], st = m && m.studentId ? studentById[m.studentId] : null;
      return { id: s.id, row: +s.row, col: +s.col, kind: seatKindEn_(s.kind), seatLabel: s.label || '',
        text: st ? seatDisplay_(st) : '', vacant: s.kind === '좌석' && !st, reason: m && !st ? m.reason : '', studentId: st ? st.id : '',
        hold: !st && holder[s.id] && studentById[holder[s.id]] ? seatDisplay_(studentById[holder[s.id]]) : '',
        token: s.kind === '좌석' ? seatToken_(live, s.id, ymd, m ? m.reason : '') : '' };
    });
    return { id: sp.id, name: sp.name, gender: sp.gender, rows: +sp.rows, cols: +sp.cols, sortOrder: +sp.sort_order || 0, cells: cells };
  });
  var pickStudent = function (id) {
    var s = studentById[id] || {};
    return { id: id, name: s.name || '', grade: +s.grade || 0, classNo: s.class_no || '', number: s.number || '', studentNo: s.student_no || '',
      gender: s.gender || '', veritas: !!enrolled[id] && isTruthy_(enrolled[id].veritas), display: s.name ? seatDisplay_(s) : '' };
  };
  return {
    term: { id: term.id, name: term.name }, ymd: ymd, ended: ended, terms: d.terms.map(function (t) { return { id: t.id, name: t.name }; }),
    canEdit: canEdit,
    canLayout: hasAnyAllowedRole_(user.roles, permissions_()['seat.layout'].roles),
    spaces: spaces, unseated: canEdit ? map.unseated.map(pickStudent) : [], unseatedCount: map.unseated.length, warnings: map.warnings
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
    // 이름을 바꿔 번호 방식(SA실 ↔ 줄-순번)이 바뀌면 같은 락에서 번호를 다시 매긴다. 저장 전에 확인(needsConfirm)을 받는다.
    var relabel = [], relabelAssigned = 0;
    if (seatLabelStyle_(cur.name) !== seatLabelStyle_(v.record.name)) {
      var mine = seatActive_(readAll_('seats')).filter(function (s) { return s.space_id === id; });
      var want = seatLabelsFor_(mine.map(function (s) { return { row: +s.row, col: +s.col, kind: s.kind }; }), seatLabelStyle_(v.record.name));
      var ids = {};
      mine.forEach(function (s) { ids[s.id] = true; });
      var info = seatAssignedInfo_(ids);
      mine.forEach(function (s) {
        var label = want[+s.row + ',' + +s.col] || '';
        if (String(s.label || '') === label) return;
        relabel.push({ id: s.id, patch: { label: label } });
        if (s.kind === '좌석' && info.assigned.indexOf(s.id) >= 0) relabelAssigned++;
      });
      if (relabel.length && !input.confirmRelabel) return { ok: false, needsConfirm: true, relabelCount: relabel.length, relabelAssigned: relabelAssigned };
    }
    bulkUpdateRecords_('seats', relabel, user.email);   // 번호를 먼저(실패하면 이름도 그대로)
    updateRecord_('spaces', id, v.record, user.email);
    return { ok: true, id: id, relabeled: relabel.length };
  });
}

/**
 * 좌석별 배정 기록 분류(읽기만). assigned = 끝나지 않은 운영 기간(end_date ≥ 오늘)에 취소 아닌 배정 행이 하나라도 있는 좌석 —
 * 행이 어제까지 쓰이고 끝났어도 포함한다(결정 37: 배정을 풀어도 기간이 끝날 때까지 격자를 바꿀 수 없다).
 * history = assigned 중 지금 열려 있는(오늘 효력 있는) 행이 없는 좌석, pastOnly = 지난(끝난) 기간 배정만 있는 좌석(경고 후 허용).
 */
function seatAssignedInfo_(seatIds) {
  var today = today_();
  var termEnd = {};
  readAll_('terms').forEach(function (t) { termEnd[t.id] = t.end_date; });
  var assigned = {}, open = {}, pastOnly = {};
  readAll_('seat_assignments').forEach(function (a) {
    if (String(a.status || '').trim() === '취소' || !seatIds[a.seat_id]) return;
    // 지금·앞으로의 기간(끝나지 않은 기간)의 행이면 어제까지 쓰였어도 막는다(결정 37). 오늘 앉아 있는 것은 open
    if (termEnd[a.term_id] && termEnd[a.term_id] >= today) { assigned[a.seat_id] = true; if (!seatEnded_(a, today)) open[a.seat_id] = true; } else pastOnly[a.seat_id] = true;
  });
  return { assigned: Object.keys(assigned), history: Object.keys(assigned).filter(function (id) { return !open[id]; }),
    pastOnly: Object.keys(pastOnly).filter(function (id) { return !assigned[id]; }) };
}

/** 한 공간의 격자 저장 계획(읽기만): 위 분류로 거부·경고를 정한다. */
function seatGridPlanFor_(spaceId, cells) {
  seatFresh_();
  var sp = seatActive_(readAll_('spaces')).filter(function (s) { return s.id === String(spaceId || ''); })[0];
  if (!sp) throw new Error('공간을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
  var seats = seatActive_(readAll_('seats')).filter(function (s) { return s.space_id === sp.id; });
  var ids = {};
  seats.forEach(function (s) { ids[s.id] = true; });
  var info = seatAssignedInfo_(ids);
  var plan = seatGridPlan_(seats.map(function (s) { return { id: s.id, row: +s.row, col: +s.col, kind: s.kind, label: s.label }; }),
    (cells || []).map(function (c) { return { row: +c.row, col: +c.col, kind: c.kind }; }),
    info.assigned, +sp.rows, +sp.cols, seatLabelStyle_(sp.name), info.pastOnly, info.history);
  return { sp: sp, plan: plan };
}

function seatGridSummary_(plan) {
  return { created: plan.create.length, updated: plan.update.length, cancelled: plan.cancel.length,
    relabelAssigned: plan.relabelAssigned, warnings: plan.warnings };
}

/** 격자 저장 미리보기(쓰기 없음): 바뀌는 칸 수, "번호가 바뀌는 배정 좌석 N개", 지난 기간 경고, 막히는 이유. 관리자만. */
function previewSpaceGrid(spaceId, cells) {
  requirePermission_('seat.layout');
  var r = seatGridPlanFor_(spaceId, cells);
  if (!r.plan.ok) return { ok: false, errors: r.plan.errors };
  return Object.assign({ ok: true, errors: [] }, seatGridSummary_(r.plan));
}

/**
 * 한 공간의 칸을 통째로 저장한다. cells = [{row, col, kind}] (kind: 좌석·기둥·비상문·창문, 빈칸은 넣지 않는다). 관리자만.
 * 지금·앞으로의 기간에 앉은 학생이 있는 좌석을 없애거나 바꾸면 거부한다. 번호는 방식에 맞게 다시 매긴다(배정은 좌석 id로 이어진다).
 */
function saveSpaceGrid(spaceId, cells) {
  var user = requirePermission_('seat.layout');
  return withLock_(function () {
    var r = seatGridPlanFor_(spaceId, cells);
    var plan = r.plan;
    if (!plan.ok) return { ok: false, errors: plan.errors };
    bulkUpdateRecords_('seats', plan.update.concat(plan.cancel), user.email);
    bulkAppend_('seats', plan.create.map(function (c) { return Object.assign({ space_id: r.sp.id }, c); }), user.email);
    return Object.assign({ ok: true }, seatGridSummary_(plan));
  });
}

/** 붙여넣은 좌석표 미리보기(쓰기 없음). 관리자만. */
function previewSeatGrid(text) {
  requirePermission_('seat.layout');
  var g = parseSeatGridTsv_(text);
  return { ok: g.errors.length === 0, errors: g.errors.slice(0, 30), errorCount: g.errors.length,
    rows: g.rows, cols: g.cols, seatCount: g.seatCount, namedCount: g.namedCount, skippedHeads: g.skippedHeads };
}

/**
 * 붙여넣은 좌석표로 새 공간을 만든다(이름은 버리고 자리만). 관리자만.
 * 같은 이름의 공간이 이미 있어도 좌석이 하나도 없으면(이전 가져오기가 도중에 멈춘 것) 그 공간에 이어서 가져온다.
 */
function importSeatGrid(text, input) {
  var user = requirePermission_('seat.layout');
  input = input || {};
  return withLock_(function () {
    seatFresh_();
    var g = parseSeatGridTsv_(text);
    if (g.errors.length) return { ok: false, errors: g.errors.slice(0, 30).map(function (e) { return { field: 'text', message: e.message }; }) };
    var spaces = seatActive_(readAll_('spaces'));
    var name = String(input.name || '').trim();
    var seatsBySpace = {};
    seatActive_(readAll_('seats')).forEach(function (x) { seatsBySpace[x.space_id] = true; });
    var reuse = spaces.filter(function (x) { return String(x.name).trim() === name && !seatsBySpace[x.id]; })[0] || null;
    var v = seatValidateSpace_({ id: reuse ? reuse.id : '', name: input.name, gender: input.gender, rows: g.rows, cols: g.cols }, spaces);
    if (!v.ok) return { ok: false, errors: v.errors };
    var sp;
    if (reuse) {
      updateRecord_('spaces', reuse.id, v.record, user.email);
      sp = reuse;
    } else {
      var order = spaces.reduce(function (m, x) { return Math.max(m, +x.sort_order || 0); }, 0) + 1;
      sp = appendRecord_('spaces', Object.assign({ sort_order: String(order), status: '유효', memo: '좌석표 붙여넣기' }, v.record), user.email);
    }
    var labels = seatLabelsFor_(g.cells, seatLabelStyle_(v.record.name));
    bulkAppend_('seats', g.cells.map(function (c) {
      return { space_id: sp.id, row: String(c.row), col: String(c.col), kind: c.kind, label: labels[c.row + ',' + c.col] || '', status: '유효' };
    }), user.email);
    return { ok: true, id: sp.id, seats: g.seatCount, ignoredNames: g.namedCount, resumed: !!reuse };
  });
}

var SEAT_STALE_MSG = '다른 선생님이 먼저 바꿨습니다. 화면을 새로 불러온 뒤 다시 해 주세요.';

/**
 * 공통(락 안): 끝난 기간 거부 → 화면이 본 자리 상태(expect = {자리id: token})가 지금과 같은지 확인 → 쓰기 계획 만들기.
 * seatIds = 이 호출이 건드리는 자리들. expect가 없거나 자리 하나라도 다르면 거부한다.
 */
function seatAssignCommon_(termId, seatIds, expect, build) {
  seatFresh_();
  var d = seatLoad_();
  var term = seatFindTerm_(d.terms, String(termId || ''));
  var today = today_();
  if (seatTermEnded_(term, today)) return { ok: false, error: '끝난 운영 기간의 좌석표는 볼 수만 있습니다.' };
  var ymd = seatBaseYmd_(term, today);
  var live = seatLiveAssignments_(d.assignments, term.id);
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, ymd);
  var bad = !expect || typeof expect !== 'object' || seatIds.some(function (id) {
    return typeof expect[id] !== 'string' || expect[id] !== seatToken_(live, id, ymd, map.bySeat[id] ? map.bySeat[id].reason : '');
  });
  if (bad) return { ok: false, stale: true, error: SEAT_STALE_MSG };
  var kinds = seatKindMap_(d.seats);
  var enrolledIds = d.enrollments.filter(function (e) { return e.term_id === term.id; }).map(function (e) { return e.student_id; });
  var stale = Object.keys(map.bySeat).filter(function (id) { return map.bySeat[id].reason === '퇴실'; });
  var plan = build({ live: live, kinds: kinds, enrolledIds: enrolledIds, term: term, d: d, stale: stale, ymd: ymd });
  if (!plan.ok) return { ok: false, error: plan.error };
  return { ok: true, plan: plan, data: d, term: term, kinds: kinds, ymd: ymd };
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

/**
 * 미배정 학생을 빈 자리(또는 퇴실한 학생이 배정됐던 자리)에 앉힌다. 관리자·학사 교사.
 * expect = {자리id: 화면이 본 token}. 이미 다른 자리에 배정된 학생은 옮기지 않고 거부한다(맞바꾸기로 옮긴다).
 */
function assignSeat(termId, seatId, studentId, expect) {
  var user = requirePermission_('seat.edit');
  seatId = String(seatId || ''); studentId = String(studentId || '');
  return withLock_(function () {
    var r = seatAssignCommon_(termId, [seatId], expect, function (c) {
      return planSeatAssign_(c.live, c.term.id, seatId, studentId, c.kinds, c.enrolledIds, c.stale, c.ymd, c.term.start_date);
    });
    if (!r.ok) return r;
    seatApplyOps_('seat_assignments', r.plan.ops, user.email);
    return { ok: true, noop: !!r.plan.noop, warnings: seatWarningsFor_(r.data, [seatId], [studentId]) };
  });
}

/** 두 자리를 맞바꾼다(한쪽이 비면 이동). 관리자·학사 교사. expect = {자리id: token} 두 자리. 행 쓰기는 한 번에. */
function swapSeats(termId, seatA, seatB, expect) {
  var user = requirePermission_('seat.edit');
  seatA = String(seatA || ''); seatB = String(seatB || '');
  return withLock_(function () {
    var r = seatAssignCommon_(termId, [seatA, seatB], expect, function (c) {
      return planSeatSwap_(c.live, seatA, seatB, c.kinds, c.stale, c.ymd, c.term.id, c.term.start_date);
    });
    if (!r.ok) return r;
    seatApplyOps_('seat_assignments', r.plan.ops, user.email);
    var live = seatLiveAssignments_(readAll_('seat_assignments'), r.term.id);
    var at = function (id) { var x = seatAssignmentAt_(live, id, r.ymd).row; return x ? x.student_id : ''; };
    var warns = seatWarningsFor_(r.data, [seatA, seatB], [at(seatA), at(seatB)]);
    return { ok: true, noop: !!r.plan.noop, warnings: warns };
  });
}

/** 한 자리의 배정을 푼다(기준일 전날로 끝내기, 오늘 시작한 행이면 취소). 관리자·학사 교사. expect = {자리id: token} — 그사이 다른 학생이 옮겨 왔으면 거부. */
function unassignSeat(termId, seatId, expect) {
  var user = requirePermission_('seat.edit');
  seatId = String(seatId || '');
  return withLock_(function () {
    var r = seatAssignCommon_(termId, [seatId], expect, function (c) {
      var t = seatAssignmentAt_(c.live, seatId, c.ymd);
      if (t.bounded) return { ok: false, error: '날짜를 좁힌 배정이 있는 자리입니다(3단계에서 다룹니다).', ops: [] };
      if (!t.row) return { ok: false, error: '이미 비어 있는 자리입니다.', ops: [] };
      return { ok: true, ops: [seatEndOp_(t.row, c.ymd, c.term.start_date)] };   // 지난 기록은 남기고 기준일부터 비운다
    });
    if (!r.ok) return r;
    seatApplyOps_('seat_assignments', r.plan.ops, user.email);
    return { ok: true };
  });
}
