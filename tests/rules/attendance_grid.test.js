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

const SCHEMA = require('fs').readFileSync(require('path').join(__dirname, '../../src/Schema.gs'), 'utf8');
const DEFAULT_TYPES = /\['exception\.types',\s*'([^']*)'/.exec(SCHEMA)[1].split(',');

table('attResultKind_: 결과 유형 여섯만(상수 대응표), 괄호 설명은 뗌, 그 밖은 null', [
  ['병결', '결석', '×', true], ['미인정결석', '결석', '×', false], ['병지각', '지각', '△', true], ['미인정지각', '지각', '△', false],
  ['병조퇴', '조퇴', '조', true], ['미인정조퇴', '조퇴', '조', false], ['미인정결석(무단)', '결석', '×', false],
  ['가정사유(가족여행 포함)', null], ['학원(보강 포함)', null], ['학사 외 프로그램', null], ['학사 내 프로그램(파워클래스·면접특강 등)', null],
  ['기타', null], ['체험학습 결석', null], ['', null]
], ([type, kind, mark, recognized]) => assert.deepStrictEqual(plain(ctx.attResultKind_(type)), kind === null ? null : { kind, mark, recognized }));

test('attResultChoices_: DEFAULT_SETTINGS 유형 11개 — 결과 선택지는 결석·지각·조퇴 6개(설정 순서), 가정사유·학원·프로그램·기타는 빠짐', () => {
  assert.strictEqual(DEFAULT_TYPES.length, 11);
  const ch = plain(ctx.attResultChoices_(DEFAULT_TYPES));
  assert.deepStrictEqual(ch.map((c) => [c.type, c.mark, c.recognized]), [
    ['병결', '×', true], ['병지각', '△', true], ['병조퇴', '조', true], ['미인정지각', '△', false], ['미인정조퇴', '조', false], ['미인정결석', '×', false]]);
  const out = DEFAULT_TYPES.filter((t) => !ch.some((c) => c.type === t));
  assert.deepStrictEqual(out, ['가정사유(가족여행 포함)', '학원(보강 포함)', '학사 외 프로그램', '학사 내 프로그램(파워클래스·면접특강 등)', '기타']);
  // 대응표의 여섯 이름이 모두 기본 설정에 있다(설정 이름을 바꾸면 이 시험이 알린다)
  assert.deepStrictEqual(Object.keys(plain(ctx.attResultTable_())).filter((k) => !DEFAULT_TYPES.some((t) => ctx.attTypeBase_(t) === k)), []);
});

table('attGridCell_ 결과: 하루에 종류마다 1번, 결석이 있으면 결석만, 인정·미인정이 섞이면 미인정', [
  ['미인정지각 블록 2개 행', [EX('미인정지각', '18:30-20:00'), EX('미인정지각', '20:10-21:30')], [['지각', '△', false]]],
  ['병지각 + 미인정조퇴(둘 다 셈)', [EX('병지각', '18:30-20:00'), EX('미인정조퇴', '23:00-23:50')], [['지각', '△', true], ['조퇴', '조', false]]],
  ['병결 + 미인정지각 → 결석만', [EX('미인정지각', '18:30-20:00'), EX('병결', 'ALL')], [['결석', '×', true]]],
  ['병지각 + 미인정지각 → 미인정', [EX('병지각', '18:30-20:00'), EX('미인정지각', '20:10-21:30')], [['지각', '△', false]]],
  ['미인정지각 + 병지각(순서 반대) → 미인정', [EX('미인정지각', '18:30-20:00'), EX('병지각', '20:10-21:30')], [['지각', '△', false]]],
  // 결정 81: 결과 유형이 아닌 빠짐도 인정으로 센다 — 종류는 덮은 블록으로
  ['가정사유 ALL → 인정 결석', [EX('가정사유(가족여행 포함)', 'ALL')], [['결석', '×', true]]],
  ['가정사유 마지막 블록부터(21:40-24:00) → 인정 조퇴', [EX('가정사유(가족여행 포함)', '21:40-24:00')], [['조퇴', '조', true]]],
  ['가정사유 첫 블록 → 인정 지각', [EX('가정사유', '18:30-20:00')], [['지각', '△', true]]],
  ['가정사유 가운데 블록만 → 종류 없음(학습량에만 남음)', [EX('가정사유(가족여행 포함)', '20:10-21:30')], []],
  ['가정사유 조퇴 + 미인정조퇴 → 조퇴 1번, 미인정', [EX('가정사유(가족여행 포함)', '21:40-24:00'), EX('미인정조퇴', '23:00-23:50')], [['조퇴', '조', false]]],
  ['학원 ALL → 인정 결석', [EX('학원(보강 포함)', 'ALL')], [['결석', '×', true]]],
  ['학사 외 프로그램 첫 블록 → 인정 지각', [EX('학사 외 프로그램', '18:30-20:00')], [['지각', '△', true]]],
  ['학사 내 프로그램 마지막 블록부터 → 인정 조퇴', [EX('학사 내 프로그램(파워클래스·면접특강 등)', '21:40-24:00')], [['조퇴', '조', true]]],
  ['기타 가운데만 → 종류 없음', [EX('기타', '20:10-21:30')], []],
  ['요청·취소 행·다른 날짜 행은 보지 않음', [EX('미인정결석', 'ALL', { status: '요청' }), EX('미인정결석', 'ALL', { status: '취소' }), EX('미인정결석', 'ALL', { date: '2027-03-09' })], []]
], ([, exceptions, want]) => assert.deepStrictEqual(res(cell(exceptions)), want));

test('attGridCell_: 고정 일정 학·가 블록은 결과(결석·지각·조퇴)에 들지 않고 학습량의 빠진 시간에만', () => {
  const fixed = ['18:30-20:00', '21:40-23:00'].map((b, i) => ({ id: 'f' + i, student_id: 's1', month: '2027-03', weekday: '월', blocks: b, code: i ? '가' : '학', status: '확정' }));
  const g = plain(ctx.attGridCell_(PLAN('2027-03-08'), { exceptions: [], fixedRows: fixed, endType: '23:50' }, {}));
  assert.deepStrictEqual([g.results, g.study.missed.map((m) => [m.text, m.minutes])], [[], [['학', 90], ['가', 80]]]);
});

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

table('attResultByBlocks_(결과 유형이 아닌 빠짐, 결정 81): 모든 블록 → 결석, 첫 블록만·마지막 아님 → 지각, 마지막만 → 조퇴, 가운데만·처음과 끝만 → ""', [
  ['ALL', '결석'], ['18:00-24:00', '결석'], ['18:30-20:00', '지각'], ['18:30-21:30', '지각'], ['21:40-24:00', '조퇴'], ['23:00-23:50', '조퇴'],
  ['20:10-21:30', ''], ['18:30-20:00;23:00-23:50', ''], ['bad', '']
], ([spec, want]) => assert.strictEqual(ctx.attResultByBlocks_(spec, BLOCKS), want));

test('attResultByBlocks_: 블록이 없는 날은 ALL만 결석', () => {
  assert.deepStrictEqual([ctx.attResultByBlocks_('ALL', []), ctx.attResultByBlocks_('18:00-20:00', [])], ['결석', '']);
});

test('attGridCell_ 학습량: 사전 특이사항·고정 일정 블록은 빠짐, 23:00 종료 블록은 23:00까지, 빈칸은 블록 전체', () => {
  const fixed = [{ id: 'f1', student_id: 's1', month: '2027-03', weekday: '월', blocks: '20:10-21:30', code: '학', status: '확정' }];
  const s23 = { exceptions: [EX('기타', '18:30-19:00')], fixedRows: fixed, endType: '23:00' };
  const g = plain(ctx.attGridCell_(PLAN('2027-03-08'), s23, {}));
  assert.deepStrictEqual(g.marks.map((m) => m.code), ['EXC', 'FIXED', 'NONE', 'END']);
  // 블록 90·80·80·50분. 1(기타, 일부만 덮어도 블록 전체)·2(학) 빠짐, 3 공부 80분, 4는 23:00 종료라 23:00까지 = 0분
  assert.deepStrictEqual(g.study, { blocks: 4, studiedBlocks: 2, minutes: 300, studiedMinutes: 80,
    missed: [{ seq: 1, code: 'EXC', text: '기타', minutes: 90 }, { seq: 2, code: 'FIXED', text: '학', minutes: 80 }] });
  const late = plain(ctx.attGridCell_(PLAN('2027-03-08', { blocks: BLOCKS.slice(0, 3).concat([{ seq: 4, start: '22:30', end: '23:50' }]) }), { exceptions: [], fixedRows: [], endType: '23:00' }, {}));
  assert.deepStrictEqual([late.study.studiedMinutes, late.study.minutes], [90 + 80 + 80 + 30, 90 + 80 * 3], '22:30–23:50 블록은 23:00까지 30분');
  const other = plain(ctx.attGridCell_(PLAN('2027-03-08', { blocks: BLOCKS.slice(0, 3).concat([{ seq: 4, start: '22:30', end: '23:50' }]) }), { exceptions: [], fixedRows: [], endType: '23:00' }, { endTime: '23:30' }));
  assert.strictEqual(other.study.studiedMinutes, 90 + 80 * 3, 'endTime을 바꾸면(23:30) END가 아니라 블록 전체');
  assert.deepStrictEqual(cell([]).study, { blocks: 4, studiedBlocks: 4, minutes: 300, studiedMinutes: 300, missed: [] });
  const b4 = (start) => PLAN('2027-03-08', { blocks: BLOCKS.slice(0, 3).concat([{ seq: 4, start, end: '23:50' }]) });
  const at2330 = plain(ctx.attGridCell_(b4('22:30'), { exceptions: [], fixedRows: [], endType: '23:30' }, { endTime: '23:30' }));
  assert.deepStrictEqual([at2330.marks[3].code, at2330.study.studiedMinutes], ['END', 90 + 80 + 80 + 60], '종료 시각 설정(23:30)까지');
  const after = plain(ctx.attGridCell_(b4('23:10'), { exceptions: [], fixedRows: [], endType: '23:00' }, {}));
  assert.deepStrictEqual([after.marks[3].code, after.study.studiedMinutes], ['END', 90 + 80 + 80], '23:00 뒤에 시작하는 마지막 블록은 0분(음수 아님)');
});

test('attGridCell_: 운영 안 하는 날은 marks·results가 비고, 그날 확정 특이사항이 있으면 경고(세지 않음)', () => {
  const c = cell([EX('미인정결석', 'ALL')], PLAN('2027-03-08', { operating: false, blocks: [] }));
  assert.deepStrictEqual([c.operating, c.marks, c.results, c.study], [false, [], [], { blocks: 0, studiedBlocks: 0, minutes: 0, studiedMinutes: 0, missed: [] }]);
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
  const t = plain(ctx.attResultTotals_(cells));
  assert.deepStrictEqual([t['결석'], t['지각'], t['조퇴']], [{ '인정': 2, '미인정': 0 }, { '인정': 1, '미인정': 1 }, { '인정': 0, '미인정': 1 }]);
  // 학습량: 운영한 4일 × 4블록(90+80+80+50 = 300분). 빠진 블록: 3/8 무지 2개, 3/9 병결 4개, 3/10 병지 1개·무조 1개, 3/12 가정 4개
  assert.deepStrictEqual(t['학습량'], { days: 4, blocks: 16, studiedBlocks: 4, minutes: 1200, studiedMinutes: (80 + 50) + (80 + 80),
    missedMinutes: { '무지': 170, '병결': 300, '병지': 90, '무조': 50, '가정': 300 } });
  const zero = plain(ctx.attResultTotals_([]));
  assert.deepStrictEqual(zero, { '결석': { '인정': 0, '미인정': 0 }, '지각': { '인정': 0, '미인정': 0 }, '조퇴': { '인정': 0, '미인정': 0 },
    '학습량': { days: 0, blocks: 0, studiedBlocks: 0, minutes: 0, studiedMinutes: 0, missedMinutes: {} } });
});

/* ───── 총괄 답(f11-notes 질문): 묶음·대체·끝난 기간 ───── */

test('attResultGroupId_: 같은 학생·같은 날 = 한 묶음(하루 1OUT), 날짜·학생이 다르면 다른 묶음', () => {
  assert.strictEqual(ctx.attResultGroupId_('s1', '2027-03-08'), ctx.attResultGroupId_(' s1 ', '2027-03-08'));
  assert.notStrictEqual(ctx.attResultGroupId_('s1', '2027-03-08'), ctx.attResultGroupId_('s1', '2027-03-09'));
  assert.notStrictEqual(ctx.attResultGroupId_('s1', '2027-03-08'), ctx.attResultGroupId_('s2', '2027-03-08'));
  assert.throws(() => ctx.attResultGroupId_('', '2027-03-08'), /학생·날짜/);
  assert.throws(() => ctx.attResultGroupId_('s1', '2027-02-30'), /학생·날짜/);
});

table('attResultReplaces_: 같은 학생·같은 날 살아 있는 행 중 블록이 겹치는 것만 대체, 겹치지 않는 부분 특이사항은 둔다', [
  ['결과 ALL은 모든 행', 'ALL', [EX('학원(보강 포함)', '18:30-20:00', { id: 'a' }), EX('병지각', '21:40-23:00', { id: 'b', status: '요청' })], ['a', 'b']],
  ['기존 ALL은 어떤 결과와도', '18:30-20:00', [EX('가정사유(가족여행 포함)', 'ALL', { id: 'a' })], ['a']],
  ['겹치는 것만', '18:30-20:00', [EX('병지각', '19:00-19:30', { id: 'a' }), EX('학원(보강 포함)', '21:40-23:00', { id: 'b' })], ['a']],
  ['맞닿기만 하면 둘 다 둔다', '18:30-20:00', [EX('학원(보강 포함)', '20:00-21:30', { id: 'a' })], []],
  ['취소·모르는 상태 행·다른 날·다른 학생은 아님', 'ALL', [EX('병결', 'ALL', { id: 'a', status: '취소' }), EX('병결', 'ALL', { id: 'd', status: '반려' }), EX('병결', 'ALL', { id: 'b', date: '2027-03-09' }), EX('병결', 'ALL', { id: 'c', student_id: 's2' })], []],
  ['결과 여러 범위', '18:30-20:00;23:00-23:50', [EX('학원(보강 포함)', '23:00-23:50', { id: 'a' }), EX('학원(보강 포함)', '20:10-21:30', { id: 'b' })], ['a']]
], ([, spec, rows, want]) => assert.deepStrictEqual(plain(ctx.attResultReplaces_(rows, 's1', '2027-03-08', spec)), want));

test('attResultReplaces_: keepIds는 빼고, 결과 블록 표기가 틀리면 Error', () => {
  const rows = [EX('병결', 'ALL', { id: 'a' }), EX('미인정지각', '18:30-20:00', { id: 'b' })];
  assert.deepStrictEqual(plain(ctx.attResultReplaces_(rows, 's1', '2027-03-08', 'ALL', ['a'])), ['b']);
  assert.throws(() => ctx.attResultReplaces_(rows, 's1', '2027-03-08', '20:00-18:00'), /블록 표기/);
  assert.throws(() => ctx.attResultReplaces_(rows, 's1', '2027-03-08', ''), /비어/);
});

const TERM = { start_date: '2027-03-02', end_date: '2027-07-16' };
table('attGridWritable_: 기간 안·오늘 이전 날짜만, 끝난 기간은 종료 후 14일(기본)까지', [
  ['2027-03-08', '2027-03-08', undefined, true, ''],
  ['2027-03-08', '2027-07-30', undefined, true, ''],
  ['2027-07-16', '2027-07-30', undefined, true, ''],
  ['2027-07-16', '2027-07-31', undefined, false, '기간이 끝나고 14일이 지나'],
  ['2027-07-16', '2027-07-20', 3, false, '기간이 끝나고 3일이 지나'],
  ['2027-07-16', '2027-07-16', 0, true, ''],
  ['2027-03-09', '2027-03-08', undefined, false, '아직 오지 않은 날'],
  ['2027-03-01', '2027-03-08', undefined, false, '이 기간의 날짜가 아닙니다'],
  ['2027-07-17', '2027-07-20', undefined, false, '이 기간의 날짜가 아닙니다'],
  ['2027-02-30', '2027-03-08', undefined, false, '날짜 형식']
], ([ymd, today, g, ok, why]) => {
  const r = plain(ctx.attGridWritable_(TERM, ymd, today, g));
  assert.strictEqual(r.ok, ok);
  assert.ok(why ? r.reason.indexOf(why) >= 0 : r.reason === '', r.reason);
});

test('attGridWritable_: graceDays가 음수·소수면 Error, 기간 행이 없으면 거부', () => {
  assert.throws(() => ctx.attGridWritable_(TERM, '2027-03-08', '2027-03-08', -1), /graceDays/);
  assert.throws(() => ctx.attGridWritable_(TERM, '2027-03-08', '2027-03-08', 1.5), /graceDays/);
  assert.strictEqual(ctx.attGridWritable_(null, '2027-03-08', '2027-03-08').ok, false);
});
