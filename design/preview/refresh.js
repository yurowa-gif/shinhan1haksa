/**
 * D15 '화면 새 단장' 1단계(시안만, 코드 병합 없음): 실제 src/ui 화면(가짜 서버)에 방향별 CSS만 덧씌워 같은 5화면을 360px로 찍는다.
 * 실행: node design/preview/refresh.js [방향 now|a|b|c …]  → design/preview/out/refresh/<방향>-<화면>.png, 비교 한 장은 compare-*.png
 * 쓸 사진은 docs/design/refresh/ 로 복사한다(out/은 Git에 올리지 않는다). 이름·숫자는 모두 가짜 데이터.
 * 덧씌우는 CSS는 design/preview/refresh/dir-<방향>.css(토큰 + 규칙). Styles.html·화면 파일은 건드리지 않는다.
 * 방향 B만 Pretendard 웹폰트(jsdelivr, dynamic subset)를 쓴다 — 이 환경은 jsdelivr가 막혀 있어, 같은 파일을 npm 패키지(pretendard@1.3.9)로 받아
 *   PRETENDARD_DIR(기본: 환경변수)에서 jsdelivr 주소 대신 내려 준다. 내려받은 바이트 수를 센다(속도는 학교 망에서 따로 재야 한다).
 */
const fs = require('fs');
const path = require('path');
const { makeApp, openPage } = require('./real-screens.js');
const { launchKo } = require('./browser.js');
const { seed } = require('./stage7-real.js');

const OUT = path.join(__dirname, 'out', 'refresh');
const ADMIN = 'test.admin@example.com', HALL = 'test.teacher@example.com', STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const NOW = '2027-03-26T10:00:00';
const PHONE = { w: 360, h: 800 };
const PD_DIR = process.env.PRETENDARD_DIR || '';
const PD_URL = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/';

const DIRS = [
  { id: 'now', label: '지금', css: '' },
  { id: 'a', label: 'A 종이·잉크' },
  { id: 'b', label: 'B 또렷한 브랜드색' },
  { id: 'c', label: 'C 부드러운 묶음' },
  { id: 'b0', label: 'B 글꼴 없이(비교용)', cssFile: 'b' }
];
const SCREENS = [
  { id: 'student-home', label: '학생 홈', email: STUDENT, query: '', marks: { todo: ['다음 달 시간표'], key: ['내 OUT'] } },
  { id: 'parent-home', label: '학부모 홈', email: PARENT, query: '', marks: { key: ['OUT'] } },
  { id: 'teacher-home', label: '학사교사 홈', email: HALL, query: '', marks: { todo: ['서류 체크리스트', '상담일지', '급식·입퇴실 서류'], key: ['OUT 기록'] } },
  { id: 'facility-write', label: '시설 일지 쓰기', email: STUDENT, query: 'page=facility', fill: true },
  { id: 'timetable-list', label: '교사 시간표 목록', email: HALL, query: 'page=timetable&role=hall_teacher' }
];

const want = process.argv.slice(2);

function cssOf(dir) {
  if (dir.id === 'now') return '';
  return fs.readFileSync(path.join(__dirname, 'refresh', 'dir-' + (dir.cssFile || dir.id) + '.css'), 'utf8');
}

/** 방향 B의 글꼴: jsdelivr 요청을 로컬 파일로 대신 내려 주고 바이트를 센다 */
async function serveFonts(page, stats) {
  if (!PD_DIR) return;
  await page.route(PD_URL + '**', async (route) => {
    const rel = route.request().url().slice(PD_URL.length).split('?')[0];
    const file = path.join(PD_DIR, 'dist', 'web', 'variable', rel);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const body = fs.readFileSync(file);
    stats.files.push([rel, body.length]);
    stats.bytes += body.length;
    route.fulfill({ status: 200, contentType: rel.endsWith('.css') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body });
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchKo();
  const report = {};
  try {
    for (const dir of DIRS) {
      if (want.length && !want.includes(dir.id)) continue;
      const css = cssOf(dir);
      for (const sc of SCREENS) {
        // 화면마다 새 가짜 서버(앞 화면에서 바뀐 데이터가 섞이지 않게)
        const app = makeApp({ now: NOW });
        const ctx = seed(app.env);
        const call = (who, fn, ...a) => app.env.call(who, fn, ...a);
        // 교사 목록에 '확인 필요'·'동의 기다림'이 함께 보이게: 학생 A 제출+동의, 같은 담당의 다른 학생도 한 명 제출(동의 전)
        if (sc.id === 'timetable-list') {
          call(STUDENT, 'submitTimetable', { month: '2027-04', entries: [{ weekday: '월', blocks: '18:30-20:00', code: '학' }, { weekday: '수', blocks: 'ALL', code: '가' }] });
          call(PARENT, 'agreeTimetable', ctx.A.id, '2027-04');
        }
        const s = await openPage(browser, app, { email: sc.email, query: sc.query, size: PHONE });
        const stats = { bytes: 0, files: [] };
        if (dir.id === 'b') await serveFonts(s.page, stats);
        if (sc.fill) {
          // 시설 일지 쓰기: 오른쪽 밖으로 나가는 '끝나는 시각' 칸이 보이도록 시설·시각을 채운다
          await s.page.getByText('특강실', { exact: true }).first().click().catch(() => {});
          await s.page.getByLabel('시작').fill('15:30').catch(() => {});
          await s.page.getByLabel('끝나는 시각').fill('17:00').catch(() => {});
        }
        // 실제로 넣을 때는 화면 코드가 카드에 todo(할 일)·key(중요) 클래스를 붙인다고 가정하고, 여기서는 제목 글자로 표시만 한다(CSS는 이 두 클래스를 쓴다)
        if (css) await s.page.evaluate((marks) => {
          document.querySelectorAll('.card').forEach((c) => {
            const t = ((c.querySelector('h2') || {}).textContent || '').trim();
            if ((marks.todo || []).some((m) => t.indexOf(m) === 0)) c.classList.add('todo');
            if ((marks.key || []).some((m) => t.indexOf(m) === 0)) c.classList.add('key');
          });
        }, sc.marks || {});
        if (css) await s.page.addStyleTag({ content: css });
        if (dir.id === 'b') {
          // jsdelivr 주소를 그대로 쓴다(실제로 넣을 때와 같은 모양). 글꼴이 다 올 때까지 기다린다
          await s.page.addStyleTag({ url: PD_URL + 'pretendardvariable-dynamic-subset.css' }).catch((e) => console.log('  글꼴 css 실패', e.message));
          await s.page.evaluate(() => document.fonts.ready);
          await s.page.waitForTimeout(500);
        }
        // FONT150=1: 기기 글자 크기 150%(html 글자 18px → 27px)에서 가로 넘침·48px 점검만 하고 사진은 따로 저장(font150-)
        if (process.env.FONT150) await s.page.addStyleTag({ content: 'html { font-size: 27px !important; }' });
        await s.settle();
        const prefix = process.env.FONT150 ? 'font150-' : '';
        const shot = await s.shot(prefix + dir.id + '-' + sc.id);
        fs.copyFileSync(shot, path.join(OUT, prefix + dir.id + '-' + sc.id + '.png'));
        const over = await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const small = await s.page.evaluate(() => [...document.querySelectorAll('a.btn, button.btn, .chip, .tab, .seg, a.back')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 47.5).length);
        console.log(`찍음: ${dir.id}-${sc.id} 가로넘침=${over} 48px미만=${small}` + (dir.id === 'b' ? ` 글꼴 ${stats.files.length}개 ${(stats.bytes / 1024).toFixed(0)}KB` : ''));
        (report[dir.id] = report[dir.id] || {})[sc.id] = { over, small, fontKB: Math.round(stats.bytes / 1024), fontFiles: stats.files.length };
        await s.close();
      }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, (process.env.FONT150 ? 'report150-' : 'report-') + (want.join('') || 'all') + '.json'), JSON.stringify(report, null, 1));
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { DIRS, SCREENS };
