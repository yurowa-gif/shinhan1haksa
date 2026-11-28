/** 결정 97·104 상담일지: 전 담당교사는 자기 담당이던 기간의 상담만 보고 쓰지 못한다 · 지금 담당·관리자·담임은 모두 · 관리자이면서 담당인 계정은 '담당'. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', T2 = 'fake.t2@example.com';
const TODAY = '2027-03-10', OLD = '2026-12-01', NEW = '2027-03-09', OLDMARK = 'ZZ-지난기간-표식', NEWMARK = 'ZZ-이번기간-표식';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => c.addUser(T2, '가짜교사2', 'hall_teacher'));
  const terms = env.rows('terms');
  const cur = terms.find((t) => t.name === '2027 1학기'), past = terms.find((t) => t.start_date === '2026-08-17');
  const students = env.rows('students');
  const me = students.find((s) => s.email === STUDENT);
  const enr = (sid) => env.rows('enrollments').find((e) => e.term_id === cur.id && e.student_id === sid);
  const teacher = enr(me.id).teacher_email;
  const stranger = students.find((s) => s.id !== me.id && enr(s.id) && enr(s.id).teacher_email !== teacher && enr(s.id).teacher_email !== T2);
  env.asOwner((c) => {
    c.appendRecord_('enrollments', { term_id: past.id, student_id: me.id, teacher_email: T2 }, ADMIN);   // 지난 기간 담당 = T2
    const row = (date, who, mark) => ({ student_id: me.id, date: date, teacher_email: who, type: '생활', target: '학생', linked_violation_id: '', content: mark, agreement: '', agreement_to_parent: 'FALSE', profile_version: '', request_id: '', show_to_parent: 'FALSE', status: '유효', cancel_reason: '' });
    c.appendRecord_('counsel_notes', row(OLD, T2, OLDMARK), ADMIN, 'counsel');
    c.appendRecord_('counsel_notes', row(NEW, teacher, NEWMARK), ADMIN, 'counsel');
  });
  return { env, cur, past, me, teacher, stranger, enr };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const dates = (r) => r.notes.map((n) => n.date).sort();

test('전 담당교사(T2)는 counsel.view 첫 줄을 통과해 자기 담당이던 기간의 상담만 보고, 쓰기·고치기는 못 한다', () => {
  const x = makeEnv();
  const r = call(x, T2, 'getCounselNotes', x.me.id);
  assert.deepStrictEqual(dates(r), [OLD], '지난 기간(그 날짜가 속한 기간의 담당) 상담만');
  assert.ok(JSON.stringify(r).indexOf(NEWMARK) < 0, '이번 기간 상담 내용은 응답에 없다');
  assert.deepStrictEqual([r.canWrite, r.notes[0].canEdit, r.profiles, r.fixedRequest], [false, false, [], null], '쓰기 자격은 지금 담당만');
  x.env.expectDenied(T2, 'counsel.save', 'saveCounselNote', { studentId: x.me.id, date: TODAY, type: '생활', target: '학생', content: 'ZZ-쓰기시도', agreement: '' });
  x.env.expectDenied(T2, 'counsel.save', 'cancelCounselNote', r.notes[0].id, '사유 없음');
  assert.strictEqual(x.env.rows('counsel_notes', 'counsel').length, 2, '거부된 쓰기는 행이 없다');
});

test('지금 담당·관리자·담임은 지난 기간 상담도 모두 본다(결정 104), 한 번도 담당이 아닌 교사는 denied', () => {
  const x = makeEnv();
  for (const who of [x.teacher, ADMIN, HOMEROOM]) assert.deepStrictEqual(dates(call(x, who, 'getCounselNotes', x.me.id)), [OLD, NEW].sort(), who);
  assert.strictEqual(call(x, x.teacher, 'getCounselNotes', x.me.id).canWrite, true, '지금 담당은 쓴다');
  const other = x.enr(x.stranger.id).teacher_email;
  x.env.expectDenied(other, 'counsel.view', 'getCounselNotes', x.me.id);
});

test('상담일지 목록(getCounselRoster): 전 담당은 자기 담당이던 기간의 상담만 센다 — 지금 담당은 전부', () => {
  const x = makeEnv();
  const row = (who) => call(x, who, 'getCounselRoster').students.find((s) => s.id === x.me.id);
  assert.deepStrictEqual([row(T2).count, row(T2).lastDate], [1, OLD], '전 담당: 지난 기간 1건');
  assert.deepStrictEqual([row(x.teacher).count, row(x.teacher).lastDate], [2, NEW]);
  assert.strictEqual(row(ADMIN).count, 2);
});

test('관리자이면서 학사 교사인 owner가 담당이면 \'담당\' — 지난 기간 기록까지 보고 쓸 수 있다 · 지난 기간 담당이었을 뿐이면 관리자로 모두 본다', () => {
  const x = makeEnv();
  const owner = x.env.owner;
  const e = x.enr(x.me.id);
  x.env.asOwner((c) => c.updateRecord_('enrollments', e.id, { teacher_email: owner }, ADMIN));
  const r = call(x, owner, 'getCounselNotes', x.me.id);
  assert.deepStrictEqual([dates(r), r.canWrite], [[OLD, NEW].sort(), true], '담당이면 둘 다 보고 쓰기 자격');
  assert.strictEqual(r.notes.find((n) => n.date === NEW).canEdit, false, '남이 쓴 상담은 고치지 못한다(쓴 사람만)');
  assert.strictEqual(call(x, owner, 'getCounselRoster').students.find((s) => s.id === x.me.id).count, 2);
});
