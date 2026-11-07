/**
 * 알림 메일(C9a). 메일은 스크립트 소유자 계정에서 나간다(executeAs USER_DEPLOYING). docs/plan/stage2.md C9a.
 *
 * notifyMail_(toEmails, subject, body, actorEmail) → {notified, sent, failed}
 * - 락 밖에서만 부른다(저장을 끝낸 뒤). 메일이 실패해도 저장은 되돌리지 않는다. 오류는 삼키고 audit_log에만 남긴다.
 * - 본문에 학생 정보를 넣지 않는 것은 부르는 쪽 책임이다(날짜·조·이름 정도만).
 * - Script Property MAIL_ENABLED가 'true'일 때만 보낸다(꺼져 있으면 아무것도 안 하고 audit도 없다).
 * - @example.com 가짜 주소는 늘 뺀다. 보내기 전에 남은 하루 한도(받는 사람 수 기준)를 보고, 모자라면 보내지 않고 audit notify:quota.
 * - notified = 모두 보냈다. false이면 화면이 "상대 선생님께 직접 알려 주세요"를 보여 준다.
 */
function notifyMail_(toEmails, subject, body, actorEmail) {
  var none = { notified: false, sent: 0, failed: 0 };
  if (PropertiesService.getScriptProperties().getProperty('MAIL_ENABLED') !== 'true') return none;
  var seen = {}, to = [];
  (toEmails || []).forEach(function (e) {
    var m = normalizeEmail_(e);
    if (!m || m.indexOf('@') < 1 || /@example\.com$/.test(m) || seen[m]) return;
    seen[m] = true;
    to.push(m);
  });
  if (!to.length) return none;
  var quota = -1;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { /* 한도를 못 읽으면 보내지 않는다 */ }
  if (!(quota >= to.length)) {
    notifyAudit_('notify:quota', '받는 사람 ' + to.length + '명, 남은 한도 ' + quota, actorEmail);
    return none;
  }
  var sent = 0, failed = 0;
  to.forEach(function (addr) {
    try { MailApp.sendEmail(addr, subject, body); sent++; } catch (e) { failed++; }
  });
  if (failed) notifyAudit_('notify:failed', '받는 사람 ' + to.length + '명 중 ' + failed + '명 실패', actorEmail);
  return { notified: failed === 0 && sent > 0, sent: sent, failed: failed };
}

/** 알림 실패 기록: logDenied_처럼 짧은 락으로, 기록이 실패해도 예외를 내지 않는다(이메일은 적지 않는다) */
function notifyAudit_(action, detail, actorEmail) {
  try {
    withLock_(function () { writeAudit_('-', '', action, null, null, actorEmail || '(알 수 없음)', 'db', detail); }, 2000);
  } catch (e) {
    console.warn('알림 기록 생략: ' + e.message);
  }
}
