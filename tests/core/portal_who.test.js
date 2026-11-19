/** S7-0(결정 82): 신원 판정 한 곳 portalWho_ — 본인 학생 id·자녀 id, studentFacts_ 연결, facility.* 권한 키, facility_logs 탭·설정. gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com';
const STRANGER = 'stranger@example.com';

function seeded() {
  const env = createGasEnv({ owner: OWNER, now: '2027-03-09T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.addUser(ATT, '시험 출결', 'attendance'));
  return env;
}
const who = (env, email) => plain(env.as(email, (c) => c.portalWho_()));

test('portalWho_: 학생 = students.email로 본인 id 하나, 자녀 없음. 학부모 = guardian_links로 자녀 id 목록(중복 없음), 본인 학생 없음', () => {
  const env = seeded();
  const mine = env.rows('students').find((s) => String(s.email).toLowerCase() === STUDENT);
  const kids = env.rows('guardian_links').filter((g) => String(g.parent_email).toLowerCase() === PARENT).map((g) => g.student_id);
  assert.ok(mine && kids.length >= 2, '가짜 데이터: 학생 1명·학부모 자녀 2명 이상');
  const s = who(env, STUDENT);
  assert.deepStrictEqual([s.isStudent, s.isParent, s.studentId, s.ownStudentIds, s.childIds], [true, false, mine.id, [mine.id], []]);
  const p = who(env, PARENT);
  assert.deepStrictEqual([p.isStudent, p.isParent, p.studentId, p.ownStudentIds, p.childIds], [false, true, '', [], [...new Set(kids)]]);
});

test('portalWho_: 교사·미등록 계정·이메일 없음은 본인 학생·자녀가 비어 있다(역할이 없으면 이메일이 같아도 안 잡힌다)', () => {
  const env = seeded();
  for (const email of [HALL, HOMEROOM, ATT, OWNER, STRANGER]) {
    const w = who(env, email);
    assert.deepStrictEqual([w.isStudent, w.isParent, w.studentId, w.childIds], [false, false, '', []], email);
  }
  assert.strictEqual(who(env, STRANGER).registered, false);
  // 교사 계정에 학생 이메일과 같은 이메일이 students에 적혀 있어도 student 역할이 없으면 본인이 아니다
  const st = env.rows('students')[5];
  env.asOwner((c) => c.updateRecord_('students', st.id, { email: HALL }, OWNER));
  assert.deepStrictEqual([who(env, HALL).studentId, who(env, HALL).ownStudentIds], ['', []]);
  assert.strictEqual(plain(env.as('', (c) => c.portalWho_())).studentId, '');
});

test('studentFacts_·requirePermission_: isOwn·isGuardian은 portalWho_에서 — 학생은 본인만, 학부모는 연결된 자녀만(다른 집 자녀·다른 학생은 거부)', () => {
  const env = seeded();
  const mine = env.rows('students').find((s) => String(s.email).toLowerCase() === STUDENT);
  const kids = [...new Set(env.rows('guardian_links').filter((g) => String(g.parent_email).toLowerCase() === PARENT).map((g) => g.student_id))];
  const other = env.rows('students').find((s) => s.id !== mine.id && !kids.includes(s.id));
  const facts = (email, sid) => plain(env.as(email, (c) => c.studentFacts_(c.getCurrentUser_(), c.findById_('students', sid))));
  assert.deepStrictEqual([facts(STUDENT, mine.id).isOwn, facts(STUDENT, other.id).isOwn, facts(STUDENT, mine.id).isGuardian], [true, false, false]);
  assert.deepStrictEqual([facts(PARENT, kids[0]).isGuardian, facts(PARENT, other.id).isGuardian, facts(PARENT, kids[0]).isOwn], [true, false, false]);
  const view = (email, sid) => env.as(email, (c) => c.requirePermission_('student.view', { studentId: sid }));
  view(STUDENT, mine.id); view(PARENT, kids[0]);
  assert.throws(() => view(STUDENT, other.id), /권한이 없습니다/);
  assert.throws(() => view(PARENT, other.id), /권한이 없습니다/);
});

test('권한 키: facility.write는 학생 본인만, facility.view는 admin·hall_teacher(dutyWindow 0), facility.report는 관리자만', () => {
  const env = seeded();
  const keys = env.as(OWNER, (c) => plain(c.permissions_()));
  assert.deepStrictEqual([keys['facility.write'].roles, keys['facility.write'].scope], [['student'], 'student']);
  assert.deepStrictEqual([keys['facility.view'].roles, keys['facility.view'].dutyWindow], [['admin', 'hall_teacher'], 0]);
  assert.deepStrictEqual(keys['facility.report'].roles, ['admin']);
  const mine = env.rows('students').find((s) => String(s.email).toLowerCase() === STUDENT);
  const other = env.rows('students').find((s) => s.id !== mine.id);
  const ctxOf = (sid) => ({ studentId: sid });
  const fn = (action, ctx) => (c) => c.requirePermission_(action, ctx);
  env.as(STUDENT, fn('facility.write', ctxOf(mine.id)));   // 본인: 통과
  const denied = (email, action, ctx) => assert.throws(() => env.as(email, fn(action, ctx)), /권한이 없습니다/, email + ' ' + action);
  denied(STUDENT, 'facility.write', ctxOf(other.id));   // 다른 학생
  denied(PARENT, 'facility.write', ctxOf(mine.id));   // 학부모
  denied(HALL, 'facility.write', ctxOf(mine.id));   // 교사
  denied(OWNER, 'facility.write', ctxOf(mine.id));   // 관리자도 학생 대신 쓰지 않는다
  denied(STUDENT, 'facility.view', {}); denied(PARENT, 'facility.view', {}); denied(HOMEROOM, 'facility.view', {});
  denied(HALL, 'facility.report', {}); denied(STUDENT, 'facility.report', {});
  env.as(OWNER, fn('facility.view', {})); env.as(HALL, fn('facility.view', {})); env.as(OWNER, fn('facility.report', {}));
});

test('facility_logs 탭: 기간마다 생기고 헤더(공통 열 규칙)·설정 facility.names 기본값', () => {
  const env = seeded();
  env.asOwner((c) => c.setup());   // 가짜 데이터가 만든 기간의 기간별 탭은 setup이 만든다
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const tab = 'facility_logs_' + term.id.slice(0, 8);
  assert.deepStrictEqual(env.sheetValues(tab)[0].map(String), ['id', 'term_id', 'student_id', 'facility', 'date', 'start', 'end', 'companions', 'purpose', 'status', 'cancel_reason', 'created_at', 'created_by', 'updated_at', 'updated_by']);
  const names = env.rows('settings', 'config').find((r) => r.key === 'facility.names');
  assert.deepStrictEqual([names.value], ['특강실,원형테이블']);
});
