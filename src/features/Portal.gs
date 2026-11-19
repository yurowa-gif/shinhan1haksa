/**
 * C36 F14 학생·학부모 포털(읽기만, 7단계). 전역 이름 접두어 ptl. PRD F14, 결정 82, docs/plan/stage7.md.
 * - 학생은 본인, 학부모는 연결된 자녀만(requirePermission_ scope student의 isOwn·isGuardian — 판정은 서버). 교사 역할은 이 함수들을 못 부른다.
 * - 응답에 넣지 않는 것: 다른 학생, 전화번호, 상담 내용·유형, 교사 메모(OUT 메모·특이사항 사유), 입력자·교사 이메일, 감사 기록.
 * - 학부모의 상담 여부는 날짜·교사 이름만, show_to_parent가 참인 것만. 학생 응답에는 상담 줄이 없다(F17은 6단계).
 * - '이 사람이 누구인지'(본인 학생 id·자녀 id 목록)는 ptlWho_ 한 곳에서만 정한다. 0단계 진단 결과가 2·3안이면 이 함수만 바꾼다.
 *   ASSUMPTION: S7-0(코딩A)의 portalWho_가 들어오면 ptlWho_를 그 함수 호출로 바꾼다(지금은 1안: 접속 이메일 → students.email·guardian_links.parent_email).
 * ASSUMPTION: OUT은 살아 있는 이번 기간 행만(취소 행은 보이지 않음). 특이사항은 이번 기간의 확정·요청 행(취소 제외)이고 사유 칸은 보내지 않는다.
 * ASSUMPTION: 급식·기숙사 상태는 학생·학부모 모두에게 보인다(식단 등 새 정보 없음, 값만).
 */
var PTL_EXC_MAX = 60;

/** 이 접속자의 본인 학생 id(학생 역할일 때)와 자녀 학생 id 목록(학부모 역할일 때). 신원 판정은 여기 한 곳. */
function ptlWho_(user) {
  var mine = '', children = [];
  if (hasRole_(user, 'student')) {
    var me = readAll_('students').filter(function (s) { return normalizeEmail_(s.email) === user.email; })[0];
    mine = me ? me.id : '';
  }
  if (hasRole_(user, 'parent')) {
    readAll_('guardian_links').forEach(function (g) {
      if (normalizeEmail_(g.parent_email) === user.email && children.indexOf(g.student_id) < 0) children.push(g.student_id);
    });
  }
  return { studentId: mine, childIds: children };
}

function ptlStudentOne_(s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number }; }

/**
 * 포털 시작값(역할만 본다 — 학생·학부모만). 학생: {kind:'student', me}, 학부모: {kind:'parent', children:[…]}. 신원을 못 찾으면 me=null·children=[].
 * 내용은 getPortalStudent가 한 학생씩 권한을 확인해서 준다.
 */
function getPortalHome() {
  var user = requirePermission_('portal.home');
  var who = ptlWho_(user), term = getCurrentTerm_();
  var byId = {};
  readAll_('students').forEach(function (s) { byId[s.id] = s; });
  var out = { today: today_(), termName: term ? term.name : '', me: null, children: [] };
  if (who.studentId && byId[who.studentId]) out.me = ptlStudentOne_(byId[who.studentId]);
  out.children = who.childIds.filter(function (id) { return byId[id]; }).map(function (id) { return ptlStudentOne_(byId[id]); })
    .sort(function (a, b) { return a.grade - b.grade || String(a.name).localeCompare(String(b.name)); });
  return out;
}

/** 이번 기간의 살아 있는 OUT(항목·날짜·몇 OUT). 메모·입력자·적발 교사는 보내지 않는다. */
function ptlOuts_(term, studentId) {
  var out = { total: 0, label: '', items: [] };
  if (!term) return out;
  var opts = vioOutOpts_();
  vioViolations_(term).filter(function (v) { return String(v.student_id) === studentId && ruleRowLive_(v); })
    .sort(function (a, b) { return String(a.occurred_at) < String(b.occurred_at) ? 1 : -1; })
    .forEach(function (v) {
      var w = outWeight_(v, opts);
      out.total += w;
      out.items.push({ date: String(v.occurred_at).slice(0, 10), ruleName: String(v.rule_name || ''), weight: w });
    });
  out.label = out.total >= 2 ? '퇴실 대상' : out.total === 1 ? '1OUT' : '';
  return out;
}

/** 이번 기간 출결 특이사항(사전·결과 모두 같은 탭). 유형·날짜·상태만 — 사유·요청자·확정자는 보내지 않는다. */
function ptlExceptions_(term, studentId, today) {
  if (!term) return [];
  var settings = excSettings_(readAll_('settings', 'config')), seen = {}, list = [];
  excRows_(term).rows.filter(function (r) { return String(r.student_id) === studentId && ruleStr_(r.status) !== '취소'; })
    .sort(function (a, b) { return String(a.date) < String(b.date) ? 1 : String(a.date) > String(b.date) ? -1 : 0; })
    .forEach(function (r) {
      var key = r.date + '|' + r.type;
      if (seen[key] || !ymdIsValid_(String(r.date))) return;
      seen[key] = true;
      list.push({ date: String(r.date), dateKo: foodDateKo_(r.date), type: String(r.type), short: settings.typeShort[String(r.type)] || String(r.type),
        state: ruleStr_(r.status) === '확정' ? '확정' : '확인 대기', upcoming: String(r.date) > today });
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

/** 학부모에게 보이는 상담 여부: 날짜·교사 이름만(내용·유형·대상 없음), show_to_parent가 참인 살아 있는 상담. */
function ptlCounsel_(studentId) {
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || ''); });
  return readAll_('counsel_notes', 'counsel').filter(function (n) {
    return ruleStr_(n.student_id) === studentId && ruleRowLive_(n) && String(n.show_to_parent).toUpperCase() !== 'FALSE' && ymdIsValid_(String(n.date));
  }).sort(function (a, b) { return String(a.date) < String(b.date) ? 1 : -1; })
    .map(function (n) { return { date: String(n.date), dateKo: foodDateKo_(n.date), teacher: names[normalizeEmail_(n.teacher_email)] || '' }; });
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
 * → {viewer:'student'|'parent', today, term, student, outs, exceptions, seat, room, status, counsel(학부모만), month}
 */
function getPortalStudent(studentId, month) {
  var user = requirePermission_('portal.view', { studentId: studentId });
  var sid = String(studentId || '');
  var student = findById_('students', sid);
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  var m = String(month || '').trim() || today_().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m) || !ymdIsValid_(m + '-01')) throw new Error('달을 yyyy-MM 형식으로 골라 주세요.');
  var today = today_(), term = getCurrentTerm_();
  var own = normalizeEmail_(student.email) === user.email && hasRole_(user, 'student');
  var res = { viewer: own ? 'student' : 'parent', today: today, term: term ? { name: term.name } : null, student: ptlStudentOne_(student),
    outs: ptlOuts_(term, sid), exceptions: ptlExceptions_(term, sid, today), seat: ptlSeat_(term, sid, today), room: ptlRoom_(term, sid),
    status: ptlStatus_(sid, today), month: ptlMonth_(m) };
  if (!own) res.counsel = ptlCounsel_(sid);
  return res;
}
