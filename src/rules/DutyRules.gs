/**
 * 근무 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F3, docs/plan/stage2.md R8·4-2).
 *
 * 순수 함수만 둔다. DateRules.gs(ymd…·hm…·ruleStr_·ruleIso_·ruleRowLive_·hmNorm_)·ScheduleRules.gs(baseDayType_)를 부른다.
 * 시트 행(문자열)은 그대로 받는다.
 *   duty_slots: id, date, slot(21:30조·23:00조·단독·예비), end_time, original_email, actual_email, swapped_at, swapped_by,
 *               status(유효·취소), memo, updated_at …
 * 칸에는 마지막 교대(원래 → 실제)만 남고, 중간 단계(A→B→C)는 audit_log에만 있다(4-2).
 */

/**
 * 그날 근무 칸 틀. plan = resolveDayPlan_ 결과.
 * → 운영 안 함 [] | 월~목 [{slot:'21:30조',end},{slot:'23:00조',end}] | 금·토·일 [{slot:'단독',end},{slot:'예비',end:''}]
 * end = min(조 시각, 그날 종료), 단독 = 그날 종료. 방학도 같은 틀(4-2).
 * ASSUMPTION: 특별 요일 유형(exam 등)은 실제 달력 요일의 틀로 본다(R3 END와 같은 방식).
 */
function dutySlotsFor_(plan) {
  if (!plan || !plan.operating) return [];
  var end = hmNorm_(plan.end) || '';
  var cap = function (hm) { return end && end < hm ? end : hm; };
  if (baseDayType_(plan.date) === 'mon_thu') return [{ slot: '21:30조', end: cap('21:30') }, { slot: '23:00조', end: cap('23:00') }];
  return [{ slot: '단독', end: end }, { slot: '예비', end: '' }];
}

/** 근무자 이메일(소문자·공백 없음). */
function dutyEmail_(v) {
  return ruleStr_(v).toLowerCase();
}

/**
 * 그날 근무자. → {duty:[{slot, email, end, swappedFrom}], standby:[{email, swappedFrom}], warnings}
 * 취소 제외, (date, slot)마다 updated_at 최신 1행(같으면 아래 행) + 경고. 그 요일 틀 밖의 칸(토요일 21:30조, 화요일 단독·예비 등)도 쓰되 경고. email = actual_email(빈칸이면 original_email).
 * swappedFrom = 실제 근무자가 원래 근무자와 다르면 원래 근무자. 순서 21:30조 → 23:00조 → 단독.
 * ASSUMPTION: 교대 전에는 actual_email이 빈칸일 수 있다(그때는 original_email이 근무자).
 */
function dutyOn_(rows, ymd) {
  var p = dutyPick_(rows, ymd), warnings = p.warnings;
  var duty = [], standby = [];
  ['21:30조', '23:00조', '단독', '예비'].forEach(function (slot) {
    var r = p.bySlot[slot];
    if (!r) return;
    var original = dutyEmail_(r.original_email), email = dutyEmail_(r.actual_email) || original;
    if (!email) { warnings.push(ymd + ' ' + slot + ' 칸에 근무자가 없습니다'); return; }
    var from = original && original !== email ? original : '';
    if (slot === '예비') standby.push({ email: email, swappedFrom: from });
    else duty.push({ slot: slot, email: email, end: hmNorm_(r.end_time) || '', swappedFrom: from });
  });
  return { duty: duty, standby: standby, warnings: warnings };
}

/** 그날 칸마다 쓸 행: 취소 제외, updated_at 최신(같으면 아래 행). → {bySlot:{slot:row}, warnings} */
function dutyPick_(rows, ymd) {
  var bySlot = {}, warnings = [];
  var frame = ymdIsValid_(ymd) && baseDayType_(ymd) === 'mon_thu' ? ['21:30조', '23:00조'] : ['단독', '예비'];   // 그 요일의 칸 틀(dutySlotsFor_와 같음)
  (rows || []).forEach(function (r) {
    if (!r || !ruleRowLive_(r) || ruleStr_(r.date) !== ymd) return;
    var slot = ruleStr_(r.slot);
    if (['21:30조', '23:00조', '단독', '예비'].indexOf(slot) < 0) { warnings.push(ymd + ' 알 수 없는 근무 칸: ' + slot); return; }
    if (frame.indexOf(slot) < 0 && !bySlot[slot]) warnings.push(ymd + ' 그 요일에 없는 근무 칸입니다: ' + slot);
    if (bySlot[slot]) warnings.push(ymd + ' ' + slot + ' 칸이 여러 행입니다(가장 최근 수정 행을 씁니다)');
    if (!bySlot[slot] || ruleIso_(r.updated_at) >= ruleIso_(bySlot[slot].updated_at)) bySlot[slot] = r;
  });
  return { bySlot: bySlot, warnings: warnings };
}

/**
 * 근무교사 시간 범위 권한(PRD §12): 그날 실제 근무자이고 ymd ≤ today ≤ ymd + windowDays면 참.
 * 예비 지정만·교대로 넘긴 원래 근무자는 거짓. windowDays 기본 0(당일만, Q2 — 넓히는 쪽은 답 전에는 좁게).
 * 잘못된 날짜·windowDays(음수·소수)는 거짓(권한을 넓히지 않는다).
 */
function dutyIsOn_(rows, email, ymd, today, windowDays) {
  var w = windowDays === undefined || windowDays === null || windowDays === '' ? 0 : Number(windowDays);
  var who = dutyEmail_(email);
  if (!who || !ymdIsValid_(ymd) || !ymdIsValid_(today) || !(w >= 0) || w % 1 !== 0) return false;
  if (today < ymd || today > ymdAddDays_(ymd, w)) return false;
  return dutyOn_(rows, ymd).duty.some(function (d) { return d.email === who; });
}

/**
 * 월말 근무 기록(수당 근거, PRD F3). month 'yyyy-MM', opts = {operatingByDate:{date:false}}
 * → {teachers:[{email, total, bySlot:{'21:30조','23:00조','단독'}, dates:[{date,slot,end,swappedFrom}]}],
 *    standby:[{email, count}], swaps:[{date, slot, from, to, at, by}], warnings}   금액은 계산하지 않는다(결정 47).
 * 교사별 합계 = 그날 칸의 실제 근무자(원래 근무자에게는 세지 않음). swaps = 칸마다 마지막 교대(예비 칸 포함). 예비만 있는 교사도 teachers에(total 0).
 * 예비 지정은 standby로 따로 센다(결정 46). 그날 대신 근무한 예비는 근무로만 세고 standby에서는 뺀다(두 번 세지 않음).
 * ASSUMPTION: 운영 안 하는 날(operatingByDate[date] === false)의 행도 센다 + 경고(조용히 빼면 실제 근무를 놓친다).
 */
function dutyRecord_(rows, month, opts) {
  opts = opts || {};
  var mon = ruleStr_(month);
  if (!/^\d{4}-\d{2}$/.test(mon) || !ymdIsValid_(mon + '-01')) throw new Error('달 형식이 아닙니다(yyyy-MM): ' + month);
  var byDate = {};
  (rows || []).forEach(function (r) {
    var d = ruleStr_(r && r.date);
    if (d.slice(0, 7) === mon && ymdIsValid_(d)) (byDate[d] = byDate[d] || []).push(r);
  });
  var teachers = {}, standby = {}, swaps = [], warnings = [];
  var teacher = function (email) {
    return teachers[email] = teachers[email] || { email: email, total: 0, bySlot: { '21:30조': 0, '23:00조': 0, '단독': 0 }, dates: [] };
  };
  Object.keys(byDate).sort().forEach(function (date) {
    var day = dutyOn_(byDate[date], date);
    warnings = warnings.concat(day.warnings);
    if ((opts.operatingByDate || {})[date] === false && (day.duty.length || day.standby.length)) warnings.push(date + ' 운영 안 하는 날의 근무 행을 셌습니다');
    day.duty.forEach(function (d) {
      var t = teacher(d.email);
      t.total++; t.bySlot[d.slot]++;
      t.dates.push({ date: date, slot: d.slot, end: d.end, swappedFrom: d.swappedFrom });
    });
    var swap = function (slot, d) {
      if (!d.swappedFrom) return;
      var r = dutyPick_(byDate[date], date).bySlot[slot];
      swaps.push({ date: date, slot: slot, from: d.swappedFrom, to: d.email, at: ruleStr_(r.swapped_at), by: dutyEmail_(r.swapped_by) });
    };
    day.duty.forEach(function (d) { swap(d.slot, d); });
    day.standby.forEach(function (sb) {
      swap('예비', sb);   // 예비도 수당 근거라 교대를 남긴다(결정 46)
      teacher(sb.email);   // 예비만 있는 교사도 목록에(total 0)
      if (!day.duty.some(function (d) { return d.email === sb.email; })) standby[sb.email] = (standby[sb.email] || 0) + 1;
    });
  });
  return {
    teachers: Object.keys(teachers).sort().map(function (e) { return teachers[e]; }),
    standby: Object.keys(standby).sort().map(function (e) { return { email: e, count: standby[e] }; }),
    swaps: swaps,
    warnings: warnings
  };
}
