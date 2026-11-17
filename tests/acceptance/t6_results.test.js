/**
 * T6 흐름 시험: F11 출결 결과 정리 격자(R22·C33, 결정 81, 총괄 답 2026-11-17). 화면 공개 함수만, 가짜 데이터만.
 * 1) 한 달치(2027-03) 결과(tests/helpers/fake-results.js, 고정 seed)를 주 단위로 저장 → 학생별 누적 증가 = 생성 표, 격자 칸 기호·미인정 표시,
 *    미인정 = 자동 1OUT, 정한 3명은 2OUT(퇴실 대상), 학습량 합(공부 + 빠진 시간 = 운영 시간).
 * 2) 같은 학생·같은 날 미인정 두 개 = 하루 1OUT, 저장 한 번에 메일은 받는 사람마다 한 통.
 * 3) 대체: 결과 블록과 겹치는 사전 특이사항만 '결과 정리에서 바꿈'으로 취소, 안 겹치면 둘 다.
 * 4) 끝난 기간: 종료 후 14일까지 저장, 15일째부터 거부(가짜 여름방학 8/13 끝).
 * 결정 81(빠진 특이사항은 모두 인정으로 누적)은 선생님 최종 확인 전이라 그 단언은 맨 아래 DECISION81 한 곳에 모았다.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { monthResults } = require('../helpers/fake-results');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com', ATT = 'test.attendance@example.com';
const MARK = { '결석': '×', '지각': '△', '조퇴': '조' };
const KINDS = ['결석', '지각', '조퇴'];

function seededEnv(now, stage4) {
  const env = createGasEnv({ owner: ADMIN, now: now || '2027-04-02T10:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, MAIL_ENABLED: 'true' });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  if (stage4) env.asOwner((c) => c.seedFakeStage4());
  env.asOwner((c) => c.addUser(ATT, '시험 출결', 'attendance'));
  env.strictLock = true;
  return env;
}
function helpers(env) {
  const call = (who, fn, ...a) => plain(env.call(who, fn, ...a));
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const exTab = () => env.rows('exceptions_' + term.id.slice(0, 8));
  const on = (sid, d) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, '학사', d));
  const totals = (from, to) => Object.fromEntries(call(ATT, 'getResultTotals', { from, to, all: true }).rows.map((r) => [r.student.id, r.total]));
  const save = (cells, from, to, who) => {
    const payload = { range: { from, to }, cells };
    const p = call(who || ATT, 'previewResults', payload);
    assert.strictEqual(p.ok, true, JSON.stringify(p).slice(0, 400));
    const s = call(who || ATT, 'saveResults', payload, p.sig);
    assert.strictEqual(s.ok, true, JSON.stringify(s).slice(0, 400));
    return { p, s };
  };
  const autoOuts = () => env.rows('violations_' + term.id.slice(0, 8)).filter((v) => v.source === 'F1자동' && v.status === '유효');
  return { call, term, exTab, on, totals, save, autoOuts };
}

test('한 달 결과(2027-03, 고정 seed) 주 단위 저장: 학생별 누적 증가 = 생성 표, 격자 칸 기호·미인정, 미인정 = 자동 1OUT, 정한 3명 퇴실 대상, 학습량 합이 맞다', () => {
  const env = seededEnv();
  const h = helpers(env);
  const grid0 = h.call(ATT, 'getResultGrid', { from: '2027-03-01', to: '2027-03-31', all: true });
  const dates = grid0.dates.filter((d) => d.operating && d.date < '2027-04-02').map((d) => d.date);
  const live = h.exTab().filter((e) => e.status !== '취소');
  const eligible = (sid, d) => h.on(sid, d) === '입실' && !live.some((e) => e.student_id === sid && e.date === d);
  const students = grid0.students.map((s) => s.id).sort();
  const gen = monthResults({ students, dates, eligible, seed: 2027, twoOut: 3 });
  assert.ok(gen.cells.length >= 15 && gen.twoOutIds.length === 3, '결과 ' + gen.cells.length + '칸');
  const before = h.totals('2027-03-01', '2027-03-31');
  const outsBefore = h.autoOuts().length;

  // 주 단위(월요일부터 7일)로 묶어 저장
  for (let i = 0; i < dates.length; i += 7) {
    const wk = dates.slice(i, i + 7);
    const cells = gen.cells.filter((c) => wk.includes(c.date));
    if (cells.length) h.save(cells, wk[0], wk[wk.length - 1]);
  }
  const after = h.totals('2027-03-01', '2027-03-31');
  students.forEach((sid) => KINDS.forEach((k) => ['인정', '미인정'].forEach((r) => {
    const want = ((gen.expect[sid] || gen.zero())[k][r]);
    assert.strictEqual(after[sid][k][r] - before[sid][k][r], want, sid + ' ' + k + ' ' + r);
  })));
  // 격자 칸: [사전 글자, 결과 기호, 미인정 1|0]
  const grid = h.call(ATT, 'getResultGrid', { from: '2027-03-01', to: '2027-03-31', all: true });
  gen.cells.forEach((c) => {
    const cell = grid.cells[c.studentId][c.date];
    assert.strictEqual(cell[1], MARK[c.kind], c.studentId + ' ' + c.date);
    assert.strictEqual(cell[2], c.type.startsWith('미인정') ? 1 : 0);
  });
  // 미인정 = 자동 1OUT(학생·날마다 하나), 정한 3명은 퇴실 대상
  const unexcused = gen.cells.filter((c) => c.type.startsWith('미인정')).length;
  assert.strictEqual(h.autoOuts().length - outsBefore, unexcused, '미인정 결과 = 새 자동 1OUT');
  const summary = Object.fromEntries(h.call(ADMIN, 'listOuts', { scope: 'term' }).summary.map((s) => [s.studentId, s]));
  gen.twoOutIds.forEach((sid) => assert.ok(summary[sid] && summary[sid].count >= 2, sid + ' 2OUT'));
  // 학습량: 공부한 시간 + 빠진 시간 = 전체(학생마다)
  //   전체 = 그 학생이 있어야 하는 시간(23:00 종료면 23:00까지, #225)
  const sumMissed = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  Object.entries(after).forEach(([sid, t]) => assert.strictEqual(t['학습량'].studiedMinutes + sumMissed(t['학습량'].missedMinutes), t['학습량'].minutes, '공부 + 빠짐 = 전체 ' + sid));
  assert.ok(Object.values(after).every((t) => t['학습량'].days > 0));

  DECISION81(env, h, before);
});

test('같은 학생·같은 날 미인정 지각 + 미인정 조퇴 = 하루 1OUT(한 묶음), 저장 한 번에 메일은 받는 사람마다 한 통(같은 반 여러 명을 맡은 담당교사)', () => {
  const env = seededEnv();
  const h = helpers(env);
  const D = '2027-03-24';   // 수
  const live = h.exTab().filter((e) => e.status !== '취소' && e.date === D).map((e) => e.student_id);
  const sById = Object.fromEntries(env.rows('students').map((s) => [s.id, s]));
  const pool = env.rows('enrollments').filter((e) => e.term_id === h.term.id).map((e) => e.student_id).filter((sid) => h.on(sid, D) === '입실' && !live.includes(sid));
  const classOf = (sid) => sById[sid].grade + '-' + sById[sid].class_no;
  // ASSUMPTION(총괄 확인 중): 지금 resMergeMails_는 '받는 사람 목록'이 같은 것끼리 묶어서, 여러 반 학생을 맡은 담당교사는 반마다 한 통(담임이 다름)을 받는다.
  //   그래서 여기서는 같은 반 4명으로 확인한다. 반이 달라도 한 통이 되게 바뀌면 이 줄을 두 반으로 바꾼다.
  const big = pool.map(classOf).sort((a, b) => pool.filter((x) => classOf(x) === b).length - pool.filter((x) => classOf(x) === a).length)[0];
  const ids = pool.filter((sid) => classOf(sid) === big).slice(0, 4);
  assert.ok(ids.length >= 3, '같은 반 ' + ids.length + '명');
  // 메일은 example.com으로 보내지 않으므로(AutoOuts.gs) 이 4명만 보낼 수 있는 가짜 주소의 담당교사로 바꾼다
  const T = 'hall.mail@fake-school.test';
  env.asOwner((c) => c.addUser(T, '시험 메일 담당', 'hall_teacher'));
  const ss = env.spreadsheets[env.scriptProps.DB_ID]._sheets.find((x) => x._name === 'enrollments');
  const col = ss._data[0].indexOf('teacher_email'), sc = ss._data[0].indexOf('student_id'), tc = ss._data[0].indexOf('term_id');
  ss._data.forEach((r) => { if (r[tc] === h.term.id && ids.includes(r[sc])) r[col] = T; });
  const outs0 = h.autoOuts().length, mail0 = env.mail.length;
  const cells = [{ studentId: ids[0], date: D, kind: '지각', type: '미인정지각' }, { studentId: ids[0], date: D, kind: '조퇴', type: '미인정조퇴' }]
    .concat(ids.slice(1).map((sid) => ({ studentId: sid, date: D, kind: '지각', type: '미인정지각' })));
  h.save(cells, D, D);
  const made = h.autoOuts().slice(outs0);
  assert.strictEqual(made.filter((v) => v.student_id === ids[0]).length, 1, '같은 학생·같은 날은 1OUT');
  assert.strictEqual(made.length, ids.length, '학생마다 1');
  const groups = h.exTab().filter((e) => e.student_id === ids[0] && e.date === D && e.status === '확정' && /^미인정/.test(e.type)).map((e) => e.group_id);
  assert.strictEqual(new Set(groups).size, 1, '한 묶음');
  const mails = env.mail.slice(mail0);
  const toT = mails.filter((m) => JSON.stringify(m).toLowerCase().includes(T));
  assert.strictEqual(toT.length, 1, '담당교사에게 한 통: ' + JSON.stringify(mails).slice(0, 600));
});

test('대체: 결과 블록과 겹치는 사전 특이사항만 "결과 정리에서 바꿈"으로 취소, 겹치지 않으면 둘 다 남는다', () => {
  const env = seededEnv('2027-03-23T10:00:00');
  const h = helpers(env);
  const D = '2027-03-24';   // 수: 블록 18–20 · 20–22 · 22–24
  const live = h.exTab().filter((e) => e.status !== '취소' && e.date === D).map((e) => e.student_id);
  const [X, Y] = env.rows('enrollments').filter((e) => e.term_id === h.term.id).map((e) => e.student_id).filter((sid) => h.on(sid, D) === '입실' && !live.includes(sid));
  [X, Y].forEach((sid) => {
    const r = h.call(ATT, 'saveException', { studentId: sid, from: D, to: D, blocks: '18:00-20:00', type: '학원(보강 포함)', reason: '가짜 보강' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
  });
  env.setNow('2027-03-25T10:00:00');
  h.save([{ studentId: X, date: D, kind: '조퇴', type: '병조퇴' }, { studentId: Y, date: D, kind: '지각', type: '병지각' }], D, D);
  const rowsOf = (sid) => h.exTab().filter((e) => e.student_id === sid && e.date === D);
  const academy = (sid) => rowsOf(sid).find((e) => /^학원/.test(e.type));
  assert.strictEqual(academy(X).status, '확정', 'X: 학원(18–20)과 조퇴(마지막 블록 22–24)는 안 겹쳐 둘 다');
  assert.ok(rowsOf(X).some((e) => e.type === '병조퇴' && e.status === '확정'));
  assert.deepStrictEqual([academy(Y).status, academy(Y).cancel_reason], ['취소', '결과 정리에서 바꿈'], 'Y: 지각(첫 블록 18–20)이 학원을 대체');
  assert.ok(rowsOf(Y).some((e) => e.type === '병지각' && e.status === '확정'));
});

test('끝난 기간: 종료 후 14일째까지 저장, 15일째부터 거부(가짜 여름방학 8/13 끝), 권한: 학사 교사는 저장 거부·담임은 자기 반만 봄', () => {
  const env = seededEnv('2027-08-27T10:00:00', true);   // 8/13 + 14 = 8/27
  const h = helpers(env);
  const vac = env.rows('terms').find((t) => t.type === '방학');
  const D = '2027-08-12';
  const sid = env.rows('enrollments').filter((e) => e.term_id === vac.id).map((e) => e.student_id).find((s) => h.on(s, D) === '입실');
  const payload = { range: { from: D, to: D }, cells: [{ studentId: sid, date: D, kind: '결석', type: '병결' }] };
  const p = h.call(ATT, 'previewResults', payload);
  assert.strictEqual(p.ok, true, '14일째(8/27)는 저장 가능 ' + JSON.stringify(p).slice(0, 300));
  assert.strictEqual(h.call(ATT, 'saveResults', payload, p.sig).ok, true);
  env.setNow('2027-08-28T10:00:00');
  const late = h.call(ATT, 'previewResults', { range: { from: D, to: D }, cells: [{ studentId: sid, date: D, kind: '지각', type: '병지각' }] });
  assert.strictEqual(late.ok, false, '15일째(8/28)는 거부 ' + JSON.stringify(late));
  assert.strictEqual(h.call(ATT, 'getResultGrid', { from: D, to: D, all: true }).editable, false, '격자도 읽기만');

  env.expectDenied(HALL, 'exception.confirm', 'saveResults', payload, 'x');
  const hr = h.call(HOMEROOM, 'getResultGrid', { from: D, to: D, all: true });
  const cls = env.rows('users').find((u) => u.email === HOMEROOM).homeroom_class.split('-').map(Number);
  assert.ok(hr.students.length > 0 && hr.students.every((s) => s.grade === cls[0] && Number(s.classNo) === cls[1]), '담임은 자기 반만');
});

/**
 * DECISION81 — 결정 81(선생님 최종 확인 전): 결과로 넣지 않은 '빠진' 사전 특이사항(병결·가정사유·학원·학사 외 프로그램 등)도 모두 **인정**으로 누적하고,
 * 미인정은 확정된 미인정 특이사항만 센다. 결정이 바뀌면 이 함수만 고친다.
 */
function DECISION81(env, h, before) {
  const live = h.exTab().filter((e) => e.status === '확정' && e.date >= '2027-03-01' && e.date <= '2027-03-31');
  const seedOnly = live.filter((e) => !/^(병결|병지각|병조퇴|미인정)/.test(e.type) || e.requested_by === 'fake.teacher3@example.com');
  // 결과 저장 전(before) 누적은 시드의 확정 특이사항에서만 나온다
  const unexcusedStudentDays = new Set(seedOnly.filter((e) => /^미인정/.test(e.type)).map((e) => e.student_id + '|' + e.date));
  const totalUnexcused = Object.values(before).reduce((n, t) => n + KINDS.reduce((m, k) => m + t[k]['미인정'], 0), 0);
  assert.strictEqual(totalUnexcused, unexcusedStudentDays.size, '결정 81: 미인정은 확정 미인정 특이사항만');
  const recognizedStudents = new Set(seedOnly.filter((e) => !/^미인정/.test(e.type)).map((e) => e.student_id));
  recognizedStudents.forEach((sid) => {
    const n = KINDS.reduce((m, k) => m + before[sid][k]['인정'], 0);
    assert.ok(n >= 1, '결정 81: 빠진 특이사항(학원·프로그램·가정사유 포함)은 인정으로 센다 ' + sid);
  });
}
