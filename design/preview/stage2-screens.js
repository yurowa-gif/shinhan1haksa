/* D6 정적 시안: 2단계 화면(F3·F4·F6·F7)·역할별 홈 카드. 브라우저에서 돈다(design/preview/stage2.js가 Styles·Client·Components와 함께 한 쪽으로 묶는다).
   실제 화면 코드가 아니다 — 서버를 부르지 않고, 이름은 모두 가짜다. UI.* 컴포넌트를 그대로 쓴다. */
var SCREENS = {};
var ORDER = [];
function def(id, group, label, opts, fn) { SCREENS[id] = { group: group, label: label, sheet: !!(opts && opts.sheet), fn: fn }; ORDER.push(id); }

var TEACHERS = ['박선생', '김선생', '이선생', '최선생', '정선생', '한선생'];
var STUDENTS = [
  { id: 's1', name: '김가온', grade: 1, classNo: 3, number: 5, studentNo: '10305' },
  { id: 's2', name: '이나래', grade: 2, classNo: 1, number: 12, studentNo: '20112' },
  { id: 's3', name: '박다솜', grade: 3, classNo: 2, number: 7, studentNo: '30207' },
  { id: 's4', name: '최하늘', grade: 2, classNo: 2, number: 3, studentNo: '20203' }
];

/* 점검용: 마지막 확인창에 준 값을 남긴다(stage2.js가 화면에 그려진 것과 맞는지 본다) */
var __confirmSheet = UI.confirmSheet;
UI.confirmSheet = function (o) { window.__confirm = o; return __confirmSheet(o); };

/* ───────── 작은 도우미 ───────── */
function selectField(label, options, value, hint) {
  var sel = el('select', {}, options.map(function (o) { var v = typeof o === 'string' ? { value: o, label: o } : o; var n = el('option', { value: v.value, text: v.label }); if (v.value === value) n.selected = true; return n; }));
  return UI.field(label, sel, hint ? { hint: hint } : {});
}
function inputField(label, type, value, hint) { return UI.field(label, el('input', { type: type, value: value || '' }), hint ? { hint: hint } : {}); }
function checkRow(text, on) {
  var box = el('input', { type: 'checkbox' }); if (on) box.checked = true;
  return el('label', { class: 'check' }, [box, el('span', { text: text })]);
}
function kv(rows) { var dl = el('dl', { class: 'kv' }); rows.forEach(function (r) { dl.appendChild(el('dt', { text: r[0] })); dl.appendChild(el('dd', { text: r[1] })); }); return dl; }
function row(children, style) { return el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;' + (style || '') }, children); }
function link(text, kind, extra) { return el('a', { class: 'btn ' + (kind || ''), href: '#', style: extra || '', text: text }); }
function pickStudent(picker, query) {
  var input = picker.querySelector('input'); input.value = query; input.dispatchEvent(new Event('input'));
  var items = picker.querySelectorAll('.picker-item'); if (items.length) items[0].click();
}
function studentPick(label, query) { var p = UI.studentPicker({ students: STUDENTS, label: label, onpick: function () {} }); if (query) setTimeout(function () { pickStudent(p, query); }, 0); return p; }
function noteBox(text) { return el('div', { class: 'proto-note', text: text.replace(/^시안 · /, '') }); }

/** 화면 틀: 머리 · (탭) · 본문 · 아래 바. opts = {title, who, tabs:[{t,on,n}], bar:[{text,kind,disabled}], note} */
function frame(root, opts) {
  var top = el('header', { class: 'top' }, [el('a', { class: 'back', href: '#', text: '← 처음으로' }), el('h1', { text: opts.title }), el('div', { class: 'who', text: opts.who || '' })]);
  var main = el('main', {});
  if (opts.bar) main.className = 'has-actionbar';
  root.appendChild(top);
  var ROLE = { '박선생': '학사 교사 박선생', '정선생': '근무표 담당자 정선생' };
  if (opts.note) main.appendChild(noteBox((ROLE[opts.who] ? ROLE[opts.who] + ' 화면 · ' : '') + opts.note.replace(/^시안 · /, '')));
  if (opts.tabs) main.appendChild(el('div', { class: 'tabs wrap' }, opts.tabs.map(function (t) {
    return el('a', { class: 'tab' + (t.on ? ' on' : ''), href: '#' }, [t.t, t.n ? ' ' : null, t.n ? UI.badge(t.n) : null]);
  })));
  root.appendChild(main);
  if (opts.bar) UI.actionBar(opts.bar, { mount: true });
  return main;
}
function card(title, nodes) { var c = el('div', { class: 'card' }, title ? [el('h2', { text: title })] : []); (nodes || []).forEach(function (n) { if (n) c.appendChild(n); }); return c; }

/* ═════════ 역할별 홈 ═════════ */
def('home-hall', '홈', '학사 교사 홈 (박선생)', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '박선생', note: '시안 · 학사 교사 홈. "오늘 내 근무"가 맨 위, 서류 미제출·OUT 알림이 그 아래.' });
  m.appendChild(card('오늘 3월 3일(수)', [
    el('div', { class: 'muted', text: '2027 1학기' }),
    row([UI.statusPill('todo', '내 근무'), el('b', { text: '21:30조 (21:30까지)' })], 'margin:8px 0'),
    el('div', { class: 'muted', text: '다음 근무: 3월 6일(토) 근무' }),
    link('내 근무 교대', 'secondary', 'margin-top:12px')]));
  m.appendChild(card('서류 미제출', [
    row([UI.statusPill('requested', '2건')], 'margin:4px 0 8px'),
    el('div', { class: 'muted', text: '3. 박다솜 입퇴실 · 1. 김가온 급식 변경' }),
    link('입퇴실·급식 기록 보기', 'secondary', 'margin-top:12px')]));
  m.appendChild(card('내 담당 학생 OUT', [
    row([UI.statusPill('out1', '1OUT 1명(김가온)'), UI.statusPill('out2', '퇴실 대상 1명(박다솜)')], 'margin:4px 0 8px'),
    el('div', { class: 'muted', text: '퇴실 대상 1명은 학부모 면담 기록이 필요합니다.' }),
    link('면담 기록하러 가기', '', 'margin-top:12px')]));
  m.appendChild(card('OUT 기록', [el('div', { class: 'muted', text: '오늘 적발한 학생의 OUT을 30초 안에 기록합니다.' }), link('OUT 기록하기', '', 'margin-top:12px')]));
  m.appendChild(card('내가 보낸 특이사항 요청', [row([UI.statusPill('requested', '요청 2'), UI.statusPill('confirmed', '확정 5'), UI.statusPill('canceled', '취소 1')], 'margin:8px 0')]));
});

def('home-duty', '홈', '근무표 담당자 홈 (정선생)', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '정선생', note: '시안 · 근무표 담당자 홈. 빈 날과 교대 건수가 먼저 보인다.' });
  m.appendChild(card('3월 근무표', [
    el('div', { class: 'stats', style: 'margin:4px 0 12px' }, [statBox(2, '빈 날(편성이 덜 된 날)'), statBox(3, '이번 달 교대')]),
    el('div', { class: 'muted', text: '비어 있는 날: 3월 3일(수) 23:00조, 3월 7일(일) 예비 감독' }),
    link('근무 편성하기', '', 'margin-top:12px')]));
  m.appendChild(card('교대 이력', [el('div', { class: 'muted', text: '3월 5일(금) 이선생 → 최선생 (대신 근무) 외 2건' }), link('근무표에서 보기', 'secondary', 'margin-top:12px')]));
  m.appendChild(card('월말 근무 기록표', [el('div', { class: 'muted', text: '실제 근무자 기준 교사별 합계를 확인하고 엑셀로 내려받습니다.' }), link('근무 기록표 열기', '', 'margin-top:12px')]));
  m.appendChild(card('출석부', [el('div', { class: 'muted', text: '날짜를 고르면 그날 출석부를 미리 보고 PDF로 받습니다.' }), link('출석부 열기', 'secondary', 'margin-top:12px')]));
});

def('home-admin', '홈', '관리자 홈 (오늘 인원·2OUT)', {}, function (root) {
  var m = frame(root, { title: '신한1학사', who: '관리자', note: '시안 · 관리자 홈. 2OUT 대상(면담 필요·확정 가능)과 오늘 인원이 위에 온다.' });
  m.appendChild(card('2OUT 대상', [
    row([UI.statusPill('out2', '퇴실 대상 2명')], 'margin:4px 0 8px'),
    row([el('b', { text: '면담 필요 1' }), el('span', { text: '·' }), el('b', { text: '확정 가능 1' })]),
    el('div', { class: 'muted', style: 'margin-top:4px', text: '확정 가능한 학생은 관리자가 퇴실을 확정합니다.' }),
    link('퇴실 대상 보기', '', 'margin-top:12px')]));
  m.appendChild(card('오늘 3월 3일(수) 인원', [
    el('div', { class: 'muted', text: '2027 1학기 · 학사생 30명' }),
    el('div', { class: 'stats', style: 'margin-top:12px' }, [statBox(30, '학사'), statBox(24, '기숙(남 16·여 8)'), statBox(6, '비기숙'), statBox(23, '조식'), statBox(30, '석식')]), el('div', { class: 'muted', style: 'margin-top:8px', text: '석식 30 = 학사 석식 27 + 일반 석식 3 · 기숙 24 = 남 16 + 여 8' })]));
  m.appendChild(card('오늘 공석', [el('div', { class: 'stats' }, [statBox(3, '자습실 빈자리'), statBox(5, 'SA실 빈자리')])]));
  m.appendChild(card('식수 집계', [el('div', { class: 'muted', text: '날짜를 고르면 학년·성별 인원이 나옵니다.' }), link('식수 집계 열기', 'secondary', 'margin-top:12px')]));
  m.appendChild(card('월말 근무 기록표', [el('div', { class: 'muted', text: '실제 근무자 기준 교사별 합계를 확인하고 엑셀로 내려받습니다.' }), link('근무 기록표 열기', 'secondary', 'margin-top:12px')]));
});

/* ═════════ F3 근무표 ═════════ */
function dayCard(date, off, lines, extra, who) {
  var c = el('div', { class: 'card' });
  c.appendChild(row([el('h2', { text: date, style: 'margin:0' }), off ? UI.statusPill('mute', '운영 안 함') : null, extra || null], 'justify-content:space-between;margin-bottom:4px'));
  if (off) { c.appendChild(el('div', { class: 'muted', text: who === 'mgr' ? '메모: 학교 행사 · 눌러서 운영으로 바꿀 수 있습니다.' : '메모: 학교 행사 · 근무표 담당자·관리자가 바꿉니다.' })); return c; }
  var ul = el('ul', { class: 'list' });
  lines.forEach(function (l) {
    var left = el('div', {}, [el('span', { class: 'muted', text: l.slot + '  ' }), l.empty ? UI.statusPill('requested', '비어 있음') : el('b', { text: l.who }), l.swap ? ' ' : null, l.swap ? UI.statusPill('confirmed', '교대') : null, l.mine ? ' ' : null, l.mine ? UI.statusPill('todo', '내 근무') : null, l.standby ? ' ' : null, l.standby ? UI.statusPill('mute', '예비') : null]);
    var li = el('li', { style: 'align-items:center' }, [left]);
    if (l.btn) li.appendChild(el('button', { type: 'button', class: 'btn secondary', text: l.btn }));
    ul.appendChild(li);
  });
  c.appendChild(ul);
  return c;
}
function weekList(m, who) {
  var t = who === 'teacher';
  m.appendChild(row([el('button', { type: 'button', class: 'btn secondary', text: '‹' }), el('b', { text: '2027년 3월 1주 (1일–7일)', style: 'flex:1;text-align:center' }), el('button', { type: 'button', class: 'btn secondary', text: '›' })], 'margin-bottom:12px'));
  m.appendChild(UI.segmented({ options: [{ value: 'week', label: '주 목록' }, { value: 'month', label: '월 달력' }], value: 'week', onchange: function () {} }));
  if (!t) m.appendChild(el('div', { class: 'notice warn', text: '비어 있는 날 2일 — 3월 3일(수)·3월 7일(일). 날짜 줄을 누르면 편성할 수 있습니다.' }));
  m.appendChild(dayCard('3월 1일(월)', false, [{ slot: '21:30조', who: '박선생', mine: t, btn: t ? '교대' : (who === 'mgr' ? '대신 근무' : '') }, { slot: '23:00조', who: '김선생', btn: who === 'mgr' ? '대신 근무' : '' }]));
  m.appendChild(dayCard('3월 2일(화)', true, null, null, who));
  m.appendChild(dayCard('3월 3일(수)', false, [{ slot: '21:30조', who: '박선생', mine: t, btn: t ? '교대' : '' }, { slot: '23:00조', empty: true }]));
  m.appendChild(dayCard('3월 4일(목)', false, [{ slot: '21:30조', who: '이선생', btn: who === 'mgr' ? '대신 근무' : '' }, { slot: '23:00조', who: '정선생', btn: who === 'mgr' ? '대신 근무' : '' }]));
  m.appendChild(dayCard('3월 5일(금)', false, [{ slot: '근무', who: '이선생 → 최선생', swap: true }, { slot: '예비 감독', who: '최선생', standby: true }]));
  m.appendChild(dayCard('3월 6일(토)', false, [{ slot: '근무', who: '박선생', mine: t, btn: t ? '교대' : (who === 'mgr' ? '대신 근무' : '') }, { slot: '예비 감독', who: '김선생', standby: true }]));
  m.appendChild(dayCard('3월 7일(일)', false, [{ slot: '근무', who: '정선생' }, { slot: '예비 감독', empty: true }]));
}
def('duty-week', 'F3 근무표', 'F3-1 근무표 주 목록 (근무표 담당자)', {}, function (root) {
  var m = frame(root, { title: '근무표', who: '정선생', note: '시안 · 주 목록이 휴대폰 기본. 날짜 줄 누르기 = 편성 시트 (탭 1).' });
  weekList(m, 'mgr');
});
def('duty-week-teacher', 'F3 근무표', 'F3-1 근무표 주 목록 (학사 교사: 내 근무 · 교대)', {}, function (root) {
  var m = frame(root, { title: '근무표', who: '박선생', note: '시안 · 학사 교사는 보기만. 내 근무 줄에 "내 근무" 표시와 [교대] 버튼.' });
  weekList(m, 'teacher');
});
def('duty-month', 'F3 근무표', 'F3-1 월 달력 (근무표 담당자)', {}, function (root) { monthCal(root, false); });
def('duty-month-teacher', 'F3 근무표', 'F3-1 월 달력 (학사 교사: 내 근무 날 표시)', {}, function (root) { monthCal(root, true); });
function monthCal(root, teacher) {
  var m = frame(root, { title: '근무표', who: teacher ? '박선생' : '정선생', note: '시안 · 월 달력은 PC 권장. 휴대폰에서는 달력 상자 안에서만 가로로 민다. 색만으로 표시하지 않는다(글자 "내 근무"·"운영 안 함"·"비어 있음").' });
  m.appendChild(row([el('button', { type: 'button', class: 'btn secondary', text: '‹' }), el('b', { text: '2027년 3월', style: 'flex:1;text-align:center' }), el('button', { type: 'button', class: 'btn secondary', text: '›' })], 'margin-bottom:12px'));
  m.appendChild(UI.segmented({ options: [{ value: 'week', label: '주 목록' }, { value: 'month', label: '월 달력' }], value: 'month', onchange: function () {} }));
  var duty = { 1: ['박', '김'], 3: ['박', null], 4: ['이', '정'], 5: ['최*', '예 최'], 6: ['박', '예 김'], 7: ['정', null], 8: ['김', '이'], 9: ['정', '박'], 10: ['이', '김'], 11: ['박', '최'], 12: ['한', '예 정'], 13: ['최', '예 한'], 14: ['김', '예 박'] };
  var table = el('table', { class: 'duty-cal' });
  table.appendChild(el('thead', {}, [el('tr', {}, ['월', '화', '수', '목', '금', '토', '일'].map(function (d) { return el('th', { text: d }); }))]));
  var body = el('tbody', {});
  for (var w = 0; w < 5; w++) {
    var tr = el('tr', {});
    for (var c = 0; c < 7; c++) {
      var day = w * 7 + c + 1;
      if (day > 31) { tr.appendChild(el('td', {})); continue; }
      var cls = 'duty-day'; var lines = [];
      if (day === 2) { cls += ' off'; lines.push('운영 안 함'); }
      else if (duty[day]) {
        var pair = duty[day]; var weekend = c >= 4;
        lines.push((weekend ? '근무 ' : '21:30 ') + pair[0]);
        lines.push(pair[1] === null ? '⚠ 비어 있음' : (weekend ? pair[1] : '23:00 ' + pair[1]));
        if (pair[1] === null) cls += ' gap';
        if (teacher && (day === 1 || day === 3 || day === 6 || day === 11)) { cls += ' mine'; }
      } else lines.push('편성 전');
      var btn = el('button', { type: 'button', class: cls }, [el('b', { text: day + '일' })].concat(lines.map(function (t) { return el('div', { text: t }); })));
      if (teacher && cls.indexOf('mine') >= 0) btn.appendChild(el('div', { text: '● 내 근무' }));
      tr.appendChild(el('td', {}, [btn]));
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  m.appendChild(el('div', { class: 'tablewrap', style: 'padding:4px' }, [table]));
  m.appendChild(el('div', { class: 'muted', text: '칸의 성은 교사 이름(박 = 박선생), * = 교대로 실제 근무자가 바뀐 날, 예 = 예비 감독. 날짜 칸을 누르면 ' + (teacher ? '그날 줄로 이동합니다.' : '편성 시트가 열립니다.') }));
}
/** 근무표 담당자·관리자의 날짜 시트: 운영 여부(UI.segmented) + 메모 + 근무 칸 */
function daySheet(root, title, operating, slots, extra, memo) {
  var m = frame(root, { title: '근무표', who: '정선생' });
  weekList(m, 'mgr');
  var kids = [
    UI.field('운영 여부', UI.segmented({ options: [{ value: 'on', label: '운영' }, { value: 'off', label: '운영 안 함' }], value: operating ? 'on' : 'off', onchange: function () {} })),
    inputField('메모(선택)', 'text', memo || '', '예: 수능 전날, 학교 행사')
  ];
  if (operating) kids = kids.concat(slots, extra || []);
  else kids.push(el('div', { class: 'notice warn', text: '운영 안 함으로 바꾸면 그날 출석부가 사라지고 근무 칸도 없어집니다. 저장할 때 한 번 더 확인합니다.' }));
  UI.bottomSheet({ title: title, content: el('div', {}, kids), actions: [{ text: '닫기', kind: 'secondary' }, { text: '저장' }] }).open();
}
def('duty-assign', 'F3 근무표', 'F3-1 편성 시트 (월~목, 같은 교사 두 칸 경고, 운영 여부)', { sheet: true }, function (root) {
  daySheet(root, '3월 3일(수) 근무 편성', true, [
    selectField('21:30까지', ['(비어 있음)'].concat(TEACHERS), '박선생'),
    selectField('23:00까지', ['(비어 있음)'].concat(TEACHERS), '박선생')],
  [el('div', { class: 'notice warn', text: '박선생님이 이 날 이미 근무입니다. 두 칸에 모두 넣으면 저장할 때 한 번 더 확인합니다.' })]);
});
def('duty-assign-weekend', 'F3 근무표', 'F3-1 편성 시트 (금·토·일: 근무 + 예비 감독)', { sheet: true }, function (root) {
  daySheet(root, '3월 7일(일) 근무 편성', true, [
    selectField('근무', ['(비어 있음)'].concat(TEACHERS), '정선생'),
    selectField('예비 감독', ['(비어 있음)'].concat(TEACHERS), '(비어 있음)', '예비로 지정된 날은 근무 기록표에 따로 셉니다. 대신 근무하면 근무로만 셉니다.')]);
});
def('duty-off-sheet', 'F3 근무표', 'F3-1 운영 안 함으로 바꾸기 (근무표 담당자·관리자)', { sheet: true }, function (root) {
  daySheet(root, '3월 9일(화) 운영 여부', false, [], null, '학교 행사');
});
def('duty-off-confirm', 'F3 근무표', 'F3-1 운영 안 함 확인창', { sheet: true }, function (root) {
  var m = frame(root, { title: '근무표', who: '정선생' });
  weekList(m, 'mgr');
  UI.confirmSheet({ title: '3월 9일(화)을 운영 안 함으로 바꿉니다', lead: '그날 출석부가 사라집니다', lines: ['편성된 근무 칸 2개는 취소 처리됩니다(기록은 남습니다)', '특이사항·OUT 기록은 그대로 남습니다', '다시 운영으로 바꾸면 출석부가 다시 만들어집니다'], confirmText: '운영 안 함으로 바꾸기', danger: true });
});

/* ═════════ F3-2 교대 ═════════ */
def('swap-teacher', 'F3-2 교대', 'F3-2 교대 — 내 근무 [교대] (학사 교사)', { sheet: true }, function (root) {
  var m = frame(root, { title: '근무표', who: '박선생' });
  weekList(m, 'teacher');
  var c = el('div', {}, [
    kv([['날짜', '3월 1일(월)'], ['근무', '21:30조 · 박선생']]),
    selectField('바꿀 선생님', ['(고르기)'].concat(TEACHERS.filter(function (t) { return t !== '박선생'; })), '이선생'),
    el('div', { class: 'notice info', text: '상대 선생님과 근무표 담당자에게 알림이 갑니다. 승인 절차는 없습니다.' })
  ]);
  UI.bottomSheet({ title: '근무 교대', content: c, actions: [{ text: '취소', kind: 'secondary' }, { text: '교대하기' }] }).open();
});
def('swap-teacher-confirm', 'F3-2 교대', 'F3-2 교대 확인창', { sheet: true }, function (root) {
  var m = frame(root, { title: '근무표', who: '박선생' });
  weekList(m, 'teacher');
  UI.confirmSheet({ title: '근무를 교대합니다', lead: '3월 1일(월) 21:30조: 박선생 → 이선생', lines: ['이선생님과 근무표 담당자에게 메일이 갑니다', '승인 절차가 없어 바로 바뀝니다'], confirmText: '교대하기' });
});
def('swap-manager', 'F3-2 교대', 'F3-2 대신 근무 기록 (근무표 담당자·관리자)', { sheet: true }, function (root) {
  var m = frame(root, { title: '근무표', who: '정선생' });
  weekList(m, 'mgr');
  var c = el('div', {}, [
    kv([['날짜', '3월 5일(금)'], ['근무표', '근무 이선생 · 예비 감독 최선생']]),
    selectField('실제 근무자', TEACHERS, '최선생'),
    inputField('이유(선택)', 'text', '이선생 병가'),
    el('div', { class: 'notice info', text: '예비 감독이 대신 근무하면 근무표 담당자가 기록합니다. 실제 근무자가 되면 월말 근무 기록표에 들어갑니다. 예비 본인에게는 교대 버튼이 없습니다.' })
  ]);
  UI.bottomSheet({ title: '대신 근무 기록', content: c, actions: [{ text: '취소', kind: 'secondary' }, { text: '대신 근무 기록' }] }).open();
});

/* ═════════ F3-3 월말 근무 기록표 ═════════ */
var RECORD = [['박선생', 8, 3, 3, 2, 2], ['김선생', 8, 3, 3, 2, 2], ['이선생', 7, 3, 3, 1, 2], ['최선생', 9, 3, 3, 3, 1], ['정선생', 8, 3, 3, 2, 2], ['한선생', 8, 3, 3, 2, 2]];
function recordScreen(root, teacher) {
  var m = frame(root, {
    title: '근무 기록표', who: teacher ? '박선생' : '정선생',
    bar: teacher ? null : [{ text: 'PDF(임시)', kind: 'secondary' }, { text: '엑셀 내려받기' }],
    note: teacher ? '시안 · 학사 교사는 본인 기록만 본다(내려받기 없음).' : '시안 · 엑셀 내려받기는 관리자·근무표 담당자. PDF는 화면 확인용 임시 출력. 근무 합계를 크게, 조별 횟수는 작게 참고로, 예비 지정은 따로.' });
  m.appendChild(row([el('button', { type: 'button', class: 'btn secondary', text: '‹' }), el('b', { text: '2027년 3월', style: 'flex:1;text-align:center' }), el('button', { type: 'button', class: 'btn secondary', text: '›' })], 'margin-bottom:12px'));
  var small = 'color:var(--muted-ink);font-size:var(--font-sm)';
  var rows = teacher ? [RECORD[0]] : RECORD;
  var thead = el('thead', {}, [el('tr', {}, ['교사', '근무', '21:30', '23:00', '단', '예비'].map(function (h) { return el('th', { scope: 'col', text: h }); }))]);
  var body = rows.map(function (r) {
    return el('tr', {}, [el('th', { scope: 'row', text: r[0] }), el('td', { text: r[1] + '회', style: 'font-size:var(--font-lg);font-weight:700' }),
      el('td', { text: String(r[2]), style: small }), el('td', { text: String(r[3]), style: small }), el('td', { text: String(r[4]), style: small }), el('td', { text: r[5] + '회', style: small })]);
  });
  if (!teacher) body.push(el('tr', { class: 'total' }, [el('th', { scope: 'row', text: '합계' }), el('td', { text: '48회' }), el('td', { text: '18' }), el('td', { text: '18' }), el('td', { text: '12' }), el('td', { text: '11회' })]));
  m.appendChild(el('div', { class: 'tablewrap' }, [el('table', { class: 'data compact' }, [thead, el('tbody', {}, body)])]));
  m.appendChild(el('div', { class: 'notice info', text: '"근무" 합계가 주 숫자입니다(21:30조·23:00조 수당은 같아 조별 횟수는 참고). "예비 지정"은 따로 세며, 대신 근무한 날은 근무로만 세고 예비 지정에서는 뺍니다.' }));
  if (!teacher) {
    m.appendChild(card('교대 3건', [el('ul', { class: 'list' }, [
      el('li', {}, [el('div', {}, [el('b', { text: '3월 5일(금) 근무' }), el('div', { class: 'muted', text: '이선생 → 최선생 · 예비 감독이 대신 근무(근무로 셈)' })]), UI.statusPill('confirmed', '교대')]),
      el('li', {}, [el('div', {}, [el('b', { text: '3월 11일(목) 23:00조' }), el('div', { class: 'muted', text: '최선생 → 한선생' })]), UI.statusPill('confirmed', '교대')]),
      el('li', {}, [el('div', {}, [el('b', { text: '3월 20일(토) 근무' }), el('div', { class: 'muted', text: '김선생 → 정선생' })]), UI.statusPill('confirmed', '교대')])])]));
    m.appendChild(el('div', { class: 'muted', text: '만든 시각 2027-03-31 18:20 · 그 달 마지막 변경 3월 20일(토). 출력한 뒤 근무표가 바뀌었는지 확인할 때 씁니다.' }));
  }
}
def('duty-record', 'F3 근무표', 'F3-3 월말 근무 기록표 (관리자·근무표 담당자)', {}, function (root) { recordScreen(root, false); });
def('duty-record-teacher', 'F3 근무표', 'F3-3 월말 근무 기록표 (학사 교사: 본인 행만)', {}, function (root) { recordScreen(root, true); });

/* ═════════ F4 OUT ═════════ */
function outTabs(on) { return [{ t: '기록', on: on === 0 }, { t: '퇴실 대상', on: on === 3, n: 2 }, { t: '오늘', on: on === 2 }, { t: '학기', on: on === 1 }]; }
def('outs-record', 'F4 OUT', 'F4-1 OUT 기록 (30초 흐름)', {}, function (root) {
  var m = frame(root, { title: 'OUT', who: '박선생', tabs: outTabs(0), bar: [{ text: '닫기', kind: 'secondary' }, { text: 'OUT 저장' }],
    note: '시안 · 홈에서 [OUT 기록하기] 탭 1 → 학생 찾기(초성 입력 1 + 탭 1) → 항목 탭 1 → [OUT 저장] 탭 1 = 탭 4 + 입력 1 (약 30초). 일시·적발 교사는 기본값(지금·나).' });
  m.appendChild(card('학생', [studentPick('', 'ㅂㄷㅅ')]));
  m.appendChild(el('div', { class: 'notice warn', text: '3. 박다솜은 이번 학기 이미 1OUT입니다. 저장하면 2OUT — 퇴실 대상이 됩니다.' }));
  var chips = el('div', { class: 'chips' }, ['휴대폰·전자기기', '자습 분위기 방해', '기숙사 생활 위반'].map(function (t, i) { return el('button', { type: 'button', class: 'chip' + (i === 0 ? ' on' : ''), text: t }); }));
  m.appendChild(card('무엇을', [chips, el('div', { class: 'hint muted', text: '무단 지각·결석·이탈은 출결 담당이 미인정 특이사항으로 입력하면 자동으로 기록됩니다.' })]));
  m.appendChild(card('언제·누가', [
    UI.dateField({ label: '날짜', value: '2027-03-03', shortcuts: [{ label: '오늘', value: '2027-03-03' }, { label: '어제', value: '2027-03-02' }], onchange: function () {} }),
    inputField('시각', 'time', '21:40'),
    selectField('적발 교사', ['박선생(나)'].concat(TEACHERS.filter(function (t) { return t !== '박선생'; })).concat(['(모름)']), '박선생(나)'),
    UI.field('상황 메모(선택)', el('textarea', { maxlength: '200', text: '자습 중 휴대폰 사용' }), { hint: '200자까지. 길게 쓰지 않습니다.' })]));
});
def('outs-term', 'F4 OUT', 'F4-2 이번 학기 현황', {}, function (root) {
  var m = frame(root, { title: 'OUT', who: '관리자', tabs: outTabs(1), note: '시안 · 이번 학기(1학기) 누적. 학기마다 초기화되고 이전 학기는 조회만. 1학사 교사는 학사생 전체를 보고 담임은 우리 반만 본다. [취소 처리]는 관리자만 보인다.' });
  m.appendChild(el('div', { class: 'stats', style: 'margin-bottom:12px' }, [statBox(8, 'OUT 기록'), statBox(2, '1OUT 학생'), statBox(2, '퇴실 대상')]));
  m.appendChild(UI.segmented({ options: [{ value: 'mine', label: '내 담당' }, { value: 'all', label: '전체' }], value: 'all', onchange: function () {} }));
  var c = card('', []);
  var ul = el('ul', { class: 'list' });
  [['3. 박다솜', 'out2', '퇴실 대상', '3월 3일 자습 분위기 방해'], ['2. 이나래', 'out2', '퇴실 대상', '3월 2일 휴대폰·전자기기'], ['1. 김가온', 'out1', '1OUT', '3월 2일 휴대폰·전자기기'], ['2. 최하늘', 'out1', '1OUT', '3월 3일 무단 지각·결석·이탈(자동)'], ['3. 정하윤', 'mute', '퇴실 처리됨', '2월 27일 기숙사 생활 위반']].forEach(function (r) {
    ul.appendChild(el('li', { style: 'align-items:center' }, [el('div', {}, [el('b', { text: r[0] }), el('div', { class: 'muted', text: '가장 최근: ' + r[3] })]), UI.statusPill(r[1], r[2])]));
  });
  c.appendChild(ul); m.appendChild(c);
  m.appendChild(card('3. 박다솜 · OUT 2건', [el('ul', { class: 'list' }, [
    el('li', { style: 'align-items:center' }, [el('div', {}, [el('div', { text: '3월 3일(수) 21:40 · 자습 분위기 방해' }), el('div', { class: 'muted', text: '적발 박선생 · 입력 박선생 · 직접' })]), el('button', { type: 'button', class: 'btn secondary', text: '취소 처리' })]),
    el('li', { style: 'align-items:center' }, [el('div', {}, [el('div', { text: '3월 1일(월) 22:10 · 휴대폰·전자기기' }), el('div', { class: 'muted', text: '적발 김선생 · 입력 이선생 · 직접' })]), el('button', { type: 'button', class: 'btn secondary', text: '취소 처리' })])])]));
});
def('outs-today', 'F4 OUT', 'F4-2 오늘 현황', {}, function (root) {
  var m = frame(root, { title: 'OUT', who: '박선생', tabs: outTabs(2), note: '시안 · 오늘 기록된 OUT. 1학사 교사는 학사생 전체의 오늘 OUT을 본다(입력은 담당 학생·내가 근무한 날만).' });
  m.appendChild(card('3월 3일(수) 2건', [el('ul', { class: 'list' }, [
    el('li', { style: 'align-items:center' }, [el('div', {}, [el('b', { text: '21:40 · 3. 박다솜' }), el('div', { text: '자습 분위기 방해' }), el('div', { class: 'muted', text: '적발 박선생 · 입력 박선생' })]), UI.statusPill('mute', '직접')]),
    el('li', { style: 'align-items:center' }, [el('div', {}, [el('b', { text: '08:30 · 2. 최하늘' }), el('div', { text: '무단 지각·결석·이탈' }), el('div', { class: 'muted', text: '출결 담당 정선생이 입력한 미인정 지각에서 자동 기록' })]), UI.statusPill('mute', '자동')])])]));
});
function dismissCard(name, detail, pill, msg, btn, disabled) {
  var c = card('', []);
  c.appendChild(row([el('h2', { text: name, style: 'margin:0' }), pill], 'justify-content:space-between;margin-bottom:4px'));
  c.appendChild(el('div', { class: 'muted', text: detail }));
  if (msg) c.appendChild(el('div', { style: 'margin:8px 0', text: msg }));
  if (btn) c.appendChild(el('button', { type: 'button', class: 'btn block' + (btn.kind ? ' ' + btn.kind : ''), text: btn.text }));
  if (disabled) c.lastChild.setAttribute('aria-disabled', 'true');
  return c;
}
def('dismiss-teacher', 'F4 OUT', 'F4-3 퇴실 대상 (담당교사 박선생)', {}, function (root) {
  var m = frame(root, { title: 'OUT', who: '박선생', tabs: outTabs(3), note: '시안 · 모든 학사생의 퇴실 대상이 보이고, 면담은 담당교사만 기록한다. 기록 뒤에는 관리자가 퇴실을 확정한다(유예 없음).' });
  m.appendChild(UI.segmented({ options: [{ value: 'mine', label: '내 담당' }, { value: 'all', label: '전체' }], value: 'all', onchange: function () {} }));
  m.appendChild(dismissCard('3. 박다솜 (내 담당)', '2OUT · 3월 1일 휴대폰·전자기기 / 3월 3일 자습 분위기 방해', UI.statusPill('todo', '면담 필요'), '학부모 면담을 하고 기록해 주세요. 기록이 있어야 관리자가 퇴실을 확정할 수 있습니다.', { text: '면담 기록하기' }));
  m.appendChild(dismissCard('2. 이나래 (담당 김선생)', '2OUT · 2월 26일 기숙사 생활 위반 / 3월 2일 휴대폰·전자기기', UI.statusPill('confirmed', '면담 기록됨'), '관리자가 퇴실을 확정합니다. 면담은 담당 김선생만 기록합니다.', null));
});
def('dismiss-admin', 'F4 OUT', 'F4-3 퇴실 대상 (관리자: 4가지 상태)', {}, function (root) {
  var m = frame(root, { title: 'OUT', who: '관리자', tabs: outTabs(3), note: '시안 · 같은 상태를 보는 사람에 따라 문구가 다르다: 담당교사 "면담 기록됨" = 관리자 "퇴실 확정 가능". 면담 내용은 담당교사와 관리자만 볼 수 있고 이 화면에는 날짜·내용이 나오지 않는다.' });
  m.appendChild(dismissCard('3. 박다솜 (담당 박선생)', '2OUT · 3월 3일 2번째 OUT', UI.statusPill('todo', '면담 필요'), '담당교사가 학부모 면담을 기록하면 확정할 수 있습니다.', { text: '퇴실 확정 — 면담 기록 필요' }, true));
  m.appendChild(dismissCard('2. 이나래 (담당 김선생)', '2OUT · 3월 2일 2번째 OUT', UI.statusPill('confirmed', '퇴실 확정 가능'), '면담이 기록되어 있습니다. 확정하면 입퇴실 신청서가 미리 채워집니다.', { text: '퇴실 확정' }));
  m.appendChild(card('퇴실 처리됨 (1)', [el('ul', { class: 'list' }, [el('li', { style: 'align-items:center' }, [el('div', {}, [el('b', { text: '3. 정하윤' }), el('div', { class: 'muted', text: '3월 1일 퇴실 확정 · 입퇴실에서 확인' })]), UI.statusPill('mute', '퇴실 처리됨')])])]));
});
def('counsel-sheet', 'F4 OUT', 'F4-3 면담 기록 시트 (담당교사)', { sheet: true }, function (root) {
  var m = frame(root, { title: 'OUT', who: '박선생', tabs: outTabs(3) });
  m.appendChild(dismissCard('3. 박다솜 (내 담당)', '2OUT · 3월 1일 휴대폰·전자기기 / 3월 3일 자습 분위기 방해', UI.statusPill('todo', '면담 필요'), '', { text: '면담 기록하기' }));
  var c = el('div', {}, [
    kv([['학생', '3. 박다솜'], ['연결 OUT', '3월 3일 자습 분위기 방해(2OUT)']]),
    UI.dateField({ label: '면담 날짜', value: '2027-03-03', shortcuts: [{ label: '오늘', value: '2027-03-03' }], onchange: function () {} }),
    UI.field('면담 내용', el('textarea', { text: '' }), { hint: '면담 내용은 담당교사와 관리자만 볼 수 있습니다. 입퇴실 기록에는 면담 날짜도 쓰이지 않습니다.' })
  ]);
  UI.bottomSheet({ title: '학부모 면담 기록', content: c, actions: [{ text: '닫기', kind: 'secondary' }, { text: '면담 기록 저장' }] }).open();
});
def('dismiss-confirm', 'F4 OUT', 'F4-3 관리자 퇴실 확정 확인창', { sheet: true }, function (root) {
  var m = frame(root, { title: 'OUT', who: '관리자', tabs: outTabs(3) });
  m.appendChild(dismissCard('2. 이나래 (담당 김선생)', '2OUT', UI.statusPill('confirmed', '퇴실 확정 가능'), '', { text: '퇴실 확정' }));
  UI.confirmSheet({ title: '퇴실을 확정합니다', lead: '2. 이나래 · 2OUT 퇴실', lines: ['학부모 면담이 기록되어 있습니다', '확정하면 입퇴실 신청서가 미리 채워집니다', '적용일은 확정 다음 날(3월 4일), 다음 화면에서 고칠 수 있습니다', '유예는 없습니다'], confirmText: '퇴실 확정', danger: true });
});

/* ═════════ F6 입퇴실 ═════════ */
function moveTabs(on) { return [{ t: '입퇴실', on: on === 0 }, { t: '급식 변경', on: on === 1 }, { t: '학생 기록', on: on === 2 }]; }
function moveForm(m, prefill) {
  m.appendChild(card('학생', [studentPick('', prefill ? 'ㅇㄴㄹ' : 'ㅂㄷㅅ'), el('div', { class: 'muted', text: '지금 상태: 학사 · 기숙사 · 조식 실시 · 석식 학사 석식' })]));
  var chips = el('div', { class: 'chips' }, [
    el('button', { type: 'button', class: 'chip', disabled: 'disabled', text: '학사 퇴실' }),
    el('button', { type: 'button', class: 'chip', text: '기숙사 퇴실' }),
    el('button', { type: 'button', class: 'chip' + (prefill ? '' : ' on'), text: '학사 및 기숙사 퇴실' })]);
  var typeField = UI.field(prefill ? '유형(꼭 골라 주세요)' : '유형', chips, { hint: '기숙사생은 "학사 퇴실"만 할 수 없습니다. "학사 및 기숙사 퇴실"로 신청해 주세요.' });
  if (prefill) typeField.setError('유형을 골라 주세요. 미리 정해 두지 않았습니다.');
  m.appendChild(card('무엇을', [typeField]));
  m.appendChild(card('날짜', [
    inputField('신청 일시', 'datetime-local', '2027-03-03T10:45', '신청서를 받은 날짜·시각. 기본값은 지금입니다.'),
    UI.dateField({ label: prefill ? '적용일(확정 다음 날)' : '적용일', value: prefill ? '2027-03-04' : '2027-03-05', shortcuts: [{ label: '오늘', value: '2027-03-03' }, { label: '내일', value: '2027-03-04' }], onchange: function () {} })]));
  var dinner = UI.field('석식', UI.segmented({ options: [{ value: 'stop', label: '중단' }, { value: 'normal', label: '일반 석식으로' }], value: prefill ? '' : 'stop', onchange: function () {} }), { hint: '"중단"은 미실시 규칙(수~일 신청이면 다다음 주 월요일)을 따릅니다.' });
  if (prefill) dinner.setError('석식을 골라 주세요. 기본값이 없습니다.');
  m.appendChild(card('급식 정리', [dinner, el('div', { class: 'notice info', text: '조식은 적용일부터 바로 중단됩니다.' })]));
  m.appendChild(card('사유·서류', [inputField('사유', 'text', prefill ? '2OUT 퇴실' : ''), checkRow('학교 서류 제출함', false), el('div', { class: 'notice warn', text: '서류 미제출로 기록됩니다. 담당교사 홈에 남습니다.' })]));
}
def('moves-inout', 'F6 입퇴실', 'F6-1 입퇴실 신청 (기숙사생: 학사 퇴실 막힘)', {}, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: moveTabs(0), bar: [{ text: '닫기', kind: 'secondary' }, { text: '입퇴실 신청' }],
    note: '시안 · 학생 찾기(초성 입력 1 + 탭 1) → 유형 탭 1 → 적용일(기본 오늘, 고치려면 +1) → [입퇴실 신청] → 확인창에서 [입퇴실 저장]. 기숙사생은 "학사 퇴실" 칩이 꺼져 있다.' });
  moveForm(m, false);
});
def('moves-confirm', 'F6 입퇴실', 'F6-1 입퇴실 확인창 (날짜를 크게)', { sheet: true }, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: moveTabs(0), bar: [{ text: '닫기', kind: 'secondary' }, { text: '입퇴실 신청' }] });
  moveForm(m, false);
  UI.confirmSheet({ title: '입퇴실을 저장합니다', lead: '3월 5일(금)부터 학사 및 기숙사 퇴실', lines: ['자리 공석', '기숙사 3월 5일 퇴실', '조식 3월 5일 중단', '석식 3월 15일(월) 중단', '서류 미제출로 기록됩니다'], confirmText: '입퇴실 저장', danger: true });
});
def('moves-prefill', 'F6 입퇴실', 'F6-1 2OUT 퇴실 확정 뒤 미리 채워진 신청서', {}, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '관리자', tabs: moveTabs(0), bar: [{ text: '닫기', kind: 'secondary' }, { text: '입퇴실 신청' }],
    note: '시안 · [퇴실 확정] 뒤 이 화면으로 온다. 유형·석식은 미리 고르지 않아 관리자가 골라야 저장된다. 적용일은 확정 다음 날, 사유 "2OUT 퇴실", 서류 미제출.' });
  m.appendChild(el('div', { class: 'notice info', text: '2OUT 퇴실로 채워진 신청서입니다. 유형과 석식을 고르고 적용일을 확인한 뒤 저장해 주세요.' }));
  moveForm(m, true);
});

/* ═════════ F7 급식 ═════════ */
def('meal-change', 'F7 급식', 'F7-1 급식 변경 신청 (석식 미실시)', {}, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: moveTabs(1), bar: [{ text: '닫기', kind: 'secondary' }, { text: '변경 신청' }],
    note: '시안 · 학생 → 칩 → (적용일은 자동) → [변경 신청] → 확인창. 탭 4 + 입력 1. 신청 일시 기본값은 지금.' });
  m.appendChild(card('학생', [studentPick('', 'ㄱㄱㅇ')]));
  m.appendChild(card('무엇을', [el('div', { class: 'chips' }, ['조식 실시', '조식 미실시', '석식 실시', '석식 미실시', '일반 석식으로 변경'].map(function (t) { return el('button', { type: 'button', class: 'chip' + (t === '석식 미실시' ? ' on' : ''), text: t }); }))]));
  m.appendChild(card('신청 일시', [inputField('', 'datetime-local', '2027-03-03T10:45', '기본값은 지금입니다. 11:30 규칙에 쓰이므로 서류의 시각과 다르면 고쳐 주세요.')]));
  m.appendChild(card('적용일', [
    row([el('b', { text: '3월 15일(월)', style: 'font-size:var(--font-xl)' }), el('button', { type: 'button', class: 'btn secondary', text: '고치기' })], 'justify-content:space-between'),
    el('div', { class: 'notice info', style: 'margin-top:12px', text: '수~일 신청이라 다다음 주 월요일부터 적용됩니다.' }),
    checkRow('학교 서류 제출함', false), el('div', { class: 'notice warn', text: '서류 미제출로 기록됩니다. 담당교사 홈에 남습니다.' })]));
});
def('meal-change-edit', 'F7 급식', 'F7-1 적용일을 손으로 고침 (사유 필수)', {}, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: moveTabs(1), bar: [{ text: '닫기', kind: 'secondary' }, { text: '변경 신청', disabled: true }],
    note: '시안 · 자동 계산과 다른 적용일을 넣으면 사유가 꼭 필요하고, 신청일보다 이르면 막고, 급식실 준비 기간보다 이르면 확인을 받는다.' });
  m.appendChild(card('학생', [studentPick('', 'ㄱㄱㅇ')]));
  m.appendChild(card('무엇을', [el('div', { class: 'chips' }, ['조식 실시', '조식 미실시', '석식 실시', '석식 미실시', '일반 석식으로 변경'].map(function (t) { return el('button', { type: 'button', class: 'chip' + (t === '석식 미실시' ? ' on' : ''), text: t }); }))]));
  var reason = UI.field('사유(꼭 적어 주세요)', el('input', { type: 'text', value: '' }));
  reason.setError('고친 적용일에는 사유가 필요합니다. 2자 이상 적어 주세요.');
  m.appendChild(card('적용일', [
    UI.dateField({ label: '적용일(고침)', value: '2027-03-08', onchange: function () {} }),
    el('div', { class: 'muted', text: '자동 계산: 3월 15일(월) · 수~일 신청이라 다다음 주 월요일' }),
    el('div', { class: 'notice warn', style: 'margin-top:12px', text: '급식실 준비 기간(다음 주 월요일 규칙)보다 이른 날짜입니다. 그래도 저장하면 이 날짜로 적용됩니다.' }),
    reason]));
});
def('meal-confirm', 'F7 급식', 'F7-1 급식 변경 확인창', { sheet: true }, function (root) {
  var m = frame(root, { title: '입퇴실·급식', who: '박선생', tabs: moveTabs(1), bar: [{ text: '닫기', kind: 'secondary' }, { text: '변경 신청' }] });
  m.appendChild(card('학생', [studentPick('', 'ㄱㄱㅇ')]));
  UI.confirmSheet({ title: '급식 변경을 저장합니다', lead: '3월 15일(월)부터 석식 미실시', lines: ['1. 김가온 · 석식(학사)', '수~일 신청이라 다다음 주 월요일부터 적용됩니다', '서류 미제출로 기록됩니다'], confirmText: '변경 신청' });
});
function mealTable(split) {
  var heads = split ? ['학년·성별', '학사', '기숙', '비기숙', '조식', '석식 학사', '석식 일반'] : ['학년·성별', '학사', '기숙', '비기숙', '조식', '석식'];
  var rows = [
    ['여1', 4, 3, 1, 3, 4, 0], ['여2', 3, 3, 0, 3, 3, 0], ['여3', 3, 2, 1, 2, 3, 0], ['여 합계', 10, 8, 2, 8, 10, 0, 1],
    ['남1', 7, 5, 2, 5, 7, 0], ['남2', 7, 6, 1, 6, 5, 2], ['남3', 6, 5, 1, 4, 5, 1], ['남 합계', 20, 16, 4, 15, 17, 3, 1],
    ['1학년', 11, 8, 3, 8, 11, 0], ['2학년', 10, 9, 1, 9, 8, 2], ['3학년', 9, 7, 2, 6, 8, 1], ['전체', 30, 24, 6, 23, 27, 3, 1]
  ];
  var thead = el('thead', {}, [el('tr', {}, heads.map(function (h) { return el('th', { scope: 'col', text: h }); }))]);
  var tbody = el('tbody', {}, rows.map(function (r) {
    var total = r.length === 8;
    var cells = [el('th', { scope: 'row', text: r[0] })];
    var vals = r.slice(1, 7);
    var show = split ? vals : vals.slice(0, 4).concat([vals[4] + vals[5]]);
    show.forEach(function (v) { cells.push(el('td', { text: String(v) })); });
    return el('tr', { class: total ? 'total' : '' }, cells);
  }));
  return el('div', { class: 'tablewrap' }, [el('table', { class: 'data' }, [thead, tbody])]);
}
function mealCount(root, split) {
  var m = frame(root, { title: '식수 집계', who: '관리자', bar: [{ text: '급식실 양식으로 출력' }],
    note: '시안 · 합계 줄은 굵은 글씨 + 회색 바탕(색만으로 구분하지 않음). 휴대폰에서는 표 안에서만 가로로 밀고 첫 열은 고정. 숫자는 가짜.' });
  m.appendChild(row([el('button', { type: 'button', class: 'btn secondary', text: '‹' }), el('b', { text: '3월 3일(수)', style: 'flex:1;text-align:center' }), el('button', { type: 'button', class: 'btn secondary', text: '›' })], 'margin-bottom:4px'));
  m.appendChild(el('div', { class: 'muted', style: 'text-align:center;margin-bottom:12px', text: '2027 1학기 · 이 날 자습 운영' }));
  m.appendChild(UI.segmented({ options: [{ value: 'sum', label: '석식 합계' }, { value: 'split', label: '석식 나눠 보기' }], value: split ? 'split' : 'sum', onchange: function () {} }));
  m.appendChild(mealTable(split));
  m.appendChild(el('div', { class: 'muted', style: 'margin:-4px 0 12px', text: '표는 옆으로 밀 수 있습니다(첫 열은 고정).' }));
  m.appendChild(el('div', { class: 'notice info', text: '신청 기준 인원입니다(결석·외박은 반영하지 않습니다).' }));
  m.appendChild(card('', [
    row([el('span', { text: '퇴실 후 석식 유지' }), el('b', { text: '1명' })], 'justify-content:space-between'),
    el('div', { class: 'muted', text: '학사 퇴실했지만 석식 중단일 전이라 학사 석식에 포함됩니다.' }),
    row([el('a', { href: '#', class: 'btn secondary', text: '서류 미제출 2명 ▸' })], 'margin-top:8px')]));
}
def('mealcount', 'F7 급식', 'F7-2 식수 집계 (석식 합계)', {}, function (root) { mealCount(root, false); });
def('mealcount-split', 'F7 급식', 'F7-2 식수 집계 (석식 나눠 보기)', {}, function (root) { mealCount(root, true); });

/* ═════════ 실행 ═════════ */
function renderScreen(id) {
  var s = SCREENS[id];
  var root = document.getElementById('app');
  if (!s) {
    root.appendChild(el('main', {}, [el('h1', { text: 'D6 시안 목록 (가짜 이름 · 정적 미리보기)' })].concat(ORDER.map(function (k) { return el('p', {}, [el('a', { href: '#' + k, text: SCREENS[k].group + ' · ' + SCREENS[k].label })]); }))));
    return;
  }
  s.fn(root);
  document.title = s.label;
}
window.addEventListener('hashchange', function () { location.reload(); });
renderScreen(location.hash.replace('#', ''));
document.body.setAttribute('data-ready', '1');
