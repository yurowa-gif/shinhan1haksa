/**
 * 급식 적용일 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F6·F7, 결정 1·2·3·23(④⑤)·35).
 *
 * 순수 함수만 둔다. DateRules.gs의 함수(isoLocalSplit_·ymd…·hm…)와 StatusRules.gs의 statusOn_을 부른다.
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
  var k = String(kind || '').trim();
  if (k === 'with_dorm_entry' || k === 'on_leave') {
    var key = k === 'with_dorm_entry' ? 'entryDate' : 'leaveDate';
    var d = String(opts[key] || '').trim();
    if (!ymdIsValid_(d)) throw new Error(key + '가 필요합니다(yyyy-MM-dd): ' + d);
    return { date: d, rule: k === 'with_dorm_entry' ? 'entry_date' : 'leave_date' };
  }
  var at = isoLocalSplit_(String(requestedAt || '').trim());
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
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '11:30';
  var m = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(s);
  var hm = m ? (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2] : '';
  if (!hmIsValid_(hm) || hm === '24:00') throw new Error('마감 시각 형식이 아닙니다(HH:mm): ' + s);
  return hm;
}

/**
 * 학사 퇴실과 함께 만드는 석식 변경(opts.leaveDate가 있을 때): 계산한 적용일이 퇴실일보다 이르면 퇴실일로 미룬다.
 * ASSUMPTION: 퇴실을 미리 입력해도 퇴실 전에는 학사 석식이 이어진다(일반 석식 전환이 퇴실 전에 시작되지 않게).
 * 퇴실일보다 늦은 적용일(석식 "중단"의 미실시 규칙: 다음 주·다다음 주 월요일)은 그대로 둔다 — 결정 35: 학사 퇴실 시
 * 조식만 퇴실일에 끝나고, 학사 석식 중단은 미실시 적용일을 따른다(그동안 학사 석식은 이어진다).
 */
function mealNotBeforeLeave_(r, opts) {
  var leave = String(opts.leaveDate || '').trim();
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
  var it = String(item || '').trim();
  var from = String(fromValue || '').trim(), to = String(toValue || '').trim();
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
 * F7 급식 변경 신청 하나를 계획한다(아무것도 쓰지 않음).
 * changes = 그 학생의 status_changes 행(학사·조식·석식, 취소 포함 그대로), requestedAt = 신청 일시(KST),
 * opts = {cutoff, leaveDate, today:'yyyy-MM-dd'(대기 행 판정 기준, 보통 오늘)}
 * → {kind, date, rule, from, blocked:''|사유, toCancel:[{id, effective_date, value}], warnings:[]}
 *   kind 'none'이면 저장하지 않는다(date·rule은 '').
 * - 변경 종류는 **후보 적용일에 실제로 적용되는 값**(statusOn_)과 비교해 정한다. 미실시면 미실시 규칙의 적용일,
 *   실시·학사 석식·일반 석식이면 11:30 규칙의 적용일이 후보다. 그날 값이 이미 같으면 'none', 그날 값이 없으면(기록 없음)
 *   미실시는 'initial'(신청일). 미래에 같은 값의 대기 행이 있어도 더 이른 적용일의 변경은 버리지 않는다.
 * - blocked: 학사 퇴실 적용일 이후(그날 학사 상태가 '퇴실')에는 조식 '실시'·석식 '학사 석식'을 새로 켜지 못한다(학사생 아님).
 *   결정 35의 "퇴실 뒤 미실시 규칙까지 석식 유지"는 이미 있던 학사 석식이 이어지는 것이지 새로 켜는 것이 아니다.
 * - toCancel: mealPendingToCancel_(source F7, 이 신청의 requestedAt, today) — 새 행보다 늦게 적용될 이전 F7 대기 행.
 * - warnings: 적용일 전에 시작하는 다른 값의 대기 행이 있으면 알려 준다. ASSUMPTION: 그런 대기 행(예: 내일부터 '실시'
 *   대기 중에 오늘 다시 '미실시' 신청 → 미실시는 다다음 주 월요일)은 자동으로 취소하지 않는다(미실시 규칙의 준비 기간을
 *   지키려고). 교사가 화면에서 그 대기 행을 직접 취소할 수 있게 경고만 한다.
 */
function mealPlanChange_(changes, studentId, item, toValue, requestedAt, opts) {
  opts = opts || {};
  var it = String(item || '').trim(), to = String(toValue || '').trim();
  if (!mealAllowedValues_(it) || mealAllowedValues_(it).indexOf(to) < 0) mealChangeKind_(it, '', to);  // 같은 오류 문구로 거부
  var at = isoLocalSplit_(String(requestedAt || '').trim());
  var cand;
  if (to === '미실시') {
    cand = mealEffectiveDate_('stop', requestedAt, opts);
    // 그날 먹고 있는 급식이 없으면(기록 없음) 그만둘 것이 없으므로 신청일에 바로 기록('initial')
    if (!statusOn_(changes, studentId, it, cand.date)) cand = { date: at.date, rule: 'initial' };
  } else {
    cand = mealEffectiveDate_(to === '일반 석식' ? 'to_general' : 'start', requestedAt, opts);
  }
  var from = statusOn_(changes, studentId, it, cand.date);
  var kind = mealChangeKind_(it, from, to);
  var out = { kind: kind, date: kind === 'none' ? '' : cand.date, rule: kind === 'none' ? '' : cand.rule, from: from,
    blocked: '', toCancel: [], warnings: [] };
  if (kind === 'none') return out;
  if (mealIsHallOnly_(it, to) && statusOn_(changes, studentId, '학사', cand.date) === '퇴실') {
    out.blocked = cand.date + '에는 학사 퇴실 상태라 ' + it + ' ' + to + '을(를) 새로 신청할 수 없습니다';
    return out;
  }
  out.toCancel = mealPendingToCancel_(changes, studentId, it, cand.date, { source: 'F7', requestedAt: requestedAt, today: opts.today });
  var today = String(opts.today || '').trim();
  (changes || []).forEach(function (c) {
    if (!mealRowLive_(c) || String(c.student_id || '').trim() !== String(studentId || '').trim() || String(c.item || '').trim() !== it) return;
    var e = String(c.effective_date || '').trim();
    if (ymdIsValid_(e) && e < cand.date && (!today || e > today) && String(c.value || '').trim() !== to) {
      out.warnings.push(e + '부터 ' + String(c.value || '').trim() + '(으)로 바뀌는 대기 중인 신청이 있습니다(필요하면 직접 취소)');
    }
  });
  return out;
}

function mealRowLive_(c) {
  if (!c) return false;
  var st = String(c.status || '').trim();
  return st === '' || st === '유효';
}

/**
 * 새 급식 변경 행(적용일 effectiveDate)을 저장할 때 '취소'로 바꿔야 할 대기 행들. → [{id, effective_date, value}](적용일 순)
 * opts = {source:'F7'|'F6', requestedAt:새 행의 신청 일시, today:'yyyy-MM-dd'}
 * 공통: 같은 학생·같은 항목, status 유효(빈칸 포함), 적용일이 날짜 형식(statusOn_과 같게), today가 있으면 적용일 > today
 *   (이미 적용된 변경은 소급 입력으로 취소하지 않는다). **source가 F6인 행(퇴실 조식 중단, 퇴실과 함께 만든 석식 중단,
 *   기숙사 입실 조식)은 취소하지 않는다.**
 * - 새 행이 F7이면: 적용일이 effectiveDate보다 늦고 requested_at이 새 행보다 이른 F7 행(신청 일시는 교사가 넣으므로
 *   늦게 입력된 이전 신청서가 새 신청을 덮지 않게). requestedAt을 주지 않으면 신청 일시는 보지 않는다.
 * - 새 행이 F6(퇴실 조식 중단 등)이면: 적용일이 effectiveDate 이상인 F7 행 모두(requested_at과 상관없이 퇴실일부터 우선, PRD F6).
 * F6·F7은 새 행을 쓰는 같은 락 안에서 이 행들의 status를 '취소'로 바꾸고 audit_log에 남긴다.
 */
function mealPendingToCancel_(changes, studentId, item, effectiveDate, opts) {
  opts = opts || {};
  var sid = String(studentId || '').trim(), it = String(item || '').trim(), eff = String(effectiveDate || '').trim();
  if (!ymdIsValid_(eff)) throw new Error('적용일 형식이 아닙니다(yyyy-MM-dd): ' + effectiveDate);
  var fromF6 = String(opts.source || 'F7').trim() === 'F6';
  var req = String(opts.requestedAt || '').trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
  var today = String(opts.today || '').trim();
  return (changes || []).filter(function (c) {
    if (!mealRowLive_(c) || String(c.student_id || '').trim() !== sid || String(c.item || '').trim() !== it) return false;
    if (String(c.source || '').trim() === 'F6') return false;
    var e = String(c.effective_date || '').trim();
    if (!ymdIsValid_(e) || (today && e <= today)) return false;
    if (fromF6) return e >= eff;
    if (e <= eff) return false;
    var cr = String(c.requested_at || '').trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
    return !req || cr < req;
  }).map(function (c) {
    return { id: String(c.id || '').trim(), effective_date: String(c.effective_date || '').trim(), value: String(c.value || '').trim() };
  }).sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0; });
}
