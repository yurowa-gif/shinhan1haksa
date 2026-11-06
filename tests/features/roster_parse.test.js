/** C3 1차: 붙여넣은 명단 글(TSV/CSV) 파싱·모양 검사와 권한 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/features/Roster.gs']);
const parse = (t) => plain(ctx.rosterParseText_(t));
const HEAD = ctx.ROSTER_COLUMNS.join('\t');
const rowOf = (n) => ['10' + n, '1', '1', String(n), '가학생' + n, '여', '', 'O', 'O', 'O', 'O', '학사', '일반', 't@example.com', 's' + n + '@example.com', ''];

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

test('모양 검사: 머리글 있음·열 15~16개면 통과, 데이터 줄 수를 센다', () => {
  const text = [HEAD, rowOf(1).join('\t'), rowOf(2).slice(0, 15).join('\t')].join('\n');
  const s = plain(ctx.rosterCheckShape_(ctx.rosterParseText_(text)));
  assert.strictEqual(s.hasHeader, true);
  assert.strictEqual(s.headerOk, true);
  assert.strictEqual(s.data.length, 2);
  assert.deepStrictEqual(s.errors, []);
});

test('모양 검사: 머리글이 없어도 통과하고, 칸 수가 틀린 줄은 줄 번호로 알려 준다', () => {
  const bad = rowOf(2).slice(0, 10).join('\t');
  const text = [rowOf(1).join('\t'), bad].join('\n');
  const s = plain(ctx.rosterCheckShape_(ctx.rosterParseText_(text)));
  assert.strictEqual(s.hasHeader, false);
  assert.strictEqual(s.errors.length, 1);
  assert.strictEqual(s.errors[0].line, 2);
  assert.ok(s.errors[0].message.includes('10개'));
  // 머리글이 있으면 첫 데이터 줄이 2번째 줄
  const withHead = plain(ctx.rosterCheckShape_(ctx.rosterParseText_([HEAD, bad].join('\n'))));
  assert.strictEqual(withHead.errors[0].line, 2);
});

test('모양 검사: 머리글 순서가 다르면 오류, 빈 입력은 오류, 17칸도 오류', () => {
  const swapped = ctx.ROSTER_COLUMNS.slice(); [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  const s1 = plain(ctx.rosterCheckShape_(ctx.rosterParseText_([swapped.join('\t'), rowOf(1).join('\t')].join('\n'))));
  assert.strictEqual(s1.headerOk, false);
  assert.strictEqual(s1.errors[0].line, 1);
  assert.strictEqual(plain(ctx.rosterCheckShape_(ctx.rosterParseText_('   '))).errors.length, 1);
  const s17 = plain(ctx.rosterCheckShape_(ctx.rosterParseText_(rowOf(1).concat(['x']).join('\t'))));
  assert.strictEqual(s17.errors.length, 1);
});

test('끝의 빈 칸(탭 여러 개)은 칸 수에서 뺀다', () => {
  const s = plain(ctx.rosterCheckShape_(ctx.rosterParseText_(rowOf(1).join('\t') + '\t\t\t')));
  assert.deepStrictEqual(s.errors, []);
});

/* ───── 권한 ───── */

function server(email, roles) {
  const denied = [];
  const users = [{ id: 'u', email, active: 'TRUE', roles: roles.join(','), name: '가짜', homeroom_class: '' }];
  const c = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/features/Roster.gs'], {
    Session: { getActiveUser: () => ({ getEmail: () => email }) },
    readAll_: (n) => (n === 'users' ? users : []), findById_: () => null, today_: () => '2027-03-03',
    logDenied_: (who, action) => denied.push(action)
  });
  return { c, denied };
}

test('previewRoster: 관리자만. 다른 역할은 거부하고 denied:roster.edit 기록', () => {
  for (const roles of [['hall_teacher'], ['attendance'], ['homeroom'], ['duty_manager'], ['student'], ['parent']]) {
    const s = server('x@example.com', roles);
    assert.throws(() => s.c.previewRoster(HEAD), /권한이 없습니다/, roles.join());
    assert.deepStrictEqual(s.denied, ['roster.edit']);
  }
  const ok = plain(server('a@example.com', ['admin']).c.previewRoster([HEAD, rowOf(1).join('\t')].join('\n')));
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.rowCount, 1);
  assert.strictEqual(ok.delimiter, 'tab');
});

test('previewRoster 응답에는 명단 내용(이름·이메일)이 들어 있지 않다', () => {
  const r = JSON.stringify(plain(server('a@example.com', ['admin']).c.previewRoster([HEAD, rowOf(1).join('\t')].join('\n'))));
  assert.ok(!r.includes('가학생') && !r.includes('example.com'));
});

test('화면 라우팅: roster 화면은 관리자만', () => {
  const r = loadGs(['src/Schema.gs', 'src/Auth.gs', 'src/Code.gs']);
  assert.strictEqual(plain(r.screenResolve_('roster', ['admin'])).ok, true);
  assert.strictEqual(plain(r.screenResolve_('roster', ['hall_teacher'])).ok, false);
});
