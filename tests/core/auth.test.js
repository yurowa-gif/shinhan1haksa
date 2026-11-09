/** 권한 판정 순수 함수(src/Auth.gs) */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs', 'src/Auth.gs']);

test('parseRoles_: 쉼표·공백 구분, 모르는 역할 무시, 우선순위 정렬', () => {
  assert.deepStrictEqual(Array.from(ctx.parseRoles_('hall_teacher, admin')), ['admin', 'hall_teacher']);
  assert.deepStrictEqual(Array.from(ctx.parseRoles_('Parent,foo')), ['parent']);
  assert.deepStrictEqual(Array.from(ctx.parseRoles_('')), []);
});

const NONE = { isOwn: false, isGuardian: false, isAssigned: false, isOnDuty: false, inHomeroom: false, isEnrolled: false };
const VIEW = ['admin', 'attendance', 'hall_teacher', 'homeroom', 'student', 'parent'];
const can = (roles, facts, allowed = VIEW) => ctx.canAccessStudentByFacts_(roles, Object.assign({}, NONE, facts), allowed);

test('관리자는 모든 학생', () => assert.ok(can(['admin'], {})));
test('출결 담당: 이번 기간 학사생 전체, 미등록 학생은 제외', () => {
  assert.ok(can(['attendance'], { isEnrolled: true }));
  assert.ok(!can(['attendance'], {}));
  assert.ok(!can(['attendance'], { isEnrolled: true }, ['admin', 'hall_teacher']));
});
test('학사 교사: 담당 학생, 또는 근무일이면서 이번 기간 등록 학생만(근무일만으로는 미등록 학생까지 통과하지 않는다)', () => {
  assert.ok(can(['hall_teacher'], { isAssigned: true }));
  assert.ok(can(['hall_teacher'], { isOnDuty: true, isEnrolled: true }));
  assert.ok(!can(['hall_teacher'], { isOnDuty: true }), '근무일이어도 미등록 학생은 거부');
  assert.ok(!can(['hall_teacher'], {}));
});
test('wideView(보기 키): 학사 교사도 이번 기간 학사생 전체, 미등록은 제외 · 기본(쓰기)은 그대로', () => {
  const wide = (roles, facts) => ctx.canAccessStudentByFacts_(roles, Object.assign({}, NONE, facts), VIEW, true);
  assert.ok(wide(['hall_teacher'], { isEnrolled: true }));
  assert.ok(!wide(['hall_teacher'], {}));
  assert.ok(!can(['hall_teacher'], { isEnrolled: true }), 'wide 표시가 없으면 담당·근무일만');
  assert.ok(!wide(['homeroom'], { isEnrolled: true }), '담임은 wide여도 자기 반만');
  assert.ok(!wide(['parent'], { isEnrolled: true }) && !wide(['student'], { isEnrolled: true }));
});
test('permissions_: wideView는 보기 키 3개에만(student.view·status.view·exception.view), 쓰기·면담 키는 없다', () => {
  const p = ctx.permissions_();
  const wideKeys = Object.keys(p).filter((k) => p[k].wideView).sort();
  assert.deepStrictEqual(wideKeys, ['exception.view', 'status.view', 'student.view']);
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
