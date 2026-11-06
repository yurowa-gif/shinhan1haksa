/**
 * 학생 상태 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD 3.2·3.5).
 *
 * 순수 함수만 둔다. 다른 파일의 함수·전역 값을 쓰지 않는다('yyyy-MM-dd'는 문자열 비교로 순서를 정한다).
 * 시트 행은 Db.gs readAll_이 돌려주는 모양(모든 값이 문자열)을 그대로 받는다.
 *   status_changes:   student_id, item, value, requested_at, effective_date, …, status(유효·취소), created_at …
 *   enrollments:      term_id, student_id, teacher_email, veritas, commute_type, end_type, memo …
 *   seats:            space_id, row, col, label, kind(좌석·기둥·비상문·창문), status …
 *   seat_assignments: term_id, seat_id, student_id, valid_from, valid_to, status(배정·취소), memo …
 *   terms:            name, type(학기·방학), start_date, end_date …
 */

function statStr_(v) {
  return String(v === undefined || v === null ? '' : v).trim();
}

/** 일시 비교용: 'yyyy-MM-dd HH:mm:ss'처럼 공백으로 쓴 값도 'T' 형식과 같은 순서가 되게. */
function statIso_(v) {
  return statStr_(v).replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
}

function statIsYmd_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** status_changes 행이 유효한지: status가 빈칸 또는 '유효'(취소·요청 등은 무시). */
function statChangeValid_(c) {
  var st = statStr_(c && c.status);
  return st === '' || st === '유효';
}

/**
 * 그날의 상태 값. item '학사'|'기숙사'|'조식'|'석식' → 값(입실·퇴실·실시·…) 또는 ''(기록 없음).
 * 적용일(effective_date) <= ymd 인 유효 기록 중 적용일이 가장 늦은 것.
 * 적용일이 같으면 requested_at이 늦은 행(docs/contracts/vocabulary.md), 그것도 같으면 created_at이 늦은 행,
 * 그것도 같으면 시트에서 아래 행이 이긴다.
 * 적용일이 날짜 형식이 아닌 행은 무시한다.
 */
function statusOn_(changes, studentId, item, ymd) {
  var sid = statStr_(studentId), it = statStr_(item);
  var best = null;
  (changes || []).forEach(function (c, i) {
    if (!c || !statChangeValid_(c)) return;
    if (statStr_(c.student_id) !== sid || statStr_(c.item) !== it) return;
    var eff = statStr_(c.effective_date);
    if (!statIsYmd_(eff) || eff > ymd) return;
    var cand = { eff: eff, req: statIso_(c.requested_at), created: statIso_(c.created_at), value: statStr_(c.value) };
    if (!best || cand.eff > best.eff || (cand.eff === best.eff &&
        (cand.req > best.req || (cand.req === best.req && cand.created >= best.created)))) best = cand;
  });
  return best ? best.value : '';
}

/**
 * 그날 학사생인지: 이 기간 등록(enrollment)이 있고 학사 상태가 '입실'.
 * 기간 날짜 범위 안인지는 부르는 쪽이 확인한다(enrollment에는 날짜가 없다).
 * ASSUMPTION: 퇴실 적용일 당일부터 학사생이 아니다(stage1 4절 a, 결정 23 ①).
 */
function isActiveOn_(changes, enrollment, ymd) {
  if (!enrollment || !statStr_(enrollment.student_id)) return false;
  return statusOn_(changes, enrollment.student_id, '학사', ymd) === '입실';
}

/**
 * 그날 그 좌석의 배정 행 하나(없으면 null).
 * 같은 기간·좌석, status가 '취소'가 아니고, valid_from <= ymd <= valid_to(빈칸이면 기간 전체).
 * 여럿이면 statAssignmentWins_ 순서: 날짜를 좁힌 배정(방학 날짜별 자리표)이 기간 전체 배정보다 먼저,
 * 그다음 valid_from이 늦은 것, 그다음 updated_at이 늦은 것(같으면 시트에서 아래 행).
 */
function assignmentOn_(assignments, seatId, termId, ymd) {
  var best = null;
  (assignments || []).forEach(function (a) {
    if (!statAssignmentLive_(a, termId, ymd)) return;
    if (statStr_(a.seat_id) !== statStr_(seatId)) return;
    if (!best || statAssignmentWins_(a, best)) best = a;
  });
  return best;
}

/** 배정 a가 b보다 우선인지(같으면 true = 나중 행이 이김). */
function statAssignmentWins_(a, b) {
  var bounds = function (x) { return (statStr_(x.valid_from) ? 1 : 0) + (statStr_(x.valid_to) ? 1 : 0); };
  if (bounds(a) !== bounds(b)) return bounds(a) > bounds(b);
  var fa = statStr_(a.valid_from), fb = statStr_(b.valid_from);
  if (fa !== fb) return fa > fb;
  return statIso_(a.updated_at) >= statIso_(b.updated_at);
}

/** 배정 행이 그 기간·날짜에 살아 있는지. */
function statAssignmentLive_(a, termId, ymd) {
  if (!a || statStr_(a.status) === '취소' || statStr_(a.term_id) !== statStr_(termId)) return false;
  if (!statStr_(a.seat_id) || !statStr_(a.student_id)) return false;
  var from = statStr_(a.valid_from), to = statStr_(a.valid_to);
  if (from && from > ymd) return false;
  if (to && to < ymd) return false;
  return true;
}

/**
 * 그날의 좌석표.
 * → {bySeat:{seatId:{studentId:string|null, vacant:boolean, reason:''|'퇴실'|'미입실'|'미배정'}},
 *    unseated:[studentId], warnings:[]}
 * - bySeat에는 kind '좌석'이고 취소되지 않은 좌석만 들어간다.
 * - 배정이 없으면 '미배정', 배정된 학생이 그날 학사 '퇴실'이면 '퇴실'(공석),
 *   이 기간 등록이 없거나 아직 입실 전이면 '미입실'(공석). 모두 vacant true.
 * - 한 학생이 그날 두 자리에 배정되어 있으면 statAssignmentWins_로 하나만 쓰고 나머지는 '미배정' + 경고
 *   (방학에 기간 전체 자리 A와 그날만 자리 B가 있으면 B).
 * - unseated: 이 기간 등록이 있고 그날 학사생인데 앉은 자리가 없는 학생(중도 입실 등). 등록 행 순서.
 */
function seatMapOn_(seats, assignments, enrollments, changes, termId, ymd) {
  var tid = statStr_(termId);
  var warnings = [];
  var enrByStudent = {};
  (enrollments || []).forEach(function (e) {
    if (!e || statStr_(e.term_id) !== tid) return;
    var sid = statStr_(e.student_id);
    if (sid && !enrByStudent[sid]) enrByStudent[sid] = e;
  });

  var seatIds = [];
  (seats || []).forEach(function (s) {
    if (!s || statStr_(s.status) === '취소' || statStr_(s.kind) !== '좌석') return;
    var id = statStr_(s.id);
    if (id && seatIds.indexOf(id) < 0) seatIds.push(id);
  });

  // 좌석별 배정 → 학생이 두 자리면 최근 배정만 남긴다
  var pick = {};
  seatIds.forEach(function (id) { pick[id] = assignmentOn_(assignments, id, tid, ymd); });
  var seatOfStudent = {};
  seatIds.forEach(function (id) {
    var a = pick[id];
    if (!a) return;
    var sid = statStr_(a.student_id);
    var prev = seatOfStudent[sid];
    if (!prev) { seatOfStudent[sid] = id; return; }
    warnings.push('한 학생이 같은 날 두 자리에 배정되어 있습니다(날짜를 좁힌 배정·최근 배정을 씀): ' + sid);
    if (statAssignmentWins_(a, pick[prev])) {
      pick[prev] = null;
      seatOfStudent[sid] = id;
    } else {
      pick[id] = null;
    }
  });

  var bySeat = {};
  var seated = {};
  seatIds.forEach(function (id) {
    var a = pick[id];
    if (!a) { bySeat[id] = { studentId: null, vacant: true, reason: '미배정' }; return; }
    var sid = statStr_(a.student_id);
    var enr = enrByStudent[sid];
    if (enr && isActiveOn_(changes, enr, ymd)) {
      bySeat[id] = { studentId: sid, vacant: false, reason: '' };
      seated[sid] = true;
      return;
    }
    var hall = statusOn_(changes, sid, '학사', ymd);
    bySeat[id] = { studentId: null, vacant: true, reason: enr && hall === '퇴실' ? '퇴실' : '미입실' };
  });

  var unseated = [];
  (enrollments || []).forEach(function (e) {
    if (!e || statStr_(e.term_id) !== tid) return;
    var sid = statStr_(e.student_id);
    if (!sid || seated[sid] || unseated.indexOf(sid) >= 0) return;
    if (isActiveOn_(changes, enrByStudent[sid], ymd)) unseated.push(sid);
  });
  return { bySeat: bySeat, unseated: unseated, warnings: warnings };
}

/**
 * 이전 학기 명단 이어받기 초안(PRD 3.1: 학기 → 다음 학기는 기존 학생 유지).
 * - newTerm.type이 '학기'가 아니면 빈 배열(방학은 따로 신청한 학생만).
 * - 직전 학기 = type '학기'이고 시작일이 newTerm 시작일보다 앞인 기간 중 시작일이 가장 늦은 것(방학은 건너뜀).
 * - 직전 학기 등록 중 newTerm 시작일에 학사 '입실'인 학생만(퇴실자 제외), 이미 newTerm에 등록된 학생은 뺀다.
 * → [{term_id, student_id, teacher_email, veritas, commute_type, end_type, memo, from_enrollment_id}]
 *   (id·공통 열은 부르는 쪽이 붙인다)
 * ASSUMPTION: 학년도가 바뀌는 이어받기(2학기 → 다음 해 1학기)에서도 학년으로 거르지 않는다(졸업생은 명단 업로드의
 * 퇴실 후보로 처리). 화면은 초안을 보여 주고 관리자가 확인한다.
 */
function carryOverEnrollments_(terms, enrollments, changes, newTerm) {
  if (!newTerm || statStr_(newTerm.type) !== '학기') return [];
  var newId = statStr_(newTerm.id), newStart = statStr_(newTerm.start_date);
  if (!statIsYmd_(newStart)) return [];
  var prev = null;
  (terms || []).forEach(function (t) {
    if (!t || statStr_(t.id) === newId || statStr_(t.type) !== '학기') return;
    var s = statStr_(t.start_date);
    if (!statIsYmd_(s) || s >= newStart) return;
    if (!prev || s > statStr_(prev.start_date)) prev = t;
  });
  if (!prev) return [];
  var prevId = statStr_(prev.id);
  var already = {};
  (enrollments || []).forEach(function (e) {
    if (e && statStr_(e.term_id) === newId) already[statStr_(e.student_id)] = true;
  });
  var out = [];
  (enrollments || []).forEach(function (e) {
    if (!e || statStr_(e.term_id) !== prevId) return;
    var sid = statStr_(e.student_id);
    if (!sid || already[sid]) return;
    if (!isActiveOn_(changes, e, newStart)) return;
    already[sid] = true;
    out.push({
      term_id: newId,
      student_id: sid,
      teacher_email: statStr_(e.teacher_email),
      veritas: statStr_(e.veritas),
      commute_type: statStr_(e.commute_type),
      end_type: statStr_(e.end_type),
      memo: '',
      from_enrollment_id: statStr_(e.id)
    });
  });
  return out;
}
