/**
 * OUT 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD F1·F4, 결정 4·10·22).
 *
 * 순수 함수만 둔다. 다른 파일의 함수·전역 값을 쓰지 않는다.
 * 시트 행(문자열)은 그대로 받는다.
 *   exceptions_<기간>:  id, term_id, group_id, student_id, date, blocks, type, status(요청·확정·취소),
 *                      requested_by, confirmed_by, confirmed_at …
 *   violations_<기간>:  id, term_id, student_id, occurred_at, rule_id, rule_name, memo, detected_by, entered_by,
 *                      status(유효·취소), source(직접·F1자동), source_exception_id, cancel_reason …
 */

function outStr_(v) {
  return String(v === undefined || v === null ? '' : v).trim();
}

/** 유형 이름 끝의 괄호 설명을 뗀다('미인정결석(무단)' → '미인정결석'). */
function outTypeBase_(t) {
  return outStr_(t).replace(/\s*\(.*\)\s*$/, '').trim();
}

/** 자동 OUT 기록인지(source 'F1자동'). */
function outIsAuto_(v) {
  return outStr_(v && v.source) === 'F1자동';
}

/** 살아 있는 OUT인지(status 빈칸·'유효'). */
function outIsLive_(v) {
  var st = outStr_(v && v.status);
  return st === '' || st === '유효';
}

/** 자동 취소 사유의 머리말. 관리자가 직접 취소한 자동 OUT과 구별한다. */
function outAutoCancelPrefix_() {
  return '[자동] ';
}

/**
 * 확정된 미인정 특이사항 ↔ 자동 1OUT 맞추기(결정 10·22). 아무것도 쓰지 않고 할 일만 돌려준다.
 * opts = {autoTypes:['미인정지각','미인정조퇴','미인정결석'], ruleName:'무단 지각·결석·이탈', ruleId:'',
 *         per:'group'|'row', dutyByDate:{'yyyy-MM-dd': 이메일 또는 [이메일]}}
 * → {toCreate:[violations 행 초안(id·공통 열 없음)], toCancel:[{violationId, reason}]}
 *
 * - 단위: per 'group'(기본, 결정 22 "입력 1건 = 1OUT")이면 같은 group_id의 행 묶음 하나, group_id가 비면 행 하나.
 *   per 'row'면 행마다. 단위 안에 status '확정'이고 유형이 autoTypes인 행이 하나라도 있으면 OUT 대상이다
 *   ('요청'·'취소'는 만들지 않는다). 유형은 괄호 설명을 떼고 비교한다.
 * - 대표 행 = 단위 안 대상 행 중 날짜가 가장 이른 것(같으면 id 순). source_exception_id = 대표 행 id,
 *   occurred_at = 대표 행 날짜 + 첫 블록 시작('ALL'이면 00:00), entered_by = 확정자(없으면 요청자),
 *   detected_by = dutyByDate[날짜](배열이면 쉼표로 이음, 없으면 빈칸).
 * - 이미 있는 자동 OUT(source 'F1자동')은 source_exception_id가 속한 단위에 연결된다(대표가 아닌 행 id여도).
 *   단위가 대상이고 살아 있는 OUT이 있으면 아무것도 안 함(두 번 실행해도 새로 만드는 것 0건).
 *   단위가 대상이 아니게 되면(특이사항 취소·유형 변경·확정 → 요청) 그 OUT을 취소한다. 같은 단위에 살아 있는 자동 OUT이
 *   둘 이상이면 하나만 남기고 취소한다. 연결된 특이사항을 찾을 수 없으면(행이 없음) 취소한다.
 * - 교사가 직접 입력한 OUT(source가 'F1자동'이 아님)은 건드리지 않는다.
 * ASSUMPTION: 관리자가 직접 취소한 자동 OUT(cancel_reason이 '[자동] '으로 시작하지 않음)이 있는 단위는 다시 만들지 않는다
 *   (관리자의 판단을 맞추기 함수가 되돌리지 않게). 자동으로 취소된 뒤 단위가 다시 대상이 되면 새로 만든다.
 */
function reconcileAutoOuts_(exceptions, violations, opts) {
  opts = opts || {};
  var autoTypes = (opts.autoTypes || ['미인정지각', '미인정조퇴', '미인정결석']).map(outTypeBase_);
  var per = opts.per === 'row' ? 'row' : 'group';
  var duty = opts.dutyByDate || {};
  var prefix = outAutoCancelPrefix_();

  // 1) 단위 만들기: unitKey → {rows, targets}
  var units = {}, unitOfException = {};
  (exceptions || []).forEach(function (e) {
    if (!e || !outStr_(e.id)) return;
    var id = outStr_(e.id), gid = outStr_(e.group_id);
    var key = per === 'group' && gid ? 'g:' + outStr_(e.student_id) + '|' + gid : 'r:' + id;
    var u = units[key] = units[key] || { key: key, rows: [], targets: [] };
    u.rows.push(e);
    unitOfException[id] = key;
    if (outStr_(e.status) === '확정' && autoTypes.indexOf(outTypeBase_(e.type)) >= 0) u.targets.push(e);
  });
  Object.keys(units).forEach(function (k) {
    units[k].targets.sort(function (a, b) {
      var da = outStr_(a.date), db = outStr_(b.date);
      return da < db ? -1 : da > db ? 1 : (outStr_(a.id) < outStr_(b.id) ? -1 : 1);
    });
  });

  // 2) 이미 있는 자동 OUT을 단위에 연결
  var live = {}, manualCancelled = {}, toCancel = [];
  (violations || []).forEach(function (v) {
    if (!v || !outIsAuto_(v)) return;
    var vid = outStr_(v.id);
    var key = unitOfException[outStr_(v.source_exception_id)];
    if (!outIsLive_(v)) {
      if (key && outStr_(v.cancel_reason).indexOf(prefix) !== 0) manualCancelled[key] = true;
      return;
    }
    if (!key) { toCancel.push({ violationId: vid, reason: prefix + '연결된 특이사항이 없습니다' }); return; }
    var u = units[key];
    if (!u.targets.length) {
      toCancel.push({ violationId: vid, reason: prefix + outWhyNotTarget_(u.rows, autoTypes) });
      return;
    }
    if (live[key]) { toCancel.push({ violationId: vid, reason: prefix + '같은 특이사항의 자동 OUT이 이미 있습니다(중복)' }); return; }
    live[key] = vid;
  });

  // 3) 대상인데 살아 있는 OUT이 없는 단위 → 만들기
  var toCreate = [];
  Object.keys(units).sort().forEach(function (k) {
    var u = units[k];
    if (!u.targets.length || live[k] || manualCancelled[k]) return;
    var e = u.targets[0];
    var date = outStr_(e.date);
    var d = duty[date];
    toCreate.push({
      term_id: outStr_(e.term_id),
      student_id: outStr_(e.student_id),
      occurred_at: date + 'T' + outFirstStart_(e.blocks) + ':00',
      rule_id: outStr_(opts.ruleId),
      rule_name: outStr_(opts.ruleName) || '무단 지각·결석·이탈',
      memo: '사전 특이사항 자동: ' + outTypeBase_(e.type) + (u.targets.length > 1 ? ' 외 ' + (u.targets.length - 1) + '일' : ''),
      detected_by: Array.isArray(d) ? d.map(outStr_).filter(Boolean).join(',') : outStr_(d),
      entered_by: outStr_(e.confirmed_by) || outStr_(e.requested_by),
      status: '유효',
      source: 'F1자동',
      source_exception_id: outStr_(e.id),
      cancel_reason: ''
    });
  });
  return { toCreate: toCreate, toCancel: toCancel };
}

/** 단위가 왜 대상이 아닌지(취소 사유 문구). */
function outWhyNotTarget_(rows, autoTypes) {
  if (rows.every(function (e) { return outStr_(e.status) === '취소'; })) return '특이사항이 취소되었습니다';
  if (rows.every(function (e) { return autoTypes.indexOf(outTypeBase_(e.type)) < 0; })) return '특이사항 유형이 바뀌었습니다';
  return '확정된 미인정 특이사항이 없습니다';
}

/** 블록 표기의 첫 시작 시각('ALL'·잘못된 표기는 '00:00'). */
function outFirstStart_(blocks) {
  var starts = outStr_(blocks).split(';').map(function (p) {
    var m = /^\s*(\d{1,2}):(\d{2})\s*[-–~]/.exec(p);
    return m ? (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2] : '';
  }).filter(function (s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }).sort();
  return starts[0] || '00:00';
}

/**
 * 그 학생의 이번 기간 OUT 단계(학기마다 초기화 = termId가 같은 것만 센다).
 * status 빈칸·'유효'인 OUT만 센다(직접·자동 모두). → {count, level:0|1|2, label:''|'1OUT'|'퇴실 대상'}
 * 2개 이상이면 '퇴실 대상'(결정 4: 학부모 면담 기록 후 관리자가 퇴실 확정, 유예 없음).
 */
function outLevel_(violations, studentId, termId) {
  var sid = outStr_(studentId), tid = outStr_(termId);
  var count = (violations || []).filter(function (v) {
    return v && outIsLive_(v) && outStr_(v.student_id) === sid && outStr_(v.term_id) === tid;
  }).length;
  var level = count >= 2 ? 2 : count;
  return { count: count, level: level, label: ['', '1OUT', '퇴실 대상'][level] };
}
