/**
 * C46 확인함: 화면마다 흩어진 "내가 처리할 것"을 한 목록으로. 읽기 전용이고 새 규칙은 없다 — 종류마다 그 처리 함수가 쓰는 권한 키·범위 판정을
 * 그대로 다시 쓰고, 처리는 각 화면의 기존 함수로 한다(링크). 줄에는 학생 라벨(학년. 이름)·요약 한 줄·요청 시각만 있다(교사 메모·전화·다른 학생 없음).
 *
 * 종류(kind)와 처리 규칙(조사 결과는 PR 본문 표):
 *   exception     사전 특이사항 요청 묶음   출결 담당·관리자(exception.confirm)         → 특이사항 화면 '요청 처리'(일괄 확정 #287)
 *   timetable     시간표 확인(학부모 동의함) 담당교사·관리자(timetable.confirm, 담당 학생)  → 시간표 화면
 *   doc           신청서 서류 미제출         담당교사·관리자(status.edit, 담당 학생)       → 입퇴실·급식 화면 기록
 *   out2_meeting  2OUT 학부모 면담 기록 필요  담당교사(counsel.save, 담당 학생)           → OUT 화면 '퇴실 대상'
 *   out2_dismiss  2OUT 퇴실 확정 대기        관리자(out.dismiss)                        → OUT 화면 '퇴실 대상'
 */

var INBOX_LABEL = { exception: '특이사항 요청', timetable: '시간표 확인', doc: '서류 미제출', out2_meeting: '2OUT 면담', out2_dismiss: '퇴실 확정' };
var INBOX_MAX = 200;

/** 줄 하나(순수). 이메일·메모는 받지 않는다. */
function inboxItem_(kind, id, studentLabel, summary, requestedAt, link, extra) {
  return Object.assign({ kind: kind, id: id, studentLabel: studentLabel, summary: summary, requestedAt: String(requestedAt || ''), link: link }, extra || {});
}

/** 오래 기다린 순(요청 시각이 없으면 맨 뒤), 같으면 종류·id 순으로 고정 */
function inboxSort_(items) {
  return items.slice().sort(function (a, b) {
    var x = a.requestedAt || '￿', y = b.requestedAt || '￿';
    return x < y ? -1 : x > y ? 1 : (a.kind + a.id < b.kind + b.id ? -1 : 1);
  });
}

function inboxExceptions_(user, d, today) {
  if (!excCanConfirm_(user)) return [];
  var byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  var out = [];
  excLiveTerms_(d.terms, today).forEach(function (term) {
    var visible = excVisibleIds_(user, d.enrollments, d.students, term.id);
    var rows = excRows_(term).rows.filter(function (r) { return String(r.status).trim() === '요청' && visible[r.student_id]; });
    excGroups_(rows).forEach(function (g) {
      var s = byId[g.studentId];
      if (!s) return;
      var span = g.dates.length === 1 ? foodDateKo_(g.dates[0]) : foodDateKo_(g.dates[0]) + ' ~ ' + foodDateKo_(g.dates[g.dates.length - 1]);
      out.push(inboxItem_('exception', g.groupId, excDisplay_(s), g.type + ' · ' + span + ' · ' + excBlocksText_(g.blocks), g.requestedAt,
        { page: 'exceptions', params: { tab: 'requests' } }, { termId: term.id }));
    });
  });
  return out;
}

function inboxTimetables_(user, d, today) {
  if (!hasAnyAllowedRole_(user.roles, permissions_()['timetable.confirm'].roles)) return [];
  var term = getCurrentTerm_();
  if (!term) return [];
  var tt = ttcLoad_(), win = ttcWindow_(today), thisMonth = today.slice(0, 7);
  var months = [thisMonth, win.open ? win.month : ttNextMonth_(thisMonth)].filter(function (x, i, a) { return a.indexOf(x) === i; });
  var admin = hasRole_(user, 'admin'), byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  var ids = d.enrollments.filter(function (e) { return e.term_id === term.id && byId[e.student_id] && (admin || normalizeEmail_(e.teacher_email) === user.email); })
    .map(function (e) { return e.student_id; });
  var out = [];
  ids.forEach(function (id) {
    months.forEach(function (m) {
      var st = ttMonthState_(tt.rows, id, m);
      if (st.status !== '동의' && st.status !== '혼합') return;
      var agreed = st.rows.reduce(function (a, r) { var t = ruleStr_(r.parent_agreed_at); return t > a ? t : a; }, '');
      out.push(inboxItem_('timetable', id + '|' + m, excDisplay_(byId[id]), ttcMonthKo_(m) + ' 시간표 확인(학부모가 동의했습니다)', agreed,
        { page: 'timetable', params: { role: admin ? 'admin' : 'hall_teacher', month: m } }, { month: m }));
    });
  });
  return out;
}

function inboxDocs_(user, d) {
  var admin = hasRole_(user, 'admin');
  if (!admin && !hasRole_(user, 'hall_teacher')) return [];
  var byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  return foodMissingDocs_(d.changes, d.enrollments, d.terms).filter(function (m) { return byId[m.studentId] && (admin || m.teacher === user.email); }).map(function (m) {
    var c = m.row;
    return inboxItem_('doc', c.id, excDisplay_(byId[m.studentId]), foodChangeLabel_(c) + ' · ' + (ymdIsValid_(String(c.effective_date)) ? foodDateKo_(c.effective_date) + '부터 · ' : '') + '서류 미제출', c.requested_at,
      { page: 'moves', params: { tab: 'history', student: m.studentId, date: m.ymd || '' } });
  });
}

/** 2OUT: 면담 칸·퇴실 확정 관문은 OUT 화면과 같은 함수(listOuts → vioMeetingInfo_)가 판정한다. 담당이 아닌 교사에게는 canMeeting·canConfirm이 false다 */
function inboxOuts_() {
  var r = listOuts({ scope: 'targets' });
  if (!r || !r.term) return [];
  var out = [];
  r.summary.forEach(function (x) {
    if (x.count < 2 || x.left) return;
    var label = (x.student.grade || '') + '. ' + (x.student.name || '');
    var at = x.trigger ? x.trigger.occurredAt : '';
    var link = { page: 'outs', params: { tab: 'dismiss' } };
    if (x.state === 'need' && x.canMeeting) out.push(inboxItem_('out2_meeting', x.studentId, label, '2OUT — 학부모 면담을 하고 기록해 주세요', at, link));
    else if (x.state === 'recorded' && x.canConfirm) out.push(inboxItem_('out2_dismiss', x.studentId, label, '2OUT — 면담을 마쳤습니다. 퇴실을 확정해 주세요', at, link));
  });
  return out;
}

/**
 * 확인함. 이 사용자가 처리할 권한이 있는 것만, 오래 기다린 순.
 * → {ok, items:[{kind, id, studentLabel, summary, requestedAt, link:{page, params}}], counts:{kind:N}, total, more, labels, appUrl}
 */
function getInbox() {
  var user = requirePermission_('inbox.view');
  var d = { terms: readAll_('terms'), students: readAll_('students'), enrollments: readAll_('enrollments'), changes: readAll_('status_changes') };
  var today = today_();
  var all = inboxExceptions_(user, d, today).concat(inboxTimetables_(user, d, today), inboxDocs_(user, d), inboxOuts_());
  var items = inboxSort_(all);
  var counts = {};
  items.forEach(function (i) { counts[i.kind] = (counts[i.kind] || 0) + 1; });
  return { ok: true, items: items.slice(0, INBOX_MAX), counts: counts, total: items.length, more: Math.max(0, items.length - INBOX_MAX), labels: INBOX_LABEL, appUrl: ScriptApp.getService().getUrl() };
}
