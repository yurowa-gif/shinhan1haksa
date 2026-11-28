/** C49-B F17 상담일지 확장(합의 사항·참고 버전·신청 연결) + 학생·학부모 보기(내 상담 기록·합의 사항 공개): R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');

const ADMIN = 'test.admin@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com';
const TODAY = '2027-03-10', MARK = 'ZZ-내용-표식', AGR = 'ZZ-합의-표식';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const me = students.find((s) => s.email === STUDENT);
  const enr = (sid) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === sid);
  const teacher = enr(me.id).teacher_email;
  const stranger = students.find((s) => s.id !== me.id && enr(s.id) && enr(s.id).teacher_email === teacher) || students.find((s) => s.id !== me.id && enr(s.id));
  const notes = () => env.rows('counsel_notes', 'counsel');
  const reqs = () => env.rows('counsel_requests', 'counsel');
  const addProfile = (v, status) => env.asOwner((c) => c.appendRecord_('career_profiles', { term_id: term.id, student_id: me.id, version: v, hopes: '[]', targets: '[]', interests: '', strengths: '', concerns: '',
    parent_fields: '', submitted_at: '2027-03-0' + v + 'T10:00:00', status: status || '유효', cancel_reason: '' }, ADMIN));
  return { env, term, me, teacher, stranger, notes, reqs, addProfile };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const input = (x, o) => Object.assign({ studentId: x.me.id, date: TODAY, type: '생활', target: '학생', content: MARK + ' 이야기', agreement: AGR + ' 다음 주까지 읽기' }, o || {});
const save = (x, o, who) => call(x, who || x.teacher, 'saveCounselNote', input(x, o));
const request = (x) => {
  const r = call(x, STUDENT, 'submitCounselRequest', { dates: ['2027-03-12', '2027-03-15'], topic: '진로', memo: '가짜 메모' });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const d = call(x, x.teacher, 'decideCounselRequest', { studentId: x.me.id, requestId: r.id, action: 'confirm', date: '2027-03-12' });
  assert.strictEqual(d.ok, true, JSON.stringify(d));
  return r.id;
};

test('상담일지 합의 사항: 저장되고, 교사가 학부모 공개를 TRUE로 보내도 FALSE로 둔다(학생이 켠다, 결정 90), 1000자 초과·없는 참고 버전은 거부', () => {
  const x = makeEnv();
  const r = save(x, { agreementToParent: true, showToParent: true });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const n = x.notes()[0];
  assert.deepStrictEqual([n.agreement.includes(AGR), n.agreement_to_parent, n.profile_version, n.request_id, n.show_to_parent], [true, 'FALSE', '', '', 'TRUE']);
  const long = save(x, { content: MARK + ' 둘째', agreement: 'ㅁ'.repeat(1001) });
  assert.strictEqual(long.ok, false);
  assert.strictEqual(long.errors[0].field, 'agreement');
  const noVer = save(x, { content: MARK + ' 셋째', profileVersion: 3 });
  assert.strictEqual(noVer.ok, false);
  assert.strictEqual(noVer.errors[0].field, 'profileVersion');
  assert.strictEqual(x.notes().length, 1, '거부된 저장은 행이 없다');
  // 감사: 합의 사항 글은 글자 수만
  assert.ok(!x.env.rows('audit_log').some((l) => JSON.stringify(l).includes(AGR)), 'audit에 합의 사항 글 없음');
});

test('참고한 진로 프로필 버전: 그 학생의 살아 있는 버전만(취소된 버전·남의 버전 거부), 진로·진학 상담인데 비면 경고만(저장은 됨)', () => {
  const x = makeEnv();
  x.addProfile(1); x.addProfile(2, '취소');
  assert.strictEqual(save(x, { type: '진로', content: MARK + ' a', profileVersion: 1 }).ok, true);
  assert.strictEqual(x.notes()[0].profile_version, '1');
  assert.strictEqual(save(x, { type: '진로', content: MARK + ' b', profileVersion: 2 }).ok, false, '취소된 버전');
  const warn = save(x, { type: '진학', content: MARK + ' c' });
  assert.strictEqual(warn.ok, true);
  assert.ok(warn.warnings.some((w) => w.includes('진로 프로필')), JSON.stringify(warn));
  const none = save(x, { type: '생활', content: MARK + ' d' });
  assert.deepStrictEqual(none.warnings, [], '진로·진학이 아니면 경고 없음');
});

test('신청 연결: 확정된 그 학생의 신청만 이을 수 있고, 저장하면 같은 락 안에서 신청이 완료 + 일지와 서로 연결된다. 다른 신청·이미 완료·남의 신청은 거부', () => {
  const x = makeEnv();
  const rid = request(x);
  const open = save(x, { content: MARK + ' x', requestId: '없는-신청' });
  assert.strictEqual(open.ok, false);
  assert.strictEqual(open.errors[0].field, 'requestId');
  const r = save(x, { content: MARK + ' 신청에서 넘어옴', type: '진로', requestId: rid });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.completedRequest, true);
  const rq = x.reqs().find((q) => q.id === rid), note = x.notes().find((q) => q.id === r.id);
  assert.deepStrictEqual([rq.status, rq.linked_note_id, note.request_id], ['완료', r.id, rid]);
  // 두 번 누르기: 같은 내용이면 중복으로 처리(신청은 그대로 완료)
  const dup = save(x, { content: MARK + ' 신청에서 넘어옴', type: '진로', requestId: rid });
  assert.deepStrictEqual([dup.ok, dup.duplicate, dup.id], [true, true, r.id]);
  assert.strictEqual(x.notes().length, 1);
  // 이미 완료된 신청은 다른 일지에 못 잇는다
  const again = save(x, { content: MARK + ' 또', requestId: rid });
  assert.strictEqual(again.ok, false);
  assert.ok(again.errors[0].message.includes('확정'), JSON.stringify(again));
  // 아직 날짜를 안 정한(신청) 상태·남의 학생 신청도 못 잇는다
  const r2 = call(x, STUDENT, 'submitCounselRequest', { dates: ['2027-03-16'], topic: '생활', memo: '' });
  assert.strictEqual(save(x, { content: MARK + ' y', requestId: r2.id }).ok, false, '신청 상태는 못 잇는다');
  x.env.asOwner((c) => c.appendRecord_('counsel_requests', { term_id: x.term.id, student_id: x.stranger.id, requester_email: 'x@example.com', wish_dates: '2027-03-12', topic: '생활', memo: '', status: '확정', decided_date: '2027-03-12', linked_note_id: '', cancel_reason: '' }, ADMIN, 'counsel'));
  const other = x.reqs().find((q) => q.student_id === x.stranger.id);
  assert.strictEqual(save(x, { content: MARK + ' z', requestId: other.id }).ok, false, '남의 학생 신청');
  assert.strictEqual(x.reqs().find((q) => q.id === other.id).status, '확정');
});

test('앞 저장이 신청 완료 직전에 끊긴 경우: 같은 내용을 다시 저장하면 중복으로 보고 신청 완료까지 마무리한다', () => {
  const x = makeEnv();
  const rid = request(x);
  x.env.asOwner((c) => c.appendRecord_('counsel_notes', { student_id: x.me.id, date: TODAY, teacher_email: x.teacher, type: '진로', target: '학생', linked_violation_id: '', content: MARK + ' 끊김',
    agreement: '', agreement_to_parent: 'FALSE', profile_version: '', request_id: rid, show_to_parent: 'TRUE', status: '유효', cancel_reason: '' }, x.teacher, 'counsel'));
  assert.strictEqual(x.reqs().find((q) => q.id === rid).status, '확정');
  const r = save(x, { content: MARK + ' 끊김', type: '진로', agreement: '', requestId: rid });
  assert.deepStrictEqual([r.ok, r.duplicate], [true, true]);
  const rq = x.reqs().find((q) => q.id === rid);
  assert.deepStrictEqual([rq.status, rq.linked_note_id], ['완료', x.notes()[0].id]);
});

test('고치기: 합의 사항을 새 행에 쓰고, 신청 연결은 옛 행 것을 잇고(신청의 linked_note_id도 새 행으로), 학부모 공개는 학생이 다시 켠다', () => {
  const x = makeEnv();
  const rid = request(x);
  const r = save(x, { content: MARK + ' 처음', type: '진로', requestId: rid });
  call(x, STUDENT, 'setAgreementShare', r.id, true);
  assert.strictEqual(x.notes().find((n) => n.id === r.id).agreement_to_parent, 'TRUE');
  const rev = call(x, x.teacher, 'reviseCounselNote', r.id, input(x, { content: MARK + ' 고침', type: '진로', agreement: AGR + ' 고친 합의' }), '잘못 적었습니다');
  assert.strictEqual(rev.ok, true, JSON.stringify(rev));
  const old = x.notes().find((n) => n.id === r.id), neu = x.notes().find((n) => n.id === rev.id);
  assert.strictEqual(old.status, '취소');
  assert.deepStrictEqual([neu.request_id, neu.agreement_to_parent, neu.agreement.includes('고친 합의')], [rid, 'FALSE', true]);
  assert.strictEqual(x.reqs().find((q) => q.id === rid).linked_note_id, rev.id, '신청은 새 일지와 이어진다');
});

test('교사 상담 기록 응답: 합의 사항·공개 표시·참고 버전·신청 연결이 더해지고, 쓰는 담당교사에게만 프로필 버전 목록과 확정된 신청이 간다(담임·관리자에게는 비어 있음)', () => {
  const x = makeEnv();
  x.addProfile(1);
  const rid = request(x);
  save(x, { content: MARK + ' 일반', agreement: '' });
  x.env.asOwner((c) => { const u = c.readAll_('users').find((q) => q.email === HOMEROOM); c.updateRecord_('users', u.id, { homeroom_class: x.me.grade + '-' + x.me.class_no }, ADMIN); });
  const t = call(x, x.teacher, 'getCounselNotes', x.me.id);
  assert.deepStrictEqual(t.profiles.map((p) => p.version), [1]);
  assert.deepStrictEqual([t.fixedRequest.id, t.fixedRequest.topic, t.fixedRequest.decidedDate], [rid, '진로', '2027-03-12']);
  assert.ok(['agreement', 'agreementToParent', 'profileVersion', 'requestId'].every((k) => k in t.notes[0]));
  for (const who of [ADMIN, HOMEROOM]) {
    const o = call(x, who, 'getCounselNotes', x.me.id);
    assert.deepStrictEqual([o.profiles.length, o.fixedRequest], [0, null], who + ': 쓰는 사람이 아니면 비어 있다');
  }
});

test('내 상담 기록(학생): 날짜·교사 이름·합의 사항뿐 — 내용·유형·대상·이메일 없음, 취소된 상담 없음, 남의 학생은 거부', () => {
  const x = makeEnv();
  save(x, { type: '건강', content: MARK + ' 첫째', date: '2027-03-09' });
  const second = save(x, { content: MARK + ' 둘째', agreement: '', showToParent: false });
  const third = save(x, { content: MARK + ' 취소될 것', date: '2027-03-08' });
  call(x, x.teacher, 'cancelCounselNote', third.id, '잘못 적었습니다');
  const mine = call(x, STUDENT, 'getMyCounselNotes', '');
  assert.strictEqual(mine.viewer, 'student');
  assert.strictEqual(mine.notes.length, 2, '취소된 상담은 학생에게도 없다');
  mine.notes.forEach((n) => assert.deepStrictEqual(Object.keys(n).sort(), ['agreement', 'date', 'dateKo', 'id', 'teacher_name']));
  const t = textOf(mine);
  for (const bad of [MARK, '건강', '대상', 'teacher_email', '@']) assert.ok(!t.includes(bad), '학생 응답에 있으면 안 되는 글: ' + bad);
  assert.ok(mine.notes.some((n) => n.agreement.includes(AGR)));
  assert.strictEqual(call(x, STUDENT, 'getMyCounselNotes', x.me.id).notes.length, 2);
  assert.strictEqual(mine.canShare, true);
  x.env.expectDenied(STUDENT, 'counsel.note.view', 'getMyCounselNotes', x.stranger.id);
  for (const who of [ADMIN, x.teacher, HOMEROOM, ATT]) x.env.expectDenied(who, 'counsel.note.view', 'getMyCounselNotes', x.me.id);
  assert.ok(second.ok);
});

test('합의 사항 공개(결정 90·92): 학생이 켜야 학부모에게 보이고, 끄면 바로 사라진다. 학부모는 켤 수 없고, 남의 상담·합의 사항 없는 상담은 거부. 켜고 끈 것은 audit_log에 남는다', () => {
  const x = makeEnv();
  assert.ok(x.env.rows('guardian_links').some((g) => g.parent_email === PARENT && g.student_id === x.me.id), '가짜 학부모가 이 학생과 연결');
  const a = save(x, { content: MARK + ' a' });                  // 합의 사항 있음
  const b = save(x, { content: MARK + ' b', agreement: '', date: '2027-03-09' });   // 합의 사항 없음
  const parentSees = () => call(x, PARENT, 'getMyCounselNotes', x.me.id);
  assert.deepStrictEqual(parentSees().notes.map((n) => [n.id, 'agreement' in n]), [[a.id, false], [b.id, false]], '처음에는 날짜·교사만(기본 비공개)');
  assert.deepStrictEqual(Object.keys(parentSees().notes[0]).sort(), ['date', 'dateKo', 'id', 'teacher_name']);
  const a0 = x.env.rows('audit_log').length;
  assert.deepStrictEqual(call(x, STUDENT, 'setAgreementShare', a.id, true), { ok: true, on: true });
  const shown = parentSees().notes.find((n) => n.id === a.id);
  assert.ok(shown.agreement.includes(AGR), '켜면 학부모에게 합의 사항이 보인다');
  assert.ok(!textOf(parentSees()).includes(MARK) && !textOf(parentSees()).includes('@'), '학부모 응답에 상담 내용·이메일 없음');
  const log = x.env.rows('audit_log').slice(a0);
  assert.ok(log.some((l) => l.action === 'update' && /agreement_to_parent/.test(JSON.stringify(l))), '켠 것이 audit_log에 남는다');
  assert.ok(!log.some((l) => JSON.stringify(l).includes(AGR)), 'audit에 합의 사항 글 없음');
  assert.deepStrictEqual(call(x, STUDENT, 'setAgreementShare', a.id, false), { ok: true, on: false });
  assert.ok(!('agreement' in parentSees().notes.find((n) => n.id === a.id)), '끄면 바로 사라진다(흔적 없음)');
  // 거부
  x.env.expectDenied(PARENT, 'counsel.agreement.publish', 'setAgreementShare', a.id, true);
  for (const who of [ADMIN, x.teacher, HOMEROOM, ATT]) x.env.expectDenied(who, 'counsel.agreement.publish', 'setAgreementShare', a.id, true);
  const noAgr = call(x, STUDENT, 'setAgreementShare', b.id, true);
  assert.strictEqual(noAgr.ok, false);
  assert.ok(noAgr.errors[0].message.includes('합의 사항이 없는'), JSON.stringify(noAgr));
  assert.strictEqual(x.notes().find((n) => n.id === b.id).agreement_to_parent, 'FALSE');
  // 남의 상담
  const other = x.env.rows('students').find((s) => s.id !== x.me.id && s.email);
  if (other) {
    x.env.asOwner((c) => c.addUser(other.email, '가짜학생B', 'student'));
    assert.throws(() => x.env.call(other.email, 'setAgreementShare', a.id, true), /권한/);
  }
  // 취소된 상담
  call(x, x.teacher, 'cancelCounselNote', a.id, '잘못 적었습니다');
  const dead = call(x, STUDENT, 'setAgreementShare', a.id, true);
  assert.deepStrictEqual([dead.ok, dead.stale], [false, true]);
});

test('상담 날짜·교사만 보이는 줄(show_to_parent FALSE)은 합의 사항을 공개해도 학부모에게 아예 안 보인다(결정 103 ⑦). 학생이 학사에서 나간 뒤에는 공개를 바꿀 수 없다(결정 97)', () => {
  const x = makeEnv();
  const a = save(x, { showToParent: false });
  call(x, STUDENT, 'setAgreementShare', a.id, true);
  assert.deepStrictEqual(call(x, PARENT, 'getMyCounselNotes', x.me.id).notes, [], '상담 자체가 학부모에게 없다');
  const portal = call(x, PARENT, 'getPortalStudent', x.me.id);
  assert.deepStrictEqual(portal.counsel, []);
  // 포털(학부모 홈)에도 같은 규칙: 보이는 상담에 공개된 합의 사항이 실린다
  const b = save(x, { date: '2027-03-09', content: MARK + ' b' });
  call(x, STUDENT, 'setAgreementShare', b.id, true);
  const p2 = call(x, PARENT, 'getPortalStudent', x.me.id);
  assert.deepStrictEqual(p2.counsel.map((c) => [c.date, 'agreement' in c]), [['2027-03-09', true]]);
  assert.ok(p2.counsel[0].agreement.includes(AGR));
  assert.ok(!textOf(p2.counsel).includes(MARK), '포털에도 상담 내용 없음');
  x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: x.me.id, item: '학사', value: '퇴실', effective_date: TODAY, effective_date_auto: TODAY, requested_at: TODAY + 'T09:00:00',
    reason: '', doc_submitted: '', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  const r = call(x, STUDENT, 'setAgreementShare', b.id, false);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors[0].message.includes('학사생이 아닌'), JSON.stringify(r));
  assert.strictEqual(call(x, STUDENT, 'getMyCounselNotes', '').canShare, false, '퇴실한 학생은 보기만');
  assert.ok(call(x, STUDENT, 'getMyCounselNotes', '').notes.length >= 1, '지난 기록은 계속 본다');
});

test('일지를 취소해도 신청은 \'완료\'로 둔다(총괄 판단). 새 일지는 같은 신청에 다시 이을 수 있고(이어진 일지만 새 행으로), 취소된 일지가 아닌 다른 완료 신청은 못 잇는다', () => {
  const x = makeEnv();
  const rid = request(x);
  const r = save(x, { content: MARK + ' 처음', type: '진로', requestId: rid });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(call(x, x.teacher, 'cancelCounselNote', r.id, '잘못 적었습니다').ok, true);
  const rq = () => x.reqs().find((q) => q.id === rid);
  assert.deepStrictEqual([rq().status, rq().linked_note_id], ['완료', r.id], '일지를 취소해도 신청은 완료 그대로');
  // 쓰는 교사 화면: 확정이 없어도 다시 이을 수 있는 신청이 내려온다(relink)
  const t = call(x, x.teacher, 'getCounselNotes', x.me.id);
  assert.deepStrictEqual([t.fixedRequest.id, t.fixedRequest.relink], [rid, true]);
  // 다시 쓰면서 같은 신청에 잇기: 이어진 일지만 바뀌고 상태는 완료 그대로
  const again = save(x, { content: MARK + ' 다시', type: '진로', requestId: rid });
  assert.strictEqual(again.ok, true, JSON.stringify(again));
  assert.deepStrictEqual([rq().status, rq().linked_note_id], ['완료', again.id]);
  assert.strictEqual(x.notes().find((n) => n.id === again.id).request_id, rid);
  // 이제 이어진 일지가 살아 있으므로 또 이을 수 없다
  const third = save(x, { content: MARK + ' 셋', requestId: rid });
  assert.strictEqual(third.ok, false);
  assert.deepStrictEqual(call(x, x.teacher, 'getCounselNotes', x.me.id).fixedRequest, null, '살아 있는 일지에 이어진 완료 신청은 내려오지 않는다');
});
