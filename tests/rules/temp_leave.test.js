/** R18 결정 70·77 — 자진 퇴실 재입실 막힘 + 건강상 임시 퇴실. 가짜 학생만. 2027 학기표. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/rules/MoveRules.gs',
  'src/rules/AttendanceRules.gs', 'src/rules/OutRules.gs']);

const TERMS = [
  { type: '학기', start_date: '2027-03-02', end_date: '2027-07-16' },
  { type: '방학', start_date: '2027-07-17', end_date: '2027-08-15' },
  { type: '학기', start_date: '2027-08-16', end_date: '2027-12-24' },
  { type: '방학', start_date: '2027-12-25', end_date: '2028-02-28' },
  { type: '학기', start_date: '2028-03-02', end_date: '2028-07-14' }];
let seq = 0;
const CH = (item, value, effective_date, extra) => Object.assign({ id: 'c' + (++seq), student_id: 's1', item, value, effective_date, status: '유효',
  requested_at: effective_date + 'T09:00:00', created_at: '', source: 'F6', reason: '', memo: '' }, extra || {});
const BASE = () => [CH('학사', '입실', '2027-03-02', { source: '명단업로드' }), CH('조식', '미실시', '2027-03-02', { source: '명단업로드' }),
  CH('석식', '학사 석식', '2027-03-02', { source: '명단업로드' })];
const TEMP = (e, ret, extra) => CH('학사', '퇴실', e, Object.assign({ reason: '임시 퇴실', memo: '[임시] return:' + ret + ' 입원' }, extra || {}));
const ban = (rows, ymd) => plain(ctx.moveReentryBan_(rows, 's1', TERMS, ymd));
const plan = (rows, move, today) => plain(ctx.movePlan_(rows, 's1', move, { today, terms: TERMS }));

/* ───── 판정 함수 ───── */

test('isTempLeaveRow_·tempLeaveReturnDate_: reason과 memo 머리말이 둘 다 있어야 임시 퇴실, 복귀일은 memo에서(틀리면 "")', () => {
  assert.strictEqual(ctx.isTempLeaveRow_(TEMP('2027-04-10', '2027-05-01')), true);
  assert.strictEqual(ctx.isTempLeaveRow_(TEMP('2027-04-10', '2027-05-01', { reason: '개인 사정' })), false);
  assert.strictEqual(ctx.isTempLeaveRow_(TEMP('2027-04-10', '2027-05-01', { memo: '입원 [임시] return:2027-05-01' })), false);
  assert.strictEqual(ctx.isTempLeaveRow_(TEMP('2027-04-10', '2027-05-01', { item: '기숙사' })), false);
  assert.strictEqual(ctx.isTempLeaveRow_(TEMP('2027-04-10', '2027-05-01', { value: '입실' })), false);
  assert.strictEqual(ctx.isTempLeaveRow_(null), false);
  assert.strictEqual(ctx.tempLeaveReturnDate_(TEMP('2027-04-10', '2027-05-01')), '2027-05-01');
  assert.strictEqual(ctx.tempLeaveReturnDate_(TEMP('2027-04-10', '2027-02-30')), '');
  assert.strictEqual(ctx.tempLeaveReturnDate_({ memo: '' }), '');
});

test('tempLeaveOn_: 그날 학사 상태를 만든 행이 임시 퇴실일 때만(퇴실 전·복귀 뒤·일반 퇴실·취소는 null)', () => {
  const t = TEMP('2027-04-10', '2027-05-01', { id: 't1' });
  const rows = BASE().concat([t, CH('학사', '입실', '2027-04-28')]);
  assert.deepStrictEqual(plain(ctx.tempLeaveOn_(rows, 's1', '2027-04-10')), { id: 't1', leaveDate: '2027-04-10', returnDate: '2027-05-01' });
  assert.deepStrictEqual(plain(ctx.tempLeaveOn_(rows, 's1', '2027-04-27')).id, 't1');
  assert.strictEqual(ctx.tempLeaveOn_(rows, 's1', '2027-04-09'), null);
  assert.strictEqual(ctx.tempLeaveOn_(rows, 's1', '2027-04-28'), null);   // 복귀(재입실)
  assert.strictEqual(ctx.tempLeaveOn_(BASE().concat([CH('학사', '퇴실', '2027-04-10', { reason: '개인 사정' })]), 's1', '2027-04-20'), null);
  assert.strictEqual(ctx.tempLeaveOn_(BASE().concat([TEMP('2027-04-10', '2027-05-01', { status: '취소' })]), 's1', '2027-04-20'), null);
});

/* ───── 재입실 막힘(결정 70·77①) ───── */

table('moveReentryBan_: 기록된 일반 퇴실(자진)·2OUT은 막고, 임시 퇴실·명단 업로드 퇴실·기숙사만 퇴실은 막지 않음', [
  ['자진(개인 사정)', [CH('학사', '퇴실', '2027-04-10', { reason: '개인 사정' })], { banned: true, until: '2028-03-01', leaveDate: '2027-04-10', kind: '자진' }],
  ['일괄 퇴실·전학도 자진', [CH('학사', '퇴실', '2027-04-10', { reason: '전학' })], { banned: true, until: '2028-03-01', leaveDate: '2027-04-10', kind: '자진' }],
  ['2OUT', [CH('학사', '퇴실', '2027-04-10', { reason: '2OUT 퇴실', memo: '[2OUT] out:o2 note:n1' })], { banned: true, until: '2028-03-01', leaveDate: '2027-04-10', kind: '2OUT' }],
  ['임시 퇴실', [TEMP('2027-04-10', '2027-05-01')], { banned: false, until: '', leaveDate: '', kind: '' }],
  ['명단 업로드 퇴실', [CH('학사', '퇴실', '2027-04-10', { source: '명단업로드' })], { banned: false, until: '', leaveDate: '', kind: '' }],
  ['기숙사만 퇴실(총괄 가정)', [CH('기숙사', '퇴실', '2027-04-10')], { banned: false, until: '', leaveDate: '', kind: '' }]
], ([, rows, want]) => assert.deepStrictEqual(ban(BASE().concat(rows), '2027-05-03'), want));

test('moveReentryBan_: 가장 늦은 기록된 퇴실이 기준 — 자진 뒤(막힘이 지나) 다시 들어와 임시 퇴실하면 막지 않음, 임시 퇴실 복귀 뒤 자진 퇴실은 막음', () => {
  const old = CH('학사', '퇴실', '2025-04-10', { reason: '개인 사정' }), back = CH('학사', '입실', '2027-03-02', { requested_at: '2027-02-20T09:00:00' });
  assert.strictEqual(ban(BASE().concat([old, back, TEMP('2027-04-10', '2027-05-01')]), '2027-05-03').banned, false);
  const r = ban(BASE().concat([TEMP('2027-04-10', '2027-05-01'), CH('학사', '입실', '2027-05-01'), CH('학사', '퇴실', '2027-06-01', { reason: '개인 사정' })]), '2027-06-10');
  assert.deepStrictEqual([r.banned, r.leaveDate, r.kind], [true, '2027-06-01', '자진']);
  // 임시 퇴실을 일반 퇴실로 바꿈(임시 취소 + 같은 날 일반 퇴실, 결정 77④) → 처음 임시 퇴실한 날부터
  const conv = ban(BASE().concat([TEMP('2027-04-10', '2027-05-01', { status: '취소' }), CH('학사', '퇴실', '2027-04-10', { reason: '건강', requested_at: '2027-05-05T09:00:00' })]), '2027-05-10');
  assert.deepStrictEqual([conv.banned, conv.leaveDate, conv.until], [true, '2027-04-10', '2028-03-01']);
  assert.deepStrictEqual(plain(ctx.move2OutBan_(BASE().concat([CH('학사', '퇴실', '2027-04-10')]), 's1', TERMS, '2027-05-03')).kind, '자진');   // 옛 이름도 같은 판정
});

test('movePlan_ 학사 입실: 자진 퇴실 뒤면 "퇴실(날짜)로 …까지" 오류, 임시 퇴실 뒤 복귀는 허용(재입실 급식 = 퇴실 전 값)', () => {
  const move = { type: '학사 입실', effectiveDate: '2027-05-03', requestedAt: '2027-05-01T09:00:00' };
  const self = plan(BASE().concat([CH('학사', '퇴실', '2027-04-10', { reason: '개인 사정' })]), move, '2027-05-01');
  assert.deepStrictEqual(self.errors, ['퇴실(4월 10일)로 2028년 3월 1일까지 다시 들어올 수 없습니다']);
  const tp = plan(BASE(), { type: '학사 임시 퇴실', effectiveDate: '2027-04-10', requestedAt: '2027-04-09T09:00:00', returnDate: '2027-05-03' }, '2027-04-09');
  const saved = BASE().concat(tp.rows.map((r, i) => Object.assign(CH(r.item, r.value, r.effective_date), r, { id: 'p' + i })));
  const back = plan(saved, move, '2027-05-01');
  assert.deepStrictEqual(back.errors, []);
  assert.deepStrictEqual(back.rows.map((r) => [r.item, r.value, r.effective_date]), [['학사', '입실', '2027-05-03'], ['조식', '미실시', '2027-05-03'], ['석식', '학사 석식', '2027-05-03']]);
});

/* ───── movePlan_ 임시 퇴실(결정 77②) ───── */

test('movePlan_ 학사 임시 퇴실: 행·급식 정리는 일반 퇴실과 같고 대표 행만 reason "임시 퇴실" + memo "[임시] return:…"', () => {
  const at = { effectiveDate: '2027-04-14', requestedAt: '2027-04-13T09:00:00' };
  const reg = plan(BASE(), Object.assign({ type: '학사 퇴실' }, at), '2027-04-13');
  const tmp = plan(BASE(), Object.assign({ type: '학사 임시 퇴실', returnDate: '2027-05-03' }, at), '2027-04-13');
  assert.deepStrictEqual(tmp.errors, []);
  const shape = (p) => p.rows.map((r) => [r.item, r.value, r.effective_date, r.source, r.head]);
  assert.deepStrictEqual(shape(tmp), shape(reg));
  assert.deepStrictEqual(shape(tmp), [['학사', '퇴실', '2027-04-14', 'F6', true], ['석식', '미실시', '2027-04-19', 'F6', false]]);   // 석식은 미실시 규칙(결정 35, 화 신청 → 다음 주 월)
  assert.deepStrictEqual([tmp.rows[0].reason, tmp.rows[0].memo], ['임시 퇴실', '[임시] return:2027-05-03']);
  assert.deepStrictEqual([reg.rows[0].reason, reg.rows[0].memo], ['학사 퇴실', undefined]);
  assert.deepStrictEqual(tmp.summary, reg.summary);
  assert.strictEqual(tmp.rows[1].reason, '학사 퇴실 석식 중단');
});

test('movePlan_ 학사 및 기숙사 임시 퇴실: 기숙사 퇴실 연결 행도 같이, 기숙사 입실 상태가 아니면 오류(일반과 같음)', () => {
  const dorm = BASE().concat([CH('기숙사', '입실', '2027-03-02', { source: '명단업로드' }), CH('조식', '실시', '2027-03-02', { source: '명단업로드', requested_at: '2027-03-02T10:00:00' })]);
  const p = plan(dorm, { type: '학사 및 기숙사 임시 퇴실', effectiveDate: '2027-04-14', requestedAt: '2027-04-13T09:00:00', returnDate: '2027-05-03' }, '2027-04-13');
  assert.deepStrictEqual(p.errors, []);
  assert.deepStrictEqual(p.rows.slice(0, 2).map((r) => [r.item, r.value, r.reason, r.memo]), [['학사', '퇴실', '임시 퇴실', '[임시] return:2027-05-03'], ['기숙사', '퇴실', '임시 퇴실', undefined]]);
  assert.ok(p.rows.some((r) => r.item === '조식' && r.value === '미실시' && r.effective_date === '2027-04-14'));   // 조식은 바로
  const e = plan(BASE(), { type: '학사 및 기숙사 임시 퇴실', effectiveDate: '2027-04-14', requestedAt: '2027-04-13T09:00:00', returnDate: '2027-05-03' }, '2027-04-13');
  assert.deepStrictEqual(e.errors, ['2027-04-14에 기숙사 입실 상태가 아닙니다']);
  const d = plan(dorm, { type: '학사 임시 퇴실', effectiveDate: '2027-04-14', requestedAt: '2027-04-13T09:00:00', returnDate: '2027-05-03' }, '2027-04-13');
  assert.deepStrictEqual(d.errors, ["기숙사생입니다. '학사 및 기숙사 퇴실'로 처리해 주세요"]);
});

table('movePlan_ 임시 퇴실: 복귀 예정일이 없거나·틀리거나·퇴실일 이하면 오류', [
  [undefined, '임시 퇴실은 복귀 예정일이 필요합니다(yyyy-MM-dd): '],
  ['2027-02-30', '임시 퇴실은 복귀 예정일이 필요합니다(yyyy-MM-dd): 2027-02-30'],
  ['2027-04-14', '복귀 예정일은 퇴실일 뒤여야 합니다: 2027-04-14'],
  ['2027-04-01', '복귀 예정일은 퇴실일 뒤여야 합니다: 2027-04-01']
], ([ret, msg]) => {
  const p = plan(BASE(), { type: '학사 임시 퇴실', effectiveDate: '2027-04-14', requestedAt: '2027-04-13T09:00:00', returnDate: ret }, '2027-04-13');
  assert.deepStrictEqual([p.errors, p.rows], [[msg], []]);
});

test('moveUndoPlan_: 임시 퇴실도 일반 퇴실처럼 취소된다(대표 + 정리 행)', () => {
  const tp = plan(BASE(), { type: '학사 임시 퇴실', effectiveDate: '2027-04-14', requestedAt: '2027-04-13T09:00:00', returnDate: '2027-05-03' }, '2027-04-13');
  const saved = BASE().concat(tp.rows.map((r, i) => Object.assign(CH(r.item, r.value, r.effective_date), r, { id: 'p' + i, requested_at: '2027-04-13T09:00:00' })));
  const u = plain(ctx.moveUndoPlan_(saved, 'p0', { today: '2027-04-13' }));
  assert.deepStrictEqual(u.toCancel.map((c) => c.id).sort(), ['p0', 'p1']);
});

/* ───── 2OUT 관문(결정 77③) ───── */

const OUT = (id, occurred_at) => ({ id, term_id: 'T1', student_id: 's1', occurred_at, created_at: occurred_at, status: '유효', source: '직접' });
const NOTE = { id: 'n1', student_id: 's1', type: '2OUT 학부모 면담', linked_violation_id: 'o2', status: '유효', date: '2027-04-05', teacher_email: 'hr@example.com' };
const gate = (changes, notes, outs) => plain(ctx.outDismissalGate_(outs || [OUT('o1', '2027-03-10T21:00:00'), OUT('o2', '2027-04-01T21:00:00')], notes, changes, 's1', 'T1', '2027-04-20'));

test('outDismissalGate_: 임시 퇴실 중이면 이미 퇴실이 아니고(면담 가능) 퇴실 확정만 막음 — "임시 퇴실 중", 복귀하면 ok', () => {
  const t = TEMP('2027-04-10', '2027-05-01', { id: 't1' });
  const r = gate(BASE().concat([t]), [NOTE]);
  assert.deepStrictEqual([r.alreadyLeft, r.ok, r.reason, r.tempLeave], [false, false, '임시 퇴실 중', { id: 't1', leaveDate: '2027-04-10', returnDate: '2027-05-01' }]);
  assert.strictEqual(gate(BASE().concat([t]), []).reason, '임시 퇴실 중');   // 면담 전에도 같은 안내
  assert.strictEqual(gate(BASE().concat([t]), [NOTE], [OUT('o1', '2027-03-10T21:00:00')]).reason, '퇴실 대상 아님');
  const back = gate(BASE().concat([t, CH('학사', '입실', '2027-04-18')]), [NOTE]);
  assert.deepStrictEqual([back.ok, back.tempLeave], [true, null]);
  const reg = gate(BASE().concat([CH('학사', '퇴실', '2027-04-10', { reason: '개인 사정' })]), [NOTE]);
  assert.deepStrictEqual([reg.alreadyLeft, reg.reason, reg.tempLeave], [true, '이미 퇴실', null]);
});

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}
