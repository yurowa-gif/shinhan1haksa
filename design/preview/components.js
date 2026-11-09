/**
 * D3 미리보기·동작 확인: Styles + Client + Components + 데모 → design/preview/out/components.html,
 * Playwright(크로미움)로 360px에서 눌러 보고 PNG를 찍는다. 실행: node design/preview/components.js
 * 가짜 google.script.run 이 가짜 학생 30명 중 일부를 돌려준다(실제 학생 정보 없음). out/은 Git에 올리지 않는다.
 * npm test 에는 넣지 않는다(브라우저 필요). 실패하면 종료 코드 1.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const inc = (f) => read(f).replace(/<\?!=[^?]*\?>/g, '');

const DEMO = `<script>
  // 가짜 서버: 화면 파일이 call('이름')으로 부르는 것처럼 쓴다
  window.google = { script: { run: (function () {
    var fake = { fakeStudents: function () { return [
      { id: 's1', name: '김가온', grade: 1, classNo: 3, number: 5, studentNo: '10305' },
      { id: 's2', name: '이나래', grade: 2, classNo: 1, number: 12, studentNo: '20112' },
      { id: 's3', name: '박다솜', grade: 3, classNo: 2, number: 7, studentNo: '30207' },
      { id: 's4', name: '김가을', grade: 1, classNo: 3, number: 6, studentNo: '10306' } ]; } };
    function make(ok, bad) { return { withSuccessHandler: function (s) { return make(s, bad); }, withFailureHandler: function (f) { return make(ok, f); },
      fakeStudents: function () { setTimeout(function () { ok(fake.fakeStudents()); }, 0); } }; }
    return make(function () {}, function () {});
  })() } };
  var main = document.getElementById('demo');
  function card(title, nodes) { var c = el('div', { class: 'card' }, [el('h2', { text: title })]); nodes.forEach(function (n) { if (n) c.appendChild(n); }); main.appendChild(c); return c; }
  window.__log = [];
  var blocks = [{ seq: 1, start: '18:00', end: '20:00', label: '18–20' }, { seq: 2, start: '20:00', end: '22:00', label: '20–22' }, { seq: 3, start: '22:00', end: '24:00', label: '22–24' }];

  card('상태·알림', [el('p', {}, [UI.statusPill('confirmed'), ' ', UI.statusPill('requested'), ' ', UI.statusPill('canceled'), ' ', UI.statusPill('hak'), ' ',
    UI.statusPill('ga'), ' ', UI.statusPill('byung', '병조'), ' ', UI.statusPill('out1'), ' ', UI.statusPill('out2'), ' ', UI.badge(3), UI.badge(0), UI.badge(120)]),
    UI.emptyState('오늘 특이사항이 없습니다.', { text: '특이사항 입력', onclick: function () { window.__log.push('empty-action'); } })]);

  call('fakeStudents').then(function (students) {
    card('학생 고르기', [UI.studentPicker({ students: students, onpick: function (s) { window.__log.push('pick:' + (s ? s.name : 'none')); } })]);
    card('기간·시간대', [
      UI.segmented({ options: [{ value: 'day', label: '하루' }, { value: 'range', label: '기간' }], value: 'day', onchange: function (v) { window.__log.push('seg:' + v); } }),
      UI.rangeField({ shortcuts: [{ label: '오늘', value: '2027-03-03' }, { label: '내일', value: '2027-03-04' }], onchange: function (v) { window.__log.push('range:' + v.from + '~' + v.to + ':' + v.valid); } }),
      UI.blockChips({ blocks: blocks, onchange: function (v) { window.__log.push('blocks:' + v.spec); } })]);
    var cells = []; var names = ['1. 김가온', '2. 이나래', '3. 박다솜', '1. 김가을'];
    for (var r = 1; r <= 4; r++) for (var c = 1; c <= 8; c++) {
      if (c === 4) continue;
      var n = (r - 1) * 7 + (c > 4 ? c - 1 : c);
      var kind = (r === 4 && c === 8) ? 'door' : (r === 2 && c === 6 ? 'pillar' : 'seat');
      cells.push({ row: r, col: c, kind: kind, seatLabel: kind === 'seat' ? String(n) : '', text: kind === 'seat' && n % 5 ? names[n % 4] : '', vacant: kind === 'seat' && n % 5 === 0 });
    }
    card('좌석 격자(두 칸 맞바꾸기)', [UI.seatGrid({ rows: 4, cols: 8, cells: cells, mode: 'swap', onselect: function (p, done) { window.__log.push('seat:' + p.map(function (x) { return x.row + ',' + x.col; }).join('|') + ':' + done); } })]);
    card('시트', [
      el('button', { type: 'button', class: 'btn secondary block', id: 'open-confirm', text: '좌석 맞바꾸기 확인', onclick: function () {
        UI.confirmSheet({ title: '자리를 맞바꿉니다', message: '1. 김가온(1번)과 2. 이나래(2번)의 자리가 바뀝니다.', confirmText: '맞바꾸기', onconfirm: function () { window.__log.push('confirmed'); UI.toast('저장했습니다.'); } }); } }),
      el('button', { type: 'button', class: 'btn danger block', id: 'open-reason', style: 'margin-top:8px', text: '특이사항 취소 처리', onclick: function () {
        UI.confirmWithReason({ title: '특이사항을 취소합니다', message: '3월 3일(수) 병결 기록을 취소 처리합니다. 기록은 남습니다.', confirmText: '취소 처리', onconfirm: function (reason) { window.__log.push('reason:' + reason); } }); } })]);
    UI.actionBar([{ text: '닫기', kind: 'secondary' }, { text: '저장' }], { mount: true });
    document.body.setAttribute('data-ready', '1');
  });
</script>`;

function build() {
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    inc('src/ui/Styles.html') + '</head><body><header class="top"><a class="back" href="#">← 처음으로</a><h1>컴포넌트 견본</h1></header>' +
    '<main><div id="demo"></div></main>' + inc('src/ui/Client.html') + inc('src/ui/Components.html') + DEMO + '</body></html>';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'components.html');
  fs.writeFileSync(file, build());
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + file);
  await page.waitForSelector('body[data-ready="1"]');
  const log = () => page.evaluate(() => window.__log.slice());

  // 학생 찾기: 초성으로 → 고르기 → 변경
  await page.fill('.picker input', 'ㄱㄱ');
  assert.strictEqual(await page.locator('.picker-item').count(), 2, '초성 ㄱㄱ 은 2명');
  await page.locator('.picker-item').first().click();
  assert.ok((await log()).includes('pick:김가온'));
  assert.ok(await page.locator('.picker-chosen').innerText().then((t) => t.indexOf('1. 김가온') >= 0));
  await page.locator('.picker-chosen .btn').click();
  assert.ok((await log()).includes('pick:none'));
  await page.fill('.picker input', '없는이름');
  assert.ok((await page.locator('.picker-list').innerText()).indexOf('찾는 학생이 없습니다') >= 0);

  // 기간: 시작일을 고르면 종료일이 같은 날로
  await page.locator('.chip', { hasText: '오늘' }).click();
  const range = await page.evaluate(() => document.querySelector('.range').getValue());
  assert.deepStrictEqual(range, { from: '2027-03-03', to: '2027-03-03', days: 1, valid: true });
  await page.locator('.range input[type=date]').nth(1).fill('2027-03-01');
  assert.ok((await page.locator('.range .fix').nth(1).innerText()).indexOf('종료일이 시작일보다 빠릅니다') >= 0);

  // 블록 칩
  await page.locator('.chips .chip', { hasText: '18–20' }).last().click();
  await page.locator('.chips .chip', { hasText: '22–24' }).last().click();
  assert.ok((await log()).includes('blocks:18:00-20:00;22:00-24:00'));

  // 좌석 맞바꾸기: 두 칸
  const seats = page.locator('.seat-cell');
  await seats.nth(0).click();
  await seats.nth(1).click();
  assert.ok((await log()).includes('seat:1,1|1,2:true'));

  // 확인 시트: 포커스는 취소, 확인하면 토스트
  await page.click('#open-confirm');
  assert.strictEqual(await page.evaluate(() => document.activeElement.textContent), '취소');
  await page.screenshot({ path: path.join(OUT, 'components-confirm-360.png') });
  await page.waitForTimeout(400);   // 열린 직후 350ms는 시트 버튼을 무시한다(두 번 탭 방지)
  await page.locator('.sheet .btn', { hasText: '맞바꾸기' }).click();
  assert.ok((await log()).includes('confirmed'));
  assert.ok(await page.locator('.toast').count() === 1);
  await page.click('#open-confirm');
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('.sheet').count(), 0, 'Esc 로 닫힘');

  // 두 번 탭 방지: 시트가 열린 직후(350ms 안) 확인 버튼 클릭은 무시하고, 350ms 뒤에는 실행된다
  const before = (await log()).filter((x) => x === 'confirmed').length;
  await page.evaluate(() => { document.getElementById('open-confirm').click(); document.querySelector('.sheet .btn:last-child').click(); });
  assert.strictEqual((await log()).filter((x) => x === 'confirmed').length, before, '열자마자 누른 확인은 무시');
  assert.strictEqual(await page.locator('.sheet').count(), 1, '시트는 그대로 열려 있다');
  await page.waitForTimeout(400);
  await page.locator('.sheet .btn', { hasText: '맞바꾸기' }).click();
  assert.strictEqual((await log()).filter((x) => x === 'confirmed').length, before + 1, '350ms 뒤 확인은 실행');

  // 사유 시트: 사유가 짧으면 꺼져 있다
  await page.click('#open-reason');
  const confirmBtn = page.locator('.sheet .btn', { hasText: '취소 처리' });
  assert.ok(await confirmBtn.isDisabled());
  await page.fill('.sheet textarea', '잘못 입력');
  assert.ok(await confirmBtn.isEnabled());
  await page.screenshot({ path: path.join(OUT, 'components-reason-360.png') });
  await page.waitForTimeout(400);
  await confirmBtn.click();
  assert.ok((await log()).includes('reason:잘못 입력'));

  // 크기: 눌리는 칸 48px, 가로 스크롤 없음
  await page.waitForTimeout(100);
  const small = await page.evaluate(() => Array.from(document.querySelectorAll('.btn,.chip,.seg,.picker-item,.seat-cell,.back,input,textarea'))
    .filter((e) => e.offsetParent && e.offsetHeight < 48).map((e) => e.className + ':' + e.offsetHeight));
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await page.screenshot({ path: path.join(OUT, 'components-360.png'), fullPage: true });
  await browser.close();
  assert.deepStrictEqual(small, [], '48px 미만');
  assert.ok(width <= 360, 'scrollWidth=' + width);
  assert.deepStrictEqual(errors, [], '브라우저 오류');
  console.log('통과: 학생 찾기·기간·블록 칩·좌석 맞바꾸기·확인/사유 시트, scrollWidth=' + width);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { build };
