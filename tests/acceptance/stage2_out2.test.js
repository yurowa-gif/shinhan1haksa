/**
 * T2 끝까지 ③(stage2.md 7절): 2OUT은 면담 기록 전 퇴실 확정이 막히고, 기록 후 F6 학사 퇴실 신청이 미리 채워진다.
 * 한 흐름: F4 직접 OUT(담당교사) + F1 미인정결석 자동 1OUT(출결 담당) → 2OUT → 확정 막힘 → 담당교사 면담 기록 →
 * 관리자 확정(prefill) → 담당교사 저장 거부 → 관리자 saveMove(outDismissal) → 학사 퇴실 + 급식 정리 → '이미 퇴실'.
 * 면담 내용(표식 글자)은 운영 DB·응답·근무교사 화면 어디에도 없고, 출석부에는 OUT 표시가 없다(결정 36). 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', ATT = 'fake.teacher3@example.com', DUTY_T = 'fake.teacher1@example.com';
const TODAY = '2027-03-12', NOW = TODAY + 'T20:00:00', MARK = 'ZZ-면담-표식-T2';

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: NOW });
  env.scriptProps.TEST_TEACHER_EMAIL = HALL;
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage2());
  env.strictLock = true;
  return env;
}

test('끝까지 ③: 직접 OUT + 자동 OUT → 2OUT → 면담 전 확정 막힘 → 면담 → prefill → 관리자만 퇴실 저장 → 급식 정리, 면담 내용은 새지 않음', () => {
  const env = seededEnv();
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const vtab = 'violations_' + term.id.slice(0, 8);
  const changes = () => env.rows('status_changes');
  const busy = new Set(changes().filter((r) => r.source !== '명단업로드').map((r) => r.student_id)
    .concat(env.rows(vtab).map((v) => v.student_id), env.rows('exceptions_' + term.id.slice(0, 8)).map((e) => e.student_id)));
  const late = new Set(changes().filter((r) => r.item === '학사' && r.effective_date > term.start_date).map((r) => r.student_id));
  const S = env.rows('enrollments').find((e) => e.term_id === term.id && e.teacher_email === HALL && !busy.has(e.student_id) && !late.has(e.student_id)).student_id;
  const dorm = changes().some((r) => r.student_id === S && r.item === '기숙사' && r.value === '입실');
  const other = env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id !== S && !busy.has(e.student_id) && !late.has(e.student_id)).student_id;
  const rowsOfS = () => changes().filter((r) => r.student_id === S);
  const responses = [];   // 화면이 받은 응답 전부(면담 내용이 새지 않는지 마지막에 본다)
  const call = (who, fn, ...args) => { const r = plain(env.call(who, fn, ...args)); responses.push(r); return r; };

  // 1) F4 직접 OUT(담당교사, 3/10) + F1 미인정결석 확정 → 자동 1OUT(출결 담당, 3/11)
  const phone = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const o1 = call(HALL, 'saveOut', { studentId: S, occurredAt: '2027-03-10T21:00', ruleId: phone.id, detectedBy: '', memo: '자습 중 휴대폰' });
  assert.strictEqual(o1.ok, true, JSON.stringify(o1));
  assert.deepStrictEqual(call(ADMIN, 'confirmOutDismissal', S), { ok: false, reason: '퇴실 대상 아님' }, '1OUT일 때');
  const ex = call(ATT, 'saveException', { studentId: S, from: '2027-03-11', to: '2027-03-11', blocks: 'ALL', type: '미인정결석', reason: '' });
  assert.strictEqual(ex.ok, true, JSON.stringify(ex));
  const outs = env.rows(vtab).filter((v) => v.student_id === S && v.status === '유효');
  assert.deepStrictEqual(outs.map((v) => v.source).sort(), ['F1자동', '직접'], '2OUT = 직접 1 + 자동 1');

  // 2) 면담 전: 확정 관문이 막고, 관리자 saveMove(outDismissal)도 거부, 행은 그대로
  assert.deepStrictEqual(call(ADMIN, 'confirmOutDismissal', S), { ok: false, reason: '면담 기록 필요' });
  assert.deepStrictEqual(call(ADMIN, 'confirmOutDismissal', other), { ok: false, reason: '퇴실 대상 아님' }, 'OUT 없는 학생');
  const type = dorm ? '학사 및 기숙사 퇴실' : '학사 퇴실';
  const inp = (o) => Object.assign({ studentId: S, type, requestedAt: '2027-03-12T20:00:00', effectiveDate: '2027-03-13', dinner: '중단', docSubmitted: false, outDismissal: true }, o || {});
  const n0 = rowsOfS().length;
  const early = call(ADMIN, 'previewMove', inp());
  assert.strictEqual(early.ok, false); assert.strictEqual(early.errors[0].message, '면담 기록 필요');
  // 락 안에서 관문을 다시 본다: 오래된 서명(stale) 때문이 아니라 '면담 기록 필요'로 막혀야 한다
  assert.deepStrictEqual(call(ADMIN, 'saveMove', inp(), '').errors.map((e) => e.message), ['면담 기록 필요']);
  assert.strictEqual(rowsOfS().length, n0);

  // 3) 면담 기록(담당교사): 둘째 OUT(3/11)보다 앞선 날짜는 받지 않는다(결정 51), 3/12는 받는다
  assert.strictEqual(call(HALL, 'saveOutMeeting', { studentId: S, date: '2027-03-10', content: MARK + ' 이른 날짜' }).ok, false);
  const m = call(HALL, 'saveOutMeeting', { studentId: S, date: TODAY, content: MARK + ' 학부모 통화' });
  assert.strictEqual(m.ok, true, JSON.stringify(m));

  // 4) 관리자 확정 → prefill: 학생·사유 '2OUT 퇴실'·적용일 확정 다음 날, 유형은 미리 고르지 않음(결정 50), 면담 내용 없음
  const conf = call(ADMIN, 'confirmOutDismissal', S);
  assert.strictEqual(conf.ok, true, JSON.stringify(conf));
  assert.deepStrictEqual([conf.prefill.studentId, conf.prefill.reason, conf.prefill.effectiveDate, conf.prefill.type], [S, '2OUT 퇴실', '2027-03-13', undefined]);
  assert.strictEqual(conf.prefill.meeting.date, TODAY);

  // 5) 담당교사는 확정 저장을 못 한다(denied:out.dismiss)
  env.expectDenied(HALL, 'out.dismiss', 'saveMove', inp(), '');
  // 6) 유형을 고르지 않으면 저장 안 됨 → 관리자가 유형을 골라 prefill 값으로 저장
  assert.ok(call(ADMIN, 'saveMove', inp({ type: '' }), '').errors.some((e) => e.field === 'type'));
  const pre = inp({ effectiveDate: conf.prefill.effectiveDate });
  const p = call(ADMIN, 'previewMove', pre);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  const saved = call(ADMIN, 'saveMove', pre, p.expect);
  assert.strictEqual(saved.ok, true, JSON.stringify(saved));
  const added = rowsOfS().slice(n0), head = added.find((r) => r.id === saved.id);
  assert.deepStrictEqual([head.item, head.value, head.effective_date, head.reason, String(head.doc_submitted).toUpperCase(), head.source],
    ['학사', '퇴실', '2027-03-13', '2OUT 퇴실', 'FALSE', 'F6']);
  assert.ok(/^\[2OUT\] out:[0-9a-f-]{36} note:[0-9a-f-]{36}$/.test(head.memo), head.memo);
  const linked = added.filter((r) => r.linked_change_id === head.id);
  assert.ok(linked.some((r) => r.item === '석식' && r.value === '미실시'), '석식 정리 행');
  if (dorm) assert.ok(linked.some((r) => r.item === '조식' && r.value === '미실시' && r.effective_date === '2027-03-13'), '조식은 퇴실일 즉시');
  const on = (item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), S, item, ymd));
  assert.deepStrictEqual([on('학사', '2027-03-12'), on('학사', '2027-03-13')], ['입실', '퇴실']);
  assert.deepStrictEqual(call(ADMIN, 'confirmOutDismissal', S), { ok: false, reason: '이미 퇴실' });

  // 7) 예약어: outDismissal 없는 일반 saveMove는 사유 '2OUT 퇴실'을 쓸 수 없다(다른 학생)
  const odorm = changes().some((r) => r.student_id === other && r.item === '기숙사' && r.value === '입실');
  const fake2 = { studentId: other, type: odorm ? '학사 및 기숙사 퇴실' : '학사 퇴실', requestedAt: '2027-03-12T20:00:00', effectiveDate: '2027-03-13', dinner: '중단', docSubmitted: false, reason: '2OUT 퇴실' };
  const before2 = changes().length;
  const r2 = call(ADMIN, 'saveMove', fake2, '');
  assert.strictEqual(r2.ok, false, '예약어 거부 ' + JSON.stringify(r2));
  assert.ok(r2.errors.some((e) => e.field === 'reason'), '사유 칸 오류로 막힘(오래된 서명 때문이 아님) ' + JSON.stringify(r2));
  assert.strictEqual(changes().length, before2);

  // 8) 새는 곳 없음: 운영 DB audit_log·상태 행, 화면 응답, 근무교사의 학생 기록 화면에 면담 내용 없음
  assert.ok(!JSON.stringify(env.rows('audit_log')).includes(MARK), 'audit_log');
  assert.ok(!JSON.stringify(changes()).includes(MARK), 'status_changes');
  assert.ok(!JSON.stringify(responses).includes(MARK), '응답');
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '단독', end_time: '23:00', original_email: DUTY_T, actual_email: DUTY_T,
    swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  const st = plain(env.call(DUTY_T, 'listStudentStatus', S, TODAY));
  const stj = JSON.stringify(st);
  assert.ok(!stj.includes(MARK) && !stj.includes('면담'), '근무교사 화면에 면담 표식·내용 없음');
  assert.ok(!stj.includes('[2OUT]') && !stj.includes(head.memo.split('note:')[1]), '근무교사 화면에 [2OUT] 메모·면담 기록 id 없음');

  // 9) 그날 출석부 모델에 OUT 표시가 없다(결정 36)
  const sheet = plain(env.call(ADMIN, 'getAttendanceSheet', TODAY));
  assert.ok(!/\dOUT|퇴실 대상/.test(JSON.stringify(sheet)), '출석부에 OUT 표시 없음');
});
