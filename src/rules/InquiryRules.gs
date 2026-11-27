/**
 * F16 탐구 기록(신한고 탐구발견 기록 파일) 규칙. RULES 세션 소유(R26). 근거: PRD F16, stage6-rules-draft 3.2, 결정 17·93·100.
 * 순수 함수만 둔다. Stage6Rules.gs(s6True_)·StatusRules.gs·DateRules.gs를 부른다. 열 이름은 Stage6Rules.gs 머리말.
 *
 * 파일 모양 — ASSUMPTION(탐구발견 앱의 내보내기 명세가 이 저장소에 없다. 명세를 받으면 inquiryRecordOf_ 한 곳만 맞춘다):
 *   { app:'shinhan-discovery', schema:1, exportedAt:'ISO 시각', student:{name, class},
 *     records:[{ id, createdAt:'ISO 시각', source:'chatgpt'|'example'|'default'(또는 한국어 이름),
 *                standards:['코드' 또는 {code}](2개), subject, title, question,
 *                events:[{type:'like'|'unlike', at:'ISO 시각'}] (또는 liked:true) }] }
 * 신원은 파일 속 이름·학급이 아니라 로그인 계정으로 정한다(F16, 결정 17) — 파일 이름은 경고에만 쓴다(결정 93).
 */

var INQ_MAX_BYTES = 12 * 1024 * 1024;   // F16: 탐구발견과 같은 기준
var INQ_MAX_RECORDS = 1000;
var INQ_PROGRESS = ['관심', '진행 중', '완료'];
var INQ_LINK_MAX = 500;
var INQ_MEMO_MAX = 500;
var INQ_KEEP_YEARS = 1;                 // 결정 100

/** 글자의 UTF-8 바이트 수(서비스 없이). */
function inqBytes_(s) {
  var n = 0, t = String(s);
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < t.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** ISO 시각 → KST 'yyyy-MM-ddTHH:mm:ss'. 시간대 표시(Z·+09:00)가 있으면 KST로 바꾸고, 없으면 그대로 KST로 본다. 틀리면 ''. */
function inqIso_(v) {
  var s = ruleStr_(v);
  var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m || !ymdIsValid_(m[1]) || +m[2] > 23 || +m[3] > 59 || +(m[4] || 0) > 59) return '';
  if (!m[5]) return m[1] + 'T' + m[2] + ':' + m[3] + ':' + (m[4] || '00');
  var ms = Date.parse(s.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (isNaN(ms)) return '';
  var k = ms + 9 * 3600 * 1000, day = ymdFromUtcMs_(k), sec = Math.floor((((k % 86400000) + 86400000) % 86400000) / 1000);
  return day + 'T' + ymdPad2_(Math.floor(sec / 3600)) + ':' + ymdPad2_(Math.floor(sec / 60) % 60) + ':' + ymdPad2_(sec % 60);
}

/** 출처 → 화면 이름. 모르는 값은 ''(부르는 쪽이 경고). */
function inqSourceKo_(v) {
  var s = ruleStr_(v).toLowerCase();
  return { 'chatgpt': 'ChatGPT', 'ai': 'ChatGPT', 'example': '연결 예시', '연결 예시': '연결 예시', 'default': '기본 추천', '기본 추천': '기본 추천' }[s] || '';
}

/** 파일 속 기록 한 건 → 요약(본문 비교용 body 포함). 파일 모양 가정은 이 함수 한 곳에. */
function inquiryRecordOf_(r) {
  r = r || {};
  var topic = r.topic || {};
  var standards = (Array.isArray(r.standards) ? r.standards : []).map(function (x) { return ruleStr_(x && typeof x === 'object' ? x.code : x); }).filter(Boolean);
  var events = (Array.isArray(r.events) ? r.events : []).filter(function (e) { return e && /^(like|unlike)$/.test(ruleStr_(e.type)); })
    .map(function (e) { return { type: ruleStr_(e.type), at: inqIso_(e.at) || ruleStr_(e.at) }; });
  var rec = {
    sourceId: ruleStr_(r.id), recordedAt: inqIso_(r.createdAt || r.recordedAt), sourceRaw: ruleStr_(r.source), source: inqSourceKo_(r.source),
    standards: standards.slice(0, 2), subject: ruleStr_(r.subject), title: ruleStr_(r.title || topic.title), question: ruleStr_(r.question || topic.question),
    events: events, likedFlag: r.liked === true || ruleStr_(r.liked).toLowerCase() === 'true'
  };
  rec.body = JSON.stringify([rec.recordedAt, rec.sourceRaw, rec.standards, rec.subject, rec.title, rec.question]);
  return rec;
}

/** 반응 이벤트를 합쳐 관심 표시를 정한다: 시각 순으로 마지막 like/unlike, 이벤트가 없으면 liked 값. */
function inqLiked_(events, flag) {
  if (!events.length) return !!flag;
  var last = events.slice().sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; })[events.length - 1];
  return last.type === 'like';
}

/**
 * 탐구발견 기록 파일 읽기. text = 파일 글자, opts = {accountName(로그인 학생 이름), maxBytes, maxRecords}.
 * → {meta:{app, schema, exportedAt, fileName, fileClass}, records:[요약], nameMismatch, errors, warnings}
 *   요약 = {sourceId, recordedAt, source('ChatGPT'|'연결 예시'|'기본 추천'), standards:[코드 2개까지], subject, title, question, liked}
 * - 12MB·1,000건 초과, JSON이 아님, app·schema가 다름 → 오류(records []).
 * - 기록 id가 빈 건·시각을 읽을 수 없는 건은 오류. 출처를 모르면 경고하고 '기본 추천'으로 둔다(ASSUMPTION — 화면은 늘 'AI 제안' 출처를 보인다).
 * - 같은 기록 id가 파일 안에 여럿: 본문이 같으면 반응 이벤트만 합치고, 다르면 오류(F16).
 * - 파일 속 이름이 opts.accountName과 다르면 경고만(결정 93) + nameMismatch true. 신원에는 쓰지 않는다.
 */
function inquiryParse_(text, opts) {
  var o = opts || {}, errors = [], warnings = [], empty = function () { return { meta: null, records: [], nameMismatch: false, errors: errors, warnings: warnings }; };
  var s = String(text === undefined || text === null ? '' : text);
  var maxB = o.maxBytes || INQ_MAX_BYTES, maxR = o.maxRecords || INQ_MAX_RECORDS;
  if (inqBytes_(s) > maxB) { errors.push('파일이 ' + Math.floor(maxB / 1024 / 1024) + 'MB보다 큽니다. 탐구발견에서 기록을 나누어 받아 주세요.'); return empty(); }
  var j;
  try { j = JSON.parse(s.replace(/^﻿/, '')); } catch (e) { j = null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) { errors.push('기록 파일을 읽을 수 없습니다. 탐구발견의 [기록 파일 받기]로 받은 파일을 그대로 올려 주세요.'); return empty(); }
  if (ruleStr_(j.app) !== 'shinhan-discovery' || Number(j.schema) !== 1) {
    errors.push('탐구발견 기록 파일이 아닙니다. 탐구발견의 [기록 파일 받기]로 받은 파일을 올려 주세요.'); return empty();
  }
  var list = Array.isArray(j.records) ? j.records : [];
  if (list.length > maxR) { errors.push('기록이 ' + maxR + '건보다 많습니다(' + list.length + '건). 탐구발견에서 기록을 나누어 받아 주세요.'); return empty(); }
  var byId = {}, order = [], unknownSource = 0;
  list.forEach(function (raw, k) {
    var rec = inquiryRecordOf_(raw);
    if (!rec.sourceId) { errors.push((k + 1) + '번째 기록에 id가 없습니다. 탐구발견에서 파일을 다시 받아 주세요.'); return; }
    if (!rec.recordedAt) { errors.push((k + 1) + '번째 기록의 시각을 읽을 수 없습니다. 탐구발견에서 파일을 다시 받아 주세요.'); return; }
    var prev = byId[rec.sourceId];
    if (prev) {
      if (prev.body !== rec.body) { errors.push('같은 기록(' + rec.sourceId + ')이 파일 안에 내용이 다르게 두 번 있습니다. 탐구발견에서 파일을 다시 받아 주세요.'); return; }
      var seen = {};
      prev.events.forEach(function (e) { seen[e.type + '|' + e.at] = true; });
      rec.events.forEach(function (e) { if (!seen[e.type + '|' + e.at]) prev.events.push(e); });
      prev.likedFlag = prev.likedFlag || rec.likedFlag;
      return;
    }
    if (!rec.source) { unknownSource++; rec.source = '기본 추천'; }
    byId[rec.sourceId] = rec;
    order.push(rec.sourceId);
  });
  if (unknownSource) warnings.push('출처를 알 수 없는 기록 ' + unknownSource + '건은 기본 추천으로 표시합니다.');
  var student = j.student || {}, fileName = ruleStr_(student.name), acc = ruleStr_(o.accountName);
  var mismatch = !!(fileName && acc && fileName.replace(/\s+/g, '') !== acc.replace(/\s+/g, ''));
  if (mismatch) warnings.push('파일 속 이름이 다릅니다. 내 기록이 맞나요? 맞으면 그대로 올려 주세요.');
  if (errors.length) return { meta: null, records: [], nameMismatch: mismatch, errors: errors, warnings: warnings };
  return {
    meta: { app: 'shinhan-discovery', schema: 1, exportedAt: inqIso_(j.exportedAt), fileName: fileName, fileClass: ruleStr_(student['class']) },
    records: order.map(function (id) {
      var r = byId[id];
      return { sourceId: id, recordedAt: r.recordedAt, source: r.source, standards: r.standards, subject: r.subject, title: r.title, question: r.question,
        liked: inqLiked_(r.events, r.likedFlag) };
    }),
    nameMismatch: mismatch, errors: [], warnings: warnings
  };
}

/** 요약 본문 비교 글자(학생이 덧붙인 칸·관심 표시 제외). */
function inqBody_(r) {
  var st = Array.isArray(r.standards) ? r.standards.join(';') : ruleStr_(r.standards);
  return JSON.stringify([ruleIso_(r.recordedAt || r.recorded_at), ruleStr_(r.source), st, ruleStr_(r.subject), ruleStr_(r.title), ruleStr_(r.question)]);
}

/**
 * 기존 기록과 합치기. existing = inquiry_records 행, parsed = inquiryParse_ 결과(오류 없어야 함), studentId(로그인 계정의 학생), fileId(원본 파일 Drive id).
 * → {toAppend:[행], toUpdate:[{id, patch}], same:n, conflicts:[{sourceId, why}]}
 * - 그 학생의 살아 있는 행 중 같은 source_id: 본문이 같으면 관심 표시만 맞춘다(같으면 0건 — 같은 파일을 다시 올려도 중복 없음, F16 완료 기준).
 *   본문이 다르면 conflicts(덮어쓰지 않음). 학생이 덧붙인 진행 상태·링크·메모·공개 표시는 건드리지 않는다.
 * - 새 기록: 진행 '관심', 공개 'FALSE'(기본 비공개, 결정 15), name_mismatch(결정 93, 교사 화면 표시), file_id.
 * - 취소된 행(정리 대상으로 정리한 것 등)은 없는 것으로 본다.
 */
function inquiryMergePlan_(existing, parsed, studentId, fileId) {
  var p = parsed || {}, sid = ruleStr_(studentId);
  if (!sid) throw new Error('studentId가 비어 있습니다');
  if (!p.records || (p.errors && p.errors.length)) throw new Error('inquiryParse_ 오류가 있는 결과는 합치지 않습니다');
  var have = {};
  (existing || []).forEach(function (r) {
    if (r && ruleStr_(r.student_id) === sid && ruleStr_(r.status) !== '취소' && !have[ruleStr_(r.source_id)]) have[ruleStr_(r.source_id)] = r;
  });
  var out = { toAppend: [], toUpdate: [], same: 0, conflicts: [] };
  p.records.forEach(function (rec) {
    var old = have[rec.sourceId], liked = rec.liked ? 'TRUE' : 'FALSE';
    if (old) {
      if (inqBody_(old) !== inqBody_(rec)) { out.conflicts.push({ sourceId: rec.sourceId, why: '이미 받은 기록과 내용이 다릅니다. 기존 기록은 그대로 둡니다.' }); return; }
      if ((s6True_(old.liked) ? 'TRUE' : 'FALSE') !== liked) out.toUpdate.push({ id: ruleStr_(old.id), patch: { liked: liked } });
      else out.same++;
      return;
    }
    out.toAppend.push({ student_id: sid, source_id: rec.sourceId, recorded_at: rec.recordedAt, source: rec.source, standards: rec.standards.join(';'),
      subject: rec.subject, title: rec.title, question: rec.question, liked: liked, progress: '관심', result_link: '', memo: '',
      file_id: ruleStr_(fileId), name_mismatch: p.nameMismatch ? 'TRUE' : 'FALSE', parent_public: 'FALSE', status: '유효' });
  });
  return out;
}

/**
 * 학생 진행 기록 검사. input = {progress, resultLink, memo}(적지 않은 칸은 patch에 넣지 않는다).
 * → {patch:{progress, result_link, memo}, errors}. 진행은 관심·진행 중·완료, 링크는 http(s)만·500자, 메모 500자.
 */
function inquiryProgressCheck_(input) {
  var i = input || {}, errors = [], patch = {};
  if (i.progress !== undefined) {
    var pg = ruleStr_(i.progress);
    if (INQ_PROGRESS.indexOf(pg) < 0) errors.push('진행 상태는 ' + INQ_PROGRESS.join('·') + ' 중에서 골라 주세요.');
    patch.progress = pg;
  }
  if (i.resultLink !== undefined) {
    var link = ruleStr_(i.resultLink);
    if (link && !/^https?:\/\/[^\s]+$/i.test(link)) errors.push('결과물 링크는 http:// 나 https:// 로 시작하는 주소여야 합니다. 주소를 고쳐 주세요.');
    else if (link.length > INQ_LINK_MAX) errors.push('결과물 링크는 ' + INQ_LINK_MAX + '자까지 적을 수 있습니다.');
    patch.result_link = link;
  }
  if (i.memo !== undefined) {
    var memo = ruleStr_(i.memo);
    if (memo.length > INQ_MEMO_MAX) errors.push('메모는 ' + INQ_MEMO_MAX + '자까지 적을 수 있습니다. 지금 ' + memo.length + '자입니다.');
    patch.memo = memo;
  }
  return { patch: errors.length ? null : patch, errors: errors };
}

/** 'yyyy-MM-dd' + n년(2월 29일 → 다음 해 3월 1일). */
function inqAddYears_(ymd, n) {
  var y = Number(ymd.slice(0, 4)) + n, m = ymd.slice(5, 7), d = ymd.slice(8, 10);
  return ymdIsValid_(y + '-' + m + '-' + d) ? y + '-' + m + '-' + d : ymdAddDays_(y + '-' + m + '-28', 1);
}

/**
 * 원본 파일 정리 대상(결정 100: 졸업·퇴실 뒤 1년, 관리자가 확인해 지움 — 자동 삭제 없음).
 * records = inquiry_records 행, changes = status_changes, today, opts = {years}(기본 1).
 * → [{id, studentId, fileId, leaveDate, since}] since = 정리할 수 있게 된 날(퇴실일 + 1년). leaveDate 순 → id 순.
 * - 살아 있고 file_id가 있는 행만. 그 학생이 오늘 학사 퇴실 상태이고(임시 퇴실은 뺀다 — 돌아올 학생), 퇴실일 + 1년 ≤ 오늘.
 * - 졸업은 학년 일괄 퇴실(R20)로 기록되므로 퇴실과 같다. 학사 기록이 없는 학생은 대상이 아니다.
 * 정리 뒤 시트 행은 '취소'로 남기고 지운 사실은 audit_log에 남긴다(서버, C52).
 */
function inquiryCleanupTargets_(records, changes, today, opts) {
  var d = ruleStr_(today), years = opts && opts.years !== undefined ? Number(opts.years) : INQ_KEEP_YEARS;
  if (!ymdIsValid_(d)) throw new Error('today는 yyyy-MM-dd여야 합니다: ' + today);
  var cache = {};
  var leaveOf = function (sid) {
    if (cache.hasOwnProperty(sid)) return cache[sid];
    var row = statusRowOn_(changes, sid, '학사', d);
    return (cache[sid] = row && ruleStr_(row.value) === '퇴실' && !isTempLeaveRow_(row) && ymdIsValid_(ruleStr_(row.effective_date)) ? ruleStr_(row.effective_date) : '');
  };
  return (records || []).filter(function (r) { return r && ruleStr_(r.status) !== '취소' && ruleStr_(r.file_id); }).map(function (r) {
    var sid = ruleStr_(r.student_id), leave = leaveOf(sid);
    if (!leave) return null;
    var since = inqAddYears_(leave, years);
    return since <= d ? { id: ruleStr_(r.id), studentId: sid, fileId: ruleStr_(r.file_id), leaveDate: leave, since: since } : null;
  }).filter(Boolean).sort(function (a, b) { return a.leaveDate !== b.leaveDate ? (a.leaveDate < b.leaveDate ? -1 : 1) : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
}
