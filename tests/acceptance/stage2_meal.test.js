/**
 * T2 끝까지 ②(stage2.md 7절): 급식 적용일 규칙 표(PRD F7 다섯 줄)를 화면 함수(preview → save)로 한 흐름 안에서 차례로 저장하고,
 * 적용일 전날·당일의 statusOn_ 값을 본다. 서류 미제출이어도 적용(결정 3), 결정 35(학사 퇴실 석식 중단일).
 * 지금 시각 2027-03-11(목) 12:00, 신청 일시는 그 전(3/9 화·3/10 수·3/11 목). 가짜 데이터만.
 * 같은 흐름에서 식수 집계(getMealCounts, C19)를 저장 전·후로 뽑아, 날짜마다 바뀐 숫자가 이 다섯 줄만큼인지 본다
 * (시드의 다른 변경은 전·후에 똑같이 들어 있어 차이에서 빠진다).
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', TESTER = 'test.teacher@example.com';
const NOW = '2027-03-11T12:00:00';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: NOW });
  env.scriptProps.TEST_TEACHER_EMAIL = TESTER;
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage2());
  env.strictLock = true;   // 시드 뒤: 화면 함수는 락 안에서만 쓴다
  return env;
}
const day = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('끝까지 ②: PRD F7 적용일 다섯 줄을 화면 함수로 저장 → 적용일 전날은 옛 값, 당일은 새 값(서류 미제출이어도), 식수 집계가 그만큼 바뀐다', () => {
  const env = seededEnv();
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const changes = () => env.rows('status_changes');
  const on = (sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
  // 1단계·2단계 시드가 특별히 쓰는 학생(F6·F7 행이 있는 학생)과 중도 입실자는 뺀다
  const busy = new Set(changes().filter((r) => r.source !== '명단업로드').map((r) => r.student_id));
  const late = new Set(changes().filter((r) => r.item === '학사' && r.effective_date > term.start_date).map((r) => r.student_id));
  const plainIds = env.rows('enrollments').filter((e) => e.term_id === term.id).map((e) => e.student_id)
    .filter((s) => !busy.has(s) && !late.has(s) && on(s, '학사', '2027-03-11') === '입실' && on(s, '석식', '2027-03-11') === '학사 석식');
  const dorm = plainIds.filter((s) => on(s, '기숙사', '2027-03-11') === '입실');
  const non = plainIds.filter((s) => on(s, '기숙사', '2027-03-11') !== '입실');
  assert.ok(dorm.length >= 1 && non.length >= 5, '시드에 쓸 학생이 있어야 한다');
  const [A, B, C, D, E] = non, F = dorm[0];
  const DATES = ['2027-03-10', '2027-03-11', '2027-03-12', '2027-03-14', '2027-03-15', '2027-03-21', '2027-03-22'];
  const FIELDS = ['hall', 'dorm', 'nonDorm', 'breakfast', 'hallDinner', 'generalDinner'];
  const countsOn = () => Object.fromEntries(DATES.map((d) => {
    const c = plain(env.call(ADMIN, 'getMealCounts', d));
    const all = c.rows.find((r) => r.key === '전체');
    return [d, Object.assign(Object.fromEntries(FIELDS.map((f) => [f, Number(all[f])])), { afterLeave: Number(c.afterLeaveHallDinner) })];
  }));
  const beforeCounts = countsOn();

  const meal = (sid, chip, at) => {
    const i = { studentId: sid, chip, requestedAt: at, docSubmitted: false };
    const p = plain(env.call(ADMIN, 'previewMealChange', i));
    assert.strictEqual(p.ok, true, JSON.stringify(p));
    const r = plain(env.call(ADMIN, 'saveMealChange', i, p.expect));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    return p;
  };
  const move = (sid, type, at, eff) => {
    const i = { studentId: sid, type, requestedAt: at, effectiveDate: eff, dinner: '중단', docSubmitted: false };
    const p = plain(env.call(ADMIN, 'previewMove', i));
    assert.strictEqual(p.ok, true, JSON.stringify(p));
    const r = plain(env.call(ADMIN, 'saveMove', i, p.expect));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  };
  /** 적용일 전날은 옛 값, 당일은 새 값 */
  const flips = (sid, item, date, from, to, why) => {
    assert.strictEqual(on(sid, item, day(date, -1)), from, why + ': ' + day(date, -1) + ' 옛 값');
    assert.strictEqual(on(sid, item, date), to, why + ': ' + date + ' 새 값');
  };

  // 1줄: 일반 석식으로 변경 — 11:30 전 신청은 당일, 11:30 이후 신청은 다음 날
  assert.strictEqual(meal(A, 'd_gen', '2027-03-11T11:29:59').date, '2027-03-11');
  assert.strictEqual(meal(B, 'd_gen', '2027-03-11T11:30:00').date, '2027-03-12');
  flips(A, '석식', '2027-03-11', '학사 석식', '일반 석식', '1줄 11:29:59');
  flips(B, '석식', '2027-03-12', '학사 석식', '일반 석식', '1줄 11:30:00');

  // 2줄: 기숙사 입실과 함께 조식 실시 — 입실일부터(15:00 신청이어도)
  move(C, '기숙사 입실', '2027-03-10T15:00:00', '2027-03-15');
  flips(C, '기숙사', '2027-03-15', '', '입실', '2줄 기숙사');
  flips(C, '조식', '2027-03-15', '', '실시', '2줄 조식 = 입실일');

  // 3줄: 미실시, 수요일 11:30 전 신청 → 다음 주 월요일 / 4줄: 수요일 11:30부터 일요일까지 신청 → 다다음 주 월요일(결정 71)
  assert.strictEqual(meal(D, 'd_off', '2027-03-09T10:00:00').date, '2027-03-15', '화요일 신청');
  assert.strictEqual(meal(E, 'd_off', '2027-03-10T13:00:00').date, '2027-03-22', '수요일 오후 신청');
  flips(D, '석식', '2027-03-15', '학사 석식', '미실시', '3줄');
  flips(E, '석식', '2027-03-22', '학사 석식', '미실시', '4줄');

  // 5줄: 학사 퇴실에 따른 조식 중단 — 퇴실일 즉시. 석식은 미실시 규칙(결정 35: 목요일 신청 → 다다음 주 월요일)
  move(F, '학사 및 기숙사 퇴실', '2027-03-11T09:00:00', '2027-03-12');
  flips(F, '학사', '2027-03-12', '입실', '퇴실', '5줄 학사');
  flips(F, '조식', '2027-03-12', '실시', '미실시', '5줄 조식 = 퇴실일');
  flips(F, '석식', '2027-03-22', '학사 석식', '미실시', '5줄 석식 = 결정 35');

  // 식수 집계(전체 줄): 저장 뒤 − 저장 전 = 다섯 줄의 몫. 결정 35 — 퇴실한 F도 3/21까지 학사 석식에 들어 있다
  const afterCounts = countsOn();
  const delta = Object.fromEntries(DATES.map((d) => [d, Object.fromEntries(Object.keys(afterCounts[d]).map((k) => [k, afterCounts[d][k] - beforeCounts[d][k]]))]));
  const z = { hall: 0, dorm: 0, nonDorm: 0, breakfast: 0, hallDinner: 0, generalDinner: 0, afterLeave: 0 };
  const d312 = { hall: -1, dorm: -1, nonDorm: 0, breakfast: -1, hallDinner: -2, generalDinner: 2, afterLeave: 1 };   // A·B 일반 석식, F 퇴실(조식 즉시)
  const d315 = { hall: -1, dorm: 0, nonDorm: -1, breakfast: 0, hallDinner: -3, generalDinner: 2, afterLeave: 1 };   // + C 기숙사·조식, D 미실시
  assert.deepStrictEqual(delta, {
    '2027-03-10': z,
    '2027-03-11': Object.assign({}, z, { hallDinner: -1, generalDinner: 1 }),   // A만(11:29:59)
    '2027-03-12': d312, '2027-03-14': d312,
    '2027-03-15': d315, '2027-03-21': d315,
    '2027-03-22': Object.assign({}, d315, { hallDinner: -5, afterLeave: 0 })   // + E 미실시, F 석식 중단
  });

  // 서류 미제출(결정 3): 대표 행은 FALSE로 남고 그래도 적용됐다(위 값). 연결 행은 서류 칸 ''
  const heads = changes().filter((r) => [A, B, C, D, E, F].includes(r.student_id) && r.source !== '명단업로드' && r.linked_change_id === '');
  assert.strictEqual(heads.length, 6, '신청서 6장');
  assert.ok(heads.every((r) => r.doc_submitted === 'FALSE' && r.status === '유효'), JSON.stringify(heads.map((r) => r.doc_submitted)));
  assert.ok(changes().filter((r) => r.linked_change_id && heads.some((h) => h.id === r.linked_change_id)).every((r) => r.doc_submitted === ''));
  // 같은 신청서를 다시 눌러도 한 번만(중복 없음)
  const again = { studentId: A, chip: 'd_gen', requestedAt: '2027-03-11T11:29:59', docSubmitted: false };
  const p2 = plain(env.call(ADMIN, 'previewMealChange', again));
  assert.strictEqual(plain(env.call(ADMIN, 'saveMealChange', again, p2.expect)).duplicate, true);
});
