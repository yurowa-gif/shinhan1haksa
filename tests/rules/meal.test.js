/** R6 MealRules — 급식 적용일. plan 2절 R6 표, 11:29:59/11:30:00 경계, 연말·윤년. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs']);

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
  // 이미 적용된(오늘 이전·오늘) 행은 취소하지 않는다
  assert.deepStrictEqual(ids('2027-03-04', { requestedAt: '2027-03-04T10:00:00', today: '2027-03-15' }), [['2027-03-22', '일반 석식']]);
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
  assert.deepStrictEqual(plan(rows, '조식', '실시', '2027-03-02T10:00:00').kind, 'none');
});

test('mealPlanChange_: 학사 퇴실 적용일 이후에는 조식 실시·학사 석식을 새로 켜지 못한다(일반 석식은 된다)', () => {
  const rows = [CH('학사', '입실', '2027-03-02'), CH('조식', '미실시', '2027-03-02'), CH('석식', '미실시', '2027-03-02'),
    CH('학사', '퇴실', '2027-03-15', { source: 'F6' })];
  assert.ok(plan(rows, '조식', '실시', '2027-03-16T10:00:00').blocked);
  assert.ok(plan(rows, '석식', '학사 석식', '2027-03-15T09:00:00').blocked);
  assert.strictEqual(plan(rows, '조식', '실시', '2027-03-05T10:00:00').blocked, '');      // 퇴실 전 날짜는 된다
  assert.strictEqual(plan(rows, '석식', '일반 석식', '2027-03-16T10:00:00').blocked, '');
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
  const r = plan([], '조식', '미실시', '2027-03-03T15:00:00');
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
