/** S2-0c 감사 기록(Db.gs): 상담 내용 가리기, bulk_create에 행 id 목록. gas-fakes(실제 Db·Auth 경로), 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const OWNER = 'owner@example.com';
const MARK = 'ZZ-면담-표식';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-20T20:00:00' });
  env.seedFake({ stage1: true });
  return env;
}
const bulkRows = (env) => env.rows('audit_log').filter((r) => r.action === 'bulk_create');

test('상담일지(counsel)의 content·agreement는 운영 DB audit_log에 글자 수만 남는다(만들기·고치기·일괄 고치기·취소), 상담 파일에는 그대로', () => {
  const env = makeEnv();
  const sid = env.rows('students')[0].id;
  const content = MARK + ' 학부모와 면담한 내용';
  const note = env.asOwner((c) => c.appendRecord_('counsel_notes', { student_id: sid, date: '2027-03-20', teacher_email: OWNER,
    type: '2OUT 학부모 면담', content, agreement: MARK + ' 합의', show_to_parent: 'TRUE', status: '유효' }, OWNER, 'counsel'));
  env.asOwner((c) => c.appendRecord_('counsel_notes', { student_id: sid, date: '2027-03-20', teacher_email: OWNER,
    type: '일반', content: '', status: '유효' }, OWNER, 'counsel'));
  // 상담 내용은 제자리에서 고치지 않는다(결정 42): 고치기는 다른 칸으로, 일괄 고치기는 잘못 불러도 새지 않는지만 본다
  env.asOwner((c) => c.updateRecord_('counsel_notes', note.id, { date: '2027-03-21' }, OWNER, 'counsel'));
  env.asOwner((c) => c.bulkUpdateRecords_('counsel_notes', [{ id: note.id, patch: { content: MARK + ' 다시' } }], OWNER, 'counsel'));
  env.asOwner((c) => c.updateRecord_('counsel_notes', note.id, { status: '취소' }, OWNER, 'counsel'));

  assert.ok(env.rows('counsel_notes', 'counsel').find((r) => r.id === note.id).content.includes(MARK), '상담 파일의 행에는 내용이 그대로');
  assert.ok(!JSON.stringify(env.sheetValues('audit_log')).includes(MARK), '운영 DB audit_log 어디에도 표식이 없다');
  const audit = env.rows('audit_log').filter((r) => r.sheet === 'counsel/counsel_notes');
  assert.deepStrictEqual(audit.map((r) => r.action), ['create', 'create', 'update', 'bulk_update', 'update']);
  const created = JSON.parse(audit[0].after);
  assert.strictEqual(created.content, '(내용 생략, ' + content.length + '자)');
  assert.strictEqual(created.agreement, '(내용 생략, ' + (MARK + ' 합의').length + '자)');
  assert.deepStrictEqual([created.type, created.student_id, created.status], ['2OUT 학부모 면담', sid, '유효'], '다른 칸은 그대로');
  assert.strictEqual(JSON.parse(audit[1].after).content, '', '빈 내용은 빈 칸 그대로');
  assert.strictEqual(JSON.parse(audit[2].before).content, '(내용 생략, ' + content.length + '자)');
  assert.deepStrictEqual([JSON.parse(audit[2].after).content, JSON.parse(audit[2].after).date], ['(내용 생략, ' + content.length + '자)', '2027-03-21']);
  assert.strictEqual(JSON.parse(audit[3].after)[note.id].content, '(내용 생략, ' + (MARK + ' 다시').length + '자)', '일괄 고치기 모양({id: {열: 값}})도 가린다');
  assert.strictEqual(JSON.parse(audit[4].after).status, '취소');
  // 상담 파일(kind counsel)만 가린다
  const s = env.asOwner((c) => c.appendRecord_('spaces', { name: '시험실', gender: '혼성', rows: '1', cols: '1', status: '유효', content: '보이는 값' }, OWNER));
  assert.ok(env.rows('audit_log').find((r) => r.row_id === s.id).after.includes('"content":"보이는 값"'));
});

test('bulkAppend_를 쓰는 모든 경로(기본 블록·가짜 데이터·좌석 3곳·특이사항·명단·학부모 연결·이어받기)의 새 행 id가 모두 audit_log에 남는다', () => {
  const env = makeEnv();
  const step = (sheets, fn) => {
    const n0 = bulkRows(env).length;
    const r = fn();
    const got = bulkRows(env).slice(n0).map((x) => x.sheet);
    sheets.forEach((s) => assert.ok(got.includes(s), s + '의 bulk_create가 없음: ' + got));
    return r;
  };
  ['blocks', 'terms', 'students', 'enrollments', 'guardian_links', 'users', 'seats', 'seat_assignments', 'status_changes']
    .forEach((s) => assert.ok(bulkRows(env).some((x) => x.sheet === s), 'setup·가짜 데이터: ' + s));
  // 좌석: 붙여넣기(Seats.gs importSeatGrid), 격자 저장(saveSpaceGrid), 배정(seatApplyOps_)
  step(['seats'], () => assert.strictEqual(env.call(OWNER, 'importSeatGrid', '공석\t공석', { name: '붙여넣기실', gender: '혼성' }).ok, true));
  const sp = env.call(OWNER, 'saveSpace', { name: '격자실', gender: '혼성', rows: 2, cols: 2 });
  step(['seats'], () => assert.strictEqual(env.call(OWNER, 'saveSpaceGrid', sp.id, [{ row: 1, col: 1, kind: '좌석' }, { row: 2, col: 2, kind: '기둥' }]).ok, true));
  const d = plain(env.call(OWNER, 'getSeatData'));
  const empty = d.spaces.flatMap((x) => x.cells).find((c) => c.kind === 'seat' && c.vacant && !c.hold);
  step(['seat_assignments'], () => assert.strictEqual(env.call(OWNER, 'assignSeat', d.term.id, empty.id, d.unseated[0].id, { [empty.id]: empty.token }).ok, true));
  // 특이사항(여러 날짜)
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const first = env.rows('students').find((s) => s.memo === '가짜 데이터');
  step(['exceptions_' + term.id.slice(0, 8)], () => assert.strictEqual(env.call('test.attendance@example.com', 'saveException',
    { studentId: first.id, from: '2027-03-22', to: '2027-03-24', blocks: 'ALL', type: '병결', reason: '' }).ok, true));
  // 명단 올리기(새 학생 1명) → 학생·등록·상태·계정
  const opts = { termId: term.id, ymd: '2027-03-22' };
  const roster = ['학번,학년,반,번호,이름,성별,계열,학사,기숙사,베리타스,조식,석식,통학구분,담당교사이메일,학생구글계정,비고',
    '39001,1,2,30,가짜신규,여,,O,X,X,X,학사,일반,fake.teacher1@example.com,fake.new1@example.com,'].join('\n');
  const p = env.call(OWNER, 'previewRoster', roster, opts);
  step(['students', 'enrollments', 'status_changes', 'users'], () => assert.strictEqual(
    env.call(OWNER, 'commitRoster', roster, opts, { counts: p.counts, termId: p.term.id, ymd: p.ymd }).ok, true));
  // 학부모 연결
  const guardians = ['학부모구글계정,학번,관계', 'fake.newparent@example.com,39001,모'].join('\n');
  const g = env.call(OWNER, 'previewGuardians', guardians, { termId: term.id });
  step(['guardian_links', 'users'], () => assert.strictEqual(env.call(OWNER, 'commitGuardians', guardians, { termId: term.id }, { counts: g.counts, termId: g.termId }).ok, true));
  // 새 학기 이어받기
  const t2 = env.call(OWNER, 'saveTerm', { name: '2027 2학기', type: '학기', start_date: '2027-08-17', end_date: '2028-02-28' });
  assert.strictEqual(t2.ok, true, JSON.stringify(t2));
  const cp = env.call(OWNER, 'previewCarryOver', t2.id);
  step(['enrollments'], () => assert.strictEqual(env.call(OWNER, 'commitCarryOver', t2.id, cp.count).ok, true));

  // 운영 DB의 모든 행: create 감사의 row_id 또는 bulk_create 감사의 id 목록에 있다
  const audited = new Set();
  env.rows('audit_log').forEach((r) => {
    if (r.action === 'create') audited.add(r.row_id);
    if (r.action === 'bulk_create') JSON.parse(r.after).forEach((id) => audited.add(id));
  });
  let n = 0;
  env.file('db').getSheets().map((sh) => sh.getName()).filter((name) => name !== 'audit_log').forEach((name) => {
    env.rows(name).forEach((r) => { n++; assert.ok(audited.has(r.id), name + ' 행 ' + r.id + '이 감사 기록에 없다'); });
  });
  assert.ok(n > 500, '확인한 행 수: ' + n);
  assert.ok(bulkRows(env).every((r) => r.detail.includes('행 (일괄 추가)') && r.before === ''), '한 줄이면 요약 문구는 그대로');
});

test('bulk_create 감사가 2만 자를 넘으면 여러 줄로 나뉘고, 합치면 새 행 id 전부가 한 번씩', () => {
  const env = makeEnv();
  const N = 1200;
  const before = new Set(env.rows('fixed_schedules').map((r) => r.id));
  const n0 = bulkRows(env).length;
  env.asOwner((c) => c.bulkAppend_('fixed_schedules', Array.from({ length: N }, (_, i) => ({ memo: '가짜 ' + i })), OWNER));
  const rows = bulkRows(env).slice(n0);
  const fresh = env.rows('fixed_schedules').map((r) => r.id).filter((id) => !before.has(id));
  assert.strictEqual(fresh.length, N);
  assert.ok(rows.length > 1, '여러 줄: ' + rows.length);
  const ids = [];
  rows.forEach((r, i) => {
    assert.ok(r.after.length <= 20000, '칸 길이 ' + r.after.length);
    assert.strictEqual(r.detail, N + '행 (일괄 추가 ' + (i + 1) + '/' + rows.length + ')');
    ids.push(...JSON.parse(r.after));
  });
  assert.strictEqual(new Set(ids).size, N, '중복 없음');
  assert.deepStrictEqual(ids.slice().sort(), fresh.slice().sort(), '새 행 id 전부');
});
