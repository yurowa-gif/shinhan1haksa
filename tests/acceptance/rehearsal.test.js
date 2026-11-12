/**
 * T4a 실사용 리허설: 가짜 학생 180명으로 학기 하나를 짧게 돌린다(가짜 데이터만, 기존 Fake* 생성기).
 * 명단 업로드 → 좌석·방 초안 저장 → 1주일(특이사항·자동 OUT·급식 변경·퇴실 1·재입실 1·2OUT 퇴실 1) 출석부 →
 * 식수 집계 → 학기 전환(여름방학: 명단 올리기로 기존 + 신규 1명, 2OUT 퇴실 학생은 막힘 / 2학기: 1학기 학사생 이어받기).
 * 공개 함수를 부를 때마다 시트 읽기 횟수·걸린 시간을 기록한다. 같은 흐름을 30명으로도 돌려
 * "180명에서 읽기 횟수가 학생 수에 비례해 늘지 않는다"를 단언한다(gas-fakes 기준이라 시간은 참고값).
 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', ATT = 'test.attendance@example.com';
const TEACHERS = ['fake.teacher1@example.com', 'fake.teacher2@example.com', 'fake.teacher3@example.com'];
const gen = loadGs(['src/Schema.gs', 'src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs',
  'src/rules/MoveRules.gs', 'src/dev/FakeData.gs', 'src/dev/FakeSeats.gs', 'src/dev/FakeStage1.gs']);

/* 시트 읽기 횟수: gas-fakes Range.prototype.getValues를 한 번 감싼다(모든 env가 같은 클래스를 쓴다) */
const reads = { n: 0, patched: false };
function patchReads(env) {
  if (reads.patched) return;
  env.asOwner((c) => {
    const proto = Object.getPrototypeOf(c.getSheet_('db', 'users').getDataRange());
    const orig = proto.getValues;
    proto.getValues = function () { reads.n++; return orig.apply(this, arguments); };
  });
  reads.patched = true;
}

const HEAD = '학번,학년,반,번호,이름,성별,계열,학사,기숙사,베리타스,조식,석식,통학구분,담당교사이메일,학생구글계정,비고';
const ox = (b) => (b ? 'O' : 'X');
function rosterText(students, enrOf) {
  return [HEAD].concat(students.map((s) => {
    const e = enrOf[s.id], dorm = e.commute_type !== '일반';
    return [s.student_no, s.grade, s.class_no, s.number, s.name, s.gender, s.track, 'O', ox(dorm), ox(e.veritas === 'TRUE'), ox(dorm), '학사',
      e.commute_type, e.teacher_email, s.email, ''].join(',');
  })).join('\n');
}

/** 한 학기 리허설. n = 학생 수. → {stats:{공개함수: {reads, ms}}, facts} */
function rehearse(n) {
  const fake = plain(gen.buildFakeData_({ count: n, seed: 2027 }));
  const s1 = plain(gen.buildFakeStage1_(fake));   // 공간·좌석만 쓴다(명단·상태는 화면 함수로 올린다)
  const [prevTerm, term] = fake.terms;
  const env = createGasEnv({ owner: ADMIN, now: '2027-03-02T08:00:00' });
  env.asOwner((c) => c.setup());
  patchReads(env);
  env.asOwner((c) => {
    c.bulkAppend_('terms', [prevTerm, term], ADMIN);
    TEACHERS.concat(HALL).forEach((e, i) => c.addUser(e, '가짜교사' + (i + 1), 'hall_teacher'));
    c.addUser(ATT, '시험 출결', 'attendance');
    c.bulkAppend_('spaces', s1.spaces, ADMIN);
    c.bulkAppend_('seats', s1.seats, ADMIN);
  });
  env.asOwner((c) => c.ensureTermSheets_([]));
  env.strictLock = true;

  const stats = {};
  const call = (who, fn, ...args) => {
    const r0 = reads.n, t0 = Date.now();
    const r = plain(env.call(who, fn, ...args));
    const s = { reads: reads.n - r0, ms: Date.now() - t0 };
    if (!stats[fn] || s.reads > stats[fn].reads) stats[fn] = s;   // 같은 함수는 가장 무거운 한 번
    return r;
  };
  const ok = (r, what) => { assert.strictEqual(r.ok, true, what + ' ' + JSON.stringify(r).slice(0, 400)); return r; };

  // 1) 명단 업로드(2027 1학기, 3/2부터)
  const enrOf = Object.fromEntries(fake.enrollments.filter((e) => e.term_id === term.id).map((e) => [e.student_id, e]));
  const text = rosterText(fake.students, enrOf);
  const opts = { termId: term.id, ymd: term.start_date };
  const pv = ok(call(ADMIN, 'previewRoster', text, opts), '명단 미리보기');
  ok(call(ADMIN, 'commitRoster', text, opts, { counts: pv.counts, termId: pv.term.id, ymd: pv.ymd }), '명단 저장');
  const students = env.rows('students');
  assert.strictEqual(students.length, n);
  const byNo = Object.fromEntries(students.map((s) => [s.student_no, s]));
  const idOf = (i) => byNo[fake.students[i].student_no].id;
  const dorm = (sid) => env.rows('status_changes').some((c) => c.student_id === sid && c.item === '기숙사' && c.value === '입실');
  const on = (sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));

  // 2) 좌석 초안·방 초안 저장(학사 교사)
  const sp = ok(call(HALL, 'previewSeatDraft', term.id, [], 7), '좌석 초안');
  ok(call(HALL, 'saveSeatDraft', term.id, { seed: sp.seed, sig: sp.sig, base: sp.base, fixed: sp.fixed }), '좌석 저장');
  const seatData = call(HALL, 'getSeatData', term.id);
  const seated = seatData.spaces.flatMap((s) => s.cells).filter((c) => c.studentId).length;
  const rg = call(HALL, 'getRoomData', term.id);
  const rp = ok(call(HALL, 'previewRoomDraft', term.id, 7), '방 초안');
  ok(call(HALL, 'saveRoomAssignments', term.id, rp.assignments, rg.token), '방 저장');
  const dormIds = students.map((s) => s.id).filter(dorm);

  // 3) 1주일(3/2 화 ~ 3/8 월)
  // 출석부 모델에는 이름만 있으므로, 출석부로 확인하는 학생은 이름이 겹치지 않는 학생으로 고른다
  const nameCount = {};
  students.forEach((s) => { nameCount[s.name] = (nameCount[s.name] || 0) + 1; });
  const pick = (skip, pred) => students.map((s) => s.id).find((id) => !skip.includes(id) && nameCount[students.find((s) => s.id === id).name] === 1 && (!pred || pred(id)));
  const used = [];
  const A = pick(used); used.push(A);                                   // 미인정결석 → 자동 1OUT
  const C = pick(used, (id) => !dorm(id)); used.push(C);                // 일반 석식으로
  const D = pick(used, (id) => !dorm(id)); used.push(D);                // 직접 OUT 2건 → 면담 → 2OUT 퇴실
  const E = pick(used, (id) => !dorm(id)); used.push(E);                // 학사 퇴실
  const F = pick(used, (id) => !dorm(id)); used.push(F);                // 학사 퇴실 → 재입실
  env.setNow('2027-03-03T20:00:00');
  ok(call(ATT, 'saveException', { studentId: A, from: '2027-03-03', to: '2027-03-03', blocks: 'ALL', type: '미인정결석', reason: '' }), '미인정결석');
  ok(call(ATT, 'saveException', { studentId: C, from: '2027-03-04', to: '2027-03-04', blocks: 'ALL', type: '병결', reason: '가짜 사유' }), '병결');
  const meal = { studentId: C, chip: 'd_gen', requestedAt: '2027-03-03T10:00:00', docSubmitted: false };
  ok(call(ADMIN, 'saveMealChange', meal, ok(call(ADMIN, 'previewMealChange', meal), '급식 미리보기').expect), '급식 저장');
  const move = (sid, type, at, eff, extra) => {
    const i = Object.assign({ studentId: sid, type, requestedAt: at, effectiveDate: eff, dinner: '중단', docSubmitted: false }, extra || {});
    return ok(call(ADMIN, 'saveMove', i, ok(call(ADMIN, 'previewMove', i), type + ' 미리보기').expect), type + ' 저장');
  };
  move(E, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-05');
  move(F, '학사 퇴실', '2027-03-03T15:00:00', '2027-03-04');
  const phone = env.rows('violation_rules').find((r) => r.name.startsWith('휴대폰'));
  ['2027-03-02T21:00', '2027-03-03T19:00'].forEach((at) => ok(call(ADMIN, 'saveOut', { studentId: D, occurredAt: at, ruleId: phone.id, detectedBy: '', memo: '가짜' }), 'OUT'));
  const dTeacher = env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === D).teacher_email;
  ok(call(dTeacher, 'saveOutMeeting', { studentId: D, date: '2027-03-03', content: '가짜 면담' }), '면담');
  const conf = ok(call(ADMIN, 'confirmOutDismissal', D), '퇴실 확정');
  move(D, '학사 퇴실', '2027-03-03T20:00:00', conf.prefill.effectiveDate, { outDismissal: true });
  env.setNow('2027-03-08T20:00:00');
  move(F, '학사 입실', '2027-03-06T10:00:00', '2027-03-08', { meals: call(ADMIN, 'getMoveContext', F, '2027-03-08').reentry.meals });
  const sheets = {};
  ['2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05', '2027-03-06', '2027-03-07', '2027-03-08'].forEach((d) => { sheets[d] = JSON.stringify(call(ADMIN, 'getAttendanceSheet', d)); });
  const nameOf = (id) => students.find((s) => s.id === id).name;
  const present = (d, id) => sheets[d].includes(nameOf(id));

  // 4) 식수 집계
  const mc = call(ADMIN, 'getMealCounts', '2027-03-05');
  const all = mc.rows.find((r) => r.key === '전체');

  // 5) 학기 전환. 여름방학은 이어받기가 없고(명단 올리기) — 1학기 끝 학사생 + 신규 1명 + 2OUT 퇴실 학생(막힘)을 올린다.
  //    2학기는 1학기 학사생을 이어받는다(퇴실 E·2OUT D 제외, 재입실 F 포함)
  env.setNow('2027-07-10T10:00:00');
  const st = ok(call(ADMIN, 'saveTerm', { name: '2027 여름방학', type: '방학', start_date: '2027-07-19', end_date: '2027-08-31', memo: '가짜' }), '방학 만들기');
  const cpS = call(ADMIN, 'previewCarryOver', st.id);
  const stayIds = new Set(students.map((s) => s.id).filter((id) => on(id, '학사', term.end_date) === '입실'));
  const newbie = plain(gen.buildFakeData_({ count: n + 1, seed: 2027 })).students[n];
  newbie.student_no = '3' + String(9000 + n).slice(-4);
  const keep = fake.students.filter((s) => stayIds.has(byNo[s.student_no].id) || byNo[s.student_no].id === D);
  const summerEnr = Object.assign({}, enrOf, { [newbie.id]: { commute_type: '일반', veritas: 'FALSE', teacher_email: HALL } });
  const text2 = rosterText(keep.concat(newbie), summerEnr);
  const opts2 = { termId: st.id, ymd: '2027-07-19' };
  const pv2 = ok(call(ADMIN, 'previewRoster', text2, opts2), '방학 명단 미리보기');
  ok(call(ADMIN, 'commitRoster', text2, opts2, { counts: pv2.counts, termId: pv2.term.id, ymd: pv2.ymd }), '방학 명단 저장');
  const summerAfter = new Set(env.rows('enrollments').filter((e) => e.term_id === st.id).map((e) => e.student_id));
  const t2 = ok(call(ADMIN, 'saveTerm', { name: '2027 2학기', type: '학기', start_date: '2027-09-01', end_date: '2027-12-31', memo: '가짜' }), '2학기 만들기');
  const cp = ok(call(ADMIN, 'previewCarryOver', t2.id), '이어받기 미리보기');
  ok(call(ADMIN, 'commitCarryOver', t2.id, cp.count), '이어받기 저장');
  const fallIds = new Set(env.rows('enrollments').filter((e) => e.term_id === t2.id).map((e) => e.student_id));

  return {
    stats, n,
    facts: {
      students: students.length, seated, dormIds: dormIds.length, roomed: rp.assignments.length,
      autoOut: env.rows('violations_' + term.id.slice(0, 8)).filter((v) => v.student_id === A && v.source === 'F1자동' && v.status === '유효').length,
      sheetE: [present('2027-03-04', E), present('2027-03-05', E)],
      sheetF: [present('2027-03-03', F), present('2027-03-04', F), present('2027-03-08', F)],
      sheetD: [present('2027-03-03', D), present(conf.prefill.effectiveDate, D)],
      dinnerC: [on(C, '석식', '2027-03-02'), on(C, '석식', '2027-03-03')],
      mealAll: all && { hall: Number(all.hall), hallDinner: Number(all.hallDinner), generalDinner: Number(all.generalDinner) },
      hallOn305: students.filter((s) => on(s.id, '학사', '2027-03-05') === '입실').length,
      summerCarry: cpS.applicable, stay: stayIds.size, banned: pv2.lists.banned.map((b) => b.student_no), newCount: pv2.counts.newStudents,
      summer: { after: summerAfter.size, hasD: summerAfter.has(D), hasF: summerAfter.has(F), hasE: summerAfter.has(E) },
      carry: cp.count, fall: { size: fallIds.size, hasD: fallIds.has(D), hasE: fallIds.has(E), hasF: fallIds.has(F) },
      dStudentNo: students.find((s) => s.id === D).student_no
    }
  };
}

const big = rehearse(180);
const small = rehearse(30);

test('리허설 180명: 명단 → 좌석·방 초안 → 1주일 기록 → 식수 집계 → 여름방학 전환(신규 1명, 2OUT 퇴실 학생 막힘)', () => {
  const f = big.facts;
  assert.strictEqual(f.students, 180);
  assert.strictEqual(f.seated, 180, '좌석 초안이 180명 모두 앉힌다(1층 146 + SA 51)');
  assert.strictEqual(f.roomed, f.dormIds, '방 초안이 기숙사생 모두를 넣는다');
  assert.strictEqual(f.autoOut, 1, '미인정결석 → 자동 1OUT');
  assert.deepStrictEqual(f.sheetE, [true, false], '퇴실 학생은 퇴실일부터 출석부에서 빠진다');
  assert.deepStrictEqual(f.sheetF, [true, false, true], '재입실 학생은 퇴실 동안 빠졌다가 돌아온다');
  assert.deepStrictEqual(f.sheetD, [true, false], '2OUT 퇴실 학생은 적용일부터 빠진다');
  assert.deepStrictEqual(f.dinnerC, ['학사 석식', '일반 석식'], '11:30 전 일반 석식 신청은 당일부터');
  assert.strictEqual(f.mealAll.hall, f.hallOn305, '식수 집계 학사 인원 = 그날 학사 입실 학생 수');
  assert.ok(f.mealAll.generalDinner >= 1);
  assert.strictEqual(f.stay, 180 - 2, '1학기 끝 학사생 = 180 − 퇴실 E − 2OUT D(재입실 F 포함)');
  assert.strictEqual(f.summerCarry, false, '방학은 이어받기 없음(명단 올리기)');
  assert.deepStrictEqual(f.banned, [f.dStudentNo], '2OUT 퇴실 학생은 방학 명단에서 막힌다(결정 63)');
  assert.strictEqual(f.newCount, 1);
  assert.deepStrictEqual([f.summer.after, f.summer.hasD, f.summer.hasE, f.summer.hasF], [f.stay + 1, false, false, true], '방학 등록 = 1학기 끝 학사생 + 신규 1명');
  assert.strictEqual(f.carry, f.stay, '2학기 이어받기 = 1학기 끝 학사생(기존 유지, 퇴실 반영)');
  assert.deepStrictEqual([f.fall.size, f.fall.hasD, f.fall.hasE, f.fall.hasF], [f.stay, false, false, true]);
});

test('같은 흐름 30명도 통과하고, 공개 함수마다 시트 읽기 횟수는 180명에서 늘지 않는다(학생 수에 비례하지 않음)', () => {
  assert.strictEqual(small.facts.seated, 30);
  assert.deepStrictEqual(small.facts.banned, [small.facts.dStudentNo]);
  const rows = Object.keys(big.stats).sort().map((fn) => [fn, small.stats[fn] && small.stats[fn].reads, big.stats[fn].reads, big.stats[fn].ms]);
  for (const [fn, r30, r180] of rows) assert.ok(r180 <= r30 + 1, fn + ' 읽기 30명 ' + r30 + ' → 180명 ' + r180);
  const top = rows.slice().sort((a, b) => b[2] - a[2] || b[3] - a[3]).slice(0, 5);
  console.log('    | 공개 함수 | 시트 읽기(30명) | 시트 읽기(180명) | 걸린 시간(180명, gas-fakes) |');
  top.forEach(([fn, r30, r180, ms]) => console.log('    | ' + fn + ' | ' + r30 + ' | ' + r180 + ' | ' + ms + 'ms |'));
});
