/**
 * F2 날짜별 출석부(C7). PRD F2, docs/contracts/sheet-model.md, docs/design/screens.md 3절.
 *
 *   sheetBuildModel_(src)  순수: 좌석(R2 seatMapOn_)·그날 블록(R1 resolveDayPlan_)·칸 우선순위(R3 resolveStudentDay_)를 조합해
 *                          sheet-model.md 모양의 모델을 만든다. 서비스·현재 시각을 쓰지 않는다(시각은 src.now).
 *   getAttendanceSheet(date)     미리보기 HTML(DESIGN 렌더러 printRenderSheet_) + 요약. 관리자·출결 담당·학사 교사만.
 *   getAttendanceSheetPdf(date)  PDF를 base64로 내려준다(공유·Drive 저장 없음). 같은 권한.
 *
 * 개인정보: 모델의 occupant에는 학년·이름·display만 넣는다. 특이사항 사유 메모·이메일·학번은 모델에 넣지 않는다(칸에는 유형 약어만).
 * ASSUMPTION: 설정 attendance.legend는 아직 쓰지 않고 범례는 PRD F2 기본값을 쓴다.
 * ASSUMPTION: 근무자 이름은 F3(2단계) 전까지 빈 배열(머리말 "근무: ____").
 * ASSUMPTION: PDF는 HTML → PDF 변환(스파이크 A안)으로 시작한다. C0 결과로 B안이 정해지면 sheetMakePdf_ 한 곳만 바꾼다.
 * 모델 캐시(CacheService)는 아직 두지 않는다(날짜 하나에 시트 8장을 한 번 읽는 정도라 먼저 측정한다).
 */

var SHEET_KIND_EN = { '좌석': 'seat', '기둥': 'pillar', '비상문': 'door', '창문': 'window' };
var SHEET_LEGEND = [
  { mark: '○', text: '출석' }, { mark: '×', text: '결석' }, { mark: '△', text: '지각' },
  { mark: '조', text: '조퇴(아래 칸에 질병·가정사유)' }, { mark: '학', text: '학원' }, { mark: '가', text: '가정' }
];

/** 설정 행 → {title, vacantLabel, endTypeDayTypes, endLabel, typeShort}. 비면 Schema.gs DEFAULT_SETTINGS */
function sheetSettings_(rows) {
  var kv = {};
  (rows || []).forEach(function (r) { kv[String(r.key || '').trim()] = String(r.value || ''); });
  var defaults = {};
  DEFAULT_SETTINGS.forEach(function (s) { defaults[s[0]] = s[1]; });
  var get = function (k) { return kv[k] !== undefined && kv[k].trim() !== '' ? kv[k] : (defaults[k] || ''); };
  var list = function (s) { return String(s).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; }); };
  var typeShort = {};
  list(get('exception.type_short')).forEach(function (p) {
    var i = p.lastIndexOf(':');
    if (i > 0) typeShort[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return { title: get('print.title') || '신한학사 출석부', vacantLabel: get('print.vacant_label') || '공석',
    endTypeDayTypes: list(get('attendance.end_type_day_types')), endLabel: get('attendance.end_label') || '정상 종료', typeShort: typeShort };
}

/** 날짜가 속한 운영 기간(겹치면 나중에 시작한 것). 없으면 null */
function sheetTermOn_(terms, ymd) {
  var hit = null;
  (terms || []).forEach(function (t) {
    if (!t.start_date || !t.end_date || ymd < t.start_date || ymd > t.end_date) return;
    if (!hit || t.start_date >= hit.start_date) hit = t;
  });
  return hit;
}

/**
 * 출석부 모델(순수).
 * src = {date, now, terms, term, daySchedules, blocks, defaults, settings(sheetSettings_ 결과), spaces, seats, assignments,
 *        enrollments, students, changes, fixedSchedules, exceptions(그 기간 특이사항 행), dutyNames?}
 */
function sheetBuildModel_(src) {
  var date = src.date;
  var termType = calTermTypeOn_(src.terms, date);
  var plan = resolveDayPlan_(date, { termType: termType, daySchedule: pickDaySchedule_(src.daySchedules, date), blocks: src.blocks, defaults: src.defaults });
  var st = src.settings;
  var model = {
    date: date, weekdayKo: ymdWeekdayKo_(date), dayType: plan.dayType, operating: plan.operating, title: st.title,
    dutyNames: (src.dutyNames || []).slice(), blocks: [], legend: SHEET_LEGEND.map(function (l) { return { mark: l.mark, text: l.text }; }),
    spaces: [], unseated: [], warnings: plan.warnings.slice(), generatedAt: src.now
  };
  if (!plan.operating) return model;
  model.blocks = plan.blocks.map(function (b) { return { seq: b.seq, start: b.start, end: b.end, label: b.label }; });

  var map = seatMapOn_(src.seats, src.assignments, src.enrollments, src.changes, src.term.id, date);
  map.warnings.forEach(function (w) { model.warnings.push(w); });
  var studentById = {}, enrByStudent = {};
  src.students.forEach(function (s) { studentById[s.id] = s; });
  src.enrollments.forEach(function (e) { if (e.term_id === src.term.id && !enrByStudent[e.student_id]) enrByStudent[e.student_id] = e; });
  var exByStudent = {};
  src.exceptions.forEach(function (r) { (exByStudent[r.student_id] = exByStudent[r.student_id] || []).push(r); });
  var rule = { endTypeDayTypes: st.endTypeDayTypes, endTime: '23:00', typeShort: st.typeShort, endLabel: st.endLabel };

  var blankMarks = function () { return model.blocks.map(function (b) { return { seq: b.seq, code: 'NONE', text: '' }; }); };
  var activeSeats = src.seats.filter(function (s) { return String(s.status || '').trim() !== '취소'; });
  model.spaces = src.spaces.filter(function (sp) { return String(sp.status || '').trim() !== '취소'; })
    .sort(function (a, b) { return (+a.sort_order || 0) - (+b.sort_order || 0); })
    .map(function (sp) {
      var cells = activeSeats.filter(function (s) { return s.space_id === sp.id; })
        .sort(function (a, b) { return (+a.row - +b.row) || (+a.col - +b.col); })
        .map(function (s) {
          var kind = SHEET_KIND_EN[s.kind] || 'seat';
          var cell = { row: +s.row, col: +s.col, kind: kind, seatLabel: kind === 'seat' ? String(s.label || '') : '', occupant: null, vacant: false, marks: [] };
          if (kind !== 'seat') return cell;
          var m = map.bySeat[s.id];
          var student = m && m.studentId ? studentById[m.studentId] : null;
          if (!student) { cell.vacant = true; cell.marks = blankMarks(); return cell; }
          cell.occupant = { grade: Number(student.grade), name: student.name, display: student.grade + '. ' + student.name };
          var enr = enrByStudent[student.id] || {};
          var day = resolveStudentDay_(plan, {
            exceptions: exByStudent[student.id] || [], fixedRows: effectiveFixedRows_(src.fixedSchedules, student.id, date), endType: enr.end_type || ''
          }, rule);
          cell.marks = day.map(function (d) { return { seq: d.seq, code: d.code, text: d.text }; });
          return cell;
        });
      return { id: sp.id, name: sp.name, gender: sp.gender, rows: +sp.rows, cols: +sp.cols, cells: cells };
    });
  if (!model.spaces.length) model.warnings.push('이 기간 좌석 배치가 없습니다. 좌석표에서 공간과 배정을 먼저 만들어 주세요.');
  model.unseated = map.unseated.map(function (id) { return studentById[id]; }).filter(function (s) { return s; })
    .sort(function (a, b) { return (+a.grade - +b.grade) || String(a.name).localeCompare(String(b.name)); })
    .map(function (s) { return { display: s.grade + '. ' + s.name }; });
  return model;
}

/* ───────────── 읽기 ───────────── */

function sheetLoad_(ymd) {
  var terms = readAll_('terms');
  var term = sheetTermOn_(terms, ymd);
  if (!term) return null;
  var tab = [];
  try { tab = readAll_(termSheetName_('exceptions', term.id)); } catch (e) { if (String(e.message).indexOf('탭이 없습니다') < 0) throw e; }
  return {
    date: ymd, now: nowIso_(), terms: terms, term: term, daySchedules: readAll_('day_schedules'), blocks: readAll_('blocks'),
    defaults: calDefaults_(readAll_('settings', 'config')), settings: sheetSettings_(readAll_('settings', 'config')),
    spaces: readAll_('spaces'), seats: readAll_('seats'), assignments: readAll_('seat_assignments'), enrollments: readAll_('enrollments'),
    students: readAll_('students'), changes: readAll_('status_changes'), fixedSchedules: readAll_('fixed_schedules'), exceptions: tab, dutyNames: []
  };
}

/** 날짜 → 모델(없는 기간이면 null). 테스트와 서버 함수가 함께 쓴다. */
function sheetModelFor_(ymd) {
  var src = sheetLoad_(ymd);
  return src ? { model: sheetBuildModel_(src), settings: src.settings } : null;
}

function sheetDateArg_(date) {
  var ymd = String(date || '').trim() || today_();
  if (!ymdIsValid_(ymd)) throw new Error('날짜를 골라 주세요.');
  return ymd;
}

/** 공통: 날짜의 출석부를 만들 수 있는지 판정하고 HTML까지 만든다 → {ok, ...} */
function sheetRender_(ymd) {
  var built = sheetModelFor_(ymd);
  if (!built) return { ok: false, date: ymd, error: '이 날짜가 속한 운영 기간이 없습니다. 운영 기간을 먼저 만들어 주세요.' };
  var model = built.model;
  var base = { date: ymd, weekdayKo: model.weekdayKo, warnings: model.warnings };
  if (!model.operating) {
    return Object.assign(base, { ok: true, operating: false, message: ymd + '(' + model.weekdayKo + ')은(는) 운영하지 않는 날입니다. 출석부는 만들지 않습니다.' });
  }
  if (!model.blocks.length) {
    return Object.assign(base, { ok: false, operating: true, error: '이 날은 출석 블록이 없어 출석부를 만들 수 없습니다. 자습 일정·블록에서 블록을 확인해 주세요.' });
  }
  var opts = { vacantLabel: built.settings.vacantLabel };
  var plan = printSheetPlan_(model, opts);
  var warnings = model.warnings.slice();
  plan.forEach(function (p) {
    if (!p.fits) warnings.push('"' + p.name + '"이(가) 한 쪽에 다 들어가지 않을 수 있습니다. 인쇄 전에 미리보기를 확인해 주세요.');
  });
  var seats = 0, vacant = 0;
  model.spaces.forEach(function (sp) { sp.cells.forEach(function (c) { if (c.kind === 'seat') { seats++; if (c.vacant) vacant++; } }); });
  return Object.assign(base, {
    ok: true, operating: true, warnings: warnings, html: printRenderSheet_(model, opts), pageCount: plan.length,
    spaces: model.spaces.map(function (s) { return s.name; }), seatCount: seats, vacantCount: vacant, unseatedCount: model.unseated.length,
    blockLabels: model.blocks.map(function (b) { return b.label; })
  });
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/** 그 날짜의 출석부 미리보기(HTML)와 요약. 날짜를 비우면 오늘. 운영 안 하는 날·블록 없는 날은 안내만 돌려준다. */
function getAttendanceSheet(date) {
  requirePermission_('sheet.view');
  return sheetRender_(sheetDateArg_(date));
}

/** HTML → PDF(스파이크 A안). C0 결과로 방식이 바뀌면 이 함수만 고친다. */
function sheetMakePdf_(html, name) {
  return Utilities.newBlob(html, 'text/html', 'sheet.html').getAs('application/pdf').setName(name);
}

/** PDF 파일을 base64로 내려준다(공유·Drive 저장 없음, 앱이 직접 내려줌). 운영 안 하는 날은 PDF 대신 안내. */
function getAttendanceSheetPdf(date) {
  requirePermission_('sheet.view');
  var ymd = sheetDateArg_(date);
  var r = sheetRender_(ymd);
  if (!r.ok || !r.operating) return { ok: false, error: r.error || r.message };
  var name = '출석부_' + ymd + '(' + r.weekdayKo + ').pdf';
  var blob = sheetMakePdf_(r.html, name);
  var bytes = blob.getBytes();
  return { ok: true, name: name, base64: Utilities.base64Encode(bytes), bytes: bytes.length, warnings: r.warnings };
}
