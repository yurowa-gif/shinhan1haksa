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
    var open = slots.some(function (x) { return x.slot !== '예비' && !x.name; });
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
      if (c.r && c.next === c.cur && hmNorm_(c.r.end_time) === c.f.end) return;      // 같은 내용
      if (!c.r && !c.next) return;
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
 * 그날 "운영 안 함" 켜고 끄기(결정 44). input = {date, operating(boolean), memo(생략하면 그대로), acknowledge}.
 * 근무표 담당자·관리자(duty.operating). day_schedules의 운영 여부·메모만 바꾼다(시각·요일 유형은 있던 값 그대로).
 * 기본과 같아지면(운영, 메모 없음, 다른 값 없음) 그날 행을 '취소'로 되돌린다.
 * 운영 안 함으로 바꾸는데 그날 근무 편성이 있으면 {ok:false, needsConfirm:true, warnings}(편성은 지우지 않는다).
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
  return withLock_(function () {
    ['duty_slots', 'day_schedules', 'blocks'].forEach(function (t) { invalidate_('db', t); });
    var ctx = calLoadCtx_();
    var ex = pickDaySchedule_(ctx.daySchedules, date);
    var memo = memoGiven ? memoIn : (ex ? String(ex.memo || '') : '');
    var curOp = dtyPlan_(date, ctx).operating;
    var same = curOp === input.operating && (ex ? String(ex.memo || '') : '') === memo;
    if (same) return { ok: true, changed: false };
    if (!input.operating && curOp) {
      var live = readAll_('duty_slots').filter(function (r) { return ruleRowLive_(r) && String(r.date).trim() === date; }).length;
      if (live && input.acknowledge !== true) {
        return { ok: false, needsConfirm: true, warnings: ['그날 근무 편성 ' + live + '칸이 있습니다. 운영 안 함으로 바꿔도 편성은 지워지지 않으니 필요하면 먼저 비워 주세요.'] };
      }
    }
    var defOp = dtyPlan_(date, { terms: ctx.terms, daySchedules: [], blocks: ctx.blocks, defaults: ctx.defaults }).operating;
    var keep = ex ? { start: ex.start || '', end: ex.end || '', day_type: ex.day_type || '' } : { start: '', end: '', day_type: '' };
    var backToDefault = input.operating === defOp && !memo && !keep.start && !keep.end && !keep.day_type;
    if (ex) calCancelDay_(date, user.email);
    if (!backToDefault) {
      appendRecord_('day_schedules', { date: date, operating: input.operating ? 'TRUE' : 'FALSE', start: keep.start, end: keep.end,
        day_type: keep.day_type, memo: memo, status: '유효' }, user.email);
    }
    return { ok: true, changed: true };
  });
}

/**
 * 교사 홈의 근무 카드 데이터(getHomeData가 부른다). 아직 없으면 null.
 * 보고 있는 홈 역할(role)이 duty.view를 가질 때만 불린다. 던진 오류는 getHomeData가 잡아 {error}로 바꾼다.
 * 근무표 담당자·관리자: 이번 달 빈 날·교대 수. 학사 교사: 오늘 내 근무와 다음 근무.
 */
function dtyHomeInfo_(user, role) {
  if (role === 'duty_manager' || role === 'admin') {
    var v = dtyMonthView_(today_().slice(0, 7), user);
    return { emptyDays: v.emptyDays, swapCount: v.swapCount };
  }
  if (role !== 'hall_teacher') return null;
  var today = today_(), rows = readAll_('duty_slots');
  var mineSlot = function (ymd) {
    var d = dutyOn_(rows, ymd), hit = d.duty.filter(function (x) { return x.email === user.email; })[0];
    return hit ? DTY_SLOT_LABEL[hit.slot] : (d.standby.some(function (sb) { return sb.email === user.email; }) ? DTY_SLOT_LABEL['예비'] : '');
  };
  var dates = {};
  rows.forEach(function (r) { var d = String(r.date || '').trim(); if (d > today && ruleRowLive_(r)) dates[d] = true; });
  var next = null;
  Object.keys(dates).sort().some(function (d) { var l = mineSlot(d); if (l) { next = { date: d, label: l }; return true; } return false; });
  return { today: mineSlot(today), next: next };
}
