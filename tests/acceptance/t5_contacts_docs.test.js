/**
 * T5 흐름 시험: C29 연락처(결정 76)·C27 서류 체크리스트(결정 75①). seedFakeStage1~4 위에서. 가짜 데이터만.
 * - 연락처: 담당교사는 담당 학생만 → 오늘 근무가 되면 전체 → 다음 날은 다시 담당만. 담임·출결·근무표 담당은 거부.
 *   관리자 연락처 올리기: 미리보기·저장 응답에 번호 없음, 저장 뒤 담당교사가 새 번호를 보고 감사에는 생략 표시만.
 * - 서류: 학사 교사는 담당 학생만 보고 고친다(다른 학생 거부), 출결 담당은 전체를 보기만, 홈 카드 미제출 수 = 화면 미제출 칸 수,
 *   두 선생님이 같은 칸을 바꾸면 늦은 쪽은 stale, 서류 종류를 취소하면 목록·홈 카드에서 빠지고 행은 남는다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const T1 = 'fake.teacher1@example.com', DM = 'fake.teacher2@example.com', ATT = 'fake.teacher3@example.com';   // 가짜교사2 = 근무표 담당, 3 = 출결 겸 학사
const TODAY = '2027-03-09';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage2());
  env.asOwner((c) => c.seedFakeStage3());
  env.asOwner((c) => c.seedFakeStage4());
  env.asOwner((c) => c.addUser('test.attendance@example.com', '시험 출결', 'attendance'));
  env.strictLock = true;
  return env;
}
const termOf = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const assigned = (env, email) => env.rows('enrollments').filter((e) => e.term_id === termOf(env).id && e.teacher_email === email).map((e) => e.student_id);

test('연락처 흐름: 담당교사는 담당 학생만 → 오늘 근무가 되면 전체 → 다음 날 다시 담당만, 담임·출결·근무표 담당은 거부', () => {
  const env = seededEnv();
  const mine = assigned(env, T1), enrolled = env.rows('enrollments').filter((e) => e.term_id === termOf(env).id).map((e) => e.student_id);
  const other = enrolled.find((sid) => !mine.includes(sid));
  assert.ok(mine.length && other, '담당 학생·남의 학생');
  const c = plain(env.call(T1, 'getStudentContact', mine[0]));
  assert.ok(/^010-0000-\d{4}$/.test(c.phone) && c.guardians.every((g) => /^010-0000-\d{4}$/.test(g.phone)), JSON.stringify(c));
  assert.ok(!JSON.stringify(c).includes('@'), '보호자 이메일은 주지 않는다');
  env.expectDenied(T1, 'contact.view', 'getStudentContact', other);
  assert.strictEqual(plain(env.call(T1, 'getContactList')).students.length, mine.length);

  // 근무표 담당이 오늘 21:30조에 가짜교사1을 넣는다 → 오늘은 전체
  const day = plain(env.call(DM, 'getDutyMonth', TODAY.slice(0, 7))).days.find((d) => d.date === TODAY);
  const slot = day.slots.find((s) => s.slot === '21:30조');
  const uid = env.rows('users').find((u) => u.email === T1).id;
  const r = plain(env.call(DM, 'saveDutyDay', { date: TODAY, slots: { '21:30조': uid }, expect: { '21:30조': slot.token } }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(/^010-0000-\d{4}$/.test(plain(env.call(T1, 'getStudentContact', other)).phone), '근무교사는 남의 학생도');
  assert.strictEqual(plain(env.call(T1, 'getContactList')).students.length, enrolled.length, '근무 날은 이번 기간 학사생 전체');

  // 다음 날(근무 아님)은 다시 담당만
  env.setNow('2027-03-10T15:00:00');
  env.expectDenied(T1, 'contact.view', 'getStudentContact', other);
  assert.strictEqual(plain(env.call(T1, 'getContactList')).students.length, mine.length);

  for (const [who, sid] of [[HOMEROOM, mine[0]], ['test.attendance@example.com', mine[0]], [DM, mine[0]]]) env.expectDenied(who, 'contact.view', 'getStudentContact', sid);
});

test('연락처 올리기 흐름: 관리자 미리보기·저장 응답에 번호 없음, 저장 뒤 담당교사가 새 번호를 보고, 감사에는 생략 표시만', () => {
  const env = seededEnv();
  const sid = assigned(env, T1)[0];
  const stu = env.rows('students').find((s) => s.id === sid);
  const text = '학번\t학생전화\t학부모구글계정\t보호자이름\t보호자전화\n' + stu.student_no + '\t010-0000-9876\t\t\t';
  const opts = { termId: termOf(env).id };
  const p = plain(env.call(ADMIN, 'previewContacts', text, opts));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.ok(!JSON.stringify(p).includes('9876'), '미리보기에 번호 없음');
  const s = plain(env.call(ADMIN, 'commitContacts', text, opts, { counts: p.counts, termId: p.termId }));
  assert.strictEqual(s.ok, true, JSON.stringify(s));
  assert.ok(!JSON.stringify(s).includes('9876'), '저장 응답에 번호 없음');
  assert.strictEqual(plain(env.call(T1, 'getStudentContact', sid)).phone, '010-0000-9876');
  const audit = JSON.stringify(env.rows('audit_log'));
  assert.ok(!audit.includes('9876') && audit.includes('(연락처 생략)'), '감사에는 생략 표시만');
  env.expectDenied(HALL, 'roster.edit', 'previewContacts', text, opts);
});

test('서류 흐름: 학사 교사는 담당 학생만 보고 고친다, 출결 담당은 전체 보기만, 홈 카드 미제출 = 화면 미제출 칸, 늦은 저장은 stale, 서류 종류 취소', () => {
  const env = seededEnv();
  const mine = assigned(env, T1);
  const d = plain(env.call(T1, 'getDocData'));
  assert.deepStrictEqual(d.students.map((s) => s.id).sort(), mine.slice().sort(), '담당 학생만');
  const all = plain(env.call('test.attendance@example.com', 'getDocData'));
  assert.ok(all.students.length > d.students.length, '출결 담당은 전체');
  const missingCells = (data) => data.students.reduce((n, s) => n + data.types.filter((t) => s.docs[t.id] === '미제출').length, 0);
  const home = plain(env.call(T1, 'getHomeData', 'hall_teacher'));
  assert.strictEqual(JSON.stringify(home).includes('"docs"'), true, '홈에 서류 카드');
  const card = home.docs;
  assert.strictEqual(card.items, missingCells(d), '홈 카드 미제출 = 화면 미제출 칸');

  // 담당 학생의 미제출 칸 하나를 제출로: 같은 칸을 두 선생님이(가짜교사1·관리자) 같은 화면 값으로 → 늦은 쪽 stale
  const st = d.students.find((s) => d.types.some((t) => s.docs[t.id] === '미제출'));
  const ty = d.types.find((t) => st.docs[t.id] === '미제출');
  const a = plain(env.call(T1, 'saveDocState', { studentId: st.id, docTypeId: ty.id, state: '제출', expect: '미제출' }));
  assert.strictEqual(a.ok, true, JSON.stringify(a));
  const b = plain(env.call(ADMIN, 'saveDocState', { studentId: st.id, docTypeId: ty.id, state: '해당없음', expect: '미제출' }));
  assert.strictEqual(b.stale, true, JSON.stringify(b));
  assert.strictEqual(plain(env.call(T1, 'getHomeData', 'hall_teacher')).docs.items, card.items - 1, '홈 카드 1 줄어듦');

  // 남의 학생은 거부, 출결 담당(학사 교사가 아닌 계정)도 고치지 못한다
  const other = all.students.find((s) => !mine.includes(s.id));
  env.expectDenied(T1, 'doc.edit', 'saveDocState', { studentId: other.id, docTypeId: ty.id, state: '제출', expect: '미제출' });
  env.expectDenied('test.attendance@example.com', 'doc.edit', 'saveDocState', { studentId: other.id, docTypeId: ty.id, state: '제출', expect: '미제출' });

  // 서류 종류 취소: 목록·홈 카드에서 빠지고 행은 남는다
  const rowsBefore = env.rows(env.as(ADMIN, (c) => c.termSheetName_('student_docs', termOf(env).id))).length;
  const t = plain(env.call(ADMIN, 'getDocData')).types.find((x) => x.name === '학원 수강증');
  assert.strictEqual(plain(env.call(ADMIN, 'cancelDocType', t.id, t.token)).ok, true);
  const after = plain(env.call(T1, 'getDocData'));
  assert.ok(!after.types.some((x) => x.id === t.id), '취소한 종류는 목록에서 빠짐');
  assert.strictEqual(plain(env.call(T1, 'getHomeData', 'hall_teacher')).docs.items, missingCells(after), '홈 카드도 같이');
  assert.strictEqual(env.rows(env.as(ADMIN, (c) => c.termSheetName_('student_docs', termOf(env).id))).length, rowsBefore, '행은 남는다');
  assert.strictEqual(env.rows('doc_types').find((x) => x.id === t.id).status, '취소');
});
