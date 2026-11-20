/**
 * T7 준비: 학생·학부모 가짜 계정 + '역할 × 공개 함수' 권한 행렬·유출 감시(docs/plan/stage7.md). 가짜 데이터만.
 * 계정: 학생 A·B(형제)·C, 학부모 P1(자녀 A·B)·P2(자녀 C) — tests/helpers/portal.js.
 * 지금(S7-0·C35·C36·C37 전) 확인하는 것:
 *   - 학생은 본인, 학부모는 자녀만: getStudentSummary로 남의 학생은 거부(denied:student.view), 본인·자녀는 허용
 *   - 모든 화면용 읽기 공개 함수 응답에 볼 수 없는 학생의 이름·학번·id, 가짜 전화번호, 상담 내용 표시가 없다
 * 기능 PR이 병합될 때마다 이 파일에 그 화면의 흐름·행렬 단언을 붙인다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
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

test('T7 권한 키 행렬(facility.*, S7-0): 쓰기는 학생 본인 것만, 보기·누적은 학생·학부모 모두 거부 — 학부모는 자녀 것도 대신 쓰지 못한다', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const can = (email, action, ctx) => { try { env.as(email, (c) => c.requirePermission_(action, ctx)); return true; } catch (e) { if (!/권한이 없습니다/.test(e.message)) throw e; return false; } };
  const targets = [acc.A, acc.B, acc.C, acc.outsider];
  const got = {}, want = {};
  for (const x of acc.all) {
    const mine = visibleIds(acc, x.email), isStudent = acc.students.includes(x);
    got[x.email] = targets.map((t) => can(x.email, 'facility.write', { studentId: t.id })).concat([can(x.email, 'facility.view', {}), can(x.email, 'facility.report', {})]);
    want[x.email] = targets.map((t) => isStudent && mine.includes(t.id)).concat([false, false]);
  }
  assert.deepStrictEqual(got, want, '[write A, write B, write C, write 4번, view, report]');
});

test('T7 포털(C36): getPortalStudent는 학생 본인·학부모 자녀만(남은 denied:portal.view), 학부모에게 상담은 날짜·교사만(내용 없음), 학생 화면에는 상담 칸이 없다', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const markers = writeCounsel(env, acc);
  const a = env.expectAllowed(acc.A.email, 'getPortalStudent', acc.A.id);
  assert.strictEqual(a.viewer, 'student');
  assert.ok(!('counsel' in a), '학생 화면에는 상담 칸 없음');
  env.expectDenied(acc.A.email, 'portal.view', 'getPortalStudent', acc.B.id);
  env.expectDenied(acc.P1.email, 'portal.view', 'getPortalStudent', acc.C.id);
  env.expectDenied(acc.P2.email, 'portal.view', 'getPortalStudent', acc.outsider.id);
  const pa = env.expectAllowed(acc.P1.email, 'getPortalStudent', acc.A.id);
  const pb = env.expectAllowed(acc.P1.email, 'getPortalStudent', acc.B.id);
  assert.strictEqual(pa.viewer, 'parent');
  assert.ok(JSON.stringify(pa.counsel).includes('2027-03-08'), 'A는 학부모 공개 → 날짜가 보인다 ' + JSON.stringify(pa.counsel));
  assert.ok(!JSON.stringify(pb.counsel || []).includes('2027-03-08'), 'B는 비공개 → 안 보인다');
  markers.forEach((m) => assert.ok(!JSON.stringify([a, pa, pb]).includes(m), '상담 내용 없음 ' + m));
});

/** 그날 근무 한 칸을 넣는다(가짜 근무표는 1월뿐) → 근무교사 이메일 */
function putDuty(env, ymd, email) {
  env.asOwner((c) => c.bulkAppend_('duty_slots', [{ date: ymd, slot: '단독', end_time: '23:00', original_email: email, actual_email: email, swapped_at: '', swapped_by: '', status: '유효', memo: '가짜 T7' }], ADMIN));
  return email;
}

test('T7 시설 일지 흐름(C35): 쓰기(남의 id를 넣어도 본인 행) → 같은 시간 겹침은 확인 뒤에만 → 같은 일지 두 번 거부 → 남의 일지 취소는 denied → 본인 취소(행은 남고 감사)', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const f = env.expectAllowed(acc.A.email, 'getFacilityForm');
  const facility = f.names[0];
  // 함께 쓴 학생: 이름으로 찾아 표식(handle)만 받는다
  const found = env.call(acc.A.email, 'searchFacilityStudents', acc.B.name.slice(0, 2), TODAY);
  const hit = found.results.find((r) => r.name === acc.B.name);
  assert.ok(hit, '형제 B를 찾는다 ' + JSON.stringify(found));
  const base = { facility, date: TODAY, start: '19:00', end: '20:00', companions: [hit.handle], purpose: '가짜 모둠 공부' };
  const s1 = env.call(acc.A.email, 'saveFacilityLog', Object.assign({ studentId: acc.B.id }, base));   // 남의 id를 넣어도 무시
  assert.strictEqual(s1.ok, true, JSON.stringify(s1));
  const tab = 'facility_logs_' + s1.termId.slice(0, 8);
  const row = () => env.rows(tab).find((r) => r.id === s1.id);
  assert.deepStrictEqual([row().student_id, row().companions, row().status], [acc.A.id, acc.B.id, '유효'], '본인 행, 함께 쓴 학생은 id로 저장');
  // C가 같은 시설·겹치는 시간 → 확인 요청, 확인하면 저장(overlapped)
  const over = Object.assign({}, base, { start: '19:30', end: '20:30', companions: [] });
  const c1 = env.call(acc.C.email, 'saveFacilityLog', over);
  assert.deepStrictEqual([c1.ok, c1.needsConfirm], [false, true], JSON.stringify(c1));
  const c2 = env.call(acc.C.email, 'saveFacilityLog', Object.assign({ confirmOverlap: true }, over));
  assert.deepStrictEqual([c2.ok, c2.overlapped], [true, true], JSON.stringify(c2));
  // 같은 일지 두 번
  assert.strictEqual(env.call(acc.A.email, 'saveFacilityLog', base).ok, false);
  // 남의 일지 취소: B·학부모는 거부, 행은 그대로
  env.expectDenied(acc.B.email, 'facility.write', 'cancelFacilityLog', s1.termId, s1.id);
  env.expectDenied(acc.P1.email, 'facility.write', 'cancelFacilityLog', s1.termId, s1.id);
  assert.strictEqual(row().status, '유효');
  // 본인 취소: 행은 남고 취소·감사
  assert.strictEqual(env.call(acc.A.email, 'cancelFacilityLog', s1.termId, s1.id).ok, true);
  assert.deepStrictEqual([row().status, !!row().cancel_reason], ['취소', true]);
  assert.ok(env.rows('audit_log').some((a) => a.row_id === s1.id), '감사 기록');
});

test('T7 시설 일지 권한·유출: 함께 쓴 학생 찾기 응답은 이름·표식뿐, 그날 일지는 근무교사(오늘)·관리자만, 근무 아닌 교사·학생·학부모는 거부, 누적은 관리자만', () => {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const found = env.call(acc.A.email, 'searchFacilityStudents', acc.C.name.slice(0, 1), TODAY);
  assert.ok(found.results.length > 0);
  found.results.forEach((r) => assert.deepStrictEqual(Object.keys(r).sort(), ['handle', 'name']));
  const text = JSON.stringify(found);
  const students = env.rows('students');
  students.forEach((s) => { assert.ok(!text.includes(s.id) && !text.includes(s.student_no) && !text.includes(s.email), '찾기 응답에 id·학번·이메일 없음'); });
  assert.ok(!/010[-. ]?0000/.test(text));
  assert.ok(!found.results.some((r) => r.name === acc.A.name), '본인은 빼고');
  // 학부모·다른 역할은 찾기도 못 한다
  env.expectDenied(acc.P1.email, 'facility.write', 'searchFacilityStudents', '김', TODAY);

  const s = env.call(acc.A.email, 'saveFacilityLog', { facility: env.call(acc.A.email, 'getFacilityForm').names[0], date: TODAY, start: '19:00', end: '20:00', companions: [], purpose: '가짜' });
  assert.strictEqual(s.ok, true, JSON.stringify(s));
  const duty = putDuty(env, TODAY, 'fake.teacher2@example.com');
  const day = env.expectAllowed(duty, 'getFacilityDay', TODAY);
  assert.ok(day.ok && JSON.stringify(day).includes(acc.A.name), '근무교사는 오늘 일지를 본다');
  const yesterday = env.call(duty, 'getFacilityDay', '2027-03-08');
  assert.strictEqual(yesterday.ok, false, '근무교사도 다른 날은 못 본다');
  const offDuty = env.rows('users').find((u) => String(u.roles).split(',').includes('hall_teacher') && u.email !== duty && !String(u.roles).includes('admin')).email;
  const before = env.rows('audit_log').length;
  const off = env.call(offDuty, 'getFacilityDay', TODAY);
  assert.strictEqual(off.ok, false, '근무 아닌 교사는 못 본다 ' + offDuty);
  assert.ok(env.rows('audit_log').slice(before).some((a) => a.action === 'denied:facility.view'), '거부 기록');
  assert.strictEqual(env.call(ADMIN, 'getFacilityDay', '2027-03-08').ok, true, '관리자는 어느 날이든');
  for (const x of acc.all) env.expectDenied(x.email, 'facility.view', 'getFacilityDay', TODAY);
  env.expectAllowed(ADMIN, 'getFacilityReport', { from: '2027-03-01', to: TODAY });
  env.expectDenied(duty, 'facility.report', 'getFacilityReport', { from: '2027-03-01', to: TODAY });
  env.expectDenied(acc.A.email, 'facility.report', 'getFacilityReport', { from: '2027-03-01', to: TODAY });
});

/* ───────────── 시간표(C37, F9) ───────────── */
const MAR = [{ weekday: '수', blocks: '18:30-20:00', code: '학' }], APR = [{ weekday: '금', blocks: '18:30-20:00', code: '가' }];
function ttEnv() {
  const env = seededEnv();
  const acc = portalAccounts(env);
  const term = env.as(ADMIN, (c) => c.getCurrentTerm_());
  const teacherOf = (sid) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === sid).teacher_email;
  const fixed = (sid, ymd) => plain(env.as(ADMIN, (c) => c.effectiveFixedRows_(c.readAll_('fixed_schedules'), sid, ymd))).map((r) => r.weekday + ' ' + r.code);
  const status = (sid, month) => env.as(ADMIN, (c) => c.ttMonthState_(c.readAll_('fixed_schedules'), sid, month).status);
  const ok = (r, what) => { assert.strictEqual(r.ok, true, what + ' ' + JSON.stringify(r)); return r; };
  return { env, acc, term, teacherOf, fixed, status, ok };
}

test('T7 시간표 권한: 학생은 본인 것만 냄(남의 id를 넣어도 본인 행), 학부모는 자기 자녀만 동의·동의하지 않음, 담당 아닌 교사·학생·학부모는 확인·돌려보냄 거부', () => {
  const { env, acc, teacherOf, status, ok } = ttEnv();
  env.setNow('2027-03-26T10:00:00');   // 4월 시간표 제출 기간
  ok(env.call(acc.A.email, 'submitTimetable', { studentId: acc.B.id, month: '2027-04', entries: APR }), 'A 제출');
  assert.deepStrictEqual([status(acc.A.id, '2027-04'), status(acc.B.id, '2027-04')], ['제출', ''], 'A 본인 행만 생기고 B는 그대로');
  ok(env.call(acc.C.email, 'submitTimetable', { month: '2027-04', entries: APR }), 'C 제출');
  env.expectDenied(acc.P2.email, 'timetable.agree', 'agreeTimetable', acc.A.id, '2027-04');
  env.expectDenied(acc.P1.email, 'timetable.agree', 'agreeTimetable', acc.C.id, '2027-04');
  env.expectDenied(acc.P1.email, 'timetable.agree', 'declineTimetable', acc.C.id, '2027-04', '가짜');
  env.expectDenied(acc.P2.email, 'timetable.parent', 'getChildTimetable', acc.A.id);
  for (const s of acc.students) env.expectDenied(s.email, 'timetable.agree', 'agreeTimetable', s.id, '2027-04');   // 학생 스스로 동의 못 함
  assert.deepStrictEqual([status(acc.A.id, '2027-04'), status(acc.C.id, '2027-04')], ['제출', '제출'], '거부된 동의는 상태를 바꾸지 않는다');
  ok(env.call(acc.P1.email, 'agreeTimetable', acc.A.id, '2027-04'), 'P1 동의');
  const other = env.rows('users').find((u) => String(u.roles).split(',').includes('hall_teacher') && !String(u.roles).includes('admin') && u.email !== teacherOf(acc.A.id)).email;
  env.expectDenied(other, 'timetable.confirm', 'confirmTimetable', acc.A.id, '2027-04');
  env.expectDenied(other, 'timetable.confirm', 'returnTimetable', acc.A.id, '2027-04', '가짜 사유');
  for (const x of acc.all) env.expectDenied(x.email, 'timetable.confirm', 'confirmTimetable', acc.A.id, '2027-04');
  assert.strictEqual(status(acc.A.id, '2027-04'), '동의');
});

test('T7 시간표 흐름: 제출 → 동의 → 담당교사 확인(enrollments.end_type 그대로), 출석부는 확정 전까지 지난달 확정 시간표 / 제출 → 동의하지 않음 → 다시 냄은 처음부터(동의부터 다시)', () => {
  const { env, acc, teacherOf, fixed, status, ok } = ttEnv();
  const T = teacherOf(acc.A.id);
  // 3월 시간표를 확정해 둔다(2월 제출 기간)
  env.setNow('2027-02-26T10:00:00');
  ok(env.call(acc.A.email, 'submitTimetable', { month: '2027-03', entries: MAR }), '3월 제출');
  ok(env.call(acc.P1.email, 'agreeTimetable', acc.A.id, '2027-03'), '3월 동의');
  ok(env.call(teacherOf(acc.A.id), 'confirmTimetable', acc.A.id, '2027-03'), '3월 확인');
  // 4월: 제출 → 동의 → 확인
  env.setNow('2027-03-26T10:00:00');
  const enrBefore = env.rows('enrollments').filter((e) => e.student_id === acc.A.id).map((e) => e.end_type);
  ok(env.call(acc.A.email, 'submitTimetable', { month: '2027-04', entries: APR }), '4월 제출');
  assert.deepStrictEqual(fixed(acc.A.id, '2027-04-05'), ['수 학'], '확정 전: 4월 출석부는 3월 확정 시간표');
  assert.strictEqual(env.call(T, 'confirmTimetable', acc.A.id, '2027-04').ok, false, '동의 없이 확인 안 됨');
  ok(env.call(acc.P1.email, 'agreeTimetable', acc.A.id, '2027-04'), '4월 동의');
  assert.deepStrictEqual(fixed(acc.A.id, '2027-04-05'), ['수 학'], '동의만으로는 아직 3월 것');
  ok(env.call(T, 'confirmTimetable', acc.A.id, '2027-04'), '4월 확인');
  assert.deepStrictEqual([status(acc.A.id, '2027-04'), fixed(acc.A.id, '2027-04-05'), fixed(acc.A.id, '2027-03-31')], ['확정', ['금 가'], ['수 학']], '확정 뒤 그 달부터 새 시간표');
  assert.deepStrictEqual(env.rows('enrollments').filter((e) => e.student_id === acc.A.id).map((e) => e.end_type), enrBefore, '종료 유형은 그대로');

  // 4월: C 제출 → P2 동의하지 않음 → 돌려보냄 → C 다시 냄 → 다시 동의부터
  ok(env.call(acc.C.email, 'submitTimetable', { month: '2027-04', entries: APR }), 'C 제출');
  ok(env.call(acc.P2.email, 'declineTimetable', acc.C.id, '2027-04', '가짜: 토요일 확인 필요'), 'P2 동의하지 않음');
  assert.strictEqual(status(acc.C.id, '2027-04'), '반려');
  assert.ok(env.rows('audit_log').some((a) => a.action === 'timetable:return' && a.created_by === acc.P2.email), '돌려보낸 사람·사유는 감사 기록에');
  ok(env.call(acc.C.email, 'submitTimetable', { month: '2027-04', entries: MAR }), 'C 다시 냄');
  assert.strictEqual(status(acc.C.id, '2027-04'), '제출', '다시 내면 제출부터');
  assert.strictEqual(env.call(teacherOf(acc.C.id), 'confirmTimetable', acc.C.id, '2027-04').ok, false, '동의 없이 확인 안 됨');
  ok(env.call(acc.P2.email, 'agreeTimetable', acc.C.id, '2027-04'), 'P2 다시 동의');
  ok(env.call(teacherOf(acc.C.id), 'confirmTimetable', acc.C.id, '2027-04'), 'C 확인');
  assert.deepStrictEqual(fixed(acc.C.id, '2027-04-05'), ['수 학'], '다시 낸 내용으로 확정');
});
