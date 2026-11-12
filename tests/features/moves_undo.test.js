/** C18b F6 퇴실 취소·재입실: R4 gas-fakes(실제 Auth·Db·락·audit)로 취소 저장·권한·재입실 급식 이어짐을 끝까지 확인한다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';          // admin + hall_teacher
const HALL = 'test.teacher@example.com';    // 담당 학생이 있는 학사 교사(관리자 아님)

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-03T16:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  return env;
}
const term2 = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const rowsOf = (env, sid) => env.rows('status_changes').filter((r) => r.student_id === sid);
const isDorm = (env, sid) => rowsOf(env, sid).some((r) => r.item === '기숙사' && r.value === '입실');
function pick(env) {
  const own = env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === HALL).map((e) => e.student_id);
  const other = env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === 'fake.teacher1@example.com').map((e) => e.student_id)[0];
  const dorm = own.find((s) => isDorm(env, s)), non = own.find((s) => !isDorm(env, s));
  assert.ok(dorm && non && other);
  return { dorm, non, other };
}
const input = (sid, type, at, eff, extra) => Object.assign({ studentId: sid, type, requestedAt: at, effectiveDate: eff, dinner: '중단', docSubmitted: false }, extra || {});
const prev = (env, who, i) => env.call(who, 'previewMove', i);
const saveOk = (env, who, i) => { const p = prev(env, who, i); assert.strictEqual(p.ok, true, JSON.stringify(p)); const r = env.call(who, 'saveMove', i, p.expect); assert.strictEqual(r.ok, true, JSON.stringify(r)); return r; };
const valueOn = (env, sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
const days = (from, n) => Array.from({ length: n }, (_, i) => { const d = new Date(from + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
const snap = (env, sid) => days('2027-03-01', 61).map((d) => ['학사', '기숙사', '조식', '석식'].map((it) => valueOn(env, sid, it, d)).join('|')).join('\n');
const cancel = (env, who, id, why) => { const p = env.call(who, 'previewCancelMove', id); return { p, r: env.call(who, 'cancelMove', id, why || '잘못 입력함', p.expect || '') }; };

test('적용일 전 퇴실 취소: 3/1~4/30 매일 학사·기숙사·조식·석식 값이 퇴실 신청 전과 같고, 행은 지워지지 않고 취소로 남는다', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const before = snap(env, dorm), n0 = rowsOf(env, dorm).length;
  const r = saveOk(env, HALL, input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-10'));
  assert.notStrictEqual(snap(env, dorm), before);
  const c = cancel(env, HALL, r.id, '학생이 마음을 바꿈');
  assert.strictEqual(c.p.ok, true, JSON.stringify(c.p)); assert.strictEqual(c.r.ok, true, JSON.stringify(c.r));
  assert.strictEqual(snap(env, dorm), before);
  const rows = rowsOf(env, dorm);
  assert.ok(rows.length > n0, '취소 행은 지우지 않고 남긴다');
  const head = rows.find((x) => x.id === r.id);
  assert.deepStrictEqual([head.status, head.cancel_reason], ['취소', '학생이 마음을 바꿈']);
  assert.ok(rows.filter((x) => x.linked_change_id === r.id).every((x) => x.status === '취소' && x.cancel_reason.startsWith('[자동] ' + r.id + ' ')));
  assert.ok(env.rows('audit_log').some((a) => /status_changes/.test(a.sheet || '') && /update/.test(a.action || '')), '감사 기록');
  const again = env.call(HALL, 'cancelMove', r.id, '또 누름', c.p.expect);
  assert.deepStrictEqual([again.ok, again.already], [true, true]);
});

test('적용일이 지난 퇴실은 학사 교사 거부(관리자만), 관리자는 허용 — 행은 그대로 남고 경고가 나온다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveOk(env, HALL, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  env.setNow('2027-03-08T10:00:00');
  const t = cancel(env, HALL, r.id);
  assert.strictEqual(t.p.ok, false); assert.match(t.p.errors[0].message, /관리자만/);
  assert.strictEqual(t.r.ok, false);
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === r.id).status, '유효');
  const a = cancel(env, ADMIN, r.id);
  assert.strictEqual(a.p.ok, true, JSON.stringify(a.p)); assert.ok(a.p.warnings.some((w) => /지났/.test(w)), '지난 적용일 경고');
  assert.strictEqual(a.r.ok, true, JSON.stringify(a.r));
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === r.id).status, '취소');
});

test('권한: 남의 학생 headId는 denied:status.edit, 학생·학부모·근무교사·출결 담당은 첫 줄 거부(denied:status.list), 거부된 호출은 아무것도 쓰지 않는다', () => {
  const env = makeEnv();
  const { dorm, other } = pick(env);
  const rOther = saveOk(env, ADMIN, input(other, isDorm(env, other) ? '학사 및 기숙사 퇴실' : '학사 퇴실', '2027-03-03T15:00:00', '2027-03-10'));
  const n0 = env.rows('status_changes').length;
  env.expectDenied(HALL, 'status.edit', 'cancelMove', rOther.id, '남의 학생', '');
  env.expectDenied(HALL, 'status.edit', 'previewCancelMove', rOther.id);
  ['test.student@example.com', 'test.parent@example.com', 'test.duty@example.com'].forEach((who) => {
    env.expectDenied(who, 'status.list', 'cancelMove', rOther.id, '무관', '');
    env.expectDenied(who, 'status.list', 'previewCancelMove', rOther.id);
  });
  assert.strictEqual(env.rows('status_changes').length, n0);
  assert.strictEqual(rowsOf(env, other).find((x) => x.id === rOther.id).status, '유효');
  env.expectAllowed(ADMIN, 'previewCancelMove', rOther.id);
  void dorm;
});

test('입력 거부: 사유가 짧거나 없음 · 없는 id · 입실 행 · 연결 행 · 확인 뒤 바뀜(stale)', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveOk(env, HALL, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-10'));
  const p = env.call(HALL, 'previewCancelMove', r.id);
  assert.strictEqual(env.call(HALL, 'cancelMove', r.id, '가', p.expect).ok, false);
  assert.strictEqual(env.call(HALL, 'cancelMove', r.id, '', p.expect).ok, false);
  assert.strictEqual(env.call(HALL, 'cancelMove', 'no-such', '없는 기록', '').ok, false);
  const linked = rowsOf(env, non).find((x) => x.linked_change_id === r.id);
  assert.strictEqual(env.call(HALL, 'previewCancelMove', linked.id).ok, false);
  const stale = env.call(HALL, 'cancelMove', r.id, '다른 계획', 'x');
  assert.strictEqual(stale.stale, true);
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === r.id).status, '유효');
  // 입실 행(재입실)은 이 화면에서 취소하지 않는다
  const ctx = env.call(HALL, 'getMoveContext', non, '2027-03-12');
  const back = saveOk(env, HALL, input(non, '학사 입실', '2027-03-03T15:30:00', '2027-03-12', { meals: ctx.reentry.meals }));
  const bp = env.call(HALL, 'previewCancelMove', back.id);
  assert.strictEqual(bp.ok, false);
});

test('재입실: 학사 입실 = 퇴실 전 급식 값이 재입실일부터 이어지고, 아직 오지 않은 석식 중단이 취소된다. 기본값은 getMoveContext가 알려 준다', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const bk0 = valueOn(env, dorm, '조식', '2027-03-04'), dn0 = valueOn(env, dorm, '석식', '2027-03-04');
  saveOk(env, HALL, input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  assert.strictEqual(valueOn(env, dorm, '석식', '2027-03-20'), '미실시');
  const ctx = env.call(HALL, 'getMoveContext', dorm, '2027-03-08');
  assert.ok(ctx.types.some((t) => t.type === '학사 입실' && t.enabled));
  assert.deepStrictEqual([ctx.reentry.leaveDate, ctx.reentry.meals['조식'], ctx.reentry.meals['석식']], ['2027-03-05', bk0, dn0], '기본값 = 퇴실 전날 값');
  // meals를 안 보내면 거부(화면은 늘 명시해서 보낸다)
  const noMeals = prev(env, HALL, input(dorm, '학사 입실', '2027-03-03T15:30:00', '2027-03-08'));
  assert.strictEqual(noMeals.ok, false); assert.ok(noMeals.errors.some((e) => e.field === 'meals'));
  const bad = prev(env, HALL, input(dorm, '학사 입실', '2027-03-03T15:30:00', '2027-03-08', { meals: { '조식': '??', '석식': '미실시' } }));
  assert.strictEqual(bad.ok, false);
  saveOk(env, HALL, input(dorm, '학사 입실', '2027-03-03T15:30:00', '2027-03-08', { meals: ctx.reentry.meals }));
  assert.strictEqual(valueOn(env, dorm, '학사', '2027-03-08'), '입실');
  assert.strictEqual(valueOn(env, dorm, '조식', '2027-03-08'), bk0);
  assert.strictEqual(valueOn(env, dorm, '석식', '2027-03-08'), dn0);
  assert.strictEqual(valueOn(env, dorm, '석식', '2027-03-20'), dn0, '아직 오지 않은 석식 중단(3/15)이 취소되어 이어진다');
  // 다른 값을 고르면 그 값이 재입실일부터
  const env2 = makeEnv();
  const d2 = pick(env2).dorm;
  saveOk(env2, HALL, input(d2, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  saveOk(env2, HALL, input(d2, '학사 입실', '2027-03-03T15:30:00', '2027-03-08', { meals: { '조식': '미실시', '석식': '일반 석식' } }));
  assert.strictEqual(valueOn(env2, d2, '조식', '2027-03-09'), '미실시');
  assert.strictEqual(valueOn(env2, d2, '석식', '2027-03-20'), '일반 석식');
});

test('재입실이 있는 퇴실을 취소하면 재입실·기숙사 입실 기록도 함께 취소된다는 경고가 확인에 나오고, 값이 퇴실 전으로 돌아간다', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const before = snap(env, dorm);
  const leave = saveOk(env, ADMIN, input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  const ctx = env.call(ADMIN, 'getMoveContext', dorm, '2027-03-08');
  saveOk(env, ADMIN, input(dorm, '학사 입실', '2027-03-03T15:30:00', '2027-03-08', { meals: ctx.reentry.meals }));
  const c = cancel(env, ADMIN, leave.id, '퇴실 자체가 잘못');
  assert.ok(c.p.warnings.some((w) => /재입실 기록\(.*\)도 함께 취소됩니다/.test(w)), JSON.stringify(c.p.warnings));
  assert.ok(c.p.warnings.every((w) => !/\d{4}-\d{2}-\d{2}/.test(w)), '경고 속 날짜는 월·일로');
  assert.strictEqual(c.r.ok, true, JSON.stringify(c.r));
  assert.strictEqual(snap(env, dorm), before);
  assert.ok(rowsOf(env, dorm).filter((x) => x.source === 'F6' && x.value === '입실').every((x) => x.status === '취소' || x.cancel_reason === ''), '재입실 대표도 취소 상태');
});

test('쓰기는 락 안에서(strictLock) 한 번의 갱신으로: 취소 저장이 락 없이 쓰면 시험이 실패하도록 strictLock을 켠 환경에서 통과한다', () => {
  const env = makeEnv();
  assert.strictEqual(env.strictLock, true);
  const { non } = pick(env);
  const r = saveOk(env, HALL, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-10'));
  assert.strictEqual(cancel(env, HALL, r.id).r.ok, true);
});

test('퇴실 취소는 그 퇴실이 가린 대기 신청(석식 미실시)을 다시 살린다(toRestore를 실제로 쓴다)', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const i = { studentId: non, chip: 'd_off', requestedAt: '2027-03-03T10:00:00', docSubmitted: true };
  const m = env.call(HALL, 'saveMealChange', i, env.call(HALL, 'previewMealChange', i).expect);
  assert.strictEqual(m.ok, true, JSON.stringify(m));
  const pend = rowsOf(env, non).find((x) => x.id === m.id);
  assert.strictEqual(pend.status, '유효');
  const r = saveOk(env, HALL, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05', { dinner: '일반 석식' }));
  const mid = rowsOf(env, non).find((x) => x.id === m.id);
  assert.strictEqual(mid.status, '취소', '퇴실이 대기 신청을 가렸다');
  const c = cancel(env, HALL, r.id);
  assert.strictEqual(c.r.ok, true, JSON.stringify(c.r));
  assert.ok(c.p.lines.some((l) => /다시 살림/.test(l)), '확인에 다시 살림이 보인다');
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === m.id).status, '유효', '되살아났다');
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === m.id).cancel_reason, '');
});

test('2OUT 퇴실로 저장된 행의 취소는 관리자(out.dismiss)만: 담당교사는 denied:out.dismiss, 관리자는 허용', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveOk(env, HALL, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-10'));
  env.asOwner((c) => c.updateRecord_('status_changes', r.id, { reason: '2OUT 퇴실', memo: '[2OUT] out:x note:y' }, env.owner));
  env.expectDenied(HALL, 'out.dismiss', 'previewCancelMove', r.id);
  env.expectDenied(HALL, 'out.dismiss', 'cancelMove', r.id, '되돌림', '');
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === r.id).status, '유효');
  assert.strictEqual(cancel(env, ADMIN, r.id).r.ok, true);
});

test('학생 기록의 canCancelMove(버튼 표시): 적용일 전엔 담당교사·관리자, 지난 뒤엔 관리자만, 입실·연결·취소된 행에는 없다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveOk(env, HALL, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  const can = (who) => env.call(who, 'listStudentStatus', non, '').pending.concat(env.call(who, 'listStudentStatus', non, '').history).filter((h) => h.canCancelMove).map((h) => h.id);
  assert.deepStrictEqual(can(HALL), [r.id]); assert.deepStrictEqual(can(ADMIN), [r.id]);
  env.setNow('2027-03-08T10:00:00');
  assert.deepStrictEqual(can(HALL), []); assert.deepStrictEqual(can(ADMIN), [r.id]);
  assert.strictEqual(cancel(env, ADMIN, r.id).r.ok, true);
  assert.deepStrictEqual(can(ADMIN), [], '취소된 행에는 버튼이 없다');
});
