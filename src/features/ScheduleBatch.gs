/**
 * 기간 일괄 설정(결정 72, 접두어 calBatch). 관리자만. 기간 + 요일을 고르고 요일 유형·시작·종료·메모를 한꺼번에 정한다.
 *   예) 3~6월 매주 수요일 18:00 시작 / 공휴일 날짜들을 '휴일'로.
 * - previewDayBatch(input): 바뀌는 날·건너뛰는 날 건수와 앞뒤 표를 보여 주고 sig를 준다(쓰지 않는다).
 * - saveDayBatch(input, sig): 락 하나 안에서 다시 계산해 sig가 같을 때만 쓴다(미리 본 뒤 누가 바꿨으면 {stale:true}).
 *   날짜마다 이전 유효 행은 '취소' + 새 행(지우지 않는다). audit_log는 일괄 수정·일괄 추가 줄 + 요약 한 줄.
 * - 빈 칸은 "바꾸지 않음": 그 날 기존 날짜별 일정의 값을 그대로 둔다(요일 유형을 지정해도 그 날 따로 정한 시각이 지워지지 않게).
 * - 운영 안 하는 날(날짜별 일정이 운영 안 함)은 건너뛰고 건수를 알린다. 이미 같은 값인 날도 건너뛴다.
 * - 24:00을 넘는 종료(시험 새벽 연장 '25:00' 등)는 규칙(hmNorm_·출석부 칸)이 바뀐 뒤에 연다 — 지금은 24:00까지.
 * - 이 도구는 근무 칸을 건드리지 않는다(운영 안 함으로 바꾸는 것은 날짜별 편집에서만, 결정 54).
 */
var CAL_BATCH_MAX_DAYS = 366;
var CAL_BATCH_SAMPLE = 40;

/** 입력 검사·정리 → {ok, errors:[{field,message}], input:{from,to,weekdays,dayType,start,end,memo}} */
function calBatchInput_(raw, knownDayTypes) {
  raw = raw || {};
  var errors = [];
  var add = function (field, message) { errors.push({ field: field, message: message }); };
  var from = String(raw.from || '').trim(), to = String(raw.to || '').trim();
  if (!ymdIsValid_(from)) add('from', '시작 날짜를 골라 주세요.');
  if (!ymdIsValid_(to)) add('to', '끝 날짜를 골라 주세요.');
  if (ymdIsValid_(from) && ymdIsValid_(to)) {
    if (to < from) add('to', '끝 날짜가 시작 날짜보다 앞입니다.');
    else if (ymdDiffDays_(from, to) + 1 > CAL_BATCH_MAX_DAYS) add('to', '기간은 ' + CAL_BATCH_MAX_DAYS + '일 안으로 골라 주세요.');
  }
  var wd = Array.isArray(raw.weekdays) ? raw.weekdays : [];
  var days = [];
  wd.forEach(function (n) { if (typeof n === 'number' && n >= 0 && n <= 6 && Math.floor(n) === n && days.indexOf(n) < 0) days.push(n); });
  if (!days.length || days.length !== wd.length) add('weekdays', '요일을 하나 이상 골라 주세요.');
  days.sort();
  var tmpl = calValidateDay_({ date: ymdIsValid_(from) ? from : '2000-01-01', operating: true, start: raw.start, end: raw.end, day_type: raw.dayType, memo: raw.memo }, knownDayTypes);
  tmpl.errors.forEach(function (e) {
    if (e.field === 'operating') return;   // 바꿀 내용이 없는 경우는 아래에서 따로
    add(e.field === 'day_type' ? 'dayType' : e.field, e.message);
  });
  var r = tmpl.record;
  if (!errors.length && !r.start && !r.end && !r.day_type && !r.memo) add('dayType', '바꿀 내용이 없습니다. 요일 유형·시작·종료·메모 중 하나는 정해 주세요.');
  return { ok: errors.length === 0, errors: errors,
    input: { from: from, to: to, weekdays: days, dayType: r.day_type, start: r.start, end: r.end, memo: r.memo } };
}

/** 한 날짜의 합친 날짜별 일정 행(빈 칸은 기존 값 유지). 운영함으로 쓴다 */
function calBatchMerge_(date, input, ds) {
  return {
    date: date, operating: 'TRUE',
    start: input.start || (ds && ds.start ? schedNormHm_(ds.start) || '' : ''),
    end: input.end || (ds && ds.end ? schedNormHm_(ds.end) || '' : ''),
    day_type: input.dayType || (ds && ds.day_type ? String(ds.day_type).trim() : ''),
    memo: input.memo || (ds ? String(ds.memo || '').trim() : ''),
    status: '유효'
  };
}

function calBatchSame_(rec, ds) {
  return !!ds && String(ds.operating || '').trim().toUpperCase() !== 'FALSE' &&
    (schedNormHm_(ds.start) || '') === rec.start && (schedNormHm_(ds.end) || '') === rec.end &&
    String(ds.day_type || '').trim() === rec.day_type && String(ds.memo || '').trim() === rec.memo;
}

function calBatchShow_(plan) {
  return plan.start + '–' + plan.end + ' ' + (CAL_DAY_TYPE_KO[plan.dayType] || plan.dayType);
}

/**
 * 계획(쓰지 않는다): → {ok, errors, input, total, change:[{date, rec, old:ds|null}], closed:[date], same:[date], sample:[{date,weekdayKo,before,after}], sig}
 * 락 안·밖 어디서든 부를 수 있다(읽기만).
 */
function calBatchPlan_(raw, ctx) {
  var chk = calBatchInput_(raw, calKnownDayTypes_(ctx.blocks));
  if (!chk.ok) return { ok: false, errors: chk.errors };
  var input = chk.input, errors = [];
  var dates = ymdRange_(input.from, input.to, CAL_BATCH_MAX_DAYS).filter(function (d) { return input.weekdays.indexOf(ymdWeekday_(d)) >= 0; });
  if (!dates.length) return { ok: false, errors: [{ field: 'weekdays', message: '고른 기간에 해당 요일이 없습니다.' }] };
  var change = [], closed = [], same = [], sample = [], tokens = [], noBlocks = {}, badTime = [];
  dates.forEach(function (d) {
    var ds = pickDaySchedule_(ctx.daySchedules, d);
    var termType = calTermTypeOn_(ctx.terms, d);
    tokens.push(d + '#' + calRowsToken_(calDayRows_(ctx.daySchedules, d)));
    var before = resolveDayPlan_(d, { termType: termType, daySchedule: ds, blocks: ctx.blocks, defaults: ctx.defaults });
    if (!before.operating) { closed.push(d); return; }
    var rec = calBatchMerge_(d, input, ds);
    if (calBatchSame_(rec, ds)) { same.push(d); return; }
    var after = resolveDayPlan_(d, { termType: termType, daySchedule: rec, blocks: ctx.blocks, defaults: ctx.defaults });
    if (after.start && after.end && hmToMin_(after.start) >= hmToMin_(after.end)) { badTime.push(d); return; }
    if (!after.blocks.length) { noBlocks[after.dayType + '|' + termType] = true; return; }
    change.push({ date: d, rec: rec, old: ds });
    if (sample.length < CAL_BATCH_SAMPLE) sample.push({ date: d, weekdayKo: ymdWeekdayKo_(d), before: calBatchShow_(before), after: calBatchShow_(after) });
  });
  if (badTime.length) errors.push({ field: 'end', message: '종료가 시작보다 앞이 되는 날이 있습니다(' + badTime.slice(0, 3).join(', ') + (badTime.length > 3 ? ' 외 ' + (badTime.length - 3) + '일' : '') + '). 시각을 고쳐 주세요.' });
  Object.keys(noBlocks).forEach(function (k) {
    var p = k.split('|');
    errors.push({ field: 'dayType', message: '요일 유형 "' + (CAL_DAY_TYPE_KO[p[0]] || p[0]) + '"의 ' + p[1] + ' 블록이 아직 없습니다. 블록 편집에서 먼저 만들어 주세요.' });
  });
  if (errors.length) return { ok: false, errors: errors };
  var sig = dtyHash_(JSON.stringify([input, tokens, calRowsToken_(ctx.blocks.filter(function (b) { return String(b.status || '').trim() !== '취소'; })), calRowsToken_(ctx.terms)]));
  return { ok: true, errors: [], input: input, total: dates.length, change: change, closed: closed, same: same, sample: sample, sig: sig };
}

function calBatchView_(plan) {
  if (!plan.ok) return { ok: false, errors: plan.errors };
  return { ok: true, input: plan.input, total: plan.total, changeCount: plan.change.length, closedCount: plan.closed.length, sameCount: plan.same.length,
    sample: plan.sample, moreCount: Math.max(0, plan.change.length - plan.sample.length), sig: plan.sig };
}

/** 미리 보기: 아무것도 쓰지 않는다. 관리자만 */
function previewDayBatch(input) {
  requirePermission_('schedule.edit');
  return calBatchView_(calBatchPlan_(input, calLoadCtx_()));
}

/** 저장: previewDayBatch가 준 sig를 함께 보낸다. 락 안에서 다시 계산해 다르면 {ok:false, stale:true} */
function saveDayBatch(input, sig) {
  var user = requirePermission_('schedule.edit');
  return withLock_(function () {
    ['blocks', 'day_schedules', 'terms'].forEach(function (t) { invalidate_('db', t); });
    var plan = calBatchPlan_(input, calLoadCtx_());
    if (!plan.ok) return { ok: false, errors: plan.errors };
    if (typeof sig !== 'string' || sig !== plan.sig) return { ok: false, stale: true, error: CAL_STALE_MSG };
    var cancels = [];
    plan.change.forEach(function (c) { if (c.old) cancels.push({ id: c.old.id, patch: { status: '취소' } }); });
    // 같은 날짜에 유효 행이 여럿(옛 잘못된 상태)이어도 모두 취소한다
    var live = readAll_('day_schedules');
    plan.change.forEach(function (c) {
      calDayRows_(live, c.date).forEach(function (r) {
        if (!c.old || r.id !== c.old.id) cancels.push({ id: r.id, patch: { status: '취소' } });
      });
    });
    bulkUpdateRecords_('day_schedules', cancels, user.email);
    bulkAppend_('day_schedules', plan.change.map(function (c) { return c.rec; }), user.email);
    writeAudit_('day_schedules', '', 'schedule:batch', null, plan.input, user.email, 'db',
      plan.input.from + '~' + plan.input.to + ' ' + plan.change.length + '일 변경, 운영 안 함 ' + plan.closed.length + '일·같은 값 ' + plan.same.length + '일 건너뜀');
    return { ok: true, changed: plan.change.length, closed: plan.closed.length, same: plan.same.length };
  });
}
