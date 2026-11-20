/**
 * F13 월별 일정(결정 80, 접두어 evt). 관리자가 등록·취소, 교사 역할은 모두 달력으로 본다(event.view). 학생·학부모는 F14.
 * - events 탭: 시작일·끝날(비면 하루)·제목·종류(settings event.kinds)·메모·status(유효·취소)·cancel_reason. 지우지 않는다.
 * - 운영 안 하는 날은 자습 일정(day_schedules)을 resolveDayPlan_로 읽어 함께 보인다 — 두 번 입력하지 않는다(calMonthPlans_ 재사용).
 * - 쓰기는 withLock_ 안에서 화면이 본 표(token = 살아 있는 일정 행 id|updated_at 해시)와 지금을 비교한다(다르면 {stale:true}).
 */
var EVT_TITLE_MAX = 60;
var EVT_MEMO_MAX = 200;
var EVT_MAX_DAYS = 366;
var EVT_REASON_MIN = 2;
var EVT_STALE_MSG = '다른 선생님이 먼저 바꿨습니다. 새로 불러온 뒤 다시 해 주세요.';

/** settings 행 → 종류 목록(비면 기본값) */
function evtKinds_(settingRows) {
  var kv = {};
  (settingRows || []).forEach(function (r) { kv[String(r.key || '').trim()] = String(r.value || ''); });
  var def = '';
  DEFAULT_SETTINGS.forEach(function (s) { if (s[0] === 'event.kinds') def = s[1]; });
  var raw = kv['event.kinds'] !== undefined && kv['event.kinds'].trim() !== '' ? kv['event.kinds'] : def;
  var out = [];
  raw.split(',').forEach(function (x) { x = x.trim(); if (x && out.indexOf(x) < 0) out.push(x); });
  return out;
}

function evtLive_(rows) {
  return rows.filter(function (r) { return String(r.status || '').trim() !== '취소'; });
}

/** 살아 있는 일정 표: 행 id|updated_at을 정렬해 해시 */
function evtToken_(rows) {
  return dtyHash_(evtLive_(rows).map(function (r) { return r.id + '|' + (r.updated_at || ''); }).sort().join(';'));
}

/** 끝날이 비면 시작일 */
function evtEnd_(r) { return String(r.end_date || '').trim() || String(r.start_date || '').trim(); }

/** 입력 검사(순수) → {ok, errors:[{field,message}], rec} */
function evtValidate_(input, kinds) {
  input = input || {};
  var errors = [];
  var add = function (field, message) { errors.push({ field: field, message: message }); };
  var title = String(input.title || '').trim();
  if (!title) add('title', '제목을 적어 주세요.');
  else if (title.length > EVT_TITLE_MAX) add('title', '제목은 ' + EVT_TITLE_MAX + '자 안으로 적어 주세요.');
  var kind = String(input.kind || '').trim();
  if (!kind) add('kind', '종류를 골라 주세요.');
  else if (kinds.indexOf(kind) < 0) add('kind', '목록에 없는 종류입니다. 목록에서 골라 주세요.');
  var start = String(input.start_date || '').trim(), end = String(input.end_date || '').trim() || start;
  if (!ymdIsValid_(start)) add('start_date', '시작 날짜를 골라 주세요.');
  else if (!ymdIsValid_(end)) add('end_date', '끝 날짜를 날짜로 골라 주세요.');
  else if (end < start) add('end_date', '끝 날짜가 시작 날짜보다 앞입니다.');
  else if (ymdDiffDays_(start, end) + 1 > EVT_MAX_DAYS) add('end_date', '일정은 ' + EVT_MAX_DAYS + '일 안으로 등록해 주세요. 나누어 등록해 주세요.');
  var memo = String(input.memo || '').trim();
  if (memo.length > EVT_MEMO_MAX) add('memo', '메모는 ' + EVT_MEMO_MAX + '자 안으로 적어 주세요.');
  return { ok: errors.length === 0, errors: errors, rec: { start_date: start, end_date: end, title: title, kind: kind, memo: memo, status: '유효' } };
}

/** 그 달과 겹치는 일정(순수). month 'yyyy-MM' */
function evtOverlapping_(rows, month) {
  var first = month + '-01', last = month + '-' + ymdPad2_(ymdDaysInMonth_(Number(month.slice(0, 4)), Number(month.slice(5, 7))));
  return evtLive_(rows).filter(function (r) { return ymdIsValid_(String(r.start_date)) && String(r.start_date) <= last && evtEnd_(r) >= first; })
    .sort(function (a, b) { return String(a.start_date) < String(b.start_date) ? -1 : String(a.start_date) > String(b.start_date) ? 1 : (String(a.title) < String(b.title) ? -1 : 1); });
}

function evtView_(r) {
  return { id: r.id, title: r.title, kind: r.kind, memo: r.memo || '', start: String(r.start_date), end: evtEnd_(r), days: ymdDiffDays_(String(r.start_date), evtEnd_(r)) + 1 };
}

/** 월별 일정: 그 달 일정 목록 + 날짜별(운영 여부·일정 id). month 비우면 이번 달 */
function getEventData(month) {
  var user = requirePermission_('event.view');
  var m = String(month || '').trim() || today_().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m) || !ymdIsValid_(m + '-01')) throw new Error('달을 yyyy-MM 형식으로 골라 주세요.');
  var rows = readAll_('events');
  var list = evtOverlapping_(rows, m);
  var plans = calMonthPlans_(m, calLoadCtx_());
  var days = plans.map(function (p) {
    return { date: p.date, weekdayKo: p.weekdayKo, operating: p.operating, closedMemo: p.operating ? '' : p.memo || '',
      ids: list.filter(function (r) { return String(r.start_date) <= p.date && evtEnd_(r) >= p.date; }).map(function (r) { return r.id; }) };
  });
  return { month: m, today: today_(), canEdit: hasAnyAllowedRole_(user.roles, permissions_()['event.edit'].roles),
    kinds: evtKinds_(readAll_('settings', 'config')), events: list.map(evtView_), days: days, token: evtToken_(rows) };
}

/** 일정 등록(관리자). input = {title, kind, start_date, end_date, memo, token}. 같은 일정(제목·종류·기간)이 이미 있으면 거부 */
function saveEvent(input) {
  var user = requirePermission_('event.edit');
  input = input || {};
  return withLock_(function () {
    invalidate_('db', 'events');
    invalidate_('config', 'settings');
    var rows = readAll_('events');
    var v = evtValidate_(input, evtKinds_(readAll_('settings', 'config')));
    if (!v.ok) return { ok: false, errors: v.errors };
    if (typeof input.token !== 'string' || input.token !== evtToken_(rows)) return { ok: false, stale: true, error: EVT_STALE_MSG };
    var dup = evtLive_(rows).some(function (r) { return r.title === v.rec.title && r.kind === v.rec.kind && String(r.start_date) === v.rec.start_date && evtEnd_(r) === v.rec.end_date; });
    if (dup) return { ok: false, errors: [{ field: 'title', message: '같은 일정(제목·종류·기간)이 이미 있습니다.' }] };
    var made = appendRecord_('events', Object.assign({ cancel_reason: '' }, v.rec), user.email);
    return { ok: true, id: made.id };
  });
}

/** 일정 취소(관리자, 사유 필수, 행은 남고 status 취소). token = 화면이 본 표 */
function cancelEvent(id, reason, token) {
  var user = requirePermission_('event.edit');
  var why = String(reason || '').trim();
  return withLock_(function () {
    invalidate_('db', 'events');
    var rows = readAll_('events');
    var row = evtLive_(rows).filter(function (r) { return r.id === String(id || ''); })[0];
    if (!row) return { ok: false, stale: true, error: '이미 취소됐거나 없는 일정입니다. 새로 불러와 주세요.' };
    if (typeof token !== 'string' || token !== evtToken_(rows)) return { ok: false, stale: true, error: EVT_STALE_MSG };
    if (why.length < EVT_REASON_MIN) return { ok: false, errors: [{ field: 'reason', message: '취소 사유를 ' + EVT_REASON_MIN + '자 이상 적어 주세요.' }] };
    if (why.length > EVT_MEMO_MAX) return { ok: false, errors: [{ field: 'reason', message: '취소 사유는 ' + EVT_MEMO_MAX + '자 안으로 적어 주세요.' }] };
    updateRecord_('events', row.id, { status: '취소', cancel_reason: why }, user.email);
    return { ok: true };
  });
}

/** 홈 카드용: 오늘 일정과 앞으로 14일 안의 다음 일정(제목·종류·날짜만). 탭이 없으면 빈 값 */
function evtHomeInfo_(user, role) {
  var today = today_(), rows;
  try { rows = readAll_('events'); } catch (e) {
    if (String(e.message).indexOf('탭이 없습니다') >= 0) return { today: [], next: [], missingTab: true };
    throw e;
  }
  var live = evtLive_(rows).filter(function (r) { return ymdIsValid_(String(r.start_date)); });
  var horizon = ymdAddDays_(today, 14);
  var now = live.filter(function (r) { return String(r.start_date) <= today && evtEnd_(r) >= today; });
  var next = live.filter(function (r) { return String(r.start_date) > today && String(r.start_date) <= horizon; })
    .sort(function (a, b) { return String(a.start_date) < String(b.start_date) ? -1 : 1; }).slice(0, 3);
  var short = function (r) { return { id: r.id, title: r.title, kind: r.kind, start: String(r.start_date), end: evtEnd_(r) }; };
  return { today: now.map(short), next: next.map(short) };
}
