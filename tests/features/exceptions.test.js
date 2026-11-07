/** C5 F1 사전 특이사항: R4 gas-fakes 환경(src 전체)에서 실제 공개 함수를 부른다. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
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
  const r = x.env.expectAllowed(TEACHER, 'saveException', { studentId: mine.id, from: '2027-03-18', blocks: 'ALL', type: '병결', reason: '' });
  assert.deepStrictEqual([r.ok, r.status], [true, '요청']);
  const row = x.tab().find((q) => q.group_id === r.groupId);
  assert.deepStrictEqual([row.status, row.requested_by, row.confirmed_by, row.confirmed_at], ['요청', TEACHER, '', '']);
  x.env.expectDenied(TEACHER, 'exception.save', 'saveException', { studentId: x.other.id, from: '2027-03-18', blocks: 'ALL', type: '병결' });
  x.env.expectDenied(TEACHER, 'exception.save', 'saveException', { studentId: x.acc.unenrolledStudentId, from: '2027-03-18', blocks: 'ALL', type: '병결' });
  // 담임: 자기 반 1번 학생은 허용, 다른 반은 거부
  const own = x.env.call(HOMEROOM, 'getExceptionContext').students[0];
  const hr = x.env.expectAllowed(HOMEROOM, 'saveException', { studentId: own.id, from: '2027-03-19', blocks: '20:00-22:00', type: '병지각' });
  assert.strictEqual(hr.status, '요청');
  const ownClass = (id) => { const s = x.students.find((q) => q.id === id); return s.grade + '-' + s.class_no; };
  const foreign = x.students.find((s) => x.enr.some((e) => e.student_id === s.id) && ownClass(s.id) !== ownClass(own.id));
  x.env.expectDenied(HOMEROOM, 'exception.save', 'saveException', { studentId: foreign.id, from: '2027-03-19', blocks: 'ALL', type: '병결' });
  // 쓰기는 하나도 늘지 않았다
  assert.strictEqual(x.tab().filter((q) => q.student_id === foreign.id && q.date === '2027-03-19').length, 0);
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
  assert.deepStrictEqual(fields(bad({ to: '2027-03-01' })), ['to']);
  assert.ok(bad({ to: '2027-03-01' }).errors[0].message.includes('종료일을 같은 날이나 뒤로'));
  assert.deepStrictEqual(fields(bad({ to: '2027-06-30' })), ['to'], '62일 초과');
  assert.deepStrictEqual(fields(bad({ from: '2030-01-01' })), ['from'], '운영 기간 밖');
  assert.deepStrictEqual(fields(bad({ from: '2027-07-10', to: '2027-07-25' })), ['to'], '기간이 끝나는 날을 넘음');
  assert.deepStrictEqual(fields(bad({ reason: 'ㄱ'.repeat(201) })), ['reason']);
  assert.strictEqual(x.tab().length, w, '아무것도 쓰지 않았다');
  assert.ok(x.env.errorOf(ATT, (c) => c.saveException({ from: '2027-03-04' })), '학생 없이 부르면 권한 검사에서 막힌다');
  // 없는 날짜(2/30)는 입력 검사까지 가지 못하고 권한 검사에서 거부된다("날짜 형식이 아닌 값" 시험 참고)
});

test('previewException: 겹치면 경고(확인하면 저장되어 두 건이 된다), 미인정 유형은 autoOut 안내, 아무것도 쓰지 않음', () => {
  const x = makeEnv();
  // 가짜 시드: 첫 학생에게 2027-03-03 전체 병결(확정)이 있다
  const stu = x.students.find((s) => x.tab().some((q) => q.date === '2027-03-03' && q.student_id === s.id && q.blocks === 'ALL'));
  const w = x.tab().length;
  const p = x.env.call(ATT, 'previewException', { studentId: stu.id, from: '2027-03-03', blocks: '18:00-20:00', type: '학원(보강 포함)' });
  assert.strictEqual(p.ok, true); assert.strictEqual(p.mode, 'confirm'); assert.strictEqual(p.dayCount, 1);
  assert.ok(p.warnings.length === 1 && p.warnings[0].includes('겹치는') && p.warnings[0].includes('병결'), JSON.stringify(p.warnings));
  assert.strictEqual(p.autoOut, false);
  const u = x.env.call(ATT, 'previewException', { studentId: x.first.id, from: '2027-03-30', blocks: 'ALL', type: '미인정결석' });
  assert.strictEqual(u.autoOut, true); assert.deepStrictEqual(u.warnings, []);
  assert.strictEqual(x.tab().length, w);
  // 겹쳐도 확인(confirmOverlap)하면 저장된다
  const s = x.env.call(ATT, 'saveException', { studentId: stu.id, from: '2027-03-03', blocks: '18:00-20:00', type: '학원(보강 포함)', confirmOverlap: true });
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
  assert.strictEqual(t.groups.length, all.groups.length, '결정 45: 학사 교사도 학사생 전체의 특이사항을 본다');
  assert.ok(t.groups.some((g) => !x.mine.some((m) => m.id === g.studentId)), '담당 아닌 학생 것도 포함');
  // 담당 아닌 학생의 누적도 본다(보기만) — 학사생이 아닌 학생은 거부
  x.env.expectAllowed(TEACHER, 'listExceptions', { scope: 'student', studentId: x.other.id });
  x.env.expectDenied(TEACHER, 'exception.view', 'listExceptions', { scope: 'student', studentId: x.acc.unenrolledStudentId });
  // 쓰기·선택 목록은 넓히지 않는다: 담당 아닌 학생 저장 거부, 입력 화면 학생 목록은 담당만
  x.env.expectDenied(TEACHER, 'exception.save', 'saveException', { studentId: x.other.id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  assert.ok(x.env.call(TEACHER, 'getExceptionContext').students.every((s) => x.mine.some((m) => m.id === s.id)));
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
  const hr = x.env.call(HOMEROOM, 'saveException', { studentId: otherReq.id, from: '2027-03-13', blocks: 'ALL', type: '병결' });
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
  // 입력 화면 시작값은 입력한 날짜가 속한 기간을 쓴다(오늘 기준 기간이 아니라)
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

/* ───── 총괄 1차 검토 반영(재현 → 수정) ───── */

/** 오늘 기준 기간(2026 2학기)에는 등록이 없고 다음 기간(2027 1학기)에만 등록된 신입생으로 만든다 */
function newcomers(x, ids) {
  const prev = x.env.rows('terms').find((t) => t.name.startsWith('2026'));
  x.env.rows('enrollments').filter((e) => e.term_id === prev.id && ids.indexOf(e.student_id) >= 0)
    .forEach((e) => x.env.asOwner((c) => c.updateRecord_('enrollments', e.id, { student_id: 'gone-' + e.student_id.slice(-4) }, 'owner@example.com')));
}

test('하루 카드 취소: 목록 카드는 묶음 전체 기간을 보이고, "이 날만 취소"는 그 날 행 하나만, 묶음 전체 취소는 모두 취소한다', () => {
  const x = makeEnv();
  const r = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-22', to: '2027-03-26', blocks: 'ALL', type: '병결' });
  const l = x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-03-23', to: '2027-03-23' });
  const g = l.groups.find((q) => q.groupId === r.groupId);
  assert.strictEqual(g.dates.length, 5, '카드에는 묶음 전체(3/22~3/26)가 보인다');
  assert.deepStrictEqual(g.rangeDates, ['2027-03-23']);
  const day = x.env.call(ATT, 'cancelException', x.term.id, r.groupId, '이 날은 출석', '2027-03-23');
  assert.deepStrictEqual(day, { ok: true, count: 1 });
  const rows = x.tab().filter((q) => q.group_id === r.groupId);
  assert.deepStrictEqual(rows.filter((q) => q.status === '취소').map((q) => q.date), ['2027-03-23']);
  assert.strictEqual(rows.filter((q) => q.status === '확정').length, 4, '나머지 4일은 그대로 한 묶음');
  assert.strictEqual(x.env.call(ATT, 'cancelException', x.term.id, r.groupId, '또', '2027-03-23').ok, false, '이미 취소된 날');
  assert.strictEqual(x.env.call(ATT, 'cancelException', x.term.id, r.groupId, '이 묶음에 없는 날', '2027-04-30').ok, false);
  const all = x.env.call(ATT, 'cancelException', x.term.id, r.groupId, '묶음 전체 취소');
  assert.deepStrictEqual(all, { ok: true, count: 4 });
  assert.ok(x.tab().filter((q) => q.group_id === r.groupId).every((q) => q.status === '취소'));
});

test('교사는 자기 요청의 한 날만 취소할 수 있다(남의 요청·확정은 거부)', () => {
  const x = makeEnv();
  const r = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-22', to: '2027-03-24', blocks: 'ALL', type: '병결' });
  assert.deepStrictEqual(x.env.expectAllowed(TEACHER, 'cancelException', x.term.id, r.groupId, '하루만 취소', '2027-03-23'), { ok: true, count: 1 });
  assert.deepStrictEqual(x.tab().filter((q) => q.group_id === r.groupId).map((q) => q.status), ['요청', '취소', '요청']);
  x.env.expectDenied(HOMEROOM, 'exception.cancel', 'cancelException', x.term.id, r.groupId, '남의 요청', '2027-03-22');
});

test('저장 범위 판정은 입력한 날짜의 기간으로: 2/26에 새 학기(3/2~) 학생 특이사항을 출결 담당·담당 교사가 넣을 수 있고, 그 기간 미등록 학생은 거부', () => {
  const x = makeEnv('2027-02-26T20:00:00');
  newcomers(x, [x.first.id, x.mine[0].id]);   // 이 둘은 지난 기간(오늘 기준 기간) 등록이 없는 신입생
  const input = (id) => ({ studentId: id, from: '2027-03-18', blocks: 'ALL', type: '병결' });
  assert.strictEqual(x.env.expectAllowed(ATT, 'saveException', input(x.first.id)).status, '확정', '다음 기간 신입생도 출결 담당이 입력');
  assert.strictEqual(x.env.expectAllowed(TEACHER, 'saveException', Object.assign(input(x.mine[0].id), { from: '2027-03-19' })).status, '요청', '담당 교사의 요청');
  x.env.expectDenied(TEACHER, 'exception.save', 'saveException', input(x.other.id));
  x.env.expectDenied(ATT, 'exception.save', 'saveException', input(x.acc.unenrolledStudentId));
  x.env.expectDenied(ATT, 'exception.save', 'previewException', input(x.acc.unenrolledStudentId));
  assert.strictEqual(x.env.expectAllowed(ATT, 'previewException', input(x.first.id)).ok, true);
});

test('다음 기간 날짜로 낸 요청·특이사항도 요청 처리 목록·홈 배지·내 요청에 바로 나온다(기간이 시작되기 전에도)', () => {
  const x = makeEnv('2027-02-26T20:00:00');
  newcomers(x, [x.mine[0].id]);
  const r = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-04', blocks: 'ALL', type: '병결' });
  assert.strictEqual(r.ok, true);
  const pend = x.env.call(ATT, 'listExceptions', { scope: 'pending' });
  const g = pend.groups.find((q) => q.groupId === r.groupId);
  assert.ok(g, '요청 처리 목록에 나온다'); assert.strictEqual(g.termId, x.term.id, '묶음마다 기간 id가 있어 확정·취소에 쓴다');
  assert.ok(x.env.call(ATT, 'getHomeData', 'attendance').exc.pending >= 1, '홈 배지');
  assert.deepStrictEqual(x.env.call(TEACHER, 'listExceptions', { scope: 'mine' }).groups.map((q) => q.groupId), [r.groupId]);
  assert.deepStrictEqual(x.env.call(TEACHER, 'getHomeData', 'hall_teacher').exc.mine, { requested: 1, confirmed: 0, canceled: 0 });
  assert.deepStrictEqual(x.env.expectAllowed(ATT, 'confirmException', g.termId, r.groupId), { ok: true, count: 1 });
});

test('이번 주가 기간 경계에 걸치면 두 기간의 탭을 모두 읽는다', () => {
  const x = makeEnv('2027-03-01T20:00:00');
  const prevTerm = x.env.rows('terms').filter((t) => t.end_date < x.term.start_date).sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];
  if (!prevTerm) return;   // 가짜 데이터에 직전 기간이 없으면 건너뛴다
  const r = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-02', blocks: 'ALL', type: '병결' });
  const l = x.env.call(ATT, 'listExceptions', { scope: 'range', from: prevTerm.end_date, to: '2027-03-03' });
  assert.ok(l.groups.some((g) => g.groupId === r.groupId));
});

test('저장은 담당·담임·출결·관리자만: 근무일(isOnDuty)이어도 담당 아닌 학생에게는 거부(F3 이후 대비, ASSUMPTION)', () => {
  const x = makeEnv();
  const as = (fn) => x.env.errorOf(TEACHER, (c) => { c.isOnDutyToday_ = () => true; return fn(c); });
  const input = { studentId: x.other.id, from: '2027-03-04', blocks: 'ALL', type: '병결' };
  const e1 = as((c) => c.saveException(input)), e2 = as((c) => c.previewException(input));
  assert.ok(e1 && /권한이 없습니다/.test(e1.message) && e2 && /권한이 없습니다/.test(e2.message), '근무일이어도 담당이 아니면 거부');
  assert.strictEqual(x.tab().filter((q) => q.student_id === x.other.id && q.date === '2027-03-04').length, 0);
  assert.strictEqual(x.env.errorOf(TEACHER, (c) => { c.isOnDutyToday_ = () => true; return c.saveException({ studentId: x.mine[0].id, from: '2027-03-04', blocks: 'ALL', type: '병결' }); }), null, '담당 학생은 그대로 가능');
});

test('겹침: 저장은 확인 플래그(confirmOverlap) 없이는 거부(쓰기 없음), 확인하면 저장 / 요청도 같다', () => {
  const x = makeEnv();
  const stu = x.students.find((s) => x.tab().some((q) => q.date === '2027-03-03' && q.student_id === s.id && q.blocks === 'ALL'));
  const input = { studentId: stu.id, from: '2027-03-03', blocks: '18:00-20:00', type: '학원(보강 포함)' };
  const w = x.tab().length;
  const r = x.env.call(ATT, 'saveException', input);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.needsConfirm, true); assert.ok(r.warnings.length === 1 && r.warnings[0].includes('겹치는'), JSON.stringify(r.warnings));
  assert.strictEqual(x.tab().length, w);
  const ok = x.env.call(ATT, 'saveException', Object.assign({ confirmOverlap: true }, input));
  assert.strictEqual(ok.ok, true); assert.strictEqual(x.tab().length, w + 1);
  // 겹치지 않으면 플래그 없이 저장
  assert.strictEqual(x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-31', blocks: '18:00-20:00', type: '병결' }).ok, true);
  // 담당 교사의 요청도 같은 검사
  const tInput = { studentId: x.mine[0].id, from: '2027-03-12', blocks: 'ALL', type: '병결' };
  x.env.call(ATT, 'saveException', Object.assign({ studentId: x.mine[0].id }, { from: '2027-03-12', blocks: 'ALL', type: '병결' }));
  const tr = x.env.call(TEACHER, 'saveException', tInput);
  assert.strictEqual(tr.ok, false); assert.strictEqual(tr.needsConfirm, true);
});

test('겹침 경고 문구에 유형과 블록이 나온다(미인정끼리 겹치면 OUT 2건이 될 수 있음)', () => {
  const x = makeEnv();
  x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-30', blocks: '20:00-22:00', type: '미인정지각' });
  const p = x.env.call(ATT, 'previewException', { studentId: x.first.id, from: '2027-03-30', blocks: '20:00-22:00', type: '미인정결석' });
  assert.ok(p.warnings[0].includes('이미 겹치는 특이사항이 있습니다') && p.warnings[0].includes('미인정지각') && p.warnings[0].includes('20:00-22:00'), p.warnings[0]);
  assert.strictEqual(p.autoOut, true);
});

test('확정 경로에도 겹침 경고: 겹치는 요청을 확정하려면 확인(acknowledge)이 필요하다', () => {
  const x = makeEnv();
  const sid = x.mine[0].id;
  x.env.call(ATT, 'saveException', { studentId: sid, from: '2027-03-12', blocks: '18:00-22:00', type: '병결' });
  const req = x.env.call(TEACHER, 'saveException', { studentId: sid, from: '2027-03-12', blocks: '20:00-24:00', type: '병조퇴', confirmOverlap: true });
  assert.strictEqual(req.ok, true);
  const no = x.env.call(ATT, 'confirmException', x.term.id, req.groupId);
  assert.strictEqual(no.ok, false); assert.strictEqual(no.needsConfirm, true); assert.ok(no.warnings.length >= 1);
  assert.ok(x.tab().filter((q) => q.group_id === req.groupId).every((q) => q.status === '요청'), '확정되지 않았다');
  assert.deepStrictEqual(x.env.call(ATT, 'confirmException', x.term.id, req.groupId, true), { ok: true, count: 1 });
  // 겹치지 않는 요청은 확인 없이 확정
  const r2 = x.env.call(TEACHER, 'saveException', { studentId: sid, from: '2027-03-13', blocks: 'ALL', type: '병결' });
  assert.deepStrictEqual(x.env.call(ATT, 'confirmException', x.term.id, r2.groupId), { ok: true, count: 1 });
});

test('요청자가 이미 확정된 요청을 취소하려 하면 권한 없음이 아니라 안내(거부 기록 없음), 남의 요청은 여전히 거부', () => {
  const x = makeEnv();
  const r = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  x.env.call(ATT, 'confirmException', x.term.id, r.groupId);
  const n = x.env.auditActions('denied:exception.cancel').length;
  const out = x.env.call(TEACHER, 'cancelException', x.term.id, r.groupId, '확정됐지만 취소하고 싶어요');
  assert.strictEqual(out.ok, false); assert.ok(out.error.includes('이미 확정되어 출결 담당만 취소할 수 있습니다'), out.error);
  assert.strictEqual(x.env.auditActions('denied:exception.cancel').length, n, '정상 안내라서 거부 기록을 남기지 않는다');
  assert.ok(x.tab().filter((q) => q.group_id === r.groupId).every((q) => q.status === '확정'));
  const other = x.env.call(HOMEROOM, 'getExceptionContext').students[0];
  const hr = x.env.call(HOMEROOM, 'saveException', { studentId: other.id, from: '2027-03-13', blocks: 'ALL', type: '병결' });
  x.env.expectDenied(TEACHER, 'exception.cancel', 'cancelException', x.term.id, hr.groupId, '남의 요청이라 거부');
});

test('확정은 그 기간에 등록된 학생만(등록 없는 학생의 요청은 확정 거부)', () => {
  const x = makeEnv();
  const r = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  x.env.as(ATT, (c) => c.updateRecord_(c.termSheetName_('exceptions', x.term.id), x.tab().find((q) => q.group_id === r.groupId).id, { status: '요청', student_id: x.acc.unenrolledStudentId }, ATT));
  const out = x.env.call(ATT, 'confirmException', x.term.id, r.groupId);
  assert.strictEqual(out.ok, false); assert.ok(out.error.includes('등록'));
});

test('홈 요약·화면 값: 담임 홈은 학생별 요청 수(perStudent), 오늘 인원은 목록 인원과 같은 기준, ?student=은 UUID 모양만 통과', () => {
  const x = makeEnv();
  const own = x.env.call(HOMEROOM, 'getExceptionContext').students[0];
  x.env.call(HOMEROOM, 'saveException', { studentId: own.id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  const h = x.env.call(HOMEROOM, 'getHomeData', 'homeroom').exc;
  assert.deepStrictEqual(h.perStudent, { [own.id]: 1 });
  const list = x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-03' });
  const distinct = new Set(list.groups.map((g) => g.studentId)).size;
  assert.strictEqual(x.env.call(ATT, 'getHomeData', 'attendance').exc.today, distinct, '홈 "오늘 N명"과 목록 "N명"이 같다');
  const run = (p) => x.env.as(ATT, (c) => c.screenParams_(p));
  assert.strictEqual(run({ tab: 'mine' }), '{"tab":"mine"}');
  assert.strictEqual(run({ tab: 'list', student: own.id }), JSON.stringify({ tab: 'list', student: own.id }));
  assert.strictEqual(run({ student: '<b>x</b>' }), '{}');
  assert.strictEqual(x.env.call(ATT, 'getExceptionContext', '2027-03-22').date, '2027-03-22', '?date=가 입력 날짜가 된다');
});

/* ───── 총괄 2차 검토 반영(재현 → 수정) ───── */

const termTab = (x, term) => x.env.rows('exceptions_' + term.id.slice(0, 8));
const prevTermOf = (x) => x.env.rows('terms').find((t) => t.name.startsWith('2026'));
const setEnr = (x, studentId, termId, patch) => {
  const e = x.env.rows('enrollments').find((q) => q.student_id === studentId && q.term_id === termId);
  x.env.asOwner((c) => c.updateRecord_('enrollments', e.id, patch, ADMIN));
};

test('공백 우회 차단: 날짜에 공백을 붙여도 저장과 같은 날짜(trim)로 범위를 판정한다 — 다음 기간 담당이 바뀐 학생은 거부', () => {
  const x = makeEnv('2027-02-26T20:00:00');
  const sid = x.mine[0].id;
  setEnr(x, sid, x.term.id, { teacher_email: 'someone.else@example.com' });   // 오늘 기준 기간(2026 2학기)에는 담당이지만 다음 기간에는 아니다
  const w = termTab(x, x.term).length;
  for (const from of ['2027-03-18', ' 2027-03-18', '2027-03-18 ']) {
    x.env.expectDenied(TEACHER, 'exception.save', 'saveException', { studentId: sid, from, blocks: 'ALL', type: '병결' });
    x.env.expectDenied(TEACHER, 'exception.save', 'previewException', { studentId: sid, from, blocks: 'ALL', type: '병결' });
  }
  assert.strictEqual(termTab(x, x.term).length, w, '아무것도 쓰지 않았다');
});

test('날짜 형식이 아닌 값이 오면 오늘로 대신하지 않고 거부한다(Auth)', () => {
  const x = makeEnv();
  for (const from of ['2027-02-30', 'abc', '2027/03/18']) {
    x.env.expectDenied(TEACHER, 'exception.save', 'saveException', { studentId: x.mine[0].id, from, blocks: 'ALL', type: '병결' });
  }
  assert.ok(x.env.call(TEACHER, 'previewException', { studentId: x.mine[0].id, blocks: 'ALL', type: '병결' }).errors.some((e) => e.field === 'from'), '날짜가 비면(ymd 없음) 입력 검사가 안내');
});

test('오늘 기간에는 등록돼 있고 다음 기간에는 미등록인 학생은 다음 기간 날짜로 저장할 수 없다(출결 담당·관리자 모두)', () => {
  const x = makeEnv('2027-02-26T20:00:00');
  setEnr(x, x.first.id, x.term.id, { student_id: 'gone-' + x.first.id.slice(-4) });   // 다음 기간(2027 1학기) 등록만 지운다
  const input = { studentId: x.first.id, from: '2027-03-18', blocks: 'ALL', type: '병결' };
  x.env.expectDenied(ATT, 'exception.save', 'saveException', input);
  const r = x.env.call(ADMIN, 'saveException', input);   // 관리자는 권한은 있지만 그 기간 명단에 없으면 저장하지 않는다
  assert.strictEqual(r.ok, false); assert.strictEqual(r.errors[0].field, 'studentId');
  assert.strictEqual(x.env.call(ADMIN, 'previewException', input).ok, false);
});

test('관리자도 그 기간 미등록 학생에게는 저장 거부(목록에 안 보여 취소할 수 없는 기록이 되지 않게)', () => {
  const x = makeEnv();
  const w = x.tab().length;
  const r = x.env.call(ADMIN, 'saveException', { studentId: x.acc.unenrolledStudentId, from: '2027-03-18', blocks: 'ALL', type: '병결' });
  assert.deepStrictEqual([r.ok, r.errors[0].field], [false, 'studentId']);
  assert.strictEqual(x.tab().length, w);
});

test('기간 경계에 걸친 주는 두 기간의 탭을 모두 읽는다(양쪽 기록이 함께 나온다)', () => {
  const x = makeEnv('2027-02-27T20:00:00');
  const prev = prevTermOf(x);
  const a = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-02-27', blocks: 'ALL', type: '병결' });
  const b = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-02', blocks: 'ALL', type: '병결' });
  assert.ok(a.ok && b.ok);
  assert.ok(termTab(x, prev).some((q) => q.group_id === a.groupId) && termTab(x, x.term).some((q) => q.group_id === b.groupId), '서로 다른 탭에 저장됨');
  const ids = x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-02-27', to: '2027-03-03' }).groups.map((g) => g.groupId);
  assert.ok(ids.includes(a.groupId) && ids.includes(b.groupId), JSON.stringify(ids));
});

test('"오늘 N명"은 살아 있는 행만: 취소된 묶음·취소된 날은 목록에서도 홈에서도 세지 않고 두 숫자가 같다', () => {
  const x = makeEnv();
  const liveStudents = (s) => new Set(x.env.call(ATT, 'listExceptions', { scope: 'range', from: s, to: s }).groups.filter((g) => g.status !== '취소' && !g.rangeCanceled).map((g) => g.studentId)).size;
  const home = () => x.env.call(ATT, 'getHomeData', 'attendance').exc.today;
  assert.strictEqual(liveStudents('2027-03-03'), home());
  const r = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-03', to: '2027-03-04', blocks: '20:00-22:00', type: '병결', confirmOverlap: true });
  assert.strictEqual(liveStudents('2027-03-03'), home());
  x.env.call(ATT, 'cancelException', x.term.id, r.groupId, '하루만 취소', '2027-03-03');
  assert.strictEqual(liveStudents('2027-03-03'), home());
  const gview = x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-03' }).groups.find((g) => g.groupId === r.groupId);
  assert.strictEqual(gview.rangeCanceled, true, '그날 행은 취소 — 화면은 이 값으로 센다');
});

test('홈 요청 배지는 요청 처리 목록과 같은 기준(그 기간 명단에 있는 학생만)', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.appendRecord_(c.termSheetName_('exceptions', x.term.id), {
    term_id: x.term.id, group_id: 'g-ghost', student_id: x.acc.unenrolledStudentId, date: '2027-03-20', blocks: 'ALL', type: '병결', reason: '',
    status: '요청', requested_by: TEACHER, requested_at: '2027-03-03T10:00:00', confirmed_by: '', confirmed_at: '', cancel_reason: ''
  }, ADMIN));
  const list = x.env.call(ATT, 'listExceptions', { scope: 'pending' }).groups;
  assert.strictEqual(x.env.call(ATT, 'getHomeData', 'attendance').exc.pending, list.length);
  assert.ok(!list.some((g) => g.groupId === 'g-ghost'));
});

/* ───── 총괄 3차 검증 반영(재현 → 수정) ───── */

test('공백·제어문자·다른 자료형 날짜로도 권한 판정을 우회할 수 없다(저장·미리보기 모두 거부, 쓰기 0건)', () => {
  const x = makeEnv('2027-02-26T20:00:00');
  const sid = x.mine[0].id;
  setEnr(x, sid, x.term.id, { teacher_email: 'someone.else@example.com' });
  const w = termTab(x, x.term).length;
  const dates = ['\t2027-03-18', '2027-03-18\n', ' 2027-03-18', '2027-03-18　', ' 2027-03-18 ', { toString: () => '2027-03-18' }, ['2027-03-18'], 20270318, true];
  for (const from of dates) {
    for (const fn of ['saveException', 'previewException']) {
      const err = x.env.errorOf(TEACHER, (c) => c[fn]({ studentId: sid, from, blocks: 'ALL', type: '병결' }));
      assert.ok(err && /권한이 없습니다/.test(err.message) || (err && /날짜/.test(err.message)), fn + ' ' + JSON.stringify(from) + ' → ' + (err && err.message));
    }
  }
  assert.strictEqual(termTab(x, x.term).length, w);
});

test('"오늘 N명": 하루만 취소하면 목록(liveStudentCount)과 홈이 정확히 같은 숫자로 줄어든다(가짜 시드 3/3 = 3명)', () => {
  const x = makeEnv();
  const lst = () => x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-03' }).liveStudentCount;
  const home = () => x.env.call(ATT, 'getHomeData', 'attendance').exc.today;
  assert.deepStrictEqual([lst(), home()], [3, 3]);
  const other = x.students.find((s) => !x.tab().some((q) => q.student_id === s.id && q.date === '2027-03-03') && x.enr.some((e) => e.student_id === s.id) && s.id !== x.late);
  const r = x.env.call(ATT, 'saveException', { studentId: other.id, from: '2027-03-03', to: '2027-03-04', blocks: '20:00-22:00', type: '병결' });
  assert.deepStrictEqual([lst(), home()], [4, 4], '다른 학생이 3/3~3/4 저장 → 4명');
  x.env.call(ATT, 'cancelException', x.term.id, r.groupId, '3/3만 취소', '2027-03-03');
  assert.deepStrictEqual([lst(), home()], [3, 3], '3/3만 취소 → 묶음은 살아 있어도 3/3은 3명');
  assert.strictEqual(x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-03-04', to: '2027-03-04' }).liveStudentCount, x.env.call(ATT, 'getHomeData', 'attendance').exc.tomorrow);
  x.env.call(ATT, 'cancelException', x.term.id, r.groupId, '나머지도 취소');
  assert.deepStrictEqual([lst(), home()], [3, 3]);
});

test('끝난 기간 묶음 카드는 확정·취소 버튼이 꺼진다(canConfirm·canCancel false) — 눌러도 늘 거부되는 버튼을 보이지 않는다', () => {
  const x = makeEnv();
  const req = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  x.env.setNow('2027-08-01T10:00:00');
  const g = x.env.call(ATT, 'listExceptions', { scope: 'student', studentId: x.mine[0].id, termId: x.term.id }).groups.find((q) => q.groupId === req.groupId);
  assert.ok(g && g.status === '요청'); assert.deepStrictEqual([g.canConfirm, g.canCancel], [false, false]);
  const mine = x.env.call(TEACHER, 'listExceptions', { scope: 'student', studentId: x.mine[0].id, termId: x.term.id }).groups.find((q) => q.groupId === req.groupId);
  assert.deepStrictEqual([mine.canConfirm, mine.canCancel], [false, false]);
});

test('끝난 운영 기간은 보기만: 저장·미리보기·확정·취소 모두 거부 안내(쓰기 0건)', () => {
  const x = makeEnv();   // 3/3
  const req = x.env.call(TEACHER, 'saveException', { studentId: x.mine[0].id, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  const conf = x.env.call(ATT, 'saveException', { studentId: x.first.id, from: '2027-03-15', blocks: 'ALL', type: '병결' });
  x.env.setNow('2027-08-01T10:00:00');   // 2027 1학기 종료(7/17) 뒤
  const w = x.tab().length, snap = JSON.stringify(x.tab());
  const input = { studentId: x.first.id, from: '2027-07-10', blocks: 'ALL', type: '병결' };
  for (const who of [ATT, ADMIN]) {
    const s = x.env.call(who, 'saveException', input), p = x.env.call(who, 'previewException', input);
    assert.deepStrictEqual([s.ok, s.errors[0].field], [false, 'from']); assert.ok(s.errors[0].message.includes('끝난 운영 기간'));
    assert.strictEqual(p.ok, false);
  }
  const c = x.env.call(ATT, 'confirmException', x.term.id, req.groupId), k = x.env.call(ATT, 'cancelException', x.term.id, conf.groupId, '끝난 기간 취소');
  assert.ok(!c.ok && c.error.includes('끝난 운영 기간') && !k.ok && k.error.includes('끝난 운영 기간'));
  assert.strictEqual(x.tab().length, w); assert.strictEqual(JSON.stringify(x.tab()), snap);
});

test('범위 밖·특수 학생 id(constructor·__proto__)로 학생별 목록을 불러도 거부되고 거부 기록이 남는다', () => {
  const x = makeEnv();
  for (const who of [ATT, TEACHER, HOMEROOM]) {
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      x.env.expectDenied(who, 'exception.view', 'listExceptions', { scope: 'student', studentId: id });
    }
  }
});

test('넓은 보기는 그 기록이 속한 기간에 등록된 학생만: 그 기간 등록이 없는 학생은 목록·학생별 모두 안 보인다', () => {
  const x = makeEnv();
  const sid = x.other.id;   // 담당이 아닌 학생
  const g = x.env.call(ATT, 'saveException', { studentId: sid, from: '2027-03-12', blocks: 'ALL', type: '병결' });
  const range = () => x.env.call(TEACHER, 'listExceptions', { scope: 'range', from: '2027-03-12', to: '2027-03-12' }).groups.map((q) => q.groupId);
  assert.ok(range().includes(g.groupId), '그 기간 등록 학생이면 담당이 아니어도 보인다');
  x.env.expectAllowed(TEACHER, 'listExceptions', { scope: 'student', studentId: sid, termId: x.term.id });
  setEnr(x, sid, x.term.id, { student_id: 'gone-' + sid.slice(-4) });   // 이 기간 등록에서 빠진다(다른 기간에만 등록된 학생과 같은 상황)
  assert.ok(!range().includes(g.groupId), '이 기간 등록이 없으면 목록에서 빠진다');
  x.env.expectDenied(TEACHER, 'exception.view', 'listExceptions', { scope: 'student', studentId: sid, termId: x.term.id });
  assert.ok(!x.env.call(TEACHER, 'getExceptionContext').viewStudents.some((s) => s.id === sid));
  // 다른 기간에만 등록된 학생: 직전 기간에만 있고 이번 기간에는 없는 학생은 이번 기간 기준으로는 거부, 직전 기간 기준으로는 허용
  const prev = prevTermOf(x), inPrev = (id, t) => x.env.rows('enrollments').some((e) => e.term_id === t.id && e.student_id === id);
  const prevOnly = x.env.rows('enrollments').find((e) => e.term_id === prev.id && !inPrev(e.student_id, x.term) && e.student_id !== x.acc.unenrolledStudentId);
  if (prevOnly) {
    x.env.expectDenied(TEACHER, 'exception.view', 'listExceptions', { scope: 'student', studentId: prevOnly.student_id, termId: x.term.id });
    x.env.expectAllowed(TEACHER, 'listExceptions', { scope: 'student', studentId: prevOnly.student_id, termId: prev.id });
  }
});

test('담임은 넓어지지 않는다: 목록은 자기 반 학생만(출결 담당보다 적다), 다른 반 학생 학생별 보기는 거부, viewStudents도 자기 반만', () => {
  const x = makeEnv();
  const all = x.env.call(ATT, 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-09' });
  const h = x.env.call(HOMEROOM, 'listExceptions', { scope: 'range', from: '2027-03-03', to: '2027-03-09' });
  const cls = new Set(x.env.call(HOMEROOM, 'getExceptionContext').viewStudents.map((s) => s.id));
  assert.ok(cls.size > 0 && h.groups.length < all.groups.length, '담임 목록은 출결 담당보다 적다');
  assert.ok(h.groups.every((g) => cls.has(g.studentId)), '자기 반 학생 것만');
  const outside = x.students.find((s) => x.enr.some((e) => e.student_id === s.id) && !cls.has(s.id));
  x.env.expectDenied(HOMEROOM, 'exception.view', 'listExceptions', { scope: 'student', studentId: outside.id });
  assert.deepStrictEqual(x.env.call(HOMEROOM, 'getExceptionContext').students.map((s) => s.id).sort(), Array.from(cls).sort());
});

test('getExceptionContext: 학사 교사의 viewStudents(학생별 보기용)에는 담당 아닌 학생이 있고, 입력용 students에는 없다', () => {
  const x = makeEnv();
  const c = x.env.call(TEACHER, 'getExceptionContext');
  assert.ok(c.viewStudents.some((s) => s.id === x.other.id));
  assert.ok(!c.students.some((s) => s.id === x.other.id));
  assert.ok(c.students.every((s) => x.mine.some((m) => m.id === s.id)));
  assert.ok(c.viewStudents.length > c.students.length);
  const a = x.env.call(ATT, 'getExceptionContext');
  assert.deepStrictEqual(a.viewStudents, a.students, '출결 담당은 둘이 같다');
});

test('남의 묶음에 onlyDate를 줘도(없는 날짜여도) 소유 검사가 먼저라 거부 기록이 남는다', () => {
  const x = makeEnv();
  const own = x.env.call(HOMEROOM, 'getExceptionContext').students[0];
  const hr = x.env.call(HOMEROOM, 'saveException', { studentId: own.id, from: '2027-03-13', blocks: 'ALL', type: '병결' });
  for (const day of ['2027-03-13', '2099-01-01', '']) {
    x.env.expectDenied(TEACHER, 'exception.cancel', 'cancelException', x.term.id, hr.groupId, '남의 묶음이라 거부', day);
  }
  assert.ok(x.tab().filter((q) => q.group_id === hr.groupId).every((q) => q.status === '요청'));
});

test('빈 groupId는 거부: group_id가 빈 여러 학생 행이 한꺼번에 확정·취소되지 않는다', () => {
  const x = makeEnv();
  const add = (sid, date) => x.env.asOwner((c) => c.appendRecord_(c.termSheetName_('exceptions', x.term.id), {
    term_id: x.term.id, group_id: '', student_id: sid, date, blocks: 'ALL', type: '병결', reason: '', status: '요청', requested_by: TEACHER,
    requested_at: '2027-03-03T10:00:00', confirmed_by: '', confirmed_at: '', cancel_reason: ''
  }, ADMIN));
  add(x.first.id, '2027-03-21'); add(x.mine[1].id, '2027-03-22');
  const snap = JSON.stringify(x.tab());
  for (const gid of ['', '  ']) {
    assert.strictEqual(x.env.call(ATT, 'confirmException', x.term.id, gid).ok, false);
    assert.strictEqual(x.env.call(ATT, 'cancelException', x.term.id, gid, '빈 묶음 취소').ok, false);
  }
  for (const gid of [undefined, null]) {   // 자료형이 없는 값은 공개 호출 경계 밖에서 직접
    assert.strictEqual(plain(x.env.as(ATT, (c) => c.confirmException(x.term.id, gid))).ok, false);
    assert.strictEqual(plain(x.env.as(ATT, (c) => c.cancelException(x.term.id, gid, '빈 묶음 취소'))).ok, false);
  }
  assert.strictEqual(JSON.stringify(x.tab()), snap);
});

test('거부 기록(logDenied_): 상세는 500자로 자르고, 쓰기에 실패하면 10분 제한 캐시를 두지 않아 다음 거부는 기록된다', () => {
  const x = makeEnv();
  const huge = 'ㄱ'.repeat(60000);
  const n = x.env.auditActions('denied:exception.save').length;
  x.env.expectDenied(STUDENT, 'exception.save', 'saveException', { studentId: huge, from: '2027-03-04', blocks: 'ALL', type: '병결' });
  const rows = x.env.rows('audit_log').filter((r) => r.action === 'denied:exception.save');
  assert.strictEqual(rows.length, n + 1);
  assert.ok(rows[rows.length - 1].detail.length <= 500, '상세 길이 ' + rows[rows.length - 1].detail.length);
  // 기록 쓰기가 한 번 실패해도 같은 계정의 다음 거부는 10분 안이라도 기록된다
  const y = makeEnv();
  Object.keys(y.env.cache).filter((k) => k.indexOf('script:deny:') === 0).forEach((k) => delete y.env.cache[k]);
  y.env.as(STUDENT, (c) => { c.writeAudit_ = () => { throw new Error('감사 쓰기 실패(가짜)'); }; c.logDenied_(STUDENT, 'exception.save', '실패하는 기록'); });
  const before = y.env.auditActions('denied:exception.save').length;
  y.env.as(STUDENT, (c) => c.logDenied_(STUDENT, 'exception.save', '두 번째'));
  assert.strictEqual(y.env.auditActions('denied:exception.save').length, before + 1, '실패한 기록 때문에 10분 동안 막히지 않는다');
});
