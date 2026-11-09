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
