/** RS3·RS4 권장 이수 과목 CSV 형식 검사. 실제 파일 + 일부러 틀린 예시. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { readCsv } = require('./csv');
const C = require('./course_recs_check');

const DIR = 'data/course_recommendations/';
const recs = readCsv(DIR + 'course_recommendations.csv');
const srcs = readCsv(DIR + 'sources.csv');
const map = readCsv(DIR + 'course_name_map.csv');
const std = readCsv(DIR + 'standard_courses_2022.csv');

const standard = new Set(std.records.map(function (r) { return r.course; }));
const mapObj = {};
map.records.forEach(function (m) { mapObj[m.source_name] = m.standard_name; });
const sourceUrl = {};
srcs.records.forEach(function (s) { sourceUrl[s.source_title] = s.url; });
const ref = { standard: standard, map: mapObj, sources: sourceUrl };

test('세 파일 헤더가 정확히 일치', () => {
  assert.deepStrictEqual(recs.header, C.HEADER);
  assert.deepStrictEqual(srcs.header, C.SOURCES_HEADER);
  assert.deepStrictEqual(map.header, C.MAP_HEADER);
});

test('실제 파일: course_recommendations.csv 오류 없음', () => {
  assert.deepStrictEqual(C.checkRecommendations(recs.records, ref), []);
});
test('실제 파일: sources.csv 오류 없음', () => {
  assert.deepStrictEqual(C.checkSources(srcs.records), []);
});
test('실제 파일: course_name_map.csv 오류 없음', () => {
  assert.deepStrictEqual(C.checkNameMap(map.records, standard), []);
});

// ---- 검사기가 정말 잡는지: 일부러 틀린 예시(가짜 대학·가짜 문서) ----
const T = '가짜대 2028 권장과목 안내';
const U = 'https://admission.snu.ac.kr/example';
const fakeRef = { standard: new Set(['물리학', '화학', '기하', '확률과 통계']), map: { '확률과통계': '확률과 통계' }, sources: { [T]: U } };
function row(o, line) {
  return Object.assign({ _line: line || 2, base_year: '2028', university: '가짜대', unit: '물리학과',
    core_courses: '물리학', recommended_courses: '화학;기하', source_url: U, source_title: T, note: '' }, o);
}
function errsOf(rows) { return C.checkRecommendations(rows, fakeRef).join('\n'); }

test('검사기: 맞는 행·미제시 행(두 과목 칸 빈칸)·조건 note·대응표 과목은 통과', () => {
  assert.strictEqual(errsOf([row({ note: '과학 진로선택 3과목 이상' }), row({ unit: '자유전공', core_courses: '', recommended_courses: '' }, 3),
    row({ unit: '수학과', core_courses: '', recommended_courses: '확률과통계' }, 4)]), '');
});

test('검사기: 잡아야 할 것을 잡는다', () => {
  const cases = [
    [{ source_url: '' }, /source_url 빈칸/],
    [{ source_title: '' }, /source_title 빈칸/],
    [{ unit: '' }, /unit 빈칸/],
    [{ base_year: '28' }, /base_year/],
    [{ source_url: 'http://admission.snu.ac.kr/x' }, /공식 도메인/],
    [{ source_url: 'https://blog.example.com/x' }, /공식 도메인/],
    [{ source_url: 'https://evilsnu.ac.kr/x' }, /공식 도메인/],
    [{ source_title: '없는 문서' }, /sources.csv에 없는/],
    [{ source_url: 'https://www.snu.ac.kr/other' }, /url과 다름/],
    [{ recommended_courses: '물리학Ⅱ' }, /없는 과목명: 물리학Ⅱ/],
    [{ recommended_courses: '물리학' }, /두 번/],
    [{ recommended_courses: '화학;' }, /빈 과목/],
    [{ unit: ' 물리학과' }, /앞뒤 공백/],
    [{ unit: '문의 010-1234-5678' }, /전화번호/],
    [{ unit: 'a@b.kr' }, /이메일/],
    [{ note: '문의 02-123-4567' }, /note 이메일·전화번호/]
  ];
  for (const c of cases) assert.match(errsOf([row(c[0])]), c[1], JSON.stringify(c[0]));
  assert.match(errsOf([row({}), row({}, 3)]), /중복\(2번째 줄\)/);
});

test('검사기: sources.csv·대응표', () => {
  const s = function (o, l) { return Object.assign({ _line: l || 2, source_title: T, publisher: '가짜대 입학처', url: U, published_date: '2025-06-30', retrieved_at: '2026-11-06', page: '3' }, o); };
  assert.deepStrictEqual(C.checkSources([s({})]), []);
  assert.match(C.checkSources([s({ url: 'https://cafe.naver.com/x' })]).join(), /공식 도메인/);
  assert.match(C.checkSources([s({ retrieved_at: '2026/11/06' })]).join(), /YYYY-MM-DD/);
  assert.deepStrictEqual(C.checkSources([s({ published_date: '2026-04' })]), []);
  assert.match(C.checkSources([s({ retrieved_at: '2026-11' })]).join(), /retrieved_at/);
  assert.match(C.checkSources([s({}), s({}, 3)]).join(), /문서명 중복/);
  const st = fakeRef.standard;
  assert.deepStrictEqual(C.checkNameMap([{ _line: 2, source_name: '확률과통계', standard_name: '확률과 통계' }], st), []);
  assert.match(C.checkNameMap([{ _line: 2, source_name: '물리학Ⅱ', standard_name: '물리학 Ⅱ' }], st).join(), /표준 목록에 없는/);
  assert.match(C.checkNameMap([{ _line: 2, source_name: '화학', standard_name: '화학' }], st).join(), /이미 표준/);
});

test('허용 도메인 목록이 계획 문서(course-recs-plan.md 5절)와 같다', () => {
  const fs = require('fs');
  const path = require('path');
  const { ROOT } = require('../helpers/harness');
  const p = path.join(ROOT, 'docs/research/course-recs-plan.md');
  if (!fs.existsSync(p)) return; // RS1 병합 전에는 건너뜀
  const doc = fs.readFileSync(p, 'utf8');
  for (const d of C.ALLOWED_DOMAINS) assert.ok(doc.indexOf(d) >= 0, '문서에 없는 도메인: ' + d);
});

test('검사기: note 조건에 이름이 나온 과목은 과목 칸에 있어야 한다(예시는 제외)', () => {
  const std = new Set(['물리학', '화학', '기하', '미적분Ⅱ', '생물의 유전', '세포와 물질대사', '지구과학']);
  assert.deepStrictEqual(C.namedInNote('권장(원문): 기하 또는 미적분Ⅱ, 과학', std), ['기하', '미적분Ⅱ']);
  assert.deepStrictEqual(C.namedInNote('핵심(원문): [세포와 물질대사, 생물의 유전 중 3과목]', std), ['세포와 물질대사', '생물의 유전']);
  assert.deepStrictEqual(C.namedInNote('비고: 진로선택 과목 중 생물의 유전을 포함하여 3과목 이상', std), ['생물의 유전']);
  assert.deepStrictEqual(C.namedInNote('핵심(원문): 화학, 그 외는 희망 진로에 따라 물리학 또는 지구과학 등', std), []);
  const fr = { standard: new Set(['기하', '미적분Ⅱ']), map: {}, sources: { [T]: U } };
  assert.match(C.checkRecommendations([row({ core_courses: '', recommended_courses: '기하', note: '기하 또는 미적분Ⅱ' })], fr).join(), /과목 칸에 없음: 미적분Ⅱ/);
});

test('검사기: 같은 모집단위 두 줄은 둘 다 "공식 자료에 유형이 다른 두 행"일 때만 허용', () => {
  const two = '공식 자료에 유형이 다른 두 행';
  assert.strictEqual(errsOf([row({ note: two }), row({ note: two }, 3)]), '');
  assert.match(errsOf([row({ note: two }), row({}, 3)]), /중복/);
});
