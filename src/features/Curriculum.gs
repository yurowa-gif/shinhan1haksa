/**
 * S6-1 교육과정 올리기(결정 102, docs/plan/s6-0-design.md 8.1): 관리자가 편제표·권장 이수 과목을 구글 시트·CSV로 붙여 넣어 설정 스프레드시트에 올린다.
 * 명단 올리기(Roster.gs)와 같은 흐름 — 붙여넣기 → 미리 보기 → 저장. 붙여넣은 글을 표로 읽는 rosterParseText_(탭·쉼표·큰따옴표)를 그대로 쓴다.
 *
 * 규칙
 *  - 첫 줄은 열 이름이다(순서는 자유). 열 이름 = 탭의 열 이름 그대로: 편제표 entry_year·grade·semester·choice_group·pick_n·course,
 *    권장 과목 base_year·university·unit·core_courses·recommended_courses·source_url·source_title·note. data/course_recommendations/*.csv를 그대로 붙여 넣을 수 있다.
 *  - 오류가 한 줄이라도 있으면 아무것도 쓰지 않는다. 표준 과목 이름 표와 다른 이름은 **경고**만(저장을 막지 않는다 — 학교 편제표에 표에 없는 과목이 있을 수 있다).
 *  - 한 번에 한 입학년도(편제표)·기준 연도(권장 과목)만 올린다(screens.md 11절). 저장은 그 해의 유효 줄을 새 글과 맞춘다(총괄 확정):
 *    같은 줄은 그대로, 같은 자리(편제표: 학년·학기·선택군·과목 / 권장: 대학·모집단위)인데 내용이 바뀐 줄은 옛 줄 '취소' + 새 줄, 빠진 줄은 '취소', 새 줄은 추가(삭제 없음).
 *    락 안에서 다시 계산해 미리 볼 때와 개수가 다르면 거부한다(stale). audit_log에는 일괄 1줄(추가 id 목록)·취소 줄의 바뀐 칸이 남는다.
 *  - curPlan_은 R25(CareerRules, #312)가 순수 규칙 함수를 넣으면 그 함수로 바꾼다(자리표시: 같은 결과를 내는 계산).
 *  - 읽기(곧 만들 이수 계획 화면)는 curriculumRows_·recommendationRows_ 내부 함수.
 * ASSUMPTION: 편제표 같은 선택군의 pick_n은 줄마다 같아야 한다(다르면 오류). 선택군이 비면(필수 과목) pick_n은 비우거나 0.
 * 권장 과목에 대학·모집단위가 같은 줄이 여럿이면 뒤의 줄만 쓴다(경고, screens.md 11절). 출처 주소는 꼭 있어야 한다.
 */

var CUR_KINDS = {
  curriculum: { tab: 'curriculum_courses', label: '편제표', scope: 'entry_year',
    cols: ['entry_year', 'grade', 'semester', 'choice_group', 'pick_n', 'course'] },
  recommendations: { tab: 'course_recommendations', label: '권장 이수 과목', scope: 'base_year',
    cols: ['base_year', 'university', 'unit', 'core_courses', 'recommended_courses', 'source_url', 'source_title', 'note'] }
};
/** 한글 머리글 → 열 이름(공백 없이 비교). 영어 열 이름은 그대로 받는다(총괄 확정) */
var CUR_HEADER_KO = {
  '입학년도': 'entry_year', '학년': 'grade', '학기': 'semester', '선택군': 'choice_group', '택n': 'pick_n', '과목': 'course',
  '기준연도': 'base_year', '대학': 'university', '모집단위': 'unit', '핵심과목': 'core_courses', '핵심권장': 'core_courses',
  '권장과목': 'recommended_courses', '권장': 'recommended_courses', '출처주소': 'source_url', '출처제목': 'source_title', '비고': 'note'
};
var CUR_LIST_MAX = 30;
var CUR_WARN_MAX = 30;

function curKind_(kind) {
  if (!Object.prototype.hasOwnProperty.call(CUR_KINDS, String(kind))) throw new Error('올릴 자료의 종류를 골라 주세요.');
  return CUR_KINDS[String(kind)];
}

/** 표준 과목 이름이면 {ok:true}, 아니면 {ok:false, suggest: 표준 이름 또는 ''} */
function curStdCheck_(name) {
  if (CUR_STANDARD_COURSES.indexOf(name) >= 0) return { ok: true, suggest: '' };
  return { ok: false, suggest: Object.prototype.hasOwnProperty.call(CUR_NAME_MAP, name) ? CUR_NAME_MAP[name] : '' };
}

function curSig_(def, rec) { return def.cols.map(function (c) { return String(rec[c] === undefined || rec[c] === null ? '' : rec[c]); }).join('\u0001'); }

/** 순수: 열 이름 줄 검사 → {index:{열이름: 칸 번호}, errors} */
function curHeader_(def, row) {
  var index = {}, errors = [], dup = [];
  row.forEach(function (h, i) {
    var name = String(h).trim().toLowerCase();
    if (!name) return;
    var ko = CUR_HEADER_KO[name.replace(/\s+/g, '')];
    if (ko) name = ko;
    if (Object.prototype.hasOwnProperty.call(index, name)) dup.push(name); else index[name] = i;
  });
  var missing = def.cols.filter(function (c) { return !(c in index); });
  var unknown = Object.keys(index).filter(function (c) { return def.cols.indexOf(c) < 0; });
  if (missing.length || unknown.length || dup.length) {
    errors.push({ line: 1, column: '', message: '첫 줄의 열 이름이 맞지 않습니다.' + (missing.length ? ' 빠진 열: ' + missing.join(', ') + '.' : '') +
      (unknown.length ? ' 모르는 열: ' + unknown.join(', ') + '.' : '') + (dup.length ? ' 겹친 열: ' + dup.join(', ') + '.' : '') + ' 열 이름(한글 머리글도 됩니다): ' + def.cols.join(', ') });
  }
  return { index: index, errors: errors };
}

/** 순수: 한 줄 검사·정리 → {rec, errors:[{column, message}], names:[과목 이름]} */
function curRow_(kind, raw) {
  var errors = [], rec = {}, names = [];
  var err = function (column, message) { errors.push({ column: column, message: message }); };
  var str = function (c, max, required) {
    var v = String(raw[c] === undefined || raw[c] === null ? '' : raw[c]).trim().replace(/\s+/g, ' ');
    if (required && !v) err(c, '비어 있습니다.');
    else if (v.length > max) err(c, max + '자 안으로 적어 주세요.');
    return v;
  };
  if (kind === 'curriculum') {
    rec.entry_year = str('entry_year', 4, true);
    if (rec.entry_year && !/^(20)\d\d$/.test(rec.entry_year)) err('entry_year', '입학년도는 2027처럼 4자리 숫자로 적어 주세요.');
    rec.grade = str('grade', 1, true);
    if (rec.grade && ['1', '2', '3'].indexOf(rec.grade) < 0) err('grade', '학년은 1·2·3 중 하나입니다.');
    rec.semester = str('semester', 1, true);
    if (rec.semester && ['1', '2'].indexOf(rec.semester) < 0) err('semester', '학기는 1 또는 2입니다.');
    rec.choice_group = str('choice_group', 30, false);
    var pick = str('pick_n', 2, false);
    if (!rec.choice_group) {
      if (pick !== '' && pick !== '0') err('pick_n', '선택군이 비어 있으면(필수 과목) 택N은 비우거나 0으로 적어 주세요.');
      rec.pick_n = '0';
    } else if (!/^\d{1,2}$/.test(pick)) {
      err('pick_n', '택N "' + pick + '"은 숫자가 아닙니다. 2처럼 숫자로 적어 주세요.');
      rec.pick_n = pick;
    } else if (+pick < 1 || +pick > 20) {
      err('pick_n', '선택군이 있으면 택N은 1~20 숫자입니다.');
      rec.pick_n = pick;
    } else rec.pick_n = String(+pick);
    rec.course = str('course', 40, true);
    if (rec.course) names.push(rec.course);
  } else {
    rec.base_year = str('base_year', 4, true);
    if (rec.base_year && !/^(20)\d\d$/.test(rec.base_year)) err('base_year', '기준 연도는 2028처럼 4자리 숫자로 적어 주세요.');
    rec.university = str('university', 40, true);
    rec.unit = str('unit', 80, true);
    ['core_courses', 'recommended_courses'].forEach(function (c) {
      var list = String(raw[c] === undefined || raw[c] === null ? '' : raw[c]).split(';').map(function (x) { return x.trim().replace(/\s+/g, ' '); }).filter(Boolean);
      var seen = {}, out = [];
      list.forEach(function (n) {
        if (n.length > 40) err(c, '과목 이름은 40자 안으로 적어 주세요: ' + n.slice(0, 12) + '…');
        if (!seen[n]) { seen[n] = true; out.push(n); names.push(n); }
      });
      rec[c] = out.join(';');
      if (rec[c].length > 400) err(c, '과목이 너무 많습니다.');
    });
    rec.source_url = String(raw.source_url === undefined || raw.source_url === null ? '' : raw.source_url).trim();
    if (!rec.source_url) err('source_url', '출처 주소가 없습니다. 대학 발표 자료의 주소를 적어 주세요.');
    else if (rec.source_url.length > 300) err('source_url', '300자 안으로 적어 주세요.');
    else if (!/^https?:\/\//i.test(rec.source_url)) err('source_url', '출처 주소는 http:// 또는 https://로 시작해야 합니다.');
    rec.source_title = str('source_title', 200, false);
    rec.note = str('note', 600, false);
  }
  return { rec: rec, errors: errors, names: names };
}

/** 순수: 붙여넣은 글 → {recs:[{line, rec}], errors, warnings}. 줄 번호 = 붙여넣은 글의 줄(첫 줄 = 열 이름 = 1) */
function curParse_(kind, text) {
  var def = curKind_(kind);
  var t = rosterParseText_(text);
  if (t.errors.length) return { recs: [], errors: t.errors, warnings: [] };
  if (!t.rows.length) return { recs: [], errors: [{ line: 0, column: '', message: '붙여넣은 내용이 없습니다. 열 이름이 있는 첫 줄부터 붙여 넣어 주세요.' }], warnings: [] };
  var head = curHeader_(def, t.rows[0]);
  if (head.errors.length) return { recs: [], errors: head.errors, warnings: [] };
  var errors = [], warnings = [], recs = [], nameLines = {}, nameOrder = [], seen = {}, keyFirst = {};
  t.rows.slice(1).forEach(function (row, i) {
    var line = i + 2;
    if (row.every(function (c) { return c === ''; })) return;
    if (row.length > Object.keys(head.index).length && row.slice(Object.keys(head.index).length).some(function (c) { return c !== ''; })) {
      errors.push({ line: line, column: '', message: '칸이 열 이름보다 많습니다. 칸 안에 쉼표나 탭이 있으면 큰따옴표로 감싸 주세요.' });
      return;
    }
    var raw = {};
    def.cols.forEach(function (c) { raw[c] = row[head.index[c]]; });
    var r = curRow_(kind, raw);
    r.errors.forEach(function (e) { errors.push({ line: line, column: e.column, message: e.message }); });
    if (r.errors.length) return;
    r.names.forEach(function (n) {
      if (!nameLines[n]) { nameLines[n] = []; nameOrder.push(n); }
      nameLines[n].push(line);
    });
    if (kind === 'curriculum') {
      var ck = [r.rec.entry_year, r.rec.grade, r.rec.semester, r.rec.choice_group, r.rec.course].join('\u0001');
      if (seen[ck]) { errors.push({ line: line, column: 'course', message: '과목 "' + r.rec.course + '"이 ' + r.rec.grade + '학년 ' + r.rec.semester + '학기 ' + (r.rec.choice_group || '필수') + '에 두 번 있습니다(' + seen[ck] + '·' + line + '번째 줄). 한 줄을 지워 주세요.' }); return; }
      seen[ck] = line;
    } else {
      var key = r.rec.base_year + '\u0001' + r.rec.university + '\u0001' + r.rec.unit;
      if (keyFirst[key]) keyFirst[key].push(line); else keyFirst[key] = [line];
    }
    recs.push({ line: line, rec: r.rec });
  });
  if (!errors.length && !recs.length) errors.push({ line: 0, column: '', message: '올릴 줄이 없습니다. 열 이름 아래에 내용을 붙여 넣어 주세요.' });
  var yset = {};
  recs.forEach(function (x) { yset[x.rec[def.scope]] = true; });
  var ylist = Object.keys(yset).sort();
  if (ylist.length > 1) errors.push({ line: 0, column: def.scope, message: (kind === 'curriculum' ? '입학년도' : '기준 연도') + '가 ' + ylist.length + '가지(' + ylist.join(', ') + ') 섞여 있습니다. 한 번에 한 ' + (kind === 'curriculum' ? '입학년도' : '기준 연도') + '만 올려 주세요.' });
  if (kind === 'curriculum') {
    var picks = {}, gsize = {};
    recs.forEach(function (x) {
      if (!x.rec.choice_group) return;
      var gk = [x.rec.entry_year, x.rec.grade, x.rec.semester, x.rec.choice_group].join('\u0001');
      gsize[gk] = (gsize[gk] || 0) + 1;
      if (picks[gk] === undefined) picks[gk] = { n: x.rec.pick_n, line: x.line, lines: [x.line], group: x.rec.choice_group };
      else if (picks[gk].n !== x.rec.pick_n) errors.push({ line: x.line, column: 'pick_n', message: picks[gk].line + '·' + x.line + '번째 줄: 선택군 ' + x.rec.choice_group + '의 택N이 줄마다 다릅니다. 같은 선택군은 같은 수로 적어 주세요.' });
    });
    Object.keys(picks).forEach(function (gk) {
      if (/^\d+$/.test(picks[gk].n) && +picks[gk].n > gsize[gk]) errors.push({ line: picks[gk].line, column: 'pick_n', message: '선택군 ' + picks[gk].group + '는 과목이 ' + gsize[gk] + '개인데 택N이 ' + picks[gk].n + '입니다.' });
    });
  } else {
    var multi = Object.keys(keyFirst).filter(function (k) { return keyFirst[k].length > 1; });
    if (multi.length) {
      var drop = {};
      multi.forEach(function (k) { keyFirst[k].slice(0, -1).forEach(function (ln) { drop[ln] = true; }); });
      recs = recs.filter(function (x) { return !drop[x.line]; });
      warnings.unshift('대학·모집단위가 같은 줄이 ' + multi.length + '쌍 있습니다(' + multi.slice(0, 3).map(function (k) { var q = k.split('\u0001'); return q[1] + ' ' + q[2] + ' ' + keyFirst[k].join('·') + '번째 줄'; }).join(', ') + (multi.length > 3 ? ' 외 ' + (multi.length - 3) + '쌍' : '') + '). 뒤의 줄만 쓰입니다.');
    }
  }
  var odd = nameOrder.filter(function (n) { return !curStdCheck_(n).ok; });
  odd.slice(0, CUR_WARN_MAX).forEach(function (n) {
    var s = curStdCheck_(n).suggest, ls = nameLines[n];
    warnings.push('과목 이름이 표준 과목 표와 다릅니다: "' + n + '"(' + ls.slice(0, 3).join('·') + '번째 줄' + (ls.length > 3 ? ' 외 ' + (ls.length - 3) + '줄' : '') + ')' + (s ? ' — 표준 이름은 "' + s + '"입니다.' : ' — 표에 없는 이름입니다. 맞으면 그대로 올려도 됩니다.'));
  });
  if (odd.length > CUR_WARN_MAX) warnings.push('표준 표와 다른 과목 이름이 ' + (odd.length - CUR_WARN_MAX) + '개 더 있습니다.');
  return { recs: recs, errors: errors, warnings: warnings };
}

function curIsLive_(r) { return String(r.status || '유효').trim() !== '취소'; }

/** 같은 '자리'(편제표: 학년·학기·선택군·과목, 권장: 대학·모집단위). 자리는 같은데 내용이 다르면 '바뀌는 줄' */
function curPlace_(kind, r) {
  return kind === 'curriculum' ? [r.grade, r.semester, r.choice_group || '', r.course].join('\u0001') : [r.university, r.unit].join('\u0001');
}

/**
 * 순수: 붙여넣은 글과 지금 시트(그 종류 탭의 모든 행)를 비교한다. 올린 글의 입학년도(기준 연도) 하나의 유효 줄만 맞춘다.
 * → {ok, errors, warnings, year, add:[rec], changed:[{before: 시트 행, after: rec}], remove:[시트 행], same, counts:{add, changed, remove, same, rows}}
 * 저장은 add + changed.after를 새로 쓰고 changed.before + remove를 '취소'로 바꾼다.
 */
function curPlan_(kind, text, existing) {
  var def = curKind_(kind);
  var p = curParse_(kind, text);
  var empty = { add: [], changed: [], remove: [], same: 0, counts: { add: 0, changed: 0, remove: 0, same: 0, rows: 0 } };
  if (p.errors.length) return Object.assign({ ok: false, errors: p.errors, warnings: p.warnings, year: '' }, empty);
  var year = String(p.recs[0].rec[def.scope]);
  var pool = (existing || []).filter(function (r) { return curIsLive_(r) && String(r[def.scope]) === year; });
  var bySig = {}, byPlace = {};
  pool.forEach(function (r) { (bySig[curSig_(def, r)] = bySig[curSig_(def, r)] || []).push(r); });
  var used = {};
  var add = [], changed = [], same = 0, rest = [];
  p.recs.forEach(function (x) {
    var b = bySig[curSig_(def, x.rec)];
    if (b && b.length) { used[b.pop().id] = true; same++; } else rest.push(x.rec);
  });
  pool.filter(function (r) { return !used[r.id]; }).forEach(function (r) { (byPlace[curPlace_(kind, r)] = byPlace[curPlace_(kind, r)] || []).push(r); });
  rest.forEach(function (rec) {
    var b = byPlace[curPlace_(kind, rec)];
    if (b && b.length) { var old = b.shift(); used[old.id] = true; changed.push({ before: old, after: rec }); } else add.push(rec);
  });
  var remove = pool.filter(function (r) { return !used[r.id]; });
  return { ok: true, errors: [], warnings: p.warnings, year: year, add: add, changed: changed, remove: remove, same: same,
    counts: { add: add.length, changed: changed.length, remove: remove.length, same: same, rows: p.recs.length } };
}

/** 줄 한 개를 사람이 읽는 글로: '2027학년 입학 · 2학년 1학기 · 선택군 A(택2) · 화법과 언어' / '2028 · 연세대 · 문과대학 전 모집단위' */
function curLabel_(kind, r) {
  return kind === 'curriculum'
    ? r.entry_year + '학년 입학 · ' + r.grade + '학년 ' + r.semester + '학기 · ' + (r.choice_group ? r.choice_group + '(택' + r.pick_n + ')' : '필수') + ' · ' + r.course
    : r.base_year + ' · ' + r.university + ' · ' + r.unit;
}

function curPreviewView_(kind, plan) {
  if (!plan.ok) return { ok: false, kind: kind, errors: plan.errors.slice(0, 50), errorCount: plan.errors.length, warnings: plan.warnings, counts: plan.counts };
  var cut = function (a) { return a.slice(0, CUR_LIST_MAX); };
  return { ok: true, kind: kind, year: plan.year, counts: plan.counts, warnings: plan.warnings, nothingToDo: !plan.add.length && !plan.changed.length && !plan.remove.length,
    lists: { add: cut(plan.add).map(function (r) { return curLabel_(kind, r); }),
      changed: cut(plan.changed).map(function (c) { return curLabel_(kind, c.after) + (kind === 'curriculum' ? ' (택' + c.before.pick_n + ' → 택' + c.after.pick_n + ')' : ''); }),
      remove: cut(plan.remove).map(function (r) { return curLabel_(kind, r); }) } };
}

function curCountsEqual_(a, b) {
  return !!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(function (k) { return a[k] === b[k]; });
}

/* ───────────── 화면에서 부르는 서버 함수 (관리자만) ───────────── */

/** 올릴 글 미리 보기. 아무것도 저장하지 않는다. kind = 'curriculum'(편제표) | 'recommendations'(권장 이수 과목). 응답의 counts·kind가 저장 때 expect로 돌아온다 */
function previewCurriculum(kind, text) {
  requirePermission_('curriculum.edit');
  var def = curKind_(kind);
  invalidate_('config', def.tab);
  return curPreviewView_(String(kind), curPlan_(String(kind), text, readAll_(def.tab, 'config')));
}

/**
 * 저장. expect = {kind, counts}(미리 보기 응답 값). 락 안에서 다시 읽고 계산해 다르면 거부한다.
 * 새 줄을 먼저 쓰고 빠진 줄을 취소한다(중간에 멈춰도 다시 올리면 남은 것만 맞춰진다).
 */
function saveCurriculum(kind, text, expect) {
  var user = requirePermission_('curriculum.edit');
  var def = curKind_(kind);
  return withLock_(function () {
    invalidate_('config', def.tab);
    var plan = curPlan_(String(kind), text, readAll_(def.tab, 'config'));
    if (!plan.ok) return curPreviewView_(String(kind), plan);
    if (!expect || expect.kind !== String(kind) || !curCountsEqual_(plan.counts, expect.counts)) {
      return { ok: false, stale: true, errors: [{ line: 0, column: '', message: '미리 보기 이후 입력이나 올려 둔 ' + def.label + '이 바뀌었습니다. [미리 보기]를 다시 눌러 결과를 보고 저장해 주세요.' }] };
    }
    if (!plan.add.length && !plan.changed.length && !plan.remove.length) return { ok: true, nothingToDo: true, counts: plan.counts };
    var fresh = plan.add.concat(plan.changed.map(function (c) { return c.after; }));
    var cancel = plan.changed.map(function (c) { return c.before; }).concat(plan.remove);
    bulkAppend_(def.tab, fresh.map(function (r) { return Object.assign({}, r, { status: '유효' }); }), user.email, 'config');
    bulkUpdateRecords_(def.tab, cancel.map(function (r) { return { id: r.id, patch: { status: '취소' } }; }), user.email, 'config');
    return { ok: true, counts: plan.counts };
  });
}

/** 지금 올라와 있는 자료: 편제표는 입학년도마다 줄 수, 권장 과목은 기준 연도마다 줄 수 (화면 맨 위 카드) */
function getCurriculumSummary() {
  requirePermission_('curriculum.edit');
  var out = {};
  Object.keys(CUR_KINDS).forEach(function (k) {
    var def = CUR_KINDS[k], n = {};
    invalidate_('config', def.tab);
    readAll_(def.tab, 'config').filter(curIsLive_).forEach(function (r) { n[r[def.scope]] = (n[r[def.scope]] || 0) + 1; });
    out[k] = Object.keys(n).sort().map(function (y) { return { year: y, rows: n[y] }; });
  });
  return out;
}

/* ───────────── 읽기(내부) — 이수 계획·권장 과목 화면이 plan.view를 거친 뒤 쓴다 ───────────── */

/** 지금 유효한 편제표 줄. entryYear를 주면 그 입학년도만 */
function curriculumRows_(entryYear) {
  return readAll_('curriculum_courses', 'config').filter(function (r) { return curIsLive_(r) && (!entryYear || String(r.entry_year) === String(entryYear)); });
}

/** 지금 유효한 권장 이수 과목 줄. baseYear를 주면 그 기준 연도만 */
function recommendationRows_(baseYear) {
  return readAll_('course_recommendations', 'config').filter(function (r) { return curIsLive_(r) && (!baseYear || String(r.base_year) === String(baseYear)); });
}
