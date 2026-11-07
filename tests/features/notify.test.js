/** C9a 알림 함수 notifyMail_: 실행 안에서 MailApp을 바꿔 끼워 확인한다(gas-fakes는 그대로). 가짜 주소만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ACTOR = 'test.attendance@example.com';
const REAL1 = 'fake.t1@fakeschool.invalid', REAL2 = 'fake.t2@fakeschool.invalid';

function makeEnv(enabled) {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  if (enabled) env.scriptProps.MAIL_ENABLED = 'true';
  return env;
}
/** 실행 안에서 MailApp을 바꿔 끼우고 notifyMail_을 부른다 → {r, sent:[to], locks:[호출 시점 락 보유]} */
function run(env, to, opts) {
  opts = opts || {};
  const sent = [], locks = [];
  const r = plain(env.as(ACTOR, (c) => {
    c.MailApp = { sendEmail(addr, subject, body) { locks.push(c.LockService.getScriptLock().hasLock()); if (opts.fail && opts.fail(addr)) throw new Error('발송 실패(가짜)'); sent.push([addr, subject, body]); },
      getRemainingDailyQuota: () => (opts.quota === undefined ? 100 : opts.quota) };
    return c.notifyMail_(to, '제목', '본문', ACTOR);
  }));
  return { r, sent, locks };
}
const notifyRows = (env) => env.auditActions('notify:');

test('MAIL_ENABLED가 꺼져 있으면(설정 없음·"false") 0통·notified:false·audit 0행', () => {
  for (const val of [undefined, 'false', 'TRUE', '']) {
    const env = makeEnv(false);
    if (val !== undefined) env.scriptProps.MAIL_ENABLED = val;
    const { r, sent } = run(env, [REAL1]);
    assert.deepStrictEqual(r, { notified: false, sent: 0, failed: 0 }); assert.strictEqual(sent.length, 0); assert.strictEqual(notifyRows(env).length, 0, String(val));
  }
});

test('켜져 있으면 보낸다: @example.com·빈 값·형식 틀린 값·중복(대소문자 무시)은 뺀다, 모두 보내면 notified:true', () => {
  const env = makeEnv(true);
  const { r, sent } = run(env, [REAL1, REAL1.toUpperCase(), ' ' + REAL2 + ' ', 'someone@example.com', 'FAKE@EXAMPLE.COM', '', null, undefined, 'no-at-sign']);
  assert.deepStrictEqual(r, { notified: true, sent: 2, failed: 0 });
  assert.deepStrictEqual(sent.map((s) => s[0]).sort(), [REAL1, REAL2].sort());
  assert.ok(sent.every((s) => s[1] === '제목' && s[2] === '본문'));
  assert.strictEqual(notifyRows(env).length, 0);
});

test('받는 사람이 모두 가짜 주소이거나 비어 있으면 보내지 않는다(예외·audit 없음)', () => {
  const env = makeEnv(true);
  for (const to of [[], ['a@example.com'], null, undefined]) {
    const { r, sent } = run(env, to);
    assert.deepStrictEqual(r, { notified: false, sent: 0, failed: 0 }); assert.strictEqual(sent.length, 0);
  }
  assert.strictEqual(notifyRows(env).length, 0);
});

test('남은 하루 한도가 받는 사람 수보다 적으면(0·1명 모자람·한도를 못 읽음) 한 통도 안 보내고 audit notify:quota', () => {
  for (const quota of [0, 1]) {
    const env = makeEnv(true);
    const { r, sent } = run(env, [REAL1, REAL2], { quota });
    assert.deepStrictEqual(r, { notified: false, sent: 0, failed: 0 }); assert.strictEqual(sent.length, 0);
    assert.deepStrictEqual(notifyRows(env), ['notify:quota']);
    const row = env.rows('audit_log').find((x) => x.action === 'notify:quota');
    assert.ok(row.detail.includes('2명') && !row.detail.includes('@'), '이메일은 기록에 적지 않는다: ' + row.detail);
    assert.strictEqual(row.created_by, ACTOR);
  }
  const env = makeEnv(true);   // 한도를 못 읽으면(getRemainingDailyQuota가 오류) 보내지 않는다
  const r = plain(env.as(ACTOR, (c) => { c.MailApp = { sendEmail() { c.__sent = true; }, getRemainingDailyQuota() { throw new Error('한도 조회 실패(가짜)'); } }; return c.notifyMail_([REAL1], 'a', 'b', ACTOR); }));
  assert.deepStrictEqual(r, { notified: false, sent: 0, failed: 0 }); assert.strictEqual(env.mail.length, 0); assert.deepStrictEqual(notifyRows(env), ['notify:quota']);
  const exact = run(makeEnv(true), [REAL1, REAL2], { quota: 2 });
  assert.strictEqual(exact.r.sent, 2, '한도가 딱 맞으면 보낸다');
});

test('sendEmail이 오류를 던져도 예외 없이 끝나고 audit notify:failed, 나머지에게는 보낸다(notified:false)', () => {
  const env = makeEnv(true);
  const { r, sent } = run(env, [REAL1, REAL2], { fail: (a) => a === REAL1 });
  assert.deepStrictEqual(r, { notified: false, sent: 1, failed: 1 });
  assert.deepStrictEqual(sent.map((s) => s[0]), [REAL2]);
  assert.deepStrictEqual(notifyRows(env), ['notify:failed']);
  assert.ok(!env.rows('audit_log').find((x) => x.action === 'notify:failed').detail.includes('@'));
  const all = run(makeEnv(true), [REAL1], { fail: () => true });
  assert.deepStrictEqual(all.r, { notified: false, sent: 0, failed: 1 });
});

test('감사 기록 쓰기가 실패해도 알림 함수는 예외를 내지 않는다', () => {
  const env = makeEnv(true);
  const r = plain(env.as(ACTOR, (c) => {
    c.MailApp = { sendEmail() { throw new Error('실패'); }, getRemainingDailyQuota: () => 10 };
    c.writeAudit_ = () => { throw new Error('감사 쓰기 실패(가짜)'); };
    return c.notifyMail_([REAL1], 's', 'b', ACTOR);
  }));
  assert.deepStrictEqual(r, { notified: false, sent: 0, failed: 1 });
});

test('호출 시점에 락이 없으면(락 밖에서 부르는 약속) 메일 발송 때도 락을 잡고 있지 않다', () => {
  const env = makeEnv(true);
  const { locks } = run(env, [REAL1, REAL2]);
  assert.deepStrictEqual(locks, [false, false]);
});
