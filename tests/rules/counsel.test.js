/** R24 상담 신청(F17)·상담일지 6단계 칸(결정 90·94~96). 가짜 데이터만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/Stage6Rules.gs', 'src/rules/CounselRules.gs']);
const TODAY = '2027-03-10';
const req = (input, existing) => plain(ctx.counselRequestCheck_(Object.assign({ studentId: 's1', dates: ['2027-03-12'], topic: '진로', memo: '' }, input), TODAY, existing || []));

test('counselRequestCheck_: 희망 날짜 1~3개(결정 95)·오늘 이후·중복 없음, 주제, 메모 길이, 열린 신청 1건', () => {
  assert.deepStrictEqual(req({ dates: ['2027-03-15', '2027-03-10', '2027-03-12'] }), { errors: [],
    row: { student_id: 's1', preferred_dates: '2027-03-10;2027-03-12;2027-03-15', topic: '진로', memo: '', status: '신청' } });
  const T = [
    [{ dates: [] }, /희망 날짜가 없습니다/],
    [{ dates: ['2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14'] }, /3개까지 고를 수 있습니다\. 1개를 빼 주세요/],
    [{ dates: ['2027-03-09'] }, /^3월 9일\(화\)은 지난 날입니다/],
    [{ dates: ['2027-02-30'] }, /읽을 수 없는 날짜입니다\(2027-02-30\)/],
    [{ dates: ['2027-03-12', '2027-03-12'] }, /3월 12일\(금\)을 두 번 골랐습니다/],
    [{ topic: '연애' }, /상담 주제를 골라 주세요\(학업·생활·진로·건강·가정·기타\)/],
    [{ memo: 'x'.repeat(501) }, /500자까지.*지금 501자/],
  ];
  T.forEach(([inp, re]) => { const r = req(inp); assert.strictEqual(r.row, null); assert.ok(r.errors.some((e) => re.test(e)), JSON.stringify(r.errors)); });
  ['신청', '확정'].forEach((st) => assert.match(req({}, [{ student_id: 's1', status: st }]).errors.join(), /처리되지 않은 상담 신청이 있습니다/, st));
  ['완료', '반려', '취소'].forEach((st) => assert.deepStrictEqual(req({}, [{ student_id: 's1', status: st }]).errors, [], st));
  assert.deepStrictEqual(req({}, [{ student_id: 's2', status: '신청' }]).errors, [], '다른 학생의 열린 신청은 상관없음');
  assert.ok(plain(ctx.counselRequestCheck_({ studentId: 's1', dates: ['2027-03-12'], topic: '면담' }, TODAY, [], { topics: ['면담'] })).row);
  assert.throws(() => ctx.counselRequestCheck_({ studentId: 's1' }, '2027-3-10', []), /today/);
  assert.throws(() => ctx.counselRequestCheck_({}, TODAY, []), /studentId/);
});

const R = (status, extra) => Object.assign({ id: 'q1', student_id: 's1', preferred_dates: '2027-03-12;2027-03-15', status }, extra || {});
const STAFF = { role: 'assigned' }, ME = { role: 'student', isSelf: true };
const next = (st, action, actor, input) => plain(ctx.counselRequestNext_(R(st), action, actor, input || {}, TODAY));

test('counselRequestNext_ 상태표: 지금 상태 × 행동(담당교사·관리자는 확정·반려·완료, 학생 본인은 취소)', () => {
  const OK = {
    '신청': { confirm: 1, reject: 1, complete: 0, cancel: 1 }, '확정': { confirm: 0, reject: 1, complete: 1, cancel: 1 },
    '완료': { confirm: 0, reject: 0, complete: 0, cancel: 0 }, '반려': { confirm: 0, reject: 0, complete: 0, cancel: 0 }, '취소': { confirm: 0, reject: 0, complete: 0, cancel: 0 },
  };
  const input = { date: '2027-03-12', reason: '사유', noteId: 'n1' };
  Object.keys(OK).forEach((st) => Object.keys(OK[st]).forEach((a) => {
    const r = next(st, a, a === 'cancel' ? ME : STAFF, input);
    assert.strictEqual(!r.errors.length, !!OK[st][a], st + ' × ' + a + ' ' + r.errors);
    if (!OK[st][a]) assert.strictEqual(r.patch, null);
  }));
  assert.deepStrictEqual(next('신청', 'confirm', STAFF, input).patch, { status: '확정', decided_date: '2027-03-12' });
  assert.deepStrictEqual(next('확정', 'reject', { role: 'admin' }, { reason: ' 그날 \n 출장 ' }).patch, { status: '반려', reject_reason: '그날 출장' });
  assert.deepStrictEqual(next('확정', 'complete', STAFF, input).patch, { status: '완료', note_id: 'n1' });
  assert.deepStrictEqual(next('신청', 'cancel', ME, {}).patch, { status: '취소', cancel_reason: '' });
});

test('counselRequestNext_ 막힘: 누가(담임·다른 학생), 희망 날짜 밖·지난 날, 반려 사유 없음, 완료에 일지 없음', () => {
  ['homeroom', 'none', 'student', 'parent'].forEach((role) => assert.match(next('신청', 'confirm', { role, isSelf: true }, { date: '2027-03-12' }).errors[0], /담당 선생님만/, role));
  assert.match(next('신청', 'cancel', STAFF).errors[0], /신청한 학생만 취소할 수 있습니다/);
  assert.match(next('신청', 'cancel', { role: 'student', isSelf: false }).errors[0], /신청한 학생만/);
  assert.match(next('신청', 'confirm', STAFF, { date: '2027-03-13' }).errors[0], /희망 날짜 중 하나/);
  assert.match(plain(ctx.counselRequestNext_(R('신청'), 'confirm', STAFF, { date: '2027-03-12' }, '2027-03-14')).errors[0], /^3월 12일\(금\)은 지난 날입니다/);
  ['', '  '].forEach((reason) => assert.match(next('신청', 'reject', STAFF, { reason }).errors[0], /반려 사유가 비어 있습니다/));
  assert.match(next('신청', 'reject', STAFF, { reason: 'x'.repeat(201) }).errors[0], /200자까지/);
  assert.match(next('확정', 'complete', STAFF, {}).errors[0], /상담일지를 먼저 저장해 주세요/);
  assert.match(next('완료', 'cancel', ME).errors[0], /지금 상태\(완료\)에서는 취소할 수 없습니다/);
  assert.throws(() => next('신청', 'delete', STAFF), /action/);
});

test('counselNoteCheck_: 합의 사항 길이, 학부모 공개는 학생이 켤 때만·빈 합의 사항은 FALSE, 참고 버전, 신청 연결', () => {
  const chk = (i, o) => plain(ctx.counselNoteCheck_(i, o || {}));
  assert.deepStrictEqual(chk({ type: '생활', agreement: '  매일 23시 귀가 ' }), { errors: [], warnings: [],
    patch: { agreement: '매일 23시 귀가', agreement_to_parent: 'FALSE', profile_version: '', request_id: '' } });
  assert.strictEqual(chk({ agreement: 'x', agreementToParent: true }).patch.agreement_to_parent, 'FALSE', '(가정) 교사 저장에서는 켜지지 않는다');
  assert.strictEqual(chk({ agreement: 'x', agreementToParent: 'TRUE' }, { byStudent: true }).patch.agreement_to_parent, 'TRUE');
  assert.strictEqual(chk({ agreement: '', agreementToParent: 'TRUE' }, { byStudent: true }).patch.agreement_to_parent, 'FALSE');
  assert.match(chk({ agreement: 'x'.repeat(1001) }).errors[0], /1000자까지.*지금 1001자/);
  assert.match(chk({ type: '진로' }).warnings[0], /참고한 진로 프로필 버전이 없습니다/);
  assert.match(chk({ type: '진학' }).warnings[0], /참고한/);
  assert.deepStrictEqual(chk({ type: '진로', profileVersion: 2 }, { profileVersions: [1, 2] }).patch.profile_version, '2');
  assert.match(chk({ profileVersion: '3' }, { profileVersions: [1, 2] }).errors[0], /3번째 버전이 없습니다/);
  assert.match(chk({ requestId: 'q1' }).errors[0], /상담 신청을 찾지 못했습니다/);
  assert.match(chk({ requestId: 'q1' }, { request: R('신청') }).errors[0], /지금 상태는 신청입니다/);
  assert.strictEqual(chk({ requestId: 'q1' }, { request: R('확정') }).patch.request_id, 'q1');
});

test('counselView_: 학생은 날짜·교사·합의 사항(유형·내용 없음, 결정 94), 학부모는 날짜·교사 + 공개 합의 사항(결정 90), 교사는 전부', () => {
  const note = { id: 'n1', student_id: 's1', date: '2027-03-10', teacher_email: 'teacher@example.com', type: '진로', target: '학생', content: '가짜 상담 내용',
    show_to_parent: 'TRUE', status: '유효', agreement: '탐구 주제 정하기', agreement_to_parent: 'FALSE', profile_version: '1', request_id: 'q1' };
  const tn = { teacherName: '가짜선생' };
  assert.deepStrictEqual(plain(ctx.counselView_(note, { role: 'student', isSelf: true }, tn)), { id: 'n1', date: '2027-03-10', teacher_name: '가짜선생', agreement: '탐구 주제 정하기' });
  assert.deepStrictEqual(plain(ctx.counselView_(note, { role: 'parent', isChild: true }, tn)), { id: 'n1', date: '2027-03-10', teacher_name: '가짜선생' });
  assert.deepStrictEqual(plain(ctx.counselView_(Object.assign({}, note, { agreement_to_parent: 'TRUE' }), { role: 'parent', isChild: true }, tn)),
    { id: 'n1', date: '2027-03-10', teacher_name: '가짜선생', agreement: '탐구 주제 정하기' });
  assert.strictEqual(ctx.counselView_(Object.assign({}, note, { show_to_parent: 'FALSE' }), { role: 'parent', isChild: true }, tn), null);
  assert.strictEqual(ctx.counselView_(note, { role: 'none' }), null);
  assert.strictEqual(plain(ctx.counselView_(note, { role: 'assigned' })).content, '가짜 상담 내용');
  ['student', 'parent'].forEach((role) => {
    const s = JSON.stringify(plain(ctx.counselView_(Object.assign({}, note, { agreement_to_parent: 'TRUE' }), { role, isSelf: true, isChild: true }, tn)));
    ['가짜 상담 내용', 'teacher@example.com', '"진로"', 'q1'].forEach((bad) => assert.ok(!s.includes(bad), role + ' ' + bad));
  });
});
