/**
 * xlsx 작성기(결정 67): 엑셀 파일 안의 XML 문서들을 만드는 순수 함수(서비스·현재 시각을 쓰지 않는다).
 * 압축(zip)은 호출하는 쪽이 Apps Script의 zip 도구로 한다 — 권한을 더하지 않고 Drive에 임시 파일을 만들지 않는다.
 * 근무 기록표(DutyRecordXlsx.gs)와 식수 집계(코딩B)가 같이 쓴다.
 *
 * printXlsxFiles_(wb) → [{path, text}]  (zip에 이 순서대로 넣는다. 첫 파일이 [Content_Types].xml)
 *   wb = { sheets: [{
 *     name: '월별 근무표',                      // 31자 이하, [ ] : * ? / \ 는 '-'로 바꾼다. 같은 이름이 둘이면 오류
 *     cols: [12, 12, …],                         // 열 너비(글자 수), 없으면 기본
 *     rows: [ { h: 30, cells: [cell, …] }, [cell, …] ],   // 행: 배열이거나 {h(높이 pt), cells}
 *     merges: ['A1:G1'],                         // 합칠 칸
 *     freeze: { rows: 1, cols: 0 },              // 틀 고정(선택)
 *     landscape: true                            // 가로 인쇄(선택), 쪽 너비에 맞춤
 *   }] }
 *   cell = null(빈 칸) | 문자열 | 숫자 | { v: 문자열|숫자|null, s: 스타일 이름 }
 *   스타일: PRINT_XLSX_STYLES의 키(없는 이름은 오류). 글은 모두 문자열(inlineStr)로 넣어 서식이 값을 바꾸지 않는다(0으로 시작하는 번호 등).
 * 학생 이름·이메일을 넣는 것은 부르는 쪽 책임(근무 기록표는 교사 이름만).
 */
var PRINT_XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
var PRINT_XLSX_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** 스타일 이름 → cellXfs 번호(styles.xml의 순서와 같아야 한다) */
var PRINT_XLSX_STYLES = {
  normal: 0, title: 1, head: 2, text: 3, num: 4, big: 5, small: 6, note: 7, day: 8, dayhead: 9, dim: 10, total: 11, label: 12
};

/** XML 글자 이스케이프 + XML 1.0에서 쓸 수 없는 제어 문자 제거 */
function printXlsxEsc_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 0 → 'A', 25 → 'Z', 26 → 'AA' */
function printXlsxCol_(i) {
  var s = '';
  i = Math.floor(i);
  if (!(i >= 0)) throw new Error('열 번호가 올바르지 않습니다: ' + i);
  do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return s;
}

function printXlsxSheetName_(name) {
  var s = String(name === undefined || name === null ? '' : name).replace(/[\[\]:*?\/\\]/g, '-').trim();
  if (!s) throw new Error('시트 이름이 비었습니다.');
  return s.length > 31 ? s.slice(0, 31) : s;
}

function printXlsxStyleIndex_(name) {
  if (name === undefined || name === null || name === '') return 0;
  if (!Object.prototype.hasOwnProperty.call(PRINT_XLSX_STYLES, name)) throw new Error('알 수 없는 스타일입니다: ' + name);
  return PRINT_XLSX_STYLES[name];
}

/** 칸 하나 → <c …> XML. ref는 'B3' 같은 위치 */
function printXlsxCell_(cell, ref) {
  if (cell === null || cell === undefined) return '';
  var v = cell, style = 0;
  if (typeof cell === 'object') { v = cell.v; style = printXlsxStyleIndex_(cell.s); }
  var s = style ? ' s="' + style + '"' : '';
  if (v === null || v === undefined || v === '') return style ? '<c r="' + ref + '"' + s + '/>' : '';
  if (typeof v === 'number') {
    if (!isFinite(v)) throw new Error('숫자가 올바르지 않습니다(' + ref + ')');
    return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
  }
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + printXlsxEsc_(v) + '</t></is></c>';
}

/** 시트 하나 → worksheet XML */
function printXlsxSheetXml_(sheet) {
  var rows = sheet.rows || [], maxCol = 0, i, j;
  var body = [];
  for (i = 0; i < rows.length; i++) {
    var row = rows[i], cells = Array.isArray(row) ? row : (row && row.cells) || [], h = !Array.isArray(row) && row && row.h ? row.h : 0;
    var cs = [];
    for (j = 0; j < cells.length; j++) {
      var x = printXlsxCell_(cells[j], printXlsxCol_(j) + (i + 1));
      if (x) cs.push(x);
    }
    if (cells.length > maxCol) maxCol = cells.length;
    if (!cs.length && !h) continue;
    body.push('<row r="' + (i + 1) + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>' + cs.join('') + '</row>');
  }
  var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="' + PRINT_XLSX_NS + '">';
  xml += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
  xml += '<dimension ref="A1:' + printXlsxCol_(Math.max(maxCol, 1) - 1) + Math.max(rows.length, 1) + '"/>';
  var fz = sheet.freeze || null;
  if (fz && (fz.rows || fz.cols)) {
    var tl = printXlsxCol_(fz.cols || 0) + ((fz.rows || 0) + 1);
    xml += '<sheetViews><sheetView workbookViewId="0"><pane' + (fz.cols ? ' xSplit="' + fz.cols + '"' : '') + (fz.rows ? ' ySplit="' + fz.rows + '"' : '') +
      ' topLeftCell="' + tl + '" activePane="' + (fz.rows && fz.cols ? 'bottomRight' : (fz.rows ? 'bottomLeft' : 'topRight')) + '" state="frozen"/></sheetView></sheetViews>';
  } else {
    xml += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  }
  xml += '<sheetFormatPr defaultRowHeight="15"/>';
  if (sheet.cols && sheet.cols.length) {
    xml += '<cols>' + sheet.cols.map(function (w, k) { return '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + (w > 0 ? w : 9) + '" customWidth="1"/>'; }).join('') + '</cols>';
  }
  xml += '<sheetData>' + body.join('') + '</sheetData>';
  var merges = (sheet.merges || []).filter(function (m) { return /^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/.test(String(m)); });
  if (merges.length !== (sheet.merges || []).length) throw new Error('합치는 칸 모양이 올바르지 않습니다(예: A1:G1)');
  if (merges.length) xml += '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>';
  xml += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
  xml += '<pageSetup paperSize="9" orientation="' + (sheet.landscape ? 'landscape' : 'portrait') + '" fitToWidth="1" fitToHeight="0"/>';
  return xml + '</worksheet>';
}

/** 글꼴·칠·테두리·서식 목록(번호는 PRINT_XLSX_STYLES와 맞춘다) */
function printXlsxStylesXml_() {
  var font = function (sz, bold, color) { return '<font>' + (bold ? '<b/>' : '') + '<sz val="' + sz + '"/><color rgb="' + (color || 'FF000000') + '"/><name val="맑은 고딕"/><family val="2"/></font>'; };
  var fill = function (rgb) { return '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>'; };
  var border = '<border><left style="thin"><color rgb="FF808080"/></left><right style="thin"><color rgb="FF808080"/></right><top style="thin"><color rgb="FF808080"/></top><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border>';
  var xf = function (font, fillId, borderId, h, v, wrap) {
    return '<xf numFmtId="0" fontId="' + font + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0" applyFont="1"' + (fillId ? ' applyFill="1"' : '') + (borderId ? ' applyBorder="1"' : '') +
      ' applyAlignment="1"><alignment' + (h ? ' horizontal="' + h + '"' : '') + ' vertical="' + (v || 'center') + '"' + (wrap ? ' wrapText="1"' : '') + '/></xf>';
  };
  // 글꼴 0 기본, 1 굵게 14, 2 굵게 11, 3 크게 굵게 13, 4 작은 회색 9, 5 보통 10
  var fonts = [font(11), font(14, true), font(11, true), font(13, true), font(9, false, 'FF595959'), font(10)];
  var fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', fill('FFD9D9D9'), fill('FFF2F2F2')];
  var xfs = [
    xf(0, 0, 0, '', 'center', false),          // 0 normal
    xf(1, 0, 0, 'left', 'center', false),      // 1 title
    xf(2, 2, 1, 'center', 'center', true),     // 2 head
    xf(5, 0, 1, 'left', 'center', true),       // 3 text
    xf(5, 0, 1, 'center', 'center', false),    // 4 num
    xf(3, 0, 1, 'center', 'center', false),    // 5 big(근무 합계)
    xf(4, 0, 1, 'center', 'center', false),    // 6 small(조별 참고)
    xf(4, 0, 0, 'left', 'top', true),          // 7 note(테두리 없는 작은 글)
    xf(5, 0, 1, 'left', 'top', true),          // 8 day(달력 칸)
    xf(2, 2, 1, 'center', 'center', false),    // 9 dayhead(요일 머리)
    xf(4, 3, 1, 'left', 'top', true),          // 10 dim(운영 안 하는 날·달 밖)
    xf(2, 3, 1, 'center', 'center', false),    // 11 total(합계 줄)
    xf(2, 0, 0, 'left', 'center', false)       // 12 label(소제목)
  ];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="' + PRINT_XLSX_NS + '">' +
    '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
    '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' + border + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

/** 통합 문서 → zip에 넣을 파일 목록 */
function printXlsxFiles_(wb) {
  var sheets = (wb && wb.sheets) || [];
  if (!sheets.length || sheets.length > 8) throw new Error('시트는 1~8개여야 합니다.');
  var names = [], seen = {};
  sheets.forEach(function (sh) {
    var n = printXlsxSheetName_(sh && sh.name);
    if (seen[n.toLowerCase()]) throw new Error('같은 이름의 시트가 둘 있습니다: ' + n);
    seen[n.toLowerCase()] = true;
    names.push(n);
  });
  var files = [];
  var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  files.push({ path: '[Content_Types].xml', text: ct });
  files.push({ path: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="' + PRINT_XLSX_REL_NS + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  files.push({ path: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="' + PRINT_XLSX_NS + '" xmlns:r="' + PRINT_XLSX_REL_NS + '"><bookViews><workbookView/></bookViews><sheets>' +
    names.map(function (n, i) { return '<sheet name="' + printXlsxEsc_(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
  files.push({ path: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + PRINT_XLSX_REL_NS + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
    '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + PRINT_XLSX_REL_NS + '/styles" Target="styles.xml"/></Relationships>' });
  files.push({ path: 'xl/styles.xml', text: printXlsxStylesXml_() });
  sheets.forEach(function (sh, i) { files.push({ path: 'xl/worksheets/sheet' + (i + 1) + '.xml', text: printXlsxSheetXml_(sh) }); });
  return files;
}
