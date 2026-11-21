/** C39 구글 계정 여러 개 로그인 진단: 계정을 못 찾았을 때 지금 로그인된 이메일(본인 것만)과 안내가 나온다. R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const LOST_STUDENT = 'lost.student@example.com', LOST_PARENT = 'lost.parent@example.com', STRANGER = 'stranger.person@example.com';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  env.asOwner((c) => { c.addUser(LOST_STUDENT, '가짜학생', 'student'); c.addUser(LOST_PARENT, '가짜학부모', 'parent'); });
  return env;
}
const ui = (f) => fs.readFileSync(path.join(__dirname, '../../src/ui', f + '.html'), 'utf8');

test('학생 계정인데 명단에서 못 찾으면 홈 응답에 본인 이메일(accountEmail)이 있고, 학생 정보는 없다', () => {
  const env = makeEnv();
  const d = plain(env.call(LOST_STUDENT, 'getHomeData', 'student'));
  assert.deepStrictEqual([d.me, d.accountEmail], [null, LOST_STUDENT]);
  const text = JSON.stringify(d);
  env.rows('students').forEach((s) => assert.ok(!text.includes(s.name), '다른 학생 이름 없음: ' + s.name));
});

test('연결된 자녀가 없는 학부모 계정도 본인 이메일만 받는다. 정상 계정은 자기 이메일, 교사 홈에는 없다', () => {
  const env = makeEnv();
  const p = plain(env.call(LOST_PARENT, 'getHomeData', 'parent'));
  assert.deepStrictEqual([p.children, p.accountEmail], [[], LOST_PARENT]);
  const ok = plain(env.call('test.parent@example.com', 'getHomeData', 'parent'));
  assert.strictEqual(ok.accountEmail, 'test.parent@example.com');
  assert.ok(!('accountEmail' in plain(env.call('test.admin@example.com', 'getHomeData', 'admin'))), '교사 홈에는 넣지 않는다');
});

test('시간표 화면: 명단에 없는 학생 계정은 본인 이메일을 받고(다른 정보 없음), 학부모 계정은 거부', () => {
  const env = makeEnv();
  const r = plain(env.call(LOST_STUDENT, 'getTimetableContext'));
  assert.deepStrictEqual(Object.keys(r).sort(), ['email', 'ok', 'reason']);
  assert.deepStrictEqual([r.ok, r.email], [false, LOST_STUDENT]);
  env.expectDenied(LOST_PARENT, 'timetable.mine', 'getTimetableContext');
});

test('등록되지 않은 계정의 권한 없음 화면(NoAccess)에는 본인 이메일과 계정 안내가 있다(이메일을 못 읽으면 안내만)', () => {
  const env = makeEnv();
  const out = env.as(STRANGER, (c) => c.doGet({ parameter: {} }));
  assert.strictEqual(out._vars.email, STRANGER);
  assert.ok(!out._vars.diag && !JSON.stringify(out._vars).includes('test.student'), '다른 계정 정보 없음');
  const html = ui('NoAccess');
  assert.ok(/<\? if \(email\) \{ \?>[^]*?접속한 계정[^]*?<\? \} \?>/.test(html), '이메일이 있을 때만 접속한 계정 줄');
  assert.ok(/시크릿 창[^]*학교에 알린 계정 하나로만 로그인/.test(html), '시크릿 창 안내');
});

test('화면 연결: 학생 홈·학부모 홈·시간표 학생 화면이 계정 안내(accountHelp)를 쓰고, 안내는 시크릿 창·한 계정만을 말한다', () => {
  for (const f of ['home_student', 'home_parent', 'screen_timetable']) assert.ok(/accountHelp\(/.test(ui(f)), f);
  const client = ui('Client');
  assert.ok(/function accountHelp\(email\)/.test(client) && /시크릿 창[^]*학교에 알린 계정 하나로만 로그인/.test(client));
});
