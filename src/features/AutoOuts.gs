/**
 * F1 → 자동 1OUT(2단계 C12, CODING-A). 전역 이름 접두어 vio. docs/plan/stage2.md C12.
 * 규칙은 R5 reconcileAutoOuts_·R9 outAutoSinceNext_(src/rules/OutRules.gs)가 정하고, 여기는 읽어 와서 결과를 시트에 쓴다.
 * 세 함수(saveException·confirmException·cancelException)는 락 안 쓰기 전에 vioAutoSince_를, 쓴 뒤에 vioSyncAuto_를 부르고,
 * 락이 끝난 뒤 vioSendAutoMail_로 알림을 보낸다(Q6). 메일이 안 가도 저장은 되돌리지 않는다.
 */

var VIO_AUTO_DEFAULT_TYPES = ['미인정지각', '미인정조퇴', '미인정결석'];

/**
 * 설정으로 새로 자동 대상이 된 유형의 시작 시각(since). 스냅숏(스크립트 속성 AUTO_OUT_SINCE)을 갱신한다 — 락 안, 특이사항을 쓰기 전에 부른다.
 * now는 confirmed_at에 쓰는 바로 그 값(넓힌 직후 첫 확정 1건에는 OUT이 생기게).
 */
function vioAutoSince_(autoTypes, now) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('AUTO_OUT_SINCE'), snap = null;
  if (raw) { try { snap = JSON.parse(raw); } catch (e) { snap = null; } }
  // 모양이 틀리면(손으로 고친 값 등) 없는 것으로 본다
  if (snap && !(typeof snap === 'object' && Array.isArray(snap.types) && snap.since && typeof snap.since === 'object' && !Array.isArray(snap.since))) snap = null;
  var r = outAutoSinceNext_(snap, autoTypes, now, VIO_AUTO_DEFAULT_TYPES);
  if (r.changed) props.setProperty('AUTO_OUT_SINCE', JSON.stringify(r.snapshot));
  return r.since;
}

/** 날짜별 그날 근무교사 이메일(배열). 근무표를 못 읽으면 빈 값 */
function vioDutyByDate_(dates) {
  var out = {}, rows = [];
  try { rows = readAll_('duty_slots'); } catch (e) { return out; }
  dates.forEach(function (d) {
    if (!ymdIsValid_(d) || out[d]) return;
    out[d] = dutyOn_(rows, d).duty.map(function (x) { return x.email; });
  });
  return out;
}

/**
 * 그 기간의 특이사항·OUT을 맞춘다(락 안). 학생을 좁히면(studentIds) 그 학생만, 빈 값이면 기간 전체.
 * → {created, canceled, updated, mails:[{to, body}], level:{studentId:{count,label}}}  (메일은 락 밖에서 vioSendAutoMail_로)
 */
function vioSyncAuto_(term, studentIds, actorEmail, since, touchedGroups) {
  var vsheet = termSheetName_('violations', term.id), esheet = termSheetName_('exceptions', term.id);
  var missing = vioTabMissing_(term);
  invalidate_('db', esheet); invalidate_('db', vsheet); invalidate_('db', 'violation_rules');
  var exr = excRows_(term);
  var violations = missing ? [] : readAll_(vsheet);
  // 특이사항 탭이 없거나 이름이 바뀌었으면 아무것도 바꾸지 않는다(연결이 끊긴 것으로 보고 자동 OUT을 모두 취소하면, 탭을 되돌릴 때 새 id로 다시 생겨 면담 연결(결정 51)이 끊긴다)
  if (exr.missing) {
    if (violations.some(function (v) { return ruleRowLive_(v) && String(v.source) === 'F1자동'; })) throw new Error('그 기간의 특이사항 탭을 찾을 수 없어 자동 OUT을 맞추지 않았습니다. 시트를 확인해 주세요.');
    return { created: 0, canceled: 0, updated: 0, mails: [], level: {} };
  }
  var ex = exr.rows;
  var autoName = DEFAULT_VIOLATION_RULES[0][0];
  var rule = readAll_('violation_rules').filter(function (r) { return String(r.name).trim() === autoName; })[0];
  var settings = excSettings_(readAll_('settings', 'config'));
  var dates = [];
  ex.forEach(function (e) { dates.push(String(e.date).trim()); });
  violations.forEach(function (v) { dates.push(String(v.occurred_at).slice(0, 10)); });
  var opts = { autoTypes: settings.autoOut, ruleName: autoName, ruleId: rule ? rule.id : '', per: 'group', autoTypeSince: since, dutyByDate: vioDutyByDate_(dates) };
  if (studentIds && studentIds.length) opts.studentIds = studentIds;
  var plan = reconcileAutoOuts_(ex, violations, opts);
  var res = { created: 0, canceled: 0, updated: 0, mails: [], level: {} };
  if (!plan.toCreate.length && !plan.toCancel.length && !plan.toUpdate.length) return res;
  if (plan.toCreate.length && missing) ensureTermSheet_('violations', term.id);
  var createdBy = {}, groupOf = {};
  ex.forEach(function (e) { groupOf[String(e.id)] = String(e.group_id); });
  var touched = {};
  (touchedGroups || []).forEach(function (g) { touched[g] = true; });
  bulkAppend_(vsheet, plan.toCreate, actorEmail);   // 만든 행 id는 audit_log(bulk_create)에 남는다(결정 42)
  plan.toCreate.forEach(function (d) {
    res.created++;
    // 메일은 이번 호출이 저장·확정한 묶음에서 생긴 OUT만(처음 연결 때 쌓인 OUT은 알리지 않는다, 결정 49)
    if (touched[groupOf[String(d.source_exception_id)]]) createdBy[d.student_id] = (createdBy[d.student_id] || []).concat([d]);
  });
  var patches = [];
  plan.toCancel.forEach(function (c) { patches.push({ id: c.violationId, patch: { status: '취소', cancel_reason: c.reason } }); res.canceled++; });
  plan.toUpdate.forEach(function (u) { patches.push({ id: u.violationId, patch: u.patch }); res.updated++; });
  if (patches.length) bulkUpdateRecords_(vsheet, patches, actorEmail);
  invalidate_('db', vsheet);
  var all = readAll_(vsheet);
  var students = readAll_('students'), enr = readAll_('enrollments'), users = readAll_('users');
  var sById = {};
  students.forEach(function (s) { sById[s.id] = s; });
  Object.keys(createdBy).forEach(function (sid) {
    var after = outLevel_(all, sid, term.id).count, drafts = createdBy[sid];
    res.level[sid] = outLevel_(all, sid, term.id);
    var st = sById[sid], en = enr.filter(function (e) { return e.term_id === term.id && e.student_id === sid; })[0];
    if (!st || !en) return;
    var to = vioNotifyTo_(users, en, st, Math.max(0, after - drafts.length), after, actorEmail);
    var d = String(drafts[0].occurred_at).slice(0, 10);
    res.mails.push({ to: to, body: [vioDayKo_(d) + ' ' + autoName + ' OUT이 사전 특이사항에서 자동으로 기록되었습니다.',
      vioPeriodWord_(term) + ' ' + after + 'OUT' + (after >= 2 ? '(퇴실 대상)' : '') + '입니다.', '자세한 내용은 앱에서 확인해 주세요.'].join('\n') });
  });
  return res;
}

/**
 * 락 밖: 자동 OUT 알림 메일(학생 이름·사유 없음). 메일이 안 가도 예외 없이 끝난다.
 * → {notified, warn}: warn은 메일이 켜져 있고 보내려다 실패했거나 한도가 모자랄 때만(꺼져 있거나 받을 사람이 없으면 경고 아님)
 */
function vioSendAutoMail_(mails, actorEmail) {
  var link = '';
  try { link = ScriptApp.getService().getUrl(); } catch (e) { link = ''; }
  var enabled = PropertiesService.getScriptProperties().getProperty('MAIL_ENABLED') === 'true';
  var notified = true, warn = false;
  (mails || []).forEach(function (m) {
    if (!m.to.length) return;
    try {
      var r = notifyMail_(m.to, '[신한1학사] OUT 알림', m.body + (link ? '\n\n' + link : ''), actorEmail);
      if (r.notified) return;
      notified = false;
      if (!enabled) return;
      if (r.failed > 0) { warn = true; return; }
      var quota = -1;
      try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { quota = -1; }
      if (quota < 0 || quota < m.to.length) warn = true;   // 한 통도 시도하지 않았고 한도가 모자람
    } catch (e) { notified = false; if (enabled) warn = true; console.warn('자동 OUT 알림 실패: ' + e.message); }
  });
  return { notified: notified, warn: warn };
}

/**
 * 락 안에서 쓰기 뒤에 부르는 한 줄 도우미: 맞추기를 시도하고 실패해도 원래 저장은 유지한다.
 * → {out:{created, canceled, level}, mails} 또는 {out:{error}, mails:[]}
 */
function vioAfterExceptionWrite_(term, studentIds, actorEmail, since, touchedGroups) {
  try {
    var r = vioSyncAuto_(term, studentIds, actorEmail, since, touchedGroups);
    return { out: { created: r.created, canceled: r.canceled, level: r.level }, mails: r.mails };
  } catch (e) {
    console.error('자동 OUT 맞추기 실패: ' + e.message);
    return { out: { error: '특이사항은 저장했지만 1OUT을 기록하지 못했습니다. 관리자에게 알려 주세요(시트 소유자가 편집기에서 syncAutoOutsAll을 실행하면 맞춰집니다).' }, mails: [] };
  }
}
