/** C18a F6 입퇴실 저장: R4 gas-fakes(실제 Auth·Db·락·audit)로 규칙 결과를 저장 끝까지, 권한·stale·락·중복·출석부 공석을 확인한다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';          // admin + hall_teacher
const HALL = 'test.teacher@example.com';    // 담당 학생이 있는 학사 교사

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-03T16:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;   // 시드(setup)는 락 없이 쓰므로 시드 뒤에 켠다
  return env;
}
const term2 = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const rowsOf = (env, sid) => env.rows('status_changes').filter((r) => r.student_id === sid);
const isDorm = (env, sid) => rowsOf(env, sid).some((r) => r.item === '기숙사' && r.value === '입실');
/** HALL 담당 학생 중 기숙사생 1명·비기숙사생 1명, 담당이 아닌 학생 1명 */
function pick(env) {
  const own = env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === HALL).map((e) => e.student_id);
  const other = env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === 'fake.teacher1@example.com').map((e) => e.student_id)[0];
  const dorm = own.find((s) => isDorm(env, s)), non = own.find((s) => !isDorm(env, s));
  assert.ok(dorm && non && other, '시드에 기숙사생·비기숙사생·다른 담당 학생이 있어야 한다');
  return { dorm, non, other };
}
const input = (sid, type, at, eff, extra) => Object.assign({ studentId: sid, type, requestedAt: at, effectiveDate: eff, dinner: '중단', docSubmitted: false }, extra || {});
const prev = (env, who, i) => env.call(who, 'previewMove', i);
const save = (env, who, i, expect) => env.call(who, 'saveMove', i, expect);
const saveOk = (env, who, i) => { const p = prev(env, who, i); assert.strictEqual(p.ok, true, JSON.stringify(p)); return save(env, who, i, p.expect); };
const valueOn = (env, sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
const rowAt = (env, sid, item, value) => rowsOf(env, sid).filter((r) => r.item === item && r.value === value && r.status === '유효').pop();

test('결정 35(저장 끝까지): 3/3(수) 15:00 신청·3/5 퇴실 → 학사 퇴실@3/5, 조식 미실시@3/5, 석식 미실시@3/15, 전날·당일·3/14·3/15 값이 맞다', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const r = saveOk(env, ADMIN, input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  assert.strictEqual(r.ok, true);
  const head = rowsOf(env, dorm).find((x) => x.id === r.id);
  assert.deepStrictEqual([head.item, head.value, head.effective_date, head.source, head.linked_change_id, head.doc_submitted, head.requested_at],
    ['학사', '퇴실', '2027-03-05', 'F6', '', 'FALSE', '2027-03-03T15:00:00']);
  assert.strictEqual(valueOn(env, dorm, '학사', '2027-03-04'), '입실');
  assert.strictEqual(valueOn(env, dorm, '학사', '2027-03-05'), '퇴실');
  assert.strictEqual(valueOn(env, dorm, '기숙사', '2027-03-05'), '퇴실');
  assert.strictEqual(valueOn(env, dorm, '조식', '2027-03-04'), '실시');
  assert.strictEqual(valueOn(env, dorm, '조식', '2027-03-05'), '미실시');
  ['2027-03-04', '2027-03-05', '2027-03-14'].forEach((d) => assert.strictEqual(valueOn(env, dorm, '석식', d), '학사 석식', d));
  assert.strictEqual(valueOn(env, dorm, '석식', '2027-03-15'), '미실시');
  // 연결 행: 기숙사 퇴실·조식·석식 정리는 대표 행을 가리키고 서류 칸이 비어 있다
  const linked = rowsOf(env, dorm).filter((x) => x.linked_change_id === r.id);
  assert.ok(linked.length >= 3 && linked.every((x) => x.doc_submitted === ''), JSON.stringify(linked.map((x) => [x.item, x.value, x.effective_date, x.source])));
  assert.deepStrictEqual(linked.filter((x) => x.item === '석식').map((x) => [x.value, x.effective_date, x.source]), [['미실시', '2027-03-15', 'F6']]);
});

test('월·화 신청 → 석식 중단 3/8, 퇴실일이 더 늦으면 퇴실일', () => {
  const env = makeEnv('2027-03-02T20:00:00');
  const { non, dorm } = pick(env);
  saveOk(env, ADMIN, input(non, '학사 퇴실', '2027-03-02T15:00:00', '2027-03-05'));
  assert.strictEqual(rowAt(env, non, '석식', '미실시').effective_date, '2027-03-08');
  saveOk(env, ADMIN, input(dorm, '학사 및 기숙사 퇴실', '2027-03-02T15:00:00', '2027-03-12'));
  assert.strictEqual(rowAt(env, dorm, '석식', '미실시').effective_date, '2027-03-12');
});

test('"일반 석식으로": 일반 석식@max(11:30 규칙, 퇴실일)(F7, 연결, 서류 빈칸), 석식 미실시 행 없음', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveOk(env, ADMIN, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05', { dinner: '일반 석식' }));
  const g = rowAt(env, non, '석식', '일반 석식');
  assert.deepStrictEqual([g.effective_date, g.source, g.linked_change_id, g.doc_submitted], ['2027-03-05', 'F7', r.id, '']);
  assert.ok(!rowsOf(env, non).some((x) => x.item === '석식' && x.value === '미실시' && x.status === '유효'));
  assert.strictEqual(valueOn(env, non, '석식', '2027-03-20'), '일반 석식');
});

test('기숙사 입실 + 조식 → 조식 실시@입실일(15:00 신청이어도, F7 표 2줄). 학사 퇴실 조식 = 퇴실일(표 5줄)', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveOk(env, ADMIN, input(non, '기숙사 입실', '2027-03-03T15:00:00', '2027-03-10'));
  const b = rowAt(env, non, '조식', '실시');
  assert.deepStrictEqual([b.effective_date, b.effective_date_auto, b.source, b.linked_change_id], ['2027-03-10', '2027-03-10', 'F7', r.id]);
  assert.strictEqual(valueOn(env, non, '기숙사', '2027-03-10'), '입실');
  assert.notStrictEqual(valueOn(env, non, '조식', '2027-03-09'), '실시');
  assert.strictEqual(valueOn(env, non, '조식', '2027-03-10'), '실시');
});

test('상태 오류(이미 퇴실·기숙사생의 학사만 퇴실·학사생 아닌 학생의 기숙사 입실)는 오류로 돌려주고 쓰기 0건', () => {
  const env = makeEnv();
  const { dorm, non } = pick(env);
  const n = env.rows('status_changes').length;
  const only = prev(env, ADMIN, input(dorm, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  assert.strictEqual(only.ok, false); assert.ok(only.errors[0].message.includes('학사 및 기숙사 퇴실'));
  assert.strictEqual(save(env, ADMIN, input(dorm, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'), '').ok, false);
  saveOk(env, ADMIN, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  const n2 = env.rows('status_changes').length;
  const again = prev(env, ADMIN, input(non, '학사 퇴실', '2027-03-03T15:30:00', '2027-03-06'));
  assert.strictEqual(again.ok, false);
  const dormIn = prev(env, ADMIN, input(non, '기숙사 입실', '2027-03-03T15:30:00', '2027-03-06'));
  assert.strictEqual(dormIn.ok, false); assert.ok(dormIn.errors[0].message.includes('학사생만'));
  assert.ok(![].concat(only.errors, again.errors, dormIn.errors).some((e) => /\d{4}-\d{2}-\d{2}/.test(e.message)), '숫자 날짜 원문 없음');
  assert.strictEqual(env.rows('status_changes').length, n2);
  assert.ok(n2 > n);
});

test('신청 일시: 비어 있거나 날짜만·미래·Z는 쓰기 0건, T15:00은 :00으로 저장', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const n = env.rows('status_changes').length;
  ['', '2027-03-03', '2027-03-03T15:00:00Z', '2027-03-04T10:00:00', '2027-03-03T16:30:00'].forEach((at) => {
    assert.strictEqual(prev(env, ADMIN, input(non, '학사 퇴실', at, '2027-03-05')).ok, false, at);
    assert.strictEqual(save(env, ADMIN, input(non, '학사 퇴실', at, '2027-03-05'), '').ok, false, at);
  });
  assert.strictEqual(env.rows('status_changes').length, n);
  const r = saveOk(env, ADMIN, input(non, '학사 퇴실', '2027-03-03T15:00', '2027-03-05'));
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === r.id).requested_at, '2027-03-03T15:00:00');
});

test('끝난 기간·명단 밖 학생은 오류, 석식을 안 고르면 오류(기본값 없음)', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const un = env.rows('students').find((s) => s.name === '가짜미등록').id;
  const ended = prev(env, ADMIN, input(non, '학사 퇴실', '2027-03-02T10:00:00', '2027-02-20'));
  assert.ok(ended.errors.some((e) => e.message.includes('끝난 기간')));
  assert.ok(prev(env, ADMIN, input(un, '학사 입실', '2027-03-03T10:00:00', '2027-03-05')).errors.some((e) => e.message.includes('명단에 없는')));
  const noDinner = prev(env, ADMIN, input(non, '학사 퇴실', '2027-03-03T10:00:00', '2027-03-05', { dinner: '' }));
  assert.ok(noDinner.errors.some((e) => e.field === 'dinner'));
});

test('퇴실 저장 뒤 출석부: 전날 자리는 있고 퇴실일에는 공석이 하나 늘어난다. 서류 미제출은 대표 행 1건(정리 행은 세지 않음)', () => {
  const env = makeEnv();
  const seated = env.rows('seat_assignments').filter((a) => a.status === '배정').map((a) => a.student_id);
  const sid = seated.find((s) => isDorm(env, s) && env.rows('enrollments').some((e) => e.term_id === term2(env).id && e.student_id === s));
  assert.ok(sid, '자리가 배정된 기숙사생');
  const vac = (d) => env.call(ADMIN, 'getAttendanceSheet', d).vacantCount;
  const before = [vac('2027-03-04'), vac('2027-03-05')];
  const miss = () => env.call(ADMIN, 'getHomeData', 'admin').food.docMissing;
  const m0 = miss();
  saveOk(env, ADMIN, input(sid, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  assert.strictEqual(vac('2027-03-04'), before[0], '전날은 그대로');
  assert.strictEqual(vac('2027-03-05'), before[1] + 1, '퇴실일부터 공석');
  assert.strictEqual(miss(), m0 + 1);
});

test('stale·중복·락: 확인 뒤 다른 변경이 있으면 {stale:true}, 같은 신청서를 다시 저장해도 한 번만, 락 실패는 오류이고 쓰지 않는다', () => {
  const env = makeEnv();
  const { non, dorm } = pick(env);
  const i = input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  const p = prev(env, ADMIN, i);
  env.lock.failNext = 1;
  const n0 = env.rows('status_changes').length;
  assert.throws(() => save(env, ADMIN, i, p.expect), /다른 사람이 저장 중/);
  assert.strictEqual(env.rows('status_changes').length, n0);
  // stale: 그 사이 같은 학생에게 다른 입퇴실이 들어갔다
  saveOk(env, ADMIN, input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T14:00:00', '2027-03-04'));
  const s = save(env, ADMIN, i, p.expect);
  assert.strictEqual(s.ok, false);
  assert.ok(s.stale || (s.errors && s.errors.length), JSON.stringify(s));
  // 중복
  const j = input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  const pj = prev(env, ADMIN, j);
  const r1 = save(env, ADMIN, j, pj.expect);
  const n = env.rows('status_changes').length;
  const r2 = save(env, ADMIN, j, pj.expect);
  assert.strictEqual(r2.duplicate, true); assert.strictEqual(r2.id, r1.id);
  assert.strictEqual(env.rows('status_changes').length, n);
  assert.strictEqual(save(env, ADMIN, input(non, '학사 퇴실', '2027-03-03T15:20:00', '2027-03-05'), '').ok, false, 'expect 없으면 거부(또는 상태 오류)');
});

test('권한: 관리자·담당교사 허용, 담당 아닌 학사 교사·담임·출결은 denied:status.edit, 근무표·학생·학부모는 denied:status.list, 거부된 호출은 쓰지 않는다', () => {
  const env = makeEnv();
  const { non, other } = pick(env);
  const i = input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  env.expectAllowed(ADMIN, 'previewMove', i);
  const p = env.expectAllowed(HALL, 'previewMove', i);
  const n = env.rows('status_changes').length;
  ['test.homeroom@example.com', 'test.attendance@example.com'].forEach((who) => {
    env.expectDenied(who, 'status.edit', 'previewMove', i);
    env.expectDenied(who, 'status.edit', 'saveMove', i, p.expect);
  });
  ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'].forEach((who) => {
    env.expectDenied(who, 'status.list', 'previewMove', i);
    env.expectDenied(who, 'status.list', 'saveMove', i, p.expect);
  });
  const o = input(other, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  env.expectDenied(HALL, 'status.edit', 'previewMove', o);
  env.expectDenied(HALL, 'status.edit', 'saveMove', o, '');
  assert.strictEqual(env.rows('status_changes').length, n);
  assert.strictEqual(env.expectAllowed(HALL, 'saveMove', i, p.expect).ok, true);
});

test('getMoveContext: 오늘 값과 고를 수 있는 유형(기숙사생은 학사 퇴실이 꺼짐), 보기 권한(관리자·출결·학사 교사 허용, 근무표·학생·학부모 denied:status.view)', () => {
  const env = makeEnv();
  const { dorm, non, other } = pick(env);
  const d = env.expectAllowed(HALL, 'getMoveContext', dorm);
  assert.strictEqual(d.now['학사'], '입실');
  const types = Object.fromEntries(d.types.map((t) => [t.type, t]));
  assert.strictEqual(types['학사 퇴실'].enabled, false); assert.ok(types['학사 퇴실'].hint.includes('학사 및 기숙사 퇴실'));
  assert.strictEqual(types['학사 및 기숙사 퇴실'].enabled, true);
  assert.ok(!types['학사 입실'] && !types['기숙사 입실'], '입실 유형은 입실할 수 있는 학생에게만');
  const t2 = Object.fromEntries(env.call(ADMIN, 'getMoveContext', non).types.map((t) => [t.type, t]));
  assert.strictEqual(t2['학사 퇴실'].enabled, true); assert.strictEqual(t2['기숙사 입실'].enabled, true);
  [ADMIN, 'test.attendance@example.com'].forEach((who) => env.expectAllowed(who, 'getMoveContext', other));
  ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'].forEach((who) => env.expectDenied(who, 'status.view', 'getMoveContext', non));
});
