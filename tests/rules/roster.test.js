/** R2 RosterRules — 명단 표 해석, 재업로드 변경 0건, 학년이 올라간 학생 이메일 연결, ambiguous. 가짜 값만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/StatusRules.gs', 'src/rules/RosterRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

const HEAD = ['학번', '학년', '반', '번호', '이름', '성별', '계열', '학사', '기숙사', '베리타스', '조식', '석식',
  '통학구분', '담당교사이메일', '학생구글계정', '비고'];
const ROW1 = ['10101', '1', '1', '1', '가학생', '여', '', 'O', 'O', 'O', 'O', '학사', '일반', 'teacher1@example.com', 'student1@example.com', ''];
const ROW2 = ['20612', '2', '6', '12', '나학생', '남', '이', 'O', 'X', 'X', 'X', '일반', '원거리(관내)', 'teacher2@example.com', 'student2@example.com', ''];
const parse = (rows) => plain(ctx.parseRosterTable_(rows));
const withCell = (row, col, v) => { const r = row.slice(); r[HEAD.indexOf(col)] = v; return r; };

test('parseRosterTable_: PRD 10.2 예시 두 줄', () => {
  const r = parse([HEAD, ROW1, ROW2]);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
  assert.deepStrictEqual(r.records[0], { line: 2, student_no: '10101', grade: '1', class_no: '1', number: '1', name: '가학생',
    gender: '여', track: '', hall: '입실', dorm: '입실', veritas: 'TRUE', breakfast: '실시', dinner: '학사 석식',
    commute_type: '일반', teacher_email: 'teacher1@example.com', email: 'student1@example.com', end_type: '23:50', memo: '' });
  assert.deepStrictEqual(r.records[1], { line: 3, student_no: '20612', grade: '2', class_no: '6', number: '12', name: '나학생',
    gender: '남', track: '이', hall: '입실', dorm: '퇴실', veritas: 'FALSE', breakfast: '미실시', dinner: '일반 석식',
    commute_type: '원거리(관내)', teacher_email: 'teacher2@example.com', email: 'student2@example.com', end_type: '23:50', memo: '' });
});

table('parseRosterTable_: O/X 정규화(O·o·○·Y·TRUE·1 / X·x·×·N·FALSE·0)', [
  ['O', '입실'], ['o', '입실'], ['○', '입실'], ['Y', '입실'], ['TRUE', '입실'], ['1', '입실'], [' O ', '입실'],
  ['X', '퇴실'], ['x', '퇴실'], ['×', '퇴실'], ['N', '퇴실'], ['false', '퇴실'], ['0', '퇴실']
], ([v, want]) => {
  const r = parse([HEAD, withCell(ROW1, '학사', v)]);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.records[0].hall, want);
});

table('parseRosterTable_: 석식 표기', [
  ['학사', '학사 석식'], ['학사 석식', '학사 석식'], ['일반', '일반 석식'], ['일반석식', '일반 석식'], ['미실시', '미실시'], ['X', '미실시']
], ([v, want]) => assert.strictEqual(parse([HEAD, withCell(ROW1, '석식', v)]).records[0].dinner, want));

table('parseRosterTable_: 칸 오류는 줄 번호·열 이름과 함께', [
  ['학번', '1010', '학번'], ['학번', '1010a', '학번'], ['학년', '4', '학년'], ['학년', '0', '학년'], ['반', '', '반'],
  ['번호', '1.5', '번호'], ['이름', '', '이름'], ['성별', '남자', '성별'], ['계열', '자연', '계열'],
  ['학사', '', '학사'], ['기숙사', '예', '기숙사'], ['베리타스', '?', '베리타스'], ['조식', '', '조식'],
  ['석식', '', '석식'], ['석식', '학사식', '석식'], ['통학구분', '원거리', '통학구분'],
  ['담당교사이메일', 'teacher1', '담당교사이메일'], ['학생구글계정', 'a@b', '학생구글계정']
], ([col, v, wantCol]) => {
  const r = parse([HEAD, ROW2, withCell(ROW1, col, v)]);
  assert.ok(r.errors.length >= 1, JSON.stringify(r.errors));
  assert.ok(r.errors.every((e) => e.line === 3), JSON.stringify(r.errors));
  assert.ok(r.errors.some((e) => e.column === wantCol), JSON.stringify(r.errors));
});

test('parseRosterTable_: 머리글 열 순서가 다르면 그 열을 알려 주고 줄은 읽지 않는다', () => {
  const head = HEAD.slice(); [head[4], head[5]] = [head[5], head[4]];
  const r = parse([head, ROW1]);
  assert.deepStrictEqual(r.records, []);
  assert.deepStrictEqual(r.errors.map((e) => e.column), ['이름', '성별']);
  assert.ok(r.errors.every((e) => e.line === 1));
  assert.strictEqual(parse([HEAD.slice(0, 15), ROW1]).errors[0].column, '비고');
  assert.strictEqual(parse([HEAD.concat(['추가']), ROW1]).errors[0].column, '추가');
});

test('parseRosterTable_: 머리글 BOM·공백·끝 빈칸 허용, 빈 줄 건너뜀, 줄 번호는 원래 위치', () => {
  const head = HEAD.map((h) => ' ' + h + ' '); head[0] = '﻿학번';
  const r = parse([head.concat(['', '']), [], ['', ''], ROW1, ROW2.slice(0, 15)]);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.records.map((x) => x.line), [4, 5]);
  assert.strictEqual(r.records[1].memo, '');
});

test('parseRosterTable_: 열이 넘치면 오류, 빈 표·머리글만 있으면 오류', () => {
  assert.strictEqual(parse([HEAD, ROW1.concat(['밀린 칸'])]).errors[0].line, 2);
  assert.strictEqual(parse([HEAD, ROW1.concat(['', ''])]).errors.length, 0);
  assert.strictEqual(parse([]).errors[0].line, 1);
  assert.strictEqual(parse([HEAD]).errors[0].message, '학생 줄이 없습니다.');
  assert.strictEqual(parse(null).errors.length, 1);
});

test('parseRosterTable_: 학번·학생 계정 중복은 두 줄 모두 오류(대소문자 무시)', () => {
  const r = parse([HEAD, ROW1, withCell(ROW2, '학번', '10101'), withCell(withCell(ROW1, '학번', '10102'), '학생구글계정', 'STUDENT1@example.com')]);
  const by = (col) => r.errors.filter((e) => e.column === col).map((e) => e.line);
  assert.deepStrictEqual(by('학번'), [2, 3]);
  assert.deepStrictEqual(by('학생구글계정'), [2, 4]);
});

test('parseRosterTable_: 경고 — 학번과 학년·반·번호 불일치, 계정·담당교사 빈칸, 통학구분 빈칸은 일반', () => {
  const r = parse([HEAD, withCell(ROW1, '번호', '2'), withCell(withCell(withCell(ROW2, '학생구글계정', ''), '담당교사이메일', ''), '통학구분', '')]);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.warnings.length, 3, r.warnings.join('/'));
  assert.ok(r.warnings[0].indexOf('2줄') === 0);
  assert.strictEqual(r.records[1].commute_type, '일반');
  assert.strictEqual(r.records[0].email, 'student1@example.com');
});

test('parseRosterTable_: 이메일은 소문자로', () => {
  const r = parse([HEAD, withCell(withCell(ROW1, '학생구글계정', 'Student1@Example.COM'), '담당교사이메일', 'T@EXAMPLE.com')]);
  assert.strictEqual(r.records[0].email, 'student1@example.com');
  assert.strictEqual(r.records[0].teacher_email, 't@example.com');
});

/* ───── parseGuardianTable_ ───── */
const GHEAD = ['학부모구글계정', '학번', '관계'];
test('parseGuardianTable_: 형제자매는 같은 학부모 여러 줄, 중복 줄·형식 오류', () => {
  const ok = plain(ctx.parseGuardianTable_([GHEAD, ['Parent1@example.com', '10101', '모'], ['parent1@example.com', '20305', '모']]));
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(ok.records, [
    { line: 2, parent_email: 'parent1@example.com', student_no: '10101', relation: '모' },
    { line: 3, parent_email: 'parent1@example.com', student_no: '20305', relation: '모' }]);
  const bad = plain(ctx.parseGuardianTable_([GHEAD, ['parent1@example.com', '10101', '모'], ['PARENT1@example.com', '10101', '부'],
    ['parent', '1010', ''], [], ['p@example.com', '10101', '부', 'x']]));
  assert.deepStrictEqual(bad.errors.map((e) => [e.line, e.column]), [[3, '학번'], [4, '학부모구글계정'], [4, '학번'], [6, '']]);
  assert.strictEqual(plain(ctx.parseGuardianTable_([['학번', '학부모구글계정', '관계']])).errors.length, 2);
  assert.strictEqual(plain(ctx.parseGuardianTable_([])).errors.length, 1);
});

/* ───── diffRoster_ ───── */
// 적용 시뮬레이터: diff 결과를 existing에 반영(새 id 부여)
function apply(existing, d) {
  const ex = JSON.parse(JSON.stringify(existing));
  const idOf = {};
  let n = 0;
  for (const s of d.createStudents) { const id = 'S-new-' + (++n); idOf[s.ref] = id; const r = Object.assign({}, s, { id }); delete r.ref; ex.students.push(r); }
  const sid = (x) => idOf[x] || x;
  for (const u of d.updateStudents) Object.assign(ex.students.find((s) => s.id === u.id), u.patch);
  for (const e of d.createEnrollments) ex.enrollments.push(Object.assign({}, e, { id: 'E-new-' + (++n), student_id: sid(e.student_id) }));
  for (const u of d.updateEnrollments) Object.assign(ex.enrollments.find((e) => e.id === u.id), u.patch);
  for (const c of d.createChanges) ex.changes.push(Object.assign({}, c, { id: 'C-new-' + (++n), student_id: sid(c.student_id), created_at: '2027-03-01T09:00:00' }));
  return ex;
}
const EMPTY = { students: [], enrollments: [], changes: [], users: [
  { email: 'teacher1@example.com', active: 'TRUE' }, { email: 'teacher2@example.com', active: 'TRUE' }] };
const count = (d) => d.createStudents.length + d.updateStudents.length + d.createEnrollments.length +
  d.updateEnrollments.length + d.createChanges.length + d.leavingCandidates.length + d.ambiguous.length;

test('diffRoster_: 빈 DB에 올리면 학생·등록·상태 4개씩 만들고, 새 학생은 ref로 잇는다', () => {
  const recs = parse([HEAD, ROW1, ROW2]).records;
  const d = plain(ctx.diffRoster_(recs, EMPTY, 'T1', '2027-03-02'));
  assert.deepStrictEqual(d.createStudents.map((s) => s.ref), ['new:10101', 'new:20612']);
  assert.deepStrictEqual(d.createEnrollments.map((e) => [e.term_id, e.student_id, e.end_type]),
    [['T1', 'new:10101', '23:50'], ['T1', 'new:20612', '23:50']]);
  assert.strictEqual(d.createChanges.length, 8);
  assert.deepStrictEqual(d.createChanges.filter((c) => c.student_id === 'new:20612').map((c) => c.item + '=' + c.value),
    ['학사=입실', '기숙사=퇴실', '조식=미실시', '석식=일반 석식']);
  assert.ok(d.createChanges.every((c) => c.effective_date === '2027-03-02' && c.source === '명단업로드' && c.status === '유효'));
  assert.deepStrictEqual(d.warnings, []);
});

test('diffRoster_: 같은 파일 재업로드는 변경 0건', () => {
  const recs = parse([HEAD, ROW1, ROW2]).records;
  const after = apply(EMPTY, plain(ctx.diffRoster_(recs, EMPTY, 'T1', '2027-03-02')));
  const again = plain(ctx.diffRoster_(recs, after, 'T1', '2027-03-02'));
  assert.strictEqual(count(again), 0, JSON.stringify(again));
  // 이메일 대소문자만 다르게 다시 붙여넣어도 0건
  const recs2 = parse([HEAD, withCell(ROW1, '학생구글계정', 'STUDENT1@example.com'), ROW2]).records;
  assert.strictEqual(count(plain(ctx.diffRoster_(recs2, after, 'T1', '2027-03-02'))), 0);
});

test('diffRoster_: 바뀐 칸만 update, 상태가 바뀐 항목만 change', () => {
  const recs = parse([HEAD, ROW1, ROW2]).records;
  const after = apply(EMPTY, plain(ctx.diffRoster_(recs, EMPTY, 'T1', '2027-03-02')));
  const recs2 = parse([HEAD, withCell(withCell(ROW1, '석식', '일반'), '담당교사이메일', 'teacher2@example.com'),
    withCell(ROW2, '이름', '나학생2')]).records;
  const d = plain(ctx.diffRoster_(recs2, after, 'T1', '2027-04-01'));
  assert.deepStrictEqual(d.createChanges.map((c) => [c.item, c.value, c.effective_date]), [['석식', '일반 석식', '2027-04-01']]);
  assert.deepStrictEqual(d.updateEnrollments.map((u) => u.patch), [{ teacher_email: 'teacher2@example.com' }]);
  assert.deepStrictEqual(d.updateStudents.map((u) => u.patch), [{ name: '나학생2' }]);
  assert.deepStrictEqual([d.createStudents.length, d.createEnrollments.length], [0, 0]);
});

test('diffRoster_: 명단에서 빠진 학사생은 퇴실 후보(표시만, 상태 변경 없음), 이미 퇴실한 학생은 후보 아님', () => {
  const recs = parse([HEAD, ROW1, ROW2]).records;
  const after = apply(EMPTY, plain(ctx.diffRoster_(recs, EMPTY, 'T1', '2027-03-02')));
  const d = plain(ctx.diffRoster_(parse([HEAD, ROW1]).records, after, 'T1', '2027-04-01'));
  assert.deepStrictEqual(d.leavingCandidates.map((x) => [x.student_no, x.name]), [['20612', '나학생']]);
  assert.strictEqual(d.createChanges.length, 0);
  const left = JSON.parse(JSON.stringify(after));
  const s2 = left.students.find((s) => s.student_no === '20612').id;
  left.changes.push({ student_id: s2, item: '학사', value: '퇴실', effective_date: '2027-03-20', status: '유효', created_at: 'x' });
  assert.deepStrictEqual(plain(ctx.diffRoster_(parse([HEAD, ROW1]).records, left, 'T1', '2027-04-01')).leavingCandidates, []);
});

test('diffRoster_: 학년이 올라간 학생은 이메일로 이어서 학번·학년·반만 고치고, 새 기간 등록을 만든다', () => {
  const recs = parse([HEAD, ROW1]).records;
  const y1 = apply(EMPTY, plain(ctx.diffRoster_(recs, EMPTY, 'T2026', '2026-03-02')));
  const up = ['20305', '2', '3', '5', '가학생', '여', '문', 'O', 'O', 'O', 'O', '학사', '일반', 'teacher1@example.com', 'student1@example.com', ''];
  // 같은 학번 10101은 올해 새 1학년(다른 계정)이 쓴다
  const fresh = ['10101', '1', '1', '1', '다학생', '남', '', 'O', 'X', 'X', 'O', '학사', '일반', 'teacher1@example.com', 'student3@example.com', ''];
  const d = plain(ctx.diffRoster_(parse([HEAD, up, fresh]).records, y1, 'T2027', '2027-03-02'));
  const oldId = y1.students[0].id;
  assert.deepStrictEqual(d.updateStudents, [{ id: oldId, patch: { student_no: '20305', grade: '2', class_no: '3', number: '5', track: '문' } }]);
  assert.deepStrictEqual(d.createStudents.map((s) => s.ref), ['new:10101']);
  assert.deepStrictEqual(d.createEnrollments.map((e) => e.student_id), [oldId, 'new:10101']);
  assert.deepStrictEqual(d.createChanges.filter((c) => c.student_id === oldId), []);   // 상태는 그대로 이어짐
  assert.deepStrictEqual(d.ambiguous, []);
  assert.deepStrictEqual(d.leavingCandidates, []);   // 새 기간에는 등록이 아직 없다
});

table('diffRoster_: 같은 사람인지 모르면 ambiguous(아무것도 만들지 않음)', [
  // [기존 학생, 명단 줄, 이유에 들어갈 낱말]
  [{ id: 'X', student_no: '10101', name: '가학생', grade: '1', email: 'other@example.com' }, ROW1, '계정이 다릅니다'],
  [{ id: 'X', student_no: '10101', name: '딴학생', grade: '1', email: '' }, withCell(ROW1, '학생구글계정', ''), '이름이나 학년'],
  [{ id: 'X', student_no: '10101', name: '가학생', grade: '2', email: '' }, ROW1, '이름이나 학년'],
], ([s, row, word]) => {
  const ex = Object.assign({}, EMPTY, { students: [Object.assign({ class_no: '1', number: '1', gender: '여', track: '' }, s)] });
  const d = plain(ctx.diffRoster_(parse([HEAD, row]).records, ex, 'T1', '2027-03-02'));
  assert.strictEqual(d.ambiguous.length, 1);
  assert.deepStrictEqual(d.ambiguous[0].candidates, ['X']);
  assert.strictEqual(d.ambiguous[0].line, 2);
  assert.ok(d.ambiguous[0].reason.indexOf(word) >= 0, d.ambiguous[0].reason);
  assert.strictEqual(d.createStudents.length + d.createEnrollments.length + d.createChanges.length + d.updateStudents.length, 0);
});

test('diffRoster_: 학번으로 이어지는 경우(계정이 비어 있던 학생에게 계정 채움, 이름·학년 같음)', () => {
  const ex = Object.assign({}, EMPTY, { students: [{ id: 'X', student_no: '10101', name: '가학생', grade: '1', class_no: '1', number: '1', gender: '여', track: '', email: '' }] });
  const d = plain(ctx.diffRoster_(parse([HEAD, ROW1]).records, ex, 'T1', '2027-03-02'));
  assert.deepStrictEqual(d.updateStudents, [{ id: 'X', patch: { email: 'student1@example.com' } }]);
  assert.deepStrictEqual(d.ambiguous, []);
  // 명단 계정이 비었으면 있는 계정을 지우지 않는다
  const ex2 = Object.assign({}, EMPTY, { students: [Object.assign({}, ex.students[0], { email: 'student1@example.com' })] });
  assert.deepStrictEqual(plain(ctx.diffRoster_(parse([HEAD, withCell(ROW1, '학생구글계정', '')]).records, ex2, 'T1', '2027-03-02')).updateStudents, []);
});

test('diffRoster_: 명단 줄이 이미 다른 줄이 가리킨 학생과 겹치면 ambiguous, 그 학생은 퇴실 후보에서 뺀다', () => {
  const recs = parse([HEAD, ROW1]).records;
  const after = apply(EMPTY, plain(ctx.diffRoster_(recs, EMPTY, 'T1', '2027-03-02')));
  // 2줄: 학년이 올라간 새 학번(계정으로 이어짐), 3줄: 옛 줄을 지우지 않고 함께 붙여 넣음(계정 없음, 옛 학번·같은 이름)
  const up = withCell(withCell(withCell(withCell(ROW1, '학번', '20305'), '학년', '2'), '반', '3'), '번호', '5');
  const d = plain(ctx.diffRoster_(parse([HEAD, up, withCell(ROW1, '학생구글계정', '')]).records, after, 'T1', '2027-04-01'));
  assert.deepStrictEqual(d.ambiguous.map((a) => a.line), [3]);
  assert.deepStrictEqual(d.createStudents, []);
  // 계정으로도 학번으로도 같은 학생을 두 줄이 가리키는 경우(계정 대소문자만 다른 두 줄은 parse 단계에서 막힌다)
  const ex = JSON.parse(JSON.stringify(after));
  ex.students.push({ id: 'Y', student_no: '10199', name: '라학생', grade: '1', class_no: '1', number: '99', gender: '남', track: '', email: '' });
  const r1 = withCell(withCell(withCell(withCell(ROW2, '학번', '10199'), '학년', '1'), '이름', '라학생'), '학생구글계정', '');
  const d2 = plain(ctx.diffRoster_([parse([HEAD, r1]).records[0], Object.assign({}, parse([HEAD, r1]).records[0], { line: 9 })], ex, 'T1', '2027-04-01'));
  assert.deepStrictEqual(d2.ambiguous.map((a) => a.line), [2, 9]);
  assert.ok(d2.leavingCandidates.every((x) => x.student_id !== 'Y'));
});

test('diffRoster_: 담당교사가 사용자 목록에 없거나 비활성이면 경고', () => {
  const ex = Object.assign({}, EMPTY, { users: [{ email: 'teacher1@example.com', active: 'FALSE' }] });
  const d = plain(ctx.diffRoster_(parse([HEAD, ROW1]).records, ex, 'T1', '2027-03-02'));
  assert.strictEqual(d.warnings.length, 1);
});

test('diffRoster_: 가짜 30명 전체를 올리고 다시 올리면 0건(FakeData 모양)', () => {
  const fake = loadGs(['src/dev/FakeData.gs']).buildFakeData_({});
  const yn = (b) => (b ? 'O' : 'X');
  const rows = [HEAD].concat(fake.students.map((s, i) => [s.student_no, s.grade, s.class_no, s.number, s.name, s.gender, s.track,
    'O', yn(i % 2), yn(i % 3 === 0), yn(i % 4 !== 0), ['학사', '일반', '미실시'][i % 3], '일반',
    'fake.teacher1@example.com', s.email, '']));
  const p = parse(rows);
  assert.deepStrictEqual(p.errors, []);
  const ex = { students: [], enrollments: [], changes: [], users: plain(fake.users) };
  const d1 = plain(ctx.diffRoster_(p.records, ex, 'T1', '2027-03-02'));
  assert.strictEqual(d1.createStudents.length, 30);
  assert.strictEqual(d1.createChanges.length, 120);
  assert.strictEqual(count(plain(ctx.diffRoster_(p.records, apply(ex, d1), 'T1', '2027-03-02'))), 0);
});
