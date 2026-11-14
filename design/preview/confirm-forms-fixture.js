/** D9 미리보기·시험용 가짜 모델(확인서 두 종). 학생·교사 이름은 모두 가짜다(CLAUDE.md 1번). docs/design/confirm-forms-model.md 모양. */
const student = { name: '김가온', grade: '1', classNo: '3', number: '5' };
const confirmer = { name: '박선생' };

function mealStop() {   // 조식·석식 모두 미실시(기숙사 퇴실 + 건강상의 사유가 아닌 개인 사유 → 기타)
  return { date: '2027-03-03', student, serving: { breakfast: '미실시', dinner: '미실시' }, reason: '기타', reasonOther: '개인 사정',
    breakfastCause: '기숙사 퇴실', period: { from: '2027-03-15', to: '' }, confirmer };
}
function mealServe() {  // 조식 실시(기숙사 입실)
  return { date: '2027-03-03', student: { name: '이나래', grade: '2', classNo: '1', number: '12' }, serving: { breakfast: '실시', dinner: null }, reason: '전입', reasonOther: '',
    breakfastCause: '기숙사 입실', period: { from: '2027-03-08', to: '' }, confirmer };
}
function moveLeave() {  // 학사 및 기숙사 퇴실
  return { date: '2027-03-03', kind: '퇴실', scopes: ['기숙사', '신한학사'], effectiveDate: '2027-03-15', student, note: '2OUT 퇴실', confirmer };
}
function moveEnter() {  // 기숙사 입실
  return { date: '2027-03-03', kind: '입실', scopes: ['기숙사'], effectiveDate: '2027-03-08', student: { name: '이나래', grade: '2', classNo: '1', number: '12' }, note: '', confirmer };
}
module.exports = { mealStop, mealServe, moveLeave, moveEnter };
