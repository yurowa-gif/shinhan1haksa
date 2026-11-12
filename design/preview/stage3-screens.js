/* D10 정적 시안: 3단계 화면(F5 좌석 초안·규칙 위반 표시, 떨어뜨릴 짝 관리, F8 방 배정, 정원 현황판).
   브라우저에서 돈다(design/preview/stage3.js가 stage2-screens.js의 도우미 부분 + Styles·Client·Components와 함께 한 쪽으로 묶는다).
   실제 화면 코드가 아니다 — 서버를 부르지 않고, 이름·숫자는 모두 가짜다. UI.* 컴포넌트를 그대로 쓴다.
   규칙 위반 칸은 계산해서 그린다(같은 학년 이웃·떨어뜨릴 짝 이웃) → 숫자와 빨간 칸이 어긋나지 않는다. */

/* PC 권장 화면(좌석·방)은 main 을 넓힌다(.wide). frame 에 wide:true 를 주면 붙는다 */
var __frame = frame;
frame = function (root, opts) { var m = __frame(root, opts); if (opts.wide) m.classList.add('wide'); return m; };

/* ───────── 가짜 명단 ───────── */
var NAMES_M = ['김가온', '박도윤', '이서준', '최하준', '정시우', '강지호', '조민재', '윤현우', '장우진', '임건우', '한지후', '오태양', '서준혁', '신재윤', '권도현', '황민석', '문지환', '배승우', '백도훈', '노은호'];
var NAMES_F = ['이나래', '박다솜', '최하늘', '정하나', '오서아', '김소율', '한유진', '송지안', '유채원', '홍나윤', '전서현', '양하은'];
function lab(g, n) { return g + '. ' + n; }

/* ═════════ 좌석: 1층 자습실 6줄 × 7칸 ═════════ */
var SEAT_ROWS = 6, SEAT_COLS = 7;
var SEAT_FIXED = { '3,4': 'pillar', '6,4': 'door' };
var SEAT_VACANT = { '1,1': true, '6,7': true };
/* 학년은 (줄+칸)%3 로 돌려 이웃이 겹치지 않게 하고, 일부러 몇 칸만 겹치게 바꾼다(위반 시연) */
var SEAT_GRADE_FIX = { '2,4': 2 };                    // 2줄 4번째: 오른쪽 옆자리와 같은 학년
var SEAT_PAIR = { a: '5,2', b: '5,3' };               // 떨어뜨릴 짝이 옆자리
var SEAT_GENDER_BAD = '4,7';                          // 여자 구역에 남학생(성별 위반)
function buildSeats() {
  var seats = [], n = 0, mi = 0, fi = 0, by = {};
  for (var r = 1; r <= SEAT_ROWS; r++) for (var c = 1; c <= SEAT_COLS; c++) {
    var k = r + ',' + c;
    if (SEAT_FIXED[k]) { by[k] = { row: r, col: c, kind: SEAT_FIXED[k] }; continue; }
    n++;
    var cell = { row: r, col: c, kind: 'seat', seatLabel: String(n), no: n };
    if (SEAT_VACANT[k]) { cell.vacant = true; } else {
      cell.grade = SEAT_GRADE_FIX[k] || ((r + c) % 3) + 1;
      cell.female = c >= 5 && k !== SEAT_GENDER_BAD;      // 5~7칸은 여자 구역
      cell.name = cell.female ? NAMES_F[fi++ % NAMES_F.length] : NAMES_M[mi++ % NAMES_M.length];
      cell.text = lab(cell.grade, cell.name);
    }
    by[k] = cell; seats.push(cell);
  }
  return { by: by, seats: seats };
}
/** 이웃(위·아래·왼쪽·오른쪽, 기둥·비상문은 이웃을 끊음)에서 위반을 계산한다 → [{key, no, kind, withText}] */
function seatViolations(S) {
  var out = [];
  S.seats.forEach(function (s) {
    if (s.vacant) return;
    var k = s.row + ',' + s.col;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
      var t = S.by[(s.row + d[0]) + ',' + (s.col + d[1])];
      if (!t || t.kind !== 'seat' || t.vacant) return;
      if (t.grade === s.grade) out.push({ key: k, no: s.no, kind: '같은 학년', withText: '옆 ' + t.text });
      if ((k === SEAT_PAIR.a && (t.row + ',' + t.col) === SEAT_PAIR.b) || (k === SEAT_PAIR.b && (t.row + ',' + t.col) === SEAT_PAIR.a)) out.push({ key: k, no: s.no, kind: '떨어뜨릴 짝', withText: t.text });
    });
    if (k === SEAT_GENDER_BAD) out.push({ key: k, no: s.no, kind: '성별', withText: '여자 구역' });
  });
  var seen = {};
  return out.filter(function (v) { var id = v.key + v.kind; if (seen[id]) return false; seen[id] = 1; return true; });
}
function seatCells(S, vio) {
  var bad = {}; vio.forEach(function (v) { bad[v.key] = true; });
  return Object.keys(S.by).map(function (k) {
    var c = S.by[k]; if (c.kind !== 'seat') return { row: c.row, col: c.col, kind: c.kind };
    return { row: c.row, col: c.col, kind: 'seat', seatLabel: c.seatLabel, text: c.text, vacant: !!c.vacant, bad: !!bad[k] };
  });
}
var SEAT_CHIPS = ['1층 자습실', 'SA1', 'SA2', 'SA3', 'SA4', 'SA5', 'SA6'];
function spaceChips(on) {
  return el('div', { class: 'chips' }, SEAT_CHIPS.map(function (t) { return el('button', { type: 'button', class: 'chip' + (t === on ? ' on' : ''), text: t }); }));
}
function wide(children) { return el('div', { style: 'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start' }, children); }
function pane(basis, children) { return el('div', { style: 'flex:1 1 ' + basis + 'px;min-width:0;max-width:100%' }, children); }

/* 위반 목록: 줄을 누르면 그 칸으로 간다(칸을 고른 모양 + 화면 맨 위로 말고 격자 안으로 스크롤) */
function violationList(vio, grid, activeNo, canSeePair) {
  var shown = vio.filter(function (v) { return canSeePair || v.kind !== '떨어뜨릴 짝'; });
  var ul = el('ul', { class: 'list' });
  shown.forEach(function (v) {
    var detail = v.kind === '떨어뜨릴 짝' ? '짝: ' + v.withText : v.withText;
    var b = el('button', { type: 'button', class: 'chip bad', style: 'width:100%;border-radius:var(--radius-sm);text-align:left;word-break:keep-all' }, [v.no + '번 · ' + v.kind + ' · ' + detail]);
    b.addEventListener('click', function () { goCell(grid, v.no); });
    ul.appendChild(el('li', {}, [b]));
  });
  return ul;
}
function goCell(grid, no) {
  var cells = grid.querySelectorAll('.seat-cell');
  for (var i = 0; i < cells.length; i++) {
    var n = cells[i].querySelector('.seat-no').textContent;
    if (n === String(no)) { cells[i].click(); cells[i].scrollIntoView({ block: 'nearest', inline: 'center' }); }
  }
}

/* ═════════ F5 좌석 화면 ═════════ */
def('seat-assign', 'F5 좌석', 'F5 좌석 배정 + [초안 만들기] (처음)', {}, function (root) {
  var S = buildSeats();
  var m = frame(root, { wide: true, title: '좌석 배치', who: '박선생', bar: [{ text: '초안 만들기' }],
    note: '시안 · 학사 교사·관리자 화면. 배정 모드의 아래 바에 [초안 만들기]. 누르면 지금 배정을 바꾸지 않고 미리보기부터 보여 준다.' });
  m.appendChild(el('div', { class: 'notice info', text: '넓은 화면(PC)에서 편합니다.' }));
  m.appendChild(el('div', { class: 'muted', text: '2027 1학기' }));
  m.appendChild(UI.segmented({ options: [{ value: 'assign', label: '배정하기' }, { value: 'draw', label: '칸 그리기' }], value: 'assign', onchange: function () {} }));
  m.appendChild(spaceChips('1층 자습실'));
  m.appendChild(el('div', { class: 'hint muted', text: '두 자리를 차례로 누르면 맞바꿉니다. 배정 안 된 학생 0명.' }));
  m.appendChild(UI.seatGrid({ rows: SEAT_ROWS, cols: SEAT_COLS, cells: seatCells(S, []), mode: 'swap', onselect: function () {} }));
});

function seatPreview(root, who) {
  var S = buildSeats(), vio = seatViolations(S);
  var admin = who !== 'homeroom';
  var m = frame(root, { wide: true, title: '좌석 초안', who: '박선생', bar: [{ text: '취소', kind: 'secondary' }, { text: '저장' }],
    note: '시안 · 아직 저장 전. 규칙 위반이 있어도 [저장]은 막히지 않는다(빨간 표시는 알림일 뿐). 빨간 칸은 굵은 테두리 + ⚠ + 목록으로도 알린다.' });
  m.appendChild(el('div', { class: 'stats', style: 'margin-bottom:12px' }, [statBox(21, '바뀌는 자리'), statBox(vio.length, '규칙 위반')]));
  m.appendChild(el('div', { class: 'notice warn', text: '베리타스 학생 3명은 SA실 자리가 모자라 1층 자습실로 배정했습니다. 저장한 뒤 맞바꿀 수 있습니다.' }));
  m.appendChild(spaceChips('1층 자습실'));
  var grid = UI.seatGrid({ rows: SEAT_ROWS, cols: SEAT_COLS, cells: seatCells(S, vio), mode: 'single', onselect: function () {} });
  var list = card('규칙 위반 ' + vio.length + '개', [
    el('div', { class: 'muted', style: 'margin-bottom:8px', text: '줄을 누르면 그 자리로 이동합니다.' }), violationList(vio, grid, 0, true),
    el('div', { class: 'muted', style: 'margin-top:8px', text: '같은 학년끼리 앞뒤·좌우로 붙지 않게, 떨어뜨릴 짝은 이웃이 되지 않게 맞췄지만 모두 지킬 수 없어 가장 덜 어기는 배치입니다.' })]);
  m.appendChild(wide([pane(580, [grid]), pane(300, [list])]));
  /* 줄 하나를 눌러 본 모양(칸이 골라진 채 보인다) */
  setTimeout(function () { var first = list.querySelectorAll('.chip.bad')[0]; if (first) first.click(); }, 0);
}
def('seat-draft-preview', 'F5 좌석', 'F5 초안 미리보기 (바뀌는 자리·규칙 위반, 빨간 칸, 위반 목록)', {}, function (root) { seatPreview(root, 'hall'); });

def('seat-draft-save', 'F5 좌석', 'F5 초안 저장 확인 (위반이 있어도 저장 가능)', { sheet: true }, function (root) {
  seatPreview(root, 'hall');
  UI.confirmSheet({ title: '이 초안으로 저장할까요?', lead: '바뀌는 자리 21개 · 규칙 위반 ' + seatViolations(buildSeats()).length + '개', lines: ['규칙 위반이 있어도 저장할 수 있습니다.', '지금 배정은 기준일 전날까지로 끝나고, 지난 날짜 출석부·좌석표는 그대로 남습니다.'], confirmText: '저장', onconfirm: function () {} });
});

def('seat-homeroom', 'F5 좌석', 'F5 담임 좌석 보기 (떨어뜨릴 짝 표시 없음)', {}, function (root) {
  var S = buildSeats(), vio = seatViolations(S).filter(function (v) { return v.kind !== '떨어뜨릴 짝'; });
  var m = frame(root, { wide: true, title: '좌석 배치', who: '이선생', note: '담임 이선생 화면 · 열람만(결정 64). 떨어뜨릴 짝은 표시도 목록도 없고, 초안·저장 버튼도 없다.' });
  m.appendChild(el('div', { class: 'muted', text: '2027 1학기' }));
  m.appendChild(spaceChips('1층 자습실'));
  var grid = UI.seatGrid({ rows: SEAT_ROWS, cols: SEAT_COLS, cells: seatCells(S, vio), mode: 'single', onselect: function () {} });
  m.appendChild(grid);
});

/* ═════════ 떨어뜨릴 짝 ═════════ */
var PAIRS = [
  { a: lab(2, '이나래'), b: lab(2, '최하늘'), scope: '둘 다', reason: '서로 말다툼 후 거리를 두기로 함', status: 'confirmed' },
  { a: lab(1, '김가온'), b: lab(1, '박도윤'), scope: '좌석', reason: '같이 있으면 자습이 안 됨', status: 'confirmed' },
  { a: lab(3, '박다솜'), b: lab(3, '정하나'), scope: '방', reason: '생활 습관 차이', status: 'confirmed' },
  { a: lab(1, '강지호'), b: lab(2, '조민재'), scope: '둘 다', reason: '', status: 'canceled' }
];
function pairTabs(on) { return [{ t: '짝 목록', on: on === 0 }, { t: '짝 추가', on: on === 1 }]; }
def('pair-list', '떨어뜨릴 짝', '떨어뜨릴 짝 목록 (취소만, 삭제 없음)', {}, function (root) {
  var m = frame(root, { title: '떨어뜨릴 짝', who: '박선생', bar: [{ text: '+ 짝 추가' }],
    note: '시안 · 관리자·학사 교사만 볼 수 있다. 담임·학생·학부모 화면과 응답에는 짝도 사유도 없다.' });
  m.appendChild(el('div', { class: 'notice info', text: '사유는 관리자·학사 교사만 봅니다. 초안 만들기는 "좌석"·"둘 다"인 짝을 자리에서, "방"·"둘 다"인 짝을 방 배정에서 떨어뜨립니다.' }));
  m.appendChild(UI.segmented({ options: [{ value: 'on', label: '유효 3' }, { value: 'all', label: '취소 포함 4' }], value: 'all', onchange: function () {} }));
  var ul = el('ul', { class: 'list' });
  PAIRS.forEach(function (p) {
    var canceled = p.status === 'canceled';
    var left = el('div', { style: 'min-width:0;word-break:keep-all' }, [el('b', { text: p.a + ' ↔ ' + p.b }), el('div', { class: 'muted', text: '범위: ' + p.scope + (p.reason ? ' · 사유: ' + p.reason : ' · 사유: 없음') })]);
    var li = el('li', { style: 'align-items:center' }, [left, canceled ? UI.statusPill('canceled', '취소됨') : el('button', { type: 'button', class: 'btn secondary row-btn', text: '취소' })]);
    ul.appendChild(li);
  });
  m.appendChild(card('', [ul]));
  m.appendChild(el('div', { class: 'muted', text: '기록은 지우지 않습니다. 짝을 풀려면 [취소]를 누르세요(누가·언제 취소했는지 남습니다).' }));
});

def('pair-add', '떨어뜨릴 짝', '떨어뜨릴 짝 추가 (두 학생·범위·사유)', {}, function (root) {
  var m = frame(root, { title: '떨어뜨릴 짝 추가', who: '박선생', bar: [{ text: '취소', kind: 'secondary' }, { text: '짝 추가' }],
    note: '시안 · 두 학생을 고르고, 어디서 떨어뜨릴지(좌석·방·둘 다)와 짧은 사유를 적는다. 사유는 관리자·학사 교사만 본다.' });
  m.appendChild(studentPick('첫 번째 학생', '이나래'));
  m.appendChild(studentPick('두 번째 학생', '최하늘'));
  m.appendChild(el('div', { class: 'field' }, [el('div', { class: 'label', text: '어디서 떨어뜨릴까요?' })]));
  m.appendChild(UI.segmented({ options: [{ value: 'seat', label: '좌석' }, { value: 'room', label: '방' }, { value: 'both', label: '둘 다' }], value: 'both', onchange: function () {} }));
  m.appendChild(inputField('사유 (짧게)', 'text', '서로 말다툼 후 거리를 두기로 함', '관리자·학사 교사만 봅니다. 담임·학생·학부모에게는 보이지 않습니다.'));
  m.appendChild(el('div', { class: 'notice info', text: '같은 학생 두 명 조합은 한 번만 만들 수 있습니다. 이미 있으면 목록에서 확인하세요.' }));
});

def('pair-cancel', '떨어뜨릴 짝', '떨어뜨릴 짝 취소 확인 (삭제 아님)', { sheet: true }, function (root) {
  frame(root, { title: '떨어뜨릴 짝', who: '박선생', note: '시안 · 취소해도 기록은 남는다.' });
  UI.confirmSheet({ title: '이 짝을 취소할까요?', lead: '2. 이나래 ↔ 2. 최하늘', lines: ['다음 초안부터 이 둘을 떨어뜨리지 않습니다.', '기록은 지워지지 않고 "취소됨"으로 남습니다.'], confirmText: '짝 취소', danger: true, onconfirm: function () {} });
});

/* ═════════ F8 방 배정 ═════════ */
/* 남 3층 1~4호(16명, 낮은 층부터 채움 — 채우는 순서는 R15가 정함), 여 5층 13~14호(8명). 학년은 방마다 섞는다 */
var ROOMS = {
  3: [{ no: 1, g: 'M', s: [[1, '김가온'], [2, '박도윤'], [3, '이서준'], [1, '최하준']] }, { no: 2, g: 'M', s: [[2, '정시우'], [3, '강지호'], [1, '조민재'], [2, '윤현우']] },
      { no: 3, g: 'M', s: [[1, '장우진'], [2, '임건우'], [3, '한지후'], [1, '오태양']] }, { no: 4, g: 'M', s: [[1, '서준혁'], [2, '신재윤'], [2, '권도현'], [3, '황민석']] }],
  5: [{ no: 13, g: 'F', s: [[1, '정하나'], [2, '이나래'], [3, '박다솜'], [1, '오서아']] }, { no: 14, g: 'F', s: [[2, '최하늘'], [1, '김소율'], [3, '한유진'], [2, '송지안']] }]
};
var FLOOR_ROOMS = { 3: [1, 4], 4: [5, 12], 5: [13, 19], 6: [20, 27], 7: [28, 35] };
var FLOOR_G = { 3: '남', 4: '남', 5: '여', 6: '여', 7: '여' };
function floorChips(on) {
  return el('div', { class: 'chips' }, [3, 4, 5, 6, 7].map(function (f) { return el('button', { type: 'button', class: 'chip' + (f === on ? ' on' : ''), text: f + '층 ' + FLOOR_G[f] }); }));
}
/** 방 한 칸 카드. members:[[학년,이름,{bad}]], cap:정원, issues:[글] */
function roomCard(floor, room, members, cap, issues, hl) {
  var over = members.length > cap;
  var head = row([el('b', { text: floor + '층 ' + room + '호' }), el('span', { class: 'muted', text: FLOOR_G[floor] + ' · ' + members.length + '/' + cap + '명' }), over ? UI.statusPill('out2', '정원 초과') : null], 'justify-content:space-between;margin-bottom:8px');
  var chips = el('div', { class: 'chips', style: 'margin:0' });
  members.forEach(function (m, i) {
    var b = el('button', { type: 'button', class: 'chip' + (m[2] ? ' bad' : '') + (hl && hl[i] ? ' on' : ''), style: 'word-break:keep-all', text: lab(m[0], m[1]) });
    chips.appendChild(b);
  });
  for (var e = members.length; e < cap; e++) chips.appendChild(el('button', { type: 'button', class: 'chip', disabled: 'disabled', text: '빈 자리' }));
  var c = card('', [head, chips]);
  (issues || []).forEach(function (t) { c.appendChild(el('div', { class: 'error', style: 'margin-top:8px', text: t })); });
  c.style.margin = '0';
  if (over || (issues && issues.length)) c.style.border = '3px solid var(--warn)';
  return c;
}
function roomGrid(cards) { return el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:12px' }, cards); }
function ROOM(floor, no) { return ROOMS[floor].filter(function (r) { return r.no === no; })[0]; }
function basicCards(floor) { return ROOMS[floor].map(function (r) { return roomCard(floor, r.no, r.s.map(function (x) { return [x[0], x[1]]; }), 4); }); }

def('room-board', 'F8 방 배정', 'F8 방 배정 (층별 카드, 학년. 이름)', {}, function (root) {
  var m = frame(root, { wide: true, title: '방 배정', who: '박선생', bar: [{ text: '초안 만들기', kind: 'secondary' }, { text: '방으로 옮기기', disabled: true }],
    note: '시안 · 층을 고르면 그 층의 방 카드가 나온다. 학생 이름을 누르면 고른 표시(✓): 한 명이면 [방으로 옮기기]가 켜지고, 두 명이면 맞바꾸기 확인창이 뜬다.' });
  m.appendChild(el('div', { class: 'muted', style: 'margin-bottom:4px', text: '2027 1학기 · 기숙 24명(남 16·여 8)' }));
  m.appendChild(floorChips(3));
  m.appendChild(roomGrid(basicCards(3)));
  m.appendChild(row([el('a', { class: 'btn secondary', href: '#room-stats', text: '정원 현황판 ▸' })]));
});

def('room-edit', 'F8 방 배정', 'F8 손으로 고친 뒤 (정원 초과·떨어뜨릴 짝이 빨갛게)', {}, function (root) {
  var m = frame(root, { wide: true, title: '방 배정', who: '박선생', bar: [{ text: '초안 만들기', kind: 'secondary' }, { text: '저장', disabled: true }],
    note: '시안 · 손으로 옮긴 뒤 다시 계산한 모습. 정원 초과(5/4)와 떨어뜨릴 짝(방)이 빨간 테두리 + ⚠ 글자로 보인다. 정원 초과·성별 불일치가 있으면 [저장]이 꺼진다(같은 학년·떨어뜨릴 짝은 표시만).' });
  m.appendChild(el('div', { class: 'error', style: 'margin-bottom:12px', text: '정원 초과가 있어 저장할 수 없습니다. 3층 2호를 4명 이하로 맞춰 주세요. (떨어뜨릴 짝은 표시만 하며 저장을 막지 않습니다.)' }));
  m.appendChild(el('div', { class: 'stats', style: 'margin-bottom:12px' }, [statBox(2, '규칙 위반')]));
  m.appendChild(floorChips(3));
  var r2 = ROOM(3, 2).s.map(function (x) { return [x[0], x[1]]; }); r2.push([2, '황민석']);   // 4호에서 옮겨 와 5명
  var r3 = ROOM(3, 3).s.map(function (x) { return [x[0], x[1], x[1] === '장우진' || x[1] === '임건우' ? 1 : 0]; });  // 떨어뜨릴 짝 둘이 같은 방
  var r4 = ROOM(3, 4).s.slice(0, 3).map(function (x) { return [x[0], x[1]]; });
  m.appendChild(roomGrid([
    roomCard(3, 1, ROOM(3, 1).s.map(function (x) { return [x[0], x[1]]; }), 4),
    roomCard(3, 2, r2, 4, ['정원 4명인데 5명입니다(1명 초과).']),
    roomCard(3, 3, r3, 4, ['떨어뜨릴 짝이 같은 방입니다(' + lab(2, '임건우') + ' · ' + lab(1, '장우진') + ').']),
    roomCard(3, 4, r4, 4)]));
  m.appendChild(card('규칙 위반 2개', [el('ul', { class: 'list' }, [
    el('li', {}, [el('button', { type: 'button', class: 'chip bad', style: 'width:100%;border-radius:var(--radius-sm);text-align:left;word-break:keep-all', text: '3층 2호 · 정원 초과 (5/4)' })]),
    el('li', {}, [el('button', { type: 'button', class: 'chip bad', style: 'width:100%;border-radius:var(--radius-sm);text-align:left;word-break:keep-all', text: '3층 3호 · 떨어뜨릴 짝' })])])]));
});

def('room-draft-preview', 'F8 방 배정', 'F8 초안 미리보기 (바뀌는 학생·규칙 위반 0)', {}, function (root) {
  var m = frame(root, { wide: true, title: '방 초안', who: '박선생', bar: [{ text: '취소', kind: 'secondary' }, { text: '저장' }],
    note: '시안 · 아직 저장 전. 기숙 학생만, 층의 성별은 고정, 방마다 학년을 섞고 떨어뜨릴 짝(방·둘 다)은 같은 방에 두지 않는다.' });
  m.appendChild(el('div', { class: 'stats', style: 'margin-bottom:12px' }, [statBox(24, '바뀌는 학생'), statBox(0, '규칙 위반')]));
  m.appendChild(el('div', { class: 'notice ok', text: '규칙 위반이 없습니다. 저장하면 지금 배정은 기준일 전날까지로 끝나고, 지난 날짜 기록은 그대로 남습니다.' }));
  m.appendChild(floorChips(5));
  m.appendChild(roomGrid(basicCards(5)));
  m.appendChild(el('div', { class: 'muted', text: '3층 남 4실(16명)·5층 여 2실(8명)이 새로 짜였습니다. 다른 층은 비어 있습니다.' }));
});

def('room-swap-confirm', 'F8 방 배정', 'F8 두 학생 맞바꾸기 확인', { sheet: true }, function (root) {
  frame(root, { title: '방 배정', who: '박선생', note: '시안 · 두 학생을 차례로 누르면 확인창.' });
  UI.confirmSheet({ title: '두 학생의 방을 맞바꿀까요?', lead: '3층 1호 1. 김가온 ⇄ 3층 4호 3. 황민석', lines: ['두 방 모두 정원 4명이 그대로입니다.', '다시 계산한 규칙 위반은 저장 전에 보여 드립니다.'], confirmText: '맞바꾸기', onconfirm: function () {} });
});

def('room-move-sheet', 'F8 방 배정', 'F8 학생을 다른 방으로 옮기기 (방 고르기)', { sheet: true }, function (root) {
  frame(root, { title: '방 배정', who: '박선생', note: '시안 · 학생을 고르고 [방으로 옮기기]. 정원이 찬 방도 고를 수 있고 ⚠ 정원 초과로 알려 준다(고르는 것은 막지 않지만 그대로는 저장할 수 없다).' });
  var list = el('ul', { class: 'picker-list' });
  [[1, 4, '정원 참'], [2, 4, '정원 참'], [3, 4, '정원 참'], [4, 3, '1자리 남음']].forEach(function (r) {
    var full = r[2] === '정원 참';
    list.appendChild(el('li', {}, [el('button', { type: 'button', class: 'picker-item' }, [el('span', { style: 'word-break:keep-all', text: '3층 ' + r[0] + '호 · ' + r[1] + '/4명' }), full ? el('b', { style: 'color:var(--warn);white-space:nowrap', text: '⚠ 정원 초과' }) : UI.statusPill('confirmed', r[2])])]));
  });
  UI.bottomSheet({ title: '2. 신재윤을 어느 방으로 옮길까요?', content: el('div', {}, [el('div', { class: 'muted', style: 'margin-bottom:8px', text: '지금 3층 4호 (같은 층·남)' }), list]), actions: [{ text: '취소', kind: 'secondary', onclick: function () {} }], onclose: function () {} }).open();
});

/* ═════════ 정원 현황판 ═════════ */
function capTable() {
  var cols = ['층', '정원', '입실', '빈 자리', '1학년', '2학년', '3학년'];
  var data = [
    ['3층 남', 16, 16, 0, 6, 6, 4], ['4층 남', 32, 0, 32, 0, 0, 0],
    ['5층 여', 28, 8, 20, 3, 3, 2], ['6층 여', 32, 0, 32, 0, 0, 0], ['7층 여', 32, 0, 32, 0, 0, 0]];
  var tot = [['남 합계', 48, 16, 32, 6, 6, 4], ['여 합계', 92, 8, 84, 3, 3, 2], ['전체', 140, 24, 116, 9, 9, 6]];
  var t = el('table', { class: 'data compact' });
  t.appendChild(el('thead', {}, [el('tr', {}, cols.map(function (c) { return el('th', { text: c }); }))]));
  var tb = el('tbody');
  data.forEach(function (r) { tb.appendChild(el('tr', {}, r.map(function (v) { return el('td', { text: String(v) }); }))); });
  tot.forEach(function (r) { tb.appendChild(el('tr', { class: 'total' }, r.map(function (v) { return el('td', { text: String(v) }); }))); });
  t.appendChild(tb);
  return el('div', { class: 'tablewrap' }, [t]);
}
def('room-stats', 'F8 방 배정', 'F8 정원 현황판 (층·성별·학년, 남 48·여 92)', {}, function (root) {
  var m = frame(root, { title: '기숙사 정원 현황', who: '박선생', note: '시안 · 정원 남 48 · 여 92(결정 24). 입실 숫자는 가짜 24명(남 16·여 8)과 같다. 합계 줄은 굵은 글씨 + 회색 바탕.' });
  m.appendChild(el('div', { class: 'stats', style: 'margin-bottom:12px' }, [statBox(140, '정원'), statBox(24, '입실'), statBox(116, '빈 자리')]));
  m.appendChild(capTable());
  m.appendChild(el('div', { class: 'muted', style: 'margin:-4px 0 12px', text: '표는 옆으로 밀 수 있습니다(첫 열은 고정).' }));
  m.appendChild(el('div', { class: 'notice info', text: '입실 인원은 학사 기숙사 상태가 "기숙사"인 학생을 방에 배정한 수입니다. 방이 배정되지 않은 기숙 학생은 0명입니다.' }));
  m.appendChild(row([el('a', { class: 'btn secondary', href: '#room-board', text: '방 배정 ▸' })]));
});

def('home-admin-dorm', '홈', '관리자·학사 교사 홈의 기숙사 빈 자리 카드', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '박선생', note: '시안 · 홈에 얹는 카드 한 장(C23). 정원 현황판으로 들어가는 입구.' });
  m.appendChild(card('기숙사 빈 자리', [el('div', { class: 'stats', style: 'margin:4px 0 12px' }, [statBox(32, '남 빈 자리(정원 48)'), statBox(84, '여 빈 자리(정원 92)')]),
    el('div', { class: 'muted', text: '입실 24명 · 방 배정 안 됨 0명' }), link('정원 현황판 열기', 'secondary', 'margin-top:12px')]));
});

/* ═════════ 실행 ═════════ */
function renderScreen(id) {
  var s = SCREENS[id];
  var root = document.getElementById('app');
  if (!s) {
    root.appendChild(el('main', {}, [el('h1', { text: 'D10 시안 목록 (가짜 이름 · 정적 미리보기)' })].concat(ORDER.map(function (k) { return el('p', {}, [el('a', { href: '#' + k, text: SCREENS[k].group + ' · ' + SCREENS[k].label })]); }))));
    return;
  }
  s.fn(root);
  document.title = s.label;
}
window.addEventListener('hashchange', function () { location.reload(); });
renderScreen(location.hash.replace('#', ''));
document.body.setAttribute('data-ready', '1');
