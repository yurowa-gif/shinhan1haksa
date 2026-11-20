/**
 * 실제 화면 미리보기(D, 5단계 확인 체크리스트용): src/ui/*.html 실제 화면을 가짜 서버(tests/helpers/gas-fakes.js, 메모리 시트)에 이어 붙여
 * 크로미움으로 띄운다. 정적 시안(stage*-screens.js)이 아니라 **main 코드 그대로**의 화면이고, 숫자·이름은 가짜 데이터다.
 * 실행하는 곳은 design/preview/stage5-real.js 같은 시나리오 스크립트(out/은 Git에 올리지 않는다).
 *
 *   const { makeApp, openPage } = require('./real-screens.js');
 *   const app = makeApp({ now: '2027-03-15T10:00:00', seed: (env) => {...} });
 *   const s = await openPage(browser, app, { email: 'test.admin@example.com', query: 'page=calendar', size: { w: 360, h: 800 } });
 *   await s.page.click('text=일정 추가'); await s.shot('calendar-add');   // → out/real/<이름>-360.png
 *
 * 서버 호출은 google.script.run 자리에 놓은 다리(__gasCall)가 env.call(email, 함수, …인자)로 보낸다. 같은 경계(인자·반환값 JSON)라 권한 검사도 그대로 돈다.
 */
const fs = require('fs');
const path = require('path');
const { createGasEnv } = require('../../tests/helpers/gas-fakes');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'real');
const APP_URL = 'https://script.google.com/macros/s/FAKE/exec';

/** Apps Script 템플릿(<?= ?> 이스케이프, <?!= ?> 그대로, <? ?> 코드)을 풀어 HTML 문자열로 */
function evalTemplate(src, vars, include) {
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let code = 'var __o=[];with(__v){';
  let last = 0;
  const re = /<\?(!?=)?([\s\S]*?)\?>/g;
  let m;
  while ((m = re.exec(src))) {
    code += '__o.push(' + JSON.stringify(src.slice(last, m.index)) + ');';
    if (m[1] === '=') code += '__o.push(__esc(' + m[2] + '));';
    else if (m[1] === '!=') code += '__o.push(String(' + m[2] + '));';
    else code += m[2] + '\n';
    last = re.lastIndex;
  }
  code += '__o.push(' + JSON.stringify(src.slice(last)) + ');}return __o.join("");';
  return new Function('__v', '__esc', code)(Object.assign({ include }, vars), esc);
}

function readUi(file) { return fs.readFileSync(path.join(ROOT, 'src', String(file) + '.html'), 'utf8'); }

/** 가짜 서버 + 화면 만들기. seed(env)가 가짜 데이터를 채운다(기본: 1~4단계 + 시험 계정) */
function makeApp(opts) {
  opts = opts || {};
  const OWNER = 'owner@example.com';
  const env = createGasEnv({ owner: OWNER, now: opts.now || '2027-03-15T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: 'test.teacher@example.com', TEST_HOMEROOM_EMAIL: 'test.homeroom@example.com', TEST_STUDENT_EMAIL: 'test.student@example.com', TEST_PARENT_EMAIL: 'test.parent@example.com' });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  ['seedFakeStage1', 'seedFakeStage2', 'seedFakeStage3', 'seedFakeStage4'].forEach((fn) => env.asOwner((c) => { if (typeof c[fn] === 'function') c[fn](); }));
  env.asOwner((c) => { c.addUser('test.attendance@example.com', '시험 출결', 'attendance'); c.addUser('test.duty@example.com', '시험 근무표', 'duty_manager'); c.addUser('test.admin@example.com', '시험 관리자', 'admin'); });
  if (opts.seed) opts.seed(env);
  return { env, OWNER };
}

/** 쿼리(page=…&tab=…)에 맞는 화면 HTML을 실제 doGet이 만든 값으로 풀어 돌려준다 */
function pageHtml(app, email, query) {
  const parameter = Object.fromEntries(new URLSearchParams(query || ''));
  const out = app.env.as(email, (c) => {
    const o = c.doGet({ parameter });
    return { content: o._content, vars: o._vars, title: o._title, meta: Object.assign({}, o._meta), home: (r) => c.homeFileFor_(r) };
  });
  const include = (f) => readUi(f);
  const vars = Object.assign({}, out.vars, { homeFileFor_: (r) => 'ui/home_' + r, ROLES: ['admin', 'attendance', 'hall_teacher', 'homeroom', 'duty_manager', 'student', 'parent'] });
  // 홈 조각 이름은 서버 규칙(homeFileFor_)이 정한다: 같은 규칙을 env.as 안에서 한 번 물어 둔다
  vars.homeFileFor_ = (r) => app.env.as(email, (c) => c.homeFileFor_(r));
  // 서버가 addMetaTag로 붙이는 태그(viewport 등)를 실제 Apps Script처럼 머리에 넣는다(없으면 휴대폰 흉내에서 980px 화면이 된다)
  const metas = Object.keys(out.meta || {}).map((k) => '<meta name="' + k + '" content="' + String(out.meta[k]).replace(/"/g, '&quot;') + '">').join('');
  return metas + evalTemplate(out.content, vars, include);
}

/**
 * 크로미움 페이지를 열어 실제 화면을 띄운다. 반환 {page, shot(name), close()}.
 * email = 접속자(가짜 계정), query = 주소 뒤 쿼리('page=calendar&tab=month'), size = {w,h}
 */
async function openPage(browser, app, o) {
  fs.mkdirSync(OUT, { recursive: true });
  const size = o.size || { w: 360, h: 800 };
  const state = { email: o.email };
  const page = await browser.newPage(Object.assign({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1, locale: 'ko-KR' }, o.context || {}));   // context: 휴대폰 흉내(isMobile·hasTouch) 등
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (o.onPage) o.onPage(page);   // 불러오기 전에 붙일 것(콘솔 오류 듣기 등)
  // 시계: 가짜 서버 시계와 같게(화면 쪽 new Date()도 같은 날)
  const nowIso = (app.env.now && app.env.now.iso) || null;
  await page.route(APP_URL + '**', (route) => {
    const u = new URL(route.request().url());
    const html = pageHtml(app, state.email, u.search.replace(/^\?/, ''));
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.exposeFunction('__gasCall', (fn, argsJson) => {
    try {
      const v = app.env.call(state.email, fn, ...JSON.parse(argsJson));
      return { ok: true, v: JSON.stringify(v === undefined ? null : v) };
    } catch (e) { return { ok: false, err: (e && e.message) || String(e) }; }
  });
  await page.addInitScript(() => {
    function runner(ok, fail) {
      return new Proxy({}, { get(_, name) {
        if (name === 'withSuccessHandler') return (f) => runner(f, fail);
        if (name === 'withFailureHandler') return (f) => runner(ok, f);
        if (name === 'withUserObject') return () => runner(ok, fail);
        return function () {
          const args = Array.prototype.slice.call(arguments);
          window.__gasCall(String(name), JSON.stringify(args)).then((r) => {
            if (r.ok) { if (ok) ok(JSON.parse(r.v)); } else if (fail) fail(new Error(r.err));
          });
        };
      } });
    }
    window.google = { script: { run: runner(null, null) } };
  });
  // 화면 쪽 new Date()도 가짜 서버와 같은 날로(옵션 clock:false면 실제 시계). 시계는 그 시각에서 흘러간다(멈추면 시트 두 번 누름 방지가 풀리지 않는다)
  if (!(o && o.clock === false) && app.env.nowIso) await page.clock.install({ time: new Date(app.env.nowIso() + '+09:00') }).catch(() => {});
  await page.goto(APP_URL + (o.query ? '?' + o.query : ''));
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(250);
  };
  await settle();
  return {
    page, errors, settle, state,
    async shot(name, shotOpts) {
      await settle();
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      if (!(shotOpts && shotOpts.fixed)) await page.setViewportSize({ width: size.w, height: Math.min(Math.max(size.h, h), 3600) });
      const file = path.join(OUT, name + '-' + size.w + '.png');
      await page.screenshot({ path: file });
      return file;
    },
    /** 화면 한 부분만 찍는다(locator가 가리키는 요소). 긴 화면에서 확인할 곳만 보이게 */
    async shotEl(name, locator) {
      await settle();
      const file = path.join(OUT, name + '-' + size.w + '.png');
      await locator.screenshot({ path: file });
      return file;
    },
    /** 맨 위부터 locator 요소의 아래 끝까지 찍는다(머리·달력·표 같은 윗부분) */
    async shotTop(name, locator) {
      await settle();
      const box = await locator.boundingBox();
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: size.w, height: Math.min(Math.max(size.h, h), 3600) });
      const b2 = await locator.boundingBox();
      const file = path.join(OUT, name + '-' + size.w + '.png');
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size.w, height: Math.ceil((b2 || box).y + (b2 || box).height + 8) } });
      return file;
    },
    async close() { await page.close(); }
  };
}

module.exports = { makeApp, openPage, pageHtml, evalTemplate, OUT };
