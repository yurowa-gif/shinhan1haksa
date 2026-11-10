/** C11b F4 OUT 목록·관리자 취소: R4 gas-fakes 환경. 가짜 데이터만. */
const assert = require('assert');
const { test, plain, loadGs } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  T2 = 'fake.t2@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.addUser(T2, '가짜교사2', 'hall_teacher'));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const students = env.rows('students');
  const hr = env.rows('users').find((u) => u.email === HOMEROOM).homeroom_class;
  const inHr = (s) => hr === s.grade + '-' + s.class_no;
  const active = (s) => !env.rows('status_changes').some((c) => c.student_id === s.id && c.item === '학사' && c.effective_date > TODAY);
  const mine = students.find((s) => active(s) && inHr(s) && enr.some((e) => e.student_id === s.id));            // 담임 반 학생
  const other = students.find((s) => active(s) && !inHr(s) && enr.some((e) => e.student_id === s.id && e.teacher_email !== T1));   // 다른 반, T1 담당 아님
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const tabName = 'violations_' + term.id.slice(0, 8);
  const tab = () => env.rows(tabName);
  const add = (student, extra) => env.asOwner((c) => c.appendRecord_(tabName, Object.assign({ term_id: term.id, student_id: student.id, occurred_at: TODAY + 'T19:40:00', rule_id: rule.id, rule_name: rule.name, memo: '메모',
    detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, extra || {}), ADMIN));
  return { env, term, mine, other, rule, tab, add, tabName, hr };
}
const call = (x, who, fn, ...args) => plain(x.env.call(who, fn, ...args));
const pure = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/OutRules.gs', 'src/features/Outs.gs']);

test('vioVisibleIds_: 관리자·출결 담당 전체, 학사 교사는 wide면 전체·아니면 담당, 담임은 자기 반, 그 기간 등록자만', () => {
  const st = [{ id: 's1', grade: 1, class_no: 2 }, { id: 's2', grade: 1, class_no: 3 }, { id: 's3', grade: 2, class_no: 2 }];
  const en = [{ term_id: 't', student_id: 's1', teacher_email: 'a@x' }, { term_id: 't', student_id: 's2', teacher_email: 'b@x' }, { term_id: 'old', student_id: 's3', teacher_email: 'a@x' }];
  const ids = (roles, wide, extra) => Object.keys(pure.vioVisibleIds_(Object.assign({ roles, email: 'a@x', homeroomClass: '1-2' }, extra), en, st, 't', wide)).sort();
  assert.deepStrictEqual(ids(['admin'], false), ['s1', 's2']);
  assert.deepStrictEqual(ids(['attendance'], false), ['s1', 's2'], '출결 담당은 전체');
  assert.deepStrictEqual(ids(['hall_teacher'], true), ['s1', 's2'], 'wide: 근무 여부와 상관없이 전체');
  assert.deepStrictEqual(ids(['hall_teacher'], false), ['s1'], 'wide 아니면 담당만');
  assert.deepStrictEqual(ids(['homeroom'], true), ['s1'], '담임은 wide여도 자기 반');
  assert.deepStrictEqual(ids(['student'], true), [], '학생은 없음');
  assert.deepStrictEqual(ids(['hall_teacher', 'homeroom'], false, { email: 'b@x' }), ['s1', 's2'], '여러 역할은 합집합');
});

test('listOuts(term): 학사 교사·출결 담당·관리자는 그 기간 등록 학생 전체, 담임은 자기 반만, 학생·학부모·근무표 담당자만 가진 계정은 거부', () => {
  const x = makeEnv();
  x.add(x.mine); x.add(x.other, { rule_name: x.rule.name });
  const ids = (who) => call(x, who, 'listOuts', { scope: 'term' }).items.map((i) => i.studentId).sort();
  const both = [x.mine.id, x.other.id].sort();
  assert.deepStrictEqual([ids(ADMIN), ids(ATT), ids(T1), ids(T2)], [both, both, both, both], 'T1은 담당 아닌 학생도(결정 45·53), T2는 근무가 아니어도');
  assert.deepStrictEqual(ids(HOMEROOM), [x.mine.id], '담임은 자기 반만');
  for (const who of [STUDENT, PARENT, DUTY]) x.env.expectDenied(who, 'out.view', 'listOuts', { scope: 'term' });
});

test('listOuts: 이메일 없이 이름만(적발 교사·입력자), 적발 교사 빈칸은 (모름), 학생별 요약은 많은 순, 단계 표시', () => {
  const x = makeEnv();
  x.add(x.mine); x.add(x.mine, { detected_by: '' }); x.add(x.other);
  const r = call(x, T1, 'listOuts', { scope: 'term' });
  assert.ok(!JSON.stringify(r).includes('@'), '이메일 없음');
  assert.deepStrictEqual(r.items.map((i) => i.detectedBy).sort(), ['(모름)', r.items[0].detectedBy, r.items[0].detectedBy].sort());
  assert.ok(r.items.some((i) => i.detectedBy === '(모름)'));
  assert.deepStrictEqual(r.summary.map((s) => [s.studentId, s.count, s.label]), [[x.mine.id, 2, '퇴실 대상'], [x.other.id, 1, '1OUT']]);
  assert.strictEqual(r.canCancel, false, '학사 교사는 취소 버튼 없음');
  assert.strictEqual(call(x, ADMIN, 'listOuts', { scope: 'term' }).canCancel, true);
});

test('listOuts(student): 볼 수 있는 학생만(담임의 다른 반 학생은 denied:out.view), today는 그날 발생한 것만', () => {
  const x = makeEnv();
  x.add(x.mine); x.add(x.other, { occurred_at: '2027-03-02T21:00:00' });
  assert.strictEqual(call(x, HOMEROOM, 'listOuts', { scope: 'student', studentId: x.mine.id }).items.length, 1);
  x.env.expectDenied(HOMEROOM, 'out.view', 'listOuts', { scope: 'student', studentId: x.other.id });
  x.env.expectDenied(HOMEROOM, 'out.view', 'listOuts', { scope: 'student', studentId: 'no-such' });
  assert.deepStrictEqual(call(x, T1, 'listOuts', { scope: 'today' }).items.map((i) => i.studentId), [x.mine.id], '오늘 것만');
  assert.deepStrictEqual(call(x, T1, 'listOuts', { scope: 'today', date: '2027-03-02' }).items.map((i) => i.studentId), [x.other.id]);
  assert.ok(x.env.errorOf(T1, (c) => c.listOuts({ scope: 'bogus' })));
});

test('listOuts: 지난 기간은 조회만(canCancel false, closed true), 기간을 고를 수 있다', () => {
  const x = makeEnv();
  x.add(x.mine);
  x.env.setNow('2027-12-31T10:00:00');
  const r = call(x, ADMIN, 'listOuts', { scope: 'term', termId: x.term.id });
  assert.deepStrictEqual([r.items.length, r.term.closed, r.canCancel, r.items[0].canCancel], [1, true, false, false]);
  assert.ok(r.terms.some((t) => t.id === x.term.id));
});

test('cancelOut: 관리자만. status 취소·사유 저장·audit update, 삭제 없음, 취소 뒤 단계가 줄어든다. 담당·출결·담임은 denied:out.cancel + 0 변경', () => {
  const x = makeEnv();
  x.add(x.mine); x.add(x.mine, { occurred_at: TODAY + 'T20:00:00' });
  const [a, b] = x.tab();
  for (const who of [T1, ATT, HOMEROOM, STUDENT, PARENT, DUTY]) x.env.expectDenied(who, 'out.cancel', 'cancelOut', x.term.id, a.id, '잘못 입력했습니다');
  assert.ok(x.tab().every((r) => r.status === '유효'));
  const r = call(x, ADMIN, 'cancelOut', x.term.id, a.id, '  잘못 입력했습니다  ');
  assert.deepStrictEqual([r.ok, r.after.count, r.after.label], [true, 1, '1OUT']);
  const rows = x.tab();
  assert.strictEqual(rows.length, 2, '삭제하지 않는다');
  const ra = rows.find((q) => q.id === a.id);
  assert.deepStrictEqual([ra.status, ra.cancel_reason, rows.find((q) => q.id === b.id).status], ['취소', '잘못 입력했습니다', '유효']);
  assert.ok(x.env.rows('audit_log').some((l) => l.action === 'update' && l.row_id === a.id && l.sheet === x.tabName));
  const l = call(x, ADMIN, 'listOuts', { scope: 'term' });
  assert.deepStrictEqual([l.items.find((i) => i.id === a.id).status, l.summary[0].count], ['취소', 1], '취소된 행은 목록에 남고 단계에서는 빠진다');
});

test('cancelOut 입력 검사: 사유 2~200자, [자동] 머리말 거부(앞 공백·같은 글자 포함), 이미 취소·없는 id·없는 기간·지난 기간 거부 — 모두 변경 0건', () => {
  const x = makeEnv();
  x.add(x.mine);
  const a = x.tab()[0];
  const snap = () => JSON.stringify(x.tab());
  const s0 = snap();
  const bad = (reason, id, termId) => { const r = call(x, ADMIN, 'cancelOut', termId || x.term.id, id || a.id, reason); assert.strictEqual(r.ok, false, String(reason)); return r.errors[0]; };
  assert.strictEqual(bad('가').field, 'reason');
  assert.strictEqual(bad('').field, 'reason');
  assert.strictEqual(bad(null).field, 'reason');
  assert.strictEqual(bad('가'.repeat(201)).field, 'reason');
  assert.strictEqual(bad('[자동] 규칙 취소').field, 'reason');
  assert.strictEqual(bad('   [자동] 규칙 취소').field, 'reason', '앞 공백을 지우고도 머리말 검사');
  assert.strictEqual(bad('잘못 입력', 'no-such').field, 'id');
  assert.strictEqual(bad('잘못 입력', a.id, 'nope0000').field, 'termId');
  assert.strictEqual(snap(), s0, '거부는 아무것도 쓰지 않는다');
  assert.strictEqual(call(x, ADMIN, 'cancelOut', x.term.id, a.id, '가'.repeat(200)).ok, true, '200자는 가능');
  assert.strictEqual(bad('다시 취소', a.id).field, 'id', '이미 취소');
  const y = makeEnv(); y.add(y.mine);
  y.env.setNow('2027-12-31T10:00:00');
  const e = call(y, ADMIN, 'cancelOut', y.term.id, y.tab()[0].id, '지난 기간 취소');
  assert.deepStrictEqual([e.ok, e.errors[0].field], [false, 'termId']);
  assert.strictEqual(y.tab()[0].status, '유효');
});

test('cancelOut: F1자동 행도 관리자가 직접 취소할 수 있고(사유에 [자동] 머리말 없음), 락을 못 잡으면 오류·0변경', () => {
  const x = makeEnv();
  x.add(x.mine, { source: 'F1자동', source_exception_id: 'e1', rule_name: '무단 지각·결석·이탈(미인정 결석)' });
  const id = x.tab()[0].id;
  x.env.lock.failNext = 1;
  const err = x.env.errorOf(ADMIN, (c) => c.cancelOut(x.term.id, id, '직접 취소'));
  assert.ok(err, '락 실패는 오류');
  assert.strictEqual(x.tab()[0].status, '유효');
  assert.strictEqual(call(x, ADMIN, 'cancelOut', x.term.id, id, '직접 취소').ok, true);
  assert.strictEqual(x.tab()[0].status, '취소');
});

test('vioHomeInfo_: 학사 교사 홈은 내 담당 학생만(이름 포함 많은 순), 담임은 우리 반 학생별 수, 출결·관리자는 전체. 취소 건은 세지 않는다', () => {
  const x = makeEnv();
  const enr = x.env.rows('enrollments').filter((e) => e.term_id === x.term.id);
  const ownS = x.env.rows('students').find((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === T1) && s.id !== x.mine.id && s.id !== x.other.id);
  x.add(x.mine); x.add(x.mine, { occurred_at: '2027-03-02T20:00:00' }); x.add(x.other); x.add(x.other, { status: '취소', cancel_reason: '잘못' });
  x.add(ownS);
  const info = (who, role) => plain(x.env.as(who, (c) => c.vioHomeInfo_(c.requirePermission_('out.view'), role)));
  const t = info(T1, 'hall_teacher');
  const mineIsT1 = enr.some((e) => e.student_id === x.mine.id && e.teacher_email === T1);
  assert.ok(mineIsT1, '시험 준비: mine은 T1 담당');
  assert.deepStrictEqual([t.canRecord, t.out2, t.out1, t.today], [true, 1, 1, 2], '내 담당 학생만 센다(담당 아닌 other는 홈 숫자에 없다)');
  assert.ok(t.list.every((r) => enr.some((e) => e.student_id === r.studentId && e.teacher_email === T1)), '홈 목록은 내 담당 학생');
  assert.ok(t.list.some((r) => r.studentId === ownS.id && r.student.name), '이름 포함');
  assert.ok(!t.list.some((r) => r.studentId === x.other.id));
  const h = info(HOMEROOM, 'homeroom');
  assert.deepStrictEqual([h.canRecord, h.perStudent[x.mine.id], h.perStudent[x.other.id]], [false, 2, undefined], '담임은 우리 반만');
  assert.strictEqual(info(ATT, 'attendance').canRecord, false);
  const a = info(ADMIN, 'admin');
  assert.deepStrictEqual([a.out2, a.out1], [1, 2], '관리자는 전체(other는 취소 건을 빼고 1OUT)');
});

test('listOuts: 자동 OUT의 적발 교사(쉼표로 이은 이메일 여럿)는 이름을 \'·\'로 잇고 없는 사람만 미등록, 이메일은 없다', () => {
  const x = makeEnv();
  const auto = x.env.rows('users').filter((u) => u.email === T1 || u.email === HOMEROOM).map((u) => u.email);
  x.add(x.mine, { source: 'F1자동', detected_by: auto[0] + ', ' + auto[1] + ',fake.ghost@example.com', rule_name: '무단 지각·결석·이탈(미인정 결석)' });
  const r = call(x, ADMIN, 'listOuts', { scope: 'term' });
  const names = auto.map((e) => x.env.rows('users').find((u) => u.email === e).name);
  assert.strictEqual(r.items[0].detectedBy, names.join('·') + '·(등록 안 된 교사)');
  assert.ok(!JSON.stringify(r).includes('@'));
});

test('listOuts: 기간을 바꿔 보기·학생 범위는 그 기간 등록으로 판정(결정 53), 오늘 탭은 고른 기간과 무관, 모르는 termId는 오류', () => {
  const x = makeEnv();
  // 다른 기간(2학기)을 만들고 한 학생만 거기 등록한다
  const t2 = '2027-08-20', t2e = '2027-12-20';
  x.env.asOwner((c) => c.appendRecord_('terms', { name: '2027 2학기 가짜', type: '학기', start_date: t2, end_date: t2e, memo: '' }, ADMIN));
  const term2 = x.env.rows('terms').find((t) => t.name === '2027 2학기 가짜');
  const enr1 = x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.mine.id);
  x.env.asOwner((c) => c.appendRecord_('enrollments', { term_id: term2.id, student_id: x.mine.id, teacher_email: enr1.teacher_email, veritas: enr1.veritas, commute_type: enr1.commute_type, end_type: '', memo: '' }, ADMIN));
  x.env.asOwner((c) => c.ensureTermSheet_('violations', term2.id));
  const tab2 = 'violations_' + term2.id.slice(0, 8);
  x.env.asOwner((c) => c.appendRecord_(tab2, { term_id: term2.id, student_id: x.mine.id, occurred_at: '2027-08-25T20:00:00', rule_id: x.rule.id, rule_name: x.rule.name, memo: '', detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  x.add(x.mine); x.add(x.other);
  const r2 = call(x, ADMIN, 'listOuts', { scope: 'term', termId: term2.id });
  assert.deepStrictEqual([r2.term.id, r2.items.length, r2.items[0].studentId, r2.term.closed, r2.canCancel, r2.items[0].canCancel], [term2.id, 1, x.mine.id, false, true, true], '그 기간의 행(아직 닫히지 않은 기간이라 관리자는 취소 가능)');
  assert.strictEqual(call(x, T1, 'listOuts', { scope: 'term', termId: term2.id }).canCancel, false, '학사 교사는 취소 없음');
  // 한 기간에만 등록된 학생: 2학기 범위에서 other는 보이지 않는다(1학기 이번 기간 등록으로 판정하지 않는다)
  assert.ok(!r2.summary.some((q) => q.studentId === x.other.id));
  x.env.expectDenied(HOMEROOM, 'out.view', 'listOuts', { scope: 'student', studentId: x.other.id, termId: term2.id });
  x.env.expectDenied(T1, 'out.view', 'listOuts', { scope: 'student', studentId: x.other.id, termId: term2.id });
  assert.ok(call(x, T1, 'listOuts', { scope: 'student', studentId: x.mine.id, termId: term2.id }).items.length === 1);
  // 가짜교사3(학사 교사 + 출결 담당)
  x.env.asOwner((c) => c.addUser('fake.t3@example.com', '가짜교사3', 'hall_teacher,attendance'));
  assert.strictEqual(call(x, 'fake.t3@example.com', 'listOuts', { scope: 'term', termId: term2.id }).items.length, 1);
  // 오늘 탭: termId를 2학기로 보내도 오늘이 속한 기간(1학기)의 오늘 기록
  const today = call(x, ADMIN, 'listOuts', { scope: 'today', termId: term2.id });
  assert.deepStrictEqual([today.term.id, today.items.length], [x.term.id, 2]);
  assert.throws(() => x.env.call(ADMIN, 'listOuts', { scope: 'term', termId: 'zzzzzzzz' }), /운영 기간을 찾을 수 없습니다/);
});

test('cancelOut: 기간이 끝난 다음 날까지는 취소 가능, 그다음 날부터 거부(ASSUMPTION: 저장과 같은 기준). 사유가 문자열이 아니면 거부', () => {
  const x = makeEnv();
  x.add(x.mine); x.add(x.other);
  const [a, b] = x.tab();
  const next = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  for (const bad of [['x', 'y'], 5, { a: 1 }, true]) assert.strictEqual(call(x, ADMIN, 'cancelOut', x.term.id, a.id, bad).ok, false);
  x.env.setNow(next(x.term.end_date, 1) + 'T10:00:00');
  assert.strictEqual(call(x, ADMIN, 'cancelOut', x.term.id, a.id, '종료 다음 날 취소').ok, true);
  x.env.setNow(next(x.term.end_date, 2) + 'T10:00:00');
  assert.strictEqual(call(x, ADMIN, 'cancelOut', x.term.id, b.id, '이틀 뒤 취소').ok, false);
  assert.strictEqual(x.tab().find((q) => q.id === b.id).status, '유효');
});

test('listOuts 서버 필드: stats(취소 건·퇴실 처리된 학생 제외), isMine, latest(가장 새 유효 행), left(학사 퇴실 뒤)·맨 뒤 정렬, hasMine, 오늘 탭 date', () => {
  const x = makeEnv();
  const enr = x.env.rows('enrollments').filter((e) => e.term_id === x.term.id);
  const ownS = x.env.rows('students').find((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === T1) && s.id !== x.other.id);
  x.add(ownS, { occurred_at: '2027-03-02T20:00:00' }); x.add(ownS, { occurred_at: '2027-03-03T19:00:00', rule_name: '가장 새 기록' });
  x.add(ownS, { occurred_at: '2027-03-03T21:00:00', status: '취소', cancel_reason: '잘못', rule_name: '취소된 더 새 기록' });
  x.add(x.other);
  const t = call(x, T1, 'listOuts', { scope: 'term' });
  assert.deepStrictEqual(t.stats, { records: 3, out1Students: 1, out2Students: 1 }, '취소 1건은 기록 수에서 빠진다');
  const sm = (r, id) => r.summary.find((q) => q.studentId === id);
  assert.deepStrictEqual([sm(t, ownS.id).isMine, sm(t, x.other.id).isMine, t.hasMine], [true, false, true]);
  assert.deepStrictEqual([sm(t, ownS.id).latest.ruleName, sm(t, ownS.id).latest.occurredAt], ['가장 새 기록', '2027-03-03T19:00:00'], '취소된 행은 latest가 아니다');
  assert.strictEqual(call(x, HOMEROOM, 'listOuts', { scope: 'term' }).hasMine, false, '담당 학생이 없는 사람');
  // 학사 퇴실 뒤: left true, 통계에서 빠지고 맨 뒤
  x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: ownS.id, item: '학사', value: '퇴실', effective_date: '2027-03-03', reason: '2OUT 퇴실', memo: '', status: '유효' }, ADMIN));
  const t2 = call(x, ADMIN, 'listOuts', { scope: 'term' });
  assert.deepStrictEqual([sm(t2, ownS.id).left, t2.summary[t2.summary.length - 1].studentId, t2.stats.out2Students, t2.stats.out1Students], [true, ownS.id, 0, 1]);
  assert.strictEqual(call(x, ADMIN, 'listOuts', { scope: 'today' }).date, '2027-03-03');
});

test('listOuts 오늘 탭: date를 다른 기간 날짜로 주면 그 기간(2학기)의 그날 기록. 홈: 학사 교사 겸 출결(가짜교사3)은 자기 학생만·많은 순·6명 이내', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.appendRecord_('terms', { name: '2027 2학기 가짜', type: '학기', start_date: '2027-08-20', end_date: '2027-12-20', memo: '' }, ADMIN));
  const t2 = x.env.rows('terms').find((t) => t.name === '2027 2학기 가짜');
  const enr1 = x.env.rows('enrollments').find((e) => e.term_id === x.term.id && e.student_id === x.mine.id);
  x.env.asOwner((c) => { c.appendRecord_('enrollments', { term_id: t2.id, student_id: x.mine.id, teacher_email: enr1.teacher_email, veritas: enr1.veritas, commute_type: enr1.commute_type, end_type: '', memo: '' }, ADMIN); c.ensureTermSheet_('violations', t2.id); });
  x.env.asOwner((c) => c.appendRecord_('violations_' + t2.id.slice(0, 8), { term_id: t2.id, student_id: x.mine.id, occurred_at: '2027-08-25T20:00:00', rule_id: x.rule.id, rule_name: x.rule.name, memo: '', detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  const r = call(x, ADMIN, 'listOuts', { scope: 'today', date: '2027-08-25' });
  assert.deepStrictEqual([r.term.id, r.items.length, r.date], [t2.id, 1, '2027-08-25']);
  // 홈: 가짜교사3은 hall_teacher + attendance — 학사 교사로 볼 때 자기 담당 학생만
  const T3 = 'fake.t3@example.com';
  x.env.asOwner((c) => c.addUser(T3, '가짜교사3', 'hall_teacher,attendance'));
  const mineEnr = x.env.rows('enrollments').filter((e) => e.term_id === x.term.id);
  const students = x.env.rows('students').filter((s) => mineEnr.some((e) => e.student_id === s.id)).slice(0, 8);
  students.forEach((s, i) => {
    x.env.asOwner((c) => c.updateRecord_('enrollments', mineEnr.find((e) => e.student_id === s.id).id, { teacher_email: i < 7 ? T3 : T1 }, ADMIN));
    for (let k = 0; k <= i % 3; k++) x.add(s, { occurred_at: '2027-03-0' + (2 + (k % 2)) + 'T1' + k + ':00:00' });
  });
  const info = plain(x.env.as(T3, (c) => c.vioHomeInfo_(c.requirePermission_('out.view'), 'hall_teacher')));
  assert.ok(info.list.length <= 6 && info.list.length > 0, String(info.list.length));
  assert.ok(info.list.every((q) => students.slice(0, 7).some((s) => s.id === q.studentId)), '자기 학생만');
  assert.ok(info.list.every((q, i, a) => i === 0 || a[i - 1].count >= q.count), '많은 순');
  const as = plain(x.env.as(T3, (c) => c.vioHomeInfo_(c.requirePermission_('out.view'), 'attendance')));
  assert.strictEqual(as.canRecord, false);
  assert.ok(as.out1 + as.out2 >= info.out1 + info.out2, '출결 담당으로 보면 전체');
});

test('홈 숫자는 퇴실 처리된 학생(오늘 퇴실·내일부터 적용되는 2OUT 퇴실)을 빼며 목록 left와 같다. mailOn은 설정을 따른다. 다른 기간에 담당이 다르면 isMine·hasMine이 거짓', () => {
  const x = makeEnv();
  const enr = x.env.rows('enrollments').filter((e) => e.term_id === x.term.id);
  const ownS = x.env.rows('students').find((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  x.add(ownS); x.add(ownS, { occurred_at: '2027-03-02T20:00:00' });
  const adm = () => plain(x.env.call(ADMIN, 'getHomeData', 'admin')).out;
  const t1 = () => plain(x.env.call(T1, 'getHomeData', 'hall_teacher')).out;
  assert.deepStrictEqual([adm().out2, t1().out2], [1, 1]);
  assert.strictEqual(adm().mailOn, false);
  x.env.scriptProps.MAIL_ENABLED = 'true';
  assert.strictEqual(adm().mailOn, true);
  // 내일부터 적용되는 2OUT 퇴실: 목록 left true, 홈에서 빠진다
  x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: ownS.id, item: '학사', value: '퇴실', effective_date: '2027-03-04', reason: '2OUT 퇴실', memo: '[2OUT] out:x note:y', status: '유효' }, ADMIN));
  assert.deepStrictEqual([adm().out2, t1().out2, adm().list ? adm().list.length : 0], [0, 0, 0]);
  assert.strictEqual(call(x, ADMIN, 'listOuts', { scope: 'term' }).summary.find((q) => q.studentId === ownS.id).left, true);
  // 사유만 있는 퇴실도, 오늘 적용되는 일반 퇴실도 같은 규칙
  const y = makeEnv();
  y.add(y.mine); y.add(y.mine, { occurred_at: '2027-03-02T20:00:00' });
  y.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: y.mine.id, item: '학사', value: '퇴실', effective_date: '2027-03-03', reason: '개인 사정', memo: '', status: '유효' }, ADMIN));
  assert.strictEqual(plain(y.env.call(ADMIN, 'getHomeData', 'admin')).out.out2, 0);
  // 2학기에 담당이 다르면 isMine·hasMine 거짓
  const z = makeEnv();
  z.env.asOwner((c) => c.appendRecord_('terms', { name: '2027 2학기 가짜', type: '학기', start_date: '2027-08-20', end_date: '2027-12-20', memo: '' }, ADMIN));
  const t2 = z.env.rows('terms').find((t) => t.name === '2027 2학기 가짜');
  const e1 = z.env.rows('enrollments').find((e) => e.term_id === z.term.id && e.student_id === z.mine.id);
  z.env.asOwner((c) => { c.appendRecord_('enrollments', { term_id: t2.id, student_id: z.mine.id, teacher_email: 'someone.else@example.com', veritas: e1.veritas, commute_type: e1.commute_type, end_type: '', memo: '' }, ADMIN); c.ensureTermSheet_('violations', t2.id); });
  z.env.asOwner((c) => c.appendRecord_('violations_' + t2.id.slice(0, 8), { term_id: t2.id, student_id: z.mine.id, occurred_at: '2027-08-25T20:00:00', rule_id: z.rule.id, rule_name: z.rule.name, memo: '', detected_by: '', entered_by: ADMIN, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  const tt = call(z, T1, 'listOuts', { scope: 'term', termId: t2.id });
  assert.deepStrictEqual([tt.hasMine, tt.summary.find((q) => q.studentId === z.mine.id).isMine], [false, false]);
});
