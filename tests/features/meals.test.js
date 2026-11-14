/** C17a F7 급식 변경 저장: R4 gas-fakes(실제 Auth·Db·락·audit)로 규칙 표를 저장 끝까지, 권한·stale·락을 확인한다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';          // admin + hall_teacher
const HALL = 'test.teacher@example.com';    // 담당 학생이 있는 학사 교사

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-03T10:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;   // 시드(setup)는 락 없이 쓰므로 시드 뒤에 켠다
  return env;
}
const term2 = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const mine = (env, email) => env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === email).map((e) => e.student_id);
/** HALL이 담당하는 학생 2명, 담당이 아닌 학생 1명 */
function pick(env) {
  const own = mine(env, HALL);
  return { a: own[0], b: own[1], other: mine(env, 'fake.teacher1@example.com')[0] };
}
const input = (sid, chip, at, extra) => Object.assign({ studentId: sid, chip, requestedAt: at, docSubmitted: false }, extra || {});
const prev = (env, who, i) => env.call(who, 'previewMealChange', i);
const save = (env, who, i, expect) => env.call(who, 'saveMealChange', i, expect);
const rowsOf = (env, sid) => env.rows('status_changes').filter((r) => r.student_id === sid);
/** 저장 전 미리보기 서명으로 저장 */
const saveOk = (env, who, i) => { const p = prev(env, who, i); return save(env, who, i, p.expect); };
const valueOn = (env, sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
/** 그 학생에게 2026-08-17부터 석식·조식 기록을 더한다(앞선 학기 값, 12월·1월 신청 시험용) */
function seedEarly(env, sid) {
  env.asOwner((c) => ['석식:학사 석식', '조식:실시'].forEach((x) => c.appendRecord_('status_changes', {
    student_id: sid, item: x.split(':')[0], value: x.split(':')[1], requested_at: '', effective_date: '2026-08-17', effective_date_auto: '2026-08-17',
    reason: '', doc_submitted: '', linked_change_id: '', source: '명단업로드', status: '유효', memo: '', cancel_reason: ''
  }, env.owner)));
}

/** 값이 바뀌는 학생으로 만든다: 이 학생의 조식·석식을 앞선 값(미실시)으로 맞춘다(명단 행 값 + 앞선 학기 행) */
function primeOff(env, sid) {
  seedEarly(env, sid);
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.student_id === sid && r.source === '명단업로드' && (r.item === '석식' || r.item === '조식'))
    .map((r) => ({ id: r.id, patch: { value: '미실시' } })), env.owner));
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
}

test('급식 변경 저장 표(PRD F7 1·3·4줄): 11:29:59 → 당일, 11:30:00 → 다음 날, 2026-12-31 11:30 → 2027-01-01. 저장 행과 전날(옛 값)·당일(새 값)까지', () => {
  const cases = [['d_hall', '2027-03-03T11:29:59', '2027-03-03', '학사 석식'], ['d_hall', '2027-03-03T11:30:00', '2027-03-04', '학사 석식'],
    ['d_gen', '2027-03-03T11:29:59', '2027-03-03', '일반 석식'], ['d_gen', '2027-03-03T11:30:00', '2027-03-04', '일반 석식'],
    ['b_on', '2027-03-03T11:29:59', '2027-03-03', '실시'], ['b_on', '2027-03-03T11:30:00', '2027-03-04', '실시'], ['d_hall', '2026-12-31T11:30:00', '2027-01-01', '학사 석식']];
  cases.forEach(([chip, at, want, val]) => {
    const env = makeEnv(at.slice(0, 10) === '2026-12-31' ? '2027-01-05T10:00:00' : '2027-03-03T12:00:00');
    const { a } = pick(env);
    primeOff(env, a);
    const item = chip === 'b_on' ? '조식' : '석식';
    const r = saveOk(env, ADMIN, input(a, chip, at));
    assert.strictEqual(r.ok, true, chip + ' ' + at + ' ' + JSON.stringify(r));
    const row = rowsOf(env, a).find((x) => x.id === r.id);
    assert.deepStrictEqual([row.effective_date, row.effective_date_auto, row.source, row.requested_at, row.value], [want, want, 'F7', at, val], chip + ' ' + at);
    const before = new Date(want + 'T00:00:00Z'); before.setUTCDate(before.getUTCDate() - 1);
    assert.strictEqual(valueOn(env, a, item, before.toISOString().slice(0, 10)), '미실시', '적용일 전날은 옛 값');
    assert.strictEqual(valueOn(env, a, item, want), val, '적용일 당일은 새 값');
  });
});

test('급식 변경 저장 표(PRD F7 미실시, 결정 71 — 오전 10시 신청): 3/1~3/3(수 마감 전) → 3/8, 3/4~3/7 → 3/15, 2026-12-30(수) → 2027-01-04이고 저장된 행도 같다', () => {
  const cases = [['2027-03-01', '2027-03-08'], ['2027-03-02', '2027-03-08'], ['2027-03-03', '2027-03-08'], ['2027-03-04', '2027-03-15'],
    ['2027-03-05', '2027-03-15'], ['2027-03-06', '2027-03-15'], ['2027-03-07', '2027-03-15'], ['2026-12-30', '2027-01-04']];
  cases.forEach(([day, want]) => {
    const env = makeEnv(day + 'T23:00:00');
    const { a } = pick(env);
    seedEarly(env, a);
    // 가짜 데이터의 명단 행은 requested_at이 업로드 시각이다(T1b가 ''로 고친다). 지금은 시험에서 같은 모양으로 맞춘다
    env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드')
      .map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
    const n = rowsOf(env, a).length;
    const pp = prev(env, ADMIN, input(a, 'd_off', day + 'T10:00:00'));
    assert.strictEqual(pp.ok, true, day + ' ' + JSON.stringify(pp.errors));
    const r = save(env, ADMIN, input(a, 'd_off', day + 'T10:00:00'), pp.expect);
    assert.strictEqual(r.ok, true, day + ' ' + JSON.stringify(r));
    const row = rowsOf(env, a).find((x) => x.id === r.id);
    assert.strictEqual(rowsOf(env, a).length, n + 1 + r.followUpCount - 0, '신청 행 하나(+이어 쓰기)');
    assert.deepStrictEqual([row.item, row.value, row.effective_date, row.effective_date_auto, row.source, row.status], ['석식', '미실시', want, want, 'F7', '유효'], day);
    assert.strictEqual(row.requested_at, day + 'T10:00:00');
  });
});

test('저장 뒤 statusOn_: 적용일 전날은 옛 값, 당일은 새 값. 서류 체크는 대표 행에만 TRUE/FALSE', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const r = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { docSubmitted: true }));   // 수 마감 전 → 다음 주 월요일(결정 71)
  assert.strictEqual(r.date, '2027-03-08');
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-07'), '학사 석식');
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-08'), '미실시');
  assert.strictEqual(rowsOf(env, a).find((x) => x.id === r.id).doc_submitted, 'TRUE');
  const r2 = saveOk(env, HALL, input(pick(env).b, 'd_off', '2027-03-03T10:00:00'));
  assert.strictEqual(rowsOf(env, pick(env).b).find((x) => x.id === r2.id).doc_submitted, 'FALSE');
});

test('적용일 고치기: 자동값과 다르면 사유 2자 필요(없으면 쓰기 0건), 신청일보다 이르면 거부, 사유와 effective_date_auto가 저장된다', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const before = env.rows('status_changes').length;
  const noReason = save(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-05' }), prev(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-05' })).expect);   // 자동 3/8(결정 71)
  assert.strictEqual(noReason.ok, false);
  assert.ok(noReason.errors.some((e) => e.field === 'reason'));
  const early = prev(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-02', reason: '급식실 요청' }));
  assert.strictEqual(early.ok, false);
  assert.ok(early.errors.some((e) => e.field === 'effectiveDate'));
  assert.strictEqual(env.rows('status_changes').length, before, '거부된 저장은 쓰지 않는다');
  const p = prev(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-05', reason: '급식실 요청' }));
  assert.strictEqual(p.manual, true);
  assert.ok(p.warnings.some((w) => w.includes('급식실 준비 기간')), '준비 기간보다 이르면 경고');
  assert.ok(![].concat(p.warnings, [p.reasonText]).some((t) => /\d{4}-\d{2}-\d{2}/.test(t)), '교사에게 숫자 날짜 원문을 보이지 않는다');
  const r = save(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-05', reason: '급식실 요청' }), p.expect);
  const row = rowsOf(env, a).find((x) => x.id === r.id);
  assert.deepStrictEqual([row.effective_date, row.effective_date_auto, row.reason], ['2027-03-05', '2027-03-08', '급식실 요청']);
  // 자동값과 같은 날짜를 적으면 고친 것이 아니다(사유 불필요)
  const same = prev(env, HALL, input(pick(env).b, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-08' }));
  assert.strictEqual(same.ok, true); assert.strictEqual(same.manual, false);
});

test('kind none도 신청 행 1개를 쓰고, 대체된 대기 행은 취소(status 취소 + [자동] 꼬리표)하며 지우지 않는다', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const pending = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:00:00'));   // 3/15 미실시 대기
  const r = saveOk(env, HALL, input(a, 'd_hall', '2027-03-03T10:00:00'));         // 이미 학사 석식 → none, 대기 행을 덮는다
  assert.strictEqual(r.ok, true); assert.strictEqual(r.cancelCount, 1);
  const rows = rowsOf(env, a);
  assert.ok(rows.find((x) => x.id === r.id), '신청 행');
  const old = rows.find((x) => x.id === pending.id);
  assert.strictEqual(old.status, '취소');
  assert.ok(old.cancel_reason.startsWith('[자동] ' + r.id), old.cancel_reason);
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-20'), '학사 석식');
  assert.ok(env.rows('audit_log').some((x) => x.action === 'bulk_update' && x.after.includes(old.id)), '취소가 audit에 남는다');
});

test('blocked(퇴실 뒤 학사 석식 신청)는 쓰지 않고 행 수가 그대로다', () => {
  const env = makeEnv();
  const { a } = pick(env);
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: a, item: '학사', value: '퇴실', requested_at: '2027-03-03T09:00:00', effective_date: '2027-03-03',
    effective_date_auto: '2027-03-03', reason: '', doc_submitted: 'FALSE', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, env.owner));
  env.setNow('2027-03-03T12:00:00');
  const i = input(a, 'd_hall', '2027-03-03T11:30:00');
  const p = prev(env, HALL, i);
  assert.ok(p.blocked && p.ok === false);
  const n = env.rows('status_changes').length;
  const r = save(env, HALL, i, p.expect);
  assert.strictEqual(r.ok, false); assert.ok(r.blocked);
  assert.strictEqual(env.rows('status_changes').length, n);
});

test('결정 58: 더 새 신청에 덮인 신청서(superseded)도 status 취소 + [자동] … 더 새 신청으로 저장하고 상태는 그대로다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  saveOk(env, HALL, input(a, 'd_hall', '2027-03-03T10:30:00'));
  const late = input(a, 'd_gen', '2027-03-03T09:00:00');   // 먼저 받은 종이를 늦게 입력
  const p = prev(env, HALL, late);
  assert.strictEqual(p.superseded, true);
  const r = save(env, HALL, late, p.expect);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.superseded, true);
  const row = rowsOf(env, a).find((x) => x.id === r.id);
  assert.strictEqual(row.status, '취소');
  assert.ok(/^\[자동\] .*더 새 신청$/.test(row.cancel_reason), row.cancel_reason);
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-05'), '학사 석식');
  assert.strictEqual(row.effective_date, '2027-03-03', '덮인 행도 적용일이 있어야 나중에 되살릴 수 있다(결정 58)');
  assert.strictEqual(row.effective_date_auto, '2027-03-03');
});

test('퇴실 전에 켠 학사 석식 → 규칙이 준 source(F6) 이어 쓰기 행이 대표 행과 함께 쓰인다(linked, 서류 빈칸)', () => {
  const env = makeEnv();
  const { a } = pick(env);
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: a, item: '학사', value: '퇴실', requested_at: '2027-03-03T08:00:00', effective_date: '2027-03-10',
    effective_date_auto: '2027-03-10', reason: '', doc_submitted: 'FALSE', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, env.owner));
  const p = prev(env, HALL, input(a, 'd_hall', '2027-03-03T10:00:00'));
  assert.strictEqual(p.followUps.length, 1);
  const r = save(env, HALL, input(a, 'd_hall', '2027-03-03T10:00:00'), p.expect);
  assert.strictEqual(r.followUpCount, 1);
  const f = rowsOf(env, a).find((x) => x.linked_change_id === r.id);
  // 퇴실 기록 3/3(수) 08:00 = 마감 전 → 중단일 다음 주 월요일 3/8이 퇴실일 3/10보다 이르므로 퇴실일(결정 35·71)
  assert.deepStrictEqual([f.item, f.value, f.effective_date, f.source, f.doc_submitted, f.status], ['석식', '미실시', '2027-03-10', 'F6', '', '유효']);
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-10'), '미실시');
});

test('stale: 확인한 뒤 다른 변경이 있었으면 {stale:true}이고 쓰지 않는다. expect가 없어도 거부', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const i = input(a, 'd_hall', '2027-03-03T10:00:00');
  const p = prev(env, HALL, i);
  saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:30:00'));   // 그 사이 대기 행이 생겼다 → 계획이 달라진다
  const n = env.rows('status_changes').length;
  const r = save(env, HALL, i, p.expect);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.stale, true);
  assert.strictEqual(save(env, HALL, i, '').stale, true);
  assert.strictEqual(env.rows('status_changes').length, n);
});

test('락: 다른 사람이 저장 중이면 오류이고 쓰지 않는다', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const i = input(a, 'd_hall', '2027-03-03T10:00:00');
  const p = prev(env, HALL, i);
  const n = env.rows('status_changes').length;
  env.lock.failNext = 1;
  assert.throws(() => save(env, HALL, i, p.expect), /다른 사람이 저장 중/);
  assert.strictEqual(env.rows('status_changes').length, n);
});

test('입력 검사: 신청 일시 형식(날짜만·Z·오프셋·공백·미래)과 학생·칩·미등록 학생은 오류, 저장해도 쓰기 0건', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const un = env.rows('students').find((s) => s.name === '가짜미등록').id;
  const bad = [[a, 'd_off', '2027-03-03'], [a, 'd_off', '2027-03-03T10:00:00Z'], [a, 'd_off', '2027-03-03T10:00:00+09:00'],
    [a, 'd_off', '2027-03-03 10:00:00'], [a, 'd_off', '2027-03-03T10:01:00'], [a, 'd_off', '2027-03-04T09:00:00'], [a, 'nope', '2027-03-03T10:00:00'],
    [un, 'd_off', '2027-03-03T10:00:00']];
  const n = env.rows('status_changes').length;
  bad.forEach((b) => {
    const p = prev(env, ADMIN, input(...b));
    assert.strictEqual(p.ok, false, JSON.stringify(b));
    assert.ok(p.errors.length, JSON.stringify(b));
    assert.strictEqual(save(env, ADMIN, input(...b), '').ok, false);
  });
  assert.strictEqual(env.rows('status_changes').length, n);
  assert.strictEqual(prev(env, ADMIN, input(a, 'd_off', '2027-03-03T10:00')).ok, true, 'T10:00 은 :00으로 받는다');
});

test('설정 meal.morning_cutoff가 잘못되면 기본값으로 바꾸지 않고 오류를 낸다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const s = env.rows('settings', 'config').find((r) => r.key === 'meal.morning_cutoff');
  env.asOwner((c) => c.updateRecord_('settings', s.id, { value: '아침' }, env.owner, 'config'));
  assert.throws(() => prev(env, ADMIN, input(a, 'd_hall', '2027-03-03T10:00:00')), /meal\.morning_cutoff/);
  env.asOwner((c) => c.updateRecord_('settings', s.id, { value: '10:00' }, env.owner, 'config'));
  assert.strictEqual(prev(env, ADMIN, input(a, 'd_hall', '2027-03-03T10:30:00')).date, '2027-03-04', '마감 10:00이면 10:30 신청은 다음 날');
});

test('권한: 관리자·담당교사 허용, 담당 아닌 학사 교사·담임·출결·근무표·학생·학부모는 거부(denied:status.edit)하고 쓰기 없음', () => {
  const env = makeEnv();
  const { a, other } = pick(env);
  const i = input(a, 'd_off', '2027-03-03T10:00:00');
  env.expectAllowed(ADMIN, 'previewMealChange', i);
  const p = env.expectAllowed(HALL, 'previewMealChange', i);
  const n = env.rows('status_changes').length;
  ['test.homeroom@example.com', 'test.attendance@example.com'].forEach((who) => {   // 역할 1차(status.list)는 통과, 학생 범위(status.edit)에서 거부
    env.expectDenied(who, 'status.edit', 'previewMealChange', i);
    env.expectDenied(who, 'status.edit', 'saveMealChange', i, p.expect);
  });
  ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'].forEach((who) => {   // 역할 자체가 없음
    env.expectDenied(who, 'status.list', 'previewMealChange', i);
    env.expectDenied(who, 'status.list', 'saveMealChange', i, p.expect);
  });
  const o = input(other, 'd_off', '2027-03-03T10:00:00');
  env.expectDenied(HALL, 'status.edit', 'previewMealChange', o);
  env.expectDenied(HALL, 'status.edit', 'saveMealChange', o, '');
  assert.strictEqual(env.rows('status_changes').length, n);
  assert.strictEqual(env.expectAllowed(HALL, 'saveMealChange', i, p.expect).ok, true);
  assert.strictEqual(env.rows('status_changes').length, n + 1);
});

test('getMealContext: 관리자·학사 교사·담임·출결 허용(근무표·학생·학부모 거부 denied:status.list), 학생 목록은 역할별, 이메일 없음', () => {
  const env = makeEnv();
  const adm = env.expectAllowed(ADMIN, 'getMealContext');
  assert.strictEqual(adm.canEdit, true); assert.strictEqual(adm.students.length, 30);
  assert.strictEqual(adm.cutoff, '11:30'); assert.strictEqual(adm.chips.length, 5);
  const hall = env.expectAllowed(HALL, 'getMealContext');
  assert.deepStrictEqual(hall.students.map((s) => s.id).sort(), mine(env, HALL).sort());
  assert.ok(hall.students[0].status['석식'] && hall.students[0].status['학사'] === '입실');
  ['test.homeroom@example.com', 'test.attendance@example.com'].forEach((who) => {
    const c = env.expectAllowed(who, 'getMealContext');
    assert.strictEqual(c.canEdit, false); assert.deepStrictEqual(c.students, []);
  });
  ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'].forEach((who) => env.expectDenied(who, 'status.list', 'getMealContext'));
  assert.ok(!JSON.stringify([adm, hall]).includes('@'), '응답에 이메일 없음');
});

/* ───────── C17b 학생 기록·서류 ───────── */

const hr = (env) => env.rows('users').find((u) => u.email === 'test.homeroom@example.com').homeroom_class;
const studentsOf = (env) => env.rows('students');
function inClass(env, klass, yes) {
  const [g, c] = klass.split('-');
  const ids = new Set(env.rows('enrollments').filter((e) => e.term_id === term2(env).id).map((e) => e.student_id));
  return studentsOf(env).filter((s) => ids.has(s.id) && ((String(s.grade) === g && String(s.class_no) === String(+c)) === yes))[0].id;
}

test('listStudentStatus: 오늘 값·대기·기록·비고 문장이 나오고 memo·이메일은 없다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const r = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T11:45:00'));   // 수 마감 뒤 → 3/15(결정 71)
  const row = rowsOf(env, a).find((x) => x.id === r.id);
  env.asOwner((c) => c.updateRecord_('status_changes', row.id, { memo: '[2OUT] out:ZZ-메모-표식' }, env.owner));
  const d = env.expectAllowed(HALL, 'listStudentStatus', a);
  assert.strictEqual(d.now['석식'], '학사 석식');
  assert.deepStrictEqual(d.pending.map((p) => [p.item, p.value, p.date]), [['석식', '미실시', '2027-03-15']]);
  assert.strictEqual(d.remark, '3.3 석식 미실시(3.15~)');
  const pend = d.pending.find((h) => h.id === r.id);
  assert.ok(pend && pend.docState === 'missing' && pend.canMarkDoc, '대기 줄에 [제출 표시]');
  assert.ok(d.history.some((h) => h.id === r.id && h.docState === 'missing' && !h.canMarkDoc), '같은 행이 기록에도 있지만 버튼은 한 곳에만');
  const wire = JSON.stringify(d);
  assert.ok(!wire.includes('ZZ-메모-표식') && !wire.includes('@'), 'memo·이메일 없음');
});

test('listStudentStatus 권한: 관리자·출결·학사 교사(담당 아닌 학생도)·담임(우리 반) 허용, 다른 반 담임·근무표·학생·학부모는 거부(denied:status.view)', () => {
  const env = makeEnv();
  const { a, other } = pick(env);
  [ADMIN, HALL, 'test.attendance@example.com'].forEach((who) => { env.expectAllowed(who, 'listStudentStatus', a); env.expectAllowed(who, 'listStudentStatus', other); });
  const klass = hr(env);
  const mineId = inClass(env, klass, true), otherId = inClass(env, klass, false);
  const home = env.expectAllowed('test.homeroom@example.com', 'listStudentStatus', mineId);
  assert.ok(!home.pending.concat(home.history).some((h) => h.canMarkDoc), '담임은 서류 표시 버튼이 없다');
  env.expectDenied('test.homeroom@example.com', 'status.view', 'listStudentStatus', otherId);
  ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'].forEach((who) => env.expectDenied(who, 'status.view', 'listStudentStatus', a));
  const ctx = env.call('test.homeroom@example.com', 'getMealContext');
  assert.ok(ctx.viewStudents.length > 0 && ctx.viewStudents.every((s) => s.classNo === String(+klass.split('-')[1]) || s.classNo === klass.split('-')[1]));
});

test('서류 미제출: 관리자가 입력해도 담당교사 홈에 1건, setDocSubmitted 뒤 원래대로. 명단 행은 세지 않는다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const home = (who, role) => env.call(who, 'getHomeData', role).food.docMissing;
  // 가짜 데이터에는 이미 서류 미제출 퇴실이 있을 수 있다(명단 행의 FALSE는 세지 않는다). 늘어나는 수로 본다.
  const base = { hall: home(HALL, 'hall_teacher'), other: home('fake.teacher1@example.com', 'hall_teacher'), admin: home(ADMIN, 'admin') };
  const r = saveOk(env, ADMIN, input(a, 'd_off', '2027-03-03T10:00:00'));
  assert.strictEqual(home(HALL, 'hall_teacher'), base.hall + 1);
  assert.strictEqual(home('fake.teacher1@example.com', 'hall_teacher'), base.other, '담당이 아닌 교사 홈은 그대로');
  assert.strictEqual(home(ADMIN, 'admin'), base.admin + 1);
  assert.strictEqual(env.expectAllowed(HALL, 'setDocSubmitted', r.id).ok, true);
  assert.strictEqual(rowsOf(env, a).find((x) => x.id === r.id).doc_submitted, 'TRUE');
  assert.ok(env.auditActions('update').length > 0);
  assert.strictEqual(home(HALL, 'hall_teacher'), base.hall);
  assert.strictEqual(env.call(HALL, 'setDocSubmitted', r.id).already, true, '두 번 눌러도 안전');
});

test('setDocSubmitted 권한: 남의 학생 행 id → denied:status.edit(락 안 재검사), 담임·출결 denied:status.edit, 근무표·학생·학부모 denied:status.list, 연결 행·없는 id는 ok:false', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const r = saveOk(env, ADMIN, input(a, 'd_off', '2027-03-03T10:00:00', { docSubmitted: false }));
  ['fake.teacher1@example.com', 'test.homeroom@example.com', 'test.attendance@example.com'].forEach((who) => env.expectDenied(who, 'status.edit', 'setDocSubmitted', r.id));
  ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'].forEach((who) => env.expectDenied(who, 'status.list', 'setDocSubmitted', r.id));
  assert.strictEqual(rowsOf(env, a).find((x) => x.id === r.id).doc_submitted, 'FALSE');
  const list = rowsOf(env, a).find((x) => x.item === '석식' && x.source === '명단업로드');
  assert.strictEqual(env.call(ADMIN, 'setDocSubmitted', list.id).ok, false, '명단 행은 대상 아님');
  assert.strictEqual(env.call(ADMIN, 'setDocSubmitted', 'no-such-id').ok, false);
  assert.strictEqual(env.call(ADMIN, 'setDocSubmitted', r.id).ok, true);
});

/* ───────── C17a 검토 반영(결정 60 기간 하나, 중복 저장, 경고 문구) ───────── */

/** 다른 기간의 담당교사: 거부 기록(denied:status.edit)은 남고, 오류 문구는 "그 기간 담당교사나 관리자가 신청합니다" 안내 */
function guided(env, who, fn, ...args) {
  Object.keys(env.cache).filter((k) => k.indexOf('script:deny:') === 0).forEach((k) => delete env.cache[k]);
  const before = env.rows('audit_log').length;
  assert.throws(() => env.call(who, fn, ...args), /이 신청\(적용일 .*\)은 .* 담당교사나 관리자가 합니다/);
  assert.ok(env.rows('audit_log').slice(before).some((r) => r.action === 'denied:status.edit' && r.created_by === who), '거부 기록은 남는다');
}

function clearListTimes(env) {
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
}

test('같은 신청서를 다시 저장해도 한 행뿐이다(재시도·두 번 누르기): kind none·덮인 신청서·값이 바뀌는 stop', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a, b } = pick(env);
  const twice = (sid, i, label) => {
    const p = prev(env, HALL, i);
    const n = rowsOf(env, sid).length;
    const r1 = save(env, HALL, i, p.expect);
    const n1 = rowsOf(env, sid).length;
    const r2 = save(env, HALL, i, p.expect);
    assert.strictEqual(r1.ok, true, label); assert.strictEqual(r2.ok, true, label); assert.strictEqual(r2.duplicate, true, label);
    assert.strictEqual(r2.id, r1.id, label);
    assert.strictEqual(rowsOf(env, sid).length, n1, label + ': 두 번째는 쓰지 않는다');
    assert.ok(n1 > n, label);
  };
  twice(a, input(a, 'd_hall', '2027-03-03T10:00:00'), 'none');
  twice(a, input(a, 'd_gen', '2027-03-03T09:00:00'), 'superseded');   // 위 신청이 더 새 신청 → 덮임
  twice(b, input(b, 'd_off', '2027-03-03T10:00:00'), 'stop');
});

test('결정 60: 기간은 적용일이 속한 기간 — 3/1(기간 사이)에는 새 담당교사만 저장되고 옛 담당교사는 거부, 2/25 종이를 3/3에 입력해도 3/8 적용으로 저장된다', () => {
  const env = makeEnv('2027-03-01T23:00:00');
  const { a } = pick(env);
  const old = env.rows('enrollments').find((e) => e.student_id === a && e.term_id !== term2(env).id);
  env.asOwner((c) => c.updateRecord_('enrollments', old.id, { teacher_email: 'fake.teacher1@example.com' }, env.owner));
  clearListTimes(env);
  const i = input(a, 'd_off', '2027-03-01T10:00:00');   // 월요일 신청 → 3/8, 새 기간
  guided(env, 'fake.teacher1@example.com', 'previewMealChange', i);
  guided(env, 'fake.teacher1@example.com', 'saveMealChange', i, '');
  assert.strictEqual(saveOk(env, HALL, i).date, '2027-03-08');
  const env2 = makeEnv('2027-03-03T12:00:00');
  clearListTimes(env2);
  const s2 = pick(env2).a;
  const r = saveOk(env2, ADMIN, input(s2, 'd_off', '2027-02-25T10:00:00'));   // 목요일 → 다다음 주 월요일
  assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.date, '2027-03-08');
  // 적용일이 끝난 기간이면 그대로 거부
  const env3 = makeEnv('2027-03-03T12:00:00');
  const late = prev(env3, ADMIN, input(pick(env3).a, 'd_off', '2027-02-10T10:00:00'));   // 2/10(수) → 2/22 월요일: 끝난 기간
  assert.strictEqual(late.ok, false); assert.ok(late.errors.some((e) => e.message.includes('끝난 기간')));
});

test('경고·막힘 문구는 규칙 원문이 아니라 교사용 말이고 숫자 날짜(yyyy-MM-dd)가 없다. 덮인 신청서 안내는 한 번만', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a, b } = pick(env);
  const noRaw = (p) => ![].concat(p.warnings, [p.blocked, p.reasonText]).some((t) => /\d{4}-\d{2}-\d{2}|규칙의 날|\(F6\)/.test(t));
  saveOk(env, HALL, input(a, 'd_hall', '2027-03-03T10:30:00'));
  const late = prev(env, HALL, input(a, 'd_gen', '2027-03-03T09:00:00'));
  assert.strictEqual(late.superseded, true);
  assert.strictEqual(late.warnings.filter((w) => w.includes('더 새 신청')).length, 1);
  assert.ok(noRaw(late));
  const past = prev(env, HALL, input(b, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-03', reason: '이미 급식 중단' }));
  assert.ok(past.warnings.some((w) => w.includes('지난 날짜의 식수 집계')) === false, '오늘 날짜는 지난 날짜가 아니다');
  const old = prev(env, HALL, input(b, 'd_hall', '2027-03-03T10:00:00', { effectiveDate: '2027-03-03' }));
  assert.ok(noRaw(past) && noRaw(old));
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: b, item: '학사', value: '퇴실', requested_at: '2027-03-03T08:00:00', effective_date: '2027-03-03',
    effective_date_auto: '2027-03-03', reason: '', doc_submitted: 'FALSE', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, env.owner));
  const blocked = prev(env, HALL, input(b, 'd_hall', '2027-03-03T11:30:00'));
  assert.ok(blocked.blocked.includes('학사 퇴실 상태') && noRaw(blocked));
  env.setNow('2027-03-05T12:00:00');
  const ago = prev(env, HALL, input(a, 'b_off', '2027-03-03T10:00:00'));   // 오늘(3/5)보다 이른 자동 날짜 3/3
  assert.ok(ago.warnings.some((w) => w.includes('지난 날짜의 식수 집계가 바뀝니다')));
});

test('사유는 200자까지', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const p = prev(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-08', reason: '가'.repeat(201) }));
  assert.strictEqual(p.ok, false);
  assert.ok(p.errors.some((e) => e.field === 'reason'));
});

test('getMealContext: 기간 사이 날(3/1)에는 막 끝난 기간과 다음 기간의 담당 학생을 모두 보여 준다(저장 판정은 적용일의 기간)', () => {
  const env = makeEnv('2027-03-01T23:00:00');
  const { a } = pick(env);
  const old = env.rows('enrollments').find((e) => e.student_id === a && e.term_id !== term2(env).id);
  env.asOwner((c) => c.updateRecord_('enrollments', old.id, { teacher_email: 'fake.teacher1@example.com' }, env.owner));
  const ids = (who) => env.call(who, 'getMealContext').students.map((s) => s.id);
  assert.ok(ids(HALL).includes(a), '새 기간 담당교사에게는 보인다');
  assert.ok(ids('fake.teacher1@example.com').includes(a), '옛 기간 담당교사도 목록에서 본다(저장하려 하면 안내가 나온다)');
  assert.strictEqual(env.call(ADMIN, 'getMealContext').term.id, term2(env).id);
});

test('근무교사(C8s)도 급식 변경은 못 한다: 오늘 근무자는 out.save는 통과하지만 status.edit는 denied:status.edit', () => {
  const env = makeEnv('2027-03-03T22:00:00');
  const { a } = pick(env);
  const duty = 'fake.teacher2@example.com';   // a의 담당교사가 아닌 학사 교사
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-03-03', slot: '21:30조', end_time: '21:30', original_email: duty, actual_email: duty,
    swapped_at: '', swapped_by: '', status: '유효', memo: '' }, env.owner));
  env.as(duty, (c) => c.requirePermission_('out.save', { studentId: a, ymd: '2027-03-03' }));   // 근무 창 안: 통과
  const i = input(a, 'd_gen', '2027-03-03T10:00:00');   // 11:30 전 신청 → 적용일 = 오늘 = 근무일(noDuty를 빼면 통과해 버리는 경우)
  env.expectDenied(duty, 'status.edit', 'previewMealChange', i);
  env.expectDenied(duty, 'status.edit', 'saveMealChange', i, '');
  assert.strictEqual(rowsOf(env, a).filter((x) => x.source === 'F7').length, 0);
});

/* ───────── C17b 검토 반영(결정 60 기준 하나, 비고·기록 말, 홈 목록) ───────── */

test('서류 미제출의 담당은 "적용일이 속한 기간의 담당교사" 하나: 홈 숫자·canMarkDoc·setDocSubmitted가 일치한다(2/24에 3/8 적용 행)', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const old = env.rows('enrollments').find((e) => e.student_id === a && e.term_id !== term2(env).id);
  env.asOwner((c) => c.updateRecord_('enrollments', old.id, { teacher_email: 'fake.teacher1@example.com' }, env.owner));
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  const home = (who) => env.call(who, 'getHomeData', 'hall_teacher').food.docMissing;
  const base = { hall: home(HALL), old: home('fake.teacher1@example.com') };
  const r = saveOk(env, ADMIN, input(a, 'd_off', '2027-02-24T13:00:00'));   // 2/24 수 오후 → 3/8(결정 71): 새 기간(1학기)
  assert.strictEqual(r.date, '2027-03-08');
  assert.strictEqual(home(HALL), base.hall + 1, '1학기 담당 홈에 1건');
  assert.strictEqual(home('fake.teacher1@example.com'), base.old, '2학기 담당 홈에는 없다');
  const can = (who) => env.call(who, 'listStudentStatus', a).pending.find((h) => h.id === r.id).canMarkDoc;
  assert.strictEqual(can(HALL), true); assert.strictEqual(can('fake.teacher1@example.com'), false); assert.strictEqual(can(ADMIN), true);
  env.expectDenied('fake.teacher1@example.com', 'status.edit', 'setDocSubmitted', r.id);
  assert.strictEqual(env.expectAllowed(HALL, 'setDocSubmitted', r.id).ok, true);
  assert.strictEqual(home(HALL), base.hall);
});

test('기간이 바뀌어도 서류 미제출은 표시할 때까지 남는다(지난 기간 행도 관리자 홈에), 홈 목록은 학생·종류만(이메일·memo 없음)', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const adminHome = () => env.call(ADMIN, 'getHomeData', 'admin').food.docMissing;
  const n0 = adminHome();
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: a, item: '학사', value: '퇴실', requested_at: '2027-02-20T10:00:00', effective_date: '2027-02-22',
    effective_date_auto: '2027-02-22', reason: '학기 말 퇴실', doc_submitted: 'FALSE', linked_change_id: '', source: 'F6', status: '유효', memo: 'ZZ-메모-표식', cancel_reason: '' }, env.owner));
  assert.strictEqual(adminHome(), n0 + 1, '끝난 기간의 행도 센다');
  const f = env.call(HALL, 'getHomeData', 'hall_teacher').food;
  const item = f.docList.find((x) => x.studentId === a);
  assert.ok(item && item.kind === '입퇴실' && /\d+\. /.test(item.label));
  assert.ok(!JSON.stringify(f).includes('@') && !JSON.stringify(f).includes('ZZ-메모-표식'));
});

test('비고 문장: 한 신청의 연결 행을 묶고(신청일은 한 번), 취소·덮인 신청서·명단 행은 빼고, 석식은 고유 이름으로 쓴다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const add = (r) => env.asOwner((c) => c.appendRecord_('status_changes', Object.assign({ student_id: a, effective_date_auto: r.effective_date, reason: '', doc_submitted: '', linked_change_id: '',
    status: '유효', memo: '', cancel_reason: '' }, r), env.owner));
  const head = add({ item: '학사', value: '퇴실', requested_at: '2027-03-03T15:00:00', effective_date: '2027-03-05', source: 'F6', doc_submitted: 'TRUE' });
  [['기숙사', '퇴실', '2027-03-05'], ['조식', '미실시', '2027-03-05'], ['석식', '미실시', '2027-03-15']]
    .forEach(([item, value, d]) => add({ item, value, requested_at: '2027-03-03T15:00:00', effective_date: d, source: 'F6', linked_change_id: head.id }));
  add({ item: '석식', value: '일반 석식', requested_at: '2027-03-04T10:00:00', effective_date: '2027-03-05', source: 'F7', status: '취소', cancel_reason: '[자동] x 더 새 신청' });
  const gen = add({ item: '석식', value: '일반 석식', requested_at: '2027-03-04T11:00:00', effective_date: '2027-03-12', source: 'F7' });
  const d = env.call(ADMIN, 'listStudentStatus', a);
  assert.ok(d.remark.startsWith('3.3 학사 퇴실(3.5~), 기숙사 퇴실(3.5~), 조식 미실시(3.5~), 석식 미실시(3.15~)'), d.remark);
  assert.ok(d.remark.includes('3.4 일반 석식으로 변경(3.12~)'), d.remark);
  assert.strictEqual((d.remark.match(/일반 석식으로 변경/g) || []).length, 1, '취소·덮인 신청서는 비고에 없다');
  assert.ok(!d.remark.includes('석식 학사 석식') && !d.remark.includes('석식 일반 석식'));
  assert.ok(gen.id);
});

test('기록 줄은 교사용 말: 날짜는 "3월 4일(목) 10:00", 출처는 급식 변경·입퇴실·명단, 취소 사유에 [자동]·UUID가 없다', () => {
  const env = makeEnv('2027-03-04T12:00:00');
  const { a } = pick(env);
  saveOk(env, HALL, input(a, 'd_off', '2027-03-04T09:00:00'));
  saveOk(env, HALL, input(a, 'd_gen', '2027-03-04T10:00:00'));   // 앞 대기 신청을 대체(취소)
  const d = env.call(HALL, 'listStudentStatus', a);
  const wire = JSON.stringify(d);
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(wire) && !wire.includes('[자동]') && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(wire.replace(/"id":"[^"]*"/g, '').replace(/"student":\{[^}]*\}/, '')), '시스템 글자·UUID 없음');
  const h = d.history.find((x) => x.status === '취소');
  assert.strictEqual(h.cancelText, '새 신청으로 대체됨');
  assert.strictEqual(h.requestedKo, '3월 4일(목) 09:00'); assert.strictEqual(h.sourceLabel, '급식 변경');
  assert.ok(d.history.some((x) => x.sourceLabel === '명단'));
});

test('setDocSubmitted: 문자열이 아닌 id는 거부, 담임 홈은 우리 반의 이번 주 신청(신청일 기준)만 보고 일요일에도 이번 주가 맞다', () => {
  const env = makeEnv('2027-03-07T21:00:00');   // 일요일 밤: 이번 주 = 3/1(월)~3/7(일)
  assert.strictEqual(env.call(ADMIN, 'setDocSubmitted', 12345).ok, false);
  assert.strictEqual(env.call(ADMIN, 'setDocSubmitted', null).ok, false);
  const klass = env.rows('users').find((u) => u.email === 'test.homeroom@example.com').homeroom_class;
  const [g, c] = klass.split('-');
  const ids = env.rows('enrollments').filter((e) => e.term_id === term2(env).id).map((e) => e.student_id);
  const inClass = env.rows('students').filter((s) => ids.includes(s.id) && String(s.grade) === g && String(s.class_no) === String(+c));
  const outClass = env.rows('students').filter((s) => ids.includes(s.id) && !(String(s.grade) === g && String(s.class_no) === String(+c)));
  const mine = inClass[0], other = outClass[0];
  env.asOwner((c2) => c2.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  saveOk(env, ADMIN, input(mine.id, 'd_off', '2027-03-03T10:00:00'));   // 신청은 이번 주, 적용일 3/15는 다음 주
  saveOk(env, ADMIN, input(other.id, 'd_off', '2027-03-03T10:00:00'));  // 다른 반
  saveOk(env, ADMIN, input(mine.id, 'd_gen', '2027-03-02T10:30:00', { docSubmitted: true }));
  saveOk(env, ADMIN, input(mine.id, 'b_off', '2027-02-26T10:30:00'));   // 지난주 신청: 이번 주 카드에 없다
  const week = env.call('test.homeroom@example.com', 'getHomeData', 'homeroom').food.week;
  assert.strictEqual(week.length, 2, JSON.stringify(week));
  assert.ok(week.every((x) => x.label === mine.grade + '. ' + mine.name), '앱 표준 이름(학년. 이름)');
  assert.deepStrictEqual(week.map((x) => [x.what, x.missing, x.done]).sort(), [['석식 미실시', true, false], ['일반 석식으로 변경', false, true]].sort());
  assert.ok(!JSON.stringify(week).includes(other.name));
});

test('지난 기간(졸업) 학생의 서류 미제출도 홈 링크 → 기록 → [제출 표시]로 지울 수 있다. ymd 없이는 보기 거부, 책임 교사가 없는 행은 관리자 홈 맨 위', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const t1 = env.rows('terms').find((t) => t.name !== '2027 1학기');
  const grad = env.asOwner((c) => c.appendRecord_('students', { student_no: '39997', name: '가짜졸업', gender: '여', grade: '3', class_no: '1', number: '97', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t1.id, student_id: grad.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  const row = env.asOwner((c) => c.appendRecord_('status_changes', { student_id: grad.id, item: '학사', value: '퇴실', requested_at: '2027-02-10T10:00:00', effective_date: '2027-02-10',
    effective_date_auto: '2027-02-10', reason: '졸업', doc_submitted: 'FALSE', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, env.owner));
  const nobody = env.rows('students').find((s) => s.name === '가짜미등록');
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: nobody.id, item: '석식', value: '미실시', requested_at: '2027-03-01T10:00:00', effective_date: '2027-03-08',
    effective_date_auto: '2027-03-08', reason: '', doc_submitted: 'FALSE', linked_change_id: '', source: 'F7', status: '유효', memo: '', cancel_reason: '' }, env.owner));
  const hall = () => env.call(HALL, 'getHomeData', 'hall_teacher').food;
  const item = hall().docList.find((x) => x.studentId === grad.id);
  assert.ok(item && item.ymd >= t1.start_date && item.ymd <= t1.end_date, '링크 날짜는 그 행의 기간 안: ' + JSON.stringify(item));
  assert.ok(!hall().docList.some((x) => x.studentId === nobody.id), '등록 없는 학생의 행은 담당 교사 홈에 없다');
  const adm = env.call(ADMIN, 'getHomeData', 'admin').food;
  assert.strictEqual(adm.docList[0].studentId, nobody.id, '책임 교사가 없는 행이 관리자 홈 맨 위');
  assert.ok(adm.docList.some((x) => x.studentId === grad.id));
  env.expectDenied(HALL, 'status.view', 'listStudentStatus', grad.id);   // 이번 기간 기준으로는 보이지 않는다
  const d = env.expectAllowed(HALL, 'listStudentStatus', grad.id, item.ymd);
  const mineRow = d.history.find((h) => h.id === row.id);
  assert.ok(mineRow.canMarkDoc && mineRow.dateKo.startsWith('2월 10일'), JSON.stringify(mineRow));
  const n0 = hall().docMissing;
  assert.strictEqual(env.expectAllowed(HALL, 'setDocSubmitted', row.id).ok, true);
  assert.strictEqual(hall().docMissing, n0 - 1);
  assert.strictEqual(env.call(ADMIN, 'listStudentStatus', nobody.id, adm.docList[0].ymd).pending.find((h) => h.docState === 'missing').canMarkDoc, true, '관리자는 책임 교사가 없는 행도 표시할 수 있다');
});

test('비고: 신청은 신청 일시 순(오래된 것 먼저), 구분자 " / ", 다른 해 날짜에는 연도가 붙는다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const add = (r) => env.asOwner((c) => c.appendRecord_('status_changes', Object.assign({ student_id: a, effective_date_auto: r.effective_date, reason: '', doc_submitted: '', linked_change_id: '',
    status: '유효', memo: '', cancel_reason: '' }, r), env.owner));
  add({ item: '조식', value: '미실시', requested_at: '2027-03-02T10:00:00', effective_date: '2027-03-09', source: 'F7', doc_submitted: 'TRUE' });
  add({ item: '석식', value: '미실시', requested_at: '2026-12-30T10:00:00', effective_date: '2027-01-11', source: 'F7', doc_submitted: 'TRUE' });
  const d = env.call(ADMIN, 'listStudentStatus', a);
  assert.ok(d.remark.startsWith('12.30 석식 미실시(1.11~) / 3.2 조식 미실시(3.9~)'), d.remark);
  const old = d.history.find((h) => h.what === '석식 미실시' && h.requestedKo.indexOf('2026년') === 0);
  assert.ok(old && old.dateKo.indexOf('2027') < 0, '올해 날짜에는 연도가 없고 지난해 신청 일시에는 연도가 붙는다');
});

test('기간 경계(결정 60 보충): 2/28(일)·3/1(사이 날)에 옛 담당은 안내와 함께 거부, 새 담당은 저장. 목록은 이번 기간 ∪ 다음 기간', () => {
  const OLD = 'fake.teacher1@example.com';
  [['2027-02-28T12:00:00', 'd_off', '2027-02-28T10:00:00', '2027-03-08'], ['2027-03-01T20:00:00', 'd_gen', '2027-03-01T10:00:00', '2027-03-01']].forEach(([now, chip, at, want]) => {
    const env = makeEnv(now);
    const { a } = pick(env);
    const old = env.rows('enrollments').find((e) => e.student_id === a && e.term_id !== term2(env).id);
    env.asOwner((c) => c.updateRecord_('enrollments', old.id, { teacher_email: OLD }, env.owner));
    clearListTimes(env);
    const i = input(a, chip, at);
    guided(env, OLD, 'previewMealChange', i);
    guided(env, OLD, 'saveMealChange', i, '');
    const r = saveOk(env, HALL, i);
    assert.strictEqual(r.ok, true, now); assert.strictEqual(r.date, want, now);
    const ids = (who) => env.call(who, 'getMealContext').students.map((x) => x.id);
    assert.ok(ids(HALL).includes(a) && ids(OLD).includes(a), now + ': 두 담당교사 모두 목록에 보인다(이번 기간 ∪ 다음 기간)');
  });
});

test('다음 기간 명단에 학생이 없으면 신청일의 기간(적용일 이전에서 가장 가까운 등록 기간) 담당이 저장한다. 그 기간이 끝났으면 거부', () => {
  const env = makeEnv('2027-02-25T12:00:00');
  const t1 = env.rows('terms').find((t) => t.name !== '2027 1학기');
  const st = env.asOwner((c) => c.appendRecord_('students', { student_no: '39998', name: '가짜전입', gender: '남', grade: '1', class_no: '1', number: '98', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t1.id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  ['학사', '석식'].forEach((item) => env.asOwner((c) => c.appendRecord_('status_changes', { student_id: st.id, item, value: item === '학사' ? '입실' : '학사 석식', requested_at: '', effective_date: '2026-08-17',
    effective_date_auto: '2026-08-17', reason: '', doc_submitted: '', linked_change_id: '', source: '명단업로드', status: '유효', memo: '', cancel_reason: '' }, env.owner)));
  const i = input(st.id, 'd_off', '2027-02-25T10:00:00');   // 목요일 → 적용일 3/8(다음 기간, 이 학생은 등록 없음)
  env.expectDenied('fake.teacher2@example.com', 'status.edit', 'previewMealChange', i);   // 이 학생과 관계 없는 교사는 그대로 거부
  const r = saveOk(env, HALL, i);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.date, '2027-03-08');
  assert.strictEqual(env.call(ADMIN, 'saveMealChange', input(st.id, 'd_off', '2027-02-25T10:30:00'), env.call(ADMIN, 'previewMealChange', input(st.id, 'd_off', '2027-02-25T10:30:00')).expect).ok, true);
  env.setNow('2027-03-03T12:00:00');   // 이제 옛 기간은 끝났다 → 등록 없는 새 기간의 학생은 관리자가 명단에 올리기 전에는 저장 불가
  const late = env.call(ADMIN, 'previewMealChange', input(st.id, 'd_off', '2027-03-03T10:00:00'));
  assert.strictEqual(late.ok, false); assert.ok(late.errors.some((e) => /명단에 없는/.test(e.message)), JSON.stringify(late.errors));   // 대체 기간이 끝났으면 할 일은 적용일 기간 명단 등록
});

test('중복 검사: 신청 일시가 다르면 새 행(M6), 사람이 취소한 같은 신청서는 중복이 아니다(M7)', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const r1 = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:00:00'));
  const r2 = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:30:00'));
  assert.notStrictEqual(r2.id, r1.id); assert.ok(!r2.duplicate, '다른 시각의 같은 값은 새 신청');
  env.asOwner((c) => c.updateRecord_('status_changes', r2.id, { status: '취소', cancel_reason: '잘못 입력' }, env.owner));
  const r3 = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:30:00'));
  assert.ok(!r3.duplicate && r3.id !== r2.id, '관리자가 취소한 뒤 다시 입력할 수 있다');
});

test('"덮습니다"·"먼저 적용됩니다" 경고도 교사용 말이고 숫자 날짜가 없다(M5)', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a, b } = pick(env);
  saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:00:00'));   // 3/15 미실시 대기
  const over = env.call(HALL, 'previewMealChange', input(a, 'd_hall', '2027-03-03T08:00:00', { effectiveDate: '2027-03-03', reason: '급식실 요청' }));
  const before = env.call(HALL, 'previewMealChange', input(a, 'd_gen', '2027-03-03T10:00:00', { effectiveDate: '2027-03-20', reason: '급식실 요청' }));
  [over, before].forEach((p) => assert.ok(![].concat(p.warnings).some((t) => /\d{4}-\d{2}-\d{2}/.test(t))));
  assert.ok(over.warnings.some((t) => t.includes('덮습니다')), '더 새 신청이 이 신청을 덮는다는 안내');
  assert.ok(before.warnings.some((t) => t.includes('먼저 적용됩니다')), '대기 중인 신청이 먼저 적용된다는 안내');
  assert.ok(b);
});

test('M10: 미리보기 뒤 경고만 달라져도(날짜·취소·이어 쓰기는 그대로) 저장은 stale이다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const i = input(a, 'd_hall', '2027-03-03T08:00:00');   // 이미 학사 석식 → kind none, 경고 없음
  const p = prev(env, HALL, i);
  assert.deepStrictEqual(p.warnings, []);
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: a, item: '석식', value: '미실시', requested_at: '2027-03-03T09:00:00', effective_date: '2027-03-15',
    effective_date_auto: '2027-03-15', reason: '', doc_submitted: 'TRUE', linked_change_id: '', source: 'F7', status: '유효', memo: '', cancel_reason: '' }, env.owner));   // 더 새 신청이 이 신청을 덮게 됨(경고만 생김)
  const n = env.rows('status_changes').length;
  const r = save(env, HALL, i, p.expect);
  assert.strictEqual(r.stale, true, JSON.stringify(r));
  assert.strictEqual(env.rows('status_changes').length, n);
  assert.ok(prev(env, HALL, i).warnings.some((t) => t.includes('덮습니다')));
});

test('M15: 고친 적용일이 어느 기간에도 속하지 않는 사이 날이면 "등록된 운영 기간 밖" 경고', () => {
  const env = makeEnv('2027-02-26T12:00:00');
  const { a } = pick(env);
  clearListTimes(env);
  const p = prev(env, ADMIN, input(a, 'd_hall', '2027-02-26T10:00:00', { effectiveDate: '2027-03-01', reason: '급식실 요청' }));
  assert.strictEqual(p.manual, true);
  assert.ok(p.warnings.some((t) => t.includes('등록된 운영 기간 밖')), JSON.stringify(p.warnings));
  const q = prev(env, ADMIN, input(a, 'd_hall', '2027-02-26T10:00:00', { effectiveDate: '2027-03-03', reason: '급식실 요청' }));
  assert.ok(!q.warnings.some((t) => t.includes('등록된 운영 기간 밖')), '기간 안 날짜에는 경고가 없다');
});

test('foodWrite_: 대표+연결 행은 한 번(bulk_create 한 줄)에 쓰고, 규칙이 준 [자동] 꼬리표 사유는 그대로 둔다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const pending = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:00:00'));
  const n0 = env.auditActions('bulk_create').length, c0 = env.auditActions('create').length;
  const w = env.as(ADMIN, (c) => c.withLock_(() => c.foodWrite_({ student_id: a, item: '석식', value: '학사 석식', requested_at: '2027-03-03T10:00:00', effective_date: '2027-03-03',
    effective_date_auto: '2027-03-03', reason: '', doc_submitted: 'FALSE', source: 'F7' },
  [{ item: '조식', value: '미실시', effective_date: '2027-03-03', effective_date_auto: '2027-03-03', source: 'F6', reason: '시험' }],
  [{ id: pending.id, cancel_reason: '[자동] 원인행 더 새 신청' }], ADMIN)));
  assert.strictEqual(env.auditActions('bulk_create').length - n0, 1, '대표+연결 행이 한 덩어리');
  assert.strictEqual(env.auditActions('create').length, c0, '행마다 따로 쓰지 않는다');
  const rows = rowsOf(env, a);
  const head = rows.find((x) => x.id === w.head.id);
  assert.strictEqual(rows.filter((x) => x.linked_change_id === head.id).length, 1);
  assert.strictEqual(rows.find((x) => x.id === pending.id).cancel_reason, '[자동] 원인행 더 새 신청', '이미 꼬리표가 있는 사유에 대표 id를 덧붙이지 않는다');
});

test('끊긴 저장 뒤 재시도: 대표 행은 있는데 취소가 빠졌으면 "이미 저장"이 아니라 덜 끝났다는 오류, 끝까지 간 저장의 재시도는 그대로 성공', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const pending = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T09:00:00'));   // 3/15 미실시 대기
  const i = input(a, 'd_hall', '2027-03-03T10:00:00');
  const p = prev(env, HALL, i);
  const r = save(env, HALL, i, p.expect);
  assert.strictEqual(r.cancelCount, 1);
  assert.strictEqual(save(env, HALL, i, p.expect).duplicate, true, '끝까지 간 저장의 재시도');
  // 취소 쓰기가 끊긴 상황을 만든다: 대기 행을 다시 살려 둔다
  env.asOwner((c) => c.updateRecord_('status_changes', pending.id, { status: '유효', cancel_reason: '' }, env.owner));
  const n = env.rows('status_changes').length;
  const again = save(env, HALL, i, p.expect);
  assert.strictEqual(again.ok, false); assert.ok(again.errors[0].message.includes('덜 끝났습니다'), JSON.stringify(again));
  assert.strictEqual(env.rows('status_changes').length, n);
});

test('안내 문구 조건: 그 기간이 끝났거나·학생이 그 기간 명단에 없거나·본인이 그 기간 담당이면 안내 없이 맨 오류(관리자도 아닌 사람은 맨 "권한이 없습니다.")', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const OLD = 'fake.teacher1@example.com';
  const old = env.rows('enrollments').find((e) => e.student_id === a && e.term_id !== term2(env).id);
  env.asOwner((c) => c.updateRecord_('enrollments', old.id, { teacher_email: OLD }, env.owner));
  // OLD는 2학기 담당 → 3/8 적용(1학기) 신청은 안내와 함께 거부된다
  guided(env, OLD, 'previewMealChange', input(a, 'd_off', '2027-03-03T10:00:00'));
  // 적용일이 끝난 기간(2/22)이면 안내 대신 맨 거부가 아니라 "끝난 기간" 오류(관리자)·권한 거부(OLD는 대상 기간 담당이라 그 기간으로는 허용되나 끝난 기간 오류)
  const ended = env.call(ADMIN, 'previewMealChange', input(a, 'd_off', '2027-02-10T10:00:00'));
  assert.ok(ended.errors.some((e) => e.message.includes('끝난 기간')), JSON.stringify(ended.errors));
});

test('기간 대체 순서(T5·T6): 첫 등록 기간 전 적용일의 신입생은 거부, 3기간(A·B 등록, C 아님)에서 오늘이 B이고 적용일이 C면 B 담당이 저장(가장 이른 A가 아님)', () => {
  const env = makeEnv('2027-07-10T12:00:00');
  const [t1, t2] = [env.rows('terms').find((t) => t.name !== '2027 1학기'), term2(env)];
  env.asOwner((c) => c.appendRecord_('terms', { name: '2027 2학기', type: '학기', start_date: '2027-08-01', end_date: '2027-12-20', memo: '시험' }, env.owner));
  const { a } = pick(env);
  const enrA = env.rows('enrollments').find((e) => e.student_id === a && e.term_id === t1.id);
  env.asOwner((c) => c.updateRecord_('enrollments', enrA.id, { teacher_email: 'fake.teacher1@example.com' }, env.owner));   // A(2학기 지난)=teacher1, B(1학기)=HALL
  clearListTimes(env);
  const i = input(a, 'd_off', '2027-07-10T10:00:00');   // 토요일 → 7/26(사이 날) → C 시작 8/1 기간 = C, 이 학생은 C 미등록
  const p = prev(env, HALL, i);
  assert.strictEqual(p.ok, true, JSON.stringify(p.errors));
  guided(env, 'fake.teacher1@example.com', 'previewMealChange', i);   // A 담당(가장 이른 기간)이 아니라 B 담당이 저장한다
  assert.strictEqual(save(env, HALL, i, p.expect).ok, true);
  // 첫 등록 기간(B) 전 적용일의 신입생(B에만 등록): 적용일이 A 기간이면 등록이 없다
  const st = env.asOwner((c) => c.appendRecord_('students', { student_no: '39996', name: '가짜신입', gender: '남', grade: '1', class_no: '1', number: '96', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t2.id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  env.setNow('2027-02-20T12:00:00');
  const early = env.call(ADMIN, 'previewMealChange', input(st.id, 'd_off', '2027-02-20T10:00:00', { effectiveDate: '2027-02-22', reason: '급식실 요청' }));
  assert.strictEqual(early.ok, false); assert.ok(early.errors.some((e) => /명단에 없는/.test(e.message)), JSON.stringify(early.errors));
});

/* ───────── C17b 3차: ymd 범위·전입생·picker ymd ───────── */

test('listStudentStatus의 ymd로 범위가 넓어지지 않는다: 한 번도 등록 안 된 학생·졸업생(이번 기간 ymd)·다른 반 담임은 어떤 ymd로도 거부, 잘못된·기간 밖 ymd는 ymd 없음과 같다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const t1 = env.rows('terms').find((t) => t.name !== '2027 1학기');
  const nobody = env.rows('students').find((s) => s.name === '가짜미등록').id;
  const grad = env.asOwner((c) => c.appendRecord_('students', { student_no: '39995', name: '가짜졸업생', gender: '여', grade: '3', class_no: '1', number: '95', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t1.id, student_id: grad.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  const { a } = pick(env);
  // 한 번도 등록 안 된 학생: 어떤 기간 안 ymd도 거부(역할만 검사하거나 아무 기간으로 보면 통과해 버린다)
  ['2027-03-03', '2027-02-10', '2027-05-01'].forEach((y) => env.expectDenied(HALL, 'status.view', 'listStudentStatus', nobody, y));
  // 졸업생(옛 기간만 등록): 이번 기간 ymd는 거부, 그 기간 ymd는 허용
  env.expectDenied(HALL, 'status.view', 'listStudentStatus', grad.id, '2027-03-03');
  env.expectAllowed(HALL, 'listStudentStatus', grad.id, '2027-02-10');
  // 다른 반 담임은 어떤 ymd로도 거부
  const klass = env.rows('users').find((u) => u.email === 'test.homeroom@example.com').homeroom_class;
  const [g, c] = klass.split('-');
  const ids = env.rows('enrollments').filter((e) => e.term_id === term2(env).id).map((e) => e.student_id);
  const other = env.rows('students').find((s) => ids.includes(s.id) && !(String(s.grade) === g && String(s.class_no) === String(+c))).id;
  ['', '2027-03-03', '2027-02-10'].forEach((y) => env.expectDenied('test.homeroom@example.com', 'status.view', 'listStudentStatus', other, y));
  // 잘못된·기간 밖 ymd = ymd 없음과 같은 결과(허용되는 학생은 허용, 거부되는 학생은 거부)
  ['2027-13-45', 'abc', 12345, '2030-01-01'].forEach((y) => {
    assert.strictEqual(env.call(HALL, 'listStudentStatus', a, y).student.id, a);
    env.expectDenied(HALL, 'status.view', 'listStudentStatus', grad.id, y);
  });
});

test('전입생(다음 기간 명단 없음)의 서류 담당은 대체 기간 담당: 홈 1건·항목 ymd는 그 기간 끝 날짜·그 ymd로 canMarkDoc·setDocSubmitted 뒤 0건', () => {
  const env = makeEnv('2027-02-25T12:00:00');
  const t1 = env.rows('terms').find((t) => t.name !== '2027 1학기');
  const st = env.asOwner((c) => c.appendRecord_('students', { student_no: '39994', name: '가짜전입생', gender: '남', grade: '2', class_no: '1', number: '94', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t1.id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  ['학사', '석식'].forEach((item) => env.asOwner((c) => c.appendRecord_('status_changes', { student_id: st.id, item, value: item === '학사' ? '입실' : '학사 석식', requested_at: '', effective_date: '2026-08-17',
    effective_date_auto: '2026-08-17', reason: '', doc_submitted: '', linked_change_id: '', source: '명단업로드', status: '유효', memo: '', cancel_reason: '' }, env.owner)));
  const home = () => env.call(HALL, 'getHomeData', 'hall_teacher').food;
  const n0 = home().docMissing;
  const r = saveOk(env, HALL, input(st.id, 'd_off', '2027-02-25T10:00:00'));   // 적용일 3/8 = 1학기, 이 학생은 1학기 미등록
  assert.strictEqual(r.date, '2027-03-08');
  assert.strictEqual(home().docMissing, n0 + 1);
  const item = home().docList.find((x) => x.studentId === st.id);
  assert.strictEqual(item.ymd, t1.end_date, '대체 기간 안 날짜(그 기간 끝)');
  const d = env.call(HALL, 'listStudentStatus', st.id, item.ymd);
  assert.strictEqual(d.pending.find((h) => h.id === r.id).canMarkDoc, true);
  assert.strictEqual(env.call(HALL, 'setDocSubmitted', r.id).ok, true);
  assert.strictEqual(home().docMissing, n0);
});

test('getMealContext의 보기 목록 항목에 ymd: 이번 기간 등록이면 빈 값, 다음 기간에만 등록된 학생은 그 기간 안 날짜(고르면 열린다)', () => {
  const env = makeEnv('2027-02-24T12:00:00');
  const t2 = term2(env);
  const st = env.asOwner((c) => c.appendRecord_('students', { student_no: '39993', name: '가짜신입', gender: '여', grade: '1', class_no: '1', number: '93', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t2.id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  const ctx = env.call(HALL, 'getMealContext');
  const item = ctx.viewStudents.find((x) => x.id === st.id);
  assert.ok(item && item.ymd >= t2.start_date && item.ymd <= t2.end_date, JSON.stringify(item));
  assert.strictEqual(env.call(HALL, 'listStudentStatus', st.id, item.ymd).student.id, st.id);
  const cur = ctx.viewStudents.find((x) => x.id === pick(env).a);
  assert.ok(cur.ymd === '' || cur.ymd >= t2.start_date, '이번 기간 또는 다음 기간 중 하나');
});

test('끝난 저장을 나중에 다시 보내도 거짓 "덜 끝났습니다"가 없다(FP-A): 나중에 연결 행이 취소돼도, 덮여서 취소된 신청서여도 duplicate', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: a, item: '학사', value: '퇴실', requested_at: '2027-03-03T08:00:00', effective_date: '2027-03-10',
    effective_date_auto: '2027-03-10', reason: '', doc_submitted: 'FALSE', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, env.owner));
  const i = input(a, 'd_hall', '2027-03-03T10:00:00');
  const p = prev(env, HALL, i);
  const r = save(env, HALL, i, p.expect);
  assert.strictEqual(r.followUpCount, 1);
  const linked = rowsOf(env, a).find((x) => x.linked_change_id === r.id);
  env.asOwner((c) => c.updateRecord_('status_changes', linked.id, { status: '취소', cancel_reason: '[자동] 나중의-퇴실취소 되돌림' }, env.owner));   // 나중 저장이 연결 행을 바꿨다
  const again = save(env, HALL, i, p.expect);
  assert.strictEqual(again.ok, true, JSON.stringify(again)); assert.strictEqual(again.duplicate, true);
  // 덮여서 취소된 신청서(superseded 기록)를 다시 보내도 같다
  const late = input(a, 'd_gen', '2027-03-03T09:00:00');
  const lp = prev(env, HALL, late);
  const lr = save(env, HALL, late, lp.expect);
  assert.strictEqual(lr.superseded, true);
  assert.strictEqual(save(env, HALL, late, lp.expect).duplicate, true);
});

test('안내 문구가 틀린 곳에서는 맨 "권한이 없습니다."(G6~G8): 끝난 기간·명단 밖 신입생·출결 전용 계정은 안내 없이 거부', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { a } = pick(env);
  const t1 = env.rows('terms').find((t) => t.name !== '2027 1학기');
  // (a2) HALL은 1학기 담당, 2학기 담당은 OLD. 적용일이 끝난 2학기(2/22)면 안내 없이 거부
  const old = env.rows('enrollments').find((e) => e.student_id === a && e.term_id === t1.id);
  env.asOwner((c) => c.updateRecord_('enrollments', old.id, { teacher_email: 'fake.teacher1@example.com' }, env.owner));
  env.expectDenied(HALL, 'status.edit', 'previewMealChange', input(a, 'd_off', '2027-02-10T10:00:00', { effectiveDate: '2027-02-22', reason: '급식실 요청' }));
  // (c) 1학기 teacher_email인 출결 전용 계정: 역할이 안 되므로 안내 없이 거부
  const en2 = env.rows('enrollments').find((e) => e.student_id === a && e.term_id === term2(env).id);
  env.asOwner((c) => c.updateRecord_('enrollments', en2.id, { teacher_email: 'test.attendance@example.com' }, env.owner));
  env.expectDenied('test.attendance@example.com', 'status.edit', 'previewMealChange', input(a, 'd_off', '2027-03-03T10:00:00'));
  // (b') 2/20에 1학기에만 등록된 신입생을 d_gen(적용일 = 신청일 2/20, 2학기 기간): 그 기간 명단에 없으므로 안내 없이 거부
  const env2 = makeEnv('2027-02-20T12:00:00');
  const st = env2.asOwner((c) => c.appendRecord_('students', { student_no: '39992', name: '가짜신입2', gender: '남', grade: '1', class_no: '1', number: '92', track: '', email: '', memo: '가짜' }, env2.owner));
  env2.asOwner((c) => c.appendRecord_('enrollments', { term_id: term2(env2).id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env2.owner));
  env2.expectDenied(HALL, 'status.edit', 'previewMealChange', input(st.id, 'd_gen', '2027-02-20T10:00:00'));
});

test('대체 기간이 끝난 학생의 오류 문구는 적용일 기간 이름을 정확히 낸다(E1)', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const t1 = env.rows('terms').find((t) => t.name !== '2027 1학기');
  const st = env.asOwner((c) => c.appendRecord_('students', { student_no: '39991', name: '가짜졸업2', gender: '남', grade: '3', class_no: '1', number: '91', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t1.id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  const p = env.call(ADMIN, 'previewMealChange', input(st.id, 'd_off', '2027-03-03T10:00:00'));   // 적용일 3/15 = 1학기, 이 학생은 2학기(끝남)만 등록
  assert.deepStrictEqual(p.errors.map((e) => e.message), ['"2027 1학기" 명단에 없는 학생입니다. 관리자에게 명단 등록을 요청해 주세요.']);
});

test('사이 날(3/1)에도 다음 기간에만 등록된 신입생을 학생 기록 picker에서 고르면 열린다(ymd = 그 기간 안 날짜)', () => {
  const env = makeEnv('2027-03-01T20:00:00');
  const t2 = term2(env);
  const st = env.asOwner((c) => c.appendRecord_('students', { student_no: '39990', name: '가짜신입3', gender: '여', grade: '1', class_no: '1', number: '90', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t2.id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  const ctx = env.call(HALL, 'getMealContext');
  const item = ctx.viewStudents.find((x) => x.id === st.id);
  assert.ok(item && item.ymd >= t2.start_date, JSON.stringify(item));
  assert.strictEqual(env.expectAllowed(HALL, 'listStudentStatus', st.id, item.ymd).student.id, st.id);
  const old = ctx.viewStudents.find((x) => x.id === pick(env).a);
  assert.strictEqual(old.ymd, '', '막 끝난 기간에 등록된 학생은 ymd 없이 열린다');
  assert.strictEqual(env.expectAllowed(HALL, 'listStudentStatus', old.id, old.ymd).student.id, old.id);
});
