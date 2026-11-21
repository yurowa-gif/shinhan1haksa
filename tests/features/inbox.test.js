/** C46 확인함(getInbox): 역할별로 처리할 수 있는 것만, 오래 기다린 순, 유출 감시. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com',
  DUTY = 'test.duty@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03', MARK = 'ZZ-면담-표식', SECRET = '비밀 사유 010-1234-5678';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const left = (s) => env.rows('status_changes').some((c) => c.student_id === s.id && c.item === '학사' && c.effective_date > TODAY);
  const students = env.rows('students').filter((s) => !left(s) && enr.some((e) => e.student_id === s.id));
  const mine = students.filter((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  const notMine = students.find((s) => !mine.includes(s));
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const tab = 'violations_' + term.id.slice(0, 8);
  const addOut = (sid, at) => env.asOwner((c) => c.appendRecord_(tab, { term_id: term.id, student_id: sid, occurred_at: at, rule_id: rule.id, rule_name: rule.name, memo: '',
    detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  const fixed = (sid, month, status) => env.asOwner((c) => c.appendRecord_('fixed_schedules', { student_id: sid, month: month, weekday: '월', blocks: 'ALL', code: '학', status: status,
    submitted_at: '2027-02-20T10:00:00', parent_agreed_at: '2027-02-21T09:00:00', teacher_confirmed_at: '' }, ADMIN));
  return { env, term, mine, notMine, addOut, fixed };
}
const inbox = (x, who) => plain(x.env.call(who, 'getInbox'));
const kinds = (r) => [...new Set(r.items.map((i) => i.kind))].sort();
const label = (s) => s.grade + '. ' + s.name;

test('getInbox 권한: 출결 담당·학사 교사·관리자만 열 수 있고, 담임·근무표 담당·학생·학부모는 거부', () => {
  const x = makeEnv();
  [ADMIN, ATT, T1].forEach((who) => assert.strictEqual(x.env.expectAllowed(who, 'getInbox').ok, true));
  [HOMEROOM, DUTY, STUDENT, PARENT].forEach((who) => x.env.expectDenied(who, 'inbox.view', 'getInbox'));
});

test('특이사항 요청: 출결 담당·관리자에게만 보이고(학사 교사는 처리 권한이 없다), 줄에 사유·이메일이 없다', () => {
  const x = makeEnv(), s = x.mine[0];
  const req = plain(x.env.call(T1, 'saveException', { studentId: s.id, from: '2027-03-12', to: '2027-03-13', blocks: 'ALL', type: '병결', reason: SECRET }));
  assert.ok(req.ok && req.status === '요청');
  for (const who of [ATT, ADMIN]) {
    const r = inbox(x, who), it = r.items.find((i) => i.kind === 'exception' && i.id === req.groupId);
    assert.ok(it, who + '에게 보인다');
    assert.strictEqual(it.studentLabel, label(s));
    assert.strictEqual(it.summary, '병결 · 3월 12일(금) ~ 3월 13일(토) · 전체');
    assert.strictEqual(it.requestedAt, TODAY + 'T20:00:00');
    assert.deepStrictEqual(it.link, { page: 'exceptions', params: { tab: 'requests' } });
  }
  assert.ok(!inbox(x, T1).items.some((i) => i.kind === 'exception'), '학사 교사에게는 없다');
  const all = JSON.stringify([ATT, ADMIN, T1].map((w) => inbox(x, w)));
  assert.ok(!/비밀 사유|010-1234|@/.test(all), '사유·번호·이메일 없음');
});

test('시간표 확인(학부모 동의함): 담당 교사와 관리자만, 담당이 아닌 학생은 안 보인다. 출결 담당은 처리 권한이 없다', () => {
  const x = makeEnv(), a = x.mine[0], b = x.notMine;
  x.fixed(a.id, '2027-03', '동의'); x.fixed(b.id, '2027-03', '동의');
  x.fixed(a.id, '2027-04', '확정');   // 이미 확정한 달은 대기가 아니다
  const t = inbox(x, T1).items.filter((i) => i.kind === 'timetable');
  assert.deepStrictEqual(t.map((i) => [i.studentLabel, i.month, i.summary]), [[label(a), '2027-03', '3월 시간표 확인(학부모가 동의했습니다)']]);
  assert.strictEqual(t[0].requestedAt, '2027-02-21T09:00:00');
  assert.strictEqual(t[0].link.page, 'timetable'); assert.strictEqual(t[0].link.params.month, '2027-03');
  const adminT = inbox(x, ADMIN).items.filter((i) => i.kind === 'timetable').map((i) => i.studentLabel).sort();
  assert.deepStrictEqual(adminT, [label(a), label(b)].sort());
  assert.ok(!kinds(inbox(x, ATT)).includes('timetable'));
});

test('서류 미제출: 담당 교사는 자기 학생 것만, 관리자는 전체 — 신청서 목록(foodMissingDocs_)과 같은 줄이다', () => {
  const x = makeEnv();
  const addDoc = (sid, at) => x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: sid, item: '조식', value: '미실시', effective_date: '2027-03-09', effective_date_auto: '2027-03-09',
    requested_at: at, reason: '', doc_submitted: 'FALSE', source: 'F7', linked_change_id: '', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  addDoc(x.mine[0].id, '2027-03-02T09:00:00'); addDoc(x.mine[1].id, '2027-03-02T10:00:00'); addDoc(x.notMine.id, '2027-03-02T11:00:00');
  const miss = plain(x.env.as(ADMIN, (c) => c.foodMissingDocs_(c.readAll_('status_changes'), c.readAll_('enrollments'), c.readAll_('terms'))));
  assert.ok(miss.length >= 2, '가짜 데이터에 미제출 신청이 여럿 있다');
  const ids = (who) => inbox(x, who).items.filter((i) => i.kind === 'doc').map((i) => i.id).sort();
  assert.deepStrictEqual(ids(ADMIN), miss.map((m) => m.row.id).sort());
  assert.deepStrictEqual(ids(T1), miss.filter((m) => m.teacher === T1).map((m) => m.row.id).sort());
  assert.ok(ids(T1).length < ids(ADMIN).length);
  assert.ok(!kinds(inbox(x, ATT)).includes('doc'), '출결 담당은 서류 표시 권한이 없다');
  const it = inbox(x, ADMIN).items.find((i) => i.kind === 'doc');
  assert.ok(/서류 미제출$/.test(it.summary) && it.link.page === 'moves' && it.link.params.tab === 'history' && it.link.params.student);
});

test('2OUT: 면담 기록 필요는 담당 교사에게, 퇴실 확정 대기는 관리자에게만(면담을 기록하면 옮겨 간다), 면담 내용은 없다', () => {
  const x = makeEnv(), s = x.mine[0];
  x.addOut(s.id, '2027-03-02T20:00:00'); x.addOut(s.id, '2027-03-03T19:00:00');
  const t1 = inbox(x, T1).items.filter((i) => i.kind.startsWith('out2'));
  assert.deepStrictEqual(t1.map((i) => [i.kind, i.studentLabel]), [['out2_meeting', label(s)]]);
  assert.deepStrictEqual(t1[0].link, { page: 'outs', params: { tab: 'dismiss' } });
  assert.deepStrictEqual(inbox(x, ADMIN).items.filter((i) => i.kind.startsWith('out2')), [], '관리자는 면담 전에는 확정할 수 없다');
  assert.deepStrictEqual(inbox(x, ATT).items.filter((i) => i.kind.startsWith('out2')), []);
  assert.strictEqual(plain(x.env.call(T1, 'saveOutMeeting', { studentId: s.id, date: TODAY, content: MARK + ' 통화' })).ok, true);
  assert.deepStrictEqual(inbox(x, T1).items.filter((i) => i.kind.startsWith('out2')), [], '면담을 마치면 담당 교사 줄이 사라진다');
  const a = inbox(x, ADMIN).items.filter((i) => i.kind.startsWith('out2'));
  assert.deepStrictEqual(a.map((i) => [i.kind, i.studentLabel]), [['out2_dismiss', label(s)]]);
  assert.ok(!JSON.stringify([inbox(x, ADMIN), inbox(x, T1)]).includes(MARK), '면담 내용은 어디에도 없다');
});

test('줄 정렬·개수·링크: 오래 기다린 순(시각 없는 줄은 맨 뒤), counts=종류별 합, total=items, 링크는 허용된 화면·주소 값만', () => {
  const x = makeEnv(), s = x.mine[0];
  plain(x.env.call(T1, 'saveException', { studentId: s.id, from: '2027-03-12', blocks: 'ALL', type: '병결' }));
  x.fixed(s.id, '2027-03', '동의');
  const r = inbox(x, ADMIN);
  assert.ok(r.items.length >= 3 && r.total === r.items.length && r.more === 0);
  const at = r.items.map((i) => i.requestedAt).filter(Boolean);
  assert.deepStrictEqual(at, [...at].sort(), '오래된 순');
  const tally = {}; r.items.forEach((i) => { tally[i.kind] = (tally[i.kind] || 0) + 1; });
  assert.deepStrictEqual(r.counts, tally);
  assert.ok(Object.keys(r.counts).every((k) => r.labels[k]));
  const screens = Object.keys(plain(x.env.as(ADMIN, (c) => c.SCREENS)));
  r.items.forEach((i) => {
    assert.ok(screens.includes(i.link.page), i.link.page);
    assert.ok(Object.keys(i.link.params).every((k) => ['tab', 'month', 'role', 'student', 'date'].includes(k)), JSON.stringify(i.link));
    assert.ok(!Object.keys(i).some((k) => /email|phone|memo|content|reason/i.test(k)), '내부 칸 없음: ' + Object.keys(i));
  });
  assert.ok(!/@/.test(JSON.stringify(r.items)));
});

/* ───── C48 홈 숫자(getHomeData): 관리자 exc·moves·timetable, 출결 담당 moves ───── */

const home = (x, who, role) => plain(x.env.call(who, 'getHomeData', role));
const tempLeave = (x, sid) => x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: sid, item: '학사', value: '퇴실', effective_date: '2027-03-02', effective_date_auto: '2027-03-02',
  requested_at: '2027-03-02T10:00:00', reason: '임시 퇴실', memo: '[임시] return:2027-03-02', source: 'F6', status: '유효', doc_submitted: 'FALSE', linked_change_id: '', cancel_reason: '' }, ADMIN));

test('홈 숫자: 관리자 홈 exc는 출결 담당 홈과 같은 계산, timetable.confirmPending은 확인함 시간표 줄 수와 같다(숫자만)', () => {
  const x = makeEnv(), s = x.mine[0];
  plain(x.env.call(T1, 'saveException', { studentId: s.id, from: '2027-03-12', blocks: 'ALL', type: '병결', reason: SECRET }));
  x.fixed(s.id, '2027-03', '동의'); x.fixed(x.notMine.id, '2027-03', '동의');
  const a = home(x, ADMIN, 'admin'), t = home(x, ATT, 'attendance');
  assert.deepStrictEqual(a.exc, t.exc, '관리자·출결 담당 홈의 exc는 같은 함수');
  assert.strictEqual(a.exc.pending, inbox(x, ADMIN).counts.exception);
  assert.strictEqual(a.timetable.confirmPending, 2);
  assert.strictEqual(a.timetable.confirmPending, inbox(x, ADMIN).counts.timetable);
  assert.deepStrictEqual(Object.keys(a.timetable), ['confirmPending']);
  assert.ok(!('timetable' in t), '출결 담당은 시간표를 확인할 권한도 화면도 없어 숫자를 주지 않는다');
  assert.ok(!/비밀 사유|010-1234|@/.test(JSON.stringify([a.moves, a.timetable])), '숫자만');
});

test('홈 숫자: 복귀 예정일 지난 임시 퇴실 수(moves.overdue)는 관리자·출결 담당 홈에만, 관리자 홈 food.tempLeave.n과 같다', () => {
  const x = makeEnv();
  assert.strictEqual(home(x, ADMIN, 'admin').moves.overdue, 0);
  tempLeave(x, x.mine[0].id); tempLeave(x, x.notMine.id);
  const a = home(x, ADMIN, 'admin'), t = home(x, ATT, 'attendance');
  assert.deepStrictEqual([a.moves, t.moves], [{ overdue: 2 }, { overdue: 2 }]);
  assert.strictEqual(a.food.tempLeave.n, a.moves.overdue, '숫자 출처가 같다');
  assert.deepStrictEqual(Object.keys(a.moves), ['overdue']);
});

test('홈 숫자: 다른 역할 홈(학사 교사·담임·근무표 담당·학생·학부모)에는 moves·timetable.confirmPending이 없다(학사 교사 홈의 옛 timetable 카드는 그대로)', () => {
  const x = makeEnv();
  tempLeave(x, x.mine[0].id); x.fixed(x.mine[0].id, '2027-03', '동의');
  [[T1, 'hall_teacher'], [HOMEROOM, 'homeroom'], [DUTY, 'duty_manager'], [STUDENT, 'student'], [PARENT, 'parent']].forEach(([who, role]) => {
    const h = home(x, who, role);
    assert.ok(!('moves' in h) && !(h.timetable && 'confirmPending' in h.timetable), role);
  });
});
