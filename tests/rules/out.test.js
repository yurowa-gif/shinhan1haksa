/** R5 OutRules — 자동 1OUT 맞추기, OUT 단계. 표 형식, 가짜 값만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/OutRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

// 요청자와 확정자를 다르게 둔다(입력자 = 확정자 회귀를 잡도록)
const EX = (id, extra) => Object.assign({ id, term_id: 'T1', group_id: '', student_id: 's1', date: '2027-03-03', blocks: 'ALL',
  type: '미인정결석', status: '확정', requested_by: 'homeroom@example.com', confirmed_by: 'att@example.com' }, extra || {});
const OPTS = { autoTypes: ['미인정지각', '미인정조퇴', '미인정결석'], ruleName: '무단 지각·결석·이탈', ruleId: 'R-AUTO',
  dutyByDate: { '2027-03-03': 'duty1@example.com', '2027-03-04': ['duty2@example.com', 'duty3@example.com'] } };
const run = (exc, vio, opts) => plain(ctx.reconcileAutoOuts_(exc, vio || [], Object.assign({}, OPTS, opts || {})));
const NOTHING = { toCreate: [], toCancel: [], toUpdate: [] };

// 결과를 violations 행으로 저장하는 흉내
let vseq = 0;
function save(vio, r) {
  const out = vio.map((v) => Object.assign({}, v));
  for (const c of r.toCancel) Object.assign(out.find((v) => v.id === c.violationId), { status: '취소', cancel_reason: c.reason });
  for (const c of r.toCreate) out.push(Object.assign({ id: 'v' + (++vseq) }, c));
  for (const u of r.toUpdate) Object.assign(out.find((v) => v.id === u.violationId), u.patch);
  return out;
}
// 저장한 뒤 다시 돌리면 할 일이 없어야 한다(수렴)
function settle(exc, vio, opts) {
  const v = save(vio || [], run(exc, vio, opts));
  assert.deepStrictEqual(run(exc, v, opts), NOTHING, '두 번째 실행은 0건');
  return v;
}

test('확정된 미인정 특이사항 1건 → OUT 초안 1건(입력자 = 확정자, 적발 교사 = 그날 근무교사, rule_name에 유형)', () => {
  const r = run([EX('e1', { blocks: '20:00-22:00;18:30-19:00' })]);
  assert.deepStrictEqual([r.toCancel, r.toUpdate], [[], []]);
  assert.deepStrictEqual(r.toCreate, [{
    term_id: 'T1', student_id: 's1', occurred_at: '2027-03-03T18:30:00', rule_id: 'R-AUTO', rule_name: '무단 지각·결석·이탈(미인정결석)',
    memo: '사전 특이사항 자동: 미인정결석', detected_by: 'duty1@example.com', entered_by: 'att@example.com',
    status: '유효', source: 'F1자동', source_exception_id: 'e1', cancel_reason: '' }]);
});

table('대상 판정: 확정만, 자동 유형만(괄호 설명 무시), 달력에 있는 날짜만', [
  [{ status: '요청' }, 0], [{ status: '취소' }, 0], [{ status: ' 확정 ' }, 1],
  [{ type: '병결' }, 0], [{ type: '미인정지각' }, 1], [{ type: '미인정조퇴' }, 1], [{ type: '미인정결석(무단)' }, 1],
  [{ type: '학원(보강 포함)' }, 0], [{ date: '' }, 0], [{ date: '2027-02-30' }, 0], [{ date: '2027-3-3' }, 0]
], ([extra, n]) => assert.strictEqual(run([EX('e1', extra)]).toCreate.length, n));

test('두 번 실행해도 0건(source_exception_id로 중복 방지)', () => {
  settle([EX('e1'), EX('e2', { student_id: 's2' })]);
});

table('특이사항이 취소되거나 자동 대상 밖 유형으로 바뀌거나 요청으로 돌아가면 OUT 취소(사유 [자동])', [
  [{ status: '취소' }, '취소되었습니다'],
  [{ type: '병결' }, '유형이 바뀌었습니다'],
  [{ status: '요청' }, '확정된 미인정 특이사항이 없습니다']
], ([change, word]) => {
  const v1 = settle([EX('e1')]);
  const r = run([EX('e1', change)], v1);
  assert.deepStrictEqual([r.toCreate, r.toUpdate], [[], []]);
  assert.strictEqual(r.toCancel.length, 1);
  assert.ok(r.toCancel[0].reason.indexOf('[자동] ') === 0 && r.toCancel[0].reason.indexOf(word) >= 0, r.toCancel[0].reason);
});

test('설정 autoTypes만 바뀌면 이미 있는 자동 OUT은 그대로(설정 변경은 앞으로 만들 것에만)', () => {
  const v1 = settle([EX('e1', { type: '미인정지각' })]);
  const narrow = { autoTypes: ['미인정결석'] };
  assert.deepStrictEqual(run([EX('e1', { type: '미인정지각' })], v1, narrow), NOTHING);
  // 새로 들어온 미인정지각은 바뀐 설정대로 만들지 않는다
  assert.deepStrictEqual(run([EX('e1', { type: '미인정지각' }), EX('e9', { type: '미인정지각', student_id: 's9' })], v1, narrow), NOTHING);
  // 그 특이사항의 유형이 병결로 바뀌면 그때 취소
  assert.strictEqual(run([EX('e1', { type: '병결' })], v1, narrow).toCancel.length, 1);
});

test('특이사항 유형이 다른 자동 유형으로 바뀌면 OUT 유지 + rule_name만 새 유형으로(생성값일 때)', () => {
  const v1 = settle([EX('e1')]);
  const r = run([EX('e1', { type: '미인정지각' })], v1);
  assert.deepStrictEqual(r.toUpdate, [{ violationId: v1[0].id, patch: { rule_name: '무단 지각·결석·이탈(미인정지각)' } }]);
  // 사람이 rule_name을 고쳐 두었으면 그대로
  const edited = v1.map((v) => Object.assign({}, v, { rule_name: '무단 결석' }));
  assert.deepStrictEqual(run([EX('e1', { type: '미인정지각' })], edited), NOTHING);
});

test('autoTypes가 비거나 빈 항목뿐이면 기본값(기간 안 자동 OUT이 전부 취소되지 않게)', () => {
  const v1 = settle([EX('e1')]);
  assert.deepStrictEqual(run([EX('e1')], v1, { autoTypes: [] }), NOTHING);
  assert.deepStrictEqual(run([EX('e1')], v1, { autoTypes: ['', ' '] }), NOTHING);
  assert.strictEqual(run([EX('e2')], [], { autoTypes: null }).toCreate.length, 1);
  const trailing = { autoTypes: '미인정지각,미인정조퇴,미인정결석,'.split(',') };
  assert.strictEqual(run([EX('e1', { type: '' })], [], trailing).toCreate.length, 0);
});

test('연결된 특이사항 행을 찾을 수 없으면 자동 OUT 취소 — 그래서 기간 전체 행을 넘겨야 한다', () => {
  const r = run([], [{ id: 'v9', source: 'F1자동', status: '유효', source_exception_id: '없는-id', student_id: 's1', term_id: 'T1' }]);
  assert.deepStrictEqual(r.toCancel.map((c) => c.violationId), ['v9']);
});

test('opts.studentIds: 그 학생의 OUT만 판정(다른 학생 OUT은 특이사항을 안 넘겨도 건드리지 않음)', () => {
  const v1 = settle([EX('e1'), EX('e2', { student_id: 's2' })]);
  const r = run([EX('e1')], v1, { studentIds: ['s1'] });
  assert.deepStrictEqual(r, NOTHING);
  const r2 = run([EX('e1', { status: '취소' }), EX('e3', { student_id: 's3' })], v1, { studentIds: ['s1'] });
  assert.deepStrictEqual(r2.toCancel.map((c) => c.violationId), [v1[0].id]);
  assert.deepStrictEqual(r2.toCreate, []);   // s3는 범위 밖
});

test('교사가 직접 입력한 OUT은 건드리지 않는다', () => {
  const manual = [{ id: 'm1', source: '직접', status: '유효', source_exception_id: '', student_id: 's1', term_id: 'T1' },
    { id: 'm2', source: '직접', status: '유효', source_exception_id: 'e1', student_id: 's1', term_id: 'T1' }];
  assert.deepStrictEqual(run([EX('e1', { status: '취소' })], manual), NOTHING);
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

test("per 'row' 옵션이면 날마다 1OUT", () => {
  const exc = [EX('e2', { group_id: 'G', date: '2027-03-04' }), EX('e3', { group_id: 'G', date: '2027-03-05' })];
  const r = run(exc, [], { per: 'row' });
  assert.deepStrictEqual(r.toCreate.map((c) => c.source_exception_id), ['e2', 'e3']);
  assert.strictEqual(r.toCreate[1].detected_by, '');
});

test('같은 학생·같은 날·겹치는 블록에 다른 묶음 두 건이 확정되면 OUT 두 건 → 퇴실 대상(가정: 결정 22, 중복은 C5가 막음)', () => {
  const v = settle([EX('e1', { blocks: 'ALL' }), EX('e2', { type: '미인정지각', blocks: '18:00-20:00' })]);
  assert.strictEqual(v.length, 2);
  assert.deepStrictEqual(plain(ctx.outLevel_(v, 's1', 'T1')), { count: 2, level: 2, label: '퇴실 대상' });
});

test('묶음의 대표 행만 취소되면 OUT 유지 + 대표·날짜를 남은 첫날로(memo는 사람 칸이라 그대로)', () => {
  const exc = [EX('e2', { group_id: 'G', date: '2027-03-04' }), EX('e3', { group_id: 'G', date: '2027-03-05' })];
  const v1 = settle(exc);
  const after = [EX('e2', { group_id: 'G', date: '2027-03-04', status: '취소' }), exc[1]];
  const r = run(after, v1);
  assert.deepStrictEqual([r.toCreate, r.toCancel], [[], []]);
  // 3월 4일 근무교사(생성값)였으니 3월 5일 근무교사로 — 모르면 빈칸
  assert.deepStrictEqual(r.toUpdate, [{ violationId: v1[0].id, patch: {
    source_exception_id: 'e3', occurred_at: '2027-03-05T00:00:00', detected_by: '' } }]);
  settle(after, v1);
  assert.strictEqual(run(exc.map((e) => Object.assign({}, e, { status: '취소' })), v1).toCancel.length, 1);
});

test('사람이 고친 occurred_at·memo·detected_by는 매번 되돌리지 않는다', () => {
  const v1 = settle([EX('e1', { blocks: '18:00-20:00' })]);
  const edited = v1.map((v) => Object.assign({}, v, { occurred_at: '2027-03-03T18:40:00', memo: '18:40에 확인', detected_by: 'other@example.com' }));
  assert.deepStrictEqual(run([EX('e1', { blocks: '18:00-20:00' })], edited), NOTHING);
  // 대표·날짜가 그대로면 블록만 바뀌어도 사람이 고친 시각은 그대로(구별할 수 없음)
  assert.deepStrictEqual(run([EX('e1', { blocks: '19:00-20:00' })], edited), NOTHING);
});

test('특이사항 날짜를 고치면 occurred_at을 고치고, 근무교사는 생성값일 때만 새 날짜 교사로', () => {
  const v1 = settle([EX('e1')]);
  const r = run([EX('e1', { date: '2027-03-04', blocks: '19:00-20:00' })], v1);
  assert.deepStrictEqual(r.toUpdate, [{ violationId: v1[0].id, patch: { occurred_at: '2027-03-04T19:00:00', detected_by: 'duty2@example.com,duty3@example.com' } }]);
  const edited = v1.map((v) => Object.assign({}, v, { detected_by: 'other@example.com' }));
  assert.deepStrictEqual(run([EX('e1', { date: '2027-03-04' })], edited).toUpdate, [{ violationId: v1[0].id, patch: { occurred_at: '2027-03-04T00:00:00' } }]);
});

test('처음 근무교사를 몰라 빈칸이었으면 나중에 근무표가 생길 때 채운다', () => {
  const v1 = settle([EX('e1', { date: '2027-03-10' })]);
  assert.strictEqual(v1[0].detected_by, '');
  const r = run([EX('e1', { date: '2027-03-10' })], v1, { dutyByDate: { '2027-03-10': 'duty9@example.com' } });
  assert.deepStrictEqual(r.toUpdate, [{ violationId: v1[0].id, patch: { detected_by: 'duty9@example.com' } }]);
});

table('특이사항 행의 학생·기간을 고쳐 쓰면 잘못된 OUT을 취소하고 바른 쪽에 새로 만든다', [
  [{ student_id: 's2' }, 's2', 'T1'],
  [{ term_id: 'T2' }, 's1', 'T2']
], ([change, sid, tid]) => {
  const v1 = settle([EX('e1')]);
  const r = run([EX('e1', change)], v1);
  assert.deepStrictEqual(r.toCancel.map((c) => c.violationId), [v1[0].id]);
  assert.ok(r.toCancel[0].reason.indexOf('학생 또는 기간') >= 0);
  assert.deepStrictEqual(r.toCreate.map((c) => [c.student_id, c.term_id]), [[sid, tid]]);
  const v2 = settle([EX('e1', change)], v1);
  assert.strictEqual(plain(ctx.outLevel_(v2, 's1', 'T1')).count, 0);
  assert.strictEqual(plain(ctx.outLevel_(v2, sid, tid)).count, 1);
});

test('같은 단위에 살아 있는 자동 OUT이 둘이면 하나만 남기고 [자동] 중복 취소', () => {
  const base = run([EX('e1')]).toCreate[0];
  const vio = [Object.assign({}, base, { id: 'a' }), Object.assign({}, base, { id: 'b' })];
  const r = run([EX('e1')], vio);
  assert.deepStrictEqual([r.toCreate, r.toUpdate], [[], []]);
  assert.deepStrictEqual(r.toCancel.map((c) => c.violationId), ['b']);
  assert.ok(r.toCancel[0].reason.indexOf('중복') >= 0);
});

test('관리자가 직접 취소한 자동 OUT은 다시 만들지 않고(가정), [자동] 취소 뒤 다시 대상이 되면 새로 만든다', () => {
  const cancelled = (reason) => [{ id: 'a', term_id: 'T1', student_id: 's1', source: 'F1자동', status: '취소', source_exception_id: 'e1', cancel_reason: reason }];
  assert.deepStrictEqual(run([EX('e1')], cancelled('잘못 입력(관리자)')), NOTHING);
  assert.strictEqual(run([EX('e1')], cancelled('[자동] 특이사항 유형이 바뀌었습니다')).toCreate.length, 1);
});

test("per를 'group'↔'row'로 바꿔도 관리자가 취소한 묶음은 다시 만들지 않는다(가정)", () => {
  const exc = [EX('e1', { group_id: 'G', date: '2027-03-03' }), EX('e2', { group_id: 'G', date: '2027-03-04' }), EX('e3', { group_id: 'G', date: '2027-03-05' })];
  const vio = [{ id: 'm1', term_id: 'T1', student_id: 's1', source: 'F1자동', status: '취소', cancel_reason: '관리자 판단', source_exception_id: 'e1' }];
  assert.deepStrictEqual(run(exc, vio, { per: 'row' }), NOTHING);
  assert.deepStrictEqual(run(exc, vio, { per: 'group' }), NOTHING);
});

test('관리자가 잘못된 학생(s1)의 자동 OUT을 취소한 뒤 특이사항 학생을 s2로 고치면 s2에게는 만든다', () => {
  const vio = [{ id: 'm1', term_id: 'T1', student_id: 's1', source: 'F1자동', status: '취소', cancel_reason: '학생 잘못', source_exception_id: 'e1' }];
  assert.deepStrictEqual(run([EX('e1', { student_id: 's2' })], vio).toCreate.map((c) => c.student_id), ['s2']);
});

test('흐름: 입력 → 자동 OUT → 유형 변경으로 취소 → 다시 미인정 → 새 OUT, 매 단계 수렴', () => {
  let vio = [];
  vio = settle([EX('e1')], vio);
  vio = settle([EX('e1', { type: '병결' })], vio);
  vio = settle([EX('e1', { type: '미인정지각' })], vio);
  assert.strictEqual(vio.filter((v) => v.status === '유효').length, 1);
  assert.strictEqual(plain(ctx.outLevel_(vio, 's1', 'T1')).count, 1);
});

table('occurred_at: 첫 블록 시작(parseBlockSpec_ 기준 정렬), ALL·잘못된 표기는 00:00', [
  ['ALL', '00:00'], ['15:00-24:00', '15:00'], ['20:00-22:00;9:00-12:00', '09:00'], ['엉망', '00:00'], ['', '00:00'],
  ['23:00-22:00', '00:00']     // 시작이 끝보다 늦은 표기는 출석부도 거부한다
], ([blocks, hm]) => assert.strictEqual(run([EX('e1', { blocks })]).toCreate[0].occurred_at, '2027-03-03T' + hm + ':00'));

test('입력자: 확정자가 없으면 요청자, 기본 규칙 이름', () => {
  const r = plain(ctx.reconcileAutoOuts_([EX('e1', { confirmed_by: '', type: '미인정조퇴' })], [], {}));
  assert.strictEqual(r.toCreate[0].entered_by, 'homeroom@example.com');
  assert.strictEqual(r.toCreate[0].rule_name, '무단 지각·결석·이탈(미인정조퇴)');
  assert.deepStrictEqual(plain(ctx.reconcileAutoOuts_(null, null, null)), NOTHING);
});

/* ───── outLevel_ ───── */
const V = (id, extra) => Object.assign({ id, term_id: 'T1', student_id: 's1', status: '유효', source: '직접' }, extra || {});
table('outLevel_: 학기마다 초기화, 취소 제외, 2개 이상이면 퇴실 대상', [
  [[], 0, ''],
  [[V('a')], 1, '1OUT'],
  [[V('a'), V('b', { source: 'F1자동' })], 2, '퇴실 대상'],
  [[V('a'), V('b'), V('c')], 2, '퇴실 대상'],
  [[V('a'), V('b', { status: '취소' })], 1, '1OUT'],
  [[V('a'), V('b', { term_id: 'T0' })], 1, '1OUT'],
  [[V('a'), V('b', { student_id: 's2' })], 1, '1OUT'],
  [[V('a', { status: '' })], 1, '1OUT']
], ([vio, level, label]) => {
  const r = plain(ctx.outLevel_(vio, 's1', 'T1'));
  assert.strictEqual(r.level, level);
  assert.strictEqual(r.label, label);
});
