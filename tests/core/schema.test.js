/** 시트 구조(src/Schema.gs) */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs']);

test('모든 탭: 첫 열 id, 끝 4열 공통, 중복 열 없음', () => {
  for (const kind of Object.keys(ctx.SCHEMA)) {
    for (const sheet of Object.keys(ctx.SCHEMA[kind])) {
      const h = ctx.headersFor_(kind, sheet);
      assert.strictEqual(h[0], 'id', sheet);
      assert.deepStrictEqual(Array.from(h.slice(-4)), ['created_at', 'created_by', 'updated_at', 'updated_by'], sheet);
      assert.strictEqual(new Set(h).size, h.length, sheet + ' 중복 열');
    }
  }
});

test('0단계 탭이 모두 있다', () => {
  for (const t of ['users', 'terms', 'students', 'enrollments', 'guardian_links', 'audit_log']) {
    assert.ok(ctx.SCHEMA.db[t], t);
  }
  assert.ok(ctx.SCHEMA.counsel.counsel_notes);
  assert.ok(ctx.SCHEMA.config.settings);
});
