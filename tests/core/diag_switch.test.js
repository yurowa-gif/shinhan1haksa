/** 접속 진단 스위치(DIAG_ENABLED): 꺼지면(또는 없으면) 홈의 진단 링크가 사라지고, ?page=diag가 닫히고, diagPing이 거부한다. 켜면 학생·학부모 계정도 연다(0단계 진단이 그 계정으로 하는 일이다). R4 gas-fakes. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';

function state(env, who) {
  const home = env.as(who, (c) => c.doGet({ parameter: {} }));
  const page = env.as(who, (c) => c.doGet({ parameter: { page: 'diag' } }));
  let ping = 'ok';
  try { env.call(who, 'diagPing'); } catch (e) { ping = e.message; }
  return { link: home._vars.diagEnabled, page: !!(page._vars && page._vars.diag), ping };
}

test('DIAG_ENABLED 켬: 학생·학부모 모두 링크가 보이고 진단 화면·diagPing이 열린다', () => {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({});
  env.scriptProps.DIAG_ENABLED = 'true';
  for (const who of [STUDENT, PARENT]) assert.deepStrictEqual(state(env, who), { link: true, page: true, ping: 'ok' }, who);
});

test('DIAG_ENABLED 끔·없음: 링크가 없고, ?page=diag는 권한 없음 화면(진단 값 없음)이며, diagPing은 "진단이 꺼져 있습니다."로 거부한다', () => {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({});
  for (const v of ['false', null, '']) {
    if (v === null) delete env.scriptProps.DIAG_ENABLED; else env.scriptProps.DIAG_ENABLED = v;
    for (const who of [STUDENT, PARENT]) assert.deepStrictEqual(state(env, who), { link: false, page: false, ping: '진단이 꺼져 있습니다.' }, who + ' ' + v);
  }
});

test('홈 틀(Index.html)은 diagEnabled일 때만 진단 링크를 그린다', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../src/ui/Index.html'), 'utf8');
  assert.ok(/<\? if \(diagEnabled\) \{ \?>[^]*?page=diag[^]*?<\? \} \?>/.test(src), 'diagEnabled 조건 안에 링크');
  assert.strictEqual((src.match(/page=diag/g) || []).length, 1, '진단 링크는 한 곳뿐');
});
