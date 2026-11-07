/**
 * 처음 한 번(그리고 탭이 추가될 때마다) Apps Script 편집기에서 직접 실행한다.
 * 편집기 실행 목록에 보이도록 이름 끝에 _ 를 붙이지 않았다. 그래서 웹앱 화면에서도 호출될 수
 * 있지만, 첫 줄 assertOwnerRun_이 소유자 본인이 아니면 거부한다.
 *
 * setup()
 *  1. 데이터 스프레드시트 3개(운영 DB, 상담일지, 설정)를 만들고 ID를 Script Properties에 저장
 *  2. 탭과 헤더를 만든다(이미 있으면 그대로 둔다. 새 본문 열만 빠졌으면 락 안에서 제자리에 끼우고, 그 밖에 다르면 고치지 않고 경고만)
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

  ensureTermSheets_(report);
  seedDefaultBlocks_(report);
  seedViolationRules_(owner, report);
  seedSettings_(owner, report);

  var users = readAll_('users');
  if (!users.length) {
    appendRecord_('users', {
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

/**
 * 모든 운영 기간에 대해 기간별 탭(exceptions_·violations_<id 앞 8자>)을 만든다. 있으면 그대로 둔다.
 * 두 기간의 id 앞 8자가 같으면 탭이 섞이므로 멈춘다.
 */
function ensureTermSheets_(report) {
  var seen = {};
  readAll_('terms').forEach(function (t) {
    Object.keys(SCHEMA_TERM_TABS).forEach(function (base) {
      var name = termSheetName_(base, t.id);
      if (seen[name]) throw new Error('기간 "' + seen[name] + '"과 "' + t.name + '"의 id 앞 8자가 같아 탭 이름이 겹칩니다: ' + name);
      seen[name] = t.name;
      report.push('  ' + ensureSheet_(openFile_('db'), 'db', name));
    });
  });
}

/** 새 기간을 만들 때(C1 이후) 그 기간의 탭만 만든다. 락 안에서 부른다. */
function ensureTermSheet_(base, termId) {
  return ensureSheet_(openFile_('db'), 'db', termSheetName_(base, termId));
}

/** blocks 탭이 비어 있으면 PRD 3.3 기본 블록을 넣는다(학기용. 방학은 학기 블록을 같이 쓴다). */
function seedDefaultBlocks_(report) {
  if (readAll_('blocks').length) {
    report.push('[블록] 이미 있어 기본 블록을 넣지 않음');
    return;
  }
  var rows = defaultBlockRows_();
  bulkAppend_('blocks', rows, assertOwnerRun_());
  report.push('[블록] 기본 블록 ' + rows.length + '개 추가');
}

/** violation_rules 탭이 비어 있으면 PRD F4 기본 4항목을 넣는다(결정 41). 있으면 그대로 둔다. */
function seedViolationRules_(owner, report) {
  if (readAll_('violation_rules').length) {
    report.push('[위반 항목] 이미 있어 기본 항목을 넣지 않음');
    return;
  }
  bulkAppend_('violation_rules', DEFAULT_VIOLATION_RULES.map(function (r, i) {
    return { name: r[0], description: r[1], active: 'TRUE', sort_order: String(i + 1) };
  }), owner);
  report.push('[위반 항목] 기본 항목 ' + DEFAULT_VIOLATION_RULES.length + '개 추가');
}

function ensureSheet_(ss, kind, sheetName) {
  var headers = headersFor_(kind, sheetName);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }
  // 열을 더한 뒤 시트 폭이 모자라면(손으로 열을 지운 탭) 먼저 넓힌다 — 아래 범위가 시트 밖이면 setup이 중간에 멈춘다
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  // 모든 칸을 "일반 텍스트"로: 날짜·학번이 자동 변환되지 않게
  sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getMaxColumns(), headers.length)).setNumberFormat('@');

  var lastCol = sh.getLastColumn();
  if (lastCol === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return '[탭 생성] ' + sheetName;
  }
  var current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(cellToString_);
  if (current.join('|') === headers.join('|')) return '[탭 유지] ' + sheetName;
  // 웹앱이 쓰는 도중에 행이 어긋나지 않게 락 안에서 다시 읽고 한 번에 쓴다(withLock_은 중첩되면 바깥 락을 쓴다 — saveTerm)
  var added = withLock_(function () { return setupInsertMissingCols_(sh, headers); });
  if (added) return added.length ? '[열 추가] ' + sheetName + ': ' + added.join(', ') : '[탭 유지] ' + sheetName;
  return '[경고] ' + sheetName + ' 헤더가 코드와 다릅니다. 자동으로 고치지 않았습니다.\n' +
    '    시트: ' + current.join(', ') + '\n    코드: ' + headers.join(', ');
}

/**
 * 시트 헤더가 코드 헤더에서 본문 열만 빠진 모양(남은 열 순서 같음, id 처음·공통 4열 끝)이면 빈 열을 제자리에 끼워
 * 헤더와 데이터 전체를 setValues 한 번으로 다시 쓰고 끼운 열 이름을 돌려준다. 다른 모양이면 아무것도 쓰지 않고 null.
 * 락 안에서 부른다(결정 41, stage2.md 5절 7번).
 */
function setupInsertMissingCols_(sh, headers) {
  var values = sh.getDataRange().getValues();
  var current = values[0].map(cellToString_);
  // pos[c] = 코드 헤더 c열이 시트의 몇 번째 열인지(빠졌으면 -1). 코드 헤더는 이름이 겹치지 않아 앞에서부터 맞추면 된다
  var pos = [], j = 0;
  headers.forEach(function (h) { pos.push(current[j] === h ? j++ : -1); });
  if (j !== current.length || current[0] !== 'id' || current.slice(-COMMON_TAIL.length).join('|') !== COMMON_TAIL.join('|')) return null;
  if (pos.indexOf(-1) < 0) return [];   // 락을 기다리는 동안 다른 setup이 이미 고쳤다: 다시 쓰지 않는다
  var out = values.map(function (row, r) {
    return headers.map(function (h, c) { return r === 0 ? h : pos[c] < 0 ? '' : row[pos[c]]; });
  });
  sh.getRange(1, 1, out.length, headers.length).setNumberFormat('@').setValues(out);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  return headers.filter(function (h, c) { return pos[c] < 0; });
}

function removeDefaultSheet_(ss) {
  ['Sheet1', '시트1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

function seedSettings_(owner, report) {
  var existing = readAll_('settings', 'config').map(function (r) { return r.key; });
  var added = 0;
  DEFAULT_SETTINGS.forEach(function (s) {
    if (existing.indexOf(s[0]) >= 0) return;
    appendRecord_('settings', { key: s[0], value: s[1], description: s[2] }, owner, 'config');
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
  var dup = readAll_('users').filter(function (u) { return normalizeEmail_(u.email) === email; })[0];
  if (dup) {
    return updateRecord_('users', dup.id, {
      name: name, roles: roles, homeroom_class: homeroomClass || '', active: 'TRUE'
    }, owner);
  }
  return appendRecord_('users', {
    email: email, name: name, roles: roles, homeroom_class: homeroomClass || '', active: 'TRUE', memo: ''
  }, owner);
}
