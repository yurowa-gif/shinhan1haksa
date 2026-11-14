/**
 * S4-0(결정 75·76): 새 탭·열, 개인 연락처 열 보호(readAll_에서 지움·readContacts_만 값·감사 마스크), 줄 전체 수정이 연락처 칸을 지우지 않음, 권한 키.
 * 가짜 번호는 010-0000-xxxx만. gas-fakes.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com';
const HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com', OTHER = 'fake.teacher2@example.com';

function seeded() {
  const env = createGasEnv({ owner: OWNER, now: '2027-03-09T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  return env;
}
/** 칸에 바로 심는다(앱 쓰기 경로·감사를 거치지 않음) */
function plant(env, tab, col, value, rowIndex) {
  const header = env.sheetValues(tab)[0].map(String), c = header.indexOf(col) + 1;
  assert.ok(c > 0, tab + '.' + col + ' 열이 있다');
  env.as(OWNER, (x) => x.withLock_(() => { const r = x.readAll_(tab)[rowIndex || 0]; x.getSheet_('db', tab).getRange(r._row, c).setNumberFormat('@').setValue(value); }));
}
const cell = (env, tab, col, i) => env.rows(tab)[i || 0][col];

test('스키마: 새 탭 3개(doc_types·programs·program_participants)와 기간별 student_docs, 새 열(students.phone·guardian_links.name/phone)은 헤더 규칙(id 처음·공통 꼬리 끝)을 지킨다', () => {
  const env = createGasEnv();
  env.asOwner((c) => c.setup());
  const want = {
    doc_types: ['name', 'description', 'sort_order', 'status'],
    programs: ['name', 'date', 'blocks', 'memo', 'status'],
    program_participants: ['program_id', 'student_id', 'exception_id', 'status']
  };
  const tail = ['created_at', 'created_by', 'updated_at', 'updated_by'];
  for (const [tab, cols] of Object.entries(want)) assert.deepStrictEqual(env.sheetValues(tab)[0].map(String), ['id'].concat(cols, tail), tab);
  const sd = env.asOwner((c) => plain(c.headersFor_('db', 'student_docs_a1b2c3d4')));
  assert.deepStrictEqual(sd, ['id', 'term_id', 'student_id', 'doc_type_id', 'state', 'submitted_date', 'memo'].concat(tail));
  assert.ok(env.sheetValues('students')[0].map(String).join('|').includes('email|phone|memo|created_at'));
  assert.ok(env.sheetValues('guardian_links')[0].map(String).join('|').includes('relation|name|phone|memo|created_at'));
});

test('옛 시트(연락처 열 없음)에 setup하면 phone·name 열만 제자리에 끼우고 기존 값은 그대로', () => {
  const env = seeded();
  const oldHead = ['id', 'student_no', 'name', 'gender', 'grade', 'class_no', 'number', 'track', 'email', 'memo', 'created_at', 'created_by', 'updated_at', 'updated_by'];
  const idx = env.sheetValues('students')[0].map(String);
  const before = env.rows('students').map((r) => oldHead.map((h) => r[h]));
  const sh = env.file('db').getSheetByName('students');
  sh.clear();
  sh.getRange(1, 1, before.length + 1, oldHead.length).setNumberFormat('@').setValues([oldHead].concat(before));
  const report = plain(env.asOwner((c) => c.setup())).map((x) => x.trim());
  assert.ok(report.includes('[열 추가] students: phone'), JSON.stringify(report.filter((l) => /students|guardian/.test(l))));
  assert.deepStrictEqual(env.sheetValues('students')[0].map(String), idx);
  assert.deepStrictEqual(env.rows('students').map((r) => oldHead.map((h) => r[h])), before, '기존 값 그대로');
  assert.ok(env.rows('students').every((r) => r.phone === ''), '새 열은 빈 칸');
});

test('readAll_는 연락처 열을 지운 행만 준다(학생 phone, 보호자 name·phone), readContacts_만 값을 준다, 다른 탭의 name 열은 그대로', () => {
  const env = seeded();
  plant(env, 'students', 'phone', '010-0000-1001');
  plant(env, 'guardian_links', 'phone', '010-0000-2001');
  plant(env, 'guardian_links', 'name', '가짜보호자');
  const r = env.as(OWNER, (c) => plain({ s: c.readAll_('students')[0], g: c.readAll_('guardian_links')[0], u: c.readAll_('users')[0], cs: c.readContacts_('students')[0], cg: c.readContacts_('guardian_links')[0] }));
  assert.ok(!('phone' in r.s) && !('phone' in r.g) && !('name' in r.g), JSON.stringify(Object.keys(r.g)));
  assert.ok('name' in r.s && 'name' in r.u, '학생 이름·사용자 이름은 연락처가 아니다');
  assert.deepStrictEqual([r.cs.phone, r.cg.phone, r.cg.name], ['010-0000-1001', '010-0000-2001', '가짜보호자']);
  // 캐시: readAll_ 뒤에 readContacts_를 불러도, 그 반대도 서로 섞이지 않는다
  const again = env.as(OWNER, (c) => { c.readContacts_('students'); const a = c.readAll_('students')[0]; c.invalidate_('db', 'students'); const b = c.readContacts_('students')[0]; const d = c.readAll_('students')[0]; return plain({ a: 'phone' in a, b: 'phone' in b, d: 'phone' in d }); });
  assert.deepStrictEqual(again, { a: false, b: true, d: false });
  // 같은 실행 안에서 쓴 뒤에는 readContacts_도 새 값(쓰기가 연락처 캐시도 비운다)
  const fresh = env.as(OWNER, (c) => { const id = c.readContacts_('students')[0].id; c.updateRecord_('students', id, { phone: '010-0000-1777' }, OWNER); return c.readContacts_('students')[0].phone; });
  assert.strictEqual(fresh, '010-0000-1777');
});

test('줄 전체를 다시 쓰는 updateRecord_가 연락처 칸을 지우지 않는다(학생·보호자), 바뀌지 않은 열은 그대로', () => {
  const env = seeded();
  plant(env, 'students', 'phone', '010-0000-1001');
  plant(env, 'guardian_links', 'phone', '010-0000-2001');
  plant(env, 'guardian_links', 'name', '가짜보호자');
  const s = env.rows('students')[0], g = env.rows('guardian_links')[0];
  env.as(OWNER, (c) => { c.updateRecord_('students', s.id, { memo: '메모 수정' }, OWNER); c.updateRecord_('guardian_links', g.id, { relation: '모' }, OWNER); });
  assert.deepStrictEqual([cell(env, 'students', 'phone'), cell(env, 'students', 'memo')], ['010-0000-1001', '메모 수정']);
  assert.deepStrictEqual([cell(env, 'guardian_links', 'phone'), cell(env, 'guardian_links', 'name'), cell(env, 'guardian_links', 'relation')], ['010-0000-2001', '가짜보호자', '모']);
  // 연락처 열 자체를 고치는 것도 된다(명단 올리기·C29)
  env.as(OWNER, (c) => c.updateRecord_('students', s.id, { phone: '010-0000-1999' }, OWNER));
  assert.strictEqual(cell(env, 'students', 'phone'), '010-0000-1999');
});

test('감사 기록: 추가·수정·일괄 수정 어디에도 번호·보호자 이름 값이 남지 않고 "바뀌었다"는 표시만(다른 열은 그대로 남는다)', () => {
  const env = seeded();
  const s = env.rows('students')[0], g = env.rows('guardian_links')[0];
  env.as(OWNER, (c) => {
    c.updateRecord_('students', s.id, { phone: '010-0000-3001', memo: '표시용 메모' }, OWNER);
    c.bulkUpdateRecords_('students', [{ id: env.rows('students')[1].id, patch: { phone: '010-0000-3002' } }], OWNER);
    c.updateRecord_('guardian_links', g.id, { name: '가짜보호자', phone: '010-0000-3003' }, OWNER);
    c.bulkUpdateRecords_('guardian_links', [{ id: g.id, patch: { name: '다른보호자', phone: '010-0000-3004' } }], OWNER);
    c.appendRecord_('guardian_links', { parent_email: 'fake.parent9@example.com', student_id: s.id, relation: '부', name: '새보호자', phone: '010-0000-3005', memo: '' }, OWNER);
    c.appendRecord_('students', { student_no: '9999', name: '가짜새학생', gender: '남', grade: '1', class_no: '1', number: '99', track: '', email: 'fake.new@example.com', phone: '010-0000-3006', memo: '' }, OWNER);
    c.bulkAppend_('students', [{ student_no: '9998', name: '가짜새학생2', phone: '010-0000-3007' }], OWNER);
  });
  const audit = JSON.stringify(env.rows('audit_log').map((a) => [a.sheet, a.action, a.before, a.after, a.detail]));
  assert.ok(!/010[-. ]?0000/.test(audit), '번호가 감사 기록에 없다');
  for (const n of ['가짜보호자', '다른보호자', '새보호자']) assert.ok(!audit.includes(n), n + ' 보호자 이름이 감사 기록에 없다');
  assert.ok(audit.includes('(연락처 생략)'), '바뀌었다는 표시');
  assert.ok(audit.includes('표시용 메모'), '다른 열 값은 그대로 남는다');
  assert.ok(audit.includes('가짜새학생'), '학생 이름은 연락처가 아니다');
  // 값은 시트에 제대로 들어갔다
  assert.strictEqual(env.rows('students').find((r) => r.id === s.id).phone, '010-0000-3001');
});

test('권한 키: doc.view·doc.edit·doc.types·program.view·program.edit·contact.view 역할표(승인 #160), 연락처는 담당교사·관리자·그날 근무교사만', () => {
  const env = seeded();
  const keys = env.as(OWNER, (c) => plain(c.permissions_()));
  assert.deepStrictEqual(keys['doc.view'].roles, ['admin', 'hall_teacher', 'attendance']);
  assert.deepStrictEqual(keys['doc.edit'], { roles: ['admin', 'hall_teacher'], scope: 'student' });
  assert.deepStrictEqual(keys['doc.types'].roles, ['admin']);
  assert.deepStrictEqual(keys['program.view'].roles, ['admin', 'attendance', 'hall_teacher']);
  assert.deepStrictEqual(keys['program.edit'].roles, ['admin', 'attendance', 'hall_teacher'], '특강·체험학습은 학사 교사도 만든다(총괄 답)');
  assert.deepStrictEqual(keys['contact.view'], { roles: ['admin', 'hall_teacher'], scope: 'student' });

  const term = env.as(OWNER, (c) => c.getCurrentTerm_().id);
  const mine = env.rows('enrollments').find((e) => e.term_id === term && e.teacher_email === HALL);
  const others = env.rows('enrollments').filter((e) => e.term_id === term && e.teacher_email !== HALL);
  assert.ok(mine && others.length, '가짜 데이터에 담당 학생이 있다');
  const check = (who, sid) => env.errorOf(who, (c) => c.requirePermission_('contact.view', { studentId: sid }));
  assert.strictEqual(check(OWNER, mine.student_id), null, '관리자');
  assert.strictEqual(check(HALL, mine.student_id), null, '담당교사');
  const dutyToday = env.as(OWNER, (c) => c.isOnDutyFor_(HALL, '', 0));
  const notMine = others.find((e) => e.teacher_email === OTHER) || others[0];
  // 담당이 아닌 학생: 그날 근무교사면 통과, 아니면 거부
  assert.strictEqual(check(HALL, notMine.student_id) === null, !!dutyToday, '담당 아님 → 근무 여부로');
  for (const who of [ATT, HOMEROOM, DUTYM, STUDENT, PARENT, 'nobody@example.com']) {
    assert.match(String(check(who, mine.student_id).message), /권한이 없습니다/, who);
  }
  assert.ok(env.auditActions('denied:contact.view').length >= 1, 'denied:contact.view 기록');
});

test('근무교사 경로: 담당이 아닌 학사 교사도 오늘 근무자면 그 학생 연락처 권한을 통과한다(근무가 없는 날은 거부)', () => {
  const env = seeded();
  const term = env.as(OWNER, (c) => c.getCurrentTerm_().id);
  const target = env.rows('enrollments').find((e) => e.term_id === term && e.teacher_email !== OTHER);
  const check = (who) => env.errorOf(who, (c) => c.requirePermission_('contact.view', { studentId: target.student_id }));
  assert.ok(check(OTHER), '근무표가 없으면 담당 아닌 교사는 거부');
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-03-09', slot: '단독', end_time: '', original_email: OTHER, actual_email: OTHER, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, OWNER));
  assert.strictEqual(check(OTHER), null, '오늘 근무자는 통과');
  env.setNow('2027-03-10T15:00:00');
  assert.ok(check(OTHER), '다음 날에는 거부(dutyWindow 없음)');
});
