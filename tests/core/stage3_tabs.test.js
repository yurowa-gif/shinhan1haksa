/** S3-0 결정 64: 새 탭 3개·권한 키·기본 35실 시드. 가짜 데이터만. */
const assert = require('assert');
const { test, plain, loadGs } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ctx = loadGs(['src/Schema.gs', 'src/Auth.gs']);

test('결정 64 탭 3개: 열이 그대로, 기존 탭은 그대로, 공통 열 규칙', () => {
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.avoid_pairs), ['student_a', 'student_b', 'scope', 'reason', 'status']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.rooms), ['floor', 'room_no', 'gender', 'capacity', 'sort_order', 'status', 'memo']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.room_assignments), ['term_id', 'room_id', 'student_id', 'valid_from', 'valid_to', 'status', 'memo']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.seat_assignments), ['term_id', 'seat_id', 'student_id', 'valid_from', 'valid_to', 'status', 'memo']);
  ['avoid_pairs', 'rooms', 'room_assignments'].forEach((t) => {
    const h = plain(ctx.headersFor_('db', t));
    assert.strictEqual(h[0], 'id');
    assert.deepStrictEqual(h.slice(-4), ['created_at', 'created_by', 'updated_at', 'updated_by']);
  });
});

test('권한 키: 역할 표가 결정 64·stage3.md S3-0 그대로(짝은 관리자·학사 교사만)', () => {
  const p = plain(ctx.permissions_());
  const roles = (k) => p[k].roles.slice().sort();
  assert.deepStrictEqual(roles('avoid.view'), ['admin', 'hall_teacher']);
  assert.deepStrictEqual(roles('avoid.edit'), ['admin', 'hall_teacher']);
  assert.deepStrictEqual(roles('room.view'), ['admin', 'attendance', 'duty_manager', 'hall_teacher']);
  assert.deepStrictEqual(roles('room.edit'), ['admin', 'hall_teacher']);
  assert.deepStrictEqual(roles('room.layout'), ['admin']);
  ['avoid.view', 'avoid.edit', 'room.view', 'room.edit', 'room.layout'].forEach((k) => {
    ['homeroom', 'student', 'parent'].forEach((r) => assert.ok(!p[k].roles.includes(r), k + ' ' + r));
    assert.ok(!p[k].wideView, k);
  });
});

const ROOM_KEY = (r) => r.floor + '-' + r.room_no;

test('setup()이 호실 35실을 채운다: 층 구간·성별·정원·정렬, 두 번 돌려도 35실', () => {
  const env = createGasEnv({});
  env.seedFake();
  const rooms = () => env.rows('rooms');
  assert.strictEqual(rooms().length, 35);
  const by = (f) => rooms().filter((r) => r.floor === String(f)).map((r) => Number(r.room_no));
  assert.deepStrictEqual(by(3), [1, 2, 3, 4]);
  assert.deepStrictEqual(by(4), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepStrictEqual(by(5), [13, 14, 15, 16, 17, 18, 19]);
  assert.deepStrictEqual(by(6), [20, 21, 22, 23, 24, 25, 26, 27]);
  assert.deepStrictEqual(by(7), [28, 29, 30, 31, 32, 33, 34, 35]);
  rooms().forEach((r) => {
    assert.strictEqual(r.gender, Number(r.room_no) <= 12 ? '남' : '여', ROOM_KEY(r));
    assert.strictEqual(r.capacity, '4');
    assert.strictEqual(r.status, '유효');
  });
  assert.strictEqual(rooms().filter((r) => r.gender === '남').length, 12);
  assert.strictEqual(rooms().filter((r) => r.gender === '여').length, 23);
  assert.deepStrictEqual(rooms().map((r) => Number(r.sort_order)), Array.from({ length: 35 }, (_, i) => i + 1));
  assert.strictEqual(new Set(rooms().map((r) => r.id)).size, 35);
  env.asOwner((c) => c.setup());
  assert.strictEqual(rooms().length, 35);
  env.asOwner((c) => c.seedDefaultRooms());
  env.asOwner((c) => c.seedDefaultRooms());
  assert.strictEqual(rooms().length, 35);
  assert.ok(env.rows('avoid_pairs').length === 0 && env.rows('room_assignments').length === 0);
});

test('관리자가 고친 호실은 시드가 되돌리지 않는다(취소·정원 변경 유지, 한 줄이라도 있으면 건너뜀)', () => {
  const env = createGasEnv({});
  env.seedFake();
  const first = env.rows('rooms')[0];
  env.asOwner((c) => c.updateRecord_('rooms', first.id, { status: '취소', capacity: '3' }, 'owner@example.com'));
  env.asOwner((c) => c.seedDefaultRooms());
  const after = env.rows('rooms');
  assert.strictEqual(after.length, 35);
  assert.deepStrictEqual([after[0].status, after[0].capacity], ['취소', '3']);
});

test('seedDefaultRooms: 소유자만(화면 경로·다른 계정 거부), 거부되면 쓰기 없음', () => {
  const env = createGasEnv({});
  env.seedFake();
  const rows = env.rows('rooms');
  env.asOwner((c) => { c.getSheet_('db', 'rooms').getRange(2, 1, rows.length, 1).clearContent(); c.invalidate_('db', 'rooms'); });
  const e = env.errorOf('test.admin@example.com', (c) => c.seedDefaultRooms());
  assert.ok(e && /소유자/.test(e.message));
  assert.throws(() => env.call('test.admin@example.com', 'seedDefaultRooms'), /소유자/);
});
