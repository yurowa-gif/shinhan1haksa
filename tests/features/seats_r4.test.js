/** C6 좌석: R4 gas-fakes(실제 Auth·Db·락·audit 경로)로 권한·쓰기·동시 편집을 확인한다. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';
const HALL = 'test.teacher@example.com';
const VIEW_ONLY = ['test.homeroom@example.com', 'test.attendance@example.com', 'test.duty@example.com'];
const NO_VIEW = ['test.student@example.com', 'test.parent@example.com', 'nobody@example.com'];

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-20T20:00:00' });
  env.seedFake({ stage1: true });
  return env;
}
const get = (env, who) => plain(env.call(who || ADMIN, 'getSeatData'));
const cells = (d) => d.spaces.flatMap((sp) => sp.cells);
const tok = (d, ...ids) => Object.fromEntries(ids.map((id) => [id, cells(d).find((c) => c.id === id).token]));
const assignRows = (env) => env.rows('seat_assignments');

test('보기: 교사 역할 5개 허용, 학생·학부모·계정 없음은 거부(denied:seat.view)', () => {
  const env = makeEnv();
  [ADMIN, HALL].concat(VIEW_ONLY).forEach((who) => env.expectAllowed(who, 'getSeatData'));
  NO_VIEW.forEach((who) => env.expectDenied(who, 'seat.view', 'getSeatData'));
});

test('배정·맞바꾸기·풀기: 관리자·학사 교사만 허용, 담임·출결·근무표·학생·학부모는 거부(denied:seat.edit)하고 데이터는 그대로', () => {
  const env = makeEnv();
  const d = get(env);
  const [a, b] = cells(d).filter((c) => c.studentId).slice(0, 2);
  const empty = cells(d).find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  const before = JSON.stringify(assignRows(env));
  VIEW_ONLY.concat(NO_VIEW).forEach((who) => {
    env.expectDenied(who, 'seat.edit', 'assignSeat', d.term.id, empty.id, d.unseated[0].id, tok(d, empty.id));
    env.expectDenied(who, 'seat.edit', 'swapSeats', d.term.id, a.id, b.id, tok(d, a.id, b.id));
    env.expectDenied(who, 'seat.edit', 'unassignSeat', d.term.id, a.id, tok(d, a.id));
  });
  assert.strictEqual(JSON.stringify(assignRows(env)), before, '거부된 호출은 아무것도 쓰지 않는다');
  // 허용: 학사 교사가 맞바꾸고, 관리자가 앉히고, 학사 교사가 푼다
  assert.strictEqual(env.expectAllowed(HALL, 'swapSeats', d.term.id, a.id, b.id, tok(d, a.id, b.id)).ok, true);
  const d2 = get(env, HALL);
  assert.strictEqual(env.expectAllowed(ADMIN, 'assignSeat', d2.term.id, empty.id, d2.unseated[0].id, tok(d2, empty.id)).ok, true);
  const d3 = get(env);
  assert.strictEqual(env.expectAllowed(HALL, 'unassignSeat', d3.term.id, empty.id, tok(d3, empty.id)).ok, true);
});

test('격자 편집·공간·붙여넣기: 관리자만 허용, 학사 교사까지 포함해 나머지는 거부(denied:seat.layout)', () => {
  const env = makeEnv();
  const d = get(env);
  const sp = d.spaces[1];
  const grid = sp.cells.map((c) => ({ row: c.row, col: c.col, kind: { seat: '좌석', pillar: '기둥', door: '비상문', window: '창문' }[c.kind] }));
  const calls = [['saveSpace', { name: '시험실', gender: '혼성', rows: 2, cols: 2 }], ['saveSpaceGrid', sp.id, grid], ['previewSpaceGrid', sp.id, grid],
    ['previewSeatGrid', '공석\t공석'], ['importSeatGrid', '공석\t공석', { name: '시험실2', gender: '혼성' }]];
  const before = JSON.stringify([env.rows('spaces'), env.rows('seats')]);
  [HALL].concat(VIEW_ONLY, NO_VIEW).forEach((who) => calls.forEach((c) => env.expectDenied(who, 'seat.layout', ...c)));
  assert.strictEqual(JSON.stringify([env.rows('spaces'), env.rows('seats')]), before);
  calls.forEach((c) => env.expectAllowed(ADMIN, ...c));
  assert.ok(env.rows('spaces').some((x) => x.name === '시험실2'));
});

test('실제 Db 경로: 맞바꾸기는 bulk_update 한 번(audit 한 줄), 퇴실 자리 재배정은 지난 기록을 남기고 audit에 전후 값이 있다', () => {
  const env = makeEnv();
  const d = get(env);
  const [a, b] = cells(d).filter((c) => c.studentId).slice(0, 2);
  const n0 = env.auditActions('bulk_update').length;
  env.call(ADMIN, 'swapSeats', d.term.id, a.id, b.id, tok(d, a.id, b.id));
  assert.strictEqual(env.auditActions('bulk_update').length - n0, 1, '두 행이 audit 한 줄(덩어리)로');
  const held = cells(get(env)).find((c) => c.reason === '퇴실');
  const oldRow = assignRows(env).find((r) => r.seat_id === held.id && r.status === '배정');
  const d2 = get(env);
  const r = plain(env.call(ADMIN, 'assignSeat', d2.term.id, held.id, d2.unseated[0].id, tok(d2, held.id)));
  assert.strictEqual(r.ok, true);
  const now = assignRows(env).find((x) => x.id === oldRow.id);
  assert.deepStrictEqual([now.status, now.valid_to], ['배정', '2027-03-19']);
  const audit = env.rows('audit_log').filter((x) => x.action === 'bulk_update' && x.sheet === 'seat_assignments').pop();
  assert.ok(audit.before.includes(oldRow.id) && audit.after.includes('2027-03-19'), '전후 값이 audit에 남는다');
});

test('실제 경로: 같은 화면 표로 두 번 맞바꾸면 두 번째는 거부되고, 끝난 기간(8/1)은 배정이 거부된다', () => {
  const env = makeEnv();
  const d = get(env);
  const [a, b] = cells(d).filter((c) => c.studentId).slice(0, 2);
  assert.strictEqual(plain(env.call(ADMIN, 'swapSeats', d.term.id, a.id, b.id, tok(d, a.id, b.id))).ok, true);
  const again = plain(env.call(ADMIN, 'swapSeats', d.term.id, a.id, b.id, tok(d, a.id, b.id)));
  assert.strictEqual(again.ok, false); assert.ok(again.error.includes('다른 선생님'));
  env.setNow('2027-08-01T10:00:00');
  const late = get(env);
  assert.strictEqual(late.canEdit, false);
  const empty = cells(late).find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  const r = plain(env.call(ADMIN, 'assignSeat', late.term.id, empty.id, d.unseated[0].id, tok(late, empty.id)));
  assert.strictEqual(r.ok, false); assert.ok(r.error.includes('끝난 운영 기간'));
});
