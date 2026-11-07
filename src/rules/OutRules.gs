/**
 * OUT 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F1·F4, 결정 4·10·22, vocabulary.md violations).
 *
 * 순수 함수만 둔다. DateRules.gs(ymdIsValid_·isoLocalSplit_·ruleStr_·ruleIso_·ruleRowLive_)·AttendanceRules.gs(attTypeBase_·parseBlockSpec_)·
 * StatusRules.gs(statusOn_ — outDismissalGate_)의 함수를 부른다.
 * 시트 행(문자열)은 그대로 받는다.
 *   exceptions_<기간>:  id, term_id, group_id, student_id, date, blocks, type, status(요청·확정·취소),
 *                      requested_by, confirmed_by, confirmed_at …
 *   violations_<기간>:  id, term_id, student_id, occurred_at, rule_id, rule_name, memo, detected_by, entered_by,
 *                      status(유효·취소), source(직접·F1자동), source_exception_id, cancel_reason …, created_at(필수 — 결정 40 판정)
 * tests/rules/out_oracle.test.js가 이 규칙을 단순한 모델과 무작위 시험으로 비교한다.
 */

/** 자동 OUT 기록인지(source 'F1자동'). */
function outIsAuto_(v) {
  return ruleStr_(v && v.source) === 'F1자동';
}

/** 자동 취소 사유의 머리말(vocabulary.md). 관리자가 직접 취소한 자동 OUT과 구별한다. */
function outAutoCancelPrefix_() {
  return '[자동] ';
}

/** 자동 OUT의 rule_name: '무단 지각·결석·이탈(미인정결석)' — 만들 때의 특이사항 유형을 괄호에 남긴다. */
function outRuleName_(ruleName, type) {
  return (ruleStr_(ruleName) || '무단 지각·결석·이탈') + '(' + attTypeBase_(type) + ')';
}

/**
 * rule_name에 남긴 만들 때 특이사항 유형. vocabulary.md 형식 그대로일 때만 읽는다:
 * 정확히 ruleName + '(' + 유형 + ')' — ruleName 바로 뒤의 '('와 짝이 맞는 ')'가 마지막 글자여야 한다
 * (유형 안의 짝 맞는 괄호는 허용). 유형이 비었거나('( )') 통째로 괄호에 싸였거나('((x))') 형식이 다르면 null('알 수 없음').
 */
function outRecordedType_(ruleNameValue, ruleName) {
  var head = ruleStr_(ruleName) || '무단 지각·결석·이탈';
  var s = ruleStr_(ruleNameValue);
  if (s.indexOf(head + '(') !== 0) return null;
  var rest = s.slice(head.length);              // '(' … ')'
  var close = outMatchingClose_(rest, 0);
  if (close !== rest.length - 1) return null;
  var inner = rest.slice(1, -1).trim();
  if (!inner || (inner.charAt(0) === '(' && outMatchingClose_(inner, 0) === inner.length - 1)) return null;
  return attTypeBase_(inner) || null;
}

/** s[open]의 '('와 짝인 ')' 위치(없으면 -1). */
function outMatchingClose_(s, open) {
  var depth = 0;
  for (var i = open; i < s.length; i++) {
    if (s.charAt(i) === '(') depth++;
    else if (s.charAt(i) === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** dutyByDate 값 → 'a@x,b@x' */
function outDutyText_(dutyByDate, date) {
  var d = (dutyByDate || {})[date];
  return Array.isArray(d) ? d.map(ruleStr_).filter(Boolean).join(',') : ruleStr_(d);
}

/**
 * 확정된 미인정 특이사항 ↔ 자동 1OUT 맞추기(결정 10·22). 아무것도 쓰지 않고 할 일만 돌려준다.
 * exceptions·violations는 **그 기간의 모든 행**을 넘긴다(한 학생 것만 넘기면 다른 학생의 자동 OUT이
 *   '연결된 특이사항이 없습니다'로 취소된다). 한 학생만 맞추려면 그래도 기간 전체 행을 넘기고 opts.studentIds로 좁힌다.
 * opts = {autoTypes:['미인정지각','미인정조퇴','미인정결석'](비면 이 기본값), ruleName:'무단 지각·결석·이탈', ruleId:'',
 *         per:'group'|'row', dutyByDate:{'yyyy-MM-dd': 이메일 또는 [이메일]}, studentIds:[…](선택),
 *         autoTypeSince:{유형: 그 유형을 가장 최근에 넓힌 시각 'yyyy-MM-ddTHH:mm:ss'}(선택)}
 * → {toCreate:[violations 행 초안(id·공통 열 없음)], toCancel:[{violationId, reason}], toUpdate:[{violationId, patch}]}
 *
 * 용어(행 = 특이사항 행)
 * - 자격 행: status '확정', 날짜가 달력에 있음, 유형이 autoTypes(괄호 설명을 떼고 비교)이고, 그 유형이 autoTypeSince에
 *   있으면 confirmed_at >= 그 시각. **설정 변경은 앞으로만(총괄 결정):** 설정을 넓혀 새로 자동 대상이 된 유형은 넓힌 시각
 *   (설정 행 updated_at)을 autoTypeSince에 넣는다 — 그 전에 확정된 특이사항에는 소급해 OUT을 만들지 않는다. 처음부터 자동
 *   대상이던 유형은 넣지 않는다(그래서 취소됐다가 다시 확정된 특이사항의 OUT은 다시 생긴다). 2단계 F4 처음 연결 때
 *   쌓인 특이사항을 한꺼번에 만들 때는 넘기지 않는다.
 * - 단위: per 'group'(기본, 결정 22 "입력 1건 = 1OUT")이면 (학생, group_id) 묶음, group_id가 비면 행 하나. per 'row'면 행마다.
 *
 * 규칙
 * - 새로 만들기: 살아 있는 자동 OUT이 없는 단위에 자격 행이 있으면. 대표 = 자격 행 중 날짜가 가장 이른 것(같으면 id 순).
 *   source_exception_id = 대표, occurred_at = 대표 날짜 + 첫 블록 시작('ALL'·잘못된 표기는 00:00), entered_by = 확정자
 *   (없으면 요청자), detected_by = dutyByDate[날짜](없으면 빈칸), rule_name = ruleName + '(만들 때 유형)',
 *   memo = '사전 특이사항 자동: 유형'(자격 행이 여러 날이면 ' 외 N일').
 * - 유지 행(이미 있는 OUT 하나에 대해): 자격 행, 또는 확정·날짜 맞음이고 유형이 그 OUT의 rule_name 괄호 유형(만들 때 유형)과
 *   같은 행(그 유형의 autoTypeSince가 OUT의 created_at 이전이면 그 시각 이후 확정만 — OUT이 생긴 뒤 다시 넓힌 since로는
 *   거르지 않는다). → 설정을 좁혔다가 다시 넓혀도 이미 있는 OUT은 유지된다(결정 40). created_at이 비면 거르지 않는다.
 *   rule_name을 읽지 못하면(알 수 없음) 유지 행 = 자격 행만이고, 자격 행이 없어도 확정·날짜 맞는 행이 남아 있으면
 *   **그대로 둔다**(유형으로는 취소하지 않고 대표도 옮기지 않는다 — 거짓 사유 취소·비자동 행으로 대표 이동 방지).
 * - 대표 유지: 지금 source_exception_id 행이 유지 행이면 대표를 옮기지 않는다(두 번째 실행 0건). 아니면 유지 행 중 가장 이른 것.
 * - 취소(사유 '[자동] …'): 특이사항이 모두 취소됨, 확정 행이 없어짐(요청으로 돌아감), 특이사항 유형이 자동 대상 밖으로 바뀜,
 *   연결된 특이사항 행이 없음, 특이사항의 학생·기간이 바뀜(바른 쪽에 새로 만든다 — 이때는 autoTypeSince와 상관없이,
 *   그렇게 다시 만든 OUT은 유지 판정에서도 since로 거르지 않는다),
 *   같은 단위의 두 번째 살아 있는 OUT.
 * - toUpdate(사람이 고친 값은 덮지 않는다): 대표가 바뀌거나 대표 날짜와 OUT 날짜가 다르면 source_exception_id·occurred_at
 *   (**특이사항 날짜가 원본** — 사람이 OUT 날짜를 고치면 날짜·시각 모두 생성값으로 되돌리고, 날짜가 같으면 사람이 고친 시각은 둔다).
 *   detected_by: 빈칸인데 그날 근무교사를 알게 되면 채움, 날짜가 바뀌었고 지금 값이 옛 날짜 근무교사(생성값)면 새 날짜 교사(모르면 빈칸).
 *   rule_name: 생성값이고 대표 유형이 다른 자동 유형으로 바뀌었으면 새 유형. memo는 사람 칸이라 고치지 않는다.
 * - 교사가 직접 입력한 OUT(source가 'F1자동'이 아님)은 건드리지 않는다. opts.studentIds가 있으면 그 학생의 OUT만 판정한다.
 * - 전제: 특이사항 행의 student_id·term_id·date는 저장 뒤 바뀌지 않는다(vocabulary.md). 바뀌어도 견디지만, term_id가 바뀌면
 *   두 기간의 실행이 서로 취소·생성을 되풀이할 수 있다. dutyByDate에는 특이사항 날짜와 OUT들의 지금 occurred_at 날짜를 모두 넣는다.
 * ASSUMPTION: 관리자가 직접 취소한 자동 OUT(cancel_reason이 '[자동] '으로 시작하지 않음)이 가리키던 특이사항 행, 또는 같은 묶음
 *   (취소된 OUT의 학생 + group_id)의 행이 들어 있는 단위는, 그 OUT과 학생·기간이 같으면 다시 만들지 않는다(per를 바꿔도 같음).
 * ASSUMPTION(결정 22 적용): 같은 학생·같은 날·겹치는 블록에 다른 묶음의 자동 유형 특이사항 두 건이 확정되면 OUT도 두 건
 *   (→ 퇴실 대상이 될 수 있다). C5는 저장·확정 때 겹침 경고 후 확인을 받는다(막지는 않음).
 */
function reconcileAutoOuts_(exceptions, violations, opts) {
  opts = opts || {};
  var autoTypes = (opts.autoTypes || []).map(attTypeBase_).filter(function (t) { return t !== ''; });
  if (!autoTypes.length) autoTypes = ['미인정지각', '미인정조퇴', '미인정결석'];
  var sinceMap = {};
  Object.keys(opts.autoTypeSince || {}).forEach(function (t) { sinceMap[attTypeBase_(t)] = ruleIso_(opts.autoTypeSince[t]); });
  var per = opts.per === 'row' ? 'row' : 'group';
  var prefix = outAutoCancelPrefix_();
  var only = null;
  if (Array.isArray(opts.studentIds)) {
    only = {};
    opts.studentIds.forEach(function (s) { only[ruleStr_(s)] = true; });
  }
  var inScope = function (sid) { return !only || only[ruleStr_(sid)]; };
  var sinceOk = function (e, type) {
    return !Object.prototype.hasOwnProperty.call(sinceMap, type) || ruleIso_(e.confirmed_at) >= sinceMap[type];
  };
  var eligible = function (e) {
    var t = attTypeBase_(e.type);
    return autoTypes.indexOf(t) >= 0 && sinceOk(e, t);
  };
  var byDate = function (a, b) {
    var da = ruleStr_(a.date), db = ruleStr_(b.date);
    return da < db ? -1 : da > db ? 1 : (ruleStr_(a.id) < ruleStr_(b.id) ? -1 : 1);
  };

  // 1) 단위 만들기
  var units = {}, unitOfException = {}, exById = {};
  (exceptions || []).forEach(function (e) {
    if (!e || !ruleStr_(e.id)) return;
    var id = ruleStr_(e.id), gid = ruleStr_(e.group_id);
    var key = per === 'group' && gid ? 'g:' + ruleStr_(e.student_id) + '|' + gid : 'r:' + id;
    var u = units[key] = units[key] || { key: key, rows: [], confirmed: [] };
    u.rows.push(e);
    unitOfException[id] = key;
    exById[id] = e;
    if (ruleStr_(e.status) === '확정' && ymdIsValid_(ruleStr_(e.date))) u.confirmed.push(e);
  });
  Object.keys(units).forEach(function (k) {
    var u = units[k];
    u.confirmed.sort(byDate);
    u.creatable = u.confirmed.filter(eligible);
  });

  // 관리자가 직접 취소한 자동 OUT: 가리키던 특이사항 행·묶음(취소된 OUT의 학생 기준) + 그 OUT의 학생·기간
  // 학생·기간을 바로잡아 다시 만든 OUT의 단위: since로 거르지 않는다(다시 만들 때도 since와 상관없이 만들었으므로)
  var moved = {};
  var movedReason = prefix + '특이사항의 학생 또는 기간이 바뀌었습니다';
  var manual = [];
  (violations || []).forEach(function (v) {
    if (v && outIsAuto_(v) && ruleStr_(v.cancel_reason) === movedReason) moved[unitOfException[ruleStr_(v.source_exception_id)]] = true;
    if (!v || !outIsAuto_(v) || ruleRowLive_(v) || ruleStr_(v.cancel_reason).indexOf(prefix) === 0) return;
    var ex = exById[ruleStr_(v.source_exception_id)];
    manual.push({ exId: ruleStr_(v.source_exception_id), group: ex && ruleStr_(ex.group_id) ? ruleStr_(v.student_id) + '|' + ruleStr_(ex.group_id) : '',
      student: ruleStr_(v.student_id), term: ruleStr_(v.term_id) });
  });
  var isManualCancelled = function (u, rep) {
    return manual.some(function (m) {
      if (m.student !== ruleStr_(rep.student_id) || m.term !== ruleStr_(rep.term_id)) return false;
      return u.rows.some(function (e) {
        return ruleStr_(e.id) === m.exId || (m.group && ruleStr_(e.group_id) && ruleStr_(e.student_id) + '|' + ruleStr_(e.group_id) === m.group);
      });
    });
  };

  // 2) 이미 있는 자동 OUT을 단위에 연결
  var live = {}, force = {}, toCancel = [], toUpdate = [];
  (violations || []).forEach(function (v) {
    if (!v || !outIsAuto_(v) || !ruleRowLive_(v) || !inScope(v.student_id)) return;
    var vid = ruleStr_(v.id);
    var key = unitOfException[ruleStr_(v.source_exception_id)];
    if (!key) { toCancel.push({ violationId: vid, reason: prefix + '연결된 특이사항이 없습니다' }); return; }
    var u = units[key];
    var recorded = outRecordedType_(v.rule_name, opts.ruleName);
    var keepers = u.confirmed.filter(function (e) {
      // since가 이 OUT보다 늦으면 OUT이 있은 뒤의 설정 변경이다 → 그 since로 거르지 않는다(결정 40)
      // shortcut: 다시 넓히면 처음 넓히기 전에 확정된 같은 유형 행도 유지 행이 되어 대표가 그쪽으로 옮겨질 수 있다(덜 죽일 뿐 거짓 취소는 없음), 설정이 넓힌 이력을 남기면 고친다
      return eligible(e) || (recorded !== null && attTypeBase_(e.type) === recorded &&
        (sinceOk(e, recorded) || ruleIso_(v.created_at) < sinceMap[recorded] || moved[key]));
    });
    if (!keepers.length) {
      if (recorded === null && u.confirmed.length) {   // 알 수 없음: 유형으로는 취소하지 않고 그대로 둔다
        if (!live[key]) { live[key] = vid; return; }
      } else {
        toCancel.push({ violationId: vid, reason: prefix + outWhyNotTarget_(u) });
        return;
      }
    }
    var cur = exById[ruleStr_(v.source_exception_id)];
    var rep = keepers.length ? (keepers.indexOf(cur) >= 0 ? cur : keepers[0]) : cur;
    if (ruleStr_(v.student_id) !== ruleStr_(rep.student_id) || ruleStr_(v.term_id) !== ruleStr_(rep.term_id)) {
      toCancel.push({ violationId: vid, reason: movedReason });
      if (keepers.length && !force[key]) force[key] = { rep: rep, n: keepers.length };
      return;
    }
    if (live[key]) { toCancel.push({ violationId: vid, reason: prefix + '같은 특이사항의 자동 OUT이 이미 있습니다(중복)' }); return; }
    live[key] = vid;
    var patch = outUpdatePatch_(v, rep, opts);
    if (Object.keys(patch).length) toUpdate.push({ violationId: vid, patch: patch });
  });

  // 3) 살아 있는 OUT이 없는 단위 → 만들기(자격 행이 있거나, 학생·기간이 바뀌어 바른 쪽에 다시 만드는 경우)
  var toCreate = [];
  Object.keys(units).sort().forEach(function (k) {
    var u = units[k];
    if (live[k]) return;
    var rep, n;
    if (u.creatable.length) { rep = u.creatable[0]; n = u.creatable.length; }
    else if (force[k]) { rep = force[k].rep; n = force[k].n; }
    else return;
    if (!inScope(rep.student_id) || isManualCancelled(u, rep)) return;
    toCreate.push(outDraft_(rep, n, opts));
  });
  return { toCreate: toCreate, toCancel: toCancel, toUpdate: toUpdate };
}

/** 대표 행으로 만든 OUT 초안(n = 함께 세는 날 수). */
function outDraft_(rep, n, opts) {
  var date = ruleStr_(rep.date);
  return {
    term_id: ruleStr_(rep.term_id),
    student_id: ruleStr_(rep.student_id),
    occurred_at: date + 'T' + outFirstStart_(rep.blocks) + ':00',
    rule_id: ruleStr_(opts.ruleId),
    rule_name: outRuleName_(opts.ruleName, rep.type),
    memo: '사전 특이사항 자동: ' + attTypeBase_(rep.type) + (n > 1 ? ' 외 ' + (n - 1) + '일' : ''),
    detected_by: outDutyText_(opts.dutyByDate, date),
    entered_by: ruleStr_(rep.confirmed_by) || ruleStr_(rep.requested_by),
    status: '유효',
    source: 'F1자동',
    source_exception_id: ruleStr_(rep.id),
    cancel_reason: ''
  };
}

/** 살아 있는 자동 OUT을 대표 행에 맞추는 고침(사람이 고친 값은 그대로). */
function outUpdatePatch_(v, rep, opts) {
  var patch = {};
  var repDate = ruleStr_(rep.date);
  var oldDate = ruleStr_(v.occurred_at).slice(0, 10);
  var repChanged = ruleStr_(v.source_exception_id) !== ruleStr_(rep.id);
  var dateChanged = oldDate !== repDate;
  if (repChanged) patch.source_exception_id = ruleStr_(rep.id);
  if (repChanged || dateChanged) {
    var at = repDate + 'T' + outFirstStart_(rep.blocks) + ':00';
    if (ruleStr_(v.occurred_at) !== at) patch.occurred_at = at;
  }
  var cur = ruleStr_(v.detected_by);
  var dutyNew = outDutyText_(opts.dutyByDate, repDate);
  if (!cur && dutyNew) patch.detected_by = dutyNew;
  else if (dateChanged && cur && cur === outDutyText_(opts.dutyByDate, oldDate) && cur !== dutyNew) patch.detected_by = dutyNew;
  var recorded = outRecordedType_(v.rule_name, opts.ruleName);
  var nowType = attTypeBase_(rep.type);
  if (recorded !== null && recorded !== nowType && ruleStr_(v.rule_name) === outRuleName_(opts.ruleName, recorded)) {
    patch.rule_name = outRuleName_(opts.ruleName, nowType);
  }
  return patch;
}

/** 단위가 왜 OUT 대상이 아닌지(취소 사유 문구). */
function outWhyNotTarget_(u) {
  if (u.rows.every(function (e) { return ruleStr_(e.status) === '취소'; })) return '특이사항이 취소되었습니다';
  if (!u.confirmed.length) return '확정된 미인정 특이사항이 없습니다';
  return '특이사항 유형이 바뀌었습니다';
}

/** 블록 표기의 첫 시작 시각(parseBlockSpec_ 기준). 'ALL'·잘못된 표기는 '00:00'. */
function outFirstStart_(blocks) {
  var p = parseBlockSpec_(ruleStr_(blocks));
  return !p.all && p.ranges.length ? p.ranges[0].start : '00:00';
}

/**
 * 그 학생의 이번 기간 OUT 단계(학기마다 초기화 = termId가 같은 것만 센다).
 * status 빈칸·'유효'인 OUT만 센다(직접·자동 모두). → {count, level:0|1|2, label:''|'1OUT'|'퇴실 대상'}
 * 2개 이상이면 '퇴실 대상'(결정 4: 학부모 면담 기록 후 관리자가 퇴실 확정, 유예 없음).
 */
function outLevel_(violations, studentId, termId) {
  var sid = ruleStr_(studentId), tid = ruleStr_(termId);
  var count = (violations || []).filter(function (v) {
    return v && ruleRowLive_(v) && ruleStr_(v.student_id) === sid && ruleStr_(v.term_id) === tid;
  }).length;
  var level = count >= 2 ? 2 : count;
  return { count: count, level: level, label: ['', '1OUT', '퇴실 대상'][level] };
}

/**
 * 자동 1OUT 유형 설정의 since 다음 값(결정 40: 설정을 넓힌 시각부터만 자동 OUT, followups R5-2).
 * 설정 행의 updated_at이 아니라 이 스냅숏으로 유형별 마지막 넓힘 시각을 들고 다닌다(다른 칸을 고쳐도 updated_at이 바뀌므로).
 * snapshot = {types:[], since:{유형:iso}} | null, currentTypes = 지금 설정 유형, nowIso = 지금, defaultTypes = 설정 기본값.
 * → {snapshot:{types, since}, since, changed}
 * - null(처음·분실)이면 기준 유형 = defaultTypes: 기본 그대로면 since {}(처음 연결 때 쌓인 특이사항 일괄 생성),
 *   기본에 없는 유형은 since = nowIso(스냅숏을 잃어도 넓혔던 유형은 소급하지 않는다).
 * - 새로 나타난 유형 → since = nowIso(다시 넓혀도 덮어쓴다). 빠진 유형의 since는 남긴다. 괄호 설명은 떼고 비교.
 * 잘못된 nowIso는 Error.
 */
function outAutoSinceNext_(snapshot, currentTypes, nowIso, defaultTypes) {
  var now = ruleIso_(nowIso);
  isoLocalSplit_(now);
  var norm = function (list) {
    var out = [];
    (list || []).forEach(function (t) { t = attTypeBase_(t); if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  };
  var base = norm(snapshot ? snapshot.types : defaultTypes), cur = norm(currentTypes);
  var since = Object.assign({}, snapshot && snapshot.since);
  cur.forEach(function (t) { if (base.indexOf(t) < 0) since[t] = now; });
  var changed = !snapshot || base.length !== cur.length || cur.some(function (t) { return base.indexOf(t) < 0; });
  return { snapshot: { types: cur, since: since }, since: since, changed: changed };
}

/**
 * 2OUT 퇴실 확정 관문(결정 4, PRD F12·F6). 면담 기록 전에는 막는다.
 * notes = counsel_notes 행 중 id·student_id·type·linked_violation_id·status·date·teacher_email만(내용은 넘기지 않는다).
 * → {count, level, triggerOutId, meetingNote:{id, date, teacher_email}|null, alreadyLeft, ok, reason:''|'퇴실 대상 아님'|'면담 기록 필요'|'이미 퇴실'}
 * - 이번 기간 살아 있는 OUT(outLevel_과 같음)을 occurred_at → created_at → id 순으로 놓았을 때 둘째가 triggerOutId.
 * - 면담 = status 빈칸·유효, 같은 학생, type '2OUT 학부모 면담', 이번 기간 살아 있는 OUT에 연결, 날짜 ≥ triggerOut 발생일.
 * - alreadyLeft = ymd에 학사 퇴실 상태. 순서: 이미 퇴실 → 퇴실 대상 아님(2건 미만) → 면담 기록 필요 → ok.
 * ASSUMPTION(Q9): 연결한 OUT이 관리자 취소로 죽으면 그 면담은 세지 않는다(다른 2건이 남아도 다시 면담).
 */
function outDismissalGate_(violations, notes, changes, studentId, termId, ymd) {
  var sid = ruleStr_(studentId), tid = ruleStr_(termId);
  var lv = outLevel_(violations, sid, tid);
  var live = (violations || []).filter(function (v) {
    return v && ruleRowLive_(v) && ruleStr_(v.student_id) === sid && ruleStr_(v.term_id) === tid;
  }).sort(function (a, b) {
    var ka = [ruleIso_(a.occurred_at), ruleIso_(a.created_at), ruleStr_(a.id)], kb = [ruleIso_(b.occurred_at), ruleIso_(b.created_at), ruleStr_(b.id)];
    for (var i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
  var trigger = live[1] || null;
  var liveIds = live.map(function (v) { return ruleStr_(v.id); });
  var n = trigger && (notes || []).filter(function (x) {
    return x && ruleRowLive_(x) && ruleStr_(x.student_id) === sid && ruleStr_(x.type) === '2OUT 학부모 면담' &&
      liveIds.indexOf(ruleStr_(x.linked_violation_id)) >= 0 && ruleStr_(x.date) >= ruleIso_(trigger.occurred_at).slice(0, 10);
  })[0];
  var out = { count: lv.count, level: lv.level, triggerOutId: trigger ? ruleStr_(trigger.id) : '',
    meetingNote: n ? { id: ruleStr_(n.id), date: ruleStr_(n.date), teacher_email: ruleStr_(n.teacher_email) } : null,
    alreadyLeft: statusOn_(changes, sid, '학사', ymd) === '퇴실', ok: false, reason: '' };
  out.reason = out.alreadyLeft ? '이미 퇴실' : lv.count < 2 ? '퇴실 대상 아님' : !n ? '면담 기록 필요' : '';
  out.ok = !out.reason;
  return out;
}
