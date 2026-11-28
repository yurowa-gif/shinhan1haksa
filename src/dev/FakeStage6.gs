/**
 * S6-0 가짜 데이터(6단계, 결정 89~101). 실제 학생·학부모 정보 사용 금지(CLAUDE.md 1번) — 글은 모두 '가짜 …'로 시작하고 대학·주소·파일 id도 가짜다.
 * 편집기에서 setup()(6단계 탭을 만든다) → seedFakeData() → seedFakeStage1() 뒤에 seedFakeStage6()을 실행한다. 두 번 실행해도 중복 없음(id가 이미 있으면 건너뜀).
 *
 * 2027 1학기 등록생을 학번 순으로 세어(0번부터) 이렇게 채운다. 번호가 학생별 시나리오다:
 *  - 진로 프로필(career_profiles): 0번 3버전(공개 '' → 'hopes;targets' → 'hopes'), 1번 2버전(공개 3항목 → 공개 거둠), 2번 1버전(targets 공개),
 *    3번 v1 취소 + v2(번호를 다시 쓰지 않음), 4번 1버전(strengths·concerns 공개), 5번은 마감 뒤(4/2) 제출. 6번 이후는 미제출. terms.career_due를 '2027-03-31'로(비어 있을 때만).
 *  - 이수 계획(course_plans): 0번 4줄(계획·확정·바꿔서 취소+새 줄), 1번 확정 1줄, 2번 계획 1줄. 공개 TRUE·FALSE 섞음.
 *  - 탐구 기록(inquiry_records): 0번 3건(관심·진행 중·완료, 출처 셋), 1번 2건(이름 다름 표시 1, 취소 1), 2번 1건. 공개 섞음, 원본 파일 id는 가짜.
 *  - 피드백(feedback): 0번에게 프로필·이수 계획·탐구 기록 각 1건, 1번 취소 1건.
 *  - 상담 신청(counsel_requests): 0번 신청, 1번 확정, 2번 완료(상담일지에 연결), 3번 반려(사유), 4번 취소 — 열린 신청(신청·확정)은 학생마다 최대 1건.
 *  - 상담일지(counsel_notes) 6단계 열: 2번(신청 연결·합의 사항 학부모 공개 TRUE·참고 프로필 v1), 0번(합의 사항 비공개·참고 v3), 1번(학부모 대상, 합의 사항 없음).
 * 시험(tests/features/fake_stage6.test.js)이 판정표(stage6-rules-draft 2절)에 필요한 모든 경우가 있는지 본다.
 */

var FAKE6_MEMO = '가짜 데이터(6단계)';
var FAKE6_DUE = '2027-03-31';

/** 순수: 가짜 진로 희망·목표 JSON 문자열(희망 1~3순위, 목표 진학). 모두 가짜 이름 */
function fake6Hopes_(i, v) {
  return JSON.stringify([{ rank: 1, field: '가짜 분야 ' + (i + 1), job: '가짜 직업 ' + (i + 1) + '-' + v }, { rank: 2, field: '가짜 분야 ' + (i + 2), job: '가짜 직업 ' + (i + 2) }]);
}
function fake6Targets_(i) {
  return JSON.stringify([{ university: '가짜대학교 ' + (i % 3 + 1), unit: '가짜학과 ' + (i % 4 + 1), track: '학생부종합' }]);
}

/**
 * 순수: 6단계 가짜 행. term = 2027 1학기 행, ordered = [{student, enrollment}] 학번 순(12명 이상).
 * → {termPatch:{career_due}, profiles, plans, inquiries, feedback, requests, notes} (id 고정 — fakeId_ 접두어 fa6a·fa6b·fa6c·fa6d·fa6e·fa6f)
 */
function buildFakeStage6_(term, ordered) {
  if (ordered.length < 12) throw new Error('2027 1학기 등록생이 12명 이상이어야 합니다(seedFakeStage1을 먼저).');
  var teacherOf = function (i) { return ordered[i].enrollment.teacher_email; };
  var sid = function (i) { return ordered[i].student.id; };
  var seq = { p: 0, c: 0, q: 0, f: 0, r: 0, n: 0 };
  var profiles = [], plans = [], inquiries = [], feedback = [], requests = [], notes = [];

  var profile = function (i, version, at, parentFields, cancelReason) {
    var r = { id: fakeId_('fa6a0000', ++seq.p), term_id: term.id, student_id: sid(i), version: String(version), hopes: fake6Hopes_(i, version), targets: fake6Targets_(i),
      interests: '가짜 관심 분야 ' + (i + 1), strengths: '가짜 강점 ' + (i + 1), concerns: '가짜 고민 ' + (i + 1), parent_fields: parentFields, submitted_at: at,
      status: cancelReason ? '취소' : '유효', cancel_reason: cancelReason || '' };
    profiles.push(r); return r;
  };
  profile(0, 1, '2027-03-05T10:00:00', '');
  profile(0, 2, '2027-03-20T10:00:00', 'hopes;targets');
  var p03 = profile(0, 3, '2027-04-10T10:00:00', 'hopes');
  profile(1, 1, '2027-03-06T10:00:00', 'hopes;targets;interests');
  profile(1, 2, '2027-03-25T10:00:00', '');
  profile(2, 1, '2027-03-07T10:00:00', 'targets');
  profile(3, 1, '2027-03-08T10:00:00', '', '가짜: 잘못 제출해서 취소');
  profile(3, 2, '2027-03-09T10:00:00', '');
  profile(4, 1, '2027-03-10T10:00:00', 'strengths;concerns');
  profile(5, 1, '2027-04-02T10:00:00', '');   // 마감(3/31) 뒤 제출

  var entryYear = function (i) { return String(2027 - Number(ordered[i].student.grade) + 1); };
  var plan = function (i, group, course, state, show, cancelReason) {
    var r = { id: fakeId_('fa6b0000', ++seq.c), term_id: term.id, student_id: sid(i), entry_year: entryYear(i), grade: String(ordered[i].student.grade), semester: '1',
      choice_group: group, course: course, state: state, confirmed_by: state === '확정' ? teacherOf(i) : '', confirmed_at: state === '확정' ? '2027-03-28T15:00:00' : '',
      show_to_parent: show ? 'TRUE' : 'FALSE', status: cancelReason ? '취소' : '유효', cancel_reason: cancelReason || '' };
    plans.push(r); return r;
  };
  plan(0, '가짜 선택군 A', '가짜 과목 가', '계획', true);
  var p0b = plan(0, '가짜 선택군 A', '가짜 과목 나', '확정', false);
  plan(0, '가짜 선택군 B', '가짜 과목 다', '계획', false, '가짜: 과목을 바꿔서 취소');
  plan(0, '가짜 선택군 B', '가짜 과목 라', '계획', true);
  plan(1, '가짜 선택군 A', '가짜 과목 가', '확정', true);
  plan(2, '가짜 선택군 B', '가짜 과목 다', '계획', false);

  var inquiry = function (i, source, standards, liked, progress, link, show, mismatch, cancelReason) {
    var n = ++seq.q;
    var r = { id: fakeId_('fa6c0000', n), term_id: term.id, student_id: sid(i), source_id: 'fake-src-' + (i + 1) + '-' + n, recorded_at: '2027-03-1' + (n % 9) + 'T09:00:00',
      source: source, standards: standards, subject: '가짜 교과 ' + (n % 3 + 1), title: '가짜 탐구 주제 ' + n, question: '가짜 중심 질문 ' + n, liked: liked ? 'TRUE' : 'FALSE',
      progress: progress, result_link: link, memo: progress === '관심' ? '' : '가짜 메모 ' + n, file_id: 'fake-drive-file-' + (i + 1), name_mismatch: mismatch ? 'TRUE' : 'FALSE',
      show_to_parent: show ? 'TRUE' : 'FALSE', status: cancelReason ? '취소' : '유효', cancel_reason: cancelReason || '' };
    inquiries.push(r); return r;
  };
  var q1 = inquiry(0, 'ChatGPT', '[12가짜01-01];[12가짜01-02]', true, '진행 중', '', true, false);
  inquiry(0, '연결 예시', '[12가짜02-01];[12가짜02-03]', false, '관심', '', false, false);
  inquiry(0, '기본 추천', '[12가짜03-02];[12가짜03-04]', true, '완료', 'https://example.com/fake-result-1', true, false);
  inquiry(1, 'ChatGPT', '[12가짜01-01];[12가짜04-01]', true, '관심', '', false, true);
  inquiry(1, 'ChatGPT', '[12가짜05-01];[12가짜05-02]', false, '관심', '', false, false, '가짜: 파일 정리(졸업·퇴실 1년 뒤)');
  inquiry(2, '기본 추천', '[12가짜06-01];[12가짜06-02]', true, '진행 중', '', false, false);

  var fb = function (i, kind, target, content, cancelReason) {
    feedback.push({ id: fakeId_('fa6d0000', ++seq.f), term_id: term.id, student_id: sid(i), target_kind: kind, target_id: target.id, content: content, teacher_email: teacherOf(i),
      status: cancelReason ? '취소' : '유효', cancel_reason: cancelReason || '' });
  };
  fb(0, '진로 프로필', p03, '가짜 피드백: 희망 분야를 더 구체적으로 적어 보세요.');
  fb(0, '이수 계획', p0b, '가짜 피드백: 선택군 A의 과목 선택이 목표와 잘 맞습니다.');
  fb(0, '탐구 기록', q1, '가짜 피드백: 중심 질문을 한 문장으로 줄여 보세요.');
  fb(1, '진로 프로필', profiles[3], '가짜 피드백: (잘못 쓴 글이라 취소)', '가짜: 다른 학생 글에 잘못 씀');

  var email = function (i) { return ordered[i].student.email || ('fake.student' + (i + 1) + '@example.com'); };
  var request = function (i, status, wish, topic, memo, decided, reason) {
    var r = { id: fakeId_('fa6e0000', ++seq.r), term_id: term.id, student_id: sid(i), requester_email: email(i), wish_dates: wish, topic: topic, memo: memo, status: status,
      decided_date: decided || '', linked_note_id: '', cancel_reason: reason || '' };
    requests.push(r); return r;
  };
  request(0, '신청', '2027-04-12;2027-04-13;2027-04-14', '진로', '가짜 메모: 진로 상담을 받고 싶어요.');
  request(1, '확정', '2027-04-12;2027-04-15', '학습', '가짜 메모: 공부 계획을 같이 봐 주세요.', '2027-04-12');
  var done = request(2, '완료', '2027-03-22', '진학', '가짜 메모: 이수 계획 상담', '2027-03-22');
  request(3, '반려', '2027-04-05', '생활', '', '', '가짜: 그 주는 시험 기간이라 어렵습니다. 다른 날을 골라 다시 신청해 주세요.');
  request(4, '취소', '2027-04-06', '기타', '', '', '학생이 취소');

  var note = function (i, date, type, target, agreement, toParent, version, requestId, showParent) {
    var r = { id: fakeId_('fa6f0000', ++seq.n), student_id: sid(i), date: date, teacher_email: teacherOf(i), type: type, target: target, linked_violation_id: '',
      content: '가짜 상담 내용 ' + seq.n, agreement: agreement, agreement_to_parent: toParent ? 'TRUE' : 'FALSE', profile_version: version, request_id: requestId,
      show_to_parent: showParent ? 'TRUE' : 'FALSE', status: '유효', cancel_reason: '' };
    notes.push(r); return r;
  };
  var n1 = note(2, '2027-03-22', '진로', '학생', '가짜 합의: 이수 계획을 다음 주까지 다시 보기', true, '1', done.id, true);
  done.linked_note_id = n1.id;
  note(0, '2027-04-15', '진로', '학생', '가짜 합의: 방학 전까지 진로 프로필 보완', false, '3', '', true);
  note(1, '2027-03-30', '학습', '학부모', '', false, '', '', false);

  return { termPatch: { career_due: FAKE6_DUE }, profiles: profiles, plans: plans, inquiries: inquiries, feedback: feedback, requests: requests, notes: notes };
}

/** 편집기에서 실행. setup() → seedFakeData() → seedFakeStage1() 뒤. 두 번 실행해도 중복 없음 */
function seedFakeStage6() {
  var owner = assertOwnerRun_();
  return withLock_(function () {
    ['students', 'terms', 'enrollments'].forEach(function (t) { invalidate_('db', t); });
    var students = readAll_('students');
    if (!students.length || !students.every(function (s) { return /^가짜 데이터/.test(String(s.memo)); })) {
      throw new Error('가짜 학생(seedFakeData)만 있는 DB에서만 실행합니다. 실제 데이터가 있는 DB에는 쓰지 않습니다.');
    }
    var term = readAll_('terms').filter(function (t) { return t.name === '2027 1학기'; })[0];
    if (!term) throw new Error('seedFakeStage1()을 먼저 실행하세요(2027 1학기가 없습니다).');
    invalidate_('db', 'status_changes');
    if (!readAll_('status_changes').length) throw new Error('seedFakeStage1()을 먼저 실행하세요(학사 입실 상태가 없습니다).');
    ['career_profiles', 'course_plans', 'inquiry_records', 'feedback'].forEach(function (t) {
      try { readAll_(t); } catch (e) { throw new Error('6단계 탭이 없습니다. 편집기에서 setup()을 먼저 다시 실행하세요.'); }
    });
    try { readAll_('counsel_requests', 'counsel'); } catch (e) { throw new Error('상담 신청 탭이 없습니다. 편집기에서 setup()을 먼저 다시 실행하세요.'); }
    var byId = {};
    students.forEach(function (s) { byId[s.id] = s; });
    var ordered = readAll_('enrollments').filter(function (e) { return e.term_id === term.id && byId[e.student_id]; })
      .map(function (e) { return { student: byId[e.student_id], enrollment: e }; })
      .sort(function (a, b) { return String(a.student.student_no).localeCompare(String(b.student.student_no)); });
    var data = buildFakeStage6_(term, ordered);
    var lines = [];
    if (!String(term.career_due || '').trim()) {
      updateRecord_('terms', term.id, data.termPatch, owner);
      lines.push('terms.career_due ' + data.termPatch.career_due);
    }
    [['career_profiles', data.profiles], ['course_plans', data.plans], ['inquiry_records', data.inquiries], ['feedback', data.feedback]].forEach(function (pair) {
      invalidate_('db', pair[0]);
      var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
      bulkAppend_(pair[0], fresh, owner);
      lines.push(pair[0] + ' +' + fresh.length);
    });
    [['counsel_requests', data.requests], ['counsel_notes', data.notes]].forEach(function (pair) {
      invalidate_('counsel', pair[0]);
      var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0], 'counsel'));
      fresh.forEach(function (r) { appendRecord_(pair[0], r, owner, 'counsel'); });
      lines.push(pair[0] + ' +' + fresh.length);
    });
    return '가짜 6단계 데이터: ' + lines.join(', ');
  });
}
