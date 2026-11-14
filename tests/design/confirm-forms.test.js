/** D9: 확인서 두 종 렌더러(printRenderMealConfirm_·printRenderMoveConfirm_) — 계약(docs/contracts/confirm-forms.md)의 모델을 받아 칸·문구·여백이 2025판 양식과 같고, 고른 항목만 ○·✓로 보이며, 틀린 값은 조용히 넘기지 않는다 */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');
const fx = require('../../design/preview/confirm-forms-fixture');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/ConfirmFormsHtml.gs']);
const clone = (x) => JSON.parse(JSON.stringify(x));
const meal = (m) => ctx.printRenderMealConfirm_(clone(m), {});
const move = (m) => ctx.printRenderMoveConfirm_(clone(m), {});
/** 태그를 벗기고 공백을 하나로 */
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** 둥글게 표시된(○표) 글자들 */
const circled = (html) => [...html.matchAll(/<span style="[^"]*border-radius:50%[^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);

test('여백·쪽: A4 세로, 위 20 · 아래 15 · 좌우 30mm, 내용 폭 425pt(= 150mm), 제목이 가운데', () => {
  [meal(fx.mealStop()), move(fx.moveLeave())].forEach((html) => {
    assert.ok(html.indexOf('@page { size: A4 portrait; margin: 20mm 30mm 15mm 30mm; }') > 0);
    assert.ok(html.indexOf('<section class="page" style="width:425pt;') > 0);
    assert.ok(/font-size:22pt;font-weight:bold;[^"]*text-align:center/.test(html));
    assert.ok(html.indexOf('<script') < 0 && html.indexOf('<img') < 0);
  });
});

test('급식 확인서: 양식의 칸·문구가 그대로다(2025판)', () => {
  const t = text(meal(fx.mealServe()));
  ['학교급식(미)실시 확인서', '구분 (○표)', '급식실시', '급식미실시', '이 름', '학 년ㆍ반', '전입, 전출, 장기결석, 대회출전,', '기타 (', '기 간', '(전입자일 경우에는 급식실시일 기재)',
    '조식 실시', '(사유: 기숙사 입실 / 미실시 사유 소멸)', '조식 미실시', '(사유: 기숙사 퇴실 / 건강상의 사유*증빙서류)', '석식 실시', '석식 미실시',
    '신한고등학교 확인자 : 직) 교사 성명)', '(인)'].forEach((s) => assert.ok(t.indexOf(s) >= 0, s));
  assert.ok(t.indexOf('보충미실시') < 0 && t.indexOf('비 고') < 0, '옛 빈 양식의 문구가 섞이지 않는다');
});

test('급식 확인서: 석식 미실시 신청 — 구분은 kind(급식미실시 ○), ✓는 석식 미실시 하나, 기타 사유·기간·날짜·확인자가 채워진다', () => {
  const html = meal(fx.mealStop()), t = text(html);
  assert.ok(t.indexOf('급식실시 ( ) , 급식미실시 ( ○ )') >= 0, '구분 ○');
  assert.strictEqual((t.match(/✓/g) || []).length, 1);
  assert.ok(t.indexOf('조식 실시 [ ]') >= 0 && t.indexOf('조식 미실시 [ ]') >= 0 && t.indexOf('석식 실시 [ ]') >= 0 && t.indexOf('석식 미실시 [ ✓ ]') >= 0, '체크칸');
  assert.deepStrictEqual(circled(html), ['기타']);
  assert.ok(t.indexOf('기타 ( 개인 사정 )') >= 0, '기타 사유 글');
  assert.ok(t.indexOf('김가온') >= 0 && t.indexOf('1 학년 3 반 5 번') >= 0);
  assert.ok(t.indexOf('2027. 3. 15. ~') >= 0 && t.indexOf('2027. 3. 15. ~ 2') < 0, '끝나는 날은 비워 둔다');
  assert.ok(t.indexOf('2027년 3월 3일') >= 0);
  assert.ok(t.indexOf('성명) 박선생 (인)') >= 0, '확인자 = 담당교사, 도장 자리는 빈칸');
});

test('급식 확인서: 조식 실시(전입) — 급식실시 ○, 조식 실시 ✓, 전입 ○, 조식 사유가 있으면 동그라미(없으면 종이에 손으로). 조식 미실시·석식도 칸마다 따로', () => {
  const html = meal(fx.mealServe()), t = text(html);
  assert.ok(t.indexOf('급식실시 ( ○ ) , 급식미실시 ( )') >= 0);
  assert.strictEqual((t.match(/✓/g) || []).length, 1);
  assert.ok(t.indexOf('조식 실시 [ ✓ ]') >= 0 && t.indexOf('석식 실시 [ ]') >= 0);
  assert.deepStrictEqual(circled(html), ['전입', '기숙사 입실']);
  const b = meal(fx.mealBreakfastStop()), tb = text(b);
  assert.ok(tb.indexOf('조식 미실시 [ ✓ ]') >= 0 && tb.indexOf('조식 실시 [ ]') >= 0 && (tb.match(/✓/g) || []).length === 1);
  assert.deepStrictEqual(circled(b), [], '사유 구분·조식 사유가 비어 있으면 아무것도 동그라미 치지 않는다(서버는 지금 늘 빈칸)');
  const both = fx.mealStop(); both.breakfast = { on: false, off: true, reason: '' }; both.dinner = { on: false, off: true };   // 한 신청에 두 끼니가 함께 바뀌어도(계약상 드묾) 둘 다 ✓
  assert.strictEqual((text(meal(both)).match(/✓/g) || []).length, 2);
});

test('입퇴실 확인서: 양식의 칸·문구, 퇴실 + 학사 및 기숙사 퇴실이면 구분 ○가 둘, 입실이면 입실 ○', () => {
  const t = text(move(fx.moveLeave()));
  ['기숙사 및 신한학사 입․퇴실 확인서', '입․퇴실(○표)', '구분 (○표)', '입․퇴실일', '이 름', '학 년ㆍ반ㆍ번호', '★ 비 고', '신한고등학교 확인자 : 직) 교사 성명)', '(인)'].forEach((s) => assert.ok(t.indexOf(s) >= 0, s));
  assert.ok(t.indexOf('입 실( ) , 퇴 실 ( ○ )') >= 0);
  assert.ok(t.indexOf('기숙사( ○ ) , 신한학사( ○ )') >= 0, '학사 및 기숙사 퇴실은 둘 다 ○');
  assert.ok(t.indexOf('2027년 3월 15일') >= 0 && t.indexOf('가정 사정(가짜)') >= 0 && t.indexOf('성명) 박선생 (인)') >= 0);
  const e = text(move(fx.moveEnter()));
  assert.ok(e.indexOf('입 실( ○ ) , 퇴 실 ( )') >= 0 && e.indexOf('기숙사( ○ ) , 신한학사( )') >= 0);
  const only = fx.moveLeave(); only.dorm = false;
  assert.ok(text(move(only)).indexOf('기숙사( ) , 신한학사( ○ )') >= 0);
});

test('틀린 값은 조용히 넘기지 않는다: 오류를 던진다(구분·끼니·사유·조식 사유·날짜·구분 칸·학생 숫자·다른 양식 모델)', () => {
  const bad = (f) => assert.throws(f);
  bad(() => ctx.printRenderMealConfirm_(null, {}));
  bad(() => ctx.printRenderMoveConfirm_(undefined, {}));
  const k = fx.mealStop(); k.kind = '변경'; bad(() => meal(k));
  const nothing = fx.mealStop(); nothing.dinner = { on: false, off: false }; bad(() => meal(nothing));
  const odd = fx.mealStop(); odd.dinner = { on: 'yes', off: false }; bad(() => meal(odd));
  const r = fx.mealStop(); r.reasonKind = '휴가'; bad(() => meal(r));
  const c = fx.mealServe(); c.breakfast.reason = '기타'; bad(() => meal(c));
  const d = fx.mealStop(); d.date = '2027-3-3'; bad(() => meal(d));
  const p = fx.mealStop(); p.periodFrom = '2027-13-01'; bad(() => meal(p));
  const s = fx.mealStop(); s.grade = '1학년'; bad(() => meal(s));
  const f = fx.mealStop(); f.form = 'move'; bad(() => meal(f));
  const dir = fx.moveLeave(); dir.direction = '휴학'; bad(() => move(dir));
  const sc = fx.moveLeave(); sc.hall = false; sc.dorm = false; bad(() => move(sc));
  const dd = fx.moveLeave(); dd.date = ''; bad(() => move(dd));
  const f2 = fx.moveLeave(); f2.form = 'meal'; bad(() => move(f2));
  const eff = fx.moveLeave(); eff.effectiveDate = '2027-02-30'; bad(() => move(eff));
});

test('이름은 모델로만 받고 이스케이프하며, 없으면 빈칸이다. 순수(같은 입력 같은 출력, 모델을 바꾸지 않음). form·숫자 칸 생략 허용', () => {
  const m = fx.mealStop(); m.name = '<b>가짜</b>'; m.reasonText = '<i>사유</i>'; m.teacher = '<u>교사</u>';
  const before = JSON.stringify(m);
  const html = ctx.printRenderMealConfirm_(m, {});
  assert.strictEqual(JSON.stringify(m), before);
  assert.strictEqual(html, ctx.printRenderMealConfirm_(clone(m), {}));
  assert.ok(html.indexOf('<b>가짜') < 0 && html.indexOf('&lt;b&gt;가짜&lt;/b&gt;') > 0 && html.indexOf('<i>사유') < 0 && html.indexOf('<u>교사') < 0);
  const blank = fx.moveLeave(); delete blank.form; blank.name = ''; blank.grade = ''; blank.classNo = ''; blank.number = ''; blank.teacher = ''; blank.remark = '';
  const t = text(move(blank));
  assert.ok(t.indexOf('김가온') < 0 && t.indexOf('박선생') < 0 && t.indexOf('학년 반 번') >= 0, '이름·확인자·학년반번이 없으면 빈칸으로 남는다(손으로 쓴다)');
  assert.ok(t.indexOf('(인)') > 0);
  const nums = fx.mealStop(); nums.grade = 1; nums.classNo = 3; nums.number = 5;   // 숫자 형식도 받는다
  assert.ok(text(meal(nums)).indexOf('1 학년 3 반 5 번') >= 0);
});

test('이 소스에는 Apps Script 서비스·현재 시각이 없다(순수 함수)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'print', 'ConfirmFormsHtml.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/SpreadsheetApp|DriveApp|UrlFetchApp|PropertiesService|LockService|Utilities\.|new Date\(\s*\)|Session\./.test(src));
});
