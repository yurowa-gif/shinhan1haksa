/**
 * 2단계 가짜 데이터(실제 학생·교사 정보 사용 금지 — CLAUDE.md 1번). docs/plan/stage2.md T1a·T1b.
 *
 * buildFakeStage2Duty_(fake) : 순수 함수. buildFakeData_ 결과(fake)로 2027-01 근무표(duty_slots)와
 *                              운영 안 함 1일(day_schedules)을 만든다. 같은 입력이면 같은 결과(id도 고정).
 * buildFakeStage2Life_(fake, ruleRows) : 순수 함수. 2027-03(2027 1학기) 생활 기록 — 직접 OUT 2건인 학생 1명(퇴실 대상)·
 *                              1건인 학생 1명(violations), 서류 미제출 F7 급식 신청 2건(status_changes). 면담 기록은 넣지 않는다.
 *                              ruleRows = violation_rules 행(setup이 만든 id를 rule_id로 쓴다).
 * seedFakeStage2()           : 편집기에서 실행. seedFakeStage1() 뒤에. 두 번 실행해도 중복 없음(id가 이미 있으면 건너뜀).
 *
 * 근무자 = 가짜 교사 1~3 + 시험 학사 교사(Script Property TEST_TEACHER_EMAIL). 넷이 돌아가며 맡는다.
 * 교대 3건(PRD F3 완료 기준): 일반 교대 1, 교대의 교대 A→B→C 1(칸에는 A→C만, 중간 B는 swapped_by),
 * 근무표 담당자가 기록한 예비 대신 근무 1. 2027-01-01은 운영 안 함이고 그날 칸은 취소 행으로 남는다(결정 54).
 * 한계: 가짜 1월은 "2026 2학기(테스트)"(유형 학기) 안이다. 실제 1월은 겨울방학이다(방학 경로는 rules/duty.test.js가 증명).
 */

var FAKE2_MEMO = '가짜 데이터';
var FAKE2_MONTH = '2027-01';
var FAKE2_DAY_END = { mon_thu: '23:50', fri: '23:00', sat: '17:00', sun: '22:00' };   // Schema.gs DEFAULT_SETTINGS study.*.end
var FAKE2_CLOSED = '2027-01-01';
var FAKE2_SWAP = '2027-01-05';      // 화 21:30조 일반 교대
var FAKE2_CHAIN = '2027-01-13';     // 수 23:00조 교대의 교대
var FAKE2_COVER = '2027-01-23';     // 토 단독(시험 교사) → 예비(가짜교사1)가 대신 근무, 담당자(가짜교사2)가 기록

function buildFakeStage2Duty_(fake) {
  var pool = fake.users.filter(function (u) { return u.memo === FAKE2_MEMO && /hall_teacher/.test(u.roles); })
    .map(function (u) { return u.email; });
  var tester = fake.users.filter(function (u) { return u.memo === '시험 계정' && /hall_teacher/.test(u.roles); })[0];
  if (pool.length !== 3 || !tester) throw new Error('가짜 교사 3명과 시험 학사 교사(TEST_TEACHER_EMAIL)가 있어야 합니다.');
  pool.push(tester.email);
  var manager = fake.users.filter(function (u) { return u.memo === FAKE2_MEMO && /duty_manager/.test(u.roles); })[0].email;

  var slots = [];
  for (var day = 1; day <= 31; day++) {
    var date = FAKE2_MONTH + '-' + ('0' + day).slice(-2);
    var who = function (k) { return pool[(day + k) % pool.length]; };   // 그날 칸 둘 = who(0)·who(1), 비는 사람 = who(2)·who(3)
    dutySlotsFor_({ operating: true, date: date, end: FAKE2_DAY_END[baseDayType_(date)] }).forEach(function (f, i) {
      var r = { id: fakeId_('f8000000', slots.length + 1), date: date, slot: f.slot, end_time: f.end,
        original_email: who(i), actual_email: who(i), swapped_at: '', swapped_by: '',
        status: date === FAKE2_CLOSED ? '취소' : '유효', memo: date === FAKE2_CLOSED ? '가짜: 운영 안 함으로 취소' : FAKE2_MEMO };
      if (date === FAKE2_SWAP && f.slot === '21:30조') {
        r.actual_email = who(2); r.swapped_by = who(0); r.swapped_at = '2027-01-04T20:00:00'; r.memo = '가짜: 일반 교대';
      }
      if (date === FAKE2_CHAIN && f.slot === '23:00조') {
        r.actual_email = who(3); r.swapped_by = who(2); r.swapped_at = '2027-01-12T21:00:00';
        r.memo = '가짜: 교대의 교대 A→B→C(B = swapped_by, 중간 단계는 audit_log)';
      }
      if (date === FAKE2_COVER && f.slot === '단독') {
        r.actual_email = who(1); r.swapped_by = manager; r.swapped_at = '2027-01-23T08:30:00'; r.memo = '가짜: 예비 대신 근무(담당자 기록)';
      }
      slots.push(r);
    });
  }
  var daySchedules = [{ id: fakeId_('f8100000', 1), date: FAKE2_CLOSED, operating: 'FALSE', start: '', end: '', day_type: '',
    memo: '가짜: 신정 운영 안 함', status: '유효' }];
  return { dutySlots: slots, daySchedules: daySchedules, teachers: pool, manager: manager };
}

/* 생활 기록 학생: 1단계가 쓰지 않는 번호(특이사항 0~8, 고정 일정 10~17, 퇴실 28, 입실 29) */
var FAKE2_OUT2 = 19, FAKE2_OUT1 = 20, FAKE2_NODOC = [21, 22];

function buildFakeStage2Life_(fake, ruleRows) {
  var stage1 = buildFakeStage1_(fake);
  var term = stage1.term, st = fake.students;
  var ruleId = function (name) {
    var r = (ruleRows || []).filter(function (x) { return x.name === name && ruleRowLive_(x); })[0];
    if (!r) throw new Error('violation_rules에 항목이 없습니다(setup을 먼저 실행하세요): ' + name);
    return r.id;
  };
  var by = 'fake.teacher1@example.com';   // 그날 근무교사(가짜교사1)가 적발·입력
  var violations = [];
  var addOut = function (i, at, name, memo) {
    violations.push({ id: fakeId_('f8200000', violations.length + 1), term_id: term.id, student_id: st[i].id, occurred_at: at,
      rule_id: ruleId(name), rule_name: name, memo: memo, detected_by: by, entered_by: by,
      status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' });
  };
  addOut(FAKE2_OUT2, '2027-03-04T21:10:00', DEFAULT_VIOLATION_RULES[1][0], '가짜: 자습 중 휴대폰');
  addOut(FAKE2_OUT2, '2027-03-11T20:40:00', DEFAULT_VIOLATION_RULES[2][0], '가짜: 지시 불이행');
  addOut(FAKE2_OUT1, '2027-03-09T22:30:00', DEFAULT_VIOLATION_RULES[1][0], '가짜: 자습 중 휴대폰');

  /* 서류 미제출 F7 신청 2건(결정 3: 미제출이어도 적용). 적용일은 mealPlanChange_ 계산 그대로 */
  var statusChanges = [];
  var addMeal = function (i, item, value, requestedAt) {
    var mine = stage1.statusChanges.filter(function (c) { return c.student_id === st[i].id; });
    var p = mealPlanChange_(mine, st[i].id, item, value, requestedAt, { today: requestedAt.slice(0, 10) });
    if (p.blocked || p.superseded || p.toCancel.length || p.followUps.length) throw new Error('가짜 급식 신청 계획이 단순하지 않습니다: ' + st[i].id);
    statusChanges.push({ id: fakeId_('f8300000', statusChanges.length + 1), student_id: st[i].id, item: item, value: value,
      requested_at: requestedAt, effective_date: p.date, effective_date_auto: p.autoDate, reason: '가짜 신청',
      doc_submitted: 'FALSE', linked_change_id: '', source: 'F7', status: '유효', memo: FAKE2_MEMO, cancel_reason: '' });
  };
  addMeal(FAKE2_NODOC[0], '석식', '일반 석식', '2027-03-08T10:00:00');   // 11:30 전 → 당일
  addMeal(FAKE2_NODOC[1], '석식', '일반 석식', '2027-03-09T14:00:00');   // 11:30 뒤 → 다음 날

  return { term: term, violations: violations, statusChanges: statusChanges,
    out2Id: st[FAKE2_OUT2].id, out1Id: st[FAKE2_OUT1].id, noDocIds: FAKE2_NODOC.map(function (i) { return st[i].id; }) };
}

/** 편집기에서 실행. seedFakeData()·seedFakeStage1() 뒤에, 가짜 학생만 있는 DB에서만 동작한다. 두 번 실행해도 중복 없음. */
function seedFakeStage2() {
  var owner = assertOwnerRun_();
  var students = readAll_('students');
  if (!fake1DbIsAllFake_(students)) {
    throw new Error('가짜 학생(seedFakeData)만 있는 DB에서만 실행합니다. 실제 데이터가 있는 DB에는 쓰지 않습니다.');
  }
  var teacherEmail = normalizeEmail_(props_().getProperty('TEST_TEACHER_EMAIL'));
  if (!teacherEmail) throw new Error('Script Property TEST_TEACHER_EMAIL(시험 학사 교사)을 먼저 넣으세요.');
  var fake = buildFakeData_({ count: students.filter(function (s) { return s.memo === FAKE2_MEMO; }).length, teacherEmail: teacherEmail });
  var duty = buildFakeStage2Duty_(fake);
  var life = buildFakeStage2Life_(fake, readAll_('violation_rules'));
  var stage1First = buildFakeStage1_(fake).statusChanges[0].id;
  if (!readAll_('status_changes').some(function (r) { return r.id === stage1First; })) {
    throw new Error('1단계 가짜 데이터가 없습니다. seedFakeStage1()을 먼저 실행하세요.');
  }
  ensureTermSheets_([]);
  var lines = [];
  [['duty_slots', duty.dutySlots], ['day_schedules', duty.daySchedules],
    [termSheetName_('violations', life.term.id), life.violations], ['status_changes', life.statusChanges]].forEach(function (pair) {
    var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
    bulkAppend_(pair[0], fresh, owner);
    lines.push(pair[0] + ' +' + fresh.length);
  });
  var msg = '가짜 2단계 데이터: ' + lines.join(', ');
  console.log(msg);
  return msg;
}
