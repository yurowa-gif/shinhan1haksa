/**
 * T6 흐름 시험: F13 월별 일정(결정 80, C34). 화면 공개 함수만, 가짜 데이터만.
 * 관리자가 달 경계(3/30~4/2) 일정을 등록 → 3월·4월 달력 모두에 보임 → 같은 일정 두 번·낡은 화면은 거부 → 취소(행은 남고 사유·감사)
 * → 두 달 모두에서 빠짐. 운영 안 하는 날(자습 일정 3/10)은 events에 넣지 않아도 달력에 함께 보인다.
 * 교사 역할(학사·담임·출결·근무표 담당)은 보고, 학생·학부모는 못 보고, 관리자만 등록·취소한다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: '2027-03-09T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());   // 3/10 운영 안 함(자습 일정)
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  env.strictLock = true;
  return env;
}

test('월별 일정 흐름: 달 경계 일정은 두 달 모두에 → 중복·낡은 화면 거부 → 취소(행·사유·감사 남음)하면 두 달에서 빠짐, 운영 안 하는 날은 자습 일정에서 읽어 보임', () => {
  const env = seededEnv();
  const data = (who, m) => plain(env.call(who || ADMIN, 'getEventData', m));
  const dayIds = (m, d) => data(ADMIN, m).days.find((x) => x.date === d).ids;
  const mar = data(ADMIN, '2027-03');
  assert.strictEqual(mar.canEdit, true);
  const input = { title: '가짜 학부모 총회 주간', kind: '행사', start_date: '2027-03-30', end_date: '2027-04-02', memo: '가짜', token: mar.token };
  const s = plain(env.call(ADMIN, 'saveEvent', input));
  assert.strictEqual(s.ok, true, JSON.stringify(s));
  assert.deepStrictEqual([dayIds('2027-03', '2027-03-29'), dayIds('2027-03', '2027-03-30'), dayIds('2027-03', '2027-03-31')], [[], [s.id], [s.id]], '3월: 30·31일');
  assert.deepStrictEqual([dayIds('2027-04', '2027-04-01'), dayIds('2027-04', '2027-04-02'), dayIds('2027-04', '2027-04-03')], [[s.id], [s.id], []], '4월: 1·2일');
  assert.ok(data(ADMIN, '2027-04').events.some((e) => e.id === s.id), '4월 응답의 일정 목록에도');

  // 같은 일정 두 번·낡은 화면(token)은 거부, 쓰기 없음
  const n = env.rows('events').length;
  const dup = plain(env.call(ADMIN, 'saveEvent', Object.assign({}, input, { token: data(ADMIN, '2027-03').token })));
  assert.strictEqual(dup.ok, false, JSON.stringify(dup));
  const stale = plain(env.call(ADMIN, 'saveEvent', Object.assign({}, input, { title: '가짜 다른 일정' })));   // 등록 전 화면의 token
  assert.strictEqual(stale.stale, true, JSON.stringify(stale));
  assert.strictEqual(env.rows('events').length, n);

  // 운영 안 하는 날: 자습 일정의 3/10이 달력에 함께, events에는 없다
  const d310 = data(ADMIN, '2027-03').days.find((x) => x.date === '2027-03-10');
  assert.deepStrictEqual([d310.operating, d310.closedMemo, d310.ids], [false, '가짜: 운영 안 함', []]);
  assert.ok(!env.rows('events').some((e) => e.start_date === '2027-03-10'), 'events에 두 번 넣지 않는다');

  // 취소: 두 달에서 빠지고 행·사유는 남는다
  const c = plain(env.call(ADMIN, 'cancelEvent', s.id, '가짜: 일정 변경', data(ADMIN, '2027-03').token));
  assert.strictEqual(c.ok, true, JSON.stringify(c));
  assert.deepStrictEqual([dayIds('2027-03', '2027-03-30'), dayIds('2027-04', '2027-04-01')], [[], []]);
  const row = env.rows('events').find((e) => e.id === s.id);
  assert.deepStrictEqual([row.status, /일정 변경/.test(row.cancel_reason)], ['취소', true], '행은 지우지 않고 취소');
  assert.ok(env.rows('audit_log').some((a) => a.sheet === 'events' && a.row_id === s.id), '감사 기록');
});

test('월별 일정 권한: 교사 역할은 모두 보고, 학생·학부모는 거부, 등록·취소는 관리자만(denied:event.edit)', () => {
  const env = seededEnv();
  for (const who of [HALL, HOMEROOM, ATT, DUTYM]) {
    const d = plain(env.call(who, 'getEventData', '2027-03'));
    assert.deepStrictEqual([d.month, d.canEdit], ['2027-03', false], who);
  }
  for (const who of [STUDENT, PARENT]) env.expectDenied(who, 'event.view', 'getEventData', '2027-03');
  const token = plain(env.call(ADMIN, 'getEventData', '2027-03')).token;
  for (const who of [HALL, ATT, HOMEROOM]) env.expectDenied(who, 'event.edit', 'saveEvent', { title: '가짜', kind: '행사', start_date: '2027-03-15', token });
  assert.strictEqual(env.rows('events').length, 0);
});
