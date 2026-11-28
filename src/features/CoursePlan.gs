/**
 * C51 F15 이수 계획 + 권장 이수 과목 보기(결정 99·102·104). 규칙은 src/rules(CareerRules R25·Stage6Rules R24)에 있고 여기서는 시트를 읽고 쓰기만 한다.
 *  - 학생: 편제표(curriculum_courses의 살아 있는 줄)에서 학기·선택군별로 과목을 고른다(택N 초과 막기, coursePlanCheck_). 바꾸면 그 과목 줄은 취소 + 새 줄(coursePlanDiff_, 결정 99).
 *    학부모 공개는 과목 줄마다 학생이 고른다(기본 비공개, 체크하는 순간 저장). 학사생이 아니게 된 뒤에는 보기만(결정 97).
 *  - 학사 담당교사: '계획' 줄을 확인(확정) 표시(coursePlanConfirm_, 지금 담당만 — plan.confirm). 담임·관리자·다른 교사는 보기만.
 *  - 학부모: 자녀가 켠 과목 줄만. 권장 이수 과목(참고)·피드백은 학부모에게 보이지 않는다(판정표 recs·feedback).
 *  - 권장 이수 과목(courseRecsFor_): 가장 최근 진로 프로필의 목표 진학에 맞는 줄을 참고로(판단하지 않는다). 학생·교사 응답에만 담긴다.
 * 응답에는 s6Visible_ + s6Pick_가 돌려준 칸만 담는다. 신원은 portalWho_ 한 곳.
 * ASSUMPTION: 학생의 입학년도 = (그 운영 기간이 속한 학년도) - 학년 + 1. 학년도는 3월에 시작한다(기간 시작일이 1~2월이면 전 해). FakeStage6도 같은 식.
 * ASSUMPTION: 이수 계획 피드백은 학생 단위 한 칸이다. 쓸 때의 살아 있는 과목 줄 하나를 target_id로 남기고, 보일 때는 줄이 취소돼도 그 학생의 이수 계획 피드백을 모두 보인다.
 * ASSUMPTION: 선택군이 비어 있는 과목(필수)은 고르는 것이 아니라 화면에 '꼭 듣는 과목'으로만 알리고 course_plans에 쓰지 않는다.
 */

function cpLoad_() {
  var d = carLoad_();
  d.plans = readAll_('course_plans');
  return d;
}

/** 운영 기간이 속한 학년도(3월 시작) */
function cpSchoolYear_(term) {
  var s = term ? ruleStr_(term.start_date) : today_();
  var y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  return m >= 3 ? y : y - 1;
}

function cpEntryYear_(student, term) { return String(cpSchoolYear_(term) - Number(student.grade) + 1); }

function cpLivePlans_(d, sid) {
  return d.plans.filter(function (p) { return p.student_id === sid && ruleStr_(p.status) !== '취소'; });
}

/** 권장 이수 과목 줄(참고): 가장 최근 진로 프로필의 목표 진학마다. 학생·교사만(판정표 recs) */
function cpRecs_(d, viewer, sid) {
  var cols = s6Visible_(viewer, 'recs', {});
  if (!cols.length) return { cols: [], list: [], hasTargets: false };
  var prof = careerLatest_(d.profiles, sid), targets = prof ? carJson_(prof.targets) : [];
  var found = courseRecsFor_(recommendationRows_(), targets, { nameMap: CUR_NAME_MAP });
  return { cols: cols, hasTargets: targets.length > 0, targets: targets, list: found.map(function (r) {
    var p = s6Pick_(r, cols);
    p.matchedUnit = r.target.unit;
    return p;
  }) };
}

/** 과목 이름 → '핵심 권장' | '권장' (목표 학과가 권하는 과목에만) */
function cpRecTags_(list) {
  var tag = {};
  (list || []).forEach(function (r) {
    (r.recommended || []).forEach(function (c) { tag[c] = '권장'; });
    (r.core || []).forEach(function (c) { tag[c] = '핵심 권장'; });
  });
  return tag;
}

/** 편제표 → 학기마다 [{grade, semester, required:[과목], groups:[{choiceGroup, pickN, courses:[과목]}]}] */
function cpOptions_(cur) {
  var by = {}, order = [];
  cur.forEach(function (c) {
    var k = ruleStr_(c.grade) + '|' + ruleStr_(c.semester);
    if (!by[k]) { by[k] = { grade: ruleStr_(c.grade), semester: ruleStr_(c.semester), required: [], groups: [], g: {} }; order.push(k); }
    var s = by[k], name = careerTxt_(c.course), group = ruleStr_(c.choice_group);
    if (!group) { s.required.push(name); return; }
    if (!s.g[group]) { s.g[group] = { choiceGroup: group, pickN: Number(ruleStr_(c.pick_n)) || 0, courses: [] }; s.groups.push(s.g[group]); }
    s.g[group].courses.push(name);
  });
  return order.sort().map(function (k) { var s = by[k]; delete s.g; return s; });
}

/**
 * 화면 시작값. role = 'student'|'parent'|'hall_teacher'|'homeroom'|'admin'(없으면 가진 역할 중 첫 번째).
 * 학생 → {mode:'student', student, active, ready(우리 학년 교육과정이 올라와 있나)} / 학부모 → {mode:'parent', children} /
 * 교사·관리자 → {mode:'staff', role, total, pending(확인할 학생 수), list:[{id, label, picked, pending, state:'확인'|'확정'|'안 고름', line}]}
 */
function getCoursePlanContext(role) {
  var user = requirePermission_('home.view', { role: carRoleFor_(role) });
  var r = carRoleFor_(role), d = cpLoad_(), term = getCurrentTerm_(), today = today_();
  if (r === 'student') {
    var sid = portalWho_().studentId, me = d.students.filter(function (s) { return s.id === sid; })[0];
    if (!me) return { ok: false, reason: '학생 명단에서 내 계정을 찾지 못했습니다. 담당 선생님께 알려 주세요.' };
    return { ok: true, mode: 'student', student: { id: me.id, name: me.name, label: carStudentLabel_(me) }, active: carActive_(d, sid, today),
      ready: curriculumRows_(cpEntryYear_(me, term)).length > 0 };
  }
  if (r === 'parent') {
    return { ok: true, mode: 'parent', children: d.students.filter(function (s) { return portalWho_().childIds.indexOf(s.id) >= 0; })
      .map(function (s) { return { id: s.id, name: s.name, label: s.grade + '학년 ' + s.class_no + '반' }; }) };
  }
  if (CAR_STAFF_ROLES.indexOf(r) < 0) return { ok: false, reason: '이 화면은 볼 수 있는 역할이 아닙니다.' };
  if (!term) return { ok: true, mode: 'staff', role: r, total: 0, pending: 0, list: [] };
  var enrolled = d.enrollments.filter(function (e) { return e.term_id === term.id; });
  var mine = enrolled.filter(function (e) {
    if (r === 'admin') return true;
    if (r === 'hall_teacher') return normalizeEmail_(e.teacher_email) === user.email;
    var st = d.students.filter(function (s) { return s.id === e.student_id; })[0];
    return !!st && sameClass_(user.homeroomClass, st.grade, st.class_no);
  }).map(function (e) { return e.student_id; });
  var list = d.students.filter(function (s) { return mine.indexOf(s.id) >= 0 && isActiveOn_(d.changes, carEnrollment_(d, s.id, term.id), today); }).sort(byClassNumber_).map(function (s) {
    var live = cpLivePlans_(d, s.id), pend = live.filter(function (p) { return ruleStr_(p.state) === '계획'; }).length;
    var state = !live.length ? '안 고름' : pend ? '확인' : '확정';
    return { id: s.id, label: excDisplay_(s), picked: live.length, pending: pend, state: state,
      line: state === '안 고름' ? '아직 고른 과목이 없습니다' : live.length + '과목 · ' + (pend ? '확인할 것 ' + pend : '모두 확정') };
  });
  list.sort(function (a, b) { var o = { '확인': 0, '확정': 1, '안 고름': 2 }; return o[a.state] - o[b.state]; });
  return { ok: true, mode: 'staff', role: r, total: list.length, pending: list.filter(function (s) { return s.pending; }).length, list: list };
}

/**
 * 한 학생의 이수 계획(보는 사람에 맞는 칸만).
 * → {ok, student, viewer:{role}, entryYear, semesters:[{grade, semester, rows:[…]}], options(학생만, 고르기 화면용), recs, feedback, canWrite, canConfirm, active}
 * 학부모는 자녀가 켠 줄만(상태 꼬리표 포함), 권장 과목·피드백·옵션은 없다.
 */
function getCoursePlanStudent(studentId) {
  var user = requirePermission_('plan.view', { studentId: studentId });
  var sid = String(studentId), d = cpLoad_(), term = getCurrentTerm_(), today = today_();
  var st = d.students.filter(function (s) { return s.id === sid; })[0];
  if (!st) throw new Error('학생을 찾을 수 없습니다.');
  var entry = cpEntryYear_(st, term), active = carActive_(d, sid, today);
  var head = { id: st.id, name: st.name, title: st.grade + '. ' + st.name, label: carStudentLabel_(st), entryYear: entry };
  var base = carViewer_(user, d, sid, term ? term.id : '');
  var cur = curriculumRows_(entry), dropped = {};
  careerDroppedPicks_(cpLivePlans_(d, sid), curriculumRows_()).forEach(function (x) { dropped[x.planId] = true; });
  var pickN = {};
  cur.forEach(function (c) { pickN[careerSlotKey_(c)] = Number(ruleStr_(c.pick_n)) || 0; });
  var rows = cpLivePlans_(d, sid).map(function (p) {
    var v = carViewer_(user, d, sid, p.term_id), fields = s6Visible_(v, 'plan', p);
    var out = s6Pick_(p, fields);
    if (!out) return null;
    if (v.role !== 'parent') { out.dropped = !!dropped[p.id]; out.pickN = pickN[careerSlotKey_(p)] || 0; }
    return out;
  }).filter(Boolean);
  var sems = {}, keys = [];
  rows.forEach(function (r) {
    var k = r.grade + '|' + r.semester;
    if (!sems[k]) { sems[k] = { grade: r.grade, semester: r.semester, rows: [] }; keys.push(k); }
    sems[k].rows.push(r);
  });
  var out = { ok: true, student: head, viewer: { role: base.role }, entryYear: entry, semesters: keys.sort().map(function (k) { return sems[k]; }), active: active };
  if (base.role === 'parent') return out;
  var recs = cpRecs_(d, base, sid), tags = cpRecTags_(recs.list);
  out.recs = { list: recs.list, hasTargets: recs.hasTargets };
  out.canWrite = s6CanWrite_(base, 'plan.edit', { active: active }).ok;
  out.canConfirm = s6CanWrite_(base, 'plan.confirm', { active: active }).ok;
  out.ready = cur.length > 0;
  if (base.role === 'student' || base.role === 'assigned' || base.role === 'admin' || base.role === 'homeroom') {
    out.options = cpOptions_(cur).map(function (s) {
      s.groups.forEach(function (g) { g.tags = g.courses.map(function (c) { return tags[c] || ''; }); });
      s.requiredTags = s.required.map(function (c) { return tags[c] || ''; });
      return s;
    });
  }
  out.feedback = cpFeedback_(d, user, sid);
  return out;
}

/** 이수 계획 피드백(학생 단위) — 보는 사람의 판정표 칸만. 보일 때는 대상 줄이 취소돼도 모두 보인다 */
function cpFeedback_(d, user, sid) {
  return readAll_('feedback').filter(function (f) { return f.student_id === sid && f.target_kind === '이수 계획' && ruleStr_(f.status) !== '취소'; })
    .sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : -1; })
    .map(function (f) {
      var p = s6Pick_(f, s6Visible_(carViewer_(user, d, sid, f.term_id), 'feedback', f), { teacherName: carUserName_(d, f.teacher_email) });
      if (!p) return null;
      var out = { id: f.id };
      if ('content' in p) out.content = p.content;
      if ('teacher_name' in p) out.teacherName = p.teacher_name;
      else if ('teacher_email' in p) out.teacherName = carUserName_(d, f.teacher_email);
      if ('created_at' in p) out.at = String(f.created_at || '');
      if ('teacher_email' in p) out.mine = normalizeEmail_(f.teacher_email) === user.email;
      return out;
    }).filter(Boolean);
}

function cpFail_(errors) { return carFail_(errors); }

/**
 * 이수 계획 저장(학생 본인). selections = [{grade, semester, choice_group, course}] — 고른 과목 전체(덜 고른 채 저장해도 된다).
 * 편제·택N 검사는 coursePlanCheck_, 저장 계획은 coursePlanDiff_(바꾸면 줄마다 취소 + 새 줄). 락 안에서 다시 읽고 판정한다.
 * → {ok:true, added, cancelled, same, warnings} | {ok:false, errors}
 */
function saveCoursePlan(selections) {
  var user = requirePermission_('plan.edit', { studentId: portalWho_().studentId });
  var sid = portalWho_().studentId;
  if (!sid) return cpFail_('학생 명단에서 내 계정을 찾지 못했습니다.');
  return withLock_(function () {
    var d = cpLoad_(), term = getCurrentTerm_(), today = today_();
    if (!term) return cpFail_('지금은 운영 기간이 아니라 고를 수 없습니다.');
    var st = d.students.filter(function (s) { return s.id === sid; })[0];
    var w = s6CanWrite_({ role: 'student', isSelf: true }, 'plan.edit', { active: carActive_(d, sid, today) });
    if (!w.ok) return cpFail_(w.reason);
    var entry = cpEntryYear_(st, term), live = cpLivePlans_(d, sid);
    var chk = coursePlanCheck_(curriculumRows_(entry), entry, Array.isArray(selections) ? selections : [], live);
    if (chk.errors.length) return cpFail_(chk.errors);
    var plan = coursePlanDiff_(d.plans, sid, chk.rows, term.id);
    bulkAppend_('course_plans', plan.toAdd.map(function (r) { return Object.assign({ confirmed_by: '', confirmed_at: '', cancel_reason: '' }, r); }), user.email);
    bulkUpdateRecords_('course_plans', plan.toCancel.map(function (id) { return { id: id, patch: { status: '취소', cancel_reason: '학생이 과목을 바꿈' } }; }), user.email);
    return { ok: true, added: plan.toAdd.length, cancelled: plan.toCancel.length, same: plan.same, warnings: chk.warnings };
  });
}

/** '부모님께 보이기' 켜고 끄기(학생 본인, 과목 줄마다). → {ok, notice} | {ok:false, errors}. 끄면 안내(결정 92). audit_log에 바뀐 값 */
function setCoursePlanPublish(planId, show) {
  var user = requirePermission_('plan.publish', { studentId: portalWho_().studentId });
  var sid = portalWho_().studentId;
  return withLock_(function () {
    var d = cpLoad_();
    var row = d.plans.filter(function (p) { return p.id === String(planId); })[0];
    if (!row || row.student_id !== sid || ruleStr_(row.status) === '취소') return cpFail_('과목 줄을 찾을 수 없습니다. 화면을 새로 불러와 주세요.');
    var w = s6CanWrite_({ role: 'student', isSelf: true }, 'plan.edit', { active: carActive_(d, sid, today_()) });
    if (!w.ok) return cpFail_(w.reason);
    var next = show === true || show === 'TRUE' ? 'TRUE' : 'FALSE', was = s6True_(row.show_to_parent);
    if (was !== (next === 'TRUE')) updateRecord_('course_plans', row.id, { show_to_parent: next }, user.email);
    return { ok: true, notice: was && next === 'FALSE' ? '학부모님이 이미 보신 내용은 되돌릴 수 없습니다.' : '' };
  });
}

/**
 * 담당교사 확인(확정 표시). ids = 확인할 줄 id(비우면 그 학생의 '계획' 줄 전부). 지금 담당 교사만(plan.confirm) — 락 안에서 기록의 기간으로 다시 판정한다.
 * → {ok:true, count} | {ok:false, errors}
 */
function confirmCoursePlan(studentId, ids) {
  var user = requirePermission_('plan.confirm', { studentId: studentId });
  return withLock_(function () {
    var d = cpLoad_(), sid = String(studentId), term = getCurrentTerm_();
    var w = s6CanWrite_(carViewer_(user, d, sid, term ? term.id : ''), 'plan.confirm', { active: carActive_(d, sid, today_()) });
    if (!w.ok) return cpFail_(w.reason);
    var res = coursePlanConfirm_(cpLivePlans_(d, sid), sid, Array.isArray(ids) ? ids : [], user.email, nowIso_());
    if (res.errors.length) return cpFail_(res.errors);
    bulkUpdateRecords_('course_plans', res.patches, user.email);
    return { ok: true, count: res.patches.length };
  });
}

/** 이수 계획 피드백 남기기(담당교사만, 학생 단위). content 1~1000자. → {ok} | {ok:false, errors} */
function addPlanFeedback(studentId, content) {
  var user = requirePermission_('feedback.write', { studentId: studentId });
  var text = ruleStr_(content).trim();
  if (!text) return cpFail_('피드백 내용을 적어 주세요.');
  if (text.length > CAREER_TEXT_MAX) return cpFail_('피드백은 ' + CAREER_TEXT_MAX + '자까지 적을 수 있습니다. 지금 ' + text.length + '자입니다.');
  return withLock_(function () {
    var d = cpLoad_(), sid = String(studentId), term = getCurrentTerm_();
    var live = cpLivePlans_(d, sid);
    if (!live.length) return cpFail_('아직 고른 과목이 없어 피드백을 남길 수 없습니다.');
    var target = live[live.length - 1];
    var w = s6CanWrite_(carViewer_(user, d, sid, target.term_id), 'feedback.write', { active: carActive_(d, sid, today_()) });
    if (!w.ok) return cpFail_(w.reason);
    appendRecord_('feedback', { term_id: term ? term.id : target.term_id, student_id: sid, target_kind: '이수 계획', target_id: target.id, content: text, teacher_email: user.email, status: '유효', cancel_reason: '' }, user.email);
    return { ok: true };
  });
}

/* ───────────── 홈 ───────────── */

/** 학사 교사 홈 숫자: 담당 학생 중 확인할 이수 계획(계획 줄이 있는) 학생 수(coursePlanPendingCount_). 담임·관리자 홈에는 없다 */
function cpHomeInfo_(user, role) {
  if (role !== 'hall_teacher') return null;
  var term = getCurrentTerm_();
  if (!term) return { pending: 0 };
  var d = cpLoad_(), today = today_();
  var ids = d.enrollments.filter(function (e) { return e.term_id === term.id && normalizeEmail_(e.teacher_email) === user.email && isActiveOn_(d.changes, e, today); }).map(function (e) { return e.student_id; });
  return { pending: coursePlanPendingCount_(d.plans, ids).count };
}
