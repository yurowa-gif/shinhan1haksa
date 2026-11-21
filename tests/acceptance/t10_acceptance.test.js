/**
 * T10 인수 시험: C46 확인함 getInbox(#290), C48 홈 숫자(#293), C47 월간 보기(#289), D17·D18 홈(#292·#294). 가짜 데이터만.
 *  1) 역할 행렬: getInbox — 관리자·출결 담당·학사 교사만(inbox.view), 담임·근무표 담당·학생·학부모·외부인 거부
 *  2) 범위: 출결 담당은 특이사항 요청만, 학사 교사는 자기 담당 학생 줄만, 다른 교사 학생은 안 보임
 *  3) 유출: 확인함 줄에 사유·전화·이메일·OUT 메모·상담 내용이 없다
 *  4) 동치: 홈 숫자(exc.pending·timetable.confirmPending) = 확인함 줄 수, 관리자·출결 담당 홈의 moves.overdue가 같다
 *           월간 보기 학생별 합계(getResultTotals) = 결과 격자 칸 기호를 센 값, outs = OUT 화면 학생별 OUT 수
 * 홈의 모든 줄 링크가 권한 없는 화면으로 가지 않는지는 브라우저로 그려야 보여서 기기 행렬(npm run devices, '링크' 판정)이 본다.
 */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');
const { portalAccounts, PHONE_RE } = require('../helpers/portal');

const ADMIN = 'owner@example.com', HOMEROOM = 'test.homeroom@example.com', ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';
const OUTSIDER = 'stranger@fake-school.test';
const TODAY = '2027-03-26';   // 4월 시간표 제출 기간
const REASON = '가짜 사유 [T10-RSN] 010-0000-7777 leak.mail@fake-school.test';
const MARK = { reason: '[T10-RSN]', counsel: '[T10-CN]', outMemo: '[T10-OUTMEMO]' };
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SYMBOL = { '결석': '×', '지각': '△', '조퇴': '조' };

function setup() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: 'test.teacher@example.com', TEST_HOMEROOM_EMAIL: HOMEROOM });
  ['setup', 'seedFakeData', 'seedFakeStage1', 'seedFakeStage2', 'seedFakeStage3'].forEach((f) => env.asOwner((c) => c[f]()));
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  const acc = portalAccounts(env);
  const term = env.as(ADMIN, (c) => c.getCurrentTerm_());
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const hallA = enr.find((e) => e.student_id === acc.A.id).teacher_email;
  const hallOther = env.rows('users').find((u) => String(u.roles).split(',').includes('hall_teacher') && !String(u.roles).includes('admin') && u.email !== hallA).email;
  const ok = (r, w) => { assert.strictEqual(r.ok, true, w + ' ' + JSON.stringify(r).slice(0, 300)); return r; };
  // 표시를 심는다: A의 특이사항 요청(사유에 전화·이메일), 4월 시간표 동의(→ 담당교사 확인 대기), 상담·OUT 메모
  ok(env.call(hallA, 'saveException', { studentId: acc.A.id, from: '2027-03-29', to: '2027-03-29', blocks: '18:00-20:00', type: '학원(보강 포함)', reason: REASON }), '요청');
  ok(env.call(acc.A.email, 'submitTimetable', { month: '2027-04', entries: [{ weekday: '화', blocks: '18:30-20:00', code: '학' }] }), '시간표 제출');
  ok(env.call(acc.P1.email, 'agreeTimetable', acc.A.id, '2027-04'), '동의');
  ok(env.call(hallA, 'saveCounselNote', { studentId: acc.A.id, date: '2027-03-20', type: '생활', target: '학생', content: '가짜 ' + MARK.counsel, showToParent: false }), '상담');
  const rule = env.rows('violation_rules')[0];
  env.asOwner((c) => c.appendRecord_('violations_' + term.id.slice(0, 8), { term_id: term.id, student_id: acc.A.id, occurred_at: '2027-03-15T20:00:00', rule_id: rule.id, rule_name: rule.name,
    memo: '가짜 ' + MARK.outMemo, detected_by: hallA, entered_by: hallA, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  return { env, acc, term, enr, hallA, hallOther, ok };
}

test('T10 역할 행렬: getInbox는 관리자·출결 담당·학사 교사만, 담임·근무표 담당·학생·학부모·외부인은 denied:inbox.view', () => {
  const { env, acc, hallA, hallOther } = setup();
  for (const who of [ADMIN, ATT, hallA, hallOther]) env.expectAllowed(who, 'getInbox');
  for (const who of [HOMEROOM, DUTYM, acc.A.email, acc.B.email, acc.P1.email, acc.P2.email, OUTSIDER]) env.expectDenied(who, 'inbox.view', 'getInbox');
});

test('T10 확인함 범위·유출: 출결 담당은 특이사항 요청만, 학사 교사는 자기 담당 학생 줄만(남의 교사는 A 줄 없음), 관리자는 모두 — 줄에 사유·전화·이메일·메모·상담 내용 없음', () => {
  const { env, acc, enr, hallA, hallOther } = setup();
  const inbox = (who) => env.call(who, 'getInbox');
  const labelOf = (sid) => { const s = env.rows('students').find((x) => x.id === sid); return s.grade + '. ' + s.name; };
  const att = inbox(ATT), a = inbox(hallA), o = inbox(hallOther), adm = inbox(ADMIN);
  assert.ok(att.items.length > 0 && att.items.every((i) => i.kind === 'exception'), '출결 담당 = 특이사항 요청만 ' + JSON.stringify(att.counts));
  assert.ok(att.items.some((i) => i.studentLabel === labelOf(acc.A.id)), 'A의 요청이 출결 담당 확인함에');
  const mineLabels = new Set(enr.filter((e) => e.teacher_email === hallA).map((e) => labelOf(e.student_id)));
  assert.ok(a.items.length > 0 && a.items.every((i) => mineLabels.has(i.studentLabel) && i.kind !== 'exception'), '담당교사 = 자기 학생, 특이사항 요청 처리는 아님 ' + JSON.stringify(a.counts));
  assert.ok(a.items.some((i) => i.kind === 'timetable' && i.studentLabel === labelOf(acc.A.id)), 'A의 시간표 확인 대기');
  assert.ok(!o.items.some((i) => i.studentLabel === labelOf(acc.A.id)), '다른 교사에게 A 줄 없음');
  assert.ok(['exception', 'timetable'].every((k) => adm.counts[k] >= 1), '관리자는 모두 ' + JSON.stringify(adm.counts));
  const leaks = [];
  for (const [who, r] of [[ATT, att], [hallA, a], [hallOther, o], [ADMIN, adm]]) {
    const t = textOf(r.items);
    for (const m of t.matchAll(PHONE_RE)) leaks.push(who + ' 전화 ' + m[0]);
    for (const m of t.match(EMAIL_RE) || []) leaks.push(who + ' 이메일 ' + m);
    for (const k of Object.values(MARK)) if (t.includes(k)) leaks.push(who + ' 표시 ' + k);
  }
  assert.deepStrictEqual(leaks, []);
});

test('T10 동치(C48): 홈 숫자 = 확인함 — 관리자·출결 담당 exc.pending = 특이사항 요청 줄 수, 관리자 timetable.confirmPending = 시간표 줄 수, moves.overdue는 두 홈이 같다', () => {
  const { env, acc } = setup();
  // 임시 퇴실 한 건: 3월 10일에 3월 12일부터 퇴실·복귀 예정 3월 20일로 저장 → 오늘(3월 26일)은 복귀 예정일이 지났다
  const dorm = env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), acc.C.id, '기숙사', '2027-03-10')) === '입실';
  const mv = { studentId: acc.C.id, type: dorm ? '학사 및 기숙사 임시 퇴실' : '학사 임시 퇴실', requestedAt: '2027-03-10T10:00:00', effectiveDate: '2027-03-12', dinner: '중단', docSubmitted: false, returnDate: '2027-03-20', reason: '가짜 입원' };
  env.setNow('2027-03-10T10:00:00');
  const pv = env.call(ADMIN, 'previewMove', mv);
  assert.strictEqual(pv.ok, true, JSON.stringify(pv).slice(0, 300));
  assert.strictEqual(env.call(ADMIN, 'saveMove', mv, pv.expect).ok, true);
  env.setNow(TODAY + 'T10:00:00');
  const adm = env.call(ADMIN, 'getHomeData', 'admin'), att = env.call(ATT, 'getHomeData', 'attendance');
  const ia = env.call(ADMIN, 'getInbox'), it = env.call(ATT, 'getInbox');
  assert.strictEqual(adm.exc.pending, ia.counts.exception || 0, '관리자 홈 요청 수 = 확인함');
  assert.strictEqual(att.exc.pending, it.counts.exception || 0, '출결 담당 홈 요청 수 = 확인함');
  assert.strictEqual(adm.timetable.confirmPending, ia.counts.timetable || 0, '관리자 홈 시간표 확인 대기 = 확인함');
  assert.ok(adm.timetable.confirmPending >= 1 && adm.exc.pending >= 1, '0이 아닌 값으로 비교');
  assert.strictEqual(att.moves.overdue, adm.moves.overdue, '복귀 지남 수는 두 홈이 같다');
  assert.ok(adm.moves.overdue >= 1, '0이 아닌 값으로 비교 ' + adm.moves.overdue);
  assert.strictEqual(adm.moves.overdue, adm.food.tempLeave.n, '관리자 홈 식사 카드의 임시 퇴실 지남 수와 같은 계산');
  assert.ok(!('timetable' in att) || att.timetable.confirmPending === undefined, '출결 담당 홈에는 시간표 확인 숫자가 없다');
  // 처리하면 둘이 함께 준다
  const tt = env.call(env.rows('enrollments').find((e) => e.student_id === acc.A.id).teacher_email, 'confirmTimetable', acc.A.id, '2027-04');
  assert.strictEqual(tt.ok, true, JSON.stringify(tt));
  assert.deepStrictEqual([env.call(ADMIN, 'getHomeData', 'admin').timetable.confirmPending, env.call(ADMIN, 'getInbox').counts.timetable || 0], [adm.timetable.confirmPending - 1, (ia.counts.timetable || 0) - 1]);
});

test('T10 동치(C47): 월간 보기 학생별 합계 = 결과 격자 칸 기호를 센 값(결석·지각·조퇴), outs = OUT 화면의 학생별 OUT 수(취소 OUT은 빼고)', () => {
  const { env, acc, term } = setup();
  // 3월 결과 몇 칸 + OUT 하나 취소
  const save = (cells) => { const payload = { range: { from: '2027-03-01', to: '2027-03-25' }, cells }; const p = env.call(ATT, 'previewResults', payload); assert.strictEqual(p.ok, true, JSON.stringify(p).slice(0, 300)); assert.strictEqual(env.call(ATT, 'saveResults', payload, p.sig).ok, true); };
  save([{ studentId: acc.B.id, date: '2027-03-17', kind: '지각', type: '병지각' }, { studentId: acc.C.id, date: '2027-03-18', kind: '조퇴', type: '병조퇴' }, { studentId: acc.C.id, date: '2027-03-19', kind: '결석', type: '병결' }]);
  const vtab = 'violations_' + term.id.slice(0, 8);
  const extra = env.rows('violation_rules')[1] || env.rows('violation_rules')[0];
  const made = env.asOwner((c) => c.appendRecord_(vtab, { term_id: term.id, student_id: acc.B.id, occurred_at: '2027-03-16T20:00:00', rule_id: extra.id, rule_name: extra.name, memo: '가짜', detected_by: ADMIN, entered_by: ADMIN, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  env.asOwner((c) => c.updateRecord_(vtab, made.id, { status: '취소', cancel_reason: '가짜 취소' }, ADMIN));
  const f = { from: '2027-03-01', to: '2027-03-31', all: true };
  const grid = env.call(ATT, 'getResultGrid', f), totals = env.call(ATT, 'getResultTotals', f);
  const outs = Object.fromEntries(env.call(ADMIN, 'listOuts', { scope: 'term' }).summary.map((s) => [s.studentId, s.count]));
  let compared = 0;
  for (const r of totals.rows) {
    const cells = Object.values(grid.cells[r.student.id] || {});
    for (const [kind, sym] of Object.entries(SYMBOL)) {
      const n = cells.filter((c) => String(c[1] || '').includes(sym)).length;
      assert.strictEqual(r.total[kind]['인정'] + r.total[kind]['미인정'], n, r.student.label + ' ' + kind);
      compared += n;
    }
    assert.strictEqual(r.outs, outs[r.student.id] || 0, r.student.label + ' OUT');
  }
  assert.ok(compared >= 3, '센 칸 ' + compared);
  assert.ok(totals.rows.find((r) => r.student.id === acc.A.id).outs >= 1, 'A의 OUT');
});
