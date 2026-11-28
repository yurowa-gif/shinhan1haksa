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
/** 입력 화면용: 아직 내지 않았으므로 "지금"이 아니라 "제출하면"으로 말한다(D26). 지금 상태는 화면 맨 위 한 줄로 */
function shareDraft(on) {
  return el("div", { class: "share" }, [checkRow("부모님께 보이기", on), on ? UI.statusPill("requested", "제출하면 보임") : UI.statusPill("mute", "제출해도 나만 봄")]);
}
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
  m.appendChild(card('', [el('b', { text: '지금 부모님께 보이는 항목: 진로 희망, 목표 진학' }), p('아래에서 "부모님께 보이기"를 바꿔도 [제출하기]를 눌러야 바뀝니다.')]));
  var c1 = card('진로 희망', [p('1순위는 꼭 적어 주세요. 2·3순위는 있으면 적습니다.'), hopeRow(1, v.h1[0], v.h1[1]), hopeRow(2, v.h2[0], v.h2[1]), hopeRow(3, '', ''), shareDraft(v.sh.hopes)]);
  var c2 = card('목표 진학', [p('가고 싶은 대학·학과가 있으면 적어 주세요. 없으면 비워 둬도 됩니다.'), targetRow(1, v.t1[0], v.t1[1], v.t1[2]), btn('+ 목표 추가'), shareDraft(v.sh.targets)]);
  var c3 = card('관심 분야', [area('요즘 관심 있는 것', v.interests, '과목·활동·책 무엇이든 좋습니다.'), shareDraft(v.sh.interests)]);
  var c4 = card('강점', [area('내가 잘하는 것', v.strengths), shareDraft(v.sh.strengths)]);
  var c5 = card('고민', [area('걱정되거나 도움이 필요한 것', v.concerns, '담당 선생님이 상담 전에 읽습니다.'), shareDraft(v.sh.concerns)]);
  [c1, c2, c3, c4, c5].forEach(function (c) { m.appendChild(c); });
  return { c1: c1, c2: c2 };
}
var CAREER = { h1: ['보건·의료', '간호사'], h2: ['교육', '보건 교사'], t1: ['가람대학교', '간호학과', '학생부종합'], interests: '생명과학 수업, 응급 처치 동아리', strengths: '꾸준히 기록하는 습관이 있습니다.', concerns: '수학 성적이 걱정됩니다.',
  sh: { hopes: true, targets: true, interests: false, strengths: false, concerns: false } };

def('s-career-form', '학생 · 진로 프로필', '진로 프로필 내기(지난번 내용을 불러온 모습)', {}, function (root) {
  soft();
  var m = frame(root, { title: '진로 프로필', who: ME, bar: [{ text: '제출하기' }], note: '학생 화면 · 지난번(2번째) 내용을 불러와 고쳐 내는 모습. 공개 항목은 지난번 것을 이어받는다(결정 89). 입력 화면의 꼬리표는 "제출하면 보임"·"제출해도 나만 봄"(아직 내지 않았으므로 "지금"이라고 하지 않는다, D26) — 사진은 관심 분야를 새로 켠 모습. 처음 내는 학생은 모든 칸이 비고 모든 "부모님께 보이기"가 꺼져 있다.' });
  m.appendChild(el('div', { class: 'notice info', text: '지난번에 낸 내용을 불러왔습니다. 바뀐 곳만 고쳐서 내면 새 기록으로 쌓이고, 지난 기록은 그대로 남습니다.' }));
  m.appendChild(card('', [el('b', { text: '이번 학기 제출 마감: 4월 16일(금)' }), p('마감 뒤에도 생각이 바뀌면 언제든 다시 낼 수 있습니다.')]));
  careerForm(m, Object.assign({}, CAREER, { sh: { hopes: true, targets: true, interests: true, strengths: false, concerns: false } }));
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
  m.appendChild(card('상담', [UI.emptyState('보여 드릴 상담 기록이 없습니다.')]));
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
      el('div', { style: 'margin-top:12px' }, [area('피드백 쓰기 (학생에게 보임)', '', '학부모에게는 보이지 않습니다. 학생이 보면 안 되는 내용은 상담일지에 써 주세요.')]),
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
  var m = frame(root, { title: '상담 신청', who: '박선생', note: '신청 한 건. 학생이 고른 날 중 하나로만 [이 날로 확정](다른 날이면 반려하고 사유에 적는다, 결정 103), 또는 [반려](사유 필수, 학생에게 보임 — 결정 95). 담당교사에게는 학생 메모가 보인다.' });
  reqHead(m); listDetail(m, REQS, 'r1', reqDetail(false));
});
def('t-req-reject', '교사 · 상담 신청', '상담 신청 반려(사유 입력)', { sheet: true }, function (root) {
  var m = frame(root, { title: '상담 신청', who: '박선생', note: '[반려] → 사유를 적어야 버튼이 켜진다(UI.confirmWithReason). 사유는 학생 화면에 "선생님 말씀"으로 나온다.' });
  reqHead(m); listDetail(m, REQS, 'r1', reqDetail(false));
  var s = UI.confirmWithReason({ title: '반려', message: '1. 김가온 · 진로 상담. 사유는 학생에게 그대로 보입니다. 반려한 신청은 되돌릴 수 없고, 학생이 새로 신청할 수 있습니다.', reasonLabel: '학생에게 보일 사유', confirmText: '반려', minLength: 2, onconfirm: function () {} });
  var ta = document.querySelector('.sheet textarea, .sheet input'); if (ta) { ta.value = '그 주는 시험 기간이라 어렵습니다. 다음 주로 다시 신청해 주세요.'; ta.dispatchEvent(new Event('input')); }
});
def('t-req-fixed', '교사 · 상담 신청', '상담 신청 처리(확정된 건 → 상담 완료)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '박선생', note: '확정된 건. 상담을 마치면 [상담일지 쓰기]로 넘어가고, 일지를 저장하면 신청이 "완료"가 되며 일지와 이어진다. 상담을 못 했으면 [상담 못 함](상태는 반려 + 사유, 결정 103).' });
  reqHead(m);
  listDetail(m, REQS, 'r3', [card('2. 이나래 · 학습 상담', [row([UI.statusPill('confirmed', '확정'), el('button', { type: 'button', class: 'btn secondary row-btn ld-narrow', text: '목록으로' })], 'justify-content:space-between;margin-bottom:8px'),
    kvs([['상담하는 날', '4월 13일(화)'], ['학생 메모', '(없음)']])]),
    card('상담을 마쳤으면', [p('상담일지를 쓰면 이 신청이 "완료"로 바뀌고 일지와 이어집니다.'), row([btn('상담일지 쓰기', ''), btn('상담 못 함')], 'margin-top:8px'), p('상담을 못 했으면 [상담 못 함]을 누르고 사유를 적습니다. 신청은 "반려"가 되고 사유가 학생에게 보입니다.')])]);
});
def('t-req-homeroom', '교사 · 상담 신청', '담임이 보는 상담 신청(메모 없음, 보기만)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '최선생', note: '담임 최선생 화면 · 자기 반 학생의 신청을 날짜·주제·상태만 본다. 학생 메모 줄은 아예 없다(서버가 보내지 않음, 결정 96). 확정·반려 버튼도 없다.' });
  m.appendChild(UI.segmented({ label: '보기', value: 'open', options: [{ value: 'open', label: '진행 중 1' }, { value: 'past', label: '지난 신청' }], onchange: function () {} }));
  listDetail(m, [REQS[0]], 'r1', reqDetail(true));
});

var NOTE_AGREE = '· 생명과학 탐구 보고서를 5월 중순까지 쓰기\n· 수학 질문은 화요일 자습 시간에 하기';
/** 교사가 쓰는 글 칸: 누구에게 보이는지를 카드 제목 줄에 꼬리표로(D27) */
function audCard(title, kind, tag, nodes) {
  return card('', [row([el('h2', { text: title, style: 'margin:0' }), UI.statusPill(kind, tag)], 'justify-content:space-between;margin-bottom:8px')].concat(nodes));
}
def('t-note', '교사 · 상담일지', '상담일지 쓰기(신청에서 넘어온 진로 상담)', {}, function (root) {
  var m = frame(root, { title: '상담일지 쓰기', who: '박선생', bar: [{ text: '저장' }], note: '신청에서 [상담일지 쓰기]로 넘어온 모습. 2단계 상담일지 화면에 더해지는 것: ① 이어진 신청 줄 ② 유형에 진학이 더해지고 신청 주제와 같은 유형을 미리 골라 준다(결정 103) ③ 참고한 프로필 버전(진로·진학일 때) ④ "합의 사항·다음 할 일" 칸. 두 글 칸은 누구에게 보이는지를 제목과 꼬리표로 적는다(D27): 내용 = 교사만 봄, 합의 사항 = 학생에게 보임.' });
  m.appendChild(el('div', { class: 'notice info', text: '1. 김가온의 진로 상담 신청(4월 14일(수) 확정)에서 넘어왔습니다. 저장하면 신청이 "완료"로 바뀝니다.' }));
  m.appendChild(card('누구와 언제', [kvs([['학생', '1. 김가온']]), UI.dateField({ label: '상담한 날', value: '2027-04-14', onchange: function () {} }),
    UI.field('유형', el('div', { class: 'chips' }, ['학습', '생활', '진로', '진학', '건강', '가정', '기타'].map(function (t) { return el('button', { type: 'button', class: 'chip' + (t === '진로' ? ' on' : ''), text: t }); })))]));
  m.appendChild(card('참고한 진로 프로필', [selectField('프로필 버전', ['3번째 · 4월 12일(월)에 냄 (가장 최근)', '2번째 · 4월 2일(금)에 냄', '참고하지 않음'], '3번째 · 4월 12일(월)에 냄 (가장 최근)', '어느 기록을 보고 상담했는지 남깁니다.'),
    kvs([['진로 희망', '1순위 보건·의료 · 간호사 / 2순위 교육 · 보건 교사'], ['목표 진학', '가람대학교 간호학과 · 학생부종합'], ['탐구 기록', '진행 중 1건 · 관심 1건 · 완료 1건']]), UI.rowLink({ href: '#', text: '학생 타임라인 열기' })]));
  m.appendChild(audCard('상담 내용 (교사만)', 'mute', '교사만 봄', [area('내용', '간호학과 지원을 위해 생명과학Ⅱ 선택을 권함. 수학 부담을 크게 느끼고 있음.', '학생·학부모에게 보이지 않습니다. 저장한 뒤에는 고치지 않습니다(취소하고 새로 씁니다).', 4)]));
  m.appendChild(audCard('합의 사항·다음 할 일 (학생에게 보임)', 'requested', '학생에게 보임', [area('합의 사항 (선택)', NOTE_AGREE, '저장하면 학생 화면에 바로 나옵니다. 학생이 "부모님께 보이기"를 켜면 학부모도 봅니다. 민감한 내용은 위 상담 내용 칸에 적어 주세요.', 3)]));
});
def('t-note-confirm', '교사 · 상담일지', '상담일지 저장 확인(합의 사항이 있을 때)', { sheet: true }, function (root) {
  var m = frame(root, { title: '상담일지 쓰기', who: '박선생', bar: [{ text: '저장' }], note: '합의 사항 칸에 글이 있으면 저장 전에 한 번 묻는다(D27). 합의 사항이 비어 있으면 이 창 없이 바로 저장한다. 학생에게 보일 글을 그대로 다시 보여 준다.' });
  m.appendChild(audCard('상담 내용 (교사만)', 'mute', '교사만 봄', [area('내용', '간호학과 지원을 위해 생명과학Ⅱ 선택을 권함. 수학 부담을 크게 느끼고 있음.', '', 4)]));
  m.appendChild(audCard('합의 사항·다음 할 일 (학생에게 보임)', 'requested', '학생에게 보임', [area('합의 사항 (선택)', NOTE_AGREE, '', 3)]));
  UI.confirmSheet({ title: '저장', lead: '합의 사항이 학생에게 보입니다',
    lines: ['· 생명과학 탐구 보고서를 5월 중순까지 쓰기', '· 수학 질문은 화요일 자습 시간에 하기', '상담 내용은 교사만 봅니다.', '저장한 뒤에는 고칠 수 없습니다(취소하고 새로 씁니다).', '저장할까요?'], confirmText: '저장', onconfirm: function () {} });
});

/* 타임라인 공통(D28, 결정 104): 기간 구분 줄 + 보는 사람에 따라 달라지는 머리 안내 */
function tlStyles() {
  if (document.getElementById('tl-extra')) return;
  document.head.appendChild(el('style', { id: 'tl-extra', text: '.tl-term{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:16px 4px 4px;padding-bottom:4px;border-bottom:2px solid var(--line)}.tl-term b{font-size:var(--font-lg)}.tl-term .muted{font-size:var(--font-sm)}' }));
}
function tlTerm(name, sub, pill) { return el('div', { class: 'tl-term' }, [el('div', {}, [el('b', { text: name }), sub ? el('div', { class: 'muted', text: sub }) : null]), pill || null]); }
function tlHead(o) {
  return card('1. 김가온', [p(o.sub), row([UI.statusPill('out1', '1OUT'), UI.statusPill('mute', '진로 프로필 3번째'), UI.statusPill('mute', '탐구 3건')].concat(o.pills || []), 'margin-top:8px')]);
}
function tlChips() { return UI.field('보기', el('div', { class: 'chips' }, ['전체', '진로', '탐구', '상담', 'OUT·출결'].map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === 0 ? ' on' : ''), text: t }); }))); }
var TL_NOW = [
  { d: '4월 12일(월)', tag: '진로 프로필', t: '3번째 기록을 냄', lines: [] },
  { d: '4월 12일(월)', tag: '상담 신청', kind: 'requested', t: '진로 상담 신청', lines: ['희망 4월 14일(수) · 4월 16일(금)'] },
  { d: '4월 9일(금)', tag: '탐구', t: '손 씻기 시간에 따른 세균 수 변화', lines: ['진행 중 · 피드백 1건'] },
  { d: '4월 5일(월)', tag: '상담', kind: 'confirmed', t: '박선생 · 학습 상담', lines: ['합의: 수학 오답 노트를 주 2회 쓰기 / 4월 말에 다시 만나 점검하기'] },
  { d: '4월 2일(금)', tag: '탐구', t: '기록 파일 올림 · 새 기록 2건', lines: ['파일 속 이름이 계정 이름과 다름(학생이 "내 기록이 맞습니다"로 확인)'], extra: 'name' },
  { d: '3월 24일(수)', tag: 'OUT', kind: 'out1', t: '1OUT · 휴대폰·전자기기', lines: [] },
  { d: '3월', tag: '출결', t: '3월 출결 요약', lines: ['출석 18일 · 지각 1 · 조퇴 0 · 결석 0 · 학원 4 · 가정 2'] }
];
var TL_PAST = [
  { d: '12월 14일(월)', tag: '상담', kind: 'confirmed', t: '김선생 · 진로 상담', lines: ['합의: 겨울방학에 간호학과 전공 체험 프로그램 알아보기'] },
  { d: '11월 2일(월)', tag: '진로 프로필', t: '2번째 기록을 냄', lines: [] },
  { d: '9월 7일(월)', tag: '진로 프로필', t: '1번째 기록을 냄', lines: [] },
  { d: '2학기', tag: '출결', t: '2학기 출결 요약', lines: ['출석 71일 · 지각 2 · 조퇴 1 · 결석 0'] }
];
function tlList(items) {
  var ul = timeline(items);
  items.forEach(function (it, i) { if (it.extra === 'name') { var b = ul.children[i].querySelector('.tl-b div'); b.appendChild(document.createTextNode(' ')); b.appendChild(UI.statusPill('requested', '이름 다름')); } });
  return card('', [ul]);
}

def('t-timeline', '교사 · 학생 타임라인', '학생 타임라인(지금 담당: 이번 기간 + 지난 기간)', {}, function (root) {
  tlStyles();
  var m = frame(root, { title: '학생 타임라인', who: '박선생', note: '지금 담당교사가 보는 모습. 운영 기간마다 구분 줄을 두고 최근 기간이 위. 지금 담당은 전 담당 때의 기록(상담 내용 포함)도 본다(결정 104) — 지난 기간 구분 줄에 그때 담당을 적는다. 줄을 누르면 그 기록 화면으로 간다. 지난 기간의 기록에는 쓰는 단추가 없다(피드백·일지는 이번 기간 것만 새로 쓴다).' });
  m.appendChild(tlHead({ sub: '1학년 3반 5번 · 담당 박선생 · 담임 최선생' }));
  m.appendChild(tlChips());
  m.appendChild(tlTerm('2027 1학기', '담당 박선생', UI.statusPill('confirmed', '이번 기간')));
  m.appendChild(tlList(TL_NOW));
  m.appendChild(tlTerm('2026 2학기', '그때 담당 김선생', UI.statusPill('mute', '지난 기간')));
  m.appendChild(tlList(TL_PAST));
  m.appendChild(p('이 학생이 학사에 처음 들어온 2026 2학기부터의 기록입니다.'));
});

def('t-timeline-former', '교사 · 학생 타임라인', '학생 타임라인(전 담당: 자기 기간만, 읽기 전용)', {}, function (root) {
  tlStyles();
  var m = frame(root, { title: '학생 타임라인', who: '김선생', note: '전 담당 김선생이 보는 모습(결정 104). 자기가 담당했던 기간의 기록만 나오고, 그 뒤 기간은 구분 줄조차 없다. 쓰기(피드백·상담일지·신청 처리)는 못 한다 — 머리 꼬리표 "읽기 전용"과 맨 위 안내로 알린다. 줄을 눌러 들어간 화면에서도 쓰는 단추가 없다.' });
  m.appendChild(el('div', { class: 'notice info', text: '2026 2학기에 담당했던 학생입니다. 그 기간의 기록만 보이고, 새로 쓰거나 고칠 수 없습니다. 지금 담당은 박선생 선생님입니다.' }));
  m.appendChild(card('1. 김가온', [p('1학년 3반 5번 · 지금 담당 박선생'), row([UI.statusPill('mute', '읽기 전용')], 'margin-top:8px')]));
  m.appendChild(tlChips());
  m.appendChild(tlTerm('2026 2학기', '내가 담당', UI.statusPill('mute', '지난 기간')));
  m.appendChild(tlList(TL_PAST));
  m.appendChild(p('2027 1학기부터의 기록은 지금 담당 선생님이 봅니다.'));
});

def('t-timeline-homeroom', '교사 · 학생 타임라인', '학생 타임라인(담임: 이번 기간만, 보기만)', {}, function (root) {
  tlStyles();
  var m = frame(root, { title: '학생 타임라인', who: '최선생', note: '담임 최선생이 보는 모습. 자기 반 + 이번 기간 등록 학생의 이번 기간 기록만(결정 104 총괄 가정). 상담 신청 줄에 학생 메모가 없고(결정 96), 줄을 눌러도 처리 단추가 없는 보기 화면으로 간다. 지난 기간 구분 줄은 없다.' });
  m.appendChild(el('div', { class: 'notice info', text: '담임 선생님은 이번 학기 기록을 볼 수 있습니다. 피드백·상담 신청 처리는 담당 선생님(박선생)이 합니다.' }));
  m.appendChild(card('1. 김가온', [p('1학년 3반 5번 · 담당 박선생'), row([UI.statusPill('out1', '1OUT'), UI.statusPill('mute', '진로 프로필 3번째'), UI.statusPill('mute', '보기만')], 'margin-top:8px')]));
  m.appendChild(tlChips());
  m.appendChild(tlTerm('2027 1학기', '담당 박선생', UI.statusPill('confirmed', '이번 기간')));
  m.appendChild(tlList(TL_NOW));
});

def('t-timeline-empty', '교사 · 학생 타임라인', '학생 타임라인(기록 없음)', {}, function (root) {
  tlStyles();
  var m = frame(root, { title: '학생 타임라인', who: '박선생', note: '이번 기간에 새로 들어와 아직 기록이 없는 학생. 기간 구분 줄은 그리고 그 아래에 빈 상태를 둔다. 보기 칩으로 걸렀는데 없을 때는 "이 종류의 기록이 없습니다."' });
  m.appendChild(card('2. 이나래', [p('2학년 1반 12번 · 담당 박선생 · 입실 4월 6일(화)')]));
  m.appendChild(tlChips());
  m.appendChild(tlTerm('2027 1학기', '담당 박선생', UI.statusPill('confirmed', '이번 기간')));
  m.appendChild(card('', [UI.emptyState('아직 기록이 없습니다.'), p('진로 프로필을 내거나 상담·탐구 기록이 생기면 여기에 날짜순으로 나옵니다.')]));
});

def('t-timeline-pick', '교사 · 학생 타임라인', '학생 고르기(담당교사: 지금 담당 + 전에 담당한 학생)', {}, function (root) {
  var m = frame(root, { title: '학생 타임라인', who: '김선생', note: '홈에서 [학생 타임라인]으로 들어왔을 때. 지금 담당 학생과 "전에 담당한 학생"을 나눠 보인다(결정 104). 전에 담당한 학생은 그 기간과 "읽기 전용"을 줄에 적는다. 다른 화면(진로 프로필·상담 신청·상담일지)의 [학생 타임라인 열기]로 오면 이 목록 없이 그 학생으로 바로 간다.' });
  m.appendChild(UI.field('학생 찾기', el('input', { type: 'text', placeholder: '이름 또는 학번' })));
  m.appendChild(h2('지금 담당 학생 3명'));
  listDetail(m, [{ id: 'a', name: '2. 최하늘', sub: '2학년 2반 3번 · 최근 기록 4월 9일(금)' }, { id: 'b', name: '3. 박다솜', sub: '3학년 2반 7번 · 최근 기록 4월 2일(금)' }, { id: 'c', name: '1. 정한결', sub: '1학년 1반 9번 · 기록 없음' }], '', null, '왼쪽에서 학생을 고르면 타임라인이 여기에 나옵니다.');
  m.appendChild(h2('전에 담당한 학생 1명'));
  m.appendChild(card('', [el('div', { class: 'ld-row' }, [el('button', { type: 'button', class: 'ld-pick' }, [el('span', { class: 'ld-name', text: '1. 김가온' }), el('span', { class: 'muted', text: '2026 2학기에 담당 · 지금 담당 박선생' })]), el('span', { style: 'flex:0 0 auto;white-space:nowrap' }, [UI.statusPill('mute', '읽기 전용')])])]));
});

def('t-timeline-hr-home', '교사 · 학생 타임라인', '담임 홈에서 들어가는 길(우리 반 학사생)', {}, function (root) {
  root.appendChild(el('header', { class: 'top' }, [el('h1', { text: '신한1학사 · 담임' }), el('div', { class: 'who', text: '최선생' })]));
  var m = el('main', { class: 'home' }); root.appendChild(m);
  m.appendChild(noteBox('담임 최선생 홈 · 담임이 타임라인으로 가는 길은 "우리 반 학사생" 카드의 학생 줄이다(이름 링크가 아니라 줄 끝의 [타임라인]). 담임 홈에는 처리할 일 줄(상담 신청·미제출)을 넣지 않는다. 학사를 나간 학생은 이 목록에 없다.'));
  m.appendChild(card('우리 반 학사생 (2명)', [p('2027 1학기 · 이번 학기 기록을 볼 수 있습니다.'),
    el('div', { class: 'ld-row' }, [el('div', { style: 'flex:1 1 auto;padding:8px 0' }, [el('b', { text: '5번 김가온' }), p('담당 박선생 · 진로 프로필 3번째 · 상담 1건')]), btn('타임라인')]),
    el('div', { class: 'ld-row' }, [el('div', { style: 'flex:1 1 auto;padding:8px 0' }, [el('b', { text: '25번 권보람' }), p('담당 이선생 · 진로 프로필 안 냄')]), btn('타임라인')]),
    UI.rowLink({ href: '#', text: '우리 반 진로 프로필 보기' })]));
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

/* ═════════ 9. 이수 계획 (F15, 결정 99·102) ═════════ */
var TERMS6 = ['2학년 1학기', '2학년 2학기', '3학년 1학기', '3학년 2학기'];
function termChips(on) { return el('div', { class: 'chips', role: 'radiogroup', 'aria-label': '학년·학기', style: 'margin-bottom:12px' }, TERMS6.map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === on ? ' on' : ''), role: 'radio', 'aria-checked': i === on ? 'true' : 'false', text: t }); })); }
function recCard(open) {
  return card('희망 학과가 권하는 과목 (참고)', [el('b', { text: '가람대학교 간호학과' }), kvs([['핵심 권장', '생명과학, 화학'], ['권장', '확률과 통계, 생활과 윤리']]),
    p('출처: 2028학년도 가람대학교 전공 연계 과목 안내 · 기준 2028학년도'), p('참고 자료입니다. 이 과목을 들어야만 지원할 수 있다는 뜻이 아닙니다. 궁금하면 담당 선생님과 이야기해 주세요.'),
    open ? null : UI.rowLink({ href: '#', text: '출처 열기' })]);
}
function recPill(k) { return k ? UI.statusPill('mute', k === 'core' ? '핵심 권장' : '권장') : null; }
/** 선택군 카드: courses = [[이름, 고름, 권장 종류]] . full이면 고르지 않은 칸은 꺼진다(택N 초과 막기) */
function groupCard(name, n, courses, opts) {
  opts = opts || {};
  var picked = courses.filter(function (c) { return c[1]; }).length, full = picked >= n;
  var c = card(name + ' · ' + n + '과목 고르기', [row([UI.statusPill(picked === n ? 'confirmed' : picked > n ? 'out1' : 'mute', picked + '/' + n + ' 고름')], 'margin-bottom:4px')]);
  courses.forEach(function (x) {
    var box = el('input', { type: 'checkbox' }); box.checked = !!x[1]; if (!x[1] && full && !opts.over) box.disabled = true;
    c.appendChild(el('div', { class: 'ld-row' }, [el('label', { class: 'check', style: 'flex:1 1 auto' }, [box, el('span', { text: x[0] })]), recPill(x[2])]));
  });
  if (opts.over) c.appendChild(el('div', { class: 'error', style: 'margin:8px 0 0', text: name + '에서는 ' + n + '과목까지 고를 수 있습니다. 하나를 빼 주세요.' }));
  else if (full) c.appendChild(p(n + '과목을 모두 골랐습니다. 바꾸려면 고른 과목 하나를 먼저 빼 주세요.'));
  return c;
}
function planEdit(m, over) {
  m.appendChild(termChips(0));
  m.appendChild(card('꼭 듣는 과목', [p('문학, 수학Ⅰ, 영어Ⅰ, 체육1', ''), p('모두 함께 듣는 과목이라 고르지 않습니다.')]));
  m.appendChild(groupCard('선택군 A', 2, [['생명과학', true, 'core'], ['화학', true, 'core'], ['물리학', !!over, ''], ['지구과학', false, '']], { over: over }));
  m.appendChild(groupCard('선택군 B', 1, [['확률과 통계', false, 'rec'], ['기하', false, ''], ['경제', false, '']]));
}
def('s-plan-edit', '학생 · 이수 계획', '이수 계획 고르기(한 학기)', {}, function (root) {
  soft();
  var m = frame(root, { title: '이수 계획', who: ME, bar: [{ text: '저장' }], note: '학생 화면 · 학년·학기 칩으로 학기를 고르고, 선택군마다 정해진 수만큼 과목을 고른다. 정해진 수를 다 고르면 남은 칸이 꺼진다(택N 초과 막기). 희망 학과가 권하는 과목에는 "핵심 권장"·"권장" 꼬리표(참고, 판정 아님).' });
  m.appendChild(recCard());
  planEdit(m, false);
});
def('s-plan-error', '학생 · 이수 계획', '이수 계획 고르기(정해진 수보다 많이 고름)', {}, function (root) {
  soft();
  var m = frame(root, { title: '이수 계획', who: ME, bar: [{ text: '저장' }], note: '학생 화면 · 화면에서 막아도 서버가 한 번 더 검사한다(coursePlanCheck_). 그때 나오는 오류 모습. 저장되지 않는다.' });
  m.appendChild(el('div', { class: 'error', text: '고칠 곳이 1군데 있습니다. 저장하지 않았습니다.' }));
  planEdit(m, true);
});
function planRow(course, group, state, on, cancelable) {
  return el('div', { style: 'padding:8px 0;border-bottom:1px solid var(--line)' }, [row([el('b', { text: course }), UI.statusPill(state === '확정' ? 'confirmed' : 'mute', state)], 'justify-content:space-between'), p(group), share(on)]);
}
def('s-plan', '학생 · 이수 계획', '내 이수 계획(고른 과목·부모님께 보이기·선생님 확인)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 이수 계획', who: ME, bar: [{ text: '과목 고르기' }], note: '학생 화면 · 고른 과목을 학기별로. 과목 줄마다 상태(계획 = 내가 고름, 확정 = 담당 선생님이 확인함)와 "부모님께 보이기"(기본 꺼짐). 확정된 과목을 바꾸면 옛 줄은 취소로 남고 새 줄은 다시 "계획"이 된다(결정 99).' });
  m.appendChild(el('div', { class: 'notice info', text: '"확정"은 담당 선생님이 확인했다는 표시입니다. 확정된 과목을 바꾸면 다시 "계획"이 되고 선생님이 다시 확인합니다.' }));
  m.appendChild(card('2학년 1학기', [planRow('생명과학', '선택군 A', '확정', true), planRow('화학', '선택군 A', '확정', true), planRow('확률과 통계', '선택군 B', '계획', false)]));
  m.appendChild(card('2학년 2학기', [UI.emptyState('아직 고른 과목이 없습니다.', { text: '과목 고르기', onclick: function () {} })]));
  m.appendChild(card('선생님 말씀', [el('div', { class: 'fb' }, [el('b', { text: '박선생 선생님 · 4월 10일(토)' }), p('선택군 A는 잘 골랐습니다. 선택군 B는 상담 때 같이 정합시다.', '')]), p('선생님 말씀은 나와 선생님만 봅니다. 부모님께는 보이지 않습니다.')]));
  m.appendChild(recCard(true));
});
def('s-plan-empty', '학생 · 이수 계획', '이수 계획(교육과정이 아직 없음)', {}, function (root) {
  soft();
  var m = frame(root, { title: '내 이수 계획', who: ME, note: '학생 화면 · 관리자가 그 입학년도 편제표를 아직 올리지 않았을 때. 고를 것이 없으므로 아래 바가 없다.' });
  m.appendChild(card('', [UI.emptyState('아직 우리 학년의 교육과정이 올라오지 않았습니다.'), p('올라오면 여기에서 과목을 고를 수 있습니다. 급하면 담당 선생님께 알려 주세요.')]));
});
def('p-plan', '학부모', '자녀의 이수 계획(공개된 과목)', {}, function (root) {
  var m = parentFrame(root, '학부모 화면 · "진로와 상담" 화면의 진로 카드 아래에 더해지는 카드. 자녀가 "보이기"를 켠 과목 줄만. 켜지 않은 과목·학기는 나오지 않는다. 권장 과목 참고 자료와 선생님 말씀은 없다.');
  m.appendChild(card('이수 계획', [kvs([['2학년 1학기', ['생명과학 ', UI.statusPill('confirmed', '확정'), el('br'), '화학 ', UI.statusPill('confirmed', '확정')]]]), p('"확정"은 담당 선생님이 확인한 과목입니다.')]));
});

function tPlanDetail(homeroom) {
  function trow(course, group, state, checked, pub) {
    var left = state === '확정' || homeroom ? el('div', { style: 'flex:1 1 auto;padding:8px 0' }, [el('b', { text: course }), p(group)]) : el('label', { class: 'check', style: 'flex:1 1 auto' }, [(function () { var b = el('input', { type: 'checkbox' }); b.checked = checked; return b; })(), el('span', {}, [el('b', { text: course }), p(group)])]);
    return el('div', { class: 'ld-row' }, [left, el('span', { style: 'flex:0 0 auto;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end' }, [pub ? UI.statusPill('mute', '학부모에게 보임') : null, UI.statusPill(state === '확정' ? 'confirmed' : 'mute', state)])]);
  }
  var out = [card('1. 김가온', [p('1학년 3반 5번 · 2027학년도 입학 · 담당 박선생'), row([btn('학생 타임라인 열기'), el('button', { type: 'button', class: 'btn secondary row-btn ld-narrow', text: '학생 바꾸기' })], 'margin-top:8px')]),
    card('2학년 1학기', [trow('생명과학', '선택군 A · 2과목 중', '확정', false, true), trow('화학', '선택군 A · 2과목 중', '확정', false, true), trow('확률과 통계', '선택군 B · 1과목 중', '계획', true, false),
      homeroom ? null : row([btn('고른 1과목 확정', '')], 'margin-top:8px'), homeroom ? null : p('확정은 선생님이 확인했다는 표시입니다. 학생이 과목을 바꾸면 그 줄은 다시 "계획"이 됩니다.')]),
    card('2학년 2학기', [UI.emptyState('학생이 아직 고르지 않았습니다.')]),
    card('희망 학과가 권하는 과목 (참고)', [el('b', { text: '가람대학교 간호학과' }), kvs([['핵심 권장', '생명과학, 화학'], ['권장', '확률과 통계, 생활과 윤리']]), p('출처: 2028학년도 가람대학교 전공 연계 과목 안내 · 기준 2028학년도. 참고 자료이며 판정하지 않습니다.')])];
  var fb = [el('div', { class: 'fb' }, [el('b', { text: '박선생 · 4월 10일(토)' }), p('선택군 A는 잘 골랐습니다. 선택군 B는 상담 때 같이 정합시다.', '')])];
  if (!homeroom) fb.push(el('div', { style: 'margin-top:12px' }, [area('피드백 쓰기 (학생에게 보임)', '', '학부모에게는 보이지 않습니다. 학생이 보면 안 되는 내용은 상담일지에 써 주세요.')]), row([btn('피드백 남기기', '')], ''));
  out.push(card('피드백', fb));
  return out;
}
var PLANS = [
  { id: 's1', name: '1. 김가온', sub: '2학년 1학기 3과목 · 확인할 것 1', pill: UI.statusPill('todo', '확인 1') },
  { id: 's4', name: '2. 최하늘', sub: '3학년 1학기 4과목 · 모두 확정', pill: UI.statusPill('confirmed', '확정') },
  { id: 's2', name: '2. 이나래', sub: '고른 과목 없음', pill: UI.statusPill('mute', '안 고름') }
];
def('t-plan-list', '교사 · 이수 계획', '담당 학생 이수 계획(목록)', {}, function (root) {
  var m = frame(root, { title: '이수 계획', who: '박선생', note: '담당 학생 목록. 학생이 고쳐서 "계획" 상태인 줄이 있으면 "확인 n"(살구 — 선생님이 처리할 일). 고르지 않은 학생은 회색(마감이 없어 미제출로 세지 않는다).' });
  listDetail(m, PLANS, '', null, '왼쪽에서 학생을 고르면 이수 계획이 여기에 나옵니다.');
});
def('t-plan', '교사 · 이수 계획', '담당 학생 이수 계획(확정 표시 + 피드백)', {}, function (root) {
  var m = frame(root, { title: '이수 계획', who: '박선생', note: '"계획" 줄에만 체크 칸이 있다. 골라서 [고른 n과목 확정]. 확정을 되돌리는 버튼은 두지 않는다(학생이 바꾸면 새 줄이 "계획"으로 생긴다). 피드백 문구는 진로 프로필과 같다. 담임이 보면 체크 칸·확정 버튼·피드백 입력이 없다.' });
  listDetail(m, PLANS, 's1', tPlanDetail(false));
});
def('t-plan-confirm', '교사 · 이수 계획', '이수 계획 확정 확인 시트', { sheet: true }, function (root) {
  var m = frame(root, { title: '이수 계획', who: '박선생', note: '[고른 n과목 확정] 확인창.' });
  listDetail(m, PLANS, 's1', tPlanDetail(false));
  UI.confirmSheet({ title: '확정', lead: '1. 김가온 · 2학년 1학기 1과목', lines: ['확률과 통계 (선택군 B)', '학생 화면에 "확정"으로 보입니다.', '학생이 과목을 바꾸면 다시 "계획"이 됩니다.', '확정할까요?'], confirmText: '확정', onconfirm: function () {} });
});

/* ═════════ 10. 관리자 — 교육과정 올리기 (결정 102) ═════════ */
function kindSeg(v) { return UI.segmented({ label: '올릴 자료', value: v, options: [{ value: 'curr', label: '편제표' }, { value: 'recs', label: '권장 과목' }], onchange: function () {} }); }
var CURR_TEXT = '입학년도\t학년\t학기\t선택군\t택N\t과목\n2027\t2\t1\t\t0\t문학\n2027\t2\t1\t선택군 A\t2\t생명과학\n2027\t2\t1\t선택군 A\t2\t화학\n2027\t2\t1\t선택군 B\t1\t확률과통계';
function pasteCard(kind, text) {
  var cols = kind === 'curr' ? '입학년도, 학년, 학기, 선택군, 택N, 과목' : '기준 연도, 대학, 모집단위, 핵심 과목, 권장 과목, 출처 주소, 출처 제목, 비고';
  var ta = el('textarea', { rows: '6', placeholder: '첫 줄(머리글)부터 함께 붙여 넣어 주세요.' }); ta.value = text || '';
  return card('1. 붙여 넣기', [UI.field('표 붙여 넣기', ta, { hint: '구글 시트에서 복사하거나 CSV를 붙여 넣습니다. 열 순서: ' + cols + '.' + (kind === 'curr' ? ' 꼭 듣는 과목은 선택군을 비우고 택N을 0으로 적습니다.' : ' 과목이 여럿이면 ;로 나눕니다.') }), row([btn('미리 보기', '')], '')]);
}
function tbl(head, rows) {
  var t = el('table', { style: 'width:100%;border-collapse:collapse;font-size:var(--font-sm)' }, [el('tr', {}, head.map(function (h) { return el('th', { style: 'text-align:left;padding:4px;background:var(--muted-weak)', text: h }); }))].concat(rows.map(function (r) { return el('tr', {}, r.map(function (c) { return el('td', { style: 'padding:4px;border-bottom:1px solid var(--line);word-break:keep-all' }, [].concat(c)); })); })));
  return el('div', { style: 'overflow-x:auto;max-width:100%' }, [t]);
}
def('a-curr-pick', '관리자 · 교육과정 올리기', '교육과정 올리기(처음)', {}, function (root) {
  var m = frame(root, { title: '교육과정 올리기', who: '관리자', bar: [{ text: '저장', disabled: true }], note: '관리자 화면 · 명단 올리기와 같은 흐름(종류 고르기 → 붙여 넣기 → 미리 보기 → 저장). [저장]은 미리 보기에 오류가 없을 때만 켜진다.' });
  m.appendChild(card('지금 올라와 있는 자료', [kvs([['편제표', '2026학년도 입학 84줄 · 2027학년도 입학 없음'], ['권장 과목', '기준 2027학년도 588줄']])]));
  m.appendChild(kindSeg('curr'));
  m.appendChild(pasteCard('curr', ''));
  m.appendChild(card('2. 미리 보기', [p('표를 붙여 넣고 [미리 보기]를 누르면 바뀌는 내용이 여기에 나옵니다. 이 단계에서는 아직 저장하지 않습니다.')]));
});
def('a-curr-preview', '관리자 · 교육과정 올리기', '교육과정 올리기(편제표 미리 보기 + 과목 이름 경고)', {}, function (root) {
  var m = frame(root, { title: '교육과정 올리기', who: '관리자', bar: [{ text: '저장' }], note: '관리자 화면 · 미리 보기. 같은 입학년도의 기존 유효 줄은 취소로 바뀌고 새 줄이 들어간다(삭제 없음, 결정 102). 과목 이름이 표준 과목 이름 표와 다르면 경고(저장은 된다).' });
  m.appendChild(kindSeg('curr'));
  m.appendChild(pasteCard('curr', CURR_TEXT));
  m.appendChild(card('2. 미리 보기 · 2027학년도 입학', [row([UI.statusPill('confirmed', '추가 4줄'), UI.statusPill('requested', '바뀌는 줄 0줄'), UI.statusPill('mute', '같은 줄 0줄')], 'margin-bottom:8px'), p('2027학년도 입학 편제표가 처음 올라갑니다. 다른 입학년도 자료는 바뀌지 않습니다.'),
    tbl(['학년·학기', '선택군', '택N', '과목'], [['2-1', '(꼭 듣는 과목)', '—', '문학'], ['2-1', '선택군 A', '2', '생명과학'], ['2-1', '선택군 A', '2', '화학'], ['2-1', '선택군 B', '1', ['확률과통계 ', UI.statusPill('out1', '이름 확인')]]])]));
  m.appendChild(el('div', { class: 'notice warn' }, ['과목 이름 1개가 표준 과목 이름과 다릅니다. 그대로 저장할 수 있지만, 권장 과목과 이름이 달라 학생 화면에서 "권장" 표시가 붙지 않습니다.', p('· 5번째 줄 "확률과통계" → 표준 이름 "확률과 통계"가 맞는지 확인해 주세요.')]));
});
def('a-curr-replace', '관리자 · 교육과정 올리기', '교육과정 올리기(이미 있는 입학년도를 다시 올림)', {}, function (root) {
  var m = frame(root, { title: '교육과정 올리기', who: '관리자', bar: [{ text: '저장' }], note: '관리자 화면 · 이미 올라와 있는 입학년도를 고쳐 올리는 경우. 무엇이 추가되고, 무엇이 바뀌고(옛 줄 취소 + 새 줄), 무엇이 그대로인지 숫자로. 학생이 이미 고른 과목이 사라지면 따로 알린다.' });
  m.appendChild(kindSeg('curr'));
  m.appendChild(card('2. 미리 보기 · 2026학년도 입학', [row([UI.statusPill('confirmed', '추가 2줄'), UI.statusPill('requested', '바뀌는 줄 3줄'), UI.statusPill('mute', '같은 줄 79줄')], 'margin-bottom:8px'),
    tbl(['무엇이', '학년·학기', '선택군', '과목'], [[UI.statusPill('confirmed', '추가'), '3-1', '선택군 C', '보건'], [UI.statusPill('confirmed', '추가'), '3-1', '선택군 C', '심리학'], [UI.statusPill('requested', '바뀜'), '2-2', '선택군 A', '택N 2 → 3'], [UI.statusPill('canceled', '빠짐'), '3-1', '선택군 B', '경제 수학']]),
    p('같은 줄 79줄은 줄이지 않고 숫자로만 보입니다.')]));
  m.appendChild(el('div', { class: 'notice warn' }, ['빠지는 과목 "경제 수학"을 이미 고른 학생이 2명 있습니다. 저장해도 학생의 이수 계획 줄은 그대로 남고, 학생 화면에 "교육과정에서 빠진 과목"으로 표시됩니다.']));
});
def('a-curr-error', '관리자 · 교육과정 올리기', '교육과정 올리기(고칠 줄이 있어 저장할 수 없음)', {}, function (root) {
  var m = frame(root, { title: '교육과정 올리기', who: '관리자', bar: [{ text: '저장', disabled: true }], note: '관리자 화면 · 오류가 하나라도 있으면 아무것도 저장하지 않는다. 줄 번호 + 무엇이 문제인지 + 어떻게 고치는지.' });
  m.appendChild(kindSeg('curr'));
  m.appendChild(pasteCard('curr', CURR_TEXT.replace('\t2\t화학', '\t둘\t화학')));
  m.appendChild(el('div', { class: 'error', text: '고칠 줄이 3개 있습니다. 표를 고쳐 다시 붙여 넣어 주세요. 아직 아무것도 저장하지 않았습니다.' }));
  m.appendChild(card('고칠 줄', [p('· 4번째 줄: 택N "둘"은 숫자가 아닙니다. 2처럼 숫자로 적어 주세요.', ''), p('· 3·4번째 줄: 선택군 A의 택N이 줄마다 다릅니다(2, 둘). 같은 선택군은 같은 수로 적어 주세요.', ''), p('· 7번째 줄: 과목 "생명과학"이 2학년 1학기 선택군 A에 두 번 있습니다. 한 줄을 지워 주세요.', ''),
    p('그 밖의 문구: "첫 줄에 머리글(입학년도, 학년, …)이 없습니다. 머리글부터 복사해 주세요.", "입학년도가 두 가지(2026, 2027) 섞여 있습니다. 한 번에 한 입학년도만 올려 주세요.", "선택군 B는 과목이 1개인데 택N이 2입니다."')]));
});
def('a-curr-confirm', '관리자 · 교육과정 올리기', '교육과정 저장 확인 시트', { sheet: true }, function (root) {
  var m = frame(root, { title: '교육과정 올리기', who: '관리자', bar: [{ text: '저장' }], note: '관리자 화면 · [저장] 확인창. 숫자와 되돌리는 방법을 함께.' });
  m.appendChild(kindSeg('curr'));
  UI.confirmSheet({ title: '저장', lead: '2026학년도 입학 편제표', lines: ['추가 2줄, 바뀌는 줄 3줄, 같은 줄 79줄', '바뀌는 줄의 옛 내용은 "취소"로 남습니다.', '잘못 올렸으면 고친 표를 다시 올리면 됩니다.', '저장할까요?'], confirmText: '저장', onconfirm: function () {} });
});
def('a-curr-recs', '관리자 · 교육과정 올리기', '교육과정 올리기(권장 과목 미리 보기)', {}, function (root) {
  var m = frame(root, { title: '교육과정 올리기', who: '관리자', bar: [{ text: '저장' }], note: '관리자 화면 · 권장 과목(대학 발표 자료). 기준 연도 단위로 갈아 끼운다. 대학·모집단위가 겹치면 경고, 출처 주소가 없으면 오류(출처를 늘 보여 줘야 한다).' });
  m.appendChild(kindSeg('recs'));
  m.appendChild(card('2. 미리 보기 · 기준 2028학년도', [row([UI.statusPill('confirmed', '추가 620줄'), UI.statusPill('requested', '바뀌는 줄 0줄'), UI.statusPill('mute', '같은 줄 0줄')], 'margin-bottom:8px'), p('기준 2028학년도 자료가 처음 올라갑니다. 2027학년도 자료 588줄은 그대로 남고, 학생 화면에는 가장 최근 기준 연도만 보입니다.'),
    tbl(['대학 · 모집단위', '핵심', '권장'], [['가람대학교 · 간호학과', '생명과학; 화학', '확률과 통계; 생활과 윤리'], ['가람대학교 · 컴퓨터공학과', '미적분; 기하', '물리학; 정보'], ['나래대학교 · 문과대학 전 모집단위', '(없음)', '(없음)']]), p('앞의 3줄만 보입니다. 620줄 모두 저장됩니다.')]));
  m.appendChild(el('div', { class: 'notice warn' }, ['확인할 것이 2가지 있습니다. 그대로 저장할 수 있습니다.', p('· 대학·모집단위가 같은 줄이 1쌍 있습니다(다온대학교 · 경영학과, 212·213번째 줄). 뒤의 줄만 쓰입니다.'), p('· 과목 이름 4개가 표준 과목 이름과 다릅니다(예: "생명 과학Ⅱ"). 학생 화면에서 "권장" 표시가 붙지 않을 수 있습니다.')]));
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
