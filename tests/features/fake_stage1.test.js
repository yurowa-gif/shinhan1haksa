/** C2 가짜 1단계 데이터(src/dev/FakeStage1.gs): 순수 함수 검사 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs', 'src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/rules/MoveRules.gs',
  'src/dev/FakeData.gs', 'src/dev/FakeSeats.gs', 'src/dev/FakeStage1.gs']);
const fake = ctx.buildFakeData_({ ownerEmail: 'owner@test.invalid' });
const d = plain(ctx.buildFakeStage1_(fake));
const students = plain(fake.students);
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test('좌석 146 / 남 SA 17 / 여 SA 34, 공간 7개', () => {
  assert.strictEqual(d.spaces.length, 7);
  const spaceOf = byId(d.spaces);
  const count = (pred) => d.seats.filter((s) => s.kind === '좌석' && pred(spaceOf[s.space_id])).length;
  assert.strictEqual(count((sp) => sp.name === '1층 자습실'), 146);
  assert.strictEqual(count((sp) => sp.gender === '남'), 17);
  assert.strictEqual(count((sp) => sp.gender === '여'), 34);
});

test('모든 행의 id가 고유하고 같은 입력이면 같은 결과(재현 가능)', () => {
  const all = [].concat(d.spaces, d.seats, d.seatAssignments, d.statusChanges, d.daySchedules, d.exceptions, d.fixedSchedules);
  assert.strictEqual(new Set(all.map((r) => r.id)).size, all.length);
  assert.deepStrictEqual(plain(ctx.buildFakeStage1_(ctx.buildFakeData_({ ownerEmail: 'other@test.invalid' }))), d,
    '시험 이메일이 달라도 같은 데이터');
});

test('가짜 운영 기간 두 개는 기간별 탭 이름이 겹치지 않는다', () => {
  const names = plain(fake.terms).map((t) => ctx.termSheetName_('exceptions', t.id));
  assert.strictEqual(new Set(names).size, names.length);
});

test('좌석 배정: 참조 무결성, 한 자리 한 명, 성별 구역(SA는 같은 성별 베리타스만)', () => {
  const seatOf = byId(d.seats), spaceOf = byId(d.spaces), stu = byId(students);
  const enr = Object.fromEntries(plain(fake.enrollments).filter((e) => e.term_id === d.term.id).map((e) => [e.student_id, e]));
  assert.strictEqual(new Set(d.seatAssignments.map((a) => a.seat_id)).size, d.seatAssignments.length, '한 자리에 두 명 없음');
  assert.strictEqual(new Set(d.seatAssignments.map((a) => a.student_id)).size, d.seatAssignments.length, '한 명이 두 자리 없음');
  for (const a of d.seatAssignments) {
    assert.ok(seatOf[a.seat_id] && stu[a.student_id] && a.term_id === d.term.id);
    assert.strictEqual(seatOf[a.seat_id].kind, '좌석', '좌석 칸에만 배정');
    const sp = spaceOf[seatOf[a.seat_id].space_id];
    if (sp.gender !== '혼성') {
      assert.strictEqual(sp.gender, stu[a.student_id].gender, 'SA실은 같은 성별');
      assert.strictEqual(enr[a.student_id].veritas, 'TRUE', 'SA실은 베리타스');
    }
  }
  assert.ok(!d.seatAssignments.some((a) => a.student_id === d.lateEntrantId), '중도 입실자는 미배정');
  assert.strictEqual(d.seatAssignments.length, 29);
});

test('초기 상태: 학생 전원 학사 입실, 중도 퇴실 1명(적용일 있음), 중도 입실 1명', () => {
  const lakeMap = {};
  d.statusChanges.filter((c) => c.item === '학사').forEach((c) => (lakeMap[c.student_id] = (lakeMap[c.student_id] || []).concat(c)));
  assert.strictEqual(Object.keys(lakeMap).length, 30);
  const leaves = d.statusChanges.filter((c) => c.item === '학사' && c.value === '퇴실');
  assert.strictEqual(leaves.length, 1);
  assert.strictEqual(leaves[0].student_id, d.leaverId);
  assert.ok(leaves[0].effective_date > d.term.start_date);
  const late = lakeMap[d.lateEntrantId][0];
  assert.strictEqual(late.effective_date, '2027-03-15');
  for (const c of d.statusChanges) {
    assert.ok(['학사', '기숙사', '조식', '석식'].includes(c.item), c.item);
    assert.strictEqual(c.status, '유효');
    assert.ok(['TRUE', 'FALSE', ''].includes(c.doc_submitted), 'vocabulary.md: doc_submitted');
    assert.ok(['명단업로드', 'F6', 'F7'].includes(c.source), c.source);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(c.effective_date));
    assert.strictEqual(c.effective_date_auto, c.effective_date);
    if (c.source === '명단업로드') assert.deepStrictEqual([c.requested_at, c.doc_submitted], ['', ''], '명단 행은 신청 일시·서류 없음');
  }
  assert.ok(d.statusChanges.filter((c) => c.item === '석식').every((c) => ['학사 석식', '일반 석식', '미실시'].includes(c.value)));
  assert.strictEqual(d.statusChanges.filter((c) => c.doc_submitted === 'FALSE').length, 1, '서류 미제출 카드는 퇴실 대표 행 1건만');
});

test('29번 중도 퇴실 = movePlan_ 결과: 대표 행(서류 미제출) + 석식 정리 연결 행(결정 35: 3/8 월 15:00 신청 → 3/15)', () => {
  const mine = d.statusChanges.filter((c) => c.student_id === d.leaverId && c.source !== '명단업로드');
  const head = mine.find((c) => c.linked_change_id === '');
  assert.deepStrictEqual([head.item, head.value, head.effective_date, head.requested_at, head.doc_submitted, head.source],
    ['학사', '퇴실', '2027-03-10', '2027-03-08T15:00:00', 'FALSE', 'F6']);
  const linked = mine.filter((c) => c !== head);
  assert.ok(linked.length >= 1 && linked.every((c) => c.linked_change_id === head.id && c.doc_submitted === '' && c.requested_at === head.requested_at));
  const all = d.statusChanges;
  assert.strictEqual(ctx.statusOn_(all, d.leaverId, '학사', '2027-03-10'), '퇴실');
  assert.strictEqual(ctx.statusOn_(all, d.leaverId, '석식', '2027-03-14'), '학사 석식');
  assert.strictEqual(ctx.statusOn_(all, d.leaverId, '석식', '2027-03-15'), '미실시');
});

test('날짜별 일정 2건: 운영 안 함 1, 종료 22:00 1', () => {
  assert.strictEqual(d.daySchedules.length, 2);
  assert.strictEqual(d.daySchedules.filter((s) => s.operating === 'FALSE').length, 1);
  assert.strictEqual(d.daySchedules.filter((s) => s.end === '22:00').length, 1);
});

test('특이사항 10건: 학생·기간 참조, 블록 표기, 상태별 필드, 미인정 유형 포함', () => {
  assert.strictEqual(d.exceptions.length, 10);
  const stu = byId(students);
  const spec = /^(ALL|\d{2}:\d{2}-\d{2}:\d{2}(;\d{2}:\d{2}-\d{2}:\d{2})*)$/;
  for (const e of d.exceptions) {
    assert.ok(stu[e.student_id]); assert.strictEqual(e.term_id, d.term.id);
    assert.ok(spec.test(e.blocks), e.blocks);
    assert.ok(['요청', '확정', '취소'].includes(e.status));
    assert.ok(e.date >= d.term.start_date && e.date <= d.term.end_date);
    if (e.status === '확정') assert.ok(e.confirmed_by && e.confirmed_at);
    if (e.status === '요청') assert.ok(!e.confirmed_by);
    if (e.status === '취소') assert.ok(e.cancel_reason);
  }
  const types = d.exceptions.map((e) => e.type);
  assert.ok(types.includes('미인정지각') && types.includes('미인정결석'));
  assert.ok(d.exceptions.some((e) => e.status === '요청') && d.exceptions.some((e) => e.status === '취소'));
  const group = d.exceptions.filter((e) => e.group_id === d.exceptions[3].group_id);
  assert.strictEqual(group.length, 3, '기간 입력은 날짜마다 1행, group_id로 묶는다');
});

test('고정 일정 8명: 서로 다른 학생, 확정, 학·가 코드', () => {
  assert.strictEqual(d.fixedSchedules.length, 8);
  assert.strictEqual(new Set(d.fixedSchedules.map((f) => f.student_id)).size, 8);
  const stu = byId(students);
  for (const f of d.fixedSchedules) {
    assert.ok(stu[f.student_id]); assert.ok(['학', '가'].includes(f.code));
    assert.ok(['월', '화', '수', '목', '금', '토', '일'].includes(f.weekday));
    assert.strictEqual(f.status, '확정'); assert.ok(f.teacher_confirmed_at);
  }
});

test('모든 행의 열 이름이 SCHEMA 열의 부분집합이다(오타·없는 열 방지)', () => {
  const tab = ctx.termSheetName_('exceptions', d.term.id);
  const plan = { spaces: d.spaces, seats: d.seats, seat_assignments: d.seatAssignments, status_changes: d.statusChanges,
    day_schedules: d.daySchedules, fixed_schedules: d.fixedSchedules, [tab]: d.exceptions };
  for (const [name, rows] of Object.entries(plan)) {
    const headers = new Set(plain(ctx.headersFor_('db', name)));
    for (const r of rows) for (const k of Object.keys(r)) assert.ok(headers.has(k), name + ' 열 없음: ' + k);
    // 모든 열이 채워지거나 빈 문자열(값 누락으로 undefined가 시트에 쓰이지 않게)
    for (const r of rows) for (const h of headers) if (!['id', 'created_at', 'created_by', 'updated_at', 'updated_by'].includes(h)) {
      assert.notStrictEqual(r[h], undefined, name + '.' + h);
    }
  }
});

test('가짜 시드 안전장치: 실제 학생이 섞인 DB에는 쓰지 않는다 / 두 번째는 새 행 0건', () => {
  assert.strictEqual(ctx.fake1DbIsAllFake_(students), true);
  assert.strictEqual(ctx.fake1DbIsAllFake_(students.concat([{ id: 'x', memo: '' }])), false);
  assert.strictEqual(ctx.fake1DbIsAllFake_([]), false, '빈 DB는 가짜 시드 대상이 아니다(seedFakeData 먼저)');
  const first = plain(ctx.fake1OnlyNew_(d.seats, []));
  assert.strictEqual(first.length, d.seats.length);
  assert.strictEqual(ctx.fake1OnlyNew_(d.seats, d.seats).length, 0);
});
