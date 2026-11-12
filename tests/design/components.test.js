/**
 * D3 증명 테스트(소유: DESIGN): Components.html 의 UI 키가 문서와 같고, 글자는 textContent 로만,
 * 순수 함수(UI.util)가 맞고, 새 클래스가 정의되어 있고 누르는 칸이 48px 이상이다.
 */
const assert = require('assert');
const vm = require('vm');
const { test, plain } = require('../helpers/harness');
const checks = require('../helpers/source-checks');
const css = require('./css-util');

const html = css.readFile('src/ui/Components.html');
const script = html.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');
const ctx = vm.createContext({});
vm.runInContext(script, ctx, { filename: 'Components.html' }); // 불러올 때 브라우저가 없어도 돌아야 한다
const UI = ctx.UI;
const U = UI.util;

test('Components.html 은 전역 이름을 UI 하나만 만든다', () => {
  const names = checks.topLevelNames(script, 'Components.html').map((n) => n.name);
  assert.deepStrictEqual(names, ['UI']);
});

test('innerHTML·outerHTML·insertAdjacentHTML·document.write 가 없다', () => {
  assert.deepStrictEqual(checks.findUnsafeHtml(html), []);
});

test('서버·저장소를 직접 부르지 않는다(google.script.run·call(·fetch·localStorage 없음)', () => {
  ['google.script.run', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage'].forEach((w) => {
    assert.ok(html.indexOf(w) < 0, w + ' 사용');
  });
  assert.ok(!/[^\w.]call\(/.test(script), 'call( 사용');
});

test('문서 docs/design/components.md 의 ### UI.이름 목록과 실제 UI 키가 같다', () => {
  const doc = css.readFile('docs/design/components.md');
  const documented = [...doc.matchAll(/^### UI\.(\w+)/gm)].map((m) => m[1]).sort();
  assert.deepStrictEqual(documented, Object.keys(UI).sort());
});

test('D3 목록의 컴포넌트가 모두 있다', () => {
  ['studentPicker', 'dateField', 'rangeField', 'blockChips', 'segmented', 'bottomSheet', 'confirmWithReason', 'toast',
    'badge', 'statusPill', 'emptyState', 'actionBar', 'seatGrid'].forEach((k) => {
    assert.strictEqual(typeof UI[k], 'function', 'UI.' + k);
  });
});

/* ───── 순수 함수 ───── */

test('formatDateKo: 요일·연도·잘못된 날짜(윤년 포함)', () => {
  const rows = [
    ['2027-03-03', false, '3월 3일(수)'], ['2027-03-03', true, '2027년 3월 3일(수)'], ['2028-02-29', false, '2월 29일(화)'],
    ['2027-02-29', false, ''], ['2027-13-01', false, ''], ['2027-3-3', false, ''], ['', false, ''], [null, false, '']
  ];
  rows.forEach(([s, y, want]) => assert.strictEqual(U.formatDateKo(s, y), want, String(s)));
});

test('daysBetween·formatRangeKo: 하루·기간·월 넘김·거꾸로', () => {
  assert.strictEqual(U.daysBetween('2027-03-03', '2027-03-03'), 1);
  assert.strictEqual(U.daysBetween('2027-02-27', '2027-03-02'), 4);
  assert.strictEqual(U.daysBetween('2027-03-05', '2027-03-03'), 0);
  assert.strictEqual(U.formatRangeKo('2027-03-03', '2027-03-03'), '3월 3일(수)');
  assert.strictEqual(U.formatRangeKo('2027-03-03', '2027-03-05'), '3월 3일(수)–3월 5일(금) · 3일');
  assert.strictEqual(U.formatRangeKo('2027-03-03', ''), '3월 3일(수)');
  assert.strictEqual(U.formatRangeKo('', '2027-03-03'), '');
});

test('chosung·matchStudent: 이름·초성·학번 앞자리', () => {
  assert.strictEqual(U.chosung('김가온'), 'ㄱㄱㅇ');
  assert.strictEqual(U.chosung('A김1'), 'Aㄱ1');
  const s = { name: '김가온', studentNo: '10305' };
  const rows = [['가온', true], ['ㄱㄱㅇ', true], ['ㅇㄱ', false], ['ㄱ', true], ['103', true], ['305', false], ['김 가', true], ['이', false], ['', false], ['  ', false]];
  rows.forEach(([q, want]) => assert.strictEqual(U.matchStudent(q, s), want, '"' + q + '"'));
  assert.strictEqual(U.matchStudent('가', { name: '박다솜' }), false, '학번이 없어도 오류 없음');
});

test('seatSelect: single·swap, 같은 칸 다시 누르면 해제, 세 번째는 새로 시작', () => {
  let st = { picked: [] };
  let r = U.seatSelect(st, '1,1', 'single');
  assert.deepStrictEqual(plain(r), { picked: ['1,1'], done: true });
  r = U.seatSelect(r, '1,2', 'single');
  assert.deepStrictEqual(plain(r), { picked: ['1,2'], done: true });
  r = U.seatSelect({ picked: [] }, 'a', 'swap');
  assert.deepStrictEqual(plain(r), { picked: ['a'], done: false });
  r = U.seatSelect(r, 'b', 'swap');
  assert.deepStrictEqual(plain(r), { picked: ['a', 'b'], done: true });
  r = U.seatSelect(r, 'c', 'swap');
  assert.deepStrictEqual(plain(r), { picked: ['c'], done: false });
  r = U.seatSelect(r, 'c', 'swap');
  assert.deepStrictEqual(plain(r), { picked: [], done: false });
  assert.deepStrictEqual(plain(U.seatSelect(null, 'x', 'swap')), { picked: ['x'], done: false });
});

test('blockSpec: 전체·일부·없음(vocabulary.md 표기)', () => {
  const blocks = [{ seq: 1, start: '18:00', end: '20:00' }, { seq: 2, start: '20:00', end: '22:00' }, { seq: 3, start: '22:00', end: '24:00' }];
  assert.strictEqual(U.blockSpec(blocks, { all: true, seqs: [] }), 'ALL');
  assert.strictEqual(U.blockSpec(blocks, { all: false, seqs: [3, 1] }), '18:00-20:00;22:00-24:00');
  assert.strictEqual(U.blockSpec(blocks, { all: false, seqs: [] }), '');
  assert.strictEqual(U.blockSpec(blocks, null), '');
});

test('statusPill: 알 수 없는 상태는 오류, 알려진 상태는 모두 PILL 클래스가 Styles.html 에 있다', () => {
  assert.throws(() => UI.statusPill('nope'), /알 수 없는 상태/);
  const stylesRules = css.parseRules(css.styleText(css.readFile('src/ui/Styles.html')));
  const defined = css.definedClasses(stylesRules);
  const kinds = [...script.slice(script.indexOf('var PILL'), script.indexOf('/* ─────')).matchAll(/\w+: \['([\w-]+)',/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 10, 'PILL 표를 읽지 못했다');
  kinds.forEach((c) => assert.ok(defined.has(c), c));
});

/* ───── 스타일 ───── */

const rules = css.parseRules(css.styleText(css.readFile('src/ui/Styles.html')));
const tokens = css.rootTokens(rules);

test('컴포넌트가 쓰는 class 는 모두 Styles.html 에 정의되어 있다', () => {
  const defined = css.definedClasses(rules);
  const used = new Set(css.usedClasses(html));
  // el(..., {class: ...}) 밖에서 쓰는 이름: className 문자열
  ['chip', 'chips', 'segmented', 'seg', 'sheet', 'sheet-scrim', 'sheet-body', 'sheet-actions', 'toast', 'empty', 'picker',
    'picker-list', 'picker-item', 'picker-chosen', 'picker-name', 'seatgrid', 'seatgrid-wrap', 'seat-cell', 'seat-no', 'seat-text',
    'seat-fixed', 'seat-gap', 'range', 'range-summary', 'vacant', 'sel', 'bad', 'on', 'field', 'hint', 'fix', 'invalid'].forEach((c) => used.add(c));
  const missing = [...used].filter((c) => !defined.has(c));
  assert.deepStrictEqual(missing, []);
});

test('누르는 칸(.chip·.seg·.picker-item·.seat-cell)은 높이 48px 이상', () => {
  ['.chip', '.seg', '.picker-item', '.seat-cell'].forEach((sel) => {
    const d = css.declsFor(rules, sel);
    assert.ok(css.px(d['min-height'], tokens) >= 48, sel + ' min-height = ' + d['min-height']);
  });
  assert.ok(css.px(css.declsFor(rules, '.chip')['min-width'], tokens) >= 48);
  assert.ok(css.px(css.declsFor(rules, '.seatgrid td')['height'], tokens) >= 48);
});

test('선택됨은 색만으로 알리지 않는다(✓ 글자·굵게·테두리): .chip.on .seg.on .seat-cell.sel', () => {
  assert.ok(css.declsFor(rules, '.chip.on::before').content);
  assert.ok(css.declsFor(rules, '.seg.on::before').content);
  assert.ok(css.declsFor(rules, '.seat-cell.sel .seat-no::before').content);
  assert.ok(/3px/.test(css.declsFor(rules, '.seat-cell.sel').border));
});

test('좌석 격자는 상자 안에서만 가로로 민다(overflow-x:auto), 시트는 글자 대비·안전 영역을 지킨다', () => {
  assert.strictEqual(css.declsFor(rules, '.seatgrid-wrap')['overflow-x'], 'auto');
  assert.ok(/safe-area-inset-bottom/.test(css.declsFor(rules, '.sheet').padding));
  const ratio = (a, b) => css.contrast(css.parseColor(css.resolveVars(a, tokens)), css.parseColor(css.resolveVars(b, tokens)));
  [['.toast.ok', 'color', 'background'], ['.toast.warn', 'color', 'background'], ['.toast.info', 'color', 'background']].forEach(([sel, fg, bg]) => {
    const d = css.declsFor(rules, sel);
    assert.ok(ratio(d[fg], d[bg]) >= 4.5, sel);
  });
  assert.ok(ratio(css.declsFor(rules, '.seat-cell.vacant').color, css.declsFor(rules, '.seat-cell.vacant').background) >= 4.5, '공석 칸');
  assert.ok(ratio(css.declsFor(rules, '.range-summary').color, '#ffffff') >= 4.5);
});

test('시트 두 번 탭 방지: 열린 직후 350ms는 시트 안 버튼 클릭을 무시하고(경계 포함), bottomSheet 의 모든 버튼이 이 판정을 거친다', () => {
  assert.strictEqual(U.SHEET_GUARD_MS, 350);
  const t0 = 1000000;
  assert.strictEqual(U.sheetClickAllowed(t0, t0), false, '열자마자');
  assert.strictEqual(U.sheetClickAllowed(t0, t0 + 349), false);
  assert.strictEqual(U.sheetClickAllowed(t0, t0 + 350), true, '350ms 뒤');
  assert.strictEqual(U.sheetClickAllowed(t0, t0 + 5000), true);
  assert.strictEqual(U.sheetClickAllowed(0, t0), true, '아직 안 열렸으면(openedAt 0) 막지 않는다');
  const fn = html.slice(html.indexOf('UI.bottomSheet = function'), html.indexOf('UI.confirmSheet = function'));
  assert.ok(fn.indexOf('util.sheetClickAllowed(openedAt, Date.now())') > 0 && fn.indexOf('openedAt = Date.now()') > 0, 'open()이 시각을 남기고 버튼이 판정을 거친다');
  assert.ok(fn.indexOf('.map(makeBtn)') < 0, '시트 버튼을 가드 없이 만들지 않는다');
});
