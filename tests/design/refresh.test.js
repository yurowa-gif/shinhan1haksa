/**
 * D15 화면 새 단장 1단계(시안만): 방향별 덧씌우기 CSS(design/preview/refresh/dir-*.css)가 지킬 것을 지키는지, 문서(docs/design/refresh/refresh.md)와 사진이 맞는지.
 * src/ui 는 바꾸지 않는 PR이라 여기서는 "시안이 규칙을 어기지 않는지"만 본다(채택해서 Styles.html 에 넣을 때 styles.test.js 가 그대로 지킨다).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, ROOT } = require('../helpers/harness');
const css = require('./css-util');

const base = css.rootTokens(css.parseRules(css.styleText(css.readFile('src/ui/Styles.html'))));
const dirCss = (d) => fs.readFileSync(path.join(ROOT, 'design', 'preview', 'refresh', 'dir-' + d + '.css'), 'utf8');
const tokensOf = (d) => Object.assign({}, base, css.rootTokens(css.parseRules(dirCss(d))));

// 글자색 / 바탕 쌍(방향마다 새로 쓴 색이 들어간 쌍을 포함). 상태 색은 지금 값 그대로여야 한다
const PAIRS = {
  all: [['--text', '--bg'], ['--text', '--card'], ['--muted', '--bg'], ['--muted', '--card'], ['#fff', '--accent'], ['--accent-ink', '--accent-weak'], ['--accent-ink', '--card'],
    ['--ok-ink', '--ok-weak'], ['--caution-ink', '--caution-weak'], ['--muted-ink', '--muted-weak'], ['--out1-ink', '--out1-weak'],
    ['--code-hak-ink', '--code-hak-weak'], ['--code-ga-ink', '--code-ga-weak'], ['--code-byung-ink', '--code-byung-weak'], ['--warn', '--warn-weak'], ['--text', '--accent-weak']],
  a: [['--text', '#e9e6dc']],
  b: [['--signal-ink', '--signal'], ['#dbe5ff', '--accent'], ['--text', '#dfe5f4'], ['--text', '#eef1f8']],
  c: []
};

test('방향 A·B·C 시안: 글자 대비 4.5:1 이상(방향마다 다시 정의한 토큰 기준, 상태 색은 지금 값 그대로)', () => {
  const bad = [];
  ['a', 'b', 'c'].forEach((d) => {
    const t = tokensOf(d);
    PAIRS.all.concat(PAIRS[d]).forEach(([fg, bg]) => {
      const get = (k) => css.parseColor(k[0] === '#' ? k : t[k]);
      const r = css.contrast(get(fg), get(bg));
      if (!(r >= 4.5)) bad.push(d + ' ' + fg + ' / ' + bg + ' = ' + r.toFixed(2));
    });
    // 상태 색 의미는 바꾸지 않는다
    ['--ok', '--ok-ink', '--ok-weak', '--caution-ink', '--caution-weak', '--out1-ink', '--out1-weak', '--out2', '--warn', '--code-hak-ink', '--code-ga-ink', '--code-byung-ink'].forEach((k) => {
      if (t[k] !== base[k]) bad.push(d + ' 상태 색이 바뀜 ' + k);
    });
  });
  assert.deepStrictEqual(bad, []);
});

test('방향 시안 CSS: 포커스 표시·48px·상태 알약 앞 글자를 지우지 않고, 시설 일지 시각 칸이 카드 안에 들어오며(min-width 0), 긴 알약은 줄을 바꾼다', () => {
  ['a', 'b', 'c'].forEach((d) => {
    const src = dirCss(d);
    assert.ok(!/outline\s*:\s*(none|0)/.test(src), d + ' 포커스 표시를 지웠다');
    assert.ok(!/content\s*:\s*(none|"")/.test(src), d + ' 앞 글자(✓ … ⊘ ▲ ●)를 지웠다');
    assert.ok(!/--tap\s*:\s*(\d|[1-3]\d|4[0-7])px/.test(src), d + ' 누르는 칸 48px 미만');
    assert.ok(/\.fc-times \.field \{[^}]*min-width: 0/.test(src) && /\.fc-times input\[type="time"\] \{[^}]*min-width: 0/.test(src), d + ' 시각 칸이 카드 밖으로 나간다');
    assert.ok(/\.pill \{ white-space: normal; max-width: 100%; \}/.test(src), d + ' 긴 알약이 줄을 바꾸지 않는다');
    assert.ok(/\.card\.todo/.test(src) && /\.card\.key/.test(src), d + ' 할 일·중요 카드 구분이 없다');
    assert.ok(!/@font-face|@import/.test(src), d + ' CSS가 글꼴을 직접 내려받는다');
  });
  // 글꼴 예외는 B 하나뿐
  assert.ok(/Pretendard/.test(dirCss('b')) && !/Pretendard/.test(dirCss('a')) && !/Pretendard/.test(dirCss('c')));
  // (2단계에서 결정 85대로 B 토큰이 Styles.html에 들어왔다 — 그쪽은 styles.test.js가 지킨다. 여기서는 시안 CSS 자체만 본다)
});

test('docs/design/refresh/refresh.md: 방향 셋·토큰 표·장단점·글꼴 결과·규칙 변경·총괄 추천·확인 못 한 것이 있고, 사진이 모두 있고 모두 쓰인다', () => {
  const dir = path.join(ROOT, 'docs', 'design', 'refresh');
  const doc = fs.readFileSync(path.join(dir, 'refresh.md'), 'utf8');
  ['A 종이·잉크', 'B 또렷한 브랜드색', 'C 부드러운 묶음', '토큰 표', '장단점', 'SIL OFL 1.1', '재지 못했다', '규칙 변경이 필요한 것', '총괄 추천', '건너뛴 것·확인 못 한 것', '고르는 것은 선생님', '`src/`를 바꾸지 않습니다', '48px', '4.5:1'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  assert.ok(doc.indexOf('FONT150_RESULT') < 0, '글자 150% 결과가 채워지지 않았다');
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\(([^)]+\.png)\)/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 26, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(dir, f)), f + ' 파일이 없다'));
  fs.readdirSync(dir).filter((f) => f.endsWith('.png')).forEach((f) => assert.ok(imgs.indexOf(f) >= 0, f + ' 가 문서에 쓰이지 않았다'));
  // 방향 셋 × 화면 다섯 + 지금 다섯 + 비교 여섯
  ['now', 'a', 'b', 'c'].forEach((d) => ['student-home', 'parent-home', 'teacher-home', 'facility-write', 'timetable-list'].forEach((s) => assert.ok(imgs.indexOf(d + '-' + s + '.png') >= 0, d + '-' + s)));
  ['student-home', 'parent-home', 'teacher-home', 'facility-write', 'timetable-list'].forEach((s) => assert.ok(imgs.indexOf('compare-' + s + '.png') >= 0, 'compare-' + s));
  assert.ok(imgs.indexOf('compare-font.png') >= 0);
  // 문서의 토큰 표 값이 실제 CSS와 같다(주색·바탕)
  ['a', 'b', 'c'].forEach((d) => {
    const t = tokensOf(d);
    assert.ok(doc.indexOf('`' + t['--accent'] + '`') >= 0, d + ' --accent ' + t['--accent'] + ' 가 문서에 없다');
    assert.ok(doc.indexOf('`' + t['--bg'] + '`') >= 0, d + ' --bg ' + t['--bg'] + ' 가 문서에 없다');
  });
  // 시안 스크립트가 있다
  ['design/preview/refresh.js', 'design/preview/refresh-compare.js'].forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), f));
});

test('docs/design/refresh/apply.md(D15 2단계 ①): 바꾼 것·할 일 기준·지금/새 사진 10장·점검·확인할 것·건너뛴 것이 있고, 사진이 모두 있고 모두 쓰인다', () => {
  const dir = path.join(ROOT, 'docs', 'design', 'refresh');
  const doc = fs.readFileSync(path.join(dir, 'apply.md'), 'utf8');
  ['결정 85', '`UI.rowLink`', '`UI.cardClass`', '`body.tone-soft`', '노란 띠는 진짜 할 일', '48px 미만 0개', '글자 150%', '선생님이 확인하실 것', '건너뛴 것·확인 못 한 것', 'PR ②', 'Pretendard는 쓰지 않았습니다'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((apply\/[^)]+\.png)\)/g)].map((m) => m[1]);
  assert.strictEqual(imgs.length, 10, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(dir, f)), f + ' 파일이 없다'));
  fs.readdirSync(path.join(dir, 'apply')).filter((f) => f.endsWith('.png')).forEach((f) => assert.ok(imgs.indexOf('apply/' + f) >= 0, f + ' 가 문서에 쓰이지 않았다'));
  // 문서의 "할 일" 표가 실제 코드와 같다: 홈 파일마다 UI.cardClass('todo') 가 건수 조건과 함께 있고, 홈의 .btn 링크는 UI.rowLink 로 바뀌었다
  ['home_admin', 'home_attendance', 'home_duty_manager', 'home_hall_teacher', 'home_homeroom'].forEach((f) => {
    const src = css.readFile('src/ui/' + f + '.html');
    assert.ok(/UI\.cardClass\(.*'todo'/.test(src), f + ' 에 할 일 카드가 없다');
    assert.ok(!/class: 'btn( secondary)?'[^}]*href:/.test(src), f + ' 에 이동용 .btn 이 남아 있다(UI.rowLink 로)');
  });
  assert.ok(/UI\.cardClass\('todo'\)/.test(css.readFile('src/ui/Portal.html')), 'Portal 할 일 카드');
  // 학생·학부모 화면은 tone-soft 클래스를 붙인다
  assert.ok(/tone-soft/.test(css.readFile('src/ui/Index.html')) && /tone-soft/.test(css.readFile('src/ui/screen_shell.html')));
});

test('D15 ②(반응형): Styles.html 에 중단점 두 곳(600·840)·홈 두 열·가운데 대화창·아래 바 끝 정렬·표 머리 고정·hover·포커스(iframe)·scrollbar-gutter 가 있고, 홈은 layoutHome 을 부르며, responsive.md 사진이 모두 있고 모두 쓰인다', () => {
  const styles = css.readFile('src/ui/Styles.html');
  assert.ok(/@media \(min-width: 600px\)/.test(styles) && /@media \(min-width: 840px\)/.test(styles), '중단점 600·840');
  assert.ok(/\.home-cols \{ display: grid; grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\)/.test(styles), '840px 이상 홈 두 열');
  assert.ok(/\.sheet-scrim \{ align-items: center; \}/.test(styles) && /\.sheet \{ max-width: 560px;/.test(styles), '가운데 대화창 560px');
  assert.ok(/\.actionbar \{ justify-content: flex-end;/.test(styles), '아래 바 오른쪽 끝');
  assert.ok(/table\.data thead th[^{]*\{[^}]*position: sticky; top: 0/.test(styles) && /table\.data th:first-child, table\.data td:first-child \{[^}]*position: sticky; left: 0/.test(styles), '표 머리·이름 열 고정');
  assert.ok(/@media \(hover: hover\)/.test(styles) && /\.row-link:hover/.test(styles), 'hover');
  assert.ok(/iframe:focus/.test(styles) && /scrollbar-gutter: stable/.test(styles) && /100dvh/.test(styles) && /85dvh/.test(styles) && /safe-area-inset-top/.test(styles), '포커스·스크롤바·dvh·safe-area');
  assert.ok(/main\.home:has\(> nav\.tabs\)/.test(styles), '역할이 둘 이상일 때 왼쪽 메뉴');
  assert.ok(/body\.tone-soft main\.home \{ max-width: 960px; \}/.test(styles) && /\.pt-cols \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(styles), '학생·학부모 홈 960px 판 두 열');
  assert.ok(/max-width: 720px; \}   \/\* 넓은 화면에서도/.test(styles), '학생·학부모 판은 넓은 화면에서 720px를 넘지 않는 기본값');
  assert.ok(/main p, main \.muted:not\(li \*\):not\(td \*\):not\(th \*\), main \.hint, main \.notice, main \.pt-note, main \.error \{ max-width: 45em; \}/.test(styles), '글 덩어리 한 줄 45em(표·목록 행 제외)');
  assert.ok(/UI\.layoutPortal\(root\)/.test(css.readFile('src/ui/Portal.html')), 'Portal이 두 열 배치를 부른다');
  // 식수·교사 홈이 쓰는 홈 틀: Index.html 이 main.home 을 쓰고 교사 홈에서 layoutHome 을 부른다(학생·학부모는 부르지 않는다)
  const index = css.readFile('src/ui/Index.html');
  assert.ok(/<main class="home">/.test(index) && /role !== 'student' && role !== 'parent'\) UI\.layoutHome\(root\)/.test(index));
  // 출석부 미리보기 iframe은 Tab 순서에서 뺀다(눌러도 되는 것이 없다)
  assert.ok(/class: 'sheet-frame'[^)]*tabindex: '-1'/.test(css.readFile('src/ui/screen_sheet.html')));
  // 교사 홈 OUT 알약: 0명이면 빨강이 아니라 회색
  ['home_admin', 'home_attendance', 'home_hall_teacher'].forEach((f) => assert.ok(/d\.out\.out2 \? UI\.statusPill\('out2'/.test(css.readFile('src/ui/' + f + '.html')), f + ' 퇴실 대상 0명이 빨강'));
  // 문서
  const dir = path.join(ROOT, 'docs', 'design', 'refresh');
  const doc = fs.readFileSync(path.join(dir, 'responsive.md'), 'utf8');
  ['색 타령만 하지 말고', '~599 휴대폰', '840~ 노트북', '가운데 대화창', '머리 행', 'scrollbar-gutter', '1093×560', '1920×1080', 'UI.layoutPortal', '45em', '40px을 허용할지', '나빠진 칸 0', '건너뛴 것·확인 못 한 것', '실제 윈도우 노트북', '목록 + 옆 상세'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((responsive\/[^)]+\.png)\)/g)].map((m) => m[1]);
  assert.strictEqual(imgs.length, 20, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(dir, f)), f + ' 파일이 없다'));
  fs.readdirSync(path.join(dir, 'responsive')).filter((f) => f.endsWith('.png')).forEach((f) => assert.ok(imgs.indexOf('responsive/' + f) >= 0, f + ' 가 문서에 쓰이지 않았다'));
  ['phone', 'laptop'].forEach((k) => ['home-hall', 'home-admin', 'home-owner', 'home-student', 'home-parent', 'facility-write', 'mealcount', 'results', 'seats', 'timetable-confirm'].forEach((sc) => assert.ok(imgs.indexOf('responsive/compare-' + k + '-' + sc + '.png') >= 0, k + ' ' + sc)));
  assert.ok(fs.existsSync(path.join(ROOT, 'design/preview/refresh-responsive.js')) && fs.existsSync(path.join(ROOT, 'design/preview/refresh-responsive-compare.js')));
  // rules.md 2-1절이 같은 중단점을 말한다
  const rules = css.readFile('docs/design/rules.md');
  ['### 2-1. 반응형', '~599px', '600~839px', '840px~', '제안(미적용)', 'UI.layoutHome'].forEach((t) => assert.ok(rules.indexOf(t) >= 0, 'rules.md ' + t));
});

test('D15 ③(화면 전수 점검): 줄 끝 열기 ›·탭 5개 이상 축소·작업 바 높이 따라가기·48px 보정이 코드에 있고, screens-audit.md 사진이 모두 있고 모두 쓰이며 고친 곳·하지 않은 것이 적혀 있다', () => {
  const styles = css.readFile('src/ui/Styles.html');
  assert.ok(/\.btn\.secondary\.row-open \{[^}]*border: 0/.test(styles) && /\.btn\.secondary\.row-open::after \{ content: "›"/.test(styles), '줄 끝 열기 ›');
  assert.ok(/\.segmented\.dense \.seg \{ font-size: \.9rem/.test(styles), '탭 다섯 개 이상 축소');
  assert.ok(/\.seg \{ flex: 1 1 0; min-width: var\(--tap\)/.test(styles) && /ul\.list li a \{ display: inline-flex; align-items: center; min-height: var\(--tap\)/.test(styles), '탭·목록 링크 48px');
  const comp = css.readFile('src/ui/Components.html');
  assert.ok(/\.length >= 5 \? 'segmented dense' : 'segmented'/.test(comp), 'UI.segmented 다섯 개 이상');
  assert.ok(/setProperty\('--bar-h'/.test(comp) && /ResizeObserver/.test(comp), '작업 바 실제 높이를 --bar-h로');
  ['screen_counsel', 'screen_contacts'].forEach((f) => assert.ok(/row-btn row-open/.test(css.readFile('src/ui/' + f + '.html')), f + ' 줄 끝 열기 ›'));
  assert.ok(/min-height:var\(--tap\)/.test(css.readFile('src/ui/screen_mealcount.html')) && /min-width:var\(--tap\)/.test(css.readFile('src/ui/screen_schedule.html')), '식수 링크·일정 요일 칸 48px');
  const dir = path.join(ROOT, 'docs', 'design', 'refresh');
  const doc = fs.readFileSync(path.join(dir, 'screens-audit.md'), 'utf8');
  ['279칸 중 279칸', '나빠진 칸 0', '고친 것', 'Enter로 저장 — 하지 않았다', '타이포 4단계', '목록 + 옆 상세', '건너뛴 것·확인 못 한 것', '실제 윈도우 노트북', '.row-open', '.segmented.dense', '--bar-h'].forEach((t) => assert.ok(doc.indexOf(t) >= 0, t));
  const imgs = [...doc.matchAll(/!\[[^\]]*\]\((screens\/[^)]+\.png)\)/g)].map((m) => m[1]);
  assert.strictEqual(imgs.length, 11, '사진 수 ' + imgs.length);
  imgs.forEach((f) => assert.ok(fs.existsSync(path.join(dir, f)), f + ' 파일이 없다'));
  fs.readdirSync(path.join(dir, 'screens')).filter((f) => f.endsWith('.png')).forEach((f) => assert.ok(imgs.indexOf('screens/' + f) >= 0, f + ' 가 문서에 쓰이지 않았다'));
  assert.ok(fs.existsSync(path.join(ROOT, 'design/preview/refresh-tour.js')) && fs.existsSync(path.join(ROOT, 'design/preview/refresh-tour-sheets.js')));
});

// D15 ④ 시안: list-detail.md 가 사진 9장을 모두 싣고, 시안 단계라고 밝히며, 선택지·건너뛴 것을 적는다
test('D15 ④ 시안 문서: 사진 전부 참조, 시안 단계 명시, 선택지·건너뛴 것', () => {
  const dir = path.join(ROOT, 'docs', 'design', 'refresh');
  const md = fs.readFileSync(path.join(dir, 'list-detail.md'), 'utf8');
  const pics = fs.readdirSync(path.join(dir, 'list-detail')).filter((f) => f.endsWith('.png'));
  assert.ok(pics.length >= 9, '사진 9장 이상');
  pics.forEach((f) => assert.ok(md.includes('list-detail/' + f), f + ' 문서에 없음'));
  assert.match(md, /시안 단계입니다/);
  assert.match(md, /선택지와 권장/);
  assert.match(md, /건너뛴 것·확인 못 한 것/);
});

// D15 ⑤b: 반 고르기(학년 먼저)·서류(알약+열기+시트) — 문서가 사진 15장을 모두 싣고, 화면이 약속을 지킨다
test('D15 ⑤b 반 고르기·서류: 문서·사진·화면 약속', () => {
  const dir = path.join(ROOT, 'docs', 'design', 'refresh');
  const md = fs.readFileSync(path.join(dir, 'docs-results.md'), 'utf8');
  const pics = fs.readdirSync(path.join(dir, 'docs-results')).filter((f) => f.endsWith('.png'));
  assert.ok(pics.length >= 15, '사진 15장 이상');
  pics.forEach((f) => assert.ok(md.includes('docs-results/' + f), f + ' 문서에 없음'));
  assert.match(md, /건너뛴 것·확인 못 한 것/);
  const docs = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'screen_docs.html'), 'utf8');
  assert.ok(/UI\.bottomSheet\(/.test(docs) && /call\('saveDocState'/.test(docs), '시트 + 기존 saveDocState');
  assert.ok(/못 받은 서류 ' \+ m\.length/.test(docs) && /stateRank/.test(docs), '알약 + 못 받은 학생 위로');
  assert.ok(!/doc-line'? \}, \[el\('span', \{ text: t\.name \}\), stateButtons\(s, t\.id\)\]\)\);\s*\n\s*body\.appendChild\(row\)/.test(docs), '줄 안 토글 3개를 없앴다');
  const res = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'screen_results.html'), 'utf8');
  assert.ok(/d\.classes\.length > 8 && grades\.length > 1/.test(res) && /label: '학년'/.test(res), '반 8개 초과면 학년 먼저');

// D15 ⑤a: 목록|상세 적용 — 문서가 사진 18장을 모두 싣고, 두 칸 CSS는 840px 이상에서만, 좁은 화면은 .has-detail 로 번갈아, 줄은 button
test('D15 ⑤a 목록|상세 적용: 문서·사진·CSS 약속', () => {
  const dir = path.join(ROOT, 'docs', 'design', 'refresh');
  const md = fs.readFileSync(path.join(dir, 'list-detail-apply.md'), 'utf8');
  const pics = fs.readdirSync(path.join(dir, 'list-detail-apply')).filter((f) => f.endsWith('.png'));
  assert.ok(pics.length >= 18, '사진 18장 이상');
  pics.forEach((f) => assert.ok(md.includes('list-detail-apply/' + f), f + ' 문서에 없음'));
  ['명단 올리기 두 칸은 하지 않았습니다', 'getCounselRoster', '건너뛴 것·확인 못 한 것'].forEach((w) => assert.ok(md.includes(w), w));
  const styles = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'Styles.html'), 'utf8');
  assert.ok(/@media \(min-width: 840px\) \{[^@]*\.ld \{ display: grid;/.test(styles), '두 칸은 840px 이상에서만');
  assert.ok(/@media \(max-width: 839px\) \{\s*\.ld\.has-detail > \.ld-list \{ display: none; \}/.test(styles), '좁으면 번갈아');
  const counsel = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'screen_counsel.html'), 'utf8');
  assert.ok(/el\('button', \{ type: 'button', class: 'ld-pick'/.test(counsel) && /UI\.util\.studentLabel\(s\)/.test(counsel), '줄은 button, 학생 표기는 앱 표기');
  assert.ok(/if \(!wideMq\.matches\) Nav\.go\(/.test(counsel), '좁을 때만 Nav 기록');
  assert.ok(/call\('getCounselRoster'\)/.test(counsel) && /roster\.filter\(/.test(counsel), '왼쪽 목록은 getCounselRoster, 검색은 목록 안에서');
});
