/**
 * R4 gas-fakes 통합 테스트 도구 검사 + 0단계 공개 함수 권한 검증.
 * src 전체를 vm 하나에 올리고 setup()·seedFakeData()를 실제로 돌린다(가짜 데이터만).
 */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv, formatDate, kstToMs } = require('../helpers/gas-fakes');

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

/* ───────── 가짜 서비스 자체 ───────── */

table('formatDate: KST·UTC, 실행 시간대(TZ)와 무관, 연말·윤년', [
  ['2026-12-31T23:59:59', 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss", '2026-12-31T23:59:59'],
  ['2027-01-01T08:59:59', 'UTC', 'yyyy-MM-dd HH:mm:ss', '2026-12-31 23:59:59'],
  ['2028-02-29T00:00:00', 'Asia/Seoul', 'yyyy-MM-dd', '2028-02-29'],
  ['2027-03-01T11:30:00', 'Asia/Seoul', 'HH:mm E', '11:30 Mon'],
  ['2027-03-01T11:30:00', 'Asia/Seoul', "yyyy'년' MM'월'", '2027년 03월']
], ([kst, tz, fmt, want]) => assert.strictEqual(formatDate(new Date(kstToMs(kst)), tz, fmt), want));

test('formatDate: 모르는 시간대·패턴은 오류(조용히 틀리지 않게)', () => {
  assert.throws(() => formatDate(new Date(0), 'America/New_York', 'yyyy'));
  assert.throws(() => formatDate(new Date(0), 'Asia/Seoul', 'yyyy-MM-dd hh'));
  assert.throws(() => formatDate(new Date(NaN), 'Asia/Seoul', 'yyyy'));
});

test('시계: 인자 없는 new Date()·Date.now()가 env 시각, 인자 있는 Date는 그대로', () => {
  const env = createGasEnv({ files: ['src/Db.gs'], now: '2027-03-01T11:29:59' });
  assert.strictEqual(env.asOwner((c) => c.nowIso_()), '2027-03-01T11:29:59');
  assert.strictEqual(env.asOwner((c) => c.today_()), '2027-03-01');
  env.advance(1 / 60);
  assert.strictEqual(env.asOwner((c) => c.nowIso_()), '2027-03-01T11:30:00');
  env.setNow('2027-12-31T23:59:59');
  assert.strictEqual(env.nowIso(), '2027-12-31T23:59:59');
  const c = env.ctx;
  const vmDate = require('vm').runInContext('[new Date().getTime() === Date.now(), new Date(0).getTime(), new Date(2027, 0, 1) instanceof Date,' +
    ' Object.prototype.toString.call(new Date()), typeof Date.UTC(2027, 0, 1)]', c);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vmDate)), [true, 0, true, '[object Date]', 'number']);
});

test('Utilities.getUuid: 실행마다 같은 순서, UUID 모양', () => {
  const a = createGasEnv({ files: ['src/Db.gs'] }), b = createGasEnv({ files: ['src/Db.gs'] });
  const ua = a.asOwner((c) => [c.Utilities.getUuid(), c.Utilities.getUuid()]);
  const ub = b.asOwner((c) => [c.Utilities.getUuid(), c.Utilities.getUuid()]);
  assert.deepStrictEqual(ua, ub);
  assert.notStrictEqual(ua[0], ua[1]);
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(ua[0]), ua[0]);
});

test('CacheService: 유효 시간은 env 시계로, PropertiesService: 값은 문자열', () => {
  const env = createGasEnv({ files: ['src/Db.gs'] });
  env.asOwner((c) => c.CacheService.getScriptCache().put('k', 'v', 60));
  assert.strictEqual(env.asOwner((c) => c.CacheService.getScriptCache().get('k')), 'v');
  env.advance(1);
  assert.strictEqual(env.asOwner((c) => c.CacheService.getScriptCache().get('k')), null);
  env.asOwner((c) => c.PropertiesService.getScriptProperties().setProperty('N', 5));
  assert.strictEqual(env.scriptProps.N, '5');
  assert.strictEqual(env.asOwner((c) => c.PropertiesService.getScriptProperties().getProperty('없음')), null);
});

test('SpreadsheetApp: 범위 밖·모양이 다른 setValues는 Apps Script처럼 오류', () => {
  const env = createGasEnv({ files: ['src/Db.gs'] });
  const sh = env.asOwner((c) => c.SpreadsheetApp.create('t').getSheets()[0]);
  assert.throws(() => sh.getRange(1, 1, 1, 2).setValues([['a']]));
  assert.throws(() => sh.getRange(1001, 1));
  sh.getRange(2, 2, 1, 2).setValues([['x', 'y']]);
  assert.deepStrictEqual(sh.getDataRange().getValues(), [['', '', ''], ['', 'x', 'y']]);
  assert.deepStrictEqual([sh.getLastRow(), sh.getLastColumn()], [2, 3]);
  sh.insertRowsAfter(1000, 500);
  assert.strictEqual(sh.getMaxRows(), 1500);
  assert.throws(() => env.asOwner((c) => c.SpreadsheetApp.openById('없는-id')));
});

test('흉내 내지 않는 서비스는 [gas-fakes] 오류', () => {
  const env = createGasEnv({ files: ['src/Db.gs'] });
  assert.throws(() => env.asOwner((c) => c.DriveApp.getFileById('x')), /gas-fakes/);
  assert.throws(() => env.asOwner((c) => c.Utilities.newBlob('x')), /gas-fakes/);
});

test('실행마다 _로 시작하는 전역(_dbMemo·_authMemo·_lockDepth)을 처음 값으로 되돌린다', () => {
  const env = createGasEnv();
  env.seedFake();
  env.as('fake.teacher1@example.com', (c) => c.getCurrentUser_());
  assert.strictEqual(env.ctx._authMemo.user.email, 'fake.teacher1@example.com');
  env.as('test.parent@example.com', (c) => { assert.strictEqual(c._authMemo.user, undefined); c.getCurrentUser_(); });
  assert.strictEqual(env.ctx._authMemo.user.email, 'test.parent@example.com');
  assert.strictEqual(env.ctx._lockDepth, 0);
});

/* ───────── setup·가짜 데이터 ───────── */

test('setup(): 파일 3개·탭·관리자 등록, 다시 실행하면 [유지]/[탭 유지]', () => {
  const env = createGasEnv();
  const r1 = env.asOwner((c) => c.setup());
  assert.strictEqual(Object.keys(env.spreadsheets).length, 3);
  assert.ok(r1.some((l) => l.indexOf('[생성]') === 0));
  assert.deepStrictEqual(env.rows('users').map((u) => [u.email, u.roles]), [['owner@example.com', 'admin,hall_teacher']]);
  assert.ok(env.rows('settings', 'config').length > 0);
  assert.ok(env.rows('blocks').length > 0);
  assert.strictEqual(env.file('db').getSheetByName('Sheet1'), null, '기본 시트는 지운다');
  const r2 = env.asOwner((c) => c.setup());
  assert.strictEqual(Object.keys(env.spreadsheets).length, 3);
  assert.ok(r2.every((l) => l.indexOf('[생성]') < 0 && l.indexOf('[탭 생성]') < 0), r2.join('\n'));
  assert.strictEqual(env.rows('users').length, 1);
});

test('setup(): 소유자가 아니면(웹앱 접속자) 거부', () => {
  const env = createGasEnv();
  assert.throws(() => env.as('someone@example.com', (c) => c.setup()), /소유자/);
  assert.strictEqual(Object.keys(env.spreadsheets).length, 0);
});

test('seedFake(): 가짜 30명·기간 2개·시험 계정, 저장 값은 모두 문자열', () => {
  const env = createGasEnv();
  env.seedFake({ stage1: true });
  assert.strictEqual(env.rows('students').length, 30);
  assert.strictEqual(env.rows('terms').length, 2);
  const emails = env.rows('users').map((u) => u.email);
  for (const e of ['test.student@example.com', 'test.parent@example.com', 'test.teacher@example.com', 'test.homeroom@example.com']) {
    assert.ok(emails.includes(e), e);
  }
  for (const name of ['students', 'enrollments', 'users']) {
    for (const row of env.sheetValues(name)) for (const v of row) assert.strictEqual(typeof v, 'string', name);
  }
  assert.ok(env.rows('students').every((s) => /@example\.com$/.test(s.email)), '가짜 이메일만');
});

/* ───────── 0단계 권한(R4 완료 기준) ───────── */

function seeded() {
  const env = createGasEnv();
  env.seedFake();
  const students = env.rows('students');
  const links = env.rows('guardian_links').filter((g) => g.parent_email === 'test.parent@example.com').map((g) => g.student_id);
  return { env, students, myChild: students.find((s) => links.includes(s.id)), other: students.find((s) => !links.includes(s.id)) };
}

test('학부모가 남의 학생으로 getStudentSummary → 거부 + audit_log에 denied:student.view', () => {
  const { env, myChild, other } = seeded();
  assert.ok(myChild && other);
  const before = env.auditActions('denied').length;
  const e = env.errorOf('test.parent@example.com', (c) => c.getStudentSummary(other.id));
  assert.ok(e && e.message === '권한이 없습니다.', e && e.message);
  const denied = env.rows('audit_log').filter((r) => r.action === 'denied:student.view');
  assert.strictEqual(env.auditActions('denied').length, before + 1);
  assert.strictEqual(denied[0].created_by, 'test.parent@example.com');
  assert.ok(denied[0].detail.indexOf(other.id) >= 0, '어떤 학생을 시도했는지 남긴다');
  // 자기 자녀는 허용, 돌려주는 값에 이메일이 없다
  const ok = env.as('test.parent@example.com', (c) => c.getStudentSummary(myChild.id));
  assert.strictEqual(ok.id, myChild.id);
  assert.ok(JSON.stringify(ok).indexOf('@') < 0);
});

test("학생이 getHomeData('admin') → 거부 + denied:home.view, 자기 홈은 허용", () => {
  const { env } = seeded();
  const e = env.errorOf('test.student@example.com', (c) => c.getHomeData('admin'));
  assert.ok(e && /권한/.test(e.message));
  assert.ok(env.auditActions('denied:home.view').length >= 1);
  const home = env.as('test.student@example.com', (c) => c.getHomeData('student'));
  assert.strictEqual(home.role, 'student');
  assert.ok(home.me && home.me.name);
});

table('공개 함수 권한 표(허용·거부)', [
  // [접속자, 함수 호출, 허용?]
  ['owner@example.com', (c) => c.getHomeData('admin'), true],
  ['fake.teacher1@example.com', (c) => c.getHomeData('admin'), false],
  ['fake.teacher1@example.com', (c) => c.getHomeData('hall_teacher'), true],
  ['fake.teacher3@example.com', (c) => c.getHomeData('attendance'), true],
  ['test.parent@example.com', (c) => c.getHomeData('parent'), true],
  ['test.parent@example.com', (c) => c.getHomeData('student'), false],
  ['unknown@example.com', (c) => c.getHomeData('student'), false],
  ['', (c) => c.getHomeData('student'), false],
  ['owner@example.com', (c) => c.listTerms(), true],
  ['test.student@example.com', (c) => c.listTerms(), false],
  ['fake.teacher1@example.com', (c) => c.saveTerm({ name: '시험', type: '학기', start_date: '2027-08-16', end_date: '2028-02-28' }), false],
  ['test.parent@example.com', (c) => c.getScheduleData('2027-03'), false],
  ['fake.teacher1@example.com', (c) => c.getScheduleData('2027-03'), true]
], ([who, call, allowed]) => {
  const { env } = seeded();
  const e = env.errorOf(who, call);
  if (allowed) assert.strictEqual(e, null, e && e.stack);
  else {
    assert.ok(e && /권한/.test(e.message), e ? e.message : '허용됨');
    assert.ok(env.auditActions('denied:').length >= 1, '거부 기록');
  }
});

test('거부 기록은 같은 계정·같은 기능이면 10분에 한 번(env 시계로 확인)', () => {
  const { env, other } = seeded();
  const n = () => env.auditActions('denied:student.view').length;
  env.errorOf('test.parent@example.com', (c) => c.getStudentSummary(other.id));
  env.errorOf('test.parent@example.com', (c) => c.getStudentSummary(other.id));
  assert.strictEqual(n(), 1);
  env.advance(9);
  env.errorOf('test.parent@example.com', (c) => c.getStudentSummary(other.id));
  assert.strictEqual(n(), 1);
  env.advance(2);
  env.errorOf('test.parent@example.com', (c) => c.getStudentSummary(other.id));
  assert.strictEqual(n(), 2);
});

test('락을 얻지 못하면 저장은 "다른 사람이 저장 중" 오류, 거부 기록은 넘어가도 거부는 그대로', () => {
  const { env, other } = seeded();
  env.lock.failNext = 1;
  const e = env.errorOf('owner@example.com', (c) => c.saveTerm({ name: '2027 2학기', type: '학기', start_date: '2027-08-16', end_date: '2028-02-28' }));
  assert.ok(e && /저장 중/.test(e.message), e && e.message);
  env.lock.failNext = 1;
  const before = env.auditActions('denied').length;
  const d = env.errorOf('test.parent@example.com', (c) => c.getStudentSummary(other.id));
  assert.ok(d && /권한/.test(d.message));
  assert.strictEqual(env.auditActions('denied').length, before, '락이 없으면 거부 기록은 생략');
});

test('쓰기는 audit_log에 전후 값과 기록자를 남긴다(saveTerm)', () => {
  const { env } = seeded();
  env.setNow('2027-03-05T09:10:00');
  const r = env.as('owner@example.com', (c) => c.saveTerm({ name: '2027 2학기', type: '학기', start_date: '2027-08-16', end_date: '2028-02-28' }));
  assert.ok(r);
  const t = env.rows('terms').find((x) => x.name === '2027 2학기');
  assert.ok(t);
  assert.deepStrictEqual([t.created_at, t.created_by], ['2027-03-05T09:10:00', 'owner@example.com']);
  const a = env.rows('audit_log').filter((x) => x.row_id === t.id);
  assert.ok(a.some((x) => x.action === 'create' && x.created_by === 'owner@example.com'));
});
