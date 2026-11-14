/**
 * T5 가짜 데이터 보강(4단계, 결정 72·74). 편집기에서 seedFakeStage1() 뒤에 실행한다. 두 번 실행해도 중복 없음.
 * - 휴일 블록(학기|holiday, C24 기본 틀 09:00~21:50) — 블록 편집에서 관리자가 '휴일'을 저장한 것과 같다. 이미 있으면 넣지 않는다.
 * - 휴일 2일(day_type holiday, 09:00~21:50): 5/5(수)·6/3(목)
 * - 시험 기간 1주(4/19~4/23, 종료 24:00). ASSUMPTION: 새벽 연장(25:00 등)은 규칙이 바뀐 뒤에 연다(C24 주석) — 지금은 24:00
 * - 학기 중 추가 입실 3명(4/1, 결정 74 '다음 달 1일' 기본값): 학생·등록·상태 행(명단 올리기가 넣는 값). 셋 중 하나는 기숙사생.
 * 추가 입실 학생은 memo가 '가짜 데이터(4단계 추가 입실)'라 그 뒤에는 seedFakeStage1~3이 다시 돌지 않는다(학생 수로 만드는 시드가 어긋나지 않게).
 * 서류·프로그램·전화번호는 S4-0 탭이 생긴 뒤 더한다. 방학 중식은 R19 뒤.
 */
var FAKE4_MEMO = '가짜 데이터(4단계 추가 입실)';
var FAKE4_HOLIDAYS = ['2027-05-05', '2027-06-03'];
var FAKE4_EXAM = { from: '2027-04-19', to: '2027-04-23', end: '24:00' };
var FAKE4_ENTRY = '2027-04-01';

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
    var msg = '가짜 4단계 데이터: ' + lines.join(', ') + (hasHoliday ? ' (휴일 블록은 이미 있어 그대로)' : '');
    console.log(msg);
    return msg;
  });
}
