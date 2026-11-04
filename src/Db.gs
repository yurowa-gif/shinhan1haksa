/**
 * 시트 읽기·쓰기 공통 함수.
 * - 스프레드시트 ID는 Script Properties(DB_ID, COUNSEL_ID, CONFIG_ID)에만 둔다.
 * - 모든 값은 문자열로 저장·반환한다(날짜는 yyyy-MM-dd, 시각은 ISO 형식).
 * - 쓰기는 반드시 withLock_ 안에서 한다.
 * - 행은 지우지 않는다. 취소는 status 값을 바꾸고 audit_log에 남긴다.
 */

var TZ = 'Asia/Seoul';
var LOCK_WAIT_MS = 10000;

/** 한 번의 서버 실행 안에서만 쓰는 메모리 캐시 */
var _dbMemo = { files: {}, rows: {} };

function props_() {
  return PropertiesService.getScriptProperties();
}

function openFile_(kind) {
  if (_dbMemo.files[kind]) return _dbMemo.files[kind];
  var def = DB_FILES[kind];
  if (!def) throw new Error('알 수 없는 데이터 파일: ' + kind);
  var id = props_().getProperty(def.prop);
  if (!id) throw new Error('데이터 파일이 아직 없습니다. 편집기에서 setup()을 먼저 실행하세요.');
  var ss = SpreadsheetApp.openById(id);
  _dbMemo.files[kind] = ss;
  return ss;
}

function getSheet_(kind, sheetName) {
  var sh = openFile_(kind).getSheetByName(sheetName);
  if (!sh) throw new Error('탭이 없습니다: ' + sheetName + ' (setup()을 다시 실행하세요)');
  return sh;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

/** 셀 값 → 문자열 (날짜 객체가 섞여 들어와도 yyyy-MM-dd로) */
function cellToString_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  return String(v);
}

/**
 * 탭 전체를 객체 배열로 읽는다. 키는 1행 헤더.
 * 각 객체에 _row(시트 행 번호)를 붙인다.
 */
function readAll(sheetName, kind) {
  kind = kind || 'db';
  var key = kind + '/' + sheetName;
  if (_dbMemo.rows[key]) return _dbMemo.rows[key];
  var sh = getSheet_(kind, sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 1) return [];
  var headers = values[0].map(cellToString_);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = cellToString_(row[c]);
    }
    out.push(obj);
  }
  _dbMemo.rows[key] = out;
  return out;
}

function findById(sheetName, id, kind) {
  var rows = readAll(sheetName, kind);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

function invalidate_(kind, sheetName) {
  delete _dbMemo.rows[(kind || 'db') + '/' + sheetName];
}

/** LockService로 감싼다. 락을 못 얻으면 사용자에게 보일 문구로 실패한다. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    throw new Error('다른 사람이 저장 중입니다. 잠시 후 다시 저장해 주세요.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** 헤더 순서대로 객체를 한 행 배열로 바꾼다 */
function toRowArray_(headers, obj) {
  return headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * 행 추가. id·created_*·updated_*는 자동으로 채운다.
 * @param {string} actorEmail 기록자(서버에서 확인한 접속자 이메일)
 * @return {Object} 저장된 객체
 */
function appendRecord(sheetName, data, actorEmail, kind, opts) {
  kind = kind || 'db';
  opts = opts || {};
  var run = function () {
    var sh = getSheet_(kind, sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(cellToString_);
    var now = nowIso_();
    var rec = {};
    Object.keys(data).forEach(function (k) { rec[k] = data[k]; });
    rec.id = rec.id || Utilities.getUuid();
    rec.created_at = now;
    rec.created_by = actorEmail || '';
    rec.updated_at = now;
    rec.updated_by = actorEmail || '';
    var rowNo = sh.getLastRow() + 1;
    var range = sh.getRange(rowNo, 1, 1, headers.length);
    range.setNumberFormat('@');
    range.setValues([toRowArray_(headers, rec)]);
    invalidate_(kind, sheetName);
    if (!opts.skipAudit && sheetName !== 'audit_log') {
      writeAudit_(sheetName, rec.id, 'create', null, rec, actorEmail, kind);
    }
    return rec;
  };
  return opts.alreadyLocked ? run() : withLock_(run);
}

/**
 * 행 수정(부분 갱신). 변경 전·후를 audit_log에 남긴다.
 */
function updateRecord(sheetName, id, patch, actorEmail, kind) {
  kind = kind || 'db';
  return withLock_(function () {
    invalidate_(kind, sheetName);
    var before = findById(sheetName, id, kind);
    if (!before) throw new Error('기록을 찾을 수 없습니다: ' + id);
    var sh = getSheet_(kind, sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(cellToString_);
    var after = {};
    headers.forEach(function (h) { after[h] = before[h]; });
    Object.keys(patch).forEach(function (k) {
      if (k === 'id' || k === 'created_at' || k === 'created_by') return;
      after[k] = patch[k];
    });
    after.updated_at = nowIso_();
    after.updated_by = actorEmail || '';
    var range = sh.getRange(before._row, 1, 1, headers.length);
    range.setNumberFormat('@');
    range.setValues([toRowArray_(headers, after)]);
    invalidate_(kind, sheetName);
    var cleanBefore = {};
    headers.forEach(function (h) { cleanBefore[h] = before[h]; });
    writeAudit_(sheetName, id, 'update', cleanBefore, after, actorEmail, kind);
    return after;
  });
}

/** audit_log 기록. 호출하는 쪽이 이미 락을 갖고 있다고 본다. */
function writeAudit_(sheetName, rowId, action, before, after, actorEmail, kind, detail) {
  appendRecord('audit_log', {
    sheet: (kind && kind !== 'db' ? kind + '/' : '') + sheetName,
    row_id: rowId || '',
    action: action,
    before: before ? JSON.stringify(before) : '',
    after: after ? JSON.stringify(after) : '',
    detail: detail || ''
  }, actorEmail, 'db', { alreadyLocked: true, skipAudit: true });
}

/**
 * 권한 거부 기록. 락을 짧게 시도하고, 못 얻으면 로그만 남기고 넘어간다
 * (거부 기록 때문에 화면이 멈추면 안 되므로).
 */
function logDenied_(actorEmail, action, detail) {
  try {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(2000)) {
      console.warn('audit_log 락 실패(거부 기록 생략): ' + action);
      return;
    }
    try {
      writeAudit_('-', '', 'denied:' + action, null, null, actorEmail || '(이메일 없음)', 'db', detail);
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    console.warn('거부 기록 실패: ' + e.message);
  }
}
