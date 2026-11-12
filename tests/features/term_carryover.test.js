/** C1 후속: 이전 학기 명단 이어받기(R2 carryOverEnrollments_ 사용)와 새 기간의 기간별 탭 만들기 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const FILES = ['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/dev/FakeData.gs', 'src/features/Terms.gs'];
const fake = plain(loadGs(['src/Schema.gs', 'src/dev/FakeData.gs']).buildFakeData_({}));
const T1 = fake.terms[0], T2 = fake.terms[1];            // 2026 2학기(테스트) → 2027 1학기
const stu = fake.students;

function makeServer(email, roles, over) {
  const db = {
    terms: fake.terms.map((t) => Object.assign({}, t)),
    students: stu.map((s) => Object.assign({}, s)),
    enrollments: fake.enrollments.filter((e) => e.term_id === T1.id).map((e) => Object.assign({}, e)),   // 이전 학기만 등록돼 있다
    status_changes: stu.map((s, i) => ({ id: 'c' + i, student_id: s.id, item: '학사', value: '입실', effective_date: '2026-08-17', requested_at: '', status: '유효' })),
    users: [{ id: 'u0', email, active: 'TRUE', roles: roles.join(','), name: '가짜', homeroom_class: '' }]
  };
  Object.assign(db, over || {});
  const denied = [], writes = [], tabs = [];
  let uid = 0, depth = 0;
  const c = loadGs(FILES, {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    readAll_: (n) => (db[n] || []).map((r) => Object.assign({}, r)), invalidate_: () => {}, findById_: (n, id) => (db[n] || []).find((r) => r.id === id) || null,
    today_: () => '2027-03-03', logDenied_: (who, action) => denied.push(action),
    withLock_: (fn) => { depth++; try { return fn(); } finally { depth--; } },
    bulkAppend_: (sheet, rows) => { assert.ok(depth > 0, '쓰기는 락 안에서'); rows.forEach((r) => db[sheet].push(Object.assign({ id: 'n' + (++uid) }, r))); if (rows.length) writes.push('+' + sheet + ':' + rows.length); },
    appendRecord_: (sheet, rec) => { assert.ok(depth > 0); const r = Object.assign({ id: 'new-term-id-' + (++uid) }, rec); db[sheet].push(r); writes.push('+' + sheet); return r; },
    updateRecord_: (sheet, id, patch) => { assert.ok(depth > 0); const r = db[sheet].find((x) => x.id === id); Object.assign(r, patch); writes.push('~' + sheet); return r; },
    ensureTermSheet_: (base, id) => { tabs.push(base + ':' + id); }
  });
  return { c, db, denied, writes, tabs };
}
const admin = (over) => makeServer('admin@example.com', ['admin'], over);

test('이어받기 미리보기: 직전 학기 학사생 전원(30명)을 새 학기에 등록할 초안으로 보여 준다(쓰기 없음)', () => {
  const s = admin();
  const p = plain(s.c.previewCarryOver(T2.id));
  assert.strictEqual(p.ok, true); assert.strictEqual(p.applicable, true);
  assert.strictEqual(p.count, 30); assert.strictEqual(p.fromTermName, T1.name); assert.strictEqual(p.termName, T2.name);
  assert.strictEqual(p.students.length, 30);
  assert.ok(p.students.every((x) => x.student_no && x.name));
  assert.deepStrictEqual(s.writes, []);
  assert.ok(!JSON.stringify(p).includes('example.com'), '이메일을 내보내지 않는다');
});

test('퇴실한 학생과 이미 새 학기에 등록된 학생은 빠진다', () => {
  const s = admin();
  s.db.status_changes.push({ id: 'x1', student_id: stu[0].id, item: '학사', value: '퇴실', effective_date: '2027-02-01', requested_at: '', status: '유효' });
  s.db.enrollments.push({ id: 'e-already', term_id: T2.id, student_id: stu[1].id, teacher_email: 't@example.com', veritas: 'FALSE', commute_type: '일반', end_type: '23:50', memo: '' });
  const p = plain(s.c.previewCarryOver(T2.id));
  assert.strictEqual(p.count, 28);
  assert.ok(!p.students.some((x) => x.student_no === stu[0].student_no || x.student_no === stu[1].student_no));
});

test('저장: 등록만 만든다(담당교사·베리타스·통학·종료 유형 그대로, 메모 비움), 학생·상태 기록은 건드리지 않는다', () => {
  const s = admin();
  const before = { students: s.db.students.length, changes: s.db.status_changes.length };
  const r = plain(s.c.commitCarryOver(T2.id, 30));
  assert.deepStrictEqual(r, { ok: true, count: 30 });
  assert.deepStrictEqual(s.writes, ['+enrollments:30']);
  const added = s.db.enrollments.filter((e) => e.term_id === T2.id);
  assert.strictEqual(added.length, 30);
  const old = Object.fromEntries(s.db.enrollments.filter((e) => e.term_id === T1.id).map((e) => [e.student_id, e]));
  for (const e of added) {
    const o = old[e.student_id];
    assert.deepStrictEqual([e.teacher_email, e.veritas, e.commute_type, e.end_type, e.memo], [o.teacher_email, o.veritas, o.commute_type, o.end_type, '']);
    assert.ok(!('from_enrollment_id' in e), '내부 값은 시트에 쓰지 않는다');
  }
  assert.strictEqual(s.db.students.length, before.students); assert.strictEqual(s.db.status_changes.length, before.changes);
});

test('다시 눌러도 중복이 없다: 두 번째 미리보기는 0명, 저장은 거부', () => {
  const s = admin();
  s.c.commitCarryOver(T2.id, 30);
  const p = plain(s.c.previewCarryOver(T2.id));
  assert.strictEqual(p.count, 0); assert.ok(p.message.includes('이어받을 학생이 없습니다'));
  const w = s.writes.length;
  const r = plain(s.c.commitCarryOver(T2.id, 0));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(s.writes.length, w);
  assert.strictEqual(s.db.enrollments.filter((e) => e.term_id === T2.id).length, 30);
});

test('미리보기 이후 인원이 달라졌으면(예: 그 사이 한 명 퇴실) 저장을 거부한다', () => {
  const s = admin();
  s.db.status_changes.push({ id: 'x2', student_id: stu[5].id, item: '학사', value: '퇴실', effective_date: '2027-02-20', requested_at: '', status: '유효' });
  const r = plain(s.c.commitCarryOver(T2.id, 30));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.stale, true);
  assert.deepStrictEqual(s.writes, []);
  assert.strictEqual(plain(s.c.commitCarryOver(T2.id, '29')).ok, true, '숫자 문자열도 받는다');
});

test('방학 기간·직전 학기가 없는 기간·없는 기간은 이어받지 않고 이유를 알려 준다(나쁜 입력)', () => {
  const s = admin();
  s.db.terms.push({ id: 'vac-1', name: '2027 여름방학', type: '방학', start_date: '2027-07-18', end_date: '2027-08-22' });
  const v = plain(s.c.previewCarryOver('vac-1'));
  assert.strictEqual(v.applicable, false); assert.ok(v.message.includes('방학'));
  assert.strictEqual(plain(s.c.commitCarryOver('vac-1', 0)).ok, false);
  const first = plain(s.c.previewCarryOver(T1.id));
  assert.strictEqual(first.count, 0); assert.ok(first.message.includes('직전 학기가 없습니다'));
  assert.strictEqual(plain(s.c.previewCarryOver('nope')).ok, false);
  assert.deepStrictEqual(s.writes, []);
});

test('방학을 사이에 둔 학기 → 학기 이어받기(방학은 건너뛰고 직전 "학기"를 쓴다)', () => {
  const s = admin();
  s.db.terms.push({ id: 'vac-1', name: '2027 여름방학', type: '방학', start_date: '2027-07-18', end_date: '2027-08-22' });
  s.db.terms.push({ id: 'term-3', name: '2027 2학기', type: '학기', start_date: '2027-08-23', end_date: '2028-02-28' });
  s.db.enrollments = s.db.enrollments.concat(fake.enrollments.filter((e) => e.term_id === T2.id).map((e) => Object.assign({}, e)));
  const p = plain(s.c.previewCarryOver('term-3'));
  assert.strictEqual(p.fromTermName, T2.name);
  assert.strictEqual(p.count, 30);
});

test('관리자가 아니면 이어받기 함수 둘 다 거부하고 denied:term.edit를 남기며 쓰기 0건', () => {
  for (const roles of [['hall_teacher'], ['attendance'], ['homeroom'], ['duty_manager'], ['student'], ['parent']]) {
    const s = makeServer('x@example.com', roles);
    assert.throws(() => s.c.previewCarryOver(T2.id), /권한이 없습니다/, roles.join());
    assert.throws(() => s.c.commitCarryOver(T2.id, 30), /권한이 없습니다/, roles.join());
    assert.deepStrictEqual(s.denied, ['term.edit', 'term.edit']);
    assert.deepStrictEqual(s.writes, []);
  }
});

test('listTerms: 관리자만 canEdit(화면이 폼을 숨기는 데 쓴다, 서버 검사는 그대로)', () => {
  assert.strictEqual(plain(makeServer('a@example.com', ['admin']).c.listTerms()).canEdit, true);
  assert.strictEqual(plain(makeServer('t@example.com', ['hall_teacher']).c.listTerms()).canEdit, false);
  assert.throws(() => makeServer('s@example.com', ['student']).c.listTerms(), /권한이 없습니다/);
});

test('saveTerm: 새 기간을 만들면 그 기간의 기간별 탭(exceptions_·violations_)을 모두 만들고, 고칠 때는 만들지 않는다', () => {
  const s = admin();
  const r = plain(s.c.saveTerm({ name: '2027 2학기', type: '학기', start_date: '2027-08-23', end_date: '2028-02-28' }));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(s.tabs, ['exceptions:' + r.id, 'violations:' + r.id]);
  s.c.saveTerm({ id: r.id, token: s.c.termToken_(s.db.terms.find((t) => t.id === r.id)), name: '2027 2학기(수정)', type: '학기', start_date: '2027-08-23', end_date: '2028-02-28' });
  assert.strictEqual(s.tabs.length, 2);
  const bad = plain(s.c.saveTerm({ name: '', type: '학기' }));
  assert.strictEqual(bad.ok, false); assert.strictEqual(s.tabs.length, 2);
});

test('낡은 화면 방지(saveTerm 수정): A가 읽고 B가 먼저 저장하면 A의 옛 화면 저장은 {stale:true}·쓰기 0, 새 기간 만들기는 표가 필요 없고, 새 표로는 된다', () => {
  const s = admin();
  const mk = plain(s.c.saveTerm({ name: '2027 2학기', type: '학기', start_date: '2027-08-23', end_date: '2028-02-28' }));   // 새 기간: 표 없이
  assert.strictEqual(mk.ok, true);
  const seen = plain(s.c.listTerms()).terms.find((t) => t.id === mk.id).token;   // 관리자 A가 목록을 연다
  assert.ok(seen.startsWith(mk.id + '|'));
  const edit = (token, name) => plain(s.c.saveTerm({ id: mk.id, token, name, type: '학기', start_date: '2027-08-23', end_date: '2028-02-28' }));
  assert.strictEqual(edit(seen, '2027 2학기(B)').ok, true);   // B가 먼저 저장
  const w = s.writes.length, terms = JSON.stringify(s.db.terms);
  const old = edit(seen, '2027 2학기(A 옛 화면)');
  assert.deepStrictEqual([old.ok, old.stale, /새로 불러온 뒤/.test(old.error)], [false, true, true]);
  [undefined, '', 5, null].forEach((t) => assert.strictEqual(edit(t, 'x').stale, true, String(t)));
  assert.strictEqual(s.writes.length, w, '쓰기 0건');
  assert.strictEqual(JSON.stringify(s.db.terms), terms);
  assert.strictEqual(s.db.terms.find((t) => t.id === mk.id).name, '2027 2학기(B)');
  const fresh = plain(s.c.listTerms()).terms.find((t) => t.id === mk.id).token;
  assert.notStrictEqual(fresh, seen);
  assert.strictEqual(edit(fresh, '2027 2학기(A 새 화면)').ok, true);
});
