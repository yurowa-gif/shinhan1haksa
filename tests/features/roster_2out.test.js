/** C20b 결정 63·35 보충: 2OUT 퇴실 학생의 명단 등록 막힘(미리보기·저장)·재입실 거부·식수 집계 방학 석식. R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', T1 = 'test.teacher@example.com', T2 = 'fake.teacher1@example.com';
const HEAD = '학번,학년,반,번호,이름,성별,계열,학사,기숙사,베리타스,조식,석식,통학구분,담당교사이메일,학생구글계정,비고';

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-03T12:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  return env;
}
const term = (env, name) => env.rows('terms').find((t) => t.name === name);
const enrOf = (env, tid) => Object.fromEntries(env.rows('enrollments').filter((e) => e.term_id === tid).map((e) => [e.student_id, e]));
/** 명단 글: 모두 그대로(담당교사만 teacherOf 값으로 바꾼다) */
function rosterText(env, tid, teacherOf) {
  const enr = enrOf(env, tid);
  return [HEAD].concat(env.rows('students').filter((s) => enr[s.id]).map((s) => {
    const e = enr[s.id], dorm = e.commute_type !== '일반';
    return [s.student_no, s.grade, s.class_no, s.number, s.name, s.gender, s.track, 'O', dorm ? 'O' : 'X', e.veritas === 'TRUE' ? 'O' : 'X', dorm ? 'O' : 'X', '학사',
      e.commute_type, (teacherOf && teacherOf[s.id]) || e.teacher_email, s.email, ''].join(',');
  })).join('\n');
}
const pick2 = (env) => {   // 2027 1학기 등록 학생 중 담당이 다른 두 명
  const ids = env.rows('enrollments').filter((e) => e.term_id === term(env, '2027 1학기').id).map((e) => e.student_id);
  return { s: ids[0], t: ids[1] };
};
const addLeave2out = (env, sid, eff) => {
  const head = env.asOwner((c) => c.appendRecord_('status_changes', { student_id: sid, item: '학사', value: '퇴실', effective_date: eff, effective_date_auto: eff,
    requested_at: eff + 'T08:00:00', reason: '2OUT 퇴실', memo: '[2OUT] out:x note:y', source: 'F6', status: '유효', doc_submitted: 'FALSE', linked_change_id: '', cancel_reason: '' }, ADMIN));
  return head.id || head;
};
const opts = (env) => ({ termId: term(env, '2027 1학기').id, ymd: '2027-03-02' });

test('명단 미리보기: 2OUT 퇴실로 막힌 학생은 이름과 "○월 ○일까지 입실할 수 없습니다"가 나오고 그 학생의 변경은 세지 않는다(막히지 않은 학생은 그대로)', () => {
  const env = makeEnv();
  const { s, t } = pick2(env);
  const tid = term(env, '2027 1학기').id;
  const text = rosterText(env, tid, { [s]: T2, [t]: T2 });   // 두 학생의 담당교사를 바꾼 명단
  const base = env.call(ADMIN, 'previewRoster', text, opts(env));
  assert.strictEqual(base.ok, true, JSON.stringify(base)); assert.strictEqual(base.counts.banned, 0);
  addLeave2out(env, s, '2026-12-10');
  const p = env.call(ADMIN, 'previewRoster', text, opts(env));
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  assert.strictEqual(p.counts.banned, 1); assert.strictEqual(p.counts.updatedEnrollments, base.counts.updatedEnrollments - 1, '막힌 학생의 등록 변경은 빠진다');
  const stu = env.rows('students').find((x) => x.id === s);
  assert.deepStrictEqual(p.lists.banned, [{ student_no: stu.student_no, name: stu.name, message: '2OUT 퇴실로 7월 17일까지 입실할 수 없습니다' }]);
  assert.strictEqual(p.blocked, false);
});

test('명단 저장: 막힌 학생 한 명만 빼고 나머지는 저장된다(등록 변경 0행·상태 0행), 결과에 이름과 사유가 있고 stale 비교에 막힘 수가 들어간다', () => {
  const env = makeEnv();
  const { s, t } = pick2(env);
  const tid = term(env, '2027 1학기').id;
  addLeave2out(env, s, '2026-12-10');
  const text = rosterText(env, tid, { [s]: T2, [t]: T2 });
  const p = env.call(ADMIN, 'previewRoster', text, opts(env));
  const enr0 = enrOf(env, tid), changes0 = env.rows('status_changes').filter((c) => c.student_id === s).length;
  const r = env.call(ADMIN, 'commitRoster', text, opts(env), { counts: p.counts, termId: p.term.id, ymd: p.ymd });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const enr1 = enrOf(env, tid);
  assert.strictEqual(enr1[s].teacher_email, enr0[s].teacher_email, '막힌 학생의 등록은 그대로');
  assert.strictEqual(enr1[t].teacher_email, T2, '다른 학생은 저장됨');
  assert.strictEqual(env.rows('status_changes').filter((c) => c.student_id === s).length, changes0, '막힌 학생의 상태 행은 새로 쓰이지 않는다');
  assert.strictEqual(r.banned.length, 1); assert.match(r.banned[0].message, /2OUT 퇴실로 7월 17일까지/);
  // 막힘 수가 달라지면(미리보기 뒤 퇴실이 취소됨) 거부된다
  const env2 = makeEnv();
  const leave = addLeave2out(env2, pick2(env2).s, '2026-12-10');
  const t2 = rosterText(env2, term(env2, '2027 1학기').id, { [pick2(env2).s]: T2 });
  const p2 = env2.call(ADMIN, 'previewRoster', t2, opts(env2));
  assert.strictEqual(p2.counts.banned, 1);
  env2.asOwner((c) => c.updateRecord_('status_changes', leave, { status: '취소', cancel_reason: '시험' }, ADMIN));
  const r2 = env2.call(ADMIN, 'commitRoster', t2, opts(env2), { counts: p2.counts, termId: p2.term.id, ymd: p2.ymd });
  assert.strictEqual(r2.ok, false); assert.strictEqual(r2.stale, true);
});

test('퇴실 취소로 2OUT 퇴실 행이 취소되면 막힘이 풀리고, 학기 밖에서는 막지 않는다(다른 일반 퇴실·1OUT은 막지 않는다)', () => {
  const env = makeEnv();
  const { s, t } = pick2(env);
  const tid = term(env, '2027 1학기').id;
  const text = rosterText(env, tid, { [s]: T2, [t]: T2 });
  // 일반 퇴실(2OUT 아님)은 막지 않는다
  env.asOwner((c) => c.appendRecord_('status_changes', { student_id: s, item: '학사', value: '퇴실', effective_date: '2026-12-10', effective_date_auto: '2026-12-10', requested_at: '2026-12-08T08:00:00',
    reason: '가정 사정', memo: '', source: 'F6', status: '유효', doc_submitted: 'TRUE', linked_change_id: '', cancel_reason: '' }, ADMIN));
  assert.strictEqual(env.call(ADMIN, 'previewRoster', text, opts(env)).counts.banned, 0);
  const env2 = makeEnv();
  const id = addLeave2out(env2, s, '2026-12-10');
  assert.strictEqual(env2.call(ADMIN, 'previewRoster', text, opts(env2)).counts.banned, 1);
  env2.asOwner((c) => c.updateRecord_('status_changes', id, { status: '취소', cancel_reason: '되돌림' }, ADMIN));
  assert.strictEqual(env2.call(ADMIN, 'previewRoster', text, opts(env2)).counts.banned, 0, '취소하면 풀린다');
});

test('2OUT 퇴실 학생의 재입실(saveMove·previewMove)은 "2OUT 퇴실로 …까지 다시 들어올 수 없습니다" 오류로 거부된다', () => {
  const env = makeEnv();
  const { s } = pick2(env);
  addLeave2out(env, s, '2027-03-02');
  const i = { studentId: s, type: '학사 입실', requestedAt: '2027-03-03T10:00:00', effectiveDate: '2027-03-10', dinner: '중단', docSubmitted: false,
    meals: { '조식': '실시', '석식': '학사 석식' } };
  const p = env.call(ADMIN, 'previewMove', i);
  assert.strictEqual(p.ok, false); assert.ok(p.errors.some((e) => /2OUT 퇴실로 .*까지 다시 들어올 수 없습니다/.test(e.message)), JSON.stringify(p.errors));
  const n0 = env.rows('status_changes').length;
  const r = env.call(ADMIN, 'saveMove', i, p.expect || '');
  assert.strictEqual(r.ok, false); assert.strictEqual(env.rows('status_changes').length, n0);
});

test('식수 집계(결정 35 보충): 7월 퇴실 학생의 석식이 방학 날짜에도 이어지면 "퇴실 후 석식 유지"로 센다(직전 기간 id를 넘긴다)', () => {
  const env = makeEnv('2027-07-12T12:00:00');
  env.asOwner((c) => c.appendRecord_('terms', { name: '2027 여름방학', type: '방학', start_date: '2027-07-18', end_date: '2027-08-31', memo: '시험' }, ADMIN));
  const { s } = pick2(env);
  [['학사', '퇴실', '2027-07-10'], ['석식', '미실시', '2027-07-25']].forEach(([item, value, eff]) =>
    env.asOwner((c) => c.appendRecord_('status_changes', { student_id: s, item, value, effective_date: eff, effective_date_auto: eff, requested_at: '2027-07-09T10:00:00', reason: '', memo: '',
      source: 'F6', status: '유효', doc_submitted: 'TRUE', linked_change_id: '', cancel_reason: '' }, ADMIN)));
  const c = env.call(ADMIN, 'getMealCounts', '2027-07-20');
  assert.strictEqual(c.term.name, '2027 여름방학');
  assert.ok(c.afterLeaveHallDinner >= 1, '퇴실 후 석식 유지 ' + c.afterLeaveHallDinner);
  const all = c.rows.find((r) => r.key === '전체');
  assert.ok(Number(all.hallDinner) >= 1);
  const later = env.call(ADMIN, 'getMealCounts', '2027-07-26');
  assert.strictEqual(later.afterLeaveHallDinner, 0, '석식 중단일 뒤에는 빠진다');
});
