/** 가짜 학생 30명(src/dev/FakeData.gs) */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs', 'src/dev/FakeData.gs']);

const opts = {
  ownerEmail: 'owner@test.invalid', studentEmail: 'stu@test.invalid', parentEmail: 'par@test.invalid',
  teacherEmail: 'tea@test.invalid', homeroomEmail: 'home@test.invalid'
};
const d = JSON.parse(JSON.stringify(ctx.buildFakeData_(opts)));  // vm 경계 밖 배열로

test('학생 30명, 학번·id 중복 없음', () => {
  assert.strictEqual(d.students.length, 30);
  assert.strictEqual(new Set(d.students.map(s => s.student_no)).size, 30);
  assert.strictEqual(new Set(d.students.map(s => s.id)).size, 30);
});
test('학년 1~3 고르게, 학번 = 학년+반2자리+번호2자리', () => {
  for (const g of ['1', '2', '3']) assert.strictEqual(d.students.filter(s => s.grade === g).length, 10);
  for (const s of d.students) {
    assert.strictEqual(s.student_no, s.grade + s.class_no.padStart(2, '0') + s.number.padStart(2, '0'));
  }
});
test('같은 입력이면 같은 명단(재현 가능)', () => {
  const d2 = ctx.buildFakeData_(opts);
  assert.strictEqual(JSON.stringify(d2.students.map(s => s.name)), JSON.stringify(d.students.map(s => s.name)));
});
test('시험 이메일 외에는 모두 example.com', () => {
  const allowed = new Set(Object.values(opts));
  const emails = [
    ...d.students.map(s => s.email), ...d.users.map(u => u.email),
    ...d.guardianLinks.map(g => g.parent_email), ...d.enrollments.map(e => e.teacher_email)
  ];
  for (const e of emails) assert.ok(allowed.has(e) || e.endsWith('@example.com'), e);
});
test('시험 학부모는 형제 두 명(1·2번)에 연결', () => {
  const kids = d.guardianLinks.filter(g => g.parent_email === opts.parentEmail).map(g => g.student_id);
  assert.deepStrictEqual(kids, [d.students[0].id, d.students[1].id]);
  assert.strictEqual(d.students[0].name[0], d.students[1].name[0]);
});
test('시험 학생은 1번 학생 계정', () => assert.strictEqual(d.students[0].email, opts.studentEmail));
test('시험 담임의 학급 = 1번 학생 반', () => {
  const h = d.users.find(u => u.email === opts.homeroomEmail);
  assert.strictEqual(h.homeroom_class, d.students[0].grade + '-' + d.students[0].class_no);
});
test('등록(enrollments)은 기간×학생, 참조가 모두 유효', () => {
  assert.strictEqual(d.enrollments.length, d.terms.length * 30);
  const sid = new Set(d.students.map(s => s.id));
  const tid = new Set(d.terms.map(t => t.id));
  for (const e of d.enrollments) { assert.ok(sid.has(e.student_id)); assert.ok(tid.has(e.term_id)); }
  assert.strictEqual(new Set(d.enrollments.map(e => e.id)).size, d.enrollments.length);
});
test('시험 학사교사가 담당하는 학생이 있다', () => {
  assert.ok(d.enrollments.some(e => e.teacher_email === opts.teacherEmail));
});
test('가짜 데이터 열 이름이 시트 헤더에 모두 있다', () => {
  const check = (sheet, rows) => {
    const h = new Set(ctx.headersFor_('db', sheet));
    for (const r of rows) for (const k of Object.keys(r)) assert.ok(h.has(k), sheet + '.' + k);
  };
  check('terms', d.terms); check('students', d.students); check('enrollments', d.enrollments);
  check('guardian_links', d.guardianLinks); check('users', d.users);
});
test('users 역할 값이 모두 알려진 역할', () => {
  for (const u of d.users) {
    for (const r of u.roles.split(',')) assert.ok(ctx.ROLES.includes(r), r);
  }
});
