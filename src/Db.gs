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
function readAll_(sheetName, kind) {
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

function findById_(sheetName, id, kind) {
  var rows = readAll_(sheetName, kind);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

function invalidate_(kind, sheetName) {
  delete _dbMemo.rows[(kind || 'db') + '/' + sheetName];
}

/** 이 실행이 지금 스크립트 락을 갖고 있는지(중첩 호출 시 다시 잡거나 먼저 풀지 않도록) */
var _lockDepth = 0;

/** LockService로 감싼다. 락을 못 얻으면 사용자에게 보일 문구로 실패한다. 중첩 호출은 바깥 락을 그대로 쓴다. */
function withLock_(fn, waitMs) {
  if (_lockDepth > 0) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || LOCK_WAIT_MS)) {
    throw new Error('다른 사람이 저장 중입니다. 잠시 후 다시 저장해 주세요.');
  }
  _lockDepth++;
  try {
    return fn();
  } finally {
    _lockDepth--;
    lock.releaseLock();
  }
}

/** 시트 끝에 n행을 쓸 자리가 없으면 늘린다(새 시트는 1000행). 락 안에서 부른다. */
function ensureRows_(sh, firstRow, n) {
  var need = firstRow + n - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), Math.max(need, 500));
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
function appendRecord_(sheetName, data, actorEmail, kind, opts) {
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
    ensureRows_(sh, rowNo, 1);
    var range = sh.getRange(rowNo, 1, 1, headers.length);
    range.setNumberFormat('@');
    range.setValues([toRowArray_(headers, rec)]);
    invalidate_(kind, sheetName);
    if (!opts.skipAudit && sheetName !== 'audit_log') {
      writeAudit_(sheetName, rec.id, 'create', null, rec, actorEmail, kind);
    }
    return rec;
  };
  return withLock_(run);
}

/**
 * 행 수정(부분 갱신). 변경 전·후를 audit_log에 남긴다.
 */
function updateRecord_(sheetName, id, patch, actorEmail, kind) {
  kind = kind || 'db';
  return withLock_(function () {
    invalidate_(kind, sheetName);
    var before = findById_(sheetName, id, kind);
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

/** audit_log 기록. 락 안에서 부른다(appendRecord_가 바깥 락을 그대로 쓴다). */
function writeAudit_(sheetName, rowId, action, before, after, actorEmail, kind, detail) {
  appendRecord_('audit_log', {
    sheet: (kind && kind !== 'db' ? kind + '/' : '') + sheetName,
    row_id: rowId || '',
    action: action,
    before: before ? JSON.stringify(before) : '',
    after: after ? JSON.stringify(after) : '',
    detail: detail || ''
  }, actorEmail, 'db', { skipAudit: true });
}

/**
 * 권한 거부 기록. 아무 구글 계정이나 접속할 수 있으므로 같은 계정·같은 기능의 거부는
 * 10분에 한 번만 남긴다(audit_log 도배 방지). 락을 짧게 시도하고, 못 얻으면 넘어간다
 * (거부 기록 때문에 화면이 멈추면 안 되므로).
 */
var DENY_LOG_INTERVAL_SEC = 600;

function logDenied_(actorEmail, action, detail) {
  try {
    var cache = CacheService.getScriptCache();
    var key = 'deny:' + Utilities.base64EncodeWebSafe(String(actorEmail || '-') + '|' + action).slice(0, 200);
    if (cache.get(key)) return;
    withLock_(function () {
      // 상세는 500자로 자른다(큰 입력 한 번으로 감사 쓰기가 실패하지 않게). 10분 제한 캐시는 기록에 성공한 뒤에 둔다
      writeAudit_('-', '', 'denied:' + action, null, null, actorEmail || '(이메일 없음)', 'db', String(detail === undefined ? '' : detail).slice(0, 500));
    }, 2000);
    cache.put(key, '1', DENY_LOG_INTERVAL_SEC);
  } catch (e) {
    console.warn('거부 기록 생략: ' + e.message);
  }
}

/** 여러 행을 한 번에 쓴다(가짜 데이터·기본값 시드용). audit_log에는 한 줄로 요약해 남긴다. */
function bulkAppend_(sheetName, rows, actorEmail) {
  if (!rows.length) return;
  withLock_(function () {
    var sh = getSheet_('db', sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(cellToString_);
    var now = nowIso_();
    var values = rows.map(function (r) {
      var rec = {};
      Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
      rec.id = rec.id || Utilities.getUuid();
      rec.created_at = rec.updated_at = now;
      rec.created_by = rec.updated_by = actorEmail;
      return toRowArray_(headers, rec);
    });
    var firstRow = sh.getLastRow() + 1;
    ensureRows_(sh, firstRow, values.length);
    var range = sh.getRange(firstRow, 1, values.length, headers.length);
    range.setNumberFormat('@');
    range.setValues(values);
    invalidate_('db', sheetName);
    writeAudit_(sheetName, '', 'bulk_create', null, null, actorEmail, 'db', rows.length + '행 (일괄 추가)');
  });
}

/**
 * 여러 행을 한 번에 고친다(명단 업로드처럼 수십~수백 행). 시트를 한 번 읽고 한 번 쓴다.
 * audit_log에는 바뀐 칸의 이전·이후 값을 남긴다: before = {id: {열: 이전}}, after = {id: {열: 이후}}.
 * 한 칸에 5만 자를 못 넣으므로 크면 여러 줄로 나눠 쓴다. 행마다 한 줄씩 쓰지 않는다(시간 한도).
 * @param {{id:string, patch:Object}[]} patches
 * @return {number} 실제로 바뀐 행 수
 */
var AUDIT_CHUNK_CHARS = 20000;   // before·after 각각 이 글자 수 안(시트 칸 한도 5만자보다 넉넉히 작게)

function bulkUpdateRecords_(sheetName, patches, actorEmail, kind) {
  kind = kind || 'db';
  if (!patches || !patches.length) return 0;
  return withLock_(function () {
    invalidate_(kind, sheetName);
    var sh = getSheet_(kind, sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(cellToString_);
    var rows = readAll_(sheetName, kind);
    var byId = {};
    rows.forEach(function (r) { byId[r.id] = r; });
    var firstRow = 2;
    var values = rows.length ? sh.getRange(firstRow, 1, sh.getLastRow() - 1, headers.length).getValues() : [];
    var now = nowIso_();
    var changed = [];   // [{id, before:{col:old}, after:{col:new}}]
    patches.forEach(function (p) {
      var row = byId[p.id];
      if (!row) throw new Error('기록을 찾을 수 없습니다: ' + p.id);
      var idx = row._row - firstRow;
      var before = {}, after = {};
      Object.keys(p.patch).forEach(function (k) {
        if (k === 'id' || k === 'created_at' || k === 'created_by') return;
        var c = headers.indexOf(k);
        if (c < 0) throw new Error('없는 열입니다: ' + sheetName + '.' + k);
        var v = p.patch[k] === undefined || p.patch[k] === null ? '' : String(p.patch[k]);
        var old = cellToString_(values[idx][c]);
        if (old !== v) { before[k] = old; after[k] = v; values[idx][c] = v; }
      });
      if (Object.keys(after).length) {
        values[idx][headers.indexOf('updated_at')] = now;
        values[idx][headers.indexOf('updated_by')] = actorEmail || '';
        changed.push({ id: p.id, before: before, after: after });
      }
    });
    if (!changed.length) return 0;
    var range = sh.getRange(firstRow, 1, values.length, headers.length);
    range.setNumberFormat('@');
    range.setValues(values);
    invalidate_(kind, sheetName);
    // 감사 기록: 칸 한도를 넘지 않게 덩어리로 나눠 쓴다
    var chunks = [], cur = { before: {}, after: {}, n: 0, size: 0 };
    changed.forEach(function (c) {
      var size = JSON.stringify(c.before).length + JSON.stringify(c.after).length + c.id.length + 10;
      if (cur.n && cur.size + size > AUDIT_CHUNK_CHARS) { chunks.push(cur); cur = { before: {}, after: {}, n: 0, size: 0 }; }
      cur.before[c.id] = c.before; cur.after[c.id] = c.after; cur.n++; cur.size += size;
    });
    chunks.push(cur);
    chunks.forEach(function (ch, i) {
      writeAudit_(sheetName, '', 'bulk_update', ch.before, ch.after, actorEmail, kind,
        changed.length + '행 변경 중 ' + ch.n + '행' + (chunks.length > 1 ? ' (' + (i + 1) + '/' + chunks.length + ')' : ''));
    });
    return changed.length;
  });
}
