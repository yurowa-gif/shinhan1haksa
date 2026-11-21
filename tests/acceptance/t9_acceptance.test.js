/**
 * T9 인수 시험: T8 뒤에 들어온 기능 — C38 시간표 대신 입력(#256), C42 getCounselRoster(#277), C43 그날 칸·기록 보기(#283),
 * C44 출결 이유 한 줄(#282), C45 일괄 확정(#287), C39 계정 안내 이메일(#260). 가짜 데이터만.
 *  1) 역할 행렬: 관리자·출결 담당·학사교사(담당/비담당)·담임·근무교사·학생 A/B·학부모 P1/P2·외부인 × 새 공개 함수 — 허용/거부가 의도대로인지
 *  2) 유출: 응답에 전화·상담 내용·교사 메모·사유 표시·다른 사람 이메일이 없다. 기록 보기의 사유 속 전화·이메일은 가린다
 *  3) 동치: 같은 30명·한 달 요청을 '하나씩 확정'과 '일괄 확정'으로 했을 때 출석부·결과 누적이 같다 /
 *          '학생 제출 → 학부모 동의 → 담당교사 확인'과 '담당교사 대신 입력'의 출석부가 같다
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');
const { portalAccounts, PHONE_RE } = require('../helpers/portal');

const ADMIN = 'owner@example.com', HOMEROOM = 'test.homeroom@example.com', ATT = 'test.attendance@example.com';
const OUTSIDER = 'stranger@fake-school.test';   // users에 없는 계정
const TODAY = '2027-03-09';
const REASON = '가짜 사유 [T9-RSN] 010-0000-7777 leak.mail@fake-school.test';
const MARK = { counsel: '[T9-CN]', outMemo: '[T9-OUTMEMO]', reason: '[T9-RSN]' };
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function baseEnv(now) {
  const env = createGasEnv({ owner: ADMIN, now: (now || TODAY) + 'T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: 'test.teacher@example.com', TEST_HOMEROOM_EMAIL: HOMEROOM });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.addUser(ATT, '시험 출결', 'attendance'));
  return env;
}

/** 계정 모음: 학생·학부모는 T7 도구, 교사는 A의 담당·비담당·오늘 근무(비담당)·담임 */
function people(env) {
  const acc = portalAccounts(env);
  const term = env.as(ADMIN, (c) => c.getCurrentTerm_());
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const hallA = enr.find((e) => e.student_id === acc.A.id).teacher_email;
  const halls = env.rows('users').filter((u) => String(u.roles).split(',').includes('hall_teacher') && !String(u.roles).includes('admin')).map((u) => u.email);
  const others = halls.filter((h) => h !== hallA);
  const hallOther = others[0], duty = others[1];
  env.asOwner((c) => c.bulkAppend_('duty_slots', [{ date: TODAY, slot: '단독', end_time: '23:00', original_email: duty, actual_email: duty, swapped_at: '', swapped_by: '', status: '유효', memo: '가짜 T9' }], ADMIN));
  return { acc, term, enr, hallA, hallOther, duty, who: { admin: ADMIN, att: ATT, hallA, hallOther, duty, homeroom: HOMEROOM, A: acc.A.email, B: acc.B.email, P1: acc.P1.email, P2: acc.P2.email, outsider: OUTSIDER } };
}

/** A의 요청 한 묶음(담당교사가 냄 → '요청'), 상담 한 건, OUT 메모 한 건 — 표시를 심는다 */
function plant(env, p) {
  const r = env.call(p.hallA, 'saveException', { studentId: p.acc.A.id, from: '2027-03-11', to: '2027-03-12', blocks: '18:00-20:00', type: '학원(보강 포함)', reason: REASON });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const tab = 'exceptions_' + p.term.id.slice(0, 8);
  const row = env.rows(tab).find((x) => x.student_id === p.acc.A.id && x.reason === REASON);
  assert.strictEqual(row.status, '요청');
  const cn = env.call(p.hallA, 'saveCounselNote', { studentId: p.acc.A.id, date: '2027-03-08', type: '생활', target: '학생', content: '가짜 상담 ' + MARK.counsel, showToParent: true });
  assert.strictEqual(cn.ok, true, JSON.stringify(cn));
  const rule = env.rows('violation_rules')[0];
  env.asOwner((c) => c.appendRecord_('violations_' + p.term.id.slice(0, 8), { term_id: p.term.id, student_id: p.acc.A.id, occurred_at: '2027-03-05T20:00:00', rule_id: rule.id, rule_name: rule.name,
    memo: '가짜 OUT 메모 ' + MARK.outMemo, detected_by: p.hallA, entered_by: p.hallA, status: '유효', source: '직접', source_exception_id: '', cancel_reason: '' }, ADMIN));
  return { gid: String(row.group_id || row.id), tab };
}

const ENTRIES = [{ weekday: '화', blocks: '18:30-20:00', code: '학' }];

test('T9 역할 행렬: 새 공개 함수 × 11개 계정 — 일괄 확정·그날 칸은 관리자·출결 담당만, 기록 보기는 교사(담임은 자기 반)만, 상담 목록은 관리자·학사 교사·담임, 대신 입력은 관리자·그 학생 담당교사만', () => {
  const env = baseEnv();
  const p = people(env);
  const { gid } = plant(env, p);
  const T = p.term.id, A = p.acc.A.id;
  const calls = {
    previewBulkConfirm: ['exception.confirm', [T], ['admin', 'att']],
    getExceptionDayView: ['exception.confirm', [T, gid], ['admin', 'att']],
    confirmExceptionGroups: ['exception.confirm', [T, ['x'], ''], ['admin', 'att']],
    getExceptionHistory: ['exception.view', [T, gid], ['admin', 'att', 'hallA', 'hallOther', 'duty', 'homeroom']],
    getCounselRoster: ['counsel.list', [], ['admin', 'hallA', 'hallOther', 'duty', 'homeroom']],
    previewTimetableEnter: ['timetable.enter', [A, '2027-04', ENTRIES], ['admin', 'hallA']],
    enterTimetableForStudent: ['timetable.enter', [A, '2027-04', ENTRIES, 'x'], ['admin', 'hallA']]
  };
  const got = {}, want = {};
  for (const [fn, [action, args, allowed]] of Object.entries(calls)) {
    for (const [k, email] of Object.entries(p.who)) {
      want[fn + ' ' + k] = allowed.includes(k) ? '허용' : '거부';
      try {
        if (allowed.includes(k)) { env.expectAllowed(email, fn, ...args); got[fn + ' ' + k] = '허용'; }
        else { env.expectDenied(email, action, fn, ...args); got[fn + ' ' + k] = '거부'; }
      } catch (e) { got[fn + ' ' + k] = '틀림: ' + e.message.slice(0, 80); }
    }
  }
  assert.deepStrictEqual(got, want);
  // 쓰기 함수는 거부된 계정이 불러도 아무것도 바뀌지 않았다
  assert.strictEqual(env.rows('fixed_schedules').filter((r) => r.student_id === A && r.month === '2027-04').length, 0, '대신 입력 거부 → 행 없음(관리자·담당교사 호출은 낡은 token이라 막힘)');
});

test('T9 유출: 허용된 응답 어디에도 전화·상담 내용·OUT 메모·사유 표시·남의 이메일이 없다 — 기록 보기의 사유는 가린 채, 상담 목록은 볼 수 있는 학생만(내용 없음)', () => {
  const env = baseEnv();
  const p = people(env);
  const { gid } = plant(env, p);
  const T = p.term.id, A = p.acc.A.id;
  const leaks = [];
  const call = (who, fn, ...a) => { try { return env.call(who, fn, ...a); } catch (e) { throw new Error(who + ' ' + fn + ': ' + e.message); } };
  const scan = (who, fn, out) => {
    const text = textOf(out);
    for (const m of text.matchAll(PHONE_RE)) leaks.push(who + ' ' + fn + ' 전화 ' + m[0]);
    for (const m of text.match(EMAIL_RE) || []) if (m.toLowerCase() !== who.toLowerCase()) leaks.push(who + ' ' + fn + ' 이메일 ' + m);
    // 기록 보기는 교사가 요청 목록에서 이미 보는 사유를 보여 준다(전화·이메일만 가림) — 사유 표시만 그 함수에서 허용
    for (const [name, k] of Object.entries(MARK)) if (text.includes(k) && !(name === 'reason' && fn === 'getExceptionHistory')) leaks.push(who + ' ' + fn + ' 표시 ' + k);
  };
  for (const who of [ADMIN, ATT]) {
    scan(who, 'previewBulkConfirm', call(who, 'previewBulkConfirm', T));
    scan(who, 'getExceptionDayView', call(who, 'getExceptionDayView', T, gid));
  }
  for (const who of [ADMIN, ATT, p.hallA, p.hallOther, p.duty, HOMEROOM]) {
    const h = call(who, 'getExceptionHistory', T, gid);
    scan(who, 'getExceptionHistory', h);
    assert.ok(h.entries.some((e) => /번호 생략/.test(e.why) && /이메일 생략/.test(e.why)), who + ' 사유 속 전화·이메일은 가림: ' + JSON.stringify(h.entries).slice(0, 200));
  }
  for (const who of [ADMIN, p.hallA, p.hallOther, HOMEROOM]) scan(who, 'getCounselRoster', call(who, 'getCounselRoster'));
  scan(p.hallA, 'previewTimetableEnter', call(p.hallA, 'previewTimetableEnter', A, '2027-04', ENTRIES));
  for (const who of [p.acc.A.email, p.acc.P1.email]) scan(who, 'getPortalStudent', call(who, 'getPortalStudent', A));
  for (const [who, role] of [[p.acc.A.email, 'student'], [p.acc.P1.email, 'parent'], [p.acc.C.email, 'student']]) scan(who, 'getHomeData', call(who, 'getHomeData', role));
  assert.deepStrictEqual(leaks, []);

  // 상담 목록: 담당교사는 자기 담당 학생만, 담임은 자기 반만, 관리자는 전체 — 내용·유형·교사 칸 없음
  const roster = (who) => env.call(who, 'getCounselRoster').students;
  const mine = p.enr.filter((e) => e.teacher_email === p.hallA).map((e) => e.student_id).sort();
  assert.deepStrictEqual(roster(p.hallA).map((s) => s.id).sort(), mine, '담당교사 = 담당 학생');
  const hr = env.rows('users').find((u) => u.email === HOMEROOM).homeroom_class.split('-').map(Number);
  assert.ok(roster(HOMEROOM).every((s) => s.grade === hr[0] && Number(s.classNo) === hr[1]), '담임 = 자기 반');
  assert.strictEqual(roster(ADMIN).length, p.enr.length, '관리자 = 전체');
  assert.deepStrictEqual(Object.keys(roster(p.hallA)[0]).sort(), ['classNo', 'count', 'grade', 'id', 'lastDate', 'name', 'number']);
  assert.strictEqual(roster(p.hallA).find((s) => s.id === A).count, 1);

  // C44 이유 한 줄: 유형·상태로만 — 사유 글은 쓰지 않는다
  const ex = env.call(p.acc.P1.email, 'getPortalStudent', A).exceptions;
  assert.ok(ex.some((e) => e.reason === '학원 일정 기록입니다.'), JSON.stringify(ex).slice(0, 300));
});

test('T9 C39: 홈·시간표의 계정 이메일은 본인 것만 — 학생 명단에 없는 학생 계정도 자기 이메일만 본다', () => {
  const env = baseEnv();
  const p = people(env);
  for (const [x, role] of [[p.acc.A, 'student'], [p.acc.P1, 'parent']]) {
    const h = env.call(x.email, 'getHomeData', role);
    assert.strictEqual(h.accountEmail, x.email);
    assert.deepStrictEqual([...new Set(textOf(h).match(EMAIL_RE) || [])], [x.email]);
  }
  const lost = 'lost.student@fake-school.test';
  env.asOwner((c) => c.addUser(lost, '명단 없는 학생', 'student'));
  const t = env.call(lost, 'getTimetableContext');
  assert.deepStrictEqual([t.ok, t.email], [false, lost]);
  assert.deepStrictEqual([...new Set(textOf(t).match(EMAIL_RE) || [])], [lost]);
});

/* ───────────── 동치: 일괄 확정 = 하나씩 확정, 대신 입력 = 세 단계 ───────────── */

/** 30명 한 달(3월)에 담당교사들이 요청 묶음을 낸다(학생마다 한 묶음, 날짜·블록이 겹치지 않게) */
function monthRequests(env) {
  const term = env.as(ADMIN, (c) => c.getCurrentTerm_());
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const types = ['학원(보강 포함)', '병결', '가정사유'];
  const live = new Set(env.rows('exceptions_' + term.id.slice(0, 8)).filter((e) => e.status !== '취소').map((e) => e.student_id + '|' + e.date));
  let n = 0;
  enr.forEach((e, i) => {
    const day = String(11 + (i % 15)).padStart(2, '0'), date = '2027-03-' + day;
    if (live.has(e.student_id + '|' + date)) return;
    const r = env.call(e.teacher_email, 'saveException', { studentId: e.student_id, from: date, to: date, blocks: types[i % 3] === '학원(보강 포함)' ? '18:00-20:00' : 'ALL', type: types[i % 3], reason: '가짜' });
    if (r.ok) n++;
  });
  return { term, n };
}
const sheetOf = (env, d) => env.call(ADMIN, 'getAttendanceSheet', d).html;
const totalsOf = (env) => env.call(ATT, 'getResultTotals', { from: '2027-03-01', to: '2027-03-31', all: true }).rows.map((r) => [r.student.id, r.total]);

test('T9 동치(C45): 가짜 30명 한 달 요청을 하나씩 확정한 쪽과 일괄 확정한 쪽의 출석부·결과 누적·특이사항 상태가 같다', () => {
  const one = baseEnv(), bulk = baseEnv();
  const a = monthRequests(one), b = monthRequests(bulk);
  assert.ok(a.n >= 20 && a.n === b.n, '요청 ' + a.n);
  const tab = 'exceptions_' + a.term.id.slice(0, 8);
  // 하나씩 확정할 묶음 = 일괄 확정이 고르는 묶음(미인정·경고 묶음은 일괄 확정이 남긴다 — 결정 86). 미리 보기는 쓰지 않는다
  const groups = one.call(ATT, 'previewBulkConfirm', a.term.id).confirmable;
  assert.ok(groups.length >= 10, '확정할 묶음 ' + groups.length);
  groups.forEach((g) => assert.strictEqual(one.call(ATT, 'confirmException', a.term.id, g, true).ok, true, g));
  const pv = bulk.call(ATT, 'previewBulkConfirm', b.term.id);
  assert.strictEqual(pv.counts.confirm, groups.length, JSON.stringify(pv.counts));
  const r = bulk.call(ATT, 'confirmExceptionGroups', b.term.id, pv.confirmable, pv.token);
  assert.deepStrictEqual([r.ok, r.confirmed, r.kept, r.failed], [true, groups.length, 0, 0]);
  const state = (env) => env.rows(tab).map((e) => [e.student_id, e.date, e.type, e.blocks, e.status, e.confirmed_by]).sort();
  assert.deepStrictEqual(state(bulk), state(one), '특이사항 상태·확정자');
  for (const d of ['2027-03-11', '2027-03-16', '2027-03-23']) assert.strictEqual(sheetOf(bulk, d), sheetOf(one, d), '출석부 ' + d);
  assert.deepStrictEqual(totalsOf(bulk), totalsOf(one), '결과 누적');
});

test('T9 동치(C38): 담당교사 대신 입력한 시간표와 학생 제출 → 학부모 동의 → 담당교사 확인한 시간표의 출석부(4월)가 같다', () => {
  const ENTRY = [{ weekday: '화', blocks: '18:30-20:00', code: '학' }, { weekday: '토', blocks: '09:00-12:00', code: '가' }];
  const flow = baseEnv('2027-03-26'), proxy = baseEnv('2027-03-26');
  const pf = people(flow), pp = people(proxy);
  const A = pf.acc.A.id;
  const ok = (r, w) => assert.strictEqual(r.ok, true, w + ' ' + JSON.stringify(r));
  ok(flow.call(pf.acc.A.email, 'submitTimetable', { month: '2027-04', entries: ENTRY }), '제출');
  ok(flow.call(pf.acc.P1.email, 'agreeTimetable', A, '2027-04'), '동의');
  ok(flow.call(pf.hallA, 'confirmTimetable', A, '2027-04'), '확인');
  const pv = proxy.call(pp.hallA, 'previewTimetableEnter', A, '2027-04', ENTRY);
  ok(pv, '대신 입력 미리 보기');
  ok(proxy.call(pp.hallA, 'enterTimetableForStudent', A, '2027-04', ENTRY, pv.token), '대신 입력');
  const fixed = (env, d) => plain(env.as(ADMIN, (c) => c.effectiveFixedRows_(c.readAll_('fixed_schedules'), A, d))).map((r) => r.weekday + ' ' + r.blocks + ' ' + r.code).sort();
  for (const d of ['2027-04-06', '2027-04-10', '2027-04-30']) assert.deepStrictEqual(fixed(proxy, d), fixed(flow, d), d);
  assert.ok(fixed(proxy, '2027-04-06').length === 2);
  for (const d of ['2027-04-06', '2027-04-10']) assert.strictEqual(sheetOf(proxy, d), sheetOf(flow, d), '출석부 ' + d);
  assert.ok(proxy.rows('audit_log').some((x) => x.action === 'timetable:enter'), '대신 입력 감사 기록');
});
