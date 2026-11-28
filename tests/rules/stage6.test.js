/** R24 6단계 공개 판정표(stage6-rules-draft 2절, 결정 89~97)·쓰기 판정·타임라인. 가짜 데이터만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/Stage6Rules.gs', 'src/rules/CounselRules.gs']);
const ROLES = ['admin', 'assigned', 'homeroom', 'student', 'parent', 'none'];
const V = (role) => ({ role, isSelf: true, isChild: true });

// 시험 데이터 = 판정표(문서 2절을 그대로 옮김, 코드의 표를 읽지 않는다). 공개 표시는 모두 켠 행 기준.
const ALL = {
  profile: 'id term_id student_id version hopes targets interests strengths concerns parent_fields submitted_at status cancel_reason',
  plan: 'id term_id student_id entry_year grade semester choice_group course state confirmed_by confirmed_at show_to_parent status cancel_reason',
  recs: 'university unit core recommended baseYear sourceTitle sourceUrl note',
  inquiry: 'id term_id student_id source_id recorded_at source standards subject title question liked progress result_link memo file_id name_mismatch show_to_parent status cancel_reason',
  feedback: 'id term_id student_id target_kind target_id content teacher_email status cancel_reason created_at',
  request: 'id term_id student_id requester_email wish_dates topic memo status decided_date linked_note_id cancel_reason created_at',
  note: 'id student_id date teacher_email type target linked_violation_id content agreement agreement_to_parent profile_version request_id show_to_parent status cancel_reason',
  timeline: 'at kind title detail ref'
};
const INQ_STAFF = 'id term_id student_id source_id recorded_at source standards subject title question liked progress result_link memo name_mismatch show_to_parent status cancel_reason';
const EXPECT = {
  profile: { admin: ALL.profile, assigned: ALL.profile, homeroom: ALL.profile, student: ALL.profile, parent: 'hopes targets interests strengths concerns submitted_at', none: '' },
  plan: { admin: ALL.plan, assigned: ALL.plan, homeroom: ALL.plan, student: 'id term_id student_id entry_year grade semester choice_group course state confirmed_at show_to_parent status',
    parent: 'grade semester choice_group course state', none: '' },
  recs: { admin: ALL.recs, assigned: ALL.recs, homeroom: ALL.recs, student: ALL.recs, parent: '', none: '' },
  inquiry: { admin: ALL.inquiry, assigned: INQ_STAFF, homeroom: INQ_STAFF,
    student: 'id term_id student_id source_id recorded_at source standards subject title question liked progress result_link memo show_to_parent status',
    parent: 'recorded_at source standards subject title question progress result_link memo', none: '' },
  feedback: { admin: ALL.feedback, assigned: ALL.feedback, homeroom: ALL.feedback, student: 'id term_id student_id target_kind target_id content teacher_name status created_at', parent: '', none: '' },
  request: { admin: ALL.request, assigned: ALL.request, homeroom: 'id student_id wish_dates topic status decided_date created_at',
    student: 'id term_id student_id wish_dates topic memo status decided_date cancel_reason created_at', parent: '', none: '' },
  note: { admin: ALL.note, assigned: ALL.note, homeroom: ALL.note, student: 'id date teacher_name agreement agreement_to_parent', parent: 'id date teacher_name agreement', none: '' },
  timeline: { admin: ALL.timeline, assigned: ALL.timeline, homeroom: ALL.timeline, student: '', parent: '', none: '' }
};
const ROW_ON = { status: '유효', parent_fields: 'hopes;targets;interests;strengths;concerns', show_to_parent: 'TRUE', agreement_to_parent: 'TRUE', agreement: '다음 주까지 탐구 주제 정하기' };
const words = (s) => s ? s.split(' ') : [];

test('판정표: 역할 6 × 기록 종류 8 — 돌려주는 칸 목록이 표와 같다(공개 표시 모두 켬, 학부모는 최근 버전)', () => {
  Object.keys(EXPECT).forEach((kind) => ROLES.forEach((role) =>
    assert.deepStrictEqual(plain(ctx.s6Visible_(V(role), kind, ROW_ON, { isLatest: true })), words(EXPECT[kind][role]), kind + ' × ' + role)));
});

// 금지 칸: 학생·학부모·담임에게 절대 나가면 안 되는 칸(결정 91·94·96·100, CLAUDE.md 6)
const FORBID = {
  student: { note: ['content', 'type', 'target', 'teacher_email', 'linked_violation_id', 'profile_version', 'show_to_parent', 'request_id', 'cancel_reason'],
    inquiry: ['file_id', 'name_mismatch', 'cancel_reason'], feedback: ['teacher_email', 'cancel_reason'], request: ['requester_email', 'linked_note_id'], timeline: ['at', 'kind', 'title', 'detail', 'ref'], plan: ['confirmed_by', 'cancel_reason'] },
  parent: { note: ['content', 'type', 'target', 'teacher_email', 'linked_violation_id', 'profile_version', 'request_id', 'cancel_reason', 'agreement_to_parent', 'show_to_parent'],
    inquiry: ['file_id', 'name_mismatch', 'liked', 'source_id', 'show_to_parent', 'student_id', 'cancel_reason'], feedback: ['content', 'created_at'], request: ['created_at', 'memo', 'topic', 'wish_dates', 'status', 'cancel_reason'],
    profile: ['version', 'parent_fields', 'student_id', 'term_id', 'cancel_reason'], plan: ['show_to_parent', 'confirmed_by', 'student_id', 'cancel_reason'], recs: ['university'], timeline: ['title'] },
  homeroom: { request: ['memo', 'requester_email', 'cancel_reason', 'linked_note_id'], inquiry: ['file_id'] },
  assigned: { inquiry: ['file_id'] }
};

test('금지 칸 없음: 공개 표시·상태·최근 여부를 바꾼 640가지에서 학생·학부모·담임 칸에 금지 칸이 하나도 없다', () => {
  let n = 0;
  const vals = { status: ['유효', '취소', '확정', '반려', '신청'], parent_fields: ['', 'hopes', 'all;targets', 'concerns;memo;file_id'], show_to_parent: ['TRUE', 'FALSE', ''], agreement_to_parent: ['TRUE', 'FALSE'], agreement: ['', '합의'] };
  for (let k = 0; k < 80; k++) {
    const row = {};
    Object.keys(vals).forEach((c, j) => { row[c] = vals[c][(k * (j + 3) + j) % vals[c].length]; });
    Object.keys(FORBID).forEach((role) => Object.keys(ALL).forEach((kind) => {
      const got = plain(ctx.s6Visible_(V(role), kind, row, { isLatest: k % 2 === 0 }));
      (FORBID[role][kind] || []).forEach((f) => assert.ok(got.indexOf(f) < 0, role + ' ' + kind + ' ' + f + ' ' + JSON.stringify(row)));
      if (role === 'parent' || role === 'student') assert.ok(got.every((f) => words(ALL[kind]).concat(['teacher_name']).indexOf(f) >= 0), kind + ' 모르는 칸');
      n++;
    }));
  }
  assert.strictEqual(n, 80 * 4 * 8);
});

test('본인·자녀가 아님, 취소된 기록, 지난 버전, show_to_parent FALSE, 모르는 역할·종류 → 못 봄', () => {
  assert.deepStrictEqual(plain(ctx.s6Visible_({ role: 'student', isSelf: false }, 'profile', ROW_ON)), []);
  assert.deepStrictEqual(plain(ctx.s6Visible_({ role: 'parent', isChild: false }, 'note', ROW_ON)), []);
  const cancelled = Object.assign({}, ROW_ON, { status: '취소' });
  ['profile', 'plan', 'inquiry', 'feedback', 'note'].forEach((k) => {
    assert.deepStrictEqual(plain(ctx.s6Visible_(V('student'), k, cancelled, { isLatest: true })), [], 'student ' + k);
    assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), k, cancelled, { isLatest: true })), [], 'parent ' + k);
  });
  assert.ok(ctx.s6Visible_(V('student'), 'request', cancelled).includes('cancel_reason'), '학생은 취소한 자기 신청을 본다');
  assert.ok(ctx.s6Visible_(V('admin'), 'note', cancelled).includes('content'), '교사는 취소된 기록도 본다');
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), 'profile', ROW_ON, { isLatest: false })), [], '지난 버전은 학부모에게 안 보임(결정 89)');
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), 'profile', ROW_ON)), []);
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), 'profile', Object.assign({}, ROW_ON, { parent_fields: 'targets' }), { isLatest: true })), ['targets', 'submitted_at'], '공개 항목 + 낸 날');
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), 'profile', Object.assign({}, ROW_ON, { parent_fields: '' }), { isLatest: true })), [], '공개 항목이 없으면 낸 날도 없음');
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), 'note', Object.assign({}, ROW_ON, { show_to_parent: 'FALSE' }))), [], '(가정) 상담 여부를 숨긴 건은 합의 사항도');
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), 'note', Object.assign({}, ROW_ON, { agreement_to_parent: 'FALSE' }))), ['id', 'date', 'teacher_name'], '합의 사항 비공개면 날짜·교사만');
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('parent'), 'note', Object.assign({}, ROW_ON, { agreement: '' }))), ['id', 'date', 'teacher_name'], '빈 합의 사항은 공개 표시가 켜져도 없음');
  ['teacher', 'hall_teacher', 'cols', '', undefined].forEach((role) => assert.deepStrictEqual(plain(ctx.s6Visible_({ role }, 'note', ROW_ON)), [], String(role)));
  assert.deepStrictEqual(plain(ctx.s6Visible_(V('admin'), 'secret', ROW_ON)), []);
  assert.deepStrictEqual(plain(ctx.s6Visible_(null, 'note', null)), []);
});

test('s6ParentFields_: 항목 목록은 정해진 항목만·정해진 순서, 표시가 비거나 모르는 값이면 [](기본 비공개)', () => {
  const T = [
    ['profile', { parent_fields: 'targets;hopes' }, ['hopes', 'targets']],
    ['profile', { parent_fields: ' concerns , interests ' }, ['interests', 'concerns']],
    ['profile', { parent_fields: 'file_id;memo;content' }, []],
    ['profile', {}, []],
    ['plan', { show_to_parent: 'TRUE' }, ['grade', 'semester', 'choice_group', 'course', 'state']],
    ['plan', { show_to_parent: true }, ['grade', 'semester', 'choice_group', 'course', 'state']],
    ['plan', { show_to_parent: 'FALSE' }, []], ['plan', { show_to_parent: '' }, []], ['inquiry', { show_to_parent: '공개' }, []], ['plan', { parent_public: 'TRUE' }, []],
    ['note', { agreement_to_parent: 'TRUE', agreement: 'x' }, ['agreement']], ['note', { agreement_to_parent: 'TRUE', agreement: ' ' }, []],
    ['feedback', { show_to_parent: 'TRUE' }, []], ['request', { show_to_parent: 'TRUE' }, []],
  ];
  T.forEach(([k, row, want]) => assert.deepStrictEqual(plain(ctx.s6ParentFields_(row, k)), want, k + ' ' + JSON.stringify(row)));
});

test('s6CanWrite_: 누가 쓰나 — 학생 본인·담당교사만, 담임은 못 씀, 학사생이 아니게 되면 아무도 못 씀(결정 97)', () => {
  const W = {
    'profile.submit': ['student'], 'plan.edit': ['student'], 'plan.confirm': ['assigned'], 'inquiry.upload': ['student'],
    'feedback.write': ['assigned'], 'request.create': ['student'], 'request.cancel': ['student'], 'request.process': ['assigned', 'admin'],
    'note.write': ['assigned'], 'note.publish': ['student'], 'profile.publish': ['student'], 'inquiry.progress': ['student'], 'inquiry.publish': ['student']
  };
  Object.keys(W).forEach((a) => ROLES.forEach((role) => {
    assert.strictEqual(ctx.s6CanWrite_(V(role), a, { active: true }).ok, W[a].includes(role), a + ' ' + role);
    assert.strictEqual(ctx.s6CanWrite_(V(role), a, { active: false }).ok, false, a + ' ' + role + ' 퇴실');
  }));
  assert.strictEqual(ctx.s6CanWrite_({ role: 'student', isSelf: false }, 'request.create', { active: true }).ok, false, '남의 신청');
  assert.match(ctx.s6CanWrite_(V('student'), 'profile.submit', { active: false }).reason, /지난 기록은 계속 볼 수 있습니다/);
  assert.strictEqual(ctx.s6CanWrite_(V('admin'), 'delete', { active: true }).ok, false);
});

test('s6Timeline_: 그 학생 것만·취소 빼고·시간 내림차순, 상담은 합의 사항만(내용 없음), 날짜 범위', () => {
  const src = {
    profiles: [{ id: 'p1', student_id: 's1', version: 1, submitted_at: '2027-03-05T10:00:00' }, { id: 'p2', student_id: 's2', version: 1, submitted_at: '2027-03-06T10:00:00' }],
    plans: [{ id: 'c1', student_id: 's1', grade: 2, semester: 1, course: '물리학', state: '계획', status: '유효', created_at: '2027-03-07T09:00:00' },
      { id: 'c2', student_id: 's1', grade: 2, semester: 1, course: '화학', state: '계획', status: '취소', created_at: '2027-03-07T10:00:00' }],
    inquiries: [{ id: 'i1', student_id: 's1', title: '가짜 탐구 주제', progress: '진행 중', recorded_at: '2027-03-04T20:00:00' }],
    notes: [{ id: 'n1', student_id: 's1', date: '2027-03-10', content: '비밀 내용', type: '진로', agreement: '다음 주 다시' }],
    violations: [{ id: 'v1', student_id: 's1', occurred_at: '2027-03-08T21:00:00', rule_name: '자습 중 휴대폰' }],
    exceptions: [{ id: 'e1', student_id: 's1', date: '2027-03-09', type: '병결', status: '확정' }, { id: 'e2', student_id: 's1', date: '2027-03-09', type: '병결', status: '요청' }],
  };
  const t = plain(ctx.s6Timeline_(src, 's1'));
  assert.deepStrictEqual(t.map((x) => x.ref.id), ['n1', 'e1', 'v1', 'c1', 'p1', 'i1']);
  assert.deepStrictEqual(t[0], { at: '2027-03-10', kind: 'note', title: '상담', detail: '다음 주 다시', ref: { kind: 'note', id: 'n1' } });
  assert.ok(!JSON.stringify(t).includes('비밀 내용') && !JSON.stringify(t).includes('"진로"'), '상담 내용·유형 없음');
  assert.deepStrictEqual(plain(ctx.s6Timeline_(src, 's1', { from: '2027-03-06', to: '2027-03-09' })).map((x) => x.ref.id), ['e1', 'v1', 'c1']);
  assert.deepStrictEqual(plain(ctx.s6Timeline_({}, 's1')), []);
});

test('s6RoleForRow_(결정 97·104): 기록의 기간 담당 또는 지금 담당 = assigned, 전 담당은 자기 기간만, 학생·학부모·관리자·담임은 그대로', () => {
  const ENR = [
    { term_id: 'T1', student_id: 's1', teacher_email: 'old@example.com' },
    { term_id: 'T2', student_id: 's1', teacher_email: 'New@Example.com ' },
    { term_id: 'T2', student_id: 's2', teacher_email: 'old@example.com' }
  ];
  const T = (email, termId, nowTermId, extra) => plain(ctx.s6RoleForRow_(ENR, email, 's1', termId, Object.assign({ role: 'none', hallTeacher: true, nowTermId }, extra || {})));
  assert.deepStrictEqual(T('new@example.com', 'T1', 'T2'), { role: 'assigned', isSelf: false, isChild: false }, '지금 담당 → 지난 기간 기록');
  assert.strictEqual(T('new@example.com', 'T2', 'T2').role, 'assigned');
  assert.strictEqual(T('old@example.com', 'T1', 'T2').role, 'assigned', '전 담당 → 자기 기간 기록');
  assert.strictEqual(T('old@example.com', 'T2', 'T2').role, 'none', '전 담당 → 다른 기간 기록은 못 봄(다른 학생 s2의 담당이어도)');
  assert.strictEqual(T('other@example.com', 'T1', 'T2').role, 'none', '둘 다 아닌 교사');
  assert.strictEqual(T('old@example.com', 'T1', '').role, 'assigned', '퇴실한 학생(지금 기간 없음/미등록)의 전 담당 → 자기 기간 기록');
  assert.strictEqual(T('old@example.com', 'T3', 'T3').role, 'none', '퇴실한 학생의 전 담당 → 등록 없는 기간 기록은 못 봄');
  assert.strictEqual(T('new@example.com', 'T1', 'T2', { hallTeacher: false }).role, 'none', '학사 교사 역할이 없으면 담당 판정을 하지 않는다');
  assert.strictEqual(T('old@example.com', '', '').role, 'none', '기간을 모르는 기록');
  assert.strictEqual(T('other@example.com', 'T1', 'T2', { role: 'homeroom' }).role, 'homeroom');
  assert.strictEqual(T('new@example.com', 'T1', 'T2', { role: 'homeroom' }).role, 'assigned', '담임이면서 지금 담당이면 assigned(우선)');
  assert.deepStrictEqual(T('x@example.com', 'T9', '', { role: 'student', isSelf: true }), { role: 'student', isSelf: true, isChild: false });
  assert.strictEqual(T('old@example.com', 'T1', 'T2', { role: 'admin' }).role, 'admin');
  assert.deepStrictEqual(T('p@example.com', 'T1', 'T2', { role: 'parent', isChild: true }), { role: 'parent', isSelf: false, isChild: true });
  assert.strictEqual(plain(ctx.s6RoleForRow_(null, 'old@example.com', 's1', 'T1', null)).role, 'none', '빈 입력');
});
