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
 *         dinner:'중단'(기본)|'일반 석식', breakfastWithDorm(기본 true), breakfastStopWithDorm(기본 true)}
 * opts = {today(필수), cutoff}
 * → {errors, warnings, rows:[{item, value, effective_date, effective_date_auto, requested_at, reason, source, head}],
 *    toCancel:[{id, cancel_reason}], summary:{date, breakfast:{value, from}|null, dinner:{value, from}|null}}
 * errors가 있으면 rows·toCancel은 비어 있다(쓰지 않는다).
 *
 * - 대표 행(head:true): 학사·기숙사 값, source 'F6', 적용일 = effectiveDate. '학사 및 기숙사 퇴실'은 학사 퇴실(대표) + 기숙사 퇴실(연결).
 *   F6 저장은 연결 행의 linked_change_id = 대표 행 id, toCancel의 cancel_reason 앞에 '[자동] <대표 행 id> '를 붙인다.
 * - 학사 퇴실 정리(rules-api.md R6 순서): 조식 중단일 = 퇴실일, 석식 중단일 = mealEffectiveDate_('stop', 신청 일시, {leaveDate})
 *   (결정 35). 중단일 이상 학사생 값 행(석식은 퇴실 기록 이후에 신청한 퇴실일 이상 학사 석식도)을 취소하고, 그래도 중단일 값이
 *   학사생 값이면(정리 전 학사생 값이었는데 값이 없어져도) 그날 '미실시'(source 'F6'). 취소한 행의 꼬리표로 되살림(결정 55·58).
 *   석식 '일반 석식'을 고르면 일반 석식 신청(source 'F7', 11:30 규칙 — 퇴실일보다 이르지 않게, 값이 같아도 쓴다 — 늦게 입력된 옛
 *   신청서가 덮지 못하게)을 쓰고, 학사 석식 정리는 그 날(쓰지 못했으면 결정 35 중단일)부터 늘 한다.
 * - 기숙사 입실 + 조식: 조식 실시 @입실일(rule entry_date, source 'F7'). 기숙사 퇴실 + 조식 미실시: 미실시 규칙, 기숙사 퇴실일보다
 *   이르지 않게(source 'F7'). 이미 그 값이고 취소할 대기 행도 없으면 급식 행을 쓰지 않는다.
 * - 상태 검사(적용일 기준): 이미 같은 상태, 학사생 아닌 학생의 기숙사 입실, 기숙사생의 '학사 퇴실'(→ '학사 및 기숙사 퇴실').
 * - requestedAt은 날짜+시각 전체(followups R6-3 — 날짜뿐이면 석식 중단일이 입력 순서를 따른다), 오늘보다 미래면 오류.
 * ASSUMPTION(4-2): 기숙사 퇴실의 "조식도 미실시"는 기본으로 켠다. 기숙사 입실의 "조식도 입실일부터"도 기본으로 켠다.
 * ASSUMPTION: 학사 입실(재입실 포함)의 급식은 R11b에서 정한다 — 지금은 대표 행만.
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
  // 퇴실 기록 이후에 신청한 퇴실일 이상 학사 석식(mealPlanChange_ blocked의 거울) — 이 퇴실 정리가 취소한다
  var postLeaveHall = function (c) {
    return ruleStr_(c.item) === '석식' && ruleStr_(c.value) === '학사 석식' && ruleStr_(c.source) !== 'F6' &&
      ruleStr_(c.effective_date) >= E && ruleIso_(c.requested_at) >= ruleIso_(at);
  };
  var meal = function (item, to, mopts, reason, always) {   // 급식 신청(F7)을 같은 계획에 넣는다 → 쓴 날 또는 ''(always면 값이 같아도 쓴다)
    // 퇴실과 함께 고른 급식은 이 퇴실 정리가 곧 취소할 행(퇴실 뒤 학사 석식)에 밀리지 않는다(입력 순서와 무관)
    var src = mopts.leaveDate ? live.filter(function (c) { return !postLeaveHall(c); }) : live;
    var p = mealPlanChange_(src, sid, item, to, at, Object.assign({ today: today, cutoff: opts.cutoff }, mopts));
    if (p.blocked || p.superseded) { out.warnings.push(item + ' ' + to + ' 신청은 쓰지 않습니다: ' + (p.blocked || '더 새 신청이 있습니다')); return ''; }
    if (!always && p.kind === 'none' && !p.toCancel.length && !p.followUps.length) return '';   // 이미 그 값이면 행을 늘리지 않는다(경고도 없음)
    out.warnings = out.warnings.concat(p.warnings);
    cancel(p.toCancel, reason);
    add(item, to, p.date, mopts.effectiveRule === 'entry_date' ? p.date : p.autoDate, reason, 'F7');
    p.followUps.forEach(function (f) { add(f.item, f.value, f.effective_date, f.effective_date, reason, f.source); });
    out.summary[item === '조식' ? 'breakfast' : 'dinner'] = { value: to, from: p.date };
    return p.date;
  };
  // 퇴실 정리(F6): 중단일 이상 학사생 값 취소(석식은 퇴실 기록 이후에 신청한 퇴실일 이상 학사 석식도 — mealPlanChange_ 막힘의 거울)
  // → 그 행들이 '[자동] <그 행 id>'로 취소했던 행 중 더 새 신청에 덮이지 않는 것을 되살린다(입력 순서와 무관하게, 결정 55·58)
  // → 그래도 중단일 값이 학사생 값이면(정리 전 학사생 값이었는데 이제 값이 없어도) 미실시
  var stopHall = function (item, stop, reason) {
    var before = statusOn_(live, sid, item, stop);
    var gone = mealPendingToCancel_(live, sid, item, stop, { source: 'F6' });
    live.forEach(function (c) { if (postLeaveHall(c) && ruleStr_(c.effective_date) < stop) gone.push({ id: ruleStr_(c.id) }); });
    cancel(gone, reason);
    var back = [];
    gone.forEach(function (x) {
      moveRestorable_(changes, live, x.id, function (r) {   // 되살려도 이 정리가 다시 취소할 행은 처음부터 뺀다(더 이른 행을 막지 않게)
        return (mealIsHallOnly_(item, ruleStr_(r.value)) && ruleStr_(r.effective_date) >= stop) || postLeaveHall(r);
      }).forEach(function (r) {
        out.toRestore.push({ id: ruleStr_(r.id) });
        live.push(Object.assign({}, r, { status: '유효' }));
        back.push(r);
      });
    });
    // 되살린 신청은 처음 저장될 때처럼 그보다 먼저 신청했는데 더 늦게 적용되는 다른 값의 행을 취소한다(superseded로 저장돼 자기 취소를
    // 못 했거나, 취소돼 있던 동안 늦게 입력된 옛 신청서). 새 신청부터. 꼬리표는 되살린 행 id(그 행이 다시 끊기면 돌아오게)
    back.sort(function (a, b) { return ruleIso_(a.requested_at) > ruleIso_(b.requested_at) ? -1 : 1; }).forEach(function (r) {
      if (!live.some(function (c) { return ruleStr_(c.id) === ruleStr_(r.id); })) return;
      cancel(mealPendingToCancel_(live, sid, item, ruleStr_(r.effective_date), { source: 'F7', requestedAt: r.requested_at, newValue: ruleStr_(r.value) }),
        '[자동] ' + ruleStr_(r.id) + ' 되살린 신청으로 대체');
    });
    var now = statusOn_(live, sid, item, stop);
    if (mealIsHallOnly_(item, now) || (!now && mealIsHallOnly_(item, before))) {
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
    // 일반 석식 신청의 "X일부터 학사 석식 행이 이 신청을 덮습니다" 경고 중 이 계획이 취소한 행을 가리키는 것은 뺀다
    var goneIds = {};
    out.toCancel.forEach(function (c) { goneIds[c.id] = true; });
    out.warnings = out.warnings.filter(function (w) {
      return !(changes || []).some(function (c) {
        return goneIds[ruleStr_(c.id)] && ruleStr_(c.item) === '석식' && w.indexOf(ruleStr_(c.effective_date) + '부터 ' + ruleStr_(c.value) + '(으)로 바뀌는 행이 있어') === 0;
      });
    });
  }
  if (type === '기숙사 입실' && move.breakfastWithDorm !== false) meal('조식', '실시', { effectiveDate: E, effectiveRule: 'entry_date' }, '기숙사 입실 조식');
  if (type === '기숙사 퇴실' && move.breakfastStopWithDorm !== false) meal('조식', '미실시', { leaveDate: E }, '기숙사 퇴실 조식 미실시');
  return out;
}

/**
 * 행 tagId가 '[자동] <tagId> …'로 취소했던 행(cancel_reason, 결정 41) 중 되살려도 더 새 신청에 덮이지 않는 것.
 * 덮임 = 같은 학생·항목의 신청 행(F6 제외)이 신청 일시가 더 늦고 적용일이 그 행 이하 — live(지금 살아 있는 행, 계획 반영)와
 * 함께 되살아나는 행 모두에서 본다(신청 일시가 늦은 것부터 정해 서로 덮는 것도 거른다).
 * 꼬리표 = superseded 신청서(결정 58)·F7 신청이 대체한 행(C17a)·퇴실 정리가 취소한 행(F6). skip(행)이 참인 행은 처음부터 뺀다
 * (되살려도 곧 다시 취소할 행 — 덮임 검사에도 넣지 않는다).
 */
function moveRestorable_(changes, live, tagId, skip) {
  var tag = '[자동] ' + ruleStr_(tagId) + ' ';
  var covers = function (x, c) {
    return ruleStr_(x.student_id) === ruleStr_(c.student_id) && ruleStr_(x.item) === ruleStr_(c.item) && ruleStr_(x.source) !== 'F6' &&
      ruleIso_(x.requested_at) > ruleIso_(c.requested_at) && ruleStr_(x.effective_date) <= ruleStr_(c.effective_date);
  };
  var back = [];
  (changes || []).filter(function (c) {
    return c && !ruleRowLive_(c) && (ruleStr_(c.cancel_reason) + ' ').indexOf(tag) === 0;
  }).sort(function (a, b) { return ruleIso_(a.requested_at) > ruleIso_(b.requested_at) ? -1 : 1; }).forEach(function (c) {
    if (skip && skip(c)) return;
    if (!live.some(function (x) { return ruleRowLive_(x) && covers(x, c); }) && !back.some(function (x) { return covers(x, c); })) back.push(c);
  });
  return back;
}
