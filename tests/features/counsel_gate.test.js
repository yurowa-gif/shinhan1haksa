/** C13 2OUT 학부모 면담 + 퇴실 확정 관문: R4 gas-fakes. 가짜 데이터만. 면담 내용(표식 글자)은 상담 파일에만 있어야 한다. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  T2 = 'fake.t2@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03', MARK = 'ZZ-면담-표식';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.addUser(T2, '가짜교사2', 'hall_teacher'));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const students = env.rows('students');
  const active = (s) => !env.rows('status_changes').some((c) => c.student_id === s.id && c.item === '학사' && c.effective_date > TODAY);
  const mine = students.find((s) => active(s) && enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  const other = students.find((s) => active(s) && enr.some((e) => e.student_id === s.id && e.teacher_email !== T1) && s.id !== mine.id);
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const tabName = 'violations_' + term.id.slice(0, 8);
  const addOut = (student, at, extra) => env.asOwner((c) => c.appendRecord_(tabName, Object.assign({ term_id: term.id, student_id: student.id, occurred_at: at, rule_id: rule.id, rule_name: rule.name, memo: '',
    detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, extra || {}), ADMIN));
  const notes = () => env.rows('counsel_notes', 'counsel');
  const two = (student) => { addOut(student, '2027-03-02T20:00:00'); addOut(student, '2027-03-03T19:00:00'); };
  return { env, term, mine, other, addOut, notes, two, tabName, hrClass: env.rows('users').find((u) => u.email === HOMEROOM).homeroom_class };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const meet = (x, who, o) => plain(x.env.call(who, 'saveOutMeeting', Object.assign({ studentId: x.mine.id, date: TODAY, content: MARK + ' 학부모와 통화' }, o || {})));
const deniedCount = (x, action) => x.env.rows('audit_log').filter((a) => a.action === 'denied:' + action).length;

test('관문: OUT 1건이면 퇴실 대상 아님, 2건이면 면담 기록 필요 — 업무 차단이라 denied 기록이 없다', () => {
  const x = makeEnv();
  x.addOut(x.mine, '2027-03-02T20:00:00');
  assert.deepStrictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id), { ok: false, reason: '퇴실 대상 아님' });
  x.addOut(x.mine, '2027-03-03T19:00:00');
  assert.deepStrictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id), { ok: false, reason: '면담 기록 필요' });
  assert.strictEqual(x.env.rows('audit_log').filter((a) => /^denied:/.test(a.action)).length, 0);
  assert.strictEqual(call(x, ADMIN, 'confirmOutDismissal', 'no-such').ok, false);
});

test('담당교사 saveOutMeeting: 상담 파일에 행(type·target·둘째 OUT 연결·교사)이 생기고 운영 DB에는 상담 행·내용이 없으며, 다시 확인하면 ok + prefill', () => {
  const x = makeEnv();
  x.two(x.mine);
  const second = x.env.rows(x.tabName).filter((v) => v.student_id === x.mine.id).sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1)[1];
  const a0 = x.env.rows('audit_log').length;
  const r = meet(x, T1);
  assert.deepStrictEqual([r.ok, r.meeting.date, r.meeting.teacher], [true, TODAY, x.env.rows('users').find((u) => u.email === T1).name]);
  assert.ok(!JSON.stringify(r).includes(MARK), '응답에 내용 없음');
  const n = x.notes().filter((q) => q.student_id === x.mine.id);
  assert.strictEqual(n.length, 1);
  assert.deepStrictEqual([n[0].type, n[0].target, n[0].linked_violation_id, n[0].teacher_email, n[0].show_to_parent, n[0].status, n[0].date],
    ['2OUT 학부모 면담', '학부모', second.id, T1, 'TRUE', '유효', TODAY]);
  assert.ok(n[0].content.includes(MARK), '상담 파일에는 내용이 있다');
  assert.ok(!x.env.rows('audit_log').slice(a0).some((a) => JSON.stringify(a).includes(MARK)), '운영 DB audit_log에는 표식이 없다');
  assert.ok(x.env.rows('audit_log').slice(a0).some((a) => a.action === 'create' && a.sheet === 'counsel/counsel_notes'), '감사에는 생성 사실만');
  const d = call(x, ADMIN, 'confirmOutDismissal', x.mine.id);
  assert.strictEqual(d.ok, true, JSON.stringify(d));
  assert.deepStrictEqual([d.prefill.reason, d.prefill.effectiveDate, d.prefill.meeting.date, d.prefill.studentId], ['2OUT 퇴실', '2027-03-04', TODAY, x.mine.id]);
  assert.ok(!JSON.stringify(d).includes(MARK) && !JSON.stringify(d).includes('@'));
  assert.strictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id).ok, true, '다시 불러도 ok');
});

test('저장 입력 검사: 1건뿐·둘째 OUT 이전 날짜·미래·내용 없음·너무 김·이미 면담 있음·이미 퇴실 — 모두 거부이고 행이 늘지 않는다', () => {
  const x = makeEnv();
  x.addOut(x.mine, '2027-03-02T20:00:00');
  assert.strictEqual(meet(x, T1).ok, false, '1건뿐');
  x.addOut(x.mine, '2027-03-03T19:00:00');
  const bad = (o) => { const r = meet(x, T1, o); assert.strictEqual(r.ok, false, JSON.stringify(o)); return r.errors[0].field; };
  assert.strictEqual(bad({ date: '2027-03-02' }), 'date');           // 둘째 OUT(3/3) 이전
  assert.strictEqual(bad({ date: '2027-03-04' }), 'date');           // 미래
  assert.strictEqual(bad({ date: 'x' }), 'date');
  assert.strictEqual(bad({ content: '  ' }), 'content');
  assert.strictEqual(bad({ content: '가'.repeat(2001) }), 'content');
  assert.strictEqual(x.notes().length, 0);
  assert.strictEqual(meet(x, T1).ok, true);
  assert.strictEqual(bad({}), 'date', '이미 면담이 있으면 취소 뒤에');
  assert.strictEqual(x.notes().length, 1);
  const y = makeEnv(); y.two(y.mine);
  y.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: y.mine.id, item: '학사', value: '퇴실', effective_date: '2027-03-10', reason: '2OUT 퇴실', memo: '[2OUT] out:x note:y', status: '유효' }, ADMIN));
  assert.strictEqual(meet(y, T1).ok, false, '이미 퇴실이 잡힘');
  assert.deepStrictEqual(call(y, ADMIN, 'confirmOutDismissal', y.mine.id), { ok: false, reason: '이미 퇴실' });
});

test('거부: 담당이 아닌 학사 교사·출결 담당·근무교사·관리자·담임·학생·학부모의 saveOutMeeting은 denied:counsel.save, 행 0', () => {
  const x = makeEnv();
  x.two(x.mine);
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '21:30조', end_time: '21:30', original_email: T2, actual_email: T2, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  for (const who of [T2, ATT, ADMIN, HOMEROOM, STUDENT, PARENT, DUTY]) x.env.expectDenied(who, 'counsel.save', 'saveOutMeeting', { studentId: x.mine.id, date: TODAY, content: MARK });
  assert.strictEqual(x.notes().length, 0);
});

test('cancelOutMeeting: 작성한 담당교사 본인만(남의 면담 id는 denied:counsel.cancel), 취소하면 관문이 다시 막히고 행은 남는다', () => {
  const x = makeEnv();
  x.two(x.mine);
  meet(x, T1);
  const note = x.notes()[0];
  x.env.expectDenied(T2, 'counsel.cancel', 'cancelOutMeeting', note.id, '다른 선생님이 취소');
  for (const who of [ADMIN, ATT, HOMEROOM]) x.env.expectDenied(who, 'counsel.cancel', 'cancelOutMeeting', note.id, '취소 시도');
  assert.strictEqual(x.notes()[0].status, '유효');
  assert.strictEqual(call(x, T1, 'cancelOutMeeting', note.id, 'x').ok, false, '사유 1자');
  assert.strictEqual(call(x, T1, 'cancelOutMeeting', 'no-such', '없는 면담').ok, false);
  assert.strictEqual(call(x, T1, 'cancelOutMeeting', note.id, '날짜를 잘못 적었습니다').ok, true);
  assert.deepStrictEqual([x.notes().length, x.notes()[0].status, x.notes()[0].cancel_reason], [1, '취소', '날짜를 잘못 적었습니다']);
  assert.deepStrictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id), { ok: false, reason: '면담 기록 필요' });
  assert.strictEqual(call(x, T1, 'cancelOutMeeting', note.id, '또 취소').ok, false, '이미 취소');
  assert.strictEqual(meet(x, T1).ok, true, '다시 기록할 수 있다');
});

test('면담이 연결된 OUT이 취소되면 그 면담은 세지 않는다(결정 51), 퇴실이 잡힌 뒤에는 면담을 취소할 수 없다', () => {
  const x = makeEnv();
  x.two(x.mine);
  meet(x, T1);
  const second = x.env.rows(x.tabName).filter((v) => v.student_id === x.mine.id).sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1)[1];
  x.env.call(ADMIN, 'cancelOut', x.term.id, second.id, '잘못 입력했습니다');
  assert.deepStrictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id), { ok: false, reason: '퇴실 대상 아님' });
  const y = makeEnv(); y.two(y.mine); meet(y, T1);
  y.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: y.mine.id, item: '학사', value: '퇴실', effective_date: '2027-03-10', reason: '2OUT 퇴실', memo: '[2OUT] out:x note:y', status: '유효' }, ADMIN));
  assert.strictEqual(call(y, T1, 'cancelOutMeeting', y.notes()[0].id, '퇴실 뒤 취소 시도').ok, false);
  assert.strictEqual(y.notes()[0].status, '유효');
});

test('퇴실 확정 관문은 관리자만: 담당교사·담임·학사 교사·출결 담당은 denied:out.dismiss', () => {
  const x = makeEnv();
  x.two(x.mine); meet(x, T1);
  for (const who of [T1, T2, HOMEROOM, ATT, DUTY, STUDENT, PARENT]) x.env.expectDenied(who, 'out.dismiss', 'confirmOutDismissal', x.mine.id);
  assert.strictEqual(call(x, ADMIN, 'confirmOutDismissal', x.mine.id).ok, true);
});

test('listOuts 면담 칸: 담당교사·관리자·그 반 담임은 날짜·교사가 보이고, 담당이 아닌 학사 교사·출결 담당은 비어 있다. 응답 어디에도 내용·이메일이 없다', () => {
  const x = makeEnv();
  x.two(x.mine);
  const find = (r) => r.summary.find((s) => s.studentId === x.mine.id);
  const need = call(x, T1, 'listOuts', { scope: 'term' });
  assert.deepStrictEqual([find(need).state, find(need).meeting, find(need).canMeeting], ['need', null, true]);
  meet(x, T1);
  const mineView = find(call(x, T1, 'listOuts', { scope: 'term' }));
  assert.deepStrictEqual([mineView.state, mineView.meeting.date, !!mineView.meeting.noteId, mineView.canMeeting], ['recorded', TODAY, true, false]);
  const adm = find(call(x, ADMIN, 'listOuts', { scope: 'term' }));
  assert.deepStrictEqual([adm.state, adm.canConfirm, adm.meeting.noteId], ['recorded', true, undefined], '관리자는 확정 버튼, 남의 면담 id는 없다');
  for (const who of [T2, ATT]) {
    const v = find(call(x, who, 'listOuts', { scope: 'term' }));
    assert.ok(v, who + ': OUT 수는 보인다');
    assert.deepStrictEqual([v.state, v.meeting, v.canMeeting, v.canConfirm], [undefined, undefined, undefined, undefined], who + ': 면담 칸은 비어 있다');
  }
  // 담임: 그 반 학생이면 보인다
  const hrStudent = x.env.rows('students').find((s) => x.hrClass === s.grade + '-' + s.class_no && s.id !== x.mine.id && x.env.rows('enrollments').some((e) => e.term_id === x.term.id && e.student_id === s.id));
  assert.ok(hrStudent, '담임 반에 다른 학생이 있어야 시험이 의미 있다');
  x.two(hrStudent);
  assert.strictEqual(call(x, HOMEROOM, 'listOuts', { scope: 'term' }).summary.find((s) => s.studentId === hrStudent.id).state, 'need');
  for (const who of [T1, T2, ATT, ADMIN, HOMEROOM]) {
    const j = JSON.stringify(call(x, who, 'listOuts', { scope: 'targets' }));
    assert.ok(!j.includes(MARK) && !j.includes('@'), who);
  }
  assert.ok(call(x, ADMIN, 'listOuts', { scope: 'targets' }).summary.every((s) => s.count >= 2));
});

test('관리자 홈 숫자: 2OUT 대상·면담 필요·확정 가능, 내용 없음', () => {
  const x = makeEnv();
  x.two(x.mine); x.two(x.other);
  const info = () => plain(x.env.as(ADMIN, (c) => c.vioHomeInfo_(c.requirePermission_('out.view'), 'admin')));
  assert.deepStrictEqual(info().targets, { n: 2, need: 2, ready: 0 });
  meet(x, T1);
  assert.deepStrictEqual(info().targets, { n: 2, need: 1, ready: 1 });
  assert.ok(!JSON.stringify(info()).includes(MARK));
});

test('listOuts targets: 2OUT 학생의 살아 있는 OUT 목록이 함께 오고, 연결 OUT이 취소돼 면담이 인정 안 되면 staleMeeting', () => {
  const x = makeEnv();
  x.two(x.mine); meet(x, T1);
  const t = call(x, T1, 'listOuts', { scope: 'targets' });
  assert.deepStrictEqual([t.summary.length, t.items.length, t.items.every((i) => i.status === '유효' && i.studentId === x.mine.id)], [1, 2, true]);
  assert.strictEqual(t.summary[0].staleMeeting, false);
  const second = x.env.rows(x.tabName).filter((v) => v.student_id === x.mine.id).sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1)[1];
  x.env.call(ADMIN, 'cancelOut', x.term.id, second.id, '잘못 입력했습니다');
  x.addOut(x.mine, '2027-03-03T19:30:00');   // 다시 2건이 되어도 이전 면담은 인정되지 않는다
  const t2 = call(x, T1, 'listOuts', { scope: 'targets' });
  assert.deepStrictEqual([t2.summary[0].state, t2.summary[0].staleMeeting, t2.summary[0].meeting], ['need', true, null]);
});
