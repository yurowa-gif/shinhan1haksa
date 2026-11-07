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
    return c ? Object.assign({}, r, { status: '취소', cancel_reason: '[자동] ' + head + ' ' + c.cancel_reason }) : r;
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
function applyUndo(rows, u) {
  return rows.map((r) => (u.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소' })
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

test('퇴실 취소: 더 새 신청에 덮이는 행은 되살리지 않고 경고, memo 꼬리표도 찾는다(5절 5번 승인 전)', () => {
  const base = HALL().concat([CH('조식', '실시', '2027-03-20', { source: 'F7', requested_at: '2027-03-02T09:00:00' })]);
  base[2].value = '미실시';
  const left = saveMove(base, LEAVE, '2027-03-08');
  const cancelledId = left.p.toCancel[0].id;
  // 꼬리표를 memo로 옮기고, 더 새 신청(3/9 신청, 3/12 미실시)을 넣는다
  const rows = left.rows.map((r) => (r.id === cancelledId ? Object.assign({}, r, { cancel_reason: '', memo: '메모 [자동] ' + left.head }) : r))
    .concat([CH('조식', '미실시', '2027-03-12', { source: 'F7', requested_at: '2027-03-09T09:00:00' })]);
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
  assert.deepStrictEqual(undo(HALL(), 'nope').toCancel, []);
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
  // A: 3/9 퇴실을 3/3(수)에 입력 → 석식 3/15. B: 3/5 퇴실을 3/4(목)에 늦게 입력 → 석식 중단일도 3/15(A의 행이 이미 있음)
  const a = saveMove(HALL(), { type: '학사 퇴실', effectiveDate: '2027-03-09', requestedAt: '2027-03-03T10:00:00' }, '2027-03-03');
  const b = saveMove(a.rows, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T10:00:00' }, '2027-03-04');
  const aDinner = b.rows.find((r) => r.linked_change_id === a.head && r.item === '석식');
  assert.strictEqual(aDinner.effective_date, '2027-03-15');
  const u = undo(b.rows, b.head, '2027-03-04');
  assert.ok(!u.toCancel.some((c) => c.id === aDinner.id));
  assert.strictEqual(at(applyUndo(b.rows, u), '석식', '2027-03-15'), '미실시');
});
