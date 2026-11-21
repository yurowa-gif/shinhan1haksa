/** C31 건강상 임시 퇴실(결정 70·77) 화면 연결: 입력·저장·예약어·재입실·일반 퇴실로 바꾸기·2OUT 확정 안내·홈 카드. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';          // admin + hall_teacher
const HALL = 'test.teacher@example.com';    // 담당 학생이 있는 학사 교사
const OTHER_T = 'fake.teacher1@example.com';

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
  const other = env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === OTHER_T).map((e) => e.student_id)[0];
  const dorm = own.find((s) => isDorm(env, s)), non = own.find((s) => !isDorm(env, s));
  assert.ok(dorm && non && other);
  return { dorm, non, other };
}
const move = (sid, type, at, eff, extra) => Object.assign({ studentId: sid, type, requestedAt: at, effectiveDate: eff, dinner: '중단', docSubmitted: false }, extra || {});
const temp = (sid, type, extra) => move(sid, type || '학사 임시 퇴실', '2027-03-03T15:00:00', '2027-03-05', Object.assign({ returnDate: '2027-03-20', reason: '독감 입원' }, extra || {}));
const prev = (env, who, i) => plain(env.call(who, 'previewMove', i));
const save = (env, who, i, expect) => plain(env.call(who, 'saveMove', i, expect));
const saveOk = (env, who, i) => { const p = prev(env, who, i); assert.strictEqual(p.ok, true, JSON.stringify(p)); const r = save(env, who, i, p.expect); assert.strictEqual(r.ok, true, JSON.stringify(r)); return r; };
const valueOn = (env, sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
const heads = (env, sid) => rowsOf(env, sid).filter((r) => r.source === 'F6' && !r.linked_change_id);
const ctx = (env, who, sid, ymd) => plain(env.call(who, 'getMoveContext', sid, ymd));

test('유형 칩: 학사 입실 학생에게는 임시 퇴실 두 가지가 보이고(기숙사생은 "학사 및 기숙사 임시 퇴실"만), 퇴실 상태 학생에게는 꺼져 있다', () => {
  const env = makeEnv();
  const { dorm, non } = pick(env);
  const on = (c, t) => c.types.find((x) => x.type === t);
  const a = ctx(env, HALL, non, '2027-03-04'), b = ctx(env, HALL, dorm, '2027-03-04');
  assert.deepStrictEqual([on(a, '학사 임시 퇴실').enabled, on(a, '학사 및 기숙사 임시 퇴실').enabled], [true, false]);
  assert.deepStrictEqual([on(b, '학사 임시 퇴실').enabled, on(b, '학사 및 기숙사 임시 퇴실').enabled], [false, true]);
  assert.match(on(b, '학사 임시 퇴실').hint, /학사 및 기숙사 임시 퇴실/);
  saveOk(env, HALL, temp(non));
  const c = ctx(env, HALL, non, '2027-03-10');
  assert.deepStrictEqual([on(c, '학사 임시 퇴실').enabled, on(c, '학사 및 기숙사 임시 퇴실').enabled], [false, false], '이미 퇴실 상태');
});

test('저장: 대표 행 reason "임시 퇴실"·memo "[임시] return:… 사유"(대표 행만), 급식·상태는 일반 퇴실과 같고, 복귀(학사 입실)는 막히지 않는다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveOk(env, HALL, temp(non));
  const head = heads(env, non).find((x) => x.id === r.id);
  assert.deepStrictEqual([head.item, head.value, head.reason, head.memo, head.effective_date, head.source], ['학사', '퇴실', '임시 퇴실', '[임시] return:2027-03-20 독감 입원', '2027-03-05', 'F6']);
  const linked = rowsOf(env, non).filter((x) => x.linked_change_id === r.id);
  assert.ok(linked.length >= 1 && linked.every((x) => x.memo === '' && x.source === 'F6'), '연결 행에는 memo가 없다');
  assert.strictEqual(valueOn(env, non, '학사', '2027-03-04'), '입실');
  assert.strictEqual(valueOn(env, non, '학사', '2027-03-05'), '퇴실');
  assert.strictEqual(valueOn(env, non, '석식', '2027-03-15'), '미실시', '일반 퇴실처럼 석식을 미실시 규칙대로 끊는다(결정 77②)');
  // 복귀: 지금의 학사 입실(재입실) — 일반 퇴실과 달리 막히지 않는다
  env.setNow('2027-03-21T10:00:00');
  const re = move(non, '학사 입실', '2027-03-21T09:00:00', '2027-03-21', { meals: { '조식': '실시', '석식': '학사 석식' } });
  const p = prev(env, HALL, re);
  assert.strictEqual(p.ok, true, JSON.stringify(p.errors));
});

test('기숙사생: "학사 및 기숙사 임시 퇴실"은 기숙사 퇴실 연결 행도 reason "임시 퇴실"이고 memo는 대표 행에만 있다', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const r = saveOk(env, HALL, temp(dorm, '학사 및 기숙사 임시 퇴실', { reason: '' }));
  const head = heads(env, dorm).find((x) => x.id === r.id);
  assert.deepStrictEqual([head.reason, head.memo], ['임시 퇴실', '[임시] return:2027-03-20']);
  const d = rowsOf(env, dorm).find((x) => x.linked_change_id === r.id && x.item === '기숙사');
  assert.deepStrictEqual([d.value, d.reason, d.memo], ['퇴실', '임시 퇴실', '']);
  assert.strictEqual(valueOn(env, dorm, '기숙사', '2027-03-05'), '퇴실');
});

test('복귀 예정일은 필수·퇴실일 뒤: 없음·형식 오류·퇴실일 이하는 거부하고 아무것도 쓰지 않는다 (미리보기와 저장이 같다)', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const before = env.rows('status_changes').length;
  for (const [bad, re] of [['', /복귀 예정일/], ['2027-13-40', /복귀 예정일/], ['2027-03-05', /뒤여야/], ['2027-03-01', /뒤여야/]]) {
    const i = temp(non, '학사 임시 퇴실', { returnDate: bad });
    const p = prev(env, HALL, i);
    assert.strictEqual(p.ok, false); assert.ok(p.errors.some((e) => e.field === 'returnDate' && re.test(e.message)), JSON.stringify(p.errors));
    assert.strictEqual(save(env, HALL, i, 'x').ok, false);
  }
  const noDinner = temp(non, '학사 임시 퇴실', { dinner: '' });
  assert.ok(prev(env, HALL, noDinner).errors.some((e) => e.field === 'dinner'), '석식 선택은 일반 퇴실과 같이 필수');
  assert.strictEqual(env.rows('status_changes').length, before);
});

test('예약어: 일반 입력의 사유가 "임시 퇴실"·"[임시]…"이면 거부(임시 퇴실 표시를 흉내 내지 못한다), 임시 퇴실 유형에서도 같다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  for (const reason of ['임시 퇴실', ' 임시  퇴실 ', '[임시] return:2027-04-01']) {
    const g = prev(env, HALL, move(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05', { reason }));
    assert.ok(g.errors.some((e) => e.field === 'reason' && /임시 퇴실/.test(e.message)), reason + JSON.stringify(g.errors));
    const t = prev(env, HALL, temp(non, '학사 임시 퇴실', { reason }));
    assert.ok(t.errors.some((e) => e.field === 'reason'), reason);
    assert.strictEqual(save(env, HALL, move(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05', { reason }), 'x').ok, false);
  }
  assert.strictEqual(heads(env, non).filter((x) => x.reason === '임시 퇴실').length, 0);
  assert.strictEqual(prev(env, HALL, move(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05', { reason: '가정 사정' })).ok, true, '다른 사유는 된다');
});

test('같은 신청을 다시 보내면 한 번만 저장(duplicate), 복귀 예정일이 다르면 다른 내용으로 보고 거부, 일반 퇴실 신청과는 같은 신청이 아니다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const i = temp(non);
  const a = saveOk(env, HALL, i);
  const p = prev(env, HALL, i);
  const again = save(env, HALL, i, p.expect);
  assert.deepStrictEqual([again.ok, again.duplicate, again.id], [true, true, a.id]);
  const n = env.rows('status_changes').length;
  const diff = save(env, HALL, Object.assign({}, i, { returnDate: '2027-03-25' }), 'x');
  assert.strictEqual(diff.ok, false); assert.match(diff.errors[0].message, /복귀 예정일이 다른/);
  assert.strictEqual(env.rows('status_changes').length, n);
  // 같은 날짜·같은 신청 일시의 일반 퇴실 신청은 임시 퇴실의 "이미 저장"으로 넘기지 않는다(다른 신청서)
  const normal = save(env, HALL, move(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'), 'x');
  assert.notStrictEqual(normal.duplicate, true);
  assert.strictEqual(normal.ok, false);
  assert.strictEqual(env.rows('status_changes').length, n);
});

test('권한: 담당이 아닌 학생의 임시 퇴실은 거부 + denied:status.edit, 근무표 담당·담임·학생·학부모는 status.list에서 거부', () => {
  const env = makeEnv();
  const { other } = pick(env);
  const ty = isDorm(env, other) ? '학사 및 기숙사 임시 퇴실' : '학사 임시 퇴실';
  env.expectDenied(HALL, 'status.edit', 'saveMove', temp(other, ty), 'x');
  for (const who of ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com']) env.expectDenied(who, 'status.list', 'saveMove', temp(other, ty), 'x');
  env.expectDenied('test.homeroom@example.com', 'status.edit', 'saveMove', temp(other, ty), 'x');   // 담임은 역할은 통과하지만 학생 범위(status.edit)에서 거부
  assert.strictEqual(heads(env, other).filter((x) => x.reason === '임시 퇴실').length, 0);
});

test('2OUT 퇴실 확정은 임시 퇴실 유형을 받지 않는다(일반 퇴실 계열만)', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const p = prev(env, ADMIN, Object.assign(temp(non), { outDismissal: true }));
  assert.ok(p.errors.some((e) => e.field === 'type'), JSON.stringify(p.errors));
});

/* ───── 재입실 막힘(R18) — 화면이 일반 퇴실 뒤 재입실을 거부하고 임시 퇴실 뒤는 허용 ───── */

test('일반 퇴실 뒤 재입실은 막히고(자진 퇴실 문구), 임시 퇴실 뒤는 막히지 않는다', () => {
  const env = makeEnv();
  const { non, dorm } = pick(env);
  saveOk(env, HALL, move(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  saveOk(env, HALL, temp(dorm, '학사 및 기숙사 임시 퇴실'));
  env.setNow('2027-03-12T10:00:00');
  const re = (sid) => move(sid, '학사 입실', '2027-03-12T09:00:00', '2027-03-12', { meals: { '조식': '실시', '석식': '학사 석식' } });
  const blocked = prev(env, HALL, re(non));
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.errors.some((e) => /3월 5일\(금\)에 퇴실해/.test(e.message) && /다시 들어올 수 없습니다/.test(e.message)), JSON.stringify(blocked.errors));
  assert.strictEqual(prev(env, HALL, re(dorm)).ok, true);
});

/* ───── 일반 퇴실로 바꾸기(77④) ───── */

test('일반 퇴실로 바꾸기: 한 번에 새 일반 퇴실(같은 적용일·같은 신청 일시)이 생기고 임시 퇴실 행은 취소(지우지 않음)되며 막힘이 처음 임시 퇴실한 날부터 센다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const t = saveOk(env, HALL, temp(non, '학사 임시 퇴실', { docSubmitted: true }));
  env.setNow('2027-03-25T10:00:00');   // 복귀 예정일(3/20)이 지났다
  const p = plain(env.call(HALL, 'previewConvertTempLeave', t.id));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.ok(/처음 임시 퇴실한 날\(3월 5일/.test(p.lines[0]) && /다시 들어올 수 없습니다/.test(p.lines[0]), p.lines[0]);
  const before = env.rows('status_changes').length, audits = env.rows('audit_log').length;
  const r = plain(env.call(HALL, 'convertTempLeave', t.id, p.expect));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const rows = rowsOf(env, non);
  const old = rows.find((x) => x.id === t.id);
  assert.strictEqual(old.status, '취소', '지우지 않고 취소');
  assert.strictEqual(old.cancel_reason, '[자동] ' + r.id + ' 일반 퇴실로 바꿈', '새 대표 행 id가 꼬리표(그 신청을 취소하면 임시 퇴실이 되살아난다)');
  const nh = rows.find((x) => x.id === r.id);
  assert.deepStrictEqual([nh.item, nh.value, nh.effective_date, nh.requested_at, nh.reason, nh.memo, nh.doc_submitted, nh.source, nh.status],
    ['학사', '퇴실', '2027-03-05', '2027-03-03T15:00:00', '독감 입원', '', 'TRUE', 'F6', '유효'], '같은 적용일·같은 신청 일시·사람이 쓴 사유 이어받음·서류 표시 그대로');
  assert.ok(rows.filter((x) => x.linked_change_id === t.id).every((x) => x.status === '취소'), '옛 연결 행도 취소');
  assert.ok(rows.filter((x) => x.linked_change_id === r.id).length >= 1, '새 연결 행(석식 정리)');
  assert.strictEqual(valueOn(env, non, '석식', '2027-03-15'), '미실시', '석식 중단일이 같다');
  assert.ok(env.rows('status_changes').length > before && env.rows('audit_log').length > audits);
  // 이제 일반 퇴실이므로 재입실이 막히고, 막힘은 3/5부터 센다(3/25에도 막힘)
  const re = prev(env, HALL, move(non, '학사 입실', '2027-03-25T09:00:00', '2027-03-25', { meals: { '조식': '실시', '석식': '학사 석식' } }));
  assert.strictEqual(re.ok, false);
  assert.ok(re.errors.some((e) => /다시 들어올 수 없습니다/.test(e.message)));
});

test('일반 퇴실로 바꾸기 거부: 임시 퇴실이 아닌 행·이미 복귀한 학생·없는 id·권한 없음 — 아무것도 쓰지 않는다, 다시 바꾸면 거부', () => {
  const env = makeEnv();
  const { non, dorm, other } = pick(env);
  const normal = saveOk(env, HALL, move(non, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05'));
  const t = saveOk(env, HALL, temp(dorm, '학사 및 기숙사 임시 퇴실'));
  const n = env.rows('status_changes').length;
  const msg = (r) => (r.errors[0] || {}).message;
  assert.match(msg(plain(env.call(HALL, 'previewConvertTempLeave', normal.id))), /임시 퇴실 신청서가 아닙니다/);
  assert.match(msg(plain(env.call(HALL, 'previewConvertTempLeave', 'no-such'))), /찾을 수 없습니다/);
  assert.strictEqual(plain(env.call(HALL, 'convertTempLeave', normal.id, 'x')).ok, false);
  // 복귀한 학생(재입실 뒤)은 바꿀 수 없다
  env.setNow('2027-03-21T10:00:00');
  saveOk(env, HALL, move(dorm, '학사 입실', '2027-03-21T09:00:00', '2027-03-21', { meals: { '조식': '실시', '석식': '학사 석식' } }));
  const n2 = env.rows('status_changes').length;
  assert.match(msg(plain(env.call(HALL, 'previewConvertTempLeave', t.id))), /지금 이 임시 퇴실 중이 아닙니다/);
  assert.strictEqual(plain(env.call(HALL, 'convertTempLeave', t.id, 'x')).ok, false);
  assert.strictEqual(env.rows('status_changes').length, n2);
  assert.ok(n2 > n);
  // 담당이 아닌 교사·다른 역할
  const env2 = makeEnv();
  const o = pick(env2);
  const t2 = saveOk(env2, ADMIN, temp(o.other, isDorm(env2, o.other) ? '학사 및 기숙사 임시 퇴실' : '학사 임시 퇴실'));
  env2.expectDenied(HALL, 'status.edit', 'previewConvertTempLeave', t2.id);
  env2.expectDenied(HALL, 'status.edit', 'convertTempLeave', t2.id, 'x');
  for (const who of ['test.duty@example.com', 'test.student@example.com', 'test.parent@example.com']) env2.expectDenied(who, 'status.list', 'convertTempLeave', t2.id, 'x');
  env2.expectDenied('test.homeroom@example.com', 'status.edit', 'convertTempLeave', t2.id, 'x');
  assert.strictEqual(rowsOf(env2, o.other).find((x) => x.id === t2.id).status, '유효');
  const ok = plain(env2.call(ADMIN, 'previewConvertTempLeave', t2.id));
  assert.strictEqual(ok.ok, true, JSON.stringify(ok));
  assert.strictEqual(plain(env2.call(ADMIN, 'convertTempLeave', t2.id, ok.expect)).ok, true);
  assert.strictEqual(plain(env2.call(ADMIN, 'convertTempLeave', t2.id, ok.expect)).ok, false, '이미 바뀐 뒤에는 거부');
});

test('일반 퇴실로 바꾸기: 확인 뒤 기록이 바뀌면 stale, 기숙사생은 "학사 및 기숙사 퇴실"로 바뀌고 기숙사 퇴실도 일반 퇴실로 이어진다', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const t = saveOk(env, HALL, temp(dorm, '학사 및 기숙사 임시 퇴실'));
  const p = plain(env.call(HALL, 'previewConvertTempLeave', t.id));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.strictEqual(plain(env.call(HALL, 'convertTempLeave', t.id, p.expect + 'x')).stale, true);
  const r = plain(env.call(HALL, 'convertTempLeave', t.id, p.expect));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const linked = rowsOf(env, dorm).filter((x) => x.linked_change_id === r.id);
  const d = linked.find((x) => x.item === '기숙사');
  assert.deepStrictEqual([d.value, d.reason, d.status], ['퇴실', '학사 및 기숙사 퇴실', '유효'], '기숙사 퇴실 연결 행은 일반 퇴실 사유');
  assert.strictEqual(valueOn(env, dorm, '기숙사', '2027-03-06'), '퇴실');
});

/* ───── 목록·홈·2OUT 확정 ───── */

test('listStudentStatus: 지금 임시 퇴실 중인 대표 행에만 tempLeave(복귀 예정·지남·바꾸기 버튼)가 나오고, 라벨은 "학사 임시 퇴실"이다', () => {
  const env = makeEnv();
  const { non, other } = pick(env);
  const t = saveOk(env, HALL, temp(non));
  env.setNow('2027-03-06T10:00:00');   // 적용일이 지난 뒤(대기 중 행에는 버튼을 붙이지 않는다)
  const l = plain(env.call(HALL, 'listStudentStatus', non, '2027-03-05'));
  const h = l.history.find((x) => x.id === t.id);
  assert.strictEqual(h.what, '학사 임시 퇴실');
  assert.deepStrictEqual([h.tempLeave.overdue, h.tempLeave.canConvert, h.tempLeave.returnKo.includes('3월 20일')], [false, true, true]);
  assert.ok(l.history.filter((x) => x.id !== t.id).every((x) => !x.tempLeave));
  env.setNow('2027-03-25T10:00:00');
  assert.strictEqual(plain(env.call(HALL, 'listStudentStatus', non, '2027-03-05')).history.find((x) => x.id === t.id).tempLeave.overdue, true);
  // 담당이 아닌 교사는 학생 기록 자체를 볼 수 없다(status.view) — 관리자는 바꾸기 버튼이 있다
  assert.strictEqual(plain(env.call(ADMIN, 'listStudentStatus', non, '2027-03-05')).history.find((x) => x.id === t.id).tempLeave.canConvert, true);
  void other;
});

test('홈 카드: 복귀 예정일이 지난 임시 퇴실만 "복귀 예정일 지남"(담당교사는 내 담당만, 관리자는 전체), 아직 안 지났거나 복귀한 학생은 없다', () => {
  const env = makeEnv();
  const { non, other } = pick(env);
  saveOk(env, HALL, temp(non));
  saveOk(env, ADMIN, temp(other, isDorm(env, other) ? '학사 및 기숙사 임시 퇴실' : '학사 임시 퇴실', { returnDate: '2027-03-30' }));
  const home = (who, role) => plain(env.call(who, 'getHomeData', role)).food.tempLeave;
  assert.deepStrictEqual([home(HALL, 'hall_teacher').n, home(ADMIN, 'admin').n], [0, 0], '아직 복귀 예정일 전');
  env.setNow('2027-03-25T10:00:00');
  const t = home(HALL, 'hall_teacher');
  assert.strictEqual(t.n, 1);
  assert.deepStrictEqual([t.list[0].daysLate, t.list[0].returnKo.includes('3월 20일')], [5, true]);
  assert.strictEqual(home(ADMIN, 'admin').n, 1, '다른 학생은 아직 3/30 전');
  env.setNow('2027-04-02T10:00:00');
  assert.strictEqual(home(ADMIN, 'admin').n, 2);
  assert.strictEqual(home(HALL, 'hall_teacher').n, 1, '담당교사는 내 담당만');
  // 복귀하면 사라진다
  saveOk(env, HALL, move(non, '학사 입실', '2027-04-02T09:00:00', '2027-04-02', { meals: { '조식': '실시', '석식': '학사 석식' } }));
  assert.strictEqual(home(ADMIN, 'admin').n, 1);
  assert.ok(!JSON.stringify(plain(env.call(HALL, 'getHomeData', 'hall_teacher')).food.tempLeave).includes('example.com'));
});

test('2OUT 퇴실 대상이 임시 퇴실 중이면 확정을 막고 "임시 퇴실 중이라 복귀 뒤에 확정합니다": confirmOutDismissal·listOuts(canConfirm false)·saveMove(2OUT) 모두', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const term = term2(env);
  const tab = 'violations_' + term.id.slice(0, 8);
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const add = (at) => env.asOwner((c) => c.appendRecord_(tab, { term_id: term.id, student_id: non, occurred_at: at, rule_id: rule.id, rule_name: rule.name, memo: '', detected_by: HALL, entered_by: HALL,
    status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  add('2027-03-02T20:00:00'); add('2027-03-03T19:00:00');
  assert.strictEqual(plain(env.call(HALL, 'saveOutMeeting', { studentId: non, date: '2027-03-03', content: '학부모와 통화' })).ok, true);
  assert.strictEqual(plain(env.call(ADMIN, 'confirmOutDismissal', non)).ok, true, '임시 퇴실 전에는 확정할 수 있다');
  saveOk(env, HALL, temp(non));
  env.setNow('2027-03-10T10:00:00');
  const c = plain(env.call(ADMIN, 'confirmOutDismissal', non));
  assert.strictEqual(c.ok, false); assert.strictEqual(c.tempLeave, true);
  assert.match(c.reason, /임시 퇴실 중이라 복귀 뒤에 확정합니다\(복귀 예정 3월 20일/);
  const card = plain(env.call(ADMIN, 'listOuts', { scope: 'targets' })).summary.find((x) => x.studentId === non);
  assert.ok(card, '퇴실 대상 탭에 보인다(이미 퇴실로 취급하지 않는다)');
  assert.deepStrictEqual([card.state, card.canConfirm, !!card.left, !!card.tempLeave && card.tempLeave.returnKo.includes('3월 20일')], ['recorded', false, false, true]);
  const s = plain(env.call(ADMIN, 'saveMove', move(non, '학사 퇴실', '2027-03-10T09:00:00', '2027-03-11', { outDismissal: true }), 'x'));
  assert.strictEqual(s.ok, false); assert.ok(s.errors.some((e) => /임시 퇴실 중이라 복귀 뒤에 확정합니다/.test(e.message)), JSON.stringify(s));
});

test('퇴실 취소(결정 59)는 임시 퇴실 대표 행에도 그대로 되고, 입퇴실 확인서 비고에 임시 퇴실·복귀 예정이 나온다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const t = saveOk(env, HALL, temp(non));
  const model = env.as(HALL, (c) => { const head = c.findById_('status_changes', t.id); return c.inoutConfirmModel_(head, [], { name: 'x' }); });
  assert.match(plain(model).remark, /^임시 퇴실\(복귀 예정 3월 20일/);
  const p = plain(env.call(HALL, 'previewCancelMove', t.id));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.strictEqual(plain(env.call(HALL, 'cancelMove', t.id, '잘못 입력', p.expect)).ok, true);
  assert.strictEqual(valueOn(env, non, '학사', '2027-03-06'), '입실');
});
