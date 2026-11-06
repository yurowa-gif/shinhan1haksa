/**
 * D1 미리보기: Styles.html + 견본 마크업 → design/preview/out/tokens.html, 360px 휴대폰 PNG.
 * 실행: node design/preview/tokens.js   (out/은 Git에 올리지 않는다)
 * 가로 스크롤이 생기면(scrollWidth > 360) 오류로 끝난다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');

const sample = `
<header class="top"><a class="back" href="#">← 처음으로</a><h1>디자인 견본</h1></header>
<main class="has-actionbar">
  <div class="card"><h2>오늘 3월 3일(수)</h2><div class="muted">2027 1학기 · 학사생 30명</div>
    <div class="stats" style="margin-top:12px"><div class="stat"><div class="n">30</div><div class="l">이번 기간 학사생</div></div>
    <div class="stat"><div class="n">3</div><div class="l">처리할 요청</div></div></div></div>
  <div class="notice warn">시작일이 종료일보다 늦습니다. 시작일을 앞날로 고쳐 주세요.</div>
  <div class="notice ok">저장했습니다.</div>
  <div class="notice info">11:30 이후 신청이라 3월 4일부터 적용됩니다.</div>
  <div class="error">권한이 없습니다. 출결 담당 선생님께 요청해 주세요.</div>
  <div class="card"><h2>상태 표시</h2>
    <p><span class="pill s-confirmed">확정</span> <span class="pill s-requested">요청</span> <span class="pill s-canceled">취소</span></p>
    <p><span class="pill c-hak">학</span> <span class="pill c-ga">가</span> <span class="pill c-byung">병결</span></p>
    <p><span class="pill out-1">1OUT</span> <span class="pill out-2">퇴실 대상</span></p>
    <p><span class="pill todo">확인 필요</span> <span class="pill mute">현재</span> 요청 <span class="count">3</span></p></div>
  <div class="card"><h2>입력칸</h2>
    <div class="field"><label>기간 이름</label><input type="text" value="2027 1학기"><div class="hint">예: 2027 1학기</div></div>
    <div class="field invalid"><label>시작일</label><input type="text" value="2027-03-10"><div class="fix">시작일이 종료일보다 늦습니다. 앞날로 고쳐 주세요.</div></div>
    <div class="field"><label>메모</label><textarea></textarea></div></div>
  <div class="card"><h2>버튼</h2>
    <p><button class="btn block">저장</button></p><p><button class="btn secondary block">새 기간으로 돌아가기</button></p>
    <p><button class="btn danger block">취소 처리</button></p><p><button class="btn block" disabled>저장 중…</button></p></div>
  <div class="card"><h2>목록</h2><ul class="list"><li><span>1. 김가온</span><span class="muted">1-3 5번 · 남</span></li>
    <li><span>2. 이나래</span><span class="pill s-requested">요청</span></li></ul>
    <dl class="kv"><dt>학번</dt><dd>10305</dd><dt>평일 종료</dt><dd>23:00</dd></dl></div>
</main>
<div class="actionbar"><button class="btn secondary">닫기</button><button class="btn">저장</button></div>`;

function build() {
  const styles = fs.readFileSync(path.join(ROOT, 'src/ui/Styles.html'), 'utf8');
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    styles + '</head><body>' + sample + '</body></html>';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'tokens.html');
  fs.writeFileSync(file, build());
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });
  await page.goto('file://' + file);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.screenshot({ path: path.join(OUT, 'tokens-360.png'), fullPage: true });
  const small = await page.evaluate(() => Array.from(document.querySelectorAll('.btn,.tab,.back,.field input'))
    .filter((e) => e.offsetHeight < 48).map((e) => e.className + ':' + e.offsetHeight));
  await browser.close();
  console.log('scrollWidth=' + w + ', 48px 미만 누르는 칸: ' + (small.length ? small.join(', ') : '없음'));
  if (w > 360 || small.length) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { build };
