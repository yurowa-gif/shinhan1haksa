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
  ['남 48', '여 92', '사유는 관리자·학사 교사만 봅니다', '저장을 막지 않는다', '정원 초과·성별 불일치만 저장을 막고', '삭제 버튼은 없다'].forEach((t) => assert.ok(sec.indexOf(t) >= 0, t));
  const styles = css.readFile('src/ui/Styles.html');
  assert.ok(/\.seat-cell\.bad \.seat-no::before \{ content: "⚠/.test(styles) && /\.chip\.bad::before \{ content: "⚠/.test(styles));
  assert.ok(/\.seat-cell\.bad \{ border: 3px solid/.test(styles));
});

test('3단계 선생님 확인 체크리스트: 번호(A1~E8)가 겹치지 않고 모든 줄이 7칸이며, 꼭 넣을 단계와 시안 사진 파일이 있다', () => {
  const doc = css.readFile('docs/design/stage3-teacher-checks.md');
  const rows = doc.split('\n').filter((l) => /^\| [A-E]\d+ \|/.test(l));
  assert.ok(rows.length >= 40, '단계 수 ' + rows.length);
  const ids = rows.map((l) => l.split('|')[1].trim());
  assert.strictEqual(new Set(ids).size, ids.length, '번호 중복');
  rows.forEach((l) => assert.strictEqual(l.split('|').length, 8, l.slice(0, 40)));
  ['결정 64', '어제 출석부', '입실 전 학생', 'seedFakeStage3', 'seedDefaultRooms', 'duty_manager', 'homeroom', 'attendance', '삭제 버튼은 어디에도 없다', '[저장]이 꺼져 있고'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  const fs = require('fs');
  const path = require('path');
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((stage3-check-photos\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 14, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', f)), f + ' 파일이 없다'));
  const src = css.readFile('design/preview/stage3-screens.js');
  [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]).forEach((id) => assert.ok(doc.indexOf('`' + id + '`') >= 0, '`' + id + '` 시안 사진이 없다'));
});

test('rules.md 가 글꼴을 내려받지 않는다는 결정과 UI 용어집 링크를 적고, Styles 에 글꼴 내려받는 코드가 없다', () => {
  const rules = css.readFile('docs/design/rules.md');
  assert.ok(rules.indexOf('글꼴 파일을 내려받지 않는다') >= 0 && rules.indexOf('OFL') >= 0 && rules.indexOf('로딩 시간') >= 0);
  assert.ok(rules.indexOf('docs/design/ui-vocabulary.md') >= 0);
  const styles = css.readFile('src/ui/Styles.html');
  assert.ok(!/@font-face|fonts\.googleapis|cdn\.jsdelivr/.test(styles), '글꼴을 내려받는 코드가 들어갔다');
});

test('D11 상담 신청 예시: UI 프롬프트 틀 칸이 모두 채워져 있고, 시안 이름·사진·미정 표시가 문서에 있다', () => {
  const doc = css.readFile('docs/design/stage6-counsel-request-example.md');
  ['[화면]', '[목적]', '[머리줄]', '[위 안내]', '[본문 카드]', '[탭]', '[아래 바]', '[확인 시트]', '[상태]', '[권한]', '[참고]', '[받을 것]'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  assert.ok(doc.indexOf('틀 쓰는 법 예시') >= 0 && doc.indexOf('미정') >= 0 && /Q7/.test(doc) && /Q8/.test(doc));
  const src = css.readFile('design/preview/stage6-screens.js');
  const ids = [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 4, '시안 수 ' + ids.length);
  ids.forEach((id) => assert.ok(doc.indexOf('`' + id + '`') >= 0, '`' + id + '` 가 문서에 없다'));
  const fs = require('fs');
  const path = require('path');
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((stage6-counsel-example-photos\/[^)]+)\)/g)].map((m) => m[1]);
  assert.strictEqual(imgs.length, ids.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', f)), f));
  const tpl = css.readFile('docs/design/ui-vocabulary.md');
  ['[화면]', '[목적]', '[머리줄]', '[위 안내]', '[본문 카드]', '[탭]', '[아래 바]', '[확인 시트]', '[상태]', '[권한]', '[참고]', '[받을 것]'].forEach((t) => assert.ok(tpl.indexOf(t) >= 0, '용어집 틀에 ' + t + ' 가 없다'));
});

test('D9 학교 양식 문서: 확인서 모델·근무 기록표 xlsx 칸 배치·확인표 11절(67~82번)이 있고, 사진 파일이 실제로 있으며, 식수 집계 행 순서가 결정 67과 같다', () => {
  const fs = require('fs');
  const path = require('path');
  const d = (f) => css.readFile('docs/design/' + f);
  const check = d('print-check.md');
  const nums = check.split('\n').filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|')[1].trim());
  for (let n = 44; n <= 82; n++) assert.ok(nums.indexOf(String(n)) >= 0, '확인표에 ' + n + '번이 없다');
  assert.ok(check.indexOf('## 11. 확인서 두 종') >= 0 && check.indexOf('임시 양식') < 0, '임시 양식 문구가 남아 있다');
  const duty = d('duty-record.md');
  ['시트 1 "근무표"', '시트 2 "근무 합계"', '원래 근무자=>실제 근무자', 'Utilities.zip', '수식 없음', '결정 47', '결정 46', 'A4 가로', '학생 이름은 어디에도 넣지 않는다'].forEach((t) => assert.ok(duty.indexOf(t) >= 0, t));
  const model = d('confirm-forms-model.md');
  ['printRenderMealConfirm_', 'printRenderMoveConfirm_', '위 20mm · 아래 15mm · 좌우 30mm', '425pt', 'Drive에 남기지 않는다', '둘 다 ○'].forEach((t) => assert.ok(model.indexOf(t) >= 0, t));
  const imgs = [];
  [duty, model].forEach((doc) => [...doc.matchAll(/!\[[^\]]*\]\(([^)]+\.png)\)/g)].forEach((m) => imgs.push(m[1])));
  assert.ok(imgs.length >= 4, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', f)), f + ' 파일이 없다'));
  assert.ok(d('meal-counts-model.md').indexOf('여1·여2·여3·남1·남2·남3 → 여·남 → 1·2·3학년 → 전체') >= 0);
  assert.ok(d('stage2-teacher-checks.md').indexOf('현황표 \'전체\' 탭 집계 표') >= 0 && d('stage2-teacher-checks.md').indexOf('(학교 양식이 오면)') < 0);
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
