/**
 * D15 ④ 시안: '목록 왼쪽 · 상세 오른쪽' (노트북) — 상담일지 · 출결 특이사항(목록) · 학생 명단(입력 | 결과),
 * 그리고 후속 후보 대안(출결 결과 반 칩, 서류 줄마다 토글). 실제 Styles.html 을 그대로 쓰고 시안용 CSS 만 덧붙인 정적 쪽.
 * 실행: node design/preview/refresh-listdetail.js   → docs/design/refresh/list-detail/*.png (이름·숫자는 모두 가짜)
 */
const fs = require('fs');
const path = require('path');
const { launchKo } = require('./browser.js');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'design', 'refresh', 'list-detail');
const STYLES = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'Styles.html'), 'utf8').replace(/<\/?style>/g, '');

const MOCK_CSS = `
  .ld { display: grid; grid-template-columns: minmax(280px, 5fr) 7fr; gap: 16px; align-items: start; }
  .ld-list { position: sticky; top: 8px; max-height: calc(100dvh - 92px); overflow: auto; background: var(--card); border-radius: var(--radius); padding: 12px 8px 8px; }
  .ld-list h2 { margin: 0 8px 8px; }
  .ld-list .field { margin: 0 8px 8px; }
  .ld-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: var(--tap); padding: 6px 10px; border-radius: var(--radius-sm); border-left: 4px solid transparent; cursor: pointer; }
  .ld-row + .ld-row { margin-top: 2px; }
  .ld-row small { color: var(--muted-ink); font-size: var(--font-sm); }
  .ld-row[aria-current="true"] { background: var(--accent-weak); border-left-color: var(--accent); font-weight: 800; color: var(--accent-ink); }
  .ld-row:hover { background: var(--muted-weak); }
  .ld-detail { background: var(--card); border-radius: var(--radius); padding: 16px 18px; min-height: 420px; }
  .ld-detail h2 { margin: 0 0 4px; font-size: var(--font-xl); }
  .ld-detail .sub { color: var(--muted-ink); margin-bottom: 10px; }
  .ld-item { border-top: 1px solid var(--line); padding: 12px 0; }
  .ld-item b { font-size: var(--font-lg); }
  .ld-item .body { margin: 8px 0 0; padding: 10px 12px; background: var(--bg); border-radius: var(--radius-sm); line-height: 1.6; }
  .ld-item .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ld-cap { margin: 0 0 8px; font-size: var(--font-sm); color: var(--muted-ink); }
  .ld-form .btn { margin-top: 8px; }
  .kv { display: grid; grid-template-columns: 7em 1fr; gap: 6px 12px; margin: 10px 0; }
  .kv dt { color: var(--muted-ink); } .kv dd { margin: 0; font-weight: 700; }
  .ld-res table { width: 100%; border-collapse: collapse; } .ld-res td, .ld-res th { padding: 8px 6px; border-bottom: 1px solid var(--line); text-align: left; }
  .cmp { display: grid; gap: 14px; } .cmp > div { background: var(--card); border-radius: var(--radius); padding: 12px; }
  .cmp h3 { margin: 0 0 8px; font-size: var(--font-sm); color: var(--muted-ink); }
  .doc-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .doc-row .tg { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .doc-row .chip { min-height: 40px; padding: 4px 12px; }
  @media (max-width: 599px) { .ld { grid-template-columns: 1fr; } .ld-list { position: static; max-height: none; } }
`;

const NAMES = ['한새봄', '권보람', '김단비', '임누리', '신한결', '강하늘', '조아라', '최구름', '윤다온', '서해든', '오리온', '배누리', '문별이', '송이든', '장하람', '백소담'];
const rows = (sel, tail) => NAMES.map((n, i) => `<div class="ld-row" ${i === sel ? 'aria-current="true"' : ''}><span>1-${1 + (i % 4)} ${5 + i * 2}번 ${n}</span>${tail ? tail(i) : ''}</div>`).join('');
const head = (title) => `<header class="top"><a class="back" href="#">← 처음으로</a><h1>${title}</h1></header>`;
const page = (title, main, wide) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${STYLES}\n${MOCK_CSS}</style></head><body>${head(title)}<main class="${wide ? 'wide' : ''}">${main}</main></body></html>`;

const COUNSEL = `<div class="ld"><section class="ld-list"><h2>상담일지</h2>
  <div class="field"><label>학생 찾기</label><input placeholder="이름 또는 학번"></div>${rows(0, (i) => (i < 3 ? `<small>${3 - i}건</small>` : ''))}</section>
  <section class="ld-detail"><h2>한새봄 <small style="font-size:var(--font-base);font-weight:600;color:var(--muted-ink)">1-1 5번 · 담당 오지후</small></h2>
    <div class="notice info">상담 내용은 이 학생의 담당교사·담임(자기 반)·관리자만 봅니다.</div>
    <h2 style="font-size:var(--font-lg);margin-top:14px">상담 2건</h2>
    <div class="ld-item"><div class="row"><b>3월 22일(월) · 진로</b><span class="pill mute">학부모에게 날짜·교사 안 보임</span></div>
      <div class="body">진로 희망이 바뀐 이유를 들었다. 이번 학기 안에 탐구 주제를 하나 정하기로 합의함. (가짜 예시 문장)</div></div>
    <div class="ld-item"><div class="row"><b>3월 18일(목) · 생활</b><span class="pill s-confirmed">학부모에게 날짜·교사 보임</span></div>
      <button class="btn secondary row-open" type="button" style="margin-top:6px">내용 보기</button></div>
    <button class="btn" type="button" style="margin-top:12px">새 상담 쓰기</button></section></div>`;

const EXC = `<h2 style="margin:4px 0 8px;font-size:var(--font-lg)">2027 1학기 · 특이사항</h2>
  <div class="segmented" style="margin-bottom:12px"><button class="seg">입력</button><button class="seg">요청 처리</button><button class="seg on">목록</button></div>
  <div class="ld"><section class="ld-list"><div class="segmented dense" style="margin:0 8px 8px"><button class="seg on">오늘</button><button class="seg">내일</button><button class="seg">이번 주</button><button class="seg">학생별</button></div>
  <p class="ld-cap" style="margin-left:10px">3월 26일(금) · 9명</p>${[['한새봄', '병결', 'confirmed', '확정'], ['권보람', '학원', 'confirmed', '확정'], ['김단비', '가정', 'requested', '요청'], ['임누리', '병결', 'confirmed', '확정'], ['신한결', '조퇴', 'requested', '요청'], ['강하늘', '학원', 'confirmed', '확정'], ['조아라', '가정', 'confirmed', '확정'], ['최구름', '병결', 'requested', '요청'], ['윤다온', '학원', 'confirmed', '확정']].map((r, i) => `<div class="ld-row" ${i === 2 ? 'aria-current="true"' : ''}><span>${r[0]} <small>${r[1]}</small></span><span class="pill s-${r[2]}">${r[3]}</span></div>`).join('')}</section>
  <section class="ld-detail"><h2>김단비 <small style="font-size:var(--font-base);font-weight:600;color:var(--muted-ink)">1-3 17번</small></h2>
    <div class="row" style="display:flex;gap:8px;margin:6px 0"><span class="pill c-ga">가</span><span class="pill s-requested">요청</span></div>
    <dl class="kv"><dt>언제</dt><dd>3월 26일(금) 하루</dd><dt>시간대</dt><dd>저녁 자습 전체</dd><dt>사유</dt><dd>가족 행사 (가짜 예시)</dd><dt>요청한 사람</dt><dd>학부모</dd><dt>처리 이력</dt><dd>3월 24일 요청 접수</dd></dl>
    <div class="notice warn">미인정 유형과 겹치지 않습니다.</div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" type="button">확정하기</button><button class="btn secondary" type="button">취소(사유 쓰기)</button></div></section></div>`;

const ROSTER = `<h2 style="margin:4px 0 8px;font-size:var(--font-lg)">명단 올리기</h2>
  <div class="segmented" style="margin-bottom:12px"><button class="seg on">학생 명단</button><button class="seg">학부모 연결</button><button class="seg">연락처</button></div>
  <div class="ld" style="grid-template-columns:1fr 1fr"><section class="ld-detail ld-form" style="min-height:0"><p class="ld-cap">① 붙여넣기</p>
    <div class="field"><label>운영 기간</label><select><option>2027 1학기 (2027-03-02 ~ 2027-07-17)</option></select></div>
    <div class="field"><label>상태 적용일</label><input type="date" value="2027-03-26"></div>
    <div class="field"><label>학생 명단</label><textarea rows="7" placeholder="첫 줄(머리글)부터 함께 붙여넣으세요."></textarea></div>
    <button class="btn secondary" type="button">확인</button></section>
  <section class="ld-detail ld-res" style="min-height:0"><p class="ld-cap">② 확인 결과 (저장 전)</p><div class="notice ok">저장해도 됩니다. 아직 저장되지 않았습니다.</div>
    <table><tr><th>새 학생</th><td>30명</td></tr><tr><th>정보 변경</th><td>2명</td></tr><tr><th>상태 기록</th><td>31건</td></tr><tr><th>퇴실 후보</th><td>0명</td></tr></table>
    <p class="ld-cap" style="margin-top:12px">바뀌는 학생(처음 3명)</p><div class="ld-row"><span>1-1 5번 한새봄</span><small>새로 등록</small></div><div class="ld-row"><span>1-2 17번 김단비</span><small>반 변경</small></div><div class="ld-row"><span>1-3 29번 강하늘</span><small>새로 등록</small></div></section></div>`;

const ROSTER_BAR = `<div class="actionbar" style="position:sticky"><button class="btn secondary" type="button">지우기</button><button class="btn" type="button">저장</button></div>`;
const chips = (cls) => Array.from({ length: 28 }, (_, i) => `<button class="chip ${i === 0 ? 'on' : ''}">${1 + Math.floor(i / 10)}-${1 + (i % 10)}</button>`).join('');
const CHIPS = `<div class="cmp"><div><h3>지금: 반 칩 28개가 줄줄이(화면 두세 개 길이)</h3><div class="chips">${chips()}</div></div>
  <div><h3>대안: 학년 3칸 → 그 학년 반만 한 줄(최대 10개), 고른 반은 위에 한 줄로 보임</h3>
  <div class="segmented dense" style="margin-bottom:8px"><button class="seg on">1학년</button><button class="seg">2학년</button><button class="seg">3학년</button></div>
  <div class="chips">${Array.from({ length: 10 }, (_, i) => `<button class="chip ${i === 0 ? 'on' : ''}">1-${i + 1}</button>`).join('')}</div>
  <p class="ld-cap">고른 반: <b>1-1</b></p></div></div>`;
const docRows = (alt) => ['한새봄', '권보람', '김단비', '임누리'].map((n, i) => alt
  ? `<div class="doc-row"><span>1-${i + 1} ${n}</span><span><span class="pill ${i % 2 ? 's-confirmed' : 'todo'}">${i % 2 ? '서류 다 받음' : '못 받은 서류 2건'}</span> <button class="btn secondary row-open" type="button">열기</button></span></div>`
  : `<div class="doc-row"><span>1-${i + 1} ${n}</span><span class="tg"><button class="chip ${i % 2 ? 'on' : ''}">신청서</button><button class="chip on">확인서</button><button class="chip">동의서</button></span></div>`).join('');
const DOCS = `<div class="cmp"><div><h3>지금: 줄마다 토글 3개 (학생 180명이면 540개)</h3>${docRows(false)}</div>
  <div><h3>대안: 줄마다 상태 한 알약 + '열기 ›' (못 받은 것부터 위로 정렬, 열면 시트에서 3개 토글)</h3>${docRows(true)}</div></div>`;

const SHOTS = [
  { id: 'counsel', title: '상담일지', main: COUNSEL, wide: true, sizes: ['1366', '1093'] },
  { id: 'exceptions', title: '특이사항', main: EXC, wide: true, sizes: ['1366', '1093'] },
  { id: 'roster', title: '명단 올리기', main: ROSTER + ROSTER_BAR, wide: true, sizes: ['1366', '1093'] },
  { id: 'chips-alt', title: '출결 결과', main: CHIPS, wide: false, sizes: ['phone'] },
  { id: 'docs-alt', title: '서류', main: DOCS, wide: false, sizes: ['phone', '1093'] }
];
const SIZE = { 1366: [1366, 768], 1093: [1093, 560], phone: [360, 800] };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  try {
    for (const sc of SHOTS) {
      for (const sz of sc.sizes) {
        const ctx = await browser.newContext({ viewport: { width: SIZE[sz][0], height: SIZE[sz][1] }, locale: 'ko-KR' });
        const page = await ctx.newPage();
        await page.setContent(page_(sc), { waitUntil: 'load' });
        const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (sz === 'phone') await page.setViewportSize({ width: 360, height: Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 2400) });
        const file = path.join(OUT, sc.id + '-' + sz + '.png');
        await page.screenshot({ path: file });
        console.log('찍음: ' + sc.id + '-' + sz + ' 넘침=' + over);
        await ctx.close();
      }
    }
  } finally { await browser.close(); }
}
function page_(sc) { return page(sc.title, sc.main, sc.wide); }
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
