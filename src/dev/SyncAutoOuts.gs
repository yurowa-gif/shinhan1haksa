/**
 * 편집기에서만 실행(소유자): 한 운영 기간의 특이사항 전체를 읽어 자동 OUT을 맞춘다(2단계 F4를 처음 연결했을 때 쌓인 확정 건을 한꺼번에 만든다).
 * 메일은 보내지 않는다. 스냅숏(AUTO_OUT_SINCE)은 화면에서 확정할 때와 같은 것을 쓰므로, 설정을 넓히기 전에 확정된 건에는 OUT이 생기지 않는다.
 */
function syncAutoOutsAll(termId) {
  var owner = assertOwnerRun_();
  var terms = readAll_('terms');
  var term = termId ? terms.filter(function (t) { return t.id === String(termId); })[0] : getCurrentTerm_();
  if (!term) throw new Error('운영 기간을 찾을 수 없습니다.');
  return withLock_(function () {
    var settings = excSettings_(readAll_('settings', 'config'));
    var since = vioAutoSince_(settings.autoOut, nowIso_());
    var r = vioSyncAuto_(term, [], owner, since);
    return { term: term.name, created: r.created, canceled: r.canceled, updated: r.updated };
  });
}
