/**
 * 처음 한 번(그리고 탭이 추가될 때마다) Apps Script 편집기에서 직접 실행한다.
 * 웹앱 화면에서는 부를 수 없다(이름 끝 _ 이 아닌 공개 함수지만 첫 줄에서 소유자 확인).
 *
 * setup()
 *  1. 데이터 스프레드시트 3개(운영 DB, 상담일지, 설정)를 만들고 ID를 Script Properties에 저장
 *  2. 탭과 헤더를 만든다(이미 있으면 그대로 둔다. 헤더가 다르면 고치지 않고 경고만)
 *  3. users가 비어 있으면 실행한 사람을 관리자로 등록
 *
 * 만들어진 파일은 실행한 계정의 내 드라이브에 생기며, 아무와도 공유하지 않는다.
 */

function assertOwnerRun_() {
  var active = normalizeEmail_(Session.getActiveUser().getEmail());
  var effective = normalizeEmail_(Session.getEffectiveUser().getEmail());
  if (!active || active !== effective) {
    throw new Error('이 함수는 스크립트 소유자가 편집기에서만 실행합니다.');
  }
  return active;
}

function setup() {
  var owner = assertOwnerRun_();
  var report = [];

  Object.keys(DB_FILES).forEach(function (kind) {
    var def = DB_FILES[kind];
    var id = props_().getProperty(def.prop);
    var ss;
    if (id) {
      ss = SpreadsheetApp.openById(id);
      report.push('[유지] ' + def.title + ' ' + ss.getUrl());
    } else {
      ss = SpreadsheetApp.create(def.title);
      ss.setSpreadsheetTimeZone(TZ);
      props_().setProperty(def.prop, ss.getId());
      report.push('[생성] ' + def.title + ' ' + ss.getUrl());
    }
    _dbMemo.files[kind] = ss;

    Object.keys(SCHEMA[kind]).forEach(function (sheetName) {
      report.push('  ' + ensureSheet_(ss, kind, sheetName));
    });
    removeDefaultSheet_(ss);
  });

  seedSettings_(owner, report);

  var users = readAll('users');
  if (!users.length) {
    appendRecord('users', {
      email: owner, name: '관리자(소유자)', roles: 'admin,hall_teacher', homeroom_class: '', active: 'TRUE',
      memo: 'setup()이 자동 등록'
    }, owner);
    report.push('[등록] 소유자 계정을 관리자·학사 교사로 등록: ' + owner);
  }

  if (props_().getProperty('DIAG_ENABLED') === null) {
    props_().setProperty('DIAG_ENABLED', 'true');
  }

  console.log(report.join('\n'));
  return report;
}

function ensureSheet_(ss, kind, sheetName) {
  var headers = headersFor_(kind, sheetName);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }
  // 모든 칸을 "일반 텍스트"로: 날짜·학번이 자동 변환되지 않게
  sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getMaxColumns(), headers.length)).setNumberFormat('@');

  var lastCol = sh.getLastColumn();
  if (lastCol === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return '[탭 생성] ' + sheetName;
  }
  var current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(cellToString_);
  if (current.join('|') !== headers.join('|')) {
    return '[경고] ' + sheetName + ' 헤더가 코드와 다릅니다. 자동으로 고치지 않았습니다.\n' +
      '    시트: ' + current.join(', ') + '\n    코드: ' + headers.join(', ');
  }
  return '[탭 유지] ' + sheetName;
}

function removeDefaultSheet_(ss) {
  ['Sheet1', '시트1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

function seedSettings_(owner, report) {
  var existing = readAll('settings', 'config').map(function (r) { return r.key; });
  var added = 0;
  DEFAULT_SETTINGS.forEach(function (s) {
    if (existing.indexOf(s[0]) >= 0) return;
    appendRecord('settings', { key: s[0], value: s[1], description: s[2] }, owner, 'config');
    added++;
  });
  report.push('[설정] 기본값 ' + added + '개 추가');
}

/**
 * 사용자 추가(편집기에서 실행). 예: addUser('t1@school.kr', '김교사', 'hall_teacher')
 * 이메일은 코드에 적지 말고 편집기에서 실행할 때만 넣는다.
 */
function addUser(email, name, roles, homeroomClass) {
  var owner = assertOwnerRun_();
  email = normalizeEmail_(email);
  if (!email) throw new Error('이메일이 필요합니다.');
  var bad = String(roles || '').split(',').map(function (r) { return r.trim(); })
    .filter(function (r) { return r && ROLES.indexOf(r) < 0; });
  if (bad.length) throw new Error('알 수 없는 역할: ' + bad.join(', '));
  var dup = readAll('users').filter(function (u) { return normalizeEmail_(u.email) === email; })[0];
  if (dup) {
    return updateRecord('users', dup.id, {
      name: name, roles: roles, homeroom_class: homeroomClass || '', active: 'TRUE'
    }, owner);
  }
  return appendRecord('users', {
    email: email, name: name, roles: roles, homeroom_class: homeroomClass || '', active: 'TRUE', memo: ''
  }, owner);
}
