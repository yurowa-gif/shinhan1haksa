/**
 * C26 학년 일괄 퇴실(결정 74①, R20 규칙 위). 전역 이름 접두어 bat. 계약 rules-api R20 ①~④.
 * 3학년 수능 뒤처럼 한 학년을 한 번에 퇴실시킨다: 미리보기(대상 목록·빠지는 학생과 사유·경고) → 저장(한 락 안에서 모든 학생의 행을 한 번에) →
 * 필요하면 일괄 단위로 되돌리기(결정 59). 관리자만(`batch.leave`, ASSUMPTION — 가정 승인). 메일은 보내지 않는다.
 *
 * - 대상 = 이번 기간 등록생 중 그 학년이고 퇴실일에 학사 '입실'인 학생(moveBatchTargets_). 기숙사생은 '학사 및 기숙사 퇴실', 나머지는 '학사 퇴실'(규칙이 정한다).
 *   급식은 일반 퇴실 정리 그대로, 좌석·방은 일반 퇴실처럼 빈자리로 보인다(따로 쓰는 행 없음). 일괄 퇴실도 자진 퇴실이라 재입실이 막힌다(결정 77①).
 * - 미리보기에서 batchId(UUID)를 만들어 expect에 넣고, 저장은 그 batchId·대상 목록으로 다시 계획해 서명이 같을 때만 쓴다(그 사이 바뀌면 다시 미리보기).
 *   같은 batchId가 이미 저장돼 있으면 {ok:true, duplicate:true}(두 번 누르기). 대표 행 memo = '[일괄] <batchId>'.
 * - 쓰기는 대표+연결 행 한 번(bulkAppend_), 취소·되살림 한 번(bulkUpdateRecords_) — 학생마다 쓰지 않는다(180명도 한 번에).
 * ASSUMPTION: 퇴실일은 지금 운영 기간 안(끝난 다음 날까지)이어야 한다. 기간 밖이면 거부한다.
 * ASSUMPTION: 사람이 쓴 사유(선택)는 모든 학생의 대표 행 reason에 같이 쓴다. '2OUT 퇴실'·'임시 퇴실'·'[일괄]' 같은 예약어는 거부한다.
 * ASSUMPTION: 입퇴실 확인서(결정 68)는 학생마다 따로 인쇄한다(일괄 인쇄는 하지 않는다).
 */
var BAT_PREFIX = '[일괄] ';
var BAT_DEFAULT_REASON = '학년 일괄 퇴실';

function batLabel_(s) { return s.grade + '-' + s.class_no + ' ' + s.number + '번 ' + s.name; }

/** 일괄 퇴실의 기준 기간: 오늘이 속한 기간(없으면 지금 기간). 없으면 null */
function batTerm_(terms) { return termOnDate_(today_(), terms) || getCurrentTerm_(); }

/** 입력 검사(순수 + 날짜 계산). input = {grade, effectiveDate, requestedAt, dinner, reason, docSubmitted, excludeIds} → {errors:[{field,message}], rec} */
function batValidate_(input, ctx) {
  input = input || {};
  var errors = [], err = function (field, message) { errors.push({ field: field, message: message }); };
  var grade = String(input.grade === undefined || input.grade === null ? '' : input.grade).trim();
  if (!/^\d+$/.test(grade) || ctx.grades.indexOf(grade) < 0) err('grade', '학년을 골라 주세요.');
  var eff = String(input.effectiveDate || '').trim();
  if (!ymdIsValid_(eff)) err('effectiveDate', '퇴실일을 날짜로 입력해 주세요.');
  else if (ctx.term && (eff < ctx.term.start_date || eff > ymdAddDays_(ctx.term.end_date, 1))) err('effectiveDate', '퇴실일이 이번 운영 기간 밖입니다. "' + ctx.term.name + '" 시작일(' + foodDateKo_(ctx.term.start_date) + ')부터 끝난 다음 날(' + foodDateKo_(ymdAddDays_(ctx.term.end_date, 1)) + ')까지 골라 주세요.');
  var at = foodNormAt_(input.requestedAt);
  if (!at) err('requestedAt', '신청 일시를 날짜와 시각까지 입력해 주세요(예: 2027-03-03T10:45).');
  else if (at > ctx.now) err('requestedAt', '신청 일시가 지금보다 늦습니다.');
  var dinner = String(input.dinner || '');
  if (dinner !== '중단' && dinner !== '일반 석식') err('dinner', '석식을 골라 주세요(중단 또는 일반 석식으로). 기본값이 없습니다.');
  var reason = String(input.reason === undefined || input.reason === null ? '' : input.reason).trim();
  if (reason.length > EXC_REASON_MAX) err('reason', '사유는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.');
  else if (/^2OUT\s*퇴실$/.test(reason.replace(/\s+/g, ' ')) || reason.indexOf('[2OUT]') === 0 || inoutReservedReason_(reason) || reason.indexOf(BAT_PREFIX.trim()) === 0) {
    err('reason', "'2OUT 퇴실'·'임시 퇴실'·'[일괄]'은 다른 퇴실에서 쓰는 말이라 사유로 쓸 수 없습니다. 다른 사유를 적어 주세요.");
  }
  var ex = [];
  (Array.isArray(input.excludeIds) ? input.excludeIds : []).forEach(function (x) { x = String(x || '').trim(); if (x && ex.indexOf(x) < 0) ex.push(x); });
  return { errors: errors, rec: errors.length ? null : { grade: grade, effectiveDate: eff, requestedAt: at, dinner: dinner, reason: reason || BAT_DEFAULT_REASON, doc: input.docSubmitted === true, excludeIds: ex } };
}

/** 한 번 읽어 온 시트 값 */
function batLoad_() {
  var terms = readAll_('terms');
  return { terms: terms, term: batTerm_(terms), students: readAll_('students'), enrollments: readAll_('enrollments'), changes: readAll_('status_changes'),
    cutoff: foodCutoff_(readAll_('settings', 'config')), today: today_() };
}

function batGrades_(d) {
  if (!d.term) return [];
  var enrolled = {}, out = [];
  d.enrollments.forEach(function (e) { if (e.term_id === d.term.id) enrolled[e.student_id] = true; });
  d.students.forEach(function (s) { var g = String(s.grade).trim(); if (enrolled[s.id] && /^\d+$/.test(g) && out.indexOf(g) < 0) out.push(g); });
  return out.sort(function (a, b) { return Number(a) - Number(b); });
}

/**
 * 계획(미리보기·저장 공용): 대상 → 제외 → moveBatchPlan_. 같은 입력이면 같은 결과.
 * → {term, targets:[id], plan, excluded:[id]}
 */
function batPlan_(rec, d, batchId) {
  var all = moveBatchTargets_(d.students, d.enrollments, d.changes, d.term.id, rec.grade, rec.effectiveDate);
  var targets = all.filter(function (id) { return rec.excludeIds.indexOf(id) < 0; });
  var plan = moveBatchPlan_(d.changes, targets, { effectiveDate: rec.effectiveDate, requestedAt: rec.requestedAt, dinner: rec.dinner },
    { today: d.today, cutoff: d.cutoff, terms: d.terms, batchId: batchId });
  return { term: d.term, all: all, targets: targets, plan: plan };
}

/** 긴 서명(대상·계획 전체)을 SHA-256 16진수 64자로 줄인다 — 180명이어도 화면과 서버 사이에 짧은 expect만 오간다(비교 방식은 같다). */
function batDigest_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
}

function batSignature_(batchId, c) {
  return batDigest_(JSON.stringify({ b: batchId, t: c.targets.slice().sort(),
    p: c.plan.plans.map(function (p) { return [p.studentId, p.type, p.rows.map(function (r) { return [r.item, r.value, r.effective_date, r.source]; }), p.toCancel.map(function (x) { return x.id; }).sort(), p.toRestore.map(function (x) { return x.id; }).sort()]; }),
    s: c.plan.skipped.map(function (x) { return [x.studentId, x.reason]; }) }));
}

function batExpect_(batchId, sig) { return JSON.stringify({ b: batchId, s: sig }); }
function batParseExpect_(expect) {
  try { var o = JSON.parse(String(expect || '')); if (o && /^[0-9a-fA-F-]{8,64}$/.test(String(o.b || '')) && /^[0-9a-f]{64}$/.test(String(o.s || ''))) return o; } catch (e) { /* 아래 */ }
  return null;
}

/** 미리보기 응답용 보기(이름은 관리자에게만 나가는 화면 — 이 함수들이 batch.leave 관리자 전용) */
function batView_(c, d) {
  var byId = {};
  d.students.forEach(function (s) { byId[s.id] = s; });
  var planOf = {};
  c.plan.plans.forEach(function (p) { planOf[p.studentId] = p; });
  var list = c.all.map(function (id) {
    var s = byId[id] || {}, p = planOf[id];
    return { id: id, label: batLabel_(s), classNo: String(s.class_no), number: s.number, type: p ? p.type : '', dorm: !!p && p.type === '학사 및 기숙사 퇴실', excluded: c.targets.indexOf(id) < 0, skipped: '' };
  });
  c.plan.skipped.forEach(function (x) { var row = list.filter(function (l) { return l.id === x.studentId; })[0]; if (row) row.skipped = inoutKo_(x.reason); });
  var warnings = [];
  c.plan.plans.forEach(function (p) { p.warnings.forEach(function (w) { w = inoutKo_(w); if (warnings.indexOf(w) < 0) warnings.push(w); }); });
  var first = c.plan.plans[0], summary = first ? first.summary : null;
  return { list: list, skipped: c.plan.skipped.map(function (x) { return { studentId: x.studentId, label: batLabel_(byId[x.studentId] || {}), reason: inoutKo_(x.reason) }; }),
    warnings: warnings, count: c.plan.plans.length, dormCount: c.plan.plans.filter(function (p) { return p.type === '학사 및 기숙사 퇴실'; }).length,
    dinnerFrom: summary && summary.dinner ? summary.dinner.from : '', breakfastFrom: summary && summary.breakfast ? summary.breakfast.from : '' };
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/** 입력 화면 시작값: 학년별 사람 수(그 학년·오늘 기준 학사 입실)·기간·기본 퇴실일. */
function getBatchLeaveContext() {
  requirePermission_('batch.leave');
  var d = batLoad_();
  if (!d.term) throw new Error('운영 기간이 없습니다.');
  var grades = batGrades_(d).map(function (g) {
    var ids = moveBatchTargets_(d.students, d.enrollments, d.changes, d.term.id, g, d.today);
    var dorm = ids.filter(function (id) { return statusOn_(d.changes, id, '기숙사', d.today) === '입실'; }).length;
    return { grade: g, count: ids.length, dormCount: dorm };
  });
  return { today: d.today, now: nowIso_(), term: { id: d.term.id, name: d.term.name, start_date: d.term.start_date, end_date: d.term.end_date }, grades: grades };
}

/** 저장 전 확인: 대상 목록·빠지는 학생과 사유·경고. 아무것도 쓰지 않는다. expect에 batchId와 서명이 들어 있다. */
function previewBatchLeave(input) {
  requirePermission_('batch.leave');
  var d = batLoad_();
  if (!d.term) return { ok: false, errors: [{ field: '', message: '운영 기간이 없습니다.' }] };
  var v = batValidate_(input, { grades: batGrades_(d), term: d.term, now: nowIso_() });
  if (v.errors.length) return { ok: false, errors: v.errors };
  var batchId = Utilities.getUuid();
  var c = batPlan_(v.rec, d, batchId);
  var view = batView_(c, d);
  var lines = [], first = c.plan.plans[0];
  if (first) {
    lines.push(c.plan.plans.length + '명이 ' + foodDateKo_(v.rec.effectiveDate) + '부터 학사 퇴실이 됩니다.');
    if (view.dormCount) lines.push('기숙사생 ' + view.dormCount + '명은 학사 및 기숙사 퇴실로 기록됩니다.');
    lines.push('일괄 퇴실도 자진 퇴실이라 다시 들어오는 것이 막힙니다(결정 77).');
  }
  return { ok: !!first, errors: first ? [] : [{ field: 'grade', message: '이 학년에는 퇴실시킬 학생이 없습니다(퇴실일에 학사 입실 상태인 학생 0명).' }],
    batchId: batchId, count: view.count, dormCount: view.dormCount, list: view.list, skipped: view.skipped, warnings: view.warnings, lines: lines,
    lead: first ? v.rec.grade + '학년 ' + view.count + '명 일괄 퇴실' : '', expect: batExpect_(batchId, batSignature_(batchId, c)) };
}

/**
 * 학년 일괄 퇴실 저장. 락 안에서 다시 읽고 같은 batchId·같은 입력으로 다시 계획해 서명이 같을 때만 쓴다(아니면 {stale:true}).
 * 같은 batchId가 이미 저장돼 있으면 {ok:true, duplicate:true}. → {ok:true, batchId, count, skipped} | {ok:false, errors} | {stale:true}
 */
function saveBatchLeave(input, expect) {
  var user = requirePermission_('batch.leave');
  var ex = batParseExpect_(expect);
  if (!ex) return { ok: false, stale: true, error: '확인한 뒤 다시 저장해 주세요. 미리보기부터 다시 해 주세요.' };
  return withLock_(function () {
    ['terms', 'students', 'enrollments', 'status_changes'].forEach(function (n) { invalidate_('db', n); });
    invalidate_('config', 'settings');
    var d = batLoad_();
    if (!d.term) return { ok: false, errors: [{ field: '', message: '운영 기간이 없습니다.' }] };
    var dup = d.changes.filter(function (c) { return String(c.memo || '').indexOf(BAT_PREFIX + ex.b) === 0 && c.source === 'F6' && !String(c.linked_change_id || ''); });
    if (dup.length) return { ok: true, duplicate: true, batchId: ex.b, count: dup.filter(function (c) { return String(c.status || '유효') === '유효'; }).length };
    var v = batValidate_(input, { grades: batGrades_(d), term: d.term, now: nowIso_() });
    if (v.errors.length) return { ok: false, errors: v.errors };
    var c = batPlan_(v.rec, d, ex.b);
    if (!c.plan.plans.length) return { ok: false, errors: [{ field: 'grade', message: '퇴실시킬 학생이 없습니다. 다시 미리보기를 해 주세요.' }] };
    if (batSignature_(ex.b, c) !== ex.s) return { ok: false, stale: true, error: '확인한 뒤 다른 변경이 있었습니다. 미리보기부터 다시 해 주세요.' };
    var rows = [], patches = [];
    c.plan.plans.forEach(function (p) {
      var headId = Utilities.getUuid(), h = p.rows[0];
      rows.push({ id: headId, student_id: p.studentId, item: h.item, value: h.value, requested_at: h.requested_at, effective_date: h.effective_date, effective_date_auto: h.effective_date_auto,
        reason: v.rec.reason, doc_submitted: v.rec.doc ? 'TRUE' : 'FALSE', source: 'F6', linked_change_id: '', status: '유효', memo: h.memo, cancel_reason: '' });
      p.rows.slice(1).forEach(function (r) {
        rows.push({ id: Utilities.getUuid(), student_id: p.studentId, item: r.item, value: r.value, requested_at: r.requested_at || h.requested_at, effective_date: r.effective_date,
          effective_date_auto: r.effective_date_auto, reason: r.reason, doc_submitted: '', source: r.source, linked_change_id: headId, status: '유효', memo: '', cancel_reason: '' });
      });
      p.toCancel.forEach(function (x) {
        var why = String(x.cancel_reason || '');
        patches.push({ id: x.id, patch: { status: '취소', cancel_reason: /^\[자동\] /.test(why) ? why : '[자동] ' + headId + ' ' + (why || '일괄 퇴실로 대체') } });
      });
      p.toRestore.forEach(function (x) { patches.push({ id: x.id, patch: { status: '유효', cancel_reason: '' } }); });
    });
    bulkAppend_('status_changes', rows, user.email);
    if (patches.length) bulkUpdateRecords_('status_changes', patches, user.email);
    return { ok: true, batchId: ex.b, count: c.plan.plans.length, skipped: c.plan.skipped.length, lead: v.rec.grade + '학년 ' + c.plan.plans.length + '명 일괄 퇴실' };
  });
}

/* ───────────── 지난 일괄 퇴실 목록과 되돌리기(결정 59) ───────────── */

/** 일괄 퇴실 묶음 목록: 퇴실일·학년·살아 있는 명수·취소된 명수. 가장 최근 신청이 위. */
function listBatchLeaves() {
  requirePermission_('batch.leave');
  var d = batLoad_(), byId = {}, groups = {}, order = [];
  d.students.forEach(function (s) { byId[s.id] = s; });
  d.changes.forEach(function (c) {
    var memo = String(c.memo || '');
    if (c.source !== 'F6' || c.item !== '학사' || c.value !== '퇴실' || String(c.linked_change_id || '') || memo.indexOf(BAT_PREFIX) !== 0) return;
    var id = memo.slice(BAT_PREFIX.length).split(/\s+/)[0];
    if (!id) return;
    if (!groups[id]) { groups[id] = { batchId: id, date: String(c.effective_date), requestedAt: String(c.requested_at), live: 0, canceled: 0, grades: [] }; order.push(id); }
    var g = groups[id], st = byId[c.student_id];
    if (String(c.status || '유효') === '유효') g.live++; else g.canceled++;
    if (st && g.grades.indexOf(String(st.grade)) < 0) g.grades.push(String(st.grade));
  });
  var items = order.map(function (id) {
    var g = groups[id];
    return { batchId: id, dateKo: ymdIsValid_(g.date) ? foodDateKo_(g.date) : g.date, requestedAt: g.requestedAt, gradeText: g.grades.sort().join('·') + '학년', live: g.live, canceled: g.canceled, canUndo: g.live > 0 };
  }).sort(function (a, b) { return a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0; });
  return { items: items };
}

function batUndoCheck_(batchId) {
  var id = String(batchId || '').trim();
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) return { error: '일괄 퇴실을 찾을 수 없습니다. 목록을 새로 불러와 주세요.' };
  var d = batLoad_();
  var undo = moveBatchUndoPlan_(d.changes, id, { today: d.today });
  if (!undo.plans.length) return { error: '되돌릴 일괄 퇴실이 없습니다(이미 모두 되돌렸거나 찾을 수 없습니다). 목록을 새로 불러와 주세요.' };
  return { d: d, id: id, undo: undo };
}

function batUndoSignature_(c) {
  return batDigest_(JSON.stringify({ b: c.id, p: c.undo.plans.map(function (p) { return [p.studentId, p.headId, p.toCancel.map(function (x) { return x.id; }).sort(), p.toRestore.map(function (x) { return x.id; }).sort()]; }) }));
}

/** 되돌리기 확인: 몇 명이 되돌아가는지와 경고(재입실 기록도 함께 취소되는 학생 등). 아무것도 쓰지 않는다. */
function previewBatchUndo(batchId) {
  requirePermission_('batch.leave');
  var c = batUndoCheck_(batchId);
  if (c.error) return { ok: false, errors: [{ field: '', message: c.error }] };
  var warnings = [];
  c.undo.plans.forEach(function (p) { p.warnings.forEach(function (w) { w = inoutKoShort_(w); if (warnings.indexOf(w) < 0) warnings.push(w); }); });
  return { ok: true, errors: [], count: c.undo.plans.length, lead: '일괄 퇴실 ' + c.undo.plans.length + '명을 되돌립니다',
    lines: ['학사 입실 상태로 돌아가고 급식·자리도 퇴실 전으로 돌아갑니다.', '기록은 지우지 않고 퇴실 신청서를 취소 처리합니다.'], warnings: warnings, expect: batUndoSignature_(c) };
}

/**
 * 일괄 퇴실 되돌리기(묶음 단위, 사유 필수). 한 락 안에서 다시 읽고 다시 계획해 한 번에 쓴다. 대표 행은 입력한 사유로, 연결·정리 행은
 * '[자동] <대표 id> …'로 취소하고 되살릴 행은 되살린다. expect와 다르면 {stale:true}.
 */
function undoBatchLeave(batchId, reason, expect) {
  var user = requirePermission_('batch.leave');
  var why = String(reason === undefined || reason === null ? '' : reason).trim();
  if (why.length < 2 || why.length > EXC_REASON_MAX) return { ok: false, errors: [{ field: 'reason', message: '되돌리는 사유를 2자 이상 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.' }] };
  return withLock_(function () {
    ['terms', 'students', 'enrollments', 'status_changes'].forEach(function (n) { invalidate_('db', n); });
    var c = batUndoCheck_(batchId);
    if (c.error) return { ok: false, errors: [{ field: '', message: c.error }] };
    if (String(expect || '') !== batUndoSignature_(c)) return { ok: false, stale: true, error: '확인한 뒤 다른 변경이 있었습니다. 다시 확인해 주세요.' };
    var patches = [], seen = {};
    c.undo.plans.forEach(function (p) {
      var tag = function (x) { var r = String(x.cancel_reason || ''); return /^\[자동\] /.test(r) ? r : '[자동] ' + p.headId + ' ' + (r || '일괄 퇴실 되돌리기로 함께 취소'); };
      seen[p.headId] = true;
      patches.push({ id: p.headId, patch: { status: '취소', cancel_reason: why } });
      p.toCancel.forEach(function (x) { if (!seen[x.id]) { seen[x.id] = true; patches.push({ id: x.id, patch: { status: '취소', cancel_reason: tag(x) } }); } });
      p.toRestore.forEach(function (x) { if (!seen[x.id]) { seen[x.id] = true; patches.push({ id: x.id, patch: { status: '유효', cancel_reason: '' } }); } });
    });
    bulkUpdateRecords_('status_changes', patches, user.email);
    return { ok: true, count: c.undo.plans.length };
  });
}
