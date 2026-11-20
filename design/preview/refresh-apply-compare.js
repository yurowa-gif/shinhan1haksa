/**
 * D15 2단계: refresh-apply.js가 찍은 before/after를 두 열(지금 | 새)로 나란히 놓는다. 긴 화면은 위쪽 MAXH만.
 * 실행: node design/preview/refresh-apply-compare.js  → design/preview/out/apply/compare-<화면>.png
 */
const fs = require('fs');
const path = require('path');
const { launchKo } = require('./browser.js');
const { SCREENS } = require('./refresh-apply.js');
const OUT = path.join(__dirname, 'out', 'apply');
const MAXH = 1700;
const LABEL = { 'home-admin': '관리자 홈', 'home-attendance': '출결 담당 홈', 'home-duty': '근무표 담당 홈', 'home-hall': '학사 교사 홈', 'home-homeroom': '담임 홈', 'home-student': '학생 홈', 'home-parent': '학부모 홈',
  facility: '시설 일지 쓰기(학생)', 'timetable-student': '시간표(학생)', 'timetable-teacher': '시간표 목록(교사)' };
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
async function main() {
  const browser = await launchKo();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
    for (const sc of SCREENS) {
      const col = (label, f) => `<figure><figcaption>${label}</figcaption><div class="shot"><img src="${uri(f)}"></div></figure>`;
      const html = `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:24px;background:#d9dde3;font-family:"Noto Sans KR","Malgun Gothic",sans-serif}
        h1{margin:0 0 16px;font-size:22px;color:#111} .row{display:flex;gap:24px;align-items:flex-start}
        figure{margin:0;width:360px} figcaption{font-weight:800;font-size:17px;margin-bottom:8px;color:#111}
        .shot{width:360px;max-height:${MAXH}px;overflow:hidden;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25)} img{display:block;width:360px}
      </style><h1>${LABEL[sc.id] || sc.id}</h1><div class="row">${col('지금', 'before-' + sc.id + '.png')}${col('새 단장', 'after-' + sc.id + '.png')}</div>`;
      await page.setContent(html); await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, 'compare-' + sc.id + '.png'), fullPage: true });
      console.log('찍음: compare-' + sc.id);
    }
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
