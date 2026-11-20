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
  // 이 PR은 화면 코드·공통 스타일을 바꾸지 않는다(시안 CSS가 Styles.html 안에 섞여 들어오지 않았다)
  assert.ok(css.readFile('src/ui/Styles.html').indexOf('--signal') < 0, 'Styles.html 에 시안 토큰이 들어왔다');
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
