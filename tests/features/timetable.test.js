/** C37 F9 시간표(학생 제출 → 학부모 동의 → 담당교사 확인): R4 gas-fakes. 가짜 데이터만. 상태는 R23이 정하고 여기서는 권한·저장·응답을 본다. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', HALL = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', T2 = 'fake.t2@example.com';
const OPEN = '2027-03-26T10:00:00', CLOSED = '2027-03-10T10:00:00', MONTH = '2027-04';
const M_WHY = 'ZZ-사유-표식';

function makeEnv() {
  const env = createGasEnv({ now: OPEN });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.addUser(T2, '가짜교사2', 'hall_teacher'));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const me = students.find((s) => s.email === STUDENT);
  const kidIds = env.rows('guardian_links').filter((g) => g.parent_email === PARENT).map((g) => g.student_id);
  const stranger = students.find((s) => !kidIds.includes(s.id) && s.id !== me.id);
  const teacherOf = (s) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === s.id).teacher_email;
  const x = { env, term, me, stranger, teacherOf, teacher: teacherOf(me) };
  x.rows = () => env.rows('fixed_schedules').filter((r) => r.student_id === me.id && r.month === MONTH);
  x.live = () => x.rows().filter((r) => r.status !== '취소');
  return x;
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const ENTRIES = [{ weekday: '월', blocks: '18:30-20:00', code: '학' }, { weekday: '토', blocks: '09:00-12:00', code: '가' }];
const submit = (x, o) => call(x, STUDENT, 'submitTimetable', Object.assign({ month: MONTH, entries: ENTRIES }, o || {}));
const status = (x) => (x.live()[0] || {}).status || '';

test('권한표: 시간표 화면 함수는 역할·학생 범위를 서버가 정한다(학생=본인, 학부모=연결된 자녀, 교사=담당 학생, 관리자) — 나머지는 denied 기록', () => {
  const x = makeEnv();
  x.env.expectAllowed(STUDENT, 'getTimetableContext');
  for (const who of [PARENT, HALL, ADMIN, ATT, DUTY, HOMEROOM]) x.env.expectDenied(who, 'timetable.mine', 'getTimetableContext');
  for (const who of [PARENT, HALL, ADMIN, HOMEROOM]) x.env.expectDenied(who, 'timetable.submit', 'submitTimetable', { month: MONTH, entries: ENTRIES });
  for (const who of [STUDENT, HALL, ADMIN, ATT, DUTY, HOMEROOM]) x.env.expectDenied(who, 'timetable.parent', 'getChildTimetable', x.me.id);
  x.env.expectDenied(PARENT, 'timetable.parent', 'getChildTimetable', x.stranger.id);
  for (const who of [STUDENT, HALL, ADMIN, ATT, HOMEROOM]) x.env.expectDenied(who, 'timetable.agree', 'agreeTimetable', x.me.id, MONTH);
  x.env.expectDenied(PARENT, 'timetable.agree', 'agreeTimetable', x.stranger.id, MONTH);
  x.env.expectDenied(PARENT, 'timetable.agree', 'declineTimetable', x.stranger.id, MONTH, '');
  for (const who of [STUDENT, PARENT, ATT, DUTY, HOMEROOM]) x.env.expectDenied(who, 'timetable.list', 'listTimetables');
  for (const who of [HALL, ADMIN]) x.env.expectAllowed(who, 'listTimetables');
  for (const who of [STUDENT, PARENT, ATT, HOMEROOM, T2]) {
    x.env.expectDenied(who, 'timetable.view', 'getTimetableEntry', x.me.id, MONTH);
    x.env.expectDenied(who, 'timetable.confirm', 'confirmTimetable', x.me.id, MONTH, '');
    x.env.expectDenied(who, 'timetable.confirm', 'returnTimetable', x.me.id, MONTH, '사유입니다');
  }
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-03-26', slot: '21:30조', end_time: '21:30', original_email: T2, actual_email: T2, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  x.env.expectDenied(T2, 'timetable.view', 'getTimetableEntry', x.me.id, MONTH);   // 그날 근무교사여도 담당 학생이 아니면 못 본다(noDuty)
  x.env.expectDenied(T2, 'timetable.confirm', 'confirmTimetable', x.me.id, MONTH, '');
  x.env.expectAllowed(x.teacher, 'getTimetableEntry', x.me.id, MONTH);
  x.env.expectAllowed(ADMIN, 'getTimetableEntry', x.me.id, MONTH);
  assert.strictEqual(x.rows().length, 0, '거부된 호출은 행을 만들지 않는다');
});

test('학생 제출: 제출 기간에 낸 표가 행으로 남고(학·가, 정규 표기), 상태가 화면에 보인다, 응답에 이메일 없음', () => {
  const x = makeEnv();
  const c0 = call(x, STUDENT, 'getTimetableContext');
  assert.deepStrictEqual([c0.ok, c0.window.open, c0.window.month, c0.view.status, c0.hasPrev], [true, true, MONTH, '', false]);
  assert.ok(c0.view.slots['월'].length >= 1 && c0.view.slots['토'].length >= 1, '요일별 블록(①②…)');
  const r = submit(x);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(x.live().map((q) => [q.weekday, q.blocks, q.code, q.status]).sort(), [['월', '18:30-20:00', '학', '제출'], ['토', '09:00-12:00', '가', '제출']]);
  const c1 = call(x, STUDENT, 'getTimetableContext');
  assert.deepStrictEqual([c1.view.status, c1.view.entries.length, !!c1.view.submittedKo], ['제출', 2, true]);
  assert.ok(!('endType' in c1.view), '종료 시각은 F9에서 다루지 않는다');
  assert.ok(!/@/.test(textOf(c1)), '이메일 없음');
});

test('제출 거부: 기간 밖·다른 달·겹치는 칸 — 행이 늘지 않는다. 다시 내면 옛 행은 취소로 남고 동의부터 다시', () => {
  const x = makeEnv();
  const bad = (o) => { const r = submit(x, o); assert.strictEqual(r.ok, false, JSON.stringify(o)); return r.errors[0].message; };
  bad({ month: '2027-05' });
  bad({ entries: [{ weekday: '월', blocks: '18:30-20:00', code: '학' }, { weekday: '월', blocks: '19:00-21:00', code: '가' }] });
  bad({ entries: [{ weekday: '월', blocks: '18:30-20:00', code: '없음' }] });
  bad({ month: 'x' });
  assert.strictEqual(x.rows().length, 0);
  x.env.setNow(CLOSED);
  assert.strictEqual(bad({}).length > 0, true, '제출 기간이 아니면 거부');
  assert.strictEqual(x.rows().length, 0);
  x.env.setNow(OPEN);
  assert.strictEqual(submit(x).ok, true);
  assert.strictEqual(call(x, PARENT, 'agreeTimetable', x.me.id, MONTH).ok, true);
  assert.strictEqual(status(x), '동의');
  assert.strictEqual(submit(x, { entries: [ENTRIES[0]] }).ok, true, '다시 제출');
  assert.deepStrictEqual([status(x), x.live().length, x.rows().filter((q) => q.status === '취소').length], ['제출', 1, 2], '동의 뒤 다시 내면 동의부터, 옛 행은 취소로 남는다');
});

test('학부모 동의: 연결된 자녀만, 제출일 때만(두 번째는 거부). 동의하지 않으면 사유(선택)와 함께 학생에게 돌려보내진다', () => {
  const x = makeEnv();
  assert.deepStrictEqual(call(x, PARENT, 'getChildTimetable', x.me.id).none, true, '낸 시간표 없음');
  assert.strictEqual(call(x, PARENT, 'agreeTimetable', x.me.id, MONTH).ok, false, '제출 전에는 동의할 수 없다');
  submit(x);
  const v = call(x, PARENT, 'getChildTimetable', x.me.id);
  assert.deepStrictEqual([v.view.status, v.canAgree, v.view.month], ['제출', true, MONTH]);
  assert.strictEqual(call(x, PARENT, 'declineTimetable', x.me.id, MONTH, '가'.repeat(101)).ok, false);
  assert.strictEqual(call(x, PARENT, 'declineTimetable', x.me.id, MONTH, M_WHY).ok, true);
  assert.strictEqual(status(x), '반려');
  const c = call(x, STUDENT, 'getTimetableContext');
  assert.deepStrictEqual([c.view.returned.by, c.view.returned.reason, c.view.status], ['parent', M_WHY, '반려']);
  assert.ok(!/@/.test(textOf(c)));
  assert.strictEqual(call(x, PARENT, 'agreeTimetable', x.me.id, MONTH).ok, false, '돌려보낸 시간표는 동의할 수 없다');
  assert.strictEqual(submit(x).ok, true, '고쳐서 다시 내기');
  assert.strictEqual(call(x, STUDENT, 'getTimetableContext').view.returned, null);
  assert.strictEqual(call(x, PARENT, 'declineTimetable', x.me.id, MONTH, '').ok, true, '사유 없이도 된다');
  assert.strictEqual(call(x, STUDENT, 'getTimetableContext').view.returned.reason, '');
  assert.strictEqual(call(x, PARENT, 'declineTimetable', x.me.id, MONTH, '').ok, false, '이미 돌려보냄');
  submit(x);
  assert.strictEqual(call(x, PARENT, 'agreeTimetable', x.me.id, MONTH).ok, true);
  assert.strictEqual(call(x, PARENT, 'declineTimetable', x.me.id, MONTH, '동의한 뒤에는 돌려보낼 수 없다').ok, false, '동의한 뒤에는 부모가 돌려보낼 수 없다(교사 몫)');
  assert.strictEqual(status(x), '동의');
});

test('담당교사 확인: 동의 뒤에만, 확인하면 확정(종료 시각은 그대로) + 출석부가 그 달부터 읽는다. 다시 확인·동의 없이 확인은 거부', () => {
  const x = makeEnv();
  submit(x);
  assert.strictEqual(call(x, x.teacher, 'confirmTimetable', x.me.id, MONTH, '').ok, false, '동의 전');
  call(x, PARENT, 'agreeTimetable', x.me.id, MONTH);
  assert.strictEqual(status(x), '동의');
  const e0 = call(x, x.teacher, 'getTimetableEntry', x.me.id, MONTH).view;
  assert.deepStrictEqual([e0.status, !!e0.agreedKo], ['동의', true]);
  const enr = () => x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.me.id);
  const endBefore = enr().end_type;
  assert.strictEqual(call(x, x.teacher, 'confirmTimetable', x.me.id, MONTH).ok, true);
  assert.strictEqual(status(x), '확정');
  assert.strictEqual(enr().end_type, endBefore, '확인해도 지금 달 출석부의 종료 유형은 바뀌지 않는다(교사가 학생 정보 화면에서 고친다)');
  const fixed = x.env.as(ADMIN, (c) => c.effectiveFixedRows_(c.readAll_('fixed_schedules'), x.me.id, '2027-04-05'));
  assert.deepStrictEqual(plain(fixed).map((r) => [r.weekday, r.code]).sort(), [['월', '학'], ['토', '가']], '출석부가 읽는 시간표');
  assert.strictEqual(plain(x.env.as(ADMIN, (c) => c.effectiveFixedRows_(c.readAll_('fixed_schedules'), x.me.id, '2027-03-30'))).length, 0, '시작 전에는 적용 안 됨');
  assert.strictEqual(call(x, x.teacher, 'confirmTimetable', x.me.id, MONTH, '').ok, false, '이미 확정');
  assert.strictEqual(call(x, ADMIN, 'returnTimetable', x.me.id, MONTH, '확정 뒤 돌려보내기').ok, false, '확정은 돌려보낼 수 없다');
});

test('돌려보내기: 담당교사는 동의 뒤 확인 단계에서만, 사유 필수(2~100자), 학생에게 돌려보낸 사람 이름·사유가 보이고 이메일은 없다. 관리자도 할 수 있다', () => {
  const x = makeEnv();
  submit(x);
  assert.strictEqual(call(x, x.teacher, 'returnTimetable', x.me.id, MONTH, M_WHY).ok, false, '부모 동의 전에는 교사가 돌려보내지 않는다(부모 몫)');
  assert.strictEqual(status(x), '제출');
  call(x, PARENT, 'agreeTimetable', x.me.id, MONTH);
  for (const why of ['', '가', '가'.repeat(101)]) assert.strictEqual(call(x, x.teacher, 'returnTimetable', x.me.id, MONTH, why).ok, false, why.length + '자');
  assert.strictEqual(status(x), '동의');
  assert.strictEqual(call(x, x.teacher, 'returnTimetable', x.me.id, MONTH, M_WHY).ok, true);
  const c = call(x, STUDENT, 'getTimetableContext');
  const tname = x.env.rows('users').find((u) => u.email === x.teacher).name;
  assert.deepStrictEqual([c.view.status, c.view.returned.by, c.view.returned.byName, c.view.returned.reason], ['반려', 'teacher', tname, M_WHY]);
  assert.ok(!textOf(c).includes(x.teacher));
  assert.strictEqual(call(x, x.teacher, 'returnTimetable', x.me.id, MONTH, '또 돌려보냄').ok, false, '이미 돌려보냄');
  submit(x);
  call(x, PARENT, 'agreeTimetable', x.me.id, MONTH);
  assert.strictEqual(call(x, ADMIN, 'returnTimetable', x.me.id, MONTH, '관리자가 돌려보냄').ok, true);
  assert.strictEqual(status(x), '반려');
});

test('지난달 그대로 가져오기: 앞 달 학·가 행을 돌려줄 뿐 저장하지 않는다(내야 낸다). 앞 달이 없으면 거부', () => {
  const x = makeEnv();
  assert.strictEqual(call(x, STUDENT, 'getPreviousTimetable', MONTH).ok, false);
  x.env.asOwner((c) => c.appendRecord_('fixed_schedules', { student_id: x.me.id, month: '2027-03', weekday: '수', blocks: '18:30-20:00', code: '학', submitted_at: '2027-02-26T10:00:00', parent_agreed_at: '', teacher_confirmed_at: '', status: '확정' }, ADMIN));
  const before = x.env.rows('fixed_schedules').length;
  const r = call(x, STUDENT, 'getPreviousTimetable', MONTH);
  assert.deepStrictEqual([r.ok, r.entries, r.monthKo], [true, [{ weekday: '수', blocks: '18:30-20:00', code: '학' }], '3월']);
  assert.strictEqual(x.env.rows('fixed_schedules').length, before, '저장하지 않는다');
  assert.strictEqual(call(x, STUDENT, 'getTimetableContext').hasPrev, true);
  x.env.expectDenied(PARENT, 'timetable.mine', 'getPreviousTimetable', MONTH);
});

test('교사 목록: 담당 학생만(다른 교사는 안 보임, 관리자는 전체), 상태 이름·할 일·미제출 수·마감까지 날수, 이메일 없음', () => {
  const x = makeEnv();
  const l0 = call(x, x.teacher, 'listTimetables');
  assert.deepStrictEqual([l0.ok, l0.month, l0.deadline.open, l0.deadline.daysLeft], [true, MONTH, true, 5]);
  const mine = l0.items.find((i) => i.id === x.me.id);
  assert.deepStrictEqual([mine.status, mine.label, mine.todo], ['', '제출 안 함', true]);
  assert.strictEqual(l0.counts.missing, l0.counts.total, '아무도 안 냄');
  assert.ok(!l0.items.some((i) => i.id === x.stranger.id && x.teacherOf(x.stranger) !== x.teacher));
  submit(x);
  assert.strictEqual(call(x, x.teacher, 'listTimetables').items.find((i) => i.id === x.me.id).label, '동의 기다림');
  call(x, PARENT, 'agreeTimetable', x.me.id, MONTH);
  const l1 = call(x, x.teacher, 'listTimetables');
  assert.deepStrictEqual([l1.items.find((i) => i.id === x.me.id).label, l1.counts.missing], ['확인 필요', l1.counts.total - 1]);
  assert.strictEqual(call(x, T2, 'listTimetables').items.some((i) => i.id === x.me.id), false, '담당이 아닌 교사에게는 없다');
  assert.strictEqual(call(x, ADMIN, 'listTimetables').items.some((i) => i.id === x.me.id), true);
  assert.ok(!/@/.test(textOf(l1)));
  const home = call(x, x.teacher, 'getHomeData', 'hall_teacher').timetable;
  assert.deepStrictEqual([home.todo, home.open, home.month], [1, true, MONTH]);
  assert.ok(!('timetable' in call(x, ADMIN, 'getHomeData', 'admin')) || call(x, ADMIN, 'getHomeData', 'admin').timetable === null);
});

test('홈 할 일: 학생은 기간에 안 냈으면 submit·돌려보내졌으면 returned, 학부모는 동의할 게 있으면 agree, 아니면 없다', () => {
  const x = makeEnv();
  const todo = (who, id) => call(x, who, 'getPortalStudent', id).todo;
  assert.strictEqual(todo(STUDENT, x.me.id).kind, 'submit');
  assert.strictEqual(todo(PARENT, x.me.id), null);
  submit(x);
  assert.strictEqual(todo(STUDENT, x.me.id), null);
  assert.deepStrictEqual([todo(PARENT, x.me.id).kind, todo(PARENT, x.me.id).month], ['agree', MONTH]);
  call(x, PARENT, 'agreeTimetable', x.me.id, MONTH);
  assert.strictEqual(todo(PARENT, x.me.id), null);
  call(x, x.teacher, 'returnTimetable', x.me.id, MONTH, '다시 확인해 주세요');   // 부모가 동의한 뒤라 담당교사가 돌려보낼 수 있다
  assert.strictEqual(todo(STUDENT, x.me.id).kind, 'returned');
  x.env.setNow(CLOSED);
  assert.strictEqual(todo(STUDENT, x.me.id), null, '기간이 아니면 할 일 칸이 없다');
});

test('유출 감시: 시간표 응답 어디에도 다른 학생·이메일·사유 표지 밖의 정보가 없다(자녀 화면에 다른 학생 없음)', () => {
  const x = makeEnv();
  submit(x);
  const others = x.env.rows('students').filter((s) => s.id !== x.me.id).map((s) => s.name);
  const seen = [call(x, STUDENT, 'getTimetableContext'), call(x, PARENT, 'getChildTimetable', x.me.id), call(x, x.teacher, 'getTimetableEntry', x.me.id, MONTH)];
  for (const r of seen) {
    const text = textOf(r);
    others.forEach((n) => assert.ok(!text.includes(n), '다른 학생 이름 ' + n));
    assert.ok(!/@/.test(text));
  }
});

/* ───── C38 담당교사 대신 입력(결정 84, R24 teacherEnter) ───── */
const enterPre = (x, who, o) => call(x, who, 'previewTimetableEnter', x.me.id, (o && o.month) || MONTH, (o && o.entries) || ENTRIES);
const enter = (x, who, o) => {
  const pre = enterPre(x, who, o);
  return call(x, who, 'enterTimetableForStudent', x.me.id, (o && o.month) || MONTH, (o && o.entries) || ENTRIES, (o && o.token) || pre.token);
};

test('대신 입력 권한표: 담당교사(자기 학생)·관리자만, 학생·학부모·출결·담임·담당 아닌 교사·그날 근무교사는 denied 기록, 행 불변', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-03-26', slot: '21:30조', end_time: '21:30', original_email: T2, actual_email: T2, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  const tok = call(x, x.teacher, 'getTimetableEntry', x.me.id, MONTH).view.token;
  for (const who of [STUDENT, PARENT, ATT, HOMEROOM, T2, DUTY]) {
    x.env.expectDenied(who, 'timetable.enter', 'previewTimetableEnter', x.me.id, MONTH, ENTRIES);
    x.env.expectDenied(who, 'timetable.enter', 'enterTimetableForStudent', x.me.id, MONTH, ENTRIES, tok);
  }
  x.env.expectAllowed(x.teacher, 'previewTimetableEnter', x.me.id, MONTH, ENTRIES);
  x.env.expectAllowed(ADMIN, 'previewTimetableEnter', x.me.id, MONTH, ENTRIES);
  assert.strictEqual(x.rows().length, 0);
});

test('대신 입력: 제출 기간이 아니어도(마감 뒤) 바로 확정 — 동의·제출 시각은 비고, 확정 시각이 남고, 학생·학부모 화면에 "담당교사가 입력"으로 보인다', () => {
  const x = makeEnv();
  x.env.setNow(CLOSED);   // 3월 10일: 제출 기간 아님 — 학생은 못 내는 때
  assert.strictEqual(submit(x).ok, false);
  const pre = enterPre(x, x.teacher);
  assert.deepStrictEqual([pre.ok, pre.status, pre.startKo], [true, '', '4월 1일(목)']);
  const thisMonth = enterPre(x, x.teacher, { month: '2027-03' });
  assert.deepStrictEqual([thisMonth.ok, thisMonth.startKo, thisMonth.warnings.some((w) => w.includes('3월 10일(수)부터'))], [true, '3월 10일(수)', true], '이번 달은 입력한 날부터');
  const r = enter(x, x.teacher);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(x.live().map((q) => [q.weekday, q.blocks, q.code, q.status, q.submitted_at, q.parent_agreed_at, !!q.teacher_confirmed_at]).sort(),
    [['월', '18:30-20:00', '학', '확정', '', '', true], ['토', '09:00-12:00', '가', '확정', '', '', true]]);
  assert.deepStrictEqual([call(x, PARENT, 'getChildTimetable', x.me.id).view.enteredBy, call(x, x.teacher, 'getTimetableEntry', x.me.id, MONTH).view.enteredBy], ['담당교사', '담당교사']);
  const fixed = x.env.as(ADMIN, (c) => c.effectiveFixedRows_(c.readAll_('fixed_schedules'), x.me.id, '2027-04-05'));
  assert.deepStrictEqual(plain(fixed).map((q) => [q.weekday, q.code]).sort(), [['월', '학'], ['토', '가']], '출석부가 그 달부터 읽는다');
  assert.ok(x.env.rows('audit_log').some((a) => a.action === 'timetable:enter' && JSON.parse(a.detail).s === x.me.id), '감사 기록');
});

test('대신 입력으로 학생이 낸 시간표를 대신하면: 규칙 경고가 미리 보기에 나오고, 옛 행은 취소로 남고(updated_at 갱신), 학생 제출 상태는 사라진다. 낸 학생이 다시 낼 수 있다', () => {
  const x = makeEnv();
  submit(x);
  const before = x.live().map((q) => q.id);
  const pre = enterPre(x, x.teacher, { entries: [ENTRIES[1]] });
  assert.ok(pre.warnings.some((w) => w.includes('제출')), '대신하는 경고: ' + JSON.stringify(pre.warnings));
  assert.strictEqual(pre.status, '제출');
  assert.strictEqual(enter(x, x.teacher, { entries: [ENTRIES[1]] }).ok, true);
  assert.deepStrictEqual([status(x), x.live().length], ['확정', 1]);
  assert.deepStrictEqual(x.rows().filter((q) => before.includes(q.id)).map((q) => q.status), ['취소', '취소']);
  assert.ok(x.rows().filter((q) => before.includes(q.id)).every((q) => q.updated_at), '취소 행에 updated_at');
  assert.strictEqual(submit(x).ok, true, '학생이 제출 기간에 다시 낼 수 있다');
  assert.deepStrictEqual([status(x), call(x, STUDENT, 'getTimetableContext').view.enteredBy], ['제출', '학생']);
});

test('대신 입력 거부: 이번 달·다음 달 밖, 겹치는 칸, 화면이 본 상태가 바뀐 뒤(stale), 확인값 없음 — 아무 행도 바뀌지 않는다', () => {
  const x = makeEnv();
  const bad = (r) => { assert.strictEqual(r.ok, false, JSON.stringify(r)); return r; };
  const far = bad(enterPre(x, x.teacher, { month: '2027-06' }));
  assert.ok(!/\d{4}-\d{2}/.test(far.errors[0].message), '오류 문구도 화면 말(3월·4월): ' + far.errors[0].message);
  bad(enterPre(x, x.teacher, { month: '2027-02' }));
  bad(enterPre(x, x.teacher, { entries: [{ weekday: '월', blocks: '18:30-20:00', code: '학' }, { weekday: '월', blocks: '19:00-21:00', code: '가' }] }));
  const tok = call(x, x.teacher, 'getTimetableEntry', x.me.id, MONTH).view.token;
  submit(x);   // 화면을 연 뒤 학생이 냈다
  const stale = call(x, x.teacher, 'enterTimetableForStudent', x.me.id, MONTH, ENTRIES, tok);
  assert.deepStrictEqual([stale.ok, stale.stale], [false, true]);
  bad(call(x, x.teacher, 'enterTimetableForStudent', x.me.id, MONTH, ENTRIES, ''));
  assert.deepStrictEqual([status(x), x.rows().length], ['제출', 2], '학생이 낸 것 그대로');
  assert.strictEqual(call(x, x.teacher, 'enterTimetableForStudent', x.me.id, MONTH, ENTRIES, 'x').ok, false);
});

test('대신 입력한 시간표는 확인을 거둘 수 없고(규칙), 확정된 것을 다시 대신 입력하면 바뀐다. 빈 목록은 "없음" 행 하나로 확정된다', () => {
  const x = makeEnv();
  assert.strictEqual(enter(x, x.teacher).ok, true);
  assert.strictEqual(call(x, x.teacher, 'returnTimetable', x.me.id, MONTH, '확정은 돌려보낼 수 없다').ok, false);
  const again = enterPre(x, ADMIN, { entries: [ENTRIES[0]] });
  assert.ok(again.warnings.some((w) => w.includes('바꿉니다') && w.includes('4월') && !/\d{4}-\d{2}/.test(w)), JSON.stringify(again.warnings));
  assert.strictEqual(enter(x, ADMIN, { entries: [ENTRIES[0]] }).ok, true);
  assert.deepStrictEqual(x.live().map((q) => [q.weekday, q.code]), [['월', '학']]);
  assert.strictEqual(enter(x, x.teacher, { entries: [] }).ok, true);
  assert.deepStrictEqual(x.live().map((q) => [q.code, q.status]), [['없음', '확정']]);
});
