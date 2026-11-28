/**
 * T12 인수 시험: 6단계(상담·진로진학) 보는 사람 × 기록 표, 누출 감시, 쓰기 함수 감사. 가짜 데이터만(docs/plan/stage6.md T12).
 *  대상(main f2ad21b): 진로 프로필(Career.gs #324)·피드백·상담 신청(CounselRequest.gs #319)·상담일지 확장과 학생·학부모 상담 기록(CounselLog·CounselMine·Portal #327)·교육과정(#317)
 *
 *  1) 표: 보는 사람 12명(학생 본인·다른 학생·학부모·다른 학부모·지금 담당·담당 아닌 학사 교사·담임(자기 반)·담임(남의 반)·관리자·owner(관리자+학사 교사)·출결·근무표) ×
 *     기록(진로 프로필·피드백·상담 신청·상담일지)마다 공개 함수의 실제 응답에 나온 칸 = S6_TABLE(src/rules/Stage6Rules.gs)이 허용한 칸 ∩ 그 함수가 내보낼 수 있는 칸.
 *     응답 키는 화면용 이름(submittedAt 등)이라 함수마다 키 → 시트 열 대응표(MAP)로 되돌린다. 대응표에 없는 키가 나오면 실패(새로 샌 칸).
 *     못 보는 사람은 첫 줄에서 거부되고 audit_log에 denied가 남는다.
 *  2) 누출 감시: 칸마다 서로 다른 가짜 표시 글을 심고, 보는 사람의 응답 JSON 전체에서 그 사람이 못 보는 칸의 표시 글이 어디에도 없는지 본다.
 *     학부모: 상담 내용·유형·대상·교사 이메일·피드백·버전 번호 없음. 학생: 상담 내용·유형·대상·교사 이메일 없음. 담임: 신청 메모 없음(결정 96).
 *  3) 결정 92: 학생이 공개를 끄면 다음 응답에서 바로 사라진다(합의 사항·진로 프로필 항목).
 *  4) 결정 97: 퇴실한 학생은 기록을 계속 보지만 쓰기는 모두 거부.
 *  5) 쓰기 함수마다: 첫 줄 거부가 denied로 남고, 저장은 audit_log에 남되 글 칸은 글자 수만, 삭제(delete) 없음·취소는 사유와 함께.
 * 아직 넣지 않은 줄(#332 병합 뒤): owner가 자기 담당 학생의 신청을 decideCounselRequest로 처리 · 전 담당(결정 104)이 자기 기간 기록을 봄.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');

const OWNER = 'owner@example.com', A_EMAIL = 'test.student@example.com', PA = 'test.parent@example.com', T = 'test.teacher@example.com',
  HR = 'test.homeroom@example.com', HR2 = 'test.homeroom2@example.com', AD = 'test.admin@example.com', ATT = 'test.attendance@example.com',
  DUTY = 'test.duty@example.com', T_OTHER = 'fake.teacher1@example.com', B_EMAIL = 'fake.student03@example.com', PB = 'fake.parent03@example.com';
const NOW = '2027-04-20T10:00:00', TODAY = NOW.slice(0, 10);
// 칸마다 다른 표시 글(누출 감시). 키 = 기록 종류.열
const M = {
  'profile.hopes': 'ZZ12희망직업', 'profile.targets': 'ZZ12목표대학', 'profile.interests': 'ZZ12관심', 'profile.strengths': 'ZZ12강점', 'profile.concerns': 'ZZ12고민',
  'feedback.content': 'ZZ12피드백', 'request.memo': 'ZZ12신청메모', 'note.content': 'ZZ12상담내용', 'note.agreement': 'ZZ12합의'
};
const NOTE_TYPE = '건강', NOTE_TARGET = '학부모';

// 응답 키 → 시트 열(가상 칸 teacher_name 포함). 함수가 내보낼 수 있는 칸 = 값들
const PROFILE_MAP = { id: 'id', version: 'version', submittedAt: 'submitted_at', hopes: 'hopes', targets: 'targets', interests: 'interests', strengths: 'strengths', concerns: 'concerns', parentFields: 'parent_fields' };
const FB_MAP = (role) => ({ id: 'id', content: 'content', teacherName: role === 'student' ? 'teacher_name' : 'teacher_email', at: 'created_at', version: 'target_id', mine: 'teacher_email' });
const REQ_COLS = ['id', 'term_id', 'student_id', 'requester_email', 'wish_dates', 'topic', 'memo', 'status', 'decided_date', 'linked_note_id', 'cancel_reason', 'created_at'];
const REQ_MAP = Object.assign(Object.fromEntries(REQ_COLS.map((c) => [c, c])), { wishDates: 'wish_dates' });
const NOTE_STAFF_MAP = { id: 'id', date: 'date', dateKo: 'date', type: 'type', target: 'target', teacher: 'teacher_email', content: 'content', showToParent: 'show_to_parent',
  status: 'status', cancelReason: 'cancel_reason', fixed: 'type', mine: 'teacher_email', canEdit: 'status', agreement: 'agreement', agreementToParent: 'agreement_to_parent',
  profileVersion: 'profile_version', requestId: 'request_id' };
const NOTE_MINE_MAP = { id: 'id', date: 'date', dateKo: 'date', teacher_name: 'teacher_name', agreement: 'agreement', agreement_to_parent: 'agreement_to_parent' };
const PORTAL_NOTE_MAP = { date: 'date', dateKo: 'date', teacher: 'teacher_name', agreement: 'agreement' };

function world() {
  const env = createGasEnv({ owner: OWNER, now: NOW });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: T, TEST_STUDENT_EMAIL: A_EMAIL, TEST_PARENT_EMAIL: PA, TEST_HOMEROOM_EMAIL: HR });
  ['setup', 'seedFakeData', 'seedFakeStage1', 'seedFakeStage6'].forEach((f) => env.asOwner((c) => c[f]()));
  env.asOwner((c) => {
    c.addUser(AD, '시험 관리자', 'admin'); c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTY, '시험 근무표', 'duty_manager');
    c.addUser(HR2, '시험 담임 2', 'homeroom', '3-7'); c.addUser(B_EMAIL, '가짜 학생 B', 'student'); c.addUser(PB, '가짜 학부모 B', 'parent');
  });
  const term = env.as(OWNER, (c) => c.getCurrentTerm_());
  const A = env.rows('students').find((s) => s.email === A_EMAIL), B = env.rows('students').find((s) => s.email === B_EMAIL);
  const teacherOf = (sid) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === sid).teacher_email;
  assert.deepStrictEqual([teacherOf(A.id), A.grade + '-' + A.class_no, teacherOf(B.id) !== T, teacherOf(B.id) !== T_OTHER], [T, '1-1', true, true], '가짜 데이터 전제');
  assert.ok(env.rows('guardian_links').some((g) => g.student_id === B.id && g.parent_email === PB) && !env.rows('guardian_links').some((g) => g.student_id === A.id && g.parent_email === PB));
  const call = (who, fn, ...a) => plain(env.call(who, fn, ...a));
  const ok = (r, what) => { assert.strictEqual(r && r.ok, true, what + ' ' + JSON.stringify(r).slice(0, 300)); return r; };
  // 심기(화면과 같은 공개 함수로): 진로 프로필 새 버전(hopes만 공개)·피드백·상담 신청·상담일지(학부모에게 상담 보임)·합의 사항 공개 켜기
  const open = env.rows('counsel_requests', 'counsel').filter((r) => r.student_id === A.id && ['신청', '확정'].includes(r.status));
  open.forEach((r) => ok(call(A_EMAIL, 'cancelCounselRequest', r.id, '가짜 취소'), '열린 신청 취소'));
  ok(call(A_EMAIL, 'submitCareerProfile', { hopes: [{ rank: 1, field: '가짜 분야', job: M['profile.hopes'] }], targets: [{ university: M['profile.targets'], unit: '가짜학과', track: '학생부종합' }],
    interests: M['profile.interests'], strengths: M['profile.strengths'], concerns: M['profile.concerns'], fields: { hopes: true, targets: false, interests: false, strengths: false, concerns: false } }), '프로필');
  const profile = env.rows('career_profiles').filter((r) => r.student_id === A.id).sort((a, b) => Number(b.version) - Number(a.version))[0];
  ok(call(T, 'addCareerFeedback', A.id, profile.id, M['feedback.content']), '피드백');
  const feedback = env.rows('feedback').find((f) => f.content === M['feedback.content']);
  ok(call(A_EMAIL, 'submitCounselRequest', { dates: ['2027-04-22', '2027-04-23'], topic: '학습', memo: M['request.memo'] }), '신청');
  const request = env.rows('counsel_requests', 'counsel').find((r) => r.memo === M['request.memo']);
  ok(call(T, 'saveCounselNote', { studentId: A.id, date: TODAY, type: NOTE_TYPE, target: NOTE_TARGET, content: M['note.content'], agreement: M['note.agreement'], showToParent: true }), '상담일지');
  const note = env.rows('counsel_notes', 'counsel').find((n) => n.content === M['note.content']);
  ok(call(A_EMAIL, 'setAgreementShare', note.id, true), '합의 사항 공개');
  const table = env.as(OWNER, (c) => JSON.parse(JSON.stringify(c.S6_TABLE)));
  return { env, term, A, B, profile, feedback, request, note, table, call, ok };
}

/** 보는 사람 → 기록마다 s6Visible_ 역할(null = 첫 줄 거부). 표의 'none' 교사·남의 학생·남의 학부모는 권한 키에서 막힌다 */
const VIEWERS = [
  { k: '학생 본인', email: A_EMAIL, role: 'student' }, { k: '다른 학생', email: B_EMAIL, role: null },
  { k: '학부모', email: PA, role: 'parent' }, { k: '다른 학부모', email: PB, role: null },
  { k: '지금 담당', email: T, role: 'assigned' }, { k: '담당 아닌 학사 교사', email: T_OTHER, role: null },
  { k: '담임(자기 반)', email: HR, role: 'homeroom' }, { k: '담임(남의 반)', email: HR2, role: null },
  { k: '관리자', email: AD, role: 'admin' }, { k: 'owner(관리자+학사 교사)', email: OWNER, role: 'admin' },
  { k: '출결 담당', email: ATT, role: null }, { k: '근무표 담당', email: DUTY, role: null }
];
// 기록 종류 → [공개 함수, 권한 키, 그 함수를 부를 수 있는 역할]
const READS = {
  career: { fn: 'getCareerStudent', key: 'career.view', roles: ['student', 'parent', 'assigned', 'homeroom', 'admin'] },
  request: { fn: 'getCounselRequestsOfStudent', key: 'counsel.request.view', roles: ['student', 'assigned', 'homeroom', 'admin'] },
  notesStaff: { fn: 'getCounselNotes', key: 'counsel.view', roles: ['assigned', 'homeroom', 'admin'] },
  notesMine: { fn: 'getMyCounselNotes', key: 'counsel.note.view', roles: ['student', 'parent'] }
};

const allowed = (w, kind, role) => { const spec = w.table[kind][role]; return spec === 'ALL' ? w.table[kind].cols.slice() : Array.isArray(spec) ? spec.slice() : null; };
/** 응답 객체의 키를 열 이름으로 되돌린 집합. 대응표에 없는 키는 '?키'로 남겨 비교에서 드러나게 한다 */
const colsOf = (obj, map) => [...new Set(Object.keys(obj || {}).map((k) => map[k] || '?' + k))].sort();
const expectCols = (allow, map) => [...new Set(Object.values(map))].filter((c) => allow.includes(c)).sort();

test('T12 표: 보는 사람 12명 × 진로 프로필·피드백·상담 신청·상담일지 — 응답 칸 = S6_TABLE 허용 칸 ∩ 그 함수가 내보내는 칸, 못 보는 사람은 첫 줄 거부(denied)', () => {
  const w = world(), sid = w.A.id, bad = [];
  const same = (who, what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(who + ' ' + what + ': 응답 ' + JSON.stringify(got) + ' / 표 ' + JSON.stringify(want)); };
  for (const v of VIEWERS) {
    for (const [name, r] of Object.entries(READS)) {
      if (!v.role || !r.roles.includes(v.role)) {
        try { w.env.expectDenied(v.email, r.key, r.fn, sid); } catch (e) { bad.push(v.k + ' ' + r.fn + ' 거부 기대: ' + e.message.slice(0, 160)); }
        continue;
      }
      const res = w.call(v.email, r.fn, sid);
      if (name === 'career') {
        if (v.role === 'parent') {
          same(v.k, '진로 프로필(가장 최근 공개분)', colsOf(res.current, PROFILE_MAP), ['hopes', 'submitted_at']);
          same(v.k, '응답 머리 칸', ['versions', 'feedback', 'total'].filter((k) => k in res), []);
        } else {
          same(v.k, '진로 프로필', colsOf(res.current, PROFILE_MAP), expectCols(allowed(w, 'profile', v.role), PROFILE_MAP));
          const fb = (res.feedback || []).find((f) => f.id === w.feedback.id);
          const fbAllow = allowed(w, 'feedback', v.role);
          if (!fb) bad.push(v.k + ' 피드백이 응답에 없음');
          else same(v.k, '피드백', colsOf(fb, FB_MAP(v.role)), expectCols(fbAllow, FB_MAP(v.role)));
        }
      }
      if (name === 'request') {
        const rq = res.requests.find((x) => x.id === w.request.id);
        if (!rq) bad.push(v.k + ' 신청이 응답에 없음');
        else same(v.k, '상담 신청', colsOf(rq, REQ_MAP), expectCols(allowed(w, 'request', v.role), REQ_MAP));
      }
      if (name === 'notesStaff') {
        const n = res.notes.find((x) => x.id === w.note.id);
        if (!n) bad.push(v.k + ' 상담일지가 응답에 없음');
        else same(v.k, '상담일지(교사)', colsOf(n, NOTE_STAFF_MAP), expectCols(allowed(w, 'note', v.role), NOTE_STAFF_MAP));
      }
      if (name === 'notesMine') {
        const n = res.notes.find((x) => x.id === w.note.id);
        const want = v.role === 'parent' ? ['agreement', 'date', 'id', 'teacher_name'] : expectCols(allowed(w, 'note', 'student'), NOTE_MINE_MAP);
        if (!n) bad.push(v.k + ' 상담일지가 응답에 없음');
        else same(v.k, '상담일지(학생·학부모)', colsOf(n, NOTE_MINE_MAP), want);
      }
    }
  }
  // 학부모 포털 상담 칸(getPortalStudent.counsel)
  const pc = w.call(PA, 'getPortalStudent', sid).counsel.find((n) => n.date === TODAY && n.agreement);
  if (!pc) bad.push('학부모 포털에 상담(합의 사항 공개)이 없음');
  else same('학부모', '포털 상담', colsOf(pc, PORTAL_NOTE_MAP), ['agreement', 'date', 'teacher_name']);
  assert.deepStrictEqual(bad, []);
});

test('T12 누출 감시: 보는 사람의 응답 JSON 전체에 못 보는 칸의 표시 글이 없다 — 학부모(내용·유형·대상·교사 이메일·피드백·버전·비공개 항목), 학생(내용·유형·대상·교사 이메일), 담임(신청 메모)', () => {
  const w = world(), sid = w.A.id, leaks = [];
  const forbidden = (role) => {
    const out = [];
    for (const [key, mark] of Object.entries(M)) {
      const [kind, col] = key.split('.');
      let ok;
      if (role === 'parent') ok = (kind === 'profile' && col === 'hopes') || (kind === 'note' && col === 'agreement');   // 공개한 것만
      else { const a = allowed(w, kind, role); ok = !!a && a.includes(col); }
      if (!ok) out.push(mark);
    }
    return out;
  };
  for (const v of VIEWERS.filter((x) => x.role)) {
    const texts = [];
    for (const r of Object.values(READS)) if (r.roles.includes(v.role)) texts.push(textOf(w.call(v.email, r.fn, sid)));
    if (v.role === 'parent' || v.role === 'student') texts.push(textOf(w.call(v.email, 'getPortalStudent', sid)), textOf(w.call(v.email, 'getPortalHome')));
    const t = texts.join('\n');
    for (const m of forbidden(v.role)) if (t.includes(m)) leaks.push(v.k + ' → ' + m);
    if (v.role === 'parent' || v.role === 'student') {
      if (t.includes(T)) leaks.push(v.k + ' → 교사 이메일');
      if (t.includes('"type":"' + NOTE_TYPE + '"') || t.includes('"target":"' + NOTE_TARGET + '"') || /"(type|target)":/.test(t.replace(/"target_kind"/g, ''))) leaks.push(v.k + ' → 상담 유형·대상 칸');
    }
    if (v.role === 'parent' && /"versions?":/.test(t)) leaks.push(v.k + ' → 버전 번호');
    if (v.role === 'parent' && /"feedback":/.test(t)) leaks.push(v.k + ' → 피드백 칸');
  }
  // 표(S6_TABLE)가 틀려도 잡히게 결정 그대로 박아 둔 것: 담임에게 신청 메모 없음(결정 96), 학생에게 상담 내용 없음(결정 94)
  const hrReq = w.call(HR, 'getCounselRequestsOfStudent', sid).requests.find((x) => x.id === w.request.id);
  assert.ok(hrReq && !('memo' in hrReq) && !textOf(w.call(HR, 'getCounselRequestsOfStudent', sid)).includes(M['request.memo']), '담임 응답에 신청 메모 ' + JSON.stringify(hrReq));
  const stNote = w.call(A_EMAIL, 'getMyCounselNotes', sid).notes.find((x) => x.id === w.note.id);
  assert.ok(stNote && !('content' in stNote) && !('type' in stNote) && !('target' in stNote), '학생 응답에 상담 내용·유형·대상 ' + JSON.stringify(stNote));
  // 반대로 볼 수 있는 표시 글은 실제로 나온다(감시가 헛돌지 않게)
  assert.ok(textOf(w.call(PA, 'getMyCounselNotes', sid)).includes(M['note.agreement']) && textOf(w.call(PA, 'getCareerStudent', sid)).includes(M['profile.hopes']));
  assert.ok(textOf(w.call(T, 'getCounselNotes', sid)).includes(M['note.content']) && textOf(w.call(T, 'getCounselRequestsOfStudent', sid)).includes(M['request.memo']));
  assert.deepStrictEqual(leaks, []);
});

test('T12 결정 92: 학생이 공개를 끄면 다음 응답에서 바로 사라진다 — 합의 사항(학부모 상담 기록·포털), 진로 프로필 항목(공개분 없음 → none)', () => {
  const w = world(), sid = w.A.id;
  w.ok(w.call(A_EMAIL, 'setAgreementShare', w.note.id, false), '끄기');
  const mine = w.call(PA, 'getMyCounselNotes', sid), portal = w.call(PA, 'getPortalStudent', sid);
  const n = mine.notes.find((x) => x.id === w.note.id);
  assert.ok(n && !('agreement' in n), '상담 날짜·교사는 남고 합의 사항만 빠진다 ' + JSON.stringify(n));
  assert.ok(!textOf(mine).includes(M['note.agreement']) && !textOf(portal).includes(M['note.agreement']), '합의 사항이 사라짐');
  assert.ok(w.call(A_EMAIL, 'getMyCounselNotes', sid).notes.find((x) => x.id === w.note.id).agreement === M['note.agreement'], '학생 본인에게는 그대로');
  const pub = w.ok(w.call(A_EMAIL, 'setCareerPublish', w.profile.id, { hopes: false }), '프로필 공개 끄기');
  assert.ok(/되돌릴 수 없/.test(pub.notice || ''), '끌 때 안내(결정 92) ' + JSON.stringify(pub));
  const pc = w.call(PA, 'getCareerStudent', sid);
  assert.strictEqual(pc.none, true, JSON.stringify(pc).slice(0, 200));
  assert.ok(!textOf(pc).includes(M['profile.hopes']));
  assert.ok(w.env.rows('audit_log').some((a) => a.action === 'update' && /counsel_notes|career_profiles/.test(a.sheet)), '켜고 끈 것은 audit_log에 남는다');
});

/** 학생을 오늘부터 학사 퇴실시킨다(화면과 같은 previewMove → saveMove, 하루 전에 신청) */
function leave(w) {
  const sid = w.A.id;
  const dorm = w.env.as(OWNER, (c) => c.statusOn_(c.readAll_('status_changes'), sid, '기숙사', TODAY)) === '입실';
  const mv = { studentId: sid, type: dorm ? '학사 및 기숙사 퇴실' : '학사 퇴실', requestedAt: '2027-04-19T10:00:00', effectiveDate: TODAY, dinner: '중단', docSubmitted: false, reason: '가짜 퇴실' };
  w.env.setNow('2027-04-19T10:00:00');
  const pv = w.call(T, 'previewMove', mv);
  w.ok(pv, '퇴실 미리 보기');
  w.ok(w.call(T, 'saveMove', mv, pv.expect), '퇴실 저장');
  w.env.setNow(TODAY + 'T12:00:00');
  assert.strictEqual(w.env.as(OWNER, (c) => c.statusOn_(c.readAll_('status_changes'), sid, '학사', TODAY)), '퇴실');
}

test('T12 결정 97: 퇴실한 학생 — 본인·학부모·담당교사는 기록을 계속 보고, 6단계 쓰기 함수(s6CanWrite_를 거치는 것)는 모두 "학사생이 아닌 학생" 문구로 거부되며 아무것도 쓰지 않는다', () => {
  const w = world(), sid = w.A.id;
  leave(w);
  for (const [who, fn] of [[T, 'getCareerStudent'], [A_EMAIL, 'getCareerStudent'], [PA, 'getCareerStudent'], [T, 'getCounselNotes'], [A_EMAIL, 'getMyCounselNotes'], [PA, 'getMyCounselNotes'],
    [T, 'getCounselRequestsOfStudent'], [A_EMAIL, 'getCounselRequestsOfStudent'], [HR, 'getCareerStudent'], [AD, 'getCounselNotes']]) {
    w.env.expectAllowed(who, fn, sid);
  }
  assert.strictEqual(w.call(A_EMAIL, 'getCareerStudent', sid).canWrite, false, '쓰기 버튼도 꺼진다');
  assert.strictEqual(w.call(A_EMAIL, 'getMyCounselNotes', sid).canShare, false);
  assert.strictEqual(w.call(A_EMAIL, 'getCounselRequestsOfStudent', sid).canRequest, false);
  const snap = () => JSON.stringify(['career_profiles', 'feedback'].map((t) => w.env.rows(t)).concat(['counsel_requests', 'counsel_notes'].map((t) => w.env.rows(t, 'counsel'))));
  const before = snap();
  const writes = [
    [A_EMAIL, 'submitCareerProfile', { hopes: [{ rank: 1, field: '가짜', job: '가짜' }], targets: [], interests: '', strengths: '', concerns: '' }],
    [A_EMAIL, 'setCareerPublish', w.profile.id, { targets: true }],
    [T, 'addCareerFeedback', sid, w.profile.id, '가짜 피드백 둘째'],
    [A_EMAIL, 'submitCounselRequest', { dates: ['2027-04-26'], topic: '학습', memo: '' }],
    [T, 'decideCounselRequest', { studentId: sid, requestId: w.request.id, action: 'confirm', date: '2027-04-22' }],
    [A_EMAIL, 'setAgreementShare', w.note.id, false]
  ];
  const got = writes.map(([who, fn, ...a]) => { const r = w.call(who, fn, ...a); return fn + ' ' + (r.ok === false && /학사생이 아닌 학생/.test(JSON.stringify(r.errors)) ? '거부' : JSON.stringify(r).slice(0, 120)); });
  assert.deepStrictEqual(got, writes.map(([, fn]) => fn + ' 거부'));
  assert.strictEqual(snap(), before, '거부된 쓰기는 시트를 바꾸지 않는다');
  // 아직 넣지 않은 줄(찾은 문제, 총괄에게 보고): 퇴실 뒤에도 cancelCareerFeedback·cancelCounselRequest·saveCounselNote·reviseCounselNote·cancelCounselNote는 통과한다(s6CanWrite_ active를 보지 않음)
});

test('T12 쓰기 함수: 첫 줄 거부는 denied로 남고(남의 기록은 락 안에서 거부 + denied), 저장은 audit_log에 남되 글 칸은 "(내용 생략, N자)"뿐, 삭제 없이 취소 + 사유로 남는다', () => {
  const w = world(), sid = w.A.id;
  // 첫 줄 거부(역할·범위)
  const denials = [
    [T, 'career.submit', 'submitCareerProfile', {}], [PA, 'career.publish', 'setCareerPublish', w.profile.id, {}], [T_OTHER, 'feedback.write', 'addCareerFeedback', sid, w.profile.id, '가짜'],
    [A_EMAIL, 'feedback.cancel', 'cancelCareerFeedback', w.feedback.id, '가짜 사유'], [PA, 'counsel.request.create', 'submitCounselRequest', {}], [T, 'counsel.request.cancel', 'cancelCounselRequest', w.request.id, ''],
    [T_OTHER, 'counsel.request.decide', 'decideCounselRequest', { studentId: sid, requestId: w.request.id, action: 'confirm', date: '2027-04-22' }],
    [HR, 'counsel.save', 'saveCounselNote', { studentId: sid }], [HR, 'counsel.cancel', 'cancelCounselNote', w.note.id, '가짜 사유'], [AD, 'counsel.cancel', 'reviseCounselNote', w.note.id, {}, '가짜 사유'],
    [PA, 'counsel.agreement.publish', 'setAgreementShare', w.note.id, true], [T, 'curriculum.edit', 'previewCurriculum', 'courses', ''], [T, 'curriculum.edit', 'saveCurriculum', 'courses', '', ''],
    // 역할은 맞지만 남의 기록(락 안에서 거부 + denied)
    [B_EMAIL, 'counsel.request.cancel', 'cancelCounselRequest', w.request.id, ''], [B_EMAIL, 'counsel.agreement.publish', 'setAgreementShare', w.note.id, false],
    [T_OTHER, 'feedback.write', 'cancelCareerFeedback', w.feedback.id, '가짜 사유']
  ];
  const bad = [];
  for (const [who, key, fn, ...a] of denials) { try { w.env.expectDenied(who, key, fn, ...a); } catch (e) { bad.push(who + ' ' + fn + ': ' + e.message.slice(0, 160)); } }
  assert.deepStrictEqual(bad, []);
  // 저장은 audit_log에 남고 글 칸은 글자 수만
  const TEXT = { career_profiles: ['hopes', 'targets', 'interests', 'strengths', 'concerns'], feedback: ['content'], 'counsel/counsel_requests': ['memo'], 'counsel/counsel_notes': ['content', 'agreement'] };
  const audit = w.env.rows('audit_log');
  for (const [sheet, cols] of Object.entries(TEXT)) {
    const rows = audit.filter((r) => r.sheet === sheet);
    assert.ok(rows.some((r) => r.action === 'create'), sheet + ' create 기록');
    for (const r of rows) for (const side of ['before', 'after']) {
      const o = r[side] ? JSON.parse(r[side]) : {};
      for (const c of cols) if (o[c]) assert.ok(/^\(내용 생략, \d+자\)$/.test(o[c]), sheet + ' ' + side + '.' + c + ' = ' + String(o[c]).slice(0, 40));
    }
  }
  assert.deepStrictEqual(Object.values(M).filter((m) => textOf(audit).includes(m)), [], 'audit_log 어디에도 표시 글이 없다');
  // 취소는 지우지 않고 status 취소 + 사유
  const counts = () => [w.env.rows('feedback').length, w.env.rows('counsel_requests', 'counsel').length, w.env.rows('counsel_notes', 'counsel').length];
  const n0 = counts();
  w.ok(w.call(T, 'cancelCareerFeedback', w.feedback.id, '가짜 피드백 취소'), '피드백 취소');
  w.ok(w.call(A_EMAIL, 'cancelCounselRequest', w.request.id, '가짜 신청 취소'), '신청 취소');
  w.ok(w.call(T, 'reviseCounselNote', w.note.id, { date: TODAY, type: '생활', target: '학생', content: '가짜 고친 상담' }, '가짜 고침 사유'), '상담 고치기');
  const n1 = counts();
  assert.deepStrictEqual([n1[0], n1[1], n1[2]], [n0[0], n0[1], n0[2] + 1], '행은 줄지 않는다(고치기는 새 행 + 옛 행 취소)');
  const st = (rows, id) => { const r = rows.find((x) => x.id === id); return [r.status, !!String(r.cancel_reason).trim()]; };
  assert.deepStrictEqual([st(w.env.rows('feedback'), w.feedback.id), st(w.env.rows('counsel_requests', 'counsel'), w.request.id), st(w.env.rows('counsel_notes', 'counsel'), w.note.id)],
    [['취소', true], ['취소', true], ['취소', true]]);
  assert.ok(!w.env.rows('audit_log').some((r) => /delete/i.test(r.action)), 'audit_log에 delete 없음');
});
