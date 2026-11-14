/** R19 방학 중식(결정 73) — mealPlanChange_ '중식'·mealCountsOn_ lunch. 가짜 학생만. 2027-07-19(월)~08-20 여름방학. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/rules/MoveRules.gs']);

const V = { id: 'V1', type: '방학', start_date: '2027-07-19', end_date: '2027-08-20' };
const W = { id: 'V2', type: '방학', start_date: '2027-12-27', end_date: '2028-02-10' };
let seq = 0;
const CH = (item, value, effective_date, extra) => Object.assign({ id: 'c' + (++seq), student_id: 'a', item, value, effective_date,
  status: '유효', requested_at: '2027-03-01T09:00:00', created_at: '', source: 'F7' }, extra || {});
const HALL = [CH('학사', '입실', '2027-03-01', { source: '명단업로드' })];
const plan = (changes, to, at, opts) => plain(ctx.mealPlanChange_(changes, 'a', '중식', to, at, Object.assign({ today: at.slice(0, 10), vacation: V }, opts || {})));
const pick = (p) => [p.kind, p.date, p.rule];

test('적용일은 조식과 같은 규칙: 실시 11:30 전 당일·이후 다음 날, 미실시는 미실시 규칙', () => {
  assert.deepStrictEqual(pick(plan(HALL, '실시', '2027-07-21T11:29:59')), ['start', '2027-07-21', 'same_day']);
  assert.deepStrictEqual(pick(plan(HALL, '실시', '2027-07-21T11:30:00')), ['start', '2027-07-22', 'next_day']);
  const on = HALL.concat([CH('중식', '실시', '2027-07-19')]);
  // 미실시는 mealEffectiveDate_('stop')을 그대로 쓴다(수요일 11:30 경계는 결정 71 — meal.test.js). 화·목으로 본다
  assert.deepStrictEqual(pick(plan(on, '미실시', '2027-07-20T15:00:00')), ['stop', '2027-07-26', 'next_monday']);
  assert.deepStrictEqual(pick(plan(on, '미실시', '2027-07-22T09:00:00')), ['stop', '2027-08-02', 'monday_after_next']);
  assert.deepStrictEqual(pick(plan(HALL, '미실시', '2027-07-21T11:30:00')), ['initial', '2027-07-21', 'initial']);   // 먹던 중식이 없으면 바로
});

test('방학 시작 전에 낸 신청은 방학 시작일부터(vacation_start), 고친 날이 시작일 전이면 Error, 끝날 뒤면 경고', () => {
  const p = plan(HALL, '실시', '2027-07-12T09:00:00');
  assert.deepStrictEqual([p.kind, p.date, p.rule, p.autoDate], ['start', '2027-07-19', 'vacation_start', '2027-07-19']);
  assert.deepStrictEqual(pick(plan(HALL, '미실시', '2027-07-12T09:00:00')), ['initial', '2027-07-19', 'vacation_start']);
  assert.throws(() => plan(HALL, '실시', '2027-07-12T09:00:00', { effectiveDate: '2027-07-16' }), /방학 시작일\(2027-07-19\) 이후/);
  assert.strictEqual(plan(HALL, '실시', '2027-07-12T09:00:00', { effectiveDate: '2027-07-20' }).date, '2027-07-20');
  const late = plan(HALL, '실시', '2027-08-20T13:00:00');
  assert.strictEqual(late.date, '2027-08-21');
  assert.ok(late.warnings.some((w) => /방학 끝날\(2027-08-20\) 뒤/.test(w)), late.warnings.join('|'));
  assert.deepStrictEqual(plan(HALL, '실시', '2027-08-20T09:00:00').warnings, []);
});

test('vacation이 없거나 날짜가 아니면 Error(중식은 방학에만) — 조식·석식은 vacation 없이 그대로', () => {
  assert.throws(() => ctx.mealPlanChange_(HALL, 'a', '중식', '실시', '2027-07-21T09:00:00', { today: '2027-07-21' }), /방학 기간/);
  assert.throws(() => plan(HALL, '실시', '2027-07-21T09:00:00', { vacation: { start_date: '2027-07-19', end_date: '' } }), /방학 기간/);
  assert.throws(() => plan(HALL, '실시', '2027-07-21T09:00:00', { vacation: { start_date: '7/19', end_date: '2027-08-20' } }), /방학 기간/);
  assert.strictEqual(ctx.mealPlanChange_(HALL, 'a', '조식', '실시', '2027-07-21T09:00:00', { today: '2027-07-21' }).date, '2027-07-21');
  assert.throws(() => ctx.mealPlanChange_(HALL, 'a', '중식', '학사 석식', '2027-07-21T09:00:00', { today: '2027-07-21', vacation: V }), /중식 값이 아닙니다/);
});

test('지난 방학 중식 행은 보지 않는다: 여름 실시가 남아 있어도 겨울 첫 미실시는 initial, 실시는 start(그대로 이어 보지 않음)', () => {
  const ch = HALL.concat([CH('중식', '실시', '2027-07-19')]);
  const opt = { vacation: W };
  assert.deepStrictEqual(pick(plan(ch, '미실시', '2027-12-29T09:00:00', opt)), ['initial', '2027-12-29', 'initial']);
  const on = plan(ch, '실시', '2027-12-29T09:00:00', opt);
  assert.deepStrictEqual([on.kind, on.from], ['start', '']);
  // 같은 방학 안의 행은 본다
  assert.deepStrictEqual(pick(plan(ch, '미실시', '2027-07-20T09:00:00')), ['stop', '2027-07-26', 'next_monday']);
});

test('퇴실: 퇴실 상태인 날의 실시는 막힘(조식처럼 — 먼저 신청했어도), 퇴실 정리 followUps는 쓰지 않음(조식은 씀)', () => {
  const left = HALL.concat([CH('학사', '퇴실', '2027-07-20', { source: 'F6', requested_at: '2027-07-20T09:00:00' })]);
  const b = plan(left, '실시', '2027-07-21T09:00:00');
  assert.deepStrictEqual([b.kind, b.date], ['none', '']);
  assert.match(b.blocked, /학사 퇴실 상태라 중식 실시/);
  const early = plan(left, '실시', '2027-07-19T09:00:00', { today: '2027-07-21', effectiveDate: '2027-07-20' });   // 퇴실 기록보다 먼저 신청
  assert.ok(early.blocked, '중식은 퇴실일에 끝난다(석식의 결정 35가 아님)');
  const future = HALL.concat([CH('학사', '퇴실', '2027-07-30', { source: 'F6', requested_at: '2027-07-20T09:00:00' })]);
  const p = plan(future, '실시', '2027-07-21T09:00:00');
  assert.deepStrictEqual([p.kind, p.date, p.followUps], ['start', '2027-07-21', []]);
  const bf = plain(ctx.mealPlanChange_(future, 'a', '조식', '실시', '2027-07-21T09:00:00', { today: '2027-07-21' }));
  assert.deepStrictEqual(bf.followUps.map((f) => [f.item, f.value, f.effective_date]), [['조식', '미실시', '2027-07-30']]);
});

test('movePlan_ 학사 퇴실은 중식 행을 쓰지도 취소하지도 않는다(집계가 학사 입실인 날만 센다)', () => {
  const ch = HALL.concat([CH('중식', '실시', '2027-07-19'), CH('중식', '미실시', '2027-08-09', { requested_at: '2027-07-28T09:00:00' })]);
  const p = plain(ctx.movePlan_(ch, 'a', { type: '학사 퇴실', effectiveDate: '2027-08-02', requestedAt: '2027-07-30T09:00:00' }, { today: '2027-07-30' }));
  assert.deepStrictEqual(p.errors, []);
  const ids = new Set(ch.filter((c) => c.item === '중식').map((c) => c.id));
  assert.deepStrictEqual([p.rows.filter((r) => r.item === '중식'), p.toCancel.filter((c) => ids.has(c.id))], [[], []]);
});

/* ───── mealCountsOn_ lunch ───── */
const ST = [{ id: 'a', gender: '여', grade: '2' }, { id: 'b', gender: '남', grade: '1' }];
const EN = [{ term_id: 'V1', student_id: 'a' }, { term_id: 'V1', student_id: 'b' }];
const lunchOn = (changes, ymd, vac) => {
  const r = plain(ctx.mealCountsOn_(ST, EN, changes, 'V1', ymd, '', vac === undefined ? V : vac));
  return [r.groups['전체'].lunch, r.groups['여2'].lunch, r.groups['남1'].lunch];
};

test('집계 lunch: 방학 안·학사 입실·이번 방학 행 값이 실시인 학생만 — 퇴실한 날부터 빠지고 재입실하면 다시 셈', () => {
  const B = (item, value, eff, extra) => Object.assign(CH(item, value, eff, extra), { student_id: 'b' });
  const ch = HALL.concat([CH('중식', '실시', '2027-07-19'), CH('중식', '미실시', '2027-08-09'),
    B('학사', '입실', '2027-03-01'), B('중식', '실시', '2027-07-21'),
    B('학사', '퇴실', '2027-07-30', { source: 'F6' }), B('학사', '입실', '2027-08-04', { source: 'F6' })]);
  assert.deepStrictEqual(lunchOn(ch, '2027-07-19'), [1, 1, 0]);
  assert.deepStrictEqual(lunchOn(ch, '2027-07-21'), [2, 1, 1]);
  assert.deepStrictEqual(lunchOn(ch, '2027-07-30'), [1, 1, 0]);   // b 퇴실일
  assert.deepStrictEqual(lunchOn(ch, '2027-08-04'), [2, 1, 1]);   // b 재입실 → 퇴실 전 값
  assert.deepStrictEqual(lunchOn(ch, '2027-08-09'), [1, 0, 1]);   // a 미실시
  assert.deepStrictEqual(lunchOn(ch, '2027-07-18', V), [0, 0, 0]);   // 방학 전날
  assert.deepStrictEqual(lunchOn(ch, '2027-08-21', V), [0, 0, 0]);   // 방학 다음 날(값은 실시로 남아 있어도)
  assert.deepStrictEqual(lunchOn(ch, '2027-07-21', null), [0, 0, 0]);   // vacation을 주지 않으면(학기) 늘 0
});

test('집계 lunch: 지난 방학의 실시는 다음 방학에 세지 않는다, 방학 시작일 행은 센다', () => {
  const ch = HALL.concat([CH('중식', '실시', '2027-07-19')]);
  assert.deepStrictEqual(lunchOn(ch, '2027-12-28', W), [0, 0, 0]);
  assert.deepStrictEqual(lunchOn(ch.concat([CH('중식', '실시', '2027-12-27')]), '2027-12-28', W), [1, 1, 0]);
  assert.throws(() => ctx.mealCountsOn_(ST, EN, ch, 'V1', '2027-07-21', '', { start_date: '', end_date: '2027-08-20' }), /방학 기간/);
});
