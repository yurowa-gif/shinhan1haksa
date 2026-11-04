/**
 * 순수 함수 단위 테스트 (node tests/run.js).
 * .gs 파일을 vm으로 읽어 Apps Script 서비스 없이 돌린다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = vm.createContext({ console });
for (const f of ['src/Schema.gs', 'src/Auth.gs', 'src/dev/FakeData.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('Schema');
test('모든 탭: 첫 열 id, 끝 4열 공통, 중복 열 없음', () => {
  for (const kind of Object.keys(ctx.SCHEMA)) {
    for (const sheet of Object.keys(ctx.SCHEMA[kind])) {
      const h = ctx.headersFor_(kind, sheet);
      assert.strictEqual(h[0], 'id', sheet);
      assert.deepStrictEqual(Array.from(h.slice(-4)), ['created_at', 'created_by', 'updated_at', 'updated_by'], sheet);
      assert.strictEqual(new Set(h).size, h.length, sheet + ' 중복 열');
    }
  }
});
test('0단계 탭이 모두 있다', () => {
  for (const t of ['users', 'terms', 'students', 'enrollments', 'guardian_links', 'audit_log']) {
    assert.ok(ctx.SCHEMA.db[t], t);
  }
  assert.ok(ctx.SCHEMA.counsel.counsel_notes);
  assert.ok(ctx.SCHEMA.config.settings);
});

console.log('Auth');
test('parseRoles_: 쉼표·공백 구분, 모르는 역할 무시, 우선순위 정렬', () => {
  assert.deepStrictEqual(Array.from(ctx.parseRoles_('hall_teacher, admin')), ['admin', 'hall_teacher']);
  assert.deepStrictEqual(Array.from(ctx.parseRoles_('Parent,foo')), ['parent']);
  assert.deepStrictEqual(Array.from(ctx.parseRoles_('')), []);
});

const NONE = { isOwn: false, isGuardian: false, isAssigned: false, isOnDuty: false, inHomeroom: false };
const VIEW = ['admin', 'hall_teacher', 'homeroom', 'student', 'parent'];
const can = (roles, facts, allowed = VIEW) => ctx.canAccessStudentByFacts_(roles, Object.assign({}, NONE, facts), allowed);

test('관리자는 모든 학생', () => assert.ok(can(['admin'], {})));
test('학사 교사: 담당 학생 또는 근무일만', () => {
  assert.ok(can(['hall_teacher'], { isAssigned: true }));
  assert.ok(can(['hall_teacher'], { isOnDuty: true }));
  assert.ok(!can(['hall_teacher'], {}));
});
test('담임: 자기 반만', () => {
  assert.ok(can(['homeroom'], { inHomeroom: true }));
  assert.ok(!can(['homeroom'], { isAssigned: true }));
});
test('학생: 본인만', () => {
  assert.ok(can(['student'], { isOwn: true }));
  assert.ok(!can(['student'], { isGuardian: true, inHomeroom: true }));
});
test('학부모: 연결된 자녀만', () => {
  assert.ok(can(['parent'], { isGuardian: true }));
  assert.ok(!can(['parent'], { isOwn: true }));
});
test('기능에 허용되지 않은 역할은 사실이 맞아도 거부', () => {
  assert.ok(!can(['parent'], { isGuardian: true }, ['admin', 'hall_teacher']));
  assert.ok(!can(['admin'], {}, ['hall_teacher']));
});
test('역할 없음 → 거부', () => assert.ok(!can([], { isOwn: true, isGuardian: true })));
test('hasAnyAllowedRole_', () => {
  assert.ok(ctx.hasAnyAllowedRole_(['homeroom'], ['admin', 'homeroom']));
  assert.ok(!ctx.hasAnyAllowedRole_(['student'], ['admin']));
});

test('sameClass_: 학급 표기 정규화', () => {
  assert.ok(ctx.sameClass_('1-3', '1', '3'));
  assert.ok(ctx.sameClass_('1-03', '1', '3'));
  assert.ok(ctx.sameClass_(' 1 - 3 ', 1, 3));
  assert.ok(!ctx.sameClass_('1-3', '1', '13'));
  assert.ok(!ctx.sameClass_('', '1', '3'));
});

console.log('배포 안전');
const SRC_FILES = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.gs')) SRC_FILES.push(p);
  }
})(path.join(__dirname, '..', 'src'));

test('각 .gs 파일의 전역 코드가 다른 파일 없이도 실행된다(파일 로드 순서 무관)', () => {
  for (const f of SRC_FILES) {
    const solo = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(f, 'utf8'), solo, { filename: f });
  }
});

// 이름 끝에 _ 가 없는 전역 함수는 브라우저에서 google.script.run으로 누구나 호출할 수 있다.
// 새 공개 함수를 추가할 때는 첫 줄에 requirePermission_ 또는 assertOwnerRun_ 을 넣고 여기에 등록한다.
const PUBLIC_ALLOWED = new Set([
  'doGet', 'include', 'getHomeData', 'getStudentSummary', 'diagPing', // 화면용
  'setup', 'addUser', 'seedFakeData' // 편집기용(assertOwnerRun_)
]);
test('공개 함수(이름 끝 _ 없음)는 허용 목록에 있는 것만', () => {
  for (const f of SRC_FILES) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) {
      const name = m[1];
      if (name.endsWith('_')) continue;
      assert.ok(PUBLIC_ALLOWED.has(name), path.basename(f) + ': ' + name + ' 이(가) 공개 함수입니다');
    }
  }
});
test('허용된 공개 함수는 첫 문장에서 권한·소유자를 확인한다', () => {
  const guard = {
    getHomeData: 'requirePermission_', getStudentSummary: 'requirePermission_',
    setup: 'assertOwnerRun_', addUser: 'assertOwnerRun_', seedFakeData: 'assertOwnerRun_', diagPing: 'isDiagEnabled_'
  };
  for (const f of SRC_FILES) {
    const src = fs.readFileSync(f, 'utf8');
    for (const [fn, g] of Object.entries(guard)) {
      const m = src.match(new RegExp('^function ' + fn + '\\([^)]*\\)\\s*\\{\\s*\\n([^\\n]*)', 'm'));
      if (m) assert.ok(m[1].includes(g), fn + ' 첫 줄에 ' + g + ' 없음: ' + m[1]);
    }
  }
});

console.log('FakeData');
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
