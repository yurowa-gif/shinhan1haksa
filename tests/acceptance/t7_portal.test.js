/**
 * T7 준비: 학생·학부모 가짜 계정 + '역할 × 공개 함수' 권한 행렬·유출 감시(docs/plan/stage7.md). 가짜 데이터만.
 * 계정: 학생 A·B(형제)·C, 학부모 P1(자녀 A·B)·P2(자녀 C) — tests/helpers/portal.js.
 * 지금(S7-0·C35·C36·C37 전) 확인하는 것:
 *   - 학생은 본인, 학부모는 자녀만: getStudentSummary로 남의 학생은 거부(denied:student.view), 본인·자녀는 허용
 *   - 모든 화면용 읽기 공개 함수 응답에 볼 수 없는 학생의 이름·학번·id, 가짜 전화번호, 상담 내용 표시가 없다
 * 기능 PR이 병합될 때마다 이 파일에 그 화면의 흐름·행렬 단언을 붙인다.
 */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { portalAccounts, visibleIds, plantPhones, portalMatrix, portalLeaks, summarize } = require('../helpers/portal');

const ADMIN = 'owner@example.com';
const TODAY = '2027-03-09';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: 'test.teacher@example.com', TEST_HOMEROOM_EMAIL: 'test.homeroom@example.com' });   // 학생·학부모 시험 계정 속성은 넣지 않는다(가짜 학생 1번 이메일을 그대로 쓴다)
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage2());
  env.asOwner((c) => c.seedFakeStage3());
  env.asOwner((c) => c.seedFakeStage4());
  return env;
}

/** 담당교사가 A·B·C에 상담 한 건씩([T7-CN-x] 표시). A만 학부모 공개 → 학부모에게도 날짜·교사만, 내용은 아무에게도 */
function writeCounsel(env, acc) {
  const term = env.as(ADMIN, (c) => c.getCurrentTerm_());
  return acc.students.map((s, i) => {
    const teacher = env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === s.id).teacher_email;
    const marker = '[T7-CN-' + 'ABC'[i] + ']';
    const r = env.call(teacher, 'saveCounselNote', { studentId: s.id, date: '2027-03-08', type: '생활', target: '학생', content: '가짜 상담 ' + marker, showToParent: i === 0 });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    return marker;
  });
}

test('T7 계정: 학생 A·B·C는 본인 학생 행에, 학부모 P1은 자녀 둘(A·B), P2는 자녀 하나(C)에 연결된다', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const users = Object.fromEntries(env.rows('users').map((u) => [u.email, u.roles]));
  acc.students.forEach((s) => assert.strictEqual(users[s.email], 'student', s.email));
  acc.parents.forEach((p) => assert.strictEqual(users[p.email], 'parent', p.email));
  assert.strictEqual(new Set(acc.all.map((x) => x.email)).size, 5, '이메일 다섯 개가 모두 다르다');
  assert.deepStrictEqual([visibleIds(acc, acc.A.email), visibleIds(acc, acc.P1.email), visibleIds(acc, acc.P2.email)], [[acc.A.id], [acc.A.id, acc.B.id], [acc.C.id]]);
  assert.ok(!env.rows('guardian_links').some((g) => g.student_id === acc.outsider.id && acc.parents.some((p) => p.email === g.parent_email)), '4번 학생은 누구와도 연결 안 됨');
});

test('T7 권한: getStudentSummary — 학생은 본인만, 학부모는 자녀만(남은 denied:student.view)', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  env.expectAllowed(acc.A.email, 'getStudentSummary', acc.A.id);
  env.expectDenied(acc.A.email, 'student.view', 'getStudentSummary', acc.B.id);   // 형제도 남
  env.expectDenied(acc.C.email, 'student.view', 'getStudentSummary', acc.A.id);
  env.expectAllowed(acc.P1.email, 'getStudentSummary', acc.A.id);
  env.expectAllowed(acc.P1.email, 'getStudentSummary', acc.B.id);
  env.expectDenied(acc.P1.email, 'student.view', 'getStudentSummary', acc.C.id);
  env.expectDenied(acc.P2.email, 'student.view', 'getStudentSummary', acc.A.id);
  env.expectDenied(acc.P2.email, 'student.view', 'getStudentSummary', acc.outsider.id);
});

test('T7 행렬·유출 감시: 학생·학부모 × 모든 화면용 읽기 공개 함수 응답에 다른 학생 이름·학번·id, 전화번호, 상담 내용이 없다', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const phones = plantPhones(env);
  const markers = writeCounsel(env, acc);
  const rows = portalMatrix(env, acc, { today: TODAY, termIds: env.rows('terms').map((t) => t.id) });
  assert.ok(rows.length > 200, '호출 ' + rows.length);
  const leaks = portalLeaks(env, rows, acc, { markers });
  assert.deepStrictEqual(leaks.slice(0, 20), [], '학생·학부모가 볼 수 없는 것이 응답에(' + leaks.length + '건)');
  // 행렬 표: 지금 학생·학부모가 답을 받는 함수(기능 PR이 들어오면 늘어난다)
  const m = summarize(rows);
  const okFns = (who) => Object.keys(m[who]).filter((fn) => m[who][fn] !== 'denied' && m[who][fn] !== 'error').sort();
  console.log('    번호 ' + phones.length + '개 심음, 호출 ' + rows.length + '번. 학생 A가 답을 받는 함수: ' + okFns(acc.A.email).join(', '));
  console.log('    학부모 P1이 답을 받는 함수: ' + okFns(acc.P1.email).join(', '));
});

test('T7 감시 도구 자체: 다른 학생 이름·학번·id·전화·표시는 잡고, 본인·자녀 것은 잡지 않는다', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const s = Object.fromEntries(env.rows('students').map((x) => [x.id, x]));
  const row = (who, text) => ({ who, fn: 'f', args: [], outcome: 'ok', text });
  const own = row(acc.P1.email, s[acc.A.id].name + ' ' + s[acc.B.id].student_no + ' ' + acc.B.id);
  assert.deepStrictEqual(portalLeaks(env, [own], acc), [], '자녀 둘은 허용');
  const bad = [row(acc.A.email, '형제 ' + s[acc.B.id].name), row(acc.P2.email, s[acc.A.id].student_no), row(acc.C.email, acc.outsider.id),
    row(acc.A.email, '010.0000.1234'), row(acc.A.email, '내용 [T7-CN-A]')];
  const leaks = portalLeaks(env, bad, acc, { markers: ['[T7-CN-A]'] });
  assert.strictEqual(leaks.length, bad.length, leaks.join('\n'));
});
