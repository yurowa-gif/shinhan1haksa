/** C27 서류 체크리스트(결정 75①): 서류 종류(관리자), 학생별 제출 표시(담당·근무·관리자), 보기 범위, stale, 지우지 않음. gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain, loadGs } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', HALL = 'test.teacher@example.com', OTHER = 'fake.teacher2@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';

function seeded() {
  const env = createGasEnv({ owner: OWNER, now: '2027-03-09T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.setup());   // 가짜 기간이 생긴 뒤 기간별 탭(student_docs_<기간>)을 만든다
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  return env;
}
const call = (env, who, fn, ...a) => plain(env.call(who, fn, ...a));
function info(env) {
  const term = env.as(OWNER, (c) => c.getCurrentTerm_());
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  return { term, tab: 'student_docs_' + term.id.slice(0, 8), mine: enr.filter((e) => e.teacher_email === HALL).map((e) => e.student_id), theirs: enr.filter((e) => e.teacher_email !== HALL).map((e) => e.student_id), all: enr.map((e) => e.student_id) };
}
function addType(env, name) { const r = call(env, OWNER, 'saveDocType', { name }); assert.strictEqual(r.ok, true, JSON.stringify(r)); return r.id; }

test('서류 종류: 관리자만 추가·고치기·끄기(나머지 거부 + denied:doc.types), 이름 중복·길이·순서 검사, 끄면 status 취소로 남고 목록에서 빠짐', () => {
  const env = seeded();
  for (const who of [HALL, ATT, HOMEROOM, DUTYM, STUDENT, PARENT, OTHER]) {
    env.expectDenied(who, 'doc.types', 'saveDocType', { name: '입실 동의서' });
    env.expectDenied(who, 'doc.types', 'cancelDocType', 'x', '');
  }
  assert.strictEqual(env.rows('doc_types').length, 0);
  const a = addType(env, '입실 동의서'), b = addType(env, '결핵검사');
  assert.deepStrictEqual(env.rows('doc_types').map((r) => [r.name, r.sort_order, r.status]), [['입실 동의서', '1', '유효'], ['결핵검사', '2', '유효']]);
  for (const [bad, field] of [[{ name: '' }, 'name'], [{ name: '가'.repeat(41) }, 'name'], [{ name: '입실 동의서' }, 'name'], [{ name: 'x', description: 'd'.repeat(101) }, 'description'], [{ name: 'x', sort_order: 'a' }, 'sort_order']]) {
    const r = call(env, OWNER, 'saveDocType', bad);
    assert.deepStrictEqual([r.ok, (r.errors || [{}])[0].field], [false, field], JSON.stringify(bad));
  }
  const d = call(env, OWNER, 'getDocData');
  const tok = d.types.find((t) => t.id === a).token;
  env.setNow('2027-03-09T15:05:00');   // 수정 시각(updated_at)이 달라져야 옛 token을 알아본다
  assert.strictEqual(call(env, OWNER, 'saveDocType', { id: a, name: '입실 동의서(수정)', description: '설명', sort_order: '5', token: tok }).ok, true);
  const stale = call(env, OWNER, 'saveDocType', { id: a, name: '또 수정', token: tok });   // 옛 token
  assert.deepStrictEqual([stale.ok, stale.stale], [false, true]);
  assert.deepStrictEqual(call(env, OWNER, 'getDocData').types.map((t) => t.name), ['결핵검사', '입실 동의서(수정)'], '순서대로');
  const tb = call(env, OWNER, 'getDocData').types.find((t) => t.id === b).token;
  assert.strictEqual(call(env, OWNER, 'cancelDocType', b, 'old').stale, true);
  assert.strictEqual(call(env, OWNER, 'cancelDocType', b, tb).ok, true);
  assert.strictEqual(env.rows('doc_types').find((r) => r.id === b).status, '취소', '지우지 않는다');
  assert.deepStrictEqual(call(env, OWNER, 'getDocData').types.map((t) => t.name), ['입실 동의서(수정)']);
  assert.ok(env.auditActions().includes('update') && env.auditActions().includes('create'));
});

test('제출 표시: 행이 없으면 미제출, 담당교사가 [제출] → 행 한 줄·날짜, [미제출]로 되돌려도 같은 행을 고침(지우지 않음), 같은 값 다시는 쓰기 0, 해당없음', () => {
  const env = seeded(), x = info(env), t = addType(env, '입실 동의서'), sid = x.mine[0];
  const get = () => call(env, HALL, 'getDocData').students.find((s) => s.id === sid).docs[t];
  assert.strictEqual(get(), '미제출');
  assert.deepStrictEqual(call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '제출', expect: '미제출' }), { ok: true, state: '제출' });
  assert.strictEqual(get(), '제출');
  let rows = env.rows(x.tab);
  assert.deepStrictEqual([rows.length, rows[0].state, rows[0].submitted_date, rows[0].term_id, rows[0].student_id, rows[0].doc_type_id], [1, '제출', '2027-03-09', x.term.id, sid, t]);
  const w = env.rows('audit_log').length;
  assert.strictEqual(call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '제출', expect: '제출' }).unchanged, true);
  assert.strictEqual(env.rows('audit_log').length, w, '같은 값은 쓰지 않는다');
  assert.strictEqual(call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '미제출', expect: '제출' }).ok, true);
  rows = env.rows(x.tab);
  assert.deepStrictEqual([rows.length, rows[0].state, rows[0].submitted_date], [1, '미제출', ''], '같은 행을 고친다');
  assert.strictEqual(call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '해당없음', expect: '미제출' }).ok, true);
  assert.strictEqual(get(), '해당없음');
  // 행이 없는 칸을 '미제출'로 → 쓰기 없음
  const sid2 = x.mine[1] || x.mine[0], before = env.rows(x.tab).length;
  if (sid2 !== sid) { assert.strictEqual(call(env, HALL, 'saveDocState', { studentId: sid2, docTypeId: t, state: '미제출', expect: '미제출' }).unchanged, true); assert.strictEqual(env.rows(x.tab).length, before); }
  assert.ok(env.auditActions().includes('update'));
});

test('낡은 화면 방지: 다른 선생님이 먼저 바꾸면 {stale:true}·쓰기 0, expect가 없거나 틀려도 stale, 없어진 서류 종류도 stale', () => {
  const env = seeded(), x = info(env), t = addType(env, '입실 동의서'), sid = x.mine[0];
  call(env, OWNER, 'saveDocState', { studentId: sid, docTypeId: t, state: '제출', expect: '미제출' });   // 관리자가 먼저
  const before = JSON.stringify(env.rows(x.tab));
  const old = call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '해당없음', expect: '미제출' });
  assert.deepStrictEqual([old.ok, old.stale], [false, true]);
  for (const e of [null, '', 7, '없음']) assert.strictEqual(call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '해당없음', expect: e }).stale, true, String(e));
  assert.strictEqual(JSON.stringify(env.rows(x.tab)), before);
  const tok = call(env, OWNER, 'getDocData').types[0].token;
  call(env, OWNER, 'cancelDocType', t, tok);
  assert.strictEqual(call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '미제출', expect: '제출' }).stale, true);
});

test('저장 검사: 모르는 상태·이번 기간 학사생이 아닌 학생·기간 탭이 없을 때 안내, 쓰기 0', () => {
  const env = seeded(), x = info(env), t = addType(env, '입실 동의서');
  const sid = x.mine[0], before = JSON.stringify(env.rows(x.tab));
  assert.strictEqual(call(env, HALL, 'saveDocState', { studentId: sid, docTypeId: t, state: '완료', expect: '미제출' }).ok, false);
  // 학사생이 아닌 학생(등록 없는 학생 새로 만들기): 관리자도 거부
  const other = env.asOwner((c) => c.appendRecord_('students', { student_no: '99999', name: '가짜미등록', gender: '남', grade: '1', class_no: '1', number: '90', track: '', email: '', memo: '' }, OWNER).id);
  const r = call(env, OWNER, 'saveDocState', { studentId: other, docTypeId: t, state: '제출', expect: '미제출' });
  assert.deepStrictEqual([r.ok, /학사생/.test(r.error)], [false, true]);
  assert.strictEqual(JSON.stringify(env.rows(x.tab)), before);
});

test('보기·표시 범위: 담당교사는 담당 학생만, 담당 아닌 학생은 표시 거부(denied:doc.edit), 관리자·출결 담당은 전체(출결은 보기만), 그날 근무교사는 전체, 담임·근무표 담당자·학생·학부모는 거부', () => {
  const env = seeded(), x = info(env), t = addType(env, '입실 동의서');
  assert.deepStrictEqual(call(env, HALL, 'getDocData').students.map((s) => s.id).sort(), x.mine.slice().sort());
  assert.strictEqual(call(env, HALL, 'getDocData').canEdit, true);
  env.expectDenied(HALL, 'doc.edit', 'saveDocState', { studentId: x.theirs[0], docTypeId: t, state: '제출', expect: '미제출' });
  assert.deepStrictEqual(call(env, OWNER, 'getDocData').students.length, x.all.length);
  const att = call(env, ATT, 'getDocData');
  assert.deepStrictEqual([att.students.length, att.canEdit, att.canTypes], [x.all.length, false, false]);
  env.expectDenied(ATT, 'doc.edit', 'saveDocState', { studentId: x.mine[0], docTypeId: t, state: '제출', expect: '미제출' });
  assert.strictEqual(call(env, OTHER, 'getDocData').students.some((s) => x.mine.includes(s.id)), false, '담당 아님·근무 없음');
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-03-09', slot: '단독', end_time: '', original_email: OTHER, actual_email: OTHER, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, OWNER));
  assert.strictEqual(call(env, OTHER, 'getDocData').students.length, x.all.length, '오늘 근무교사는 전체');
  assert.strictEqual(call(env, OTHER, 'saveDocState', { studentId: x.mine[0], docTypeId: t, state: '제출', expect: '미제출' }).ok, true);
  for (const who of [HOMEROOM, DUTYM, STUDENT, PARENT]) {
    env.expectDenied(who, 'doc.view', 'getDocData');
    env.expectDenied(who, 'doc.edit', 'saveDocState', { studentId: x.mine[0], docTypeId: t, state: '제출', expect: '미제출' });
  }
});

test('요약: 미제출 건수·학생 수 = 직접 센 값, 홈 카드(getHomeData)와 같다, 서류 종류가 없으면 0', () => {
  const env = seeded(), x = info(env);
  assert.deepStrictEqual(call(env, OWNER, 'getDocData').missing, { students: 0, items: 0 });
  const a = addType(env, '입실 동의서'), b = addType(env, '결핵검사');
  const n = x.all.length;
  assert.deepStrictEqual(call(env, OWNER, 'getDocData').missing, { students: n, items: n * 2 });
  call(env, OWNER, 'saveDocState', { studentId: x.all[0], docTypeId: a, state: '제출', expect: '미제출' });
  call(env, OWNER, 'saveDocState', { studentId: x.all[0], docTypeId: b, state: '해당없음', expect: '미제출' });
  call(env, OWNER, 'saveDocState', { studentId: x.all[1], docTypeId: a, state: '제출', expect: '미제출' });
  assert.deepStrictEqual(call(env, OWNER, 'getDocData').missing, { students: n - 1, items: n * 2 - 3 });
  const home = call(env, OWNER, 'getHomeData', 'admin').docs;
  assert.deepStrictEqual([home.items, home.students], [n * 2 - 3, n - 1]);
  const mine = call(env, HALL, 'getHomeData', 'hall_teacher').docs;
  assert.strictEqual(mine.items, call(env, HALL, 'getDocData').missing.items);
  assert.ok(!('docs' in call(env, HOMEROOM, 'getHomeData', 'homeroom')), '담임 홈에는 없다');
});

test('기간 탭이 없는 옛 기간: 보기는 열리고(missingTab), 저장은 setup 안내로 거부', () => {
  const env = seeded(), x = info(env), t = addType(env, '입실 동의서');
  env.file('db').deleteSheet(env.file('db').getSheetByName(x.tab));
  const d = call(env, OWNER, 'getDocData');
  assert.deepStrictEqual([d.missingTab, d.students.length > 0], [true, true]);
  const r = call(env, OWNER, 'saveDocState', { studentId: x.mine[0], docTypeId: t, state: '제출', expect: '미제출' });
  assert.deepStrictEqual([r.ok, /setup/.test(r.error)], [false, true]);
});

test('관리자 진행 표(C27b): 서류별 제출·미제출·해당없음 학생 수와 담당교사별 미제출 = 직접 센 값, 이름·이메일 없음, 관리자에게만', () => {
  const env = seeded(), x = info(env);
  const a = addType(env, '입실 동의서'), b = addType(env, '결핵검사');
  const n = x.all.length;
  call(env, OWNER, 'saveDocState', { studentId: x.all[0], docTypeId: a, state: '제출', expect: '미제출' });
  call(env, OWNER, 'saveDocState', { studentId: x.all[1], docTypeId: a, state: '제출', expect: '미제출' });
  call(env, OWNER, 'saveDocState', { studentId: x.all[0], docTypeId: b, state: '해당없음', expect: '미제출' });
  const p = call(env, OWNER, 'getDocData').progress;
  assert.deepStrictEqual(p.byType.map((r) => [r.name, r.submitted, r.missing, r.na]), [['입실 동의서', 2, n - 2, 0], ['결핵검사', 0, n - 1, 1]]);
  // 담당교사별: 직접 센 값
  const enr = env.rows('enrollments').filter((e) => e.term_id === x.term.id);
  const nameOf = (email) => (env.rows('users').find((u) => u.email.toLowerCase() === email.toLowerCase()) || {}).name;
  const stuDocs = (sid) => ({ [a]: sid === x.all[0] || sid === x.all[1] ? '제출' : '미제출', [b]: sid === x.all[0] ? '해당없음' : '미제출' });
  const want = {};
  enr.forEach((e) => { const t = nameOf(e.teacher_email) || '(담당 없음)'; const w = (want[t] = want[t] || { students: 0, missing: 0 }); w.students++; w.missing += Object.values(stuDocs(e.student_id)).filter((v) => v === '미제출').length; });
  assert.deepStrictEqual(Object.fromEntries(p.byTeacher.map((r) => [r.teacher, { students: r.students, missing: r.missing }])), want);
  assert.deepStrictEqual(p.total, { students: n, missing: n * 2 - 3 });
  assert.ok(p.byTeacher.every((r, i, arr) => !i || arr[i - 1].missing >= r.missing), '미제출이 많은 선생님부터');
  assert.ok(!/@/.test(JSON.stringify(p)) && !env.rows('students').some((s) => JSON.stringify(p).includes(s.name)), '이름·이메일 없음');
  for (const who of [HALL, ATT, OTHER]) assert.strictEqual(call(env, who, 'getDocData').progress, null, who);
  // 학생 표기용 필드
  const s0 = call(env, OWNER, 'getDocData').students[0];
  assert.ok(s0.grade && s0.classNo && s0.number, JSON.stringify(s0));
});
