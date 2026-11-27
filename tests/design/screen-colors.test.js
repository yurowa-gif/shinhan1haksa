/**
 * 화면 파일의 <style> 안에 색을 직접 쓰지 않는다(소유: DESIGN, D23, 결정 88).
 * 색은 Styles.html :root 토큰(var(--…))으로만 쓴다. 꼭 필요한 예외는 아래 ALLOW에 이유와 함께 적는다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { test } = require('../helpers/harness');
const { styleText } = require('./css-util');
const stripComments = function (css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); };

const DIR = path.join(__dirname, '..', '..', 'src', 'ui');
const FILES = fs.readdirSync(DIR).filter(function (f) { return /^(screen_.*|home_.*|Portal)\.html$/.test(f); });

// 파일 → [허용하는 선언 글자, 이유]
const ALLOW = {
  'screen_sheet.html': [
    ['background: #fff', '출석부 미리보기는 인쇄 종이다. 화면 바탕 토큰이 바뀌어도 종이는 흰색이어야 한다(.sheet-box, .sheet-frame)']
  ]
};

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(/;
const NAMED = /:\s*(?:white|black|red|green|blue|gray|grey|orange|yellow|navy|silver)\b/i;

test('화면 파일 <style>에 색을 직접 쓰지 않는다(토큰만)', function () {
  assert.ok(FILES.length >= 30, '화면 파일을 찾지 못함: ' + FILES.length);
  const bad = [];
  FILES.forEach(function (f) {
    const css = stripComments(styleText(fs.readFileSync(path.join(DIR, f), 'utf8')));
    css.split(/[;{}]/).forEach(function (d) {
      let s = d.trim();
      if (!s || s.indexOf(':') < 0) return;
      (ALLOW[f] || []).forEach(function (a) { if (s === a[0]) s = ''; });
      if (COLOR.test(s) || NAMED.test(s)) bad.push(f + ': ' + s);
    });
  });
  assert.deepStrictEqual(bad, []);
});

test('예외 목록은 실제로 쓰이는 것만 둔다', function () {
  Object.keys(ALLOW).forEach(function (f) {
    const css = stripComments(styleText(fs.readFileSync(path.join(DIR, f), 'utf8')));
    ALLOW[f].forEach(function (a) { assert.ok(css.indexOf(a[0]) >= 0, f + ' 에 없는 예외: ' + a[0]); assert.ok(a[1].length > 10, '이유가 없다'); });
  });
});
