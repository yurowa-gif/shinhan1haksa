/**
 * 7단계 선생님 확인 체크리스트(docs/design/stage7-teacher-checks.md)에 붙이는 **실제 화면** 사진(360px 휴대폰).
 * 정적 시안이 아니라 main의 src/ui 화면을 가짜 서버(gas-fakes)에 이어 붙여 띄우고(design/preview/real-screens.js) 버튼을 눌러 가며 찍는다. 이름·숫자는 모두 가짜 데이터다.
 * 실행: node design/preview/stage7-real.js [절 A|B|C|D …]   → design/preview/out/real/<이름>-360.png
 * 쓸 사진은 docs/design/stage7-checks/ 로 복사한다(out/은 Git에 올리지 않는다).
 * 가짜 오늘 = 2027-03-26(금) 10:00 — 시간표 제출 기간(매달 25일~말일)이 열려 있고 적용월은 4월이다.
 * 계정: test.student(학생 A) · test.parent(학부모, 자녀 둘) · test.teacher(학사 교사, 학생 A의 담당) · test.admin · 학생 B·남의 학부모는 이 파일이 만든다.
 */
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');

const ADMIN = 'test.admin@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const STUDENT_B = 'fake.student.b@example.com', PARENT_X = 'fake.parent.x@example.com', PARENT_NONE = 'fake.parent.none@example.com', HALL2 = 'fake.teacher1@example.com';
const PHONE = { w: 360, h: 800 };
const NOW = '2027-03-26T10:00:00', TODAY = '2027-03-26';
const want = process.argv.slice(2).map((s) => s.toUpperCase());
const on = (k) => !want.length || want.includes(k);
const log = (m) => console.log('찍음: ' + m);

async function press(s, name, o) {
  await s.page.getByRole('button', { name, exact: !!(o && o.exact) }).filter({ visible: true }).first().click();
  await s.settle();
}
async function sheetBtn(s, name) {
  await s.page.waitForTimeout(800);
  await s.page.locator('.sheet').getByRole('button', { name, exact: true }).first().click();
  await s.settle();
}
async function tap(s, text) { await s.page.getByText(text, { exact: true }).filter({ visible: true }).first().click(); await s.settle(); }
async function fill(s, label, value) { await s.page.getByLabel(label).first().fill(value); }
const card = (s, text) => s.page.locator('.card').filter({ hasText: text }).last();
const bodyText = (s) => s.page.evaluate(() => document.body.innerText);

/** 가짜 데이터: 학생 A(test.student) = 한새봄, 학부모 test.parent의 자녀 = 한새봄·한라온 … */
function seed(env) {
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const A = students.find((s) => s.email === STUDENT);
  const kidIds = env.rows('guardian_links').filter((g) => g.parent_email === PARENT).map((g) => g.student_id);
  const kids = students.filter((s) => kidIds.includes(s.id));
  const sibling = kids.find((s) => s.id !== A.id);
  const stranger = students.find((s) => !kidIds.includes(s.id) && s.id !== A.id);
  // 학생 B(남의 집 아이): 학생 계정 + 남의 학부모 계정
  env.asOwner((c) => {
    c.updateRecord_('students', stranger.id, { email: STUDENT_B }, 'owner@example.com');
    c.addUser(STUDENT_B, '시험 학생B', 'student');
    c.addUser(PARENT_X, '시험 학부모X', 'parent');
    c.addUser(PARENT_NONE, '시험 학부모(연결 없음)', 'parent');
    c.appendRecord_('guardian_links', { student_id: stranger.id, parent_email: PARENT_X, name: '가짜보호자X', phone: '010-0000-9999', relation: '모' }, 'owner@example.com');
  });
  // 오늘 근무교사 = 시험교사(HALL)
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '21:30조', end_time: '21:30', original_email: HALL, actual_email: HALL, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  // 학생 A의 OUT 1건·상담 2건(하나는 학부모에게 날짜·교사 보임)·출결 특이사항
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const tab = 'violations_' + term.id.slice(0, 8);
  env.asOwner((c) => c.appendRecord_(tab, { term_id: term.id, student_id: A.id, occurred_at: '2027-03-12T20:00:00', rule_id: rule.id, rule_name: rule.name, memo: '가짜 OUT 메모-표식',
    detected_by: HALL, entered_by: HALL, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  env.call(HALL, 'saveCounselNote', { studentId: A.id, date: '2027-03-18', type: '생활', target: '학생', content: '가짜 상담 내용-표식: 자습 태도 이야기', showToParent: true });
  env.call(HALL, 'saveCounselNote', { studentId: A.id, date: '2027-03-22', type: '진로', target: '학생', content: '가짜 상담 내용2-표식', showToParent: false });
  return { term, A, kids, sibling, stranger };
}

const MARKERS = ['표식', '010-0000-'];   // 화면 글자에 나오면 안 되는 것(상담 내용·OUT 메모·전화번호)
const leaks = (txt) => MARKERS.filter((m) => txt.includes(m));

/* ═════════ A 학생: 본인 것만 ═════════ */
async function sectionA(browser, app, ctx) {
  let s = await openPage(browser, app, { email: STUDENT, query: '', size: PHONE });
  await s.shotTop('a-student-home', card(s, '시설 일지')); log('a-student-home');
  const t = await bodyText(s);
  console.log('  학생A 화면에 학생B 이름?', t.includes(ctx.stranger.name), ' 표식·전화?', leaks(t));
  await s.close();
  s = await openPage(browser, app, { email: STUDENT_B, query: '', size: PHONE });
  await s.shotTop('a-student-home-b', card(s, '시설 일지')); log('a-student-home-b');
  const tb = await bodyText(s);
  console.log('  학생B 화면에 학생A 이름?', tb.includes(ctx.A.name), ' OUT·상담 표식?', leaks(tb));
  await s.close();
  s = await openPage(browser, app, { email: STUDENT, query: 'page=sheet', size: PHONE });
  await s.shot('a-student-noaccess'); log('a-student-noaccess');
  await s.close();
}

/* ═════════ B 학부모 ═════════ */
async function sectionB(browser, app, ctx) {
  let s = await openPage(browser, app, { email: PARENT, query: '', size: PHONE });
  await s.shotTop('b-parent-home', s.page.locator('main .card').first()); log('b-parent-home');
  const tabs = await s.page.locator('nav.tabs .tab').allInnerTexts();
  console.log('  자녀 탭:', tabs);
  const t1 = await bodyText(s);
  console.log('  학부모 화면에 남의 집 아이 이름?', t1.includes(ctx.stranger.name), ' 표식·전화?', leaks(t1));
  await s.shot('b-parent-home-full'); log('b-parent-home-full');
  // 상담 줄(날짜·교사만)
  const counselCard = s.page.locator('.card').filter({ hasText: '상담' }).last();
  if (await counselCard.count()) { await s.shotEl('b-parent-counsel', counselCard); log('b-parent-counsel'); }
  await s.close();
  s = await openPage(browser, app, { email: PARENT, query: '', size: PHONE });
  await s.page.locator('nav.tabs .tab').nth(1).click(); await s.settle();
  await s.shotTop('b-parent-switch', s.page.locator('main .card').first()); log('b-parent-switch');
  await s.close();
  s = await openPage(browser, app, { email: PARENT_X, query: '', size: PHONE });
  const tx = await bodyText(s);
  console.log('  남의 집 학부모(X) 화면에 학생A 이름?', tx.includes(ctx.A.name), ctx.sibling && tx.includes(ctx.sibling.name));
  await s.shotTop('b-parent-x', s.page.locator('main .card').first()); log('b-parent-x');
  await s.close();
  s = await openPage(browser, app, { email: PARENT_NONE, query: '', size: PHONE });
  await s.shot('b-parent-nolink'); log('b-parent-nolink');
  await s.close();
  s = await openPage(browser, app, { email: PARENT, query: 'page=counsel', size: PHONE });
  await s.shot('b-parent-noaccess'); log('b-parent-noaccess');
  await s.close();
}

/* ═════════ C 시설 일지 ═════════ */
async function sectionC(browser, app, ctx) {
  let s = await openPage(browser, app, { email: STUDENT, query: 'page=facility', size: PHONE });
  await s.shot('c-fac-form'); log('c-fac-form');
  // 시설 칩·시각·함께 쓴 학생
  const chips = await s.page.locator('.chip').allInnerTexts();
  console.log('  시설 칩:', chips);
  await tap(s, chips[0]);
  await fill(s, '시작', '15:30'); await fill(s, '끝나는 시각', '17:00').catch(() => {});
  await fill(s, '목적(선택, 100자 이내)', '가짜: 탐구 토론');
  await s.shot('c-fac-filled'); log('c-fac-filled');
  await press(s, '일지 저장', { exact: true });
  await s.page.waitForTimeout(500);
  await s.shot('c-fac-saved'); log('c-fac-saved');
  await s.close();
  s = await openPage(browser, app, { email: STUDENT, query: 'page=facility&tab=mine', size: PHONE });
  await s.shot('c-fac-mine'); log('c-fac-mine');
  await press(s, '취소', { exact: true });
  await s.shot('c-fac-cancel'); log('c-fac-cancel');
  await sheetBtn(s, '일지 취소');
  await s.page.waitForTimeout(400);
  await s.shot('c-fac-cancelled'); log('c-fac-cancelled');
  await s.close();
  // 근무교사(HALL)는 그날 목록, 근무 아닌 교사·담임은 못 본다
  await app.env.call(STUDENT, 'saveFacilityLog', { facility: '원형테이블', date: TODAY, start: '19:00', end: '20:00', companions: [], purpose: '가짜: 조별 모임', confirmOverlap: true });
  s = await openPage(browser, app, { email: HALL, query: 'page=facilityday', size: PHONE });
  await s.shot('c-day-duty'); log('c-day-duty');
  await s.close();
  s = await openPage(browser, app, { email: HALL2, query: 'page=facilityday', size: PHONE });
  await s.shot('c-day-notduty'); log('c-day-notduty');
  await s.close();
  s = await openPage(browser, app, { email: ADMIN, query: 'page=facilityday&tab=stats', size: PHONE });
  await s.shot('c-stats-admin'); log('c-stats-admin');
  await s.close();
  s = await openPage(browser, app, { email: HALL, query: 'page=facilityday&tab=stats', size: PHONE });
  await s.shot('c-stats-teacher'); log('c-stats-teacher');
  await s.close();
}

module.exports = { seed };

async function main() {
  const browser = await launchKo();
  try {
    const app = makeApp({ now: NOW });
    const ctx = seed(app.env);
    if (on('A')) await sectionA(browser, app, ctx);
    if (on('B')) await sectionB(browser, app, ctx);
    if (on('C')) await sectionC(browser, app, ctx);
    if (on('D')) await require('./stage7-real-d.js').sectionD(browser, app, ctx, { press, sheetBtn, tap, fill, card, bodyText, log, NOW, TODAY, PARENT, STUDENT, HALL, ADMIN, HOMEROOM, PHONE });
  } finally { await browser.close(); }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
