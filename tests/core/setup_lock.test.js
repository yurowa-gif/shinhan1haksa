/** Setup.gs addUser·setup()의 소유자 등록: 같은 이메일 찾기(읽기)와 쓰기를 한 락 안에서 한다. gas-fakes strictLockRead(true = 모든 실행)가 락 밖 읽기 → 락 안 쓰기를 잡는다. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const mk = () => createGasEnv({ now: '2027-03-03T12:00:00', strictLockRead: true });

test('strictLockRead 켠 환경에서 setup()이 통과하고 소유자 줄이 하나만 있다(두 번 실행해도)', () => {
  const env = mk();
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.setup());
  const owners = env.rows('users').filter((u) => u.email === env.owner);
  assert.strictEqual(owners.length, 1);
  assert.strictEqual(owners[0].roles, 'admin,hall_teacher');
});

test('addUser: 새 계정은 한 줄 추가, 같은 이메일(대소문자·공백 달라도)은 새 줄 없이 고친다. 락 밖에서 읽고 락 안에서 쓰면 strictLockRead가 잡는다', () => {
  const env = mk();
  env.asOwner((c) => c.setup());
  const n0 = env.rows('users').length;
  env.asOwner((c) => c.addUser('Fake.New@Example.com ', '새교사', 'hall_teacher'));
  assert.strictEqual(env.rows('users').length, n0 + 1);
  env.asOwner((c) => c.addUser('fake.new@example.com', '이름 고침', 'hall_teacher,homeroom', '1-1'));
  const rows = env.rows('users').filter((u) => u.email === 'fake.new@example.com');
  assert.strictEqual(rows.length, 1, '같은 이메일은 두 줄이 되지 않는다');
  assert.deepStrictEqual([rows[0].name, rows[0].roles, rows[0].homeroom_class], ['이름 고침', 'hall_teacher,homeroom', '1-1']);
  assert.strictEqual(env.rows('users').length, n0 + 1);
});

test('addUser: 같은 실행 안의 락 안에서 호출돼도(중첩) 동작한다 — 읽기 캐시를 락 안에서 다시 읽는다', () => {
  const env = mk();
  env.asOwner((c) => c.setup());
  env.asOwner((c) => { c.readAll_('users'); c.withLock_(() => c.addUser('inner@example.com', '안쪽', 'attendance')); });
  assert.strictEqual(env.rows('users').filter((u) => u.email === 'inner@example.com').length, 1);
});
