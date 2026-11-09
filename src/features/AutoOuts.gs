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
function vioSyncAuto_(term, studentIds, actorEmail, since) {
  var vsheet = termSheetName_('violations', term.id), esheet = termSheetName_('exceptions', term.id);
  var missing = vioTabMissing_(term);
  invalidate_('db', esheet); invalidate_('db', vsheet); invalidate_('db', 'violation_rules');
  var ex = excRows_(term).rows;
  var violations = missing ? [] : readAll_(vsheet);
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
  var createdBy = {};
  plan.toCreate.forEach(function (d) {
    appendRecord_(vsheet, d, actorEmail);
    createdBy[d.student_id] = (createdBy[d.student_id] || []).concat([d]);
    res.created++;
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

/** 락 밖: 자동 OUT 알림 메일(학생 이름·사유 없음). 메일이 안 가도 예외 없이 {sent, failed}만 돌려준다 */
function vioSendAutoMail_(mails, actorEmail) {
  var link = '';
  try { link = ScriptApp.getService().getUrl(); } catch (e) { link = ''; }
  var notified = true;
  (mails || []).forEach(function (m) {
    try { if (m.to.length && !notifyMail_(m.to, '[신한1학사] OUT 알림', m.body + (link ? '\n\n' + link : ''), actorEmail).notified) notified = false; } catch (e) { notified = false; console.warn('자동 OUT 알림 실패: ' + e.message); }
  });
  return notified;
}

/**
 * 락 안에서 쓰기 뒤에 부르는 한 줄 도우미: 맞추기를 시도하고 실패해도 원래 저장은 유지한다.
 * → {out:{created, canceled, level}, mails} 또는 {out:{error}, mails:[]}
 */
function vioAfterExceptionWrite_(term, studentIds, actorEmail, since) {
  try {
    var r = vioSyncAuto_(term, studentIds, actorEmail, since);
    return { out: { created: r.created, canceled: r.canceled, level: r.level }, mails: r.mails };
  } catch (e) {
    console.error('자동 OUT 맞추기 실패: ' + e.message);
    return { out: { error: '자동 OUT을 맞추지 못했습니다. 관리자에게 알려 주세요.' }, mails: [] };
  }
}
