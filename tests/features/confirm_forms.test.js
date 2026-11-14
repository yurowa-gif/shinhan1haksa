/** 결정 68 확인서(급식(미)실시·입퇴실): 서버 모델·권한·버튼 표시. 양식 렌더러(디자인)는 아직 없어 시험에서 대신 끼운다. R4 gas-fakes. 가짜 데이터만. */
const assert = require('assert');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', OTHER = 'fake.teacher1@example.com';

function makeEnv() {
  const env = createGasEnv({ now: '2027-03-03T16:00:00' });
  env.seedFake({ stage1: true });
  env.strictLock = true;
  return env;
}
const term2 = (env) => env.rows('terms').find((t) => t.name === '2027 1학기');
const isDorm = (env, sid) => env.rows('status_changes').some((r) => r.student_id === sid && r.item === '기숙사' && r.value === '입실');
function pick(env) {
  const own = env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === HALL).map((e) => e.student_id);
  const other = env.rows('enrollments').filter((e) => e.term_id === term2(env).id && e.teacher_email === OTHER).map((e) => e.student_id)[0];
  return { dorm: own.find((s) => isDorm(env, s)), non: own.find((s) => !isDorm(env, s)), other };
}
const student = (env, id) => env.rows('students').find((s) => s.id === id);
const saveMeal = (env, who, sid, chip, extra) => {
  const i = Object.assign({ studentId: sid, chip, requestedAt: '2027-03-03T10:00:00', docSubmitted: false }, extra || {});
  const p = env.call(who, 'previewMealChange', i);
  assert.strictEqual(p.ok, true, JSON.stringify(p));
  const r = env.call(who, 'saveMealChange', i, p.expect);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return r;
};
const saveMove = (env, who, i) => { const p = env.call(who, 'previewMove', i); assert.strictEqual(p.ok, true, JSON.stringify(p)); const r = env.call(who, 'saveMove', i, p.expect); assert.strictEqual(r.ok, true, JSON.stringify(r)); return r; };
/** 렌더러·PDF 변환을 끼운 환경에서 부른다(모델을 잡는다) */
function pdf(env, who, fn, id, noRenderer) {
  const seen = { model: null, html: '', name: '' };
  const res = env.as(who, (c) => {
    if (!noRenderer) { c.printRenderMealConfirm_ = (m) => { seen.model = m; return '<html>meal</html>'; }; c.printRenderMoveConfirm_ = (m) => { seen.model = m; return '<html>move</html>'; }; }
    c.sheetMakePdf_ = (h, name) => { seen.html = h; seen.name = name; return { getBytes: () => [37, 80, 68, 70] }; };
    return c[fn](id);
  });
  return Object.assign({ res: plain(res) }, { model: plain(seen.model), html: seen.html, name: seen.name });
}
const rowOf = (env, id) => env.rows('status_changes').find((r) => r.id === id);

test('급식 확인서 모델: 석식 미실시 신청 → 구분 미실시, 석식 미실시 ✓, 사유 구분·이름·학년반번호·적용일·신청일·담당교사. 파일 이름에 학생 이름이 없다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveMeal(env, HALL, non, 'd_off', { reasonKind: '전출', reason: '이사 예정' });
  assert.strictEqual(rowOf(env, r.id).reason, '[전출] 이사 예정', '시트 열을 늘리지 않고 reason 앞에 붙인다');
  assert.strictEqual(r.confirmForm, true, '저장 결과가 확인서 안내를 보일지 알려 준다');
  const x = pdf(env, HALL, 'getMealConfirmPdf', r.id);
  assert.strictEqual(x.res.ok, true, JSON.stringify(x.res));
  const s = student(env, non), row = rowOf(env, r.id), teacher = env.rows('users').find((u) => u.email === HALL);
  assert.deepStrictEqual(x.model, { form: 'meal', kind: '미실시', reasonKind: '전출', reasonText: '', periodFrom: row.effective_date, breakfast: { on: false, off: false, reason: '' },
    dinner: { on: false, off: true }, date: '2027-03-03', name: s.name, grade: Number(s.grade), classNo: String(s.class_no), number: String(s.number), teacher: teacher.name });
  assert.ok(!x.res.name.includes(s.name) && /\.pdf$/.test(x.res.name) && x.res.bytes === 4 && x.res.base64);
});

test('조식 실시 신청은 구분 실시·조식 실시 ✓, 사유 구분 없음이면 비어 있다. 기타는 사유 글(2자 이상)이 필수이고 확인서에 적힌다', () => {
  const env = makeEnv();
  const { dorm } = pick(env);
  const b = saveMeal(env, HALL, dorm, 'b_off');   // 먼저 조식 미실시로 만들고
  env.setNow('2027-03-20T16:00:00');
  const r = saveMeal(env, HALL, dorm, 'b_on', { requestedAt: '2027-03-20T10:00:00', reasonKind: '기타', reason: '대회 준비 합숙' });
  assert.strictEqual(rowOf(env, r.id).reason, '[기타] 대회 준비 합숙');
  const x = pdf(env, HALL, 'getMealConfirmPdf', r.id);
  assert.strictEqual(x.res.ok, true, JSON.stringify(x.res));
  assert.deepStrictEqual([x.model.kind, x.model.breakfast.on, x.model.breakfast.off, x.model.dinner.on, x.model.reasonKind, x.model.reasonText], ['실시', true, false, false, '기타', '대회 준비 합숙']);
  const short = env.call(HALL, 'previewMealChange', { studentId: dorm, chip: 'b_off', requestedAt: '2027-03-20T10:30:00', reasonKind: '기타', reason: '가' });
  assert.strictEqual(short.ok, false); assert.ok(short.errors.some((e) => e.field === 'reason'));
  const bad = env.call(HALL, 'previewMealChange', { studentId: dorm, chip: 'b_off', requestedAt: '2027-03-20T10:30:00', reasonKind: '이사' });
  assert.strictEqual(bad.ok, false); assert.ok(bad.errors.some((e) => e.field === 'reasonKind'));
  void b;
});

test('권한: 그 학생 담당교사·관리자만(denied:status.edit — 다른 교사·담임), 학생·학부모는 첫 줄 거부(denied:status.list), 거부된 호출은 PDF를 만들지 않고 아무것도 쓰지 않는다', () => {
  const env = makeEnv();
  const { non } = pick(env);
  const r = saveMeal(env, HALL, non, 'd_off', { reasonKind: '전입' });
  const n = env.rows('status_changes').length;
  env.expectDenied(OTHER, 'status.edit', 'getMealConfirmPdf', r.id);
  ['test.student@example.com', 'test.parent@example.com'].forEach((w) => env.expectDenied(w, 'status.list', 'getMealConfirmPdf', r.id));
  env.expectDenied('test.homeroom@example.com', 'status.edit', 'getMealConfirmPdf', r.id);   // 담임은 역할은 되지만 담당이 아니라 학생 범위에서 거부
  const a = env.rows('audit_log').length;   // 거부 기록(denied:…)은 남지만, 허용된 출력은 시트에 아무것도 쓰지 않는다
  [HALL, ADMIN].forEach((w) => assert.strictEqual(pdf(env, w, 'getMealConfirmPdf', r.id).res.ok, true, w));
  assert.strictEqual(env.rows('status_changes').length, n); assert.strictEqual(env.rows('audit_log').length, a, '확인서 출력은 쓰지 않는다(Drive·시트 모두)');
});

test('만들지 않는 경우: 학사 석식 ↔ 일반 석식, 취소된 신청, 입퇴실 행(급식 확인서로), 없는 id, 렌더러가 없으면 안내', () => {
  const env = makeEnv();
  const { non, dorm } = pick(env);
  const gen = saveMeal(env, HALL, non, 'd_gen');   // 학사 석식 → 일반 석식: 실시·미실시가 바뀌지 않는다
  assert.strictEqual(gen.confirmForm, false, '학사 석식 ↔ 일반 석식은 안내가 없다');
  const g = pdf(env, HALL, 'getMealConfirmPdf', gen.id);
  assert.strictEqual(g.res.ok, false); assert.match(g.res.error, /실시/);
  const off = saveMeal(env, HALL, non, 'd_off', { requestedAt: '2027-03-03T10:05:00' });
  env.asOwner((c) => c.updateRecord_('status_changes', off.id, { status: '취소', cancel_reason: '시험' }, ADMIN));
  assert.match(pdf(env, HALL, 'getMealConfirmPdf', off.id).res.error, /취소/);
  const mv = saveMove(env, HALL, { studentId: dorm, type: '학사 및 기숙사 퇴실', requestedAt: '2027-03-03T15:00:00', effectiveDate: '2027-03-10', dinner: '중단', docSubmitted: false });
  assert.match(pdf(env, HALL, 'getMealConfirmPdf', mv.id).res.error, /급식 변경 신청서만/);
  assert.match(pdf(env, HALL, 'getMoveConfirmPdf', gen.id).res.error, /입퇴실 신청서만/);
  assert.match(pdf(env, HALL, 'getMealConfirmPdf', 'no-such').res.error, /찾을 수 없습니다/);
  const none = pdf(env, HALL, 'getMealConfirmPdf', off.id.length ? mv.id : '', true);   // 렌더러 없음: 대상이 아니면 대상 오류가 먼저
  assert.ok(none.res.ok === false);
  const live = saveMeal(env, HALL, non, 'd_off', { requestedAt: '2027-03-03T10:10:00', reasonKind: '전출' });
  const nr = pdf(env, HALL, 'getMealConfirmPdf', live.id, true);
  assert.deepStrictEqual([nr.res.ok, nr.res.error], [false, '확인서 양식이 아직 준비되지 않았습니다.']);
});

test('학생 기록의 confirmForm(버튼): 실시·미실시가 바뀌는 F7 신청은 meal, F6 입퇴실 대표 행은 move, 석식 학사↔일반·연결 행·취소 행·다른 교사에게는 없다', () => {
  const env = makeEnv();
  const { non, dorm } = pick(env);
  const off = saveMeal(env, HALL, non, 'd_off');
  const gen = saveMeal(env, HALL, dorm, 'd_gen');
  const mv = saveMove(env, HALL, { studentId: dorm, type: '학사 및 기숙사 퇴실', requestedAt: '2027-03-03T15:00:00', effectiveDate: '2027-03-10', dinner: '중단', docSubmitted: false });
  const forms = (who, sid) => { const d = env.call(who, 'listStudentStatus', sid, ''); return Object.fromEntries(d.pending.concat(d.history).map((h) => [h.id, h.confirmForm])); };
  const f1 = forms(HALL, non); assert.strictEqual(f1[off.id], 'meal');
  const f2 = forms(HALL, dorm);
  assert.strictEqual(f2[mv.id], 'move'); assert.ok(!f2[gen.id], '학사 석식 → 일반 석식은 확인서 없음');
  env.rows('status_changes').filter((r) => r.linked_change_id === mv.id).forEach((r) => assert.ok(!f2[r.id], '연결 행에는 없다'));
  assert.strictEqual(forms(ADMIN, non)[off.id], 'meal');
});

test('입퇴실 확인서 모델: 학사 및 기숙사 퇴실이면 둘 다, 학사 퇴실이면 학사만, 입실은 입실. 비고 = 사유(2OUT 퇴실이면 비움)', () => {
  const env = makeEnv();
  const { non, dorm } = pick(env);
  const a = saveMove(env, HALL, { studentId: dorm, type: '학사 및 기숙사 퇴실', requestedAt: '2027-03-03T15:00:00', effectiveDate: '2027-03-10', dinner: '중단', docSubmitted: false, reason: '가정 사정' });
  const x = pdf(env, HALL, 'getMoveConfirmPdf', a.id);
  assert.strictEqual(x.res.ok, true, JSON.stringify(x.res));
  const s = student(env, dorm), teacher = env.rows('users').find((u) => u.email === HALL);
  assert.deepStrictEqual(x.model, { form: 'move', direction: '퇴실', hall: true, dorm: true, effectiveDate: '2027-03-10', remark: '가정 사정', date: '2027-03-03', name: s.name, grade: Number(s.grade),
    classNo: String(s.class_no), number: String(s.number), teacher: teacher.name });
  assert.ok(!x.res.name.includes(s.name));
  const b = saveMove(env, HALL, { studentId: non, type: '학사 퇴실', requestedAt: '2027-03-03T15:10:00', effectiveDate: '2027-03-11', dinner: '중단', docSubmitted: false });
  const y = pdf(env, HALL, 'getMoveConfirmPdf', b.id);
  assert.deepStrictEqual([y.model.direction, y.model.hall, y.model.dorm], ['퇴실', true, false]);
  env.asOwner((c) => c.updateRecord_('status_changes', b.id, { reason: '2OUT 퇴실', memo: '[2OUT] out:x note:y' }, ADMIN));
  assert.strictEqual(pdf(env, ADMIN, 'getMoveConfirmPdf', b.id).model.remark, '', '2OUT 퇴실 사유는 확인서에 적지 않는다');
  env.expectDenied(OTHER, 'status.edit', 'getMoveConfirmPdf', a.id);
  ['test.student@example.com', 'test.parent@example.com'].forEach((w) => env.expectDenied(w, 'status.list', 'getMoveConfirmPdf', a.id));
  // 재입실(학사 입실) 확인서: 입실, 학사만
  const ctx = env.call(ADMIN, 'getMoveContext', dorm, '2027-03-20');
  const back = saveMove(env, ADMIN, { studentId: dorm, type: '학사 입실', requestedAt: '2027-03-03T15:40:00', effectiveDate: '2027-03-20', docSubmitted: false, meals: ctx.reentry.meals });
  const z = pdf(env, ADMIN, 'getMoveConfirmPdf', back.id);
  assert.deepStrictEqual([z.model.direction, z.model.hall, z.model.dorm, z.model.effectiveDate], ['입실', true, false, '2027-03-20']);
});
