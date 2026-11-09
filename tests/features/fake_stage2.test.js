/** T1a 가짜 2단계 근무표(src/dev/FakeStage2.gs): 순수 함수 검사 + 편집기 함수를 gas-fakes에서 두 번 실행 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ctx = loadGs(['src/Schema.gs', 'src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/DutyRules.gs',
  'src/dev/FakeData.gs', 'src/dev/FakeSeats.gs', 'src/dev/FakeStage1.gs', 'src/dev/FakeStage2.gs']);
const TESTER = 'test.teacher@example.com';
const fake = ctx.buildFakeData_({ ownerEmail: 'owner@test.invalid', teacherEmail: TESTER });
const d = plain(ctx.buildFakeStage2Duty_(fake));
const T1 = 'fake.teacher1@example.com', T2 = 'fake.teacher2@example.com', T3 = 'fake.teacher3@example.com';
const live = d.dutySlots.filter((r) => r.status === '유효');
const swapped = d.dutySlots.filter((r) => r.actual_email !== r.original_email);

test('참조 무결성: 근무자·교대자는 users의 학사 교사, 칸은 그 요일 틀(dutySlotsFor_), 날짜·칸마다 1행, 어휘', () => {
  const teachers = plain(fake.users).filter((u) => /hall_teacher/.test(u.roles)).map((u) => u.email);
  assert.deepStrictEqual(d.teachers, [T1, T2, T3, TESTER]);
  const seen = new Set();
  for (const r of d.dutySlots) {
    assert.ok(/^2027-01-(0[1-9]|[12]\d|3[01])$/.test(r.date), r.date);
    for (const e of [r.original_email, r.actual_email].concat(r.swapped_by ? [r.swapped_by] : [])) assert.ok(teachers.includes(e), e);
    const frame = plain(ctx.dutySlotsFor_({ operating: true, date: r.date, end: ctx.FAKE2_DAY_END[ctx.baseDayType_(r.date)] }));
    const f = frame.find((x) => x.slot === r.slot);
    assert.ok(f, r.date + ' ' + r.slot + ' 는 그 요일 칸이 아님');
    assert.strictEqual(r.end_time, f.end);
    assert.ok(!seen.has(r.date + r.slot), '같은 칸 두 행');
    seen.add(r.date + r.slot);
    assert.ok(['유효', '취소'].includes(r.status));
    assert.ok(r.swapped_at === '' || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(r.swapped_at));
    assert.strictEqual(!!r.swapped_at, r.actual_email !== r.original_email, '교대한 칸만 교대 일시');
    assert.strictEqual(!!r.swapped_by, r.actual_email !== r.original_email, '교대한 칸만 교대자');
  }
  assert.strictEqual(d.dutySlots.length, 62, '31일 × 2칸');
  const cols = (tab) => ['id'].concat(ctx.SCHEMA.db[tab]);
  for (const r of d.dutySlots) assert.deepStrictEqual(Object.keys(r).sort(), cols('duty_slots').sort(), 'duty_slots 열 그대로');
  assert.deepStrictEqual(Object.keys(d.daySchedules[0]).sort(), cols('day_schedules').sort());
  const setting = Object.fromEntries(plain(ctx.DEFAULT_SETTINGS).map((x) => [x[0], x[1]]));
  assert.deepStrictEqual(plain(ctx.FAKE2_DAY_END), { mon_thu: setting['study.weekday.end'], fri: setting['study.fri.end'],
    sat: setting['study.sat.end'], sun: setting['study.sun.end'] }, '그날 종료 = 설정 기본값');
  const stage1 = plain(ctx.buildFakeStage1_(fake));
  const ids = d.dutySlots.concat(d.daySchedules, stage1.daySchedules).map((r) => r.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id 고유(1단계 일정 id와도 겹치지 않음)');
});

test('실행마다 같은 결과(id 포함), 시험 교사가 없으면 만들지 않는다', () => {
  assert.deepStrictEqual(plain(ctx.buildFakeStage2Duty_(ctx.buildFakeData_({ teacherEmail: TESTER }))), d);
  assert.throws(() => ctx.buildFakeStage2Duty_(ctx.buildFakeData_({})), /TEST_TEACHER_EMAIL/);
});

test('운영 안 함 1일(2027-01-01): 일정 행 FALSE → 칸 틀 없음, 그날 근무 행은 모두 취소(결정 54)', () => {
  assert.strictEqual(d.daySchedules.length, 1);
  const ds = d.daySchedules[0];
  assert.deepStrictEqual([ds.date, ds.operating, ds.status], ['2027-01-01', 'FALSE', '유효']);
  const plan = ctx.resolveDayPlan_('2027-01-01', { daySchedule: ds });
  assert.strictEqual(plan.operating, false);
  assert.deepStrictEqual(plain(ctx.dutySlotsFor_(plan)), []);
  const day = d.dutySlots.filter((r) => r.date === '2027-01-01');
  assert.strictEqual(day.length, 2);
  assert.ok(day.every((r) => r.status === '취소'));
  assert.strictEqual(d.dutySlots.filter((r) => r.status === '취소').length, 2, '취소 행은 그날만');
});

test('교대 3건: 일반(본인이 넘김) · 교대의 교대 A→B→C(칸에는 A→C, B = swapped_by) · 예비 대신 근무(담당자가 기록)', () => {
  assert.strictEqual(swapped.length, 3);
  const [normal, chain, cover] = swapped;
  assert.deepStrictEqual([normal.date, normal.slot, normal.swapped_by], ['2027-01-05', '21:30조', normal.original_email]);
  assert.deepStrictEqual([chain.date, chain.slot], ['2027-01-13', '23:00조']);
  assert.strictEqual(new Set([chain.original_email, chain.swapped_by, chain.actual_email]).size, 3, 'A·B·C 서로 다름');
  assert.deepStrictEqual([cover.date, cover.slot, cover.swapped_by], ['2027-01-23', '단독', T2]);
  const standby = live.find((r) => r.date === cover.date && r.slot === '예비');
  assert.strictEqual(cover.actual_email, standby.actual_email, '그날 예비가 단독을 맡음');
  assert.ok(![cover.original_email, cover.actual_email].includes(T2), '담당자는 당사자가 아님');
  for (const r of swapped) {
    const other = live.filter((x) => x.date === r.date && x.id !== r.id && x.slot !== '예비');
    assert.ok(!other.some((x) => x.actual_email === r.actual_email), r.date + ' 받은 사람이 같은 날 다른 근무 칸에 있지 않음');
  }
  const rec = plain(ctx.dutyRecord_(d.dutySlots, '2027-01'));
  assert.deepStrictEqual(rec.swaps.map((s) => [s.date, s.from, s.to, s.kind]), [
    ['2027-01-05', T2, TESTER, '교대'], ['2027-01-13', T3, T1, '교대'], ['2027-01-23', TESTER, T1, '대신 근무']]);
});

test('dutyRecord_ 합계 = 실제 근무자(원래 근무자 합계와 다름), 예비는 따로 세고 대신 근무한 날은 뺀다(결정 46)', () => {
  const rec = plain(ctx.dutyRecord_(d.dutySlots, '2027-01', { operatingByDate: { '2027-01-01': false } }));
  assert.deepStrictEqual(rec.warnings, [], '운영 안 함 날의 취소 행은 세지 않아 경고 없음');
  const count = (key) => {
    const m = {};
    live.filter((r) => r.slot !== '예비').forEach((r) => (m[r[key]] = (m[r[key]] || 0) + 1));
    return m;
  };
  const totals = Object.fromEntries(rec.teachers.map((t) => [t.email, t.total]));
  assert.deepStrictEqual(totals, count('actual_email'));
  assert.deepStrictEqual(totals, { [T1]: 13, [T2]: 10, [T3]: 11, [TESTER]: 12 }, '손으로 센 값: 운영 30일 = 월~목 16일×2 + 금토일 14일 = 46칸');
  assert.deepStrictEqual(count('original_email'), { [T1]: 11, [T2]: 11, [T3]: 12, [TESTER]: 12 }, '원래 근무자로 세면 다르다');
  assert.notDeepStrictEqual(totals, count('original_email'));
  const sb = Object.fromEntries(rec.standby.map((s) => [s.email, s.count]));
  assert.deepStrictEqual(sb, { [T1]: 3, [T2]: 3, [T3]: 3, [TESTER]: 4 }, '예비 14일 − 대신 근무 1일 = 13');
  assert.ok(!rec.standby.find((s) => s.email === T1).dates.includes('2027-01-23'), '대신 근무한 날은 예비에서 뺌');
});

/** setup → seedFakeData (→ seedFakeStage1) 순서로 시드한다. 미등록 학생 등 다른 학생을 넣지 않는다(가짜 DB 판정은 정확히 일치). */
function seededEnv(props, opts) {
  const env = createGasEnv({ owner: 'owner@example.com', now: '2026-12-20T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: TESTER }, props || {});
  env.asOwner((c) => c.setup());
  if (!(opts && opts.noStudents)) env.asOwner((c) => c.seedFakeData());
  if (opts && opts.stage1) env.asOwner((c) => c.seedFakeStage1());
  return env;
}
const counts = (env) => [env.rows('duty_slots').length, env.rows('day_schedules').length];

test('seedFakeStage2: 가짜 DB에 쓰고, 두 번 실행해도 중복 없음, 시트에서 읽은 기록 = 순수 함수 기록', () => {
  const env = seededEnv({}, { stage1: true });
  const before = env.rows('day_schedules').length;
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()), '가짜 2단계 데이터: duty_slots +62, day_schedules +1');
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()), '가짜 2단계 데이터: duty_slots +0, day_schedules +0');
  assert.deepStrictEqual(counts(env), [62, before + 1]);
  const rec = env.as(T2, (c) => plain(c.dutyRecord_(c.readAll_('duty_slots'), '2027-01')));
  const pure = plain(ctx.dutyRecord_(d.dutySlots, '2027-01'));
  assert.deepStrictEqual(rec.teachers, pure.teachers);
  assert.deepStrictEqual(rec.swaps, pure.swaps);
  assert.deepStrictEqual(rec.standby, pure.standby);
});

test('seedFakeStage2: 가짜가 아닌 학생이 하나라도 있거나 학생이 없으면 쓰지 않는다', () => {
  const env = seededEnv();
  env.asOwner((c) => c.appendRecord_('students', { student_no: '39998', name: '진짜', gender: '여', grade: '3', class_no: '9',
    number: '98', track: '', email: 'someone@school.invalid', memo: '' }, env.owner));
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /가짜 학생/);
  assert.deepStrictEqual(counts(env), [0, 0]);
  const empty = seededEnv({}, { noStudents: true });
  assert.match(empty.errorOf(empty.owner, (c) => c.seedFakeStage2()).message, /가짜 학생/);
  assert.deepStrictEqual(counts(empty), [0, 0]);
});

test('seedFakeStage2: 이미 있는 1월 근무 칸·1/1 일정(다른 행)이 있으면 덮지 않는다', () => {
  const env = seededEnv();
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-01-05', slot: '21:30조', end_time: '21:30',
    original_email: 'real.teacher@school.invalid', actual_email: 'real.teacher@school.invalid', swapped_at: '', swapped_by: '',
    status: '유효', memo: '' }, env.owner));
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /다른 행이 1개/);
  assert.deepStrictEqual(counts(env), [1, 0]);
  const env2 = seededEnv();
  env2.asOwner((c) => c.appendRecord_('day_schedules', { date: '2027-01-01', operating: 'TRUE', start: '', end: '', day_type: '',
    memo: '', status: '유효' }, env2.owner));
  assert.match(env2.errorOf(env2.owner, (c) => c.seedFakeStage2()).message, /다른 행/);
  assert.deepStrictEqual(counts(env2), [0, 1]);
});

test('seedFakeStage2: TEST_TEACHER_EMAIL이 없거나 users에 학사 교사로 없으면 쓰지 않는다', () => {
  const env = seededEnv();
  delete env.scriptProps.TEST_TEACHER_EMAIL;
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /TEST_TEACHER_EMAIL/);
  env.scriptProps.TEST_TEACHER_EMAIL = 'late.teacher@example.com';   // 시드 뒤에 속성만 넣은 경우
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /addUser/);
  assert.deepStrictEqual(counts(env), [0, 0]);
});
