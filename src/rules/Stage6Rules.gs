/**
 * 6단계(상담·진로진학, F15~F17) 공통 규칙: 누가 어떤 칸을 보나(공개 판정표), 학부모 공개 항목, 쓰기 가능 여부, 학생 타임라인.
 * RULES 세션 소유(R24). 근거: docs/plan/stage6-rules-draft.md 2절, 결정 11·15·89~97, CLAUDE.md 6.
 * 순수 함수만 둔다(Apps Script 서비스·현재 시각 읽기 금지). 시트 행을 그대로 받고 아무것도 쓰지 않는다.
 *
 * 열 이름(시트 행 키) = S6-0 Schema(docs/plan/s6-0-design.md 2절, 시트 열이 기준):
 *   career_profiles: id, term_id, student_id, version, hopes, targets, interests, strengths, concerns, parent_fields, submitted_at, status, cancel_reason
 *   course_plans:    id, term_id, student_id, entry_year, grade, semester, choice_group, course, state(계획·확정), confirmed_by, confirmed_at,
 *                    show_to_parent, status(유효·취소), cancel_reason
 *   inquiry_records: id, term_id, student_id, source_id, recorded_at, source, standards, subject, title, question, liked,
 *                    progress, result_link, memo, file_id, name_mismatch, show_to_parent, status, cancel_reason
 *   feedback:        id, term_id, student_id, target_kind, target_id, content, teacher_email, status, cancel_reason
 *   counsel_requests: id, term_id, student_id, requester_email, wish_dates, topic, memo, status(신청·확정·완료·반려·취소), decided_date,
 *                    linked_note_id, cancel_reason(반려·취소 공용 — 반려 사유는 학생에게 보임)
 *   counsel_notes:   student_id, date, teacher_email, type, target, linked_violation_id, content, agreement, agreement_to_parent,
 *                    profile_version, request_id, show_to_parent, status, cancel_reason
 * created_at은 모든 탭 끝의 공통 열(CLAUDE.md 5) — 판정표는 feedback(쓴 날)·request(신청한 날)에만 넣는다. 다른 기록은 날짜 칸이 따로 있다.
 * 가상 칸 teacher_name: 서버가 teacher_email을 교사 이름으로 바꿔 넣는 칸(학생·학부모에게 이메일을 내보내지 않는다).
 */

/** 학부모에게 공개할 수 있는 진로 프로필 항목(학생이 고름, 결정 15·89). */
var S6_PROFILE_PUBLIC = ['hopes', 'targets', 'interests', 'strengths', 'concerns'];

/**
 * 공개 판정표(stage6-rules-draft 2절, 결정 89~97로 확정). 기록 종류 → 보는 사람 → 칸 목록.
 * 'ALL' = 그 기록의 모든 칸(STAFF_ALL), 'PUBLIC' = 학부모 공개분(s6ParentFields_), [] = 못 봄.
 */
var S6_TABLE = {
  profile: {
    cols: ['id', 'term_id', 'student_id', 'version', 'hopes', 'targets', 'interests', 'strengths', 'concerns', 'parent_fields', 'submitted_at', 'status', 'cancel_reason'],
    admin: 'ALL', assigned: 'ALL', homeroom: 'ALL', student: 'ALL', parent: 'PUBLIC', none: []
  },
  plan: {
    cols: ['id', 'term_id', 'student_id', 'entry_year', 'grade', 'semester', 'choice_group', 'course', 'state', 'confirmed_by', 'confirmed_at',
      'show_to_parent', 'status', 'cancel_reason'],
    admin: 'ALL', assigned: 'ALL', homeroom: 'ALL',
    student: ['id', 'term_id', 'student_id', 'entry_year', 'grade', 'semester', 'choice_group', 'course', 'state', 'confirmed_at', 'show_to_parent', 'status'],
    parent: 'PUBLIC', none: []
  },
  recs: {   // 권장 이수 과목(참고 자료) — 학생 행이 아니다
    cols: ['university', 'unit', 'core', 'recommended', 'baseYear', 'sourceTitle', 'sourceUrl', 'note'],
    admin: 'ALL', assigned: 'ALL', homeroom: 'ALL', student: 'ALL', parent: [], none: []
  },
  inquiry: {
    cols: ['id', 'term_id', 'student_id', 'source_id', 'recorded_at', 'source', 'standards', 'subject', 'title', 'question', 'liked',
      'progress', 'result_link', 'memo', 'file_id', 'name_mismatch', 'show_to_parent', 'status', 'cancel_reason'],
    // 원본 파일 id는 관리자만(정리용, 결정 100). '이름 다름' 표시는 교사만(결정 93)
    admin: 'ALL',
    assigned: ['id', 'term_id', 'student_id', 'source_id', 'recorded_at', 'source', 'standards', 'subject', 'title', 'question', 'liked',
      'progress', 'result_link', 'memo', 'name_mismatch', 'show_to_parent', 'status', 'cancel_reason'],
    homeroom: ['id', 'term_id', 'student_id', 'source_id', 'recorded_at', 'source', 'standards', 'subject', 'title', 'question', 'liked',
      'progress', 'result_link', 'memo', 'name_mismatch', 'show_to_parent', 'status', 'cancel_reason'],
    student: ['id', 'term_id', 'student_id', 'source_id', 'recorded_at', 'source', 'standards', 'subject', 'title', 'question', 'liked',
      'progress', 'result_link', 'memo', 'show_to_parent', 'status'],
    parent: 'PUBLIC', none: []
  },
  feedback: {   // 결정 91: 학부모에게 보이지 않는다. created_at = 쓴 날(화면 '박선생 · 4월 3일(토)')
    cols: ['id', 'term_id', 'student_id', 'target_kind', 'target_id', 'content', 'teacher_email', 'status', 'cancel_reason', 'created_at'],
    admin: 'ALL', assigned: 'ALL', homeroom: 'ALL',
    student: ['id', 'term_id', 'student_id', 'target_kind', 'target_id', 'content', 'teacher_name', 'status', 'created_at'],
    parent: [], none: []
  },
  request: {   // 결정 95·96: 반려 사유는 학생에게 보임, 담임은 날짜·주제·상태만(메모 없음), 학부모 —. created_at = 신청한 날
    cols: ['id', 'term_id', 'student_id', 'requester_email', 'wish_dates', 'topic', 'memo', 'status', 'decided_date', 'linked_note_id', 'cancel_reason', 'created_at'],
    admin: 'ALL', assigned: 'ALL',
    homeroom: ['id', 'student_id', 'wish_dates', 'topic', 'status', 'decided_date', 'created_at'],
    student: ['id', 'term_id', 'student_id', 'wish_dates', 'topic', 'memo', 'status', 'decided_date', 'cancel_reason', 'created_at'],
    parent: [], none: []
  },
  note: {   // 결정 94: 학생은 날짜·교사·합의 사항만. 학부모는 날짜·교사(show_to_parent) + 공개한 합의 사항(결정 90)
    cols: ['id', 'student_id', 'date', 'teacher_email', 'type', 'target', 'linked_violation_id', 'content', 'agreement', 'agreement_to_parent',
      'profile_version', 'request_id', 'show_to_parent', 'status', 'cancel_reason'],
    admin: 'ALL', assigned: 'ALL', homeroom: 'ALL',
    student: ['id', 'date', 'teacher_name', 'agreement'],
    parent: 'PUBLIC', none: []
  },
  timeline: {
    cols: ['at', 'kind', 'title', 'detail', 'ref'],
    admin: 'ALL', assigned: 'ALL', homeroom: 'ALL', student: [], parent: [], none: []
  }
};

/** 학부모 공개분으로 보이는 칸(그 항목이 공개일 때). profile은 공개 항목 자체. */
var S6_PARENT_SHOW = {
  plan: ['grade', 'semester', 'choice_group', 'course', 'state'],
  inquiry: ['recorded_at', 'source', 'standards', 'subject', 'title', 'question', 'progress', 'result_link', 'memo']
};

/** TRUE로 읽는 셀 값(체크박스·문자열). */
function s6True_(v) {
  return v === true || /^(true|y|yes|1|예)$/i.test(ruleStr_(v));
}

/**
 * 판정표(2절)를 코드로. viewer = {role:'admin'|'assigned'|'homeroom'|'student'|'parent'|'none', isSelf, isChild}.
 * kind 'profile'|'plan'|'recs'|'inquiry'|'feedback'|'request'|'note'|'timeline', row = 그 기록 행,
 * opts = {isLatest}(학부모 + profile: 가장 최근 제출 버전일 때만 — 결정 89).
 * → 보여 줄 칸 이름 배열([]이면 못 봄). 서버는 이 배열의 칸만 응답에 담는다.
 * - role은 서버가 정한다: 'assigned' = 그 기록의 term_id 운영 기간에 그 학생의 담당교사였던 사람(결정 97 — 권한 키는 '지금' 담당을 보므로
 *   지난 기록은 기능 함수가 기록의 term_id로 다시 판정해 넘긴다), 'homeroom' = 자기 반 담임. 그 밖의 교사는 'none'.
 * - student는 isSelf, parent는 isChild가 아니면 [].
 * - 학생·학부모는 취소된 기록을 보지 않는다(단 학생 본인의 상담 신청은 취소·반려도 본다 — 사유 확인).
 * - 모르는 role·kind는 [] (기본 못 봄).
 */
function s6Visible_(viewer, kind, row, opts) {
  var v = viewer || {}, t = S6_TABLE[ruleStr_(kind)], role = ruleStr_(v.role), r = row || {};
  if (!t || !Object.prototype.hasOwnProperty.call(t, role) || role === 'cols') return [];
  if (role === 'student' && !v.isSelf) return [];
  if (role === 'parent' && !v.isChild) return [];
  var cancelled = ruleStr_(r.status) === '취소';
  if (cancelled && role === 'parent') return [];
  if (cancelled && role === 'student' && kind !== 'request') return [];
  var spec = t[role];
  if (spec === 'ALL') return t.cols.slice();
  if (spec !== 'PUBLIC') return spec.slice();
  if (kind === 'profile' && !(opts || {}).isLatest) return [];
  if (kind === 'note') {
    // ASSUMPTION: show_to_parent가 FALSE면 합의 사항을 공개했어도 학부모에게는 그 상담 자체가 보이지 않는다(상담 여부부터 숨긴 건).
    if (!s6True_(r.show_to_parent)) return [];
    return ['id', 'date', 'teacher_name'].concat(s6ParentFields_(r, 'note'));
  }
  return s6ParentFields_(r, kind);
}

/**
 * 학부모 공개 표시를 읽어 학부모에게 보일 칸 이름 배열. 표시가 비었거나 모르는 값이면 [](기본 비공개, 결정 15).
 * - profile: parent_fields = 공개 항목 이름 ';' 목록(예 'hopes;targets') 중 S6_PROFILE_PUBLIC에 있는 것만, 그 순서로.
 * - plan·inquiry: 그 줄의 show_to_parent가 TRUE면 S6_PARENT_SHOW의 칸.
 * - note: agreement_to_parent가 TRUE이고 합의 사항이 있으면 ['agreement'](결정 90, 건마다·기본 비공개).
 * 교사 피드백은 어느 항목을 공개해도 따라가지 않는다(결정 91 — feedback은 판정표에서 학부모 []).
 */
function s6ParentFields_(row, kind) {
  var r = row || {}, k = ruleStr_(kind);
  if (k === 'profile') {
    var picked = {};
    ruleStr_(r.parent_fields).split(/[;,\s]+/).forEach(function (f) { if (f) picked[f] = true; });
    return S6_PROFILE_PUBLIC.filter(function (f) { return picked[f]; });
  }
  if (k === 'plan' || k === 'inquiry') return s6True_(r.show_to_parent) ? S6_PARENT_SHOW[k].slice() : [];
  if (k === 'note') return s6True_(r.agreement_to_parent) && ruleStr_(r.agreement) ? ['agreement'] : [];
  return [];
}

/** 행을 칸 목록으로 줄인다(가상 칸 teacher_name은 opts.teacherName으로 채움). fields가 []이면 null. */
function s6Pick_(row, fields, opts) {
  if (!fields || !fields.length) return null;
  var r = row || {}, out = {};
  fields.forEach(function (f) { out[f] = f === 'teacher_name' ? ruleStr_((opts || {}).teacherName) : r[f]; });
  return out;
}

/**
 * 쓰기 가능 여부(누가 무엇을 새로 쓰거나 고치나). 결정 16·97.
 * action 'profile.submit'|'profile.publish'|'plan.edit'|'plan.confirm'|'inquiry.upload'|'inquiry.progress'|'inquiry.publish'|
 *        'feedback.write'|'request.create'|'request.cancel'|'request.process'|'note.write'|'note.publish'
 * ctx = {active}: 그 학생이 지금 학사생인지(학사 입실). 학사생이 아니게 된 뒤에는 누구도 새로 쓰거나 고치지 못한다(결정 97).
 * → {ok, reason}. 담임·다른 교사는 쓰지 않는다(보기만).
 */
function s6CanWrite_(viewer, action, ctx) {
  var v = viewer || {}, role = ruleStr_(v.role), a = ruleStr_(action);
  var who = {
    'profile.submit': ['student'], 'profile.publish': ['student'], 'plan.edit': ['student'], 'plan.confirm': ['assigned'],
    'inquiry.upload': ['student'], 'inquiry.progress': ['student'], 'inquiry.publish': ['student'],
    'feedback.write': ['assigned'], 'request.create': ['student'], 'request.cancel': ['student'],
    'request.process': ['assigned', 'admin'], 'note.write': ['assigned'], 'note.publish': ['student']
  }[a];
  if (!who) return { ok: false, reason: '할 수 없는 일입니다.' };
  if (who.indexOf(role) < 0 || (role === 'student' && !v.isSelf)) return { ok: false, reason: '이 일을 할 권한이 없습니다. 담당 선생님께 알려 주세요.' };
  if (!(ctx || {}).active) return { ok: false, reason: '학사생이 아닌 학생의 기록은 새로 쓰거나 고칠 수 없습니다. 지난 기록은 계속 볼 수 있습니다.' };
  return { ok: true, reason: '' };
}

/**
 * 학생 타임라인(교사용, F17) → [{at, kind, title, detail, ref:{kind, id}}] 시간 내림차순(같으면 kind·id 순).
 * sources = {profiles, plans, inquiries, notes, violations, exceptions}(그 학생 것이 아니어도 된다 — studentId로 거른다),
 * opts = {from, to}('yyyy-MM-dd', 선택 — 양 끝 포함).
 * - 취소된 행은 뺀다. 상담은 날짜·합의 사항만(내용·유형 없음 — 보는 교사가 'ALL'이어도 타임라인 줄에는 넣지 않는다).
 * - OUT은 '1OUT: 항목 이름', 출결은 확정 특이사항만 '특이사항: 유형'.
 * 보는 사람 거르기는 부르는 쪽이 s6Visible_(viewer, 'timeline')로 먼저 한다.
 */
function s6Timeline_(sources, studentId, opts) {
  var s = sources || {}, sid = ruleStr_(studentId), o = opts || {}, out = [];
  var mine = function (rows) {
    return (rows || []).filter(function (r) { return r && ruleStr_(r.student_id) === sid && ruleStr_(r.status) !== '취소'; });
  };
  var push = function (at, kind, title, detail, id) {
    var a = ruleIso_(at);
    if (!a) return;
    var d = a.slice(0, 10);
    if ((o.from && d < o.from) || (o.to && d > o.to)) return;
    out.push({ at: a, kind: kind, title: title, detail: detail || '', ref: { kind: kind, id: ruleStr_(id) } });
  };
  mine(s.profiles).forEach(function (r) { push(r.submitted_at, 'profile', '진로 프로필 ' + ruleStr_(r.version) + '번째 제출', '', r.id); });
  mine(s.plans).forEach(function (r) {
    push(r.confirmed_at || r.created_at, 'plan', '이수 계획: ' + ruleStr_(r.grade) + '학년 ' + ruleStr_(r.semester) + '학기 ' + ruleStr_(r.course),
      ruleStr_(r.state), r.id);
  });
  mine(s.inquiries).forEach(function (r) { push(r.recorded_at, 'inquiry', '탐구: ' + ruleStr_(r.title), ruleStr_(r.progress), r.id); });
  mine(s.notes).forEach(function (r) { push(r.date, 'note', '상담', ruleStr_(r.agreement), r.id); });
  mine(s.violations).forEach(function (r) { push(r.occurred_at || r.created_at, 'out', '1OUT: ' + ruleStr_(r.rule_name), '', r.id); });
  (s.exceptions || []).filter(function (r) { return r && ruleStr_(r.student_id) === sid && ruleStr_(r.status) === '확정'; })
    .forEach(function (r) { push(r.date, 'exception', '특이사항: ' + attTypeBase_(r.type), '', r.id); });
  return out.sort(function (a, b) {
    return a.at !== b.at ? (a.at > b.at ? -1 : 1) : a.kind !== b.kind ? (a.kind < b.kind ? -1 : 1) : (a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0);
  });
}
