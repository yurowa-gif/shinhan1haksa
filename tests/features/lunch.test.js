/** C30 방학 중식(결정 73, R19): F7 신청(방학에만), 상태 줄, 식수 집계·xlsx의 중식 열. gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { unzipStored } = require('../helpers/zip');

const OWNER = 'owner@example.com', HALL = 'test.teacher@example.com', OTHER = 'fake.teacher2@example.com';
const VAC = { name: '2027 여름방학', type: '방학', start_date: '2027-07-18', end_date: '2027-08-22', memo: '' };

function seeded(now) {
  const env = createGasEnv({ owner: OWNER, now: now || '2027-07-20T09:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_STUDENT_EMAIL: 'test.student@example.com', TEST_PARENT_EMAIL: 'test.parent@example.com', TEST_HOMEROOM_EMAIL: 'test.homeroom@example.com' });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  const vac = env.asOwner((c) => c.appendRecord_('terms', VAC, OWNER));
  env.asOwner((c) => c.setup());   // 방학 기간별 탭
  const term1 = env.rows('terms').find((t) => t.name === '2027 1학기');
  const mine = env.rows('enrollments').filter((e) => e.term_id === term1.id && e.teacher_email === HALL).slice(0, 4);
  const others = env.rows('enrollments').filter((e) => e.term_id === term1.id && e.teacher_email !== HALL).slice(0, 2);
  const joined = mine.concat(others);
  env.asOwner((c) => c.bulkAppend_('enrollments', joined.map((e) => ({ term_id: vac.id, student_id: e.student_id, teacher_email: e.teacher_email, veritas: e.veritas, commute_type: e.commute_type, end_type: e.end_type, memo: '방학 신청' })), OWNER));
  env.asOwner((c) => c.bulkAppend_('status_changes', joined.map((e) => ({ student_id: e.student_id, item: '학사', value: '입실', requested_at: '', effective_date: '2027-03-02', effective_date_auto: '', reason: '', doc_submitted: '', linked_change_id: '', source: '명단업로드', status: '유효', memo: '', cancel_reason: '' })), OWNER));
  return { env, vac, mine: mine.map((e) => e.student_id), others: others.map((e) => e.student_id) };
}
const call = (env, who, fn, ...a) => plain(env.call(who, fn, ...a));
const lunchOf = (env, sid) => env.rows('status_changes').filter((r) => r.student_id === sid && r.item === '중식');
const input = (sid, chip, over) => Object.assign({ studentId: sid, chip, requestedAt: '2027-07-20T09:00:00', effectiveDate: '', reason: '', docSubmitted: false }, over || {});

test('F7 맥락: 방학 기간이면 lunchOn과 중식 칩 2개, 학기이면 둘 다 없다', () => {
  const s = seeded();
  const v = call(s.env, HALL, 'getMealContext');
  assert.strictEqual(v.lunchOn, true);
  assert.deepStrictEqual(v.chips.map((c) => c.id), ['b_on', 'b_off', 'd_hall', 'd_off', 'd_gen', 'l_on', 'l_off']);
  assert.ok(v.students.every((x) => '중식' in x.status), '학생 상태 줄에 중식');
  s.env.setNow('2027-04-05T09:00:00');
  const t = call(s.env, HALL, 'getMealContext');
  assert.strictEqual(t.lunchOn, false);
  s.env.setNow('2027-07-10T09:00:00');   // 방학 시작 8일 전: 미리 신청할 수 있다
  assert.strictEqual(call(s.env, HALL, 'getMealContext').lunchOn, true);
  s.env.setNow('2027-04-05T09:00:00');
  assert.deepStrictEqual(t.chips.map((c) => c.id), ['b_on', 'b_off', 'd_hall', 'd_off', 'd_gen']);
});

test('중식 신청: 방학에는 미리 보기 → 저장(F7 행, item 중식), 적용일은 조식·미실시와 같은 마감 규칙, 같은 값 다시는 한 번만, 상태 줄과 기록에 나온다', () => {
  const s = seeded(), sid = s.mine[0];
  const p = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on'));
  assert.deepStrictEqual([p.ok, p.date], [true, '2027-07-20'], JSON.stringify(p));   // 11:30 전 신청 → 당일
  const r = call(s.env, HALL, 'saveMealChange', input(sid, 'l_on'), p.expect);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const row = lunchOf(s.env, sid);
  assert.deepStrictEqual(row.map((x) => [x.item, x.value, x.effective_date, x.source, x.status]), [['중식', '실시', '2027-07-20', 'F7', '유효']]);
  assert.strictEqual(call(s.env, HALL, 'saveMealChange', input(sid, 'l_on'), p.expect).duplicate, true);
  assert.strictEqual(lunchOf(s.env, sid).length, 1);
  const st = call(s.env, HALL, 'listStudentStatus', sid);
  assert.strictEqual(st.now['중식'], '실시');
  assert.ok(st.history.some((h) => h.item === '중식' && h.what === '중식 실시'));
  assert.ok(call(s.env, HALL, 'getMealContext').students.find((x) => x.id === sid).status['중식'] === '실시');
  // 미실시는 수 11:30 전이면 다음 주 월요일(7/26), 7/20은 화요일이라 그 규칙
  const off = call(s.env, HALL, 'previewMealChange', input(sid, 'l_off'));
  assert.ok(off.ok && off.date > '2027-07-20', JSON.stringify(off));
});

test('방학이 아니면 중식 신청을 받지 않는다(미리 보기·저장 모두 오류, 쓰기 0), 방학 시작 전에 미리 낸 신청은 방학 시작일부터', () => {
  const s = seeded('2027-04-05T09:00:00'), sid = s.mine[0];
  const before = JSON.stringify(s.env.rows('status_changes'));
  const p = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on', { requestedAt: '2027-04-05T09:00:00' }));
  assert.deepStrictEqual([p.ok, p.errors[0].field, /방학 기간에만/.test(p.errors[0].message)], [false, 'chip', true]);
  const r = call(s.env, HALL, 'saveMealChange', input(sid, 'l_on', { requestedAt: '2027-04-05T09:00:00' }), 'x');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(JSON.stringify(s.env.rows('status_changes')), before);
  // 방학 전 날(7/10)에 미리 신청 → 방학 시작일 7/18
  s.env.setNow('2027-07-10T09:00:00');
  const early = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on', { requestedAt: '2027-07-10T09:00:00' }));
  assert.deepStrictEqual([early.ok, early.date], [true, '2027-07-18'], JSON.stringify(early));
  // 방학 시작 31일 전(6/17)은 아직 받지 않는다
  const far = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on', { requestedAt: '2027-06-17T09:00:00' }));
  assert.deepStrictEqual([far.ok, far.errors[0].field], [false, 'chip']);
  assert.strictEqual(call(s.env, HALL, 'previewMealChange', input(sid, 'l_on', { requestedAt: '2027-06-18T09:00:00' })).ok, true, '30일 전은 받는다');
});

test('적용일을 방학 시작보다 이르게 고치면 규칙 오류가 입력 오류로 나온다(던지지 않는다), 권한은 그대로(담당 아닌 교사 거부)', () => {
  const s = seeded(), sid = s.mine[0];
  const p = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on', { effectiveDate: '2027-07-20', requestedAt: '2027-07-19T09:00:00', reason: '사유 확인' }));
  assert.strictEqual(p.ok, true);
  s.env.expectDenied(OTHER, 'status.edit', 'previewMealChange', input(sid, 'l_on'));
});

test('식수 집계: 방학이면 hasLunch와 줄마다 lunch(= 학사 입실·중식 실시 학생 수를 직접 센 값), 학기이면 hasLunch false', () => {
  const s = seeded();
  const ids = s.mine.concat(s.others);
  // 4명 중 3명 중식 실시(두 명은 담당 학생, 한 명은 다른 교사 학생: 관리자가 대신 저장)
  for (const sid of [s.mine[0], s.mine[1]]) { const p = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on')); assert.strictEqual(call(s.env, HALL, 'saveMealChange', input(sid, 'l_on'), p.expect).ok, true); }
  const po = call(s.env, OWNER, 'previewMealChange', input(s.others[0], 'l_on'));
  assert.strictEqual(call(s.env, OWNER, 'saveMealChange', input(s.others[0], 'l_on'), po.expect).ok, true);
  const c = call(s.env, OWNER, 'getMealCounts', '2027-07-20');
  assert.strictEqual(c.hasLunch, true);
  const all = c.rows.find((r) => r.key === '전체');
  assert.strictEqual(Number(all.lunch), 3, JSON.stringify(all));
  assert.strictEqual(c.rows.filter((r) => !/합계$|^전체$|학년$/.test(r.key)).reduce((n, r) => n + Number(r.lunch), 0), 3, '줄 합 = 전체');
  assert.strictEqual(ids.length, 6);
  // 미실시로 바꾸면 빠진다(적용일 뒤)
  const q = call(s.env, OWNER, 'previewMealChange', input(s.mine[0], 'l_off', { requestedAt: '2027-07-20T09:00:00', effectiveDate: '2027-07-21', reason: '시험용 날짜' }));
  assert.strictEqual(call(s.env, OWNER, 'saveMealChange', input(s.mine[0], 'l_off', { effectiveDate: '2027-07-21', reason: '시험용 날짜' }), q.expect).ok, true);
  assert.strictEqual(Number(call(s.env, OWNER, 'getMealCounts', '2027-07-21').rows.find((r) => r.key === '전체').lunch), 2);
  assert.strictEqual(Number(call(s.env, OWNER, 'getMealCounts', '2027-07-20').rows.find((r) => r.key === '전체').lunch), 3);
  // 학기 날짜
  const t = call(s.env, OWNER, 'getMealCounts', '2027-04-05');
  assert.strictEqual(t.hasLunch, false);
  assert.ok(t.rows.every((r) => !Number(r.lunch)));
});

test('식수 집계 xlsx: 방학이면 조식 뒤에 중식 열(값 = 화면과 같음), 학기이면 열이 없다', () => {
  const s = seeded();
  const sid = s.mine[0];
  const p = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on'));
  call(s.env, HALL, 'saveMealChange', input(sid, 'l_on'), p.expect);
  const sheet = (date) => {
    const r = s.env.as(OWNER, (c) => c.getMealCountsXlsx(date));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const z = unzipStored(Buffer.from(r.base64, 'base64'));
    return z['xl/worksheets/sheet1.xml'].toString('utf8').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
  };
  const vac = sheet('2027-07-20'), sem = sheet('2027-04-05');
  assert.ok(/\|조식\|중식\|석식 학사\|/.test(vac), vac.slice(0, 400));
  assert.ok(!/중식/.test(sem), '학기에는 중식 열이 없다');
  const screenAll = call(s.env, OWNER, 'getMealCounts', '2027-07-20').rows.find((r) => r.key === '전체');
  assert.ok(new RegExp('\\|전체\\|[^\\n]*\\|' + Number(screenAll.breakfast) + '\\|' + Number(screenAll.lunch) + '\\|').test(vac), '전체 줄 조식·중식');
});

test('식수 집계 PDF: 방학 날짜의 렌더 HTML에는 중식 열이 있고 학기 날짜에는 없다(화면·xlsx와 같은 기준 hasLunch)', () => {
  const s = seeded();
  const sid = s.mine[0];
  const p = call(s.env, HALL, 'previewMealChange', input(sid, 'l_on'));
  call(s.env, HALL, 'saveMealChange', input(sid, 'l_on'), p.expect);
  const html = (date) => s.env.as(OWNER, (c) => {
    c.sheetMakePdf_ = (h) => { c.__h = h; return { getBytes: () => [1, 2, 3] }; };
    const r = c.getMealCountsPdf(date);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    return c.__h;
  });
  const vac = html('2027-07-20'), sem = html('2027-04-05');
  assert.ok(/>중식</.test(vac) && vac.includes('중식은 방학 기간에만 집계합니다'), '방학 PDF에 중식 열·안내');
  assert.ok(!/중식/.test(sem), '학기 PDF에는 없다');
  // 화면·xlsx와 같은 기준
  assert.strictEqual(call(s.env, OWNER, 'getMealCounts', '2027-07-20').hasLunch, true);
  assert.strictEqual(call(s.env, OWNER, 'getMealCounts', '2027-04-05').hasLunch, false);
});
