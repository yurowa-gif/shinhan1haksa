/**
 * 상담 내용 노출 감시(F12·결정 42, T6). 상담 내용마다 다른 표지 [CN-0001]을 넣고 모든 역할 × 읽기·미리보기 공개 함수 응답,
 * 출력물, 메일, audit_log, 운영 DB·설정 시트를 훑는다. 가짜 데이터만.
 * 볼 수 있는 사람: 그 학생의 담당교사·담임(자기 반, 이번 기간 학사생)·관리자. 그날 근무교사여도 넓어지지 않는다(noDuty).
 * 상담 내용은 상담일지 스프레드시트에만 있다(운영 DB·설정 시트·감사·메일에는 없다).
 */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf, readFunctions, argSets, sheetText } = require('../helpers/leak-scan');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com';
const TODAY = '2027-03-20';
const MARK_RE = /\[CN-(\d{4})\]/g;
const marksIn = (text) => new Set([...String(text).matchAll(MARK_RE)].map((m) => 'CN-' + m[1]));
const TYPES = ['생활', '학업', '진로', '생활', '건강', '가정', '기타'];

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage2());
  env.asOwner((c) => c.seedFakeStage3());
  env.asOwner((c) => c.seedFakeStage4());
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  return env;
}

/** 담당교사가 학사생 약 40%에 상담 1~3건(내용마다 표지) + 고치기 3건 → {owner: {표지: 학생 id}, count} */
function writeNotes(env) {
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const on = (sid) => env.as(ADMIN, (c) => c.statusOn_(c.readAll_('status_changes'), sid, '학사', '2027-03-16'));
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id && on(e.student_id) === '입실')
    .sort((a, b) => (a.student_id < b.student_id ? -1 : 1));
  const owner = {};
  let n = 0;
  const saved = [];
  enr.forEach((e, i) => {
    if (i % 5 !== 0 && i % 5 !== 2) return;   // 5명 중 2명(약 40%)
    for (let k = 0; k <= i % 3; k++) {
      n += 1;
      const mark = 'CN-' + String(n).padStart(4, '0');
      const input = { studentId: e.student_id, date: '2027-03-' + String(10 + k).padStart(2, '0'), type: TYPES[n % TYPES.length],
        target: n % 5 === 0 ? '학부모' : '학생', content: '가짜 상담 내용 [' + mark + ']', showToParent: n % 10 !== 0 };
      const r = plain(env.call(e.teacher_email, 'saveCounselNote', input));
      assert.strictEqual(r.ok, true, mark + ' ' + JSON.stringify(r));
      owner[mark] = e.student_id;
      saved.push({ id: r.id, teacher: e.teacher_email, input });
    }
  });
  saved.slice(0, 3).forEach((s, j) => {   // 고치기 = 취소 + 새 행
    const mark = 'CN-' + String(9001 + j);
    const r = plain(env.call(s.teacher, 'reviseCounselNote', s.id, Object.assign({}, s.input, { content: '가짜 상담 내용(고침) [' + mark + ']' }), '가짜: 날짜 착오'));
    assert.strictEqual(r.ok, true, mark + ' ' + JSON.stringify(r));
    owner[mark] = s.input.studentId;
  });
  return { owner, count: n, term };
}

/** 이 사람이 상담 내용을 볼 수 있는 학생 id 집합 */
function visibleStudents(env, email, term) {
  const user = env.rows('users').find((u) => u.email === email);
  const roles = user ? String(user.roles).split(',').map((s) => s.trim()) : [];
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  if (roles.includes('admin')) return new Set(env.rows('students').map((s) => s.id));
  const out = new Set();
  if (roles.includes('hall_teacher')) enr.filter((e) => e.teacher_email === email).forEach((e) => out.add(e.student_id));
  if (roles.includes('homeroom')) {
    const [g, c] = String(user.homeroom_class).split('-').map(Number);
    const stu = Object.fromEntries(env.rows('students').map((s) => [s.id, s]));
    enr.filter((e) => Number(stu[e.student_id].grade) === g && Number(stu[e.student_id].class_no) === c).forEach((e) => out.add(e.student_id));
  }
  return out;
}

test('표지 찾기: [CN-0001] 모양만 세고 base64로 감싼 출력물 안도 찾는다(감시 도구 자체 확인)', () => {
  assert.deepStrictEqual([...marksIn('a [CN-0001] b [CN-9002] CN-0003 [CN-12]')], ['CN-0001', 'CN-9002']);
  assert.deepStrictEqual([...marksIn(textOf({ pdf: { base64: Buffer.from('<td>[CN-0042]</td>').toString('base64') } }))], ['CN-0042']);
});

test('상담 내용 노출 감시: 모든 역할 × 읽기 공개 함수 응답에 볼 수 없는 학생의 상담 표지가 없다(담당·담임 자기 반·관리자만), 감사·메일·운영 DB·설정 시트에는 하나도 없다', () => {
  const env = seededEnv();
  const { owner, count, term } = writeNotes(env);
  assert.ok(count >= 15, '상담 ' + count + '건');
  const all = Object.keys(owner);

  // 확인용(양성): 관리자는 그 학생 상담 목록에서 표지를 본다, 상담일지 스프레드시트에는 모든 표지가 있다
  const someSid = owner['CN-0001'];
  assert.ok(marksIn(textOf(plain(env.call(ADMIN, 'getCounselNotes', someSid)))).has('CN-0001'), '관리자 상담 목록에 표지');
  const counselSheet = sheetText(env, 'COUNSEL_ID');
  all.forEach((m) => assert.ok(counselSheet.includes('[' + m + ']'), m + ' 상담일지 파일에'));

  const fns = readFunctions();
  assert.ok(fns.some((f) => f.name === 'getCounselNotes'), '상담 읽기 함수도 감시 대상');
  const ctx = {
    today: TODAY, termIds: env.rows('terms').map((t) => t.id), studentIds: env.rows('students').map((s) => s.id),
    headId: (env.rows('status_changes')[0] || {}).id || 'x', spaceId: (env.rows('spaces')[0] || {}).id || 'x'
  };
  const teachers = [...new Set(env.rows('enrollments').filter((e) => e.term_id === term.id).map((e) => e.teacher_email))];
  const people = [ADMIN, HOMEROOM, ATT, DUTYM, STUDENT, PARENT, 'nobody@example.com'].concat(teachers);
  const leaks = [];
  let answered = 0, seen = 0;
  for (const who of people) {
    const user = env.rows('users').find((u) => u.email === who);
    const roles = user ? String(user.roles).split(',').map((s) => s.trim()) : ['student'];
    const ok = visibleStudents(env, who, term);
    for (const fn of fns) {
      for (const args of argSets(fn, Object.assign({ roles }, ctx))) {
        let out;
        try { out = plain(env.call(who, fn.name, ...args)); answered++; } catch (e) { out = e.message; }
        for (const m of marksIn(textOf(out))) {
          seen++;
          if (!ok.has(owner[m])) leaks.push(who + ' ' + fn.name + '(' + JSON.stringify(args).slice(0, 60) + ') → ' + m);
        }
      }
    }
  }
  assert.ok(answered > 100 && seen > 0, '응답 ' + answered + ', 본 표지 ' + seen + '(볼 수 있는 사람에게는 나와야 감시가 뜻이 있다)');
  assert.deepStrictEqual(leaks.slice(0, 20), [], '볼 수 없는 상담 내용이 응답에(' + leaks.length + '건)');

  // 근무교사여도 넓어지지 않는다: 담당이 아닌 학사 교사가 오늘 근무를 해도 남의 학생 상담은 거부
  const other = teachers.find((t) => t !== env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === someSid).teacher_email);
  env.asOwner((c) => c.appendRecord_('duty_slots', { date: TODAY, slot: '단독', end_time: '', original_email: other, actual_email: other, swapped_at: '', swapped_by: '', status: '유효', memo: '가짜' }, ADMIN));   // 3/20 토
  assert.strictEqual(env.as(ADMIN, (c) => c.isOnDutyFor_(other, '', 0)), true, '오늘 근무교사');
  env.expectDenied(other, 'counsel.view', 'getCounselNotes', someSid);

  // 감사·메일·운영 DB·설정 시트에는 표지가 하나도 없다
  assert.deepStrictEqual([...marksIn(JSON.stringify(env.rows('audit_log')))], [], 'audit_log');
  assert.deepStrictEqual([...marksIn(JSON.stringify(env.mail))], [], '메일');
  assert.deepStrictEqual([...marksIn(sheetText(env, 'DB_ID'))], [], '운영 DB 시트');
  assert.deepStrictEqual([...marksIn(sheetText(env, 'CONFIG_ID'))], [], '설정 시트');
});
