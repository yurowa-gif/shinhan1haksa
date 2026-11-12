/** R14 SeatRules — 좌석 초안(seatDraft_)·위반(seatViolations_). 가짜 학생만, 좌석은 src/dev/FakeSeats.gs의 가짜 배치. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/SeatRules.gs', 'src/dev/FakeSeats.gs']);

// 작은 공간: name·gender, 칸 목록 'r,c[,kind]'
const SP = (id, name, gender) => ({ id, name, gender, status: '유효' });
const SEATS = (spaceId, cells) => cells.map((c) => {
  const [r, col, kind] = c.split(',');
  return { id: spaceId + '-' + r + '-' + col, space_id: spaceId, row: r, col, kind: kind || '좌석', status: '유효' };
});
const STU = (id, gender, grade, veritas) => ({ id, gender, grade: String(grade), veritas: veritas ? 'TRUE' : 'FALSE' });
const draft = (spaces, seats, students, prev, fixed, avoids, seed) => plain(ctx.seatDraft_(spaces, seats, students, prev || [], fixed || [], avoids || [], seed === undefined ? 's1' : seed));
const seatOf = (r, pid) => (r.assignments.find((a) => a.student_id === pid) || {}).seat_id;

test('성별 구역: 남·여 공간에는 같은 성별만, 혼성은 누구나 — 자리가 없으면 unplaced + 경고', () => {
  const spaces = [SP('M', '남 자습실', '남'), SP('F', '여 자습실', '여')];
  const seats = SEATS('M', ['1,1']).concat(SEATS('F', ['1,1']));
  const r = draft(spaces, seats, [STU('a', '여', 1), STU('b', '남', 1), STU('c', '여', 2)]);
  assert.deepStrictEqual([seatOf(r, 'a') || seatOf(r, 'c'), seatOf(r, 'b')].map((s) => s && s[0]), ['F', 'M']);
  assert.strictEqual(r.unplaced.length, 1);
  assert.ok(r.warnings.some((w) => /앉을 자리가 없습니다/.test(w)));
  assert.deepStrictEqual(r.violations, []);
});

test('베리타스 = 같은 성별 SA실, 모자라면 1층으로 넘기고 경고 / 베리타스 아닌 학생은 SA실에 앉히지 않는다', () => {
  const spaces = [SP('F1', '1층 자습실', '혼성'), SP('SA3', 'SA3실', '여'), SP('SA1', 'SA1실', '남')];
  const seats = SEATS('F1', ['1,1', '1,3', '1,5', '1,7']).concat(SEATS('SA3', ['1,1']), SEATS('SA1', ['1,1']));
  const r = draft(spaces, seats, [STU('v1', '여', 1, true), STU('v2', '여', 2, true), STU('m', '남', 1, true), STU('n', '여', 3)]);
  assert.strictEqual(seatOf(r, 'm'), 'SA1-1-1');
  assert.ok(['v1', 'v2'].some((p) => seatOf(r, p) === 'SA3-1-1'));
  assert.ok(['v1', 'v2'].some((p) => /^F1/.test(seatOf(r, p))));
  assert.ok(/^F1/.test(seatOf(r, 'n')));
  assert.strictEqual(r.warnings.filter((w) => /SA실 자리가 모자라 1층/.test(w)).length, 1);
});

test('3학년은 지난 기간 자리 유지(비어 있고 성별·구역이 맞을 때), 고정 자리가 우선, 3학년 아니면 유지하지 않음', () => {
  const spaces = [SP('F1', '1층 자습실', '혼성'), SP('SA1', 'SA1실', '남')];
  const seats = SEATS('F1', ['1,1', '1,3', '1,5', '1,7', '1,9']).concat(SEATS('SA1', ['1,1']));
  const st = [STU('t3', '남', 3), STU('u3', '여', 3), STU('w2', '남', 2), STU('x3', '남', 3), STU('y3', '남', 3, true)];
  const prev = [{ seat_id: 'F1-1-9', student_id: 't3' }, { seat_id: 'F1-1-5', student_id: 'u3' }, { seat_id: 'F1-1-7', student_id: 'w2' },
    { seat_id: 'F1-1-3', student_id: 'x3' }, { seat_id: 'F1-1-1', student_id: 'y3' }];
  const fixed = [{ seat_id: 'F1-1-5', student_id: 'w2' }];
  for (const seed of ['a', 'b', 'c']) {
    const r = draft(spaces, seats, st, prev, fixed, [], seed);
    assert.deepStrictEqual([seatOf(r, 't3'), seatOf(r, 'x3'), seatOf(r, 'w2')], ['F1-1-9', 'F1-1-3', 'F1-1-5'], seed);
    assert.notStrictEqual(seatOf(r, 'u3'), 'F1-1-5');   // 고정이 먼저
    assert.strictEqual(seatOf(r, 'y3'), 'SA1-1-1');      // 베리타스가 된 3학년은 1층 지난 자리를 유지하지 않음(가정)
  }
});

test('이웃(좌우·앞뒤)에 같은 학년·떨어뜨릴 짝을 두지 않는다 — 1×3에 1·1·2학년이면 가운데 2학년, 짝은 떨어뜨림', () => {
  const spaces = [SP('R', '1층 자습실', '혼성')];
  const seats = SEATS('R', ['1,1', '1,2', '1,3']);
  for (const seed of ['a', 'b', 'c', 'd']) {
    const r = draft(spaces, seats, [STU('a', '여', 1), STU('b', '남', 1), STU('c', '여', 2)], [], [], [], seed);
    assert.deepStrictEqual([seatOf(r, 'c'), r.violations], ['R-1-2', []], seed);
    const p = draft(spaces, seats, [STU('a', '여', 1), STU('b', '남', 2), STU('c', '여', 3)], [], [],
      [{ student_a: 'a', student_b: 'b', scope: '좌석', status: '유효' }], seed);
    assert.deepStrictEqual([seatOf(p, 'c'), p.violations], ['R-1-2', []], seed);
  }
});

test('기둥·창문 칸을 사이에 두면 이웃 아님, 방 짝(scope 방)·취소된 짝은 좌석에 쓰지 않음', () => {
  const spaces = [SP('R', '1층 자습실', '혼성')];
  const seats = SEATS('R', ['1,1', '1,2,기둥', '1,3']);
  const st = [STU('a', '여', 1), STU('b', '여', 1)];
  assert.deepStrictEqual(draft(spaces, seats, st).violations, []);
  const two = SEATS('R', ['1,1', '1,2']);
  const st2 = [STU('a', '여', 1), STU('b', '여', 2)];
  assert.deepStrictEqual(draft(spaces, two, st2, [], [], [{ student_a: 'a', student_b: 'b', scope: '방', status: '유효' }]).violations, []);
  assert.deepStrictEqual(draft(spaces, two, st2, [], [], [{ student_a: 'a', student_b: 'b', scope: '둘 다', status: '취소' }]).violations, []);
  assert.strictEqual(draft(spaces, two, st2, [], [], [{ student_a: 'a', student_b: 'b', scope: '둘 다', status: '유효' }]).violations.length, 2);
});

test('다 못 지키면 덜 어긴 배치와 위반 목록(두 칸 모두에 한 줄) — 1×2에 같은 학년 둘', () => {
  const spaces = [SP('R', '1층 자습실', '혼성')];
  const r = draft(spaces, SEATS('R', ['1,1', '1,2']), [STU('a', '여', 1), STU('b', '남', 1)]);
  assert.deepStrictEqual(r.violations, [{ seatId: 'R-1-1', kind: '같은 학년', with: 'R-1-2' }, { seatId: 'R-1-2', kind: '같은 학년', with: 'R-1-1' }]);
  // 2×3에 1학년 3·2학년 3: 체스판처럼 놓으면 위반 0
  const g = draft(spaces, SEATS('R', ['1,1', '1,2', '1,3', '2,1', '2,2', '2,3']),
    ['a', 'b', 'c'].map((p) => STU(p, '여', 1)).concat(['d', 'e', 'f'].map((p) => STU(p, '남', 2))));
  assert.deepStrictEqual(g.violations, []);
});

test('같은 입력 + 같은 seed = 같은 결과(입력 순서와 무관), seed가 다르면 배치가 바뀔 수 있다', () => {
  const spaces = [SP('R', '1층 자습실', '혼성')];
  const seats = SEATS('R', ['1,1', '1,2', '1,3', '2,1', '2,2', '2,3', '3,1', '3,2', '3,3']);
  const st = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((p, i) => STU(p, i % 2 ? '남' : '여', 1 + (i % 3)));
  const one = draft(spaces, seats, st, [], [], [], 'x');
  assert.deepStrictEqual(draft(spaces, seats.slice().reverse(), st.slice().reverse(), [], [], [], 'x'), one);
  const seeds = ['x', 'y', 'z', 'w', 'v'].map((s) => JSON.stringify(draft(spaces, seats, st, [], [], [], s).assignments));
  assert.ok(new Set(seeds).size > 1);
});

test('seatViolations_: 성별 위반(with 빈칸), 짝 위반은 kind와 상대 칸 id만, 좌석 아닌 칸·없는 학생의 배정은 건너뜀', () => {
  const spaces = [SP('M', 'SA1실', '남')];
  const seats = SEATS('M', ['1,1', '1,2', '1,3,창문']);
  const st = [STU('a', '여', 1), STU('b', '남', 2)];
  const v = plain(ctx.seatViolations_(spaces, seats, st, [{ seat_id: 'M-1-1', student_id: 'a' }, { seat_id: 'M-1-2', student_id: 'b' },
    { seat_id: 'M-1-3', student_id: 'b' }, { seat_id: 'M-1-2', student_id: 'zz' }], [{ student_a: 'b', student_b: 'a', scope: '좌석', status: '유효' }]));
  assert.deepStrictEqual(v, [{ seatId: 'M-1-1', kind: '성별', with: '' }, { seatId: 'M-1-1', kind: '떨어뜨릴 짝', with: 'M-1-2' },
    { seatId: 'M-1-2', kind: '떨어뜨릴 짝', with: 'M-1-1' }]);
});

// 가짜 배치(1층 146석 + SA 51석)를 시트 행 모양으로
function fakeLayout() {
  const l = plain(ctx.buildFakeSeatLayout_());
  return {
    spaces: l.spaces.map((s) => ({ id: s.key, name: s.name, gender: s.gender, status: '유효' })),
    seats: l.seats.map((t) => ({ id: t.spaceKey + '-' + t.row + '-' + t.col, space_id: t.spaceKey, row: t.row, col: t.col, kind: t.kind, status: '유효' }))
  };
}
function fakeStudents(n) {
  // 베리타스: 남 15·여 30(SA 51석 안), 나머지 학년 1·2·3 고르게, 성별 반반
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = i % 2 ? '남' : '여';
    const ver = i < 45 * n / 180 && ((g === '남' && out.filter((s) => s.gender === '남' && s.veritas === 'TRUE').length < 15 * n / 180) ||
      (g === '여' && out.filter((s) => s.gender === '여' && s.veritas === 'TRUE').length < 30 * n / 180));
    out.push(STU('p' + String(i).padStart(3, '0'), g, 1 + (i % 3), ver));
  }
  return out;
}

for (const n of [30, 180]) {
  test('성능·전체: 가짜 1층 146석 + SA 51석에 ' + n + '명 — 3초 안, 모두 앉고 성별 위반 없음, SA실에는 베리타스만', () => {
    const { spaces, seats } = fakeLayout();
    const st = fakeStudents(n);
    const prev = st.filter((s) => s.grade === '3' && s.veritas === 'FALSE').slice(0, 8).map((s, k) => ({ seat_id: '1F-' + (2 * k + 1) + '-1', student_id: s.id }));   // 서로 이웃이 아닌 지난 자리
    const t0 = Date.now();
    const r = draft(spaces, seats, st, prev, [], [{ student_a: st[3].id, student_b: st[4].id, scope: '둘 다', status: '유효' }], 'perf');
    const ms = Date.now() - t0;
    assert.ok(ms < 3000, ms + 'ms');
    assert.deepStrictEqual([r.unplaced, r.assignments.length], [[], n]);
    assert.ok(!r.violations.some((v) => v.kind === '성별' || v.kind === '떨어뜨릴 짝'), JSON.stringify(r.violations));
    const ver = new Set(st.filter((s) => s.veritas === 'TRUE').map((s) => s.id));
    assert.ok(r.assignments.every((a) => /^SA/.test(a.seat_id) === ver.has(a.student_id)));
    prev.forEach((p) => assert.strictEqual(seatOf(r, p.student_id), p.seat_id));
    assert.deepStrictEqual(r.violations, []);   // 가짜 명단(학년 고르게)이면 위반 없이 놓인다
    console.log('    (' + n + '명: ' + ms + 'ms, 같은 학년 이웃 위반 ' + r.violations.length / 2 + '쌍)');
  });
}

test('지난 자리 유지는 3학년만(2학년은 seed에 따라 다른 자리도), 없는 좌석의 고정은 경고하고 새로 배정', () => {
  const spaces = [SP('R', '1층 자습실', '혼성')];
  const seats = SEATS('R', ['1,1', '1,3']);
  const places = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => seatOf(draft(spaces, seats, [STU('z2', '남', 2)], [{ seat_id: 'R-1-1', student_id: 'z2' }], [], [], seed), 'z2')));
  assert.deepStrictEqual([...places].sort(), ['R-1-1', 'R-1-3']);
  const r = draft(spaces, seats, [STU('a', '여', 1)], [], [{ seat_id: 'nope', student_id: 'a' }]);
  assert.ok(/^R-/.test(seatOf(r, 'a')) && r.warnings.some((w) => /고정 자리\(nope\)를 쓸 수 없어/.test(w)), JSON.stringify(r));
});
