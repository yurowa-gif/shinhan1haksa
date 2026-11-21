/** C43 G2 그날 칸 같이 보기(getExceptionDayView) · G4 요청 기록 보기(getExceptionHistory). R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ATT = 'test.attendance@example.com', ADMIN = 'test.admin@example.com', TEACHER = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', DUTY = 'test.duty@example.com';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const mine = students.filter((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === TEACHER));
  const other = students.find((s) => enr.some((e) => e.student_id === s.id) && !mine.includes(s));
  const tab = () => env.rows('exceptions_' + term.id.slice(0, 8));
  return { env, term, students, mine, other, tab };
}
const nameOf = (x, email) => x.env.rows('users').find((u) => u.email.toLowerCase() === email).name;
const save = (x, who, over) => plain(x.env.call(who, 'saveException', Object.assign({ from: '2027-03-04', blocks: 'ALL', type: '병결' }, over)));
const fixedRow = (studentId, over) => Object.assign({ student_id: studentId, month: '2027-03', weekday: '목', blocks: 'ALL', code: '학', status: '확정', submitted_at: '2027-02-20T10:00:00', parent_agreed_at: '2027-02-21T10:00:00', teacher_confirmed_at: '2027-02-22T10:00:00' }, over || {});

test('G2 getExceptionDayView: 그날 고정 일정(학원)·이미 있는 다른 묶음의 특이사항을 한 줄로, 사유·이메일은 없다', () => {
  const x = makeEnv(), sid = x.mine[0].id;
  x.env.asOwner((c) => c.appendRecord_('fixed_schedules', fixedRow(sid), ADMIN));
  save(x, ATT, { studentId: sid, type: '가정사유(가족여행 포함)', blocks: '22:00-24:00', reason: '비밀 사유 010-9999-8888' });   // 같은 날 이미 있는 확정
  const req = save(x, TEACHER, { studentId: sid, blocks: '18:00-20:00', reason: '독감' });
  assert.strictEqual(req.ok, true, JSON.stringify(req));
  const v = plain(x.env.expectAllowed(ATT, 'getExceptionDayView', x.term.id, req.groupId));
  assert.strictEqual(v.ok, true); assert.strictEqual(v.days.length, 1); assert.strictEqual(v.moreDays, 0);
  const d = v.days[0];
  assert.strictEqual(d.dateKo, '3월 4일(목)');
  assert.deepStrictEqual(d.fixed, [{ code: '학', label: '학원', blocksText: '전체' }]);
  assert.deepStrictEqual(d.exceptions.map((e) => [e.type, e.status, e.blocksText]), [['가정사유(가족여행 포함)', '확정', '22:00-24:00']]);
  assert.ok(d.line.startsWith('3월 4일(목): ') && d.line.includes('고정 일정 학원(학) 전체') && d.line.includes('이미 있는 특이사항 가정사유(가족여행 포함) 22:00-24:00(확정)'), d.line);
  const all = JSON.stringify(v);
  assert.ok(!/@|비밀 사유|010-9999|독감/.test(all), '사유·이메일·번호 없음: ' + all);
});

test('G2: 겹치는 것이 없으면 "겹치는 일정 없음", 취소·요청 아닌 행·다른 요일 고정 일정은 세지 않고, 긴 묶음은 앞 7일만 + moreDays', () => {
  const x = makeEnv(), sid = x.mine[0].id;
  x.env.asOwner((c) => c.appendRecord_('fixed_schedules', fixedRow(sid, { weekday: '월' }), ADMIN));   // 3/4(목)에는 해당 없음
  const a = save(x, TEACHER, { studentId: sid });
  const none = plain(x.env.call(ATT, 'getExceptionDayView', x.term.id, a.groupId));
  assert.strictEqual(none.days[0].line, '3월 4일(목): 겹치는 일정 없음');
  const other = save(x, ATT, { studentId: sid, type: '병결' });   // 겹치는 확정(경고 → 확인)
  assert.strictEqual(other.needsConfirm, true);
  const ok = plain(x.env.call(ATT, 'saveException', { studentId: sid, from: '2027-03-04', blocks: 'ALL', type: '병결', confirmOverlap: true }));
  x.env.call(ATT, 'cancelException', x.term.id, ok.groupId, '잘못 넣음');
  assert.strictEqual(plain(x.env.call(ATT, 'getExceptionDayView', x.term.id, a.groupId)).days[0].exceptions.length, 0, '취소된 묶음은 세지 않는다');
  const long = save(x, ATT, { studentId: x.mine[1].id, from: '2027-03-11', to: '2027-03-24', type: '가정사유(가족여행 포함)' });
  const lv = plain(x.env.call(ATT, 'getExceptionDayView', x.term.id, long.groupId));
  assert.strictEqual(lv.days.length, 7); assert.strictEqual(lv.moreDays, 7);
});

test('G2 권한: 요청 처리와 같은 키(exception.confirm) — 학사 교사·담임·학생·학부모·근무표 담당은 거부, 없는 묶음은 안내', () => {
  const x = makeEnv(), sid = x.mine[0].id;
  const req = save(x, TEACHER, { studentId: sid });
  [TEACHER, HOMEROOM, STUDENT, PARENT, DUTY].forEach((who) => x.env.expectDenied(who, 'exception.confirm', 'getExceptionDayView', x.term.id, req.groupId));
  x.env.expectAllowed(ADMIN, 'getExceptionDayView', x.term.id, req.groupId);
  assert.strictEqual(plain(x.env.call(ATT, 'getExceptionDayView', x.term.id, 'no-such-group')).ok, false);
  assert.strictEqual(plain(x.env.call(ATT, 'getExceptionDayView', x.term.id, '')).ok, false);
});

test('G4 getExceptionHistory: 등록 → 확정 → 취소가 누가(이름)·언제·무엇(이전 → 새 값)·왜로, 전화번호·이메일은 가려진다', () => {
  const x = makeEnv(), sid = x.mine[0].id;
  const req = save(x, TEACHER, { studentId: sid, from: '2027-03-12', to: '2027-03-13', reason: '독감 보호자 010-1234-5678' });
  save(x, ATT, { studentId: x.other.id, from: '2027-03-12', reason: '다른 학생 기록' });   // 같은 탭의 다른 묶음
  assert.strictEqual(plain(x.env.call(ATT, 'confirmException', x.term.id, req.groupId, false)).ok, true);
  assert.strictEqual(plain(x.env.call(ATT, 'cancelException', x.term.id, req.groupId, '연락 010-5555-6666 로 확인, a@b.kr', '2027-03-13')).ok, true);
  const h = plain(x.env.expectAllowed(TEACHER, 'getExceptionHistory', x.term.id, req.groupId));
  assert.strictEqual(h.ok, true); assert.strictEqual(h.entries.length, 3, JSON.stringify(h.entries));
  const [c, f, k] = h.entries;
  assert.strictEqual(c.who, nameOf(x, TEACHER)); assert.ok(c.what.startsWith('요청 등록: 병결 · 전체 · 3월 12일(금) ~ 3월 13일(토)'), c.what);
  assert.ok(c.why.includes('독감') && c.why.includes('(번호 생략)') && !c.why.includes('1234'), c.why);
  assert.strictEqual(f.who, nameOf(x, ATT)); assert.strictEqual(f.what, '상태 요청 → 확정');
  assert.strictEqual(k.who, nameOf(x, ATT)); assert.ok(k.what.startsWith('상태 확정 → 취소') && k.what.includes('(3월 13일(토)만)'), k.what);
  assert.ok(k.why.includes('(번호 생략)') && k.why.includes('(이메일 생략)') && !/5555|a@b/.test(k.why), k.why);
  assert.ok(h.entries.every((e) => /^\d+월 \d+일\(.\) \d\d:\d\d$/.test(e.atKo)), JSON.stringify(h.entries.map((e) => e.atKo)));
  const all = JSON.stringify(h);
  assert.ok(!all.includes('@') && !all.includes('다른 학생 기록') && !all.includes(x.other.id) && !all.includes(sid), '이메일·다른 학생·id가 없다: ' + all);
});

test('G4 권한: 그 요청을 볼 수 있는 사람(보기 범위 또는 내가 낸 요청)만 — 다른 반 담임·학생·학부모·근무표 담당은 거부, 거부는 기록', () => {
  const x = makeEnv(), sid = x.mine[0].id;
  const req = save(x, TEACHER, { studentId: sid });
  [STUDENT, PARENT, DUTY].forEach((who) => x.env.expectDenied(who, 'exception.view', 'getExceptionHistory', x.term.id, req.groupId));
  [TEACHER, ATT, ADMIN].forEach((who) => x.env.expectAllowed(who, 'getExceptionHistory', x.term.id, req.groupId));
  const homeStudents = plain(x.env.call(HOMEROOM, 'getExceptionContext').students).map((s) => s.id);
  const outside = save(x, ATT, { studentId: x.students.find((s) => !homeStudents.includes(s.id) && x.env.rows('enrollments').some((e) => e.student_id === s.id)).id });
  assert.strictEqual(outside.ok, true);
  x.env.expectDenied(HOMEROOM, 'exception.view', 'getExceptionHistory', x.term.id, outside.groupId);
  assert.strictEqual(plain(x.env.call(ATT, 'getExceptionHistory', x.term.id, 'no-such-group')).ok, false);
  assert.strictEqual(x.env.rows('audit_log').filter((a) => a.action === 'denied:exception.view').length >= 1, true);
});

test('listExceptions 응답에 묶음마다 requestedAt(요청한 시각)이 있다 — 화면이 경과 시간을 보이는 데 쓴다(읽기 전용, 이메일 아님)', () => {
  const x = makeEnv();
  const req = save(x, TEACHER, { studentId: x.mine[0].id });
  const g = plain(x.env.call(ATT, 'listExceptions', { scope: 'pending' })).groups.find((q) => q.groupId === req.groupId);
  assert.ok(g, '요청 처리 목록에 있다');
  assert.strictEqual(g.requestedAt, '2027-03-03T20:00:00');
  assert.ok(!/@/.test(g.requestedAt));
  const mineList = plain(x.env.call(TEACHER, 'listExceptions', { scope: 'mine' })).groups.find((q) => q.groupId === req.groupId);
  assert.strictEqual(mineList.requestedAt, '2027-03-03T20:00:00');
});
