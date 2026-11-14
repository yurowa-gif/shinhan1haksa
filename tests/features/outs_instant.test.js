/** C19b 즉시 퇴실 항목(결정 69): 설정(out.instant_rule_ids) 저장·권한, 그리고 OUT 수를 세는 모든 호출이 같은 값을 쓰는지. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03', KEY = 'out.instant_rule_ids';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const active = (s) => !env.rows('status_changes').some((c) => c.student_id === s.id && c.item === '학사' && c.effective_date > TODAY);
  const mine = env.rows('students').find((s) => active(s) && enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  const rules = env.rows('violation_rules');
  const smoke = rules.find((r) => r.name.startsWith('휴대폰')), other = rules.find((r) => r.name.startsWith('기숙사')), auto = rules.find((r) => r.name.startsWith('무단'));
  const tabName = 'violations_' + term.id.slice(0, 8);
  const addOut = (student, rule, at) => env.asOwner((c) => c.appendRecord_(tabName, { term_id: term.id, student_id: student.id, occurred_at: at || '2027-03-02T20:00:00', rule_id: rule.id, rule_name: rule.name,
    memo: '', detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  const setting = () => env.rows('settings', 'config').filter((r) => r.key === KEY).map((r) => r.value);
  let k = 0;   // 결정 78: 지정한 시각과 기록 시각을 비교하므로 사이사이 시각을 한 분씩 흘린다
  const tick = () => { k += 1; env.setNow(TODAY + 'T20:' + String(k).padStart(2, '0') + ':00'); };
  return { tick, env, term, mine, smoke, other, auto, addOut, setting, tabName };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const home = (x, who, role) => plain(x.env.call(who, 'getHomeData', role)).out;
const summary = (x, id) => call(x, ADMIN, 'listOuts', { scope: 'term' }).summary.find((q) => q.studentId === id);

test('권한: 관리자만 setOutInstantRule(denied:out.rules), 거부된 호출은 설정을 바꾸지 않는다', () => {
  const x = makeEnv();
  for (const who of [T1, DUTY, ATT, HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'out.rules', 'setOutInstantRule', x.smoke.id, true);
  assert.deepStrictEqual(x.setting(), []);
  x.env.expectAllowed(ADMIN, 'setOutInstantRule', x.smoke.id, true);
  assert.deepStrictEqual(x.setting(), [x.smoke.id]);
});

test('켜기·끄기: 설정 값은 id 쉼표 목록, 같은 값을 다시 보내도 늘지 않고, getOutRules가 instant를 보여 준다', () => {
  const x = makeEnv();
  assert.strictEqual(call(x, ADMIN, 'getOutRules').rules.every((r) => r.instant === false), true);
  assert.deepStrictEqual(call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true), { ok: true, instant: true, changed: true });
  assert.strictEqual(call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true).changed, false, '같은 값은 바꾸지 않는다');
  call(x, ADMIN, 'setOutInstantRule', x.other.id, true);
  assert.deepStrictEqual(x.setting(), [x.smoke.id + ',' + x.other.id]);
  assert.deepStrictEqual(call(x, ADMIN, 'getOutRules').rules.filter((r) => r.instant).map((r) => r.id).sort(), [x.smoke.id, x.other.id].sort());
  assert.strictEqual(call(x, ADMIN, 'setOutInstantRule', x.smoke.id, false).instant, false);
  assert.deepStrictEqual(x.setting(), [x.other.id]);
  assert.strictEqual(x.env.rows('audit_log').some((a) => a.action === 'update' && /settings/.test(JSON.stringify(a))), true, '변경은 audit_log에 남는다');
});

test('거부: 자동 항목·없는 항목·잘못된 값은 설정을 바꾸지 않는다', () => {
  const x = makeEnv();
  assert.match(call(x, ADMIN, 'setOutInstantRule', x.auto.id, true).errors[0].message, /자동 항목/);
  assert.match(call(x, ADMIN, 'setOutInstantRule', 'no-such', true).errors[0].message, /찾을 수 없습니다/);
  assert.strictEqual(call(x, ADMIN, 'setOutInstantRule', x.smoke.id, 'yes').ok, false);
  assert.deepStrictEqual(x.setting(), []);
});

test('결정 78: 지정한 뒤에 기록된 OUT부터 2OUT — 지정 전에 기록된 OUT은 그대로 1(소급 안 함), 안내 문구도 그대로', () => {
  const x = makeEnv();
  x.addOut(x.mine, x.smoke);   // 지정 전에 기록
  x.tick();
  const r = call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  assert.deepStrictEqual(r, { ok: true, instant: true, changed: true }, '영향 학생 수(affected)는 없다');
  assert.deepStrictEqual([summary(x, x.mine.id).count, summary(x, x.mine.id).label], [1, '1OUT'], '지정 전에 기록된 OUT은 1');
  assert.deepStrictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id), { ok: false, reason: '퇴실 대상 아님' });
  assert.strictEqual(home(x, ADMIN, 'admin').out2, 0);
  assert.ok(x.env.scriptProps.OUT_INSTANT_SINCE && JSON.parse(x.env.scriptProps.OUT_INSTANT_SINCE).periods[x.smoke.id][0].from === TODAY + 'T20:01:00', '지정 시각 스냅숏(스크립트 속성)');
  x.tick();
  x.addOut(x.mine, x.smoke);   // 지정 뒤에 기록
  assert.deepStrictEqual([summary(x, x.mine.id).count, summary(x, x.mine.id).label], [3, '퇴실 대상'], '1(지정 전) + 2(지정 뒤)');
});

test('즉시 항목 OUT 한 건 = 퇴실 대상: 입력 미리보기·목록·홈·관문이 모두 같은 단계를 본다(지정 뒤 기록, 풀면 그 뒤 기록은 1)', () => {
  const x = makeEnv();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  x.tick();
  // 기록 전: 입력 미리보기가 2(퇴실 대상), 즉시 항목이 아닌 것은 1
  const p = call(x, ADMIN, 'previewOut', { studentId: x.mine.id, occurredAt: TODAY + 'T19:40', ruleId: x.smoke.id, detectedBy: '', memo: '' });
  assert.deepStrictEqual([p.ok, p.after.count, p.after.level, p.after.label], [true, 2, 2, '퇴실 대상']);
  const pOther = call(x, ADMIN, 'previewOut', { studentId: x.mine.id, occurredAt: TODAY + 'T19:40', ruleId: x.other.id, detectedBy: '', memo: '' });
  assert.deepStrictEqual([pOther.after.count, pOther.after.level], [1, 1], '즉시 항목이 아닌 것은 1로 센다');
  x.addOut(x.mine, x.smoke);
  assert.deepStrictEqual([summary(x, x.mine.id).count, summary(x, x.mine.id).label], [2, '퇴실 대상'], '목록');
  assert.strictEqual(call(x, ADMIN, 'listOuts', { scope: 'targets' }).summary.some((q) => q.studentId === x.mine.id), true, '퇴실 대상 탭');
  assert.strictEqual(call(x, ADMIN, 'listOuts', { scope: 'term' }).stats.out2Students, 1);
  assert.strictEqual(home(x, ADMIN, 'admin').out2, 1, '홈');
  assert.deepStrictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id), { ok: false, reason: '면담 기록 필요' }, '관문');
  assert.deepStrictEqual(call(x, ADMIN, 'getOutContext', TODAY).levels[x.mine.id], 2, '입력 화면 학생별 단계');

  // 지정을 풀면: 이미 지정 중에 기록된 OUT은 그대로 2, 푼 뒤에 기록한 같은 항목 OUT은 1
  x.tick();
  assert.strictEqual(call(x, ADMIN, 'setOutInstantRule', x.smoke.id, false).instant, false);
  assert.strictEqual(summary(x, x.mine.id).count, 2, '지정 중에 기록된 OUT은 그대로');
  x.tick();
  const after = call(x, ADMIN, 'previewOut', { studentId: x.mine.id, occurredAt: TODAY + 'T19:40', ruleId: x.smoke.id, detectedBy: '', memo: '' });
  assert.strictEqual(after.after.count, 3, '푼 뒤 기록은 1');
  x.addOut(x.mine, x.smoke);
  assert.strictEqual(summary(x, x.mine.id).count, 3);
  // 다시 지정하면 새 구간: 그 뒤 기록만 2
  x.tick();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  x.tick();
  x.addOut(x.mine, x.smoke);
  assert.strictEqual(summary(x, x.mine.id).count, 5);
});

test('saveOut 결과와 cancelOut 결과도 같은 단계를 쓴다(즉시 항목 저장 → 퇴실 대상, 취소 → 단계 내려감)', () => {
  const x = makeEnv();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  x.tick();
  const s = call(x, ADMIN, 'saveOut', { studentId: x.mine.id, occurredAt: TODAY + 'T19:40', ruleId: x.smoke.id, detectedBy: '', memo: '' });
  assert.strictEqual(s.ok, true, JSON.stringify(s));
  assert.strictEqual(summary(x, x.mine.id).label, '퇴실 대상');
  const row = x.env.rows(x.tabName).find((v) => v.student_id === x.mine.id);
  const c = call(x, ADMIN, 'cancelOut', x.term.id, row.id, '잘못 기록');
  assert.deepStrictEqual([c.ok, c.after.count, c.after.level], [true, 0, 0]);
});

test('settings를 시트에서 손으로 고쳐도(끝난 id 포함) 안전하고, 처음 읽는 순간부터 지정된 것으로 센다(소급 없음), 다음 저장 때 없는 id는 정리된다', () => {
  const x = makeEnv();
  x.addOut(x.mine, x.smoke);   // 손으로 고치기 전에 기록
  x.tick();
  x.env.asOwner((c) => c.appendRecord_('settings', { key: KEY, value: 'gone-id,' + x.smoke.id, description: '' }, ADMIN, 'config'));
  assert.strictEqual(summary(x, x.mine.id).count, 1, '처음 읽는 순간(지정 시각)보다 앞서 기록된 OUT은 1');
  x.tick();
  x.addOut(x.mine, x.smoke);
  assert.strictEqual(summary(x, x.mine.id).count, 3);
  x.tick();
  call(x, ADMIN, 'setOutInstantRule', x.other.id, true);
  assert.deepStrictEqual(x.setting(), [x.smoke.id + ',' + x.other.id], '없는 id는 정리');
  assert.strictEqual(summary(x, x.mine.id).count, 3, '이미 지정된 항목의 구간은 그대로');
});

test('스크립트 속성 스냅숏이 사라져도(분실) 지금 지정된 항목은 그 순간부터 새로 센다(소급하지 않는다)', () => {
  const x = makeEnv();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  x.tick();
  x.addOut(x.mine, x.smoke);
  assert.strictEqual(summary(x, x.mine.id).count, 2);
  x.tick();
  delete x.env.scriptProps.OUT_INSTANT_SINCE;
  assert.strictEqual(summary(x, x.mine.id).count, 1, '분실 뒤에는 지금부터 — 이미 기록된 OUT은 1');
  x.tick();
  x.addOut(x.mine, x.smoke);
  assert.strictEqual(summary(x, x.mine.id).count, 3);
});

test('퇴실 대상 탭의 면담 칸(state·trigger)도 즉시 항목 한 건을 퇴실 대상으로 본다', () => {
  const x = makeEnv();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  x.tick();
  x.addOut(x.mine, x.smoke, '2027-03-02T20:00:00');
  const t = call(x, ADMIN, 'listOuts', { scope: 'targets' }).summary.find((q) => q.studentId === x.mine.id);
  assert.ok(t, '퇴실 대상 탭에 나온다');
  assert.strictEqual(t.state, 'need', '면담 필요');
  assert.ok(t.trigger && t.trigger.ruleName === x.smoke.name, '퇴실 대상이 된 OUT = 즉시 항목 그 한 건');
});

test('cancelOut 결과: 즉시 항목이 남아 있으면 다른 OUT을 취소해도 단계는 2로 남는다', () => {
  const x = makeEnv();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  x.tick();
  x.addOut(x.mine, x.smoke, '2027-03-02T20:00:00');
  x.addOut(x.mine, x.other, '2027-03-03T19:00:00');
  const row = x.env.rows(x.tabName).find((v) => v.student_id === x.mine.id && v.rule_id === x.other.id);
  const c = call(x, ADMIN, 'cancelOut', x.term.id, row.id, '잘못 기록');
  assert.deepStrictEqual([c.ok, c.after.count, c.after.level], [true, 2, 2]);
});

test('자동 OUT 알림(AutoOuts)의 단계도 즉시 항목을 센다: 즉시 OUT 2 + 자동 1 = 3OUT(퇴실 대상)', () => {
  const x = makeEnv();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);
  x.tick();
  const a = x.env.rows('students').find((s) => s.id === x.mine.id);
  x.addOut(a, x.smoke, '2027-03-02T20:00:00');
  const RT = 'fake.rt@fakeschool.invalid';   // 메일이 걸러지지 않는 가짜 주소
  x.env.asOwner((c) => {
    c.addUser(RT, '실가짜담당', 'hall_teacher');
    c.updateRecord_('enrollments', x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.mine.id).id, { teacher_email: RT }, ADMIN);
  });
  x.env.scriptProps.MAIL_ENABLED = 'true';
  const sent = [];
  const r = plain(x.env.as('test.attendance@example.com', (c) => {
    c.MailApp = { sendEmail(to, subject, body) { sent.push(body); }, getRemainingDailyQuota: () => 100 };
    return c.saveException({ studentId: x.mine.id, from: '2027-03-08', to: '2027-03-08', blocks: 'ALL', type: '미인정결석', reason: '' });
  }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.out.level[x.mine.id].count, 3, JSON.stringify(r.out));
  assert.ok(r.out.level[x.mine.id].label === '퇴실 대상');
  assert.ok(sent.some((b) => b.includes('3OUT(퇴실 대상)')), '알림 메일의 단계: ' + JSON.stringify(sent));
});

test('지정 시각은 지정한 순간이다(처음 읽는 순간이 아니다): 지정 뒤 읽기 전에 기록된 OUT도 2로 센다', () => {
  const x = makeEnv();
  x.tick();
  call(x, ADMIN, 'setOutInstantRule', x.smoke.id, true);   // T1에 지정
  x.tick();
  x.addOut(x.mine, x.smoke);                                // T2에 기록(아직 아무도 읽지 않음)
  x.tick();                                                 // T3에 처음 읽는다
  assert.strictEqual(summary(x, x.mine.id).count, 2);
  assert.strictEqual(JSON.parse(x.env.scriptProps.OUT_INSTANT_SINCE).periods[x.smoke.id][0].from, TODAY + 'T20:01:00');
});
