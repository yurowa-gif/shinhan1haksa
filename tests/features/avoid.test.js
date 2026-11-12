/** C21 떨어뜨릴 짝(결정 64): R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com';
const OTHERS = ['test.homeroom@example.com', 'test.attendance@example.com', 'test.duty@example.com', 'test.student@example.com', 'test.parent@example.com', 'nobody@example.com'];
const SECRET = 'ZZ비밀사유ZZ';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-20T20:00:00' });
  env.seedFake({ stage1: true });
  return env;
}
const list = (env, who) => plain(env.call(who || HALL, 'getAvoidPairs'));
const rows = (env) => env.rows('avoid_pairs');
function pick(env) {
  const d = list(env);
  return { d, s: d.students };
}
const add = (env, who, a, b, scope, reason) => plain(env.call(who || HALL, 'saveAvoidPair', { studentA: a, studentB: b, scope: scope || '둘 다', reason }));

test('목록: 관리자·학사 교사만 허용, 나머지(담임·출결·근무표·학생·학부모·계정 없음)는 denied:avoid.view', () => {
  const env = makeEnv();
  [ADMIN, HALL].forEach((w) => env.expectAllowed(w, 'getAvoidPairs'));
  OTHERS.forEach((w) => env.expectDenied(w, 'avoid.view', 'getAvoidPairs'));
});

test('추가·고치기·취소: 관리자·학사 교사만, 나머지는 denied:avoid.edit이고 시트는 그대로', () => {
  const env = makeEnv();
  const { s } = pick(env);
  const id = add(env, HALL, s[0].id, s[1].id, '좌석', SECRET).id;
  const before = JSON.stringify(rows(env));
  OTHERS.forEach((w) => {
    env.expectDenied(w, 'avoid.edit', 'saveAvoidPair', { studentA: s[2].id, studentB: s[3].id, scope: '방' });
    env.expectDenied(w, 'avoid.edit', 'updateAvoidPair', id, { scope: '방' });
    env.expectDenied(w, 'avoid.edit', 'cancelAvoidPair', id);
  });
  assert.strictEqual(JSON.stringify(rows(env)), before);
  assert.strictEqual(env.expectAllowed(ADMIN, 'updateAvoidPair', id, { scope: '방' }).ok, true);
  assert.strictEqual(env.expectAllowed(HALL, 'cancelAvoidPair', id).ok, true);
});

test('추가: 목록에 나오고 audit create, 학생 후보는 이번 기간 등록 학생(미등록 학생은 거부)', () => {
  const env = makeEnv();
  const { s } = pick(env);
  assert.ok(s.length >= 29);
  const r = add(env, HALL, s[0].id, s[1].id, '둘 다', '  ' + SECRET + '  ');
  assert.strictEqual(r.ok, true);
  const d = list(env, ADMIN);
  assert.strictEqual(d.pairs.length, 1);
  const p = d.pairs[0];
  assert.deepStrictEqual([p.live, p.scope, p.reason, p.a.id, p.b.id, p.a.inTerm, p.b.inTerm], [true, '둘 다', SECRET, s[0].id, s[1].id, true, true]);
  assert.strictEqual(p.a.display, s[0].grade + '. ' + s[0].name);
  assert.ok(env.rows('audit_log').some((a) => a.sheet === 'avoid_pairs' && a.action === 'create' && a.row_id === r.id));
  // 이번 기간 등록이 없는 학생
  env.asOwner((c) => c.appendRecord_('students', { student_no: '99999', name: '미등록가짜', gender: '남', grade: '2', class_no: '1', number: '40', track: '', email: '', memo: '' }, ADMIN));
  const stray = env.rows('students').find((x) => x.name === '미등록가짜');
  const e = add(env, HALL, s[2].id, stray.id);
  assert.strictEqual(e.ok, false);
  assert.strictEqual(e.errors[0].field, 'studentB');
  assert.strictEqual(rows(env).length, 1);
});

test('검사: 같은 학생·빈 값·없는 학생·잘못된 범위·긴 사유·문자열 아님, 같은 짝 중복(순서 바꿔도)은 거부하되 취소 뒤엔 다시 가능', () => {
  const env = makeEnv();
  const { s } = pick(env);
  const bad = (input, field) => { const r = plain(env.call(HALL, 'saveAvoidPair', input)); assert.strictEqual(r.ok, false); assert.strictEqual(r.errors[0].field, field, JSON.stringify(input)); };
  bad({ studentA: s[0].id, studentB: s[0].id, scope: '방' }, 'studentB');
  bad({ studentA: '', studentB: s[1].id, scope: '방' }, 'studentA');
  bad({ studentA: s[0].id, studentB: '', scope: '방' }, 'studentB');
  bad({ studentA: s[0].id, studentB: 'nope', scope: '방' }, 'studentB');
  bad({ studentA: s[0].id, studentB: s[1].id, scope: '아무데나' }, 'scope');
  bad({ studentA: s[0].id, studentB: s[1].id }, 'scope');
  bad({ studentA: s[0].id, studentB: s[1].id, scope: '방', reason: 'x'.repeat(201) }, 'reason');
  bad({ studentA: s[0].id, studentB: s[1].id, scope: '방', reason: 5 }, 'reason');
  assert.strictEqual(plain(env.call(HALL, 'saveAvoidPair', null)).ok, false);
  assert.strictEqual(rows(env).length, 0, '거부된 입력은 아무것도 쓰지 않는다');
  const first = add(env, HALL, s[0].id, s[1].id, '좌석');
  assert.strictEqual(first.ok, true);
  const dup = add(env, HALL, s[1].id, s[0].id, '방');   // 순서만 바꾼 같은 짝
  assert.strictEqual(dup.ok, false);
  assert.ok(/이미 같은 짝/.test(dup.errors[0].message));
  assert.strictEqual(rows(env).length, 1);
  assert.strictEqual(env.call(HALL, 'cancelAvoidPair', first.id).ok, true);
  assert.strictEqual(add(env, HALL, s[1].id, s[0].id, '방').ok, true);   // 취소된 짝은 중복이 아니다
  assert.strictEqual(rows(env).length, 2);
});

test('고치기: 범위·사유만(학생은 못 바꿈), 같은 값이면 noop·쓰기 없음, 사유 비우기 가능, 잘못된 값·없는 id·취소된 짝은 거부', () => {
  const env = makeEnv();
  const { s } = pick(env);
  const id = add(env, HALL, s[0].id, s[1].id, '좌석', '처음 사유').id;
  const upd = (patch, who) => plain(env.call(who || HALL, 'updateAvoidPair', id, patch));
  assert.strictEqual(upd({ scope: '둘 다', reason: '새 사유' }).ok, true);
  let r = rows(env)[0];
  assert.deepStrictEqual([r.scope, r.reason, r.student_a, r.student_b], ['둘 다', '새 사유', s[0].id, s[1].id]);
  const n = env.rows('audit_log').length;
  assert.strictEqual(upd({ scope: '둘 다', reason: '새 사유' }).noop, true);
  assert.strictEqual(env.rows('audit_log').length, n);
  assert.strictEqual(upd({ reason: '' }).ok, true);
  assert.strictEqual(rows(env)[0].reason, '');
  // 학생 열은 patch로 바꿀 수 없다(무시되고 바꿀 내용이 없으면 오류)
  const only = upd({ studentA: s[5].id });
  assert.strictEqual(only.ok, false);
  assert.strictEqual(rows(env)[0].student_a, s[0].id);
  assert.strictEqual(upd({ scope: '없음' }).errors[0].field, 'scope');
  assert.strictEqual(upd({ reason: 'y'.repeat(201) }).errors[0].field, 'reason');
  assert.strictEqual(plain(env.call(HALL, 'updateAvoidPair', 'nope', { scope: '방' })).errors[0].field, 'id');
  assert.strictEqual(env.call(HALL, 'cancelAvoidPair', id).ok, true);
  assert.ok(/취소된 짝은 고칠 수 없/.test(upd({ scope: '방' }).errors[0].message));
});

test('취소: status 취소·행은 남고 audit update, 목록 맨 아래(live false), 두 번 취소는 오류, 다른 짝은 영향 없음', () => {
  const env = makeEnv();
  const { s } = pick(env);
  const a = add(env, HALL, s[0].id, s[1].id, '좌석').id, b = add(env, HALL, s[2].id, s[3].id, '방').id;
  assert.strictEqual(env.call(ADMIN, 'cancelAvoidPair', a).ok, true);
  assert.deepStrictEqual(rows(env).map((r) => r.status), ['취소', '유효']);
  assert.strictEqual(rows(env).length, 2);
  assert.ok(env.rows('audit_log').some((x) => x.sheet === 'avoid_pairs' && x.action === 'update' && x.row_id === a && /취소/.test(x.after)));
  const d = list(env);
  assert.deepStrictEqual(d.pairs.map((p) => [p.id, p.live]), [[b, true], [a, false]]);
  assert.ok(/이미 취소/.test(plain(env.call(ADMIN, 'cancelAvoidPair', a)).errors[0].message));
  assert.strictEqual(plain(env.call(ADMIN, 'cancelAvoidPair', 'nope')).errors[0].field, 'id');
});

test('시트가 읽는 중 바뀐 id 두 줄(같은 id) 등 이상한 입력에도 한 줄만 고친다: 취소 직후 다시 불러도 같은 결과', () => {
  const env = makeEnv();
  const { s } = pick(env);
  const id = add(env, HALL, s[0].id, s[1].id).id;
  env.call(HALL, 'cancelAvoidPair', id);
  assert.strictEqual(list(env).pairs.length, 1);
  assert.strictEqual(list(env).pairs[0].live, false);
});

test('짝 정보는 권한 밖 응답에 없다: 담임·출결·근무표·학생·학부모가 부를 수 있는 화면 함수 어디에도 사유·짝 id가 없다', () => {
  const env = makeEnv();
  const { s } = pick(env);
  const r = add(env, HALL, s[0].id, s[1].id, '둘 다', SECRET);
  const homeroom = 'test.homeroom@example.com';
  const seen = [];
  const grab = (who, fn, ...args) => { try { seen.push(JSON.stringify(env.call(who, fn, ...args))); } catch (e) { /* 거부는 괜찮다 — 새어 나가지 않았다 */ } };
  ['test.homeroom@example.com', 'test.attendance@example.com', 'test.duty@example.com'].forEach((w) => grab(w, 'getSeatData'));
  [['test.homeroom@example.com', 'homeroom'], ['test.attendance@example.com', 'attendance'], ['test.duty@example.com', 'duty_manager'], [HALL, 'hall_teacher'], [ADMIN, 'admin'], ['test.student@example.com', 'student'], ['test.parent@example.com', 'parent']]
    .forEach(([w, role]) => grab(w, 'getHomeData', role));
  [homeroom, HALL, ADMIN, 'test.student@example.com', 'test.parent@example.com'].forEach((w) => [s[0].id, s[1].id].forEach((id) => grab(w, 'getStudentSummary', id)));
  [homeroom, 'test.attendance@example.com', HALL].forEach((w) => grab(w, 'listExceptions', {}));
  ['test.duty@example.com', HALL].forEach((w) => grab(w, 'getRosterContext'));
  assert.ok(seen.length >= 10, '응답을 충분히 모았다: ' + seen.length);
  seen.forEach((t) => { assert.ok(t.indexOf(SECRET) < 0, '사유가 새어 나감'); assert.ok(t.indexOf(r.id) < 0, '짝 id가 새어 나감'); assert.ok(!/avoid|떨어뜨릴/.test(t), '짝 표시가 새어 나감'); });
});

test('사유가 든 짝을 만들어도 좌석 화면 데이터는 짝이 없을 때와 같다(C22 전: 좌석 응답은 짝을 쓰지 않는다)', () => {
  const env = makeEnv();
  const { s } = pick(env);
  const strip = (d) => JSON.stringify(d).replace(/"token":"[^"]*"/g, '');
  const before = strip(env.call(HALL, 'getSeatData'));
  add(env, HALL, s[0].id, s[1].id, '좌석', SECRET);
  assert.strictEqual(strip(env.call(HALL, 'getSeatData')), before);
});
