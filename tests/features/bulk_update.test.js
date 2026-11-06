/** Db.gs bulkUpdateRecords_ — 가짜 시트(메모리)로 한 번 읽고 한 번 쓰는지, 감사 로그가 일괄 1줄인지 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

function makeSheets(headersByName) {
  const sheets = {};
  const reads = { getValues: 0, setValues: 0 };
  for (const [name, headers] of Object.entries(headersByName)) {
    const data = [headers.slice()];
    sheets[name] = {
      data,
      getLastRow: () => data.length, getLastColumn: () => headers.length, getMaxRows: () => 1000, insertRowsAfter() {},
      getDataRange: () => ({ getValues: () => { reads.getValues++; return data.map((r) => r.slice()); } }),
      getRange: (r, c, nr, nc) => ({
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) out.push((data[r - 1 + i] || []).slice(c - 1, c - 1 + nc)); return out; },
        setValues: (v) => { reads.setValues++; v.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; }); }); },
        setNumberFormat() {}
      })
    };
  }
  return { sheets, reads };
}

function setup() {
  const ctx0 = loadGs(['src/Schema.gs']);
  const H = (n) => plain(ctx0.headersFor_('db', n));
  const { sheets, reads } = makeSheets({ students: H('students'), audit_log: H('audit_log') });
  let t = 0;
  const c = loadGs(['src/Schema.gs', 'src/Db.gs'], {
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => 'id-' + (++t), formatDate: () => '2027-03-03T10:00:0' + (t % 10) }
  });
  c.getSheet_ = (kind, name) => sheets[name];   // Db.gs의 진짜 getSheet_(Properties·Spreadsheet)를 메모리 시트로 바꾼다
  const add = (id, name, grade) => c.appendRecord_('students', { id, student_no: '1' + id, name, grade, class_no: '1', number: '1', gender: '여' }, 'seed@example.com', 'db', { skipAudit: true });
  return { c, sheets, reads, add };
}
const col = (s, name, h) => s.sheets.students.data.slice(1).map((r) => r[h.indexOf(name)]);

test('바뀐 칸만 고치고, updated_at·updated_by를 갱신하고, created_*는 그대로 둔다', () => {
  const s = setup();
  s.add('a', '가', '1'); s.add('b', '나', '1'); s.add('c', '다', '1');
  const h = s.sheets.students.data[0];
  const created = col(s, 'created_at', h).slice();
  const n = s.c.bulkUpdateRecords_('students', [{ id: 'a', patch: { grade: '2' } }, { id: 'c', patch: { grade: '2', name: '다다', created_at: 'HACK', id: 'zzz' } }], 'admin@example.com');
  assert.strictEqual(n, 2);
  assert.deepStrictEqual(col(s, 'grade', h), ['2', '1', '2']);
  assert.deepStrictEqual(col(s, 'name', h), ['가', '나', '다다']);
  assert.deepStrictEqual(col(s, 'created_at', h), created, 'created_* 불변');
  assert.deepStrictEqual(col(s, 'id', h), ['a', 'b', 'c'], 'id 불변');
  assert.deepStrictEqual(col(s, 'updated_by', h), ['admin@example.com', 'seed@example.com', 'admin@example.com']);
});

test('한 번 읽고 한 번 쓴다(행마다 읽지 않는다)', () => {
  const s = setup();
  for (let i = 0; i < 40; i++) s.add('r' + i, '이름' + i, '1');
  const before = { g: s.reads.getValues, s: s.reads.setValues };
  s.c.bulkUpdateRecords_('students', Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i, patch: { grade: '3' } })), 'a@example.com');
  assert.ok(s.reads.getValues - before.g <= 2, '시트 읽기 횟수: ' + (s.reads.getValues - before.g));
  assert.strictEqual(s.reads.setValues - before.s, 2, '학생 한 번 + 감사 로그 한 줄');
});

test('감사 로그: 바뀐 칸의 이전·이후 값을 행 id별로 남긴다(바뀌지 않은 칸은 없음)', () => {
  const s = setup();
  s.add('a', '가학생', '1'); s.add('b', '나학생', '1');
  s.c.bulkUpdateRecords_('students', [{ id: 'a', patch: { name: '새이름', grade: '2', class_no: '1' } }, { id: 'b', patch: { grade: '2' } }], 'admin@example.com');
  const log = s.sheets.audit_log.data.slice(1);
  assert.strictEqual(log.length, 1, '한 덩어리면 한 줄');
  const hh = s.sheets.audit_log.data[0];
  const row = Object.fromEntries(hh.map((k, i) => [k, log[0][i]]));
  assert.strictEqual(row.action, 'bulk_update');
  assert.deepStrictEqual(JSON.parse(row.before), { a: { name: '가학생', grade: '1' }, b: { grade: '1' } });
  assert.deepStrictEqual(JSON.parse(row.after), { a: { name: '새이름', grade: '2' }, b: { grade: '2' } });
  assert.ok(row.detail.includes('2행'));
});

test('감사 기록이 크면 칸 한도(5만 자)를 넘지 않게 여러 줄로 나눠 쓰고, 모든 행이 한 번씩만 들어간다', () => {
  const s = setup();
  const N = 120, long = 'ㄱ'.repeat(600);
  for (let i = 0; i < N; i++) s.add('r' + i, '이름' + i, '1');
  s.c.bulkUpdateRecords_('students', Array.from({ length: N }, (_, i) => ({ id: 'r' + i, patch: { name: long + i } })), 'a@example.com');
  const hh = s.sheets.audit_log.data[0];
  const rows = s.sheets.audit_log.data.slice(1).map((r) => Object.fromEntries(hh.map((k, i) => [k, r[i]])));
  assert.ok(rows.length > 1, '여러 줄: ' + rows.length);
  const ids = [];
  for (const r of rows) {
    assert.ok(r.before.length < 50000 && r.after.length < 50000, '칸 한도');
    ids.push(...Object.keys(JSON.parse(r.after)));
    assert.ok(r.detail.includes('(' + (rows.indexOf(r) + 1) + '/' + rows.length + ')'));
  }
  assert.strictEqual(ids.length, N); assert.strictEqual(new Set(ids).size, N);
});

test('바뀐 것이 없으면 0을 돌려주고 쓰지도 감사 로그를 남기지도 않는다', () => {
  const s = setup();
  s.add('a', '가', '1');
  const w = s.reads.setValues;
  assert.strictEqual(s.c.bulkUpdateRecords_('students', [{ id: 'a', patch: { grade: '1' } }], 'x@example.com'), 0);
  assert.strictEqual(s.c.bulkUpdateRecords_('students', [], 'x@example.com'), 0);
  assert.strictEqual(s.reads.setValues, w);
  assert.strictEqual(s.sheets.audit_log.data.length, 1);
});

test('없는 id·없는 열은 아무것도 쓰기 전에 오류(나쁜 입력)', () => {
  const s = setup();
  s.add('a', '가', '1'); s.add('b', '나', '1');
  const snap = JSON.stringify(s.sheets.students.data);
  assert.throws(() => s.c.bulkUpdateRecords_('students', [{ id: 'a', patch: { grade: '2' } }, { id: 'nope', patch: { grade: '2' } }], 'x@example.com'), /찾을 수 없습니다/);
  assert.throws(() => s.c.bulkUpdateRecords_('students', [{ id: 'a', patch: { 없는열: '2' } }], 'x@example.com'), /없는 열/);
  assert.strictEqual(JSON.stringify(s.sheets.students.data), snap, '실패하면 시트가 그대로');
});
