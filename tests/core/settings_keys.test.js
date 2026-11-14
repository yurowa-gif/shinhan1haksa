/** vocabulary.md 'settings 키'·'스크립트 속성' 표가 코드가 실제로 쓰는 이름을 모두 담는지(새 키가 표에서 빠지지 않게). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('../helpers/harness');

const ROOT = path.join(__dirname, '..', '..');
const gsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? gsFiles(path.join(dir, d.name)) : /\.gs$/.test(d.name) ? [path.join(dir, d.name)] : []);
const SRC = gsFiles(path.join(ROOT, 'src')).map((f) => ({ f: path.relative(ROOT, f), s: fs.readFileSync(f, 'utf8') }));
const VOCAB = fs.readFileSync(path.join(ROOT, 'docs/contracts/vocabulary.md'), 'utf8');

function section(title) {
  const i = VOCAB.indexOf(title);
  assert.ok(i >= 0, 'vocabulary.md에 절이 없습니다: ' + title);
  const rest = VOCAB.slice(i + title.length);
  const j = rest.search(/\n#{2,3} /);
  return j < 0 ? rest : rest.slice(0, j);
}
const listed = (text) => new Set([...text.matchAll(/`([A-Za-z_][A-Za-z0-9_.]*)`/g)].map((m) => m[1]));
const all = (re) => SRC.flatMap(({ f, s }) => [...s.matchAll(re)].map((m) => ({ f, name: m[1] })));

/** 코드가 읽거나 쓰는 settings 키 */
function settingKeys() {
  const out = [];
  const schema = SRC.find((x) => x.f === path.join('src', 'Schema.gs')).s;
  const block = schema.slice(schema.indexOf('var DEFAULT_SETTINGS'), schema.indexOf('];', schema.indexOf('var DEFAULT_SETTINGS')));
  [...block.matchAll(/\['([a-z_]+(?:\.[a-z_]+)+)'/g)].forEach((m) => out.push({ f: 'src/Schema.gs DEFAULT_SETTINGS', name: m[1] }));
  out.push(...all(/\bget\('([a-z_]+(?:\.[a-z_]+)+)'\)/g));                                   // excSettings_·sheetSettings_
  all(/\bpick\('([a-z_]+(?:\.[a-z_]+)+)'/g).forEach((x) => ['.start', '.end'].forEach((t) => out.push({ f: x.f, name: x.name + t })));   // calDefaults_
  out.push(...all(/\.key[^;\n]*===\s*'([a-z_]+(?:\.[a-z_]+)+)'/g));                         // 행을 key로 찾는 곳
  out.push(...all(/_KEY\s*=\s*'([a-z_]+(?:\.[a-z_]+)+)'/g));                                // VIO_INSTANT_KEY 등
  return out;
}

/** 코드가 쓰는 스크립트 속성 이름 */
function propNames() {
  const out = [];
  out.push(...all(/(?:get|set|delete)Property\('([A-Z][A-Z0-9_]+)'/g));
  out.push(...all(/_PROP\s*=\s*'([A-Z][A-Z0-9_]+)'/g));
  out.push(...all(/\bprop:\s*'([A-Z][A-Z0-9_]+)'/g));
  const bak = SRC.map((x) => /BAK_STATE_VALUES\s*=\s*\[([^\]]*)\]/.exec(x.s)).find(Boolean);
  if (bak) [...bak[1].matchAll(/'([A-Z0-9_]+)'/g)].forEach((m) => out.push({ f: 'BAK_STATE_VALUES', name: m[1] }));
  return out;
}

test('settings 키: 코드가 쓰는 키(DEFAULT_SETTINGS·get·pick·key 비교·_KEY 상수)가 vocabulary.md settings 키 표에 모두 있다', () => {
  const have = listed(section('## settings 키'));
  const found = settingKeys();
  assert.ok(found.length >= 20, '찾은 키가 너무 적습니다(검사식이 깨졌을 수 있음): ' + found.length);
  const missing = found.filter((x) => !have.has(x.name)).map((x) => x.name + ' (' + x.f + ')');
  assert.deepStrictEqual([...new Set(missing)], []);
});

test('스크립트 속성: 코드가 쓰는 이름(get/set/deleteProperty·_PROP 상수·DB_FILES prop·BAK_STATE_VALUES)이 vocabulary.md 표에 모두 있다', () => {
  const have = listed(section('### 스크립트 속성'));
  const found = propNames();
  assert.ok(found.length >= 10, '찾은 이름이 너무 적습니다(검사식이 깨졌을 수 있음): ' + found.length);
  const missing = found.filter((x) => !have.has(x.name)).map((x) => x.name + ' (' + x.f + ')');
  assert.deepStrictEqual([...new Set(missing)], []);
});

test('스크립트 속성 표의 백업 값 칸이 BAK_STATE_VALUES와 같다(예 = 목록에 있음)', () => {
  const bak = new Set([...SRC.map((x) => /BAK_STATE_VALUES\s*=\s*\[([^\]]*)\]/.exec(x.s)).find(Boolean)[1].matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]));
  const rows = section('### 스크립트 속성').split('\n').filter((l) => /^\| `/.test(l));
  rows.forEach((l) => {
    const cells = l.split('|').map((c) => c.trim());
    const names = [...cells[1].matchAll(/`([A-Z0-9_]+)`/g)].map((m) => m[1]);
    const yes = cells[cells.length - 2] === '예';
    names.forEach((n) => assert.strictEqual(bak.has(n), yes, n + ' 백업 값 칸'));
  });
});
