/** R20 결정 74① — 학년 일괄 퇴실 계획·되돌리기. 가짜 학생만. 2027-11-19(금) 3학년 퇴실. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/rules/MoveRules.gs']);

let seq = 0;
const CH = (sid, item, value, effective_date, extra) => Object.assign({ id: 'c' + (++seq), student_id: sid, item, value, effective_date, status: '유효',
  requested_at: '2027-08-10T09:00:00', created_at: '', source: '명단업로드', reason: '', memo: '' }, extra || {});
const ST = [{ id: 'a', grade: '3' }, { id: 'b', grade: '3' }, { id: 'c', grade: '3' }, { id: 'd', grade: '2' }, { id: 'e', grade: '3' }];
const EN = ['a', 'b', 'c', 'd'].map((sid) => ({ term_id: 'T2', student_id: sid })).concat([{ term_id: 'T1', student_id: 'e' }]);
const BASE = () => [].concat(
  // a: 기숙사생(조식 실시·학사 석식), b: 비기숙(학사 석식), c: 이미 11/10 퇴실, d: 2학년, e: 다른 기간 등록
  ['a', 'b', 'c', 'd', 'e'].map((s) => CH(s, '학사', '입실', '2027-08-16')),
  [CH('a', '기숙사', '입실', '2027-08-16'), CH('a', '조식', '실시', '2027-08-16'), CH('a', '석식', '학사 석식', '2027-08-16'),
    CH('b', '석식', '학사 석식', '2027-08-16'), CH('c', '학사', '퇴실', '2027-11-10', { source: 'F6', requested_at: '2027-11-08T09:00:00' })]);
const MOVE = { effectiveDate: '2027-11-19', requestedAt: '2027-11-18T15:00:00', dinner: '중단' };
const OPTS = { today: '2027-11-18', batchId: 'B1' };
const batch = (rows, ids, opts) => plain(ctx.moveBatchPlan_(rows, ids, MOVE, Object.assign({}, OPTS, opts || {})));

test('moveBatchTargets_: 그 기간 등록·그 학년·그날 학사 입실 학생만(이미 퇴실·다른 학년·다른 기간 제외)', () => {
  assert.deepStrictEqual(plain(ctx.moveBatchTargets_(ST, EN, BASE(), 'T2', '3', '2027-11-19')), ['a', 'b']);
  assert.deepStrictEqual(plain(ctx.moveBatchTargets_(ST, EN, BASE(), 'T2', 3, '2027-11-19')), ['a', 'b'], '학년 숫자도');
  assert.deepStrictEqual(plain(ctx.moveBatchTargets_(ST, EN, BASE(), 'T2', '3', '2027-11-09')), ['a', 'b', 'c']);
  assert.throws(() => ctx.moveBatchTargets_(ST, EN, BASE(), 'T2', '3', '2027-11-31'), /yyyy-MM-dd/);
});

test('moveBatchPlan_: 학생마다 movePlan_과 같은 계획, 기숙사생은 학사 및 기숙사 퇴실(자동), 대표 행 memo = [일괄] batchId', () => {
  const r = batch(BASE(), ['a', 'b']);
  assert.deepStrictEqual(r.skipped, []);
  assert.deepStrictEqual(r.plans.map((p) => [p.studentId, p.type]), [['a', '학사 및 기숙사 퇴실'], ['b', '학사 퇴실']]);
  ['a', 'b'].forEach((sid, i) => {
    const one = plain(ctx.movePlan_(BASE(), sid, Object.assign({ type: r.plans[i].type }, MOVE), OPTS));
    const strip = (rows) => rows.map((x) => Object.assign({}, x, { memo: undefined }));
    assert.deepStrictEqual([strip(r.plans[i].rows), r.plans[i].toCancel, r.plans[i].toRestore, r.plans[i].warnings, r.plans[i].summary],
      [strip(one.rows), one.toCancel, one.toRestore, one.warnings, one.summary], sid);
    assert.strictEqual(r.plans[i].rows[0].memo, '[일괄] B1');
    assert.ok(r.plans[i].rows.slice(1).every((x) => x.memo === undefined), '연결 행에는 memo 없음');
  });
  // 급식 정리: a 조식 퇴실일 중단, 석식은 미실시 규칙(11/18 목 → 11/29 월), b 석식만
  assert.deepStrictEqual(r.plans[0].rows.map((x) => [x.item, x.value, x.effective_date]),
    [['학사', '퇴실', '2027-11-19'], ['기숙사', '퇴실', '2027-11-19'], ['조식', '미실시', '2027-11-19'], ['석식', '미실시', '2027-11-29']]);
});

test('moveBatchPlan_: 오류 학생(이미 퇴실·없는 학생)은 skipped로 빼고 나머지는 계획, 같은 id 두 번은 한 번, 순수(두 번 불러도 같은 결과)', () => {
  const r = batch(BASE(), ['a', 'c', 'a', 'zz', '']);
  assert.deepStrictEqual(r.plans.map((p) => p.studentId), ['a']);
  assert.deepStrictEqual(r.skipped, [{ studentId: 'c', reason: '11월 19일(금)에 학사 입실 상태가 아닙니다. 날짜나 학생을 확인해 주세요.' }, { studentId: 'zz', reason: '11월 19일(금)에 학사 입실 상태가 아닙니다. 날짜나 학생을 확인해 주세요.' }]);
  assert.deepStrictEqual(batch(BASE(), ['a', 'b']), batch(BASE(), ['a', 'b']));
  assert.throws(() => ctx.moveBatchPlan_(BASE(), ['a'], MOVE, { today: '2027-11-18' }), /batchId/);
  assert.throws(() => ctx.moveBatchPlan_(BASE(), ['a'], MOVE, { today: '2027-11-18', batchId: 'B 1' }), /batchId/);
  const bad = plain(ctx.moveBatchPlan_(BASE(), ['a', 'b'], { effectiveDate: '2027-11-19', requestedAt: '2027-11-18' }, OPTS));
  assert.deepStrictEqual([bad.plans.length, bad.skipped.length], [0, 2], '공통 입력이 틀리면 모두 skipped');
});

test('moveBatchPlan_ 일반 석식 선택: 모두에게 같은 석식 선택을 넘긴다', () => {
  const r = plain(ctx.moveBatchPlan_(BASE(), ['b'], Object.assign({}, MOVE, { dinner: '일반 석식' }), OPTS));
  assert.ok(r.plans[0].rows.some((x) => x.item === '석식' && x.value === '일반 석식'));
});

/** 계획을 시트에 쓴 것처럼(저장 흉내): 행에 id·student_id·requested_at, 연결 행은 linked_change_id, toCancel은 취소 */
function apply(rows, r, at) {
  let out = rows.map((x) => Object.assign({}, x));
  r.plans.forEach((p, k) => {
    const cancel = new Set(p.toCancel.map((c) => c.id));
    out = out.map((x) => cancel.has(x.id) ? Object.assign(x, { status: '취소', cancel_reason: '[자동] h' + k + ' 정리' }) : x);
    p.rows.forEach((x, i) => out.push(Object.assign({ id: i ? 'h' + k + 'r' + i : 'h' + k, student_id: p.studentId, status: '유효', requested_at: at, created_at: '2027-11-18T15:00:0' + k,
      linked_change_id: i ? 'h' + k : '' }, x)));
  });
  return out;
}

test('moveBatchUndoPlan_: [일괄] batchId 대표마다 moveUndoPlan_ — 되돌리면 모든 학생의 상태·급식이 퇴실 전과 같다, 다른 batch·취소된 대표는 빼고', () => {
  const before = BASE();
  const saved = apply(before, batch(before, ['a', 'b']), MOVE.requestedAt);
  assert.strictEqual(ctx.statusOn_(saved, 'a', '학사', '2027-11-20'), '퇴실');
  const u = plain(ctx.moveBatchUndoPlan_(saved, 'B1', { today: '2027-11-18' }));
  assert.deepStrictEqual(u.plans.map((p) => [p.studentId, p.headId]), [['a', 'h0'], ['b', 'h1']]);
  u.plans.forEach((p) => assert.deepStrictEqual(p, Object.assign({ studentId: p.studentId, headId: p.headId }, plain(ctx.moveUndoPlan_(saved, p.headId, { today: '2027-11-18' })))));
  const cancel = new Set([].concat(...u.plans.map((p) => p.toCancel.map((c) => c.id))));
  const undone = saved.map((x) => cancel.has(x.id) ? Object.assign({}, x, { status: '취소' }) : x);
  ['a', 'b'].forEach((sid) => ['학사', '기숙사', '조식', '석식'].forEach((it) => ['2027-11-19', '2027-11-29', '2027-12-10'].forEach((d) =>
    assert.strictEqual(ctx.statusOn_(undone, sid, it, d), ctx.statusOn_(before, sid, it, d), sid + it + d))));
  assert.deepStrictEqual(plain(ctx.moveBatchUndoPlan_(saved, 'B2', {})).plans, []);
  assert.deepStrictEqual(plain(ctx.moveBatchUndoPlan_(saved, '', {})).plans, []);
  const one = saved.map((x) => x.id === 'h0' ? Object.assign({}, x, { status: '취소' }) : x);
  assert.deepStrictEqual(plain(ctx.moveBatchUndoPlan_(one, 'B1', {})).plans.map((p) => p.studentId), ['b']);
  const other = saved.map((x) => x.id === 'h1' ? Object.assign({}, x, { memo: '[일괄] B10' }) : x);
  assert.deepStrictEqual(plain(ctx.moveBatchUndoPlan_(other, 'B1', {})).plans.map((p) => p.studentId), ['a'], 'B10은 B1이 아니다');
});

test('일괄 퇴실은 자진 퇴실: 재입실이 막힌다(결정 77①)', () => {
  const saved = apply(BASE(), batch(BASE(), ['b']), MOVE.requestedAt);
  const terms = [{ type: '학기', start_date: '2027-08-16', end_date: '2027-12-24' }, { type: '학기', start_date: '2028-03-02', end_date: '2028-07-14' },
    { type: '학기', start_date: '2028-08-16', end_date: '2028-12-24' }];
  assert.deepStrictEqual(plain(ctx.moveReentryBan_(saved, 'b', terms, '2027-12-01')), { banned: true, until: '2028-08-15', leaveDate: '2027-11-19', kind: '자진' });
});
