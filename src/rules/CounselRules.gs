/**
 * 상담 신청(F17)·상담일지 6단계 칸 규칙. RULES 세션 소유(R24). 근거: stage6-rules-draft 3.3, 결정 16·42·90·94~96.
 * 순수 함수만 둔다. 상담일지 기본 칸(날짜·유형·대상·내용)은 기능 쪽 CounselLog.gs cnlValidate_가 이미 검사한다 —
 * 여기서는 6단계에 새로 생긴 칸(합의 사항·학부모 공개·참고 버전·신청 연결)과 상담 신청만 본다.
 * 열 이름은 Stage6Rules.gs 머리말.
 */

var COUNSEL_REQ_MAX_DATES = 3;        // 결정 95
var COUNSEL_REQ_MEMO_MAX = 500;
var COUNSEL_REQ_REASON_MAX = 200;
var COUNSEL_AGREEMENT_MAX = 1000;
var COUNSEL_REQ_OPEN = ['신청', '확정'];   // 처리되지 않은 신청(결정 95: 1건만)

/**
 * 학생 상담 신청 검사. input = {studentId, dates:['yyyy-MM-dd'…], topic, memo}, today 'yyyy-MM-dd',
 * existing = counsel_requests 행(그 학생 것이 아니어도 된다), opts = {topics}(기본 상담일지 유형 목록).
 * → {row:{student_id, preferred_dates('a;b;c' 정렬), topic, memo, status:'신청'}, errors:[]}
 * - 희망 날짜 1~3개(결정 95), 날짜 형식, 오늘 이후(오늘 포함), 중복 없음.
 * - 주제는 opts.topics 중 하나. ASSUMPTION: 상담 신청 주제 목록 = 상담일지 유형(settings counsel.types, 기본 학업·생활·진로·건강·가정·기타).
 * - 메모는 500자까지(빈칸 허용).
 * - 처리되지 않은(신청·확정) 신청이 이미 있으면 오류 — 취소한 뒤 다시 낸다(결정 95).
 * requester_email은 서버가 로그인 계정으로 채운다(결정 16: 신청은 학생만).
 */
function counselRequestCheck_(input, today, existing, opts) {
  var i = input || {}, errors = [], sid = ruleStr_(i.studentId);
  var topics = ((opts || {}).topics || ['학업', '생활', '진로', '건강', '가정', '기타']).map(ruleStr_);
  if (!ymdIsValid_(ruleStr_(today))) throw new Error('today는 yyyy-MM-dd여야 합니다: ' + today);
  if (!sid) throw new Error('studentId가 비어 있습니다');
  var dates = (Array.isArray(i.dates) ? i.dates : []).map(ruleStr_).filter(Boolean);
  var seen = {};
  if (!dates.length) errors.push('희망 날짜가 없습니다. 날짜를 1개 이상 골라 주세요.');
  if (dates.length > COUNSEL_REQ_MAX_DATES) errors.push('희망 날짜는 ' + COUNSEL_REQ_MAX_DATES + '개까지 고를 수 있습니다. ' + (dates.length - COUNSEL_REQ_MAX_DATES) + '개를 빼 주세요.');
  dates.forEach(function (d) {
    if (!ymdIsValid_(d)) { errors.push('읽을 수 없는 날짜입니다(' + d + '). 날짜를 다시 골라 주세요.'); return; }
    if (d < today) errors.push(ymdKo_(d, today) + '은 지난 날입니다. 오늘이나 그 뒤 날짜를 골라 주세요.');
    if (seen[d]) errors.push(ymdKo_(d, today) + '을 두 번 골랐습니다. 한 번만 골라 주세요.');
    seen[d] = true;
  });
  var topic = ruleStr_(i.topic);
  if (topics.indexOf(topic) < 0) errors.push('상담 주제를 골라 주세요(' + topics.join('·') + ').');
  var memo = ruleStr_(i.memo);
  if (memo.length > COUNSEL_REQ_MEMO_MAX) errors.push('메모는 ' + COUNSEL_REQ_MEMO_MAX + '자까지 적을 수 있습니다. 지금 ' + memo.length + '자입니다.');
  var open = (existing || []).some(function (r) { return r && ruleStr_(r.student_id) === sid && COUNSEL_REQ_OPEN.indexOf(ruleStr_(r.status)) >= 0; });
  if (open) errors.push('아직 처리되지 않은 상담 신청이 있습니다. 그 신청을 취소한 뒤 다시 내 주세요.');
  var sorted = Object.keys(seen).filter(ymdIsValid_).sort();
  return { row: errors.length ? null : { student_id: sid, preferred_dates: sorted.join(';'), topic: topic, memo: memo, status: '신청' }, errors: errors };
}

/**
 * 상담 신청 상태 전이. request = counsel_requests 행, action, actor = {role:'student'|'assigned'|'admin'|…, isSelf},
 * input = {date, reason, noteId}, today 'yyyy-MM-dd'(confirm에서 지난 날 거르기).
 * → {patch, errors}
 *   confirm  (담당교사·관리자) 신청 → 확정: input.date는 희망 날짜 중 하나, 오늘 이후. patch {status:'확정', decided_date}
 *            ASSUMPTION: 희망 날짜 밖의 날은 고르지 않는다(맞는 날이 없으면 사유를 적어 반려하고 학생이 다시 신청).
 *   reject   (담당교사·관리자) 신청·확정 → 반려: 사유 필수(학생에게 보임, 결정 95). patch {status:'반려', reject_reason}
 *   complete (담당교사·관리자) 확정 → 완료: input.noteId(상담일지 id) 필수. patch {status:'완료', note_id}
 *   cancel   (학생 본인) 신청·확정 → 취소: 사유 선택. patch {status:'취소', cancel_reason}
 * 완료·반려·취소에서는 다른 상태로 가지 않는다. 담임·다른 교사는 처리하지 못한다.
 */
function counselRequestNext_(request, action, actor, input, today) {
  var r = request || {}, a = actor || {}, i = input || {}, st = ruleStr_(r.status), role = ruleStr_(a.role);
  var fail = function (m) { return { patch: null, errors: [m] }; };
  var staff = role === 'assigned' || role === 'admin';
  var from = function (list, what) {
    return list.indexOf(st) >= 0 ? '' : '지금 상태(' + (st || '없음') + ')에서는 ' + what + ' 수 없습니다. 화면을 새로 불러와 지금 상태를 확인해 주세요.';
  };
  var reason = ruleStr_(i.reason).replace(/\s+/g, ' '), why;
  switch (ruleStr_(action)) {
    case 'confirm':
      if (!staff) return fail('담당 선생님만 상담 날짜를 정할 수 있습니다.');
      if ((why = from(['신청'], '날짜를 정할'))) return fail(why);
      var d = ruleStr_(i.date), wish = ruleStr_(r.preferred_dates).split(';').filter(Boolean);
      if (wish.indexOf(d) < 0) return fail('학생이 고른 희망 날짜 중 하나를 골라 주세요. 맞는 날이 없으면 사유를 적어 반려해 주세요.');
      if (ymdIsValid_(ruleStr_(today)) && d < today) return fail(ymdKo_(d, today) + '은 지난 날입니다. 다른 희망 날짜를 고르거나 반려해 주세요.');
      return { patch: { status: '확정', decided_date: d }, errors: [] };
    case 'reject':
      if (!staff) return fail('담당 선생님만 반려할 수 있습니다.');
      if ((why = from(['신청', '확정'], '반려할'))) return fail(why);
      if (!reason) return fail('반려 사유가 비어 있습니다. 학생에게 보일 사유를 적어 주세요.');
      if (reason.length > COUNSEL_REQ_REASON_MAX) return fail('반려 사유는 ' + COUNSEL_REQ_REASON_MAX + '자까지 적을 수 있습니다.');
      return { patch: { status: '반려', reject_reason: reason }, errors: [] };
    case 'complete':
      if (!staff) return fail('담당 선생님만 상담을 마칠 수 있습니다.');
      if ((why = from(['확정'], '완료로 바꿀'))) return fail(why);
      if (!ruleStr_(i.noteId)) return fail('이 신청과 이을 상담일지가 없습니다. 상담일지를 먼저 저장해 주세요.');
      return { patch: { status: '완료', note_id: ruleStr_(i.noteId) }, errors: [] };
    case 'cancel':
      if (role !== 'student' || !a.isSelf) return fail('상담 신청은 신청한 학생만 취소할 수 있습니다. 반려하려면 [반려]를 눌러 주세요.');
      if ((why = from(['신청', '확정'], '취소할'))) return fail(why);
      if (reason.length > COUNSEL_REQ_REASON_MAX) return fail('취소 사유는 ' + COUNSEL_REQ_REASON_MAX + '자까지 적을 수 있습니다.');
      return { patch: { status: '취소', cancel_reason: reason }, errors: [] };
  }
  throw new Error('알 수 없는 action: ' + action);
}

/**
 * 상담일지의 6단계 칸 검사(기본 칸은 CounselLog.gs cnlValidate_). input = {type, agreement, agreementToParent, profileVersion, requestId},
 * opts = {profileVersions:[살아 있는 그 학생 진로 프로필 버전 번호], request:(이을 신청 행 또는 null)}.
 * → {patch:{agreement, agreement_to_parent('TRUE'|'FALSE'), profile_version, request_id}, errors, warnings}
 * - 합의 사항 1000자까지. 학부모 공개는 기본 FALSE(결정 90), 합의 사항이 비면 늘 FALSE.
 *   ASSUMPTION: 합의 사항의 학부모 공개는 학생이 켠다(결정 90 '학생이 켜야') — 교사 저장에서 TRUE가 와도 FALSE로 둔다(opts.byStudent일 때만 받음).
 * - 참고한 프로필 버전: 있으면 그 학생의 살아 있는 버전이어야 한다. 유형이 '진로'(또는 옛 값 '진학')인데 비면 경고.
 * - 신청 연결: requestId가 있으면 그 신청이 '확정'이어야 한다(완료 처리는 counselRequestNext_ complete).
 */
function counselNoteCheck_(input, opts) {
  var i = input || {}, o = opts || {}, errors = [], warnings = [];
  var agreement = ruleStr_(i.agreement);
  if (agreement.length > COUNSEL_AGREEMENT_MAX) errors.push('합의 사항은 ' + COUNSEL_AGREEMENT_MAX + '자까지 적을 수 있습니다. 지금 ' + agreement.length + '자입니다.');
  var toParent = !!o.byStudent && agreement && s6True_(i.agreementToParent);
  var pv = ruleStr_(i.profileVersion);
  if (pv && (o.profileVersions || []).map(ruleStr_).indexOf(pv) < 0) errors.push('참고한 진로 프로필 ' + pv + '번째 버전이 없습니다. 버전을 다시 골라 주세요.');
  if (!pv && /^(진로|진학)$/.test(ruleStr_(i.type))) warnings.push('진로 상담인데 참고한 진로 프로필 버전이 없습니다. 보고 상담한 버전이 있으면 골라 주세요.');
  var rid = ruleStr_(i.requestId);
  if (rid && (!o.request || ruleStr_(o.request.id) !== rid)) errors.push('이을 상담 신청을 찾지 못했습니다. 화면을 새로 불러와 주세요.');
  else if (rid && ruleStr_(o.request.status) !== '확정') errors.push('날짜를 정한(확정) 상담 신청만 상담일지와 이을 수 있습니다. 지금 상태는 ' + ruleStr_(o.request.status) + '입니다.');
  return { patch: errors.length ? null : { agreement: agreement, agreement_to_parent: toParent ? 'TRUE' : 'FALSE', profile_version: pv, request_id: rid },
    errors: errors, warnings: warnings };
}

/**
 * 상담일지 한 건을 보는 사람에 맞게 줄인다 → 판정표 칸만 담은 객체 또는 null(못 봄).
 * viewer = s6Visible_의 viewer, opts = {teacherName}(학생·학부모에게 이메일 대신 보일 교사 이름).
 * 학생: 날짜·교사·합의 사항(결정 94). 학부모: show_to_parent일 때 날짜·교사 + 공개한 합의 사항(결정 90). 상담 내용·유형은 학생·학부모에게 없다.
 */
function counselView_(note, viewer, opts) {
  return s6Pick_(note, s6Visible_(viewer, 'note', note), opts);
}
