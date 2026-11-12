/** 응답에 이름 대신 메일 주소가 나가지 않는다: 요청자·수정자가 users에 없으면 '(등록 안 된 교사)'(Duty·Outs와 같은 말). R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', ATT = 'test.attendance@example.com', HALL = 'test.teacher@example.com';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-02T17:00:00' });
  env.seedFake({ stage1: true });
  return env;
}
const changeEmail = (env, email) => env.asOwner((c) => c.updateRecord_('users', env.rows('users').find((u) => u.email === email).id, { email: 'changed.' + email }, ADMIN));

test('listExceptions: 요청자가 users에 없으면 메일 주소 대신 "(등록 안 된 교사)", 있으면 이름', () => {
  const env = makeEnv();
  const stu = env.rows('students')[2];
  const r = plain(env.call(ATT, 'saveException', { studentId: stu.id, from: '2027-03-18', blocks: 'ALL', type: '병결' }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const names = (who) => plain(env.call(who, 'listExceptions', { scope: 'student', studentId: stu.id })).groups.map((g) => g.requestedByName);
  const attName = env.rows('users').find((u) => u.email === ATT).name;
  assert.deepStrictEqual(names(ADMIN), [attName], '대조: 등록된 요청자는 이름');
  changeEmail(env, ATT);   // 요청자의 users.email이 바뀌어 요청 행의 메일과 맞지 않게 된다
  const after = plain(env.call(ADMIN, 'listExceptions', { scope: 'student', studentId: stu.id }));
  assert.deepStrictEqual(after.groups.map((g) => g.requestedByName), ['(등록 안 된 교사)']);
  assert.ok(!JSON.stringify(after).includes(ATT), '응답에 요청자 메일 주소가 없다');
});

test('getAvoidPairs: 수정자 updatedBy도 이름(없으면 "(등록 안 된 교사)"), 메일 주소는 나가지 않는다', () => {
  const env = makeEnv();
  const d = plain(env.call(HALL, 'getAvoidPairs'));
  const [a, b] = d.students;
  const r = plain(env.call(HALL, 'saveAvoidPair', { studentA: a.id, studentB: b.id, scope: '방', reason: '시험' }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const hallName = env.rows('users').find((u) => u.email === HALL).name;
  assert.strictEqual(plain(env.call(ADMIN, 'getAvoidPairs')).pairs[0].updatedBy, hallName);
  changeEmail(env, HALL);
  const after = plain(env.call(ADMIN, 'getAvoidPairs'));
  assert.strictEqual(after.pairs[0].updatedBy, '(등록 안 된 교사)');
  assert.ok(!JSON.stringify(after).includes(HALL), '응답에 수정자 메일 주소가 없다');
});
