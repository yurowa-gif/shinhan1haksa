/** R2 StatusRules — 표 형식. 적용일 누적, 퇴실 당일 공석(가정), 재입실, 중도 입실, 이어받기. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/StatusRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}
let seq = 0;
function ch(student_id, item, value, effective_date, extra) {
  seq++;
  return Object.assign({ id: 'c' + seq, student_id, item, value, effective_date, status: '유효',
    created_at: '2026-11-01T09:00:' + String(seq % 60).padStart(2, '0') }, extra || {});
}

/* ───── statusOn_ ───── */
const HIST = [
  ch('s1', '학사', '입실', '2027-03-02'),
  ch('s1', '석식', '학사 석식', '2027-03-02'),
  ch('s1', '석식', '일반 석식', '2027-04-01', { created_at: '2027-03-31T10:00:00' }),
  ch('s1', '석식', '미실시', '2027-04-01', { created_at: '2027-03-31T12:00:00' }),   // 같은 적용일, 나중 기록
  ch('s1', '석식', '학사 석식', '2027-05-03', { status: '취소' }),
  ch('s1', '석식', '학사 석식', '2027-05-10', { status: '요청' }),
  ch('s1', '학사', '퇴실', '2027-06-01'),
  ch('s1', '학사', '입실', '2027-06-15'),                                            // 재입실
  ch('s1', '조식', '실시', '2028-02-29'),
  ch('s1', '조식', '미실시', 'bad-date'),
  ch('s2', '학사', '입실', '2027-03-02')
];
table('statusOn_: 적용일 순 누적, 같은 날은 나중 기록, 취소·요청 무시, 재입실', [
  ['s1', '학사', '2027-03-01', ''],
  ['s1', '학사', '2027-03-02', '입실'],
  ['s1', '학사', '2027-05-31', '입실'],
  ['s1', '학사', '2027-06-01', '퇴실'],          // 퇴실 적용일 당일부터 퇴실(가정)
  ['s1', '학사', '2027-06-14', '퇴실'],
  ['s1', '학사', '2027-06-15', '입실'],
  ['s1', '석식', '2027-03-31', '학사 석식'],
  ['s1', '석식', '2027-04-01', '미실시'],
  ['s1', '석식', '2027-05-03', '미실시'],        // 취소된 기록 무시
  ['s1', '석식', '2027-05-10', '미실시'],        // 요청 상태 무시
  ['s1', '조식', '2028-02-28', ''],
  ['s1', '조식', '2028-02-29', '실시'],          // 윤년 적용일
  ['s1', '기숙사', '2027-12-31', ''],
  ['s3', '학사', '2027-12-31', '']
], ([sid, item, d, want]) => assert.strictEqual(ctx.statusOn_(HIST, sid, item, d), want));

test('statusOn_: 같은 적용일이면 requested_at이 늦은 행(created_at보다 먼저 본다)', () => {
  const rows = [ch('x', '석식', '일반 석식', '2027-04-01', { requested_at: '2027-03-31T11:00:00', created_at: '2027-03-31T13:00:00' }),
    ch('x', '석식', '미실시', '2027-04-01', { requested_at: '2027-03-31T12:00:00', created_at: '2027-03-31T12:00:01' })];
  assert.strictEqual(ctx.statusOn_(rows, 'x', '석식', '2027-04-01'), '미실시');
  assert.strictEqual(ctx.statusOn_(rows.slice().reverse(), 'x', '석식', '2027-04-01'), '미실시');
});

test('statusOn_: 같은 적용일·같은 created_at이면 시트에서 아래 행', () => {
  const rows = [ch('x', '학사', '입실', '2027-03-02', { created_at: 'T' }), ch('x', '학사', '퇴실', '2027-03-02', { created_at: 'T' })];
  assert.strictEqual(ctx.statusOn_(rows, 'x', '학사', '2027-03-02'), '퇴실');
  assert.strictEqual(ctx.statusOn_(rows.slice().reverse(), 'x', '학사', '2027-03-02'), '입실');
});

test('statusOn_: 행 순서와 무관하게 적용일로 정한다(나중 행이 앞 적용일이어도)', () => {
  const rows = [ch('x', '학사', '퇴실', '2027-06-01'), ch('x', '학사', '입실', '2027-03-02', { created_at: '2027-12-01T00:00:00' })];
  assert.strictEqual(ctx.statusOn_(rows, 'x', '학사', '2027-07-01'), '퇴실');
});

test('statusOn_: 빈 입력·status 빈칸은 유효로 본다·공백 무시', () => {
  assert.strictEqual(ctx.statusOn_(null, 's1', '학사', '2027-03-02'), '');
  assert.strictEqual(ctx.statusOn_([], 's1', '학사', '2027-03-02'), '');
  const rows = [{ student_id: ' s9 ', item: ' 학사 ', value: ' 입실 ', effective_date: ' 2027-03-02 ', status: '' }];
  assert.strictEqual(ctx.statusOn_(rows, 's9', '학사', '2027-03-02'), '입실');
  assert.strictEqual(ctx.statusOn_([Object.assign({}, rows[0], { status: ' 취소 ' })], 's9', '학사', '2027-03-02'), '');
});

/* ───── isActiveOn_ ───── */
table('isActiveOn_: 등록 + 학사 입실, 퇴실 적용일 당일부터 아님(가정)', [
  [{ term_id: 't', student_id: 's1' }, '2027-03-01', false],
  [{ term_id: 't', student_id: 's1' }, '2027-03-02', true],
  [{ term_id: 't', student_id: 's1' }, '2027-05-31', true],
  [{ term_id: 't', student_id: 's1' }, '2027-06-01', false],
  [{ term_id: 't', student_id: 's1' }, '2027-06-15', true],
  [null, '2027-03-02', false],
  [{ term_id: 't', student_id: '' }, '2027-03-02', false]
], ([enr, d, want]) => assert.strictEqual(ctx.isActiveOn_(HIST, enr, d), want));

/* ───── assignmentOn_ ───── */
const ASG = [
  { id: 'a1', term_id: 'T1', seat_id: 'S1', student_id: 's1', valid_from: '', valid_to: '', status: '배정', updated_at: '2027-02-20T10:00:00' },
  { id: 'a2', term_id: 'T1', seat_id: 'S2', student_id: 's2', valid_from: '', valid_to: '2027-04-30', status: '배정', updated_at: '2027-02-20T10:00:00' },
  { id: 'a3', term_id: 'T1', seat_id: 'S2', student_id: 's4', valid_from: '2027-05-01', valid_to: '', status: '배정', updated_at: '2027-04-28T10:00:00' },
  { id: 'a4', term_id: 'T1', seat_id: 'S3', student_id: 's5', valid_from: '', valid_to: '', status: '취소', updated_at: '2027-02-20T10:00:00' },
  { id: 'a5', term_id: 'T2', seat_id: 'S1', student_id: 's9', valid_from: '', valid_to: '', status: '배정', updated_at: '2027-02-20T10:00:00' },
  { id: 'a6', term_id: 'T1', seat_id: 'S4', student_id: 's6', valid_from: '', valid_to: '', status: '배정', updated_at: '2027-02-20T10:00:00' },
  { id: 'a7', term_id: 'T1', seat_id: 'S4', student_id: 's7', valid_from: '', valid_to: '', status: '배정', updated_at: '2027-03-05T10:00:00' }
];
table('assignmentOn_: 기간·좌석·날짜 범위(양 끝 포함), 취소 제외, 여럿이면 최근 수정', [
  ['S1', 'T1', '2027-03-02', 'a1'], ['S1', 'T2', '2027-03-02', 'a5'],
  ['S2', 'T1', '2027-04-30', 'a2'], ['S2', 'T1', '2027-05-01', 'a3'],
  ['S3', 'T1', '2027-03-02', null], ['S9', 'T1', '2027-03-02', null],
  ['S4', 'T1', '2027-03-02', 'a7']
], ([seat, term, d, want]) => {
  const a = ctx.assignmentOn_(ASG, seat, term, d);
  assert.strictEqual(a ? a.id : null, want);
});

test('statusOn_: requested_at을 공백으로 쓴 값도 T 형식과 같은 순서', () => {
  const rows = [ch('x', '석식', '일반 석식', '2027-04-01', { requested_at: '2027-03-31T09:00:00' }),
    ch('x', '석식', '미실시', '2027-04-01', { requested_at: '2027-03-31 10:00:00' })];
  assert.strictEqual(ctx.statusOn_(rows, 'x', '석식', '2027-04-01'), '미실시');
});

test('assignmentOn_·seatMapOn_: 방학 날짜별 배정이 기간 전체 배정보다 먼저(updated_at과 무관)', () => {
  const asg = [
    { id: 'w1', term_id: 'V', seat_id: 'A', student_id: 'y', valid_from: '', valid_to: '', status: '배정', updated_at: '2027-07-26T09:00:00' },
    { id: 'w2', term_id: 'V', seat_id: 'A', student_id: 'x', valid_from: '2027-07-25', valid_to: '2027-07-25', status: '배정', updated_at: '2027-07-20T09:00:00' },
    { id: 'w3', term_id: 'V', seat_id: 'B', student_id: 'z', valid_from: '', valid_to: '', status: '배정', updated_at: '2027-07-26T09:00:00' },
    { id: 'w4', term_id: 'V', seat_id: 'C', student_id: 'z', valid_from: '2027-07-24', valid_to: '2027-07-25', status: '배정', updated_at: '2027-07-01T09:00:00' }
  ];
  assert.strictEqual(ctx.assignmentOn_(asg, 'A', 'V', '2027-07-25').id, 'w2');
  assert.strictEqual(ctx.assignmentOn_(asg, 'A', 'V', '2027-07-26').id, 'w1');
  const seats = ['A', 'B', 'C'].map((id) => ({ id, kind: '좌석', status: '유효' }));
  const enr = ['x', 'y', 'z'].map((sid) => ({ term_id: 'V', student_id: sid }));
  const chs = ['x', 'y', 'z'].map((sid) => ch(sid, '학사', '입실', '2027-07-19'));
  const m = plain(ctx.seatMapOn_(seats, asg, enr, chs, 'V', '2027-07-25'));
  assert.strictEqual(m.bySeat.A.studentId, 'x');
  assert.strictEqual(m.bySeat.C.studentId, 'z');           // 그날만 자리 C
  assert.strictEqual(m.bySeat.B.reason, '미배정');
  assert.deepStrictEqual(m.unseated, ['y']);
  assert.strictEqual(m.warnings.length, 1);
});

/* ───── seatMapOn_ ───── */
// 1층 일부 + 기둥, s1 퇴실(06-01)·재입실(06-15), s2 정상, s3 중도 입실(04-01, 자리 없음), s4 등록 없음, s5 입실 전
const SEATS = [
  { id: 'S1', kind: '좌석', status: '' }, { id: 'S2', kind: '좌석', status: '' }, { id: 'S3', kind: '좌석', status: '' },
  { id: 'S4', kind: '좌석', status: '' }, { id: 'S5', kind: '좌석', status: '' }, { id: 'S6', kind: '좌석', status: '취소' },
  { id: 'P1', kind: '기둥', status: '' }
];
const MAP_ASG = [
  { id: 'm1', term_id: 'T1', seat_id: 'S1', student_id: 's1', status: '배정', updated_at: 'a' },
  { id: 'm2', term_id: 'T1', seat_id: 'S2', student_id: 's2', status: '배정', updated_at: 'a' },
  { id: 'm4', term_id: 'T1', seat_id: 'S4', student_id: 's4', status: '배정', updated_at: 'a' },
  { id: 'm5', term_id: 'T1', seat_id: 'S5', student_id: 's5', status: '배정', updated_at: 'a' },
  { id: 'm6', term_id: 'T1', seat_id: 'S6', student_id: 's2', status: '배정', updated_at: 'z' }
];
const ENR = [
  { id: 'e1', term_id: 'T1', student_id: 's1' }, { id: 'e2', term_id: 'T1', student_id: 's2' },
  { id: 'e3', term_id: 'T1', student_id: 's3' }, { id: 'e5', term_id: 'T1', student_id: 's5' },
  { id: 'e9', term_id: 'T0', student_id: 's4' }
];
const MAP_CH = [
  ch('s1', '학사', '입실', '2027-03-02'), ch('s1', '학사', '퇴실', '2027-06-01'), ch('s1', '학사', '입실', '2027-06-15'),
  ch('s2', '학사', '입실', '2027-03-02'), ch('s3', '학사', '입실', '2027-04-01'), ch('s4', '학사', '입실', '2027-03-02'),
  ch('s5', '학사', '입실', '2027-05-01')
];
const map = (d) => plain(ctx.seatMapOn_(SEATS, MAP_ASG, ENR, MAP_CH, 'T1', d));

table('seatMapOn_: 날짜별 좌석 상태', [
  ['2027-03-02', { S1: ['s1', ''], S2: ['s2', ''], S3: [null, '미배정'], S4: [null, '미입실'], S5: [null, '미입실'] }, []],
  ['2027-04-01', { S1: ['s1', ''], S2: ['s2', ''], S3: [null, '미배정'], S4: [null, '미입실'], S5: [null, '미입실'] }, ['s3']],
  ['2027-05-31', { S1: ['s1', ''], S5: ['s5', ''] }, ['s3']],     // 퇴실 전날까지 자리 있음
  ['2027-06-01', { S1: [null, '퇴실'] }, ['s3']],                 // 퇴실 적용일부터 공석(가정)
  ['2027-06-14', { S1: [null, '퇴실'] }, ['s3']],
  ['2027-06-15', { S1: ['s1', ''] }, ['s3']]                      // 재입실하면 다시 그 자리
], ([d, want, unseated]) => {
  const m = map(d);
  for (const [seat, [sid, reason]] of Object.entries(want)) {
    assert.deepStrictEqual(m.bySeat[seat], { studentId: sid, vacant: sid === null, reason }, seat);
  }
  assert.deepStrictEqual(m.unseated, unseated);
  assert.deepStrictEqual(m.warnings, []);
});

test('seatMapOn_: 좌석이 아닌 칸·취소된 좌석은 bySeat에 없다(취소 좌석의 배정도 무시)', () => {
  const m = map('2027-03-02');
  assert.deepStrictEqual(Object.keys(m.bySeat).sort(), ['S1', 'S2', 'S3', 'S4', 'S5']);
});

test('seatMapOn_: 한 학생이 두 자리에 배정되면 최근 배정만 + 경고', () => {
  const asg = MAP_ASG.concat([{ id: 'm7', term_id: 'T1', seat_id: 'S3', student_id: 's2', status: '배정', updated_at: 'b' }]);
  const m = plain(ctx.seatMapOn_(SEATS, asg, ENR, MAP_CH, 'T1', '2027-03-02'));
  assert.deepStrictEqual(m.bySeat.S3, { studentId: 's2', vacant: false, reason: '' });
  assert.deepStrictEqual(m.bySeat.S2, { studentId: null, vacant: true, reason: '미배정' });
  assert.strictEqual(m.warnings.length, 1);
});

test('seatMapOn_: 다른 기간 배정·등록은 쓰지 않는다, 빈 입력', () => {
  const m = plain(ctx.seatMapOn_(SEATS, MAP_ASG, ENR, MAP_CH, 'T2', '2027-03-02'));
  assert.ok(Object.values(m.bySeat).every((x) => x.vacant && x.reason === '미배정'));
  assert.deepStrictEqual(m.unseated, []);
  assert.deepStrictEqual(plain(ctx.seatMapOn_([], [], [], [], 'T1', '2027-03-02')), { bySeat: {}, unseated: [], warnings: [] });
});

test('seatMapOn_: 등록 행 순서대로 unseated, 같은 학생 등록이 두 줄이어도 한 번', () => {
  const enr = ENR.concat([{ id: 'e7', term_id: 'T1', student_id: 's7' }, { id: 'e3b', term_id: 'T1', student_id: 's3' }]);
  const chs = MAP_CH.concat([ch('s7', '학사', '입실', '2027-03-02')]);
  assert.deepStrictEqual(plain(ctx.seatMapOn_(SEATS, MAP_ASG, enr, chs, 'T1', '2027-04-01')).unseated, ['s3', 's7']);
});

/* ───── carryOverEnrollments_ ───── */
const TERMS = [
  { id: 'T26-2', type: '학기', start_date: '2026-08-17', end_date: '2027-02-28' },
  { id: 'W26', type: '방학', start_date: '2026-12-28', end_date: '2027-02-26' },
  { id: 'T27-1', type: '학기', start_date: '2027-03-02', end_date: '2027-07-17' },
  { id: 'S27', type: '방학', start_date: '2027-07-19', end_date: '2027-08-14' },
  { id: 'T27-2', type: '학기', start_date: '2027-08-16', end_date: '2028-02-28' }
];
const C_ENR = [
  { id: 'p1', term_id: 'T27-1', student_id: 'a', teacher_email: 't1@x.kr', veritas: 'TRUE', commute_type: '일반', end_type: '23:00', memo: 'm' },
  { id: 'p2', term_id: 'T27-1', student_id: 'b', teacher_email: 't2@x.kr', veritas: 'FALSE', commute_type: '일반', end_type: '23:50', memo: '' },
  { id: 'p3', term_id: 'T27-1', student_id: 'c', teacher_email: 't1@x.kr', veritas: 'FALSE', commute_type: '일반', end_type: '23:50', memo: '' },
  { id: 'p4', term_id: 'T27-1', student_id: 'd', teacher_email: 't1@x.kr', veritas: 'FALSE', commute_type: '일반', end_type: '23:50', memo: '' },
  { id: 'v1', term_id: 'S27', student_id: 'e', teacher_email: 't1@x.kr', veritas: 'FALSE', commute_type: '일반', end_type: '23:50', memo: '' }
];
const C_CH = [
  ch('a', '학사', '입실', '2027-03-02'), ch('b', '학사', '입실', '2027-03-02'), ch('b', '학사', '퇴실', '2027-07-10'),
  ch('c', '학사', '입실', '2027-03-02'), ch('c', '학사', '퇴실', '2027-08-16'),   // 새 학기 첫날 퇴실 → 제외
  ch('d', '학사', '입실', '2027-03-02'), ch('d', '학사', '퇴실', '2027-09-01'),   // 새 학기 중 퇴실 예정 → 포함
  ch('e', '학사', '입실', '2027-07-19')
];
const ids = (r) => plain(r).map((x) => x.student_id);

test('carryOverEnrollments_: 직전 학기 재학생만(방학 기간 건너뜀, 퇴실자 제외), 필드 복사', () => {
  const r = plain(ctx.carryOverEnrollments_(TERMS, C_ENR, C_CH, TERMS[4]));
  assert.deepStrictEqual(r.map((x) => x.student_id), ['a', 'd']);
  assert.deepStrictEqual(r[0], { term_id: 'T27-2', student_id: 'a', teacher_email: 't1@x.kr', veritas: 'TRUE',
    commute_type: '일반', end_type: '23:00', memo: '', from_enrollment_id: 'p1' });
});

test('carryOverEnrollments_: 새 기간이 방학이면 빈 배열', () => {
  assert.deepStrictEqual(ids(ctx.carryOverEnrollments_(TERMS, C_ENR, C_CH, TERMS[3])), []);
});

test('carryOverEnrollments_: 이미 새 기간에 등록된 학생은 빼므로 두 번 해도 중복 없음', () => {
  const first = plain(ctx.carryOverEnrollments_(TERMS, C_ENR, C_CH, TERMS[4]));
  const again = ctx.carryOverEnrollments_(TERMS, C_ENR.concat(first), C_CH, TERMS[4]);
  assert.deepStrictEqual(ids(again), []);
});

test('carryOverEnrollments_: 직전 학기가 없으면 빈 배열, 학년도를 넘는 이어받기(2학기→1학기)', () => {
  assert.deepStrictEqual(ids(ctx.carryOverEnrollments_(TERMS, C_ENR, C_CH, TERMS[0])), []);
  const enr = [{ id: 'q', term_id: 'T26-2', student_id: 'z' }];
  const chs = [ch('z', '학사', '입실', '2026-08-17')];
  assert.deepStrictEqual(ids(ctx.carryOverEnrollments_(TERMS, enr, chs, TERMS[2])), ['z']);
  assert.deepStrictEqual(ids(ctx.carryOverEnrollments_(TERMS, enr, chs, { id: 'X', type: '학기', start_date: '' })), []);
  assert.deepStrictEqual(ids(ctx.carryOverEnrollments_(TERMS, enr, chs, null)), []);
});
