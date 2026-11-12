/** repairDuplicateIds(편집기, 소유자): 같은 id·빈 id 줄에 새 UUID. 미리보기 먼저, 행은 지우지 않음. R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/;

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  const slot = (id, date, email) => env.asOwner((c) => c.appendRecord_('duty_slots', { id, date, slot: '단독', end_time: '', original_email: email, actual_email: email, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  // 같은 id 세 줄(DUP) + 정상 한 줄 + 빈 id 한 줄 + 공백 id 한 줄 + 데이터가 없는 완전히 빈 줄
  slot('DUP', '2027-03-20', 'a@fakeschool.invalid'); slot('DUP', '2027-03-21', 'b@fakeschool.invalid'); slot('DUP', '2027-03-22', 'c@fakeschool.invalid');
  slot('OK-1', '2027-03-23', 'd@fakeschool.invalid'); slot('to-blank', '2027-03-24', 'e@fakeschool.invalid'); slot(' ', '2027-03-25', 'f@fakeschool.invalid');
  const rowOf = (id) => env.rows('duty_slots').findIndex((r) => r.id === id) + 2;
  env.asOwner((c) => { c.getSheet_('db', 'duty_slots').getRange(rowOf('to-blank'), 1).setValue(''); c.invalidate_('db', 'duty_slots'); });
  return { env, rows: () => env.rows('duty_slots') };
}
const run = (env, apply) => plain(env.asOwner((c) => (apply === undefined ? c.repairDuplicateIds() : c.repairDuplicateIds(apply))));
const dutyChanges = (r) => (r.tabs.find((t) => t.tab === 'duty_slots') || { changes: [] }).changes;

test('미리보기(인자 없음·true가 아닌 값): 어느 줄이 바뀌는지만 보여 주고 시트·audit에 아무것도 쓰지 않는다', () => {
  const x = makeEnv();
  const sheet = JSON.stringify(x.env.sheetValues('duty_slots')), audit = x.env.rows('audit_log').length;
  [undefined, false, 'true', 1].forEach((a) => {
    const r = run(x.env, a);
    assert.deepStrictEqual([r.dryRun, r.applied], [true, false], String(a));
    const ch = dutyChanges(r);
    assert.deepStrictEqual(ch.map((c) => c.reason.replace(/\d+/, 'N')), ['같은 id가 N행에도 있음', '같은 id가 N행에도 있음', '빈 id', '빈 id']);
    assert.ok(ch.every((c) => /^\(실행하면/.test(c.newId)));
    assert.ok(/아무것도 바꾸지 않았습니다/.test(r.message) && /repairDuplicateIds\(true\)/.test(r.message));
  });
  assert.strictEqual(JSON.stringify(x.env.sheetValues('duty_slots')), sheet);
  assert.strictEqual(x.env.rows('audit_log').length, audit);
  const first = dutyChanges(run(x.env));
  assert.deepStrictEqual(first.map((c) => c.oldId), ['DUP', 'DUP', '', ' '.trim()]);
});

test('실행(true): 가장 위 줄은 id를 지키고 아래 중복 줄·빈 id 줄만 새 UUID, 행 수·다른 칸·머리글 그대로, audit repair_id 한 줄씩, 정상 줄은 그대로', () => {
  const x = makeEnv();
  const before = x.rows(), headers = x.env.sheetValues('duty_slots')[0].join('|'), total = before.length;
  const r = run(x.env, true);
  assert.deepStrictEqual([r.dryRun, r.applied, r.count], [false, true, 4]);
  const after = x.rows();
  assert.strictEqual(after.length, total, '행을 지우지 않는다');
  assert.strictEqual(x.env.sheetValues('duty_slots')[0].join('|'), headers, '시트 구조(머리글) 그대로');
  assert.deepStrictEqual(after.map((a) => a.date), before.map((b) => b.date));
  assert.deepStrictEqual(after.map((a) => a.actual_email), before.map((b) => b.actual_email), '다른 칸은 그대로');
  const dups = after.filter((a, i) => before[i].id === 'DUP');
  assert.strictEqual(dups[0].id, 'DUP', '가장 위 줄이 id를 지킨다');
  assert.ok(UUID.test(dups[1].id) && UUID.test(dups[2].id) && dups[1].id !== dups[2].id);
  assert.strictEqual(after.find((a) => a.date === '2027-03-23').id, 'OK-1', '정상 줄은 그대로');
  ['2027-03-24', '2027-03-25'].forEach((d) => assert.ok(UUID.test(after.find((a) => a.date === d).id), d));
  assert.strictEqual(new Set(after.map((a) => a.id)).size, after.length, '이제 id가 모두 다르다');
  const logs = x.env.rows('audit_log').filter((l) => l.action === 'repair_id');
  assert.strictEqual(logs.length, 4);
  logs.forEach((l) => assert.ok(l.sheet === 'duty_slots' && UUID.test(l.row_id) && /"row":\d+/.test(l.before) && l.created_by === 'owner@example.com'));
  assert.ok(logs.some((l) => /"id":"DUP"/.test(l.before)));
});

test('두 번째 실행은 바꿀 것이 없다. 고친 뒤에는 그 줄을 updateRecord_로 고칠 수 있다(전에는 멈춤)', () => {
  const x = makeEnv();
  const e = x.env.errorOf('owner@example.com', (c) => c.updateRecord_('duty_slots', 'DUP', { memo: 'x' }, ADMIN));
  assert.ok(e, '고치기 전에는 중복 id라 멈춘다');
  run(x.env, true);
  const audit = x.env.rows('audit_log').length, snap = JSON.stringify(x.env.sheetValues('duty_slots'));
  const again = run(x.env, true);
  assert.deepStrictEqual([again.count, again.applied], [0, true]);
  assert.ok(/없습니다/.test(again.message));
  assert.strictEqual(JSON.stringify(x.env.sheetValues('duty_slots')), snap);
  assert.strictEqual(x.env.rows('audit_log').length, audit);
  const second = x.rows().find((r) => r.date === '2027-03-21');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', second.id, { memo: '고침' }, ADMIN));
  assert.strictEqual(x.rows().find((r) => r.date === '2027-03-21').memo, '고침');
  assert.strictEqual(x.rows().find((r) => r.date === '2027-03-20').memo, '', '같은 id를 가졌던 다른 줄은 그대로');
});

test('소유자만: 관리자 계정·화면 경로는 거부, 시트·audit 그대로', () => {
  const x = makeEnv();
  const snap = JSON.stringify(x.env.sheetValues('duty_slots')), audit = x.env.rows('audit_log').length;
  [undefined, true].forEach((a) => {
    const e = x.env.errorOf(ADMIN, (c) => (a === undefined ? c.repairDuplicateIds() : c.repairDuplicateIds(a)));
    assert.ok(e && /소유자/.test(e.message));
    assert.throws(() => (a === undefined ? x.env.call(ADMIN, 'repairDuplicateIds') : x.env.call(ADMIN, 'repairDuplicateIds', a)), /소유자/);
  });
  assert.strictEqual(JSON.stringify(x.env.sheetValues('duty_slots')), snap);
  assert.strictEqual(x.env.rows('audit_log').length, audit);
});

test('상담일지·기간별 탭도 찾는다: 상담 내용은 audit에 복사되지 않고, 비어 있는 줄·id가 없는 데이터 없는 줄은 건드리지 않는다', () => {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  const SECRET = '상담비밀내용ZZ';
  const note = (id, d) => env.asOwner((c) => c.appendRecord_('counsel_notes', { id, student_id: 's1', date: d, teacher_email: 't@fakeschool.invalid', type: '상담', target: '', linked_violation_id: '', content: SECRET, show_to_parent: 'FALSE', status: '유효', cancel_reason: '' }, ADMIN, 'counsel'));
  note('N1', '2027-03-04'); note('N1', '2027-03-05');
  const prev = run(env);
  const t = prev.tabs.find((x) => x.tab === 'counsel_notes');
  assert.deepStrictEqual([t.kind, t.changes.length, t.changes[0].row], ['counsel', 1, 3]);
  assert.ok(!JSON.stringify(prev).includes(SECRET));
  run(env, true);
  const logs = env.rows('audit_log').filter((l) => l.action === 'repair_id');
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].sheet, 'counsel/counsel_notes');
  assert.ok(!JSON.stringify(logs[0]).includes(SECRET), '상담 내용이 audit에 복사되지 않는다');
  assert.strictEqual(env.rows('counsel_notes', 'counsel').length, 2);
  // 기간별 탭(exceptions_<기간>)의 중복도 찾는다
  const term = env.rows('terms').find((x) => x.name === '2027 1학기'), tab = 'exceptions_' + term.id.slice(0, 8);
  const ex = (id) => env.asOwner((c) => c.appendRecord_(tab, { id, term_id: term.id, group_id: 'g', student_id: 's', date: '2027-03-08', blocks: 'ALL', type: '기타', reason: '가짜', status: '확정', requested_by: 'x', requested_at: '', confirmed_by: 'x', confirmed_at: '', cancel_reason: '' }, ADMIN));
  ex('E1'); ex('E1');
  assert.ok(run(env).tabs.some((x) => x.tab === tab && x.changes.length === 1));
});

test('완전히 빈 줄(id도 다른 칸도 없음)은 세지도 고치지도 않는다, 실행은 락 안에서 쓴다(strictLock)', () => {
  const x = makeEnv();
  const last = x.env.sheetValues('duty_slots').length;
  x.env.asOwner((c) => { c.withLock_(function () { c.getSheet_('db', 'duty_slots').getRange(last + 2, 2).setValue('2027-04-01'); }); });   // last+1 줄은 통째로 빈 줄, 그 아래 줄은 id만 빔(데이터 있음)
  const r = run(x.env);
  assert.strictEqual(dutyChanges(r).length, 5, '빈 id + 데이터 있는 줄만 센다(통째로 빈 줄은 안 셈): 중복 2 + 빈 id 3');
  assert.ok(!dutyChanges(r).some((c) => c.row === last + 1));
  x.env.strictLock = true;   // 락 없이 시트에 쓰면 오류
  const a = run(x.env, true);
  assert.strictEqual(a.count, 5);
  assert.strictEqual(x.env.sheetValues('duty_slots')[last][0], '', '통째로 빈 줄은 그대로 비어 있다');
});
