/** C11a F4 OUT 직접 입력: R4 gas-fakes 환경에서 실제 공개 함수를 부른다. 메일은 실행 안에서 MailApp을 바꿔 끼운다. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  T2 = 'fake.t2@example.com', T3 = 'fake.t3@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03', YESTERDAY = '2027-03-02', TWO_AGO = '2027-03-01';
const AT = (d, hm) => d + 'T' + (hm || '19:40');

function makeEnv(opts) {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  const acc = env.seedFake({ stage1: true });
  env.asOwner((c) => { c.addUser(T2, '가짜교사2', 'hall_teacher'); c.addUser(T3, '가짜교사3', 'hall_teacher'); });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const students = env.rows('students');
  const active = (s) => !env.rows('status_changes').some((c) => c.student_id === s.id && c.item === '학사' && c.effective_date > TODAY);   // 3/15 입실 예정자는 제외
  const mine = students.find((s) => active(s) && enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  const notMine = students.find((s) => active(s) && enr.some((e) => e.student_id === s.id && e.teacher_email !== T1) && s.id !== mine.id);
  const late = env.rows('status_changes').find((c) => c.item === '학사' && c.effective_date === '2027-03-15').student_id;
  const rules = env.rows('violation_rules');
  const phone = rules.find((r) => r.name.startsWith('휴대폰')), dorm = rules.find((r) => r.name.startsWith('기숙사')), auto = rules.find((r) => r.name.startsWith('무단'));
  if (!opts || opts.mail !== false) env.scriptProps.MAIL_ENABLED = 'true';
  const tab = () => env.rows('violations_' + term.id.slice(0, 8));
  const duty = (date, slot, original, actual) => env.asOwner((c) => c.appendRecord_('duty_slots', { date, slot, end_time: '21:30', original_email: original, actual_email: actual === undefined ? original : actual,
    swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  const input = (o) => Object.assign({ studentId: mine.id, occurredAt: AT(TODAY), ruleId: phone.id, detectedBy: '', memo: '자습 중 휴대폰 사용' }, o || {});
  return { env, acc, term, mine, notMine, late, phone, dorm, auto, tab, duty, input, id: (e) => env.rows('users').find((u) => u.email === e).id };
}
/** MailApp을 바꿔 끼우고 saveOut을 부른다 → {r, sent, locks} */
function save(x, who, input, mailOpts) {
  mailOpts = mailOpts || {};
  const sent = [], locks = [];
  const r = plain(x.env.as(who, (c) => {
    c.MailApp = { sendEmail(to, subject, body) { locks.push(c.LockService.getScriptLock().hasLock()); if (mailOpts.fail) throw new Error('발송 실패(가짜)'); sent.push({ to, subject, body }); },
      getRemainingDailyQuota: () => 100 };
    return c.saveOut(input);
  }));
  return { r, sent, locks };
}
const call = (x, who, fn, ...args) => plain(x.env.call(who, fn, ...args));
const pure = require('../helpers/harness').loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/OutRules.gs', 'src/features/Outs.gs']);

/* ───── vioYmd_: 권한 날짜와 저장 일시가 같은 값에서 나온다 ───── */
test('vioYmd_: 로컬 yyyy-MM-ddTHH:mm(:ss)만 받고 Z·오프셋·공백·날짜만·없는 날짜·범위 밖 시각은 null', () => {
  const v = (s) => plain(pure.vioYmd_({ occurredAt: s }));
  assert.deepStrictEqual(v('2027-03-03T21:40'), { ymd: '2027-03-03', at: '2027-03-03T21:40:00' });
  assert.deepStrictEqual(v(' 2027-03-03T21:40:15 '), { ymd: '2027-03-03', at: '2027-03-03T21:40:15' }, '앞뒤 공백은 같은 값으로 다듬는다');
  for (const bad of ['2027-03-03T21:40Z', '2027-03-03T21:40:00+09:00', '2027-03-03T21:40+0900', '2027-03-03 21:40', '2027-03-03', '2027-02-30T10:00', '2027-03-03T24:00', '2027-03-03T10:60', '2027-03-03T10:00:60', 'x', '', null, undefined, 20270303, '2027-03-03T21:40\n2027-03-01']) {
    assert.strictEqual(pure.vioYmd_({ occurredAt: bad }), null, String(bad));
  }
  assert.strictEqual(pure.vioYmd_({ ymd: '2027-03-03' }), null, '따로 보낸 ymd는 받지 않는다');
  assert.strictEqual(pure.vioYmd_(null), null);
});

/* ───── getOutContext ───── */
test('getOutContext: 담당교사는 담당 학생만, 항목은 켜진 것에서 자동 항목 제외, 이메일 없음, 학생별 이번 기간 OUT 수', () => {
  const x = makeEnv();
  const c = call(x, T1, 'getOutContext', '');
  assert.ok(c.canRecord && c.students.length > 0);
  assert.ok(c.students.every((s) => x.env.rows('enrollments').some((e) => e.student_id === s.id && e.teacher_email === T1)));
  assert.ok(!c.students.some((s) => s.id === x.notMine.id) && !c.students.some((s) => s.id === x.late), '담당 아님·입실 전 학생은 없다');
  assert.deepStrictEqual(c.rules.map((r) => r.id), x.env.rows('violation_rules').filter((r) => !r.name.startsWith('무단')).map((r) => r.id));
  assert.ok(c.teachers.some((t) => t.me) && !JSON.stringify(c).includes('@'));
  assert.strictEqual(c.levels[x.mine.id], 0);
  x.env.asOwner((cc) => cc.updateRecord_('violation_rules', x.dorm.id, { active: 'FALSE' }, ADMIN));
  assert.ok(!call(x, T1, 'getOutContext', '').rules.some((r) => r.id === x.dorm.id), '꺼진 항목은 고를 수 없다');
});

test('getOutContext: 오늘 근무자는 그날 등록 학생 전체, 어제 근무자는 어제 날짜로, 근무 아닌 교사는 담당만, 관리자는 전체, 담임·출결 담당은 기록 못 함', () => {
  const x = makeEnv();
  x.duty(TODAY, '21:30조', T2); x.duty(YESTERDAY, '23:00조', T3);
  const n = (who, date) => call(x, who, 'getOutContext', date || '').students.length;
  const all = n(ADMIN);
  assert.ok(all > n(T1));
  assert.strictEqual(n(T2, TODAY), all, '오늘 근무자 = 전체(입실 전 제외)');
  assert.ok(n(T2, YESTERDAY) < all, '오늘 근무자가 어제 날짜로 열면 담당만');
  assert.strictEqual(n(T3, YESTERDAY), all, '어제 근무자는 어제 날짜(다음 날까지)');
  assert.ok(n(T3, TODAY) < all, '어제 근무자가 오늘 날짜로 열면 담당만');
  for (const who of [HOMEROOM, ATT]) { const c = call(x, who, 'getOutContext', ''); assert.deepStrictEqual([c.canRecord, c.students.length], [false, 0], who); }
  for (const who of [STUDENT, PARENT, DUTY]) x.env.expectDenied(who, 'out.view', 'getOutContext', '');
});

/* ───── saveOut: 허용·거부 ───── */
test('담당교사 saveOut: 기간 탭에 한 줄(직접·유효), entered_by는 접속자, 적발 교사 이름, audit create, 응답 after = 1OUT', () => {
  const x = makeEnv();
  const w = x.tab().length;
  const { r } = save(x, T1, x.input({ detectedBy: x.id(T2) }));
  assert.deepStrictEqual([r.ok, r.after.count, r.after.label], [true, 1, '1OUT']);
  assert.strictEqual(x.tab().length, w + 1);
  const row = x.tab()[x.tab().length - 1];
  assert.deepStrictEqual([row.student_id, row.occurred_at, row.rule_id, row.rule_name, row.memo, row.detected_by, row.entered_by, row.status, row.source, row.source_exception_id],
    [x.mine.id, AT(TODAY) + ':00', x.phone.id, x.phone.name, '자습 중 휴대폰 사용', T2, T1, '유효', '직접', '']);   // detected_by는 이메일(R5 자동 OUT과 같은 형식)
  assert.ok(x.env.rows('audit_log').some((a) => a.action === 'create' && a.sheet.indexOf('violations_') === 0 && a.row_id === row.id));
});

test('거부: 담당이 아닌 학생(denied:out.save)·담임·학생·학부모·근무표 담당자만 가진 계정·출결 담당만 가진 계정, 쓰기 0건', () => {
  const x = makeEnv();
  const w = x.tab().length;
  x.env.expectDenied(T1, 'out.save', 'saveOut', x.input({ studentId: x.notMine.id }));
  x.env.expectDenied(T1, 'out.save', 'previewOut', x.input({ studentId: x.notMine.id }));
  for (const who of [HOMEROOM, STUDENT, PARENT, DUTY, ATT]) x.env.expectDenied(who, 'out.save', 'saveOut', x.input());
  assert.strictEqual(x.tab().length, w);
  x.env.expectAllowed(ADMIN, 'saveOut', x.input({ studentId: x.notMine.id }));
});

test('근무교사(C8s): 오늘 근무자는 오늘, 어제 근무자는 어제 사건(다음 날까지)만 — 이틀 전 occurredAt·근무 아닌 날·예비·교대로 넘긴 원래 근무자·시간대 표시는 거부이고 0행', () => {
  const x = makeEnv();
  const T4 = 'fake.t4@example.com', T5 = 'fake.t5@example.com', T6 = 'fake.t6@example.com';
  x.env.asOwner((c) => { c.addUser(T4, '가짜교사4', 'hall_teacher'); c.addUser(T5, '가짜교사5', 'hall_teacher'); c.addUser(T6, '가짜교사6', 'hall_teacher'); });
  x.duty(TODAY, '21:30조', T2);          // 오늘 근무자
  x.duty(YESTERDAY, '23:00조', T5);      // 어제 근무자
  x.duty(TWO_AGO, '21:30조', T6);        // 이틀 전 근무자
  x.duty(TODAY, '23:00조', T1, T3);      // T1이 T3에게 넘김(실제 근무자 T3)
  x.duty(TODAY, '예비', T4);             // 예비 지정만
  const stu = x.notMine.id, w = x.tab().length;
  assert.strictEqual(save(x, T2, x.input({ studentId: stu, occurredAt: AT(TODAY) })).r.ok, true, '오늘 근무자 오늘 사건');
  assert.strictEqual(save(x, T3, x.input({ studentId: stu, occurredAt: AT(TODAY), ruleId: x.dorm.id })).r.ok, true, '넘겨받은 실제 근무자도 오늘 사건');
  assert.strictEqual(save(x, T5, x.input({ studentId: stu, occurredAt: AT(YESTERDAY) })).r.ok, true, '어제 근무자 어제 사건(다음 날까지)');
  const n = x.tab().length; assert.strictEqual(n, w + 3);
  const denied = (who, o) => x.env.expectDenied(who, 'out.save', 'saveOut', x.input(Object.assign({ studentId: stu }, o)));
  denied(T2, { occurredAt: AT(TWO_AGO) });      // 오늘 근무자가 이틀 전 occurredAt
  denied(T2, { occurredAt: AT(YESTERDAY) });    // 오늘 근무자가 근무가 아니었던 어제
  denied(T5, { occurredAt: AT(TODAY) });        // 어제 근무자가 오늘(근무 아님) 사건
  denied(T6, { occurredAt: AT(TWO_AGO) });      // 근무일은 맞지만 이틀 지남(창 밖)
  denied(T1, { occurredAt: AT(TODAY) });        // 교대로 넘긴 원래 근무자(담당 학생이 아니면 거부)
  denied(T4, { occurredAt: AT(TODAY) });        // 예비 지정만
  assert.strictEqual(x.tab().length, n, '거부된 호출은 0행');
});

test('이상한 occurredAt(Z·오프셋·날짜만)은 권한이 통과한 담당교사여도 입력 오류로 0행: 따로 보낸 ymd·두 값 섞기도 소용없다', () => {
  const x = makeEnv();
  const w = x.tab().length;
  for (const bad of ['2027-03-03T19:40Z', '2027-03-03T19:40:00+09:00', '2027-03-03', 'abc']) {
    const r = save(x, T1, x.input({ occurredAt: bad })).r;
    assert.strictEqual(r.ok, false, bad); assert.strictEqual(r.errors[0].field, 'occurredAt');
  }
  assert.strictEqual(save(x, T1, Object.assign(x.input({ occurredAt: '2027-03-02T19:40Z' }), { ymd: TODAY })).r.ok, false);
  assert.strictEqual(x.tab().length, w);
});

/* ───── 입력 검사 표 ───── */
test('입력 검사: 꺼진·자동 항목·없는 항목, 미래 일시, 입실 전·미등록 학생, 메모 201자, 적발 교사가 활성 교사가 아님 — 모두 오류이고 0행', () => {
  const x = makeEnv();
  const w = x.tab().length;
  x.env.asOwner((c) => c.updateRecord_('violation_rules', x.dorm.id, { active: 'FALSE' }, ADMIN));
  const bad = (o, field) => { const r = save(x, ADMIN, x.input(o)).r; assert.strictEqual(r.ok, false, JSON.stringify(o)); assert.ok(r.errors.some((e) => e.field === field), JSON.stringify(r.errors)); };
  bad({ ruleId: x.dorm.id }, 'ruleId'); bad({ ruleId: x.auto.id }, 'ruleId'); bad({ ruleId: 'nope' }, 'ruleId'); bad({ ruleId: '' }, 'ruleId');
  bad({ occurredAt: AT(TODAY, '20:30') }, 'occurredAt');            // 지금(20:00)보다 미래
  bad({ occurredAt: AT('2027-03-04', '09:00') }, 'occurredAt');
  bad({ studentId: x.late }, 'studentId');                          // 3/15 입실 예정
  bad({ studentId: x.acc.unenrolledStudentId }, 'studentId');
  x.env.expectDenied(ADMIN, 'out.save', 'saveOut', x.input({ studentId: '' }));   // 학생이 없으면 범위 검사가 먼저 거부
  bad({ memo: 'ㄱ'.repeat(201) }, 'memo');
  bad({ detectedBy: 'nope' }, 'detectedBy');
  bad({ detectedBy: x.id(STUDENT) }, 'detectedBy');                  // 학생 계정은 교사가 아니다
  x.env.asOwner((c) => c.updateRecord_('users', x.id(T3), { active: 'FALSE' }, ADMIN));
  bad({ detectedBy: x.id(T3) }, 'detectedBy');                       // 비활성 교사
  assert.strictEqual(x.tab().length, w);
  assert.strictEqual(save(x, ADMIN, x.input({ memo: 'ㄱ'.repeat(200) })).r.ok, true, '메모 200자는 가능');
  assert.strictEqual(save(x, ADMIN, x.input({ occurredAt: AT(TODAY, '20:00'), ruleId: x.phone.id, detectedBy: '' })).r.needsConfirm, true, '지금과 같은 시각은 미래가 아니다(같은 항목 중복 확인은 별도)');
});

test('끝난 기간: 종료 다음 날까지만 입력할 수 있다(종료일·다음 날 가능, 그다음 날부터 거부)', () => {
  const x = makeEnv();
  const end = x.term.end_date;
  const next = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  x.env.setNow(next(end, 1) + 'T10:00:00');
  assert.strictEqual(save(x, ADMIN, x.input({ occurredAt: AT(end, '10:00') })).r.ok, true, '종료 다음 날에도 종료일 사건은 입력할 수 있다');
  x.env.setNow(next(end, 2) + 'T10:00:00');
  const r = save(x, ADMIN, x.input({ occurredAt: AT(end, '11:00'), ruleId: x.dorm.id })).r;
  assert.strictEqual(r.ok, false); assert.ok(r.errors[0].message.includes('끝난 운영 기간'));
});

/* ───── 경고·2OUT ───── */
test('같은 학생·날·항목이 있거나 그날 자동 OUT이 있으면 확인(acknowledge) 뒤에만 저장, 다른 항목·다른 날은 경고 없음', () => {
  const x = makeEnv();
  assert.strictEqual(save(x, T1, x.input()).r.ok, true);
  const w = x.tab().length;
  const dup = save(x, T1, x.input()).r;
  assert.deepStrictEqual([dup.ok, dup.needsConfirm], [false, true]); assert.ok(dup.warnings[0].includes('같은 항목'));
  assert.strictEqual(x.tab().length, w, '확인 전에는 쓰지 않는다');
  assert.strictEqual(save(x, T1, x.input({ ruleId: x.dorm.id })).r.ok, true, '다른 항목은 경고 없음');
  const y = makeEnv();
  y.env.asOwner((c) => c.appendRecord_('violations_' + y.term.id.slice(0, 8), { term_id: y.term.id, student_id: y.mine.id, occurred_at: AT(TODAY, '19:00') + ':00', rule_id: y.auto.id,
    rule_name: '무단 지각·결석·이탈(미인정결석)', memo: '', detected_by: '', entered_by: ADMIN, status: '유효', source: 'F1자동', source_exception_id: 'e1', cancel_reason: '' }, ADMIN));
  const a = save(y, T1, y.input()).r;
  assert.strictEqual(a.needsConfirm, true); assert.ok(a.warnings[0].includes('자동'));
  assert.strictEqual(save(y, T1, y.input({ acknowledge: true })).r.ok, true);
});

test('previewOut: 쓰지 않고 "저장하면 N OUT" 안내(1건 → 1OUT, 이미 1건이면 2OUT 퇴실 대상), 다음 기간은 0건에서 시작', () => {
  const x = makeEnv();
  const w = x.tab().length, a0 = x.env.rows('audit_log').length;
  const p1 = call(x, T1, 'previewOut', x.input());
  assert.ok(p1.ok, JSON.stringify(p1)); assert.deepStrictEqual([p1.before.count, p1.after.label], [0, '1OUT']);
  assert.strictEqual(x.tab().length, w); assert.strictEqual(x.env.rows('audit_log').length, a0, '미리보기는 아무것도 쓰지 않는다');
  save(x, T1, x.input());
  const p2 = call(x, T1, 'previewOut', x.input({ ruleId: x.dorm.id }));
  assert.deepStrictEqual([p2.before.label, p2.after.label, p2.after.level], ['1OUT', '퇴실 대상', 2]);
  assert.strictEqual(save(x, T1, x.input({ ruleId: x.dorm.id })).r.after.label, '퇴실 대상');
  // 기간마다 따로 센다(학기마다 초기화): 다른 기간의 OUT은 이번 기간 수에 들어가지 않는다
  const levelOf = (rows, term) => plain(pure.outLevel_(rows, x.mine.id, term));
  const row = (term) => ({ term_id: term, student_id: x.mine.id, status: '유효' });
  assert.deepStrictEqual(levelOf([row('prev'), row('prev')], x.term.id).count, 0, '지난 기간 2건은 이번 기간 0건');
  assert.strictEqual(levelOf([row('prev'), row(x.term.id)], x.term.id).count, 1);
});

/* ───── 메일 ───── */
test('알림 메일(결정 49): 담당교사·담임(2OUT이면 관리자도)에게, 입력한 사람은 빼고, 학생 이름·메모 없이 날짜·항목·몇 OUT인지만, 락 밖, 메일이 실패해도 행은 저장', () => {
  const R1 = 'fake.r1@fakeschool.invalid', RH = 'fake.rh@fakeschool.invalid', RA = 'fake.ra@fakeschool.invalid';
  const x = makeEnv();
  const en = x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.mine.id);
  x.env.asOwner((c) => {
    c.addUser(R1, '실가짜담당', 'hall_teacher'); c.addUser(RA, '실가짜관리', 'admin');
    c.addUser(RH, '실가짜담임', 'homeroom');
    c.updateRecord_('users', x.env.rows('users').find((u) => u.email === RH).id, { homeroom_class: x.mine.grade + '-' + x.mine.class_no }, ADMIN);
    c.updateRecord_('enrollments', en.id, { teacher_email: R1 }, ADMIN);
  });
  const secretMemo = '비밀상황메모XYZ';
  const a = save(x, ADMIN, x.input({ memo: secretMemo }));
  assert.deepStrictEqual([a.r.ok, a.r.notified], [true, true]);
  assert.deepStrictEqual(a.sent.map((m) => m.to).sort(), [R1, RH].sort(), '1OUT: 담당교사·담임(관리자 ADMIN은 입력한 사람이라 빠지고 실가짜관리는 2OUT 때만)');
  assert.deepStrictEqual(a.locks, a.sent.map(() => false), '메일은 락 밖에서');
  for (const m of a.sent) assert.ok(!m.body.includes(x.mine.name) && !m.body.includes(secretMemo) && m.body.includes('3월 3일(수)') && m.body.includes(x.phone.name) && m.body.includes('이번 학기 1OUT입니다.') && !m.body.includes('퇴실 대상'), m.body);
  const b = save(x, ADMIN, x.input({ ruleId: x.dorm.id }));
  assert.deepStrictEqual(b.sent.map((m) => m.to).sort(), [R1, RA, RH].sort(), '2OUT: 관리자도');
  assert.ok(b.sent.every((m) => m.body.includes('이번 학기 2OUT(퇴실 대상)입니다.')), b.sent[0].body);
  const third = x.env.rows('violation_rules').find((r) => ![x.phone.id, x.dorm.id, x.auto.id].includes(r.id) && r.active !== 'FALSE');
  const t3 = save(x, ADMIN, x.input({ occurredAt: AT(TODAY, '19:50'), ruleId: third.id }));
  assert.deepStrictEqual(t3.sent.map((m) => m.to).sort(), [R1, RH].sort(), '3OUT부터는 관리자에게 다시 보내지 않는다');
  assert.ok(t3.sent.every((m) => m.body.includes('이번 학기 3OUT(퇴실 대상)입니다.')), t3.sent[0].body);
  const before = x.tab().length;
  const c = save(x, ADMIN, x.input({ occurredAt: AT(YESTERDAY), ruleId: x.phone.id }), { fail: true });
  assert.deepStrictEqual([c.r.ok, c.r.notified, c.r.notifyWarn, c.r.notifyReason], [true, false, true, 'failed']);
  assert.strictEqual(x.tab().length, before + 1, 'sendEmail 오류에도 행은 저장');
});

test('락: 바깥 락을 못 잡으면 "다른 사람이 저장 중" 오류·0행·메일 0통, 거부·검사 오류·확인 대기 때는 메일을 보내지 않는다', () => {
  const x = makeEnv();
  const w = x.tab().length;
  x.env.lock.failNext = 1;
  assert.throws(() => save(x, T1, x.input()), /다른 사람이 저장 중/);
  assert.strictEqual(x.tab().length, w);
  save(x, T1, x.input());
  const dup = save(x, T1, x.input());                          // 확인 대기
  assert.deepStrictEqual([dup.r.needsConfirm, dup.sent.length], [true, 0]);
  assert.deepStrictEqual(save(x, T1, x.input({ ruleId: 'nope' })).sent, []);
});

test('메일 받는 사람: 관리자는 처음 2OUT이 될 때만(3OUT부터는 담당·담임만), 꺼진 담당교사에게는 안 가고, 본인은 뺀다(vioNotifyTo_)', () => {
  const U = (email, roles, extra) => Object.assign({ email, roles, active: 'TRUE' }, extra || {});
  const en = { teacher_email: 'T@x.invalid' }, st = { grade: 1, class_no: 2 };
  const users = [U('t@x.invalid', 'hall_teacher'), U('h@x.invalid', 'homeroom', { homeroom_class: '1-2' }), U('a@x.invalid', 'admin'), U('o@x.invalid', 'homeroom', { homeroom_class: '1-3' })];
  const to = (b, a, actor, us) => plain(pure.vioNotifyTo_(us || users, en, st, b, a, actor || '')).sort();
  assert.deepStrictEqual(to(0, 1), ['h@x.invalid', 't@x.invalid']);
  assert.deepStrictEqual(to(1, 2), ['a@x.invalid', 'h@x.invalid', 't@x.invalid'], '처음 2OUT이 될 때 관리자도');
  assert.deepStrictEqual(to(2, 3), ['h@x.invalid', 't@x.invalid'], '이미 퇴실 대상이면 관리자에게 또 보내지 않는다');
  assert.deepStrictEqual(to(1, 2, 't@x.invalid'), ['a@x.invalid', 'h@x.invalid'], '입력한 본인은 뺀다');
  assert.deepStrictEqual(to(0, 1, '', [U('t@x.invalid', 'hall_teacher', { active: 'FALSE' }), users[1]]), ['h@x.invalid'], '꺼진 담당교사는 뺀다');
});

test('메일 문제 표시: 꺼져 있거나 받을 사람이 없으면 경고 아님(notifyWarn false), 보내려다 실패·한도 부족이면 경고', () => {
  const off = makeEnv({ mail: false });
  const a = save(off, ADMIN, off.input());
  assert.deepStrictEqual([a.r.ok, a.r.notified, a.r.notifyWarn, a.r.notifyReason], [true, false, false, 'off']);
  const x = makeEnv();
  x.env.asOwner((c) => c.updateRecord_('enrollments', x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.mine.id).id, { teacher_email: ADMIN }, ADMIN));
  const b = save(x, ADMIN, x.input());   // 받을 사람이 입력자 본인뿐
  assert.deepStrictEqual([b.r.ok, b.r.notifyWarn, b.r.notifyReason], [true, false, 'noRecipients'], '받을 수 있는 주소가 없음(가짜 주소 제외)은 경고 아님');
  const q = makeEnv();
  const lowQuota = plain(q.env.as(ADMIN, (c) => { c.MailApp = { sendEmail() {}, getRemainingDailyQuota: () => 0 }; return c.saveOut(q.input()); }));
  assert.deepStrictEqual([lowQuota.ok, lowQuota.notifyWarn, lowQuota.notifyReason], [true, true, 'quota'], '한도 부족은 경고');
});

test('OUT은 사건이 일어난 날의 기간에 저장된다(오늘 기간이 아니라): 기간이 끝난 다음 날 종료일 사건은 옛 기간 탭·옛 term_id, 새 기간 미리보기는 0건. 새 기간 탭이 아직 없어도 저장은 탭을 만든다', () => {
  const x = makeEnv();
  const end = x.term.end_date, nextStart = new Date(end + 'T00:00:00Z'); nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const ns = nextStart.toISOString().slice(0, 10), ne = new Date(nextStart); ne.setUTCDate(ne.getUTCDate() + 60);
  x.env.asOwner((c) => c.appendRecord_('terms', { name: '다음 방학 가짜', type: '방학', start_date: ns, end_date: ne.toISOString().slice(0, 10), memo: '' }, ADMIN));
  x.env.setNow(ns + 'T10:00:00');
  const r = save(x, ADMIN, x.input({ occurredAt: AT(end, '10:00') })).r;
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const last = x.tab()[x.tab().length - 1];
  assert.deepStrictEqual([last.term_id, last.occurred_at.slice(0, 10)], [x.term.id, end], '옛 기간 탭·옛 term_id');
  // 새 기간에 같은 학생을 등록하고 0건에서 시작하는지 본다(미등록이면 어떤 단언도 의미 없다)
  const nt = x.env.rows('terms').find((t) => t.name === '다음 방학 가짜');
  const oldEnr = x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.mine.id);
  x.env.asOwner((c) => c.appendRecord_('enrollments', { term_id: nt.id, student_id: x.mine.id, teacher_email: oldEnr.teacher_email, veritas: oldEnr.veritas, commute_type: oldEnr.commute_type, end_type: '', memo: '' }, ADMIN));
  const p = call(x, ADMIN, 'previewOut', x.input({ occurredAt: AT(ns, '10:00') }));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.strictEqual(p.before.count, 0, '새 기간은 0건에서 시작');
  assert.strictEqual(call(x, ADMIN, 'getOutContext', ns).levels[x.mine.id], 0, 'levels도 0');
});

test('getOutContext: now(HH:mm)·periodWord·dutyYesterday, 미래·기간 밖 날짜는 역할은 canRecord true지만 dateOk false(날짜 칸은 남는다)', () => {
  const x = makeEnv();
  x.duty(YESTERDAY, '21:30조', T2);
  const c = call(x, T1, 'getOutContext', '');
  assert.deepStrictEqual([c.now, c.periodWord, c.dutyYesterday], ['20:00', '이번 학기', false]);
  assert.strictEqual(call(x, T2, 'getOutContext', '').dutyYesterday, true, '어제 근무자가 오늘 아침 열면 안내용');
  assert.strictEqual(call(x, T2, 'getOutContext', YESTERDAY).dutyYesterday, false, '날짜를 어제로 바꾸면 안내는 필요 없다');
  const f = call(x, T1, 'getOutContext', '2027-03-04'), o = call(x, T1, 'getOutContext', '2020-01-01');
  assert.deepStrictEqual([f.canRecord, f.dateOk, !!f.dateReason, f.students.length], [true, false, true, 0], '미래 날짜');
  assert.deepStrictEqual([o.canRecord, o.dateOk, !!o.dateReason], [true, false, true], '기간 밖 날짜');
  assert.strictEqual(call(x, HOMEROOM, 'getOutContext', '').canRecord, false, '담임은 역할이 기록 못 함');
});

test('기간이 끝난 다음 날(사이 날) 아침: 오늘 날짜는 dateOk false지만 끝 날 근무자는 dutyYesterday, 끝 날(어제)은 dateOk true·학생이 나온다. 이틀 뒤에는 둘 다 닫힌다', () => {
  const x = makeEnv();
  const next = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const end = x.term.end_date;
  x.duty(end, '21:30조', T2);
  x.env.setNow(next(end, 1) + 'T08:00:00');
  const today = call(x, T2, 'getOutContext', '');
  assert.deepStrictEqual([today.canRecord, today.dateOk, today.dutyYesterday, today.students.length], [true, false, true, 0], '오늘은 기간 밖이지만 안내는 나온다');
  const y = call(x, T2, 'getOutContext', end);
  assert.deepStrictEqual([y.dateOk, y.students.length > 0], [true, true], '끝 날로 바꾸면 기록할 수 있다(저장도 허용)');
  assert.strictEqual(save(x, T2, x.input({ occurredAt: AT(end, '22:30') })).r.ok, true, '서버도 끝 날 22:30 저장을 허용');
  assert.strictEqual(call(x, T3, 'getOutContext', '').dutyYesterday, false, '근무가 아니던 교사에게는 안내 없음');
  x.env.setNow(next(end, 2) + 'T08:00:00');
  assert.deepStrictEqual([call(x, T2, 'getOutContext', '').dutyYesterday, call(x, T2, 'getOutContext', end).dateOk], [false, false], '이틀 뒤는 안내도 날짜도 닫힘');
});

test('방학 기간이면 periodWord가 "이번 기간", 학기면 "이번 학기"', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.updateRecord_('terms', x.term.id, { type: '방학' }, ADMIN));
  assert.strictEqual(call(x, T1, 'getOutContext', '').periodWord, '이번 기간');
});

test('꺼진 항목은 "지금 쓰지 않는 항목", 오류 문구에 ISO 날짜 형식이 없다', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.updateRecord_('violation_rules', x.dorm.id, { active: 'FALSE' }, ADMIN));
  const r = save(x, T1, x.input({ ruleId: x.dorm.id })).r;
  assert.ok(r.errors[0].message.includes('쓰지 않는'), r.errors[0].message);
  const b = save(x, T1, x.input({ occurredAt: 'x' })).r;
  assert.ok(b.errors.every((e) => !/\d{4}-\d\d-\d\d/.test(e.message)), JSON.stringify(b.errors));
});

test('그 기간의 OUT 탭이 없어도 저장은 탭을 만들고 저장한다(미리보기만 되고 저장이 던지지 않는다)', () => {
  const x = makeEnv();
  const name = 'violations_' + x.term.id.slice(0, 8);
  x.env.asOwner((c) => { const ss = c.openFile_('db'); ss.deleteSheet(ss.getSheetByName(name)); c.invalidate_('db', name); });
  assert.strictEqual(call(x, T1, 'previewOut', x.input()).ok, true, '탭이 없어도 미리보기는 된다');
  const { r } = save(x, T1, x.input());
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(x.tab().length, 1);
});

test('빈틈 메우기: previewOut 응답에 이메일 없음, 담당교사 이메일 대소문자가 달라도 담당으로 보고, 앱 주소를 못 읽어도 저장되고, 탭이 있으면 ensureTermSheet_를 부르지 않는다', () => {
  const x = makeEnv();
  assert.ok(!JSON.stringify(call(x, T1, 'previewOut', x.input({ detectedBy: x.id(T2) }))).includes('@'));
  const en = x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.mine.id);
  x.env.asOwner((c) => c.updateRecord_('enrollments', en.id, { teacher_email: ' ' + T1.toUpperCase() + ' ' }, ADMIN));
  assert.ok(call(x, T1, 'getOutContext', '').students.some((s) => s.id === x.mine.id), '대소문자·공백이 달라도 담당 학생');
  const r = plain(x.env.as(T1, (c) => {
    c.MailApp = { sendEmail() {}, getRemainingDailyQuota: () => 100 };
    c.ScriptApp = { getService: () => { throw new Error('주소 오류(가짜)'); } };
    return c.saveOut(x.input());
  }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(x.tab().length, 1, '저장은 끝났다');
  let ensured = 0;
  x.env.as(T1, (c) => { const orig = c.ensureTermSheet_; c.ensureTermSheet_ = function () { ensured++; return orig.apply(null, arguments); }; c.MailApp = { sendEmail() {}, getRemainingDailyQuota: () => 100 }; return c.saveOut(x.input({ ruleId: x.dorm.id })); });
  assert.strictEqual(ensured, 0, '탭이 있으면 다시 만들지 않는다');
});

test('적발 교사 users.email이 대소문자·공백이 섞여 있어도 detected_by는 소문자 이메일로 저장된다', () => {
  const x = makeEnv();
  const t3 = x.env.rows('users').find((u) => u.email === T3);
  x.env.asOwner((c) => c.updateRecord_('users', t3.id, { email: ' ' + T3.toUpperCase() + ' ' }, ADMIN));
  const { r } = save(x, T1, x.input({ detectedBy: t3.id }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(x.tab()[x.tab().length - 1].detected_by, T3);
});
