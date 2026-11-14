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

/* ═════════ C27 서류 체크리스트 (실제 화면 screen_docs.html 에 맞춘 모양 + 실제에 없는 제안 3장은 `docs-proposal-` 로 표시) ═════════ */
(function () {   // 실제 화면이 자체 <style>로 쓰는 줄·버튼 모양(screen_docs.html)을 시안에도 같게 둔다
  var st = document.createElement('style');
  st.textContent = '.doc-row{padding:10px 0;border-bottom:1px solid var(--line);word-break:keep-all}.doc-row:last-child{border-bottom:0}.doc-line{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}.doc-btns{display:flex;gap:6px;flex-wrap:wrap}.doc-btns button{min-height:48px}.doc-btns button.on{background:var(--accent);color:#fff;border-color:var(--accent)}';
  document.head.appendChild(st);
})();
function docBtns(cur, disabled) {
  var box = el('div', { class: 'doc-btns' });
  ['제출', '미제출', '해당없음'].forEach(function (t) {
    var b = el('button', { type: 'button', class: 'btn secondary' + (cur === t ? ' on' : ''), text: t, 'aria-pressed': cur === t ? 'true' : 'false' });
    if (disabled) b.disabled = true; box.appendChild(b);
  });
  return box;
}
var DOC_STU = [['10405', '이나래', '박선생', { '입실 동의서': '미제출', '자기소개서': '미제출', '결핵검사': '미제출' }], ['20310', '박다솜', '박선생', { '자기소개서': '미제출', '결핵검사': '미제출' }], ['10305', '김가온', '박선생', { '입실 동의서': '미제출', '학원 수강증': '미제출' }], ['20212', '정하나', '박선생', { '자기소개서': '미제출', '결핵검사': '미제출' }]];
function docHead(m, mode, note, withType) {
  var head = card('서류 체크리스트', [el('div', { class: 'muted', text: '2027 1학기 · 서류를 낸 학생을 표시합니다. 표시하지 않은 칸은 "미제출"입니다.' }),
    el('div', { class: 'notice warn', text: '미제출 30건 (학생 12명)' }),
    UI.segmented({ options: [{ value: 'missing', label: '미제출 목록' }, { value: 'type', label: '서류별' }], value: mode, onchange: function () {} })]);
  if (withType) head.appendChild(UI.field('서류 종류', el('select', {}, DOC_TYPES.map(function (t) { var o = el('option', { value: t, text: t }); if (t === '자기소개서') o.selected = true; return o; })), {}));
  m.appendChild(head);
}
def('docs-home', 'C27 서류', '홈의 "서류 체크리스트" 카드 (관리자·출결 담당·학사 교사 홈)', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '박선생', note: '시안(실제 home_*.html에 맞춤) · 홈 카드. 미제출 건수와 학생 수만 보이고(이름 없음) [서류 체크리스트 열기]로 들어간다. 2단계의 "급식·입퇴실 서류" 카드와 다르다.' });
  m.appendChild(card('서류 체크리스트', [row([UI.statusPill('todo', '미제출 30건 · 학생 12명')], 'margin:8px 0'), el('div', { class: 'muted', text: '학기 초 서류(동의서 등)를 냈는지 표시합니다.' }), link('서류 체크리스트 열기', '', 'margin-top:12px')]));
});

def('docs-missing', 'C27 서류', '서류 체크리스트 — 미제출 목록 (학생마다 빠진 서류와 [제출][미제출][해당없음])', {}, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '박선생', note: '시안(실제 screen_docs.html에 맞춤) · 기본 모양. 미제출이 있는 학생만, 빠진 서류마다 상태 버튼 셋(누르는 즉시 저장). 학생은 "학번 이름 · 담당 선생님"으로 보인다(실제 화면 그대로 — 이름 규칙 "1. 김가온"과 다름).' });
  docHead(m, 'missing');
  var body = card('', []);
  DOC_STU.forEach(function (r) {
    var rw = el('div', { class: 'doc-row' }, [el('b', { text: r[0] + ' ' + r[1] }), el('span', { class: 'muted', text: ' · 담당 ' + r[2] })]);
    Object.keys(r[3]).forEach(function (t) { rw.appendChild(el('div', { class: 'doc-line' }, [el('span', { text: t }), docBtns(r[3][t], false)])); });
    body.appendChild(rw);
  });
  m.appendChild(body);
});

def('docs-by-type', 'C27 서류', '서류 체크리스트 — 서류별 (서류 종류를 고르면 학생 줄마다 상태 버튼)', {}, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '박선생', note: '시안(실제에 맞춤) · [서류별]에서는 서류 종류를 고르는 `select`가 생기고 학생 줄마다 [제출][미제출][해당없음].' });
  docHead(m, 'type', '', true);
  var body = card('', []);
  [['10405', '이나래', '미제출'], ['20310', '박다솜', '미제출'], ['10305', '김가온', '제출'], ['20212', '정하나', '미제출'], ['10312', '이서준', '제출'], ['20218', '최하늘', '해당없음']].forEach(function (r) {
    body.appendChild(el('div', { class: 'doc-row' }, [el('b', { text: r[0] + ' ' + r[1] }), el('span', { class: 'muted', text: ' · 담당 박선생' }), docBtns(r[2], false)]));
  });
  m.appendChild(body);
});

def('docs-readonly', 'C27 서류', '서류 체크리스트 — 출결 담당 보기만 (버튼이 꺼져 있다)', {}, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '정선생', note: '정선생(출결 담당) 화면 · 출결 담당은 학사생 전체를 보지만 표시는 못 한다(`doc.view`만, `doc.edit` 없음) → 버튼이 꺼지고 안내 한 줄.' });
  docHead(m, 'missing');
  var body = card('', [el('div', { class: 'muted', text: '보기만 할 수 있습니다. 표시는 담당 선생님·관리자가 합니다.' })]);
  DOC_STU.slice(0, 3).forEach(function (r) {
    var rw = el('div', { class: 'doc-row' }, [el('b', { text: r[0] + ' ' + r[1] }), el('span', { class: 'muted', text: ' · 담당 ' + r[2] })]);
    Object.keys(r[3]).forEach(function (t) { rw.appendChild(el('div', { class: 'doc-line' }, [el('span', { text: t }), docBtns(r[3][t], true)])); });
    body.appendChild(rw);
  });
  m.appendChild(body);
});

def('docs-types', 'C27 서류', '서류 종류 관리 (관리자, 칸마다 이름·설명·순서·[저장]·[끄기])', {}, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '관리자', note: '시안(실제에 맞춤) · 서류 체크리스트 화면 맨 아래 관리자 카드. 서류 종류마다 이름·설명·순서 입력과 [저장]·[끄기](삭제 없음), 맨 아래 새 서류 추가. 순서는 숫자를 직접 적는다. 고칠 점: 실제 화면의 입력칸은 UI.field로 감싸이지 않아 높이가 21px이라(48px 미만) 이 시안은 감싼 모양으로 그렸다.' });
  docHead(m, 'missing');
  var tc = card('서류 종류 관리', [el('div', { class: 'muted', text: '입실 동의서, 개인정보 동의서 등. 끄면 목록에서 사라지지만 제출 기록은 남습니다.' })]);
  DOC_TYPES.slice(0, 3).forEach(function (t, i) {
    tc.appendChild(el('div', { class: 'doc-row' }, [UI.field('서류 이름', el('input', { type: 'text', value: t })), UI.field('설명', el('input', { type: 'text', value: i === 0 ? '입실 전 서명 받은 동의서' : '' })), UI.field('순서', el('input', { type: 'text', value: String(i + 1) })),
      el('div', { class: 'doc-line' }, [el('button', { type: 'button', class: 'btn secondary', text: '저장' }), el('button', { type: 'button', class: 'btn secondary', text: '끄기' })])]));
  });
  tc.appendChild(el('div', { class: 'doc-row' }, [el('b', { text: '새 서류' }), UI.field('새 서류 이름', el('input', { type: 'text', placeholder: '예: 입실 동의서' })), UI.field('설명(선택)', el('input', { type: 'text' })), el('div', { class: 'doc-line' }, [el('button', { type: 'button', class: 'btn', text: '서류 추가' })])]));
  m.appendChild(tc);
});

def('docs-type-off', 'C27 서류', '서류 종류 끄기 확인 (삭제 아님)', { sheet: true }, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '관리자', note: '시안(실제에 맞춤) · [끄기]를 누르면 확인창.' });
  docHead(m, 'missing');
  UI.confirmSheet({ title: '"결핵검사"을(를) 끌까요?', lines: ['목록에서 사라집니다.', '이미 표시한 제출 기록은 지워지지 않습니다.'], confirmText: '끄기', danger: true, onconfirm: function () {} });
});

/* ───── 아래 셋은 시안에만 있고 실제 화면에 없다(제안, 꼭 필요한지는 총괄 판단). 이름이 docs-proposal- 로 시작한다 ───── */
def('docs-proposal-by-student', 'C27 제안(실제와 다름)', '제안: 학생별 보기 (한 학생의 서류 전부) — 실제 화면에 없음', {}, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '박선생', tabs: [{ t: '서류별' }, { t: '학생별', on: true }, { t: '미제출 목록', n: 12 }], note: '실제와 다름(제안) · 면담하면서 한 학생의 서류 6종을 한눈에 보는 [학생별] 탭. 실제 화면에는 없다(미제출 목록·서류별 둘뿐).' });
  m.appendChild(studentPick('학생', 'ㅇㄴㄹ'));
  var ul = el('ul', { class: 'list' });
  [['입실 동의서', '제출', '3월 2일'], ['학부모 개인정보 동의', '제출', '3월 2일'], ['자기소개서', '미제출', ''], ['상담 설문', '제출', '3월 5일'], ['결핵검사', '미제출', ''], ['학원 수강증', '해당없음', '']].forEach(function (r) {
    var kind = r[1] === '제출' ? 'confirmed' : (r[1] === '미제출' ? 'requested' : 'mute');
    ul.appendChild(el('li', { style: 'align-items:center' }, [el('div', { style: 'min-width:0;word-break:keep-all' }, [el('b', { text: r[0] }), r[2] ? el('div', { class: 'muted', text: '제출일 ' + r[2] }) : null]), UI.statusPill(kind, r[1])]));
  });
  m.appendChild(card('이나래 · 미제출 2건', [ul]));
});
def('docs-proposal-state-sheet', 'C27 제안(실제와 다름)', '제안: [⋯] 상태 시트 (제출일·메모) — 실제 화면에 없음', { sheet: true }, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '박선생', note: '실제와 다름(제안) · 제출일·메모를 남기는 시트. 실제 화면은 [제출][미제출][해당없음] 버튼만 있고 제출일·메모를 받지 않는다(탭에는 `submitted_date`·`memo` 열이 있다).' });
  docHead(m, 'type', '', true);
  UI.bottomSheet({ title: '이나래 · 결핵검사', content: el('div', {}, [UI.segmented({ options: [{ value: '제출', label: '제출' }, { value: '미제출', label: '미제출' }, { value: '해당없음', label: '해당없음' }], value: '제출', onchange: function () {} }),
    UI.dateField({ label: '제출일', value: '2027-03-08', onchange: function () {} }), UI.field('메모 (선택)', el('input', { type: 'text', value: '' }), {})]),
    actions: [{ text: '닫기', kind: 'secondary', onclick: function () {} }, { text: '저장', onclick: function () {} }], onclose: function () {} }).open();
});
def('docs-proposal-summary', 'C27 제안(실제와 다름)', '제안: 관리자 서류 진행 (서류별·담당교사별 숫자) — 실제 화면에 없음', {}, function (root) {
  var m = frame(root, { title: '서류 체크리스트', who: '관리자', note: '실제와 다름(제안) · 관리자가 어느 선생님이 서류를 덜 받았는지 한눈에 보는 표. 실제 화면에는 없다(관리자도 미제출 목록·서류별로 본다). 학생 이름 없이 숫자만.' });
  var t1 = el('table', { class: 'data compact' }, [el('thead', {}, [el('tr', {}, ['서류', '제출', '미제출', '해당없음'].map(function (h) { return el('th', { text: h }); }))]),
    el('tbody', {}, [['입실 동의서', 171, 9, 0], ['학부모 개인정보 동의', 168, 12, 0], ['자기소개서', 150, 30, 0], ['상담 설문', 175, 5, 0], ['결핵검사', 130, 38, 12], ['학원 수강증', 90, 20, 70]].map(function (r) { return el('tr', {}, r.map(function (v) { return el('td', { text: String(v) }); })); }))]);
  m.appendChild(el('h2', { text: '서류별 (학사생 180명)', style: 'margin:4px 0 8px' })); m.appendChild(el('div', { class: 'tablewrap' }, [t1]));
  var t2 = el('table', { class: 'data compact' }, [el('thead', {}, [el('tr', {}, ['담당교사', '담당 학생', '미제출 건수'].map(function (h) { return el('th', { text: h }); }))]),
    el('tbody', {}, [['박선생', 26, 30], ['김선생', 31, 22], ['이선생', 30, 18], ['최선생', 29, 16], ['정선생', 32, 15], ['한선생', 32, 13]].map(function (r) { return el('tr', {}, r.map(function (v) { return el('td', { text: String(v) }); })); })
      .concat([el('tr', { class: 'total' }, ['전체', 180, 114].map(function (v) { return el('td', { text: String(v) }); }))]))]);
  m.appendChild(el('h2', { text: '담당교사별 미제출', style: 'margin:16px 0 8px' })); m.appendChild(el('div', { class: 'tablewrap' }, [t2]));
});

/* ═════════ C28 프로그램 + 참가자 (코딩B가 만든 실제 화면 #173에 맞춘 모양: [목록|새 프로그램] 탭, 카드 안 펼치기, 아래 바는 입력에서만) ═════════ */
var SAT_BLOCKS = [{ seq: 1, start: '09:00', end: '12:00', label: '①' }, { seq: 2, start: '14:00', end: '15:30', label: '②' }, { seq: 3, start: '15:30', end: '17:00', label: '③' }];

function programTabs(on) {
  return card('', [UI.segmented({ options: [{ value: 'list', label: '목록' }, { value: 'entry', label: '새 프로그램' }], value: on, onchange: function () {} })]);
}
/** 학생 여러 명 고르기(입력과 [참가자 더하기] 시트가 같이 쓴다): 학년·반으로 한꺼번에 + 검색·체크로 한 명씩, 고른 수를 늘 보인다 */
function studentMultiMock(count) {
  var box = el('div');
  box.appendChild(el('div', { class: 'chips', role: 'group', 'aria-label': '학년' }, ['1학년', '2학년', '3학년'].map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === 1 ? ' on' : ''), text: t }); })));
  box.appendChild(el('div', { class: 'chips', style: 'margin-top:8px', role: 'group', 'aria-label': '반' }, ['1반', '2반', '3반', '4반', '5반', '6반'].map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === 2 ? ' on' : ''), text: t }); })));
  box.appendChild(checkRow('기숙사생만', false));
  box.appendChild(el('div', { class: 'muted', style: 'margin:6px 0;word-break:keep-all', text: '2학년 3반 학사생 9명 · 이미 담은 학생 2명은 빼고 7명이 새로 담깁니다.' }));
  box.appendChild(el('button', { type: 'button', class: 'btn', text: '이 반 담기' }));
  box.appendChild(UI.field('학생 찾기', el('input', { type: 'text', placeholder: '이름·학번으로 찾기' })));
  box.appendChild(el('div', { class: 'muted', style: 'margin:4px 0', text: '고른 학생 ' + count + '명' }));
  var list = el('div', { style: 'max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px 8px' });
  [['2-3 1번', '박다솜'], ['2-3 2번', '이나래'], ['2-3 4번', '최하늘'], ['2-3 5번', '정하나']].forEach(function (r) { list.appendChild(checkRow(r[0] + ' ' + r[1], true)); });
  box.appendChild(list);
  box.appendChild(el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:4px', text: '모두 비우기' }));
  return box;
}
function progCard(name, dateBlocks, n, extra) {
  var c = card('', []);
  c.appendChild(el('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap' }, [el('h2', { style: 'margin:0', text: name }), extra && extra.canceled ? UI.statusPill('canceled', '취소됨') : null]));
  c.appendChild(el('div', { class: 'muted', style: 'word-break:keep-all', text: dateBlocks + (extra && extra.canceled ? '' : ' · 참가자 ' + n + '명 · 사전 특이사항 ' + n + '건') }));
  if (extra && extra.open) {
    c.appendChild(el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:8px', text: '참가자 접기' }));
    var ul = el('ul', { class: 'list', style: 'margin-top:8px' });
    [['1-3 5번', '김가온'], ['1-2 7번', '박도윤'], ['2-3 1번', '박다솜'], ['2-3 4번', '최하늘']].forEach(function (r) {
      ul.appendChild(el('li', { style: 'display:flex;align-items:center;gap:8px;justify-content:space-between' }, [el('span', { style: 'flex:1 1 auto', text: r[0] + ' ' + r[1] }), el('button', { type: 'button', class: 'btn secondary row-btn', style: 'flex:0 0 auto;white-space:nowrap;margin-top:0', text: '빼기', 'aria-label': r[1] + ' 참가 빼기' })]));
    });
    c.appendChild(ul);
  } else if (!(extra && extra.canceled)) c.appendChild(el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:8px', text: '참가자 보기' }));
  if (!(extra && extra.canceled)) c.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, [el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:0', text: '참가자 더하기' }), el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:0', text: '프로그램 취소' })]));
  return c;
}
function programList(root, open) {
  var m = frame(root, { title: '학사 프로그램', who: '박선생',
    note: '시안(실제 화면 #173에 맞춤) · 학사 교사·관리자는 [목록|새 프로그램] 탭, 출결 담당은 목록만(탭·[참가자 더하기]·[프로그램 취소]·[빼기]가 없다). 프로그램 하나 = 날짜 하나. 참가자는 카드 안에서 펼쳐 본다(따로 상세 화면이 없다).' });
  m.appendChild(programTabs('list'));
  m.appendChild(el('div', { class: 'muted', style: 'margin-bottom:8px', text: '2027 1학기' }));
  m.appendChild(UI.segmented({ options: [{ value: 'up', label: '예정 2' }, { value: 'past', label: '지난 1' }, { value: 'off', label: '취소 1' }], value: 'up', onchange: function () {} }));
  m.appendChild(progCard('면접 특강', '4월 17일(토) · ②③ 14:00–17:00', 33, { open: open }));
  m.appendChild(progCard('체험학습', '5월 8일(토) · 전체 시간', 124));
}
def('program-list', 'C28 프로그램', '프로그램 목록 (탭·예정/지난/취소, 카드 안 참가자 보기)', {}, function (root) { programList(root, false); });
def('program-card-open', 'C28 프로그램', '프로그램 카드 펼침 (참가자 줄마다 빼기)', {}, function (root) { programList(root, true); });

def('program-add', 'C28 프로그램', '새 프로그램 (이름·날짜·시간·참가 학생)', {}, function (root) {
  var m = frame(root, { title: '학사 프로그램', who: '박선생', bar: [{ text: '확인하고 저장' }],
    note: '시안(실제 화면 #173에 맞춤) · 이름·날짜·시간(블록)을 정하고 참가 학생을 학년·반 단위로 담는다. 아래 바 [확인하고 저장]은 이름·참가 학생이 있어야 켜진다. 같은 시간에 이미 특이사항이 있는 학생은 확인창에서 알려 준다.' });
  m.appendChild(programTabs('entry'));
  m.appendChild(card('', [UI.field('프로그램 이름', el('input', { type: 'text', value: '면접 특강', maxlength: '60' }))]));
  m.appendChild(card('', [UI.dateField({ label: '날짜', value: '2027-04-17', shortcuts: [{ label: '오늘', value: '2027-04-12' }], onchange: function () {} }),
    UI.field('시간', el('div', {}, [UI.blockChips({ blocks: SAT_BLOCKS, value: { all: false, seqs: [2, 3] }, onchange: function () {} })]), { hint: '프로그램이 있는 시간입니다. 그 시간의 출석부 칸에 "내부"로 나옵니다.' })]));
  m.appendChild(card('참가 학생', [studentMultiMock(33)]));
  m.appendChild(card('', [UI.field('메모(선택)', el('input', { type: 'text', maxlength: '200' }))]));
});

def('program-add-more', 'C28 프로그램', '참가자 더하기 시트 (이미 담은 학생은 건너뜀)', { sheet: true }, function (root) {
  programList(root, false);
  UI.bottomSheet({ title: '참가자 더하기', content: studentMultiMock(7), actions: [{ text: '돌아가기', kind: 'secondary', onclick: function () {} }, { text: '더하기', onclick: function () {} }], onclose: function () {} }).open();
});

def('program-confirm', 'C28 프로그램', '프로그램 저장 확인 (겹치는 특이사항 안내)', { sheet: true }, function (root) {
  var m = frame(root, { title: '학사 프로그램', who: '박선생', bar: [{ text: '확인하고 저장' }], note: '시안 · [확인하고 저장]을 누르면 확인창(결정 75②). 같은 시간에 다른 특이사항이 있는 학생은 그대로 두고 프로그램 특이사항을 따로 만든다(경고만, 막지 않음).' });
  m.appendChild(programTabs('entry'));
  UI.confirmSheet({ title: '프로그램을 저장합니다', lead: '면접 특강',
    lines: ['4월 17일(토) · 14:00-15:30;15:30-17:00', '참가 학생 33명에게 사전 특이사항(학사 내 프로그램)이 확정으로 만들어집니다.', '2명은 같은 시간에 다른 특이사항이 있습니다. 그대로 두고 프로그램 특이사항을 따로 만듭니다.'],
    confirmText: '저장', onconfirm: function () {} });
});

def('program-remove', 'C28 프로그램', '참가에서 빼기 확인 (사유 입력)', { sheet: true }, function (root) {
  programList(root, true);
  UI.confirmWithReason({ title: '참가에서 뺍니다', message: '김가온 학생을 "면접 특강"에서 뺍니다. 그 학생의 사전 특이사항도 취소됩니다.', reasonLabel: '사유', confirmText: '빼기', onconfirm: function () {} });
});

def('program-cancel', 'C28 프로그램', '프로그램 취소 확인 (사유 입력, 특이사항도 함께 취소)', { sheet: true }, function (root) {
  programList(root, false);
  UI.confirmWithReason({ title: '프로그램을 취소합니다', message: '면접 특강 · 4월 17일(토). 참가자 33명의 사전 특이사항도 함께 취소됩니다(기록은 남습니다).', reasonLabel: '사유', confirmText: '프로그램 취소', danger: true, onconfirm: function () {} });
});

/* ═════════ C19b 즉시 퇴실 항목(결정 69·78)·C26 입퇴실 세부(결정 74) — 4단계 확인 체크리스트의 사진용 ═════════ */
function s4MoveTabs() { return [{ t: '입퇴실', on: true }, { t: '급식 변경' }, { t: '학생 기록' }]; }
function s4MoveLeave(m) {
  m.appendChild(card('학생', [studentPick('', 'ㅂㄷㅅ')]));
  m.appendChild(card('무엇을', [UI.field('유형', el('div', { class: 'chips' }, [el('button', { type: 'button', class: 'chip', disabled: 'disabled', text: '학사 퇴실' }), el('button', { type: 'button', class: 'chip on', text: '학사 및 기숙사 퇴실' })]))]));
  m.appendChild(card('날짜', [UI.dateField({ label: '적용일', value: '2027-03-12', shortcuts: [{ label: '오늘', value: '2027-03-03' }], onchange: function () {} })]));
}
function ruleItem(name, desc, pills, btns) {   // 실제 screen_outs.html 의 쪽 안 CSS(.out-item 블록, .out-line 가로 나열)를 인라인으로 따라 한다
  return el('li', { class: 'out-item', style: 'display:block' }, [el('div', { class: 'out-line', style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [el('b', { class: 'out-who', style: 'word-break:keep-all', text: name })].concat(pills)),
    desc ? el('div', { class: 'muted', text: desc }) : null,
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, btns.map(function (t) { return el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:0', text: t }); }))]);
}
function ruleList(m) {
  var ul = el('ul', { class: 'list', style: 'margin-top:8px' }, [
    ruleItem('자습 분위기 방해', '', [], ['수정', '끄기', '즉시 퇴실로 정하기']),
    ruleItem('흡연', '', [UI.statusPill('todo', '즉시 퇴실')], ['수정', '끄기', '즉시 퇴실 해제']),
    ruleItem('라면·배달음식', '', [], ['수정', '끄기', '즉시 퇴실로 정하기']),
    ruleItem('미인정 지각', '자동으로 기록됩니다', [UI.statusPill('mute', '자동')], ['수정'])]);
  m.appendChild(card('OUT 항목', [el('div', { class: 'muted', text: '교사가 OUT을 기록할 때 고르는 항목입니다. 지우지 않고 끄기만 합니다(이미 기록된 OUT은 그대로).' }), ul, el('button', { type: 'button', class: 'btn block', style: 'margin-top:12px', text: '항목 추가' })]));
}
def('outs-instant', 'C19b·C26 보충', 'OUT [항목] 탭 — 즉시 퇴실 표시와 [즉시 퇴실로 정하기] (관리자만)', {}, function (root) {
  var m = frame(root, { title: 'OUT', who: '관리자', tabs: [{ t: '기록' }, { t: '퇴실 대상', n: 3 }, { t: '오늘' }, { t: '학기' }, { t: '항목', on: true }],
    note: '시안 · 실제 화면에 맞춤(결정 78). 즉시 퇴실로 정한 항목에만 "즉시 퇴실" 표시가 붙고, 버튼은 [즉시 퇴실 해제]로 바뀐다. 자동 항목에는 이 버튼이 없다.' });
  ruleList(m);
});
def('outs-instant-confirm', 'C19b·C26 보충', '[즉시 퇴실로 정하기] 확인창 (이미 기록된 OUT에도 적용 안내)', { sheet: true }, function (root) {
  var m = frame(root, { title: 'OUT', who: '관리자', tabs: [{ t: '기록' }, { t: '퇴실 대상', n: 3 }, { t: '오늘' }, { t: '학기' }, { t: '항목', on: true }] });
  ruleList(m);
  UI.confirmSheet({ title: '즉시 퇴실 항목으로 정합니다', lead: '라면·배달음식', lines: ['지금부터 기록되는 이 항목의 위반부터 OUT 한 번이 바로 2OUT(퇴실 대상)이 됩니다.', '이미 기록된 위반은 그대로 셉니다(소급하지 않습니다).', '퇴실 확정은 지금처럼 학부모 면담 기록 뒤 관리자가 합니다.'], confirmText: '즉시 퇴실로 정하기', onconfirm: function () {} });
});
def('moves-enter-first', 'C19b·C26 보충', '신규 입실 — 적용일 기본값이 다음 달 1일 (오늘 3월 3일이면 4월 1일)', {}, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: s4MoveTabs(), bar: [{ text: '닫기', kind: 'secondary' }, { text: '입퇴실 신청' }],
    note: '시안 · 입실 유형(학사 입실·기숙사 입실)을 고르면 적용일이 다음 달 1일로 채워진다. 직접 고쳐도 되고, 고친 뒤에는 유형을 바꿔도 다시 채우지 않는다.' });
  m.appendChild(card('학생', [studentPick('', 'ㅂㄷㅅ')]));
  m.appendChild(card('무엇을', [UI.field('유형', el('div', { class: 'chips' }, [el('button', { type: 'button', class: 'chip on', text: '학사 입실' }), el('button', { type: 'button', class: 'chip', text: '학사 퇴실' })]))]));
  m.appendChild(card('날짜', [inputField('신청 일시', 'datetime-local', '2027-03-03T10:45', '신청서를 받은 날짜·시각. 기본값은 지금입니다.'),
    UI.dateField({ label: '적용일', value: '2027-04-01', shortcuts: [{ label: '오늘', value: '2027-03-03' }, { label: '내일', value: '2027-03-04' }], onchange: function () {} })]));
});
def('moves-leave-5day', 'C19b·C26 보충', '퇴실 저장 확인창 — "새 달 5일이 지나 퇴실하면 그달 비용을 냅니다" 안내 (비용 계산 없음)', { sheet: true }, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: s4MoveTabs(), bar: [{ text: '닫기', kind: 'secondary' }, { text: '입퇴실 신청' }] });
  s4MoveLeave(m);
  UI.confirmSheet({ title: '입퇴실을 저장합니다', lead: '3월 12일(금)부터 학사 및 기숙사 퇴실', lines: ['박다솜 학생 (3-2 7번)', '자리 공석', '기숙사 3월 12일 퇴실', '조식 3월 12일 중단', '석식 3월 22일(월) 중단', '서류 미제출로 기록됩니다', '새 달 5일이 지나 퇴실하면 그달 비용을 냅니다'], confirmText: '입퇴실 저장', onconfirm: function () {} });
});


/* ═════════ C26 임시 퇴실(결정 70·77, R18) — 실제 화면 #191·#195에 맞춤 ═════════ */
def('moves-temp-leave', 'C19b·C26 보충', '입퇴실 신청 — [학사 및 기숙사 임시 퇴실]을 고르면 복귀 예정일(필수)과 건강상 안내', {}, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: s4MoveTabs(), bar: [{ text: '닫기', kind: 'secondary' }, { text: '입퇴실 신청' }],
    note: '시안 · 임시 퇴실은 건강상 사유만. 복귀 예정일이 없으면 저장되지 않는다. 급식·자리는 일반 퇴실처럼 정리되고, 다시 들어오는 것은 막지 않는다.' });
  m.appendChild(card('학생', [studentPick('', 'ㅂㄷㅅ')]));
  m.appendChild(card('무엇을', [UI.field('유형', el('div', { class: 'chips' }, [el('button', { type: 'button', class: 'chip', disabled: 'disabled', text: '학사 퇴실' }), el('button', { type: 'button', class: 'chip', text: '학사 및 기숙사 퇴실' }), el('button', { type: 'button', class: 'chip on', text: '학사 및 기숙사 임시 퇴실' })]))]));
  m.appendChild(card('임시 퇴실', [UI.dateField({ label: '복귀 예정일', value: '2027-03-19', onchange: function () {} }),
    el('div', { class: 'notice info', style: 'word-break:keep-all', text: '임시 퇴실은 건강상 사유만 씁니다. 사유 칸에는 건강상 이유(예: 독감 입원)만 적어 주세요. 가정 사정·대회 출전 같은 짧은 부재는 사전 특이사항으로 적습니다.' }),
    el('div', { class: 'muted', style: 'word-break:keep-all', text: '임시 퇴실도 일반 퇴실처럼 급식을 끊고 자리를 비웁니다. 다른 점은 다시 들어오는 것을 막지 않는 것뿐입니다.' })]));
});
function s4TempRow(overdue) {
  return el('div', { style: 'padding:8px 0;border-bottom:1px solid var(--line)' }, [el('div', { text: '3월 5일(금)부터 학사 및 기숙사 퇴실' }),
    el('div', { class: overdue ? 'notice warn' : 'muted', style: 'word-break:keep-all', text: '임시 퇴실 중 · 복귀 예정 3월 12일(금)' + (overdue ? ' (예정일이 지났습니다)' : '') }),
    overdue ? el('button', { type: 'button', class: 'btn secondary', style: 'margin-top:8px', text: '일반 퇴실로 바꾸기' }) : null]);
}
def('moves-temp-convert', 'C19b·C26 보충', '학생 기록 줄 — 임시 퇴실 중·복귀 예정, [일반 퇴실로 바꾸기] 확인 시트', { sheet: true }, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: [{ t: '입퇴실' }, { t: '급식 변경' }, { t: '학생 기록', on: true }] });
  m.appendChild(card('3. 박다솜', [s4TempRow(true)]));
  UI.confirmSheet({ title: '일반 퇴실로 바꿉니다', lead: '3월 5일(금) 임시 퇴실을 일반 퇴실로 바꿉니다', lines: ['박다솜', '재입실 제한은 처음 임시 퇴실한 날(3월 5일(금))부터 셉니다. 2028년 2월 말까지 다시 들어올 수 없습니다.', '급식·자리는 임시 퇴실 때와 같이 이미 정리되어 있어 그대로입니다.', '기록은 지우지 않고 임시 퇴실 신청서를 취소 처리합니다.'], confirmText: '일반 퇴실로 바꾸기', danger: true, onconfirm: function () {} });
});
def('home-temp-overdue', 'C19b·C26 보충', '담당교사 홈 — "복귀 예정일 지남" 카드 (학생을 누르면 학생 기록으로)', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '박선생', note: '시안 · 복귀 예정일이 지난 건강상 임시 퇴실이 있을 때만 나타나는 카드(담당교사·관리자 홈).' });
  m.appendChild(card('복귀 예정일 지남', [el('div', { style: 'word-break:keep-all', text: '임시 퇴실 중인 학생 2명의 복귀 예정일이 지났습니다.' }),
    el('a', { style: 'display:block;padding:10px 0;border-bottom:1px solid var(--line);color:var(--accent)', href: '#', text: '3. 박다솜 · 복귀 예정 3월 12일(금) (3일 지남)' }),
    el('a', { style: 'display:block;padding:10px 0;border-bottom:1px solid var(--line);color:var(--accent)', href: '#', text: '2. 이나래 · 복귀 예정 3월 10일(수) (5일 지남)' }),
    el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: '학생을 눌러 기록에서 [일반 퇴실로 바꾸기]를 누를 수 있습니다. 복귀했다면 입퇴실 신청에서 학사 입실을 기록해 주세요.' })]));
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
