/** R22 F11 출결 결과 정리 격자 — 칸 모델·유형↔결과 기호·누적. 가짜 학생만. 2027-03-08(월). */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs', 'src/rules/AttendanceRules.gs']);

function table(name, rows, fn) {
  test(name, () => {
    for (const r of rows) {
      try { fn(r); } catch (e) { e.message = JSON.stringify(r) + '\n' + e.message; throw e; }
    }
  });
}

// 월요일 블록 4개(18:30–20:00, 20:10–21:30, 21:40–23:00, 23:00–23:50)
const BLOCKS = [['18:30', '20:00'], ['20:10', '21:30'], ['21:40', '23:00'], ['23:00', '23:50']].map(([start, end], i) => ({ seq: i + 1, start, end, label: '', key: '' }));
const PLAN = (date, extra) => Object.assign({ date, operating: true, dayType: 'mon_thu', start: '18:30', end: '23:50', blocks: BLOCKS, memo: '', warnings: [] }, extra || {});
let seq = 0;
const EX = (type, blocks, extra) => Object.assign({ id: 'e' + (++seq), student_id: 's1', date: '2027-03-08', blocks, type, status: '확정',
  confirmed_at: '2027-03-07T10:00:00', updated_at: '2027-03-07T10:00:00' }, extra || {});
const cell = (exceptions, plan, s) => plain(ctx.attGridCell_(plan || PLAN('2027-03-08'), Object.assign({ exceptions, fixedRows: [], endType: '23:50' }, s || {}), {}));
const res = (c) => c.results.map((r) => [r.kind, r.mark, r.recognized]);

table('attResultKind_: 유형 이름 → 결과 종류·인정(설정 유형 그대로, 괄호 설명은 뗌)', [
  ['병결', '결석', true], ['미인정결석', '결석', false], ['병지각', '지각', true], ['미인정지각', '지각', false],
  ['병조퇴', '조퇴', true], ['미인정조퇴', '조퇴', false], ['가정사유(가족여행 포함)', '블록', true], ['가정사유', '블록', true],
  ['학원(보강 포함)', '', true], ['학사 외 프로그램', '', true], ['학사 내 프로그램(파워클래스·면접특강 등)', '', true], ['기타', '', true],
  ['체험학습 결석', '결석', true], ['미인정 지각', '지각', false], ['', '', true]
], ([type, kind, recognized]) => assert.deepStrictEqual(plain(ctx.attResultKind_(type)), { kind, recognized }));

table('attResultByBlocks_: 모든 블록 → 결석, 첫 블록만 덮고 마지막 아님 → 지각, 마지막만 → 조퇴, 가운데만·처음과 끝만 → ""', [
  ['ALL', '결석'], ['18:00-24:00', '결석'], ['18:30-20:00', '지각'], ['18:30-21:30', '지각'], ['21:40-24:00', '조퇴'], ['23:00-23:50', '조퇴'],
  ['20:10-21:30', ''], ['18:30-20:00;23:00-23:50', ''], ['19:00-19:30', '지각'], ['bad', '']
], ([spec, want]) => assert.strictEqual(ctx.attResultByBlocks_(spec, BLOCKS), want));

test('attResultByBlocks_: 블록이 없는 날은 ALL만 결석', () => {
  assert.deepStrictEqual([ctx.attResultByBlocks_('ALL', []), ctx.attResultByBlocks_('18:00-20:00', [])], ['결석', '']);
});

table('attGridCell_ 결과: 하루에 종류마다 1번, 결석이 있으면 결석만, 인정·미인정이 섞이면 미인정', [
  ['미인정지각 블록 2개 행', [EX('미인정지각', '18:30-20:00'), EX('미인정지각', '20:10-21:30')], [['지각', '△', false]]],
  ['병지각 + 미인정조퇴(둘 다 셈)', [EX('병지각', '18:30-20:00'), EX('미인정조퇴', '23:00-23:50')], [['지각', '△', true], ['조퇴', '조', false]]],
  ['병결 + 미인정지각 → 결석만', [EX('미인정지각', '18:30-20:00'), EX('병결', 'ALL')], [['결석', '×', true]]],
  ['병지각 + 미인정지각 → 미인정', [EX('병지각', '18:30-20:00'), EX('미인정지각', '20:10-21:30')], [['지각', '△', false]]],
  ['미인정지각 + 병지각(순서 반대) → 미인정', [EX('미인정지각', '18:30-20:00'), EX('병지각', '20:10-21:30')], [['지각', '△', false]]],
  ['가정사유 ALL → 결석(인정)', [EX('가정사유(가족여행 포함)', 'ALL')], [['결석', '×', true]]],
  ['가정사유 15:00부터 귀가 표기(21:40-24:00) → 조퇴', [EX('가정사유(가족여행 포함)', '21:40-24:00')], [['조퇴', '조', true]]],
  ['가정사유 가운데 블록만 → 결과 없음', [EX('가정사유(가족여행 포함)', '20:10-21:30')], []],
  ['학원·기타·프로그램 → 결과 없음', [EX('학원(보강 포함)', 'ALL'), EX('기타', 'ALL'), EX('학사 외 프로그램', 'ALL')], []],
  ['요청·취소 행·다른 날짜 행은 보지 않음', [EX('미인정결석', 'ALL', { status: '요청' }), EX('미인정결석', 'ALL', { status: '취소' }), EX('미인정결석', 'ALL', { date: '2027-03-09' })], []]
], ([, exceptions, want]) => assert.deepStrictEqual(res(cell(exceptions)), want));

test('attGridCell_: exceptionIds·types는 그 종류로 묶인 행 전부, marks는 출석부 칸(resolveStudentDay_)과 같다', () => {
  const ex = [EX('미인정지각', '18:30-20:00', { id: 'a' }), EX('미인정지각', '20:10-21:30', { id: 'b' }), EX('학원(보강 포함)', '23:00-23:50', { id: 'c' })];
  const c = cell(ex);
  assert.deepStrictEqual([c.results[0].exceptionIds, c.results[0].types], [['a', 'b'], ['미인정지각']]);
  const fixed = [{ id: 'f1', student_id: 's1', month: '2027-03', weekday: '월', blocks: '21:40-23:00', code: '학', status: '확정' }];
  const s = { exceptions: ex, fixedRows: fixed, endType: '23:50' };
  const sheet = plain(ctx.resolveStudentDay_(PLAN('2027-03-08'), s, {})).map((m) => ({ seq: m.seq, code: m.code, text: m.text }));
  const g = plain(ctx.attGridCell_(PLAN('2027-03-08'), s, {}));
  assert.deepStrictEqual(g.marks, sheet);
  assert.deepStrictEqual(g.marks.map((m) => m.code), ['EXC', 'EXC', 'FIXED', 'EXC']);   // 사전 특이사항 → 고정 일정 순서
  assert.deepStrictEqual([g.date, g.operating, g.warnings], ['2027-03-08', true, []]);
});

test('attGridCell_: 운영 안 하는 날은 marks·results가 비고, 그날 확정 특이사항이 있으면 경고(세지 않음)', () => {
  const c = cell([EX('미인정결석', 'ALL')], PLAN('2027-03-08', { operating: false, blocks: [] }));
  assert.deepStrictEqual([c.operating, c.marks, c.results], [false, [], []]);
  assert.match(c.warnings[0], /운영 안 하는 날의 특이사항 1건/);
  assert.deepStrictEqual(cell([], PLAN('2027-03-08', { operating: false })).warnings, []);
});

test('attResultTotals_: 결석·지각·조퇴 × 인정·미인정, 칸마다 종류당 1', () => {
  const cells = [
    cell([EX('미인정지각', '18:30-20:00'), EX('미인정지각', '20:10-21:30')]),
    cell([EX('병결', 'ALL', { date: '2027-03-09' })], PLAN('2027-03-09')),
    cell([EX('병지각', '18:30-20:00', { date: '2027-03-10' }), EX('미인정조퇴', '23:00-23:50', { date: '2027-03-10' })], PLAN('2027-03-10')),
    cell([EX('미인정결석', 'ALL', { date: '2027-03-11' })], PLAN('2027-03-11', { operating: false })),
    cell([EX('가정사유(가족여행 포함)', 'ALL', { date: '2027-03-12' })], PLAN('2027-03-12'))];
  assert.deepStrictEqual(plain(ctx.attResultTotals_(cells)), { '결석': { '인정': 2, '미인정': 0 }, '지각': { '인정': 1, '미인정': 1 }, '조퇴': { '인정': 0, '미인정': 1 } });
  assert.deepStrictEqual(plain(ctx.attResultTotals_([])), { '결석': { '인정': 0, '미인정': 0 }, '지각': { '인정': 0, '미인정': 0 }, '조퇴': { '인정': 0, '미인정': 0 } });
});
