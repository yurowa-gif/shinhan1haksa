/** R6 MealRules — 급식 적용일. plan 2절 R6 표, 11:29:59/11:30:00 경계, 연말·윤년. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/rules/MoveRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}
const eff = (kind, at, opts) => plain(ctx.mealEffectiveDate_(kind, at, opts || {}));

// plan 2절 R6 시험 표(2027-03-01은 월요일) — 시각은 아무 때나(미실시는 시각과 무관)
table('미실시: 월·화 신청 → 다음 주 월요일, 수~일 → 다다음 주 월요일(요일 7개 + 연말)', [
  ['2027-03-01T09:00:00', '2027-03-08', 'next_monday'],       // 월
  ['2027-03-02T23:59:59', '2027-03-08', 'next_monday'],       // 화
  ['2027-03-03T00:00:00', '2027-03-15', 'monday_after_next'], // 수
  ['2027-03-04T11:29:59', '2027-03-15', 'monday_after_next'], // 목
  ['2027-03-05T11:30:00', '2027-03-15', 'monday_after_next'], // 금
  ['2027-03-06T15:00:00', '2027-03-15', 'monday_after_next'], // 토
  ['2027-03-07T21:00:00', '2027-03-15', 'monday_after_next'], // 일(월~일 주의 마지막 날)
  ['2026-12-30T10:00:00', '2027-01-11', 'monday_after_next'], // 수, 연말을 넘김
  ['2026-12-29T10:00:00', '2027-01-04', 'next_monday'],       // 화, 연말을 넘김
  ['2027-01-03T10:00:00', '2027-01-11', 'monday_after_next'], // 일 → 그 주 월요일(2026-12-28) + 14
  ['2028-02-21T10:00:00', '2028-02-28', 'next_monday'],       // 윤년 2월
  ['2028-02-23T10:00:00', '2028-03-06', 'monday_after_next'], // 2월 29일을 넘김
  ['2028-02-29T10:00:00', '2028-03-06', 'next_monday']        // 윤일(화)
], ([at, date, rule]) => assert.deepStrictEqual(eff('stop', at), { date, rule }));

table('실시·일반 석식으로 변경: 11:30 전 당일, 11:30:00부터 다음 날(결정 23 ④)', [
  ['start', '2027-03-03T00:00:00', '2027-03-03', 'same_day'],
  ['start', '2027-03-03T11:29:00', '2027-03-03', 'same_day'],
  ['start', '2027-03-03T11:29:59', '2027-03-03', 'same_day'],
  ['start', '2027-03-03T11:30:00', '2027-03-04', 'next_day'],
  ['start', '2027-03-03T11:30:01', '2027-03-04', 'next_day'],
  ['start', '2027-03-03T11:30', '2027-03-04', 'next_day'],
  ['start', '2027-03-03 11:29:59', '2027-03-03', 'same_day'],
  ['start', '2027-03-03T23:59:59', '2027-03-04', 'next_day'],
  ['to_general', '2027-03-03T11:29:59', '2027-03-03', 'same_day'],
  ['to_general', '2027-03-03T11:30:00', '2027-03-04', 'next_day'],
  ['start', '2026-12-31T11:29:59', '2026-12-31', 'same_day'],
  ['start', '2026-12-31T11:30:00', '2027-01-01', 'next_day'],   // 연말 → 다음 해 1월 1일
  ['start', '2028-02-28T12:00:00', '2028-02-29', 'next_day'],   // 윤일
  ['start', '2027-02-28T12:00:00', '2027-03-01', 'next_day'],   // 평년 2월 말
  ['to_general', '2027-03-06T13:00:00', '2027-03-07', 'next_day'] // 토요일 신청도 같은 규칙
], ([kind, at, date, rule]) => assert.deepStrictEqual(eff(kind, at), { date, rule }));

test('마감 시각 설정을 바꿀 수 있다(meal.morning_cutoff), 잘못된 마감은 Error', () => {
  assert.deepStrictEqual(eff('start', '2027-03-03T11:45:00', { cutoff: '12:00' }), { date: '2027-03-03', rule: 'same_day' });
  assert.deepStrictEqual(eff('start', '2027-03-03T12:00:00', { cutoff: '12:00' }), { date: '2027-03-04', rule: 'next_day' });
  assert.deepStrictEqual(eff('start', '2027-03-03T11:29:59', { cutoff: '' }), { date: '2027-03-03', rule: 'same_day' });
  for (const bad of ['11시', '24:00', '11:60', 1130, '11:30:15']) assert.throws(() => eff('start', '2027-03-03T10:00:00', { cutoff: bad }), String(bad));
  // 설정을 손으로 고친 흔한 표기도 읽는다
  assert.deepStrictEqual(eff('start', '2027-03-03T09:29:59', { cutoff: '9:30' }), { date: '2027-03-03', rule: 'same_day' });
  assert.deepStrictEqual(eff('start', '2027-03-03T09:30:00', { cutoff: '9:30' }), { date: '2027-03-04', rule: 'next_day' });
  assert.deepStrictEqual(eff('start', '2027-03-03T11:30:00', { cutoff: '11:30:00' }), { date: '2027-03-04', rule: 'next_day' });
});

test('기숙사 입실과 함께 조식 실시 = 입실일, 학사 퇴실로 조식 중단 = 퇴실일 즉시(신청 시각과 무관)', () => {
  assert.deepStrictEqual(eff('with_dorm_entry', '2027-03-03T15:00:00', { entryDate: '2027-03-08' }), { date: '2027-03-08', rule: 'entry_date' });
  assert.deepStrictEqual(eff('with_dorm_entry', '', { entryDate: '2027-03-02' }), { date: '2027-03-02', rule: 'entry_date' });
  assert.deepStrictEqual(eff('on_leave', '2027-03-03T15:00:00', { leaveDate: '2027-03-03' }), { date: '2027-03-03', rule: 'leave_date' });
  assert.deepStrictEqual(eff('on_leave', null, { leaveDate: '2028-02-29' }), { date: '2028-02-29', rule: 'leave_date' });
  assert.throws(() => eff('with_dorm_entry', '2027-03-03T15:00:00', {}));
  assert.throws(() => eff('on_leave', '2027-03-03T15:00:00', { leaveDate: '2027-02-30' }));
});

table('잘못된 kind·신청 일시는 Error', [
  ['start', '2027-03-03'], ['start', '2027-02-29T10:00:00'], ['stop', '2027-03-03T11:30:00Z'], ['start', ''],
  ['stop', null], ['미실시', '2027-03-03T10:00:00'], ['', '2027-03-03T10:00:00']
], ([kind, at]) => assert.throws(() => eff(kind, at)));

table('mealChangeKind_: 상태 변화 → 변경 종류(none·initial 구분)', [
  ['조식', '미실시', '실시', 'start'], ['조식', '', '실시', 'start'], ['조식', '실시', '미실시', 'stop'],
  ['조식', '실시', '실시', 'none'], ['조식', '', '미실시', 'initial'],    // 기록 없음 → 미실시: 그만둘 급식이 없음
  ['석식', '', '미실시', 'initial'], ['석식', '', '학사 석식', 'start'], ['석식', '', '일반 석식', 'to_general'],
  ['석식', '학사 석식', '일반 석식', 'to_general'],   // 결정 1
  ['석식', '일반 석식', '학사 석식', 'start'],
  ['석식', '미실시', '학사 석식', 'start'],
  ['석식', '미실시', '일반 석식', 'to_general'],
  ['석식', '일반 석식', '미실시', 'stop'],             // 결정 23 ⑤
  ['석식', '학사 석식', '미실시', 'stop'],
  ['석식', '학사 석식', '학사 석식', 'none'],
  ['석식', ' 일반 석식 ', '일반 석식', 'none'],
  ['석식', '미실시', '미실시', 'none']
], ([item, from, to, want]) => assert.strictEqual(ctx.mealChangeKind_(item, from, to), want));

test("kind 'initial'은 신청일(시각 무관), 'none'은 Error(저장할 변경이 없음)", () => {
  assert.deepStrictEqual(eff('initial', '2027-03-03T15:00:00'), { date: '2027-03-03', rule: 'initial' });
  assert.deepStrictEqual(eff('initial', '2027-03-03T11:30:00'), { date: '2027-03-03', rule: 'initial' });
  assert.throws(() => eff('none', '2027-03-03T10:00:00'));
});

/* ───── 대기 중인(미래 적용일) 행 ───── */
let cseq = 0;
const CH = (item, value, effective_date, extra) => Object.assign({ id: 'c' + (++cseq), student_id: 's1', item, value, effective_date,
  status: '유효', requested_at: '', created_at: '' }, extra || {});

const plan = (rows, item, to, at, opts) => plain(ctx.mealPlanChange_(rows, 's1', item, to, at, opts || {}));

test('mealPendingToCancel_: 새 F7 행보다 늦게 적용되고 신청 일시가 이른 F7 대기 행만(적용일 순)', () => {
  const rows = [CH('석식', '학사 석식', '2027-03-02'), CH('석식', '미실시', '2027-03-15', { requested_at: '2027-03-03T10:00:00' }),
    CH('석식', '일반 석식', '2027-03-22', { requested_at: '2027-03-03T11:00:00' }), CH('석식', '학사 석식', '2027-03-29', { status: '취소' }),
    CH('조식', '미실시', '2027-03-15'), CH('석식', '미실시', '2027-03-16', { student_id: 's2' }), CH('석식', '미실시', '2027-03-04'),
    CH('석식', '미실시', '2027-3-20'), CH('석식', '미실시', '2027-03-25', { source: 'F6' })];
  const ids = (e, o) => plain(ctx.mealPendingToCancel_(rows, 's1', '석식', e, o)).map((r) => [r.effective_date, r.value]);
  assert.deepStrictEqual(ids('2027-03-04', { requestedAt: '2027-03-04T10:00:00' }), [['2027-03-15', '미실시'], ['2027-03-22', '일반 석식']]);
  // 늦게 입력된 이전 신청서(신청 일시가 더 이름)는 이미 있는 더 새 신청을 취소하지 않는다
  assert.deepStrictEqual(ids('2027-03-04', { requestedAt: '2027-03-03T10:30:00' }), [['2027-03-15', '미실시']]);
  // 이미 적용된 행이어도(늦은 입력) 신청 일시가 이르고 적용일이 늦으면 취소한다(오늘과 상관없음)
  assert.deepStrictEqual(ids('2027-03-04', { requestedAt: '2027-03-04T10:00:00', today: '2027-03-30' }), [['2027-03-15', '미실시'], ['2027-03-22', '일반 석식']]);
  // 같은 값의 행은 덮을 필요가 없어 취소하지 않는다
  assert.deepStrictEqual(ids('2027-03-04', { requestedAt: '2027-03-04T10:00:00', newValue: '미실시' }), [['2027-03-22', '일반 석식']]);
  assert.deepStrictEqual(ids('2027-03-22'), []);
  assert.throws(() => ctx.mealPendingToCancel_(rows, 's1', '석식', '2027-02-30'));
});

test('mealPendingToCancel_: source F6 행(퇴실 조식 중단 등)은 취소하지 않고, F6 새 행은 퇴실일 이후 F7 행을 신청 일시와 상관없이 취소', () => {
  const rows = [CH('조식', '실시', '2027-03-02'), CH('조식', '미실시', '2027-03-15', { source: 'F6', requested_at: '2027-03-03T09:00:00' }),
    CH('조식', '실시', '2027-03-15', { source: 'F7', requested_at: '2027-03-10T09:00:00' }), CH('조식', '실시', '2027-03-22', { source: 'F7', requested_at: '2027-03-10T09:00:00' })];
  assert.deepStrictEqual(plain(ctx.mealPendingToCancel_(rows, 's1', '조식', '2027-03-05', { source: 'F7', requestedAt: '2027-03-11T09:00:00' })).map((r) => r.effective_date),
    ['2027-03-15', '2027-03-22']);     // F6 행(03-15 미실시)은 빠짐
  assert.deepStrictEqual(plain(ctx.mealPendingToCancel_(rows, 's1', '조식', '2027-03-15', { source: 'F6', requestedAt: '2027-03-03T09:00:00' })).map((r) => r.effective_date),
    ['2027-03-15', '2027-03-22']);     // 퇴실일 당일 F7 '실시'도
});

test('mealPlanChange_: 후보 적용일의 실제 값과 비교 — 미래에 같은 값의 대기 행이 있어도 더 이른 변경을 버리지 않는다', () => {
  // 3/1 퇴실(3/26) 미리 입력 → F6 조식 미실시 3/26. 3/2(화) 조식 미실시 신청 → 다음 주 월요일 3/8부터
  const rows = [CH('학사', '입실', '2027-03-02'), CH('조식', '실시', '2027-03-02'),
    CH('학사', '퇴실', '2027-03-26', { source: 'F6' }), CH('조식', '미실시', '2027-03-26', { source: 'F6', requested_at: '2027-03-01T09:00:00' })];
  const r = plan(rows, '조식', '미실시', '2027-03-02T10:00:00', { today: '2027-03-02' });
  assert.deepStrictEqual([r.kind, r.date, r.rule, r.from, r.blocked, r.toCancel], ['stop', '2027-03-08', 'next_monday', '실시', '', []]);
  // 이미 그날 값과 같으면 none
  const n = plan(rows, '조식', '실시', '2027-03-02T10:00:00', { today: '2027-03-02' });
  assert.deepStrictEqual([n.kind, n.date], ['none', '2027-03-02']);   // none이어도 신청 행은 쓴다(상태는 그대로)
});

test('mealPlanChange_: 학사 퇴실 적용일 이후에는 조식 실시·학사 석식을 새로 켜지 못한다(일반 석식은 된다)', () => {
  const rows = [CH('학사', '입실', '2027-03-02'), CH('조식', '미실시', '2027-03-02'), CH('석식', '미실시', '2027-03-02'),
    CH('학사', '퇴실', '2027-03-15', { source: 'F6' })];
  const t = { today: '2027-03-16' };
  assert.ok(plan(rows, '조식', '실시', '2027-03-16T10:00:00', t).blocked);
  assert.ok(plan(rows, '석식', '학사 석식', '2027-03-15T09:00:00', t).blocked);
  assert.strictEqual(plan(rows, '조식', '실시', '2027-03-05T10:00:00', t).blocked, '');      // 퇴실 전 날짜는 된다
  assert.strictEqual(plan(rows, '석식', '일반 석식', '2027-03-16T10:00:00', t).blocked, '');
});

test('흐름: 퇴실(3/15) 미리 입력 → 3/5 조식 실시 신청 — F6 중단 행은 남아 퇴실 뒤에는 미실시', () => {
  let rows = [CH('학사', '입실', '2027-03-02'), CH('조식', '미실시', '2027-03-02'),
    CH('학사', '퇴실', '2027-03-15', { source: 'F6' }), CH('조식', '미실시', '2027-03-15', { source: 'F6', requested_at: '2027-03-03T09:00:00' })];
  const r = plan(rows, '조식', '실시', '2027-03-05T10:00:00', { today: '2027-03-05' });
  assert.deepStrictEqual([r.kind, r.date, r.toCancel], ['start', '2027-03-05', []]);
  rows = rows.concat([CH('조식', '실시', r.date, { source: 'F7', requested_at: '2027-03-05T10:00:00' })]);
  assert.strictEqual(ctx.statusOn_(rows, 's1', '조식', '2027-03-10'), '실시');
  assert.strictEqual(ctx.statusOn_(rows, 's1', '조식', '2027-03-16'), '미실시');
});

test('흐름: 수요일 미실시 신청(다다음 주 월요일 대기) 뒤 목요일에 학사 석식으로 되돌리면 대기 행을 취소해 되돌리기가 이긴다', () => {
  let rows = [CH('석식', '학사 석식', '2027-03-02')];
  const r1 = plan(rows, '석식', '미실시', '2027-03-03T10:00:00', { today: '2027-03-03' });
  assert.deepStrictEqual([r1.kind, r1.date], ['stop', '2027-03-15']);
  rows = rows.concat([CH('석식', '미실시', r1.date, { source: 'F7', requested_at: '2027-03-03T10:00:00' })]);
  // 목요일: 그날(3/4) 실제 값은 아직 '학사 석식'이라 'none' — 되돌리기는 대기 행 취소로 한다
  const r2 = plan(rows, '석식', '학사 석식', '2027-03-04T10:00:00', { today: '2027-03-04' });
  assert.strictEqual(r2.kind, 'none');
  // 화면은 none이어도 그보다 늦은 반대 대기 행을 보여 주고 취소할 수 있다: 적용일 3/4 기준 대기 행
  const pend = plain(ctx.mealPendingToCancel_(rows, 's1', '석식', '2027-03-04', { requestedAt: '2027-03-04T10:00:00', today: '2027-03-04' }));
  assert.deepStrictEqual(pend.map((x) => [x.effective_date, x.value]), [['2027-03-15', '미실시']]);
  rows = rows.map((x) => pend.some((p) => p.id === x.id) ? Object.assign({}, x, { status: '취소' }) : x);
  for (const d of ['2027-03-04', '2027-03-15', '2027-04-01']) assert.strictEqual(ctx.statusOn_(rows, 's1', '석식', d), '학사 석식', d);
});

test('mealPlanChange_: 같은 날 대기 실시를 미실시로 되돌리면 대기 행은 자동 취소하지 않고 경고(가정)', () => {
  const rows = [CH('조식', '미실시', '2027-03-02'), CH('조식', '실시', '2027-03-04', { source: 'F7', requested_at: '2027-03-03T10:00:00' })];
  const r = plan(rows, '조식', '미실시', '2027-03-03T15:00:00', { today: '2027-03-03' });
  assert.deepStrictEqual([r.kind, r.date, r.toCancel], ['stop', '2027-03-15', []]);
  assert.strictEqual(r.warnings.length, 1);
});

test('흐름: 처음 미실시를 고르는 학생(기록 없음)은 신청일에 바로 기록(initial)', () => {
  const r = plan([], '조식', '미실시', '2027-03-03T15:00:00', { today: '2027-03-03' });
  assert.deepStrictEqual([r.kind, r.date, r.rule], ['initial', '2027-03-03', 'initial']);
  // 기록은 없지만 3/8부터 시작할 대기 '실시'가 있으면: 미실시 적용일(3/15)에는 '실시'라 stop + 대기 행 경고(가정과 같음)
  const rows = [CH('조식', '실시', '2027-03-08', { source: 'F7', requested_at: '2027-03-02T10:00:00' })];
  const r2 = plan(rows, '조식', '미실시', '2027-03-03T15:00:00', { today: '2027-03-03' });
  assert.deepStrictEqual([r2.kind, r2.date, r2.toCancel, r2.warnings.length], ['stop', '2027-03-15', [], 1]);
});

test('학사 퇴실과 함께 만드는 석식 변경: 퇴실일보다 이르지 않게(가정), 늦은 것은 그대로(결정 35)', () => {
  // 3월 3일(수)에 3월 15일 퇴실을 미리 입력
  assert.deepStrictEqual(eff('to_general', '2027-03-03T10:00:00', { leaveDate: '2027-03-15' }), { date: '2027-03-15', rule: 'leave_date' });
  assert.deepStrictEqual(eff('stop', '2027-03-01T10:00:00', { leaveDate: '2027-03-15' }), { date: '2027-03-15', rule: 'leave_date' });
  // 퇴실일이 계산값보다 이르면 계산값(미실시 규칙) 그대로 — 결정 35: 조식만 퇴실일에 끝나고 학사 석식은 미실시 규칙대로
  assert.deepStrictEqual(eff('stop', '2027-03-03T10:00:00', { leaveDate: '2027-03-05' }), { date: '2027-03-15', rule: 'monday_after_next' });
  assert.deepStrictEqual(eff('to_general', '2027-03-03T13:00:00', { leaveDate: '2027-03-03' }), { date: '2027-03-04', rule: 'next_day' });
  assert.throws(() => eff('stop', '2027-03-03T10:00:00', { leaveDate: '2027-02-30' }));
});

test('흐름: 학사 퇴실(2027-03-03 수 15:00) — 조식은 퇴실일 즉시, 석식 "일반으로"는 다음 날, "중단"은 다다음 주 월요일', () => {
  const at = '2027-03-03T15:00:00';
  assert.strictEqual(eff('on_leave', at, { leaveDate: '2027-03-03' }).date, '2027-03-03');
  assert.strictEqual(eff(ctx.mealChangeKind_('석식', '학사 석식', '일반 석식'), at).date, '2027-03-04');
  assert.strictEqual(eff(ctx.mealChangeKind_('석식', '학사 석식', '미실시'), at).date, '2027-03-15');
});

/* ───── 총괄 3차 검토 ───── */

test('none이어도 toCancel: 미실시 대기 중에 다시 학사 석식 → 대기 행을 계획이 직접 취소 대상으로 준다', () => {
  const rows = [CH('석식', '학사 석식', '2027-03-02'), CH('석식', '미실시', '2027-03-15', { source: 'F7', requested_at: '2027-03-03T10:00:00' })];
  const r = plan(rows, '석식', '학사 석식', '2027-03-04T10:00:00', { today: '2027-03-04' });
  assert.deepStrictEqual([r.kind, r.toCancel.map((x) => x.effective_date)], ['none', ['2027-03-15']]);
});

test('늦게 입력한 이전 신청서는 더 새 신청이 먼저 적용되면 superseded(쓰지 않음)', () => {
  // 3/5 10:00 신청(미실시 → 3/15)이 이미 있음. 3/12에 3/3 날짜 신청서(학사 석식 → 3/3)를 늦게 입력
  const rows = [CH('석식', '학사 석식', '2027-03-02'), CH('석식', '미실시', '2027-03-15', { source: 'F7', requested_at: '2027-03-05T10:00:00' })];
  const r = plan(rows, '석식', '학사 석식', '2027-03-03T10:00:00', { today: '2027-03-12' });
  assert.deepStrictEqual([r.kind, r.superseded, r.toCancel], ['none', false, []]);   // 더 새 신청의 적용일(3/15)이 더 늦으니 덮이지는 않음
  // 더 새 신청이 이 신청보다 먼저 적용되면 이 신청은 영영 적용되지 않는다
  const rows2 = [CH('석식', '학사 석식', '2027-03-02'), CH('석식', '일반 석식', '2027-03-06', { source: 'F7', requested_at: '2027-03-05T10:00:00' })];
  const r2 = plan(rows2, '석식', '미실시', '2027-03-03T10:00:00', { today: '2027-03-12' });   // 미실시 → 3/15
  assert.deepStrictEqual([r2.kind, r2.superseded, r2.toCancel], ['none', true, []]);
  assert.strictEqual(r2.warnings.length, 1);
});

test('늦게 입력한 신청: 이미 적용된 이전 신청 행이라도 신청 일시가 이르고 적용일이 늦으면 취소', () => {
  // 3/3 신청(미실시 → 3/15, 오늘 3/20엔 이미 적용) / 3/4 신청서(학사 석식 → 3/4)를 3/20에 늦게 입력
  const rows = [CH('석식', '학사 석식', '2027-03-02'), CH('석식', '미실시', '2027-03-15', { source: 'F7', requested_at: '2027-03-03T10:00:00' })];
  const r = plan(rows, '석식', '학사 석식', '2027-03-04T10:00:00', { today: '2027-03-20' });
  assert.deepStrictEqual(r.toCancel.map((x) => x.effective_date), ['2027-03-15']);
});

test('퇴실 정리(F6)는 오늘과 상관없이 퇴실일 이상 F7 행 전부: 퇴실일 3/10을 3/12에 입력해도 조식이 끊긴다', () => {
  const rows = [CH('조식', '미실시', '2027-03-02'), CH('조식', '실시', '2027-03-08', { source: 'F7', requested_at: '2027-03-07T10:00:00' }),
    CH('조식', '실시', '2027-03-10', { source: 'F7', requested_at: '2027-03-09T10:00:00' }),
    CH('조식', '실시', '2027-03-11', { source: 'F7', requested_at: '2027-03-10T10:00:00' }),
    CH('조식', '미실시', '2027-03-22', { source: 'F7', requested_at: '2027-03-10T11:00:00' })];
  const c = plain(ctx.mealPendingToCancel_(rows, 's1', '조식', '2027-03-10', { source: 'F6' })).map((x) => x.effective_date);
  assert.deepStrictEqual(c, ['2027-03-10', '2027-03-11']);    // 퇴실일 이상의 '실시'만(미실시 신청은 남김), 3/8 시작분은 퇴실일 정리 행이 끊는다
});

test('퇴실 뒤 일반 석식 신청은 이전 퇴실 정리의 석식 중단(F6) 행을 취소한다(조용히 덮이지 않게)', () => {
  const rows = [CH('학사', '입실', '2027-03-02'), CH('석식', '학사 석식', '2027-03-02'), CH('학사', '퇴실', '2027-03-05', { source: 'F6' }),
    CH('석식', '미실시', '2027-03-15', { source: 'F6', requested_at: '2027-03-03T10:00:00' })];
  const r = plan(rows, '석식', '일반 석식', '2027-03-08T10:00:00', { today: '2027-03-08' });
  assert.deepStrictEqual([r.kind, r.date, r.blocked, r.toCancel.map((x) => x.effective_date)], ['to_general', '2027-03-08', '', ['2027-03-15']]);
});

test('퇴실 전에 켠 학사 급식이 퇴실 뒤까지 이어지면 퇴실 정리 행(followUps)을 함께 준다', () => {
  // 퇴실(3/15)이 이미 잡혔고 그때 석식이 미실시라 석식 중단 행이 없었다 → 3/5에 학사 석식 신청
  const rows = [CH('학사', '입실', '2027-03-02'), CH('석식', '미실시', '2027-03-02'), CH('조식', '미실시', '2027-03-02'),
    CH('학사', '퇴실', '2027-03-15', { source: 'F6' }), CH('조식', '미실시', '2027-03-15', { source: 'F6' })];
  const r = plan(rows, '석식', '학사 석식', '2027-03-05T10:00:00', { today: '2027-03-05' });
  assert.deepStrictEqual(r.followUps, [{ item: '석식', value: '미실시', effective_date: '2027-03-15', source: 'F6' }]);
  // 조식은 이미 퇴실일 중단 행이 있으니 followUps 없음
  assert.deepStrictEqual(plan(rows, '조식', '실시', '2027-03-05T10:00:00', { today: '2027-03-05' }).followUps, []);
  // 퇴실이 없으면 없음
  assert.deepStrictEqual(plan(rows.slice(0, 3), '석식', '학사 석식', '2027-03-05T10:00:00', { today: '2027-03-05' }).followUps, []);
});

table('mealPlanChange_: 잘못된 입력은 Error', [
  [{ item: '중식', to: '실시' }], [{ item: '조식', to: '학사 석식' }], [{ item: '석식', to: '' }],
  [{ at: '2027-03-03' }], [{ at: '2027-02-30T10:00:00' }], [{ today: '' }], [{ today: '2027-3-3' }], [{ today: '2027-02-30' }]
], ([o]) => {
  const a = Object.assign({ item: '조식', to: '실시', at: '2027-03-03T10:00:00', today: '2027-03-03' }, o);
  assert.throws(() => ctx.mealPlanChange_([], 's1', a.item, a.to, a.at, { today: a.today }));
});

test('적용일 검사는 statusOn_과 같다: 달력에 없는 날짜 행은 둘 다 무시', () => {
  const rows = [CH('조식', '실시', '2027-03-02'), CH('조식', '미실시', '2027-02-30')];
  assert.strictEqual(ctx.statusOn_(rows, 's1', '조식', '2027-03-31'), '실시');
  assert.deepStrictEqual(plain(ctx.mealPendingToCancel_(rows, 's1', '조식', '2027-01-01', {})).map((x) => x.effective_date), ['2027-03-02']);
});

table('mealChangeKind_: 모르는 항목·값은 Error', [
  ['중식', '', '실시'], ['조식', '', '학사 석식'], ['석식', '', '실시'], ['석식', '학사', '미실시'], ['조식', '실시', ''], ['', '', '미실시']
], ([item, from, to]) => assert.throws(() => ctx.mealChangeKind_(item, from, to)));

/* ───── 총괄 오라클 감사(변이 생존분) ───── */

// 저장 흉내: F7 신청 계획 저장 / F6 학사 퇴실 정리(rules-api.md 순서)
let sseq = 0;
function saveF7(rows, item, to, at, today) {
  const p = plan(rows, item, to, at, { today });
  if (p.blocked) return { rows, p };
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소' }) : r));
  if (!p.superseded) out.push(CH(item, to, p.date, { source: 'F7', requested_at: at, created_at: String(++sseq) }));
  p.followUps.forEach((f) => out.push(CH(f.item, f.value, f.effective_date, { source: f.source, requested_at: at, created_at: String(++sseq) })));
  return { rows: out, p };
}
function saveF7m(rows, item, to, at, today, effectiveDate) {
  const p = plan(rows, item, to, at, { today, effectiveDate });
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소' }) : r));
  if (!p.blocked && !p.superseded) out.push(CH(item, to, p.date, { source: 'F7', requested_at: at, created_at: String(++sseq) }));
  return out;
}
function saveLeave(rows, L, t) {   // F6 학사 퇴실 = movePlan_(R11a) 계획을 그대로 저장
  const p = plain(ctx.movePlan_(rows, 's1', { type: '학사 퇴실', effectiveDate: L, requestedAt: t }, { today: t.slice(0, 10) }));
  assert.deepStrictEqual(p.errors, []);
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소' }) : r));
  p.rows.forEach((r) => out.push(CH(r.item, r.value, r.effective_date, { source: r.source, requested_at: t, created_at: String(++sseq) })));
  return out;
}
const daysOf = (rows, item) => plain(ctx.ymdRange_('2027-03-01', '2027-04-10')).map((d) => d + ' ' + ctx.statusOn_(rows, 's1', item, d));

table('퇴실과 학사생 값 신청서는 입력 순서가 아니라 신청 일시 순서로 정한다(결정 35) — 두 순서를 실제로 저장해 매일 값 비교', [
  // [항목, 신청 값, 신청 일시, 퇴실일, 퇴실 입력 일시, 퇴실 뒤 입력이면 막힘?]
  ['석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-06', '2027-03-08T10:00:00', false],   // 퇴실 기록보다 먼저 신청 → 3/15(결정 35)까지 유지
  ['석식', '학사 석식', '2027-03-08T09:00:00', '2027-03-06', '2027-03-08T10:00:00', false],   // 적용일이 퇴실일 뒤여도 먼저 신청이면 유지
  ['조식', '실시', '2027-03-04T09:00:00', '2027-03-06', '2027-03-08T10:00:00', false],         // 조식은 퇴실일부터 중단
  ['조식', '실시', '2027-03-08T09:00:00', '2027-03-06', '2027-03-08T10:00:00', true]           // 조식은 퇴실일 뒤 적용이면 늘 막힘
], ([item, to, at, L, t, blockedLater]) => {
  const base = [CH('학사', '입실', '2027-03-01'), CH(item, '미실시', '2027-03-01')];
  const first = saveLeave(saveF7(base, item, to, at, at.slice(0, 10)).rows, L, t);   // 신청서 먼저 입력
  const late = saveF7(saveLeave(base, L, t), item, to, at, '2027-03-09');             // 퇴실 먼저, 신청서는 늦게 입력
  assert.strictEqual(!!late.p.blocked, blockedLater);
  assert.deepStrictEqual(daysOf(late.rows, item), daysOf(first, item));
});

test('퇴실 기록보다 뒤에 신청한 학사 석식은 막는다', () => {
  const rows = saveLeave([CH('학사', '입실', '2027-03-01'), CH('석식', '미실시', '2027-03-01')], '2027-03-06', '2027-03-08T10:00:00');
  assert.ok(plan(rows, '석식', '학사 석식', '2027-03-08T11:00:00', { today: '2027-03-08' }).blocked);
  assert.ok(plan(rows, '석식', '학사 석식', '2027-03-09T09:00:00', { today: '2027-03-09' }).blocked);
});

test('퇴실 정리(F6) 행은 superseded 판정의 "더 새 신청"이 아니다', () => {
  const rows = saveLeave([CH('학사', '입실', '2027-03-01'), CH('조식', '실시', '2027-03-01')], '2027-03-10', '2027-03-08T10:00:00');
  const p = plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-09' });   // 늦게 입력한 3/3(수) 미실시 → 3/15
  assert.strictEqual(p.superseded, false);
  assert.strictEqual(p.date, '2027-03-15');
});

table('followUps: 퇴실 찾기(같은 날 재입실·퇴실 둘·중단일 전 재입실)·퇴실 신청 일시 형식 오류', [
  // M20 같은 날 다시 입실(나중 신청)한 3/10 퇴실은 퇴실이 아니다 → 그 뒤 4/5 퇴실(4/1 목 입력) 기준 석식 4/12
  ['same-day-reentry', [CH('학사', '퇴실', '2027-03-10', { source: 'F6', requested_at: '2027-03-08T10:00:00' }),
    CH('학사', '입실', '2027-03-10', { source: 'F6', requested_at: '2027-03-08T11:00:00' }),
    CH('학사', '퇴실', '2027-04-05', { source: 'F6', requested_at: '2027-04-01T10:00:00' })], ['2027-04-12']],
  // M32 퇴실이 둘이면 가장 이른 퇴실 기준(3/10 → 석식 3/15), 중단일 뒤 3/20 재입실부터 학사 석식을 다시
  ['two-leaves', [CH('학사', '퇴실', '2027-03-10', { source: 'F6', requested_at: '2027-03-08T10:00:00' }),
    CH('학사', '입실', '2027-03-20', { source: 'F6', requested_at: '2027-03-18T10:00:00' }),
    CH('학사', '퇴실', '2027-04-05', { source: 'F6', requested_at: '2027-04-01T10:00:00' })], ['2027-03-15', '2027-03-20']],   // 3/20 재입실부터 다시(R11b)
  // 중단일(3/15) 전에 다시 입실 → 정리 행 없음
  ['reentry-before-stop', [CH('학사', '퇴실', '2027-03-10', { source: 'F6', requested_at: '2027-03-08T10:00:00' }),
    CH('학사', '입실', '2027-03-12', { source: 'F6', requested_at: '2027-03-11T10:00:00' })], []],
  // 퇴실 기록 신청 일시가 틀려도 throw하지 않는다(이 신청 일시 3/5 금 → 다다음 주 월 3/15)
  ['bad-leave-time', [CH('학사', '퇴실', '2027-03-10', { source: 'F6', requested_at: '3월 8일' })], ['2027-03-15']]
], ([, extra, want]) => {
  const rows = [CH('학사', '입실', '2027-03-01'), CH('석식', '미실시', '2027-03-01')].concat(extra);
  assert.deepStrictEqual(plan(rows, '석식', '학사 석식', '2027-03-05T09:00:00', { today: '2027-03-05' }).followUps.map((f) => f.effective_date), want);
});

table('표: 신청 일시 동점·학생 거르기·재입실·빈칸 status', [
  // M7 동점: 신청 일시가 같은 대기 행은 이전 신청으로 본다(취소 대상)
  ['tie', () => {
    const rows = [CH('석식', '학사 석식', '2027-03-01'), CH('석식', '미실시', '2027-03-15', { requested_at: '2027-03-03T09:00:00' })];
    return plan(rows, '석식', '일반 석식', '2027-03-03T09:00:00', { today: '2027-03-03' }).toCancel.length;
  }, 1],
  // M17 다른 학생 행은 보지 않는다
  ['student', () => {
    const rows = [CH('석식', '학사 석식', '2027-03-01'), CH('석식', '미실시', '2027-03-15', { student_id: 's2', requested_at: '2027-03-02T09:00:00' })];
    return plan(rows, '석식', '일반 석식', '2027-03-03T09:00:00', { today: '2027-03-03' }).toCancel.length;
  }, 0],
  // M17 다른 학생의 더 새 신청은 이 신청을 밀어내지 않는다(superseded 아님)
  ['student-plan', () => {
    const rows = [CH('석식', '미실시', '2027-03-01'), CH('석식', '일반 석식', '2027-03-02', { student_id: 's2', requested_at: '2027-03-04T09:00:00' })];
    return plan(rows, '석식', '학사 석식', '2027-03-02T09:00:00', { today: '2027-03-05' }).superseded;
  }, false],
  // M20 재입실: 퇴실 뒤 다시 입실했으면 학사 석식을 신청할 수 있다(blocked 아님)
  ['reentry', () => {
    const rows = [CH('학사', '입실', '2027-03-01'), CH('석식', '미실시', '2027-03-01'), CH('학사', '퇴실', '2027-03-05', { source: 'F6' }),
      CH('학사', '입실', '2027-03-10', { source: 'F6' })];
    return plan(rows, '석식', '학사 석식', '2027-03-12T09:00:00', { today: '2027-03-12' }).blocked;
  }, ''],
  // M22 status 빈칸 행은 유효로 센다
  ['blank-status', () => {
    const rows = [CH('석식', '학사 석식', '2027-03-01', { status: '' }), CH('석식', '미실시', '2027-03-15', { status: '', requested_at: '2027-03-02T09:00:00' })];
    return plan(rows, '석식', '일반 석식', '2027-03-03T09:00:00', { today: '2027-03-03' }).toCancel.length;
  }, 1]
], ([, fn, want]) => assert.strictEqual(fn(), want));

test('statusOn_: 달력에 없는 적용일(2027-02-30)은 무시', () => {
  assert.strictEqual(ctx.statusOn_([CH('석식', '학사 석식', '2027-02-01'), CH('석식', '미실시', '2027-02-30')], 's1', '석식', '2027-03-05'), '학사 석식');
});

/* ───── R10 수동 적용일(opts.effectiveDate·effectiveRule, 결과 autoDate) ───── */

table('수동 적용일: 자동보다 이른 날·늦은 날·오늘 이전 모두 받고, autoDate는 규칙 계산값', [
  // [신청 일시, 오늘, 수동 날짜, 자동 날짜]
  ['2027-03-03T09:00:00', '2027-03-03', '2027-03-03', '2027-03-15'],   // 미실시 자동 3/15보다 이름
  ['2027-03-03T09:00:00', '2027-03-03', '2027-03-20', '2027-03-15'],   // 늦음
  ['2027-03-01T09:00:00', '2027-03-05', '2027-03-02', '2027-03-08']    // 오늘(3/5) 이전 날짜(늦은 입력)
], ([at, today, manual, auto]) => {
  const rows = [CH('조식', '실시', '2027-03-01')];
  const p = plan(rows, '조식', '미실시', at, { today, effectiveDate: manual });
  assert.deepStrictEqual([p.date, p.rule, p.autoDate, p.kind], [manual, 'manual', auto, 'stop']);
});

test('수동 적용일: 신청일보다 이르거나 날짜가 아니거나 모르는 effectiveRule이면 Error', () => {
  const rows = [CH('조식', '실시', '2027-03-01')];
  assert.throws(() => plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03', effectiveDate: '2027-03-02' }), /신청일/);
  assert.throws(() => plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03', effectiveDate: '2027-02-30' }), /yyyy-MM-dd/);
  assert.throws(() => plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03', effectiveDate: '2027-03-04', effectiveRule: 'auto' }), /effectiveRule/);
  assert.throws(() => plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03', effectiveRule: 'entry_date' }), /effectiveDate도/);
  assert.throws(() => plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03', effectiveDate: ' 2027-03-02 ' }), /신청일/);   // 공백도 다듬어 검사
});

test('entry_date: 기숙사 입실 조식은 입실일(rule entry_date), 자동 날짜는 autoDate', () => {
  const p = plan([CH('조식', '미실시', '2027-03-01')], '조식', '실시', '2027-03-03T15:00:00', { today: '2027-03-03', effectiveDate: '2027-03-10', effectiveRule: 'entry_date' });
  assert.deepStrictEqual([p.date, p.rule, p.autoDate, p.kind], ['2027-03-10', 'entry_date', '2027-03-04', 'start']);
  // 입퇴실을 늦게 입력하면 입실일이 신청일보다 이를 수 있다(entry_date만 허용)
  const late = plan([CH('조식', '미실시', '2027-03-01')], '조식', '실시', '2027-03-12T15:00:00', { today: '2027-03-12', effectiveDate: '2027-03-10', effectiveRule: 'entry_date' });
  assert.deepStrictEqual([late.date, late.rule], ['2027-03-10', 'entry_date']);
});

test('수동 적용일 기준으로 toCancel·followUps·blocked를 계산한다', () => {
  // toCancel: 3/20 미실시 대기 행 — 수동 3/25 실시보다 먼저 적용되므로 취소 안 함(경고), 수동 3/18이면 취소
  const rows = [CH('조식', '실시', '2027-03-01'), CH('조식', '미실시', '2027-03-20', { requested_at: '2027-03-02T09:00:00' })];
  assert.strictEqual(plan(rows, '조식', '실시', '2027-03-05T09:00:00', { today: '2027-03-05', effectiveDate: '2027-03-18' }).toCancel.length, 1);
  const later = plan(rows, '조식', '실시', '2027-03-05T09:00:00', { today: '2027-03-05', effectiveDate: '2027-03-25' });
  assert.strictEqual(later.toCancel.length, 0);
  assert.ok(later.warnings.some((w) => /2027-03-20부터 미실시.*먼저 적용/.test(w)), JSON.stringify(later.warnings));
  // blocked: 퇴실(3/10) 뒤 날짜로 고친 조식 실시는 막힘, 퇴실 전 날짜면 followUps(퇴실일 미실시)
  const leave = saveLeave([CH('학사', '입실', '2027-03-01'), CH('조식', '미실시', '2027-03-01')], '2027-03-10', '2027-03-08T10:00:00');
  assert.ok(plan(leave, '조식', '실시', '2027-03-02T09:00:00', { today: '2027-03-09', effectiveDate: '2027-03-12' }).blocked);
  assert.deepStrictEqual(plan(leave, '조식', '실시', '2027-03-02T09:00:00', { today: '2027-03-09', effectiveDate: '2027-03-04' }).followUps.map((f) => f.effective_date), ['2027-03-10']);
  // 퇴실 기록보다 먼저 신청한 학사 석식이라도 결정 35 중단일(3/15) 이후로 고친 날짜면 막힘
  const leave2 = saveLeave([CH('학사', '입실', '2027-03-01'), CH('석식', '미실시', '2027-03-01')], '2027-03-10', '2027-03-08T10:00:00');
  assert.ok(plan(leave2, '석식', '학사 석식', '2027-03-02T09:00:00', { today: '2027-03-09', effectiveDate: '2027-03-16' }).blocked);
  assert.ok(!plan(leave2, '석식', '학사 석식', '2027-03-02T09:00:00', { today: '2027-03-09', effectiveDate: '2027-03-12' }).blocked);
});

test('autoDate는 늘 들어 있다: 고친 날이 없으면 date와 같고, blocked·superseded여도 규칙 계산값', () => {
  const rows = [CH('학사', '입실', '2027-03-01'), CH('조식', '실시', '2027-03-01')];
  const p = plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03' });
  assert.deepStrictEqual([p.date, p.autoDate], ['2027-03-15', '2027-03-15']);
  const newer = rows.concat([CH('조식', '미실시', '2027-03-08', { requested_at: '2027-03-05T09:00:00' })]);
  const sup = plan(newer, '조식', '미실시', '2027-03-02T09:00:00', { today: '2027-03-06' });
  assert.deepStrictEqual([sup.superseded, sup.autoDate], [true, '2027-03-08']);
  const left = saveLeave(rows, '2027-03-05', '2027-03-03T10:00:00');
  const blk = plan(left, '조식', '실시', '2027-03-06T09:00:00', { today: '2027-03-06' });
  assert.deepStrictEqual([!!blk.blocked, blk.autoDate], [true, '2027-03-06']);
});

test('고친 일반 석식 날짜가 퇴실 정리 행(미실시@중단일)과 같은 날이어도 그날부터 일반 석식(같은 날 F6도 취소)', () => {
  // 3/2(화) 10:00 퇴실 입력, 퇴실일 3/9 → 석식 중단일 = max(3/8, 3/9) = 3/9
  const left = saveLeave([CH('학사', '입실', '2027-03-01'), CH('석식', '학사 석식', '2027-03-01')], '2027-03-09', '2027-03-02T10:00:00');
  assert.ok(left.some((r) => r.item === '석식' && r.value === '미실시' && r.effective_date === '2027-03-09'));
  const s2 = saveF7m(left, '석식', '일반 석식', '2027-03-01T08:00:00', '2027-03-02', '2027-03-09');
  assert.strictEqual(ctx.statusOn_(s2, 's1', '석식', '2027-03-09'), '일반 석식');
});

test('고친 날과 자동 날 사이에 있는 퇴실 정리 행도 취소한다(일반 석식 3/14 12:00 신청 → 자동 3/15, 고친 날 3/14, F6 미실시@3/15)', () => {
  const left = saveLeave([CH('학사', '입실', '2027-03-01'), CH('석식', '학사 석식', '2027-03-01')], '2027-03-10', '2027-03-03T10:00:00');
  const f6 = left.find((r) => r.item === '석식' && r.source === 'F6');
  assert.strictEqual(f6.effective_date, '2027-03-15');
  const p = plan(left, '석식', '일반 석식', '2027-03-14T12:00:00', { today: '2027-03-14', effectiveDate: '2027-03-14' });
  assert.deepStrictEqual([p.autoDate, p.toCancel.map((c) => c.id)], ['2027-03-15', [f6.id]]);
});

test('P6: 퇴실 3/10 → 재입실 3/20 → 퇴실 4/5, 조식 실시(3/2 신청, 고친 날 3/25) → 막히지 않고 followUps [4/5](고친 날 기준으로 퇴실을 찾는다)', () => {
  const rows = [CH('학사', '입실', '2027-03-01'), CH('조식', '미실시', '2027-03-01'),
    CH('학사', '퇴실', '2027-03-10', { source: 'F6', requested_at: '2027-03-08T10:00:00' }), CH('조식', '미실시', '2027-03-10', { source: 'F6', requested_at: '2027-03-08T10:00:00' }),
    CH('학사', '입실', '2027-03-20', { source: 'F6', requested_at: '2027-03-18T10:00:00' }),
    CH('학사', '퇴실', '2027-04-05', { source: 'F6', requested_at: '2027-04-01T10:00:00' })];
  const p = plan(rows, '조식', '실시', '2027-03-02T09:00:00', { today: '2027-03-21', effectiveDate: '2027-03-25' });
  assert.deepStrictEqual([p.blocked, p.followUps.map((f) => f.effective_date)], ['', ['2027-04-05']]);
});

test('결정 52: 고친 미실시 날짜가 미실시 규칙의 날보다 이르거나 오늘보다 이르면 경고(허용)', () => {
  const rows = [CH('조식', '실시', '2027-03-01')];
  const early = plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03', effectiveDate: '2027-03-05' });
  assert.ok(early.warnings.some((w) => /미실시 규칙의 날\(2027-03-15\)보다 이릅니다/.test(w)));
  const past = plan(rows, '조식', '미실시', '2027-03-01T09:00:00', { today: '2027-03-05', effectiveDate: '2027-03-02' });
  assert.ok(past.warnings.some((w) => /오늘보다 이릅니다/.test(w)));
  assert.ok(!plan(rows, '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03', effectiveDate: '2027-03-20' }).warnings.some((w) => /이릅니다/.test(w)));
});
