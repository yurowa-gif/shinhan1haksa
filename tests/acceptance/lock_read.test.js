/**
 * gas-fakes strictLockRead(T4c 락 7번): 한 실행에서 락 밖에서 읽은 탭을, 지금 쥔 락 안에서 다시 읽지 않고 쓰면 오류.
 * readAll_ 메모가 락 밖에서 읽은 값을 그대로 주면 "읽고 검사하고 쓰기"가 한 덩어리가 아니다(바깥 withLock_를 뺀 저장 함수).
 * 기본 'call'(env.call — 화면 경계 — 실행만). 편집기 실행(asOwner)·내부 확인(as)은 끄지만 true로 켤 수 있다.
 */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';
const row = { student_a: 'a', student_b: 'b', scope: '좌석', reason: '', status: '유효' };

function setupEnv(opts) {
  const env = createGasEnv(Object.assign({ owner: ADMIN, now: '2027-03-09T15:00:00' }, opts || {}));
  env.asOwner((c) => c.setup());
  return env;
}

test('strictLockRead: 기본은 env.call만 — as·asOwner에서는 락 밖에서 읽고 써도 오류 아님', () => {
  const env = setupEnv();
  assert.strictEqual(env.strictLockRead, 'call');
  env.as(ADMIN, (c) => { c.readAll_('avoid_pairs'); c.appendRecord_('avoid_pairs', row, ADMIN); });
  assert.strictEqual(env.rows('avoid_pairs').length, 1);
});

test('strictLockRead true: 락 밖에서 읽은 탭을 락 안에서 다시 읽지 않고 쓰면 오류, 쓰기 없음. 락 안에서 다시 읽으면 통과', () => {
  const env = setupEnv({ strictLockRead: true });
  env.as(ADMIN, (c) => c.appendRecord_('avoid_pairs', row, ADMIN));   // 데이터 행 하나(머리글 아래를 읽게)
  const err = env.errorOf(ADMIN, (c) => { c.readAll_('avoid_pairs'); c.appendRecord_('avoid_pairs', row, ADMIN); });
  assert.ok(err && /락 밖에서 읽은 avoid_pairs 탭/.test(err.message), String(err && err.message));
  assert.strictEqual(env.rows('avoid_pairs').length, 1, '쓰기 없음');
  // 같은 실행에서 락 안에서 다시 읽고 쓰면 통과(머리글만 읽는 것은 세지 않는다)
  env.as(ADMIN, (c) => {
    c.readAll_('avoid_pairs');
    c.withLock_(() => { c.invalidate_('db', 'avoid_pairs'); c.readAll_('avoid_pairs'); c.appendRecord_('avoid_pairs', row, ADMIN); });
  });
  assert.strictEqual(env.rows('avoid_pairs').length, 2);
  // 다른 탭을 락 밖에서 읽은 것은 상관없다
  env.as(ADMIN, (c) => { c.readAll_('students'); c.appendRecord_('avoid_pairs', row, ADMIN); });
  assert.strictEqual(env.rows('avoid_pairs').length, 3);
});

test('strictLockRead false: 꺼짐', () => {
  const env = setupEnv({ strictLockRead: false });
  assert.strictEqual(env.strictLockRead, false);
  env.strictLockRead = true;
  assert.ok(env.errorOf(ADMIN, (c) => { c.appendRecord_('avoid_pairs', row, ADMIN); c.invalidate_('db', 'avoid_pairs'); c.readAll_('avoid_pairs'); c.appendRecord_('avoid_pairs', row, ADMIN); }), '대조: 켜면 오류');
  env.strictLockRead = false;
  env.as(ADMIN, (c) => c.appendRecord_('avoid_pairs', row, ADMIN));
  env.as(ADMIN, (c) => { c.readAll_('avoid_pairs'); c.appendRecord_('avoid_pairs', row, ADMIN); });
  assert.strictEqual(env.rows('avoid_pairs').length, 3, '대조 실행의 첫 쓰기 1 + 꺼진 뒤 2');
});
