/** O1 매일 백업: R4 gas-fakes(DriveApp·ScriptApp 최소 흉내). 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@fakeschool.invalid';   // 메일이 걸러지지 않는 가짜 주소
const NAME_RE = /^백업 (\d{4}-\d{2}-\d{2})/;

function makeEnv(opts) {
  const env = createGasEnv({ owner: OWNER, now: '2027-03-03T02:10:00' });
  env.seedFake();
  if (!opts || opts.mail !== false) env.scriptProps.MAIL_ENABLED = 'true';
  return env;
}
const folderId = (env) => env.scriptProps.BACKUP_FOLDER_ID;
const names = (env) => env.drive.filesIn(folderId(env)).filter((f) => !f.trashed).map((f) => f.name).sort();
const run = (env) => plain(env.asOwner((c) => c.runBackupNow()));

test('runBackupNow: 데이터 파일 3개 복사 + 상태 JSON, 폴더 ID 저장, 공유 없음, audit backup:ok', () => {
  const env = makeEnv();
  const r = run(env);
  assert.strictEqual(r.copies.length, 3);
  const n = names(env);
  assert.strictEqual(n.length, 4);
  ['신한1학사_운영DB', '신한1학사_상담일지', '신한1학사_설정'].forEach((t) => assert.ok(n.includes('백업 2027-03-03 ' + t), t));
  assert.ok(n.includes('백업 2027-03-03 앱상태.json'));
  env.drive.filesIn(folderId(env)).forEach((f) => { assert.strictEqual(f.sharing, 'PRIVATE'); assert.deepStrictEqual(f.viewers.concat(f.editors), []); });
  assert.strictEqual(env.drive.folders[folderId(env)].sharing, 'PRIVATE');
  assert.deepStrictEqual(env.auditActions('backup:'), ['backup:ok']);
  // 두 번째 실행은 같은 폴더를 쓰고, 같은 날 이름이 겹치지 않는다
  run(env);
  assert.strictEqual(Object.keys(env.drive.folders).length, 1);
  assert.strictEqual(names(env).length, 8);
  assert.strictEqual(new Set(names(env)).size, 8);
  run(env);
  assert.strictEqual(new Set(names(env)).size, 12);
});

test('상태 JSON: 허용 목록 값만, 파일·폴더 ID와 시험 이메일은 이름만', () => {
  const env = makeEnv();
  env.scriptProps.AUTO_OUT_SINCE = JSON.stringify({ types: ['x'], since: { x: '2027-03-01T00:00:00' } });
  env.scriptProps.TEST_TEACHER_EMAIL = 'secret.person@fakeschool.invalid';
  run(env);
  const f = env.drive.filesIn(folderId(env)).find((x) => /앱상태\.json$/.test(x.name));
  const j = JSON.parse(f.content);
  assert.strictEqual(j.values.MAIL_ENABLED, 'true');
  assert.ok(j.values.AUTO_OUT_SINCE.indexOf('2027-03-01') > 0);
  ['DB_ID', 'COUNSEL_ID', 'CONFIG_ID', 'BACKUP_FOLDER_ID', 'TEST_TEACHER_EMAIL'].forEach((k) => assert.ok(j.이름만.includes(k), k));
  const text = f.content;
  ['DB_ID', 'COUNSEL_ID', 'CONFIG_ID'].forEach((k) => assert.ok(text.indexOf(env.scriptProps[k]) < 0, k + ' 값이 새어 나감'));
  assert.ok(text.indexOf(folderId(env)) < 0);
  assert.ok(text.indexOf('secret.person') < 0);
});

test('31일 된 우리 백업만 휴지통, 30일·다른 이름·폴더 밖 파일은 그대로', () => {
  const env = makeEnv();
  run(env);   // 폴더 만들기
  const fid = folderId(env);
  const old = env.drive.addFile('백업 2027-01-31 신한1학사_운영DB', { parent: fid });   // 31일 전
  const oldState = env.drive.addFile('백업 2027-01-31 #2 앱상태.json', { parent: fid });
  const edge = env.drive.addFile('백업 2027-02-01 신한1학사_운영DB', { parent: fid });   // 30일 전
  const other = env.drive.addFile('내 메모 2020-01-01', { parent: fid });
  const memo = env.drive.addFile('백업 2020-01-01 수동 메모', { parent: fid });   // 날짜 규칙은 맞지만 우리 파일 제목이 아님
  const outside = env.drive.addFile('백업 2020-01-01 바깥 파일', {});
  const r = run(env);
  assert.strictEqual(r.trashed, 2);
  assert.strictEqual(env.drive.files[old.getId()].trashed, true);
  assert.strictEqual(env.drive.files[oldState.getId()].trashed, true);
  [edge, other, memo, outside].forEach((f) => assert.strictEqual(env.drive.files[f.getId()].trashed, false, f.getName()));
});

test('installNightlyBackup: 두 번 불러도 트리거는 하나(02시, 매일, nightlyBackup)', () => {
  const env = makeEnv();
  const a = plain(env.asOwner((c) => c.installNightlyBackup()));
  const b = plain(env.asOwner((c) => c.installNightlyBackup()));
  assert.strictEqual(a.installed, true);
  assert.strictEqual(b.installed, false);
  assert.strictEqual(env.triggers.length, 1);
  assert.deepStrictEqual({ fn: env.triggers[0].fn, hour: env.triggers[0].hour, every: env.triggers[0].everyDays }, { fn: 'nightlyBackup', hour: 2, every: 1 });
});

test('트리거가 부르는 nightlyBackup도 같은 일을 한다(소유자 실행), 소유자가 아니면 거부', () => {
  const env = makeEnv();
  env.asOwner((c) => c.nightlyBackup());
  assert.strictEqual(names(env).length, 4);
  assert.deepStrictEqual(env.auditActions('backup:'), ['backup:ok']);
});

test('소유자가 아니면 거부: 두 함수 모두, 복사·트리거·audit 변화 없음. 화면 호출 경로(call)도 거부', () => {
  const env = makeEnv();
  ['runBackupNow', 'installNightlyBackup', 'nightlyBackup'].forEach((fn) => {
    const e = env.errorOf('test.admin@example.com', (c) => c[fn]());
    assert.ok(e && /소유자/.test(e.message), fn);
    assert.throws(() => env.call('test.admin@example.com', fn), /소유자/);
  });
  assert.strictEqual(Object.keys(env.drive.folders).length, 0);
  assert.strictEqual(env.triggers.length, 0);
  assert.strictEqual(env.scriptProps.BACKUP_FOLDER_ID, undefined);
});

test('복사 하나가 실패하면 backup:failed(audit·소유자 메일), 나머지는 복사하고 오래된 사본은 치우지 않는다', () => {
  const env = makeEnv();
  run(env);
  const old = env.drive.addFile('백업 2020-01-01 신한1학사_운영DB', { parent: folderId(env) });
  env.drive.failCopy = '상담일지';
  const e = env.errorOf(OWNER, (c) => c.runBackupNow());
  assert.ok(e && /상담일지/.test(e.message));
  assert.deepStrictEqual(env.auditActions('backup:'), ['backup:ok', 'backup:failed']);
  assert.strictEqual(env.drive.files[old.getId()].trashed, false);
  assert.strictEqual(env.mail.length, 1);
  assert.strictEqual(env.mail[0][0], OWNER);
  assert.ok(/백업 실패/.test(env.mail[0][1]));
  // 메일 꺼짐이면 보내지 않는다
  const env2 = makeEnv({ mail: false });
  env2.drive.failCopy = '운영DB';
  assert.ok(env2.errorOf(OWNER, (c) => c.runBackupNow()));
  assert.strictEqual(env2.mail.length, 0);
  assert.deepStrictEqual(env2.auditActions('backup:'), ['backup:failed']);
});

test('실패 메일은 락 밖에서 나가고 메일에 데이터 파일 ID가 없다', () => {
  const env = makeEnv();
  env.drive.failCopy = '설정';
  const held = [];
  env.errorOf(OWNER, (c) => { const orig = c.MailApp.sendEmail; c.MailApp.sendEmail = function () { held.push(c.LockService.getScriptLock().hasLock()); return orig.apply(null, arguments); }; return c.runBackupNow(); });
  assert.deepStrictEqual(held, [false]);
  assert.ok(env.mail[0][2].indexOf(env.scriptProps.DB_ID) < 0);
});

test('링크 공유로 생긴 사본·상태 파일은 닫고 통과(상태 JSON도 확인 대상)', () => {
  const env = makeEnv();
  env.drive.copySharing = 'ANYONE_WITH_LINK';
  run(env);
  const fs = env.drive.filesIn(folderId(env));
  assert.strictEqual(fs.length, 4);
  fs.forEach((f) => assert.strictEqual(f.sharing, 'PRIVATE', f.name));
});

test('이름으로 공유된 사람은 setSharing이 못 지운다 → 사람마다 빼서 통과(사본 3개·상태 JSON 모두)', () => {
  const env = makeEnv();
  env.drive.copyViewers = ['someone@fakeschool.invalid'];   // 링크는 비공개, 사람만 열려 있음
  run(env);
  env.drive.filesIn(folderId(env)).forEach((f) => assert.deepStrictEqual(f.viewers.concat(f.editors), [], f.name));
  assert.strictEqual(names(env).length, 4);
});

test('사람을 못 지우면 그 사본을 휴지통으로 보내고 실패(audit·메일), 열린 사본이 남지 않는다', () => {
  const env = makeEnv();
  env.drive.copyViewers = ['someone@fakeschool.invalid'];
  env.drive.stuckViewers = true;
  const e = env.errorOf(OWNER, (c) => c.runBackupNow());
  assert.ok(e && /닫지 못해 휴지통/.test(e.message));
  assert.deepStrictEqual(env.auditActions('backup:'), ['backup:failed']);
  assert.strictEqual(env.mail.length, 1);
  env.drive.filesIn(folderId(env)).filter((f) => f.viewers.length).forEach((f) => assert.strictEqual(f.trashed, true, f.name));
});

test('상태 JSON만 열려 있어도(사본 3개는 닫힘) 공유 확인이 상태 파일에도 걸린다', () => {
  const env = makeEnv();
  env.drive.copySharing = 'PRIVATE';
  env.drive.copyViewers = [];
  run(env);   // 폴더를 먼저 만든다
  // 상태 파일을 만들 때만 공유되게: createFile을 바꿔 끼운다
  const e = env.errorOf(OWNER, (c) => {
    const orig = c.DriveApp.getFolderById;
    c.DriveApp.getFolderById = (id) => { const fo = orig(id); const cf = fo.createFile; fo.createFile = (n, t, m) => { const f = cf(n, t, m); f._f.viewers = ['x@fakeschool.invalid']; env.drive.stuckViewers = true; return f; }; return fo; };
    return c.runBackupNow();
  });
  assert.ok(e && /닫지 못해/.test(e.message));
  const st = env.drive.filesIn(folderId(env)).filter((f) => /#2 앱상태\.json$/.test(f.name));
  assert.strictEqual(st.length, 1);
  assert.strictEqual(st[0].trashed, true);
});

test('같은 때 두 번 돌지 않는다: 실행 표시가 있으면 거부(audit 없음), 30분 지난 표시는 무시, 끝나면 표시가 지워진다', () => {
  const env = makeEnv();
  env.scriptProps.BACKUP_RUNNING = String(env._nowMs - 60000);   // 1분 전에 시작된 것으로 보이는 표시
  const e = env.errorOf(OWNER, (c) => c.runBackupNow());
  assert.ok(e && /다른 백업이 실행 중/.test(e.message));
  assert.deepStrictEqual(env.auditActions('backup:'), []);
  assert.strictEqual(Object.keys(env.drive.folders).length, 0);
  env.scriptProps.BACKUP_RUNNING = String(env._nowMs - 31 * 60000);
  run(env);
  assert.strictEqual(env.scriptProps.BACKUP_RUNNING, undefined);
  // 실패해도 표시를 지운다
  env.drive.failCopy = '설정';
  env.errorOf(OWNER, (c) => c.runBackupNow());
  assert.strictEqual(env.scriptProps.BACKUP_RUNNING, undefined);
});

test('백업 폴더에 이름으로 공유된 사람이 있으면 복사하기 전에 멈춘다(사본이 만들어지지 않음)', () => {
  const env = makeEnv();
  run(env);
  const n = env.drive.filesIn(folderId(env)).length;
  env.drive.folders[folderId(env)].viewers = ['someone@fakeschool.invalid'];
  const e = env.errorOf(OWNER, (c) => c.runBackupNow());
  assert.ok(e && /공유/.test(e.message));
  assert.strictEqual(env.drive.filesIn(folderId(env)).length, n);
});

test('백업 폴더가 공유·휴지통·없음이면 새로 만들지 않고 실패', () => {
  const env = makeEnv();
  run(env);
  env.drive.folders[folderId(env)].sharing = 'ANYONE_WITH_LINK';
  assert.ok(/공유/.test(env.errorOf(OWNER, (c) => c.runBackupNow()).message));
  env.drive.folders[folderId(env)].sharing = 'PRIVATE';
  env.drive.folders[folderId(env)].trashed = true;
  assert.ok(/휴지통/.test(env.errorOf(OWNER, (c) => c.runBackupNow()).message));
  env.scriptProps.BACKUP_FOLDER_ID = 'nope';
  assert.ok(/백업 폴더를 열 수 없습니다/.test(env.errorOf(OWNER, (c) => c.runBackupNow()).message));
  assert.strictEqual(Object.keys(env.drive.folders).length, 1);
});
