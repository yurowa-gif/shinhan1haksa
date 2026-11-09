/** D8: 식수 집계 렌더러(printRenderMealCounts_) — R12 mealCountsOn_ 결과를 그대로 그리고, 합계가 안 맞으면 경고하며, 그려진 칸을 읽어 숫자와 맞춘다 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');
const { buildModel } = require('../../design/preview/meal-counts-fixture');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/MealCountsHtml.gs']);
const clone = (x) => JSON.parse(JSON.stringify(x));
const render = (m) => ctx.printRenderMealCounts_(clone(m), {});
const count = (s, sub) => s.split(sub).length - 1;
const COLS = ['hall', 'dorm', 'nonDorm', 'breakfast', 'hallDinner', 'generalDinner'];

/** 표(<tbody>)를 읽는다 → [{name, v:[학사, 기숙, 비기숙, 조식, 석식 학사, 석식 일반, 석식 계]}] */
function readTable(html) {
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  return body.split('<tr').slice(1).map((tr) => {
    const c = [...tr.matchAll(/<(th|td)[^>]*>(.*?)<\/\1>/g)].map((m) => m[2]);
    return { name: c[0], v: c.slice(1).map((x) => (x === '?' ? x : Number(x))) };
  });
}

test('식수 집계 표: 줄 순서·숫자·석식 계가 모델과 같다(그려진 칸을 읽어 비교)', () => {
  const m = buildModel();
  const t = readTable(render(m));
  assert.deepStrictEqual(t.map((r) => r.name), ['여1', '여2', '여3', '여 합계', '남1', '남2', '남3', '남 합계', '1학년', '2학년', '3학년', '전체']);
  t.forEach((r) => {
    const g = m.counts.groups[r.name];
    assert.deepStrictEqual(r.v, COLS.map((c) => g[c]).concat([g.hallDinner + g.generalDinner]), r.name);
  });
  assert.deepStrictEqual(t[11].v, [30, 24, 6, 23, 27, 3, 30]);
});

test('R12 mealCountsOn_ 결과를 그대로 받아 그린다(결정 35: 퇴실 후 석식 유지 인원, 모르는 학생 경고)', () => {
  const ST = (id, gender, grade) => ({ id, student_no: '', name: '가짜' + id, gender, grade });
  const EN = (sid) => ({ id: 'e' + sid, term_id: 'T1', student_id: sid });
  let n = 0;
  const CH = (sid, item, value, eff, extra) => Object.assign({ id: 'c' + (++n), student_id: sid, item, value, effective_date: eff, status: '유효', requested_at: '', created_at: '', source: '명단업로드' }, extra || {});
  const stu = (sid, hall, dorm, bf, dn) => [CH(sid, '학사', hall, '2027-03-01'), CH(sid, '기숙사', dorm, '2027-03-01'), CH(sid, '조식', bf, '2027-03-01'), CH(sid, '석식', dn, '2027-03-01')];
  const students = [ST('a', '여', '1'), ST('b', '남', '2'), ST('c', '남', '2'), ST('x', '', '1')];
  const f6 = { source: 'F6', requested_at: '2027-03-03T15:00:00' };
  const changes = [].concat(stu('a', '입실', '입실', '실시', '학사 석식'), stu('b', '입실', '퇴실', '실시', '일반 석식'),
    stu('c', '입실', '입실', '실시', '학사 석식'), stu('x', '입실', '퇴실', '실시', '학사 석식'),
    [CH('c', '학사', '퇴실', '2027-03-05', f6), CH('c', '조식', '미실시', '2027-03-05', f6)]);   // c는 3/5 퇴실, 석식은 중단일 전이라 학사 석식 유지
  const counts = plain(ctx.mealCountsOn_(students, ['a', 'b', 'c', 'x'].map(EN), changes, 'T1', '2027-03-06'));
  const html = ctx.printRenderMealCounts_({ date: '2027-03-06', termName: '2027 1학기', counts, docUnsubmitted: 1 }, {});
  const t = readTable(html);
  t.forEach((r) => {
    const g = counts.groups[r.name];
    assert.deepStrictEqual(r.v, COLS.map((c) => g[c]).concat([g.hallDinner + g.generalDinner]), r.name);
  });
  assert.strictEqual(counts.afterLeaveHallDinner, 1);
  assert.ok(html.indexOf('퇴실 후 석식 유지 1명') > 0 && html.indexOf('서류 미제출 1명') > 0);
  assert.ok(html.indexOf('성별·학년을 알 수 없는 학생 1명은 어느 줄에도 넣지 않았습니다') > 0 && html.indexOf('x 학생의 성별·학년을 알 수 없어') < 0, '개별 경고는 종이에 없고 요약만');
  assert.ok(html.indexOf('합계가 맞지 않습니다') < 0, 'R12 결과는 합계 검사를 통과한다');
});

test('합계가 부분 합과 안 맞으면 조용히 내지 않고 어느 줄인지 경고한다(학사 ≠ 기숙 + 비기숙, 성별·학년·전체)', () => {
  const ok = render(buildModel());
  assert.ok(ok.indexOf('합계가 맞지 않습니다') < 0 && ok.indexOf('※') < 0);
  const bad = buildModel();
  bad.counts.groups['전체'].hall = 31;
  bad.counts.groups['남2'].nonDorm = 0;
  bad.counts.groups['2학년'].breakfast = 8;
  const html = render(bad);
  ['전체: 학사 ≠ 부분 합', '전체: 학사 ≠ 기숙 + 비기숙', '남2: 학사 ≠ 기숙 + 비기숙', '남 합계: 비기숙 ≠ 부분 합', '2학년: 조식 ≠ 부분 합'].forEach((t) => assert.ok(html.indexOf('합계가 맞지 않습니다 — ' + t) > 0, t));
  assert.ok(html.indexOf('<b>※') > 0);
});

test('이상한 입력: 4학년·남4 줄도 순서대로 나오고, 숫자가 아닌 칸은 ?, 줄 없음 안내, 날짜·모델 오류, 이스케이프, 순수', () => {
  const m = buildModel();
  m.counts.groups['남4'] = { hall: 1, dorm: 1, nonDorm: 0, breakfast: 1, hallDinner: 1, generalDinner: 0 };
  m.counts.groups['4학년'] = clone(m.counts.groups['남4']);
  m.counts.groups['여2'].hall = 'x';
  m.counts.groups['기타'] = { hall: 0, dorm: 0, nonDorm: 0, breakfast: 0, hallDinner: 0, generalDinner: 0 };
  m.title = '<script>alert(1)</script>';
  m.termName = '"><img src=x>';
  m.counts.warnings = ['<b>경고</b>'];
  const before = JSON.stringify(m);
  const html = ctx.printRenderMealCounts_(m, {});
  assert.strictEqual(JSON.stringify(m), before);
  assert.strictEqual(html, ctx.printRenderMealCounts_(clone(m), {}));
  const names = readTable(html).map((r) => r.name);
  assert.deepStrictEqual(names, ['여1', '여2', '여3', '여 합계', '남1', '남2', '남3', '남4', '남 합계', '1학년', '2학년', '3학년', '4학년', '전체', '기타']);
  assert.strictEqual(readTable(html)[1].v[0], '?');
  assert.ok(html.indexOf('<script>') < 0 && html.indexOf('<img') < 0 && html.indexOf('<b>경고') < 0 && html.indexOf('&lt;b&gt;경고&lt;/b&gt;') > 0);
  assert.ok(html.indexOf('overflow:hidden') < 0 && !/flex|grid|@import|url\(|<script/.test(html));
  const empty = ctx.printRenderMealCounts_({ date: '2027-03-03', counts: { groups: {} } }, {});
  assert.ok(empty.indexOf('집계할 학생이 없습니다') > 0 && empty.indexOf('서류 미제출') < 0);
  assert.throws(() => ctx.printRenderMealCounts_({ date: '2027-02-30' }, {}), /yyyy-MM-dd/);
  assert.throws(() => ctx.printRenderMealCounts_(null, {}), /모델이 없습니다/);
  assert.ok(ctx.printRenderMealCounts_({ date: '2027-03-03', operating: false, counts: { groups: {} } }, {}).indexOf('이 날은 자습 운영 안 함(참고)') > 0);
  assert.ok(html.indexOf('@page { size: A4 portrait') > 0 && html.indexOf('2027년 3월 3일(수)') > 0);
});

const rowStyle = (html, name) => (new RegExp('<th scope="row" style="([^"]*)">' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</th>').exec(html) || [])[1] || '';

test('고정 문구와 칸: "신청 기준 인원" 문구, 급식실 확인(서명) 칸, 작성자·만든 시각, 운영 여부 문구, 합계 줄만 굵게+회색, 모든 글자 7pt 이상, 내용 폭 515pt(여백 14mm 안)', () => {
  const html = render(buildModel());
  assert.ok(html.indexOf('신청 기준 인원입니다(결석·외박은 반영하지 않습니다).') > 0);
  assert.ok(html.indexOf('급식실 확인(서명)') > 0 && html.indexOf('작성: 관리자') > 0 && html.indexOf('만든 시각 2027-03-03 17:40') > 0);
  assert.ok(html.indexOf('이 날 자습 운영(참고)') > 0);
  assert.ok(ctx.printRenderMealCounts_({ date: '2027-03-03', operating: true, counts: { groups: {} } }, {}).indexOf('이 날 자습 운영(참고)') > 0);
  assert.ok(ctx.printRenderMealCounts_({ date: '2027-03-03', counts: { groups: {} } }, {}).indexOf('자습 운영') < 0, '운영 여부를 모르면 문구 없음');
  ['여 합계', '남 합계', '1학년', '2학년', '3학년', '전체'].forEach((n) => assert.ok(/font-weight:bold;background:#e8e8e8/.test(rowStyle(html, n)), n + ' 줄은 굵게 + 회색'));
  ['여1', '여2', '여3', '남1', '남2', '남3'].forEach((n) => assert.ok(!/font-weight:bold/.test(rowStyle(html, n)) && !/background/.test(rowStyle(html, n)), n + ' 줄은 보통'));
  const sizes = [...html.matchAll(/font-size:([\d.]+)pt/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 10 && sizes.every((x) => x >= 7), '글자 크기 ' + sizes.filter((x) => x < 7));
  assert.ok(html.indexOf('width:515pt') > 0 && html.indexOf('527pt') < 0 && html.indexOf('@page { size: A4 portrait; margin: 14mm; }') > 0);
});

test('합계가 어긋난 모델에서도 찍힌 칸은 모델 값 그대로(숫자를 바꾸지 않는다), 경고는 한 줄에 하나', () => {
  const m = buildModel();
  m.counts.groups['전체'].hall = 31;
  m.counts.groups['남2'].nonDorm = 9;
  m.counts.warnings = ['첫째 경고', '둘째 경고'];
  const html = render(m);
  readTable(html).forEach((r) => {
    const g = m.counts.groups[r.name];
    assert.deepStrictEqual(r.v.slice(0, 6), COLS.map((c) => g[c]), r.name);
  });
  const lines = [...html.matchAll(/<br><b>※ (.*?)<\/b>/g)].map((x) => x[1]);
  assert.ok(lines.indexOf('첫째 경고') >= 0 && lines.indexOf('둘째 경고') >= 0, '경고마다 한 줄');
  assert.ok(lines.some((l) => l.indexOf('합계가 맞지 않습니다 — 전체: 학사 ≠ 부분 합') === 0));
  assert.ok(html.indexOf(' / ') < 0 || html.indexOf('첫째 경고 / ') < 0, '한 줄에 이어 붙이지 않는다');
});

test('R12의 학생마다 반복되는 경고(UUID 등)는 종이에 싣지 않고 "알 수 없는 학생 N명" 한 줄만, 다른 경고는 그대로', () => {
  const m = buildModel();
  m.counts.unknownGroup = ['11111111-aaaa', '22222222-bbbb'];
  m.counts.warnings = ['11111111-aaaa 학생의 성별·학년을 알 수 없어 식수 줄에 넣지 않았습니다', '22222222-bbbb 학생의 성별·학년을 알 수 없어 식수 줄에 넣지 않았습니다', '다른 경고 하나'];
  const html = render(m);
  assert.ok(html.indexOf('11111111') < 0 && html.indexOf('22222222') < 0 && html.indexOf('알 수 없어 식수 줄에') < 0, '학생 id·개별 문장이 종이에 없다');
  assert.strictEqual(count(html, '성별·학년을 알 수 없는 학생 2명은 어느 줄에도 넣지 않았습니다.'), 1);
  assert.ok(html.indexOf('다른 경고 하나') > 0);
  const none = render(buildModel());
  assert.ok(none.indexOf('※') < 0);
});

test('숫자 읽기: 0 이상 정수와 숫자만 든 문자열만 받고 나머지는 ?, 석식 계는 한쪽이 ?면 ?, 서류 미제출은 해석한 숫자', () => {
  const m = buildModel();
  const g = m.counts.groups['여1'];
  g.hall = '4'; g.dorm = ' 3 '; g.nonDorm = ''; g.breakfast = null; g.hallDinner = true; g.generalDinner = 1.5;
  m.counts.groups['여2'].hall = '  ';
  m.counts.groups['여2'].dorm = -1;
  m.counts.groups['여2'].nonDorm = 'x2';
  m.counts.groups['여2'].hallDinner = 3; m.counts.groups['여2'].generalDinner = '0';
  const t = readTable(render(m));
  assert.deepStrictEqual(t[0].v, [4, 3, '?', '?', '?', '?', '?']);
  assert.deepStrictEqual(t[1].v, ['?', '?', '?', 3, 3, 0, 3]);
  const doc = (v) => render(Object.assign(buildModel(), { docUnsubmitted: v }));
  assert.ok(doc('2').indexOf('서류 미제출 2명') > 0 && doc(' 5 ').indexOf('서류 미제출 5명') > 0);
  assert.ok(doc('').indexOf('서류 미제출 ?명') > 0 && doc('많음').indexOf('서류 미제출 ?명') > 0 && doc(true).indexOf('서류 미제출 ?명') > 0);
  assert.ok(doc(null).indexOf('서류 미제출') < 0 && doc(undefined).indexOf('서류 미제출') < 0);
  const after = (v) => { const x = buildModel(); x.counts.afterLeaveHallDinner = v; return render(x); };
  assert.ok(after(2).indexOf('퇴실 후 석식 유지 2명') > 0 && after('').indexOf('퇴실 후 석식 유지 ?명') > 0);
});

test('이스케이프: 줄 이름·작성자·만든 시각·기간 이름의 <script>·따옴표, 모르는 줄 이름도 이스케이프해 그대로', () => {
  const m = buildModel();
  m.counts.groups['<i>줄</i>'] = clone(m.counts.groups['여1']);
  m.preparedBy = '<script>x</script>';
  m.generatedAt = '"><img src=x>';
  const html = render(m);
  assert.ok(html.indexOf('<script>') < 0 && html.indexOf('<img') < 0 && html.indexOf('<i>줄') < 0);
  assert.ok(html.indexOf('&lt;i&gt;줄&lt;/i&gt;') > 0 && html.indexOf('&lt;script&gt;x&lt;/script&gt;') > 0 && html.indexOf('&quot;&gt;&lt;img src=x&gt;') > 0);
  assert.ok(readTable(html).some((r) => r.name === '&lt;i&gt;줄&lt;/i&gt;'));
});
