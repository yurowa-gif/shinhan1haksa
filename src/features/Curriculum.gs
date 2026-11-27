/**
 * S6-1 교육과정 올리기(결정 102, docs/plan/s6-0-design.md 8.1): 관리자가 편제표·권장 이수 과목을 구글 시트·CSV로 붙여 넣어 설정 스프레드시트에 올린다.
 * 명단 올리기(Roster.gs)와 같은 흐름 — 붙여넣기 → 미리 보기 → 저장. 붙여넣은 글을 표로 읽는 rosterParseText_(탭·쉼표·큰따옴표)를 그대로 쓴다.
 *
 * 규칙
 *  - 첫 줄은 열 이름이다(순서는 자유). 열 이름 = 탭의 열 이름 그대로: 편제표 entry_year·grade·semester·choice_group·pick_n·course,
 *    권장 과목 base_year·university·unit·core_courses·recommended_courses·source_url·source_title·note. data/course_recommendations/*.csv를 그대로 붙여 넣을 수 있다.
 *  - 오류가 한 줄이라도 있으면 아무것도 쓰지 않는다. 표준 과목 이름 표와 다른 이름은 **경고**만(저장을 막지 않는다 — 학교 편제표에 표에 없는 과목이 있을 수 있다).
 *  - 저장은 올린 글에 나온 입학년도(편제표)·기준 연도(권장 과목)마다 그 해의 유효 줄을 새 글과 맞춘다: 같은 줄은 그대로 두고, 빠진 줄은 status '취소', 새 줄은 추가(삭제 없음).
 *    락 안에서 다시 계산해 미리 볼 때와 개수가 다르면 거부한다(stale). audit_log에는 일괄 1줄(추가 id 목록)·취소 줄의 바뀐 칸이 남는다.
 *  - 읽기(곧 만들 이수 계획 화면)는 curriculumRows_·recommendationRows_ 내부 함수.
 * ASSUMPTION: 편제표 같은 선택군의 pick_n은 줄마다 같아야 한다(다르면 오류). 선택군이 비면(필수 과목) pick_n은 비우거나 0.
 * ASSUMPTION: 권장 과목에는 같은 대학·모집단위 줄이 여럿 있을 수 있다(실제 자료에 그렇다) — 내용이 다르면 모두 올리고 경고만, 내용까지 같으면 하나로 합치고 경고.
 */

var CUR_KINDS = {
  curriculum: { tab: 'curriculum_courses', label: '편제표', scope: 'entry_year',
    cols: ['entry_year', 'grade', 'semester', 'choice_group', 'pick_n', 'course'] },
  recommendations: { tab: 'course_recommendations', label: '권장 이수 과목', scope: 'base_year',
    cols: ['base_year', 'university', 'unit', 'core_courses', 'recommended_courses', 'source_url', 'source_title', 'note'] }
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
    if (Object.prototype.hasOwnProperty.call(index, name)) dup.push(name); else index[name] = i;
  });
  var missing = def.cols.filter(function (c) { return !(c in index); });
  var unknown = Object.keys(index).filter(function (c) { return def.cols.indexOf(c) < 0; });
  if (missing.length || unknown.length || dup.length) {
    errors.push({ line: 1, column: '', message: '첫 줄의 열 이름이 맞지 않습니다.' + (missing.length ? ' 빠진 열: ' + missing.join(', ') + '.' : '') +
      (unknown.length ? ' 모르는 열: ' + unknown.join(', ') + '.' : '') + (dup.length ? ' 겹친 열: ' + dup.join(', ') + '.' : '') + ' 열 이름: ' + def.cols.join(', ') });
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
    } else if (!/^\d{1,2}$/.test(pick) || +pick < 1 || +pick > 20) {
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
    rec.source_url = str('source_url', 300, false);
    if (rec.source_url && !/^https?:\/\//i.test(rec.source_url)) err('source_url', '출처 주소는 http:// 또는 https://로 시작해야 합니다.');
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
      if (seen[ck]) { errors.push({ line: line, column: 'course', message: '같은 과목이 ' + seen[ck] + '번째 줄에 이미 있습니다(같은 입학년도·학년·학기·선택군).' }); return; }
      seen[ck] = line;
    } else {
      var sig = curSig_(def, r.rec);
      if (seen[sig]) { warnings.push(line + '번째 줄은 ' + seen[sig] + '번째 줄과 내용까지 같아 하나로 합칩니다.'); return; }
      seen[sig] = line;
      var key = r.rec.base_year + '\u0001' + r.rec.university + '\u0001' + r.rec.unit;
      if (keyFirst[key]) keyFirst[key].push(line); else keyFirst[key] = [line];
    }
    recs.push({ line: line, rec: r.rec });
  });
  if (!errors.length && !recs.length) errors.push({ line: 0, column: '', message: '올릴 줄이 없습니다. 열 이름 아래에 내용을 붙여 넣어 주세요.' });
  if (kind === 'curriculum') {
    var picks = {};
    recs.forEach(function (x) {
      if (!x.rec.choice_group) return;
      var gk = [x.rec.entry_year, x.rec.grade, x.rec.semester, x.rec.choice_group].join('\u0001');
      if (picks[gk] === undefined) picks[gk] = { n: x.rec.pick_n, line: x.line };
      else if (picks[gk].n !== x.rec.pick_n) errors.push({ line: x.line, column: 'pick_n', message: '같은 선택군(' + x.rec.choice_group + ')의 택N이 ' + picks[gk].line + '번째 줄(' + picks[gk].n + ')과 다릅니다.' });
    });
  } else {
    var multi = Object.keys(keyFirst).filter(function (k) { return keyFirst[k].length > 1; });
    if (multi.length) warnings.push('같은 대학·모집단위가 둘 이상인 줄이 ' + multi.length + '곳 있습니다(내용이 달라 모두 올립니다): ' +
      multi.slice(0, 3).map(function (k) { var p = k.split('\u0001'); return p[1] + ' ' + p[2] + '(' + keyFirst[k].join('·') + '번째 줄)'; }).join(', ') + (multi.length > 3 ? ' 외 ' + (multi.length - 3) + '곳' : ''));
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

/**
 * 순수: 붙여넣은 글과 지금 시트(그 종류 탭의 모든 행)를 비교한다. 올린 글에 나온 입학년도·기준 연도의 유효 줄만 맞춘다.
 * → {ok, errors, warnings, add:[rec], remove:[시트 행], same, years:[{year, add, remove, same}], counts:{add, remove, same, rows, years}}
 */
function curPlan_(kind, text, existing) {
  var def = curKind_(kind);
  var p = curParse_(kind, text);
  if (p.errors.length) return { ok: false, errors: p.errors, warnings: p.warnings, add: [], remove: [], same: 0, years: [], counts: { add: 0, remove: 0, same: 0, rows: 0, years: 0 } };
  var years = {}, order = [];
  p.recs.forEach(function (x) { var y = x.rec[def.scope]; if (!years[y]) { years[y] = { year: y, add: 0, remove: 0, same: 0 }; order.push(y); } });
  var bucket = {};
  (existing || []).filter(function (r) { return curIsLive_(r) && years[String(r[def.scope])]; }).forEach(function (r) {
    var s = curSig_(def, r);
    (bucket[s] = bucket[s] || []).push(r);
  });
  var add = [], same = 0;
  p.recs.forEach(function (x) {
    var s = curSig_(def, x.rec), b = bucket[s];
    if (b && b.length) { b.pop(); same++; years[x.rec[def.scope]].same++; } else { add.push(x.rec); years[x.rec[def.scope]].add++; }
  });
  var remove = [];
  Object.keys(bucket).forEach(function (s) { bucket[s].forEach(function (r) { remove.push(r); years[String(r[def.scope])].remove++; }); });
  return { ok: true, errors: [], warnings: p.warnings, add: add, remove: remove, same: same, years: order.sort().map(function (y) { return years[y]; }),
    counts: { add: add.length, remove: remove.length, same: same, rows: p.recs.length, years: order.length } };
}

/** 줄 한 개를 사람이 읽는 글로: '2027학년 입학 · 2학년 1학기 · 선택군 A(택2) · 화법과 언어' / '2028 · 연세대 · 문과대학 전 모집단위' */
function curLabel_(kind, r) {
  return kind === 'curriculum'
    ? r.entry_year + '학년 입학 · ' + r.grade + '학년 ' + r.semester + '학기 · ' + (r.choice_group ? r.choice_group + '(택' + r.pick_n + ')' : '필수') + ' · ' + r.course
    : r.base_year + ' · ' + r.university + ' · ' + r.unit;
}

function curPreviewView_(kind, plan) {
  if (!plan.ok) return { ok: false, kind: kind, errors: plan.errors.slice(0, 50), errorCount: plan.errors.length, warnings: plan.warnings, counts: plan.counts };
  return { ok: true, kind: kind, counts: plan.counts, years: plan.years, warnings: plan.warnings, nothingToDo: !plan.add.length && !plan.remove.length,
    lists: { add: plan.add.slice(0, CUR_LIST_MAX).map(function (r) { return curLabel_(kind, r); }), remove: plan.remove.slice(0, CUR_LIST_MAX).map(function (r) { return curLabel_(kind, r); }) } };
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
    if (!plan.add.length && !plan.remove.length) return { ok: true, nothingToDo: true, counts: plan.counts };
    bulkAppend_(def.tab, plan.add.map(function (r) { return Object.assign({}, r, { status: '유효' }); }), user.email, 'config');
    bulkUpdateRecords_(def.tab, plan.remove.map(function (r) { return { id: r.id, patch: { status: '취소' } }; }), user.email, 'config');
    return { ok: true, counts: plan.counts };
  });
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
