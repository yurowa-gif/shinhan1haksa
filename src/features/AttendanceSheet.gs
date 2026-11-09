/**
 * F2 날짜별 출석부(C7). PRD F2, docs/contracts/sheet-model.md, docs/design/screens.md 3절.
 *
 *   sheetBuildModel_(src)  순수: 좌석(R2 seatMapOn_)·그날 블록(R1 resolveDayPlan_)·칸 우선순위(R3 resolveStudentDay_)를 조합해
 *                          sheet-model.md 모양의 모델을 만든다. 서비스·현재 시각을 쓰지 않는다(시각은 src.now).
 *   getAttendanceSheet(date, names)     미리보기 HTML(DESIGN 렌더러 printRenderSheet_) + 요약. 관리자·출결 담당·학사 교사만.
 *   getAttendanceSheetPdf(date, names)  PDF를 base64로 내려준다(공유·Drive 저장 없음). 같은 권한, 같은 모델 함수(결정 39).
 *   names = {dutyNames, standbyNames}: 인쇄 화면에서 손으로 넣은 근무·예비 감독 이름. 저장하지 않고 이번 모델 사본에만 넣는다.
 *
 * 개인정보: 모델의 occupant에는 학년·이름·display만 넣는다. 특이사항 사유 메모·이메일·학번은 모델에 넣지 않는다(칸에는 유형 약어만).
 * ASSUMPTION: 설정 attendance.legend는 아직 쓰지 않고 범례는 PRD F2 기본값을 쓴다.
 * ASSUMPTION: 근무자·예비 감독 이름은 F3(2단계) 전까지 손으로 넣은 값만 쓴다(없으면 빈 배열, 머리말 "근무: ____").
 * ASSUMPTION: PDF는 HTML → PDF 변환(스파이크 A안)으로 시작한다. C0 결과로 B안이 정해지면 sheetMakePdf_ 한 곳만 바꾼다.
 * 모델 캐시(CacheService)는 두지 않는다(결정 39: 실측 뒤에 정한다). 대신 단계별 소요 시간(load·build·render·pdf, ms)을
 * Logger와 응답의 timings에 남겨 실측할 수 있게 한다(개인정보 없음).
 */

var SHEET_KIND_EN = { '좌석': 'seat', '기둥': 'pillar', '비상문': 'door', '창문': 'window' };
var SHEET_LEGEND = [
  { mark: '○', text: '출석' }, { mark: '×', text: '결석' }, { mark: '△', text: '지각' },
  { mark: '조', text: '조퇴(사유는 메모 칸에)' }, { mark: '학', text: '학원' }, { mark: '가', text: '가정' }
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
    dutyNames: (src.dutyNames || []).slice(), standbyNames: (src.standbyNames || []).slice(), blocks: [], legend: SHEET_LEGEND.map(function (l) { return { mark: l.mark, text: l.text }; }),
    spaces: [], unseated: [], warnings: plan.warnings.slice(), generatedAt: src.now
  };
  if (!plan.operating) return model;
  model.blocks = plan.blocks.map(function (b) { return { seq: b.seq, start: b.start, end: b.end, label: b.label }; });

  // 취소된 공간(또는 없는 공간)의 좌석은 쓰지 않는다 — 거기 배정이 남은 학생은 미배정 목록에 나온다
  var liveSpace = {};
  src.spaces.forEach(function (sp) { if (String(sp.status || '').trim() !== '취소') liveSpace[sp.id] = true; });
  var liveSeats = src.seats.filter(function (s) { return liveSpace[s.space_id]; });
  var map = seatMapOn_(liveSeats, src.assignments, src.enrollments, src.changes, src.term.id, date);
  var studentById = {}, enrByStudent = {};
  src.students.forEach(function (s) { studentById[s.id] = s; });
  // 경고 문구의 학생 id는 '학년. 이름'으로 바꾼다(UUID를 화면에 내지 않는다)
  map.warnings.forEach(function (w) {
    model.warnings.push(Object.keys(studentById).reduce(function (t, id) {
      return t.indexOf(id) >= 0 ? t.split(id).join(studentById[id].grade + '. ' + studentById[id].name) : t;
    }, w));
  });
  src.enrollments.forEach(function (e) { if (e.term_id === src.term.id && !enrByStudent[e.student_id]) enrByStudent[e.student_id] = e; });
  var exByStudent = {}, fixedByStudent = {};
  src.exceptions.forEach(function (r) { (exByStudent[r.student_id] = exByStudent[r.student_id] || []).push(r); });
  (src.fixedSchedules || []).forEach(function (r) { (fixedByStudent[r.student_id] = fixedByStudent[r.student_id] || []).push(r); });   // 학생별로 미리 묶어 좌석마다 전체를 훑지 않는다
  var rule = { endTypeDayTypes: st.endTypeDayTypes, endTime: '23:00', typeShort: st.typeShort, endLabel: st.endLabel };

  var blankMarks = function () { return model.blocks.map(function (b) { return { seq: b.seq, code: 'NONE', text: '' }; }); };
  var liveSeatIds = {};
  liveSeats.forEach(function (s) { liveSeatIds[s.id] = true; });
  var activeSeats = liveSeats.filter(function (s) { return String(s.status || '').trim() !== '취소'; });
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
            exceptions: exByStudent[student.id] || [], fixedRows: effectiveFixedRows_(fixedByStudent[student.id] || [], student.id, date), endType: enr.end_type || ''
          }, rule);
          cell.marks = day.map(function (d) { return { seq: d.seq, code: d.code, text: d.text }; });
          return cell;
        });
      return { id: sp.id, name: sp.name, gender: sp.gender, rows: +sp.rows, cols: +sp.cols, cells: cells };
    });
  if (!model.spaces.length) model.warnings.push('사용 중인 공간이 없습니다. 좌석표에서 공간을 먼저 만들어 주세요.');
  // 이 기간의 배정으로 판정한다(공간·좌석은 기간과 무관하게 남아 있으므로 전역 공간 유무로는 알 수 없다)
  else if (!src.assignments.some(function (a) { return a.term_id === src.term.id && String(a.status || '').trim() !== '취소' && liveSeatIds[a.seat_id]; })) {
    model.warnings.push('이 기간에 좌석 배정이 없습니다. 좌석표에서 학생을 자리에 앉혀 주세요.');
  }
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
    students: readAll_('students'), changes: readAll_('status_changes'), fixedSchedules: readAll_('fixed_schedules'), exceptions: tab, dutyNames: [], standbyNames: [],
    dutyTable: sheetDutyNames_(ymd)
  };
}

/**
 * 근무표(duty_slots)의 그날 근무자 이름(F3). 그날 살아 있는 칸이 하나라도 있으면 hasSlots: true.
 * 근무 칸은 21:30조 → 23:00조 / 단독 순서(근무 2명까지), 예비 감독은 1명까지, 대신 근무로 근무에 든 예비는 예비에서 뺀다. 이름은 users에서 읽고 12자까지.
 * 탭이 없으면 칸이 없는 것으로 본다. 이메일은 내보내지 않는다.
 * @return {{hasSlots:boolean, dutyNames:string[], standbyNames:string[]}}
 */
function sheetDutyNames_(ymd) {
  var rows = [];
  try { rows = readAll_('duty_slots'); } catch (e) { if (String(e.message).indexOf('탭이 없습니다') < 0) throw e; }
  var live = rows.filter(function (r) { return ruleRowLive_(r) && String(r.date).trim() === ymd; });
  if (!live.length) return { hasSlots: false, dutyNames: [], standbyNames: [] };
  var names = Object.create(null);
  readAll_('users').forEach(function (u) { names[normalizeEmail_(u.email)] = u.name; });
  var day = dutyOn_(live, ymd);
  var who = function (email) { return names[email] || '(미등록)'; };
  var onDuty = {};
  day.duty.forEach(function (d) { onDuty[d.email] = true; });
  var clean = sheetNames_({
    dutyNames: day.duty.map(function (d) { return who(d.email); }),
    standbyNames: day.standby.filter(function (sb) { return !onDuty[sb.email]; }).map(function (sb) { return who(sb.email); })
  });
  return { hasSlots: true, dutyNames: clean.dutyNames.slice(0, 2), standbyNames: clean.standbyNames.slice(0, 1) };
}

/**
 * 인쇄 화면에서 손으로 넣은 근무·예비 감독 이름을 다듬는다(순수). 배열이나 쉼표·줄바꿈으로 나눈 글을 받는다.
 * 한 이름 12자까지, 근무 4명·예비 2명까지, 빈 이름·중복·제어문자는 버린다. 저장하지 않는다.
 * @return {{dutyNames:string[], standbyNames:string[]}}
 */
function sheetNames_(names) {
  names = names || {};
  var clean = function (v, max) {
    var list = Array.isArray(v) ? v : String(v || '').split(/[,\n]/);
    var out = [];
    list.forEach(function (x) {
      var t = String(x === null || x === undefined ? '' : x).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12);
      if (t && out.indexOf(t) < 0 && out.length < max) out.push(t);
    });
    return out;
  };
  return { dutyNames: clean(names.dutyNames, 4), standbyNames: clean(names.standbyNames, 2) };
}

/** 단계별 소요 시간(ms) 재기: load·build·render·pdf. 캐시를 넣을지 실측하려고 남긴다(결정 39). */
function sheetTimer_() {
  var t = { last: Date.now(), start: Date.now(), ms: {} };
  return {
    lap: function (name) { var n = Date.now(); t.ms[name] = n - t.last; t.last = n; },
    result: function () { var r = Object.assign({}, t.ms); r.totalMs = Date.now() - t.start; return r; }
  };
}

/** 날짜 → {model, settings}(없는 기간이면 null). names는 sheetNames_ 결과(모델 사본에만 넣는다). 테스트와 서버 함수가 함께 쓴다. */
function sheetModelFor_(ymd, names, timer) {
  var src = sheetLoad_(ymd);
  if (timer) timer.lap('loadMs');
  if (!src) return null;
  // 근무표에 그날 칸이 있으면 그 이름을(손 입력은 무시), 하나도 없을 때만 손으로 넣은 이름을 쓴다(4-2)
  var n = src.dutyTable.hasSlots ? src.dutyTable : sheetNames_(names);
  src.dutyNames = n.dutyNames; src.standbyNames = n.standbyNames;
  var built = { model: sheetBuildModel_(src), settings: src.settings,
    dutySource: src.dutyTable.hasSlots ? '근무표' : (n.dutyNames.length || n.standbyNames.length ? '손 입력' : '') };
  if (timer) timer.lap('buildMs');
  return built;
}

function sheetDateArg_(date) {
  var ymd = String(date || '').trim() || today_();
  if (!ymdIsValid_(ymd)) throw new Error('날짜를 골라 주세요.');
  return ymd;
}

/** 공통: 날짜의 출석부를 만들 수 있는지 판정하고 HTML까지 만든다 → {ok, ...} */
function sheetRender_(ymd, names, timer) {
  var built = sheetModelFor_(ymd, names, timer);
  if (!built) return { ok: false, date: ymd, error: '이 날짜가 속한 운영 기간이 없습니다. 운영 기간을 먼저 만들어 주세요.' };
  var model = built.model;
  // dutySource: 머리말 이름의 출처('근무표'·'손 입력'·''). 모델이 아니라 응답에 둔다(렌더러는 모른다)
  var base = { date: ymd, weekdayKo: model.weekdayKo, warnings: model.warnings, dutySource: built.dutySource, dutyNames: model.dutyNames, standbyNames: model.standbyNames };
  if (!model.operating) {
    return Object.assign(base, { ok: true, operating: false, message: ymd + '(' + model.weekdayKo + ')은(는) 운영하지 않는 날입니다. 출석부는 만들지 않습니다.' });
  }
  if (!model.blocks.length) {
    return Object.assign(base, { ok: false, operating: true, error: '이 날은 출석 블록이 없어 출석부를 만들 수 없습니다. 자습 일정·블록에서 블록을 확인해 주세요.' });
  }
  var opts = { vacantLabel: built.settings.vacantLabel };
  var plan = printSheetPlan_(model, opts) || { pages: 1, warnings: [] };   // 공간이 없으면 null(안내 한 쪽)
  var warnings = model.warnings.concat(plan.warnings);   // 렌더러의 크기·넘침 경고(예: 표시 칸이 손글씨 하한보다 좁음, 앞면에 안 들어간 것)
  var seats = 0, vacant = 0;
  model.spaces.forEach(function (sp) { sp.cells.forEach(function (c) { if (c.kind === 'seat') { seats++; if (c.vacant) vacant++; } }); });
  var html = printRenderSheet_(model, opts);
  if (timer) timer.lap('renderMs');
  return Object.assign(base, {
    ok: true, operating: true, warnings: warnings, html: html, pageCount: plan.pages,
    spaces: model.spaces.map(function (s) { return s.name; }), seatCount: seats, vacantCount: vacant, unseatedCount: model.unseated.length,
    blockLabels: model.blocks.map(function (b) { return b.label; })
  });
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 그 날짜의 출석부 미리보기(HTML)와 요약. 날짜를 비우면 오늘. 운영 안 하는 날·블록 없는 날은 안내만 돌려준다.
 * names = {dutyNames, standbyNames}(선택): 손으로 넣은 근무·예비 감독 이름(저장하지 않음). 응답의 timings는 단계별 소요 ms.
 */
function getAttendanceSheet(date, names) {
  requirePermission_('sheet.view');
  var timer = sheetTimer_();
  var r = sheetRender_(sheetDateArg_(date), names, timer);
  r.today = today_();   // 화면의 "오늘" 칩은 ?date=로 들어와도 실제 오늘을 가리킨다
  r.timings = timer.result();
  Logger.log('[출석부 미리보기 ms] ' + JSON.stringify(r.timings));
  return r;
}

/** HTML → PDF(스파이크 A안). C0 결과로 방식이 바뀌면 이 함수만 고친다. */
function sheetMakePdf_(html, name) {
  return Utilities.newBlob(html, 'text/html', 'sheet.html').getAs('application/pdf').setName(name);
}

/** PDF 파일을 base64로 내려준다(공유·Drive 저장 없음, 앱이 직접 내려줌). 운영 안 하는 날은 PDF 대신 안내. */
function getAttendanceSheetPdf(date, names) {
  requirePermission_('sheet.view');
  var ymd = sheetDateArg_(date);
  var timer = sheetTimer_();
  var r = sheetRender_(ymd, names, timer);   // 미리보기와 같은 모델 함수(결정 39)
  if (!r.ok || !r.operating) return { ok: false, error: r.error || r.message };
  var name = '출석부_' + ymd + '(' + r.weekdayKo + ').pdf';
  var blob = sheetMakePdf_(r.html, name);
  var bytes = blob.getBytes();
  timer.lap('pdfMs');
  var timings = timer.result();
  Logger.log('[출석부 PDF ms] ' + JSON.stringify(timings));
  return { ok: true, name: name, base64: Utilities.base64Encode(bytes), bytes: bytes.length, warnings: r.warnings, timings: timings };
}
