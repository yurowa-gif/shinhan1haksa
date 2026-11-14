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

test('학년 일괄 퇴실 흐름(결정 74①·79, 방학 중): 3학년 저장 → 출석부·식수 집계에서 빠짐(조식 퇴실일, 석식·중식 미실시 규칙) → 다음 학기 명단 막힘 → 일괄 되돌리기 → 모두 원래대로', () => {
  const env = seededEnv('2027-07-21T10:00:00');   // 가짜 여름방학(7/19~8/13) 수요일 10:00
  env.asOwner((c) => c.seedFakeStage4());
  const h = helpers(env);
  const vac = env.rows('terms').find((t) => t.type === '방학');
  const EFF = '2027-07-23', AT = '2027-07-21T10:00:00';
  const input = { grade: '3', effectiveDate: EFF, requestedAt: AT, dinner: '중단', docSubmitted: true, reason: '' };
  const g3 = env.rows('enrollments').filter((e) => e.term_id === vac.id).map((e) => e.student_id)
    .filter((sid) => String(h.stu[sid].grade) === '3' && h.on(sid, '학사', EFF) === '입실');
  const items = ['학사', '기숙사', '조식', '석식', '중식'];
  const snapshot = (ymd) => g3.map((sid) => items.map((it) => h.on(sid, it, ymd)));
  const before = { eff: snapshot(EFF), mon: snapshot('2027-07-26') };
  const counts = (d) => { const r = h.call(ADMIN, 'getMealCounts', d).rows; return [r.find((x) => x.key === '3학년'), r.find((x) => x.key === '전체')]; };
  const [g3Before, allBefore] = counts(EFF);
  const [g3MonBefore] = counts('2027-07-26');
  assert.ok(g3.length >= 5 && g3Before.lunch > 0, '3학년 ' + g3.length + '명, 중식 ' + g3Before.lunch);
  const later = laterTerms(h);
  const uniq = g3.filter((sid) => env.rows('students').filter((s) => s.name === h.stu[sid].name).length === 1);

  // 저장
  const p = ok(h.call(ADMIN, 'previewBatchLeave', input), '일괄 미리보기');
  assert.strictEqual(p.count, g3.length);
  const s = ok(h.call(ADMIN, 'saveBatchLeave', input, p.expect), '일괄 저장');
  // 퇴실일(7/23 금): 학사 퇴실, 조식 미실시, 석식은 미실시 규칙의 날(수 11:30 전 → 다음 주 월요일 7/26)까지 그대로.
  // 중식은 행을 쓰지 않고(rules-api R19) 식수 집계가 같은 중단일 전날까지만 센다(결정 79) — 아래 집계로 본다
  const stop = env.as(ADMIN, (c) => c.mealEffectiveDate_('stop', AT, { leaveDate: EFF }).date);
  assert.strictEqual(stop, '2027-07-26');
  g3.forEach((sid, i) => {
    assert.strictEqual(h.on(sid, '학사', EFF), '퇴실');
    if (before.eff[i][2] === '실시') assert.strictEqual(h.on(sid, '조식', EFF), '미실시', '조식은 퇴실일');
    ['석식'].forEach((it, k) => {
      const was = before.eff[i][3 + k];
      if (was && was !== '미실시') {
        assert.strictEqual(h.on(sid, it, '2027-07-25'), was, it + ' 미실시 규칙의 날 전까지는 그대로');
        assert.strictEqual(h.on(sid, it, stop), '미실시', it + ' ' + stop + '부터 미실시(결정 35·79)');
      }
    });
  });
  const [g3After, allAfter] = counts(EFF);
  assert.deepStrictEqual([g3After.hall, g3After.breakfast], [0, 0], '식수 집계: 퇴실일부터 학사·조식 0');
  assert.strictEqual(g3After.lunch, g3Before.lunch, '중식은 중단일(7/26) 전까지 그대로 센다(결정 79)');
  assert.strictEqual(allAfter.hall, allBefore.hall - g3.length);
  const [g3Mon] = counts('2027-07-26');
  assert.deepStrictEqual([g3MonBefore.lunch > 0, g3Mon.lunch], [true, 0], '중단일(7/26)부터 중식 0');
  uniq.forEach((sid) => assert.strictEqual(h.sheetHas(EFF, sid), false, h.stu[sid].name + ' 출석부에서 빠짐'));
  assert.deepStrictEqual(bannedIn(h, later.fall, '2027-09-01', g3).sort(), g3.map((sid) => h.stu[sid].student_no).sort(), '일괄 퇴실도 자진 퇴실: 2학기 명단에서 막힘(결정 77①)');

  // 일괄 되돌리기 → 모두 원래대로
  const row = h.call(ADMIN, 'listBatchLeaves').items.find((x) => x.batchId === s.batchId);
  assert.deepStrictEqual([row.gradeText, row.live, row.canUndo], ['3학년', g3.length, true]);
  const pu = ok(h.call(ADMIN, 'previewBatchUndo', s.batchId), '되돌리기 미리보기');
  ok(h.call(ADMIN, 'undoBatchLeave', s.batchId, '가짜: 날짜 착오', pu.expect), '되돌리기');
  assert.deepStrictEqual({ eff: snapshot(EFF), mon: snapshot('2027-07-26') }, before, '학사·기숙사·조식·석식·중식 모두 원래대로');
  assert.deepStrictEqual(counts(EFF), [g3Before, allBefore], '식수 집계 원래대로');
  assert.strictEqual(counts('2027-07-26')[0].lunch, g3MonBefore.lunch, '7/26 중식도 원래대로');
  uniq.forEach((sid) => assert.strictEqual(h.sheetHas(EFF, sid), true, h.stu[sid].name + ' 출석부에 다시'));
  assert.deepStrictEqual(bannedIn(h, later.fall, '2027-09-01', g3), [], '되돌린 뒤 막힘 없음');
  env.expectDenied(HALL, 'batch.leave', 'previewBatchLeave', input);
});
