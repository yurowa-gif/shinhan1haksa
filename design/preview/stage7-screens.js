/* D13 정적 시안: 7단계 학생·학부모 화면 — F14 포털(학생 홈·학부모 홈), F10 시설 사용 일지, F9 학원·희망 자습 시간표(제출·학부모 동의·교사 확인). 브라우저에서 돈다(stage7.js가 stage2-screens.js의 도우미 부분과 이 파일을 합친다).
   실제 화면 코드가 아니다 — 서버를 부르지 않고, 이름·숫자는 모두 가짜다. 숫자는 화면끼리 맞춘다:
   학생 김가온(2학년 3반 5번, 기숙사 5층 17호, 자리 1층 자습실 B-12), 동생 김나래(1학년 2반). 가짜 오늘 = 2027년 4월 26일(월) — 시간표 제출 기간(25일~말일) 안.
   정해지지 않은 것은 위 "시안" 안내 줄에 '미정'으로 적는다(학생·학부모 화면 안에는 적지 않는다). 규칙 8절(한 줄 계획과 점검)대로 화면마다 계획 3줄을 docs/design/stage7-screens.md에 적었다. */

function pTime(t) { return el('span', { style: 'white-space:nowrap', text: t }); }
function line(label, nodes) { return el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--line)' }, [el('b', { style: 'flex:0 0 5em', text: label })].concat(nodes)); }
function lineLast(label, nodes) { var l = line(label, nodes); l.style.borderBottom = '0'; return l; }
function bigBtn(text, kind) { return el('a', { class: 'btn' + (kind ? ' ' + kind : ''), href: '#', style: 'margin-top:12px', text: text }); }
function todoCard(title, body, btn) { return card('', [el('h2', { text: title }), el('div', { style: 'word-break:keep-all', text: body }), btn ? bigBtn(btn) : null]); }

/* ═════════ F14 학생 홈 ═════════ */
function studentHomeBody(m, o) {
  o = o || {};
  if (o.out2) {
    m.appendChild(el('div', { class: 'notice warn', style: 'word-break:keep-all', text: '퇴실 대상입니다. OUT이 2번 쌓여서 학교를 나가야 하는 단계입니다. 담당 박선생님이 학부모님과 면담을 한 뒤 관리자가 정합니다. 궁금하면 담당 선생님께 먼저 물어보세요.' }));
  } else if (o.todo) {
    m.appendChild(todoCard('다음 달 시간표를 내 주세요', '5월 시간표 제출 기간입니다. 4월 30일까지 내 주세요. 낸 뒤에는 부모님이 동의하고 선생님이 확인합니다.', '시간표 내기'));
  }
  var outs = o.out2 ? [UI.statusPill('out2', '퇴실 대상'), ' OUT 2건'] : [UI.statusPill('out1', '1OUT'), ' 이번 학기 1건'];
  m.appendChild(card('내 OUT', [
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, outs),
    el('div', { style: 'margin-top:8px' }, [el('div', { text: '4월 7일(수) 자습 분위기 방해' })].concat(o.out2 ? [el('div', { text: '4월 14일(수) 휴대폰·전자기기' })] : [])),
    el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: o.out2 ? 'OUT은 학기마다 처음부터 다시 셉니다.' : 'OUT이 2번 쌓이면 퇴실 대상이 됩니다. OUT은 학기마다 처음부터 다시 셉니다.' }),
    el('a', { class: 'btn secondary', href: '#', style: 'margin-top:12px', text: '내 OUT 자세히' })]));
  m.appendChild(card('이번 주 출결 기록', [
    line('4월 20일(화)', [UI.statusPill('byung', '병결'), UI.statusPill('confirmed', '확정')]),
    line('4월 23일(금)', [UI.statusPill('hak', '학원'), UI.statusPill('confirmed', '확정')]),
    lineLast('4월 27일(화)', [UI.statusPill('ga', '가정'), UI.statusPill('requested', '요청')]),
    el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: '요청은 선생님이 확인하면 확정으로 바뀝니다.' }),
    el('a', { class: 'btn secondary', href: '#', style: 'margin-top:12px', text: '출결 기록 전체 보기' })]));
  m.appendChild(card('내 자리와 방', [line('자습 자리', ['1층 자습실 B-12']), lineLast('기숙사', ['5층 17호'])]));
  m.appendChild(card('앞으로 일정', [
    line('4월 28일(수)', ['모의고사']), line('5월 12일(수)', ['진로 특강']), lineLast('5월 17일(월)', ['학부모 상담 주간']),
    el('a', { class: 'btn secondary', href: '#', style: 'margin-top:12px', text: '월별 일정 열기' })]));
  m.appendChild(card('시설 일지', [el('div', { style: 'word-break:keep-all', text: '특강실이나 원형테이블을 쓸 때는 근무 선생님께 먼저 말씀드린 뒤 여기에 적습니다.' }), bigBtn('시설 일지 쓰기'), el('a', { class: 'btn secondary', href: '#', style: 'margin-top:8px', text: '내가 쓴 시설 일지' })]));
  if (!o.todo && !o.out2) m.appendChild(card('시간표', [el('div', { style: 'word-break:keep-all', text: '5월 시간표는 4월 25일부터 4월 30일까지 냅니다. 지금은 기간이 아닙니다.' })]));
}
def('student-home', 'F14 학생', '학생 홈 — 맨 위에 "해야 할 일" 한 칸(시간표 제출 기간), 아래 내 OUT·출결·자리·일정·시설 일지', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '김가온 학생', note: '시안 · 학생 홈. 계획: 학생(처음 쓰는 사람) · 내 상태를 한눈에 보고 할 일을 한다 · 가장 눈에 띌 것은 "시간표 제출" 한 칸(없는 날은 생략). 다른 학생·교사 메모·전화는 어디에도 없다.' });
  m.appendChild(card('', [el('b', { text: '김가온' }), el('div', { class: 'muted', text: '2학년 3반 5번 · 기숙사생 · 담당 박선생' })]));
  studentHomeBody(m, { todo: true });
});
def('student-home-out2', 'F14 학생', '학생 홈 — 퇴실 대상일 때: 맨 위 경고 한 칸(쉬운 말), OUT 카드는 조용히', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '김가온 학생', note: '시안 · 한 화면에 강한 색 상자는 하나(규칙 8절): 퇴실 대상 안내가 맨 위 경고 상자 하나, 같은 화면의 시간표 제출 안내는 이때 생략하고 OUT 카드는 보통 모양. 학교 말(퇴실 대상)에 뜻을 한 줄 붙였다.' });
  m.appendChild(card('', [el('b', { text: '김가온' }), el('div', { class: 'muted', text: '2학년 3반 5번 · 기숙사생 · 담당 박선생' })]));
  studentHomeBody(m, { out2: true });
});
def('student-outs', 'F14 학생', '내 OUT 자세히 — 날짜·항목만(입력한 선생님·메모는 없다), 규칙 설명', {}, function (root) {
  var m = frame(root, { title: '내 OUT', who: '김가온 학생', note: '시안 · 학생에게 보이는 OUT은 날짜와 항목뿐이다(입력자 이메일·교사 메모 없음). 취소된 OUT은 "취소" 알약으로 남는다.' });
  m.appendChild(card('2027 1학기', [
    el('ul', { class: 'list' }, [
      el('li', { style: 'display:block' }, [el('b', { text: '4월 7일(수)' }), el('div', { text: '자습 분위기 방해' }), el('div', { style: 'margin-top:4px' }, [UI.statusPill('out1', '1OUT')])]),
      el('li', { style: 'display:block' }, [el('b', { text: '3월 26일(금)' }), el('div', { text: '휴대폰·전자기기' }), el('div', { style: 'margin-top:4px' }, [UI.statusPill('canceled', '취소')])])])]));
  m.appendChild(card('OUT이란', [el('div', { style: 'word-break:keep-all', text: '자습 시간 규칙을 어겼을 때 선생님이 남기는 기록입니다. 1번이면 주의, 2번이면 퇴실 대상이 됩니다. 학기가 바뀌면 처음부터 다시 셉니다.' })]));
});
def('student-exceptions', 'F14 학생', '내 출결 기록 전체 — 날짜별 유형·상태·시간(사유 메모는 없다)', {}, function (root) {
  var m = frame(root, { title: '내 출결 기록', who: '김가온 학생', note: '시안 · 사유 메모(건강 정보)는 학생 화면에도 쓰지 않는다. 유형 약어와 시간까지만. 요청 중인 것은 노란 점선 알약.' });
  var rows = [['4월 27일(화)', '전체', [UI.statusPill('ga', '가정'), UI.statusPill('requested', '요청')]], ['4월 23일(금)', '15:30부터', [UI.statusPill('hak', '학원'), UI.statusPill('confirmed', '확정')]],
    ['4월 20일(화)', '전체', [UI.statusPill('byung', '병결'), UI.statusPill('confirmed', '확정')]], ['4월 16일(금)', '18:30–20:00', [UI.statusPill('hak', '학원'), UI.statusPill('canceled', '취소')]]];
  m.appendChild(card('2027 1학기', [el('ul', { class: 'list' }, rows.map(function (r) { return el('li', { style: 'display:block' }, [el('b', { text: r[0] }), el('div', { class: 'muted', text: r[1] }), el('div', { style: 'display:flex;gap:8px;margin-top:4px;flex-wrap:wrap' }, r[2])]); }))]));
});

/* ═════════ F14 학부모 홈 ═════════ */
function parentChildBody(m) {
  m.appendChild(card('', [el('b', { text: '김가온' }), el('div', { class: 'muted', text: '2학년 3반 5번 · 담당 박선생' })]));
  m.appendChild(todoCard('시간표에 동의해 주세요', '김가온 학생이 5월 시간표를 냈습니다. 동의하면 담당 선생님이 확인한 뒤 5월 1일부터 적용됩니다. 4월 30일까지 부탁드립니다.', '시간표 보고 동의하기'));
  m.appendChild(card('OUT', [el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [UI.statusPill('out1', '1OUT'), ' 이번 학기 1건']),
    el('div', { style: 'margin-top:8px' }, ['4월 7일(수) 자습 분위기 방해']), el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: 'OUT이 2번 쌓이면 퇴실 대상이 됩니다. 그때는 담당 선생님이 먼저 연락드립니다.' })]));
  m.appendChild(card('출결 기록', [line('4월 20일(화)', [UI.statusPill('byung', '병결'), UI.statusPill('confirmed', '확정')]), line('4월 23일(금)', [UI.statusPill('hak', '학원'), UI.statusPill('confirmed', '확정')]),
    lineLast('4월 27일(화)', [UI.statusPill('ga', '가정'), UI.statusPill('requested', '요청')])]));
  m.appendChild(card('급식과 기숙사', [line('기숙사', ['입실']), line('조식', [UI.statusPill('confirmed', '실시')]), line('석식', ['학사 석식']),
    lineLast('바뀌는 것', ['5월 3일(월)부터 석식 미실시'])]));
  m.appendChild(card('상담', [el('div', { style: 'word-break:keep-all' }, ['4월 12일(월) 박선생님과 상담이 있었습니다.']), el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: '상담 내용은 학교에서만 봅니다. 자세한 이야기는 담당 선생님께 직접 물어봐 주세요.' })]));
  m.appendChild(card('앞으로 일정', [line('4월 28일(수)', ['모의고사']), line('5월 12일(수)', ['진로 특강']), lineLast('5월 17일(월)', ['학부모 상담 주간'])]));
}
def('parent-home', 'F14 학부모', '학부모 홈 — 자녀 전환 탭, 맨 위 "동의해 주세요" 한 칸, OUT·출결·급식·기숙사·상담(날짜·교사만)·일정', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '김학부모', tabs: [{ t: '김가온', on: true }, { t: '김나래' }],
    note: '시안 · 학부모 홈(처음 쓰는 사람 기준). 계획: 학부모 · 자녀의 학교 생활을 안심하고 확인한다 · 가장 눈에 띌 것은 "시간표 동의" 한 칸(없으면 생략). 자녀가 둘이면 위 탭으로 전환(기존 nav.tabs 그대로). 상담은 날짜·교사만, 내용·전화·다른 학생은 어디에도 없다.' });
  parentChildBody(m);
});
def('parent-home-nolink', 'F14 학부모', '학부모 첫 화면 — 연결된 자녀가 없을 때(빈 상태: 다음 할 일을 알려 준다)', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '김학부모', note: '시안 · 처음 로그인했는데 자녀 연결이 아직 없는 경우(0단계 진단 전 흔하다). 빈 화면은 다음 할 일을 알려 준다. 연결은 학교가 해 주므로 부모가 할 수 있는 것은 문의뿐.' });
  m.appendChild(card('연결된 자녀가 없습니다', [el('div', { style: 'word-break:keep-all', text: '학교에서 자녀와 이 계정을 아직 이어 놓지 않았습니다. 담당 선생님께 "학부모 계정으로 신한1학사를 보고 싶다"고 알려 주세요.' }),
    el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: '이어지면 이 화면에서 자녀의 OUT·출결 기록·급식·기숙사 상태를 볼 수 있습니다. 상담은 날짜와 선생님 이름만 보입니다.' })]));
});
def('parent-counsel', 'F14 학부모', '상담 여부 — 날짜·교사만(내용·유형·대상 없음)', {}, function (root) {
  var m = frame(root, { title: '상담 기록', who: '김학부모', tabs: [{ t: '김가온', on: true }, { t: '김나래' }], note: '시안 · 학부모는 상담한 날짜와 교사만 본다(내용·유형·학생 공개 여부 없음, "학부모에게 보임"이 켜진 건만). 학교 말을 쓰지 않고 한 줄로.' });
  m.appendChild(card('김가온', [el('ul', { class: 'list' }, [el('li', { style: 'display:block' }, [el('b', { text: '4월 12일(월)' }), el('div', { text: '박선생님' })]), el('li', { style: 'display:block' }, [el('b', { text: '3월 19일(금)' }), el('div', { text: '박선생님' })])]),
    el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: '상담 내용은 학교에서만 봅니다. 자세한 이야기는 담당 선생님께 직접 물어봐 주세요.' })]));
});

/* ═════════ F10 시설 사용 일지 ═════════ */
function facilityForm(m, withError) {
  m.appendChild(el('div', { class: 'notice info', style: 'word-break:keep-all', text: '먼저 오늘 근무 선생님께 말씀드린 뒤 적어 주세요.' }));
  var fac = el('div', { class: 'chips' }, ['특강실', '원형테이블', '소회의실', '기타'].map(function (t) { return el('button', { type: 'button', class: t === '원형테이블' ? 'chip on' : 'chip', text: t }); }));
  m.appendChild(card('어디서', [UI.field('시설', fac)]));
  var time = el('div', {}, [UI.field('시작 시각', el('input', { type: 'time', value: '15:30' })), (function () { var f = UI.field('끝나는 시각', el('input', { type: 'time', value: '17:00' })); if (withError) f.setError('같은 시간에 이미 쓴 기록이 있습니다(원형테이블 15:30–17:00). 시간을 바꿔 주세요.'); return f; })()]);
  m.appendChild(card('언제', [UI.dateField({ label: '날짜', value: '2027-04-26', shortcuts: [{ label: '오늘', value: '2027-04-26' }], onchange: function () {} }), time]));
  m.appendChild(card('누구와 무엇을', [UI.studentPicker({ students: STUDENTS, label: '함께 쓴 학생(선택)', onpick: function () {} }), el('div', { class: 'muted', style: 'margin:8px 0' , text: '고른 학생: 이서준, 박도윤' }),
    UI.field('목적', el('input', { type: 'text', value: '수학 모의고사 오답 풀이', maxlength: '100' }), { hint: '한 줄로 적어 주세요.' })]));
}
def('facility-write', 'F10 시설 일지', '시설 일지 쓰기 — 시설 칩·날짜·시작·끝·함께 쓴 학생·목적', {}, function (root) {
  var m = frame(root, { title: '시설 일지 쓰기', who: '김가온 학생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '일지 저장' }], note: '시안 · 학생 작성. 계획: 학생 · 시설을 쓴 사실을 근무 선생님이 볼 수 있게 남긴다 · 가장 눈에 띌 것은 아래 [일지 저장] 하나. 시설 목록은 settings facility.names(관리자가 정함, 시안은 예시).' });
  facilityForm(m, false);
});
def('facility-write-conflict', 'F10 시설 일지', '시설 일지 — 같은 시설·시간이 겹칠 때 칸 아래 오류(저장되지 않음)', {}, function (root) {
  var m = frame(root, { title: '시설 일지 쓰기', who: '김가온 학생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '일지 저장' }], note: '시안 · 같은 시설이 같은 시간에 겹치면 저장하지 않는다(T7 시험 대상). 무엇이 겹치는지와 고칠 방법을 쓴다. 사과하지 않는다.' });
  facilityForm(m, true);
});
def('facility-mine', 'F10 시설 일지', '내가 쓴 시설 일지 — 최근 목록, 줄마다 [취소](사유 없이 확인만), 취소된 줄', {}, function (root) {
  var m = frame(root, { title: '내가 쓴 시설 일지', who: '김가온 학생', note: '시안 · 학생은 본인 기록만 보고 취소한다(삭제 없음, 취소는 기록으로 남는다).' });
  function item(date, fac, time, who, why, canceled) {
    return el('li', { style: 'display:block' }, [el('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap' }, [el('b', { text: date + ' ' + fac }), canceled ? UI.statusPill('canceled', '취소') : null]),
      el('div', { class: 'muted', text: time }), el('div', { style: 'word-break:keep-all', text: '함께 쓴 학생: ' + who }), el('div', { style: 'word-break:keep-all', text: why }),
      canceled ? null : el('button', { type: 'button', class: 'btn secondary', style: 'margin-top:8px', text: '취소' })]);
  }
  m.appendChild(card('2027 1학기', [el('ul', { class: 'list' }, [item('4월 26일(월)', '원형테이블', '15:30–17:00', '이서준, 박도윤', '수학 모의고사 오답 풀이'), item('4월 22일(목)', '특강실', '19:00–20:30', '없음', '영어 말하기 연습'), item('4월 19일(월)', '소회의실', '20:30–21:30', '박도윤', '발표 준비', true)])]));
});
def('facility-cancel', 'F10 시설 일지', '시설 일지 취소 확인 (삭제가 아니라 취소로 남는다)', { sheet: true }, function (root) {
  var m = frame(root, { title: '내가 쓴 시설 일지', who: '김가온 학생' });
  m.appendChild(card('2027 1학기', [el('div', { class: 'muted', text: '4월 26일(월) 원형테이블 15:30–17:00' })]));
  UI.confirmSheet({ title: '이 일지를 취소합니다', lead: '4월 26일(월) 원형테이블 15:30–17:00', lines: ['취소해도 기록은 "취소"로 남습니다.', '근무 선생님과 관리자 목록에서 "취소"로 보입니다.'], confirmText: '일지 취소', danger: true, onconfirm: function () {} });
});
def('facility-duty-list', 'F10 시설 일지', '근무교사 화면 — 오늘 시설 일지 목록(시설별, 학생 이름 포함, 취소된 것은 흐리게)', {}, function (root) {
  var m = frame(root, { title: '오늘 시설 일지', who: '박선생', note: '시안 · 그날 근무교사와 관리자만 본다(facility.view). 학생이 말한 시설·시간·함께 쓴 학생·목적을 한 줄씩. 취소된 것은 "취소" 알약.' });
  m.appendChild(card('4월 26일(월)', [el('ul', { class: 'list' }, [
    el('li', { style: 'display:block' }, [el('b', { text: '원형테이블 15:30–17:00' }), el('div', { text: '2. 김가온 · 이서준 · 박도윤' }), el('div', { class: 'muted', text: '수학 모의고사 오답 풀이' })]),
    el('li', { style: 'display:block' }, [el('b', { text: '특강실 19:00–20:30' }), el('div', { text: '3. 이나래' }), el('div', { class: 'muted', text: '영어 말하기 연습' })]),
    el('li', { style: 'display:block' }, [el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [el('b', { text: '소회의실 20:30–21:30' }), UI.statusPill('canceled', '취소')]), el('div', { class: 'muted', text: '1. 오서아' })])])]));
});
def('facility-admin-total', 'F10 시설 일지', '관리자 화면 — 학생 × 날짜 누적표(시설 사용 횟수·시간)', {}, function (root) {
  var m = frame(root, { title: '시설 일지 누적', who: '관리자', note: '시안 · 관리자만(facility.report). 학생 × 날짜 표(칸 = 쓴 시간 합, 눌러서 그날 기록). 가로로 밀면 학생 열 고정. PC에서 더 넓게 본다.' });
  m.classList.add('wide');
  m.appendChild(card('', [UI.segmented({ label: '범위', value: 'week', options: [{ value: 'week', label: '이 주' }, { value: 'month', label: '이번 달' }], onchange: function () {} }), el('div', { class: 'muted', style: 'margin-top:8px', text: '4월 19일(월) ~ 25일(일)' })]));
  var days = ['19 월', '20 화', '21 수', '22 목', '23 금', '24 토', '25 일'], data = { '2. 김가온': ['1시간', '', '', '', '', '', ''], '2. 이서준': ['', '', '', '1.5시간', '', '', ''], '3. 이나래': ['', '', '1시간', '', '', '', ''], '1. 오서아': ['', '', '', '', '', '', ''] };
  var tb = el('tbody', {}, Object.keys(data).map(function (k) { return el('tr', {}, [el('td', { text: k })].concat(data[k].map(function (v) { return el('td', { class: v ? '' : 'muted', text: v || '–' }); }))); }));
  m.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'data rg' }, [el('thead', {}, [el('tr', {}, [el('th', { text: '학생' })].concat(days.map(function (d) { return el('th', { text: d }); })))]), tb])]));
});

/* ═════════ F9 학원·희망 자습 시간표 ═════════ */
var TT_ROWS = ['월', '화', '수', '목', '금', '토', '일'];
function ttCell(day, blk, v) {
  var weekend = day === '토' || day === '일';
  var off = !weekend && blk > 3;
  var cls = 'rg-cell' + (off ? ' off' : '') + (v ? ' has' : '');
  var kids = off ? [el('span', { class: 'rg-pre', text: '—' })] : (v ? [el('span', { class: 'rg-sym', text: v })] : []);
  return el('td', { style: 'padding:4px' }, [el('button', { type: 'button', class: cls, style: 'min-width:0', 'aria-label': day + '요일 ' + blk + '번 시간' + (off ? ' 없음' : v ? ' ' + v : ' 비어 있음') }, kids)]);
}
function ttTable(m, vals, readOnly) {
  var head = el('thead', {}, [el('tr', {}, [el('th', { style: 'text-align:center;padding:4px', text: '요일' })].concat([1, 2, 3, 4, 5].map(function (b) { return el('th', { style: 'text-align:center;padding:4px', text: '①②③④⑤'[b - 1] }); })))]);
  var body = el('tbody', {}, TT_ROWS.map(function (d) { return el('tr', {}, [el('td', { style: 'padding:4px 8px', text: d })].concat([1, 2, 3, 4, 5].map(function (b) { return ttCell(d, b, (vals[d] || {})[b] || ''); }))); }));
  m.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'data rg', style: 'table-layout:fixed' }, [head, body])]));
  m.appendChild(el('div', { class: 'muted', style: 'word-break:keep-all;margin-bottom:8px', text: (readOnly ? '' : '칸을 누르면 학·가·비움을 고릅니다. ') + '학 = 학원, 가 = 가정(집에서 공부), 비어 있으면 학사에서 자습. 월~금은 ①②③(18:30–23:00), 토·일은 ①~⑤(09:00–23:00). 회색 "—"은 그날 없는 시간입니다.' }));
}
var TT_VALS = { 월: { 1: '학', 2: '학' }, 수: { 1: '학', 2: '학' }, 토: { 1: '가', 2: '가', 3: '가' } };
def('timetable-student', 'F9 시간표', '시간표 내기 — 월·종료 시각·요일 × 시간 칸(학·가), 아래 [제출]', {}, function (root) {
  var m = frame(root, { title: '5월 시간표', who: '김가온 학생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '시간표 제출' }], note: '시안 · 학생 제출. 계획: 학생 · 다음 달 학원·집 공부 시간을 알린다 · 가장 눈에 띌 것은 아래 [시간표 제출] 하나. 제출 기간은 매월 25일~말일(settings timetable.submit_*). 낸 뒤 부모 동의 → 선생님 확인 → 5월 1일부터 적용, 그 전에는 지금 시간표 그대로.' });
  m.appendChild(card('언제부터', [el('div', { style: 'word-break:keep-all', text: '2027년 5월 1일부터 한 달. 4월 30일까지 낼 수 있습니다.' })]));
  m.appendChild(card('평일 자습 끝나는 시각', [UI.segmented({ label: '평일 종료', value: '23:00', options: [{ value: '23:00', label: '23:00' }, { value: '23:50', label: '23:50' }], onchange: function () {} })]));
  m.appendChild(card('학원·집 공부 시간', []));
  var c = m.lastChild;
  c.appendChild(el('button', { type: 'button', class: 'btn secondary', style: 'margin-bottom:12px', text: '지난달 시간표 그대로 가져오기' }));
  ttTable(c, TT_VALS, false);
});
def('timetable-cell-sheet', 'F9 시간표', '칸을 누르면 — 학·가·비움 고르기(칸 하나씩)', { sheet: true }, function (root) {
  var m = frame(root, { title: '5월 시간표', who: '김가온 학생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '시간표 제출' }] });
  m.appendChild(card('학원·집 공부 시간', []));
  ttTable(m.lastChild, TT_VALS, false);
  var body = el('div', {}, [el('div', { class: 'chips' }, [el('button', { type: 'button', class: 'chip on', text: '학 (학원)' }), el('button', { type: 'button', class: 'chip', text: '가 (집)' }), el('button', { type: 'button', class: 'chip', text: '비움 (학사 자습)' })]),
    el('div', { class: 'muted', style: 'margin-top:8px;word-break:keep-all', text: '한 번에 한 칸씩 고릅니다. 고른 뒤 닫으면 표에 바로 보입니다.' })]);
  UI.bottomSheet({ title: '월요일 ① (18:30–20:00)', content: body, actions: [{ text: '닫기', kind: 'secondary', onclick: function () {} }, { text: '이 칸에 적용', kind: 'primary', onclick: function () {} }] }).open();
});
def('timetable-submitted', 'F9 시간표', '낸 뒤 — 지금 어디까지 왔는지 단계 4개(제출 → 부모 동의 → 선생님 확인 → 5월 1일 적용)', {}, function (root) {
  var m = frame(root, { title: '5월 시간표', who: '김가온 학생', note: '시안 · 순서가 있는 내용이라 번호를 쓴다(규칙 8절: 번호는 순서가 있을 때만). 확정 전에는 지금 시간표가 그대로 쓰인다는 말을 맨 위에.' });
  m.appendChild(el('div', { class: 'notice info', style: 'word-break:keep-all', text: '확정되기 전에는 지금 시간표가 그대로 쓰입니다.' }));
  function step(n, t, st, note) { return el('li', { style: 'display:flex;gap:12px;align-items:flex-start' }, [el('b', { style: 'flex:0 0 1.5em', text: n }), el('div', {}, [el('div', {}, [el('b', { text: t + ' ' }), st]), note ? el('div', { class: 'muted', text: note }) : null])]); }
  m.appendChild(card('지금 단계', [el('ol', { class: 'list', style: 'list-style:none;padding:0' }, [step('1', '내가 제출', UI.statusPill('confirmed', '완료'), '4월 26일(월)'), step('2', '부모님 동의', UI.statusPill('requested', '기다리는 중'), '부모님께 동의를 부탁해 주세요'), step('3', '선생님 확인', UI.statusPill('mute', '아직'), ''), step('4', '5월 1일부터 적용', UI.statusPill('mute', '아직'), '')])]));
  m.appendChild(card('낸 시간표', []));
  ttTable(m.lastChild, TT_VALS, true);
});
def('timetable-parent', 'F9 시간표', '학부모 동의 — 자녀 시간표를 읽기만 하고 [동의합니다] / [동의하지 않습니다](사유)', {}, function (root) {
  var m = frame(root, { title: '시간표 동의', who: '김학부모', tabs: [{ t: '김가온', on: true }, { t: '김나래' }], bar: [{ text: '동의하지 않습니다', kind: 'secondary' }, { text: '동의합니다' }], note: '시안 · 학부모 동의. 계획: 학부모(처음) · 자녀 시간표를 보고 동의 여부를 정한다 · 가장 눈에 띌 것은 아래 [동의합니다] 하나. 동의하지 않으면 사유를 적고(선생님께 전달) 학생에게 돌아간다.' });
  m.appendChild(card('김가온 학생 · 5월 시간표', [el('div', { style: 'word-break:keep-all', text: '5월 1일부터 한 달 동안의 학원·집 공부 시간입니다. 동의하면 담당 박선생님이 확인합니다. 낸 날 4월 26일(월).' })]));
  m.appendChild(card('평일 자습 끝나는 시각', [el('div', { text: '23:00' })]));
  m.appendChild(card('학원·집 공부 시간', []));
  ttTable(m.lastChild, TT_VALS, true);
});
function ttTeacherRows() {
  return [['3. 김가온', UI.statusPill('todo', '확인 필요'), '부모 동의함'], ['2. 이서준', UI.statusPill('requested', '동의 기다림'), '4월 27일 제출'], ['2. 박도윤', UI.statusPill('todo', '제출 안 함'), '마감 4월 30일'], ['1. 오서아', UI.statusPill('confirmed', '확정'), '5월 1일부터']];
}
def('timetable-teacher-list', 'F9 시간표', '담당교사 화면 — 학생별 상태(확인 필요·동의 기다림·제출 안 함·확정), 마감까지 미제출 목록', {}, function (root) {
  var m = frame(root, { title: '5월 시간표 확인', who: '박선생', note: '시안 · 담당교사. 마감(4월 30일)까지 미제출 학생 목록이 맨 위(F9). 줄을 누르면 확인 시트. 학생 이름 표기는 교사용 "학년. 이름".' });
  m.appendChild(card('', [UI.segmented({ label: '보기', value: 'todo', options: [{ value: 'todo', label: '할 일 3' }, { value: 'all', label: '전체 26' }], onchange: function () {} }), el('div', { class: 'muted', style: 'margin-top:8px', text: '제출 마감까지 4일 · 미제출 5명' })]));
  m.appendChild(card('담당 학생', [el('ul', { class: 'list' }, ttTeacherRows().map(function (r) {
    return el('li', { style: 'align-items:center;gap:8px' }, [el('div', { style: 'flex:1 1 auto;min-width:0' }, [el('b', { text: r[0] }), el('div', { class: 'muted', text: r[2] })]), r[1]]);
  }))]));
});
def('timetable-teacher-confirm', 'F9 시간표', '담당교사 확인 시트 — 시간표를 보고 [확인](5월 1일 적용) / [돌려보내기](사유)', { sheet: true }, function (root) {
  var m = frame(root, { title: '5월 시간표 확인', who: '박선생' });
  m.appendChild(card('담당 학생', [el('div', { class: 'muted', text: '3. 김가온 · 확인 필요' })]));
  var body = el('div', {}, [el('p', { class: 'sheet-lead', text: '3. 김가온 · 5월 시간표' }), el('ul', { class: 'list' }, ['월·수 ①② 학원, 토 ①~③ 집 공부', '평일 자습 23:00에 끝남', '부모님이 4월 27일에 동의함']
    .map(function (t) { return el('li', { text: t }); })), el('div', { class: 'notice info', style: 'word-break:keep-all', text: '확인하면 5월 1일부터 출석부에 학·가가 나옵니다. 그 전까지는 지금 시간표가 그대로 쓰입니다.' })]);
  UI.bottomSheet({ title: '시간표를 확인합니다', content: body, actions: [{ text: '돌려보내기', kind: 'secondary', onclick: function () {} }, { text: '확인', kind: 'primary', onclick: function () {} }] }).open();
});

def('timetable-import-confirm', 'F9 시간표', '[지난달 시간표 그대로 가져오기] 확인 — 지금 표를 덮어쓴다는 안내, 가져온 뒤 고칠 수 있다', { sheet: true }, function (root) {
  var m = frame(root, { title: '5월 시간표', who: '김가온 학생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '시간표 제출' }] });
  m.appendChild(card('학원·집 공부 시간', []));
  ttTable(m.lastChild, {}, false);
  UI.confirmSheet({ title: '지난달 시간표를 가져옵니다', lead: '4월 시간표 그대로', lines: ['월·수 ①② 학원, 토 ①~③ 집 공부, 평일 자습 23:00에 끝남', '지금 표에 적은 것은 이 시간표로 바뀝니다.', '가져온 뒤에도 칸을 눌러 고칠 수 있고, [시간표 제출]을 눌러야 냅니다.'], confirmText: '가져오기', onconfirm: function () {} });
});
function ttReturned(m, by, why) {
  m.appendChild(el('div', { class: 'notice warn', style: 'word-break:keep-all', text: by + ' 시간표를 돌려보냈습니다. 사유: ' + why + ' 아래 표를 고쳐서 다시 내 주세요.' }));
  m.appendChild(card('언제부터', [el('div', { style: 'word-break:keep-all', text: '2027년 5월 1일부터 한 달. 4월 30일까지 낼 수 있습니다.' })]));
  m.appendChild(card('평일 자습 끝나는 시각', [UI.segmented({ label: '평일 종료', value: '23:00', options: [{ value: '23:00', label: '23:00' }, { value: '23:50', label: '23:50' }], onchange: function () {} })]));
  m.appendChild(card('학원·집 공부 시간', []));
  ttTable(m.lastChild, TT_VALS, false);
}
def('timetable-returned', 'F9 시간표', '돌려보내진 시간표(교사) — 맨 위에 돌려보낸 사람·사유, 아래에서 고쳐서 다시 내기', {}, function (root) {
  var m = frame(root, { title: '5월 시간표', who: '김가온 학생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '고쳐서 다시 내기' }], note: '시안 · 결정(총괄): 돌려보낸 사람과 사유를 맨 위에, 그 아래에서 고쳐서 다시 낸다. 경고 상자는 한 화면에 이것 하나(규칙 8절). 다시 내면 부모 동의부터 다시 시작한다(R23 확인 필요).' });
  ttReturned(m, '담당 박선생님이', '"토요일 ③은 집이 아니라 학원이라고 부모님이 알려 주셨습니다."');
});
def('timetable-returned-parent', 'F9 시간표', '돌려보내진 시간표(학부모) — 돌려보낸 사람이 부모님일 때 같은 모양', {}, function (root) {
  var m = frame(root, { title: '5월 시간표', who: '김가온 학생', bar: [{ text: '닫기', kind: 'secondary' }, { text: '고쳐서 다시 내기' }], note: '시안 · 부모님이 [동의하지 않습니다]를 눌러 돌아온 경우. 사유를 적지 않으셨으면 사유 문장을 빼고 "부모님이 시간표를 돌려보냈습니다. 아래 표를 고쳐서 다시 내 주세요."로 쓴다.' });
  ttReturned(m, '부모님이', '"주말 시간을 다시 정해 주세요."');
});
def('timetable-parent-decline', 'F9 시간표', '학부모 [동의하지 않습니다] — 사유 한 줄(선택), 학생에게 "돌려보냄"으로 돌아간다', { sheet: true }, function (root) {
  var m = frame(root, { title: '시간표 동의', who: '김학부모', tabs: [{ t: '김가온', on: true }, { t: '김나래' }], bar: [{ text: '동의하지 않습니다', kind: 'secondary' }, { text: '동의합니다' }] });
  m.appendChild(card('김가온 학생 · 5월 시간표', [el('div', { style: 'word-break:keep-all', text: '5월 1일부터 한 달 동안의 학원·집 공부 시간입니다.' })]));
  var f = UI.field('사유(선택)', el('input', { type: 'text', maxlength: '100', value: '주말 시간을 다시 정해 주세요.' }), { hint: '한 줄로 적으면 학생이 보고 고칩니다. 적지 않아도 됩니다.' });
  var body = el('div', {}, [el('p', { style: 'word-break:keep-all', text: '학생에게 시간표가 "돌려보냄"으로 돌아갑니다. 학생이 고쳐서 다시 내면 다시 동의를 부탁드립니다.' }), f]);
  UI.bottomSheet({ title: '동의하지 않습니다', content: body, actions: [{ text: '돌아가기', kind: 'secondary', onclick: function () {} }, { text: '학생에게 돌려보내기', kind: 'danger', onclick: function () {} }] }).open();
});

/* ═════════ 실행 ═════════ */
function renderScreen(id) {
  var s = SCREENS[id];
  var root = document.getElementById('app');
  if (!s) {
    root.appendChild(el('main', {}, [el('h1', { text: 'D13 7단계 시안 목록 (가짜 이름 · 정적 미리보기)' })].concat(ORDER.map(function (k) { return el('p', {}, [el('a', { href: '#' + k, text: k + ' — ' + SCREENS[k].label })]); }))));
    return;
  }
  s.fn(root);
  document.title = s.label;
}
window.addEventListener('hashchange', function () { location.reload(); });
renderScreen(location.hash.replace('#', ''));
document.body.setAttribute('data-ready', '1');
