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
  assert.match(ctx.ttSubmitWindow_('2027-04-01', W).reason, /2027-04-25 ~ 2027-04-30\(2027-05 시간표\)/);
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
    [[{ weekday: '월', blocks: '19:00-18:00', code: '학' }], /블록 표기/],
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
  // 반려 → 학생이 다시 낸다 / 반려 상태에서도 거둘 수 있다
  rows = apply(rows, step(rows, 'reject', '2027-03-31T09:00:00'));
  assert.strictEqual(ctx.ttMonthState_(rows, 's1', '2027-04').status, '반려');
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
  const at = (status) => status ? [{ id: 'x1', student_id: 's1', month: '2027-04', weekday: '월', blocks: 'ALL', code: '학', status },
    { id: 'x2', student_id: 's1', month: '2027-04', weekday: '화', blocks: 'ALL', code: '가', status }] : [];
  const OK = {
    '':   { withdraw: 0, agree: 0, unagree: 0, confirm: 0, unconfirm: 0, reject: 0 },
    '제출': { withdraw: 1, agree: 1, unagree: 0, confirm: 0, unconfirm: 0, reject: 1 },
    '동의': { withdraw: 1, agree: 0, unagree: 1, confirm: 1, unconfirm: 0, reject: 1 },
    '확정': { withdraw: 0, agree: 0, unagree: 0, confirm: 0, unconfirm: 1, reject: 0 },
    '반려': { withdraw: 1, agree: 0, unagree: 0, confirm: 0, unconfirm: 0, reject: 0 },
  };
  Object.keys(OK).forEach((status) => Object.keys(OK[status]).forEach((action) => {
    const r = step(at(status), action, '2027-03-28T10:00:00');
    assert.strictEqual(r.ok, !!OK[status][action], status + ' × ' + action + ': ' + r.reason);
    if (!r.ok) assert.deepStrictEqual([r.add, r.update, r.cancel, !!r.reason], [[], [], [], true]);
    else if (action !== 'withdraw') assert.deepStrictEqual(r.update.map((u) => u.id), ['x1', 'x2']);
  }));
  // 모든 상태에서 기간 안 제출은 된다(혼합 제외)
  ['', '제출', '동의', '확정', '반려'].forEach((s) => assert.ok(step(at(s), 'submit', '2027-03-28T10:00:00', { entries: ENTRIES }).ok, s));
  const mixed = [{ id: 'y1', student_id: 's1', month: '2027-04', status: '확정' }, { id: 'y2', student_id: 's1', month: '2027-04', status: '제출' }];
  assert.strictEqual(ctx.ttMonthState_(mixed, 's1', '2027-04').status, '혼합');
  assert.match(step(mixed, 'submit', '2027-03-28T10:00:00', { entries: ENTRIES }).reason, /섞여/);
  assert.strictEqual(step(mixed, 'confirm', '2027-03-28T10:00:00').ok, false);
});

test('ttTransition_ 제출: 기간 밖·다른 달·입력 오류는 거부(가정: 놓치면 그 달은 낼 수 없다)', () => {
  assert.match(step([], 'submit', '2027-03-24T23:59:59', { entries: ENTRIES }).reason, /제출 기간이 아닙니다/);
  assert.match(step([], 'submit', '2027-04-01T00:00:00', { entries: ENTRIES }).reason, /제출 기간이 아닙니다/);
  assert.ok(step([], 'submit', '2027-03-31T23:59:59', { entries: ENTRIES }).ok);
  assert.match(plain(ctx.ttTransition_([], 's1', '2027-05', 'submit', { now: '2027-03-26T10:00:00', window: W, entries: ENTRIES })).reason, /2027-04 시간표만/);
  assert.match(step([], 'submit', '2027-03-26T10:00:00', { entries: [{ weekday: '월', blocks: 'x', code: '학' }] }).reason, /블록 표기/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-4', 'agree', { now: '2027-03-26T10:00:00' }), /yyyy-MM/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-13', 'agree', { now: '2027-03-26T10:00:00' }), /yyyy-MM/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-04', 'agree', { now: '2027-03-26' }), /now/);
  assert.throws(() => ctx.ttTransition_([], '', '2027-04', 'agree', { now: '2027-03-26T10:00:00' }), /studentId/);
  assert.throws(() => ctx.ttTransition_([], 's1', '2027-04', 'approve', { now: '2027-03-26T10:00:00' }), /action/);
});

test('ttMissing_: 그 달 살아 있는 행이 없거나 반려인 학생, 중복·빈 id 제외', () => {
  const rows = [
    { id: 'a', student_id: 's1', month: '2027-04', status: '제출' }, { id: 'b', student_id: 's2', month: '2027-04', status: '취소' },
    { id: 'c', student_id: 's3', month: '2027-04', status: '반려' }, { id: 'd', student_id: 's4', month: '2027-03', status: '확정' },
    { id: 'e', student_id: 's5', month: '2027-04', status: '확정', code: '없음' }];
  assert.deepStrictEqual(plain(ctx.ttMissing_(rows, ['s1', 's2', 's3', 's4', 's5', 's2', ''], '2027-04')), ['s2', 's3', 's4']);
});
