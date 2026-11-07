/**
 * 배포 안전 검사(소유: 총괄). src 전체를 읽어 규칙 위반을 찾는다.
 * 공개 함수 허용 목록과 첫 줄 권한 검사 표는 tests/public-api.json + tests/public-api.d/*.json(세션별, 합쳐 읽는다).
 */
const assert = require('assert');
const vm = require('vm');
const { test, listFiles, readFile } = require('../helpers/harness');
const checks = require('../helpers/source-checks');

/** [[파일, JSON]…]의 functions를 합친다. 같은 이름이 두 파일에 있으면 dups에 남긴다(먼저 읽은 것을 쓴다) */
function mergePublicApi(sources) {
  const functions = {};
  const from = {};
  const dups = [];
  for (const [file, json] of sources) {
    if (!json || typeof json.functions !== 'object' || json.functions === null) throw new Error(file + ': "functions" 객체가 없습니다');
    for (const [name, spec] of Object.entries(json.functions)) {
      if (from[name]) dups.push(name + ' ← ' + from[name] + ', ' + file);
      else { functions[name] = spec; from[name] = file; }
    }
  }
  return { functions, dups };
}

const API_FILES = ['tests/public-api.json'].concat(listFiles('tests/public-api.d', ['.json']));
const API = mergePublicApi(API_FILES.map((f) => [f, JSON.parse(readFile(f))]));
const PUBLIC_API = API.functions;

const SRC_FILES = listFiles('src', ['.gs']);
const srcMap = {};
for (const f of SRC_FILES) srcMap[f] = readFile(f);

const fmt = (list) => list.map((x) => x.token + ' (' + x.line + '번 줄)').join(', ');

/* ───────── 기존 검사(0단계) ───────── */

test('각 .gs 파일의 전역 코드가 다른 파일 없이도 실행된다(파일 로드 순서 무관)', () => {
  for (const f of SRC_FILES) {
    const solo = vm.createContext({ console });
    vm.runInContext(srcMap[f], solo, { filename: f });
  }
});

test('공개 함수(이름 끝 _ 없음)는 허용 목록에 있는 것만', () => {
  for (const f of SRC_FILES) {
    for (const m of srcMap[f].matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) {
      const name = m[1];
      if (name.endsWith('_')) continue;
      assert.ok(Object.prototype.hasOwnProperty.call(PUBLIC_API, name),
        f + ': ' + name + ' 이(가) 공개 함수입니다(tests/public-api.d/<세션>.json에 등록하거나 이름 끝에 _)');
    }
  }
});

test('허용된 공개 함수는 첫 문장에서 권한·소유자를 확인한다', () => {
  for (const f of SRC_FILES) {
    for (const [fn, spec] of Object.entries(PUBLIC_API)) {
      if (!spec.guard) continue;
      const m = srcMap[f].match(new RegExp('^function ' + fn + '\\([^)]*\\)\\s*\\{\\s*\\n([^\\n]*)', 'm'));
      if (m) assert.ok(m[1].includes(spec.guard), fn + ' 첫 줄에 ' + spec.guard + ' 없음: ' + m[1]);
    }
  }
});

/* ───────── public-api.json 자체 ───────── */

test('public-api: public-api.json과 public-api.d/*.json을 합쳐 읽고, 같은 이름이 두 파일에 있으면 실패한다', () => {
  for (const f of ['coding-a', 'coding-b', 'test']) assert.ok(API_FILES.includes('tests/public-api.d/' + f + '.json'), f);
  assert.deepStrictEqual(API.dups, []);
  const spec = { use: '화면', guard: 'requirePermission_' };
  const m = mergePublicApi([['a.json', { functions: { foo: spec } }], ['d/x.json', { functions: { bar: spec, foo: spec } }]]);
  assert.deepStrictEqual(m.dups, ['foo ← a.json, d/x.json'], '임시 중복을 잡는다(나쁜 입력)');
  assert.deepStrictEqual(Object.keys(m.functions), ['foo', 'bar']);
  assert.throws(() => mergePublicApi([['d/y.json', { function: {} }]]), /d\/y\.json: "functions"/);
});

test('public-api.json: 등록된 함수가 src에 실제로 있다(지운 함수는 목록에서도 뺀다)', () => {
  const defined = new Set();
  for (const f of SRC_FILES) {
    for (const m of srcMap[f].matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) defined.add(m[1]);
  }
  for (const name of Object.keys(PUBLIC_API)) assert.ok(defined.has(name), name + ' 이(가) src에 없습니다');
});

test('public-api.json: guard가 없으면 이유(why)를 적고, 이름 끝은 _ 가 아니다', () => {
  for (const [name, spec] of Object.entries(PUBLIC_API)) {
    assert.ok(!name.endsWith('_'), name + ': 내부 함수(_)는 등록하지 않는다');
    assert.ok(['화면', '편집기'].includes(spec.use), name + ': use는 화면 또는 편집기');
    if (!spec.guard) assert.ok(spec.why && spec.why.trim(), name + ': guard가 null이면 why가 필요');
  }
});

/* ───────── 전역 이름 중복 ───────── */

test('src 전체에서 전역 이름(function·var·let·const·class)이 겹치지 않는다', () => {
  const dups = checks.findDuplicateGlobals(srcMap);
  assert.deepStrictEqual(dups.map((d) => d.name + ' ← ' + d.where.join(', ')), []);
});

test('전역 이름 검사기: 겹치면 잡고, 함수 안 이름은 넘긴다(나쁜 입력)', () => {
  const names = (m) => checks.findDuplicateGlobals(m).map((d) => d.name);
  assert.deepStrictEqual(names({ 'a.gs': 'function foo_() {}\n', 'b.gs': 'function foo_() { return 1; }\n' }), ['foo_']);
  assert.deepStrictEqual(names({ 'a.gs': 'var TZ = 1;\n', 'b.gs': 'function TZ() {}\n' }), ['TZ']);
  assert.deepStrictEqual(names({ 'a.gs': 'function x_() {}\nfunction x_() {}\n' }), ['x_'], '같은 파일 안 중복');
  assert.deepStrictEqual(names({ 'a.gs': 'var p = 1, q = 2;\n', 'b.gs': 'const q = 3;\n' }), ['q'], 'var 여러 개');
  assert.deepStrictEqual(names({ 'a.gs': 'function outer_() {\n  function inner() {}\n}\n', 'b.gs': 'function inner() {}\n' }), []);
  assert.deepStrictEqual(names({ 'a.gs': 'function a_() {}\n', 'b.gs': 'function b_() {}\n' }), []);
});

/* ───────── 화면·인쇄: HTML 문자열 주입 금지 ───────── */

const HTML_DIRS = ['src/ui', 'src/print'];

test('src/ui·src/print에 innerHTML·outerHTML·insertAdjacentHTML·document.write가 없다(글자는 textContent)', () => {
  const bad = [];
  for (const dir of HTML_DIRS) {
    for (const f of listFiles(dir)) {
      const hits = checks.findUnsafeHtml(readFile(f));
      if (hits.length) bad.push(f + ': ' + fmt(hits));
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('HTML 주입 검사기: 금지 API를 잡는다(나쁜 입력)', () => {
  const tokens = (s) => checks.findUnsafeHtml(s).map((x) => x.token);
  assert.deepStrictEqual(tokens('<script>\n  root.innerHTML = data;\n</script>'), ['innerHTML']);
  assert.deepStrictEqual(tokens('a.outerHTML = b; c.insertAdjacentHTML("beforeend", d);'), ['outerHTML', 'insertAdjacentHTML']);
  assert.deepStrictEqual(tokens('document.write(x); document . writeln(y);'), ['document.write', 'document . writeln']);
  assert.deepStrictEqual(checks.findUnsafeHtml('x\ny.innerHTML = z')[0].line, 2);
  assert.deepStrictEqual(tokens('node.textContent = name; el("div", {text: s});'), []);
});

/* ───────── 규칙·인쇄: 순수 함수 ───────── */

const PURE_DIRS = ['src/rules', 'src/print'];

test('src/rules·src/print는 Apps Script 서비스와 현재 시각(인자 없는 new Date, Date.now)을 쓰지 않는다', () => {
  const bad = [];
  for (const dir of PURE_DIRS) {
    for (const f of listFiles(dir)) {
      const hits = checks.findImpureCalls(readFile(f));
      if (hits.length) bad.push(f + ': ' + fmt(hits));
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('순수 함수 검사기: 서비스 호출·현재 시각을 잡고, 날짜 인자가 있는 Date는 넘긴다(나쁜 입력)', () => {
  const tokens = (s) => checks.findImpureCalls(s).map((x) => x.token);
  for (const svc of checks.GAS_SERVICES) {
    assert.strictEqual(tokens('var v = ' + svc + '.foo();').length, 1, svc);
  }
  assert.deepStrictEqual(tokens('var a = new Date();'), ['new Date()']);
  assert.deepStrictEqual(tokens('var a = new Date;'), ['new Date']);
  assert.deepStrictEqual(tokens('var a = Date.now();'), ['Date.now']);
  assert.deepStrictEqual(tokens('var u = Utilities.formatDate(d, "Asia/Seoul", "yyyy");\nvar s = Session.getActiveUser();'),
    ['Utilities.', 'Session.']);
  assert.deepStrictEqual(tokens('var a = new Date(Date.UTC(2027, 2, 3)); var b = new Date(ms);'), []);
  assert.deepStrictEqual(tokens('// Session을 쓰지 않는다. 날짜는 인자로 받는다.'), []);
});
