/**
 * F0 자습 일정·블록(C4). PRD 3.3. 날짜·블록 계산은 RULES의 resolveDayPlan_·validateBlocks_·pickDaySchedule_을 부른다.
 *
 * - 요일 유형별 출석 블록(blocks 탭) 편집. 관리자만.
 * - 날짜별 일정(day_schedules 탭): 운영 안 함·시작·종료·요일 유형·메모. 관리자만.
 * - 지우지 않는다: 바꾸거나 되돌릴 때 이전 행의 status를 '취소'로 바꾸고(updateRecord_ → audit_log) 새 행을 쓴다.
 * - 보기(달력·미리보기)는 교사 역할 모두.
 *
 * 순수 함수(cal…)는 tests/features/schedule.test.js가 검사한다.
 * ASSUMPTION: 날짜가 어떤 운영 기간에도 속하지 않으면 '학기' 블록을 쓴다.
 * ASSUMPTION: 블록은 시작 시각 순으로 저장하고 순서(seq)는 1부터 다시 매긴다(R1 resolveDayPlan_과 같은 방식).
 */

var CAL_MAX_BLOCKS = 8;
var CAL_BASE_DAY_TYPES = ['mon_thu', 'fri', 'sat', 'sun'];
var CAL_DAY_TYPE_RE = /^[a-z0-9_]{1,20}$/;
var CAL_MEMO_MAX = 100;

/** 그 날짜가 속한 운영 기간의 유형('학기'|'방학'). 겹치면 나중에 시작한 기간, 없으면 '학기'(가정). */
function calTermTypeOn_(terms, ymd) {
  var hit = null;
  (terms || []).forEach(function (t) {
    if (!t.start_date || !t.end_date || ymd < t.start_date || ymd > t.end_date) return;
    if (!hit || t.start_date >= hit.start_date) hit = t;
  });
  return hit && hit.type === '방학' ? '방학' : '학기';
}

/** settings 행 → resolveDayPlan_의 defaults. 빈 키는 PRD 3.3 기본값. */
function calDefaults_(settingsRows) {
  var kv = {};
  (settingsRows || []).forEach(function (r) { kv[String(r.key || '').trim()] = String(r.value || '').trim(); });
  var pick = function (prefix, s, e) { return { start: kv[prefix + '.start'] || s, end: kv[prefix + '.end'] || e }; };
  return {
    mon_thu: pick('study.weekday', '18:30', '23:50'),
    fri: pick('study.fri', '18:30', '23:00'),
    sat: pick('study.sat', '09:00', '17:00'),
    sun: pick('study.sun', '14:00', '22:00')
  };
}

/**
 * 날짜별 일정 입력 검사.
 * @param {Object} input {date, operating:boolean, start, end, day_type, memo}
 * @param {string[]} knownDayTypes 블록이 있는 요일 유형(특별 코드 포함)
 * @return {{ok:boolean, errors:{field:string,message:string}[], record:Object}}
 */
function calValidateDay_(input, knownDayTypes) {
  input = input || {};
  var errors = [];
  var add = function (field, message) { errors.push({ field: field, message: message }); };
  var date = String(input.date || '').trim();
  if (!ymdIsValid_(date)) add('date', '날짜를 yyyy-MM-dd 형식으로 골라 주세요.');
  var operating = input.operating === true || input.operating === 'TRUE';
  var start = String(input.start || '').trim();
  var end = String(input.end || '').trim();
  var startHm = start ? schedNormHm_(start) : '';
  var endHm = end ? schedNormHm_(end) : '';
  if (start && (!startHm || startHm === '24:00')) add('start', '시작 시각을 18:00처럼 24시간제로 적어 주세요.');
  if (end && !endHm) add('end', '종료 시각을 22:00처럼 24시간제로 적어 주세요(자정은 24:00).');
  var startOk = !start || (startHm && startHm !== '24:00');
  if (operating && startOk && startHm && endHm && hmToMin_(startHm) >= hmToMin_(endHm)) {
    add('end', '종료가 시작보다 앞입니다. 종료를 시작 이후로 고쳐 주세요.');
  }
  var dayType = String(input.day_type || '').trim();
  var allowed = CAL_BASE_DAY_TYPES.concat(knownDayTypes || []);
  if (dayType && allowed.indexOf(dayType) < 0) add('day_type', '목록에 없는 요일 유형입니다. 목록에서 골라 주세요.');
  var memo = String(input.memo || '').trim();
  if (memo.length > CAL_MEMO_MAX) add('memo', '메모는 ' + CAL_MEMO_MAX + '자 안으로 적어 주세요.');
  if (!operating && (start || end || dayType)) {
    // 운영 안 함인데 시각·유형을 넣어도 의미가 없으므로 비운다
    startHm = ''; endHm = ''; dayType = '';
  }
  if (!errors.length && operating && !startHm && !endHm && !dayType && !memo) {
    add('operating', '바꿀 내용이 없습니다. 기본으로 되돌리려면 "기본으로 되돌리기"를 눌러 주세요.');
  }
  return {
    ok: errors.length === 0, errors: errors,
    record: { date: date, operating: operating ? 'TRUE' : 'FALSE', start: startHm || '', end: endHm || '',
      day_type: dayType, memo: memo, status: '유효' }
  };
}

/**
 * 한 (기간 유형, 요일 유형)의 블록을 새 목록으로 바꾸는 계획.
 * incoming: [{start, end}] (순서는 시작 시각 순으로 다시 정하고 라벨은 시각에서 계산한다). existing: 같은 묶음의 지금 유효한 행.
 * @return {{ok:boolean, errors:{index:number,message:string}[], keep:Object[], cancel:Object[], create:Object[]}}
 */
function calBlocksDiff_(termType, dayType, incoming, existing) {
  var errors = [];
  var list = (incoming || []).map(function (b, i) {
    return { i: i, start: schedNormHm_(b && b.start), end: schedNormHm_(b && b.end) };
  });
  if (!list.length) return { ok: false, errors: [{ index: 0, message: '블록이 하나도 없습니다. 최소 한 개는 필요합니다.' }], keep: [], cancel: [], create: [] };
  if (list.length > CAL_MAX_BLOCKS) {
    return { ok: false, errors: [{ index: 0, message: '블록은 ' + CAL_MAX_BLOCKS + '개까지 만들 수 있습니다.' }], keep: [], cancel: [], create: [] };
  }
  list.forEach(function (b) {
    if (!b.start || !b.end) errors.push({ index: b.i, message: '시각을 18:00처럼 24시간제로 적어 주세요.' });
  });
  if (errors.length) return { ok: false, errors: errors, keep: [], cancel: [], create: [] };
  list.sort(function (a, b) { return hmToMin_(a.start) - hmToMin_(b.start) || a.i - b.i; });
  var rows = list.map(function (b, k) {
    // 라벨은 시각에서 계산한다(시각만 바꿨을 때 예전 라벨이 남지 않도록)
    return { term_type: termType, day_type: dayType, seq: String(k + 1), start: b.start, end: b.end,
      label: schedBlockLabel_(b.start, b.end), status: '유효' };
  });
  validateBlocks_(rows).forEach(function (e) { errors.push({ index: list[e.index].i, message: e.message }); });
  if (errors.length) return { ok: false, errors: errors, keep: [], cancel: [], create: [] };

  var keep = [], create = [];
  var left = (existing || []).slice();
  rows.forEach(function (r) {
    var at = -1;
    for (var j = 0; j < left.length; j++) {
      var e = left[j];
      if (String(e.seq) === r.seq && schedNormHm_(e.start) === r.start && schedNormHm_(e.end) === r.end &&
          (String(e.label || '').trim() === r.label || String(e.label || '').trim() === '')) { at = j; break; }
    }
    if (at >= 0) { keep.push(left.splice(at, 1)[0]); } else { create.push(r); }
  });
  return { ok: true, errors: [], keep: keep, cancel: left, create: create };
}

/** 한 달의 날짜별 요약(달력 목록용). resolveDayPlan_ 결과를 화면용으로 줄인 것. */
function calMonthPlans_(month, ctx) {
  var first = month + '-01';
  var days = [];
  var d = first;
  while (d.slice(0, 7) === month) {
    var ds = pickDaySchedule_(ctx.daySchedules, d);
    var plan = resolveDayPlan_(d, {
      termType: calTermTypeOn_(ctx.terms, d), daySchedule: ds, blocks: ctx.blocks, defaults: ctx.defaults
    });
    days.push({
      date: d, weekdayKo: ymdWeekdayKo_(d), dayType: plan.dayType, operating: plan.operating,
      start: plan.start, end: plan.end, blockLabels: plan.blocks.map(function (b) { return b.label; }),
      memo: plan.memo, overridden: !!ds, warnings: plan.warnings, termType: calTermTypeOn_(ctx.terms, d),
      override: ds ? { operating: ds.operating, start: ds.start || '', end: ds.end || '', day_type: ds.day_type || '' } : null
    });
    d = ymdAddDays_(d, 1);
  }
  return days;
}

/* ───────────── 읽기 도우미 ───────────── */

function calActiveRows_(sheet) {
  return readAll_(sheet).filter(function (r) { return String(r.status || '').trim() !== '취소'; });
}

function calLoadCtx_() {
  return {
    terms: readAll_('terms'),
    daySchedules: readAll_('day_schedules'),
    blocks: readAll_('blocks'),
    defaults: calDefaults_(readAll_('settings', 'config'))
  };
}

function calKnownDayTypes_(blocks) {
  var seen = {};
  blocks.forEach(function (b) { if (String(b.status || '').trim() !== '취소' && b.day_type) seen[String(b.day_type).trim()] = true; });
  return Object.keys(seen);
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 달력(한 달)과 블록 목록. month 'yyyy-MM'. 비우면 이번 달.
 */
function getScheduleData(month) {
  var user = requirePermission_('schedule.view');
  var m = String(month || '').trim() || today_().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m) || !ymdIsValid_(m + '-01')) throw new Error('달을 yyyy-MM 형식으로 골라 주세요.');
  var ctx = calLoadCtx_();
  var groups = {};
  ctx.blocks.forEach(function (b) {
    if (String(b.status || '').trim() === '취소') return;
    var key = b.term_type + '|' + b.day_type;
    (groups[key] = groups[key] || []).push({ seq: b.seq, start: schedNormHm_(b.start) || b.start, end: schedNormHm_(b.end) || b.end, label: b.label || '' });
  });
  Object.keys(groups).forEach(function (k) { groups[k].sort(function (a, b) { return +a.seq - +b.seq; }); });
  return {
    month: m, today: today_(),
    canEdit: hasAnyAllowedRole_(user.roles, permissions_()['schedule.edit'].roles),
    days: calMonthPlans_(m, ctx),
    blockGroups: groups,
    dayTypes: CAL_BASE_DAY_TYPES.concat(calKnownDayTypes_(ctx.blocks).filter(function (t) { return CAL_BASE_DAY_TYPES.indexOf(t) < 0; })),
    defaults: ctx.defaults
  };
}

/**
 * (기간 유형, 요일 유형)의 블록을 통째로 바꾼다. 관리자만.
 * @param {Object[]} blocks [{start, end}]
 */
function saveBlocks(termType, dayType, blocks) {
  var user = requirePermission_('schedule.edit');
  var tt = String(termType || '').trim();
  var dt = String(dayType || '').trim();
  if (tt !== '학기' && tt !== '방학') throw new Error('기간 유형은 학기 또는 방학이어야 합니다.');
  if (!CAL_DAY_TYPE_RE.test(dt)) throw new Error('요일 유형을 목록에서 골라 주세요.');
  return withLock_(function () {
    invalidate_('db', 'blocks');
    var existing = readAll_('blocks').filter(function (b) {
      return String(b.status || '').trim() !== '취소' && String(b.term_type).trim() === tt && String(b.day_type).trim() === dt;
    });
    var plan = calBlocksDiff_(tt, dt, blocks, existing);
    if (!plan.ok) return { ok: false, errors: plan.errors };
    plan.cancel.forEach(function (r) { updateRecord_('blocks', r.id, { status: '취소' }, user.email); });
    plan.create.forEach(function (r) { appendRecord_('blocks', r, user.email); });
    return { ok: true, kept: plan.keep.length, cancelled: plan.cancel.length, created: plan.create.length };
  });
}

/** 날짜별 일정을 새로 정한다(그 날짜의 이전 유효 행은 '취소'). 관리자만. */
function saveDaySchedule(input) {
  var user = requirePermission_('schedule.edit');
  return withLock_(function () {
    invalidate_('db', 'blocks');
    invalidate_('db', 'day_schedules');
    var check = calValidateDay_(input, calKnownDayTypes_(readAll_('blocks')));
    if (!check.ok) return { ok: false, errors: check.errors };
    calCancelDay_(check.record.date, user.email);
    appendRecord_('day_schedules', check.record, user.email);
    return { ok: true };
  });
}

/** 그 날짜를 기본으로 되돌린다(유효 행을 '취소'). 관리자만. */
function cancelDaySchedule(date) {
  var user = requirePermission_('schedule.edit');
  var d = String(date || '').trim();
  if (!ymdIsValid_(d)) throw new Error('날짜를 yyyy-MM-dd 형식으로 골라 주세요.');
  return withLock_(function () {
    invalidate_('db', 'day_schedules');
    return { ok: true, cancelled: calCancelDay_(d, user.email) };
  });
}

/** 그 날짜의 유효 행을 모두 '취소'로. 락 안에서 부른다. 취소한 행 수. */
function calCancelDay_(date, email) {
  var rows = readAll_('day_schedules').filter(function (r) {
    return String(r.date).trim() === date && String(r.status || '').trim() !== '취소';
  });
  rows.forEach(function (r) { updateRecord_('day_schedules', r.id, { status: '취소' }, email); });
  return rows.length;
}
