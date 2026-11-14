/* D12 정적 시안: 4단계 화면 — C27 서류 체크리스트(결정 75①)·C28 프로그램 + 참가자(결정 75②). 브라우저에서 돈다(stage4.js가 stage2-screens.js의 도우미 부분과 묶는다).
   실제 화면 코드가 아니다 — 서버를 부르지 않고, 이름·숫자는 모두 가짜다. 숫자는 화면끼리 맞춘다:
   학사생 180명, 담당 박선생 26명, 서류 6종 박선생 미제출 5+3+9+2+7+4 = 30건(12명), 전체 미제출 114건(교사별 30+22+18+16+15+13).
   가짜 오늘 = 2027년 3월 8일(월). 정해지지 않은 것은 위 "시안" 안내 줄에 '미정'으로 적는다(학생·교사 화면 안에는 적지 않는다). */

var DOC_TYPES = ['입실 동의서', '학부모 개인정보 동의', '자기소개서', '상담 설문', '결핵검사', '학원 수강증'];
var MISSING = { '입실 동의서': 5, '학부모 개인정보 동의': 3, '자기소개서': 9, '상담 설문': 2, '결핵검사': 7, '학원 수강증': 4 };   // 박선생 담당 26명의 미제출
var MY = [['1', '김가온'], ['1', '박도윤'], ['1', '이서준'], ['2', '이나래'], ['2', '최하늘'], ['2', '정하나'], ['3', '박다솜'], ['3', '오서아']];

function lab(g, n) { return g + '. ' + n; }
function stateChip(kind, text) { return UI.statusPill(kind, text); }
/** 서류 한 줄: 체크(제출) + 이름 + 제출일/상태, 오른쪽 ⋯ */
function docRow(name, on, sub) {
  var box = el('input', { type: 'checkbox' }); if (on) box.checked = true;
  var left = el('label', { class: 'check', style: 'flex:1;min-width:0' }, [box, el('span', { style: 'word-break:keep-all' }, [el('b', { text: name }), sub ? el('span', { class: 'muted', text: '  ' + sub }) : null])]);
  return el('li', { style: 'align-items:center' }, [left, el('button', { type: 'button', class: 'btn secondary row-btn', 'aria-label': name + ' 더보기', text: '⋯' })]);
}
function typeChips(on) {
  return el('div', { class: 'chips' }, DOC_TYPES.map(function (t) { return el('button', { type: 'button', class: 'chip' + (t === on ? ' on' : ''), text: t }); }));
}
function progress(done, total) { return el('div', { class: 'muted', style: 'margin:4px 0 8px', text: '제출 ' + done + ' / ' + total + '명 · 미제출 ' + (total - done) + '명' }); }

/* ═════════ C27 서류 체크리스트 ═════════ */
def('docs-home', 'C27 서류', '학사 교사 홈의 "학기 초 서류" 카드', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '박선생', note: '시안 · 학사 교사 홈에 얹는 카드. 담당 학생의 미제출만 보인다(학생 이름은 담당교사에게만). 2단계의 "서류 미제출"(입퇴실·급식 신청 서류)과 다른 카드다.' });
  m.appendChild(card('학기 초 서류 미제출', [
    row([UI.statusPill('requested', '12명 · 30건')], 'margin:4px 0 8px'),
    el('div', { class: 'muted', text: '2. 이나래 · 3. 박다솜 · 1. 김가온 외 9명' }),
    link('서류 체크리스트 열기', '', 'margin-top:12px')]));
});

def('docs-by-type', 'C27 서류', '서류별 체크 (담당 학생, 미제출만)', {}, function (root) {
  var m = frame(root, { title: '학기 초 서류', who: '박선생', tabs: [{ t: '서류별', on: true }, { t: '학생별' }, { t: '미제출 목록', n: 12 }],
    note: '시안 · 서류 종류를 고르고 담당 학생을 체크한다. 체크 = 제출(그 자리에서 저장), 체크를 풀면 미제출, 해당없음은 줄 끝 [⋯]에서. 담당 26명 · 2027 1학기.' });
  m.appendChild(el('div', { class: 'muted', style: 'margin-bottom:4px', text: '2027 1학기 · 담당 26명' }));
  m.appendChild(typeChips('입실 동의서'));
  m.appendChild(UI.segmented({ options: [{ value: 'miss', label: '미제출만' }, { value: 'all', label: '전체' }], value: 'miss', onchange: function () {} }));
  m.appendChild(progress(21, 26));
  var ul = el('ul', { class: 'list' });
  [['2', '이나래'], ['3', '박다솜'], ['1', '김가온'], ['2', '정하나'], ['1', '이서준']].forEach(function (s) { ul.appendChild(docRow(lab(s[0], s[1]), false, '')); });
  m.appendChild(card('', [ul]));
  m.appendChild(el('div', { class: 'muted', text: '체크하면 오늘(3월 8일)이 제출일로 저장됩니다. 잘못 눌렀으면 체크를 풀어 주세요(기록은 지워지지 않고 이전·이후가 남습니다).' }));
});

def('docs-state-sheet', 'C27 서류', '서류 상태 시트 (제출·미제출·해당없음, 제출일, 메모)', { sheet: true }, function (root) {
  var m = frame(root, { title: '학기 초 서류', who: '박선생', tabs: [{ t: '서류별', on: true }, { t: '학생별' }, { t: '미제출 목록', n: 12 }], note: '시안 · 줄 끝 [⋯]를 누르면 상태 시트가 열린다.' });
  m.appendChild(typeChips('결핵검사'));
  var ul = el('ul', { class: 'list' }); ul.appendChild(docRow(lab('2', '이나래'), false, '')); m.appendChild(card('', [ul]));
  var date = UI.dateField({ label: '제출일', value: '2027-03-08', onchange: function () {} });
  var memo = el('input', { type: 'text', value: '' });
  UI.bottomSheet({ title: '2. 이나래 · 결핵검사', content: el('div', {}, [
    UI.segmented({ options: [{ value: '제출', label: '제출' }, { value: '미제출', label: '미제출' }, { value: '해당없음', label: '해당없음' }], value: '해당없음', onchange: function () {} }),
    el('div', { class: 'muted', style: 'margin-bottom:8px', text: '해당없음은 이 학생에게 이 서류가 필요 없을 때(예: 학원 수강증을 내지 않는 학생)입니다.' }),
    date, UI.field('메모 (선택)', memo, { hint: '길게 쓰지 않습니다.' })]),
    actions: [{ text: '닫기', kind: 'secondary', onclick: function () {} }, { text: '저장', onclick: function () {} }], onclose: function () {} }).open();
});

def('docs-by-student', 'C27 서류', '학생별 서류 (한 명의 서류 전부)', {}, function (root) {
  var m = frame(root, { title: '학기 초 서류', who: '박선생', tabs: [{ t: '서류별' }, { t: '학생별', on: true }, { t: '미제출 목록', n: 12 }], note: '시안 · 학생 한 명을 찾으면 서류 6종을 한 번에 본다(면담하면서 확인할 때).' });
  m.appendChild(studentPick('학생', 'ㅇㄴㄹ'));
  var ul = el('ul', { class: 'list' });
  [['입실 동의서', '제출', '3월 2일'], ['학부모 개인정보 동의', '제출', '3월 2일'], ['자기소개서', '미제출', ''], ['상담 설문', '제출', '3월 5일'], ['결핵검사', '미제출', ''], ['학원 수강증', '해당없음', '']].forEach(function (r) {
    var kind = r[1] === '제출' ? 'confirmed' : (r[1] === '미제출' ? 'requested' : 'mute');
    ul.appendChild(el('li', { style: 'align-items:center' }, [el('div', { style: 'min-width:0;word-break:keep-all' }, [el('b', { text: r[0] }), r[2] ? el('div', { class: 'muted', text: '제출일 ' + r[2] }) : null]), UI.statusPill(kind, r[1])]));
  });
  m.appendChild(card('2. 이나래 · 미제출 2건', [ul, link('상태 바꾸기', 'secondary', 'margin-top:8px')]));
});

def('docs-unsubmitted', 'C27 서류', '미제출 목록 (학생별로 모은 것)', {}, function (root) {
  var m = frame(root, { title: '학기 초 서류', who: '박선생', tabs: [{ t: '서류별' }, { t: '학생별' }, { t: '미제출 목록', on: true, n: 12 }], note: '시안 · 담당 학생 중 미제출이 있는 학생만, 많은 순서로. 서류 이름 칩을 누르면 그 서류만 거른다.' });
  m.appendChild(el('div', { class: 'muted', style: 'margin-bottom:8px', text: '12명 · 30건' }));
  m.appendChild(typeChips(''));
  var ul = el('ul', { class: 'list' });
  [['2', '이나래', ['자기소개서', '결핵검사', '입실 동의서']], ['3', '박다솜', ['자기소개서', '결핵검사']], ['1', '김가온', ['입실 동의서', '학원 수강증']], ['2', '정하나', ['자기소개서', '결핵검사']], ['1', '이서준', ['입실 동의서']], ['2', '최하늘', ['자기소개서']]].forEach(function (r) {
    ul.appendChild(el('li', { style: 'align-items:flex-start' }, [el('div', { style: 'min-width:0;word-break:keep-all' }, [el('b', { text: lab(r[0], r[1]) }), el('div', { class: 'muted', text: r[2].join(' · ') })]), UI.statusPill('requested', r[2].length + '건')]));
  });
  m.appendChild(card('', [ul, link('더 보기(6명)', 'secondary', 'margin-top:8px')]));
});

def('docs-summary', 'C27 서류', '관리자 서류 진행 (서류별·담당교사별)', {}, function (root) {
  var m = frame(root, { title: '학기 초 서류', who: '관리자', tabs: [{ t: '진행', on: true }, { t: '서류 종류' }], note: '시안 · 관리자 화면. 학사생 180명 전체의 진행과 담당교사별 미제출(독촉할 곳). 학생 이름은 없다(숫자만).' });
  var t1 = el('table', { class: 'data compact' }, [el('thead', {}, [el('tr', {}, ['서류', '제출', '미제출', '해당없음'].map(function (h) { return el('th', { text: h }); }))]),
    el('tbody', {}, [['입실 동의서', 171, 9, 0], ['학부모 개인정보 동의', 168, 12, 0], ['자기소개서', 150, 30, 0], ['상담 설문', 175, 5, 0], ['결핵검사', 130, 38, 12], ['학원 수강증', 90, 20, 70]].map(function (r) {
      return el('tr', {}, r.map(function (v) { return el('td', { text: String(v) }); })); }))]);
  m.appendChild(el('h2', { text: '서류별 (학사생 180명)', style: 'margin:4px 0 8px' }));
  m.appendChild(el('div', { class: 'tablewrap' }, [t1]));
  var t2 = el('table', { class: 'data compact' }, [el('thead', {}, [el('tr', {}, ['담당교사', '담당 학생', '미제출 건수'].map(function (h) { return el('th', { text: h }); }))]),
    el('tbody', {}, [['박선생', 26, 30], ['김선생', 31, 22], ['이선생', 30, 18], ['최선생', 29, 16], ['정선생', 32, 15], ['한선생', 32, 13]].map(function (r) { return el('tr', {}, r.map(function (v) { return el('td', { text: String(v) }); })); })
      .concat([el('tr', { class: 'total' }, ['전체', 180, 114].map(function (v) { return el('td', { text: String(v) }); }))]))]);
  m.appendChild(el('h2', { text: '담당교사별 미제출', style: 'margin:16px 0 8px' }));
  m.appendChild(el('div', { class: 'tablewrap' }, [t2]));
  m.appendChild(el('div', { class: 'muted', text: '표는 옆으로 밀 수 있습니다(첫 열은 고정). 합계 줄은 굵은 글씨 + 회색 바탕.' }));
});

def('docs-types', 'C27 서류', '관리자 서류 종류 관리 (추가·이름·순서·취소, 삭제 없음)', {}, function (root) {
  var m = frame(root, { title: '학기 초 서류', who: '관리자', tabs: [{ t: '진행' }, { t: '서류 종류', on: true }], bar: [{ text: '+ 서류 종류 추가' }],
    note: '시안 · 관리자만. 서류 종류는 지우지 않고 [취소]로 끈다(취소해도 이미 받은 제출 기록은 남는다).' });
  m.appendChild(el('div', { class: 'notice info', text: '서류 종류는 학기마다 새로 만들지 않아도 됩니다. 학기가 바뀌면 학생별 제출 표시만 새로 시작합니다.' }));
  var ul = el('ul', { class: 'list' });
  DOC_TYPES.forEach(function (t, i) {
    ul.appendChild(el('li', { style: 'align-items:center' }, [el('div', { style: 'min-width:0;word-break:keep-all' }, [el('b', { text: (i + 1) + '. ' + t }), el('div', { class: 'muted', text: i === 4 ? '입실 전 결핵 검진 결과' : '' })]),
      row([el('button', { type: 'button', class: 'btn secondary row-btn', 'aria-label': t + ' 위로', text: '▲' }), el('button', { type: 'button', class: 'btn secondary row-btn', 'aria-label': t + ' 아래로', text: '▼' }), el('button', { type: 'button', class: 'btn secondary row-btn', text: '고치기' })], 'flex-wrap:nowrap')]));
  });
  m.appendChild(card('', [ul]));
  m.appendChild(el('h2', { text: '취소된 종류', style: 'margin:16px 0 8px' }));
  m.appendChild(card('', [el('ul', { class: 'list' }, [el('li', { style: 'align-items:center' }, [el('div', { style: 'word-break:keep-all' }, [el('b', { text: '건강 설문' }), el('div', { class: 'muted', text: '작년까지 사용' })]), UI.statusPill('canceled', '취소됨')])])]));
});

def('docs-type-edit', 'C27 서류', '서류 종류 추가·고치기 시트', { sheet: true }, function (root) {
  var m = frame(root, { title: '학기 초 서류', who: '관리자', tabs: [{ t: '진행' }, { t: '서류 종류', on: true }], bar: [{ text: '+ 서류 종류 추가' }], note: '시안 · [+ 서류 종류 추가] 또는 [고치기]를 누르면 열린다.' });
  var name = el('input', { type: 'text', value: '' }), desc = el('input', { type: 'text', value: '' });
  var f = UI.field('이름', name, { hint: '이미 있는 서류 이름과 같을 수 없습니다.' });
  UI.bottomSheet({ title: '서류 종류 추가', content: el('div', {}, [f, UI.field('설명 (선택)', desc, { hint: '교사가 무엇을 받는 서류인지 알 수 있게 한 줄로.' })]),
    actions: [{ text: '닫기', kind: 'secondary', onclick: function () {} }, { text: '추가', onclick: function () {} }], onclose: function () {} }).open();
});

/* ═════════ C28 프로그램 + 참가자 ═════════ */
var SAT_BLOCKS = [{ seq: 1, start: '09:00', end: '12:00', label: '①' }, { seq: 2, start: '14:00', end: '15:30', label: '②' }, { seq: 3, start: '15:30', end: '17:00', label: '③' }];

function progCard(name, date, blocks, n, state, kind, note) {
  var c = card('', [row([el('b', { text: name }), UI.statusPill(kind, state)], 'justify-content:space-between;margin-bottom:4px'),
    el('div', { class: 'muted', style: 'word-break:keep-all', text: date + ' · ' + blocks }), el('div', { class: 'muted', text: '참가자 ' + n + '명' + (note ? ' · ' + note : '') }),
    row([el('button', { type: 'button', class: 'btn secondary row-btn', text: '열기' })], 'margin-top:8px')]);
  return c;
}
def('program-list', 'C28 프로그램', '프로그램 목록 (예정·지난·취소)', {}, function (root) {
  var m = frame(root, { title: '학사 프로그램', who: '박선생', bar: [{ text: '+ 프로그램 추가' }],
    note: '시안 · 학사 교사·관리자가 만들고, 출결 담당은 목록만 본다. 프로그램 하나 = 날짜 하나(여러 날이면 날짜마다 하나).' });
  m.appendChild(UI.segmented({ options: [{ value: 'up', label: '예정' }, { value: 'past', label: '지난' }, { value: 'off', label: '취소' }], value: 'up', onchange: function () {} }));
  m.appendChild(progCard('면접 특강', '4월 17일(토)', '②③ 14:00–17:00', 33, '유효', 'confirmed', '사전 특이사항 33건'));
  m.appendChild(progCard('체험학습', '5월 8일(토)', '하루 종일', 124, '유효', 'confirmed', '사전 특이사항 124건'));
  m.appendChild(el('div', { class: 'muted', text: '참가자를 넣으면 그 시간의 사전 특이사항("학사 내 프로그램")이 학생마다 자동으로 생깁니다.' }));
});

def('program-add', 'C28 프로그램', '프로그램 입력 (이름·날짜·시간·참가자)', {}, function (root) {
  var m = frame(root, { title: '프로그램 추가', who: '박선생', bar: [{ text: '취소', kind: 'secondary' }, { text: '저장' }],
    note: '시안 · 이름·날짜·시간(블록)을 정하고 참가자를 담는다. [저장]하면 확인창에서 몇 명에게 특이사항이 생기는지 보여 준다. 미정: 같은 시간에 이미 특이사항이 있는 학생을 어떻게 할지(확인창 참고).' });
  m.appendChild(card('', [UI.field('프로그램 이름', el('input', { type: 'text', value: '면접 특강' }), { hint: '출석부와 특이사항에 "학사 내 프로그램"으로 보입니다.' }),
    UI.dateField({ label: '날짜', value: '2027-04-17', onchange: function () {} })]));
  m.appendChild(card('시간(블록)', [UI.blockChips({ blocks: SAT_BLOCKS, value: { all: false, seqs: [2, 3] }, onchange: function () {} }), el('div', { class: 'muted', text: '4월 17일(토) ②③ 14:00–17:00' })]));
  m.appendChild(card('참가자 33명', [
    el('div', { class: 'muted', style: 'margin-bottom:8px', text: '1학년 12명 · 2학년 14명 · 3학년 7명' }),
    row([el('button', { type: 'button', class: 'btn', text: '학년·반으로 담기' }), el('button', { type: 'button', class: 'btn secondary', text: '이름으로 찾기' })], 'margin-bottom:8px'),
    el('div', { class: 'muted', text: '담은 학생을 빼려면 저장 뒤 프로그램을 열어 [빼기]를 누릅니다.' })]));
  m.appendChild(card('', [UI.field('메모 (선택)', el('textarea', { rows: '3', style: 'min-height:96px', placeholder: '장소·준비물 등' }))]));
});

def('program-pick', 'C28 프로그램', '참가자 담기 시트 (학년·반으로 한꺼번에)', { sheet: true }, function (root) {
  var m = frame(root, { title: '프로그램 추가', who: '박선생', bar: [{ text: '취소', kind: 'secondary' }, { text: '저장' }], note: '시안 · [학년·반으로 담기]를 누르면 열린다. 체험학습처럼 100명이 넘어도 반 단위로 담는다.' });
  m.appendChild(card('참가자 33명', [el('div', { class: 'muted', text: '1학년 12명 · 2학년 14명 · 3학년 7명' })]));
  var klass = el('div', { class: 'chips' }, ['1반', '2반', '3반', '4반', '5반', '6반'].map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === 2 ? ' on' : ''), text: t }); }));
  var sum = el('div', { class: 'notice info', text: '2학년 3반 학사생 9명을 담습니다. 이미 담은 학생 2명은 빼고 7명이 새로 담깁니다.' });
  UI.bottomSheet({ title: '참가자 담기', content: el('div', {}, [
    UI.segmented({ options: [{ value: '1', label: '1학년' }, { value: '2', label: '2학년' }, { value: '3', label: '3학년' }], value: '2', onchange: function () {} }), klass,
    checkRow('기숙사생만', false), sum]),
    actions: [{ text: '닫기', kind: 'secondary', onclick: function () {} }, { text: '7명 담기', onclick: function () {} }], onclose: function () {} }).open();
});

def('program-confirm', 'C28 프로그램', '프로그램 저장 확인 (특이사항이 몇 건 생기는지)', { sheet: true }, function (root) {
  var m = frame(root, { title: '프로그램 추가', who: '박선생', bar: [{ text: '취소', kind: 'secondary' }, { text: '저장' }], note: '시안 · 저장 전 확인. 미정: 같은 시간에 이미 특이사항이 있는 학생(여기서는 제안값 "그대로 두고 프로그램 특이사항을 따로 만듦")을 어떻게 처리할지.' });
  m.appendChild(card('프로그램', [el('b', { text: '면접 특강' }), el('div', { class: 'muted', text: '4월 17일(토) ②③ 14:00–17:00 · 참가자 33명' })]));
  UI.confirmSheet({ title: '프로그램을 저장할까요?', lead: '4월 17일(토) 14:00–17:00 · 면접 특강',
    lines: ['참가자 33명에게 사전 특이사항("학사 내 프로그램")이 만들어집니다.', '그 시간에 이미 특이사항이 있는 학생 2명: 그대로 두고 프로그램 특이사항을 따로 만듭니다.', '출석부의 그 시간 칸에는 \'내부\'(학사 내 프로그램)로 표시됩니다.'],
    confirmText: '프로그램 저장', onconfirm: function () {} });
});

def('program-detail', 'C28 프로그램', '프로그램 열기 (참가자 목록, 빼기·프로그램 취소)', {}, function (root) {
  var m = frame(root, { title: '면접 특강', who: '박선생', bar: [{ text: '프로그램 취소', kind: 'danger' }],
    note: '시안 · 참가자를 빼면 그 학생의 특이사항만 취소(기록은 남음). 프로그램 취소는 참가자 전체의 특이사항도 함께 취소한다(같은 저장 안에서).' });
  m.appendChild(card('', [row([el('b', { text: '면접 특강' }), UI.statusPill('confirmed', '유효')], 'justify-content:space-between'),
    el('div', { class: 'muted', text: '4월 17일(토) ②③ 14:00–17:00' }), el('div', { class: 'muted', text: '참가자 33명 · 사전 특이사항 33건(확정)' })]));
  m.appendChild(studentPick('참가자 찾기', ''));
  var ul = el('ul', { class: 'list' });
  [['1', '김가온'], ['1', '박도윤'], ['2', '이나래'], ['2', '최하늘'], ['3', '박다솜']].forEach(function (s) {
    ul.appendChild(el('li', { style: 'align-items:center' }, [el('div', { style: 'word-break:keep-all' }, [el('b', { text: lab(s[0], s[1]) }), el('div', { class: 'muted', text: '특이사항 확정' })]), el('button', { type: 'button', class: 'btn secondary row-btn', text: '빼기' })]));
  });
  m.appendChild(card('참가자 (33명 중 5명)', [ul, link('더 보기(28명)', 'secondary', 'margin-top:8px')]));
});

def('program-cancel', 'C28 프로그램', '프로그램 취소 확인 (사유 입력, 특이사항도 함께 취소)', { sheet: true }, function (root) {
  frame(root, { title: '면접 특강', who: '박선생', bar: [{ text: '프로그램 취소', kind: 'danger' }], note: '시안 · 사유를 적어야 [취소 처리]가 켜진다(rules 6절). 기록은 지우지 않고 "취소"로 남긴다.' });
  UI.confirmWithReason({ title: '프로그램을 취소할까요?', message: '면접 특강(4월 17일) 참가자 33명의 사전 특이사항도 함께 "취소"로 바뀝니다. 기록은 지워지지 않고 남습니다.', reasonLabel: '사유', confirmText: '취소 처리', danger: true, onconfirm: function () {} });
});

/* ═════════ 실행 ═════════ */
function renderScreen(id) {
  var s = SCREENS[id];
  var root = document.getElementById('app');
  if (!s) {
    root.appendChild(el('main', {}, [el('h1', { text: 'D12 시안 목록 (가짜 이름 · 정적 미리보기)' })].concat(ORDER.map(function (k) { return el('p', {}, [el('a', { href: '#' + k, text: SCREENS[k].group + ' · ' + SCREENS[k].label })]); }))));
    return;
  }
  s.fn(root);
  document.title = s.label;
}
window.addEventListener('hashchange', function () { location.reload(); });
renderScreen(location.hash.replace('#', ''));
document.body.setAttribute('data-ready', '1');
