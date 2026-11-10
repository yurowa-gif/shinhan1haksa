/**
 * O1 매일 백업(접두어 bak). PRD §9: 데이터 파일 사본을 매일 밤 Drive 백업 폴더에 남기고 30일 지난 사본은 휴지통으로 보낸다.
 * - installNightlyBackup(): 편집기에서 한 번. 매일 02시대 시간 트리거를 하나만 둔다(이미 있으면 그대로).
 * - runBackupNow(): 편집기에서 지금 한 번 백업.
 * - nightlyBackup_(): 트리거가 부른다. 이름 끝 _ 라 화면에서는 부를 수 없다.
 * 백업 폴더(Script Property BACKUP_FOLDER_ID)와 사본은 아무와도 공유하지 않는다(CLAUDE.md 2). 복사 직후 공유를 확인하고 열려 있으면 닫으며, 못 닫으면 실패로 본다.
 * 지우는 것은 이 폴더 안에서 우리 이름 규칙('백업 YYYY-MM-DD …')에 맞는 사본뿐이다(휴지통 — 시트 기록이 아니라 사본이므로 CLAUDE.md 4와 별개).
 * 비밀값(스프레드시트·폴더 ID, 시험 계정 이메일)은 상태 JSON에 이름만 적는다. 값을 남기는 것은 BAK_STATE_VALUES 목록뿐.
 */
var BAK_FOLDER_PROP = 'BACKUP_FOLDER_ID';
var BAK_FOLDER_NAME = '신한1학사_백업';
var BAK_KEEP_DAYS = 30;
var BAK_TRIGGER_FN = 'nightlyBackup_';
var BAK_HOUR = 2;
var BAK_STATE_VALUES = ['AUTO_OUT_SINCE', 'MAIL_ENABLED', 'DIAG_ENABLED'];
var BAK_NAME_RE = /^백업 (\d{4}-\d{2}-\d{2})(?: #\d+)? (.+)$/;

function installNightlyBackup() {
  var owner = assertOwnerRun_();
  return withLock_(function () {
    var has = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === BAK_TRIGGER_FN; });
    if (has.length) return { installed: false, message: '이미 설치되어 있습니다(매일 밤 ' + BAK_HOUR + '시대). 트리거 ' + has.length + '개' + (has.length > 1 ? ' — 여러 개면 편집기 트리거 화면에서 하나만 남겨 주세요.' : '.') };
    ScriptApp.newTrigger(BAK_TRIGGER_FN).timeBased().everyDays(1).atHour(BAK_HOUR).create();
    return { installed: true, message: '매일 밤 ' + BAK_HOUR + '시대에 백업합니다. 지금 한 번 확인하려면 runBackupNow를 실행하세요. (' + owner + ')' };
  });
}

function runBackupNow() {
  var owner = assertOwnerRun_();
  return bakRun_(owner);
}

function nightlyBackup_() {
  return bakRun_(normalizeEmail_(Session.getEffectiveUser().getEmail()) || '(소유자)');
}

/** 백업 한 번 → {date, copies:[이름], state, trashed, folder}. 실패하면 audit backup:failed·소유자 메일 뒤에 다시 던진다 */
function bakRun_(actor) {
  var res;
  try {
    res = bakDo_();
  } catch (e) {
    var msg = notifyErrText_(e);
    bakAudit_('backup:failed', msg, actor);
    notifyMail_([actor], '[신한1학사] 백업 실패', '매일 백업이 실패했습니다.\n원인: ' + msg + '\n편집기에서 runBackupNow를 실행해 다시 확인해 주세요.', actor);
    throw e;
  }
  bakAudit_('backup:ok', res.date + ' 사본 ' + res.copies.length + '개·상태 파일 1개, 휴지통 ' + res.trashed + '개' + (res.warn ? ' (' + res.warn + ')' : ''), actor);
  return res;
}

function bakDo_() {
  var today = today_();
  var folder = bakFolder_();
  var suffix = bakSuffix_(folder, today);
  var copies = [], errors = [];
  Object.keys(DB_FILES).forEach(function (kind) {
    var def = DB_FILES[kind], id = props_().getProperty(def.prop);
    if (!id) { errors.push(def.title + ': 데이터 파일 ID가 없습니다(' + def.prop + ')'); return; }
    try {
      var src = DriveApp.getFileById(id);
      var copy = src.makeCopy('백업 ' + today + suffix + ' ' + src.getName(), folder);
      bakEnsurePrivate_(copy);
      copies.push(copy.getName());
    } catch (e) {
      errors.push(def.title + ': ' + notifyErrText_(e));
    }
  });
  try {
    var st = folder.createFile('백업 ' + today + suffix + ' 앱상태.json', JSON.stringify(bakState_(today), null, 2), 'application/json');
    bakEnsurePrivate_(st);
  } catch (e) {
    errors.push('앱 상태 파일: ' + notifyErrText_(e));
  }
  if (errors.length) throw new Error(errors.join(' / '));
  // 복사가 모두 끝난 뒤에만 오래된 사본을 치운다(실패한 날에 백업이 줄지 않게)
  var cleaned = bakTrimOld_(folder, today);
  return { date: today, copies: copies, state: true, trashed: cleaned.trashed, warn: cleaned.warn, folder: folder.getName() };
}

/** 같은 날 두 번째부터 이름이 겹치지 않게 ' #2' … */
function bakSuffix_(folder, today) {
  var top = 0, it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    var m = BAK_NAME_RE.exec(f.getName());
    if (!m || m[1] !== today) continue;
    var k = /^백업 \d{4}-\d{2}-\d{2} #(\d+) /.exec(f.getName());
    top = Math.max(top, k ? Number(k[1]) : 1);
  }
  return top ? ' #' + (top + 1) : '';
}

function bakFolder_() {
  var id = props_().getProperty(BAK_FOLDER_PROP), folder;
  if (id) {
    // 없어졌거나 휴지통이면 조용히 새로 만들지 않는다(백업이 어디 가는지 모르게 되므로)
    try { folder = DriveApp.getFolderById(id); } catch (e) { throw new Error('백업 폴더를 열 수 없습니다(BACKUP_FOLDER_ID 확인): ' + notifyErrText_(e)); }
    if (folder.isTrashed()) throw new Error('백업 폴더가 휴지통에 있습니다. 되살리거나 Script Property BACKUP_FOLDER_ID를 지워 새로 만들게 해 주세요.');
  } else {
    folder = DriveApp.createFolder(BAK_FOLDER_NAME);
    props_().setProperty(BAK_FOLDER_PROP, folder.getId());
  }
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('백업 폴더가 공유되어 있습니다. 공유를 모두 끄고 다시 실행해 주세요.');
  return folder;
}

/** 사본이 소유자 말고 아무와도 공유되지 않았는지 확인. 열려 있으면 닫아 보고, 그래도 열려 있으면 던진다 */
function bakEnsurePrivate_(file) {
  function open_() {
    return file.getSharingAccess() !== DriveApp.Access.PRIVATE || file.getEditors().length > 0 || file.getViewers().length > 0;
  }
  if (open_()) {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    if (open_()) throw new Error('백업 사본이 공유되어 있어 닫지 못했습니다: ' + file.getName());
  }
}

/** 앱 상태 JSON: 속성 이름 전부 + 허용 목록의 값만 */
function bakState_(today) {
  var all = props_().getProperties(), names = Object.keys(all).sort(), values = {}, hidden = [];
  names.forEach(function (k) {
    if (BAK_STATE_VALUES.indexOf(k) >= 0) values[k] = all[k]; else hidden.push(k);
  });
  return { savedAt: nowIso_(), date: today, 설명: '값을 적은 것은 앱 상태 설정뿐입니다. 비밀값(파일·폴더 ID, 시험 계정 등)은 이름만 있습니다.', values: values, 이름만: hidden };
}

/** 30일 지난 우리 사본을 휴지통으로 → {trashed, warn} */
function bakTrimOld_(folder, today) {
  var t0 = bakDayNum_(today), trashed = 0, failed = 0, it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    var m = BAK_NAME_RE.exec(f.getName());
    if (!m) continue;
    var age = t0 - bakDayNum_(m[1]);
    if (age > BAK_KEEP_DAYS) {
      try { f.setTrashed(true); trashed++; } catch (e) { failed++; }
    }
  }
  return { trashed: trashed, warn: failed ? '오래된 사본 ' + failed + '개를 치우지 못함' : '' };
}

function bakDayNum_(ymd) {
  var p = String(ymd).split('-');
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000);
}

/** audit_log에 한 줄. 기록이 실패해도 백업 결과를 가리지 않는다 */
function bakAudit_(action, detail, actor) {
  try {
    withLock_(function () { writeAudit_('-', '', action, null, null, actor || '(알 수 없음)', 'db', detail); }, 5000);
  } catch (e) {
    console.warn('백업 기록 생략: ' + e.message);
  }
}
