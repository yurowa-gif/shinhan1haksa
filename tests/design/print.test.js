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

const lineCount = (m) => m.spaces.reduce((k, sp) => k + new Set(sp.cells.filter((c) => c.kind === 'seat').map((c) => c.col)).size, 0);
const plan = (m, o) => ctx.printSheetPlan_(m, o || {});
const withoutExc = (m, keep) => {
  let n = 0;
  m.spaces.forEach((sp) => sp.cells.forEach((c) => {
    if (c.kind === 'seat' && c.occupant && c.marks.some((x) => x.code === 'EXC') && n++ >= keep) c.marks = c.marks.map((x) => ({ seq: x.seq, code: 'NONE', text: '' }));
  }));
  return m;
};

test('1층 + SA1~6실이 A4 가로 한 장에 들어간다(평일·금·토 1쪽, 일요일은 목록이 넘칠 때만 뒷면 포함 2쪽)', () => {
  DAYS.forEach((d) => {
    const m = fixture(d);
    const html = ctx.printRenderSheet_(m, {});
    const p = plan(m);
    assert.ok(html.indexOf('<!DOCTYPE html>') === 0 && html.endsWith('</html>'), d);
    assert.ok(html.indexOf('@page { size: A4 landscape; margin: 8mm; }') > 0);
    assert.strictEqual(count(html, '<section class="page"'), p.pages, d);
    assert.ok(p.fits, d + ' ' + JSON.stringify(p.warnings));
    const first = html.slice(0, html.indexOf('</section>'));
    assert.strictEqual(count(first, 'class="t"'), 7, d + ' 첫 쪽에 공간 7개');
    ['1층 자습실', 'SA1실 · 남', 'SA2실 · 남', 'SA3실 · 여', 'SA4실 · 여', 'SA5실 · 여', 'SA6실 · 여'].forEach((t) => assert.ok(first.indexOf(t) >= 0, d + ' ' + t));
  });
  assert.deepStrictEqual(DAYS.map((d) => plan(fixture(d)).pages), [1, 1, 1, 2]);
});

test('SA실 열 수는 표시 칸이 목표 너비를 넘기는 가장 큰 값: 3칸 요일은 3열, 일요일 4칸은 2열', () => {
  assert.deepStrictEqual(DAYS.map((d) => plan(fixture(d)).roomColumns), [3, 3, 3, 2]);
  assert.deepStrictEqual(DAYS.map((d) => plan(fixture(d)).roomRows), [2, 2, 2, 3]);
  const sun = plan(fixture('sun'));
  assert.ok(sun.markW >= 14.5, '일요일 표시 칸 ' + sun.markW);
});

test('손으로 쓸 최소 크기: 표시 칸 너비 4.5mm·높이 4.5mm 이상, 이름 8pt·표시 칸 글자 7pt 이상, 줄 높이 8mm 안팎', () => {
  DAYS.forEach((d) => {
    const p = plan(fixture(d));
    assert.ok(p.markWmm >= 4.5, d + ' 너비 ' + p.markWmm.toFixed(2) + 'mm');
    assert.ok(p.markHmm >= 4.5, d + ' 높이 ' + p.markHmm.toFixed(2) + 'mm');
    assert.ok(p.nameFontPt >= 8 && p.markFontPt >= 7, d);
    assert.ok(p.pitchMm >= 8 && p.pitchMm <= 8.7, d + ' 줄 높이 ' + p.pitchMm.toFixed(2));
    const sizes = [...ctx.printRenderSheet_(fixture(d), {}).matchAll(/font-size:([\d.]+)pt/g)].map((x) => Number(x[1]));
    assert.ok(Math.min.apply(null, sizes) >= 7, d + ' 최소 글자 ' + Math.min.apply(null, sizes));
  });
});

test('좌석 하나 = 이름 칸 1개(위) + 표시 칸 blocks.length개(아래), 줄 머리는 줄마다 하나(1층 8줄 + SA 6실×2줄)', () => {
  DAYS.forEach((d) => {
    const m = fixture(d);
    const html = ctx.printRenderSheet_(m, {});
    const n = seats(m);
    assert.strictEqual(count(html, '<td class="n"'), n, d + ' 이름 칸');
    assert.strictEqual(count(html, '<td class="m"'), n * m.blocks.length, d + ' 표시 칸');
    assert.strictEqual(count(html, '<td class="h"'), lineCount(m), d + ' 줄 머리');
    assert.strictEqual(lineCount(m), 20);
  });
});

test('줄 머리 "공석 수/좌석 수": 1층 줄별 좌석 수 19·17·18·19·19·20·20·14, 공석 수가 맞다', () => {
  const m = fixture('mon_thu');
  const want = [1, 3, 4, 6, 7, 9, 10, 12].map((col) => {
    const cells = m.spaces[0].cells.filter((c) => c.kind === 'seat' && c.col === col);
    return cells.filter((c) => c.vacant).length + '/' + cells.length;
  });
  assert.deepStrictEqual(want.map((x) => x.split('/')[1]), ['19', '17', '18', '19', '19', '20', '20', '14']);
  const html = ctx.printRenderSheet_(m, {});
  const first = html.slice(html.indexOf('class="t"'), html.indexOf('class="t"', html.indexOf('class="t"') + 10));
  const got = [...first.matchAll(/<td class="h"[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]);
  assert.deepStrictEqual(got, want);
});

test('머리말: 제목·날짜(요일)·자습 시간·근무 칸(월~목 2명, 그 밖 1명)·예비 감독·인원 요약·표시 칸 순서·범례', () => {
  const html = ctx.printRenderSheet_(fixture('mon_thu'), {});
  ['신한학사 출석부', '2027년 3월 3일(수)', '자습 18:00–24:00', '근무 ________ ________', '예비 ________',
    '표시 칸(왼쪽→오른쪽)', '①18–20', '②20–22', '③22–24', '<b>○</b>&nbsp;출석', '<b>×</b>&nbsp;결석', '<b>△</b>&nbsp;지각',
    '조퇴(아래 칸에 질병·가정사유)', '<b>학</b>&nbsp;학원', '<b>가</b>&nbsp;가정'].forEach((t) => assert.ok(html.indexOf(t) >= 0, t));
  assert.ok(ctx.printRenderSheet_(fixture('fri'), {}).indexOf('자습 18:00–23:00') > 0);
  const fri = ctx.printRenderSheet_(fixture('fri'), {});
  assert.ok(fri.indexOf('근무 ________&nbsp;') > 0 && fri.indexOf('근무 ________ ________') < 0, '금요일은 근무 칸 1개');
  const sun = ctx.printRenderSheet_(fixture('sun'), {});
  assert.ok(sun.indexOf('2027년 3월 7일(일)') >= 0 && sun.indexOf('④20:30–22') >= 0);
  const m = fixture('fri'); m.dutyNames = ['가짜교사1']; m.standbyNames = ['가짜교사2'];
  const duty = ctx.printRenderSheet_(m, {});
  assert.ok(duty.indexOf('근무 가짜교사1') >= 0 && duty.indexOf('예비 가짜교사2') >= 0);
});

test('인원 요약(재적·공석·특이사항·학·가)이 모델에서 계산한 값과 같다', () => {
  const m = fixture('mon_thu');
  let enrolled = 0, vacant = 0, special = 0, hak = 0, ga = 0;
  m.spaces.forEach((sp) => sp.cells.forEach((c) => {
    if (c.kind !== 'seat') return;
    if (!c.occupant) { vacant++; return; }
    enrolled++;
    if (c.marks.some((x) => x.code === 'EXC')) special++;
    if (c.marks.some((x) => x.code === 'FIXED' && x.text === '학')) hak++;
    if (c.marks.some((x) => x.code === 'FIXED' && x.text === '가')) ga++;
  }));
  assert.deepStrictEqual(plain(plan(m).summary), { enrolled, vacant, special, hak, ga });
  assert.ok(enrolled + vacant === seats(m) && special > 0 && hak > 0 && ga > 0);
  assert.ok(ctx.printRenderSheet_(m, {}).indexOf('재적 ' + enrolled + '</b>&nbsp;·&nbsp;공석 ' + vacant + '&nbsp;·&nbsp;특이사항 ' + special + '명') > 0);
});

test('오늘 특이사항 목록: 학생·블록·약어, 1쪽 아래에 들어가면 뒷면 없음, 넘치면 뒷면, listPage 옵션', () => {
  const mon = fixture('mon_thu');
  const p = plan(mon);
  assert.strictEqual(p.listCount, p.summary.special);
  assert.ok(!p.listOverflow && p.listCapacity >= p.listCount);
  const html = ctx.printRenderSheet_(mon, {});
  assert.ok(html.indexOf('오늘 특이사항 ' + p.listCount + '명') > 0 && html.indexOf('무단·기타 메모') > 0);
  assert.ok(html.indexOf('① 무지') > 0 && html.indexOf('①②③ 병결') > 0, '블록 번호와 약어');
  // 일요일은 목록 칸(2열 배치라 70pt)이 모자라 뒷면 2쪽, 특이사항이 적으면 1쪽
  const sun = fixture('sun');
  assert.deepStrictEqual([plan(sun).pages, plan(sun).listOverflow], [2, true]);
  const back = ctx.printRenderSheet_(sun, {});
  assert.ok(back.indexOf('(뒷면)') > 0 && back.indexOf('나머지는 뒷면') > 0);
  assert.strictEqual(plan(withoutExc(fixture('sun'), 8)).pages, 1);
  assert.strictEqual(plan(sun, { listPage: 'always' }).pages, 2);
  assert.strictEqual(plan(sun, { listPage: 'never' }).pages, 1);
  assert.strictEqual(count(ctx.printRenderSheet_(sun, { listPage: 'never' }), '<section class="page"'), 1);
  assert.strictEqual(count(ctx.printRenderSheet_(mon, { listPage: 'always' }), '<section class="page"'), 2);
});

test('1OUT·퇴실 대상: 기본은 아무것도 그리지 않고(선생님 결정 전), opts.showOut 을 켜면 이름 옆 ▲·▲▲와 범례가 나온다', () => {
  const m = fixture('mon_thu');
  const occ = m.spaces[0].cells.filter((c) => c.occupant);
  occ[0].occupant.outLevel = 1; occ[1].occupant.outLevel = 2;
  const off = ctx.printRenderSheet_(m, {});
  assert.ok(off.indexOf('▲') < 0 && off.indexOf('1OUT') < 0, '기본은 표시 없음');
  const on = ctx.printRenderSheet_(m, { showOut: true });
  assert.ok(on.indexOf(occ[0].occupant.display + ' ▲</td>') > 0);
  assert.ok(on.indexOf(occ[1].occupant.display + ' ▲▲</td>') > 0);
  assert.ok(on.indexOf('<b>▲</b>&nbsp;1OUT') > 0 && on.indexOf('퇴실 대상') > 0);
  const clean = fixture('mon_thu');
  assert.ok(ctx.printRenderSheet_(clean, { showOut: true }).indexOf('▲') < 0, 'outLevel 이 없으면 켜도 그리지 않는다');
});

test('특이사항 목록에는 사유 메모가 없다(유형 약어만, 결정 23)', () => {
  const m = fixture('mon_thu');
  const cell = m.spaces[0].cells.find((c) => c.kind === 'seat' && c.occupant);
  cell.occupant.reason = '독감 38도';
  cell.marks[0] = { seq: 1, code: 'EXC', text: '병결' };
  const html = ctx.printRenderSheet_(m, {});
  assert.ok(html.indexOf('독감') < 0 && html.indexOf('38도') < 0);
});

test('공석은 "공석"으로 적힌다(설정으로 바꿀 수 있다)', () => {
  const m = fixture('mon_thu');
  const vacant = m.spaces.reduce((k, sp) => k + sp.cells.filter((c) => c.vacant).length, 0);
  assert.ok(vacant > 5);
  assert.strictEqual(count(ctx.printRenderSheet_(m, {}), '>공석</td>'), vacant);
  const custom = ctx.printRenderSheet_(m, { vacantLabel: '빈자리' });
  assert.strictEqual(count(custom, '>빈자리</td>'), vacant);
  assert.strictEqual(count(custom, '>공석</td>'), 0);
});

test('배정 안 된 학생은 아래 줄에 나온다', () => {
  const m = fixture('mon_thu');
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, '자리 배정 안 됨'), 1);
  assert.ok(html.indexOf('3. 박다솜</div>') > 0);
  m.unseated = [];
  assert.strictEqual(count(ctx.printRenderSheet_(m, {}), '자리 배정 안 됨'), 0);
});

test('이스케이프: <script>·&·따옴표가 모든 글자 자리에서 이스케이프된다(제목·근무·예비·블록·범례·이름·칸·목록·공간·배정 안 됨)', () => {
  const m = fixture('mon_thu');
  const evil = '<script>alert("x")</script>&\'';
  m.title = evil; m.dutyNames = [evil]; m.standbyNames = [evil]; m.blocks[0].label = evil; m.legend[0].text = evil; m.unseated = [{ display: '1. ' + evil }];
  m.spaces[0].name = evil; m.spaces[1].name = evil;
  const seat = m.spaces[0].cells.find((c) => c.kind === 'seat' && c.occupant);
  seat.occupant = { grade: 1, name: evil, display: '1. ' + evil };
  seat.marks[0] = { seq: 1, code: 'EXC', text: evil };
  const html = ctx.printRenderSheet_(m, {});
  assert.ok(html.indexOf('<script') < 0, '날 <script');
  assert.ok(html.indexOf('alert("x")') < 0, '날 따옴표');
  const esc = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;';
  assert.ok(count(html, esc) >= 11, '이스케이프된 곳 ' + count(html, esc));
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

test('줄바꿈 계산: 글자 단위로 나누고, 표시 칸보다 길어 칸 수를 넘으면 그 행만 높아진다', () => {
  assert.strictEqual(ctx.printWrapLines_('정상 종료', 7, 17), 2);
  assert.strictEqual(ctx.printWrapLines_('학', 7, 17), 1);
  assert.strictEqual(ctx.printWrapLines_('병결 외 1', 7, 12.8), 4);
  assert.strictEqual(ctx.printWrapLines_('병결 외 1', 7, 13), 3);
  assert.strictEqual(ctx.printWrapLines_('', 7, 13), 1);
  const space = fixture('mon_thu').spaces[0];
  const w = ctx.printBlockWraps_(space, 18, 14);
  assert.strictEqual(w.sumExtra, 0, '정상 종료(두 줄)·병결 외 1은 14pt 칸에 들어간다');
  space.cells.find((c) => c.kind === 'seat' && c.row === 3).marks[0] = { seq: 1, code: 'EXC', text: '가정사유 외 12' };
  const w2 = ctx.printBlockWraps_(space, 18, 14);
  assert.ok(w2.extraRows[3] > 0 && w2.extraRows[1] === 0);
});

test('공간이 하나뿐이면 오른쪽 영역 없이 전체 폭을 쓴다', () => {
  const m = fixture('mon_thu');
  m.spaces = [m.spaces[0]];
  const p = plan(m);
  assert.strictEqual(p.roomColumns, 0);
  assert.ok(p.fits && p.lineW <= 96 && p.markW >= 14.5);
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, 'class="t"'), 1);
  assert.strictEqual(count(html, '<td class="h"'), 8);
});

test('행이 너무 많으면 fits=false 로 알리고 그래도 그린다(던지지 않는다)', () => {
  const m = fixture('mon_thu');
  const cells = [];
  for (let r = 1; r <= 60; r++) cells.push({ row: r, col: 1, kind: 'seat', seatLabel: String(r), occupant: null, vacant: true,
    marks: [1, 2, 3].map((x) => ({ seq: x, code: 'NONE', text: '' })) });
  m.spaces = [{ id: 'tall', name: '긴방', gender: '혼성', rows: 60, cols: 1, cells }];
  const p = plan(m);
  assert.strictEqual(p.fits, false);
  assert.ok(p.warnings.join().indexOf('한 장에 들어가지 않습니다') >= 0);
  assert.ok(ctx.printRenderSheet_(m, {}).indexOf('긴방') > 0);
});

test('기둥·비상문·창문: 기둥은 회색 바탕+글자, 비상문·창문은 점선 칸+글자', () => {
  const m = fixture('mon_thu');
  const html = ctx.printRenderSheet_(m, {});
  const kinds = {};
  m.spaces.forEach((sp) => sp.cells.forEach((c) => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; }));
  assert.strictEqual(count(html, '>기둥</td>'), kinds.pillar);
  assert.strictEqual(count(html, '>비상문</td>'), kinds.door);
  assert.strictEqual(count(html, '>창문</td>'), kinds.window);
  assert.ok(html.indexOf('background-color:#b5b5b5') > 0);
});

test('운영 안 하는 날은 안내 한 쪽, 잘못된 모델은 오류', () => {
  const m = fixture('mon_thu'); m.operating = false; m.blocks = []; m.spaces = [];
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, '<section class="page"'), 1);
  assert.ok(html.indexOf('운영하지 않는 날입니다') > 0 && html.indexOf('2027년 3월 3일(수)') > 0);
  assert.strictEqual(plan(m), null);
  assert.throws(() => ctx.printRenderSheet_(null, {}), /모델이 없습니다/);
  const noBlocks = fixture('mon_thu'); noBlocks.blocks = [];
  assert.throws(() => ctx.printRenderSheet_(noBlocks, {}), /블록이 없어/);
  const noSpaces = fixture('mon_thu'); noSpaces.spaces = [];
  assert.throws(() => ctx.printRenderSheet_(noSpaces, {}), /공간이 없어/);
});

test('순수: 같은 입력은 같은 출력이고 모델을 바꾸지 않는다', () => {
  const m = fixture('sun');
  const before = JSON.stringify(m);
  const a = ctx.printRenderSheet_(m, {});
  assert.strictEqual(JSON.stringify(m), before);
  assert.strictEqual(ctx.printRenderSheet_(JSON.parse(before), {}), a);
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
