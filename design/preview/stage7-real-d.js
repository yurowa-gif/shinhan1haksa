/**
 * stage7-real.js의 D절(시간표: 제출 → 학부모 동의 → 담당교사 확인, 확정 전 지난 시간표 유지, 돌려보낸 뒤 다시 제출). 가짜 오늘 = 2027-03-26(제출 기간, 적용월 4월).
 * 3월 시간표(월 18:30–20:00 학)는 먼저 확정해 둔다 → 4월 시간표가 확정되기 전에도 출석부 4월 칸은 3월 시간표를 따른다(R23).
 */
const STUDENT_OTHER = 'fake.student.b@example.com', PARENT_X = 'fake.parent.x@example.com', HALL2 = 'fake.teacher1@example.com';

async function sectionD(browser, app, ctx, h) {
  const { press, sheetBtn, tap, fill, card, bodyText, log, NOW, PARENT, STUDENT, HALL, ADMIN, PHONE } = h;
  const { openPage } = require('./real-screens.js');
  const env = app.env, A = ctx.A;
  const ATT = 'test.attendance@example.com';
  const call = (who, fn, ...a) => env.call(who, fn, ...a);

  // ── 먼저 3월 시간표를 확정해 둔다(제출 기간 2월 25~28일에 내고 3월 중에 확정한 것으로) ──
  env.setNow('2027-02-26T10:00:00');
  const slotsOf = (r) => r.view.slots;
  const c0 = call(STUDENT, 'getTimetableContext');
  const mar = [{ weekday: '월', blocks: '18:30-20:00', code: '학' }];
  console.log('  3월 제출', JSON.stringify(call(STUDENT, 'submitTimetable', { month: '2027-03', entries: mar })));
  console.log('  3월 동의', JSON.stringify(call(PARENT, 'agreeTimetable', A.id, '2027-03')));
  console.log('  3월 확인', JSON.stringify(call(HALL, 'confirmTimetable', A.id, '2027-03')));
  env.setNow(NOW);

  // ── 학생: 제출 전 → 칸 고르기 → 제출 ──
  let s = await openPage(browser, app, { email: STUDENT, query: 'page=timetable&role=student', size: PHONE });
  await s.shot('d-student-empty'); log('d-student-empty');
  // 첫 번째로 누를 수 있는 칸(화요일 ①) 하나 + 토요일 하나
  const cellBtns = s.page.locator('table.data.rg .rg-cell:not([disabled])');
  console.log('  눌러서 고르는 칸 수:', await cellBtns.count());
  const pickCell = async (idx, label) => {
    await cellBtns.nth(idx).click(); await s.page.waitForTimeout(900);
    await tap(s, label);
  };
  await cellBtns.nth(1).click(); await s.page.waitForTimeout(900);
  await s.shot('d-cell-sheet', { fixed: true }); log('d-cell-sheet');
  await tap(s, '학 (학원)'); await sheetBtn(s, '이 칸에 적용');
  await cellBtns.nth(8).click(); await s.page.waitForTimeout(900);
  await tap(s, '가 (집)'); await sheetBtn(s, '이 칸에 적용');
  await s.shot('d-student-filled'); log('d-student-filled');
  await press(s, '시간표 제출', { exact: true });
  await s.page.waitForTimeout(500);
  await s.shot('d-student-submitted'); log('d-student-submitted');
  await s.close();

  // 학생 홈의 알림 카드는 상태에 따라 바뀐다(다음 달 시간표를 내 주세요 → 사라짐)
  s = await openPage(browser, app, { email: STUDENT, query: '', size: PHONE });
  await s.shotTop('d-student-home-submitted', s.page.locator('main .card').nth(1)); log('d-student-home-submitted');
  await s.close();

  // ── 학부모: 다른 집 학부모는 이 학생을 못 본다 / 연결된 학부모는 동의·동의하지 않음 ──
  s = await openPage(browser, app, { email: PARENT_X, query: 'page=timetable&role=parent&student=' + A.id, size: PHONE });
  const tx = await bodyText(s);
  console.log('  남의 집 학부모(X)의 시간표 화면에 학생A 이름?', tx.includes(A.name));
  await s.shot('d-parent-x'); log('d-parent-x');
  await s.close();
  s = await openPage(browser, app, { email: PARENT, query: 'page=timetable&role=parent&student=' + A.id, size: PHONE });
  await s.shot('d-parent-agree'); log('d-parent-agree');
  await press(s, '동의하지 않습니다', { exact: true });
  await s.page.waitForTimeout(900);
  await s.page.getByPlaceholder('예: 학원 시간이 바뀌었습니다').fill('가짜: 학원 요일이 바뀌었습니다');
  await s.shot('d-parent-decline-sheet', { fixed: true }); log('d-parent-decline-sheet');
  await sheetBtn(s, '학생에게 돌려보내기');
  await s.page.waitForTimeout(500);
  await s.shot('d-parent-declined'); log('d-parent-declined');
  await s.close();

  // ── 학생: 돌려보내진 것을 보고 고쳐서 다시 낸다 ──
  s = await openPage(browser, app, { email: STUDENT, query: '', size: PHONE });
  await s.shotTop('d-student-home-returned', s.page.locator('main .card, main .notice').nth(1)); log('d-student-home-returned');
  await s.close();
  s = await openPage(browser, app, { email: STUDENT, query: 'page=timetable&role=student', size: PHONE });
  await s.shot('d-student-returned'); log('d-student-returned');
  // 돌려보내진 시간표는 바로 고칠 수 있는 상태로 열린다(고치는 칸 → [시간표 제출])
  const cellBtns2 = s.page.locator('table.data.rg .rg-cell:not([disabled])');
  await cellBtns2.nth(2).click(); await s.page.waitForTimeout(900);
  await tap(s, '학 (학원)'); await sheetBtn(s, '이 칸에 적용');
  await s.shot('d-student-resubmit'); log('d-student-resubmit');
  await press(s, '시간표 제출', { exact: true });
  await s.page.waitForTimeout(500);
  await s.shot('d-student-resubmitted'); log('d-student-resubmitted');
  await s.close();

  // ── 학부모 동의(다시 처음부터) ──
  s = await openPage(browser, app, { email: PARENT, query: 'page=timetable&role=parent&student=' + A.id, size: PHONE });
  await press(s, '동의합니다', { exact: true });
  await s.page.waitForTimeout(500);
  await s.shot('d-parent-agreed'); log('d-parent-agreed');
  await s.close();

  // ── 담당교사: 목록 → 확인. 담당이 아닌 교사에게는 이 학생이 없다 ──
  s = await openPage(browser, app, { email: HALL2, query: 'page=timetable&role=hall_teacher', size: PHONE });
  const t2 = await bodyText(s);
  console.log('  담당 아닌 교사(HALL2)의 목록에 학생A 이름?', t2.includes(A.name));
  await s.shot('d-teacher-other'); log('d-teacher-other');
  await s.close();
  s = await openPage(browser, app, { email: HALL, query: 'page=timetable&role=hall_teacher', size: PHONE });
  await s.shot('d-teacher-list'); log('d-teacher-list');
  await s.page.locator('.tt-row').filter({ hasText: A.name }).first().click(); await s.page.waitForTimeout(900);
  await s.shot('d-teacher-confirm', { fixed: true }); log('d-teacher-confirm');
  await sheetBtn(s, '확인');
  await s.page.waitForTimeout(500);
  await s.shot('d-teacher-confirmed'); log('d-teacher-confirmed');
  await s.close();

  s = await openPage(browser, app, { email: STUDENT, query: 'page=timetable&role=student', size: PHONE });
  await s.shot('d-student-confirmed'); log('d-student-confirmed');
  await s.close();
}

module.exports = { sectionD };
