/**
 * 급식 적용일 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F6·F7, 결정 1·2·3, plan 4절 f·g).
 *
 * 순수 함수만 둔다. DateRules.gs의 함수(isoLocalSplit_·ymd…·hm…)를 부른다.
 *
 * | kind            | 언제                                   | 적용일                                         |
 * | start           | 실시 신청(조식 실시, 석식 학사 실시)     | 마감(11:30) 전 신청 → 당일, 마감 이후 → 다음 날   |
 * | to_general      | 일반 석식으로 변경                     | start와 같음(결정 1)                            |
 * | stop            | 미실시                                 | 월·화 신청 → 다음 주 월요일, 수~일 → 다다음 주 월요일 |
 * | with_dorm_entry | 기숙사 입실과 함께 조식 실시            | 입실일(opts.entryDate)                          |
 * | on_leave        | 학사 퇴실에 따른 조식 중단              | 퇴실일(opts.leaveDate) 즉시                     |
 * 서류 미제출이어도 적용한다(결정 3) — 이 함수는 서류를 보지 않는다.
 */

/**
 * 적용일 계산. requestedAt = 신청 일시 KST 'yyyy-MM-ddTHH:mm:ss'(isoLocalSplit_이 받는 형식).
 * opts = {cutoff:'11:30', entryDate, leaveDate} → {date:'yyyy-MM-dd', rule}
 * rule: 'same_day'|'next_day'|'next_monday'|'monday_after_next'|'entry_date'|'leave_date'
 * ASSUMPTION(plan 4절 f): 마감 시각 정각(11:30:00)에 낸 신청은 마감 이후로 본다(다음 날). 11:29:59는 당일.
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
  if (k === 'start' || k === 'to_general') {
    var cutoff = opts.cutoff === undefined || opts.cutoff === null || opts.cutoff === '' ? '11:30' : String(opts.cutoff).trim();
    if (!hmIsValid_(cutoff) || cutoff === '24:00') throw new Error('마감 시각 형식이 아닙니다(HH:mm): ' + cutoff);
    if (at.sec < hmToMin_(cutoff) * 60) return { date: at.date, rule: 'same_day' };
    return { date: ymdAddDays_(at.date, 1), rule: 'next_day' };
  }
  if (k === 'stop') {
    var w = ymdWeekday_(at.date);           // 0=일 … 6=토
    var monday = ymdMondayOf_(at.date);      // 월~일 주의 월요일
    if (w === 1 || w === 2) return { date: ymdAddDays_(monday, 7), rule: 'next_monday' };
    return { date: ymdAddDays_(monday, 14), rule: 'monday_after_next' };
  }
  throw new Error('알 수 없는 급식 변경 종류: ' + kind);
}

/**
 * 상태 값이 바뀔 때의 변경 종류(mealEffectiveDate_의 kind). 바뀌지 않으면 ''.
 * item '조식': 실시로 → 'start', 미실시로 → 'stop'.
 * item '석식': 학사 석식으로 → 'start', 일반 석식으로 → 'to_general', 미실시로 → 'stop'.
 * fromValue ''(기록 없음)도 받는다. ASSUMPTION(plan 4절 g): 일반 석식 → 미실시도 미실시 규칙('stop').
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
  if (from === to) return '';
  if (to === '미실시') return 'stop';
  if (to === '일반 석식') return 'to_general';
  return 'start';
}
