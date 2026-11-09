/**
 * 로그인·권한 (PRD 4절, 6.1절).
 *
 * 모든 서버 함수는 첫 줄에서 requirePermission_(action, context)을 부른다.
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
// 함수로 둔 이유: 파일 맨 위(전역)에서 다른 파일의 ROLES를 쓰면 파일 로드 순서에 따라
// "ROLES is not defined"가 날 수 있다. 전역 코드에서는 다른 파일의 값을 참조하지 않는다.
function permissions_() {
  return {
    // 홈 화면: 요청한 역할(context.role)을 실제로 가진 사람만
    'home.view': { roles: ROLES, scope: 'ownRole' },
    // 학생 한 명의 기본 정보 보기
    // wideView: 보기 키만 — 학사 교사도 이번 기간 학사생 전체를 본다(결정 45). 쓰기 키·counsel.view에는 달지 않는다
    'student.view': { roles: ['admin', 'attendance', 'hall_teacher', 'homeroom', 'student', 'parent'], scope: 'student', wideView: true },
    // 계정 목록 보기(관리자 홈 요약)
    'admin.users.view': { roles: ['admin'] },
    // 운영 기간: 교사 계정은 보기, 추가·수정은 관리자만
    'term.view': { roles: ['admin', 'attendance', 'hall_teacher', 'duty_manager', 'homeroom'] },
    'term.edit': { roles: ['admin'] },
    // 명단 업로드: 관리자만
    'roster.edit': { roles: ['admin'] },
    // 출석부(F2): 관리자·출결 담당·학사 교사만(담임·학생·학부모는 거부)
    'sheet.view': { roles: ['admin', 'attendance', 'hall_teacher'] },
    // 자습 일정·블록: 교사 역할은 보기, 수정은 관리자만
    'schedule.view': { roles: ['admin', 'attendance', 'hall_teacher', 'duty_manager', 'homeroom'] },
    'schedule.edit': { roles: ['admin'] },
    // 사전 특이사항(F1): 출결 담당·관리자는 입력(바로 확정)·확정, 담임(자기 반)·학사 교사(담당 학생)는 요청만, 취소는 출결 담당·관리자 또는 본인 요청
    // wideView는 목록·학생별 보기 범위(excVisibleIds_)에서 쓴다. 입력 화면의 학생 선택 목록은 넓히지 않는다
    'exception.view': { roles: ['admin', 'attendance', 'hall_teacher', 'homeroom'], wideView: true },
    // noDuty: 근무일(isOnDuty)은 범위에 넣지 않는다 — 저장은 담당·담임·출결·관리자만(ASSUMPTION: F3 이후에도 근무일 교사가 모든 학생에게 요청하지는 못하게)
    'exception.save': { roles: ['admin', 'attendance', 'hall_teacher', 'homeroom'], scope: 'student', noDuty: true },
    'exception.confirm': { roles: ['admin', 'attendance'] },
    'exception.cancel': { roles: ['admin', 'attendance', 'hall_teacher', 'homeroom'] },
    // 좌석: 보기는 교사 역할, 학생 배정은 관리자·학사 교사, 격자(공간 구조) 편집은 관리자
    'seat.view': { roles: ['admin', 'attendance', 'hall_teacher', 'duty_manager', 'homeroom'] },
    'seat.edit': { roles: ['admin', 'hall_teacher'] },
    'seat.layout': { roles: ['admin'] },
    // ── 2단계(docs/plan/stage2.md 2절 "2단계 권한 키"). 학생·학부모는 3단계(F14)에서 연다 ──
    // 근무표(F3): 보기는 1학사 교사(담임만인 계정 제외), 편성은 관리자·근무표 담당자, 교대는 본인 칸(함수 안에서 확인), 기록표 파일은 관리자·근무표 담당자
    'duty.view': { roles: ['admin', 'duty_manager', 'hall_teacher', 'attendance'] },
    'duty.edit': { roles: ['admin', 'duty_manager'] },
    // 그날 "운영 안 함" 켜고 끄기(운영 여부·메모만): 관리자는 자습 일정에서, 근무표 담당자는 근무표에서(결정 44)
    'duty.operating': { roles: ['admin', 'duty_manager'] },
    'duty.swap': { roles: ['admin', 'duty_manager', 'hall_teacher'] },
    'duty.record': { roles: ['admin', 'duty_manager'] },   // 기록표 파일(엑셀): 관리자·근무표 담당자(결정 48)
    // OUT(F4): 보기 범위는 함수 안(vioVisibleIds_). 1학사 교사(학사 교사·출결 담당)는 학사생 전체, 담임은 자기 반(결정 45)
    'out.view': { roles: ['admin', 'attendance', 'hall_teacher', 'homeroom'] },
    // dutyWindow: 발생일(ymd)의 실제 근무자가 ymd ≤ 오늘 ≤ ymd+N 동안 통과(isOnDutyFor_, C8s). 없으면 0 = ymd가 오늘인 근무자만
    'out.save': { roles: ['admin', 'hall_teacher'], scope: 'student', dutyWindow: 1 },
    'out.cancel': { roles: ['admin'] },
    'out.rules': { roles: ['admin'] },
    'out.dismiss': { roles: ['admin'] },
    // 2OUT 학부모 면담(F12): 출결 담당은 넣지 않는다(넣으면 canAccessStudentByFacts_가 학사생 전체를 허용한다)
    'counsel.view': { roles: ['admin', 'hall_teacher', 'homeroom'], scope: 'student', noDuty: true },
    'counsel.save': { roles: ['hall_teacher'], scope: 'student', noDuty: true },
    'counsel.cancel': { roles: ['hall_teacher'] },   // 행 id만 받는 첫 줄(역할만), 범위는 락 안에서 counsel.save로 다시
    // 입퇴실·급식(F6·F7): list는 화면 열기·행 id 함수 첫 줄(역할만), 저장은 근무일 제외
    // 보기: 1학사 교사(학사 교사·출결 담당)는 학사생 전체, 담임은 자기 반(결정 45). 저장은 담당·관리자
    'status.list': { roles: ['admin', 'attendance', 'hall_teacher', 'homeroom'] },
    'status.view': { roles: ['admin', 'attendance', 'hall_teacher', 'homeroom'], scope: 'student', wideView: true },
    'status.edit': { roles: ['admin', 'hall_teacher'], scope: 'student', noDuty: true },
    'meal.count': { roles: ['admin'] }
  };
}

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
    var rows = readAll_('users');
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
  var terms = readAll_('terms');
  // 시작일이 늦은 순(겹치면 나중에 시작한 기간), 아직 시작하지 않은 기간은 고르지 않는다
  var started = terms.filter(function (x) { return x.start_date && x.start_date <= t; })
    .sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; });
  var inRange = started.filter(function (x) { return t <= x.end_date; });
  return inRange[0] || started[0] || null;
}

/** 날짜가 속한 운영 기간(겹치면 나중에 시작한 것). 없으면 null. terms를 안 주면 시트에서 읽는다 */
function termOnDate_(ymd, terms) {
  var hit = null;
  (terms || readAll_('terms')).forEach(function (t) {
    if (!t.start_date || !t.end_date || ymd < t.start_date || ymd > t.end_date) return;
    if (!hit || t.start_date >= hit.start_date) hit = t;
  });
  return hit;
}

/**
 * 근무교사 시간 범위(PRD §12): ymd(발생일, 없으면 오늘)의 실제 근무자이고 ymd ≤ 오늘 ≤ ymd + windowDays면 참(windowDays 기본 0).
 * 예비 지정만·교대로 넘긴 원래 근무자·취소된 칸은 거짓. 근무표(duty_slots)를 읽지 못하면(탭 없음 등) 오류 없이 거짓 — 권한은 넓히지 않는다.
 * 규칙은 R8 dutyIsOn_가 판정하고 여기서는 시트를 읽기만 한다(readAll_은 실행당 한 번 읽어 쓴다).
 */
function isOnDutyFor_(email, ymd, windowDays) {
  var rows;
  try { rows = readAll_('duty_slots'); } catch (e) {
    // 탭이 없으면 조용히 거짓. 그 밖의 읽기 오류는 거짓으로 두되 알아볼 수 있게 남긴다
    if (String(e && e.message).indexOf('탭이 없습니다') < 0) console.warn('근무표를 읽지 못해 근무교사 범위를 적용하지 않았습니다: ' + (e && e.message));
    return false;
  }
  var today = today_();
  return dutyIsOn_(rows, email, ymd || today, today, windowDays);
}

/**
 * 학생 한 명에 대한 범위 판정에 필요한 사실을 모은다.
 */
function studentFacts_(user, student, ymd, windowDays, noDuty) {
  // ymd(YYYY-MM-DD)를 주면 그 날짜가 속한 운영 기간으로 판정한다(다음 기간 신입생 입력 등). 없으면 오늘의 기간.
  // 어떤 기간에도 속하지 않는 날짜는 오늘의 기간으로 판정한다(저장 단계의 입력 검사가 "기간에 속하지 않음"으로 막는다)
  var term = (ymd ? termOnDate_(ymd) : null) || getCurrentTerm_();
  var termId = term ? term.id : '';
  var enrolled = readAll_('enrollments').some(function (en) { return en.term_id === termId && en.student_id === student.id; });
  var facts = {
    isEnrolled: enrolled,
    isOwn: !!student.email && normalizeEmail_(student.email) === user.email,
    isGuardian: readAll_('guardian_links').some(function (g) {
      return normalizeEmail_(g.parent_email) === user.email && g.student_id === student.id;
    }),
    isAssigned: readAll_('enrollments').some(function (en) {
      return en.term_id === termId && en.student_id === student.id &&
        normalizeEmail_(en.teacher_email) === user.email;
    }),
    // 근무교사: 열람 키는 ymd = 오늘의 실제 근무자만(windowDays 0), out.save는 발생일의 근무자가 다음 날까지(규칙의 dutyWindow). 화면이 보낸 ymd로는 넓어지지 않는다
    isOnDuty: !noDuty && hasRole_(user, 'hall_teacher') && isOnDutyFor_(user.email, ymd || '', windowDays || 0),   // noDuty 키는 근무표를 읽지 않는다
    // 담임은 "자기 반 학사생"만: 같은 반 + 이번 운영 기간 등록 학생
    inHomeroom: sameClass_(user.homeroomClass, student.grade, student.class_no) && enrolled
  };
  return facts;
}

/** 담임 학급 "1-3"(또는 "1-03", "1 - 3")과 학생 학년·반이 같은지 */
function sameClass_(homeroomClass, grade, classNo) {
  var m = String(homeroomClass || '').match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!m) return false;
  return parseInt(m[1], 10) === parseInt(grade, 10) && parseInt(m[2], 10) === parseInt(classNo, 10);
}

/**
 * 순수 판정 함수(단위 테스트 대상). 시트를 읽지 않는다.
 * @param {string[]} roles 접속자 역할
 * @param {Object} facts studentFacts_ 결과
 * @param {string[]} allowedRoles 이 기능에 허용된 역할
 * @param {boolean=} wide 보기 키(wideView): 학사 교사도 이번 기간 학사생이면 통과
 */
function canAccessStudentByFacts_(roles, facts, allowedRoles, wide) {
  var allowed = function (r) { return roles.indexOf(r) >= 0 && allowedRoles.indexOf(r) >= 0; };
  if (allowed('admin')) return true;
  // 출결 담당: 이번 기간 학사생 전체
  if (allowed('attendance') && facts.isEnrolled) return true;
  // 근무일이어도 이번 기간 등록 학생에게만(미등록 학생은 제외). 보기 키(wide)는 학사생 전체
  if (allowed('hall_teacher') && (facts.isAssigned || (facts.isOnDuty && facts.isEnrolled) || (wide && facts.isEnrolled))) return true;
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
 * @param {string} action permissions_()의 키
 * @param {Object=} context 범위 판정에 필요한 값(예: {studentId}, {role})
 * @return {Object} 접속자(user)
 */
function requirePermission_(action, context) {
  context = context || {};
  var user = getCurrentUser_();
  var deny = function (why) {
    logDenied_(user.email, action, why + (context ? ' ' + JSON.stringify(context) : ''));
    throw new Error('권한이 없습니다.');
  };

  if (!user.email) deny('이메일 확인 불가');
  if (!user.registered) deny('등록되지 않은 계정');

  var rule = permissions_()[action];
  if (!rule) deny('정의되지 않은 기능');
  if (!hasAnyAllowedRole_(user.roles, rule.roles)) deny('역할 불일치');

  if (rule.scope === 'ownRole') {
    if (!context.role || !hasRole_(user, context.role)) deny('본인 역할 아님');
  } else if (rule.scope === 'student') {
    // ymd가 주어졌는데 날짜가 아니면 오늘로 대신하지 않고 거부한다(공백·형식 우회 방지). 빈 값은 "없음" = 오늘의 기간
    var ymd = context.ymd === undefined || context.ymd === null || context.ymd === '' ? '' : context.ymd;
    if (ymd && (typeof ymd !== 'string' || !ymdIsValid_(ymd))) deny('날짜 형식');
    var student = context.studentId ? findById_('students', context.studentId) : null;
    if (!student) deny('학생 없음');
    var facts = studentFacts_(user, student, ymd, rule.dutyWindow, rule.noDuty);
    if (rule.noDuty) facts.isOnDuty = false;
    if (!canAccessStudentByFacts_(user.roles, facts, rule.roles, !!rule.wideView)) deny('범위 밖 학생');
  }
  return user;
}
