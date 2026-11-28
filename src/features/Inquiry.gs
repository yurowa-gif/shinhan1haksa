/**
 * C52 F16 탐구 기록(전역 이름 접두어 iqf). 규칙은 R26 InquiryRules.gs(inquiryParse_·inquiryMergePlan_·inquiryProgressCheck_·inquiryCleanupTargets_)와
 * R24 Stage6Rules.gs(s6Visible_·s6Pick_·s6CanWrite_)가 정한다. 근거: PRD F16, 결정 15·17·93·97·100, docs/design/stage6/screens.md 4·8절.
 *
 * - 올리기(inquiry.upload): 학생 본인만. 신원은 로그인 계정(portalWho_) — 파일 속 이름·학급은 경고(name_mismatch)에만 쓰고 신원에 쓰지 않는다(결정 17·93).
 *   미리 보기(previewInquiryFile)는 아무것도 쓰지 않고, 올리기(uploadInquiryFile)는 락 안에서 다시 읽고 합친다(같은 파일 두 번 = 0건, 본문이 다르면 통째로 거절).
 *   원본 파일은 비공유 Drive 폴더(Script Property INQUIRY_FOLDER_ID, 없으면 첫 올리기에서 만들어 저장)에 두고 시트에는 파일 id만 둔다.
 * - 진행 기록(inquiry.progress)·학부모 공개(inquiry.publish, 건마다·기본 비공개): 학생 본인만, 락 안에서 본인 행인지·지금 학사생인지(결정 97) 다시 본다.
 * - 보기(inquiry.view): 응답은 s6Visible_이 돌려준 칸만 — 학생 본인은 자기 것, 학부모는 학생이 공개한 기록의 공개 칸만, 담당교사·담임·관리자는 판정표 칸
 *   ('이름 다름' 표시는 교사만, 원본 파일 id는 관리자만).
 * - 정리(inquiry.cleanup): 관리자만. 졸업·퇴실 1년 뒤 원본 파일을 Drive에서 지우고(휴지통) 시트 행은 '취소'로 남긴다. 자동 삭제 없음. 결정 100 — '기록은 삭제하지 않는다'의 유일한 예외.
 * ASSUMPTION: 다른 학생의 같은 파일(같은 source_id)은 학생마다 따로 센다(inquiryMergePlan_가 그 학생 행만 본다).
 */
var IQF_SHEET = 'inquiry_records';
var IQF_FOLDER_PROP = 'INQUIRY_FOLDER_ID';
var IQF_FOLDER_NAME = '신한1학사_탐구원본';

function iqfLoad_() {
  ['terms', 'students', 'enrollments', 'status_changes', 'users'].forEach(function (n) { invalidate_('db', n); });
  invalidate_('db', IQF_SHEET);
  return { terms: readAll_('terms'), students: readAll_('students'), enrollments: readAll_('enrollments'), changes: readAll_('status_changes'), today: today_() };
}

function iqfActive_(changes, studentId, today) { return statusOn_(changes, studentId, '학사', today) === '입실'; }
function iqfErrors_(list) { return list.map(function (m) { return { field: '', message: m }; }); }

/** 이 접속자가 그 학생의 그 기간(termId) 탐구 기록을 어떤 자격으로 보나. 학부모(연결 자녀) > 학생 본인·관리자·그 기간 담당교사·담임(crqViewer_와 같은 판정) */
function iqfViewer_(user, student, termId, enrollments) {
  if (hasRole_(user, 'parent') && portalWho_().childIds.indexOf(student.id) >= 0) return { role: 'parent', isSelf: false, isChild: true };
  return crqViewer_(user, student, termId, enrollments);
}

/** 한 기록을 보는 사람에 맞게 줄인다(s6Visible_이 돌려준 칸만) + 성취기준 배열·기록한 날. 못 보면 null */
function iqfView_(row, viewer) {
  var v = s6Pick_(row, s6Visible_(viewer, 'inquiry', row), {});
  if (!v) return null;
  if (v.standards !== undefined) v.standardsList = ruleStr_(v.standards).split(';').filter(Boolean);
  if (v.recorded_at !== undefined) { var day = ruleStr_(v.recorded_at).slice(0, 10); v.recordedKo = ymdIsValid_(day) ? foodDateKo_(day) : ''; }
  return v;
}

function iqfStudentView_(s) { return { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number }; }

/* ───────────── 보기 ───────────── */

/**
 * 한 학생의 탐구 기록(보는 사람에 맞는 칸만). 학생 본인(studentId를 비우면 본인)·연결된 자녀의 학부모·담당교사·담임·관리자(inquiry.view). 새 기록이 위.
 * → {ok, student, role, canWrite(학생 본인이고 지금 학사 입실), today, progressOptions, rows:[{id, recorded_at, recordedKo, source, standards, standardsList, subject, title, question, liked?,
 *    progress, result_link, memo, show_to_parent?, name_mismatch?(교사만), file_id?(관리자만), status?}]}
 */
function getInquiryStudent(studentId) {
  var user = requirePermission_('inquiry.view', { studentId: studentId || portalWho_().studentId });
  var sid = String(studentId || portalWho_().studentId || '');
  var d = iqfLoad_(), student = d.students.filter(function (s) { return s.id === sid; })[0];
  if (!student) throw new Error('학생을 찾을 수 없습니다.');
  var rows = [], role = 'none';
  readAll_(IQF_SHEET).filter(function (r) { return ruleStr_(r.student_id) === sid; })
    .sort(function (a, b) { var x = String(a.recorded_at), y = String(b.recorded_at); return x < y ? 1 : x > y ? -1 : (a.id < b.id ? -1 : 1); })
    .forEach(function (r) {
      var viewer = iqfViewer_(user, student, r.term_id, d.enrollments);
      role = viewer.role !== 'none' ? viewer.role : role;
      var v = iqfView_(r, viewer);
      if (v) rows.push(v);
    });
  var term = getCurrentTerm_();
  var now = term ? iqfViewer_(user, student, term.id, d.enrollments) : { role: 'none' };
  var canWrite = now.role === 'student' && s6CanWrite_(now, 'inquiry.upload', { active: iqfActive_(d.changes, sid, d.today) }).ok;
  return { ok: true, student: iqfStudentView_(student), role: now.role === 'none' ? role : now.role, canWrite: canWrite, today: d.today, progressOptions: INQ_PROGRESS.slice(), rows: rows };
}

/* ───────────── 올리기 ───────────── */

/** 폴더가 공유되어 있으면 올리지 않는다(링크 공유뿐 아니라 이름으로 추가된 사람도) */
function iqfIsOpen_(item) { return item.getSharingAccess() !== DriveApp.Access.PRIVATE || item.getEditors().length > 0 || item.getViewers().length > 0; }

/** 원본 파일을 둘 비공유 폴더. 속성이 없으면 만들어 저장한다(없어졌거나 휴지통이면 조용히 새로 만들지 않는다 — 원본이 어디 가는지 모르게 되므로) */
function iqfFolder_() {
  var id = props_().getProperty(IQF_FOLDER_PROP), folder;
  if (id) {
    try { folder = DriveApp.getFolderById(id); } catch (e) { throw new Error('탐구 원본 폴더를 열 수 없습니다(INQUIRY_FOLDER_ID 확인). 관리자 선생님께 알려 주세요.'); }
    if (folder.isTrashed()) throw new Error('탐구 원본 폴더가 휴지통에 있습니다. 관리자 선생님께 알려 주세요.');
  } else {
    folder = DriveApp.createFolder(IQF_FOLDER_NAME);
    props_().setProperty(IQF_FOLDER_PROP, folder.getId());
  }
  if (iqfIsOpen_(folder)) throw new Error('탐구 원본 폴더가 공유되어 있어 올릴 수 없습니다. 관리자 선생님께 알려 주세요.');
  return folder;
}

/** 원본 파일 한 개를 폴더에 저장하고 id를 돌려준다. 만든 파일이 열려 있으면 휴지통으로 보내고 던진다 */
function iqfStoreFile_(text, studentId, today) {
  var folder = iqfFolder_();
  var name = 'inquiry_' + String(studentId).slice(0, 8) + '_' + today.replace(/-/g, '') + '_' + nowIso_().slice(11, 19).replace(/:/g, '') + '.json';
  var file = folder.createFile(name, String(text), 'application/json');
  if (iqfIsOpen_(file)) { file.setTrashed(true); throw new Error('원본 파일이 공유되어 저장하지 못했습니다. 관리자 선생님께 알려 주세요.'); }
  return file.getId();
}

/** 학생 본인의 살아 있는 기록 + 파일 읽기·합치기 계획(저장은 안 함). 락 안·밖 모두 부를 수 있다 → {student, parsed, plan, term} | {errors} */
function iqfPlan_(text, me, fileId) {
  var d = iqfLoad_(), term = getCurrentTerm_();
  var student = d.students.filter(function (s) { return s.id === me; })[0];
  if (!student) return { errors: ['학생 명단에서 내 계정을 찾지 못했습니다. 담당 선생님께 알려 주세요.'] };
  var w = s6CanWrite_({ role: 'student', isSelf: true }, 'inquiry.upload', { active: iqfActive_(d.changes, me, d.today) });
  if (!w.ok) return { errors: [w.reason] };
  if (!term) return { errors: ['지금은 운영 기간이 아니라 올릴 수 없습니다.'] };
  var parsed = inquiryParse_(text, { accountName: student.name });
  if (parsed.errors.length) return { errors: parsed.errors };
  var existing = readAll_(IQF_SHEET).filter(function (r) { return ruleStr_(r.student_id) === me; });
  var plan = inquiryMergePlan_(existing, parsed, me, fileId || '', term.id);
  return { student: student, parsed: parsed, plan: plan, term: term, existing: existing, today: d.today };
}

function iqfConflictText_(plan, existing) {
  var title = {};
  existing.forEach(function (r) { title[ruleStr_(r.source_id)] = ruleStr_(r.title); });
  var names = plan.conflicts.slice(0, 3).map(function (c) { return title[c.sourceId] || c.sourceId; });
  return '이미 올린 기록 ' + plan.conflicts.length + '건과 내용이 다릅니다(' + names.join(', ') + (plan.conflicts.length > 3 ? ' …' : '') + '). 탐구발견에서 파일을 다시 받아 올려 주세요. 올린 기록은 바뀌지 않았습니다.';
}

/**
 * 파일 미리 보기(저장하지 않음, inquiry.upload — 학생 본인). text = 파일 글자(.json).
 * → {ok:true, newCount, sameCount, newTitles:[…20개까지], nameMismatch, fileName(파일 속 이름), accountName(내 이름), warnings} | {ok:false, errors:[{field,message}]}
 * 본문이 다른 같은 기록이 있으면 오류(올리기와 같은 판정). 같은 파일을 다시 고르면 새 기록 0건·이미 있는 기록 n건.
 */
function previewInquiryFile(text) {
  var user = requirePermission_('inquiry.upload', { studentId: portalWho_().studentId });
  var me = portalWho_().studentId;
  var p = iqfPlan_(text, me, '');
  if (p.errors) return { ok: false, errors: iqfErrors_(p.errors) };
  if (p.plan.conflicts.length) return { ok: false, errors: iqfErrors_([iqfConflictText_(p.plan, p.existing)]) };
  return { ok: true, newCount: p.plan.toAppend.length, sameCount: p.plan.same + p.plan.toUpdate.length, newTitles: p.plan.toAppend.slice(0, 20).map(function (r) { return r.title; }),
    nameMismatch: !!p.parsed.nameMismatch, fileName: p.parsed.nameMismatch ? p.parsed.meta.fileName : '', accountName: p.student.name, warnings: p.parsed.warnings };
}

/**
 * 파일 올리기(inquiry.upload — 학생 본인). text = 파일 글자, confirmName = 이름이 다를 때 학생이 '내 기록이 맞습니다'를 확인했는가(결정 93).
 * 락 안에서 다시 읽고 합친다: 새 기록은 진행 '관심'·공개 꺼짐으로 쌓고(name_mismatch는 교사 화면 표시), 이미 있는 기록은 관심 표시만 맞춘다. 같은 파일을 다시 올리면 0건.
 * 본문이 다른 같은 기록이 있으면 아무것도 쓰지 않는다. 새 기록이 있을 때만 원본 파일을 Drive에 저장한다.
 * → {ok:true, added, same, updated} | {ok:false, errors:[{field,message}]}
 */
function uploadInquiryFile(text, confirmName) {
  var user = requirePermission_('inquiry.upload', { studentId: portalWho_().studentId });
  var me = portalWho_().studentId;
  return withLock_(function () {
    var p = iqfPlan_(text, me, '');
    if (p.errors) return { ok: false, errors: iqfErrors_(p.errors) };
    if (p.plan.conflicts.length) return { ok: false, errors: iqfErrors_([iqfConflictText_(p.plan, p.existing)]) };
    if (p.parsed.nameMismatch && confirmName !== true) return { ok: false, errors: iqfErrors_(['파일 속 이름이 내 이름과 다릅니다. "내 기록이 맞습니다"를 확인한 뒤 올려 주세요.']) };
    var added = p.plan.toAppend.length, fileId = '';
    if (added) {
      fileId = iqfStoreFile_(text, me, p.today);
      p.plan.toAppend.forEach(function (r) { r.file_id = fileId; });
    }
    try {
      bulkAppend_(IQF_SHEET, p.plan.toAppend, user.email, 'db');
      bulkUpdateRecords_(IQF_SHEET, p.plan.toUpdate, user.email, 'db');
    } catch (e) {
      if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e2) { /* 원본만 남는다 — 정리 대상으로 보인다 */ } }
      throw e;
    }
    return { ok: true, added: added, same: p.plan.same, updated: p.plan.toUpdate.length };
  });
}

/* ───────────── 진행 기록·공개(학생 본인) ───────────── */

/** 락 안에서: 본인 행(살아 있음)·지금 학사생 확인 → {row} | {error, stale} (남의 행은 denied 기록 + 던짐) */
function iqfOwnRow_(recordId, action, user) {
  var row = findById_(IQF_SHEET, String(recordId || ''));
  if (!row) return { error: '탐구 기록을 찾을 수 없습니다. 화면을 새로 불러와 주세요.', stale: true };
  var me = portalWho_().studentId;
  if (!me || ruleStr_(row.student_id) !== me) { logDenied_(user.email, action, '남의 탐구 기록'); throw new Error(DENIED_MESSAGE); }
  if (ruleStr_(row.status) === '취소') return { error: '정리된 기록입니다. 화면을 새로 불러와 주세요.', stale: true };
  var d = iqfLoad_();
  var w = s6CanWrite_({ role: 'student', isSelf: true }, action === 'inquiry.publish' ? 'inquiry.publish' : 'inquiry.progress', { active: iqfActive_(d.changes, me, d.today) });
  if (!w.ok) return { error: w.reason };
  return { row: row };
}

/**
 * 진행 기록(학생 본인): input = {progress(관심·진행 중·완료), resultLink(http(s)만), memo}. 적지 않은 칸은 건드리지 않는다. → {ok:true, row} | {ok:false, stale?, errors}
 */
function saveInquiryProgress(recordId, input) {
  var user = requirePermission_('inquiry.progress', { studentId: portalWho_().studentId });
  return withLock_(function () {
    invalidate_('db', IQF_SHEET);
    var own = iqfOwnRow_(recordId, 'inquiry.progress', user);
    if (own.error) return { ok: false, stale: !!own.stale, errors: iqfErrors_([own.error]) };
    var c = inquiryProgressCheck_(input);
    if (c.errors.length) return { ok: false, errors: iqfErrors_(c.errors) };
    if (Object.keys(c.patch).length) updateRecord_(IQF_SHEET, own.row.id, c.patch, user.email);
    return { ok: true, row: iqfView_(findById_(IQF_SHEET, own.row.id), { role: 'student', isSelf: true, isChild: false }) };
  });
}

/** 학부모에게 보이기/거두기(학생 본인, 기록마다·기본 꺼짐, 결정 15·92). 켜고 끈 것은 audit_log(update, show_to_parent)에 남는다. → {ok:true, on} | {ok:false, stale?, errors} */
function setInquiryShare(recordId, on) {
  var user = requirePermission_('inquiry.publish', { studentId: portalWho_().studentId });
  var want = on === true || /^true$/i.test(String(on));
  return withLock_(function () {
    invalidate_('db', IQF_SHEET);
    var own = iqfOwnRow_(recordId, 'inquiry.publish', user);
    if (own.error) return { ok: false, stale: !!own.stale, errors: iqfErrors_([own.error]) };
    if (s6True_(own.row.show_to_parent) !== want) updateRecord_(IQF_SHEET, own.row.id, { show_to_parent: want ? 'TRUE' : 'FALSE' }, user.email);
    return { ok: true, on: want };
  });
}

/* ───────────── 학부모 포털 ───────────── */

/** 학부모 포털의 탐구 줄(자녀가 켠 기록만, 공개 칸만). 포털 getPortalStudent가 학부모에게만 부른다 */
function ptlInquiry_(studentId) {
  var viewer = { role: 'parent', isSelf: false, isChild: true }, out = [];
  readAll_(IQF_SHEET).filter(function (r) { return ruleStr_(r.student_id) === studentId; })
    .sort(function (a, b) { return String(a.recorded_at) < String(b.recorded_at) ? 1 : -1; })
    .forEach(function (r) { var v = iqfView_(r, viewer); if (v) out.push(v); });
  return out.slice(0, 10);
}

/* ───────────── 관리자 정리(결정 100) ───────────── */

/** 정리 대상을 학생별로 묶는다 → {students:[{studentId, label, leaveDate, leaveKo, since, files:n, recordIds:[…]}], totalFiles, totalStudents} */
function iqfCleanupGroups_(d) {
  var targets = inquiryCleanupTargets_(readAll_(IQF_SHEET), d.changes, d.today);
  var by = {}, order = [], byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  targets.forEach(function (t) {
    if (!by[t.studentId]) {
      var s = byId[t.studentId] || {};
      by[t.studentId] = { studentId: t.studentId, label: s.name ? s.grade + '. ' + s.name : '(명단에 없는 학생)', leaveDate: t.leaveDate, leaveKo: foodDateKo_(t.leaveDate), since: t.since, fileIds: {}, recordIds: [] };
      order.push(t.studentId);
    }
    by[t.studentId].fileIds[t.fileId] = true;
    by[t.studentId].recordIds.push(t.id);
  });
  var files = {};
  var students = order.map(function (id) {
    var g = by[id];
    Object.keys(g.fileIds).forEach(function (f) { files[f] = true; });
    return { studentId: g.studentId, label: g.label, leaveDate: g.leaveDate, leaveKo: g.leaveKo, since: g.since, files: Object.keys(g.fileIds).length, recordIds: g.recordIds };
  });
  return { students: students, totalFiles: Object.keys(files).length, totalStudents: students.length, targets: targets };
}

/** 관리자 홈 카드(getHomeData 훅, 숫자만) → {students, files} */
function iqfHomeInfo_(user, role) {
  if (role !== 'admin') return null;
  var g = iqfCleanupGroups_(iqfLoad_());
  return { students: g.totalStudents, files: g.totalFiles };
}

/** 정리 대상 목록(관리자만). → {ok, students:[…], totalFiles, totalStudents} (recordIds는 화면이 보내지 않아도 되도록 응답에서 뺀다) */
function getInquiryCleanup() {
  requirePermission_('inquiry.cleanup');
  var g = iqfCleanupGroups_(iqfLoad_());
  return { ok: true, students: g.students.map(function (s) { return { studentId: s.studentId, label: s.label, leaveKo: s.leaveKo, since: s.since, files: s.files }; }), totalFiles: g.totalFiles, totalStudents: g.totalStudents };
}

/**
 * 고른 학생들의 원본 파일을 지운다(관리자만, Drive 휴지통). 락 안에서 정리 대상을 다시 계산해 그 안의 것만 지운다(그사이 복학 등으로 빠진 학생은 건드리지 않는다).
 * 파일을 지우면 그 파일에서 온 시트 행은 '취소'(사유 '원본 파일 정리')로 남고 file_id가 비워진다. 지운 사실은 audit_log(inquiry:cleanup, 개수만)에 남는다.
 * 일부만 지워졌으면 실패한 파일의 행은 그대로 정리 대상으로 남는다. → {ok:true, deleted, failed, total}
 */
function cleanupInquiryFiles(studentIds) {
  var user = requirePermission_('inquiry.cleanup');
  var want = {};
  (Array.isArray(studentIds) ? studentIds : []).forEach(function (id) { want[String(id)] = true; });
  return withLock_(function () {
    var d = iqfLoad_(), g = iqfCleanupGroups_(d);
    var picked = g.targets.filter(function (t) { return want[t.studentId]; });
    var byFile = {}, files = [];
    picked.forEach(function (t) { if (!byFile[t.fileId]) { byFile[t.fileId] = []; files.push(t.fileId); } byFile[t.fileId].push(t.id); });
    var deleted = 0, failed = 0, patches = [];
    files.forEach(function (fid) {
      var gone = false;
      var file = null;
      try { file = DriveApp.getFileById(fid); } catch (e) { gone = true; }   // 열 수 없는(이미 없는) 파일은 지운 것으로 본다 — 오류 문구는 계정 언어마다 달라 문구에 기대지 않는다
      if (file) { try { file.setTrashed(true); gone = true; } catch (e2) { /* 휴지통으로 못 보냄 = 실패, 다시 정리 대상으로 남는다 */ } }
      if (!gone) { failed++; return; }
      deleted++;
      byFile[fid].forEach(function (id) { patches.push({ id: id, patch: { status: '취소', cancel_reason: '원본 파일 정리', file_id: '' } }); });
    });
    bulkUpdateRecords_(IQF_SHEET, patches, user.email, 'db');
    writeAudit_(IQF_SHEET, '', 'inquiry:cleanup', null, null, user.email, 'db', '원본 파일 ' + deleted + '개 삭제' + (failed ? ', ' + failed + '개 실패' : '') + '(학생 ' + Object.keys(want).length + '명 선택)');
    return { ok: true, deleted: deleted, failed: failed, total: files.length };
  });
}
