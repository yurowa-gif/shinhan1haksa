/** R11a MoveRules — 입퇴실 계획(movePlan_). 표 형식, 가짜 값만. 2027-03-01 월. */
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
let seq = 0;
const CH = (item, value, effective_date, extra) => Object.assign({ id: 'c' + (++seq), student_id: 's1', item, value, effective_date,
  status: '유효', requested_at: '', created_at: '', source: '명단업로드' }, extra || {});
// 학사생(기숙사 아님), 조식 실시·학사 석식
const HALL = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '학사 석식', '2027-03-01')];
const DORM = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '입실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '학사 석식', '2027-03-01')];
const plan = (rows, move, today) => plain(ctx.movePlan_(rows, 's1', move, { today: today || '2027-03-03' }));
const brief = (p) => p.rows.map((r) => [r.item, r.value, r.effective_date, r.source, r.head]);
// 계획을 저장한 결과(대표 행 id 'h', 연결·취소)
function apply(rows, p) {
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소' }) : r));
  p.rows.forEach((r, i) => out.push(CH(r.item, r.value, r.effective_date, { id: 'h' + (++seq) + '_' + i, requested_at: r.requested_at, source: r.source, created_at: String(seq) })));
  return out;
}
const at = (rows, item, d) => ctx.statusOn_(rows, 's1', item, d);

test('결정 35 예: 3/3(수) 15:00 신청·3/5 학사 퇴실 → 조식 3/5 미실시, 석식 3/15 미실시(F6), 3/4·3/5~3/14·3/15 값', () => {
  const rows = HALL();
  const p = plan(rows, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' });
  assert.deepStrictEqual(p.errors, []);
  assert.deepStrictEqual(brief(p), [['학사', '퇴실', '2027-03-05', 'F6', true], ['조식', '미실시', '2027-03-05', 'F6', false], ['석식', '미실시', '2027-03-15', 'F6', false]]);
  assert.deepStrictEqual(p.summary, { date: '2027-03-05', breakfast: { value: '미실시', from: '2027-03-05' }, dinner: { value: '미실시', from: '2027-03-15' } });
  const s = apply(rows, p);
  assert.deepStrictEqual([at(s, '학사', '2027-03-04'), at(s, '조식', '2027-03-04'), at(s, '석식', '2027-03-04')], ['입실', '실시', '학사 석식']);
  assert.deepStrictEqual([at(s, '학사', '2027-03-05'), at(s, '조식', '2027-03-05'), at(s, '석식', '2027-03-14')], ['퇴실', '미실시', '학사 석식']);
  assert.strictEqual(at(s, '석식', '2027-03-15'), '미실시');
});

table('석식 중단일: 월·화 신청 → 다음 주 월요일, 퇴실일이 더 늦으면 퇴실일', [
  ['2027-03-01T09:00:00', '2027-03-03', '2027-03-08'],
  ['2027-03-02T20:00:00', '2027-03-03', '2027-03-08'],
  ['2027-03-02T20:00:00', '2027-03-12', '2027-03-12']
], ([req, L, stop]) => {
  const p = plan(HALL(), { type: '학사 퇴실', effectiveDate: L, requestedAt: req }, '2027-03-03');
  assert.deepStrictEqual(p.rows.filter((r) => r.item === '석식').map((r) => r.effective_date), [stop]);
});

test("석식 '일반 석식으로': 일반 석식@max(11:30 규칙, 퇴실일), source F7·연결, 석식 미실시 행 없음", () => {
  const p = plan(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00', dinner: '일반 석식' });
  assert.deepStrictEqual(brief(p).filter((r) => r[0] === '석식'), [['석식', '일반 석식', '2027-03-05', 'F7', false]]);
  const q = plan(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-02', requestedAt: '2027-03-03T15:00:00', dinner: '일반 석식' });
  assert.deepStrictEqual(q.rows.filter((r) => r.item === '석식').map((r) => [r.effective_date, r.effective_date_auto]), [['2027-03-04', '2027-03-04']]);
});

test('퇴실 정리는 중단일 이상 학사생 값 대기 행을 취소한다(조식 퇴실일, 석식 결정 35 중단일)', () => {
  const rows = HALL().concat([CH('조식', '실시', '2027-03-20', { source: 'F7', requested_at: '2027-03-02T09:00:00' }),
    CH('석식', '학사 석식', '2027-03-20', { source: 'F7', requested_at: '2027-03-02T09:00:00' }), CH('석식', '학사 석식', '2027-03-10', { source: 'F7', requested_at: '2027-03-02T09:00:00' })]);
  rows[1].value = '퇴실';
  const p = plan(rows, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' });
  assert.deepStrictEqual(p.toCancel.map((c) => [rows.find((r) => r.id === c.id).effective_date, rows.find((r) => r.id === c.id).item]).sort(), [['2027-03-20', '석식'], ['2027-03-20', '조식']]);
  assert.ok(p.toCancel.every((c) => c.cancel_reason));
});

test('기숙사 입실 + 조식 → 조식 실시@입실일(15:00 신청이어도, PRD F7 표 2줄), source F7·rule 값은 입실일', () => {
  const rows = HALL();
  rows[2].value = '미실시';
  const p = plan(rows, { type: '기숙사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-03T15:00:00' });
  assert.deepStrictEqual(brief(p), [['기숙사', '입실', '2027-03-10', 'F6', true], ['조식', '실시', '2027-03-10', 'F7', false]]);
  assert.strictEqual(p.rows[1].effective_date_auto, '2027-03-10');
  assert.deepStrictEqual(brief(plan(rows, { type: '기숙사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-03T15:00:00', breakfastWithDorm: false })),
    [['기숙사', '입실', '2027-03-10', 'F6', true]]);
});

test('기숙사 퇴실 → 조식 미실시(미실시 규칙, 기본으로 켬 — 가정), 끄면 대표 행만, 이미 미실시면 급식 행 없음', () => {
  const p = plan(DORM(), { type: '기숙사 퇴실', effectiveDate: '2027-03-04', requestedAt: '2027-03-03T15:00:00' });
  assert.deepStrictEqual(brief(p), [['기숙사', '퇴실', '2027-03-04', 'F6', true], ['조식', '미실시', '2027-03-15', 'F7', false]]);
  assert.strictEqual(plan(DORM(), { type: '기숙사 퇴실', effectiveDate: '2027-03-04', requestedAt: '2027-03-03T15:00:00', breakfastStopWithDorm: false }).rows.length, 1);
  const off = DORM(); off[2].value = '미실시';
  assert.strictEqual(plan(off, { type: '기숙사 퇴실', effectiveDate: '2027-03-04', requestedAt: '2027-03-03T15:00:00' }).rows.length, 1);
});

test('학사 및 기숙사 퇴실 → 상태 행 2개(대표 + 연결) + 학사 퇴실과 같은 급식 정리', () => {
  const p = plan(DORM(), { type: '학사 및 기숙사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' });
  assert.deepStrictEqual(brief(p), [['학사', '퇴실', '2027-03-05', 'F6', true], ['기숙사', '퇴실', '2027-03-05', 'F6', false],
    ['조식', '미실시', '2027-03-05', 'F6', false], ['석식', '미실시', '2027-03-15', 'F6', false]]);
});

table('상태 검사: 이미 같은 상태·기숙사생의 학사만 퇴실·학사생 아닌 학생의 기숙사 입실 → errors, 쓸 행 없음', [
  ['학사 입실', HALL, /이미 학사 입실/],
  ['학사 퇴실', DORM, /학사 및 기숙사 퇴실/],
  ['기숙사 퇴실', HALL, /기숙사 입실 상태가 아닙니다/],
  ['학사 및 기숙사 퇴실', HALL, /기숙사 입실 상태가 아닙니다/],
  ['기숙사 입실', () => [CH('학사', '퇴실', '2027-03-01')], /학사생만/],
  ['기숙사 입실', DORM, /이미 기숙사 입실/],
  ['학사 퇴실', () => [CH('학사', '퇴실', '2027-03-01')], /학사 입실 상태가 아닙니다/],
  ['학사 입장', HALL, /유형이 아닙니다/]
], ([type, rows, re]) => {
  const p = plan(rows(), { type, effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' });
  assert.ok(p.errors.some((e) => re.test(e)), JSON.stringify(p.errors));
  assert.deepStrictEqual([p.rows, p.toCancel], [[], []]);
});

table('신청 일시는 날짜+시각 전체(followups R6-3), 오늘보다 미래면 오류', [
  ['', true], ['2027-03-03', true], ['2027-03-04T09:00:00', true], ['2027-03-03T15:00', false], ['2027-03-03 15:00:00', false]
], ([req, bad]) => {
  const p = plan(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: req });
  assert.strictEqual(p.errors.length > 0, bad);
  assert.strictEqual(p.rows.length === 0, bad);
});

test('적용일이 오늘보다 이르면 경고(지난 출석부·식수가 바뀜), today 없으면 Error', () => {
  assert.ok(plan(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-02', requestedAt: '2027-03-03T15:00:00' }).warnings.some((w) => /지난 출석부/.test(w)));
  assert.throws(() => ctx.movePlan_(HALL(), 's1', { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' }, {}), /today/);
});

test('회귀: 명단 행(requested_at 빈칸)과 같은 적용일이면 신청 일시가 있는 F6 퇴실이 이긴다', () => {
  const rows = [CH('학사', '입실', '2027-03-05'), CH('학사', '퇴실', '2027-03-05', { source: 'F6', requested_at: '2027-03-03T15:00:00' })];
  assert.strictEqual(at(rows, '학사', '2027-03-05'), '퇴실');
});

test('회귀: 명단 업로드 전 날짜의 F7 신청서는 superseded되지 않는다(명단 행은 신청 일시 빈칸)', () => {
  const rows = [CH('석식', '학사 석식', '2027-03-01')];
  const p = plain(ctx.mealPlanChange_(rows, 's1', '석식', '일반 석식', '2027-02-20T09:00:00', { today: '2027-03-03' }));
  assert.strictEqual(p.superseded, false);
});

test('학사생 값이 아니면 정리 행을 쓰지 않는다: 일반 석식·조식 미실시 학생의 학사 퇴실 → 대표 행만(일반 석식은 계속)', () => {
  const rows = [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '미실시', '2027-03-01'), CH('석식', '일반 석식', '2027-03-01')];
  const p = plan(rows, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' });
  assert.deepStrictEqual(brief(p), [['학사', '퇴실', '2027-03-05', 'F6', true]]);
  assert.strictEqual(at(apply(rows, p), '석식', '2027-03-20'), '일반 석식');
});

/* ───── R11b 재입실·퇴실 취소 ───── */

// 3/8(월) 10:00 학사 퇴실(3/10) 저장: 조식 미실시@3/10, 석식 미실시@3/15(F6, 대표에 연결), 취소 사유 '[자동] <대표> …'
function saveMove(rows, move, today) {
  const p = plan(rows, move, today);
  assert.deepStrictEqual(p.errors, []);
  const head = 'H' + (++seq);
  const out = rows.map((r) => {
    const c = p.toCancel.find((x) => x.id === r.id);
    return c ? Object.assign({}, r, { status: '취소', cancel_reason: /^\[자동\] /.test(c.cancel_reason) ? c.cancel_reason : '[자동] ' + head + ' ' + c.cancel_reason })
      : p.toRestore.some((x) => x.id === r.id) ? Object.assign({}, r, { status: '유효', cancel_reason: '' }) : r;
  });
  p.rows.forEach((r, i) => out.push(CH(r.item, r.value, r.effective_date, { id: i ? head + '_' + i : head, linked_change_id: i ? head : '',
    requested_at: r.requested_at, source: r.source, created_at: String(++seq) })));
  return { rows: out, head, p };
}
const LEAVE = { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' };

test('재입실(followups R6-1 재현): 3/8 퇴실(3/10) → 3/11 재입실 → 조식은 3/11부터 실시, 아직 오지 않은 석식 중단(3/15) 취소, 급식 행은 값이 같아도 쓴다', () => {
  const left = saveMove(HALL(), LEAVE, '2027-03-08');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-11', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11');
  assert.deepStrictEqual(brief(back.p), [['학사', '입실', '2027-03-11', 'F6', true], ['조식', '실시', '2027-03-11', 'F7', false], ['석식', '학사 석식', '2027-03-11', 'F7', false]]);
  const s = back.rows;
  assert.deepStrictEqual([at(s, '학사', '2027-03-10'), at(s, '조식', '2027-03-10'), at(s, '석식', '2027-03-10')], ['퇴실', '미실시', '학사 석식']);
  assert.deepStrictEqual(['2027-03-11', '2027-03-15', '2027-03-30'].map((d) => [at(s, '학사', d), at(s, '조식', d), at(s, '석식', d)]),
    [['입실', '실시', '학사 석식'], ['입실', '실시', '학사 석식'], ['입실', '실시', '학사 석식']]);
});

test('재입실: 석식 중단일이 이미 지났으면(중단일 < 재입실일) 학사 석식을 재입실일부터 다시, meals를 주면 그 값', () => {
  const left = saveMove(HALL(), LEAVE, '2027-03-08');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-20', requestedAt: '2027-03-19T09:00:00' }, '2027-03-19');
  assert.deepStrictEqual(brief(back.p).slice(1), [['조식', '실시', '2027-03-20', 'F7', false], ['석식', '학사 석식', '2027-03-20', 'F7', false]]);
  assert.strictEqual(at(back.rows, '석식', '2027-03-17'), '미실시');
  const chosen = plan(left.rows, { type: '학사 입실', effectiveDate: '2027-03-20', requestedAt: '2027-03-19T09:00:00', meals: { '조식': '미실시', '석식': '일반 석식' } }, '2027-03-19');
  assert.deepStrictEqual(brief(chosen).slice(1), [['조식', '미실시', '2027-03-20', 'F7', false], ['석식', '일반 석식', '2027-03-20', 'F7', false]]);
});

test('학기 중 신규 학생의 학사 입실(직전 퇴실 없음): meals가 없으면 대표 행만, 있으면 입실일부터', () => {
  const rows = [CH('학사', '퇴실', '2027-03-01'), CH('조식', '미실시', '2027-03-01'), CH('석식', '미실시', '2027-03-01')];
  assert.deepStrictEqual(brief(plan(rows, { type: '학사 입실', effectiveDate: '2027-03-15', requestedAt: '2027-03-12T15:00:00' }, '2027-03-12')), [['학사', '입실', '2027-03-15', 'F6', true]]);
  assert.deepStrictEqual(brief(plan(rows, { type: '학사 입실', effectiveDate: '2027-03-15', requestedAt: '2027-03-12T15:00:00', meals: { '조식': '실시', '석식': '학사 석식' } }, '2027-03-12')).slice(1),
    [['조식', '실시', '2027-03-15', 'F7', false], ['석식', '학사 석식', '2027-03-15', 'F7', false]]);
});

const undo = (rows, head, today) => plain(ctx.moveUndoPlan_(rows, head, { today: today || '2027-03-09' }));
function applyUndo(rows, u) {   // 저장 흉내: 규칙이 준 cancel_reason은 그대로, 없으면 '[자동] <대표> 퇴실 취소'
  const why = (id) => (u.toCancel.find((c) => c.id === id) || {}).cancel_reason;
  return rows.map((r) => (u.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소', cancel_reason: why(r.id) || '[자동] undo 퇴실 취소' })
    : u.toRestore.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '유효', cancel_reason: '' }) : r));
}

test('퇴실 취소: 대표·연결 행 취소 + 퇴실로 [자동] 취소된 행 되살림 → 퇴실 전과 같은 값', () => {
  const base = HALL().concat([CH('석식', '학사 석식', '2027-03-20', { source: 'F7', requested_at: '2027-03-02T09:00:00' })]);
  const left = saveMove(base, LEAVE, '2027-03-08');
  assert.strictEqual(left.p.toCancel.length, 1);
  const u = undo(left.rows, left.head);
  assert.deepStrictEqual(u.toCancel.map((c) => c.id).sort(), [left.head, left.head + '_1', left.head + '_2'].sort());
  assert.deepStrictEqual(u.toRestore.map((c) => c.id), [left.p.toCancel[0].id]);
  const s = applyUndo(left.rows, u);
  for (const d of ['2027-03-10', '2027-03-15', '2027-03-25']) assert.deepStrictEqual([at(s, '학사', d), at(s, '조식', d), at(s, '석식', d)], ['입실', '실시', '학사 석식'], d);
});

test('퇴실 취소: 더 새 신청에 덮이는 행은 되살리지 않고 경고(꼬리표는 cancel_reason만, memo는 찾지 않는다 — 결정 41)', () => {
  const base = HALL().concat([CH('조식', '실시', '2027-03-20', { source: 'F7', requested_at: '2027-03-02T09:00:00' })]);
  base[2].value = '미실시';
  const left = saveMove(base, LEAVE, '2027-03-08');
  const cancelledId = left.p.toCancel[0].id;
  const memoOnly = left.rows.map((r) => (r.id === cancelledId ? Object.assign({}, r, { cancel_reason: '', memo: '메모 [자동] ' + left.head }) : r));
  assert.deepStrictEqual(undo(memoOnly, left.head).toRestore, []);
  // 더 새 신청(3/9 신청, 3/12 미실시)을 넣는다
  const rows = left.rows.concat([CH('조식', '미실시', '2027-03-12', { source: 'F7', requested_at: '2027-03-09T09:00:00' })]);
  let u = undo(rows, left.head);
  assert.deepStrictEqual([u.toRestore, u.warnings.length > 0], [[], true]);
  u = undo(rows.slice(0, -1), left.head);
  assert.deepStrictEqual(u.toRestore.map((c) => c.id), [cancelledId]);
});

test('퇴실 취소: 급식 신청의 followUps로 쓴 퇴실 정리 행(연결 아님)도 그 퇴실의 중단일이면 취소', () => {
  const left = saveMove([CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('석식', '미실시', '2027-03-01')], LEAVE, '2027-03-08');
  const f = plain(ctx.mealPlanChange_(left.rows, 's1', '석식', '학사 석식', '2027-03-05T09:00:00', { today: '2027-03-09' }));
  assert.deepStrictEqual(f.followUps.map((x) => x.effective_date), ['2027-03-15']);
  const rows = left.rows.concat([CH('석식', '학사 석식', f.date, { source: 'F7', requested_at: '2027-03-05T09:00:00' }),
    CH('석식', '미실시', '2027-03-15', { id: 'fu', source: 'F6', requested_at: '2027-03-05T09:00:00' })]);
  const u = undo(rows, left.head);
  assert.ok(u.toCancel.some((c) => c.id === 'fu'));
  assert.strictEqual(at(applyUndo(rows, u), '석식', '2027-03-20'), '학사 석식');
});

test('퇴실 취소: 없는·이미 취소된 대표는 경고만, 지난 적용일은 경고', () => {
  const none = undo(HALL(), 'nope');
  assert.deepStrictEqual([none.toCancel, none.toRestore, none.warnings.length], [[], [], 1]);
  const gone = HALL().concat([CH('학사', '퇴실', '2027-03-10', { id: 'dead', source: 'F6', status: '취소', requested_at: '2027-03-08T10:00:00' })]);
  const g = undo(gone, 'dead');
  assert.deepStrictEqual([g.toCancel, g.toRestore], [[], []]);
  assert.ok(/이미 취소/.test(g.warnings[0]));
  const left = saveMove(HALL(), LEAVE, '2027-03-08');
  assert.ok(undo(left.rows, left.head, '2027-03-12').warnings.some((w) => /지났습니다/.test(w)));
});

test('M45: 퇴실 → 재입실 → 두 번째 퇴실을 늦게 입력 — 퇴실 중인 날은 가장 늦은 퇴실 행으로 막힘·중단일', () => {
  let s = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T10:00:00' }, '2027-03-03').rows;
  s = saveMove(s, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T10:00:00' }, '2027-03-09').rows;
  s = saveMove(s, { type: '학사 퇴실', effectiveDate: '2027-03-20', requestedAt: '2027-03-22T10:00:00' }, '2027-03-22').rows;   // 늦게 입력
  s = s.map((r) => (r.item === '석식' && r.status === '유효' && r.source === 'F6' ? Object.assign({}, r, { status: '취소' }) : r));
  // 두 번째 퇴실 기록(3/22 월)보다 먼저 쓴 학사 석식 신청(3/21) → 막히지 않고 중단일 = 3/29(두 번째 퇴실 기준)
  const p = plain(ctx.mealPlanChange_(s, 's1', '석식', '학사 석식', '2027-03-21T09:00:00', { today: '2027-03-23' }));
  assert.strictEqual(p.blocked, '');
  assert.deepStrictEqual(p.followUps.map((f) => f.effective_date), ['2027-03-29']);
});

test('퇴실 취소: 중단일이 아닌 연결 행(일반 석식 F7)도 취소', () => {
  const left = saveMove(HALL(), Object.assign({ dinner: '일반 석식' }, LEAVE), '2027-03-08');
  const general = left.rows.find((r) => r.linked_change_id === left.head && r.item === '석식');
  assert.strictEqual(general.value, '일반 석식');
  assert.ok(undo(left.rows, left.head).toCancel.some((c) => c.id === general.id));
});

test('퇴실 취소: 남은 다른 학사 퇴실이 같은 날을 석식 중단일로 쓰면 그 정리 행은 둔다', () => {
  // A: 3/9 퇴실을 3/3(수)에 입력 → 석식 3/15. B: 3/5 퇴실(3/4 목 입력) → 석식 중단일도 3/15(A의 행이 이미 있음).
  // movePlan_은 이제 A 뒤에 B를 막으므로(이후 입퇴실 기록) B는 직접 쓴 행으로 만든다(손으로 고친 시트 등에서도 지켜야 하는 규칙)
  const a = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-09', requestedAt: '2027-03-03T10:00:00' }, '2027-03-03');
  const f6b = { source: 'F6', requested_at: '2027-03-04T10:00:00' };
  const b = { head: 'HB', rows: a.rows.concat([CH('학사', '퇴실', '2027-03-05', Object.assign({ id: 'HB' }, f6b)),
    CH('조식', '미실시', '2027-03-05', Object.assign({ linked_change_id: 'HB' }, f6b))]) };
  assert.ok(plan(a.rows, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T10:00:00' }, '2027-03-04').errors.length > 0);
  const aDinner = b.rows.find((r) => r.linked_change_id === a.head && r.item === '석식');
  assert.strictEqual(aDinner.effective_date, '2027-03-15');
  const u = undo(b.rows, b.head, '2027-03-04');
  assert.ok(!u.toCancel.some((c) => c.id === aDinner.id));
  assert.strictEqual(at(applyUndo(b.rows, u), '석식', '2027-03-15'), '미실시');
});

/* ───── 총괄 검토(#55) ───── */

// F7 신청 저장 흉내: 취소 사유 '[자동] <새 행 id> 새 신청으로 대체'(C17a). superseded 신청서는 '취소' 행으로(결정 58)
function saveReq(rows, item, to, at, today, effectiveDate) {
  const p = plain(ctx.mealPlanChange_(rows, 's1', item, to, at, { today, effectiveDate }));
  if (p.blocked) return rows;
  const id = 'q' + (++seq);
  if (p.superseded) return rows.concat([CH(item, to, effectiveDate || p.autoDate, { id, source: 'F7', requested_at: at, created_at: String(++seq), status: '취소', cancel_reason: '[자동] ' + p.supersededBy[0] + ' 더 새 신청' })]);
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소', cancel_reason: '[자동] ' + id + ' 새 신청으로 대체' }) : r));
  out.push(CH(item, to, p.date, { id, source: 'F7', requested_at: at, created_at: String(++seq) }));
  p.followUps.forEach((f) => out.push(CH(f.item, f.value, f.effective_date, { source: f.source, requested_at: at, created_at: String(++seq) })));
  return out;
}
function saveLeaveP(rows, move, today) {   // movePlan_ 저장(되살림 포함). 사유: 규칙이 준 '[자동] …'은 그대로, 아니면 '[자동] <대표> 사유'
  const p = plan(rows, move, today);
  assert.deepStrictEqual(p.errors, []);
  const head = 'L' + (++seq);
  const why = (id) => { const c = p.toCancel.find((x) => x.id === id); return /^\[자동\] /.test(c.cancel_reason) ? c.cancel_reason : '[자동] ' + head + ' ' + c.cancel_reason; };
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소', cancel_reason: why(r.id) })
    : p.toRestore.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '유효', cancel_reason: '' }) : r));
  p.rows.forEach((r, i) => out.push(CH(r.item, r.value, r.effective_date, { id: i ? head + '_' + i : head, linked_change_id: i ? head : '', requested_at: r.requested_at, source: r.source, created_at: String(++seq) })));
  return out;
}

table("'일반 석식으로'를 골라도 학사 석식 정리는 늘 한다(재현 E·F: 일반 석식 신청이 쓰이지 않아도 4/30에 학사 석식으로 남지 않음)", [
  ['E', [], '2027-03-03'],
  ['F', [CH('석식', '학사 석식', '2027-03-11', { source: 'F7', requested_at: '2027-03-11T09:00:00' })], '2027-03-12']
], ([, extra, today]) => {
  const rows = [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('석식', '미실시', '2027-03-01'),
    CH('석식', '학사 석식', '2027-03-02', { source: 'F7', requested_at: '2027-03-02T09:00:00' })].concat(extra);
  const s = saveLeaveP(rows, { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-01T09:00:00', dinner: '일반 석식' }, today);
  assert.notStrictEqual(at(s, '석식', '2027-04-30'), '학사 석식');
});

test('summary는 급식 행을 쓴 항목만 채운다(일반 석식 학생·미실시 대기 학생의 석식은 null)', () => {
  const general = [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '일반 석식', '2027-03-01')];
  const LEAVE = { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' };
  assert.deepStrictEqual(plan(general, LEAVE, '2027-03-08').summary, { date: '2027-03-10', breakfast: { value: '미실시', from: '2027-03-10' }, dinner: null });
  const pending = HALL().concat([CH('석식', '미실시', '2027-03-12', { source: 'F7', requested_at: '2027-03-01T09:00:00' })]);
  assert.strictEqual(plan(pending, LEAVE, '2027-03-08').summary.dinner, null);
});

test('기숙사 입실 적용일이 신청일보다 이르면(늦게 입력) 조식은 입실일부터(entry_date, Error 아님)', () => {
  const rows = HALL(); rows[2].value = '미실시';
  const p = plan(rows, { type: '기숙사 입실', effectiveDate: '2027-03-02', requestedAt: '2027-03-03T15:00:00' }, '2027-03-03');
  assert.deepStrictEqual(brief(p), [['기숙사', '입실', '2027-03-02', 'F6', true], ['조식', '실시', '2027-03-02', 'F7', false]]);
});

test('기숙사 퇴실 조식 미실시는 기숙사 퇴실일보다 이르지 않다(3/20 퇴실, 3/1 신청 → 미실시 규칙 3/8이지만 3/20)', () => {
  const p = plan(DORM(), { type: '기숙사 퇴실', effectiveDate: '2027-03-20', requestedAt: '2027-03-01T09:00:00' }, '2027-03-01');
  assert.deepStrictEqual(brief(p).slice(1), [['조식', '미실시', '2027-03-20', 'F7', false]]);
});

test('적용일 뒤에 입퇴실 기록이 있으면 오류(재현 G: 3/20 학사 퇴실이 잡힌 학생의 3/10 기숙사 입실)', () => {
  const rows = HALL().concat([CH('학사', '퇴실', '2027-03-20', { source: 'F6', requested_at: '2027-03-02T10:00:00' })]);
  const p = plan(rows, { type: '기숙사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-03T15:00:00' });
  assert.ok(p.errors.some((e) => /이후 날짜에 입퇴실 기록/.test(e)));
  assert.deepStrictEqual(p.rows, []);
});

test('C16 후속: 명단 초기 행(명단업로드)은 "대기 중인 신청 — 직접 취소" 경고에 넣지 않는다', () => {
  const rows = [CH('조식', '실시', '2027-03-10')];   // 기간 시작 3/10 명단 초기값
  const p = plain(ctx.mealPlanChange_(rows, 's1', '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03' }));
  assert.ok(!p.warnings.some((w) => /대기 중인 신청/.test(w)), JSON.stringify(p.warnings));
});

/* ───── 총괄 검토(#57) ───── */

test('퇴실만 되돌린다: 입실(재입실) 대표를 취소하려 하면 경고와 빈 계획(잘못 넣은 입실은 새 퇴실로 바로잡는다)', () => {
  const left = saveMove(HALL(), LEAVE, '2027-03-08');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-11', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11');
  const u = undo(back.rows, back.head, '2027-03-11');
  assert.deepStrictEqual([u.toCancel, u.toRestore], [[], []]);
  assert.ok(/퇴실 기록만/.test(u.warnings[0]));
});

test('같은 날 재입실(입실일 = 퇴실일)도 그 퇴실의 재입실: 급식이 퇴실 전 값으로 다시 이어진다', () => {
  const left = saveMove(HALL(), LEAVE, '2027-03-08');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T09:00:00' }, '2027-03-09');
  assert.deepStrictEqual(['2027-03-10', '2027-03-20'].map((d) => [at(back.rows, '학사', d), at(back.rows, '조식', d), at(back.rows, '석식', d)]),
    [['입실', '실시', '학사 석식'], ['입실', '실시', '학사 석식']]);
});

test('재입실일 뒤에 기록된 학사 퇴실이 있으면 오류(그 퇴실의 정리 행까지 건드리지 않게 — 먼저 취소)', () => {
  const rows = [CH('학사', '입실', '2027-03-01'), CH('학사', '퇴실', '2027-03-05', { source: 'F6', requested_at: '2027-03-03T10:00:00' }),
    CH('학사', '퇴실', '2027-03-20', { source: 'F6', requested_at: '2027-03-18T10:00:00' })];
  const p = plan(rows, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-19T09:00:00' }, '2027-03-19');
  assert.ok(p.errors.some((e) => /이후 날짜에 입퇴실 기록/.test(e)));
});

test('재입실 급식은 재입실일 값만 정한다: 퇴실 기록 전에 학생이 낸 대기 신청(F7)은 취소하지 않는다(총괄 결정)', () => {
  // 3/2 신청 조식 미실시(3/8 적용 → 대기 3/25로 고침), 3/8 퇴실 입력(퇴실 3/10), 3/12 재입실 → 조식 3/12 실시, 3/25부터 미실시(학생 신청 그대로)
  const base = HALL().concat([CH('조식', '미실시', '2027-03-25', { source: 'F7', requested_at: '2027-03-02T09:00:00' })]);
  const left = saveMove(base, LEAVE, '2027-03-08');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-12', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11');
  assert.deepStrictEqual([at(back.rows, '조식', '2027-03-12'), at(back.rows, '조식', '2027-03-25')], ['실시', '미실시']);
  // 퇴실 기록 뒤(3/9)에 낸 다른 값 대기 신청은 재입실이 덮는다
  const later = left.rows.concat([CH('조식', '미실시', '2027-03-22', { source: 'F7', requested_at: '2027-03-09T09:00:00' })]);
  const back2 = saveMove(later, { type: '학사 입실', effectiveDate: '2027-03-12', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11');
  // 3/22 신청(퇴실 기록 뒤)은 재입실이 취소하고, 3/25 학생 신청(퇴실 전)은 남는다
  assert.deepStrictEqual(['2027-03-22', '2027-03-24', '2027-03-25'].map((d) => at(back2.rows, '조식', d)), ['실시', '실시', '미실시']);
});

test('재입실은 퇴실과 함께 고른 일반 석식(연결 F7, 재입실일 이후)을 취소하고, 그것이 취소했던 학생 신청을 되살린다', () => {
  const base = HALL().concat([CH('석식', '미실시', '2027-03-29', { source: 'F7', requested_at: '2027-03-02T09:00:00' })]);
  const left = saveMove(base, { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00', dinner: '일반 석식' }, '2027-03-08');
  // 같은 날 재입실(3/10): 일반 석식(3/10, 퇴실일 하한)은 재입실일 이후라 뜻이 없어진다
  const p = plan(left.rows, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T09:00:00' }, '2027-03-09');
  assert.deepStrictEqual(p.errors, []);
  const general = left.rows.find((r) => r.linked_change_id === left.head && r.value === '일반 석식');
  assert.ok(p.toCancel.some((c) => c.id === general.id));
  assert.ok(p.toRestore.some((c) => base.some((b) => b.id === c.id && b.effective_date === '2027-03-29')));
});

/* ───── 총괄 2차 검토(#55) ───── */

const perms = (a) => (a.length <= 1 ? [a] : [].concat(...a.map((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map((p) => [x].concat(p)))));
// 사건 묶음의 모든 입력 순서가 같은 날별 석식 값이 되는지(결정 55·58)
function allOrders(base, events, days, want) {
  for (const order of perms(Object.keys(events))) {
    const s = order.reduce((r, k) => events[k](r), base());
    assert.deepStrictEqual(days.map((d) => at(s, '석식', d)), want, '순서 ' + order.join(''));
  }
}
const NOHALL = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '미실시', '2027-03-01'), CH('석식', '미실시', '2027-03-01')];
const LEAVE_34 = (r) => saveLeaveP(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T10:00:00' }, '2027-03-04');

test('결정 58: superseded 신청서도 취소 행으로 저장 → A(일반 석식 3/22)·B(학사 석식 3/16)·Z(미실시 3/25, 더 이전)·L 24순서 모두 같은 값(되살린 행끼리도 덮임)', () => {
  allOrders(NOHALL, {
    A: (r) => saveReq(r, '석식', '일반 석식', '2027-03-03T09:00:00', '2027-03-04', '2027-03-22'),
    B: (r) => saveReq(r, '석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-04', '2027-03-16'),
    Z: (r) => saveReq(r, '석식', '미실시', '2027-03-02T09:00:00', '2027-03-04', '2027-03-25'),
    L: LEAVE_34
  }, ['2027-03-10', '2027-03-16', '2027-03-22', '2027-03-25', '2027-04-30'], ['미실시', '미실시', '일반 석식', '일반 석식', '일반 석식']);
});

test('결정 58: 더 새 살아 있는 신청(C 미실시 3/20, 신청 3/4 09:30)이 있으면 되살리지 않는다 — A·B·C·L 24순서, 3/22 미실시', () => {
  allOrders(NOHALL, {
    A: (r) => saveReq(r, '석식', '일반 석식', '2027-03-03T09:00:00', '2027-03-04', '2027-03-22'),
    B: (r) => saveReq(r, '석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-04', '2027-03-16'),
    C: (r) => saveReq(r, '석식', '미실시', '2027-03-04T09:30:00', '2027-03-04', '2027-03-20'),
    L: LEAVE_34
  }, ['2027-03-10', '2027-03-16', '2027-03-22', '2027-04-30'], ['미실시', '미실시', '미실시', '미실시']);
});

test('결정 58: 되살릴 superseded 신청서가 학사 석식이고 중단일 이후면 되살리지 않는다 — A(학사 석식 3/22)·B·L 6순서, 4/30 미실시', () => {
  allOrders(NOHALL, {
    A: (r) => saveReq(r, '석식', '학사 석식', '2027-03-03T09:00:00', '2027-03-04', '2027-03-22'),
    B: (r) => saveReq(r, '석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-04', '2027-03-16'),
    L: LEAVE_34
  }, ['2027-03-10', '2027-03-16', '2027-03-22', '2027-04-30'], ['미실시', '미실시', '미실시', '미실시']);
});

test('늦게 입력한 퇴실(3/5, 기록 3/3 15:00)보다 뒤에 신청한 학사 석식(3/8 09:00)은 입력 순서와 상관없이 퇴실일~중단일에도 없음', () => {
  allOrders(NOHALL, {
    X: (r) => saveReq(r, '석식', '학사 석식', '2027-03-08T09:00:00', '2027-03-08'),
    L: (r) => saveLeaveP(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' }, '2027-03-08')
  }, ['2027-03-08', '2027-03-14', '2027-03-15', '2027-04-30'], ['미실시', '미실시', '미실시', '미실시']);
});

test("'일반 석식으로': 퇴실 전에 신청한 학사 석식(일반 석식 신청이 취소)·퇴실 뒤에 신청한 학사 석식(정리가 취소) 모두 취소, '덮습니다' 경고 없음, 4/30 일반 석식", () => {
  // x20: 퇴실 기록보다 뒤에 신청 → 일반 석식 신청은 취소하지 않고 "덮습니다" 경고를 내지만 정리가 취소한다
  const rows = HALL().concat([CH('석식', '학사 석식', '2027-03-12', { id: 'x12', source: 'F7', requested_at: '2027-03-03T09:00:00' }),
    CH('석식', '학사 석식', '2027-03-20', { id: 'x20', source: 'F7', requested_at: '2027-03-04T09:00:00' })]);
  const move = { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00', dinner: '일반 석식' };
  const p = plan(rows, move, '2027-03-04');
  assert.deepStrictEqual(['x12', 'x20'].map((id) => p.toCancel.some((c) => c.id === id)), [true, true], JSON.stringify(p.toCancel));
  assert.ok(!p.warnings.some((w) => /덮습니다/.test(w)), JSON.stringify(p.warnings));   // 이 계획이 취소하는 행을 가리키는 경고는 없다
  assert.strictEqual(at(saveLeaveP(rows, move, '2027-03-04'), '석식', '2027-04-30'), '일반 석식');
});

test('첫 급식 기록일(3/5)에 퇴실하면 조식은 빈 값이 아니라 미실시(정리 전 학사생 값), summary도', () => {
  const rows = [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-05'), CH('석식', '미실시', '2027-03-05')];
  const move = { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' };
  assert.deepStrictEqual(plan(rows, move).summary.breakfast, { value: '미실시', from: '2027-03-05' });
  assert.strictEqual(at(saveLeaveP(rows, move, '2027-03-03'), '조식', '2027-03-05'), '미실시');
});

test("기숙사 입실 조식(entry_date)은 고친 날이 아니라 '고친 적용일' 경고가 없다(쓸 때·안 쓸 때 모두)", () => {
  const move = { type: '기숙사 입실', effectiveDate: '2027-03-02', requestedAt: '2027-03-03T15:00:00' };
  const off = HALL(); off[2].value = '미실시';
  for (const rows of [HALL(), off]) assert.ok(!plan(rows, move).warnings.some((w) => /고친 적용일/.test(w)), JSON.stringify(plan(rows, move).warnings));
});

test("되살림 꼬리표는 id 전체로 맞춘다('[자동] q12 …'는 q1의 꼬리표가 아니다)", () => {
  const rows = NOHALL().concat([CH('석식', '학사 석식', '2027-03-16', { id: 'q1', source: 'F7', requested_at: '2027-03-04T09:00:00' }),
    CH('석식', '일반 석식', '2027-03-22', { id: 'y', source: 'F7', requested_at: '2027-03-03T09:00:00', status: '취소', cancel_reason: '[자동] q12 더 새 신청' })]);
  const p = plan(rows, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T10:00:00' }, '2027-03-04');
  assert.deepStrictEqual([p.toCancel.map((c) => c.id), p.toRestore], [['q1'], []]);
});

/* ───── 총괄 2차 검토(#57) ───── */

test('재입실 뒤 두 번째 퇴실도 본다: 퇴실 3/20 → 재입실 3/25 → 퇴실 4/5, 3/10 학사 석식 신청 → 3/20 미실시·3/25 학사 석식·4/5 미실시(결정 35)', () => {
  const l1 = saveMove(NOHALL(), { type: '학사 퇴실', effectiveDate: '2027-03-20', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08');
  const re = saveMove(l1.rows, { type: '학사 입실', effectiveDate: '2027-03-25', requestedAt: '2027-03-09T09:00:00' }, '2027-03-09');
  const l2 = saveMove(re.rows, { type: '학사 퇴실', effectiveDate: '2027-04-05', requestedAt: '2027-03-09T12:00:00' }, '2027-03-09');
  const p = plain(ctx.mealPlanChange_(l2.rows, 's1', '석식', '학사 석식', '2027-03-10T09:00:00', { today: '2027-03-10' }));
  assert.deepStrictEqual(p.followUps.map((f) => [f.value, f.effective_date, f.source]),
    [['미실시', '2027-03-20', 'F6'], ['학사 석식', '2027-03-25', 'F7'], ['미실시', '2027-04-05', 'F6']]);
  const s = saveReq(l2.rows, '석식', '학사 석식', '2027-03-10T09:00:00', '2027-03-10');
  assert.deepStrictEqual(['2027-03-15', '2027-03-20', '2027-03-25', '2027-04-05', '2027-04-12', '2027-04-30'].map((d) => at(s, '석식', d)),
    ['학사 석식', '미실시', '학사 석식', '미실시', '미실시', '미실시']);
});

test('같은 날 재입실의 신청 일시가 퇴실보다 이르면 오류(학사 상태가 바뀌지 않는데 정리만 취소되지 않게)', () => {
  const left = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T12:00:00' }, '2027-03-09');
  const p = plan(left.rows, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T10:00:00' }, '2027-03-09');
  assert.ok(p.errors.some((e) => /같은 날\(2027-03-10\) 기록보다 신청 일시가 이릅니다/.test(e)), JSON.stringify(p.errors));
  assert.deepStrictEqual([p.rows, p.toCancel, p.toRestore], [[], [], []]);
});

test('결정 59: 재입실이 있는 퇴실을 취소하면 재입실과 그 연결 행도 함께 취소(경고) → 고친 퇴실(3/11)을 다시 넣을 수 있다', () => {
  const left = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-15', requestedAt: '2027-03-09T10:00:00' }, '2027-03-09');
  const blocked = plan(back.rows, { type: '학사 퇴실', effectiveDate: '2027-03-11', requestedAt: '2027-03-09T11:00:00' }, '2027-03-09');
  assert.ok(blocked.errors.some((e) => /2027-03-15 학사 입실.*\[퇴실 취소\].*재입실도 함께/.test(e)), JSON.stringify(blocked.errors));
  const u = undo(back.rows, left.head);
  assert.ok(u.toCancel.some((c) => c.id === back.head) && back.rows.filter((r) => r.linked_change_id === back.head).every((r) => u.toCancel.some((c) => c.id === r.id)));
  assert.ok(u.warnings.some((w) => w === '재입실 기록(2027-03-15)도 함께 취소됩니다'), JSON.stringify(u.warnings));
  const s = applyUndo(back.rows, u);
  for (const d of ['2027-03-10', '2027-03-15', '2027-03-30']) assert.deepStrictEqual([at(s, '학사', d), at(s, '조식', d), at(s, '석식', d)], ['입실', '실시', '학사 석식'], d);
  assert.deepStrictEqual(plan(s, { type: '학사 퇴실', effectiveDate: '2027-03-11', requestedAt: '2027-03-09T11:00:00' }, '2027-03-09').errors, []);
});

test("'일반 석식으로' 퇴실을 취소하면 그 일반 석식에 가려졌던 늦은 신청서(결정 58 취소 행)가 돌아온다", () => {
  const left = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00', dinner: '일반 석식' }, '2027-03-08');
  const late = saveReq(left.rows, '석식', '미실시', '2027-03-07T09:00:00', '2027-03-09', '2027-03-12');   // 일반 석식(3/10, 신청 3/8)에 가려짐
  const row = late.find((r) => r.requested_at === '2027-03-07T09:00:00');
  assert.strictEqual(row.status, '취소');
  const s = applyUndo(late, undo(late, left.head));
  assert.deepStrictEqual(['2027-03-11', '2027-03-12', '2027-03-30'].map((d) => at(s, '석식', d)), ['학사 석식', '미실시', '미실시']);
});

test('퇴실 취소: 같은 값의 더 새 신청만 있으면 덮인 것이 아니라 되살린다', () => {
  const base = HALL().concat([CH('석식', '미실시', '2027-03-20', { id: 'z', source: 'F7', requested_at: '2027-03-02T09:00:00' })]);
  const left = saveMove(base, { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00', dinner: '일반 석식' }, '2027-03-08');
  assert.strictEqual(left.rows.find((r) => r.id === 'z').status, '취소');   // 일반 석식 신청이 취소
  const rows = left.rows.concat([CH('석식', '미실시', '2027-03-15', { source: 'F7', requested_at: '2027-03-09T09:00:00' })]);
  assert.ok(undo(rows, left.head).toRestore.some((c) => c.id === 'z'));
});

test('퇴실 취소가 되살린 신청이 다시 취소한 행은 그 신청 id 꼬리표 → 같은 퇴실을 다시 넣으면 한 번 넣은 것과 같다', () => {
  const B = (r) => saveReq(r, '석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-04', '2027-03-16');
  const A = (r) => saveReq(r, '석식', '일반 석식', '2027-03-03T09:00:00', '2027-03-04', '2027-03-22');
  const L = (r) => saveMove(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T10:00:00' }, '2027-03-04');
  const l1 = L(B(NOHALL()));
  const a = A(l1.rows);                                 // B가 끊긴 동안 들어온 A는 살아 있다
  const u = undo(a, l1.head);                           // B가 돌아오며 A를 다시 취소(꼬리표 B)
  const again = L(applyUndo(a, u)).rows;
  const once = L(A(B(NOHALL()))).rows;
  const days = ['2027-03-10', '2027-03-16', '2027-03-22', '2027-04-30'];
  assert.deepStrictEqual(days.map((d) => at(again, '석식', d)), days.map((d) => at(once, '석식', d)));
  assert.strictEqual(at(again, '석식', '2027-03-22'), '일반 석식');
});

/* ───── 총괄 3차 검토(#55) ───── */

test('B: 늦게 입력한 퇴실의 일반 석식은 이 정리가 취소할 퇴실 뒤 학사 석식에 밀리지 않는다 — H·L 두 순서 모두 3/4부터 일반 석식', () => {
  allOrders(NOHALL, {
    H: (r) => saveReq(r, '석식', '학사 석식', '2027-03-03T15:15:00', '2027-03-06'),
    L: (r) => saveLeaveP(r, { type: '학사 퇴실', effectiveDate: '2027-03-04', requestedAt: '2027-03-02T11:00:00', dinner: '일반 석식' }, '2027-03-06')
  }, ['2027-03-04', '2027-03-10', '2027-04-30'], ['일반 석식', '일반 석식', '일반 석식']);
});

test('A: 되살림도 퇴실 뒤 학사 석식 규칙을 따른다 — P·Q(퇴실 기록 뒤 학사 석식)·L 6순서 모두 일반 석식', () => {
  const base = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '미실시', '2027-03-01'), CH('석식', '일반 석식', '2027-03-01')];
  allOrders(base, {
    P: (r) => saveReq(r, '석식', '학사 석식', '2027-03-06T09:00:00', '2027-03-06'),
    Q: (r) => saveReq(r, '석식', '학사 석식', '2027-03-06T10:00:00', '2027-03-06'),
    L: (r) => saveLeaveP(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-03T15:00:00' }, '2027-03-06')
  }, ['2027-03-06', '2027-03-14', '2027-03-15', '2027-04-30'], ['일반 석식', '일반 석식', '일반 석식', '일반 석식']);
});

test('C: 곧 다시 취소할 행은 되살림 후보에서 처음부터 빠진다(더 이른 행을 막지 않게) — S1·S2·X·L 24순서 3/22 일반 석식', () => {
  allOrders(NOHALL, {
    S1: (r) => saveReq(r, '석식', '일반 석식', '2027-03-03T09:00:00', '2027-03-04', '2027-03-22'),
    S2: (r) => saveReq(r, '석식', '학사 석식', '2027-03-03T10:00:00', '2027-03-04', '2027-03-20'),
    X: (r) => saveReq(r, '석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-04', '2027-03-16'),
    L: LEAVE_34
  }, ['2027-03-16', '2027-03-20', '2027-03-22', '2027-04-30'], ['미실시', '미실시', '일반 석식', '일반 석식']);
});

test('D: 되살린 superseded 신청서도 자기 취소를 한다(더 이른 대기 행) — E0·E1·E2·L 24순서 같은 값', () => {
  const base = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '학사 석식', '2027-03-01')];
  allOrders(base, {
    E0: (r) => saveReq(r, '석식', '학사 석식', '2027-03-01T09:00:00', '2027-03-05', '2027-03-12'),
    E1: (r) => saveReq(r, '석식', '미실시', '2027-03-01T13:30:00', '2027-03-05'),
    E2: (r) => saveReq(r, '석식', '학사 석식', '2027-03-05T13:45:00', '2027-03-05'),
    L: (r) => saveLeaveP(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T10:30:00' }, '2027-03-05')
  }, ['2027-03-08', '2027-03-12', '2027-03-14', '2027-03-15', '2027-04-30'], ['미실시', '미실시', '미실시', '미실시', '미실시']);
});

test('superseded: supersededBy는 적용일이 늦은 순, 같으면 신청 일시가 늦은 순 / movePlan_은 superseded 급식 신청의 규칙 경고를 옮기지 않고 한 줄로 알린다', () => {
  const rows = [CH('석식', '학사 석식', '2027-03-01'), CH('석식', '미실시', '2027-03-08', { id: 'n1', source: 'F7', requested_at: '2027-03-05T09:00:00' }),
    CH('석식', '미실시', '2027-03-10', { id: 'n2', source: 'F7', requested_at: '2027-03-05T08:00:00' }),
    CH('석식', '미실시', '2027-03-10', { id: 'n3', source: 'F7', requested_at: '2027-03-06T08:00:00' })];
  const p = plain(ctx.mealPlanChange_(rows, 's1', '석식', '일반 석식', '2027-03-02T09:00:00', { today: '2027-03-06', effectiveDate: '2027-03-12' }));
  assert.deepStrictEqual([p.superseded, p.supersededBy], [true, ['n3', 'n2', 'n1']]);
  // 퇴실(일반 석식으로)의 일반 석식 신청이 더 새 미실시(3/4)에 가려지면: '쓰지 않습니다' 한 줄만, mealPlanChange_의 '먼저 적용되어' 경고는 없음
  const hall = HALL().concat([CH('석식', '미실시', '2027-03-04', { source: 'F7', requested_at: '2027-03-03T16:00:00' })]);
  const m = plan(hall, { type: '학사 퇴실', effectiveDate: '2027-03-04', requestedAt: '2027-03-03T15:00:00', dinner: '일반 석식' }, '2027-03-03');
  assert.ok(m.warnings.some((w) => /석식 일반 석식 신청은 쓰지 않습니다: 더 새 신청이 있습니다/.test(w)), JSON.stringify(m.warnings));
  assert.ok(!m.warnings.some((w) => /먼저 적용되어/.test(w)), JSON.stringify(m.warnings));
});

test('되살림 덮임의 동점: 신청 일시가 같으면 나중에 저장된 행이 더 새 신청(퇴실 취소 뒤 3/13 미실시)', () => {
  const base = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '일반 석식', '2027-03-01')];
  const a = saveReq(base(), '조식', '실시', '2027-03-01T08:00:00', '2027-03-01', '2027-03-11');
  const left = saveMove(a, { type: '학사 퇴실', effectiveDate: '2027-03-02', requestedAt: '2027-03-02T13:23:00' }, '2027-03-02');
  const b = saveReq(left.rows, '조식', '미실시', '2027-03-01T08:00:00', '2027-03-03');   // 같은 신청 일시, 나중에 저장 → 3/8
  const s = applyUndo(b, undo(b, left.head, '2027-03-06'));
  assert.deepStrictEqual(['2027-03-08', '2027-03-13'].map((d) => at(s, '조식', d)), ['미실시', '미실시']);
});

test('재입실 급식 행은 퇴실 기록 전에 낸, 재입실일보다 늦게 적용되는 신청을 가리지 않는다(늦게 입력돼도 남음) — 재입실일 당일 신청은 가림', () => {
  const left = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-12', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11');
  const p = plain(ctx.mealPlanChange_(back.rows, 's1', '조식', '미실시', '2027-03-07T09:00:00', { today: '2027-03-11', effectiveDate: '2027-03-20' }));
  assert.strictEqual(p.superseded, false);
  assert.strictEqual(at(saveReq(back.rows, '조식', '미실시', '2027-03-07T09:00:00', '2027-03-11', '2027-03-20'), '조식', '2027-03-20'), '미실시');
  assert.strictEqual(plain(ctx.mealPlanChange_(back.rows, 's1', '조식', '미실시', '2027-03-07T09:00:00', { today: '2027-03-11', effectiveDate: '2027-03-12' })).superseded, true);
});

// 알려진 지름길(총괄: 이번 라운드 안 함, docs/plan/followups.md R11b '재입실이 덮는 신청의 부수 효과'):
// 퇴실 기록 뒤·재입실 전에 낸, 재입실 값과 다른 신청 Q가 퇴실 전 대기 신청 P를 가린 효과는 입력 순서에 따라 남거나 사라진다.
// 고치면 아래 단언을 '두 순서가 같다'로 바꾼다.
test('(알려진 지름길) 재입실이 덮는 신청 Q(일반 석식 3/19)가 퇴실 전 대기 신청 P(미실시 3/19)를 가린 효과 — 지금은 입력 순서에 따라 다르다', () => {
  const P = (r) => saveReq(r, '석식', '미실시', '2027-03-05T09:00:00', '2027-03-12', '2027-03-19');
  const L = (r) => saveMove(r, { type: '학사 퇴실', effectiveDate: '2027-03-11', requestedAt: '2027-03-10T10:00:00' }, '2027-03-10').rows;
  const Q = (r) => saveReq(r, '석식', '일반 석식', '2027-03-12T09:00:00', '2027-03-12', '2027-03-19');
  const R = (r) => saveMove(r, { type: '학사 입실', effectiveDate: '2027-03-15', requestedAt: '2027-03-16T09:00:00' }, '2027-03-16').rows;
  const pFirst = R(Q(L(P(HALL())))), pLate = R(P(Q(L(HALL()))));   // P를 먼저 입력 / Q 뒤에 늦게 입력(그때 P는 Q에 가려 취소 행)
  assert.deepStrictEqual([at(pFirst, '석식', '2027-03-20'), at(pLate, '석식', '2027-03-20')], ['미실시', '학사 석식']);
});

/* ───── 총괄 4차 검토(#55) ───── */

const HALL2 = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '학사 석식', '2027-03-01')];

test('되살린 행의 자기 취소는 같은 계획에서 되살리는 행을 취소하지 않는다(toCancel∩toRestore 없음) — R2>XA>XB>R1>L', () => {
  let r = HALL2();
  r = saveReq(r, '석식', '일반 석식', '2027-03-03T09:00:00', '2027-03-04', '2027-03-19');
  r = saveReq(r, '석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-04', '2027-03-16');
  r = saveReq(r, '석식', '학사 석식', '2027-03-04T10:00:00', '2027-03-04', '2027-03-17');
  r = saveReq(r, '석식', '미실시', '2027-03-03T10:00:00', '2027-03-04', '2027-03-18');
  const p = plan(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T15:00:00' }, '2027-03-04');
  assert.deepStrictEqual(p.toCancel.filter((c) => p.toRestore.some((t) => t.id === c.id)), []);
  assert.deepStrictEqual(['2027-03-18', '2027-03-19', '2027-04-30'].map((d) => at(saveLeaveP(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T15:00:00' }, '2027-03-04'), '석식', d)),
    ['미실시', '미실시', '미실시']);
});

test("자기 취소가 이 계획이 쓸 '일반 석식으로' 행을 겨누면 그 행을 쓰지 않는다(toCancel은 시트에 있는 id만) — X>R>L", () => {
  let r = HALL2();
  r = saveReq(r, '석식', '학사 석식', '2027-03-04T16:00:00', '2027-03-05', '2027-03-04');
  r = saveReq(r, '석식', '미실시', '2027-03-04T15:30:00', '2027-03-05', '2027-03-04');
  const move = { type: '학사 퇴실', effectiveDate: '2027-03-04', requestedAt: '2027-03-04T15:00:00', dinner: '일반 석식' };
  const p = plan(r, move, '2027-03-05');
  assert.ok(p.toCancel.every((c) => r.some((x) => x.id === c.id)), JSON.stringify(p.toCancel));
  assert.deepStrictEqual(p.toCancel.filter((c) => p.toRestore.some((t) => t.id === c.id)), []);
  assert.ok(!p.rows.some((x) => x.value === '일반 석식') && p.warnings.some((w) => /일반 석식 신청은 쓰지 않습니다/.test(w)), JSON.stringify(p));
  assert.strictEqual(at(saveLeaveP(r, move, '2027-03-05'), '석식', '2027-03-10'), '미실시');
});

/* ───── 총괄 4차 검토(#57) ───── */

test('결정 59 연쇄는 명단 학사 입실 행을 건드리지 않는다(명단 입실 날 퇴실 취소, 다음 기간 명단 입실도)', () => {
  const base = [CH('학사', '입실', '2027-03-02'), CH('기숙사', '퇴실', '2027-03-02'), CH('조식', '실시', '2027-03-02'), CH('석식', '학사 석식', '2027-03-02')];
  const left = saveMove(base, { type: '학사 퇴실', effectiveDate: '2027-03-02', requestedAt: '2027-03-02T09:00:00' }, '2027-03-02');
  const rows = left.rows.concat([CH('학사', '입실', '2027-04-20')]);   // 그 뒤 올린 다음 기간 명단(명단업로드, 신청 일시 빈칸)
  const u = undo(rows, left.head, '2027-03-02');
  assert.ok(!u.warnings.some((w) => /재입실 기록/.test(w)), JSON.stringify(u.warnings));
  assert.ok(!u.toCancel.some((c) => rows.some((b) => b.id === c.id && b.item === '학사' && b.source === '명단업로드')), JSON.stringify(u.toCancel));
  const s = applyUndo(rows, u);
  assert.deepStrictEqual(['2027-03-05', '2027-04-25'].map((d) => at(s, '학사', d)), ['입실', '입실']);
});

test('결정 59: 같은 날 재입실(입실일 = 퇴실일, 나중에 기록)도 함께 취소', () => {
  const left = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T10:00:00' }, '2027-03-09');
  const back = saveMove(left.rows, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T12:00:00' }, '2027-03-09');
  const u = undo(back.rows, left.head);
  assert.ok(u.toCancel.some((c) => c.id === back.head) && u.warnings.includes('재입실 기록(2027-03-10)도 함께 취소됩니다'), JSON.stringify(u));
});

test('재입실 행은 되살림 덮임에서도 퇴실 전 신청을 덮지 않는다 — 두 번째 퇴실(늦은 입력)과 X의 두 순서가 같다', () => {
  let r = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08').rows;
  r = saveMove(r, { type: '학사 입실', effectiveDate: '2027-03-12', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11').rows;
  r = saveReq(r, '석식', '일반 석식', '2027-03-07T09:00:00', '2027-03-20', '2027-03-29');   // 퇴실 전 종이 신청서(늦은 입력)
  const X = (x, today) => saveReq(x, '석식', '학사 석식', '2027-03-25T09:00:00', today, '2027-03-28');
  const L2 = (x) => saveMove(x, { type: '학사 퇴실', effectiveDate: '2027-03-27', requestedAt: '2027-03-24T10:00:00' }, '2027-03-26').rows;
  const days = ['2027-03-28', '2027-03-29', '2027-04-05', '2027-04-12', '2027-04-20'];
  const a = L2(X(r, '2027-03-25')), b = X(L2(r), '2027-03-26');
  assert.deepStrictEqual(days.map((d) => at(a, '석식', d)), days.map((d) => at(b, '석식', d)));
  assert.deepStrictEqual(days.map((d) => at(a, '석식', d)), ['학사 석식', '일반 석식', '일반 석식', '일반 석식', '일반 석식']);
});

test('결정 59 보충(기숙사생): 학사 및 기숙사 퇴실을 취소하면 뒤 기숙사 입실 대표도 함께(경고) → 고친 퇴실(3/11)을 다시 넣을 수 있다', () => {
  let r = saveMove(DORM(), { type: '학사 및 기숙사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08');
  const head = r.head;
  r = saveMove(r.rows, { type: '학사 입실', effectiveDate: '2027-03-15', requestedAt: '2027-03-09T10:00:00' }, '2027-03-09');
  const dorm = saveMove(r.rows, { type: '기숙사 입실', effectiveDate: '2027-03-15', requestedAt: '2027-03-09T11:00:00' }, '2027-03-09');
  const u = undo(dorm.rows, head);
  assert.ok(u.warnings.includes('재입실 기록(2027-03-15)도 함께 취소됩니다') && u.warnings.includes('기숙사 입실 기록(2027-03-15)도 함께 취소됩니다'), JSON.stringify(u.warnings));
  const s = applyUndo(dorm.rows, u);
  assert.deepStrictEqual(['2027-03-12', '2027-03-20'].map((d) => [at(s, '학사', d), at(s, '기숙사', d)]), [['입실', '입실'], ['입실', '입실']]);
  assert.deepStrictEqual(plan(s, { type: '학사 및 기숙사 퇴실', effectiveDate: '2027-03-11', requestedAt: '2027-03-09T12:00:00' }, '2027-03-09').errors, []);
});

test('퇴실 취소의 되살림도 재입실 행을 퇴실 전 신청의 덮개로 보지 않는다 — 두 번째 퇴실(일반 석식으로) 취소 뒤 퇴실 전 신청서가 돌아온다', () => {
  let r = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08').rows;
  r = saveMove(r, { type: '학사 입실', effectiveDate: '2027-03-12', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11').rows;
  r = saveReq(r, '석식', '미실시', '2027-03-07T09:00:00', '2027-03-20', '2027-03-29');   // 퇴실 전 종이 신청서(재입실 행에 가려지지 않음)
  const never = r;
  const l2 = saveMove(r, { type: '학사 퇴실', effectiveDate: '2027-03-27', requestedAt: '2027-03-24T10:00:00', dinner: '일반 석식' }, '2027-03-24');
  const s = applyUndo(l2.rows, undo(l2.rows, l2.head, '2027-03-24'));
  const days = ['2027-03-28', '2027-03-29', '2027-04-20'];
  assert.deepStrictEqual(days.map((d) => at(s, '석식', d)), days.map((d) => at(never, '석식', d)));
  assert.strictEqual(at(s, '석식', '2027-03-29'), '미실시');
});

/* ───── 총괄 5차 검토(#57) ───── */

// 사건 이름 순서대로 실행(L의 대표 id를 U가 쓴다). 결과 rows
function runSeq(base, ev, order) {
  const st = { rows: base(), L: null };
  for (const k of order) ev[k](st);
  return st.rows;
}
const BASE_GEN = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '일반 석식', '2027-03-01')];

test('X: 퇴실의 일반 석식 연결 행이 superseded로 가린 퇴실 전 신청 P를 재입실·퇴실 취소가 찾는다 — 순서와 무관하게 3/15 미실시', () => {
  const ev = {
    P: (s) => { s.rows = saveReq(s.rows, '석식', '미실시', '2027-03-05T18:44:00', '2027-03-10'); },
    L: (s) => { const r = saveMove(s.rows, { type: '학사 퇴실', effectiveDate: '2027-03-09', requestedAt: '2027-03-08T09:21:00', dinner: '일반 석식' }, '2027-03-10'); s.rows = r.rows; s.L = r.head; },
    R: (s) => { s.rows = saveMove(s.rows, { type: '학사 입실', effectiveDate: '2027-03-09', requestedAt: '2027-03-09T18:19:00', meals: { '조식': '실시', '석식': '학사 석식' } }, '2027-03-10').rows; },
    U: (s) => { s.rows = applyUndo(s.rows, undo(s.rows, s.L, '2027-03-10')); }
  };
  for (const order of ['LPRU', 'PLRU', 'LRPU', 'LRUP']) assert.strictEqual(at(runSeq(BASE_GEN, ev, order.split('')), '석식', '2027-03-15'), '미실시', order);
  const noU = ['LPR', 'PLR', 'LRP'].map((o) => at(runSeq(BASE_GEN, ev, o.split('')), '석식', '2027-03-15'));
  assert.deepStrictEqual(noU, [noU[0], noU[0], noU[0]], JSON.stringify(noU));
});

test('Z: 재입실이 되살린 신청은 자기 취소를 한다 — P·Q·L·R(L이 R보다 앞) 12순서 모두 3/16 미실시', () => {
  const ev = {
    P: (s) => { s.rows = saveReq(s.rows, '석식', '미실시', '2027-03-08T14:57:00', '2027-03-10'); },
    Q: (s) => { s.rows = saveReq(s.rows, '석식', '일반 석식', '2027-03-07T07:29:00', '2027-03-10', '2027-03-16'); },
    L: (s) => { s.rows = saveMove(s.rows, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-08T21:51:00', dinner: '일반 석식' }, '2027-03-10').rows; },
    R: (s) => { s.rows = saveMove(s.rows, { type: '학사 입실', effectiveDate: '2027-03-07', requestedAt: '2027-03-10T07:37:00', meals: { '조식': '미실시', '석식': '일반 석식' } }, '2027-03-10').rows; }
  };
  for (const order of perms(['P', 'Q', 'L', 'R']).filter((o) => o.indexOf('L') < o.indexOf('R'))) {
    assert.strictEqual(at(runSeq(HALL2, ev, order), '석식', '2027-03-16'), '미실시', order.join(''));
  }
});

test('X(퇴실 취소 쪽): 재입실일(3/20)이 P(3/15)보다 늦어 재입실은 P를 되살리지 않아도, 퇴실 취소는 연결 일반 석식이 가린 P를 되살린다', () => {
  let r = saveMove(BASE_GEN(), { type: '학사 퇴실', effectiveDate: '2027-03-09', requestedAt: '2027-03-08T09:21:00', dinner: '일반 석식' }, '2027-03-10');
  const L = r.head;
  let rows = saveReq(r.rows, '석식', '미실시', '2027-03-05T18:44:00', '2027-03-10');   // 일반 석식 연결 행에 가려 취소 행
  rows = saveMove(rows, { type: '학사 입실', effectiveDate: '2027-03-20', requestedAt: '2027-03-10T18:19:00', meals: { '조식': '실시', '석식': '학사 석식' } }, '2027-03-10').rows;
  const s = applyUndo(rows, undo(rows, L, '2027-03-10'));
  assert.deepStrictEqual(['2027-03-14', '2027-03-15', '2027-03-25'].map((d) => at(s, '석식', d)), ['일반 석식', '미실시', '미실시']);
});

test('W: 기숙사 입실 조식 실시는 늘 쓴다 — P(조식 미실시 3/15)·D(기숙사 입실 3/12) 두 순서가 같은 값(실시)', () => {
  const ev = {
    P: (s) => { s.rows = saveReq(s.rows, '조식', '미실시', '2027-03-03T11:40:00', '2027-03-05'); },
    D: (s) => { s.rows = saveMove(s.rows, { type: '기숙사 입실', effectiveDate: '2027-03-12', requestedAt: '2027-03-05T09:00:00' }, '2027-03-05').rows; }
  };
  const v = ['PD', 'DP'].map((o) => ['2027-03-12', '2027-03-20'].map((d) => at(runSeq(HALL2, ev, o.split('')), '조식', d)));
  assert.deepStrictEqual(v, [['실시', '실시'], ['실시', '실시']]);
});

test('W: 기숙사 재입실은 앞선 기숙사 퇴실 기록 전에 낸 대기 신청을 취소하지 않는다(결정 56) — P>L>R>D에서 3/15 미실시', () => {
  let rows = saveReq(DORM(), '조식', '미실시', '2027-03-03T11:40:00', '2027-03-05');
  rows = saveMove(rows, { type: '학사 및 기숙사 퇴실', effectiveDate: '2027-03-08', requestedAt: '2027-03-05T10:00:00' }, '2027-03-05').rows;
  rows = saveMove(rows, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T09:00:00' }, '2027-03-09').rows;
  rows = saveMove(rows, { type: '기숙사 입실', effectiveDate: '2027-03-11', requestedAt: '2027-03-09T11:00:00' }, '2027-03-09').rows;
  assert.deepStrictEqual(['2027-03-11', '2027-03-15'].map((d) => at(rows, '조식', d)), ['실시', '미실시']);
});

test('기숙사 퇴실 대표 취소: 같은 날 따로 입력한 학사 퇴실의 재입실은 연쇄하지 않는다(p7)', () => {
  let r = saveMove(DORM(), { type: '기숙사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08');
  const dh = r.head;
  r = saveMove(r.rows, { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T11:00:00' }, '2027-03-08');
  const back = saveMove(r.rows, { type: '학사 입실', effectiveDate: '2027-03-12', requestedAt: '2027-03-11T09:00:00' }, '2027-03-11');
  const u = undo(back.rows, dh, '2027-03-08');
  assert.ok(!u.toCancel.some((c) => c.id === back.head) && !u.warnings.some((w) => /재입실 기록/.test(w)), JSON.stringify(u));
  assert.deepStrictEqual(['2027-03-11', '2027-03-12'].map((d) => at(applyUndo(back.rows, u), '학사', d)), ['퇴실', '입실']);
});

test('기숙사 퇴실 대표 취소: 뒤따른 기숙사 입실도 함께(경고) → 고친 기숙사 퇴실(3/11)을 다시 넣을 수 있다', () => {
  const left = saveMove(DORM(), { type: '기숙사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08');
  const din = saveMove(left.rows, { type: '기숙사 입실', effectiveDate: '2027-03-15', requestedAt: '2027-03-09T10:00:00' }, '2027-03-09');
  const u = undo(din.rows, left.head, '2027-03-09');
  assert.ok(u.toCancel.some((c) => c.id === din.head) && u.warnings.includes('기숙사 입실 기록(2027-03-15)도 함께 취소됩니다'), JSON.stringify(u));
  assert.deepStrictEqual(plan(applyUndo(din.rows, u), { type: '기숙사 퇴실', effectiveDate: '2027-03-11', requestedAt: '2027-03-09T11:00:00' }, '2027-03-09').errors, []);
});

test('다음 기간 명단의 학사 입실(명단업로드)은 이번 기간 퇴실을 막지 않는다(가정 — 총괄 결정)', () => {
  const rows = HALL().concat([CH('학사', '입실', '2027-04-20')]);
  assert.deepStrictEqual(plan(rows, { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08').errors, []);
});

test('G1: 같은 날 퇴실보다 먼저 기록한 입실은 재입실 연쇄에 들지 않는다 / 날짜가 뒤면 기록이 일러도 든다', () => {
  // 같은 날 3/10: 입실(기록 3/9 08:00) → 그날 퇴실(기록 3/9 10:00)이 나중 → 그 입실은 퇴실 전 상태
  const base = [CH('학사', '퇴실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '미실시', '2027-03-01'), CH('석식', '미실시', '2027-03-01')];
  const ent = saveMove(base, { type: '학사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T08:00:00' }, '2027-03-09');
  const left = saveMove(ent.rows, { type: '학사 퇴실', effectiveDate: '2027-03-10', requestedAt: '2027-03-09T10:00:00' }, '2027-03-09');
  assert.ok(!undo(left.rows, left.head, '2027-03-09').toCancel.some((c) => c.id === ent.head));
  // 재입실 3/20을 퇴실(3/12) 기록보다 먼저 적었어도(날짜는 뒤) 연쇄에 든다
  const rows = HALL().concat([CH('학사', '입실', '2027-03-20', { id: 'reE', source: 'F6', requested_at: '2027-03-07T09:00:00' }),
    CH('학사', '퇴실', '2027-03-12', { id: 'lvH', source: 'F6', requested_at: '2027-03-08T09:00:00' })]);
  assert.ok(undo(rows, 'lvH', '2027-03-08').toCancel.some((c) => c.id === 'reE'));
});

test('G2: 학사 퇴실(기숙사 연결 없음)을 취소해도 뒤의 기숙사 입실은 남는다', () => {
  const rows = HALL().concat([CH('학사', '퇴실', '2027-03-10', { id: 'lvH', source: 'F6', requested_at: '2027-03-08T09:00:00' }),
    CH('기숙사', '입실', '2027-03-15', { id: 'dIn', source: 'F6', requested_at: '2027-03-09T09:00:00' })]);
  const u = undo(rows, 'lvH', '2027-03-08');
  assert.ok(!u.toCancel.some((c) => c.id === 'dIn') && !u.warnings.some((w) => /기숙사 입실 기록/.test(w)), JSON.stringify(u));
});

test("G3: moveUndoPlan_ 꼬리표는 id 전체로 맞춘다('[자동] H1 …'은 H12의 꼬리표가 아니다)", () => {
  const rows = HALL().concat([CH('학사', '퇴실', '2027-03-10', { id: 'H1', source: 'F6', requested_at: '2027-03-08T09:00:00' }),
    CH('석식', '미실시', '2027-03-22', { id: 'z', source: 'F7', requested_at: '2027-03-02T09:00:00', status: '취소', cancel_reason: '[자동] H12 퇴실 정리' })]);
  assert.deepStrictEqual(undo(rows, 'H1', '2027-03-08').toRestore, []);
});

/* ───── 총괄 6차 검토(#57) ───── */

test('W(기숙사 입실 뒤 늦게 입력한 옛 조식 신청서): PLRD·LPRD·LRPD·LRDP 모두 3/15 미실시, 따로 한 기숙사 퇴실 POD·OPD·ODP도', () => {
  const ev = {
    P: (s) => { s.rows = saveReq(s.rows, '조식', '미실시', '2027-03-03T11:40:00', '2027-03-08'); },
    L: (s) => { s.rows = saveMove(s.rows, { type: '학사 및 기숙사 퇴실', effectiveDate: '2027-03-06', requestedAt: '2027-03-04T20:50:00' }, '2027-03-08').rows; },
    O: (s) => { s.rows = saveMove(s.rows, { type: '기숙사 퇴실', effectiveDate: '2027-03-06', requestedAt: '2027-03-04T20:50:00', breakfastStopWithDorm: false }, '2027-03-08').rows; },
    R: (s) => { s.rows = saveMove(s.rows, { type: '학사 입실', effectiveDate: '2027-03-09', requestedAt: '2027-03-07T20:00:00' }, '2027-03-08').rows; },
    D: (s) => { s.rows = saveMove(s.rows, { type: '기숙사 입실', effectiveDate: '2027-03-10', requestedAt: '2027-03-08T10:00:00' }, '2027-03-08').rows; }
  };
  for (const o of ['PLRD', 'LPRD', 'LRPD', 'LRDP', 'POD', 'OPD', 'ODP']) assert.strictEqual(at(runSeq(DORM, ev, o.split('')), '조식', '2027-03-15'), '미실시', o);
});

test('W 경계: 같은 날 기숙사 퇴실·입실(W3), 두 번 퇴실이면 마지막 퇴실 기록 기준(W4), 기록 시각과 같은 신청은 남기지 않음(W7)', () => {
  const O = (r, e, at) => saveMove(r, { type: '기숙사 퇴실', effectiveDate: e, requestedAt: at, breakfastStopWithDorm: false }, at.slice(0, 10)).rows;
  const D = (r, e, at) => saveMove(r, { type: '기숙사 입실', effectiveDate: e, requestedAt: at }, at.slice(0, 10)).rows;
  const P = (r, at) => saveReq(r, '조식', '미실시', at, at.slice(0, 10), '2027-03-15');
  // W3: 같은 날 3/10 퇴실(기록 3/8)·입실(기록 3/9), 그 전 신청(3/5) P는 남음
  assert.strictEqual(at(D(O(P(DORM(), '2027-03-05T09:00:00'), '2027-03-10', '2027-03-08T10:00:00'), '2027-03-10', '2027-03-09T10:00:00'), '조식', '2027-03-15'), '미실시');
  // W4: O1(기록 3/4) → D1 → P(3/6 12:00) → O2(기록 3/8) → D2: P는 마지막 퇴실 기록 전이라 남음
  let r = D(O(DORM(), '2027-03-05', '2027-03-04T10:00:00'), '2027-03-07', '2027-03-06T10:00:00');
  r = D(O(P(r, '2027-03-06T12:00:00'), '2027-03-09', '2027-03-08T10:00:00'), '2027-03-11', '2027-03-10T10:00:00');
  assert.strictEqual(at(r, '조식', '2027-03-15'), '미실시');
  // W7: 퇴실 기록 시각과 같은 신청 일시는 '전'이 아니다 → 입실 조식이 취소
  assert.strictEqual(at(D(P(O(DORM(), '2027-03-05', '2027-03-04T10:00:00'), '2027-03-04T10:00:00'), '2027-03-08', '2027-03-06T10:00:00'), '조식', '2027-03-15'), '실시');
});

test("X5/X6: 퇴실 취소는 이미 취소된 연결 행(재입실이 취소한 '일반 석식으로')의 꼬리표로 가려졌던 신청도 되살린다 — L→P→R→U 3/12 학사 석식", () => {
  const st = { rows: NOHALL(), L: null };
  const l = saveMove(st.rows, { type: '학사 퇴실', effectiveDate: '2027-03-09', requestedAt: '2027-03-08T09:21:00', dinner: '일반 석식' }, '2027-03-10');
  let rows = saveReq(l.rows, '석식', '학사 석식', '2027-03-05T18:44:00', '2027-03-10', '2027-03-12');
  rows = saveMove(rows, { type: '학사 입실', effectiveDate: '2027-03-09', requestedAt: '2027-03-09T18:19:00', meals: { '조식': '실시', '석식': '일반 석식' } }, '2027-03-10').rows;
  const s = applyUndo(rows, undo(rows, l.head, '2027-03-10'));
  assert.strictEqual(at(s, '석식', '2027-03-12'), '학사 석식');
});

// 알려진 지름길(Y, 총괄 결정 (A) 미반영 — 행 하나로는 '재입실일부터만'을 나타낼 수 없어 행 나누기가 필요, followups):
// 재입실 기록 뒤·퇴실일 전에 적용되는 신청 F가 있으면 입력 순서에 따라 재입실 뒤 값이 다르다. 고치면 세 순서가 3/18 일반 석식으로 같아지게 바꾼다.
test('(알려진 지름길 Y) 재입실 기록 뒤·퇴실일 전 적용 신청 F — 지금은 FLR·LFR 미실시, LRF 학사 석식', () => {
  const base = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('조식', '실시', '2027-03-01'), CH('석식', '미실시', '2027-03-01')];
  const ev = {
    F: (s) => { s.rows = saveReq(s.rows, '석식', '학사 석식', '2027-03-10T08:52:00', '2027-03-10'); },
    L: (s) => { s.rows = saveMove(s.rows, { type: '학사 퇴실', effectiveDate: '2027-03-12', requestedAt: '2027-03-03T14:43:00' }, '2027-03-10').rows; },
    R: (s) => { s.rows = saveMove(s.rows, { type: '학사 입실', effectiveDate: '2027-03-18', requestedAt: '2027-03-05T13:19:00', meals: { '조식': '실시', '석식': '일반 석식' } }, '2027-03-10').rows; }
  };
  assert.deepStrictEqual(['FLR', 'LFR', 'LRF'].map((o) => at(runSeq(base, ev, o.split('')), '석식', '2027-03-18')), ['미실시', '미실시', '학사 석식']);
});
