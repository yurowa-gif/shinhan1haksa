/**
 * D4 증명 테스트(소유: DESIGN): 출석부 HTML 렌더러 src/print/AttendanceSheetHtml.gs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, loadGs, plain, ROOT } = require('../helpers/harness');
const { validateSheetModel } = require('./sheet-model-shape');

const ctx = loadGs(['src/print/AttendanceSheetHtml.gs']);
const DAYS = ['mon_thu', 'fri', 'sat', 'sun'];
const fixture = (d) => JSON.parse(fs.readFileSync(path.join(ROOT, 'design/fixtures/sheet-model.' + d + '.json'), 'utf8'));
const count = (s, sub) => s.split(sub).length - 1;
const seats = (m) => m.spaces.reduce((n, sp) => n + sp.cells.filter((c) => c.kind === 'seat').length, 0);

test('픽스처 4종이 sheet-model 계약 모양을 지킨다(블록 수 3/3/3/4)', () => {
  const blocks = {};
  DAYS.forEach((d) => {
    const m = fixture(d);
    assert.deepStrictEqual(validateSheetModel(m), [], d);
    blocks[d] = m.blocks.length;
  });
  assert.deepStrictEqual(blocks, { mon_thu: 3, fri: 3, sat: 3, sun: 4 });
});

test('픽스처 블록은 기본 블록(Schema.gs defaultBlockRows_)과 같다(시각·라벨)', () => {
  const rows = plain(loadGs(['src/Schema.gs']).defaultBlockRows_());
  DAYS.forEach((d) => {
    const want = rows.filter((r) => r.day_type === d).map((r) => ({ seq: Number(r.seq), start: r.start, end: r.end, label: r.label }));
    assert.deepStrictEqual(fixture(d).blocks, want, d);
  });
  assert.strictEqual(fixture('fri').blocks[0].start, '18:00', '금요일 첫 블록은 18:00(실제 시작 18:30은 날짜별 일정으로 따로)');
});

test('픽스처는 design/preview/fixtures.js 가 만든 것과 같다(손으로 고치지 않는다)', () => {
  const { buildModel } = require('../../design/preview/fixtures');
  DAYS.forEach((d) => assert.deepStrictEqual(fixture(d), plain(buildModel(d)), d));
});

test('픽스처 구성: 1층 146석 + SA 남 17·여 34, 같은 30명 이름 반복, 공석·기둥·비상문·창문 포함', () => {
  const m = fixture('mon_thu');
  const byName = {};
  m.spaces.forEach((sp) => { byName[sp.name] = sp.cells.filter((c) => c.kind === 'seat').length; });
  assert.deepStrictEqual(byName, { '1층 자습실': 146, SA1실: 8, SA2실: 9, SA3실: 8, SA4실: 8, SA5실: 9, SA6실: 9 });
  const perLine = {};
  m.spaces[0].cells.filter((c) => c.kind === 'seat').forEach((c) => { perLine[c.col] = (perLine[c.col] || 0) + 1; });
  assert.deepStrictEqual(Object.keys(perLine).map(Number).sort((a, b) => a - b).map((c) => perLine[c]), [19, 17, 18, 19, 19, 20, 20, 14],
    '1층 줄별 좌석 수(실제 출석부 4.1: 19·17·18·19·19·20·20·14)');
  assert.deepStrictEqual(Object.keys(perLine).map(Number).sort((a, b) => a - b), [1, 3, 4, 6, 7, 9, 10, 12], '홑줄 | 짝줄×3 | 홑줄(통로 열 2·5·8·11)');
  const kinds = new Set(m.spaces[0].cells.map((c) => c.kind));
  ['seat', 'pillar', 'door', 'window'].forEach((k) => assert.ok(kinds.has(k), k));
  assert.ok(m.spaces.some((sp) => sp.cells.some((c) => c.vacant)));
  const names = new Set();
  m.spaces.forEach((sp) => sp.cells.forEach((c) => { if (c.occupant) names.add(c.occupant.name); }));
  assert.ok(names.size <= 30, '새 가짜 인물을 만들지 않는다: ' + names.size);
});

test('픽스처 4종이 모두 렌더되고 페이지 수 = 공간 수(운영하는 날)', () => {
  DAYS.forEach((d) => {
    const m = fixture(d);
    const html = ctx.printRenderSheet_(m, {});
    assert.ok(html.indexOf('<!DOCTYPE html>') === 0 && html.endsWith('</html>'), d);
    assert.strictEqual(count(html, '<section class="page"'), m.spaces.length, d);
    assert.ok(html.indexOf('@page { size: A4 landscape; margin: 8mm; }') > 0);
  });
});

test('쪽 나눔: 마지막 쪽만 page-break-after:auto, 나머지는 always', () => {
  const html = ctx.printRenderSheet_(fixture('fri'), {});
  assert.strictEqual(count(html, 'page-break-after:always'), 6);
  assert.strictEqual(count(html, 'page-break-after:auto'), 1);
});

test('좌석 하나 = 이름 칸 1개 + 표시 칸 blocks.length개, 줄 머리는 줄마다 하나', () => {
  DAYS.forEach((d) => {
    const m = fixture(d);
    const html = ctx.printRenderSheet_(m, {});
    const n = seats(m);
    const lines = m.spaces.reduce((k, sp) => k + new Set(sp.cells.filter((c) => c.kind === 'seat').map((c) => c.col)).size, 0);
    assert.strictEqual(count(html, '<td class="n"'), n, d + ' 이름 칸');
    assert.strictEqual(count(html, '<td class="m"'), n * m.blocks.length, d + ' 표시 칸');
    assert.strictEqual(count(html, '<td class="h"'), lines, d + ' 줄 머리');
  });
});

/** 첫 쪽 격자 표의 n행째(0=줄 머리, 1=첫 좌석 행) HTML */
const gridRows = (html) => {
  const first = html.slice(html.indexOf('<section class="page"'), html.indexOf('</section>'));
  return first.slice(first.indexOf('</colgroup>')).split('<tr ').slice(1);
};
const classSeq = (tr) => [...tr.matchAll(/<td class="(\w)"/g)].map((m) => m[1]).join('');

test('실제 모양: 홑줄 | 짝줄×3 | 홑줄. 짝줄은 이름 칸이 등을 맞대고 표시 칸이 바깥쪽, 홑줄은 표시 칸이 가운데 쪽', () => {
  const row1 = classSeq(gridRows(ctx.printRenderSheet_(fixture('mon_thu'), {}))[1]);
  // n=이름 m=표시 g=통로. 3블록: 줄1 nmmm | 줄2 mmmn 줄3 nmmm | 줄4 mmmn 줄5 nmmm | 줄6 mmmn 줄7 nmmm | 줄8 mmmn
  assert.strictEqual(row1, 'nmmm' + 'g' + 'mmmn' + 'nmmm' + 'g' + 'mmmn' + 'nmmm' + 'g' + 'mmmn' + 'nmmm' + 'g' + 'mmmn');
  const sun = classSeq(gridRows(ctx.printRenderSheet_(fixture('sun'), {}))[1]);
  assert.ok(sun.startsWith('nmmmm' + 'g' + 'mmmmn' + 'nmmmm'), '일요일은 표시 칸 4개: ' + sun);
});

test('표시 칸 순서는 어느 줄이든 왼쪽→오른쪽이 ①②③ (머리말에도 그렇게 적힌다)', () => {
  const m = fixture('mon_thu');
  const space = m.spaces[0];
  const marks = (c) => c.marks.map((x) => x.text);
  const left = space.cells.find((c) => c.row === 1 && c.col === 3);   // 짝줄 왼쪽(표시 칸이 왼쪽)
  left.marks = [{ seq: 1, code: 'EXC', text: '가나' }, { seq: 2, code: 'NONE', text: '' }, { seq: 3, code: 'EXC', text: '다라' }];
  const row1 = gridRows(ctx.printRenderSheet_(m, {}))[1];
  const order = [...row1.matchAll(/<td class="m"[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]);
  assert.strictEqual(order.indexOf('가나') < order.indexOf('다라'), true, JSON.stringify(marks(left)));
  assert.ok(ctx.printRenderSheet_(m, {}).indexOf('표시 칸(왼쪽→오른쪽)') > 0);
});

test('줄 머리 "공석 수/좌석 수"가 줄마다 맞다(1층: 줄별 좌석 수 19·17·18·19·19·20·20·14)', () => {
  const m = fixture('mon_thu');
  const space = m.spaces[0];
  const want = [1, 3, 4, 6, 7, 9, 10, 12].map((col) => {
    const cells = space.cells.filter((c) => c.kind === 'seat' && c.col === col);
    return cells.filter((c) => c.vacant).length + '/' + cells.length;
  });
  assert.deepStrictEqual(want.map((x) => x.split('/')[1]), ['19', '17', '18', '19', '19', '20', '20', '14']);
  assert.ok(want.some((x) => !x.startsWith('0/')), '공석이 있는 줄이 있다');
  const head = gridRows(ctx.printRenderSheet_(m, {}))[0];
  const got = [...head.matchAll(/<td class="h"[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]);
  assert.deepStrictEqual(got, want);
});

test('공석은 "공석"으로 적힌다(설정으로 바꿀 수 있다)', () => {
  const m = fixture('mon_thu');
  const vacant = m.spaces.reduce((k, sp) => k + sp.cells.filter((c) => c.vacant).length, 0);
  assert.ok(vacant > 5);
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, '>공석</td>'), vacant);
  const custom = ctx.printRenderSheet_(m, { vacantLabel: '빈자리' });
  assert.strictEqual(count(custom, '>빈자리</td>'), vacant);
  assert.strictEqual(count(custom, '>공석</td>'), 0);
});

test('머리말: 가운데 제목, 오른쪽 날짜·요일, 왼쪽 공간 이름·근무 빈칸, 표시 칸 순서·범례', () => {
  const html = ctx.printRenderSheet_(fixture('mon_thu'), {});
  ['신한학사 출석부', '2027년 3월 3일(수)', '1층 자습실', 'SA6실', '근무: ________________', '①18–20', '②20–22', '③22–24', '표시 칸(왼쪽→오른쪽)',
    '<b>○</b>&nbsp;출석', '<b>×</b>&nbsp;결석', '<b>△</b>&nbsp;지각', '조퇴(아래 칸에 질병·가정사유)', '<b>학</b>&nbsp;학원', '<b>가</b>&nbsp;가정'
  ].forEach((t) => assert.ok(html.indexOf(t) >= 0, t));
  const sun = ctx.printRenderSheet_(fixture('sun'), {});
  assert.ok(sun.indexOf('2027년 3월 7일(일)') >= 0 && sun.indexOf('④20:30–22') >= 0);
  const m = fixture('fri'); m.dutyNames = ['가짜교사1', '가짜교사2'];
  const duty = ctx.printRenderSheet_(m, {});
  assert.ok(duty.indexOf('근무: 가짜교사1, 가짜교사2') >= 0 && duty.indexOf('근무: ____') < 0);
});

test('배정 안 된 학생은 첫 쪽 아래에만 나온다', () => {
  const html = ctx.printRenderSheet_(fixture('mon_thu'), {});
  assert.strictEqual(count(html, '자리 배정 안 됨'), 1);
  assert.ok(html.indexOf('3. 박다솜</div>') > 0);
  const m = fixture('mon_thu'); m.unseated = [];
  assert.strictEqual(count(ctx.printRenderSheet_(m, {}), '자리 배정 안 됨'), 0);
});

test('이스케이프: <script>·&·따옴표가 모든 글자 자리에서 이스케이프된다', () => {
  const m = fixture('mon_thu');
  const evil = '<script>alert("x")</script>&\'';
  m.title = evil; m.dutyNames = [evil]; m.blocks[0].label = evil; m.legend[0].text = evil; m.unseated = [{ display: '1. ' + evil }];
  m.spaces[0].name = evil;
  const seat = m.spaces[0].cells.find((c) => c.kind === 'seat' && c.occupant);
  seat.occupant = { grade: 1, name: evil, display: '1. ' + evil };
  seat.marks[0] = { seq: 1, code: 'EXC', text: evil };
  const html = ctx.printRenderSheet_(m, {});
  assert.ok(html.indexOf('<script') < 0, '날 <script');
  assert.ok(html.indexOf('alert("x")') < 0, '날 따옴표');
  assert.ok(count(html, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;') >= 8);
  assert.strictEqual(ctx.printEsc_(null), '');
  assert.strictEqual(ctx.printEsc_('a&b<c>"d\''), 'a&amp;b&lt;c&gt;&quot;d&#39;');
});

test('PDF 변환기 호환: flex·grid·웹폰트·외부 주소·스크립트·링크가 없다', () => {
  DAYS.forEach((d) => {
    const html = ctx.printRenderSheet_(fixture(d), {});
    ['display:flex', 'display:grid', '@font-face', '@import', 'http://', 'https://', '<script', '<link', '<img', 'url('].forEach((bad) => {
      assert.ok(html.indexOf(bad) < 0, d + ': ' + bad);
    });
  });
});

test('글자 크기: 모든 font-size 가 7pt 이상, 칸 이름은 8pt 이상(1층·일요일 포함)', () => {
  DAYS.forEach((d) => {
    const html = ctx.printRenderSheet_(fixture(d), {});
    const sizes = [...html.matchAll(/font-size:([\d.]+)pt/g)].map((x) => Number(x[1]));
    assert.ok(sizes.length > 100);
    assert.ok(Math.min.apply(null, sizes) >= 7, d + ' 최소 ' + Math.min.apply(null, sizes));
    const plan = ctx.printSheetPlan_(fixture(d), {});
    plan.forEach((p) => { assert.ok(p.nameFontPt >= 8 && p.markFontPt >= 7, d + ' ' + p.name); });
  });
});

test('한 장에 들어간다: 4종 모두 모든 공간 fits, 일요일 1층(블록 4개)도 포함', () => {
  DAYS.forEach((d) => {
    const plan = ctx.printSheetPlan_(fixture(d), {});
    assert.strictEqual(plan.length, 7, d);
    plan.forEach((p) => { assert.ok(p.fits, d + ' ' + p.name + ' ' + JSON.stringify(p.warnings)); assert.ok(!p.narrow); assert.strictEqual(p.parts, 1); });
  });
  const sun1f = ctx.printSheetPlan_(fixture('sun'), {})[0];
  assert.ok(sun1f.fits && sun1f.rowHeightPt > 0);
});

test('SA실처럼 칸이 적으면 글자와 사유 칸이 커진다(최대 2.2배)', () => {
  const plan = ctx.printSheetPlan_(fixture('mon_thu'), {});
  assert.ok(plan[1].scale > plan[0].scale && plan[1].scale <= 2.2 + 1e-9);
  assert.ok(plan[1].nameFontPt > plan[0].nameFontPt);
});

test('표시 칸보다 긴 글자는 줄바꿈하고, 3줄을 넘으면 그 행만 높아진다', () => {
  const m = fixture('sun');
  m.spaces[0].cells.find((c) => c.kind === 'seat' && c.row === 1).marks[0] = { seq: 1, code: 'EXC', text: '가정사유 외 12' };
  const pg = ctx.printPages_(m, {})[0].plan;
  assert.ok(pg.extraRows[1] > 0, '1행에 줄바꿈 여유');
  assert.ok(pg.rowH[0] > pg.rowH[1], '다른 행보다 높다');
  const three = fixture('mon_thu'); // 3블록 칸은 폭이 넉넉해서 같은 글자도 늘리지 않는다
  three.spaces[0].cells.find((c) => c.kind === 'seat' && c.row === 1).marks[0] = { seq: 1, code: 'EXC', text: '병결 외 1' };
  assert.strictEqual(ctx.printPages_(three, {})[0].plan.extraRows[1], 0);
  assert.strictEqual(ctx.printWrapLines_('정상 종료', 7, 17), 2);
  assert.strictEqual(ctx.printWrapLines_('학', 7, 17), 1);
  assert.strictEqual(ctx.printWrapLines_('병결 외 1', 7, 12.8), 4);
  assert.strictEqual(ctx.printWrapLines_('병결 외 1', 7, 13), 3);
  assert.strictEqual(ctx.printWrapLines_('', 7, 13), 1);
});

test('열이 너무 많아 블록 칸이 좁으면 좌우로 나눈다(1/4 … 4/4), 각 쪽은 넉넉하다', () => {
  const cells = [];
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= 40; c++) {
    cells.push({ row: r, col: c, kind: 'seat', seatLabel: String(c), occupant: { grade: 1, name: '가', display: '1. 가' }, vacant: false,
      marks: [1, 2, 3].map((s) => ({ seq: s, code: 'NONE', text: '' })) });
  }
  const m = fixture('mon_thu');
  m.spaces = [{ id: 'wide', name: '넓은방', gender: '혼성', rows: 3, cols: 40, cells }];
  m.unseated = [];
  const plan = ctx.printSheetPlan_(m, {});
  assert.strictEqual(plan.length, 4);
  plan.forEach((p, i) => { assert.strictEqual(p.part, i + 1); assert.strictEqual(p.parts, 4); assert.ok(!p.narrow && p.fits); });
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, '<section class="page"'), 4);
  assert.ok(html.indexOf('넓은방 (1/4)') > 0 && html.indexOf('넓은방 (4/4)') > 0);
  assert.strictEqual(count(html, '<td class="n"'), 120, '좌석이 빠지거나 겹치지 않는다');
});

test('행이 너무 많으면 fits=false 로 알리고 그래도 그린다(던지지 않는다)', () => {
  const m = fixture('mon_thu');
  const cells = [];
  for (let r = 1; r <= 60; r++) cells.push({ row: r, col: 1, kind: 'seat', seatLabel: String(r), occupant: null, vacant: true,
    marks: [1, 2, 3].map((s) => ({ seq: s, code: 'NONE', text: '' })) });
  m.spaces = [{ id: 'tall', name: '긴방', gender: '혼성', rows: 60, cols: 1, cells }];
  const plan = ctx.printSheetPlan_(m, {});
  assert.strictEqual(plan[0].fits, false);
  assert.ok(plan[0].warnings.join().indexOf('한 장에 들어가지 않습니다') >= 0);
  assert.ok(ctx.printRenderSheet_(m, {}).indexOf('긴방') > 0);
});

test('운영 안 하는 날은 안내 한 쪽, 잘못된 모델은 오류', () => {
  const m = fixture('mon_thu'); m.operating = false; m.blocks = []; m.spaces = [];
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, '<section class="page"'), 1);
  assert.ok(html.indexOf('운영하지 않는 날입니다') > 0 && html.indexOf('2027년 3월 3일(수)') > 0);
  assert.deepStrictEqual(plain(ctx.printSheetPlan_(m, {})), []);
  assert.throws(() => ctx.printRenderSheet_(null, {}), /모델이 없습니다/);
  const noBlocks = fixture('mon_thu'); noBlocks.blocks = [];
  assert.throws(() => ctx.printRenderSheet_(noBlocks, {}), /블록이 없어/);
});

test('순수: 같은 입력은 같은 출력이고 모델을 바꾸지 않는다', () => {
  const m = fixture('sun');
  const before = JSON.stringify(m);
  const a = ctx.printRenderSheet_(m, {});
  assert.strictEqual(JSON.stringify(m), before);
  assert.strictEqual(ctx.printRenderSheet_(JSON.parse(before), {}), a);
});

test('기둥·비상문·창문: 기둥은 회색 바탕+글자, 비상문·창문은 점선 칸+글자(통로 열은 비어 있다)', () => {
  const m = fixture('mon_thu');
  const html = ctx.printRenderSheet_(m, {});
  const kinds = {};
  m.spaces.forEach((sp) => sp.cells.forEach((c) => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; }));
  assert.strictEqual(count(html, '>기둥</td>'), kinds.pillar);
  assert.strictEqual(count(html, '>비상문</td>'), kinds.door);
  assert.strictEqual(count(html, '>창문</td>'), kinds.window);
  assert.ok(html.indexOf('background-color:#b5b5b5') > 0);
  assert.ok(count(html, 'class="g"') > 0);
});

test('모델 검사기: 계약을 어긴 입력을 잡는다(나쁜 입력)', () => {
  const bad = (mut) => { const m = fixture('mon_thu'); mut(m); return validateSheetModel(m); };
  const seat = (m) => m.spaces[0].cells.find((c) => c.kind === 'seat' && c.occupant);
  assert.ok(bad((m) => { seat(m).marks.pop(); }).length, 'marks 길이');
  assert.ok(bad((m) => { seat(m).occupant.studentNo = '10305'; }).length, '개인정보 키');
  assert.ok(bad((m) => { seat(m).vacant = true; }).length, 'vacant');
  assert.ok(bad((m) => { m.blocks[1].seq = 5; }).length, 'seq');
  assert.ok(bad((m) => { seat(m).marks[0] = { seq: 1, code: 'NONE', text: '병결' }; }).length, 'NONE+글자');
  assert.ok(bad((m) => { m.spaces[0].cells.push(Object.assign({}, m.spaces[0].cells[0])); }).length, '같은 칸 두 번');
  assert.ok(bad((m) => { m.date = '2027-3-3'; }).length, 'date');
  assert.ok(bad((m) => { seat(m).occupant.display = '김가온'; }).length, 'display');
  assert.deepStrictEqual(validateSheetModel(null), ['모델이 객체가 아니다']);
});
