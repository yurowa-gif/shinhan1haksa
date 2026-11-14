/**
 * T4c 변이 점검에서 살아남은 가드를 잡는 시험(짝·방·좌석 초안). 가짜 데이터만.
 * - A5 짝 추가: 학생 A가 이번 기간 미등록이면 거부
 * - R9 방 저장: 끝난 기간이면 거부(미리보기 쪽 거부와 따로)
 * - R12 방: 끝난 배정 행(valid_to < 기준일)은 살아 있는 배정이 아니다(다시 옮길 때 이미 끝난 행의 끝 날짜를 고쳐 쓰지 않는다)
 * - S9·R13 짝 위반 avoid.view 판정: 지금 역할표에서는 seat.edit·room.edit ⊂ avoid.view라 닿지 않는다.
 *   그 실행에서만 permissions_를 바꿔(학사 교사에게서 avoid.view를 뺌) 판정이 역할표를 따르는지 본다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com';
const TODAY = '2027-03-09';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = HALL;
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage3());
  env.strictLock = true;
  return env;
}

const termOf = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');

/** 이 실행에서만 avoid.view를 관리자 전용으로 바꿔 fn(c)를 부른다(학사 교사는 seat.edit·room.edit는 그대로, avoid.view만 없음) */
function withoutAvoidView(env, who, fn) {
  return env.as(who, (c) => {
    const orig = c.permissions_;
    c.permissions_ = function () { const p = orig(); p['avoid.view'] = { roles: ['admin'] }; return p; };
    return JSON.stringify(fn(c));
  });
}

test('짝 추가: 학생 A가 이번 기간 미등록이면 studentA 오류, 쓰기 없음(B 쪽 검사와 따로)', () => {
  const env = seededEnv();
  const term = termOf(env);
  const enrolled = new Set(env.rows('enrollments').filter((e) => e.term_id === term.id).map((e) => e.student_id));
  // 시드에는 이번 기간 미등록 학생이 없어 하나 만든다(가짜 이름, 등록 행 없음)
  const outId = env.as(ADMIN, (c) => c.appendRecord_('students', { name: '미등록 시험 학생', grade: '2', class_no: '9', number: '99', gender: '남', status: '재학', memo: '가짜 데이터' }, ADMIN).id);
  const out = env.rows('students').find((s) => s.id === outId && !enrolled.has(s.id));
  const inn = env.rows('students').find((s) => enrolled.has(s.id));
  assert.ok(out && inn, '이번 기간 미등록 학생·등록 학생이 시드에 있다');
  const n = env.rows('avoid_pairs').length;
  const r = plain(env.call(HALL, 'saveAvoidPair', { studentA: out.id, studentB: inn.id, scope: '좌석' }));
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.strictEqual(r.errors[0].field, 'studentA', JSON.stringify(r));
  assert.strictEqual(env.rows('avoid_pairs').length, n, '쓰기 없음');
  // 같은 학생을 B로 넣어도 거부(대조)
  assert.strictEqual(plain(env.call(HALL, 'saveAvoidPair', { studentA: inn.id, studentB: out.id, scope: '좌석' })).errors[0].field, 'studentB');
});

test('방 저장: 끝난 기간이면 거부하고 room_assignments는 그대로(화면 token이 맞아도)', () => {
  const env = seededEnv();
  const term = termOf(env);
  // 한 학생을 같은 성별의 다른 방으로 옮기는 계획(막는 위반 없음) → 기간이 끝난 뒤 저장 시도
  const rooms = Object.fromEntries(env.rows('rooms').map((r) => [r.id, r]));
  const g = plain(env.call(HALL, 'getRoomData', term.id));
  const plan = g.rooms.flatMap((r) => r.members.map((m) => ({ room_id: r.id, student_id: m.id })));
  assert.ok(plan.length >= 2, '방 배정이 있다');
  const mover = plan.find((a) => g.rooms.some((r) => r.id !== a.room_id && r.gender === rooms[a.room_id].gender && r.count < Number(r.capacity)));
  assert.ok(mover, '옮길 수 있는 학생');
  const target = g.rooms.find((r) => r.id !== mover.room_id && r.gender === rooms[mover.room_id].gender && r.count < Number(r.capacity));
  const moved = plan.map((a) => a === mover ? { room_id: target.id, student_id: a.student_id } : a);
  assert.strictEqual(plain(env.call(HALL, 'previewRoomPlan', term.id, moved)).blocked, false, '막는 위반 없는 계획');
  env.setNow('2027-12-31T15:00:00');   // 기간이 끝난 뒤
  assert.ok('2027-12-31' > term.end_date, '기간 끝 ' + term.end_date);
  const tok = plain(env.call(HALL, 'getRoomData', term.id)).token;
  const before = JSON.stringify(env.rows('room_assignments'));
  const r = plain(env.call(HALL, 'saveRoomAssignments', term.id, moved, tok));
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(/끝난 기간/.test(JSON.stringify(r.errors)), JSON.stringify(r));
  assert.strictEqual(JSON.stringify(env.rows('room_assignments')), before, '쓰기 없음');
});

test('방: 끝난 옛 행(valid_to < 기준일)은 살아 있는 배정이 아니다 — 두 번째로 옮겨도 첫 옛 행의 끝 날짜는 그대로, 방 화면에는 한 번만', () => {
  const env = seededEnv();
  const term = termOf(env);
  assert.ok(term.start_date < TODAY, '오늘이 기간 시작 뒤(옛 행은 취소가 아니라 어제로 끝난다)');
  const rooms = Object.fromEntries(env.rows('rooms').map((r) => [r.id, r]));
  const moveOnce = (exclude) => {
    const g = plain(env.call(HALL, 'getRoomData', term.id));
    const plan = g.rooms.flatMap((r) => r.members.map((m) => ({ room_id: r.id, student_id: m.id })));
    const fits = (a) => g.rooms.find((r) => r.id !== a.room_id && !exclude.includes(r.id) && r.gender === rooms[a.room_id].gender && r.count < Number(r.capacity));
    return { g, plan, fits };
  };
  // 3/9: A방 → B방
  let m = moveOnce([]);
  const mover = m.plan.find((a) => m.fits(a) && !env.rows('room_assignments').some((x) => x.student_id === a.student_id && x.valid_from));
  assert.ok(mover, '기간 처음부터 방에 있던 옮길 학생');
  const roomA = mover.room_id, roomB = m.fits(mover).id;
  let s = plain(env.call(HALL, 'saveRoomAssignments', term.id, m.plan.map((a) => a === mover ? { room_id: roomB, student_id: a.student_id } : a), m.g.token));
  assert.strictEqual(s.ok, true, JSON.stringify(s));
  const first = env.rows('room_assignments').find((x) => x.student_id === mover.student_id && x.room_id === roomA);
  assert.strictEqual(first.valid_to, '2027-03-08', '첫 옛 행은 어제로 끝남');

  // 3/12: B방 → C방(A·B가 아닌 같은 성별 방)
  env.setNow('2027-03-12T15:00:00');
  m = moveOnce([roomA]);
  const again = m.plan.find((a) => a.student_id === mover.student_id);
  assert.strictEqual(again.room_id, roomB, '지금은 B방');
  const roomC = m.fits(again);
  assert.ok(roomC, 'A·B가 아닌 같은 성별 빈자리 방');
  s = plain(env.call(HALL, 'saveRoomAssignments', term.id, m.plan.map((a) => a === again ? { room_id: roomC.id, student_id: a.student_id } : a), m.g.token));
  assert.strictEqual(s.ok, true, JSON.stringify(s));
  assert.strictEqual(s.endedCount, 1, 'B방 행 하나만 끝냄 ' + JSON.stringify(s));
  assert.strictEqual(env.rows('room_assignments').find((x) => x.id === first.id).valid_to, '2027-03-08', '첫 옛 행(A방)의 끝 날짜는 그대로 — 지난 날짜 방 기록이 바뀌지 않는다');

  const after = plain(env.call(HALL, 'getRoomData', term.id));
  assert.deepStrictEqual(after.rooms.filter((r) => r.members.some((x) => x.id === mover.student_id)).map((r) => r.id), [roomC.id], 'C방에만');
});

test('방 화면 짝 위반: avoid.view가 없으면(역할표를 바꾼 실행) room.edit가 있어도 짝 위반 줄·짝 학생이 없다, 있으면 보인다', () => {
  const env = seededEnv();
  const term = termOf(env);
  const rooms = Object.fromEntries(env.rows('rooms').map((r) => [r.id, r]));
  const stu = Object.fromEntries(env.rows('students').map((s) => [s.id, s]));
  const g = plain(env.call(HALL, 'getRoomData', term.id));
  const roomOf = Object.fromEntries(g.rooms.flatMap((r) => r.members.map((m) => [m.id, r.id])));
  // 방 짝 하나를 같은 방에: B를 A의 방 학생과 맞바꾼다(정원·성별 그대로)
  const pair = env.rows('avoid_pairs').find((x) => x.scope !== '좌석' && roomOf[x.student_a] && roomOf[x.student_b]
    && stu[x.student_a].gender === stu[x.student_b].gender && roomOf[x.student_a] !== roomOf[x.student_b]);
  assert.ok(pair, '방에 있는 같은 성별 방 짝(다른 방)');
  const ra = roomOf[pair.student_a], rb = roomOf[pair.student_b];
  const other = Object.keys(roomOf).find((sid) => roomOf[sid] === ra && sid !== pair.student_a);
  assert.ok(other, 'A 방의 다른 학생');
  const plan = Object.keys(roomOf).map((sid) => ({ student_id: sid, room_id: sid === pair.student_b ? ra : sid === other ? rb : roomOf[sid] }));
  assert.strictEqual(rooms[ra].gender, rooms[rb].gender);
  const s = plain(env.call(HALL, 'saveRoomAssignments', term.id, plan, g.token));
  assert.strictEqual(s.ok, true, JSON.stringify(s));

  const normal = JSON.stringify(plain(env.call(HALL, 'getRoomData', term.id)));
  assert.ok(normal.includes('떨어뜨릴 짝'), '대조: avoid.view가 있으면 짝 위반 줄이 있다');
  const hidden = withoutAvoidView(env, HALL, (c) => c.getRoomData(term.id));
  assert.ok(hidden.includes(stu[pair.student_a].name), 'room.edit라 학생 이름은 그대로');
  assert.ok(!hidden.includes('떨어뜨릴 짝'), 'avoid.view 없으면 짝 위반 줄 없음');
  assert.ok(!hidden.includes('"bad":true'), '짝 학생 표시(bad)도 없음');
});

test('좌석 초안 미리보기 짝 위반: avoid.view가 없으면(역할표를 바꾼 실행) seat.edit가 있어도 짝 위반이 없다, 있으면 보인다', () => {
  const env = seededEnv();
  const term = termOf(env);
  const cells = (d) => d.spaces.flatMap((s) => s.cells);
  const pair = env.rows('avoid_pairs').find((x) => x.scope === '좌석');
  let cur = plain(env.call(HALL, 'getSeatData', term.id));
  const cellOf = (sid) => cells(cur).find((c) => c.studentId === sid);
  const ca = cellOf(pair.student_a), cb = cellOf(pair.student_b);
  assert.ok(ca && cb, '짝 두 학생 모두 자리가 있다');
  const sp = cur.spaces.find((s) => s.cells.includes(ca));
  const near = sp.cells.find((c) => c.kind === 'seat' && Math.abs(c.row - ca.row) + Math.abs(c.col - ca.col) === 1);
  assert.ok(near, '짝 학생 옆 자리');
  if (near.id !== cb.id) {
    const sw = plain(env.call(HALL, 'swapSeats', term.id, near.id, cb.id, { [near.id]: near.token, [cb.id]: cb.token }));
    assert.strictEqual(sw.ok, true, JSON.stringify(sw));
  }
  const fixed = [ca.id, near.id];
  const normal = plain(env.call(HALL, 'previewSeatDraft', term.id, fixed, 20270310));
  assert.strictEqual(normal.ok, true, JSON.stringify(normal));
  assert.ok(JSON.stringify(normal.violations).includes('떨어뜨릴 짝'), '대조: avoid.view가 있으면 짝 위반이 있다');
  const hidden = JSON.parse(withoutAvoidView(env, HALL, (c) => c.previewSeatDraft(term.id, fixed, 20270310)));
  assert.strictEqual(hidden.ok, true, JSON.stringify(hidden));
  assert.ok(!JSON.stringify(hidden).includes('떨어뜨릴 짝'), 'avoid.view 없으면 짝 위반 없음');
});
