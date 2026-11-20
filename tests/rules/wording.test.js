/** R25 규칙 문구(docs/design/writing.md): 날짜·달 표기 도우미, 화면 이름 표, 규칙 문구에 기계 조사가 없는지. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, loadGs, ROOT } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/StatusRules.gs',
  'src/rules/MealRules.gs', 'src/rules/TimetableRules.gs']);

test('ymdKo_·ymKo_: 3월 26일(금)·4월, 기준과 해가 다르면 연도, 날짜가 아니면 그대로', () => {
  const T = [
    ['2027-03-26', undefined, '3월 26일(금)'], ['2027-03-26', '2027-01-02', '3월 26일(금)'], ['2028-01-03', '2027-12-30', '2028년 1월 3일(월)'],
    ['2028-02-29', '', '2월 29일(화)'], ['2027-02-30', undefined, '2027-02-30'], ['', undefined, ''], [undefined, undefined, ''],
  ];
  T.forEach(([d, base, want]) => assert.strictEqual(ctx.ymdKo_(d, base), want, d + ' ' + base));
  assert.deepStrictEqual([ctx.ymKo_('2027-04'), ctx.ymKo_('2028-01', '2027-12-26'), ctx.ymKo_('2028-01', '2028-01-05T00:00:00'), ctx.ymKo_('2027-13')],
    ['4월', '2028년 1월', '1월', '2027-13']);
});

test('ruleNowText_·화면 이름 표: 빈 값은 (빈칸), 코드 값은 한국어, 모르는 값은 그대로', () => {
  assert.deepStrictEqual([ctx.ruleNowText_('x'), ctx.ruleNowText_(''), ctx.ruleNowText_(undefined), ctx.ruleNowText_(' 3 ')], ['(지금 x)', '(빈칸)', '(빈칸)', '(지금 3)']);
  assert.deepStrictEqual(['F6', 'F7', '명단업로드', '', '직접'].map(ctx.mealSourceKo_), ['입퇴실', '급식 변경', '명단 업로드', '기록', '직접']);
  assert.deepStrictEqual(['mon_thu', 'fri', 'sat', 'sun', 'holiday', 'exam'].map(ctx.schedDayTypeKo_), ['월~목', '금요일', '토요일', '일요일', '휴일', 'exam']);
  assert.deepStrictEqual(['반려', '동의', '제출', '확정'].map(ctx.ttStatusKo_), ['돌려보냄', '학부모 동의', '제출', '확정']);
});

test('규칙 문구에 기계 조사·옛 표현이 없다(을(를)·이(가)·은(는)·과(와)·(으)로·이번 기간, 주석 제외)', () => {
  const dir = path.join(ROOT, 'src/rules');
  const bad = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).forEach((f) => {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
      const code = line.replace(/\/\/.*$/, '');
      (code.match(/'[^']*'|"[^"]*"/g) || []).forEach((lit) => {
        if (/을\(를\)|이\(가\)|은\(는\)|과\(와\)|\(으\)로|이번 기간/.test(lit)) bad.push(f + ':' + (i + 1) + ' ' + lit);
      });
    });
  });
  assert.deepStrictEqual(bad, []);
});
