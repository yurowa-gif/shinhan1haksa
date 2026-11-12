/** C22 좌석 초안 만들기: R4 gas-fakes(실제 Auth·Db·락·audit 경로). 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com';
const HOMEROOM = 'test.homeroom@example.com', ATT = 'test.attendance@example.com', DUTY = 'test.duty@example.com';
const NO_EDIT = [HOMEROOM, ATT, DUTY, 'test.student@example.com', 'test.parent@example.com', 'nobody@example.com'];
const NO_AVOID = [HOMEROOM, ATT, DUTY];

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-20T20:00:00' });
  env.seedFake({ stage1: true });
  return env;
}
const get = (env, who) => plain(env.call(who || HALL, 'getSeatData'));
const cellsOf = (d) => d.spaces.flatMap((s) => s.cells);
const preview = (env, d, fixed, seed, who) => plain(env.call(who || HALL, 'previewSeatDraft', d.term.id, fixed || [], seed === undefined ? 7 : seed));
const save = (env, d, p, who) => plain(env.call(who || HALL, 'saveSeatDraft', d.term.id, { seed: p.seed, sig: p.sig, base: p.base, fixed: p.fixed }));
const rows = (env) => env.rows('seat_assignments');
const holderMap = (d) => Object.fromEntries(cellsOf(d).filter((c) => c.studentId).map((c) => [c.id, c.studentId]));
const strip = (d) => JSON.stringify(d).replace(/"token":"[^"]*"/g, '');

test('권한: 관리자·학사 교사 허용, 담임·출결·근무표·학생·학부모·계정 없음은 denied:seat.edit(쓰기 없음)', () => {
  const env = makeEnv();
  const d = get(env);
  const p = preview(env, d);
  const before = JSON.stringify(rows(env));
  NO_EDIT.forEach((w) => {
    env.expectDenied(w, 'seat.edit', 'previewSeatDraft', d.term.id, [], 7);
    env.expectDenied(w, 'seat.edit', 'saveSeatDraft', d.term.id, { seed: p.seed, sig: p.sig, base: p.base, fixed: p.fixed });
  });
  assert.strictEqual(JSON.stringify(rows(env)), before);
  assert.strictEqual(env.expectAllowed(ADMIN, 'previewSeatDraft', d.term.id, [], 7).ok, true);
  assert.strictEqual(env.expectAllowed(HALL, 'saveSeatDraft', d.term.id, { seed: p.seed, sig: p.sig, base: p.base, fixed: p.fixed }).ok, true);
});

test('미리보기는 아무것도 쓰지 않는다: 같은 seed는 같은 결과, 숫자·경고·칸 모양', () => {
  const env = makeEnv();
  const d = get(env);
  const before = JSON.stringify(rows(env)), audit = env.rows('audit_log').length;
  const a = preview(env, d, [], 11), b = preview(env, d, [], 11), c = preview(env, d, [], 12);
  assert.strictEqual(a.ok, true);
  assert.deepStrictEqual([a.sig, a.changed, a.violationCount], [b.sig, b.changed, b.violationCount]);
  assert.notStrictEqual(a.sig, c.sig);
  assert.strictEqual(JSON.stringify(rows(env)), before);
  assert.strictEqual(env.rows('audit_log').length, audit, '읽기만 하므로 audit 없음');
  assert.ok(a.changed > 0 && Array.isArray(a.warnings) && Array.isArray(a.unplaced) && a.spaces.length === d.spaces.length);
  const seated = cellsOf({ spaces: a.spaces }).filter((x) => x.text).length;
  assert.strictEqual(seated, d.spaces.flatMap((s) => s.cells).filter((x) => x.studentId).length + d.unseatedCount, '앉은 학생 + 미배정 = 초안 인원');
  assert.ok(!JSON.stringify(a).includes('@'), '이메일 없음');
});

test('저장: 초안 그대로 반영(모든 학생 한 자리, 지난 날 좌석표는 그대로), 바뀌지 않은 자리는 건드리지 않는다', () => {
  const env = makeEnv();
  const d = get(env);
  const pastBefore = plain(env.asOwner((c) => c.sheetModelFor_('2027-03-19'))).model;
  const keepRow = rows(env).find((r) => r.status !== '취소');
  const p = preview(env, d);
  const r = save(env, d, p);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.noop, false);
  const after = get(env);
  const draftText = Object.fromEntries(cellsOf({ spaces: p.spaces }).filter((c) => c.text).map((c) => [c.id, c.text]));
  const nowText = Object.fromEntries(cellsOf(after).filter((c) => c.text).map((c) => [c.id, c.text]));
  assert.deepStrictEqual(nowText, draftText, '저장 뒤 좌석표가 미리보기와 같다');
  const ids = Object.values(holderMap(after));
  assert.strictEqual(new Set(ids).size, ids.length, '한 학생이 두 자리에 없다');
  assert.strictEqual(after.unseatedCount, 0);
  // 지난 날(3/19) 좌석표는 그대로, 오늘(3/20)은 새 배정
  const pastAfter = plain(env.asOwner((c) => c.sheetModelFor_('2027-03-19'))).model;
  assert.strictEqual(JSON.stringify(pastAfter.spaces), JSON.stringify(pastBefore.spaces));
  const today = plain(env.asOwner((c) => c.sheetModelFor_('2027-03-20'))).model;
  assert.ok(today.spaces.some((s) => s.cells.some((c) => c.occupant)));
  // 옛 행은 지우지 않고 기준일 전날로 끝낸다(valid_to) 또는 기준일 이후 시작이면 취소
  const old = rows(env).find((x) => x.id === keepRow.id);
  assert.ok(old.valid_to === '2027-03-19' || old.status === '취소' || old.valid_to === keepRow.valid_to, JSON.stringify([old.valid_to, old.status]));
  assert.ok(env.rows('audit_log').some((a) => a.sheet === 'seat_assignments'), '좌석 배정 변경은 audit에 남는다');
});

test('두 번 저장해도 한 벌: 두 번째는 noop, 행 수·좌석표 그대로', () => {
  const env = makeEnv();
  const d = get(env);
  const p = preview(env, d);
  assert.strictEqual(save(env, d, p).ok, true);
  const n = rows(env).length, snap = strip(get(env));
  const again = save(env, d, p);
  assert.deepStrictEqual([again.ok, again.noop], [true, true]);
  assert.strictEqual(rows(env).length, n);
  assert.strictEqual(strip(get(env)), snap);
  // 저장 뒤 같은 입력으로 미리보기를 다시 해도 바뀌는 자리는 0
  const p2 = preview(env, get(env), p.fixed, p.seed);
  assert.strictEqual(p2.changed, 0);
});

test('미리보기 뒤 명단이 바뀌면(퇴실) 저장은 거부하고 쓰지 않는다(stale)', () => {
  const env = makeEnv();
  const d = get(env);
  const p = preview(env, d);
  const stu = Object.values(holderMap(d))[0];
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: stu, item: '학사', value: '퇴실', requested_at: '2027-03-20T10:00:00', effective_date: '2027-03-20', effective_date_auto: 'FALSE', reason: '시험', doc_submitted: 'TRUE', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  const before = JSON.stringify(rows(env));
  const r = save(env, d, p);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(JSON.stringify(rows(env)), before);
});

test('미리보기 뒤 다른 선생님이 좌석을 바꾸면 저장은 거부(base)', () => {
  const env = makeEnv();
  const d = get(env);
  const p = preview(env, d);
  const [a, b] = cellsOf(d).filter((c) => c.studentId).slice(0, 2);
  const tok = (c) => ({ [c.id]: c.token });
  assert.strictEqual(env.call(ADMIN, 'swapSeats', d.term.id, a.id, b.id, Object.assign({}, tok(a), tok(b))).ok, true);
  const before = JSON.stringify(rows(env));
  const r = save(env, d, p);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.stale, true);
  assert.strictEqual(JSON.stringify(rows(env)), before);
});

test('입력 검사: seed·draft 모양이 틀리면 오류(쓰기 없음), 고정 자리는 지금 앉은 학생 그대로 둔다', () => {
  const env = makeEnv();
  const d = get(env);
  const before = JSON.stringify(rows(env));
  ['x', 0, -3, 1.5, 3000000000].forEach((s) => assert.strictEqual(plain(env.call(HALL, 'previewSeatDraft', d.term.id, [], s)).ok, false));
  assert.strictEqual(plain(env.call(HALL, 'previewSeatDraft', d.term.id, 'abc', 7)).ok, false);
  [null, 'x', {}, { seed: 5, sig: 1, base: 'a' }].forEach((x) => assert.strictEqual(plain(env.call(HALL, 'saveSeatDraft', d.term.id, x)).ok, false));
  assert.strictEqual(JSON.stringify(rows(env)), before);
  const pins = cellsOf(d).filter((c) => c.studentId).slice(0, 5);
  const p = preview(env, d, pins.map((c) => c.id), 21);
  assert.strictEqual(p.fixed.length, 5);
  pins.forEach((c) => assert.strictEqual(cellsOf({ spaces: p.spaces }).find((x) => x.id === c.id).text, c.text, '고정 자리는 그대로'));
  assert.ok(cellsOf({ spaces: p.spaces }).filter((x) => x.pinned).length === 5);
  assert.strictEqual(save(env, d, p).ok, true);
  const after = get(env);
  pins.forEach((c) => assert.strictEqual(cellsOf(after).find((x) => x.id === c.id).studentId, c.studentId));
  // 빈 자리나 없는 자리를 고정하겠다고 해도 무시
  const empty = cellsOf(d).find((c) => c.kind === 'seat' && c.vacant);
  assert.strictEqual(preview(env, d, [empty.id, 'nope'], 3).fixed.length, 0);
});

test('끝난 기간은 초안도 저장도 거부', () => {
  const env = makeEnv();
  const d = get(env);
  const old = env.rows('terms').find((t) => t.name.indexOf('2026') === 0);
  assert.strictEqual(plain(env.call(HALL, 'previewSeatDraft', old.id, [], 7)).ok, false);
  assert.strictEqual(plain(env.call(HALL, 'saveSeatDraft', old.id, { seed: 7, sig: 'a', base: 'b', fixed: [] })).ok, false);
});

test('짝(결정 64): 학사 교사·관리자는 짝 위반(with·withText)을 보고, 담임·출결·근무표는 항목도 빨간 칸도 응답에도 없다', () => {
  const env = makeEnv();
  let d = get(env);
  // 이웃한 두 자리에 앉은 학생(학년이 다른 쌍)을 찾는다
  const cells = cellsOf(d);
  const at = {};
  d.spaces.forEach((sp) => sp.cells.forEach((c) => { if (c.studentId) at[sp.id + ':' + c.row + ':' + c.col] = Object.assign({ sp: sp.id }, c); }));
  const stu = (x) => env.rows('students').find((s) => s.id === x.studentId);
  let pair = null;
  Object.values(at).some((c) => {
    const o = at[c.sp + ':' + c.row + ':' + (c.col + 1)];
    if (o && stu(o).grade !== stu(c).grade) { pair = [c, o]; return true; }
    return false;
  });
  assert.ok(pair, '이웃한 서로 다른 학년 학생 쌍');
  const base = Object.fromEntries(NO_AVOID.map((w) => [w, strip(get(env, w))]));
  assert.strictEqual(plain(env.call(HALL, 'saveAvoidPair', { studentA: pair[0].studentId, studentB: pair[1].studentId, scope: '좌석', reason: '비밀사유ZZ' })).ok, true);
  // 담임·출결·근무표: 짝을 만들기 전과 응답이 같다(빨간 칸·위반 목록·글자 모두)
  NO_AVOID.forEach((w) => assert.strictEqual(strip(get(env, w)), base[w], w));
  NO_AVOID.forEach((w) => { const t = strip(get(env, w)); assert.ok(!/떨어뜨릴|비밀사유|avoid/.test(t), w); });
  // 학사 교사·관리자: 두 칸 모두에 한 줄씩, with와 상대 이름
  [HALL, ADMIN].forEach((w) => {
    const dv = get(env, w);
    const v = dv.violations.filter((x) => x.kind === '떨어뜨릴 짝');
    assert.strictEqual(v.length, 2, w);
    const mine = v.find((x) => x.seatId === pair[0].id);
    assert.strictEqual(mine.with, pair[1].id);
    assert.strictEqual(mine.withText, pair[1].text);
    assert.ok(cellsOf(dv).find((c) => c.id === pair[0].id).bad && cellsOf(dv).find((c) => c.id === pair[1].id).bad);
    assert.ok(!/비밀사유/.test(JSON.stringify(dv)), '사유는 좌석 응답에 없다');
  });
  // 취소하면 위반이 사라진다
  const pid = env.rows('avoid_pairs')[0].id;
  assert.strictEqual(env.call(HALL, 'cancelAvoidPair', pid).ok, true);
  assert.strictEqual(get(env).violations.filter((x) => x.kind === '떨어뜨릴 짝').length, 0);
  void cells; void d;
});

test('초안 미리보기: 고정한 이웃 둘에 짝이 있으면 위반으로 나오고(학사 교사), 저장 뒤 좌석표가 같은 위반을 보인다', () => {
  const env = makeEnv();
  const d = get(env);
  const at = {};
  d.spaces.forEach((sp) => sp.cells.forEach((c) => { if (c.studentId) at[sp.id + ':' + c.row + ':' + c.col] = Object.assign({ sp: sp.id }, c); }));
  const pair = Object.values(at).map((c) => [c, at[c.sp + ':' + c.row + ':' + (c.col + 1)]]).find((x) => x[1]);
  assert.ok(pair);
  env.call(HALL, 'saveAvoidPair', { studentA: pair[0].studentId, studentB: pair[1].studentId, scope: '둘 다', reason: '' });
  const p = preview(env, d, [pair[0].id, pair[1].id], 9);
  const v = p.violations.filter((x) => x.kind === '떨어뜨릴 짝');
  assert.deepStrictEqual(v.map((x) => x.seatId).sort(), [pair[0].id, pair[1].id].sort());
  assert.strictEqual(p.violationCount, p.violations.length);
  assert.strictEqual(save(env, d, p).ok, true);
  assert.strictEqual(get(env).violations.filter((x) => x.kind === '떨어뜨릴 짝').length, 2);
});

test('지난 기간(2026 2학기) 3학년 자리는 이번 초안에서 이어진다(prev: 학생마다 한 줄, 지난 기간 마지막 날 배정)', () => {
  const env = makeEnv();
  const d = get(env);
  const old = env.rows('terms').find((t) => t.name.indexOf('2026') === 0);
  const students = env.rows('students');
  const enr = env.rows('enrollments').filter((e) => e.term_id === d.term.id);
  // 이번 기간 3학년·비베리타스 학생 한 명과, 1층 혼성 공간의 빈 좌석 하나
  const target = enr.map((e) => ({ e, s: students.find((s) => s.id === e.student_id) })).find((x) => x.s.grade === '3' && String(x.e.veritas).toUpperCase() !== 'TRUE');
  assert.ok(target, '3학년 비베리타스 학생');
  const floor1 = d.spaces.find((s) => s.gender === '혼성');
  const seat = floor1.cells.filter((c) => c.kind === 'seat')[100];
  env.asOwner((c) => c.appendRecord_('seat_assignments', { term_id: old.id, seat_id: seat.id, student_id: target.s.id, valid_from: '', valid_to: '', status: '배정', memo: '' }, ADMIN));
  // 같은 학생의 더 일찍 끝난 지난 행(마지막 날이 아님)은 쓰지 않는다
  const other = floor1.cells.filter((c) => c.kind === 'seat')[101];
  env.asOwner((c) => c.appendRecord_('seat_assignments', { term_id: old.id, seat_id: other.id, student_id: target.s.id, valid_from: '', valid_to: '2026-10-01', status: '배정', memo: '' }, ADMIN));
  const p = preview(env, d, [], 5);
  const cell = cellsOf({ spaces: p.spaces }).find((c) => c.id === seat.id);
  assert.strictEqual(cell.text, target.s.grade + '. ' + target.s.name);
});

test('성능: 가짜 29명 + 좌석 280석에서 미리보기가 3초 안', () => {
  const env = makeEnv();
  const d = get(env);
  const t0 = Date.now();
  const p = preview(env, d);
  assert.ok(Date.now() - t0 < 3000);
  assert.strictEqual(save(env, d, p).ok, true);
});

test('방어 두 겹: 짝 시트는 avoid.view가 없으면 읽지도 않고, 응답 만드는 쪽도 짝 위반을 항목째 뺀다', () => {
  const env = makeEnv();
  const reads = (who) => {
    let n = 0;
    env.as(who, (c) => {
      const read = c.readAll_;
      c.readAll_ = (name, kind) => { if (name === 'avoid_pairs') n++; return read(name, kind); };
      c.getSeatData();
    });
    return n;
  };
  assert.ok(reads(HALL) >= 1);
  NO_AVOID.forEach((w) => assert.strictEqual(reads(w), 0, w + ' 는 짝 시트를 읽지 않는다'));
  // 응답 만드는 함수 자체도: canAvoid가 false면 짝 위반이 들어와도 뺀다
  const out = env.asOwner((c) => plain(c.sdrViolationsOut_({ d: { seats: [{ id: 's1', label: '1' }, { id: 's2', label: '2' }] }, byId: {} },
    [{ seatId: 's1', kind: '떨어뜨릴 짝', with: 's2' }, { seatId: 's1', kind: '같은 학년', with: 's2' }], {}, false)));
  assert.deepStrictEqual(out.map((v) => v.kind), ['같은 학년']);
});

test('날짜를 좁힌 배정(방학 날짜별 좌석표 등)이 있는 기간은 초안·저장 모두 거부하고 이유와 할 일을 알려 준다(쓰기 없음)', () => {
  const env = makeEnv();
  const d = get(env);
  const seat = cellsOf(d).find((c) => c.kind === 'seat' && c.vacant);
  const stu = Object.values(holderMap(d))[0];
  env.asOwner((c) => c.appendRecord_('seat_assignments', { term_id: d.term.id, seat_id: seat.id, student_id: stu, valid_from: '2027-03-25', valid_to: '2027-03-31', status: '배정', memo: '' }, ADMIN));
  const before = JSON.stringify(rows(env));
  const p = plain(env.call(HALL, 'previewSeatDraft', d.term.id, [], 7));
  assert.strictEqual(p.ok, false);
  assert.ok(/날짜를 좁혀 배정한 자리/.test(p.error) && /직접 맞바꿔/.test(p.error), p.error);
  const r = plain(env.call(HALL, 'saveSeatDraft', d.term.id, { seed: 7, sig: 'a', base: 'b', fixed: [] }));
  assert.strictEqual(r.ok, false);
  assert.ok(/날짜를 좁혀 배정한 자리/.test(r.error));
  assert.strictEqual(JSON.stringify(rows(env)), before);
});

test('입실 전(미입실) 학생이 먼저 받은 자리는 초안이 지우지 않는다: 미리보기에 그대로·경고, 저장해도 그 행은 그대로, 입실 뒤에도 그 자리', () => {
  const env = createGasEnv({ now: '2027-03-10T20:00:00' });
  env.seedFake({ stage1: true });
  const late = env.rows('status_changes').find((c) => c.item === '학사' && c.value === '입실' && c.effective_date === '2027-03-15');
  assert.ok(late, '3/15 입실 예정 학생');
  const d = get(env, ADMIN);
  const seat = cellsOf(d).find((c) => c.kind === 'seat' && c.vacant);
  assert.strictEqual(plain(env.call(ADMIN, 'assignSeat', d.term.id, seat.id, late.student_id, { [seat.id]: seat.token })).ok, true);
  const row = () => rows(env).find((r) => r.student_id === late.student_id && r.status !== '취소' && !r.valid_to);
  const first = row();
  assert.ok(first);
  const d2 = get(env, ADMIN);
  assert.strictEqual(cellsOf(d2).find((c) => c.id === seat.id).reason, '미입실');
  const p = preview(env, d2, [], 5, ADMIN);
  assert.strictEqual(p.ok, true);
  assert.ok(p.warnings.some((w) => /입실 전 학생 1명의 자리는 그대로 둡니다/.test(w)), JSON.stringify(p.warnings));
  const stu = env.rows('students').find((s) => s.id === late.student_id);
  assert.strictEqual(cellsOf({ spaces: p.spaces }).find((c) => c.id === seat.id).text, stu.grade + '. ' + stu.name);
  assert.ok(!p.unplaced.length);
  const r = save(env, d2, p, ADMIN);
  assert.strictEqual(r.ok, true);
  const after = row();
  assert.deepStrictEqual([after.id, after.seat_id, after.valid_to, after.status], [first.id, seat.id, '', '배정'], '그 행은 그대로');
  // 두 번째 미리보기는 바뀌는 자리 0(입실 전 학생의 자리도 바뀌는 것으로 세지 않는다)
  assert.strictEqual(preview(env, get(env, ADMIN), p.fixed, p.seed, ADMIN).changed, 0);
  // 입실한 뒤(3/16)에도 같은 자리
  env.setNow('2027-03-16T20:00:00');
  const d3 = get(env, ADMIN);
  assert.strictEqual(cellsOf(d3).find((c) => c.id === seat.id).studentId, late.student_id);
});

test('지난 기간 배정이 같은 학생에게 둘이면 seatMapOn_와 같은 규칙(날짜를 좁힌 쪽 먼저)으로 하나를 쓴다', () => {
  const env = makeEnv();
  const d = get(env);
  const old = env.rows('terms').find((t) => t.name.indexOf('2026') === 0);
  const students = env.rows('students');
  const enr = env.rows('enrollments').filter((e) => e.term_id === d.term.id);
  const target = enr.map((e) => ({ e, s: students.find((s) => s.id === e.student_id) })).find((x) => x.s.grade === '3' && String(x.e.veritas).toUpperCase() !== 'TRUE');
  const seats = d.spaces.find((s) => s.gender === '혼성').cells.filter((c) => c.kind === 'seat');
  const bounded = seats[110], plainSeat = seats[111];
  // 날짜를 좁힌 행(마지막 날까지)을 먼저, 기간 전체 행을 나중에 → 나중 행이 이기는 옛 방식이면 plainSeat가 나온다
  env.asOwner((c) => c.appendRecord_('seat_assignments', { term_id: old.id, seat_id: bounded.id, student_id: target.s.id, valid_from: '', valid_to: old.end_date, status: '배정', memo: '' }, ADMIN));
  env.asOwner((c) => c.appendRecord_('seat_assignments', { term_id: old.id, seat_id: plainSeat.id, student_id: target.s.id, valid_from: '', valid_to: '', status: '배정', memo: '' }, ADMIN));
  const p = preview(env, d, [], 5);
  assert.strictEqual(cellsOf({ spaces: p.spaces }).find((c) => c.id === bounded.id).text, target.s.grade + '. ' + target.s.name);
});
