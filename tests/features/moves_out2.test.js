/** C20 2OUT 퇴실 확정 → F6 saveMove(outDismissal): R4 gas-fakes. 가짜 데이터만. 면담 내용(표식 글자)은 운영 DB 어디에도 없어야 한다. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', T1 = 'test.teacher@example.com';
const TODAY = '2027-03-03', MARK = 'ZZ-면담-표식';

function makeEnv() {
  const env = createGasEnv({ now: TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const left = (s) => env.rows('status_changes').some((c) => c.student_id === s.id && c.item === '학사' && c.effective_date > TODAY);
  const mine = env.rows('students').find((s) => !left(s) && enr.some((e) => e.student_id === s.id && e.teacher_email === T1));
  const rule = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  const tab = 'violations_' + term.id.slice(0, 8);
  const addOut = (at) => env.asOwner((c) => c.appendRecord_(tab, { term_id: term.id, student_id: mine.id, occurred_at: at, rule_id: rule.id, rule_name: rule.name, memo: '',
    detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  const dorm = env.rows('status_changes').some((r) => r.student_id === mine.id && r.item === '기숙사' && r.value === '입실');
  return { env, mine, addOut, tab, type: dorm ? '학사 및 기숙사 퇴실' : '학사 퇴실',
    rows: () => env.rows('status_changes').filter((r) => r.student_id === mine.id), denied: (a) => env.rows('audit_log').filter((x) => x.action === 'denied:' + a).length };
}
const two = (x) => { x.addOut('2027-03-02T20:00:00'); x.addOut('2027-03-03T19:00:00'); };
const meet = (x) => plain(x.env.call(T1, 'saveOutMeeting', { studentId: x.mine.id, date: TODAY, content: MARK + ' 통화' }));
const inp = (x, o) => Object.assign({ studentId: x.mine.id, type: x.type, requestedAt: '2027-03-03T19:30:00', effectiveDate: '2027-03-04', dinner: '중단', docSubmitted: false, outDismissal: true }, o || {});
const prev = (x, who, i) => plain(x.env.call(who, 'previewMove', i));
const save = (x, who, i, expect) => plain(x.env.call(who, 'saveMove', i, expect));
const go = (x, who, o) => save(x, who, inp(x, o), prev(x, who, inp(x, o)).expect);

test('면담 전에는 관리자도 outDismissal 미리보기·저장이 거부되고 행이 생기지 않는다(퇴실 대상 아님·면담 기록 필요)', () => {
  const x = makeEnv();
  const n0 = x.rows().length;
  let p = prev(x, ADMIN, inp(x));
  assert.strictEqual(p.ok, false); assert.strictEqual(p.errors[0].message, '퇴실 대상 아님');
  x.addOut('2027-03-02T20:00:00'); x.addOut('2027-03-03T19:00:00');
  p = prev(x, ADMIN, inp(x)); assert.strictEqual(p.ok, false); assert.strictEqual(p.errors[0].message, '면담 기록 필요');
  const r = save(x, ADMIN, inp(x), '');
  assert.strictEqual(r.ok, false); assert.strictEqual(r.errors[0].message, '면담 기록 필요');
  assert.strictEqual(x.rows().length, n0);
});

test('면담 뒤: 담당교사의 saveMove·previewMove(outDismissal)는 denied:out.dismiss로 거부, 관리자는 허용', () => {
  const x = makeEnv(); two(x); meet(x);
  const n0 = x.rows().length, d0 = x.denied('out.dismiss');
  x.env.expectDenied(T1, 'out.dismiss', 'saveMove', inp(x), '');
  x.env.expectDenied(T1, 'out.dismiss', 'previewMove', inp(x));
  assert.strictEqual(x.denied('out.dismiss'), d0 + 2); assert.strictEqual(x.rows().length, n0);
  const p = prev(x, ADMIN, inp(x)); assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.strictEqual(save(x, ADMIN, inp(x), p.expect).ok, true);
});

test('저장: 학사 퇴실 행(사유 2OUT 퇴실, 서류 미제출, memo는 UUID만)과 급식 정리 행이 생기고 면담 내용·날짜는 운영 DB에 없다', () => {
  const x = makeEnv(); two(x); meet(x);
  const note = x.env.rows('counsel_notes', 'counsel')[0];
  const second = x.env.rows(x.tab).filter((v) => v.student_id === x.mine.id).sort((a, b) => a.occurred_at < b.occurred_at ? -1 : 1)[1];
  const n0 = x.rows().length;
  const r = go(x, ADMIN);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const added = x.rows().slice(n0), head = added.find((a) => a.id === r.id);
  assert.deepStrictEqual([head.item, head.value, head.effective_date, head.reason, String(head.doc_submitted).toUpperCase(), head.source], ['학사', '퇴실', '2027-03-04', '2OUT 퇴실', 'FALSE', 'F6']);
  assert.strictEqual(head.memo, '[2OUT] out:' + second.id + ' note:' + note.id);
  assert.ok(/^\[2OUT\] out:[0-9a-f-]{36} note:[0-9a-f-]{36}$/.test(head.memo));
  const dinner = added.find((a) => a.item === '석식' && a.linked_change_id === r.id);
  assert.ok(dinner && dinner.value === '미실시', '석식 정리 행(중단)');
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(head.reason + head.memo), '사유·메모에 날짜 없음');
  assert.ok(!JSON.stringify(added).includes(MARK) && !JSON.stringify(x.env.rows('audit_log')).includes(MARK));
});

test('유형을 고르지 않거나 학사 퇴실 계열이 아니면 저장 안 됨, 화면이 보낸 사유는 무시하고 서버가 2OUT 퇴실로 쓴다', () => {
  const x = makeEnv(); two(x); meet(x);
  const n0 = x.rows().length;
  let r = save(x, ADMIN, inp(x, { type: '' }), ''); assert.strictEqual(r.ok, false); assert.ok(r.errors.some((e) => e.field === 'type'));
  r = save(x, ADMIN, inp(x, { type: '기숙사 퇴실' }), ''); assert.strictEqual(r.ok, false); assert.ok(r.errors.some((e) => e.field === 'type'));
  assert.strictEqual(x.rows().length, n0);
  const g = go(x, ADMIN, { reason: '내가 쓴 사유' }); assert.strictEqual(g.ok, true, JSON.stringify(g));
  assert.strictEqual(x.rows().find((a) => a.id === g.id).reason, '2OUT 퇴실');
});

test('예약어: 일반 saveMove(관리자 포함)는 사유 2OUT 퇴실·[2OUT]… 을 거부하고, outDismissal 없이는 면담 뒤에도 쓸 수 없다', () => {
  const x = makeEnv(); two(x); meet(x);
  const n0 = x.rows().length;
  ['2OUT 퇴실', '2OUT  퇴실', '[2OUT] out:x note:y'].forEach((reason) => {
    [ADMIN, T1].forEach((who) => {
      const i = inp(x, { reason, outDismissal: false });
      const r = save(x, who, i, '');
      assert.strictEqual(r.ok, false, who + reason); assert.ok(r.errors.some((e) => e.field === 'reason'));
      assert.strictEqual(prev(x, who, i).ok, false);
    });
  });
  assert.strictEqual(x.rows().length, n0);
});

test('같은 신청서를 두 번 보내면 대표 행은 하나, 두 번째는 duplicate', () => {
  const x = makeEnv(); two(x); meet(x);
  const i = inp(x), p = prev(x, ADMIN, i);
  const a = save(x, ADMIN, i, p.expect), n1 = x.rows().length;
  const b = save(x, ADMIN, i, p.expect);
  assert.strictEqual(a.ok, true); assert.strictEqual(b.ok, true); assert.strictEqual(b.duplicate, true); assert.strictEqual(b.id, a.id);
  assert.strictEqual(x.rows().length, n1);
  assert.strictEqual(x.rows().filter((r) => r.item === '학사' && r.value === '퇴실' && r.reason === '2OUT 퇴실').length, 1);
});

test('락 안 재확인: 미리보기 뒤 면담이 취소되면 저장이 거부된다(화면의 확정 가능 표시를 믿지 않는다)', () => {
  const x = makeEnv(); two(x); meet(x);
  const i = inp(x), p = prev(x, ADMIN, i); assert.strictEqual(p.ok, true);
  const note = x.env.rows('counsel_notes', 'counsel')[0];
  const c = plain(x.env.call(T1, 'cancelOutMeeting', note.id, '다시 면담')); assert.strictEqual(c.ok, true, JSON.stringify(c));
  const n0 = x.rows().length;
  const r = save(x, ADMIN, i, p.expect);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.errors[0].message, '면담 기록 필요'); assert.strictEqual(x.rows().length, n0);
});

test('적용일이 이번 기간 밖이면 2OUT 퇴실은 거부된다', () => {
  const x = makeEnv(); two(x); meet(x);
  const r = save(x, ADMIN, inp(x, { effectiveDate: '2027-12-30' }), '');
  assert.strictEqual(r.ok, false);
});

test('같은 값의 일반 퇴실 신청서가 이미 있어도 2OUT 퇴실 신청을 그 행의 중복으로 보지 않는다', () => {
  const x = makeEnv(); two(x); meet(x);
  const plainIn = inp(x, { outDismissal: false, reason: '가정 사정' }), p = prev(x, ADMIN, plainIn);
  const a = save(x, ADMIN, plainIn, p.expect); assert.strictEqual(a.ok, true, JSON.stringify(a));
  const r = save(x, ADMIN, inp(x), '');
  assert.ok(!r.duplicate, '일반 행을 2OUT 신청의 중복으로 돌려주지 않는다'); assert.strictEqual(r.ok, false);
  assert.strictEqual(x.rows().filter((q) => q.reason === '2OUT 퇴실').length, 0);
});

// ── 총괄 검토 nit(#100) ──
const makeAt = (day, hour) => {   // now를 바꿔 만든 환경(기간 끝날 확정 등)
  const env = createGasEnv({ now: day + 'T' + (hour || '20:00:00') });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  return env;
};

test('기간 마지막 날(7/17)에 확정하면 기본 적용일(다음 날 7/18)도 저장된다. 끝난 다음 날보다 늦거나 기간 시작 전이면 거부', () => {
  const y = (() => {   // now가 7/17인 새 환경에 같은 준비를 한다
    const e = makeAt('2027-07-17');
    const term = e.rows('terms').find((t) => t.name === '2027 1학기');
    const enr = e.rows('enrollments').filter((q) => q.term_id === term.id);
    const mine = e.rows('students').find((s) => enr.some((q) => q.student_id === s.id && q.teacher_email === T1) && !e.rows('status_changes').some((c) => c.student_id === s.id && c.item === '학사' && c.effective_date > '2027-07-17'));
    const rule = e.rows('violation_rules').find((r) => r.name.startsWith('휴대폰')), tab = 'violations_' + term.id.slice(0, 8);
    ['2027-07-16T20:00:00', '2027-07-17T19:00:00'].forEach((at) => e.asOwner((c) => c.appendRecord_(tab, { term_id: term.id, student_id: mine.id, occurred_at: at, rule_id: rule.id, rule_name: rule.name, memo: '', detected_by: T1, entered_by: T1, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN)));
    const dorm = e.rows('status_changes').some((r) => r.student_id === mine.id && r.item === '기숙사' && r.value === '입실');
    return { env: e, mine, type: dorm ? '학사 및 기숙사 퇴실' : '학사 퇴실', rows: () => e.rows('status_changes').filter((r) => r.student_id === mine.id) };
  })();
  plain(y.env.call(T1, 'saveOutMeeting', { studentId: y.mine.id, date: '2027-07-17', content: MARK }));
  const base = { studentId: y.mine.id, type: y.type, requestedAt: '2027-07-17T19:30:00', dinner: '중단', docSubmitted: false, outDismissal: true };
  const tryEff = (eff) => { const i = Object.assign({ effectiveDate: eff }, base); const p = plain(y.env.call(ADMIN, 'previewMove', i)); return { p, s: plain(y.env.call(ADMIN, 'saveMove', i, p.expect || '')) }; };
  const late = tryEff('2027-07-19'); assert.strictEqual(late.s.ok, false); assert.ok(late.s.errors.some((e) => e.field === 'effectiveDate'));
  const early = tryEff('2027-03-01'); assert.strictEqual(early.s.ok, false); assert.ok(early.s.errors.some((e) => e.field === 'effectiveDate'));
  const ok = tryEff('2027-07-18'); assert.strictEqual(ok.s.ok, true, JSON.stringify(ok));
  assert.ok(y.rows().some((r) => r.item === '학사' && r.value === '퇴실' && r.effective_date === '2027-07-18' && r.reason === '2OUT 퇴실'));
});

test('적용일이 면담 날짜보다 이르면 거부(둘째 OUT·면담이 3/3인데 3/2 퇴실)', () => {
  const x = makeEnv(); two(x); meet(x);
  const r = save(x, ADMIN, inp(x, { effectiveDate: '2027-03-02' }), '');
  assert.strictEqual(r.ok, false); assert.ok(r.errors.some((e) => e.field === 'effectiveDate' && /면담/.test(e.message)));
});

test('같은 신청서인데 석식 선택이 다르면 "이미 저장"이 아니라 다른 내용으로 저장됨을 알린다', () => {
  const x = makeEnv(); two(x); meet(x);
  const a = go(x, ADMIN); assert.strictEqual(a.ok, true);
  const i = inp(x, { dinner: '일반 석식' }), p = prev(x, ADMIN, i);
  const b = save(x, ADMIN, i, p.expect || '');
  assert.strictEqual(b.ok, false); assert.ok(!b.duplicate); assert.match(b.errors[0].message, /다른 내용으로 이미 저장/);
  assert.strictEqual(x.rows().filter((q) => q.reason === '2OUT 퇴실').length, 1);
});
