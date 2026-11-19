/**
 * F9 시간표 제출 규칙(RULES 세션 소유, R23, docs/contracts/rules-api.md, PRD F9, 결정 31).
 *
 * 순수 함수만 둔다. DateRules.gs(ymd…·ruleStr_·ruleIso_)와 AttendanceRules.gs(parseBlockSpec_·formatBlockSpec_)를 부른다.
 * fixed_schedules: id, student_id, month(yyyy-MM), weekday(월~일), blocks, code(학·가·없음),
 *                  submitted_at, parent_agreed_at, teacher_confirmed_at, status(제출·동의·확정·반려·취소).
 * 한 학생·한 달의 살아 있는(취소 아닌) 행은 늘 같은 상태로 함께 움직인다(달 단위 상태 기계).
 * 출석부가 읽는 유효 시간표는 AttendanceRules.gs의 effectiveFixedRows_("확정 전에는 기존 시간표 유지").
 */

var TT_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/** settings 값 → 날짜 숫자. 'last'·빈칸 → 말일. 1~31 정수가 아니면 fallback. 말일보다 크면 말일. */
function ttDayNum_(v, dim, fallback) {
  var s = ruleStr_(v).toLowerCase();
  if (s === 'last') return dim;
  var n = /^\d{1,2}$/.test(s) ? Number(s) : NaN;
  if (!(n >= 1 && n <= 31)) n = fallback === 'last' ? dim : fallback;
  return Math.min(n, dim);
}

/** 'yyyy-MM' 다음 달. */
function ttNextMonth_(ym) {
  var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 12 ? (y + 1) + '-01' : y + '-' + ymdPad2_(m + 1);
}

/** 그 달(yyyy-MM)의 제출 기간 {start, end}('yyyy-MM-dd'). 시작 > 끝이면 null. */
function ttWindowIn_(ym, cfg) {
  var dim = ymdDaysInMonth_(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
  var s = ttDayNum_(cfg.startDay, dim, 25), e = ttDayNum_(cfg.endDay, dim, 'last');
  return s > e ? null : { start: ym + '-' + ymdPad2_(s), end: ym + '-' + ymdPad2_(e) };
}

/**
 * 제출 기간 판정. today 'yyyy-MM-dd', cfg = {startDay(settings timetable.submit_start_day), endDay(…submit_end_day)}.
 * → {open, month(이 기간에 내는 시간표의 적용월 = 기간이 있는 달의 다음 달), start, end, reason}
 * 열려 있으면 이번 기간, 닫혀 있으면 다음 기간(start·end·month)과 이유. 잘못된 today는 Error.
 * 설정값이 틀리면 기본값(25 · 말일), 그 달 말일보다 큰 날은 말일(2월 30일 → 28·29일).
 * 시작 > 끝(예: 시작 28, 끝 20)이면 늘 닫힘·start/end/month ''·이유 '설정 오류'.
 */
function ttSubmitWindow_(today, cfg) {
  if (!ymdIsValid_(today)) throw new Error('today는 yyyy-MM-dd여야 합니다: ' + today);
  cfg = cfg || {};
  var ym = today.slice(0, 7), w = ttWindowIn_(ym, cfg);
  if (!w) return { open: false, month: '', start: '', end: '', reason: '시간표 제출 기간 설정이 잘못되었습니다(시작일이 마감일보다 늦음)' };
  if (today >= w.start && today <= w.end) return { open: true, month: ttNextMonth_(ym), start: w.start, end: w.end, reason: '' };
  var nym = today < w.start ? ym : ttNextMonth_(ym), nw = today < w.start ? w : ttWindowIn_(nym, cfg);
  return { open: false, month: ttNextMonth_(nym), start: nw.start, end: nw.end,
    reason: '지금은 시간표 제출 기간이 아닙니다. 다음 제출 기간: ' + nw.start + ' ~ ' + nw.end + '(' + ttNextMonth_(nym) + ' 시간표)' };
}

/**
 * 제출 입력 검사·정규화. entries = [{weekday, blocks, code}].
 * → {ok, errors:[문자열], rows:[{weekday, blocks(정규 표기), code}]}
 * - weekday 월~일, code '학'·'가'만, blocks는 parseBlockSpec_(ALL 또는 HH:mm-HH:mm;…) 오류 없음.
 * - 같은 요일 행끼리 블록이 겹치면 오류(ALL은 그 요일의 다른 어떤 행과도 겹침, 맞닿기만 하면 괜찮음).
 * - 빈 목록은 ok — 학·가가 없는 달 = code '없음' 행 1개(weekday·blocks 빈칸, 결정 31).
 * rows는 요일 순 → 시작 시각 순.
 */
function ttValidateEntries_(entries) {
  var errors = [], rows = [];
  (entries || []).forEach(function (e, i) {
    e = e || {};
    var tag = (i + 1) + '번째 줄: ', wd = ruleStr_(e.weekday), code = ruleStr_(e.code), p = parseBlockSpec_(e.blocks);
    var bad = false;
    if (TT_WEEKDAYS.indexOf(wd) < 0) { errors.push(tag + '요일은 월~일 중 하나여야 합니다: ' + wd); bad = true; }
    if (code !== '학' && code !== '가') { errors.push(tag + "구분은 '학'(학원) 또는 '가'(가정)여야 합니다: " + code); bad = true; }
    p.errors.forEach(function (m) { errors.push(tag + m); bad = true; });
    if (!bad) rows.push({ weekday: wd, blocks: formatBlockSpec_(p), code: code, _p: p, _i: i });
  });
  TT_WEEKDAYS.forEach(function (wd) {
    var same = rows.filter(function (r) { return r.weekday === wd; });
    for (var a = 0; a < same.length; a++) {
      for (var b = a + 1; b < same.length; b++) {
        var x = same[a]._p, y = same[b]._p;
        var hit = x.all || y.all || x.ranges.some(function (r) {
          return y.ranges.some(function (q) { return hmToMin_(r.start) < hmToMin_(q.end) && hmToMin_(q.start) < hmToMin_(r.end); });
        });
        if (hit) errors.push(wd + '요일 ' + (same[a]._i + 1) + '번째 줄과 ' + (same[b]._i + 1) + '번째 줄의 시간이 겹칩니다');
      }
    }
  });
  rows.sort(function (r, q) {
    return TT_WEEKDAYS.indexOf(r.weekday) - TT_WEEKDAYS.indexOf(q.weekday) ||
      (r._p.all ? -1 : q._p.all ? 1 : hmToMin_(r._p.ranges[0].start) - hmToMin_(q._p.ranges[0].start));
  });
  return { ok: !errors.length, errors: errors, rows: errors.length ? [] : rows.map(function (r) { return { weekday: r.weekday, blocks: r.blocks, code: r.code }; }) };
}

/**
 * 한 학생·한 달의 상태. → {status: ''(행 없음)|'제출'|'동의'|'확정'|'반려'|'혼합', rows(살아 있는 행)}
 * '혼합'은 살아 있는 행의 상태가 서로 다를 때(이 규칙으로 쓰면 생기지 않는다 — 옛 행·손으로 고친 시트).
 */
function ttMonthState_(rows, studentId, month) {
  var sid = ruleStr_(studentId), mo = ruleStr_(month);
  var live = (rows || []).filter(function (r) {
    return r && ruleStr_(r.student_id) === sid && ruleStr_(r.month) === mo && ruleStr_(r.status) !== '취소';
  });
  var sts = {};
  live.forEach(function (r) { sts[ruleStr_(r.status)] = 1; });
  var keys = Object.keys(sts);
  return { status: !keys.length ? '' : keys.length === 1 ? keys[0] : '혼합', rows: live };
}

/**
 * 상태 기계 한 걸음(달 단위). 권한(누가 이 행동을 해도 되는지)은 서버 requirePermission_이 정한다.
 * action:
 *   'submit'    학생 제출·다시 제출: ctx.entries(ttValidateEntries_), ctx.window(cfg) — 오늘(ctx.now의 날짜)이 제출 기간이고
 *               month가 그 기간의 적용월이어야 한다. 살아 있는 행은 모두 취소하고 새 행(status 제출)을 더한다
 *               (확정·동의 뒤에 다시 내도 같다 — 동의·확인은 처음부터 다시).
 *   'withdraw'  학생 제출 거두기: 제출·동의·반려 → 모두 취소. 확정은 거둘 수 없다.
 *   'agree'     학부모 동의: 제출 → 동의(parent_agreed_at = now).
 *   'unagree'   학부모 동의 거두기: 동의 → 제출(parent_agreed_at '').
 *   'confirm'   담당교사 확인: 동의 → 확정(teacher_confirmed_at = now).
 *   'unconfirm' 담당교사 확인 거두기: 확정 → 동의(teacher_confirmed_at ''). 이미 시작한 달이면 경고.
 *   'reject'    담당교사 반려: 제출·동의 → 반려(학생이 다시 내야 한다).
 * ctx = {now:'yyyy-MM-ddTHH:mm:ss', entries, window}
 * → {ok, reason, add:[행(student_id, month, weekday, blocks, code, submitted_at, parent_agreed_at, teacher_confirmed_at, status)],
 *    update:[{id, set:{열: 값}}], cancel:[id], warnings:[]}
 * ok false면 add·update·cancel은 비어 있다. 잘못된 month·now·action은 Error.
 */
function ttTransition_(rows, studentId, month, action, ctx) {
  ctx = ctx || {};
  var sid = ruleStr_(studentId), mo = ruleStr_(month), now = ruleIso_(ctx.now);
  if (!sid) throw new Error('studentId가 비어 있습니다');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mo)) throw new Error('month는 yyyy-MM이어야 합니다: ' + month);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(now) || !ymdIsValid_(now.slice(0, 10))) throw new Error('now는 yyyy-MM-ddTHH:mm:ss여야 합니다: ' + ctx.now);
  var st = ttMonthState_(rows, sid, mo), cur = st.status, ids = st.rows.map(function (r) { return ruleStr_(r.id); });
  var out = { ok: true, reason: '', add: [], update: [], cancel: [], warnings: [] };
  var fail = function (reason) { return { ok: false, reason: reason, add: [], update: [], cancel: [], warnings: [] }; };
  var need = function (allowed, what) {
    return allowed.indexOf(cur) >= 0 ? '' : (cur ? '지금 상태(' + cur + ')에서는 ' + what + ' 수 없습니다' : '제출한 시간표가 없습니다');
  };
  var setAll = function (set) { ids.forEach(function (id) { out.update.push({ id: id, set: set }); }); };
  var started = now.slice(0, 7) >= mo;
  var why;

  switch (action) {
    case 'submit':
      var w = ttSubmitWindow_(now.slice(0, 10), ctx.window);
      // ASSUMPTION(열린 질문): 기간을 놓치면 그 달에는 낼 수 없고 앞 달 확정 시간표가 그대로 이어진다(effectiveFixedRows_). 교사 대신 입력·기간 연장 없음.
      if (!w.open) return fail(w.reason);
      if (w.month !== mo) return fail('이번 제출 기간에는 ' + w.month + ' 시간표만 낼 수 있습니다');
      if (cur === '혼합') return fail('이 달 시간표 행의 상태가 섞여 있습니다. 담당교사에게 알려 주세요');
      var v = ttValidateEntries_(ctx.entries);
      if (!v.ok) return fail(v.errors.join('\n'));
      out.cancel = ids;
      (v.rows.length ? v.rows : [{ weekday: '', blocks: '', code: '없음' }]).forEach(function (r) {
        out.add.push({ student_id: sid, month: mo, weekday: r.weekday, blocks: r.blocks, code: r.code,
          submitted_at: now, parent_agreed_at: '', teacher_confirmed_at: '', status: '제출' });
      });
      if (cur === '확정') out.warnings.push('확정된 ' + mo + ' 시간표를 다시 냈습니다. 학부모 동의·담당교사 확인을 다시 받아야 합니다');
      return out;
    case 'withdraw':
      if ((why = need(['제출', '동의', '반려'], '제출을 거둘'))) return fail(why);
      out.cancel = ids;
      return out;
    case 'agree':
      if ((why = need(['제출'], '동의할'))) return fail(why);
      setAll({ status: '동의', parent_agreed_at: now });
      return out;
    case 'unagree':
      if ((why = need(['동의'], '동의를 거둘'))) return fail(why);
      setAll({ status: '제출', parent_agreed_at: '' });
      return out;
    case 'confirm':
      // ASSUMPTION(열린 질문): 학부모 동의 없이 교사가 바로 확정하지 않는다(PRD F9 순서). 0단계 진단 뒤 학부모 접속이 어려우면 다시 정한다.
      if ((why = need(['동의'], '확인할'))) return fail(why);
      setAll({ status: '확정', teacher_confirmed_at: now });
      return out;
    case 'unconfirm':
      if ((why = need(['확정'], '확인을 거둘'))) return fail(why);
      setAll({ status: '동의', teacher_confirmed_at: '' });
      if (started) out.warnings.push(mo + '은 이미 시작한 달입니다. 다시 확인할 때까지 출석부는 앞 달 확정 시간표를 씁니다');
      return out;
    case 'reject':
      if ((why = need(['제출', '동의'], '반려할'))) return fail(why);
      setAll({ status: '반려' });
      return out;
  }
  throw new Error('알 수 없는 action: ' + action);
}

/**
 * 미제출 학생(PRD F9 "마감까지 미제출한 학생 목록"). studentIds 중 그 달(month) 살아 있는 행이 없거나 반려 상태인 학생 id, 들어온 순서.
 * 반려도 넣는다(다시 내야 하므로).
 */
function ttMissing_(rows, studentIds, month) {
  var seen = {};
  return (studentIds || []).map(ruleStr_).filter(function (sid) {
    if (!sid || seen[sid]) return false;
    seen[sid] = 1;
    var s = ttMonthState_(rows, sid, month).status;
    return s === '' || s === '반려';
  });
}
