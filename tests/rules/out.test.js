/** R5 OutRules — 자동 1OUT 맞추기, OUT 단계. 표 형식, 가짜 값만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/OutRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

const EX = (id, extra) => Object.assign({ id, term_id: 'T1', group_id: '', student_id: 's1', date: '2027-03-03', blocks: 'ALL',
  type: '미인정결석', status: '확정', requested_by: 'att@example.com', confirmed_by: 'att@example.com' }, extra || {});
const OPTS = { autoTypes: ['미인정지각', '미인정조퇴', '미인정결석'], ruleName: '무단 지각·결석·이탈', ruleId: 'R-AUTO',
  dutyByDate: { '2027-03-03': 'duty1@example.com', '2027-03-04': ['duty2@example.com', 'duty3@example.com'] } };
const run = (exc, vio, opts) => plain(ctx.reconcileAutoOuts_(exc, vio || [], Object.assign({}, OPTS, opts || {})));

// 만들어진 초안을 violations 행으로 저장하는 흉내
let vseq = 0;
function save(vio, r) {
  const out = vio.map((v) => Object.assign({}, v));
  for (const c of r.toCancel) Object.assign(out.find((v) => v.id === c.violationId), { status: '취소', cancel_reason: c.reason });
  for (const c of r.toCreate) out.push(Object.assign({ id: 'v' + (++vseq) }, c));
  return out;
}

test('확정된 미인정 특이사항 1건 → OUT 초안 1건(입력자 = 확정자, 적발 교사 = 그날 근무교사)', () => {
  const r = run([EX('e1', { blocks: '20:00-22:00;18:30-19:00' })]);
  assert.deepStrictEqual(r.toCancel, []);
  assert.deepStrictEqual(r.toCreate, [{
    term_id: 'T1', student_id: 's1', occurred_at: '2027-03-03T18:30:00', rule_id: 'R-AUTO', rule_name: '무단 지각·결석·이탈',
    memo: '사전 특이사항 자동: 미인정결석', detected_by: 'duty1@example.com', entered_by: 'att@example.com',
    status: '유효', source: 'F1자동', source_exception_id: 'e1', cancel_reason: '' }]);
});

table('대상 판정: 확정만, 자동 유형만(괄호 설명 무시)', [
  [{ status: '요청' }, 0], [{ status: '취소' }, 0], [{ status: ' 확정 ' }, 1],
  [{ type: '병결' }, 0], [{ type: '미인정지각' }, 1], [{ type: '미인정조퇴' }, 1], [{ type: '미인정결석(무단)' }, 1],
  [{ type: '학원(보강 포함)' }, 0]
], ([extra, n]) => assert.strictEqual(run([EX('e1', extra)]).toCreate.length, n));

test('두 번 실행해도 새로 만드는 것 0건(source_exception_id로 중복 방지)', () => {
  const exc = [EX('e1'), EX('e2', { student_id: 's2' })];
  const r1 = run(exc);
  assert.strictEqual(r1.toCreate.length, 2);
  const v1 = save([], r1);
  const r2 = run(exc, v1);
  assert.deepStrictEqual(r2, { toCreate: [], toCancel: [] });
});

table('특이사항이 취소되거나 유형이 바뀌거나 요청으로 돌아가면 연결된 OUT 취소(사유 [자동])', [
  [{ status: '취소' }, '취소되었습니다'],
  [{ type: '병결' }, '유형이 바뀌었습니다'],
  [{ status: '요청' }, '확정된 미인정 특이사항이 없습니다']
], ([change, word]) => {
  const v1 = save([], run([EX('e1')]));
  const r = run([EX('e1', change)], v1);
  assert.strictEqual(r.toCreate.length, 0);
  assert.strictEqual(r.toCancel.length, 1);
  assert.strictEqual(r.toCancel[0].violationId, v1[0].id);
  assert.ok(r.toCancel[0].reason.indexOf('[자동] ') === 0 && r.toCancel[0].reason.indexOf(word) >= 0, r.toCancel[0].reason);
});

test('연결된 특이사항 행을 찾을 수 없으면 자동 OUT 취소', () => {
  const r = run([], [{ id: 'v9', source: 'F1자동', status: '유효', source_exception_id: '없는-id', student_id: 's1', term_id: 'T1' }]);
  assert.deepStrictEqual(r.toCancel.map((c) => c.violationId), ['v9']);
});

test('교사가 직접 입력한 OUT은 건드리지 않는다', () => {
  const manual = [{ id: 'm1', source: '직접', status: '유효', source_exception_id: '', student_id: 's1', term_id: 'T1' },
    { id: 'm2', source: '직접', status: '유효', source_exception_id: 'e1', student_id: 's1', term_id: 'T1' }];
  const r = run([EX('e1', { status: '취소' })], manual);
  assert.deepStrictEqual(r, { toCreate: [], toCancel: [] });
  // 직접 OUT이 같은 특이사항을 가리켜도 자동 OUT은 따로 만든다
  assert.strictEqual(run([EX('e1')], manual).toCreate.length, 1);
});

test('기간 입력 묶음(group_id)은 1OUT(결정 22), 대표 = 가장 이른 날짜, 근무교사가 여럿이면 쉼표', () => {
  const exc = [EX('e3', { group_id: 'G', date: '2027-03-05' }), EX('e2', { group_id: 'G', date: '2027-03-04' }),
    EX('e4', { group_id: 'G', date: '2027-03-06' })];
  const r = run(exc);
  assert.strictEqual(r.toCreate.length, 1);
  assert.strictEqual(r.toCreate[0].source_exception_id, 'e2');
  assert.strictEqual(r.toCreate[0].occurred_at, '2027-03-04T00:00:00');
  assert.strictEqual(r.toCreate[0].detected_by, 'duty2@example.com,duty3@example.com');
  assert.strictEqual(r.toCreate[0].memo, '사전 특이사항 자동: 미인정결석 외 2일');
});

test("per 'row' 옵션이면 날마다 1OUT(가정 b의 대안)", () => {
  const exc = [EX('e2', { group_id: 'G', date: '2027-03-04' }), EX('e3', { group_id: 'G', date: '2027-03-05' })];
  const r = run(exc, [], { per: 'row' });
  assert.deepStrictEqual(r.toCreate.map((c) => c.source_exception_id), ['e2', 'e3']);
  assert.strictEqual(r.toCreate[1].detected_by, '');   // 그날 근무교사 정보 없음
});

test('묶음의 대표 행만 취소되고 나머지는 확정이면 OUT 유지(새로 만들지도 않음)', () => {
  const exc = [EX('e2', { group_id: 'G', date: '2027-03-04' }), EX('e3', { group_id: 'G', date: '2027-03-05' })];
  const v1 = save([], run(exc));
  const r = run([EX('e2', { group_id: 'G', date: '2027-03-04', status: '취소' }), exc[1]], v1);
  assert.deepStrictEqual(r, { toCreate: [], toCancel: [] });
  // 묶음 전체가 취소되면 취소
  const all = exc.map((e) => Object.assign({}, e, { status: '취소' }));
  assert.strictEqual(run(all, v1).toCancel.length, 1);
});

test('같은 group_id라도 학생이 다르면 다른 단위', () => {
  const exc = [EX('e1', { group_id: 'G' }), EX('e2', { group_id: 'G', student_id: 's2' })];
  assert.deepStrictEqual(run(exc).toCreate.map((c) => c.student_id), ['s1', 's2']);
});

test('같은 단위에 살아 있는 자동 OUT이 둘이면 하나만 남기고 [자동] 중복 취소', () => {
  const vio = [{ id: 'a', source: 'F1자동', status: '유효', source_exception_id: 'e1' },
    { id: 'b', source: 'F1자동', status: '유효', source_exception_id: 'e1' }];
  const r = run([EX('e1')], vio);
  assert.deepStrictEqual(r.toCreate, []);
  assert.deepStrictEqual(r.toCancel.map((c) => c.violationId), ['b']);
  assert.ok(r.toCancel[0].reason.indexOf('중복') >= 0);
});

test('관리자가 직접 취소한 자동 OUT은 다시 만들지 않고(가정), [자동]으로 취소된 뒤 다시 대상이 되면 새로 만든다', () => {
  const byAdmin = [{ id: 'a', source: 'F1자동', status: '취소', source_exception_id: 'e1', cancel_reason: '잘못 입력(관리자)' }];
  assert.deepStrictEqual(run([EX('e1')], byAdmin), { toCreate: [], toCancel: [] });
  const byAuto = [{ id: 'a', source: 'F1자동', status: '취소', source_exception_id: 'e1', cancel_reason: '[자동] 특이사항 유형이 바뀌었습니다' }];
  assert.strictEqual(run([EX('e1')], byAuto).toCreate.length, 1);
});

test('흐름: 입력 → 자동 OUT → 유형 변경으로 취소 → 다시 미인정으로 → 새 OUT, 매번 두 번째 실행은 0건', () => {
  let vio = [];
  const step = (exc) => { const r = run(exc, vio); vio = save(vio, r); assert.deepStrictEqual(run(exc, vio), { toCreate: [], toCancel: [] }); return r; };
  assert.strictEqual(step([EX('e1')]).toCreate.length, 1);
  assert.strictEqual(step([EX('e1', { type: '병결' })]).toCancel.length, 1);
  assert.strictEqual(step([EX('e1', { type: '미인정지각' })]).toCreate.length, 1);
  assert.strictEqual(vio.filter((v) => v.status === '유효').length, 1);
  assert.strictEqual(plain(ctx.outLevel_(vio, 's1', 'T1')).count, 1);
});

table('occurred_at: 첫 블록 시작(정렬), ALL·잘못된 표기는 00:00', [
  ['ALL', '00:00'], ['15:00-24:00', '15:00'], ['20:00-22:00;9:00-12:00', '09:00'], ['엉망', '00:00'], ['', '00:00']
], ([blocks, hm]) => assert.strictEqual(run([EX('e1', { blocks })]).toCreate[0].occurred_at, '2027-03-03T' + hm + ':00'));

test('입력자: 확정자가 없으면 요청자, 기본 규칙 이름·유형 목록', () => {
  const r = plain(ctx.reconcileAutoOuts_([EX('e1', { confirmed_by: '', type: '미인정조퇴' })], [], {}));
  assert.strictEqual(r.toCreate[0].entered_by, 'att@example.com');
  assert.strictEqual(r.toCreate[0].rule_name, '무단 지각·결석·이탈');
  assert.deepStrictEqual(plain(ctx.reconcileAutoOuts_(null, null, null)), { toCreate: [], toCancel: [] });
});

/* ───── outLevel_ ───── */
const V = (id, extra) => Object.assign({ id, term_id: 'T1', student_id: 's1', status: '유효', source: '직접' }, extra || {});
table('outLevel_: 학기마다 초기화, 취소 제외, 2개 이상이면 퇴실 대상', [
  [[], 0, ''],
  [[V('a')], 1, '1OUT'],
  [[V('a'), V('b', { source: 'F1자동' })], 2, '퇴실 대상'],
  [[V('a'), V('b'), V('c')], 2, '퇴실 대상'],
  [[V('a'), V('b', { status: '취소' })], 1, '1OUT'],
  [[V('a'), V('b', { term_id: 'T0' })], 1, '1OUT'],       // 지난 학기 OUT은 세지 않는다
  [[V('a'), V('b', { student_id: 's2' })], 1, '1OUT'],
  [[V('a', { status: '' })], 1, '1OUT']
], ([vio, level, label]) => {
  const r = plain(ctx.outLevel_(vio, 's1', 'T1'));
  assert.strictEqual(r.level, level);
  assert.strictEqual(r.label, label);
  assert.strictEqual(r.count, vio.filter((v) => (v.status === '유효' || v.status === '') && v.term_id === 'T1' && v.student_id === 's1').length);
});
