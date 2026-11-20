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

test('rowLink·cardClass(결정 85): 줄 링크는 href면 a, onclick이면 button이고 글자가 없으면 오류, 카드 종류는 todo·key만 상자 클래스를 붙인다', () => {
  // 브라우저가 없으니 Client.html 의 el 자리에 아주 작은 가짜를 둔다(태그·속성·이벤트만 기록)
  ctx.el = function (tag, attrs) { return { tag: tag, attrs: attrs || {}, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } }; };
  assert.throws(() => UI.rowLink({}), /text/);
  const a = UI.rowLink({ text: '출석부 열기', href: 'https://x/?page=sheet' });
  assert.deepStrictEqual([a.tag, a.attrs.class, a.attrs.href, a.attrs.text], ['a', 'row-link', 'https://x/?page=sheet', '출석부 열기']);
  let hit = 0;
  const b = UI.rowLink({ text: '월별 일정 열기', onclick: () => { hit++; } });
  assert.deepStrictEqual([b.tag, b.attrs.type, b.attrs.class], ['button', 'button', 'row-link']);
  b.listeners.click({});
  assert.strictEqual(hit, 1);
  assert.deepStrictEqual(['', 'todo', 'key', 'x', undefined].map((k) => UI.cardClass(k)), ['card', 'card todo', 'card key', 'card', 'card']);
  // Styles.html 에 .row-link .card.todo .card.key 가 있다
  const defined = css.definedClasses(css.parseRules(css.styleText(css.readFile('src/ui/Styles.html'))));
  ['row-link', 'todo', 'key'].forEach((c) => assert.ok(defined.has(c), c));
  delete ctx.el;
});

test('layoutHome(D15 ②): 맨 위 카드는 head, todo·key 카드는 할 일 열, 나머지는 참고 열로 옮기고(다시 만들지 않는다), 할 일이 없으면 한 줄 안내를 쓴다', () => {
  // 아주 작은 가짜 DOM: 자식 목록·class·appendChild·removeChild만
  function node(tag, attrs, kids) {
    const n = { tag, attrs: attrs || {}, children: [], parent: null,
      classList: { contains: (c) => String((n.attrs.class || '')).split(/\s+/).indexOf(c) >= 0 },
      appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = n; n.children.push(c); return c; },
      removeChild(c) { n.children.splice(n.children.indexOf(c), 1); c.parent = null; return c; } };
    (kids || []).forEach((k) => n.appendChild(k));
    return n;
  }
  ctx.el = node;
  const card = (cls, id) => node('div', { class: cls, id });
  const run = (cards) => { const root = node('div', {}); cards.forEach((c) => root.appendChild(c)); const r = UI.layoutHome(root); return { root, r }; };
  const a = card('card', 'today'), b = card('card todo', 'docs'), c = card('card', 'sheet'), d = card('card key', 'out'), e = card('card', 'seats');
  const { root, r } = run([a, b, c, d, e]);
  assert.deepStrictEqual(plain(r), { head: 1, main: 2, todo: 1, side: 2 });
  const [head, cols] = root.children;
  assert.strictEqual(head.attrs.class, 'home-head');
  assert.deepStrictEqual(head.children.map((x) => x.attrs.id), ['today']);
  const [mainBox, sideBox] = cols.children;
  assert.deepStrictEqual(mainBox.children.slice(1).map((x) => x.attrs.id), ['docs', 'out'], '할 일 열은 todo·key 카드가 원래 순서로');
  assert.strictEqual(mainBox.children[0].attrs.text, '해야 할 일 1건');
  assert.deepStrictEqual(sideBox.children.slice(1).map((x) => x.attrs.id), ['sheet', 'seats']);
  assert.strictEqual(b.parent, mainBox, '카드는 옮겨졌을 뿐 같은 노드');
  // 할 일이 하나도 없으면 한 줄 안내, 참고 카드가 없으면 참고 열을 만들지 않는다
  const z = run([card('card', 'today'), card('card key', 'out')]);
  const zMain = z.root.children[1].children[0];
  assert.strictEqual(zMain.children[0].attrs.text, '오늘 해야 할 일');
  assert.strictEqual(zMain.children[1].attrs.text, '지금 처리할 일이 없습니다.');
  assert.strictEqual(z.root.children[1].children.length, 1);
  // 오류·안내 줄(card가 아닌 것)은 맨 위
  const err = node('div', { class: 'error' });
  const y = run([err, card('card', 'today'), card('card', 'x')]);
  assert.deepStrictEqual(y.root.children[0].children.map((x) => x.attrs.class), ['error', 'card']);
  delete ctx.el;
});

test('layoutPortal(D15 ②): 맨 위 카드(이름)·안내 줄은 위에 두고 나머지를 왼쪽(할 일·OUT·출결) / 오른쪽(side 카드)으로 옮긴다, side가 없으면 그대로', () => {
  function node(tag, attrs, kids) {
    const n = { tag, attrs: attrs || {}, children: [], parent: null,
      classList: { contains: (c) => String((n.attrs.class || '')).split(/\s+/).indexOf(c) >= 0 },
      appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = n; n.children.push(c); return c; },
      removeChild(c) { n.children.splice(n.children.indexOf(c), 1); c.parent = null; return c; } };
    (kids || []).forEach((k) => n.appendChild(k));
    return n;
  }
  ctx.el = node;
  const card = (cls, id) => node('div', { class: cls, id });
  const root = node('div', {});
  ['card', 'notice warn', 'card todo', 'card key', 'card', 'card side', 'card side'].forEach((c, i) => root.appendChild(card(c, 'n' + i)));
  const r = UI.layoutPortal(root);
  assert.deepStrictEqual(plain(r), { head: 2, a: 3, b: 2 });
  const [h1, h2, cols] = root.children;
  assert.deepStrictEqual([h1.attrs.id, h2.attrs.id], ['n0', 'n1']);
  assert.strictEqual(cols.attrs.class, 'pt-cols');
  assert.deepStrictEqual(cols.children[0].children.map((x) => x.attrs.id), ['n2', 'n3', 'n4']);
  assert.deepStrictEqual(cols.children[1].children.map((x) => x.attrs.id), ['n5', 'n6']);
  const plainRoot = node('div', {});
  ['card', 'card todo', 'card'].forEach((c, i) => plainRoot.appendChild(card(c, 'p' + i)));
  assert.deepStrictEqual(plain(UI.layoutPortal(plainRoot)), { head: 1, a: 2, b: 0 });
  assert.strictEqual(plainRoot.children.length, 3, 'side가 없으면 손대지 않는다');
  delete ctx.el;
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
