/** R3 AttendanceRules — 칸 우선순위·블록 표기·고정 일정 적용월. 표 형식, 가짜 값만. */
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

/* ───── 블록 표기 ───── */
table('parseBlockSpec_: ALL, 여러 범위, 정렬·합치기, 한 자리 시, 24:00', [
  ['ALL', { all: true, ranges: [], errors: [] }],
  [' all ', { all: true, ranges: [], errors: [] }],
  ['15:00-24:00', { all: false, ranges: [{ start: '15:00', end: '24:00' }], errors: [] }],
  ['20:00-22:00;18:00-20:00', { all: false, ranges: [{ start: '18:00', end: '22:00' }], errors: [] }],
  ['18:00-19:00; 21:00-22:00', { all: false, ranges: [{ start: '18:00', end: '19:00' }, { start: '21:00', end: '22:00' }], errors: [] }],
  ['18:00-21:00;19:00-20:00', { all: false, ranges: [{ start: '18:00', end: '21:00' }], errors: [] }],
  ['9:00-12:00', { all: false, ranges: [{ start: '09:00', end: '12:00' }], errors: [] }],
  ['18:00 – 20:00', { all: false, ranges: [{ start: '18:00', end: '20:00' }], errors: [] }],
  ['18:00-20:00;', { all: false, ranges: [{ start: '18:00', end: '20:00' }], errors: [] }]
], ([spec, want]) => assert.deepStrictEqual(plain(ctx.parseBlockSpec_(spec)), want));

table('parseBlockSpec_: 잘못된 조각은 errors(나머지는 살림)', [
  ['', 0], [null, 0], ['아무거나', 0], ['20:00-18:00', 0], ['18:00-18:00', 0], ['24:00-24:00', 0],
  ['18:00-25:00', 0], ['1800-2000', 0], ['18:00-20:00;xx', 1], [';', 0]
], ([spec, nRanges]) => {
  const p = plain(ctx.parseBlockSpec_(spec));
  assert.strictEqual(p.all, false);
  assert.strictEqual(p.ranges.length, nRanges);
  assert.ok(p.errors.length >= 1);
});

table('formatBlockSpec_: 저장용 정규 표기', [
  [{ all: true, ranges: [] }, 'ALL'],
  [{ all: false, ranges: [{ start: '20:00', end: '22:00' }, { start: '18:00', end: '20:00' }] }, '18:00-22:00'],
  [{ all: false, ranges: [{ start: '9:00', end: '12:00' }, { start: '14:00', end: '15:30' }] }, '09:00-12:00;14:00-15:30'],
  [{ all: false, ranges: [] }, ''], [null, '']
], ([parsed, want]) => assert.strictEqual(ctx.formatBlockSpec_(parsed), want));

test('formatBlockSpec_ ∘ parseBlockSpec_ 왕복', () => {
  for (const s of ['ALL', '15:00-24:00', '18:00-19:00;21:00-22:00']) {
    assert.strictEqual(ctx.formatBlockSpec_(ctx.parseBlockSpec_(s)), s);
  }
});

const B = (start, end) => ({ seq: 1, start, end });
table('blockSpecCovers_: 겹침 판정(맞닿음은 아님), "15:00부터 귀가"', [
  ['ALL', B('18:00', '20:00'), true],
  ['15:00-24:00', B('18:00', '20:00'), true],
  ['15:00-24:00', B('14:00', '15:30'), true],      // 일요일 14–15:30 도중에 귀가
  ['15:00-24:00', B('09:00', '12:00'), false],
  ['15:00-24:00', B('14:00', '15:00'), false],     // 맞닿음
  ['18:00-20:00', B('20:00', '22:00'), false],
  ['19:00-19:30', B('18:00', '20:00'), true],      // 블록 안의 짧은 시간
  ['21:30-24:00', B('22:00', '24:00'), true],
  ['18:00-19:00;21:00-22:00', B('19:00', '21:00'), false],
  ['18:00-19:00;21:00-22:00', B('20:00', '22:00'), true],
  ['잘못', B('18:00', '20:00'), false],
  ['', B('18:00', '20:00'), false],
  ['18:00-20:00', B('bad', '20:00'), false]
], ([spec, block, want]) => {
  assert.strictEqual(ctx.blockSpecCovers_(spec, block), want);
  assert.strictEqual(ctx.blockSpecCovers_(ctx.parseBlockSpec_(spec), block), want, '해석 결과로도 같음');
});

/* ───── 고정 일정 적용월 ───── */
const FX = (student_id, month, weekday, blocks, code, status, extra) =>
  Object.assign({ id: [student_id, month, weekday, code, status].join('/'), student_id, month, weekday, blocks, code, status }, extra || {});
const FIXED = [
  FX('s1', '2027-02', '월', '18:00-20:00', '학', '확정'),
  FX('s1', '2027-02', '수', 'ALL', '가', '확정'),
  FX('s1', '2027-03', '월', '20:00-22:00', '학', '확정'),
  FX('s1', '2027-04', '월', 'ALL', '학', '동의'),      // 4월은 아직 확정 전
  FX('s1', '2027-05', '화', 'ALL', '가', '확정'),
  FX('s1', '2027-03', '화', 'ALL', '가', '취소'),
  FX('s2', '2027-03', '월', 'ALL', '학', '확정'),
  FX('s1', '2027-3', '목', 'ALL', '학', '확정')          // 적용월 형식 오류
];
table('effectiveFixedRows_: 확정된 것 중 가장 최근 적용월(확정 전에는 기존 시간표 유지)', [
  ['2027-01-31', []],
  ['2027-02-01', ['s1/2027-02/월/학/확정', 's1/2027-02/수/가/확정']],
  ['2027-02-28', ['s1/2027-02/월/학/확정', 's1/2027-02/수/가/확정']],
  ['2027-03-01', ['s1/2027-03/월/학/확정']],               // 3월이 확정되면 2월 수요일 '가'도 끝
  ['2027-04-15', ['s1/2027-03/월/학/확정']],               // 4월은 '동의'뿐 → 3월 유지
  ['2027-05-03', ['s1/2027-05/화/가/확정']],
  ['2028-01-01', ['s1/2027-05/화/가/확정']]
], ([d, want]) => assert.deepStrictEqual(plain(ctx.effectiveFixedRows_(FIXED, 's1', d)).map((r) => r.id), want));

test('effectiveFixedRows_: 한 달의 일부 행만 확정되었으면(나머지 제출·동의) 앞 달을 유지, 반려·취소만 남으면 바꾼다', () => {
  const rows = [
    FX('s1', '2027-03', '월', '18:00-20:00', '학', '확정'), FX('s1', '2027-03', '수', '18:00-20:00', '학', '확정'),
    FX('s1', '2027-04', '월', '18:00-20:00', '학', '확정'), FX('s1', '2027-04', '수', '18:00-22:00', '학', '동의')
  ];
  const ids = (d, r) => plain(ctx.effectiveFixedRows_(r || rows, 's1', d)).map((x) => x.id);
  assert.deepStrictEqual(ids('2027-04-07'), ['s1/2027-03/월/학/확정', 's1/2027-03/수/학/확정']);
  const done = rows.map((r) => r.status === '동의' ? Object.assign({}, r, { status: '확정', id: 'w' }) : r);
  assert.deepStrictEqual(ids('2027-04-07', done), ['s1/2027-04/월/학/확정', 'w']);
  const rejected = rows.map((r) => r.status === '동의' ? Object.assign({}, r, { status: '반려' }) : r);
  assert.deepStrictEqual(ids('2027-04-07', rejected), ['s1/2027-04/월/학/확정']);
});

test('effectiveFixedRows_: 연말을 넘어 앞 달 유지(2026-12 → 2027-01), 다른 학생 행은 안 섞임(가정: 행 없는 달은 앞 달 유지)', () => {
  const rows = [FX('s1', '2026-12', '월', 'ALL', '가', '확정'), FX('s2', '2027-01', '월', 'ALL', '학', '확정')];
  assert.deepStrictEqual(plain(ctx.effectiveFixedRows_(rows, 's1', '2027-01-04')).map((x) => x.id), ['s1/2026-12/월/가/확정']);
  assert.deepStrictEqual(plain(ctx.effectiveFixedRows_(rows, 's2', '2026-12-28')), []);
});

/* ───── resolveCell_ 우선순위 ───── */
const EX = (id, blocks, type, status, extra) => Object.assign({ id, student_id: 's1', date: '2027-03-01', blocks, type, status,
  confirmed_at: '2027-02-27T10:00:00', updated_at: '2027-02-27T10:00:00' }, extra || {});
const LAST = B('22:00', '24:00');
function cell(over) {
  return plain(ctx.resolveCell_(Object.assign({ block: B('18:00', '20:00'), isLastBlock: false, dayType: 'mon_thu',
    weekdayKo: '월', exceptions: [], fixedRows: [], endType: '23:50', opts: {} }, over)));
}
const FX_MON = [FX('s1', '2027-03', '월', 'ALL', '학', '확정')];

table('resolveCell_: 확정 특이사항 > 고정 일정 > 23:00 종료 > 빈칸', [
  [{ exceptions: [EX('e1', 'ALL', '병결', '확정')], fixedRows: FX_MON, endType: '23:00', block: LAST, isLastBlock: true }, 'EXC', '병결'],
  [{ fixedRows: FX_MON, endType: '23:00', block: LAST, isLastBlock: true }, 'FIXED', '학'],
  [{ endType: '23:00', block: LAST, isLastBlock: true }, 'END', '정상 종료'],
  [{ endType: '23:50', block: LAST, isLastBlock: true }, 'NONE', ''],
  [{}, 'NONE', '']
], ([over, code, text]) => {
  const r = cell(over);
  assert.strictEqual(r.code, code);
  assert.strictEqual(r.text, text);
});

table("resolveCell_: '요청'·'취소'·다른 블록 특이사항은 무시", [
  [[EX('e1', 'ALL', '병결', '요청')], 'NONE'],
  [[EX('e1', 'ALL', '병결', '취소')], 'NONE'],
  [[EX('e1', 'ALL', '병결', ' 확정 ')], 'EXC'],
  [[EX('e1', '20:00-22:00', '병결', '확정')], 'NONE'],
  [[EX('e1', '15:00-24:00', '학원', '확정')], 'EXC'],
  [[EX('e1', '잘못된 표기', '병결', '확정')], 'NONE']
], ([exc, code]) => assert.strictEqual(cell({ exceptions: exc }).code, code));

test('resolveCell_: 확정 특이사항 2건이면 최근 확정 1건 + " 외 1"(가정), exceptionId는 그 건', () => {
  const exc = [
    EX('old', 'ALL', '병결', '확정', { confirmed_at: '2027-02-27T10:00:00' }),
    EX('new', '18:00-19:00', '학원(보강 포함)', '확정', { confirmed_at: '2027-02-28T09:00:00' }),
    EX('req', 'ALL', '가정사유', '요청', { confirmed_at: '2027-03-01T09:00:00' })
  ];
  assert.deepStrictEqual(cell({ exceptions: exc }), { code: 'EXC', text: '학원 외 1', exceptionId: 'new', more: 1 });
  assert.deepStrictEqual(cell({ exceptions: exc.slice().reverse() }), { code: 'EXC', text: '학원 외 1', exceptionId: 'new', more: 1 });
  // 둘째 블록에는 'old'만 겹친다
  assert.deepStrictEqual(cell({ exceptions: exc, block: B('20:00', '22:00') }), { code: 'EXC', text: '병결', exceptionId: 'old', more: 0 });
  // 확정 시각이 같으면 updated_at, 그것도 같으면 나중 행
  const tie = [EX('a', 'ALL', '병결', '확정'), EX('b', 'ALL', '기타', '확정')];
  assert.strictEqual(cell({ exceptions: tie }).exceptionId, 'b');
  const tie2 = [EX('a', 'ALL', '병결', '확정', { updated_at: '2027-02-28T00:00:00' }), EX('b', 'ALL', '기타', '확정')];
  assert.strictEqual(cell({ exceptions: tie2 }).exceptionId, 'a');
});

table('resolveCell_: 유형 약어(설정의 괄호 설명 포함 이름도), 없는 유형은 이름 그대로', [
  ['병결', '병결'], ['병지각', '병지'], ['병조퇴', '병조'], ['가정사유(가족여행 포함)', '가정'], ['가정사유', '가정'],
  ['학원(보강 포함)', '학원'], ['학사 외 프로그램', '외부'], ['학사 내 프로그램(파워클래스·면접특강 등)', '내부'],
  ['미인정지각', '무지'], ['미인정조퇴', '무조'], ['미인정결석', '무결'], ['기타', '기타'],
  ['새 유형(설명)', '새 유형'], ['봉사활동', '봉사활동']
], ([type, want]) => assert.strictEqual(cell({ exceptions: [EX('e', 'ALL', type, '확정')] }).text, want));

test('resolveCell_: 실제 설정처럼 약어표 키에 괄호 설명이 있어도, 괄호가 다른 옛 행·괄호 없는 행이 약어로 나온다', () => {
  const settingMap = { '병결': '병결', '가정사유(가족여행 포함)': '가정', '학원(보강 포함)': '학원',
    '학사 내 프로그램(파워클래스·면접특강 등)': '내부', '미인정결석': '무결' };
  for (const [type, want] of [['가정사유', '가정'], ['가정사유(가족·여행 포함)', '가정'], ['학사 내 프로그램(면접특강)', '내부'],
    ['학원(보강 포함)', '학원'], ['미인정결석', '무결'], ['없는 유형(설명)', '없는 유형']]) {
    assert.strictEqual(cell({ exceptions: [EX('e', 'ALL', type, '확정')], opts: { typeShort: settingMap } }).text, want, type);
  }
});

test('resolveCell_: opts.typeShort를 주면 그것을 쓴다(관리자가 바꾼 약어)', () => {
  const opts = { typeShort: { '병결': '病', '학원(보강 포함)': '학' } };
  assert.strictEqual(cell({ exceptions: [EX('e', 'ALL', '병결', '확정')], opts }).text, '病');
  assert.strictEqual(cell({ exceptions: [EX('e', 'ALL', '학원(보강 포함)', '확정')], opts }).text, '학');
  assert.strictEqual(cell({ exceptions: [EX('e', 'ALL', '병지각', '확정')], opts }).text, '병지각');
});

table('resolveCell_: 고정 일정은 확정·같은 요일·겹치는 블록·코드 학/가만', [
  [[FX('s1', '2027-03', '월', '18:00-20:00', '학', '확정')], '월', 'FIXED'],
  [[FX('s1', '2027-03', '월', '18:00-20:00', '학', '확정')], '화', 'NONE'],
  [[FX('s1', '2027-03', '월', '20:00-22:00', '학', '확정')], '월', 'NONE'],
  [[FX('s1', '2027-03', '월', 'ALL', '학', '동의')], '월', 'NONE'],
  [[FX('s1', '2027-03', '월', 'ALL', '학', '반려')], '월', 'NONE'],
  [[FX('s1', '2027-03', '월', 'ALL', 'X', '확정')], '월', 'NONE'],
  [[FX('s1', '2027-03', '월', 'ALL', '가', '확정')], '월', 'FIXED']
], ([rows, wk, code]) => assert.strictEqual(cell({ fixedRows: rows, weekdayKo: wk }).code, code));

test('resolveCell_: 같은 칸에 고정 일정이 둘이면 최근 확정(teacher_confirmed_at)', () => {
  const rows = [FX('s1', '2027-03', '월', 'ALL', '학', '확정', { teacher_confirmed_at: '2027-02-28T10:00:00' }),
    FX('s1', '2027-03', '월', 'ALL', '가', '확정', { teacher_confirmed_at: '2027-02-27T10:00:00' })];
  assert.strictEqual(cell({ fixedRows: rows }).text, '학');
  assert.strictEqual(cell({ fixedRows: rows.slice().reverse() }).text, '학');
});

table('resolveCell_: 23:00 종료 "정상 종료"는 월~목 마지막 블록만(금·토·일 아님, 가정)', [
  ['mon_thu', true, LAST, '23:00', 'END'],
  ['mon_thu', false, B('20:00', '22:00'), '23:00', 'NONE'],
  ['fri', true, B('22:00', '23:00'), '23:00', 'NONE'],
  ['sat', true, B('15:30', '17:00'), '23:00', 'NONE'],
  ['sun', true, B('20:30', '22:00'), '23:00', 'NONE'],
  ['mon_thu', true, LAST, '23:50', 'NONE'],
  ['mon_thu', true, LAST, '', 'NONE'],
  ['mon_thu', true, LAST, ' 23:00 ', 'END'],
  // 날짜별 종료를 22:00으로 당겨 마지막 블록이 20–22이면 23:00 종료 학생도 끝까지 하므로 표시 안 함(가정)
  ['mon_thu', true, B('20:00', '22:00'), '23:00', 'NONE'],
  // 특별 요일 유형은 실제 요일로 판정(가정): 월요일 exam → 표시, 금요일 exam → 표시 안 함
  ['exam', true, LAST, '23:00', 'END'],
  ['exam@금', true, LAST, '23:00', 'NONE'],
  ['mon_thu', true, LAST, '23:00:00', 'END']
], ([dayType, isLast, block, endType, code]) => {
  const [dt, wk] = dayType.split('@');
  const r = cell({ dayType: dt, weekdayKo: wk || '월', isLastBlock: isLast, block, endType });
  assert.strictEqual(r.code, code);
  if (code === 'END') assert.deepStrictEqual(r, { code: 'END', text: '정상 종료', exceptionId: '', more: 0 });
});

table('resolveCell_: 그날 종료(dayEnd)가 23:00 이하이면 23:00 종료 학생도 표시 안 함(가정)', [
  ['23:50', 'END'], ['23:01', 'END'], ['23:00', 'NONE'], ['22:30', 'NONE'], ['', 'END'], [undefined, 'END']
], ([dayEnd, code]) => assert.strictEqual(cell({ isLastBlock: true, block: LAST, endType: '23:00', dayEnd }).code, code));

test('resolveCell_: 설정에서 쪼갠 요일 목록의 공백은 무시', () => {
  const opts = { endTypeDayTypes: 'mon_thu, fri'.split(',') };
  assert.strictEqual(cell({ dayType: 'fri', weekdayKo: '금', isLastBlock: true, block: B('22:00', '23:30'), endType: '23:00', opts }).code, 'END');
});

test('resolveCell_: opts로 종료 요일·시각·문구를 바꿀 수 있다', () => {
  const opts = { endTypeDayTypes: ['mon_thu', 'fri'], endLabel: '23시 귀가' };
  assert.strictEqual(cell({ dayType: 'fri', isLastBlock: true, block: B('22:00', '23:30'), endType: '23:00', opts }).text, '23시 귀가');
  assert.strictEqual(cell({ isLastBlock: true, block: LAST, endType: '23:00', opts: { endTime: '22:30' } }).code, 'NONE');
  assert.strictEqual(cell({ isLastBlock: true, block: LAST, endType: '22:30', opts: { endTime: '22:30' } }).code, 'END');
});

test('resolveCell_: 빈 입력에도 멈추지 않는다', () => {
  assert.deepStrictEqual(plain(ctx.resolveCell_({})), { code: 'NONE', text: '', exceptionId: '', more: 0 });
  assert.deepStrictEqual(plain(ctx.resolveCell_()), { code: 'NONE', text: '', exceptionId: '', more: 0 });
  assert.strictEqual(cell({ exceptions: [null, EX('e', 'ALL', '병결', '확정')], fixedRows: [null] }).code, 'EXC');
});

/* ───── resolveStudentDay_ (resolveDayPlan_와 조합) ───── */
const DEFAULTS = { mon_thu: { start: '18:30', end: '23:50' }, fri: { start: '18:30', end: '23:00' },
  sat: { start: '09:00', end: '17:00' }, sun: { start: '14:00', end: '22:00' } };
const blk = (day_type, seq, start, end) => ({ term_type: '학기', day_type, seq: String(seq), start, end, label: '', status: '유효' });
const BLOCKS = [
  blk('mon_thu', 1, '18:00', '20:00'), blk('mon_thu', 2, '20:00', '22:00'), blk('mon_thu', 3, '22:00', '24:00'),
  blk('fri', 1, '18:00', '19:30'), blk('fri', 2, '19:30', '22:00'), blk('fri', 3, '22:00', '23:00'),
  blk('sun', 1, '14:00', '15:30'), blk('sun', 2, '15:30', '17:00'), blk('sun', 3, '19:00', '20:30'), blk('sun', 4, '20:30', '22:00')
];
const plan = (d, ds) => ctx.resolveDayPlan_(d, { termType: '학기', daySchedule: ds || null, blocks: BLOCKS, defaults: DEFAULTS });
const marks = (p, s) => plain(ctx.resolveStudentDay_(p, s, {})).map((m) => m.code + ':' + m.text);

test('resolveStudentDay_: 월요일(2027-03-01) 학원 고정 + 23:00 종료', () => {
  const fx = ctx.effectiveFixedRows_(FIXED, 's1', '2027-03-01');   // 3월 월요일 20–22 '학'
  assert.deepStrictEqual(marks(plan('2027-03-01'), { exceptions: [], fixedRows: fx, endType: '23:00' }),
    ['NONE:', 'FIXED:학', 'END:정상 종료']);
});

test('resolveStudentDay_: 특이사항은 그날 것만, 15:00부터 귀가는 모든 저녁 블록', () => {
  const exc = [EX('e1', '15:00-24:00', '학원(보강 포함)', '확정'), EX('e2', 'ALL', '병결', '확정', { date: '2027-03-02' })];
  assert.deepStrictEqual(marks(plan('2027-03-01'), { exceptions: exc, fixedRows: [], endType: '23:00' }),
    ['EXC:학원', 'EXC:학원', 'EXC:학원']);
  assert.deepStrictEqual(marks(plan('2027-03-02'), { exceptions: exc, fixedRows: [], endType: '23:50' }),
    ['EXC:병결', 'EXC:병결', 'EXC:병결']);
});

test('resolveStudentDay_: 날짜가 빈 특이사항은 어느 날에도 찍히지 않는다', () => {
  const exc = [EX('e1', 'ALL', '미인정결석', '확정', { date: '' }), EX('e2', 'ALL', '미인정결석', '확정', { date: ' ' })];
  assert.deepStrictEqual(marks(plan('2027-03-03'), { exceptions: exc, endType: '23:50' }), ['NONE:', 'NONE:', 'NONE:']);
  const exc2 = [EX('e3', 'ALL', '병결', '확정', { date: ' 2027-03-03 ' })];
  assert.deepStrictEqual(marks(plan('2027-03-03'), { exceptions: exc2, endType: '23:50' }), ['EXC:병결', 'EXC:병결', 'EXC:병결']);
});

test('resolveStudentDay_: 종료를 22:30으로 당긴 날은 22–24 블록이 남아도 정상 종료 표시 안 함', () => {
  assert.deepStrictEqual(marks(plan('2027-03-17', { date: '2027-03-17', end: '22:30' }), { endType: '23:00' }), ['NONE:', 'NONE:', 'NONE:']);
  assert.deepStrictEqual(marks(plan('2027-03-17', { date: '2027-03-17', end: '23:30' }), { endType: '23:00' }), ['NONE:', 'NONE:', 'END:정상 종료']);
});

test('resolveStudentDay_: 금요일은 23:00 종료 학생도 표시 없음, 일요일 블록 4개', () => {
  assert.deepStrictEqual(marks(plan('2027-03-05'), { endType: '23:00' }), ['NONE:', 'NONE:', 'NONE:']);
  assert.strictEqual(marks(plan('2027-03-07'), { endType: '23:00' }).length, 4);
});

test('resolveStudentDay_: 운영 안 하는 날은 [], 종료를 당긴 날은 남은 블록만', () => {
  assert.deepStrictEqual(marks(plan('2027-03-03', { date: '2027-03-03', operating: 'FALSE' }), { endType: '23:00' }), []);
  assert.deepStrictEqual(marks(plan('2027-03-03', { date: '2027-03-03', end: '22:00' }), { endType: '23:00' }), ['NONE:', 'NONE:']);
  assert.deepStrictEqual(plain(ctx.resolveStudentDay_(null, {}, {})), []);
});

test('resolveStudentDay_: 요일 유형을 바꾼 날도 고정 일정은 실제 달력 요일로(수요일을 금요일 일정으로)', () => {
  const fx = [FX('s1', '2027-03', '수', '18:00-19:30', '가', '확정')];
  const p = plan('2027-03-03', { date: '2027-03-03', day_type: 'fri' });
  assert.deepStrictEqual(marks(p, { fixedRows: fx, endType: '23:00' }), ['FIXED:가', 'NONE:', 'NONE:']);
});

test('resolveStudentDay_: 결과 모양 {seq, code, text, exceptionId, more}, seq는 plan 순서', () => {
  const r = plain(ctx.resolveStudentDay_(plan('2027-03-01'), { exceptions: [EX('e1', '20:00-22:00', '병결', '확정')] }, {}));
  assert.deepStrictEqual(r, [
    { seq: 1, code: 'NONE', text: '', exceptionId: '', more: 0 },
    { seq: 2, code: 'EXC', text: '병결', exceptionId: 'e1', more: 0 },
    { seq: 3, code: 'NONE', text: '', exceptionId: '', more: 0 }]);
});
