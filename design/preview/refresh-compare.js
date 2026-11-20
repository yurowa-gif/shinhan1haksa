/**
 * D15: refresh.js가 찍은 사진을 방향별 열로 나란히 놓은 비교 한 장(화면마다 하나 + 글꼴 비교 하나).
 * 실행: node design/preview/refresh-compare.js  → design/preview/out/refresh/compare-<화면>.png
 */
const fs = require('fs');
const path = require('path');
const { launchKo } = require('./browser.js');
const { DIRS, SCREENS } = require('./refresh.js');
const OUT = path.join(__dirname, 'out', 'refresh');
const MAXH = 1500;   // 긴 화면(교사 홈)은 위쪽만

const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
function sheet(cols, title) {
  const cells = cols.map((c) => `<figure><figcaption>${c.label}</figcaption><div class="shot"><img src="${uri(c.file)}"></div></figure>`).join('');
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:24px;background:#d9dde3;font-family:"Noto Sans KR","Malgun Gothic",sans-serif}
  h1{margin:0 0 16px;font-size:22px;color:#111}
  .row{display:flex;gap:20px;align-items:flex-start}
  figure{margin:0;width:360px}
  figcaption{font-weight:800;font-size:17px;margin-bottom:8px;color:#111}
  .shot{width:360px;max-height:${MAXH}px;overflow:hidden;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25)}
  img{display:block;width:360px}
  </style><h1>${title}</h1><div class="row">${cells}</div>`;
}
async function main() {
  const browser = await launchKo();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const shoot = async (html, name) => {
      await page.setContent(html); await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, name), fullPage: true });
      console.log('찍음: ' + name);
    };
    const main4 = DIRS.filter((d) => d.id !== 'b0');
    for (const sc of SCREENS) await shoot(sheet(main4.map((d) => ({ label: d.label, file: d.id + '-' + sc.id + '.png' })), sc.label + ' — 지금과 세 방향'), 'compare-' + sc.id + '.png');
    // 글꼴 비교: B(Pretendard) vs B(기기 글꼴) — 학생 홈
    await shoot(sheet([{ label: 'B · 기기 기본 글꼴', file: 'b0-student-home.png' }, { label: 'B · Pretendard', file: 'b-student-home.png' }, { label: 'B · 기기 기본 글꼴(교사 목록)', file: 'b0-timetable-list.png' }, { label: 'B · Pretendard(교사 목록)', file: 'b-timetable-list.png' }], '글꼴 비교(B 방향 같은 CSS, 글꼴만 다름)'), 'compare-font.png');
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
