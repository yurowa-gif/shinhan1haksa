/** C1 운영 기간: 입력 검사(순수 함수)와 화면 라우팅 판정·권한표 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/Code.gs', 'src/features/Terms.gs']);

const good = { name: '2027 1학기', type: '학기', start_date: '2027-03-02', end_date: '2027-07-17', memo: '' };
const v = (input, terms) => plain(ctx.termValidate_(input, terms || []));
const fields = (r) => r.errors.map((e) => e.field);

test('올바른 입력은 통과하고 값을 다듬어 돌려준다', () => {
  const r = v(Object.assign({}, good, { name: '  2027 1학기  ' }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.record.name, '2027 1학기');
});

test('시작일이 종료일보다 늦으면 거부한다', () => {
  const r = v(Object.assign({}, good, { start_date: '2027-07-18', end_date: '2027-07-17' }));
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(fields(r), ['end_date']);
  assert.ok(r.errors[0].message.includes('시작일 이후'), '무엇을 하면 되는지 알려 준다');
});

test('시작일과 종료일이 같은 하루짜리 기간은 허용한다', () => {
  assert.strictEqual(v(Object.assign({}, good, { start_date: '2027-03-02', end_date: '2027-03-02' })).ok, true);
});

test('이름 비어 있음·유형 오류·날짜 형식 오류(없는 날 포함)를 모두 잡는다(나쁜 입력)', () => {
  assert.deepStrictEqual(fields(v({})), ['name', 'type', 'start_date', 'end_date']);
  assert.deepStrictEqual(fields(v(Object.assign({}, good, { type: '여름' }))), ['type']);
  assert.deepStrictEqual(fields(v(Object.assign({}, good, { start_date: '2027-02-30' }))), ['start_date']);
  assert.deepStrictEqual(fields(v(Object.assign({}, good, { end_date: '2027/07/17' }))), ['end_date']);
  assert.deepStrictEqual(fields(v(Object.assign({}, good, { name: 'ㄱ'.repeat(41) }))), ['name']);
  assert.strictEqual(ctx.termYmdOk_('2028-02-29'), true);
  assert.strictEqual(ctx.termYmdOk_('2027-02-29'), false);
});

test('같은 이름은 거부하되 자기 자신을 고칠 때는 허용한다', () => {
  const others = [{ id: 'a', name: '2027 1학기', start_date: '2027-03-02', end_date: '2027-07-17' }];
  assert.deepStrictEqual(fields(v(good, others)), ['name']);
  assert.strictEqual(v(Object.assign({ id: 'a' }, good), others).ok, true);
});

test('날짜가 겹치면 막지 않고 경고한다(가정)', () => {
  const others = [{ id: 'a', name: '2026 2학기', start_date: '2026-08-17', end_date: '2027-03-05' }];
  const r = v(good, others);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes('2026 2학기'));
  const none = v(good, [{ id: 'b', name: '겨울방학', start_date: '2026-12-21', end_date: '2027-03-01' }]);
  assert.deepStrictEqual(none.warnings, [], '하루 차이로 붙어 있으면 겹침이 아니다');
});

test('termSort_: 시작일 순', () => {
  const s = plain(ctx.termSort_([{ name: 'b', start_date: '2027-03-02' }, { name: 'a', start_date: '2026-08-17' }]));
  assert.deepStrictEqual(s.map((x) => x.name), ['a', 'b']);
});

/* ───── 권한표·라우팅 ───── */

const rolesOf = (code) => ctx.permissions_()[code].roles;

test('운영 기간 수정은 관리자만, 보기는 교사 역할만(학생·학부모 제외)', () => {
  assert.deepStrictEqual(plain(rolesOf('term.edit')), ['admin']);
  const view = plain(rolesOf('term.view'));
  assert.ok(view.includes('admin') && view.includes('hall_teacher') && view.includes('attendance'));
  assert.ok(!view.includes('student') && !view.includes('parent'));
});

test('화면 라우팅: 허용 역할만 열고 모르는 화면·학생·학부모는 거부한다', () => {
  const r = (page, roles) => plain(ctx.screenResolve_(page, roles));
  assert.strictEqual(r('terms', ['admin']).ok, true);
  assert.strictEqual(r('terms', ['hall_teacher']).ok, true);
  assert.strictEqual(r('terms', ['student']).ok, false);
  assert.strictEqual(r('terms', ['parent', 'student']).ok, false);
  assert.strictEqual(r('nope', ['admin']).ok, false);
  assert.strictEqual(r('constructor', ['admin']).ok, false, '객체 기본 속성 이름으로 우회 불가');
  assert.strictEqual(r('__proto__', ['admin']).ok, false);
  assert.strictEqual(r(undefined, ['admin']).ok, false);
});

test('SCREENS의 모든 화면 파일이 실제로 있고 permissions_ 키가 정의되어 있다', () => {
  const fs = require('fs');
  const path = require('path');
  for (const [page, s] of Object.entries(plain(ctx.SCREENS))) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'src', s.file + '.html')), page + ': ' + s.file);
    assert.ok(ctx.permissions_()[s.view], page + ': ' + s.view);
  }
});

/* ───── 서버 함수 권한(가짜 서비스) ───── */

function makeServer(email, roles) {
  const denied = [];
  const users = [{ id: 'u1', email, active: 'TRUE', roles: roles.join(','), name: '가짜교사', homeroom_class: '' }];
  const c = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/features/Terms.gs'], {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    readAll_: (sheet) => (sheet === 'users' ? users : []),
    findById_: () => null,
    today_: () => '2027-03-03',
    logDenied_: (who, action, why) => denied.push({ who, action, why }),
    withLock_: (fn) => fn(),
    invalidate_: () => {},
    appendRecord_: () => { throw new Error('저장되면 안 됩니다'); },
    updateRecord_: () => { throw new Error('저장되면 안 됩니다'); }
  });
  return { c, denied };
}

test('saveTerm: 관리자가 아니면 "권한이 없습니다."로 거부하고 denied:term.edit 기록을 남긴다', () => {
  for (const roles of [['hall_teacher'], ['attendance'], ['homeroom'], ['student'], ['parent']]) {
    const s = makeServer('t@example.com', roles);
    assert.throws(() => s.c.saveTerm(good), /권한이 없습니다/, roles.join());
    assert.strictEqual(s.denied.length, 1);
    assert.strictEqual(s.denied[0].action, 'term.edit');
  }
});

test('listTerms: 학생·학부모는 거부, 교사 역할은 통과', () => {
  assert.throws(() => makeServer('s@example.com', ['student']).c.listTerms(), /권한이 없습니다/);
  assert.throws(() => makeServer('p@example.com', ['parent']).c.listTerms(), /권한이 없습니다/);
  const r = plain(makeServer('t@example.com', ['hall_teacher']).c.listTerms());
  assert.deepStrictEqual(r.terms, []);
});
