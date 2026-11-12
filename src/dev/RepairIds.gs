/**
 * 편집기에서만(소유자): 시트를 손으로 고쳐 생긴 '같은 id 두 줄'과 '빈 id' 행에 새 UUID를 준다(followups 공용 Db, #93).
 * #93 이후 findById_·updateRecord_·bulkUpdateRecords_는 중복·빈 id를 만나면 멈추고 안내하므로, 그 줄을 고치려면 먼저 이 함수로 id를 정리한다.
 *
 * repairDuplicateIds()      → 미리보기(dry-run): 어떤 탭·몇 행이 바뀌는지만 보여 주고 아무것도 쓰지 않는다. 인자를 비우면 늘 이쪽.
 * repairDuplicateIds(true)  → 실제 실행(true 하나만 인정, 'true'·1은 미리보기). 락 안에서 다시 찾아 고친다.
 *
 * - 같은 id가 여러 줄이면 가장 위 줄이 id를 지키고 아래 줄에 새 UUID를 준다(audit_log·다른 탭이 가리키던 id는 위 줄 것으로 남는다).
 * - 빈 id(공백만 있는 것 포함)는 다른 칸에 값이 있는 줄만 고친다(빈 줄은 건드리지 않는다).
 * - 행은 지우지 않고 시트 구조(탭·열)도 바꾸지 않는다. 고친 줄마다 audit_log에 'repair_id' 한 줄(옛 id·행 번호, 새 id)을 남긴다. 상담일지 파일의 내용 열은 읽지만 어디에도 복사하지 않는다.
 * - 이 id를 다른 탭이 칸 값으로 가리키는 경우(예: violations.rule_id)는 자동으로 고치지 않는다. 미리보기에서 보인 id가 그런 곳에 쓰이는지 확인한다.
 * 두 번 실행해도 두 번째는 바꿀 것이 없다.
 */
function repairDuplicateIds(apply) {
  var owner = assertOwnerRun_();
  var doApply = apply === true;
  if (!doApply) return rdiReport_(rdiScan_(), false);
  return withLock_(function () {
    var tabs = rdiScan_();
    var changes = [];
    tabs.forEach(function (t) {
      if (!t.changes.length) return;
      var sh = getSheet_(t.kind, t.tab);
      t.changes.forEach(function (c) {
        c.newId = Utilities.getUuid();
        sh.getRange(c.row, 1).setValue(c.newId);
        changes.push({ kind: t.kind, tab: t.tab, change: c });
      });
      invalidate_(t.kind, t.tab);
    });
    changes.forEach(function (x) {
      writeAudit_(x.tab, x.change.newId, 'repair_id', { id: x.change.oldId, row: x.change.row }, { id: x.change.newId, row: x.change.row }, owner, x.kind, x.change.reason);
    });
    return rdiReport_(tabs, true);
  });
}

/** 모든 데이터 파일의 탭에서 중복·빈 id 줄 찾기(읽기만) → [{kind, tab, scanned, changes:[{row, oldId, reason}]}] */
function rdiScan_() {
  var out = [];
  Object.keys(DB_FILES).forEach(function (kind) {
    if (!props_().getProperty(DB_FILES[kind].prop)) return;
    openFile_(kind).getSheets().forEach(function (sh) {
      var name = sh.getName();
      if (!(SCHEMA[kind] && SCHEMA[kind][name]) && !(kind === 'db' && termTabBase_(name))) return;
      var last = sh.getLastRow(), lastCol = sh.getLastColumn(), t = { kind: kind, tab: name, scanned: 0, changes: [] };
      out.push(t);
      if (last < 2 || lastCol < 1) return;
      if (cellToString_(sh.getRange(1, 1).getValue()) !== 'id') { t.note = '첫 열이 id가 아니라 건너뜀'; return; }
      var values = sh.getRange(2, 1, last - 1, lastCol).getValues(), seen = {};
      values.forEach(function (row, i) {
        var id = cellToString_(row[0]).trim(), hasData = row.some(function (v, k) { return k > 0 && cellToString_(v).trim() !== ''; });
        if (id === '' && !hasData) return;
        t.scanned++;
        if (id === '') { t.changes.push({ row: i + 2, oldId: '', reason: '빈 id' }); return; }
        if (seen[id]) { t.changes.push({ row: i + 2, oldId: id, reason: '같은 id가 ' + seen[id] + '행에도 있음' }); return; }
        seen[id] = i + 2;
      });
    });
  });
  return out;
}

function rdiReport_(tabs, applied) {
  var changed = tabs.filter(function (t) { return t.changes.length; });
  var count = changed.reduce(function (n, t) { return n + t.changes.length; }, 0);
  return {
    dryRun: !applied, applied: applied, count: count, scannedTabs: tabs.length,
    tabs: changed.map(function (t) {
      return { kind: t.kind, tab: t.tab, changes: t.changes.map(function (c) { return { row: c.row, oldId: c.oldId, newId: c.newId || (applied ? '' : '(실행하면 새로 만듭니다)'), reason: c.reason }; }) };
    }),
    message: count === 0 ? '같은 id·빈 id인 줄이 없습니다.'
      : (applied ? count + '줄에 새 id를 주었습니다(audit_log에 repair_id로 남음).' : '미리보기입니다. 아무것도 바꾸지 않았습니다. ' + count + '줄이 바뀝니다 — 실행하려면 repairDuplicateIds(true)를 실행하세요.')
  };
}
