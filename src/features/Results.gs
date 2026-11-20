/**
 * F11 출결 결과 정리 격자(C33, 접두어 res). 규칙은 R22(AttendanceRules.gs attResultKind_·attGridCell_·attResultTotals_)가 정한다 — 칸 = 출석부 칸(resolveStudentDay_)과 같은 판정 + 그날 확정 특이사항의 결과 기호.
 * 결과는 새 탭 없이 **확정 사전 특이사항(exceptions_<기간>) 행**으로 저장한다. 미인정 유형은 지금처럼 자동 1OUT이 붙는다(vioAfterExceptionWrite_).
 *   보기: exception.view(출결 담당·관리자 전체, 학사 교사 담당 학생, 담임 자기 반) / 저장·취소: exception.confirm(관리자·출결 담당).
 *   여러 칸을 한 번에 저장한다: 락 하나, bulkAppend_ 한 번(새 결과 행), bulkUpdateRecords_ 한 번(바뀌는 행 취소), 자동 OUT 맞추기 한 번, 메일은 받는 사람(이메일)마다 한 통(결정 2).
 * 총괄 답(2026-11-17) ASSUMPTION:
 *   - 묶음: 같은 학생·같은 날 = 한 묶음(group_id 하나, 하루 1OUT), 날짜가 다르면 다른 묶음.
 *   - 대체: 결과는 그날 블록이 겹치는 기존 특이사항(사전 특이사항·이전 결과)을 대체한다 — 그 날짜 행만 취소 + 결과 새 행(cancel_reason '결과 정리에서 바꿈'). 겹치지 않는 부분 특이사항(학원 20:00-22:00 등)은 둘 다 둔다.
 *   - 끝난 기간: 종료 후 RES_GRACE_DAYS(14)일까지는 저장·취소할 수 있고 그 뒤는 읽기만 한다(미리보기에 '끝난 기간 정리' 안내). 오늘 이후 날짜는 입력하지 않는다.
 *   - 유형 선택지: 결석 = 병결·미인정결석, 지각 = 병지각·미인정지각, 조퇴 = 병조퇴·미인정조퇴 + 가정사유(덮는 블록으로 결석·지각·조퇴, 결정 81). '기타'는 없다. 대응은 attResultKind_가 정한다.
 *   - 시간 기본: 결석 전체, 지각 첫 블록, 조퇴 마지막 블록.
 * 응답에는 학생 이름·번호(화면용 표기)와 유형·사유만 있다. 이메일·전화는 없다.
 */
var RES_GRACE_DAYS = 14;
var RES_MAX_CELLS = 500;
var RES_MAX_RANGE_DAYS = 62;
var RES_KINDS = ['결석', '지각', '조퇴'];
var RES_AUTO_REASON = '결과 정리에서 바꿈';
var RES_MARK = { '결석': '×', '지각': '△', '조퇴': '조' };

/* ───────────── 순수 도우미 ───────────── */

/** 결과 종류별 유형 선택지(순수): R22 attResultChoices_(병○○·미인정○○) + 가정사유(덮는 블록으로 종류가 정해지는 인정 사유, 시안 D12). '기타'·학원·프로그램은 없다. → {결석:[{type, recognized}], …} */
function resOptions_(types) {
  var out = { '결석': [], '지각': [], '조퇴': [] };
  attResultChoices_(types).forEach(function (c) { out[c.kind].push({ type: c.type, recognized: c.recognized }); });
  (types || []).forEach(function (t) {
    if (attTypeBase_(t) === '가정사유') RES_KINDS.forEach(function (kind) { out[kind].push({ type: String(t), recognized: true }); });
  });
  return out;
}

/** 이 행이 결과 화면에서 다루는 행인가(결과 유형 또는 가정사유) — 학원·프로그램 같은 사전 특이사항은 결과 취소가 건드리지 않는다 */
function resOwnType_(type) { return !!attResultKind_(type) || attTypeBase_(type) === '가정사유'; }

/** 종류별 기본 시간 표기(순수): 결석 ALL, 지각 첫 블록, 조퇴 마지막 블록. blocks = resolveDayPlan_ 블록 */
function resDefaultBlocks_(kind, blocks) {
  if (kind === '결석' || !blocks || !blocks.length) return 'ALL';
  var b = kind === '지각' ? blocks[0] : blocks[blocks.length - 1];
  return b.start + '-' + b.end;
}

/**
 * 한 칸 입력 검사(순수). cell = {studentId, date, kind, type, blocks, reason}, ctx = {plan, options, today, term}
 * → {errors:[{field,message}], rec:{type, blocks, reason, kind}}
 */
function resValidateCell_(cell, ctx) {
  var errors = [];
  var add = function (field, message) { errors.push({ field: field, message: message }); };
  var kind = String(cell.kind || '').trim();
  if (RES_KINDS.indexOf(kind) < 0) add('kind', '결석·지각·조퇴 중에서 골라 주세요.');
  var type = String(cell.type || '').trim();
  var list = ctx.options[kind] || [];
  if (!type) add('type', '유형을 골라 주세요.');
  else if (!list.some(function (o) { return o.type === type; })) add('type', '이 결과에 쓸 수 없는 유형입니다. 목록에서 골라 주세요.');
  var spec = String(cell.blocks || '').trim() || resDefaultBlocks_(kind, ctx.plan.blocks);
  var parsed = parseBlockSpec_(spec);
  if (parsed.errors.length) add('blocks', '시간을 다시 골라 주세요. ' + parsed.errors[0]);
  var reason = String(cell.reason || '').trim();
  if (reason.length > EXC_REASON_MAX) add('reason', '사유는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.');
  if (!errors.length) {
    var k = attResultKind_(type);
    var real = k ? k.kind : attResultByBlocks_(spec, ctx.plan.blocks);   // 결과 유형은 그 종류, 가정사유는 덮는 블록으로
    if (real !== kind) add('blocks', kind === '결석' ? '결석은 그날 시간 전체를 골라 주세요.' : kind === '지각' ? '지각은 첫 시간부터 늦은 시간까지(마지막은 빼고) 골라 주세요.' : '조퇴는 마지막 시간부터 일찍 간 시간까지(첫 시간은 빼고) 골라 주세요.');
  }
  return { errors: errors, rec: { type: type, blocks: parsed.errors.length ? '' : (parsed.all ? 'ALL' : formatBlockSpec_(parsed)), reason: reason, kind: kind } };
}

/**
 * 받는 사람마다 한 통으로 모은다(순수, 총괄 결정): mails = [{to:[이메일], body}] → [{to:[이메일 하나], body}].
 * 이메일(사람) 단위로 그 사람이 받을 본문을 모두 모은다 — 두 반 학생을 맡은 담당교사도 저장 한 번에 한 통. 이메일은 대소문자·앞뒤 공백을 무시하고 같은 본문은 한 번만 넣는다. 순서는 처음 나온 차례.
 */
function resMergeMails_(mails) {
  var by = {}, order = [];
  (mails || []).forEach(function (m) {
    (m.to || []).forEach(function (raw) {
      var e = String(raw || '').trim().toLowerCase();
      if (!e) return;
      if (!by[e]) { by[e] = []; order.push(e); }
      var body = String(m.body || '');
      if (by[e].indexOf(body) < 0) by[e].push(body);
    });
  });
  return order.map(function (e) {
    var bodies = by[e];
    return { to: [e], body: (bodies.length > 1 ? '결과 정리로 OUT ' + bodies.length + '건이 자동 기록되었습니다.\n\n' : '') + bodies.join('\n\n') };
  });
}

/** 종료 뒤 허용 날짜(순수): term.end_date + RES_GRACE_DAYS 이전이면 true */
function resEditable_(term, today) {
  return !!term && today <= ymdAddDays_(term.end_date, RES_GRACE_DAYS);   // attGridWritable_와 같은 14일(RES_GRACE_DAYS)
}

/* ───────────── 읽기 ───────────── */

/** 범위(from~to)를 그 기간으로 맞춘다: {term, from, to, dates} 또는 {error} */
function resRange_(terms, from, to, maxDays) {
  maxDays = maxDays || RES_MAX_RANGE_DAYS;
  from = String(from || '').trim(); to = String(to || '').trim() || from;
  if (!ymdIsValid_(from) || !ymdIsValid_(to)) return { error: '날짜를 골라 주세요.' };
  if (to < from) return { error: '끝 날짜가 시작 날짜보다 앞입니다.' };
  if (ymdDiffDays_(from, to) + 1 > maxDays) return { error: '한 번에 ' + maxDays + '일까지 볼 수 있습니다.' };
  var term = termOnDate_(from, terms) || termOnDate_(to, terms);   // 주·달이 기간 경계에 걸리면 걸친 쪽 기간으로 자른다
  if (!term) return { error: '이 날짜는 어떤 운영 기간에도 속하지 않습니다.' };
  if (from < term.start_date) from = term.start_date;
  var end = to > term.end_date ? term.end_date : to;
  return { term: term, from: from, to: end, dates: ymdRange_(from, end, maxDays) };
}

function resLoad_(user, from, to, opts) {
  opts = opts || {};
  var terms = readAll_('terms'), r = resRange_(terms, from, to, opts.maxDays);
  if (r.error) return r;
  var settingRows = readAll_('settings', 'config');
  var students = readAll_('students'), enrollments = readAll_('enrollments');
  var visible = excVisibleIds_(user, enrollments, students, r.term.id, false);
  var tab = excRows_(r.term).rows;
  var ctx = {
    term: r.term, from: r.from, to: r.to, dates: r.dates, terms: terms, settingRows: settingRows, exSettings: excSettings_(settingRows), shSettings: sheetSettings_(settingRows),
    students: students, enrollments: enrollments, visible: visible, rows: tab, today: today_(),
    daySchedules: readAll_('day_schedules'), blocks: readAll_('blocks'), defaults: calDefaults_(settingRows), changes: readAll_('status_changes')
  };
  ctx.plans = {};
  r.dates.forEach(function (d) {
    ctx.plans[d] = resolveDayPlan_(d, { termType: calTermTypeOn_(terms, d), daySchedule: pickDaySchedule_(ctx.daySchedules, d), blocks: ctx.blocks, defaults: ctx.defaults });
  });
  if (!opts.noFixed) ctx.fixed = readAll_('fixed_schedules');
  return ctx;
}

/** 이 기간 등록 학생(보이는 학생만) 정렬 목록 */
function resStudents_(ctx) {
  var enr = {};
  ctx.enrollments.forEach(function (e) { if (e.term_id === ctx.term.id && !enr[e.student_id]) enr[e.student_id] = e; });
  return ctx.students.filter(function (s) { return ctx.visible[s.id] && enr[s.id]; })
    .sort(function (a, b) { return (+a.grade - +b.grade) || (+a.class_no - +b.class_no) || (+a.number - +b.number) || String(a.student_no).localeCompare(String(b.student_no)); })
    .map(function (s) { return { raw: s, enr: enr[s.id], view: { id: s.id, name: s.name, grade: +s.grade, classNo: s.class_no, number: s.number, label: s.grade + '. ' + s.name } }; });
}

function resRowsByStudent_(rows) {
  var by = Object.create(null);
  rows.forEach(function (r) { (by[r.student_id] = by[r.student_id] || []).push(r); });
  return by;
}

/** 범위 token: 그 범위 날짜의 살아 있는 특이사항 행 id|updated_at 해시(저장 때 락 안에서 다시 계산해 비교) */
function resToken_(ctx) {
  var from = ctx.from, to = ctx.to;
  return dtyHash_(ctx.rows.filter(function (r) { var d = String(r.date); return d >= from && d <= to && String(r.status || '').trim() !== '취소'; })
    .map(function (r) { return r.id + '|' + (r.updated_at || ''); }).sort().join(';'));
}

/** 한 칸(순수 조합): attGridCell_ 결과 */
function resCell_(ctx, student, exRows, fixedRows, date) {
  return attGridCell_(ctx.plans[date], { exceptions: exRows, fixedRows: effectiveFixedRows_(fixedRows, student.raw.id, date), endType: student.enr.end_type || '' },
    { endTypeDayTypes: ctx.shSettings.endTypeDayTypes, endTime: '23:00', typeShort: ctx.shSettings.typeShort, endLabel: ctx.shSettings.endLabel });
}

/** 학생 목록의 학년·반 선택지 [{grade, classNo, count, label}] */
function resClasses_(list) {
  var by = {}, order = [];
  list.forEach(function (s) {
    var k = s.view.grade + '-' + s.view.classNo;
    if (!by[k]) { by[k] = { grade: s.view.grade, classNo: s.view.classNo, count: 0, label: s.view.grade + '학년 ' + s.view.classNo + '반' }; order.push(k); }
    by[k].count++;
  });
  return order.map(function (k) { return by[k]; });
}

function resFilter_(list, filter) {
  filter = filter || {};
  var classes = resClasses_(list);
  var g = filter.grade === undefined || filter.grade === null || filter.grade === '' ? null : Number(filter.grade), c = String(filter.classNo === undefined || filter.classNo === null ? '' : filter.classNo);
  var pick = classes.filter(function (x) { return x.grade === g && String(x.classNo) === c; })[0] || null;
  if (!pick && classes.length && (filter.all !== true)) pick = classes[0];   // 180명을 한 번에 그리지 않는다: 첫 반이 기본
  var shown = pick ? list.filter(function (s) { return s.view.grade === pick.grade && String(s.view.classNo) === String(pick.classNo); }) : list;
  return { classes: classes, pick: pick, shown: shown };
}

/**
 * 결과 격자(주·월). filter = {from, to, grade, classNo}. 보기는 exception.view(보이는 학생은 excVisibleIds_ 범위).
 * → {ok, term, from, to, dates:[{date, weekdayKo, operating}], classes, pick, students:[view], cells:{학생id:{날짜:[사전 글자, 결과 기호, 미인정 1|0]}}, resultCount, token, canEdit, editable, ...}
 */
function getResultGrid(filter) {
  var user = requirePermission_('exception.view');
  filter = filter || {};
  var ctx = resLoad_(user, filter.from, filter.to);
  if (ctx.error) return { ok: false, error: ctx.error };
  var all = resStudents_(ctx), f = resFilter_(all, filter);
  var exBy = resRowsByStudent_(ctx.rows), fixedBy = resRowsByStudent_(ctx.fixed || []);
  var cells = {}, resultCount = 0;
  f.shown.forEach(function (s) {
    var rowsOf = exBy[s.raw.id] || [], mine = {};
    ctx.dates.forEach(function (d) {
      if (!ctx.plans[d].operating) return;
      var cell = resCell_(ctx, s, rowsOf, fixedBy[s.raw.id] || [], d);
      var pre = [];
      cell.marks.forEach(function (m) { if (m.code !== 'NONE' && m.text && pre.indexOf(m.text) < 0) pre.push(m.text); });
      var res = cell.results.map(function (x) { return x.mark; }).join('');
      if (!pre.length && !res) return;
      if (res) resultCount += cell.results.length;
      mine[d] = [pre.join('·'), res, cell.results.some(function (x) { return !x.recognized; }) ? 1 : 0];
    });
    cells[s.raw.id] = mine;
  });
  return {
    ok: true, term: { id: ctx.term.id, name: ctx.term.name }, termStart: ctx.term.start_date, termEnd: ctx.term.end_date, from: ctx.from, to: ctx.to, today: ctx.today,
    dates: ctx.dates.map(function (d) { return { date: d, weekdayKo: ymdWeekdayKo_(d), operating: ctx.plans[d].operating }; }),
    classes: f.classes, pick: f.pick, students: f.shown.map(function (s) { return s.view; }), cells: cells, resultCount: resultCount,
    token: resToken_(ctx), canEdit: hasAnyAllowedRole_(user.roles, permissions_()['exception.confirm'].roles), editable: resEditable_(ctx.term, ctx.today),
    editUntil: ymdAddDays_(ctx.term.end_date, RES_GRACE_DAYS)
  };
}

/** 칸 상세(시트용): 블록·기존 특이사항·결과·고를 수 있는 유형·기본 시간 */
function getResultCell(studentId, date) {
  var user = requirePermission_('exception.view');
  var ctx = resLoad_(user, date, date);
  if (ctx.error) return { ok: false, error: ctx.error };
  var s = resStudents_(ctx).filter(function (x) { return x.raw.id === String(studentId || ''); })[0];
  if (!s) excDenied_(user, 'exception.view', '범위 밖 학생 ' + String(studentId || ''));
  var plan = ctx.plans[date];
  var rowsOf = (resRowsByStudent_(ctx.rows)[s.raw.id] || []).filter(function (r) { return String(r.date) === date && String(r.status || '').trim() !== '취소'; });
  var cell = resCell_(ctx, s, rowsOf, resRowsByStudent_(ctx.fixed || [])[s.raw.id] || [], date);
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = u.name; });
  var options = resOptions_(ctx.exSettings.types);
  var defaults = {};
  RES_KINDS.forEach(function (k) { defaults[k] = resDefaultBlocks_(k, plan.blocks); });
  return {
    ok: true, student: s.view, date: date, weekdayKo: ymdWeekdayKo_(date), operating: plan.operating,
    blocks: plan.blocks.map(function (b) { return { seq: b.seq, start: b.start, end: b.end, label: b.label }; }),
    rows: rowsOf.map(function (r) {
      var k = attResultKind_(r.type), byBlocks = attResultByBlocks_(r.blocks, plan.blocks), own = resOwnType_(r.type);
      return { id: r.id, type: r.type, short: ctx.exSettings.typeShort[r.type] || '', blocks: r.blocks, blocksText: excBlocksText_(r.blocks), status: r.status, reason: r.reason || '',
        kind: own ? (k ? k.kind : byBlocks) : '', counts: byBlocks, recognized: k ? k.recognized : true, by: names[normalizeEmail_(r.confirmed_by || r.requested_by)] || '' };
    }),
    marks: cell.marks, results: cell.results.map(function (x) { return { kind: x.kind, mark: x.mark, recognized: x.recognized, types: x.types }; }),
    options: options, defaults: defaults, autoOut: ctx.exSettings.autoOut, warnings: cell.warnings,
    canEdit: hasAnyAllowedRole_(user.roles, permissions_()['exception.confirm'].roles), editable: resEditable_(ctx.term, ctx.today), token: resToken_(ctx)
  };
}

/* ───────────── 저장 계획 ───────────── */

/**
 * 저장 계획(쓰지 않는다): payload = {range:{from,to}, cells:[{studentId, date, kind, type, blocks, reason}]}.
 * → {ok:false, errors:[{index, field, message}]} 또는 {ok, ctx, items:[{index, student, date, rec}], toCancel:[{id, date, studentId}], newRows 수, groups, warnings:[], outCount, replaced:[...], sig}
 */
function resPlan_(user, payload) {
  payload = payload || {};
  var range = payload.range || {}, cells = Array.isArray(payload.cells) ? payload.cells : [];
  if (!cells.length) return { ok: false, errors: [{ index: -1, field: '', message: '저장할 결과가 없습니다.' }] };
  if (cells.length > RES_MAX_CELLS) return { ok: false, errors: [{ index: -1, field: '', message: '한 번에 ' + RES_MAX_CELLS + '칸까지 저장할 수 있습니다. 나누어 저장해 주세요.' }] };
  var ctx = resLoad_(user, range.from, range.to, { noFixed: true });
  if (ctx.error) return { ok: false, errors: [{ index: -1, field: '', message: ctx.error }] };
  var errors = [], items = [], seen = {}, warnings = [], options = resOptions_(ctx.exSettings.types);
  var students = {}, today = ctx.today;
  resStudents_(ctx).forEach(function (s) { students[s.raw.id] = s; });
  var ended = ctx.term.end_date < today;
  cells.forEach(function (c, i) {
    var err = function (field, message) { errors.push({ index: i, field: field, message: message }); };
    c = c || {};
    var sid = String(c.studentId || ''), date = String(c.date || '').trim();
    var s = students[sid];
    if (!s) { err('studentId', '이번 운영 기간 학사생이 아니거나 볼 수 없는 학생입니다.'); return; }
    if (!ymdIsValid_(date) || !ctx.plans[date]) { err('date', '이 범위 안의 날짜가 아닙니다.'); return; }
    var w = attGridWritable_(ctx.term, date, today, RES_GRACE_DAYS);
    if (!w.ok) { err('date', w.reason); return; }
    var plan = ctx.plans[date];
    if (!plan.operating) { err('date', '그날은 자습을 운영하지 않아 결과를 넣을 수 없습니다.'); return; }
    if (statusOn_(ctx.changes, sid, '학사', date) !== '입실') { err('date', '그날은 학사 입실 상태가 아닙니다.'); return; }
    var key = sid + '|' + date + '|' + String(c.kind || '');
    if (seen[key]) { err('kind', '같은 학생·같은 날에 같은 결과가 두 번 들어 있습니다.'); return; }
    seen[key] = true;
    var v = resValidateCell_(c, { plan: plan, options: options, today: today, term: ctx.term });
    v.errors.forEach(function (e) { err(e.field, e.message); });
    if (!v.errors.length) items.push({ index: i, student: s, date: date, rec: v.rec, plan: plan });
  });
  var absent = {};
  items.forEach(function (it) { if (it.rec.kind === '결석') absent[it.student.raw.id + '|' + it.date] = true; });
  items.forEach(function (it) {
    if (it.rec.kind !== '결석' && absent[it.student.raw.id + '|' + it.date]) errors.push({ index: it.index, field: 'kind', message: '결석인 날에는 지각·조퇴를 함께 넣을 수 없습니다(결석이 우선).' });
  });
  if (errors.length) return { ok: false, errors: errors };
  // 대체: 그 학생·그 날의 살아 있는 행 중 새 결과와 블록이 겹치는 것(사전 특이사항·이전 결과)
  var cancelSet = {}, toCancel = [], replaced = [], byId = {};
  ctx.rows.forEach(function (r) { byId[r.id] = r; });
  items.forEach(function (it) {
    attResultReplaces_(ctx.rows, it.student.raw.id, it.date, it.rec.blocks).forEach(function (id) {   // R22: 그날 블록이 겹치는 살아 있는 행
      if (cancelSet[id]) return;
      var r = byId[id];
      cancelSet[id] = true; toCancel.push({ id: id, studentId: r.student_id, date: it.date });
      replaced.push({ label: it.student.view.label, date: it.date, type: r.type, wasResult: !!attResultKind_(r.type), blocks: excBlocksText_(r.blocks) });
    });
  });
  replaced.forEach(function (x) {
    warnings.push(x.wasResult ? x.label + ' ' + x.date.slice(5) + ' 이미 입력한 결과 "' + x.type + '"(' + x.blocks + ')를 새 결과로 바꿉니다.'
      : x.label + ' ' + x.date.slice(5) + ' 사전 특이사항 "' + x.type + '"(' + x.blocks + ')를 결과로 바꿉니다.');
  });
  if (ended) warnings.push('끝난 운영 기간의 기록 정리입니다. "' + ctx.term.name + '" 운영 기간은 ' + foodDateKo_(ctx.term.end_date) + '에 끝났고 ' + foodDateKo_(ymdAddDays_(ctx.term.end_date, RES_GRACE_DAYS)) + '까지 정리할 수 있습니다.');
  var groups = {}, outGroups = {};
  items.forEach(function (it) {
    var g = it.student.raw.id + '|' + it.date;
    groups[g] = true;
    if (ctx.exSettings.autoOut.indexOf(it.rec.type) >= 0) outGroups[g] = true;
  });
  var outCount = Object.keys(outGroups).length;
  if (outCount) warnings.push('미인정이라 저장하면 자동으로 1OUT이 기록됩니다(' + outCount + '건). 담당교사·담임에게 알림이 갑니다(받는 사람마다 한 통).');
  var token = resToken_(ctx);
  var sig = dtyHash_(JSON.stringify([items.map(function (it) { return [it.student.raw.id, it.date, it.rec]; }), token, toCancel.map(function (x) { return x.id; }).sort(), range.from, range.to]));
  return { ok: true, ctx: ctx, items: items, toCancel: toCancel, groupCount: Object.keys(groups).length, warnings: warnings, outCount: outCount, replaced: replaced, sig: sig, token: token, ended: ended };
}

function resPlanView_(p) {
  if (!p.ok) return { ok: false, errors: p.errors };
  return { ok: true, count: p.items.length, groupCount: p.groupCount, replaceCount: p.toCancel.length, outCount: p.outCount, warnings: p.warnings, ended: p.ended, sig: p.sig };
}

/** 저장 전 확인(쓰지 않는다): 바뀌는 칸·대체되는 특이사항·생기는 1OUT. 관리자·출결 담당 */
function previewResults(payload) {
  var user = requirePermission_('exception.confirm');
  return resPlanView_(resPlan_(user, payload));
}

/**
 * 결과 저장(여러 칸을 한 번에). 락 하나 안에서 다시 계획해 sig가 다르면 {ok:false, stale:true}. 출결 담당·관리자.
 * 같은 학생·같은 날의 결과 칸은 한 묶음(group_id)이라 하루 1OUT. 대체되는 행은 그 날짜 행만 취소한다.
 */
function saveResults(payload, sig) {
  var user = requirePermission_('exception.confirm');
  var res = withLock_(function () {
    ['terms', 'students', 'enrollments', 'status_changes', 'day_schedules', 'blocks'].forEach(function (n) { invalidate_('db', n); });
    invalidate_('config', 'settings');
    var range = (payload && payload.range) || {};
    var term0 = termOnDate_(String(range.from || ''), readAll_('terms'));
    if (term0) invalidate_('db', termSheetName_('exceptions', term0.id));
    var p = resPlan_(user, payload);
    if (!p.ok) return { ok: false, errors: p.errors };
    if (typeof sig !== 'string' || sig !== p.sig) return { ok: false, stale: true, error: STALE_MESSAGE };
    var ctx = p.ctx, sheet = termSheetName_('exceptions', ctx.term.id);
    if (excRows_(ctx.term).missing) ensureTermSheet_('exceptions', ctx.term.id);
    var now = nowIso_();
    var since = vioAutoSince_(ctx.exSettings.autoOut, now);   // 쓰기 전에, confirmed_at에 쓰는 바로 그 now로
    var groupIds = [];
    var rows = p.items.map(function (it) {
      var gid = attResultGroupId_(it.student.raw.id, it.date);   // R22: 같은 학생·같은 날 = 한 묶음
      if (groupIds.indexOf(gid) < 0) groupIds.push(gid);
      return { term_id: ctx.term.id, group_id: gid, student_id: it.student.raw.id, date: it.date, blocks: it.rec.blocks, type: it.rec.type,
        reason: it.rec.reason, status: '확정', requested_by: user.email, requested_at: now, confirmed_by: user.email, confirmed_at: now, cancel_reason: '' };
    });
    if (p.toCancel.length) bulkUpdateRecords_(sheet, p.toCancel.map(function (x) { return { id: x.id, patch: { status: '취소', cancel_reason: RES_AUTO_REASON } }; }), user.email);
    bulkAppend_(sheet, rows, user.email);
    var studentIds = [];
    p.items.forEach(function (it) { if (studentIds.indexOf(it.student.raw.id) < 0) studentIds.push(it.student.raw.id); });
    p.toCancel.forEach(function (x) { if (studentIds.indexOf(x.studentId) < 0) studentIds.push(x.studentId); });
    var auto = vioAfterExceptionWrite_(ctx.term, studentIds, user.email, since, groupIds);
    writeAudit_(sheet, '', 'result:save', null, null, user.email, 'db', p.items.length + '칸 저장(대체 ' + p.toCancel.length + '건, 자동 OUT ' + p.outCount + '건 예정) ' + ctx.from + '~' + ctx.to);
    return { ok: true, count: rows.length, replaced: p.toCancel.length, groupCount: p.groupCount, out: auto.out, _mails: resMergeMails_(auto.mails) };
  });
  return excFinishAuto_(res, user);
}

/**
 * 입력한 결과 취소(한 학생·한 날·한 결과 종류). input = {studentId, date, kind, reason, range:{from,to}, token}. 사유 2자 이상, 자동 1OUT도 함께 취소(vioAfterExceptionWrite_).
 */
function cancelResult(input) {
  var user = requirePermission_('exception.confirm');
  input = input || {};
  var res = withLock_(function () {
    ['terms', 'students', 'enrollments', 'day_schedules', 'blocks'].forEach(function (n) { invalidate_('db', n); });
    var date = String(input.date || '').trim(), range = input.range || { from: date, to: date };
    var term0 = termOnDate_(date, readAll_('terms'));
    if (term0) invalidate_('db', termSheetName_('exceptions', term0.id));
    var ctx = resLoad_(user, range.from, range.to, { noFixed: true });
    if (ctx.error) return { ok: false, error: ctx.error };
    if (!ctx.plans[date]) return { ok: false, error: '이 범위 안의 날짜가 아닙니다.' };
    if (!resEditable_(ctx.term, ctx.today)) return { ok: false, error: '"' + ctx.term.name + '" 운영 기간이 끝난 지 ' + RES_GRACE_DAYS + '일이 지나 취소할 수 없습니다.' };
    var s = resStudents_(ctx).filter(function (x) { return x.raw.id === String(input.studentId || ''); })[0];
    if (!s) return { ok: false, error: '볼 수 없는 학생입니다.' };
    if (typeof input.token !== 'string' || input.token !== resToken_(ctx)) return { ok: false, stale: true, error: STALE_MESSAGE };
    var why = String(input.reason || '').trim(), kind = String(input.kind || '');
    if (RES_KINDS.indexOf(kind) < 0) return { ok: false, errors: [{ field: 'kind', message: '취소할 결과(결석·지각·조퇴)를 골라 주세요.' }] };
    if (why.length < EXC_CANCEL_REASON_MIN) return { ok: false, errors: [{ field: 'reason', message: '취소 사유를 ' + EXC_CANCEL_REASON_MIN + '자 이상 적어 주세요.' }] };
    if (why.length > EXC_REASON_MAX) return { ok: false, errors: [{ field: 'reason', message: '취소 사유는 ' + EXC_REASON_MAX + '자 안으로 적어 주세요.' }] };
    var rowsOf = (resRowsByStudent_(ctx.rows)[s.raw.id] || []).filter(function (r) { return String(r.date) === date && String(r.status).trim() === '확정'; });
    var cell = attGridCell_(ctx.plans[date], { exceptions: rowsOf }, {});
    var hit = cell.results.filter(function (x) { return x.kind === kind; })[0];
    if (!hit) return { ok: false, stale: true, error: '이미 취소됐거나 없는 결과입니다. 새로 불러와 주세요.' };
    var sheet = termSheetName_('exceptions', ctx.term.id);
    var typeOf = {};
    rowsOf.forEach(function (r) { typeOf[r.id] = r.type; });
    var ids = hit.exceptionIds.filter(function (id) { return resOwnType_(typeOf[id]); });   // 학원·프로그램 같은 사전 특이사항은 여기서 취소하지 않는다
    if (!ids.length) return { ok: false, errors: [{ field: 'kind', message: '이 기록(' + kind + ')은 결과 화면에서 넣은 것이 아니라 여기서 취소할 수 없습니다. 사전 특이사항 화면에서 고쳐 주세요.' }] };
    var since = vioAutoSince_(ctx.exSettings.autoOut, nowIso_());
    bulkUpdateRecords_(sheet, ids.map(function (id) { return { id: id, patch: { status: '취소', cancel_reason: why } }; }), user.email);
    var auto = vioAfterExceptionWrite_(ctx.term, [s.raw.id], user.email, since);
    writeAudit_(sheet, '', 'result:cancel', null, null, user.email, 'db', s.view.label + ' ' + date + ' ' + kind + ' 취소(' + ids.length + '행)');
    return { ok: true, count: ids.length, out: auto.out, _mails: resMergeMails_(auto.mails) };
  });
  return excFinishAuto_(res, user);
}

/* ───────────── 학생별 누적 ───────────── */

/**
 * 학생별 누적(결석·지각·조퇴 × 인정·미인정). filter = {from, to, grade, classNo}. 범위 [이 주 | 이번 달 | 학기]는 화면이 from·to로 보낸다.
 * 칸마다 종류당 1(R22). 결과가 있는 (학생, 날짜)만 계산한다(결과는 확정 특이사항에서만 나온다).
 */
function getResultTotals(filter) {
  var user = requirePermission_('exception.view');
  filter = filter || {};
  var ctx = resLoad_(user, filter.from, filter.to, { maxDays: 400 });
  if (ctx.error) return { ok: false, error: ctx.error };
  var all = resStudents_(ctx), f = resFilter_(all, filter);
  var exBy = resRowsByStudent_(ctx.rows), fixedBy = resRowsByStudent_(ctx.fixed || []);
  var rows = f.shown.map(function (s) {
    var rowsOf = (exBy[s.raw.id] || []).filter(function (r) { var d = String(r.date); return d >= ctx.from && d <= ctx.to; });
    var cells = [];
    ctx.dates.forEach(function (d) {   // 학습량은 운영한 날 전부(입실 중인 날만)에서 센다
      if (!ctx.plans[d].operating || statusOn_(ctx.changes, s.raw.id, '학사', d) !== '입실') return;
      cells.push(resCell_(ctx, s, rowsOf.filter(function (r) { return String(r.date) === d; }), fixedBy[s.raw.id] || [], d));
    });
    return { student: s.view, total: attResultTotals_(cells) };
  });
  var sum = { '결석': { '인정': 0, '미인정': 0 }, '지각': { '인정': 0, '미인정': 0 }, '조퇴': { '인정': 0, '미인정': 0 }, '학습량': { days: 0, minutes: 0, studiedMinutes: 0, missedMinutes: {} } };
  rows.forEach(function (r) {
    RES_KINDS.forEach(function (k) { sum[k]['인정'] += r.total[k]['인정']; sum[k]['미인정'] += r.total[k]['미인정']; });
    var st = r.total['학습량'];
    sum['학습량'].minutes += st.minutes; sum['학습량'].studiedMinutes += st.studiedMinutes;
    Object.keys(st.missedMinutes).forEach(function (t) { sum['학습량'].missedMinutes[t] = (sum['학습량'].missedMinutes[t] || 0) + st.missedMinutes[t]; });
  });
  return { ok: true, term: { id: ctx.term.id, name: ctx.term.name }, termStart: ctx.term.start_date, termEnd: ctx.term.end_date, from: ctx.from, to: ctx.to, classes: f.classes, pick: f.pick, rows: rows, sum: sum };
}

/** 한 학생의 결과 기록 목록(누적 표에서 학생 줄을 펼칠 때): 날짜·결과·유형·사유·입력자·자동 1OUT 연결 여부 */
function getResultRecords(studentId, from, to) {
  var user = requirePermission_('exception.view');
  var ctx = resLoad_(user, from, to, { noFixed: true, maxDays: 400 });
  if (ctx.error) return { ok: false, error: ctx.error };
  var s = resStudents_(ctx).filter(function (x) { return x.raw.id === String(studentId || ''); })[0];
  if (!s) excDenied_(user, 'exception.view', '범위 밖 학생 ' + String(studentId || ''));
  var names = {};
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = u.name; });
  var liveOut = {};
  try { vioViolations_(ctx.term).forEach(function (v) { if (ruleRowLive_(v) && String(v.source) === 'F1자동') liveOut[String(v.source_exception_id)] = true; }); } catch (e) { liveOut = {}; }
  var byDate = {};
  ctx.rows.forEach(function (r) {
    var d = String(r.date);
    if (r.student_id !== s.raw.id || d < ctx.from || d > ctx.to || String(r.status).trim() !== '확정' || !ctx.plans[d]) return;
    (byDate[d] = byDate[d] || []).push(r);
  });
  var out = [];
  Object.keys(byDate).sort().forEach(function (d) {
    var cell = attGridCell_(ctx.plans[d], { exceptions: byDate[d] }, {});
    cell.results.forEach(function (x) {
      var rs = byDate[d].filter(function (r) { return x.exceptionIds.indexOf(r.id) >= 0; });
      out.push({ date: d, weekdayKo: ymdWeekdayKo_(d), kind: x.kind, mark: x.mark, recognized: x.recognized, types: x.types, reason: rs.map(function (r) { return r.reason; }).filter(function (t) { return t; }).join(' / '),
        by: names[normalizeEmail_(rs[0].confirmed_by || rs[0].requested_by)] || '', autoOut: rs.some(function (r) { return !!liveOut[String(r.id)]; }) });
    });
  });
  return { ok: true, student: s.view, records: out };
}
