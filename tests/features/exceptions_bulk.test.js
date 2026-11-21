/** C45 결정 86 경고 없는 요청 일괄 확정(previewBulkConfirm·confirmExceptionGroups). R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ATT = 'test.attendance@example.com', ADMIN = 'test.admin@example.com', TEACHER = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', DUTY = 'test.duty@example.com';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const mine = students.filter((s) => enr.some((e) => e.student_id === s.id && e.teacher_email === TEACHER));
  const autoType = plain(env.call(ATT, 'getExceptionContext').types).find((t) => t.auto).name;
  const tabName = 'exceptions_' + term.id.slice(0, 8);
  return { env, term, mine, autoType, rows: () => env.rows(tabName), tabName };
}
const save = (x, who, over) => plain(x.env.call(who, 'saveException', Object.assign({ from: '2027-03-12', blocks: 'ALL', type: '병결' }, over)));
const statusOf = (x, gid) => [...new Set(x.rows().filter((r) => r.group_id === gid).map((r) => r.status))].join(',');

/** 요청 4건: A·B(경고 없음), C(같은 날 확정과 겹침), D(미인정 유형) */
function seed(x) {
  const A = save(x, TEACHER, { studentId: x.mine[0].id, from: '2027-03-12', to: '2027-03-13' });
  const B = save(x, TEACHER, { studentId: x.mine[1].id, from: '2027-03-17' });
  assert.strictEqual(save(x, ATT, { studentId: x.mine[2].id, from: '2027-03-15', type: '병결' }).ok, true);   // 이미 확정된 행
  const C = save(x, TEACHER, { studentId: x.mine[2].id, from: '2027-03-15', type: '가정사유(가족여행 포함)', confirmOverlap: true });
  const D = save(x, TEACHER, { studentId: x.mine[3].id, from: '2027-03-18', type: x.autoType });
  [A, B, C, D].forEach((r) => assert.ok(r.ok && r.status === '요청', JSON.stringify(r)));
  return { A: A.groupId, B: B.groupId, C: C.groupId, D: D.groupId };
}

test('previewBulkConfirm: 경고 없는 요청만 대상, 겹침·미인정 묶음은 남김(이유), 아무것도 쓰지 않는다', () => {
  const x = makeEnv();
  const base = plain(x.env.call(ATT, 'previewBulkConfirm', x.term.id));   // 가짜 데이터에 원래 있는 요청(미인정 1건 등)
  const g = seed(x), before = JSON.stringify(x.rows());
  const p = plain(x.env.expectAllowed(ATT, 'previewBulkConfirm', x.term.id));
  assert.strictEqual(p.ok, true); assert.strictEqual(p.ended, false);
  assert.deepStrictEqual(p.confirmable.filter((id) => !base.confirmable.includes(id)).sort(), [g.A, g.B].sort());
  const mineSkipped = p.skipped.filter((s) => Object.values(g).includes(s.groupId));
  assert.deepStrictEqual(mineSkipped.map((s) => [s.groupId, s.kind]).sort(), [[g.C, 'warn'], [g.D, 'auto']].sort());
  assert.ok(p.skipped.every((s) => s.reason && !/[A-Za-z0-9-]{20,}/.test(s.reason)));
  assert.deepStrictEqual(p.counts, { confirm: base.counts.confirm + 2, kept: base.counts.kept + 2, warn: base.counts.warn + 1, auto: base.counts.auto + 1, other: base.counts.other });
  assert.ok(p.token.includes(g.A) && p.token.includes(g.B) && !p.token.includes(g.C) && !p.token.includes(g.D));
  assert.strictEqual(JSON.stringify(x.rows()), before, '미리 보기는 쓰지 않는다');
});

test('confirmExceptionGroups: 하나씩 확정과 같게 — 확정자·시각, 묶음마다 audit 한 줄, 남긴 묶음은 요청 그대로, 기록 보기에 "요청 → 확정"', () => {
  const x = makeEnv(), g = seed(x);
  const p = plain(x.env.call(ATT, 'previewBulkConfirm', x.term.id));
  const auditBefore = x.env.auditActions('bulk_update').length;
  const r = plain(x.env.expectAllowed(ATT, 'confirmExceptionGroups', x.term.id, p.confirmable, p.token));
  assert.deepStrictEqual([r.ok, r.confirmed, r.kept, r.failed], [true, 2, 0, 0], JSON.stringify(r));
  assert.deepStrictEqual([statusOf(x, g.A), statusOf(x, g.B), statusOf(x, g.C), statusOf(x, g.D)], ['확정', '확정', '요청', '요청']);
  const a = x.rows().filter((q) => q.group_id === g.A);
  assert.ok(a.length === 2 && a.every((q) => q.confirmed_by === ATT && q.confirmed_at === '2027-03-03T20:00:00'));
  assert.strictEqual(x.env.auditActions('bulk_update').length - auditBefore, 2, '확정한 묶음 수만큼 audit 줄');
  const h = plain(x.env.call(ATT, 'getExceptionHistory', x.term.id, g.A));
  assert.ok(h.entries.some((e) => e.what === '상태 요청 → 확정' && e.who), JSON.stringify(h.entries));
  assert.strictEqual(plain(x.env.call(ATT, 'previewBulkConfirm', x.term.id)).confirmable.length, 0, '다시 미리 보면 대상 없음');
});

test('일괄 확정: 미리 본 뒤 다른 선생님이 고친 묶음은 stale로 남기고, 그사이 경고가 생긴 묶음도 남기며, 나머지는 진행한다', () => {
  const x = makeEnv(), g = seed(x);
  const p = plain(x.env.call(ATT, 'previewBulkConfirm', x.term.id));
  x.env.setNow('2027-03-03T20:05:00');
  const row = x.rows().find((q) => q.group_id === g.A);
  x.env.asOwner((c) => c.updateRecord_(x.tabName, row.id, { reason: '고침' }, ADMIN));   // 그사이 다른 선생님이 고침 → stale
  const E = save(x, TEACHER, { studentId: x.mine[4].id, from: '2027-03-20' });            // 미리 볼 때 없던 요청
  const r = plain(x.env.call(ATT, 'confirmExceptionGroups', x.term.id, [...p.confirmable, E.groupId, 'no-such-group', g.B], p.token));
  assert.deepStrictEqual([r.confirmed, r.kept, r.failed], [1, 3, 0], JSON.stringify(r));   // B만 확정, A(stale)·E(미리 보기에 없음)·no-such-group 남김, 중복 g.B는 한 번
  const reason = (id) => (r.details.find((d) => d.groupId === id) || {}).reason;
  assert.strictEqual(reason(g.A), x.env.ctx.STALE_MESSAGE);
  assert.strictEqual(reason(E.groupId), x.env.ctx.STALE_MESSAGE);
  assert.ok(/이미 처리/.test(reason('no-such-group')));
  assert.deepStrictEqual([statusOf(x, g.A), statusOf(x, g.B), statusOf(x, E.groupId)], ['요청', '확정', '요청']);
  // B처럼 미리 본 뒤 겹치는 확정이 생기면 락 안 재판정에서 남긴다
  const p2 = plain(x.env.call(ATT, 'previewBulkConfirm', x.term.id));
  assert.ok(p2.confirmable.includes(E.groupId));
  assert.strictEqual(save(x, ATT, { studentId: x.mine[4].id, from: '2027-03-20', type: '병결', confirmOverlap: true }).ok, true);
  const r2 = plain(x.env.call(ATT, 'confirmExceptionGroups', x.term.id, p2.confirmable, p2.token));
  assert.strictEqual(r2.confirmed, p2.confirmable.length - 1);
  assert.ok(r2.details.some((d) => d.groupId === E.groupId && /겹치는/.test(d.reason)), JSON.stringify(r2.details));
});

test('일괄 확정 권한: 출결 담당·관리자만 — 학사 교사·담임·학생·학부모·근무표 담당은 두 함수 모두 거부, 거부는 아무것도 쓰지 않는다', () => {
  const x = makeEnv(), g = seed(x), before = JSON.stringify(x.rows());
  [TEACHER, HOMEROOM, STUDENT, PARENT, DUTY].forEach((who) => {
    x.env.expectDenied(who, 'exception.confirm', 'previewBulkConfirm', x.term.id);
    x.env.expectDenied(who, 'exception.confirm', 'confirmExceptionGroups', x.term.id, [g.A], 'x');
  });
  x.env.expectAllowed(ADMIN, 'previewBulkConfirm', x.term.id);
  assert.strictEqual(JSON.stringify(x.rows()), before);
  assert.strictEqual(plain(x.env.call(ATT, 'confirmExceptionGroups', x.term.id, [], '')).ok, false, '고른 것이 없으면 안내');
});

test('일괄 확정: 끝난 운영 기간은 대상 없음(ended)·확정 거부', () => {
  const x = makeEnv();
  x.env.setNow('2027-09-01T10:00:00');
  const p = plain(x.env.call(ATT, 'previewBulkConfirm', x.term.id));
  assert.deepStrictEqual([p.ok, p.ended, p.confirmable.length], [true, true, 0]);
  const r = plain(x.env.call(ATT, 'confirmExceptionGroups', x.term.id, ['g'], ''));
  assert.strictEqual(r.ok, false); assert.ok(/끝난 운영 기간/.test(r.error), r.error);
});
