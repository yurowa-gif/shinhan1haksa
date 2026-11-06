/**
 * 가짜 좌석 배치(실제 좌석표 아님). docs/plan/stage1.md S0-4.
 *
 * buildFakeSeatLayout_() : 시트를 건드리지 않는 순수 함수. 언제 실행해도 같은 결과.
 *   CODING의 시드(spaces·seats 탭), DESIGN의 출석부 미리보기, RULES의 테스트가 함께 쓴다.
 *   숫자는 PRD 2절과 실제 자리배치도: 1층 자습실 146석, SA실 남 17석(SA1 8·SA2 9), 여 34석(SA3 8·SA4 8·SA5 9·SA6 9).
 *
 * 돌려주는 모양
 *   spaces: [{key, name, gender:'혼성'|'남'|'여', rows, cols}]   배열 순서 = 화면·인쇄 순서
 *   seats:  [{spaceKey, row, col, label, kind:'좌석'|'기둥'|'비상문'|'창문'}]
 *     row·col은 1부터. seats에 없는 칸은 빈칸(통로).
 *     label은 좌석만 공간 안 번호('1'부터, 행 우선), 좌석이 아닌 칸은 ''.
 */

/**
 * 1층 자습실: 실제 2025 1학기 자리배치도의 모양을 따른다(docs/reference/real-layout-2025.md, 이름 없음).
 * 세로 줄 8개 = 홑줄 · 짝줄 3쌍 · 홑줄, 줄 사이는 통로 열.
 * 20행 × 12열: 열 1(줄1) | 2 통로 | 3·4(줄2·3) | 5 통로 | 6·7(줄4·5) | 8 통로 | 9·10(줄6·7) | 11 통로 | 12(줄8)
 * 줄 길이 18·18·18·19·19·20·20·16, 줄8의 2칸은 기둥 → 좌석 146.
 */
var FAKE_SEAT_FLOOR1 = {
  key: '1F', name: '1층 자습실', gender: '혼성', rows: 20, cols: 12,
  lines: [{ col: 1, len: 18 }, { col: 3, len: 18 }, { col: 4, len: 18 }, { col: 6, len: 19 }, { col: 7, len: 19 },
    { col: 9, len: 20 }, { col: 10, len: 20 }, { col: 12, len: 16 }],
  special: { '6,12': '기둥', '12,12': '기둥', '20,12': '비상문', '20,1': '창문' }
};

/**
 * SA실: 실제 자리배치도처럼 방마다 세로 2줄(5행 × 2열).
 * 위 줄 방(SA1·SA3·SA4) 8석, 아래 줄 방(SA2·SA5·SA6) 9석 → 남 17, 여 34.
 * 9석 방은 (5,1) 창문, 8석 방은 (5,1) 창문 + (5,2) 비상문.
 */
var FAKE_SEAT_SA_ROOMS = [
  { key: 'SA1', gender: '남', seats: 8 },
  { key: 'SA2', gender: '남', seats: 9 },
  { key: 'SA3', gender: '여', seats: 8 },
  { key: 'SA4', gender: '여', seats: 8 },
  { key: 'SA5', gender: '여', seats: 9 },
  { key: 'SA6', gender: '여', seats: 9 }
];

function buildFakeSeatLayout_() {
  var spaces = [];
  var seats = [];

  /** cellKind(r, c) → '좌석'|'기둥'|'비상문'|'창문'|'' (''이면 빈칸, seats에 넣지 않음) */
  var addSpace = function (key, name, gender, rows, cols, cellKind) {
    spaces.push({ key: key, name: name, gender: gender, rows: rows, cols: cols });
    var n = 0;
    for (var r = 1; r <= rows; r++) {
      for (var c = 1; c <= cols; c++) {
        var kind = cellKind(r, c);
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
  addSpace(f.key, f.name, f.gender, f.rows, f.cols, function (r, c) {
    var k = r + ',' + c;
    if (Object.prototype.hasOwnProperty.call(f.special, k)) return f.special[k];
    for (var i = 0; i < f.lines.length; i++) {
      if (f.lines[i].col === c) return r <= f.lines[i].len ? '좌석' : '';
    }
    return ''; // 통로 열
  });

  for (var j = 0; j < FAKE_SEAT_SA_ROOMS.length; j++) {
    var room = FAKE_SEAT_SA_ROOMS[j];
    var special = room.seats === 9 ? { '5,1': '창문' } : { '5,1': '창문', '5,2': '비상문' };
    addSpace(room.key, room.key + '실', room.gender, 5, 2, (function (sp) {
      return function (r, c) {
        var k = r + ',' + c;
        return Object.prototype.hasOwnProperty.call(sp, k) ? sp[k] : '좌석';
      };
    })(special));
  }

  return { spaces: spaces, seats: seats };
}
