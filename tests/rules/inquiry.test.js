/** R26 탐구 기록(F16, 결정 93·100): 탐구발견 가짜 기록 파일(tests/fixtures/discovery, 가짜 학생)로 읽기·합치기·진행·정리 대상. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, loadGs, plain, ROOT } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/Stage6Rules.gs', 'src/rules/InquiryRules.gs']);
const FILE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/discovery/fake-export.json'), 'utf8');
const parse = (text, opts) => plain(ctx.inquiryParse_(text, Object.assign({ accountName: '가짜학생01' }, opts || {})));
const edit = (fn) => { const j = JSON.parse(FILE); fn(j); return JSON.stringify(j); };

test('inquiryParse_: 가짜 기록 파일 — 요약 3건, 시각은 KST, 같은 id는 반응 이벤트만 합침(마지막 like), 출처 이름', () => {
  const p = parse(FILE);
  assert.deepStrictEqual([p.errors, p.warnings, p.nameMismatch], [[], [], false]);
  assert.deepStrictEqual(p.meta, { app: 'shinhan-discovery', schema: 1, exportedAt: '2027-04-02T20:30:00', fileName: '가짜학생01', fileClass: '2-3' });
  assert.deepStrictEqual(p.records.map((r) => [r.sourceId, r.recordedAt, r.source, r.standards, r.liked]), [
    ['rec-001', '2027-03-30T21:00:00', 'ChatGPT', ['[12물리01-02]', '[12정보02-01]'], true],
    ['rec-002', '2027-03-31T20:10:00', '연결 예시', ['[12생명01-03]', '[12화학02-01]'], false],
    ['rec-003', '2027-04-01T09:00:00', '기본 추천', ['[12수학03-01]'], true]]);
  const order = parse(edit((j) => { j.records[1].events = [{ type: 'like', at: '2027-04-01T09:00:00' }, { type: 'unlike', at: '2027-04-01T10:00:00' }, { type: 'like', at: '2027-03-31T09:00:00' }]; }));
  assert.strictEqual(order.records[1].liked, false, '파일 순서가 아니라 시각 순으로 마지막 반응');
  assert.deepStrictEqual(Object.keys(p.records[0]).sort(), ['liked', 'question', 'recordedAt', 'source', 'sourceId', 'standards', 'subject', 'title']);
});

test('inquiryParse_ 거부: 크기·건수·JSON 아님·다른 앱·다른 schema·같은 id 본문 다름·id 없음·시각 틀림', () => {
  const T = [
    [FILE, { maxBytes: 100 }, /100B|MB보다 큽니다/],
    [FILE, { maxRecords: 3 }, /3건보다 많습니다\(4건\)/],
    ['{not json', {}, /기록 파일을 읽을 수 없습니다/], ['[]', {}, /읽을 수 없습니다/], ['', {}, /읽을 수 없습니다/],
    [edit((j) => { j.app = 'other'; }), {}, /탐구발견 기록 파일이 아닙니다/],
    [edit((j) => { j.schema = 2; }), {}, /탐구발견 기록 파일이 아닙니다/],
    [edit((j) => { j.records[2].title = '다른 제목'; }), {}, /같은 기록\(rec-001\)이 파일 안에 내용이 다르게 두 번/],
    [edit((j) => { j.records[1].id = ''; }), {}, /2번째 기록에 id가 없습니다/],
    [edit((j) => { j.records[1].createdAt = '어제'; }), {}, /2번째 기록의 시각을 읽을 수 없습니다/],
  ];
  T.forEach(([text, o, re], k) => { const p = parse(text, o); assert.deepStrictEqual([p.records, p.meta], [[], null], k); assert.ok(p.errors.some((e) => re.test(e)), k + ' ' + p.errors); });
  assert.strictEqual(ctx.inqBytes_('가a😀'), 3 + 1 + 4);
  assert.deepStrictEqual(parse(FILE, { maxBytes: 12 * 1024 * 1024 }).errors, []);
});

test('inquiryParse_ 경고: 파일 속 이름이 다르면 받되 경고·nameMismatch(결정 93), 출처를 모르면 기본 추천 + 경고', () => {
  const p = parse(FILE, { accountName: '가짜학생02' });
  assert.deepStrictEqual([p.errors, p.records.length, p.nameMismatch], [[], 3, true]);
  assert.deepStrictEqual(p.warnings, ['파일 속 이름이 다릅니다. 내 기록이 맞나요? 맞으면 그대로 올려 주세요.']);
  assert.strictEqual(parse(FILE, { accountName: ' 가짜 학생01 ' }).nameMismatch, false, '띄어쓰기만 다르면 같은 이름');
  assert.strictEqual(parse(FILE, { accountName: '' }).nameMismatch, false);
  const u = parse(edit((j) => { j.records[1].source = 'gemini'; }));
  assert.deepStrictEqual([u.records[1].source, u.warnings], ['기본 추천', ['출처를 알 수 없는 기록 1건은 기본 추천으로 표시합니다.']]);
});

/** 합치기 계획을 시트에 쓴 것처럼 */
function apply(rows, plan) {
  const upd = new Map(plan.toUpdate.map((u) => [u.id, u.patch]));
  return rows.map((r) => upd.has(r.id) ? Object.assign({}, r, upd.get(r.id)) : r).concat(plan.toAppend.map((r, k) => Object.assign({ id: 'q' + (rows.length + k) }, r)));
}

test('inquiryMergePlan_: 새 기록은 진행 관심·기본 비공개, 같은 파일 두 번 = 0건(F16 완료 기준), 관심 표시만 바뀌면 그 칸만, 본문 다르면 충돌', () => {
  const first = plain(ctx.inquiryMergePlan_([], parse(FILE), 's1', 'file-A'));
  assert.deepStrictEqual([first.toAppend.length, first.toUpdate, first.same, first.conflicts], [3, [], 0, []]);
  assert.deepStrictEqual(first.toAppend[0], { student_id: 's1', source_id: 'rec-001', recorded_at: '2027-03-30T21:00:00', source: 'ChatGPT', standards: '[12물리01-02];[12정보02-01]',
    subject: '물리학', title: '가짜 주제: 자습실 소음과 집중 시간', question: '가짜 질문: 소음이 줄면 집중 시간이 늘까?', liked: 'TRUE', progress: '관심', result_link: '', memo: '',
    file_id: 'file-A', name_mismatch: 'FALSE', parent_public: 'FALSE', status: '유효' });
  let rows = apply([], first);
  rows = rows.map((r) => r.source_id === 'rec-002' ? Object.assign({}, r, { progress: '진행 중', memo: '가짜 메모', parent_public: 'TRUE' }) : r);   // 학생이 덧붙임
  const again = plain(ctx.inquiryMergePlan_(rows, parse(FILE), 's1', 'file-B'));
  assert.deepStrictEqual(again, { toAppend: [], toUpdate: [], same: 3, conflicts: [] }, '같은 파일 두 번 = 0건');
  const liked = plain(ctx.inquiryMergePlan_(rows, parse(edit((j) => { j.records[1].events = [{ type: 'like', at: '2027-04-01T00:00:00Z' }]; })), 's1', 'file-C'));
  assert.deepStrictEqual([liked.toAppend, liked.toUpdate, liked.same], [[], [{ id: 'q1', patch: { liked: 'TRUE' } }], 2], '덧붙인 진행·메모·공개는 그대로');
  const changed = plain(ctx.inquiryMergePlan_(rows, parse(edit((j) => { j.records[3].question = '바뀐 질문'; j.records.push({ id: 'rec-004', createdAt: '2027-04-02T10:00:00', source: 'default', title: '새 주제' }); })), 's1', 'file-D'));
  assert.deepStrictEqual([changed.toAppend.map((r) => r.source_id), changed.conflicts], [['rec-004'], [{ sourceId: 'rec-003', why: '이미 받은 기록과 내용이 다릅니다. 기존 기록은 그대로 둡니다.' }]]);
  const other = plain(ctx.inquiryMergePlan_(rows, parse(FILE), 's2', 'file-E'));
  assert.strictEqual(other.toAppend.length, 3, '다른 학생 계정이면 그 학생의 새 기록(신원은 로그인 계정)');
  const cancelled = rows.map((r) => Object.assign({}, r, { status: '취소' }));
  assert.strictEqual(plain(ctx.inquiryMergePlan_(cancelled, parse(FILE), 's1', 'f')).toAppend.length, 3, '취소된 행은 없는 것으로');
  assert.strictEqual(plain(ctx.inquiryMergePlan_([], parse(FILE, { accountName: '가짜학생02' }), 's1', 'f')).toAppend[0].name_mismatch, 'TRUE');
  assert.throws(() => ctx.inquiryMergePlan_([], parse('{'), 's1', 'f'), /오류가 있는 결과/);
  assert.throws(() => ctx.inquiryMergePlan_([], parse(FILE), '', 'f'), /studentId/);
});

test('inquiryProgressCheck_: 진행 상태 3가지, 링크는 http(s)만·500자, 메모 500자, 적지 않은 칸은 patch에 없음', () => {
  assert.deepStrictEqual(plain(ctx.inquiryProgressCheck_({ progress: '진행 중', resultLink: ' https://example.com/a ', memo: ' 가짜 ' })),
    { patch: { progress: '진행 중', result_link: 'https://example.com/a', memo: '가짜' }, errors: [] });
  assert.deepStrictEqual(plain(ctx.inquiryProgressCheck_({ memo: '' })), { patch: { memo: '' }, errors: [] });
  assert.deepStrictEqual(plain(ctx.inquiryProgressCheck_({ resultLink: '' })).patch, { result_link: '' });
  const T = [[{ progress: '끝' }, /관심·진행 중·완료 중에서/], [{ resultLink: 'javascript:alert(1)' }, /http:\/\/ 나 https:\/\//], [{ resultLink: 'ftp://x' }, /https/],
    [{ resultLink: 'https://a b' }, /https/], [{ resultLink: 'https://' + 'a'.repeat(500) }, /500자까지/], [{ memo: 'x'.repeat(501) }, /지금 501자/]];
  T.forEach(([i, re], k) => { const r = plain(ctx.inquiryProgressCheck_(i)); assert.strictEqual(r.patch, null, k); assert.match(r.errors[0], re, k); });
});

test('inquiryCleanupTargets_: 퇴실(졸업) 뒤 1년 지난 원본 파일만(결정 100), 임시 퇴실·재학·파일 없음·취소 제외, 2월 29일', () => {
  const CH = (sid, value, eff, extra) => Object.assign({ id: sid + value + eff, student_id: sid, item: '학사', value, effective_date: eff, requested_at: eff + 'T09:00:00', status: '유효', created_at: '' }, extra || {});
  const changes = [CH('g', '입실', '2025-03-02'), CH('g', '퇴실', '2027-02-14', { source: 'F6', memo: '[일괄] B1' }), CH('t', '입실', '2025-03-02'),
    CH('t', '퇴실', '2026-01-10', { reason: '임시 퇴실', memo: '[임시] return:2026-02-01' }), CH('k', '입실', '2025-03-02'), CH('y', '입실', '2023-03-02'), CH('y', '퇴실', '2024-02-29')];
  const rec = (id, sid, extra) => Object.assign({ id, student_id: sid, file_id: 'f-' + id, status: '유효' }, extra || {});
  const records = [rec('r1', 'g'), rec('r2', 'g'), rec('r3', 't'), rec('r4', 'k'), rec('r5', 'g', { file_id: '' }), rec('r6', 'g', { status: '취소' }), rec('r7', 'y'), rec('r8', 'nobody')];
  assert.deepStrictEqual(plain(ctx.inquiryCleanupTargets_(records, changes, '2028-02-14')), [
    { id: 'r7', studentId: 'y', fileId: 'f-r7', leaveDate: '2024-02-29', since: '2025-03-01' },
    { id: 'r1', studentId: 'g', fileId: 'f-r1', leaveDate: '2027-02-14', since: '2028-02-14' },
    { id: 'r2', studentId: 'g', fileId: 'f-r2', leaveDate: '2027-02-14', since: '2028-02-14' }]);
  assert.deepStrictEqual(plain(ctx.inquiryCleanupTargets_(records, changes, '2028-02-13')).map((x) => x.id), ['r7'], '1년 하루 전');
  assert.deepStrictEqual(plain(ctx.inquiryCleanupTargets_(records, changes, '2028-02-13', { years: 0 })).map((x) => x.id), ['r7', 'r1', 'r2']);
  assert.throws(() => ctx.inquiryCleanupTargets_(records, changes, '2028-2-1'), /today/);
});
