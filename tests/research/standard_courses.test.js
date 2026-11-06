/** RS2 표준 과목명 목록(2022 개정 교육과정) 형식 검사. */
const assert = require('assert');
const { test } = require('../helpers/harness');
const { parseCsv, readCsv } = require('./csv');

const FILE = 'data/course_recommendations/standard_courses_2022.csv';
const HEADER = ['subject_group', 'course_type', 'course', 'source_title', 'source_url', 'verified'];
const TYPES = ['공통', '일반 선택', '진로 선택', '융합 선택'];
const VERIFIED = ['확인', '미확인'];

test('csv 도구: 따옴표·쉼표·줄바꿈', () => {
  assert.deepStrictEqual(parseCsv('a,"b,c","d""e"\n1,2,3\n'), [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  assert.throws(() => parseCsv('﻿a,b\n'), /BOM/);
});

const { header, records } = readCsv(FILE);

test('표준 과목: 헤더가 정확히 일치', () => {
  assert.deepStrictEqual(header, HEADER);
});

test('표준 과목: 빈 칸 없음, 앞뒤 공백 없음', () => {
  for (const r of records) {
    for (const h of HEADER) {
      assert.ok(r[h] !== '', r._line + '번째 줄 ' + h + ' 빈칸');
      assert.strictEqual(r[h], r[h].trim(), r._line + '번째 줄 ' + h + ' 앞뒤 공백');
    }
  }
});

test('표준 과목: 과목명 중복 없음', () => {
  const seen = {};
  for (const r of records) {
    assert.ok(!seen[r.course], r._line + '번째 줄 "' + r.course + '" 중복(' + seen[r.course] + '번째 줄)');
    seen[r.course] = r._line;
  }
});

test('표준 과목: 과목 구분·확인 값은 정해진 어휘', () => {
  for (const r of records) {
    assert.ok(TYPES.indexOf(r.course_type) >= 0, r._line + '번째 줄 course_type ' + r.course_type);
    assert.ok(VERIFIED.indexOf(r.verified) >= 0, r._line + '번째 줄 verified ' + r.verified);
  }
});

test('표준 과목: 출처 URL은 https 공식 도메인(교육부·국가교육과정정보센터)', () => {
  for (const r of records) {
    const u = new URL(r.source_url);
    assert.strictEqual(u.protocol, 'https:', r._line + '번째 줄');
    assert.ok(/(^|\.)(moe\.go\.kr|ncic\.re\.kr)$/.test(u.hostname), r._line + '번째 줄 ' + u.hostname);
  }
});

test('표준 과목: 로마 숫자는 Ⅰ·Ⅱ(U+2160·2161)로 쓴다(영문 I 금지)', () => {
  for (const r of records) {
    assert.ok(!/[^A-Za-z]I{1,2}$/.test(r.course), r._line + '번째 줄 ' + r.course);
  }
});
