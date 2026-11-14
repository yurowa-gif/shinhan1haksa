/**
 * T5 흐름 시험: 임시 퇴실·자진 퇴실 재입실 제한(결정 70·77, R18·C31)과 즉시 퇴실 지정 시점(결정 78). 화면 공개 함수만, 가짜 데이터만.
 * 1) 건강상 임시 퇴실: 급식(조식 바로)·좌석·방·출석부에서 일반 퇴실과 같이 빠짐 → 그 사이 2OUT 확정은 '복귀 뒤에' 문구로 막힘
 *    → 복귀하면 확정 가능. 복귀가 늦으면 일반 퇴실로 바꾸고, 재입실 제한은 처음 임시 퇴실한 날부터.
 * 2) 자진 퇴실은 그 학기·다음 학기 명단에서 막히고 그다음 학기는 풀린다. 건강상 임시 퇴실·기숙사만 퇴실은 막지 않는다.
 * 3) 결정 78: 항목 A OUT 1 → A 즉시 퇴실 지정 → 기존 OUT은 1 그대로 → 지정 뒤 A 위반은 퇴실 대상 → 지정을 풀면 그 뒤 기록은 1, 지정 중 기록은 2 유지.
 *    지정 이력(OUT_INSTANT_SINCE)은 매일 백업 상태 JSON에 들어간다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com';

function seededEnv(now) {
  const env = createGasEnv({ owner: ADMIN, now: now || '2027-03-09T10:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = HALL;
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage3());
  env.strictLock = true;
  return env;
}
const ok = (r, what) => { assert.strictEqual(r.ok, true, what + ' ' + JSON.stringify(r).slice(0, 400)); return r; };
function helpers(env) {
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const call = (who, fn, ...a) => plain(env.call(who, fn, ...a));
  const on = (sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
  const move = (sid, type, at, eff, extra) => {
    const i = Object.assign({ studentId: sid, type, requestedAt: at, effectiveDate: eff, dinner: '중단', docSubmitted: true }, extra || {});
    return ok(call(ADMIN, 'saveMove', i, ok(call(ADMIN, 'previewMove', i), type + ' 미리보기').expect), type + ' 저장');
  };
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const stu = Object.fromEntries(env.rows('students').map((s) => [s.id, s]));
  const nameCount = {};
  Object.values(stu).forEach((s) => { nameCount[s.name] = (nameCount[s.name] || 0) + 1; });
  // 3/9에 학사·기숙사 입실, 그 뒤 예정된 학사 변경이 없고 이름이 겹치지 않는 학생(출석부는 이름으로 확인)
  const plain1 = (dorm) => enr.map((e) => e.student_id).filter((sid) => on(sid, '학사', '2027-03-09') === '입실' && (on(sid, '기숙사', '2027-03-09') === '입실') === dorm
    && nameCount[stu[sid].name] === 1 && !env.rows('status_changes').some((c) => c.student_id === sid && c.item === '학사' && c.effective_date > '2027-03-09'));
  const sheetHas = (d, sid) => JSON.stringify(call(ADMIN, 'getAttendanceSheet', d, true)).includes(stu[sid].name);
  const headOf = (sid) => env.rows('status_changes').filter((c) => c.student_id === sid && c.item === '학사' && c.value === '퇴실' && c.status === '유효')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  return { term, call, on, move, enr, stu, plain1, sheetHas, headOf };
}
const HEAD = '학번,학년,반,번호,이름,성별,계열,학사,기숙사,베리타스,조식,석식,통학구분,담당교사이메일,학생구글계정,비고';
function rosterText(h, ids) {
  return [HEAD].concat(ids.map((sid) => {
    const s = h.stu[sid], e = h.enr.find((x) => x.student_id === sid), dorm = e.commute_type !== '일반' ? 'O' : 'X';
    return [s.student_no, s.grade, s.class_no, s.number, s.name, s.gender, s.track, 'O', dorm, e.veritas === 'TRUE' ? 'O' : 'X', dorm, '학사', e.commute_type, e.teacher_email, s.email, ''].join(',');
  })).join('\n');
}
/** 뒤 운영 기간 만들기(관리자 화면) → {fall, nextSpring} */
function laterTerms(h) {
  const fall = ok(h.call(ADMIN, 'saveTerm', { name: '2027 2학기', type: '학기', start_date: '2027-09-01', end_date: '2027-12-31', memo: '가짜' }), '2학기');
  const spring = ok(h.call(ADMIN, 'saveTerm', { name: '2028 1학기', type: '학기', start_date: '2028-03-02', end_date: '2028-07-17', memo: '가짜' }), '2028 1학기');
  return { fall: fall.id, spring: spring.id };
}
const bannedIn = (h, termId, ymd, ids) => ok(h.call(ADMIN, 'previewRoster', rosterText(h, ids), { termId, ymd }), '명단 미리보기').lists.banned.map((b) => b.student_no);

test('임시 퇴실 흐름: 급식·좌석·방·출석부는 일반 퇴실처럼 빠짐 → 그 사이 2OUT 확정은 "복귀 뒤에"로 막힘 → 복귀하면 확정 가능', () => {
  const env = seededEnv();
  const h = helpers(env);
  const S = h.plain1(true)[0];
  assert.ok(S, '기숙사생');
  const roomed = (d) => h.call(HALL, 'getRoomData', h.term.id).rooms.some((r) => r.members.some((m) => m.id === S));
  const seated = () => h.call(HALL, 'getSeatData', h.term.id).spaces.flatMap((x) => x.cells).some((c) => c.studentId === S && c.reason !== '퇴실');
  assert.deepStrictEqual([roomed(), seated(), h.on(S, '조식', '2027-03-09')], [true, true, '실시'], '전: 방·좌석·조식');

  // 2OUT 대상 만들기: OUT 2건 + 담당교사 면담
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  ['2027-03-07T20:00', '2027-03-08T21:00'].forEach((at) => ok(h.call(ADMIN, 'saveOut', { studentId: S, occurredAt: at, ruleId: rule.id, detectedBy: '', memo: '가짜' }), 'OUT'));
  const teacher = h.enr.find((e) => e.student_id === S).teacher_email;
  ok(h.call(teacher, 'saveOutMeeting', { studentId: S, date: '2027-03-09', content: '가짜 면담' }), '면담');

  // 건강상 임시 퇴실: 3/10부터, 복귀 예정 3/20
  h.move(S, '학사 및 기숙사 임시 퇴실', '2027-03-09T10:00:00', '2027-03-10', { returnDate: '2027-03-20', reason: '가짜: 독감 입원' });
  env.setNow('2027-03-11T15:00:00');
  assert.deepStrictEqual([h.on(S, '학사', '2027-03-10'), h.on(S, '조식', '2027-03-10')], ['퇴실', '미실시'], '조식은 바로 끊김(일반 퇴실과 같음)');
  assert.strictEqual(roomed(), false, '방에서 빠짐(침대 비움)');
  assert.strictEqual(seated(), false, '좌석도 빈 자리로');
  assert.strictEqual(h.sheetHas('2027-03-11', S), false, '출석부에서 빠짐');
  const blocked = h.call(ADMIN, 'confirmOutDismissal', S);
  assert.strictEqual(blocked.ok, false, JSON.stringify(blocked));
  assert.ok(/임시 퇴실 중이라 복귀 뒤에 확정합니다/.test(JSON.stringify(blocked)), JSON.stringify(blocked));

  // 복귀(3/20 학사 입실) → 확정 가능
  env.setNow('2027-03-20T15:00:00');
  h.move(S, '학사 입실', '2027-03-19T10:00:00', '2027-03-20', { meals: { '조식': '실시', '석식': '학사 석식' } });
  assert.strictEqual(h.on(S, '학사', '2027-03-20'), '입실');
  assert.strictEqual(h.sheetHas('2027-03-20', S), true, '복귀일부터 출석부에');
  ok(h.call(ADMIN, 'confirmOutDismissal', S), '복귀 뒤에는 확정');
});

test('복귀 지연 → 일반 퇴실로 바꾸기: 재입실 제한은 처음 임시 퇴실한 날부터(다음 학기 명단에서 막힘, 그다음 학기는 풀림)', () => {
  const env = seededEnv();
  const h = helpers(env);
  const T = h.plain1(false)[0], other = h.plain1(false)[1];
  const later = laterTerms(h);
  h.move(T, '학사 임시 퇴실', '2027-03-09T10:00:00', '2027-03-10', { returnDate: '2027-03-20', reason: '가짜: 수술 회복' });
  env.setNow('2027-03-25T15:00:00');   // 복귀 예정일 지남
  const head = h.headOf(T);
  assert.deepStrictEqual(bannedIn(h, later.fall, '2027-09-01', [T, other]), [], '바꾸기 전(임시 퇴실)에는 막지 않는다');
  const pv = ok(h.call(HALL, 'previewConvertTempLeave', head.id), '바꾸기 미리보기');
  assert.ok(pv.lines[0].includes('3월 10일'), '처음 임시 퇴실한 날부터 센다: ' + pv.lines[0]);
  ok(h.call(HALL, 'convertTempLeave', head.id, pv.expect), '일반 퇴실로 바꾸기');
  const now = h.headOf(T);
  assert.notStrictEqual(now.id, head.id);
  assert.strictEqual(now.effective_date, '2027-03-10', '새 일반 퇴실 = 같은 적용일');
  assert.strictEqual(env.rows('status_changes').find((c) => c.id === head.id).status, '취소', '옛 임시 퇴실은 취소(지우지 않음)');
  const no = h.stu[T].student_no;
  assert.deepStrictEqual(bannedIn(h, later.fall, '2027-09-01', [T, other]), [no], '다음 학기(2학기) 명단에서 막힘');
  assert.deepStrictEqual(bannedIn(h, later.spring, '2028-03-02', [T, other]), [], '그다음 학기는 풀림');
});

test('재입실 제한: 자진 퇴실은 그 학기·다음 학기 막힘, 건강상 임시 퇴실·기숙사만 퇴실은 안 막힘(결정 70·77)', () => {
  const env = seededEnv();
  const h = helpers(env);
  const [V, W] = h.plain1(false), X = h.plain1(true)[0];
  const later = laterTerms(h);
  h.move(V, '학사 퇴실', '2027-03-09T10:00:00', '2027-03-10');                                                             // 자진 퇴실
  h.move(W, '학사 임시 퇴실', '2027-03-09T10:00:00', '2027-03-10', { returnDate: '2027-07-31', reason: '가짜: 장기 치료' });   // 건강상(학기 끝까지 못 돌아옴)
  h.move(X, '기숙사 퇴실', '2027-03-09T10:00:00', '2027-03-10');                                                            // 기숙사만
  env.setNow('2027-03-12T10:00:00');
  assert.deepStrictEqual([h.on(X, '학사', '2027-03-12'), h.on(X, '기숙사', '2027-03-12')], ['입실', '퇴실']);
  const ids = [V, W, X];
  // 그 학기(1학기 안, 추가 선발 명단 올리기) · 다음 학기 · 그다음 학기
  assert.deepStrictEqual(bannedIn(h, h.term.id, '2027-04-01', ids), [h.stu[V].student_no], '그 학기: 자진 퇴실만 막힘');
  assert.deepStrictEqual(bannedIn(h, later.fall, '2027-09-01', ids), [h.stu[V].student_no], '다음 학기: 자진 퇴실만 막힘');
  assert.deepStrictEqual(bannedIn(h, later.spring, '2028-03-02', ids), [], '그다음 학기: 모두 풀림');
});

test('즉시 퇴실 지정 시점(결정 78): 지정 전 OUT은 1 그대로 → 지정 뒤 위반은 퇴실 대상 → 해제 뒤 기록은 1·지정 중 기록은 2 유지, 지정 이력은 백업 상태에', () => {
  const env = seededEnv('2027-03-09T20:00:00');
  const h = helpers(env);
  const [P, Q] = h.plain1(false);
  const A = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  let k = 0;
  const tick = () => { k += 1; env.setNow('2027-03-09T20:' + String(10 + k).padStart(2, '0') + ':00'); };   // 지정 시각과 기록 시각을 나누려고 한 분씩
  const out = (sid, day) => { tick(); return ok(h.call(ADMIN, 'saveOut', { studentId: sid, occurredAt: (day || '2027-03-09') + 'T19:00', ruleId: A.id, detectedBy: '', memo: '가짜' }), 'OUT'); };   // 같은 날·같은 항목은 확인을 묻는다
  const count = (sid) => (h.call(ADMIN, 'listOuts', { scope: 'term' }).summary.find((s) => s.studentId === sid) || { count: 0 }).count;

  out(P);
  assert.strictEqual(count(P), 1, '지정 전 기록 = 1OUT');
  tick();
  assert.deepStrictEqual(h.call(ADMIN, 'setOutInstantRule', A.id, true), { ok: true, instant: true, changed: true });
  assert.strictEqual(count(P), 1, '이미 기록된 위반은 그대로 1OUT(소급 안 함)');
  out(Q);
  assert.strictEqual(count(Q), 2, '지정 뒤 A 위반 한 건 = 퇴실 대상');
  tick();
  assert.strictEqual(h.call(ADMIN, 'setOutInstantRule', A.id, false).instant, false);
  out(P, '2027-03-08');
  assert.strictEqual(count(P), 2, '해제 뒤 기록은 1 → P는 1 + 1');
  assert.strictEqual(count(Q), 2, '지정 중 기록은 2 그대로');

  // 지정 이력이 매일 백업 상태 JSON에
  const since = env.scriptProps.OUT_INSTANT_SINCE;
  assert.ok(since && since.includes(A.id), '지정 이력 ' + since);
  env.asOwner((c) => c.runBackupNow());
  const f = env.drive.filesIn(env.scriptProps.BACKUP_FOLDER_ID).find((x) => /앱상태\.json$/.test(x.name));
  assert.strictEqual(JSON.parse(f.content).values.OUT_INSTANT_SINCE, since, '백업 상태 = 지금 지정 이력');
});
