/**
 * C29 연락처(전화·보호자 이름, 결정 76, 접두어 contact). 보이는 사람: 그 학생의 담당교사·관리자·그날 근무교사(contact.view 서버 판정).
 * - 값은 readContacts_로만 읽는다(readAll_는 연락처 열을 지운다). 응답·출력물·메일·감사 기록 상세에는 한 학생씩 contact.view를 통과한 응답 말고는 나가지 않는다.
 * - getContactList: 내가 연락처를 볼 수 있는 학생 목록(번호는 없음). getStudentContact: 한 학생의 번호(보호자 이메일은 주지 않는다).
 * - previewContacts·commitContacts: 연락처 올리기(관리자, roster.edit). 미리보기·오류 문구에 번호를 되풀이하지 않는다. 쓰기는 bulkUpdateRecords_(감사에는 '(연락처 생략)'만).
 * 표 열: 학번 · 학생전화 · 학부모구글계정 · 보호자이름 · 보호자전화. 빈 칸은 "바꾸지 않음". 보호자 줄은 학부모 연결(guardian_links)이 먼저 있어야 한다.
 */
var CONTACT_COLUMNS = ['학번', '학생전화', '학부모구글계정', '보호자이름', '보호자전화'];
var CONTACT_NAME_MAX = 30;

/**
 * 전화번호 → '010-1234-5678' 모양(숫자만 모아 맞춘다). 못 읽으면 ''.
 * 엑셀·시트가 앞의 0을 떼어 10자리가 된 휴대전화(10-…)와 +82 표기도 받는다.
 */
function contactPhoneNorm_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '';
  if (/[^0-9\s\-.()+]/.test(s)) return '';
  var d = s.replace(/[^0-9+]/g, '');
  if (d.indexOf('+') > 0 || (d.indexOf('+') === 0 && d.slice(0, 3) !== '+82')) return '';
  if (d.indexOf('+82') === 0) d = '0' + d.slice(3);
  d = d.replace(/\+/g, '');
  if (d.length === 10 && d.charAt(0) === '1') d = '0' + d;   // 앞의 0이 떨어진 휴대전화
  if (!/^0\d{8,10}$/.test(d) || (d.length === 10 && d.indexOf('010') === 0)) return '';   // 010은 11자리뿐
  if (d.indexOf('02') === 0) {
    if (d.length === 9) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
    if (d.length === 10) return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6);
    return '';
  }
  if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  return '';
}

/* ───────────── 보기 ───────────── */

/** 내가 연락처를 볼 수 있는 학생 id 집합(이번 기간 학사생): 관리자·오늘 근무교사는 전체, 학사 교사는 담당 학생 */
function contactVisibleIds_(user, term) {
  var enr = readAll_('enrollments').filter(function (e) { return term && e.term_id === term.id; });
  var all = hasRole_(user, 'admin') || (hasRole_(user, 'hall_teacher') && isOnDutyFor_(user.email, '', 0));
  var ids = {};
  enr.forEach(function (e) {
    if (all || (hasRole_(user, 'hall_teacher') && normalizeEmail_(e.teacher_email) === user.email)) ids[e.student_id] = true;
  });
  return ids;
}

/** 연락처를 볼 수 있는 학생 목록(번호 없음). 학생 한 명의 번호는 getStudentContact로 */
function getContactList() {
  var user = requirePermission_('contact.list');
  var term = getCurrentTerm_();
  var ids = contactVisibleIds_(user, term);
  var have = {};
  readContacts_('students').forEach(function (s) { if (s.phone) have[s.id] = true; });
  readContacts_('guardian_links').forEach(function (g) { if (g.phone) have[g.student_id] = true; });
  var students = readAll_('students').filter(function (s) { return ids[s.id]; })
    .sort(function (a, b) { return String(a.student_no).localeCompare(String(b.student_no)); })
    .map(function (s) { return { id: s.id, student_no: s.student_no, name: s.name, grade: s.grade, class_no: s.class_no, number: s.number, display: s.student_no + ' ' + s.name, hasContact: !!have[s.id] }; });
  return { term: term ? term.name : '', students: students };
}

/** 한 학생의 학생 전화·보호자 이름과 전화(보호자 이메일은 주지 않는다). 담당교사·관리자·그날 근무교사만 */
function getStudentContact(studentId) {
  requirePermission_('contact.view', { studentId: studentId });
  var s = readContacts_('students').filter(function (r) { return r.id === studentId; })[0];
  var guardians = readContacts_('guardian_links').filter(function (g) { return g.student_id === studentId; })
    .map(function (g) { return { relation: g.relation || '', name: g.name || '', phone: g.phone || '' }; });
  return { id: studentId, name: s ? s.name : '', phone: s ? s.phone || '' : '', guardians: guardians };
}

/* ───────────── 올리기(관리자) ───────────── */

/**
 * 연락처 표 → 저장 계획(쓰지 않는다). 번호는 응답에 담지 않는다.
 * @return {{ok, errors:[{line,column,message}], warnings, counts:{students, guardians, same, skipped}, termId, studentPatches:[{id,patch}], guardianPatches:[{id,patch}], lists}}
 */
function contactPlan_(text, opts, ctx) {
  var fail = function (errors) { return { ok: false, errors: errors.slice(0, 50), errorCount: errors.length, warnings: [] }; };
  var r = rosterResolveOpts_(opts, ctx.terms, ctx.today);
  if (r.error) return fail([{ line: 0, column: '', message: r.error }]);
  var parsed = rosterParseText_(text);
  if (parsed.errors.length) return fail(parsed.errors);
  var rows = parsed.rows;
  if (!rows.length || rosterBlankRow_(rows[0])) return fail([{ line: 1, column: '', message: '머리글 줄이 없습니다. 양식의 첫 줄을 함께 붙여 넣어 주세요.' }]);
  var herr = [];
  if (!rosterCheckHeader_(rows[0], CONTACT_COLUMNS, herr)) return fail(herr);
  var enrolled = {};
  (ctx.enrollments || []).forEach(function (e) { if (e.term_id === r.term.id) enrolled[e.student_id] = true; });
  var byNo = {};
  (ctx.students || []).forEach(function (s) { if (enrolled[s.id]) (byNo[s.student_no] = byNo[s.student_no] || []).push(s); });
  var linkOf = {};
  (ctx.guardianLinks || []).forEach(function (g) { linkOf[normalizeEmail_(g.parent_email) + '|' + g.student_id] = g; });
  var errors = [], stuWant = {}, guardWant = {}, seenLink = {}, names = {};
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (rosterBlankRow_(row)) continue;
    var line = i + 1, no = rosterStr_(row[0]);
    if (row.length > 5 && row.slice(5).some(function (c) { return rosterStr_(c) !== ''; })) errors.push({ line: line, column: '', message: '열이 5개보다 많습니다. 칸이 밀렸는지 확인해 주세요.' });
    var cands = /^\d{5}$/.test(no) ? (byNo[no] || []) : [];
    if (!/^\d{5}$/.test(no)) { errors.push({ line: line, column: '학번', message: '학번은 숫자 5자리여야 합니다.' }); continue; }
    if (cands.length !== 1) { errors.push({ line: line, column: '학번', message: cands.length ? '이 기간 학사생 중 이 학번 학생이 여럿입니다.' : '이 기간 학사생 중 학번 ' + no + ' 학생이 없습니다. 학생 명단을 먼저 올렸는지 확인해 주세요.' }); continue; }
    var st = cands[0];
    names[st.id] = st.student_no + ' ' + st.name;
    var sp = rosterStr_(row[1]), pe = rosterStr_(row[2]).toLowerCase(), gn = rosterStr_(row[3]), gp = rosterStr_(row[4]);
    if (sp) {
      var n = contactPhoneNorm_(sp);
      if (!n) errors.push({ line: line, column: '학생전화', message: '전화번호 형식이 아닙니다(예: 010-1234-5678).' });
      else if (stuWant[st.id] !== undefined && stuWant[st.id] !== n) errors.push({ line: line, column: '학생전화', message: '같은 학생의 학생전화가 줄마다 다릅니다.' });
      else stuWant[st.id] = n;
    }
    if (!pe) {
      if (gn || gp) errors.push({ line: line, column: '학부모구글계정', message: '보호자 이름·전화를 넣으려면 학부모 구글 계정도 적어 주세요.' });
      continue;
    }
    if (!rosterEmailOk_(pe)) { errors.push({ line: line, column: '학부모구글계정', message: '이메일 형식이 아닙니다.' }); continue; }
    var link = linkOf[pe + '|' + st.id];
    if (!link) { errors.push({ line: line, column: '학부모구글계정', message: '이 학생에게 연결된 학부모 계정이 아닙니다. 학부모 연결을 먼저 올려 주세요.' }); continue; }
    if (seenLink[link.id]) { errors.push({ line: line, column: '학부모구글계정', message: seenLink[link.id] + '줄과 같은 학생·학부모입니다.' }); continue; }
    seenLink[link.id] = line;
    var want = {};
    if (gn) { if (gn.length > CONTACT_NAME_MAX) errors.push({ line: line, column: '보호자이름', message: '보호자 이름은 ' + CONTACT_NAME_MAX + '자 안으로 적어 주세요.' }); else want.name = gn; }
    if (gp) { var m = contactPhoneNorm_(gp); if (!m) errors.push({ line: line, column: '보호자전화', message: '전화번호 형식이 아닙니다(예: 010-1234-5678).' }); else want.phone = m; }
    guardWant[link.id] = want;
  }
  if (errors.length) return fail(errors);
  var studentPatches = [], guardianPatches = [], same = 0, stuNames = [], guardNames = [];
  var rawStu = {}, rawGuard = {};
  (ctx.rawStudents || []).forEach(function (s) { rawStu[s.id] = s; });
  (ctx.rawGuardians || []).forEach(function (g) { rawGuard[g.id] = g; });
  Object.keys(stuWant).forEach(function (id) {
    if (String((rawStu[id] || {}).phone || '') === stuWant[id]) { same++; return; }
    studentPatches.push({ id: id, patch: { phone: stuWant[id] } }); stuNames.push(names[id]);
  });
  Object.keys(guardWant).forEach(function (id) {
    var cur = rawGuard[id] || {}, patch = {};
    ['name', 'phone'].forEach(function (k) { if (guardWant[id][k] !== undefined && String(cur[k] || '') !== guardWant[id][k]) patch[k] = guardWant[id][k]; });
    if (!Object.keys(patch).length) { if (Object.keys(guardWant[id]).length) same++; return; }
    guardianPatches.push({ id: id, patch: patch }); guardNames.push(names[cur.student_id] || '');
  });
  return {
    ok: true, errors: [], warnings: [], termId: r.term.id, studentPatches: studentPatches, guardianPatches: guardianPatches,
    counts: { students: studentPatches.length, guardians: guardianPatches.length, same: same },
    nothingToDo: !studentPatches.length && !guardianPatches.length,
    lists: { students: stuNames.slice(0, 200), guardians: guardNames.filter(Boolean).slice(0, 200) }
  };
}

function contactCtx_() {
  return { terms: readAll_('terms'), today: today_(), students: readAll_('students'), enrollments: readAll_('enrollments'),
    guardianLinks: readAll_('guardian_links'), rawStudents: readContacts_('students'), rawGuardians: readContacts_('guardian_links') };
}

function contactView_(p) {
  if (!p.ok) return { ok: false, errors: p.errors, errorCount: p.errorCount, warnings: [] };
  return { ok: true, nothingToDo: p.nothingToDo, termId: p.termId, counts: p.counts, lists: p.lists, warnings: p.warnings };
}

/** 연락처 올리기 미리보기. 아무것도 저장하지 않는다. opts = {termId}. 번호는 응답에 없다 */
function previewContacts(text, opts) {
  requirePermission_('roster.edit');
  return contactView_(contactPlan_(text, opts, contactCtx_()));
}

/** 연락처 저장. expect = {counts, termId}(미리보기 응답 값). 락 안에서 다시 계산해 다르면 {stale:true} */
function commitContacts(text, opts, expect) {
  var user = requirePermission_('roster.edit');
  return withLock_(function () {
    rosterFreshMemo_();
    var plan = contactPlan_(text, opts, contactCtx_());
    if (!plan.ok) return contactView_(plan);
    if (!rosterExpectOk_(expect, plan.counts, plan.termId)) {
      return { ok: false, stale: true, errors: [{ line: 0, column: '', message: '미리보기 이후 입력이나 데이터가 바뀌었습니다. [확인]을 다시 눌러 결과를 보고 저장해 주세요.' }] };
    }
    if (plan.nothingToDo) return { ok: true, nothingToDo: true, counts: plan.counts };
    bulkUpdateRecords_('students', plan.studentPatches, user.email);
    bulkUpdateRecords_('guardian_links', plan.guardianPatches, user.email);
    return { ok: true, counts: plan.counts };
  });
}
