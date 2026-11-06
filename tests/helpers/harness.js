/**
 * 테스트 도구(소유: 총괄). 모든 tests/**\/*.test.js 가 이 파일을 쓴다.
 *
 *   const { test, loadGs, plain } = require('../helpers/harness');
 *   const ctx = loadGs(['src/Schema.gs', 'src/Auth.gs']);
 *   test('설명', () => { assert.ok(ctx.parseRoles_('admin').length === 1); });
 *
 * test()는 동기 함수만 받는다. 실행 결과는 tests/run.js 가 모아서 출력한다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

const state = { passed: 0, failed: 0, failures: [] };

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      throw new Error('비동기 테스트는 지원하지 않습니다(Promise를 돌려주지 마세요)');
    }
    state.passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    state.failed++;
    state.failures.push({ name: name, message: (e && e.message) || String(e) });
    console.log('  ✗ ' + name + '\n    ' + String((e && e.message) || e).split('\n').join('\n    '));
  }
}

/**
 * .gs 파일들을 vm 컨텍스트 하나에 차례로 올린다(Apps Script처럼 전역 공간을 공유).
 * @param {string|string[]} files 저장소 루트 기준 경로(예: 'src/Auth.gs')
 * @param {Object} [extraGlobals] 미리 넣어 둘 전역 값(가짜 서비스 등)
 * @return {Object} vm 컨텍스트. 최상위 function·var 는 ctx.이름 으로 읽는다.
 */
function loadGs(files, extraGlobals) {
  const ctx = vm.createContext(Object.assign({ console: console }, extraGlobals || {}));
  for (const f of [].concat(files)) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

/** vm 안에서 만든 값을 이 쪽 배열·객체로 바꾼다(deepStrictEqual 비교용). */
function plain(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/**
 * 폴더 아래 파일 목록(하위 폴더 포함, 정렬). 폴더가 없으면 빈 배열.
 * @param {string} relDir 저장소 루트 기준 폴더
 * @param {string[]} [exts] 확장자 거르기(예: ['.gs'])
 * @return {string[]} 저장소 루트 기준 경로('/' 구분)
 */
function listFiles(relDir, exts) {
  const out = [];
  const start = path.join(ROOT, relDir);
  if (!fs.existsSync(start)) return out;
  (function walk(dir) {
    for (const f of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (!exts || exts.some(function (e) { return f.endsWith(e); })) {
        out.push(path.relative(ROOT, p).split(path.sep).join('/'));
      }
    }
  })(start);
  return out.sort();
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

module.exports = { ROOT, state, test, loadGs, plain, listFiles, readFile };
