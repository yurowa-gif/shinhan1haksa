/**
 * 권장 이수 과목 CSV 검사(소유: RESEARCH). 순수 함수: 레코드 배열을 받아 오류 문장 배열을 돌려준다.
 * course_recs.test.js 가 실제 파일과 일부러 틀린 예시 둘 다에 쓴다.
 */
const HEADER = ['base_year', 'university', 'unit', 'core_courses', 'recommended_courses', 'source_url', 'source_title'];
const SOURCES_HEADER = ['source_title', 'publisher', 'url', 'published_date', 'retrieved_at', 'page'];
const MAP_HEADER = ['source_name', 'standard_name'];

// docs/research/course-recs-plan.md 5절과 같이 고친다.
const ALLOWED_DOMAINS = [
  'snu.ac.kr', 'yonsei.ac.kr', 'korea.ac.kr', 'skku.edu', 'khu.ac.kr', 'cau.ac.kr',
  'pusan.ac.kr', 'knu.ac.kr', 'jnu.ac.kr', 'cnu.ac.kr', 'chungbuk.ac.kr', 'jbnu.ac.kr',
  'kangwon.ac.kr', 'gnu.ac.kr', 'jejunu.ac.kr',
  'adiga.kr', 'kcue.or.kr', 'moe.go.kr', 'ncic.re.kr'
];
const REQUIRED = ['base_year', 'university', 'unit', 'source_url', 'source_title'];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(^|[^0-9])0\d{1,2}[-. )]?\d{3,4}[-. ]?\d{4}([^0-9]|$)/;

function isAllowedUrl(s) {
  let u;
  try { u = new URL(s); } catch (e) { return false; }
  if (u.protocol !== 'https:') return false;
  return ALLOWED_DOMAINS.some(function (d) { return u.hostname === d || u.hostname.endsWith('.' + d); });
}

function splitCourses(s) {
  return s === '' ? [] : s.split(';').map(function (x) { return x.trim(); });
}

/**
 * @param {Object[]} recs  course_recommendations 레코드(_line 포함)
 * @param {Object} ref  { standard: Set<과목명>, map: Object<원문→표준>, sources: Object<문서명→url> }
 * @return {string[]} 오류 문장
 */
function checkRecommendations(recs, ref) {
  const errs = [];
  const keys = {};
  for (const r of recs) {
    const at = r._line + '번째 줄: ';
    for (const h of HEADER) {
      if (r[h] !== r[h].trim()) errs.push(at + h + ' 앞뒤 공백');
      if (EMAIL.test(r[h]) || PHONE.test(r[h])) errs.push(at + h + ' 이메일·전화번호처럼 보이는 값');
    }
    for (const h of REQUIRED) if (r[h] === '') errs.push(at + h + ' 빈칸');
    if (r.base_year !== '' && !/^20[2-9]\d$/.test(r.base_year)) errs.push(at + 'base_year는 대입 학년도 네 자리(예: 2028)');
    if (r.source_url !== '' && !isAllowedUrl(r.source_url)) errs.push(at + 'source_url이 https 공식 도메인이 아님: ' + r.source_url);
    if (r.source_title !== '') {
      if (!Object.prototype.hasOwnProperty.call(ref.sources, r.source_title)) errs.push(at + 'sources.csv에 없는 문서명: ' + r.source_title);
      else if (ref.sources[r.source_title] !== r.source_url) errs.push(at + 'source_url이 sources.csv의 같은 문서 url과 다름');
    }
    const k = [r.base_year, r.university, r.unit].join('|');
    if (keys[k]) errs.push(at + '(base_year, university, unit) 중복(' + keys[k] + '번째 줄)');
    keys[k] = r._line;

    const core = splitCourses(r.core_courses);
    const rec = splitCourses(r.recommended_courses);
    const seen = {};
    for (const c of core.concat(rec)) {
      if (c === '') { errs.push(at + '빈 과목(;가 겹치거나 끝에 있음)'); continue; }
      if (seen[c]) errs.push(at + '같은 과목이 두 번(핵심·권장 겹침 포함): ' + c);
      seen[c] = true;
      if (!ref.standard.has(c) && !Object.prototype.hasOwnProperty.call(ref.map, c)) {
        errs.push(at + '표준 목록·대응표에 없는 과목명: ' + c);
      }
    }
  }
  return errs;
}

/** sources.csv: 빈 문서명·url 금지, 문서명 중복 금지, url 허용 도메인, 날짜 형식. */
function checkSources(srcs) {
  const errs = [];
  const seen = {};
  for (const s of srcs) {
    const at = 'sources.csv ' + s._line + '번째 줄: ';
    for (const h of ['source_title', 'publisher', 'url', 'retrieved_at']) if (s[h] === '') errs.push(at + h + ' 빈칸');
    if (s.url !== '' && !isAllowedUrl(s.url)) errs.push(at + 'url이 https 공식 도메인이 아님: ' + s.url);
    for (const h of ['published_date', 'retrieved_at']) {
      if (s[h] !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(s[h])) errs.push(at + h + ' 형식은 YYYY-MM-DD');
    }
    if (seen[s.source_title]) errs.push(at + '문서명 중복');
    seen[s.source_title] = true;
  }
  return errs;
}

/** course_name_map.csv: 대응 결과는 표준 목록에 있어야 하고, 원문명이 이미 표준이면 안 된다. */
function checkNameMap(rows, standard) {
  const errs = [];
  const seen = {};
  for (const m of rows) {
    const at = 'course_name_map.csv ' + m._line + '번째 줄: ';
    if (m.source_name === '' || m.standard_name === '') errs.push(at + '빈칸');
    if (!standard.has(m.standard_name)) errs.push(at + '표준 목록에 없는 대응 결과: ' + m.standard_name);
    if (standard.has(m.source_name)) errs.push(at + '원문명이 이미 표준 과목명: ' + m.source_name);
    if (seen[m.source_name]) errs.push(at + '원문명 중복');
    seen[m.source_name] = true;
  }
  return errs;
}

module.exports = { HEADER, SOURCES_HEADER, MAP_HEADER, ALLOWED_DOMAINS, isAllowedUrl, checkRecommendations, checkSources, checkNameMap };
