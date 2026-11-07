/**
 * 입퇴실 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F6·F7, 결정 3·23①·35, docs/plan/stage2.md R11a·4-2).
 *
 * 순수 함수만 둔다. DateRules.gs(ymd…·isoLocalSplit_·ruleStr_)·StatusRules.gs(statusOn_)·MealRules.gs(mealEffectiveDate_·
 * mealPendingToCancel_·mealPlanChange_·mealIsHallOnly_)를 부른다. 아무것도 쓰지 않고 쓸 행만 돌려준다.
 * changes = 그 학생의 status_changes 행(취소 포함 그대로).
 */

/**
 * 입퇴실 하나의 계획.
 * move = {type:'학사 입실'|'학사 퇴실'|'기숙사 입실'|'기숙사 퇴실'|'학사 및 기숙사 퇴실', effectiveDate, requestedAt,
 *         dinner:'중단'(기본)|'일반 석식', breakfastWithDorm(기본 true), breakfastStopWithDorm(기본 true),
 *         meals:{조식, 석식}(학사 입실 때 시작할 급식 값, 선택 — R11b)}
 * opts = {today(필수), cutoff}
 * → {errors, warnings, rows:[{item, value, effective_date, effective_date_auto, requested_at, reason, source, head}],
 *    toCancel:[{id, cancel_reason}], summary:{date, breakfast:{value, from}|null, dinner:{value, from}|null}}
 * errors가 있으면 rows·toCancel은 비어 있다(쓰지 않는다).
 *
 * - 대표 행(head:true): 학사·기숙사 값, source 'F6', 적용일 = effectiveDate. '학사 및 기숙사 퇴실'은 학사 퇴실(대표) + 기숙사 퇴실(연결).
 *   F6 저장은 연결 행의 linked_change_id = 대표 행 id, toCancel의 cancel_reason 앞에 '[자동] <대표 행 id> '를 붙인다.
 * - 학사 퇴실 정리(rules-api.md R6 순서): 조식 중단일 = 퇴실일, 석식 중단일 = mealEffectiveDate_('stop', 신청 일시, {leaveDate})
 *   (결정 35). 중단일 이상 학사생 값 행을 취소하고, 그래도 중단일 값이 학사생 값이면 그날 '미실시'(source 'F6').
 *   석식 '일반 석식'을 고르면 일반 석식 신청(source 'F7', 11:30 규칙 — 퇴실일보다 이르지 않게, 값이 같아도 쓴다 — 늦게 입력된 옛
 *   신청서가 덮지 못하게)을 쓰고, 학사 석식 정리는 그 날(쓰지 못했으면 결정 35 중단일)부터 늘 한다.
 * - 기숙사 입실 + 조식: 조식 실시 @입실일(rule entry_date, source 'F7'). 기숙사 퇴실 + 조식 미실시: 미실시 규칙, 기숙사 퇴실일보다
 *   이르지 않게(source 'F7'). 이미 그 값이고 취소할 대기 행도 없으면 급식 행을 쓰지 않는다.
 * - 상태 검사(적용일 기준): 이미 같은 상태, 학사생 아닌 학생의 기숙사 입실, 기숙사생의 '학사 퇴실'(→ '학사 및 기숙사 퇴실').
 * - requestedAt은 날짜+시각 전체(followups R6-3 — 날짜뿐이면 석식 중단일이 입력 순서를 따른다), 오늘보다 미래면 오류.
 * ASSUMPTION(4-2): 기숙사 퇴실의 "조식도 미실시"는 기본으로 켠다. 기숙사 입실의 "조식도 입실일부터"도 기본으로 켠다.
 * - 학사 입실(R11b, 재입실·학기 중 신규): 직전 학사 퇴실의 정리 행 중 아직 오지 않은(입실일 이후) F6 급식 미실시 행을 취소하고,
 *   급식은 move.meals(없으면 직전 퇴실 전날의 값)를 입실일부터 시작한다(rule entry_date, F7, 값이 같아도 쓴다 — 그날부터의 의도라
 *   늦게 입력된 옛 신청서가 덮지 못하게). 직전 퇴실이 없고 meals도 없으면 대표 행만.
 *   ASSUMPTION(4-2): 재입실 급식 기본값 = 퇴실 전 값.
 */
function movePlan_(changes, studentId, move, opts) {
  opts = opts || {};
  move = move || {};
  var today = ruleStr_(opts.today);
  if (!ymdIsValid_(today)) throw new Error('today가 필요합니다(yyyy-MM-dd): ' + opts.today);
  var sid = ruleStr_(studentId), type = ruleStr_(move.type), E = ruleStr_(move.effectiveDate), at = ruleStr_(move.requestedAt);
  var out = { errors: [], warnings: [], rows: [], toCancel: [], toRestore: [], summary: { date: E, breakfast: null, dinner: null } };
  var types = { '학사 입실': [['학사', '입실']], '학사 퇴실': [['학사', '퇴실']], '기숙사 입실': [['기숙사', '입실']],
    '기숙사 퇴실': [['기숙사', '퇴실']], '학사 및 기숙사 퇴실': [['학사', '퇴실'], ['기숙사', '퇴실']] };
  if (!types[type]) out.errors.push('입퇴실 유형이 아닙니다: ' + type);
  if (!ymdIsValid_(E)) out.errors.push('적용일 형식이 아닙니다(yyyy-MM-dd): ' + E);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(at)) out.errors.push('신청 일시는 날짜와 시각이 모두 필요합니다(yyyy-MM-ddTHH:mm): ' + at);
  else if (isoLocalSplit_(at).date > today) out.errors.push('신청 일시가 오늘보다 미래입니다: ' + at);
  if (out.errors.length) return out;

  var live = (changes || []).filter(function (c) { return c && ruleRowLive_(c) && ruleStr_(c.student_id) === sid; });
  var hall = statusOn_(live, sid, '학사', E), dorm = statusOn_(live, sid, '기숙사', E);
  if (type === '학사 입실' && hall === '입실') out.errors.push(E + '에 이미 학사 입실 상태입니다');
  if (/퇴실$/.test(type) && type !== '기숙사 퇴실' && hall !== '입실') out.errors.push(E + '에 학사 입실 상태가 아닙니다');
  if (type === '학사 퇴실' && dorm === '입실') out.errors.push("기숙사생입니다. '학사 및 기숙사 퇴실'로 처리해 주세요");
  if (type === '기숙사 입실' && hall !== '입실') out.errors.push('학사생만 기숙사에 입실할 수 있습니다');
  if (type === '기숙사 입실' && dorm === '입실') out.errors.push(E + '에 이미 기숙사 입실 상태입니다');
  if ((type === '기숙사 퇴실' || type === '학사 및 기숙사 퇴실') && dorm !== '입실') out.errors.push(E + '에 기숙사 입실 상태가 아닙니다');
  // 적용일 뒤의 입퇴실 기록은 이 계획이 뒤집을 수 있어(상태 검사는 그날 하루만 본다) 먼저 취소하게 한다
  if (live.some(function (c) { return /^(학사|기숙사)$/.test(ruleStr_(c.item)) && ruleStr_(c.effective_date) > E; })) {
    out.errors.push(E + ' 이후 날짜에 입퇴실 기록이 있습니다 — 먼저 취소해 주세요');
  }
  if (out.errors.length) return out;
  if (E < today) out.warnings.push('적용일(' + E + ')이 오늘보다 이릅니다: 지난 출석부·식수가 바뀝니다');

  var add = function (item, value, date, auto, reason, source) {
    var row = { item: item, value: value, effective_date: date, effective_date_auto: auto, requested_at: at, reason: reason, source: source, head: !out.rows.length };
    out.rows.push(row);
    live.push({ id: 'new' + out.rows.length, student_id: sid, item: item, value: value, effective_date: date, requested_at: ruleIso_(at), source: source, status: '유효', created_at: '9999' });
  };
  var cancel = function (list, reason) {
    list.forEach(function (c) {
      out.toCancel.push({ id: c.id, cancel_reason: reason });
      live = live.filter(function (x) { return ruleStr_(x.id) !== c.id; });
    });
  };
  var meal = function (item, to, mopts, reason, always) {   // 급식 신청(F7)을 같은 계획에 넣는다 → 쓴 날 또는 ''(always면 값이 같아도 쓴다)
    var p = mealPlanChange_(live, sid, item, to, at, Object.assign({ today: today, cutoff: opts.cutoff }, mopts));
    out.warnings = out.warnings.concat(p.warnings);
    if (p.blocked || p.superseded) { out.warnings.push(item + ' ' + to + ' 신청은 쓰지 않습니다: ' + (p.blocked || '더 새 신청이 있습니다')); return ''; }
    if (!always && p.kind === 'none' && !p.toCancel.length && !p.followUps.length) return '';   // 이미 그 값이면 행을 늘리지 않는다
    cancel(p.toCancel, reason);
    add(item, to, p.date, mopts.effectiveRule === 'entry_date' ? p.date : p.autoDate, reason, 'F7');
    p.followUps.forEach(function (f) { add(f.item, f.value, f.effective_date, f.effective_date, reason, f.source); });
    out.summary[item === '조식' ? 'breakfast' : 'dinner'] = { value: to, from: p.date };
    return p.date;
  };
  // 퇴실 정리(F6): 중단일 이상 학사생 값 취소 → 그 행들이 '[자동] <그 행 id>'로 취소했던 행 중 더 새 신청에 덮이지 않는 것을
  // 되살린다(입력 순서와 무관하게, 총괄 결정 (a)) → 그래도 중단일 값이 학사생 값이면 미실시
  var stopHall = function (item, stop, reason) {
    var gone = mealPendingToCancel_(live, sid, item, stop, { source: 'F6' });
    cancel(gone, reason);
    gone.forEach(function (x) {
      moveRestorable_(changes, live, x.id).forEach(function (r) {
        if (mealIsHallOnly_(item, ruleStr_(r.value)) && ruleStr_(r.effective_date) >= stop) return;   // 되살려도 이 정리가 다시 취소할 행
        out.toRestore.push({ id: ruleStr_(r.id) });
        live.push(Object.assign({}, r, { status: '유효' }));
      });
    });
    if (mealIsHallOnly_(item, statusOn_(live, sid, item, stop))) {
      add(item, '미실시', stop, stop, reason, 'F6');
      out.summary[item === '조식' ? 'breakfast' : 'dinner'] = { value: '미실시', from: stop };
    }
  };

  types[type].forEach(function (s) { add(s[0], s[1], E, E, type, 'F6'); });
  if (type === '학사 퇴실' || type === '학사 및 기숙사 퇴실') {
    stopHall('조식', E, '학사 퇴실 조식 중단');
    // 일반 석식을 골라도 학사 석식 정리는 늘 한다(일반 석식 신청이 막히거나 더 새 학사 석식이 있으면 끝없이 학사 석식으로 남는다)
    var general = ruleStr_(move.dinner) === '일반 석식' ? meal('석식', '일반 석식', { leaveDate: E }, '학사 퇴실 일반 석식으로', true) : '';   // 고른 값은 그날부터의 의도라 늘 쓴다
    stopHall('석식', general || mealEffectiveDate_('stop', at, { leaveDate: E }).date, '학사 퇴실 석식 중단');
  }
  if (type === '학사 입실') {
    var lastLeave = live.filter(function (c) { return ruleStr_(c.item) === '학사' && ruleStr_(c.value) === '퇴실' && ruleStr_(c.effective_date) < E; })
      .sort(function (a, b) { return ruleStr_(a.effective_date) < ruleStr_(b.effective_date) ? -1 : 1; }).pop();
    cancel(live.filter(function (c) {
      return ruleStr_(c.source) === 'F6' && /^(조식|석식)$/.test(ruleStr_(c.item)) && ruleStr_(c.value) === '미실시' && ruleStr_(c.effective_date) >= E &&
        lastLeave && ruleStr_(c.effective_date) >= ruleStr_(lastLeave.effective_date);
    }).map(function (c) { return { id: ruleStr_(c.id) }; }), '학사 재입실 퇴실 정리 취소');
    ['조식', '석식'].forEach(function (item) {
      var v = ruleStr_((move.meals || {})[item]) || (lastLeave ? statusOn_(live, sid, item, ymdAddDays_(ruleStr_(lastLeave.effective_date), -1)) : '');
      if (v) meal(item, v, { effectiveDate: E, effectiveRule: 'entry_date' }, '학사 입실 급식', true);   // 재입실일부터의 의도(늦게 입력된 옛 신청서가 덮지 못하게)
    });
  }
  if (type === '기숙사 입실' && move.breakfastWithDorm !== false) meal('조식', '실시', { effectiveDate: E, effectiveRule: 'entry_date' }, '기숙사 입실 조식');
  if (type === '기숙사 퇴실' && move.breakfastStopWithDorm !== false) meal('조식', '미실시', { leaveDate: E }, '기숙사 퇴실 조식 미실시');
  return out;
}

/**
 * 입퇴실 취소(퇴실 되돌림, R11b). headId = movePlan_으로 쓴 대표 행 id. 아무것도 쓰지 않는다.
 * opts = {today} → {toCancel:[{id}], toRestore:[{id}], warnings}
 * - toCancel: 대표 행 + 연결 행(linked_change_id = headId) 중 살아 있는 것. 대표가 학사 퇴실이면 그 퇴실의 중단일(조식 퇴실일,
 *   석식 결정 35)에 있는 F6 급식 미실시 행도(급식 신청의 followUps로 쓴 것 포함) — 남은 다른 학사 퇴실이 같은 날을 중단일로 쓰면 둔다.
 * - toRestore: 취소된 행 중 cancel_reason이 '[자동] <headId>'로 시작하거나 memo에 그 꼬리표가 있는 행(5절 5번 승인 전에는 memo),
 *   되살려도 더 새 신청에 덮이지 않는 것만 — 신청 일시가 더 늦고 적용일이 그 행 이하인 같은 항목의 신청 행(F6 제외)이 있으면 빼고 경고.
 * - 되살린 신청 행은 처음 저장될 때처럼 그보다 먼저 신청했는데 더 늦게 적용되는 다른 값의 행(그동안 늦게 입력된 옛 신청서)을
 *   toCancel에 더한다(mealPendingToCancel_ F7, 새 신청부터).
 * - 대표 행이 없거나 이미 취소면 경고만. 적용일 < today면 경고(지난 출석부·식수가 바뀜).
 * ASSUMPTION: 언제 누가 취소할 수 있는지(적용일 전 담당교사·관리자, 지난 뒤 관리자, 4-2)는 저장 쪽이 판정한다.
 */
function moveUndoPlan_(changes, headId, opts) {
  opts = opts || {};
  var hid = ruleStr_(headId), rows = changes || [];
  var out = { toCancel: [], toRestore: [], warnings: [] };
  var head = rows.filter(function (c) { return c && ruleStr_(c.id) === hid; })[0];
  if (!head || !ruleRowLive_(head)) { out.warnings.push('취소할 입퇴실 행이 없거나 이미 취소되었습니다: ' + hid); return out; }
  var sid = ruleStr_(head.student_id), L = ruleStr_(head.effective_date);
  if (ymdIsValid_(ruleStr_(opts.today)) && L < ruleStr_(opts.today)) out.warnings.push('적용일(' + L + ')이 지났습니다: 지난 출석부·식수가 바뀝니다');
  var gone = {};
  rows.forEach(function (c) {
    if (c && ruleRowLive_(c) && (ruleStr_(c.id) === hid || ruleStr_(c.linked_change_id) === hid)) gone[ruleStr_(c.id)] = true;
  });
  if (ruleStr_(head.item) === '학사' && ruleStr_(head.value) === '퇴실') {
    var stops = function (leave) {
      var at = ruleStr_(leave.requested_at), e = ruleStr_(leave.effective_date), st = { '조식': e, '석식': '' };
      try { st['석식'] = mealEffectiveDate_('stop', at, { leaveDate: e }).date; } catch (err) { st['석식'] = ''; }
      return st;
    };
    var mine = stops(head), others = rows.filter(function (c) {
      return c && ruleRowLive_(c) && !gone[ruleStr_(c.id)] && ruleStr_(c.student_id) === sid && ruleStr_(c.item) === '학사' && ruleStr_(c.value) === '퇴실';
    }).map(stops);
    rows.forEach(function (c) {
      var item = ruleStr_(c && c.item), e = ruleStr_(c && c.effective_date);
      if (!c || !ruleRowLive_(c) || ruleStr_(c.student_id) !== sid || ruleStr_(c.source) !== 'F6' || ruleStr_(c.value) !== '미실시') return;
      if ((item === '조식' || item === '석식') && mine[item] === e && !others.some(function (o) { return o[item] === e; })) gone[ruleStr_(c.id)] = true;
    });
  }
  var tag = '[자동] ' + hid, restore = [];
  var after = rows.filter(function (c) { return c && ruleRowLive_(c) && !gone[ruleStr_(c.id)]; });
  rows.forEach(function (c) {
    if (!c || ruleRowLive_(c) || (ruleStr_(c.cancel_reason).indexOf(tag) !== 0 && ruleStr_(c.memo).indexOf(tag) < 0)) return;
    var req = ruleIso_(c.requested_at), e = ruleStr_(c.effective_date);
    var newer = after.filter(function (x) {
      return ruleStr_(x.student_id) === ruleStr_(c.student_id) && ruleStr_(x.item) === ruleStr_(c.item) && ruleStr_(x.source) !== 'F6' &&
        ruleIso_(x.requested_at) > req && ruleStr_(x.effective_date) <= e;
    });
    if (newer.length) out.warnings.push(e + ' ' + ruleStr_(c.item) + ' ' + ruleStr_(c.value) + ' 행은 더 새 신청이 있어 되살리지 않습니다');
    else restore.push(c);
  });
  // 되살린 신청 행은 그 신청이 처음 저장될 때처럼, 그보다 먼저 신청했는데 더 늦게 적용되는 다른 값의 행을 취소한다
  // (그 행이 취소돼 있던 동안 늦게 입력된 옛 신청서). 새 신청부터 차례로 — 되살릴 행끼리도 같은 규칙.
  restore.sort(function (a, b) { return ruleIso_(a.requested_at) > ruleIso_(b.requested_at) ? -1 : 1; });
  var back = {};
  restore.forEach(function (c) {
    if (gone[ruleStr_(c.id)]) return;
    back[ruleStr_(c.id)] = true;
    if (!/^(조식|석식)$/.test(ruleStr_(c.item)) || ruleStr_(c.source) === 'F6') return;
    var now = rows.filter(function (x) { return x && (ruleRowLive_(x) || back[ruleStr_(x.id)]) && !gone[ruleStr_(x.id)]; })
      .map(function (x) { return back[ruleStr_(x.id)] ? Object.assign({}, x, { status: '유효' }) : x; });
    mealPendingToCancel_(now, sid, ruleStr_(c.item), ruleStr_(c.effective_date), { source: 'F7', requestedAt: c.requested_at, newValue: ruleStr_(c.value) })
      .forEach(function (x) { gone[x.id] = true; delete back[x.id]; });
  });
  out.toRestore = Object.keys(back).map(function (id) { return { id: id }; });
  out.toCancel = Object.keys(gone).map(function (id) { return { id: id }; });
  return out;
}

/**
 * 행 tagId가 '[자동] <tagId>'로 취소했던 행(cancel_reason, 없으면 memo) 중 되살려도 더 새 신청에 덮이지 않는 것.
 * 덮임 = 같은 학생·항목의 살아 있는 신청 행(F6 제외)이 신청 일시가 더 늦고 적용일이 그 행 이하. live = 지금 살아 있는 행(계획 반영).
 */
function moveRestorable_(changes, live, tagId) {
  var tag = '[자동] ' + ruleStr_(tagId);
  return (changes || []).filter(function (c) {
    if (!c || ruleRowLive_(c) || (ruleStr_(c.cancel_reason).indexOf(tag) !== 0 && ruleStr_(c.memo).indexOf(tag) < 0)) return false;
    var req = ruleIso_(c.requested_at), e = ruleStr_(c.effective_date);
    return !live.some(function (x) {
      return ruleRowLive_(x) && ruleStr_(x.student_id) === ruleStr_(c.student_id) && ruleStr_(x.item) === ruleStr_(c.item) && ruleStr_(x.source) !== 'F6' &&
        ruleIso_(x.requested_at) > req && ruleStr_(x.effective_date) <= e;
    });
  });
}
