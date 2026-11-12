/* D11 정적 시안: 6단계 학생 상담 신청(F17) 화면. 브라우저에서 돈다(design/preview/stage6.js가 stage2-screens.js의 도우미 부분 + Styles·Client·Components와 함께 묶는다).
   실제 화면 코드가 아니다 — 서버를 부르지 않고, 이름·날짜는 모두 가짜다. 확정이 아니라 "UI 프롬프트 틀 쓰는 법 예시"다(docs/design/stage6-counsel-request-example.md).
   정해지지 않은 것(docs/plan/stage6-rules-draft.md 5절 Q)은 위의 "시안" 안내 줄에 '미정'으로 적는다(학생 화면 안에는 적지 않는다).
   가짜 오늘 = 2027년 4월 12일(월). 학생은 말투를 쉽게(합니다·해 주세요체, 짧은 문장, 어려운 낱말 없이). */

var TODAY = '2027-04-12';
var TOPICS = ['생활', '학습', '진로', '진학', '기타'];
var STUDENT_NOTE = '학생 1. 김가온 화면 · ';

/** 주제 칩(5개라 segmented(2~4개)가 아니라 칩). value가 있으면 그것이 켜진 모양 */
function topicChips(value) {
  var box = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': '상담 주제' });
  TOPICS.forEach(function (t) {
    var b = el('button', { type: 'button', class: 'chip' + (t === value ? ' on' : ''), role: 'radio', 'aria-checked': t === value ? 'true' : 'false', text: t });
    b.addEventListener('click', function () { Array.prototype.forEach.call(box.children, function (c) { c.classList.remove('on'); c.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); });
    box.appendChild(b);
  });
  return box;
}
function memoField(value) {
  var ta = el('textarea', { rows: '3', placeholder: '미리 알리고 싶은 말이 있으면 적어 주세요.' }); ta.value = value || '';
  return UI.field('하고 싶은 말 (선택)', ta, { hint: '담당 선생님이 읽습니다. 짧게 적어도 됩니다.' });
}
function dateSlot(label, value) { return UI.dateField({ label: label, value: value || '', min: TODAY, onchange: function () {} }); }

function formBody(m, v) {
  m.appendChild(el('div', { class: 'notice info', text: '선생님과 이야기하고 싶은 날과 주제를 알려 주세요. 선생님이 날짜를 정하면 이 화면에서 알려 드립니다.' }));
  m.appendChild(card('만날 선생님', [el('b', { text: '박선생' }), el('div', { class: 'muted', text: '담당 선생님께 신청합니다.' })]));
  var dates = card('만나고 싶은 날', [el('div', { class: 'muted', style: 'margin-bottom:8px', text: '1개 이상, 최대 3개까지 고를 수 있습니다. 오늘 이후 날짜만 고를 수 있습니다.' })]);
  var d1 = dateSlot('희망 날짜 1', v.d1), d2 = dateSlot('희망 날짜 2 (선택)', v.d2), d3 = dateSlot('희망 날짜 3 (선택)', v.d3);
  [d1, d2, d3].forEach(function (d) { dates.appendChild(d); });
  m.appendChild(dates);
  var topic = card('무엇에 대해 이야기할까요?', [topicChips(v.topic)]);
  m.appendChild(topic);
  m.appendChild(card('', [memoField(v.memo)]));
  return { d1: d1, d2: d2, d3: d3, topic: topic };
}

def('counsel-req-form', '상담 신청', '학생 상담 신청 입력 (처음)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '1. 김가온', bar: [{ text: '신청하기' }],
    note: STUDENT_NOTE + '새 신청 입력. 미정(Q7): 날짜 개수 상한(여기서는 제안값 3)·메모 글자 수 상한·열린 신청이 있을 때 새 신청 허용 여부. 미정(Q8): 메모를 담임도 보는지(안내 문구는 담당교사만 읽는다고 적었으나 정해지면 고친다).' });
  formBody(m, {});
});

def('counsel-req-error', '상담 신청', '학생 상담 신청 입력 (고칠 곳 안내)', {}, function (root) {
  var m = frame(root, { title: '상담 신청', who: '1. 김가온', bar: [{ text: '신청하기' }],
    note: STUDENT_NOTE + '[신청하기]를 눌렀는데 고칠 곳이 있는 모습. 오류는 칸 바로 아래에 "무엇이 문제인지 + 무엇을 하면 되는지"로 적는다(rules 5절). counselRequestCheck_ 의 검사(오늘 이후·중복 없음·주제 필수)와 같은 이유.' });
  m.appendChild(el('div', { class: 'error', text: '고칠 곳이 3군데 있습니다. 빨간 칸을 확인해 주세요.' }));
  var f = formBody(m, { d1: '2027-04-09', d2: '2027-04-14', d3: '2027-04-14', topic: '', memo: '' });
  f.d1.setError('오늘(4월 12일) 이후 날짜를 골라 주세요.');
  f.d3.setError('같은 날짜를 두 번 고를 수 없습니다. 다른 날로 고쳐 주세요.');
  var err = el('div', { class: 'error', text: '주제를 하나 골라 주세요.' });
  f.topic.appendChild(err);
});

function filled(m) {
  return formBody(m, { d1: '2027-04-14', d2: '2027-04-16', d3: '', topic: '진로', memo: '진학 방향을 이야기하고 싶습니다.' });
}
def('counsel-req-confirm', '상담 신청', '학생 상담 신청 확인 시트', { sheet: true }, function (root) {
  var m = frame(root, { title: '상담 신청', who: '1. 김가온', bar: [{ text: '신청하기' }], note: STUDENT_NOTE + '[신청하기]를 누르면 확인창. 신청 뒤에는 학생이 취소만 할 수 있어서 한 번 더 보여 준다.' });
  filled(m);
  UI.confirmSheet({ title: '이렇게 신청할까요?', lead: '진로 상담 · 박선생',
    lines: ['희망 날짜: 4월 14일(수) · 4월 16일(금)', '메모: 진학 방향을 이야기하고 싶습니다.', '선생님이 날짜를 정하면 이 화면에서 알려 드립니다.'],
    confirmText: '신청하기', onconfirm: function () {} });
});

function reqCard(o) {
  var head = row([el('b', { text: o.topic + ' 상담' }), UI.statusPill(o.kind, o.state)], 'justify-content:space-between;margin-bottom:4px');
  var c = card('', [head]);
  o.lines.forEach(function (t) { c.appendChild(el('div', { class: 'muted', style: 'word-break:keep-all', text: t })); });
  if (o.btns) c.appendChild(row(o.btns.map(function (b) { return el('button', { type: 'button', class: 'btn secondary row-btn', text: b }); }), 'margin-top:8px'));
  return c;
}
def('counsel-req-list', '상담 신청', '학생 내 상담 신청 목록 (신청·확정·완료·반려·취소)', {}, function (root) {
  var m = frame(root, { title: '내 상담 신청', who: '1. 김가온', bar: [{ text: '+ 새 상담 신청' }],
    note: STUDENT_NOTE + '신청 상태 다섯 가지(신청·확정·완료·반려·취소)를 한 화면에. 학생은 신청·확정 상태에서만 [취소]할 수 있다. 미정(Q7): 반려 사유를 학생에게 보이는지(여기서는 제안값 "보임")·열린 신청을 몇 건까지 허용하는지.' });
  m.appendChild(el('h2', { text: '진행 중', style: 'margin:4px 0 8px' }));
  m.appendChild(reqCard({ topic: '학습', kind: 'confirmed', state: '확정', lines: ['정해진 날: 4월 20일(월)', '담당 선생님: 박선생'], btns: ['신청 취소'] }));
  m.appendChild(reqCard({ topic: '진로', kind: 'requested', state: '신청', lines: ['희망 날짜: 4월 14일(수) · 4월 16일(금)', '선생님이 날짜를 정하면 알려 드립니다.'], btns: ['신청 취소'] }));
  m.appendChild(el('h2', { text: '지난 신청', style: 'margin:16px 0 8px' }));
  m.appendChild(reqCard({ topic: '진학', kind: 'confirmed', state: '완료', lines: ['상담한 날: 4월 5일(월)'], btns: ['합의 사항 보기'] }));
  m.appendChild(reqCard({ topic: '기타', kind: 'canceled', state: '반려', lines: ['선생님 말씀: 그 주는 시험 기간이라 다음 주로 다시 신청해 주세요.'] }));
  m.appendChild(reqCard({ topic: '생활', kind: 'canceled', state: '취소', lines: ['내가 취소했습니다.'] }));
});

/* ═════════ 실행 ═════════ */
function renderScreen(id) {
  var s = SCREENS[id];
  var root = document.getElementById('app');
  if (!s) {
    root.appendChild(el('main', {}, [el('h1', { text: 'D11 시안 목록 (가짜 이름 · 정적 미리보기)' })].concat(ORDER.map(function (k) { return el('p', {}, [el('a', { href: '#' + k, text: SCREENS[k].group + ' · ' + SCREENS[k].label })]); }))));
    return;
  }
  s.fn(root);
  document.title = s.label;
}
window.addEventListener('hashchange', function () { location.reload(); });
renderScreen(location.hash.replace('#', ''));
document.body.setAttribute('data-ready', '1');
