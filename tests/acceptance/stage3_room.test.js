/**
 * T3 끝까지(stage3.md 0절, F8): 2027 1학기 기숙사생으로 방 초안을 만들어 저장한다.
 * seedFakeStage3(짝 3쌍·기숙사생 방 배정) 위에서 학사 교사가 previewRoomDraft → saveRoomAssignments.
 * 확인: 성별 층·정원, 정원 초과·성별 불일치 저장 거부, 출결·근무표 담당 응답에 이름·짝 없음, 지난 날짜 방 유지,
 * 입실 예정자·퇴실자 행 불변, 기숙사 퇴실 뒤 공석, 홈 카드 = 현황판, 두 번 저장해도 한 벌. 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';
const TODAY = '2027-03-09';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = HALL;
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage3());
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  env.strictLock = true;
  return env;
}

test('끝까지 방 배정: 초안 → 저장(성별 층·정원), 막는 위반은 저장 거부, 권한 밖에 이름·짝 없음, 지난 날짜 유지, 입실 예정·퇴실 행 불변, 퇴실 뒤 공석, 홈 카드 = 현황판', () => {
  const env = seededEnv();
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const stu = Object.fromEntries(env.rows('students').map((s) => [s.id, s]));
  const rooms = Object.fromEntries(env.rows('rooms').map((r) => [r.id, r]));
  const call = (who, fn, ...a) => plain(env.call(who, fn, ...a));
  const on = (sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
  const raRows = () => env.rows('room_assignments').filter((r) => r.term_id === term.id);
  const seedRows = raRows();
  const roomedIds = seedRows.map((r) => r.student_id);

  // 준비: 방이 있는 기숙사생 한 명이 3/5에 기숙사 퇴실(지난 날짜 — 그날 기숙사생이 아님). 3/15 입실 예정자는 시드의 3/15부터 행 그대로
  const gone = roomedIds.find((sid) => on(sid, '기숙사', TODAY) === '입실' && on(sid, '학사', '2027-03-20') === '입실');
  const mv = (sid, type, at, eff) => {
    const i = { studentId: sid, type, requestedAt: at, effectiveDate: eff, dinner: '중단', docSubmitted: false };
    const p = call(ADMIN, 'previewMove', i);
    assert.strictEqual(p.ok, true, JSON.stringify(p));
    assert.strictEqual(call(ADMIN, 'saveMove', i, p.expect).ok, true);
  };
  mv(gone, '기숙사 퇴실', '2027-03-04T10:00:00', '2027-03-05');
  const late = seedRows.find((r) => r.valid_from === '2027-03-15');
  const untouched = seedRows.filter((r) => r.student_id === gone || (late && r.id === late.id));
  const dorm = env.rows('enrollments').filter((e) => e.term_id === term.id).map((e) => e.student_id).filter((sid) => on(sid, '기숙사', TODAY) === '입실');
  assert.ok(dorm.length >= 4, '기숙사생 ' + dorm.length);

  // 출결·근무표 담당: 숫자만(학생 이름·짝 없음), 고치기 거부
  for (const who of [ATT, DUTYM]) {
    const view = JSON.stringify(call(who, 'getRoomData', term.id)) + JSON.stringify(call(who, 'getRoomStats', term.id));
    dorm.forEach((sid) => assert.ok(!view.includes(stu[sid].name), who + ' 응답에 학생 이름 없음'));
    assert.ok(!view.includes('떨어뜨릴 짝') && !env.rows('avoid_pairs').some((p) => view.includes(p.reason) || view.includes(p.id)), who + ' 응답에 짝 없음');
    env.expectDenied(who, 'room.edit', 'previewRoomDraft', term.id, 7);
  }

  // 학사 교사: 초안 → 저장
  const g = call(HALL, 'getRoomData', term.id);
  const p = call(HALL, 'previewRoomDraft', term.id, 7);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.deepStrictEqual(p.assignments.map((a) => a.student_id).sort(), dorm.slice().sort(), '그날 기숙사생 전원, 퇴실자·입실 예정자는 빠짐');
  const count = {};
  p.assignments.forEach((a) => {
    assert.strictEqual(rooms[a.room_id].gender, stu[a.student_id].gender, '성별 층');
    count[a.room_id] = (count[a.room_id] || 0) + 1;
  });
  Object.keys(count).forEach((rid) => assert.ok(count[rid] <= Number(rooms[rid].capacity), '정원'));
  const roomOf = Object.fromEntries(p.assignments.map((a) => [a.student_id, a.room_id]));
  env.rows('avoid_pairs').filter((x) => x.scope !== '좌석' && roomOf[x.student_a] && roomOf[x.student_b])
    .forEach((x) => assert.notStrictEqual(roomOf[x.student_a], roomOf[x.student_b], '방 짝은 다른 방'));

  // 막는 위반: 성별 불일치·정원 초과는 미리보기에서 blocked, 저장 거부(행 그대로)
  const before = JSON.stringify(env.rows('room_assignments'));
  const s0 = p.assignments[0], other = Object.values(rooms).find((r) => r.gender !== stu[s0.student_id].gender);
  const wrongGender = p.assignments.map((a) => a === s0 ? Object.assign({}, a, { room_id: other.id }) : a);
  assert.strictEqual(call(HALL, 'previewRoomPlan', term.id, wrongGender).blocked, true);
  const r1 = call(HALL, 'saveRoomAssignments', term.id, wrongGender, g.token);
  assert.strictEqual(r1.ok, false, JSON.stringify(r1));
  // 정원 초과: 같은 성별 학생 둘을 한 방(정원 1로 줄임)에 넣는다
  const mate = p.assignments.find((a) => a !== s0 && stu[a.student_id].gender === stu[s0.student_id].gender);
  const tiny = s0.room_id;
  env.asOwner((c) => c.updateRecord_('rooms', tiny, { capacity: '1' }, ADMIN));
  const crowded = p.assignments.map((a) => a === mate ? Object.assign({}, a, { room_id: tiny }) : a);
  assert.strictEqual(call(HALL, 'previewRoomPlan', term.id, crowded).blocked, true);
  const r2 = call(HALL, 'saveRoomAssignments', term.id, crowded, g.token);
  assert.strictEqual(r2.ok, false, JSON.stringify(r2));
  assert.ok(r2.errors.some((e) => /정원/.test(e.message)), JSON.stringify(r2.errors));
  assert.strictEqual(JSON.stringify(env.rows('room_assignments')), before, '거부된 저장은 아무것도 쓰지 않는다');
  env.asOwner((c) => c.updateRecord_('rooms', tiny, { capacity: '4' }, ADMIN));

  const saved = call(HALL, 'saveRoomAssignments', term.id, p.assignments, call(HALL, 'getRoomData', term.id).token);
  assert.strictEqual(saved.ok, true, JSON.stringify(saved));

  // 지난 날짜 방 유지: 방이 바뀐 학생의 옛 행은 지우지 않고 어제(3/8)까지로 끝낸다. 입실 예정자·퇴실자 행은 그대로
  const after = raRows();
  seedRows.filter((r) => !untouched.includes(r) && roomOf[r.student_id] && roomOf[r.student_id] !== r.room_id).forEach((r) => {
    const now = after.find((x) => x.id === r.id);
    assert.deepStrictEqual([now.status, now.valid_to], ['배정', '2027-03-08'], '옛 행은 어제까지');
  });
  const endedOld = seedRows.filter((r) => !untouched.includes(r) && roomOf[r.student_id] && roomOf[r.student_id] !== r.room_id);
  assert.ok(endedOld.length >= 1 && late && untouched.length === 2, '방이 바뀐 학생·입실 예정자·퇴실자가 모두 있다 ' + [endedOld.length, !!late, untouched.length]);
  untouched.forEach((r) => assert.deepStrictEqual(after.find((x) => x.id === r.id), r, '입실 예정자·퇴실자 행 불변'));
  const liveToday = after.filter((r) => r.status === '배정' && !(r.valid_to && r.valid_to < TODAY) && dorm.includes(r.student_id));
  assert.deepStrictEqual(liveToday.map((r) => [r.student_id, r.room_id]).sort(), p.assignments.map((a) => [a.student_id, a.room_id]).sort(), '오늘 배정 = 초안');

  // 두 번 저장해도 한 벌
  const again = call(HALL, 'saveRoomAssignments', term.id, p.assignments, call(HALL, 'getRoomData', term.id).token);
  assert.deepStrictEqual([again.ok, again.unchanged], [true, true]);
  assert.strictEqual(raRows().length, after.length);

  // 짝 정보: 방 짝 두 학생을 같은 방에 넣어 저장(짝 위반은 표시만, 저장은 된다) → 학사 교사에게는 '떨어뜨릴 짝'이 보이고,
  // 출결·근무표 담당 응답에는 짝 위반·사유·id가 없다(avoid.view 가드를 빼면 여기서 잡힌다)
  const rp = env.rows('avoid_pairs').find((x) => x.scope !== '좌석' && roomOf[x.student_a] && roomOf[x.student_b]);
  assert.ok(rp, '두 학생 모두 기숙사생인 방 짝');
  const together = p.assignments.map((x) => x.student_id === rp.student_b ? Object.assign({}, x, { room_id: roomOf[rp.student_a] }) : x);
  const tp = call(HALL, 'previewRoomPlan', term.id, together);
  assert.deepStrictEqual([tp.ok, tp.blocked], [true, false], JSON.stringify(tp));
  assert.ok(JSON.stringify(tp.violations).includes('떨어뜨릴 짝'), '학사 교사 미리보기에 짝 위반');
  const ts = call(HALL, 'saveRoomAssignments', term.id, together, call(HALL, 'getRoomData', term.id).token);
  assert.strictEqual(ts.ok, true, '짝 위반은 저장을 막지 않는다 ' + JSON.stringify(ts));
  assert.ok(JSON.stringify(call(HALL, 'getRoomData', term.id)).includes('떨어뜨릴 짝'), '학사 교사 방 화면에 짝 위반');
  for (const who of [ATT, DUTYM]) {
    const view = JSON.stringify(call(who, 'getRoomData', term.id)) + JSON.stringify(call(who, 'getRoomStats', term.id));
    assert.ok(!view.includes('떨어뜨릴 짝'), who + ' 응답에 짝 위반 없음');
    assert.ok(!env.rows('avoid_pairs').some((x) => view.includes(x.reason) || view.includes(x.id) || view.includes(x.student_a)), who + ' 응답에 짝 사유·id·학생 없음');
  }

  // 홈 카드 = 현황판, 그리고 기숙사 퇴실 뒤 공석(3/12 기숙사 퇴실 → 그날부터 인원 −1, 행은 지우지 않음)
  const cardVsBoard = () => {
    const st = call(ADMIN, 'getRoomStats', term.id), card = call(ADMIN, 'getHomeData', 'admin').food.dorm;
    ['male', 'female'].forEach((g2) => assert.deepStrictEqual([card[g2].capacity, card[g2].count, card[g2].vacant], [st[g2].capacity, st[g2].count, st[g2].vacant], g2 + ' 홈 카드 = 현황판'));
    return st;
  };
  const st1 = cardVsBoard();
  const leaver = p.assignments.find((a) => a.student_id !== gone).student_id, g3 = stu[leaver].gender === '남' ? 'male' : 'female';
  mv(leaver, '기숙사 퇴실', TODAY + 'T15:00:00', '2027-03-12');
  env.setNow('2027-03-12T10:00:00');
  const st2 = cardVsBoard();
  assert.deepStrictEqual([st2[g3].count, st2[g3].vacant], [st1[g3].count - 1, st1[g3].vacant + 1], '기숙사 퇴실 적용일부터 공석');
  assert.ok(env.rows('room_assignments').some((r) => r.student_id === leaver && r.status === '배정'), '배정 행은 지우지 않는다');
});
