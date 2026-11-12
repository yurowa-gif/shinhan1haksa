/**
 * gas-fakes: Apps Script 서비스를 메모리 안에서 흉내 내는 통합 테스트 도구(소유: RULES 세션, R4).
 *
 *   const { createGasEnv } = require('../helpers/gas-fakes');
 *   const env = createGasEnv({ owner: 'owner@example.com', now: '2027-03-02T17:00:00' });
 *   const acc = env.seedFake();                          // setup() + seedFakeData() (+ {stage1:true}면 seedFakeStage1())
 *
 *   // 공개 함수 권한 테스트(CODING 공통 완료 기준: 허용 1건 이상 + 거부 1건 이상)
 *   env.expectAllowed('fake.teacher1@example.com', 'getHomeData', 'hall_teacher');
 *   env.expectDenied('test.parent@example.com', 'student.view', 'getStudentSummary', otherStudentId);
 *
 *   env.call(email, '공개함수', ...인자)   // 화면의 google.script.run과 같은 경계(인자·반환값 JSON, Date·함수 금지, _ 함수 금지)
 *   env.as(email, (c) => c.내부함수_())   // 경계 없이 한 번 실행(내부 함수 확인용). c = 이번 실행의 전역
 *   env.asOwner((c) => c.setup())        // 소유자가 편집기에서 실행
 *   env.errorOf(email, fn)               // as()가 던진 오류(Node Error, 원래 것은 .original) 또는 null
 *   env.rows('audit_log'), env.auditActions('denied:'), env.sheetValues('students')
 *
 * 시험 계정(seedFake): test.student / test.parent / test.teacher(hall_teacher) / test.homeroom(1번 학생 반 담임)
 *   + 역할 하나씩만: test.admin / test.attendance / test.duty(duty_manager) (@example.com)
 *   + 가짜 교사 fake.teacher1~3, 소유자 owner@example.com(admin,hall_teacher)
 *   + 이번 기간 등록이 없는 학생 1명(acc.unenrolledStudentId) — 범위 밖 학생 거부 시험용
 *
 * 흉내의 규칙(실제 Apps Script와 맞춘 것)
 * - 실행 한 번(as·asOwner·call) = 새 vm 컨텍스트. src/**\/*.gs 전체를 다시 올린다(Apps Script는 호출마다 전역을 새로 만든다).
 *   let·const·RegExp·Map 전역도 처음 값이다. 시트·속성·캐시·시계·UUID 순번은 env에 있어 실행을 넘어 이어진다.
 *   함수를 바꿔 끼우는 시험은 그 실행의 콜백 안에서 한다.
 * - 시계: 인자 없는 new Date()·Date.now()는 env 시각(KST). env.setNow('yyyy-MM-ddTHH:mm:ss') / env.advance(분).
 *   CacheService 유효 시간도 이 시계로 센다(거부 기록 10분 제한 시험 가능).
 * - Utilities.formatDate는 'Asia/Seoul'·'UTC'만, 모르는 패턴은 오류. getUuid는 정해진 순서지만 앞 8자리가 서로 다르다.
 * - 시트: 일반 텍스트('@') 서식이 아닌 칸에 문자열을 쓰면 실제 시트처럼 날짜·시각(Date)·숫자·참거짓으로 바뀐다.
 *   Db.gs는 '@'를 먼저 걸어 문자열 그대로 남는다. 꺼낸 값은 복사본이다. 범위 밖·모양이 다른 setValues는 오류.
 * - LockService는 늘 얻을 수 있다. env.lock.failNext = n이면 다음 n번 실패("다른 사람이 저장 중" 시험).
 *   createGasEnv({strictLock:true}) 또는 env.strictLock = true면 락 없이 시트에 쓰는 순간 오류.
 * - Session: env.as(email)의 접속자 = email, 실행 계정 = 소유자("나로 실행"). email ''은 접속자 이메일을 못 받은 경우(PRD 6.1).
 * - DriveApp(O1 백업용 최소): getFileById·getFolderById·createFolder, 폴더 getFiles/createFile/getId/getName, 파일 makeCopy·setTrashed·isTrashed·
 *   getName·getId·getSharingAccess·setSharing·getEditors·getViewers, Access.PRIVATE/ANYONE_WITH_LINK, Permission.NONE/VIEW. 데이터는 env.drive({files, folders}).
 *   시험이 env.drive.addFile(name, {parent, sharing})로 파일을 만든다. 새 사본·파일이 공유된 채 생기는 상황: env.drive.copySharing = 'ANYONE_WITH_LINK'(링크),
 *   env.drive.copyViewers·copyEditors = ['x@…'](이름으로 추가된 사람, 폴더 공유 상속 흉내), 그 사람을 못 지우게: env.drive.stuckViewers = true, 지우다 오류: env.drive.throwOnRemove = true. setSharing은 링크만 바꾼다.
 *   ScriptApp 트리거(O1): getProjectTriggers·newTrigger(fn).timeBased().everyDays(1).atHour(h).create()·deleteTrigger. 기록은 env.triggers.
 * - 흉내 내지 않는 서비스(그 밖의 DriveApp 기능, UrlFetchApp, Utilities.newBlob, ScriptApp.getOAuthToken 등)는 '[gas-fakes] …' 오류.
 * - vm 안에서 만든 Date·배열은 Node 쪽과 다른 realm이다. assert.deepStrictEqual 전에 JSON 복사(plain)하거나 call()을 쓴다.
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
    if (fmt[i] === 'E') {
      let n = 0;
      while (fmt[i + n] === 'E') n++;
      out += n >= 4 ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] : parts.E;
      i += n;
      continue;
    }
    const tok = ['yyyy', 'SSS', 'MM', 'dd', 'HH', 'mm', 'ss'].find((t) => fmt.startsWith(t, i));
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

const FORMAT_NOOPS = ['setFontWeight', 'setFontSize', 'setFontFamily', 'setBorder',
  'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap', 'setBackground', 'setFontColor', 'setNumberFormats',
  'setWraps', 'merge', 'setNote'];

/**
 * 일반 텍스트('@') 서식이 아닌 칸에 문자열을 쓰면 실제 시트처럼 바꾼다(손으로 친 것처럼 해석):
 * 'yyyy-MM-dd' → 그날 KST 0시 Date, 'H:mm'·'HH:mm'(·':ss') → 1899-12-30 그 시각 Date, 숫자 모양 → Number,
 * 'TRUE'/'FALSE' → boolean. '0101234' 같은 앞자리 0도 숫자가 된다(101234).
 */
function coerceLikeSheets(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - KST_OFFSET_MS);
  }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s)) && +m[1] < 24 && +m[2] < 60) {
    return new Date(Date.UTC(1899, 11, 30, +m[1], +m[2], +(m[3] || 0)) - KST_OFFSET_MS);
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(true|false)$/i.test(s)) return s.toUpperCase() === 'TRUE';
  return v;
}

/** 실제 시트처럼 값 복사(Date는 새 객체로) */
function copyCell(v) {
  return v instanceof Date || Object.prototype.toString.call(v) === '[object Date]' ? new Date(v.getTime()) : v;
}

class FakeSheet {
  constructor(ss, name, id) {
    this._ss = ss; this._name = name; this._id = id;
    this._data = [];          // [row][col] 0부터
    this._fmt = [];           // [row][col] 숫자 서식('@' = 일반 텍스트)
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
    // 새 행은 바로 위 행의 서식을 물려받는다(실제 시트와 같음)
    const above = (this._fmt[after - 1] || []).slice();
    this._fmt.splice(after, 0, ...Array.from({ length: n }, () => above.slice()));
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
      for (let j = 0; j < nc; j++) { const v = row[c - 1 + j]; line.push(v === undefined || v === null ? '' : copyCell(v)); }
      out.push(line);
    }
    return out;
  }
  _formatAt(r, c) { return (this._fmt[r - 1] || [])[c - 1] || ''; }
  _setFormat(r, c, nr, nc, f) {
    for (let i = 0; i < nr; i++) {
      const ri = r - 1 + i;
      this._fmt[ri] = this._fmt[ri] || [];
      for (let j = 0; j < nc; j++) this._fmt[ri][c - 1 + j] = f;
    }
  }
  _cellsSet(r, c, values) {
    const env = this._ss._env;
    if (env.strictLock && !env.lock.held) {
      throw new Error('[gas-fakes] 락 없이 시트에 썼습니다(' + this._name + ' ' + r + '행). 쓰기는 withLock_ 안에서 합니다.');
    }
    values.forEach((line, i) => {
      const ri = r - 1 + i;
      this._data[ri] = this._data[ri] || [];
      line.forEach((v, j) => {
        this._data[ri][c - 1 + j] = this._formatAt(r + i, c + j) === '@' ? (v instanceof Date ? copyCell(v) : v) : copyCell(coerceLikeSheets(v));
      });
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
FakeRange.prototype.setNumberFormat = function (f) { this._sh._setFormat(this._r, this._c, this._nr, this._nc, String(f)); return this; };
FakeRange.prototype.getNumberFormat = function () { return this._sh._formatAt(this._r, this._c); };

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
    scriptProps: Object.keys(opts.props || {}).reduce((o, k) => { o[k] = String(opts.props[k]); return o; }, {}),
    strictLock: !!opts.strictLock,   // true면 락 없이 시트에 쓰면 오류
    userProps: {},
    cache: {},                    // key → {value, expires}
    mail: [],                     // MailApp.sendEmail 기록
    triggers: [],                 // ScriptApp 트리거 {id, fn, hour, everyDays}
    drive: null,                  // 아래에서 만든다
    lock: { held: false, tries: 0, failNext: 0 },   // failNext = n: 다음 n번 tryLock 실패(다른 사람이 저장 중)
    user: { active: '', effective: '' }
  };
  const ctxTime = () => env._nowMs;

  /* ───────── DriveApp(최소) ───────── */
  const drive = env.drive = { files: {}, folders: {}, seq: 0, copySharing: 'PRIVATE', copyViewers: [], copyEditors: [], stuckViewers: false, throwOnRemove: false, failCopy: null };
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  function makeFile(name, o) {
    const id = 'fake-file-' + pad(++drive.seq, 3);
    const f = { id, name: String(name), trashed: false, parent: o.parent || null, sharing: o.sharing || 'PRIVATE', editors: [], viewers: [], content: o.content || '', mime: o.mime || '' };
    drive.files[id] = f;
    return wrapFile(f);
  }
  function wrapFile(f) {
    return {
      _f: f,
      getId: () => f.id, getName: () => f.name, setName(n) { f.name = String(n); return this; },
      isTrashed: () => f.trashed, setTrashed(t) { f.trashed = !!t; return this; },
      getSharingAccess: () => f.sharing, getSharingPermission: () => 'NONE',
      setSharing(a) { f.sharing = a; return this; },   // 실제 Drive처럼 링크 공유만 바꾼다(이름으로 추가한 사람은 그대로)
      removeEditor(e) { if (drive.throwOnRemove) throw new Error('공유를 바꿀 수 없습니다(시험)'); const em = typeof e === 'string' ? e : e.getEmail(); if (!drive.stuckViewers) f.editors = f.editors.filter((x) => x !== em); return this; },
      removeViewer(e) { const em = typeof e === 'string' ? e : e.getEmail(); if (!drive.stuckViewers) f.viewers = f.viewers.filter((x) => x !== em); return this; },
      getEditors: () => f.editors.map((e) => ({ getEmail: () => e })), getViewers: () => f.viewers.map((e) => ({ getEmail: () => e })),
      getBlob: notFaked('File.getBlob'),
      getBlobText: () => f.content,
      getMimeType: () => f.mime,
      makeCopy(name, folder) {
        if (drive.failCopy && f.name.indexOf(drive.failCopy) >= 0) throw new Error('복사 실패(시험): ' + f.name);
        const c = makeFile(name, { parent: folder ? folder.getId() : null, sharing: drive.copySharing, content: f.content, mime: f.mime });
        c._f.viewers = drive.copyViewers.slice(); c._f.editors = drive.copyEditors.slice();   // 폴더 공유 상속 흉내: 이름으로 추가된 사람
        return c;
      }
    };
  }
  function makeFolder(name, o) {
    const id = 'fake-folder-' + pad(++drive.seq, 3);
    const d = { id, name: String(name), trashed: false, sharing: (o && o.sharing) || 'PRIVATE' };
    drive.folders[id] = d;
    return wrapFolder(d);
  }
  function wrapFolder(d) {
    return {
      getId: () => d.id, getName: () => d.name, isTrashed: () => d.trashed,
      getSharingAccess: () => d.sharing,
      getEditors: () => (d.editors || []).map((e) => ({ getEmail: () => e })), getViewers: () => (d.viewers || []).map((e) => ({ getEmail: () => e })),
      getFiles: () => iter(Object.keys(drive.files).map((k) => drive.files[k]).filter((f) => f.parent === d.id && !f.trashed).map(wrapFile)),
      createFile: (name, content, mime) => { const nf = makeFile(name, { parent: d.id, content: String(content), mime: mime || '', sharing: drive.copySharing }); nf._f.viewers = drive.copyViewers.slice(); nf._f.editors = drive.copyEditors.slice(); return nf; }
    };
  }
  drive.addFile = (name, o) => makeFile(name, o || {});
  drive.addFolder = (name, o) => makeFolder(name, o);
  drive.filesIn = (folderId) => Object.keys(drive.files).map((k) => drive.files[k]).filter((f) => f.parent === folderId);
  const driveApi = {
    Access: { PRIVATE: 'PRIVATE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', ANYONE: 'ANYONE', DOMAIN: 'DOMAIN' },
    Permission: { NONE: 'NONE', VIEW: 'VIEW', EDIT: 'EDIT' },
    getFileById(id) { const f = drive.files[id] || drive.spreadsheetFile(id); if (!f) throw new Error('해당 항목을 찾을 수 없습니다: ' + id); return f._f ? f : wrapFile(f); },
    getFolderById(id) { const d = drive.folders[id]; if (!d) throw new Error('해당 항목을 찾을 수 없습니다: ' + id); return wrapFolder(d); },
    createFolder: (name) => makeFolder(name)
  };
  // 스프레드시트 파일: 처음 열 때 드라이브 파일로 한 번 등록한다(이름 = 스프레드시트 이름)
  drive.spreadsheetFile = (id) => {
    const ss = env.spreadsheets[id];
    if (!ss) return null;
    if (!drive.files[id]) drive.files[id] = { id, name: ss.getName(), trashed: false, parent: null, sharing: 'PRIVATE', editors: [], viewers: [], content: '', mime: 'application/vnd.google-apps.spreadsheet' };
    return drive.files[id];
  };

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
        if (!ss) throw new Error('[gas-fakes] 스프레드시트를 찾을 수 없습니다: ' + id);
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
      getUserCache: () => cacheApi('user:' + (env.user.active || env.user.visitor || 'anonymous') + ':'),
      getDocumentCache: () => null
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => env.user.active }),
      getEffectiveUser: () => ({ getEmail: () => env.user.effective }),
      getTemporaryActiveUserKey: () => 'tmpkey-' + Buffer.from(env.user.active || env.user.visitor || 'anonymous').toString('hex').slice(0, 24),
      getScriptTimeZone: () => 'Asia/Seoul'
    },
    Utilities: {
      getUuid: () => {
        // 앞 8자리가 실행마다 달라야 한다(기간별 탭 이름 exceptions_<id 앞 8자>가 겹치지 않게)
        const n = ++env._uuidSeq;
        const h = ((n * 2654435761) >>> 0).toString(16).padStart(8, '0');
        return h + '-' + pad(n.toString(16), 4) + '-4000-8000-' + pad(n.toString(16), 12);
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
      getProjectTriggers: () => env.triggers.map((t) => ({ getHandlerFunction: () => t.fn, getUniqueId: () => t.id })),
      deleteTrigger: (tr) => { env.triggers = env.triggers.filter((t) => t.id !== tr.getUniqueId()); },
      newTrigger: (fn) => {
        const t = { id: 'fake-trigger-' + (env.triggers.length + 1) + '-' + (++env._uuidSeq), fn, hour: null, everyDays: null };
        const b = {
          timeBased: () => b, everyDays: (n) => { t.everyDays = n; return b; }, atHour: (h) => { t.hour = h; return b; }, nearMinute: () => b,
          create: () => { env.triggers.push(t); return { getHandlerFunction: () => t.fn, getUniqueId: () => t.id }; }
        };
        return b;
      },
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
    DriveApp: new Proxy(driveApi, { get: (o, k) => (k in o ? o[k] : notFaked('DriveApp.' + String(k))) }),
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

  const files = opts.files || listFiles('src', ['.gs']);
  const sources = files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const clockSrc =
    '(function(){ var R = Date;' +
    ' function D(a,b,c,d,e,f,g){ if (!(this instanceof D)) return new R(__now()).toString();' +
    '   switch (arguments.length) { case 0: return new R(__now()); case 1: return new R(a); case 2: return new R(a,b);' +
    '   case 3: return new R(a,b,c); case 4: return new R(a,b,c,d); case 5: return new R(a,b,c,d,e);' +
    '   case 6: return new R(a,b,c,d,e,f); default: return new R(a,b,c,d,e,f,g); } }' +
    ' D.prototype = R.prototype; R.prototype.constructor = D; Object.defineProperty(D, "name", { value: "Date" });' +
    ' D.UTC = R.UTC; D.parse = R.parse; D.now = function(){ return __now(); };' +
    ' globalThis.Date = D; })();';

  /**
   * 실행 한 번 = 새 vm 컨텍스트(Apps Script는 google.script.run 호출마다 전역 전체를 새로 만든다).
   * 시트·속성·캐시·시계·UUID 순번은 env에 있어 실행을 넘어 이어진다.
   */
  function makeContext() {
    const c = vm.createContext(Object.assign({ console: { log() {}, warn() {}, error() {}, info() {} } }, services));
    c.__now = ctxTime;
    vm.runInContext(clockSrc, c, { filename: 'gas-fakes-clock.js' });
    for (const [f, src] of sources) vm.runInContext(src, c, { filename: f });
    return c;
  }

  function newExecution(active, effective, visitor) {
    env.user = { active: (active || '').toLowerCase(), effective: (effective || '').toLowerCase(), visitor: visitor || '' };
    env.lock.held = false;
    env.ctx = makeContext();
    return env.ctx;
  }

  /** google.script.run 경계: 인자·반환값은 원시값·평범한 객체·배열만(Date·함수·undefined 배열 원소 금지). */
  function assertWireSafe(v, where) {
    const seen = new Set();
    (function walk(x, p) {
      if (x === null || ['string', 'number', 'boolean'].includes(typeof x)) return;
      if (x === undefined) return;   // 객체 속성의 undefined는 빠진다(JSON과 같음)
      const tag = Object.prototype.toString.call(x);
      if (typeof x === 'function' || tag === '[object Date]' || tag === '[object RegExp]' || tag === '[object Map]' || tag === '[object Set]') {
        throw new Error('[gas-fakes] google.script.run으로 보낼 수 없는 값(' + tag + '): ' + where + p);
      }
      if (seen.has(x)) throw new Error('[gas-fakes] 순환 참조: ' + where + p);
      seen.add(x);
      if (Array.isArray(x)) x.forEach((y, i) => { if (y === undefined) throw new Error('[gas-fakes] 배열 안 undefined: ' + where + p + '[' + i + ']'); walk(y, p + '[' + i + ']'); });
      else Object.keys(x).forEach((k) => walk(x[k], p + '.' + k));
      seen.delete(x);
    })(v, '');
  }

  function hostError(e) {
    if (!e || typeof e !== 'object') return new Error(String(e));
    const h = new Error(e.message);
    h.stack = e.stack; h.original = e;
    return h;
  }

  env.ctx = makeContext();   // 파일을 한 번 올려 문법 오류를 먼저 드러낸다

  Object.assign(env, {
    /**
     * 웹앱("나로 실행")으로 email이 접속해 한 번 실행한다(실행 계정 effective = 소유자). fn(ctx)의 ctx는 이 실행의 새 전역.
     * 함수를 바꿔 끼우는 시험(몽키패치)은 fn 안에서 한다(다음 실행에는 남지 않는다).
     * email ''는 접속자 이메일을 받지 못한 경우(개인 gmail 소유자 + 외부 계정, PRD 6.1)를 흉내 낸다.
     */
    as(email, fn) { const c = newExecution(email, env.owner, email ? '' : 'anon'); try { return fn(c); } finally { env.lock.held = false; } },
    /** 소유자가 편집기에서 실행(active = effective = 소유자). */
    asOwner(fn) { const c = newExecution(env.owner, env.owner); try { return fn(c); } finally { env.lock.held = false; } },
    /** as()와 같지만 던진 오류를 이쪽(Node) Error로 돌려준다(없으면 null). 원래 오류는 .original. */
    errorOf(email, fn) { try { env.as(email, fn); return null; } catch (e) { return hostError(e); } },
    /**
     * 화면이 google.script.run.fnName(...args)를 부른 것처럼: 인자·반환값을 경계 규칙으로 검사하고 JSON으로 복사한다.
     * 공개 함수 테스트는 이것을 쓴다. 오류는 Node Error로 던진다.
     */
    call(email, fnName, ...args) {
      assertWireSafe(args, fnName + '(인자)');
      const wireArgs = JSON.parse(JSON.stringify(args));
      let r;
      try {
        r = env.as(email, (c) => {
          if (typeof c[fnName] !== 'function') throw new Error('[gas-fakes] 없는 함수: ' + fnName);
          if (fnName.slice(-1) === '_') throw new Error('[gas-fakes] 이름이 _로 끝나는 함수는 화면에서 부를 수 없습니다: ' + fnName);
          return c[fnName].apply(null, wireArgs);
        });
      } catch (e) { throw hostError(e); }
      assertWireSafe(r, fnName + '(반환)');
      return r === undefined ? null : JSON.parse(JSON.stringify(r));
    },
    /**
     * 거부를 확인한다: 오류 문구가 정확히 '권한이 없습니다.'이고, 이번 호출로 audit_log에 그 사람의
     * 'denied:<action>' 행이 새로 생겼다. (10분 거부 기록 제한에 걸리지 않게 거부 기록 캐시를 먼저 비운다.)
     * 권한 검사 없이 다른 이유로 실패한 것을 거부로 잘못 세지 않게 한다. → 새로 생긴 audit 행
     */
    expectDenied(email, action, fnName, ...args) {
      Object.keys(env.cache).filter((k) => k.indexOf('script:deny:') === 0).forEach((k) => delete env.cache[k]);
      const before = env.rows('audit_log').length;
      let err = null;
      try { env.call(email, fnName, ...args); } catch (e) { err = e; }
      if (!err) throw new Error('[gas-fakes] 거부되어야 하는데 허용됨: ' + email + ' ' + fnName);
      if (err.message !== '권한이 없습니다.') throw new Error('[gas-fakes] 권한 거부가 아닌 오류: ' + err.message);
      const added = env.rows('audit_log').slice(before).filter((r) => r.action === 'denied:' + action);
      if (added.length !== 1 || added[0].created_by !== (email.toLowerCase() || '(이메일 없음)')) {
        throw new Error('[gas-fakes] denied:' + action + ' 기록이 없음(새 행: ' + JSON.stringify(env.rows('audit_log').slice(before).map((r) => [r.action, r.created_by])) + ')');
      }
      return added[0];
    },
    /** 허용을 확인한다: 오류 없이 끝나고 denied 기록이 새로 생기지 않는다. → 반환값 */
    expectAllowed(email, fnName, ...args) {
      const before = env.rows('audit_log').length;
      const r = env.call(email, fnName, ...args);
      const denied = env.rows('audit_log').slice(before).filter((x) => String(x.action).indexOf('denied:') === 0);
      if (denied.length) throw new Error('[gas-fakes] 허용됐지만 거부 기록이 생김: ' + denied.map((x) => x.action).join(','));
      return r;
    },
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
      if (o.stage1) env.asOwner((c) => { if (typeof c.seedFakeStage1 === 'function') c.seedFakeStage1(); });
      // 역할을 하나씩만 가진 시험 계정과 이번 기간 등록이 없는 학생(범위 판정을 따로 시험하려고)
      const solo = { admin: 'test.admin@example.com', attendance: 'test.attendance@example.com', duty_manager: 'test.duty@example.com' };
      env.asOwner((c) => Object.keys(solo).forEach((role) => c.addUser(solo[role], '시험 ' + role, role)));
      const unenrolled = env.asOwner((c) => c.appendRecord_('students', {
        student_no: '39999', name: '가짜미등록', gender: '여', grade: '3', class_no: '9', number: '99', track: '',
        email: 'fake.unenrolled@example.com', memo: '가짜 데이터(등록 없음)'
      }, env.owner));
      return Object.assign({}, acc, { soloAccounts: solo, unenrolledStudentId: unenrolled.id });
    }
  });
  return env;
}

module.exports = { createGasEnv, formatDate, kstToMs };
