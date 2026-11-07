/**
 * 급식 적용일 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F6·F7, 결정 1·2·3·23(④⑤)·35).
 *
 * 순수 함수만 둔다. DateRules.gs의 함수(isoLocalSplit_·ymd…·hm…·ruleStr_·ruleIso_·ruleRowLive_)와 StatusRules.gs의 statusOn_을 부른다.
 *
 * | kind            | 언제                                   | 적용일                                         |
 * | start           | 실시 신청(조식 실시, 석식 학사 실시)     | 마감(11:30) 전 신청 → 당일, 마감 이후 → 다음 날   |
 * | to_general      | 일반 석식으로 변경                     | start와 같음(결정 1)                            |
 * | stop            | 미실시                                 | 월·화 신청 → 다음 주 월요일, 수~일 → 다다음 주 월요일 |
 * | with_dorm_entry | 기숙사 입실과 함께 조식 실시            | 입실일(opts.entryDate)                          |
 * | on_leave        | 학사 퇴실에 따른 조식 중단              | 퇴실일(opts.leaveDate) 즉시                     |
 * | initial         | 그 항목 기록이 아직 없는 학생의 첫 미실시 | 신청일(그만둘 급식이 없으므로 바로 기록)          |
 * 서류 미제출이어도 적용한다(결정 3) — 이 함수는 서류를 보지 않는다.
 */

/**
 * 적용일 계산. requestedAt = 신청 일시 KST 'yyyy-MM-ddTHH:mm:ss'(isoLocalSplit_이 받는 형식).
 * opts = {cutoff:'11:30', entryDate, leaveDate} → {date:'yyyy-MM-dd', rule}
 * start·to_general·stop에 leaveDate를 함께 주면(학사 퇴실과 함께 만드는 석식 변경) 적용일이 퇴실일보다 이르지 않게 한다.
 * rule: 'same_day'|'next_day'|'next_monday'|'monday_after_next'|'entry_date'|'leave_date'|'initial'
 * 마감 시각 정각(11:30:00)에 낸 신청은 마감 이후로 본다(다음 날, 결정 23 ④). 11:29:59는 당일.
 * 잘못된 kind·일시·마감 시각, 필요한 날짜가 없으면 Error.
 */
function mealEffectiveDate_(kind, requestedAt, opts) {
  opts = opts || {};
  var k = ruleStr_(kind);
  if (k === 'with_dorm_entry' || k === 'on_leave') {
    var key = k === 'with_dorm_entry' ? 'entryDate' : 'leaveDate';
    var d = ruleStr_(opts[key]);
    if (!ymdIsValid_(d)) throw new Error(key + '가 필요합니다(yyyy-MM-dd): ' + d);
    return { date: d, rule: k === 'with_dorm_entry' ? 'entry_date' : 'leave_date' };
  }
  var at = isoLocalSplit_(ruleStr_(requestedAt));
  if (k === 'initial') return { date: at.date, rule: 'initial' };
  if (k === 'start' || k === 'to_general') {
    var cutoff = mealCutoffHm_(opts.cutoff);
    if (at.sec < hmToMin_(cutoff) * 60) return mealNotBeforeLeave_({ date: at.date, rule: 'same_day' }, opts);
    return mealNotBeforeLeave_({ date: ymdAddDays_(at.date, 1), rule: 'next_day' }, opts);
  }
  if (k === 'stop') {
    var w = ymdWeekday_(at.date);           // 0=일 … 6=토
    var monday = ymdMondayOf_(at.date);      // 월~일 주의 월요일
    if (w === 1 || w === 2) return mealNotBeforeLeave_({ date: ymdAddDays_(monday, 7), rule: 'next_monday' }, opts);
    return mealNotBeforeLeave_({ date: ymdAddDays_(monday, 14), rule: 'monday_after_next' }, opts);
  }
  throw new Error('알 수 없는 급식 변경 종류: ' + kind);
}

/** 설정 meal.morning_cutoff 읽기: 빈칸은 '11:30', 'H:mm'·'HH:mm:00'도 받는다. 시각이 아니면 Error. */
function mealCutoffHm_(v) {
  var hm = hmNorm_(v);
  if (hm === '') return '11:30';
  if (!hm || hm === '24:00') throw new Error('마감 시각 형식이 아닙니다(HH:mm): ' + ruleStr_(v));
  return hm;
}

/**
 * 학사 퇴실과 함께 만드는 석식 변경(opts.leaveDate가 있을 때): 계산한 적용일이 퇴실일보다 이르면 퇴실일로 미룬다.
 * ASSUMPTION: 퇴실을 미리 입력해도 퇴실 전에는 학사 석식이 이어진다(일반 석식 전환이 퇴실 전에 시작되지 않게).
 * 퇴실일보다 늦은 적용일(석식 "중단"의 미실시 규칙: 다음 주·다다음 주 월요일)은 그대로 둔다 — 결정 35: 학사 퇴실 시
 * 조식만 퇴실일에 끝나고, 학사 석식 중단은 미실시 적용일을 따른다(그동안 학사 석식은 이어진다).
 */
function mealNotBeforeLeave_(r, opts) {
  var leave = ruleStr_(opts.leaveDate);
  if (!leave) return r;
  if (!ymdIsValid_(leave)) throw new Error('leaveDate 형식이 아닙니다(yyyy-MM-dd): ' + leave);
  return r.date < leave ? { date: leave, rule: 'leave_date' } : r;
}

/**
 * 값 변화 → 변경 종류(mealEffectiveDate_의 kind). 값만 보는 순수 매핑이다.
 * fromValue는 **새 행이 적용될 날짜에 실제로 적용되는 값**이어야 한다 — 그 날짜는 종류에 따라 달라지므로
 * F7은 이 함수를 직접 부르지 말고 mealPlanChange_(후보 적용일마다 판정)를 쓴다.
 * → 'none'(바뀐 것 없음) | 'initial'(그 항목 기록이 없는 학생의 첫 미실시: 그만둘 급식이 없으므로 신청일에 바로 기록)
 *   | 'start' | 'to_general' | 'stop'
 * item '조식': 실시로 → 'start', 미실시로 → 'stop'. item '석식': 학사 석식으로 → 'start', 일반 석식으로 → 'to_general'(결정 1),
 *   미실시로 → 'stop'(일반 석식 → 미실시 포함, 결정 23 ⑤). 기록 없음('') → 실시·학사 석식·일반 석식은 'start'·'to_general'.
 * with_dorm_entry·on_leave는 값 변화가 아니라 F6 입퇴실과 함께 정해지므로 여기서 나오지 않는다. 모르는 item·값이면 Error.
 */
function mealChangeKind_(item, fromValue, toValue) {
  var it = ruleStr_(item);
  var from = ruleStr_(fromValue), to = ruleStr_(toValue);
  var allowed = mealAllowedValues_(it);
  if (!allowed) throw new Error('급식 항목은 조식 또는 석식이어야 합니다: ' + item);
  if (allowed.indexOf(to) < 0) throw new Error(it + ' 값이 아닙니다: ' + toValue);
  if (from && allowed.indexOf(from) < 0) throw new Error(it + ' 값이 아닙니다: ' + fromValue);
  if (from === to) return 'none';
  if (to === '미실시') return from ? 'stop' : 'initial';
  if (to === '일반 석식') return 'to_general';
  return 'start';
}

function mealAllowedValues_(item) {
  return item === '조식' ? ['실시', '미실시'] : item === '석식' ? ['학사 석식', '일반 석식', '미실시'] : null;
}

/** 학사생에게만 주는 값(학사 퇴실 뒤에는 새로 켤 수 없다): 조식 '실시', 석식 '학사 석식'. */
function mealIsHallOnly_(item, value) {
  return (item === '조식' && value === '실시') || (item === '석식' && value === '학사 석식');
}

/**
 * F7 급식 변경 신청 하나를 계획한다(아무것도 쓰지 않음). tests/rules/meal_oracle.test.js가 단순한 오라클과 비교한다.
 * changes = 그 학생의 status_changes 행(학사·조식·석식, 취소 포함 그대로), requestedAt = 신청 일시(KST, 교사가 넣는 신청서 일시),
 * opts = {cutoff, leaveDate, today:'yyyy-MM-dd'(필수, 입력하는 날)}
 * → {kind, date, rule, from, blocked:''|사유, superseded:boolean, toCancel:[{id, effective_date, value}],
 *    followUps:[{item, value, effective_date, source:'F6'}], warnings:[]}
 *
 * 기준(오라클과 같은 뜻): 어떤 날의 값 = 그날까지 적용일이 지난 신청 중 **신청 일시가 가장 늦은** 신청의 값.
 *   학사생만 받는 값(조식 '실시'·석식 '학사 석식')은 학사 퇴실 뒤 끝나는 날(조식은 퇴실일, 석식은 결정 35의 중단일)부터는 셈하지 않는다.
 *   status_changes는 "적용일이 가장 늦은 행"으로 읽으므로(statusOn_), 저장할 때 아래 toCancel·followUps로 이 기준과 같게 맞춘다.
 * - kind: 후보 적용일(미실시면 미실시 규칙의 날, 그 밖에는 11:30 규칙의 날)에 실제로 적용되는 값과 비교. 같으면 'none'(상태는
 *   바뀌지 않는다 — 예: 미실시 대기 중에 다시 학사 석식을 신청하면 그날 값은 아직 학사 석식이라 'none'이고, 더 늦게 적용될 이전
 *   미실시 대기 행을 toCancel로 취소한다). 미실시인데 그날 먹는 급식이 없으면 'initial'(신청일).
 * - **저장:** blocked·superseded가 아니면 kind가 'none'이어도 신청 행(date, 값)을 쓴다 — 신청서 기록이고, 나중에 늦게 입력되는
 *   이전 신청서가 이 신청을 덮지 못하게 한다(값이 같아 상태는 바뀌지 않는다). blocked·superseded면 date·rule은 ''이고 쓰지 않는다.
 * - superseded: 이 신청보다 신청 일시가 늦은 신청 행(퇴실 정리 F6 행 제외)이 이미 있고 그 적용일이 이 신청의 적용일 이하이면,
 *   이 신청은 영영 적용되지 않는다(늦게 입력한 이전 신청서). kind 'none' + 경고, 아무것도 쓰지 않는다.
 * - blocked: 후보 적용일에 학사 상태가 '퇴실'이면 조식 '실시'는 늘, 석식 '학사 석식'은 그 퇴실 기록(requested_at)보다 뒤에 신청했으면
 *   켜지 못한다(일반 석식은 된다). **입력 순서가 아니라 신청 일시 순서:** 퇴실 기록보다 먼저 신청한 학사 석식은 늦게 입력해도
 *   이미 있던 것으로 보고 결정 35 중단일까지 유지한다(아래 followUps가 중단일에 끝낸다).
 * - toCancel = mealPendingToCancel_(…, date, {source:'F7', requestedAt, newValue}): 신청 일시가 이 신청 이전이고 적용일이
 *   더 늦은 F6 아닌 행(오늘 이전에 이미 적용된 행이어도) + 뜻이 없어진 퇴실 정리(F6) 행: 이 신청을 저장한 뒤 그 행이 없어도
 *   그날 값이 학사생 값이 아니고 그 행 값과 다르면(퇴실 뒤 일반 석식 신청 등) 함께 취소한다.
 * - followUps: 학사생 값 신청이 닿는 학사 퇴실(적용일에 퇴실 상태면 그 퇴실, 아니면 그 뒤 가장 이른 퇴실 — 같은 날 다시 입실한
 *   퇴실은 빼고)이 있고, 중단일(조식 = 퇴실일, 석식 = mealEffectiveDate_('stop', 퇴실 행 requested_at, {leaveDate}) — F6 정리와 같은 날)에
 *   아직 퇴실 상태이며 저장 뒤 그날 값이 학사생 값이면 그날 '미실시'(source 'F6'). 중단일 전에 다시 입실했으면 쓰지 않는다.
 * - warnings: 취소하지 않는 행 중 이 신청보다 늦게 적용되며 값이 다른 행(더 새 신청·퇴실 정리)이 있으면 "X일부터 Y로 덮인다"고
 *   알린다. ASSUMPTION: 이 신청보다 먼저 적용되는(적용일이 오늘 이후·이 신청 전) 다른 값의 대기 행은 취소하지 않고 경고만 한다
 *   (예: 내일부터 '실시' 대기 중에 오늘 '미실시' 신청 → 미실시는 다다음 주 월요일. 미실시 규칙의 준비 기간을 지키려고).
 * - 잘못된 item·값·일시, today가 없거나 날짜가 아니면 Error.
 */
function mealPlanChange_(changes, studentId, item, toValue, requestedAt, opts) {
  opts = opts || {};
  var sid = ruleStr_(studentId), it = ruleStr_(item), to = ruleStr_(toValue);
  mealChangeKind_(it, '', to);                                     // 항목·값 검사(같은 오류 문구)
  var today = ruleStr_(opts.today);
  if (!ymdIsValid_(today)) throw new Error('today가 필요합니다(yyyy-MM-dd): ' + opts.today);
  var at = isoLocalSplit_(ruleStr_(requestedAt));
  var req = ruleIso_(requestedAt);
  var rows = (changes || []).filter(function (c) {
    return c && ruleRowLive_(c) && ruleStr_(c.student_id) === sid && ymdIsValid_(ruleStr_(c.effective_date));
  });
  var mine = rows.filter(function (c) { return ruleStr_(c.item) === it; });

  var cand;
  if (to === '미실시') {
    cand = mealEffectiveDate_('stop', requestedAt, opts);
    if (!statusOn_(rows, sid, it, cand.date)) cand = { date: at.date, rule: 'initial' };
  } else {
    cand = mealEffectiveDate_(to === '일반 석식' ? 'to_general' : 'start', requestedAt, opts);
  }
  var autoDate = cand.date;
  if (opts.effectiveDate !== undefined && opts.effectiveDate !== '') {   // 교사가 고친 적용일(R10)
    var manual = ruleStr_(opts.effectiveDate), rule = ruleStr_(opts.effectiveRule) || 'manual';
    if (!ymdIsValid_(manual)) throw new Error('effectiveDate 형식이 아닙니다(yyyy-MM-dd): ' + opts.effectiveDate);
    if (rule !== 'manual' && rule !== 'entry_date') throw new Error('effectiveRule은 manual 또는 entry_date: ' + opts.effectiveRule);
    // 입실일(entry_date)은 입퇴실 기록의 사실이라 늦게 입력하면 신청일보다 이를 수 있다. 교사가 고친 날(manual)만 신청일 이후로 막는다.
    if (rule === 'manual' && manual < at.date) throw new Error('적용일은 신청일(' + at.date + ') 이후여야 합니다: ' + manual);
    cand = { date: manual, rule: rule };
  }
  var from = statusOn_(rows, sid, it, cand.date);
  var out = { kind: mealChangeKind_(it, from, to), date: cand.date, rule: cand.rule, autoDate: autoDate, from: from, blocked: '', superseded: false,
    toCancel: [], followUps: [], warnings: [] };

  // 퇴실 상태인 날의 학사생 값: 조식은 늘, 석식은 퇴실 기록보다 뒤에 신청했거나(신청 일시 순서 — 입력 순서와 무관) 중단일 이후면 막는다.
  // 먼저 신청한 석식이 중단일 전에 적용되면 그대로 두고 아래 followUps가 중단일에 끝낸다(F6 정리가 중단일 이후 행만 취소하는 것과 같다).
  var leave = mealIsHallOnly_(it, to) ? mealLeaveFor_(rows, sid, it, cand.date, req) : null;
  if (leave && leave.date <= cand.date && (it === '조식' || leave.at <= req || cand.date >= leave.stop)) {
    out.kind = 'none'; out.date = ''; out.rule = '';
    out.blocked = cand.date + '에는 학사 퇴실 상태라 ' + it + ' ' + to + '을(를) 새로 신청할 수 없습니다';
    return out;
  }
  // 늦게 입력한 이전 신청서: 더 새 신청이 이미 그 전에 적용되면 이 신청은 영영 적용되지 않는다
  var newer = mine.filter(function (c) {   // 퇴실 정리(F6) 행은 신청이 아니다
    return ruleStr_(c.source) !== 'F6' && ruleIso_(c.requested_at) > req && ruleStr_(c.effective_date) <= cand.date;
  });
  if (newer.length) {
    out.kind = 'none'; out.date = ''; out.rule = ''; out.superseded = true;
    out.warnings.push('더 새 신청(' + newer.map(function (c) { return ruleStr_(c.effective_date) + ' ' + ruleStr_(c.value); }).join(', ') +
      ')이 먼저 적용되어 이 신청은 적용되지 않습니다');
    return out;
  }
  out.toCancel = mealPendingToCancel_(rows, sid, it, cand.date, { source: 'F7', requestedAt: requestedAt, newValue: to });
  var cancelled = {};
  out.toCancel.forEach(function (c) { cancelled[c.id] = true; });
  // 퇴실 정리(F6) 행은 학사생 값을 끝내는 표시다. 이 신청을 저장한 뒤 그 행이 없어도 그날 값이 학사생 값이 아니고 그 행 값과도
  // 다르면(예: 퇴실 뒤·퇴실 전 늦은 입력의 일반 석식) 뜻이 없어졌으므로 함께 취소한다.
  var newRow = { student_id: sid, item: it, value: to, effective_date: cand.date, requested_at: req, status: '유효', created_at: '9999' };
  mine.filter(function (c) { return ruleStr_(c.source) === 'F6' && ruleStr_(c.effective_date) > cand.date; })
    .sort(function (a, b) { return String(a.effective_date) < String(b.effective_date) ? -1 : 1; })
    .forEach(function (f) {
      var others = rows.filter(function (c) { return c !== f && !cancelled[ruleStr_(c.id)]; }).concat([newRow]);
      var without = statusOn_(others, sid, it, ruleStr_(f.effective_date));
      if (without && !mealIsHallOnly_(it, without) && without !== ruleStr_(f.value)) {
        out.toCancel.push({ id: ruleStr_(f.id), effective_date: ruleStr_(f.effective_date), value: ruleStr_(f.value) });
        cancelled[ruleStr_(f.id)] = true;
      }
    });

  // 남아서 이 신청을 나중에 덮는 행 / 이 신청 전에 먼저 적용되는 다른 값의 대기 행 → 경고
  mine.forEach(function (c) {
    if (cancelled[ruleStr_(c.id)]) return;
    var e = ruleStr_(c.effective_date), v = ruleStr_(c.value);
    if (v === to) return;
    if (e > cand.date) out.warnings.push(e + '부터 ' + v + '(으)로 바뀌는 행이 있어 이 신청을 덮습니다(' + (ruleStr_(c.source) || '기록') + ')');
    else if (e > today && e < cand.date) out.warnings.push(e + '부터 ' + v + '(으)로 바뀌는 대기 중인 신청이 먼저 적용됩니다(필요하면 직접 취소)');
  });

  // 학사생 값이 퇴실 뒤 중단일까지 이어지면 퇴실 정리 행을 함께 쓴다(none이어도 — 이전 미실시 대기 행을 취소한 경우).
  // 중단일에 다시 입실해 있으면 쓰지 않는다.
  if (leave && statusOn_(rows, sid, '학사', leave.stop) === '퇴실') {
    var after = rows.filter(function (c) { return !cancelled[ruleStr_(c.id)]; }).concat([newRow]);
    if (mealIsHallOnly_(it, statusOn_(after, sid, it, leave.stop))) {
      out.followUps.push({ item: it, value: '미실시', effective_date: leave.stop, source: 'F6' });
      after.push({ student_id: sid, item: it, value: '미실시', effective_date: leave.stop, requested_at: req, source: 'F6', status: '유효', created_at: '9999' });
    }
    // 중단일 뒤에 다시 입실했으면 재입실일부터 이 신청 값을 다시(R11b — 이 신청의 일부라 source F7). 재입실일에 이미 더 새 신청이
    // 적용되면 되살리지 않는다.
    var back = rows.filter(function (c) {
      var e = ruleStr_(c.effective_date);
      return ruleStr_(c.item) === '학사' && ruleStr_(c.value) === '입실' && e > leave.stop && statusOn_(rows, sid, '학사', e) === '입실';
    }).map(function (c) { return ruleStr_(c.effective_date); }).sort()[0];
    var newerAtBack = back && mine.some(function (c) {
      return !cancelled[ruleStr_(c.id)] && ruleStr_(c.source) !== 'F6' && ruleIso_(c.requested_at) > req && ruleStr_(c.effective_date) <= back;
    });
    var ownAtBack = back && after.some(function (c) {   // 이 신청의 행이 이미 재입실일에 있으면(다시 계획할 때) 또 쓰지 않는다
      return ruleStr_(c.effective_date) === back && ruleStr_(c.value) === to && ruleIso_(c.requested_at) === req && ruleStr_(c.source) !== 'F6';
    });
    // 다른 신청의 행이 같은 값을 주고 있어도 쓴다: 그 행은 그 신청과 함께 취소될 수 있다(늦게 입력된 옛 신청서가 취소하는 경우)
    if (back && !newerAtBack && !ownAtBack) out.followUps.push({ item: it, value: to, effective_date: back, source: 'F7' });
  }
  return out;
}

/**
 * date의 학사생 값 신청이 닿는 학사 퇴실: date에 퇴실 상태면 그 퇴실(date 이전 가장 늦은 퇴실 행), 아니면 date 뒤 가장 이른 퇴실 행.
 * → {date: 퇴실일, at: 퇴실 기록의 신청 일시, stop: 중단일(조식 = 퇴실일, 석식 = 결정 35 미실시 규칙)} 또는 null
 */
function mealLeaveFor_(rows, sid, item, date, req) {
  var inLeave = statusOn_(rows, sid, '학사', date) === '퇴실', row = null, e0 = '';
  rows.forEach(function (c) {
    var e = ruleStr_(c.effective_date);
    if (ruleStr_(c.item) !== '학사' || ruleStr_(c.value) !== '퇴실' || statusOn_(rows, sid, '학사', e) !== '퇴실') return;
    if (inLeave ? e <= date && (!row || e > e0) : e > date && (!row || e < e0)) { row = c; e0 = e; }
  });
  if (!row) return null;
  var at = ruleIso_(row.requested_at);
  try {
    return { date: e0, at: at, stop: item === '조식' ? e0 : mealEffectiveDate_('stop', at, { leaveDate: e0 }).date };
  } catch (err) {
    // shortcut: 퇴실 기록의 신청 일시가 비었거나 형식이 틀리면 이 신청 일시로 본다(막힘·중단일이 입력 순서를 따른다), F6 아닌 경로로 퇴실을 쓰게 되면 고친다
    return { date: e0, at: req, stop: item === '조식' ? e0 : mealEffectiveDate_('stop', req, { leaveDate: e0 }).date };
  }
}

/**
 * 새 급식 변경 행(적용일 effectiveDate)을 저장할 때 '취소'로 바꿔야 할 행들. → [{id, effective_date, value}](적용일 순)
 * opts = {source:'F7'|'F6', requestedAt:새 행의 신청 일시, newValue:새 행의 값}
 * 공통: 같은 학생·같은 항목, status 유효(빈칸 포함), 적용일이 달력 날짜(statusOn_과 같은 검사). 오늘과는 상관없다
 *   (늦게 입력했거나 이미 적용된 행이어도 아래 조건이면 취소한다).
 * - 새 행이 F7: F6 아닌 행 중 적용일이 effectiveDate보다 늦고 신청 일시가 새 행 이전(같으면 먼저 저장된 행이 이전)이며 값이 새 값과
 *   다른 행. F6 행(퇴실 정리)은 여기서 취소하지 않는다 — 뜻이 없어진 F6 행은 mealPlanChange_가 따로 찾아 toCancel에 넣는다.
 * - 새 행이 F6(퇴실 정리, effectiveDate = 조식은 퇴실일, 석식은 결정 35의 중단일): 적용일이 effectiveDate **이상**인 F6 아닌
 *   행 중 학사생 값(조식 '실시'·석식 '학사 석식')인 행 전부(신청 일시·오늘과 상관없이 — PRD F6 "퇴실일부터 바로 중단").
 *   미실시·일반 석식 신청은 퇴실과 상관없이 남긴다.
 * 퇴실 정리(F6) 순서: ① 학사 '퇴실' 행 ② 항목마다 mealPendingToCancel_(…, 중단일, {source:'F6'})를 취소 ③ 그 뒤에도 중단일의 값
 *   (statusOn_)이 학사생 값이면 그날 '미실시' 행을 source 'F6'으로 쓴다(이미 미실시·일반 석식이면 쓰지 않는다).
 * F6·F7은 새 행을 쓰는 같은 락 안에서 이 행들의 status를 '취소'로 바꾸고 audit_log에 남긴다.
 */
function mealPendingToCancel_(changes, studentId, item, effectiveDate, opts) {
  opts = opts || {};
  var sid = ruleStr_(studentId), it = ruleStr_(item), eff = ruleStr_(effectiveDate);
  if (!ymdIsValid_(eff)) throw new Error('적용일 형식이 아닙니다(yyyy-MM-dd): ' + effectiveDate);
  var fromF6 = (ruleStr_(opts.source) || 'F7') === 'F6';
  var req = ruleIso_(opts.requestedAt);
  var nv = ruleStr_(opts.newValue);
  return (changes || []).filter(function (c) {
    if (!c || !ruleRowLive_(c) || ruleStr_(c.student_id) !== sid || ruleStr_(c.item) !== it) return false;
    var e = ruleStr_(c.effective_date);
    if (!ymdIsValid_(e)) return false;
    var isF6 = ruleStr_(c.source) === 'F6';
    if (fromF6) return !isF6 && e >= eff && mealIsHallOnly_(it, ruleStr_(c.value));
    if (e <= eff || isF6 || (nv && ruleStr_(c.value) === nv)) return false;   // F6 행은 mealPlanChange_가 따로 본다. 같은 값은 덮을 필요 없음
    return !req || ruleIso_(c.requested_at) <= req;
  }).map(function (c) {
    return { id: ruleStr_(c.id), effective_date: ruleStr_(c.effective_date), value: ruleStr_(c.value) };
  }).sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0; });
}

/**
 * 그날 식수 집계(PRD F7, 결정 35, stage2.md 4-2). 아무것도 쓰지 않는다.
 * students = students 행(id, gender 남·여, grade), enrollments = 등록 행(term_id, student_id), changes = status_changes 전부.
 * → {groups:{'여1':{hall, dorm, nonDorm, breakfast, hallDinner, generalDinner}, …, '여 합계', '남 합계', '1학년'…, '전체'},
 *    afterLeaveHallDinner, unknownGroup:[studentId], warnings}
 * - 대상: termId 기간에 등록된 학생(그날 상태 그대로, 결석·외박은 빼지 않는다). 등록 안 된 학생은 세지 않는다.
 * - 학사(hall) = 학사 '입실', 기숙(dorm) = 학사 입실이면서 기숙사 '입실', 비기숙 = 학사 입실이면서 기숙 아님.
 * - 조식·석식은 학사 상태로 거르지 않는다(결정 35: 퇴실한 학생도 석식 중단일 전까지 학사 석식). afterLeaveHallDinner = 학사 석식인데 학사 입실 아님.
 * - 줄: 성별+학년('여1'…'남3'), '여 합계'·'남 합계', 'N학년', '전체'. 합계 줄 = 부분 합.
 * ASSUMPTION: 성별(남·여)이나 학년이 비었거나 다른 학생은 어느 줄에도 넣지 않고 unknownGroup + 경고(합계 줄이 부분 합과 맞게).
 */
function mealCountsOn_(students, enrollments, changes, termId, ymd) {
  var tid = ruleStr_(termId), day = ruleStr_(ymd);
  if (!ymdIsValid_(day)) throw new Error('날짜 형식이 아닙니다(yyyy-MM-dd): ' + ymd);
  var byId = {};
  (students || []).forEach(function (s) { if (s) byId[ruleStr_(s.id)] = s; });
  var zero = function () { return { hall: 0, dorm: 0, nonDorm: 0, breakfast: 0, hallDinner: 0, generalDinner: 0 }; };
  var groups = {}, grades = { '1': true, '2': true, '3': true }, seen = {};
  var out = { groups: groups, afterLeaveHallDinner: 0, unknownGroup: [], warnings: [] };
  var rows = [];
  (enrollments || []).forEach(function (e) {
    var sid = ruleStr_(e && e.student_id);
    if (!e || ruleStr_(e.term_id) !== tid || !sid || seen[sid]) return;
    seen[sid] = true;
    var s = byId[sid], g = ruleStr_(s && s.gender), gr = ruleStr_(s && s.grade);
    if (!s || (g !== '남' && g !== '여') || !/^\d+$/.test(gr)) {
      out.unknownGroup.push(sid);
      out.warnings.push(sid + ' 학생의 성별·학년을 알 수 없어 식수 줄에 넣지 않았습니다');
      return;
    }
    grades[gr] = true;
    var hall = statusOn_(changes, sid, '학사', day) === '입실', dorm = hall && statusOn_(changes, sid, '기숙사', day) === '입실';
    var dinner = statusOn_(changes, sid, '석식', day);
    if (dinner === '학사 석식' && !hall) out.afterLeaveHallDinner++;
    rows.push({ keys: [g + gr, g + ' 합계', gr + '학년', '전체'], v: { hall: +hall, dorm: +dorm, nonDorm: +(hall && !dorm),
      breakfast: +(statusOn_(changes, sid, '조식', day) === '실시'), hallDinner: +(dinner === '학사 석식'), generalDinner: +(dinner === '일반 석식') } });
  });
  var gl = Object.keys(grades).sort(function (a, b) { return a - b; });
  ['여', '남'].forEach(function (g) { gl.forEach(function (gr) { groups[g + gr] = zero(); }); groups[g + ' 합계'] = zero(); });
  gl.forEach(function (gr) { groups[gr + '학년'] = zero(); });
  groups['전체'] = zero();
  rows.forEach(function (r) {
    r.keys.forEach(function (k) { Object.keys(r.v).forEach(function (m) { groups[k][m] += r.v[m]; }); });
  });
  return out;
}
