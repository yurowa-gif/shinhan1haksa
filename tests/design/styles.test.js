/**
 * D1 증명 테스트(소유: DESIGN): Styles.html 토큰·클래스·크기·대비, docs/design/rules.md와의 일치.
 */
const assert = require('assert');
const { test, listFiles } = require('../helpers/harness');
const css = require('./css-util');

const stylesHtml = css.readFile('src/ui/Styles.html');
const rules = css.parseRules(css.styleText(stylesHtml));
const tokens = css.rootTokens(rules);

const REQUIRED_TOKENS = [
  '--bg', '--card', '--text', '--muted', '--line', '--accent', '--accent-weak', '--warn', '--warn-weak', '--ok',
  '--ok-ink', '--ok-weak', '--caution-ink', '--caution-weak', '--muted-ink', '--muted-weak',
  '--code-hak-ink', '--code-hak-weak', '--code-ga-ink', '--code-ga-weak', '--code-byung-ink', '--code-byung-weak',
  '--out1-ink', '--out1-weak', '--out2', '--out2-ink',
  '--tap', '--bar-h', '--gap', '--radius', '--radius-sm', '--font-base'
];

test('필수 토큰이 :root에 모두 있다', () => {
  const missing = REQUIRED_TOKENS.filter((t) => tokens[t] === undefined);
  assert.deepStrictEqual(missing, []);
});

test('기본 글자는 18px 이상이다(html font-size)', () => {
  const html = css.declsFor(rules, 'html');
  assert.ok(css.px(html['font-size']) >= 18, 'html font-size = ' + html['font-size']);
  assert.ok(css.px(tokens['--font-base']) >= 18);
});

test('누르는 칸 최소 크기 토큰 --tap 은 48px 이상이고 .btn 과 .tab 이 이를 따른다', () => {
  assert.ok(css.px(tokens['--tap']) >= 48);
  ['.btn', '.tab', '.back'].forEach((sel) => {
    const d = css.declsFor(rules, sel);
    assert.ok(css.px(d['min-height'], tokens) >= 44, sel + ' min-height = ' + d['min-height']);
    assert.ok(css.px(d['min-height'], tokens) >= 48, sel + ' 은 48px 이상이어야 한다(규칙 문서)');
  });
  const input = css.declsFor(rules, '.field input');
  assert.ok(css.px(input['min-height'], tokens) >= 48, '.field input min-height');
});

test('화면 파일이 쓰는 class 는 모두 Styles.html 이나 그 파일 안 <style> 에 정의되어 있다', () => {
  const global = css.definedClasses(rules);
  const bad = [];
  for (const f of listFiles('src/ui', ['.html'])) {
    if (f.endsWith('Styles.html')) continue;
    const html = css.readFile(f);
    const local = css.definedClasses(css.parseRules(css.styleText(html)));
    for (const c of css.usedClasses(html)) {
      if (!global.has(c) && !local.has(c)) bad.push(f + ' → .' + c);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('Styles.html 에 외부 주소(url(http…), @import, 웹폰트)가 없다', () => {
  assert.ok(!/url\(\s*['"]?https?:/i.test(stylesHtml));
  assert.ok(!/@import|@font-face/.test(stylesHtml));
});

test('Styles.html 에 가로 스크롤을 만드는 고정 너비(px 360 초과)가 없다', () => {
  const bad = [];
  rules.forEach((r) => {
    ['width', 'min-width'].forEach((k) => {
      const v = css.px(r.decls[k], tokens);
      if (v !== null && v > 360) bad.push(r.selectors.join(',') + ' ' + k + ':' + r.decls[k]);
    });
  });
  assert.deepStrictEqual(bad, []);
});

/* ───── 상태 표시: 대비 + 색만으로 구분하지 않기 ───── */

const PILLS = ['s-confirmed', 's-requested', 's-canceled', 'c-hak', 'c-ga', 'c-byung', 'out-1', 'out-2', 'todo', 'mute'];

function colorOf(sel, prop) {
  const v = css.declsFor(rules, sel)[prop];
  return v ? css.parseColor(css.resolveVars(v, tokens)) : null;
}

test('상태 표시(.pill)의 글자색과 바탕색 대비가 4.5:1 이상이다', () => {
  PILLS.forEach((name) => {
    const sel = '.pill.' + name;
    const fg = colorOf(sel, 'color'), bg = colorOf(sel, 'background');
    assert.ok(fg && bg, sel + ' 에 color·background 가 없다');
    const ratio = css.contrast(fg, bg);
    assert.ok(ratio >= 4.5, sel + ' 대비 ' + ratio.toFixed(2));
  });
});

test('기본 글자·보조 글자·주 버튼·오류·안내 줄 대비가 4.5:1 이상이다', () => {
  const cases = [
    ['본문', tokens['--text'], tokens['--bg']], ['본문(카드)', tokens['--text'], tokens['--card']],
    ['보조 글자', tokens['--muted'], tokens['--bg']], ['보조 글자(카드)', tokens['--muted'], tokens['--card']],
    ['주 버튼', '#fff', tokens['--accent']], ['위험 버튼', '#fff', tokens['--warn']],
    ['오류', tokens['--warn'], tokens['--warn-weak']], ['링크', tokens['--accent'], tokens['--card']],
    ['안내(정보)', tokens['--accent-ink'], tokens['--accent-weak']],
    ['안내(경고)', tokens['--caution-ink'], tokens['--caution-weak']],
    ['안내(확인)', tokens['--ok-ink'], tokens['--ok-weak']],
    ['알림 개수', '#fff', tokens['--warn']]
  ];
  cases.forEach(([name, fg, bg]) => {
    const ratio = css.contrast(css.parseColor(fg), css.parseColor(bg));
    assert.ok(ratio >= 4.5, name + ' 대비 ' + ratio.toFixed(2));
  });
});

test('색만으로 구분하지 않는다: 확정·요청·취소·1OUT·퇴실 대상은 앞 글자(모양)가 서로 다르고, 학·가·병은 테두리 모양이 다르다', () => {
  const shape = {};
  ['s-confirmed', 's-requested', 's-canceled', 'out-1', 'out-2'].forEach((n) => {
    const before = css.declsFor(rules, '.pill.' + n + '::before').content;
    assert.ok(before, '.pill.' + n + '::before content 없음');
    shape[n] = before;
  });
  assert.strictEqual(new Set(Object.values(shape)).size, 5, '앞 글자가 겹친다: ' + JSON.stringify(shape));
  const borders = ['c-hak', 'c-ga', 'c-byung'].map((n) => {
    const d = css.declsFor(rules, '.pill.' + n);
    return d['border-style'] + '/' + (d['border-width'] || '');
  });
  assert.strictEqual(new Set(borders).size, 3, '학·가·병 테두리가 겹친다: ' + borders.join(' , '));
  assert.ok(css.declsFor(rules, '.pill.s-canceled')['text-decoration'].indexOf('line-through') >= 0, '취소는 취소선');
});

test('안내 줄(.error, .notice.*)에도 앞 글자(모양)가 있다', () => {
  ['.error::before', '.notice.warn::before', '.notice.ok::before', '.notice.info::before'].forEach((sel) => {
    assert.ok(css.declsFor(rules, sel).content, sel + ' content 없음');
  });
});

test('하단 작업 바: 화면 아래에 고정되고 본문이 가려지지 않게 여백 규칙이 있다', () => {
  const bar = css.declsFor(rules, '.actionbar');
  assert.strictEqual(bar.position, 'fixed');
  assert.strictEqual(bar.bottom, '0');
  assert.ok(/safe-area-inset-bottom/.test(bar.padding), '아이폰 아래 안전 영역');
  assert.ok(/--bar-h/.test(css.declsFor(rules, 'main.has-actionbar')['padding-bottom']));
});

/* ───── 규칙 문서와 일치 ───── */

test('docs/design/rules.md 에 적힌 토큰(--이름)과 클래스(.이름)가 Styles.html 에 모두 있다', () => {
  const doc = css.readFile('docs/design/rules.md');
  const global = css.definedClasses(rules);
  const missingTokens = [];
  const missingClasses = [];
  // 백틱 안의 것만 본다: `--accent`, `.pill.s-confirmed`
  for (const m of doc.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim();
    if (/^--[a-z0-9-]+$/.test(t) && tokens[t] === undefined) missingTokens.push(t);
    if (/^(?:\.[A-Za-z][\w-]*)+$/.test(t)) {
      t.split('.').filter(Boolean).forEach((c) => { if (!global.has(c)) missingClasses.push(t + ' → ' + c); });
    }
  }
  assert.deepStrictEqual(missingTokens, []);
  assert.deepStrictEqual(missingClasses, []);
});

test('docs/design/rules.md 에 필수 절이 있다', () => {
  const doc = css.readFile('docs/design/rules.md');
  ['## 1. 기준', '## 2. 화면 틀', '## 3. 토큰', '## 4. 상태 표시', '## 5. 문구', '## 6. 확인·사유'].forEach((h) => {
    assert.ok(doc.indexOf(h) >= 0, h + ' 절이 없다');
  });
});

test('CSS 읽기 도구: 대비 계산이 알려진 값과 맞다(나쁜 입력 포함)', () => {
  assert.ok(Math.abs(css.contrast([0, 0, 0], [255, 255, 255]) - 21) < 0.01);
  assert.ok(Math.abs(css.contrast([255, 255, 255], [255, 255, 255]) - 1) < 0.01);
  assert.deepStrictEqual(css.parseColor('#fff'), [255, 255, 255]);
  assert.strictEqual(css.parseColor('rgba(0,0,0,.5)'), null);
  assert.strictEqual(css.px('var(--tap)', { '--tap': '48px' }), 48);
  assert.strictEqual(css.px('3rem'), null);
});

test('Styles.html 은 자습 일정 화면이 자기 <style>에서 쓰는 이름(.cal-day·.cal-nav·.cal-tag·.cal-warn)을 전역으로 정의하지 않는다(근무표 달력은 .duty-day)', () => {
  const styles = css.readFile('src/ui/Styles.html');
  assert.ok(!/\.cal-(day|nav|tag|warn)\b/.test(styles));
  assert.ok(/\.duty-day\b/.test(styles));
});
