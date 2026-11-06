/**
 * C0 인쇄 방식 스파이크 (docs/plan/stage1.md C0). 임시 개발용 — A/B 결정 뒤 지운다.
 *
 * 가짜 1층 자습실(146석, 4블록) 출석부 한 장을 두 방식으로 PDF로 만들어 시간을 잰다.
 *   A안: HTML → Utilities.newBlob(html, 'text/html').getAs('application/pdf')
 *   B안: 시트 템플릿에 값 채우기 → 시트 PDF 내보내기(A4 가로, 한 장 맞춤)
 * 파일은 소유자 드라이브의 "신한1학사_인쇄스파이크" 폴더에만 저장하고 공유하지 않는다(decisions.md 21).
 *
 * 실행: 편집기에서 spikeRunAll() 한 번. 휴대폰 확인은 웹앱 주소 뒤에 ?page=printspike
 * (소유자 본인 계정으로 열어야 한다).
 *
 * 순수 함수(spikeBuildModel_·spikeBuildHtml_·spikeBuildSheetValues_)는 tests/features/print_spike.test.js가 검사한다.
 * 실제 학생 정보 없음: 이름은 buildFakeData_의 가짜 30명을 반복해서 쓴다.
 */

var SPIKE_FOLDER_NAME = '신한1학사_인쇄스파이크';
var SPIKE_TEMPLATE_PROP = 'SPIKE_TEMPLATE_ID';
var SPIKE_FONT_FAMILY = 'Nanum Gothic';

/* ───────────── 순수 함수 ───────────── */

/** 가짜 1층 자습실 출석부 모델(스파이크용 단순 모양). 언제 실행해도 같은 결과. */
function spikeBuildModel_() {
  var layout = buildFakeSeatLayout_();
  var floor = layout.spaces[0];
  var people = buildFakeData_({}).students;
  var blocks = [
    { seq: 1, label: '18–20' }, { seq: 2, label: '20–22' },
    { seq: 3, label: '22–24' }, { seq: 4, label: '24–' }
  ];
  var cells = [];
  var n = 0;
  layout.seats.forEach(function (s) {
    if (s.spaceKey !== floor.key) return;
    var cell = { row: s.row, col: s.col, kind: s.kind, seatLabel: s.label, display: '', marks: [] };
    if (s.kind === '좌석') {
      var p = people[n % people.length];
      cell.display = p.grade + '. ' + p.name;
      // 칸 채우기 시험용 규칙적인 무늬: 학·가·병결·정상 종료
      for (var b = 0; b < blocks.length; b++) {
        var t = '';
        if (n % 7 === 0 && b === 1) t = '학';
        else if (n % 11 === 0) t = '가';
        else if (n % 13 === 0 && b === 0) t = '병결';
        else if (b === blocks.length - 1) t = '정상';
        cell.marks.push({ seq: b + 1, text: t });
      }
      n++;
    }
    cells.push(cell);
  });
  return {
    date: '2027-03-03', weekdayKo: '수', title: '신한학사 출석부',
    blocks: blocks, rows: floor.rows, cols: floor.cols, cells: cells, seatCount: n
  };
}

function spikeEsc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A안: PDF 변환기가 이해하는 표 기반 HTML(CSS 인라인, flex·grid·웹폰트 없음) */
function spikeBuildHtml_(model) {
  var byPos = {};
  model.cells.forEach(function (c) { byPos[c.row + ',' + c.col] = c; });
  var html = [];
  html.push('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">');
  html.push('<style>@page { size: A4 landscape; margin: 8mm; } body { margin: 0; font-family: "Nanum Gothic", "Malgun Gothic", sans-serif; }</style>');
  html.push('</head><body>');
  html.push('<div style="font-size:12pt;font-weight:bold;margin-bottom:3pt">' + spikeEsc_(model.title) + ' · 2027년 3월 3일(' + spikeEsc_(model.weekdayKo) + ') · 근무: ____ · 블록 ');
  html.push(model.blocks.map(function (b) { return String.fromCharCode(0x2460 + b.seq - 1) + b.label; }).join(' '));
  html.push('</div>');
  html.push('<table style="width:100%;border-collapse:collapse;table-layout:fixed">');
  for (var r = 1; r <= model.rows; r++) {
    html.push('<tr>');
    for (var c = 1; c <= model.cols; c++) {
      var cell = byPos[r + ',' + c];
      var td = 'height:24pt;border:0.5pt solid #444;padding:0;font-size:7pt;vertical-align:top;overflow:hidden;';
      if (!cell) { html.push('<td style="border:0;height:24pt"></td>'); continue; }
      if (cell.kind === '기둥') { html.push('<td style="' + td + 'background:#bbb;text-align:center">기둥</td>'); continue; }
      if (cell.kind === '비상문' || cell.kind === '창문') { html.push('<td style="' + td + 'text-align:center">' + cell.kind + '</td>'); continue; }
      html.push('<td style="' + td + '"><div style="font-weight:bold;font-size:8pt">' + spikeEsc_(cell.display) + '</div>');
      html.push('<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tr>');
      cell.marks.forEach(function (m) {
        html.push('<td style="border:0.5pt solid #888;font-size:6.5pt;text-align:center;height:9pt;padding:0">' + spikeEsc_(m.text) + '</td>');
      });
      html.push('</tr></table><div style="height:7pt"></div></td>');
    }
    html.push('</tr>');
  }
  html.push('</table></body></html>');
  return html.join('');
}

/**
 * B안: 시트에 넣을 값. 맨 윗줄 머리말 + 격자(칸마다 "이름 / 블록 표시 / 빈 줄" 3줄 글자).
 * @return {{values:string[][], kinds:string[][]}}
 */
function spikeBuildSheetValues_(model) {
  var values = [];
  var kinds = [];
  var head = [model.title + ' · 2027년 3월 3일(' + model.weekdayKo + ') · 근무: ____ · 블록 ' +
    model.blocks.map(function (b) { return b.seq + ')' + b.label; }).join(' ')];
  for (var i = 1; i < model.cols; i++) head.push('');
  values.push(head);
  kinds.push(head.map(function () { return 'head'; }));
  var byPos = {};
  model.cells.forEach(function (c) { byPos[c.row + ',' + c.col] = c; });
  for (var r = 1; r <= model.rows; r++) {
    var vrow = [];
    var krow = [];
    for (var c = 1; c <= model.cols; c++) {
      var cell = byPos[r + ',' + c];
      if (!cell) { vrow.push(''); krow.push('empty'); continue; }
      krow.push(cell.kind);
      if (cell.kind === '좌석') {
        vrow.push(cell.display + '\n' + cell.marks.map(function (m) { return m.text || '·'; }).join(' ') + '\n');
      } else {
        vrow.push(cell.kind);
      }
    }
    values.push(vrow);
    kinds.push(krow);
  }
  return { values: values, kinds: kinds };
}

/* ───────────── Drive·시트 (편집기·소유자 전용) ───────────── */

function spikeFolder_() {
  var it = DriveApp.getFoldersByName(SPIKE_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SPIKE_FOLDER_NAME);
}

/** A안 PDF blob. 변환 방식은 Blob.getAs */
function spikeMakePdfA_() {
  var html = spikeBuildHtml_(spikeBuildModel_());
  return Utilities.newBlob(html, 'text/html', 'sheet.html').getAs('application/pdf').setName('스파이크_A안_HTML변환.pdf');
}

/** B안 템플릿 시트를 처음 한 번 만들고(서식·열 너비·행 높이), 이후는 값만 채운다. */
function spikeTemplateSheet_(model, report) {
  var ss;
  var id = props_().getProperty(SPIKE_TEMPLATE_PROP);
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('신한1학사_출석부_템플릿_스파이크');
    DriveApp.getFileById(ss.getId()).moveTo(spikeFolder_());
    props_().setProperty(SPIKE_TEMPLATE_PROP, ss.getId());
    report.push('[B안] 템플릿 시트를 새로 만듦');
  }
  return ss;
}

function spikeMakePdfB_(report) {
  var model = spikeBuildModel_();
  var built = spikeBuildSheetValues_(model);
  var ss = spikeTemplateSheet_(model, report || []);
  var sh = ss.getSheets()[0];
  var nRows = built.values.length;
  var nCols = model.cols;
  if (sh.getMaxRows() < nRows) sh.insertRowsAfter(sh.getMaxRows(), nRows - sh.getMaxRows());
  if (sh.getMaxColumns() < nCols) sh.insertColumnsAfter(sh.getMaxColumns(), nCols - sh.getMaxColumns());
  var range = sh.getRange(1, 1, nRows, nCols);
  range.clear();
  range.setFontFamily(SPIKE_FONT_FAMILY).setFontSize(8).setWrap(true).setVerticalAlignment('top');
  range.setValues(built.values);
  sh.getRange(1, 1, 1, nCols).merge().setFontSize(12).setFontWeight('bold');
  sh.setRowHeight(1, 24);
  for (var r = 2; r <= nRows; r++) sh.setRowHeight(r, 40);
  for (var c = 1; c <= nCols; c++) sh.setColumnWidth(c, 66);
  for (var i = 0; i < nRows; i++) {
    for (var j = 0; j < nCols; j++) {
      var k = built.kinds[i][j];
      var cellRange = sh.getRange(i + 1, j + 1);
      if (k === '좌석') cellRange.setBorder(true, true, true, true, false, false);
      else if (k === '기둥') cellRange.setBackground('#bbbbbb').setHorizontalAlignment('center');
      else if (k === '비상문' || k === '창문') cellRange.setBorder(true, true, true, true, false, false).setHorizontalAlignment('center');
    }
  }
  SpreadsheetApp.flush();
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf&size=A4&portrait=false' +
    '&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false&gid=' + sh.getSheetId() +
    '&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3&horizontal_alignment=CENTER';
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('B안 PDF 내보내기 실패(HTTP ' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  }
  return res.getBlob().setName('스파이크_B안_시트내보내기.pdf');
}

/** blob을 폴더에 저장하고 걸린 시간·크기·링크를 돌려준다 */
function spikeSave_(blob, folder) {
  var f = folder.createFile(blob);
  return { name: f.getName(), bytes: blob.getBytes().length, url: f.getUrl() };
}

function spikeTimed_(label, fn) {
  var t0 = Date.now();
  var out;
  var err = '';
  try { out = fn(); } catch (e) { err = e.message; }
  return { label: label, ms: Date.now() - t0, out: out, error: err };
}

/** 편집기에서 한 번 실행. 두 방식으로 PDF를 만들어 폴더에 저장하고 표로 보고한다. */
function spikeRunAll() {
  assertOwnerRun_();
  var report = [];
  var folder = spikeFolder_();
  var rows = [];
  [['A안 HTML 변환', function () { return spikeMakePdfA_(); }],
   ['B안 시트 내보내기(템플릿 만들기 포함)', function () { return spikeMakePdfB_(report); }],
   ['B안 시트 내보내기(템플릿 재사용)', function () { return spikeMakePdfB_(report); }]
  ].forEach(function (m) {
    var r = spikeTimed_(m[0], m[1]);
    var line = r.label + ': ' + (r.ms / 1000).toFixed(1) + '초';
    if (r.error) {
      line += ' · 실패: ' + r.error;
    } else {
      var saved = spikeSave_(r.out, folder);
      line += ' · ' + Math.round(saved.bytes / 1024) + 'KB · ' + saved.url;
    }
    rows.push(line);
  });
  report = report.concat(rows);
  report.push('폴더: ' + folder.getUrl());
  report.push('확인할 것: ① A4 가로 한 장인가 ② 한글이 깨지지 않는가 ③ 10초 안에 끝났는가 ④ 휴대폰에서 열리는가(?page=printspike)');
  console.log(report.join('\n'));
  return report;
}

/* ───────────── 휴대폰 화면(?page=printspike)용 공개 함수 ───────────── */

/** 미리보기용 HTML(iframe.srcdoc에 넣는다) */
function spikeGetHtml() {
  assertOwnerRun_();
  return spikeBuildHtml_(spikeBuildModel_());
}

/** 앱이 파일을 base64로 직접 내려주는 방식(공유 없음). method: 'A' | 'B' */
function spikeGetPdfBase64(method) {
  assertOwnerRun_();
  var t0 = Date.now();
  var blob = method === 'B' ? spikeMakePdfB_([]) : spikeMakePdfA_();
  var bytes = blob.getBytes();
  return { name: blob.getName(), base64: Utilities.base64Encode(bytes), bytes: bytes.length, ms: Date.now() - t0 };
}

/** Drive에 저장하고 링크를 내려주는 방식. 소유자 본인만 열 수 있다. */
function spikeGetPdfLink(method) {
  assertOwnerRun_();
  var t0 = Date.now();
  var blob = method === 'B' ? spikeMakePdfB_([]) : spikeMakePdfA_();
  var saved = spikeSave_(blob, spikeFolder_());
  return { name: saved.name, url: saved.url, bytes: saved.bytes, ms: Date.now() - t0 };
}
