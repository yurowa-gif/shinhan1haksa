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

// F7 신청 저장 흉내: 취소 사유 '[자동] <새 행 id> 새 신청으로 대체'(C17a)
function saveReq(rows, item, to, at, today, effectiveDate) {
  const p = plain(ctx.mealPlanChange_(rows, 's1', item, to, at, { today, effectiveDate }));
  if (p.blocked || p.superseded) return rows;
  const id = 'q' + (++seq);
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소', cancel_reason: '[자동] ' + id + ' 새 신청으로 대체' }) : r));
  out.push(CH(item, to, p.date, { id, source: 'F7', requested_at: at, created_at: String(++seq) }));
  p.followUps.forEach((f) => out.push(CH(f.item, f.value, f.effective_date, { source: f.source, requested_at: at, created_at: String(++seq) })));
  return out;
}
function saveLeaveP(rows, move, today) {   // movePlan_ 저장(되살림 포함)
  const p = plan(rows, move, today);
  assert.deepStrictEqual(p.errors, []);
  const out = rows.map((r) => (p.toCancel.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '취소' })
    : p.toRestore.some((c) => c.id === r.id) ? Object.assign({}, r, { status: '유효', cancel_reason: '' }) : r));
  p.rows.forEach((r) => out.push(CH(r.item, r.value, r.effective_date, { requested_at: r.requested_at, source: r.source, created_at: String(++seq) })));
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

test('총괄 결정 (a): 퇴실 정리가 취소한 학사 석식 행이 [자동]으로 취소했던 신청을 되살린다 — 같은 신청 일시면 입력 순서와 무관', () => {
  const base = () => [CH('학사', '입실', '2027-03-01'), CH('기숙사', '퇴실', '2027-03-01'), CH('석식', '미실시', '2027-03-01')];
  const A = (r) => saveReq(r, '석식', '일반 석식', '2027-03-03T09:00:00', '2027-03-04', '2027-03-22');
  const B = (r) => saveReq(r, '석식', '학사 석식', '2027-03-04T09:00:00', '2027-03-04', '2027-03-16');
  const L = (r) => saveLeaveP(r, { type: '학사 퇴실', effectiveDate: '2027-03-05', requestedAt: '2027-03-04T10:00:00' }, '2027-03-04');
  const one = L(B(A(base()))), two = B(L(A(base())));
  assert.strictEqual(at(one, '석식', '2027-03-22'), '일반 석식');
  assert.deepStrictEqual(['2027-03-10', '2027-03-16', '2027-03-22', '2027-04-30'].map((d) => at(one, '석식', d)), ['2027-03-10', '2027-03-16', '2027-03-22', '2027-04-30'].map((d) => at(two, '석식', d)));
});

test('C16 후속: 명단 초기 행(명단업로드)은 "대기 중인 신청 — 직접 취소" 경고에 넣지 않는다', () => {
  const rows = [CH('조식', '실시', '2027-03-10')];   // 기간 시작 3/10 명단 초기값
  const p = plain(ctx.mealPlanChange_(rows, 's1', '조식', '미실시', '2027-03-03T09:00:00', { today: '2027-03-03' }));
  assert.ok(!p.warnings.some((w) => /대기 중인 신청/.test(w)), JSON.stringify(p.warnings));
});
