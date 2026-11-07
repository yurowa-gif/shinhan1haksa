/**
 * 자료조사 CSV 도구(소유: RESEARCH). tests/research/*.test.js 가 쓴다.
 * RFC 4180 수준: 큰따옴표 칸, 칸 안의 쉼표·줄바꿈, "" 이스케이프. BOM은 거부한다.
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../helpers/harness');

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) throw new Error('BOM이 있습니다. UTF-8(BOM 없음)으로 저장하세요');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') {
      if (cell !== '') throw new Error((rows.length + 1) + '번째 줄: 칸 중간의 큰따옴표');
      q = true;
    } else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (q) throw new Error('닫히지 않은 큰따옴표');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** 저장소 루트 기준 경로의 CSV를 읽어 { header, records(객체 배열), line(번호) } 로 돌려준다. */
function readCsv(rel) {
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const header = rows[0] || [];
  const records = rows.slice(1).map(function (r, i) {
    if (r.length !== header.length) {
      throw new Error(rel + ' ' + (i + 2) + '번째 줄: 칸 수 ' + r.length + ' (헤더 ' + header.length + ')');
    }
    const o = { _line: i + 2 };
    header.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
  return { header: header, records: records };
}

module.exports = { parseCsv, readCsv };
