/** C6 좌석 격자·수동 배치: 순수 함수 + 서버 함수(가짜 서비스, 가짜 1단계 데이터 시드) */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const FILES = ['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/dev/FakeData.gs',
  'src/dev/FakeSeats.gs', 'src/dev/FakeStage1.gs', 'src/features/Roster.gs', 'src/features/Seats.gs'];
const pure = loadGs(FILES);
const fake = plain(pure.buildFakeData_({}));
const s1 = plain(pure.buildFakeStage1_(fake));
const TERM = s1.term;

/* ───── 좌석표 붙여넣기 ───── */

const parse = (t) => plain(pure.parseSeatGridTsv_(t));

test('parseSeatGridTsv_: 공석·"1. 이름"=좌석, 기둥·비상문·창문, 빈칸=통로, 이름 칸 수를 센다', () => {
  const g = parse('공석\t1. 김가온\t\t기둥\n2. 이나래\t공석\t비상문\t창문');
  assert.deepStrictEqual(g.errors, []);
  assert.strictEqual(g.rows, 2); assert.strictEqual(g.cols, 4);
  assert.strictEqual(g.seatCount, 4); assert.strictEqual(g.namedCount, 2);
  assert.deepStrictEqual(g.cells.map((c) => c.row + ',' + c.col + ':' + c.kind),
    ['1,1:좌석', '1,2:좌석', '1,4:기둥', '2,1:좌석', '2,2:좌석', '2,3:비상문', '2,4:창문']);
});

test('parseSeatGridTsv_: 알 수 없는 칸은 행·열 위치로, 빈 표·너무 큰 표는 거부(나쁜 입력)', () => {
  const g = parse('공석\t아무말\n공석\t공석');
  assert.strictEqual(g.errors.length, 1);
  assert.deepStrictEqual([g.errors[0].line, g.errors[0].column], [1, 2]);
  assert.ok(g.errors[0].message.includes('1행 2열'));
  assert.strictEqual(parse('').errors.length, 1);
  assert.strictEqual(parse('\t\t\n\t').errors.length, 1, '칸이 하나도 없음');
  const tall = Array.from({ length: 41 }, () => '공석').join('\n');
  assert.ok(parse(tall).errors.some((e) => e.message.includes('행이')));
  const wide = Array.from({ length: 31 }, () => '공석').join('\t');
  assert.ok(parse(wide).errors.some((e) => e.message.includes('열이')));
  assert.ok(parse('공석,1. 가').errors.length === 0, 'CSV도 받는다');
});

test('seatLabelsFor_: 좌석만 행 우선으로 1부터, 기둥 등은 번호 없음', () => {
  const l = plain(pure.seatLabelsFor_([{ row: 2, col: 1, kind: '좌석' }, { row: 1, col: 3, kind: '기둥' }, { row: 1, col: 2, kind: '좌석' }, { row: 1, col: 1, kind: '좌석' }]));
  assert.deepStrictEqual(l, { '1,1': '1', '1,2': '2', '2,1': '3' });
});

/* ───── 격자 저장 계획 ───── */

const ex = (id, row, col, kind, label) => ({ id, row, col, kind, label });
const gp = (existing, desired, assigned, rows, cols) => plain(pure.seatGridPlan_(existing, desired, assigned || [], rows || 3, cols || 3));

test('seatGridPlan_: 새 칸·바뀐 종류·없앤 칸을 만들고 번호를 다시 매긴다', () => {
  const existing = [ex('a', 1, 1, '좌석', '1'), ex('b', 1, 2, '좌석', '2'), ex('c', 1, 3, '기둥', '')];
  const p = gp(existing, [{ row: 1, col: 1, kind: '좌석' }, { row: 1, col: 2, kind: '기둥' }, { row: 2, col: 1, kind: '좌석' }, { row: 1, col: 3, kind: '창문' }]);
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.create, [{ row: '2', col: '1', kind: '좌석', label: '2', status: '유효' }]);
  assert.deepStrictEqual(p.update, [{ id: 'b', patch: { kind: '기둥', label: '' } }, { id: 'c', patch: { kind: '창문' } }]);
  assert.deepStrictEqual(p.cancel, []);
  const rm = gp(existing, [{ row: 1, col: 1, kind: '좌석' }]);
  assert.deepStrictEqual(rm.cancel.map((c) => c.id), ['b', 'c']);
  assert.ok(rm.cancel.every((c) => c.patch.status === '취소'), '지우지 않고 취소');
});

test('seatGridPlan_: 같은 모양이면 바뀐 것 0건(멱등)', () => {
  const existing = [ex('a', 1, 1, '좌석', '1'), ex('b', 1, 2, '기둥', '')];
  const p = gp(existing, [{ row: 1, col: 1, kind: '좌석' }, { row: 1, col: 2, kind: '기둥' }]);
  assert.deepStrictEqual([p.create.length, p.update.length, p.cancel.length], [0, 0, 0]);
});

test('seatGridPlan_: 학생이 앉은 좌석을 바꾸거나 없애면 거부하고, 앞 번호가 밀리면 번호만 고친다(나쁜 입력)', () => {
  const existing = [ex('a', 1, 1, '좌석', '1'), ex('b', 1, 2, '좌석', '2')];
  const noSeat = gp(existing, [{ row: 1, col: 1, kind: '기둥' }, { row: 1, col: 2, kind: '좌석' }], ['a']);
  assert.strictEqual(noSeat.ok, false); assert.ok(noSeat.errors[0].includes('1행 1열') && noSeat.errors[0].includes('배정을 풀어'));
  const gone = gp(existing, [{ row: 1, col: 2, kind: '좌석' }], ['a']);
  assert.strictEqual(gone.ok, false);
  const shift = gp(existing, [{ row: 1, col: 1, kind: '창문' }, { row: 1, col: 2, kind: '좌석' }], ['b']);
  assert.strictEqual(shift.ok, true, '앞 번호가 밀리는 것만으로는 거부하지 않는다');
  assert.deepStrictEqual(shift.update.find((u) => u.id === 'b').patch, { label: '1' });
  const out = gp(existing, [{ row: 9, col: 9, kind: '좌석' }, { row: 1, col: 1, kind: '아무거나' }]);
  assert.strictEqual(out.ok, false); assert.strictEqual(out.errors.length, 2);
});

/* ───── 배정·맞바꾸기 계획 ───── */

const kinds = { s1: '좌석', s2: '좌석', s3: '좌석', p: '기둥' };
const A = (id, seat, stu, extra) => Object.assign({ id, seat_id: seat, student_id: stu, term_id: 'T', status: '배정', valid_from: '', valid_to: '' }, extra || {});
const asg = (live, seat, stu, enrolled, stale) => plain(pure.planSeatAssign_(live, 'T', seat, stu, kinds, enrolled || ['x', 'y', 'z'], stale || []));
const swp = (live, a, b, stale) => plain(pure.planSeatSwap_(live, a, b, kinds, stale || []));

test('planSeatAssign_: 빈 자리에 새로 배정, 이미 다른 자리면 그 행을 옮긴다', () => {
  assert.deepStrictEqual(asg([], 's1', 'x').ops, [{ op: 'create', row: { term_id: 'T', seat_id: 's1', student_id: 'x', valid_from: '', valid_to: '', status: '배정', memo: '' } }]);
  assert.deepStrictEqual(asg([A('r1', 's2', 'x')], 's1', 'x').ops, [{ op: 'update', id: 'r1', patch: { seat_id: 's1' } }]);
  assert.strictEqual(asg([A('r1', 's1', 'x')], 's1', 'x').noop, true);
});

test('planSeatAssign_: 앉은 자리·좌석 아닌 칸·미등록 학생·날짜 좁힌 배정은 거부(나쁜 입력)', () => {
  assert.ok(asg([A('r1', 's1', 'y')], 's1', 'x').error.includes('이미 학생이 배정'));
  assert.ok(asg([], 'p', 'x').error.includes('좌석이 아닌'));
  assert.ok(asg([], 's1', 'nobody').error.includes('등록된 학생이 아닙니다'));
  assert.ok(asg([A('r1', 's1', 'y', { valid_from: '2027-07-20' })], 's1', 'x').error.includes('날짜를 좁힌'));
  assert.ok(asg([A('r1', 's2', 'x', { valid_to: '2027-07-20' })], 's1', 'x').error.includes('날짜를 좁힌'));
});

test('planSeatAssign_: 퇴실한 학생의 배정만 남은 자리(stale)에는 이전 배정을 취소하고 앉힌다', () => {
  const p = asg([A('old', 's1', 'y')], 's1', 'x', null, ['s1']);
  assert.deepStrictEqual(p.ops, [{ op: 'cancel', id: 'old' }, { op: 'create', row: { term_id: 'T', seat_id: 's1', student_id: 'x', valid_from: '', valid_to: '', status: '배정', memo: '' } }]);
  const mv = asg([A('old', 's1', 'y'), A('mine', 's2', 'x')], 's1', 'x', null, ['s1']);
  assert.deepStrictEqual(mv.ops, [{ op: 'cancel', id: 'old' }, { op: 'update', id: 'mine', patch: { seat_id: 's1' } }]);
  assert.ok(asg([A('old', 's1', 'y')], 's1', 'x').error, 'stale가 아니면(입실 전 등) 거부');
});

test('planSeatSwap_: 둘 다 앉음→학생 맞바꿈, 한쪽만→이동, 둘 다 빔→할 일 없음', () => {
  assert.deepStrictEqual(swp([A('r1', 's1', 'x'), A('r2', 's2', 'y')], 's1', 's2').ops,
    [{ op: 'update', id: 'r1', patch: { student_id: 'y' } }, { op: 'update', id: 'r2', patch: { student_id: 'x' } }]);
  assert.deepStrictEqual(swp([A('r1', 's1', 'x')], 's1', 's3').ops, [{ op: 'update', id: 'r1', patch: { seat_id: 's3' } }]);
  assert.deepStrictEqual(swp([A('r1', 's1', 'x')], 's3', 's1').ops, [{ op: 'update', id: 'r1', patch: { seat_id: 's3' } }], '순서가 바뀌어도 같다');
  assert.strictEqual(swp([], 's1', 's2').noop, true);
});

test('planSeatSwap_: 같은 자리·기둥·날짜 좁힌 배정은 거부, 퇴실 자리(stale)는 빈 자리로 보고 이전 배정을 취소한다', () => {
  assert.ok(swp([], 's1', 's1').error); assert.ok(swp([], 's1', 'p').error);
  assert.ok(swp([A('r1', 's1', 'x', { valid_from: '2027-07-20' })], 's1', 's2').error.includes('날짜를 좁힌'));
  const p = swp([A('r1', 's1', 'x'), A('gone', 's2', 'y')], 's1', 's2', ['s2']);
  assert.deepStrictEqual(p.ops, [{ op: 'cancel', id: 'gone' }, { op: 'update', id: 'r1', patch: { seat_id: 's2' } }]);
  assert.strictEqual(swp([A('gone', 's2', 'y')], 's1', 's2', ['s2']).noop, true, '앉은 사람이 없으면 할 일 없음');
});

test('seatGenderWarning_: 성별 구역이 어긋날 때만 경고, 혼성은 없음', () => {
  assert.strictEqual(pure.seatGenderWarning_({ gender: '혼성', name: '1층' }, { gender: '여', name: '가' }), '');
  assert.strictEqual(pure.seatGenderWarning_({ gender: '남', name: 'SA1실' }, { gender: '남', name: '가' }), '');
  assert.ok(pure.seatGenderWarning_({ gender: '남', name: 'SA1실' }, { gender: '여', name: '가학생' }).includes('SA1실'));
});

/* ───── 서버 함수(가짜 서비스) ───── */

function makeServer(email, roles, today) {
  const db = {
    terms: fake.terms.map((t) => Object.assign({}, t)), students: fake.students.map((s) => Object.assign({}, s)),
    enrollments: fake.enrollments.map((e) => Object.assign({}, e)), status_changes: s1.statusChanges.map((r) => Object.assign({}, r)),
    spaces: s1.spaces.map((r) => Object.assign({}, r)), seats: s1.seats.map((r) => Object.assign({}, r)),
    seat_assignments: s1.seatAssignments.map((r) => Object.assign({}, r)),
    users: [{ id: 'u0', email, active: 'TRUE', roles: roles.join(','), name: '가짜교사', homeroom_class: '' }]
  };
  const denied = [], writes = [];
  let uid = 0, depth = 0;
  const copy = (r) => Object.assign({}, r);
  const c = loadGs(FILES, {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    readAll_: (n) => (db[n] || []).map(copy), invalidate_: () => {}, today_: () => today || '2027-03-20',
    logDenied_: (who, action) => denied.push(action),
    withLock_: (fn) => { depth++; try { return fn(); } finally { depth--; } },
    appendRecord_: (sheet, rec) => { assert.ok(depth > 0, '쓰기는 락 안에서'); const r = Object.assign({ id: 'n' + (++uid) }, rec); db[sheet].push(r); writes.push('+' + sheet); return r; },
    updateRecord_: (sheet, id, patch) => { assert.ok(depth > 0, '쓰기는 락 안에서'); Object.assign(db[sheet].find((r) => r.id === id), patch); writes.push('~' + sheet); return {}; },
    bulkAppend_: (sheet, rows) => { assert.ok(depth > 0); rows.forEach((r) => db[sheet].push(Object.assign({ id: 'n' + (++uid) }, r))); if (rows.length) writes.push('+' + sheet + ':' + rows.length); },
    bulkUpdateRecords_: (sheet, patches) => { assert.ok(depth > 0); patches.forEach((p) => Object.assign(db[sheet].find((r) => r.id === p.id), p.patch)); if (patches.length) writes.push('~' + sheet + ':' + patches.length); return patches.length; }
  });
  return { c, db, denied, writes };
}
const admin = (today) => makeServer('admin@example.com', ['admin'], today);
const data = (s) => plain(s.c.getSeatData(TERM.id));
const cellsOf = (d, name) => d.spaces.find((x) => x.name === name).cells;
const seatOfStudent = (d, sid) => { for (const sp of d.spaces) for (const c of sp.cells) if (c.studentId === sid) return c; return null; };

test('getSeatData: 공간 7개, 1층 146석·남 SA 17·여 SA 34, 기둥·비상문·창문은 칸 종류로', () => {
  const d = data(admin());
  assert.strictEqual(d.spaces.length, 7);
  const seatCount = (pred) => d.spaces.filter(pred).reduce((n, sp) => n + sp.cells.filter((c) => c.kind === 'seat').length, 0);
  assert.strictEqual(seatCount((sp) => sp.name === '1층 자습실'), 146);
  assert.strictEqual(seatCount((sp) => sp.gender === '남'), 17);
  assert.strictEqual(seatCount((sp) => sp.gender === '여'), 34);
  const kindsSeen = new Set(cellsOf(d, '1층 자습실').map((c) => c.kind));
  assert.deepStrictEqual([...kindsSeen].sort(), ['door', 'pillar', 'seat', 'window']);
  assert.strictEqual(d.ymd, '2027-03-20'); assert.strictEqual(d.term.id, TERM.id);
});

test('getSeatData: 앉은 학생은 "학년. 이름", 퇴실 학생 자리는 공석(퇴실)+배정자 표시, 중도 입실자는 미배정 목록', () => {
  const d = data(admin());
  assert.ok(seatOfStudent(d, s1.leaverId) === null, '퇴실한 학생은 앉아 있지 않다');
  const held = d.spaces.flatMap((sp) => sp.cells).find((c) => c.reason === '퇴실');
  assert.ok(held && held.vacant && held.hold, '퇴실 자리는 공석이고 누가 배정돼 있었는지 보인다');
  assert.deepStrictEqual(d.unseated.map((u) => u.id), [s1.lateEntrantId]);
  assert.ok(/^\d\. /.test(d.unseated[0].display));
  const sitting = d.spaces.flatMap((sp) => sp.cells).filter((c) => c.studentId);
  assert.strictEqual(sitting.length, 28, '30명 − 퇴실 1 − 미배정 1');
  assert.ok(sitting.every((c) => /^\d\. \S+/.test(c.text)));
  const before = plain(admin('2027-03-03').c.getSeatData(TERM.id));
  assert.strictEqual(before.unseated.length, 0, '3월 3일에는 중도 입실자가 아직 입실 전이라 미배정 목록에 없다');
  assert.ok(!JSON.stringify(d).includes('example.com'), '이메일을 내보내지 않는다');
});

test('assignSeat: 중도 입실자를 빈 자리에 앉히면 미배정 목록에서 빠지고, 앉은 자리·퇴실 자리 규칙을 지킨다', () => {
  const s = admin();
  const d = data(s);
  const sa = cellsOf(d, '1층 자습실').find((c) => c.kind === 'seat' && c.vacant && !c.hold);   // 가짜 30명으로는 1층 대부분이 비어 있다
  const r = plain(s.c.assignSeat(TERM.id, sa.id, s1.lateEntrantId));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.db.seat_assignments.filter((a) => a.student_id === s1.lateEntrantId && a.status === '배정').length, 1);
  const d2 = data(s);
  assert.strictEqual(seatOfStudent(d2, s1.lateEntrantId).id, sa.id);
  assert.strictEqual(d2.unseated.length, 0);
  // 앉은 자리에 또 앉히기 → 거부, 쓰기 없음
  const w = s.writes.length;
  const sitting = d2.spaces.flatMap((sp) => sp.cells).find((c) => c.studentId && c.studentId !== s1.lateEntrantId);
  const bad = plain(s.c.assignSeat(TERM.id, sitting.id, s1.lateEntrantId));
  assert.strictEqual(bad.ok, false); assert.ok(bad.error.includes('이미'));
  assert.strictEqual(s.writes.length, w);
});

test('assignSeat: 퇴실한 학생 자리에 앉히면 이전 배정은 취소(행은 남음)하고 새로 배정한다', () => {
  const s = admin();
  const held = data(s).spaces.flatMap((sp) => sp.cells).find((c) => c.reason === '퇴실');
  const old = s.db.seat_assignments.find((a) => a.seat_id === held.id && a.status === '배정');
  const total = s.db.seat_assignments.length;
  assert.strictEqual(plain(s.c.assignSeat(TERM.id, held.id, s1.lateEntrantId)).ok, true);
  assert.strictEqual(s.db.seat_assignments.find((a) => a.id === old.id).status, '취소');
  assert.strictEqual(s.db.seat_assignments.length, total + 1, '지우지 않고 한 행만 늘었다');
  assert.strictEqual(seatOfStudent(data(s), s1.lateEntrantId).id, held.id);
});

test('assignSeat: 성별 구역이 어긋나면 배정은 되고 경고를 돌려준다', () => {
  const s = admin();
  s.db.students.find((x) => x.id === s1.lateEntrantId).gender = '여';
  const saMale = data(s).spaces.find((sp) => sp.name === 'SA1실').cells.find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  const r = plain(s.c.assignSeat(TERM.id, saMale.id, s1.lateEntrantId));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.warnings.length, 1); assert.ok(r.warnings[0].includes('SA1실'));
});

test('swapSeats: 두 학생을 맞바꾸고(배정 행 제자리 수정), 빈 자리로 옮기고, 둘 다 비면 아무것도 안 쓴다', () => {
  const s = admin();
  const d = data(s);
  const [a, b] = d.spaces[0].cells.filter((c) => c.studentId).slice(0, 2);
  const total = s.db.seat_assignments.length;
  const r = plain(s.c.swapSeats(TERM.id, a.id, b.id));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.db.seat_assignments.length, total, '행이 늘지 않는다');
  const d2 = data(s);
  assert.strictEqual(seatOfStudent(d2, a.studentId).id, b.id);
  assert.strictEqual(seatOfStudent(d2, b.studentId).id, a.id);
  assert.strictEqual(s.writes.filter((w) => w === '~seat_assignments').length, 2, '두 행 수정이 한 락 안에서');
  // 빈 자리로 이동: a 자리에는 지금 b의 학생이 앉아 있다 → 빈 자리로 옮긴다
  const empty = d2.spaces.filter((sp) => sp.name.startsWith('SA')).flatMap((sp) => sp.cells).find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  const mv = plain(s.c.swapSeats(TERM.id, a.id, empty.id));
  assert.strictEqual(mv.ok, true);
  const d3 = data(s);
  assert.strictEqual(seatOfStudent(d3, b.studentId).id, empty.id, 'a 자리에 있던 학생이 빈 자리로 옮겨 감');
  assert.strictEqual(seatOfStudent(d3, a.studentId).id, b.id, '다른 학생은 그대로');
  assert.strictEqual(data(s).spaces.flatMap((sp) => sp.cells).find((c) => c.id === a.id).vacant, true);
  const w = s.writes.length;
  const e2 = data(s).spaces.filter((sp) => sp.name.startsWith('SA')).flatMap((sp) => sp.cells).filter((c) => c.kind === 'seat' && c.vacant && !c.hold).slice(0, 2);
  assert.strictEqual(plain(s.c.swapSeats(TERM.id, e2[0].id, e2[1].id)).noop, true);
  assert.strictEqual(s.writes.length, w);
  assert.strictEqual(plain(s.c.swapSeats(TERM.id, a.id, a.id)).ok, false);
});

test('swapSeats: 학생이 퇴실 자리로 옮겨 가면 이전 배정을 취소한다', () => {
  const s = admin();
  const d = data(s);
  const held = d.spaces.flatMap((sp) => sp.cells).find((c) => c.reason === '퇴실');
  const who = d.spaces[0].cells.find((c) => c.studentId);
  const oldRow = s.db.seat_assignments.find((a) => a.seat_id === held.id && a.status === '배정');
  assert.strictEqual(plain(s.c.swapSeats(TERM.id, who.id, held.id)).ok, true);
  assert.strictEqual(s.db.seat_assignments.find((a) => a.id === oldRow.id).status, '취소');
  assert.strictEqual(seatOfStudent(data(s), who.studentId).id, held.id);
});

test('unassignSeat: 배정을 취소 상태로 바꾸고 미배정 목록으로 돌려보낸다. 빈 자리는 거부', () => {
  const s = admin();
  const c = data(s).spaces[0].cells.find((x) => x.studentId);
  assert.strictEqual(plain(s.c.unassignSeat(TERM.id, c.id)).ok, true);
  assert.strictEqual(s.db.seat_assignments.filter((a) => a.student_id === c.studentId).every((a) => a.status === '취소'), true);
  assert.ok(data(s).unseated.some((u) => u.id === c.studentId));
  assert.strictEqual(plain(s.c.unassignSeat(TERM.id, c.id)).ok, false, '이미 빈 자리');
});

test('권한: 배정은 관리자·학사 교사만, 격자 편집은 관리자만, 보기는 교사 역할(담임은 보기만), 학생·학부모는 모두 거부', () => {
  const run = (roles, fn) => { const s = makeServer('x@example.com', roles); return { s, out: (() => { try { return fn(s); } catch (e) { return e; } })() }; };
  const seatId = admin().db.seats.find((x) => x.kind === '좌석').id;
  const assignFns = [(s) => s.c.assignSeat(TERM.id, seatId, s1.lateEntrantId), (s) => s.c.swapSeats(TERM.id, seatId, seatId), (s) => s.c.unassignSeat(TERM.id, seatId)];
  const layoutFns = [(s) => s.c.saveSpace({ name: 'x', gender: '혼성', rows: 2, cols: 2 }), (s) => s.c.saveSpaceGrid('x', []), (s) => s.c.previewSeatGrid('공석'), (s) => s.c.importSeatGrid('공석', { name: 'x', gender: '혼성' })];
  for (const roles of [['homeroom'], ['attendance'], ['duty_manager'], ['student'], ['parent']]) {
    for (const fn of assignFns) { const { s, out } = run(roles, fn); assert.ok(out && /권한이 없습니다/.test(out.message), roles + ' 배정'); assert.deepStrictEqual(s.writes, []); assert.strictEqual(s.denied[0], 'seat.edit'); }
  }
  for (const roles of [['hall_teacher'], ['homeroom'], ['attendance'], ['duty_manager'], ['student'], ['parent']]) {
    for (const fn of layoutFns) { const { s, out } = run(roles, fn); assert.ok(out && /권한이 없습니다/.test(out.message), roles + ' 격자'); assert.deepStrictEqual(s.writes, []); assert.strictEqual(s.denied[0], 'seat.layout'); }
  }
  for (const roles of [['student'], ['parent']]) assert.throws(() => makeServer('s@example.com', roles).c.getSeatData(TERM.id), /권한이 없습니다/);
  const ht = plain(makeServer('t@example.com', ['hall_teacher']).c.getSeatData(TERM.id));
  assert.deepStrictEqual([ht.canEdit, ht.canLayout], [true, false]);
  const hr = plain(makeServer('h@example.com', ['homeroom']).c.getSeatData(TERM.id));
  assert.deepStrictEqual([hr.canEdit, hr.canLayout], [false, false]);
  assert.deepStrictEqual([data(admin()).canEdit, data(admin()).canLayout], [true, true]);
  // 학사 교사는 실제로 배정할 수 있다
  const t = makeServer('t@example.com', ['hall_teacher']);
  const sa = data(t).spaces.find((sp) => sp.name === 'SA3실').cells.find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  assert.strictEqual(plain(t.c.assignSeat(TERM.id, sa.id, s1.lateEntrantId)).ok, true);
});

test('saveSpace: 입력 검사, 새 공간은 마지막 순서, 크기를 줄일 때 밖에 칸이 있으면 거부', () => {
  const s = admin();
  const err = (o) => plain(s.c.saveSpace(o)).errors.map((e) => e.field);
  assert.deepStrictEqual(err({}), ['name', 'gender', 'rows', 'cols']);
  assert.deepStrictEqual(err({ name: '1층 자습실', gender: '혼성', rows: 3, cols: 3 }), ['name'], '같은 이름');
  assert.deepStrictEqual(err({ name: 'X', gender: '혼성', rows: 99, cols: 3 }), ['rows']);
  assert.deepStrictEqual(err({ name: 'X', gender: '혼성', rows: 2.5, cols: 3 }), ['rows']);
  assert.deepStrictEqual(s.writes, []);
  const r = plain(s.c.saveSpace({ name: 'SA7실', gender: '여', rows: 5, cols: 2 }));
  assert.strictEqual(r.ok, true);
  const created = s.db.spaces.find((x) => x.id === r.id);
  assert.strictEqual(created.sort_order, '8'); assert.strictEqual(created.status, '유효');
  const floor = s.db.spaces.find((x) => x.name === '1층 자습실');
  const shrink = plain(s.c.saveSpace({ id: floor.id, name: '1층 자습실', gender: '혼성', rows: 5, cols: 12 }));
  assert.strictEqual(shrink.ok, false); assert.ok(shrink.errors[0].message.includes('크기 밖'));
  assert.strictEqual(plain(s.c.saveSpace({ id: floor.id, name: '1층 자습실(새)', gender: '혼성', rows: 20, cols: 12 })).ok, true);
});

test('saveSpaceGrid: 같은 모양으로 다시 저장하면 바뀐 것 0건, 빈 좌석은 없앨 수 있고 번호가 다시 매겨진다, 앉은 좌석은 거부', () => {
  const s = admin();
  const d = data(s);
  const sp = d.spaces.find((x) => x.name === 'SA3실');
  const toKo = { seat: '좌석', pillar: '기둥', door: '비상문', window: '창문' };
  const same = sp.cells.map((c) => ({ row: c.row, col: c.col, kind: toKo[c.kind] }));
  assert.deepStrictEqual(plain(s.c.saveSpaceGrid(sp.id, same)), { ok: true, created: 0, updated: 0, cancelled: 0 });
  // 빈 좌석 하나를 없앤다
  const emptySeat = sp.cells.filter((c) => c.kind === 'seat' && c.vacant && !c.hold)[0];
  const less = same.filter((c) => !(c.row === emptySeat.row && c.col === emptySeat.col));
  const r = plain(s.c.saveSpaceGrid(sp.id, less));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.cancelled, 1);
  assert.strictEqual(s.db.seats.find((x) => x.id === emptySeat.id).status, '취소', '지우지 않고 취소');
  const labels = s.db.seats.filter((x) => x.space_id === sp.id && x.status === '유효' && x.kind === '좌석').map((x) => +x.label).sort((a, b) => a - b);
  assert.deepStrictEqual(labels, labels.map((_, i) => i + 1), '번호는 1부터 빈틈없이');
  // 앉은 좌석을 없애려 하면 거부(1층에서)
  const floor = d.spaces[0];
  const seated = floor.cells.find((c) => c.studentId);
  const bad = plain(s.c.saveSpaceGrid(floor.id, floor.cells.filter((c) => c.id !== seated.id).map((c) => ({ row: c.row, col: c.col, kind: toKo[c.kind] }))));
  assert.strictEqual(bad.ok, false); assert.ok(bad.errors[0].includes('배정을 풀어'));
});

test('importSeatGrid: 새 공간과 좌석을 만들고 이름은 버린다 / 오류·이름 중복은 쓰기 0건', () => {
  const s = admin();
  const text = '1. 김가온\t공석\t기둥\n공석\t\t창문';
  const p = plain(s.c.previewSeatGrid(text));
  assert.deepStrictEqual([p.ok, p.rows, p.cols, p.seatCount, p.namedCount], [true, 2, 3, 3, 1]);
  assert.strictEqual(s.writes.length, 0, '미리보기는 쓰지 않는다');
  const r = plain(s.c.importSeatGrid(text, { name: 'SA7실', gender: '여' }));
  assert.deepStrictEqual([r.ok, r.seats, r.ignoredNames], [true, 3, 1]);
  const sp = s.db.spaces.find((x) => x.name === 'SA7실');
  const seats = s.db.seats.filter((x) => x.space_id === sp.id);
  assert.deepStrictEqual(seats.map((x) => x.kind + ':' + x.label), ['좌석:1', '좌석:2', '기둥:', '좌석:3', '창문:']);
  assert.ok(!JSON.stringify(seats).includes('김가온'), '이름은 저장하지 않는다');
  const w = s.writes.length;
  assert.strictEqual(plain(s.c.importSeatGrid('공석\t아무말', { name: 'SA8실', gender: '여' })).ok, false);
  assert.strictEqual(plain(s.c.importSeatGrid(text, { name: 'SA7실', gender: '여' })).ok, false, '이름 중복');
  assert.strictEqual(plain(s.c.importSeatGrid(text, { name: 'SA9실', gender: '??' })).ok, false);
  assert.strictEqual(s.writes.length, w);
});

test('화면 라우팅: seats 화면은 교사 역할만 열 수 있다', () => {
  const r = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/Code.gs']);
  for (const role of ['admin', 'hall_teacher', 'attendance', 'homeroom', 'duty_manager']) assert.strictEqual(plain(r.screenResolve_('seats', [role])).ok, true, role);
  for (const role of ['student', 'parent']) assert.strictEqual(plain(r.screenResolve_('seats', [role])).ok, false, role);
});
