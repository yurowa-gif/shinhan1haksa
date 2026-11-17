/**
 * 5단계 선생님 확인 체크리스트(docs/design/stage5-teacher-checks.md)에 붙이는 **실제 화면** 사진. 정적 시안이 아니라 main의 src/ui 화면을
 * 가짜 서버(gas-fakes)에 이어 붙여 띄우고(design/preview/real-screens.js) 버튼을 눌러 가며 찍는다. 이름·숫자는 모두 가짜 데이터다.
 * 실행: node design/preview/stage5-real.js [절 A|B|C …]   → design/preview/out/real/<이름>-360.png (PC는 -1280.png)
 * 쓸 사진은 docs/design/stage5-check-photos/ 로 복사한다(out/은 Git에 올리지 않는다).
 * 가짜 오늘 = 2027-03-15(월) 10:00. 학생·교사 계정은 gas-fakes의 시험 계정(test.admin·test.teacher·test.homeroom·test.attendance …).
 */
const { makeApp, openPage } = require('./real-screens.js');

const ADMIN = 'test.admin@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com', ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';
const PHONE = { w: 360, h: 800 }, PC = { w: 1280, h: 900 };
const want = process.argv.slice(2).map((s) => s.toUpperCase());
const on = (k) => !want.length || want.includes(k);
const log = (m) => console.log('찍음: ' + m);

/** 이름으로 보이는 버튼·링크를 누른다(여럿이면 첫 번째 보이는 것) */
async function press(s, name, o) {
  const loc = s.page.getByRole('button', { name, exact: !!(o && o.exact) }).filter({ visible: true }).first();
  await loc.click();
  await s.settle();
}
/** 열려 있는 확인 시트·바텀 시트를 닫는다(시트 안의 취소·닫기·돌아가기 버튼, 없으면 Esc) */
/** 시트 버튼: 열린 직후 눌림은 화면이 막는다(UI.sheetClickAllowed, 두 번 누름 방지) — 잠깐 기다렸다 누른다 */
async function sheetBtn(s, name) {
  await s.page.waitForTimeout(800);
  await s.page.locator('.sheet').getByRole('button', { name, exact: true }).first().click();
  await s.settle();
}
async function closeSheet(s) {
  await s.page.waitForTimeout(800);
  const b = s.page.locator('.sheet').getByRole('button', { name: /^(취소|닫기|돌아가기)$/ }).first();
  if (await b.count()) await b.click(); else await s.page.keyboard.press('Escape');
  await s.settle();
}
/** 글자로 찾아 누른다(UI.segmented 같은 칩은 버튼 역할이 아닐 수 있다) */
async function tap(s, text) { await s.page.getByText(text, { exact: true }).filter({ visible: true }).first().click(); await s.settle(); }
async function fill(s, label, value) { await s.page.getByLabel(label).first().fill(value); }

/* ═════════ A 월별 일정 ═════════ */
const card = (s, text) => s.page.locator('.card').filter({ hasText: text }).last();
async function sectionA(browser) {
  const app = makeApp({ now: '2027-03-15T10:00:00', seed: (env) => {
    const save = (title, kind, a, b, memo) => env.call(ADMIN, 'saveEvent', { title, kind, start_date: a, end_date: b || '', memo: memo || '', token: env.call(ADMIN, 'getEventData', a.slice(0, 7)).token });
    save('입학식', '행사', '2027-03-05', '', '10:00 강당');
    save('학부모 총회', '행사', '2027-03-09', '', '19:00 시청각실');
    save('모의고사', '시험', '2027-03-17', '2027-03-18', '1~3학년 전체');
    save('진로 특강', '특강', '2027-03-24', '', '대강당');
    save('건강검진', '행사', '2027-03-24', '', '2학년');
  } });
  let s = await openPage(browser, app, { email: ADMIN, query: 'page=calendar', size: PHONE });
  await s.shotTop('a-cal-admin', s.page.locator('.cal-card')); log('a-cal-admin');
  await s.page.getByRole('button', { name: /3월 24일/ }).click(); await s.settle();
  await s.shotEl('a-cal-day', card(s, '3월 24일(수)')); log('a-cal-day');
  await press(s, '+ 일정 추가');
  await fill(s, '제목', '가짜: 시험 일정');
  await s.shotEl('a-cal-form', card(s, '일정 추가')); log('a-cal-form');
  await fill(s, '끝 날짜 (하루면 비워 두세요)', '2027-03-23');
  await press(s, '저장', { exact: true });
  await sheetBtn(s, '등록');
  await s.shotEl('a-cal-form-error', card(s, '일정 추가')); log('a-cal-form-error');
  await fill(s, '끝 날짜 (하루면 비워 두세요)', '');
  await press(s, '저장', { exact: true });
  await s.shot('a-cal-confirm', { fixed: true }); log('a-cal-confirm');
  await s.close();
  s = await openPage(browser, app, { email: ADMIN, query: 'page=calendar', size: PHONE });
  await s.page.getByRole('button', { name: /3월 9일/ }).click(); await s.settle();
  await press(s, '취소', { exact: true });
  await fill(s, '취소 사유 (필수)', '가짜: 날짜 잘못 입력');
  await s.shotEl('a-cal-cancel', card(s, '3월 9일(화)')); log('a-cal-cancel');
  await s.close();
  s = await openPage(browser, app, { email: HALL, query: 'page=calendar', size: PHONE });
  await s.page.getByRole('button', { name: /3월 10일/ }).click(); await s.settle();
  await s.shotTop('a-cal-teacher', card(s, '3월 10일(수)')); log('a-cal-teacher');
  await s.close();
  s = await openPage(browser, app, { email: ADMIN, query: '', size: PHONE });
  await s.shotEl('a-home-admin', card(s, '월별 일정 열기')); log('a-home-admin');
  await s.close();
}

/* ═════════ B 상담일지 ═════════ */
async function sectionB(browser) {
  let sid = '', other = '';
  const app = makeApp({ now: '2027-03-15T10:00:00', seed: (env) => {
    const term = env.rows('terms').find((t) => t.name === '2027 1학기');
    const mine = env.rows('enrollments').filter((e) => e.term_id === term.id && e.teacher_email === HALL);
    sid = mine[0].student_id;
    env.asOwner((c) => c.addUser('test.teacher2@example.com', '시험교사2', 'hall_teacher'));
    other = 'x';
    const save = (date, type, target, content, show) => env.call(HALL, 'saveCounselNote', { studentId: sid, date, type, target, content, showToParent: show });
    save('2027-03-05', '생활', '학생', '가짜 내용: 자습 시간 휴대폰 사용에 대해 이야기함. 다음 주까지 지켜보기로 함.', false);
    save('2027-03-11', '진로', '학부모', '가짜 내용: 학부모와 통화. 희망 진로와 이수 과목을 함께 점검함.', true);
    const wrong = save('2027-03-12', '학업', '학생', '가짜 내용: 다른 학생 기록에 잘못 씀.', true);
    const n = env.call(HALL, 'getCounselNotes', sid).notes.find((x) => x.date === '2027-03-12' || x.dateKo.indexOf('3월 12일') >= 0);
    if (n) env.call(HALL, 'cancelCounselNote', n.id, '가짜: 다른 학생 기록에 잘못 씀');
  } });
  let s = await openPage(browser, app, { email: HALL, query: '', size: PHONE });
  await s.shotEl('b-home-card', card(s, '상담일지 열기')); log('b-home-card');
  await s.close();
  s = await openPage(browser, app, { email: HALL, query: 'page=counsel', size: PHONE });
  await s.shotEl('b-pick', card(s, '학생 찾기')); log('b-pick');
  await s.close();
  s = await openPage(browser, app, { email: HALL, query: 'page=counsel&student=' + sid, size: PHONE });
  await s.shot('b-list'); log('b-list');
  await s.page.getByRole('button', { name: '내용 보기' }).first().click(); await s.settle();
  await s.shot('b-list-open'); log('b-list-open');
  await tap(s, '새로 쓰기');
  await s.page.getByRole('button', { name: '진로', exact: true }).click();
  await s.page.getByLabel('상담 내용').fill('가짜 내용: 진학 상담. 지망 학과와 준비 계획을 이야기함.');
  await s.shot('b-write'); log('b-write');
  await s.close();
  s = await openPage(browser, app, { email: HALL, query: 'page=counsel&student=' + sid, size: PHONE });
  await s.page.getByRole('button', { name: '고치기', exact: true }).first().click(); await s.settle();
  await s.page.getByLabel('상담 내용').fill('가짜 내용: 고쳐 쓴 상담 기록.');
  await press(s, '고쳐서 저장');
  await s.page.waitForTimeout(800);
  await s.shot('b-revise', { fixed: true }); log('b-revise');
  await s.close();
  s = await openPage(browser, app, { email: HALL, query: 'page=counsel&student=' + sid, size: PHONE });
  await s.page.getByRole('button', { name: '취소', exact: true }).first().click(); await s.settle();
  await s.page.waitForTimeout(800);
  await s.shot('b-cancel', { fixed: true }); log('b-cancel');
  await s.close();
  s = await openPage(browser, app, { email: HOMEROOM, query: 'page=counsel', size: PHONE });
  await s.shotEl('b-homeroom-pick', card(s, '학생 찾기')); log('b-homeroom-pick');
  await s.close();
  s = await openPage(browser, app, { email: ATT, query: 'page=counsel', size: PHONE });
  await s.shot('b-attendance-denied', { fixed: true }); log('b-attendance-denied');
  await s.close();
  if (other) {
    s = await openPage(browser, app, { email: 'test.teacher2@example.com', query: 'page=counsel&student=' + sid, size: PHONE });
    await s.shot('b-not-mine'); log('b-not-mine');
    await s.close();
  }
}

/* ═════════ C 출결 결과 정리 ═════════ */
const rowOf = (s, name) => s.page.locator('.res-rec').filter({ hasText: name }).first();
async function sectionC(browser) {
  const app = makeApp({ now: '2027-03-15T10:00:00', seed: (env) => { Object.assign(env.scriptProps, { MAIL_ENABLED: 'true' }); } });
  const env = app.env;
  const grid = (d, extra) => env.call(ATT, 'getResultGrid', Object.assign({ from: d, to: d }, extra || {}));
  const g0 = grid('2027-03-11');
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const hasOut = new Set(env.rows('violations_' + term.id.slice(0, 8)).map((v) => v.student_id));
  const [A, B] = g0.students.filter((x) => !hasOut.has(x.id)).concat(g0.students);   // 기존 OUT이 없는 학생을 먼저(1OUT 확인이 또렷하게)
  const ex = env.rows('exceptions_' + term.id.slice(0, 8)).find((e) => e.date === '2027-03-04' && /^학원/.test(e.type) && e.status === '확정');
  const st = env.rows('students').find((x) => x.id === ex.student_id);
  const preName = st.name, preClass = st.grade + '학년 ' + st.class_no + '반';
  // 1) PC 격자(한 주) — 사전 특이사항이 미리 채워진 주
  let s = await openPage(browser, app, { email: ATT, query: 'page=results&date=2027-03-03', size: PC });
  await s.shot('c-grid-pc'); log('c-grid-pc');
  await s.close();
  // 2) 휴대폰: 하루 보기 → 칸 시트
  s = await openPage(browser, app, { email: ATT, query: 'page=results&date=2027-03-11', size: PHONE });
  await s.shotTop('c-day', s.page.locator('.card').last()); log('c-day');
  await rowOf(s, A.name).getByRole('button').click(); await s.settle();
  await tap(s, '결석');
  await s.page.getByRole('button', { name: '병결' }).click();
  await s.page.waitForTimeout(400);
  await s.shot('c-sheet-ok', { fixed: true }); log('c-sheet-ok');
  await s.page.waitForTimeout(800);
  await s.page.locator('.sheet').getByRole('button', { name: '확인하고 저장' }).click();
  await s.page.waitForTimeout(900);
  await s.shot('c-save-confirm', { fixed: true }); log('c-save-confirm');
  await sheetBtn(s, '저장');
  await s.page.waitForTimeout(400);
  await s.shot('c-saved', { fixed: true }); log('c-saved');
  // 3) 미인정 → 자동 1OUT 안내
  await rowOf(s, B.name).getByRole('button').click(); await s.settle();
  await tap(s, '지각');
  await s.page.getByRole('button', { name: '미인정지각' }).click();
  await s.page.waitForTimeout(400);
  await s.shot('c-sheet-bad', { fixed: true }); log('c-sheet-bad');
  await s.page.waitForTimeout(800);
  await s.page.locator('.sheet').getByRole('button', { name: '확인하고 저장' }).click();
  await s.page.waitForTimeout(900);
  await s.shot('c-save-bad-confirm', { fixed: true }); log('c-save-bad-confirm');
  await sheetBtn(s, '저장');
  await s.page.waitForTimeout(400);
  await s.shotTop('c-day-after', s.page.locator('.card').last()); log('c-day-after');
  await s.close();
  // 4) OUT 화면에 1OUT
  s = await openPage(browser, app, { email: ADMIN, query: 'page=outs&tab=term', size: PHONE });
  await s.shot('c-out-1out'); log('c-out-1out');
  await s.close();
  // 5) 같은 칸 다시 열면 결과가 보이고 [취소]
  s = await openPage(browser, app, { email: ATT, query: 'page=results&date=2027-03-11', size: PHONE });
  await rowOf(s, B.name).getByRole('button').click(); await s.settle();
  await s.shot('c-cell-record', { fixed: true }); log('c-cell-record');
  await s.page.waitForTimeout(800);
  await s.page.locator('.sheet').getByRole('button', { name: '취소', exact: true }).first().click(); await s.settle();
  await s.page.waitForTimeout(900);
  await s.page.locator('.sheet textarea').fill('가짜: 잘못 입력');
  await s.shot('c-cancel', { fixed: true }); log('c-cancel');
  await s.close();
  // 6) 사전 특이사항 대체 경고
  s = await openPage(browser, app, { email: ATT, query: 'page=results&date=2027-03-04', size: PHONE });
  await s.page.getByRole('button', { name: preClass }).click(); await s.settle();
  await rowOf(s, preName).getByRole('button').click(); await s.settle();
  await tap(s, '결석');
  await s.page.getByRole('button', { name: '미인정결석' }).click();
  await s.page.waitForTimeout(400);
  await s.shot('c-pre-sheet', { fixed: true }); log('c-pre-sheet');
  await s.page.waitForTimeout(800);
  await s.page.locator('.sheet').getByRole('button', { name: '확인하고 저장' }).click();
  await s.page.waitForTimeout(900);
  await s.shot('c-pre-confirm', { fixed: true }); log('c-pre-confirm');
  await s.close();
  // 7) 학생별 누적(PC·휴대폰)
  s = await openPage(browser, app, { email: ATT, query: 'page=results&date=2027-03-11', size: PHONE });
  await tap(s, '학생별 누적');
  await s.shot('c-total-phone'); log('c-total-phone');
  await s.close();
  s = await openPage(browser, app, { email: ATT, query: 'page=results&date=2027-03-11&tab=month', size: PC });
  await tap(s, '학생별 누적');
  await s.shot('c-total-pc'); log('c-total-pc');
  await s.close();
  // 8) 보기 전용(학사 교사)
  s = await openPage(browser, app, { email: HALL, query: 'page=results&date=2027-03-11', size: PHONE });
  await s.shotTop('c-readonly', s.page.locator('.card').first()); log('c-readonly');
  await rowOf(s, A.name).getByRole('button').click(); await s.settle();
  await s.page.waitForTimeout(500);
  await s.shot('c-readonly-sheet', { fixed: true }); log('c-readonly-sheet');
  await s.close();
  // 9) 끝난 기간(종료 14일 지남): 오늘 2027-03-20, 2026 2학기(테스트) 끝 2027-02-28
  const app2 = makeApp({ now: '2027-03-20T10:00:00' });
  s = await openPage(browser, app2, { email: ATT, query: 'page=results&date=2027-02-22', size: PHONE });
  await s.shotTop('c-ended', s.page.locator('.card').first()); log('c-ended');
  await s.close();
}

async function main() {
  const browser = await require('./browser.js').launchKo();
  try {
    if (on('A')) await sectionA(browser);
    if (on('B')) await sectionB(browser);
    if (on('C')) await sectionC(browser);
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
