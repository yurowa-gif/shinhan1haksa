/** Db.gs 쓰기 보호: 빈 id·같은 id 줄이 여럿이면 고치지 않는다(손으로 고친 시트에서 다른 줄을 건드리지 않게). R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com';
function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  const slot = (id, date, email) => env.asOwner((c) => c.appendRecord_('duty_slots', { id, date, slot: '단독', end_time: '', original_email: email, actual_email: email, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  return { env, slot, rows: () => env.rows('duty_slots') };
}
const msg = (f) => { try { f(); } catch (e) { return String(e.message); } return ''; };

test('findById_: 빈 id·공백 id·없는 id는 null(빈 id 줄에 닿지 않는다)', () => {
  const x = makeEnv();
  x.slot('', '2027-03-10', 'a@fakeschool.invalid');
  const r = x.env.asOwner((c) => [c.findById_('duty_slots', ''), c.findById_('duty_slots', '  '), c.findById_('duty_slots', undefined), c.findById_('duty_slots', null), c.findById_('duty_slots', 'no-such')]);
  assert.deepStrictEqual(r, [null, null, null, null, null]);
});

test('updateRecord_: 같은 id 줄이 둘이면 던지고 어느 줄도 바뀌지 않으며, 하나뿐이면 그대로 고친다', () => {
  const x = makeEnv();
  x.slot('dup-1', '2027-03-10', 'a@fakeschool.invalid'); x.slot('dup-1', '2027-03-11', 'b@fakeschool.invalid'); x.slot('solo-1', '2027-03-12', 'c@fakeschool.invalid');
  const before = JSON.stringify(x.rows());
  const m = msg(() => x.env.asOwner((c) => c.updateRecord_('duty_slots', 'dup-1', { memo: '바꿈' }, ADMIN)));
  assert.ok(/같은 id의 줄이 여러 개/.test(m), m);
  assert.strictEqual(JSON.stringify(x.rows()), before, '어느 줄도 바뀌지 않음');
  assert.ok(/기록을 찾을 수 없습니다/.test(msg(() => x.env.asOwner((c) => c.updateRecord_('duty_slots', '', { memo: 'x' }, ADMIN)))), '빈 id');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', 'solo-1', { memo: '고침' }, ADMIN));
  assert.strictEqual(x.rows().find((r) => r.id === 'solo-1').memo, '고침');
});

test('bulkUpdateRecords_: 중복 id·빈 id가 든 묶음은 던지고 아무 줄도 안 바뀐다, 정상 묶음은 그대로', () => {
  const x = makeEnv();
  x.slot('dup-2', '2027-03-10', 'a@fakeschool.invalid'); x.slot('dup-2', '2027-03-11', 'b@fakeschool.invalid'); x.slot('solo-2', '2027-03-12', 'c@fakeschool.invalid');
  const before = JSON.stringify(x.rows());
  assert.ok(/같은 id의 줄이 여러 개/.test(msg(() => x.env.asOwner((c) => c.bulkUpdateRecords_('duty_slots', [{ id: 'solo-2', patch: { memo: 'a' } }, { id: 'dup-2', patch: { memo: 'b' } }], ADMIN)))));
  assert.ok(/기록을 찾을 수 없습니다/.test(msg(() => x.env.asOwner((c) => c.bulkUpdateRecords_('duty_slots', [{ id: '', patch: { memo: 'c' } }], ADMIN)))));
  assert.strictEqual(JSON.stringify(x.rows()), before, '아무 줄도 바뀌지 않음');
  x.env.asOwner((c) => c.bulkUpdateRecords_('duty_slots', [{ id: 'solo-2', patch: { memo: '묶음' } }], ADMIN));
  assert.strictEqual(x.rows().find((r) => r.id === 'solo-2').memo, '묶음');
});
