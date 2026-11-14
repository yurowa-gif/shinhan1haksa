/** D9 ↔ C(확인서 서버): 서버가 만든 모델(foodMealConfirmModel_·inoutConfirmModel_)을 진짜 렌더러(src/print/ConfirmFormsHtml.gs)에 넣어 종이 모양 HTML이 나오는지 본다(가짜 데이터) */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const R = loadGs(['src/rules/DateRules.gs', 'src/print/AttendanceSheetHtml.gs', 'src/print/ConfirmFormsHtml.gs']);
const HALL = 'test.teacher@example.com';
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T16:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  return env;
}
const term = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const isDorm = (env, sid) => env.rows('status_changes').some((r) => r.student_id === sid && r.item === '기숙사' && r.value === '입실');
const own = (env) => env.rows('enrollments').filter((e) => e.term_id === term(env).id && e.teacher_email === HALL).map((e) => e.student_id);
/** 진짜 렌더러를 끼우고 PDF 변환만 바꿔서 서버를 부른다 → 렌더러가 받은 HTML */
function html(env, fn, id) {
  const seen = { html: '' };
  const res = env.as(HALL, (c) => {
    c.printRenderMealConfirm_ = R.printRenderMealConfirm_; c.printRenderMoveConfirm_ = R.printRenderMoveConfirm_;
    c.sheetMakePdf_ = (h) => { seen.html = h; return { getBytes: () => [37, 80, 68, 70] }; };
    return c[fn](id);
  });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  return seen.html;
}

test('서버 모델 → 렌더러: 석식 미실시(전출) 급식 확인서와 학사 및 기숙사 퇴실 입퇴실 확인서가 종이 모양으로 나온다', () => {
  const env = makeEnv();
  const sid = own(env).find((s) => !isDorm(env, s));
  const dorm = own(env).find((s) => isDorm(env, s));
  const i = { studentId: sid, chip: 'd_off', requestedAt: '2027-03-03T10:00:00', docSubmitted: false, reasonKind: '전출', reason: '이사 예정' };
  const p = env.call(HALL, 'previewMealChange', i);
  const m = env.call(HALL, 'saveMealChange', i, p.expect);
  assert.strictEqual(m.ok, true, JSON.stringify(m));
  const name = env.rows('students').find((s) => s.id === sid).name;
  const t1 = text(html(env, 'getMealConfirmPdf', m.id));
  assert.ok(t1.indexOf('학교급식(미)실시 확인서') >= 0 && t1.indexOf('급식실시 ( ) , 급식미실시 ( ○ )') >= 0 && t1.indexOf('석식 미실시 [ ✓ ]') >= 0 && (t1.match(/✓/g) || []).length === 1);
  assert.ok(t1.indexOf(name) >= 0 && /\d 학년 \d 반 \d+ 번/.test(t1) && t1.indexOf('2027년 3월 3일') >= 0 && /성명\) .+ \(인\)/.test(t1));
  const j = { studentId: dorm, type: '학사 및 기숙사 퇴실', requestedAt: '2027-03-03T15:00:00', effectiveDate: '2027-03-10', dinner: '중단', docSubmitted: false, reason: '가정 사정' };
  const pm = env.call(HALL, 'previewMove', j);
  const mv = env.call(HALL, 'saveMove', j, pm.expect);
  assert.strictEqual(mv.ok, true, JSON.stringify(mv));
  const t2 = text(html(env, 'getMoveConfirmPdf', mv.id));
  assert.ok(t2.indexOf('기숙사 및 신한학사 입․퇴실 확인서') >= 0 && t2.indexOf('입 실( ) , 퇴 실 ( ○ )') >= 0 && t2.indexOf('기숙사( ○ ) , 신한학사( ○ )') >= 0);
  assert.ok(t2.indexOf('2027년 3월 10일') >= 0 && t2.indexOf('가정 사정') >= 0);
});
