/** writing-audit(#252)의 '글이 아니라 동작 문제' 네 가지: 급식 이유 줄 빈칸, 일괄 퇴실 기간 문구, 달력 범례, 좌석 맞바꾸기 안내. gas-fakes + 화면 파일 정적 확인. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ui = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', f), 'utf8');

test('① 급식 이유 줄: 규칙이 돌려줄 수 있는 모든 값에 설명이 있어 "…부터 적용됩니다. "로 빈칸으로 끝나지 않는다(entry_date·leave_date·vacation_start)', () => {
  const env = createGasEnv({ now: '2027-03-02T10:00:00' });
  const reason = (rule, manual) => plain(env.asOwner((c) => c.foodReasonText_({ date: '2027-03-03', autoDate: '2027-03-03', rule }, !!manual, '2027-03-02', '11:30')));
  for (const rule of ['same_day', 'next_day', 'next_monday', 'monday_after_next', 'entry_date', 'leave_date', 'vacation_start', 'initial']) {
    const t = reason(rule);
    assert.ok(t.startsWith('3월 3일(수)부터 적용됩니다.') && t === t.trim() && t.length > '3월 3일(수)부터 적용됩니다.'.length, rule + ': ' + JSON.stringify(t));
  }
  assert.ok(reason('entry_date').endsWith('입실일에 맞췄습니다.') && reason('leave_date').endsWith('퇴실일에 맞췄습니다.'));
  // MealRules가 돌려줄 수 있는 규칙 이름이 모두 설명을 갖는다(새 규칙이 생기면 여기서 걸린다)
  const rules = new Set();
  const rulesSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'rules', 'MealRules.gs'), 'utf8');
  for (const m of rulesSrc.matchAll(/rule:\s*'([a-z_]+)'/g)) rules.add(m[1]);
  const text = plain(env.asOwner((c) => c.FOOD_RULE_TEXT));
  const missing = [...rules].filter((r) => !text[r] && !['manual'].includes(r));
  assert.deepStrictEqual(missing, [], 'FOOD_RULE_TEXT에 없는 규칙: ' + missing.join(','));
});

test('② 일괄 퇴실 기간 문구: 끝난 다음 날까지 받는다(경계), 문구는 실제 동작과 같고 날짜는 "3월 31일(수)" 꼴이다(숫자 날짜 없음)', () => {
  const env = createGasEnv({ now: '2027-03-10T10:00:00' });
  const term = { name: '2027 1학기', start_date: '2027-03-02', end_date: '2027-07-20' };
  const v = (effectiveDate) => plain(env.asOwner((c) => c.batValidate_({ grade: '3', effectiveDate, requestedAt: '2027-03-03T10:45', dinner: '중단', reason: '' }, { grades: ['1', '2', '3'], term, now: '2027-03-10T10:00:00' })));
  const has = (r) => r.errors.filter((e) => e.field === 'effectiveDate');
  assert.deepStrictEqual([has(v('2027-03-02')).length, has(v('2027-07-20')).length, has(v('2027-07-21')).length], [0, 0, 0], '시작일·끝 날짜·끝 다음 날은 받는다');
  const bad = has(v('2027-07-22'))[0];
  assert.ok(bad && has(v('2027-03-01')).length === 1, '끝 다다음 날·시작 전은 거부');
  assert.ok(bad.message.includes('3월 2일(화)') && bad.message.includes('7월 21일(수)') && bad.message.includes('2027 1학기'), bad.message);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(bad.message), '숫자 날짜 없음: ' + bad.message);
  assert.ok(/끝난 다음 날/.test(bad.message) && !/끝 날짜까지|까지\) 안이어야/.test(bad.message), '실제 허용 범위(끝난 다음 날)와 같은 말');
});

test('③ 달력 범례: 굵은 테두리는 오늘(.today), 고른 날(.sel)은 별도 표시(아래 굵은 줄)라서 범례가 실제 모양과 같다', () => {
  const html = ui('screen_calendar.html');
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const rule = (sel) => { const m = new RegExp(sel.replace(/[.\s]/g, (c) => '\\' + c) + '\\s*\\{([^}]*)\\}').exec(css); return m ? m[1] : ''; };
  assert.ok(/border-color/.test(rule('.cal-cell.today')), '오늘 = 테두리');
  assert.ok(!/background/.test(rule('.cal-cell.sel')) && /box-shadow/.test(rule('.cal-cell.sel')), '고른 날은 배경(일정 있는 날과 같은 색)이 아니라 줄로 구분');
  assert.ok(/굵은 테두리 = 오늘/.test(html) && /파란 칸 = 일정이 있는 날/.test(html) && /굵은 줄 = 고른 날/.test(html), '범례 세 가지');
  assert.ok(!/굵은 테두리 = 지금 고른 날/.test(html), '옛 범례 없음');
});

test('④ 좌석 맞바꾸기 안내: 학생을 고른 채 앉은 자리를 누르면 "학생 선택을 풀고 좌석 2개를 차례로"라고 알려 준다(고른 채로는 맞바꾸기가 안 된다)', () => {
  const html = ui('screen_seats.html');
  const m = /function doAssign\(cell\) \{\s*if \(!cell\.vacant\) \{ UI\.toast\('([^']*)'/.exec(html);
  assert.ok(m, 'doAssign 안내');
  assert.ok(m[1].includes('이 좌석에는 이미 학생이 있습니다') && m[1].includes('학생 선택을 풀고') && m[1].includes('좌석 2개를 차례로'), m[1]);
  assert.ok(!html.includes('이미 앉은 학생이 있습니다. 두 자리를 차례로 눌러 맞바꿔 주세요.'), '옛 안내 없음');
  // doAssign은 학생을 고른 상태(state.student)에서만 불린다 — 맞바꾸기는 고르지 않은 상태의 두 번 누르기
  assert.ok(/if \(state\.student && cells\.length\) \{ grid\.clearSelection\(\); doAssign\(cells\[0\]\); return; \}\s*\n\s*if \(done\)/.test(html), '학생을 고른 상태면 doAssign, 아니면 맞바꾸기');
});
