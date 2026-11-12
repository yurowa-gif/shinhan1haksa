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
 * 0단계: users, terms, students, enrollments, guardian_links + audit_log(권한 거부 기록용, 9절).
 * 1단계: status_changes, day_schedules, blocks, fixed_schedules, spaces, seats, seat_assignments + 기간별 탭(SCHEMA_TERM_TABS).
 * 2단계(결정 41): duty_slots, violation_rules, 기간별 violations, counsel_notes·status_changes 열 추가.
 * 3단계(결정 64): avoid_pairs, rooms, room_assignments.
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
    audit_log: ['sheet', 'row_id', 'action', 'before', 'after', 'detail'],

    /* ───── 1단계(docs/plan/stage1.md 5절, decisions.md 20 승인) ───── */
    // 학사·기숙사·조식·석식 상태 변경 기록. 기간별로 나누지 않는다(상태는 학기를 넘어 누적).
    // item: 학사·기숙사·조식·석식, status: 유효·취소, source: 명단업로드·F6·F7
    status_changes: ['student_id', 'item', 'value', 'requested_at', 'effective_date', 'effective_date_auto',
      'reason', 'doc_submitted', 'linked_change_id', 'source', 'status', 'memo', 'cancel_reason'],   // cancel_reason: 결정 41
    // 날짜별 자습 일정. operating: TRUE/FALSE, status: 유효·취소
    day_schedules: ['date', 'operating', 'start', 'end', 'day_type', 'memo', 'status'],
    // 요일 유형별 출석 블록. term_type: 학기·방학, day_type: mon_thu·fri·sat·sun·특별 코드, status: 유효·취소
    blocks: ['term_type', 'day_type', 'seq', 'start', 'end', 'label', 'status'],
    // 학생 월별 고정 일정('학' 학원·'가' 가정). blocks: 'ALL' 또는 'HH:mm-HH:mm;…'
    fixed_schedules: ['student_id', 'month', 'weekday', 'blocks', 'code', 'submitted_at', 'parent_agreed_at',
      'teacher_confirmed_at', 'status'],
    // 공간(자습실·SA실)과 좌석 격자. gender: 남·여·혼성, kind: 좌석·기둥·비상문·창문
    spaces: ['name', 'gender', 'rows', 'cols', 'sort_order', 'status', 'memo'],
    seats: ['space_id', 'row', 'col', 'label', 'kind', 'status'],
    // 기간별 좌석 배정. valid_from·valid_to가 비면 기간 전체. status: 배정·취소
    seat_assignments: ['term_id', 'seat_id', 'student_id', 'valid_from', 'valid_to', 'status', 'memo'],

    /* ───── 2단계(docs/plan/stage2.md 5절, decisions.md 41 승인) ───── */
    // 근무 칸. 기간별로 나누지 않는다(방학에도 근무, 집계는 달 단위). 근무자는 이메일. 마지막 교대만 남고 중간 단계는 audit_log
    duty_slots: ['date', 'slot', 'end_time', 'original_email', 'actual_email', 'swapped_at', 'swapped_by', 'status', 'memo'],
    // F4 위반 항목. 자동 항목 이름 '무단 지각·결석·이탈'은 바꾸지 않는다(R5가 이 이름으로 읽는다)
    violation_rules: ['name', 'description', 'active', 'sort_order'],

    /* ───── 3단계(결정 64 승인) ───── */
    // 떨어뜨릴 짝. scope: 좌석·방·둘 다. status: 유효·취소. 사유·짝은 관리자·학사 교사만 본다(학생·학부모·담임 응답에 내보내지 않음)
    avoid_pairs: ['student_a', 'student_b', 'scope', 'reason', 'status'],
    // 호실. gender 남·여, capacity 정원, status 유효·취소. 기본 35실은 setup()·seedDefaultRooms()가 채운다(관리자가 고친다, 결정 24)
    rooms: ['floor', 'room_no', 'gender', 'capacity', 'sort_order', 'status', 'memo'],
    // 기간별 방 배정(seat_assignments와 같은 모양). valid_from·valid_to가 비면 기간 전체. status: 배정·취소
    room_assignments: ['term_id', 'room_id', 'student_id', 'valid_from', 'valid_to', 'status', 'memo']
  },
  counsel: {
    // target·linked_violation_id·cancel_reason은 2단계(결정 41). 6단계 열은 그때 setup이 제자리에 끼운다
    counsel_notes: ['student_id', 'date', 'teacher_email', 'type', 'target', 'linked_violation_id', 'content',
      'show_to_parent', 'status', 'cancel_reason']
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
  ['exception.types', '병결,병지각,병조퇴,가정사유(가족여행 포함),학원(보강 포함),학사 외 프로그램,학사 내 프로그램(파워클래스·면접특강 등),미인정지각,미인정조퇴,미인정결석,기타', '사전 특이사항 유형'],
  ['exception.auto_out_types', '미인정지각,미인정조퇴,미인정결석', '기록 즉시 자동 1OUT이 되는 유형'],
  ['timetable.submit_start_day', '25', '시간표 제출 시작일(매월)'],
  ['timetable.submit_end_day', 'last', '시간표 제출 마감(말일)'],
  ['attendance.legend', '○ 출석, × 결석, △ 지각, 조 조퇴, 학 학원, 가 가정', '출석부 범례'],
  // 1단계(decisions.md 23, plan 5절 3번)
  ['study.fri.start', '18:30', '금요일 자습 시작'],
  ['study.fri.end', '23:00', '금요일 자습 종료(23시 전원 귀가)'],
  ['attendance.end_type_day_types', 'mon_thu', '23:00 종료 표시를 하는 요일 유형(쉼표 구분)'],
  ['attendance.end_label', '정상 종료', '23:00 종료 학생의 마지막 블록 표시'],
  ['exception.type_short', '병결:병결,병지각:병지,병조퇴:병조,가정사유(가족여행 포함):가정,학원(보강 포함):학원,학사 외 프로그램:외부,학사 내 프로그램(파워클래스·면접특강 등):내부,미인정지각:무지,미인정조퇴:무조,미인정결석:무결,기타:기타', '출석부 칸에 쓰는 특이사항 유형 약어(유형:약어, 쉼표 구분)'],
  ['print.title', '신한학사 출석부', '출석부 머리말 제목'],
  ['print.vacant_label', '공석', '빈 좌석 표기']
];

/** 탭의 전체 헤더(id + 본문 + 공통 꼬리) */
function headersFor_(kind, sheetName) {
  var body = SCHEMA[kind] && SCHEMA[kind][sheetName];
  if (!body && kind === 'db' && termTabBase_(sheetName)) body = SCHEMA_TERM_TABS[termTabBase_(sheetName)];
  if (!body) throw new Error('정의되지 않은 탭: ' + kind + '/' + sheetName);
  return ['id'].concat(body, COMMON_TAIL);
}


/**
 * 운영 기간별 탭(PRD 6.2). 탭 이름 = 기본 이름 + '_' + 기간 id 앞 8자(기간 이름을 바꿔도 깨지지 않는다).
 * 모두 운영 DB(db) 파일에 만든다. 기본 이름 → 본문 열.
 */
var SCHEMA_TERM_TABS = {
  // status: 요청·확정·취소. 기간 입력은 날짜마다 1행, group_id로 묶는다.
  // blocks: 'ALL' 또는 'HH:mm-HH:mm;…'(블록 설정이 바뀌어도 기록의 뜻이 유지되도록 시각 범위로 쓴다)
  exceptions: ['term_id', 'group_id', 'student_id', 'date', 'blocks', 'type', 'reason', 'status',
    'requested_by', 'requested_at', 'confirmed_by', 'confirmed_at', 'cancel_reason'],
  // F4 OUT(결정 41). 학기마다 초기화되므로 기간별. 열은 R5(OutRules.gs)·vocabulary.md violations와 같다
  violations: ['term_id', 'student_id', 'occurred_at', 'rule_id', 'rule_name', 'memo', 'detected_by', 'entered_by',
    'status', 'source', 'source_exception_id', 'cancel_reason']
};

/** 기간별 탭 이름. 예: termSheetName_('exceptions', 'a1b2c3d4-…') → 'exceptions_a1b2c3d4' */
function termSheetName_(base, termId) {
  if (!Object.prototype.hasOwnProperty.call(SCHEMA_TERM_TABS, base)) throw new Error('기간별 탭이 아닙니다: ' + base);
  var head = String(termId || '').slice(0, 8);
  if (!/^[0-9A-Za-z]{8}$/.test(head)) throw new Error('운영 기간 id가 올바르지 않습니다.');
  return base + '_' + head;
}

/** 탭 이름이 기간별 탭이면 기본 이름, 아니면 '' */
function termTabBase_(sheetName) {
  var name = String(sheetName || '');
  var bases = Object.keys(SCHEMA_TERM_TABS);
  for (var i = 0; i < bases.length; i++) {
    var b = bases[i];
    if (name.indexOf(b + '_') === 0 && /^[0-9A-Za-z]{8}$/.test(name.slice(b.length + 1))) return b;
  }
  return '';
}

/**
 * 기본 출석 블록(PRD 3.3). term_type '학기'만 넣는다.
 * ASSUMPTION: 방학 블록은 따로 넣지 않는다 — 방학은 학기 블록과 같게 쓴다(plan 4절 6번 대체물).
 */
var DEFAULT_BLOCKS = {
  mon_thu: [['18:00', '20:00'], ['20:00', '22:00'], ['22:00', '24:00']],
  fri: [['18:00', '19:30'], ['19:30', '22:00'], ['22:00', '23:00']],
  sat: [['09:00', '12:00'], ['14:00', '15:30'], ['15:30', '17:00']],
  sun: [['14:00', '15:30'], ['15:30', '17:00'], ['19:00', '20:30'], ['20:30', '22:00']]
};
var DEFAULT_BLOCK_DAY_ORDER = ['mon_thu', 'fri', 'sat', 'sun'];

/** violation_rules 기본 항목(PRD F4, 결정 41) [name, description]. 이 순서가 sort_order 1~4 */
var DEFAULT_VIOLATION_RULES = [
  ['무단 지각·결석·이탈', '미인정 특이사항이 확정되면 자동'],
  ['휴대폰·전자기기', ''],
  ['자습 분위기 방해(과도한 수면, 교사 지시 불이행 포함)', ''],
  ['기숙사 생활 위반', '']
];

/** '18:00'→'18', '09:00'→'09', '19:30'→'19:30', '24:00'→'24' (머리말 표기, R1 schedBlockLabel_과 같다) */
function schemaHmShort_(hm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm));
  if (!m) return String(hm);
  var hh = (m[1].length === 1 ? '0' : '') + m[1];
  return m[2] === '00' ? hh : hh + ':' + m[2];
}

/** blocks 탭에 넣을 기본 행(id·공통 꼬리 제외) */
function defaultBlockRows_() {
  var rows = [];
  DEFAULT_BLOCK_DAY_ORDER.forEach(function (dayType) {
    DEFAULT_BLOCKS[dayType].forEach(function (b, i) {
      rows.push({
        term_type: '학기', day_type: dayType, seq: String(i + 1), start: b[0], end: b[1],
        label: schemaHmShort_(b[0]) + '–' + schemaHmShort_(b[1]), status: '유효'
      });
    });
  });
  return rows;
}
