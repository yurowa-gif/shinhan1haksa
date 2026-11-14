/**
 * T5 흐름 시험: C28 학사 프로그램(결정 75②). seedFakeStage1~4 위에서, 화면이 부르는 공개 함수만. 가짜 데이터만.
 * 학사 교사가 프로그램을 만들면 참가자마다 '학사 내 프로그램' 특이사항(묶음 id 따로) → 출석부 칸 '내부'.
 * 한 학생 특이사항을 출결 담당이 따로 취소 → 참가자 한 명 빼기 → 프로그램 취소: 남은 특이사항이 함께 취소되고,
 * 따로 취소된 행의 사유는 그대로 남는다. 권한(#182): 출결 담당도 만들기·취소할 수 있고, 담임은 보기도 고치기도 못 한다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com', ATT = 'test.attendance@example.com';
const DATE = '2027-04-14';   // 수, 1학기

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: '2027-04-12T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage4());
  env.asOwner((c) => c.addUser(ATT, '시험 출결', 'attendance'));
  env.strictLock = true;
  return env;
}

test('프로그램 흐름: 만들기 → 참가자마다 특이사항(묶음 따로)·출석부 내부 → 따로 취소·한 명 빼기 → 프로그램 취소(함께 취소, 따로 취소된 사유는 그대로), 출결 담당도 만들기·취소, 담임 거부', () => {
  const env = seededEnv();
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const exTab = () => env.rows(env.as(ADMIN, (c) => c.termSheetName_('exceptions', term.id)));
  const on = (sid) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, '학사', DATE));
  const ids = env.rows('enrollments').filter((e) => e.term_id === term.id).map((e) => e.student_id).filter((sid) => on(sid) === '입실').slice(0, 6);
  const input = { name: '가짜 면접특강', date: DATE, blocks: '20:00-22:00', memo: '', studentIds: ids };

  const pv = plain(env.call(HALL, 'previewProgram', input));
  assert.strictEqual(pv.ok !== false, true, JSON.stringify(pv).slice(0, 300));
  let sv = plain(env.call(HALL, 'saveProgram', input));
  if (sv.needsConfirm) sv = plain(env.call(HALL, 'saveProgram', Object.assign({ confirmOverlap: true }, input)));
  assert.strictEqual(sv.ok, true, JSON.stringify(sv).slice(0, 300));
  assert.strictEqual(sv.count, 6);
  const parts = env.rows('program_participants').filter((p) => p.program_id === sv.id);
  const exOf = (p) => exTab().find((e) => e.id === p.exception_id);
  assert.strictEqual(parts.length, 6);
  parts.forEach((p) => {
    const e = exOf(p);
    assert.ok(e && e.student_id === p.student_id && e.date === DATE && e.blocks === '20:00-22:00' && e.status === '확정' && /^학사 내 프로그램/.test(e.type), JSON.stringify(e));
  });
  assert.strictEqual(new Set(parts.map((p) => exOf(p).group_id)).size, 6, '묶음 id는 참가자마다 따로');
  env.setNow(DATE + 'T15:00:00');
  assert.ok(JSON.stringify(plain(env.call(ADMIN, 'getAttendanceSheet', DATE, true))).includes('내부'), '출석부 칸 내부');

  // 출결 담당이 한 학생의 특이사항을 특이사항 화면에서 따로 취소
  const [p0, p1] = parts;
  const c0 = plain(env.call(ATT, 'cancelException', term.id, exOf(p0).group_id, '가짜: 병원 진료로 불참'));
  assert.strictEqual(c0.ok, true, JSON.stringify(c0));
  // 참가자 한 명 빼기 → 그 학생 특이사항만 취소
  const r1 = plain(env.call(HALL, 'removeProgramStudent', sv.id, p1.student_id, '가짜 사유'));
  assert.strictEqual(r1.ok, true, JSON.stringify(r1));
  assert.strictEqual(exOf(p1).status, '취소');
  assert.strictEqual(exTab().filter((e) => parts.some((p) => p.exception_id === e.id) && e.status !== '취소').length, 4, '나머지 4명은 그대로');

  // 프로그램 취소: 남은 4명 특이사항이 함께 취소, 따로 취소된 행의 사유는 그대로
  const cp = plain(env.call(HALL, 'cancelProgram', sv.id, '가짜: 강사 사정'));
  assert.strictEqual(cp.ok, true, JSON.stringify(cp));
  assert.strictEqual(cp.canceledExceptions, 4, '이미 취소된 2행은 다시 취소하지 않는다');
  parts.forEach((p) => assert.strictEqual(exOf(p).status, '취소'));
  assert.ok(/병원 진료/.test(exOf(p0).cancel_reason) && !/강사 사정/.test(exOf(p0).cancel_reason), '따로 취소된 사유 보존: ' + exOf(p0).cancel_reason);
  assert.ok(parts.slice(2).every((p) => /강사 사정/.test(exOf(p).cancel_reason)), '함께 취소된 행은 프로그램 취소 사유');
  assert.strictEqual(env.rows('programs').find((x) => x.id === sv.id).status, '취소');
  assert.ok(!JSON.stringify(plain(env.call(ADMIN, 'getAttendanceSheet', DATE, true))).includes('내부'), '취소 뒤 출석부에 내부 없음(가짜 파워클래스는 다른 날)');
  assert.ok(exTab().length >= parts.length, '행은 지우지 않는다');

  // 권한(#182): 출결 담당도 만들기·취소, 담임은 보기도 고치기도 못 한다
  assert.ok(JSON.stringify(plain(env.call(ATT, 'listPrograms', { termId: term.id }))).includes(sv.id), '출결 담당 목록에 이 프로그램');
  const other = Object.assign({}, input, { name: '가짜 다른 특강', studentIds: ids.slice(0, 2), confirmOverlap: true });
  const as = plain(env.call(ATT, 'saveProgram', other));
  assert.deepStrictEqual([as.ok, as.count], [true, 2], JSON.stringify(as).slice(0, 300));
  const ac = plain(env.call(ATT, 'cancelProgram', as.id, '가짜: 일정 변경'));
  assert.deepStrictEqual([ac.ok, ac.canceledExceptions], [true, 2], JSON.stringify(ac));
  env.expectDenied(HOMEROOM, 'program.edit', 'saveProgram', Object.assign({}, other, { name: '가짜 세 번째 특강' }));
  env.expectDenied(HOMEROOM, 'program.view', 'listPrograms', {});
});
