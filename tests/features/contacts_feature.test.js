/** C29 연락처(결정 76): 올리기(미리보기·저장), 보기 권한(담당교사·관리자·그날 근무교사), 번호가 어디에도 새지 않음. 가짜 번호 010-0000-xxxx만. */
const assert = require('assert');
const { test, plain, loadGs } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', HALL = 'test.teacher@example.com', OTHER = 'fake.teacher2@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';
const HEAD = '학번\t학생전화\t학부모구글계정\t보호자이름\t보호자전화';

function seeded() {
  const env = createGasEnv({ owner: OWNER, now: '2027-03-09T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  return env;
}
function ctxOf(env) {
  const term = env.as(OWNER, (c) => c.getCurrentTerm_());
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const stu = (id) => env.rows('students').find((s) => s.id === id);
  const mine = enr.filter((e) => e.teacher_email === HALL).map((e) => stu(e.student_id));
  const theirs = enr.filter((e) => e.teacher_email !== HALL).map((e) => stu(e.student_id));
  const links = env.rows('guardian_links');
  return { term, mine, theirs, links, stu };
}
const call = (env, who, fn, ...a) => plain(env.call(who, fn, ...a));
const optsOf = (x) => ({ termId: x.term.id });
/** 학생 한 줄 + (있으면) 그 학생의 첫 보호자 연결 줄 */
function tableFor(x, student, phone, gname, gphone) {
  const link = x.links.find((g) => g.student_id === student.id);
  return HEAD + '\n' + [student.student_no, phone, link ? link.parent_email : '', gname || '', gphone || ''].join('\t');
}
function save(env, text, opts) {
  const p = call(env, OWNER, 'previewContacts', text, opts);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  return call(env, OWNER, 'commitContacts', text, opts, { counts: p.counts, termId: p.termId });
}
const phones = (v) => JSON.stringify(v).match(/010[-. ]?0000[-. ]?\d{4}/g) || [];

test('contactPhoneNorm_: 하이픈·점·빈칸·+82·앞 0이 떨어진 10자리를 010-1234-5678 모양으로, 이상한 글자·자릿수는 빈 값', () => {
  const ctx = loadGs(['src/features/Contacts.gs']);
  const n = (v) => ctx.contactPhoneNorm_(v);
  assert.deepStrictEqual(['01012345678', '010-1234-5678', '010 1234 5678', '010.1234.5678', '(010) 1234-5678', '+82 10-1234-5678', '1012345678', 1012345678].map(n), Array(8).fill('010-1234-5678'));
  assert.deepStrictEqual([n('0212345678'), n('021234567'), n('0311234567'), n('031-123-4567'), n('0311234567')], ['02-1234-5678', '02-123-4567', '031-123-4567', '031-123-4567', '031-123-4567']);
  for (const bad of ['', null, undefined, '12345', '010-1234-567', '010-1234-56789', 'abc', '010-1234-567a', '+1 555 123 4567', '8201012345678', '010-12345-6789', '0101234567890']) assert.strictEqual(n(bad), '', String(bad));
});

test('올리기: 미리보기는 번호 없이 건수만, 저장하면 학생·보호자 칸에 정규화한 번호, 감사 기록·응답에 번호 없음, 같은 표를 다시 올리면 변경 없음, 빈 칸은 바꾸지 않음', () => {
  const env = seeded(), x = ctxOf(env), s = x.mine[0], opts = optsOf(x);
  const text = tableFor(x, s, '01000001001', '가짜보호자', '010 0000 2001');
  const p = call(env, OWNER, 'previewContacts', text, opts);
  assert.deepStrictEqual([p.ok, p.counts.students, p.counts.guardians], [true, 1, x.links.some((g) => g.student_id === s.id) ? 1 : 0]);
  assert.deepStrictEqual(phones(p), [], '미리보기에 번호 없음');
  assert.ok(!JSON.stringify(p).includes('가짜보호자'), '보호자 이름도 미리보기에 없음');
  assert.strictEqual(env.rows('students').find((r) => r.id === s.id).phone, '', '미리보기는 쓰지 않는다');
  const r = call(env, OWNER, 'commitContacts', text, opts, { counts: p.counts, termId: p.termId });
  assert.strictEqual(r.ok, true); assert.deepStrictEqual(phones(r), []);
  assert.strictEqual(env.rows('students').find((q) => q.id === s.id).phone, '010-0000-1001');
  const link = x.links.find((g) => g.student_id === s.id);
  if (link) { const g = env.rows('guardian_links').find((q) => q.id === link.id); assert.deepStrictEqual([g.name, g.phone], ['가짜보호자', '010-0000-2001']); }
  const audit = JSON.stringify(env.rows('audit_log').map((a) => [a.action, a.before, a.after, a.detail]));
  assert.deepStrictEqual(phones(audit), [], '감사 기록에 번호 없음'); assert.ok(!audit.includes('가짜보호자'));
  // 다시 올리기: 변경 없음 / 번호 칸만 비운 줄은 기존 값 유지
  assert.strictEqual(save(env, text, opts).nothingToDo, true);
  assert.strictEqual(save(env, tableFor(x, s, '', '', ''), opts).nothingToDo, true);
  assert.strictEqual(env.rows('students').find((q) => q.id === s.id).phone, '010-0000-1001');
  // 바꾸면 한 칸만
  const p2 = call(env, OWNER, 'previewContacts', tableFor(x, s, '010-0000-1002', '', ''), opts);
  assert.deepStrictEqual([p2.counts.students, p2.counts.guardians], [1, 0]);
});

test('올리기 오류: 머리글·학번·형식·미등록 보호자·보호자 이름만 있고 계정 없음·같은 학생 번호 충돌 — 번호를 되풀이하지 않고 쓰기 0', () => {
  const env = seeded(), x = ctxOf(env), s = x.mine[0], opts = optsOf(x);
  const before = JSON.stringify(env.rows('students').concat(env.rows('guardian_links')));
  const bad = (text, col, o) => {
    const p = call(env, OWNER, 'previewContacts', text, o || opts);
    assert.strictEqual(p.ok, false, text);
    assert.ok(p.errors.some((e) => !col || e.column === col), JSON.stringify(p.errors));
    assert.deepStrictEqual(phones(p), [], '오류 문구에 번호 없음');
    assert.deepStrictEqual(call(env, OWNER, 'commitContacts', text, o || opts, { counts: {}, termId: '' }).ok, false);
    return p;
  };
  bad('학번\t전화\n12345\t010-0000-1111', '학생전화'.slice(0, 0) || undefined);
  bad(HEAD + '\n1234\t010-0000-1111\t\t\t', '학번');
  bad(HEAD + '\n99999\t010-0000-1111\t\t\t', '학번');
  bad(HEAD + '\n' + s.student_no + '\t010-0000-11\t\t\t', '학생전화');
  bad(HEAD + '\n' + s.student_no + '\t\tfake.unlinked@example.com\t가짜\t010-0000-2222', '학부모구글계정');   // 이 학생에 연결되지 않은 계정
  bad(HEAD + '\n' + s.student_no + '\t\t\t가짜보호자\t', '학부모구글계정');
  bad(HEAD + '\n' + s.student_no + '\t\tnot-email\t\t', '학부모구글계정');
  bad(HEAD + '\n' + s.student_no + '\t010-0000-1111\t\t\t\n' + s.student_no + '\t010-0000-1112\t\t\t', '학생전화');
  bad(HEAD + '\n' + s.student_no + '\t010-0000-1111\t\t\t', undefined, { termId: 'nope' });
  assert.strictEqual(JSON.stringify(env.rows('students').concat(env.rows('guardian_links'))), before, '오류는 아무것도 쓰지 않는다');
});

test('올리기 저장: 관리자만(나머지 역할 거부 + denied:roster.edit, 쓰기 0), 미리본 뒤 표가 바뀌면 {stale:true}', () => {
  const env = seeded(), x = ctxOf(env), s = x.mine[0], opts = optsOf(x);
  const text = tableFor(x, s, '010-0000-1001', '', '');
  const p = call(env, OWNER, 'previewContacts', text, opts);
  for (const who of [HALL, OTHER, HOMEROOM, ATT, DUTYM, STUDENT, PARENT]) {
    env.expectDenied(who, 'roster.edit', 'previewContacts', text, opts);
    env.expectDenied(who, 'roster.edit', 'commitContacts', text, opts, { counts: p.counts, termId: p.termId });
  }
  assert.strictEqual(env.rows('students').find((r) => r.id === s.id).phone, '');
  const other = tableFor(x, s, '010-0000-1999', '', '');
  const stale = call(env, OWNER, 'commitContacts', text, opts, { counts: { students: 0, guardians: 0, same: 0 }, termId: p.termId });
  assert.deepStrictEqual([stale.ok, stale.stale], [false, true]);
  assert.strictEqual(env.rows('students').find((r) => r.id === s.id).phone, '');
  assert.strictEqual(call(env, OWNER, 'commitContacts', other, opts, { counts: call(env, OWNER, 'previewContacts', other, opts).counts, termId: p.termId }).ok, true);
});

test('보기: 담당교사·관리자는 자기 범위, 담당이 아닌 학사 교사는 목록에서 빠지고 번호 요청은 거부, 그날 근무교사는 전체, 그 밖의 역할은 모두 거부 + denied:contact.view', () => {
  const env = seeded(), x = ctxOf(env), mine = x.mine[0], theirs = x.theirs[0], opts = optsOf(x);
  const link = x.links.find((g) => g.student_id === mine.id);
  save(env, tableFor(x, mine, '010-0000-1001', '가짜보호자', '010-0000-2001'), opts);
  save(env, tableFor(x, theirs, '010-0000-1002', '', ''), opts);
  const c = call(env, HALL, 'getStudentContact', mine.id);
  assert.strictEqual(c.phone, '010-0000-1001');
  if (link) assert.deepStrictEqual(c.guardians.filter((g) => g.phone), [{ relation: link.relation, name: '가짜보호자', phone: '010-0000-2001' }]);
  assert.ok(!JSON.stringify(c).includes('@'), '이메일은 주지 않는다');
  assert.strictEqual(call(env, OWNER, 'getStudentContact', theirs.id).phone, '010-0000-1002', '관리자');
  // 담당이 아닌 학사 교사(근무 없음)
  const listO = call(env, OTHER, 'getContactList');
  assert.ok(!listO.students.some((s) => s.id === mine.id) || x.term && env.rows('enrollments').some((e) => e.student_id === mine.id && e.teacher_email === OTHER));
  assert.deepStrictEqual(phones(listO), [], '목록에는 번호가 없다');
  const mineList = call(env, HALL, 'getContactList');
  assert.ok(mineList.students.some((s) => s.id === mine.id) && !mineList.students.some((s) => s.id === theirs.id));
  assert.strictEqual(mineList.students.find((s) => s.id === mine.id).hasContact, true);
  env.expectDenied(HALL, 'contact.view', 'getStudentContact', theirs.id);
  env.expectDenied(OTHER, 'contact.view', 'getStudentContact', mine.id);
  for (const who of [ATT, HOMEROOM, DUTYM, STUDENT, PARENT]) {
    env.expectDenied(who, 'contact.list', 'getContactList');
    env.expectDenied(who, 'contact.view', 'getStudentContact', mine.id);
  }
  // 오늘 근무교사는 전체
  env.asOwner((cc) => cc.appendRecord_('duty_slots', { date: '2027-03-09', slot: '단독', end_time: '', original_email: OTHER, actual_email: OTHER, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, OWNER));
  assert.strictEqual(call(env, OTHER, 'getStudentContact', mine.id).phone, '010-0000-1001', '근무교사');
  assert.ok(call(env, OTHER, 'getContactList').students.some((s) => s.id === mine.id));
  env.setNow('2027-03-10T15:00:00');
  env.expectDenied(OTHER, 'contact.view', 'getStudentContact', mine.id);   // 근무 아님(다음 날)
});

test('번호가 닿는 다른 길: 학생 한 줄을 고치는 쓰기(updateRecord_)·기존 화면 응답(getHomeData)에도 번호가 없고, 번호 칸은 지워지지 않는다', () => {
  const env = seeded(), x = ctxOf(env), s = x.mine[0], opts = optsOf(x);
  save(env, tableFor(x, s, '010-0000-1001', '가짜보호자', '010-0000-2001'), opts);
  env.as(OWNER, (c) => c.updateRecord_('students', s.id, { memo: '메모' }, OWNER));
  assert.strictEqual(env.rows('students').find((r) => r.id === s.id).phone, '010-0000-1001');
  for (const [who, role] of [[OWNER, 'admin'], [HALL, 'hall_teacher'], [HOMEROOM, 'homeroom'], [STUDENT, 'student'], [PARENT, 'parent']]) {
    let out; try { out = call(env, who, 'getHomeData', role); } catch (e) { out = e.message; }
    assert.deepStrictEqual(phones(out), [], role);
    assert.ok(!JSON.stringify(out).includes('가짜보호자'), role);
  }
});
