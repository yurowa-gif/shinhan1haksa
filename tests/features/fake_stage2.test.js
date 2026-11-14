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

/* ---------- T1b: 2027-03 생활 기록 ---------- */
const RULES = plain(ctx.DEFAULT_VIOLATION_RULES).map((r, i) => ({ id: 'rule-' + (i + 1), name: r[0], status: '' }));
const life = plain(ctx.buildFakeStage2Life_(fake, RULES));
const stage1 = plain(ctx.buildFakeStage1_(fake));

test('생활 기록 학생은 1단계가 쓰는 학생(특이사항·고정 일정·퇴실·중도 입실)과 겹치지 않는다', () => {
  const used = new Set([].concat(stage1.exceptions.map((e) => e.student_id), stage1.fixedSchedules.map((f) => f.student_id),
    [stage1.leaverId, stage1.lateEntrantId]));
  const mine = [life.out2Id, life.out1Id, life.pendingId, life.undoId, life.reentryId].concat(life.noDocIds);
  assert.strictEqual(new Set(mine).size, 7);
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
  const term2 = plain(fake.terms)[1].id;
  assert.ok(plain(fake.enrollments).some((e) => e.term_id === term2 && e.student_id === life.noDocIds[1] && e.teacher_email === TESTER),
    '서류 미제출 1건은 시험 학사 교사 담당 학생(홈 카드 확인용)');
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

test('F7 대기 행 1건: 수요일 오후 미실시 신청 → 다다음 주 월요일(3/22), 그 전까지는 학사 석식', () => {
  const p = life.statusChanges.filter((r) => r.doc_submitted !== 'FALSE' && r.source === 'F7' && r.student_id === life.pendingId);
  assert.strictEqual(p.length, 1);
  assert.deepStrictEqual([p[0].student_id, p[0].item, p[0].value, p[0].requested_at, p[0].effective_date, p[0].doc_submitted, p[0].source],
    [life.pendingId, '석식', '미실시', '2027-03-10T13:00:00', '2027-03-22', 'TRUE', 'F7']);
  const all = stage1.statusChanges.concat(life.statusChanges);
  assert.strictEqual(ctx.statusOn_(all, life.pendingId, '석식', '2027-03-21'), '학사 석식');
  assert.strictEqual(ctx.statusOn_(all, life.pendingId, '석식', '2027-03-22'), '미실시');
});

test('재입실 1명: 3/5 학사 퇴실(석식 3/15 중단, 결정 35) → 3/19 학사 입실, 급식은 퇴실 전 값으로 다시(movePlan_ 결과 그대로)', () => {
  const rows = life.statusChanges.filter((r) => r.student_id === life.reentryId);
  const heads = rows.filter((r) => r.linked_change_id === '');
  assert.deepStrictEqual(heads.map((r) => [r.item, r.value, r.effective_date, r.source, r.doc_submitted, r.status]),
    [['학사', '퇴실', '2027-03-05', 'F6', 'TRUE', '유효'], ['학사', '입실', '2027-03-19', 'F6', 'TRUE', '유효']]);
  assert.ok(rows.filter((r) => r.linked_change_id).every((r) => heads.some((h) => h.id === r.linked_change_id) && r.doc_submitted === ''));
  const all = stage1.statusChanges.concat(life.statusChanges);
  const on = (item, ymd) => ctx.statusOn_(all, life.reentryId, item, ymd);
  assert.deepStrictEqual(['2027-03-04', '2027-03-05', '2027-03-18', '2027-03-19'].map((d) => on('학사', d)), ['입실', '퇴실', '퇴실', '입실']);
  assert.deepStrictEqual(['2027-03-14', '2027-03-15', '2027-03-19'].map((d) => on('석식', d)), ['학사 석식', '미실시', '학사 석식']);
});

test('퇴실 취소 1명: 3/16 학사 퇴실을 3/13에 취소 — 대표 행은 사람 사유, 연결 행은 [자동] <대표 id>, 상태는 그대로 입실(moveUndoPlan_ 결과)', () => {
  const rows = life.statusChanges.filter((r) => r.student_id === life.undoId);
  const head = rows.find((r) => r.id === life.undoHeadId);
  assert.deepStrictEqual([head.item, head.value, head.effective_date, head.status], ['학사', '퇴실', '2027-03-16', '취소']);
  assert.ok(head.cancel_reason.length >= 2 && !head.cancel_reason.startsWith('[자동]'), '사람이 적은 사유');
  const linked = rows.filter((r) => r.linked_change_id === head.id);
  assert.ok(linked.length >= 1 && linked.every((r) => r.status === '취소' && r.cancel_reason.startsWith('[자동] ' + head.id + ' ')));
  assert.ok(rows.every((r) => r.status === '취소'), '그 학생의 시드 행은 모두 취소');
  const all = stage1.statusChanges.concat(life.statusChanges);
  assert.strictEqual(ctx.statusOn_(all, life.undoId, '학사', '2027-03-16'), '입실');
  assert.strictEqual(ctx.statusOn_(all, life.undoId, '석식', '2027-03-29'), '학사 석식');
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
  const vtab = ctx.termSheetName_('violations', life.term.id);
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()),
    '가짜 2단계 데이터: duty_slots +62, day_schedules +1, ' + vtab + ' +3, status_changes +9');
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()),
    '가짜 2단계 데이터: duty_slots +0, day_schedules +0, ' + vtab + ' +0, status_changes +0');
  const vs = env.rows(vtab);
  const ruleIds = env.rows('violation_rules').map((r) => r.id);
  assert.ok(vs.length === 3 && vs.every((v) => ruleIds.includes(v.rule_id)), 'rule_id는 setup이 만든 항목');
  assert.strictEqual(env.as(T1, (c) => c.outLevel_(c.readAll_(vtab), life.out2Id, life.term.id).label), '퇴실 대상');
  assert.deepStrictEqual(counts(env), [62, before + 1]);
  const rec = env.as(T2, (c) => plain(c.dutyRecord_(c.readAll_('duty_slots'), '2027-01')));
  const pure = plain(ctx.dutyRecord_(d.dutySlots, '2027-01'));
  assert.deepStrictEqual(rec.teachers, pure.teachers);
  assert.deepStrictEqual(rec.swaps, pure.swaps);
  assert.deepStrictEqual(rec.standby, pure.standby);
});

test('seedFakeStage2 뒤 출석부(체크리스트 D12·D13): 재입실 학생은 3/12 공석·3/19 다시, 퇴실 취소 학생은 3/16에도 그대로', () => {
  const env = seededEnv({}, { stage1: true });
  env.asOwner((c) => c.seedFakeStage2());
  const name = (id) => env.rows('students').find((s) => s.id === id).name;
  const has = (date, id) => JSON.stringify(plain(env.call('owner@example.com', 'getAttendanceSheet', date))).includes(name(id));
  assert.deepStrictEqual([has('2027-03-04', life.reentryId), has('2027-03-12', life.reentryId), has('2027-03-19', life.reentryId)], [true, false, true]);
  assert.strictEqual(has('2027-03-16', life.undoId), true);
});

test('seedFakeStage2: 1단계 가짜 데이터가 없으면 근무표만 쓰고 생활 기록은 건너뛴다(나중에 1단계 뒤 다시 실행하면 채움)', () => {
  const env = seededEnv();
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()),
    '가짜 2단계 데이터: duty_slots +62, day_schedules +1, 생활 기록 건너뜀(seedFakeStage1을 먼저 실행하면 함께 씁니다)');
  assert.strictEqual(env.rows('status_changes').length, 0);
  env.asOwner((c) => c.seedFakeStage1());
  const vtab = ctx.termSheetName_('violations', life.term.id);
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage2()),
    '가짜 2단계 데이터: duty_slots +0, day_schedules +0, ' + vtab + ' +3, status_changes +9');
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

test('seedFakeStage2: env.seedFake()처럼 "가짜 데이터(등록 없음)" 학생이 섞이면 거부(가짜 판정은 정확히 일치)', () => {
  const env = createGasEnv({ owner: 'owner@example.com', now: '2026-12-20T10:00:00' });
  env.seedFake({ stage1: true });
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /가짜 학생/);
  assert.deepStrictEqual(counts(env), [0, 2], '1단계 일정 2행만, 2단계는 0행');
  assert.strictEqual(ctx.fake1DbIsAllFake_([{ memo: '가짜 데이터' }, { memo: '가짜 데이터(등록 없음)' }]), false);
  assert.strictEqual(ctx.fake1DbIsAllFake_([{ memo: '가짜 데이터' }]), true);
});

test('seedFakeStage2: 시험 교사 비활성·담당자 역할 없음·가짜 기간 없음이면 쓰지 않는다', () => {
  const userId = (env, email) => env.rows('users').find((u) => u.email === email).id;
  const a = seededEnv({}, { stage1: true });
  a.asOwner((c) => c.updateRecord_('users', userId(a, TESTER), { active: 'FALSE' }, a.owner));
  assert.match(a.errorOf(a.owner, (c) => c.seedFakeStage2()).message, /학사 교사로 없습니다/);
  const b = seededEnv({}, { stage1: true });
  b.asOwner((c) => c.updateRecord_('users', userId(b, T2), { roles: 'hall_teacher' }, b.owner));
  assert.match(b.errorOf(b.owner, (c) => c.seedFakeStage2()).message, /근무표 담당자/);
  const e = seededEnv({}, { stage1: true });
  e.asOwner((c) => c.getSheet_('db', 'terms').getRange(3, 1).setValue('zzzzzzzz-0000-4000-8000-000000000000'));   // 둘째 가짜 기간 id를 바꿈
  assert.match(e.errorOf(e.owner, (c) => c.seedFakeStage2()).message, /가짜 운영 기간/);
  for (const env of [a, b, e]) assert.deepStrictEqual(counts(env).slice(0, 1), [0]);
});

test('seedFakeStage2: TEST_TEACHER_EMAIL이 없거나 users에 학사 교사로 없으면 쓰지 않는다', () => {
  const env = seededEnv();
  delete env.scriptProps.TEST_TEACHER_EMAIL;
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /TEST_TEACHER_EMAIL/);
  env.scriptProps.TEST_TEACHER_EMAIL = 'late.teacher@example.com';   // 시드 뒤에 속성만 넣은 경우
  assert.match(env.errorOf(env.owner, (c) => c.seedFakeStage2()).message, /addUser/);
  assert.deepStrictEqual(counts(env), [0, 0]);
});
