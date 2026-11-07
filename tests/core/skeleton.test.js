/**
 * S2-0a 2단계 골격(소유: 총괄): 권한 키 표, 새 화면, 주소 값, 홈 훅·ms, 홈 파일의 2단계 함수 자리.
 * 기준: docs/plan/stage2.md 2절 "S2-0a"·"2단계 권한 키".
 */
const assert = require('assert');
const { test, loadGs, plain, readFile } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/Schema.gs', 'src/Auth.gs', 'src/Code.gs']);

// 계획 표 그대로(4-1 답이 오면 이 표와 Auth.gs를 같이 고친다)
const STAGE2_KEYS = {
  'duty.view': { roles: ['admin', 'duty_manager', 'hall_teacher', 'attendance'] },
  'duty.edit': { roles: ['admin', 'duty_manager'] },
  'duty.swap': { roles: ['admin', 'duty_manager', 'hall_teacher'] },
  'duty.record': { roles: ['admin'] },
  'out.view': { roles: ['admin', 'hall_teacher', 'homeroom'] },
  'out.save': { roles: ['admin', 'hall_teacher'], scope: 'student', dutyWindow: 1 },
  'out.cancel': { roles: ['admin'] },
  'out.rules': { roles: ['admin'] },
  'out.dismiss': { roles: ['admin'] },
  'counsel.view': { roles: ['admin', 'hall_teacher', 'homeroom'], scope: 'student', noDuty: true },
  'counsel.save': { roles: ['hall_teacher'], scope: 'student', noDuty: true },
  'counsel.cancel': { roles: ['hall_teacher'] },
  'status.list': { roles: ['admin', 'hall_teacher', 'homeroom'] },
  'status.view': { roles: ['admin', 'hall_teacher', 'homeroom'], scope: 'student' },
  'status.edit': { roles: ['admin', 'hall_teacher'], scope: 'student', noDuty: true },
  'meal.count': { roles: ['admin'] }
};

test('permissions_: 2단계 키 16개가 계획 표의 역할·범위·표시 그대로다(학생·학부모 없음)', () => {
  const p = ctx.permissions_();
  for (const [key, want] of Object.entries(STAGE2_KEYS)) {
    assert.ok(p[key], key + ' 없음');
    const got = plain(p[key]);
    got.roles.sort();
    assert.deepStrictEqual(got, Object.assign({}, want, { roles: want.roles.slice().sort() }), key);
  }
});

test('SCREENS: 2단계 화면 4개의 파일·제목·보기 키, 열 수 있는 역할은 그 키를 따른다', () => {
  const want = { duty: ['근무표', 'duty.view'], outs: ['OUT', 'out.view'], moves: ['입퇴실·급식', 'status.list'], mealcount: ['식수 집계', 'meal.count'] };
  for (const [page, [title, view]] of Object.entries(want)) {
    assert.deepStrictEqual(plain(ctx.SCREENS[page]), { file: 'ui/screen_' + page, title, view }, page);
  }
  const ok = (page, role) => plain(ctx.screenResolve_(page, [role])).ok;
  assert.strictEqual(ok('duty', 'attendance'), true);
  assert.strictEqual(ok('outs', 'attendance'), false, '출결 담당은 OUT 화면 없음(Q7)');
  assert.strictEqual(ok('moves', 'homeroom'), true);
  assert.strictEqual(ok('mealcount', 'hall_teacher'), false);
  for (const page of Object.keys(want)) {
    for (const role of ['student', 'parent']) assert.strictEqual(ok(page, role), false, page + ' ' + role);
  }
});

test('screenParams_: 2단계 tab·month(yyyy-MM 모양)·prefill(out2만)을 통과시키고 나머지는 버린다(나쁜 입력)', () => {
  const run = (p) => JSON.parse(ctx.screenParams_(p));
  for (const tab of ['requests', 'list', 'mine', 'week', 'month', 'record', 'entry', 'term', 'today', 'dismiss', 'rules', 'meal', 'move', 'history']) {
    assert.deepStrictEqual(run({ tab }), { tab });
  }
  for (const tab of ['input', 'Week', 'week ', '']) assert.deepStrictEqual(run({ tab }), {}, tab);
  assert.deepStrictEqual(run({ month: '2027-01', prefill: 'out2', tab: 'move' }), { tab: 'move', month: '2027-01', prefill: 'out2' });
  assert.deepStrictEqual(run({ month: '2027-13' }), { month: '2027-13' }, '모양만 본다(달 범위는 서버 함수가 다시 확인)');
  for (const month of ['2027-1', '2027-01-01', '202701', '2027-01"', '<b>']) assert.deepStrictEqual(run({ month }), {}, month);
  for (const prefill of ['x', 'OUT2', 'out2 ', 'out', '']) assert.deepStrictEqual(run({ prefill }), {}, prefill);
  assert.ok(!ctx.screenParams_({ month: '</script>', tab: '<b>' }).includes('<'));
});

test('getHomeData: 교사 역할 5개는 훅 결과(지금 null)와 ms {duty, out, food}를 받고 기존 값은 그대로, 학생·학부모 홈에는 없다', () => {
  const env = createGasEnv();
  env.seedFake();
  const teachers = [['test.admin@example.com', 'admin', 'counts'], ['test.attendance@example.com', 'attendance', 'exc'],
    ['test.duty@example.com', 'duty_manager', 'month'], ['test.teacher@example.com', 'hall_teacher', 'students'],
    ['test.homeroom@example.com', 'homeroom', 'students']];
  for (const [who, role, kept] of teachers) {
    const d = env.call(who, 'getHomeData', role);
    assert.deepStrictEqual(Object.keys(d.ms).sort(), ['duty', 'food', 'out'], role);
    for (const k of ['duty', 'out', 'food']) {
      assert.strictEqual(typeof d.ms[k], 'number', role + ' ms.' + k);
      assert.strictEqual(d[k], null, role + ' ' + k);
    }
    assert.ok(d[kept] !== undefined, role + ': 기존 값 ' + kept);
  }
  for (const [who, role] of [['test.student@example.com', 'student'], ['test.parent@example.com', 'parent']]) {
    const d = env.call(who, 'getHomeData', role);
    assert.ok(!('ms' in d) && !('duty' in d), role);
  }
  // 훅은 (접속자, 보고 있는 홈 역할)을 받는다 — CODING 세션이 채울 약속
  const seen = plain(env.as('owner@example.com', (c) => {
    c.vioHomeInfo_ = (user, role) => ({ email: user.email, role });
    return c.getHomeData('hall_teacher').out;
  }));
  assert.deepStrictEqual(seen, { email: 'owner@example.com', role: 'hall_teacher' });
  env.expectDenied('test.duty@example.com', 'home.view', 'getHomeData', 'admin');
});

test('홈 4개 파일: 2단계 soon 카드 대신 renderStage2A·B를 부르고, 두 함수는 renderHome 위·아래 떨어진 자리에 하나씩 있다', () => {
  const gone = ['학사·기숙·조식·석식 인원', '2OUT 대상', '근무 편성 · 교대 이력', '서류 미제출·OUT 알림', '학생별 OUT·급식·기숙사·상담 열람'];
  for (const role of ['admin', 'hall_teacher', 'homeroom', 'duty_manager']) {
    const src = readFile('src/ui/home_' + role + '.html');
    const lines = src.split('\n');
    const at = (re) => lines.findIndex((l) => re.test(l));
    const a = at(/^\s*function renderStage2A\(d, root\)/);
    const h = at(/^\s*function renderHome\(d, root\)/);
    const b = at(/^\s*function renderStage2B\(d, root\)/);
    assert.ok(a >= 0 && a < h && h < b, role + ': A는 renderHome 위, B는 아래');
    assert.strictEqual((src.match(/function renderStage2[AB]\(/g) || []).length, 2, role);
    assert.ok(/^\s*renderStage2A\(d, root\);$/m.test(src) && /^\s*renderStage2B\(d, root\);$/m.test(src), role + ': renderHome에서 부른다');
    for (const t of gone) assert.ok(!src.includes(t), role + ': ' + t);
  }
});
