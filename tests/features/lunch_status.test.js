/** 결정 79 후속: 학생 상태 표시(급식 화면 학생 목록·학생 기록 '오늘'·입퇴실 미리보기)의 중식 = lunchOn_ = 식수 집계. R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com';

function setup() {
  const env = createGasEnv({ now: '2027-07-20T12:00:00' });
  env.seedFake({ stage1: true });
  const t1 = env.rows('terms').find((t) => t.name === '2027 1학기');
  const enr = env.rows('enrollments').find((e) => e.term_id === t1.id);
  const sid = enr.student_id;
  const vac = env.asOwner((c) => c.appendRecord_('terms', { name: '2027 여름방학', type: '방학', start_date: '2027-07-17', end_date: '2027-08-15', memo: '시험' }, ADMIN));
  env.asOwner((c) => c.appendRecord_('enrollments', Object.assign({}, enr, { id: undefined, term_id: vac.id || vac }), ADMIN));
  // 7/19 중식 실시, 7/20(화) 09:00에 7/23 학사 퇴실 기록 → 중단일 7/26(월)
  [['중식', '실시', '2027-07-19', '2027-07-16T09:00:00', 'F7'], ['학사', '퇴실', '2027-07-23', '2027-07-20T09:00:00', 'F6']].forEach(([item, value, eff, at, source]) =>
    env.asOwner((c) => c.appendRecord_('status_changes', { student_id: sid, item, value, effective_date: eff, effective_date_auto: eff, requested_at: at, reason: '', memo: '',
      source, status: '유효', doc_submitted: 'TRUE', linked_change_id: '', cancel_reason: '' }, ADMIN)));
  return { env, sid };
}

test('학생 기록 오늘·입퇴실 미리보기(now·onDate)·급식 화면 학생 목록의 중식이 퇴실 뒤 중단일부터 미실시 — 식수 집계와 같다', () => {
  const { env, sid } = setup();
  const want = { '2027-07-22': '실시', '2027-07-23': '실시', '2027-07-25': '실시', '2027-07-26': '미실시', '2027-08-01': '미실시' };
  Object.keys(want).forEach((d) => {
    env.setNow(d + 'T12:00:00');
    const rec = env.call(ADMIN, 'listStudentStatus', sid, d);
    assert.strictEqual(rec.now['중식'], want[d], '학생 기록 ' + d);
    const mv = env.call(ADMIN, 'getMoveContext', sid, d);
    assert.deepStrictEqual([mv.now['중식'], mv.onDate['중식']], [want[d], want[d]], '입퇴실 미리보기 ' + d);
    const counts = env.call(ADMIN, 'getMealCounts', d);
    const lunchTotal = Number(counts.rows.find((r) => r.key === '전체').lunch);
    const inList = env.call(ADMIN, 'getMealContext').students.find((s) => s.id === sid);
    assert.ok(inList, '급식 화면 목록에 학생이 있어야 한다 ' + d);
    assert.strictEqual(inList.status['중식'], want[d], '급식 화면 목록 ' + d);
    assert.strictEqual(lunchTotal, want[d] === '실시' ? 1 : 0, '식수 집계 ' + d);
  });
  // 입퇴실 미리보기의 onDate는 그 날짜 기준(오늘 7/22에 8/1을 보면 미실시)
  env.setNow('2027-07-22T12:00:00');
  assert.deepStrictEqual(['now', 'onDate'].map((k) => env.call(ADMIN, 'getMoveContext', sid, '2027-08-01')[k]['중식']), ['실시', '미실시']);
  // 학기 기간에는 ''(중식은 방학에만)
  env.setNow('2027-07-10T12:00:00');
  assert.strictEqual(env.call(ADMIN, 'listStudentStatus', sid, '2027-07-10').now['중식'], '');
});
