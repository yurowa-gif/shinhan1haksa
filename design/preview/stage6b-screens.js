/* D24 정적 시안: 6단계(상담·진로진학, F15~F17) 화면. 브라우저에서 돈다(design/preview/stage6b.js가 stage2-screens.js의 도우미 + Styles·Client·Components와 함께 묶는다).
   실제 화면 코드가 아니다 — 서버를 부르지 않고, 이름·날짜·글은 모두 가짜다. 결정 88 안(감색 면 + 살구 신호) 그대로, 결정 89~101 반영. 이수 계획(편제표)은 뺀다.
   가짜 오늘 = 2027년 4월 12일(월). 학생 "1. 김가온"(담당 박선생, 담임 최선생), 학부모는 김가온의 학부모.
   설명서: docs/design/stage6/screens.md */

var TODAY = '2027-04-12';
var TOPICS = ['생활', '학습', '진로', '진학', '기타'];
var ME = '1. 김가온';

/* 시안 전용 스타일(새 부품 제안: UI.timeline, UI.versionNav, UI.shareCheck — 설명서 7절). 색은 토큰만 쓴다 */
(function () {
  var css = '.share{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:4px;border-top:1px solid var(--line)}' +
    '.share .check{flex:1 1 auto}' +
    '.ver{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.ver .btn{flex:0 0 48px;padding:0}.ver .ver-t{flex:1 1 auto;text-align:center}' +
    '.tl{list-style:none;margin:0;padding:0}.tl li{display:grid;grid-template-columns:5.5em 1fr;gap:4px 12px;padding:12px 0;border-bottom:1px solid var(--line)}.tl li:last-child{border-bottom:0}' +
    '.tl .tl-d{color:var(--muted);font-size:var(--font-sm)}.tl .tl-b{min-width:0;word-break:keep-all}.tl .tl-b b{display:block}' +
    '.fb{background:var(--muted-weak);border-radius:var(--radius-sm);padding:12px;margin-top:8px;word-break:keep-all}' +
    '.kvs{margin:0}.kvs dt{color:var(--muted);font-size:var(--font-sm);margin-top:12px}.kvs dt:first-child{margin-top:0}.kvs dd{margin:0;word-break:keep-all}' +
    '.ld-row .pill{white-space:nowrap}.filebox{border:1px dashed var(--field-line);border-radius:var(--radius-sm);padding:16px;text-align:center}';
  document.head.appendChild(el('style', { text: css }));
})();

/* ───────── 도우미 ───────── */
function soft() { document.body.classList.add('tone-soft'); }
function p(text, cls) { return el('div', { class: cls || 'muted', style: 'word-break:keep-all', text: text }); }
function h2(text) { return el('h2', { text: text, style: 'margin:16px 4px 8px' }); }
function btn(text, kind) { return el('button', { type: 'button', class: 'btn ' + (kind || 'secondary') + ' row-btn', text: text }); }
function area(label, value, hint, rows) { var ta = el('textarea', { rows: String(rows || 3) }); ta.value = value || ''; return UI.field(label, ta, hint ? { hint: hint } : {}); }
function kvs(rows) { var dl = el('dl', { class: 'kvs' }); rows.forEach(function (r) { dl.appendChild(el('dt', { text: r[0] })); dl.appendChild(el('dd', {}, [].concat(r[1]))); }); return dl; }
/** 항목별 '부모님께 보이기'(기본 꺼짐). on이면 지금 공개 중이라는 꼬리표가 함께 나온다(결정 89) */
function share(on, label) {
  return el('div', { class: 'share' }, [checkRow(label || '부모님께 보이기', on), on ? UI.statusPill('confirmed', '지금 보이는 중') : UI.statusPill('mute', '나만 보는 중')]);
}
function versionNav(text, first, last) {
  var a = el('button', { type: 'button', class: 'btn secondary', 'aria-label': '이전 기록', text: '‹' }), b = el('button', { type: 'button', class: 'btn secondary', 'aria-label': '다음 기록', text: '›' });
  if (first) a.disabled = true; if (last) b.disabled = true;
  return el('div', { class: 'ver' }, [a, el('div', { class: 'ver-t' }, [el('b', { text: text[0] }), p(text[1])]), b]);
}
function timeline(items) {
  return el('ul', { class: 'tl' }, items.map(function (i) {
    return el('li', {}, [el('div', { class: 'tl-d', text: i.d }), el('div', { class: 'tl-b' }, [el('div', { style: 'margin-bottom:4px' }, [UI.statusPill(i.kind || 'mute', i.tag)]), el('b', { text: i.t })].concat((i.lines || []).map(function (t) { return p(t); })))]);
  }));
}
/** 목록 | 상세(Styles의 .ld). detail이 없으면 목록만(노트북에서는 오른쪽에 안내) */
function listDetail(m, rows, current, detail, emptyText) {
  var list = el('div', { class: 'card ld-list' }, rows.map(function (r) {
    return el('div', { class: 'ld-row' }, [el('button', { type: 'button', class: 'ld-pick', 'aria-current': r.id === current ? 'true' : 'false' }, [el('span', { class: 'ld-name', text: r.name }), el('span', { class: 'muted', text: r.sub })]), r.pill ? el('span', { style: 'flex:0 0 auto;white-space:nowrap' }, [r.pill]) : null]);
  }));
  var det = el('div', { class: 'ld-detail' }, detail || [el('div', { class: 'ld-empty muted', text: emptyText })]);
  m.appendChild(el('div', { class: 'ld' + (detail ? ' has-detail' : '') }, [list, det]));
}

/* ═════════ 1. 학생 — 진로 프로필 ═════════ */
function hopeRow(n, field, job) {
  return el('div', { style: 'margin-bottom:8px' }, [el('b', { text: n + '순위' + (n === 1 ? '' : ' (선택)') }),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px' }, [inputField('분야', 'text', field), inputField('직업', 'text', job)])]);
}
function targetRow(n, u, d, t) {
  return el('div', { style: 'margin-bottom:8px' }, [el('b', { text: '목표 ' + n }), inputField('대학', 'text', u), inputField('학과', 'text', d), selectField('전형', ['고르기', '학생부교과', '학생부종합', '논술', '정시', '아직 모름'], t)]);
}
function careerForm(m, v) {
  var c1 = card('진로 희망', [p('1순위는 꼭 적어 주세요. 2·3순위는 있으면 적습니다.'), hopeRow(1, v.h1[0], v.h1[1]), hopeRow(2, v.h2[0], v.h2[1]), hopeRow(3, '', ''), share(v.sh.hopes)]);
  var c2 = card('목표 진학', [p('가고 싶은 대학·학과가 있으면 적어 주세요. 없으면 비워 둬도 됩니다.'), targetRow(1, v.t1[0], v.t1[1], v.t1[2]), btn('+ 목표 추가'), share(v.sh.targets)]);
  var c3 = card('관심 분야', [area('요즘 관심 있는 것', v.interests, '과목·활동·책 무엇이든 좋습니다.'), share(v.sh.interests)]);
  var c4 = card('강점', [area('내가 잘하는 것', v.strengths), share(v.sh.strengths)]);
  var c5 = card('고민', [area('걱정되거나 도움이 필요한 것', v.concerns, '담당 선생님이 상담 전에 읽습니다.'), share(v.sh.concerns)]);
  [c1, c2, c3, c4, c5].forEach(function (c) { m.appendChild(c); });
  return { c1: c1, c2: c2 };
}
var CAREER = { h1: ['보건·의료', '간호사'], h2: ['교육', '보건 교사'], t1: ['가람대학교', '간호학과', '학생부종합'], interests: '생명과학 수업, 응급 처치 동아리', strengths: '꾸준히 기록하는 습관이 있습니다.', concerns: '수학 성적이 걱정됩니다.',
  sh: { hopes: true, targets: true, interests: false, strengths: false, concerns: false } };

def('s-career-form', '학생 · 진로 프로필', '진로 프로필 내기(지난번 내용을 불러온 모습)', {}, function (root) {
  soft();
  var m = frame(root, { title: '진로 프로필', who: ME, bar: [{ text: '제출하기' }], note: '학생 화면 · 지난번(2번째) 내용을 불러와 고쳐 내는 모습. 공개 항목은 지난번 것을 이어받는다(결정 89). 처음 내는 학생은 모든 칸이 비고 모든 "부모님께 보이기"가 꺼져 있다.' });
  m.appendChild(el('div', { class: 'notice info', text: '지난번에 낸 내용을 불러왔습니다. 바뀐 곳만 고쳐서 내면 새 기록으로 쌓이고, 지난 기록은 그대로 남습니다.' }));
  m.appendChild(card('', [el('b', { text: '이번 학기 제출 마감: 4월 16일(금)' }), p('마감 뒤에도 생각이 바뀌면 언제든 다시 낼 수 있습니다.')]));
  careerForm(m, CAREER);
  m.appendChild(p('부모님께는 가장 최근에 낸 기록에서 "보이기"를 켠 항목만 보입니다. 선생님 말씀(피드백)은 부모님께 보이지 않습니다.'));
});

def('s-career-error', '학생 · 진로 프로필', '진로 프로필 내기(고칠 곳 안내)', {}, function (root) {
  soft();
  var m = frame(root, { title: '진로 프로필', who: ME, bar: [{ text: '제출하기' }], note: '학생 화면 · [제출하기]를 눌렀는데 고칠 곳이 있는 모습(careerProfileCheck_: 1순위 빈칸, 목표의 대학·학과 빈칸).' });
  m.appendChild(el('div', { class: 'error', text: '고칠 곳이 2군데 있습니다. 빨간 칸을 확인해 주세요.' }));
  var v = JSON.parse(JSON.stringify(CAREER)); v.h1 = ['', '']; v.t1 = ['가람대학교', '', '학생부종합'];
  var f = careerForm(m, v);
  f.c1.querySelectorAll('.field')[0].setError('1순위 분야를 적어 주세요.');
  f.c2.querySelectorAll('.field')[1].setError('학과를 적어 주세요. 아직 못 정했으면 이 목표를 지워 주세요.');
});

def('s-career-confirm', '학생 · 진로 프로필', '진로 프로필 제출 확인 시트', { sheet: true }, function (root) {
  soft();
  var m = frame(root, { title: '진로 프로필', who: ME, bar: [{ text: '제출하기' }], note: '학생 화면 · [제출하기] 확인창. 부모님께 보이는 항목을 한 번 더 보여 준다.' });
  careerForm(m, CAREER);
  UI.confirmSheet({ title: '제출하기', lead: '3번째 기록으로 쌓입니다',
    lines: ['부모님께 보이는 항목: 진로 희망, 목표 진학', '나만 보는 항목: 관심 분야, 강점, 고민', '담당 선생님과 담임 선생님은 모든 항목을 봅니다.', '이대로 제출할까요?'],
    confirmText: '제출하기', onconfirm: function () {} });
});

def('s-career-off', '학생 · 진로 프로필', '"부모님께 보이기"를 끌 때 안내', { sheet: true }, function (root) {
  soft();
  var m = frame(root, { title: '내 진로 프로필', who: ME, note: '학생 화면 · 켜져 있던 "부모님께 보이기"를 끄면 나오는 확인창(결정 92). 켤 때는 확인창 없이 바로 켜지고 "부모님께 보입니다." 알림만 뜬다.' });
  careerView(m);
  UI.confirmSheet({ title: '보이기 끄기', lead: '목표 진학',
    lines: ['끄면 부모님 화면에서 바로 사라집니다.', '이미 보신 내용은 되돌릴 수 없습니다.', '부모님께 보이기를 끌까요?'],
    confirmText: '보이기 끄기', onconfirm: function () {} });
});

function careerView(m) {
  m.appendChild(versionNav(['3번째 기록 (가장 최근)', '4월 12일(월)에 냄'], false, true));
  m.appendChild(card('진로 희망', [kvs([['1순위', '보건·의료 · 간호사'], ['2순위', '교육 · 보건 교사']]), share(true)]));
  m.appendChild(card('목표 진학', [kvs([['목표 1', '가람대학교 간호학과 · 학생부종합']]), share(true)]));
  m.appendChild(card('관심 분야', [p('생명과학 수업, 응급 처치 동아리', ''), share(false)]));
  m.appendChild(card('강점', [p('꾸준히 기록하는 습관이 있습니다.', ''), share(false)]));
  m.appendChild(card('고민', [p('수학 성적이 걱정됩니다.', ''), share(false)]));
  m.appendChild(card('선생님 말씀', [el('div', { class: 'fb' }, [el('b', { text: '박선생 선생님 · 4월 12일(월)' }), p('목표가 또렷해졌네요. 생명과학 탐구 기록을 하나 골라 진행해 봅시다.', '')]), p('선생님 말씀은 나와 선생님만 봅니다. 부모님께는 보이지 않습니다.')]));
}
def('s-career-view', '학생 · 진로 프로필', '내 진로 프로필(낸 뒤, 선생님 말씀 포함)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 진로 프로필', who: ME, bar: [{ text: '고쳐서 다시 내기' }], note: '학생 화면 · 낸 기록을 보는 화면. ‹ ›로 지난 기록을 넘겨 본다. "부모님께 보이기"는 가장 최근 기록에서만 바꿀 수 있고, 지난 기록에서는 줄이 나오지 않는다.' });
  careerView(m);
});

def('s-career-empty', '학생 · 진로 프로필', '내 진로 프로필(아직 안 냄)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 진로 프로필', who: ME, note: '학생 화면 · 한 번도 내지 않은 학생. 마감이 지났으면 안내 상자가 "마감(4월 16일)이 지났습니다. 지금 내도 됩니다."로 바뀐다.' });
  var c = card('진로 프로필을 내 주세요', [p('내가 바라는 진로와 목표를 적어 내면 담당 선생님이 상담 전에 읽습니다. 이번 학기 마감은 4월 16일(금)입니다.', ''), el('div', { style: 'margin-top:12px' }, [el('a', { class: 'btn', href: '#', text: '진로 프로필 쓰기' })])]);
  c.className = 'card todo';
  m.appendChild(c);
});

/* ═════════ 2. 학생 — 상담 신청 ═════════ */
function topicChips(value) {
  return el('div', { class: 'chips', role: 'radiogroup', 'aria-label': '상담 주제' }, TOPICS.map(function (t) {
    return el('button', { type: 'button', class: 'chip' + (t === value ? ' on' : ''), role: 'radio', 'aria-checked': t === value ? 'true' : 'false', text: t });
  }));
}
function dateSlot(label, value) { return UI.dateField({ label: label, value: value || '', min: TODAY, onchange: function () {} }); }
function counselForm(m, v) {
  m.appendChild(card('만날 선생님', [el('b', { text: '박선생 선생님' }), p('담당 선생님께 신청합니다.')]));
  var d1 = dateSlot('희망 날짜 1', v.d1), d2 = dateSlot('희망 날짜 2 (선택)', v.d2), d3 = dateSlot('희망 날짜 3 (선택)', v.d3);
  m.appendChild(card('만나고 싶은 날', [p('1개 이상, 3개까지 고를 수 있습니다. 오늘 이후 날짜만 됩니다.'), d1, d2, d3]));
  var topic = card('무엇에 대해 이야기할까요?', [topicChips(v.topic)]);
  m.appendChild(topic);
  m.appendChild(card('', [area('하고 싶은 말 (선택)', v.memo, '담당 선생님만 읽습니다. 짧게 적어도 됩니다.')]));
  return { d1: d1, d3: d3, topic: topic };
}
def('s-counsel-form', '학생 · 상담 신청', '상담 신청 입력', {}, function (root) {
  soft();
  var m = frame(root, { title: '상담 신청', who: ME, bar: [{ text: '신청하기' }], note: '학생 화면 · 희망 날짜 3개까지(결정 95). 메모는 담당 선생님과 관리자만 본다(담임에게는 안 보임, 결정 96) — 안내 문구도 "담당 선생님만".' });
  m.appendChild(el('div', { class: 'notice info', text: '이야기하고 싶은 날과 주제를 알려 주세요. 선생님이 날짜를 정하면 이 화면에서 알려 드립니다.' }));
  counselForm(m, { d1: '2027-04-14', d2: '2027-04-16', topic: '진로', memo: '진학 방향을 이야기하고 싶습니다.' });
});
def('s-counsel-error', '학생 · 상담 신청', '상담 신청 입력(고칠 곳 안내)', {}, function (root) {
  soft();
  var m = frame(root, { title: '상담 신청', who: ME, bar: [{ text: '신청하기' }], note: '학생 화면 · counselRequestCheck_ 오류(오늘 이후·중복 없음·주제 필수).' });
  m.appendChild(el('div', { class: 'error', text: '고칠 곳이 3군데 있습니다. 빨간 칸을 확인해 주세요.' }));
  var f = counselForm(m, { d1: '2027-04-09', d2: '2027-04-14', d3: '2027-04-14', topic: '' });
  f.d1.setError('오늘(4월 12일) 이후 날짜를 골라 주세요.');
  f.d3.setError('같은 날짜를 두 번 고를 수 없습니다. 다른 날로 고쳐 주세요.');
  f.topic.appendChild(el('div', { class: 'error', style: 'margin:8px 0 0', text: '주제를 하나 골라 주세요.' }));
});
function reqCard(o) {
  var c = card('', [row([el('b', { text: o.topic + ' 상담' }), UI.statusPill(o.kind, o.state)], 'justify-content:space-between;margin-bottom:4px')]);
  o.lines.forEach(function (t) { c.appendChild(p(t)); });
  if (o.reason) c.appendChild(el('div', { class: 'fb' }, [el('b', { text: '선생님 말씀' }), p(o.reason, '')]));
  if (o.btns) c.appendChild(row(o.btns.map(function (b) { return btn(b); }), 'margin-top:8px'));
  return c;
}
def('s-counsel-list', '학생 · 상담 신청', '내 상담 신청(열린 신청이 있는 모습)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 상담 신청', who: ME, bar: [{ text: '+ 새 상담 신청', disabled: true }], note: '학생 화면 · 처리되지 않은 신청이 1건 있으면 새로 신청할 수 없다(결정 95). 버튼은 꺼져 있고 이유를 위에 적는다. 반려 사유는 학생에게 보인다.' });
  m.appendChild(el('div', { class: 'notice info', text: '진행 중인 신청이 있어 새로 신청할 수 없습니다. 선생님이 처리하거나 내가 취소하면 다시 신청할 수 있습니다.' }));
  m.appendChild(h2('진행 중'));
  m.appendChild(reqCard({ topic: '진로', kind: 'requested', state: '신청', lines: ['희망 날짜: 4월 14일(수) · 4월 16일(금)', '선생님이 날짜를 정하면 알려 드립니다.'], btns: ['신청 취소'] }));
  m.appendChild(h2('지난 신청'));
  m.appendChild(reqCard({ topic: '학습', kind: 'confirmed', state: '완료', lines: ['상담한 날: 4월 5일(월) · 박선생 선생님'], btns: ['상담 기록 보기'] }));
  m.appendChild(reqCard({ topic: '기타', kind: 'canceled', state: '반려', lines: ['3월 29일(월)에 신청'], reason: '그 주는 시험 기간이라 어렵습니다. 다음 주로 다시 신청해 주세요.' }));
  m.appendChild(reqCard({ topic: '생활', kind: 'canceled', state: '취소', lines: ['3월 22일(월)에 신청 · 내가 취소했습니다.'] }));
});
def('s-counsel-fixed', '학생 · 상담 신청', '내 상담 신청(날짜가 정해진 모습)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 상담 신청', who: ME, bar: [{ text: '+ 새 상담 신청', disabled: true }], note: '학생 화면 · 선생님이 날짜를 정한 뒤. 맨 위 한 칸으로 크게 알린다. 확정 뒤에도 학생은 취소할 수 있다.' });
  var c = card('4월 14일(수)에 상담합니다', [p('진로 상담 · 박선생 선생님', ''), p('못 가게 되면 미리 취소해 주세요.'), row([btn('신청 취소')], 'margin-top:8px')]);
  c.className = 'card key';
  m.appendChild(c);
  m.appendChild(h2('지난 신청'));
  m.appendChild(reqCard({ topic: '학습', kind: 'confirmed', state: '완료', lines: ['상담한 날: 4월 5일(월) · 박선생 선생님'], btns: ['상담 기록 보기'] }));
});
def('s-counsel-empty', '학생 · 상담 신청', '내 상담 신청(없음)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 상담 신청', who: ME, bar: [{ text: '+ 새 상담 신청' }], note: '학생 화면 · 빈 상태.' });
  m.appendChild(card('', [UI.emptyState('아직 상담 신청이 없습니다. 아래 [+ 새 상담 신청]을 눌러 시작해 주세요.')]));
});
def('s-counsel-cancel', '학생 · 상담 신청', '신청 취소 확인 시트', { sheet: true }, function (root) {
  soft();
  var m = frame(root, { title: '내 상담 신청', who: ME, note: '학생 화면 · [신청 취소] 확인창. 취소한 신청은 "취소"로 남는다(지우지 않음).' });
  m.appendChild(reqCard({ topic: '진로', kind: 'requested', state: '신청', lines: ['희망 날짜: 4월 14일(수) · 4월 16일(금)'], btns: ['신청 취소'] }));
  UI.confirmSheet({ title: '신청 취소', lead: '진로 상담 · 박선생 선생님', lines: ['취소한 신청은 목록에 "취소"로 남습니다.', '취소한 뒤에는 새로 신청할 수 있습니다.', '이 신청을 취소할까요?'], confirmText: '신청 취소', onconfirm: function () {} });
});

/* ═════════ 3. 학생 — 내 상담 기록 ═════════ */
function noteCard(date, teacher, agreements, on) {
  var c = card('', [el('b', { text: date }), p(teacher + ' 선생님')]);
  if (agreements) { c.appendChild(el('div', { class: 'fb' }, [el('b', { text: '합의 사항·다음 할 일' })].concat(agreements.map(function (t) { return p('· ' + t, ''); })))); c.appendChild(share(on, '이 합의 사항을 부모님께 보이기')); }
  else c.appendChild(p('적힌 합의 사항이 없습니다.'));
  return c;
}
def('s-notes', '학생 · 내 상담 기록', '내 상담 기록(날짜·교사·합의 사항)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 상담 기록', who: ME, note: '학생 화면 · 날짜·교사·합의 사항만(결정 94). 상담 유형·내용은 서버가 보내지 않는다. 합의 사항은 건마다 "부모님께 보이기"(기본 꺼짐, 결정 90). 끌 때는 진로 프로필과 같은 확인창.' });
  m.appendChild(el('div', { class: 'notice info', text: '부모님께는 상담한 날짜와 선생님 이름만 보입니다. 합의 사항은 내가 "보이기"를 켠 것만 보입니다.' }));
  m.appendChild(noteCard('4월 5일(월)', '박선생', ['수학 오답 노트를 주 2회 쓰기', '4월 말에 다시 만나 점검하기'], true));
  m.appendChild(noteCard('3월 15일(월)', '박선생', ['자습 시작 전 휴대폰 맡기기'], false));
  m.appendChild(noteCard('3월 8일(월)', '최선생', null));
});
def('s-notes-empty', '학생 · 내 상담 기록', '내 상담 기록(없음)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 상담 기록', who: ME, note: '학생 화면 · 빈 상태.' });
  m.appendChild(card('', [UI.emptyState('아직 상담 기록이 없습니다.', { text: '상담 신청하기', onclick: function () {} })]));
});

/* ═════════ 4. 학생 — 탐구 기록 ═════════ */
function inquiryCard(o) {
  var c = card('', [row([UI.statusPill('mute', 'AI 제안 · ' + o.src), o.liked ? UI.statusPill('confirmed', '관심 표시') : null], 'margin-bottom:4px'), el('b', { text: o.title }), p(o.q, ''), p(o.std + ' · ' + o.date + '에 기록')]);
  if (o.open) {
    c.appendChild(UI.field('진행 상태', UI.segmented({ label: '진행 상태', value: o.state, options: [{ value: '관심', label: '관심' }, { value: '진행 중', label: '진행 중' }, { value: '완료', label: '완료' }], onchange: function () {} })));
    c.appendChild(inputField('결과물 링크 (선택)', 'url', o.link, 'http:// 또는 https:// 로 시작하는 주소만 됩니다.'));
    c.appendChild(area('메모 (선택)', o.memo, '', 2));
    c.appendChild(row([btn('저장', '')], ''));
  } else {
    c.appendChild(row([UI.statusPill(o.state === '완료' ? 'confirmed' : o.state === '진행 중' ? 'requested' : 'mute', o.state), btn('진행 적기')], 'justify-content:space-between;margin-top:8px'));
  }
  if (o.fb) c.appendChild(el('div', { class: 'fb' }, [el('b', { text: '박선생 선생님 · 4월 9일(금)' }), p(o.fb, '')]));
  c.appendChild(share(o.on));
  return c;
}
var INQ = [
  { src: 'ChatGPT', liked: true, title: '손 씻기 시간에 따른 세균 수 변화', q: '손을 몇 초 씻어야 세균이 충분히 줄어들까?', std: '생명과학 · 12생과01-03 · 12생과02-01', date: '4월 2일(금)', state: '진행 중', link: 'https://example.com/report', memo: '배지 6개로 1차 실험 끝', open: true, fb: '실험 조건을 표로 정리해 오면 같이 봅시다.', on: true },
  { src: '연결 예시', title: '응급실 대기 시간과 인력 배치', q: '대기 시간을 줄이려면 무엇을 바꿔야 할까?', std: '통합사회 · 10통사05-02 · 10통사06-01', date: '4월 2일(금)', state: '관심', on: false },
  { src: '기본 추천', title: '혈압 측정값의 평균과 흩어짐', q: '하루 중 언제 재느냐에 따라 얼마나 달라질까?', std: '수학 · 10수학03-01 · 10수학03-02', date: '3월 20일(토)', state: '완료', on: false }
];
def('s-inquiry-list', '학생 · 탐구 기록', '내 탐구 기록(진행 적기 열린 모습)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 탐구 기록', who: ME, bar: [{ text: '기록 파일 올리기' }], note: '학생 화면 · 탐구발견에서 받은 기록. 출처에 늘 "AI 제안"을 붙인다(F16). 기록마다 진행 상태·링크·메모와 "부모님께 보이기". 첫 카드는 [진행 적기]를 눌러 펼친 모습.' });
  m.appendChild(p('탐구발견 앱에서 받은 주제는 AI가 제안한 것입니다. 선생님과 이야기해 보고 진행해 주세요.'));
  INQ.forEach(function (o) { m.appendChild(inquiryCard(o)); });
});
def('s-inquiry-empty', '학생 · 탐구 기록', '내 탐구 기록(없음)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 탐구 기록', who: ME, bar: [{ text: '기록 파일 올리기' }], note: '학생 화면 · 빈 상태.' });
  m.appendChild(card('', [UI.emptyState('아직 올린 탐구 기록이 없습니다. 탐구발견 앱에서 [기록 파일 받기]로 받은 파일을 올려 주세요.')]));
});
function uploadTop(m, file) {
  m.appendChild(card('1. 파일 고르기', [p('탐구발견 앱의 [기록 파일 받기]로 받은 파일(.json)을 골라 주세요. 12MB까지 됩니다.'),
    el('div', { class: 'filebox', style: 'margin-top:8px' }, [file ? el('b', { text: file }) : p('고른 파일이 없습니다.'), row([btn(file ? '다른 파일 고르기' : '파일 고르기', file ? 'secondary' : '')], 'justify-content:center;margin-top:8px')])]));
}
def('s-inquiry-pick', '학생 · 탐구 기록', '기록 파일 올리기(처음)', {}, function (root) {
  soft();
  var m = frame(root, { title: '기록 파일 올리기', who: ME, bar: [{ text: '올리기', disabled: true }], note: '학생 화면 · 파일을 고르기 전. [올리기]는 미리보기가 나온 뒤에 켜진다.' });
  uploadTop(m, '');
  m.appendChild(card('2. 미리보기', [p('파일을 고르면 올라갈 기록이 여기에 나옵니다. 이 단계에서는 아직 저장하지 않습니다.')]));
});
def('s-inquiry-preview', '학생 · 탐구 기록', '기록 파일 올리기(미리보기 + 이름 다름 경고)', {}, function (root) {
  soft();
  var m = frame(root, { title: '기록 파일 올리기', who: ME, bar: [{ text: '4건 올리기', disabled: true }], note: '학생 화면 · 미리보기. 파일 속 이름이 계정 이름과 다르면 경고하고, 학생이 "내 기록이 맞습니다"를 체크해야 [올리기]가 켜진다(결정 93). 이름이 같으면 경고와 체크 칸이 없다. 기록은 늘 로그인한 내 계정에 저장된다.' });
  uploadTop(m, 'discovery-records-0412.json');
  var c = card('2. 미리보기', [row([UI.statusPill('confirmed', '새 기록 4건'), UI.statusPill('mute', '이미 있는 기록 2건')], 'margin-bottom:8px'), p('이미 있는 기록은 다시 저장하지 않습니다. 내가 적은 진행 상태·메모는 그대로입니다.'),
    el('ul', { class: 'list', style: 'margin-top:8px' }, ['손 씻기 시간에 따른 세균 수 변화', '응급실 대기 시간과 인력 배치', '마스크 종류별 호흡 저항', '교실 이산화탄소 농도와 졸음'].map(function (t) { return el('li', {}, [el('div', {}, [el('b', { text: t }), p('AI 제안 · 4월 2일(금)에 기록')])]); }))]);
  m.appendChild(c);
  m.appendChild(el('div', { class: 'notice warn' }, ['파일 속 이름(김가은)이 내 이름(김가온)과 다릅니다. 내 기록이 맞나요?', checkRow('내 기록이 맞습니다', false), p('맞다고 표시하면 담당 선생님 화면에 "이름 다름"이 함께 나옵니다.')]));
});
def('s-inquiry-error', '학생 · 탐구 기록', '기록 파일 올리기(받을 수 없는 파일)', {}, function (root) {
  soft();
  var m = frame(root, { title: '기록 파일 올리기', who: ME, bar: [{ text: '올리기', disabled: true }], note: '학생 화면 · 오류 세 가지 문구 예: ① 탐구발견 파일이 아님 ② 12MB·1,000건 초과 ③ 같은 기록인데 내용이 다름(덮어쓰지 않고 거부).' });
  uploadTop(m, 'homework.json');
  m.appendChild(el('div', { class: 'error', text: '탐구발견 기록 파일이 아닙니다. 탐구발견 앱의 [기록 파일 받기]로 받은 파일을 골라 주세요.' }));
  m.appendChild(card('다른 오류일 때 문구', [p('· 파일이 12MB보다 큽니다. 탐구발견에서 기록을 나눠 받아 올려 주세요.'), p('· 기록이 1,000건보다 많습니다. 탐구발견에서 기록을 나눠 받아 올려 주세요.'), p('· 이미 올린 기록 1건과 내용이 다릅니다(손 씻기 시간에 따른 세균 수 변화). 탐구발견에서 파일을 다시 받아 올려 주세요. 올린 기록은 바뀌지 않았습니다.')]));
});
def('s-inquiry-done', '학생 · 탐구 기록', '기록 파일 올리기(이미 다 있는 파일)', {}, function (root) {
  soft();
  var m = frame(root, { title: '기록 파일 올리기', who: ME, bar: [{ text: '올리기', disabled: true }], note: '학생 화면 · 같은 파일을 다시 고른 경우(새 기록 0건). 올릴 것이 없으므로 버튼은 꺼져 있다.' });
  uploadTop(m, 'discovery-records-0412.json');
  m.appendChild(card('2. 미리보기', [row([UI.statusPill('mute', '새 기록 0건'), UI.statusPill('mute', '이미 있는 기록 6건')], 'margin-bottom:8px'), p('이 파일의 기록은 이미 모두 올라와 있습니다. 올릴 것이 없습니다.', '')]));
});

/* ═════════ 5. 학생 홈 카드 ═════════ */
def('s-home', '학생 · 홈', '학생 홈에 더해지는 칸(진로·상담·탐구)', {}, function (root) {
  soft();
  root.appendChild(el('header', { class: 'top' }, [el('h1', { text: '신한1학사 · 학생' }), el('div', { class: 'who', text: '김가온' })]));
  var m = el('main', { class: 'home' }); root.appendChild(m);
  m.appendChild(noteBox('학생 홈 · 7단계 홈(이름 카드·OUT·출결…) 아래에 더해지는 칸만 그렸다. 진로 프로필을 안 냈고 마감 전이면 맨 위 한 칸(.card.todo)으로, 상담 날짜가 정해지면 .card.key 한 칸으로 올린다. 맨 위 한 칸은 한 번에 하나만(시간표 > 진로 프로필 > 상담 순).'));
  var c = card('진로 프로필을 내 주세요', [p('이번 학기 마감은 4월 16일(금)입니다. 담당 선생님이 상담 전에 읽습니다.', ''), el('div', { style: 'margin-top:12px' }, [el('a', { class: 'btn', href: '#', text: '진로 프로필 쓰기' })])]);
  c.className = 'card todo'; m.appendChild(c);
  m.appendChild(card('상담', [row([UI.statusPill('requested', '신청'), el('span', { text: '진로 상담 · 희망 4월 14일(수) 외 1일' })], ''), UI.rowLink({ href: '#', text: '내 상담 신청' }), UI.rowLink({ href: '#', text: '내 상담 기록' })]));
  m.appendChild(card('진로와 탐구', [p('가장 최근에 낸 진로 프로필: 4월 2일(금) · 2번째'), UI.rowLink({ href: '#', text: '내 진로 프로필' }), UI.rowLink({ href: '#', text: '내 탐구 기록 3건' })]));
});

/* ═════════ 6. 학부모 ═════════ */
function parentFrame(root, note) {
  soft();
  var m = frame(root, { title: '진로와 상담', who: '김가온 학부모', note: note });
  m.appendChild(el('div', { class: 'chips', style: 'margin-bottom:12px' }, [el('button', { type: 'button', class: 'chip on', text: '김가온' }), el('button', { type: 'button', class: 'chip', text: '김나온' })]));
  return m;
}
def('p-career', '학부모', '자녀의 진로·탐구·상담(공개된 것이 있는 모습)', {}, function (root) {
  var m = parentFrame(root, '학부모 화면 · 자녀가 "보이기"를 켠 항목만, 가장 최근 기록만(결정 89). 켜지 않은 항목은 제목조차 나오지 않는다(비공개 흔적 없음, 결정 92). 선생님 말씀(피드백)·상담 내용·상담 유형·신청 내역은 없다. 지난 기록 넘겨 보기도 없다.');
  m.appendChild(el('div', { class: 'notice info', text: '자녀가 학부모님께 보여 주기로 한 내용입니다. 자녀가 고쳐 내면 가장 최근 내용으로 바뀝니다.' }));
  m.appendChild(card('진로', [kvs([['진로 희망', ['1순위 보건·의료 · 간호사', el('br'), '2순위 교육 · 보건 교사']], ['목표 진학', '가람대학교 간호학과 · 학생부종합']]), p('4월 12일(월)에 낸 내용')]));
  m.appendChild(card('탐구', [row([UI.statusPill('mute', 'AI 제안'), UI.statusPill('requested', '진행 중')], 'margin-bottom:4px'), el('b', { text: '손 씻기 시간에 따른 세균 수 변화' }), p('손을 몇 초 씻어야 세균이 충분히 줄어들까?', ''), p('탐구 주제는 AI가 제안한 것으로, 자녀가 골라 진행하고 있습니다.')]));
  m.appendChild(card('상담', [el('ul', { class: 'list' }, [
    el('li', {}, [el('div', {}, [el('b', { text: '4월 5일(월) · 박선생 선생님' }), el('div', { class: 'fb' }, [el('b', { text: '합의 사항·다음 할 일' }), p('· 수학 오답 노트를 주 2회 쓰기', ''), p('· 4월 말에 다시 만나 점검하기', '')])])]),
    el('li', {}, [el('div', {}, [el('b', { text: '3월 15일(월) · 박선생 선생님' })])]),
    el('li', {}, [el('div', {}, [el('b', { text: '3월 8일(월) · 최선생 선생님' })])])]),
    p('상담한 날짜와 선생님을 알려 드립니다. 상담 내용이 궁금하시면 담당 선생님께 연락해 주세요.')]));
});
def('p-empty', '학부모', '자녀의 진로·탐구·상담(보여 드릴 것이 없는 모습)', {}, function (root) {
  var m = parentFrame(root, '학부모 화면 · 빈 상태. 자녀가 아직 안 냈을 때, 냈지만 공개하지 않았을 때, 공개했다가 끈 때 모두 똑같은 문구다(결정 92: "비공개" 흔적을 남기지 않는다). "비공개"·"숨김"·"0건 공개" 같은 말을 쓰지 않는다.');
  m.appendChild(card('진로와 탐구', [UI.emptyState('지금은 보여 드릴 진로·탐구 기록이 없습니다.'), p('자녀가 학부모님께 보여 주기로 한 기록이 생기면 여기에 나옵니다.')]));
  m.appendChild(card('상담', [UI.emptyState('이번 학기에 상담한 기록이 없습니다.')]));
});

/* ═════════ 7. 교사 ═════════ */
def('t-home', '교사 · 홈', '담당교사 홈의 할 일(진로 프로필 미제출·상담 신청)', {}, function (root) {
  root.appendChild(el('header', { class: 'top' }, [el('h1', { text: '신한1학사 · 학사 교사' }), el('div', { class: 'who', text: '박선생' })]));
  var m = el('main', { class: 'home' }); root.appendChild(m);
  m.appendChild(noteBox('학사 교사 박선생 홈 · "오늘 처리할 것"(UI.todoList)에 두 줄이 더해진다. 0건인 줄은 나오지 않는다. 미제출은 마감일에 입실이었던 학생만, 입실 뒤 14일은 세지 않는다(결정 98). 담임 홈에는 "상담 신청"·"미제출" 줄을 넣지 않는다(처리하는 사람이 아니다) — 참고 카드의 바로가기만.'));
  m.appendChild(UI.todoList({ title: '오늘 처리할 것', items: [
    { count: 2, label: '상담 신청', hint: '가장 빠른 희망 날짜 4월 14일(수)', href: '#' },
    { count: 2, label: '진로 프로필 미제출', hint: '마감 4월 9일(금) 지남', href: '#' },
    { count: 1, label: '특이사항 확인 대기', href: '#' }] }));
  m.appendChild(card('진로·상담', [UI.rowLink({ href: '#', text: '담당 학생 진로 프로필' }), UI.rowLink({ href: '#', text: '상담 신청 처리' }), UI.rowLink({ href: '#', text: '상담일지' })]));
});

var MY = [
  { id: 's1', name: '1. 김가온', sub: '3번째 · 4월 12일(월)에 냄', pill: UI.statusPill('confirmed', '제출') },
  { id: 's2', name: '2. 이나래', sub: '낸 적 없음 · 마감 4월 9일(금) 지남', pill: UI.statusPill('todo', '미제출') },
  { id: 's4', name: '2. 최하늘', sub: '지난 학기 1번째만 있음', pill: UI.statusPill('todo', '미제출') },
  { id: 's3', name: '3. 박다솜', sub: '입실 4월 6일(화) · 4월 20일(화)까지 유예', pill: UI.statusPill('mute', '유예 중') }
];
function careerHead(m) {
  m.appendChild(UI.segmented({ label: '보기', value: 'all', options: [{ value: 'todo', label: '미제출 2' }, { value: 'all', label: '전체 4' }], onchange: function () {} }));
}
function teacherCareerDetail() {
  return [
    card('1. 김가온', [p('1학년 3반 5번 · 담당 박선생 · 담임 최선생'), row([btn('학생 타임라인 열기'), el('button', { type: 'button', class: 'btn secondary row-btn ld-narrow', text: '학생 바꾸기' })], 'margin-top:8px')]),
    versionNav(['2번째 기록', '4월 2일(금)에 냄 · 전체 3개'], false, false),
    card('진로 희망', [kvs([['1순위', '보건·의료 · 간호사'], ['2순위', '교육 · 교사']]), row([UI.statusPill('mute', '학부모에게 보임')], 'margin-top:8px')]),
    card('목표 진학', [kvs([['목표 1', '가람대학교 간호학과 · 아직 모름']]), row([UI.statusPill('mute', '학부모에게 보임')], 'margin-top:8px')]),
    card('관심 분야', [p('생명과학 수업', '')]),
    card('강점', [p('꾸준히 기록하는 습관이 있습니다.', '')]),
    card('고민', [p('수학 성적이 걱정됩니다.', '')]),
    card('피드백', [el('div', { class: 'fb' }, [el('b', { text: '박선생 · 4월 3일(토) · 2번째 기록에' }), p('전형을 정하려면 1학기 성적을 보고 다시 이야기합시다.', '')]),
      el('div', { style: 'margin-top:12px' }, [area('피드백 쓰기', '', '학생에게 보입니다. 학부모에게는 보이지 않습니다. 학생이 보면 안 되는 내용은 상담일지에 써 주세요.')]),
      row([btn('피드백 남기기', '')], '')])
  ];
}
def('t-career-list', '교사 · 진로 프로필', '담당 학생 진로 프로필(목록)', {}, function (root) {
  var m = frame(root, { title: '진로 프로필', who: '박선생', note: '담당 학생 목록. 미제출이 위로 온다. "유예 중"은 입실 뒤 14일(결정 98). 노트북에서는 오른쪽이 상세 자리.' });
  careerHead(m);
  listDetail(m, [MY[1], MY[2], MY[3], MY[0]], '', null, '왼쪽에서 학생을 고르면 진로 프로필이 여기에 나옵니다.');
});
def('t-career', '교사 · 진로 프로필', '담당 학생 진로 프로필(버전 넘겨 보기 + 피드백 쓰기)', {}, function (root) {
  var m = frame(root, { title: '진로 프로필', who: '박선생', note: '학생 한 명. ‹ ›로 버전을 넘겨 본다(덮어쓰지 않고 쌓인 기록). 학생이 학부모에게 공개한 항목에는 "학부모에게 보임" 꼬리표. 피드백은 학부모에게 안 보인다는 것을 입력 칸 아래에 늘 적는다(결정 91). 담임이 보면 [피드백 남기기]와 입력 칸이 없다(보기만).' });
  careerHead(m);
  listDetail(m, [MY[1], MY[2], MY[3], MY[0]], 's1', teacherCareerDetail());
});
def('t-career-missing', '교사 · 진로 프로필', '담당 학생 진로 프로필(미제출 학생)', {}, function (root) {
  var m = frame(root, { title: '진로 프로필', who: '박선생', note: '낸 적이 없는 학생을 고른 모습. 교사가 대신 써 줄 수 없다 — 안내만.' });
  careerHead(m);
  listDetail(m, [MY[1], MY[2], MY[3], MY[0]], 's2', [card('2. 이나래', [p('2학년 1반 12번 · 담당 박선생'), row([el('button', { type: 'button', class: 'btn secondary row-btn ld-narrow', text: '학생 바꾸기' })], 'margin-top:8px')]),
    card('', [UI.emptyState('아직 진로 프로필을 내지 않았습니다. 마감(4월 9일(금))이 지났습니다.'), p('학생이 자기 화면에서 직접 냅니다. 선생님이 대신 낼 수 없습니다.')])]);
});

var REQS = [
  { id: 'r1', name: '1. 김가온 · 진로', sub: '희망 4월 14일(수) 외 1일', pill: UI.statusPill('requested', '신청') },
  { id: 'r2', name: '2. 최하늘 · 생활', sub: '희망 4월 15일(목)', pill: UI.statusPill('requested', '신청') },
  { id: 'r3', name: '2. 이나래 · 학습', sub: '4월 13일(화)에 상담', pill: UI.statusPill('confirmed', '확정') }
];
function reqHead(m) { m.appendChild(UI.segmented({ label: '보기', value: 'open', options: [{ value: 'open', label: '처리할 것 3' }, { value: 'past', label: '지난 신청' }], onchange: function () {} })); }
function dateRadios(v) {
  return el('div', { class: 'chips', role: 'radiogroup', 'aria-label': '상담할 날' }, ['4월 14일(수)', '4월 16일(금)'].map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === v ? ' on' : ''), role: 'radio', 'aria-checked': i === v ? 'true' : 'false', text: t }); }));
}
function reqDetail(homeroom) {
  var rows = [['주제', '진로'], ['희망 날짜', '4월 14일(수) · 4월 16일(금)'], ['신청한 날', '4월 12일(월)']];
  if (!homeroom) rows.push(['학생 메모', '진학 방향을 이야기하고 싶습니다.']);
  var out = [card('1. 김가온 · 진로 상담', [row([UI.statusPill('requested', '신청'), el('button', { type: 'button', class: 'btn secondary row-btn ld-narrow', text: '목록으로' })], 'justify-content:space-between;margin-bottom:8px'), kvs(rows)])];
  if (homeroom) out.push(card('', [p('담당 선생님(박선생)이 처리합니다. 담임 선생님은 날짜·주제·상태를 봅니다.')]));
  else {
    out.push(card('상담할 날 정하기', [p('학생이 고른 날 중 하나를 골라 주세요.'), dateRadios(0), row([btn('이 날로 확정', ''), btn('반려')], 'margin-top:12px'), p('확정하면 학생 화면에 날짜가 나옵니다.')]));
    out.push(card('상담 전에 보기', [UI.rowLink({ href: '#', text: '진로 프로필(3번째 · 4월 12일(월))' }), UI.rowLink({ href: '#', text: '학생 타임라인' })]));
  }
  return out;
}
def('t-req-list', '교사 · 상담 신청', '상담 신청 처리(목록)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '박선생', note: '담당 학생의 신청 목록. 신청 → 확정 순, 희망 날짜가 빠른 것부터.' });
  reqHead(m); listDetail(m, REQS, '', null, '왼쪽에서 신청을 고르면 내용이 여기에 나옵니다.');
});
def('t-req', '교사 · 상담 신청', '상담 신청 처리(날짜 확정·반려)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '박선생', note: '신청 한 건. 학생이 고른 날 중 하나를 골라 [이 날로 확정], 또는 [반려](사유 필수, 학생에게 보임 — 결정 95). 담당교사에게는 학생 메모가 보인다.' });
  reqHead(m); listDetail(m, REQS, 'r1', reqDetail(false));
});
def('t-req-reject', '교사 · 상담 신청', '상담 신청 반려(사유 입력)', { sheet: true }, function (root) {
  var m = frame(root, { title: '상담 신청', who: '박선생', note: '[반려] → 사유를 적어야 버튼이 켜진다(UI.confirmWithReason). 사유는 학생 화면에 "선생님 말씀"으로 나온다.' });
  reqHead(m); listDetail(m, REQS, 'r1', reqDetail(false));
  var s = UI.confirmWithReason({ title: '반려', message: '1. 김가온 · 진로 상담. 사유는 학생에게 그대로 보입니다. 반려한 신청은 되돌릴 수 없고, 학생이 새로 신청할 수 있습니다.', reasonLabel: '학생에게 보일 사유', confirmText: '반려', minLength: 2, onconfirm: function () {} });
  var ta = document.querySelector('.sheet textarea, .sheet input'); if (ta) { ta.value = '그 주는 시험 기간이라 어렵습니다. 다음 주로 다시 신청해 주세요.'; ta.dispatchEvent(new Event('input')); }
});
def('t-req-fixed', '교사 · 상담 신청', '상담 신청 처리(확정된 건 → 상담 완료)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '박선생', note: '확정된 건. 상담을 마치면 [상담일지 쓰기]로 넘어가고, 일지를 저장하면 신청이 "완료"가 되며 일지와 이어진다. 상담을 못 했으면 [반려].' });
  reqHead(m);
  listDetail(m, REQS, 'r3', [card('2. 이나래 · 학습 상담', [row([UI.statusPill('confirmed', '확정'), el('button', { type: 'button', class: 'btn secondary row-btn ld-narrow', text: '목록으로' })], 'justify-content:space-between;margin-bottom:8px'),
    kvs([['상담하는 날', '4월 13일(화)'], ['학생 메모', '(없음)']])]),
    card('상담을 마쳤으면', [p('상담일지를 쓰면 이 신청이 "완료"로 바뀌고 일지와 이어집니다.'), row([btn('상담일지 쓰기', ''), btn('반려')], 'margin-top:8px')])]);
});
def('t-req-homeroom', '교사 · 상담 신청', '담임이 보는 상담 신청(메모 없음, 보기만)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '최선생', note: '담임 최선생 화면 · 자기 반 학생의 신청을 날짜·주제·상태만 본다. 학생 메모 줄은 아예 없다(서버가 보내지 않음, 결정 96). 확정·반려 버튼도 없다.' });
  m.appendChild(UI.segmented({ label: '보기', value: 'open', options: [{ value: 'open', label: '진행 중 1' }, { value: 'past', label: '지난 신청' }], onchange: function () {} }));
  listDetail(m, [REQS[0]], 'r1', reqDetail(true));
});

def('t-note', '교사 · 상담일지', '상담일지 쓰기(신청에서 넘어온 진로 상담)', {}, function (root) {
  var m = frame(root, { title: '상담일지 쓰기', who: '박선생', bar: [{ text: '저장' }], note: '신청에서 [상담일지 쓰기]로 넘어온 모습. 2단계 상담일지 화면에 더해지는 것: ① 이어진 신청 줄 ② 유형에 진로·진학 ③ 참고한 프로필 버전(진로·진학일 때) ④ "합의 사항·다음 할 일" 칸(학생에게 보임). 내용 칸은 교사만.' });
  m.appendChild(el('div', { class: 'notice info', text: '1. 김가온의 진로 상담 신청(4월 14일(수) 확정)에서 넘어왔습니다. 저장하면 신청이 "완료"로 바뀝니다.' }));
  m.appendChild(card('누구와 언제', [kvs([['학생', '1. 김가온']]), UI.dateField({ label: '상담한 날', value: '2027-04-14', onchange: function () {} }),
    UI.field('유형', el('div', { class: 'chips' }, ['생활', '학습', '진로', '진학', '기타'].map(function (t) { return el('button', { type: 'button', class: 'chip' + (t === '진로' ? ' on' : ''), text: t }); })))]));
  m.appendChild(card('참고한 진로 프로필', [selectField('프로필 버전', ['3번째 · 4월 12일(월)에 냄 (가장 최근)', '2번째 · 4월 2일(금)에 냄', '참고하지 않음'], '3번째 · 4월 12일(월)에 냄 (가장 최근)', '어느 기록을 보고 상담했는지 남깁니다.'),
    kvs([['진로 희망', '1순위 보건·의료 · 간호사 / 2순위 교육 · 보건 교사'], ['목표 진학', '가람대학교 간호학과 · 학생부종합'], ['탐구 기록', '진행 중 1건 · 관심 1건 · 완료 1건']]), UI.rowLink({ href: '#', text: '학생 타임라인 열기' })]));
  m.appendChild(card('상담 내용', [area('내용', '간호학과 지원을 위해 생명과학Ⅱ 선택을 권함. 수학 부담을 크게 느끼고 있음.', '교사만 봅니다. 학생·학부모에게 보이지 않습니다.', 4)]));
  m.appendChild(card('합의 사항·다음 할 일', [area('합의 사항', '· 생명과학 탐구 보고서를 5월 중순까지 쓰기\n· 수학 질문은 화요일 자습 시간에 하기', '학생에게 보입니다. 학생이 "부모님께 보이기"를 켜면 학부모도 봅니다.', 3)]));
});

def('t-timeline', '교사 · 학생 타임라인', '학생 타임라인(프로필·탐구·상담·OUT·출결 요약)', {}, function (root) {
  var m = frame(root, { title: '학생 타임라인', who: '박선생', note: '한 학생의 기록을 최근 것부터 한 줄로. 종류 꼬리표 + 제목 + 한두 줄. 줄을 누르면 그 기록 화면으로 간다. 담임에게는 상담 줄이 날짜·교사·합의 사항만 나오고 [상담일지 열기]가 없다. 탐구 파일의 이름이 달랐으면 "이름 다름" 꼬리표(결정 93).' });
  m.appendChild(card('1. 김가온', [p('1학년 3반 5번 · 담당 박선생 · 담임 최선생 · 2027 1학기'), row([UI.statusPill('out1', '1OUT'), UI.statusPill('mute', '진로 프로필 3번째'), UI.statusPill('mute', '탐구 3건')], 'margin-top:8px')]));
  m.appendChild(UI.field('보기', el('div', { class: 'chips' }, ['전체', '진로', '탐구', '상담', 'OUT·출결'].map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === 0 ? ' on' : ''), text: t }); }))));
  m.appendChild(card('', [timeline([
    { d: '4월 12일(월)', tag: '진로 프로필', t: '3번째 기록을 냄', lines: ['목표 진학의 전형이 "아직 모름" → "학생부종합"으로 바뀜'] },
    { d: '4월 12일(월)', tag: '상담 신청', kind: 'requested', t: '진로 상담 신청', lines: ['희망 4월 14일(수) · 4월 16일(금)'] },
    { d: '4월 9일(금)', tag: '탐구', t: '손 씻기 시간에 따른 세균 수 변화', lines: ['진행 중 · 피드백 1건'] },
    { d: '4월 5일(월)', tag: '상담', kind: 'confirmed', t: '박선생 · 학습 상담', lines: ['합의: 수학 오답 노트를 주 2회 쓰기 / 4월 말에 다시 만나 점검하기'] },
    { d: '4월 2일(금)', tag: '탐구', t: '기록 파일 올림 · 새 기록 2건', lines: ['파일 속 이름이 계정 이름과 다름(학생이 "내 기록이 맞습니다"로 확인)'] },
    { d: '4월 2일(금)', tag: '진로 프로필', t: '2번째 기록을 냄', lines: ['2순위 직업이 "교사" → "보건 교사"로 바뀜'] },
    { d: '3월 24일(수)', tag: 'OUT', kind: 'out1', t: '1OUT · 휴대폰·전자기기', lines: [] },
    { d: '3월', tag: '출결', t: '3월 출결 요약', lines: ['출석 18일 · 지각 1 · 조퇴 0 · 결석 0 · 학원 4 · 가정 2'] },
    { d: '3월 8일(월)', tag: '진로 프로필', t: '1번째 기록을 냄', lines: [] }])]));
  var tl = document.querySelector('.tl'); if (tl) { var li = tl.children[4]; li.querySelector('.tl-b div').appendChild(document.createTextNode(' ')); li.querySelector('.tl-b div').appendChild(UI.statusPill('requested', '이름 다름')); }
});

/* ═════════ 8. 관리자 — 탐구 원본 정리 ═════════ */
function cleanupList() {
  var rows = [['3. 박다솜', '졸업 2026년 2월 12일(목)', '원본 파일 2개'], ['2. 이나래', '퇴실 2026년 3월 30일(월)', '원본 파일 1개'], ['3. 정한결', '졸업 2026년 2월 12일(목)', '원본 파일 3개']];
  return el('div', {}, rows.map(function (r, i) { return el('div', { class: 'ld-row' }, [el('label', { class: 'check', style: 'flex:1 1 auto' }, [(function () { var b = el('input', { type: 'checkbox' }); b.checked = i !== 1; return b; })(), el('span', {}, [el('b', { text: r[0] }), p(r[1] + ' · 1년 지남 · ' + r[2])])])]); }));
}
def('a-cleanup', '관리자 · 탐구 원본 정리', '탐구 원본 "정리 대상"', {}, function (root) {
  var m = frame(root, { title: '탐구 원본 정리', who: '관리자', bar: [{ text: '고른 5개 지우기', kind: 'danger' }], note: '관리자 화면 · 졸업·퇴실 뒤 1년이 지난 학생의 탐구 원본 파일만 나온다(결정 100). 자동으로 지우지 않는다. 관리자가 골라서 지운다. 학생 이름 옆 학년은 졸업·퇴실 때 학년.' });
  m.appendChild(el('div', { class: 'notice info', text: '졸업하거나 퇴실한 지 1년이 지난 학생의 탐구 원본 파일입니다. 개인정보를 오래 두지 않으려고 관리자 선생님이 확인하고 지웁니다.' }));
  m.appendChild(card('정리 대상 3명 · 원본 파일 6개', [cleanupList(), p('지워지는 것은 Drive의 원본 파일뿐입니다. 탐구 기록 요약은 "취소" 상태로 남습니다.')]));
});
def('a-cleanup-confirm', '관리자 · 탐구 원본 정리', '탐구 원본 지우기 확인 시트', { sheet: true }, function (root) {
  var m = frame(root, { title: '탐구 원본 정리', who: '관리자', bar: [{ text: '고른 5개 지우기', kind: 'danger' }], note: '관리자 화면 · 되돌릴 수 없는 동작이라 숫자와 함께 한 번 더 묻는다(빨간 버튼, 포커스는 [돌아가기]).' });
  m.appendChild(card('정리 대상 3명 · 원본 파일 6개', [cleanupList()]));
  UI.confirmSheet({ title: '원본 파일 지우기', lead: '학생 2명 · 원본 파일 5개', lines: ['Drive에서 원본 파일 5개를 지웁니다. 되돌릴 수 없습니다.', '탐구 기록 요약은 "취소" 상태로 남습니다.', '누가 언제 지웠는지 기록에 남습니다.', '지울까요?'], confirmText: '지우기', danger: true, onconfirm: function () {} });
});
def('a-cleanup-empty', '관리자 · 탐구 원본 정리', '탐구 원본 "정리 대상"(없음)', {}, function (root) {
  var m = frame(root, { title: '탐구 원본 정리', who: '관리자', note: '관리자 화면 · 빈 상태. 홈의 할 일 줄("탐구 원본 정리 대상 n명")도 0명이면 나오지 않는다.' });
  m.appendChild(card('', [UI.emptyState('지금 정리할 탐구 원본 파일이 없습니다.'), p('졸업·퇴실 뒤 1년이 지난 학생이 생기면 여기에 나옵니다.')]));
});

/* ═════════ 실행 ═════════ */
function renderScreen(id) {
  var s = SCREENS[id];
  var root = document.getElementById('app');
  if (!s) {
    root.appendChild(el('main', {}, [el('h1', { text: 'D24 시안 목록 (가짜 이름 · 정적 미리보기)' })].concat(ORDER.map(function (k) { return el('p', {}, [el('a', { href: '#' + k, text: SCREENS[k].group + ' · ' + SCREENS[k].label })]); }))));
    return;
  }
  s.fn(root);
  document.title = s.label;
}
window.addEventListener('hashchange', function () { location.reload(); });
renderScreen(location.hash.replace('#', ''));
document.body.setAttribute('data-ready', '1');
