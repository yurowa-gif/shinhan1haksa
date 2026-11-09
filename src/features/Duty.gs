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
    return DTY_SLOT_LABEL[r.slot] + ' ' + (names[e] || '(등록 안 된 교사)');
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
 * emptyDays = 운영하는 날 중 근무 칸(예비 제외)이 빈 날 수, swapCount = 교대된 칸 수.
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
      return { slot: f.slot, label: DTY_SLOT_LABEL[f.slot], end: f.end, userId: w.id, name: w.name,
        swappedFrom: from ? who(from).name : '', swapped: !!from, mine: !!email && email === user.email };
    });
    var open = slots.some(function (x) { return !x.name; });   // 빈 예비 감독 칸도 빈 날(시안·screens.md)
    if (p.operating && open) emptyDays++;
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
      if (seen[e]) warnings.push(dtyNameOf_(teachers, e) + ' 선생님이 이 날 이미 ' + DTY_SLOT_LABEL[seen[e]] + '(으)로 편성되어 있습니다.');
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
 * 확인창이 본 칸 id 목록을 input.confirmIds로 다시 보내야 취소한다(그 사이 칸이 바뀌었으면 다시 확인). 자습 일정 화면(saveDaySchedule·cancelDaySchedule)도 같은 규칙.
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

/**
 * 교사 홈의 근무 카드 데이터(getHomeData가 부른다). 아직 없으면 null.
 * 보고 있는 홈 역할(role)이 duty.view를 가질 때만 불린다. 던진 오류는 getHomeData가 잡아 {error}로 바꾼다.
 * 근무표 담당자·관리자: 이번 달 빈 날·교대 수. 학사 교사: 오늘 내 근무와 다음 근무.
 */
function dtyHomeInfo_(user, role) {
  if (role === 'duty_manager' || role === 'admin') {
    var m = today_().slice(0, 7), v = dtyMonthView_(m, user);
    var open = v.days.filter(function (d) { return d.operating && d.slots.some(function (s) { return !s.name; }); }).slice(0, 3).map(function (d) {
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
