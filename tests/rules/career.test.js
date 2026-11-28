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
    R('2028', '가짜대', '전자공학과', '', '물리학'), R('2028', '가짜대', '인공지능학과(AI전공, 데이터전공)', '', '영어독해와 작문'), R('2028', '다른대', '컴퓨터공학과', '', 'x'),
    Object.assign(R('2029', '가짜대', '컴퓨터공학과', '', '취소된 줄'), { status: '취소' })];   // 취소된 줄은 최신 연도로도 세지 않는다
  const exact = plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '컴퓨터공학과' }]));
  assert.deepStrictEqual(exact.map((r) => [r.unit, r.match, r.baseYear, r.core, r.recommended]), [['컴퓨터공학과', 'exact', '2028', ['미적분Ⅱ'], ['기하', '확률과 통계']]]);
  const part = plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '인공지능' }, { university: '가짜대', unit: '공학과' }], { nameMap: { '영어독해와 작문': '영어 독해와 작문' } }));
  assert.deepStrictEqual(part.map((r) => [r.unit, r.match]), [['인공지능학과(AI전공, 데이터전공)', 'partial'], ['컴퓨터공학과', 'partial'], ['전자공학과', 'partial']]);
  assert.deepStrictEqual(part[0].recommended, ['영어 독해와 작문']);
  assert.deepStrictEqual(plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '컴퓨터공학과' }], { baseYear: 2027 })).map((r) => r.recommended), [['미적분']]);
  assert.deepStrictEqual(plain(ctx.courseRecsFor_(recs, [{ university: '없는대', unit: '컴퓨터공학과' }, { university: '가짜대' }, null])), []);
  assert.strictEqual(plain(ctx.courseRecsFor_(recs, [{ university: '가짜대', unit: '컴퓨터공학과' }, { university: '가짜대', unit: ' 컴퓨터 공학과 ' }])).length, 1, '같은 행은 한 번');
});

test('careerDroppedPicks_: 새 편제에서 빠진 과목을 고른 학생(디자인2 제안) — 그 해 표만 보고, 취소 줄은 빼고', () => {
  const plan = (id, sid, ey, g, course, extra) => Object.assign({ id, student_id: sid, entry_year: ey, grade: '2', semester: '1', choice_group: g, course, state: '계획', status: '유효' }, extra || {});
  const plans = [plan('p1', 's1', '2026', '일반선택A', '물리학'), plan('p2', 's2', '2026', '일반선택A', '생명과학'), plan('p3', 's3', '2026', '진로선택', '기하', { state: '확정' }),
    plan('p4', 's4', '2026', '일반선택A', '생명과학', { status: '취소' }), plan('p5', 's5', '2027', '일반선택A', '물리학'), plan('p6', 's1', '2026', '진로선택', '미적분Ⅱ')];
  const next = [['일반선택A', '물리학'], ['일반선택A', '화학'], ['진로선택', '미적분Ⅱ']].map(([g, c]) => ({ entry_year: '2026', grade: '2', semester: '1', choice_group: g, pick_n: 2, course: c, status: '유효' }))
    .concat([{ entry_year: '2026', grade: '2', semester: '1', choice_group: '진로선택', pick_n: 1, course: '기하', status: '취소' }]);
  assert.deepStrictEqual(plain(ctx.careerDroppedPicks_(plans, next)), [
    { studentId: 's3', planId: 'p3', entryYear: '2026', grade: '2', semester: '1', choiceGroup: '진로선택', course: '기하' },
    { studentId: 's2', planId: 'p2', entryYear: '2026', grade: '2', semester: '1', choiceGroup: '일반선택A', course: '생명과학' }]);
  assert.deepStrictEqual(plain(ctx.careerDroppedPicks_(plans, [])), [], '표가 없으면 아무 해도 보지 않는다');
});

test('coursePlanPendingCount_: 담당 학생 중 확인을 기다리는 계획 줄이 있는 학생 수(디자인2 제안)', () => {
  const plans = [{ student_id: 's1', state: '계획', status: '유효' }, { student_id: 's1', state: '계획', status: '유효' }, { student_id: 's2', state: '확정', status: '유효' },
    { student_id: 's3', state: '계획', status: '취소' }, { student_id: 's4', state: '계획', status: '유효' }, { student_id: 's9', state: '계획', status: '유효' }];
  assert.deepStrictEqual(plain(ctx.coursePlanPendingCount_(plans, ['s4', 's1', 's2', 's3', 's1', ''])), { count: 2, studentIds: ['s4', 's1'] });
  assert.deepStrictEqual(plain(ctx.coursePlanPendingCount_(plans, [])), { count: 0, studentIds: [] });
});

test('curriculumSavePlan_ 편제: 같은 줄은 그대로·같은 자리 바뀐 줄은 옛 줄 취소 + 새 줄·빠진 줄 취소·새 줄 추가, 같은 표 두 번 = 0건, 다른 해는 그대로(결정 102, curPlan_과 같음)', () => {
  const C = (id, ey, g, n, c, extra) => Object.assign({ id, entry_year: ey, grade: '2', semester: '1', choice_group: g, pick_n: n, course: c, status: '유효' }, extra || {});
  const existing = [C('c1', '2026', 'A', 2, '물리학'), C('c2', '2026', 'A', 2, '화학'), C('c3', '2026', 'A', 2, '생명과학'), C('c4', '2025', 'A', 2, '물리학'),
    C('c5', '2026', 'A', 2, '지구과학', { status: '취소' })];
  const upload = [{ entry_year: '2026', grade: 2, semester: 1, choice_group: 'A', pick_n: '2', course: ' 물리학 ' }, { entry_year: '2026', grade: 2, semester: 1, choice_group: 'A', pick_n: 3, course: '화학' },
    { entry_year: '2026', grade: 2, semester: 1, choice_group: '', pick_n: '', course: '문학' }];
  const p = plain(ctx.curriculumSavePlan_('curriculum', existing, upload));
  assert.deepStrictEqual([p.ok, p.errors, p.keys, p.same, p.counts], [true, [], ['2026'], 1, { add: 1, changed: 1, remove: 1, same: 1, rows: 3 }]);
  assert.deepStrictEqual(p.toCancel, [{ id: 'c2', why: 'changed' }, { id: 'c3', why: 'removed' }], '화학은 택N이 바뀜, 생명과학은 빠짐, 2025·취소 줄은 그대로');
  assert.deepStrictEqual([p.changed[0].before.id, p.changed[0].after.pick_n, p.removed.map((r) => r.id), p.add.map((r) => r.course)], ['c2', '3', ['c3'], ['문학']]);
  assert.deepStrictEqual(p.toAppend, [{ entry_year: '2026', grade: '2', semester: '1', choice_group: '', pick_n: '0', course: '문학', status: '유효' },
    { entry_year: '2026', grade: '2', semester: '1', choice_group: 'A', pick_n: '3', course: '화학', status: '유효' }]);
  const saved = existing.map((e) => p.toCancel.some((c) => c.id === e.id) ? Object.assign({}, e, { status: '취소' }) : e).concat(p.toAppend.map((r, i) => Object.assign({ id: 'n' + i }, r)));
  const again = plain(ctx.curriculumSavePlan_('curriculum', saved, upload));
  assert.deepStrictEqual([again.toAppend, again.toCancel, again.same, again.counts], [[], [], 3, { add: 0, changed: 0, remove: 0, same: 3, rows: 3 }], '같은 표 두 번 = 0건');
  const twin = saved.concat([Object.assign({}, saved.find((e) => e.id === 'c1'), { id: 'c1b' })]);
  assert.deepStrictEqual(plain(ctx.curriculumSavePlan_('curriculum', twin, upload)).toCancel, [{ id: 'c1', why: 'removed' }], '같은 줄이 둘이면 하나만 남긴다(뒤의 줄 — curPlan_과 같음)');
  const T = [
    [[{ entry_year: '26', grade: 2, semester: 1, course: 'x' }], /입학년도는 숫자 4자리여야 합니다\(지금 26\)/],
    [[{ entry_year: '2026', grade: 4, semester: 1, course: 'x' }], /학년은 1~3/], [[{ entry_year: '2026', grade: 2, semester: 3, course: 'x' }], /학기는 1 또는 2/],
    [[{ entry_year: '2026', grade: 2, semester: 1, course: '' }], /과목 이름이 비어 있습니다/], [[{ entry_year: '2026', grade: 2, semester: 1, course: 'x', pick_n: -1 }], /택N은 0 이상의 정수/],
    [[{ entry_year: '2026', grade: 2, semester: 1, course: 'x' }, { entry_year: '2026', grade: 2, semester: 1, course: ' x ', pick_n: 1 }], /2번째 줄: 1번째 줄과 같은 과목입니다/],
    [[], /올린 표에 줄이 없습니다/],
  ];
  T.forEach(([rows, re], i) => { const r = plain(ctx.curriculumSavePlan_('curriculum', existing, rows)); assert.deepStrictEqual([r.ok, r.toAppend, r.toCancel], [false, [], []], i); assert.ok(r.errors.some((e) => re.test(e)), i + ' ' + r.errors); });
  assert.throws(() => ctx.curriculumSavePlan_('courses', [], []), /kind/);
});

test('curriculumSavePlan_ 권장 과목: 대학·모집단위 겹치면 뒤의 줄만 + 경고, 출처 주소 필수, 과목 목록은 조각마다 다듬어 견준다, recs 별칭', () => {
  const R = (id, y, u, unit, rec, extra) => Object.assign({ id, base_year: y, university: u, unit, core_courses: '', recommended_courses: rec, source_url: 'https://example.com/a', source_title: '가짜 안내', note: '', status: '유효' }, extra || {});
  const existing = [R('r1', '2028', '가짜대', '컴퓨터공학과', '미적분Ⅱ;기하'), R('r2', '2028', '가짜대', '전자공학과', '물리학'), R('r3', '2027', '가짜대', '컴퓨터공학과', '미적분'),
    R('r4', '2028', '가짜대', '기계공학과', '물리학')];
  const upload = [R(undefined, '2028', '가짜대', '컴퓨터공학과', ' 미적분Ⅱ ; 기하 ;'), R(undefined, '2028', '가짜대', '인공지능학과', '확률과 통계'),
    R(undefined, '2028', '가짜대', '기계공학과', '역학'), R(undefined, '2028', '가짜대', '기계공학과', '물리학;역학')];
  const p = plain(ctx.curriculumSavePlan_('recommendations', existing, upload));
  assert.deepStrictEqual([p.ok, p.keys, p.same, p.toCancel, p.add.map((r) => r.unit)], [true, ['2028'], 1, [{ id: 'r4', why: 'changed' }, { id: 'r2', why: 'removed' }], ['인공지능학과']]);
  assert.strictEqual(p.changed[0].after.recommended_courses, '물리학;역학', '겹치면 뒤의 줄');
  assert.deepStrictEqual(p.warnings, ['대학·모집단위가 같은 줄이 1쌍 있습니다(가짜대 기계공학과 3·4번째 줄). 뒤의 줄만 쓰입니다.']);
  assert.deepStrictEqual(plain(ctx.curriculumSavePlan_('recs', existing, upload)).toCancel, p.toCancel, 'recs 별칭');
  [['', /출처 주소가 비어 있거나/], ['example.com', /출처 주소가/]].forEach(([url, re]) =>
    assert.match(plain(ctx.curriculumSavePlan_('recommendations', [], [R('', '2028', '가짜대', 'a', '', { source_url: url })])).errors[0], re));
  assert.match(plain(ctx.curriculumSavePlan_('recommendations', [], [R('', '28', '가짜대', 'a', '')])).errors[0], /기준 연도는 숫자 4자리/);
  assert.match(plain(ctx.curriculumSavePlan_('recommendations', [], [R('', '2028', '', 'a', '')])).errors[0], /대학과 모집단위를 모두/);
});

test('careerDropWarnings_: 빠지는 편제 줄 중 이미 고른 학생이 있는 과목과 학생 수(미리 보기 경고)', () => {
  const plan = (sid, course, extra) => Object.assign({ student_id: sid, entry_year: '2026', grade: '2', semester: '1', choice_group: 'A', course, status: '유효' }, extra || {});
  const plans = [plan('s1', '생명과학'), plan('s2', '생명과학'), plan('s2', '생명과학'), plan('s3', '생명과학', { status: '취소' }), plan('s4', '지구과학')];
  const removed = [{ entry_year: '2026', grade: '2', semester: '1', choice_group: 'A', course: '생명과학' }, { entry_year: '2026', grade: '2', semester: '1', choice_group: 'A', course: '천문학' },
    { entry_year: '2026', grade: '2', semester: '1', choice_group: 'A', course: '생명과학' }];
  assert.deepStrictEqual(plain(ctx.careerDropWarnings_(removed, plans)), [{ entryYear: '2026', grade: '2', semester: '1', choiceGroup: 'A', course: '생명과학', students: 2 }]);
  assert.deepStrictEqual(plain(ctx.careerDropWarnings_([], plans)), []);
});
