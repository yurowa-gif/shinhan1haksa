/** C32 F12 상담일지(교사 쪽): R4 gas-fakes. 가짜 데이터만. 상담 내용(표식 글자)은 상담 파일과 권한 있는 응답에만 있어야 한다. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  T2 = 'fake.t2@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03', MARK = 'ZZ-상담-표식';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.addUser(T2, '가짜교사2', 'hall_teacher'));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const students = env.rows('students');
  const mine = students.find((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  const other = students.find((s) => enr.some((e) => e.student_id === s.id && e.teacher_email !== T1) && s.id !== mine.id);
  const hr = env.rows('users').find((u) => u.email === HOMEROOM).homeroom_class.match(/(\d+)\s*-\s*(\d+)/);
  const hrStudent = students.find((s) => enr.some((e) => e.student_id === s.id) && String(s.grade) === hr[1] && String(s.class_no) === hr[2]);
  const notes = () => env.rows('counsel_notes', 'counsel');
  return { env, term, mine, other, hrStudent, notes };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const input = (x, o) => Object.assign({ studentId: x.mine.id, date: TODAY, type: '생활', target: '학생', content: MARK + ' 이야기' }, o || {});
const save = (x, who, o) => call(x, who || T1, 'saveCounselNote', input(x, o));
const asTeacherOf = (x, student, email) => x.env.asOwner((c) => {
  const e = c.readAll_('enrollments').find((q) => q.term_id === x.term.id && q.student_id === student.id);
  c.updateRecord_('enrollments', e.id, { teacher_email: email }, ADMIN);
});

test('권한표: 화면·목록은 담당교사·담임·관리자만, 기록은 담당교사·그 반 담임·관리자만, 쓰기는 그 학생의 담당교사만 — 나머지는 denied 기록', () => {
  const x = makeEnv();
  for (const who of [ADMIN, T1, T2, HOMEROOM]) x.env.expectAllowed(who, 'getCounselContext');
  for (const who of [ATT, DUTY, STUDENT, PARENT]) x.env.expectDenied(who, 'counsel.list', 'getCounselContext');
  for (const who of [ADMIN, T1]) x.env.expectAllowed(who, 'getCounselNotes', x.mine.id);
  if (x.hrStudent) x.env.expectAllowed(HOMEROOM, 'getCounselNotes', x.hrStudent.id);
  for (const who of [T2, ATT, DUTY, STUDENT, PARENT]) x.env.expectDenied(who, 'counsel.view', 'getCounselNotes', x.mine.id);
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '21:30조', end_time: '21:30', original_email: T2, actual_email: T2, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  for (const who of [T2, ATT, ADMIN, HOMEROOM, STUDENT, PARENT, DUTY]) x.env.expectDenied(who, 'counsel.save', 'saveCounselNote', input(x));
  assert.strictEqual(x.notes().length, 0, '거부된 쓰기는 행이 없다');
  assert.strictEqual(save(x).ok, true);
  assert.strictEqual(x.notes().length, 1);
});

test('담임은 자기 반 학생만, 학사 교사는 자기 담당만 목록에 나온다(내용·이메일 없음), 관리자는 이번 기간 학사생 전체', () => {
  const x = makeEnv();
  save(x);
  const ids = (r) => r.students.map((s) => s.id);
  const t1 = call(x, T1, 'getCounselContext'), t2 = call(x, T2, 'getCounselContext'), adm = call(x, ADMIN, 'getCounselContext'), hr = call(x, HOMEROOM, 'getCounselContext');
  assert.ok(ids(t1).includes(x.mine.id) && !ids(t1).includes(x.other.id) || x.env.rows('enrollments').filter((e) => e.teacher_email === T1).length > 1);
  assert.ok(!ids(t2).includes(x.mine.id));
  assert.ok(ids(adm).includes(x.mine.id) && ids(adm).includes(x.other.id));
  assert.ok(t1.students.every((s) => s.mine) && adm.students.some((s) => !s.mine));
  hr.students.forEach((s) => assert.ok(x.env.rows('students').find((q) => q.id === s.id), '반 학생'));
  assert.deepStrictEqual(t1.types, ['학업', '생활', '진로', '건강', '가정', '기타']);
  for (const r of [t1, t2, adm, hr]) assert.ok(!JSON.stringify(r).includes(MARK) && !JSON.stringify(r).includes('@'), '목록 응답에 내용·이메일 없음');
});

test('저장: 상담 파일에만 내용이 있고(운영 DB audit에는 글자 수만), 기본은 학부모에게 보임, 응답에 내용 없음', () => {
  const x = makeEnv();
  const a0 = x.env.rows('audit_log').length;
  const r = save(x);
  assert.deepStrictEqual(Object.keys(r).sort(), ['id', 'ok']);
  const n = x.notes();
  assert.strictEqual(n.length, 1);
  assert.deepStrictEqual([n[0].student_id, n[0].date, n[0].teacher_email, n[0].type, n[0].target, n[0].linked_violation_id, n[0].show_to_parent, n[0].status, n[0].cancel_reason],
    [x.mine.id, TODAY, T1, '생활', '학생', '', 'TRUE', '유효', '']);
  assert.ok(n[0].content.includes(MARK));
  const log = x.env.rows('audit_log').slice(a0);
  assert.ok(!log.some((a) => JSON.stringify(a).includes(MARK)), 'audit에 표식 없음');
  assert.ok(log.some((a) => a.action === 'create' && a.sheet === 'counsel/counsel_notes' && /내용 생략/.test(JSON.stringify(a))), '글자 수만');
  assert.strictEqual(save(x, T1, { target: '학부모', showToParent: false, content: MARK + ' 둘째' }).ok, true);
  assert.deepStrictEqual(x.notes().map((q) => [q.target, q.show_to_parent]).sort(), [['학부모', 'FALSE'], ['학생', 'TRUE']]);
  const dup = save(x);
  assert.deepStrictEqual([dup.ok, dup.duplicate, dup.id], [true, true, n[0].id]);
  assert.strictEqual(x.notes().length, 2, '두 번 누르기는 한 번만 저장');
});

test('입력 검사: 예약 유형·없는 유형·미래 날짜·내용 없음·2000자 초과·대상·명단에 없는 날짜 — 모두 거부, 행이 늘지 않는다', () => {
  const x = makeEnv();
  const bad = (o) => { const r = save(x, T1, o); assert.strictEqual(r.ok, false, JSON.stringify(o)); return r.errors[0].field; };
  assert.strictEqual(bad({ type: '2OUT 학부모 면담' }), 'type');
  assert.ok(/OUT 화면/.test(save(x, T1, { type: '2OUT 학부모 면담' }).errors[0].message), '예약어는 안내 문구로 거부');
  assert.strictEqual(bad({ type: '없는유형' }), 'type');
  assert.strictEqual(bad({ type: '' }), 'type');
  assert.strictEqual(bad({ date: '2027-03-04' }), 'date');
  assert.strictEqual(bad({ date: 'x' }), 'date');
  assert.strictEqual(bad({ date: '2020-01-01' }), 'date', '어느 기간에도 안 속함');
  assert.strictEqual(bad({ content: '  ' }), 'content');
  assert.strictEqual(bad({ content: '가'.repeat(2001) }), 'content');
  assert.strictEqual(bad({ target: '교사' }), 'target');
  assert.strictEqual(save(x, T1, { content: '가'.repeat(2000) }).ok, true, '2000자는 통과');
  assert.throws(() => x.env.call(T1, 'saveCounselNote', { studentId: 'no-such', date: TODAY, type: '생활', target: '학생', content: 'x' }), /권한/, '없는 학생 id는 권한 거부');
  assert.strictEqual(x.notes().length, 1);
});

test('기록 보기: 담당교사·관리자·그 반 담임은 내용이 보이고, 새 글이 위, 취소 행도 사유와 함께 남는다. 다른 교사는 거부', () => {
  const x = makeEnv();
  save(x, T1, { date: '2027-03-02', content: MARK + ' 어제' });
  save(x);
  const r = call(x, T1, 'getCounselNotes', x.mine.id);
  assert.deepStrictEqual([r.canWrite, r.notes.map((n) => n.date), r.notes.every((n) => n.content.includes(MARK) && n.mine && n.canEdit)], [true, [TODAY, '2027-03-02'], true]);
  assert.ok(!JSON.stringify(r).includes('@'), '이메일 없음');
  const adm = call(x, ADMIN, 'getCounselNotes', x.mine.id);
  assert.deepStrictEqual([adm.canWrite, adm.notes.length, adm.notes.some((n) => n.canEdit || n.mine)], [false, 2, false]);
  call(x, T1, 'cancelCounselNote', r.notes[0].id, '날짜를 잘못 적었습니다');
  const after = call(x, T1, 'getCounselNotes', x.mine.id);
  assert.deepStrictEqual(after.notes.map((n) => [n.status, n.cancelReason, n.canEdit]), [['취소', '날짜를 잘못 적었습니다', false], ['유효', '', true]]);
  assert.strictEqual(call(x, T1, 'getHomeData', 'hall_teacher').counsel.mine30, 1);
  for (const who of [T2, ATT, DUTY, STUDENT, PARENT]) assert.throws(() => x.env.call(who, 'getCounselNotes', x.mine.id), /권한/);
});

test('권한 없는 응답·홈·audit 어디에도 상담 내용이 없다', () => {
  const x = makeEnv();
  save(x);
  const seen = [];
  seen.push(call(x, T1, 'getHomeData', 'hall_teacher'), call(x, ADMIN, 'getHomeData', 'admin'), call(x, HOMEROOM, 'getHomeData', 'homeroom'),
    call(x, T2, 'getCounselContext'), call(x, ATT, 'getHomeData', 'attendance'));
  for (const who of [T1, T2, ADMIN]) seen.push(call(x, who, 'listOuts', { scope: 'term' }));
  seen.forEach((r) => assert.ok(!JSON.stringify(r).includes(MARK)));
  for (const who of [T2, ATT, DUTY]) { try { x.env.call(who, 'getCounselNotes', x.mine.id); } catch (e) { assert.ok(!String(e.message).includes(MARK)); } }
  assert.ok(!x.env.rows('audit_log').some((a) => JSON.stringify(a).includes(MARK)));
  assert.ok(x.notes().some((n) => n.content.includes(MARK)));
});

test('취소: 쓴 담당교사 본인만, 사유 2자 이상 필수, 행은 남고 status만 바뀐다. 남의 상담·권한 밖은 denied:counsel.cancel', () => {
  const x = makeEnv();
  save(x);
  const id = x.notes()[0].id;
  assert.strictEqual(call(x, T1, 'cancelCounselNote', id, '').ok, false);
  assert.strictEqual(call(x, T1, 'cancelCounselNote', id, '가').ok, false);
  assert.strictEqual(call(x, T1, 'cancelCounselNote', 'no-such', '없는 상담').ok, false);
  for (const who of [T2, ADMIN, HOMEROOM, ATT, DUTY, STUDENT, PARENT]) x.env.expectDenied(who, 'counsel.cancel', 'cancelCounselNote', id, '취소 시도입니다');
  assert.strictEqual(x.notes()[0].status, '유효');
  assert.deepStrictEqual(call(x, T1, 'cancelCounselNote', id, '날짜를 잘못 적었습니다'), { ok: true });
  assert.deepStrictEqual([x.notes().length, x.notes()[0].status, x.notes()[0].cancel_reason, x.notes()[0].content.includes(MARK)], [1, '취소', '날짜를 잘못 적었습니다', true]);
  assert.strictEqual(call(x, T1, 'cancelCounselNote', id, '또 취소합니다').ok, false, '이미 취소');
  assert.strictEqual(save(x).ok, true, '취소한 뒤 같은 내용을 다시 쓸 수 있다');
});

test('고치기 = 취소 + 새 행: 옛 행 내용은 그대로 남고, 사유 필수, 검사 실패면 옛 행도 그대로, 남의 상담·2OUT 면담은 못 고친다', () => {
  const x = makeEnv();
  save(x);
  const old = x.notes()[0];
  const fix = input(x, { type: '진로', content: MARK + ' 고친 글' });
  assert.strictEqual(call(x, T1, 'reviseCounselNote', old.id, fix, '').ok, false);
  assert.strictEqual(call(x, T1, 'reviseCounselNote', old.id, input(x, { type: '2OUT 학부모 면담' }), '유형을 고칩니다').ok, false);
  assert.strictEqual(call(x, T1, 'reviseCounselNote', old.id, input(x, { content: '' }), '내용이 비었습니다').ok, false);
  assert.deepStrictEqual([x.notes().length, x.notes()[0].status], [1, '유효'], '실패하면 아무것도 바뀌지 않는다');
  for (const who of [T2, ADMIN, HOMEROOM, ATT, STUDENT, PARENT]) x.env.expectDenied(who, 'counsel.cancel', 'reviseCounselNote', old.id, fix, '고치려는 시도');
  const r = call(x, T1, 'reviseCounselNote', old.id, fix, '유형을 잘못 골랐습니다');
  assert.strictEqual(r.ok, true);
  const rows = x.notes();
  assert.strictEqual(rows.length, 2);
  const o = rows.find((q) => q.id === old.id), n = rows.find((q) => q.id === r.id);
  assert.deepStrictEqual([o.status, o.cancel_reason, o.type, o.content], ['취소', '유형을 잘못 골랐습니다', '생활', old.content], '옛 행 내용은 제자리에서 고치지 않는다');
  assert.deepStrictEqual([n.status, n.type, n.teacher_email, n.student_id, n.content], ['유효', '진로', T1, x.mine.id, MARK + ' 고친 글']);
  assert.strictEqual(call(x, T1, 'reviseCounselNote', old.id, fix, '이미 취소된 행').ok, false);
  x.env.asOwner((c) => c.appendRecord_('counsel_notes', { student_id: x.mine.id, date: TODAY, teacher_email: T1, type: '2OUT 학부모 면담', target: '학부모', linked_violation_id: 'v1', content: MARK + ' 2OUT', show_to_parent: 'TRUE', status: '유효', cancel_reason: '' }, T1, 'counsel'));
  const out2 = x.notes().find((q) => q.type === '2OUT 학부모 면담');
  assert.strictEqual(call(x, T1, 'cancelCounselNote', out2.id, 'OUT 화면이 아닌 곳에서').ok, false);
  assert.strictEqual(call(x, T1, 'reviseCounselNote', out2.id, fix, 'OUT 화면이 아닌 곳에서').ok, false);
  assert.strictEqual(x.notes().find((q) => q.id === out2.id).status, '유효');
  const list = call(x, T1, 'getCounselNotes', x.mine.id).notes.find((q) => q.id === out2.id);
  assert.deepStrictEqual([list.fixed, list.canEdit], [true, false], '2OUT 면담은 읽기 전용으로 보인다');
});

test('담당이 바뀌면 옛 담당교사는 더 이상 쓰기·취소·고치기를 못 한다(락 안에서 다시 판정)', () => {
  const x = makeEnv();
  save(x);
  const id = x.notes()[0].id;
  asTeacherOf(x, x.mine, T2);
  x.env.expectDenied(T1, 'counsel.save', 'saveCounselNote', input(x, { content: '새 글' }));
  x.env.expectDenied(T1, 'counsel.save', 'cancelCounselNote', id, '담당이 바뀐 뒤 취소');
  x.env.expectDenied(T1, 'counsel.save', 'reviseCounselNote', id, input(x), '담당이 바뀐 뒤 고침');
  assert.strictEqual(x.notes()[0].status, '유효');
  assert.strictEqual(save(x, T2, { content: '새 담당의 글' }).ok, true);
});

test('설정 counsel.types: 쉼표 목록이 유형이 되고, 예약어·중복은 빠지며 비어 있으면 기본값', () => {
  const x = makeEnv();
  const set = (v) => x.env.asOwner((c) => {
    const row = c.readAll_('settings', 'config').find((s) => s.key === 'counsel.types');
    if (row) c.updateRecord_('settings', row.id, { value: v }, ADMIN, 'config'); else c.appendRecord_('settings', { key: 'counsel.types', value: v, description: '' }, ADMIN, 'config');
  });
  set('학업, 진로 ,2OUT 학부모 면담,진로,멘토링');
  assert.deepStrictEqual(call(x, T1, 'getCounselContext').types, ['학업', '진로', '멘토링']);
  assert.strictEqual(save(x, T1, { type: '멘토링' }).ok, true);
  assert.strictEqual(save(x, T1, { type: '생활', content: '목록에서 빠진 유형' }).ok, false);
  set('2OUT 학부모 면담');
  assert.deepStrictEqual(call(x, T1, 'getCounselContext').types, ['학업', '생활', '진로', '건강', '가정', '기타']);
});

test('홈 카드: 담당교사만 숫자(최근 30일 내가 쓴 상담·기록 없는 담당 학생)가 있고 이름·내용은 없다', () => {
  const x = makeEnv();
  const home = () => call(x, T1, 'getHomeData', 'hall_teacher').counsel;
  const h0 = home();
  assert.ok(h0.total >= 1 && h0.withoutNote === h0.total && h0.mine30 === 0);
  save(x);
  save(x, T1, { date: '2027-03-02', content: MARK + ' 어제' });
  const h1 = home();
  assert.deepStrictEqual([h1.mine30, h1.withoutNote, h1.total], [2, h0.total - 1, h0.total]);
  assert.deepStrictEqual(Object.keys(h1).sort(), ['mine30', 'total', 'withoutNote']);
  assert.ok(!JSON.stringify(h1).includes(MARK));
  assert.ok(!call(x, ADMIN, 'getHomeData', 'admin').counsel, '관리자 홈에는 숫자 없음');
  assert.ok(!call(x, HOMEROOM, 'getHomeData', 'homeroom').counsel, '담임 홈에도 없음');
});
