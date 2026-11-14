/** C4 자습 일정·블록: 순수 함수(cal…)와 서버 함수(가짜 서비스) */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const FILES = ['src/Schema.gs', 'src/Auth.gs', 'src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/DutyRules.gs', 'src/features/Schedule.gs', 'src/features/Duty.gs'];
const ctx = loadGs(FILES);
const defaults = plain(ctx.calDefaults_([]));
const blocks = plain(ctx.defaultBlockRows_()).map((b, i) => Object.assign({ id: 'b' + i, updated_at: '2027-01-01T00:00:00' }, b));
const terms = [{ id: 't1', name: '1학기', type: '학기', start_date: '2027-03-02', end_date: '2027-07-17' },
  { id: 't2', name: '여름', type: '방학', start_date: '2027-07-18', end_date: '2027-08-22' }];
const month = (m, over) => plain(ctx.calMonthPlans_(m, Object.assign({ terms, daySchedules: [], blocks, defaults }, over || {})));
const day = (days, d) => days.find((x) => x.date === d);

/** 화면이 getScheduleData로 받는 '최신인가' 표를 지금 상태에서 다시 계산(저장 직전 값) */
const dtok = (s, date) => s.c.calRowsToken_(s.c.calDayRows_(s.c.readAll_('day_schedules'), date));
const btok = (s, tt, dt) => s.c.calRowsToken_(s.c.calBlockGroupRows_(s.c.readAll_('blocks'), tt, dt));

test('calDefaults_: 설정이 없으면 PRD 3.3 기본값, 있으면 설정값(금요일 study.fri.*)', () => {
  assert.deepStrictEqual(defaults, { mon_thu: { start: '18:30', end: '23:50' }, fri: { start: '18:30', end: '23:00' },
    sat: { start: '09:00', end: '17:00' }, sun: { start: '14:00', end: '22:00' }, holiday: { start: '09:00', end: '21:50' } });
  const d = plain(ctx.calDefaults_([{ key: 'study.fri.start', value: '18:00' }, { key: 'study.weekday.end', value: '23:30' }]));
  assert.strictEqual(d.fri.start, '18:00'); assert.strictEqual(d.mon_thu.end, '23:30'); assert.strictEqual(d.fri.end, '23:00');
});

test('calTermTypeOn_: 방학 기간 안이면 방학, 기간 밖은 학기(가정), 겹치면 나중에 시작한 기간', () => {
  assert.strictEqual(ctx.calTermTypeOn_(terms, '2027-03-03'), '학기');
  assert.strictEqual(ctx.calTermTypeOn_(terms, '2027-07-20'), '방학');
  assert.strictEqual(ctx.calTermTypeOn_(terms, '2030-01-01'), '학기');
  assert.strictEqual(ctx.calTermTypeOn_(terms.concat([{ start_date: '2027-03-03', end_date: '2027-12-31', type: '방학' }]), '2027-03-03'), '방학');
});

test('월 달력: 2027-03 평일·금·토·일 요일 유형과 블록 수 3/3/3/4, 시각은 기본값', () => {
  const m = month('2027-03');
  assert.strictEqual(m.length, 31);
  assert.strictEqual(day(m, '2027-03-03').dayType, 'mon_thu');
  assert.deepStrictEqual(day(m, '2027-03-03').blockLabels, ['18–20', '20–22', '22–24']);
  assert.strictEqual(day(m, '2027-03-03').start, '18:30');
  assert.deepStrictEqual(day(m, '2027-03-05').blockLabels, ['18–19:30', '19:30–22', '22–23']);
  assert.strictEqual(day(m, '2027-03-05').end, '23:00');
  assert.strictEqual(day(m, '2027-03-06').blockLabels.length, 3);
  assert.strictEqual(day(m, '2027-03-07').blockLabels.length, 4);
  assert.ok(m.every((d) => d.operating && !d.overridden));
});

test('윤년 2028-02는 29일까지, 연말 12월은 31일까지', () => {
  assert.strictEqual(month('2028-02').length, 29);
  assert.strictEqual(month('2027-02').length, 28);
  assert.strictEqual(month('2027-12').length, 31);
});

test('어떤 날을 운영 안 함으로 바꾸면 미리보기가 "운영 안 함"이 된다', () => {
  const ds = [{ id: 'd1', date: '2027-03-10', operating: 'FALSE', status: '유효', updated_at: '2027-02-01T00:00:00' }];
  const d = day(month('2027-03', { daySchedules: ds }), '2027-03-10');
  assert.strictEqual(d.operating, false); assert.deepStrictEqual(d.blockLabels, []); assert.strictEqual(d.overridden, true);
});

test('월요일 종료를 22:00으로 당기면 22–24 블록이 사라진다', () => {
  const ds = [{ id: 'd2', date: '2027-03-08', operating: 'TRUE', end: '22:00', status: '유효', updated_at: '2027-02-01T00:00:00' }];
  const d = day(month('2027-03', { daySchedules: ds }), '2027-03-08');
  assert.deepStrictEqual(d.blockLabels, ['18–20', '20–22']);
  assert.strictEqual(d.end, '22:00');
});

test('취소한 날짜 행은 무시한다(되돌리기)', () => {
  const ds = [{ id: 'd3', date: '2027-03-10', operating: 'FALSE', status: '취소', updated_at: '2027-02-01T00:00:00' }];
  assert.strictEqual(day(month('2027-03', { daySchedules: ds }), '2027-03-10').operating, true);
});

test('방학 기간에 방학 블록이 없으면 학기 블록을 쓴다(R1 가정)', () => {
  const d = day(month('2027-07'), '2027-07-21');
  assert.strictEqual(d.termType, '방학');
  assert.strictEqual(d.blockLabels.length, 3);
});

test('운영하는 날인데 블록이 없으면 경고가 달력 값에 실린다', () => {
  const d = day(month('2027-03', { blocks: [] }), '2027-03-03');
  assert.ok(d.warnings.some((w) => w.includes('블록이 없습니다')));
});

/* ───── 날짜별 일정 입력 검사 ───── */

const vd = (o, known) => plain(ctx.calValidateDay_(Object.assign({ date: '2027-03-08', operating: true }, o), known || []));
const fields = (r) => r.errors.map((e) => e.field);

test('calValidateDay_: 종료 22:00은 통과하고 기록 모양이 맞다', () => {
  const r = vd({ end: '22:00' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.record, { date: '2027-03-08', operating: 'TRUE', start: '', end: '22:00', day_type: '', memo: '', status: '유효' });
  assert.strictEqual(vd({ end: '24:00' }).ok, true, '종료 24:00 허용');
  assert.strictEqual(vd({ start: '9:00', end: '17:00' }).record.start, '09:00');
});

test('calValidateDay_: 나쁜 입력(날짜·시각·순서·유형·바꿀 내용 없음)', () => {
  assert.deepStrictEqual(fields(vd({ date: '2027-02-30', end: '22:00' })), ['date']);
  assert.deepStrictEqual(fields(vd({ start: '25:00', end: '22:00' })), ['start']);
  assert.deepStrictEqual(fields(vd({ start: '24:00', end: '22:00' })), ['start'], '시작이 잘못이면 순서 오류는 따로 내지 않는다');
  assert.deepStrictEqual(fields(vd({ start: '22:00', end: '18:00' })), ['end']);
  assert.deepStrictEqual(fields(vd({ end: '9시' })), ['end']);
  assert.deepStrictEqual(fields(vd({ end: '22:00', day_type: 'xyz' })), ['day_type']);
  assert.deepStrictEqual(fields(vd({})), ['operating'], '바꿀 내용 없음');
  assert.deepStrictEqual(fields(vd({ end: '22:00', memo: 'x'.repeat(101) })), ['memo']);
  assert.strictEqual(vd({ end: '22:00', day_type: 'special1' }, ['special1']).ok, true, '특별 코드는 블록이 있으면 허용');
});

test('calValidateDay_: 운영 안 함이면 시각·유형은 비우고 메모만 남긴다', () => {
  const r = vd({ operating: false, start: '18:00', end: '22:00', day_type: 'fri', memo: '수능' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.record, { date: '2027-03-08', operating: 'FALSE', start: '', end: '', day_type: '', memo: '수능', status: '유효' });
  assert.strictEqual(vd({ operating: false }).ok, true, '운영 안 함은 그 자체로 저장할 내용');
});

/* ───── 블록 교체 계획 ───── */

const ex = (rows) => rows.map((r, i) => Object.assign({ id: 'x' + i, term_type: '학기', day_type: 'mon_thu', status: '유효', label: '' }, r));
const plan = (incoming, existing) => plain(ctx.calBlocksDiff_('학기', 'mon_thu', incoming, existing));

test('calBlocksDiff_: 그대로면 전부 유지, 바뀐 행만 취소+새로 만든다', () => {
  const existing = ex([{ seq: '1', start: '18:00', end: '20:00' }, { seq: '2', start: '20:00', end: '22:00' }, { seq: '3', start: '22:00', end: '24:00' }]);
  const same = plan([{ start: '18:00', end: '20:00' }, { start: '20:00', end: '22:00' }, { start: '22:00', end: '24:00' }], existing);
  assert.strictEqual(same.ok, true); assert.strictEqual(same.keep.length, 3); assert.strictEqual(same.cancel.length, 0); assert.strictEqual(same.create.length, 0);
  const changed = plan([{ start: '18:00', end: '20:00' }, { start: '20:00', end: '22:30' }, { start: '22:30', end: '24:00' }], existing);
  assert.strictEqual(changed.keep.length, 1);
  assert.deepStrictEqual(changed.cancel.map((r) => r.id), ['x1', 'x2']);
  assert.deepStrictEqual(changed.create.map((r) => r.seq + ' ' + r.start + '-' + r.end), ['2 20:00-22:30', '3 22:30-24:00']);
});

test('calBlocksDiff_: 라벨은 시각에서 계산한다 — 시각만 바꿔도 예전 라벨이 남지 않는다', () => {
  const existing = ex([{ seq: '1', start: '22:00', end: '24:00', label: '22–24' }]);
  const p = plan([{ start: '22:00', end: '23:30', label: '22–24' }], existing);
  assert.deepStrictEqual(p.create.map((r) => r.label), ['22–23:30']);
  assert.strictEqual(plan([{ start: '22:00', end: '24:00' }], existing).keep.length, 1);
  assert.strictEqual(plan([{ start: '09:00', end: '12:00' }], []).create[0].label, '09–12');
});

test('기본 블록 시드의 라벨은 R1 라벨과 같아서 처음 저장해도 바뀐 행으로 세지 않는다', () => {
  for (const dt of ['mon_thu', 'fri', 'sat', 'sun']) {
    const existing = blocks.filter((b) => b.day_type === dt);
    const incoming = existing.map((b) => ({ start: b.start, end: b.end }));
    const p = plain(ctx.calBlocksDiff_('학기', dt, incoming, existing));
    assert.strictEqual(p.keep.length, existing.length, dt);
    assert.strictEqual(p.cancel.length + p.create.length, 0, dt);
  }
});

test('calBlocksDiff_: 시작 시각 순으로 정렬해 순서를 1부터 다시 매기고, 9:00도 받는다', () => {
  const p = plan([{ start: '20:00', end: '22:00' }, { start: '9:00', end: '12:00' }], []);
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.create.map((r) => r.seq + ' ' + r.start), ['1 09:00', '2 20:00']);
});

test('calBlocksDiff_: 겹침·역순·형식 오류·빈 목록·너무 많음은 저장하지 않고 입력 위치로 알려 준다(나쁜 입력)', () => {
  const overlap = plan([{ start: '18:00', end: '21:00' }, { start: '20:00', end: '22:00' }], []);
  assert.strictEqual(overlap.ok, false);
  assert.ok(overlap.errors[0].message.includes('겹칩니다'));
  assert.strictEqual(overlap.errors[0].index, 1);
  assert.strictEqual(plan([{ start: '22:00', end: '20:00' }], []).ok, false);
  const fmt = plan([{ start: '18:00', end: '20:00' }, { start: '여섯시', end: '22:00' }], []);
  assert.deepStrictEqual(fmt.errors.map((e) => e.index), [1]);
  assert.strictEqual(plan([], []).ok, false);
  assert.strictEqual(plan(Array.from({ length: 9 }, (_, i) => ({ start: '0' + i + ':00', end: '0' + i + ':30' })), []).ok, false);
  assert.strictEqual(plan([{ start: '24:00', end: '24:00' }], []).ok, false, '시작 24:00 불가');
});

/* ───── 서버 함수(가짜 서비스) ───── */

function makeServer(email, roles, seed) {
  const db = { terms: terms.map((t) => Object.assign({}, t)), blocks: blocks.map((b) => Object.assign({}, b)), day_schedules: [], settings: [], duty_slots: [] };
  Object.assign(db, seed || {});
  const denied = [], writes = [];
  let uid = 0, depth = 0;
  const users = [{ id: 'u', email, active: 'TRUE', roles: roles.join(','), name: '가짜', homeroom_class: '' }];
  const c = loadGs(FILES, {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    readAll_: (n) => (n === 'users' ? users : (db[n] || []).map((r) => Object.assign({}, r))),
    findById_: () => null, today_: () => '2027-03-03', invalidate_: () => {},
    logDenied_: (who, action) => denied.push(action),
    withLock_: (fn) => { depth++; try { return fn(); } finally { depth--; } },
    appendRecord_: (sheet, rec, who) => { assert.ok(depth > 0, '쓰기는 락 안에서'); const r = Object.assign({ id: 'n' + (++uid), updated_at: '2027-03-03T10:00:00' }, rec); db[sheet].push(r); writes.push('+' + sheet); return r; },
    updateRecord_: (sheet, id, patch, who) => { assert.ok(depth > 0, '쓰기는 락 안에서'); const r = db[sheet].find((x) => x.id === id); Object.assign(r, patch); writes.push('~' + sheet + ':' + id + ':' + Object.keys(patch)); return r; }
  });
  return { c, db, denied, writes };
}

test('saveBlocks·saveDaySchedule·cancelDaySchedule: 관리자가 아니면 거부하고 denied:schedule.edit, 아무것도 쓰지 않는다', () => {
  for (const roles of [['hall_teacher'], ['attendance'], ['homeroom'], ['duty_manager'], ['student'], ['parent']]) {
    const s = makeServer('x@example.com', roles);
    assert.throws(() => s.c.saveBlocks('학기', 'mon_thu', [{ start: '18:00', end: '20:00' }]), /권한이 없습니다/);
    assert.throws(() => s.c.saveDaySchedule({ date: '2027-03-08', operating: false }), /권한이 없습니다/);
    assert.throws(() => s.c.cancelDaySchedule('2027-03-08'), /권한이 없습니다/);
    assert.deepStrictEqual(s.denied, ['schedule.edit', 'schedule.edit', 'schedule.edit'], roles.join());
    assert.deepStrictEqual(s.writes, []);
  }
});

test('getScheduleData: 교사 역할은 보기 가능(canEdit false), 관리자는 canEdit, 학생·학부모는 거부', () => {
  const t = plain(makeServer('t@example.com', ['hall_teacher']).c.getScheduleData('2027-03'));
  assert.strictEqual(t.canEdit, false); assert.strictEqual(t.days.length, 31);
  assert.ok(t.dayTypes.includes('mon_thu')); assert.ok(t.blockGroups['학기|fri'].length === 3);
  assert.strictEqual(plain(makeServer('a@example.com', ['admin']).c.getScheduleData('2027-03')).canEdit, true);
  assert.throws(() => makeServer('s@example.com', ['student']).c.getScheduleData('2027-03'), /권한이 없습니다/);
  assert.throws(() => makeServer('p@example.com', ['parent']).c.getScheduleData('2027-03'), /권한이 없습니다/);
  assert.throws(() => makeServer('a@example.com', ['admin']).c.getScheduleData('2027-13'), /yyyy-MM/);
  assert.strictEqual(plain(makeServer('a@example.com', ['admin']).c.getScheduleData('')).month, '2027-03', '비우면 이번 달');
});

test('saveDaySchedule: 이전 유효 행을 취소하고 새 행을 쓴다 → 미리보기에 반영 → 되돌리면 기본', () => {
  const s = makeServer('a@example.com', ['admin']);
  assert.deepStrictEqual(plain(s.c.saveDaySchedule({ date: '2027-03-10', operating: false, memo: '수능', token: dtok(s, '2027-03-10') })), { ok: true, canceledSlots: 0 });
  assert.strictEqual(plain(s.c.getScheduleData('2027-03')).days.find((d) => d.date === '2027-03-10').operating, false);
  // 같은 날을 다시 저장하면 이전 행이 '취소'되고 유효 행은 하나
  s.c.saveDaySchedule({ date: '2027-03-10', operating: true, end: '22:00', token: dtok(s, '2027-03-10') });
  const rows = s.db.day_schedules.filter((r) => r.date === '2027-03-10');
  assert.deepStrictEqual(rows.map((r) => r.status), ['취소', '유효']);
  assert.deepStrictEqual(plain(s.c.getScheduleData('2027-03')).days.find((d) => d.date === '2027-03-10').blockLabels, ['18–20', '20–22']);
  assert.deepStrictEqual(plain(s.c.cancelDaySchedule('2027-03-10')), { ok: true, cancelled: 1 });
  assert.strictEqual(plain(s.c.getScheduleData('2027-03')).days.find((d) => d.date === '2027-03-10').overridden, false);
  assert.ok(s.db.day_schedules.every((r) => r.status === '취소'), '행은 지우지 않고 모두 취소로 남는다');
});

test('saveDaySchedule: 검사에 걸리면 아무것도 쓰지 않는다', () => {
  const s = makeServer('a@example.com', ['admin']);
  const r = plain(s.c.saveDaySchedule({ date: '2027-03-10', operating: true, start: '22:00', end: '18:00' }));
  assert.strictEqual(r.ok, false); assert.deepStrictEqual(s.writes, []);
});

test('saveBlocks: 22–24를 22–23:30으로 바꾸면 그 행만 취소+새로 쓰고, 같은 내용으로 다시 저장하면 쓰기 0건', () => {
  const s = makeServer('a@example.com', ['admin']);
  const input = [{ start: '18:00', end: '20:00' }, { start: '20:00', end: '22:00' }, { start: '22:00', end: '23:30' }];
  const r = plain(s.c.saveBlocks('학기', 'mon_thu', input, btok(s, '학기', 'mon_thu')));
  assert.deepStrictEqual(r, { ok: true, kept: 2, cancelled: 1, created: 1 });
  const active = s.db.blocks.filter((b) => b.status === '유효' && b.day_type === 'mon_thu');
  assert.deepStrictEqual(active.map((b) => b.start + '-' + b.end), ['18:00-20:00', '20:00-22:00', '22:00-23:30']);
  assert.strictEqual(s.db.blocks.filter((b) => b.status === '취소').length, 1, '삭제 없이 취소 표시');
  const before = s.writes.length;
  assert.deepStrictEqual(plain(s.c.saveBlocks('학기', 'mon_thu', input, btok(s, '학기', 'mon_thu'))), { ok: true, kept: 3, cancelled: 0, created: 0 });
  assert.strictEqual(s.writes.length, before);
  // 다른 요일 유형 블록은 그대로
  assert.strictEqual(s.db.blocks.filter((b) => b.status === '유효' && b.day_type === 'fri').length, 3);
});

test('saveBlocks: 나쁜 입력(겹침·잘못된 유형)은 쓰지 않는다 / 방학 블록을 새로 만들 수 있다', () => {
  const s = makeServer('a@example.com', ['admin']);
  const bad = plain(s.c.saveBlocks('학기', 'mon_thu', [{ start: '18:00', end: '21:00' }, { start: '20:00', end: '22:00' }], btok(s, '학기', 'mon_thu')));
  assert.strictEqual(bad.ok, false); assert.deepStrictEqual(s.writes, []);
  assert.throws(() => s.c.saveBlocks('여름', 'mon_thu', []), /학기 또는 방학/);
  assert.throws(() => s.c.saveBlocks('학기', 'Mon Thu!', []), /요일 유형/);
  assert.deepStrictEqual(plain(s.c.saveBlocks('방학', 'mon_thu', [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }], btok(s, '방학', 'mon_thu'))),
    { ok: true, kept: 0, cancelled: 0, created: 2 });
  const d = plain(s.c.getScheduleData('2027-07')).days.find((x) => x.date === '2027-07-21');
  assert.deepStrictEqual(d.blockLabels, ['09–12', '14–17'], '방학 날은 방학 블록');
});

test('화면 라우팅: schedule 화면은 교사 역할만 열 수 있다', () => {
  const r = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/Code.gs']);
  for (const role of ['admin', 'hall_teacher', 'attendance', 'homeroom']) assert.strictEqual(plain(r.screenResolve_('schedule', [role])).ok, true, role);
  for (const role of ['student', 'parent']) assert.strictEqual(plain(r.screenResolve_('schedule', [role])).ok, false, role);
});

test('낡은 화면 방지(saveBlocks): A가 읽고 B가 먼저 저장하면 A의 옛 화면 저장은 {stale:true}·쓰기 0, 표가 없거나 틀려도 같고, 새 표로는 된다', () => {
  const s = makeServer('a@example.com', ['admin']);
  const seen = plain(s.c.getScheduleData('2027-03')).blockTokens;   // 관리자 A가 화면을 연다
  assert.ok(typeof seen['학기|mon_thu'] === 'string' && seen['학기|mon_thu'].length > 0);
  const input = [{ start: '18:00', end: '20:00' }, { start: '20:00', end: '22:00' }, { start: '22:00', end: '23:30' }];
  assert.strictEqual(plain(s.c.saveBlocks('학기', 'mon_thu', input, seen['학기|mon_thu'])).ok, true);   // B가 먼저 저장
  const w = s.writes.length, blocks = JSON.stringify(s.db.blocks);
  const old = plain(s.c.saveBlocks('학기', 'mon_thu', [{ start: '18:00', end: '21:00' }], seen['학기|mon_thu']));   // A의 옛 화면
  assert.deepStrictEqual([old.ok, old.stale, /새로 불러온 뒤/.test(old.error)], [false, true, true]);
  [undefined, '', 5, null, 'zz'].forEach((t) => assert.strictEqual(plain(s.c.saveBlocks('학기', 'mon_thu', input, t)).stale, true, String(t)));
  assert.strictEqual(s.writes.length, w, '쓰기 0건');
  assert.strictEqual(JSON.stringify(s.db.blocks), blocks);
  const fresh = plain(s.c.getScheduleData('2027-03')).blockTokens['학기|mon_thu'];
  assert.notStrictEqual(fresh, seen['학기|mon_thu']);
  assert.strictEqual(plain(s.c.saveBlocks('학기', 'mon_thu', [{ start: '18:00', end: '21:00' }], fresh)).ok, true);
  // 다른 (유형, 요일)의 표는 영향이 없다
  assert.strictEqual(plain(s.c.getScheduleData('2027-03')).blockTokens['학기|fri'], seen['학기|fri']);
});

test('낡은 화면 방지(saveDaySchedule): A가 읽고 B가 먼저 저장하면 A의 옛 화면 저장은 {stale:true}·쓰기 0(검사 오류는 표보다 먼저), 새 표로는 된다', () => {
  const s = makeServer('a@example.com', ['admin']);
  const tokens = () => plain(s.c.getScheduleData('2027-03')).dayTokens;
  const seen = tokens();
  assert.strictEqual(seen['2027-03-10'], '', '일정이 없는 날의 표는 빈 글자');
  assert.strictEqual(plain(s.c.saveDaySchedule({ date: '2027-03-10', operating: true, end: '22:00', token: seen['2027-03-10'] })).ok, true);   // B
  const w = s.writes.length, rows = JSON.stringify(s.db.day_schedules);
  const old = plain(s.c.saveDaySchedule({ date: '2027-03-10', operating: false, memo: '옛 화면', token: seen['2027-03-10'] }));   // A의 옛 화면
  assert.deepStrictEqual([old.ok, old.stale], [false, true]);
  [undefined, '', 7, null].forEach((t) => assert.strictEqual(plain(s.c.saveDaySchedule({ date: '2027-03-10', operating: false, token: t })).stale, true, String(t)));
  assert.strictEqual(s.writes.length, w);
  assert.strictEqual(JSON.stringify(s.db.day_schedules), rows);
  // 검사 오류(날짜 형식·시각)는 표와 상관없이 먼저 나온다
  assert.strictEqual(plain(s.c.saveDaySchedule({ date: '2027-03-10', operating: true, start: '22:00', end: '18:00', token: 'x' })).stale, undefined);
  // 다른 날짜의 표는 영향 없음, 새 표로는 된다
  assert.strictEqual(tokens()['2027-03-11'], seen['2027-03-11']);
  assert.strictEqual(plain(s.c.saveDaySchedule({ date: '2027-03-10', operating: false, memo: '새 화면', token: tokens()['2027-03-10'] })).ok, true);
});
