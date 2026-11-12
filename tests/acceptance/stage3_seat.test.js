/**
 * T3 끝까지(stage3.md 0절, F5): 2027 1학기 명단으로 좌석 초안을 만들어 저장한다.
 * seedFakeStage3(짝 3쌍·2026 2학기 좌석) 위에서 학사 교사가 previewSeatDraft → saveSeatDraft.
 * 확인: 성별 구역·베리타스 SA실·3학년 지난 자리 유지, 짝 정보는 담임·출결 응답에 없음, 어제 출석부는 그대로·오늘부터 새 배정,
 * 입실 전 학생 자리 유지, 두 번 저장해도 한 벌. 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com', ATT = 'test.attendance@example.com';
const TODAY = '2027-03-09', YESTERDAY = '2027-03-08';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage3());
  env.asOwner((c) => c.addUser(ATT, '시험 출결', 'attendance'));
  env.strictLock = true;
  return env;
}

test('끝까지 좌석 초안: 성별·SA·3학년 유지, 짝 정보는 권한 밖에 없음, 어제 출석부 그대로·오늘부터 새 배정, 입실 전 학생 자리 유지, 두 번 저장해도 한 벌', () => {
  const env = seededEnv();
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const prevTerm = env.rows('terms').find((t) => t.name === '2026 2학기(테스트)');
  const stu = Object.fromEntries(env.rows('students').map((s) => [s.id, s]));
  const enr = Object.fromEntries(env.rows('enrollments').filter((e) => e.term_id === term.id).map((e) => [e.student_id, e]));
  const seat = Object.fromEntries(env.rows('seats').map((s) => [s.id, s]));
  const space = Object.fromEntries(env.rows('spaces').map((s) => [s.id, s]));
  const pairs = env.rows('avoid_pairs');
  const sheet = (date, who) => JSON.stringify(plain(env.call(who || ADMIN, 'getAttendanceSheet', date)));
  const cells = (d) => d.spaces.flatMap((s) => s.cells);

  // 준비: 3/15 중도 입실 학생에게 미리 자리를 준다(입실 전 → 출석부에는 공석, 초안은 이 자리를 지운다면 안 된다)
  const late = env.rows('status_changes').find((c) => c.item === '학사' && c.value === '입실' && c.effective_date === '2027-03-15').student_id;
  let d = plain(env.call(HALL, 'getSeatData', term.id));
  const free = cells(d).find((c) => c.kind === 'seat' && !c.studentId && space[seat[c.id].space_id].name === '1층 자습실');
  const a = plain(env.call(HALL, 'assignSeat', term.id, free.id, late, { [free.id]: free.token }));
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  const yesterdayBefore = sheet(YESTERDAY);

  // 학사 교사: 미리보기 → 저장
  d = plain(env.call(HALL, 'getSeatData', term.id));
  const p = plain(env.call(HALL, 'previewSeatDraft', term.id, [], 20270309));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.ok(p.warnings.some((w) => /입실 전 학생 1명의 자리는 그대로 둡니다/.test(w)), JSON.stringify(p.warnings));
  const draft = { seed: p.seed, sig: p.sig, base: p.base, fixed: p.fixed };
  const s1 = plain(env.call(HALL, 'saveSeatDraft', term.id, draft));
  assert.strictEqual(s1.ok, true, JSON.stringify(s1));
  assert.ok(s1.created > 0);

  // 오늘 좌석표(저장 결과)
  const now = plain(env.call(HALL, 'getSeatData', term.id));
  const holder = Object.fromEntries(cells(now).filter((c) => c.studentId).map((c) => [c.studentId, c.id]));
  const placed = Object.keys(holder);
  assert.strictEqual(new Set(Object.values(holder)).size, placed.length, '한 자리에 한 명');
  // 성별 구역·베리타스 SA실
  for (const sid of placed) {
    const sp = space[seat[holder[sid]].space_id];
    if (sp.gender !== '혼성') {
      assert.strictEqual(sp.gender, stu[sid].gender, stu[sid].name + ' SA실 성별');
      assert.strictEqual(enr[sid].veritas, 'TRUE', stu[sid].name + ' SA실은 베리타스');
    }
    if (enr[sid].veritas === 'TRUE') assert.notStrictEqual(sp.gender, '혼성', stu[sid].name + ' 베리타스는 SA실(자리가 남아 있음)');
  }
  // 3학년 지난 자리 유지: 지난 기간(T3a) 자리가 지금 규칙에도 맞으면(1층↔비베리타스, SA↔같은 성별 베리타스) 그 자리
  const prev = Object.fromEntries(env.rows('seat_assignments').filter((r) => r.term_id === prevTerm.id && r.status === '배정').map((r) => [r.student_id, r.seat_id]));
  const fits = (sid, seatId) => {
    const sp = space[seat[seatId].space_id];
    return sp.gender === '혼성' ? enr[sid].veritas !== 'TRUE' : sp.gender === stu[sid].gender && enr[sid].veritas === 'TRUE';
  };
  const g3 = placed.filter((sid) => stu[sid].grade === '3' && prev[sid] && fits(sid, prev[sid]) && sid !== late);
  assert.ok(g3.length >= 3, '맞는 3학년이 여럿 ' + g3.length);
  g3.forEach((sid) => assert.strictEqual(holder[sid], prev[sid], stu[sid].name + ' 3학년 지난 자리 유지'));
  // 입실 전 학생 자리 유지(저장 뒤에도 같은 자리, 입실하는 3/15 출석부에는 이름)
  assert.ok(env.rows('seat_assignments').some((r) => r.student_id === late && r.seat_id === free.id && r.status === '배정' && !r.valid_to), '입실 전 학생 행 그대로');
  assert.ok(sheet('2027-03-15').includes(stu[late].name), '3/15 출석부에 중도 입실 학생');

  // 어제 출석부는 그대로, 오늘 출석부는 새 배정
  assert.strictEqual(sheet(YESTERDAY), yesterdayBefore, '어제 출석부는 저장 전과 같다');
  const today = plain(env.call(ADMIN, 'getAttendanceSheet', TODAY));
  const moved = placed.find((sid) => sid !== late && d.spaces.flatMap((s) => s.cells).find((c) => c.studentId === sid)?.id !== holder[sid]);
  assert.ok(moved, '자리가 바뀐 학생이 있다');
  assert.ok(JSON.stringify(today).includes(stu[moved].name));

  // 짝 정보: 학사 교사는 짝 위반을 볼 수 있고(있다면), 담임·출결 응답에는 짝 위반·사유·짝 학생 묶음이 없다
  for (const who of [HOMEROOM, ATT]) {
    const view = JSON.stringify(plain(env.call(who, 'getSeatData', term.id)));
    assert.ok(!view.includes('떨어뜨릴 짝'), who + ' 응답에 짝 위반 없음');
    pairs.forEach((x) => assert.ok(!view.includes(x.reason) && !view.includes(x.id), who + ' 응답에 짝 사유·id 없음'));
    env.expectDenied(who, 'seat.edit', 'previewSeatDraft', term.id, [], 20270309);
  }
  const hallView = JSON.stringify(plain(env.call(HALL, 'getSeatData', term.id)));
  pairs.forEach((x) => assert.ok(!hallView.includes(x.reason), '좌석 화면에는 짝 사유를 싣지 않는다(짝 관리 화면에서만)'));

  // 두 번 저장해도 한 벌
  const n = env.rows('seat_assignments').length;
  const p2 = plain(env.call(HALL, 'previewSeatDraft', term.id, [], 20270309));
  const s2 = plain(env.call(HALL, 'saveSeatDraft', term.id, { seed: p2.seed, sig: p2.sig, base: p2.base, fixed: p2.fixed }));
  assert.deepStrictEqual([s2.ok, s2.noop], [true, true], JSON.stringify(s2));
  assert.strictEqual(p2.changed, 0, '같은 seed 미리보기는 바뀌는 자리 0');
  assert.strictEqual(env.rows('seat_assignments').length, n);
  const live = env.rows('seat_assignments').filter((r) => r.term_id === term.id && r.status === '배정' && !r.valid_to);
  assert.strictEqual(new Set(live.map((r) => r.student_id)).size, live.length, '학생마다 살아 있는 배정 한 줄');
});
