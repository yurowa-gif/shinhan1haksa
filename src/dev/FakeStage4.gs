/**
 * T5 가짜 데이터 보강(4단계, 결정 72·74). 편집기에서 seedFakeStage1() 뒤에 실행한다. 두 번 실행해도 중복 없음.
 * - 휴일 블록(학기|holiday, C24 기본 틀 09:00~21:50) — 블록 편집에서 관리자가 '휴일'을 저장한 것과 같다. 이미 있으면 넣지 않는다.
 * - 휴일 2일(day_type holiday, 09:00~21:50): 5/5(수)·6/3(목)
 * - 시험 기간 1주(4/19~4/23, 종료 24:00). ASSUMPTION: 새벽 연장(25:00 등)은 규칙이 바뀐 뒤에 연다(C24 주석) — 지금은 24:00
 * - 학기 중 추가 입실 3명(4/1, 결정 74 '다음 달 1일' 기본값): 학생·등록·상태 행(명단 올리기가 넣는 값). 셋 중 하나는 기숙사생.
 * 추가 입실 학생은 memo가 '가짜 데이터(4단계 추가 입실)'라 그 뒤에는 seedFakeStage1~3이 다시 돌지 않는다(학생 수로 만드는 시드가 어긋나지 않게).
 * - (S4-0, 결정 75·76) 서류 종류 6가지 + 2027 1학기 학생별 제출 표시(일부 미제출·해당없음),
 *   프로그램 1개(4/7 '가짜 파워클래스', 그날 학사생 전원 = 30명대) + 참가자 + 참가자마다 '학사 내 프로그램' 사전 특이사항,
 *   가짜 전화번호(학생 010-0000-1xxx, 보호자 010-0000-2xxx)와 보호자 이름. 실제와 겹치지 않는 형식만.
 *   프로그램 특이사항의 모양은 C28(#173)과 같다: 묶음 id는 참가자마다 새로, 사유 '프로그램: 이름', 확정, 만든 사람 = 요청·확정자.
 * - (R19, 결정 73) 2027 여름방학(테스트) 기간 + 등록(1학기 끝날 학사생 그대로) + 중식 신청: 셋 중 둘은 방학 시작일부터 실시,
 *   그중 한 명은 방학 중(7/21 수 10:00) 미실시 신청 → 다음 주 월요일. 적용일은 mealPlanChange_로 계산한다.
 * 120명대 프로그램은 리허설(학생 100명 이상)에서 만든다.
 */
var FAKE4_MEMO = '가짜 데이터(4단계 추가 입실)';
var FAKE4_HOLIDAYS = ['2027-05-05', '2027-06-03'];
var FAKE4_EXAM = { from: '2027-04-19', to: '2027-04-23', end: '24:00' };
var FAKE4_ENTRY = '2027-04-01';
var FAKE4_DOC_TYPES = ['입실 동의서', '학부모 개인정보 동의', '자기소개서', '상담 기록지', '결핵검사 결과', '학원 수강증'];
var FAKE4_PROGRAM = { name: '가짜 파워클래스', date: '2027-04-07', blocks: '20:00-22:00' };
var FAKE4_EX_TYPE = '학사 내 프로그램(파워클래스·면접특강 등)';
var FAKE4_BY = 'fake.teacher3@example.com';   // 출결 담당(FakeData의 가짜교사3)
var FAKE4_VACATION = { id: 'a3a3a3a3-0000-4000-8000-000000000003', name: '2027 여름방학(테스트)', type: '방학',
  start_date: '2027-07-19', end_date: '2027-08-13', memo: '가짜 데이터' };

/**
 * 순수: 방학 기간·등록·중식 행(R19). changes = 지금 status_changes(학사 상태 판정·중식 계획에 쓴다),
 * termEnrollments = 1학기 등록 행(정렬) → {term, enrollments, lunch}
 */
function buildFakeStage4Vacation_(term1, termEnrollments, changes) {
  var v = FAKE4_VACATION;
  var stay = termEnrollments.filter(function (e) { return statusOn_(changes, e.student_id, '학사', term1.end_date) === '입실'; });
  var enrollments = stay.map(function (e, i) {
    return { id: fakeId_('f9c00000', i + 1), term_id: v.id, student_id: e.student_id, teacher_email: e.teacher_email, veritas: e.veritas,
      commute_type: e.commute_type, end_type: '', memo: '가짜 데이터' };
  });
  var lunch = [], all = changes.slice();
  var add = function (sid, value, at, today) {
    var plan = mealPlanChange_(all, sid, '중식', value, at, { today: today, vacation: v });
    if (!plan.date) throw new Error('가짜 중식 계획 오류: ' + sid + ' ' + value);
    var row = { id: fakeId_('f9d00000', lunch.length + 1), student_id: sid, item: '중식', value: value, requested_at: at,
      effective_date: plan.date, effective_date_auto: plan.date, reason: '가짜: 방학 중식', doc_submitted: 'TRUE',
      linked_change_id: '', source: 'F7', status: '유효', memo: '가짜 데이터', cancel_reason: '' };
    lunch.push(row); all.push(row);
  };
  var eaters = stay.filter(function (e, i) { return i % 3 !== 2; }).map(function (e) { return e.student_id; });
  eaters.forEach(function (sid) { add(sid, '실시', '2027-07-12T10:00:00', '2027-07-12'); });
  add(eaters[0], '미실시', '2027-07-21T10:00:00', '2027-07-21');
  return { term: v, enrollments: enrollments, lunch: lunch, eaters: eaters };
}

/**
 * 순수: 서류·프로그램·전화(S4-0). termStudentIds = 이번 기간 등록 학생 id(정렬), programIds = 프로그램 날 학사생 id(정렬),
 * students·guardianLinks = 연락처 포함 행 → {docTypes, docs, programs, participants, exceptions, studentPhones, guardianPatches}
 */
function buildFakeStage4Contacts_(term, termStudentIds, programIds, students, guardianLinks) {
  var docTypes = FAKE4_DOC_TYPES.map(function (n, i) {
    return { id: fakeId_('f9700000', i + 1), name: n, description: '가짜 서류', sort_order: String(i + 1), status: '유효' };
  });
  // 제출 표시: (학생 i + 서류 j) % 7 === 0 이면 행 없음(미제출), 학원 수강증은 학생 셋 중 하나가 해당없음, 나머지 제출
  var docs = [];
  termStudentIds.forEach(function (sid, i) {
    docTypes.forEach(function (dt, j) {
      if ((i + j) % 7 === 0) return;
      var na = j === 5 && i % 3 === 0;
      docs.push({ id: fakeId_('f9800000', docs.length + 1), term_id: term.id, student_id: sid, doc_type_id: dt.id,
        state: na ? '해당없음' : '제출', submitted_date: na ? '' : '2027-03-0' + (2 + (i % 4)), memo: '' });
    });
  });
  var pid = fakeId_('f9900000', 1);
  var programs = [{ id: pid, name: FAKE4_PROGRAM.name, date: FAKE4_PROGRAM.date, blocks: FAKE4_PROGRAM.blocks, memo: '가짜 데이터', status: '유효' }];
  var participants = [], exceptions = [];
  programIds.forEach(function (sid, i) {
    var eid = fakeId_('f9b00000', i + 1);
    exceptions.push({ id: eid, term_id: term.id, group_id: fakeId_('f9e00000', i + 1), student_id: sid, date: FAKE4_PROGRAM.date, blocks: FAKE4_PROGRAM.blocks,
      type: FAKE4_EX_TYPE, reason: '프로그램: ' + FAKE4_PROGRAM.name, status: '확정', requested_by: FAKE4_BY, requested_at: '2027-04-05T09:00:00',
      confirmed_by: FAKE4_BY, confirmed_at: '2027-04-05T09:00:00', cancel_reason: '' });
    participants.push({ id: fakeId_('f9a00000', i + 1), program_id: pid, student_id: sid, exception_id: eid, status: '유효' });
  });
  var sorted = function (rows) { return rows.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }); };
  var studentPhones = sorted(students).map(function (s, i) { return { id: s.id, patch: { phone: '010-0000-' + (1001 + i) } }; });
  var guardianPatches = sorted(guardianLinks).map(function (g, i) {
    return { id: g.id, patch: { name: '가짜보호자' + (i + 1), phone: '010-0000-' + (2001 + i) } };
  });
  return { docTypes: docTypes, docs: docs, programs: programs, participants: participants, exceptions: exceptions,
    studentPhones: studentPhones, guardianPatches: guardianPatches };
}

/** 순수: buildFakeData_ 결과(fake)와 휴일 블록 틀로 1단계 위에 더할 행 → {blocks, daySchedules, students, enrollments, statusChanges} */
function buildFakeStage4_(fake, holidayBlocks) {
  var term = fake.terms[FAKE1_TERM_INDEX];
  var blocks = holidayBlocks.map(function (b, i) {
    return { id: fakeId_('f9100000', i + 1), term_type: '학기', day_type: 'holiday', seq: String(i + 1), start: b[0], end: b[1],
      label: schemaHmShort_(b[0]) + '–' + schemaHmShort_(b[1]), status: '유효' };
  });
  var daySchedules = FAKE4_HOLIDAYS.map(function (d, i) {
    return { id: fakeId_('f9200000', i + 1), date: d, operating: 'TRUE', start: '09:00', end: '21:50', day_type: 'holiday',
      memo: '가짜: 휴일', status: '유효' };
  });
  for (var d = FAKE4_EXAM.from, k = 0; d <= FAKE4_EXAM.to; d = ymdAddDays_(d, 1), k++) {
    daySchedules.push({ id: fakeId_('f9300000', k + 1), date: d, operating: 'TRUE', start: '', end: FAKE4_EXAM.end, day_type: '',
      memo: '가짜: 시험 기간', status: '유효' });
  }
  // 추가 입실 3명: 이름·학번은 1~30번과 겹치지 않게 고정
  var extra = [
    { name: '가추가', gender: '여', grade: '1', class_no: '9', number: '31', commute: '원거리(관외)' },
    { name: '나추가', gender: '남', grade: '2', class_no: '9', number: '32', commute: '일반' },
    { name: '다추가', gender: '여', grade: '3', class_no: '9', number: '33', commute: '일반' }
  ];
  var teacher = fake.enrollments.filter(function (e) { return e.term_id === term.id; })[0].teacher_email;
  var students = [], enrollments = [], statusChanges = [];
  extra.forEach(function (x, i) {
    var sid = fakeId_('f9400000', i + 1);
    students.push({ id: sid, student_no: x.grade + '0' + x.class_no + x.number, name: x.name, gender: x.gender, grade: x.grade,
      class_no: x.class_no, number: x.number, track: x.grade === '1' ? '' : '문', email: 'fake.student4' + (i + 1) + '@example.com', memo: FAKE4_MEMO });
    enrollments.push({ id: fakeId_('f9500000', i + 1), term_id: term.id, student_id: sid, teacher_email: teacher, veritas: 'FALSE',
      commute_type: x.commute, end_type: '', memo: FAKE4_MEMO });
    var items = [['학사', '입실']];
    if (x.commute !== '일반') items.push(['기숙사', '입실'], ['조식', '실시']);
    items.push(['석식', '학사 석식']);
    items.forEach(function (it) {
      statusChanges.push({ id: fakeId_('f9600000', statusChanges.length + 1), student_id: sid, item: it[0], value: it[1],
        requested_at: '', effective_date: FAKE4_ENTRY, effective_date_auto: FAKE4_ENTRY, reason: '', doc_submitted: '',
        linked_change_id: '', source: '명단업로드', status: '유효', memo: FAKE4_MEMO, cancel_reason: '' });
    });
  });
  return { term: term, blocks: blocks, daySchedules: daySchedules, students: students, enrollments: enrollments, statusChanges: statusChanges };
}

/** 편집기에서 실행. seedFakeData() → seedFakeStage1() 뒤. 두 번 실행해도 중복 없음 */
function seedFakeStage4() {
  var owner = assertOwnerRun_();
  return withLock_(function () {
    ['students', 'terms', 'status_changes', 'blocks', 'day_schedules', 'enrollments'].forEach(function (t) { invalidate_('db', t); });
    var students = readAll_('students');
    if (!students.length || !students.every(function (s) { return s.memo === FAKE1_MEMO || s.memo === FAKE4_MEMO; })) {
      throw new Error('가짜 학생(seedFakeData)만 있는 DB에서만 실행합니다. 실제 데이터가 있는 DB에는 쓰지 않습니다.');
    }
    var fake = buildFakeData_({ count: students.filter(function (s) { return s.memo === FAKE1_MEMO; }).length });
    var stage1First = buildFakeStage1_(fake).statusChanges[0].id;
    if (!readAll_('status_changes').some(function (r) { return r.id === stage1First; })) throw new Error('seedFakeStage1()을 먼저 실행하세요.');
    var data = buildFakeStage4_(fake, CAL_HOLIDAY_BLOCKS);
    var mine = {};
    data.daySchedules.concat(data.blocks).forEach(function (r) { mine[r.id] = true; });
    var dates = {};
    data.daySchedules.forEach(function (r) { dates[r.date] = true; });
    // 이 시드가 쓴 것이 아닌 그날 일정·휴일 블록이 있으면 덮지 않는다(휴일 블록은 관리자가 먼저 저장했으면 건너뜀)
    var foreignDays = readAll_('day_schedules').filter(function (r) { return dates[r.date] && !mine[r.id] && r.status !== '취소'; });
    if (foreignDays.length) throw new Error('가짜 휴일·시험 기간 날짜에 다른 일정 ' + foreignDays.length + '개가 있어 쓰지 않습니다.');
    var hasHoliday = readAll_('blocks').some(function (b) { return b.term_type === '학기' && b.day_type === 'holiday' && b.status !== '취소' && !mine[b.id]; });
    var plan = [['blocks', hasHoliday ? [] : data.blocks], ['day_schedules', data.daySchedules], ['students', data.students],
      ['enrollments', data.enrollments], ['status_changes', data.statusChanges]];
    var lines = [];
    plan.forEach(function (pair) {
      invalidate_('db', pair[0]);
      var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
      bulkAppend_(pair[0], fresh, owner);
      lines.push(pair[0] + ' +' + fresh.length);
    });
    // 서류·프로그램·전화(S4-0): 위에서 쓴 추가 입실 학생까지 넣고 계산한다
    ['students', 'enrollments', 'status_changes', 'guardian_links'].forEach(function (t) { invalidate_('db', t); });
    var changes = readAll_('status_changes');
    var termIds = readAll_('enrollments').filter(function (e) { return e.term_id === data.term.id; })
      .map(function (e) { return e.student_id; }).sort();
    var programIds = termIds.filter(function (sid) { return statusOn_(changes, sid, '학사', FAKE4_PROGRAM.date) === '입실'; });
    var cx = buildFakeStage4Contacts_(data.term, termIds, programIds, readContacts_('students'), readContacts_('guardian_links'));
    ensureTermSheets_([]);
    [['doc_types', cx.docTypes], [termSheetName_('student_docs', data.term.id), cx.docs], ['programs', cx.programs],
      [termSheetName_('exceptions', data.term.id), cx.exceptions], ['program_participants', cx.participants]].forEach(function (pair) {
      invalidate_('db', pair[0]);
      var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
      bulkAppend_(pair[0], fresh, owner);
      lines.push(pair[0].replace(/_[0-9a-f]{8}$/, '') + ' +' + fresh.length);
    });
    // 전화·보호자 이름: 이미 같은 값이면 건너뛴다(감사 기록에는 값이 '(생략)'으로만 남는다)
    [['students', cx.studentPhones], ['guardian_links', cx.guardianPatches]].forEach(function (pair) {
      var cur = {};
      readContacts_(pair[0]).forEach(function (r) { cur[r.id] = r; });
      var todo = pair[1].filter(function (p) { return Object.keys(p.patch).some(function (k) { return String(cur[p.id][k] || '') !== p.patch[k]; }); });
      bulkUpdateRecords_(pair[0], todo, owner);
      lines.push(pair[0] + ' 연락처 ' + todo.length);
    });
    // 방학 중식(R19): 방학 기간과 겹치는 다른 운영 기간이 있으면 쓰지 않는다
    invalidate_('db', 'terms');
    var v = FAKE4_VACATION;
    var overlap = readAll_('terms').filter(function (t) { return t.id !== v.id && t.start_date <= v.end_date && t.end_date >= v.start_date; });
    if (overlap.length) throw new Error('가짜 여름방학 날짜에 다른 운영 기간이 있어 쓰지 않습니다: ' + overlap.map(function (t) { return t.name; }).join(', '));
    ['enrollments', 'status_changes'].forEach(function (t) { invalidate_('db', t); });
    var vac = buildFakeStage4Vacation_(data.term,
      readAll_('enrollments').filter(function (e) { return e.term_id === data.term.id; }).sort(function (a, b) { return a.student_id < b.student_id ? -1 : 1; }),
      readAll_('status_changes').filter(function (c) { return c.item !== '중식' || c.memo !== '가짜 데이터'; }));
    [['terms', [vac.term]], ['enrollments', vac.enrollments], ['status_changes', vac.lunch]].forEach(function (pair) {
      invalidate_('db', pair[0]);
      var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
      bulkAppend_(pair[0], fresh, owner);
      lines.push((pair[0] === 'status_changes' ? '중식' : pair[0] === 'terms' ? '방학' : '방학 등록') + ' +' + fresh.length);
    });
    ensureTermSheets_([]);
    var msg = '가짜 4단계 데이터: ' + lines.join(', ') + (hasHoliday ? ' (휴일 블록은 이미 있어 그대로)' : '');
    console.log(msg);
    return msg;
  });
}
