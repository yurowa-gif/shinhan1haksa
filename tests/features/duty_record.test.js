/** C14 월말 근무 기록표: 2027-01 가짜 근무표(교대 3건)로 R4 gas-fakes. 합계는 실제 근무자 기준. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'test.admin@example.com', DUTY = 'test.duty@example.com', ATT = 'test.attendance@example.com', T1 = 'test.teacher@example.com',
  HOMEROOM = 'test.homeroom@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const MON = '2027-01';

function makeEnv() {
  // seedFakeStage2는 가짜 학생(seedFakeData)만 있는 DB에서만 돈다 — 미등록 학생을 더하는 env.seedFake()는 쓰지 않는다
  const env = createGasEnv({ owner: 'owner@example.com', now: '2027-01-31T21:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: T1, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT, TEST_HOMEROOM_EMAIL: HOMEROOM });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => { c.addUser(ADMIN, '시험 관리자', 'admin'); c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTY, '시험 담당자', 'duty_manager'); });
  env.asOwner((c) => c.seedFakeStage2());
  const users = env.rows('users'), nameOf = (email) => (users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || {}).name;
  const slots = env.rows('duty_slots').filter((r) => r.date.slice(0, 7) === MON);
  return { env, slots, nameOf };
}
/** 독립 계산(R8을 쓰지 않는다): 날짜마다 살아 있는 칸의 실제 근무자, 예비 지정만은 따로 */
function oracle(slots) {
  const work = {}, standby = {}, bySlot = {};
  const byDate = {};
  slots.filter((r) => r.status !== '취소').forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  Object.keys(byDate).forEach((date) => {
    const duty = new Set();
    byDate[date].filter((r) => r.slot !== '예비').forEach((r) => {
      const e = (r.actual_email || r.original_email).toLowerCase();
      duty.add(e); work[e] = (work[e] || 0) + 1; (bySlot[e] = bySlot[e] || {})[r.slot] = ((bySlot[e] || {})[r.slot] || 0) + 1;
    });
    byDate[date].filter((r) => r.slot === '예비').forEach((r) => { const e = (r.actual_email || r.original_email).toLowerCase(); if (!duty.has(e)) standby[e] = (standby[e] || 0) + 1; });
  });
  return { work, standby, bySlot };
}
const rec = (x, who, month) => plain(x.env.call(who, 'getDutyRecord', month || MON));

test('교사별 합계 = 실제 근무자(독립 계산과 일치), 교대 3건에서 원래 근무자에게는 세지 않고, 예비 지정만은 따로, 운영 안 하는 날(취소 칸)은 뺀다', () => {
  const x = makeEnv();
  const o = oracle(x.slots), r = rec(x, DUTY);
  const want = Object.keys(o.work).map((e) => [x.nameOf(e), o.work[e], o.standby[e] || 0]).sort();
  const got = r.teachers.filter((t) => t.total > 0).map((t) => [t.name, t.total, t.standby]).sort();
  assert.deepStrictEqual(got, want);
  assert.strictEqual(r.totals.total, Object.values(o.work).reduce((a, b) => a + b, 0), '합계 줄 = 교사별 합');
  assert.strictEqual(r.totals.bySlot['21:30조'] + r.totals.bySlot['23:00조'] + r.totals.bySlot['단독'], r.totals.total);
  assert.deepStrictEqual(r.swaps.map((s) => [s.date, s.kind]).sort(), [['2027-01-05', '교대'], ['2027-01-13', '교대'], ['2027-01-23', '대신 근무']]);
  assert.ok(r.closedDates.includes('2027-01-01'));
  assert.ok(x.slots.filter((s) => s.date === '2027-01-01' && s.status === '취소').length > 0, '1/1(운영 안 함)의 취소된 칸이 시트에 있다');
  // 교대로 넘긴 원래 근무자에게는 세지 않는다: 1/5 21:30조
  const sw = x.slots.find((s) => s.date === '2027-01-05' && s.slot === '21:30조');
  assert.notStrictEqual(sw.original_email, sw.actual_email);
  assert.ok(r.swaps.find((s) => s.date === '2027-01-05').to === x.nameOf(sw.actual_email) && r.swaps.find((s) => s.date === '2027-01-05').from === x.nameOf(sw.original_email));
});

test('응답에 이메일이 없고, 만든 시각과 그 달 마지막 변경 시각을 함께 준다(출력 뒤 바뀌었는지 확인용)', () => {
  const x = makeEnv();
  const r = rec(x, DUTY);
  assert.ok(!JSON.stringify(r).includes('@'));
  assert.ok(/^2027-01-31 21:00$/.test(r.generatedAt), r.generatedAt);
  const last = x.slots.map((s) => String(s.updated_at)).sort().pop();
  assert.strictEqual(r.lastChangedAt, last.replace('T', ' ').slice(0, 16));
  // 근무표를 고치면 마지막 변경 시각이 바뀐다
  x.env.setNow('2027-01-31T22:30:00');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', x.slots.find((s) => s.status === '유효').id, { memo: '수정' }, ADMIN));
  assert.strictEqual(rec(x, DUTY).lastChangedAt, '2027-01-31 22:30');
});

test('학사 교사·출결 담당은 본인 행과 본인이 낀 교대만(전체 합계·내려받기 없음), 근무표 담당자·관리자는 전체', () => {
  const x = makeEnv();
  const me = rec(x, T1);
  assert.deepStrictEqual(me.teachers.map((t) => t.name), [x.nameOf(T1)]);
  assert.ok(me.teachers[0].total > 0 && me.totals === undefined && me.canFile === false);
  assert.ok(me.swaps.every((s) => s.from === x.nameOf(T1) || s.to === x.nameOf(T1)));
  const all = rec(x, ADMIN);
  assert.ok(all.teachers.length >= 4 && all.canFile && all.swaps.length === 3);
  assert.strictEqual(rec(x, DUTY).teachers.length, all.teachers.length);
  assert.deepStrictEqual(rec(x, ATT).teachers, [], '출결 담당은 근무자가 아니라 본인 행이 없다');
  for (const who of [HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.view', 'getDutyRecord', MON);
  assert.throws(() => x.env.call(DUTY, 'getDutyRecord', '2027-13'), /yyyy-MM/);
});

/** sheetMakePdf_를 바꿔 끼워 렌더 HTML을 잡는다 */
function file(x, who, month, fmt) {
  return plain(x.env.as(who, (c) => {
    c.sheetMakePdf_ = (html) => { c.__html = html; return { getBytes: () => [1, 2, 3] }; };
    const U = c.Utilities;
    c.Utilities = { base64Encode: fmt === 'xlsx' ? U.base64Encode : () => 'AQID', formatDate: U.formatDate, newBlob: U.newBlob, zip: U.zip };
    const r = c.getDutyRecordFile(month, fmt);
    return { r, html: c.__html || '' };
  }));
}

test('getDutyRecordFile: 근무표 담당자·관리자는 PDF를 받고, 학사 교사·출결 담당은 거부 + denied:duty.record, 렌더 HTML에 교사별 합계와 교대 3건', () => {
  const x = makeEnv();
  const o = oracle(x.slots);
  for (const who of [DUTY, ADMIN]) {
    const { r, html } = file(x, who, MON, 'pdf');
    assert.deepStrictEqual([r.ok, r.name, r.base64], [true, '근무기록표_2027-01.pdf', 'AQID'], who);
    assert.ok(html.includes('교대 3건') || /교대\s*3\s*건/.test(html), '교대 3건');
    for (const e of Object.keys(o.work)) assert.ok(html.includes(x.nameOf(e)), x.nameOf(e));
    assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(html), '이메일 모양 없음');
  }
  for (const who of [T1, ATT]) x.env.expectDenied(who, 'duty.record', 'getDutyRecordFile', MON, 'pdf');
  for (const who of [HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.record', 'getDutyRecordFile', MON, 'pdf');
  for (const who of [T1, ATT, HOMEROOM, STUDENT, PARENT]) x.env.expectDenied(who, 'duty.record', 'getDutyRecordFile', MON, 'xlsx');
  assert.throws(() => file(x, DUTY, '2027-13', 'pdf'), /yyyy-MM/);
});

test('운영 안 하는 날에 근무 행이 남아 있으면 세고 경고(R8), 근무가 없는 달은 빈 목록', () => {
  const x = makeEnv();
  // 옛 상태 재현: 운영 안 하는 날(1/1)의 취소 칸을 되살린다
  const closed = x.slots.find((s) => s.date === '2027-01-01');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', closed.id, { status: '유효' }, ADMIN));
  const r = rec(x, DUTY);
  assert.ok(r.warnings.some((w) => w.includes('운영 안 하는 날')), JSON.stringify(r.warnings));
  const empty = rec(x, DUTY, '2027-05');
  assert.deepStrictEqual([empty.teachers, empty.swaps, empty.totals.total], [[], [], 0]);
});

test('users에 없는 근무자·이름이 빈 사용자는 "(등록 안 된 교사)"로 보이고 이메일은 응답·PDF HTML에 나오지 않는다', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-01-30', slot: '단독', end_time: '', original_email: 'fake.ghost@example.com', actual_email: 'fake.ghost@example.com',
    swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  const r = rec(x, DUTY);
  assert.ok(r.teachers.some((t) => t.name === '(등록 안 된 교사)'), JSON.stringify(r.teachers.map((t) => t.name)));
  assert.ok(!JSON.stringify(r).includes('ghost') && !JSON.stringify(r).includes('@'));
  const { html } = file(x, DUTY, MON, 'pdf');
  assert.ok(html.includes('(등록 안 된 교사)') && !html.includes('ghost'));
});

const rows0 = (html) => html.split('<tr').filter((t) => t.includes('scope="row"')).map((t) => text(t).split('|').filter((q) => q && !/^ style=/.test(q)));
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

test('PDF HTML: 교사별 [근무, 21:30, 23:00, 단독, 예비 지정]이 독립 계산과 같고, 교대 3건(대신 근무 포함)·마지막 변경 시각이 들어 있다', () => {
  const x = makeEnv();
  const o = oracle(x.slots), { html } = file(x, DUTY, MON, 'pdf');
  const emails = Object.keys(Object.assign({}, o.work, o.standby));
  const rows = html.split('<tr').filter((t) => t.includes('scope="row"')).map((t) => text(t).split('|').filter((q) => q && !/^ style=/.test(q))).filter((r) => r[0] !== '합계');
  assert.strictEqual(rows.length, emails.length, '교사 행: ' + JSON.stringify(rows.map((r) => r[0])));
  for (const e of emails) {
    const row = rows.find((r) => r[0] === x.nameOf(e));
    assert.ok(row, x.nameOf(e) + ' / ' + JSON.stringify(rows.map((r) => r.slice(0, 3))));
    const got = row.slice(-5).map(Number), by = o.bySlot[e] || {};
    assert.deepStrictEqual(got, [o.work[e] || 0, by['21:30조'] || 0, by['23:00조'] || 0, by['단독'] || 0, o.standby[e] || 0], x.nameOf(e));
  }
  const t = text(html);
  assert.ok(/교대 3건/.test(t) && (t.match(/대신 근무/g) || []).length >= 1, '교대 3건과 대신 근무');
  assert.ok(/2027년 1월 23일\(토\)\|단독\|[^|]+ → \|[^|]+\|대신 근무/.test(t), '1/23 대신 근무 행');
  const total = rows0(html).find((r) => r[0] === '합계');
  const sum = emails.reduce((a, e) => { const by = o.bySlot[e] || {}; return [a[0] + (o.work[e] || 0), a[1] + (by['21:30조'] || 0), a[2] + (by['23:00조'] || 0), a[3] + (by['단독'] || 0), a[4] + (o.standby[e] || 0)]; }, [0, 0, 0, 0, 0]);
  assert.deepStrictEqual(total && total.slice(-6, -1).map(Number), sum, '합계 줄 = 교사별 합');
  // 마지막 변경 시각은 만든 시각과 다른 값으로 확인한다
  x.env.setNow('2027-01-31T21:40:00');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', x.slots.find((q) => q.status === '유효').id, { memo: '수정' }, ADMIN));
  x.env.setNow('2027-01-31T23:10:00');
  const h2 = text(file(x, DUTY, MON, 'pdf').html);
  assert.ok(h2.includes('2027-01-31 21:40') && h2.includes('2027-01-31 23:10'), '마지막 변경(21:40)과 만든 시각(23:10)이 둘 다, 서로 다르게: ' + h2.slice(-400));
});

test('운영 안 한 1/1에 근무 행을 되살리면 경고가 PDF에 한 번만, 예비만 있는 운영 안 한 날도 경고가 남는다(조용히 세지 않는다)', () => {
  const x = makeEnv();
  const closed = x.slots.find((s) => s.date === '2027-01-01' && s.slot !== '예비');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', closed.id, { status: '유효' }, ADMIN));
  const n = (h) => (text(h).match(/근무가 기록되어 있습니다|근무 행을 셌습니다/g) || []).length;   // 렌더러 문구 + R8 문구(범례의 '운영 안 하는 날입니다'는 세지 않는다)
  assert.strictEqual(n(file(x, DUTY, MON, 'pdf').html), 1, '근무 행 + 칸 표시 중복 없이 한 번');
  const y = makeEnv();
  y.env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-01-01', slot: '예비', end_time: '', original_email: T1, actual_email: T1, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  const f = file(y, DUTY, MON, 'pdf');
  assert.ok(n(f.html) >= 1, '예비만 있는 날 경고가 PDF에: ' + text(f.html).slice(-300));
  assert.ok(f.r.warnings.some((w) => w.includes('운영 안 하는 날')) && f.r.warnings.every((w) => !/\d{4}-\d{2}-\d{2}/.test(w)), JSON.stringify(f.r.warnings));
  assert.ok(rec(y, DUTY).warnings.every((w) => !/\d{4}-\d{2}-\d{2}/.test(w)), '화면 경고에도 숫자 날짜 없음');
});

test('미등록 근무자가 여럿이면 번호로 구분하고, 이름이 빈 등록 사용자는 "(이름 없는 교사)", 경고 한 줄. 마지막 변경은 그 달 것만(다른 달 수정·취소 칸 반영)', () => {
  const x = makeEnv();
  const slot = (date, email) => x.env.asOwner((c) => c.appendRecord_('duty_slots', { date, slot: '단독', end_time: '', original_email: email, actual_email: email, swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  slot('2027-01-29', 'fake.ghost1@example.com'); slot('2027-01-30', 'fake.ghost2@example.com');
  x.env.asOwner((c) => c.updateRecord_('users', x.env.rows('users').find((u) => u.email === T1).id, { name: '' }, ADMIN));
  const r = rec(x, DUTY);
  const names = r.teachers.map((t) => t.name);
  assert.ok(names.includes('(등록 안 된 교사 1)') && names.includes('(등록 안 된 교사 2)') && names.includes('(이름 없는 교사)'), JSON.stringify(names));
  assert.strictEqual(r.warnings.filter((w) => w.includes('이름이 비어')).length, 1);
  assert.ok(!JSON.stringify(r).includes('ghost') && !JSON.stringify(r).includes('@'));
  // 다른 달 수정은 이 달 lastChangedAt을 바꾸지 않고, 취소 칸의 수정은 반영된다
  const before = r.lastChangedAt;
  x.env.setNow('2027-02-01T09:00:00');
  slot('2027-02-10', T1);
  assert.strictEqual(rec(x, DUTY).lastChangedAt, before, '2월 행은 1월 기록에 영향 없음');
  x.env.setNow('2027-02-01T10:00:00');
  const cancelled = x.slots.find((s) => s.status === '취소');
  x.env.asOwner((c) => c.updateRecord_('duty_slots', cancelled.id, { memo: '취소 칸 수정' }, ADMIN));
  assert.strictEqual(rec(x, DUTY).lastChangedAt, '2027-02-01 10:00', '취소된 칸의 수정도 마지막 변경');
});

test('getDutyRecordFile 형식 인자: 대소문자·공백은 받고, 배열·숫자·모르는 형식은 입력 오류 문구, 경고는 PDF 모델과 같다', () => {
  const x = makeEnv();
  for (const f of ['PDF', ' pdf ', undefined, '']) assert.strictEqual(file(x, DUTY, MON, f).r.ok, true, String(f));
  for (const f of [['pdf'], 5, 'docx', 'csv']) assert.strictEqual(file(x, DUTY, MON, f).r.ok, false, JSON.stringify(f));
});

test('본인 행만 보는 학사 교사에게는 근무표 경고를 주지 않는다(손쓸 수 없다), 담당자·관리자에게는 준다', () => {
  const x = makeEnv();
  x.env.asOwner((c) => c.appendRecord_('duty_slots', { date: '2027-01-30', slot: '단독', end_time: '', original_email: 'fake.ghost@example.com', actual_email: 'fake.ghost@example.com', swapped_at: '', swapped_by: '', status: '유효', memo: '' }, ADMIN));
  assert.deepStrictEqual(rec(x, T1).warnings, []);
  assert.ok(rec(x, DUTY).warnings.length >= 1);
});

/* ───── 엑셀(xlsx, 결정 67) ───── */
const { unzipStored } = require('../helpers/zip');
function xlsxOf(x, who, month) {
  const r = file(x, who, month || MON, 'xlsx').r;
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const zip = unzipStored(Buffer.from(r.base64, 'base64'));
  return { r, zip, text: (n) => zip[n].toString('utf8') };
}
const strip = (xml) => xml.replace(/<[^>]+>/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('xlsx: 근무표 담당자·관리자는 엑셀 통합 문서(시트 2개)를 받고, 부품 파일이 모두 있고 XML이 닫혀 있다', () => {
  const x = makeEnv();
  for (const who of [DUTY, ADMIN]) {
    const { r, zip, text } = xlsxOf(x, who);
    assert.deepStrictEqual([r.name, r.mime, r.bytes > 500], ['근무기록표_2027-01.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true]);
    assert.deepStrictEqual(zip._order, ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    assert.ok(text('xl/workbook.xml').includes('name="월별 근무표"') && text('xl/workbook.xml').includes('name="합계·교대"'));
    for (const n of zip._order) {
      const t = text(n);
      assert.ok(t.startsWith('<?xml'), n);
      const stack = [];
      for (const m of t.replace(/<\?[^>]*\?>/g, '').matchAll(/<(\/?)([A-Za-z][\w:]*)[^>]*?(\/?)>/g)) {
        if (m[3]) continue;
        if (m[1]) assert.strictEqual(stack.pop(), m[2], n + ' 태그 짝'); else stack.push(m[2]);
      }
      assert.deepStrictEqual(stack, [], n + ' 닫히지 않은 태그');
    }
  }
});

test('xlsx 시트2 합계 = 독립 계산(oracle)·PDF 모델 합계, 교대 3건 목록, 이메일·학생 이름 없음', () => {
  const x = makeEnv();
  const { text } = xlsxOf(x, DUTY);
  const t1 = strip(text('xl/worksheets/sheet1.xml')), t2 = strip(text('xl/worksheets/sheet2.xml'));
  const o = oracle(x.slots), m = rec(x, DUTY);
  for (const e of Object.keys(o.work)) assert.ok(t2.includes(x.nameOf(e)), x.nameOf(e));
  m.teachers.forEach((t) => {
    // 이름 다음 칸이 합계
    const cells = t2.split('\n').map((c) => c.trim()).filter(Boolean), i = cells.indexOf(t.name);
    assert.ok(i >= 0, t.name);
    assert.strictEqual(cells[i + 1], String(t.total), t.name + ' 합계');
  });
  assert.ok(/교대/.test(t2));
  for (const s of m.swaps) { assert.ok(t2.includes(s.from) && t2.includes(s.to)); }
  assert.ok(t1.includes('=>'), '시트1 교대는 원래=>바뀐');
  for (const t of [t1, t2]) assert.ok(!/@[a-z0-9-]+\.[a-z]/i.test(t), '이메일 모양 없음');
  const students = env => env.rows('students').map((s) => s.name).filter(Boolean);
  for (const n of students(x.env)) assert.ok(!t1.includes(n) && !t2.includes(n), '학생 이름 없음');
});

test('xlsx: 근무 없는 달은 빈 달력 + 빈 합계로도 열린다', () => {
  const x = makeEnv();
  const { zip } = xlsxOf(x, DUTY, '2027-05');
  assert.strictEqual(zip._order.length, 7);
});
