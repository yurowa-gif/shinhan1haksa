/** C33 F11 출결 결과 정리 격자: 순수 도우미 + 서버 함수(권한·락·stale·대체·자동 OUT·메일 합치기·끝난 기간). gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ATT = 'test.attendance@example.com', ADMIN = 'test.admin@example.com';
const RT = 'fake.rt@fakeschool.invalid', RH = 'fake.rh@fakeschool.invalid';
const D1 = '2027-03-08', D2 = '2027-03-09';

function makeEnv(now) {
  const env = createGasEnv({ now: now || '2027-03-10T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const late = env.rows('status_changes').find((c) => c.item === '학사' && c.effective_date === '2027-03-15');
  const students = env.rows('students').filter((s) => !late || s.id !== late.student_id);
  const enr = (sid) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === sid);
  const a = students[2], b = students[3];
  env.asOwner((c) => {
    c.addUser(RT, '실가짜담당', 'hall_teacher'); c.addUser(RH, '실가짜담임', 'homeroom');
    c.updateRecord_('users', env.rows('users').find((u) => u.email === RH).id, { homeroom_class: a.grade + '-' + a.class_no }, ADMIN);
    c.updateRecord_('enrollments', enr(a.id).id, { teacher_email: RT }, ADMIN);
  });
  const etab = () => env.rows('exceptions_' + term.id.slice(0, 8));
  const vtab = () => env.rows('violations_' + term.id.slice(0, 8));
  const range = { from: D1, to: '2027-03-12' };
  const cell = (s, o) => Object.assign({ studentId: s.id, date: D1, kind: '결석', type: '미인정결석', blocks: '', reason: '' }, o || {});
  const prev = (who, cells) => plain(env.call(who, 'previewResults', { range, cells }));
  const save = (who, cells, sig) => {
    const sent = [];
    const r = plain(env.as(who, (c) => {
      c.MailApp = { sendEmail(to, subject, body) { sent.push({ to, body }); }, getRemainingDailyQuota: () => 100 };
      const p = sig === undefined ? c.previewResults({ range, cells }) : { sig };
      return c.saveResults({ range, cells }, p.sig);
    }));
    return { r, sent };
  };
  return { env, term, a, b, etab, vtab, range, cell, prev, save };
}

test('순수: 유형 선택지는 R22 대응(결석·지각·조퇴 + 가정사유), 기본 시간, 메일 합치기', () => {
  const env = createGasEnv({ now: '2027-03-10T20:00:00' });
  const o = plain(env.asOwner((c) => c.resOptions_(['병결', '병지각', '병조퇴', '미인정결석', '미인정지각', '미인정조퇴', '가정사유', '학원', '기타'])));
  assert.deepStrictEqual(o['결석'].map((x) => x.type), ['병결', '미인정결석', '가정사유']);
  assert.deepStrictEqual(o['지각'].map((x) => x.type), ['병지각', '미인정지각', '가정사유']);
  assert.deepStrictEqual(o['조퇴'].map((x) => x.recognized), [true, false, true]);
  const blocks = [{ start: '18:00', end: '20:00' }, { start: '20:00', end: '22:00' }];
  const d = (k) => plain(env.asOwner((c) => c.resDefaultBlocks_(k, blocks)));
  assert.deepStrictEqual([d('결석'), d('지각'), d('조퇴')], ['ALL', '18:00-20:00', '20:00-22:00']);
  const m = plain(env.asOwner((c) => c.resMergeMails_([{ to: ['b@x', 'a@x'], body: '하나' }, { to: ['a@x', 'b@x'], body: '둘' }, { to: ['c@x'], body: '셋' }])));
  assert.strictEqual(m.length, 2);
  assert.deepStrictEqual(m[0].to, ['a@x', 'b@x']);
  assert.ok(m[0].body.includes('2건') && m[0].body.includes('하나') && m[0].body.includes('둘'));
  assert.strictEqual(m[1].body, '셋');
});

test('권한: 보기=exception.view, 저장·취소=exception.confirm. 담당 교사는 자기 학생만 보고 저장은 못 한다', () => {
  const x = makeEnv();
  for (const fn of ['getResultGrid', 'getResultTotals']) {
    x.env.expectAllowed(ATT, fn, x.range);
    x.env.expectAllowed(ADMIN, fn, x.range);
    x.env.expectAllowed(RT, fn, x.range);
  }
  for (const fn of ['previewResults', 'saveResults', 'cancelResult']) x.env.expectDenied(RT, 'exception.confirm', fn, {}, '');
  x.env.expectDenied(RH, 'exception.confirm', 'previewResults', {});
  const g = plain(x.env.call(RT, 'getResultGrid', { from: D1, to: D1, all: true }));
  assert.ok(g.ok && g.students.every((s) => s.id === x.a.id), '담당 교사는 담당 학생만');
  assert.ok(plain(x.env.call(ATT, 'getResultGrid', { from: D1, to: D1, all: true })).students.length > 1);
});

test('저장: 미인정결석 → 확정 행 1 + 자동 1OUT, 격자에 ×·미인정, 같은 학생 같은 날은 한 묶음', () => {
  const x = makeEnv();
  const { r } = x.save(ATT, [x.cell(x.a), x.cell(x.a, { kind: '조퇴', type: '병조퇴', blocks: '' })]);
  assert.strictEqual(r.ok, false, '결석과 조퇴는 한 날에 함께 못 넣는다(R22 결석 우선): ' + JSON.stringify(r));
  const ok = x.save(ATT, [x.cell(x.a)]);
  assert.strictEqual(ok.r.ok, true, JSON.stringify(ok.r));
  const rows = x.etab().filter((e) => e.student_id === x.a.id && e.status === '확정');
  assert.deepStrictEqual([rows.length, rows[0].type, rows[0].blocks, rows[0].confirmed_by], [1, '미인정결석', 'ALL', ATT]);
  assert.strictEqual(x.vtab().filter((v) => v.student_id === x.a.id && v.status === '유효').length, 1);
  const g = plain(x.env.call(ATT, 'getResultGrid', { from: D1, to: D1, all: true }));
  assert.deepStrictEqual(g.cells[x.a.id][D1].slice(1), ['×', 1]);
});

test('stale: 미리보기 뒤 다른 사람이 바꾸면 저장 거절, sig 없으면 거절', () => {
  const x = makeEnv();
  const p = x.prev(ATT, [x.cell(x.a)]);
  x.env.setNow('2027-03-10T20:05:00');
  assert.strictEqual(plain(x.env.call(ADMIN, 'saveException', { studentId: x.b.id, from: D1, to: D1, blocks: 'ALL', type: '병결', reason: '' })).ok, true);
  const r = plain(x.env.call(ATT, 'saveResults', { range: x.range, cells: [x.cell(x.a)] }, p.sig));
  assert.strictEqual(r.stale, true);
  assert.strictEqual(plain(x.env.call(ATT, 'saveResults', { range: x.range, cells: [x.cell(x.a)] }, '')).stale, true);
  assert.strictEqual(x.etab().filter((e) => e.student_id === x.a.id).length, 0);
});

test('대체: 사전 특이사항을 결과로 바꾸면 그날 겹치는 행만 취소(자동 사유)·경고, 겹치지 않는 행은 유지', () => {
  const x = makeEnv();
  x.env.call(ADMIN, 'saveException', { studentId: x.a.id, from: D1, to: D2, blocks: 'ALL', type: '학원(보강 포함)', reason: '' });
  const p = x.prev(ATT, [x.cell(x.a, { type: '병결' })]);
  assert.ok(p.ok && p.replaceCount === 1 && p.warnings.some((w) => w.includes('사전 특이사항 "학원(보강 포함)"')), JSON.stringify(p));
  assert.strictEqual(x.save(ATT, [x.cell(x.a, { type: '병결' })]).r.ok, true);
  const rows = x.etab().filter((e) => e.student_id === x.a.id);
  const d1 = rows.filter((e) => e.date === D1), d2 = rows.filter((e) => e.date === D2);
  assert.deepStrictEqual(d1.map((e) => [e.type, e.status, e.cancel_reason]).sort(), [['병결', '확정', ''], ['학원(보강 포함)', '취소', '결과 정리에서 바꿈']]);
  assert.deepStrictEqual(d2.map((e) => e.status), ['확정'], '다른 날 행은 그대로');
  // 겹치지 않는 부분 특이사항은 둘 다 둔다: D2 지각(첫 블록) 결과 + 마지막 블록 학원
  const y = makeEnv();
  const cellInfo = plain(y.env.call(ATT, 'getResultCell', y.a.id, D1));
  const last = cellInfo.blocks[cellInfo.blocks.length - 1];
  y.env.call(ADMIN, 'saveException', { studentId: y.a.id, from: D1, to: D1, blocks: last.start + '-' + last.end, type: '학원(보강 포함)', reason: '' });
  const q = y.save(ATT, [y.cell(y.a, { kind: '지각', type: '병지각' })]);
  assert.strictEqual(q.r.ok, true, JSON.stringify(q.r));
  assert.strictEqual(q.r.replaced, 0);
  assert.deepStrictEqual(y.etab().filter((e) => e.student_id === y.a.id && e.status === '확정').map((e) => e.type).sort(), ['병지각', '학원(보강 포함)']);
});

test('검증: 쓸 수 없는 유형·미래 날짜·범위 밖 학생·조퇴가 결석 시간·중복은 거절', () => {
  const x = makeEnv();
  const bad = (c) => x.prev(ATT, [c]);
  assert.strictEqual(bad(x.cell(x.a, { type: '학원' })).ok, false);
  assert.strictEqual(bad(x.cell(x.a, { type: '미인정지각' })).ok, false, '결석에 지각 유형');
  assert.strictEqual(bad(x.cell(x.a, { date: '2027-03-11' })).ok, false, '오늘(3/10) 이후');
  assert.strictEqual(bad(x.cell({ id: 'nope' })).ok, false);
  assert.strictEqual(x.prev(ATT, [x.cell(x.a), x.cell(x.a)]).ok, false, '중복');
  assert.strictEqual(bad(x.cell(x.a, { kind: '조퇴', type: '가정사유', blocks: 'ALL' })).ok, false, '가정사유 ALL은 결석');
  assert.strictEqual(plain(x.env.call(ATT, 'previewResults', { range: x.range, cells: [] })).ok, false);
});

test('취소: 사유 2자 이상, 결과 행·자동 OUT 함께 취소, 이미 취소되면 stale', () => {
  const x = makeEnv();
  assert.strictEqual(x.save(ATT, [x.cell(x.a)]).r.ok, true);
  const tok = () => plain(x.env.call(ATT, 'getResultGrid', { from: D1, to: '2027-03-12', all: true })).token;
  const inp = (o) => Object.assign({ studentId: x.a.id, date: D1, kind: '결석', reason: '잘못 입력', range: x.range, token: tok() }, o || {});
  assert.strictEqual(plain(x.env.call(ATT, 'cancelResult', inp({ reason: '아' }))).ok, false);
  x.env.expectDenied(RT, 'exception.confirm', 'cancelResult', inp());
  const r = plain(x.env.call(ATT, 'cancelResult', inp()));
  assert.deepStrictEqual([r.ok, r.out.canceled], [true, 1]);
  assert.strictEqual(x.vtab().filter((v) => v.student_id === x.a.id && v.status === '유효').length, 0);
  assert.strictEqual(plain(x.env.call(ATT, 'cancelResult', inp())).stale, true);
});

test('메일: 담당 교사에게 한 번에 여러 건이어도 받는 사람마다 한 통', () => {
  const x = makeEnv();
  x.env.scriptProps.MAIL_ENABLED = 'true';
  const { r, sent } = x.save(ATT, [x.cell(x.a), x.cell(x.a, { date: D2 })]);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.out.created, 2, '날짜가 다르면 다른 묶음 = 2OUT');
  const count = {};
  sent.forEach((m) => { count[m.to] = (count[m.to] || 0) + 1; });
  assert.ok(Object.keys(count).length >= 1 && Object.values(count).every((n) => n === 1), JSON.stringify(count));
});

test('끝난 기간: 종료 14일 안은 저장 가능(안내), 지나면 읽기만', () => {
  const end = (n) => makeEnv('2027-03-10T20:00:00');
  const x = end();
  const t = x.term;
  x.env.asOwner((c) => c.updateRecord_('terms', t.id, { end_date: '2027-03-09' }, ADMIN));
  const p = x.prev(ATT, [x.cell(x.a)]);
  assert.ok(p.ok && p.ended && p.warnings.some((w) => w.includes('끝난 기간 정리')), JSON.stringify(p));
  x.env.setNow('2027-03-30T09:00:00');
  const q = x.prev(ATT, [x.cell(x.a)]);
  assert.strictEqual(q.ok, false);
  const g = plain(x.env.call(ATT, 'getResultGrid', { from: D1, to: D2, all: true }));
  assert.deepStrictEqual([g.ok, g.editable], [true, false]);
});

test('누적: 학생별 결석·지각·조퇴 인정/미인정(칸마다 1), 기록 목록에 자동 OUT 표시', () => {
  const x = makeEnv();
  assert.strictEqual(x.save(ATT, [x.cell(x.a), x.cell(x.a, { date: D2, type: '병결' })]).r.ok, true);
  const t = plain(x.env.call(ATT, 'getResultTotals', { from: D1, to: '2027-03-12', all: true }));
  const row = t.rows.find((q) => q.student.id === x.a.id);
  assert.deepStrictEqual([row.total['결석']['미인정'], row.total['결석']['인정']], [1, 1]);
  assert.deepStrictEqual([t.sum['결석']['미인정'], t.sum['결석']['인정']], [1, 1]);
  const rec = plain(x.env.call(ATT, 'getResultRecords', x.a.id, D1, '2027-03-12'));
  assert.deepStrictEqual(rec.records.map((q) => [q.date, q.autoOut]), [[D1, true], [D2, false]]);
  assert.ok(!JSON.stringify(rec).includes('@'), '이메일 없음');
});
