/** 결정 72: 휴일 요일 유형 + 기간 일괄 설정(previewDayBatch·saveDayBatch). R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', ATT = 'test.attendance@example.com', DUTY = 'test.duty@example.com', T1 = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const WED = 3;

function makeEnv() {
  const env = createGasEnv({ owner: 'owner@example.com', now: '2027-03-01T09:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: T1, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT, TEST_HOMEROOM_EMAIL: HOMEROOM });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => { c.addUser(ADMIN, '시험 관리자', 'admin'); c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTY, '시험 담당자', 'duty_manager'); });
  return env;
}
const call = (env, fn, ...a) => plain(env.call(ADMIN, fn, ...a));
const MAR = { from: '2027-03-01', to: '2027-03-31', weekdays: [WED], start: '18:00' };
const live = (env) => env.rows('day_schedules').filter((r) => r.status !== '취소');
const dayOf = (env, date) => call(env, 'getScheduleData', date.slice(0, 7)).days.find((d) => d.date === date);

test('권한: 관리자만 미리 보기·저장, 나머지 역할은 거부 + denied:schedule.edit, 쓰기 없음', () => {
  const env = makeEnv();
  assert.strictEqual(call(env, 'previewDayBatch', MAR).ok, true);
  const before = env.rows('day_schedules').length, audits = env.rows('audit_log').length;
  for (const who of [ATT, DUTY, T1, HOMEROOM, STUDENT, PARENT]) {
    env.expectDenied(who, 'schedule.edit', 'previewDayBatch', MAR);
    env.expectDenied(who, 'schedule.edit', 'saveDayBatch', MAR, 'x');
  }
  assert.strictEqual(env.rows('day_schedules').length, before);
  assert.strictEqual(env.rows('audit_log').filter((r) => !/denied/.test(r.action)).length, audits);
});

test('휴일 유형: 기본 09:00~21:50, 목록에 있고 블록 틀(09–12, 14–15:30, 15:30–17, 19–20:30, 20:30–21:50)을 제안, 블록 저장 뒤 그 날이 휴일로 계산된다', () => {
  const env = makeEnv();
  const d = call(env, 'getScheduleData', '2027-03');
  assert.ok(d.dayTypes.includes('holiday'));
  assert.deepStrictEqual(d.defaults.holiday, { start: '09:00', end: '21:50' });
  assert.deepStrictEqual(d.suggestedBlocks['학기|holiday'].map((b) => b.start + '-' + b.end), ['09:00-12:00', '14:00-15:30', '15:30-17:00', '19:00-20:30', '20:30-21:50']);
  // 블록이 없으면 일괄 설정이 막는다
  const r = call(env, 'previewDayBatch', { from: '2027-03-01', to: '2027-03-01', weekdays: [1], dayType: 'holiday' });
  assert.strictEqual(r.ok, false); assert.ok(/블록이 아직 없습니다/.test(r.errors[0].message), JSON.stringify(r));
  assert.strictEqual(call(env, 'saveBlocks', '학기', 'holiday', d.suggestedBlocks['학기|holiday'], '').ok, true);
  const p = call(env, 'previewDayBatch', { from: '2027-03-01', to: '2027-03-01', weekdays: [1], dayType: 'holiday' });
  assert.deepStrictEqual([p.ok, p.changeCount, p.sample[0].after], [true, 1, '09:00–21:50 휴일']);
  assert.strictEqual(call(env, 'saveDayBatch', { from: '2027-03-01', to: '2027-03-01', weekdays: [1], dayType: 'holiday' }, p.sig).ok, true);
  const day = dayOf(env, '2027-03-01');
  assert.deepStrictEqual([day.dayType, day.start, day.end, day.blockLabels], ['holiday', '09:00', '21:50', ['09–12', '14–15:30', '15:30–17', '19–20:30', '20:30–21:50']]);
});

test('매주 수요일 18:00 시작: 미리 보기 건수 = 직접 센 수요일, 저장하면 그 날만 바뀌고 다른 날·audit 한 줄, 같은 값으로 다시 하면 쓰기 0', () => {
  const env = makeEnv();
  const wed = [3, 10, 17, 24, 31].map((n) => '2027-03-' + String(n).padStart(2, '0'));
  const p = call(env, 'previewDayBatch', MAR);
  assert.deepStrictEqual([p.ok, p.total, p.changeCount, p.closedCount, p.sameCount], [true, 5, 5, 0, 0]);
  assert.deepStrictEqual(p.sample.map((s) => s.date), wed);
  assert.strictEqual(p.sample[0].before, '18:30–23:50 월~목'); assert.strictEqual(p.sample[0].after, '18:00–23:50 월~목');
  assert.strictEqual(env.rows('day_schedules').length, 0, '미리 보기는 쓰지 않는다');
  const r = call(env, 'saveDayBatch', MAR, p.sig);
  assert.deepStrictEqual(r, { ok: true, changed: 5, closed: 0, same: 0 });
  assert.deepStrictEqual(live(env).map((x) => x.date).sort(), wed);
  assert.ok(live(env).every((x) => x.start === '18:00' && x.operating === 'TRUE' && x.status === '유효'));
  wed.forEach((d) => assert.strictEqual(dayOf(env, d).start, '18:00'));
  assert.strictEqual(dayOf(env, '2027-03-04').start, '18:30', '다른 요일은 그대로');
  assert.strictEqual(env.rows('audit_log').filter((a) => a.action === 'schedule:batch').length, 1);
  const w = env.rows('audit_log').length;
  const p2 = call(env, 'previewDayBatch', MAR);
  assert.deepStrictEqual([p2.changeCount, p2.sameCount], [0, 5]);
  assert.deepStrictEqual(call(env, 'saveDayBatch', MAR, p2.sig), { ok: true, changed: 0, closed: 0, same: 5 });
  assert.strictEqual(live(env).length, 5);
  assert.ok(env.rows('audit_log').length >= w);
});

test('다른 시각으로 다시 하면 옛 행은 취소로 남고 유효 행은 날마다 하나, 그 날 따로 정한 요일 유형·종료·메모는 비운 칸이라 그대로', () => {
  const env = makeEnv();
  call(env, 'saveDaySchedule', { date: '2027-03-10', operating: true, end: '22:00', memo: '시험 전', token: '' });
  const p = call(env, 'previewDayBatch', MAR);
  assert.strictEqual(call(env, 'saveDayBatch', MAR, p.sig).ok, true);
  const rows10 = env.rows('day_schedules').filter((r) => r.date === '2027-03-10');
  assert.deepStrictEqual(rows10.map((r) => r.status), ['취소', '유효']);
  const now = rows10[1];
  assert.deepStrictEqual([now.start, now.end, now.memo], ['18:00', '22:00', '시험 전']);
  const again = { from: '2027-03-01', to: '2027-03-31', weekdays: [WED], start: '17:30' };
  assert.strictEqual(call(env, 'saveDayBatch', again, call(env, 'previewDayBatch', again).sig).changed, 5);
  assert.strictEqual(live(env).length, 5);
  assert.strictEqual(env.rows('day_schedules').length, 1 + 5 + 5, '지우지 않고 취소 행이 쌓인다');
});

test('운영 안 하는 날은 건너뛰고 건수를 알리며 그 날 행은 그대로(운영 안 함 유지)', () => {
  const env = makeEnv();
  call(env, 'saveDaySchedule', { date: '2027-03-10', operating: false, memo: '재량휴업', token: '' });
  const p = call(env, 'previewDayBatch', MAR);
  assert.deepStrictEqual([p.changeCount, p.closedCount], [4, 1]);
  assert.strictEqual(call(env, 'saveDayBatch', MAR, p.sig).changed, 4);
  assert.strictEqual(dayOf(env, '2027-03-10').operating, false);
  assert.strictEqual(live(env).filter((r) => r.date === '2027-03-10').length, 1);
});

test('미리 본 뒤 누가 바꾸면 저장은 {stale:true}·쓰기 없음, 새 sig로는 된다. sig가 없거나 틀려도 stale', () => {
  const env = makeEnv();
  const p = call(env, 'previewDayBatch', MAR);
  call(env, 'saveDaySchedule', { date: '2027-03-17', operating: true, end: '22:00', token: '' });
  const before = JSON.stringify(env.rows('day_schedules'));
  const r = call(env, 'saveDayBatch', MAR, p.sig);
  assert.deepStrictEqual([r.ok, r.stale], [false, true]);
  for (const bad of [null, '', 7, 'abc']) assert.strictEqual(call(env, 'saveDayBatch', MAR, bad).stale, true, String(bad));
  assert.strictEqual(JSON.stringify(env.rows('day_schedules')), before);
  assert.strictEqual(call(env, 'saveDayBatch', MAR, call(env, 'previewDayBatch', MAR).sig).ok, true);
});

test('입력 검사: 끝<시작·요일 없음·바꿀 내용 없음·366일 초과·잘못된 시각·없는 요일 유형·종료<시작이 되는 날 — 모두 쓰기 없이 오류', () => {
  const env = makeEnv();
  const bad = (over, field) => {
    const r = call(env, 'previewDayBatch', Object.assign({}, MAR, over));
    assert.strictEqual(r.ok, false, JSON.stringify(over)); assert.ok(r.errors.some((e) => e.field === field), JSON.stringify([over, r.errors]));
    const s = call(env, 'saveDayBatch', Object.assign({}, MAR, over), 'x'); assert.strictEqual(s.ok, false);
  };
  bad({ to: '2027-02-01' }, 'to'); bad({ from: '' }, 'from'); bad({ weekdays: [] }, 'weekdays'); bad({ weekdays: [7] }, 'weekdays'); bad({ weekdays: 'x' }, 'weekdays');
  bad({ weekdays: [3, 3] }, 'weekdays'); bad({ start: '' }, 'dayType'); bad({ to: '2028-12-31' }, 'to'); bad({ start: '25:00' }, 'start'); bad({ end: '7시' }, 'end');
  bad({ dayType: 'exam_x' }, 'dayType'); bad({ start: '23:55' }, 'end');
  assert.strictEqual(env.rows('day_schedules').length, 0);
});

test('고른 기간에 해당 요일이 없으면 오류(하루짜리 기간에 다른 요일)', () => {
  const env = makeEnv();
  const r = call(env, 'previewDayBatch', { from: '2027-03-01', to: '2027-03-01', weekdays: [WED], start: '18:00' });
  assert.deepStrictEqual([r.ok, r.errors[0].field], [false, 'weekdays']);
});
