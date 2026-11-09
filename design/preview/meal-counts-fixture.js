/** D8 픽스처: 2027-03-03(수) 식수 집계(가짜 학생 30명). D6 시안(mealcount)·관리자 홈과 같은 숫자: 학사 30·기숙 24·비기숙 6·조식 23·석식 학사 27 + 일반 3, 퇴실 후 석식 유지 1명. */
const row = (hall, dorm, nonDorm, breakfast, hallDinner, generalDinner) => ({ hall, dorm, nonDorm, breakfast, hallDinner, generalDinner });
function buildModel() {
  return {
    title: '신한학사 식수 집계', date: '2027-03-03', termName: '2027 1학기', operating: true,
    counts: {
      groups: {
        '여1': row(4, 3, 1, 3, 4, 0), '여2': row(3, 3, 0, 3, 3, 0), '여3': row(3, 2, 1, 2, 3, 0), '여 합계': row(10, 8, 2, 8, 10, 0),
        '남1': row(7, 5, 2, 5, 7, 0), '남2': row(7, 6, 1, 6, 5, 2), '남3': row(6, 5, 1, 4, 5, 1), '남 합계': row(20, 16, 4, 15, 17, 3),
        '1학년': row(11, 8, 3, 8, 11, 0), '2학년': row(10, 9, 1, 9, 8, 2), '3학년': row(9, 7, 2, 6, 8, 1), '전체': row(30, 24, 6, 23, 27, 3)
      },
      afterLeaveHallDinner: 1, unknownGroup: [], warnings: []
    },
    docUnsubmitted: 2, preparedBy: '관리자', generatedAt: '2027-03-03 17:40'
  };
}
module.exports = { buildModel };
