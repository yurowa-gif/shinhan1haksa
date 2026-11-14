/** D8 픽스처: 2027-03-03(수) 식수 집계(가짜 학생 30명). D6 시안(mealcount)·관리자 홈과 같은 숫자: 학사 30·기숙 24·비기숙 6·조식 23·석식 학사 27 + 일반 3, 퇴실 후 석식 유지 1명. */
const row = (hall, dorm, nonDorm, breakfast, hallDinner, generalDinner) => ({ hall, dorm, nonDorm, breakfast, hallDinner, generalDinner });
/** 방학 기간 날짜의 중식(결정 73): 학사 입실 학생 중 중식 실시. 합계가 맞게 줄마다 값을 준다(여 8·남 15·1학년 8·2학년 9·3학년 6·전체 23) */
const LUNCH = { '여1': 3, '여2': 3, '여3': 2, '여 합계': 8, '남1': 5, '남2': 6, '남3': 4, '남 합계': 15, '1학년': 8, '2학년': 9, '3학년': 6, '전체': 23 };
function buildModel(opts) {
  const m = buildTermModel();
  if (!(opts && opts.vacation)) return m;
  m.date = '2027-07-21'; m.termName = '2027 여름방학'; m.generatedAt = '2027-07-21 17:40'; m.showLunch = true;
  Object.keys(m.counts.groups).forEach((k) => { m.counts.groups[k].lunch = LUNCH[k]; });
  return m;
}
function buildTermModel() {
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
