/**
 * D15 ②: refresh-responsive.js가 찍은 사진을 두 묶음으로 나란히 놓는다.
 *   compare-phone-<화면>.png  = 휴대폰 3종(안드로이드 360×800 · 아이폰 390×844 · 아이폰 SE 375×667), 고친 뒤
 *   compare-laptop-<화면>.png = 노트북: 위 줄 (고치기 전 | 고친 뒤) 1366×768, 아래 줄 1536×864 | 1366×768 배율 125%(CSS 1093×614)
 * 실행: node design/preview/refresh-responsive-compare.js [화면 id …]  → design/preview/out/resp/
 */
const fs = require('fs');
const path = require('path');
const { launchKo } = require('./browser.js');
const { SCREENS } = require('./refresh-responsive.js');
const OUT = path.join(__dirname, 'out', 'resp');
const LABEL = { 'home-hall': '학사 교사 홈', 'home-admin': '관리자 홈', 'home-owner': '관리자+교사 홈(역할 메뉴)', 'home-student': '학생 홈', 'home-parent': '학부모 홈', 'facility-write': '시설 일지 쓰기(학생)', mealcount: '식수 집계(표)', 'timetable-confirm': '시간표 확인 시트(교사)' };
const uri = (f) => fs.existsSync(path.join(OUT, f)) ? 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64') : '';
const SCALE = 0.7;
async function main() {
  const want = process.argv.slice(2);
  const browser = await launchKo();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    for (const sc of SCREENS) {
      if (want.length && !want.includes(sc.id)) continue;
      const fig = (label, f, w, scale) => uri(f) ? `<figure><figcaption>${label}</figcaption><img style="width:${Math.round(w * scale)}px" src="${uri(f)}"></figure>` : '';
      const css = `<style>body{margin:0;padding:24px;background:#d9dde3;font-family:"Noto Sans KR","Malgun Gothic",sans-serif}h1{margin:0 0 14px;font-size:22px;color:#111}
        .row{display:flex;gap:20px;align-items:flex-start;margin-bottom:18px} figure{margin:0} figcaption{font-weight:800;font-size:16px;margin-bottom:6px;color:#111}
        img{display:block;box-shadow:0 2px 10px rgba(0,0,0,.25);background:#fff}</style>`;
      const phone = `<!doctype html><meta charset="utf-8">${css}<h1>${LABEL[sc.id]} — 휴대폰 3종</h1><div class="row">${fig('안드로이드 360×800', 'after-' + sc.id + '-android-360.png', 360, 1)}${fig('아이폰 390×844', 'after-' + sc.id + '-iphone-390.png', 390, 1)}${fig('아이폰 SE 375×667', 'after-' + sc.id + '-iphone-se-375.png', 375, 1)}</div>`;
      const laptop = `<!doctype html><meta charset="utf-8">${css}<h1>${LABEL[sc.id]} — 노트북</h1><div class="row">${fig('고치기 전 · 1366×768', 'before-' + sc.id + '-laptop-1366.png', 1366, SCALE)}${fig('고친 뒤 · 1366×768', 'after-' + sc.id + '-laptop-1366.png', 1366, SCALE)}</div><div class="row">${fig('고친 뒤 · 1536×864(1920 화면 125%)', 'after-' + sc.id + '-laptop-1536.png', 1536, SCALE)}${fig('고친 뒤 · 1366×768 배율 125%(CSS 1093×614)', 'after-' + sc.id + '-laptop-1366-125.png', 1093, SCALE)}</div>`;
      for (const [name, html] of [['phone', phone], ['laptop', laptop]]) {
        await page.setContent(html); await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, 'compare-' + name + '-' + sc.id + '.png'), fullPage: true });
        console.log('찍음: compare-' + name + '-' + sc.id);
      }
    }
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
