/**
 * gas-fakes: Apps Script 서비스를 메모리 안에서 흉내 내는 통합 테스트 도구(소유: RULES 세션, R4).
 *
 *   const { createGasEnv } = require('../helpers/gas-fakes');
 *   const env = createGasEnv({ owner: 'owner@example.com', now: '2027-03-02T17:00:00' });
 *   env.asOwner(() => env.ctx.setup());                 // 편집기에서 소유자가 실행한 것처럼
 *   env.seedFake();                                     // setup + seedFakeData (+ 선택: seedFakeStage1)
 *   env.as('fake.teacher1@example.com', () => env.ctx.getHomeData('hall_teacher'));   // 웹앱 접속자로 한 번 실행
 *   env.rows('audit_log')                               // 시트 행을 객체로(Db.gs readAll_과 같은 모양, _row 없음)
 *
 * - src/**\/*.gs 를 vm 하나에 올린다(Apps Script처럼 전역 공간 하나). 서비스는 아래 가짜만 있다.
 * - env.as / env.asOwner 한 번 = 서버 실행 한 번. 실행마다 이름이 '_'로 시작하는 최상위 var(_dbMemo, _authMemo,
 *   _lockDepth …)를 처음 값으로 되돌린다(Apps Script는 google.script.run 호출마다 전역을 새로 만든다).
 * - 시계: 인자 없는 new Date()·Date.now()는 env.now(KST 'yyyy-MM-ddTHH:mm:ss')를 쓴다. env.setNow / env.advance(분)로 바꾼다.
 *   CacheService의 유효 시간도 이 시계로 계산한다.
 * - Utilities.formatDate는 'Asia/Seoul'(+09:00)과 'UTC'만 받는다. 실행 시간대(TZ)와 무관하다.
 * - Utilities.getUuid는 정해진 순서의 가짜 UUID(실행마다 같은 결과).
 * - 시트 값은 넣은 그대로 저장한다(자동 형 변환 없음). env.sheetValues(…)로 원래 2차원 배열도 볼 수 있다.
 * - 흉내 내지 않는 서비스(DriveApp, UrlFetchApp, ScriptApp.getOAuthToken 등)를 부르면 '[gas-fakes] …' 오류가 난다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, listFiles } = require('./harness');

const KST_OFFSET_MS = 9 * 3600 * 1000;

/** KST 'yyyy-MM-ddTHH:mm:ss' → UTC 밀리초 */
function kstToMs(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(iso);
  if (!m) throw new Error('[gas-fakes] now 형식은 yyyy-MM-ddTHH:mm:ss(KST): ' + iso);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - KST_OFFSET_MS;
}

function pad(n, w) { return String(n).padStart(w || 2, '0'); }

/** Utilities.formatDate 흉내: yyyy MM dd HH mm ss SSS E(요일 영문 3자) 와 '…' 따옴표 글자 */
function formatDate(date, tz, fmt) {
  const off = tz === 'Asia/Seoul' || tz === 'GMT+9' || tz === 'GMT+09:00' ? KST_OFFSET_MS
    : tz === 'UTC' || tz === 'GMT' || tz === 'Etc/UTC' ? 0 : null;
  if (off === null) throw new Error('[gas-fakes] formatDate 시간대는 Asia/Seoul·UTC만: ' + tz);
  if (!date || typeof date.getTime !== 'function' || isNaN(date.getTime())) throw new Error('[gas-fakes] formatDate: 날짜가 아님');
  const d = new Date(date.getTime() + off);
  const parts = {
    yyyy: pad(d.getUTCFullYear(), 4), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()),
    HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()), SSS: pad(d.getUTCMilliseconds(), 3),
    E: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  };
  let out = '';
  for (let i = 0; i < fmt.length;) {
    if (fmt[i] === "'") {
      const j = fmt.indexOf("'", i + 1);
      if (j < 0) throw new Error('[gas-fakes] formatDate 따옴표가 닫히지 않음: ' + fmt);
      out += j === i + 1 ? "'" : fmt.slice(i + 1, j);
      i = j + 1;
      continue;
    }
    const tok = ['yyyy', 'SSS', 'MM', 'dd', 'HH', 'mm', 'ss', 'E'].find((t) => fmt.startsWith(t, i));
    if (tok) { out += parts[tok]; i += tok.length; continue; }
    if (/[A-Za-z]/.test(fmt[i])) throw new Error('[gas-fakes] formatDate가 모르는 패턴: ' + fmt[i] + ' in ' + fmt);
    out += fmt[i++];
  }
  return out;
}

function notFaked(name) {
  return function () { throw new Error('[gas-fakes] 흉내 내지 않는 기능: ' + name); };
}

/* ───────── SpreadsheetApp ───────── */

const FORMAT_NOOPS = ['setNumberFormat', 'setFontWeight', 'setFontSize', 'setFontFamily', 'setBorder',
  'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap', 'setBackground', 'setFontColor', 'setNumberFormats',
  'setWraps', 'merge', 'setNote'];

class FakeSheet {
  constructor(ss, name, id) {
    this._ss = ss; this._name = name; this._id = id;
    this._data = [];          // [row][col] 0부터
    this._maxRows = 1000; this._maxCols = 26;
    this._frozen = 0;
  }
  getName() { return this._name; }
  setName(n) { this._name = String(n); return this; }
  getSheetId() { return this._id; }
  getParent() { return this._ss; }
  getMaxRows() { return this._maxRows; }
  getMaxColumns() { return this._maxCols; }
  getLastRow() {
    for (let r = this._data.length - 1; r >= 0; r--) {
      if ((this._data[r] || []).some((v) => v !== '' && v !== null && v !== undefined)) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    let last = 0;
    this._data.forEach((row) => (row || []).forEach((v, c) => { if (v !== '' && v !== null && v !== undefined) last = Math.max(last, c + 1); }));
    return last;
  }
  insertRowsAfter(after, n) {
    if (after > this._maxRows) throw new Error('[gas-fakes] insertRowsAfter 범위 밖');
    this._data.splice(after, 0, ...Array.from({ length: n }, () => []));
    this._maxRows += n; return this;
  }
  insertColumnsAfter(after, n) { this._maxCols += n; return this; }
  setFrozenRows(n) { this._frozen = n; return this; }
  getFrozenRows() { return this._frozen; }
  setRowHeight() { return this; }
  setColumnWidth() { return this; }
  clear() { this._data = []; return this; }
  appendRow(values) {
    const r = this.getLastRow() + 1;
    if (r > this._maxRows) this._maxRows = r;
    this._cellsSet(r, 1, [values.slice()]);
    return this;
  }
  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') return this._rangeA1(a);
    const nr = c === undefined ? 1 : c, nc = d === undefined ? 1 : d;
    if (!(a >= 1 && b >= 1 && nr >= 1 && nc >= 1)) throw new Error('[gas-fakes] getRange 범위가 잘못됨: ' + [a, b, c, d].join(','));
    if (a + nr - 1 > this._maxRows || b + nc - 1 > this._maxCols) {
      throw new Error('범위의 좌표가 시트 크기를 벗어났습니다.(' + this._name + ' ' + [a, b, nr, nc].join(',') + ')');
    }
    return new FakeRange(this, a, b, nr, nc);
  }
  _rangeA1(a1) {
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1);
    if (!m) throw new Error('[gas-fakes] A1 표기만(예: A1:C3): ' + a1);
    const col = (s) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const r1 = +m[2], c1 = col(m[1]), r2 = m[4] ? +m[4] : r1, c2 = m[3] ? col(m[3]) : c1;
    return this.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
  }
  _cellsGet(r, c, nr, nc) {
    const out = [];
    for (let i = 0; i < nr; i++) {
      const row = this._data[r - 1 + i] || [];
      const line = [];
      for (let j = 0; j < nc; j++) { const v = row[c - 1 + j]; line.push(v === undefined || v === null ? '' : v); }
      out.push(line);
    }
    return out;
  }
  _cellsSet(r, c, values) {
    values.forEach((line, i) => {
      const ri = r - 1 + i;
      this._data[ri] = this._data[ri] || [];
      line.forEach((v, j) => { this._data[ri][c - 1 + j] = v; });
    });
    this._maxCols = Math.max(this._maxCols, c - 1 + Math.max(0, ...values.map((l) => l.length)));
  }
}

class FakeRange {
  constructor(sh, r, c, nr, nc) { this._sh = sh; this._r = r; this._c = c; this._nr = nr; this._nc = nc; }
  getRow() { return this._r; }
  getColumn() { return this._c; }
  getNumRows() { return this._nr; }
  getNumColumns() { return this._nc; }
  getSheet() { return this._sh; }
  getValues() { return this._sh._cellsGet(this._r, this._c, this._nr, this._nc); }
  getDisplayValues() { return this.getValues().map((l) => l.map(String)); }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this._nr || values.some((l) => !Array.isArray(l) || l.length !== this._nc)) {
      throw new Error('데이터의 행 또는 열 수가 범위와 일치하지 않습니다.(' + this._nr + 'x' + this._nc + ')');
    }
    this._sh._cellsSet(this._r, this._c, values);
    return this;
  }
  setValue(v) { return this.setValues(Array.from({ length: this._nr }, () => Array.from({ length: this._nc }, () => v))); }
  clear() { return this.setValue(''); }
  clearContent() { return this.clear(); }
}
FORMAT_NOOPS.forEach((m) => { FakeRange.prototype[m] = function () { return this; }; });

class FakeSpreadsheet {
  constructor(env, id, title) {
    this._env = env; this._id = id; this._title = title; this._sheets = []; this._tz = 'Asia/Seoul';
    this.insertSheet('Sheet1');
  }
  getId() { return this._id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this._id + '/edit'; }
  getName() { return this._title; }
  rename(n) { this._title = n; }
  setSpreadsheetTimeZone(tz) { this._tz = tz; }
  getSpreadsheetTimeZone() { return this._tz; }
  getSheets() { return this._sheets.slice(); }
  getSheetByName(n) { return this._sheets.find((s) => s._name === n) || null; }
  insertSheet(name) {
    const n = name === undefined ? 'Sheet' + (this._sheets.length + 1) : String(name);
    if (this.getSheetByName(n)) throw new Error('이름이 "' + n + '"인 시트가 이미 있습니다.');
    const sh = new FakeSheet(this, n, ++this._env._sheetSeq);
    this._sheets.push(sh);
    return sh;
  }
  deleteSheet(sh) {
    if (this._sheets.length <= 1) throw new Error('[gas-fakes] 마지막 시트는 지울 수 없습니다');
    this._sheets = this._sheets.filter((s) => s !== sh);
  }
}

/* ───────── 환경 ───────── */

/**
 * @param {Object} [opts]
 *   owner: 스크립트 소유자 이메일(기본 'owner@example.com')
 *   now: 시작 시각 KST 'yyyy-MM-ddTHH:mm:ss'(기본 '2027-03-02T17:00:00')
 *   files: 올릴 .gs 목록(기본 src 아래 모든 .gs)
 *   props: 처음 Script Properties
 */
function createGasEnv(opts) {
  opts = opts || {};
  const env = {
    owner: (opts.owner || 'owner@example.com').toLowerCase(),
    _nowMs: kstToMs(opts.now || '2027-03-02T17:00:00'),
    _sheetSeq: 0, _uuidSeq: 0, _ssSeq: 0,
    spreadsheets: {},             // id → FakeSpreadsheet
    scriptProps: Object.assign({}, opts.props || {}),
    userProps: {},
    cache: {},                    // key → {value, expires}
    mail: [],                     // MailApp.sendEmail 기록
    lock: { held: false, tries: 0, failNext: 0 },   // failNext = n: 다음 n번 tryLock 실패(다른 사람이 저장 중)
    user: { active: '', effective: '' }
  };
  const ctxTime = () => env._nowMs;

  const propsApi = (store) => ({
    getProperty: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setProperty(k, v) { store[k] = String(v); return this; },
    deleteProperty(k) { delete store[k]; return this; },
    getProperties: () => Object.assign({}, store),
    setProperties(o, deleteOthers) {
      if (deleteOthers) Object.keys(store).forEach((k) => delete store[k]);
      Object.keys(o).forEach((k) => { store[k] = String(o[k]); }); return this;
    },
    getKeys: () => Object.keys(store)
  });

  const cacheApi = (prefix) => {
    const live = (k) => {
      const e = env.cache[prefix + k];
      if (!e) return null;
      if (e.expires <= ctxTime()) { delete env.cache[prefix + k]; return null; }
      return e;
    };
    return {
      get: (k) => { const e = live(k); return e ? e.value : null; },
      put: (k, v, sec) => {
        if (String(v).length > 100 * 1024) throw new Error('[gas-fakes] CacheService 값은 100KB까지');
        env.cache[prefix + k] = { value: String(v), expires: ctxTime() + 1000 * Math.min(sec === undefined ? 600 : sec, 21600) };
      },
      remove: (k) => { delete env.cache[prefix + k]; },
      getAll: (keys) => { const o = {}; keys.forEach((k) => { const e = live(k); if (e) o[k] = e.value; }); return o; },
      putAll(o, sec) { Object.keys(o).forEach((k) => this.put(k, o[k], sec)); },
      removeAll: (keys) => keys.forEach((k) => delete env.cache[prefix + k])
    };
  };

  const services = {
    SpreadsheetApp: {
      openById: (id) => {
        const ss = env.spreadsheets[id];
        if (!ss) throw new Error('ID가 ' + id + '인 문서가 없거나 액세스할 권한이 없습니다.');
        return ss;
      },
      create: (title) => {
        const id = 'fake-ss-' + pad(++env._ssSeq, 3);
        env.spreadsheets[id] = new FakeSpreadsheet(env, id, String(title));
        return env.spreadsheets[id];
      },
      getActiveSpreadsheet: () => null,
      flush: () => {}
    },
    PropertiesService: {
      getScriptProperties: () => propsApi(env.scriptProps),
      getUserProperties: () => propsApi(env.userProps),
      getDocumentProperties: () => null
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          env.lock.tries++;
          if (env.lock.failNext > 0) { env.lock.failNext--; return false; }
          env.lock.held = true; return true;  // 한 실행 안에서 다시 잡아도 성공(Apps Script와 같음)
        },
        waitLock(ms) { if (!this.tryLock(ms)) throw new Error('잠금 시간이 초과되었습니다.'); },
        releaseLock: () => { env.lock.held = false; },
        hasLock: () => env.lock.held
      }),
      getUserLock: notFaked('LockService.getUserLock'),
      getDocumentLock: notFaked('LockService.getDocumentLock')
    },
    CacheService: {
      getScriptCache: () => cacheApi('script:'),
      getUserCache: () => cacheApi('user:' + env.user.active + ':'),
      getDocumentCache: () => null
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => env.user.active }),
      getEffectiveUser: () => ({ getEmail: () => env.user.effective }),
      getTemporaryActiveUserKey: () => (env.user.active ? 'tmpkey-' + Buffer.from(env.user.active).toString('hex').slice(0, 16) : ''),
      getScriptTimeZone: () => 'Asia/Seoul'
    },
    Utilities: {
      getUuid: () => {
        const n = ++env._uuidSeq;
        return '00000000-0000-4000-8000-' + pad(n.toString(16), 12);
      },
      formatDate: (d, tz, fmt) => formatDate(d, tz, fmt),
      base64Encode: (s) => Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64'),
      base64EncodeWebSafe: (s) => Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)),
      base64DecodeWebSafe: (s) => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).map((b) => (b > 127 ? b - 256 : b)),
      sleep: () => {},
      newBlob: notFaked('Utilities.newBlob')
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' }),
      getOAuthToken: notFaked('ScriptApp.getOAuthToken')
    },
    HtmlService: {
      createHtmlOutput: (html) => fakeHtmlOutput(String(html || '')),
      createHtmlOutputFromFile: (file) => fakeHtmlOutput(readUi(file)),
      createTemplateFromFile: (file) => {
        const t = { _file: file, _source: readUi(file) };
        t.evaluate = () => fakeHtmlOutput(t._source, Object.assign({}, t));
        return t;
      },
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' }
    },
    MailApp: {
      sendEmail: function () { env.mail.push(Array.prototype.slice.call(arguments)); },
      getRemainingDailyQuota: () => 100
    },
    Logger: { log: () => {} },
    DriveApp: new Proxy({}, { get: (_, k) => notFaked('DriveApp.' + String(k)) }),
    UrlFetchApp: new Proxy({}, { get: (_, k) => notFaked('UrlFetchApp.' + String(k)) })
  };

  function readUi(file) {
    const p = path.join(ROOT, 'src', String(file) + '.html');
    if (!fs.existsSync(p)) throw new Error('[gas-fakes] HTML 파일 없음: ' + file);
    return fs.readFileSync(p, 'utf8');
  }
  function fakeHtmlOutput(content, vars) {
    const out = {
      _content: content, _vars: vars || {}, _title: '', _meta: {},
      getContent: () => out._content,
      setTitle: (t) => { out._title = t; return out; },
      getTitle: () => out._title,
      addMetaTag: (k, v) => { out._meta[k] = v; return out; },
      setXFrameOptionsMode: () => out,
      setSandboxMode: () => out,
      append: (s) => { out._content += s; return out; }
    };
    return out;
  }

  const ctx = vm.createContext(Object.assign({ console: { log() {}, warn() {}, error() {}, info() {} } }, services));
  ctx.__now = ctxTime;
  vm.runInContext(
    '(function(){ var R = Date;' +
    ' function D(a,b,c,d,e,f,g){ if (!(this instanceof D)) return new R(__now()).toString();' +
    '   switch (arguments.length) { case 0: return new R(__now()); case 1: return new R(a); case 2: return new R(a,b);' +
    '   case 3: return new R(a,b,c); case 4: return new R(a,b,c,d); case 5: return new R(a,b,c,d,e);' +
    '   case 6: return new R(a,b,c,d,e,f); default: return new R(a,b,c,d,e,f,g); } }' +
    ' D.prototype = R.prototype; D.UTC = R.UTC; D.parse = R.parse; D.now = function(){ return __now(); };' +
    ' globalThis.Date = D; })();', ctx, { filename: 'gas-fakes-clock.js' });

  const files = opts.files || listFiles('src', ['.gs']);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

  // 실행마다 되돌릴 전역: 이름이 '_'로 시작하는 최상위 var
  const resettable = {};
  for (const k of Object.keys(ctx)) {
    if (k.charAt(0) === '_' && k !== '__now' && typeof ctx[k] !== 'function') resettable[k] = JSON.stringify(ctx[k]);
  }

  function newExecution(active, effective) {
    Object.keys(resettable).forEach((k) => { ctx[k] = JSON.parse(resettable[k]); });
    env.user = { active: (active || '').toLowerCase(), effective: (effective || '').toLowerCase() };
    env.lock.held = false;
  }

  Object.assign(env, {
    ctx,
    /** 웹앱("나로 실행")으로 email이 접속해 서버 함수를 한 번 실행한다. 실행 계정(effective)은 소유자. */
    as(email, fn) { newExecution(email, env.owner); try { return fn(ctx); } finally { env.lock.held = false; } },
    /** 소유자가 편집기에서 실행(active = effective = 소유자). */
    asOwner(fn) { newExecution(env.owner, env.owner); try { return fn(ctx); } finally { env.lock.held = false; } },
    /** as()와 같지만 던진 오류를 돌려준다(없으면 null). */
    errorOf(email, fn) { try { env.as(email, fn); return null; } catch (e) { return e; } },
    setNow(iso) { env._nowMs = kstToMs(iso); },
    advance(minutes) { env._nowMs += minutes * 60000; },
    nowIso() { return formatDate(new Date(env._nowMs), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss"); },
    /** kind('db'|'counsel'|'config')의 스프레드시트(setup 전이면 null) */
    file(kind) {
      const prop = { db: 'DB_ID', counsel: 'COUNSEL_ID', config: 'CONFIG_ID' }[kind || 'db'];
      const id = env.scriptProps[prop];
      return id ? env.spreadsheets[id] : null;
    },
    sheetValues(name, kind) {
      const ss = env.file(kind);
      const sh = ss && ss.getSheetByName(name);
      return sh ? sh.getDataRange().getValues() : null;
    },
    /** 탭 행을 객체 배열로(1행 = 머리글, 빈 행 제외) */
    rows(name, kind) {
      const v = env.sheetValues(name, kind);
      if (!v || !v.length) return [];
      const head = v[0].map(String);
      return v.slice(1).filter((r) => r.some((c) => c !== '' && c !== null))
        .map((r) => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] === undefined ? '' : r[i]; }); return o; });
    },
    /** audit_log의 action 목록(선택: 접두어로 거르기) */
    auditActions(prefix) {
      return env.rows('audit_log').map((r) => r.action).filter((a) => !prefix || String(a).indexOf(prefix) === 0);
    },
    /**
     * 가짜 데이터로 채운다: setup() → seedFakeData() (+ stage1이면 seedFakeStage1()).
     * 시험 계정(학생 1번·학부모·학사 교사·담임)은 이메일을 정해 Script Properties에 넣는다.
     */
    seedFake(o) {
      o = o || {};
      const acc = Object.assign({
        TEST_STUDENT_EMAIL: 'test.student@example.com', TEST_PARENT_EMAIL: 'test.parent@example.com',
        TEST_TEACHER_EMAIL: 'test.teacher@example.com', TEST_HOMEROOM_EMAIL: 'test.homeroom@example.com'
      }, o.accounts || {});
      Object.keys(acc).forEach((k) => { if (acc[k]) env.scriptProps[k] = acc[k]; });
      env.asOwner((c) => c.setup());
      env.asOwner((c) => c.seedFakeData());
      if (o.stage1 && typeof ctx.seedFakeStage1 === 'function') env.asOwner((c) => c.seedFakeStage1());
      return acc;
    }
  });
  return env;
}

module.exports = { createGasEnv, formatDate, kstToMs };
