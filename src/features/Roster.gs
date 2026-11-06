/**
 * F0 명단 업로드 — C3 1차: 붙여넣은 글(TSV/CSV)을 표로 바꾸고 모양을 검사한다. PRD 10.2.
 * 신규·변경·퇴실 후보 비교(RULES R2의 parseRosterTable_·diffRoster_)와 저장은 R2 병합 뒤 다음 PR.
 *
 * 순수 함수(rosterParseText_ 등)는 tests/features/roster_parse.test.js가 검사한다.
 * 이 파일은 명단 내용을 저장하지 않는다(미리보기는 개수·줄 번호만 돌려준다).
 */

/** PRD 10.2 학생 명단 열 순서 */
var ROSTER_COLUMNS = ['학번', '학년', '반', '번호', '이름', '성별', '계열', '학사', '기숙사', '베리타스',
  '조식', '석식', '통학구분', '담당교사이메일', '학생구글계정', '비고'];
var ROSTER_MIN_COLUMNS = 15;          // 맨 끝 '비고'는 비워 둘 수 있다
var ROSTER_MAX_CHARS = 300000;
var ROSTER_MAX_ROWS = 2000;

/**
 * 붙여넣은 글 → 2차원 배열. 구분은 첫 줄에 탭이 있으면 탭(시트에서 복사), 아니면 쉼표(CSV).
 * 큰따옴표로 감싼 칸 안의 구분 문자·줄바꿈·""(따옴표 하나)를 처리한다. 맨 앞 BOM·끝의 빈 줄은 버린다.
 * @return {{delimiter:string, rows:string[][], errors:{line:number,message:string}[]}}
 */
function rosterParseText_(text) {
  var src = String(text == null ? '' : text).replace(/^﻿/, '');
  var errors = [];
  if (src.length > ROSTER_MAX_CHARS) {
    return { delimiter: '', rows: [], errors: [{ line: 0, message: '내용이 너무 깁니다. 명단을 나누어 올려 주세요.' }] };
  }
  var firstLine = src.split(/\r\n|\n|\r/)[0] || '';
  var delim = firstLine.indexOf('\t') >= 0 ? '\t' : ',';
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  var quoteLine = 0;
  var line = 1;
  var atFieldStart = true;
  for (var i = 0; i < src.length; i++) {
    var ch = src.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) { inQuotes = true; quoteLine = line; atFieldStart = false; continue; }
    if (ch === delim) { row.push(field); field = ''; atFieldStart = true; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src.charAt(i + 1) === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; atFieldStart = true; line++;
      continue;
    }
    field += ch;
    atFieldStart = false;
  }
  if (inQuotes) {
    errors.push({ line: quoteLine, message: '큰따옴표가 닫히지 않았습니다. 이 줄의 따옴표를 확인해 주세요.' });
  } else if (field !== '' || row.length) {
    row.push(field); rows.push(row);
  }
  // 끝의 완전히 빈 줄 버리기, 칸 앞뒤 공백 정리
  rows = rows.map(function (r) { return r.map(function (c) { return String(c).trim(); }); });
  while (rows.length && rows[rows.length - 1].every(function (c) { return c === ''; })) rows.pop();
  if (rows.length > ROSTER_MAX_ROWS) {
    errors.push({ line: 0, message: '줄이 ' + ROSTER_MAX_ROWS + '개를 넘습니다. 명단을 나누어 올려 주세요.' });
  }
  return { delimiter: delim === '\t' ? 'tab' : 'comma', rows: rows, errors: errors };
}

/**
 * 모양 검사: 머리글 줄을 떼고, 줄마다 칸 수가 맞는지 본다. 내용(성별 값 등)은 R2 규칙이 검사한다.
 * @return {{hasHeader:boolean, headerOk:boolean, data:string[][], firstDataLine:number, errors:{line:number,message:string}[]}}
 */
function rosterCheckShape_(parsed) {
  var errors = (parsed.errors || []).slice();
  var rows = parsed.rows || [];
  var hasHeader = rows.length > 0 && rows[0][0] === ROSTER_COLUMNS[0];
  var headerOk = true;
  if (hasHeader) {
    headerOk = ROSTER_COLUMNS.slice(0, ROSTER_MIN_COLUMNS).every(function (c, i) { return rows[0][i] === c; });
    if (!headerOk) {
      errors.push({ line: 1, message: '머리글 순서가 양식과 다릅니다. 양식: ' + ROSTER_COLUMNS.join(', ') });
    }
  }
  var data = hasHeader ? rows.slice(1) : rows;
  var first = hasHeader ? 2 : 1;
  // 줄 번호는 붙여넣은 글의 줄 기준(큰따옴표 안 줄바꿈이 없으면 행 번호와 같다)
  data.forEach(function (r, i) {
    var n = r.length;
    while (n > ROSTER_MIN_COLUMNS && r[n - 1] === '') n--;      // 끝의 빈 칸은 무시
    if (n < ROSTER_MIN_COLUMNS || n > ROSTER_COLUMNS.length) {
      errors.push({ line: first + i, message: '칸이 ' + n + '개입니다. ' + ROSTER_MIN_COLUMNS + '~' + ROSTER_COLUMNS.length +
        '개여야 합니다(학번…학생구글계정[,비고]). 빠진 칸이나 구분 문자를 확인해 주세요.' });
    }
  });
  if (!data.length && !errors.length) errors.push({ line: 0, message: '붙여넣은 내용이 없습니다.' });
  return { hasHeader: hasHeader, headerOk: headerOk, data: data, firstDataLine: first, errors: errors };
}

/* ───────────── 화면에서 부르는 서버 함수 ───────────── */

/**
 * 명단 붙여넣기 미리보기(1차): 형식만 검사해서 개수와 문제 줄을 돌려준다. 아무것도 저장하지 않는다.
 * 관리자만. 명단 내용(이름 등)은 응답에 넣지 않는다.
 */
function previewRoster(text) {
  requirePermission_('roster.edit');
  var parsed = rosterParseText_(text);
  var shape = rosterCheckShape_(parsed);
  return {
    delimiter: parsed.delimiter,
    hasHeader: shape.hasHeader,
    rowCount: shape.data.length,
    errors: shape.errors.slice(0, 50),
    errorCount: shape.errors.length,
    ok: shape.errors.length === 0
  };
}
