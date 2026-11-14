/** D9 미리보기·시험용 가짜 모델(확인서 두 종). docs/contracts/confirm-forms.md 모양(서버 foodMealConfirmModel_·inoutConfirmModel_ 결과와 같다). 학생·교사 이름은 모두 가짜다(CLAUDE.md 1번). */
function mealStop() {   // 조식·석식 모두 미실시 신청 하나는 한 항목이라 서버는 항목마다 따로 만든다. 여기서는 석식 미실시(기타 사유)
  return { form: 'meal', kind: '미실시', name: '김가온', grade: '1', classNo: '3', number: '5', reasonKind: '기타', reasonText: '개인 사정',
    periodFrom: '2027-03-15', breakfast: { on: false, off: false, reason: '' }, dinner: { on: false, off: true }, date: '2027-03-03', teacher: '박선생' };
}
function mealServe() {  // 조식 실시(전입, 조식 사유를 서버가 채우면 동그라미 — 지금 서버는 늘 '')
  return { form: 'meal', kind: '실시', name: '이나래', grade: '2', classNo: '1', number: '12', reasonKind: '전입', reasonText: '',
    periodFrom: '2027-03-08', breakfast: { on: true, off: false, reason: '기숙사 입실' }, dinner: { on: false, off: false }, date: '2027-03-03', teacher: '박선생' };
}
function mealBreakfastStop() {   // 조식 미실시(기숙사 퇴실 때문 — 서버는 reason을 '' 로 두고 종이에 ○한다)
  return { form: 'meal', kind: '미실시', name: '김가온', grade: '1', classNo: '3', number: '5', reasonKind: '', reasonText: '',
    periodFrom: '2027-03-15', breakfast: { on: false, off: true, reason: '' }, dinner: { on: false, off: false }, date: '2027-03-03', teacher: '박선생' };
}
function moveLeave() {  // 학사 및 기숙사 퇴실
  return { form: 'move', direction: '퇴실', hall: true, dorm: true, effectiveDate: '2027-03-15', name: '김가온', grade: '1', classNo: '3', number: '5', remark: '가정 사정(가짜)', date: '2027-03-03', teacher: '박선생' };
}
function moveEnter() {  // 기숙사 입실
  return { form: 'move', direction: '입실', hall: false, dorm: true, effectiveDate: '2027-03-08', name: '이나래', grade: '2', classNo: '1', number: '12', remark: '', date: '2027-03-03', teacher: '박선생' };
}
module.exports = { mealStop, mealServe, mealBreakfastStop, moveLeave, moveEnter };
