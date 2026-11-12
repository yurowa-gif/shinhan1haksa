/** R5 OutRules — 자동 1OUT 맞추기, OUT 단계. 표 형식, 가짜 값만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/StatusRules.gs', 'src/rules/OutRules.gs']);

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

/* ───── 총괄 2차 검토 ───── */

test('설정을 넓혀도 앞으로만: 넓힌 유형(기타)은 autoTypeSince 이전에 확정된 특이사항에 만들지 않는다(총괄 결정)', () => {
  const exc = [EX('old', { type: '기타', confirmed_at: '2027-03-03T09:00:00' }), EX('new', { type: '기타', student_id: 's2', confirmed_at: '2027-03-10T09:00:00' })];
  const wide = { autoTypes: ['미인정지각', '미인정조퇴', '미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T12:00:00' } };
  assert.deepStrictEqual(run(exc, [], wide).toCreate.map((c) => c.source_exception_id), ['new']);
  // since가 없으면 지금처럼(F4 처음 연결 때 한꺼번에 만들기)
  assert.strictEqual(run(exc, [], { autoTypes: wide.autoTypes }).toCreate.length, 2);
  // 공백 구분 일시도 같은 순서, 확정 시각이 비면 since 이전으로 본다
  const since = { autoTypes: wide.autoTypes, autoTypeSince: { '기타': '2027-03-05T12:00:00' } };
  assert.deepStrictEqual(run([EX('x', { type: '기타', confirmed_at: '2027-03-05 12:00:00' }), EX('y', { type: '기타', student_id: 's3', confirmed_at: '' })], [], since)
    .toCreate.map((c) => c.source_exception_id), ['x']);
});

test('묶음 일부만 since 이후에 확정되면 그 행들로만 만든다(대표·외 N일)', () => {
  const exc = [EX('g1', { group_id: 'G', date: '2027-03-03', confirmed_at: '2027-03-01T09:00:00' }),
    EX('g2', { group_id: 'G', date: '2027-03-04', confirmed_at: '2027-03-06T09:00:00' })];
  const r = run(exc.map((e) => Object.assign({}, e, { type: '기타' })), [], { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } });
  assert.deepStrictEqual(r.toCreate.map((c) => [c.source_exception_id, c.memo]), [['g2', '사전 특이사항 자동: 기타']]);
});

table('rule_name은 vocabulary 형식일 때만 유형을 읽는다, 못 읽으면 설정을 좁혀도 취소하지 않는다', [
  ['무단 지각·결석·이탈(미인정지각)', 1],          // 읽음: 미인정지각 → 그 유형 행이 있으니 유지 … 아래에서 유형을 병결로 바꿔 취소 확인
  ['무단 결석(미인정지각)', 0],                     // 형식 아님 → 알 수 없음 → 유형으로 취소 안 함
  ['직접 고친 이름', 0],
  ['무단 지각·결석·이탈()', 0]
], ([ruleName, cancelsOnTypeChange]) => {
  const base = Object.assign({}, run([EX('e1', { type: '미인정지각' })]).toCreate[0], { id: 'v1', rule_name: ruleName });
  // 설정을 좁혀도(미인정지각 빠짐) 유지
  assert.deepStrictEqual(run([EX('e1', { type: '미인정지각' })], [base], { autoTypes: ['미인정결석'] }).toCancel, []);
  // 특이사항 유형이 병결로 바뀌면: 형식이 맞을 때만 취소
  assert.strictEqual(run([EX('e1', { type: '병결' })], [base], { autoTypes: ['미인정결석'] }).toCancel.length, cancelsOnTypeChange);
});

test('rule_name 안 유형에 괄호가 있어도 읽는다(바깥 괄호만 벗김)', () => {
  const base = Object.assign({}, run([EX('e1', { type: '미인정지각(보충)' })]).toCreate[0], { id: 'v1' });
  assert.strictEqual(base.rule_name, '무단 지각·결석·이탈(미인정지각)');
  const odd = Object.assign({}, base, { rule_name: '무단 지각·결석·이탈(기타(현장 확인))' });
  assert.deepStrictEqual(run([EX('e1', { type: '기타(현장 확인)' })], [odd], { autoTypes: ['미인정결석'] }).toCancel, []);
  assert.strictEqual(run([EX('e1', { type: '병결' })], [odd], { autoTypes: ['미인정결석'] }).toCancel.length, 1);
});

test('관리자 취소 차단의 묶음 키는 취소된 OUT의 학생: 묶음 대표 행만 다른 학생으로 고쳐도 원래 학생 묶음은 계속 차단', () => {
  // s1의 묶음 G(e1·e2) OUT을 관리자가 취소 → 대표 e1만 학생을 s2로 고침, e2는 s1 그대로
  const vio = [{ id: 'm1', term_id: 'T1', student_id: 's1', source: 'F1자동', status: '취소', cancel_reason: '관리자 판단', source_exception_id: 'e1' }];
  const exc = [EX('e1', { group_id: 'G', student_id: 's2', date: '2027-03-03' }), EX('e2', { group_id: 'G', date: '2027-03-04' })];
  // s1 묶음(e2)은 다시 만들지 않고, 새 학생 s2(e1)에게는 만든다
  assert.deepStrictEqual(run(exc, vio).toCreate.map((c) => [c.student_id, c.source_exception_id]), [['s2', 'e1']]);
});

test('특이사항 날짜가 원본: 사람이 OUT 날짜를 고쳐도 대표 날짜로 되돌린다(시각만 고친 것은 둔다)', () => {
  const v1 = settle([EX('e1', { blocks: '18:00-20:00' })]);
  const dateEdited = v1.map((v) => Object.assign({}, v, { occurred_at: '2027-03-04T18:00:00' }));
  assert.deepStrictEqual(run([EX('e1', { blocks: '18:00-20:00' })], dateEdited).toUpdate[0].patch.occurred_at, '2027-03-03T18:00:00');
});

/* ───── 총괄 3차 검토 ───── */

test('since로 만든 묶음 OUT의 대표가 다음 실행에서 since 이전 행으로 옮겨지지 않는다(두 번째 실행 0건)', () => {
  const exc = [EX('g1', { group_id: 'G', type: '기타', date: '2027-03-03', confirmed_at: '2027-03-01T09:00:00' }),
    EX('g2', { group_id: 'G', type: '기타', date: '2027-03-04', confirmed_at: '2027-03-06T09:00:00' })];
  const o = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } };
  const v = settle(exc, [], o);
  assert.strictEqual(v[0].source_exception_id, 'g2');
});

test('since는 넓힌 유형에만: 처음부터 자동이던 유형은 [자동] 취소 뒤 다시 확정되면 OUT이 돌아온다', () => {
  const o = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } };
  let v = settle([EX('e1', { confirmed_at: '2027-03-01T09:00:00' })], [], o);
  v = settle([EX('e1', { status: '요청' })], v, o);
  assert.strictEqual(v.filter((x) => x.status === '유효').length, 0);
  v = settle([EX('e1', { confirmed_at: '2027-03-01T09:00:00' })], v, o);
  assert.strictEqual(v.filter((x) => x.status === '유효').length, 1);
});

table('rule_name 괄호 짝: 형식이 아니면 알 수 없음 — 유형으로 취소하지 않고 대표도 옮기지 않는다', [
  '무단 지각·결석·이탈(미인정지각) (학부모 통화)', '무단 지각·결석·이탈( )', '무단 지각·결석·이탈((미인정지각))',
  '무단 지각·결석·이탈(미인정지각', '무단 지각·결석·이탈)미인정지각('
], (ruleName) => {
  assert.strictEqual(ctx.outRecordedType_(ruleName, '무단 지각·결석·이탈'), null);
  const base = Object.assign({}, run([EX('e1', { type: '미인정지각' })]).toCreate[0], { id: 'v1', rule_name: ruleName, memo: '사람 메모' });
  // 특이사항 유형이 병결로 바뀌어도(알 수 없음이라) 취소·대표 이동·고침 없음
  assert.deepStrictEqual(run([EX('e1', { type: '병결' })], [base]), NOTHING);
  // 묶음에 비자동 행(병결)만 남아도 그 행으로 대표를 옮기지 않는다
  const grp = Object.assign({}, base, { source_exception_id: 'a' });
  assert.deepStrictEqual(run([EX('a', { group_id: 'G', status: '취소', type: '미인정지각' }), EX('b', { group_id: 'G', date: '2027-03-04', type: '병결' })], [grp]), NOTHING);
});

table('rule_name 형식 읽기: 안쪽 짝 맞는 괄호 허용', [
  ['무단 지각·결석·이탈(미인정지각)', '미인정지각'], ['무단 지각·결석·이탈(기타(현장 확인))', '기타'], ['무단 지각·결석·이탈( 미인정결석 )', '미인정결석']
], ([n, want]) => assert.strictEqual(ctx.outRecordedType_(n, '무단 지각·결석·이탈'), want));

test('학생이 바뀐 OUT을 바른 쪽에 다시 만들 때는 지금 설정·since와 상관없이(이미 OUT이 있던 특이사항)', () => {
  const wide = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } };
  const v1 = settle([EX('e1', { type: '기타', confirmed_at: '2027-03-06T09:00:00' })], [], wide);
  // 그 뒤 설정을 좁혀 '기타'가 빠졌고(새로 만들 자격은 없음), 특이사항의 학생을 s2로 고친 경우
  const narrow = { autoTypes: ['미인정결석'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } };
  const r = run([EX('e1', { type: '기타', student_id: 's2', confirmed_at: '2027-03-06T09:00:00' })], v1, narrow);
  assert.deepStrictEqual(r.toCancel.length, 1);
  assert.deepStrictEqual(r.toCreate.map((c) => [c.student_id, c.rule_name]), [['s2', '무단 지각·결석·이탈(기타)']]);
  settle([EX('e1', { type: '기타', student_id: 's2', confirmed_at: '2027-03-06T09:00:00' })], v1, narrow);
});

test('사람이 OUT의 날짜와 시각을 함께 고치면 날짜·시각 모두 생성값으로 되돌린다(특이사항 날짜가 원본)', () => {
  const v1 = settle([EX('e1', { blocks: '18:00-20:00' })]);
  const edited = v1.map((v) => Object.assign({}, v, { occurred_at: '2027-03-04T21:10:00' }));
  assert.deepStrictEqual(run([EX('e1', { blocks: '18:00-20:00' })], edited).toUpdate[0].patch.occurred_at, '2027-03-03T18:00:00');
});

/* ───── 총괄 오라클 감사(변이 생존분) ───── */

test('설정을 좁혔다가 다시 넓혀도 이미 있는 자동 OUT은 그대로(결정 40: 설정 변경은 기존 OUT을 죽이지 않는다)', () => {
  const exc = [EX('e1', { type: '기타', confirmed_at: '2027-03-06T09:00:00' })];
  const wide1 = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } };
  let v = settle(exc, [], wide1).map((x) => Object.assign({ created_at: '2027-03-06T10:00:00' }, x));
  v = settle(exc, v, { autoTypes: ['미인정결석'], autoTypeSince: wide1.autoTypeSince });            // 좁힘: 유지
  v = settle(exc, v, { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-08T00:00:00' } });   // 다시 넓힘
  assert.deepStrictEqual(v.filter((x) => x.status === '유효').map((x) => x.source_exception_id), ['e1']);
  // 처음 넓힌 시각 이전에 확정된 행만 남으면(그 OUT을 만들 때 세지 않은 행) 지금처럼 취소
  const v2 = settle([EX('e0', { group_id: 'G', type: '기타', confirmed_at: '2027-03-01T09:00:00' }), EX('e1', { group_id: 'G', type: '기타', date: '2027-03-04', confirmed_at: '2027-03-06T09:00:00' })], [], wide1)
    .map((x) => Object.assign({ created_at: '2027-03-06T10:00:00' }, x));
  const r = run([EX('e0', { group_id: 'G', type: '기타', confirmed_at: '2027-03-01T09:00:00' }), EX('e1', { group_id: 'G', type: '기타', date: '2027-03-04', status: '취소' })], v2, wide1);
  assert.strictEqual(r.toCancel.length, 1);
});

test('대표 유지: 지금 대표가 유지 행이면 더 이른 행이 나중에 확정돼도 옮기지 않는다', () => {
  const exc = [EX('g1', { group_id: 'G', date: '2027-03-03', status: '요청' }), EX('g2', { group_id: 'G', date: '2027-03-04' })];
  const v = settle(exc, []);
  assert.strictEqual(v[0].source_exception_id, 'g2');
  const later = [Object.assign({}, exc[0], { status: '확정' }), exc[1]];
  assert.deepStrictEqual(run(later, v), NOTHING);
});

test('대표: 같은 날짜면 id가 앞선 행', () => {
  const exc = [EX('b', { group_id: 'G' }), EX('a', { group_id: 'G' })];
  assert.strictEqual(run(exc).toCreate[0].source_exception_id, 'a');
});

test('rule_name을 못 읽고 자격 행도 없으면 취소도 고침도 없다(대표·날짜·근무교사 그대로)', () => {
  const v = [Object.assign({}, run([EX('e1')]).toCreate[0], { id: 'v1', rule_name: '직접 고친 이름', occurred_at: '2027-03-09T00:00:00', detected_by: '' })];
  assert.deepStrictEqual(run([EX('e1', { type: '병결' })], v), NOTHING);
});

/* ───── 총괄 4차 검증 ───── */

test('좁혔다 다시 넓힌 뒤 특이사항 학생을 바로잡아 다시 만든 OUT은 다음 실행에서 취소되지 않는다(수렴)', () => {
  const ex = (sid) => [EX('e1', { student_id: sid, type: '기타', confirmed_at: '2027-03-06T09:00:00' })];
  const o = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-08T00:00:00' } };   // 다시 넓힌 since
  const old = [Object.assign({}, run(ex('s1'), [], { autoTypes: o.autoTypes }).toCreate[0], { id: 'v1', created_at: '2027-03-06T10:00:00' })];
  // 학생을 s2로 바로잡음 → s1 OUT 취소 + s2에 새로 만듦(새 created_at은 since보다 늦다)
  let v = save(old, run(ex('s2'), old, o)).map((x) => Object.assign({ created_at: '2027-03-09T10:00:00' }, x));
  assert.deepStrictEqual(v.filter((x) => x.status === '유효').map((x) => x.student_id), ['s2']);
  assert.deepStrictEqual(run(ex('s2'), v, o), NOTHING);
});

test('대표를 옮길 때는 남은 유지 행 중 가장 이른 날(3일 묶음에서 첫날 취소 → 둘째 날)', () => {
  const exc = [EX('e1', { group_id: 'G', date: '2027-03-03' }), EX('e2', { group_id: 'G', date: '2027-03-04' }), EX('e3', { group_id: 'G', date: '2027-03-05' })];
  const v = settle(exc);
  const r = run([Object.assign({}, exc[0], { status: '취소' }), exc[1], exc[2]], v);
  assert.strictEqual(r.toUpdate[0].patch.source_exception_id, 'e2');
});

test('OUT의 created_at이 비면 since로 거르지 않는다(유지)', () => {
  const o = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-08T00:00:00' } };
  const v = [Object.assign({}, run([EX('e1', { type: '기타' })], [], { autoTypes: o.autoTypes }).toCreate[0], { id: 'v1', created_at: '' })];
  assert.deepStrictEqual(run([EX('e1', { type: '기타', confirmed_at: '2027-03-01T09:00:00' })], v, o).toCancel, []);
});

/* ───── R9: O43 회귀, outAutoSinceNext_, outDismissalGate_ ───── */

test('O43: 같은 묶음의 앞선 자동 OUT이 중복·유형 변경으로 [자동] 취소돼 있어도, since 이전 확정 행만 남으면 since 뒤에 만든 OUT은 취소', () => {
  const o = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } };
  const exc = [EX('e1', { group_id: 'G', type: '기타', confirmed_at: '2027-03-01T09:00:00' }), EX('e2', { group_id: 'G', type: '기타', date: '2027-03-04', status: '취소' })];
  for (const reason of ['[자동] 같은 특이사항의 자동 OUT이 이미 있습니다(중복)', '[자동] 특이사항 유형이 바뀌었습니다']) {
    const vio = [{ id: 'v1', term_id: 'T1', student_id: 's1', source: 'F1자동', status: '취소', cancel_reason: reason, source_exception_id: 'e1', rule_name: '무단 지각·결석·이탈(기타)' },
      { id: 'v2', term_id: 'T1', student_id: 's1', source: 'F1자동', status: '유효', source_exception_id: 'e2', rule_name: '무단 지각·결석·이탈(기타)',
        occurred_at: '2027-03-04T00:00:00', created_at: '2027-03-06T10:00:00' }];
    assert.deepStrictEqual(run(exc, vio, o).toCancel.map((c) => c.violationId), ['v2'], reason);
  }
});

const snap = (s, cur, now) => plain(ctx.outAutoSinceNext_(s, cur, now, ['미인정지각', '미인정조퇴', '미인정결석']));
const DEF = ['미인정지각', '미인정조퇴', '미인정결석'];
test('outAutoSinceNext_: 처음(null) + 기본 3종 → since {}(일괄 생성), 스냅숏 분실(null) + 기타가 이미 설정됨 → 기타 since = now', () => {
  assert.deepStrictEqual(snap(null, DEF, '2027-03-01T09:00:00'), { snapshot: { types: DEF, since: {}, widened: {} }, since: {}, widened: {}, changed: true });
  const r = snap(null, DEF.concat(['기타']), '2027-03-01T09:00:00');
  assert.deepStrictEqual([r.since, r.widened, r.changed], [{ '기타': '2027-03-01T09:00:00' }, { '기타': ['2027-03-01T09:00:00'] }, true]);
});

test('outAutoSinceNext_: 기타 넓힘 T1 → 좁혀도 T1 유지 → 다시 넓히면 T2로 덮음, 그대로면 changed false, 괄호 설명은 떼고 비교', () => {
  let s = snap(null, DEF, '2027-03-01T09:00:00').snapshot;
  let r = snap(s, DEF.concat(['기타']), '2027-03-05T09:00:00');
  assert.deepStrictEqual([r.since, r.changed], [{ '기타': '2027-03-05T09:00:00' }, true]);
  r = snap(r.snapshot, DEF, '2027-03-07T09:00:00');
  assert.deepStrictEqual([r.since, r.changed, r.snapshot.types], [{ '기타': '2027-03-05T09:00:00' }, true, DEF]);
  r = snap(r.snapshot, DEF.concat(['기타']), '2027-03-09 09:00:00');
  assert.deepStrictEqual([r.since, r.widened], [{ '기타': '2027-03-09T09:00:00' }, { '기타': ['2027-03-05T09:00:00', '2027-03-09T09:00:00'] }]);   // 넓힘 이력은 쌓인다
  const again = snap(snap(r.snapshot, DEF, '2027-03-10T09:00:00').snapshot, DEF.concat(['기타']), '2027-03-12T09:00:00');
  assert.deepStrictEqual(again.widened, { '기타': ['2027-03-05T09:00:00', '2027-03-09T09:00:00', '2027-03-12T09:00:00'] });
  const same = snap(r.snapshot, ['미인정결석(무단)', '미인정지각', '미인정조퇴', '기타'], '2027-03-10T09:00:00');
  assert.deepStrictEqual([same.changed, same.since], [false, { '기타': '2027-03-09T09:00:00' }]);
});

test('outAutoSinceNext_: 옛 스냅숏(widened 없음)은 since 값 하나로 이력을 시작한다', () => {
  const r = snap({ types: DEF, since: { '기타': '2027-03-05T09:00:00' } }, DEF.concat(['기타']), '2027-03-09T09:00:00');
  assert.deepStrictEqual(r.widened, { '기타': ['2027-03-05T09:00:00', '2027-03-09T09:00:00'] });
});

test('넓힘 이력(R5 지름길): 넓힘 3/5 → OUT(3/6) → 좁힘 → 다시 넓힘 3/8 뒤 since 뒤 행을 취소하면, 처음 넓히기 전 행만 남은 OUT은 취소(한 시각만 주면 지름길대로 유지)', () => {
  const G = (st1) => [EX('e0', { group_id: 'G', type: '기타', confirmed_at: '2027-03-01T09:00:00' }),
    EX('e1', { group_id: 'G', type: '기타', date: '2027-03-04', confirmed_at: '2027-03-06T09:00:00', status: st1 })];
  const wide1 = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-05T00:00:00' } };
  const v = settle(G('확정'), [], wide1).map((x) => Object.assign({ created_at: '2027-03-06T10:00:00' }, x));
  assert.deepStrictEqual(v.map((x) => x.source_exception_id), ['e1']);
  const hist = { autoTypes: wide1.autoTypes, autoTypeSince: { '기타': ['2027-03-08T00:00:00', '2027-03-05T00:00:00'] } };   // 순서 무관
  assert.deepStrictEqual(run(G('취소'), v, hist).toCancel.map((c) => c.violationId), [v[0].id]);
  const one = { autoTypes: wide1.autoTypes, autoTypeSince: { '기타': '2027-03-08T00:00:00' } };   // 옛 모양: 대표가 e0로 옮겨 유지(덜 죽임)
  const kept = run(G('취소'), v, one);
  assert.deepStrictEqual([kept.toCancel, kept.toUpdate.map((u) => u.patch.source_exception_id)], [[], ['e0']]);
  // 이력이 있어도 OUT 뒤 넓힘으로는 거르지 않는다: 3/5 전 OUT(created 3/4)은 그대로
  const early = v.map((x) => Object.assign({}, x, { created_at: '2027-03-04T10:00:00' }));
  assert.deepStrictEqual(run(G('취소'), early, hist).toCancel, []);
  assert.deepStrictEqual(run([EX('n1', { type: '기타', confirmed_at: '2027-03-06T09:00:00' })], [], hist).toCreate, []);   // 새로 만들기는 가장 최근 넓힘(3/8) 기준
  const same = v.map((x) => Object.assign({}, x, { created_at: '2027-03-05T00:00:00' }));   // 넓힌 바로 그 시각에 만든 OUT은 그 넓힘 기준
  assert.deepStrictEqual(run(G('취소'), same, hist).toCancel.map((c) => c.violationId), [v[0].id]);
});

test('학생을 바로잡아 다시 만든 OUT은 per를 group→row로 바꾼 뒤 대표가 옮겨 간 행의 단위에서도 since로 거르지 않는다(R5)', () => {
  const o = { autoTypes: ['미인정결석', '기타'], autoTypeSince: { '기타': '2027-03-08T00:00:00' }, per: 'row' };
  const exc = [EX('e1', { group_id: 'G', student_id: 's2', type: '기타', confirmed_at: '2027-03-01T09:00:00', status: '취소' }),
    EX('e2', { group_id: 'G', student_id: 's2', type: '기타', date: '2027-03-04', confirmed_at: '2027-03-01T09:00:00' })];
  const vio = [{ id: 'v0', term_id: 'T1', student_id: 's1', source: 'F1자동', status: '취소', cancel_reason: '[자동] 특이사항의 학생 또는 기간이 바뀌었습니다',
    source_exception_id: 'e1', rule_name: '무단 지각·결석·이탈(기타)' },
  { id: 'v1', term_id: 'T1', student_id: 's2', source: 'F1자동', status: '유효', source_exception_id: 'e2', rule_name: '무단 지각·결석·이탈(기타)',
    occurred_at: '2027-03-04T00:00:00', created_at: '2027-03-09T10:00:00', entered_by: 'att@example.com', detected_by: '' }];
  assert.deepStrictEqual(run(exc, vio, o).toCancel, []);
  assert.deepStrictEqual(run(exc, vio, Object.assign({}, o, { per: 'group' })).toCancel, []);
});

test('outAutoSinceNext_: 잘못된 시각은 Error', () => {
  assert.throws(() => snap(null, DEF.concat(['기타']), '3월 1일'), /일시/);
});

// 면담 관문: s1의 T1 OUT 2건(o1 3/3, o2 3/10), 면담 n1(o2에 연결)
const OUT = (id, occurred_at, extra) => Object.assign({ id, term_id: 'T1', student_id: 's1', occurred_at, created_at: occurred_at, status: '유효', source: '직접' }, extra || {});
const NOTE = (extra) => Object.assign({ id: 'n1', student_id: 's1', type: '2OUT 학부모 면담', linked_violation_id: 'o2', status: '유효', date: '2027-03-11', teacher_email: 'hr@example.com' }, extra || {});
const HALL_IN = [{ id: 'c1', student_id: 's1', item: '학사', value: '입실', effective_date: '2027-03-01', status: '유효' }];
const gate = (vio, notes, changes) => plain(ctx.outDismissalGate_(vio, notes, changes || HALL_IN, 's1', 'T1', '2027-03-12'));
const TWO = () => [OUT('o2', '2027-03-10T21:00:00'), OUT('o1', '2027-03-03T21:00:00')];

table('outDismissalGate_: 면담 기록이 있어야 퇴실 확정(결정 4·PRD F12)', [
  ['면담 전', TWO(), [], false, '면담 기록 필요'],
  ['면담 후', TWO(), [NOTE()], true, ''],
  ['면담 취소', TWO(), [NOTE({ status: '취소' })], false, '면담 기록 필요'],
  ['면담 날짜 < 둘째 OUT 발생일', TWO(), [NOTE({ date: '2027-03-09' })], false, '면담 기록 필요'],
  ['면담 날짜 = 둘째 OUT 발생일', TWO(), [NOTE({ date: '2027-03-10' })], true, ''],
  ['연결 OUT이 관리자 취소로 죽고 다른 2건이 남음(결정 51)', TWO().map((v) => (v.id === 'o2' ? Object.assign(v, { status: '취소' }) : v)).concat([OUT('o3', '2027-03-11T21:00:00')]),
    [NOTE()], false, '면담 기록 필요'],
  ['다른 학생 면담', TWO(), [NOTE({ student_id: 's2' })], false, '면담 기록 필요'],
  ['다른 유형 면담', TWO(), [NOTE({ type: '진로 상담' })], false, '면담 기록 필요'],
  ['지난 기간 OUT에 연결', TWO().concat([OUT('old', '2026-12-01T21:00:00', { term_id: 'T0' })]), [NOTE({ linked_violation_id: 'old' })], false, '면담 기록 필요'],
  ['OUT 1건', [OUT('o1', '2027-03-03T21:00:00')], [NOTE({ linked_violation_id: 'o1' })], false, '퇴실 대상 아님']
], ([, vio, notes, ok, reason]) => {
  const r = gate(vio, notes);
  assert.deepStrictEqual([r.ok, r.reason], [ok, reason]);
});

test('outDismissalGate_: 결과 모양 — triggerOutId = 발생 순 둘째(같으면 created_at·id), 면담 칸은 id·날짜·교사만', () => {
  const r = gate(TWO(), [NOTE({ content: '내용은 넘어오지 않는다' })]);
  assert.deepStrictEqual(r, { count: 2, level: 2, triggerOutId: 'o2', meetingNote: { id: 'n1', date: '2027-03-11', teacher_email: 'hr@example.com' }, alreadyLeft: false, ok: true, reason: '' });
  const tie = [OUT('b', '2027-03-03T21:00:00'), OUT('a', '2027-03-03T21:00:00')];
  assert.strictEqual(gate(tie, []).triggerOutId, 'b');
});

test('outDismissalGate_: 이미 학사 퇴실이면 "이미 퇴실"(그날 학사 상태)', () => {
  const left = HALL_IN.concat([{ id: 'c2', student_id: 's1', item: '학사', value: '퇴실', effective_date: '2027-03-12', status: '유효', requested_at: '2027-03-11T10:00:00' }]);
  const r = gate(TWO(), [NOTE()], left);
  assert.deepStrictEqual([r.alreadyLeft, r.ok, r.reason], [true, false, '이미 퇴실']);
  assert.strictEqual(gate([OUT('o1', '2027-03-03T21:00:00')], [], left).reason, '이미 퇴실');   // 이미 퇴실이 먼저(OUT 1건이어도)
});

/* ───── 총괄 검토(#56) ───── */

test('outDismissalGate_: OUT 3건이면 발생 순 둘째가 기준(3/3·3/10·3/20 + o2에 연결된 3/11 면담 → ok)', () => {
  const r = gate(TWO().concat([OUT('o3', '2027-03-20T21:00:00')]), [NOTE()]);
  assert.deepStrictEqual([r.count, r.triggerOutId, r.ok], [3, 'o2', true]);
});

test('outDismissalGate_: 발생 일시가 같으면 created_at 순(id 순서는 반대여도)', () => {
  const tie = [OUT('a', '2027-03-03T21:00:00', { created_at: '2027-03-04T09:00:00' }), OUT('b', '2027-03-03T21:00:00', { created_at: '2027-03-03T22:00:00' })];
  assert.strictEqual(gate(tie, []).triggerOutId, 'a');
});

const LEAVE = (id, eff, extra) => Object.assign({ id, student_id: 's1', item: '학사', value: '퇴실', effective_date: eff, status: '유효', requested_at: '2027-03-11T10:00:00' }, extra || {});
table('outDismissalGate_: 앞으로 잡힌 퇴실은 2OUT 퇴실(memo [2OUT] 또는 reason 2OUT 퇴실)일 때만 "이미 퇴실", 보통 퇴실·취소된 2OUT은 ok', [
  ['2OUT memo', [LEAVE('c3', '2027-03-20', { memo: '[2OUT] out:o2 note:n1' })], [true, false, '이미 퇴실']],
  ['2OUT reason', [LEAVE('c3', '2027-03-20', { reason: '2OUT 퇴실' })], [true, false, '이미 퇴실']],
  ['보통 미래 퇴실 7/16(신청 3/2, 개인 사정)', [LEAVE('c3', '2027-07-16', { requested_at: '2027-03-02T10:00:00', reason: '개인 사정' })], [false, true, '']],
  ['취소된 2OUT 퇴실', [LEAVE('c3', '2027-03-20', { memo: '[2OUT] out:o2 note:n1', status: '취소' })], [false, true, '']],
  ['다른 학생의 미래 2OUT 퇴실', [LEAVE('c3', '2027-03-20', { student_id: 's2', memo: '[2OUT] out:o2 note:n1' })], [false, true, '']],
  ['기숙사 항목 [2OUT]', [LEAVE('c3', '2027-03-20', { item: '기숙사', memo: '[2OUT] out:o2 note:n1' })], [false, true, '']],
  ['입실 값 [2OUT]', [LEAVE('c3', '2027-03-20', { value: '입실', memo: '[2OUT] out:o2 note:n1' })], [false, true, '']],
  ["memo 'x [2OUT]'(접두 아님)", [LEAVE('c3', '2027-03-20', { memo: 'x [2OUT] out:o2' })], [false, true, '']],
  ['달력에 없는 날짜 9999-99-99', [LEAVE('c3', '9999-99-99', { memo: '[2OUT] out:o2 note:n1' })], [false, true, '']],
  ['지난 2OUT 퇴실 3/5 뒤 재입실 3/8(관문 3/12, 앞으로 잡힌 것만 본다)', [LEAVE('c3', '2027-03-05', { memo: '[2OUT] out:o0 note:n0', requested_at: '2027-03-04T10:00:00' }),
    { id: 'c4', student_id: 's1', item: '학사', value: '입실', effective_date: '2027-03-08', status: '유효', requested_at: '2027-03-07T10:00:00' }], [false, true, '']]
], ([, rows, want]) => {
  const r = gate(TWO(), [NOTE()], HALL_IN.concat(rows));
  assert.deepStrictEqual([r.alreadyLeft, r.ok, r.reason], want);
});

test('outDismissalGate_: ymd에 퇴실 상태면 뒤에 재입실이 잡혀 있어도 "이미 퇴실"(입실 3/1, 퇴실 3/5, 입실 3/20, 관문 3/12)', () => {
  const rows = HALL_IN.concat([LEAVE('c2', '2027-03-05', { requested_at: '2027-03-04T10:00:00' }),
    { id: 'c3', student_id: 's1', item: '학사', value: '입실', effective_date: '2027-03-20', status: '유효', requested_at: '2027-03-06T10:00:00' }]);
  const r = gate(TWO(), [NOTE()], rows);
  assert.deepStrictEqual([r.alreadyLeft, r.ok, r.reason], [true, false, '이미 퇴실']);
});
