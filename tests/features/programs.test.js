/** C28 학사 프로그램 + 참가자 → 사전 특이사항('학사 내 프로그램') 일괄 생성·함께 취소. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', T1 = 'test.teacher@example.com', ATT = 'test.attendance@example.com', DUTY = 'test.duty@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const DATE = '2027-03-08';
const TYPE_BASE = '학사 내 프로그램';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T12:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const late = env.rows('status_changes').find((c) => c.item === '학사' && c.effective_date === '2027-03-15').student_id;
  const students = env.rows('students').filter((s) => s.id !== late && enr.some((e) => e.student_id === s.id));
  const exTab = () => (env.rows('exceptions_' + term.id.slice(0, 8)) || []);
  const mails = [];
  return { env, term, enr, students, late, exTab, mails };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const input = (x, o) => Object.assign({ name: '파워클래스 특강', date: DATE, blocks: 'ALL', memo: '', studentIds: [x.students[0].id, x.students[1].id, x.students[2].id] }, o || {});
const progExc = (x) => x.exTab().filter((r) => String(r.type).startsWith(TYPE_BASE));
const counts = (x) => [x.env.rows('programs').length, x.env.rows('program_participants').length, progExc(x).length];

test('권한: 쓰기 5개는 관리자·학사 교사만(denied:program.edit), 보기 2개는 출결 담당까지(denied:program.view). 거부된 호출은 아무것도 쓰지 않는다', () => {
  const x = makeEnv();
  const p = call(x, ADMIN, 'saveProgram', input(x));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  const before = counts(x);
  for (const who of [ATT, DUTY, HOMEROOM, STUDENT, PARENT]) {
    x.env.expectDenied(who, 'program.edit', 'previewProgram', input(x, { name: '다른 것' }));
    x.env.expectDenied(who, 'program.edit', 'saveProgram', input(x, { name: '다른 것' }));
    x.env.expectDenied(who, 'program.edit', 'cancelProgram', p.id, '사유 두 글자');
    x.env.expectDenied(who, 'program.edit', 'addProgramStudents', p.id, [x.students[3].id]);
    x.env.expectDenied(who, 'program.edit', 'removeProgramStudent', p.id, x.students[0].id, '사유 두 글자');
  }
  for (const who of [DUTY, HOMEROOM, STUDENT, PARENT]) {
    x.env.expectDenied(who, 'program.view', 'getProgramContext', DATE);
    x.env.expectDenied(who, 'program.view', 'listPrograms', {});
  }
  assert.deepStrictEqual(counts(x), before);
  for (const who of [ADMIN, T1, ATT]) { x.env.expectAllowed(who, 'getProgramContext', DATE); x.env.expectAllowed(who, 'listPrograms', {}); }
  x.env.expectAllowed(T1, 'previewProgram', input(x, { name: '학사 교사 미리보기' }));
});

test('saveProgram: 프로그램 1 + 참가자 N + 확정 특이사항 N(유형·날짜·블록·묶음은 학생마다), 참가자 행이 그 특이사항 id를 갖고, 만든 사람·audit이 남고 메일은 없다', () => {
  const x = makeEnv();
  const sent = [];
  const r = plain(x.env.as(T1, (c) => { c.MailApp = { sendEmail(to) { sent.push(to); }, getRemainingDailyQuota: () => 100 }; return c.saveProgram(input(x, { blocks: '19:00-20:30', memo: '외부 강사' })); }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.count, 3);
  assert.deepStrictEqual(counts(x), [1, 3, 3]);
  const prog = x.env.rows('programs')[0];
  assert.deepStrictEqual([prog.name, prog.date, prog.blocks, prog.memo, prog.status, prog.created_by], ['파워클래스 특강', DATE, '19:00-20:30', '외부 강사', '유효', T1]);
  const ex = progExc(x);
  assert.ok(ex.every((e) => e.type.startsWith(TYPE_BASE) && e.status === '확정' && e.date === DATE && e.blocks === '19:00-20:30' && e.reason === '프로그램: 파워클래스 특강' && e.confirmed_by === T1 && e.term_id === x.term.id));
  assert.strictEqual(new Set(ex.map((e) => e.group_id)).size, 3, '묶음은 학생마다');
  const people = x.env.rows('program_participants');
  assert.deepStrictEqual(people.map((p) => p.exception_id).sort(), ex.map((e) => e.id).sort());
  people.forEach((p) => { assert.strictEqual(p.program_id, prog.id); assert.strictEqual(p.status, '유효'); assert.strictEqual(ex.find((e) => e.id === p.exception_id).student_id, p.student_id); });
  assert.ok(x.env.rows('audit_log').some((a) => a.action === 'bulk_create' && ex.every((e) => JSON.stringify(a).includes(e.id))), '특이사항 만든 행 id가 audit에 남는다');
  assert.deepStrictEqual(sent, [], '메일 없음');
  // 출석부 칸에 약어가 나온다
  const sheet = JSON.stringify(plain(x.env.call(ADMIN, 'getAttendanceSheet', DATE)));
  assert.ok(sheet.includes('내부'), '출석부에 내부');
});

test('입력 검사: 이름·날짜·기간·블록·참가자·명단 밖 학생 오류는 아무것도 쓰지 않는다 (미리보기와 저장이 같은 오류)', () => {
  const x = makeEnv();
  const cases = [
    [{ name: '  ' }, 'name', /이름/], [{ name: 'ㄱ'.repeat(61) }, 'name', /60자/], [{ date: '2027-13-40' }, 'date', /날짜/], [{ date: '2030-01-01' }, 'date', /운영 기간/],
    [{ blocks: '99:00-10:00' }, 'blocks', /시간/], [{ studentIds: [] }, 'studentIds', /한 명 이상/], [{ memo: 'ㄱ'.repeat(201) }, 'memo', /200자/]
  ];
  for (const [o, field, re] of cases) {
    for (const fn of ['previewProgram', 'saveProgram']) {
      const r = call(x, ADMIN, fn, input(x, o));
      assert.strictEqual(r.ok, false, fn + JSON.stringify(o));
      assert.ok(r.errors.some((e) => e.field === field && re.test(e.message)), fn + ' ' + JSON.stringify(r.errors));
    }
  }
  const outsider = x.env.rows('students').find((s) => !x.enr.some((e) => e.student_id === s.id)) || null;
  if (outsider) assert.ok(call(x, ADMIN, 'saveProgram', input(x, { studentIds: [outsider.id] })).errors[0].message.includes('명단에 없습니다'));
  assert.strictEqual(call(x, ADMIN, 'saveProgram', input(x, { studentIds: ['no-such'] })).ok, false);
  assert.deepStrictEqual(counts(x), [0, 0, 0]);
});

test('같은 날짜·같은 이름은 두 번 만들지 않는다(재시도·두 번 누르기), 이름이 다르면 만들 수 있다', () => {
  const x = makeEnv();
  assert.strictEqual(call(x, ADMIN, 'saveProgram', input(x)).ok, true);
  const again = call(x, ADMIN, 'saveProgram', input(x));
  assert.strictEqual(again.ok, false); assert.match(again.errors[0].message, /이미 있습니다/);
  assert.strictEqual(call(x, ADMIN, 'previewProgram', input(x)).ok, false);
  assert.deepStrictEqual(counts(x), [1, 3, 3]);
  assert.strictEqual(call(x, ADMIN, 'saveProgram', Object.assign(input(x, { name: '면접 특강' }), { confirmOverlap: true })).ok, true, '같은 학생의 다른 프로그램은 겹침 경고 뒤 저장');
});

test('겹치는 확정 특이사항이 있으면 확인 없이는 저장하지 않고(needsConfirm), 확인하면 저장된다', () => {
  const x = makeEnv();
  const sid = x.students[0].id;
  assert.strictEqual(call(x, ATT, 'saveException', { studentId: sid, from: DATE, to: DATE, blocks: 'ALL', type: '병결', reason: '' }).ok, true);
  const before = counts(x);
  const r = call(x, ADMIN, 'saveProgram', input(x));
  assert.deepStrictEqual([r.ok, r.needsConfirm], [false, true]);
  assert.deepStrictEqual(r.warnings, ['1명은 같은 시간에 다른 특이사항이 있습니다. 그대로 두고 프로그램 특이사항을 따로 만듭니다.']);
  assert.deepStrictEqual([call(x, ADMIN, 'previewProgram', input(x)).overlap, call(x, ADMIN, 'previewProgram', input(x)).inactive], [1, 0]);
  assert.deepStrictEqual(counts(x), before);
  const ok = call(x, ADMIN, 'saveProgram', Object.assign(input(x), { confirmOverlap: true }));
  assert.strictEqual(ok.ok, true, JSON.stringify(ok));
  assert.strictEqual(progExc(x).length, 3);
});

test('cancelProgram: 사유 필수, 프로그램·참가자·아직 살아 있는 특이사항이 함께 취소되고(지우지 않음), 따로 취소된 특이사항 사유는 그대로, 다시 취소하면 안내', () => {
  const x = makeEnv();
  const p = call(x, ADMIN, 'saveProgram', input(x));
  const ex = progExc(x);
  // 한 명의 특이사항은 먼저 특이사항 화면에서 따로 취소
  assert.strictEqual(call(x, ATT, 'cancelException', x.term.id, ex[0].group_id, '본인 사정으로 빠짐').ok, true);
  assert.strictEqual(call(x, ADMIN, 'cancelProgram', p.id, '가').ok, false);
  assert.strictEqual(call(x, ADMIN, 'cancelProgram', p.id, '').ok, false);
  assert.strictEqual(call(x, ADMIN, 'cancelProgram', 'no-such', '강사 사정으로 취소').ok, false);
  assert.deepStrictEqual(counts(x), [1, 3, 3]);
  const r = call(x, T1, 'cancelProgram', p.id, '강사 사정으로 취소');
  assert.deepStrictEqual([r.ok, r.count, r.canceledExceptions], [true, 3, 2]);
  const prog = x.env.rows('programs')[0];
  assert.strictEqual(prog.status, '취소'); assert.match(prog.memo, /\[취소\] 강사 사정으로 취소/);
  assert.deepStrictEqual(x.env.rows('program_participants').map((q) => q.status), ['취소', '취소', '취소']);
  const after = progExc(x);
  assert.deepStrictEqual(after.map((e) => e.status), ['취소', '취소', '취소']);
  assert.strictEqual(after.find((e) => e.id === ex[0].id).cancel_reason, '본인 사정으로 빠짐', '먼저 따로 취소된 사유는 그대로');
  assert.ok(after.filter((e) => e.id !== ex[0].id).every((e) => e.cancel_reason === '프로그램 취소: 강사 사정으로 취소'));
  assert.ok(x.env.rows('audit_log').some((a) => /programs/.test(JSON.stringify(a)) && /취소/.test(JSON.stringify(a))), 'audit');
  const again = call(x, ADMIN, 'cancelProgram', p.id, '다시 취소');
  assert.strictEqual(again.ok, false); assert.match(again.error, /이미 취소/);
  assert.strictEqual(JSON.stringify(plain(x.env.call(ADMIN, 'getAttendanceSheet', DATE))).includes('내부'), false, '취소 뒤 출석부에 내부가 없다');
});

test('참가자 더하기·빼기: 더하면 그 학생 특이사항이 생기고 이미 참가 중이면 건너뛰며, 빼면 그 학생 것만 취소된다', () => {
  const x = makeEnv();
  const p = call(x, ADMIN, 'saveProgram', input(x));
  const add = call(x, T1, 'addProgramStudents', p.id, [x.students[2].id, x.students[3].id]);
  assert.deepStrictEqual([add.ok, add.count, add.skipped], [true, 1, 1]);
  assert.deepStrictEqual(counts(x), [1, 4, 4]);
  assert.strictEqual(call(x, ADMIN, 'addProgramStudents', p.id, [x.students[3].id]).count, 0, '모두 참가 중이면 0건');
  assert.strictEqual(call(x, ADMIN, 'addProgramStudents', p.id, []).ok, false);
  assert.strictEqual(call(x, ADMIN, 'addProgramStudents', 'no-such', [x.students[4].id]).ok, false);
  assert.strictEqual(call(x, ADMIN, 'removeProgramStudent', p.id, x.students[3].id, '짧').ok, false);
  const rm = call(x, ADMIN, 'removeProgramStudent', p.id, x.students[3].id, '참가하지 않기로 함');
  assert.deepStrictEqual([rm.ok, rm.canceledExceptions], [true, 1]);
  const gone = x.env.rows('program_participants').find((q) => q.student_id === x.students[3].id);
  assert.strictEqual(gone.status, '취소');
  assert.strictEqual(progExc(x).find((e) => e.id === gone.exception_id).status, '취소');
  assert.strictEqual(progExc(x).filter((e) => e.status === '확정').length, 3);
  assert.strictEqual(call(x, ADMIN, 'removeProgramStudent', p.id, x.students[3].id, '다시 빼기').ok, false, '이미 빠짐');
  // 다시 넣으면 새 참가자 행 + 새 특이사항(옛 행은 그대로 취소로 남음)
  assert.strictEqual(call(x, ADMIN, 'addProgramStudents', p.id, [x.students[3].id]).count, 1);
  assert.deepStrictEqual(counts(x), [1, 5, 5]);
});

test('입실 상태가 아닌 학생은 경고(막지 않음): 그날 학사 입실이 아니면 확인 뒤에만 저장', () => {
  const x = makeEnv();
  const lateS = x.env.rows('students').find((s) => s.id === x.late);
  const r = call(x, ADMIN, 'saveProgram', input(x, { studentIds: [x.students[0].id, lateS.id] }));
  assert.deepStrictEqual([r.ok, r.needsConfirm], [false, true]);
  assert.deepStrictEqual(r.warnings, ['1명은 이 날 학사 입실 상태가 아닙니다.'], '학생 수로만 알리고 이름은 없다');
  assert.ok(!JSON.stringify(r).includes(lateS.name));
  assert.strictEqual(call(x, ADMIN, 'saveProgram', Object.assign(input(x, { studentIds: [x.students[0].id, lateS.id] }), { confirmOverlap: true })).ok, true);
});

test('끝난 기간의 프로그램은 만들 수도 취소할 수도 없고 볼 수만 있다', () => {
  const x = makeEnv();
  const p = call(x, ADMIN, 'saveProgram', input(x));
  x.env.setNow('2027-07-20T12:00:00');   // 1학기(7/17) 끝난 뒤
  const r = call(x, ADMIN, 'cancelProgram', p.id, '끝난 뒤 취소');
  assert.deepStrictEqual([r.ok, /끝난/.test(r.error)], [false, true]);
  assert.strictEqual(call(x, ADMIN, 'saveProgram', input(x, { name: '새 것' })).ok, false);
  const list = call(x, ADMIN, 'listPrograms', { termId: x.term.id });
  assert.deepStrictEqual([list.term.ended, list.items[0].canCancel, list.items[0].count], [true, false, 3]);
  assert.deepStrictEqual(counts(x), [1, 3, 3]);
});

test('listPrograms: 날짜순, 살아 있는 참가자만(학년·반·번호 순), 출결 담당은 볼 수만 있고(canEdit false·canCancel false), 취소한 프로그램은 참가자 없이 표시', () => {
  const x = makeEnv();
  call(x, ADMIN, 'saveProgram', input(x, { name: 'B 특강', date: '2027-03-09' }));
  const a = call(x, ADMIN, 'saveProgram', input(x, { name: 'A 특강', date: '2027-03-05' }));
  call(x, ADMIN, 'saveProgram', input(x, { name: 'C 특강', date: '2027-03-08', studentIds: [x.students[4].id] }));
  call(x, ADMIN, 'cancelProgram', a.id, '일정 변경으로 취소');
  const l = call(x, ATT, 'listPrograms', {});
  assert.deepStrictEqual(l.items.map((i) => i.name), ['A 특강', 'C 특강', 'B 특강']);
  assert.strictEqual(l.canEdit, false);
  assert.ok(l.items.every((i) => i.canCancel === false));
  assert.deepStrictEqual([l.items[0].status, l.items[0].count, l.items[0].participants.length], ['취소', 0, 0]);
  assert.strictEqual(l.items[2].count, 3);
  assert.deepStrictEqual([l.today, l.items[2].exceptionCount, l.items[0].exceptionCount], ['2027-03-03', 3, 0], '특이사항 건수(살아 있는 것만)');
  const ps = l.items[2].participants.map((q) => [q.student.grade, String(q.student.classNo), Number(q.student.number)]);
  assert.deepStrictEqual(ps, ps.slice().sort((p, q) => p[0] - q[0] || p[1].localeCompare(q[1]) || p[2] - q[2]));
  assert.strictEqual(call(x, ADMIN, 'listPrograms', {}).items.find((i) => i.name === 'B 특강').canCancel, true);
  assert.ok(!JSON.stringify(l).includes('example.com'), '이메일 없음');
});

test('getProgramContext: 편집 권한이 있을 때만 학생 목록(그 기간 명단·입실 중)이 나오고, 그날 블록이 나온다', () => {
  const x = makeEnv();
  const adm = call(x, T1, 'getProgramContext', DATE);
  assert.strictEqual(adm.canEdit, true);
  assert.ok(adm.students.length > 0 && !adm.students.some((s) => s.id === x.late), '3/15 입실 예정자는 3/8 목록에 없다');
  assert.ok(adm.blocks.length > 0 && adm.term.id === x.term.id);
  assert.ok(adm.students.every((q) => typeof q.dorm === 'boolean') && adm.students.some((q) => q.dorm) && adm.students.some((q) => !q.dorm), '기숙사생 표시(반 단위 담기의 "기숙사생만")');
  const att = call(x, ATT, 'getProgramContext', DATE);
  assert.deepStrictEqual([att.canEdit, att.students.length], [false, 0]);
  assert.throws(() => x.env.call(ADMIN, 'getProgramContext', '2027-13-45'), /날짜/);
});

test('유형 설정에 "학사 내 프로그램"이 없으면 저장하지 않고 안내한다', () => {
  const x = makeEnv();
  const row = x.env.rows('settings', 'config').find((r) => r.key === 'exception.types');
  x.env.asOwner((c) => c.updateRecord_('settings', row.id, { value: '병결,학원(보강 포함)' }, ADMIN, 'config'));
  const r = call(x, ADMIN, 'saveProgram', input(x));
  assert.strictEqual(r.ok, false); assert.ok(r.errors.some((e) => /학사 내 프로그램/.test(e.message)));
  assert.deepStrictEqual(counts(x), [0, 0, 0]);
});
