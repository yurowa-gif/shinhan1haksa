/**
 * T5 가짜 데이터 보강(seedFakeStage4): 휴일 블록·휴일 2일·시험 기간 1주·학기 중 추가 입실 3명. 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';

function seededEnv(opts) {
  const env = createGasEnv({ owner: ADMIN, now: '2027-03-09T15:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = 'test.teacher@example.com';
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  if (!(opts && opts.noStage1)) env.asOwner((c) => c.seedFakeStage1());
  env.strictLock = true;
  return env;
}
const tabs = ['blocks', 'day_schedules', 'students', 'enrollments', 'status_changes'];
const counts = (env) => tabs.map((t) => env.rows(t).length);

test('seedFakeStage4: 휴일 블록 5·휴일 2일·시험 기간 5일·추가 입실 3명(학생·등록·상태 행), 두 번 실행해도 +0', () => {
  const env = seededEnv();
  const before = counts(env);
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage4()), '가짜 4단계 데이터: blocks +5, day_schedules +7, students +3, enrollments +3, status_changes +8, doc_types +6, student_docs +170, programs +1, exceptions +32, program_participants +32, students 연락처 33, guardian_links 연락처 30, 방학 +1, 방학 등록 +32, 중식 +23');
  const first = tabs.map((t) => JSON.stringify(env.rows(t)));
  assert.strictEqual(env.asOwner((c) => c.seedFakeStage4()), '가짜 4단계 데이터: blocks +0, day_schedules +0, students +0, enrollments +0, status_changes +0, doc_types +0, student_docs +0, programs +0, exceptions +0, program_participants +0, students 연락처 0, guardian_links 연락처 0, 방학 +0, 방학 등록 +0, 중식 +0');
  assert.deepStrictEqual(tabs.map((t) => JSON.stringify(env.rows(t))), first, '두 번째 실행 뒤 그대로');
  assert.deepStrictEqual(counts(env), before.map((n, i) => n + [5, 7, 3, 3 + 32, 8 + 23][i]));

  const days = env.rows('day_schedules');
  assert.deepStrictEqual(days.filter((d) => d.day_type === 'holiday').map((d) => [d.date, d.start, d.end]), [['2027-05-05', '09:00', '21:50'], ['2027-06-03', '09:00', '21:50']]);
  assert.deepStrictEqual(days.filter((d) => d.memo === '가짜: 시험 기간').map((d) => d.date), ['2027-04-19', '2027-04-20', '2027-04-21', '2027-04-22', '2027-04-23']);
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const extra = env.rows('students').filter((s) => s.memo === '가짜 데이터(4단계 추가 입실)');
  assert.strictEqual(extra.length, 3);
  assert.strictEqual(new Set(env.rows('students').map((s) => s.student_no)).size, env.rows('students').length, '학번 겹침 없음');
  extra.forEach((s) => {
    assert.ok(env.rows('enrollments').some((e) => e.student_id === s.id && e.term_id === term.id), s.name + ' 이번 기간 등록');
    const ch = env.rows('status_changes').filter((c) => c.student_id === s.id && c.item !== '중식');   // 중식은 방학 시드(아래 시험)
    assert.ok(ch.length >= 2 && ch.every((c) => c.effective_date === '2027-04-01' && c.source === '명단업로드'), s.name + ' 4/1 입실 행');
  });
  assert.strictEqual(env.rows('status_changes').filter((c) => extra.some((s) => s.id === c.student_id) && c.item === '기숙사').length, 1, '기숙사생 1명');
});

test('seedFakeStage4 뒤 출석부: 휴일은 휴일 블록 5칸, 시험 기간은 운영, 추가 입실 학생은 3/31에는 없고 4/1부터 미배정으로', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage4());
  const sheet = (d) => { env.setNow(d + 'T15:00:00'); return plain(env.call(ADMIN, 'getAttendanceSheet', d, true)); };
  const hol = sheet('2027-05-05');
  assert.strictEqual(hol.ok && hol.operating, true, JSON.stringify(hol).slice(0, 200));
  assert.deepStrictEqual(hol.blockLabels, ['09–12', '14–15:30', '15:30–17', '19–20:30', '20:30–21:50']);
  const exam = sheet('2027-04-20');
  assert.strictEqual(exam.ok && exam.operating, true);
  const names = ['가추가', '나추가', '다추가'];
  const before = JSON.stringify(sheet('2027-03-31')), after = sheet('2027-04-01');
  names.forEach((n) => assert.ok(!before.includes(n), n + ' 3/31 없음'));
  names.forEach((n) => assert.ok(JSON.stringify(after).includes(n), n + ' 4/1 있음'));
  assert.strictEqual(after.unseatedCount, 4, '3/15 중도 입실 1 + 추가 입실 3(자리 미배정)');
});

test('seedFakeStage4: 1단계가 없거나·가짜가 아닌 학생이 있거나·그날 다른 일정이 있으면 쓰지 않는다, 뒤에는 1~3단계 시드가 다시 돌지 않는다', () => {
  const env0 = seededEnv({ noStage1: true });
  assert.ok(/seedFakeStage1/.test(env0.errorOf(ADMIN, (c) => c.seedFakeStage4()).message));

  const env1 = seededEnv();
  env1.as(ADMIN, (c) => c.appendRecord_('day_schedules', { date: '2027-05-05', operating: 'FALSE', start: '', end: '', day_type: '', memo: '관리자', status: '유효' }, ADMIN));
  const n = counts(env1);
  assert.ok(/다른 일정 1개/.test(env1.errorOf(ADMIN, (c) => c.seedFakeStage4()).message));
  assert.deepStrictEqual(counts(env1), n, '쓰기 없음');

  const env2 = seededEnv();
  env2.as(ADMIN, (c) => c.appendRecord_('students', { name: '진짜', memo: '' }, ADMIN));
  assert.ok(/가짜 학생/.test(env2.errorOf(ADMIN, (c) => c.seedFakeStage4()).message));

  const env3 = seededEnv();
  env3.asOwner((c) => c.seedFakeStage4());
  assert.ok(/가짜 학생/.test(env3.errorOf(ADMIN, (c) => c.seedFakeStage1()).message), '추가 입실 뒤 1단계 시드는 거부(학생 수 기반 시드가 어긋나지 않게)');
});

test('seedFakeStage4 서류·프로그램·전화(S4-0): 서류 6종·일부 미제출·해당없음, 프로그램 참가자 32명 = 그날 학사생, 참가자마다 학사 내 프로그램 특이사항, 가짜 번호는 010-0000-xxxx·감사에는 생략 표시만', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage4());
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const tab = (base) => env.as(ADMIN, (c) => c.termSheetName_(base, term.id));
  const types = env.rows('doc_types');
  assert.deepStrictEqual(types.map((t) => t.name), ['입실 동의서', '학부모 개인정보 동의', '자기소개서', '상담 기록지', '결핵검사 결과', '학원 수강증']);
  const enrolled = env.rows('enrollments').filter((e) => e.term_id === term.id).map((e) => e.student_id);
  const docs = env.rows(tab('student_docs'));
  const missing = enrolled.length * types.length - docs.length;
  assert.ok(missing > 10 && missing < enrolled.length * 2, '미제출(행 없음) ' + missing);
  assert.ok(docs.some((d) => d.state === '해당없음') && docs.filter((d) => d.state === '제출').every((d) => /^2027-03-0\d$/.test(d.submitted_date)));
  assert.strictEqual(new Set(docs.map((d) => d.student_id + '|' + d.doc_type_id)).size, docs.length, '학생·서류 종류마다 최대 1행');

  const prog = env.rows('programs');
  assert.strictEqual(prog.length, 1);
  const parts = env.rows('program_participants');
  const on = (sid) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, '학사', prog[0].date));
  assert.strictEqual(parts.length, 32, '30명대');
  assert.deepStrictEqual(parts.map((p) => p.student_id).sort(), enrolled.filter((sid) => on(sid) === '입실').sort(), '그날 학사생 전원(퇴실자 빼고 추가 입실 넣고)');
  const ex = Object.fromEntries(env.rows(tab('exceptions')).map((e) => [e.id, e]));
  parts.forEach((p) => {
    const e = ex[p.exception_id];
    assert.ok(e && e.student_id === p.student_id && e.date === prog[0].date && e.blocks === prog[0].blocks && e.status === '확정' && /^학사 내 프로그램/.test(e.type));
    assert.strictEqual(e.reason, '프로그램: ' + prog[0].name, 'C28과 같은 사유');
  });
  assert.strictEqual(new Set(parts.map((p) => ex[p.exception_id].group_id)).size, parts.length, '묶음 id는 참가자마다 새로(C28)');
  env.setNow(prog[0].date + 'T15:00:00');
  assert.ok(JSON.stringify(plain(env.call(ADMIN, 'getAttendanceSheet', prog[0].date, true))).includes('내부'), '출석부 칸에 내부(학사 내 프로그램)');

  const phones = env.sheetValues('students').slice(1).map((r) => r[env.sheetValues('students')[0].indexOf('phone')]).concat(
    env.sheetValues('guardian_links').slice(1).map((r) => r[env.sheetValues('guardian_links')[0].indexOf('phone')]));
  assert.strictEqual(phones.length, 63);
  assert.ok(phones.every((p) => /^010-0000-\d{4}$/.test(p)) && new Set(phones).size === 63, '가짜 형식, 서로 다름');
  const contactAudit = env.rows('audit_log').filter((x) => x.action === 'bulk_update' && ['students', 'guardian_links'].includes(x.sheet));
  assert.strictEqual(contactAudit.length, 2, '연락처 쓰기 감사 줄(학생·보호자)');
  assert.ok(contactAudit.every((x) => x.after.includes('(연락처 생략)')), '값 대신 생략 표시');
  assert.ok(!JSON.stringify(env.rows('audit_log')).includes('010-0000') && !JSON.stringify(env.rows('audit_log')).includes('가짜보호자'), '감사 기록에 번호·보호자 이름 값 없음');
  assert.ok(!JSON.stringify(env.as(ADMIN, (c) => c.readAll_('students'))).includes('010-0000'), 'readAll_에는 연락처 열이 없다');
});

test('seedFakeStage4 방학 중식(R19): 여름방학 기간·등록(1학기 끝날 학사생), 중식은 방학 시작일부터 22명, 1명은 방학 중 미실시 → 다음 주 월요일, 집계 lunch는 방학 날만', () => {
  const env = seededEnv();
  env.asOwner((c) => c.seedFakeStage4());
  const vac = env.rows('terms').find((t) => t.type === '방학');
  assert.deepStrictEqual([vac.name, vac.start_date, vac.end_date], ['2027 여름방학(테스트)', '2027-07-19', '2027-08-13']);
  const t1 = env.rows('terms').find((t) => t.name === '2027 1학기');
  const on = (sid, item, ymd) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, item, ymd));
  const vacIds = env.rows('enrollments').filter((e) => e.term_id === vac.id).map((e) => e.student_id).sort();
  const stay = env.rows('enrollments').filter((e) => e.term_id === t1.id && on(e.student_id, '학사', t1.end_date) === '입실').map((e) => e.student_id).sort();
  assert.deepStrictEqual(vacIds, stay, '방학 등록 = 1학기 끝날 학사생');
  const lunch = env.rows('status_changes').filter((c) => c.item === '중식');
  assert.strictEqual(lunch.filter((c) => c.value === '실시' && c.effective_date === vac.start_date).length, 22);
  const stop = lunch.filter((c) => c.value === '미실시');
  assert.deepStrictEqual(stop.map((c) => [c.requested_at, c.effective_date]), [['2027-07-21T10:00:00', '2027-07-26']], '수 11:30 전 → 다음 주 월요일(결정 71)');
  const counts = (ymd, v) => env.as(ADMIN, (c) => c.mealCountsOn_(c.readAll_('students'), c.readAll_('enrollments'), c.readAll_('status_changes'), v ? vac.id : t1.id, ymd, '', v ? vac : undefined).groups['전체'].lunch);
  assert.strictEqual(counts('2027-07-20', true), 22);
  assert.strictEqual(counts('2027-07-27', true), 21, '미실시 적용 뒤');
  assert.strictEqual(counts('2027-03-09', false), 0, '학기에는 중식 0');
});
