/**
 * 명단 업로드 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD 10.2).
 *
 * 순수 함수만 둔다. StatusRules.gs의 statusOn_를 부른다.
 * 입력 rows는 붙여넣은 표를 칸으로 나눈 2차원 배열(첫 줄 = 머리글). TSV/CSV 나누기는 CODING(C3)이 한다.
 * 줄 번호(line)는 rows 안의 1부터 센 위치(머리글 = 1줄)라서 화면의 "몇째 줄"과 같다.
 */

/** 학생 명단 열 순서(PRD 10.2). */
function rosterColumns_() {
  return ['학번', '학년', '반', '번호', '이름', '성별', '계열', '학사', '기숙사', '베리타스', '조식', '석식',
    '통학구분', '담당교사이메일', '학생구글계정', '비고'];
}

/** 학부모 연결 열 순서(PRD 10.2). */
function rosterGuardianColumns_() {
  return ['학부모구글계정', '학번', '관계'];
}

function rosterStr_(v) {
  return String(v === undefined || v === null ? '' : v).replace(/^﻿/, '').trim();
}

function rosterEmailOk_(s) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);
}

/**
 * O/X 값 → true/false, 알 수 없으면 null. O·○·〇·◯·Ｏ·Y·YES·TRUE / X·×·Ｘ·✕·N·NO·FALSE(대소문자 무시).
 * 숫자 0·1은 받지 않는다(글자 O 대신 숫자 0을 잘못 친 것이 X로 읽히지 않게).
 */
function rosterOx_(v) {
  var s = rosterStr_(v).toUpperCase();
  if (['O', '○', '〇', '◯', 'Ｏ', 'Y', 'YES', 'TRUE'].indexOf(s) >= 0) return true;
  if (['X', '×', 'Ｘ', '✕', 'N', 'NO', 'FALSE'].indexOf(s) >= 0) return false;
  return null;
}

/** 빈 줄인지(모든 칸이 빈칸). */
function rosterBlankRow_(row) {
  return !row || row.every(function (c) { return rosterStr_(c) === ''; });
}

/** 머리글 검사. 문제가 있으면 errors에 넣고 false. */
function rosterCheckHeader_(row, want, errors) {
  var got = (row || []).map(rosterStr_);
  while (got.length > want.length && got[got.length - 1] === '') got.pop();
  var ok = true;
  for (var i = 0; i < Math.max(want.length, got.length); i++) {
    if (got[i] !== want[i]) {
      errors.push({ line: 1, column: want[i] || got[i], message: (i + 1) + '번째 열 머리글이 "' + (want[i] || '(없음)') +
        '"이어야 하는데 "' + (got[i] || '') + '"입니다. 양식의 열 순서를 그대로 써 주세요.' });
      ok = false;
    }
  }
  return ok;
}

/**
 * 학생 명단 표 → {records, errors:[{line,column,message}], warnings:[문자열]}.
 * record = {line, student_no, grade, class_no, number, name, gender, track,
 *           hall:'입실'|'퇴실', dorm:'입실'|'퇴실', veritas:'TRUE'|'FALSE', breakfast:'실시'|'미실시',
 *           dinner:'학사 석식'|'일반 석식'|'미실시', commute_type, teacher_email, email, end_type, memo}
 * 오류가 한 건이라도 있으면 저장하지 않는다(C3). 빈 줄은 건너뛴다.
 * - 학번 5자리, 학년 1~3, 반 1~20, 번호 1~99, 이름·성별(남·여) 필수, 계열 빈칸·문·이.
 * - 학사·기숙사·베리타스·조식은 O/X(rosterOx_). 석식은 학사·일반·미실시(또는 학사 석식·일반 석식·X).
 * - 통학구분 빈칸은 '일반'. 이메일은 소문자로. 학번·학생 계정 중복은 오류(두 줄 모두).
 * - 학번과 학년·반·번호가 다르면 경고(예: 20612 = 2학년 6반 12번).
 * ASSUMPTION: 양식에 종료 유형 열이 없어 end_type은 '23:50'(stage1 4절 h).
 * ASSUMPTION: 학생 구글 계정이 빈칸이면 경고만 한다(학년이 바뀔 때 학생을 잇는 열쇠라 채우기를 권함).
 */
function parseRosterTable_(rows) {
  var errors = [], warnings = [], records = [];
  var cols = rosterColumns_();
  rows = rows || [];
  if (!rows.length || rosterBlankRow_(rows[0])) {
    return { records: [], errors: [{ line: 1, column: '', message: '머리글 줄이 없습니다. 양식의 첫 줄을 함께 붙여 넣어 주세요.' }], warnings: [] };
  }
  if (!rosterCheckHeader_(rows[0], cols, errors)) return { records: [], errors: errors, warnings: [] };

  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (rosterBlankRow_(row)) continue;
    var line = r + 1;
    var cell = {};
    cols.forEach(function (c, i) { cell[c] = rosterStr_(row[i]); });
    var err = function (column, message) { errors.push({ line: line, column: column, message: message }); };
    if (row.length > cols.length && row.slice(cols.length).some(function (c) { return rosterStr_(c) !== ''; })) {
      err('', '열이 ' + cols.length + '개보다 많습니다. 칸이 밀렸는지 확인해 주세요.');
    }
    var intIn = function (column, lo, hi) {
      var s = cell[column];
      if (!/^\d+$/.test(s) || +s < lo || +s > hi) { err(column, column + '은(는) ' + lo + '~' + hi + ' 숫자여야 합니다: ' + s); return ''; }
      return String(+s);
    };
    var rec = { line: line };
    rec.student_no = cell['학번'];
    if (!/^\d{5}$/.test(rec.student_no)) err('학번', '학번은 숫자 5자리여야 합니다: ' + rec.student_no);
    rec.grade = intIn('학년', 1, 3);
    rec.class_no = intIn('반', 1, 20);
    rec.number = intIn('번호', 1, 99);
    rec.name = cell['이름'];
    if (!rec.name) err('이름', '이름이 비어 있습니다.');
    rec.gender = cell['성별'];
    if (rec.gender !== '남' && rec.gender !== '여') err('성별', '성별은 남 또는 여여야 합니다: ' + rec.gender);
    rec.track = cell['계열'];
    if (['', '문', '이'].indexOf(rec.track) < 0) err('계열', '계열은 빈칸·문·이 중 하나여야 합니다: ' + rec.track);

    var ox = function (column, yes, no) {
      var b = rosterOx_(cell[column]);
      if (b === null) { err(column, column + '은(는) O 또는 X여야 합니다: ' + cell[column]); return ''; }
      return b ? yes : no;
    };
    rec.hall = ox('학사', '입실', '퇴실');
    rec.dorm = ox('기숙사', '입실', '퇴실');
    rec.veritas = ox('베리타스', 'TRUE', 'FALSE');
    rec.breakfast = ox('조식', '실시', '미실시');
    var din = cell['석식'].replace(/\s+/g, '');
    rec.dinner = ({ '학사': '학사 석식', '학사석식': '학사 석식', '일반': '일반 석식', '일반석식': '일반 석식',
      '미실시': '미실시', 'X': '미실시', 'x': '미실시', '×': '미실시' })[din] || '';
    if (!rec.dinner) err('석식', '석식은 학사·일반·미실시 중 하나여야 합니다: ' + cell['석식']);
    rec.commute_type = cell['통학구분'] || '일반';
    if (['일반', '원거리(관내)', '원거리(관외)'].indexOf(rec.commute_type) < 0) {
      err('통학구분', '통학구분은 일반·원거리(관내)·원거리(관외) 중 하나여야 합니다: ' + rec.commute_type);
    }
    rec.teacher_email = cell['담당교사이메일'].toLowerCase();
    if (rec.teacher_email && !rosterEmailOk_(rec.teacher_email)) err('담당교사이메일', '이메일 형식이 아닙니다: ' + rec.teacher_email);
    rec.email = cell['학생구글계정'].toLowerCase();
    if (rec.email && !rosterEmailOk_(rec.email)) err('학생구글계정', '이메일 형식이 아닙니다: ' + rec.email);
    if (!rec.email) warnings.push(line + '줄: 학생 구글 계정이 비어 있습니다(학년이 바뀔 때 같은 학생을 잇는 데 씁니다).');
    if (!rec.teacher_email) warnings.push(line + '줄: 담당교사 이메일이 비어 있습니다.');
    rec.end_type = '23:50';
    rec.memo = cell['비고'];
    if (/^\d{5}$/.test(rec.student_no) && rec.grade && rec.class_no && rec.number &&
        rec.student_no !== rec.grade + ('0' + rec.class_no).slice(-2) + ('0' + rec.number).slice(-2)) {
      warnings.push(line + '줄: 학번 ' + rec.student_no + '이(가) 학년·반·번호(' + rec.grade + '-' + rec.class_no + '-' + rec.number + ')와 다릅니다.');
    }
    records.push(rec);
  }

  rosterDupErrors_(records, 'student_no', '학번', errors);
  rosterDupErrors_(records, 'email', '학생구글계정', errors);
  if (!records.length && !errors.length) errors.push({ line: 2, column: '', message: '학생 줄이 없습니다.' });
  errors.sort(function (a, b) { return a.line - b.line; });
  return { records: records, errors: errors, warnings: warnings };
}

/** 같은 값이 여러 줄에 있으면 그 줄마다 오류. 빈 값은 건너뛴다. */
function rosterDupErrors_(records, key, column, errors) {
  var lines = {};
  records.forEach(function (r) {
    var v = r[key];
    if (v) (lines[v] = lines[v] || []).push(r.line);
  });
  Object.keys(lines).forEach(function (v) {
    if (lines[v].length < 2) return;
    lines[v].forEach(function (ln) {
      errors.push({ line: ln, column: column, message: column + ' ' + v + '이(가) 여러 줄에 있습니다(' + lines[v].join('·') + '줄).' });
    });
  });
}

/**
 * 학부모 연결 표 → {records:[{line, parent_email, student_no, relation}], errors, warnings}.
 * 형제자매는 같은 학부모 계정이 여러 줄. 같은 (학부모, 학번) 줄이 두 번이면 오류.
 */
function parseGuardianTable_(rows) {
  var errors = [], records = [];
  rows = rows || [];
  if (!rows.length || rosterBlankRow_(rows[0])) {
    return { records: [], errors: [{ line: 1, column: '', message: '머리글 줄이 없습니다. 양식의 첫 줄을 함께 붙여 넣어 주세요.' }], warnings: [] };
  }
  if (!rosterCheckHeader_(rows[0], rosterGuardianColumns_(), errors)) return { records: [], errors: errors, warnings: [] };
  var seen = {};
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (rosterBlankRow_(row)) continue;
    var line = r + 1;
    var rec = { line: line, parent_email: rosterStr_(row[0]).toLowerCase(), student_no: rosterStr_(row[1]), relation: rosterStr_(row[2]) };
    if (row.length > 3 && row.slice(3).some(function (c) { return rosterStr_(c) !== ''; })) {
      errors.push({ line: line, column: '', message: '열이 3개보다 많습니다. 칸이 밀렸는지 확인해 주세요.' });
    }
    if (!rosterEmailOk_(rec.parent_email)) errors.push({ line: line, column: '학부모구글계정', message: '이메일 형식이 아닙니다: ' + rec.parent_email });
    if (!/^\d{5}$/.test(rec.student_no)) errors.push({ line: line, column: '학번', message: '학번은 숫자 5자리여야 합니다: ' + rec.student_no });
    var k = rec.parent_email + '|' + rec.student_no;
    if (seen[k]) errors.push({ line: line, column: '학번', message: seen[k] + '줄과 같은 연결입니다.' });
    else seen[k] = line;
    records.push(rec);
  }
  return { records: records, errors: errors, warnings: [] };
}

/**
 * 명단과 지금 데이터를 비교해 저장할 것을 만든다(아무것도 쓰지 않음).
 * records = parseRosterTable_의 records(오류가 없을 때만 부른다), termId = 올리는 기간, ymd = 상태 적용일.
 * existing = {students, enrollments, changes, users}
 * → {createStudents:[{ref, student_no, name, gender, grade, class_no, number, track, email, memo}],
 *    updateStudents:[{id, patch}],
 *    createEnrollments:[{term_id, student_id, teacher_email, veritas, commute_type, end_type, memo}],
 *    updateEnrollments:[{id, patch}],
 *    createChanges:[{student_id, item, value, effective_date, effective_date_auto, requested_at, reason, doc_submitted,
 *                    linked_change_id, source:'명단업로드', status:'유효', memo}],
 *    leavingCandidates:[{student_id, enrollment_id, student_no, name}],
 *    ambiguous:[{line, student_no, name, candidates:[studentId], reason}], warnings:[]}
 * - 새 학생은 아직 id가 없어 ref = 'new:' + 학번. createEnrollments·createChanges의 student_id에도 이 ref가 들어간다.
 *   저장하는 쪽(C3)이 새 id를 만들고 ref를 바꿔 넣는다.
 * - 학생 찾기: ① 학생 구글 계정이 같은 학생(학년이 올라 학번이 바뀌어도 이어진다) ② 계정으로 못 찾으면 학번이 같은 학생
 *   (이번 명단의 다른 줄이 계정으로 이미 잡은 학생은 빼고 — 옛 학번을 올해 새 학생이 쓰는 경우).
 *   학번은 학년도마다 새 학생에게 다시 쓰이므로, 학번이 같아도 계정이 서로 다르거나(둘 다 있을 때) 이름이 다르면
 *   다른 사람으로 보고 새 학생을 만든다(경고). 학번·이름이 같은데 학년이 다르거나, 같은 학번·이름이 여럿이거나,
 *   다른 줄이 계정으로 잡은 학생과 학번·이름이 같거나, 명단의 두 줄이 같은 학생을 가리키면 ambiguous.
 *   ambiguous 줄은 아무것도 만들지 않는다(관리자가 고쳐서 다시 올린다).
 *   새 학생이 계정 없는 기존 학생과 이름·성별이 같으면 경고(계정이 없어 학년이 올라간 학생을 잇지 못했을 수 있다).
 * - 학생 정보가 다르면 updateStudents(바뀐 열만). memo는 학생이 아니라 이 기간 등록의 memo로 간다.
 * - 이 기간 등록이 없으면 createEnrollments, 있으면 담당교사·베리타스·통학구분·비고가 다를 때 updateEnrollments.
 *   ASSUMPTION: 이미 있는 등록의 end_type은 명단에 열이 없으므로 바꾸지 않는다.
 * - 상태(학사·기숙사·조식·석식): ymd 기준 그 항목 기록이 아직 없을 때만 createChanges(적용일 = ymd, 초기값).
 *   ASSUMPTION: 기록이 이미 있고 명단과 다르면 바꾸지 않고 경고만 한다. 명단은 초기값용이고, 학기 중 변경은
 *   F6·F7(급식 적용일 규칙)로 한다. 그래서 같은 파일을 언제 다시 올려도 상태 변경은 0건이다.
 *   ymd는 보통 기간 시작일(학기 중에 올리면 그날)을 넘긴다.
 * - leavingCandidates: 이 기간 등록이 있고 ymd에 학사생인데 명단에 없는 학생. 표시만 한다(자동 퇴실 없음).
 * - warnings: 담당교사 이메일이 users에 없음 등.
 */
function diffRoster_(records, existing, termId, ymd) {
  existing = existing || {};
  var students = existing.students || [], enrollments = existing.enrollments || [];
  var changes = existing.changes || [], users = existing.users || [];
  var tid = rosterStr_(termId);
  var out = { createStudents: [], updateStudents: [], createEnrollments: [], updateEnrollments: [],
    createChanges: [], leavingCandidates: [], ambiguous: [], warnings: [] };

  var byEmail = {}, byNo = {};
  students.forEach(function (s) {
    var e = rosterStr_(s.email).toLowerCase(), n = rosterStr_(s.student_no);
    if (e) (byEmail[e] = byEmail[e] || []).push(s);
    if (n) (byNo[n] = byNo[n] || []).push(s);
  });
  var enrByStudent = {};
  enrollments.forEach(function (e) {
    if (rosterStr_(e.term_id) !== tid) return;
    var sid = rosterStr_(e.student_id);
    if (sid && !enrByStudent[sid]) enrByStudent[sid] = e;
  });
  var teacherEmails = {};
  users.forEach(function (u) {
    if (rosterStr_(u.active).toUpperCase() !== 'FALSE') teacherEmails[rosterStr_(u.email).toLowerCase()] = true;
  });

  // 1) 줄마다 학생 찾기. 먼저 계정으로 이어진 학생을 모아 두고, 그 학생은 학번 찾기에서 뺀다
  //    (학년이 올라간 학생의 옛 학번을 올해 새 학생이 쓰는 경우).
  var claimed = {};
  (records || []).forEach(function (rec) {
    var c = rec.email ? (byEmail[rec.email] || []) : [];
    if (c.length === 1) claimed[rosterStr_(c[0].id)] = true;
  });
  var matches = (records || []).map(function (rec) {
    var cands = rec.email ? (byEmail[rec.email] || []) : [];
    if (cands.length > 1) return { rec: rec, amb: { candidates: cands, reason: '같은 학생 계정을 가진 학생이 여럿입니다' } };
    if (cands.length === 1) return { rec: rec, student: cands[0] };
    var byNAll = byNo[rec.student_no] || [];
    var byN = byNAll.filter(function (s) { return !claimed[rosterStr_(s.id)]; });
    var sameName = byNAll.filter(function (s) { return claimed[rosterStr_(s.id)] && rosterStr_(s.name) === rec.name; });
    if (!byN.length && sameName.length) {
      return { rec: rec, amb: { candidates: sameName, reason: '다른 줄이 학생 계정으로 이미 가리킨 학생과 학번·이름이 같습니다' } };
    }
    if (!byN.length) return { rec: rec, student: null };
    // 학번은 해마다 새 학생에게 다시 쓰인다. 계정이 서로 다르거나 이름이 다르면 다른 사람으로 보고 새 학생을 만든다.
    var same = byN.filter(function (x) {
      var e = rosterStr_(x.email).toLowerCase();
      return rosterStr_(x.name) === rec.name && !(rec.email && e && e !== rec.email);
    });
    if (!same.length) {
      return { rec: rec, student: null, note: '학번 ' + rec.student_no + '을(를) 쓰던 다른 학생 기록이 있어 새 학생으로 만듭니다(' +
        byN.map(function (x) { return rosterStr_(x.name); }).join('·') + ')' };
    }
    if (same.length > 1) return { rec: rec, amb: { candidates: same, reason: '같은 학번·이름의 학생이 여럿입니다' } };
    if (rosterStr_(same[0].grade) !== rec.grade) {
      return { rec: rec, amb: { candidates: same, reason: '학번·이름은 같지만 학년이 다릅니다' } };
    }
    return { rec: rec, student: same[0] };
  });

  // 2) 두 줄이 같은 학생을 가리키면 둘 다 ambiguous
  var lineOfStudent = {};
  matches.forEach(function (m) {
    if (!m.student) return;
    var id = rosterStr_(m.student.id);
    (lineOfStudent[id] = lineOfStudent[id] || []).push(m);
  });
  Object.keys(lineOfStudent).forEach(function (id) {
    var ms = lineOfStudent[id];
    if (ms.length < 2) return;
    ms.forEach(function (m) {
      m.amb = { candidates: [m.student], reason: '명단의 여러 줄(' + ms.map(function (x) { return x.rec.line; }).join('·') + '줄)이 같은 학생을 가리킵니다' };
      m.student = null;
    });
  });

  var inRoster = {};
  var ambCandidates = {};
  matches.forEach(function (m) {
    var rec = m.rec;
    if (m.amb) {
      var ids = m.amb.candidates.map(function (s) { return rosterStr_(s.id); });
      ids.forEach(function (id) { ambCandidates[id] = true; });
      out.ambiguous.push({ line: rec.line, student_no: rec.student_no, name: rec.name, candidates: ids, reason: m.amb.reason });
      return;
    }
    if (rec.teacher_email && !teacherEmails[rec.teacher_email]) {
      out.warnings.push(rec.line + '줄: 담당교사 ' + rec.teacher_email + '이(가) 사용자 목록에 없습니다.');
    }
    if (m.note) out.warnings.push(rec.line + '줄: ' + m.note);
    var sid;
    var fields = { student_no: rec.student_no, name: rec.name, gender: rec.gender, grade: rec.grade,
      class_no: rec.class_no, number: rec.number, track: rec.track, email: rec.email };
    if (!m.student) {
      sid = 'new:' + rec.student_no;
      out.createStudents.push(Object.assign({ ref: sid }, fields, { memo: '' }));
      var twins = students.filter(function (x) {
        return !rosterStr_(x.email) && rosterStr_(x.name) === rec.name && rosterStr_(x.gender) === rec.gender;
      });
      if (twins.length) {
        out.warnings.push(rec.line + '줄: 계정이 비어 있는 기존 학생 ' + twins.map(function (x) { return rosterStr_(x.student_no) + ' ' + rosterStr_(x.name); }).join('·') +
          '과(와) 이름·성별이 같습니다. 같은 학생이면 그 학생에게 계정을 먼저 넣고 다시 올려 주세요.');
      }
    } else {
      sid = rosterStr_(m.student.id);
      inRoster[sid] = true;
      var patch = {};
      Object.keys(fields).forEach(function (k) {
        if (k === 'email' && !fields.email) return; // 명단에 계정이 비었으면 있는 계정을 지우지 않는다
        var before = rosterStr_(m.student[k]);
        if (k === 'email') before = before.toLowerCase();
        if (before !== fields[k]) patch[k] = fields[k];
      });
      if (Object.keys(patch).length) out.updateStudents.push({ id: sid, patch: patch });
      if (patch.student_no) {
        var holders = (byNo[patch.student_no] || []).filter(function (x) { return rosterStr_(x.id) !== sid; });
        if (holders.length) {
          out.warnings.push(rec.line + '줄: 새 학번 ' + patch.student_no + '을(를) 다른 학생 기록(' +
            holders.map(function (x) { return rosterStr_(x.name); }).join('·') + ')도 가지고 있습니다(학번은 학년도마다 다시 쓰임).');
        }
      }
    }

    var enr = m.student ? enrByStudent[sid] : null;
    var enrFields = { teacher_email: rec.teacher_email, veritas: rec.veritas, commute_type: rec.commute_type, memo: rec.memo };
    if (!enr) {
      out.createEnrollments.push({ term_id: tid, student_id: sid, teacher_email: rec.teacher_email, veritas: rec.veritas,
        commute_type: rec.commute_type, end_type: rec.end_type, memo: rec.memo });
    } else {
      var ep = {};
      Object.keys(enrFields).forEach(function (k) {
        var before = rosterStr_(enr[k]);
        if (k === 'teacher_email') before = before.toLowerCase();
        if (k === 'veritas') before = before.toUpperCase();
        if (before !== enrFields[k]) ep[k] = enrFields[k];
      });
      if (Object.keys(ep).length) out.updateEnrollments.push({ id: rosterStr_(enr.id), patch: ep });
    }

    [['학사', rec.hall], ['기숙사', rec.dorm], ['조식', rec.breakfast], ['석식', rec.dinner]].forEach(function (p) {
      var now = m.student ? statusOn_(changes, sid, p[0], ymd) : '';
      if (now === p[1]) return;
      if (now !== '') {
        // ASSUMPTION: 이미 상태 기록이 있는 항목은 명단으로 바꾸지 않는다(F6·F7 기록과 급식 적용일 규칙을 덮지 않게).
        out.warnings.push(rec.line + '줄: ' + rec.name + ' ' + p[0] + '이(가) 기록(' + now + ')과 명단(' + p[1] +
          ')이 다릅니다. 바꾸려면 입퇴실·급식 변경으로 처리해 주세요.');
        return;
      }
      out.createChanges.push({ student_id: sid, item: p[0], value: p[1], effective_date: ymd, effective_date_auto: ymd,
        requested_at: '', reason: '명단 업로드', doc_submitted: '', linked_change_id: '', source: '명단업로드',
        status: '유효', memo: '' });
    });
  });

  // 3) 퇴실 후보: 이 기간 학사생인데 명단에 없음(같은 사람인지 모르는 후보는 빼고 ambiguous로 본다)
  var studentById = {};
  students.forEach(function (s) { studentById[rosterStr_(s.id)] = s; });
  var listed = {};
  enrollments.forEach(function (e) {
    var sid = rosterStr_(e.student_id);
    if (rosterStr_(e.term_id) !== tid || !sid || listed[sid]) return;
    listed[sid] = true;
    if (inRoster[sid] || ambCandidates[sid]) return;
    if (!isActiveOn_(changes, enrByStudent[sid], ymd)) return;
    var s = studentById[sid] || {};
    out.leavingCandidates.push({ student_id: sid, enrollment_id: rosterStr_(enrByStudent[sid].id),
      student_no: rosterStr_(s.student_no), name: rosterStr_(s.name) });
  });
  return out;
}
