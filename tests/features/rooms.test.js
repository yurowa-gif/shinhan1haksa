/** C23 F8 방 배정: R4 gas-fakes(실제 Auth·Db·락·audit)로 초안→수정→저장, 정원·성별 저장 막기, 짝 정보 권한, 기숙사 퇴실 공석, 홈 카드를 확인한다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';            // admin + hall_teacher
const HALL = 'test.teacher@example.com';      // 학사 교사
const ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-03T12:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.seedRooms_(env.owner, []));   // 결정 64 기본 35실
  env.strictLock = true;
  return env;
}
const term2 = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const live = (env) => env.rows('room_assignments').filter((a) => a.status !== '취소');
const call = (env, who, fn, ...a) => env.call(who, fn, ...a);
/** 1학기 기숙사생(기준일 기숙사 입실)과 성별 */
const dormOf = (env, ymd) => {
  const enr = new Set(env.rows('enrollments').filter((e) => e.term_id === term2(env).id).map((e) => e.student_id));
  return env.rows('students').filter((s) => enr.has(s.id) && env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), s.id, '기숙사', ymd || '2027-03-03') === '입실'));
};
const draftSave = (env, who) => {
  const g = call(env, who || ADMIN, 'getRoomData', '');
  const p = call(env, who || ADMIN, 'previewRoomDraft', g.term.id, 7);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  const r = call(env, who || ADMIN, 'saveRoomAssignments', g.term.id, p.assignments, g.token);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return { g, p, r };
};
const roomByNo = (env, no) => env.rows('rooms').find((r) => String(r.room_no) === String(no));
const addAvoid = (env, a, b, scope) => env.asOwner((c) => c.appendRecord_('avoid_pairs', { student_a: a, student_b: b, scope, reason: '가짜 사유 표식', status: '유효' }, env.owner));

test('방 배정 화면 데이터: 35실, 기숙사생만 대상, 처음에는 모두 미배정이고 token이 있다', () => {
  const env = makeEnv();
  const g = call(env, HALL, 'getRoomData', '');
  assert.strictEqual(g.rooms.length, 35); assert.strictEqual(g.canEdit, true);
  const dorm = dormOf(env);
  assert.strictEqual(g.dormCount, dorm.length); assert.strictEqual(g.unassignedCount, dorm.length);
  assert.deepStrictEqual(g.unassigned.map((u) => u.id).sort(), dorm.map((s) => s.id).sort());
  assert.ok(g.rooms.every((r) => r.members.length === 0) && typeof g.token === 'string');
  assert.ok(g.board.male.capacity === 48 && g.board.female.capacity === 92, '정원 남 48 · 여 92(결정 24)');
});

test('초안 → 저장: 기숙사생이 성별에 맞는 방에 들어가고 정원을 넘지 않으며 현황이 바뀐다. 두 번 저장해도 한 벌(변경 없음)', () => {
  const env = makeEnv();
  const { g, p, r } = draftSave(env);
  const dorm = dormOf(env);
  assert.strictEqual(live(env).length, dorm.length);
  assert.strictEqual(p.unplaced.length, 0);
  const g2 = call(env, ADMIN, 'getRoomData', '');
  const genderOf = Object.fromEntries(env.rows('students').map((s) => [s.id, s.gender]));
  g2.rooms.forEach((rm) => { assert.ok(rm.count <= rm.capacity); rm.members.forEach((m) => assert.strictEqual(genderOf[m.id], rm.gender)); });
  assert.strictEqual(g2.unassignedCount, 0);
  assert.strictEqual(g2.board.male.count + g2.board.female.count, dorm.length);
  assert.strictEqual(g2.board.male.vacant, 48 - g2.board.male.count);
  const n = env.rows('room_assignments').length;
  const again = call(env, ADMIN, 'saveRoomAssignments', g.term.id, p.assignments, g.token);   // 옛 token이어도 바뀐 것이 없으면 한 벌
  assert.deepStrictEqual([again.ok, again.unchanged], [true, true]);
  assert.strictEqual(env.rows('room_assignments').length, n);
  assert.ok(r.token === g2.token);
});

test('맞바꾸기·옮기기 뒤 저장: 바뀐 학생의 배정만 취소하고 새로 쓴다(기록은 지우지 않는다), 같은 방에 그대로인 행은 건드리지 않는다', () => {
  const env = makeEnv();
  draftSave(env);
  const g = call(env, ADMIN, 'getRoomData', '');
  const male = g.rooms.filter((r) => r.gender === '남' && r.members.length);
  assert.ok(male.length >= 2, '남 기숙사생이 두 방 이상에 있다');
  const a = male[0], b = male[1];
  const sa = a.members[0].id, sb = b.members[0].id;
  const cur = g.rooms.flatMap((r) => r.members.map((m) => ({ room_id: r.id, student_id: m.id })));
  const swapped = cur.map((x) => (x.student_id === sa ? { room_id: b.id, student_id: sa } : x.student_id === sb ? { room_id: a.id, student_id: sb } : x));
  const before = env.rows('room_assignments').length, keepIds = live(env).filter((x) => x.student_id !== sa && x.student_id !== sb).map((x) => x.id);
  const p = call(env, ADMIN, 'previewRoomPlan', g.term.id, swapped);
  assert.strictEqual(p.ok, true, JSON.stringify(p)); assert.strictEqual(p.changed, 2); assert.strictEqual(p.blocked, false);
  const r = call(env, ADMIN, 'saveRoomAssignments', g.term.id, swapped, g.token);
  assert.deepStrictEqual([r.ok, r.cancelCount, r.createCount], [true, 2, 2], JSON.stringify(r));
  assert.strictEqual(env.rows('room_assignments').length, before + 2, '행은 지워지지 않고 취소 + 새 행');
  const canceled = env.rows('room_assignments').filter((x) => x.status === '취소');
  assert.deepStrictEqual(canceled.map((x) => x.student_id).sort(), [sa, sb].sort());
  assert.ok(keepIds.every((id) => env.rows('room_assignments').find((x) => x.id === id).status !== '취소'), '다른 학생 행은 그대로');
  const g2 = call(env, ADMIN, 'getRoomData', '');
  assert.ok(g2.rooms.find((x) => x.id === b.id).members.some((m) => m.id === sa) && g2.rooms.find((x) => x.id === a.id).members.some((m) => m.id === sb));
  assert.ok(env.rows('audit_log').some((x) => /room_assignments/.test(x.sheet || '')), '감사 기록');
});

test('정원 초과는 저장이 막힌다(미리보기엔 정원 초과 줄과 blocked), 막힌 뒤 아무것도 쓰이지 않는다', () => {
  const env = makeEnv();
  const g = call(env, ADMIN, 'getRoomData', '');
  const dorm = dormOf(env).filter((s) => s.gender === '남');
  assert.ok(dorm.length >= 2);
  const room = roomByNo(env, 1);
  env.asOwner((c) => c.updateRecord_('rooms', room.id, { capacity: '1' }, env.owner));   // 정원 1인 방에 둘
  const plan = dorm.slice(0, 2).map((s) => ({ room_id: room.id, student_id: s.id }));
  const p = call(env, ADMIN, 'previewRoomPlan', g.term.id, plan);
  assert.strictEqual(p.ok, true); assert.strictEqual(p.blocked, true);
  assert.ok(p.violations.some((v) => v.kind === '정원 초과' && v.blocking && /정원 초과 \(2\/1\)/.test(v.text)));
  const n = env.rows('room_assignments').length;
  const r = call(env, ADMIN, 'saveRoomAssignments', g.term.id, plan, g.token);
  assert.strictEqual(r.ok, false); assert.match(r.errors[0].message, /정원 초과/);
  assert.strictEqual(env.rows('room_assignments').length, n);
});

test('성별이 다른 방, 기숙사생이 아닌 학생, 없는 방, 같은 학생 두 번은 거부된다', () => {
  const env = makeEnv();
  const g = call(env, ADMIN, 'getRoomData', '');
  const dorm = dormOf(env), male = dorm.find((s) => s.gender === '남'), femaleRoom = roomByNo(env, 20);
  const n = env.rows('room_assignments').length;
  const gender = call(env, ADMIN, 'saveRoomAssignments', g.term.id, [{ room_id: femaleRoom.id, student_id: male.id }], g.token);
  assert.strictEqual(gender.ok, false); assert.match(gender.errors[0].message, /성별/);
  const nondorm = env.rows('students').find((s) => !dorm.some((d) => d.id === s.id));
  assert.strictEqual(call(env, ADMIN, 'saveRoomAssignments', g.term.id, [{ room_id: roomByNo(env, 1).id, student_id: nondorm.id }], g.token).ok, false);
  assert.strictEqual(call(env, ADMIN, 'saveRoomAssignments', g.term.id, [{ room_id: 'no-room', student_id: male.id }], g.token).ok, false);
  const r1 = roomByNo(env, 1).id, r2 = roomByNo(env, 2).id;
  assert.strictEqual(call(env, ADMIN, 'saveRoomAssignments', g.term.id, [{ room_id: r1, student_id: male.id }, { room_id: r2, student_id: male.id }], g.token).ok, false);
  assert.strictEqual(call(env, ADMIN, 'saveRoomAssignments', g.term.id, 'x', g.token).ok, false);
  assert.strictEqual(env.rows('room_assignments').length, n);
});

test('확인한 뒤 다른 사람이 배정을 바꿨으면(token 불일치) 저장이 거부되고 아무것도 쓰이지 않는다', () => {
  const env = makeEnv();
  const g = call(env, ADMIN, 'getRoomData', '');
  const p = call(env, ADMIN, 'previewRoomDraft', g.term.id, 3);
  draftSave(env, HALL);   // 다른 교사가 먼저 저장
  const n = env.rows('room_assignments').length;
  const r = call(env, ADMIN, 'saveRoomAssignments', g.term.id, p.assignments.slice(0, 2), g.token);
  assert.strictEqual(r.stale, true); assert.strictEqual(r.ok, false);
  assert.strictEqual(env.rows('room_assignments').length, n);
});

test('같은 학년만 있는 방·떨어뜨릴 짝은 표시만 하고 저장은 된다. 짝 상대 이름은 avoid.view가 있는 사람에게만 보인다', () => {
  const env = makeEnv();
  const g = call(env, ADMIN, 'getRoomData', '');
  const males = dormOf(env).filter((s) => s.gender === '남');
  assert.ok(males.length >= 2);
  const [a, b] = males;
  addAvoid(env, a.id, b.id, '방');
  const room = roomByNo(env, 1).id;
  const plan = [{ room_id: room, student_id: a.id }, { room_id: room, student_id: b.id }];
  const p = call(env, HALL, 'previewRoomPlan', g.term.id, plan);
  const pair = p.violations.find((v) => v.kind === '떨어뜨릴 짝');
  assert.ok(pair && pair.blocking === false && pair.studentIds.sort().join() === [a.id, b.id].sort().join(), JSON.stringify(p.violations));
  assert.ok(pair.text.includes(a.name) && pair.text.includes(b.name));
  assert.ok(p.rooms.find((r) => r.id === room).members.every((m) => m.bad), '짝 학생 칩이 빨갛게');
  const r = call(env, HALL, 'saveRoomAssignments', g.term.id, plan, g.token);
  assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.ok(r.violationCount >= 1, '위반이 있어도 저장은 된다');
  // 출결 담당·근무표 담당자: 이름·위반 줄·짝 정보 없음
  [ATT, DUTYM].forEach((who) => {
    const v = call(env, who, 'getRoomData', ''), s = call(env, who, 'getRoomStats', '');
    [v, s].forEach((x) => { const j = JSON.stringify(x); assert.ok(!j.includes(a.name) && !j.includes(b.name) && !j.includes('떨어뜨릴') && !j.includes('가짜 사유 표식'), who + ' 응답에 짝·이름이 없다'); });
    assert.deepStrictEqual([v.canEdit, v.detail, v.violations.length, v.rooms.every((x) => x.members.length === 0)], [false, false, 0, true]);
    assert.strictEqual(v.board.male.count, 2);
  });
});

test('권한: 담임·학생·학부모는 getRoomData·getRoomStats 거부(denied:room.view), 출결·근무표 담당자는 초안·미리보기·저장 거부(denied:room.edit)', () => {
  const env = makeEnv();
  const g = call(env, ADMIN, 'getRoomData', '');
  const n = env.rows('room_assignments').length;
  [HOMEROOM, STUDENT, PARENT].forEach((who) => { env.expectDenied(who, 'room.view', 'getRoomData', ''); env.expectDenied(who, 'room.view', 'getRoomStats', ''); });
  [ATT, DUTYM, HOMEROOM, STUDENT, PARENT].forEach((who) => {
    env.expectDenied(who, 'room.edit', 'previewRoomDraft', g.term.id, 1);
    env.expectDenied(who, 'room.edit', 'previewRoomPlan', g.term.id, []);
    env.expectDenied(who, 'room.edit', 'saveRoomAssignments', g.term.id, [], g.token);
  });
  [ATT, DUTYM].forEach((who) => { env.expectAllowed(who, 'getRoomData', ''); env.expectAllowed(who, 'getRoomStats', ''); });
  [ADMIN, HALL].forEach((who) => { env.expectAllowed(who, 'previewRoomDraft', g.term.id, 1); });
  assert.strictEqual(env.rows('room_assignments').length, n);
});

test('기숙사 퇴실 적용일부터 그 자리는 공석: 배정 행은 남아 있지만 현황·방 카드·방 없는 학생에서 빠지고, 그 학생을 배정에 넣으면 거부된다', () => {
  const env = makeEnv();
  draftSave(env);
  const g = call(env, ADMIN, 'getRoomData', '');
  const room = g.rooms.find((r) => r.members.length && r.gender === '남');
  const leaver = room.members[0].id;
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: leaver, item: '기숙사', value: '퇴실', effective_date: '2027-03-05', effective_date_auto: '2027-03-05', requested_at: '2027-03-03T10:00:00',
    reason: '', memo: '', source: 'F6', status: '유효', doc_submitted: 'TRUE', linked_change_id: '', cancel_reason: '' }, env.owner));
  const before = call(env, ADMIN, 'getRoomStats', '');
  assert.strictEqual(before.male.count, g.board.male.count, '적용일 전에는 그대로');
  env.setNow('2027-03-05T12:00:00');
  const after = call(env, ADMIN, 'getRoomStats', ''), g2 = call(env, ADMIN, 'getRoomData', '');
  assert.strictEqual(after.male.count, before.male.count - 1); assert.strictEqual(after.male.vacant, before.male.vacant + 1);
  assert.ok(!g2.rooms.find((r) => r.id === room.id).members.some((m) => m.id === leaver) && !g2.unassigned.some((u) => u.id === leaver));
  assert.ok(env.rows('room_assignments').some((a) => a.student_id === leaver && a.status !== '취소'), '배정 행은 지우지 않는다');
  const cur = g2.rooms.flatMap((r) => r.members.map((m) => ({ room_id: r.id, student_id: m.id })));
  const r = call(env, ADMIN, 'saveRoomAssignments', g2.term.id, cur.concat([{ room_id: room.id, student_id: leaver }]), g2.token);
  assert.strictEqual(r.ok, false);
});

test('관리자·학사 교사 홈 카드(food.dorm): 남·여 정원·입실·빈 자리, 학생 이름 없음. 다른 역할 홈에는 없다', () => {
  const env = makeEnv();
  draftSave(env);
  const dorm = dormOf(env);
  const male = dorm.filter((s) => s.gender === '남').length, female = dorm.length - male;
  const f = call(env, ADMIN, 'getHomeData', 'admin').food;
  assert.deepStrictEqual([f.dorm.male.capacity, f.dorm.male.count, f.dorm.male.vacant, f.dorm.female.count, f.dorm.female.vacant], [48, male, 48 - male, female, 92 - female]);
  assert.ok(!JSON.stringify(f.dorm).includes(dorm[0].name));
  assert.ok(call(env, HALL, 'getHomeData', 'hall_teacher').food.dorm);
  assert.strictEqual(call(env, HOMEROOM, 'getHomeData', 'homeroom').food && call(env, HOMEROOM, 'getHomeData', 'homeroom').food.dorm, undefined);
});

test('방 구성이 없으면 홈 카드는 null이고 화면 데이터는 빈 방 목록이다(오류로 멈추지 않는다)', () => {
  const env = makeEnv();
  env.rows('rooms').forEach((r) => env.asOwner((c) => c.updateRecord_('rooms', r.id, { status: '취소' }, env.owner)));   // 방 구성이 모두 취소된 상태
  assert.strictEqual(call(env, ADMIN, 'getHomeData', 'admin').food.dorm, null);
  const g = call(env, ADMIN, 'getRoomData', '');
  assert.strictEqual(g.rooms.length, 0);
});

test('기준일부터 바뀐다(C22와 같은 방식): 옛 행은 valid_to = 기준일 전날로 끝나 지난 날짜의 배정이 그대로 남고, 새 행은 valid_from = 기준일. 그날 시작한 행은 취소', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  draftSave(env);
  assert.ok(live(env).every((a) => a.valid_from === '2027-03-03' && a.valid_to === ''), '3/3 저장: 시작일(3/2) 뒤라 valid_from = 기준일');
  env.setNow('2027-03-10T12:00:00');
  const g = call(env, ADMIN, 'getRoomData', '');
  const male = g.rooms.filter((r) => r.gender === '남' && r.members.length);
  const a = male[0], b = male[1], sa = a.members[0].id, sb = b.members[0].id;
  const cur = g.rooms.flatMap((r) => r.members.map((m) => ({ room_id: r.id, student_id: m.id })));
  const swapped = cur.map((x) => (x.student_id === sa ? { room_id: b.id, student_id: sa } : x.student_id === sb ? { room_id: a.id, student_id: sb } : x));
  const r = call(env, ADMIN, 'saveRoomAssignments', g.term.id, swapped, g.token);
  assert.deepStrictEqual([r.ok, r.endedCount, r.cancelCount, r.createCount], [true, 2, 0, 2], JSON.stringify(r));
  const rows = env.rows('room_assignments');
  const old = rows.filter((x) => (x.student_id === sa || x.student_id === sb) && x.valid_from === '2027-03-03');
  assert.ok(old.length === 2 && old.every((x) => x.valid_to === '2027-03-09' && x.status === '배정'), '옛 행은 3/9까지');
  const fresh = rows.filter((x) => (x.student_id === sa || x.student_id === sb) && x.valid_from === '2027-03-10');
  assert.ok(fresh.length === 2 && fresh.every((x) => x.valid_to === '' && x.status === '배정'));
  assert.ok(rows.filter((x) => x.student_id !== sa && x.student_id !== sb).every((x) => x.valid_to === '' && x.status === '배정'), '그대로인 배정은 건드리지 않는다');
  // 지난 날짜(3/5)의 방 배정은 그때 그대로, 오늘은 맞바꾼 뒤
  const at = (ymd) => rows.filter((x) => x.status !== '취소' && (!x.valid_from || x.valid_from <= ymd) && (!x.valid_to || x.valid_to >= ymd)).map((x) => x.room_id + '|' + x.student_id);
  assert.ok(at('2027-03-05').includes(a.id + '|' + sa) && at('2027-03-05').includes(b.id + '|' + sb));
  assert.ok(at('2027-03-10').includes(b.id + '|' + sa) && at('2027-03-10').includes(a.id + '|' + sb));
  const g2 = call(env, ADMIN, 'getRoomData', '');
  assert.ok(g2.rooms.find((x) => x.id === b.id).members.some((m) => m.id === sa));
  // 끝난 행은 다른 배정을 막지 않고 두 번 저장해도 한 벌
  assert.deepStrictEqual([call(env, ADMIN, 'saveRoomAssignments', g2.term.id, swapped, g.token).unchanged], [true]);
});

test('기준일이 기간 시작일 이하이면 새 행의 valid_from은 빈칸(기간 전체)', () => {
  const env = makeEnv('2027-03-01T12:00:00');   // 1학기(3/2 시작) 전날: 현재 기간은 아직 지난 기간이라 기간을 직접 고른다
  const g = call(env, ADMIN, 'getRoomData', term2(env).id);
  assert.strictEqual(g.term.ymd, '2027-03-02');
  const p = call(env, ADMIN, 'previewRoomDraft', g.term.id, 5);
  assert.strictEqual(call(env, ADMIN, 'saveRoomAssignments', g.term.id, p.assignments, g.token).ok, true);
  assert.ok(live(env).length > 0 && live(env).every((a) => a.valid_from === '' && a.valid_to === ''));
});
