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
 * 상태 값이 바뀔 때의 변경 종류(mealEffectiveDate_의 kind).
 * fromValue = 그 학생·항목의 **이미 기록된 마지막 값** — 취소가 아닌 행을 모두 누적한 값이고, 아직 적용되지 않은
 *   미래 적용일 행도 포함한다(mealLatestValue_). 신청일 기준 statusOn_이 아니다(대기 중인 변경 뒤에 낸 신청을 바르게 보려고).
 * → 'none'(바뀐 것 없음) | 'initial'(기록이 없는 항목의 첫 미실시: 그만둘 급식이 없으므로 신청일에 바로 기록)
 *   | 'start' | 'to_general' | 'stop'
 * item '조식': 실시로 → 'start', 미실시로 → 'stop'. item '석식': 학사 석식으로 → 'start', 일반 석식으로 → 'to_general'(결정 1),
 *   미실시로 → 'stop'(일반 석식 → 미실시 포함, 결정 23 ⑤). 기록 없음('') → 실시·학사 석식·일반 석식은 'start'·'to_general'.
 * with_dorm_entry·on_leave는 값 변화가 아니라 F6 입퇴실과 함께 정해지므로 여기서 나오지 않는다.
 * 모르는 item·값이면 Error.
 */
function mealChangeKind_(item, fromValue, toValue) {
  var it = String(item || '').trim();
  var from = String(fromValue || '').trim(), to = String(toValue || '').trim();
  var allowed = it === '조식' ? ['실시', '미실시'] : it === '석식' ? ['학사 석식', '일반 석식', '미실시'] : null;
  if (!allowed) throw new Error('급식 항목은 조식 또는 석식이어야 합니다: ' + item);
  if (allowed.indexOf(to) < 0) throw new Error(it + ' 값이 아닙니다: ' + toValue);
  if (from && allowed.indexOf(from) < 0) throw new Error(it + ' 값이 아닙니다: ' + fromValue);
  if (from === to) return 'none';
  if (to === '미실시') return from ? 'stop' : 'initial';
  if (to === '일반 석식') return 'to_general';
  return 'start';
}

/**
 * 그 학생·항목의 이미 기록된 마지막 값(mealChangeKind_의 fromValue). 취소가 아닌 행을 모두 누적한 값으로,
 * 아직 적용되지 않은 미래 적용일 행도 포함한다(적용일이 가장 늦은 행 → 같으면 requested_at → created_at → 아래 행,
 * statusOn_과 같은 순서). 기록이 없으면 ''.
 */
function mealLatestValue_(changes, studentId, item) {
  return statusOn_(changes, studentId, item, '9999-12-31');
}

/**
 * 새 급식 변경 행(적용일 effectiveDate)을 저장할 때 '취소'로 바꿔야 할 대기 행들.
 * 같은 학생·같은 항목에서 status가 유효(빈칸 포함)이고 적용일이 effectiveDate보다 **늦은** 행이다.
 * 그대로 두면 새 행보다 늦게 적용되어 새 신청을 덮는다(예: 수요일 미실시 신청 → 다다음 주 월요일 대기 중에
 * 목요일 학사 석식으로 되돌리면 되돌리기가 대기 행에 덮인다. 퇴실일 즉시 조식 중단도 퇴실일 뒤 대기 '실시' 행에 덮인다).
 * → [{id, effective_date, value}] (적용일 순). F6·F7은 새 행을 쓰는 같은 락 안에서 이 행들의 status를 '취소'로 바꾸고
 *   audit_log에 남긴다(cancel 사유 예: '새 급식 변경으로 대체').
 */
function mealPendingToCancel_(changes, studentId, item, effectiveDate) {
  var sid = String(studentId || '').trim(), it = String(item || '').trim(), eff = String(effectiveDate || '').trim();
  if (!ymdIsValid_(eff)) throw new Error('적용일 형식이 아닙니다(yyyy-MM-dd): ' + effectiveDate);
  return (changes || []).filter(function (c) {
    if (!c) return false;
    var st = String(c.status || '').trim();
    return (st === '' || st === '유효') && String(c.student_id || '').trim() === sid && String(c.item || '').trim() === it &&
      String(c.effective_date || '').trim() > eff;
  }).map(function (c) {
    return { id: String(c.id || '').trim(), effective_date: String(c.effective_date || '').trim(), value: String(c.value || '').trim() };
  }).sort(function (a, b) { return a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0; });
}
