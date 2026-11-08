/** C8a F3 근무표 보기·편성·운영 안 함: R4 gas-fakes 환경에서 실제 공개 함수를 부른다. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com',
  T1 = 'test.teacher@example.com', T2 = 'fake.t2@example.com', T3 = 'fake.t3@example.com', HOMEROOM = 'test.homeroom@example.com',
  STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const WED = '2027-03-03', FRI = '2027-03-05', MAR = '2027-03';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => { c.addUser(T2, '가짜교사2', 'hall_teacher'); c.addUser(T3, '가짜교사3', 'hall_teacher'); });
  const users = env.rows('users');
  const id = (email) => users.find((u) => u.email === email).id;
  return { env, id, t1: id(T1), t2: id(T2), t3: id(T3), slots: () => env.rows('duty_slots') };
}
const nameOf = (x, id) => x.env.rows('users').find((u) => u.id === id).name;
const save = (x, who, input) => x.env.call(who, 'saveDutyDay', input);
const day = (x, who, date) => x.env.call(who, 'getDutyMonth', date.slice(0, 7)).days.find((d) => d.date === date);

test('getDutyMonth: 달 전체 날짜와 그날 틀(월~목 두 조, 금·토·일 근무+예비), 응답에 이메일이 없다', () => {
  const x = makeEnv();
  const m = x.env.expectAllowed(DUTY, 'getDutyMonth', MAR);
  assert.strictEqual(m.days.length, 31);
  assert.deepStrictEqual(m.days.find((d) => d.date === WED).slots.map((s) => [s.slot, s.end]), [['21:30조', '21:30'], ['23:00조', '23:00']]);
  assert.deepStrictEqual(m.days.find((d) => d.date === FRI).slots.map((s) => s.label), ['근무', '예비 감독']);
  assert.ok(!JSON.stringify(m).includes('@'), '이메일은 내지 않는다');
  assert.ok(m.canEdit && m.canOperate);
  assert.ok(m.teachers.some((t) => t.id === x.t2 && t.name === '가짜교사2') && m.teachers.every((t) => Object.keys(t).sort().join() === 'id,name'));
  assert.strictEqual(m.emptyDays, m.days.filter((d) => d.operating).length, '편성 전에는 운영하는 날이 모두 비어 있다');
});

test('getDutyMonth 권한: 관리자·근무표 담당자·학사 교사·출결 담당 허용(학사 교사·출결 담당은 편성 못 함), 담임·학생·학부모 거부', () => {
  const x = makeEnv();
  for (const who of [ADMIN, DUTY, T1, ATT]) x.env.expectAllowed(who, 'getDutyMonth', MAR);
  assert.deepStrictEqual([T1, ATT].map((w) => x.env.call(w, 'getDutyMonth', MAR).canEdit), [false, false]);
  for (const who of [HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.view', 'getDutyMonth', MAR);
  assert.throws(() => x.env.call(DUTY, 'getDutyMonth', '2027-13'), /yyyy-MM/);
});

test('saveDutyDay: 담당자가 저장하면 행과 audit create가 생기고, 같은 내용을 다시 저장하면 0건', () => {
  const x = makeEnv();
  const before = x.slots().length, a0 = x.env.auditActions('create').length;
  const r = save(x, DUTY, { date: WED, slots: { '21:30조': x.t1, '23:00조': x.t2 } });
  assert.deepStrictEqual(plain(r), { ok: true, changed: 2 });
  assert.strictEqual(x.slots().length, before + 2);
  const row = x.slots().find((q) => q.slot === '21:30조');
  assert.deepStrictEqual([row.date, row.end_time, row.original_email, row.actual_email, row.status, row.swapped_at], [WED, '21:30', T1, T1, '유효', '']);
  assert.ok(x.env.auditActions('create').length >= a0 + 2);
  const w = x.slots().length, snap = JSON.stringify(x.slots()), audits = x.env.rows('audit_log').length;
  assert.deepStrictEqual(plain(save(x, DUTY, { date: WED, slots: { '21:30조': x.t1, '23:00조': x.t2 } })), { ok: true, changed: 0 });
  assert.strictEqual(x.slots().length, w); assert.strictEqual(JSON.stringify(x.slots()), snap); assert.strictEqual(x.env.rows('audit_log').length, audits, '쓰기 0건');
  const d = day(x, DUTY, WED);
  assert.deepStrictEqual(d.slots.map((s) => [s.name, s.userId]), [[nameOf(x, x.t1), x.t1], ['가짜교사2', x.t2]]);
});

test('saveDutyDay: 다른 교사로 바꾸면 그 행을 고치고(update), 비우면 그 칸 행이 취소된다', () => {
  const x = makeEnv();
  save(x, ADMIN, { date: WED, slots: { '21:30조': x.t1, '23:00조': x.t2 } });
  assert.deepStrictEqual(plain(save(x, DUTY, { date: WED, slots: { '21:30조': x.t3 } })), { ok: true, changed: 1 });
  const live = x.slots().filter((q) => q.status === '유효');
  assert.strictEqual(live.length, 2); assert.strictEqual(live.find((q) => q.slot === '21:30조').actual_email, T3);
  assert.ok(x.env.auditActions('update').length >= 1);
  assert.deepStrictEqual(plain(save(x, DUTY, { date: WED, slots: { '23:00조': '' } })), { ok: true, changed: 1 });
  assert.strictEqual(x.slots().find((q) => q.slot === '23:00조').status, '취소');
  assert.strictEqual(day(x, DUTY, WED).slots[1].name, '', '비운 칸은 이름이 없다');
  assert.strictEqual(x.slots().length, 2, '지우지 않고 취소로 남긴다');
});

test('saveDutyDay: 같은 교사가 같은 날 두 칸이면 확인 없이는 저장하지 않고 경고, acknowledge면 저장', () => {
  const x = makeEnv();
  const w = x.slots().length;
  const r = save(x, DUTY, { date: FRI, slots: { '단독': x.t1, '예비': x.t1 } });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.needsConfirm, true); assert.ok(r.warnings[0].includes('이미'));
  assert.strictEqual(x.slots().length, w, '경고 응답은 쓰지 않는다');
  assert.deepStrictEqual(plain(save(x, DUTY, { date: FRI, slots: { '단독': x.t1, '예비': x.t1 }, acknowledge: true })), { ok: true, changed: 2 });
});

test('saveDutyDay 거부: 운영 안 하는 날·그날 틀 밖 슬롯·활성 학사 교사가 아닌 대상·잘못된 날짜(쓰기 0건)', () => {
  const x = makeEnv();
  const w = x.slots().length;
  assert.strictEqual(save(x, DUTY, { date: WED, slots: { '단독': x.t1 } }).ok, false, '월~목에 단독 칸 없음');
  assert.strictEqual(save(x, DUTY, { date: WED, slots: { '21:30조': 'no-such-id' } }).ok, false);
  const adminId = x.env.rows('users').find((u) => u.email === ADMIN).id;
  assert.strictEqual(save(x, DUTY, { date: WED, slots: { '21:30조': adminId } }).ok, false, '학사 교사가 아닌 계정');
  assert.strictEqual(save(x, DUTY, { date: '2027/03/03', slots: {} }).ok, false);
  x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false });
  const r = save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  assert.deepStrictEqual([r.ok, r.errors[0].field], [false, 'date']);
  assert.strictEqual(x.slots().length, w);
});

test('saveDutyDay: 교대된 칸은 편성으로 바꾸지 못한다(같은 사람으로 다시 저장은 허용)', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  const row = x.slots().find((q) => q.slot === '21:30조');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', row.id, { actual_email: T2, swapped_at: '2027-03-02T10:00:00', swapped_by: T1 }, ADMIN));
  const r = save(x, DUTY, { date: WED, slots: { '21:30조': x.t3 } });
  assert.strictEqual(r.ok, false); assert.ok(r.errors[0].message.includes('교대'));
  assert.deepStrictEqual(plain(save(x, DUTY, { date: WED, slots: { '21:30조': x.t2 } })), { ok: true, changed: 0 });
  const d = day(x, DUTY, WED).slots[0];
  assert.deepStrictEqual([d.swapped, d.swappedFrom, d.name], [true, nameOf(x, x.t1), '가짜교사2']);
  assert.strictEqual(x.env.call(DUTY, 'getDutyMonth', MAR).swapCount, 1);
});

test('saveDutyDay 권한: 학사 교사·출결 담당·담임·학생·학부모는 거부 + denied:duty.edit, 쓰기 0건', () => {
  const x = makeEnv();
  const w = x.slots().length;
  for (const who of [T1, ATT, HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.edit', 'saveDutyDay', { date: WED, slots: { '21:30조': x.t1 } });
  assert.strictEqual(x.slots().length, w);
  x.env.expectAllowed(ADMIN, 'saveDutyDay', { date: WED, slots: { '21:30조': x.t1 } });
});

test('setDutyOperating: 담당자가 끄고 켠다 — day_schedules의 운영 여부·메모만, 기본으로 돌아오면 행은 취소', () => {
  const x = makeEnv();
  const dsRows = () => x.env.rows('day_schedules');
  assert.strictEqual(dsRows().filter((q) => q.date === WED && q.status !== '취소').length, 0, '시작할 때 그날 일정 행 없음(가짜 데이터)');
  assert.deepStrictEqual(plain(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, memo: '학교 행사' })), { ok: true, changed: true });
  let d = day(x, DUTY, WED); assert.deepStrictEqual([d.operating, d.memo], [false, '학교 행사']); assert.deepStrictEqual(d.slots, []);
  const live = dsRows().filter((q) => q.date === WED && q.status !== '취소');
  assert.strictEqual(live.length, 1); assert.strictEqual(live[0].operating, 'FALSE');
  assert.deepStrictEqual(plain(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, memo: '학교 행사' })), { ok: true, changed: false });
  assert.deepStrictEqual(plain(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: true, memo: '' })), { ok: true, changed: true });
  d = day(x, DUTY, WED); assert.deepStrictEqual([d.operating, d.memo], [true, '']);
  assert.strictEqual(dsRows().filter((q) => q.date === WED && q.status !== '취소').length, 0, '기본으로 돌아오면 유효 행이 없다');
  assert.ok(x.env.auditActions('update').length >= 1);
});

test('setDutyOperating: 이미 정한 시각·요일 유형은 그대로 두고, 근무 편성이 있는 날을 끄면 확인을 먼저 묻는다', () => {
  const x = makeEnv();
  x.env.call(ADMIN, 'saveDaySchedule', { date: WED, operating: true, start: '18:30', end: '21:00', day_type: '', memo: '' });
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  const r = x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.needsConfirm, true); assert.ok(r.warnings[0].includes('1칸'));
  assert.strictEqual(day(x, DUTY, WED).operating, true, '확인 전에는 바뀌지 않는다');
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, acknowledge: true }).ok, true);
  const row = x.env.rows('day_schedules').find((q) => q.date === WED && q.status !== '취소');
  assert.deepStrictEqual([row.operating, row.start, row.end], ['FALSE', '18:30', '21:00']);
  assert.strictEqual(x.slots().filter((q) => q.status === '유효').length, 1, '편성은 지우지 않는다');
});

test('setDutyOperating 권한·입력: 관리자·담당자만(학사 교사·출결 담당·담임 거부 + denied:duty.operating), 잘못된 값은 거부', () => {
  const x = makeEnv();
  for (const who of [T1, ATT, HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.operating', 'setDutyOperating', { date: WED, operating: false });
  x.env.expectAllowed(ADMIN, 'setDutyOperating', { date: WED, operating: false });
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: 'x', operating: false }).ok, false);
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: 'FALSE' }).ok, false);
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: true, memo: 'ㄱ'.repeat(500) }).ok, false);
});

test('홈 훅: 근무표 담당자는 이번 달 빈 날·교대, 학사 교사는 오늘 내 근무와 다음 근무', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1, '23:00조': x.t2 } });
  save(x, DUTY, { date: FRI, slots: { '단독': x.t3, '예비': x.t1 } });
  const mgr = x.env.call(DUTY, 'getHomeData', 'duty_manager').duty;
  assert.ok(mgr.emptyDays > 0 && mgr.swapCount === 0);
  assert.deepStrictEqual(plain(x.env.call(ADMIN, 'getHomeData', 'admin').duty), plain(mgr), '관리자 홈도 같은 숫자');
  const t1 = x.env.call(T1, 'getHomeData', 'hall_teacher').duty;
  assert.deepStrictEqual(plain(t1), { today: '21:30조', next: { date: FRI, label: '예비 감독' } });
  const t3 = x.env.call(T3, 'getHomeData', 'hall_teacher').duty;
  assert.deepStrictEqual(plain(t3), { today: '', next: { date: FRI, label: '근무' } });
});
