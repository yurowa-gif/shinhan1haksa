/**
 * C36 F14 학생·학부모 포털(읽기만, 7단계). 전역 이름 접두어 ptl. PRD F14, 결정 82, docs/plan/stage7.md.
 * - 학생은 본인, 학부모는 연결된 자녀만(requirePermission_ scope student의 isOwn·isGuardian — 판정은 서버). 교사 역할은 이 함수들을 못 부른다.
 * - 응답에 넣지 않는 것: 다른 학생, 전화번호, 상담 내용·유형, 교사 메모(OUT 메모·특이사항 사유), 입력자·교사 이메일, 감사 기록.
 * - 학부모의 상담 여부는 날짜·교사 이름만, show_to_parent가 참인 것만. 학생 응답에는 상담 줄이 없다(F17은 6단계).
 * - '이 사람이 누구인지'(본인 학생 id·자녀 id 목록)는 Auth.gs portalWho_ 한 곳에서만 정한다(결정 82, S7-0). 이 파일은 신원을 따로 판정하지 않는다.
 * ASSUMPTION: OUT·특이사항은 이번 기간 행이고 취소된 것도 '취소'로 남겨 보낸다(D13: 내 OUT 자세히·출결 기록 전체). 합계·알약은 살아 있는 OUT만 센다. 특이사항·OUT의 사유·메모·취소 사유 칸은 보내지 않는다.
 * ASSUMPTION: 급식·기숙사 상태는 학생·학부모 모두에게 보인다(식단 등 새 정보 없음, 값만).
 */
var PTL_EXC_MAX = 100;

function ptlStudentOne_(s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number }; }

/** 머리 카드의 담당교사 이름(이메일 아님). 이번 기간 등록이 없으면 ''. */
function ptlTeacherName_(term, studentId) {
  if (!term) return '';
  var en = readAll_('enrollments').filter(function (e) { return e.term_id === term.id && e.student_id === studentId; })[0];
  var u = en ? readAll_('users').filter(function (x) { return normalizeEmail_(x.email) === normalizeEmail_(en.teacher_email); })[0] : null;
  return u ? String(u.name || '') : '';
}

/**
 * 포털 시작값(역할만 본다 — 학생·학부모만). 학생: {kind:'student', me}, 학부모: {kind:'parent', children:[…]}. 신원을 못 찾으면 me=null·children=[].
 * 내용은 getPortalStudent가 한 학생씩 권한을 확인해서 준다.
 */
function getPortalHome() {
  requirePermission_('portal.home');
  var who = portalWho_(), term = getCurrentTerm_();
  var byId = {};
  readAll_('students').forEach(function (s) { byId[s.id] = s; });
  var out = { today: today_(), termName: term ? term.name : '', me: null, children: [] };
  if (who.studentId && byId[who.studentId]) out.me = ptlStudentOne_(byId[who.studentId]);
  out.children = who.childIds.filter(function (id) { return byId[id]; }).map(function (id) { return ptlStudentOne_(byId[id]); })
    .sort(function (a, b) { return a.grade - b.grade || String(a.name).localeCompare(String(b.name)); });
  return out;
}

/** 이번 기간 OUT(항목·날짜·몇 OUT·유효/취소). 합계·알약은 살아 있는 것만 센다. 메모·입력자·적발 교사는 보내지 않는다. */
function ptlOuts_(term, studentId) {
  var out = { total: 0, label: '', items: [] };
  if (!term) return out;
  var opts = vioOutOpts_();
  vioViolations_(term).filter(function (v) { return String(v.student_id) === studentId; })
    .sort(function (a, b) { return String(a.occurred_at) < String(b.occurred_at) ? 1 : -1; })
    .forEach(function (v) {
      var live = ruleRowLive_(v), w = outWeight_(v, opts);
      if (live) out.total += w;
      out.items.push({ date: String(v.occurred_at).slice(0, 10), dateKo: foodDateKo_(String(v.occurred_at).slice(0, 10)), ruleName: String(v.rule_name || ''), weight: w, status: live ? '유효' : '취소' });   // 취소 사유(교사 메모일 수 있음)는 보내지 않는다
    });
  out.label = out.total >= 2 ? '퇴실 대상' : out.total === 1 ? '1OUT' : '';
  return out;
}

/**
 * 출결 기록 한 줄 이유(C44, hr-gap G6). 유형·상태로만 정한다 — 사유 칸(교사 메모일 수 있음)·요청자·확정자는 쓰지 않는다.
 * 미인정 유형(exception.auto_out_types)은 OUT으로 센다는 말을 붙인다(학부모는 'OUT 1번', 학생은 '1OUT', writing.md 7절). 취소·모르는 유형은 ''(화면에 줄이 안 생긴다). 순수 함수.
 */
function ptlReason_(type, state, autoOut, parent) {
  type = String(type || '');
  if (state === '취소') return '';
  if (autoOut.indexOf(type) >= 0) {
    var out = parent ? 'OUT 1번' : '1OUT';
    return state === '확정' ? '미인정이라 ' + out + '으로 셉니다.' : '미인정이라 ' + (parent ? '확인되면 ' : '확정되면 ') + out + '이 됩니다.';
  }
  if (type.indexOf('병') === 0) return '병으로 인한 기록입니다.';
  if (type.indexOf('가정') === 0) return '가정 사유 기록입니다.';
  if (type.indexOf('학원') === 0) return '학원 일정 기록입니다.';
  if (type.indexOf('학사 외') === 0) return '학사 밖 프로그램 참가 기록입니다.';
  if (type.indexOf('학사 내') === 0) return '학사 안 프로그램 참가 기록입니다.';
  if (type.indexOf('기타') === 0) return '기타 사유 기록입니다.';
  return '';
}

/** 이번 기간 출결 특이사항(사전·결과 모두 같은 탭). 유형·날짜·저장된 상태(요청·확정·취소, 화면이 학부모에게는 '확인 중'으로 풀어 쓴다)·이유 한 줄(ptlReason_)만 — 사유·요청자·확정자는 보내지 않는다. */
function ptlExceptions_(term, studentId, today, parent) {
  if (!term) return [];
  var settings = excSettings_(readAll_('settings', 'config')), seen = {}, list = [];
  excRows_(term).rows.filter(function (r) { return String(r.student_id) === studentId; })
    .sort(function (a, b) { return String(a.date) < String(b.date) ? 1 : String(a.date) > String(b.date) ? -1 : 0; })
    .forEach(function (r) {
      var key = r.date + '|' + r.type + '|' + ruleStr_(r.status);
      if (seen[key] || !ymdIsValid_(String(r.date))) return;
      seen[key] = true;
      list.push({ date: String(r.date), dateKo: foodDateKo_(r.date), type: String(r.type), short: settings.typeShort[String(r.type)] || String(r.type),
        state: ruleStr_(r.status) === '취소' ? '취소' : ruleStr_(r.status) === '확정' ? '확정' : '요청', upcoming: String(r.date) > today });
      var last = list[list.length - 1];
      last.reason = ptlReason_(last.type, last.state, settings.autoOut, !!parent);
    });
  return list.slice(0, PTL_EXC_MAX);
}

/** 오늘 기준 내 자리(공간 이름·자리 표시). 앉은 자리가 없으면 null. 다른 학생은 읽지 않는다. */
function ptlSeat_(term, studentId, today) {
  if (!term) return null;
  var d = seatLoad_(), ymd = seatBaseYmd_(term, today);
  var map = seatMapOn_(d.seats, d.assignments, d.enrollments, d.changes, term.id, ymd);
  var seat = d.seats.filter(function (s) { return map.bySeat[s.id] && map.bySeat[s.id].studentId === studentId; })[0];
  if (!seat) return null;
  var space = d.spaces.filter(function (sp) { return sp.id === seat.space_id; })[0];
  return { space: space ? String(space.name) : '', label: String(seat.label || '') || (seat.row + '행 ' + seat.col + '열') };
}

/** 오늘 기준 내 방(층·호수). 기숙사 입실 중이고 배정이 있을 때만. 같은 방 학생은 보내지 않는다. */
function ptlRoom_(term, studentId) {
  if (!term) return null;
  var d = roomLoad_(term.id);
  var mine = roomCurrent_(d).filter(function (a) { return a.student_id === studentId; })[0];
  var room = mine ? d.rooms.filter(function (r) { return r.id === mine.room_id; })[0] : null;
  return room ? { floor: Number(room.floor) || String(room.floor), roomNo: String(room.room_no) } : null;
}

/** 오늘 학사·기숙사·조식·석식(+방학 중식) 상태 값. */
function ptlStatus_(studentId, today) {
  var rows = readAll_('status_changes').filter(function (c) { return c.student_id === studentId; });
  var out = {};
  ['학사', '기숙사', '조식', '석식'].forEach(function (it) { out[it] = statusOn_(rows, studentId, it, today); });
  var lunch = lunchOn_(rows, studentId, today, foodLunchOpts_(today));   // 결정 79: statusOn_이 아니라 lunchOn_
  if (lunch) out['중식'] = lunch;
  return out;
}

/** 앞으로 바뀌는 급식·기숙사 값(적용일이 오늘보다 뒤인 살아 있는 변경). 신청 사유·서류 표시는 보내지 않는다. */
function ptlPending_(studentId, today) {
  return readAll_('status_changes').filter(function (c) {
    return c.student_id === studentId && String(c.status || '유효') === '유효' && ymdIsValid_(String(c.effective_date)) && String(c.effective_date) > today && ['기숙사', '조식', '석식', '중식'].indexOf(String(c.item)) >= 0;
  }).sort(function (a, b) { return String(a.effective_date) < String(b.effective_date) ? -1 : 1; })
    .map(function (c) { return { item: String(c.item), value: String(c.value), date: String(c.effective_date), dateKo: foodDateKo_(c.effective_date) }; });
}

/** 오늘부터 앞으로 일정 n건(제목·종류·기간). 일정 메모는 보내지 않는다. */
function ptlUpcoming_(today, n) {
  return evtLive_(readAll_('events')).filter(function (r) { return ymdIsValid_(String(r.start_date)) && evtEnd_(r) >= today; })
    .sort(function (a, b) { return String(a.start_date) < String(b.start_date) ? -1 : String(a.start_date) > String(b.start_date) ? 1 : 0; }).slice(0, n)
    .map(function (r) { var st = String(r.start_date) < today ? today : String(r.start_date); return { title: String(r.title), kind: String(r.kind), start: String(r.start_date), end: evtEnd_(r), dateKo: foodDateKo_(st) }; });
}

/** 학부모에게 보이는 상담 여부: 날짜·교사 이름만(내용·유형·대상 없음), show_to_parent가 참인 살아 있는 상담. */
function ptlCounsel_(studentId) {
  var names = {}, viewer = { role: 'parent', isSelf: false, isChild: true };   // 학부모만 부른다(getPortalStudent의 !own). 보일 칸은 규칙 counselView_가 정한다(결정 90·103 ⑦)
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || ''); });
  var out = [];
  readAll_('counsel_notes', 'counsel').filter(function (n) { return ruleStr_(n.student_id) === studentId && ymdIsValid_(String(n.date)); })
    .sort(function (a, b) { return String(a.date) < String(b.date) ? 1 : -1; })
    .forEach(function (n) {
      var v = counselView_(n, viewer, { teacherName: names[normalizeEmail_(n.teacher_email)] || '' });
      if (!v) return;
      var o = { date: String(v.date), dateKo: foodDateKo_(v.date), teacher: v.teacher_name };
      if (v.agreement) o.agreement = v.agreement;   // 학생이 '부모님께 보이기'를 켠 합의 사항만(없으면 이 칸이 없다)
      out.push(o);
    });
  return out;
}

/** 그 달 월별 일정(제목·종류·기간)과 날짜별 운영 여부. 일정 메모·자습 일정 메모는 보내지 않는다. */
function ptlMonth_(month) {
  var rows = readAll_('events'), list = evtOverlapping_(rows, month);
  var days = calMonthPlans_(month, calLoadCtx_()).map(function (p) {
    return { date: p.date, weekdayKo: p.weekdayKo, operating: !!p.operating,
      ids: list.filter(function (r) { return String(r.start_date) <= p.date && evtEnd_(r) >= p.date; }).map(function (r) { return r.id; }) };
  });
  return { month: month, events: list.map(function (r) { return { id: r.id, title: String(r.title), kind: String(r.kind), start: String(r.start_date), end: evtEnd_(r) }; }), days: days };
}

/**
 * 학생 한 명의 포털 화면 내용(읽기만). 학생은 본인 id, 학부모는 연결된 자녀 id만(아니면 권한 거부 + denied 기록). month = 'yyyy-MM'(비우면 이번 달).
 * → {viewer:'student'|'parent', today, term, student, teacher, outs, exceptions, seat, room, status, counsel(학부모만), month}
 */
function getPortalStudent(studentId, month) {
  requirePermission_('portal.view', { studentId: studentId });
  var sid = String(studentId || '');
  var student = findById_('students', sid);
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  var m = String(month || '').trim() || today_().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m) || !ymdIsValid_(m + '-01')) throw new Error('달을 yyyy-MM 형식으로 골라 주세요.');
  var today = today_(), term = getCurrentTerm_();
  var own = portalWho_().ownStudentIds.indexOf(sid) >= 0;   // 본인 판정도 신원 한 곳(portalWho_)에서
  var res = { viewer: own ? 'student' : 'parent', today: today, term: term ? { name: term.name } : null, student: ptlStudentOne_(student),
    teacher: ptlTeacherName_(term, sid), outs: ptlOuts_(term, sid), exceptions: ptlExceptions_(term, sid, today, !own), seat: ptlSeat_(term, sid, today), room: ptlRoom_(term, sid),
    todo: ttcTodo_(sid, own, today), status: ptlStatus_(sid, today), pending: ptlPending_(sid, today), upcoming: ptlUpcoming_(today, 3), month: ptlMonth_(m) };
  if (!own) { res.counsel = ptlCounsel_(sid); res.inquiry = ptlInquiry_(sid); }   // 학부모만: 상담 여부와 자녀가 공개한 탐구 기록
  return res;
}
