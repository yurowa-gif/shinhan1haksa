/** C52 F16 탐구 기록: R4 gas-fakes. 가짜 학생·가짜 기록 파일(tests/fixtures/discovery)만. 신원은 로그인 계정, 응답은 판정표 칸만, 같은 파일은 0건, 원본은 비공유 폴더, 정리는 관리자만. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, plain, ROOT } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { textOf } = require('../helpers/leak-scan');

const ADMIN = 'test.admin@example.com', HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com', ATT = 'test.attendance@example.com', DUTY = 'test.duty@example.com';
const TODAY = '2027-03-10';
const FILE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/discovery/fake-export.json'), 'utf8');
const edit = (fn) => { const j = JSON.parse(FILE); fn(j); return JSON.stringify(j); };
const MEMO = 'ZZ-탐구메모-표식';

function makeEnv(now) {
  const env = createGasEnv({ now: now || TODAY + 'T20:00:00' });
  env.seedFake({ stage1: true });
  const term = env.rows('terms').find((t) => t.name === '2027 1학기');
  const students = env.rows('students');
  const me = students.find((s) => s.email === STUDENT);
  const enr = (sid) => env.rows('enrollments').find((e) => e.term_id === term.id && e.student_id === sid);
  const teacher = enr(me.id).teacher_email;
  const rows = () => env.rows('inquiry_records');
  const stranger = students.find((s) => s.id !== me.id && enr(s.id) && enr(s.id).teacher_email !== teacher);
  return { env, term, me, teacher, stranger, rows, enr };
}
const call = (x, who, fn, ...a) => plain(x.env.call(who, fn, ...a));
const upload = (x, text, confirm, who) => call(x, who || STUDENT, 'uploadInquiryFile', text === undefined ? FILE : text, confirm === true);

test('권한표: 올리기·진행·공개는 학생 본인만, 보기는 학생·학부모·담당·담임·관리자, 정리는 관리자만 — 출결·근무는 denied', () => {
  const x = makeEnv();
  x.env.expectAllowed(STUDENT, 'previewInquiryFile', FILE);
  for (const who of [ADMIN, x.teacher, HOMEROOM, PARENT, ATT, DUTY]) {
    x.env.expectDenied(who, 'inquiry.upload', 'previewInquiryFile', FILE);
    x.env.expectDenied(who, 'inquiry.upload', 'uploadInquiryFile', FILE, true);
  }
  assert.strictEqual(x.rows().length, 0, '거부된 올리기는 행이 없다');
  assert.strictEqual(upload(x, FILE, true).ok, true);
  const id = x.rows()[0].id;
  for (const who of [ADMIN, x.teacher, HOMEROOM, PARENT, ATT, DUTY]) {
    x.env.expectDenied(who, 'inquiry.progress', 'saveInquiryProgress', id, { progress: '완료' });
    x.env.expectDenied(who, 'inquiry.publish', 'setInquiryShare', id, true);
  }
  for (const who of [STUDENT, ADMIN, x.teacher]) x.env.expectAllowed(who, 'getInquiryStudent', x.me.id);
  for (const who of [ATT, DUTY]) x.env.expectDenied(who, 'inquiry.view', 'getInquiryStudent', x.me.id);
  x.env.expectDenied(STUDENT, 'inquiry.view', 'getInquiryStudent', x.stranger.id);
  for (const who of [STUDENT, x.teacher, HOMEROOM, PARENT, ATT]) x.env.expectDenied(who, 'inquiry.cleanup', 'getInquiryCleanup');
  x.env.expectAllowed(ADMIN, 'getInquiryCleanup');
  for (const who of [STUDENT, x.teacher, HOMEROOM, PARENT, ATT]) x.env.expectDenied(who, 'inquiry.cleanup', 'cleanupInquiryFiles', [x.me.id]);
});

test('미리 보기(저장 안 함): 새 기록 3건·이미 있는 0건, 이름이 다르면 파일 이름과 내 이름·확인 필요, 같은 파일을 올린 뒤에는 새 0건·이미 있는 3건', () => {
  const x = makeEnv();
  const p = call(x, STUDENT, 'previewInquiryFile', FILE);
  assert.deepStrictEqual([p.ok, p.newCount, p.sameCount, p.nameMismatch], [true, 3, 0, true]);
  assert.deepStrictEqual([p.fileName, p.accountName], ['가짜학생01', x.me.name], '이름이 다르면 파일 속 이름과 내 이름');
  assert.strictEqual(p.newTitles.length, 3);
  assert.strictEqual(x.rows().length, 0, '미리 보기는 아무것도 쓰지 않는다');
  assert.strictEqual(x.env.drive.filesIn ? Object.keys(x.env.drive.files).length : 0, 0, '원본도 저장하지 않는다');
  const same = edit((j) => { j.student.name = x.me.name; });
  const q = call(x, STUDENT, 'previewInquiryFile', same);
  assert.deepStrictEqual([q.nameMismatch, q.fileName], [false, ''], '이름이 같으면 확인 없음');
  upload(x, same);
  const again = call(x, STUDENT, 'previewInquiryFile', same);
  assert.deepStrictEqual([again.newCount, again.sameCount], [0, 3]);
});

test('올리기: 신원은 로그인 계정(파일 속 이름 무시), 진행 관심·공개 꺼짐·이름 다름 표시, 원본은 비공유 폴더에 한 개, 같은 파일 두 번은 0건·원본 안 늘어남', () => {
  const x = makeEnv();
  const nope = upload(x, FILE, false);
  assert.strictEqual(nope.ok, false);
  assert.ok(nope.errors[0].message.includes('내 기록이 맞습니다'), JSON.stringify(nope));
  assert.strictEqual(x.rows().length, 0, '이름 확인 전에는 아무것도 안 쓴다');
  const r = upload(x, FILE, true);
  assert.deepStrictEqual([r.ok, r.added, r.same, r.updated], [true, 3, 0, 0], JSON.stringify(r));
  const rows = x.rows();
  assert.ok(rows.every((q) => q.student_id === x.me.id && q.term_id === x.term.id && q.progress === '관심' && q.show_to_parent === 'FALSE' && q.name_mismatch === 'TRUE' && q.status === '유효'));
  assert.ok(rows.every((q) => q.file_id && q.file_id === rows[0].file_id), '한 번 올린 기록은 같은 원본 파일');
  assert.deepStrictEqual(rows.map((q) => q.source_id).sort(), ['rec-001', 'rec-002', 'rec-003']);
  const files = x.env.drive.filesIn(Object.keys(x.env.drive.folders)[0]);
  assert.strictEqual(files.length, 1, '원본 파일 한 개');
  assert.strictEqual(files[0].sharing, 'PRIVATE');
  assert.ok(!/가짜학생01/.test(files[0].name) && !files[0].name.includes(x.me.name), '파일 이름에 사람 이름 없음: ' + files[0].name);
  assert.ok(files[0].content.includes('rec-001'), '원본 내용 그대로');
  const again = upload(x, FILE, true);
  assert.deepStrictEqual([again.ok, again.added, again.same], [true, 0, 3], '같은 파일 두 번 = 0건');
  assert.strictEqual(x.rows().length, 3);
  assert.strictEqual(x.env.drive.filesIn(Object.keys(x.env.drive.folders)[0]).length, 1, '새 기록이 없으면 원본을 또 저장하지 않는다');
});

test('올리기: 관심 표시만 바뀐 파일은 표시만 맞추고(진행·메모·공개는 그대로), 본문이 다른 같은 기록이 있으면 아무것도 쓰지 않는다, 그 밖의 거부(다른 앱·12MB)', () => {
  const x = makeEnv();
  upload(x, FILE, true);
  const id = x.rows().find((q) => q.source_id === 'rec-002').id;
  assert.strictEqual(call(x, STUDENT, 'saveInquiryProgress', id, { progress: '진행 중', resultLink: 'https://example.com/a', memo: MEMO + ' 하나' }).ok, true);
  const liked = edit((j) => { j.records[1].events = [{ type: 'like', at: '2027-04-03T00:00:00Z' }]; });
  const r = upload(x, liked, true);
  assert.deepStrictEqual([r.ok, r.added, r.updated, r.same], [true, 0, 1, 2]);
  const row = x.rows().find((q) => q.id === id);
  assert.deepStrictEqual([row.liked, row.progress, row.result_link, row.memo.includes(MEMO), row.show_to_parent], ['TRUE', '진행 중', 'https://example.com/a', true, 'FALSE'], '학생이 덧붙인 칸은 그대로');
  const before = JSON.stringify(x.rows());
  const diff = upload(x, edit((j) => { j.records[1].title = '가짜 주제: 완전히 다른 제목'; }), true);
  assert.strictEqual(diff.ok, false);
  assert.ok(diff.errors[0].message.includes('이미 올린 기록 1건과 내용이 다릅니다') && diff.errors[0].message.includes('올린 기록은 바뀌지 않았습니다'), JSON.stringify(diff));
  assert.strictEqual(JSON.stringify(x.rows()), before, '충돌이면 통째로 거절');
  assert.strictEqual(upload(x, edit((j) => { j.app = 'other'; }), true).ok, false);
  assert.strictEqual(upload(x, 'x'.repeat(13 * 1024 * 1024), true).ok, false);
});

test('진행 기록·공개: 본인 행만(남의 행 denied), 진행 3가지·링크 http(s)만·메모 500자, 켜고 끈 것은 audit에 남고 메모 글은 글자 수만', () => {
  const x = makeEnv();
  upload(x, FILE, true);
  const id = x.rows()[0].id;
  const a0 = x.env.rows('audit_log').length;
  const ok = call(x, STUDENT, 'saveInquiryProgress', id, { progress: '완료', resultLink: 'https://example.com/r', memo: MEMO });
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(Object.keys(ok.row).includes('file_id') || Object.keys(ok.row).includes('name_mismatch'), false, '학생 응답에는 원본 id·이름 다름 표시 없음');
  for (const bad of [{ progress: '끝' }, { resultLink: 'ftp://x' }, { resultLink: '주소' }, { memo: 'ㅁ'.repeat(501) }]) {
    const r = call(x, STUDENT, 'saveInquiryProgress', id, bad);
    assert.strictEqual(r.ok, false, JSON.stringify(bad));
  }
  assert.strictEqual(x.rows().find((q) => q.id === id).progress, '완료', '거부된 저장은 바꾸지 않는다');
  assert.deepStrictEqual(call(x, STUDENT, 'setInquiryShare', id, true), { ok: true, on: true });
  assert.strictEqual(x.rows().find((q) => q.id === id).show_to_parent, 'TRUE');
  assert.deepStrictEqual(call(x, STUDENT, 'setInquiryShare', id, false), { ok: true, on: false });
  const log = x.env.rows('audit_log').slice(a0);
  assert.ok(log.some((l) => l.action === 'update' && /show_to_parent/.test(JSON.stringify(l))), '공개 켜고 끈 것이 audit_log에 남는다');
  assert.ok(!log.some((l) => JSON.stringify(l).includes(MEMO)), 'audit에 메모 글 없음');
  // 남의 행
  const other = x.env.rows('students').find((s) => s.id !== x.me.id && s.email);
  if (other) {
    x.env.asOwner((c) => c.addUser(other.email, '가짜학생B', 'student'));
    assert.throws(() => x.env.call(other.email, 'saveInquiryProgress', id, { progress: '완료' }), /권한/);
    assert.throws(() => x.env.call(other.email, 'setInquiryShare', id, true), /권한/);
  }
});

test('보는 사람별 칸: 학부모는 공개한 기록의 공개 칸만(관심 표시·이름 다름·원본 id 없음), 교사는 이름 다름 표시, 원본 파일 id는 관리자만, 학생은 자기 기록 전부', () => {
  const x = makeEnv();
  upload(x, FILE, true);
  const rec = (src) => x.rows().find((q) => q.source_id === src).id;
  call(x, STUDENT, 'saveInquiryProgress', rec('rec-001'), { progress: '진행 중', resultLink: 'https://example.com/p', memo: MEMO });
  call(x, STUDENT, 'setInquiryShare', rec('rec-001'), true);
  x.env.asOwner((c) => { const u = c.readAll_('users').find((q) => q.email === HOMEROOM); c.updateRecord_('users', u.id, { homeroom_class: x.me.grade + '-' + x.me.class_no }, ADMIN); });
  const par = call(x, PARENT, 'getInquiryStudent', x.me.id);
  assert.deepStrictEqual(par.rows.map((r) => r.title), [x.rows().find((q) => q.source_id === 'rec-001').title], '공개한 기록 하나만');
  assert.deepStrictEqual(Object.keys(par.rows[0]).sort(), ['memo', 'progress', 'question', 'recordedKo', 'recorded_at', 'result_link', 'source', 'standards', 'standardsList', 'subject', 'title'].sort());
  assert.ok(!textOf(par).includes('rec-001') && !/fake-file|fake-folder/.test(textOf(par)), '학부모 응답에 원본 기록 id·파일 id 없음');
  const stu = call(x, STUDENT, 'getInquiryStudent', '');
  assert.strictEqual(stu.rows.length, 3);
  assert.ok(stu.rows.every((r) => !('file_id' in r) && !('name_mismatch' in r)), '학생에게 원본 id·이름 다름 표시 없음');
  assert.strictEqual(stu.canWrite, true);
  for (const who of [x.teacher, HOMEROOM]) {
    const t = call(x, who, 'getInquiryStudent', x.me.id);
    assert.strictEqual(t.rows.length, 3);
    assert.ok(t.rows.every((r) => r.name_mismatch === 'TRUE' && !('file_id' in r)), who + ': 이름 다름 표시는 보이고 원본 파일 id는 없다');
  }
  const adm = call(x, ADMIN, 'getInquiryStudent', x.me.id);
  assert.ok(adm.rows.every((r) => r.file_id), '원본 파일 id는 관리자만');
  // 학부모 포털: 같은 규칙으로 공개한 기록만
  const portal = call(x, PARENT, 'getPortalStudent', x.me.id);
  assert.deepStrictEqual(portal.inquiry.map((r) => r.title), [x.rows().find((q) => q.source_id === 'rec-001').title]);
  assert.ok(!('liked' in portal.inquiry[0]) && !('name_mismatch' in portal.inquiry[0]));
  // 거두면 바로 사라진다
  call(x, STUDENT, 'setInquiryShare', rec('rec-001'), false);
  assert.deepStrictEqual(call(x, PARENT, 'getInquiryStudent', x.me.id).rows, []);
  assert.deepStrictEqual(call(x, PARENT, 'getPortalStudent', x.me.id).inquiry, []);
});

test('관리자이면서 학사 교사(owner)가 담당일 때도 막히지 않고 보인다(역할이 겹치는 계정)', () => {
  const x = makeEnv();
  upload(x, FILE, true);
  const owner = x.env.owner;
  const e = x.env.rows('enrollments').find((q) => q.term_id === x.term.id && q.student_id === x.me.id);
  x.env.asOwner((c) => c.updateRecord_('enrollments', e.id, { teacher_email: owner }, ADMIN));
  const r = call(x, owner, 'getInquiryStudent', x.me.id);
  assert.strictEqual(r.rows.length, 3);
  assert.ok(r.rows.every((q) => 'title' in q && 'name_mismatch' in q));
});

test('학사를 나간 학생은 새로 올리거나 고치지 못하고 지난 기록은 계속 본다(결정 97)', () => {
  const x = makeEnv();
  upload(x, FILE, true);
  const id = x.rows()[0].id;
  x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: x.me.id, item: '학사', value: '퇴실', effective_date: TODAY, effective_date_auto: TODAY, requested_at: TODAY + 'T09:00:00',
    reason: '', doc_submitted: '', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  const up = upload(x, edit((j) => { j.records.push({ id: 'rec-009', createdAt: '2027-04-05T10:00:00Z', source: 'chatgpt', standards: ['[12수학03-01]'], subject: '수학', title: '새 기록', question: '새 질문' }); }), true);
  assert.strictEqual(up.ok, false);
  assert.ok(up.errors[0].message.includes('학사생이 아닌'), JSON.stringify(up));
  assert.strictEqual(call(x, STUDENT, 'saveInquiryProgress', id, { progress: '완료' }).ok, false);
  assert.strictEqual(call(x, STUDENT, 'setInquiryShare', id, true).ok, false);
  const view = call(x, STUDENT, 'getInquiryStudent', '');
  assert.deepStrictEqual([view.rows.length, view.canWrite], [3, false]);
});

test('원본 정리(결정 100): 퇴실 1년 뒤 학생만 대상, 관리자만 지움(Drive 휴지통), 행은 취소로 남고 file_id가 비며 audit_log에 개수만. 복학한 학생은 건드리지 않는다', () => {
  const x = makeEnv('2028-03-10T20:00:00');
  upload(x, FILE, true);
  const fileId = x.rows()[0].file_id;
  const leave = (date) => x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: x.me.id, item: '학사', value: '퇴실', effective_date: date, effective_date_auto: date, requested_at: date + 'T09:00:00',
    reason: '', doc_submitted: '', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  assert.deepStrictEqual(call(x, ADMIN, 'getInquiryCleanup'), { ok: true, students: [], totalFiles: 0, totalStudents: 0 }, '다니는 학생은 대상이 아니다');
  leave('2027-03-12');   // 1년이 안 지남(오늘 2028-03-10)
  assert.strictEqual(call(x, ADMIN, 'getInquiryCleanup').totalStudents, 0);
  x.env.asOwner((c) => { const t = c.readAll_('status_changes').find((q) => q.student_id === x.me.id && q.value === '퇴실'); c.updateRecord_('status_changes', t.id, { status: '취소' }, ADMIN); });
  leave('2027-03-09');   // 1년 + 1일 지남
  const l = call(x, ADMIN, 'getInquiryCleanup');
  assert.deepStrictEqual([l.totalStudents, l.totalFiles, l.students[0].files, l.students[0].studentId], [1, 1, 1, x.me.id]);
  assert.ok(!('recordIds' in l.students[0]), '응답에 행 id 목록은 없다');
  const a0 = x.env.rows('audit_log').length;
  const done = call(x, ADMIN, 'cleanupInquiryFiles', [x.me.id]);
  assert.deepStrictEqual([done.ok, done.deleted, done.failed, done.total], [true, 1, 0, 1]);
  assert.strictEqual(x.env.drive.files[fileId].trashed, true, 'Drive 원본은 휴지통으로');
  assert.ok(x.rows().every((q) => q.status === '취소' && q.file_id === '' && q.cancel_reason === '원본 파일 정리'), '행은 취소로 남고 file_id가 빈다');
  assert.strictEqual(x.rows().length, 3, '행은 지우지 않는다');
  const log = x.env.rows('audit_log').slice(a0);
  assert.ok(log.some((q) => q.action === 'inquiry:cleanup' && /1개 삭제/.test(JSON.stringify(q))), '지운 사실이 audit_log에');
  assert.ok(!log.some((q) => JSON.stringify(q).includes(x.me.name)), 'audit에 학생 이름 없음');
  assert.strictEqual(call(x, ADMIN, 'getInquiryCleanup').totalStudents, 0, '정리한 학생은 더 이상 대상이 아니다');
  assert.strictEqual(call(x, STUDENT, 'getInquiryStudent', '').rows.length, 0, '취소된 기록은 학생에게도 안 보인다(결정 100: 요약은 취소로 남는다)');
});

test('원본 정리: 선택하지 않은 학생·대상이 아닌 학생(복학)은 건드리지 않고, 파일이 이미 없으면 지운 것으로 보며, 지우기에 실패한 파일은 대상으로 남는다', () => {
  const x = makeEnv('2028-03-10T20:00:00');
  upload(x, FILE, true);
  const fileId = x.rows()[0].file_id;
  x.env.asOwner((c) => c.appendRecord_('status_changes', { student_id: x.me.id, item: '학사', value: '퇴실', effective_date: '2027-03-09', effective_date_auto: '2027-03-09', requested_at: '2027-03-09T09:00:00',
    reason: '', doc_submitted: '', linked_change_id: '', source: 'F6', status: '유효', memo: '', cancel_reason: '' }, ADMIN));
  // 다른 학생을 골라도 이 학생 파일은 그대로
  const none = call(x, ADMIN, 'cleanupInquiryFiles', [x.stranger.id]);
  assert.deepStrictEqual([none.deleted, none.total], [0, 0]);
  assert.strictEqual(x.env.drive.files[fileId].trashed, false);
  // 지우기 실패(공급자 오류) → 대상으로 남는다
  const failed = plain(x.env.as(ADMIN, (c) => {
    const real = c.DriveApp.getFileById;
    c.DriveApp = Object.assign({}, c.DriveApp, { getFileById: () => { throw new Error('Drive 일시 오류'); } });
    const r = c.cleanupInquiryFiles([x.me.id]);
    c.DriveApp.getFileById = real;
    return r;
  }));
  assert.deepStrictEqual([failed.deleted, failed.failed], [0, 1]);
  assert.ok(x.rows().every((q) => q.status === '유효' && q.file_id === fileId), '실패하면 행은 그대로');
  assert.strictEqual(call(x, ADMIN, 'getInquiryCleanup').totalStudents, 1);
  // 복학(퇴실 취소) 뒤에는 대상이 아니라 지워지지 않는다
  x.env.asOwner((c) => { const t = c.readAll_('status_changes').find((q) => q.student_id === x.me.id && q.value === '퇴실'); c.updateRecord_('status_changes', t.id, { status: '취소' }, ADMIN); });
  const back = call(x, ADMIN, 'cleanupInquiryFiles', [x.me.id]);
  assert.deepStrictEqual([back.deleted, back.total], [0, 0]);
  assert.strictEqual(x.env.drive.files[fileId].trashed, false, '복학한 학생의 원본은 그대로');
});

test('원본 폴더: 처음 올릴 때 비공유 폴더를 만들어 INQUIRY_FOLDER_ID에 저장하고, 공유되어 있으면 올리지 않는다(행 없음)', () => {
  const x = makeEnv();
  assert.strictEqual(x.env.asOwner((c) => c.PropertiesService.getScriptProperties().getProperty('INQUIRY_FOLDER_ID')), null);
  upload(x, FILE, true);
  const id = x.env.asOwner((c) => c.PropertiesService.getScriptProperties().getProperty('INQUIRY_FOLDER_ID'));
  assert.ok(id && x.env.drive.folders[id], '폴더가 만들어지고 속성에 저장');
  assert.strictEqual(x.env.drive.folders[id].name, '신한1학사_탐구원본');
  const y = makeEnv();
  const open = y.env.drive.addFolder('열린 폴더', { sharing: 'ANYONE_WITH_LINK' });
  y.env.asOwner((c) => c.PropertiesService.getScriptProperties().setProperty('INQUIRY_FOLDER_ID', open.getId()));
  assert.throws(() => upload(y, FILE, true), /공유되어/);
  assert.strictEqual(y.rows().length, 0, '공유된 폴더면 아무것도 쓰지 않는다');
});
