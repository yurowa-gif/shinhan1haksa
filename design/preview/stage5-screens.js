/* D12 정적 시안: 5단계 화면 — F11 출결 결과 정리 격자(C33)·F12 상담일지(C32)·F13 월별 일정(C34, 대략). 브라우저에서 돈다(stage5.js가 stage2-screens.js의 도우미 부분과 이 파일을 합친다).
   실제 화면 코드가 아니다 — 서버를 부르지 않고, 이름·숫자는 모두 가짜다. 숫자는 화면끼리 맞춘다:
   가짜 오늘 = 2027년 3월 15일(월). 격자는 지난주 3월 8일(월)~14일(일), 3월 12일(금)은 운영 안 함. 학사생 3학년 1반 12명을 보인다(실제는 180명, 학년·반 칩으로 거른다).
   정해지지 않은 것은 위 "시안" 안내 줄에 '미정'으로 적는다(교사 화면 안에는 적지 않는다). */

var RG_STUDENTS = [['3-1', 1, '김가온'], ['3-1', 2, '박도윤'], ['3-1', 3, '이서준'], ['3-1', 4, '이나래'], ['3-1', 5, '최하늘'], ['3-1', 6, '정하나'],
  ['3-1', 7, '박다솜'], ['3-1', 8, '오서아'], ['3-1', 9, '한지우'], ['3-1', 10, '윤서진'], ['3-1', 11, '강민서'], ['3-1', 12, '조예린']];
var RG_DAYS = [{ d: 8, w: '월' }, { d: 9, w: '화' }, { d: 10, w: '수' }, { d: 11, w: '목' }, { d: 12, w: '금', off: true }, { d: 13, w: '토' }, { d: 14, w: '일' }];
// 칸: [학생 번호(0부터), 날짜, 위 줄(사전 특이사항 약어·학·가), 결과 기호(×△조, 없으면 ''), 미인정이면 true]
var RG_CELLS = [[0, 9, '학', ''], [0, 11, '병결', '×'], [1, 13, '가', ''], [2, 10, '무지', '△', true], [3, 8, '병조', '조'], [3, 13, '학', ''], [4, 11, '무결', '×', true],
  [5, 9, '병지', '△'], [6, 8, '학', ''], [6, 9, '학', ''], [6, 10, '학', ''], [6, 11, '학', ''], [7, 14, '가', ''], [8, 10, '외부', '']];

function rgFind(si, d) { for (var i = 0; i < RG_CELLS.length; i++) if (RG_CELLS[i][0] === si && RG_CELLS[i][1] === d) return RG_CELLS[i]; return null; }
/** 격자 칸 하나(누르는 칸). 색만으로 알리지 않는다: 미인정은 ⚠ + 굵은 테두리, 운영 안 하는 날은 점선 + '—' */
function rgCell(si, day) {
  var c = rgFind(si, day.d), name = RG_STUDENTS[si][2], cls = 'rg-cell', pre = '', sym = '', label;
  if (day.off) { cls += ' off'; pre = '—'; label = day.d + '일 ' + name + ' 운영 안 함'; }
  else if (c) { pre = c[2]; sym = c[3]; if (sym) cls += ' has'; if (c[4]) cls += ' bad'; label = day.d + '일 ' + name + ' ' + pre + (sym ? ' ' + sym : ''); }
  else label = day.d + '일 ' + name + ' 입력 칸';
  var kids = [];
  if (pre) kids.push(el('span', { class: 'rg-pre', text: pre }));
  if (sym) kids.push(el('span', { class: 'rg-sym', text: sym }));
  var b = el('button', { type: 'button', class: cls, 'aria-label': label }, kids);
  if (day.off) b.setAttribute('aria-disabled', 'true');
  return el('td', {}, [b]);
}
function rgLegend() {
  return el('div', { class: 'muted', style: 'word-break:keep-all;margin-bottom:8px', text: '칸 위 줄 = 사전 특이사항·학(학원)·가(가정), 아래 줄 = 결과 × 결석 · △ 지각 · 조 조퇴. 빈 칸 = 출석(○), 입력할 것이 없습니다. ⚠ 굵은 테두리 = 미인정(자동 1OUT). 회색 점선 = 운영 안 하는 날.' });
}
function rgTabs(on) {
  return card('', [UI.segmented({ label: '화면', value: on, options: [{ value: 'grid', label: '결과 입력' }, { value: 'total', label: '학생별 누적' }], onchange: function () {} })]);
}
function rgFilters(wide) {
  var nodes = [UI.field('학년', el('div', { class: 'chips' }, [el('button', { type: 'button', class: 'chip', text: '1학년' }), el('button', { type: 'button', class: 'chip', text: '2학년' }), el('button', { type: 'button', class: 'chip on', text: '3학년' })])),
    UI.field('반', el('div', { class: 'chips' }, [el('button', { type: 'button', class: 'chip on', text: '1반' }), el('button', { type: 'button', class: 'chip', text: '2반' }), el('button', { type: 'button', class: 'chip', text: '3반' })]))];
  return card('', nodes);
}
function rgArrow(text, label) { return el('button', { type: 'button', class: 'btn secondary', style: 'flex:0 0 auto', 'aria-label': label, text: text }); }

/* ═════════ F11 출결 결과 정리 격자 ═════════ */
def('result-grid-pc', 'F11 결과 정리', '결과 격자 — PC (학생 × 날짜 한 주, 칸을 눌러 결과 입력)', {}, function (root) {
  var m = frame(root, { title: '출결 결과 정리', who: '출결 담당', note: '시안 · PC 권장(휴대폰은 result-grid-phone). 종이 출석부 결과를 주말·월말에 옮겨 적는 화면. 칸을 누르면 result-cell-sheet. 기본 보기는 한 주, [월]은 가로로 밀어 본다(학생 이름 열은 고정).' });
  m.classList.add('wide');
  m.appendChild(rgTabs('grid'));
  m.appendChild(card('', [el('div', { style: 'display:flex;gap:8px;align-items:center' }, [rgArrow('‹', '이전 주'), el('b', { style: 'flex:1;text-align:center', text: '3월 8일(월) ~ 14일(일)' }), rgArrow('›', '다음 주')]),
    el('div', { style: 'margin-top:8px' }, [UI.segmented({ label: '범위', value: 'week', options: [{ value: 'week', label: '주' }, { value: 'month', label: '월' }], onchange: function () {} })]),
    el('div', { class: 'muted', style: 'margin-top:8px', text: '2027 1학기 · 3학년 1반 12명 · 이 주 결과 5건' })]));
  m.appendChild(rgFilters());
  m.appendChild(rgLegend());
  var thead = el('thead', {}, [el('tr', {}, [el('th', { text: '학생' })].concat(RG_DAYS.map(function (d) { return el('th', { text: d.d + '(' + d.w + ')' + (d.off ? ' 운영 안 함' : '') }); })))]);
  var tbody = el('tbody', {}, RG_STUDENTS.map(function (s, i) {
    return el('tr', {}, [el('td', { text: s[0] + ' ' + s[1] + '번 ' + s[2] })].concat(RG_DAYS.map(function (d) { return rgCell(i, d); })));
  }));
  m.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'data rg' }, [thead, tbody])]));
});

def('result-grid-phone', 'F11 결과 정리', '결과 정리 — 휴대폰 (날짜 하나 고르기 → 학생 목록)', {}, function (root) {
  var m = frame(root, { title: '출결 결과 정리', who: '출결 담당', note: '시안 · 휴대폰은 격자가 안 맞아 "날짜 하나 → 학생 줄" 방식. 줄의 버튼이 PC의 칸과 같고 같은 result-cell-sheet가 열린다. 결과가 있는 학생을 위에 모으지 않고 번호 순서를 지킨다(찾기 쉽게).' });
  m.appendChild(rgTabs('grid'));
  m.appendChild(card('', [el('div', { style: 'display:flex;gap:8px;align-items:center' }, [rgArrow('‹', '전날'), el('b', { style: 'flex:1;text-align:center', text: '3월 9일(화)' }), rgArrow('›', '다음 날')]),
    el('div', { class: 'muted', style: 'margin-top:8px', text: '3학년 1반 12명 · 이 날 결과 1건' })]));
  m.appendChild(rgFilters());
  m.appendChild(rgLegend());
  var ul = el('ul', { class: 'list' });
  RG_STUDENTS.forEach(function (s, i) {
    var c = rgFind(i, 9), status;
    if (c && c[3]) status = UI.statusPill(c[4] ? 'todo' : 'byung', c[2] + ' ' + c[3]);
    else if (c) status = UI.statusPill('hak', c[2]);
    else status = el('span', { class: 'muted', text: '출석' });
    ul.appendChild(el('li', { style: 'align-items:center;gap:8px' }, [el('div', { style: 'flex:1 1 auto;min-width:0' }, [el('b', { text: s[1] + '번 ' + s[2] }), el('div', {}, [status])]),
      el('button', { type: 'button', class: 'btn secondary', style: 'flex:0 0 auto;margin-top:0;white-space:nowrap', 'aria-label': s[2] + ' ' + (c && c[3] ? '결과 보기' : '결과 입력'), text: c && c[3] ? '보기' : '결과 입력' })]));
  });
  m.appendChild(card('', [ul]));
});

function rgSheet(opts) {
  var sym = { 결석: '×', 지각: '△', 조퇴: '조' };
  var types = { 결석: ['병결', '미인정결석', '기타'], 지각: ['병지각', '미인정지각', '기타'], 조퇴: ['병조퇴', '미인정조퇴', '기타'] }[opts.result];
  var body = el('div', {}, [
    el('p', { class: 'sheet-lead', text: opts.lead }),
    opts.pre ? el('div', { class: 'notice info', style: 'word-break:keep-all', text: opts.pre }) : null,
    UI.field('결과', UI.segmented({ label: '결과', value: opts.result, options: [{ value: '결석', label: '결석 ×' }, { value: '지각', label: '지각 △' }, { value: '조퇴', label: '조퇴 조' }], onchange: function () {} })),
    UI.field('시간', el('div', {}, [UI.blockChips({ blocks: RG_BLOCKS, value: { all: opts.result === '결석', seqs: opts.result === '결석' ? [] : opts.seqs }, onchange: function () {} })]), { hint: '결석은 전체가 기본입니다. 지각·조퇴는 해당 시간을 고릅니다.' }),
    UI.field('유형', el('div', { class: 'chips' }, types.map(function (t) { return el('button', { type: 'button', class: t === opts.type ? 'chip on' : 'chip', text: t }); })), { hint: '병○○ = 인정, 미인정○○ = 미인정(자동 1OUT).' }),
    UI.field('사유(선택)', el('textarea', { maxlength: '200', text: opts.reason || '' }), { hint: '조퇴 사유는 출석부 메모 칸에도 같이 나옵니다.' }),
    opts.bad ? el('div', { class: 'notice warn', style: 'word-break:keep-all', text: '미인정이라 저장하면 자동으로 1OUT이 기록됩니다(무단 지각·결석·이탈). 담당교사·담임에게 알림이 갑니다.' })
      : el('div', { class: 'muted', style: 'word-break:keep-all', text: '결과는 사전 특이사항(확정)으로 저장됩니다. 잘못 넣으면 취소하고 새로 넣습니다.' })]);
  return UI.bottomSheet({ title: opts.title, content: body, actions: [{ text: '닫기', kind: 'secondary', onclick: function () {} }, { text: '결과 저장', kind: 'primary', onclick: function () {} }] });
}
var RG_BLOCKS = [{ seq: 1, start: '09:00', end: '12:00', label: '①' }, { seq: 2, start: '14:00', end: '15:30', label: '②' }, { seq: 3, start: '15:30', end: '17:00', label: '③' }, { seq: 4, start: '19:00', end: '20:30', label: '④' }, { seq: 5, start: '20:30', end: '23:00', label: '⑤' }];

def('result-cell-sheet', 'F11 결과 정리', '칸을 눌렀을 때 — 결과 → 시간 → 유형 → 사유 (인정: 병결)', { sheet: true }, function (root) {
  var m = frame(root, { title: '출결 결과 정리', who: '출결 담당', note: '시안 · 결과를 고르면 유형 칩이 그 결과의 유형만 남는다(결석: 병결·미인정결석·기타). 저장하면 사전 특이사항(확정)이 만들어져 출석부 칸에 약어가 나온다.' });
  m.appendChild(rgTabs('grid'));
  m.appendChild(rgLegend());
  rgSheet({ title: '결과 입력', lead: '3월 11일(목) · 3-1 1번 김가온', result: '결석', type: '병결', seqs: [], reason: '독감, 병원 진료' }).open();
});
def('result-cell-sheet-bad', 'F11 결과 정리', '미인정을 고르면 — 자동 1OUT 안내(경고색 + ⚠ 글자)', { sheet: true }, function (root) {
  var m = frame(root, { title: '출결 결과 정리', who: '출결 담당' });
  m.appendChild(rgTabs('grid'));
  m.appendChild(rgLegend());
  rgSheet({ title: '결과 입력', lead: '3월 10일(수) · 3-1 3번 이서준', result: '지각', type: '미인정지각', seqs: [4], reason: '20:40 입실', bad: true }).open();
});
def('result-cell-pre', 'F11 결과 정리', '사전 특이사항이 있는 칸 — 위에 안내, 결과를 더할 수 있다', { sheet: true }, function (root) {
  var m = frame(root, { title: '출결 결과 정리', who: '출결 담당' });
  m.appendChild(rgTabs('grid'));
  m.appendChild(rgLegend());
  rgSheet({ title: '결과 입력', lead: '3월 9일(화) · 3-1 1번 김가온', pre: '이 칸에는 사전 특이사항 "학(학원)"이 있습니다. 학원에 가지 않고 결과(결석·지각·조퇴)가 있을 때만 더해 주세요. 사전 특이사항 자체는 [사전 특이사항]에서 고칩니다.', result: '조퇴', type: '병조퇴', seqs: [4, 5] }).open();
});
def('result-cancel', 'F11 결과 정리', '입력한 결과 취소 (사유 입력, 자동 1OUT도 함께 취소)', { sheet: true }, function (root) {
  var m = frame(root, { title: '출결 결과 정리', who: '출결 담당' });
  m.appendChild(rgTabs('total'));
  UI.confirmWithReason({ title: '결과를 취소합니다', message: '3월 11일(목) 3-1 5번 최하늘 · 미인정결석. 연결된 자동 1OUT도 함께 취소됩니다(기록은 남습니다). 고치려면 취소한 뒤 새로 입력해 주세요.', reasonLabel: '사유', confirmText: '결과 취소', danger: true, onconfirm: function () {} });
});

def('result-student-total', 'F11 결과 정리', '학생별 누적 — 결석·지각·조퇴 × 인정·미인정, 한 학생을 눌러 날짜별 기록', {}, function (root) {
  var m = frame(root, { title: '출결 결과 정리', who: '출결 담당', note: '시안 · 인정 = 병○○ 등 인정 유형, 미인정 = 미인정○○(자동 1OUT). 범위는 이 주·이번 달·이번 학기. PC·휴대폰 같은 표(가로로 밀면 학생 열이 고정). 숫자는 result-grid-pc의 주 결과와 같다.' });
  m.appendChild(rgTabs('total'));
  m.appendChild(card('', [UI.segmented({ label: '범위', value: 'week', options: [{ value: 'week', label: '이 주' }, { value: 'month', label: '이번 달' }, { value: 'term', label: '학기' }], onchange: function () {} }),
    el('div', { class: 'muted', style: 'margin-top:8px', text: '3월 8일(월) ~ 14일(일) · 3학년 1반' })]));
  var rows = [['1번 김가온', [1, 0, 0, 0, 0, 0]], ['3번 이서준', [0, 0, 0, 1, 0, 0]], ['4번 이나래', [0, 0, 0, 0, 1, 0]], ['5번 최하늘', [0, 1, 0, 0, 0, 0]], ['6번 정하나', [0, 0, 1, 0, 0, 0]]];
  var thead = el('thead', {}, [el('tr', {}, [el('th', { rowspan: '2', text: '학생' }), el('th', { colspan: '2', text: '결석' }), el('th', { colspan: '2', text: '지각' }), el('th', { colspan: '2', text: '조퇴' })]),
    el('tr', {}, ['인정', '미인정', '인정', '미인정', '인정', '미인정'].map(function (t) { return el('th', { text: t }); }))]);
  var tbody = el('tbody', {}, rows.map(function (r) { return el('tr', {}, [el('td', { text: '3-1 ' + r[0] })].concat(r[1].map(function (n) { return el('td', { class: n ? '' : 'muted', text: String(n) }); }))); }).concat([
    el('tr', { class: 'total' }, [el('td', { text: '합계(12명)' })].concat([1, 1, 1, 1, 1, 0].map(function (n) { return el('td', { text: String(n) }); })))]));
  m.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'data rg' }, [thead, tbody])]));
  m.appendChild(card('3-1 5번 최하늘 · 이번 주 기록', [el('ul', { class: 'list' }, [
    el('li', { style: 'align-items:center;gap:8px' }, [el('div', { style: 'flex:1 1 auto;min-width:0;word-break:keep-all' }, [el('div', { text: '3월 11일(목) 결석 × · 미인정결석' }), el('div', { class: 'muted', text: '무단 결석 · 자동 1OUT 연결 · 입력 김선생' })]),
      el('button', { type: 'button', class: 'btn secondary', style: 'flex:0 0 auto;margin-top:0', text: '취소' })])])]));
});

/* ═════════ F12 상담일지 ═════════ */
var CN_TYPES = ['생활', '학습', '진로', '진학', '2OUT 학부모 면담', '기타'];
function cnHead(m, on) {
  m.appendChild(card('', [el('div', { class: 'row' }, [el('b', { text: '3. 박다솜' }), el('span', { class: 'muted', text: ' 3-2 7번 · 담당 박선생' })]),
    el('div', { style: 'margin-top:8px' }, [UI.segmented({ label: '화면', value: on, options: [{ value: 'list', label: '상담 목록' }, { value: 'write', label: '새로 쓰기' }], onchange: function () {} })])]));
}
function cnItem(date, type, target, teacher, shown, extra, open, content, canceled) {
  var head = el('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap' }, [el('b', { text: date + ' · ' + type }), canceled ? UI.statusPill('canceled', '취소됨') : null]);
  var kids = [head, el('div', { class: 'muted', style: 'word-break:keep-all', text: '대상 ' + target + ' · ' + teacher + (canceled ? '' : ' · ' + (shown ? '학부모에게 날짜·교사 보임' : '학부모에게 안 보임')) })];
  if (extra) kids.push(el('div', { class: 'muted', style: 'word-break:keep-all', text: extra }));
  if (open) kids.push(el('div', { style: 'margin-top:8px;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--muted-weak);white-space:pre-wrap;word-break:keep-all', text: content }));
  var btns = [el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:8px', text: open ? '내용 접기' : '내용 보기' })];
  if (!canceled) btns.push(el('button', { type: 'button', class: 'btn secondary row-btn', style: 'margin-top:8px', text: '취소' }));
  kids.push(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btns));
  return el('li', { style: 'display:block' }, kids);
}
function cnList(m, openFirst) {
  m.appendChild(el('div', { class: 'notice info', style: 'word-break:keep-all', text: '상담 내용은 이 학생의 담당교사·담임(자기 반)·관리자만 봅니다. 다른 학사 교사·출결 담당에게는 이 목록이 없습니다.' }));
  m.appendChild(card('상담 3건', [el('ul', { class: 'list' }, [
    cnItem('3월 8일(월)', '2OUT 학부모 면담', '학부모', '박선생', true, '연결된 OUT: 3월 3일(수) 자습 분위기 방해', openFirst, '가짜 내용: 학부모와 통화. 자습 시간 태도에 대해 이야기하고 다음 주까지 지켜보기로 함.'),
    cnItem('3월 5일(금)', '생활', '학생', '박선생', false, '', false, ''),
    cnItem('2월 26일(금)', '진로', '학생', '박선생', true, '취소 사유: 다른 학생 기록에 잘못 씀', false, '', true)])]));
}
def('counsel-list', 'F12 상담일지', '상담 목록 — 학생 기록 안 (날짜·유형·대상·교사, 내용은 접어 둠)', {}, function (root) {
  var m = frame(root, { title: '상담일지', who: '박선생', note: '시안 · 학생 기록에서 들어오는 목록. 내용은 [내용 보기]를 눌러야 펼쳐진다(어깨너머로 보이지 않게). 취소된 기록은 취소됨 알약만 있고 [취소] 버튼이 없다. 학부모 공개 여부는 줄에 글자로 나온다.' });
  cnHead(m, 'list');
  cnList(m, false);
});
def('counsel-list-open', 'F12 상담일지', '상담 목록 — 한 건 내용 펼침', {}, function (root) {
  var m = frame(root, { title: '상담일지', who: '박선생' });
  cnHead(m, 'list');
  cnList(m, true);
});
function cnForm(m, twoOut) {
  var typeChips = el('div', { class: 'chips' }, CN_TYPES.map(function (t) { return el('button', { type: 'button', class: (t === (twoOut ? '2OUT 학부모 면담' : '학습')) ? 'chip on' : 'chip', text: t }); }));
  var tgt = el('div', { class: 'chips' }, ['학생', '학부모'].map(function (t) { var on = twoOut ? t === '학부모' : t === '학생'; var b = el('button', { type: 'button', class: on ? 'chip on' : 'chip', text: t }); if (twoOut && t === '학생') b.disabled = true; return b; }));
  m.appendChild(card('상담', [UI.dateField({ label: '상담 날짜', value: '2027-03-15', shortcuts: [{ label: '오늘', value: '2027-03-15' }], onchange: function () {} }),
    UI.field('유형', typeChips), UI.field('대상', tgt, twoOut ? { hint: '2OUT 학부모 면담은 대상이 학부모로 정해집니다.' } : {})]));
  if (twoOut) {
    var rl = el('div', { class: 'chips', style: 'flex-direction:column;align-items:stretch' }, [
      el('button', { type: 'button', class: 'chip on', style: 'justify-content:flex-start', text: '3월 3일(수) 자습 분위기 방해 · 3월 2일(화) 휴대폰·전자기기' })]);
    m.appendChild(card('연결할 OUT', [UI.field('이 면담이 다루는 퇴실 대상', rl, { hint: '이 기록이 있어야 관리자가 퇴실을 확정할 수 있습니다(F4).' })]));
  }
  m.appendChild(card('내용', [UI.field('상담 내용', el('textarea', { maxlength: '2000', style: 'min-height:160px', text: twoOut ? '가짜 내용: 학부모와 통화하고 면담 일정을 정함.' : '' }), { hint: '2000자까지. 저장한 뒤에는 고치지 않습니다(취소하고 새로 씁니다).' }),
    checkRow('학부모에게 상담한 날짜·교사를 보입니다(내용은 보이지 않습니다)', true)]));
  m.appendChild(el('div', { class: 'notice info', style: 'word-break:keep-all', text: '내용은 담당교사·담임(자기 반)·관리자만 봅니다. 감사 기록에는 "(내용 생략, N자)"만 남습니다.' }));
}
def('counsel-write', 'F12 상담일지', '작성 폼 (유형·대상 칩·내용·학부모에게 상담 여부 보이기 기본 켬)', {}, function (root) {
  var m = frame(root, { title: '상담일지', who: '박선생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '상담일지 저장' }], note: '시안 · 담당교사가 작성. 상담 날짜 기본값은 오늘, 학부모 공개 체크는 기본 켬(학부모에게는 날짜·교사만 보이고 내용은 절대 안 보인다).' });
  cnHead(m, 'write');
  cnForm(m, false);
});
def('counsel-write-2out', 'F12 상담일지', '작성 폼 — 유형 "2OUT 학부모 면담": 대상 학부모 고정, 연결할 OUT 고르기', {}, function (root) {
  var m = frame(root, { title: '상담일지', who: '박선생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '상담일지 저장' }], note: '시안 · 퇴실 대상(2OUT) 학생의 면담을 기록하면 F4 퇴실 확정이 열린다. OUT이 둘 이상이면 어느 OUT인지 고른다.' });
  cnHead(m, 'write');
  cnForm(m, true);
});
def('counsel-cancel', 'F12 상담일지', '취소 시트 (사유 필수, 고치기 = 취소 후 새로 쓰기)', { sheet: true }, function (root) {
  var m = frame(root, { title: '상담일지', who: '박선생' });
  cnHead(m, 'list');
  cnList(m, false);
  UI.confirmWithReason({ title: '상담 기록을 취소합니다', message: '3월 8일(월) 2OUT 학부모 면담. 기록은 지우지 않고 "취소됨"으로 남습니다. 이 면담이 연결된 퇴실 대상은 면담이 다시 필요해집니다. 내용을 고치려면 취소한 뒤 새로 써 주세요.', reasonLabel: '사유', confirmText: '상담 취소', danger: true, onconfirm: function () {} });
});
def('home-counsel', 'F12 상담일지', '학사 교사 홈 카드 — 상담일지 (이번 달 건수·면담이 필요한 퇴실 대상)', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '박선생', note: '시안 · 홈의 새 카드. 건수만 보이고 학생 이름·내용은 홈에 나오지 않는다. 담당교사·관리자 홈에만 있다.' });
  m.appendChild(card('상담일지', [el('div', { style: 'word-break:keep-all', text: '이번 달 쓴 상담 3건' }), el('div', { style: 'word-break:keep-all;margin-top:4px', text: '면담 기록이 필요한 퇴실 대상 1명' }),
    link('상담일지 열기', 'secondary', 'margin-top:12px')]));
});

/* ═════════ F13 월별 일정 (대략 — events 탭 승인 뒤) ═════════ */
function calGrid(sel) {
  var ev = { 5: '입학식', 9: '학부모 총회', 17: '모의고사', 24: '학사 설명회' }, offDay = 12, weeks = [];
  for (var w = 0; w < 5; w++) {
    var tr = [];
    for (var i = 0; i < 7; i++) {
      var date = w * 7 + i;   // 일요일 시작 달력. 2027년 3월 1일이 월요일이라 첫 칸(일)은 2월 28일이므로 비운다
      if (date < 1 || date > 31) { tr.push(el('td', { style: 'padding:4px' }, [])); continue; }
      var cls = 'rg-cell' + (date === offDay ? ' off' : '') + (ev[date] ? ' has' : '') + (date === sel ? ' bad' : '');
      var kids = [el('span', { class: 'rg-sym', text: String(date) })];
      if (date === offDay) kids.push(el('span', { class: 'rg-pre', text: '쉼' }));
      else if (ev[date]) kids.push(el('span', { class: 'rg-pre', text: '●' }));
      tr.push(el('td', { style: 'padding:4px' }, [el('button', { type: 'button', class: cls, 'aria-label': '3월 ' + date + '일' + (ev[date] ? ' ' + ev[date] : '') + (date === offDay ? ' 운영 안 함' : ''), style: 'min-width:0' }, kids)]));
    }
    weeks.push(el('tr', {}, tr));
  }
  var head = el('thead', {}, [el('tr', {}, ['일', '월', '화', '수', '목', '금', '토'].map(function (t) { return el('th', { style: 'text-align:center;padding:4px', text: t }); }))]);
  return el('div', { class: 'tablewrap' }, [el('table', { class: 'data rg', style: 'table-layout:fixed' }, [head, el('tbody', {}, weeks)])]);
}
def('calendar-month', 'F13 월별 일정(대략)', '월별 일정 달력 — 관리자는 [일정 추가], 교사는 보기만 (운영 안 하는 날은 회색)', {}, function (root) {
  var m = frame(root, { title: '월별 일정', who: '관리자', note: '시안(대략) · events 탭 승인 뒤에 확정(열: 날짜·제목·대상·내용). 미정: 하루에 일정이 여럿일 때 칸 표시, 여러 날 걸치는 일정(기간)을 한 줄로 할지. 회색 "쉼"은 F3 일정의 운영 안 하는 날이 자동으로 나온다(여기서 정하지 않는다).' });
  m.appendChild(card('', [el('div', { style: 'display:flex;gap:8px;align-items:center' }, [rgArrow('‹', '이전 달'), el('b', { style: 'flex:1;text-align:center', text: '2027년 3월' }), rgArrow('›', '다음 달')])]));
  m.appendChild(calGrid(9));
  m.appendChild(el('div', { class: 'muted', style: 'margin-bottom:8px', text: '● 일정 있음 · 회색 점선 "쉼" = 운영 안 하는 날 · ⚠ 굵은 테두리 = 지금 고른 날' }));
  m.appendChild(card('3월 9일(화)', [el('ul', { class: 'list' }, [el('li', { style: 'display:block' }, [el('b', { text: '학부모 총회' }), el('div', { class: 'muted', text: '대상 전체 · 19:00 시청각실' })])]),
    el('button', { type: 'button', class: 'btn', style: 'margin-top:12px', text: '일정 추가' })]));
});
def('calendar-add', 'F13 월별 일정(대략)', '일정 추가 시트 (제목·날짜·대상·내용, 관리자만)', { sheet: true }, function (root) {
  var m = frame(root, { title: '월별 일정', who: '관리자' });
  m.appendChild(calGrid(9));
  var body = el('div', {}, [UI.field('제목', el('input', { type: 'text', value: '학부모 총회' })), UI.dateField({ label: '날짜', value: '2027-03-09', onchange: function () {} }),
    UI.field('대상', el('div', { class: 'chips' }, [el('button', { type: 'button', class: 'chip on', text: '전체' }), el('button', { type: 'button', class: 'chip', text: '1학년' }), el('button', { type: 'button', class: 'chip', text: '2학년' }), el('button', { type: 'button', class: 'chip', text: '3학년' })])),
    UI.field('내용(선택)', el('textarea', { maxlength: '300', text: '19:00 시청각실' }))]);
  UI.bottomSheet({ title: '일정 추가', content: body, actions: [{ text: '닫기', kind: 'secondary', onclick: function () {} }, { text: '일정 저장', kind: 'primary', onclick: function () {} }] }).open();
});

/* ═════════ 실행 ═════════ */
function renderScreen(id) {
  var s = SCREENS[id];
  var root = document.getElementById('app');
  if (!s) {
    root.appendChild(el('main', {}, [el('h1', { text: 'D12 5단계 시안 목록 (가짜 이름 · 정적 미리보기)' })].concat(ORDER.map(function (k) { return el('p', {}, [el('a', { href: '#' + k, text: k + ' — ' + SCREENS[k].label })]); }))));
    return;
  }
  s.fn(root);
  document.title = s.label;
}
window.addEventListener('hashchange', function () { location.reload(); });
renderScreen(location.hash.replace('#', ''));
document.body.setAttribute('data-ready', '1');
