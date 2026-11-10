/** C12 F1 → 자동 1OUT: 특이사항 확정·취소가 violations_<기간>의 자동 OUT을 맞춘다(R5·R9 규칙 위). R4 gas-fakes, 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ATT = 'test.attendance@example.com', ADMIN = 'test.admin@example.com';
const RT = 'fake.rt@fakeschool.invalid', RH = 'fake.rh@fakeschool.invalid';   // 메일이 걸러지지 않는 가짜 주소
const NAME = '무단 지각·결석·이탈';

function makeEnv(opts) {
  const env = createGasEnv({ now: '2027-03-03T20:00:00' });
  env.seedFake({ stage1: !!(opts && opts.stage1) });
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
  const vtab = () => env.rows('violations_' + term.id.slice(0, 8));
  const input = (sid, o) => Object.assign({ studentId: sid, from: '2027-03-08', to: '2027-03-08', blocks: 'ALL', type: '미인정결석', reason: '', }, o || {});
  return { env, term, a, b, vtab, input, enr };
}
const sync = (x, termId) => plain(x.env.asOwner((c) => c.syncAutoOutsAll(termId || x.term.id)));
function save(x, who, input, mail) {
  const sent = [], locks = [];
  const r = plain(x.env.as(who, (c) => {
    c.MailApp = { sendEmail(to, subject, body) { locks.push(c.LockService.getScriptLock().hasLock()); sent.push({ to, subject, body }); }, getRemainingDailyQuota: () => 100 };
    return c.saveException(input);
  }));
  return { r, sent, locks };
}

test('출결 담당이 미인정결석을 저장하면 자동 OUT 1건(F1자동·유효·입력자·유형 표기·audit create), 담당교사·담임에게 알림(락 밖, 이름 없음). 메일 꺼짐이면 0통', () => {
  const x = makeEnv();
  x.env.scriptProps.MAIL_ENABLED = 'true';
  const { r, sent, locks } = save(x, ATT, x.input(x.a.id));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual([r.out.created, r.out.canceled], [1, 0]);
  const v = x.vtab().filter((q) => q.student_id === x.a.id);
  assert.strictEqual(v.length, 1);
  assert.deepStrictEqual([v[0].source, v[0].status, v[0].entered_by, v[0].rule_name, v[0].occurred_at.slice(0, 10), v[0].memo.startsWith('사전 특이사항 자동')], ['F1자동', '유효', ATT, NAME + '(미인정결석)', '2027-03-08', true]);
  assert.ok(x.env.rows('audit_log').some((l) => l.action === 'bulk_create' && JSON.stringify(l).includes(v[0].id)), '만든 행 id가 audit_log(bulk_create)에 남는다');
  assert.deepStrictEqual(sent.map((m) => m.to).sort(), [RH, RT].sort());
  assert.deepStrictEqual(locks, sent.map(() => false), '메일은 락 밖에서');
  assert.ok(sent.every((m) => !m.body.includes(x.a.name) && m.body.includes('3월 8일(월)') && m.body.includes('이번 학기 1OUT입니다.')), sent[0].body);
  assert.strictEqual(r.out.notified, true);
  const off = makeEnv();
  const o = save(off, ATT, off.input(off.a.id));
  assert.deepStrictEqual([o.r.ok, o.r.out.created, o.sent.length], [true, 1, 0]);
});

test('다시 동기화해도 0건(멱등), 요청 상태는 0건이고 확정하면 1건, 자동 유형이 아니면 0건', () => {
  const x = makeEnv();
  assert.deepStrictEqual([save(x, ATT, x.input(x.a.id)).r.ok, sync(x).created, sync(x).canceled], [true, 0, 0]);
  const y = makeEnv();
  const tr = save(y, RT, y.input(y.a.id)).r;   // 담당 교사가 보내면 '요청'
  assert.strictEqual(y.vtab().length, 0, '요청은 OUT이 없다: ' + JSON.stringify(tr));
  const gid = tr.groupId;
  const c = plain(y.env.call(ATT, 'confirmException', y.term.id, gid));
  assert.deepStrictEqual([c.ok, c.out.created], [true, 1]);
  assert.strictEqual(y.vtab().length, 1);
  const z = makeEnv();
  assert.strictEqual(save(z, ATT, z.input(z.a.id, { type: '병결' })).r.out.created, 0, '병결은 자동 OUT 아님');
});

test('묶음 취소 → OUT 취소([자동] 사유·audit), 3일 묶음에서 첫날만 취소하면 OUT 유지·대표 이동(결정 22), 학생 A 확정·취소가 B의 OUT에 영향 없음', () => {
  const x = makeEnv();
  const ra = save(x, ATT, x.input(x.a.id)).r, rb = save(x, ATT, x.input(x.b.id)).r;
  assert.strictEqual(x.vtab().length, 2);
  const c = plain(x.env.call(ATT, 'cancelException', x.term.id, ra.groupId, '잘못 입력했습니다'));
  assert.deepStrictEqual([c.ok, c.out.canceled], [true, 1]);
  const va = x.vtab().find((v) => v.student_id === x.a.id), vb = x.vtab().find((v) => v.student_id === x.b.id);
  assert.deepStrictEqual([va.status, va.cancel_reason.startsWith('[자동] '), vb.status], ['취소', true, '유효'], 'B는 그대로');
  assert.ok(x.env.rows('audit_log').some((l) => l.action === 'bulk_update' && l.after.includes(va.id)), '취소는 audit_log에 전후 값이 남는다');
  assert.ok(rb.ok);
  const y = makeEnv();
  const r3 = save(y, ATT, y.input(y.a.id, { from: '2027-03-22', to: '2027-03-24' })).r;
  assert.strictEqual(y.vtab().length, 1, '묶음 1건 = 1OUT');
  const first = y.vtab()[0].source_exception_id;
  const part = plain(y.env.call(ATT, 'cancelException', y.term.id, r3.groupId, '첫날만 취소', '2027-03-22'));
  assert.strictEqual(part.ok, true, JSON.stringify(part));
  const v = y.vtab()[0];
  assert.deepStrictEqual([v.status, v.occurred_at.slice(0, 10)], ['유효', '2027-03-23']);
  assert.notStrictEqual(v.source_exception_id, first, '대표가 둘째 날 행으로 옮겨짐');
});

test('seedFakeStage1 뒤 syncAutoOutsAll: 확정된 2027-03-05 미인정 1건만 OUT, 메일 0통, 다시 돌려도 0건', () => {
  const x = makeEnv({ stage1: true });
  x.env.setNow('2027-03-06T10:00:00');   // 확정(3/5) 뒤 시각
  delete x.env.scriptProps.AUTO_OUT_SINCE;   // 스냅숏이 없는 처음 연결 상태
  const sent = [];
  x.env.scriptProps.MAIL_ENABLED = 'true';
  const r = plain(x.env.asOwner((c) => { c.MailApp = { sendEmail(to) { sent.push(to); }, getRemainingDailyQuota: () => 100 }; return c.syncAutoOutsAll(x.term.id); }));
  assert.strictEqual(r.created, 1, JSON.stringify(r));
  const v = x.vtab();
  assert.deepStrictEqual([v.length, v[0].occurred_at.slice(0, 10), v[0].rule_name], [1, '2027-03-05', NAME + '(미인정지각)']);
  assert.strictEqual(sent.length, 0, '메일 0통');
  assert.strictEqual(sync(x).created, 0);
});

test('관리자가 직접 취소한 자동 OUT은 다시 생기지 않는다', () => {
  const x = makeEnv();
  save(x, ATT, x.input(x.a.id));
  const v = x.vtab()[0];
  assert.strictEqual(plain(x.env.call(ADMIN, 'cancelOut', x.term.id, v.id, '관리자가 판단해 취소')).ok, true);
  assert.deepStrictEqual([sync(x).created, x.vtab().filter((q) => q.status !== '취소').length], [0, 0]);
});

test('결정 40: 설정에 기타를 더하면 그 전에 확정된 기타에는 OUT이 없고, 넓힌 직후 첫 확정에는 생기며 since[기타] = 그 confirmed_at. 다시 빼도 남고, 동기화·스냅숏 삭제 뒤에도 그 전 기타에는 OUT이 없다', () => {
  const x = makeEnv();
  const etc = (sid, d) => x.input(sid, { type: '기타', reason: '가짜 사유', from: d, to: d, blocks: '22:00-24:00' });
  x.env.setNow('2027-03-03T20:00:00');
  assert.strictEqual(save(x, ATT, etc(x.a.id, '2027-03-08')).r.out.created, 0, '자동 유형이 아닐 때');
  const row = x.env.rows('settings', 'config').find((s) => s.key === 'exception.auto_out_types');
  x.env.setNow('2027-03-04T09:00:00');
  x.env.asOwner((c) => c.updateRecord_('settings', row.id, { value: row.value + ',기타' }, ADMIN, 'config'));
  x.env.setNow('2027-03-04T10:00:00');
  const r2 = save(x, ATT, etc(x.b.id, '2027-03-09')).r;
  assert.strictEqual(r2.out.created, 1, '넓힌 직후 첫 확정');
  const snap = JSON.parse(x.env.scriptProps.AUTO_OUT_SINCE);
  const conf = x.env.rows('exceptions_' + x.term.id.slice(0, 8)).find((e) => e.student_id === x.b.id).confirmed_at;
  assert.strictEqual(snap.since['기타'], conf, 'since[기타] === 그 행의 confirmed_at');
  assert.deepStrictEqual(x.vtab().map((v) => v.student_id), [x.b.id], '그 전에 확정된 기타(a)에는 OUT 없음');
  // 동기화를 다시 돌려도 그 전 기타에는 없다
  assert.deepStrictEqual([sync(x).created, x.vtab().length], [0, 1]);
  // 다시 빼도 이미 생긴 OUT은 남는다
  x.env.asOwner((c) => c.updateRecord_('settings', row.id, { value: row.value }, ADMIN, 'config'));
  assert.deepStrictEqual([sync(x).canceled, x.vtab().filter((v) => v.status !== '취소').length], [0, 1]);
  // 스냅숏을 지우고 설정에 기타가 든 채 돌려도 그 전 기타(a)에는 OUT이 없다
  x.env.asOwner((c) => c.updateRecord_('settings', row.id, { value: row.value + ',기타' }, ADMIN, 'config'));
  delete x.env.scriptProps.AUTO_OUT_SINCE;
  x.env.setNow('2027-03-05T09:00:00');
  assert.strictEqual(sync(x).created, 0);
  assert.deepStrictEqual(x.vtab().map((v) => v.student_id), [x.b.id]);
});


test('메일 경고는 메일이 켜져 있는데 못 갔을 때만: 꺼짐·@example.com뿐이면 경고 없음, 켜짐+발송 실패면 경고. 응답에 내부 칸(_mails)·이메일이 없다', () => {
  const off = makeEnv();
  const a = save(off, ATT, off.input(off.b.id)).r;   // b의 담당·담임은 @example.com뿐
  assert.deepStrictEqual([a.ok, !!(a.out && a.out.notifyWarn), '_mails' in a], [true, false, false], JSON.stringify(a));
  assert.ok(!JSON.stringify(a).includes('@'));
  const on = makeEnv(); on.env.scriptProps.MAIL_ENABLED = 'true';
  const b = plain(on.env.as(ATT, (c) => { c.MailApp = { sendEmail() { throw new Error('발송 실패(가짜)'); }, getRemainingDailyQuota: () => 100 }; return c.saveException(on.input(on.a.id)); }));
  assert.deepStrictEqual([b.ok, b.out.created, b.out.notified, b.out.notifyWarn], [true, 1, false, true]);
  const q = makeEnv(); q.env.scriptProps.MAIL_ENABLED = 'true';
  const c2 = plain(q.env.as(ATT, (c) => { c.MailApp = { sendEmail() {}, getRemainingDailyQuota: () => 0 }; return c.saveException(q.input(q.a.id)); }));
  assert.strictEqual(c2.out.notifyWarn, true, '한도 부족');
});

test('OUT 맞추기가 던져도 특이사항은 저장되고 out.error가 있으며(시트 소유자 안내), 다음 동기화에서 OUT이 생긴다', () => {
  const x = makeEnv();
  const r = plain(x.env.as(ATT, (c) => { c.vioSyncAuto_ = () => { throw new Error('가짜 동기화 오류'); }; return c.saveException(x.input(x.a.id)); }));
  assert.strictEqual(r.ok, true);
  assert.ok(r.out.error && r.out.error.includes('syncAutoOutsAll'), r.out.error);
  assert.strictEqual(x.env.rows('exceptions_' + x.term.id.slice(0, 8)).filter((e) => e.student_id === x.a.id).length, 1, '특이사항은 남는다');
  assert.strictEqual(x.vtab().length, 0);
  assert.strictEqual(sync(x).created, 1, '다음 동기화에서 생긴다');
});

test('F1 목록 hasOut: 살아 있는 자동 OUT이 있을 때만 true — 관리자가 취소한 OUT·넓히기 전 확정된 기타에는 false', () => {
  const x = makeEnv();
  save(x, ATT, x.input(x.a.id));
  const has = (who) => plain(x.env.call(who, 'listExceptions', { scope: 'student', studentId: x.a.id })).groups.map((g) => g.hasOut);
  assert.deepStrictEqual(has(ATT), [true]);
  x.env.call(ADMIN, 'cancelOut', x.term.id, x.vtab()[0].id, '관리자 판단');
  assert.deepStrictEqual(has(ATT), [false], '관리자가 취소한 OUT');
  const y = makeEnv();
  save(y, ATT, y.input(y.a.id, { type: '기타', reason: '가짜 사유' }));
  assert.deepStrictEqual(plain(y.env.call(ATT, 'listExceptions', { scope: 'student', studentId: y.a.id })).groups.map((g) => g.hasOut), [false]);
});

test('특이사항 탭이 없거나 이름이 바뀌면 syncAutoOutsAll은 자동 OUT을 취소하지 않고 오류를 낸다', () => {
  const x = makeEnv();
  save(x, ATT, x.input(x.a.id));
  const name = 'exceptions_' + x.term.id.slice(0, 8);
  x.env.asOwner((c) => { const ss = c.openFile_('db'); ss.getSheetByName(name).setName(name + '_old'); c.invalidate_('db', name); });
  const e = x.env.errorOf(null, () => null);
  let msg = ''; try { sync(x); } catch (err) { msg = String(err.message); }
  assert.ok(/특이사항 탭을 찾을 수 없어/.test(msg), msg);
  assert.strictEqual(x.vtab().filter((v) => v.status === '유효').length, 1, '자동 OUT은 그대로');
});

test('메일은 이번 호출이 저장한 묶음의 OUT만: 같은 동기화에서 함께 만들어진 같은 학생의 옛 묶음(처음 연결 때 쌓인 것)은 알리지 않는다', () => {
  const x = makeEnv(); x.env.scriptProps.MAIL_ENABLED = 'true';
  const tab = 'exceptions_' + x.term.id.slice(0, 8);
  x.env.asOwner((c) => c.ensureTermSheet_('exceptions', x.term.id));
  x.env.asOwner((c) => c.appendRecord_(tab, { term_id: x.term.id, group_id: 'g-old', student_id: x.a.id, date: '2027-03-02', blocks: 'ALL', type: '미인정결석', reason: '', status: '확정',
    requested_by: ATT, requested_at: '2027-03-02T08:00:00', confirmed_by: ATT, confirmed_at: '2027-03-02T08:05:00', cancel_reason: '' }, ADMIN));
  const { r, sent } = save(x, ATT, x.input(x.a.id));
  assert.strictEqual(r.out.created, 2, '밀려 있던 같은 학생의 옛 묶음 OUT도 이번 동기화에서 만들어진다');
  const toRT = sent.filter((m) => m.to === RT);
  assert.strictEqual(toRT.length, 1, '담당교사에게 알림은 이번에 저장한 묶음 하나뿐: ' + JSON.stringify(sent.map((m) => m.to)));
});

test('결정 40 보강: 넓히기 전에 낸 요청을 넓힌 뒤 확정하면 OUT이 생기고, 넓힌 뒤 첫 동작이 취소여도 그 전에 확정된 기타에는 OUT이 없다. 모양이 틀린 스냅숏은 없는 것으로 본다', () => {
  const x = makeEnv();
  const etc = (sid, d, who) => save(x, who, x.input(sid, { type: '기타', reason: '가짜 사유', from: d, to: d, blocks: '22:00-24:00' })).r;
  x.env.setNow('2027-03-03T20:00:00');
  const pre = etc(x.a.id, '2027-03-08', ATT);                        // 넓히기 전 확정(OUT 없음)
  const req = save(x, RT, x.input(x.a.id, { type: '기타', reason: '가짜 사유', from: '2027-03-09', to: '2027-03-09', blocks: '22:00-24:00' })).r;   // 넓히기 전에 낸 요청
  assert.strictEqual(req.status, '요청');
  const row = x.env.rows('settings', 'config').find((q) => q.key === 'exception.auto_out_types');
  x.env.setNow('2027-03-04T09:00:00');
  x.env.asOwner((c) => c.updateRecord_('settings', row.id, { value: row.value + ',기타' }, ADMIN, 'config'));
  // 넓힌 뒤 첫 동작이 (다른 학생 b의) 취소
  const other = etc(x.b.id, '2027-03-10', ATT);
  x.env.setNow('2027-03-04T10:00:00');
  assert.strictEqual(plain(x.env.call(ATT, 'cancelException', x.term.id, other.groupId, '넓힌 뒤 첫 동작은 취소')).ok, true);
  assert.strictEqual(x.vtab().filter((v) => v.student_id === x.a.id).length, 0, '넓히기 전 확정(pre)에는 OUT 없음');
  assert.deepStrictEqual(x.vtab().map((v) => v.status), ['취소'], '넓힌 뒤 확정한 b의 OUT은 생겼다가 취소로 남는다');
  const snap = JSON.parse(x.env.scriptProps.AUTO_OUT_SINCE);
  assert.ok(snap.since['기타'], '취소 때도 스냅숏이 갱신된다');
  // 넓히기 전에 낸 요청을 넓힌 뒤 확정 → OUT
  x.env.setNow('2027-03-04T11:00:00');
  const c = plain(x.env.call(ATT, 'confirmException', x.term.id, req.groupId));
  assert.deepStrictEqual([c.ok, c.out.created], [true, 1]);
  assert.deepStrictEqual(x.vtab().filter((v) => v.student_id === x.a.id).map((v) => v.status), ['유효'], '요청(넓히기 전)을 넓힌 뒤 확정 → OUT');
  assert.ok(pre.ok);
  // 모양이 틀린 스냅숏은 없는 것으로(기본 3종이 아니므로 기타는 지금 시각부터)
  x.env.scriptProps.AUTO_OUT_SINCE = '{"types":"x"}';
  x.env.setNow('2027-03-05T09:00:00');
  assert.strictEqual(sync(x).created, 0);
  assert.ok(Array.isArray(JSON.parse(x.env.scriptProps.AUTO_OUT_SINCE).types));
  assert.strictEqual(x.vtab().filter((v) => v.student_id === x.a.id).length, 1, '넓히기 전 확정(pre)에는 여전히 OUT 없음(요청이 확정된 OUT 하나뿐)');
});
