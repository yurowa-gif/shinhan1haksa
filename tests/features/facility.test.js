/** C35 F10 시설 사용 일지(결정 83): 학생 본인 쓰기·취소, 함께 쓴 학생 찾기(이름만), 그날 근무교사·관리자 보기, 관리자 누적표. gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com';
const TODAY = '2027-03-10', YEST = '2027-03-09';

function seeded() {
  const env = createGasEnv({ owner: OWNER, now: TODAY + 'T20:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.setup());   // 가짜 기간의 기간별 탭
  env.asOwner((c) => c.addUser(ATT, '시험 출결', 'attendance'));
  const students = env.rows('students');
  const A = students.find((s) => String(s.email).toLowerCase() === STUDENT);
  const B = students[1], C = students[2], D = students[3];
  const leftRow = env.rows('status_changes').find((x) => x.item === '학사' && x.value === '퇴실');
  const left = leftRow && students.find((s) => s.id === leftRow.student_id);
  // 학생 B 계정(다른 학생)
  const BMAIL = 'fake.student.b@fakeschool.invalid';
  env.asOwner((c) => { c.updateRecord_('students', B.id, { email: BMAIL }, OWNER); c.addUser(BMAIL, '시험 학생B', 'student'); });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const tab = () => env.rows('facility_logs_' + term.id.slice(0, 8));
  return { env, A, B, C, D, left, BMAIL, term, tab };
}
const call = (env, who, fn, ...a) => plain(env.call(who, fn, ...a));
const handleOf = (env, who, name, date) => call(env, who, 'searchFacilityStudents', name, date || TODAY).results.find((r) => r.name === name).handle;
const log = (o) => Object.assign({ facility: '원형테이블', date: TODAY, start: '15:30', end: '17:00', companions: [], purpose: '탐구 토론', confirmOverlap: false }, o || {});

test('쓰기: 저장 한 줄(유효·본인·함께 쓴 학생 id), audit create, 락 안에서 쓴다. 내 기록에는 함께 쓴 학생의 이름만 나오고 다른 학생의 id·학번·전화는 없다', () => {
  const x = seeded();
  const h = handleOf(x.env, STUDENT, x.B.name);
  const locks = [];
  const r = plain(x.env.as(STUDENT, (c) => {
    const orig = c.appendRecord_;
    c.appendRecord_ = (...a) => { if (String(a[0]).indexOf('facility_logs') === 0) locks.push(c.LockService.getScriptLock().hasLock()); return orig(...a); };
    return c.saveFacilityLog(log({ companions: [h] }));
  }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(locks, [true], '쓰기는 락 안에서');
  const rows = x.tab();
  assert.deepStrictEqual(rows.map((q) => [q.student_id, q.facility, q.date, q.start, q.end, q.companions, q.purpose, q.status, q.created_by]),
    [[x.A.id, '원형테이블', TODAY, '15:30', '17:00', x.B.id, '탐구 토론', '유효', STUDENT]]);
  assert.ok(x.env.auditActions().includes('create'));
  const f = call(x.env, STUDENT, 'getFacilityForm');
  assert.ok(f.ok && !('students' in f), '학생 목록을 통째로 내려주지 않는다');
  assert.deepStrictEqual(f.logs.map((l) => [l.facility, l.start, l.end, l.companions, l.status]), [['원형테이블', '15:30', '17:00', [x.B.name], '유효']]);
  const text = JSON.stringify(f);
  [x.B.id, x.C.id, x.B.student_no, x.C.student_no, x.C.name].forEach((v) => assert.ok(!text.includes(v), '다른 학생 정보 없음: ' + v));
  assert.ok(f.names.includes('특강실') && f.names.includes('원형테이블'));
});

test('권한: 학부모·교사·담임·관리자·출결 담당은 쓰기·찾기·취소·내 기록을 못 한다(거부 기록), 학생 B는 A의 일지를 취소할 수 없고 아무것도 바뀌지 않는다', () => {
  const x = seeded();
  const id = call(x.env, STUDENT, 'saveFacilityLog', log()).id;
  for (const who of [PARENT, HALL, HOMEROOM, OWNER, ATT]) {
    x.env.expectDenied(who, 'facility.write', 'saveFacilityLog', log());
    x.env.expectDenied(who, 'facility.write', 'getFacilityForm');
    x.env.expectDenied(who, 'facility.write', 'searchFacilityStudents', '가', TODAY);
    x.env.expectDenied(who, 'facility.write', 'cancelFacilityLog', x.term.id, id);
  }
  const before = JSON.stringify(x.tab());
  x.env.expectDenied(x.BMAIL, 'facility.write', 'cancelFacilityLog', x.term.id, id);
  assert.strictEqual(JSON.stringify(x.tab()), before, '남의 일지는 그대로');
  // 학생 계정이어도 학생 명단에 이메일이 없으면(본인 id 없음) 거부
  x.env.asOwner((c) => c.addUser('nobody.student@fakeschool.invalid', '명단 밖 학생', 'student'));
  x.env.expectDenied('nobody.student@fakeschool.invalid', 'facility.write', 'saveFacilityLog', log());
});

test('입력 검사: 미래·8일 전·시설 밖·시각 순서·형식·목적 길이·함께 쓴 학생이 후보가 아님(퇴실·모르는 표식) → 쓰기 0, 본인은 함께 쓴 학생에서 빠진다', () => {
  const x = seeded();
  const bad = (over, field) => {
    const r = call(x.env, STUDENT, 'saveFacilityLog', log(over));
    assert.deepStrictEqual([r.ok, r.errors && r.errors[0].field], [false, field], JSON.stringify([over, r]));
  };
  bad({ date: '2027-03-11' }, 'date');
  bad({ date: '2027-03-02' }, 'date');   // 오늘 − 8일
  bad({ date: '' }, 'date');
  bad({ facility: '없는시설' }, 'facility');
  bad({ facility: '' }, 'facility');
  bad({ start: '17:00', end: '15:30' }, 'end');
  bad({ start: '15:30', end: '15:30' }, 'end');
  bad({ start: '25:00' }, 'start');
  bad({ end: '' }, 'end');
  bad({ purpose: '가'.repeat(101) }, 'purpose');
  bad({ companions: ['h-없는표식'] }, 'companions');
  bad({ companions: new Array(11).fill(0).map((_, i) => 'x' + i) }, 'companions');
  if (x.left) {
    // 퇴실한 학생은 후보가 아니다(찾아도 안 나오고, 표식을 알아도 저장되지 않는다)
    assert.deepStrictEqual(call(x.env, STUDENT, 'searchFacilityStudents', x.left.name, TODAY).results.filter((q) => q.name === x.left.name && x.left.name !== x.A.name).length, 0);
  }
  assert.strictEqual(x.tab().length, 0, '검사 실패는 쓰기 0');
  // 8일 전 경계(7일 전은 가능), 본인 표식은 무시
  const ok = call(x.env, STUDENT, 'saveFacilityLog', log({ date: '2027-03-03' }));
  assert.strictEqual(ok.ok, true, JSON.stringify(ok));
});

test('겹침: 같은 시설·같은 시간이면 저장 전에 막고(needsConfirm, 쓰기 0) 확인하면 저장. 맞닿음·다른 시설은 겹침이 아니다. 안내에 다른 학생 이름은 없다', () => {
  const x = seeded();
  call(x.env, BMAILOF(x), 'saveFacilityLog', log({ start: '15:30', end: '17:00' }));
  const r = call(x.env, STUDENT, 'saveFacilityLog', log({ start: '16:00', end: '18:00' }));
  assert.deepStrictEqual([r.ok, r.needsConfirm, r.errors[0].field], [false, true, 'end']);
  assert.ok(r.errors[0].message.includes('원형테이블 15:30–17:00') && !JSON.stringify(r).includes(x.B.name), JSON.stringify(r));
  assert.strictEqual(x.tab().length, 1);
  const forced = call(x.env, STUDENT, 'saveFacilityLog', log({ start: '16:00', end: '18:00', confirmOverlap: true }));
  assert.deepStrictEqual([forced.ok, forced.overlapped], [true, true]);
  assert.strictEqual(call(x.env, STUDENT, 'saveFacilityLog', log({ start: '18:00', end: '19:00' })).ok, true, '맞닿음');
  assert.strictEqual(call(x.env, STUDENT, 'saveFacilityLog', log({ facility: '특강실', start: '16:00', end: '18:00' })).ok, true, '다른 시설');
  const dup = call(x.env, STUDENT, 'saveFacilityLog', log({ start: '18:00', end: '19:00', confirmOverlap: true }));
  assert.deepStrictEqual([dup.ok, dup.errors[0].field], [false, 'start'], '같은 줄 두 번은 막는다');
});
function BMAILOF(x) { return x.BMAIL; }

test('취소: 사유 없이 확인만, 행은 남고 status 취소·cancel_reason 본인 취소·audit update, 두 번 취소는 stale, 내 기록에 취소로 보인다', () => {
  const x = seeded();
  const id = call(x.env, STUDENT, 'saveFacilityLog', log()).id;
  const cancel = () => call(x.env, STUDENT, 'cancelFacilityLog', x.term.id, id);
  assert.strictEqual(x.tab()[0].status, '유효');
  const r = cancel();
  assert.strictEqual(r.ok, true);
  const rows = x.tab();
  assert.deepStrictEqual([rows.length, rows[0].status, rows[0].cancel_reason], [1, '취소', '본인 취소']);
  assert.ok(x.env.auditActions().includes('update'));
  assert.strictEqual(cancel().stale, true);
  assert.strictEqual(call(x.env, STUDENT, 'cancelFacilityLog', 'nope', id).ok, false);
  const f = call(x.env, STUDENT, 'getFacilityForm');
  assert.deepStrictEqual(f.logs.map((l) => l.status), ['취소']);
});

test('함께 쓴 학생 찾기: 이름·초성으로 최대 8명, 이름과 표식뿐(id·학번 없음), 본인·그날 입실 아님 제외, 빈 검색어는 0명', () => {
  const x = seeded();
  const r = call(x.env, STUDENT, 'searchFacilityStudents', 'ㅂ', TODAY);
  assert.ok(r.ok && r.results.length <= 8 && r.results.length > 0, JSON.stringify(r));
  r.results.forEach((q) => assert.deepStrictEqual(Object.keys(q).sort(), ['handle', 'name']));
  const text = JSON.stringify(r);
  assert.ok(!text.includes(x.B.id) && !text.includes(x.B.student_no) && !text.includes('@'), '식별 정보 없음');
  assert.ok(!call(x.env, STUDENT, 'searchFacilityStudents', x.A.name, TODAY).results.some((q) => q.name === x.A.name && x.A.name !== x.B.name), '본인은 후보가 아니다');
  assert.deepStrictEqual(call(x.env, STUDENT, 'searchFacilityStudents', '', TODAY).results, []);
  assert.deepStrictEqual(call(x.env, STUDENT, 'searchFacilityStudents', '가', '2027-03-11').results, [], '미래 날짜');
  // 표식은 학생마다 정해져 있고 저장 때 id로 풀린다
  const h = handleOf(x.env, STUDENT, x.B.name);
  assert.strictEqual(handleOf(x.env, STUDENT, x.B.name), h);
  assert.strictEqual(call(x.env, STUDENT, 'saveFacilityLog', log({ companions: [h, h] })).ok, true);
  assert.strictEqual(x.tab()[0].companions, x.B.id, '중복 표식은 한 번만');
});

test('그날 일지: 관리자는 어느 날이든, 학사 교사는 그날 실제 근무일 때만 오늘 것(아니면 안내+거부 기록), 학생·학부모·담임은 거부', () => {
  const x = seeded();
  call(x.env, STUDENT, 'saveFacilityLog', log({ companions: [handleOf(x.env, STUDENT, x.B.name)] }));
  call(x.env, STUDENT, 'cancelFacilityLog', x.term.id, call(x.env, STUDENT, 'saveFacilityLog', log({ facility: '특강실', start: '19:00', end: '20:00' })).id);
  for (const who of [STUDENT, PARENT, HOMEROOM, ATT]) x.env.expectDenied(who, 'facility.view', 'getFacilityDay', TODAY);
  // 학사 교사: 근무 아님
  const before = x.env.rows('audit_log').length;
  const no = call(x.env, HALL, 'getFacilityDay', TODAY);
  assert.deepStrictEqual([no.ok, /근무 선생님만/.test(no.error)], [false, true]);
  assert.ok(x.env.rows('audit_log').slice(before).some((l) => l.action === 'denied:facility.view'), '거부 기록');
  // 근무 등록
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '단독', end_time: '', original_email: HALL, actual_email: HALL, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, OWNER));
  const yes = call(x.env, HALL, 'getFacilityDay', TODAY);
  assert.strictEqual(yes.ok, true, JSON.stringify(yes));
  assert.deepStrictEqual(yes.facilities.map((f) => [f.facility, f.items.map((i) => [i.start, i.end, i.status])]), [['특강실', [['19:00', '20:00', '취소']]], ['원형테이블', [['15:30', '17:00', '유효']]]]);
  const item = yes.facilities[1].items[0];
  assert.deepStrictEqual([item.student.name, item.companions.map((c) => c.name)], [x.A.name, [x.B.name]]);
  assert.ok(!JSON.stringify(yes).includes('@'), '이메일 없음');
  assert.strictEqual(call(x.env, HALL, 'getFacilityDay', YEST).ok, false, '근무교사는 오늘 것만(dutyWindow 0)');
  assert.strictEqual(call(x.env, OWNER, 'getFacilityDay', YEST).ok, true, '관리자는 어느 날이든');
  assert.strictEqual(call(x.env, OWNER, 'getFacilityDay', '2027-03-10x').ok, false);
});

test('누적표(관리자만): 학생 × 날짜 분 합, 함께 쓴 학생도 같은 시간, 취소 제외, 범위 한도, 시설 거르기', () => {
  const x = seeded();
  const hB = handleOf(x.env, STUDENT, x.B.name);
  call(x.env, STUDENT, 'saveFacilityLog', log({ date: YEST, start: '15:00', end: '16:30', companions: [hB] }));   // 90분
  call(x.env, STUDENT, 'saveFacilityLog', log({ facility: '특강실', start: '19:00', end: '20:00' }));   // 60분
  const cancelled = call(x.env, STUDENT, 'saveFacilityLog', log({ facility: '특강실', start: '21:00', end: '22:00' }));
  call(x.env, STUDENT, 'cancelFacilityLog', x.term.id, cancelled.id);
  for (const who of [STUDENT, PARENT, HALL, HOMEROOM, ATT]) x.env.expectDenied(who, 'facility.report', 'getFacilityReport', { from: YEST, to: TODAY });
  const r = call(x.env, OWNER, 'getFacilityReport', { from: YEST, to: TODAY });
  assert.strictEqual(r.ok, true);
  const by = Object.fromEntries(r.students.map((s) => [s.id, s]));
  assert.deepStrictEqual([by[x.A.id].days[YEST], by[x.A.id].days[TODAY], by[x.A.id].total, by[x.A.id].count], [90, 60, 150, 2]);
  assert.deepStrictEqual([by[x.B.id].days[YEST], by[x.B.id].total, by[x.B.id].count], [90, 90, 1], '함께 쓴 학생도 센다');
  assert.strictEqual(r.totalMinutes, 240);
  assert.deepStrictEqual(r.dates.map((d) => d.date), [YEST, TODAY]);
  const only = call(x.env, OWNER, 'getFacilityReport', { from: YEST, to: TODAY, facility: '원형테이블' });
  assert.deepStrictEqual([only.totalMinutes, only.students.length], [180, 2]);
  assert.strictEqual(call(x.env, OWNER, 'getFacilityReport', { from: '2027-01-01', to: '2027-04-30' }).ok, false, '62일 한도');
  assert.strictEqual(call(x.env, OWNER, 'getFacilityReport', { from: TODAY, to: YEST }).ok, false);
  assert.strictEqual(call(x.env, OWNER, 'getFacilityReport', { from: '', to: '' }).ok, false);
});

test('홈: 관리자는 오늘 건수, 학사 교사는 근무일에만 카드(건수뿐), 학생·학부모 홈 응답에는 시설 훅이 없다', () => {
  const x = seeded();
  call(x.env, STUDENT, 'saveFacilityLog', log());
  const a = call(x.env, OWNER, 'getHomeData', 'admin').facility;
  assert.deepStrictEqual([a.isAdmin, a.onDuty, a.count], [true, true, 1]);
  assert.deepStrictEqual(call(x.env, HALL, 'getHomeData', 'hall_teacher').facility, { isAdmin: false, onDuty: false, count: 0 });
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '단독', end_time: '', original_email: HALL, actual_email: HALL, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, OWNER));
  assert.deepStrictEqual(call(x.env, HALL, 'getHomeData', 'hall_teacher').facility, { isAdmin: false, onDuty: true, count: 1 });
  assert.ok(!('facility' in call(x.env, STUDENT, 'getHomeData', 'student')) && !('facility' in call(x.env, PARENT, 'getHomeData', 'parent')));
});

test('순수: 시설 목록·초성 검색·겹침·분·누적 계산', () => {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  const f = (fn, ...a) => plain(env.asOwner((c) => c[fn](...a)));
  assert.deepStrictEqual(f('facNames_', []), ['특강실', '원형테이블']);
  assert.deepStrictEqual(f('facNames_', [{ key: 'facility.names', value: ' 소회의실, 특강실 ,소회의실 ' }]), ['소회의실', '특강실']);
  assert.strictEqual(f('facChosung_', '김가온'), 'ㄱㄱㅇ');
  assert.deepStrictEqual([f('facNameMatch_', 'ㄱㅇ', '김가온'), f('facNameMatch_', 'ㄴㅇ', '김가온'), f('facNameMatch_', 'ㄱㄱㅇ', '김가온'), f('facNameMatch_', '가온', '김가온'), f('facNameMatch_', '', '김가온'), f('facNameMatch_', '나', '김가온')], [true, false, true, true, false, false]);
  const rows = [{ status: '유효', facility: 'A', date: TODAY, start: '15:00', end: '16:00' }, { status: '취소', facility: 'A', date: TODAY, start: '15:00', end: '16:00' }, { status: '유효', facility: 'B', date: TODAY, start: '15:00', end: '16:00' }];
  assert.deepStrictEqual(f('facOverlaps_', rows, { facility: 'A', date: TODAY, start: '15:30', end: '16:30' }), [{ start: '15:00', end: '16:00' }]);
  assert.deepStrictEqual(f('facOverlaps_', rows, { facility: 'A', date: TODAY, start: '16:00', end: '17:00' }), [], '맞닿음');
  assert.strictEqual(f('facMinutes_', { start: '15:30', end: '17:00' }), 90);
  const rep = f('facReport_', [{ status: '유효', date: TODAY, student_id: 's1', companions: 's2,s1,s2', start: '15:00', end: '16:00' }, { status: '취소', date: TODAY, student_id: 's1', companions: '', start: '15:00', end: '16:00' }], TODAY, TODAY);
  assert.deepStrictEqual(rep.byStudent, { s1: { days: { [TODAY]: 60 }, total: 60, count: 1 }, s2: { days: { [TODAY]: 60 }, total: 60, count: 1 } });
});
