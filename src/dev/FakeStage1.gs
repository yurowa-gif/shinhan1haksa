/**
 * 1단계 가짜 데이터(실제 학생 정보 사용 금지 — CLAUDE.md 1번). docs/plan/stage1.md C2.
 *
 * buildFakeStage1_(fake)  : 시트를 건드리지 않는 순수 함수. buildFakeData_의 결과(fake)를 받아
 *                           공간·좌석·좌석 배정·일정·특이사항·고정 일정·초기 상태 행을 만든다.
 *                           언제 실행해도 같은 결과(id도 고정).
 * seedFakeStage1()        : 편집기에서 실행. 두 번 실행해도 중복이 생기지 않는다(id가 이미 있으면 건너뜀).
 *
 * 시트에 쓰는 글자 값은 docs/contracts/vocabulary.md(총괄 확정)를 따른다.
 * ASSUMPTION(vocabulary.md 기준 밖): 기숙사 입실·조식 실시는 원거리 통학생에게만 넣는다(가짜 데이터 모양일 뿐).
 */

var FAKE1_TERM_INDEX = 1;                 // 두 번째 기간(2027 1학기)에 시드한다
var FAKE1_MEMO = '가짜 데이터';

/** 가짜 id: 접두어 + 번호(buildFakeData_의 fakeId_와 같은 모양, 접두어로 종류 구분) */
function fake1Id_(prefix, n) { return fakeId_(prefix, n); }

function buildFakeStage1_(fake) {
  var term = fake.terms[FAKE1_TERM_INDEX];
  var layout = buildFakeSeatLayout_();
  var students = fake.students;
  var enrollments = fake.enrollments.filter(function (e) { return e.term_id === term.id; });
  var enrollByStudent = {};
  enrollments.forEach(function (e) { enrollByStudent[e.student_id] = e; });

  /* 공간·좌석 */
  var spaceIdByKey = {};
  var spaces = layout.spaces.map(function (sp, i) {
    var id = fake1Id_('f1000000', i + 1);
    spaceIdByKey[sp.key] = id;
    return { id: id, name: sp.name, gender: sp.gender, rows: String(sp.rows), cols: String(sp.cols),
      sort_order: String(i + 1), status: '유효', memo: FAKE1_MEMO };
  });
  var seatRefs = {};          // spaceKey → 좌석(kind 좌석) id 배열(번호 순)
  var seats = layout.seats.map(function (s, i) {
    var id = fake1Id_('f2000000', i + 1);
    if (s.kind === '좌석') (seatRefs[s.spaceKey] = seatRefs[s.spaceKey] || []).push(id);
    return { id: id, space_id: spaceIdByKey[s.spaceKey], row: String(s.row), col: String(s.col),
      label: s.label, kind: s.kind, status: '유효' };
  });

  /* 학생 역할: 29번 = 중도 퇴실, 30번 = 중도 입실(자리 미배정) */
  var leaver = students[students.length - 2];
  var lateEntrant = students[students.length - 1];

  /* 좌석 배정: 베리타스 → 같은 성별 SA실, 그 밖 → 1층. 중도 입실자는 배정하지 않는다. */
  var cursor = {};
  var saKeys = { '남': ['SA1', 'SA2'], '여': ['SA3', 'SA4', 'SA5', 'SA6'] };
  var takeSeat = function (keys) {
    for (var i = 0; i < keys.length; i++) {
      var list = seatRefs[keys[i]] || [];
      var used = cursor[keys[i]] || 0;
      if (used < list.length) { cursor[keys[i]] = used + 1; return list[used]; }
    }
    return null;
  };
  var seatAssignments = [];
  students.forEach(function (st) {
    if (st.id === lateEntrant.id) return;
    var en = enrollByStudent[st.id];
    if (!en) return;
    var seatId = en.veritas === 'TRUE' ? takeSeat(saKeys[st.gender] || []) : null;
    if (!seatId) seatId = takeSeat(['1F']);
    seatAssignments.push({ id: fake1Id_('f3000000', seatAssignments.length + 1), term_id: term.id, seat_id: seatId,
      student_id: st.id, valid_from: '', valid_to: '', status: '배정', memo: FAKE1_MEMO });
  });

  /* 초기 상태(명단 업로드가 넣는 값) + 중도 퇴실·입실 */
  var statusChanges = [];
  var addChange = function (st, item, value, effective, source, reason) {
    statusChanges.push({ id: fake1Id_('f4000000', statusChanges.length + 1), student_id: st.id, item: item, value: value,
      requested_at: effective + 'T09:00:00', effective_date: effective, effective_date_auto: effective,
      reason: reason || '', doc_submitted: 'FALSE', linked_change_id: '', source: source, status: '유효', memo: FAKE1_MEMO, cancel_reason: '' });
  };
  students.forEach(function (st) {
    var en = enrollByStudent[st.id];
    if (!en) return;
    var start = st.id === lateEntrant.id ? '2027-03-15' : term.start_date;
    addChange(st, '학사', '입실', start, '명단업로드');
    if (en.commute_type !== '일반') {
      addChange(st, '기숙사', '입실', start, '명단업로드');
      addChange(st, '조식', '실시', start, '명단업로드');
    }
    addChange(st, '석식', '학사 석식', start, '명단업로드');
  });
  addChange(leaver, '학사', '퇴실', '2027-03-10', 'F6', '가짜 중도 퇴실');

  /* 날짜별 일정 2건: 운영 안 함 1, 종료 22:00 1 */
  var daySchedules = [
    { id: fake1Id_('f5000000', 1), date: '2027-03-10', operating: 'FALSE', start: '', end: '', day_type: '',
      memo: '가짜: 운영 안 함', status: '유효' },
    { id: fake1Id_('f5000000', 2), date: '2027-03-17', operating: 'TRUE', start: '', end: '22:00', day_type: '',
      memo: '가짜: 종료 22:00', status: '유효' }
  ];

  /* 특이사항 10건(요청 1·취소 1·미인정 2 포함). 블록 칸은 시각 범위. */
  var S = function (i) { return students[i].id; };
  var by = 'fake.teacher3@example.com'; // 출결 담당(FakeData의 가짜교사3)
  var ex = [];
  var addEx = function (i, date, blocks, type, reason, status, group, cancelReason) {
    var n = ex.length + 1;
    ex.push({ id: fake1Id_('f6000000', n), term_id: term.id, group_id: group || fake1Id_('f6100000', n), student_id: S(i),
      date: date, blocks: blocks, type: type, reason: reason, status: status, requested_by: by,
      requested_at: date + 'T08:00:00', confirmed_by: status === '확정' ? by : '', confirmed_at: status === '확정' ? date + 'T08:05:00' : '',
      cancel_reason: cancelReason || '' });
  };
  addEx(0, '2027-03-03', 'ALL', '병결', '가짜 사유', '확정');
  addEx(1, '2027-03-03', '20:00-24:00', '병조퇴', '가짜 사유', '확정');
  ['2027-03-03', '2027-03-04', '2027-03-05'].forEach(function (d) {
    addEx(3, d, 'ALL', '가정사유(가족여행 포함)', '가짜 가족여행', '확정', fake1Id_('f6100000', 900));
  });
  addEx(4, '2027-03-04', '15:00-24:00', '학원(보강 포함)', '보강', '확정');
  addEx(5, '2027-03-04', '18:00-20:00;20:00-22:00', '학사 외 프로그램', '', '확정');
  addEx(6, '2027-03-05', '18:00-20:00', '미인정지각', '', '확정');
  addEx(7, '2027-03-08', 'ALL', '미인정결석', '', '요청');
  addEx(8, '2027-03-09', '22:00-24:00', '기타', '가짜 사유', '취소', null, '가짜: 사유 없음으로 취소');

  /* 고정 일정 8명: 2027-03, 월·수 학원('학') 또는 금 가정('가') */
  var fixed = [];
  for (var k = 0; k < 8; k++) {
    var st = students[10 + k];
    var learn = k % 2 === 0;
    fixed.push({ id: fake1Id_('f7000000', k + 1), student_id: st.id, month: '2027-03',
      weekday: learn ? ['월', '수'][(k / 2) % 2] : '금',
      blocks: learn ? '18:00-20:00' : 'ALL', code: learn ? '학' : '가',
      submitted_at: '2027-02-26T10:00:00', parent_agreed_at: '2027-02-27T10:00:00',
      teacher_confirmed_at: '2027-02-28T10:00:00', status: '확정' });
  }

  return {
    term: term, spaces: spaces, seats: seats, seatAssignments: seatAssignments, statusChanges: statusChanges,
    daySchedules: daySchedules, exceptions: ex, fixedSchedules: fixed,
    leaverId: leaver.id, lateEntrantId: lateEntrant.id
  };
}

/** 이 DB의 학생이 모두 가짜인지(가짜 시드를 실제 DB에 쓰지 않도록) */
function fake1DbIsAllFake_(students) {
  return students.length > 0 && students.every(function (s) { return String(s.memo).indexOf(FAKE1_MEMO) === 0; });   // '가짜 데이터(등록 없음)' 등 포함
}

/** id가 이미 있는 행은 빼고 새 행만 */
function fake1OnlyNew_(rows, existing) {
  var have = {};
  existing.forEach(function (r) { have[r.id] = true; });
  return rows.filter(function (r) { return !have[r.id]; });
}

/** 편집기에서 실행. seedFakeData()로 가짜 학생을 먼저 만든 DB에서만 동작한다. 두 번 실행해도 중복 없음. */
function seedFakeStage1() {
  var owner = assertOwnerRun_();
  var students = readAll_('students');
  if (!fake1DbIsAllFake_(students)) {
    throw new Error('가짜 학생(seedFakeData)만 있는 DB에서만 실행합니다. 실제 데이터가 있는 DB에는 쓰지 않습니다.');
  }
  var fake = buildFakeData_({ count: students.length });
  var data = buildFakeStage1_(fake);
  var terms = readAll_('terms');
  if (!terms.some(function (t) { return t.id === data.term.id; })) {
    throw new Error('가짜 운영 기간이 없습니다. seedFakeData()를 먼저 실행하세요.');
  }
  var report = [];
  ensureTermSheets_(report);
  var tab = termSheetName_('exceptions', data.term.id);
  var plan = [
    ['spaces', data.spaces], ['seats', data.seats], ['seat_assignments', data.seatAssignments],
    ['status_changes', data.statusChanges], ['day_schedules', data.daySchedules],
    ['fixed_schedules', data.fixedSchedules], [tab, data.exceptions]
  ];
  var lines = [];
  plan.forEach(function (pair) {
    var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
    bulkAppend_(pair[0], fresh, owner);
    lines.push(pair[0] + ' +' + fresh.length);
  });
  var msg = '가짜 1단계 데이터: ' + lines.join(', ');
  console.log(msg);
  return msg;
}
