/** R12 mealCountsOn_ — 그날 식수 집계. 가짜 학생만. 2027-03-01 월. */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs']);

let seq = 0;
const CH = (sid, item, value, effective_date, extra) => Object.assign({ id: 'c' + (++seq), student_id: sid, item, value, effective_date,
  status: '유효', requested_at: '', created_at: '', source: '명단업로드' }, extra || {});
const ST = (id, gender, grade) => ({ id, student_no: '', name: '가짜' + id, gender, grade });
const EN = (sid, term) => ({ id: 'e' + sid + (term || 'T1'), term_id: term || 'T1', student_id: sid });
const counts = (students, enrollments, changes, ymd) => plain(ctx.mealCountsOn_(students, enrollments, changes, 'T1', ymd));
const STUDENT = (sid, hall, dorm, bf, dn) => [CH(sid, '학사', hall, '2027-03-01'), CH(sid, '기숙사', dorm, '2027-03-01'), CH(sid, '조식', bf, '2027-03-01'), CH(sid, '석식', dn, '2027-03-01')];

test('줄 모양: 성별+학년, 성별 합계, 학년, 전체 — 숫자는 학사·기숙·비기숙·조식·학사 석식·일반 석식', () => {
  const st = [ST('a', '여', '1'), ST('b', '여', '2'), ST('c', '남', '1')];
  const ch = [].concat(STUDENT('a', '입실', '입실', '실시', '학사 석식'), STUDENT('b', '입실', '퇴실', '미실시', '일반 석식'), STUDENT('c', '입실', '퇴실', '실시', '미실시'));
  const r = counts(st, st.map((s) => EN(s.id)), ch, '2027-03-02');
  assert.deepStrictEqual(Object.keys(r.groups), ['여1', '여2', '여3', '여 합계', '남1', '남2', '남3', '남 합계', '1학년', '2학년', '3학년', '전체']);
  assert.deepStrictEqual(r.groups['여1'], { hall: 1, dorm: 1, nonDorm: 0, breakfast: 1, hallDinner: 1, generalDinner: 0 });
  assert.deepStrictEqual(r.groups['1학년'], { hall: 2, dorm: 1, nonDorm: 1, breakfast: 2, hallDinner: 1, generalDinner: 0 });
  assert.deepStrictEqual(r.groups['전체'], { hall: 3, dorm: 1, nonDorm: 2, breakfast: 2, hallDinner: 1, generalDinner: 1 });
  assert.deepStrictEqual([r.unknownGroup, r.warnings, r.afterLeaveHallDinner], [[], [], 0]);
});

test('결정 35 흐름: 3/3(수) 15:00 신청·3/5 학사 퇴실 → 학사 석식은 3/5~3/14 포함(퇴실 후 석식 유지), 3/15부터 빠짐, 조식은 3/5부터 빠짐', () => {
  const st = [ST('a', '여', '1')];
  // F6 학사 퇴실 정리 결과(rules-api.md R6 순서): 학사 퇴실@3/5, 조식 미실시@3/5, 석식 미실시@3/15
  const f6 = { source: 'F6', requested_at: '2027-03-03T15:00:00' };
  const ch = STUDENT('a', '입실', '퇴실', '실시', '학사 석식').concat([CH('a', '학사', '퇴실', '2027-03-05', f6), CH('a', '조식', '미실시', '2027-03-05', f6),
    CH('a', '석식', '미실시', plain(ctx.mealEffectiveDate_('stop', '2027-03-03T15:00:00', { leaveDate: '2027-03-05' })).date, f6)]);
  const day = (d) => { const r = counts(st, [EN('a')], ch, d); return [r.groups['전체'].hall, r.groups['전체'].breakfast, r.groups['전체'].hallDinner, r.afterLeaveHallDinner]; };
  assert.deepStrictEqual(day('2027-03-04'), [1, 1, 1, 0]);
  assert.deepStrictEqual(day('2027-03-05'), [0, 0, 1, 1]);
  assert.deepStrictEqual(day('2027-03-14'), [0, 0, 1, 1]);
  assert.deepStrictEqual(day('2027-03-15'), [0, 0, 0, 0]);
});

test('성별·학년이 빈(또는 다른) 학생은 unknownGroup + 경고, 어느 줄에도 넣지 않음(가정), 학생 행이 없어도 같음', () => {
  const st = [ST('a', '', '1'), ST('b', '여', ''), ST('c', '혼성', '1'), ST('d', '남', '2')];
  const ch = [].concat(...['a', 'b', 'c', 'd', 'x'].map((s) => STUDENT(s, '입실', '퇴실', '실시', '학사 석식')));
  const r = counts(st, ['a', 'b', 'c', 'd', 'x'].map((s) => EN(s)), ch, '2027-03-02');
  assert.deepStrictEqual(r.unknownGroup, ['a', 'b', 'c', 'x']);
  assert.strictEqual(r.warnings.length, 4);
  assert.strictEqual(r.groups['전체'].hall, 1);
});

test('다른 기간에만 등록된 학생은 세지 않고, 같은 학생이 두 번 등록돼도 한 번, 취소 행은 무시', () => {
  const st = [ST('a', '여', '1'), ST('b', '남', '1')];
  const ch = STUDENT('a', '입실', '퇴실', '실시', '학사 석식').concat(STUDENT('b', '입실', '퇴실', '실시', '학사 석식'),
    [CH('a', '조식', '미실시', '2027-03-02', { status: '취소', requested_at: '2027-03-01T09:00:00' })]);
  const r = counts(st, [EN('a'), EN('a'), EN('b', 'T0')], ch, '2027-03-03');
  assert.deepStrictEqual([r.groups['전체'].hall, r.groups['전체'].breakfast], [1, 1]);
});

test('학년 3 밖(예: 4)도 줄을 만든다, 잘못된 날짜는 Error', () => {
  const r = counts([ST('a', '남', '4')], [EN('a')], STUDENT('a', '입실', '퇴실', '실시', '학사 석식'), '2027-03-02');
  assert.strictEqual(r.groups['남4'].hall, 1);
  assert.strictEqual(r.groups['4학년'].hall, 1);
  assert.throws(() => counts([], [], [], '2027-02-30'), /yyyy-MM-dd/);
});

/* ───── 단순 오라클: 학생마다 변경 행을 무작위로 쌓고, 값은 이 파일의 단순 계산으로 ───── */

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const VALUES = { '학사': ['입실', '퇴실'], '기숙사': ['입실', '퇴실'], '조식': ['실시', '미실시'], '석식': ['학사 석식', '일반 석식', '미실시'] };
// 그날 값: 유효 행 중 적용일 ≤ 그날, 적용일이 가장 늦고, 같으면 신청 일시가 늦은 행(vocabulary.md)
function valueOn(rows, sid, item, d) {
  let best = null;
  for (const r of rows) {
    if (r.student_id !== sid || r.item !== item || r.status !== '유효' || r.effective_date > d) continue;
    if (!best || r.effective_date > best.effective_date || (r.effective_date === best.effective_date && r.requested_at >= best.requested_at)) best = r;
  }
  return best ? best.value : '';
}

test('오라클 무작위 시험 100가지: 줄마다 숫자가 단순 계산과 같고, 합계 줄 = 부분 합', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
    const st = [], en = [], ch = [];
    for (let i = 0; i < 12; i++) {
      const sid = 's' + i;
      st.push(ST(sid, pick(['남', '여', '여', '']), pick(['1', '2', '3', '3'])));
      if (R() < 0.9) en.push(EN(sid, R() < 0.9 ? 'T1' : 'T0'));
      for (let k = 0; k < 6; k++) {
        const item = pick(Object.keys(VALUES));
        ch.push(CH(sid, item, pick(VALUES[item]), '2027-03-0' + (1 + Math.floor(R() * 9)),
          { requested_at: '2027-02-2' + Math.floor(R() * 9) + 'T09:00:00', status: R() < 0.1 ? '취소' : '유효' }));
      }
    }
    const d = '2027-03-0' + (1 + Math.floor(R() * 9));
    const r = counts(st, en, ch, d);
    const want = {};
    const add = (k, v) => { want[k] = want[k] || { hall: 0, dorm: 0, nonDorm: 0, breakfast: 0, hallDinner: 0, generalDinner: 0 }; for (const m in v) want[k][m] += v[m]; };
    const done = new Set();
    let after = 0;
    for (const e of en) {
      if (e.term_id !== 'T1' || done.has(e.student_id)) continue;
      done.add(e.student_id);
      const s = st.find((x) => x.id === e.student_id);
      if (!s.gender) continue;
      const hall = valueOn(ch, s.id, '학사', d) === '입실', dorm = hall && valueOn(ch, s.id, '기숙사', d) === '입실', dn = valueOn(ch, s.id, '석식', d);
      if (dn === '학사 석식' && !hall) after++;
      const v = { hall: +hall, dorm: +dorm, nonDorm: +(hall && !dorm), breakfast: +(valueOn(ch, s.id, '조식', d) === '실시'), hallDinner: +(dn === '학사 석식'), generalDinner: +(dn === '일반 석식') };
      [s.gender + s.grade, s.gender + ' 합계', s.grade + '학년', '전체'].forEach((k) => add(k, v));
    }
    for (const k of Object.keys(r.groups)) {
      assert.deepStrictEqual(r.groups[k], want[k] || { hall: 0, dorm: 0, nonDorm: 0, breakfast: 0, hallDinner: 0, generalDinner: 0 }, 'seed ' + seed + ' ' + k);
    }
    assert.strictEqual(r.afterLeaveHallDinner, after, 'seed ' + seed);
    for (const m of Object.keys(r.groups['전체'])) {
      assert.strictEqual(r.groups['여 합계'][m] + r.groups['남 합계'][m], r.groups['전체'][m]);
      assert.strictEqual(r.groups['1학년'][m] + r.groups['2학년'][m] + r.groups['3학년'][m], r.groups['전체'][m]);
      assert.strictEqual(['1', '2', '3'].reduce((n, g) => n + r.groups['여' + g][m], 0), r.groups['여 합계'][m]);
    }
  }
});

test('결정 35 보충: prevTermId를 주면 직전 기간에만 등록된 학생도 그날 학사 석식이면 센다(학사·조식 0), 학사 석식이 아니면 안 셈, 이번 기간 등록생은 한 번만', () => {
  const st = [ST('a', '여', '1'), ST('b', '여', '1'), ST('c', '남', '2')];
  // a: 직전 기간(T0) 등록, 3/12 퇴실 뒤 석식 학사 석식이 3/22까지 / b: T0 등록, 일반 석식 / c: T0·T1 둘 다 등록
  const ch = [].concat(STUDENT('a', '입실', '퇴실', '실시', '학사 석식'), [CH('a', '학사', '퇴실', '2027-03-12'), CH('a', '조식', '미실시', '2027-03-12'), CH('a', '석식', '미실시', '2027-03-22')],
    STUDENT('b', '입실', '퇴실', '실시', '일반 석식'), [CH('b', '학사', '퇴실', '2027-03-12')], STUDENT('c', '입실', '퇴실', '실시', '학사 석식'));
  const en = [EN('a', 'T0'), EN('b', 'T0'), EN('c', 'T0'), EN('c')];
  const r = plain(ctx.mealCountsOn_(st, en, ch, 'T1', '2027-03-15', 'T0'));
  assert.deepStrictEqual(r.groups['전체'], { hall: 1, dorm: 0, nonDorm: 1, breakfast: 1, hallDinner: 2, generalDinner: 0 });
  assert.strictEqual(r.afterLeaveHallDinner, 1);
  assert.deepStrictEqual(plain(ctx.mealCountsOn_(st, en, ch, 'T1', '2027-03-15')).groups['전체'].hallDinner, 1);   // 주지 않으면 지금처럼
  assert.strictEqual(plain(ctx.mealCountsOn_(st, en, ch, 'T1', '2027-03-22', 'T0')).groups['전체'].hallDinner, 1);   // 중단일 뒤엔 안 셈
});
