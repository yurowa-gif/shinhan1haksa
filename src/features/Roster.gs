/**
 * F0 명단 업로드 — C3. PRD 10.2, docs/decisions.md 26~29.
 * 붙여넣은 글(TSV/CSV) → 표(rosterParseText_) → R2 규칙(parseRosterTable_·diffRoster_) → 미리보기 → 저장.
 *
 * 저장 규칙
 *  - 오류가 한 건이라도 있거나 모호(ambiguous) 줄이 있으면 아무것도 쓰지 않는다.
 *  - 저장은 락 안에서 다시 파싱·비교한다(화면이 보낸 값을 믿지 않는다). 미리보기 때 숫자와 달라졌으면 거부한다.
 *  - 상태는 그 항목 기록이 없을 때만 초기값으로 만든다(R2). 이미 있고 명단과 다르면 경고만 — 학기 중 변경은 F6·F7.
 *  - 퇴실 후보는 표시만 한다(자동 퇴실 없음).
 *  - 학생·학부모 로그인용 users 행을 만든다: 새 계정은 student/parent 역할, 이미 있는 계정은 역할만 더한다.
 *  - 쓰는 순서: 학생 → 등록 → 상태 변경 → 계정. 중간에 멈춰도 다시 올리면 남은 것만 쓰인다(멱등).
 *  - 명단 내용은 audit_log에 남기지 않는다(일괄 1줄 + 행 수).
 *
 * 순수 함수(rosterParseText_·rosterPlan_·rosterGuardianPlan_ …)는 tests/features/roster*.test.js가 검사한다.
 * ASSUMPTION: 상태 적용일 기본값 = max(오늘, 기간 시작일), 화면에서 고칠 수 있다(결정 27).
 * ASSUMPTION: 학부모 계정 이름은 "학부모(자녀 이름)"(결정 29).
 */

var ROSTER_MAX_CHARS = 300000;
var ROSTER_MAX_ROWS = 2000;
var ROSTER_COUNT_KEYS = ['newStudents', 'updatedStudents', 'newEnrollments', 'updatedEnrollments', 'newChanges',
  'leaving', 'ambiguous', 'newUsers', 'updatedUsers'];
var ROSTER_FIELD_LABELS = { student_no: '학번', name: '이름', gender: '성별', grade: '학년', class_no: '반',
  number: '번호', track: '계열', email: '학생 계정', teacher_email: '담당교사', veritas: '베리타스',
  commute_type: '통학구분', memo: '비고' };

/**
 * 붙여넣은 글 → 2차원 배열. 구분은 첫 줄에 탭이 있으면 탭(시트에서 복사), 아니면 쉼표(CSV).
 * 큰따옴표로 감싼 칸 안의 구분 문자·줄바꿈·""(따옴표 하나)를 처리한다. 맨 앞 BOM·끝의 빈 줄은 버린다.
 * @return {{delimiter:string, rows:string[][], errors:{line:number,message:string}[]}}
 */
function rosterParseText_(text) {
  var src = String(text == null ? '' : text).replace(/^﻿/, '');
  var errors = [];
  if (src.length > ROSTER_MAX_CHARS) {
    return { delimiter: '', rows: [], errors: [{ line: 0, column: '', message: '내용이 너무 깁니다. 명단을 나누어 올려 주세요.' }] };
  }
  var firstLine = src.split(/\r\n|\n|\r/)[0] || '';
  var delim = firstLine.indexOf('\t') >= 0 ? '\t' : ',';
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  var quoteLine = 0;
  var line = 1;
  var atFieldStart = true;
  for (var i = 0; i < src.length; i++) {
    var ch = src.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) { inQuotes = true; quoteLine = line; atFieldStart = false; continue; }
    if (ch === delim) { row.push(field); field = ''; atFieldStart = true; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src.charAt(i + 1) === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; atFieldStart = true; line++;
      continue;
    }
    field += ch;
    atFieldStart = false;
  }
  if (inQuotes) {
    errors.push({ line: quoteLine, column: '', message: '큰따옴표가 닫히지 않았습니다. 이 줄의 따옴표를 확인해 주세요.' });
  } else if (field !== '' || row.length) {
    row.push(field); rows.push(row);
  }
  rows = rows.map(function (r) { return r.map(function (c) { return String(c).trim(); }); });
  while (rows.length && rows[rows.length - 1].every(function (c) { return c === ''; })) rows.pop();
  if (rows.length > ROSTER_MAX_ROWS) {
    errors.push({ line: 0, column: '', message: '줄이 ' + ROSTER_MAX_ROWS + '개를 넘습니다. 명단을 나누어 올려 주세요.' });
  }
  return { delimiter: delim === '\t' ? 'tab' : 'comma', rows: rows, errors: errors };
}

/** 상태 적용일 기본값: 오늘이 기간 시작일 이후면 오늘, 아니면 기간 시작일(결정 27) */
function rosterDefaultYmd_(term, today) {
  return today > term.start_date ? today : term.start_date;
}

/**
 * 올리는 기간·적용일 정하기. 기간이 없거나 날짜 형식이 틀리면 문구를 돌려준다.
 * @return {{term:Object, ymd:string}|{error:string}}
 */
function rosterResolveOpts_(opts, terms, today) {
  opts = opts || {};
  var term = (terms || []).filter(function (t) { return t.id === String(opts.termId || ''); })[0];
  if (!term) return { error: '올릴 운영 기간을 골라 주세요.' };
  var ymd = String(opts.ymd || '').trim() || rosterDefaultYmd_(term, today);
  if (!ymdIsValid_(ymd)) return { error: '상태 적용일을 날짜(yyyy-MM-dd)로 골라 주세요.' };
  return { term: term, ymd: ymd };
}

/** 이메일 일부 가림(미리보기·오류 문구용): ab***@도메인 */
function rosterMask_(email) {
  var p = String(email || '').split('@');
  return (p[0] || '').slice(0, 2) + '***@' + (p[1] || '');
}

/**
 * 로그인 계정 만들기·역할 더하기 계획(순수). roleCode 'student'|'parent', people [{email, name, line}].
 * 다른 종류의 역할이 섞이면 만들지 않고 그 줄을 오류로 돌려준다(결정: 개인정보 — 학생·학부모·교사 범위가 조용히 겹치지 않게):
 *  - 기존 계정이 roleCode 말고 다른 역할(학생↔학부모, 교사·관리자 등)을 이미 가졌으면 오류.
 *  - 학생으로 올리는 이메일이 학부모 연결(guardian_links)에 있거나, 학부모로 올리는 이메일이 학생(students.email)이면 오류.
 * ctx = {students, guardianLinks}
 * @return {{create:Object[], update:{id,patch}[], errors:Object[], warnings:string[], changes:{email:string, before:string, add:string}[]}}
 */
function rosterUserPlan_(people, users, roleCode, memo, ctx) {
  ctx = ctx || {};
  var label = { student: '학생', parent: '학부모' };
  var byEmail = {};
  (users || []).forEach(function (u) { byEmail[normalizeEmail_(u.email)] = u; });
  var studentEmails = {}, parentEmails = {};
  (ctx.students || []).forEach(function (s) { var e = normalizeEmail_(s.email); if (e) studentEmails[e] = true; });
  (ctx.guardianLinks || []).forEach(function (g) { var e = normalizeEmail_(g.parent_email); if (e) parentEmails[e] = true; });
  var column = roleCode === 'student' ? '학생구글계정' : '학부모구글계정';
  var out = { create: [], update: [], errors: [], warnings: [], changes: [] };
  var seen = {};
  (people || []).forEach(function (p) {
    var email = normalizeEmail_(p.email);
    if (!email || seen[email]) return;
    seen[email] = true;
    var fail = function (why) {
      out.errors.push({ line: p.line || 0, column: column, message: '계정 ' + rosterMask_(email) + '은(는) ' + why +
        ' ' + label[roleCode] + ' 계정으로 올릴 수 없습니다. 이메일이 맞는지 확인해 주세요.' });
    };
    if (roleCode === 'student' && parentEmails[email]) { fail('이미 학부모 연결에 쓰이는 계정이라'); return; }
    if (roleCode === 'parent' && studentEmails[email]) { fail('이미 학생 계정이라'); return; }
    var u = byEmail[email];
    if (!u) {
      out.create.push({ email: email, name: p.name, roles: roleCode, homeroom_class: '', active: 'TRUE', memo: memo });
      return;
    }
    var roles = parseRoles_(u.roles);
    var other = roles.filter(function (r) { return r !== roleCode; });
    if (other.length) {
      fail('이미 ' + other.map(function (r) { return ROLE_LABELS[r] || r; }).join('·') + ' 역할을 가진 계정이라');
      return;
    }
    if (!isTruthy_(u.active)) out.warnings.push('계정 ' + rosterMask_(email) + '이(가) 비활성 상태입니다. 사용자 목록에서 활성으로 바꾸어 주세요.');
    if (roles.indexOf(roleCode) < 0) {
      out.update.push({ id: u.id, patch: { roles: roleCode } });
      out.changes.push({ email: rosterMask_(email), before: roles.length ? roles.map(function (r) { return ROLE_LABELS[r] || r; }).join('·') : '(역할 없음)', add: label[roleCode] });
    }
  });
  return out;
}

/**
 * 학생 명단 전체 계획(순수). 아무것도 쓰지 않는다.
 * ctx = {terms, today, existing:{students, enrollments, changes, users}}
 * @return {{ok:boolean, errors:Array, warnings:string[], ambiguous:Array, term?:Object, ymd?:string,
 *           counts?:Object, lists?:Object, diff?:Object, userPlan?:Object}}
 */
function rosterPlan_(text, opts, ctx) {
  var fail = function (errors, warnings) { return { ok: false, errors: errors, warnings: warnings || [], ambiguous: [] }; };
  var r = rosterResolveOpts_(opts, ctx.terms, ctx.today);
  if (r.error) return fail([{ line: 0, column: '', message: r.error }]);
  var parsed = rosterParseText_(text);
  if (parsed.errors.length) return fail(parsed.errors);
  var table = parseRosterTable_(parsed.rows);
  if (table.errors.length) return fail(table.errors, table.warnings);
  var diff = diffRoster_(table.records, ctx.existing, r.term.id, r.ymd);
  var userPlan = rosterUserPlan_(table.records.map(function (x) { return { email: x.email, name: x.name, line: x.line }; }),
    ctx.existing.users, 'student', '명단 업로드', { students: ctx.existing.students, guardianLinks: ctx.existing.guardianLinks });
  if (userPlan.errors.length) return fail(userPlan.errors, diff.warnings.concat(table.warnings));
  var counts = {
    newStudents: diff.createStudents.length, updatedStudents: diff.updateStudents.length,
    newEnrollments: diff.createEnrollments.length, updatedEnrollments: diff.updateEnrollments.length,
    newChanges: diff.createChanges.length, leaving: diff.leavingCandidates.length, ambiguous: diff.ambiguous.length,
    newUsers: userPlan.create.length, updatedUsers: userPlan.update.length
  };
  var nameOf = {};
  (ctx.existing.students || []).forEach(function (s) { nameOf[s.id] = s; });
  var lists = {
    newStudents: diff.createStudents.map(function (s) { return { student_no: s.student_no, name: s.name }; }),
    updatedStudents: diff.updateStudents.map(function (u) {
      var s = nameOf[u.id] || {};
      return { student_no: s.student_no || '', name: s.name || '',
        fields: Object.keys(u.patch).map(function (k) { return ROSTER_FIELD_LABELS[k] || k; }) };
    }),
    leaving: diff.leavingCandidates.map(function (c) { return { student_no: c.student_no, name: c.name }; }),
    ambiguous: diff.ambiguous.map(function (a) { return { line: a.line, student_no: a.student_no, name: a.name, reason: a.reason }; }),
    roleChanges: userPlan.changes
  };
  return {
    ok: true, errors: [], warnings: diff.warnings.concat(table.warnings, userPlan.warnings), ambiguous: diff.ambiguous,
    term: r.term, ymd: r.ymd, counts: counts, lists: lists, diff: diff, userPlan: userPlan,
    blocked: diff.ambiguous.length > 0,
    nothingToDo: ROSTER_COUNT_KEYS.every(function (k) { return k === 'leaving' || k === 'ambiguous' || counts[k] === 0; })
  };
}

/** 화면에 내보내는 모양: diff·계정 계획 같은 내부 값(이메일 등)은 뺀다 */
function rosterPreviewView_(plan) {
  if (!plan.ok) return { ok: false, errors: plan.errors.slice(0, 50), errorCount: plan.errors.length, warnings: plan.warnings.slice(0, 50) };
  return {
    ok: true, blocked: plan.blocked, nothingToDo: plan.nothingToDo, term: { id: plan.term.id, name: plan.term.name },
    ymd: plan.ymd, counts: plan.counts, lists: plan.lists, warnings: plan.warnings.slice(0, 50), warningCount: plan.warnings.length
  };
}

/** createEnrollments·createChanges의 'new:학번' 참조를 새 id로 바꾼다(순수) */
function rosterApplyRefs_(rows, idByRef) {
  return rows.map(function (r) {
    var out = {};
    Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    if (out.student_id && Object.prototype.hasOwnProperty.call(idByRef, out.student_id)) out.student_id = idByRef[out.student_id];
    return out;
  });
}

/** 저장할 때 학생 행으로 쓸 값(ref는 id로 바꿔 넣는다) */
function rosterStudentRow_(c, id) {
  return { id: id, student_no: c.student_no, name: c.name, gender: c.gender, grade: c.grade, class_no: c.class_no,
    number: c.number, track: c.track, email: c.email, memo: c.memo || '' };
}

/**
 * 학부모 연결 계획(순수). ctx = {students, enrollments, guardianLinks, users, terms, today}
 * 연결 대상은 **이 기간에 등록된 학생**뿐이다(학번은 학년도마다 다시 쓰이므로, 옛 학번을 가진 퇴실·졸업생에게 붙지 않게).
 * 이미 연결된 줄도 계정 계획에는 넣는다(연결은 썼는데 계정 쓰기에서 멈췄을 때 다시 올리면 계정이 만들어지도록).
 */
function rosterGuardianPlan_(text, opts, ctx) {
  var fail = function (errors) { return { ok: false, errors: errors, warnings: [] }; };
  var r = rosterResolveOpts_(opts, ctx.terms, ctx.today);
  if (r.error) return fail([{ line: 0, column: '', message: r.error }]);
  var parsed = rosterParseText_(text);
  if (parsed.errors.length) return fail(parsed.errors);
  var table = parseGuardianTable_(parsed.rows);
  if (table.errors.length) return fail(table.errors);
  var enrolled = {};
  (ctx.enrollments || []).forEach(function (e) { if (e.term_id === r.term.id) enrolled[e.student_id] = true; });
  var byNo = {};
  (ctx.students || []).forEach(function (s) { (byNo[s.student_no] = byNo[s.student_no] || []).push(s); });
  var haveLink = {};
  (ctx.guardianLinks || []).forEach(function (g) { haveLink[normalizeEmail_(g.parent_email) + '|' + g.student_id] = true; });

  var errors = [], create = [], skipped = 0, people = [], seenPerson = {}, links = [];
  table.records.forEach(function (rec) {
    var cands = (byNo[rec.student_no] || []).filter(function (s) { return enrolled[s.id]; });
    if (cands.length !== 1) {
      errors.push({ line: rec.line, column: '학번', message: cands.length
        ? '이 기간 학사생 중 학번 ' + rec.student_no + ' 학생이 여럿입니다. 학번을 확인해 주세요.'
        : '이 기간 학사생 중 학번 ' + rec.student_no + ' 학생이 없습니다. 학생 명단을 먼저 올렸는지, 학번이 맞는지 확인해 주세요.' });
      return;
    }
    var st = cands[0];
    var key = rec.parent_email + '|' + st.id;
    var isNew = !haveLink[key];
    links.push({ line: rec.line, student_no: st.student_no, name: st.name, parent: rosterMask_(rec.parent_email), isNew: isNew });
    if (isNew) { haveLink[key] = true; create.push({ parent_email: rec.parent_email, student_id: st.id, relation: rec.relation, memo: '' }); } else { skipped++; }
    if (!seenPerson[rec.parent_email]) {
      seenPerson[rec.parent_email] = true;
      people.push({ email: rec.parent_email, name: '학부모(' + st.name + ')', line: rec.line });
    }
  });
  if (errors.length) return fail(errors);
  var userPlan = rosterUserPlan_(people, ctx.users, 'parent', '명단 업로드', { students: ctx.students, guardianLinks: ctx.guardianLinks });
  if (userPlan.errors.length) return fail(userPlan.errors);
  return {
    ok: true, errors: [], warnings: userPlan.warnings, term: r.term, createLinks: create, skipped: skipped, userPlan: userPlan, links: links,
    counts: { newLinks: create.length, skipped: skipped, newUsers: userPlan.create.length, updatedUsers: userPlan.update.length },
    nothingToDo: !create.length && !userPlan.create.length && !userPlan.update.length
  };
}

/* ───────────── 읽기·쓰기 도우미 ───────────── */

function rosterLoadExisting_() {
  return { students: readAll_('students'), enrollments: readAll_('enrollments'),
    changes: readAll_('status_changes'), users: readAll_('users'), guardianLinks: readAll_('guardian_links') };
}

function rosterFreshMemo_() {
  ['students', 'enrollments', 'status_changes', 'users', 'guardian_links', 'terms'].forEach(function (n) { invalidate_('db', n); });
}

function rosterCountsEqual_(a, b) {
  return Object.keys(a || {}).length === Object.keys(b || {}).length &&
    Object.keys(a || {}).every(function (k) { return a[k] === (b || {})[k]; });
}

/**
 * 저장 요청이 미리보기와 같은 것에 대한 것인지: 개수와 (학생 명단이면) 기간·적용일이 모두 같아야 한다.
 * expect = {counts, termId, ymd}(미리보기 응답에서 가져온 값). 없거나 다르면 false.
 */
function rosterExpectOk_(expect, counts, termId, ymd) {
  if (!expect || !rosterCountsEqual_(counts, expect.counts)) return false;
  if (expect.termId !== termId) return false;
  return ymd === undefined || expect.ymd === ymd;
}

/* ───────────── 화면에서 부르는 서버 함수 (모두 관리자만) ───────────── */

/** 화면 시작에 필요한 값: 운영 기간 목록, 기본 기간, 기본 적용일 */
function getRosterContext() {
  requirePermission_('roster.edit');
  var today = today_();
  var terms = readAll_('terms').sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });
  var current = getCurrentTerm_();
  return {
    today: today, defaultTermId: current ? current.id : (terms.length ? terms[terms.length - 1].id : ''),
    terms: terms.map(function (t) {
      return { id: t.id, name: t.name, type: t.type, start_date: t.start_date, end_date: t.end_date, defaultYmd: rosterDefaultYmd_(t, today) };
    })
  };
}

/** 학생 명단 미리보기. 아무것도 저장하지 않는다. opts = {termId, ymd}. 응답의 counts·term.id·ymd가 저장 때 expect로 돌아온다. */
function previewRoster(text, opts) {
  requirePermission_('roster.edit');
  return rosterPreviewView_(rosterPlan_(text, opts, { terms: readAll_('terms'), today: today_(), existing: rosterLoadExisting_() }));
}

/**
 * 학생 명단 저장. expect = {counts, termId, ymd}(미리보기 응답 값). 락 안에서 다시 계산해 다르면 거부한다.
 */
function commitRoster(text, opts, expect) {
  var user = requirePermission_('roster.edit');
  return withLock_(function () {
    rosterFreshMemo_();
    var plan = rosterPlan_(text, opts, { terms: readAll_('terms'), today: today_(), existing: rosterLoadExisting_() });
    if (!plan.ok) return rosterPreviewView_(plan);
    if (plan.blocked) return { ok: false, errors: [{ line: 0, column: '', message: '같은 사람인지 알 수 없는 줄이 있어 저장하지 않았습니다. 미리보기의 "확인이 필요한 줄"을 고친 뒤 다시 올려 주세요.' }] };
    if (!rosterExpectOk_(expect, plan.counts, plan.term.id, plan.ymd)) {
      return { ok: false, stale: true, errors: [{ line: 0, column: '', message: '미리보기 이후 입력이나 데이터가 바뀌었습니다. [확인]을 다시 눌러 결과를 보고 저장해 주세요.' }] };
    }
    if (plan.nothingToDo) return { ok: true, nothingToDo: true, counts: plan.counts };
    var d = plan.diff;
    var email = user.email;
    var idByRef = {};
    var newRows = d.createStudents.map(function (c) {
      var id = Utilities.getUuid();
      idByRef[c.ref] = id;
      return rosterStudentRow_(c, id);
    });
    bulkAppend_('students', newRows, email);
    bulkUpdateRecords_('students', d.updateStudents, email);
    bulkAppend_('enrollments', rosterApplyRefs_(d.createEnrollments, idByRef), email);
    bulkUpdateRecords_('enrollments', d.updateEnrollments, email);
    var now = nowIso_();
    bulkAppend_('status_changes', rosterApplyRefs_(d.createChanges, idByRef).map(function (c) {
      c.requested_at = c.requested_at || now;
      return c;
    }), email);
    bulkAppend_('users', plan.userPlan.create, email);
    bulkUpdateRecords_('users', plan.userPlan.update, email);
    return { ok: true, counts: plan.counts };
  });
}

/** 학부모 연결 미리보기. opts = {termId}(같은 학번이 여럿일 때 이 기간 등록 학생을 고른다) */
function previewGuardians(text, opts) {
  requirePermission_('roster.edit');
  var plan = rosterGuardianPlan_(text, opts, rosterGuardianCtx_());
  if (!plan.ok) return { ok: false, errors: plan.errors.slice(0, 50), errorCount: plan.errors.length, warnings: [] };
  return { ok: true, nothingToDo: plan.nothingToDo, counts: plan.counts, termId: plan.term.id, warnings: plan.warnings.slice(0, 50),
    links: plan.links.slice(0, 200), linkCount: plan.links.length, roleChanges: plan.userPlan.changes.slice(0, 50) };
}

function commitGuardians(text, opts, expect) {
  var user = requirePermission_('roster.edit');
  return withLock_(function () {
    rosterFreshMemo_();
    var plan = rosterGuardianPlan_(text, opts, rosterGuardianCtx_());
    if (!plan.ok) return { ok: false, errors: plan.errors.slice(0, 50), errorCount: plan.errors.length, warnings: [] };
    if (!rosterExpectOk_(expect, plan.counts, plan.term.id)) {
      return { ok: false, stale: true, errors: [{ line: 0, column: '', message: '미리보기 이후 입력이나 데이터가 바뀌었습니다. [확인]을 다시 눌러 결과를 보고 저장해 주세요.' }] };
    }
    if (plan.nothingToDo) return { ok: true, nothingToDo: true, counts: plan.counts };
    bulkAppend_('guardian_links', plan.createLinks, user.email);
    bulkAppend_('users', plan.userPlan.create, user.email);
    bulkUpdateRecords_('users', plan.userPlan.update, user.email);
    return { ok: true, counts: plan.counts };
  });
}

function rosterGuardianCtx_() {
  return { students: readAll_('students'), enrollments: readAll_('enrollments'), guardianLinks: readAll_('guardian_links'),
    users: readAll_('users'), terms: readAll_('terms'), today: today_() };
}
