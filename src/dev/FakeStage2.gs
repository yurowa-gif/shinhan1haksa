/**
 * 2단계 가짜 데이터(실제 학생·교사 정보 사용 금지 — CLAUDE.md 1번). docs/plan/stage2.md T1a·T1b.
 *
 * buildFakeStage2Duty_(fake) : 순수 함수. buildFakeData_ 결과(fake)로 2027-01 근무표(duty_slots)와
 *                              운영 안 함 1일(day_schedules)을 만든다. 같은 입력이면 같은 결과(id도 고정).
 * seedFakeStage2()           : 편집기에서 실행. 두 번 실행해도 중복 없음(id가 이미 있으면 건너뜀).
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
        r.memo = '가짜: 교대의 교대 A→B→C(B = swapped_by, 중간 단계 감사 기록은 시드에 없음)';
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

/** 편집기에서 실행. seedFakeData()로 가짜 학생을 먼저 만든 DB에서만 동작한다. 두 번 실행해도 중복 없음. */
function seedFakeStage2() {
  var owner = assertOwnerRun_();
  var students = readAll_('students');
  if (!fake1DbIsAllFake_(students)) {
    throw new Error('가짜 학생(seedFakeData)만 있는 DB에서만 실행합니다. 실제 데이터가 있는 DB에는 쓰지 않습니다.');
  }
  var teacherEmail = normalizeEmail_(props_().getProperty('TEST_TEACHER_EMAIL'));
  if (!teacherEmail) throw new Error('Script Property TEST_TEACHER_EMAIL(시험 학사 교사)을 먼저 넣으세요.');
  var fake = buildFakeData_({ teacherEmail: teacherEmail });
  if (!readAll_('terms').some(function (t) { return t.id === fake.terms[0].id; })) {
    throw new Error('가짜 운영 기간이 없습니다. seedFakeData()를 먼저 실행하세요.');
  }
  var data = buildFakeStage2Duty_(fake);
  // 근무자는 users에 살아 있는 학사 교사여야 하고, 기록자는 근무표 담당자여야 한다(속성을 늦게 넣은 경우 등)
  var users = {};
  readAll_('users').forEach(function (u) { if (String(u.active).toUpperCase() === 'TRUE') users[normalizeEmail_(u.email)] = String(u.roles); });
  data.teachers.forEach(function (e) {
    if (!/hall_teacher/.test(users[e] || '')) throw new Error('users에 학사 교사로 없습니다(addUser 먼저): ' + e);
  });
  if (!/duty_manager/.test(users[data.manager] || '')) throw new Error('users에 근무표 담당자로 없습니다: ' + data.manager);
  // 이미 있는 1월 근무표·1/1 일정(이 시드가 쓴 것이 아닌 행)을 덮지 않는다
  var mine = {};
  data.dutySlots.concat(data.daySchedules).forEach(function (r) { mine[r.id] = true; });
  var foreign = readAll_('duty_slots').filter(function (r) { return String(r.date).slice(0, 7) === FAKE2_MONTH && !mine[r.id]; })
    .concat(readAll_('day_schedules').filter(function (r) { return String(r.date) === FAKE2_CLOSED && !mine[r.id]; }));
  if (foreign.length) throw new Error(FAKE2_MONTH + ' 근무표나 ' + FAKE2_CLOSED + ' 일정에 다른 행이 ' + foreign.length + '개 있어 쓰지 않습니다.');
  var lines = [];
  [['duty_slots', data.dutySlots], ['day_schedules', data.daySchedules]].forEach(function (pair) {
    var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
    bulkAppend_(pair[0], fresh, owner);
    lines.push(pair[0] + ' +' + fresh.length);
  });
  var msg = '가짜 2단계 데이터: ' + lines.join(', ');
  console.log(msg);
  return msg;
}
