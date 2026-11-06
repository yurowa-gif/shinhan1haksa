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

test('줄 머리 "N석 공V"(날짜로 읽히지 않게): 1층 줄별 좌석 수 19·17·18·19·19·20·20·14, 공석 수가 맞다', () => {
  const m = fixture('mon_thu');
  const want = [1, 3, 4, 6, 7, 9, 10, 12].map((col) => {
    const cells = m.spaces[0].cells.filter((c) => c.kind === 'seat' && c.col === col);
    return cells.length + '석 공' + cells.filter((c) => c.vacant).length;
  });
  assert.deepStrictEqual(want.map((x) => x.split('석')[0]), ['19', '17', '18', '19', '19', '20', '20', '14']);
  const html = ctx.printRenderSheet_(m, {});
  const first = html.slice(html.indexOf('class="t"'), html.indexOf('class="t"', html.indexOf('class="t"') + 10));
  const got = [...first.matchAll(/<td class="h"[^>]*>([^<]*)<\/td>/g)].map((x) => x[1]);
  assert.deepStrictEqual(got, want);
  assert.ok(!/<td class="h"[^>]*>\d+\/\d+</.test(html), '3/18 같은 분수 표기는 날짜로 읽힌다');
});
test('머리말: 제목·날짜(요일)·자습 시간·근무(월~목 2칸·그 밖 1칸)·예비(금·토·일 또는 이름이 있을 때만)·표시 칸 순서·model.legend', () => {
  const html = ctx.printRenderSheet_(fixture('mon_thu'), {});
  ['신한학사 출석부', '2027년 3월 3일(수)', '자습 18:00–24:00', '근무 ________ ________', '표시 칸(왼쪽→오른쪽)', '①18–20', '②20–22', '③22–24',
    '<b>○</b>&nbsp;출석', '<b>×</b>&nbsp;결석', '<b>△</b>&nbsp;지각', '<b>조</b>&nbsp;조퇴(사유는 메모 칸에)', '<b>학</b>&nbsp;학원', '<b>가</b>&nbsp;가정'
  ].forEach((t) => assert.ok(html.indexOf(t) >= 0, t));
  assert.ok(html.indexOf('예비') < 0, '월~목에는 예비 감독이 없다');
  const fri = ctx.printRenderSheet_(fixture('fri'), {});
  assert.ok(fri.indexOf('자습 18:00–23:00') > 0 && fri.indexOf('근무 ________&nbsp;&nbsp;예비 ________') > 0, '금요일: 근무 1칸 + 예비');
  assert.ok(fri.indexOf('근무 ________ ________') < 0);
  const sun = ctx.printRenderSheet_(fixture('sun'), {});
  assert.ok(sun.indexOf('2027년 3월 7일(일)') >= 0 && sun.indexOf('④20:30–22') >= 0 && sun.indexOf('예비 ________') > 0);
  const m = fixture('fri'); m.dutyNames = ['가짜교사1']; m.standbyNames = ['가짜교사2'];
  const duty = ctx.printRenderSheet_(m, {});
  assert.ok(duty.indexOf('근무 가짜교사1') >= 0 && duty.indexOf('예비 가짜교사2') >= 0);
  const mon = fixture('mon_thu'); mon.standbyNames = ['가짜교사3'];
  assert.ok(ctx.printRenderSheet_(mon, {}).indexOf('예비 가짜교사3') > 0, '이름이 있으면 월~목에도 보인다');
  const custom = fixture('mon_thu'); custom.legend = [{ mark: '○', text: '맞춤 범례' }];
  assert.ok(ctx.printRenderSheet_(custom, {}).indexOf('<b>○</b>&nbsp;맞춤 범례') > 0 && ctx.printRenderSheet_(custom, {}).indexOf('<b>조</b>') < 0, '범례는 model.legend 그대로');
});
test('인원 요약: 재적 = 자리 있는 학생 + 자리 없는 학사생, 공석·특이사항·학·가 인원이 모델에서 계산한 값과 같다', () => {
  const m = fixture('mon_thu');
  let seated = 0, vacant = 0, special = 0, hak = 0, ga = 0;
  m.spaces.forEach((sp) => sp.cells.forEach((c) => {
    if (c.kind !== 'seat') return;
    if (!c.occupant) { vacant++; return; }
    seated++;
    if (c.marks.some((x) => x.code === 'EXC')) special++;
    if (c.marks.some((x) => x.code === 'FIXED' && x.text === '학')) hak++;
    if (c.marks.some((x) => x.code === 'FIXED' && x.text === '가')) ga++;
  }));
  const s = plain(plan(m).summary);
  assert.deepStrictEqual(s, { enrolled: seated + m.unseated.length, seated, unseated: m.unseated.length, vacant, special, hak, ga });
  assert.ok(special > 0 && hak > 0 && ga > 0 && m.unseated.length > 0);
  assert.ok(ctx.printRenderSheet_(m, {}).indexOf('재적 ' + (seated + m.unseated.length) + '(미배정 ' + m.unseated.length + ')') > 0);
  m.unseated = [];
  assert.ok(ctx.printRenderSheet_(m, {}).indexOf('재적 ' + seated + '</b>') > 0 || ctx.printRenderSheet_(m, {}).indexOf('재적 ' + seated) > 0);
});
test('오늘 특이사항 목록: 블록별 약어("① 무지 · ②③ 병결"), 메모 칸은 일요일에도 앞면에 늘, 넘치면 뒷면, listPage 옵션', () => {
  const mon = fixture('mon_thu');
  const p = plan(mon);
  assert.strictEqual(p.listCount, p.summary.special);
  assert.ok(!p.listOverflow && p.listCapacity >= p.listCount && p.pages === 1);
  const html = ctx.printRenderSheet_(mon, {});
  assert.ok(html.indexOf('오늘 특이사항 ' + p.listCount + '명') > 0);
  assert.ok(html.indexOf('① 무지') > 0 && html.indexOf('① 병결 외 1 · ②③ 병결') > 0, '어느 블록이 어느 약어인지');
  const memo = '메모 (조퇴 사유·무단 사항)';
  DAYS.forEach((d) => {
    const h = ctx.printRenderSheet_(fixture(d), {});
    const front = h.slice(0, h.indexOf('</section>'));
    assert.ok(front.indexOf(memo) > 0, d + ' 앞면에 메모 칸');
  });
  const sun = fixture('sun');
  assert.deepStrictEqual([plan(sun).pages, plan(sun).listOverflow], [2, true]);
  const back = ctx.printRenderSheet_(sun, {});
  assert.ok(back.indexOf('뒷면 목록 (2/2)') > 0 && back.indexOf('① 병결 외 1 · ②③④ 병결') > 0);
  assert.strictEqual(plan(withoutExc(fixture('sun'), 1)).pages, 1);
  assert.strictEqual(plan(sun, { listPage: 'always' }).pages, 2);
  assert.strictEqual(plan(sun, { listPage: 'never' }).pages, 1);
  assert.strictEqual(count(ctx.printRenderSheet_(sun, { listPage: 'never' }), '<section class="page"'), 1);
  assert.strictEqual(count(ctx.printRenderSheet_(mon, { listPage: 'always' }), '<section class="page"'), 2);
});
test('OUT 표시는 인쇄물에 없다(결정 36): outLevel 이 모델에 있어도 ▲·1OUT 을 그리지 않는다', () => {
  const m = fixture('mon_thu');
  const occ = m.spaces[0].cells.filter((c) => c.occupant);
  occ[0].occupant.outLevel = 1; occ[1].occupant.outLevel = 2;
  [{}, { showOut: true }].forEach((o) => {
    const html = ctx.printRenderSheet_(m, o);
    assert.ok(html.indexOf('▲') < 0 && html.indexOf('1OUT') < 0 && html.indexOf('퇴실 대상') < 0);
  });
  assert.ok(ctx.printRenderSheet_(fixture('mon_thu'), {}).indexOf('▲') < 0);
  assert.ok(ctx.printRenderSheet_(m, {}).indexOf(occ[0].occupant.display + '</td>') > 0, '이름 칸에는 학년·이름만');
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

test('줄바꿈 계산: 글자 단위로 나누고, 칸 수를 넘으면 그 행만 높아진다(표시 칸·이름 모두)', () => {
  assert.strictEqual(ctx.printWrapLines_('정상 종료', 7, 17), 2);
  assert.strictEqual(ctx.printWrapLines_('학', 7, 17), 1);
  assert.strictEqual(ctx.printWrapLines_('병결 외 1', 7, 12.8), 4);
  assert.strictEqual(ctx.printWrapLines_('병결 외 1', 7, 13), 3);
  assert.strictEqual(ctx.printWrapLines_('', 7, 13), 1);
  const space = fixture('mon_thu').spaces[0];
  const base = ctx.printExtras_(space, 18, 54.5, 2, '공석');
  assert.strictEqual(base.sumMark, 0, '정상 종료(두 줄)·병결 외 1은 두 줄 칸에 들어간다');
  space.cells.find((c) => c.kind === 'seat' && c.row === 3).marks[0] = { seq: 1, code: 'EXC', text: '가정사유 외 12' };
  space.cells.find((c) => c.kind === 'seat' && c.row === 5).occupant = { grade: 1, name: '가나다라마바사', display: '1. 가나다라마바사' };
  const w = ctx.printExtras_(space, 18, 54.5, 2, '공석');
  assert.ok(w.mark[3] > 0 && w.mark[1] === 0, '표시 칸 글자가 길면 그 행만');
  assert.ok(w.name[5] > 0 && w.name[1] === 0, '이름이 길면 그 행만');
  const one = ctx.printExtras_(fixture('mon_thu').spaces[0], 18, 54.5, 1, '공석');
  assert.ok(one.sumMark > 0, '한 줄 칸(cap 1)이면 두 줄 글자("정상 종료")가 행을 늘린다');
  assert.deepStrictEqual([ctx.printNameFont_('3. 박다솜', 54.5).lines, ctx.printNameFont_('3. 박다솜', 54.5).pt], [1, 9]);
  const longName = ctx.printNameFont_('1. 가나다라마바사', 54.5);
  assert.ok(longName.pt >= 7 && longName.lines >= 1);
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

test('행이 너무 많은 공간은 자르지 않고 이어지는 쪽으로 보내며 앞면에 경고 줄을 둔다', () => {
  const m = fixture('mon_thu');
  const cells = [];
  for (let r = 1; r <= 60; r++) cells.push({ row: r, col: 1, kind: 'seat', seatLabel: String(r), occupant: { grade: 1, name: '가' + r, display: '1. 가' + r }, vacant: false,
    marks: [1, 2, 3].map((x) => ({ seq: x, code: 'NONE', text: '' })) });
  m.spaces = [{ id: 'tall', name: '긴방', gender: '혼성', rows: 60, cols: 1, cells }];
  m.unseated = [];
  const p = plan(m);
  assert.strictEqual(p.fits, false);
  assert.ok(p.pages > 1 && p.mainRowsFront < 60 && p.contPages >= 1);
  assert.ok(p.warnings.join().indexOf('뒷면에 이어집니다') >= 0);
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, '<td class="n"'), 60, '60석이 모두 그려진다');
  assert.ok(html.indexOf('※ 큰 공간 일부 행') > 0 && html.indexOf('앞면에 이어서') > 0);
  assert.strictEqual(count(html, '<section class="page"'), p.pages);
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

test('운영 안 하는 날·공간 없음·블록 없음은 안내 한 쪽(예외 없음), 모델이 없으면 오류', () => {
  const m = fixture('mon_thu'); m.operating = false; m.blocks = []; m.spaces = [];
  const html = ctx.printRenderSheet_(m, {});
  assert.strictEqual(count(html, '<section class="page"'), 1);
  assert.ok(html.indexOf('운영하지 않는 날입니다') > 0 && html.indexOf('2027년 3월 3일(수)') > 0);
  assert.strictEqual(plan(m), null);
  assert.throws(() => ctx.printRenderSheet_(null, {}), /모델이 없습니다/);
  const noSpaces = fixture('mon_thu'); noSpaces.spaces = [];
  const a = ctx.printRenderSheet_(noSpaces, {});
  assert.ok(count(a, '<section class="page"') === 1 && a.indexOf('좌석 배치') > 0);
  const noBlocks = fixture('mon_thu'); noBlocks.blocks = [];
  const b = ctx.printRenderSheet_(noBlocks, {});
  assert.ok(count(b, '<section class="page"') === 1 && b.indexOf('자습 블록이 없습니다') > 0);
  assert.strictEqual(plan(noSpaces), null);
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

/* ───── 적대적 입력(리뷰 지적 재현): 어떤 입력에서도 좌석·미배정·특이사항이 빠지지 않고 쪽 수가 계획과 같다 ───── */

const { cases } = require('../../design/preview/stress');
const advCases = cases().filter((c) => c.model.operating !== false && c.model.spaces.length);

test('적대적 입력 전부: 그려진 좌석 수 = 모델 좌석 수, 미배정·특이사항 이름이 모두 나온다, 쪽 수 = 계획', () => {
  assert.ok(advCases.length >= 10);
  advCases.forEach((c) => {
    const html = ctx.printRenderSheet_(JSON.parse(JSON.stringify(c.model)), c.opts || {});
    const p = plan(JSON.parse(JSON.stringify(c.model)), c.opts || {});
    assert.strictEqual(count(html, '<td class="n"'), seats(c.model), c.name + ' 좌석');
    assert.strictEqual(count(html, '<section class="page"'), p.pages, c.name + ' 쪽 수');
    (c.model.unseated || []).forEach((u) => assert.ok(html.indexOf(ctx.printEsc_(u.display)) >= 0, c.name + ' 미배정 ' + u.display));
    ctx.printEntries_(c.model).forEach((e) => {
      assert.ok(html.indexOf(ctx.printEsc_(e.display)) >= 0, c.name + ' 특이사항 ' + e.display);
    });
    assert.ok(html.indexOf('<script') < 0);
  });
});

test('앞면에 안 들어가는 것이 있으면 아래 줄에 "※ …뒷면에 이어집니다"를 보여 준다(자르지 않는다)', () => {
  const five = advCases.find((c) => c.name === '블록 5개');
  const html = ctx.printRenderSheet_(JSON.parse(JSON.stringify(five.model)), {});
  const front = html.slice(0, html.indexOf('</section>'));
  assert.ok(front.indexOf('※ ') > 0 && front.indexOf('뒷면에 이어집니다') > 0);
  assert.ok(plan(five.model).contPages > 0 && plan(five.model).warnings.join().indexOf('뒷면에 이어집니다') >= 0);
  const ok = ctx.printRenderSheet_(fixture('mon_thu'), {});
  assert.ok(ok.slice(0, ok.indexOf('</section>')).indexOf('※ ') < 0, '평소에는 경고 줄이 없다');
});

test('미배정 180명: 앞면 아래 줄은 두 줄까지 "외 N명(뒷면에 전체)", 뒷면에 전체 목록(여러 쪽 가능)', () => {
  const c = advCases.find((x) => x.name === '미배정 180명');
  const p = plan(c.model);
  assert.ok(p.footOver && p.unseated === 180 && p.pages >= 2);
  const html = ctx.printRenderSheet_(JSON.parse(JSON.stringify(c.model)), {});
  assert.ok(html.indexOf('(뒷면에 전체)') > 0 && html.indexOf('자리 배정 안 됨 180명') > 0);
  for (let i = 1; i <= 180; i++) assert.ok(html.indexOf('가짜' + i + '<') >= 0 || html.indexOf('가짜' + i + ',') >= 0, '가짜' + i);
});

test('특이사항 120명·긴 이름·긴 공석 문구: 뒷면이 여러 쪽이어도 전부 나오고, 큰 공간 줄 높이는 기준 이상이다', () => {
  const c = advCases.find((x) => x.name === '특이사항 120명');
  const p = plan(c.model);
  assert.ok(p.listCount >= 100 && p.listOverflow && p.backPages >= 1);
  const html = ctx.printRenderSheet_(JSON.parse(JSON.stringify(c.model)), {});
  assert.strictEqual(count(html, '뒷면 목록 ('), p.backPages);
  ['긴 이름 1명', '긴 공석 문구(옵션)', '1층 21행', '3글자 약어'].forEach((name) => {
    const cc = advCases.find((x) => x.name === name);
    const pp = plan(JSON.parse(JSON.stringify(cc.model)), cc.opts || {});
    assert.ok(pp.pitch >= 21.5, name + ' 줄 높이 ' + pp.pitch);
    assert.ok(pp.markWmm >= 4.5, name + ' 표시 칸 너비');
  });
});

test('공간 순서가 바뀌어도 좌석 수가 가장 많은 공간이 큰 블록(왼쪽)이다', () => {
  const swapped = advCases.find((x) => x.name === '공간 순서 바뀜(SA가 먼저)');
  assert.notStrictEqual(swapped.model.spaces[0].name, '1층 자습실');
  const html = ctx.printRenderSheet_(JSON.parse(JSON.stringify(swapped.model)), {});
  assert.ok(html.indexOf('1층 자습실 · 146석') < html.indexOf('SA1실 · 남'), '큰 공간이 먼저');
  const p = plan(swapped.model);
  assert.deepStrictEqual([p.roomColumns, p.pages], [3, 1]);
});

test('입력이 이상해도 멈추지 않는다: 근무자 이름이 배열이 아님, blocks[].seq 가 글자, 긴 공간 이름', () => {
  const odd = advCases.find((x) => x.name === '근무자 이름이 배열이 아님');
  const html = ctx.printRenderSheet_(JSON.parse(JSON.stringify(odd.model)), {});
  assert.ok(html.indexOf('근무 박선생') > 0);
  const m = fixture('mon_thu');
  m.blocks[0].seq = '<b>x</b>'; m.blocks[0].label = '<i>y</i>';
  const h2 = ctx.printRenderSheet_(m, {});
  assert.ok(h2.indexOf('<b>x</b>') < 0 && h2.indexOf('<i>y</i>') < 0 && h2.indexOf('NaN') < 0, '블록 번호·라벨 이스케이프');
  const long = advCases.find((x) => x.name === '긴 공간 이름');
  const h3 = ctx.printRenderSheet_(JSON.parse(JSON.stringify(long.model)), {});
  assert.ok(h3.indexOf('SA1실(남자 베리타스 전용 자습실 별관)') > 0);
});

test('흑백 인쇄: 공석(연한 회색)과 미리 채운 칸(진한 회색)이 다르고 배경이 실제로 인쇄되도록 print-color-adjust 를 켠다', () => {
  const html = ctx.printRenderSheet_(fixture('mon_thu'), {});
  assert.ok(html.indexOf('background:#d4d4d4') > 0 && html.indexOf('background:#f4f4f4') > 0);
  assert.ok(html.indexOf('print-color-adjust:exact') > 0);
  assert.notStrictEqual(ctx.PRINT_FILLED_BG, ctx.PRINT_VACANT_BG);
});
