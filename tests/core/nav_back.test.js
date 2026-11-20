/** C39 안드로이드 뒤로 가기: Client.html의 Nav(google.script.history 기록)를 가짜 기록 저장소로 움직여 본다. 가짜 환경에서 가능한 만큼 — 실제 휴대폰 확인은 점검표 A2. */
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { test } = require('../helpers/harness');

const SRC = fs.readFileSync(path.join(__dirname, '../../src/ui/Client.html'), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, '');

/** 가짜 브라우저 기록: push는 항목을 더하고 back은 앞 항목으로 가서 handler를 부른다(실제 Apps Script·브라우저와 같은 순서) */
function makeWorld(withHistory) {
  const entries = [{ state: null }];
  let at = 0, handler = null;
  const win = { history: { back() { if (at > 0) { at -= 1; if (handler) handler({ state: entries[at].state || {} }); } } } };
  if (withHistory) win.google = { script: { history: { push(s) { entries.splice(at + 1); entries.push({ state: s }); at += 1; }, replace(s) { entries[at].state = s; }, setChangeHandler(f) { handler = f; } } } };
  const opened = [];
  win.UI = { bottomSheet(opts) {
    let el = null;
    const api = { open() { el = true; opened.push(api); return api; }, close() { if (!el) return; el = null; opened.splice(opened.indexOf(api), 1); }, isOpen: () => !!el };
    return api;
  } };
  const ctx = vm.createContext(Object.assign({ window: win, console, setTimeout, document: {} }, win));
  vm.runInContext(SRC + '\nthis.Nav = Nav;', ctx);
  const nav = ctx.Nav;
  nav._state = ((orig) => () => JSON.parse(JSON.stringify(orig())))(nav._state);   // 다른 vm 영역의 객체라 deepStrictEqual이 되도록 평평하게
  return { Nav: ctx.Nav, win, ctx, entries, at: () => at, opened, UI: ctx.UI, back: () => win.history.back() };
}

test('Nav.go는 기록을 하나씩 남기고, 뒤로 가기(기록 되돌림)가 bind한 함수에 앞 화면 이름을 준다', () => {
  const w = makeWorld(true), seen = [];
  w.Nav.bind((k) => seen.push(k));
  w.Nav.go('outs');
  w.Nav.go('outs');   // 같은 화면은 기록을 더하지 않는다
  w.Nav.go('month');
  assert.deepStrictEqual([w.entries.length, w.at()], [3, 2]);
  w.back();
  w.back();
  assert.deepStrictEqual(seen, ['outs', '']);
  assert.deepStrictEqual(w.Nav._state(), { key: '', depth: 0, sheets: 0 });
  w.back();   // 첫 기록에서는 더 안 간다(앱 밖으로 나가는 건 브라우저 몫)
  assert.deepStrictEqual(seen, ['outs', '']);
});

test('Nav.back(fb): 기록이 있으면 브라우저 뒤로 가기와 같이 움직이고 fb는 부르지 않는다, 기록이 없으면 fb를 바로 부른다', () => {
  const w = makeWorld(true), seen = [];
  let fbCalls = 0;
  w.Nav.bind((k) => seen.push(k));
  w.Nav.back(() => { fbCalls += 1; });
  assert.strictEqual(fbCalls, 1, '기록이 없으면 fb');
  w.Nav.go('outs');
  w.Nav.back(() => { fbCalls += 1; });
  assert.deepStrictEqual([seen, w.Nav._state().depth], [[''], 0]);
});

test('바텀 시트: 열면 기록을 남기고, 뒤로 가기는 시트만 닫는다. 버튼으로 닫으면 남긴 기록도 걷어 기록이 쌓이지 않는다', () => {
  const w = makeWorld(true), seen = [];
  w.Nav.bind((k) => seen.push(k));
  w.Nav.go('outs');
  const a = w.UI.bottomSheet({}).open();
  assert.deepStrictEqual([w.entries.length, w.Nav._state().sheets], [3, 1]);
  w.back();
  assert.deepStrictEqual([a.isOpen(), w.Nav._state().key, seen], [false, 'outs', []], '시트만 닫히고 화면은 그대로');
  const b = w.UI.bottomSheet({}).open();
  b.close();   // 버튼으로 닫기
  assert.deepStrictEqual([b.isOpen(), w.Nav._state()], [false, { key: 'outs', depth: 1, sheets: 0 }], '시트 기록이 걷혔다');
  const c = w.UI.bottomSheet({}).open(), d = w.UI.bottomSheet({}).open();   // 시트 위의 시트
  w.back();
  assert.deepStrictEqual([c.isOpen(), d.isOpen()], [true, false], '뒤로 가기는 맨 위 시트부터');
  w.back();
  assert.deepStrictEqual([c.isOpen(), w.Nav._state().key], [false, 'outs']);
});

test('google.script.history가 없는 곳(편집기·시험)에서는 아무 일도 하지 않고 시트는 예전처럼 열고 닫힌다', () => {
  const w = makeWorld(false);
  let fb = 0;
  w.Nav.bind(() => { throw new Error('불리면 안 된다'); });
  w.Nav.go('outs');
  w.Nav.back(() => { fb += 1; });
  const s = w.UI.bottomSheet({}).open();
  assert.ok(s.isOpen());
  s.close();
  assert.deepStrictEqual([fb, s.isOpen(), w.entries.length], [1, false, 1]);
});

test('화면 파일 연결: 포털·학부모 홈·상담일지·시간표(교사)가 Nav.bind·Nav.go를 쓴다, 시트는 Components를 고치지 않고 Client에서 감싼다', () => {
  const ui = (f) => fs.readFileSync(path.join(__dirname, '../../src/ui', f + '.html'), 'utf8');
  for (const f of ['Portal', 'home_student', 'home_parent', 'screen_counsel', 'screen_timetable']) assert.ok(/Nav\.(bind|go|back)\(/.test(ui(f)), f);
  assert.ok(!/Nav\b/.test(ui('Components')), 'Components(디자인 소유)는 그대로');
});
