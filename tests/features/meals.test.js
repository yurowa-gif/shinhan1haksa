/** C17a F7 급식 변경 저장: R4 gas-fakes(실제 Auth·Db·락·audit)로 규칙 표를 저장 끝까지, 권한·stale·락을 확인한다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';          // admin + hall_teacher
const HALL = 'test.teacher@example.com';    // 담당 학생이 있는 학사 교사
const DENIED = ['test.homeroom@example.com', 'test.attendance@example.com', 'test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'];

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

test('급식 변경 저장 표(PRD F7 1·3·4줄): 실시·학사 석식·일반 석식은 11:29:59 → 당일, 11:30:00 → 다음 날, 2026-12-31 11:30 → 2027-01-01', () => {
  const env = makeEnv();
  const { a } = pick(env);
  seedEarly(env, a);
  const cases = [['d_hall', '2027-03-03T11:29:59', '2027-03-03'], ['d_hall', '2027-03-03T11:30:00', '2027-03-04'],
    ['d_gen', '2027-03-03T11:29:59', '2027-03-03'], ['d_gen', '2027-03-03T11:30:00', '2027-03-04'],
    ['b_on', '2027-03-03T11:29:59', '2027-03-03'], ['b_on', '2027-03-03T11:30:00', '2027-03-04'], ['d_hall', '2026-12-31T11:30:00', '2027-01-01']];
  cases.forEach(([chip, at, want]) => {
    env.setNow(at.slice(0, 10) === '2026-12-31' ? '2027-01-05T10:00:00' : '2027-03-03T12:00:00');
    const p = prev(env, ADMIN, input(a, chip, at));
    assert.strictEqual(p.ok, true, chip + ' ' + at + ' ' + JSON.stringify(p.errors));
    assert.strictEqual(p.date, want, chip + ' ' + at);
  });
});

test('급식 변경 저장 표(PRD F7 미실시): 3/1·3/2 신청 → 3/8, 3/3~3/7 신청 → 3/15, 2026-12-30 신청 → 2027-01-11이고 저장된 행도 같다', () => {
  const cases = [['2027-03-01', '2027-03-08'], ['2027-03-02', '2027-03-08'], ['2027-03-03', '2027-03-15'], ['2027-03-04', '2027-03-15'],
    ['2027-03-05', '2027-03-15'], ['2027-03-06', '2027-03-15'], ['2027-03-07', '2027-03-15'], ['2026-12-30', '2027-01-11']];
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
  const r = saveOk(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { docSubmitted: true }));
  assert.strictEqual(r.date, '2027-03-15');
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-14'), '학사 석식');
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-15'), '미실시');
  assert.strictEqual(rowsOf(env, a).find((x) => x.id === r.id).doc_submitted, 'TRUE');
  const r2 = saveOk(env, HALL, input(pick(env).b, 'd_off', '2027-03-03T10:00:00'));
  assert.strictEqual(rowsOf(env, pick(env).b).find((x) => x.id === r2.id).doc_submitted, 'FALSE');
});

test('적용일 고치기: 자동값과 다르면 사유 2자 필요(없으면 쓰기 0건), 신청일보다 이르면 거부, 사유와 effective_date_auto가 저장된다', () => {
  const env = makeEnv();
  const { a } = pick(env);
  const before = env.rows('status_changes').length;
  const noReason = save(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-08' }), prev(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-08' })).expect);
  assert.strictEqual(noReason.ok, false);
  assert.ok(noReason.errors.some((e) => e.field === 'reason'));
  const early = prev(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-02', reason: '급식실 요청' }));
  assert.strictEqual(early.ok, false);
  assert.ok(early.errors.some((e) => e.field === 'effectiveDate'));
  assert.strictEqual(env.rows('status_changes').length, before, '거부된 저장은 쓰지 않는다');
  const p = prev(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-08', reason: '급식실 요청' }));
  assert.strictEqual(p.manual, true);
  assert.ok(p.warnings.some((w) => w.includes('미실시 규칙')), '준비 기간보다 이르면 경고');
  const r = save(env, HALL, input(a, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-08', reason: '급식실 요청' }), p.expect);
  const row = rowsOf(env, a).find((x) => x.id === r.id);
  assert.deepStrictEqual([row.effective_date, row.effective_date_auto, row.reason], ['2027-03-08', '2027-03-15', '급식실 요청']);
  // 자동값과 같은 날짜를 적으면 고친 것이 아니다(사유 불필요)
  const same = prev(env, HALL, input(pick(env).b, 'd_off', '2027-03-03T10:00:00', { effectiveDate: '2027-03-15' }));
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
  assert.deepStrictEqual([f.item, f.value, f.effective_date, f.source, f.doc_submitted, f.status], ['석식', '미실시', '2027-03-15', 'F6', '', '유효']);
  assert.strictEqual(valueOn(env, a, '석식', '2027-03-15'), '미실시');
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
  DENIED.forEach((who) => {
    env.expectDenied(who, 'status.edit', 'previewMealChange', i);
    env.expectDenied(who, 'status.edit', 'saveMealChange', i, p.expect);
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
