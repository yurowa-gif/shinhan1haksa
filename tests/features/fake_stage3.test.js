/** T3a 가짜 3단계 데이터(src/dev/FakeStage3.gs): 순수 함수 검사 + 편집기 함수를 gas-fakes에서 두 번 실행 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ctx = loadGs(['src/Schema.gs', 'src/Setup.gs', 'src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/StatusRules.gs',
  'src/rules/MealRules.gs', 'src/rules/MoveRules.gs', 'src/rules/OutRules.gs', 'src/rules/DutyRules.gs',
  'src/dev/FakeData.gs', 'src/dev/FakeSeats.gs', 'src/dev/FakeStage1.gs', 'src/dev/FakeStage2.gs', 'src/dev/FakeStage3.gs']);
const fake = ctx.buildFakeData_({ ownerEmail: 'owner@test.invalid', teacherEmail: 'test.teacher@example.com' });
/** setup의 seedRooms_와 같은 35실(id만 가짜) */
const ROOMS = [];
plain(ctx.DEFAULT_ROOM_FLOORS).forEach(([floor, from, to]) => {
  for (let no = from; no <= to; no++) ROOMS.push({ id: 'room-' + no, floor: String(floor), room_no: String(no), gender: no <= 12 ? '남' : '여', capacity: '4', sort_order: String(ROOMS.length + 1), status: '유효', memo: '' });
});
const d = plain(ctx.buildFakeStage3_(fake, ROOMS));
const s1 = plain(ctx.buildFakeStage1_(fake));
const stu = Object.fromEntries(plain(fake.students).map((s) => [s.id, s]));
const enr = (termId, sid) => plain(fake.enrollments).find((e) => e.term_id === termId && e.student_id === sid);
const dormIds = new Set(s1.statusChanges.filter((c) => c.item === '기숙사' && c.value === '입실').map((c) => c.student_id));
const roomOf = Object.fromEntries(d.roomAssignments.map((r) => [r.student_id, r.room_id]));
const cols = (tab) => ['id'].concat(ctx.SCHEMA.db[tab]).sort();

test('떨어뜨릴 짝 3쌍: scope 좌석·방·둘 다 하나씩, 여섯 명 모두 다르고 같은 성별, 어휘·열', () => {
  assert.deepStrictEqual(d.avoidPairs.map((p) => p.scope), ['좌석', '방', '둘 다']);
  const people = d.avoidPairs.flatMap((p) => [p.student_a, p.student_b]);
  assert.strictEqual(new Set(people).size, 6);
  for (const p of d.avoidPairs) {
    assert.ok(stu[p.student_a] && stu[p.student_b] && p.student_a !== p.student_b);
    assert.strictEqual(stu[p.student_a].gender, stu[p.student_b].gender, '같은 성별(같은 구역·같은 층에서만 이웃·같은 방이 될 수 있다)');
    assert.ok(enr(d.term.id, p.student_a) && enr(d.term.id, p.student_b), '이번 기간 등록 학생');
    assert.ok(p.reason && p.status === '유효');
    assert.deepStrictEqual(Object.keys(p).sort(), cols('avoid_pairs'));
    if (p.scope !== '방') assert.ok([p.student_a, p.student_b].every((s) => enr(d.term.id, s).veritas !== 'TRUE'), '좌석 짝은 1층(비베리타스)');
    if (p.scope !== '좌석') {
      assert.ok(dormIds.has(p.student_a) && dormIds.has(p.student_b), '방 짝은 기숙사생');
      assert.notStrictEqual(roomOf[p.student_a], roomOf[p.student_b], '시드 방 배정에서 방 짝은 다른 방');
    }
  }
});

test('지난 기간(2026 2학기) 좌석 배정: 등록 학생 1명 1자리, 성별 구역·베리타스 SA, 3학년 전원 1학기와 다른 자리(유지 확인용)', () => {
  const prev = d.prevTerm.id, a = d.prevSeatAssignments;
  assert.strictEqual(prev, plain(fake.terms)[0].id);
  assert.strictEqual(a.length, plain(fake.enrollments).filter((e) => e.term_id === prev).length);
  assert.strictEqual(new Set(a.map((x) => x.seat_id)).size, a.length, '한 자리에 두 명 없음');
  assert.strictEqual(new Set(a.map((x) => x.student_id)).size, a.length);
  const seat = Object.fromEntries(s1.seats.map((s) => [s.id, s])), space = Object.fromEntries(s1.spaces.map((s) => [s.id, s]));
  for (const x of a) {
    assert.deepStrictEqual([x.term_id, x.status, x.valid_from, x.valid_to], [prev, '배정', '', '']);
    assert.deepStrictEqual(Object.keys(x).sort(), cols('seat_assignments'));
    assert.strictEqual(seat[x.seat_id].kind, '좌석');
    const sp = space[seat[x.seat_id].space_id];
    if (sp.gender !== '혼성') {
      assert.strictEqual(sp.gender, stu[x.student_id].gender, 'SA실은 같은 성별');
      assert.strictEqual(enr(prev, x.student_id).veritas, 'TRUE', 'SA실은 베리타스');
    }
  }
  const now = Object.fromEntries(s1.seatAssignments.map((x) => [x.student_id, x.seat_id]));
  const g3 = a.filter((x) => stu[x.student_id].grade === '3');
  assert.ok(g3.length >= 5, '3학년이 여럿');
  assert.ok(g3.every((x) => now[x.student_id] !== x.seat_id), '3학년 지난 자리는 지금 자리와 달라 초안의 "유지"가 눈에 보인다');
});

test('2027 1학기 방 배정: 기숙사생 전원 한 번씩, 같은 성별 호실, 방마다 3명 이하, 중도 입실자는 입실일부터', () => {
  const a = d.roomAssignments;
  assert.deepStrictEqual(new Set(a.map((r) => r.student_id)), dormIds);
  assert.strictEqual(a.length, dormIds.size);
  const room = Object.fromEntries(ROOMS.map((r) => [r.id, r])), n = {};
  for (const r of a) {
    assert.deepStrictEqual([r.term_id, r.status, r.valid_to], [d.term.id, '배정', '']);
    assert.deepStrictEqual(Object.keys(r).sort(), cols('room_assignments'));
    assert.strictEqual(room[r.room_id].gender, stu[r.student_id].gender);
    n[r.room_id] = (n[r.room_id] || 0) + 1;
  }
  assert.ok(Object.values(n).every((k) => k <= 3), '정원 4 안(초안이 채울 자리가 남는다)');
  const late = a.find((r) => r.student_id === s1.lateEntrantId);
  if (late) assert.strictEqual(late.valid_from, '2027-03-15');
  assert.ok(a.filter((r) => r.student_id !== s1.lateEntrantId).every((r) => r.valid_from === ''));
  assert.throws(() => ctx.buildFakeStage3_(fake, []), /setup/);
});

test('같은 입력이면 같은 결과(id 포함), id는 1·2단계 가짜 데이터와 겹치지 않는다', () => {
  assert.deepStrictEqual(plain(ctx.buildFakeStage3_(ctx.buildFakeData_({}), ROOMS)), d, '시험 이메일이 달라도 같은 데이터');
  const s2 = plain(ctx.buildFakeStage2Duty_(fake));
  const ids = d.avoidPairs.concat(d.prevSeatAssignments, d.roomAssignments, s1.seatAssignments, s1.statusChanges, s2.dutySlots).map((r) => r.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

/* ---------- 편집기 함수 ---------- */
function seededEnv(opts) {
  const env = createGasEnv({ owner: 'owner@example.com', now: '2027-02-20T10:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = 'test.teacher@example.com';
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  if (!(opts && opts.noStage1)) env.asOwner((c) => c.seedFakeStage1());
  return env;
}
const counts = (env) => ['avoid_pairs', 'seat_assignments', 'room_assignments'].map((t) => env.rows(t).length);

test('seedFakeStage3: 두 번 실행해도 같음(+0), room_id는 setup이 만든 호실, 시트에서 읽어도 순수 함수와 같은 배정', () => {
  const env = seededEnv();
  const before = counts(env);
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage3()), '가짜 3단계 데이터: avoid_pairs +3, seat_assignments +30, room_assignments +' + d.roomAssignments.length);
  const first = [env.rows('avoid_pairs'), env.rows('seat_assignments'), env.rows('room_assignments')].map((x) => JSON.stringify(x));
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage3()), '가짜 3단계 데이터: avoid_pairs +0, seat_assignments +0, room_assignments +0');
  assert.deepStrictEqual([env.rows('avoid_pairs'), env.rows('seat_assignments'), env.rows('room_assignments')].map((x) => JSON.stringify(x)), first, '두 번째 실행 뒤 시트 그대로');
  assert.deepStrictEqual(counts(env), [before[0] + 3, before[1] + 30, before[2] + d.roomAssignments.length]);
  const rooms = Object.fromEntries(env.rows('rooms').map((r) => [r.id, r]));
  const sheetRooms = env.rows('room_assignments');
  assert.ok(sheetRooms.every((r) => rooms[r.room_id]), 'room_id는 rooms 탭의 id');
  const byNo = Object.fromEntries(ROOMS.map((r) => [r.id, r.room_no]));
  assert.deepStrictEqual(sheetRooms.map((r) => [r.student_id, rooms[r.room_id].room_no]), d.roomAssignments.map((r) => [r.student_id, byNo[r.room_id]]), '같은 호실 번호');
});

test('seedFakeStage3: 1단계 없음·가짜 아닌 학생·다른 지난 기간 좌석 배정이 있으면 아무것도 쓰지 않는다', () => {
  const a = seededEnv({ noStage1: true });
  assert.match(a.errorOf(a.owner, (c) => c.seedFakeStage3()).message, /seedFakeStage1/);
  assert.deepStrictEqual(counts(a), [0, 0, 0]);
  const b = seededEnv();
  b.asOwner((c) => c.appendRecord_('students', { student_no: '39998', name: '진짜', gender: '여', grade: '3', class_no: '9', number: '98', track: '', email: 'x@school.invalid', memo: '' }, b.owner));
  const nb = counts(b);
  assert.match(b.errorOf(b.owner, (c) => c.seedFakeStage3()).message, /가짜 학생/);
  assert.deepStrictEqual(counts(b), nb);
  const e = seededEnv();
  const prev = e.rows('terms').find((t) => t.name === '2026 2학기(테스트)');
  e.asOwner((c) => c.appendRecord_('seat_assignments', { term_id: prev.id, seat_id: e.rows('seats')[0].id, student_id: e.rows('students')[0].id,
    valid_from: '', valid_to: '', status: '배정', memo: '' }, e.owner));
  const ne = counts(e);
  assert.match(e.errorOf(e.owner, (c) => c.seedFakeStage3()).message, /다른 행이 1개/);
  assert.deepStrictEqual(counts(e), ne);
});
