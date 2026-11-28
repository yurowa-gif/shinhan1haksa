/** C51 미리보기 가짜 자료: 입학년도 2025·2026·2027 편제표(가짜 과목 이름은 표준 과목), 목표 학과에 맞는 권장 과목 한 줄, 시험 학생의 이수 계획 몇 줄. 실제 정보 없음. */
module.exports = function seedPlan(env, opts) {
  opts = opts || {};
  const ADMIN = 'test.admin@example.com', ST = 'test.student@example.com', T1 = 'test.teacher@example.com';
  const head = 'entry_year,grade,semester,choice_group,pick_n,course';
  [2025, 2026, 2027].forEach((y) => {
    const lines = [head];
    [1, 2, 3].forEach((g) => [1, 2].forEach((s) => {
      lines.push(`${y},${g},${s},,,공통국어${s}`);
      ['화법과 언어', '독서와 작문', '대수'].forEach((c) => lines.push(`${y},${g},${s},선택군 A,2,${c}`));
      ['기하', '확률과 통계'].forEach((c) => lines.push(`${y},${g},${s},B,1,${c}`));
    }));
    const t = lines.join('\n'), p = env.call(ADMIN, 'previewCurriculum', 'curriculum', t);
    env.call(ADMIN, 'saveCurriculum', 'curriculum', t, { kind: 'curriculum', counts: p.counts });
  });
  const rh = 'base_year,university,unit,core_courses,recommended_courses,source_url,source_title,note';
  const rt = [rh, '2028,가짜대학교 1,가짜학과 1,대수,독서와 작문;기하,https://example.com/rec,가짜대학교 안내 자료,'].join('\n');
  const rp = env.call(ADMIN, 'previewCurriculum', 'recommendations', rt);
  env.call(ADMIN, 'saveCurriculum', 'recommendations', rt, { kind: 'recommendations', counts: rp.counts });
  if (opts.noPlans) return;
  const sel = (g, s, grp, c) => ({ grade: g, semester: s, choice_group: grp, course: c });
  const me = env.rows('students').find((x) => x.email === ST);
  const g = String(me.grade);
  env.call(ST, 'saveCoursePlan', [sel(g, '1', '선택군 A', '화법과 언어'), sel(g, '1', '선택군 A', '대수'), sel(g, '2', 'B', '기하')]);
  const rows = env.rows('course_plans').filter((r) => r.student_id === me.id && r.status !== '취소');
  env.call(T1, 'confirmCoursePlan', me.id, [rows.find((r) => r.course === '대수').id]);
  env.call(ST, 'setCoursePlanPublish', rows.find((r) => r.course === '대수').id, true);
  env.call(T1, 'addPlanFeedback', me.id, '가짜 피드백: 선택군 A는 목표 학과와 맞습니다.');
};
