/** C3: 붙여넣은 명단 글(TSV/CSV) 파싱 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/features/Roster.gs']);
const parse = (t) => plain(ctx.rosterParseText_(t));

test('TSV: 탭으로 나누고 칸 앞뒤 공백을 정리한다', () => {
  const r = parse('a\t b \tc\n1\t2\t3\n');
  assert.strictEqual(r.delimiter, 'tab');
  assert.deepStrictEqual(r.rows, [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('CSV: 쉼표로 나눈다(첫 줄에 탭이 없을 때)', () => {
  const r = parse('a,b,c\r\n1,2,3');
  assert.strictEqual(r.delimiter, 'comma');
  assert.deepStrictEqual(r.rows, [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('큰따옴표: 칸 안의 쉼표·줄바꿈·""(따옴표)를 처리한다', () => {
  const r = parse('a,"b,c","d ""e"" f","g\nh"\n1,2,3,4');
  assert.deepStrictEqual(r.rows, [['a', 'b,c', 'd "e" f', 'g\nh'], ['1', '2', '3', '4']]);
  assert.deepStrictEqual(r.errors, []);
});

test('BOM·CRLF·옛 맥 줄바꿈·끝의 빈 줄·빈 칸을 처리한다', () => {
  assert.deepStrictEqual(parse('﻿a,b\r\n1,\r\n\r\n\r\n').rows, [['a', 'b'], ['1', '']]);
  assert.deepStrictEqual(parse('a,b\r1,2').rows, [['a', 'b'], ['1', '2']]);
  assert.deepStrictEqual(parse('').rows, []);
  assert.deepStrictEqual(parse(null).rows, []);
  assert.deepStrictEqual(parse('\n\n').rows, []);
});

test('닫히지 않은 따옴표는 시작한 줄 번호와 함께 오류(나쁜 입력)', () => {
  const r = parse('a,b\n1,"2\n3,4');
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].line, 2);
  assert.ok(r.errors[0].message.includes('따옴표'));
});

test('너무 긴 글·너무 많은 줄은 거부한다', () => {
  assert.strictEqual(parse('x'.repeat(ctx.ROSTER_MAX_CHARS + 1)).errors.length, 1);
  const many = Array.from({ length: ctx.ROSTER_MAX_ROWS + 1 }, (_, i) => 'a,' + i).join('\n');
  assert.ok(parse(many).errors.some((e) => e.message.includes('줄이')));
});
