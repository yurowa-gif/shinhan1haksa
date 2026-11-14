/** D9: 확인서 두 종 렌더러(printRenderMealConfirm_·printRenderMoveConfirm_) — 칸·문구·여백이 2025판 양식과 같고, 고른 항목만 ○·✓로 보이며, 틀린 값은 조용히 넘기지 않는다 */
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

test('급식 확인서: 조식·석식 모두 미실시 — 급식미실시 ○, 미실시 체크칸 둘 ✓, 사유·기타·기간·날짜·확인자가 채워진다', () => {
  const html = meal(fx.mealStop()), t = text(html);
  assert.ok(t.indexOf('급식실시 ( ) , 급식미실시 ( ○ )') >= 0, '구분 ○');
  assert.ok(t.indexOf('조식 실시 [ ]') >= 0 && t.indexOf('조식 미실시 [ ✓ ]') >= 0 && t.indexOf('석식 실시 [ ]') >= 0 && t.indexOf('석식 미실시 [ ✓ ]') >= 0, '체크칸');
  assert.deepStrictEqual(circled(html), ['기타', '기숙사 퇴실']);   // 사유 구분 + 조식 사유
  assert.ok(t.indexOf('기타 ( 개인 사정 )') >= 0, '기타 사유 글');
  assert.ok(t.indexOf('김가온') >= 0 && t.indexOf('1 학년 3 반 5 번') >= 0);
  assert.ok(t.indexOf('2027. 3. 15. ~') >= 0 && t.indexOf('2027년 3월 3일') >= 0);
  assert.ok(t.indexOf('성명) 박선생 (인)') >= 0 && t.indexOf('(인)') > t.indexOf('박선생'), '확인자 = 담당교사, 도장 자리는 빈칸');
});

test('급식 확인서: 조식 실시만 — 급식실시 ○, 조식 실시 ✓ 하나뿐, 전입 ○. 조식·석식이 섞이면 구분 ○가 둘', () => {
  const html = meal(fx.mealServe()), t = text(html);
  assert.ok(t.indexOf('급식실시 ( ○ ) , 급식미실시 ( )') >= 0);
  assert.strictEqual((t.match(/✓/g) || []).length, 1);
  assert.ok(t.indexOf('조식 실시 [ ✓ ]') >= 0 && t.indexOf('석식 실시 [ ]') >= 0 && t.indexOf('석식 미실시 [ ]') >= 0);
  assert.deepStrictEqual(circled(html), ['전입', '기숙사 입실']);
  const mixed = fx.mealStop(); mixed.serving = { breakfast: '실시', dinner: '미실시' };
  const tm = text(meal(mixed));
  assert.ok(tm.indexOf('급식실시 ( ○ ) , 급식미실시 ( ○ )') >= 0 && (tm.match(/✓/g) || []).length === 2);
  const dinnerOnly = fx.mealStop(); dinnerOnly.serving = { breakfast: null, dinner: '미실시' }; dinnerOnly.breakfastCause = null;
  const td = text(meal(dinnerOnly));
  assert.strictEqual((td.match(/✓/g) || []).length, 1);
  assert.ok(td.indexOf('석식 미실시 [ ✓ ]') >= 0 && td.indexOf('조식 미실시 [ ]') >= 0);
});

test('입퇴실 확인서: 양식의 칸·문구, 퇴실 + 학사 및 기숙사 퇴실이면 구분 ○가 둘, 입실이면 입실 ○', () => {
  const t = text(move(fx.moveLeave()));
  ['기숙사 및 신한학사 입․퇴실 확인서', '입․퇴실(○표)', '구분 (○표)', '입․퇴실일', '이 름', '학 년ㆍ반ㆍ번호', '★ 비 고', '신한고등학교 확인자 : 직) 교사 성명)', '(인)'].forEach((s) => assert.ok(t.indexOf(s) >= 0, s));
  assert.ok(t.indexOf('입 실( ) , 퇴 실 ( ○ )') >= 0);
  assert.ok(t.indexOf('기숙사( ○ ) , 신한학사( ○ )') >= 0, '학사 및 기숙사 퇴실은 둘 다 ○');
  assert.ok(t.indexOf('2027년 3월 15일') >= 0 && t.indexOf('2OUT 퇴실') >= 0 && t.indexOf('성명) 박선생 (인)') >= 0);
  const e = text(move(fx.moveEnter()));
  assert.ok(e.indexOf('입 실( ○ ) , 퇴 실 ( )') >= 0 && e.indexOf('기숙사( ○ ) , 신한학사( )') >= 0);
});

test('틀린 값은 조용히 넘기지 않는다: 오류를 던진다(끼니·사유·조식 사유·날짜·구분·학생 숫자)', () => {
  const bad = (f) => assert.throws(f);
  bad(() => ctx.printRenderMealConfirm_(null, {}));
  bad(() => ctx.printRenderMoveConfirm_(undefined, {}));
  const nothing = fx.mealStop(); nothing.serving = { breakfast: null, dinner: null }; bad(() => meal(nothing));
  const odd = fx.mealStop(); odd.serving = { breakfast: '변경', dinner: null }; bad(() => meal(odd));
  const r = fx.mealStop(); r.reason = '휴가'; bad(() => meal(r));
  const c = fx.mealStop(); c.breakfastCause = '기타'; bad(() => meal(c));
  const d = fx.mealStop(); d.date = '2027-3-3'; bad(() => meal(d));
  const p = fx.mealStop(); p.period = { from: '2027-13-01', to: '' }; bad(() => meal(p));
  const s = fx.mealStop(); s.student = { name: '김가온', grade: '1학년', classNo: '3', number: '5' }; bad(() => meal(s));
  const k = fx.moveLeave(); k.kind = '휴학'; bad(() => move(k));
  const sc = fx.moveLeave(); sc.scopes = []; bad(() => move(sc));
  const sc2 = fx.moveLeave(); sc2.scopes = ['기숙사', '학사']; bad(() => move(sc2));
  const dd = fx.moveLeave(); dd.date = ''; bad(() => move(dd));
});

test('이름은 모델로만 받고 이스케이프하며, 없으면 빈칸이다. 순수(같은 입력 같은 출력, 모델을 바꾸지 않음)', () => {
  const m = fx.mealStop(); m.student.name = '<b>가짜</b>'; m.reasonOther = '<i>사유</i>'; m.confirmer = { name: '<u>교사</u>' };
  const before = JSON.stringify(m);
  const html = ctx.printRenderMealConfirm_(m, {});
  assert.strictEqual(JSON.stringify(m), before);
  assert.strictEqual(html, ctx.printRenderMealConfirm_(clone(m), {}));
  assert.ok(html.indexOf('<b>가짜') < 0 && html.indexOf('&lt;b&gt;가짜&lt;/b&gt;') > 0 && html.indexOf('<i>사유') < 0 && html.indexOf('<u>교사') < 0);
  const blank = fx.moveLeave(); blank.student = {}; blank.confirmer = {}; blank.note = '';
  const t = text(move(blank));
  assert.ok(t.indexOf('김가온') < 0 && t.indexOf('박선생') < 0 && t.indexOf('학년 반 번') >= 0, '이름·확인자·학년반번이 없으면 빈칸으로 남는다(손으로 쓴다)');
  assert.ok(text(move(blank)).indexOf('(인)') > 0);
});

test('이 소스에는 Apps Script 서비스·현재 시각이 없다(순수 함수)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'print', 'ConfirmFormsHtml.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/SpreadsheetApp|DriveApp|UrlFetchApp|PropertiesService|LockService|Utilities\.|new Date\(\s*\)|Session\./.test(src));
});
