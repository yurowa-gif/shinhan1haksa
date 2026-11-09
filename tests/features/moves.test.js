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
  assert.ok(prev(env, ADMIN, input(un, '학사 입실', '2027-03-03T10:00:00', '2027-03-05')).errors.some((e) => e.message.includes('명단에 없는') && e.message.includes('관리자에게')));
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

test('getMoveContext: 오늘 값과 고를 수 있는 유형(기숙사생은 학사 퇴실이 꺼짐), 보기 권한(관리자·출결·학사 교사 허용, 근무표·학생·학부모 denied:status.list·다른 반 담임 denied:status.view)', () => {
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
  ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com'].forEach((who) => env.expectDenied(who, 'status.list', 'getMoveContext', non));
  const klass = env.rows('users').find((u) => u.email === 'test.homeroom@example.com').homeroom_class;
  const [g, cn] = klass.split('-');
  const ids = env.rows('enrollments').filter((e) => e.term_id === term2(env).id).map((e) => e.student_id);
  const otherClass = env.rows('students').find((st) => ids.includes(st.id) && !(String(st.grade) === g && String(st.class_no) === String(+cn))).id;
  env.expectDenied('test.homeroom@example.com', 'status.view', 'getMoveContext', otherClass);   // 담임은 다른 반 학생을 못 본다
});

test('기간 경계(결정 60 보충): 2/28에 3/8 적용 퇴실 → 새 기간 담당교사는 저장, 옛 기간 담당교사는 거부 기록과 안내', () => {
  const OLD = 'fake.teacher1@example.com';
  const env = makeEnv('2027-02-28T12:00:00');
  const { non } = pick(env);
  const old = env.rows('enrollments').find((e) => e.student_id === non && e.term_id !== term2(env).id);
  env.asOwner((c) => c.updateRecord_('enrollments', old.id, { teacher_email: OLD }, env.owner));
  const i = input(non, '학사 퇴실', '2027-02-28T10:00:00', '2027-03-08');
  Object.keys(env.cache).filter((k) => k.indexOf('script:deny:') === 0).forEach((k) => delete env.cache[k]);
  const before = env.rows('audit_log').length;
  assert.throws(() => prev(env, OLD, i), /이 신청\(적용일 .*\)은 .* 담당교사나 관리자가 합니다/);
  assert.ok(env.rows('audit_log').slice(before).some((r) => r.action === 'denied:status.edit' && r.created_by === OLD));
  const r = saveOk(env, HALL, i);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(rowsOf(env, non).find((x) => x.id === r.id).effective_date, '2027-03-08');
});

test('유형 칩은 적용일 기준: 3/10 기숙사 입실 대기 학생의 3/12는 "학사 및 기숙사 퇴실"만, 3/5는 "학사 퇴실"이 열린다. 사이 날(3/1)에도 새 기간 담당은 열 수 있다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  saveOk(env, ADMIN, input(non, '기숙사 입실', '2027-03-03T15:00:00', '2027-03-10'));
  const types = (d) => Object.fromEntries(env.call(HALL, 'getMoveContext', non, d).types.map((t) => [t.type, t]));
  assert.strictEqual(types('2027-03-05')['학사 퇴실'].enabled, true);
  const t12 = types('2027-03-12');
  assert.strictEqual(t12['학사 퇴실'].enabled, false); assert.ok(t12['학사 퇴실'].hint.includes('학사 및 기숙사 퇴실'));
  assert.strictEqual(t12['학사 및 기숙사 퇴실'].enabled, true);
  const env2 = makeEnv('2027-03-01T20:00:00');
  assert.strictEqual(env2.expectAllowed(HALL, 'getMoveContext', pick(env2).non, '2027-03-01').date, '2027-03-01');
});

test('"2OUT 퇴실" 사유는 예약어: 관리자도 손으로 쓰지 못한다(공백 정리 뒤·[2OUT] 머리말), 다른 사유는 된다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const n = env.rows('status_changes').length;
  ['2OUT 퇴실', '  2OUT   퇴실 ', '[2OUT] out:x note:y'].forEach((reason) => {
    const i = input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05', { reason });
    assert.ok(prev(env, ADMIN, i).errors.some((e) => e.field === 'reason'), reason);
    assert.strictEqual(save(env, ADMIN, i, '').ok, false, reason);
  });
  assert.strictEqual(env.rows('status_changes').length, n);
  assert.strictEqual(prev(env, ADMIN, input(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05', { reason: '전학' })).ok, true);
});

test('저장 쪽 규칙 일치: 퇴실이 대표 행 학사 석식(고친 날)을 취소하면 꼬리표가 "[자동] <대표> 학사 퇴실 석식 중단", 그 행이 취소했던 신청은 되살아난다(toRestore 저장)', () => {
  const env = makeEnv('2027-03-03T16:00:00');
  const { dorm } = pick(env);
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  const mealSave = (chip, at, extra) => {
    const i = { studentId: dorm, chip, requestedAt: at, docSubmitted: true }; Object.assign(i, extra || {});
    const p = env.call(ADMIN, 'previewMealChange', i);
    assert.strictEqual(p.ok, true, JSON.stringify(p));
    return env.call(ADMIN, 'saveMealChange', i, p.expect);
  };
  const R = mealSave('d_off', '2027-03-03T09:00:00', { effectiveDate: '2027-03-25', reason: '급식실 요청' });   // 3/25 미실시(대기)
  const H = mealSave('d_hall', '2027-03-03T10:00:00', { effectiveDate: '2027-03-20', reason: '급식실 요청' });   // 3/20 학사 석식 → R을 취소
  assert.strictEqual(rowsOf(env, dorm).find((x) => x.id === R.id).status, '취소');
  const leave = saveOk(env, ADMIN, input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  const rows = rowsOf(env, dorm);
  const h = rows.find((x) => x.id === H.id), r = rows.find((x) => x.id === R.id);
  assert.strictEqual(h.status, '취소');
  assert.strictEqual(h.cancel_reason, '[자동] ' + leave.id + ' 학사 퇴실 석식 중단', h.cancel_reason);
  assert.strictEqual(r.status, '유효', 'R이 다시 살아난다(되살림 저장)'); assert.strictEqual(r.cancel_reason, ''); assert.strictEqual(r.effective_date, '2027-03-25');
  const stop = rows.find((x) => x.linked_change_id === leave.id && x.item === '석식');
  assert.deepStrictEqual([stop.value, stop.source, stop.effective_date, stop.reason], ['미실시', 'F6', '2027-03-15', '학사 퇴실 석식 중단']);
  assert.strictEqual(rows.find((x) => x.id === leave.id).effective_date_auto, '2027-03-05');
  assert.ok(env.rows('audit_log').some((a) => a.action === 'bulk_update' && a.after.includes(r.id)), '되살림이 audit에 남는다');
});

test('stale만 다른 경우(확인 뒤 취소·되살림 대상이 달라짐)도 쓰지 않는다, 끊긴 저장(취소 빠짐) 재시도는 덜 끝났다는 오류', () => {
  const env = makeEnv('2027-03-03T16:00:00');
  const { dorm } = pick(env);
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  const i = input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  const p = prev(env, ADMIN, i);
  const mi = { studentId: dorm, chip: 'd_hall', requestedAt: '2027-03-03T15:30:00', docSubmitted: true, effectiveDate: '2027-03-20', reason: '급식실 요청' };
  const mp = env.call(ADMIN, 'previewMealChange', mi);
  env.call(ADMIN, 'saveMealChange', mi, mp.expect);   // 이 학생에게 3/20 학사 석식이 생겨, 퇴실이 그 행을 취소해야 한다
  const n = env.rows('status_changes').length;
  const s = save(env, ADMIN, i, p.expect);
  assert.strictEqual(s.stale, true, JSON.stringify(s));
  assert.strictEqual(env.rows('status_changes').length, n);
  const p2 = prev(env, ADMIN, i);
  const r = save(env, ADMIN, i, p2.expect);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.cancelCount, 1);
  const cancelled = rowsOf(env, dorm).find((x) => x.status === '취소' && x.cancel_reason.indexOf('[자동] ' + r.id) === 0);
  env.asOwner((c) => c.updateRecord_('status_changes', cancelled.id, { status: '유효', cancel_reason: '' }, env.owner));   // 취소 쓰기가 끊긴 상황
  const again = save(env, ADMIN, i, p2.expect);
  assert.strictEqual(again.ok, false); assert.ok(again.errors[0].message.includes('덜 끝났습니다'), JSON.stringify(again));
});

test('끝난 저장을 나중에 다시 보내도 거짓 "덜 끝났습니다"가 없다(FP-A): 나중에 정리 행이 취소돼도 duplicate', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const i = input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  const p = prev(env, ADMIN, i);
  const r = save(env, ADMIN, i, p.expect);
  assert.strictEqual(r.ok, true);
  const linked = rowsOf(env, dorm).filter((x) => x.linked_change_id === r.id);
  assert.ok(linked.length >= 3);
  env.asOwner((c) => c.updateRecord_('status_changes', linked[1].id, { status: '취소', cancel_reason: '[자동] 나중 재입실 취소' }, env.owner));   // 나중 저장이 정리 행을 바꿨다
  const again = save(env, ADMIN, i, p.expect);
  assert.strictEqual(again.ok, true, JSON.stringify(again)); assert.strictEqual(again.duplicate, true);
});

/* ───────── 총괄 확인 후속(W2·L6·U7·U8·취소+되살림 한 번) ───────── */

test('W2: 대표 행 쓰기(bulkAppend_)가 실패하면 대기 신청은 취소되지 않고 그대로 유효하다(취소를 먼저 쓰는 순서면 대표 없이 취소만 남는다)', () => {
  const env = makeEnv('2027-03-03T16:00:00');
  const { dorm } = pick(env);
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  const mi = { studentId: dorm, chip: 'd_hall', requestedAt: '2027-03-03T15:30:00', docSubmitted: true, effectiveDate: '2027-03-20', reason: '급식실 요청' };
  const H = env.call(ADMIN, 'saveMealChange', mi, env.call(ADMIN, 'previewMealChange', mi).expect);   // 3/20 학사 석식 대기 → 퇴실이 취소할 행
  const i = input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  const p = prev(env, ADMIN, i);
  assert.strictEqual(p.cancel, 1);
  const n = env.rows('status_changes').length;
  assert.throws(() => env.as(ADMIN, (c) => { c.bulkAppend_ = () => { throw new Error('시험: 쓰기 실패'); }; return c.saveMove(JSON.parse(JSON.stringify(i)), p.expect); }), /쓰기 실패/);
  assert.strictEqual(env.rows('status_changes').length, n, '아무 행도 쓰이지 않았다');
  assert.strictEqual(rowsOf(env, dorm).find((x) => x.id === H.id).status, '유효', '대기 신청은 취소되지 않았다');
});

test('취소와 되살림은 한 번의 쓰기(bulk_update 한 줄)이고, 끊긴 뒤 다른 저장의 [자동] 꼬리표가 있어도 덜 끝난 저장은 덜 끝났다고 한다(U8)', () => {
  const env = makeEnv('2027-03-03T16:00:00');
  const { dorm } = pick(env);
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  const mealSave = (chip, at, extra) => {
    const mi = Object.assign({ studentId: dorm, chip, requestedAt: at, docSubmitted: true }, extra || {});
    return env.call(ADMIN, 'saveMealChange', mi, env.call(ADMIN, 'previewMealChange', mi).expect);
  };
  const R = mealSave('d_off', '2027-03-03T09:00:00', { effectiveDate: '2027-03-25', reason: '급식실 요청' });
  const H = mealSave('d_hall', '2027-03-03T10:00:00', { effectiveDate: '2027-03-20', reason: '급식실 요청' });   // R을 취소(H의 꼬리표가 R에)
  const i = input(dorm, '학사 및 기숙사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  const p = prev(env, ADMIN, i);
  const b0 = env.auditActions('bulk_update').length;
  const leave = save(env, ADMIN, i, p.expect);
  assert.strictEqual(leave.cancelCount, 1); assert.strictEqual(leave.restoreCount, 1);
  assert.strictEqual(env.auditActions('bulk_update').length - b0, 1, '취소(H)와 되살림(R)이 한 번의 쓰기');
  // 끊긴 저장: 퇴실이 취소한 H를 다시 살려 둔다(꼬리표 제거). R에는 다른 저장(H)의 [자동] 꼬리표가 아니라 되살림 흔적만 있다
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: dorm, item: '조식', value: '실시', requested_at: '2027-03-02T09:00:00', effective_date: '2027-03-30', effective_date_auto: '2027-03-30', reason: '',
    doc_submitted: 'TRUE', linked_change_id: '', source: 'F7', status: '취소', memo: '', cancel_reason: '[자동] 다른저장의-대표-id 새 신청으로 대체' }, env.owner));   // 다른 저장이 남긴 [자동] 꼬리표
  const hRow = rowsOf(env, dorm).find((x) => x.id === H.id);
  env.asOwner((c) => c.updateRecord_('status_changes', hRow.id, { status: '유효', cancel_reason: '' }, env.owner));
  const again = save(env, ADMIN, i, p.expect);
  assert.strictEqual(again.ok, false); assert.ok(again.errors[0].message.includes('덜 끝났습니다'), JSON.stringify(again));
});

test('덮인 신청서(취소 기록)의 재시도는 덮은 행이 나중에 취소돼도 duplicate(U7)이고, "더 새 신청" 꼬리표를 대표 꼬리표로 착각하지 않는다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { dorm } = pick(env);
  const S1 = { studentId: dorm, chip: 'd_hall', requestedAt: '2027-03-03T10:30:00', docSubmitted: true };
  const r1 = env.call(ADMIN, 'saveMealChange', S1, env.call(ADMIN, 'previewMealChange', S1).expect);
  const S2 = { studentId: dorm, chip: 'd_gen', requestedAt: '2027-03-03T09:00:00', docSubmitted: true };
  const p2 = env.call(ADMIN, 'previewMealChange', S2);
  const r2 = env.call(ADMIN, 'saveMealChange', S2, p2.expect);
  assert.strictEqual(r2.superseded, true);
  env.asOwner((c) => c.updateRecord_('status_changes', r1.id, { status: '취소', cancel_reason: '잘못 입력' }, env.owner));   // 덮은 행이 사람 손으로 취소됨
  const again = env.call(ADMIN, 'saveMealChange', S2, p2.expect);
  assert.strictEqual(again.ok, true, JSON.stringify(again)); assert.strictEqual(again.duplicate, true);
});

test('L6: 사이 날(3/1) 학생 목록은 막 끝난 기간·다음 기간만 — 두 기간 뒤(3번째 기간)에만 등록된 학생은 없다', () => {
  const env = makeEnv('2027-03-01T20:00:00');
  env.asOwner((c) => c.appendRecord_('terms', { name: '2027 2학기', type: '학기', start_date: '2027-08-01', end_date: '2027-12-20', memo: '시험' }, env.owner));
  const t3 = env.rows('terms').find((t) => t.name === '2027 2학기');
  const st = env.asOwner((c) => c.appendRecord_('students', { student_no: '39989', name: '가짜후배', gender: '남', grade: '1', class_no: '1', number: '89', track: '', email: '', memo: '가짜' }, env.owner));
  env.asOwner((c) => c.appendRecord_('enrollments', { term_id: t3.id, student_id: st.id, teacher_email: HALL, veritas: 'FALSE', commute_type: '일반', end_type: '23:00', memo: '' }, env.owner));
  const ctx = env.call(HALL, 'getMealContext');
  assert.ok(!ctx.students.some((x) => x.id === st.id) && !ctx.viewStudents.some((x) => x.id === st.id), '두 기간 뒤에만 등록된 학생은 목록에 없다');
  assert.ok(ctx.students.length > 0);
});

/* ───────── 총괄 확인 후속 2(U7 상태 검사·B7 꼬리표 필터) ───────── */

function mealSaveOf(env, who, sid, chip, at, extra) {
  const mi = Object.assign({ studentId: sid, chip, requestedAt: at, docSubmitted: true }, extra || {});
  return env.call(who, 'saveMealChange', mi, env.call(who, 'previewMealChange', mi).expect);
}
const pendingRow = (env, sid, r) => env.asOwner((c) => c.appendRecord_('status_changes', Object.assign({ student_id: sid, effective_date_auto: r.effective_date, reason: '급식실 요청', doc_submitted: 'TRUE',
  linked_change_id: '', source: 'F7', status: '유효', memo: '', cancel_reason: '' }, r), env.owner));

test('U7: 덮인 신청서(취소 기록)의 재시도는, 덮은 행이 취소되어 이제 취소할 대기 행이 생겨도 거짓 "덜 끝났습니다"가 아니라 duplicate다(dup 상태 검사)', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { dorm } = pick(env);
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  const S1 = mealSaveOf(env, ADMIN, dorm, 'd_hall', '2027-03-03T10:30:00');
  const pS2 = env.call(ADMIN, 'previewMealChange', { studentId: dorm, chip: 'd_gen', requestedAt: '2027-03-03T09:00:00', docSubmitted: true });
  const S2 = env.call(ADMIN, 'saveMealChange', { studentId: dorm, chip: 'd_gen', requestedAt: '2027-03-03T09:00:00', docSubmitted: true }, pS2.expect);
  assert.strictEqual(S2.superseded, true);
  env.asOwner((c) => c.updateRecord_('status_changes', S1.id, { status: '취소', cancel_reason: '잘못 입력' }, env.owner));   // 덮은 행이 사람 손으로 취소됨
  pendingRow(env, dorm, { item: '석식', value: '미실시', requested_at: '2027-03-03T08:00:00', effective_date: '2027-03-20' });   // 이제 S2가 취소해야 할 대기 행이 있다
  const again = env.call(ADMIN, 'saveMealChange', { studentId: dorm, chip: 'd_gen', requestedAt: '2027-03-03T09:00:00', docSubmitted: true }, pS2.expect);
  assert.strictEqual(again.ok, true, JSON.stringify(again)); assert.strictEqual(again.duplicate, true);
});

test('B7: 끊긴 저장 S 뒤에 더 옛 신청서 Q가 S에 덮여 들어와도(Q의 꼬리표가 "[자동] <S> 더 새 신청"), S 재시도는 여전히 덜 끝났다고 한다', () => {
  const env = makeEnv('2027-03-03T12:00:00');
  const { dorm } = pick(env);
  env.asOwner((c) => c.bulkUpdateRecords_('status_changes', env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), env.owner));
  const X = pendingRow(env, dorm, { item: '석식', value: '미실시', requested_at: '2027-03-03T09:00:00', effective_date: '2027-03-20' });
  const si = { studentId: dorm, chip: 'd_hall', requestedAt: '2027-03-03T10:00:00', docSubmitted: true };
  const sp = env.call(ADMIN, 'previewMealChange', si);
  const S = env.call(ADMIN, 'saveMealChange', si, sp.expect);
  assert.strictEqual(S.cancelCount, 1, 'S가 대기 행 X를 취소한다');
  env.asOwner((c) => c.updateRecord_('status_changes', X.id, { status: '유효', cancel_reason: '' }, env.owner));   // 취소 쓰기가 끊긴 상황(꼬리표 없음)
  const Q = mealSaveOf(env, ADMIN, dorm, 'd_gen', '2027-03-03T08:00:00');   // 더 옛 종이 → S에 덮여 '[자동] <S> 더 새 신청'으로 기록
  assert.strictEqual(Q.superseded, true);
  assert.ok(rowsOf(env, dorm).some((x) => x.cancel_reason === '[자동] ' + S.id + ' 더 새 신청'), 'Q의 꼬리표는 S의 id로 시작한다');
  const again = env.call(ADMIN, 'saveMealChange', si, sp.expect);
  assert.strictEqual(again.ok, false); assert.ok(again.errors[0].message.includes('덜 끝났습니다'), JSON.stringify(again));
});
