/** R23 F9 시간표 제출 규칙: 제출 기간·입력 검사·상태 기계·"확정 전에는 기존 시간표 유지". 가짜 학생만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/TimetableRules.gs']);
const W = { startDay: '25', endDay: 'last' };

test('ttSubmitWindow_: 25일~말일에 다음 달 시간표, 기간 밖이면 다음 기간과 이유', () => {
  const T = [
    // today, cfg, open, month, start, end
    ['2027-03-24', W, false, '2027-04', '2027-03-25', '2027-03-31'],
    ['2027-03-25', W, true, '2027-04', '2027-03-25', '2027-03-31'],
    ['2027-03-31', W, true, '2027-04', '2027-03-25', '2027-03-31'],
    ['2027-04-01', W, false, '2027-05', '2027-04-25', '2027-04-30'],
    ['2027-12-28', W, true, '2028-01', '2027-12-25', '2027-12-31'],
    ['2028-02-29', W, true, '2028-03', '2028-02-25', '2028-02-29'],
    ['2027-02-28', { startDay: 30, endDay: 'last' }, true, '2027-03', '2027-02-28', '2027-02-28'],   // 30일 → 2월 말일
    ['2027-03-29', { startDay: 30, endDay: 'last' }, false, '2027-04', '2027-03-30', '2027-03-31'],
    ['2027-03-20', { startDay: 'x', endDay: '' }, false, '2027-04', '2027-03-25', '2027-03-31'],      // 틀린 설정 → 기본값
    ['2027-03-20', {}, false, '2027-04', '2027-03-25', '2027-03-31'],
    ['2027-03-21', { startDay: '20', endDay: '27' }, true, '2027-04', '2027-03-20', '2027-03-27'],
    ['2027-03-28', { startDay: '20', endDay: '27' }, false, '2027-05', '2027-04-20', '2027-04-27'],
    ['2027-03-27', { startDay: ' 20 ', endDay: 'LAST' }, true, '2027-04', '2027-03-20', '2027-03-31'],
  ];
  T.forEach(([today, cfg, open, month, start, end]) => {
    const r = plain(ctx.ttSubmitWindow_(today, cfg));
    assert.deepStrictEqual([r.open, r.month, r.start, r.end], [open, month, start, end], today + ' ' + JSON.stringify(cfg));
    assert.strictEqual(!!r.reason, !open, today + ' reason');
  });
  assert.match(ctx.ttSubmitWindow_('2027-04-01', W).reason, /^지금은 시간표를 내는 기간이 아닙니다\. 5월 시간표는 4월 25일\(일\)부터 4월 30일\(금\)까지 내 주세요\.$/);
  const bad = plain(ctx.ttSubmitWindow_('2027-03-25', { startDay: '28', endDay: '20' }));
  assert.deepStrictEqual([bad.open, bad.month], [false, '']);
  assert.match(bad.reason, /설정/);
  assert.throws(() => ctx.ttSubmitWindow_('2027-02-30', W), /yyyy-MM-dd/);
});

test('ttValidateEntries_: 요일·구분(학·가)·블록 표기·같은 요일 겹침, 정규화·정렬', () => {
  const ok = plain(ctx.ttValidateEntries_([
    { weekday: '수', blocks: '20:00-22:00', code: '학' },
    { weekday: '월', blocks: '19:00-20:30; 18:00-19:00', code: '가' },
    { weekday: '월', blocks: '20:30-22:00', code: '학' },           // 맞닿기만 — 괜찮다
    { weekday: '화', blocks: 'all', code: '가' },
    { weekday: '수', blocks: '9:00-10:00', code: '학' },
  ]));
  assert.deepStrictEqual(ok, { ok: true, errors: [], rows: [
    { weekday: '월', blocks: '18:00-20:30', code: '가' }, { weekday: '월', blocks: '20:30-22:00', code: '학' },
    { weekday: '화', blocks: 'ALL', code: '가' },
    { weekday: '수', blocks: '09:00-10:00', code: '학' }, { weekday: '수', blocks: '20:00-22:00', code: '학' }] });
  assert.deepStrictEqual(plain(ctx.ttValidateEntries_([])), { ok: true, errors: [], rows: [] });
  assert.deepStrictEqual(plain(ctx.ttValidateEntries_(null)), { ok: true, errors: [], rows: [] });
  const T = [
    [[{ weekday: '월요일', blocks: '18:00-19:00', code: '학' }], /요일/],
    [[{ weekday: '월', blocks: '18:00-19:00', code: '없음' }], /구분/],
    [[{ weekday: '월', blocks: '18:00-19:00', code: '' }], /구분/],
    [[{ weekday: '월', blocks: '19:00-18:00', code: '학' }], /읽을 수 없는 시간입니다\(19:00-18:00\)/],
    [[{ weekday: '월', blocks: '', code: '학' }], /비어/],
    [[{ weekday: '월', blocks: '18:00-20:00', code: '학' }, { weekday: '월', blocks: '19:30-21:00', code: '가' }], /월요일 1번째 줄과 2번째 줄/],
    [[{ weekday: '토', blocks: 'ALL', code: '가' }, { weekday: '토', blocks: '09:00-10:00', code: '학' }], /토요일/],
    [[{ weekday: '일', blocks: '14:00-15:00', code: '학' }, { weekday: '일', blocks: 'ALL', code: '가' }], /일요일/],
  ];
  T.forEach(([entries, re], i) => {
    const r = plain(ctx.ttValidateEntries_(entries));
    assert.strictEqual(r.ok, false, 'case ' + i);
    assert.deepStrictEqual(r.rows, [], 'case ' + i);
    assert.ok(r.errors.some((e) => re.test(e)), 'case ' + i + ': ' + r.errors.join(' / '));
  });
  // 다른 요일은 같은 시간이어도 괜찮다
  assert.ok(ctx.ttValidateEntries_([{ weekday: '월', blocks: 'ALL', code: '가' }, { weekday: '화', blocks: 'ALL', code: '가' }]).ok);
});

// 계획을 시트에 쓴 것처럼(저장 흉내)
let seq = 0;
function apply(rows, r) {
  assert.ok(r.ok, r.reason);
  const cancel = new Set(r.cancel);
  const upd = new Map(r.update.map((u) => [u.id, u.set]));
  return rows.map((x) => cancel.has(x.id) ? Object.assign({}, x, { status: '취소' }) : upd.has(x.id) ? Object.assign({}, x, upd.get(x.id)) : x)
    .concat(r.add.map((x) => Object.assign({ id: 'n' + (++seq) }, x)));
}
const step = (rows, action, now, extra) => plain(ctx.ttTransition_(rows, 's1', '2027-04', action, Object.assign({ now, window: W }, extra || {})));
const ENTRIES = [{ weekday: '월', blocks: '18:00-20:30', code: '학' }, { weekday: '수', blocks: 'ALL', code: '가' }];
// 3월 확정 시간표: 화 학
const MARCH = [{ id: 'm1', student_id: 's1', month: '2027-03', weekday: '화', blocks: '18:00-20:30', code: '학', status: '확정', teacher_confirmed_at: '2027-02-27T10:00:00' },
  { id: 'o1', student_id: 's2', month: '2027-04', weekday: '월', blocks: 'ALL', code: '가', status: '제출' }];
const eff = (rows, ymd) => plain(ctx.effectiveFixedRows_(rows, 's1', ymd)).map((r) => r.weekday + r.code);

test('ttTransition_ 흐름: 제출 → 동의 → 확인, 확정 전에는 출석부가 앞 달 시간표 유지', () => {
  let rows = MARCH.slice();
  const sub = step(rows, 'submit', '2027-03-26T21:00:00', { entries: ENTRIES });
  assert.deepStrictEqual([sub.cancel, sub.update, sub.warnings], [[], [], []]);
  assert.deepStrictEqual(sub.add, [
    { student_id: 's1', month: '2027-04', weekday: '월', blocks: '18:00-20:30', code: '학', submitted_at: '2027-03-26T21:00:00', parent_agreed_at: '', teacher_confirmed_at: '', status: '제출' },
    { student_id: 's1', month: '2027-04', weekday: '수', blocks: 'ALL', code: '가', submitted_at: '2027-03-26T21:00:00', parent_agreed_at: '', teacher_confirmed_at: '', status: '제출' }]);
  rows = apply(rows, sub);
  assert.deepStrictEqual(eff(rows, '2027-04-05'), ['화학'], '제출만 — 앞 달');
  const ag = step(rows, 'agree', '2027-03-27T08:00:00');
  assert.deepStrictEqual(ag.update.map((u) => u.set), [{ status: '동의', parent_agreed_at: '2027-03-27T08:00:00' }, { status: '동의', parent_agreed_at: '2027-03-27T08:00:00' }]);
  rows = apply(rows, ag);
  assert.deepStrictEqual(eff(rows, '2027-04-05'), ['화학'], '동의만 — 앞 달');
  rows = apply(rows, step(rows, 'confirm', '2027-04-02T09:00:00'));   // 늦은 확인(기간 밖)도 된다
  assert.strictEqual(plain(ctx.ttMonthState_(rows, 's1', '2027-04')).status, '확정');
  assert.deepStrictEqual(eff(rows, '2027-04-05'), ['월학', '수가'], '확정 — 새 달');
  assert.deepStrictEqual(eff(rows, '2027-03-30'), ['화학'], '3월 날짜는 3월 시간표');
  assert.deepStrictEqual(eff(rows, '2027-05-10'), ['월학', '수가'], '5월을 안 내면 4월이 이어진다(가정)');
  assert.strictEqual(plain(ctx.ttMonthState_(rows, 's2', '2027-04')).status, '제출', '다른 학생 행은 그대로');
});

test('ttTransition_ 되돌리기: 동의·확인 거두기, 반려, 거두기, 다시 내면 동의·확인 초기화', () => {
  let rows = apply(MARCH, step(MARCH, 'submit', '2027-03-26T21:00:00', { entries: ENTRIES }));
  rows = apply(rows, step(rows, 'agree', '2027-03-27T08:00:00'));
  rows = apply(rows, step(rows, 'unagree', '2027-03-27T09:00:00'));
  assert.deepStrictEqual(ctx.ttMonthState_(rows, 's1', '2027-04').rows.map((r) => [r.status, r.parent_agreed_at]), [['제출', ''], ['제출', '']]);
  rows = apply(rows, step(rows, 'agree', '2027-03-27T10:00:00'));
  rows = apply(rows, step(rows, 'confirm', '2027-03-28T10:00:00'));
  const un = step(rows, 'unconfirm', '2027-03-29T10:00:00');
  assert.deepStrictEqual([un.update[0].set, un.warnings], [{ status: '동의', teacher_confirmed_at: '' }, []]);
  const late = step(rows, 'unconfirm', '2027-04-03T10:00:00');
  assert.match(late.warnings.join(), /이미 시작한 달/);
  rows = apply(rows, un);
  assert.deepStrictEqual(eff(rows, '2027-04-05'), ['화학'], '확인을 거두면 앞 달로');
  // 다시 확정 → 기간 안에 다시 내면 옛 행 취소, 새 행은 동의·확인 빈칸
  rows = apply(rows, step(rows, 'confirm', '2027-03-29T11:00:00'));
  const re = step(rows, 'submit', '2027-03-30T20:00:00', { entries: [{ weekday: '금', blocks: '19:00-22:00', code: '학' }] });
  assert.strictEqual(re.cancel.length, 2);
  assert.deepStrictEqual(re.add.map((x) => [x.weekday, x.status, x.parent_agreed_at, x.teacher_confirmed_at]), [['금', '제출', '', '']]);
  assert.match(re.warnings.join(), /다시 받아야/);
  rows = apply(rows, re);
  assert.deepStrictEqual(eff(rows, '2027-04-05'), ['화학'], '다시 내면 확정 전 — 앞 달');
  // 학부모 돌려보냄(사유 선택) → 학생이 고쳐 다시 낸다 / 돌려보낸 상태에서도 거둘 수 있다
  const pr = step(rows, 'parentReturn', '2027-03-31T09:00:00', { reason: '  금요일은\n 학원 없음 ' });
  assert.deepStrictEqual([pr.update.map((u) => u.set), pr.returned], [[{ status: '반려' }], { by: '학부모', reason: '금요일은 학원 없음' }]);
  rows = apply(rows, pr);
  assert.deepStrictEqual(['status', 'returnedBy'].map((k) => ctx.ttMonthState_(rows, 's1', '2027-04')[k]), ['반려', '학부모']);
  assert.deepStrictEqual(eff(rows, '2027-04-05'), ['화학']);
  const w = step(rows, 'withdraw', '2027-03-31T10:00:00');
  assert.strictEqual(w.cancel.length, 1);
  rows = apply(rows, step(rows, 'submit', '2027-03-31T10:00:00', { entries: [] }));
  assert.deepStrictEqual(ctx.ttMonthState_(rows, 's1', '2027-04').rows.map((r) => [r.code, r.weekday, r.blocks, r.status]), [['없음', '', '', '제출']]);
  rows = apply(rows, step(rows, 'agree', '2027-03-31T11:00:00'));
  rows = apply(rows, step(rows, 'confirm', '2027-03-31T12:00:00'));
  assert.deepStrictEqual(eff(rows, '2027-04-05'), [], "학·가 없는 달('없음') — 앞 달이 이어지지 않는다(결정 31)");
});

test('ttTransition_ 막힘: 상태표(지금 상태 × 행동)', () => {
  const agreed = (status) => status === '동의' || status === '확정' ? { parent_agreed_at: '2027-03-27T08:00:00' } : {};   // 보통 흐름(학생 제출)
  const at = (status) => status ? [Object.assign({ id: 'x1', student_id: 's1', month: '2027-04', weekday: '월', blocks: 'ALL', code: '학', status }, agreed(status)),
    Object.assign({ id: 'x2', student_id: 's1', month: '2027-04', weekday: '화', blocks: 'ALL', code: '가', status }, agreed(status))] : [];
  const OK = {
    '':   { withdraw: 0, agree: 0, unagree: 0, confirm: 0, unconfirm: 0, parentReturn: 0, teacherReturn: 0 },
    '제출': { withdraw: 1, agree: 1, unagree: 0, confirm: 0, unconfirm: 0, parentReturn: 1, teacherReturn: 0 },
    '동의': { withdraw: 1, agree: 0, unagree: 1, confirm: 1, unconfirm: 0, parentReturn: 0, teacherReturn: 1 },
    '확정': { withdraw: 0, agree: 0, unagree: 0, confirm: 0, unconfirm: 1, parentReturn: 0, teacherReturn: 0 },
    '반려': { withdraw: 1, agree: 0, unagree: 0, confirm: 0, unconfirm: 0, parentReturn: 0, teacherReturn: 0 },
  };
  Object.keys(OK).forEach((status) => Object.keys(OK[status]).forEach((action) => {
    const r = step(at(status), action, '2027-03-28T10:00:00', { reason: '사유' });
    assert.strictEqual(r.ok, !!OK[status][action], status + ' × ' + action + ': ' + r.reason);
    if (!r.ok) assert.deepStrictEqual([r.add, r.update, r.cancel, !!r.reason], [[], [], [], true]);
    else if (action !== 'withdraw') assert.deepStrictEqual(r.update.map((u) => u.id), ['x1', 'x2']);
  }));
  // 모든 상태에서 기간 안 제출·담당교사 대신 입력은 된다(혼합 제외)
  ['', '제출', '동의', '확정', '반려'].forEach((s) => assert.ok(step(at(s), 'teacherEnter', '2027-04-10T10:00:00', { entries: ENTRIES }).ok, 'teacherEnter ' + s));
  ['', '제출', '동의', '확정', '반려'].forEach((s) => assert.ok(step(at(s), 'submit', '2027-03-28T10:00:00', { entries: ENTRIES }).ok, s));
  const mixed = [{ id: 'y1', student_id: 's1', month: '2027-04', status: '확정' }, { id: 'y2', student_id: 's1', month: '2027-04', status: '제출' }];
  assert.strictEqual(ctx.ttMonthState_(mixed, 's1', '2027-04').status, '혼합');
  assert.match(step(mixed, 'submit', '2027-03-28T10:00:00', { entries: ENTRIES }).reason, /섞여/);
  assert.strictEqual(step(mixed, 'confirm', '2027-03-28T10:00:00').ok, false);
});

test('ttTransition_ 담당교사 돌려보냄: 동의 단계에서만, 사유 필수, 동의 시각은 남겨 누가 돌려보냈는지 가린다 → 다시 내면 처음부터', () => {
  let rows = apply(MARCH, step(MARCH, 'submit', '2027-03-26T21:00:00', { entries: ENTRIES }));
  assert.match(step(rows, 'teacherReturn', '2027-03-27T09:00:00', { reason: '사유' }).reason, /지금 상태\(제출\)/, '학부모 동의 전에는 교사가 돌려보내지 않는다');
  rows = apply(rows, step(rows, 'agree', '2027-03-27T08:00:00'));
  ['', '   ', undefined].forEach((reason) => assert.match(step(rows, 'teacherReturn', '2027-03-27T09:00:00', { reason }).reason, /사유/));
  const tr = step(rows, 'teacherReturn', '2027-03-27T09:00:00', { reason: '수요일 ALL은 학원 확인서 필요' });
  assert.deepStrictEqual([tr.update[0].set, tr.returned], [{ status: '반려' }, { by: '담당교사', reason: '수요일 ALL은 학원 확인서 필요' }]);
  rows = apply(rows, tr);
  const st = plain(ctx.ttMonthState_(rows, 's1', '2027-04'));
  assert.deepStrictEqual([st.status, st.returnedBy, st.rows[0].parent_agreed_at], ['반려', '담당교사', '2027-03-27T08:00:00']);
  assert.deepStrictEqual(eff(rows, '2027-04-05'), ['화학'], '돌려보낸 달은 앞 달 유지');
  assert.deepStrictEqual(plain(ctx.ttMissing_(rows, ['s1'], '2027-04')), ['s1'], '돌려보낸 학생은 미제출 목록에');
  const re = step(rows, 'submit', '2027-03-28T10:00:00', { entries: ENTRIES });
  assert.deepStrictEqual(re.add.map((x) => [x.status, x.parent_agreed_at, x.teacher_confirmed_at]), [['제출', '', ''], ['제출', '', '']]);
  assert.strictEqual(re.cancel.length, 2);
  rows = apply(rows, re);
  assert.deepStrictEqual(['status', 'returnedBy'].map((k) => ctx.ttMonthState_(rows, 's1', '2027-04')[k]), ['제출', '']);
});

test('ttCopyPrevious_: 앞 달에 쓰던 확정 시간표를 초안으로(이어진 달 포함), 없음·미확정·없으면 빈 초안', () => {
  const R = [
    { id: 'a', student_id: 's1', month: '2027-02', weekday: '수', blocks: '20:00-22:00', code: '가', status: '확정' },
    { id: 'b', student_id: 's1', month: '2027-02', weekday: '월', blocks: '18:00-19:00;19:00-20:30', code: '학', status: '확정' },
    { id: 'c', student_id: 's1', month: '2027-03', weekday: '화', blocks: 'ALL', code: '학', status: '동의' },      // 3월은 미확정 → 2월이 이어짐
    { id: 'd', student_id: 's1', month: '2027-05', weekday: '', blocks: '', code: '없음', status: '확정' },
    { id: 'e', student_id: 's1', month: '2027-02', weekday: '금', blocks: 'ALL', code: '학', status: '취소' },
    { id: 'f', student_id: 's2', month: '2027-03', weekday: '목', blocks: 'ALL', code: '학', status: '확정' },
  ];
  assert.deepStrictEqual(plain(ctx.ttCopyPrevious_(R, 's1', '2027-04')), { fromMonth: '2027-02',
    entries: [{ weekday: '월', blocks: '18:00-20:30', code: '학' }, { weekday: '수', blocks: '20:00-22:00', code: '가' }] });
  assert.deepStrictEqual(plain(ctx.ttCopyPrevious_(R, 's1', '2027-03')).fromMonth, '2027-02');
  assert.deepStrictEqual(plain(ctx.ttCopyPrevious_(R, 's1', '2027-06')), { entries: [], fromMonth: '' }, "5월 '없음'");
  assert.deepStrictEqual(plain(ctx.ttCopyPrevious_(R, 's1', '2027-02')), { entries: [], fromMonth: '' }, '앞 달 확정 없음');
  assert.deepStrictEqual(plain(ctx.ttCopyPrevious_(R, 's2', '2027-04')).entries, [{ weekday: '목', blocks: 'ALL', code: '학' }]);
  assert.deepStrictEqual(plain(ctx.ttCopyPrevious_([{ student_id: 's3', month: '2026-12', weekday: '토', blocks: 'ALL', code: '가', status: '확정' }], 's3', '2027-01')).fromMonth, '2026-12', '해 넘김');
  // 가져온 초안은 그대로 낼 수 있다
  const draft = ctx.ttCopyPrevious_(R, 's1', '2027-04').entries;
  assert.ok(plain(ctx.ttTransition_(R, 's1', '2027-04', 'submit', { now: '2027-03-25T09:00:00', window: W, entries: draft })).ok);
  assert.throws(() => ctx.ttCopyPrevious_(R, 's1', '2027-4'), /yyyy-MM/);
});

test('ttTransition_ 제출: 기간 밖·다른 달·입력 오류는 거부(가정: 놓치면 그 달은 낼 수 없다)', () => {
  assert.match(step([], 'submit', '2027-03-24T23:59:59', { entries: ENTRIES }).reason, /지금은 시간표를 내는 기간이 아닙니다/);
  assert.match(step([], 'submit', '2027-04-01T00:00:00', { entries: ENTRIES }).reason, /지금은 시간표를 내는 기간이 아닙니다/);
  assert.ok(step([], 'submit', '2027-03-31T23:59:59', { entries: ENTRIES }).ok);
  assert.match(plain(ctx.ttTransition_([], 's1', '2027-05', 'submit', { now: '2027-03-26T10:00:00', window: W, entries: ENTRIES })).reason, /지금은 4월 시간표만 낼 수 있습니다\. 4월 시간표를 골라 주세요\./);
  assert.match(step([], 'submit', '2027-03-26T10:00:00', { entries: [{ weekday: '월', blocks: 'x', code: '학' }] }).reason, /읽을 수 없는 시간입니다\(x\)/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-4', 'agree', { now: '2027-03-26T10:00:00' }), /yyyy-MM/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-13', 'agree', { now: '2027-03-26T10:00:00' }), /yyyy-MM/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-04', 'agree', { now: '2027-03-26' }), /now/);
  assert.throws(() => ctx.ttTransition_([], '', '2027-04', 'agree', { now: '2027-03-26T10:00:00' }), /studentId/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-04', 'reject', { now: '2027-03-26T10:00:00' }), /action/);
});

test('ttMissing_: 그 달 살아 있는 행이 없거나 반려인 학생, 중복·빈 id 제외', () => {
  const rows = [
    { id: 'a', student_id: 's1', month: '2027-04', status: '제출' }, { id: 'b', student_id: 's2', month: '2027-04', status: '취소' },
    { id: 'c', student_id: 's3', month: '2027-04', status: '반려' }, { id: 'd', student_id: 's4', month: '2027-03', status: '확정' },
    { id: 'e', student_id: 's5', month: '2027-04', status: '확정', code: '없음' }];
  assert.deepStrictEqual(plain(ctx.ttMissing_(rows, ['s1', 's2', 's3', 's4', 's5', 's2', ''], '2027-04')), ['s2', 's3', 's4']);
});

/* ───────── R24 결정 84: 담당교사 대신 입력 ───────── */

// 저장 흉내 + 취소 시각(updated_at) — Db bulkUpdateRecords_처럼
function applyAt(rows, r, at) {
  assert.ok(r.ok, r.reason);
  const cancel = new Set(r.cancel);
  const upd = new Map(r.update.map((u) => [u.id, u.set]));
  return rows.map((x) => cancel.has(x.id) ? Object.assign({}, x, { status: '취소', updated_at: at }) : upd.has(x.id) ? Object.assign({}, x, upd.get(x.id), { updated_at: at }) : x)
    .concat(r.add.map((x) => Object.assign({ id: 'n' + (++seq), created_at: at, updated_at: at }, x)));
}
const tstep = (rows, month, action, now, extra) => plain(ctx.ttTransition_(rows, 's1', month, action, Object.assign({ now, window: W }, extra || {})));
const FRI = [{ weekday: '금', blocks: '19:00-22:00', code: '학' }];
const at4 = (status, extra) => [Object.assign({ id: 'z1', student_id: 's1', month: '2027-04', weekday: '목', blocks: 'ALL', code: '가', status,
  submitted_at: '2027-03-26T10:00:00' }, extra || {})];

test('teacherEnter: 기간 밖에도 이번 달·다음 달만, 학부모 동의 없이 바로 확정, 누가 입력했는지(담당교사)', () => {
  const r = tstep(MARCH, '2027-04', 'teacherEnter', '2027-04-02T09:00:00', { entries: ENTRIES });   // 제출 기간(3/25~31) 지남
  assert.deepStrictEqual([r.cancel, r.update], [[], []]);
  assert.deepStrictEqual(r.add.map((x) => [x.weekday, x.status, x.submitted_at, x.parent_agreed_at, x.teacher_confirmed_at]),
    [['월', '확정', '', '', '2027-04-02T09:00:00'], ['수', '확정', '', '', '2027-04-02T09:00:00']]);
  assert.match(r.warnings.join(), /4월 2일\(금\)부터 출석부에 들어갑니다/);
  const rows = applyAt(MARCH, r, '2027-04-02T09:00:00');
  assert.deepStrictEqual(['status', 'enteredBy'].map((k) => ctx.ttMonthState_(rows, 's1', '2027-04')[k]), ['확정', '담당교사']);
  // 다음 달분은 경고 없이 1일부터
  const nx = tstep(MARCH, '2027-05', 'teacherEnter', '2027-04-20T09:00:00', { entries: [] });
  assert.deepStrictEqual([nx.add.map((x) => [x.code, x.status]), nx.warnings], [[['없음', '확정']], []]);
  // 지난달·다다음 달·입력 오류·모르는 상태는 거부
  assert.match(tstep(MARCH, '2027-03', 'teacherEnter', '2027-04-02T09:00:00', { entries: ENTRIES }).reason, /대신 입력은 이번 달\(4월\)과 다음 달\(5월\) 시간표만 할 수 있습니다/);
  assert.match(tstep(MARCH, '2027-06', 'teacherEnter', '2027-04-02T09:00:00', { entries: ENTRIES }).reason, /이번 달/);
  assert.ok(tstep(MARCH, '2028-01', 'teacherEnter', '2027-12-31T23:00:00', { entries: ENTRIES }).ok, '해 넘김 다음 달');
  assert.match(tstep(MARCH, '2027-04', 'teacherEnter', '2027-04-02T09:00:00', { entries: [{ weekday: '월', blocks: 'x', code: '학' }] }).reason, /읽을 수 없는 시간입니다\(x\)/);
  // 보통 흐름으로 확정한 달은 학생이 낸 것
  assert.strictEqual(ctx.ttMonthState_(MARCH.map((x) => Object.assign({}, x, { parent_agreed_at: '2027-02-26T10:00:00' })), 's1', '2027-03').enteredBy, '학생');
  assert.strictEqual(ctx.ttMonthState_([], 's1', '2027-03').enteredBy, '');
  assert.strictEqual(ctx.ttMonthState_(at4('제출'), 's1', '2027-04').enteredBy, '학생');
});

test('teacherEnter: 진행 중(제출·동의·돌려보냄)·확정인 달을 대체 — 옛 행 취소 + 새 확정 행, 삭제 없음, 경고', () => {
  ['제출', '동의', '반려'].forEach((st) => {
    const r = tstep(at4(st), '2027-04', 'teacherEnter', '2027-03-30T10:00:00', { entries: FRI });
    assert.deepStrictEqual([r.cancel, r.add.length], [['z1'], 1], st);
    assert.match(r.warnings.join(), new RegExp('학생이 낸 4월 시간표\\(' + { '제출': '제출', '동의': '학부모 동의', '반려': '돌려보냄' }[st] + '\\)를 대신합니다'));
  });
  const r = tstep(at4('확정', { parent_agreed_at: '2027-03-27T10:00:00', teacher_confirmed_at: '2027-03-28T10:00:00' }), '2027-04', 'teacherEnter', '2027-03-30T10:00:00', { entries: FRI });
  assert.deepStrictEqual([r.cancel, r.warnings], [['z1'], ['확정된 4월 시간표를 바꿉니다.']]);
  // 대신 입력한 달은 확인을 거두지 못하고 다시 대신 입력한다
  const mine = applyAt([], tstep([], '2027-04', 'teacherEnter', '2027-03-30T10:00:00', { entries: FRI }), '2027-03-30T10:00:00');
  assert.match(tstep(mine, '2027-04', 'unconfirm', '2027-03-31T10:00:00').reason, /대신 입력한 시간표는 확인을 거둘 수 없습니다/);
  const again = tstep(mine, '2027-04', 'teacherEnter', '2027-03-31T10:00:00', { entries: ENTRIES });
  assert.deepStrictEqual([again.cancel.length, again.add.length], [1, 2]);
  // 학생은 제출 기간 안이면 대신 입력한 달도 다시 낼 수 있다(그러면 동의·확인을 다시)
  assert.ok(tstep(mine, '2027-04', 'submit', '2027-03-31T10:00:00', { entries: ENTRIES }).ok);
  // 혼합 달은 거부
  assert.match(tstep([...at4('확정'), ...at4('제출').map((x) => Object.assign({}, x, { id: 'z2' }))], '2027-04', 'teacherEnter', '2027-03-30T10:00:00', { entries: FRI }).reason, /섞여/);
});

test('effectiveFixedRows_(결정 84): 달 중간 대신 입력은 입력한 날부터, 그 전 날은 옛 시간표 그대로(지난 출석부가 바뀌지 않는다)', () => {
  // 3월 확정(화 학) → 4월은 마감을 놓쳐 3월 유지 → 4/15에 담당교사가 4월 대신 입력(월 학·수 가)
  let rows = applyAt(MARCH, tstep(MARCH, '2027-04', 'teacherEnter', '2027-04-15T13:00:00', { entries: ENTRIES }), '2027-04-15T13:00:00');
  assert.deepStrictEqual(eff(rows, '2027-04-14'), ['화학'], '입력 전날은 3월 시간표');
  assert.deepStrictEqual(eff(rows, '2027-04-15'), ['월학', '수가'], '입력한 날부터');
  assert.deepStrictEqual(eff(rows, '2027-05-03'), ['월학', '수가'], '다음 달에도 이어진다');
  // 4/20에 다시 대신 입력(금 학): 4/15~19는 첫 입력, 4/20부터 새 입력
  rows = applyAt(rows, tstep(rows, '2027-04', 'teacherEnter', '2027-04-20T08:00:00', { entries: FRI }), '2027-04-20T08:00:00');
  assert.deepStrictEqual(['2027-04-14', '2027-04-15', '2027-04-19', '2027-04-20', '2027-04-30'].map((d) => eff(rows, d)),
    [['화학'], ['월학', '수가'], ['월학', '수가'], ['금학'], ['금학']]);
  // 학생이 보통 흐름으로 확정한 4월(4/1부터)을 4/10에 대신 입력으로 바꾸면 4/1~9는 학생 시간표 그대로
  let st = applyAt(MARCH, step(MARCH, 'submit', '2027-03-26T21:00:00', { entries: ENTRIES }), '2027-03-26T21:00:00');
  st = applyAt(st, step(st, 'agree', '2027-03-27T08:00:00'), '2027-03-27T08:00:00');
  st = applyAt(st, step(st, 'confirm', '2027-03-28T08:00:00'), '2027-03-28T08:00:00');
  st = applyAt(st, tstep(st, '2027-04', 'teacherEnter', '2027-04-10T09:00:00', { entries: FRI }), '2027-04-10T09:00:00');
  assert.deepStrictEqual(['2027-03-31', '2027-04-01', '2027-04-09', '2027-04-10'].map((d) => eff(st, d)), [['화학'], ['월학', '수가'], ['월학', '수가'], ['금학']]);
  // 다음 달분 대신 입력은 그 달 1일부터(입력한 날은 앞 달)
  const nx = applyAt(MARCH, tstep(MARCH, '2027-04', 'teacherEnter', '2027-03-20T09:00:00', { entries: FRI }), '2027-03-20T09:00:00');
  assert.deepStrictEqual(['2027-03-31', '2027-04-01'].map((d) => eff(nx, d)), [['화학'], ['금학']]);
  // 보통 흐름에서 늦게 확인(4/3)한 달은 지금처럼 1일부터(대신 입력만 입력한 날부터)
  let late = applyAt(MARCH, step(MARCH, 'submit', '2027-03-26T21:00:00', { entries: ENTRIES }), '2027-03-26T21:00:00');
  late = applyAt(late, step(late, 'agree', '2027-03-27T08:00:00'), '2027-03-27T08:00:00');
  assert.deepStrictEqual(eff(late, '2027-04-02'), ['화학'], '동의만 — 앞 달');
  const lateOk = applyAt(late, step(late, 'confirm', '2027-04-03T08:00:00'), '2027-04-03T08:00:00');
  assert.deepStrictEqual(eff(lateOk, '2027-04-01'), ['월학', '수가'], '보통 흐름 확정은 1일부터');
  // 동의 단계(확정 전)에서 4/15에 대신 입력: 4/1~14는 확정된 적 없는 학생 행을 쓰지 않고 3월 시간표
  const repl = applyAt(late, tstep(late, '2027-04', 'teacherEnter', '2027-04-15T09:00:00', { entries: FRI }), '2027-04-15T09:00:00');
  assert.deepStrictEqual(['2027-04-10', '2027-04-15'].map((d) => eff(repl, d)), [['화학'], ['금학']]);
  // 확정 전에 취소된 행·updated_at 없는 취소 행은 쓰지 않는다
  const noTs = st.map((x) => x.status === '취소' ? Object.assign({}, x, { updated_at: '' }) : x);
  assert.deepStrictEqual(eff(noTs, '2027-04-05'), ['화학'], '취소 시각을 모르면 그 행은 없던 것으로');
  // 지난달 가져오기는 앞 달 말일 기준(달 중간 대신 입력 반영)
  assert.deepStrictEqual(plain(ctx.ttCopyPrevious_(rows, 's1', '2027-05')), { entries: [{ weekday: '금', blocks: '19:00-22:00', code: '학' }], fromMonth: '2027-04' });
});
