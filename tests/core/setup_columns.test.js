/**
 * S2-0b(결정 41): setup이 2단계 탭을 만들고, 옛 시트에 빠진 본문 열만 락 안에서 제자리에 끼운다([열 추가]).
 * 그 밖의 헤더 차이는 [경고]만. 위반 항목 기본값은 한 번만. 새 기간은 기간별 탭을 모두 만든다. gas-fakes, 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com';
const TAIL = ['created_at', 'created_by', 'updated_at', 'updated_by'];
// 2단계 전(1단계) 헤더
const OLD_STATUS = ['id', 'student_id', 'item', 'value', 'requested_at', 'effective_date', 'effective_date_auto', 'reason',
  'doc_submitted', 'linked_change_id', 'source', 'status', 'memo'].concat(TAIL);
const OLD_COUNSEL = ['id', 'student_id', 'date', 'teacher_email', 'type', 'content', 'show_to_parent', 'status'].concat(TAIL);

const setupReport = (env) => plain(env.asOwner((c) => c.setup())).map((x) => x.trim());
const codeHeaders = (env, kind, name) => plain(env.asOwner((c) => c.headersFor_(kind, name)));

/** setup 보고에서 그 탭의 줄(정확히 하나) */
function lineOf(report, sheet) {
  const hits = report.filter((l) => { const m = /^\[[^\]]+\] ([^\s:]+)/.exec(l.split('\n')[0]); return m && m[1] === sheet; });
  assert.strictEqual(hits.length, 1, sheet + ' 줄이 하나여야 한다: ' + JSON.stringify(report));
  return hits[0];
}

/** 시트를 옛 헤더 + 행으로 바꿔 놓는다(행 i의 각 칸 = '<열>#<i>', 일부는 빈칸) */
function writeOld(env, kind, name, header, n) {
  const rows = Array.from({ length: n }, (_, i) => Object.fromEntries(header.map((h) => [h, h === 'memo' && i === 1 ? '' : h + '#' + i])));
  const sh = env.file(kind).getSheetByName(name);
  sh.clear();
  const values = [header].concat(rows.map((o) => header.map((h) => o[h])));
  sh.getRange(1, 1, values.length, header.length).setNumberFormat('@').setValues(values);
  return rows;
}

test('setup(새 설치): duty_slots·violation_rules [탭 생성] + 위반 항목 4개 / 기간이 생기면 violations_<기간> [탭 생성] / 위반 항목은 한 번만', () => {
  const env = createGasEnv();
  const r1 = setupReport(env);
  for (const [kind, name] of [['db', 'duty_slots'], ['db', 'violation_rules'], ['db', 'status_changes'], ['counsel', 'counsel_notes']]) {
    assert.strictEqual(lineOf(r1, name), '[탭 생성] ' + name);
    assert.deepStrictEqual(plain(env.sheetValues(name, kind)[0]), codeHeaders(env, kind, name), name + ' 헤더');
  }
  assert.ok(r1.includes('[위반 항목] 기본 항목 4개 추가'), JSON.stringify(r1));
  const rules = env.rows('violation_rules');
  assert.deepStrictEqual(rules.map((r) => [r.name, r.description, r.active, r.sort_order]), [
    ['무단 지각·결석·이탈', '미인정 특이사항이 확정되면 자동', 'TRUE', '1'],
    ['휴대폰·전자기기', '', 'TRUE', '2'],
    ['자습 분위기 방해(과도한 수면, 교사 지시 불이행 포함)', '', 'TRUE', '3'],
    ['기숙사 생활 위반', '', 'TRUE', '4']
  ]);
  assert.ok(rules.every((r) => r.id && r.created_by === OWNER));

  // 탭 없이 기간 행만 생긴 상태(1단계에서 올라온 설치와 같다) → 다시 setup
  const termId = env.asOwner((c) => c.appendRecord_('terms', { name: '2027 1학기', type: '학기', start_date: '2027-03-02',
    end_date: '2027-07-20', memo: '' }, OWNER).id);
  env.asOwner((c) => c.updateRecord_('violation_rules', rules[1].id, { active: 'FALSE' }, OWNER));   // 관리자가 고친 항목
  const r2 = setupReport(env);
  for (const base of ['exceptions', 'violations']) {
    const name = base + '_' + termId.slice(0, 8);
    assert.strictEqual(lineOf(r2, name), '[탭 생성] ' + name);
    assert.deepStrictEqual(plain(env.sheetValues(name)[0]), codeHeaders(env, 'db', name), name + ' 헤더');
  }
  for (const name of ['duty_slots', 'violation_rules', 'status_changes', 'counsel_notes']) assert.strictEqual(lineOf(r2, name), '[탭 유지] ' + name);
  assert.ok(r2.includes('[위반 항목] 이미 있어 기본 항목을 넣지 않음'), JSON.stringify(r2));
  assert.deepStrictEqual(env.rows('violation_rules').map((r) => r.active), ['TRUE', 'FALSE', 'TRUE', 'TRUE'], '두 번째 setup은 항목을 건드리지 않는다');

  const r3 = setupReport(env);
  assert.ok(!r3.some((l) => /^\[(탭 생성|열 추가|경고)\]/.test(l)), JSON.stringify(r3));
});

test('setup(옛 시트): status_changes(3행)·counsel_notes(2행)에 빠진 열을 락 안에서 제자리에 끼운다 — 옛 값은 제 열 이름 아래, 새 열은 빈칸', () => {
  const env = createGasEnv();
  setupReport(env);
  const oldStatus = writeOld(env, 'db', 'status_changes', OLD_STATUS, 3);
  const oldCounsel = writeOld(env, 'counsel', 'counsel_notes', OLD_COUNSEL, 2);

  env.strictLock = true;   // 락 없이 쓰면 오류
  const r = setupReport(env);
  env.strictLock = false;
  assert.strictEqual(lineOf(r, 'status_changes'), '[열 추가] status_changes: cancel_reason');
  assert.strictEqual(lineOf(r, 'counsel_notes'), '[열 추가] counsel_notes: target, linked_violation_id, cancel_reason');

  for (const [kind, name, old, added] of [['db', 'status_changes', oldStatus, ['cancel_reason']],
    ['counsel', 'counsel_notes', oldCounsel, ['target', 'linked_violation_id', 'cancel_reason']]]) {
    assert.deepStrictEqual(plain(env.sheetValues(name, kind)[0]), codeHeaders(env, kind, name), name + ' 헤더 = 코드');
    const now = env.rows(name, kind);
    assert.strictEqual(now.length, old.length, name + ' 행 수');
    old.forEach((o, i) => {
      for (const h of Object.keys(o)) assert.strictEqual(now[i][h], o[h], name + ' ' + i + '행 ' + h);
      for (const h of added) assert.strictEqual(now[i][h], '', name + ' ' + i + '행 새 열 ' + h);
    });
    const sh = env.file(kind).getSheetByName(name);
    assert.strictEqual(sh.getRange(old.length + 1, codeHeaders(env, kind, name).length).getNumberFormat(), '@', name + ' 새 너비도 일반 텍스트');
  }
  assert.strictEqual(env.rows('status_changes')[1].memo, '', '빈칸도 제자리');

  // 끼운 열을 바로 쓸 수 있다
  env.asOwner((c) => c.updateRecord_('status_changes', oldStatus[0].id, { status: '취소', cancel_reason: '잘못 입력' }, OWNER));
  assert.strictEqual(env.rows('status_changes')[0].cancel_reason, '잘못 입력');
  assert.strictEqual(env.rows('status_changes')[0].memo, 'memo#0');

  const r2 = setupReport(env);
  assert.strictEqual(lineOf(r2, 'status_changes'), '[탭 유지] status_changes');
  assert.strictEqual(lineOf(r2, 'counsel_notes'), '[탭 유지] counsel_notes');
});

test('setup: 헤더 순서가 바뀌었거나 모르는 열·id·공통 열이 어긋나면 [경고]만 내고 시트를 고치지 않는다', () => {
  const env = createGasEnv();
  setupReport(env);
  const swap = OLD_STATUS.slice(); [swap[1], swap[2]] = [swap[2], swap[1]];
  const cases = [
    ['db', 'status_changes', '순서 바뀜', swap],
    ['db', 'status_changes', '모르는 열', OLD_STATUS.slice(0, 12).concat(['extra'], OLD_STATUS.slice(12))],
    ['db', 'status_changes', 'id 없음', OLD_STATUS.slice(1)],
    ['db', 'status_changes', '공통 열 빠짐', OLD_STATUS.slice(0, -1)],
    ['counsel', 'counsel_notes', '모르는 열(agreement)', OLD_COUNSEL.slice(0, 6).concat(['agreement'], OLD_COUNSEL.slice(6))]
  ];
  for (const [kind, name, label, header] of cases) {
    writeOld(env, kind, name, header, 2);
    const before = plain(env.sheetValues(name, kind));
    const r = setupReport(env);
    assert.ok(lineOf(r, name).startsWith('[경고] ' + name + ' 헤더가 코드와 다릅니다'), label + ': ' + lineOf(r, name));
    assert.deepStrictEqual(plain(env.sheetValues(name, kind)), before, label + ': 시트가 그대로');
  }
});

test('saveTerm: 새 기간을 만들면 exceptions_·violations_ 탭이 모두 생긴다(락 안에서, 헤더는 코드 그대로)', () => {
  const env = createGasEnv();
  env.seedFake();
  env.strictLock = true;
  const r = env.expectAllowed(OWNER, 'saveTerm', { name: '2027 2학기', type: '학기', start_date: '2027-08-16', end_date: '2028-02-28' });
  assert.strictEqual(r.ok, true);
  for (const base of ['exceptions', 'violations']) {
    const name = base + '_' + r.id.slice(0, 8);
    assert.deepStrictEqual(plain(env.sheetValues(name)[0]), codeHeaders(env, 'db', name), name);
  }
});
