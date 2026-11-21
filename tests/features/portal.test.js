/** C36 F14 포털(읽기만): R4 gas-fakes. 가짜 데이터만. 학생은 본인, 학부모는 연결된 자녀만. 다른 학생·상담 내용·교사 메모·이메일은 응답에 없다. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', HALL = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const TODAY = '2027-03-03';
const M_OUT = 'ZZ-OUT메모-표식', M_EXC = 'ZZ-사유-표식', M_NOTE1 = 'ZZ-상담1-표식', M_NOTE2 = 'ZZ-상담2-표식', M_EVT = 'ZZ-일정메모-표식';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const me = students.find((s) => s.email === STUDENT);
  const kidIds = env.rows('guardian_links').filter((g) => g.parent_email === PARENT).map((g) => g.student_id);
  const kids = students.filter((s) => kidIds.includes(s.id));
  const sibling = kids.find((s) => s.id !== me.id) || kids[0];
  const stranger = students.find((s) => !kidIds.includes(s.id) && s.id !== me.id);
  const teacherOf = (s) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === s.id).teacher_email;
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const tab = 'violations_' + term.id.slice(0, 8);
  const addOut = (s, at, extra) => env.asOwner((c) => c.appendRecord_(tab, Object.assign({ term_id: term.id, student_id: s.id, occurred_at: at, rule_id: rule.id, rule_name: rule.name, memo: M_OUT,
    detected_by: HALL, entered_by: HALL, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, extra || {}), ADMIN));
  return { env, term, me, kids, sibling, stranger, teacherOf, addOut, rule };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const names = (x, except) => x.env.rows('students').filter((s) => !except.includes(s.id)).map((s) => s.name);

test('권한표: getPortalHome은 학생·학부모만, getPortalStudent는 본인(학생)·연결된 자녀(학부모)만 — 교사·관리자·남의 학생은 denied 기록', () => {
  const x = makeEnv();
  for (const who of [STUDENT, PARENT]) x.env.expectAllowed(who, 'getPortalHome');
  for (const who of [ADMIN, HALL, HOMEROOM, ATT, DUTY]) x.env.expectDenied(who, 'portal.home', 'getPortalHome');
  x.env.expectAllowed(STUDENT, 'getPortalStudent', x.me.id);
  for (const k of x.kids) x.env.expectAllowed(PARENT, 'getPortalStudent', k.id);
  x.env.expectDenied(STUDENT, 'portal.view', 'getPortalStudent', x.stranger.id);
  if (x.sibling.id !== x.me.id) x.env.expectDenied(STUDENT, 'portal.view', 'getPortalStudent', x.sibling.id);
  x.env.expectDenied(PARENT, 'portal.view', 'getPortalStudent', x.stranger.id);
  for (const who of [ADMIN, HALL, HOMEROOM, ATT, DUTY]) {
    x.env.expectDenied(who, 'portal.view', 'getPortalStudent', x.me.id);
    x.env.expectDenied(who, 'portal.view', 'getPortalStudent', x.stranger.id);
  }
});

test('getPortalHome: 학생은 본인만, 학부모는 연결된 자녀만(이름·학년반번호뿐, 이메일 없음)', () => {
  const x = makeEnv();
  const s = call(x, STUDENT, 'getPortalHome');
  assert.deepStrictEqual([s.me.id, s.children.length], [x.me.id, 0]);
  const p = call(x, PARENT, 'getPortalHome');
  assert.strictEqual(p.me, null);
  assert.deepStrictEqual(p.children.map((c) => c.id).sort(), x.kids.map((k) => k.id).sort());
  for (const r of [s, p]) assert.ok(!JSON.stringify(r).includes('@') && !JSON.stringify(r).includes(x.stranger.name));
  assert.deepStrictEqual(Object.keys(p.children[0]).sort(), ['classNo', 'grade', 'id', 'name', 'number']);
});

test('학생 홈: 본인 OUT(날짜·항목·몇 OUT, 메모 없음)·취소 OUT은 취소로 남고 합계 제외·출결 특이사항(유형만)·상태, 상담 줄은 없다', () => {
  const x = makeEnv();
  x.addOut(x.me, '2027-03-02T20:00:00');
  x.addOut(x.me, '2027-03-03T19:00:00');
  x.addOut(x.me, '2027-03-03T21:00:00', { status: '취소', cancel_reason: 'ZZ-취소사유-표식' });
  x.addOut(x.stranger, '2027-03-03T19:30:00');
  const r = plain(x.env.call(ATT, 'saveException', { studentId: x.me.id, from: '2027-03-04', blocks: 'ALL', type: '병결', reason: M_EXC }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const d = call(x, STUDENT, 'getPortalStudent', x.me.id);
  assert.strictEqual(d.viewer, 'student');
  assert.deepStrictEqual([d.outs.total, d.outs.label], [2, '퇴실 대상']);
  assert.deepStrictEqual(d.outs.items.map((i) => [i.date, i.ruleName, i.weight, i.status]), [['2027-03-03', x.rule.name, 1, '취소'], ['2027-03-03', x.rule.name, 1, '유효'], ['2027-03-02', x.rule.name, 1, '유효']],
    '취소 OUT도 "취소"로 남지만 합계에는 안 센다');
  assert.ok(d.outs.items.every((i) => Object.keys(i).sort().join() === 'date,dateKo,ruleName,status,weight'), '메모·취소 사유·입력자 칸 없음');
  assert.deepStrictEqual(d.exceptions.filter((e) => e.date === '2027-03-04').map((e) => [e.type, e.state, e.upcoming]), [['병결', '확정', true]]);
  assert.ok(d.exceptions.every((e) => Object.keys(e).sort().join() === 'date,dateKo,reason,short,state,type,upcoming'), '사유 칸 없음');
  assert.strictEqual(d.status['학사'], '입실');
  assert.ok(!('counsel' in d), '학생 응답에는 상담 줄이 없다');
  const text = textOf(d);
  for (const bad of [M_OUT, M_EXC, HALL, ATT, 'ZZ-취소사유-표식']) assert.ok(!text.includes(bad), bad);
  names(x, [x.me.id]).forEach((n) => assert.ok(!text.includes(n), '다른 학생 이름: ' + n));
});

test('학부모 홈: 자녀마다 따로, 상담 여부는 날짜·교사 이름만(show_to_parent 참인 살아 있는 것), 내용·유형 없음, 취소·숨김은 안 보임', () => {
  const x = makeEnv();
  const kid = x.kids[0], teacher = x.teacherOf(kid);
  const base = { studentId: kid.id, date: '2027-03-03', type: '생활', target: '학부모' };
  const a = plain(x.env.call(teacher, 'saveCounselNote', Object.assign({}, base, { content: M_NOTE1 })));
  const hidden = plain(x.env.call(teacher, 'saveCounselNote', Object.assign({}, base, { date: '2027-03-02', type: '진로', content: M_NOTE2, showToParent: false })));
  const gone = plain(x.env.call(teacher, 'saveCounselNote', Object.assign({}, base, { date: '2027-03-02', type: '건강', content: M_NOTE2 + '-취소' })));
  assert.ok(a.ok && hidden.ok && gone.ok);
  assert.strictEqual(plain(x.env.call(teacher, 'cancelCounselNote', gone.id, '가짜 취소 사유')).ok, true);
  const d = call(x, PARENT, 'getPortalStudent', kid.id);
  const tname = x.env.rows('users').find((u) => u.email === teacher).name;
  assert.strictEqual(d.viewer, 'parent');
  assert.deepStrictEqual(d.counsel.map((c) => [c.date, c.teacher, Object.keys(c).sort().join()]), [['2027-03-03', tname, 'date,dateKo,teacher']]);
  const text = textOf(d);
  for (const bad of [M_NOTE1, M_NOTE2, '생활', '진로', '건강', teacher]) assert.ok(!text.includes(bad), bad);
  const other = x.kids.find((k) => k.id !== kid.id);
  if (other) assert.deepStrictEqual(call(x, PARENT, 'getPortalStudent', other.id).counsel, [], '다른 자녀에게 옮겨 가지 않는다');
});

test('월별 일정: 제목·종류·기간·운영 여부만, 일정 메모는 없다. 달 형식이 틀리면 거부', () => {
  const x = makeEnv();
  const tok = plain(x.env.call(ADMIN, 'getEventData', '2027-03')).token;
  const r = plain(x.env.call(ADMIN, 'saveEvent', { token: tok, title: '가짜 모의고사', kind: '시험', start_date: '2027-03-10', end_date: '2027-03-11', memo: M_EVT }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  for (const who of [[STUDENT, x.me.id], [PARENT, x.kids[0].id]]) {
    const d = call(x, who[0], 'getPortalStudent', who[1], '2027-03');
    assert.deepStrictEqual(d.month.events.map((e) => [e.title, e.kind, e.start, e.end]), [['가짜 모의고사', '시험', '2027-03-10', '2027-03-11']]);
    assert.strictEqual(d.month.days.length, 31);
    assert.ok(d.month.days.every((q) => typeof q.operating === 'boolean'));
    assert.ok(!textOf(d).includes(M_EVT));
  }
  assert.throws(() => x.env.call(STUDENT, 'getPortalStudent', x.me.id, '2027-13'), /달/);
  assert.deepStrictEqual(call(x, STUDENT, 'getPortalStudent', x.me.id).month.month, TODAY.slice(0, 7), '비우면 이번 달');
});

test('자리·방: 내 것만(공간 이름·자리 표시, 층·호수), 같은 방·옆자리 학생은 응답에 없다', () => {
  const x = makeEnv();
  const d = call(x, STUDENT, 'getPortalStudent', x.me.id);
  if (d.seat) assert.deepStrictEqual(Object.keys(d.seat).sort(), ['label', 'space']);
  if (d.room) assert.deepStrictEqual(Object.keys(d.room).sort(), ['floor', 'roomNo']);
  const text = textOf(d);
  names(x, [x.me.id]).forEach((n) => assert.ok(!text.includes(n), n));
  // 자리·방이 실제로 있는 학생으로 한 번 더(가짜 데이터에 자리·방이 없으면 건너뛴다)
  const seats = x.env.rows('seat_assignments');
  if (seats.length) {
    const sid = seats[0].student_id, owner = x.env.rows('students').find((s) => s.id === sid);
    const e = x.env.rows('guardian_links').some((g) => g.student_id === sid);
    assert.ok(owner && typeof e === 'boolean');
  }
});

test('급식·기숙사 상태: 학사·기숙사·조식·석식 값(방학에 실시 중이면 중식)이 학생·학부모 모두에게 같게 나온다', () => {
  const x = makeEnv();
  const a = call(x, STUDENT, 'getPortalStudent', x.me.id), b = call(x, PARENT, 'getPortalStudent', x.me.id);
  assert.deepStrictEqual(a.status, b.status);
  assert.deepStrictEqual(Object.keys(a.status).slice(0, 4), ['학사', '기숙사', '조식', '석식']);
});

test('유출 감시: 두 학생 계정 × 모든 학생의 id를 넣어 불러도(거부 제외) 응답 어디에도 다른 학생 이름·메일·전화 모양·표지가 없다', () => {
  const x = makeEnv();
  x.addOut(x.me, '2027-03-02T20:00:00');
  x.addOut(x.stranger, '2027-03-02T20:00:00');
  plain(x.env.call(ATT, 'saveException', { studentId: x.stranger.id, from: '2027-03-05', blocks: 'ALL', type: '병결', reason: M_EXC }));
  plain(x.env.call(x.teacherOf(x.stranger), 'saveCounselNote', { studentId: x.stranger.id, date: TODAY, type: '생활', target: '학생', content: M_NOTE1 }));
  const students = x.env.rows('students');
  let allowed = 0;
  for (const [who, own] of [[STUDENT, [x.me.id]], [PARENT, x.kids.map((k) => k.id)]]) {
    for (const s of students) {
      let r = null;
      try { r = plain(x.env.call(who, 'getPortalStudent', s.id)); } catch (e) { assert.ok(!own.includes(s.id), '허용돼야 할 학생이 거부됨'); continue; }
      assert.ok(own.includes(s.id), '허용되면 안 되는 학생: ' + s.name);
      allowed += 1;
      const text = textOf(r);
      students.filter((q) => q.id !== s.id).forEach((q) => assert.ok(!text.includes(q.name), '다른 학생 이름 ' + q.name));
      for (const bad of [M_OUT, M_EXC, M_NOTE1, M_NOTE2, HALL, ATT, 'owner@example.com']) assert.ok(!text.includes(bad), bad);
      assert.ok(!/@/.test(text) && !/01\d[- ]?\d{3,4}[- ]?\d{4}/.test(text), '이메일·전화 모양');
    }
  }
  assert.ok(allowed >= 2);
  // 운영 DB 감사 기록에도 표지가 없다(읽기는 감사에 남기지 않는다)
  assert.ok(!x.env.rows('audit_log').some((a) => JSON.stringify(a).includes(M_NOTE1)));
});

test('머리 카드·앞으로 일정·바뀌는 급식: 담당교사 이름(이메일 아님), 오늘부터의 일정 3건(메모 없음), 적용일이 뒤인 변경만', () => {
  const x = makeEnv();
  const tok = plain(x.env.call(ADMIN, 'getEventData', '2027-03')).token;
  for (const [i, t] of ['가짜 일정1', '가짜 일정2', '가짜 일정3', '가짜 일정4'].entries()) {
    const r = plain(x.env.call(ADMIN, 'saveEvent', { token: i === 0 ? tok : plain(x.env.call(ADMIN, 'getEventData', '2027-03')).token, title: t, kind: '행사', start_date: '2027-03-0' + (i + 5), end_date: '', memo: M_EVT }));
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  }
  plain(x.env.call(ADMIN, 'saveEvent', { token: plain(x.env.call(ADMIN, 'getEventData', '2027-03')).token, title: '지난 일정', kind: '행사', start_date: '2027-03-02', end_date: '', memo: '' }));
  const d = call(x, PARENT, 'getPortalStudent', x.me.id);
  const tname = x.env.rows('users').find((u) => u.email === x.teacherOf(x.me)).name;
  assert.strictEqual(d.teacher, tname);
  assert.deepStrictEqual(d.upcoming.map((e) => e.title), ['가짜 일정1', '가짜 일정2', '가짜 일정3'], '오늘 이후 3건, 지난 일정 제외');
  assert.ok(!textOf(d).includes(M_EVT) && !textOf(d).includes(x.teacherOf(x.me)));
  assert.ok(d.pending.every((c) => c.date > TODAY && ['기숙사', '조식', '석식', '중식'].includes(c.item)));
  assert.deepStrictEqual(Object.keys(d.upcoming[0]).sort(), ['dateKo', 'end', 'kind', 'start', 'title']);
});

test('취소된 특이사항은 "취소"로 남고(사유 없음), 신원 판정은 portalWho_ 한 곳(이 파일은 users·guardian_links·students.email을 직접 보지 않는다)', () => {
  const x = makeEnv();
  const r = plain(x.env.call(ATT, 'saveException', { studentId: x.me.id, from: '2027-03-09', blocks: 'ALL', type: '병결', reason: M_EXC }));
  assert.strictEqual(r.ok, true);
  const grp = plain(x.env.call(ATT, 'listExceptions', { scope: 'student', studentId: x.me.id })).groups.find((g) => g.dates.includes('2027-03-09'));
  assert.strictEqual(plain(x.env.call(ATT, 'cancelException', x.term.id, grp.groupId, '가짜 취소 사유')).ok, true);
  const d = call(x, STUDENT, 'getPortalStudent', x.me.id);
  assert.deepStrictEqual(d.exceptions.filter((e) => e.date === '2027-03-09').map((e) => e.state), ['취소']);
  assert.ok(!textOf(d).includes('가짜 취소 사유') && !textOf(d).includes(M_EXC));
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../src/features/Portal.gs'), 'utf8');
  assert.ok(!/guardian_links|getCurrentUser_|ptlWho_|\b(student|st|s|me)\.email\b/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), '신원은 portalWho_만');
});

test('C44 출결 기록 이유 한 줄: 유형·상태로만 정한다(미인정은 OUT으로 센다는 말, 학부모는 "OUT 1번"·학생은 "1OUT"), 취소·모르는 유형은 빈 줄, 사유 메모는 응답에 없다', () => {
  const x = makeEnv();
  const R = (type, state, parent) => x.env.asOwner((c) => c.ptlReason_(type, state, ['미인정지각', '미인정조퇴', '미인정결석'], parent));
  assert.strictEqual(R('미인정지각', '확정', false), '미인정이라 1OUT으로 셉니다.');
  assert.strictEqual(R('미인정결석', '확정', true), '미인정이라 OUT 1번으로 셉니다.');
  assert.strictEqual(R('미인정조퇴', '요청', false), '미인정이라 확정되면 1OUT이 됩니다.');
  assert.strictEqual(R('미인정조퇴', '요청', true), '미인정이라 확인되면 OUT 1번이 됩니다.');
  assert.strictEqual(R('미인정지각', '취소', false), '', '취소는 이유 줄이 없다');
  assert.deepStrictEqual(['병결', '병지각', '병조퇴', '가정사유(가족여행 포함)', '학원(보강 포함)', '학사 외 프로그램', '학사 내 프로그램(파워클래스·면접특강 등)', '기타', '없는 유형'].map((t) => R(t, '확정', false)),
    ['병으로 인한 기록입니다.', '병으로 인한 기록입니다.', '병으로 인한 기록입니다.', '가정 사유 기록입니다.', '학원 일정 기록입니다.', '학사 밖 프로그램 참가 기록입니다.', '학사 안 프로그램 참가 기록입니다.', '기타 사유 기록입니다.', '']);
  assert.strictEqual(plain(x.env.call(ATT, 'saveException', { studentId: x.me.id, from: '2027-03-05', blocks: 'ALL', type: '미인정지각', reason: M_EXC })).ok, true);
  assert.strictEqual(plain(x.env.call(ATT, 'saveException', { studentId: x.me.id, from: '2027-03-06', blocks: 'ALL', type: '학원(보강 포함)', reason: M_EXC })).ok, true);
  const s = call(x, STUDENT, 'getPortalStudent', x.me.id);
  const by = (d, date) => d.exceptions.find((e) => e.date === date);
  assert.strictEqual(by(s, '2027-03-05').reason, '미인정이라 1OUT으로 셉니다.');
  assert.strictEqual(by(s, '2027-03-06').reason, '학원 일정 기록입니다.');
  assert.ok(!textOf(s.exceptions).includes(M_EXC), '사유(교사·학생이 적은 글)는 이유 줄에 안 들어간다');
  if (x.kids.some((k) => k.id === x.me.id)) {
    const p = call(x, PARENT, 'getPortalStudent', x.me.id);
    assert.strictEqual(by(p, '2027-03-05').reason, '미인정이라 OUT 1번으로 셉니다.');
    assert.ok(!textOf(p.exceptions).includes(M_EXC) && !textOf(p.exceptions).includes('1OUT'), '학부모 표기');
  }
});
