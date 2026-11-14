/** 결정 67 xlsx 작성기(printXlsx*_, 순수 함수): 이스케이프·열 문자·시트 이름·스타일·합치기·오류. 가짜 데이터만. */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');
const ctx = loadGs(['src/print/XlsxWriter.gs']);
const P = (x) => JSON.parse(JSON.stringify(x));
const files = (wb) => P(ctx.printXlsxFiles_(wb));
const one = (rows, extra) => files(Object.assign({ sheets: [Object.assign({ name: '시트', rows }, extra || {})] }));
const sheetXml = (fs, n) => fs.find((f) => f.path === 'xl/worksheets/sheet' + (n || 1) + '.xml').text;

test('열 문자 A~Z, AA, AB … 와 잘못된 번호', () => {
  const c = (i) => ctx.printXlsxCol_(i);
  assert.deepStrictEqual([c(0), c(25), c(26), c(27), c(51), c(52), c(701), c(702)], ['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  for (const bad of [-1, NaN, undefined]) assert.throws(() => c(bad), /열 번호/);
});

test('이스케이프: & < > " 와 제어 문자(탭·줄바꿈은 남김)', () => {
  const e = (s) => ctx.printXlsxEsc_(s);
  assert.strictEqual(e('a&b<c>"d"'), 'a&amp;b&lt;c&gt;&quot;d&quot;');
  assert.strictEqual(e('x\u0000y\u0008z\tq\nr'), 'xyz\tq\nr');
  assert.strictEqual(e(null), '');
});

test('시트 이름: 31자 제한, 금지 문자 치환, 빈 이름 오류', () => {
  assert.strictEqual(ctx.printXlsxSheetName_('가'.repeat(40)).length, 31);
  assert.strictEqual(ctx.printXlsxSheetName_('a[b]c:d*e?f/g\\h'), 'a b c d e f g h'.replace(/ /g, ctx.printXlsxSheetName_('[')));
  assert.throws(() => ctx.printXlsxSheetName_('   '), /비었/);
});

test('셀: 문자열은 inlineStr(앞뒤 공백 보존), 숫자는 n, null은 칸 없음, 스타일 이름은 번호로', () => {
  const x = sheetXml(one([['가 ', 7, null, { v: '큰', s: 'big' }, { v: 3.5, s: 'num' }]]));
  assert.ok(x.includes('t="inlineStr"') && x.includes('xml:space="preserve"'));
  assert.ok(/<c r="B1"[^>]*><v>7<\/v><\/c>/.test(x));
  assert.ok(!x.includes('r="C1"'));
  assert.ok(new RegExp('<c r="D1" s="' + ctx.PRINT_XLSX_STYLES.big + '"').test(x));
  assert.ok(/<c r="E1" s="4"[^>]*><v>3.5<\/v>/.test(x));
  assert.throws(() => one([[{ v: 'x', s: '없는스타일' }]]), /스타일/);
  assert.throws(() => one([[Infinity]]), /숫자/);
  assert.throws(() => one([[NaN]]), /숫자/);
});

test('행 높이·열 너비·합치기·틀 고정·가로 방향', () => {
  const x = sheetXml(one([{ h: 40, cells: ['a'] }, ['b']], { cols: [12, 30], merges: ['A1:B1'], freeze: { rows: 1, cols: 0 }, landscape: true }));
  assert.ok(/<row r="1"[^>]*ht="40"/.test(x));
  assert.ok(/<col [^>]*width="12"/.test(x) && /<col [^>]*width="30"/.test(x));
  assert.ok(x.includes('<mergeCell ref="A1:B1"/>'));
  assert.ok(x.includes('state="frozen"') && /ySplit="1"/.test(x));
  assert.ok(x.includes('orientation="landscape"'));
  for (const bad of ['A1', 'A1:', '1:2', 'a1:b2 ']) assert.throws(() => one([['a']], { merges: [bad] }), /합치는/, bad);
});

test('통합 문서: 시트 0개·9개·같은 이름(대소문자 무시) 오류, 파일 순서와 시트 번호', () => {
  assert.throws(() => files({ sheets: [] }), /1~8/);
  assert.throws(() => files({ sheets: Array.from({ length: 9 }, (_, i) => ({ name: 's' + i, rows: [] })) }), /1~8/);
  assert.throws(() => files({ sheets: [{ name: 'Ab', rows: [] }, { name: 'aB', rows: [] }] }), /같은 이름/);
  const fs = files({ sheets: [{ name: 'a', rows: [['1']] }, { name: 'b', rows: [['2']] }] });
  assert.deepStrictEqual(fs.map((f) => f.path), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  assert.ok(fs[0].text.includes('/xl/worksheets/sheet2.xml'));
});
