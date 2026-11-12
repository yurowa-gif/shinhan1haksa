/** R15 RoomRules — 방 초안(roomDraft_)·위반(roomViolations_)·정원 현황판(roomBoard_). 가짜 학생만. 2027-03-02 화. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/SeatRules.gs', 'src/rules/RoomRules.gs']);

const DAY = '2027-03-02';
let seq = 0;
const CH = (sid, value, effective_date) => ({ id: 'c' + (++seq), student_id: sid, item: '기숙사', value, effective_date: effective_date || '2027-03-01',
  status: '유효', requested_at: '', created_at: '', source: '명단업로드' });
const ROOM = (id, floor, room_no, gender, capacity, extra) => Object.assign({ id, floor: String(floor), room_no: String(room_no), gender, capacity: String(capacity), sort_order: '', status: '유효' }, extra || {});
const STU = (id, gender, grade) => ({ id, gender, grade: String(grade) });
const AV = (a, b, scope, status) => ({ id: 'av' + a + b, student_a: a, student_b: b, scope, status: status || '유효' });
const dormAll = (students) => students.map((s) => CH(s.id, '입실'));
const draft = (rooms, students, changes, avoids, seed) => plain(ctx.roomDraft_(rooms, students, changes, avoids || [], DAY, seed === undefined ? 's1' : seed));
const roomOf = (r, pid) => (r.assignments.find((a) => a.student_id === pid) || {}).room_id;
const occupants = (r, rid) => r.assignments.filter((a) => a.room_id === rid).map((a) => a.student_id).sort();

// 3층 1~4호·4층 5~12호 남(12방), 5층 13~19호·6층 20~27호·7층 28~35호 여(23방), 4인실 → 남 48·여 92
const FULL_ROOMS = [];
for (let n = 1; n <= 35; n++) {
  const floor = n <= 4 ? 3 : n <= 12 ? 4 : n <= 19 ? 5 : n <= 27 ? 6 : 7;
  FULL_ROOMS.push(ROOM('R' + n, floor, n, floor <= 4 ? '남' : '여', 4));
}
const FULL_STUDENTS = [];
for (let i = 0; i < 48; i++) FULL_STUDENTS.push(STU('m' + i, '남', 1 + (i % 3)));
for (let i = 0; i < 92; i++) FULL_STUDENTS.push(STU('f' + i, '여', 1 + (i % 3)));

test('가득 찬 경우(남 48·여 92, 35방 4인실): 모두 배정, 층 성별 맞음, 정원 그대로, 위반 0', () => {
  for (const seed of ['s1', 's2', 's3']) {
    const r = draft(FULL_ROOMS, FULL_STUDENTS, dormAll(FULL_STUDENTS), [], seed);
    assert.strictEqual(r.assignments.length, 140, seed);
    assert.deepStrictEqual([r.unplaced, r.warnings, r.violations], [[], [], []], seed);
    for (const room of FULL_ROOMS) {
      const ps = occupants(r, room.id);
      assert.strictEqual(ps.length, 4, room.id);
      assert.ok(ps.every((p) => (p[0] === 'm' ? '남' : '여') === room.gender), room.id);
    }
    const b = plain(ctx.roomBoard_(FULL_ROOMS, FULL_STUDENTS, r.assignments));
    assert.deepStrictEqual([b.total['남'].count, b.total['남'].capacity, b.total['남'].vacant, b.total['여'].count, b.total['여'].capacity, b.total['여'].vacant],
      [48, 48, 0, 92, 92, 0]);
    assert.deepStrictEqual(b.total['남'].byGrade, { 1: 16, 2: 16, 3: 16 });
    assert.deepStrictEqual(b.floors.map((f) => f.floor + f.gender + f.count), ['3남16', '4남32', '5여28', '6여32', '7여32']);
  }
});

test('같은 입력 + 같은 seed = 같은 결과(행 순서 무관), seed가 다르면 다른 초안이 나올 수 있다', () => {
  const a = draft(FULL_ROOMS, FULL_STUDENTS, dormAll(FULL_STUDENTS), [], 'x');
  const b = draft(FULL_ROOMS.slice().reverse(), FULL_STUDENTS.slice().reverse(), dormAll(FULL_STUDENTS).reverse(), [], 'x');
  assert.deepStrictEqual(a, b);
  const c = draft(FULL_ROOMS, FULL_STUDENTS, dormAll(FULL_STUDENTS), [], 'y');
  assert.notDeepStrictEqual(a.assignments, c.assignments);
});

test('기숙사생만: 그날 기숙사 입실인 학생만 배정(퇴실·기록 없음·입실 적용일이 아직인 학생 제외)', () => {
  const rooms = [ROOM('A', 3, 1, '남', 4)];
  const students = [STU('in', '남', 1), STU('out', '남', 2), STU('none', '남', 3), STU('later', '남', 1)];
  const changes = [CH('in', '입실'), CH('out', '입실'), CH('out', '퇴실', '2027-03-02'), CH('later', '입실', '2027-03-03')];
  const r = draft(rooms, students, changes);
  assert.deepStrictEqual(r.assignments, [{ room_id: 'A', student_id: 'in' }]);
  assert.deepStrictEqual(r.unplaced, []);
});

test('방마다 학년 섞기: 1학년 2명·2학년 2명, 2인실 두 개 → 두 방 모두 1·2학년 한 명씩(seed 여럿)', () => {
  const rooms = [ROOM('A', 3, 1, '남', 2), ROOM('B', 3, 2, '남', 2)];
  const students = [STU('a1', '남', 1), STU('b1', '남', 1), STU('a2', '남', 2), STU('b2', '남', 2)];
  for (let s = 0; s < 20; s++) {
    const r = draft(rooms, students, dormAll(students), [], 'g' + s);
    for (const rid of ['A', 'B']) assert.deepStrictEqual(occupants(r, rid).map((p) => p[1]).sort(), ['1', '2'], 'g' + s + rid);
    assert.deepStrictEqual(r.violations, []);
  }
});

test('떨어뜨릴 짝(방·둘 다)은 같은 방에 두지 않는다 — 좌석 짝·취소된 짝은 보지 않는다(seed 여럿)', () => {
  const rooms = [ROOM('A', 3, 1, '남', 2), ROOM('B', 3, 2, '남', 2)];
  // 학년 섞기만 보면 (a1,a2)(b1,b2)도 0점 → 짝 규칙이 있어야 (a1,b2)(b1,a2)
  const students = [STU('a1', '남', 1), STU('b1', '남', 1), STU('a2', '남', 2), STU('b2', '남', 2)];
  const avoids = [AV('a1', 'a2', '방'), AV('b1', 'b2', '둘 다')];
  for (let s = 0; s < 20; s++) {
    const r = draft(rooms, students, dormAll(students), avoids, 'p' + s);
    assert.notStrictEqual(roomOf(r, 'a1'), roomOf(r, 'a2'), 'p' + s);
    assert.notStrictEqual(roomOf(r, 'b1'), roomOf(r, 'b2'), 'p' + s);
    assert.deepStrictEqual(r.violations, []);
  }
  const placed = [{ room_id: 'A', student_id: 'a1' }, { room_id: 'A', student_id: 'a2' }];
  assert.deepStrictEqual(plain(ctx.roomViolations_(rooms, students, placed, [AV('a1', 'a2', '좌석'), AV('a2', 'a1', '방', '취소')])), []);
});

test('정원: 방 정원을 넘기지 않고, 남는 학생은 unplaced + 경고 / 성별이 맞는 방이 없어도 같다', () => {
  const rooms = [ROOM('A', 3, 1, '남', 2), ROOM('W', 5, 13, '여', 2)];
  const students = [STU('m1', '남', 1), STU('m2', '남', 2), STU('m3', '남', 3), STU('f1', '여', 1)];
  const r = draft(rooms, students, dormAll(students));
  assert.strictEqual(occupants(r, 'A').length, 2);
  assert.deepStrictEqual(occupants(r, 'W'), ['f1']);
  assert.strictEqual(r.unplaced.length, 1);
  assert.deepStrictEqual(r.warnings, [r.unplaced[0] + ' 학생: 들어갈 방이 없습니다(정원)']);
  const r2 = draft([ROOM('A', 3, 1, '남', 4), ROOM('E', 3, 2, '', 4)], [STU('f1', '여', 1), STU('x', '', 1)], [CH('f1', '입실'), CH('x', '입실')]);
  assert.deepStrictEqual([r2.assignments, r2.unplaced.sort()], [[], ['f1', 'x']]);   // 성별 빈 방은 아무도 받지 않는다(가정)
});

test('빈 방이 있으면 사람이 적은 방부터: 1·2학년 2명씩, 4인실 두 개 → 2명씩(seed 여럿)', () => {
  const rooms = [ROOM('A', 3, 1, '남', 4), ROOM('B', 3, 2, '남', 4)];
  const students = [STU('a1', '남', 1), STU('b1', '남', 1), STU('a2', '남', 2), STU('b2', '남', 2)];
  for (let s = 0; s < 20; s++) {
    const r = draft(rooms, students, dormAll(students), [], 'n' + s);
    assert.deepStrictEqual([occupants(r, 'A').length, occupants(r, 'B').length], [2, 2], 'n' + s);
  }
});

test('피할 수 없는 짝은 위반으로 남긴다 — 다른 성별 방·정원 넘는 자리로 옮겨 풀지 않는다(seed 여럿)', () => {
  const rooms = [ROOM('A', 3, 1, '남', 2), ROOM('B', 3, 2, '남', 2), ROOM('W', 5, 13, '여', 2)];
  const students = [STU('m1', '남', 1), STU('m2', '남', 2), STU('m3', '남', 3), STU('m4', '남', 4), STU('f1', '여', 1)];
  const avoids = [AV('m1', 'm2', '방'), AV('m1', 'm3', '방'), AV('m1', 'm4', '방')];
  for (let s = 0; s < 20; s++) {
    const r = draft(rooms, students, dormAll(students), avoids, 'u' + s);
    assert.deepStrictEqual(occupants(r, 'W'), ['f1'], 'u' + s);
    assert.deepStrictEqual([occupants(r, 'A').length, occupants(r, 'B').length], [2, 2], 'u' + s);
    assert.deepStrictEqual(r.violations.map((v) => v.kind), ['떨어뜨릴 짝'], 'u' + s);
  }
});

test('가득 찬 경우 + 떨어뜨릴 짝 30쌍(방·둘 다): 모두 배정하고 위반 0(seed 여럿)', () => {
  const avoids = [];
  for (let i = 0; i < 15; i++) avoids.push(AV('m' + i, 'm' + (i + 3), '방'), AV('f' + i, 'f' + (i * 2 + 1), '둘 다'));
  for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
    const r = draft(FULL_ROOMS, FULL_STUDENTS, dormAll(FULL_STUDENTS), avoids, seed);
    assert.deepStrictEqual([r.assignments.length, r.unplaced, r.violations], [140, [], []], seed);
  }
});

test('잘못된 날짜는 예외', () => {
  assert.throws(() => ctx.roomDraft_([], [], [], [], '2027-02-30', 's'), /날짜 형식/);
});

test('roomViolations_: 정원 초과·성별·같은 학년·떨어뜨릴 짝, 한 명 방은 학년 위반 아님(가정), 겹친 행은 한 번, 없는 방·명단 밖 학생은 건너뜀', () => {
  const rooms = [ROOM('A', 3, 1, '남', 2), ROOM('B', 3, 2, '남', 2), ROOM('C', 3, 3, '남', 2), ROOM('X', 3, 4, '남', 2, { status: '취소' })];
  const students = [STU('m1', '남', 1), STU('m2', '남', 1), STU('m3', '남', 2), STU('f1', '여', 2), STU('m4', '남', 3)];
  const as = [
    { room_id: 'A', student_id: 'm1' }, { room_id: 'A', student_id: 'm2' }, { room_id: 'A', student_id: 'm3' },   // 정원 초과(학년 섞임)
    { room_id: 'B', student_id: 'f1' }, { room_id: 'B', student_id: 'ghost' },                                       // 성별, 명단 밖
    { room_id: 'C', student_id: 'm4' }, { room_id: 'C', student_id: 'm4' }, { room_id: 'X', student_id: 'm4' },      // 한 명(같은 행 두 번), 취소된 방
  ];
  assert.deepStrictEqual(plain(ctx.roomViolations_(rooms, students, as, [AV('m1', 'm3', '둘 다')])), [
    { roomId: 'A', kind: '정원 초과', studentId: '' },
    { roomId: 'A', kind: '떨어뜨릴 짝', studentId: '' },
    { roomId: 'B', kind: '성별', studentId: 'f1' },
  ]);
  const same = [{ room_id: 'A', student_id: 'm1' }, { room_id: 'A', student_id: 'm2' }];
  assert.deepStrictEqual(plain(ctx.roomViolations_(rooms, students, same, [])), [{ roomId: 'A', kind: '같은 학년', studentId: '' }]);
});

test('roomBoard_: 방·층·성별 합계, 정원 초과는 인원 그대로(공석 0), 취소된 방·명단 밖 학생은 세지 않는다', () => {
  const rooms = [ROOM('A', 3, 1, '남', 2), ROOM('B', 3, 2, '남', 4), ROOM('W', 5, 13, '여', 4), ROOM('X', 3, 9, '남', 4, { status: '취소' })];
  const students = [STU('m1', '남', 1), STU('m2', '남', 2), STU('m3', '남', 2), STU('f1', '여', 3)];
  const as = [{ room_id: 'A', student_id: 'm1' }, { room_id: 'A', student_id: 'm2' }, { room_id: 'A', student_id: 'm3' },
    { room_id: 'W', student_id: 'f1' }, { room_id: 'W', student_id: 'ghost' }, { room_id: 'X', student_id: 'm1' }];
  const b = plain(ctx.roomBoard_(rooms, students, as));
  assert.deepStrictEqual(b.rooms.map((r) => [r.roomId, r.count, r.vacant]), [['A', 3, 0], ['B', 0, 4], ['W', 1, 3]]);
  assert.deepStrictEqual(b.floors, [
    { floor: '3', gender: '남', capacity: 6, count: 3, vacant: 4, byGrade: { 1: 1, 2: 2 } },
    { floor: '5', gender: '여', capacity: 4, count: 1, vacant: 3, byGrade: { 3: 1 } },
  ]);
  assert.deepStrictEqual(Object.keys(b.total).sort(), ['남', '여']);
});
