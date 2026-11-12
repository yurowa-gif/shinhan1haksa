/** C6 좌석 격자·수동 배치: 순수 함수 + 서버 함수(가짜 서비스, 가짜 1단계 데이터 시드) */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const FILES = ['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/rules/MoveRules.gs', 'src/dev/FakeData.gs',
  'src/dev/FakeSeats.gs', 'src/dev/FakeStage1.gs', 'src/features/Roster.gs', 'src/rules/SeatRules.gs', 'src/features/SeatDraft.gs', 'src/features/Seats.gs'];
const pure = loadGs(FILES);
const fake = plain(pure.buildFakeData_({}));
const s1 = plain(pure.buildFakeStage1_(fake));
const TERM = s1.term;

const TRUE_MSG = '이번 운영 기간에 학생이 앉았던 자리라 기간이 끝난 뒤 바꿀 수 있습니다';

/* ───── 좌석표 붙여넣기 ───── */

const parse = (t) => plain(pure.parseSeatGridTsv_(t));

test('parseSeatGridTsv_: 공석·"1. 이름"=좌석, 기둥·비상문·창문, 빈칸=통로, 이름 칸 수를 센다', () => {
  const g = parse('공석\t1. 김가온\t\t기둥\n2. 이나래\t공석\t비상문\t창문');
  assert.deepStrictEqual(g.errors, []);
  assert.strictEqual(g.rows, 2); assert.strictEqual(g.cols, 4);
  assert.strictEqual(g.seatCount, 4); assert.strictEqual(g.namedCount, 2);
  assert.deepStrictEqual(g.cells.map((c) => c.row + ',' + c.col + ':' + c.kind),
    ['1,1:좌석', '1,2:좌석', '1,4:기둥', '2,1:좌석', '2,2:좌석', '2,3:비상문', '2,4:창문']);
});

test('parseSeatGridTsv_: 알 수 없는 칸은 행·열 위치로, 빈 표·너무 큰 표는 거부(나쁜 입력)', () => {
  const g = parse('공석\t아무말\n공석\t공석');
  assert.strictEqual(g.errors.length, 1);
  assert.deepStrictEqual([g.errors[0].line, g.errors[0].column], [1, 2]);
  assert.ok(g.errors[0].message.includes('1행 2열'));
  assert.strictEqual(parse('').errors.length, 1);
  assert.strictEqual(parse('\t\t\n\t').errors.length, 1, '칸이 하나도 없음');
  const tall = Array.from({ length: 41 }, () => '공석').join('\n');
  assert.ok(parse(tall).errors.some((e) => e.message.includes('행이')));
  assert.strictEqual(parse(Array.from({ length: 40 }, () => '공석').join('\t')).errors.length, 0, '열 40개까지 허용');
  assert.ok(parse(Array.from({ length: 41 }, () => '공석').join('\t')).errors.some((e) => e.message.includes('열이')));
  assert.ok(parse('공석,1. 가').errors.length === 0, 'CSV도 받는다');
});

test('parseSeatGridTsv_: 칸 이름이 "constructor"·"toString" 같은 객체 속성이어도 좌석 종류로 통과하지 않는다(나쁜 입력)', () => {
  for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const g = parse('공석\t' + word);
    assert.strictEqual(g.errors.length, 1, word); assert.ok(g.errors[0].message.includes('2열'), word);
  }
  assert.strictEqual(pure.seatKindEn_('constructor'), 'seat', '모르는 종류는 seat로(시트 값이 이상해도 함수가 새지 않는다)');
  assert.strictEqual(pure.seatKindEn_('기둥'), 'pillar');
});

test('parseSeatGridTsv_: 줄 머리 칸(숫자만 있는 첫 칸 "5", "5/19")은 건너뛰고 열을 한 칸 당긴다', () => {
  const g = parse('5/19\t공석\t공석\n6\t공석\t기둥\n7\t\t공석');
  assert.deepStrictEqual(g.errors, []);
  assert.strictEqual(g.skippedHeads, 3);
  assert.strictEqual(g.cols, 2);
  assert.deepStrictEqual(g.cells.map((c) => c.row + ',' + c.col + ':' + c.kind), ['1,1:좌석', '1,2:좌석', '2,1:좌석', '2,2:기둥', '3,2:좌석']);
  const keep = parse('공석\t공석\n3\t공석');   // 첫 열에 진짜 칸이 있으면 당기지 않는다
  assert.deepStrictEqual(keep.cells.map((c) => c.col), [1, 2, 2]);
  assert.strictEqual(parse('공석\t5\t공석').errors.length, 1, '첫 칸이 아닌 숫자 칸은 여전히 오류');
});

test('parseSeatGridTsv_: 맨 윗행이 줄 머리("5/19", "6/2")뿐이면 그 행을 건너뛰고 행을 한 칸 올린다(실제 1층은 세로 줄)', () => {
  const g = parse('5/19\t6/2\t7\n공석\t공석\t공석\n공석\t\t공석');
  assert.deepStrictEqual(g.errors, []);
  assert.strictEqual(g.skippedHeads, 3); assert.strictEqual(g.rows, 2); assert.strictEqual(g.cols, 3);
  assert.deepStrictEqual(g.cells.map((c) => c.row + ',' + c.col), ['1,1', '1,2', '1,3', '2,1', '2,3']);
  const mixed = parse('5\t공석\n공석\t공석');   // 윗행에 진짜 칸이 섞이면 행을 건너뛰지 않는다
  assert.strictEqual(mixed.rows, 2);
  const both = parse('1/5\t2/5\n3\t공석\n4\t공석');   // 윗행 머리 + 첫 열 머리: 둘 다 건너뛴다
  assert.deepStrictEqual([both.rows, both.cols, both.seatCount], [2, 1, 2]);
});

test('parseSeatGridTsv_: 맨 위 빈 행(탭만)이 있어도 그 아래 줄 머리 행을 건너뛴다(빈 행은 함께 버린다)', () => {
  const g = parse('\t\t\n5/19\t6/2\n공석\t공석\n공석\t공석');
  assert.deepStrictEqual(g.errors, []);
  assert.deepStrictEqual([g.skippedHeads, g.rows, g.cols, g.seatCount], [2, 2, 2, 4]);
  const err = parse('\t\n5/19\t6/2\n공석\t아무말');   // 오류 줄 번호는 붙여넣은 표 기준(건너뛴 행을 센다)
  assert.deepStrictEqual([err.errors[0].line, err.errors[0].column], [3, 2]);
});

/* ───── 번호 ───── */

const lab = (cells, style) => plain(pure.seatLabelsFor_(cells, style));

test('seatLabelsFor_(room): SA실은 방 안 순번 — 좌석만 행 우선으로 1부터, 기둥 등은 번호 없음', () => {
  assert.deepStrictEqual(lab([{ row: 2, col: 1, kind: '좌석' }, { row: 1, col: 3, kind: '기둥' }, { row: 1, col: 2, kind: '좌석' }, { row: 1, col: 1, kind: '좌석' }], 'room'),
    { '1,1': '1', '1,2': '2', '2,1': '3' });
});

test('seatLabelsFor_(line): 1층은 줄-순번 — 좌석이 있는 열을 왼쪽부터 센 줄 번호, 앞(1행)부터 순번, 통로·기둥은 건너뜀', () => {
  // 열 1(줄1) | 열 2 통로(좌석 없음) | 열 3(줄2): 3행이 기둥, 열 4는 기둥뿐(줄이 아님)
  const cells = [{ row: 1, col: 1, kind: '좌석' }, { row: 2, col: 1, kind: '좌석' }, { row: 1, col: 3, kind: '좌석' }, { row: 2, col: 3, kind: '기둥' },
    { row: 3, col: 3, kind: '좌석' }, { row: 1, col: 4, kind: '기둥' }, { row: 4, col: 5, kind: '좌석' }];
  assert.deepStrictEqual(lab(cells, 'line'), { '1,1': '1-1', '2,1': '1-2', '1,3': '2-1', '3,3': '2-2', '4,5': '3-1' });
  assert.deepStrictEqual(lab(cells.slice().reverse(), 'line'), lab(cells, 'line'), '입력 순서와 무관');
});

test('seatLabelStyle_: SA+숫자로 시작하는 방은 순번, 그 밖(1층·SAT 자습실 등)은 줄-순번', () => {
  assert.strictEqual(pure.seatLabelStyle_('SA3실'), 'room'); assert.strictEqual(pure.seatLabelStyle_(' sa1실'), 'room'); assert.strictEqual(pure.seatLabelStyle_('SA 2'), 'room');
  assert.strictEqual(pure.seatLabelStyle_('SAT 자습실'), 'line'); assert.strictEqual(pure.seatLabelStyle_('SA실'), 'line');
  assert.strictEqual(pure.seatLabelStyle_('1층 자습실'), 'line'); assert.strictEqual(pure.seatLabelStyle_(''), 'line');
});

test('가짜 좌석표의 번호가 결정 37 규칙과 같다(1층 줄-순번 3-7, SA 순번)', () => {
  const lay = plain(pure.buildFakeSeatLayout_());
  const floor = lay.seats.filter((x) => x.spaceKey === '1F' && x.kind === '좌석');
  assert.deepStrictEqual(lab(floor, 'line'), Object.fromEntries(floor.map((x) => [x.row + ',' + x.col, x.label])));
  assert.ok(floor.some((x) => x.label === '3-7'));
  const sa = lay.seats.filter((x) => x.spaceKey === 'SA1' && x.kind === '좌석');
  assert.deepStrictEqual(lab(sa, 'room'), Object.fromEntries(sa.map((x) => [x.row + ',' + x.col, x.label])));
});

/* ───── 격자 저장 계획 ───── */

const ex = (id, row, col, kind, label) => ({ id, row, col, kind, label });
const gp = (existing, desired, assigned, rows, cols, style, past, kept) => plain(pure.seatGridPlan_(existing, desired, assigned || [], rows || 3, cols || 3, style || 'room', past || [], kept || assigned || []));

test('seatGridPlan_: 새 칸·바뀐 종류·없앤 칸을 만들고 번호를 다시 매긴다', () => {
  const existing = [ex('a', 1, 1, '좌석', '1'), ex('b', 1, 2, '좌석', '2'), ex('c', 1, 3, '기둥', '')];
  const p = gp(existing, [{ row: 1, col: 1, kind: '좌석' }, { row: 1, col: 2, kind: '기둥' }, { row: 2, col: 1, kind: '좌석' }, { row: 1, col: 3, kind: '창문' }]);
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.create, [{ row: '2', col: '1', kind: '좌석', label: '2', status: '유효' }]);
  assert.deepStrictEqual(p.update, [{ id: 'b', patch: { kind: '기둥', label: '' } }, { id: 'c', patch: { kind: '창문' } }]);
  assert.deepStrictEqual(p.cancel, []);
  const rm = gp(existing, [{ row: 1, col: 1, kind: '좌석' }]);
  assert.deepStrictEqual(rm.cancel.map((c) => c.id), ['b', 'c']);
  assert.ok(rm.cancel.every((c) => c.patch.status === '취소'), '지우지 않고 취소');
});

test('seatGridPlan_: 같은 모양이면 바뀐 것 0건(멱등)', () => {
  const existing = [ex('a', 1, 1, '좌석', '1-1'), ex('b', 1, 2, '기둥', '')];
  const p = gp(existing, [{ row: 1, col: 1, kind: '좌석' }, { row: 1, col: 2, kind: '기둥' }], [], 3, 3, 'line');
  assert.deepStrictEqual([p.create.length, p.update.length, p.cancel.length, p.relabelAssigned], [0, 0, 0, 0]);
});

test('seatGridPlan_: 앉은 좌석을 바꾸거나 없애면 거부하고, 번호가 밀리는 것만으로는 거부하지 않는다(나쁜 입력)', () => {
  const existing = [ex('a', 1, 1, '좌석', '1'), ex('b', 1, 2, '좌석', '2')];
  const noSeat = gp(existing, [{ row: 1, col: 1, kind: '기둥' }, { row: 1, col: 2, kind: '좌석' }], ['a']);
  assert.strictEqual(noSeat.ok, false); assert.ok(noSeat.errors[0].includes('1행 1열') && noSeat.errors[0].includes(TRUE_MSG) && !noSeat.errors[0].includes('배정을 풀어'), noSeat.errors[0]);
  const gone = gp(existing, [{ row: 1, col: 2, kind: '좌석' }], ['a']);
  assert.strictEqual(gone.ok, false);
  const shift = gp(existing, [{ row: 1, col: 1, kind: '창문' }, { row: 1, col: 2, kind: '좌석' }], ['b']);
  assert.strictEqual(shift.ok, true, '앞 번호가 밀리는 것만으로는 거부하지 않는다');
  assert.deepStrictEqual(shift.update.find((u) => u.id === 'b').patch, { label: '1' });
  const out = gp(existing, [{ row: 9, col: 9, kind: '좌석' }, { row: 1, col: 1, kind: '아무거나' }]);
  assert.strictEqual(out.ok, false); assert.strictEqual(out.errors.length, 2);
});

test('seatGridPlan_: 번호가 바뀌는 배정 좌석 수를 센다(배정 안 된 좌석은 세지 않는다)', () => {
  // 줄 1(열 1)에 좌석 3개. 맨 앞을 창문으로 바꾸면 뒤 두 좌석의 번호가 1-1·1-2로 당겨진다
  const existing = [ex('a', 1, 1, '좌석', '1-1'), ex('b', 2, 1, '좌석', '1-2'), ex('c', 3, 1, '좌석', '1-3')];
  const want = [{ row: 1, col: 1, kind: '창문' }, { row: 2, col: 1, kind: '좌석' }, { row: 3, col: 1, kind: '좌석' }];
  const p = gp(existing, want, ['b'], 3, 3, 'line');
  assert.strictEqual(p.ok, true); assert.strictEqual(p.relabelAssigned, 1, 'b만 배정됐고 번호가 바뀜');
  assert.deepStrictEqual(p.update, [{ id: 'a', patch: { kind: '창문', label: '' } }, { id: 'b', patch: { label: '1-1' } }, { id: 'c', patch: { label: '1-2' } }]);
  assert.strictEqual(gp(existing, want, [], 3, 3, 'line').relabelAssigned, 0);
});

test('seatGridPlan_: 지난 기간 배정만 있는 좌석은 경고 후 허용, 지금·앞으로 배정이 있으면 거부', () => {
  const existing = [ex('a', 1, 1, '좌석', '1'), ex('b', 1, 2, '좌석', '2')];
  const p = gp(existing, [{ row: 1, col: 2, kind: '좌석' }], [], 3, 3, 'room', ['a']);
  assert.strictEqual(p.ok, true); assert.strictEqual(p.cancel.length, 1);
  assert.ok(p.warnings.length === 1 && p.warnings[0].includes('지난 기간') && p.warnings[0].includes('1행 1열'));
  const labelOnly = gp(existing, [{ row: 1, col: 1, kind: '창문' }, { row: 1, col: 2, kind: '좌석' }], [], 3, 3, 'room', ['b']);
  assert.ok(labelOnly.warnings.some((w) => w.includes('번호가 바뀝니다')));
  assert.strictEqual(gp(existing, [{ row: 1, col: 2, kind: '좌석' }], ['a'], 3, 3, 'room', []).ok, false);
});

/* ───── 배정·맞바꾸기 계획 ───── */

const kinds = { s1: '좌석', s2: '좌석', s3: '좌석', p: '기둥' };
const Y = '2027-03-20';
const A = (id, seat, stu, extra) => Object.assign({ id, seat_id: seat, student_id: stu, term_id: 'T', status: '배정', valid_from: '', valid_to: '' }, extra || {});
const NEW = (seat, stu, from) => ({ op: 'create', row: { term_id: 'T', seat_id: seat, student_id: stu, valid_from: from || Y, valid_to: '', status: '배정', memo: '' } });
const asg = (live, seat, stu, enrolled, stale, ymd) => plain(pure.planSeatAssign_(live, 'T', seat, stu, kinds, enrolled || ['x', 'y', 'z'], stale || [], ymd || Y, '2027-03-02'));
const swp = (live, a, b, stale, ymd) => plain(pure.planSeatSwap_(live, a, b, kinds, stale || [], ymd || Y, 'T', '2027-03-02'));

test('planSeatAssign_: 빈 자리에 새로 배정(기준일부터), 같은 자리면 할 일 없음', () => {
  assert.deepStrictEqual(asg([], 's1', 'x').ops, [NEW('s1', 'x')]);
  assert.strictEqual(asg([A('r1', 's1', 'x')], 's1', 'x').noop, true);
});

test('적용일이 기간 시작일 이하이면 새 행의 valid_from은 빈칸(기간 전체) — 나중에 기간 시작일을 앞당겨도 잠기지 않는다', () => {
  const row = (ops) => ops.find((o) => o.op === 'create').row;
  assert.strictEqual(row(asg([], 's1', 'x', null, null, '2027-03-02').ops).valid_from, '', '시작일 당일');
  assert.strictEqual(row(asg([], 's1', 'x', null, null, '2027-03-01').ops).valid_from, '', '시작 전');
  assert.strictEqual(row(asg([], 's1', 'x', null, null, '2027-03-03').ops).valid_from, '2027-03-03', '시작 뒤는 적용일');
  const sw = plain(pure.planSeatSwap_([A('r1', 's1', 'x'), A('r2', 's2', 'y')], 's1', 's2', kinds, [], '2027-03-02', 'T', '2027-03-02'));
  assert.deepStrictEqual(sw.ops.filter((o) => o.op === 'create').map((o) => o.row.valid_from), ['', '']);
  assert.deepStrictEqual(sw.ops.filter((o) => o.op !== 'create').map((o) => o.op), ['cancel', 'cancel'], '시작 전부터 있던 행은 끝내지 않고 취소(지난 기록 없음)');
});

test('planSeatAssign_: 이미 다른 자리에 배정된 학생은 옮기지 않고 거부한다(이동은 맞바꾸기로만)', () => {
  const r = asg([A('r1', 's2', 'x')], 's1', 'x');
  assert.strictEqual(r.ok, false); assert.ok(r.error.includes('이미 다른 자리에 배정'));
  assert.deepStrictEqual(r.ops, []);
});

test('planSeatAssign_: 앉은 자리·좌석 아닌 칸·미등록 학생·날짜 좁힌 배정은 거부(나쁜 입력)', () => {
  assert.ok(asg([A('r1', 's1', 'y')], 's1', 'x').error.includes('이미 학생이 배정'));
  assert.ok(asg([], 'p', 'x').error.includes('좌석이 아닌'));
  assert.ok(asg([], 's1', 'nobody').error.includes('등록된 학생이 아닙니다'));
  assert.ok(asg([A('r1', 's1', 'y', { valid_from: '2027-07-20' })], 's1', 'x').error.includes('날짜를 좁힌'), '앞으로 시작하는 배정');
  assert.ok(asg([A('r1', 's1', 'y', { valid_to: '2027-07-20' })], 's1', 'x').error.includes('날짜를 좁힌'), '앞으로 끝나는 배정');
});

test('planSeatAssign_: 기준일 전에 끝난 행은 지난 기록이라 새 배정을 막지 않는다', () => {
  const ended = A('old', 's1', 'y', { valid_to: '2027-03-19' });
  assert.deepStrictEqual(asg([ended], 's1', 'x').ops, [NEW('s1', 'x')]);
  const mineEnded = A('m', 's2', 'x', { valid_to: '2027-03-19' });
  assert.deepStrictEqual(asg([mineEnded], 's1', 'x').ops, [NEW('s1', 'x')], '학생 자신의 지난 행도 막지 않는다');
});

test('planSeatAssign_: 퇴실한 학생 자리(stale)에 앉히면 이전 행을 취소하지 않고 기준일 전날로 끝내고 새 행을 만든다', () => {
  const p = asg([A('old', 's1', 'y')], 's1', 'x', null, ['s1']);
  assert.deepStrictEqual(p.ops, [{ op: 'update', id: 'old', patch: { valid_to: '2027-03-19' } }, NEW('s1', 'x', Y)]);
  assert.ok(!p.ops.some((o) => o.op === 'cancel'), '지난 기록을 취소로 지우지 않는다');
  assert.ok(asg([A('old', 's1', 'y')], 's1', 'x').error, 'stale가 아니면(입실 전 등) 거부');
  // 같은 날 시작한 행이면 시작도 못 한 것이라 취소
  const same = asg([A('old', 's1', 'y', { valid_from: Y })], 's1', 'x', null, ['s1']);
  assert.deepStrictEqual(same.ops[0], { op: 'cancel', id: 'old' });
});

const END = (id) => ({ op: 'update', id, patch: { valid_to: '2027-03-19' } });
test('planSeatSwap_: 둘 다 앉음→두 행을 끝내고 새 행 둘, 한쪽만→끝내고 새 자리(제자리 수정 없음), 둘 다 빔→할 일 없음', () => {
  assert.deepStrictEqual(swp([A('r1', 's1', 'x'), A('r2', 's2', 'y')], 's1', 's2').ops, [END('r1'), END('r2'), NEW('s1', 'y'), NEW('s2', 'x')]);
  assert.deepStrictEqual(swp([A('r1', 's1', 'x')], 's1', 's3').ops, [END('r1'), NEW('s3', 'x')]);
  assert.deepStrictEqual(swp([A('r1', 's1', 'x')], 's3', 's1').ops, [END('r1'), NEW('s3', 'x')], '순서가 바뀌어도 같다');
  assert.strictEqual(swp([], 's1', 's2').noop, true);
  for (const ops of [swp([A('r1', 's1', 'x'), A('r2', 's2', 'y')], 's1', 's2').ops, swp([A('r1', 's1', 'x')], 's1', 's3').ops]) {
    assert.ok(ops.every((o) => o.op !== 'update' || Object.keys(o.patch).join() === 'valid_to'), 'student_id·seat_id를 제자리에서 고치지 않는다');
  }
});

test('planSeatSwap_: 오늘 시작한 행(valid_from = 기준일)은 지난 기록이 없으므로 끝내지 않고 취소한다', () => {
  const p = swp([A('r1', 's1', 'x', { valid_from: Y }), A('r2', 's2', 'y')], 's1', 's2');
  assert.deepStrictEqual(p.ops.slice(0, 2), [{ op: 'cancel', id: 'r1' }, END('r2')]);
});

test('planSeatSwap_: 같은 자리·기둥·날짜 좁힌 배정은 거부', () => {
  assert.ok(swp([], 's1', 's1').error); assert.ok(swp([], 's1', 'p').error);
  assert.ok(swp([A('r1', 's1', 'x', { valid_to: '2027-07-20' })], 's1', 's2').error.includes('날짜를 좁힌'));
});

test('planSeatSwap_: 퇴실 자리(stale)로 옮기면 이전 기록은 끝내기만 하고(취소 없음) 학생은 기준일부터 새 행', () => {
  const p = swp([A('r1', 's1', 'x'), A('gone', 's2', 'y')], 's1', 's2', ['s2']);
  assert.deepStrictEqual(p.ops, [END('r1'), END('gone'), NEW('s2', 'x', Y)]);
  assert.ok(!p.ops.some((o) => o.op === 'cancel'));
  assert.strictEqual(swp([A('gone', 's2', 'y')], 's1', 's2', ['s2']).noop, true, '앉은 사람이 없으면 할 일 없음');
});

test('seatToken_: 자리의 배정이 바뀌면 달라지고, 빈 자리는 빈 문자열, 날짜 좁힌 배정은 bounded', () => {
  const t = (live, seat) => pure.seatToken_(live, seat, Y);
  assert.strictEqual(t([], 's1'), '');
  assert.notStrictEqual(t([A('r1', 's1', 'x')], 's1'), t([A('r1', 's1', 'y')], 's1'), '같은 행이라도 학생이 바뀌면 다르다');
  assert.strictEqual(t([A('r1', 's1', 'x', { valid_to: '2027-03-01' })], 's1'), '', '기준일 전에 끝난 행은 빈 자리로 본다');
  assert.strictEqual(t([A('r1', 's1', 'x', { valid_to: '2027-09-01' })], 's1'), 'bounded');
});

test('seatGenderWarning_: 성별 구역이 어긋날 때만 경고, 혼성은 없음', () => {
  assert.strictEqual(pure.seatGenderWarning_({ gender: '혼성', name: '1층' }, { gender: '여', name: '가' }), '');
  assert.strictEqual(pure.seatGenderWarning_({ gender: '남', name: 'SA1실' }, { gender: '남', name: '가' }), '');
  assert.ok(pure.seatGenderWarning_({ gender: '남', name: 'SA1실' }, { gender: '여', name: '가학생' }).includes('SA1실'));
});

/* ───── 서버 함수(가짜 서비스) ───── */

function makeServer(email, roles, today) {
  const db = {
    terms: fake.terms.map((t) => Object.assign({}, t)), students: fake.students.map((s) => Object.assign({}, s)),
    enrollments: fake.enrollments.map((e) => Object.assign({}, e)), status_changes: s1.statusChanges.map((r) => Object.assign({}, r)),
    spaces: s1.spaces.map((r) => Object.assign({}, r)), seats: s1.seats.map((r) => Object.assign({}, r)),
    seat_assignments: s1.seatAssignments.map((r) => Object.assign({}, r)),
    users: [{ id: 'u0', email, active: 'TRUE', roles: roles.join(','), name: '가짜교사', homeroom_class: '' }]
  };
  const denied = [], writes = [];
  const flags = { failUpdate: false };
  const state = { today: today || '2027-03-20' };
  let uid = 0, depth = 0;
  const copy = (r) => Object.assign({}, r);
  const c = loadGs(FILES, {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    readAll_: (n) => (db[n] || []).map(copy), invalidate_: () => {}, today_: () => state.today,
    logDenied_: (who, action) => denied.push(action),
    withLock_: (fn) => { depth++; try { return fn(); } finally { depth--; } },
    appendRecord_: (sheet, rec) => { assert.ok(depth > 0, '쓰기는 락 안에서'); const r = Object.assign({ id: 'n' + (++uid) }, rec); db[sheet].push(r); writes.push('+' + sheet); return r; },
    updateRecord_: (sheet, id, patch) => { assert.ok(depth > 0, '쓰기는 락 안에서'); Object.assign(db[sheet].find((r) => r.id === id), patch); writes.push('~' + sheet); return {}; },
    bulkAppend_: (sheet, rows) => { assert.ok(depth > 0); rows.forEach((r) => db[sheet].push(Object.assign({ id: 'n' + (++uid) }, r))); if (rows.length) writes.push('+' + sheet + ':' + rows.length); },
    bulkUpdateRecords_: (sheet, patches) => { assert.ok(depth > 0); if (flags.failUpdate) throw new Error('시트 쓰기 실패(가짜)'); patches.forEach((p) => Object.assign(db[sheet].find((r) => r.id === p.id), p.patch)); if (patches.length) writes.push('~' + sheet + ':' + patches.length); return patches.length; }
  });
  return { c, db, denied, writes, flags, setToday: (d) => { state.today = d; } };
}
const admin = (today) => makeServer('admin@example.com', ['admin'], today);
const data = (s) => plain(s.c.getSeatData(TERM.id));
const toKo = { seat: '좌석', pillar: '기둥', door: '비상문', window: '창문' };
const gridOf = (sp) => sp.cells.map((c) => ({ row: c.row, col: c.col, kind: toKo[c.kind] }));
const allCells = (d) => d.spaces.flatMap((sp) => sp.cells);
const tokOf = (d, ...ids) => Object.fromEntries(ids.map((id) => [id, allCells(d).find((c) => c.id === id).token]));
const cellsOf = (d, name) => d.spaces.find((x) => x.name === name).cells;
const seatOfStudent = (d, sid) => { for (const sp of d.spaces) for (const c of sp.cells) if (c.studentId === sid) return c; return null; };

test('getSeatData: 공간 7개, 1층 146석·남 SA 17·여 SA 34, 기둥·비상문·창문은 칸 종류로', () => {
  const d = data(admin());
  assert.strictEqual(d.spaces.length, 7);
  const seatCount = (pred) => d.spaces.filter(pred).reduce((n, sp) => n + sp.cells.filter((c) => c.kind === 'seat').length, 0);
  assert.strictEqual(seatCount((sp) => sp.name === '1층 자습실'), 146);
  assert.strictEqual(seatCount((sp) => sp.gender === '남'), 17);
  assert.strictEqual(seatCount((sp) => sp.gender === '여'), 34);
  const kindsSeen = new Set(cellsOf(d, '1층 자습실').map((c) => c.kind));
  assert.deepStrictEqual([...kindsSeen].sort(), ['door', 'pillar', 'seat', 'window']);
  assert.strictEqual(d.ymd, '2027-03-20'); assert.strictEqual(d.term.id, TERM.id);
});

test('getSeatData: 앉은 학생은 "학년. 이름", 퇴실 학생 자리는 공석(퇴실)+배정자 표시, 중도 입실자는 미배정 목록', () => {
  const d = data(admin());
  assert.ok(seatOfStudent(d, s1.leaverId) === null, '퇴실한 학생은 앉아 있지 않다');
  const held = d.spaces.flatMap((sp) => sp.cells).find((c) => c.reason === '퇴실');
  assert.ok(held && held.vacant && held.hold, '퇴실 자리는 공석이고 누가 배정돼 있었는지 보인다');
  assert.deepStrictEqual(d.unseated.map((u) => u.id), [s1.lateEntrantId]);
  assert.ok(/^\d\. /.test(d.unseated[0].display));
  const sitting = d.spaces.flatMap((sp) => sp.cells).filter((c) => c.studentId);
  assert.strictEqual(sitting.length, 28, '30명 − 퇴실 1 − 미배정 1');
  assert.ok(sitting.every((c) => /^\d\. \S+/.test(c.text)));
  const before = plain(admin('2027-03-03').c.getSeatData(TERM.id));
  assert.strictEqual(before.unseated.length, 0, '3월 3일에는 중도 입실자가 아직 입실 전이라 미배정 목록에 없다');
  assert.ok(!JSON.stringify(d).includes('example.com'), '이메일을 내보내지 않는다');
});

const past = (s) => mapOn(s, '2027-03-10').bySeat;   // 퇴실 전날들의 좌석표(퇴실 3/10 당일은 아직 앉아 있다고 본다)
const emptySeat = (d, name) => (name ? cellsOf(d, name) : allCells(d)).find((c) => c.kind === 'seat' && c.vacant && !c.hold);
const asgn = (s, seatId, stuId, d0) => plain(s.c.assignSeat(TERM.id, seatId, stuId, tokOf(d0 || data(s), seatId)));
const swap = (s, a, b, d0) => plain(s.c.swapSeats(TERM.id, a, b, tokOf(d0 || data(s), a, b)));
const unassign = (s, id, d0) => plain(s.c.unassignSeat(TERM.id, id, tokOf(d0 || data(s), id)));
const mapOn = (s, ymd) => plain(s.c.seatMapOn_(s.db.seats, s.db.seat_assignments, s.db.enrollments, s.db.status_changes, TERM.id, ymd));

test('assignSeat: 중도 입실자를 빈 자리에 앉히면 미배정 목록에서 빠지고, 앉은 자리에는 거부(쓰기 없음)', () => {
  const s = admin();
  const sa = emptySeat(data(s), '1층 자습실');
  const r = asgn(s, sa.id, s1.lateEntrantId);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.db.seat_assignments.filter((a) => a.student_id === s1.lateEntrantId && a.status === '배정').length, 1);
  const d2 = data(s);
  assert.strictEqual(seatOfStudent(d2, s1.lateEntrantId).id, sa.id);
  assert.strictEqual(d2.unseated.length, 0);
  const w = s.writes.length;
  const sitting = allCells(d2).find((c) => c.studentId && c.studentId !== s1.lateEntrantId);
  const bad = asgn(s, sitting.id, s1.lateEntrantId, d2);
  assert.strictEqual(bad.ok, false); assert.ok(bad.error.includes('이미'));
  assert.strictEqual(s.writes.length, w);
});

test('assignSeat: 이미 배정된 학생은 옮기지 않고 거부(쓰기 없음), 이동은 맞바꾸기로', () => {
  const s = admin();
  const d = data(s);
  const mover = allCells(d).find((c) => c.studentId);
  const target = emptySeat(d, '1층 자습실');
  const w = s.writes.length;
  const r = plain(s.c.assignSeat(TERM.id, target.id, mover.studentId, tokOf(d, target.id)));
  assert.strictEqual(r.ok, false); assert.ok(r.error.includes('이미 다른 자리에 배정'));
  assert.strictEqual(s.writes.length, w);
  assert.strictEqual(seatOfStudent(data(s), mover.studentId).id, mover.id, '원래 자리에 그대로');
});

test('assignSeat: 퇴실한 학생 자리에 앉혀도 그 학생의 지난 기록은 남는다(3/5 좌석표가 퇴실 전 학생을 그대로 보인다)', () => {
  const s = admin();   // 오늘 3/20, 퇴실 3/10
  const held = allCells(data(s)).find((c) => c.reason === '퇴실');
  const old = s.db.seat_assignments.find((a) => a.seat_id === held.id && a.status === '배정');
  const total = s.db.seat_assignments.length;
  assert.strictEqual(asgn(s, held.id, s1.lateEntrantId).ok, true);
  const oldAfter = s.db.seat_assignments.find((a) => a.id === old.id);
  assert.strictEqual(oldAfter.status, '배정', '취소하지 않는다');
  assert.strictEqual(oldAfter.valid_to, '2027-03-19', '기준일 전날까지');
  assert.strictEqual(s.db.seat_assignments.length, total + 1, '새 행 하나만 늘었다');
  const nr = s.db.seat_assignments[s.db.seat_assignments.length - 1];
  assert.deepStrictEqual([nr.student_id, nr.seat_id, nr.valid_from, nr.valid_to], [s1.lateEntrantId, held.id, '2027-03-20', '']);
  assert.strictEqual(seatOfStudent(data(s), s1.lateEntrantId).id, held.id, '오늘은 새 학생');
  const before = mapOn(s, '2027-03-05').bySeat[held.id];
  assert.strictEqual(before.studentId, old.student_id, '3월 5일에는 원래 학생이 그 자리에 앉아 있다');
  assert.strictEqual(old.student_id, s1.leaverId); assert.strictEqual(mapOn(s, '2027-03-12').bySeat[held.id].studentId, null, '퇴실 뒤 새 학생이 오기 전(3/12)은 빈 자리');
  assert.strictEqual(mapOn(s, '2027-03-25').bySeat[held.id].studentId, s1.lateEntrantId, '3월 25일에는 새 학생');
});

test('assignSeat: 성별 구역이 어긋나면 배정은 되고 경고를 돌려준다', () => {
  const s = admin();
  s.db.students.find((x) => x.id === s1.lateEntrantId).gender = '여';
  const saMale = emptySeat(data(s), 'SA1실');
  const r = asgn(s, saMale.id, s1.lateEntrantId);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.warnings.length, 1); assert.ok(r.warnings[0].includes('SA1실'));
});

test('swapSeats: 두 학생 맞바꿈(옛 행 끝내기 + 새 행, 쓰기는 두 번), 빈 자리로 이동, 둘 다 비면 아무것도 안 씀', () => {
  const s = admin();
  const d = data(s);
  const [a, b] = d.spaces[0].cells.filter((c) => c.studentId).slice(0, 2);
  const total = s.db.seat_assignments.length;
  const r = swap(s, a.id, b.id, d);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.db.seat_assignments.length, total + 2, '옛 행 둘은 끝내고 새 행 둘을 만든다');
  const d2 = data(s);
  assert.strictEqual(seatOfStudent(d2, a.studentId).id, b.id);
  assert.strictEqual(seatOfStudent(d2, b.studentId).id, a.id);
  assert.deepStrictEqual(s.writes.filter((w) => w.includes('seat_assignments')), ['~seat_assignments:2', '+seat_assignments:2'], '수정 한 번 + 추가 한 번');
  // 빈 자리로 이동
  const empty = emptySeat(d2, 'SA1실');
  assert.strictEqual(swap(s, a.id, empty.id, d2).ok, true);
  const d3 = data(s);
  assert.strictEqual(seatOfStudent(d3, b.studentId).id, empty.id, 'a 자리에 있던 학생이 빈 자리로 옮겨 감');
  assert.strictEqual(seatOfStudent(d3, a.studentId).id, b.id, '다른 학생은 그대로');
  assert.strictEqual(allCells(d3).find((c) => c.id === a.id).vacant, true);
  const w = s.writes.length;
  const e2 = allCells(d3).filter((c) => c.kind === 'seat' && c.vacant && !c.hold).slice(0, 2);
  assert.strictEqual(swap(s, e2[0].id, e2[1].id, d3).noop, true);
  assert.strictEqual(s.writes.length, w);
  assert.strictEqual(plain(s.c.swapSeats(TERM.id, a.id, a.id, tokOf(d3, a.id))).ok, false);
});

test('swapSeats: 학생이 퇴실 자리로 옮겨 가도 지난 기록은 남는다(취소 없음, 3/5 좌석표 그대로)', () => {
  const s = admin();
  const d = data(s);
  const held = allCells(d).find((c) => c.reason === '퇴실');
  const who = d.spaces[0].cells.find((c) => c.studentId);
  const oldRow = s.db.seat_assignments.find((a) => a.seat_id === held.id && a.status === '배정');
  const whoRow = s.db.seat_assignments.find((a) => a.seat_id === who.id && a.status === '배정');
  const mapBefore = mapOn(s, '2027-03-05');
  assert.strictEqual(swap(s, who.id, held.id, d).ok, true);
  assert.strictEqual(s.db.seat_assignments.find((a) => a.id === oldRow.id).status, '배정');
  assert.strictEqual(s.db.seat_assignments.find((a) => a.id === oldRow.id).valid_to, '2027-03-19');
  assert.strictEqual(s.db.seat_assignments.find((a) => a.id === whoRow.id).valid_to, '2027-03-19');
  assert.strictEqual(seatOfStudent(data(s), who.studentId).id, held.id, '오늘은 퇴실 자리로 옮겨 감');
  assert.deepStrictEqual(mapOn(s, '2027-03-05').bySeat, mapBefore.bySeat, '3월 5일 좌석표는 그대로');
  assert.deepStrictEqual(s.writes.filter((w) => w.includes('seat_assignments')), ['~seat_assignments:2', '+seat_assignments:1']);
});

test('unassignSeat: 배정을 기준일 전날로 끝내고(지난 기록은 남김) 미배정 목록으로 돌려보낸다. 빈 자리는 거부', () => {
  const s = admin();
  const d = data(s);
  const c = d.spaces[0].cells.find((x) => x.studentId);
  const base = past(s);
  assert.strictEqual(unassign(s, c.id, d).ok, true);
  const rows = s.db.seat_assignments.filter((a) => a.student_id === c.studentId);
  assert.ok(rows.every((a) => a.status === '배정' && a.valid_to === '2027-03-19'), '취소하지 않고 끝낸다');
  assert.deepStrictEqual(past(s), base, '지난 날짜 좌석표는 그대로');
  assert.ok(data(s).unseated.some((u) => u.id === c.studentId));
  assert.strictEqual(unassign(s, c.id).ok, false, '이미 빈 자리');
});

/* ───── 지난 날짜 좌석표 보존(총괄 3차): 모든 배정 변경은 적용일 기준 — 제자리 수정 없음 ───── */

const seatedPair = (d) => d.spaces[0].cells.filter((c) => c.studentId).slice(0, 2);

test('지난 날짜 보존(a): X를 퇴실 자리 S로 옮긴 뒤 S(X)↔B(Y) 맞바꾸기를 해도 3/10 좌석표는 그대로', () => {
  const s = admin();
  const base = past(s);
  const d = data(s);
  const [x, y] = seatedPair(d);
  const held = allCells(d).find((c) => c.reason === '퇴실');
  assert.strictEqual(swap(s, x.id, held.id, d).ok, true);
  assert.strictEqual(swap(s, held.id, y.id).ok, true);
  assert.deepStrictEqual(past(s), base);
  assert.deepStrictEqual(mapOn(s, '2027-03-20').warnings, []);
  const now = data(s);
  assert.strictEqual(seatOfStudent(now, x.studentId).id, y.id, '오늘은 맞바꿈 결과');
  assert.strictEqual(seatOfStudent(now, y.studentId).id, held.id);
});

test('지난 날짜 보존(b): X를 퇴실 자리로 옮기고 3/22에 Y를 X의 옛 자리로 이동해도 3/10 좌석표는 그대로', () => {
  const s = admin();
  const base = past(s);
  const d = data(s);
  const [x, y] = seatedPair(d);
  const held = allCells(d).find((c) => c.reason === '퇴실');
  assert.strictEqual(swap(s, x.id, held.id, d).ok, true);
  s.setToday('2027-03-22');
  assert.strictEqual(swap(s, y.id, x.id).ok, true);
  assert.deepStrictEqual(past(s), base);
  assert.strictEqual(seatOfStudent(data(s), y.studentId).id, x.id);
});

test('지난 날짜 보존(c): 퇴실 학생 자리에서 배정을 풀어도 퇴실한 학생의 지난 행은 취소되지 않는다', () => {
  const s = admin();
  const base = past(s);
  const held = allCells(data(s)).find((c) => c.reason === '퇴실');
  const row = s.db.seat_assignments.find((a) => a.seat_id === held.id && a.status === '배정');
  assert.strictEqual(unassign(s, held.id).ok, true);
  assert.strictEqual(s.db.seat_assignments.find((a) => a.id === row.id).status, '배정', '취소하지 않는다');
  assert.deepStrictEqual(past(s), base);
});

test('지난 날짜 보존: 맞바꾸기·이동·풀기·앉히기 어느 것도 기존 행을 제자리에서 고치지 않는다(student_id·seat_id 불변)', () => {
  const s = admin();
  const d = data(s);
  const [x, y] = seatedPair(d);
  const empty = emptySeat(d, 'SA1실');
  const snap = () => JSON.stringify(s.db.seat_assignments.map((a) => [a.id, a.seat_id, a.student_id]));
  const before = JSON.parse(snap());
  swap(s, x.id, y.id, d); swap(s, x.id, empty.id); unassign(s, y.id); asgn(s, y.id, s1.lateEntrantId);
  const after = Object.fromEntries(JSON.parse(snap()).map((r) => [r[0], r]));
  before.forEach((r) => assert.deepStrictEqual(after[r[0]], r, '기존 행 ' + r[0] + '의 seat_id·student_id가 바뀌었다'));
});

test('token에 퇴실 여부가 들어간다: 퇴실이 취소돼 자리가 다시 "앉은 자리"가 되면 옛 화면의 옮기기는 거부', () => {
  const s = admin();
  const d = data(s);
  const [x] = seatedPair(d);
  const held = allCells(d).find((c) => c.reason === '퇴실');
  s.db.status_changes.filter((c) => c.student_id === s1.leaverId && c.item === '학사').forEach((c) => { c.status = '취소'; });   // 퇴실 취소
  const w = s.writes.length;
  const r = plain(s.c.swapSeats(TERM.id, x.id, held.id, tokOf(d, x.id, held.id)));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.stale, true);
  assert.strictEqual(s.writes.length, w);
});

/* ───── 격자 저장·공간 이름 ───── */

test('격자 저장: 이번 기간에 어제까지 쓰인 자리(valid_to로 끝난 행)도 막는다 — 지금·앞으로 기간의 배정 행이 하나라도 있으면(결정 37)', () => {
  const s = admin();
  const d = data(s);
  const c = d.spaces[0].cells.find((x) => x.studentId);
  assert.strictEqual(unassign(s, c.id, d).ok, true);   // 오늘 풀어서 행은 3/19로 끝난 채 남는다 — 지금은 비어 있다
  const sp = data(s).spaces[0];
  const pv = plain(s.c.previewSpaceGrid(sp.id, gridOf(sp).filter((x) => !(x.row === c.row && x.col === c.col))));
  assert.strictEqual(pv.ok, false);
  assert.ok(pv.errors[0].includes(TRUE_MSG) && !pv.errors[0].includes('지난 기간') && !pv.errors[0].includes('배정을 풀어'), pv.errors[0]);
  assert.strictEqual(plain(s.c.saveSpaceGrid(sp.id, gridOf(sp).filter((x) => !(x.row === c.row && x.col === c.col)))).ok, false);
  assert.strictEqual(s.db.seats.find((x) => x.id === c.id).status, '유효');
  const freshSeat = sp.cells.find((x) => x.kind === 'seat' && x.vacant && !x.hold && x.id !== c.id);   // 기록이 전혀 없는 자리는 지울 수 있다
  assert.strictEqual(plain(s.c.previewSpaceGrid(sp.id, gridOf(sp).filter((x) => !(x.row === freshSeat.row && x.col === freshSeat.col)))).ok, true);
});

test('공간 이름을 바꿔 번호 방식이 바뀌면 saveSpace가 같은 락에서 번호를 다시 매긴다(저장 전 확인: needsConfirm + 라벨 바뀌는 배정 좌석 N개)', () => {
  const s = admin();
  const d = data(s);
  const sa = d.spaces.find((x) => x.name === 'SA3실');
  const seatedHere = sa.cells.filter((c) => c.studentId || c.hold).length;
  const input = { id: sa.id, name: '자습 3호', gender: sa.gender, rows: sa.rows, cols: sa.cols };   // SA실 → 줄-순번
  const w = s.writes.length;
  const ask = plain(s.c.saveSpace(input));
  assert.deepStrictEqual([ask.ok, ask.needsConfirm], [false, true]);
  assert.ok(ask.relabelCount > 0); assert.strictEqual(ask.relabelAssigned, seatedHere);
  assert.strictEqual(s.writes.length, w, '확인 전에는 아무것도 쓰지 않는다');
  assert.strictEqual(s.db.spaces.find((x) => x.id === sa.id).name, 'SA3실');
  const r = plain(s.c.saveSpace(Object.assign({ confirmRelabel: true }, input)));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.db.spaces.find((x) => x.id === sa.id).name, '자습 3호');
  const labels = s.db.seats.filter((x) => x.space_id === sa.id && x.kind === '좌석').map((x) => x.label);
  assert.ok(labels.every((l) => /^\d+-\d+$/.test(l)), labels.join(','));
  // 같은 방식끼리 이름만 바꾸면 확인 없이 저장
  const sa2 = d.spaces.find((x) => x.name === 'SA4실');
  assert.strictEqual(plain(s.c.saveSpace({ id: sa2.id, name: 'SA4호실', gender: sa2.gender, rows: sa2.rows, cols: sa2.cols })).ok, true);
});

test('saveSpace: 번호 쓰기가 실패하면 이름도 바뀌지 않는다(번호를 먼저 쓴다)', () => {
  const s = admin();
  const sa = data(s).spaces.find((x) => x.name === 'SA3실');
  const before = JSON.stringify([s.db.spaces.find((x) => x.id === sa.id), s.db.seats.filter((x) => x.space_id === sa.id)]);
  s.flags.failUpdate = true;
  assert.throws(() => s.c.saveSpace({ id: sa.id, name: '자습 3호', gender: sa.gender, rows: sa.rows, cols: sa.cols, confirmRelabel: true }), /시트 쓰기 실패/);
  assert.strictEqual(JSON.stringify([s.db.spaces.find((x) => x.id === sa.id), s.db.seats.filter((x) => x.space_id === sa.id)]), before);
  s.flags.failUpdate = false;
  assert.strictEqual(plain(s.c.saveSpace({ id: sa.id, name: '자습 3호', gender: sa.gender, rows: sa.rows, cols: sa.cols, confirmRelabel: true })).ok, true, '다시 하면 된다');
});

/* ───── 격자 거부 문구는 막힌 이유대로 ───── */

test('오늘 앉힌 자리·기간 시작 전에 앉힌 자리는 풀면 바로 바꿀 수 있으므로 "먼저 배정을 풀어 주세요", 이전부터 앉았던 자리는 "기간이 끝난 뒤"', () => {
  const FREE = '먼저 배정을 풀어 주세요';
  for (const today of ['2027-03-20', '2027-02-20']) {   // 기간 시작 뒤(오늘 앉힘) / 시작 전(적용일 = 시작일)
    const s = admin(today);
    const d = data(s);
    const sp = d.spaces.find((x) => x.name === 'SA3실');
    const seat = emptySeat(d, 'SA3실');
    s.db.seat_assignments = s.db.seat_assignments.filter((a) => a.seat_id !== seat.id);   // 배정 기록이 전혀 없는 자리에서 시작
    assert.strictEqual(asgn(s, seat.id, s1.lateEntrantId).ok, true);
    const without = () => gridOf(data(s).spaces.find((x) => x.id === sp.id)).filter((c) => !(c.row === seat.row && c.col === seat.col));
    const blocked = plain(s.c.previewSpaceGrid(sp.id, without()));
    assert.strictEqual(blocked.ok, false, today);
    assert.ok(blocked.errors[0].includes(FREE) && !blocked.errors[0].includes('끝난 뒤'), today + ' ' + blocked.errors[0]);
    assert.strictEqual(unassign(s, seat.id).ok, true);   // 오늘 시작한(또는 기간 시작 전) 행은 취소되어 기록이 남지 않는다
    assert.strictEqual(plain(s.c.previewSpaceGrid(sp.id, without())).ok, true, today + ' 풀면 바로 바꿀 수 있다');
  }
  const s = admin();   // 가짜 데이터: 기간 시작부터 앉은 학생 → 풀어도 기록이 남는다
  const floor = data(s).spaces[0], seated = floor.cells.find((c) => c.studentId);
  const kept = plain(s.c.previewSpaceGrid(floor.id, gridOf(floor).filter((c) => !(c.row === seated.row && c.col === seated.col))));
  assert.ok(kept.errors[0].includes(TRUE_MSG) && !kept.errors[0].includes(FREE), kept.errors[0]);
});

/* ───── 동시 편집·원자성·끝난 기간 ───── */

test('동시 편집(a): 두 교사가 같은 미배정 학생을 서로 다른 자리에 앉히면 두 번째는 거부되고 학생은 한 자리에만 있다', () => {
  const s = admin();
  const snap = data(s);                              // 두 교사가 같은 화면을 보고 있다
  const [x, y] = allCells(snap).filter((c) => c.kind === 'seat' && c.vacant && !c.hold);
  assert.strictEqual(plain(s.c.assignSeat(TERM.id, x.id, s1.lateEntrantId, tokOf(snap, x.id))).ok, true);
  const w = s.writes.length;
  const b = plain(s.c.assignSeat(TERM.id, y.id, s1.lateEntrantId, tokOf(snap, y.id)));
  assert.strictEqual(b.ok, false); assert.ok(b.error.includes('이미 다른 자리'));
  assert.strictEqual(s.writes.length, w);
  assert.strictEqual(s.db.seat_assignments.filter((a) => a.student_id === s1.lateEntrantId && a.status === '배정').length, 1);
});

test('동시 편집: 같은 자리에 두 교사가 서로 다른 학생을 앉히면 두 번째는 "다른 선생님이 바꿨습니다"로 거부', () => {
  const s = admin();
  s.db.enrollments.push(Object.assign({}, s.db.enrollments[0], { id: 'extra-enr', student_id: 'extra-stu' }));
  s.db.students.push(Object.assign({}, s.db.students[0], { id: 'extra-stu', name: '가짜추가', gender: s.db.students.find((x) => x.id === s1.lateEntrantId).gender }));
  const snap = data(s);
  const seat = emptySeat(snap, '1층 자습실');
  assert.strictEqual(plain(s.c.assignSeat(TERM.id, seat.id, s1.lateEntrantId, tokOf(snap, seat.id))).ok, true);
  const w = s.writes.length;
  const b = plain(s.c.assignSeat(TERM.id, seat.id, 'extra-stu', tokOf(snap, seat.id)));
  assert.strictEqual(b.ok, false); assert.strictEqual(b.stale, true); assert.ok(b.error.includes('다른 선생님'));
  assert.strictEqual(s.writes.length, w);
});

test('동시 편집(b): 같은 화면에서 맞바꾸기를 두 번 보내면 두 번째는 거부 — 원상복구되지 않는다', () => {
  const s = admin();
  const snap = data(s);
  const [a, b] = snap.spaces[0].cells.filter((c) => c.studentId).slice(0, 2);
  assert.strictEqual(plain(s.c.swapSeats(TERM.id, a.id, b.id, tokOf(snap, a.id, b.id))).ok, true);
  const w = s.writes.length;
  const again = plain(s.c.swapSeats(TERM.id, a.id, b.id, tokOf(snap, a.id, b.id)));
  assert.strictEqual(again.ok, false); assert.strictEqual(again.stale, true);
  assert.strictEqual(s.writes.length, w);
  assert.strictEqual(seatOfStudent(data(s), a.studentId).id, b.id, '한 번 바뀐 상태 그대로');
});

test('동시 편집(c): 풀려는 사이 다른 학생이 옮겨 왔으면 풀지 않고 거부', () => {
  const s = admin();
  const snap = data(s);
  const [a, b] = snap.spaces[0].cells.filter((c) => c.studentId).slice(0, 2);
  assert.strictEqual(plain(s.c.swapSeats(TERM.id, a.id, b.id, tokOf(snap, a.id, b.id))).ok, true);   // 다른 교사가 먼저 맞바꿈
  const w = s.writes.length;
  const r = plain(s.c.unassignSeat(TERM.id, a.id, tokOf(snap, a.id)));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.stale, true);
  assert.strictEqual(s.writes.length, w);
  assert.ok(s.db.seat_assignments.filter((x) => x.student_id === b.studentId).every((x) => x.status !== '취소'), '옮겨 온 학생은 그대로');
});

test('expect가 없거나 자리 표가 빠졌으면 거부(화면이 본 상태를 보내야 한다)', () => {
  const s = admin();
  const d = data(s);
  const [a, b] = d.spaces[0].cells.filter((c) => c.studentId).slice(0, 2);
  const w = s.writes.length;
  for (const bad of [undefined, null, {}, { [a.id]: a.token }, { [a.id]: 5, [b.id]: b.token }]) {
    const r = plain(s.c.swapSeats(TERM.id, a.id, b.id, bad));
    assert.strictEqual(r.ok, false); assert.strictEqual(r.stale, true);
  }
  assert.strictEqual(plain(s.c.unassignSeat(TERM.id, a.id)).ok, false);
  assert.strictEqual(plain(s.c.assignSeat(TERM.id, a.id, s1.lateEntrantId)).ok, false);
  assert.strictEqual(s.writes.length, w);
});

test('원자성: 맞바꾸기의 쓰기가 실패하면 아무 행도 바뀌지 않아 한 학생이 두 자리에 있지 않다', () => {
  const s = admin();
  const d = data(s);
  const [a, b] = d.spaces[0].cells.filter((c) => c.studentId).slice(0, 2);
  const before = JSON.stringify(s.db.seat_assignments);
  s.flags.failUpdate = true;
  assert.throws(() => s.c.swapSeats(TERM.id, a.id, b.id, tokOf(d, a.id, b.id)), /시트 쓰기 실패/);
  assert.strictEqual(JSON.stringify(s.db.seat_assignments), before);
  assert.deepStrictEqual(mapOn(s, '2027-03-20').warnings, []);
});

test('끝난 운영 기간은 보기만: canEdit=false·ended=true, 배정·맞바꾸기·풀기는 거부(쓰기 없음)', () => {
  const s = admin('2027-08-01');
  const d = data(s);
  assert.strictEqual(d.ended, true); assert.strictEqual(d.canEdit, false); assert.strictEqual(d.canLayout, true, '격자 편집은 기간과 무관');
  const sitting = allCells(d).find((c) => c.studentId);
  const empty = allCells(d).find((c) => c.kind === 'seat' && c.vacant);
  for (const r of [plain(s.c.assignSeat(TERM.id, empty.id, s1.lateEntrantId, tokOf(d, empty.id))),
    plain(s.c.swapSeats(TERM.id, sitting.id, empty.id, tokOf(d, sitting.id, empty.id))), plain(s.c.unassignSeat(TERM.id, sitting.id, tokOf(d, sitting.id)))]) {
    assert.strictEqual(r.ok, false); assert.ok(r.error.includes('끝난 운영 기간'));
  }
  assert.deepStrictEqual(s.writes, []);
  assert.strictEqual(data(admin('2027-07-17')).canEdit, true, '종료일 당일은 아직 편집 가능');
});

test('보기 전용 역할에는 미배정 학생의 학번·반·번호·성별을 보내지 않는다(인원 수만)', () => {
  for (const role of ['homeroom', 'attendance', 'duty_manager']) {
    const d = plain(makeServer('v@example.com', [role]).c.getSeatData(TERM.id));
    assert.strictEqual(d.canEdit, false, role); assert.deepStrictEqual(d.unseated, [], role); assert.strictEqual(d.unseatedCount, 1, role);
    assert.ok(!JSON.stringify(d).includes(fake.students.find((x) => x.id === s1.lateEntrantId).student_no), role);
  }
  const ht = plain(makeServer('t@example.com', ['hall_teacher']).c.getSeatData(TERM.id));
  assert.strictEqual(ht.unseated.length, 1); assert.ok(ht.unseated[0].studentNo);
});

test('권한: 배정은 관리자·학사 교사만, 격자 편집은 관리자만, 보기는 교사 역할(담임은 보기만), 학생·학부모는 모두 거부', () => {
  const run = (roles, fn) => { const s = makeServer('x@example.com', roles); return { s, out: (() => { try { return fn(s); } catch (e) { return e; } })() }; };
  const seatId = admin().db.seats.find((x) => x.kind === '좌석').id;
  const assignFns = [(s) => s.c.assignSeat(TERM.id, seatId, s1.lateEntrantId), (s) => s.c.swapSeats(TERM.id, seatId, seatId), (s) => s.c.unassignSeat(TERM.id, seatId)];
  const layoutFns = [(s) => s.c.saveSpace({ name: 'x', gender: '혼성', rows: 2, cols: 2 }), (s) => s.c.saveSpaceGrid('x', []), (s) => s.c.previewSpaceGrid('x', []), (s) => s.c.previewSeatGrid('공석'), (s) => s.c.importSeatGrid('공석', { name: 'x', gender: '혼성' })];
  for (const roles of [['homeroom'], ['attendance'], ['duty_manager'], ['student'], ['parent']]) {
    for (const fn of assignFns) { const { s, out } = run(roles, fn); assert.ok(out && /권한이 없습니다/.test(out.message), roles + ' 배정'); assert.deepStrictEqual(s.writes, []); assert.strictEqual(s.denied[0], 'seat.edit'); }
  }
  for (const roles of [['hall_teacher'], ['homeroom'], ['attendance'], ['duty_manager'], ['student'], ['parent']]) {
    for (const fn of layoutFns) { const { s, out } = run(roles, fn); assert.ok(out && /권한이 없습니다/.test(out.message), roles + ' 격자'); assert.deepStrictEqual(s.writes, []); assert.strictEqual(s.denied[0], 'seat.layout'); }
  }
  for (const roles of [['student'], ['parent']]) assert.throws(() => makeServer('s@example.com', roles).c.getSeatData(TERM.id), /권한이 없습니다/);
  const ht = plain(makeServer('t@example.com', ['hall_teacher']).c.getSeatData(TERM.id));
  assert.deepStrictEqual([ht.canEdit, ht.canLayout], [true, false]);
  const hr = plain(makeServer('h@example.com', ['homeroom']).c.getSeatData(TERM.id));
  assert.deepStrictEqual([hr.canEdit, hr.canLayout], [false, false]);
  assert.deepStrictEqual([data(admin()).canEdit, data(admin()).canLayout], [true, true]);
  // 학사 교사는 실제로 배정할 수 있다
  const t = makeServer('t@example.com', ['hall_teacher']);
  const sa = data(t).spaces.find((sp) => sp.name === 'SA3실').cells.find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  assert.strictEqual(plain(t.c.assignSeat(TERM.id, sa.id, s1.lateEntrantId, tokOf(data(t), sa.id))).ok, true);
});

test('saveSpace: 입력 검사, 새 공간은 마지막 순서, 크기를 줄일 때 밖에 칸이 있으면 거부', () => {
  const s = admin();
  const err = (o) => plain(s.c.saveSpace(o)).errors.map((e) => e.field);
  assert.deepStrictEqual(err({}), ['name', 'gender', 'rows', 'cols']);
  assert.deepStrictEqual(err({ name: '1층 자습실', gender: '혼성', rows: 3, cols: 3 }), ['name'], '같은 이름');
  assert.deepStrictEqual(err({ name: 'X', gender: '혼성', rows: 99, cols: 3 }), ['rows']);
  assert.deepStrictEqual(err({ name: 'X', gender: '혼성', rows: 2.5, cols: 3 }), ['rows']);
  assert.deepStrictEqual(s.writes, []);
  const r = plain(s.c.saveSpace({ name: 'SA7실', gender: '여', rows: 5, cols: 2 }));
  assert.strictEqual(r.ok, true);
  const created = s.db.spaces.find((x) => x.id === r.id);
  assert.strictEqual(created.sort_order, '8'); assert.strictEqual(created.status, '유효');
  const floor = s.db.spaces.find((x) => x.name === '1층 자습실');
  const shrink = plain(s.c.saveSpace({ id: floor.id, name: '1층 자습실', gender: '혼성', rows: 5, cols: 12 }));
  assert.strictEqual(shrink.ok, false); assert.ok(shrink.errors[0].message.includes('크기 밖'));
  assert.strictEqual(plain(s.c.saveSpace({ id: floor.id, name: '1층 자습실(새)', gender: '혼성', rows: 20, cols: 12 })).ok, true);
});


test('saveSpaceGrid: 같은 모양으로 다시 저장하면 바뀐 것 0건, 빈 좌석은 없앨 수 있고 번호(SA실 순번)가 다시 매겨진다, 앉은 좌석은 거부', () => {
  const s = admin();
  const d = data(s);
  const sp = d.spaces.find((x) => x.name === 'SA3실');
  const same = gridOf(sp);
  assert.deepStrictEqual(plain(s.c.saveSpaceGrid(sp.id, same)), { ok: true, created: 0, updated: 0, cancelled: 0, relabelAssigned: 0, warnings: [] });
  const emptyS = sp.cells.filter((c) => c.kind === 'seat' && c.vacant && !c.hold)[0];
  const less = same.filter((c) => !(c.row === emptyS.row && c.col === emptyS.col));
  const r = plain(s.c.saveSpaceGrid(sp.id, less));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.cancelled, 1);
  assert.strictEqual(s.db.seats.find((x) => x.id === emptyS.id).status, '취소', '지우지 않고 취소');
  const labels = s.db.seats.filter((x) => x.space_id === sp.id && x.status === '유효' && x.kind === '좌석').map((x) => +x.label).sort((a, b) => a - b);
  assert.deepStrictEqual(labels, labels.map((_, i) => i + 1), 'SA실은 방 안 순번 1부터 빈틈없이');
  const floor = d.spaces[0];
  const seated = floor.cells.find((c) => c.studentId);
  const bad = plain(s.c.saveSpaceGrid(floor.id, gridOf(floor).filter((c) => !(c.row === seated.row && c.col === seated.col))));
  assert.strictEqual(bad.ok, false); assert.ok(bad.errors[0].includes(TRUE_MSG) && !bad.errors[0].includes('배정을 풀어'), bad.errors[0]);
});

test('1층은 줄-순번(3-7): 격자를 저장하면 같은 모양이라도 0건이고, 앞 칸을 비우면 뒤 번호가 당겨지며 "번호가 바뀌는 배정 좌석 N개"를 미리 알려 준다', () => {
  const s = admin();
  const d = data(s);
  const floor = d.spaces[0];
  assert.ok(floor.cells.some((c) => c.seatLabel === '3-7'));
  const same = plain(s.c.previewSpaceGrid(floor.id, gridOf(floor)));
  assert.deepStrictEqual([same.ok, same.created, same.updated, same.cancelled, same.relabelAssigned], [true, 0, 0, 0, 0]);
  // 앉은 학생이 둘 이상인 줄에서 앞 학생의 배정 기록을 없애 빈 좌석을 만든 뒤, 그 좌석을 창문으로 바꾸면 뒤 좌석의 번호가 하나씩 당겨진다
  const colSeats = (c) => floor.cells.filter((x) => x.col === c && x.kind === 'seat').sort((p, q) => p.row - q.row);
  const col = [...new Set(floor.cells.map((c) => c.col))].find((c) => colSeats(c).filter((x) => x.studentId).length >= 2);
  const front = colSeats(col).find((x) => x.studentId);
  s.db.seat_assignments = s.db.seat_assignments.filter((a) => a.seat_id !== front.id);   // 배정 기록이 전혀 없는 빈 좌석(배정을 풀어 행이 남은 자리는 이번 기간 기록이 있어 바꿀 수 없다)
  const floor2 = data(s).spaces[0];
  const colOf = (c) => floor2.cells.filter((x) => x.col === c.col && x.kind === 'seat').sort((p, q) => p.row - q.row);
  const head = floor2.cells.find((c) => c.id === front.id);
  assert.ok(head.vacant && !head.hold);
  s.writes.length = 0;
  const after = colOf(head).slice(colOf(head).indexOf(head) + 1);
  const want = gridOf(floor2).map((c) => (c.row === head.row && c.col === head.col ? { row: c.row, col: c.col, kind: '창문' } : c));
  const expectRelabel = after.filter((c) => c.studentId || c.hold).length;
  const pv = plain(s.c.previewSpaceGrid(floor.id, want));
  assert.strictEqual(pv.ok, true); assert.strictEqual(pv.relabelAssigned, expectRelabel); assert.ok(expectRelabel > 0); assert.strictEqual(s.writes.length, 0, '미리보기는 쓰지 않는다');
  const sv = plain(s.c.saveSpaceGrid(floor.id, want));
  assert.strictEqual(sv.relabelAssigned, expectRelabel);
  assert.strictEqual(s.db.seats.find((x) => x.id === after[0].id).label, head.seatLabel, '바로 뒤 좌석이 빠진 좌석의 번호를 이어받는다');
  const col1 = after;
  // 배정은 좌석 id로 이어지므로 앉은 학생은 그대로
  const sitter = col1.find((c) => c.studentId);
  assert.strictEqual(seatOfStudent(data(s), sitter.studentId).id, sitter.id);
});

test('격자 저장: 지난 기간 배정만 있는 좌석은 경고 후 허용, 지금 기간 배정이 있으면 거부(결정 37)', () => {
  const s = admin();
  const d = data(s);
  const sp = d.spaces.find((x) => x.name === 'SA3실');
  const old = s.db.terms.find((t) => t.end_date < '2027-03-20');
  assert.ok(old, '가짜 데이터에 끝난 기간이 있다');
  const seat = sp.cells.find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  s.db.seat_assignments.push({ id: 'past1', term_id: old.id, seat_id: seat.id, student_id: s1.leaverId, status: '배정', valid_from: '', valid_to: '' });
  const want = gridOf(sp).filter((c) => !(c.row === seat.row && c.col === seat.col));
  const pv = plain(s.c.previewSpaceGrid(sp.id, want));
  assert.strictEqual(pv.ok, true); assert.ok(pv.warnings.length === 1 && pv.warnings[0].includes('지난 기간'));
  assert.strictEqual(plain(s.c.saveSpaceGrid(sp.id, want)).ok, true);
  // 지금 기간 배정이 있는 좌석은 거부
  const seated = d.spaces[0].cells.find((c) => c.studentId);
  const bad = plain(s.c.previewSpaceGrid(d.spaces[0].id, gridOf(d.spaces[0]).filter((c) => !(c.row === seated.row && c.col === seated.col))));
  assert.strictEqual(bad.ok, false); assert.ok(bad.errors[0].includes(TRUE_MSG) && !bad.errors[0].includes('배정을 풀어'), bad.errors[0]);
  // 이번 기간에 어제까지 쓰인 자리(퇴실 자리를 재배정해 끝낸 행)는 지난 기간이 아니므로 경고가 아니라 거부(결정 37)
  const held = allCells(d).find((c) => c.reason === '퇴실');
  assert.strictEqual(asgn(s, held.id, s1.lateEntrantId).ok, true);
  const hsp = d.spaces.find((x) => x.cells.some((c) => c.id === held.id));
  const hr = s.db.seats.find((x) => x.id === held.id);
  const resp = plain(s.c.previewSpaceGrid(hsp.id, gridOf(hsp).filter((c) => !(c.row === +hr.row && c.col === +hr.col))));
  assert.strictEqual(resp.ok, false);
});

test('importSeatGrid: 좌석이 하나도 없는 같은 이름 공간(이전 가져오기가 도중에 멈춤)이 있으면 그 공간에 이어서 가져온다', () => {
  const s = admin();
  const text = '5/19\t공석\t공석\n6\t공석\t기둥';
  const half = plain(s.c.saveSpace({ name: 'SA7실', gender: '여', rows: 2, cols: 2 }));   // 공간만 있고 좌석 0개
  const spaces = s.db.spaces.length;
  const r = plain(s.c.importSeatGrid(text, { name: 'SA7실', gender: '여' }));
  assert.deepStrictEqual([r.ok, r.id, r.resumed, r.seats], [true, half.id, true, 3]);
  assert.strictEqual(s.db.spaces.length, spaces, '공간이 하나 더 생기지 않는다');
  assert.strictEqual(s.db.seats.filter((x) => x.space_id === half.id).length, 4);
  assert.strictEqual(plain(s.c.importSeatGrid(text, { name: 'SA7실', gender: '여' })).ok, false, '좌석이 있으면 같은 이름 거부');
  assert.strictEqual(plain(s.c.previewSeatGrid(text)).skippedHeads, 2);
});

test('importSeatGrid: 새 공간과 좌석을 만들고 이름은 버린다 / 오류·이름 중복은 쓰기 0건', () => {
  const s = admin();
  const text = '1. 김가온\t공석\t기둥\n공석\t\t창문';
  const p = plain(s.c.previewSeatGrid(text));
  assert.deepStrictEqual([p.ok, p.rows, p.cols, p.seatCount, p.namedCount], [true, 2, 3, 3, 1]);
  assert.strictEqual(s.writes.length, 0, '미리보기는 쓰지 않는다');
  const r = plain(s.c.importSeatGrid(text, { name: 'SA7실', gender: '여' }));
  assert.deepStrictEqual([r.ok, r.seats, r.ignoredNames], [true, 3, 1]);
  const sp = s.db.spaces.find((x) => x.name === 'SA7실');
  const seats = s.db.seats.filter((x) => x.space_id === sp.id);
  assert.deepStrictEqual(seats.map((x) => x.kind + ':' + x.label), ['좌석:1', '좌석:2', '기둥:', '좌석:3', '창문:']);
  assert.ok(!JSON.stringify(seats).includes('김가온'), '이름은 저장하지 않는다');
  const w = s.writes.length;
  assert.strictEqual(plain(s.c.importSeatGrid('공석\t아무말', { name: 'SA8실', gender: '여' })).ok, false);
  assert.strictEqual(plain(s.c.importSeatGrid(text, { name: 'SA7실', gender: '여' })).ok, false, '이름 중복');
  assert.strictEqual(plain(s.c.importSeatGrid(text, { name: 'SA9실', gender: '??' })).ok, false);
  assert.strictEqual(s.writes.length, w);
});

test('화면 라우팅: seats 화면은 교사 역할만 열 수 있다', () => {
  const r = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/Code.gs']);
  for (const role of ['admin', 'hall_teacher', 'attendance', 'homeroom', 'duty_manager']) assert.strictEqual(plain(r.screenResolve_('seats', [role])).ok, true, role);
  for (const role of ['student', 'parent']) assert.strictEqual(plain(r.screenResolve_('seats', [role])).ok, false, role);
});
