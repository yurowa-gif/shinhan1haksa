/**
 * 디자인 문서가 실제 코드와 어긋나지 않는지(소유: DESIGN): 문서가 말하는 UI.* 이름, 토큰, 클래스, 링크된 파일.
 */
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { test, ROOT } = require('../helpers/harness');
const css = require('./css-util');

const html = css.readFile('src/ui/Components.html');
const script = html.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');
const ctx = vm.createContext({});
vm.runInContext(script, ctx);
const keys = Object.keys(ctx.UI);
const styles = css.parseRules(css.styleText(css.readFile('src/ui/Styles.html')));
const tokens = css.rootTokens(styles);
const definedClasses = css.definedClasses(styles);
const DOCS = ['docs/design/rules.md', 'docs/design/screens.md', 'docs/design/components.md', 'docs/design/print-layout.md', 'docs/design/print-check.md'];

test('디자인 문서가 부르는 UI.이름은 모두 실제 Components.html 에 있다', () => {
  const missing = [];
  DOCS.forEach((f) => {
    for (const m of css.readFile(f).matchAll(/`?UI\.(\w+)/g)) if (keys.indexOf(m[1]) < 0) missing.push(f + ' → UI.' + m[1]);
  });
  assert.deepStrictEqual(missing, []);
});

test('screens.md·print-layout.md·print-check.md 에 백틱으로 적은 토큰·클래스가 실제 Styles.html 에 있다', () => {
  const bad = [];
  ['docs/design/screens.md', 'docs/design/print-layout.md', 'docs/design/print-check.md'].forEach((f) => {
    for (const m of css.readFile(f).matchAll(/`([^`\n]+)`/g)) {
      const t = m[1].trim();
      if (/^--[a-z0-9-]+$/.test(t) && tokens[t] === undefined) bad.push(f + ' ' + t);
      if (/^(?:\.[A-Za-z][\w-]*)+$/.test(t)) t.split('.').filter(Boolean).forEach((c) => { if (!definedClasses.has(c)) bad.push(f + ' ' + t); });
    }
  });
  assert.deepStrictEqual(bad, []);
});

test('디자인 문서가 가리키는 파일(`docs/…` `src/…` `design/…` `tests/…`)이 실제로 있다(아직 없는 D 산출물 제외)', () => {
  const ok = new Set(['docs/design/print-sheet-spec.md']); // B안이 정해지면 만든다(print-layout.md 하단)
  const missing = [];
  DOCS.forEach((f) => {
    for (const m of css.readFile(f).matchAll(/`((?:docs|src|design|tests)\/[\w./{},-]+)`/g)) {
      const p = m[1];
      if (/[{}*]/.test(p) || ok.has(p) || p.endsWith('/')) continue;
      if (!fs.existsSync(path.join(ROOT, p))) missing.push(f + ' → ' + p);
    }
  });
  assert.deepStrictEqual(missing, []);
});

test('screens.md 가 한 화면씩 다룬다: F1·F2·F5 절과 "버튼 두 번"·"30초" 경로가 있다', () => {
  const doc = css.readFile('docs/design/screens.md');
  ['## 1. 홈 카드 배치', '## 2. C5', '## 3. C7', '## 4. C6', '## 5. 이미 만든 화면', '## 5-2. 2단계 화면'].forEach((h) => assert.ok(doc.indexOf(h) >= 0, h));
  assert.ok(doc.indexOf('버튼 두 번') > 0 && doc.indexOf('홈 → 오늘 출석부(탭 1) → PDF 열기(탭 2)') > 0);
  assert.ok(doc.indexOf('30초') > 0 && /탭 \d회/.test(doc));
});

test('D6 시안(stage2-screens.js)의 화면 이름이 모두 screens.md 5-2 절에 백틱으로 적혀 있고, confirmSheet 의 lead·lines 가 components.md 에 있다', () => {
  const src = css.readFile('design/preview/stage2-screens.js');
  const doc = css.readFile('docs/design/screens.md');
  const sec = doc.slice(doc.indexOf('## 5-2. 2단계 화면'), doc.indexOf('## 6. 권한별'));
  const ids = [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 20, '시안 화면 수 ' + ids.length);
  ids.forEach((id) => assert.ok(sec.indexOf('`' + id + '`') >= 0, '5-2 절에 `' + id + '` 가 없다'));
  const comp = css.readFile('docs/design/components.md');
  assert.ok(comp.indexOf('lead?') > 0 && comp.indexOf('lines?') > 0);
  assert.ok(css.readFile('src/ui/Components.html').indexOf("opts.lead") > 0);
});

test('D10 시안(stage3-screens.js)의 화면 이름이 모두 screens.md 5-3 절에 백틱으로 적혀 있고, 규칙 위반 칸은 색만으로 알리지 않는다(⚠ 글자·굵은 테두리)', () => {
  const src = css.readFile('design/preview/stage3-screens.js');
  const doc = css.readFile('docs/design/screens.md');
  const sec = doc.slice(doc.indexOf('## 5-3. 3단계 화면'), doc.indexOf('## 6. 권한별'));
  const ids = [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 14, '시안 화면 수 ' + ids.length);
  ids.forEach((id) => assert.ok(sec.indexOf('`' + id + '`') >= 0, '5-3 절에 `' + id + '` 가 없다'));
  ['남 48', '여 92', '사유는 관리자·학사 교사만 봅니다', '저장은 막', '삭제 버튼은 없다'].forEach((t) => assert.ok(sec.indexOf(t) >= 0, t));
  const styles = css.readFile('src/ui/Styles.html');
  assert.ok(/\.seat-cell\.bad \.seat-no::before \{ content: "⚠/.test(styles) && /\.chip\.bad::before \{ content: "⚠/.test(styles));
  assert.ok(/\.seat-cell\.bad \{ border: 3px solid/.test(styles));
});

test('2단계 선생님 확인 체크리스트: 단계 번호(A1~E4)가 겹치지 않고 모든 줄이 7칸(번호·누가·누르는 것·통과 모습·사진·결과)이며, print-check 9·10절 번호(44~66)가 이어진다', () => {
  const doc = css.readFile('docs/design/stage2-teacher-checks.md');
  const rows = doc.split('\n').filter((l) => /^\| [A-E]\d+ \|/.test(l));
  assert.ok(rows.length >= 40, '단계 수 ' + rows.length);
  const ids = rows.map((l) => l.split('|')[1].trim());
  assert.strictEqual(new Set(ids).size, ids.length, '번호 중복');
  rows.forEach((l) => assert.strictEqual(l.split('|').length, 8, l.slice(0, 40)));
  const check = css.readFile('docs/design/print-check.md');
  const nums = check.split('\n').filter((l) => /^\| \d+[a-z]? \|/.test(l)).map((l) => l.split('|')[1].trim());
  for (let n = 44; n <= 66; n++) assert.ok(nums.indexOf(String(n)) >= 0, '확인표에 ' + n + '번이 없다');
});
