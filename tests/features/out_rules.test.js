/** C15 OUT 항목 관리(관리자): R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', T1 = 'test.teacher@example.com', ATT = 'test.attendance@example.com', DUTY = 'test.duty@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const AUTO = '무단 지각·결석·이탈';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  return { env, rules: () => env.rows('violation_rules') };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const save = (x, input) => call(x, ADMIN, 'saveOutRule', input);

test('getOutRules·saveOutRule은 관리자만(학사 교사·출결·근무표 담당자·담임·학생·학부모는 denied:out.rules), 쓰기 0건', () => {
  const x = makeEnv();
  const w = JSON.stringify(x.rules());
  for (const who of [T1, ATT, DUTY, HOMEROOM, STUDENT, PARENT]) {
    x.env.expectDenied(who, 'out.rules', 'getOutRules');
    x.env.expectDenied(who, 'out.rules', 'saveOutRule', { name: '새 항목' });
  }
  assert.strictEqual(JSON.stringify(x.rules()), w);
  const r = call(x, ADMIN, 'getOutRules');
  assert.deepStrictEqual(r.rules.map((q) => [q.name === AUTO, q.isAuto, q.active]).slice(0, 1), [[true, true, true]]);
  assert.strictEqual(r.rules.length, 4);
});

test('항목 추가: 기본 순서 끝·켜짐, 입력 목록(getOutContext)에 나오고 saveOut에서 쓸 수 있다. 이름·설명 수정은 audit에 남고 옛 OUT의 rule_name은 그대로', () => {
  const x = makeEnv();
  const r = save(x, { name: '  흡연   의심 ', description: '냄새·소지' });
  assert.deepStrictEqual([r.ok, r.rule.name, r.rule.active, r.rule.sortOrder], [true, '흡연 의심', true, 5], JSON.stringify(r));
  assert.ok(call(x, T1, 'getOutContext', '').rules.some((q) => q.id === r.rule.id));
  assert.ok(x.env.rows('audit_log').some((l) => l.action === 'create' && l.sheet === 'violation_rules' && l.row_id === r.rule.id));
  // 수정
  const e = save(x, { id: r.rule.id, name: '흡연·전자담배', description: '설명 바꿈', sortOrder: 2 });
  assert.deepStrictEqual([e.ok, e.rule.name, e.rule.sortOrder], [true, '흡연·전자담배', 2]);
  assert.ok(x.env.rows('audit_log').some((l) => l.action === 'update' && l.row_id === r.rule.id));
  assert.strictEqual(x.rules().length, 5, '지우지 않는다');
});

test('끄면 입력 목록에서 빠지고 saveOut이 "지금 쓰지 않는 항목"으로 거부, 다시 켜면 돌아온다. 지우는 길은 없다', () => {
  const x = makeEnv();
  const phone = x.rules().find((q) => q.name.startsWith('휴대폰'));
  const off = save(x, { id: phone.id, name: phone.name, description: phone.description, active: false });
  assert.deepStrictEqual([off.ok, off.rule.active], [true, false]);
  assert.ok(!call(x, T1, 'getOutContext', '').rules.some((q) => q.id === phone.id));
  assert.strictEqual(call(x, ADMIN, 'getOutRules').rules.find((q) => q.id === phone.id).active, false, '관리자 목록에는 꺼진 것도 보인다');
  const on = save(x, { id: phone.id, name: phone.name, active: true });
  assert.strictEqual(on.rule.active, true);
  assert.ok(call(x, T1, 'getOutContext', '').rules.some((q) => q.id === phone.id));
  assert.strictEqual(x.rules().length, 4);
});

test('자동 항목: 이름 변경·끄기 거부(설명·순서는 가능), 다른 항목이 자동 항목 이름을 쓸 수 없고, 같은 이름은 거부', () => {
  const x = makeEnv();
  const auto = x.rules().find((q) => q.name === AUTO), phone = x.rules().find((q) => q.name.startsWith('휴대폰'));
  const field = (r) => r.errors && r.errors[0].field;
  assert.strictEqual(field(save(x, { id: auto.id, name: '다른 이름' })), 'name');
  assert.strictEqual(field(save(x, { id: auto.id, name: AUTO, active: false })), 'active');
  assert.strictEqual(save(x, { id: auto.id, name: AUTO, description: '설명만 바꿈', sortOrder: 9 }).ok, true);
  assert.strictEqual(x.rules().find((q) => q.id === auto.id).name, AUTO);
  assert.strictEqual(field(save(x, { name: AUTO })), 'name', '새 항목이 자동 항목 이름');
  assert.strictEqual(field(save(x, { id: phone.id, name: AUTO })), 'name', '다른 항목을 자동 항목 이름으로');
  assert.strictEqual(field(save(x, { name: ' 기숙사   생활 위반 ' })), 'name', '공백 정리 뒤 같은 이름');
  assert.strictEqual(field(save(x, { id: phone.id, name: '기숙사 생활 위반' })), 'name');
});

test('입력 검사: 이름 비어 있음·60자 초과, 설명 100자 초과, 순서(음수·소수·문자), 없는 id — 모두 거부이고 0건', () => {
  const x = makeEnv();
  const w = JSON.stringify(x.rules());
  const bad = (o, f) => { const r = save(x, o); assert.strictEqual(r.ok, false, JSON.stringify(o)); assert.strictEqual(r.errors[0].field, f, JSON.stringify(o)); };
  bad({ name: '  ' }, 'name'); bad({ name: '가'.repeat(61) }, 'name'); bad({ name: '정상', description: '가'.repeat(101) }, 'description');
  bad({ name: '정상', sortOrder: -1 }, 'sortOrder'); bad({ name: '정상', sortOrder: 1.5 }, 'sortOrder'); bad({ name: '정상', sortOrder: 'abc' }, 'sortOrder');
  bad({ id: 'no-such', name: '정상' }, 'id');
  assert.strictEqual(JSON.stringify(x.rules()), w);
  assert.strictEqual(save(x, { name: '가'.repeat(60) }).ok, true);
});

test('이름을 바꿔도 옛 OUT 행의 rule_name은 그대로', () => {
  const x = makeEnv();
  const term = x.env.rows('terms').find((t) => t.name === '2027 1학기');
  const phone = x.rules().find((q) => q.name.startsWith('휴대폰'));
  const tab = 'violations_' + term.id.slice(0, 8);
  const stu = x.env.rows('students')[0];
  x.env.asOwner((c) => c.appendRecord_(tab, { term_id: term.id, student_id: stu.id, occurred_at: '2027-03-03T19:00:00', rule_id: phone.id, rule_name: phone.name, memo: '', detected_by: '', entered_by: ADMIN, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  assert.strictEqual(save(x, { id: phone.id, name: '휴대폰 사용' }).ok, true);
  assert.strictEqual(x.env.rows(tab)[0].rule_name, phone.name);
});

test('이름 비교는 NFC·영폭 문자·공백을 정리하고, 자동 이름으로 시작하는 "무단 지각·결석·이탈(…" 이름은 거부, 설명을 안 보내면 기존 값 유지, active는 true/false만', () => {
  const x = makeEnv();
  const phone = x.rules().find((q) => q.name.startsWith('휴대폰'));
  const field = (r) => r.errors && r.errors[0].field;
  assert.strictEqual(field(save(x, { name: '기숙사​ 생활 위반' })), 'name', '영폭 문자를 넣어도 같은 이름');
  assert.strictEqual(field(save(x, { name: '무​단 지각·결석·이탈' })), 'name', '영폭 문자로 자동 이름 흉내');
  assert.strictEqual(field(save(x, { name: AUTO + '(흉내)' })), 'name', '자동 이름 + 괄호');
  const d = save(x, { id: phone.id, name: phone.name, description: '설명 있음' });
  assert.strictEqual(d.rule.description, '설명 있음');
  assert.strictEqual(save(x, { id: phone.id, name: phone.name }).rule.description, '설명 있음', '설명을 안 보내면 기존 값 유지');
  for (const bad of ['FALSE', 'no', 0, 1, 'true']) assert.strictEqual(field(save(x, { id: phone.id, name: phone.name, active: bad })), 'active', String(bad));
});

test('시트에서 꺼진 자동 항목은 저장 때 켜짐으로 되돌린다, 새 항목 기본 순서는 999를 넘지 않는다, 락을 못 잡으면 오류·0쓰기', () => {
  const x = makeEnv();
  const auto = x.rules().find((q) => q.name === AUTO);
  x.env.asOwner((c) => c.updateRecord_('violation_rules', auto.id, { active: 'FALSE' }, ADMIN));
  const r = save(x, { id: auto.id, name: AUTO, description: '다시 저장' });
  assert.deepStrictEqual([r.ok, r.rule.active], [true, true]);
  assert.strictEqual(x.rules().find((q) => q.id === auto.id).active, 'TRUE');
  const big = x.rules().find((q) => q.name.startsWith('휴대폰'));
  x.env.asOwner((c) => c.updateRecord_('violation_rules', big.id, { sort_order: '999' }, ADMIN));
  assert.strictEqual(save(x, { name: '순서 상한' }).rule.sortOrder, 999);
  const w = JSON.stringify(x.rules());
  x.env.lock.failNext = 1;
  const err = x.env.errorOf(ADMIN, (c) => c.saveOutRule({ name: '락 실패' }));
  assert.ok(err && /다른 사람이 저장 중/.test(err.message), err && err.message);
  assert.strictEqual(JSON.stringify(x.rules()), w);
});
