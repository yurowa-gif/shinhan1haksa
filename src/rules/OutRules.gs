/**
 * OUT 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F1·F4, 결정 4·10·22, vocabulary.md violations).
 *
 * 순수 함수만 둔다. DateRules.gs(ymdIsValid_)·AttendanceRules.gs(attStr_·attTypeBase_·parseBlockSpec_)의 함수를 부른다.
 * 시트 행(문자열)은 그대로 받는다.
 *   exceptions_<기간>:  id, term_id, group_id, student_id, date, blocks, type, status(요청·확정·취소),
 *                      requested_by, confirmed_by, confirmed_at …
 *   violations_<기간>:  id, term_id, student_id, occurred_at, rule_id, rule_name, memo, detected_by, entered_by,
 *                      status(유효·취소), source(직접·F1자동), source_exception_id, cancel_reason …
 * tests/rules/out_oracle.test.js가 이 규칙을 단순한 모델과 무작위 시험으로 비교한다.
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

/**
 * rule_name에 남긴 만들 때 특이사항 유형. vocabulary.md 형식 그대로일 때만 읽는다:
 * 정확히 ruleName + '(' + 유형 + ')' — ruleName 바로 뒤의 '('와 짝이 맞는 ')'가 마지막 글자여야 한다
 * (유형 안의 짝 맞는 괄호는 허용). 유형이 비었거나('( )') 통째로 괄호에 싸였거나('((x))') 형식이 다르면 null('알 수 없음').
 */
function outRecordedType_(ruleNameValue, ruleName) {
  var head = attStr_(ruleName) || '무단 지각·결석·이탈';
  var s = attStr_(ruleNameValue);
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
  return Array.isArray(d) ? d.map(attStr_).filter(Boolean).join(',') : attStr_(d);
}

function outIso_(v) {
  return attStr_(v).replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
}

/**
 * 확정된 미인정 특이사항 ↔ 자동 1OUT 맞추기(결정 10·22). 아무것도 쓰지 않고 할 일만 돌려준다.
 * exceptions·violations는 **그 기간의 모든 행**을 넘긴다(한 학생 것만 넘기면 다른 학생의 자동 OUT이
 *   '연결된 특이사항이 없습니다'로 취소된다). 한 학생만 맞추려면 그래도 기간 전체 행을 넘기고 opts.studentIds로 좁힌다.
 * opts = {autoTypes:['미인정지각','미인정조퇴','미인정결석'](비면 이 기본값), ruleName:'무단 지각·결석·이탈', ruleId:'',
 *         per:'group'|'row', dutyByDate:{'yyyy-MM-dd': 이메일 또는 [이메일]}, studentIds:[…](선택),
 *         autoTypeSince:{유형: 'yyyy-MM-ddTHH:mm:ss'}(선택)}
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
 *   같은 행(그 유형이 autoTypeSince에 있으면 그 시각 이후 확정만). → 설정을 좁혀도 이미 있는 OUT은 유지된다.
 *   rule_name을 읽지 못하면(알 수 없음) 유지 행 = 자격 행만이고, 자격 행이 없어도 확정·날짜 맞는 행이 남아 있으면
 *   **그대로 둔다**(유형으로는 취소하지 않고 대표도 옮기지 않는다 — 거짓 사유 취소·비자동 행으로 대표 이동 방지).
 * - 대표 유지: 지금 source_exception_id 행이 유지 행이면 대표를 옮기지 않는다(두 번째 실행 0건). 아니면 유지 행 중 가장 이른 것.
 * - 취소(사유 '[자동] …'): 특이사항이 모두 취소됨, 확정 행이 없어짐(요청으로 돌아감), 특이사항 유형이 자동 대상 밖으로 바뀜,
 *   연결된 특이사항 행이 없음, 특이사항의 학생·기간이 바뀜(바른 쪽에 새로 만든다 — 이때는 autoTypeSince와 상관없이),
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
  Object.keys(opts.autoTypeSince || {}).forEach(function (t) { sinceMap[attTypeBase_(t)] = outIso_(opts.autoTypeSince[t]); });
  var per = opts.per === 'row' ? 'row' : 'group';
  var prefix = outAutoCancelPrefix_();
  var only = null;
  if (Array.isArray(opts.studentIds)) {
    only = {};
    opts.studentIds.forEach(function (s) { only[attStr_(s)] = true; });
  }
  var inScope = function (sid) { return !only || only[attStr_(sid)]; };
  var sinceOk = function (e, type) {
    return !Object.prototype.hasOwnProperty.call(sinceMap, type) || outIso_(e.confirmed_at) >= sinceMap[type];
  };
  var eligible = function (e) {
    var t = attTypeBase_(e.type);
    return autoTypes.indexOf(t) >= 0 && sinceOk(e, t);
  };
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
    if (attStr_(e.status) === '확정' && ymdIsValid_(attStr_(e.date))) u.confirmed.push(e);
  });
  Object.keys(units).forEach(function (k) {
    var u = units[k];
    u.confirmed.sort(byDate);
    u.creatable = u.confirmed.filter(eligible);
  });

  // 관리자가 직접 취소한 자동 OUT: 가리키던 특이사항 행·묶음(취소된 OUT의 학생 기준) + 그 OUT의 학생·기간
  var manual = [];
  (violations || []).forEach(function (v) {
    if (!v || !outIsAuto_(v) || outIsLive_(v) || attStr_(v.cancel_reason).indexOf(prefix) === 0) return;
    var ex = exById[attStr_(v.source_exception_id)];
    manual.push({ exId: attStr_(v.source_exception_id), group: ex && attStr_(ex.group_id) ? attStr_(v.student_id) + '|' + attStr_(ex.group_id) : '',
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
  var live = {}, force = {}, toCancel = [], toUpdate = [];
  (violations || []).forEach(function (v) {
    if (!v || !outIsAuto_(v) || !outIsLive_(v) || !inScope(v.student_id)) return;
    var vid = attStr_(v.id);
    var key = unitOfException[attStr_(v.source_exception_id)];
    if (!key) { toCancel.push({ violationId: vid, reason: prefix + '연결된 특이사항이 없습니다' }); return; }
    var u = units[key];
    var recorded = outRecordedType_(v.rule_name, opts.ruleName);
    var keepers = u.confirmed.filter(function (e) {
      return eligible(e) || (recorded !== null && attTypeBase_(e.type) === recorded && sinceOk(e, recorded));
    });
    if (!keepers.length) {
      if (recorded === null && u.confirmed.length) {   // 알 수 없음: 유형으로는 취소하지 않고 그대로 둔다
        if (!live[key]) { live[key] = vid; return; }
      } else {
        toCancel.push({ violationId: vid, reason: prefix + outWhyNotTarget_(u) });
        return;
      }
    }
    var cur = exById[attStr_(v.source_exception_id)];
    var rep = keepers.length ? (keepers.indexOf(cur) >= 0 ? cur : keepers[0]) : cur;
    if (attStr_(v.student_id) !== attStr_(rep.student_id) || attStr_(v.term_id) !== attStr_(rep.term_id)) {
      toCancel.push({ violationId: vid, reason: prefix + '특이사항의 학생 또는 기간이 바뀌었습니다' });
      if (keepers.length && !force[key]) force[key] = { rep: rep, n: keepers.length };
      return;
    }
    if (live[key]) { toCancel.push({ violationId: vid, reason: prefix + '같은 특이사항의 자동 OUT이 이미 있습니다(중복)' }); return; }
    live[key] = vid;
    if (!keepers.length) return;   // 알 수 없음 + 자격 없음: 고치지도 않는다
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
  var date = attStr_(rep.date);
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
  var recorded = outRecordedType_(v.rule_name, opts.ruleName);
  var nowType = attTypeBase_(rep.type);
  if (recorded !== null && recorded !== nowType && attStr_(v.rule_name) === outRuleName_(opts.ruleName, recorded)) {
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
