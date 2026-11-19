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
  for (let n = 44; n <= 84; n++) assert.ok(nums.indexOf(String(n)) >= 0, '확인표에 ' + n + '번이 없다');
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

test('D12 4단계 시안(stage4-screens.js)의 화면 이름이 모두 screens.md 5-4 절에 백틱으로 적혀 있고 360px 사진 파일이 있으며, 권한 키·삭제 없음·미정 표시가 적혀 있다', () => {
  const fs = require('fs');
  const path = require('path');
  const src = css.readFile('design/preview/stage4-screens.js');
  const doc = css.readFile('docs/design/screens.md');
  const sec = doc.slice(doc.indexOf('## 5-4. 4단계 화면'), doc.indexOf('## 6. 권한별'));
  const ids = [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 14, '시안 수 ' + ids.length);
  ids.forEach((id) => {
    assert.ok(sec.indexOf('`' + id + '`') >= 0, '5-4 절에 `' + id + '` 가 없다');
    assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', 'stage4-photos', id + '.png')), id + ' 사진이 없다');
  });
  ['`doc.edit`', '`doc.view`', '`doc.types`', '`program.edit`', '`program.view`', '삭제 버튼은 없다', '`docs-proposal-summary`', '실제와 다름', '미정', '행이 없으면 미제출', '함께 취소됩니다', '그대로 두고 프로그램 특이사항을 따로 만듭니다'].forEach((t) => assert.ok(sec.indexOf(t) >= 0 || doc.indexOf(t) >= 0, t));
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

test('4단계 선생님 확인 체크리스트: 번호(A1~L4)가 겹치지 않고 모든 줄이 7칸이며, 꼭 넣을 단계·사진 파일이 있고, coding-a 초안이 합친 문서로 이어진다', () => {
  const fs = require('fs');
  const path = require('path');
  const doc = css.readFile('docs/design/stage4-teacher-checks.md');
  const rows = doc.split('\n').filter((l) => /^\| [A-L]\d+ \|/.test(l));
  const ids = rows.map((l) => l.split('|')[1].trim());
  assert.strictEqual(new Set(ids).size, ids.length, '번호 중복');
  assert.ok(rows.length >= 100, '단계 수 ' + rows.length);
  rows.forEach((l) => assert.strictEqual(l.replace(/\\\|/g, '').split('|').length, 8, l.slice(0, 40)));   // 칸 안의 \| 는 칸 구분이 아니다
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((s) => assert.ok(ids.indexOf(s + '1') >= 0, s + '절이 없다'));
  ['입퇴실 확인서 비고 칸 높이', '빈 양식 종이', '51mm', 'ASSUMPTION', '새 달 5일이 지나 퇴실하면 그달 비용을 냅니다', '다음 달 1일', '즉시 퇴실로 정하기', '결정 78', '학사 프로그램 열기', '확인서 인쇄', '임시 퇴실', '일괄 퇴실', '복귀 예정일 지남', '일반 퇴실로 바꾸기', '소급하지 않습니다', '일괄 되돌리기', '학년 일괄 퇴실', '일괄 퇴실도 자진 퇴실', '급식실 양식으로 출력', '엑셀로 받기'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  assert.ok(doc.indexOf('이미 기록된 이 항목의 OUT에도 그대로') < 0, '결정 78 이전의 소급 문구가 남아 있다');
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\(([^)]+\.png)\)/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 31, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', f)), f + ' 파일이 없다'));
  // 이 문서가 시안 사진으로 쓰는 4단계 시안 이름(백틱)은 stage4-screens.js 에 실제로 있어야 한다
  const src = css.readFile('design/preview/stage4-screens.js');
  const defs = [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]);
  ['outs-instant', 'outs-instant-confirm', 'moves-enter-first', 'moves-leave-5day', 'moves-temp-leave', 'moves-temp-convert', 'home-temp-overdue', 'batch-new', 'batch-confirm', 'batch-undo'].forEach((id) => { assert.ok(defs.indexOf(id) >= 0, id); assert.ok(doc.indexOf('`' + id + '`') >= 0, '`' + id + '` 가 문서에 없다'); });
  const old = css.readFile('docs/design/stage4-teacher-checks-coding-a.md');
  assert.ok(old.indexOf('stage4-teacher-checks.md') >= 0, 'coding-a 초안에 합친 문서 링크가 없다');
  // 번호가 같은 코딩A 초안의 단계(A1~F9)가 합친 문서에도 그대로 있다
  old.split('\n').filter((l) => /^\| [A-F]\d+ \|/.test(l)).forEach((l) => assert.ok(ids.indexOf(l.split('|')[1].trim()) >= 0, l.slice(0, 20)));
});

test('D12 5단계 시안(stage5-screens.js): 화면 이름이 stage5-screens.md 에 백틱으로 적혀 있고 사진 파일이 있으며, 새 스타일 클래스가 Styles.html 에 있고 미정·가정이 적혀 있다', () => {
  const fs = require('fs');
  const path = require('path');
  const src = css.readFile('design/preview/stage5-screens.js');
  const doc = css.readFile('docs/design/stage5-screens.md');
  const ids = [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 19, '시안 수 ' + ids.length);
  ids.forEach((id) => {
    assert.ok(doc.indexOf('`' + id + '`') >= 0, '`' + id + '` 가 문서에 없다');
    assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', 'stage5-photos', id + '.png')), id + ' 사진이 없다');
  });
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((stage5-photos\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 19, '문서의 사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', f)), f + ' 파일이 없다'));
  ['.rg-cell', '.rg-pre', '.rg-sym', 'table.data.rg', '.rg-cell.bad', '.rg-cell.off', '.rg-cell.has', '.rg-cell.sel'].forEach((c) => assert.ok(css.readFile('src/ui/Styles.html').indexOf(c.replace(/^table\.data\./, 'table.data.')) >= 0, c + ' 가 Styles.html 에 없다'));
  ['`counsel.view`', '`counsel.save`', '`counsel.cancel`', '결정 81', '미정·가정', '삭제 버튼은 어디에도 없다', '저장한 뒤에는 고치지 않는다', '자동 1OUT', '(내용 생략, N자)', '기본 켬', '결정 80', 'UI.rangeField'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  // 미인정·운영 안 함은 색만으로 알리지 않는다(⚠ 글자·점선)
  const styles = css.readFile('src/ui/Styles.html');
  assert.ok(/\.rg-cell\.sel \{ border: 3px solid var\(--accent\)/.test(styles) && !/\.rg-cell\.sel[^{]*::before/.test(styles), '고른 날은 아이콘 없이 색 + 굵기');
  assert.ok(/\.rg-cell\.bad \.rg-sym::before \{ content: "⚠ "/.test(styles) && /\.rg-cell\.bad \{ border: 3px solid/.test(styles) && /\.rg-cell\.off \{[^}]*border-style: dashed/.test(styles));
});

test('5단계 선생님 확인 체크리스트: 번호(0-1~C24)가 겹치지 않고 모든 줄이 7칸이며, 사진 파일이 있고 꼭 넣을 단계가 있다', () => {
  const fs = require('fs');
  const path = require('path');
  const doc = css.readFile('docs/design/stage5-teacher-checks.md');
  const rows = doc.split('\n').filter((l) => /^\| (0-\d+|[A-C]\d+) \|/.test(l));
  const ids = rows.map((l) => l.split('|')[1].trim());
  assert.strictEqual(new Set(ids).size, ids.length, '번호 중복');
  assert.ok(rows.length >= 60, '단계 수 ' + rows.length);
  rows.forEach((l) => assert.strictEqual(l.replace(/\\\|/g, '').split('|').length, 8, l.slice(0, 40)));
  ['0-1', 'A1', 'B1', 'C1', 'A17', 'B18', 'C24'].forEach((id) => assert.ok(ids.indexOf(id) >= 0, id + ' 가 없다'));
  ['이 일정을 등록할까요?', '이 일정을 취소할까요?', '상담 기록을 취소합니다', '결과를 저장할까요?', '(내용 생략, N자)', '연결된 자동 1OUT도 함께 취소됩니다', '끝난 지 오래되어 볼 수만 있습니다', '결과 입력은 출결 담당·관리자만 합니다.', '미인정이라 저장하면 자동으로 1OUT', '다른 관리자가 먼저 바꿨습니다', '다른 선생님이 먼저 바꿨습니다', '볼 수 있는 학생이 없습니다', '출석(특이사항 없음)', '이 화면은 볼 수 있는 역할이 아닙니다', '14일', '한 통'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  assert.ok(doc.indexOf('알려진 표시 문제') < 0 && !/NONE · NONE/.test(doc), '고쳐진 표시 문제 안내가 남아 있다');
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((stage5-check-photos\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 25, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', f)), f + ' 파일이 없다'));
  // 사진을 찍는 스크립트가 있고 세 절을 모두 다룬다
  const shots = css.readFile('design/preview/stage5-real.js');
  ['sectionA', 'sectionB', 'sectionC', "a-cal-form-error", "b-not-mine", "c-save-bad-confirm"].forEach((t) => assert.ok(shots.indexOf(t) >= 0, t));
});

test('D13 7단계 시안(stage7-screens.js): 화면 이름이 stage7-screens.md 에 적혀 있고 사진이 있으며, 학생·학부모 화면에 다른 사람·전화·상담 내용이 없다', () => {
  const fs = require('fs');
  const path = require('path');
  const src = css.readFile('design/preview/stage7-screens.js');
  const doc = css.readFile('docs/design/stage7-screens.md');
  const ids = [...src.matchAll(/^def\('([^']+)'/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 19, '시안 수 ' + ids.length);
  ids.forEach((id) => {
    assert.ok(doc.indexOf('`' + id + '`') >= 0, '`' + id + '` 가 문서에 없다');
    assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', 'stage7-photos', id + '.png')), id + ' 사진이 없다');
  });
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((stage7-photos\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 19, '문서의 사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'design', f)), f + ' 파일이 없다'));
  ['미정·가정', '처음 쓰는 사람', '상담은 날짜·교사만', '삭제가 아니라 취소', '번호를 쓴다', '`facility.write`', '`facility.report`', '규칙 8절', '확인 못 한 것'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  // 학생·학부모 시안 화면에는 전화번호·이메일·교사 메모 글자가 없다
  const studentParent = src.slice(src.indexOf('F14 학생 홈'), src.indexOf('F10 시설 사용 일지'));
  assert.ok(!/010-|@example|메모:|전화/.test(studentParent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/note: '[^']*'/g, '')), '학생·학부모 시안에 전화·이메일·메모가 보인다');
});

test('D13 frontend-design 검토와 rules.md 8절: 라이선스·출처·판정(가져온다/가져오지 않는다)·rules 반영이 적혀 있고, 기존 규칙(문구·상태·확인 방식)이 그대로 있다', () => {
  const review = css.readFile('docs/design/frontend-design-review.md');
  ['anthropics/skills', 'skills/frontend-design/SKILL.md', 'Apache License 2.0', '코드를 복사하지 않고 원칙만', '가져온다', '가져오지 않는다', '바꿔 가져온다', '외부 라이브러리·웹폰트·애니메이션 없음', '4.5:1', 'rules.md 반영 제안', '확인 못 한 것'].forEach((t) => assert.ok(review.indexOf(t) >= 0, t));
  const rules = css.readFile('docs/design/rules.md');
  ['## 8. 화면을 그리기 전 한 줄 계획과 점검', '한 동작의 이름', '오류에 사과하지 않는다', '학생·학부모 화면', 'docs/design/frontend-design-review.md'].forEach((t) => assert.ok(rules.indexOf(t) >= 0, t));
  // 기존 규칙이 남아 있다(이번 변경은 더한 것뿐)
  ['## 4. 상태 표시', '## 6. 확인·사유 입력이 필요한 동작', '글자 대비 4.5:1', '개인 정보', '빈 상태'].forEach((t) => assert.ok(rules.indexOf(t) >= 0, t));
});
