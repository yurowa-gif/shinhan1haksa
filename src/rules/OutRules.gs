/**
 * OUT 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F1·F4, 결정 4·10·22, vocabulary.md violations).
 *
 * 순수 함수만 둔다. DateRules.gs(ymdIsValid_)·AttendanceRules.gs(attStr_·attTypeBase_·parseBlockSpec_)의 함수를 부른다.
 * 시트 행(문자열)은 그대로 받는다.
 *   exceptions_<기간>:  id, term_id, group_id, student_id, date, blocks, type, status(요청·확정·취소),
 *                      requested_by, confirmed_by, confirmed_at …
 *   violations_<기간>:  id, term_id, student_id, occurred_at, rule_id, rule_name, memo, detected_by, entered_by,
 *                      status(유효·취소), source(직접·F1자동), source_exception_id, cancel_reason …
 */

/** 자동 OUT 기록인지(source 'F1자동'). */
function outIsAuto_(v) {
  return attStr_(v && v.source) === 'F1자동';
}

/** 살아 있는 OUT인지(status 빈칸·'유효'). */
function outIsLive_(v) {
  var st = attStr_(v && v.status);
  return st === '' || st === '유효';
}

/** 자동 취소 사유의 머리말(vocabulary.md). 관리자가 직접 취소한 자동 OUT과 구별한다. */
function outAutoCancelPrefix_() {
  return '[자동] ';
}

/** 자동 OUT의 rule_name: '무단 지각·결석·이탈(미인정결석)' — 만들 때의 특이사항 유형을 괄호에 남긴다. */
function outRuleName_(ruleName, type) {
  return (attStr_(ruleName) || '무단 지각·결석·이탈') + '(' + attTypeBase_(type) + ')';
}

/** rule_name 끝 괄호에 남긴 특이사항 유형(없으면 ''). */
function outRecordedType_(ruleName) {
  var m = /\(([^()]*)\)\s*$/.exec(attStr_(ruleName));
  return m ? m[1].trim() : '';
}

/** dutyByDate 값 → 'a@x,b@x' */
function outDutyText_(dutyByDate, date) {
  var d = (dutyByDate || {})[date];
  return Array.isArray(d) ? d.map(attStr_).filter(Boolean).join(',') : attStr_(d);
}

/**
 * 확정된 미인정 특이사항 ↔ 자동 1OUT 맞추기(결정 10·22). 아무것도 쓰지 않고 할 일만 돌려준다.
 * exceptions·violations는 **그 기간의 모든 행**을 넘긴다(한 학생 것만 넘기면 다른 학생의 자동 OUT이
 *   '연결된 특이사항이 없습니다'로 취소된다). 한 학생만 맞추려면 그래도 기간 전체 행을 넘기고 opts.studentIds로 좁힌다.
 * opts = {autoTypes:['미인정지각','미인정조퇴','미인정결석'](비면 이 기본값), ruleName:'무단 지각·결석·이탈', ruleId:'',
 *         per:'group'|'row', dutyByDate:{'yyyy-MM-dd': 이메일 또는 [이메일]}, studentIds:[…](선택)}
 * → {toCreate:[violations 행 초안(id·공통 열 없음)], toCancel:[{violationId, reason}], toUpdate:[{violationId, patch}]}
 *
 * - 단위: per 'group'(기본, 결정 22 "입력 1건 = 1OUT")이면 (학생, group_id) 묶음, group_id가 비면 행 하나. per 'row'면 행마다.
 * - 새로 만들기: 단위 안에 status '확정'이고 날짜가 맞고 유형이 autoTypes(괄호 설명을 떼고 비교)인 행이 있으면.
 *   대표 행 = 그런 행 중 날짜가 가장 이른 것(같으면 id 순). source_exception_id = 대표 행 id,
 *   occurred_at = 대표 날짜 + 첫 블록 시작('ALL'·잘못된 표기는 00:00), entered_by = 확정자(없으면 요청자),
 *   detected_by = dutyByDate[날짜](없으면 빈칸), rule_name = ruleName + '(만들 때 유형)'.
 * - 이미 있는 자동 OUT은 source_exception_id가 속한 단위에 연결된다(대표가 아닌 행 id여도). 단위 안에
 *   확정·날짜 맞음이고 유형이 autoTypes이거나 **이 OUT을 만들 때의 유형(rule_name 괄호)과 같은** 행이 있으면 유지한다.
 *   그래서 설정 autoTypes만 바뀌면 이미 있는 OUT은 그대로다(설정 변경은 앞으로 만들 것에만).
 * - 취소(사유 '[자동] …'): 특이사항이 모두 취소됨, 확정 행이 없어짐(요청으로 돌아감), 특이사항 유형이 자동 대상 밖으로 바뀜,
 *   연결된 특이사항 행이 없음, 특이사항의 학생·기간이 바뀜(바른 학생에게 새로 만든다), 같은 단위의 두 번째 살아 있는 OUT.
 * - toUpdate(사람이 고친 값은 덮지 않는다):
 *   · 대표 행이 바뀌었거나(source_exception_id가 다름) 대표 날짜가 바뀌었으면 source_exception_id·occurred_at.
 *     같은 대표·같은 날짜에서 블록만 바뀐 것은 사람이 고친 시각과 구별할 수 없어 고치지 않는다.
 *   · detected_by: 빈칸인데 그날 근무교사를 알게 되면 채운다. 날짜가 바뀌었고 지금 값이 옛 날짜의 근무교사(생성값)와 같으면
 *     새 날짜 근무교사로(모르면 빈칸). 그 밖의 값은 사람이 고친 것으로 보고 그대로 둔다.
 *   · rule_name: 지금 값이 생성값이고 특이사항 유형이 다른 자동 유형으로 바뀌었으면 새 유형으로.
 *   · memo는 사람 칸이라 고치지 않는다.
 * - 교사가 직접 입력한 OUT(source가 'F1자동'이 아님)은 건드리지 않는다. opts.studentIds가 있으면 그 학생의 OUT만 판정한다.
 * ASSUMPTION: 관리자가 직접 취소한 자동 OUT(cancel_reason이 '[자동] '으로 시작하지 않음)이 가리키던 특이사항 행, 또는 그 행과
 *   같은 묶음의 행이 들어 있는 단위는, 그 OUT과 학생·기간이 같으면 다시 만들지 않는다(per를 바꿔도 같음). 학생이 바뀌면 만든다.
 * ASSUMPTION: 같은 학생·같은 날·겹치는 블록에 자동 유형 특이사항 두 건(다른 묶음)이 확정되면 OUT도 두 건이다(결정 22 "입력 1건
 *   = 1OUT"을 그대로 적용 → 2OUT·퇴실 대상이 될 수 있다). 이런 중복 입력은 C5 입력 화면이 겹침 경고로 막는다.
 */
function reconcileAutoOuts_(exceptions, violations, opts) {
  opts = opts || {};
  var autoTypes = (opts.autoTypes || []).map(attTypeBase_).filter(function (t) { return t !== ''; });
  if (!autoTypes.length) autoTypes = ['미인정지각', '미인정조퇴', '미인정결석'];
  var per = opts.per === 'row' ? 'row' : 'group';
  var prefix = outAutoCancelPrefix_();
  var only = null;
  if (Array.isArray(opts.studentIds)) {
    only = {};
    opts.studentIds.forEach(function (s) { only[attStr_(s)] = true; });
  }
  var inScope = function (sid) { return !only || only[attStr_(sid)]; };
  var byDate = function (a, b) {
    var da = attStr_(a.date), db = attStr_(b.date);
    return da < db ? -1 : da > db ? 1 : (attStr_(a.id) < attStr_(b.id) ? -1 : 1);
  };

  // 1) 단위 만들기
  var units = {}, unitOfException = {}, exById = {};
  (exceptions || []).forEach(function (e) {
    if (!e || !attStr_(e.id)) return;
    var id = attStr_(e.id), gid = attStr_(e.group_id);
    var key = per === 'group' && gid ? 'g:' + attStr_(e.student_id) + '|' + gid : 'r:' + id;
    var u = units[key] = units[key] || { key: key, rows: [], confirmed: [] };
    u.rows.push(e);
    unitOfException[id] = key;
    exById[id] = e;
    // 날짜가 달력에 없는 행은 대상이 아니다(출석부에도 찍히지 않는 행, AttendanceRules와 같게)
    if (attStr_(e.status) === '확정' && ymdIsValid_(attStr_(e.date))) u.confirmed.push(e);
  });
  Object.keys(units).forEach(function (k) {
    var u = units[k];
    u.confirmed.sort(byDate);
    u.targets = u.confirmed.filter(function (e) { return autoTypes.indexOf(attTypeBase_(e.type)) >= 0; });
  });

  // 관리자가 직접 취소한 자동 OUT: 가리키던 특이사항 행·묶음 + 그 OUT의 학생·기간
  var manual = [];
  (violations || []).forEach(function (v) {
    if (!v || !outIsAuto_(v) || outIsLive_(v) || attStr_(v.cancel_reason).indexOf(prefix) === 0) return;
    var ex = exById[attStr_(v.source_exception_id)];
    manual.push({ exId: attStr_(v.source_exception_id), group: ex && attStr_(ex.group_id) ? attStr_(ex.student_id) + '|' + attStr_(ex.group_id) : '',
      student: attStr_(v.student_id), term: attStr_(v.term_id) });
  });
  var isManualCancelled = function (u, rep) {
    return manual.some(function (m) {
      if (m.student !== attStr_(rep.student_id) || m.term !== attStr_(rep.term_id)) return false;
      return u.rows.some(function (e) {
        return attStr_(e.id) === m.exId || (m.group && attStr_(e.group_id) && attStr_(e.student_id) + '|' + attStr_(e.group_id) === m.group);
      });
    });
  };

  // 2) 이미 있는 자동 OUT을 단위에 연결
  var live = {}, toCancel = [], toUpdate = [];
  (violations || []).forEach(function (v) {
    if (!v || !outIsAuto_(v) || !outIsLive_(v) || !inScope(v.student_id)) return;
    var vid = attStr_(v.id);
    var key = unitOfException[attStr_(v.source_exception_id)];
    if (!key) { toCancel.push({ violationId: vid, reason: prefix + '연결된 특이사항이 없습니다' }); return; }
    var u = units[key];
    var recorded = outRecordedType_(v.rule_name);
    var keepers = u.confirmed.filter(function (e) {
      var t = attTypeBase_(e.type);
      return autoTypes.indexOf(t) >= 0 || (recorded && t === recorded);
    });
    if (!keepers.length) {
      toCancel.push({ violationId: vid, reason: prefix + outWhyNotTarget_(u) });
      return;
    }
    var rep = keepers[0];
    if (attStr_(v.student_id) !== attStr_(rep.student_id) || attStr_(v.term_id) !== attStr_(rep.term_id)) {
      toCancel.push({ violationId: vid, reason: prefix + '특이사항의 학생 또는 기간이 바뀌었습니다' });
      return;
    }
    if (live[key]) { toCancel.push({ violationId: vid, reason: prefix + '같은 특이사항의 자동 OUT이 이미 있습니다(중복)' }); return; }
    live[key] = vid;
    var patch = outUpdatePatch_(v, rep, opts);
    if (Object.keys(patch).length) toUpdate.push({ violationId: vid, patch: patch });
  });

  // 3) 대상인데 살아 있는 OUT이 없는 단위 → 만들기
  var toCreate = [];
  Object.keys(units).sort().forEach(function (k) {
    var u = units[k];
    if (!u.targets.length || live[k]) return;
    var rep = u.targets[0];
    if (!inScope(rep.student_id) || isManualCancelled(u, rep)) return;
    toCreate.push(outDraft_(u, rep, opts));
  });
  return { toCreate: toCreate, toCancel: toCancel, toUpdate: toUpdate };
}

/** 대표 행으로 만든 OUT 초안. */
function outDraft_(u, rep, opts) {
  var date = attStr_(rep.date);
  var n = u.targets.length;
  return {
    term_id: attStr_(rep.term_id),
    student_id: attStr_(rep.student_id),
    occurred_at: date + 'T' + outFirstStart_(rep.blocks) + ':00',
    rule_id: attStr_(opts.ruleId),
    rule_name: outRuleName_(opts.ruleName, rep.type),
    memo: '사전 특이사항 자동: ' + attTypeBase_(rep.type) + (n > 1 ? ' 외 ' + (n - 1) + '일' : ''),
    detected_by: outDutyText_(opts.dutyByDate, date),
    entered_by: attStr_(rep.confirmed_by) || attStr_(rep.requested_by),
    status: '유효',
    source: 'F1자동',
    source_exception_id: attStr_(rep.id),
    cancel_reason: ''
  };
}

/** 살아 있는 자동 OUT을 대표 행에 맞추는 고침(사람이 고친 값은 그대로). */
function outUpdatePatch_(v, rep, opts) {
  var patch = {};
  var repDate = attStr_(rep.date);
  var oldDate = attStr_(v.occurred_at).slice(0, 10);
  var repChanged = attStr_(v.source_exception_id) !== attStr_(rep.id);
  var dateChanged = oldDate !== repDate;
  if (repChanged) patch.source_exception_id = attStr_(rep.id);
  if (repChanged || dateChanged) {
    var at = repDate + 'T' + outFirstStart_(rep.blocks) + ':00';
    if (attStr_(v.occurred_at) !== at) patch.occurred_at = at;
  }
  var cur = attStr_(v.detected_by);
  var dutyNew = outDutyText_(opts.dutyByDate, repDate);
  if (!cur && dutyNew) patch.detected_by = dutyNew;
  else if (dateChanged && cur && cur === outDutyText_(opts.dutyByDate, oldDate) && cur !== dutyNew) patch.detected_by = dutyNew;
  var recorded = outRecordedType_(v.rule_name);
  var nowType = attTypeBase_(rep.type);
  if (recorded && recorded !== nowType && attStr_(v.rule_name) === outRuleName_(opts.ruleName, recorded)) {
    patch.rule_name = outRuleName_(opts.ruleName, nowType);
  }
  return patch;
}

/** 단위가 왜 OUT 대상이 아닌지(취소 사유 문구). */
function outWhyNotTarget_(u) {
  if (u.rows.every(function (e) { return attStr_(e.status) === '취소'; })) return '특이사항이 취소되었습니다';
  if (!u.confirmed.length) return '확정된 미인정 특이사항이 없습니다';
  return '특이사항 유형이 바뀌었습니다';
}

/** 블록 표기의 첫 시작 시각(parseBlockSpec_ 기준). 'ALL'·잘못된 표기는 '00:00'. */
function outFirstStart_(blocks) {
  var p = parseBlockSpec_(attStr_(blocks));
  return !p.all && p.ranges.length ? p.ranges[0].start : '00:00';
}

/**
 * 그 학생의 이번 기간 OUT 단계(학기마다 초기화 = termId가 같은 것만 센다).
 * status 빈칸·'유효'인 OUT만 센다(직접·자동 모두). → {count, level:0|1|2, label:''|'1OUT'|'퇴실 대상'}
 * 2개 이상이면 '퇴실 대상'(결정 4: 학부모 면담 기록 후 관리자가 퇴실 확정, 유예 없음).
 */
function outLevel_(violations, studentId, termId) {
  var sid = attStr_(studentId), tid = attStr_(termId);
  var count = (violations || []).filter(function (v) {
    return v && outIsLive_(v) && attStr_(v.student_id) === sid && attStr_(v.term_id) === tid;
  }).length;
  var level = count >= 2 ? 2 : count;
  return { count: count, level: level, label: ['', '1OUT', '퇴실 대상'][level] };
}
