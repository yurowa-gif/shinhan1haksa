/** T1a·T1b 가짜 2단계 근무표·생활 기록(src/dev/FakeStage2.gs): 순수 함수 검사 + 편집기 함수를 gas-fakes에서 두 번 실행 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ctx = loadGs(['src/Schema.gs', 'src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/StatusRules.gs',
  'src/rules/MealRules.gs', 'src/rules/MoveRules.gs', 'src/rules/OutRules.gs', 'src/rules/DutyRules.gs',
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
  }
  assert.strictEqual(d.dutySlots.length, 62, '31일 × 2칸');
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

/* ---------- T1b: 2027-03 생활 기록 ---------- */
const RULES = plain(ctx.DEFAULT_VIOLATION_RULES).map((r, i) => ({ id: 'rule-' + (i + 1), name: r[0], status: '' }));
const life = plain(ctx.buildFakeStage2Life_(fake, RULES));
const stage1 = plain(ctx.buildFakeStage1_(fake));

test('생활 기록 학생은 1단계가 쓰는 학생(특이사항·고정 일정·퇴실·중도 입실)과 겹치지 않는다', () => {
  const used = new Set([].concat(stage1.exceptions.map((e) => e.student_id), stage1.fixedSchedules.map((f) => f.student_id),
    [stage1.leaverId, stage1.lateEntrantId]));
  const mine = [life.out2Id, life.out1Id, life.pendingId].concat(life.noDocIds);
  assert.strictEqual(new Set(mine).size, 5);
  for (const id of mine) assert.ok(!used.has(id), id);
});

test('2027-03 직접 OUT: 2건 학생 1명(퇴실 대상) · 1건 학생 1명, 1학기·항목 참조·어휘', () => {
  assert.strictEqual(life.term.name, '2027 1학기');
  assert.strictEqual(life.violations.length, 3);
  const ruleOf = Object.fromEntries(RULES.map((r) => [r.id, r.name]));
  for (const v of life.violations) {
    assert.strictEqual(v.term_id, life.term.id);
    assert.strictEqual(ruleOf[v.rule_id], v.rule_name, 'rule_id ↔ rule_name');
    assert.notStrictEqual(v.rule_name, RULES[0].name, '자동 항목(무단 지각·결석·이탈)은 직접 OUT에 쓰지 않음');
    assert.deepStrictEqual([v.status, v.source, v.source_exception_id, v.cancel_reason], ['유효', '직접', '', '']);
    assert.ok(/^2027-03-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v.occurred_at) && v.occurred_at >= life.term.start_date);
    assert.ok(v.detected_by && v.entered_by);
  }
  const lv = (id) => plain(ctx.outLevel_(life.violations, id, life.term.id));
  assert.deepStrictEqual(lv(life.out2Id), { count: 2, level: 2, label: '퇴실 대상' });
  assert.deepStrictEqual(lv(life.out1Id), { count: 1, level: 1, label: '1OUT' });
  assert.strictEqual(new Set(life.violations.map((v) => v.student_id)).size, 2, '그 밖의 학생은 OUT 없음');
  assert.throws(() => ctx.buildFakeStage2Life_(fake, []), /setup/, 'violation_rules가 비면 만들지 않음');
});

test('서류 미제출 F7 급식 신청 2건: 미제출이어도 적용(결정 3), 적용일 = 11:30 규칙(당일·다음 날)', () => {
  const rows = life.statusChanges.filter((r) => r.doc_submitted === 'FALSE');
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows.map((r) => r.student_id), life.noDocIds);
  assert.ok(rows.every((r) => r.doc_submitted === 'FALSE' && r.source === 'F7' && r.status === '유효' && r.linked_change_id === ''));
  assert.deepStrictEqual(rows.map((r) => [r.requested_at, r.effective_date, r.effective_date_auto]), [
    ['2027-03-08T10:00:00', '2027-03-08', '2027-03-08'], ['2027-03-09T14:00:00', '2027-03-10', '2027-03-10']]);
  const all = stage1.statusChanges.concat(rows);
  for (const r of rows) {
    const before = ctx.ymdAddDays_(r.effective_date, -1);
    assert.strictEqual(ctx.statusOn_(all, r.student_id, '석식', before), '학사 석식');
    assert.strictEqual(ctx.statusOn_(all, r.student_id, '석식', r.effective_date), '일반 석식');
  }
  const ids = life.violations.concat(life.statusChanges, stage1.statusChanges, d.dutySlots).map((r) => r.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id 고유');
});

test('F7 대기 행 1건: 수요일 미실시 신청 → 다다음 주 월요일(3/22), 그 전까지는 학사 석식', () => {
  const p = life.statusChanges.filter((r) => r.doc_submitted !== 'FALSE');
  assert.strictEqual(p.length, 1);
  assert.deepStrictEqual([p[0].student_id, p[0].item, p[0].value, p[0].requested_at, p[0].effective_date, p[0].doc_submitted, p[0].source],
    [life.pendingId, '석식', '미실시', '2027-03-10T09:00:00', '2027-03-22', 'TRUE', 'F7']);
  const all = stage1.statusChanges.concat(life.statusChanges);
  assert.strictEqual(ctx.statusOn_(all, life.pendingId, '석식', '2027-03-21'), '학사 석식');
  assert.strictEqual(ctx.statusOn_(all, life.pendingId, '석식', '2027-03-22'), '미실시');
});

test('seedFakeStage2: 가짜 DB에 쓰고, 두 번 실행해도 중복 없음', () => {
  const env = createGasEnv({ owner: 'owner@example.com', now: '2026-12-20T10:00:00' });
  env.seedFake({ stage1: true });
  const before = env.rows('day_schedules').length;
  const vtab = ctx.termSheetName_('violations', life.term.id);
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()),
    '가짜 2단계 데이터: duty_slots +62, day_schedules +1, ' + vtab + ' +3, status_changes +3');
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()),
    '가짜 2단계 데이터: duty_slots +0, day_schedules +0, ' + vtab + ' +0, status_changes +0');
  const vs = env.rows(vtab);
  const ruleIds = env.rows('violation_rules').map((r) => r.id);
  assert.ok(vs.length === 3 && vs.every((v) => ruleIds.includes(v.rule_id)), 'rule_id는 setup이 만든 항목');
  assert.strictEqual(env.as(T1, (c) => c.outLevel_(c.readAll_(vtab), life.out2Id, life.term.id).label), '퇴실 대상');
  const rows = env.rows('duty_slots');
  assert.strictEqual(rows.length, 62);
  assert.strictEqual(env.rows('day_schedules').length, before + 1);
  assert.deepStrictEqual(rows.map((r) => r.actual_email).filter((e, i, a) => a.indexOf(e) === i).sort(), [T1, T2, T3, TESTER]);
  const rec = env.as(T2, (c) => plain(c.dutyRecord_(c.readAll_('duty_slots'), '2027-01')));
  assert.strictEqual(rec.teachers.reduce((n, t) => n + t.total, 0), 46, '시트에서 읽어도 같은 합계');
});

test('seedFakeStage2: 1단계 가짜 데이터가 없으면 쓰지 않는다', () => {
  const env = createGasEnv({ owner: 'owner@example.com', now: '2026-12-20T10:00:00' });
  env.seedFake();
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /seedFakeStage1/);
  assert.strictEqual(env.rows('duty_slots').length, 0);
});

test('seedFakeStage2: TEST_TEACHER_EMAIL이 없으면 쓰지 않는다', () => {
  const env = createGasEnv({ owner: 'owner@example.com', now: '2026-12-20T10:00:00' });
  env.seedFake({ accounts: { TEST_TEACHER_EMAIL: '' } });
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /TEST_TEACHER_EMAIL/);
  assert.strictEqual(env.rows('duty_slots').length, 0);
});
