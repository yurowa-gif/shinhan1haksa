/** S6-1 교육과정 올리기(결정 102): 붙여넣기 → 미리 보기 → 저장. 가짜 편제표(가짜 입학년도 2099)와 data/course_recommendations CSV 그대로. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com', TEACHER = 'test.teacher@example.com';
const DATA = path.join(__dirname, '..', '..', 'data', 'course_recommendations');
const csv = (f) => fs.readFileSync(path.join(DATA, f), 'utf8');

function newEnv() {
  const env = createGasEnv({ owner: OWNER, now: '2027-04-20T10:00:00' });
  env.scriptProps.TEST_TEACHER_EMAIL = TEACHER;
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  return env;
}
const parseCsv = (env, text) => env.asOwner((c) => plain(c.rosterParseText_(text))).rows;

// 가짜 편제표: 입학년도 2099, 시트에서 복사한 탭 구분
const CUR = ['entry_year\tgrade\tsemester\tchoice_group\tpick_n\tcourse',
  '2099\t1\t1\t\t\t공통국어1', '2099\t1\t1\t\t0\t공통수학1',
  '2099\t2\t1\t선택군A\t2\t화법과 언어', '2099\t2\t1\t선택군A\t2\t독서와 작문', '2099\t2\t1\t선택군A\t2\t대수'].join('\n');

test('표준 과목 이름·이름 바꿈 표 상수가 data CSV와 한 글자도 다르지 않다', () => {
  const env = newEnv();
  const std = parseCsv(env, csv('standard_courses_2022.csv'));
  const ci = std[0].indexOf('course');
  assert.deepStrictEqual(std.slice(1).map((r) => r[ci]), env.asOwner((c) => plain(c.CUR_STANDARD_COURSES)));
  const map = parseCsv(env, csv('course_name_map.csv'));
  const got = {}; map.slice(1).forEach((r) => { got[r[0]] = r[1]; });
  assert.deepStrictEqual(got, env.asOwner((c) => plain(c.CUR_NAME_MAP)));
});

test('권장 과목 CSV를 그대로 붙여 넣어 올린다(열 이름 일치, 621줄 중 같은 자리 2쌍은 뒤의 줄만, 내용 같은 줄·표준 이름 경고 없음) — 다시 올리면 변경 없음', () => {
  const env = newEnv();
  const text = csv('course_recommendations.csv');
  const p = env.call(OWNER, 'previewCurriculum', 'recommendations', text);
  assert.strictEqual(p.ok, true, JSON.stringify(p.errors));
  assert.strictEqual(p.counts.rows, 619); assert.strictEqual(p.counts.add, 619); assert.strictEqual(p.counts.remove, 0);
  assert.ok(p.warnings.some((w) => /대학·모집단위가 같은 줄이 2쌍/.test(w) && /뒤의 줄만 쓰입니다/.test(w)), '같은 대학·모집단위 안내');
  assert.ok(!p.warnings.some((w) => /표준 과목 표와 다릅니다/.test(w)), '표준 이름 경고 없음');
  assert.strictEqual(env.rows('course_recommendations', 'config').length, 0, '미리 보기는 쓰지 않는다');
  const r = env.call(OWNER, 'saveCurriculum', 'recommendations', text, { kind: 'recommendations', counts: p.counts });
  assert.strictEqual(r.ok, true);
  const rows = env.rows('course_recommendations', 'config');
  assert.strictEqual(rows.length, 619); assert.ok(rows.every((x) => x.status === '유효' && x.base_year === '2028'));
  const again = env.call(OWNER, 'previewCurriculum', 'recommendations', text);
  assert.strictEqual(again.nothingToDo, true); assert.strictEqual(again.counts.same, 619);
  assert.strictEqual(env.call(OWNER, 'saveCurriculum', 'recommendations', text, { kind: 'recommendations', counts: again.counts }).nothingToDo, true);
  assert.strictEqual(env.rows('course_recommendations', 'config').length, 619);
});

test('가짜 편제표: 미리 보기 개수·저장·읽기, 다시 올리면 그대로, 줄을 빼고 올리면 취소로(삭제 없음) + audit', () => {
  const env = newEnv();
  const p = env.call(OWNER, 'previewCurriculum', 'curriculum', CUR);
  assert.strictEqual(p.ok, true, JSON.stringify(p.errors));
  assert.deepStrictEqual(plain(p.counts), { add: 5, changed: 0, remove: 0, same: 0, rows: 5 });
  assert.ok(!p.warnings.length);
  assert.strictEqual(env.call(OWNER, 'saveCurriculum', 'curriculum', CUR, { kind: 'curriculum', counts: p.counts }).ok, true);
  const rows = env.rows('curriculum_courses', 'config');
  assert.strictEqual(rows.length, 5);
  assert.deepStrictEqual(plain(rows.filter((r) => r.choice_group).map((r) => [r.pick_n, r.course])), [['2', '화법과 언어'], ['2', '독서와 작문'], ['2', '대수']]);
  assert.strictEqual(env.asOwner((c) => c.curriculumRows_('2099')).length, 5);
  // 마지막 줄 하나를 빼고, 한 줄은 새로 → 추가 1·취소 1·그대로 4
  const edited = CUR.split('\n').slice(0, 5).join('\n') + '\n2099\t2\t1\t선택군A\t2\t기하';
  const p2 = env.call(OWNER, 'previewCurriculum', 'curriculum', edited);
  assert.deepStrictEqual(plain(p2.counts), { add: 1, changed: 0, remove: 1, same: 4, rows: 5 });
  assert.deepStrictEqual(plain(p2.lists.remove), ['2099학년 입학 · 2학년 1학기 · 선택군A(택2) · 대수']);
  assert.ok(p2.warnings.some((w) => /"기하"/.test(w)) === false, '기하는 표준 과목');
  env.call(OWNER, 'saveCurriculum', 'curriculum', edited, { kind: 'curriculum', counts: p2.counts });
  const after = env.rows('curriculum_courses', 'config');
  assert.strictEqual(after.length, 6, '삭제 없음');
  assert.deepStrictEqual(plain(after.filter((r) => r.status === '취소').map((r) => r.course)), ['대수']);
  assert.strictEqual(env.asOwner((c) => c.curriculumRows_('2099')).length, 5);
  assert.ok(env.auditActions().includes('bulk_create') && env.auditActions().includes('bulk_update'));
});

test('다른 입학년도는 건드리지 않고, 시트에 이미 있던 줄은 올린 해만 맞춘다', () => {
  const env = newEnv();
  const other = CUR.replace(/2099/g, '2098');
  [CUR, other].forEach((t) => { const p = env.call(OWNER, 'previewCurriculum', 'curriculum', t); env.call(OWNER, 'saveCurriculum', 'curriculum', t, { kind: 'curriculum', counts: p.counts }); });
  assert.strictEqual(env.rows('curriculum_courses', 'config').length, 10);
  const just = CUR.split('\n').slice(0, 3).join('\n');
  const p = env.call(OWNER, 'previewCurriculum', 'curriculum', just);
  assert.deepStrictEqual(plain(p.counts), { add: 0, changed: 0, remove: 3, same: 2, rows: 2 });
  env.call(OWNER, 'saveCurriculum', 'curriculum', just, { kind: 'curriculum', counts: p.counts });
  assert.strictEqual(env.asOwner((c) => c.curriculumRows_('2098')).length, 5);
  assert.strictEqual(env.asOwner((c) => c.curriculumRows_('2099')).length, 2);
});

test('오류가 있으면 아무것도 쓰지 않는다 — 줄 번호·열 이름이 붙고, 열 이름이 다르면 막는다', () => {
  const env = newEnv();
  const bad = ['entry_year,grade,semester,choice_group,pick_n,course', '2099,4,1,,,공통국어1', '2099,1,3,A,,공통수학1', '2099,1,1,A,2,공통국어1', '2099,1,1,A,2,공통국어1', '20,1,1,,,'].join('\n');
  const p = env.call(OWNER, 'previewCurriculum', 'curriculum', bad);
  assert.strictEqual(p.ok, false);
  const has = (line, col) => p.errors.some((e) => e.line === line && e.column === col);
  assert.ok(has(2, 'grade') && has(3, 'semester') && has(3, 'pick_n') && has(5, 'course') && has(6, 'entry_year') && has(6, 'course'), JSON.stringify(p.errors));
  const s = env.call(OWNER, 'saveCurriculum', 'curriculum', bad, { kind: 'curriculum', counts: p.counts });
  assert.strictEqual(s.ok, false);
  assert.strictEqual(env.rows('curriculum_courses', 'config').length, 0);
  const h = env.call(OWNER, 'previewCurriculum', 'curriculum', 'year,grade\n2099,1');
  assert.strictEqual(h.ok, false); assert.ok(/빠진 열/.test(h.errors[0].message));
  const wrongKind = env.call(OWNER, 'previewCurriculum', 'recommendations', CUR);
  assert.strictEqual(wrongKind.ok, false);
  assert.throws(() => env.call(OWNER, 'previewCurriculum', 'nope', CUR), /종류/);
  const diffPick = CUR.replace('독서와 작문', '독서와 작문').replace(/(독서와 작문)/, '$1').split('\n'); diffPick[3] = '2099\t2\t1\t선택군A\t3\t독서와 작문';
  const d = env.call(OWNER, 'previewCurriculum', 'curriculum', diffPick.join('\n'));
  assert.ok(d.errors.some((e) => e.column === 'pick_n' && /택N/.test(e.message)));
  const big = CUR.split('\n').map((l, i) => (i === 0 ? l : l.replace(/\t2\t/, '\t2\t').replace('선택군A\t2', '선택군A\t4'))).join('\n');
  assert.ok(env.call(OWNER, 'previewCurriculum', 'curriculum', big).errors.some((e) => /과목이 3개인데 택N이 4/.test(e.message)));
  const word = CUR.replace('선택군A\t2\t화법과 언어', '선택군A\t둘\t화법과 언어');
  assert.ok(env.call(OWNER, 'previewCurriculum', 'curriculum', word).errors.some((e) => /택N "둘"은 숫자가 아닙니다/.test(e.message)));
  const mixed = CUR + '\n2098\t1\t1\t\t\t공통국어1';
  assert.ok(env.call(OWNER, 'previewCurriculum', 'curriculum', mixed).errors.some((e) => /2098, 2099\) 섞여 있습니다. 한 번에 한 입학년도만/.test(e.message)));
});

test('표준 과목 표와 다른 이름은 경고만(이름 바꿈 표가 있으면 표준 이름을 알려 줌) — 저장은 된다', () => {
  const env = newEnv();
  const t = 'entry_year,grade,semester,choice_group,pick_n,course\n2099,1,1,,,동아시아 역사기행\n2099,1,1,,,가짜 과목';
  const p = env.call(OWNER, 'previewCurriculum', 'curriculum', t);
  assert.strictEqual(p.ok, true);
  assert.ok(p.warnings.some((w) => /"동아시아 역사기행"/.test(w) && /"동아시아 역사 기행"/.test(w)));
  assert.ok(p.warnings.some((w) => /"가짜 과목"/.test(w) && /표에 없는/.test(w)));
  assert.strictEqual(env.call(OWNER, 'saveCurriculum', 'curriculum', t, { kind: 'curriculum', counts: p.counts }).ok, true);
});

test('미리 본 뒤 시트나 입력이 바뀌면 저장을 거부한다(stale) · expect 없이도 거부', () => {
  const env = newEnv();
  const p = env.call(OWNER, 'previewCurriculum', 'curriculum', CUR);
  const other = CUR.split('\n').slice(0, 3).join('\n');
  const s = env.call(OWNER, 'saveCurriculum', 'curriculum', other, { kind: 'curriculum', counts: p.counts });
  assert.strictEqual(s.stale, true);
  assert.strictEqual(env.call(OWNER, 'saveCurriculum', 'curriculum', CUR).stale, true);
  assert.strictEqual(env.call(OWNER, 'saveCurriculum', 'curriculum', CUR, { kind: 'recommendations', counts: p.counts }).stale, true);
  assert.strictEqual(env.rows('curriculum_courses', 'config').length, 0);
});

test('권한: 관리자만(교사·학생·학부모는 미리 보기도 저장도 못 함)', () => {
  const env = newEnv();
  const stu = env.rows('students')[0];
  ['previewCurriculum', 'saveCurriculum'].forEach((fn) => {
    env.expectDenied(TEACHER, 'curriculum.edit', fn, 'curriculum', CUR, { kind: 'curriculum', counts: {} });
  });
  env.expectAllowed(OWNER, 'previewCurriculum', 'curriculum', CUR);
  const parent = env.rows('users').find((u) => String(u.roles).indexOf('parent') >= 0);
  env.expectDenied(stu.google_email || (parent && parent.email) || 'stranger@example.com', 'curriculum.edit', 'previewCurriculum', 'curriculum', CUR);
});

test('쉼표 CSV·큰따옴표·BOM·권장 과목 같은 줄 합치기', () => {
  const env = newEnv();
  const head = 'base_year,university,unit,core_courses,recommended_courses,source_url,source_title,note';
  const t = '﻿' + head + '\n2099,가짜대,"가짜학과, 가짜전공",물리학;화학,"생명과학; 미적분",https://example.com/a,출처,"메모, 쉼표"\n2099,가짜대,"가짜학과, 가짜전공",물리학;화학,생명과학;미적분,https://example.com/a,출처,"메모, 쉼표"';
  const p = env.call(OWNER, 'previewCurriculum', 'recommendations', t);
  assert.strictEqual(p.ok, true, JSON.stringify(p.errors));
  assert.strictEqual(p.counts.rows, 1);
  assert.ok(p.warnings.some((w) => /뒤의 줄만 쓰입니다/.test(w)));
  env.call(OWNER, 'saveCurriculum', 'recommendations', t, { kind: 'recommendations', counts: p.counts });
  const r = env.asOwner((c) => plain(c.recommendationRows_('2099')))[0];
  assert.strictEqual(r.unit, '가짜학과, 가짜전공'); assert.strictEqual(r.recommended_courses, '생명과학;미적분');
  const badUrl = env.call(OWNER, 'previewCurriculum', 'recommendations', head + '\n2099,가,나,,,ftp://x,,');
  assert.ok(badUrl.errors.some((e) => e.column === 'source_url'));
  assert.ok(env.call(OWNER, 'previewCurriculum', 'recommendations', head + '\n2099,가,나,,,,,').errors.some((e) => e.column === 'source_url' && /출처 주소가 없습니다/.test(e.message)));
});

test('바뀌는 줄: 같은 자리인데 내용이 다르면 옛 줄 취소 + 새 줄, 같은 줄은 그대로(같은 표 두 번 = 0건) · 올라와 있는 자료 요약', () => {
  const env = newEnv();
  const up = (t) => { const p = env.call(OWNER, 'previewCurriculum', 'curriculum', t); return [p, env.call(OWNER, 'saveCurriculum', 'curriculum', t, { kind: 'curriculum', counts: p.counts })]; };
  up(CUR);
  const three = CUR.replace(/선택군A\t2/g, '선택군A\t3');
  const [p, r] = up(three);
  assert.deepStrictEqual(plain(p.counts), { add: 0, changed: 3, remove: 0, same: 2, rows: 5 });
  assert.deepStrictEqual(plain(p.lists.changed).slice(0, 1), ['2099학년 입학 · 2학년 1학기 · 선택군A(택3) · 화법과 언어 (택2 → 택3)']);
  assert.strictEqual(r.ok, true);
  const rows = env.rows('curriculum_courses', 'config');
  assert.strictEqual(rows.length, 8);
  assert.strictEqual(rows.filter((x) => x.status === '취소').length, 3);
  assert.strictEqual(env.asOwner((c) => c.curriculumRows_('2099')).length, 5);
  assert.strictEqual(env.call(OWNER, 'previewCurriculum', 'curriculum', three).nothingToDo, true);
  assert.deepStrictEqual(plain(env.call(OWNER, 'getCurriculumSummary')), { curriculum: [{ year: '2099', rows: 5 }], recommendations: [] });
  env.expectDenied(TEACHER, 'curriculum.edit', 'getCurriculumSummary');
});

test('한글 머리글도 받는다(열 순서 자유, 영어와 섞어도 됨) — 모르는 머리글은 오류', () => {
  const env = newEnv();
  const ko = ['과목\t입학년도\t학년\t학기\t선택군\t택N', '공통국어1\t2099\t1\t1\t\t', '화법과 언어\t2099\t2\t1\t선택군A\t1'].join('\n');
  const p = env.call(OWNER, 'previewCurriculum', 'curriculum', ko);
  assert.strictEqual(p.ok, true, JSON.stringify(p.errors)); assert.strictEqual(p.counts.add, 2);
  const rec = ['기준 연도,대학,모집단위,핵심 과목,권장 과목,출처 주소,출처 제목,비고', '2099,가짜대,가짜학과,물리학,화학,https://example.com,출처,'].join('\n');
  assert.strictEqual(env.call(OWNER, 'previewCurriculum', 'recommendations', rec).ok, true);
  const mix = 'base_year,대학,unit,핵심 권장,권장,source_url,출처제목,note\n2099,가짜대,가짜학과,물리학,화학,https://example.com,출처,';
  assert.strictEqual(env.call(OWNER, 'previewCurriculum', 'recommendations', mix).ok, true);
  const bad = env.call(OWNER, 'previewCurriculum', 'curriculum', ko.replace('택N', '몇개'));
  assert.strictEqual(bad.ok, false); assert.ok(/빠진 열: pick_n/.test(bad.errors[0].message) && /모르는 열: 몇개/.test(bad.errors[0].message));
});
