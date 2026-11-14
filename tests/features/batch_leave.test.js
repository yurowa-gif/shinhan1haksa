/** C26 학년 일괄 퇴실(결정 74①, R20 위): 미리보기·저장·중복·stale·예약어·재입실 막힘·되돌리기·권한. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com';
const HALL = 'test.teacher@example.com';
const EFF = '2027-03-10', AT = '2027-03-03T15:00:00';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T16:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  return { env, term };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const input = (o) => Object.assign({ grade: '1', effectiveDate: EFF, requestedAt: AT, dinner: '중단', docSubmitted: false, reason: '' }, o || {});
const preview = (x, o) => call(x, ADMIN, 'previewBatchLeave', input(o));
const rowsAll = (x) => x.env.rows('status_changes');
const valueOn = (x, sid, item, ymd) => x.env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
const studentsOf = (x, grade) => {
  const enrolled = new Set(x.env.rows('enrollments').filter((e) => e.term_id === x.term.id).map((e) => e.student_id));
  return x.env.rows('students').filter((s) => enrolled.has(s.id) && String(s.grade) === String(grade));
};
/** 퇴실일에 학사 입실인 학생(대상) */
const targetsOf = (x, grade) => studentsOf(x, grade).filter((s) => valueOn(x, s.id, '학사', EFF) === '입실');
const heads = (x, batchId) => rowsAll(x).filter((r) => String(r.memo).indexOf('[일괄] ' + batchId) === 0);
function saveOk(x, o) {
  const p = preview(x, o);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  const r = call(x, ADMIN, 'saveBatchLeave', input(o), p.expect);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return { p, r };
}

test('권한: 관리자만(denied:batch.leave) — 학사 교사·출결·근무표·담임·학생·학부모 모두 6개 함수 거부, 거부된 호출은 아무것도 쓰지 않는다', () => {
  const x = makeEnv();
  const n = rowsAll(x).length;
  for (const who of [HALL, 'test.attendance@example.com', 'test.duty@example.com', 'test.homeroom@example.com', 'test.student@example.com', 'test.parent@example.com']) {
    x.env.expectDenied(who, 'batch.leave', 'getBatchLeaveContext');
    x.env.expectDenied(who, 'batch.leave', 'previewBatchLeave', input());
    x.env.expectDenied(who, 'batch.leave', 'saveBatchLeave', input(), '{}');
    x.env.expectDenied(who, 'batch.leave', 'listBatchLeaves');
    x.env.expectDenied(who, 'batch.leave', 'previewBatchUndo', 'x');
    x.env.expectDenied(who, 'batch.leave', 'undoBatchLeave', 'x', '사유 두 글자', '{}');
  }
  assert.strictEqual(rowsAll(x).length, n);
  x.env.expectAllowed(ADMIN, 'getBatchLeaveContext');
  x.env.expectAllowed(ADMIN, 'listBatchLeaves');
});

test('시작값: 학년별 사람 수(오늘 학사 입실)·기숙사생 수와 기간', () => {
  const x = makeEnv();
  const c = call(x, ADMIN, 'getBatchLeaveContext');
  assert.strictEqual(c.term.id, x.term.id);
  assert.deepStrictEqual(c.grades.map((g) => g.grade), ['1', '2', '3']);
  for (const g of c.grades) {
    const stu = studentsOf(x, g.grade).filter((s) => x.env.as(ADMIN, (k) => k.statusOn_(k.readAll_('status_changes'), s.id, '학사', c.today)) === '입실');
    assert.strictEqual(g.count, stu.length, g.grade + '학년');
    assert.strictEqual(g.dormCount, stu.filter((s) => x.env.as(ADMIN, (k) => k.statusOn_(k.readAll_('status_changes'), s.id, '기숙사', c.today)) === '입실').length);
  }
});

test('미리보기: 대상 목록(기숙사생은 학사 및 기숙사 퇴실)·문구·expect(batchId)이 나오고 아무것도 쓰지 않는다', () => {
  const x = makeEnv();
  const n = rowsAll(x).length, audits = x.env.rows('audit_log').length;
  const t = targetsOf(x, 1);
  const p = preview(x);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.strictEqual(p.count, t.length);
  assert.deepStrictEqual(p.list.map((l) => l.id).sort(), t.map((s) => s.id).sort());
  assert.strictEqual(p.dormCount, p.list.filter((l) => l.dorm).length);
  assert.ok(p.dormCount > 0 && p.dormCount < p.count, '기숙사생과 아닌 학생이 섞여 있다');
  assert.ok(p.lines.some((l) => /자진 퇴실이라 다시 들어오는 것이 막힙니다/.test(l)));
  assert.match(p.lead, /1학년 \d+명 일괄 퇴실/);
  const ex = JSON.parse(p.expect);
  assert.match(ex.b, /^[0-9a-f-]{36}$/);
  assert.strictEqual(rowsAll(x).length, n);
  assert.strictEqual(x.env.rows('audit_log').length, audits, '미리보기는 audit도 쓰지 않는다');
  assert.notStrictEqual(preview(x).expect, p.expect, '미리보기마다 새 batchId');
  const ex2 = JSON.parse(p.expect);
  assert.ok(p.expect.length < 160 && /^[0-9a-f]{64}$/.test(ex2.s), 'expect는 batchId와 SHA-256 해시뿐이다(대상 목록·계획 전체가 화면을 오가지 않는다): ' + p.expect.length + '자');
  assert.ok(!p.list.some((l) => p.expect.includes(l.id)), 'expect에 학생 id가 없다');
});

test('저장: 학생마다 대표 행 1개(학사 퇴실, memo [일괄] id, 서류 표시·사유)와 연결 행, 기숙사생은 기숙사 퇴실도, 석식 정리, 다른 학년은 그대로, 쓰기는 한 번(bulk_create 1줄)', () => {
  const x = makeEnv();
  const t = targetsOf(x, 1), other = targetsOf(x, 2);
  const before = rowsAll(x).length;
  const audit0 = x.env.rows('audit_log').filter((a) => a.action === 'bulk_create').length;
  const { p, r } = saveOk(x, { reason: '', docSubmitted: true });
  assert.deepStrictEqual([r.batchId, r.count, r.skipped], [JSON.parse(p.expect).b, t.length, 0]);
  const hs = heads(x, r.batchId);
  assert.strictEqual(hs.length, t.length);
  assert.ok(hs.every((h) => h.item === '학사' && h.value === '퇴실' && h.effective_date === EFF && h.requested_at === AT && h.source === 'F6' && !h.linked_change_id && h.status === '유효' &&
    h.doc_submitted === 'TRUE' && h.reason === '학년 일괄 퇴실' && h.memo === '[일괄] ' + r.batchId && h.created_by === ADMIN));
  assert.deepStrictEqual(hs.map((h) => h.student_id).sort(), t.map((s) => s.id).sort());
  for (const s of t) {
    assert.strictEqual(valueOn(x, s.id, '학사', EFF), '퇴실', s.name);
    assert.strictEqual(valueOn(x, s.id, '학사', '2027-03-09'), '입실');
    const wasDorm = valueOn(x, s.id, '기숙사', '2027-03-09') === '입실';
    assert.strictEqual(valueOn(x, s.id, '기숙사', EFF), wasDorm ? '퇴실' : valueOn(x, s.id, '기숙사', '2027-03-09'));
    const head = hs.find((h) => h.student_id === s.id);
    const linked = rowsAll(x).filter((q) => q.linked_change_id === head.id);
    assert.ok(linked.every((q) => q.student_id === s.id && q.source === 'F6' && q.doc_submitted === '' && q.status === '유효'), s.name);
    if (wasDorm) assert.ok(linked.some((q) => q.item === '기숙사' && q.value === '퇴실'), '기숙사생은 기숙사 퇴실 연결 행');
  }
  const dormStudent = t.find((s) => valueOn(x, s.id, '기숙사', '2027-03-09') === '입실');
  assert.ok(['미실시'].includes(valueOn(x, dormStudent.id, '석식', '2027-03-31')), '석식은 퇴실 정리(미실시)로');
  assert.strictEqual(valueOn(x, dormStudent.id, '조식', EFF), '미실시', '조식은 퇴실일부터 중단');
  assert.ok(other.every((s) => valueOn(x, s.id, '학사', EFF) === '입실'), '다른 학년은 그대로');
  assert.ok(rowsAll(x).length > before + t.length);
  assert.strictEqual(x.env.rows('audit_log').filter((a) => a.action === 'bulk_create').length, audit0 + 1, '새 행은 한 번의 bulkAppend_(audit 1줄)');
});

test('저장 두 번(같은 expect): 두 번째는 duplicate이고 행이 늘지 않는다', () => {
  const x = makeEnv();
  const { p } = saveOk(x, {});
  const n = rowsAll(x).length;
  const again = call(x, ADMIN, 'saveBatchLeave', input(), p.expect);
  assert.deepStrictEqual([again.ok, again.duplicate, again.count > 0], [true, true, true]);
  assert.strictEqual(rowsAll(x).length, n);
});

test('stale: 미리보기 뒤에 대상 학생이 따로 퇴실 처리되면 저장하지 않고 stale(아무것도 쓰지 않음), 다시 미리보기하면 저장된다', () => {
  const x = makeEnv();
  const p = preview(x);
  const victim = targetsOf(x, 1)[0];
  const one = call(x, ADMIN, 'saveMove', { studentId: victim.id, type: valueOn(x, victim.id, '기숙사', EFF) === '입실' ? '학사 및 기숙사 퇴실' : '학사 퇴실', requestedAt: AT, effectiveDate: '2027-03-08', dinner: '중단', docSubmitted: false },
    call(x, ADMIN, 'previewMove', { studentId: victim.id, type: valueOn(x, victim.id, '기숙사', EFF) === '입실' ? '학사 및 기숙사 퇴실' : '학사 퇴실', requestedAt: AT, effectiveDate: '2027-03-08', dinner: '중단', docSubmitted: false }).expect);
  assert.strictEqual(one.ok, true, JSON.stringify(one));
  const n = rowsAll(x).length;
  const r = call(x, ADMIN, 'saveBatchLeave', input(), p.expect);
  assert.strictEqual(r.stale, true, JSON.stringify(r));
  assert.strictEqual(rowsAll(x).length, n);
  const p2 = preview(x);
  assert.strictEqual(p2.count, p.count - 1, '이미 퇴실한 학생은 대상에서 빠진다');
  assert.strictEqual(call(x, ADMIN, 'saveBatchLeave', input(), p2.expect).ok, true);
  assert.strictEqual(call(x, ADMIN, 'saveBatchLeave', input(), 'broken').stale, true, '깨진 expect');
  assert.strictEqual(call(x, ADMIN, 'saveBatchLeave', input(), JSON.stringify({ b: JSON.parse(p2.expect).b, s: 'x'.repeat(64) })).stale, true, '해시 모양이 아닌 expect');
  assert.strictEqual(call(x, ADMIN, 'saveBatchLeave', input(), '').stale, true);
});

test('입력 검사: 학년·퇴실일(기간 밖)·신청 일시(미래)·석식(기본값 없음)·사유 예약어·너무 긴 사유는 거부하고 쓰지 않는다', () => {
  const x = makeEnv();
  const n = rowsAll(x).length;
  const cases = [[{ grade: '' }, 'grade'], [{ grade: '9' }, 'grade'], [{ grade: 'x' }, 'grade'], [{ effectiveDate: '' }, 'effectiveDate'], [{ effectiveDate: '2027-02-01' }, 'effectiveDate'],
    [{ effectiveDate: '2027-09-01' }, 'effectiveDate'], [{ requestedAt: '2027-03-04T10:00:00' }, 'requestedAt'], [{ requestedAt: '' }, 'requestedAt'], [{ dinner: '' }, 'dinner'], [{ dinner: '미실시' }, 'dinner'],
    [{ reason: '2OUT 퇴실' }, 'reason'], [{ reason: '[2OUT] x' }, 'reason'], [{ reason: ' 임시  퇴실 ' }, 'reason'], [{ reason: '[임시] return:2027-05-01' }, 'reason'], [{ reason: '[일괄] abc' }, 'reason'],
    [{ reason: 'ㄱ'.repeat(201) }, 'reason']];
  for (const [o, field] of cases) {
    const p = preview(x, o);
    assert.strictEqual(p.ok, false, JSON.stringify(o));
    assert.ok(p.errors.some((e) => e.field === field), JSON.stringify([o, p.errors]));
    const s = call(x, ADMIN, 'saveBatchLeave', input(o), JSON.stringify({ b: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', s: 'x' }));
    assert.strictEqual(s.ok, false, JSON.stringify(o));
  }
  assert.strictEqual(rowsAll(x).length, n);
});

test('제외 학생: excludeIds의 학생은 대상에서 빠지고(목록에는 excluded로 보임) 저장되지 않으며, 제외를 바꾸면 expect가 달라진다', () => {
  const x = makeEnv();
  const t = targetsOf(x, 1);
  const out = t[0].id;
  const p0 = preview(x), p = preview(x, { excludeIds: [out] });
  assert.strictEqual(p.count, t.length - 1);
  assert.deepStrictEqual(p.list.filter((l) => l.excluded).map((l) => l.id), [out]);
  const r = call(x, ADMIN, 'saveBatchLeave', input({ excludeIds: [out] }), p.expect);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(valueOn(x, out, '학사', EFF), '입실');
  assert.strictEqual(heads(x, r.batchId).length, t.length - 1);
  // 같은 expect로 제외 없이 저장하려 하면 서명이 달라 거부(이미 저장된 batchId라 duplicate 처리되지 않도록 새 환경)
  const y = makeEnv();
  const q = preview(y, { excludeIds: [targetsOf(y, 1)[0].id] });
  assert.strictEqual(call(y, ADMIN, 'saveBatchLeave', input(), q.expect).stale, true);
  void p0;
});

test('이미 퇴실 상태·뒤 날짜 기록이 있는 학생은 대상/건너뜀으로 빠지고 이유가 보이며(이름은 관리자 응답에만), 나머지는 저장된다', () => {
  const x = makeEnv();
  const t = targetsOf(x, 1);
  const pending = t[0];   // 퇴실일 뒤 날짜(3/20)의 학사 퇴실 기록이 이미 있는 학생
  x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: pending.id, item: '학사', value: '퇴실', requested_at: '2027-03-02T10:00:00', effective_date: '2027-03-20', effective_date_auto: '2027-03-20',
    reason: '가정 사정', doc_submitted: 'TRUE', source: 'F6', linked_change_id: '', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  const p = preview(x);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  const row = p.list.find((l) => l.id === pending.id);
  assert.ok(row.skipped, '건너뛴 이유가 목록에 보인다: ' + JSON.stringify(row));
  assert.strictEqual(p.skipped.length, p.list.filter((l) => l.skipped).length);
  assert.strictEqual(p.count, t.length - p.skipped.length);
  const r = call(x, ADMIN, 'saveBatchLeave', input(), p.expect);
  assert.deepStrictEqual([r.ok, r.skipped], [true, p.skipped.length]);
  assert.strictEqual(heads(x, r.batchId).length, p.count);
});

test('일괄 퇴실도 자진 퇴실이라 재입실이 막힌다(결정 77①): 입퇴실 화면의 학사 입실 미리보기가 거부, 다른 학년 학생은 영향 없음', () => {
  const x = makeEnv();
  const { r } = saveOk(x, {});
  const s = studentsOf(x, 1).find((q) => heads(x, r.batchId).some((h) => h.student_id === q.id));
  x.env.setNow('2027-03-12T10:00:00');
  const re = call(x, ADMIN, 'previewMove', { studentId: s.id, type: '학사 입실', requestedAt: '2027-03-12T09:00:00', effectiveDate: '2027-03-12', docSubmitted: false, meals: { '조식': '실시', '석식': '학사 석식' } });
  assert.strictEqual(re.ok, false);
  assert.ok(re.errors.some((e) => /다시 들어올 수 없습니다/.test(e.message)), JSON.stringify(re.errors));
});

test('목록·되돌리기: 일괄 묶음이 최근순으로 나오고, 되돌리기 확인→저장하면 모든 학생이 학사 입실로 돌아오고 행은 취소로 남으며, 다시 되돌릴 수 없다', () => {
  const x = makeEnv();
  const { r } = saveOk(x, {});
  const l = call(x, ADMIN, 'listBatchLeaves').items;
  assert.deepStrictEqual([l.length, l[0].batchId, l[0].gradeText, l[0].live, l[0].canceled, l[0].canUndo], [1, r.batchId, '1학년', r.count, 0, true]);
  const pv = call(x, ADMIN, 'previewBatchUndo', r.batchId);
  assert.strictEqual(pv.ok, true, JSON.stringify(pv));
  assert.strictEqual(pv.count, r.count);
  const n = rowsAll(x).length;
  assert.strictEqual(call(x, ADMIN, 'undoBatchLeave', r.batchId, '가', pv.expect).ok, false, '사유 2자 이상');
  assert.strictEqual(call(x, ADMIN, 'undoBatchLeave', r.batchId, '잘못 처리', pv.expect + 'x').stale, true);
  assert.strictEqual(rowsAll(x).length, n);
  const u = call(x, ADMIN, 'undoBatchLeave', r.batchId, '날짜를 잘못 입력함', pv.expect);
  assert.deepStrictEqual([u.ok, u.count], [true, r.count]);
  assert.strictEqual(rowsAll(x).length, n, '행은 늘지도 줄지도 않는다(취소로 남는다)');
  const hs = heads(x, r.batchId);
  assert.ok(hs.every((h) => h.status === '취소' && h.cancel_reason === '날짜를 잘못 입력함'));
  const linked = rowsAll(x).filter((q) => hs.some((h) => h.id === q.linked_change_id));
  assert.ok(linked.length > 0 && linked.every((q) => q.status === '취소' && q.cancel_reason.indexOf('[자동] ') === 0));
  for (const h of hs) assert.strictEqual(valueOn(x, h.student_id, '학사', EFF), '입실');
  assert.deepStrictEqual(call(x, ADMIN, 'listBatchLeaves').items.map((i) => [i.live, i.canceled, i.canUndo]), [[0, r.count, false]]);
  const again = call(x, ADMIN, 'undoBatchLeave', r.batchId, '다시 되돌리기', pv.expect);
  assert.strictEqual(again.ok, false);
  assert.strictEqual(call(x, ADMIN, 'previewBatchUndo', r.batchId).ok, false);
  assert.strictEqual(call(x, ADMIN, 'previewBatchUndo', 'no-such').ok, false);
  // 되돌린 뒤에는 같은 학년을 다시 일괄 퇴실할 수 있다(옛 batchId와 별개)
  assert.strictEqual(saveOk(x, {}).r.ok, true);
});

test('되돌리기는 일괄 단위: 다른 일괄 퇴실·개별 퇴실에는 영향이 없다', () => {
  const x = makeEnv();
  const a = saveOk(x, { grade: '1' }).r;
  const b = saveOk(x, { grade: '2' }).r;
  const pv = call(x, ADMIN, 'previewBatchUndo', a.batchId);
  assert.strictEqual(call(x, ADMIN, 'undoBatchLeave', a.batchId, '1학년만 되돌림', pv.expect).ok, true);
  assert.ok(heads(x, b.batchId).every((h) => h.status === '유효'), '2학년 일괄은 그대로');
  assert.ok(heads(x, a.batchId).every((h) => h.status === '취소'));
});

test('일괄 퇴실 뒤 출석부에는 퇴실 학생이 없고 식수 집계가 줄어든다(좌석은 빈자리로만 보임)', () => {
  const x = makeEnv();
  const t = targetsOf(x, 1);
  const names = (d) => JSON.stringify(plain(x.env.call(ADMIN, 'getAttendanceSheet', d)));
  saveOk(x, {});
  const before = names('2027-03-09'), after = names('2027-03-11');   // 3/10은 휴일이라 출석부가 없다
  assert.ok(t.every((s) => before.includes(s.name)), '퇴실일 전날에는 출석부에 모두 있다');
  assert.ok(t.every((s) => !after.includes(s.name)), '퇴실일 뒤에는 출석부에서 빠진다');
  const c = (d) => plain(x.env.call(ADMIN, 'getMealCounts', d)).rows.find((r) => r.key === '전체');
  assert.ok(Number(c(EFF).hall) < Number(c('2027-03-09').hall), '식수 집계 학사 인원이 줄었다');
});

test('대기 중이던 급식 신청은 일괄 퇴실이 취소(꼬리표 [자동] <대표 id>)하고, 되돌리기가 다시 살린다 — 쓰기는 모아서 한 번에', () => {
  const x = makeEnv();
  const s = targetsOf(x, 1).find((q) => valueOn(x, q.id, '기숙사', EFF) === '입실');
  assert.ok(s, '기숙사생 대상 학생');
  x.env.asOwner((c) => c.bulkUpdateRecords_('status_changes', x.env.rows('status_changes').filter((r) => r.source === '명단업로드').map((r) => ({ id: r.id, patch: { requested_at: '' } })), x.env.owner));   // moves.test와 같은 준비
  const mi = { studentId: s.id, chip: 'd_hall', requestedAt: '2027-03-03T15:30:00', docSubmitted: true, effectiveDate: '2027-03-20', reason: '급식실 요청' };
  assert.strictEqual(call(x, ADMIN, 'saveMealChange', mi, call(x, ADMIN, 'previewMealChange', mi).expect).ok, true);   // 퇴실 신청(15:00)보다 늦게 신청한 3/20 학사 석식
  const pending = rowsAll(x).find((r) => r.student_id === s.id && r.effective_date === '2027-03-20' && r.source === 'F7');
  assert.ok(pending, '대기 중인 급식 신청');
  const upd0 = x.env.rows('audit_log').filter((a) => a.action === 'bulk_update').length;
  const { r } = saveOk(x, {});
  const head = heads(x, r.batchId).find((h) => h.student_id === s.id);
  const after = rowsAll(x).find((q) => q.id === pending.id);
  assert.strictEqual(after.status, '취소');
  assert.strictEqual(after.cancel_reason.indexOf('[자동] ' + head.id + ' '), 0, after.cancel_reason);
  assert.strictEqual(x.env.rows('audit_log').filter((a) => a.action === 'bulk_update').length, upd0 + 1, '취소·되살림은 한 번의 bulkUpdateRecords_');
  const pv = call(x, ADMIN, 'previewBatchUndo', r.batchId);
  assert.strictEqual(call(x, ADMIN, 'undoBatchLeave', r.batchId, '되돌리는 시험', pv.expect).ok, true);
  const back = rowsAll(x).find((q) => q.id === pending.id);
  assert.deepStrictEqual([back.status, back.cancel_reason], ['유효', ''], '대기 중이던 신청서가 되살아난다');
});
