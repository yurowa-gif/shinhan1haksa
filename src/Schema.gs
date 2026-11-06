/**
 * 시트 구조 정의 (PRD 7절).
 * 모든 탭: 첫 열 id, 끝에 created_at, created_by, updated_at, updated_by.
 * 여기 적힌 열 이름이 시트 1행 헤더가 된다. 구조를 바꿀 때는 먼저 확인받는다(CLAUDE.md).
 */

var COMMON_TAIL = ['created_at', 'created_by', 'updated_at', 'updated_by'];

/** 파일 종류 → Script Properties 키 */
var DB_FILES = {
  db: { prop: 'DB_ID', title: '신한1학사_운영DB' },
  counsel: { prop: 'COUNSEL_ID', title: '신한1학사_상담일지' },
  config: { prop: 'CONFIG_ID', title: '신한1학사_설정' }
};

/** 역할 코드 (users.roles 열에 쉼표로 여러 개 가능) */
var ROLES = ['admin', 'duty_manager', 'attendance', 'hall_teacher', 'homeroom', 'student', 'parent'];

var ROLE_LABELS = {
  admin: '관리자',
  duty_manager: '근무표 담당자',
  attendance: '출결 담당',
  hall_teacher: '학사 교사',
  homeroom: '담임',
  student: '학생',
  parent: '학부모'
};

/** 기본 홈을 고를 때의 우선순위 */
var ROLE_PRIORITY = ['admin', 'attendance', 'hall_teacher', 'duty_manager', 'homeroom', 'parent', 'student'];

/**
 * 탭별 본문 열(id·공통 꼬리 열 제외).
 * 0단계 범위: users, terms, students, enrollments, guardian_links + audit_log(권한 거부 기록용, 9절).
 */
var SCHEMA = {
  db: {
    // ASSUMPTION: 한 사람이 여러 역할(예: 관리자 겸 학사 교사)을 가질 수 있어 roles는 쉼표 구분 목록으로 둔다.
    // homeroom_class는 담임 학급 "학년-반" 형식(예: 1-3).
    users: ['email', 'name', 'roles', 'homeroom_class', 'active', 'memo'],
    terms: ['name', 'type', 'start_date', 'end_date', 'memo'],
    students: ['student_no', 'name', 'gender', 'grade', 'class_no', 'number', 'track', 'email', 'memo'],
    enrollments: ['term_id', 'student_id', 'teacher_email', 'veritas', 'commute_type', 'end_type', 'memo'],
    guardian_links: ['parent_email', 'student_id', 'relation', 'memo'],
    // 변경자·시각은 공통 열 created_by·created_at을 쓴다.
    audit_log: ['sheet', 'row_id', 'action', 'before', 'after', 'detail']
  },
  counsel: {
    counsel_notes: ['student_id', 'date', 'teacher_email', 'type', 'content', 'show_to_parent', 'status']
  },
  config: {
    settings: ['key', 'value', 'description']
  }
};

/** 설정 스프레드시트 기본값 (PRD 3.3, 5절 F7, 7절 설정) */
var DEFAULT_SETTINGS = [
  ['study.weekday.start', '18:30', '평일 자습 시작'],
  ['study.weekday.end', '23:50', '평일 자습 종료'],
  ['study.sat.start', '09:00', '토요일 자습 시작'],
  ['study.sat.end', '17:00', '토요일 자습 종료'],
  ['study.sun.start', '14:00', '일요일 자습 시작'],
  ['study.sun.end', '22:00', '일요일 자습 종료'],
  // 2026-11-06 결정(docs/decisions.md 2번): 실시·일반 석식 변경은 11:30 전 신청 시 당일 적용
  ['meal.morning_cutoff', '11:30', '급식 실시·일반 석식 변경 신청 당일 적용 마감 시각'],
  // 2026-11-06 결정(docs/decisions.md 8번). 쉼표 구분, 관리자가 수정
  ['exception.types', '병결,병지각,병조퇴,가정사유(가족여행 포함),학원(보강 포함),학사 외 프로그램,학사 내 프로그램,미인정지각,미인정조퇴,미인정결석,기타', '사전 특이사항 유형'],
  ['exception.auto_out_types', '미인정지각,미인정조퇴,미인정결석', '기록 즉시 자동 1OUT이 되는 유형'],
  ['timetable.submit_start_day', '25', '시간표 제출 시작일(매월)'],
  ['timetable.submit_end_day', 'last', '시간표 제출 마감(말일)'],
  ['attendance.legend', '○ 출석, × 결석, △ 지각, 조 조퇴, 학 학원, 가 가정', '출석부 범례']
];

/** 탭의 전체 헤더(id + 본문 + 공통 꼬리) */
function headersFor_(kind, sheetName) {
  var body = SCHEMA[kind] && SCHEMA[kind][sheetName];
  if (!body) throw new Error('정의되지 않은 탭: ' + kind + '/' + sheetName);
  return ['id'].concat(body, COMMON_TAIL);
}
