/** C5 F1 사전 특이사항: R4 gas-fakes 환경(src 전체)에서 실제 공개 함수를 부른다. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ATT = 'test.attendance@example.com', ADMIN = 'test.admin@example.com', TEACHER = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', DUTY = 'test.duty@example.com';

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-03T20:00:00' });
  const acc = env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const mine = students.filter((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === TEACHER));      // 학사 교사 담당
  const other = students.find((s) => enr.some((e) => e.student_id === s.id) && !mine.includes(s));                // 담당 아님
  const first = students.find((s) => s.memo === '가짜 데이터');
  const late = enr.length ? env.rows('status_changes').find((c) => c.item === '학사' && c.effective_date === '2027-03-15').student_id : '';
  const tab = () => env.rows('exceptions_' + term.id.slice(0, 8));
  return { env, acc, term, students, enr, mine, other, first, late, tab };
}
const sheetTab = (x) => x.tab();

/* ───── 시작값 ───── */

test('getExceptionContext: 출결 담당은 학사생 전체·확정 방식, 유형 11개(미인정 3개는 auto), 약어는 설정값', () => {
  const x = makeEnv();
  const c = x.env.expectAllowed(ATT, 'getExceptionContext');
  assert.strictEqual(c.mode, 'confirm'); assert.strictEqual(c.canConfirm, true);
  assert.strictEqual(c.today, '2027-03-03'); assert.strictEqual(c.tomorrow, '2027-03-04');
  assert.strictEqual(c.term.id, x.term.id);
  assert.strictEqual(c.students.length, 29, '30명 중 3월 15일 입실 예정 1명은 아직 목록에 없다');
  assert.ok(c.students.every((s) => s.name && s.studentNo && !('email' in s)), '이메일 등 개인 연락처는 내보내지 않는다');
  assert.strictEqual(c.types.length, 11);
  assert.deepStrictEqual(c.types.filter((t) => t.auto).map((t) => t.short), ['무지', '무조', '무결']);
  assert.deepStrictEqual(c.types.slice(0, 3).map((t) => t.short), ['병결', '병지', '병조']);
});

test('getExceptionContext: 학사 교사는 담당 학생만·요청 방식, 담임은 자기 반만·요청 방식', () => {
  const x = makeEnv();
  const t = x.env.call(TEACHER, 'getExceptionContext');
  assert.strictEqual(t.mode, 'request');
  assert.ok(t.students.length > 0 && t.students.every((s) => x.mine.some((m) => m.id === s.id)), '담당 학생만');
  assert.strictEqual(t.students.length, x.mine.length - x.mine.filter((m) => m.id === x.late).length, '입실 전 학생은 제외');
  const h = x.env.call(HOMEROOM, 'getExceptionContext');
  assert.strictEqual(h.mode, 'request');
  assert.ok(h.students.length >= 1 && h.students.length < 29);
  const cls = (id) => { const s = x.students.find((q) => q.id === id); return s.grade + '-' + s.class_no; };
  assert.strictEqual(new Set(h.students.map((s) => cls(s.id))).size, 1, '한 학급만');
});

test('getDayBlocks: 수요일 3블록, 운영 안 하는 날(3월 10일)은 operating false, 형식 오류는 오류', () => {
  const x = makeEnv();
  const wed = x.env.call(ATT, 'getDayBlocks', '2027-03-03');
  assert.strictEqual(wed.operating, true); assert.deepStrictEqual(wed.blocks.map((b) => b.label), ['18–20', '20–22', '22–24']);
  assert.strictEqual(x.env.call(ATT, 'getDayBlocks', '2027-03-05').blocks.length, 3);
  assert.strictEqual(x.env.call(ATT, 'getDayBlocks', '2027-03-07').blocks.length, 4, '일요일 4블록');
  assert.strictEqual(x.env.call(ATT, 'getDayBlocks', '2027-03-10').operating, false);
  assert.ok(x.env.errorOf(ATT, (c) => c.getDayBlocks('2027-02-30')));
});

/* ───── 저장 ───── */

test('출결 담당이 입력하면 바로 확정: 하루 1행, 블록·유형·메모 저장, 입력자·확정자·시각 기록', () => {
  const x = makeEnv();
  const before = x.tab().length;
  const r = x.env.expectAllowed(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-04', to: '2027-03-04', blocks: 'ALL', type: '병결', reason: '독감' });
  assert.deepStrictEqual([r.ok, r.status, r.count, r.display.slice(0, 2)], [true, '확정', 1, x.first.grade + '.']);
  const rows = x.tab();
  assert.strictEqual(rows.length, before + 1);
  const row = rows[rows.length - 1];
  assert.deepStrictEqual([row.student_id, row.date, row.blocks, row.type, row.reason, row.status, row.requested_by, row.confirmed_by, row.term_id],
    [x.first.id, '2027-03-04', 'ALL', '병결', '독감', '확정', ATT, ATT, x.term.id]);
  assert.strictEqual(row.requested_at, '2027-03-03T20:00:00'); assert.strictEqual(row.confirmed_at, '2027-03-03T20:00:00');
  assert.strictEqual(row.cancel_reason, '');
});

test('기간 입력: 날짜마다 1행·같은 묶음(group_id), "15:00부터 귀가"는 15:00-24:00, 블록 표기는 정규화', () => {
  const x = makeEnv();
  const r = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-22', to: '2027-03-24', blocks: '15:00-24:00', type: '가정사유(가족여행 포함)', reason: '' });
  assert.deepStrictEqual([r.ok, r.count, r.from, r.to], [true, 3, '2027-03-22', '2027-03-24']);
  const rows = x.tab().filter((q) => q.group_id === r.groupId);
  assert.deepStrictEqual(rows.map((q) => q.date), ['2027-03-22', '2027-03-23', '2027-03-24']);
  assert.ok(rows.every((q) => q.blocks === '15:00-24:00' && q.status === '확정'));
  const r2 = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-25', blocks: '22:00-24:00; 18:00 – 20:00', type: '병결' });
  assert.strictEqual(x.tab().find((q) => q.group_id === r2.groupId).blocks, '18:00-20:00;22:00-24:00');
});

test('담당 학사 교사·담임은 요청만 남긴다(확정 정보 없음) / 담당이 아니거나 다른 반 학생은 거부(denied:exception.save)', () => {
  const x = makeEnv();
  const mine = x.mine[0];
  const r = x.env.expectAllowed(TEACHER, 'saveException', { studentId: mine.id, from: '2027-03-04', blocks: 'ALL', type: '병결', reason: '' });
  assert.deepStrictEqual([r.ok, r.status], [true, '요청']);
  const row = x.tab().find((q) => q.group_id === r.groupId);
  assert.deepStrictEqual([row.status, row.requested_by, row.confirmed_by, row.confirmed_at], ['요청', TEACHER, '', '']);
  x.env.expectDenied(TEACHER, 'exception.save', 'saveException', { studentId: x.other.id, from: '2027-03-04', blocks: 'ALL', type: '병결' });
  x.env.expectDenied(TEACHER, 'exception.save', 'saveException', { studentId: x.acc.unenrolledStudentId, from: '2027-03-04', blocks: 'ALL', type: '병결' });
  // 담임: 자기 반 1번 학생은 허용, 다른 반은 거부
  const own = x.env.call(HOMEROOM, 'getExceptionContext').students[0];
  const hr = x.env.expectAllowed(HOMEROOM, 'saveException', { studentId: own.id, from: '2027-03-04', blocks: '20:00-22:00', type: '병지각' });
  assert.strictEqual(hr.status, '요청');
  const ownClass = (id) => { const s = x.students.find((q) => q.id === id); return s.grade + '-' + s.class_no; };
  const foreign = x.students.find((s) => x.enr.some((e) => e.student_id === s.id) && ownClass(s.id) !== ownClass(own.id));
  x.env.expectDenied(HOMEROOM, 'exception.save', 'saveException', { studentId: foreign.id, from: '2027-03-04', blocks: 'ALL', type: '병결' });
  // 쓰기는 하나도 늘지 않았다
  assert.strictEqual(x.tab().filter((q) => q.student_id === foreign.id && q.date === '2027-03-04').length, 0);
});

test('학생·학부모·근무표 담당은 저장·목록 모두 거부, 거부는 audit_log에 남는다', () => {
  const x = makeEnv();
  const input = { studentId: x.first.id, from: '2027-03-04', blocks: 'ALL', type: '병결' };
  for (const email of [STUDENT, PARENT, DUTY]) {
    x.env.expectDenied(email, 'exception.save', 'saveException', input);
    x.env.expectDenied(email, 'exception.save', 'previewException', input);
    x.env.expectDenied(email, 'exception.view', 'getExceptionContext');
    x.env.expectDenied(email, 'exception.view', 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-03' });
    x.env.expectDenied(email, 'exception.view', 'getDayBlocks', '2027-03-03');
  }
  assert.ok(x.env.auditActions('denied:exception').length >= 15);
});

test('입력 검사: 유형·학생·날짜·시간·기간 길이·운영 기간 밖·메모 길이(나쁜 입력)는 저장하지 않고 필드별 안내', () => {
  const x = makeEnv();
  const w = x.tab().length;
  const base = { studentId: x.first.id, from: '2027-03-04', blocks: 'ALL', type: '병결' };
  const bad = (o) => x.env.call(ATT, 'saveException', Object.assign({}, base, o));
  const fields = (r) => r.errors.map((e) => e.field);
  assert.deepStrictEqual(fields(bad({ type: '' })), ['type']);
  assert.deepStrictEqual(fields(bad({ type: '없는유형' })), ['type']);
  assert.deepStrictEqual(fields(bad({ blocks: '25:00-26:00' })), ['blocks']);
  assert.deepStrictEqual(fields(bad({ blocks: '20:00-18:00' })), ['blocks']);
  assert.deepStrictEqual(fields(bad({ from: '2027-02-30' })), ['from']);
  assert.deepStrictEqual(fields(bad({ to: '2027-03-01' })), ['to']);
  assert.ok(bad({ to: '2027-03-01' }).errors[0].message.includes('종료일을 같은 날이나 뒤로'));
  assert.deepStrictEqual(fields(bad({ to: '2027-06-30' })), ['to'], '62일 초과');
  assert.deepStrictEqual(fields(bad({ from: '2030-01-01' })), ['from'], '운영 기간 밖');
  assert.deepStrictEqual(fields(bad({ from: '2027-07-10', to: '2027-07-25' })), ['to'], '기간이 끝나는 날을 넘음');
  assert.deepStrictEqual(fields(bad({ reason: 'ㄱ'.repeat(201) })), ['reason']);
  assert.strictEqual(x.tab().length, w, '아무것도 쓰지 않았다');
  assert.ok(x.env.errorOf(ATT, (c) => c.saveException({ from: '2027-03-04' })), '학생 없이 부르면 권한 검사에서 막힌다');
});

test('previewException: 겹치면 경고(저장은 가능, 두 건이 된다), 미인정 유형은 autoOut 안내, 아무것도 쓰지 않음', () => {
  const x = makeEnv();
  // 가짜 시드: 첫 학생에게 2027-03-03 전체 병결(확정)이 있다
  const stu = x.students.find((s) => x.tab().some((q) => q.date === '2027-03-03' && q.student_id === s.id && q.blocks === 'ALL'));
  const w = x.tab().length;
  const p = x.env.call(ATT, 'previewException', { studentId: stu.id, from: '2027-03-03', blocks: '18:00-20:00', type: '학원(보강 포함)' });
  assert.strictEqual(p.ok, true); assert.strictEqual(p.mode, 'confirm'); assert.strictEqual(p.dayCount, 1);
  assert.ok(p.warnings.length === 1 && p.warnings[0].includes('이미') && p.warnings[0].includes('병결'), JSON.stringify(p.warnings));
  assert.strictEqual(p.autoOut, false);
  const u = x.env.call(ATT, 'previewException', { studentId: x.first.id, from: '2027-03-30', blocks: 'ALL', type: '미인정결석' });
  assert.strictEqual(u.autoOut, true); assert.deepStrictEqual(u.warnings, []);
  assert.strictEqual(x.tab().length, w);
  // 겹쳐도 저장은 된다
  const s = x.env.call(ATT, 'saveException', { studentId: stu.id, from: '2027-03-03', blocks: '18:00-20:00', type: '학원(보강 포함)' });
  assert.strictEqual(s.ok, true); assert.strictEqual(s.warnings.length, 1);
  assert.strictEqual(x.tab().filter((q) => q.student_id === stu.id && q.date === '2027-03-03' && q.status !== '취소').length, 2);
  // 맞닿기만 하면 겹치지 않는다
  assert.deepStrictEqual(x.env.call(ATT, 'previewException', { studentId: x.first.id, from: '2027-03-31', blocks: '18:00-20:00', type: '병결' }).warnings, []);
});

/* ───── 목록·확정·취소 ───── */

test('listExceptions pending: 출결 담당은 요청 목록(요청자 이름·확정/취소 가능), 학사 교사는 거부(denied:exception.view)', () => {
  const x = makeEnv();
  const l = x.env.expectAllowed(ATT, 'listExceptions', { scope: 'pending' });
  assert.ok(l.groups.length >= 1 && l.groups.every((g) => g.status === '요청' && g.canConfirm && g.canCancel));
  assert.ok(l.groups.every((g) => /^\d\. /.test(g.display) && g.requestedByName), '"학년. 이름"과 요청자 이름');
  x.env.expectDenied(TEACHER, 'exception.view', 'listExceptions', { scope: 'pending' });
  x.env.expectDenied(HOMEROOM, 'exception.view', 'listExceptions', { scope: 'pending' });
});

test('listExceptions range/mine/student: 역할별로 볼 수 있는 학생만, 학생별 누적은 날짜 역순, 범위 밖 학생은 거부', () => {
  const x = makeEnv();
  const all = x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-09' });
  assert.ok(all.groups.length >= 6);
  const t = x.env.call(TEACHER, 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-09' });
  assert.ok(t.groups.every((g) => x.mine.some((m) => m.id === g.studentId)), '담당 학생 것만');
  assert.ok(t.groups.length < all.groups.length);
  // 담당 아닌 학생의 누적은 거부
  x.env.expectDenied(TEACHER, 'exception.view', 'listExceptions', { scope: 'student', studentId: x.other.id });
  // 학생별 누적(날짜 역순): 가정사유 3일 묶음 학생
  const grp = all.groups.find((g) => g.dates.length === 3);
  const stu = x.env.call(ATT, 'listExceptions', { scope: 'student', studentId: grp.studentId });
  assert.ok(stu.groups.length >= 1);
  const firstDates = stu.groups.map((g) => g.dates[0]);
  assert.deepStrictEqual(firstDates, firstDates.slice().sort().reverse());
  // 내가 보낸 요청
  const r = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  const m = x.env.call(TEACHER, 'listExceptions', { scope: 'mine' });
  assert.deepStrictEqual(m.groups.map((g) => g.groupId), [r.groupId]);
  assert.ok(m.groups[0].mine && m.groups[0].canCancel && !m.groups[0].canConfirm, '교사는 확정 불가, 자기 요청은 취소 가능');
});

test('confirmException: 출결 담당이 요청 묶음을 확정(확정자·시각 기록), 이미 처리된 것은 안내, 학사 교사·담임은 거부(denied:exception.confirm)', () => {
  const x = makeEnv();
  const r = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-12', to: '2027-03-14', blocks: 'ALL', type: '가정사유(가족여행 포함)' });
  x.env.expectDenied(TEACHER, 'exception.confirm', 'confirmException', x.term.id, r.groupId);
  x.env.expectDenied(HOMEROOM, 'exception.confirm', 'confirmException', x.term.id, r.groupId);
  assert.ok(x.tab().filter((q) => q.group_id === r.groupId).every((q) => q.status === '요청'));
  const ok = x.env.expectAllowed(ATT, 'confirmException', x.term.id, r.groupId);
  assert.deepStrictEqual(ok, { ok: true, count: 3 });
  const rows = x.tab().filter((q) => q.group_id === r.groupId);
  assert.ok(rows.every((q) => q.status === '확정' && q.confirmed_by === ATT && q.confirmed_at === '2027-03-03T20:00:00'));
  const again = x.env.call(ATT, 'confirmException', x.term.id, r.groupId);
  assert.strictEqual(again.ok, false); assert.ok(again.error.includes('이미 처리'));
  assert.ok(x.env.auditActions('bulk_update').length >= 1, '변경은 audit_log에 남는다');
  assert.strictEqual(x.env.call(ADMIN, 'confirmException', x.term.id, 'nope').ok, false, '없는 묶음');
});

test('cancelException: 사유 필수·행은 남고 status 취소·audit에 전후 값 / 출결 담당은 모두, 교사는 자기 요청만', () => {
  const x = makeEnv();
  const mineId = x.mine[0].id;
  const req = x.env.call(TEACHER, 'saveException', { studentId: mineId, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  const conf = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-15', to: '2027-03-16', blocks: 'ALL', type: '병결' });
  const total = x.tab().length;
  // 교사: 자기 요청은 취소 가능, 확정된 건·남의 요청은 거부
  x.env.expectDenied(TEACHER, 'exception.cancel', 'cancelException', x.term.id, conf.groupId, '사유가 있습니다');
  const otherReq = x.env.call(HOMEROOM, 'getExceptionContext').students[0];
  const hr = x.env.call(HOMEROOM, 'saveException', { studentId: otherReq.id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  x.env.expectDenied(TEACHER, 'exception.cancel', 'cancelException', x.term.id, hr.groupId, '남의 요청');
  // 사유가 짧으면 안내만
  const short = x.env.call(TEACHER, 'cancelException', x.term.id, req.groupId, '아');
  assert.strictEqual(short.ok, false); assert.ok(short.error.includes('2자 이상'));
  assert.strictEqual(x.tab().find((q) => q.group_id === req.groupId).status, '요청');
  const okT = x.env.expectAllowed(TEACHER, 'cancelException', x.term.id, req.groupId, '잘못 보냄');
  assert.deepStrictEqual(okT, { ok: true, count: 1 });
  const rowT = x.tab().find((q) => q.group_id === req.groupId);
  assert.deepStrictEqual([rowT.status, rowT.cancel_reason], ['취소', '잘못 보냄']);
  // 출결 담당: 확정된 2일 묶음도 취소(사유 필수), 행은 지워지지 않는다
  const okA = x.env.call(ATT, 'cancelException', x.term.id, conf.groupId, '사유 없음으로 취소');
  assert.deepStrictEqual(okA, { ok: true, count: 2 });
  assert.ok(x.tab().filter((q) => q.group_id === conf.groupId).every((q) => q.status === '취소' && q.cancel_reason === '사유 없음으로 취소'));
  assert.strictEqual(x.tab().length, total + 1, '행은 지워지지 않고(교사 요청 1건만 더 늘었다)');
  assert.strictEqual(x.env.call(ATT, 'cancelException', x.term.id, conf.groupId, '또 취소').ok, false, '이미 취소');
  // 감사 기록: 바뀐 칸의 이전·이후 값
  const audit = x.env.rows('audit_log').filter((r) => r.action === 'bulk_update' && r.sheet === 'exceptions_' + x.term.id.slice(0, 8));
  assert.ok(audit.length >= 2);
  const cancelLog = audit.find((r) => r.after.includes('사유 없음으로 취소'));
  const b = JSON.parse(cancelLog.before), a = JSON.parse(cancelLog.after);
  const anyId = Object.keys(a)[0];
  assert.deepStrictEqual([b[anyId].status, a[anyId].status], ['확정', '취소']);
});

test('취소하면 목록에 취소로 남고(사유 보임), 확정한 건은 출석부 계산(R3)에서 EXC로 나온다 / 요청·취소는 무시된다', () => {
  const x = makeEnv();
  const conf = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-17', blocks: '20:00-22:00', type: '병결' });
  const req = x.env.call(TEACHER, 'saveException', { studentId: x.mine[1].id, from: '2027-03-17', blocks: 'ALL', type: '병결' });
  const cell = (studentId) => x.env.as(ATT, (c) => {
    const rows = c.readAll_('exceptions_' + x.term.id.slice(0, 8)).filter((r) => r.student_id === studentId);
    const plan = c.resolveDayPlan_('2027-03-17', { termType: '학기', daySchedule: null, blocks: c.readAll_('blocks'), defaults: c.calDefaults_([]) });
    return JSON.parse(JSON.stringify(c.resolveStudentDay_(plan, { exceptions: rows, fixedRows: [], endType: '' }, {}).map((m) => [m.seq, m.code, m.text])));
  });
  assert.deepStrictEqual(cell(x.first.id).filter((m) => m[1] === 'EXC'), [[2, 'EXC', '병결']], '확정은 칸에 나온다');
  assert.ok(cell(x.mine[1].id).every((m) => m[1] !== 'EXC'), '요청은 칸에 나오지 않는다');
  x.env.call(ATT, 'confirmException', x.term.id, req.groupId);
  assert.ok(cell(x.mine[1].id).some((m) => m[1] === 'EXC'), '확정하면 나온다');
  x.env.call(ATT, 'cancelException', x.term.id, conf.groupId, '잘못 입력');
  assert.ok(cell(x.first.id).every((m) => m[1] !== 'EXC'), '취소하면 사라진다');
  const l = x.env.call(ATT, 'listExceptions', { scope: 'student', studentId: x.first.id });
  const g = l.groups.find((q) => q.groupId === conf.groupId);
  assert.deepStrictEqual([g.status, g.cancelReason, g.canCancel], ['취소', '잘못 입력', false]);
});

test('새 기간(등록 전)은 학생 목록이 비어 있고 목록 조회도 빈 결과 — saveTerm이 기간별 탭을 만들어 두었다', () => {
  const x = makeEnv();
  x.env.call(ADMIN, 'saveTerm', { name: '2027 2학기', type: '학기', start_date: '2027-08-23', end_date: '2028-02-28' });
  const t3 = x.env.rows('terms').find((t) => t.name === '2027 2학기');
  // 새 기간에는 등록이 없어 학생 범위 판정이 되지 않으므로, 입력 화면 시작값은 오늘 기준 기간을 쓴다
  const c = x.env.call(ATT, 'getExceptionContext', '2027-09-01');
  assert.strictEqual(c.term.id, t3.id);
  assert.deepStrictEqual(c.students, [], '등록이 없는 기간은 학생 목록이 비어 있다(이어받기·명단 올리기 먼저)');
  const l = x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-09-01', to: '2027-09-01' });
  assert.deepStrictEqual(l.groups, []);
});

/* ───── 홈 요약·주소 값 ───── */

test('홈 요약(getHomeData): 출결 담당은 요청 수·오늘/내일 인원, 학사 교사·담임은 내가 보낸 요청 상태', () => {
  const x = makeEnv();
  const att = x.env.call(ATT, 'getHomeData', 'attendance').exc;
  assert.deepStrictEqual([att.pending, att.today, att.tomorrow], [1, 3, 3], JSON.stringify(att));   // 가짜 시드: 요청 1건, 3월 3일 3명(병결·병조퇴·가정사유), 3월 4일 3명
  assert.strictEqual(att.canConfirm, true);
  const r = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  x.env.call(TEACHER, 'saveException', { studentId: x.mine[1].id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  const t0 = x.env.call(TEACHER, 'getHomeData', 'hall_teacher').exc;
  assert.deepStrictEqual(t0.mine, { requested: 2, confirmed: 0, canceled: 0 });
  assert.strictEqual(t0.canConfirm, false); assert.strictEqual(t0.pending, 0, '교사에게는 처리할 요청 수를 알려 주지 않는다');
  x.env.call(ATT, 'confirmException', x.term.id, r.groupId);
  x.env.call(TEACHER, 'cancelException', x.term.id, x.env.call(TEACHER, 'listExceptions', { scope: 'mine' }).groups.find((g) => g.status === '요청').groupId, '철회');
  assert.deepStrictEqual(x.env.call(TEACHER, 'getHomeData', 'hall_teacher').exc.mine, { requested: 0, confirmed: 1, canceled: 1 });
  assert.deepStrictEqual(x.env.call(HOMEROOM, 'getHomeData', 'homeroom').exc.mine, { requested: 0, confirmed: 0, canceled: 0 });
});

test('screenParams_: ?tab=·?date= 는 허용 목록·날짜 형식만 통과(주소창 값을 화면에 그대로 넘기지 않는다)', () => {
  const x = makeEnv();
  const run = (p) => x.env.as(ATT, (c) => c.screenParams_(p));
  assert.strictEqual(run({ tab: 'requests', date: '2027-03-03' }), '{"tab":"requests","date":"2027-03-03"}');
  assert.strictEqual(run({ tab: 'list' }), '{"tab":"list"}');
  assert.strictEqual(run({ tab: '<script>alert(1)</script>', date: '2027-03-03"};alert(1);//' }), '{}');
  assert.strictEqual(run({ tab: 'input' }), '{}');
  assert.strictEqual(run({}), '{}');
  assert.ok(!run({ tab: 'requests' }).includes('<'));
});
