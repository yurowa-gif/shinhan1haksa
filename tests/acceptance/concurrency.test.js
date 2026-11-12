/**
 * T4b 동시 저장: 두 교사가 거의 같은 때 저장할 때. 순서는 늘 같다 —
 * A가 화면을 읽고(token·expect를 받고) → B가 먼저 저장 → A가 옛 화면 값으로 저장.
 * 단언: 늦은 A는 옛 화면으로 덮어쓰지 못한다(거부·다시 확인), 행이 두 벌 생기지 않는다, B의 저장은 audit_log에 남고 A의 거부는 쓰기를 남기지 않는다.
 * gas-fakes strictLock(락 없이 쓰면 오류). 가짜 데이터만.
 * 근무 편성(saveDutyDay)·교대(swapDuty)는 T4b에서 찾은 덮어쓰기를 #139가 칸 token(expect)으로 고쳤다 — 아래 두 시험이 고정한다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HALL2 = 'fake.teacher1@example.com', ATT = 'test.attendance@example.com';
const TODAY = '2027-03-09';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = HALL;
  ['setup', 'seedFakeData', 'seedFakeStage1', 'seedFakeStage3'].forEach((f) => env.asOwner((c) => c[f]()));
  env.asOwner((c) => c.addUser(ATT, '시험 출결', 'attendance'));
  env.strictLock = true;
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const call = (who, fn, ...a) => plain(env.call(who, fn, ...a));
  const audit = () => env.rows('audit_log').filter((r) => !String(r.action).startsWith('denied')).length;
  /** B 저장 전·후, A 저장 후의 쓰기 기록 수 */
  const race = (bSave, aSave) => {
    const a0 = audit();
    const b = bSave();
    const a1 = audit();
    const a = aSave();
    return { b, a, bLogged: a1 > a0, aLogged: audit() > a1 };
  };
  const mine = env.rows('enrollments').filter((e) => e.term_id === term.id && e.teacher_email === HALL).map((e) => e.student_id);
  const busy = new Set(env.rows('status_changes').filter((c) => c.source !== '명단업로드').map((c) => c.student_id)
    .concat(env.rows('status_changes').filter((c) => c.item === '학사' && c.effective_date > term.start_date).map((c) => c.student_id)));
  const free = mine.filter((s) => !busy.has(s));
  return { env, term, call, race, free };
}
const stale = (r) => r.ok === false && (r.stale === true || /바뀌었|다시 불러|새로 고친|다시 만들어|먼저 바꿨/.test(JSON.stringify(r)));

test('좌석 초안: A 미리보기 → B 초안 저장 → A 저장은 stale(덮지 않음), 학생마다 살아 있는 배정 한 줄, B만 audit', () => {
  const x = seededEnv();
  const pa = x.call(HALL, 'previewSeatDraft', x.term.id, [], 7);
  const r = x.race(() => {
    const pb = x.call(HALL2, 'previewSeatDraft', x.term.id, [], 8);
    return x.call(HALL2, 'saveSeatDraft', x.term.id, { seed: pb.seed, sig: pb.sig, base: pb.base, fixed: pb.fixed });
  }, () => x.call(HALL, 'saveSeatDraft', x.term.id, { seed: pa.seed, sig: pa.sig, base: pa.base, fixed: pa.fixed }));
  assert.strictEqual(r.b.ok, true, JSON.stringify(r.b));
  assert.ok(stale(r.a), JSON.stringify(r.a));
  assert.deepStrictEqual([r.bLogged, r.aLogged], [true, false]);
  const live = x.env.rows('seat_assignments').filter((a) => a.term_id === x.term.id && a.status === '배정' && !(a.valid_to && a.valid_to < TODAY));
  assert.strictEqual(new Set(live.map((a) => a.student_id)).size, live.length, '학생마다 한 줄');
  assert.strictEqual(new Set(live.map((a) => a.seat_id)).size, live.length, '자리마다 한 명');
});

test('좌석 칸(맞바꾸기·배정): A가 본 token으로 B가 먼저 바꾼 칸을 다시 바꾸면 stale', () => {
  const x = seededEnv();
  const d = x.call(HALL, 'getSeatData', x.term.id);
  const cells = d.spaces.flatMap((s) => s.cells).filter((c) => c.kind === 'seat' && c.studentId);
  const [c1, c2, c3] = cells;
  const tok = (...cs) => Object.fromEntries(cs.map((c) => [c.id, c.token]));
  const n0 = x.env.rows('seat_assignments').length;
  const r = x.race(() => x.call(HALL2, 'swapSeats', x.term.id, c1.id, c2.id, tok(c1, c2)),
    () => x.call(HALL, 'swapSeats', x.term.id, c1.id, c3.id, tok(c1, c3)));
  assert.strictEqual(r.b.ok, true, JSON.stringify(r.b));
  assert.ok(stale(r.a), JSON.stringify(r.a));
  assert.deepStrictEqual([r.bLogged, r.aLogged], [true, false]);
  const n1 = x.env.rows('seat_assignments').length;
  assert.ok(n1 > n0, 'B만 썼다');
  const after = x.call(HALL, 'getSeatData', x.term.id).spaces.flatMap((s) => s.cells);
  assert.deepStrictEqual([after.find((c) => c.id === c1.id).studentId, after.find((c) => c.id === c2.id).studentId], [c2.studentId, c1.studentId], 'B의 맞바꾸기가 남는다');
});

test('방 배정: A 화면 token → B 초안 저장 → A 저장은 stale, 기숙사생마다 오늘 방 하나, B만 audit', () => {
  const x = seededEnv();
  const g = x.call(HALL, 'getRoomData', x.term.id);
  const pa = x.call(HALL, 'previewRoomDraft', x.term.id, 7);
  const r = x.race(() => {
    const pb = x.call(HALL2, 'previewRoomDraft', x.term.id, 11);
    return x.call(HALL2, 'saveRoomAssignments', x.term.id, pb.assignments, g.token);
  }, () => x.call(HALL, 'saveRoomAssignments', x.term.id, pa.assignments, g.token));
  assert.strictEqual(r.b.ok, true, JSON.stringify(r.b));
  assert.ok(stale(r.a), JSON.stringify(r.a));
  assert.strictEqual(r.aLogged, false);
  assert.strictEqual(r.bLogged, true);
  const live = x.env.rows('room_assignments').filter((a) => a.term_id === x.term.id && a.status === '배정' && !(a.valid_to && a.valid_to < TODAY) && !(a.valid_from && a.valid_from > TODAY));
  assert.strictEqual(new Set(live.map((a) => a.student_id)).size, live.length, '학생마다 오늘 방 하나');
});

test('특이사항: 같은 학생·날·칸을 두 교사가 차례로 저장하면 늦은 쪽은 다시 확인(겹침), 요청 확정은 한 번만', () => {
  const x = seededEnv();
  const sid = x.free[0];
  const input = { studentId: sid, from: '2027-03-10', to: '2027-03-10', blocks: 'ALL', type: '병결', reason: '가짜 사유' };
  const r = x.race(() => x.call(ATT, 'saveException', input), () => x.call(ADMIN, 'saveException', input));
  assert.strictEqual(r.b.ok, true, JSON.stringify(r.b));
  assert.deepStrictEqual([r.a.ok, r.a.needsConfirm], [false, true], JSON.stringify(r.a));
  assert.deepStrictEqual([r.bLogged, r.aLogged], [true, false]);
  const tab = 'exceptions_' + x.term.id.slice(0, 8);
  assert.strictEqual(x.env.rows(tab).filter((e) => e.student_id === sid && e.date === '2027-03-10' && e.status !== '취소').length, 1, '한 줄');
  // 담당교사가 보낸 요청을 출결 담당과 관리자가 거의 같이 확정
  const q = x.call(HALL, 'saveException', Object.assign({}, input, { studentId: x.free[1] }));
  assert.strictEqual(q.ok, true, JSON.stringify(q));
  const req = x.env.rows(tab).find((e) => e.student_id === x.free[1] && e.status === '요청');
  assert.ok(req, '담당교사 입력은 요청');
  const c = x.race(() => x.call(ATT, 'confirmException', x.term.id, req.group_id, true), () => x.call(ADMIN, 'confirmException', x.term.id, req.group_id, true));
  assert.strictEqual(c.b.ok, true, JSON.stringify(c.b));
  assert.deepStrictEqual([c.a.ok, /이미 처리/.test(c.a.error)], [false, true], JSON.stringify(c.a));
  assert.deepStrictEqual([c.bLogged, c.aLogged], [true, false]);
  const row = x.env.rows(tab).find((e) => e.id === req.id);
  assert.deepStrictEqual([row.status, row.confirmed_by], ['확정', ATT], '먼저 확정한 사람 그대로');
});

test('급식 변경: A 미리보기 → B가 같은 학생 급식을 먼저 저장 → A 저장은 stale, 신청서는 B 것 한 장', () => {
  const x = seededEnv();
  const sid = x.free[0];
  const ia = { studentId: sid, chip: 'd_gen', requestedAt: '2027-03-09T10:00:00', docSubmitted: false };
  const ib = { studentId: sid, chip: 'd_off', requestedAt: '2027-03-09T10:05:00', docSubmitted: false };
  const pa = x.call(HALL, 'previewMealChange', ia);
  const r = x.race(() => x.call(ADMIN, 'saveMealChange', ib, x.call(ADMIN, 'previewMealChange', ib).expect),
    () => x.call(HALL, 'saveMealChange', ia, pa.expect));
  assert.strictEqual(r.b.ok, true, JSON.stringify(r.b));
  assert.ok(stale(r.a), JSON.stringify(r.a));
  assert.deepStrictEqual([r.bLogged, r.aLogged], [true, false]);
  const heads = x.env.rows('status_changes').filter((c) => c.student_id === sid && c.source === 'F7' && c.linked_change_id === '');
  assert.deepStrictEqual(heads.map((c) => c.value), ['미실시'], 'B의 신청서 한 장');
});

test('입퇴실: A 미리보기 → B가 먼저 퇴실 저장 → A 저장은 거부, 퇴실 대표 행 한 줄. 퇴실 취소도 두 번째는 쓰지 않음(이미 취소)', () => {
  const x = seededEnv();
  const sid = x.free.find((s) => !x.env.rows('status_changes').some((c) => c.student_id === s && c.item === '기숙사'));
  const ia = { studentId: sid, type: '학사 퇴실', requestedAt: '2027-03-09T10:00:00', effectiveDate: '2027-03-12', dinner: '중단', docSubmitted: false };
  const ib = Object.assign({}, ia, { effectiveDate: '2027-03-11', requestedAt: '2027-03-09T10:05:00' });
  const pa = x.call(HALL, 'previewMove', ia);
  const r = x.race(() => x.call(ADMIN, 'saveMove', ib, x.call(ADMIN, 'previewMove', ib).expect), () => x.call(HALL, 'saveMove', ia, pa.expect));
  assert.strictEqual(r.b.ok, true, JSON.stringify(r.b));
  assert.strictEqual(r.a.ok, false, JSON.stringify(r.a));
  assert.deepStrictEqual([r.bLogged, r.aLogged], [true, false]);
  const heads = () => x.env.rows('status_changes').filter((c) => c.student_id === sid && c.item === '학사' && c.value === '퇴실' && c.status === '유효');
  assert.deepStrictEqual(heads().map((c) => c.effective_date), ['2027-03-11'], '퇴실 한 줄(B)');
  // 퇴실 취소: A·B 둘 다 미리보기 → B 취소 → A 취소는 거부, 취소 한 번
  const head = heads()[0];
  const ca = x.call(HALL, 'previewCancelMove', head.id);
  const c = x.race(() => x.call(ADMIN, 'cancelMove', head.id, '가짜 잘못 입력', x.call(ADMIN, 'previewCancelMove', head.id).expect),
    () => x.call(HALL, 'cancelMove', head.id, '가짜 잘못 입력', ca.expect));
  assert.strictEqual(c.b.ok, true, JSON.stringify(c.b));
  assert.ok(c.a.ok === false || c.a.already === true, '두 번째 취소는 거부되거나 "이미 취소"로 끝난다 ' + JSON.stringify(c.a));
  assert.deepStrictEqual([c.bLogged, c.aLogged], [true, false]);
  assert.strictEqual(heads().length, 0);
  assert.strictEqual(x.env.rows('status_changes').find((r2) => r2.id === head.id).cancel_reason, '가짜 잘못 입력');
});

/* ───── 근무(#139 뒤): 두 근무표 담당자가 같은 달 화면(getDutyMonth의 칸 token)을 본 뒤 차례로 저장 ───── */
function dutyEnv() {
  const env = createGasEnv({ owner: ADMIN, now: '2027-01-10T10:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = HALL;
  ['setup', 'seedFakeData', 'seedFakeStage1', 'seedFakeStage2'].forEach((f) => env.asOwner((c) => c[f]()));
  env.scriptProps.MAIL_ENABLED = 'true';
  // 메일이 실제로 나가는 주소(@example.com은 늘 빠진다)의 학사 교사 둘 = 교대 받을 사람
  env.asOwner((c) => { c.addUser('fake.x1@fakeschool.invalid', '가짜받는이1', 'hall_teacher'); c.addUser('fake.x2@fakeschool.invalid', '가짜받는이2', 'hall_teacher'); });
  env.strictLock = true;
  const call = (who, fn, ...a) => plain(env.call(who, fn, ...a));
  const users = env.rows('users'), idOf = (e) => users.find((u) => u.email === e).id;
  const month = (who) => call(who, 'getDutyMonth', '2027-01');
  const cell = (m, date, slot) => m.days.find((d) => d.date === date).slots.find((s) => s.slot === slot);
  const writes = () => env.rows('audit_log').filter((r) => !String(r.action).startsWith('denied')).length;
  const row = (date, slot) => env.rows('duty_slots').find((r) => r.date === date && r.slot === slot && r.status === '유효');
  return { env, call, idOf, month, cell, writes, row };
}
const M2 = 'fake.teacher2@example.com';   // 근무표 담당자(가짜교사2), ADMIN은 관리자

test('근무 편성: 두 담당자가 같은 화면을 본 뒤 B가 먼저 저장 → A의 옛 token 저장은 stale, 쓰기 0, audit은 B 것만', () => {
  const x = dutyEnv();
  const mA = x.month(ADMIN), mB = x.month(M2);
  const tA = cell(mA), tB = cell(mB);
  function cell(m) { return x.cell(m, '2027-01-12', '21:30조'); }
  const w0 = x.writes();
  const b = x.call(M2, 'saveDutyDay', { date: '2027-01-12', slots: { '21:30조': x.idOf(HALL) }, expect: { '21:30조': tB.token } });
  assert.strictEqual(b.ok, true, JSON.stringify(b));
  const w1 = x.writes();
  const after = JSON.stringify(x.row('2027-01-12', '21:30조'));
  const a = x.call(ADMIN, 'saveDutyDay', { date: '2027-01-12', slots: { '21:30조': x.idOf('fake.teacher3@example.com') }, expect: { '21:30조': tA.token } });
  assert.ok(stale(a), JSON.stringify(a));
  assert.deepStrictEqual([w1 > w0, x.writes() === w1], [true, true], 'B만 audit, A는 쓰기 0');
  assert.strictEqual(JSON.stringify(x.row('2027-01-12', '21:30조')), after, '칸은 B가 넣은 그대로');
  assert.strictEqual(x.row('2027-01-12', '21:30조').actual_email, HALL);
  assert.ok(stale(x.call(ADMIN, 'saveDutyDay', { date: '2027-01-12', slots: { '21:30조': x.idOf('fake.teacher3@example.com') } })), 'expect 없이도 stale');
});

test('근무 교대(담당자 대리 기록): B가 먼저 교대 → A의 옛 token 교대는 stale, 쓰기 0, audit·교대 메일은 B 것 한 번', () => {
  const x = dutyEnv();
  const mA = x.month(ADMIN), mB = x.month(M2);
  const tA = x.cell(mA, '2027-01-14', '23:00조'), tB = x.cell(mB, '2027-01-14', '23:00조');
  const w0 = x.writes(), mail0 = x.env.mail.length;
  const b = x.call(M2, 'swapDuty', tB.slotId, x.idOf('fake.x1@fakeschool.invalid'), { reason: '가짜', expect: tB.token });
  assert.strictEqual(b.ok, true, JSON.stringify(b));
  const w1 = x.writes(), mail1 = x.env.mail.length;
  assert.ok(mail1 > mail0, 'B의 교대 메일');
  const a = x.call(ADMIN, 'swapDuty', tA.slotId, x.idOf('fake.x2@fakeschool.invalid'), { reason: '가짜', expect: tA.token });
  assert.ok(stale(a), JSON.stringify(a));
  assert.deepStrictEqual([w1 > w0, x.writes() === w1], [true, true], 'B만 audit, A는 쓰기 0');
  assert.strictEqual(x.env.mail.length, mail1, '교대 메일은 B의 한 번만');
  const r = x.row('2027-01-14', '23:00조');
  assert.strictEqual(r.actual_email, 'fake.x1@fakeschool.invalid', 'B의 교대가 남는다');
  assert.ok(stale(x.call(ADMIN, 'swapDuty', tA.slotId, x.idOf('fake.x2@fakeschool.invalid'), { reason: '가짜' })), 'expect 없이도 stale');
});
