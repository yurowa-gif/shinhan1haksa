/**
 * 라우팅(doGet)과 홈 화면용 서버 함수.
 *
 * 화면은 단일 페이지(ui/Index) + 역할별 홈 조각(ui/home_<역할>).
 * 화면 데이터는 google.script.run으로 아래 서버 함수만 호출해서 가져온다.
 */

var APP_NAME = '신한1학사';

function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.page === 'diag') {
    if (!isDiagEnabled_()) return renderPage_('ui/NoAccess', { email: '' }, '권한 없음');
    return renderPage_('ui/Diag', { diag: collectDiag_() }, '접속 진단');
  }

  // C0 임시: 인쇄 방식 시험 화면(소유자 본인만). A/B 결정 뒤 지운다.
  if (p.page === 'printspike') {
    try { assertOwnerRun_(); } catch (err) { return renderPage_('ui/NoAccess', { email: '' }, '권한 없음'); }
    return renderPage_('ui/screen_printspike', {}, '인쇄 방식 시험');
  }

  var user;
  try {
    user = getCurrentUser_();
  } catch (err) {
    return renderPage_('ui/Error', { message: err.message }, '오류');
  }

  if (!user.registered) {
    logDenied_(user.email, 'app.open', user.email ? '등록되지 않은 계정' : '이메일 확인 불가');
    return renderPage_('ui/NoAccess', { email: user.email }, '권한 없음');
  }

  // 화면(?page=...): 역할을 확인한 뒤 화면 조각을 끼운다. 진짜 권한 검사는 화면이 부르는 서버 함수가 한다.
  if (p.page) {
    var sc = screenResolve_(p.page, user.roles);
    if (!sc.ok) {
      logDenied_(user.email, 'screen.' + String(p.page).slice(0, 40), sc.why);
      return renderPage_('ui/NoAccess', { email: user.email }, '권한 없음');
    }
    return renderPage_('ui/screen_shell', {
      screenFile: sc.screen.file,
      screenTitle: sc.screen.title,
      appUrl: ScriptApp.getService().getUrl(),
      screenParams: screenParams_(p)
    }, sc.screen.title);
  }

  // 역할 전환: 요청한 역할을 실제로 가진 경우에만 허용
  var role = p.role && hasRole_(user, p.role) ? p.role : user.roles[0];

  return renderPage_('ui/Index', {
    role: role,
    roleLabel: ROLE_LABELS[role],
    userName: user.name,
    roleTabs: user.roles.map(function (r) { return { code: r, label: ROLE_LABELS[r] }; }),
    appUrl: ScriptApp.getService().getUrl(),
    diagEnabled: isDiagEnabled_()
  }, ROLE_LABELS[role]);
}

/**
 * 화면 목록. 새 화면은 여기 한 줄 + src/ui/screen_<이름>.html 하나.
 * view: 화면을 열 수 있는 역할을 정하는 permissions_ 키
 */
var SCREENS = {
  terms: { file: 'ui/screen_terms', title: '운영 기간', view: 'term.view' },
  roster: { file: 'ui/screen_roster', title: '명단 올리기', view: 'roster.edit' },
  schedule: { file: 'ui/screen_schedule', title: '자습 일정·블록', view: 'schedule.view' },
  sheet: { file: 'ui/screen_sheet', title: '출석부', view: 'sheet.view' },
  exceptions: { file: 'ui/screen_exceptions', title: '특이사항', view: 'exception.view' },
  seats: { file: 'ui/screen_seats', title: '좌석표', view: 'seat.view' },
  duty: { file: 'ui/screen_duty', title: '근무표', view: 'duty.view' },
  outs: { file: 'ui/screen_outs', title: 'OUT', view: 'out.view' },
  moves: { file: 'ui/screen_moves', title: '입퇴실·급식', view: 'status.list' },
  mealcount: { file: 'ui/screen_mealcount', title: '식수 집계', view: 'meal.count' }
};

/**
 * 화면 조각에 넘기는 주소 값(?tab=, ?date=, ?month=, ?student=, ?prefill=). 주소창 값은 믿을 수 없으므로 허용 목록·형식만 통과시킨다.
 * (HtmlService 화면은 iframe 안이라 실제 주소를 읽을 수 없어서 서버가 대신 넘긴다.) 결과는 JSON 문자열.
 */
function screenParams_(p) {
  var out = {};
  var tabs = ['requests', 'list', 'mine', 'week', 'month', 'record', 'entry', 'term', 'today', 'dismiss', 'rules', 'meal', 'move', 'history'];
  if (tabs.indexOf(String(p.tab)) >= 0) out.tab = String(p.tab);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ''))) out.date = String(p.date);
  if (/^\d{4}-\d{2}$/.test(String(p.month || ''))) out.month = String(p.month);
  if (String(p.prefill) === 'out2') out.prefill = 'out2';   // 2OUT 퇴실 확정 뒤 입퇴실 화면 미리 채우기
  if (/^[0-9a-fA-F-]{8,40}$/.test(String(p.student || ''))) out.student = String(p.student);   // 학생 id(UUID 모양만)
  return JSON.stringify(out).replace(/</g, '\\u003c');
}

/** 순수 판정: 이 역할들이 이 화면을 열 수 있는가 → {ok, screen} 또는 {ok:false, why} */
function screenResolve_(page, roles) {
  if (!Object.prototype.hasOwnProperty.call(SCREENS, String(page))) return { ok: false, why: '없는 화면' };
  var screen = SCREENS[page];
  var rule = permissions_()[screen.view];
  if (!rule || !hasAnyAllowedRole_(roles, rule.roles)) return { ok: false, why: '역할 불일치' };
  return { ok: true, screen: screen };
}

function renderPage_(file, vars, title) {
  var t = HtmlService.createTemplateFromFile(file);
  Object.keys(vars || {}).forEach(function (k) { t[k] = vars[k]; });
  return t.evaluate()
    .setTitle((title ? title + ' · ' : '') + APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 템플릿 안에서 다른 HTML 파일을 끼워 넣는다 */
function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

/** 홈 조각 파일 이름. 역할 코드는 ROLES 안에서만 고른다. */
function homeFileFor_(role) {
  if (ROLES.indexOf(role) < 0) throw new Error('알 수 없는 역할');
  return 'ui/home_' + role;
}

/* ───────────── 홈 화면 데이터 ───────────── */

/**
 * 역할별 홈 데이터.
 * @param {string} role 보고 싶은 홈의 역할(접속자가 가진 역할이어야 함)
 */
function getHomeData(role) {
  var user = requirePermission_('home.view', { role: role });
  var term = getCurrentTerm_();
  var base = {
    role: role,
    userName: user.name,
    today: today_(),
    termName: term ? term.name : '(운영 기간 없음)',
    appUrl: ScriptApp.getService().getUrl()
  };

  // 2단계 교사 홈 카드(각 기능 파일의 훅). ms = 훅마다 걸린 시간 — 확인 ③에서 재고, PRD §9 3초를 넘으면 카드별 호출로 바꾼다
  if (role !== 'student' && role !== 'parent') {
    base.ms = {};
    [['duty', dtyHomeInfo_], ['out', vioHomeInfo_], ['food', foodHomeInfo_]].forEach(function (h) {
      var t0 = Date.now();
      base[h[0]] = h[1](user, role);
      base.ms[h[0]] = Date.now() - t0;
    });
  }

  switch (role) {
    case 'admin':
      requirePermission_('admin.users.view');
      var users = readAll_('users').filter(function (u) { return isTruthy_(u.active); });
      var roleCounts = {};
      ROLES.forEach(function (r) { roleCounts[ROLE_LABELS[r]] = 0; });
      users.forEach(function (u) {
        parseRoles_(u.roles).forEach(function (r) { roleCounts[ROLE_LABELS[r]]++; });
      });
      base.counts = {
        students: termStudentIds_(term).length,
        allStudents: readAll_('students').length,
        guardianLinks: readAll_('guardian_links').length
      };
      base.roleCounts = roleCounts;
      return base;

    case 'attendance':
      base.studentCount = termStudentIds_(term).length;
      base.exc = excHomeInfo_(user);
      return base;

    case 'duty_manager':
      base.month = base.today.slice(0, 7);
      return base;

    case 'hall_teacher':
      var mine = readAll_('enrollments').filter(function (en) {
        return term && en.term_id === term.id && normalizeEmail_(en.teacher_email) === user.email;
      }).map(function (en) { return en.student_id; });
      base.students = studentsByIds_(mine).map(listItem_);
      base.exc = excHomeInfo_(user);
      return base;

    case 'homeroom':
      base.homeroomClass = user.homeroomClass || '(담당 학급 미지정)';
      var ids = termStudentIds_(term);
      base.students = readAll_('students').filter(function (s) {
        return ids.indexOf(s.id) >= 0 && sameClass_(user.homeroomClass, s.grade, s.class_no);
      }).sort(byClassNumber_).map(listItem_);
      base.exc = excHomeInfo_(user);
      return base;

    case 'student':
      var me = readAll_('students').filter(function (s) { return normalizeEmail_(s.email) === user.email; })[0];
      base.me = me ? studentSummary_(me, term) : null;
      return base;

    case 'parent':
      var childIds = readAll_('guardian_links').filter(function (g) {
        return normalizeEmail_(g.parent_email) === user.email;
      }).map(function (g) { return g.student_id; });
      base.children = studentsByIds_(childIds).map(function (s) {
        return { id: s.id, name: s.name, label: s.grade + '학년 ' + s.class_no + '반' };
      });
      return base;
  }
  throw new Error('알 수 없는 역할');
}

/** 학생 한 명 요약(학부모의 자녀 전환 탭, 담임·학사 교사 목록에서 사용) */
function getStudentSummary(studentId) {
  requirePermission_('student.view', { studentId: studentId });
  var s = findById_('students', studentId);
  return studentSummary_(s, getCurrentTerm_());
}

/* ───────────── 내부 도우미 ───────────── */

function termStudentIds_(term) {
  if (!term) return [];
  return readAll_('enrollments')
    .filter(function (en) { return en.term_id === term.id; })
    .map(function (en) { return en.student_id; });
}

function studentsByIds_(ids) {
  return readAll_('students').filter(function (s) { return ids.indexOf(s.id) >= 0; }).sort(byClassNumber_);
}

function byClassNumber_(a, b) {
  return String(a.student_no).localeCompare(String(b.student_no));
}

function listItem_(s) {
  return { id: s.id, name: s.name, grade: s.grade, classNo: s.class_no, number: s.number, gender: s.gender };
}

/** 화면에 내보내는 학생 요약. 이메일 같은 개인 연락처는 넣지 않는다. */
function studentSummary_(s, term) {
  var en = term ? readAll_('enrollments').filter(function (x) {
    return x.term_id === term.id && x.student_id === s.id;
  })[0] : null;
  var teacher = en ? readAll_('users').filter(function (u) {
    return normalizeEmail_(u.email) === normalizeEmail_(en.teacher_email);
  })[0] : null;
  return {
    id: s.id,
    name: s.name,
    studentNo: s.student_no,
    grade: s.grade,
    classNo: s.class_no,
    number: s.number,
    gender: s.gender,
    track: s.track || '-',
    enrolled: !!en,
    teacherName: teacher ? teacher.name : '-',
    veritas: en ? (isTruthy_(en.veritas) ? '참여' : '비참여') : '-',
    endType: en ? (en.end_type || '-') : '-'
  };
}

/* ───────────── 진단(6.1 로그인 검증) ───────────── */

/**
 * 진단 화면은 등록 여부와 관계없이 열 수 있다(미등록 시험 계정의 이메일 확인용).
 * 대신 "접속자 본인"의 정보만 돌려준다. Script Properties DIAG_ENABLED=true 일 때만 열리고,
 * 실사용 전에는 false 로 끈다.
 */
function isDiagEnabled_() {
  // 기본은 꺼짐. setup()이 0단계 검증용으로 true를 넣는다.
  return props_().getProperty('DIAG_ENABLED') === 'true';
}

function maskEmail_(email) {
  if (!email) return '';
  var parts = email.split('@');
  return parts[0].slice(0, 2) + '***@' + (parts[1] || '');
}

function collectDiag_() {
  var active = '';
  var effective = '';
  var tempKey = '';
  var errors = [];
  try { active = Session.getActiveUser().getEmail() || ''; } catch (e) { errors.push('getActiveUser: ' + e.message); }
  try { effective = Session.getEffectiveUser().getEmail() || ''; } catch (e) { errors.push('getEffectiveUser: ' + e.message); }
  try { tempKey = Session.getTemporaryActiveUserKey() || ''; } catch (e) { errors.push('getTemporaryActiveUserKey: ' + e.message); }

  var mode;
  if (!active) {
    mode = '접속자 이메일을 받지 못함 → 6.1 대안(별도 웹앱 + 신원 토큰) 필요';
  } else if (active.toLowerCase() === effective.toLowerCase()) {
    mode = '접속자 = 실행 계정 (배포한 본인이거나 "웹앱에 액세스하는 사용자로 실행")';
  } else {
    mode = '"나로 실행" + 접속자 이메일 확인됨 → 같은 웹앱으로 운영 가능';
  }

  var registered = '확인 불가(setup 전)';
  var roles = '';
  try {
    var u = getCurrentUser_();
    registered = u.registered ? '등록됨' : (u.email ? '미등록' : '이메일 없음');
    roles = u.roles.map(function (r) { return ROLE_LABELS[r]; }).join(', ');
  } catch (e) {
    errors.push('users 조회: ' + e.message);
  }

  return {
    activeEmail: active || '(빈 값)',
    effectiveUser: maskEmail_(effective) || '(빈 값)',
    tempKey: tempKey ? tempKey.slice(0, 8) + '…' : '(빈 값)',
    mode: mode,
    registered: registered,
    roles: roles || '-',
    checkedAt: nowIso_(),
    errors: errors
  };
}

/** 진단 화면의 "서버 호출로 다시 확인" 버튼. google.script.run 경로에서도 이메일이 잡히는지 본다. */
function diagPing() {
  if (!isDiagEnabled_()) throw new Error('진단이 꺼져 있습니다.');
  return collectDiag_();
}
