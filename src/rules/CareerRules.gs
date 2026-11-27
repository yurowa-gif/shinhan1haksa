/**
 * F15 진로 프로필·이수 계획 규칙. RULES 세션 소유(R25). 근거: stage6-rules-draft 3.1, 결정 14·15·89·92·98·99.
 * 순수 함수만 둔다. Stage6Rules.gs(S6_PROFILE_PUBLIC·s6True_)·StatusRules.gs(statusOn_·statusRowOn_)·DateRules.gs를 부른다.
 * 열 이름은 Stage6Rules.gs 머리말. 편제표·권장 과목은 아직 시트 모양 승인 전이라(결정 101) 행 배열을 인자로 받는다:
 *   편제(curriculum) 행: entry_year, grade, semester, choice_group, pick_n, course, status(취소 행은 쓰지 않음) — s6-0-design 8절 제안안 A
 *   권장 과목(recs) 행: data/course_recommendations/course_recommendations.csv 열 그대로 —
 *     base_year, university, unit, core_courses('a;b'), recommended_courses('a;b'), source_url, source_title, note
 */

var CAREER_TEXT_MAX = 1000;
var CAREER_HOPES_MAX = 3;
var CAREER_TARGETS_MAX = 6;
var CAREER_GRACE_DAYS = 14;   // 결정 98

/** 이름 다듬기(앞뒤·연속 공백). */
function careerTxt_(v) { return ruleStr_(v).replace(/\s+/g, ' '); }

/**
 * 진로 프로필 제출 입력 검사. input = {hopes:[{rank, field, job}], targets:[{university, unit, track}], interests, strengths, concerns}.
 * → {row:{hopes(JSON 글자), targets(JSON 글자), interests, strengths, concerns}, errors}
 * - 희망: 1~3순위, 순위 중복 없음, 1순위가 있어야 한다(분야·직업 중 하나 이상). 순위 순으로 저장.
 * - 목표 진학: 0~6개, 대학·학과(모집단위) 모두 적어야 한다. 전형(track)은 선택.
 * - 글 칸(관심 분야·강점·고민)은 1000자까지. 학부모 공개 표시는 받지 않는다(careerPublishPlan_).
 * 버전·제출 시각·기간은 서버가 붙인다(careerNextVersion_).
 */
function careerProfileCheck_(input) {
  var i = input || {}, errors = [], seen = {};
  var hopes = (Array.isArray(i.hopes) ? i.hopes : []).map(function (h) {
    return { rank: Number(ruleStr_((h || {}).rank)), field: careerTxt_((h || {}).field), job: careerTxt_((h || {}).job) };
  }).filter(function (h) { return h.field || h.job; });
  hopes.forEach(function (h) {
    if (!(h.rank >= 1 && h.rank <= CAREER_HOPES_MAX && h.rank === Math.floor(h.rank))) errors.push('희망 순위는 1~' + CAREER_HOPES_MAX + '순위입니다. 순위를 다시 골라 주세요.');
    else if (seen[h.rank]) errors.push(h.rank + '순위를 두 번 적었습니다. 한 번만 적어 주세요.');
    seen[h.rank] = true;
  });
  if (!seen[1]) errors.push('1순위 진로 희망이 비어 있습니다. 분야나 직업을 적어 주세요.');
  hopes.sort(function (a, b) { return a.rank - b.rank; });
  var targets = (Array.isArray(i.targets) ? i.targets : []).map(function (t) {
    return { university: careerTxt_((t || {}).university), unit: careerTxt_((t || {}).unit), track: careerTxt_((t || {}).track) };
  }).filter(function (t) { return t.university || t.unit || t.track; });
  if (targets.length > CAREER_TARGETS_MAX) errors.push('목표 진학은 ' + CAREER_TARGETS_MAX + '개까지 적을 수 있습니다. ' + (targets.length - CAREER_TARGETS_MAX) + '개를 빼 주세요.');
  targets.forEach(function (t, k) {
    if (!t.university || !t.unit) errors.push('목표 진학 ' + (k + 1) + '번째 줄에 대학과 학과를 모두 적어 주세요.');
  });
  var row = { hopes: JSON.stringify(hopes), targets: JSON.stringify(targets) };
  [['interests', '관심 분야는'], ['strengths', '강점은'], ['concerns', '고민은']].forEach(function (p) {
    var v = ruleStr_(i[p[0]]);
    if (v.length > CAREER_TEXT_MAX) errors.push(p[1] + ' ' + CAREER_TEXT_MAX + '자까지 적을 수 있습니다. 지금 ' + v.length + '자입니다.');
    row[p[0]] = v;
  });
  return { row: errors.length ? null : row, errors: errors };
}

/** 그 학생의 진로 프로필 행(취소 포함 여부 선택). */
function careerRowsOf_(profiles, studentId, withCancelled) {
  var sid = ruleStr_(studentId);
  return (profiles || []).filter(function (r) { return r && ruleStr_(r.student_id) === sid && (withCancelled || ruleStr_(r.status) !== '취소'); });
}

/** 다음 버전 번호: 그 학생의 모든 행(취소 포함)의 가장 큰 버전 + 1 — 번호를 다시 쓰지 않는다. */
function careerNextVersion_(profiles, studentId) {
  return careerRowsOf_(profiles, studentId, true).reduce(function (m, r) {
    var v = Number(ruleStr_(r.version));
    return v > m ? v : m;
  }, 0) + 1;
}

/**
 * 가장 최근 제출 버전 행 또는 null(살아 있는 행 중 버전이 가장 큰 것).
 * opts = {termId}(그 운영 기간에 낸 것 중), {asOf:'yyyy-MM-ddTHH:mm:ss'}(그 시각까지 낸 것 중).
 */
function careerLatest_(profiles, studentId, opts) {
  var o = opts || {};
  return careerRowsOf_(profiles, studentId).filter(function (r) {
    return (!o.termId || ruleStr_(r.term_id) === ruleStr_(o.termId)) && (!o.asOf || ruleIso_(r.submitted_at) <= ruleIso_(o.asOf));
  }).reduce(function (m, r) { return !m || Number(ruleStr_(r.version)) > Number(ruleStr_(m.version)) ? r : m; }, null);
}

/** 새 버전의 학부모 공개 항목 초기값 = 가장 최근 버전의 공개 항목(이어받기, 결정 89). 없으면 ''(기본 비공개). */
function careerNextParentFields_(profiles, studentId) {
  var last = careerLatest_(profiles, studentId);
  return last ? s6ParentFields_(last, 'profile').join(';') : '';
}

/**
 * 학부모 공개 항목 바꾸기(학생). current = 바꿀 프로필 행(가장 최근 버전), request = {fields:{hopes:true, targets:false, …}}
 * (적지 않은 항목은 지금 값 그대로).
 * → {patch:{parent_fields}, added:[], removed:[], notice, errors}
 * - 항목 이름은 S6_PROFILE_PUBLIC만(모르는 이름은 오류).
 * - 거둬들인 항목이 있으면 notice = '학부모님이 이미 보신 내용은 되돌릴 수 없습니다.'(결정 92). 학부모 화면에서는 바로 사라진다.
 * 켜고 끈 기록은 서버가 audit_log에 남긴다.
 */
function careerPublishPlan_(current, request) {
  var f = ((request || {}).fields) || {}, errors = [];
  var now = {};
  s6ParentFields_(current || {}, 'profile').forEach(function (k) { now[k] = true; });
  var next = Object.assign({}, now);
  Object.keys(f).forEach(function (k) {
    if (S6_PROFILE_PUBLIC.indexOf(k) < 0) { errors.push('공개할 수 없는 항목입니다(' + k + '). 화면을 새로 불러와 주세요.'); return; }
    if (s6True_(f[k])) next[k] = true; else delete next[k];
  });
  if (errors.length) return { patch: null, added: [], removed: [], notice: '', errors: errors };
  var list = S6_PROFILE_PUBLIC.filter(function (k) { return next[k]; });
  var removed = S6_PROFILE_PUBLIC.filter(function (k) { return now[k] && !next[k]; });
  return { patch: { parent_fields: list.join(';') }, added: S6_PROFILE_PUBLIC.filter(function (k) { return next[k] && !now[k]; }), removed: removed,
    notice: removed.length ? '학부모님이 이미 보신 내용은 되돌릴 수 없습니다.' : '', errors: [] };
}

/**
 * 진로 프로필 미제출 학생(담당교사 표시, 결정 14·98).
 * enrollments(그 기간 등록 행), changes(status_changes), profiles, term = {id, career_due}, today 'yyyy-MM-dd', opts = {graceDays}(기본 14).
 * → [{studentId, since, lastSubmittedAt}] studentId 순. since = 미제출로 세기 시작한 날.
 * - 마감일이 비었거나 오늘이 마감일 전이면 [].
 * - 대상: 마감일에 학사 입실이었던 학생(since = 마감일) + 마감일 뒤에 입실한 학생은 입실한 날부터 14일이 지난 날부터(since = 입실일 + 14).
 *   오늘 학사 입실이 아닌 학생(퇴실)은 뺀다.
 * - 제출 = 그 기간(term_id)에 낸 살아 있는 버전이 있음. lastSubmittedAt = 그 학생의 가장 최근 제출 시각(지난 기간 포함, 없으면 '').
 */
function careerMissing_(enrollments, changes, profiles, term, today, opts) {
  var t = term || {}, due = ruleStr_(t.career_due), tid = ruleStr_(t.id), d = ruleStr_(today);
  var grace = (opts && opts.graceDays !== undefined) ? Number(opts.graceDays) : CAREER_GRACE_DAYS;
  if (!ymdIsValid_(d)) throw new Error('today는 yyyy-MM-dd여야 합니다: ' + today);
  if (!ymdIsValid_(due) || d < due) return [];
  var ids = {};
  (enrollments || []).forEach(function (e) { if (e && ruleStr_(e.term_id) === tid && ruleStr_(e.student_id)) ids[ruleStr_(e.student_id)] = true; });
  return Object.keys(ids).sort().map(function (sid) {
    if (statusOn_(changes, sid, '학사', d) !== '입실') return null;
    var since = due;
    if (statusOn_(changes, sid, '학사', due) !== '입실') {
      var entry = ruleStr_((statusRowOn_(changes, sid, '학사', d) || {}).effective_date);
      since = ymdAddDays_(entry, grace);
      if (d < since) return null;
    }
    if (careerLatest_(profiles, sid, { termId: tid })) return null;
    var last = careerLatest_(profiles, sid);
    return { studentId: sid, since: since, lastSubmittedAt: last ? ruleIso_(last.submitted_at) : '' };
  }).filter(Boolean);
}

/** 편제 한 줄의 열쇠: 학년|학기|선택군 */
function careerSlotKey_(r) { return [ruleStr_(r.grade), ruleStr_(r.semester), ruleStr_(r.choice_group)].join('|'); }

/**
 * 이수 계획 검사(학생이 고른 과목 전체). curriculum = 편제 행, entryYear = 그 학생 입학년도,
 * selections = [{grade, semester, choice_group, course}], existing = 그 학생의 course_plans 행(같은 과목이 이미 확정인지 경고용).
 * → {rows:[{entry_year, grade, semester, choice_group, course}], errors, warnings}
 * - 편제(그 입학년도·학년·학기·선택군)에 없는 과목은 오류.
 * - 선택군마다 고른 수 > 택N(pick_n)이면 오류(F15 '택N 초과는 막는다'). 택N이 비거나 0이면 그 선택군은 개수를 보지 않는다(ASSUMPTION: 공통·필수 과목 묶음).
 * - 같은 학년·학기에 같은 과목 두 번은 오류.
 * - 담당교사가 확정한 줄을 빼면 경고(다시 확인을 받아야 한다, 결정 99).
 */
function coursePlanCheck_(curriculum, entryYear, selections, existing) {
  var ey = ruleStr_(entryYear), errors = [], warnings = [], cur = {}, picked = {}, seenCourse = {}, rows = [];
  (curriculum || []).forEach(function (c) {
    if (!c || ruleStr_(c.entry_year) !== ey || ruleStr_(c.status) === '취소') return;
    var k = careerSlotKey_(c), slot = cur[k] = cur[k] || { pickN: 0, courses: {} };
    var n = Number(ruleStr_(c.pick_n));
    if (n > slot.pickN) slot.pickN = n;
    slot.courses[careerTxt_(c.course)] = true;
  });
  if (!Object.keys(cur).length) errors.push(ey + '년 입학생의 교육과정 편제가 없습니다. 관리자 선생님께 알려 주세요.');
  (selections || []).forEach(function (s) {
    s = s || {};
    var k = careerSlotKey_(s), course = careerTxt_(s.course), slot = cur[k];
    var where = ruleStr_(s.grade) + '학년 ' + ruleStr_(s.semester) + '학기 ' + ruleStr_(s.choice_group);
    if (!slot || !slot.courses[course]) { if (Object.keys(cur).length) errors.push(where + '에 ' + course + ' 과목이 없습니다. 편제에 있는 과목을 골라 주세요.'); return; }
    var ck = ruleStr_(s.grade) + '|' + ruleStr_(s.semester) + '|' + course;
    if (seenCourse[ck]) { errors.push(ruleStr_(s.grade) + '학년 ' + ruleStr_(s.semester) + '학기에 ' + course + ' 과목을 두 번 골랐습니다. 한 번만 골라 주세요.'); return; }
    seenCourse[ck] = true;
    picked[k] = (picked[k] || 0) + 1;
    rows.push({ entry_year: ey, grade: ruleStr_(s.grade), semester: ruleStr_(s.semester), choice_group: ruleStr_(s.choice_group), course: course });
  });
  Object.keys(picked).sort().forEach(function (k) {
    var n = cur[k].pickN, p = k.split('|');
    if (n > 0 && picked[k] > n) errors.push(p[0] + '학년 ' + p[1] + '학기 ' + p[2] + ' 묶음에서는 ' + n + '과목까지 고를 수 있습니다. 지금 ' + picked[k] + '과목입니다.');
  });
  var keep = {};
  rows.forEach(function (r) { keep[careerSlotKey_(r) + '|' + r.course] = true; });
  (existing || []).forEach(function (e) {
    if (e && ruleStr_(e.status) !== '취소' && ruleStr_(e.state) === '확정' && !keep[careerSlotKey_(e) + '|' + careerTxt_(e.course)]) {
      warnings.push('담당 선생님이 확인한 ' + ruleStr_(e.grade) + '학년 ' + ruleStr_(e.semester) + '학기 ' + careerTxt_(e.course) + ' 과목을 뺍니다. 바꾼 계획은 다시 확인을 받아야 합니다.');
    }
  });
  return { rows: errors.length ? [] : rows, errors: errors, warnings: warnings };
}

/**
 * 이수 계획 저장 계획(줄마다 취소 + 새 줄, 결정 99). existing = course_plans 행, studentId, rows = coursePlanCheck_().rows, termId(쓴 때의 운영 기간, 결정 97).
 * → {toAdd:[{term_id, student_id, entry_year, grade, semester, choice_group, course, state:'계획', show_to_parent, status:'유효'}], toCancel:[id], same:n}
 * - 같은 학년·학기·선택군·과목의 살아 있는(status 유효) 줄이 있으면 그대로(state 확정이면 확정 유지).
 * - 새로 고른 과목은 새 줄(state 계획), 빠진 과목의 줄은 취소(status 취소). 덮어쓰거나 지우지 않는다.
 * - 새 줄의 학부모 공개는 그 학생의 살아 있는 줄 중 하나라도 공개면 'TRUE'(ASSUMPTION: 이수 계획 공개는 계획 전체 단위로 이어받는다).
 */
function coursePlanDiff_(existing, studentId, rows, termId) {
  var sid = ruleStr_(studentId), live = (existing || []).filter(function (e) { return e && ruleStr_(e.student_id) === sid && ruleStr_(e.status) !== '취소'; });
  var key = function (r) { return careerSlotKey_(r) + '|' + careerTxt_(r.course); };
  var want = {}, have = {}, out = { toAdd: [], toCancel: [], same: 0 };
  (rows || []).forEach(function (r) { want[key(r)] = r; });
  var pub = live.some(function (e) { return s6True_(e.show_to_parent); }) ? 'TRUE' : 'FALSE';
  live.forEach(function (e) {
    var k = key(e);
    if (want[k] && !have[k]) { have[k] = true; out.same++; } else out.toCancel.push(ruleStr_(e.id));
  });
  Object.keys(want).forEach(function (k) {
    if (have[k]) return;
    var r = want[k];
    out.toAdd.push({ term_id: ruleStr_(termId), student_id: sid, entry_year: ruleStr_(r.entry_year), grade: ruleStr_(r.grade), semester: ruleStr_(r.semester),
      choice_group: ruleStr_(r.choice_group), course: careerTxt_(r.course), state: '계획', show_to_parent: pub, status: '유효' });
  });
  return out;
}

/**
 * 담당교사 확인(확정 표시, 결정 99). existing, studentId, ids(확인할 줄 id, 비우면 그 학생의 '계획' 줄 전부), teacherEmail, now.
 * → {patches:[{id, patch:{state:'확정', confirmed_by, confirmed_at}}], errors}. 취소된 줄·다른 학생 줄·이미 확정은 건너뛴다(이미 확정은 0건).
 */
function coursePlanConfirm_(existing, studentId, ids, teacherEmail, now) {
  var sid = ruleStr_(studentId), want = (ids || []).map(ruleStr_), at = ruleIso_(now);
  if (!ruleStr_(teacherEmail)) throw new Error('teacherEmail이 비어 있습니다');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(at)) throw new Error('now는 yyyy-MM-ddTHH:mm:ss여야 합니다: ' + now);
  var mine = (existing || []).filter(function (e) { return e && ruleStr_(e.student_id) === sid; });
  var errors = [];
  want.forEach(function (id) {
    var e = mine.filter(function (x) { return ruleStr_(x.id) === id; })[0];
    if (!e) errors.push('확인할 과목 줄을 찾지 못했습니다. 화면을 새로 불러와 주세요.');
    else if (ruleStr_(e.status) === '취소') errors.push(careerTxt_(e.course) + ' 줄은 학생이 바꿔 취소되었습니다. 화면을 새로 불러와 주세요.');
  });
  if (errors.length) return { patches: [], errors: errors };
  var patches = mine.filter(function (e) {
    return ruleStr_(e.status) !== '취소' && ruleStr_(e.state) === '계획' && (!want.length || want.indexOf(ruleStr_(e.id)) >= 0);
  }).map(function (e) { return { id: ruleStr_(e.id), patch: { state: '확정', confirmed_by: ruleStr_(teacherEmail).toLowerCase(), confirmed_at: at } }; });
  return { patches: patches, errors: [] };
}

/** 과목 이름 맞추기: opts.nameMap({옛 이름: 표준 이름}, course_name_map.csv)으로 바꾸고 공백 정리. */
function careerCourseName_(name, nameMap) {
  var n = careerTxt_(name);
  return (nameMap && Object.prototype.hasOwnProperty.call(nameMap, n)) ? careerTxt_(nameMap[n]) : n;
}

/**
 * 희망 학과의 권장 이수 과목(참고 자료, F15). recs = 권장 과목 행, targets = 진로 프로필 목표 진학 [{university, unit}],
 * opts = {baseYear(고정), nameMap}.
 * → [{university, unit, target:{university, unit}, match:'exact'|'partial', core:[], recommended:[], baseYear, sourceTitle, sourceUrl, note}]
 * - 대학 이름은 정확히 같아야 한다. 모집단위는 정확히 같은 것 → 없으면 서로 포함(부분 일치)하는 것 모두(판정하지 않고 후보로 보인다).
 * - 기준 연도가 여럿이면 그 대학의 가장 최근 연도만(opts.baseYear면 그 연도만).
 * - 과목 이름은 nameMap으로 표준 이름에 맞춘다. 같은 행이 두 목표에 걸리면 한 번만.
 */
function courseRecsFor_(recs, targets, opts) {
  var o = opts || {}, out = [], seen = {};
  var norm = function (s) { return careerTxt_(s).replace(/\s+/g, ''); };
  var split = function (s) { return ruleStr_(s).split(';').map(function (c) { return careerCourseName_(c, o.nameMap); }).filter(Boolean); };
  (targets || []).forEach(function (t) {
    var uni = careerTxt_((t || {}).university), unit = norm((t || {}).unit);
    if (!uni || !unit) return;
    var rows = (recs || []).filter(function (r) { return r && careerTxt_(r.university) === uni; });
    var year = o.baseYear ? ruleStr_(o.baseYear) : rows.reduce(function (m, r) { return ruleStr_(r.base_year) > m ? ruleStr_(r.base_year) : m; }, '');
    rows = rows.filter(function (r) { return ruleStr_(r.base_year) === year; });
    var exact = rows.filter(function (r) { return norm(r.unit) === unit; });
    var hit = exact.length ? exact : rows.filter(function (r) { var u = norm(r.unit); return u && (u.indexOf(unit) >= 0 || unit.indexOf(u) >= 0); });
    hit.forEach(function (r) {
      var k = [year, uni, careerTxt_(r.unit)].join('|');
      if (seen[k]) return;
      seen[k] = true;
      out.push({ university: uni, unit: careerTxt_(r.unit), target: { university: uni, unit: careerTxt_(t.unit) }, match: exact.length ? 'exact' : 'partial',
        core: split(r.core_courses), recommended: split(r.recommended_courses), baseYear: year, sourceTitle: ruleStr_(r.source_title), sourceUrl: ruleStr_(r.source_url), note: ruleStr_(r.note) });
    });
  });
  return out;
}
