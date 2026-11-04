/**
 * 가짜 데이터(실제 학생 정보 사용 금지 — CLAUDE.md 1번).
 *
 * buildFakeData_(opts)  : 시트를 건드리지 않는 순수 함수. tests/에서 node로 검사한다.
 * seedFakeData()        : 편집기에서 실행. 가짜 학생 30명 + 운영 기간 + 담당·학부모 연결을 시트에 쓴다.
 *
 * 시험 계정 이메일은 코드에 적지 않고 Script Properties에 넣는다.
 *   TEST_STUDENT_EMAIL  : 가짜 학생 1번에 연결
 *   TEST_PARENT_EMAIL   : 가짜 학생 1·2번(형제)의 학부모로 연결 → 자녀 전환 탭 시험
 *   TEST_TEACHER_EMAIL  : (선택) 학사 교사, 가짜 학생 일부의 담당
 *   TEST_HOMEROOM_EMAIL : (선택) 학생 1번 반의 담임
 */

var FAKE_SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
var FAKE_GIVEN = ['가온', '나래', '다솜', '라온', '마루', '바다', '새봄', '아라', '자람', '하늘',
  '여름', '구름', '보람', '솔빛', '이슬', '한결', '누리', '단비', '별하', '해솔'];

/** 시드 고정 난수(같은 입력이면 같은 명단) */
function fakeRng_(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fakeId_(prefix, n) {
  var hex = ('00000000' + n.toString(16)).slice(-8);
  return prefix + '-0000-4000-8000-' + ('000000000000' + hex).slice(-12);
}

/**
 * @param {Object} opts
 *   ownerEmail, studentEmail, parentEmail, teacherEmail, homeroomEmail (모두 선택)
 *   count (기본 30), seed (기본 2027)
 */
function buildFakeData_(opts) {
  opts = opts || {};
  var count = opts.count || 30;
  var rand = fakeRng_(opts.seed || 2027);
  var pick = function (arr) { return arr[Math.floor(rand() * arr.length)]; };

  var terms = [
    { id: fakeId_('aaaaaaaa', 1), name: '2026 2학기(테스트)', type: '학기', start_date: '2026-08-17', end_date: '2027-02-28', memo: '가짜 데이터' },
    { id: fakeId_('aaaaaaaa', 2), name: '2027 1학기', type: '학기', start_date: '2027-03-02', end_date: '2027-07-17', memo: '가짜 데이터' }
  ];

  var fakeTeachers = ['fake.teacher1@example.com', 'fake.teacher2@example.com', 'fake.teacher3@example.com'];
  var teacherPool = fakeTeachers.slice();
  if (opts.teacherEmail) teacherPool.unshift(opts.teacherEmail);
  if (opts.ownerEmail && teacherPool.indexOf(opts.ownerEmail) < 0) teacherPool.push(opts.ownerEmail);

  var users = [
    { email: fakeTeachers[0], name: '가짜교사1', roles: 'hall_teacher', homeroom_class: '', active: 'TRUE', memo: '가짜 데이터' },
    { email: fakeTeachers[1], name: '가짜교사2', roles: 'hall_teacher,duty_manager', homeroom_class: '', active: 'TRUE', memo: '가짜 데이터' },
    { email: fakeTeachers[2], name: '가짜교사3', roles: 'hall_teacher', homeroom_class: '', active: 'TRUE', memo: '가짜 데이터' }
  ];

  var students = [];
  var enrollments = [];
  var guardianLinks = [];
  var usedNos = {};

  for (var i = 0; i < count; i++) {
    var grade = (i % 3) + 1;
    var classNo, number, no;
    do {
      classNo = 1 + Math.floor(rand() * 8);
      number = 1 + Math.floor(rand() * 30);
      no = String(grade) + ('0' + classNo).slice(-2) + ('0' + number).slice(-2);
    } while (usedNos[no]);
    usedNos[no] = true;

    var surname = pick(FAKE_SURNAMES);
    // 1·2번은 형제(같은 성, 같은 학부모)
    if (i === 1) surname = students[0].name.charAt(0);
    var gender = rand() < 0.6 ? '여' : '남';
    var email = 'fake.student' + ('0' + (i + 1)).slice(-2) + '@example.com';
    if (i === 0 && opts.studentEmail) email = opts.studentEmail;

    var s = {
      id: fakeId_('bbbbbbbb', i + 1),
      student_no: no,
      name: surname + pick(FAKE_GIVEN),
      gender: gender,
      grade: String(grade),
      class_no: String(classNo),
      number: String(number),
      track: grade === 1 ? '' : (rand() < 0.5 ? '문' : '이'),
      email: email,
      memo: '가짜 데이터'
    };
    students.push(s);

    var teacher = teacherPool[i % teacherPool.length];
    terms.forEach(function (t, ti) {
      enrollments.push({
        id: fakeId_(ti === 0 ? 'cccccccc' : 'dddddddd', i + 1),
        term_id: t.id,
        student_id: s.id,
        teacher_email: teacher,
        veritas: rand() < 0.25 ? 'TRUE' : 'FALSE',
        commute_type: pick(['일반', '일반', '원거리(관내)', '원거리(관외)']),
        end_type: rand() < 0.3 ? '23:00' : '23:50',
        memo: '가짜 데이터'
      });
    });

    var parentEmail = (i <= 1 && opts.parentEmail) ? opts.parentEmail
      : 'fake.parent' + ('0' + (i === 1 ? 1 : i + 1)).slice(-2) + '@example.com';
    guardianLinks.push({
      id: fakeId_('eeeeeeee', i + 1),
      parent_email: parentEmail,
      student_id: s.id,
      relation: rand() < 0.5 ? '모' : '부',
      memo: '가짜 데이터'
    });
  }

  if (opts.studentEmail) {
    users.push({ email: opts.studentEmail, name: students[0].name + '(시험 학생)', roles: 'student', homeroom_class: '', active: 'TRUE', memo: '시험 계정' });
  }
  if (opts.parentEmail) {
    users.push({ email: opts.parentEmail, name: '시험 학부모', roles: 'parent', homeroom_class: '', active: 'TRUE', memo: '시험 계정' });
  }
  if (opts.teacherEmail) {
    users.push({ email: opts.teacherEmail, name: '시험 학사교사', roles: 'hall_teacher', homeroom_class: '', active: 'TRUE', memo: '시험 계정' });
  }
  if (opts.homeroomEmail) {
    users.push({
      email: opts.homeroomEmail, name: '시험 담임', roles: 'homeroom',
      homeroom_class: students[0].grade + '-' + students[0].class_no, active: 'TRUE', memo: '시험 계정'
    });
  }

  return { terms: terms, students: students, enrollments: enrollments, guardianLinks: guardianLinks, users: users };
}

/** 편집기에서 실행. 학생 탭이 비어 있을 때만 동작한다. */
function seedFakeData() {
  var owner = assertOwnerRun_();
  if (readAll_('students').length) {
    throw new Error('students 탭에 이미 데이터가 있습니다. 가짜 데이터는 빈 DB에서만 만듭니다.');
  }
  var p = props_();
  var data = buildFakeData_({
    ownerEmail: owner,
    studentEmail: normalizeEmail_(p.getProperty('TEST_STUDENT_EMAIL')),
    parentEmail: normalizeEmail_(p.getProperty('TEST_PARENT_EMAIL')),
    teacherEmail: normalizeEmail_(p.getProperty('TEST_TEACHER_EMAIL')),
    homeroomEmail: normalizeEmail_(p.getProperty('TEST_HOMEROOM_EMAIL'))
  });

  var existingUsers = readAll_('users').map(function (u) { return normalizeEmail_(u.email); });
  bulkAppend_('terms', data.terms, owner);
  bulkAppend_('students', data.students, owner);
  bulkAppend_('enrollments', data.enrollments, owner);
  bulkAppend_('guardian_links', data.guardianLinks, owner);
  bulkAppend_('users', data.users.filter(function (u) { return existingUsers.indexOf(u.email) < 0; }), owner);

  var msg = '가짜 데이터: 운영 기간 ' + data.terms.length + ', 학생 ' + data.students.length +
    ', 등록 ' + data.enrollments.length + ', 학부모 연결 ' + data.guardianLinks.length;
  console.log(msg);
  return msg;
}

/** 여러 행을 한 번에 쓴다(가짜 데이터용). audit_log에는 한 줄로 요약해 남긴다. */
function bulkAppend_(sheetName, rows, actorEmail) {
  if (!rows.length) return;
  withLock_(function () {
    var sh = getSheet_('db', sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(cellToString_);
    var now = nowIso_();
    var values = rows.map(function (r) {
      var rec = {};
      Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
      rec.id = rec.id || Utilities.getUuid();
      rec.created_at = rec.updated_at = now;
      rec.created_by = rec.updated_by = actorEmail;
      return toRowArray_(headers, rec);
    });
    var firstRow = sh.getLastRow() + 1;
    ensureRows_(sh, firstRow, values.length);
    var range = sh.getRange(firstRow, 1, values.length, headers.length);
    range.setNumberFormat('@');
    range.setValues(values);
    invalidate_('db', sheetName);
    writeAudit_(sheetName, '', 'bulk_create', null, null, actorEmail, 'db', rows.length + '행 (가짜 데이터)');
  });
}
