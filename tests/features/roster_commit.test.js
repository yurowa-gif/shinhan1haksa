/** C3 2차: 학생 명단·학부모 연결 미리보기·저장(가짜 서비스 + R2 규칙) */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const FILES = ['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/RosterRules.gs',
  'src/dev/FakeData.gs', 'src/features/Roster.gs'];
const fakeCtx = loadGs(['src/Schema.gs', 'src/dev/FakeData.gs']);
const fake = plain(fakeCtx.buildFakeData_({}));
const TERM2 = fake.terms[1];            // 2027 1학기 2027-03-02 ~ 2027-07-17
const enrOf = Object.fromEntries(fake.enrollments.filter((e) => e.term_id === TERM2.id).map((e) => [e.student_id, e]));
const HEAD = '학번,학년,반,번호,이름,성별,계열,학사,기숙사,베리타스,조식,석식,통학구분,담당교사이메일,학생구글계정,비고';
const ox = (b) => (b ? 'O' : 'X');
function rosterLines(students) {
  return students.map((s) => {
    const e = enrOf[s.id], dorm = e.commute_type !== '일반';
    return [s.student_no, s.grade, s.class_no, s.number, s.name, s.gender, s.track, 'O', ox(dorm), ox(e.veritas === 'TRUE'), ox(dorm), '학사',
      e.commute_type, e.teacher_email, s.email, ''].join(',');
  });
}
const FULL = [HEAD].concat(rosterLines(fake.students)).join('\n');
const OPTS = { termId: TERM2.id, ymd: '2027-03-02' };
const ADMIN = 'admin@example.com';

function makeServer(email, roles, seedDb) {
  const db = { terms: fake.terms.map((t) => Object.assign({}, t)), students: [], enrollments: [], status_changes: [], users: [], guardian_links: [], audit_log: [] };
  db.users.push({ id: 'u0', email, active: 'TRUE', roles: roles.join(','), name: '가짜교사', homeroom_class: '' });
  db.users.push({ id: 'u1', email: 'fake.teacher1@example.com', active: 'TRUE', roles: 'hall_teacher', name: 'T1', homeroom_class: '' });
  db.users.push({ id: 'u2', email: 'fake.teacher2@example.com', active: 'TRUE', roles: 'hall_teacher', name: 'T2', homeroom_class: '' });
  db.users.push({ id: 'u3', email: 'fake.teacher3@example.com', active: 'TRUE', roles: 'hall_teacher', name: 'T3', homeroom_class: '' });
  Object.assign(db, seedDb || {});
  const denied = [], writes = [];
  let uid = 0, depth = 0, failOn = null;
  const copy = (r) => Object.assign({}, r);
  const c = loadGs(FILES, {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    Utilities: { getUuid: () => 'uuid-' + (++uid) },
    readAll_: (n) => (db[n] || []).map(copy), invalidate_: () => {}, today_: () => '2027-03-03', nowIso_: () => '2027-03-03T10:00:00',
    logDenied_: (who, action) => denied.push(action),
    withLock_: (fn) => { depth++; try { return fn(); } finally { depth--; } },
    bulkAppend_: (sheet, rows, who) => {
      assert.ok(depth > 0, '쓰기는 락 안에서');
      if (failOn === sheet) { failOn = null; throw new Error('시트 쓰기 실패(시험)'); }
      if (!rows.length) return;
      rows.forEach((r) => db[sheet].push(Object.assign({ id: 'row-' + (++uid) }, r)));
      writes.push('+' + sheet + ':' + rows.length);
    },
    bulkUpdateRecords_: (sheet, patches, who) => {
      assert.ok(depth > 0, '쓰기는 락 안에서');
      if (!patches.length) return 0;
      patches.forEach((p) => Object.assign(db[sheet].find((r) => r.id === p.id), p.patch));
      writes.push('~' + sheet + ':' + patches.length);
      return patches.length;
    }
  });
  return { c, db, denied, writes, failNext: (sheet) => { failOn = sheet; } };
}
const admin = () => makeServer(ADMIN, ['admin']);
const prev = (s, text, opts) => plain(s.c.previewRoster(text, opts || OPTS));
const commit = (s, text, opts) => {
  const p = prev(s, text, opts);
  return plain(s.c.commitRoster(text, opts || OPTS, p.counts));
};

test('처음 올리기: 미리보기는 아무것도 쓰지 않고, 개수와 새 계정 수를 보여 준다', () => {
  const s = admin();
  const p = prev(s, FULL);
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.counts.newStudents, 30);
  assert.strictEqual(p.counts.newEnrollments, 30);
  assert.strictEqual(p.counts.newUsers, 30);
  assert.strictEqual(p.counts.ambiguous, 0);
  assert.ok(p.counts.newChanges >= 60, '학사·석식 30명씩 + 기숙사·조식');
  assert.strictEqual(p.lists.newStudents.length, 30);
  assert.deepStrictEqual(s.writes, [], '미리보기는 쓰지 않는다');
  assert.strictEqual(p.ymd, '2027-03-02');
  const wire = JSON.stringify(p);
  assert.ok(!wire.includes('example.com'), '응답에 이메일을 싣지 않는다');
});

test('저장: 학생→등록→상태→계정 순서, 새 id로 참조가 모두 바뀌고, 계정은 student 역할', () => {
  const s = admin();
  const r = commit(s, FULL);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(s.writes.map((w) => w.split(':')[0]), ['+students', '+enrollments', '+status_changes', '+users']);
  assert.strictEqual(s.db.students.length, 30);
  const ids = new Set(s.db.students.map((x) => x.id));
  for (const e of s.db.enrollments) { assert.ok(ids.has(e.student_id), '등록의 학생 id'); assert.strictEqual(e.term_id, TERM2.id); }
  for (const c of s.db.status_changes) {
    assert.ok(ids.has(c.student_id) && !String(c.student_id).startsWith('new:'));
    assert.strictEqual(c.source, '명단업로드'); assert.strictEqual(c.status, '유효');
    assert.strictEqual(c.requested_at, '2027-03-03T10:00:00'); assert.strictEqual(c.effective_date, '2027-03-02');
  }
  const stuUsers = s.db.users.filter((u) => u.roles === 'student');
  assert.strictEqual(stuUsers.length, 30);
  assert.ok(stuUsers.every((u) => u.active === 'TRUE' && u.name));
  assert.ok(s.db.students.every((x) => x.memo === ''), '비고는 학생이 아니라 등록으로 간다');
});

test('같은 파일을 다시 올리면 "변경 없음"이고 쓰기 0건(상태 변경도 0건)', () => {
  const s = admin();
  commit(s, FULL);
  const before = s.writes.length;
  const p = prev(s, FULL);
  assert.strictEqual(p.nothingToDo, true);
  for (const k of ['newStudents', 'updatedStudents', 'newEnrollments', 'updatedEnrollments', 'newChanges', 'newUsers', 'updatedUsers']) assert.strictEqual(p.counts[k], 0, k);
  assert.deepStrictEqual(plain(s.c.commitRoster(FULL, OPTS, p.counts)), { ok: true, nothingToDo: true, counts: p.counts });
  assert.strictEqual(s.writes.length, before);
});

test('오류가 한 건이라도 있으면 줄 번호·열과 함께 알려 주고 아무것도 쓰지 않는다(나쁜 입력)', () => {
  const s = admin();
  const lines = FULL.split('\n');
  lines[3] = lines[3].replace(/,(남|여),/, ',?,');
  const bad = lines.join('\n');
  const p = prev(s, bad);
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.errors[0].line, 4);
  assert.strictEqual(p.errors[0].column, '성별');
  const r = plain(s.c.commitRoster(bad, OPTS, {}));
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(s.writes, []);
  assert.strictEqual(prev(s, '학번,이름\n1,가').ok, false, '머리글이 양식과 다르면 거부');
  assert.strictEqual(prev(s, FULL, { termId: 'nope' }).ok, false, '없는 기간');
  assert.strictEqual(prev(s, FULL, { termId: TERM2.id, ymd: '2027-02-30' }).ok, false, '없는 날짜');
  assert.strictEqual(prev(s, 'a\n"b').ok, false, '따옴표 오류');
});

test('모호한 줄(같은 학번·이름인데 학년이 다름)이 있으면 저장을 거부하고 0건 쓴다', () => {
  const first = fake.students[0];
  const s = makeServer(ADMIN, ['admin'], { students: [{ id: 'old1', student_no: first.student_no, name: first.name, grade: '9', email: '', gender: first.gender }] });
  const p = prev(s, FULL);
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.blocked, true);
  assert.strictEqual(p.counts.ambiguous, 1);
  assert.strictEqual(p.lists.ambiguous[0].line, 2);
  const r = plain(s.c.commitRoster(FULL, OPTS, p.counts));
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].message.includes('같은 사람인지'));
  assert.deepStrictEqual(s.writes, []);
});

test('미리보기 이후 데이터가 바뀌었으면(counts 불일치) 저장을 거부한다', () => {
  const s = admin();
  const p = prev(s, FULL);
  const stale = Object.assign({}, p.counts, { newStudents: 29 });
  const r = plain(s.c.commitRoster(FULL, OPTS, stale));
  assert.strictEqual(r.ok, false); assert.strictEqual(r.stale, true);
  assert.deepStrictEqual(s.writes, []);
  assert.strictEqual(plain(s.c.commitRoster(FULL, OPTS, undefined)).stale, true, 'expect 없이 부르면 거부');
});

test('이미 기록이 있는 상태가 명단과 달라도 바꾸지 않고 경고를 미리보기에 싣는다', () => {
  const s = admin();
  commit(s, FULL);
  const lines = FULL.split('\n');
  lines[2] = lines[2].replace(',학사,', ',일반,');   // 석식 학사 → 일반
  const changed = lines.join('\n');
  const p = prev(s, changed);
  assert.strictEqual(p.counts.newChanges, 0, '상태는 바꾸지 않는다');
  assert.ok(p.warningCount >= 1 && p.warnings.some((w) => w.includes('3줄')), '경고에 줄 번호: ' + JSON.stringify(p.warnings));
  assert.strictEqual(p.nothingToDo, true);
});

test('명단에 없는 학생은 퇴실 후보로 표시만 하고 상태를 바꾸지 않는다', () => {
  const s = admin();
  commit(s, FULL);
  const writes = s.writes.length;
  const lines = FULL.split('\n'); lines.splice(5, 1);
  const p = prev(s, lines.join('\n'));
  assert.strictEqual(p.counts.leaving, 1);
  assert.strictEqual(p.lists.leaving.length, 1);
  assert.strictEqual(p.counts.newChanges, 0);
  assert.strictEqual(p.nothingToDo, true, '표시만 하므로 저장할 것이 없다');
  assert.strictEqual(s.writes.length, writes);
});

test('학년·반이 바뀐 학생은 계정으로 이어져 학생 정보만 고친다(새 학생 아님)', () => {
  const s = admin();
  commit(s, FULL);
  const lines = FULL.split('\n');
  const cols = lines[1].split(',');
  cols[1] = String((+cols[1] % 3) + 1); cols[0] = cols[1] + cols[0].slice(1);
  lines[1] = cols.join(',');
  const p = prev(s, lines.join('\n'));
  assert.strictEqual(p.counts.newStudents, 0);
  assert.strictEqual(p.counts.updatedStudents, 1);
  assert.ok(p.lists.updatedStudents[0].fields.includes('학년'));
  const r = commit(s, lines.join('\n'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.db.students.length, 30);
  assert.strictEqual(s.db.students[0].grade, cols[1]);
});

test('중간에 실패해도 다시 올리면 남은 것만 쓰이고 학생이 중복되지 않는다(멱등)', () => {
  const s = admin();
  s.failNext('enrollments');
  const p = prev(s, FULL);
  assert.throws(() => s.c.commitRoster(FULL, OPTS, p.counts), /시험/);
  assert.strictEqual(s.db.students.length, 30);
  assert.strictEqual(s.db.enrollments.length, 0);
  const again = prev(s, FULL);
  assert.strictEqual(again.counts.newStudents, 0, '이미 쓴 학생은 다시 만들지 않는다');
  assert.strictEqual(again.counts.newEnrollments, 30);
  assert.strictEqual(plain(s.c.commitRoster(FULL, OPTS, again.counts)).ok, true);
  assert.strictEqual(s.db.students.length, 30);
  assert.strictEqual(s.db.enrollments.length, 30);
  assert.strictEqual(new Set(s.db.status_changes.map((c) => c.student_id + c.item)).size, s.db.status_changes.length, '상태 중복 없음');
  assert.strictEqual(prev(s, FULL).nothingToDo, true);
});

test('이미 있는 계정은 역할만 더하고(기존 역할 유지), 비활성이면 경고한다', () => {
  const st = fake.students[0], st2 = fake.students[1];
  const s = makeServer(ADMIN, ['admin'], {});
  s.db.users.push({ id: 'p1', email: st.email, active: 'TRUE', roles: 'parent', name: '이미 있음' });
  s.db.users.push({ id: 'p2', email: st2.email, active: 'FALSE', roles: 'student', name: '비활성' });
  const p = prev(s, FULL);
  assert.strictEqual(p.counts.updatedUsers, 1);
  assert.strictEqual(p.counts.newUsers, 28);
  assert.ok(p.warnings.some((w) => w.includes('비활성')));
  commit(s, FULL);
  assert.strictEqual(s.db.users.find((u) => u.id === 'p1').roles, 'parent,student');
  assert.strictEqual(s.db.users.find((u) => u.id === 'p1').name, '이미 있음', '이름은 바꾸지 않는다');
});

test('관리자가 아니면 모든 명단 함수를 거부하고 denied:roster.edit를 남기며 쓰기 0건', () => {
  for (const roles of [['hall_teacher'], ['attendance'], ['homeroom'], ['duty_manager'], ['student'], ['parent']]) {
    const s = makeServer('x@example.com', roles);
    for (const fn of [() => s.c.getRosterContext(), () => s.c.previewRoster(FULL, OPTS), () => s.c.commitRoster(FULL, OPTS, {}),
      () => s.c.previewGuardians('a', OPTS), () => s.c.commitGuardians('a', OPTS, {})]) {
      assert.throws(fn, /권한이 없습니다/, roles.join());
    }
    assert.deepStrictEqual(s.denied, Array(5).fill('roster.edit'));
    assert.deepStrictEqual(s.writes, []);
  }
});

test('getRosterContext: 기본 기간은 현재 기간, 적용일 기본값 = max(오늘, 기간 시작일)', () => {
  const s = admin();
  s.db.terms.push({ id: 'zzzzzzzz-future', name: '2027 2학기', type: '학기', start_date: '2027-08-17', end_date: '2028-02-28' });
  const ctx = plain(s.c.getRosterContext());
  assert.strictEqual(ctx.defaultTermId, TERM2.id);
  const by = Object.fromEntries(ctx.terms.map((t) => [t.name, t.defaultYmd]));
  assert.strictEqual(by['2027 1학기'], '2027-03-03', '이미 시작한 기간은 오늘');
  assert.strictEqual(by['2027 2학기'], '2027-08-17', '아직 시작 전이면 시작일');
});

/* ───── 학부모 연결 ───── */

const GHEAD = '학부모구글계정,학번,관계';
function studentsDone() { const s = admin(); commit(s, FULL); return s; }

test('학부모 연결: 형제는 같은 계정 여러 줄, 새 계정은 "학부모(자녀 이름)"·parent 역할, 다시 올리면 건너뜀', () => {
  const s = studentsDone();
  const a = fake.students[0], b = fake.students[1];
  const text = [GHEAD, 'par1@example.com,' + a.student_no + ',모', 'par1@example.com,' + b.student_no + ',모'].join('\n');
  const p = plain(s.c.previewGuardians(text, OPTS));
  assert.deepStrictEqual(p.counts, { newLinks: 2, skipped: 0, newUsers: 1, updatedUsers: 0 });
  assert.strictEqual(plain(s.c.commitGuardians(text, OPTS, p.counts)).ok, true);
  assert.strictEqual(s.db.guardian_links.length, 2);
  const parent = s.db.users.find((u) => u.email === 'par1@example.com');
  assert.strictEqual(parent.roles, 'parent'); assert.strictEqual(parent.name, '학부모(' + a.name + ')');
  const ids = new Set(s.db.students.map((x) => x.id));
  assert.ok(s.db.guardian_links.every((g) => ids.has(g.student_id)));
  const again = plain(s.c.previewGuardians(text, OPTS));
  assert.strictEqual(again.nothingToDo, true); assert.strictEqual(again.counts.skipped, 2);
});

test('학부모 연결: 없는 학번·잘못된 이메일은 줄 번호로 알리고 아무것도 쓰지 않는다(나쁜 입력)', () => {
  const s = studentsDone();
  const writes = s.writes.length;
  const text = [GHEAD, 'par1@example.com,99999,모', 'not-an-email,' + fake.students[0].student_no + ',부'].join('\n');
  const p = plain(s.c.previewGuardians(text, OPTS));
  assert.strictEqual(p.ok, false);
  const text2 = [GHEAD, 'par1@example.com,99999,모'].join('\n');
  const p2 = plain(s.c.previewGuardians(text2, OPTS));
  assert.strictEqual(p2.ok, false);
  assert.strictEqual(p2.errors[0].line, 2); assert.strictEqual(p2.errors[0].column, '학번');
  assert.strictEqual(plain(s.c.commitGuardians(text2, OPTS, {})).ok, false);
  assert.strictEqual(s.writes.length, writes);
});

test('학부모 연결: 이미 있는 계정에는 parent 역할만 더하고, 같은 학번이 여러 학생이면 이 기간 등록 학생을 고른다', () => {
  const s = studentsDone();
  const a = fake.students[0];
  s.db.students.push({ id: 'oldkid', student_no: a.student_no, name: '옛학생', grade: '3', email: 'old@example.com' });  // 옛 학년도에 같은 학번
  s.db.users.push({ id: 'tp', email: 'par9@example.com', active: 'TRUE', roles: 'homeroom', name: '교사 겸 학부모' });
  const text = [GHEAD, 'par9@example.com,' + a.student_no + ',모'].join('\n');
  const p = plain(s.c.previewGuardians(text, OPTS));
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.counts, { newLinks: 1, skipped: 0, newUsers: 0, updatedUsers: 1 });
  s.c.commitGuardians(text, OPTS, p.counts);
  assert.strictEqual(s.db.users.find((u) => u.id === 'tp').roles, 'homeroom,parent');
  const link = s.db.guardian_links[0];
  assert.notStrictEqual(link.student_id, 'oldkid');
});
