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
  assert.ok(late.warnings.some((w) => /방학이 끝난 8월 20일\(금\) 뒤/.test(w)), late.warnings.join('|'));
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

test('퇴실(결정 79): 퇴실 기록 뒤 신청한 실시는 막힘, 먼저 신청했으면 중단일(미실시 규칙) 전까지는 막지 않음(석식처럼), 퇴실 정리 followUps는 쓰지 않음(조식은 씀)', () => {
  const left = HALL.concat([CH('학사', '퇴실', '2027-07-20', { source: 'F6', requested_at: '2027-07-20T09:00:00' })]);
  const b = plan(left, '실시', '2027-07-21T09:00:00');
  assert.deepStrictEqual([b.kind, b.date], ['none', '']);
  assert.match(b.blocked, /학사 퇴실 상태라 중식 실시/);
  const early = plan(left, '실시', '2027-07-19T09:00:00', { today: '2027-07-21', effectiveDate: '2027-07-20' });   // 퇴실 기록(7/20 화 09:00)보다 먼저 신청
  assert.deepStrictEqual([early.blocked, early.date, early.followUps], ['', '2027-07-20', []], '중단일(7/26) 전이라 막지 않고, 끊는 행도 쓰지 않는다(집계가 정함)');
  assert.ok(plan(left, '실시', '2027-07-19T09:00:00', { today: '2027-07-21', effectiveDate: '2027-07-26' }).blocked, '중단일 이후 적용은 막힘');
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

test('집계 lunch: 방학 안·이번 방학 행 값이 실시·학사 입실이거나 퇴실 뒤 중단일 전(결정 79) — 재입실하면 다시 셈', () => {
  const B = (item, value, eff, extra) => Object.assign(CH(item, value, eff, extra), { student_id: 'b' });
  // b: 7/27(화) 09:00에 7/30 퇴실 기록 → 미실시 규칙 중단일 8/2(월). 8/6 재입실
  const ch = HALL.concat([CH('중식', '실시', '2027-07-19'), CH('중식', '미실시', '2027-08-09'),
    B('학사', '입실', '2027-03-01'), B('중식', '실시', '2027-07-21'),
    B('학사', '퇴실', '2027-07-30', { source: 'F6', requested_at: '2027-07-27T09:00:00' }), B('학사', '입실', '2027-08-06', { source: 'F6', requested_at: '2027-08-05T09:00:00' })]);
  assert.deepStrictEqual(lunchOn(ch, '2027-07-19'), [1, 1, 0]);
  assert.deepStrictEqual(lunchOn(ch, '2027-07-21'), [2, 1, 1]);
  assert.deepStrictEqual(lunchOn(ch, '2027-07-30'), [2, 1, 1]);   // b 퇴실일 — 중단일 전이라 센다
  assert.deepStrictEqual(lunchOn(ch, '2027-08-01'), [2, 1, 1]);
  assert.deepStrictEqual(lunchOn(ch, '2027-08-02'), [1, 1, 0]);   // 중단일부터 빠짐
  assert.deepStrictEqual(lunchOn(ch, '2027-08-06'), [2, 1, 1]);   // b 재입실 → 퇴실 전 값
  // 수요일 오후에 기록한 퇴실은 다다음 주 월요일까지, 신청 일시가 틀리면 퇴실일에 끝남
  const late = ch.map((c) => c.student_id === 'b' && c.value === '퇴실' ? Object.assign({}, c, { requested_at: '2027-07-28T13:00:00' }) : c);
  assert.deepStrictEqual(lunchOn(late, '2027-08-05'), [2, 1, 1]);
  const bad = ch.map((c) => c.student_id === 'b' && c.value === '퇴실' ? Object.assign({}, c, { requested_at: '' }) : c);
  assert.deepStrictEqual(lunchOn(bad, '2027-07-30'), [1, 1, 0]);
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

/* ───── 결정 79 후속: lunchOn_ — 학생 상태 표시와 식수 집계가 같은 판정 ───── */

test('lunchOn_: 퇴실 전 실시, 퇴실 뒤 중단일 전날까지 실시·중단일부터 미실시, 재입실 뒤 다시 실시, 방학 밖·학기 기간은 ""', () => {
  const B = (item, value, eff, extra) => Object.assign(CH(item, value, eff, extra), { student_id: 'b' });
  const ch = [B('학사', '입실', '2027-03-01'), B('중식', '실시', '2027-07-21'),
    B('학사', '퇴실', '2027-07-30', { source: 'F6', requested_at: '2027-07-27T09:00:00' }), B('학사', '입실', '2027-08-06', { source: 'F6', requested_at: '2027-08-05T09:00:00' })];
  const on = (d, o) => ctx.lunchOn_(ch, 'b', d, o === undefined ? { vacation: V } : o);
  assert.deepStrictEqual(['2027-07-20', '2027-07-21', '2027-07-29', '2027-07-30', '2027-08-01', '2027-08-02', '2027-08-05', '2027-08-06'].map((d) => on(d)),
    ['', '실시', '실시', '실시', '실시', '미실시', '미실시', '실시']);
  assert.strictEqual(ctx.statusOn_(ch, 'b', '중식', '2027-08-02'), '실시', 'statusOn_은 퇴실 뒤에도 실시(그래서 lunchOn_을 쓴다)');
  assert.strictEqual(on('2027-07-21', {}), '', 'vacation 없음');
  assert.strictEqual(on('2027-07-21', { vacation: Object.assign({}, V, { type: '학기' }) }), '', '학기 기간');
  assert.strictEqual(on('2027-08-21'), '', '방학 끝난 뒤');
  assert.strictEqual(ctx.lunchOn_(ch.concat([B('중식', '미실시', '2027-07-26')]), 'b', '2027-07-27', { vacation: V }), '미실시');
  assert.strictEqual(ctx.lunchOn_([B('중식', '실시', '2027-07-21')], 'b', '2027-07-22', { vacation: V }), '미실시', '학사 기록이 없으면 미실시');
  // 마감 시각 설정을 따른다: 수요일 12:00 기록 → 기본(11:30)이면 다다음 주, 마감 12:30이면 다음 주 월요일
  const wed = ch.map((c) => c.value === '퇴실' ? Object.assign({}, c, { requested_at: '2027-07-28T12:00:00' }) : c);
  assert.deepStrictEqual([ctx.lunchOn_(wed, 'b', '2027-08-02', { vacation: V }), ctx.lunchOn_(wed, 'b', '2027-08-02', { vacation: V, cutoff: '12:30' })], ['실시', '미실시']);
});

test('lunchOn_ = 식수 집계 lunch: 날마다(7/17~8/22) 두 학생의 값이 집계와 같다(cutoff 포함)', () => {
  const B = (item, value, eff, extra) => Object.assign(CH(item, value, eff, extra), { student_id: 'b' });
  const ch = HALL.concat([CH('중식', '실시', '2027-07-19'), CH('중식', '미실시', '2027-08-09'),
    B('학사', '입실', '2027-03-01'), B('중식', '실시', '2027-07-21'),
    B('학사', '퇴실', '2027-07-30', { source: 'F6', requested_at: '2027-07-28T12:00:00' }), B('학사', '입실', '2027-08-16', { source: 'F6', requested_at: '2027-08-15T09:00:00' })]);
  for (const cutoff of [undefined, '12:30']) {
    for (let d = new Date('2027-07-17T00:00:00Z'); d <= new Date('2027-08-22T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      const ymd = d.toISOString().slice(0, 10);
      const g = plain(ctx.mealCountsOn_(ST, EN, ch, 'V1', ymd, '', V, { cutoff })).groups;
      assert.deepStrictEqual([g['여2'].lunch, g['남1'].lunch], ['a', 'b'].map((s) => +(ctx.lunchOn_(ch, s, ymd, { vacation: V, cutoff }) === '실시')), ymd + ' ' + cutoff);
    }
  }
});
