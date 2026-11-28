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
  note: {   // 결정 94: 학생은 날짜·교사·합의 사항(+ 본인의 공개 표시)만. 학부모는 날짜·교사(show_to_parent) + 공개한 합의 사항(결정 90)
    cols: ['id', 'student_id', 'date', 'teacher_email', 'type', 'target', 'linked_violation_id', 'content', 'agreement', 'agreement_to_parent',
      'profile_version', 'request_id', 'show_to_parent', 'status', 'cancel_reason'],
    admin: 'ALL', assigned: 'ALL', homeroom: 'ALL',
    student: ['id', 'date', 'teacher_name', 'agreement', 'agreement_to_parent'],   // agreement_to_parent = 학생 본인이 켠 '부모님께 보이기'(결정 90)
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
  if (kind === 'profile') {
    // 가장 최근 버전의 공개 항목 + 낸 날(submitted_at, 시안 p-career '4월 12일(월)에 낸 내용'). 몇 번째 기록(version)은 내보내지 않는다.
    // 공개 항목이 없으면 []: 냈는지조차 알 수 없다.
    if (!(opts || {}).isLatest) return [];
    var pub = s6ParentFields_(r, 'profile');
    return pub.length ? pub.concat(['submitted_at']) : [];
  }
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
 * 기록 한 건을 보는 자격(결정 97·104) → s6Visible_의 viewer {role, isSelf, isChild}.
 * 교사가 그 기록을 'assigned'로 보는 조건 = ① 그 기록의 운영 기간(termId)에 그 학생의 담당이었다, 또는 ② 지금(base.nowTermId) 그 학생의 담당이다.
 * base = {role: 'student'|'parent'|'admin'|'homeroom'|'none', isSelf, isChild, hallTeacher(학사 교사 역할이 있나), nowTermId}
 *   — 부르는 쪽이 학생 본인·학부모·관리자·담임(자기 반 + 이번 기간 등록) 판정을 미리 넣는다. 학생·학부모·관리자는 그대로 돌려준다.
 * termId: 기록의 term_id. 상담일지(counsel_notes)는 term_id 열이 없으니 그 date가 속한 기간을 부르는 쪽이 구해 넘긴다.
 * 쓰기 자격이 아니다: 쓰기(피드백·신청 처리·상담일지)는 지금 담당만 — 권한 키와 s6CanWrite_가 따로 막는다.
 */
function s6RoleForRow_(enrollments, email, studentId, termId, base) {
  var b = base || {}, role = ruleStr_(b.role);
  var out = function (r) { return { role: r, isSelf: !!b.isSelf, isChild: !!b.isChild }; };
  if (role === 'student' || role === 'parent' || role === 'admin') return out(role);
  var me = ruleStr_(email).toLowerCase(), sid = ruleStr_(studentId);
  var taught = function (t) {
    t = ruleStr_(t);
    return !!t && (enrollments || []).some(function (e) {
      return ruleStr_(e.term_id) === t && ruleStr_(e.student_id) === sid && ruleStr_(e.teacher_email).toLowerCase() === me;
    });
  };
  if (b.hallTeacher && me && sid && (taught(termId) || taught(b.nowTermId))) return out('assigned');
  return out(role === 'homeroom' ? 'homeroom' : 'none');
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

/** 타임라인 보기 칩(D: t-timeline) → 줄 kind 묶음. 화면은 이 순서로 칩을 그린다. */
var S6_TIMELINE_CHIPS = [
  { key: 'all', label: '전체', kinds: [] },
  { key: 'career', label: '진로', kinds: ['profile', 'plan'] },
  { key: 'inquiry', label: '탐구', kinds: ['upload', 'inquiry'] },
  { key: 'counsel', label: '상담', kinds: ['request', 'note'] },
  { key: 'out', label: 'OUT', kinds: ['out'] },
  { key: 'attendance', label: '출결', kinds: ['attendance'] }
];
var S6_TIMELINE_EMPTY = { all: '아직 기록이 없습니다.', allHelp: '진로 프로필을 내거나 상담·탐구 기록이 생기면 여기에 날짜순으로 나옵니다.', chip: '이 종류의 기록이 없습니다.' };

/** 날짜(yyyy-MM-dd)가 속한 운영 기간 id(terms 행의 start_date~end_date, 양 끝 포함). 없으면 ''. */
function s6TermOf_(terms, ymd) {
  var d = ruleStr_(ymd).slice(0, 10);
  var t = (terms || []).filter(function (x) { return x && ruleStr_(x.start_date) <= d && d <= ruleStr_(x.end_date); })[0];
  return t ? ruleStr_(t.id) : '';
}

/**
 * 학생 타임라인(교사용, F17, 시안 t-timeline, 결정 96·97·104) → {groups, chips, empty}.
 * sources = {profiles, plans, inquiries, feedback, requests, notes, violations, attendance}(그 학생 것이 아니어도 된다 — studentId로 거른다).
 *   attendance = [{termId, month('yyyy-MM', 이번 기간 달마다) 또는 ''(기간 전체 — 지난 기간), totals}] — totals는 attResultTotals_ 결과(기능이 낸다).
 * ctx = {terms, enrollments, base, email, names:{email: 이름}}
 *   base = s6RoleForRow_의 base(학생 본인·학부모가 아닌 교사 화면: role 'admin'|'homeroom'|'none', hallTeacher, nowTermId).
 *   관리자이면서 학사 교사인 사람은 role에 관리자를 넣지 말고 adminToo: true를 준다(담당 기간은 담당, 그 밖은 관리자 — crqViewer_와 같은 순서).
 * groups = [{termId, termName, teacherEmail(그 기간 담당), teacherName, now(이번 기간), role(그 기간을 보는 자격), items:[{at, kind, title, detail, tags, ref}]}]
 *   최근 기간(시작일이 늦은 것)이 위, 기간 안에서 최근 줄이 위. 보는 사람이 못 보는 기간은 묶음째 뺀다:
 *   기간마다 s6RoleForRow_(그 기간) → s6Visible_(viewer, 'timeline')가 비면 뺀다. 담임은 이번 기간만(결정 104 총괄 가정).
 *   묶음은 그 학생이 등록된 기간 + 줄이 있는 기간이다(줄이 없는 기간도 묶음은 남는다 — 화면은 empty.all을 그린다).
 * 줄(kind): profile 'n번째 기록을 냄' / plan 'g학년 s학기 · n과목을 고름'·'… n과목 확정'(같은 시각에 저장한 줄 묶음, 아래 줄 = 과목 이름) /
 *   request '주제 상담 신청'(희망 날짜·상태, 메모는 넣지 않는다 — 결정 96) / note '교사 · 유형 상담'('합의: …', 내용은 넣지 않는다) /
 *   upload '기록 파일 올림 · 새 기록 n건'(같은 file_id 묶음, 이름이 달랐으면 꼬리표 '이름 다름' — 결정 93) /
 *   inquiry 탐구 제목(진행이 '관심'이 아닌 기록만, 진행 상태·피드백 n건) / out '1OUT · 항목' / attendance 'n월 출결 요약'·'기간 이름 출결 요약'.
 * 취소된 행은 뺀다(상담 신청은 학생이 취소한 것도 뺀다). 진로 프로필 피드백 수는 줄에 싣지 않는다(시안: 아래 줄 없음).
 */
function s6TimelineView_(sources, studentId, ctx) {
  var s = sources || {}, c = ctx || {}, sid = ruleStr_(studentId), base = c.base || {}, names = c.names || {};
  var live = function (rows) { return (rows || []).filter(function (r) { return r && ruleStr_(r.student_id) === sid && ruleStr_(r.status) !== '취소'; }); };
  var nameOf = function (e) { var k = ruleStr_(e).toLowerCase(); return ruleStr_(names[k] || names[ruleStr_(e)]) || '(등록 안 된 교사)'; };
  var termById = {};
  (c.terms || []).forEach(function (t) { if (t) termById[ruleStr_(t.id)] = t; });
  var lines = [];
  var add = function (termId, at, kind, title, detail, id, tags) {
    var a = ruleIso_(at);
    if (!a) return;
    var t = ruleStr_(termId) || s6TermOf_(c.terms, a);
    lines.push({ termId: t, item: { at: a, kind: kind, title: title, detail: detail || '', tags: tags || [], ref: { kind: kind, id: ruleStr_(id) } } });
  };
  live(s.profiles).forEach(function (r) { add(r.term_id, r.submitted_at, 'profile', ruleStr_(r.version) + '번째 기록을 냄', '', r.id); });
  // 이수 계획: 같은 시각에 저장한(고른) 줄 묶음, 같은 시각에 확정한 줄 묶음
  var planGroups = {};
  var planKey = function (r, act, at) { return [ruleStr_(r.term_id), ruleStr_(r.grade), ruleStr_(r.semester), act, ruleIso_(at)].join('|'); };
  live(s.plans).forEach(function (r) {
    [['pick', r.created_at], ['confirm', ruleStr_(r.state) === '확정' ? r.confirmed_at : '']].forEach(function (p) {
      if (!ruleIso_(p[1])) return;
      var k = planKey(r, p[0], p[1]);
      (planGroups[k] = planGroups[k] || { r: r, act: p[0], at: p[1], courses: [], ids: [] }).courses.push(ruleStr_(r.course));
      planGroups[k].ids.push(ruleStr_(r.id));
    });
  });
  Object.keys(planGroups).forEach(function (k) {
    var g = planGroups[k], head = ruleStr_(g.r.grade) + '학년 ' + ruleStr_(g.r.semester) + '학기 · ' + g.courses.length + '과목';
    add(g.r.term_id, g.at, 'plan', head + (g.act === 'pick' ? '을 고름' : ' 확정'), g.courses.join(', '), g.ids.sort()[0]);
  });
  live(s.requests).forEach(function (r) {
    var wish = ruleStr_(r.wish_dates).split(';').filter(Boolean).map(function (d) { return ymdKo_(d); }).join('·');
    add(r.term_id, r.created_at, 'request', ruleStr_(r.topic) + ' 상담 신청', (wish ? '희망 ' + wish + ' · ' : '') + ruleStr_(r.status), r.id);
  });
  live(s.notes).forEach(function (r) {
    var type = ruleStr_(r.type), agr = ruleStr_(r.agreement);
    add('', r.date, 'note', nameOf(r.teacher_email) + ' · ' + (type ? type + ' ' : '') + '상담', agr ? '합의: ' + agr : '', r.id);
  });
  var fbCount = {};
  live(s.feedback).forEach(function (f) { var k = ruleStr_(f.target_id); fbCount[k] = (fbCount[k] || 0) + 1; });
  var uploads = {};
  live(s.inquiries).forEach(function (r) {
    var f = ruleStr_(r.file_id);
    if (f) {
      var u = uploads[f] = uploads[f] || { termId: r.term_id, at: '', n: 0, mismatch: false, id: '' };   // file_id 값은 줄에 싣지 않는다(관리자만 보는 칸) — ref는 묶음의 첫 기록 id
      u.n++;
      if (!u.id || ruleStr_(r.id) < u.id) u.id = ruleStr_(r.id);
      if (ruleIso_(r.created_at) > u.at) u.at = ruleIso_(r.created_at);
      u.mismatch = u.mismatch || s6True_(r.name_mismatch);
    }
    var prog = ruleStr_(r.progress);
    // ASSUMPTION: 진행을 바꾼 시각 칸이 없어 updated_at을 쓴다. '관심'(올린 그대로)인 기록은 올림 줄에만 센다
    if (prog && prog !== '관심') {
      var n = fbCount[ruleStr_(r.id)] || 0;
      add(r.term_id, r.updated_at || r.created_at, 'inquiry', ruleStr_(r.title) || '(제목 없음)', prog + (n ? ' · 피드백 ' + n + '건' : ''), r.id);
    }
  });
  Object.keys(uploads).forEach(function (f) {
    var u = uploads[f];
    add(u.termId, u.at, 'upload', '기록 파일 올림 · 새 기록 ' + u.n + '건', '', u.id, u.mismatch ? ['이름 다름'] : []);
  });
  live(s.violations).forEach(function (r) { add(r.term_id, r.occurred_at || r.created_at, 'out', '1OUT · ' + ruleStr_(r.rule_name), '', r.id); });
  (s.attendance || []).forEach(function (a) {
    if (!a) return;
    var t = termById[ruleStr_(a.termId)] || {}, m = ruleStr_(a.month), tot = a.totals || {};
    var at = m ? m + '-' + ('0' + ymdDaysInMonth_(Number(m.slice(0, 4)), Number(m.slice(5, 7)))).slice(-2) : ruleStr_(t.end_date);
    add(a.termId, at, 'attendance', (m ? ymKo_(m) : ruleStr_(t.name)) + ' 출결 요약', s6AttendanceText_(tot), ruleStr_(a.termId) + (m ? ':' + m : ''));
  });
  // 기간 묶음: 그 학생이 등록된 기간 + 줄이 있는 기간
  var teacherOf = {}, termIds = [];
  (c.enrollments || []).forEach(function (e) {
    if (!e || ruleStr_(e.student_id) !== sid) return;
    var t = ruleStr_(e.term_id);
    teacherOf[t] = ruleStr_(e.teacher_email).toLowerCase();
    if (termIds.indexOf(t) < 0) termIds.push(t);
  });
  lines.forEach(function (l) { if (l.termId && termIds.indexOf(l.termId) < 0) termIds.push(l.termId); });
  var nowId = ruleStr_(base.nowTermId), groups = [];
  termIds.forEach(function (t) {
    var v = s6RoleForRow_(c.enrollments, c.email, sid, t, base);
    if (v.role !== 'assigned' && base.adminToo) v = { role: 'admin', isSelf: false, isChild: false };
    if (v.role === 'homeroom' && t !== nowId) return;   // 담임은 이번 기간만(결정 104 총괄 가정)
    if (!s6Visible_(v, 'timeline', {}).length) return;
    var items = lines.filter(function (l) { return l.termId === t; }).map(function (l) { return l.item; }).sort(function (a, b) {
      return a.at !== b.at ? (a.at > b.at ? -1 : 1) : a.kind !== b.kind ? (a.kind < b.kind ? -1 : 1) : (a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0);
    });
    var term = termById[t] || {};
    groups.push({ termId: t, termName: ruleStr_(term.name) || t, start: ruleStr_(term.start_date), teacherEmail: teacherOf[t] || '',
      teacherName: teacherOf[t] ? nameOf(teacherOf[t]) : '', now: t === nowId, role: v.role, items: items });
  });
  groups.sort(function (a, b) { return a.start !== b.start ? (a.start > b.start ? -1 : 1) : (a.termId < b.termId ? -1 : 1); });
  groups.forEach(function (g) { delete g.start; });
  return { groups: groups, chips: S6_TIMELINE_CHIPS.map(function (x) { return { key: x.key, label: x.label, kinds: x.kinds.slice() }; }), empty: Object.assign({}, S6_TIMELINE_EMPTY) };
}

/**
 * 출결 요약 줄 글(attResultTotals_ 결과) → '출석 n일 · 지각 n · 조퇴 n · 결석 n'(+ '학원 n일 · 가정 n일').
 * 출석 = 운영한 날 − 결석한 날. 지각·조퇴·결석은 인정·미인정을 합친 날 수.
 * 학원·가정 = 고정 일정 '학'·'가'가 하루에 한 번이라도 든 날 수(totals.학습량.missedDays, 총괄 확정). missedDays가 없는 옛 묶음이면 싣지 않는다.
 */
function s6AttendanceText_(totals) {
  var t = totals || {}, n = function (k) { var x = t[k] || {}; return (Number(x['인정']) || 0) + (Number(x['미인정']) || 0); };
  var st = t['학습량'] || {}, absent = n('결석');
  var parts = ['출석 ' + Math.max(0, (Number(st.days) || 0) - absent) + '일', '지각 ' + n('지각'), '조퇴 ' + n('조퇴'), '결석 ' + absent];
  var md = st.missedDays;
  if (md) parts.push('학원 ' + (Number(md['학']) || 0) + '일', '가정 ' + (Number(md['가']) || 0) + '일');
  return parts.join(' · ');
}
