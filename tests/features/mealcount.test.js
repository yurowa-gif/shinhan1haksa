/** C19 식수 집계: R4 gas-fakes로 getMealCounts·getMealCountsPdf·관리자 홈 숫자를 확인한다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';          // admin + hall_teacher
const HALL = 'test.teacher@example.com';

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-03T12:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  return env;
}
const counts = (env, date) => env.call(ADMIN, 'getMealCounts', date);
const row = (c, key) => c.rows.find((r) => r.key === key);
const F = ['hall', 'dorm', 'nonDorm', 'breakfast', 'hallDinner', 'generalDinner'];
const sum = (rows) => F.reduce((o, f) => Object.assign(o, { [f]: rows.reduce((a, r) => a + Number(r[f]), 0) }), {});
const term2 = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const mineOf = (env) => env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === HALL).map((e) => e.student_id);
const stat = (env, sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
/** 오라클: 그날 등록 학생 중 학사 입실인 학생 수 */
const hallOn = (env, ymd) => {
  const ids = new Set(env.rows('enrollments').filter((e) => e.term_id === term2(env).id).map((e) => e.student_id));
  return [...ids].filter((id) => stat(env, id, '학사', ymd) === '입실').length;
};
const append = (env, r) => env.asOwner((c) => c.appendRecord_('status_changes', Object.assign({ doc_submitted: '', linked_change_id: '', status: '유효', memo: '', cancel_reason: '', effective_date_auto: r.effective_date, reason: '' }, r), env.owner));

test('세 날짜에서 합계 줄 = 부분 합, 학사 = 기숙 + 비기숙, 행 순서는 여1…전체', () => {
  const env = makeEnv();
  ['2027-03-03', '2027-03-20', '2027-04-15'].forEach((d) => {
    const c = counts(env, d);
    assert.deepStrictEqual(c.rows.map((r) => r.key).slice(0, 5), ['여1', '여2', '여3', '여 합계', '남1'], d);
    assert.strictEqual(c.rows[c.rows.length - 1].key, '전체');
    const part = (g, ks) => sum(ks.map((k) => row(c, k)).filter(Boolean));
    assert.deepStrictEqual(row(c, '여 합계') && F.map((f) => row(c, '여 합계')[f]), F.map((f) => part('여', ['여1', '여2', '여3'])[f]), d + ' 여 합계');
    assert.deepStrictEqual(F.map((f) => row(c, '남 합계')[f]), F.map((f) => part('남', ['남1', '남2', '남3'])[f]), d + ' 남 합계');
    ['1', '2', '3'].forEach((g) => assert.deepStrictEqual(F.map((f) => row(c, g + '학년')[f]), F.map((f) => sum([row(c, '여' + g), row(c, '남' + g)])[f]), d + ' ' + g + '학년'));
    assert.deepStrictEqual(F.map((f) => row(c, '전체')[f]), F.map((f) => sum([row(c, '여 합계'), row(c, '남 합계')])[f]), d + ' 전체');
    c.rows.forEach((r) => assert.strictEqual(Number(r.hall), Number(r.dorm) + Number(r.nonDorm), d + ' ' + r.key + ' 학사 = 기숙 + 비기숙'));
    assert.strictEqual(Number(row(c, '전체').hall), hallOn(env, d), d + ' 전체 학사 = 그날 학사 입실 학생 수');
  });
});

test('미등록 학생은 어느 칸에도 없고 unknown도 아니다. 서류 미제출은 학생 수, 응답에 이메일이 없다', () => {
  const env = makeEnv();
  const c = counts(env, '2027-03-03');
  assert.strictEqual(Number(row(c, '전체').hall), hallOn(env, '2027-03-03'), '가짜미등록 학생(등록 없음)은 세지 않는다');
  assert.ok(Number(row(c, '전체').hall) <= 30);
  assert.deepStrictEqual(c.unknown, []);
  assert.ok(Number.isInteger(c.docUnsubmitted));
  assert.strictEqual(c.term.name, '2027 1학기'); assert.strictEqual(typeof c.operating, 'boolean');
  assert.ok(!JSON.stringify(c).includes('@'));
});

test('saveMealChange 직후 다시 부르면 바뀐 수가 나온다(캐시 없음): 석식 미실시 신청 → 적용일 전은 그대로, 적용일부터 학사 석식 −1', () => {
  const env = makeEnv();
  const sid = mineOf(env).find((s) => stat(env, s, '석식', '2027-03-20') === '학사 석식');
  const before = { d10: Number(row(counts(env, '2027-03-10'), '전체').hallDinner), d20: Number(row(counts(env, '2027-03-20'), '전체').hallDinner) };
  const i = { studentId: sid, chip: 'd_off', requestedAt: '2027-03-03T10:00:00', docSubmitted: false };
  const p = env.call(HALL, 'previewMealChange', i);
  assert.strictEqual(env.call(HALL, 'saveMealChange', i, p.expect).ok, true);   // 적용일 3/15
  assert.strictEqual(Number(row(counts(env, '2027-03-10'), '전체').hallDinner), before.d10, '적용일 전');
  assert.strictEqual(Number(row(counts(env, '2027-03-20'), '전체').hallDinner), before.d20 - 1, '적용일 뒤');
  assert.strictEqual(Number(row(counts(env, '2027-03-20'), '전체').generalDinner) >= 0, true);
});

test('결정 35 흐름: 3/5 학사 퇴실 학생은 3/5~3/14 학사 석식에 포함(퇴실 후 석식 유지), 3/15부터 빠지고 조식은 3/5부터 빠진다', () => {
  const env = makeEnv();
  const sid = mineOf(env).find((s) => stat(env, s, '석식', '2027-03-20') === '학사 석식' && stat(env, s, '조식', '2027-03-20') === '실시' && stat(env, s, '기숙사', '2027-03-20') === '입실');
  assert.ok(sid);
  const at = (d) => counts(env, d), t = (c, f) => Number(row(c, '전체')[f]);
  const b = { d4: at('2027-03-04'), d10: at('2027-03-10'), d15: at('2027-03-15') };
  // 퇴실 계획(movePlan_) 결과와 같은 행을 쓴다: 학사·기숙사 퇴실@3/5, 조식 미실시@3/5, 석식 미실시@3/15
  [['학사', '퇴실', '2027-03-05'], ['기숙사', '퇴실', '2027-03-05'], ['조식', '미실시', '2027-03-05'], ['석식', '미실시', '2027-03-15']]
    .forEach(([item, value, effective_date]) => append(env, { student_id: sid, item, value, effective_date, requested_at: '2027-03-03T15:00:00', source: 'F6' }));
  const a = { d4: at('2027-03-04'), d10: at('2027-03-10'), d15: at('2027-03-15') };
  assert.strictEqual(t(a.d4, 'hall'), t(b.d4, 'hall'), '3/4는 그대로');
  assert.strictEqual(t(a.d10, 'hall'), t(b.d10, 'hall') - 1, '3/10 학사 −1');
  assert.strictEqual(t(a.d10, 'hallDinner'), t(b.d10, 'hallDinner'), '3/10 석식은 학사 석식에 그대로 포함');
  assert.strictEqual(t(a.d10, 'breakfast'), t(b.d10, 'breakfast') - 1, '조식은 3/5부터 −1');
  assert.strictEqual(a.d10.afterLeaveHallDinner, b.d10.afterLeaveHallDinner + 1, '퇴실 후 석식 유지 +1');
  assert.strictEqual(t(a.d15, 'hallDinner'), t(b.d15, 'hallDinner') - 1, '3/15부터 석식 −1');
  assert.strictEqual(a.d15.afterLeaveHallDinner, b.d15.afterLeaveHallDinner);
});

test('권한: 관리자만 getMealCounts·getMealCountsPdf(denied:meal.count), 거부된 호출은 PDF를 만들지 않는다', () => {
  const env = makeEnv();
  ['test.teacher@example.com', 'test.attendance@example.com', 'test.duty@example.com', 'test.homeroom@example.com', 'test.student@example.com', 'test.parent@example.com']
    .forEach((who) => { env.expectDenied(who, 'meal.count', 'getMealCounts', '2027-03-03'); env.expectDenied(who, 'meal.count', 'getMealCountsPdf', '2027-03-03'); });
  env.expectAllowed('test.admin@example.com', 'getMealCounts', '2027-03-03');
  assert.throws(() => env.call(ADMIN, 'getMealCounts', '2027-13-45'), /날짜/);
});

test('운영 기간이 아닌 날: 오류 대신 안내와 날짜를 돌려주고(term:null, rows 비어 있음) PDF는 만들지 않는다', () => {
  const env = makeEnv();
  const r = counts(env, '2030-01-01');
  assert.strictEqual(r.date, '2030-01-01'); assert.strictEqual(r.term, null); assert.strictEqual(r.operating, false);
  assert.deepStrictEqual(r.rows, []); assert.match(r.message, /운영 기간이 아닙니다/);
  assert.strictEqual(typeof r.docRows, 'number');
  const p = env.call(ADMIN, 'getMealCountsPdf', '2030-01-01');
  assert.strictEqual(p.ok, false); assert.match(p.error, /운영 기간이 아닌 날/);
});

test('PDF: 렌더 HTML에 표(여1…전체·학사·기숙·비기숙)와 머리말(날짜·기간·"신청 기준 인원")이 있고, 이름·이메일은 없다. base64로 내려준다', () => {
  const env = makeEnv();
  let html = '';
  const r = env.as(ADMIN, (c) => {
    c.sheetMakePdf_ = (h, name) => { html = h; return { getBytes: () => [37, 80, 68, 70] }; };   // 실제 PDF 변환은 gas-fakes가 흉내 내지 않는다(C0)
    return c.getMealCountsPdf('2027-03-03');
  });
  assert.strictEqual(r.ok, true); assert.ok(r.name.startsWith('식수집계_2027-03-03')); assert.ok(r.base64 && r.bytes === 4);
  ['여1', '여 합계', '남3', '전체', '학사', '기숙', '비기숙', '조식', '2027-03-03', '2027 1학기', '신청 기준 인원'].forEach((t) => assert.ok(html.includes(t), t));
  const names = env.rows('students').map((s) => s.name);
  assert.ok(!names.some((n) => html.includes(n)), '학생 이름은 급식실 종이에 없다');
  assert.ok(!html.includes('example.com'));
});

test('관리자 홈: 오늘 인원과 공석(자습실·SA)이 나오고 학사 교사 홈에는 인원이 없다', () => {
  const env = makeEnv();
  const f = env.call(ADMIN, 'getHomeData', 'admin').food;
  assert.strictEqual(f.counts.hall, hallOn(env, '2027-03-03')); assert.strictEqual(f.counts.hall, f.counts.dorm + f.counts.nonDorm);
  assert.ok(f.counts.dormMale + f.counts.dormFemale === f.counts.dorm);
  assert.ok(f.vacancy.length >= 1 && f.vacancy.every((v) => v.vacant <= v.total && v.label));
  assert.ok(f.vacancy.some((v) => v.label === '자습실'));
  const sheet = env.call(ADMIN, 'getAttendanceSheet', '2027-03-03');
  assert.strictEqual(f.vacancy.reduce((a, v) => a + v.vacant, 0), sheet.vacantCount, '빈자리 합 = 출석부 빈자리');
  assert.strictEqual(f.counts.dormMale, Number(row(counts(env, '2027-03-03'), '남 합계').dorm));
  assert.strictEqual(f.noTerm, false);
  const t = env.call(HALL, 'getHomeData', 'hall_teacher').food;
  assert.strictEqual(t.counts, undefined); assert.strictEqual(t.vacancy, undefined);
});

test('서류 미제출 수는 홈과 같은 집계: 변경 신청과 지난 기간의 미제출 행이 모두 학생 수로 늘고, 서류를 표시하면 줄어든다', () => {
  const env = makeEnv();
  const [x, y] = mineOf(env);
  const n = () => counts(env, '2027-03-03').docUnsubmitted;
  const home = () => env.call(ADMIN, 'getHomeData', 'admin').food.docMissing;
  const n0 = n(), h0 = home();
  const i = { studentId: x, chip: 'd_off', requestedAt: '2027-03-03T10:00:00', docSubmitted: false };
  const r = env.call(HALL, 'saveMealChange', i, env.call(HALL, 'previewMealChange', i).expect);
  append(env, { student_id: y, item: '학사', value: '퇴실', requested_at: '2027-02-20T10:00:00', effective_date: '2027-02-22', source: 'F6', doc_submitted: 'FALSE' });
  assert.strictEqual(n(), n0 + 2); assert.strictEqual(home(), h0 + 2);
  env.call(HALL, 'setDocSubmitted', r.id);
  assert.strictEqual(n(), n0 + 1); assert.strictEqual(home(), h0 + 1);
});

test('서류 수: docRows(건)와 docUnsubmitted(학생 수)는 한 학생의 두 건에서 다르다', () => {
  const env = makeEnv();
  const [x] = mineOf(env);
  const c0 = counts(env, '2027-03-03');
  [['2027-02-20', '2027-02-22'], ['2027-02-21', '2027-02-23']].forEach(([req, eff]) =>
    append(env, { student_id: x, item: '조식', value: '미실시', requested_at: req + 'T10:00:00', effective_date: eff, source: 'F7', doc_submitted: 'FALSE' }));
  const c1 = counts(env, '2027-03-03');
  assert.strictEqual(c1.docRows - c0.docRows, 2); assert.strictEqual(c1.docUnsubmitted - c0.docUnsubmitted, 1);
});
