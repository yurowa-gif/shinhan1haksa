/**
 * 상태(학사·기숙사·석식…) 판정을 실행 하나 없이: statusOn(sid, item, ymd).
 * env.as(…, c => c.statusOn_(c.readAll_('status_changes'), …))는 부를 때마다 앱 전체를 새 컨텍스트에 올린다.
 * 180명 × 여러 날을 거르면 수천 번이 되고, 그 컨텍스트들이 V8 호출 지점 캐시에 붙잡혀 힙 2GB 한도에 닿았다(리허설이 가끔 죽던 원인).
 * 여기서는 status_changes를 앱의 readAll_로 한 번 읽어 두고(시트가 바뀌면 다시), 규칙 함수만 한 번 올린 컨텍스트에서 부른다.
 */
const { loadGs, plain } = require('./harness');

const rules = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs']);

function statusReader(env, who) {
  let sig = null, rows = null;
  const current = () => {
    const s = JSON.stringify(env.sheetValues('status_changes'));
    if (s !== sig) { sig = s; rows = plain(env.as(who || env.owner, (c) => c.readAll_('status_changes'))); }
    return rows;
  };
  return (sid, item, ymd) => rules.statusOn_(current(), sid, item, ymd);
}

module.exports = { statusReader };
