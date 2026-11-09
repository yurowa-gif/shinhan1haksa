/**
 * D7 픽스처: 2027년 3월 근무 기록(가짜 교사 6명). D6 시안(duty-record)의 숫자와 같다:
 * 근무 박8·김8·이7·최9·정8·한8 = 48(21:30 18·23:00 18·단독 12), 예비 지정 11(최는 3/5 대신 근무라 1), 교대 3건.
 * 칸은 R8 모양(코드 배열 '21:30조'·'23:00조'·'단독', 예비는 teachers[].standby 날짜 배열). 결정적이다(같은 입력 → 같은 모델). 실제 교사 이름이 아니다.
 */
const T = ['박선생', '김선생', '이선생', '최선생', '정선생', '한선생'];
const pad = (n) => (n < 10 ? '0' : '') + n;
const date = (d) => '2027-03-' + pad(d);
// 2027-03-01은 월요일: (d-1)%7 → 0..3 월~목, 4..6 금~일
const weekday = (d) => (d - 1) % 7;

function buildModel() {
  const closed = [2];
  const cells = {};
  const standbyDates = {};
  T.forEach((t) => { cells[t] = {}; standbyDates[t] = []; });
  const put = (t, d, code) => { (cells[t][date(d)] = cells[t][date(d)] || []).push(code); };
  let i = 0;
  for (let d = 1; d <= 31; d++) {
    if (weekday(d) > 3 || closed.includes(d)) continue;
    put(T[i % 6], d, '21:30조');
    put(T[(i + 1) % 6], d, '23:00조');
    i++;
  }
  const solo = { 5: '최선생', 6: '박선생', 7: '정선생', 12: '한선생', 13: '최선생', 14: '김선생', 19: '이선생', 20: '정선생', 21: '박선생', 26: '한선생', 27: '김선생', 28: '최선생' };
  const standby = { 6: '김선생', 7: '박선생', 12: '정선생', 13: '이선생', 14: '한선생', 19: '박선생', 20: '최선생', 21: '한선생', 26: '이선생', 27: '정선생', 28: '김선생' };
  Object.keys(solo).forEach((d) => put(solo[d], Number(d), '단독'));
  Object.keys(standby).forEach((d) => standbyDates[standby[d]].push(date(Number(d))));   // 3/5의 예비(최선생)는 대신 근무라 standby에서 빠진다(R8과 같다)
  // 교대 3건: 3/5 이선생 → 최선생(예비가 대신 근무), 3/11 23:00 한선생 → (그날 23:00 실제 근무자), 3/20 김선생 → 정선생
  const at = (d, code) => T.find((t) => (cells[t][date(d)] || []).includes(code));
  return {
    month: '2027-03', title: '신한학사 근무 기록표', termName: '2027 1학기',
    closedDates: closed.map(date),
    teachers: T.map((name) => ({ name, cells: cells[name], standby: standbyDates[name] })),
    swaps: [
      { date: date(5), slot: '단독', from: '이선생', to: '최선생', kind: '대신 근무' },
      { date: date(11), slot: '23:00조', from: '한선생', to: at(11, '23:00조'), kind: '교대' },
      { date: date(20), slot: '단독', from: '김선생', to: '정선생', kind: '교대' }
    ],
    generatedAt: '2027-03-31 18:20', lastChangedAt: '2027-03-20 21:05', warnings: []
  };
}

module.exports = { buildModel, T };
