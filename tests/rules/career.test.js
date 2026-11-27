/** R25 진로 프로필·이수 계획(F15, 결정 89·92·98·99). 가짜 학생·가짜 대학 자료만. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/Stage6Rules.gs', 'src/rules/CareerRules.gs']);

test('careerProfileCheck_: 1순위 필수·순위 1~3·중복 없음, 목표 진학은 대학·학과 모두, 글 칸 1000자, 순위 순 저장', () => {
  const ok = plain(ctx.careerProfileCheck_({ hopes: [{ rank: 2, job: ' 연구원 ' }, { rank: 1, field: '인공지능' }, { rank: 3, field: '', job: '' }],
    targets: [{ university: '가짜대', unit: '컴퓨터공학과', track: '학생부종합' }, {}], interests: '로봇', strengths: '끈기', concerns: '' }));
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(JSON.parse(ok.row.hopes), [{ rank: 1, field: '인공지능', job: '' }, { rank: 2, field: '', job: '연구원' }]);
  assert.deepStrictEqual(JSON.parse(ok.row.targets), [{ university: '가짜대', unit: '컴퓨터공학과', track: '학생부종합' }]);
  const T = [
    [{ hopes: [] }, /1순위 진로 희망이 비어 있습니다/],
    [{ hopes: [{ rank: 2, field: 'x' }] }, /1순위/],
    [{ hopes: [{ rank: 1, field: 'x' }, { rank: 1, job: 'y' }] }, /1순위를 두 번 적었습니다/],
    [{ hopes: [{ rank: 1, field: 'x' }, { rank: 4, field: 'y' }] }, /희망 순위는 1~3순위입니다/],
    [{ hopes: [{ rank: 1, field: 'x' }], targets: [{ university: '가짜대' }] }, /목표 진학 1번째 줄에 대학과 학과를 모두/],
    [{ hopes: [{ rank: 1, field: 'x' }], targets: Array(7).fill({ university: 'a', unit: 'b' }) }, /6개까지.*1개를 빼/],
    [{ hopes: [{ rank: 1, field: 'x' }], concerns: 'x'.repeat(1001) }, /^고민은 1000자까지 적을 수 있습니다\. 지금 1001자입니다\.$/],
    [{ hopes: [{ rank: 1, field: 'x' }], interests: 'x'.repeat(1001) }, /^관심 분야는 1000자/],
  ];
  T.forEach(([inp, re], k) => { const r = plain(ctx.careerProfileCheck_(inp)); assert.strictEqual(r.row, null, k); assert.ok(r.errors.some((e) => re.test(e)), k + ' ' + r.errors); });
});

const P = (id, sid, version, extra) => Object.assign({ id, student_id: sid, version, term_id: 'T1', submitted_at: '2027-03-0' + version + 'T10:00:00', status: '유효', parent_fields: '' }, extra || {});
const PROFILES = [P('a1', 's1', 1, { parent_fields: 'hopes' }), P('a2', 's1', 2, { parent_fields: 'targets;hopes' }), P('a3', 's1', 3, { status: '취소', parent_fields: 'concerns' }),
  P('b1', 's2', 1, { term_id: 'T0', submitted_at: '2026-09-01T10:00:00' })];

test('버전: 다음 번호는 취소 행까지 세어 다시 쓰지 않고, 최근 = 살아 있는 가장 큰 버전(기간·시각으로 좁힘), 공개 항목은 이어받는다(결정 89)', () => {
  assert.deepStrictEqual([ctx.careerNextVersion_(PROFILES, 's1'), ctx.careerNextVersion_(PROFILES, 's2'), ctx.careerNextVersion_(PROFILES, 's9')], [4, 2, 1]);
  assert.strictEqual(ctx.careerLatest_(PROFILES, 's1').id, 'a2');
  assert.strictEqual(ctx.careerLatest_(PROFILES, 's1', { asOf: '2027-03-01T23:00:00' }).id, 'a1');
  assert.strictEqual(ctx.careerLatest_(PROFILES, 's2', { termId: 'T1' }), null);
  assert.strictEqual(ctx.careerLatest_(PROFILES, 's9'), null);
  assert.deepStrictEqual([ctx.careerNextParentFields_(PROFILES, 's1'), ctx.careerNextParentFields_(PROFILES, 's2'), ctx.careerNextParentFields_([], 's1')], ['hopes;targets', '', '']);
});

test('careerPublishPlan_: 켜고 끄기, 적지 않은 항목은 그대로, 거두면 안내(결정 92), 모르는 항목은 오류', () => {
  const cur = { parent_fields: 'hopes;targets' };
  assert.deepStrictEqual(plain(ctx.careerPublishPlan_(cur, { fields: { strengths: true } })),
    { patch: { parent_fields: 'hopes;targets;strengths' }, added: ['strengths'], removed: [], notice: '', errors: [] });
  const off = plain(ctx.careerPublishPlan_(cur, { fields: { hopes: false, targets: 'FALSE' } }));
  assert.deepStrictEqual([off.patch, off.removed, off.notice], [{ parent_fields: '' }, ['hopes', 'targets'], '학부모님이 이미 보신 내용은 되돌릴 수 없습니다.']);
  assert.match(plain(ctx.careerPublishPlan_(cur, { fields: { memo: true } })).errors[0], /공개할 수 없는 항목입니다\(memo\)/);
  assert.deepStrictEqual(plain(ctx.careerPublishPlan_({}, {})).patch, { parent_fields: '' });
});

// 미제출(결정 98): 마감 3/16, 오늘 4/1
const CH = (sid, value, eff, at) => ({ id: sid + value + eff, student_id: sid, item: '학사', value, effective_date: eff, requested_at: at || '', status: '유효', created_at: '' });
const ENR = ['s1', 's2', 's3', 's4', 's5', 's6'].map((sid) => ({ term_id: 'T1', student_id: sid })).concat([{ term_id: 'T0', student_id: 's7' }]);
const CHANGES = [CH('s1', '입실', '2027-03-02'), CH('s2', '입실', '2027-03-02'), CH('s3', '입실', '2027-03-02'),
  CH('s4', '입실', '2027-03-22'), CH('s5', '입실', '2027-03-18'), CH('s6', '입실', '2027-03-02'), CH('s6', '퇴실', '2027-03-25', '2027-03-24T10:00:00'), CH('s7', '입실', '2027-03-02')];
const PRO = [P('x2', 's2', 1), P('x3', 's3', 1, { term_id: 'T0', submitted_at: '2026-09-10T10:00:00' })];
const TERM = { id: 'T1', career_due: '2027-03-16' };

test('careerMissing_: 마감일 입실생 + 마감 뒤 입실생은 14일 뒤부터, 퇴실생·그 기간 제출·다른 기간 등록 제외', () => {
  assert.deepStrictEqual(plain(ctx.careerMissing_(ENR, CHANGES, PRO, TERM, '2027-04-01')), [
    { studentId: 's1', since: '2027-03-16', lastSubmittedAt: '' },
    { studentId: 's3', since: '2027-03-16', lastSubmittedAt: '2026-09-10T10:00:00' },
    { studentId: 's5', since: '2027-04-01', lastSubmittedAt: '' }]);   // s4 입실 3/22 → 4/5부터, s5 입실 3/18 → 4/1(14일째)부터
  assert.deepStrictEqual(plain(ctx.careerMissing_(ENR, CHANGES, PRO, TERM, '2027-03-31')).map((x) => x.studentId), ['s1', 's3'], '하루 전에는 s5 아직');
  assert.deepStrictEqual(plain(ctx.careerMissing_(ENR, CHANGES, PRO, TERM, '2027-04-05')).map((x) => x.studentId), ['s1', 's3', 's4', 's5']);
  assert.deepStrictEqual(plain(ctx.careerMissing_(ENR, CHANGES, PRO, TERM, '2027-04-01', { graceDays: 0 })).map((x) => x.studentId), ['s1', 's3', 's4', 's5']);
  assert.deepStrictEqual(plain(ctx.careerMissing_(ENR, CHANGES, PRO, TERM, '2027-03-24')).map((x) => x.studentId), ['s1', 's3', 's6'], '퇴실 전에는 s6도');
  assert.deepStrictEqual(plain(ctx.careerMissing_(ENR, CHANGES, PRO, TERM, '2027-03-15')), [], '마감 전');
  assert.deepStrictEqual(plain(ctx.careerMissing_(ENR, CHANGES, PRO, { id: 'T1', career_due: '' }, '2027-04-01')), [], '마감일 없음');
  assert.throws(() => ctx.careerMissing_(ENR, CHANGES, PRO, TERM, '2027-4-1'), /today/);
});

// 편제(가짜): 2026 입학, 2학년 1학기 '일반선택A' 택2, '진로선택' 택1, '공통' pick_n 0
const CUR = [['일반선택A', 2, '물리학'], ['일반선택A', 2, '화학'], ['일반선택A', 2, '생명과학'], ['진로선택', 1, '기하'], ['진로선택', 1, '미적분Ⅱ'], ['공통', 0, '문학'], ['공통', 0, '영어Ⅰ']]
  .map(([g, n, c]) => ({ entry_year: '2026', grade: '2', semester: '1', choice_group: g, pick_n: n, course: c, status: '유효' }))
  .concat([{ entry_year: '2027', grade: '2', semester: '1', choice_group: '일반선택A', pick_n: 1, course: '지구과학' },
    { entry_year: '2026', grade: '2', semester: '1', choice_group: '진로선택', pick_n: 1, course: '천문학', status: '취소' }]);
const SEL = (g, c, extra) => Object.assign({ grade: 2, semester: 1, choice_group: g, course: c }, extra || {});

test('coursePlanCheck_: 편제에 없는 과목·택N 초과(F15)·같은 과목 두 번은 오류, 택N 0은 개수 보지 않음, 확정 줄을 빼면 경고', () => {
  const ok = plain(ctx.coursePlanCheck_(CUR, 2026, [SEL('일반선택A', '물리학'), SEL('일반선택A', ' 화학 '), SEL('진로선택', '기하'), SEL('공통', '문학'), SEL('공통', '영어Ⅰ')], []));
  assert.deepStrictEqual([ok.errors, ok.warnings, ok.rows.length], [[], [], 5]);
  assert.deepStrictEqual(ok.rows[1], { entry_year: '2026', grade: '2', semester: '1', choice_group: '일반선택A', course: '화학' });
  const T = [
    [[SEL('일반선택A', '물리학'), SEL('일반선택A', '화학'), SEL('일반선택A', '생명과학')], /^2학년 1학기 일반선택A 묶음에서는 2과목까지 고를 수 있습니다\. 지금 3과목입니다\.$/],
    [[SEL('일반선택A', '지구과학')], /2학년 1학기 일반선택A에 지구과학 과목이 없습니다/],
    [[SEL('진로선택', '물리학')], /진로선택에 물리학 과목이 없습니다/],
    [[SEL('진로선택', '천문학')], /진로선택에 천문학 과목이 없습니다/],   // 취소된 편제 줄
    [[SEL('일반선택A', '물리학'), SEL('일반선택A', '물리학')], /물리학 과목을 두 번 골랐습니다/],
  ];
  T.forEach(([sel, re], k) => { const r = plain(ctx.coursePlanCheck_(CUR, '2026', sel, [])); assert.deepStrictEqual(r.rows, [], k); assert.ok(r.errors.some((e) => re.test(e)), k + ' ' + r.errors); });
  assert.match(plain(ctx.coursePlanCheck_(CUR, '2025', [SEL('공통', '문학')], [])).errors.join(), /^2025년 입학생의 교육과정 편제가 없습니다/);
  assert.deepStrictEqual(plain(ctx.coursePlanCheck_(CUR, '2027', [SEL('일반선택A', '지구과학')], [])).errors, [], '입학년도마다 다른 편제');
  const w = plain(ctx.coursePlanCheck_(CUR, '2026', [SEL('일반선택A', '화학')], [Object.assign(SEL('일반선택A', '물리학'), { state: '확정', status: '유효' }), Object.assign(SEL('일반선택A', '화학'), { state: '확정', status: '유효' }),
    Object.assign(SEL('일반선택A', '생명과학'), { state: '확정', status: '취소' })]));
  assert.deepStrictEqual(w.warnings, ['담당 선생님이 확인한 2학년 1학기 물리학 과목을 뺍니다. 바꾼 계획은 다시 확인을 받아야 합니다.']);
});

test('coursePlanDiff_·coursePlanConfirm_: 과목 줄마다 취소 + 새 줄(결정 99), 같은 줄은 그대로(확정 유지), 확인은 계획 줄만', () => {
  const ex = [Object.assign(SEL('일반선택A', '물리학'), { id: 'r1', student_id: 's1', state: '확정', status: '유효', show_to_parent: 'TRUE' }),
    Object.assign(SEL('일반선택A', '화학'), { id: 'r2', student_id: 's1', state: '계획', status: '유효' }),
    Object.assign(SEL('일반선택A', '생명과학'), { id: 'r0', student_id: 's1', state: '계획', status: '취소' }),
    Object.assign(SEL('일반선택A', '화학'), { id: 'z1', student_id: 's2', state: '계획', status: '유효' })];
  const rows = plain(ctx.coursePlanCheck_(CUR, 2026, [SEL('일반선택A', '물리학'), SEL('일반선택A', '생명과학'), SEL('진로선택', '기하')], ex)).rows;
  const d = plain(ctx.coursePlanDiff_(ex, 's1', rows, 'T1'));
  assert.deepStrictEqual([d.same, d.toCancel], [1, ['r2']], '화학 → 생명과학: 화학 줄 취소');
  assert.deepStrictEqual(d.toAdd.map((r) => [r.course, r.state, r.status, r.show_to_parent, r.student_id, r.term_id]), [['생명과학', '계획', '유효', 'TRUE', 's1', 'T1'], ['기하', '계획', '유효', 'TRUE', 's1', 'T1']]);
  assert.deepStrictEqual(plain(ctx.coursePlanDiff_(ex, 's1', [{ entry_year: '2026', grade: '2', semester: '1', choice_group: '일반선택A', course: '물리학' }, { entry_year: '2026', grade: '2', semester: '1', choice_group: '일반선택A', course: '화학' }])),
    { toAdd: [], toCancel: [], same: 2 }, '같은 계획 다시 저장 = 0건');
  const dup = ex.concat([Object.assign({}, ex[0], { id: 'r1b' })]);
  assert.deepStrictEqual(plain(ctx.coursePlanDiff_(dup, 's1', rows)).toCancel, ['r2', 'r1b'], '같은 줄이 둘이면 하나만 남긴다');
  assert.deepStrictEqual(plain(ctx.coursePlanDiff_(ex.slice(1), 's1', rows, 'T1')).toAdd[0].show_to_parent, 'FALSE');
  const c = plain(ctx.coursePlanConfirm_(ex, 's1', [], 'Teacher@Example.com', '2027-04-02T09:00:00'));
  assert.deepStrictEqual(c, { patches: [{ id: 'r2', patch: { state: '확정', confirmed_by: 'teacher@example.com', confirmed_at: '2027-04-02T09:00:00' } }], errors: [] });
  assert.deepStrictEqual(plain(ctx.coursePlanConfirm_(ex, 's1', ['r1'], 't@e', '2027-04-02T09:00:00')).patches, [], '이미 확정 = 0건');
  assert.match(plain(ctx.coursePlanConfirm_(ex, 's1', ['r0'], 't@e', '2027-04-02T09:00:00')).errors[0], /생명과학 줄은 학생이 바꿔 취소되었습니다/);
  assert.match(plain(ctx.coursePlanConfirm_(ex, 's1', ['z1'], 't@e', '2027-04-02T09:00:00')).errors[0], /찾지 못했습니다/, '다른 학생 줄');
  assert.throws(() => ctx.coursePlanConfirm_(ex, 's1', [], '', '2027-04-02T09:00:00'), /teacherEmail/);
});

test('courseRecsFor_: 대학 정확히·모집단위 정확히 → 없으면 포함 일치 후보, 최신 기준 연도만, 과목 이름 맞추기', () => {
  const R = (y, u, unit, core, rec) => ({ base_year: y, university: u, unit, core_courses: core, recommended_courses: rec, source_url: 'https://example.com/' + y, source_title: '가짜 안내 ' + y, note: '' });
  const recs = [R('2027', '가짜대', '컴퓨터공학과', '', '미적분'), R('2028', '가짜대', '컴퓨터공학과', '미적분Ⅱ', '기하;확률과 통계'),
    R('2028', '가짜대', '전자공학과', '', '물리학'), R('2028', '가짜대', '인공지능학과(AI전공, 데이터전공)', '', '영어독해와 작문'), R('2028', '다른대', '컴퓨터공학과', '', 'x')];
  const exact = plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '컴퓨터공학과' }]));
  assert.deepStrictEqual(exact.map((r) => [r.unit, r.match, r.baseYear, r.core, r.recommended]), [['컴퓨터공학과', 'exact', '2028', ['미적분Ⅱ'], ['기하', '확률과 통계']]]);
  const part = plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '인공지능' }, { university: '가짜대', unit: '공학과' }], { nameMap: { '영어독해와 작문': '영어 독해와 작문' } }));
  assert.deepStrictEqual(part.map((r) => [r.unit, r.match]), [['인공지능학과(AI전공, 데이터전공)', 'partial'], ['컴퓨터공학과', 'partial'], ['전자공학과', 'partial']]);
  assert.deepStrictEqual(part[0].recommended, ['영어 독해와 작문']);
  assert.deepStrictEqual(plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '컴퓨터공학과' }], { baseYear: 2027 })).map((r) => r.recommended), [['미적분']]);
  assert.deepStrictEqual(plain(ctx.courseRecsFor_(recs, [{ university: '없는대', unit: '컴퓨터공학과' }, { university: '가짜대' }, null])), []);
  assert.strictEqual(plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '컴퓨터공학과' }, { university: '가짜대', unit: ' 컴퓨터 공학과 ' }])).length, 1, '같은 행은 한 번');
});
