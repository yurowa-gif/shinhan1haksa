/**
 * 로그인·권한 (PRD 4절, 6.1절).
 *
 * 모든 서버 함수는 첫 줄에서 requirePermission(action, context)을 부른다.
 * 화면에서 버튼을 숨기는 것은 편의일 뿐 보안 장치가 아니다.
 *
 * 판정 = 역할(roles) + 범위 조건(scope).
 *  - 역할: users 탭의 roles(쉼표 구분)
 *  - 범위: 학생 단위 접근은 canAccessStudentByFacts_로 판정
 */

/**
 * 기능별 권한표. roles 중 하나라도 가지면 1차 통과, scope가 있으면 범위까지 확인한다.
 * 새 기능을 만들 때 여기에 한 줄씩 추가한다.
 */
var PERMISSIONS = {
  // 홈 화면: 요청한 역할(context.role)을 실제로 가진 사람만
  'home.view': { roles: ROLES, scope: 'ownRole' },
  // 학생 한 명의 기본 정보 보기
  'student.view': { roles: ['admin', 'hall_teacher', 'homeroom', 'student', 'parent'], scope: 'student' },
  // 계정 목록 보기(관리자 홈 요약)
  'admin.users.view': { roles: ['admin'] }
};

/** 한 번의 실행 안에서 접속자 정보를 다시 읽지 않도록 */
var _authMemo = { user: undefined };

function normalizeEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

function isTruthy_(v) {
  var s = String(v || '').trim().toLowerCase();
  return ['true', 'o', 'y', 'yes', '1', '예', '활성'].indexOf(s) >= 0;
}

/** users.roles 문자열 → 알려진 역할 코드 배열(우선순위 순) */
function parseRoles_(raw) {
  var list = String(raw || '').split(/[,\s·]+/).map(function (r) { return r.trim().toLowerCase(); });
  return ROLE_PRIORITY.filter(function (r) { return list.indexOf(r) >= 0; });
}

/** 접속자 이메일. 개인 gmail + "나로 실행"이면 빈 값이 올 수 있다(6.1 위험). */
function getActiveEmail_() {
  return normalizeEmail_(Session.getActiveUser().getEmail());
}

/**
 * 접속자 정보.
 * @return {{email:string, registered:boolean, name:string, roles:string[], homeroomClass:string, userId:string}}
 */
function getCurrentUser_() {
  if (_authMemo.user !== undefined) return _authMemo.user;
  var email = getActiveEmail_();
  var user = { email: email, registered: false, name: '', roles: [], homeroomClass: '', userId: '' };
  if (email) {
    var rows = readAll('users');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (normalizeEmail_(r.email) !== email || !isTruthy_(r.active)) continue;
      var roles = parseRoles_(r.roles);
      if (!roles.length) continue;
      user.registered = true;
      user.name = r.name;
      user.roles = roles;
      user.homeroomClass = String(r.homeroom_class || '').trim();
      user.userId = r.id;
      break;
    }
  }
  _authMemo.user = user;
  return user;
}

function hasRole_(user, role) {
  return user.roles.indexOf(role) >= 0;
}

/** 오늘 날짜가 속한 운영 기간. 없으면 오늘 이전에 시작한 가장 최근 기간. */
function getCurrentTerm_() {
  var t = today_();
  var terms = readAll('terms');
  var inRange = terms.filter(function (x) { return x.start_date <= t && t <= x.end_date; });
  if (inRange.length) return inRange[0];
  var past = terms.filter(function (x) { return x.start_date <= t; })
    .sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; });
  return past[0] || terms[0] || null;
}

/**
 * 근무교사(오늘 근무자)인지. F3 근무표(duty_slots)가 생기면 채운다.
 * TODO(F3): duty_slots에서 오늘 날짜의 실제 근무자 이메일과 비교
 */
function isOnDutyToday_(email) {
  return false;
}

/**
 * 학생 한 명에 대한 범위 판정에 필요한 사실을 모은다.
 */
function studentFacts_(user, student) {
  var term = getCurrentTerm_();
  var termId = term ? term.id : '';
  var facts = {
    isOwn: !!student.email && normalizeEmail_(student.email) === user.email,
    isGuardian: readAll('guardian_links').some(function (g) {
      return normalizeEmail_(g.parent_email) === user.email && g.student_id === student.id;
    }),
    isAssigned: readAll('enrollments').some(function (en) {
      return en.term_id === termId && en.student_id === student.id &&
        normalizeEmail_(en.teacher_email) === user.email;
    }),
    isOnDuty: hasRole_(user, 'hall_teacher') && isOnDutyToday_(user.email),
    inHomeroom: !!user.homeroomClass &&
      user.homeroomClass === String(student.grade) + '-' + String(student.class_no)
  };
  return facts;
}

/**
 * 순수 판정 함수(단위 테스트 대상). 시트를 읽지 않는다.
 * @param {string[]} roles 접속자 역할
 * @param {Object} facts studentFacts_ 결과
 * @param {string[]} allowedRoles 이 기능에 허용된 역할
 */
function canAccessStudentByFacts_(roles, facts, allowedRoles) {
  var allowed = function (r) { return roles.indexOf(r) >= 0 && allowedRoles.indexOf(r) >= 0; };
  if (allowed('admin')) return true;
  if (allowed('hall_teacher') && (facts.isAssigned || facts.isOnDuty)) return true;
  if (allowed('homeroom') && facts.inHomeroom) return true;
  if (allowed('student') && facts.isOwn) return true;
  if (allowed('parent') && facts.isGuardian) return true;
  return false;
}

/**
 * 순수 판정 함수: 역할 1차 통과 여부.
 */
function hasAnyAllowedRole_(roles, allowedRoles) {
  return roles.some(function (r) { return allowedRoles.indexOf(r) >= 0; });
}

/**
 * 모든 서버 함수 첫 줄에서 호출한다.
 * @param {string} action PERMISSIONS의 키
 * @param {Object=} context 범위 판정에 필요한 값(예: {studentId}, {role})
 * @return {Object} 접속자(user)
 */
function requirePermission(action, context) {
  context = context || {};
  var user = getCurrentUser_();
  var deny = function (why) {
    logDenied_(user.email, action, why + (context ? ' ' + JSON.stringify(context) : ''));
    throw new Error('권한이 없습니다.');
  };

  if (!user.email) deny('이메일 확인 불가');
  if (!user.registered) deny('등록되지 않은 계정');

  var rule = PERMISSIONS[action];
  if (!rule) deny('정의되지 않은 기능');
  if (!hasAnyAllowedRole_(user.roles, rule.roles)) deny('역할 불일치');

  if (rule.scope === 'ownRole') {
    if (!context.role || !hasRole_(user, context.role)) deny('본인 역할 아님');
  } else if (rule.scope === 'student') {
    var student = context.studentId ? findById('students', context.studentId) : null;
    if (!student) deny('학생 없음');
    if (!canAccessStudentByFacts_(user.roles, studentFacts_(user, student), rule.roles)) deny('범위 밖 학생');
  }
  return user;
}
