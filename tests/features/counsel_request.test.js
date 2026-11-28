/** C49-A F17 상담 신청: R4 gas-fakes. 가짜 데이터만. 신청 흐름(학생 신청·취소, 담당교사 확정·반려), 열린 신청 1건, 담임은 날짜·주제·상태만, 메모·이메일 유출 없음. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  T2 = 'fake.t2@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-10', MEMO = 'ZZ-신청메모-표식', WHY = 'ZZ-반려사유-표식';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.addUser(T2, '가짜교사2', 'hall_teacher'));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const me = students.find((s) => s.email === STUDENT);
  const enr = (sid) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === sid);
  const teacher = enr(me.id).teacher_email;   // 이 학생의 담당교사(가짜 시드)
  const stranger = students.find((s) => s.id !== me.id && enr(s.id) && enr(s.id).teacher_email !== teacher);
  const rows = () => env.rows('counsel_requests', 'counsel');
  return { env, term, me, teacher, stranger, enr, rows };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const input = (o) => Object.assign({ dates: ['2027-03-12', '2027-03-15'], topic: '진로', memo: MEMO + ' 이야기' }, o || {});
const submit = (x, o, who) => call(x, who || STUDENT, 'submitCounselRequest', input(o));

test('권한표: 신청·취소는 학생만, 처리는 그 학생의 담당교사만, 목록은 담당교사·관리자, 학생별 보기는 학생·담당교사·담임·관리자 — 학부모·출결·근무는 denied', () => {
  const x = makeEnv();
  x.env.expectAllowed(STUDENT, 'submitCounselRequest', input());
  for (const who of [ADMIN, T1, HOMEROOM, ATT, DUTY, PARENT]) x.env.expectDenied(who, 'counsel.request.create', 'submitCounselRequest', input());
  assert.strictEqual(x.rows().length, 1, '거부된 신청은 행이 없다');
  const id = x.rows()[0].id;
  for (const who of [ADMIN, T1, HOMEROOM, ATT, DUTY, PARENT]) x.env.expectDenied(who, 'counsel.request.cancel', 'cancelCounselRequest', id, '');
  for (const who of [ADMIN, T1]) x.env.expectAllowed(who, 'getCounselRequestList');
  for (const who of [STUDENT, PARENT, HOMEROOM, ATT, DUTY]) x.env.expectDenied(who, 'counsel.request.list', 'getCounselRequestList');
  for (const who of [STUDENT, ADMIN, x.teacher]) x.env.expectAllowed(who, 'getCounselRequestsOfStudent', x.me.id);
  for (const who of [PARENT, ATT, DUTY, T2]) x.env.expectDenied(who, 'counsel.request.view', 'getCounselRequestsOfStudent', x.me.id);
  const dec = { studentId: x.me.id, requestId: id, action: 'confirm', date: '2027-03-12' };
  for (const who of [ADMIN, STUDENT, PARENT, HOMEROOM, ATT, T2]) x.env.expectDenied(who, 'counsel.request.decide', 'decideCounselRequest', dec);
  assert.strictEqual(x.rows()[0].status, '신청', '거부된 처리는 상태를 바꾸지 않는다');
});

test('신청: 본인 계정으로만(보낸 studentId는 무시), 담당·기간·신청자가 서버에서 채워지고 상태는 신청, 같은 학생의 열린 신청은 1건', () => {
  const x = makeEnv();
  const r = submit(x, { studentId: x.stranger.id });   // 남의 id를 넣어도 본인 신청
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const row = x.rows()[0];
  assert.deepStrictEqual([row.student_id, row.requester_email, row.term_id, row.status, row.wish_dates, row.topic, row.decided_date, row.linked_note_id, row.cancel_reason],
    [x.me.id, STUDENT, x.term.id, '신청', '2027-03-12;2027-03-15', '진로', '', '', '']);
  const again = submit(x);
  assert.strictEqual(again.ok, false);
  assert.ok(again.errors[0].message.includes('처리되지 않은 상담 신청'), JSON.stringify(again));
  assert.strictEqual(x.rows().length, 1, '두 번째 신청은 행이 늘지 않는다');
  // 입력 검사(R24): 날짜 4개·지난 날·주제 없음
  const bad = [submit(x, { dates: [] }), submit(x, { dates: ['2027-03-09'] }), submit(x, { topic: '없는주제' }), submit(x, { dates: ['2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14'] })];
  bad.forEach((b) => assert.strictEqual(b.ok, false));
  assert.strictEqual(x.rows().length, 1);
});

test('학생 취소: 신청·확정 상태에서 본인만, 취소하면 다시 신청할 수 있고 행은 남는다. 끝난 신청·남의 신청은 거부', () => {
  const x = makeEnv();
  const id = submit(x).id;
  assert.strictEqual(call(x, STUDENT, 'cancelCounselRequest', id, '일정이 바뀌었습니다').ok, true);
  assert.deepStrictEqual([x.rows()[0].status, x.rows()[0].cancel_reason], ['취소', '일정이 바뀌었습니다']);
  const twice = call(x, STUDENT, 'cancelCounselRequest', id, '');
  assert.strictEqual(twice.ok, false);
  assert.strictEqual(twice.stale, true);
  assert.strictEqual(submit(x).ok, true, '취소한 뒤 다시 신청');
  assert.strictEqual(x.rows().length, 2);
  // 남의 신청: 같은 학생 역할이어도 본인 행이 아니면 denied + 행 그대로
  const other = x.env.rows('students').find((s) => s.id !== x.me.id && s.email);
  if (other) {
    x.env.asOwner((c) => c.addUser(other.email, '가짜학생B', 'student'));
    const myOpen = x.rows().find((r) => r.status === '신청').id;
    assert.throws(() => x.env.call(other.email, 'cancelCounselRequest', myOpen, ''), /권한/);
    assert.strictEqual(x.rows().find((r) => r.id === myOpen).status, '신청');
  }
});

test('담당교사 처리: 확정은 학생이 고른 희망 날짜 중 하나, 반려는 사유 필수, 확정 뒤에도 반려(상담 못 함) 가능, 끝난 신청은 다시 처리 못 함', () => {
  const x = makeEnv();
  const id = submit(x).id;
  const dec = (o) => call(x, x.teacher, 'decideCounselRequest', Object.assign({ studentId: x.me.id, requestId: id }, o));
  const outside = dec({ action: 'confirm', date: '2027-03-20' });
  assert.strictEqual(outside.ok, false);
  assert.ok(outside.errors[0].message.includes('희망 날짜'), JSON.stringify(outside));
  assert.strictEqual(dec({ action: 'reject', reason: '' }).ok, false, '반려는 사유 필수');
  assert.strictEqual(x.rows()[0].status, '신청');
  const ok = dec({ action: 'confirm', date: '2027-03-15' });
  assert.deepStrictEqual([ok.ok, ok.status], [true, '확정']);
  assert.deepStrictEqual([x.rows()[0].status, x.rows()[0].decided_date], ['확정', '2027-03-15']);
  const twice = dec({ action: 'confirm', date: '2027-03-12' });
  assert.strictEqual(twice.ok, false);
  assert.strictEqual(twice.stale, false, '확정 상태에서 다시 확정은 stale이 아니라 일반 오류');
  assert.strictEqual(dec({ action: 'reject', reason: WHY + ' 못 했습니다' }).ok, true, '확정 뒤 상담 못 함 = 반려');
  assert.deepStrictEqual([x.rows()[0].status, x.rows()[0].cancel_reason], ['반려', WHY + ' 못 했습니다']);
  const done = dec({ action: 'confirm', date: '2027-03-12' });
  assert.strictEqual(done.ok, false);
  assert.strictEqual(done.stale, true, '반려된 신청은 화면을 새로 불러오게 한다');
  assert.strictEqual(dec({ action: 'complete', noteId: 'x' }).ok, false, '완료는 이 함수로 못 한다(상담일지 저장과 한 번에)');
  // 다른 학생의 id로 이 신청을 처리할 수는 없다
  // 담당이 아닌 학생의 id를 넣어 이 신청을 처리할 수는 없다(권한 키가 학생 범위로 거부)
  x.env.expectDenied(x.teacher, 'counsel.request.decide', 'decideCounselRequest', { studentId: x.stranger.id, requestId: id, action: 'reject', reason: '가짜 사유' });
});

test('보는 사람별 칸: 학생은 메모·반려 사유(본인), 담당교사·관리자는 메모, 담임은 날짜·주제·상태만(메모 칸 자체가 없다), 이메일·연결 일지 id는 누구에게도 안 간다', () => {
  const x = makeEnv();
  const id = submit(x).id;
  call(x, x.teacher, 'decideCounselRequest', { studentId: x.me.id, requestId: id, action: 'reject', reason: WHY });
  const s = call(x, STUDENT, 'getCounselRequestsOfStudent', x.me.id);
  const a = call(x, x.teacher, 'getCounselRequestsOfStudent', x.me.id);
  const adm = call(x, ADMIN, 'getCounselRequestsOfStudent', x.me.id);
  assert.strictEqual(s.requests[0].memo.includes(MEMO), true);
  assert.strictEqual(s.requests[0].cancel_reason, WHY, '반려 사유는 학생에게 보인다(결정 95)');
  assert.strictEqual(a.requests[0].memo.includes(MEMO), true);
  assert.strictEqual(adm.requests[0].memo.includes(MEMO), true);
  assert.ok(!('requester_email' in s.requests[0]) && !('linked_note_id' in s.requests[0]), '학생에게 이메일·연결 일지 id 없음');
  // 담임: 그 반 학생이어야 한다 — 담임 계정의 반을 그 학생 반으로 바꿔 둔다
  x.env.asOwner((c) => { const u = c.readAll_('users').find((q) => q.email === HOMEROOM); c.updateRecord_('users', u.id, { homeroom_class: x.me.grade + '-' + x.me.class_no }, ADMIN); });
  const h = call(x, HOMEROOM, 'getCounselRequestsOfStudent', x.me.id);
  assert.deepStrictEqual(Object.keys(h.requests[0]).sort(), ['decided_date', 'id', 'status', 'student_id', 'topic', 'wishDates']);
  assert.ok(!textOf(h).includes(MEMO) && !textOf(h).includes(WHY) && !textOf(h).includes('@'), '담임 응답에 메모·사유·이메일 없음');
  assert.ok(!('memo' in h.requests[0]), '메모 칸 자체가 없다');
});

test('목록: 담당교사는 자기 담당 학생의 신청만(처리할 것이 위), 관리자는 이번 기간 전체', () => {
  const x = makeEnv();
  submit(x);
  const l1 = call(x, x.teacher, 'getCounselRequestList');
  assert.deepStrictEqual(l1.requests.map((r) => r.student.id), [x.me.id]);
  assert.strictEqual(l1.open, 1);
  x.env.asOwner((c) => c.addUser('fake.t3@example.com', '가짜교사3', 'hall_teacher'));
  assert.deepStrictEqual(call(x, 'fake.t3@example.com', 'getCounselRequestList').requests, [], '담당 학생이 없는 교사는 빈 목록');
  assert.deepStrictEqual(call(x, ADMIN, 'getCounselRequestList').requests.map((r) => r.student.id), [x.me.id]);
  const info = x.env.asOwner((c) => c.crqHomeInfo_({ email: x.teacher }, 'hall_teacher'));
  assert.deepStrictEqual([info.open, info.fixed, info.earliest], [1, 0, '2027-03-12']);
});

test('결정 97: 지난 기간 신청은 그 기간 담당이었던 교사만 \'assigned\'로 본다(지금 담당이어도 그 기간 담당이 아니면 담임·none)', () => {
  const x = makeEnv();
  const student = x.env.rows('students').find((s) => s.id === x.me.id);
  const enrollments = [{ term_id: 'T-OLD', student_id: x.me.id, teacher_email: T2 }, { term_id: x.term.id, student_id: x.me.id, teacher_email: x.teacher }];
  const roleOf = (who, termId) => plain(x.env.as(who, (c) => c.crqViewer_(c.getCurrentUser_(), student, termId, enrollments))).role;
  assert.strictEqual(roleOf(x.teacher, x.term.id), 'assigned');
  assert.strictEqual(roleOf(x.teacher, 'T-OLD'), 'none', '지금 담당이어도 지난 기간 담당이 아니면 못 본다');
  assert.strictEqual(roleOf(T2, 'T-OLD'), 'assigned');
  assert.strictEqual(roleOf(T2, x.term.id), 'none');
  assert.strictEqual(roleOf(ADMIN, 'T-OLD'), 'admin');
  assert.strictEqual(roleOf(STUDENT, 'T-OLD'), 'student');
});

test('학사 입실이 아니면 신청 못 함(결정 97), 처리도 못 함. 열린 신청이 있으면 canRequest가 거짓이고 이유를 준다', () => {
  const x = makeEnv();
  const before = call(x, STUDENT, 'getCounselRequestsOfStudent', x.me.id);
  assert.strictEqual(before.canRequest, true);
  const id = submit(x).id;
  const mid = call(x, STUDENT, 'getCounselRequestsOfStudent', x.me.id);
  assert.deepStrictEqual([mid.canRequest, mid.whyNot.includes('진행 중인 신청')], [false, true]);
  assert.strictEqual(call(x, x.teacher, 'getCounselRequestsOfStudent', x.me.id).canDecide, true);
  // 학사 퇴실 처리
  x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: x.me.id, item: '학사', value: '퇴실', effective_date: TODAY, effective_date_auto: TODAY, requested_at: TODAY + 'T09:00:00',
    reason: '', doc_submitted: '', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  const after = call(x, STUDENT, 'getCounselRequestsOfStudent', x.me.id);
  assert.deepStrictEqual([after.canRequest, after.whyNot.includes('학사생이 아닌')], [false, true]);
  assert.strictEqual(call(x, x.teacher, 'getCounselRequestsOfStudent', x.me.id).canDecide, false);
  const r = call(x, x.teacher, 'decideCounselRequest', { studentId: x.me.id, requestId: id, action: 'confirm', date: '2027-03-12' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].message.includes('학사생이 아닌'), JSON.stringify(r));
  assert.strictEqual(x.rows()[0].status, '신청');
  assert.strictEqual(submit(x).ok, false, '퇴실한 학생은 새로 신청 못 함');
});

test('감사·메일: 신청 글(메모)은 audit_log에 글자 수만 남고, 메일 본문에 이름·메모·사유가 없다', () => {
  const x = makeEnv();
  const a0 = x.env.rows('audit_log').length;
  const sent = [];
  const res = plain(x.env.as(STUDENT, (c) => {
    c.PropertiesService.getScriptProperties().setProperty('MAIL_ENABLED', 'true');
    c.MailApp = { sendEmail(to, subject, body) { sent.push({ to, subject, body }); }, getRemainingDailyQuota: () => 100 };
    c.notifyMail_ = function (to, subject, body) { sent.push({ to, subject, body }); return { notified: true }; };
    return c.submitCounselRequest(input());
  }));
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const log = x.env.rows('audit_log').slice(a0);
  assert.ok(!log.some((l) => JSON.stringify(l).includes(MEMO)), 'audit에 메모 표식 없음');
  assert.ok(log.some((l) => l.action === 'create' && /내용 생략/.test(JSON.stringify(l))), '글자 수만');
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(JSON.stringify(sent[0].to), JSON.stringify([x.teacher]));
  assert.ok(!sent[0].body.includes(MEMO) && !sent[0].body.includes(x.me.name), '메일 본문에 메모·학생 이름 없음: ' + sent[0].body);
});
