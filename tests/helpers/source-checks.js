/**
 * 소스 코드 검사기(소유: 총괄). tests/core/security.test.js가 src에 적용하고,
 * 같은 파일에서 일부러 나쁜 문자열을 넣어 검사기가 제대로 잡는지도 확인한다.
 * 모두 순수 함수: 코드 문자열을 받아 찾은 것 목록을 돌려준다(없으면 빈 배열).
 */
const vm = require('vm');

function lineAt(code, index) {
  return code.slice(0, index).split('\n').length;
}

function scan(code, re) {
  const found = [];
  const g = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(code))) found.push({ token: m[0].replace(/\s+/g, ' ').trim(), line: lineAt(code, m.index) });
  return found;
}

/**
 * 최상위(전역) 이름 목록.
 * - 줄 맨 앞의 function / var / let / const / class 선언(같은 파일 안 중복도 보이도록 모두)
 * - 파일을 빈 vm에서 실행해 생긴 전역(var a, b 처럼 한 줄에 여럿, 들여 쓴 최상위 선언)
 * @return {{name:string, line:number}[]} line 0 = vm으로만 찾은 이름
 */
function topLevelNames(code, filename) {
  const found = [];
  const re = /^(?:async\s+)?(?:function\s*\*?\s*|var\s+|let\s+|const\s+|class\s+)([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code))) found.push({ name: m[1], line: lineAt(code, m.index) });

  const sandbox = vm.createContext({ console: console });
  const baseline = new Set(Object.keys(sandbox));
  vm.runInContext(code, sandbox, { filename: filename || 'code.gs' });
  for (const k of Object.keys(sandbox)) {
    if (!baseline.has(k) && !found.some(function (f) { return f.name === k; })) found.push({ name: k, line: 0 });
  }
  return found;
}

/**
 * 여러 파일에 걸친 전역 이름 중복. Apps Script는 모든 .gs를 한 전역 공간에 합치고
 * 같은 이름은 경고 없이 덮어쓴다.
 * @param {Object<string,string>} filesMap {파일 이름: 코드}
 * @return {{name:string, where:string[]}[]}
 */
function findDuplicateGlobals(filesMap) {
  const seen = {};
  for (const file of Object.keys(filesMap).sort()) {
    for (const n of topLevelNames(filesMap[file], file)) {
      (seen[n.name] = seen[n.name] || []).push(file + (n.line ? ':' + n.line : ''));
    }
  }
  return Object.keys(seen).sort()
    .filter(function (name) { return seen[name].length > 1; })
    .map(function (name) { return { name: name, where: seen[name] }; });
}

/** 문자열을 HTML로 해석하는 브라우저 API(XSS 위험). 주석 안에 써도 잡는다. */
const UNSAFE_HTML_RE = /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|\bdocument\s*\.\s*write(?:ln)?\b/;

function findUnsafeHtml(code) {
  return scan(code, UNSAFE_HTML_RE);
}

/** 순수 함수 폴더(src/rules, src/print)에서 금지: Apps Script 서비스 호출과 현재 시각 읽기 */
const GAS_SERVICES = [
  'SpreadsheetApp', 'DriveApp', 'DocumentApp', 'GmailApp', 'MailApp', 'CalendarApp',
  'Utilities', 'Session', 'PropertiesService', 'LockService', 'CacheService',
  'HtmlService', 'ContentService', 'ScriptApp', 'UrlFetchApp', 'Logger'
];
// 서비스 이름 뒤에 . ( [ 가 오면 사용으로 본다(주석의 "Session을" 같은 낱말은 통과).
const GAS_SERVICE_RE = new RegExp('\\b(?:' + GAS_SERVICES.join('|') + ')\\s*[.(\\[]');
// 인자 없는 new Date() / new Date, 그리고 Date.now()
const CLOCK_RE = /\bnew\s+Date\s*\(\s*\)|\bnew\s+Date\b(?!\s*\()|\bDate\s*\.\s*now\b/;

function findImpureCalls(code) {
  return scan(code, GAS_SERVICE_RE).concat(scan(code, CLOCK_RE))
    .sort(function (a, b) { return a.line - b.line; });
}

module.exports = {
  topLevelNames, findDuplicateGlobals, findUnsafeHtml, findImpureCalls, GAS_SERVICES
};
