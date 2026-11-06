/**
 * 가짜 좌석 배치(실제 좌석표 아님). docs/plan/stage1.md S0-4.
 *
 * buildFakeSeatLayout_() : 시트를 건드리지 않는 순수 함수. 언제 실행해도 같은 결과.
 *   CODING의 시드(spaces·seats 탭), DESIGN의 출석부 미리보기, RULES의 테스트가 함께 쓴다.
 *   숫자는 PRD 2절: 1층 자습실 146석, SA실 남 17석(SA1 9·SA2 8), 여 34석(SA3 9·SA4 9·SA5 8·SA6 8).
 *
 * 돌려주는 모양
 *   spaces: [{key, name, gender:'혼성'|'남'|'여', rows, cols}]   배열 순서 = 화면·인쇄 순서
 *   seats:  [{spaceKey, row, col, label, kind:'좌석'|'기둥'|'비상문'|'창문'}]
 *     row·col은 1부터. seats에 없는 칸은 빈칸(통로).
 *     label은 좌석만 공간 안 번호('1'부터, 행 우선), 좌석이 아닌 칸은 ''.
 */

/** 1층 자습실 13행 × 12열 = 156칸: 좌석 146 + 기둥 4 + 비상문 2 + 창문 2 + 빈칸 2 */
var FAKE_SEAT_FLOOR1 = {
  key: '1F', name: '1층 자습실', gender: '혼성', rows: 13, cols: 12,
  special: {
    '5,4': '기둥', '5,9': '기둥', '9,4': '기둥', '9,9': '기둥',
    '1,1': '비상문', '13,12': '비상문',
    '7,1': '창문', '7,12': '창문',
    '1,12': '', '13,1': ''
  }
};

/** SA실: 2행 × 5열. 9석 = 비상문 1칸, 8석 = 비상문 1칸 + 창문 1칸 */
var FAKE_SEAT_SA_ROOMS = [
  { key: 'SA1', gender: '남', seats: 9 },
  { key: 'SA2', gender: '남', seats: 8 },
  { key: 'SA3', gender: '여', seats: 9 },
  { key: 'SA4', gender: '여', seats: 9 },
  { key: 'SA5', gender: '여', seats: 8 },
  { key: 'SA6', gender: '여', seats: 8 }
];

function buildFakeSeatLayout_() {
  var spaces = [];
  var seats = [];

  var addSpace = function (key, name, gender, rows, cols, special) {
    spaces.push({ key: key, name: name, gender: gender, rows: rows, cols: cols });
    var n = 0;
    for (var r = 1; r <= rows; r++) {
      for (var c = 1; c <= cols; c++) {
        var kind = Object.prototype.hasOwnProperty.call(special, r + ',' + c) ? special[r + ',' + c] : '좌석';
        if (kind === '') continue; // 빈칸(통로)
        seats.push({
          spaceKey: key, row: r, col: c,
          label: kind === '좌석' ? String(++n) : '',
          kind: kind
        });
      }
    }
  };

  var f = FAKE_SEAT_FLOOR1;
  addSpace(f.key, f.name, f.gender, f.rows, f.cols, f.special);

  for (var i = 0; i < FAKE_SEAT_SA_ROOMS.length; i++) {
    var room = FAKE_SEAT_SA_ROOMS[i];
    var special = room.seats === 9 ? { '1,5': '비상문' } : { '1,5': '비상문', '2,5': '창문' };
    addSpace(room.key, room.key + '실', room.gender, 2, 5, special);
  }

  return { spaces: spaces, seats: seats };
}
