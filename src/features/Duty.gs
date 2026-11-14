/**
 * F3 근무표·교대·기록표(2단계, CODING-A). 전역 이름 접두어 dty. docs/plan/stage2.md 2절.
 * C8a: 근무표 보기(getDutyMonth)·편성(saveDutyDay)·운영 안 함(setDutyOperating)·홈 훅. 응답에 이메일을 내지 않는다(users.id·이름만).
 */

var DTY_SLOT_LABEL = { '21:30조': '21:30조', '23:00조': '23:00조', '단독': '근무', '예비': '예비 감독' };

/** 'yyyy-MM' 검사(비면 이번 달) */
function dtyMonth_(month) {
  var m = String(month || '').trim() || today_().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m) || !ymdIsValid_(m + '-01')) throw new Error('달을 yyyy-MM 형식으로 골라 주세요.');
  return m;
}

/** 근무를 설 수 있는 교사: 활성 학사 교사. [{id, name, email}] — email은 서버 안에서만 쓴다 */
function dtyTeachers_() {
  return readAll_('users').filter(function (u) {
    return isTruthy_(u.active) && parseRoles_(u.roles).indexOf('hall_teacher') >= 0;
  }).map(function (u) { return { id: u.id, name: u.name, email: normalizeEmail_(u.email) }; })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
}

/** 그날의 운영 계획(운영 여부·종료·메모). calMonthPlans_와 같은 입력으로 한 날만 푼다 */
function dtyPlan_(ymd, ctx) {
  var plan = resolveDayPlan_(ymd, {
    termType: calTermTypeOn_(ctx.terms, ymd), daySchedule: pickDaySchedule_(ctx.daySchedules, ymd), blocks: ctx.blocks, defaults: ctx.defaults
  });
  plan.date = ymd;
  return plan;
}

/** 그날 살아 있는 근무 칸 행들 */
function dtyLiveSlots_(date) {
  return readAll_('duty_slots').filter(function (r) { return ruleRowLive_(r) && String(r.date).trim() === date; });
}

/**
 * 운영 안 함으로 바꿀 때 취소될 칸의 확인(결정 54). 락 안에서 부른다.
 * 취소할 칸이 없으면 {rows:[], resp:null}. 있으면 input.confirmIds(확인창이 본 칸 id 목록)가 지금 목록과 같을 때만 {rows, resp:null},
 * 아니면(처음이거나 그 사이 칸이 바뀜) {rows, resp:{ok:false, needsConfirm:true, warnings, confirmIds}} — 낡은 확인창이 못 본 칸을 지우지 않는다.
 */
function dtyCancelCheck_(date, input) {
  var rows = dtyLiveSlots_(date);
  if (!rows.length) return { rows: rows, resp: null };
  var ids = rows.map(function (r) { return r.id; }).sort();
  var given = input && Array.isArray(input.confirmIds) ? input.confirmIds.map(String).sort() : null;
  if (given && given.join(',') === ids.join(',')) return { rows: rows, resp: null };
  var names = Object.create(null);
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = u.name; });
  var list = rows.map(function (r) {
    var e = dutyEmail_(r.actual_email) || dutyEmail_(r.original_email);
    return dtySlotLabel_(r.slot) + ' ' + (names[e] || '(등록 안 된 교사)');
  }).join(', ');
  return { rows: rows, resp: { ok: false, needsConfirm: true, confirmIds: ids,
    warnings: [list + ' 근무 칸이 취소됩니다. 다시 운영으로 켜도 되살아나지 않으니 그때 다시 편성해 주세요.'] } };
}

/** 확인을 거친 칸을 '취소'로(행은 지우지 않는다, audit에 남는다). 락 안에서 부른다. 취소한 칸 수 */
function dtyCancelSlots_(rows, actorEmail) {
  rows.forEach(function (r) { updateRecord_('duty_slots', r.id, { status: '취소' }, actorEmail); });
  return rows.length;
}

/**
 * 한 달 근무표. month 'yyyy-MM'(빈 값이면 이번 달). 이메일은 내지 않는다.
 * days[].slots[] = {slot, label, end, userId, name, swappedFrom(이름), mine, swapped}
 * emptyDays = 오늘 이후(오늘 포함) 운영하는 날 중 근무·예비 감독 칸 하나라도 빈 날 수(지난 빈 날은 근무표 담당자가 못 고치므로 세지 않고
 * 달력·주 목록의 점선으로만 남긴다), swapCount = 교대된 칸 수.
 */
function getDutyMonth(month) {
  var user = requirePermission_('duty.view');
  var m = dtyMonth_(month);
  var perms = permissions_();
  var view = dtyMonthView_(m, user);
  return {
    month: m, today: today_(),
    canEdit: hasAnyAllowedRole_(user.roles, perms['duty.edit'].roles),
    canOperate: hasAnyAllowedRole_(user.roles, perms['duty.operating'].roles),
    canEditPast: user.roles.indexOf('admin') >= 0,   // 지난 날짜의 편성·운영 여부는 관리자만(이미 근무한 기록이 수당에서 바뀌므로, 결정 54)
    teachers: view.teachers.map(function (t) { return { id: t.id, name: t.name }; }),
    days: view.days, emptyDays: view.emptyDays, swapCount: view.swapCount, warnings: view.warnings
  };
}

function dtyMonthView_(m, user) {
  var ctx = calLoadCtx_();
  var plans = calMonthPlans_(m, ctx);
  var rows = readAll_('duty_slots');
  var teachers = dtyTeachers_();
  var byEmail = Object.create(null);
  readAll_('users').forEach(function (u) { byEmail[normalizeEmail_(u.email)] = { id: u.id, name: u.name }; });
  var who = function (email) { return email ? (byEmail[email] || { id: '', name: '(등록 안 된 교사)' }) : { id: '', name: '' }; };
  var canEditSwap = user.roles.some(function (r) { return permissions_()['duty.edit'].roles.indexOf(r) >= 0; });
  var emptyDays = 0, swapCount = 0, warnings = [];
  var days = plans.map(function (p) {
    var frame = dutySlotsFor_(p), picked = dutyPick_(rows, p.date), on = dutyOn_(rows, p.date);
    warnings = warnings.concat(on.warnings);
    var slots = frame.map(function (f) {
      var r = picked.bySlot[f.slot];
      var orig = r ? dutyEmail_(r.original_email) : '', email = r ? (dutyEmail_(r.actual_email) || orig) : '';
      var from = email && orig && orig !== email ? orig : '';
      if (from) swapCount++;
      var w = who(email);
      // canSwap: 이 사람에게 [교대]/[대신 근무] 버튼을 보일지(예비 감독 줄은 보이지 않는다). 판정은 swapDuty가 다시 한다
      var canSwap = !!r && f.slot !== '예비' && dtySwapCheck_({ email: user.email, canEdit: canEditSwap, today: today_(), started: dtySlotStarted_(r, p, nowIso_()) }, r, 'x').ok;
      return { slot: f.slot, label: DTY_SLOT_LABEL[f.slot], end: f.end, userId: w.id, name: w.name, slotId: r ? r.id : '', token: dtySlotToken_(r), canSwap: canSwap,
        swappedFrom: from ? who(from).name : '', swapped: !!from, mine: !!email && email === user.email };
    });
    var open = slots.some(function (x) { return !x.name; });   // 빈 예비 감독 칸도 빈 날(시안·screens.md)
    if (p.operating && open && p.date >= today_()) emptyDays++;
    return { date: p.date, weekdayKo: p.weekdayKo, operating: p.operating, memo: p.memo, end: p.end, overridden: p.overridden, slots: slots };
  });
  return { teachers: teachers, days: days, emptyDays: emptyDays, swapCount: swapCount, warnings: warnings.filter(function (w, i, a) { return a.indexOf(w) === i; }) };
}

/**
 * 한 날 편성. input = {date, slots:{슬롯:userId|''}, acknowledge}. 근무표 담당자·관리자(duty.edit).
 * 넣은 슬롯만 바뀐다(없는 슬롯은 그대로). 비우면 그 칸 행을 '취소'. 같은 내용이면 아무것도 쓰지 않는다.
 * 같은 교사가 같은 날 두 칸이면 {ok:false, needsConfirm:true, warnings}, acknowledge:true로 다시 보내면 저장.
 * 교대된 칸은 여기서 바꾸지 못한다(교대로 처리). 운영 안 하는 날·그날 틀에 없는 슬롯·활성 학사 교사가 아닌 대상은 거부.
 */
function saveDutyDay(input) {
  var user = requirePermission_('duty.edit');
  input = input || {};
  var date = String(input.date || '').trim();
  var fail = function (field, message) { return { ok: false, errors: [{ field: field, message: message }] }; };
  if (!ymdIsValid_(date)) return fail('date', '날짜를 yyyy-MM-dd 형식으로 골라 주세요.');
  var want = input.slots && typeof input.slots === 'object' ? input.slots : {};
  if (date < today_() && user.roles.indexOf('admin') < 0) return fail('date', '지난 날짜는 바꿀 수 없습니다. 실제로 바뀐 근무는 교대로 기록해 주세요.');
  return withLock_(function () {
    ['duty_slots', 'day_schedules', 'blocks', 'users'].forEach(function (t) { invalidate_('db', t); });
    var ctx = calLoadCtx_(), plan = dtyPlan_(date, ctx);
    if (!plan.operating) return fail('date', '운영하지 않는 날에는 근무를 편성할 수 없습니다. 먼저 "운영 안 함"을 풀어 주세요.');
    var frame = dutySlotsFor_(plan), frameBy = {};
    frame.forEach(function (f) { frameBy[f.slot] = f; });
    var teachers = dtyTeachers_(), byId = Object.create(null);
    teachers.forEach(function (t) { byId[t.id] = t; });
    var rows = readAll_('duty_slots'), picked = dutyPick_(rows, date).bySlot;
    // 화면이 본 칸 상태와 지금이 같아야 한다(바꾸려는 칸마다). 다르면 다른 담당자가 먼저 바꾼 것 — 덮지 않고 다시 불러오게 한다
    var seen0 = input.expect && typeof input.expect === 'object' ? input.expect : null;
    if (!seen0) return dtyStale_();
    for (var q = 0, names0 = Object.keys(want); q < names0.length; q++) {
      if (frameBy[names0[q]] && (typeof seen0[names0[q]] !== 'string' || seen0[names0[q]] !== dtySlotToken_(picked[names0[q]]))) return dtyStale_();
    }
    var errors = [], final = {}, plan2 = [];
    Object.keys(want).forEach(function (slot) {
      if (!frameBy[slot]) { errors.push({ field: slot, message: '그날 근무 칸이 아닙니다: ' + slot }); return; }
      var id = String(want[slot] || '').trim();
      if (id && !byId[id]) errors.push({ field: slot, message: '근무를 설 수 있는 학사 교사를 목록에서 골라 주세요.' });
    });
    if (errors.length) return { ok: false, errors: errors };
    frame.forEach(function (f) {
      var r = picked[f.slot], cur = r ? (dutyEmail_(r.actual_email) || dutyEmail_(r.original_email)) : '';
      var has = Object.prototype.hasOwnProperty.call(want, f.slot);
      var next = has ? (String(want[f.slot] || '').trim() ? byId[String(want[f.slot]).trim()].email : '') : cur;
      if (has && r && dutyEmail_(r.actual_email) && dutyEmail_(r.original_email) && dutyEmail_(r.actual_email) !== dutyEmail_(r.original_email) && next !== cur) {
        errors.push({ field: f.slot, message: '교대된 칸은 편성으로 바꿀 수 없습니다. 교대 기능으로 바꿔 주세요.' });
      }
      final[f.slot] = next;
      if (has) plan2.push({ f: f, r: r, cur: cur, next: next });
    });
    if (errors.length) return { ok: false, errors: errors };
    var warnings = [], seen = {};
    frame.forEach(function (f) {
      var e = final[f.slot];
      if (!e) return;
      if (seen[e]) warnings.push(dtyNameOf_(teachers, e) + ' 선생님이 이 날 이미 ' + dtySlotLabel_(seen[e]) + '에 편성되어 있습니다.');
      else seen[e] = f.slot;
    });
    if (warnings.length && input.acknowledge !== true) return { ok: false, needsConfirm: true, warnings: warnings };
    var changed = 0;
    plan2.forEach(function (c) {
      if (!c.r && !c.next) return;
      if (c.r && c.next === c.cur) {   // 사람이 그대로면 교대 기록(original·actual·swapped)은 건드리지 않고 끝 시각만 맞춘다
        if (hmNorm_(c.r.end_time) !== c.f.end) { updateRecord_('duty_slots', c.r.id, { end_time: c.f.end }, user.email); changed++; }
        return;
      }
      if (c.r && !c.next) { updateRecord_('duty_slots', c.r.id, { status: '취소' }, user.email); changed++; return; }
      if (c.r) { updateRecord_('duty_slots', c.r.id, { original_email: c.next, actual_email: c.next, end_time: c.f.end, swapped_at: '', swapped_by: '' }, user.email); changed++; return; }
      appendRecord_('duty_slots', { date: date, slot: c.f.slot, end_time: c.f.end, original_email: c.next, actual_email: c.next,
        swapped_at: '', swapped_by: '', status: '유효', memo: '' }, user.email);
      changed++;
    });
    return { ok: true, changed: changed };
  });
}

function dtyNameOf_(teachers, email) {
  var t = teachers.filter(function (x) { return x.email === email; })[0];
  return t ? t.name : '해당';
}

/**
 * 그날 "운영 안 함" 켜고 끄기(결정 44). input = {date, operating(boolean), memo(생략하면 그대로), confirmIds}.
 * 근무표 담당자·관리자(duty.operating). day_schedules의 운영 여부·메모만 바꾼다(시각·요일 유형은 있던 값 그대로).
 * 기본과 같아지면(운영, 메모 없음, 다른 값 없음) 그날 행을 '취소'로 되돌린다.
 * 운영 안 함으로 바꾸면 그날 살아 있는 근무 칸은 '취소'로 바꾼다(행은 지우지 않고 audit에 남는다, 총괄 답).
 * 칸이 있으면 {ok:false, needsConfirm:true, warnings:['21:30조 박선생, … 근무 칸이 취소됩니다'], confirmIds}를 먼저 돌려주고,
 * 확인창이 본 칸 id 목록을 input.confirmIds로 다시 보내야 취소한다(그 사이 칸이 바뀌었으면 다시 확인). 자습 일정 화면의 saveDaySchedule도 같은 규칙.
 * 다시 운영으로 켜도 취소한 칸은 되살리지 않는다(다시 편성). 오늘보다 앞선 날짜는 관리자만 바꾼다(담당자는 거부).
 */
function setDutyOperating(input) {
  var user = requirePermission_('duty.operating');
  input = input || {};
  var date = String(input.date || '').trim();
  if (!ymdIsValid_(date)) return { ok: false, errors: [{ field: 'date', message: '날짜를 yyyy-MM-dd 형식으로 골라 주세요.' }] };
  if (typeof input.operating !== 'boolean') return { ok: false, errors: [{ field: 'operating', message: '운영 여부를 골라 주세요.' }] };
  var memoGiven = input.memo !== undefined && input.memo !== null;
  var memoIn = memoGiven ? String(input.memo).trim() : '';
  if (memoIn.length > CAL_MEMO_MAX) return { ok: false, errors: [{ field: 'memo', message: '메모는 ' + CAL_MEMO_MAX + '자 안으로 적어 주세요.' }] };
  if (date < today_() && user.roles.indexOf('admin') < 0) {
    return { ok: false, errors: [{ field: 'date', message: '지난 날짜는 바꿀 수 없습니다. 필요하면 관리자에게 알려 주세요.' }] };
  }
  return withLock_(function () {
    ['duty_slots', 'day_schedules', 'blocks', 'users'].forEach(function (t) { invalidate_('db', t); });
    var ctx = calLoadCtx_();
    var ex = pickDaySchedule_(ctx.daySchedules, date);
    var memo = memoGiven ? memoIn : (ex ? String(ex.memo || '') : '');
    var curOp = dtyPlan_(date, ctx).operating;
    // 운영 안 함이 되는(또는 이미 그런) 날에 살아 있는 칸은 취소한다. 이미 운영 안 함인 날에 남은 칸도 정리한다
    var chk = input.operating ? { rows: [], resp: null } : dtyCancelCheck_(date, input);
    if (chk.resp) return chk.resp;
    var same = curOp === input.operating && (ex ? String(ex.memo || '') : '') === memo;
    if (same && !chk.rows.length) return { ok: true, changed: false };
    var defOp = dtyPlan_(date, { terms: ctx.terms, daySchedules: [], blocks: ctx.blocks, defaults: ctx.defaults }).operating;
    var keep = ex ? { start: ex.start || '', end: ex.end || '', day_type: ex.day_type || '' } : { start: '', end: '', day_type: '' };
    var backToDefault = input.operating === defOp && !memo && !keep.start && !keep.end && !keep.day_type;
    if (!same) {
      if (ex) calCancelDay_(date, user.email);
      if (!backToDefault) {
        appendRecord_('day_schedules', { date: date, operating: input.operating ? 'TRUE' : 'FALSE', start: keep.start, end: keep.end,
          day_type: keep.day_type, memo: memo, status: '유효' }, user.email);
      }
    }
    var canceled = dtyCancelSlots_(chk.rows, user.email);
    return { ok: true, changed: !same || canceled > 0, canceledSlots: canceled };
  });
}

/* ───────────── 월말 근무 기록표(C14) ───────────── */

/** 기록표를 전부 볼 수 있는 역할(duty.record: 관리자·근무표 담당자). 그 밖(학사 교사·출결 담당)은 본인 행만 */
function dtyRecordFull_(user) {
  return hasAnyAllowedRole_(user.roles, permissions_()['duty.record'].roles);
}

/** 그 달 R8 기록 + 이름표(읽기만). → {month, rec, who(email), closedDates, lastChangedAt, plans} */
function dtyRecordData_(month) {
  var m = dtyMonth_(month);
  var rows = readAll_('duty_slots');
  var plans = calMonthPlans_(m, calLoadCtx_());
  var operatingByDate = {}, closedDates = [];
  plans.forEach(function (p) { if (!p.operating) { operatingByDate[p.date] = false; closedDates.push(p.date); } });
  var rec = dutyRecord_(rows, m, { operatingByDate: operatingByDate });
  var names = Object.create(null);
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = String(u.name || '').trim(); });
  // 사용자 목록에 없는 주소는 여러 명이어도 구분되게 번호를 붙이고, 이름이 빈 등록 사용자는 따로 적는다(이메일은 내보내지 않는다)
  var emails = [];
  var see = function (e) { if (e && emails.indexOf(e) < 0) emails.push(e); };
  rec.teachers.forEach(function (t) { see(t.email); });
  rec.standby.forEach(function (t) { see(t.email); });
  rec.swaps.forEach(function (w) { see(w.from); see(w.to); });
  var unknown = emails.filter(function (e) { return !(e in names); }), blank = emails.filter(function (e) { return (e in names) && !names[e]; });
  if (unknown.length || blank.length) rec.warnings = rec.warnings.concat(['사용자 목록에 없거나 이름이 비어 있는 선생님이 근무표에 있습니다. 근무표와 사용자 목록을 확인해 주세요.']);
  var last = '';
  rows.forEach(function (r) { if (String(r.date).slice(0, 7) === m && String(r.updated_at) > last) last = String(r.updated_at); });
  return { month: m, rec: rec, closedDates: closedDates, plans: plans,
    who: function (email) {
      if (email in names) return names[email] || '(이름 없는 교사)';
      return unknown.length > 1 ? '(등록 안 된 교사 ' + (unknown.indexOf(email) + 1) + ')' : '(등록 안 된 교사)';
    },
    lastChangedAt: last ? last.replace('T', ' ').slice(0, 16) : '' };
}

/** R8 경고의 yyyy-MM-dd를 '3월 5일(금)'로(화면·PDF 공통) */
function dtyWarnText_(w) { return String(w).replace(/\d{4}-\d{2}-\d{2}/g, function (d) { return ymdIsValid_(d) ? (+d.slice(5, 7)) + '월 ' + (+d.slice(8, 10)) + '일(' + ymdWeekdayKo_(d) + ')' : d; }); }

function dtyStamp_(iso) { return String(iso).replace('T', ' ').slice(0, 16); }

/**
 * 월말 근무 기록(수당 근거, PRD F3). 근무표 담당자·관리자(duty.record)는 교사별 전체 합계와 교대 목록, 그 밖의 근무표 보기 역할은 본인 행과 본인이 낀 교대만.
 * 합계는 R8 dutyRecord_가 센 실제 근무자 기준(원래 근무자에게는 세지 않음). 예비 지정만 된 날은 따로(standby). 금액은 계산하지 않는다(결정 47). 이메일은 내지 않는다.
 * generatedAt·lastChangedAt: 출력 뒤 근무표가 바뀌었는지 알아보라고 함께 준다.
 */
function getDutyRecord(month) {
  var user = requirePermission_('duty.view');
  var d = dtyRecordData_(month), full = dtyRecordFull_(user);
  var standbyBy = Object.create(null);
  d.rec.standby.forEach(function (s) { standbyBy[s.email] = s.count; });
  var teachers = d.rec.teachers.filter(function (t) { return full || t.email === user.email; }).map(function (t) {
    return { name: d.who(t.email), total: t.total, bySlot: t.bySlot, standby: standbyBy[t.email] || 0 };
  });
  var swaps = d.rec.swaps.filter(function (s) { return full || s.from === user.email || s.to === user.email; }).map(function (s) {
    return { date: s.date, weekdayKo: ymdWeekdayKo_(s.date), slot: s.slot, label: DTY_SLOT_LABEL[s.slot], from: d.who(s.from), to: d.who(s.to), kind: s.kind };
  });
  var out = { month: d.month, today: today_(), canFile: full, generatedAt: dtyStamp_(nowIso_()), lastChangedAt: d.lastChangedAt,
    closedDates: d.closedDates, teachers: teachers, swaps: swaps,
    warnings: full ? d.rec.warnings.map(dtyWarnText_) : [] };   // 근무표 경고는 고칠 수 있는 담당자·관리자에게만(본인 행만 보는 교사에게는 손쓸 수 없는 경고)
  if (full) out.totals = teachers.reduce(function (t, x) {
    t.total += x.total; t.standby += x.standby;
    Object.keys(x.bySlot).forEach(function (k) { t.bySlot[k] = (t.bySlot[k] || 0) + x.bySlot[k]; });
    return t;
  }, { total: 0, standby: 0, bySlot: {} });
  return out;
}

/** R8 결과 → 렌더러(printRenderDutyRecord_) 모델. 칸 = 교사별 날짜별 저장값 그대로, 예비 지정은 날짜 배열(docs/design/duty-record-model.md) */
function dtyRecordModel_(d) {
  var standbyDates = Object.create(null);
  d.rec.standby.forEach(function (s) { standbyDates[s.email] = s.dates; });
  var term = termOnDate_(d.month + '-01') || termOnDate_(d.month + '-15');
  return {
    month: d.month, title: '신한학사 근무 기록표', termName: term ? term.name : '', closedDates: d.closedDates,
    teachers: d.rec.teachers.map(function (t) {
      var cells = {};
      t.dates.forEach(function (x) { (cells[x.date] = cells[x.date] || []).push(x.slot); });
      return { name: d.who(t.email), cells: cells, standby: standbyDates[t.email] || [] };
    }),
    swaps: d.rec.swaps.map(function (s) { return { date: s.date, slot: s.slot, from: d.who(s.from), to: d.who(s.to), kind: s.kind }; }),
    generatedAt: dtyStamp_(nowIso_()), lastChangedAt: d.lastChangedAt,
    // 운영 안 하는 날의 근무 경고는 그날 근무 칸이 있으면 렌더러가 칸에서 찾아 같은 말로 적는다(중복 방지). 예비만 있는 날은 렌더러가 못 보므로 경고를 남긴다
    warnings: d.rec.warnings.filter(function (w) {
      if (w.indexOf('운영 안 하는 날의 근무 행을 셌습니다') < 0) return true;
      var date = w.slice(0, 10);
      return !d.rec.teachers.some(function (t) { return t.dates.some(function (x) { return x.date === date; }); });
    }).map(dtyWarnText_)
  };
}

/** 그 달 날짜별 근무자(엑셀 시트1 달력용): {날짜: {closed, slots:[{label, name, from}], standby:[{name, from}]}}. 교사 이름만 — 이메일·학생 이름 없음 */
function dtyRecordCalendar_(d) {
  var rows = readAll_('duty_slots'), cal = {};
  var label = function (slot) { var t = String(slot).trim(); return t === '21:30조' ? '21:30' : (t === '23:00조' ? '23:00' : (t === '단독' ? '' : t)); };
  d.plans.forEach(function (p) {
    var frame = dutySlotsFor_(p), on = dutyOn_(rows, p.date), day = { closed: !p.operating, slots: [], standby: [] };
    var by = {};
    on.duty.forEach(function (x) { by[x.slot] = x; });
    var used = {};
    frame.forEach(function (f) {
      if (f.slot === '예비') return;
      var x = by[f.slot];
      used[f.slot] = true;
      day.slots.push({ label: label(f.slot), name: x ? d.who(x.email) : '', from: x && x.swappedFrom ? d.who(x.swappedFrom) : '' });
    });
    on.duty.forEach(function (x) {   // 그날 틀 밖의 칸(운영 안 하는 날·요일 틀과 다른 칸)도 빼먹지 않는다
      if (!used[x.slot]) day.slots.push({ label: label(x.slot), name: d.who(x.email), from: x.swappedFrom ? d.who(x.swappedFrom) : '' });
    });
    on.standby.forEach(function (x) { day.standby.push({ name: d.who(x.email), from: x.swappedFrom ? d.who(x.swappedFrom) : '' }); });
    if (!day.standby.length && frame.some(function (f) { return f.slot === '예비'; })) day.standby.push({ name: '', from: '' });
    cal[p.date] = day;
  });
  return cal;
}

/**
 * 월말 근무 기록표 파일. 근무표 담당자·관리자(duty.record). 공유·Drive 저장 없이 base64로 바로 내려준다(출석부 PDF와 같음).
 * 'pdf'(기본, 임시 양식) 또는 'xlsx'(결정 67: 시트1 월별 근무표, 시트2 교사별 합계·교대 목록). xlsx는 Utilities.zip으로 직접 만든다 —
 * 권한을 더하지 않고 Drive에 임시 파일을 만들지 않는다. XML은 src/print의 순수 함수(printXlsxFiles_·printDutyRecordWorkbook_)가 만든다.
 */
function getDutyRecordFile(month, format) {
  requirePermission_('duty.record');
  var fmt = format === undefined || format === null || format === '' ? 'pdf' : (typeof format === 'string' ? format.trim().toLowerCase() : '');
  if (fmt !== 'pdf' && fmt !== 'xlsx') return { ok: false, error: '받을 수 있는 형식은 PDF와 엑셀(xlsx)입니다.' };
  var d = dtyRecordData_(month);
  var model = dtyRecordModel_(d);
  if (fmt === 'xlsx') {
    model.calendar = dtyRecordCalendar_(d);
    var name = '근무기록표_' + d.month + '.xlsx';
    var blobs = printXlsxFiles_(printDutyRecordWorkbook_(model)).map(function (f) { return Utilities.newBlob(f.text, 'application/xml', f.path); });
    var zip = Utilities.zip(blobs, name);
    zip.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    var zb = zip.getBytes();
    return { ok: true, name: name, base64: Utilities.base64Encode(zb), bytes: zb.length, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', warnings: model.warnings };
  }
  var html = printRenderDutyRecord_(model);
  var pname = '근무기록표_' + d.month + '.pdf';
  var blob = sheetMakePdf_(html, pname);
  var bytes = blob.getBytes();
  return { ok: true, name: pname, base64: Utilities.base64Encode(bytes), bytes: bytes.length, warnings: model.warnings };
}

var DTY_STALE_MSG = '근무표가 바뀌었습니다. 새로 불러와 주세요.';

/**
 * 근무 칸 한 줄의 '화면이 최신인가' 표: 칸 행 id + 지금 실제 근무자 + updated_at. 빈 칸은 ''.
 * 화면이 getDutyMonth로 받은 값을 편성(saveDutyDay.expect)·교대(swapDuty opts.expect)에 그대로 보내면, 락 안에서 지금 값과 달라진 경우
 * {stale:true}로 거부한다(다른 담당자가 먼저 바꾼 칸을 옛 화면이 경고 없이 덮지 않게).
 */
function dtySlotToken_(row) {
  // 이메일이 응답에 그대로 나가지 않게 해시로 보낸다(getDutyMonth 응답에는 이메일이 없다)
  return row ? dtyHash_([row.id, dutyEmail_(row.actual_email) || dutyEmail_(row.original_email), row.updated_at || ''].join('|')) : '';
}

/** 짧은 문자열 해시(같은가 확인용, 보안 아님) */
function dtyHash_(text) {
  var h = 5381, h2 = 52711, i;
  text = String(text);
  for (i = 0; i < text.length; i++) h = (Math.imul(h, 33) + text.charCodeAt(i)) | 0;
  for (i = text.length - 1; i >= 0; i--) h2 = (Math.imul(h2, 31) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

/** 그날 칸 틀의 칸마다 지금 표 {슬롯: token}(읽기만, 시험·점검용) */
function dtyDayTokens_(date) {
  invalidate_('db', 'duty_slots');
  var plan = dtyPlan_(date, calLoadCtx_()), picked = dutyPick_(readAll_('duty_slots'), date).bySlot, out = {};
  dutySlotsFor_(plan).forEach(function (f) { out[f.slot] = dtySlotToken_(picked[f.slot]); });
  return out;
}

function dtyStale_() { return { ok: false, stale: true, message: DTY_STALE_MSG, errors: [{ field: 'slot', message: DTY_STALE_MSG }] }; }

var DTY_STARTED_MSG = '이미 시작한 근무는 근무표 담당자에게 대신 근무로 기록해 달라고 하세요.';

/**
 * 그 칸의 근무가 이미 시작했는가(순수). now = 'yyyy-MM-ddTHH:mm:ss'(KST). 오늘 이전 날짜 칸은 시작한 것으로 본다.
 * 시작 시각: 월~목 23:00조 = 21:30(21:30조가 끝나는 때), 그 밖의 칸(21:30조·단독·예비) = 그날 자습 시작(plan.start, 없으면 00:00).
 * 근무가 끝난 칸을 학사 교사가 넘겨 `out.save` 권한이 거꾸로 옮겨 가는 길을 막는 데 쓴다(총괄 결정 66).
 */
function dtySlotStarted_(row, plan, now) {
  var date = String(row.date).trim(), today = String(now).slice(0, 10);
  if (today < date) return false;
  if (today > date) return true;
  var start = String(row.slot).trim() === '23:00조' ? '21:30' : ((plan && hmNorm_(plan.start)) || '00:00');
  return String(now).slice(11, 16) >= start;
}

/**
 * 교대·대신 근무 판정(순수). ctx = {email(누른 사람), canEdit(duty.edit 보유), today, started(그 칸 근무가 이미 시작했는가, 선택)}, row = duty_slots 행, toEmail = 새 근무자.
 * → {ok:true} | {ok:false, denied:true, why}(권한 없음, 거부 기록 대상) | {ok:false, error}(입력 오류).
 * - 담당자·관리자(duty.edit): 어느 칸이든, 지난 날짜도(사실 기록, 결정 57·4-2).
 * - 학사 교사: 오늘 이후, 지금 실제 근무자가 본인인 근무 칸을 넘겨주기만. 예비 감독 칸은 열지 않는다(4-2). 남의 칸·이미 넘긴 칸·지난 날짜는 거부.
 *   이미 시작한 근무(ctx.started)는 넘길 수 없다 — 입력 오류로 안내한다(담당자가 대신 근무로 기록, 결정 66).
 */
function dtySwapCheck_(ctx, row, toEmail) {
  if (!row || !ruleRowLive_(row)) return { ok: false, denied: true, why: '없거나 취소된 칸' };
  var cur = dutyEmail_(row.actual_email) || dutyEmail_(row.original_email);
  if (!ctx.canEdit) {
    if (String(row.slot).trim() === '예비') return { ok: false, denied: true, why: '예비 감독 칸은 담당자가 기록' };
    if (!ctx.email || cur !== dutyEmail_(ctx.email)) return { ok: false, denied: true, why: '본인 칸 아님' };
    if (String(row.date).trim() < ctx.today) return { ok: false, denied: true, why: '지난 날짜' };
    if (ctx.started) return { ok: false, started: true, error: DTY_STARTED_MSG };
  }
  if (dutyEmail_(toEmail) === cur) return { ok: false, error: '지금 근무하는 선생님과 같습니다. 다른 선생님을 골라 주세요.' };
  return { ok: true };
}

/**
 * 근무 교대(학사 교사 본인 칸) / 대신 근무 기록(근무표 담당자·관리자). 승인 절차 없음(PRD F3).
 * swapDuty(slotId, toUserId, {acknowledge, reason, expect(그 칸의 token)}) → {ok, changed, notified} | {ok:false, needsConfirm, warnings} | {ok:false, errors}
 * 락 안에서 칸을 다시 읽고 다시 검사한 뒤 actual_email·swapped_at·swapped_by만 바꾼다(원래 근무자는 그대로, 중간 단계는 audit_log).
 * 메일은 저장을 끝내고 락을 푼 뒤에 보낸다: 이전·새 근무자와 활성 근무표 담당자(없으면 관리자)에게, 누른 사람은 빼고.
 * 메일이 안 가도(notified:false) 교대는 저장되어 있다 — 화면이 "상대 선생님께 직접 알려 주세요"를 보인다.
 */
function swapDuty(slotId, toUserId, opts) {
  var user = requirePermission_('duty.swap');
  opts = opts || {};
  var canEdit = permissions_()['duty.edit'].roles.some(function (r) { return user.roles.indexOf(r) >= 0; });
  var res = withLock_(function () {
    ['duty_slots', 'day_schedules', 'blocks', 'users'].forEach(function (t) { invalidate_('db', t); });
    var sid = String(slotId || '').trim(), all = readAll_('duty_slots');
    // 같은 id의 줄이 둘 이상(시트에서 복사·붙여넣은 줄)이면 어느 줄인지 알 수 없다 — 고치지 않고 담당자에게 알린다. 빈 id도 칸이 아니다
    var same = sid ? all.filter(function (r) { return String(r.id).trim() === sid; }) : [];
    if (same.length > 1) throw new Error('근무표 시트에 같은 칸이 여러 줄입니다. 관리자(시트 소유자)에게 알려 주세요.');
    var row = same[0] || null;
    // 없는 칸·취소된 칸·낡은 화면(그 사이 칸이 바뀜)·같은 (날짜, 칸)에 살아 있는 행이 둘일 때의 옛 행은 공격이 아니라 "화면이 낡음"이다.
    // R8(dutyOn_)이 쓰는 최신 행만(같은 물리 줄까지 비교) 교대할 수 있다 — 옛 행 id로 남의 근무를 빼앗는 길을 막는다
    var current = row && ruleRowLive_(row) ? dutyPick_(all, String(row.date).trim()).bySlot[String(row.slot).trim()] : null;
    if (!current || current._row !== row._row || current.id !== row.id) throw new Error('근무표가 바뀌었습니다. 새로 고친 뒤 다시 해 주세요.');
    var denyIf = function (c) {
      if (!c.denied) return;
      logDenied_(user.email, 'duty.swap', c.why + ' ' + JSON.stringify({ slotId: String(slotId || ''), toUserId: String(toUserId || '') }));
      throw new Error('권한이 없습니다.');
    };
    var plan = dtyPlan_(String(row.date).trim(), calLoadCtx_());
    var swapCtx = { email: user.email, canEdit: canEdit, today: today_(), started: dtySlotStarted_(row, plan, nowIso_()) };
    denyIf(dtySwapCheck_(swapCtx, row, ''));
    // 화면이 본 칸 상태(opts.expect)와 지금이 다르면(그 사이 같은 칸의 근무자가 바뀜) 낡은 화면 — 한 칸을 두 번 바꾸거나 메일을 두 번 보내지 않는다
    if (typeof opts.expect !== 'string' || opts.expect !== dtySlotToken_(current)) return dtyStale_();
    var teachers = dtyTeachers_(), to = teachers.filter(function (t) { return t.id === String(toUserId || ''); })[0];
    if (!to) return { ok: false, errors: [{ field: 'to', message: '근무를 설 수 있는 학사 교사를 목록에서 골라 주세요.' }] };
    var chk = dtySwapCheck_(swapCtx, row, to.email);
    denyIf(chk);
    if (!chk.ok) return { ok: false, errors: [{ field: chk.started ? 'slot' : 'to', message: chk.error }] };
    var date = String(row.date).trim();
    if (!plan.operating) return { ok: false, errors: [{ field: 'slot', message: '운영하지 않는 날의 근무는 바꿀 수 없습니다.' }] };
    // 새 근무자가 그날 다른 칸에도 있으면 경고 후 확인. 예비 감독이 대신 근무하는 것은 정상이라 경고하지 않는다
    var others = readAll_('duty_slots').filter(function (r) {
      return r.id !== row.id && ruleRowLive_(r) && String(r.date).trim() === date && (dutyEmail_(r.actual_email) || dutyEmail_(r.original_email)) === to.email &&
        !(String(r.slot).trim() === '예비' && String(row.slot).trim() !== '예비');
    });
    if (others.length && opts.acknowledge !== true) {
      return { ok: false, needsConfirm: true, warnings: [to.name + ' 선생님이 이 날 이미 ' + dtySlotLabel_(others[0].slot) + '에 편성되어 있습니다.'] };
    }
    var from = dutyEmail_(row.actual_email) || dutyEmail_(row.original_email);
    var patch = { actual_email: to.email, swapped_at: nowIso_(), swapped_by: user.email };
    // 이유(memo)는 교대마다 새로 정한다: 담당자·관리자만 넣을 수 있고, 학사 교사의 교대는 옛 이유를 지운다
    patch.memo = canEdit ? String(opts.reason || '').trim().slice(0, 100) : '';
    // 원래 근무자에게 되돌리면 교대 표시를 정리한다
    if (to.email === dutyEmail_(row.original_email)) { patch.swapped_at = ''; patch.swapped_by = ''; patch.memo = ''; }
    updateRecord_('duty_slots', row.id, patch, user.email);
    var names = Object.create(null);
    readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = u.name; });
    var managers = readAll_('users').filter(function (u) { return isTruthy_(u.active) && parseRoles_(u.roles).indexOf('duty_manager') >= 0; });
    if (!managers.length) managers = readAll_('users').filter(function (u) { return isTruthy_(u.active) && parseRoles_(u.roles).indexOf('admin') >= 0; });
    var mail = {
      to: [from, to.email].concat(managers.map(function (u) { return normalizeEmail_(u.email); })).filter(function (e) { return e && e !== user.email; }),
      body: [ymdKoShort_(date) + ' ' + dtySlotLabel_(row.slot) + ' 근무가 바뀌었습니다.', (names[from] || '(등록 안 된 교사)') + ' → ' + to.name,
        '바꾼 사람: ' + (names[user.email] || user.name || '')].join('\n')
    };
    return { ok: true, changed: true, mail: mail };
  });
  if (!res.mail) return res;
  // 락 밖: 메일이 실패해도 저장은 되돌리지 않는다
  // 앱 주소·메일에서 오류가 나도 저장은 끝났다 — 다시 시도하면 "내 칸이 아님"으로 거부되므로 여기서는 던지지 않는다
  var notified = false;
  try {
    var link = '';
    try { link = ScriptApp.getService().getUrl(); } catch (e) { link = ''; }
    notified = notifyMail_(res.mail.to, '[신한1학사] 근무 교대 알림', res.mail.body + (link ? '\n\n' + link : ''), user.email).notified;
  } catch (e) { console.warn('교대 알림 실패: ' + e.message); }
  return { ok: true, changed: true, notified: notified };
}

/** 칸 이름 앞뒤 공백이 있어도 라벨을 찾는다(없으면 'undefined' 대신 원래 글자) */
function dtySlotLabel_(slot) { var k = String(slot === undefined || slot === null ? '' : slot).trim(); return DTY_SLOT_LABEL[k] || k; }

function ymdKoShort_(ymd) {
  return (+ymd.slice(5, 7)) + '월 ' + (+ymd.slice(8, 10)) + '일(' + ymdWeekdayKo_(ymd) + ')';
}

/**
 * 교사 홈의 근무 카드 데이터(getHomeData가 부른다). 아직 없으면 null.
 * 보고 있는 홈 역할(role)이 duty.view를 가질 때만 불린다. 던진 오류는 getHomeData가 잡아 {error}로 바꾼다.
 * 근무표 담당자·관리자: 이번 달 빈 날·교대 수. 학사 교사: 오늘 내 근무와 다음 근무.
 */
function dtyHomeInfo_(user, role) {
  if (role === 'duty_manager' || role === 'admin') {
    var m = today_().slice(0, 7), v = dtyMonthView_(m, user);
    var open = v.days.filter(function (d) { return d.operating && d.date >= today_() && d.slots.some(function (s) { return !s.name; }); }).slice(0, 3).map(function (d) {
      return { date: d.date, weekdayKo: d.weekdayKo, labels: d.slots.filter(function (s) { return !s.name; }).map(function (s) { return s.label; }) };
    });
    return { month: m, emptyDays: v.emptyDays, swapCount: v.swapCount, open: open };
  }
  if (role !== 'hall_teacher') return null;
  var today = today_(), rows = readAll_('duty_slots');
  // 그날 내 칸: {label, end}(근무 칸이면 끝 시각, 예비 감독이면 end ''), 없으면 null
  var mine = function (ymd) {
    var d = dutyOn_(rows, ymd), hit = d.duty.filter(function (x) { return x.email === user.email; })[0];
    if (hit) return { label: DTY_SLOT_LABEL[hit.slot], end: hit.end };
    return d.standby.some(function (sb) { return sb.email === user.email; }) ? { label: DTY_SLOT_LABEL['예비'], end: '' } : null;
  };
  var dates = {};
  rows.forEach(function (r) { var d = String(r.date || '').trim(); if (d > today && ruleRowLive_(r)) dates[d] = true; });
  var ctx = calLoadCtx_(), next = null;
  Object.keys(dates).sort().some(function (d) {
    var l = mine(d);
    if (!l || !dtyPlan_(d, ctx).operating) return false;   // 운영 안 하는 날은 건너뛴다
    next = { date: d, weekdayKo: ymdWeekdayKo_(d), label: l.label };
    return true;
  });
  return { today: dtyPlan_(today, ctx).operating ? mine(today) : null, next: next };
}
