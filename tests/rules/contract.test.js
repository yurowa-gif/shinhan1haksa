/**
 * R7 계약 검사: docs/contracts/rules-api.md 의 함수 시그니처 블록에 적힌 이름이
 * 해당 src/rules 파일에 실제로 있다. 아직 만들지 않은 파일(R2~R6 진행 중)은 건너뛰고 목록으로 보여 준다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, ROOT, readFile, loadGs } = require('../helpers/harness');

const doc = readFile('docs/contracts/rules-api.md');
const sigBlock = (doc.split('## 함수 시그니처')[1] || '').split('```js')[1].split('```')[0];

// '// src/rules/X.gs' 줄 아래의 'function 이름(' 을 파일별로 모은다
const byFile = {};
let current = null;
for (const line of sigBlock.split('\n')) {
  const f = /^\/\/\s*(src\/rules\/\w+\.gs)/.exec(line.trim());
  if (f) { current = f[1]; byFile[current] = []; continue; }
  const m = /^function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/.exec(line.trim());
  if (m && current) byFile[current].push({ name: m[1], params: m[2].split(',').map((s) => s.trim()).filter(Boolean) });
}

test('계약 문서에서 함수 목록을 읽었다', () => {
  assert.ok(Object.keys(byFile).length >= 7, Object.keys(byFile).join(', '));
});

const existing = Object.keys(byFile).filter((f) => fs.existsSync(path.join(ROOT, f)));
const pending = Object.keys(byFile).filter((f) => existing.indexOf(f) < 0);
if (pending.length) console.log('  (아직 없는 규칙 파일: ' + pending.join(', ') + ')');

test('만들어진 규칙 파일에는 계약 문서의 함수가 모두 있고, 인자 수가 같다', () => {
  const ctx = loadGs(existing);
  for (const f of existing) {
    for (const fn of byFile[f]) {
      assert.strictEqual(typeof ctx[fn.name], 'function', f + ': ' + fn.name + ' 없음');
      assert.strictEqual(ctx[fn.name].length, fn.params.length, f + ': ' + fn.name + ' 인자 수');
      assert.ok(new RegExp('^function\\s+' + fn.name + '\\s*\\(', 'm').test(readFile(f)), fn.name + ' 이(가) ' + f + ' 에 없음');
    }
  }
});

test('규칙 함수 이름은 모두 _ 로 끝난다', () => {
  for (const f of Object.keys(byFile)) for (const fn of byFile[f]) assert.ok(fn.name.endsWith('_'), fn.name);
});
