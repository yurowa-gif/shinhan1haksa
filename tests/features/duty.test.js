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
  assert.strictEqual(r.ok, false); assert.strictEqual(r.needsConfirm, true); assert.ok(r.warnings[0].includes('이미') && r.warnings[0].includes('에 편성되어 있습니다'), r.warnings[0]);
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
  assert.deepStrictEqual(plain(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, memo: '학교 행사' })), { ok: true, changed: true, canceledSlots: 0 });
  let d = day(x, DUTY, WED); assert.deepStrictEqual([d.operating, d.memo], [false, '학교 행사']); assert.deepStrictEqual(d.slots, []);
  const live = dsRows().filter((q) => q.date === WED && q.status !== '취소');
  assert.strictEqual(live.length, 1); assert.strictEqual(live[0].operating, 'FALSE');
  assert.deepStrictEqual(plain(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, memo: '학교 행사' })), { ok: true, changed: false });
  assert.deepStrictEqual(plain(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: true, memo: '' })), { ok: true, changed: true, canceledSlots: 0 });
  d = day(x, DUTY, WED); assert.deepStrictEqual([d.operating, d.memo], [true, '']);
  assert.strictEqual(dsRows().filter((q) => q.date === WED && q.status !== '취소').length, 0, '기본으로 돌아오면 유효 행이 없다');
  assert.ok(x.env.auditActions('update').length >= 1);
});

test('setDutyOperating: 이미 정한 시각·요일 유형은 그대로 두고, 편성이 있는 날을 끄면 취소될 칸을 보여 주며 먼저 확인을 묻는다', () => {
  const x = makeEnv();
  x.env.call(ADMIN, 'saveDaySchedule', { date: WED, operating: true, start: '18:30', end: '21:00', day_type: '', memo: '' });
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  const r = x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.needsConfirm, true);
  assert.ok(r.warnings[0].includes('21:30조 ' + nameOf(x, x.t1)) && r.warnings[0].includes('취소됩니다'), r.warnings[0]);
  assert.strictEqual(day(x, DUTY, WED).operating, true, '확인 전에는 바뀌지 않는다');
  assert.strictEqual(x.slots().filter((q) => q.status === '유효').length, 1, '확인 전에는 칸도 그대로');
  const ok = x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, confirmIds: r.confirmIds });
  assert.deepStrictEqual([ok.ok, ok.canceledSlots], [true, 1]);
  const row = x.env.rows('day_schedules').find((q) => q.date === WED && q.status !== '취소');
  assert.deepStrictEqual([row.operating, row.start, row.end], ['FALSE', '18:30', '21:00']);
  assert.deepStrictEqual(x.slots().map((q) => q.status), ['취소'], '행은 지우지 않고 취소');
  assert.ok(x.env.rows('audit_log').some((a) => a.action === 'update' && a.sheet === 'duty_slots' && a.row_id === x.slots()[0].id), '취소가 audit에 남는다');
});

test('운영 안 함으로 취소된 칸은 다시 운영으로 켜도 되살아나지 않고, 그날은 월말 기록 합계에서 빠진다', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1, '23:00조': x.t2 } });
  const total = () => plain(x.env.as(ADMIN, (c) => c.dutyRecord_(c.readAll_('duty_slots'), MAR, {}))).teachers.reduce((n, t) => n + t.total, 0);
  assert.strictEqual(total(), 2);
  x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, confirmIds: x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false }).confirmIds });
  assert.strictEqual(total(), 0, '취소된 칸은 기록표에 없다');
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: true }).ok, true);
  assert.strictEqual(total(), 0, '다시 켜도 되살아나지 않는다');
  assert.deepStrictEqual(day(x, DUTY, WED).slots.map((s) => s.name), ['', ''], '칸은 비어 있다(다시 편성)');
  assert.strictEqual(x.slots().filter((q) => q.status === '유효').length, 0);
});

test('지난 날짜는 근무표 담당자가 운영 여부를 바꿀 수 없다(관리자는 가능), 오늘은 가능', () => {
  const x = makeEnv();
  const past = '2027-03-02';
  const w = x.env.rows('day_schedules').length, a = x.env.rows('audit_log').length;
  const r = x.env.call(DUTY, 'setDutyOperating', { date: past, operating: false });
  assert.deepStrictEqual([r.ok, r.errors[0].field], [false, 'date']); assert.ok(r.errors[0].message.includes('지난 날짜'));
  assert.strictEqual(x.env.rows('day_schedules').length, w); assert.strictEqual(x.env.rows('audit_log').length, a, '쓰기 0건');
  assert.strictEqual(x.env.call(ADMIN, 'setDutyOperating', { date: past, operating: false }).ok, true);
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false }).ok, true);
  assert.deepStrictEqual([x.env.call(DUTY, 'getDutyMonth', MAR).canEditPast, x.env.call(ADMIN, 'getDutyMonth', MAR).canEditPast], [false, true]);
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
  assert.deepStrictEqual(plain(t1), { today: { label: '21:30조', end: '21:30' }, next: { date: FRI, weekdayKo: '금', label: '예비 감독' } });
  const t3 = x.env.call(T3, 'getHomeData', 'hall_teacher').duty;
  assert.deepStrictEqual(plain(t3), { today: null, next: { date: FRI, weekdayKo: '금', label: '근무' } });
});

/* ───── 총괄 검토 반영(#66) ───── */

const confirmIdsOf = (x, who, call, ...args) => x.env.call(who, call, ...args).confirmIds;

test('관리자가 자습 일정(saveDaySchedule)에서 운영 안 함으로 바꿔도 근무 칸이 취소된다 — 확인창을 한 번 거치고, 홈·기록표에서 빠진다', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1, '23:00조': x.t2 } });
  save(x, DUTY, { date: FRI, slots: { '단독': x.t1 } });
  const off = { date: WED, operating: false, memo: '행사' };
  const first = x.env.call(ADMIN, 'saveDaySchedule', off);
  assert.strictEqual(first.ok, false); assert.strictEqual(first.needsConfirm, true);
  assert.ok(first.warnings[0].includes('21:30조 ' + nameOf(x, x.t1)) && first.warnings[0].includes('23:00조'), first.warnings[0]);
  assert.strictEqual(x.env.rows('day_schedules').filter((q) => q.date === WED && q.status !== '취소').length, 0, '확인 전에는 쓰지 않는다');
  assert.strictEqual(x.slots().filter((q) => q.status === '유효').length, 3);
  const r = x.env.call(ADMIN, 'saveDaySchedule', Object.assign({ confirmIds: first.confirmIds }, off));
  assert.deepStrictEqual([r.ok, r.canceledSlots], [true, 2]);
  assert.deepStrictEqual(x.slots().filter((q) => q.status === '유효').map((q) => q.date), [FRI], '수요일 칸만 취소, 금요일은 그대로');
  const home = x.env.call(T1, 'getHomeData', 'hall_teacher').duty;
  assert.strictEqual(home.today, null, '운영 안 하는 날은 오늘 내 근무에서 빠진다');
  assert.strictEqual(home.next.date, FRI);
  const total = plain(x.env.as(ADMIN, (c) => c.dutyRecord_(c.readAll_('duty_slots'), MAR, {}))).teachers.reduce((n, t) => n + t.total, 0);
  assert.strictEqual(total, 1);
});

test('확인창이 본 칸 목록이 지금과 다르면(낡은 확인창) 취소하지 않고 다시 확인을 요구한다', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  const stale = confirmIdsOf(x, DUTY, 'setDutyOperating', { date: WED, operating: false });
  save(x, DUTY, { date: WED, slots: { '23:00조': x.t2 } });   // 확인창을 보는 사이 다른 칸이 편성됨
  const r = x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, confirmIds: stale });
  assert.strictEqual(r.needsConfirm, true); assert.notDeepStrictEqual(r.confirmIds, stale);
  assert.strictEqual(x.slots().filter((q) => q.status === '유효').length, 2, '아무것도 취소되지 않았다');
  assert.strictEqual(day(x, DUTY, WED).operating, true);
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, confirmIds: r.confirmIds }).ok, true);
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, acknowledge: true }).ok, true, 'acknowledge만으로는 이미 끈 날이라 변화 없음');
});

test('수요일을 끄면 금요일 칸은 그대로 유효하다, 이미 운영 안 함인 날에 남은 칸도 다시 끄면 정리된다', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  save(x, DUTY, { date: FRI, slots: { '단독': x.t2, '예비': x.t3 } });
  x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, confirmIds: confirmIdsOf(x, DUTY, 'setDutyOperating', { date: WED, operating: false }) });
  assert.deepStrictEqual(x.slots().filter((q) => q.status === '유효').map((q) => q.date).sort(), [FRI, FRI]);
  // 관리자가 칸을 취소하지 않은 채 운영 안 함이 된 옛 상태를 만들어 본다: 행 하나를 되살린다
  const row = x.slots().find((q) => q.date === WED);
  x.env.asOwner((c) => c.updateRecord_('duty_slots', row.id, { status: '유효' }, ADMIN));
  const ids = confirmIdsOf(x, DUTY, 'setDutyOperating', { date: WED, operating: false, memo: '다시' });
  assert.ok(ids && ids.length === 1, '이미 운영 안 함이어도 남은 칸을 정리하자고 묻는다');
  assert.strictEqual(x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: false, memo: '다시', confirmIds: ids }).ok, true);
  assert.strictEqual(x.slots().filter((q) => q.status === '유효' && q.date === WED).length, 0);
});

test('cancelDaySchedule: 기본으로 되돌려도 근무 칸은 그대로(기본은 늘 운영)', () => {
  const x = makeEnv();
  x.env.call(ADMIN, 'saveDaySchedule', { date: WED, operating: true, start: '18:30', end: '21:00', day_type: '', memo: '' });
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  const r = x.env.call(ADMIN, 'cancelDaySchedule', WED);
  assert.deepStrictEqual(plain(r), { ok: true, cancelled: 1 });
  assert.strictEqual(x.slots().filter((q) => q.status === '유효').length, 1);
});

test('saveDutyDay: 교대된 칸의 그날 끝 시각만 바뀌면 같은 사람으로 다시 저장해도 교대 기록(원래·실제·교대 일시)이 남고 끝 시각만 고친다', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  const row = x.slots().find((q) => q.slot === '21:30조');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', row.id, { actual_email: T2, swapped_at: '2027-03-02T10:00:00', swapped_by: T1, end_time: '21:00' }, ADMIN));
  const r = save(x, DUTY, { date: WED, slots: { '21:30조': x.t2 } });
  assert.deepStrictEqual(plain(r), { ok: true, changed: 1 });
  const after = x.slots().find((q) => q.id === row.id);
  assert.deepStrictEqual([after.original_email, after.actual_email, after.swapped_at, after.swapped_by, after.end_time], [T1, T2, '2027-03-02T10:00:00', T1, '21:30']);
});

test('saveDutyDay: 교대된 칸을 비우려 해도 거부, 비활성 교사·학사 교사가 아닌 계정 배정 거부(쓰기 0건)', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  const row = x.slots().find((q) => q.slot === '21:30조');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', row.id, { actual_email: T2, swapped_at: '2027-03-02T10:00:00', swapped_by: T1 }, ADMIN));
  const snap = JSON.stringify(x.slots());
  const r = save(x, DUTY, { date: WED, slots: { '21:30조': '' } });
  assert.strictEqual(r.ok, false); assert.ok(r.errors[0].message.includes('교대'));
  x.env.asOwner((c) => c.updateRecord_('users', x.t3, { active: 'FALSE' }, ADMIN));
  const r2 = save(x, DUTY, { date: WED, slots: { '23:00조': x.t3 } });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(JSON.stringify(x.slots()), snap);
});

test('지난 날짜의 편성(saveDutyDay)도 근무표 담당자는 바꿀 수 없고(쓰기 0건), 관리자는 바꿀 수 있다', () => {
  const x = makeEnv();
  const past = '2027-03-02';
  const w = x.slots().length, a = x.env.rows('audit_log').length;
  const r = save(x, DUTY, { date: past, slots: { '21:30조': x.t1 } });
  assert.deepStrictEqual([r.ok, r.errors[0].field], [false, 'date']);
  assert.ok(r.errors[0].message.includes('지난 날짜는 바꿀 수 없습니다') && r.errors[0].message.includes('교대로 기록'));
  assert.strictEqual(x.slots().length, w); assert.strictEqual(x.env.rows('audit_log').length, a);
  assert.strictEqual(save(x, ADMIN, { date: past, slots: { '21:30조': x.t1 } }).ok, true);
  assert.strictEqual(save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } }).ok, true, '오늘은 가능');
});

test('바깥 락을 못 잡으면 두 함수 모두 "다른 사람이 저장 중" 오류 — 쓰지 않는 호출(같은 내용 저장·이미 운영 중)도 바깥 락에서 막힌다', () => {
  const x = makeEnv();
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });   // 먼저 저장해 두면 같은 내용 재저장은 안쪽 쓰기가 없다
  const w = x.slots().length, d = x.env.rows('day_schedules').length;
  x.env.lock.failNext = 1;
  assert.throws(() => save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } }), /다른 사람이 저장 중/);
  x.env.lock.failNext = 1;
  assert.throws(() => x.env.call(DUTY, 'setDutyOperating', { date: WED, operating: true }), /다른 사람이 저장 중/);
  x.env.lock.failNext = 1;
  assert.throws(() => save(x, DUTY, { date: WED, slots: { '23:00조': x.t2 } }), /다른 사람이 저장 중/);
  assert.strictEqual(x.slots().length, w); assert.strictEqual(x.env.rows('day_schedules').length, d);
});

test('acknowledge:true만으로는 근무 칸을 취소하지 않는다(확인창이 본 칸 id가 필요), 운영 안 하는 날에 남은 칸은 홈 today/next에서 빠지고, 주말 확인 문구는 "예비 감독"', () => {
  const x = makeEnv();
  save(x, DUTY, { date: FRI, slots: { '단독': x.t1, '예비': x.t2 } });
  const r = x.env.call(DUTY, 'setDutyOperating', { date: FRI, operating: false, acknowledge: true });
  assert.strictEqual(r.needsConfirm, true); assert.ok(r.warnings[0].includes('근무 ' + nameOf(x, x.t1)) && r.warnings[0].includes('예비 감독 ' + nameOf(x, x.t2)), r.warnings[0]);
  assert.strictEqual(x.slots().filter((q) => q.status === '유효').length, 2);
  // 옛 상태 재현: 운영 안 함인데 칸이 남아 있다 → 홈의 오늘·다음 근무에서 빠진다
  save(x, DUTY, { date: WED, slots: { '21:30조': x.t1 } });
  x.env.call(ADMIN, 'saveDaySchedule', { date: FRI, operating: false, confirmIds: r.confirmIds });
  const row = x.slots().find((q) => q.date === FRI);
  x.env.asOwner((c) => c.updateRecord_('duty_slots', row.id, { status: '유효' }, ADMIN));
  assert.deepStrictEqual(plain(x.env.call(T1, 'getHomeData', 'hall_teacher').duty), { today: { label: '21:30조', end: '21:30' }, next: null }, '운영 안 하는 날은 다음 근무에서 빠진다');
  x.env.setNow('2027-03-05T20:00:00');
  assert.strictEqual(x.env.call(T1, 'getHomeData', 'hall_teacher').duty.today, null, '오늘이 운영 안 하는 날이면 오늘 내 근무 없음');
});

test('빈 예비 감독 칸도 빈 날로 센다(emptyDays·홈 빈 날 목록)', () => {
  const x = makeEnv();
  const fridays = x.env.call(DUTY, 'getDutyMonth', MAR).days.filter((d) => d.operating && d.slots.some((s) => s.slot === '단독')).length;
  const before = x.env.call(DUTY, 'getDutyMonth', MAR).emptyDays;
  save(x, DUTY, { date: FRI, slots: { '단독': x.t1 } });
  assert.strictEqual(x.env.call(DUTY, 'getDutyMonth', MAR).emptyDays, before, '근무만 채우고 예비가 비어 있으면 아직 빈 날');
  save(x, DUTY, { date: FRI, slots: { '예비': x.t2 } });
  assert.strictEqual(x.env.call(DUTY, 'getDutyMonth', MAR).emptyDays, before - 1);
  assert.ok(fridays > 0);
  const open = x.env.call(DUTY, 'getHomeData', 'duty_manager').duty.open;
  assert.ok(open.length >= 1 && open.length <= 3 && open.every((o) => o.date && o.weekdayKo && o.labels.length));
});
