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
 * opts = {today(필수), cutoff, terms(있으면 학사 입실에 결정 63 2OUT 막힘 검사 — move2OutBan_)}
 * → {errors, warnings, rows:[{item, value, effective_date, effective_date_auto, requested_at, reason, source, head}],
 *    toCancel:[{id, cancel_reason}], toRestore:[{id}], summary:{date, breakfast:{value, from}|null, dinner:{value, from}|null}}
 * errors가 있으면 rows·toCancel·toRestore는 비어 있다(쓰지 않는다). toCancel과 toRestore는 겹치지 않고, toCancel은 시트에 있는 id만이다.
 * cancel_reason이 '[자동] '으로 시작하면 저장 쪽은 그대로 쓰고, 아니면 앞에 '[자동] <대표 행 id> '를 붙인다.
 *
 * - 대표 행(head:true): 학사·기숙사 값, source 'F6', 적용일 = effectiveDate. '학사 및 기숙사 퇴실'은 학사 퇴실(대표) + 기숙사 퇴실(연결).
 *   F6 저장은 연결 행의 linked_change_id = 대표 행 id, toCancel의 cancel_reason 앞에 '[자동] <대표 행 id> '를 붙인다.
 * - 학사 퇴실 정리(rules-api.md R6 순서): 조식 중단일 = 퇴실일, 석식 중단일 = mealEffectiveDate_('stop', 신청 일시, {leaveDate})
 *   (결정 35). 중단일 이상 학사생 값 행(석식은 퇴실 기록 이후에 신청한 퇴실일 이상 학사 석식도)을 취소하고, 그래도 중단일 값이
 *   학사생 값이면(정리 전 학사생 값이었는데 값이 없어져도) 그날 '미실시'(source 'F6'). 취소한 행의 꼬리표로 되살림(결정 55·58).
 *   석식 '일반 석식'을 고르면 일반 석식 신청(source 'F7', 11:30 규칙 — 퇴실일보다 이르지 않게, 값이 같아도 쓴다 — 늦게 입력된 옛
 *   신청서가 덮지 못하게)을 쓰고, 학사 석식 정리는 그 날(쓰지 못했으면 결정 35 중단일)부터 늘 한다.
 * - 기숙사 입실 + 조식: 조식 실시 @입실일(rule entry_date, source 'F7'). 기숙사 퇴실 + 조식 미실시: 미실시 규칙, 기숙사 퇴실일보다
 *   이르지 않게(source 'F7'). 기숙사 퇴실 조식은 이미 그 값이고 취소할 대기 행도 없으면 쓰지 않는다. 기숙사 입실 조식은 늘 쓰고, 앞선
 *   기숙사 퇴실 기록 전에 낸 대기 신청은 취소하지 않는다(총괄 결정 W).
 * - 상태 검사(적용일 기준): 이미 같은 상태, 학사생 아닌 학생의 기숙사 입실, 기숙사생의 '학사 퇴실'(→ '학사 및 기숙사 퇴실').
 * - requestedAt은 날짜+시각 전체(followups R6-3 — 날짜뿐이면 석식 중단일이 입력 순서를 따른다), 오늘보다 미래면 오류.
 * ASSUMPTION(4-2): 기숙사 퇴실의 "조식도 미실시"는 기본으로 켠다. 기숙사 입실의 "조식도 입실일부터"도 기본으로 켠다.
 * - 학사 입실(R11b, 재입실·학기 중 신규): 직전 학사 퇴실의 정리 행 중 아직 오지 않은(입실일 이후) F6 급식 미실시 행을 취소하고,
 *   급식은 move.meals(없으면 직전 퇴실 전날의 값)를 입실일부터 시작한다(rule entry_date, F7, 값이 같아도 쓴다 — 그날부터의 의도라
 *   늦게 입력된 옛 신청서가 덮지 못하게). 직전 퇴실이 없고 meals도 없으면 대표 행만.
 *   ASSUMPTION(4-2): 재입실 급식 기본값 = 퇴실 전 값. 재입실일 값만 정한다 — 퇴실 기록 전에 학생이 낸 대기 신청(F7)은 취소하지 않는다(총괄 결정).
 *   같은 날 재입실(입실일 = 퇴실일)도 그 퇴실의 재입실로 본다.
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
  if (type === '학사 입실' && opts.terms && opts.terms.length) {   // 결정 63: 2OUT 퇴실 뒤 그 학기·다음 학기에는 다시 들어올 수 없다(terms를 주지 않으면 검사하지 않는다)
    var ban = move2OutBan_(live, sid, opts.terms, E);
    if (ban.banned) out.errors.push(ban.until ? '2OUT 퇴실로 ' + moveMonthDay_(ban.until, E) + '까지 다시 들어올 수 없습니다'
      : '2OUT 퇴실로 다음 학기 끝날까지 다시 들어올 수 없습니다(다음 학기가 아직 등록되지 않았습니다)');
  }
  if (/퇴실$/.test(type) && type !== '기숙사 퇴실' && hall !== '입실') out.errors.push(E + '에 학사 입실 상태가 아닙니다');
  if (type === '학사 퇴실' && dorm === '입실') out.errors.push("기숙사생입니다. '학사 및 기숙사 퇴실'로 처리해 주세요");
  if (type === '기숙사 입실' && hall !== '입실') out.errors.push('학사생만 기숙사에 입실할 수 있습니다');
  if (type === '기숙사 입실' && dorm === '입실') out.errors.push(E + '에 이미 기숙사 입실 상태입니다');
  if ((type === '기숙사 퇴실' || type === '학사 및 기숙사 퇴실') && dorm !== '입실') out.errors.push(E + '에 기숙사 입실 상태가 아닙니다');
  // 적용일 뒤의 입퇴실 기록은 이 계획이 뒤집을 수 있어(상태 검사는 그날 하루만 본다) 먼저 취소하게 한다
  // 결정 62: source '명단업로드' 행은 모두(다음 기간 명단을 미리 올린 학사 입실 등 학사·기숙사 행 전체) 보지 않는다 — 그 행은 [퇴실 취소]로 지울 수 없어 이번
  // 기간의 모든 입퇴실을 막게 된다. 다음 기간 명단과 겹치는 상태는 명단 반영(R4) 쪽이 정한다
  var laterRec = live.filter(function (c) { return /^(학사|기숙사)$/.test(ruleStr_(c.item)) && ruleStr_(c.effective_date) > E && ruleStr_(c.source) !== '명단업로드'; })
    .sort(function (a, b) { return ruleStr_(a.effective_date) < ruleStr_(b.effective_date) ? -1 : 1; })[0];
  if (laterRec) {
    out.errors.push(E + ' 이후 날짜에 입퇴실 기록이 있습니다(' + ruleStr_(laterRec.effective_date) + ' ' + ruleStr_(laterRec.item) + ' ' + ruleStr_(laterRec.value) +
      ') — 먼저 취소해 주세요. 퇴실 기록이면 [퇴실 취소]로 취소합니다(뒤 재입실도 함께 취소됩니다)');
  }
  if (out.errors.length) return out;
  if (E < today) out.warnings.push('적용일(' + E + ')이 오늘보다 이릅니다: 지난 출석부·식수가 바뀝니다');

  var planned = {}, nseq = 0, plannedWarn = {};   // 이 계획이 쓸 행(시트에 아직 없다): live 안 id 'new<n>' → out.rows의 행, 그 신청의 경고
  var add = function (item, value, date, auto, reason, source) {
    var row = { item: item, value: value, effective_date: date, effective_date_auto: auto, requested_at: at, reason: reason, source: source, head: !out.rows.length };
    out.rows.push(row);
    planned['new' + (++nseq)] = row;
    live.push({ id: 'new' + nseq, student_id: sid, item: item, value: value, effective_date: date, requested_at: ruleIso_(at), source: source, status: '유효', created_at: '9999' });
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
  // 급식 신청(F7)을 같은 계획에 넣는다 → 쓴 날 또는 ''. always면 값이 같아도 쓴다. keepBefore면 그보다 먼저 신청한 F7 대기 행은 취소하지 않는다
  var meal = function (item, to, mopts, reason, always, keepBefore) {
    // 퇴실과 함께 고른 급식은 이 퇴실 정리가 곧 취소할 행(퇴실 뒤 학사 석식)에 밀리지 않는다(입력 순서와 무관)
    var src = mopts.leaveDate ? live.filter(function (c) { return !postLeaveHall(c); }) : live;
    var p = mealPlanChange_(src, sid, item, to, at, Object.assign({ today: today, cutoff: opts.cutoff }, mopts));
    if (p.blocked || p.superseded) { out.warnings.push(item + ' ' + to + ' 신청은 쓰지 않습니다: ' + (p.blocked || '더 새 신청이 있습니다')); return ''; }
    if (!always && p.kind === 'none' && !p.toCancel.length && !p.followUps.length) return '';   // 이미 그 값이면 행을 늘리지 않는다(경고도 없음)
    out.warnings = out.warnings.concat(p.warnings);
    cancel(p.toCancel.filter(function (c) {
      var r = live.filter(function (x) { return ruleStr_(x.id) === c.id; })[0];
      return !(keepBefore && r && ruleStr_(r.source) === 'F7' && ruleIso_(r.requested_at) < keepBefore);
    }), reason);
    add(item, to, p.date, mopts.effectiveRule === 'entry_date' ? p.date : p.autoDate, reason, 'F7');
    plannedWarn['new' + nseq] = p.warnings;
    p.followUps.forEach(function (f) { add(f.item, f.value, f.effective_date, f.effective_date, reason, f.source); });
    out.summary[item === '조식' ? 'breakfast' : 'dinner'] = { value: to, from: p.date };
    return p.date;
  };
  // 되살린 신청은 처음 저장될 때처럼 그보다 먼저 신청했는데 더 늦게 적용되는 다른 값의 행을 취소한다(superseded로 저장돼 자기 취소를
  // 못 했거나, 취소돼 있던 동안 늦게 입력된 옛 신청서). 새 신청부터. 꼬리표는 되살린 행 id(그 행이 다시 끊기면 돌아오게)
  var revive = function (back) {
    back.sort(function (a, b) { return moveNewer_(a, b) ? -1 : 1; }).forEach(function (r) {
      if (!live.some(function (c) { return ruleStr_(c.id) === ruleStr_(r.id); })) return;
      var item = ruleStr_(r.item);
      if (!/^(조식|석식)$/.test(item) || ruleStr_(r.source) === 'F6') return;
      var hits = mealPendingToCancel_(live, sid, item, ruleStr_(r.effective_date), { source: 'F7', requestedAt: r.requested_at, newValue: ruleStr_(r.value) });
      var drop = function (id) { live = live.filter(function (x) { return ruleStr_(x.id) !== id; }); };
      hits.forEach(function (h) {
        if (out.toRestore.some(function (t) { return t.id === h.id; })) {   // 이 계획이 되살린 행이면 되살리지 않는다(toCancel∩toRestore 없게)
          out.toRestore = out.toRestore.filter(function (t) { return t.id !== h.id; });
          drop(h.id);
        } else if (planned[h.id]) {   // 이 계획이 쓸 행(퇴실과 함께 고른 급식)은 시트에 없다 → superseded처럼 쓰지 않는다
          out.rows = out.rows.filter(function (x) { return x !== planned[h.id]; });
          out.warnings = out.warnings.filter(function (w) { return (plannedWarn[h.id] || []).indexOf(w) < 0; });   // 쓰지 않는 신청의 경고도 뺀다
          drop(h.id);
          out.warnings.push(item + ' ' + planned[h.id].value + ' 신청은 쓰지 않습니다: 더 새 신청이 있습니다');
          var sk = item === '조식' ? 'breakfast' : 'dinner';
          if (out.summary[sk] && out.summary[sk].value === planned[h.id].value) out.summary[sk] = null;
        } else cancel([h], '[자동] ' + ruleStr_(r.id) + ' 되살린 신청으로 대체');
      });
    });
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
    revive(back);
    var now = statusOn_(live, sid, item, stop);
    if (mealIsHallOnly_(item, now) || (!now && mealIsHallOnly_(item, before))) {
      add(item, '미실시', stop, stop, reason, 'F6');
      out.summary[item === '조식' ? 'breakfast' : 'dinner'] = { value: '미실시', from: stop };
    }
  };

  types[type].forEach(function (s) { add(s[0], s[1], E, E, type, 'F6'); });
  // 같은 날 기록이 있는데 이 기록의 신청 일시가 더 이르면 저장해도 상태가 바뀌지 않는다(statusOn_ 동점 = 신청 일시) — 정리만 하면 어긋난다
  if (types[type].some(function (s) { return statusOn_(live, sid, s[0], E) !== s[1]; })) {
    return { errors: ['같은 날(' + E + ') 기록보다 신청 일시가 이릅니다 — 신청 일시를 확인해 주세요'], warnings: [], rows: [], toCancel: [], toRestore: [],
      summary: { date: E, breakfast: null, dinner: null } };
  }
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
  if (type === '학사 입실') {
    var lastLeave = live.filter(function (c) { return ruleStr_(c.item) === '학사' && ruleStr_(c.value) === '퇴실' && ruleStr_(c.effective_date) <= E; })   // 같은 날 재입실도
      .sort(function (a, b) { return ruleStr_(a.effective_date) < ruleStr_(b.effective_date) ? -1 : 1; }).pop();
    // 직전 퇴실의 아직 오지 않은(입실일 이후) 급식 정리 행과, 퇴실과 함께 고른 급식 신청(연결 F7, 예: 일반 석식으로)은 재입실로 뜻이 없어진다
    var lost = live.filter(function (c) {
      if (!lastLeave || !/^(조식|석식)$/.test(ruleStr_(c.item)) || ruleStr_(c.effective_date) < E) return false;
      return (ruleStr_(c.source) === 'F6' && ruleStr_(c.value) === '미실시' && ruleStr_(c.effective_date) >= ruleStr_(lastLeave.effective_date)) ||
        (ruleStr_(c.source) === 'F7' && ruleStr_(c.linked_change_id) && ruleStr_(c.linked_change_id) === ruleStr_(lastLeave.id));
    }).map(function (c) { return { id: ruleStr_(c.id) }; });
    cancel(lost, '학사 재입실 퇴실 정리 취소');
    // 퇴실(대표)이나 재입실이 취소하는 연결 급식 신청(superseded로 가린 것 포함, 결정 58)이 취소했던 학생 신청 중 학사생 값이 아니고
    // 재입실일 이후 것은 되살린다(학사생 값은 퇴실 정리가 끊은 것), 되살린 신청은 자기 취소를 한다
    var back = [];
    if (lastLeave) [{ id: ruleStr_(lastLeave.id) }].concat(lost).forEach(function (x) {
      moveRestorable_(changes, live, x.id, function (r) {
        return mealIsHallOnly_(ruleStr_(r.item), ruleStr_(r.value)) || ruleStr_(r.effective_date) < E || back.indexOf(r) >= 0;
      }).forEach(function (r) {
        out.toRestore.push({ id: ruleStr_(r.id) });
        live.push(Object.assign({}, r, { status: '유효' }));
        back.push(r);
      });
    });
    revive(back);
    ['조식', '석식'].forEach(function (item) {
      var v = ruleStr_((move.meals || {})[item]) || (lastLeave ? statusOn_(live, sid, item, ymdAddDays_(ruleStr_(lastLeave.effective_date), -1)) : '');
      if (v) meal(item, v, { effectiveDate: E, effectiveRule: 'entry_date' }, '학사 입실 급식', true,   // 재입실일부터의 의도(늦게 입력된 옛 신청서가 덮지 못하게)
        lastLeave ? ruleIso_(lastLeave.requested_at) : '');   // 퇴실 기록 전에 학생이 낸 대기 신청은 취소하지 않는다(총괄 결정)
    });
  }
  if (type === '기숙사 입실' && move.breakfastWithDorm !== false) {
    // 총괄 결정(W): 늘 쓴다(늦게 입력된 옛 신청서가 덮지 못하게 — 재입실 급식과 같다). 앞선 기숙사 퇴실이 있으면 그 기록 전에 낸 대기 신청은
    // 취소하지 않는다(결정 56)
    var dormOut = live.filter(function (c) { return ruleStr_(c.item) === '기숙사' && ruleStr_(c.value) === '퇴실' && ruleStr_(c.effective_date) <= E; })
      .sort(function (a, b) { return ruleStr_(a.effective_date) < ruleStr_(b.effective_date) ? -1 : 1; }).pop();
    meal('조식', '실시', { effectiveDate: E, effectiveRule: 'entry_date' }, '기숙사 입실 조식', true, dormOut ? ruleIso_(dormOut.requested_at) : '');
  }
  if (type === '기숙사 퇴실' && move.breakfastStopWithDorm !== false) meal('조식', '미실시', { leaveDate: E }, '기숙사 퇴실 조식 미실시');
  return out;
}

/**
 * 입퇴실 취소(퇴실 되돌림, R11b). headId = movePlan_으로 쓴 대표 행 id. 아무것도 쓰지 않는다.
 * opts = {today} → {toCancel:[{id, cancel_reason?}], toRestore:[{id}], warnings}
 * - toCancel: 대표 행 + 연결 행(linked_change_id = headId) 중 살아 있는 것, 학사 퇴실 대표면 그 퇴실의 중단일(조식 퇴실일, 석식 결정 35)에
 *   있는 F6 급식 미실시 행(급식 신청의 followUps로 쓴 것 포함 — 남은 다른 학사 퇴실이 같은 날을 중단일로 쓰면 둔다).
 *   **결정 59:** 학사 퇴실 대표면 그 뒤 살아 있는 학사 재입실과 그 연결 행도 — warnings '재입실 기록(날짜)도 함께 취소됩니다'.
 *   **결정 59 보충:** 기숙사 퇴실 대표이거나 기숙사 퇴실 연결 행이 있으면 그 뒤 기숙사 입실과 그 연결 행도 — '기숙사 입실 기록(날짜)도 함께
 *   취소됩니다'. 재입실·기숙사 입실 = source F6, 연결 행 아님, 날짜가 퇴실일 이상이고 그 항목의 다음 퇴실 전, 날짜가 같으면 퇴실보다 뒤에
 *   기록된 것(명단 행·같은 날 퇴실 전 입실은 아니다). 가장 이른 것 하나.
 * - toRestore: 취소된 행 중 cancel_reason이 '[자동] <id> '로 시작하고 그 id가 이 취소로 없애는 행(대표들·연결 행(이미 취소된 것 포함)·정리 행)인 것
 *   (id 전체로 맞춤, 결정 41·58), 되살려도 더 새 신청에 덮이지 않는 것만 — 신청 일시가 더 늦고 적용일이 그 행 이하인 같은 항목의 다른 값
 *   신청 행(F6 제외)이 있으면 빼고 경고. 이 취소로 없앨 행은 되살리지 않는다.
 * - 되살린 신청 행은 처음 저장될 때처럼 그보다 먼저 신청했는데 더 늦게 적용되는 다른 값의 행(그동안 늦게 입력된 옛 신청서)을
 *   toCancel에 더한다(mealPendingToCancel_ F7, 새 신청부터). 이 행에는 cancel_reason '[자동] <되살린 행 id> 되살린 신청으로 대체'를
 *   준다(저장 쪽은 그대로 쓴다 — 그 행이 나중에 다시 취소되면 돌아오게). 다른 행의 사유는 저장 쪽이 정한다('[자동] <headId> …').
 * - 퇴실 대표만 계획한다(입실 대표는 경고와 빈 계획 — 새 퇴실로 바로잡는다). 대표 행이 없거나 이미 취소면 경고만. 적용일 < today면 경고(지난 출석부·식수가 바뀜).
 * ASSUMPTION: 언제 누가 취소할 수 있는지(적용일 전 담당교사·관리자, 지난 뒤 관리자, 4-2)는 저장 쪽이 판정한다.
 */
function moveUndoPlan_(changes, headId, opts) {
  opts = opts || {};
  var hid = ruleStr_(headId), rows = changes || [];
  var out = { toCancel: [], toRestore: [], warnings: [] };
  var head = rows.filter(function (c) { return c && ruleStr_(c.id) === hid; })[0];
  if (!head || !ruleRowLive_(head)) { out.warnings.push('취소할 입퇴실 행이 없거나 이미 취소되었습니다: ' + hid); return out; }
  // 퇴실만 되돌린다(총괄 결정): 잘못 넣은 입실은 새 퇴실로 바로잡는다 — 입실을 지우면 퇴실한 학생이 학사 급식으로 남을 수 있다
  if (ruleStr_(head.value) !== '퇴실') { out.warnings.push('퇴실 기록만 취소할 수 있습니다(입실은 새 퇴실로 바로잡아 주세요): ' + hid); return out; }
  var sid = ruleStr_(head.student_id), L = ruleStr_(head.effective_date);
  if (ymdIsValid_(ruleStr_(opts.today)) && L < ruleStr_(opts.today)) out.warnings.push('적용일(' + L + ')이 지났습니다: 지난 출석부·식수가 바뀝니다');
  var live = rows.filter(function (c) { return c && ruleRowLive_(c) && ruleStr_(c.student_id) === sid; });
  // 결정 59: 그 뒤 살아 있는 재입실(다음 학사 퇴실 전의 학사 입실 대표)도 함께 취소 — '퇴실이 없었던 것처럼'
  var of = function (item, v) { return live.filter(function (c) { return ruleStr_(c.item) === item && ruleStr_(c.value) === v && ruleStr_(c.id) !== hid; }); };
  var hall = function (v) { return of('학사', v); };
  // 입실 대표(F6, 퇴실보다 뒤에 기록 — 명단 행·이전 입실은 아니다. 날짜가 뒤면 기록이 일러도) 중 L과 그 항목의 다음 퇴실 사이의 가장 이른 것
  var after_ = function (item) {
    var next = of(item, '퇴실').map(function (c) { return ruleStr_(c.effective_date); }).filter(function (e) { return e > L; }).sort()[0];
    return of(item, '입실').filter(function (c) {
      var e = ruleStr_(c.effective_date);
      return ruleStr_(c.source) === 'F6' && !ruleStr_(c.linked_change_id) && (e > L || moveNewer_(c, head)) && e >= L && (!next || e < next);
    }).sort(function (a, b) { return ruleStr_(a.effective_date) < ruleStr_(b.effective_date) ? -1 : 1; })[0];
  };
  var re = ruleStr_(head.item) === '학사' ? after_('학사') : null;   // 학사 재입실 연쇄는 학사 퇴실 대표만
  var heads = {};
  heads[hid] = true;
  if (re) { heads[ruleStr_(re.id)] = true; out.warnings.push('재입실 기록(' + ruleStr_(re.effective_date) + ')도 함께 취소됩니다'); }
  // 결정 59 보충(기숙사생): 취소하는 퇴실에 기숙사 퇴실 연결 행이 있으면 그 뒤 기숙사 입실 대표도 함께 — 남으면 고친 퇴실이 영영 막힌다
  // 기숙사 퇴실 대표(따로 입력)도 같다(뒤따른 기숙사 입실이 남으면 고친 기숙사 퇴실이 막힌다)
  if (ruleStr_(head.item) === '기숙사' || live.some(function (c) { return ruleStr_(c.linked_change_id) === hid && ruleStr_(c.item) === '기숙사' && ruleStr_(c.value) === '퇴실'; })) {
    var dre = after_('기숙사');
    if (dre) { heads[ruleStr_(dre.id)] = true; out.warnings.push('기숙사 입실 기록(' + ruleStr_(dre.effective_date) + ')도 함께 취소됩니다'); }
  }
  var stops = function (leave) {
    var at = ruleStr_(leave.requested_at), e = ruleStr_(leave.effective_date), st = { '조식': e, '석식': '' };
    try { st['석식'] = mealEffectiveDate_('stop', at, { leaveDate: e }).date; } catch (err) { st['석식'] = ''; }
    return st;
  };
  var mine = ruleStr_(head.item) === '학사' ? stops(head) : {}, others = hall('퇴실').map(stops);   // 정리 행은 학사 퇴실 대표만
  // 이 취소가 없애는 행: 두 대표, 그 연결 행, 이 퇴실의 중단일 F6 미실시(다른 퇴실이 같은 날을 쓰면 둔다)
  var belongs = function (c) {
    var item = ruleStr_(c.item), e = ruleStr_(c.effective_date);
    return heads[ruleStr_(c.id)] || heads[ruleStr_(c.linked_change_id)] ||
      (ruleStr_(c.source) === 'F6' && ruleStr_(c.value) === '미실시' && (item === '조식' || item === '석식') && mine[item] === e &&
        !others.some(function (o) { return o[item] === e; }));
  };
  var gone = {};
  live.forEach(function (c) { if (belongs(c)) gone[ruleStr_(c.id)] = true; });
  // 없애는 행 중 어느 것의 '[자동] <id>'로 취소된 행이든(대표가 정리한 행, 재입실이 취소한 신청, 연결 일반 석식이 가린 신청서 — 결정 58)
  // 되살려도 더 새 신청에 덮이지 않으면 되살린다
  // 신청 일시가 늦은 것부터 정해, 함께 되살아나는 행끼리도 덮이는지 본다
  var tagged = Object.assign({}, gone, heads), restore = [];
  rows.forEach(function (c) { if (c && heads[ruleStr_(c.linked_change_id)]) tagged[ruleStr_(c.id)] = true; });   // 이미 취소된 연결 행(재입실이 취소한 일반 석식 등)의 꼬리표도
  var after = live.filter(function (c) { return !gone[ruleStr_(c.id)]; });
  rows.filter(function (c) {
    var m = c && !ruleRowLive_(c) && ruleStr_(c.student_id) === sid && /^\[자동\] (\S+)/.exec(ruleStr_(c.cancel_reason));
    return m && tagged[m[1]] && !belongs(c);
  }).sort(function (a, b) { return moveNewer_(a, b) ? -1 : 1; }).forEach(function (c) {
    var e = ruleStr_(c.effective_date);
    var newer = after.concat(restore).filter(function (x) {
      return ruleStr_(x.item) === ruleStr_(c.item) && ruleStr_(x.source) !== 'F6' &&
        ruleStr_(x.value) !== ruleStr_(c.value) && moveNewer_(x, c) && ruleStr_(x.effective_date) <= e &&
        !(ruleStr_(x.effective_date) < e && mealReentryKeeps_(live, x, ruleIso_(c.requested_at)));   // 재입실 행은 퇴실 전 신청을 덮지 않는다
    });
    if (newer.length) out.warnings.push(e + ' ' + ruleStr_(c.item) + ' ' + ruleStr_(c.value) + ' 행은 더 새 신청이 있어 되살리지 않습니다');
    else restore.push(c);
  });
  // 되살린 신청 행은 그 신청이 처음 저장될 때처럼, 그보다 먼저 신청했는데 더 늦게 적용되는 다른 값의 행을 취소한다
  // (그 행이 취소돼 있던 동안 늦게 입력된 옛 신청서). 새 신청부터 차례로. 꼬리표는 되살린 행 id(결정 58과 같이,
  // 그 행이 나중에 다시 취소되면 이 행이 돌아온다).
  var back = {}, why = {};
  restore.forEach(function (c) {
    if (gone[ruleStr_(c.id)]) return;
    back[ruleStr_(c.id)] = true;
    if (!/^(조식|석식)$/.test(ruleStr_(c.item)) || ruleStr_(c.source) === 'F6') return;
    var now = rows.filter(function (x) { return x && (ruleRowLive_(x) || back[ruleStr_(x.id)]) && !gone[ruleStr_(x.id)]; })
      .map(function (x) { return back[ruleStr_(x.id)] ? Object.assign({}, x, { status: '유효' }) : x; });
    mealPendingToCancel_(now, sid, ruleStr_(c.item), ruleStr_(c.effective_date), { source: 'F7', requestedAt: c.requested_at, newValue: ruleStr_(c.value) })
      .forEach(function (x) { gone[x.id] = true; delete back[x.id]; why[x.id] = '[자동] ' + ruleStr_(c.id) + ' 되살린 신청으로 대체'; });
  });
  out.toRestore = Object.keys(back).map(function (id) { return { id: id }; });
  out.toCancel = Object.keys(gone).map(function (id) { return why[id] ? { id: id, cancel_reason: why[id] } : { id: id }; });
  return out;
}

/**
 * 행 tagId가 '[자동] <tagId> …'로 취소했던 행(cancel_reason, 결정 41) 중 되살려도 더 새 신청에 덮이지 않는 것.
 * 덮임 = 같은 학생·항목의 다른 값 신청 행(F6 제외)이 신청 일시가 더 늦고 적용일이 그 행 이하(같은 값이면 되살려도 해가 없고, 뒤의
 * 재입실 등에서 적용일 정보가 필요하다) — live(지금 살아 있는 행, 계획 반영)와
 * 함께 되살아나는 행 모두에서 본다(신청 일시가 늦은 것부터 정해 서로 덮는 것도 거른다).
 * 꼬리표 = superseded 신청서(결정 58)·F7 신청이 대체한 행(C17a)·퇴실 정리가 취소한 행(F6). skip(행)이 참인 행은 처음부터 뺀다
 * (되살려도 곧 다시 취소할 행 — 덮임 검사에도 넣지 않는다).
 */
function moveRestorable_(changes, live, tagId, skip) {
  var tag = '[자동] ' + ruleStr_(tagId) + ' ';
  var covers = function (x, c) {
    return ruleStr_(x.student_id) === ruleStr_(c.student_id) && ruleStr_(x.item) === ruleStr_(c.item) && ruleStr_(x.source) !== 'F6' &&
      ruleStr_(x.value) !== ruleStr_(c.value) &&
      moveNewer_(x, c) && ruleStr_(x.effective_date) <= ruleStr_(c.effective_date) &&
      !(ruleStr_(x.effective_date) < ruleStr_(c.effective_date) && mealReentryKeeps_(live, x, ruleIso_(c.requested_at)));   // 재입실 행은 퇴실 전 신청을 덮지 않는다(결정 56)
  };
  var back = [];
  (changes || []).filter(function (c) {
    return c && !ruleRowLive_(c) && (ruleStr_(c.cancel_reason) + ' ').indexOf(tag) === 0;
  }).sort(function (a, b) { return moveNewer_(a, b) ? -1 : 1; }).forEach(function (c) {
    if (skip && skip(c)) return;
    if (!live.some(function (x) { return ruleRowLive_(x) && covers(x, c); }) && !back.some(function (x) { return covers(x, c); })) back.push(c);
  });
  return back;
}

/**
 * 2OUT 퇴실 뒤 다시 들어오기 막힘(결정 63, 순수 함수). changes = 그 학생의 status_changes 행(취소 포함 그대로),
 * terms = terms 행(type '학기'·'방학', start_date, end_date), ymd = 들어오려는 날 → {banned, until, leaveDate}
 * - 기준 퇴실 = 살아 있는 학사 퇴실 중 reason '2OUT 퇴실' 또는 memo가 '[2OUT]'로 시작하고 적용일 ≤ ymd인 것 가운데 가장 늦은 것(없으면 막지
 *   않는다 — 퇴실 취소(결정 59)로 그 행이 취소되면 막힘도 풀린다).
 * - 막는 기간(결정 63 보충) = 퇴실일부터 '다음 학기 뒤 처음 오는 학기'의 시작 전날까지(그 학기 남은 날·다음 학기·사이의 방학 포함).
 *   다음 학기 = 퇴실일 뒤에 시작하는 첫 학기. 그 뒤 학기가 terms에 아직 없으면 다음 학기 뒤에 오는 첫 방학의 끝날, 그것도 없으면 다음 학기
 *   끝날. 다음 학기도 없으면 until ''(정해지지 않음 — 다음 학기가 등록될 때까지 막는다).
 *   ASSUMPTION: '다음 학기 바로 뒤에 이어지는 방학' = 다음 학기 끝날 뒤에 시작하는 첫 방학(사이에 빈 날이 있어도).
 * ASSUMPTION(결정 63): '학기'는 terms.type '학기', 방학은 사이에 끼면 함께 막는다. 방학 중 퇴실이면 그 뒤 첫 학기를 '다음 학기'로 본다.
 */
function move2OutBan_(changes, studentId, terms, ymd) {
  var sid = ruleStr_(studentId), day = ruleStr_(ymd);
  if (!ymdIsValid_(day)) throw new Error('날짜 형식이 아닙니다(yyyy-MM-dd): ' + ymd);
  var leave = (changes || []).filter(function (c) {
    var e = ruleStr_(c && c.effective_date);
    return c && ruleRowLive_(c) && ruleStr_(c.student_id) === sid && ruleStr_(c.item) === '학사' && ruleStr_(c.value) === '퇴실' &&
      ymdIsValid_(e) && e <= day && (ruleStr_(c.reason) === '2OUT 퇴실' || ruleStr_(c.memo).indexOf('[2OUT]') === 0);
  }).sort(function (a, b) { return ruleStr_(a.effective_date) < ruleStr_(b.effective_date) ? -1 : 1; }).pop();
  if (!leave) return { banned: false, until: '', leaveDate: '' };
  var L = ruleStr_(leave.effective_date);
  var sem = (terms || []).filter(function (t) { return t && ruleStr_(t.type) === '학기' && ymdIsValid_(ruleStr_(t.start_date)) && ymdIsValid_(ruleStr_(t.end_date)); })
    .sort(function (a, b) { return ruleStr_(a.start_date) < ruleStr_(b.start_date) ? -1 : 1; });
  var next = sem.filter(function (t) { return ruleStr_(t.start_date) > L; })[0];   // 다음 학기 = 퇴실일 뒤에 시작하는 첫 학기
  var until = '';
  if (next) {
    var ne = ruleStr_(next.end_date), after = sem.filter(function (t) { return ruleStr_(t.start_date) > ne; })[0];
    var vac = (terms || []).filter(function (t) { return t && ruleStr_(t.type) === '방학' && ruleStr_(t.start_date) > ne && ymdIsValid_(ruleStr_(t.end_date)); })
      .sort(function (a, b) { return ruleStr_(a.start_date) < ruleStr_(b.start_date) ? -1 : 1; })[0];
    until = after ? ymdAddDays_(ruleStr_(after.start_date), -1) : vac ? ruleStr_(vac.end_date) : ne;
  }
  return { banned: !until || day <= until, until: until, leaveDate: L };
}

/** 'yyyy-MM-dd' → 'M월 D일'(기준일과 해가 다르면 'yyyy년 M월 D일'). */
function moveMonthDay_(ymd, base) {
  var p = ymd.split('-');
  return (p[0] !== String(base).slice(0, 4) ? p[0] + '년 ' : '') + Number(p[1]) + '월 ' + Number(p[2]) + '일';
}

/** x가 c보다 더 새 신청인지: 신청 일시가 늦거나, 같으면 나중에 저장된 행(created_at — statusOn_·mealPendingToCancel_의 동점 규칙과 같다). */
function moveNewer_(x, c) {
  var a = ruleIso_(x.requested_at), b = ruleIso_(c.requested_at);
  return a > b || (a === b && ruleIso_(x.created_at) > ruleIso_(c.created_at));
}
