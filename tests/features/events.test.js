/** C34 F13 월별 일정(결정 80): 등록·취소(관리자), 교사 역할 보기, 달 경계를 넘는 여러 날 일정, 운영 안 하는 날 표시, stale, 홈 카드. gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';

function seeded() {
  const env = createGasEnv({ owner: OWNER, now: '2027-03-09T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  return env;
}
const call = (env, who, fn, ...a) => plain(env.call(who, fn, ...a));
const tokenOf = (env, month) => call(env, OWNER, 'getEventData', month).token;
const ev = (over) => Object.assign({ title: '중간고사', kind: '시험', start_date: '2027-04-19', end_date: '2027-04-23', memo: '' }, over || {});
function add(env, over) {
  const r = call(env, OWNER, 'saveEvent', Object.assign(ev(over), { token: tokenOf(env, '2027-04') }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return r.id;
}

test('스키마: events 탭 헤더(공통 열 규칙), 설정 event.kinds 기본 5종, 권한 키 역할표', () => {
  const env = seeded();
  assert.deepStrictEqual(env.sheetValues('events')[0].map(String), ['id', 'start_date', 'end_date', 'title', 'kind', 'memo', 'status', 'cancel_reason', 'created_at', 'created_by', 'updated_at', 'updated_by']);
  const d = call(env, OWNER, 'getEventData', '2027-04');
  assert.deepStrictEqual(d.kinds, ['시험', '행사', '특강', '휴업', '기타']);
  const keys = env.as(OWNER, (c) => plain(c.permissions_()));
  assert.deepStrictEqual(keys['event.view'].roles, ['admin', 'attendance', 'hall_teacher', 'homeroom', 'duty_manager']);
  assert.deepStrictEqual(keys['event.edit'].roles, ['admin']);
});

test('등록(관리자만): 저장되면 행 한 줄·status 유효, audit에 create, 같은 일정 다시는 거부, 입력 검사 8종은 쓰기 0', () => {
  const env = seeded();
  const id = add(env);
  const rows = env.rows('events');
  assert.deepStrictEqual(rows.map((r) => [r.title, r.kind, r.start_date, r.end_date, r.status, r.created_by]), [['중간고사', '시험', '2027-04-19', '2027-04-23', '유효', OWNER]]);
  assert.ok(env.auditActions().includes('create'));
  const dup = call(env, OWNER, 'saveEvent', Object.assign(ev(), { token: tokenOf(env, '2027-04') }));
  assert.deepStrictEqual([dup.ok, dup.errors[0].field], [false, 'title']);
  const bad = (over, field) => { const r = call(env, OWNER, 'saveEvent', Object.assign(ev({ title: '다른 일정' }), over, { token: tokenOf(env, '2027-04') })); assert.deepStrictEqual([r.ok, r.errors[0].field], [false, field], JSON.stringify(over)); };
  bad({ title: '' }, 'title'); bad({ title: '가'.repeat(61) }, 'title'); bad({ kind: '없는종류' }, 'kind'); bad({ kind: '' }, 'kind');
  bad({ start_date: '' }, 'start_date'); bad({ end_date: '2027-04-18' }, 'end_date'); bad({ end_date: '2028-12-31' }, 'end_date'); bad({ memo: 'm'.repeat(201) }, 'memo');
  assert.strictEqual(env.rows('events').length, 1);
  // 끝날이 비면 시작일 하루
  const one = call(env, OWNER, 'saveEvent', Object.assign(ev({ title: '체육대회', kind: '행사', start_date: '2027-05-14', end_date: '' }), { token: tokenOf(env, '2027-05') }));
  assert.strictEqual(one.ok, true);
  assert.deepStrictEqual(call(env, OWNER, 'getEventData', '2027-05').events.map((e) => [e.title, e.start, e.end, e.days]), [['체육대회', '2027-05-14', '2027-05-14', 1]]);
  assert.ok(id);
});

test('권한: 등록·취소는 관리자만(나머지 6역할 거부 + denied:event.edit, 쓰기 0), 보기는 교사 5역할, 학생·학부모 거부(denied:event.view)', () => {
  const env = seeded();
  const id = add(env);
  const tok = tokenOf(env, '2027-04');
  const before = JSON.stringify(env.rows('events'));
  for (const who of [HALL, ATT, HOMEROOM, DUTYM, STUDENT, PARENT]) {
    env.expectDenied(who, 'event.edit', 'saveEvent', Object.assign(ev({ title: '몰래' }), { token: tok }));
    env.expectDenied(who, 'event.edit', 'cancelEvent', id, '사유 확인', tok);
  }
  assert.strictEqual(JSON.stringify(env.rows('events')), before);
  for (const who of [HALL, ATT, HOMEROOM, DUTYM]) {
    const d = call(env, who, 'getEventData', '2027-04');
    assert.deepStrictEqual([d.canEdit, d.events.map((e) => e.title)], [false, ['중간고사']], who);
  }
  assert.strictEqual(call(env, OWNER, 'getEventData', '2027-04').canEdit, true);
  for (const who of [STUDENT, PARENT]) env.expectDenied(who, 'event.view', 'getEventData', '2027-04');
  assert.throws(() => call(env, OWNER, 'getEventData', '2027-13'), /yyyy-MM/);
});

test('취소: 사유 2자 이상 필수, 행은 지우지 않고 status 취소·cancel_reason, 목록에서 빠짐, 두 번째 취소는 안내, 낡은 token은 stale·쓰기 0', () => {
  const env = seeded();
  const id = add(env), other = add(env, { title: '모의고사', start_date: '2027-04-27', end_date: '' });
  const tok = tokenOf(env, '2027-04');
  const noWhy = call(env, OWNER, 'cancelEvent', id, '네', tok);
  assert.deepStrictEqual([noWhy.ok, noWhy.errors[0].field], [false, 'reason']);
  assert.strictEqual(call(env, OWNER, 'cancelEvent', id, '사유'.repeat(101), tok).ok, false);
  assert.strictEqual(env.rows('events').every((r) => r.status === '유효'), true);
  assert.strictEqual(call(env, OWNER, 'cancelEvent', id, '일정 변경', 'old').stale, true);
  assert.strictEqual(call(env, OWNER, 'cancelEvent', id, '일정 변경', tok).ok, true);
  const row = env.rows('events').find((r) => r.id === id);
  assert.deepStrictEqual([row.status, row.cancel_reason], ['취소', '일정 변경']);
  assert.strictEqual(env.rows('events').length, 2, '지우지 않는다');
  assert.deepStrictEqual(call(env, OWNER, 'getEventData', '2027-04').events.map((e) => e.id), [other]);
  const again = call(env, OWNER, 'cancelEvent', id, '또 취소', tokenOf(env, '2027-04'));
  assert.deepStrictEqual([again.ok, again.stale], [false, true]);
  assert.ok(env.auditActions().includes('update'));
});

test('낡은 화면 방지: 두 관리자가 같은 표를 본 뒤 한 쪽이 먼저 등록하면 늦은 쪽은 {stale:true}·쓰기 없음, 새 token으로는 된다', () => {
  const env = seeded();
  const seen = tokenOf(env, '2027-04');
  assert.strictEqual(call(env, OWNER, 'saveEvent', Object.assign(ev(), { token: seen })).ok, true);   // B
  const w = JSON.stringify(env.rows('events'));
  for (const t of [seen, '', null, 7]) {
    const r = call(env, OWNER, 'saveEvent', Object.assign(ev({ title: '늦은 등록' }), { token: t }));
    assert.deepStrictEqual([r.ok, r.stale], [false, true], String(t));
  }
  assert.strictEqual(JSON.stringify(env.rows('events')), w);
  assert.strictEqual(call(env, OWNER, 'saveEvent', Object.assign(ev({ title: '늦은 등록' }), { token: tokenOf(env, '2027-04') })).ok, true);
});

test('달 경계: 3/30~4/2 일정은 3월·4월 모두에 보이고 날짜별 ids가 걸친 날만 채워진다, 4월 말~5월 초·한 달을 덮는 일정, 달이 겹치지 않으면 안 보임', () => {
  const env = seeded();
  const id = call(env, OWNER, 'saveEvent', Object.assign(ev({ title: '수련회', kind: '행사', start_date: '2027-03-30', end_date: '2027-04-02' }), { token: tokenOf(env, '2027-03') })).id;
  const longId = call(env, OWNER, 'saveEvent', Object.assign(ev({ title: '긴 휴업', kind: '휴업', start_date: '2027-02-20', end_date: '2027-06-05' }), { token: tokenOf(env, '2027-03') })).id;
  const mar = call(env, OWNER, 'getEventData', '2027-03'), apr = call(env, OWNER, 'getEventData', '2027-04'), jul = call(env, OWNER, 'getEventData', '2027-07'), jan = call(env, OWNER, 'getEventData', '2027-01');
  assert.deepStrictEqual(mar.events.map((e) => e.id).sort(), [id, longId].sort());
  assert.deepStrictEqual(apr.events.map((e) => e.id).sort(), [id, longId].sort());
  assert.deepStrictEqual([jul.events.length, jan.events.length], [0, 0]);
  const day = (d, date) => d.days.find((x) => x.date === date);
  assert.deepStrictEqual([day(mar, '2027-03-29').ids, day(mar, '2027-03-30').ids.includes(id), day(mar, '2027-03-31').ids.includes(id)], [[longId], true, true]);
  assert.deepStrictEqual([day(apr, '2027-04-02').ids.includes(id), day(apr, '2027-04-03').ids.includes(id), day(apr, '2027-04-03').ids.includes(longId)], [true, false, true]);
  assert.strictEqual(mar.days.length, 31); assert.strictEqual(apr.days.length, 30);
  assert.strictEqual(day(mar, '2027-03-30').date, '2027-03-30');
  assert.deepStrictEqual(mar.events.find((e) => e.id === id).days, 4);
});

test('운영 안 하는 날: 자습 일정(day_schedules)에서 읽어 days[].operating false·사유를 함께 준다(두 번 입력하지 않음), 운영하는 날은 true', () => {
  const env = seeded();
  const d0 = call(env, OWNER, 'getEventData', '2027-04');
  assert.ok(d0.days.every((d) => d.operating === true && d.closedMemo === ''));
  const sched = call(env, OWNER, 'getScheduleData', '2027-04').dayTokens['2027-04-21'];
  assert.strictEqual(call(env, OWNER, 'saveDaySchedule', { date: '2027-04-21', operating: false, memo: '재량휴업', token: sched }).ok, true);
  const d = call(env, OWNER, 'getEventData', '2027-04');
  const off = d.days.find((x) => x.date === '2027-04-21');
  assert.deepStrictEqual([off.operating, off.closedMemo], [false, '재량휴업']);
  assert.strictEqual(d.days.filter((x) => !x.operating).length, 1);
  assert.strictEqual(env.rows('events').length, 0, '일정 탭에는 쓰지 않는다');
  for (const who of [HALL, HOMEROOM]) assert.strictEqual(call(env, who, 'getEventData', '2027-04').days.find((x) => x.date === '2027-04-21').operating, false, who);
});

test('홈 카드: 교사 5역할 홈에만 events(오늘 일정 + 14일 안 다음 3건), 학생·학부모 홈에는 없고, 취소된 일정·14일 밖은 빠진다', () => {
  const env = seeded();   // 오늘 2027-03-09
  add(env, { title: '오늘 시험', start_date: '2027-03-09', end_date: '2027-03-10' });
  add(env, { title: '다음 특강', kind: '특강', start_date: '2027-03-12', end_date: '' });
  add(env, { title: '먼 행사', kind: '행사', start_date: '2027-04-30', end_date: '' });
  const cancelId = add(env, { title: '취소될 행사', kind: '행사', start_date: '2027-03-15', end_date: '' });
  call(env, OWNER, 'cancelEvent', cancelId, '일정 변경', tokenOf(env, '2027-04'));
  for (const [who, role] of [[OWNER, 'admin'], [ATT, 'attendance'], [HALL, 'hall_teacher'], [HOMEROOM, 'homeroom'], [DUTYM, 'duty_manager']]) {
    const h = call(env, who, 'getHomeData', role).events;
    assert.deepStrictEqual([h.today.map((x) => x.title), h.next.map((x) => x.title)], [['오늘 시험'], ['다음 특강']], role);
  }
  for (const [who, role] of [[STUDENT, 'student'], [PARENT, 'parent']]) assert.ok(!('events' in call(env, who, 'getHomeData', role)), role);
});

test('화면 라우팅: calendar 화면은 교사 5역할만 열 수 있다', () => {
  const env = seeded();
  const ok = (roles) => env.as(OWNER, (c) => plain(c.screenResolve_('calendar', roles)));
  for (const r of ['admin', 'attendance', 'hall_teacher', 'homeroom', 'duty_manager']) assert.strictEqual(ok([r]).ok, true, r);
  for (const r of ['student', 'parent']) assert.strictEqual(ok([r]).ok, false, r);
});
