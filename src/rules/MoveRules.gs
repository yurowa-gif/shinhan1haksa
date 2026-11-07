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
 *   (결정 35). 중단일 이상 학사생 값 행을 취소하고, 그래도 중단일 값이 학사생 값이면 그날 '미실시'(source 'F6').
 *   석식 '일반 석식'을 고르면 미실시 대신 일반 석식 신청(source 'F7', 11:30 규칙 — 퇴실일보다 이르지 않게).
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
  var out = { errors: [], warnings: [], rows: [], toCancel: [], summary: { date: E, breakfast: null, dinner: null } };
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
  var meal = function (item, to, mopts, reason) {   // 급식 신청(F7)을 같은 계획에 넣는다
    var p = mealPlanChange_(live, sid, item, to, at, Object.assign({ today: today, cutoff: opts.cutoff }, mopts));
    out.warnings = out.warnings.concat(p.warnings);
    if (p.blocked || p.superseded) { out.warnings.push(item + ' ' + to + ' 신청은 쓰지 않습니다: ' + (p.blocked || '더 새 신청이 있습니다')); return; }
    if (p.kind === 'none' && !p.toCancel.length) return;   // 이미 그 값이면 행을 늘리지 않는다
    cancel(p.toCancel, reason);
    add(item, to, p.date, mopts.effectiveRule === 'entry_date' ? p.date : p.autoDate, reason, 'F7');
    out.summary[item === '조식' ? 'breakfast' : 'dinner'] = { value: to, from: p.date };
  };
  var stopHall = function (item, stop, reason) {     // 퇴실 정리(F6): 중단일 이상 학사생 값 취소, 그래도 학사생 값이면 미실시
    cancel(mealPendingToCancel_(live, sid, item, stop, { source: 'F6' }), reason);
    if (mealIsHallOnly_(item, statusOn_(live, sid, item, stop))) add(item, '미실시', stop, stop, reason, 'F6');
    out.summary[item === '조식' ? 'breakfast' : 'dinner'] = { value: '미실시', from: stop };
  };

  types[type].forEach(function (s) { add(s[0], s[1], E, E, type, 'F6'); });
  if (type === '학사 퇴실' || type === '학사 및 기숙사 퇴실') {
    stopHall('조식', E, '학사 퇴실 조식 중단');
    if (ruleStr_(move.dinner) === '일반 석식') meal('석식', '일반 석식', { leaveDate: E }, '학사 퇴실 일반 석식으로');
    else stopHall('석식', mealEffectiveDate_('stop', at, { leaveDate: E }).date, '학사 퇴실 석식 중단');
  }
  if (type === '기숙사 입실' && move.breakfastWithDorm !== false) meal('조식', '실시', { effectiveDate: E, effectiveRule: 'entry_date' }, '기숙사 입실 조식');
  if (type === '기숙사 퇴실' && move.breakfastStopWithDorm !== false) meal('조식', '미실시', { leaveDate: E }, '기숙사 퇴실 조식 미실시');
  return out;
}
