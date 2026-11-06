/**
 * Styles.html 읽기 도구(소유: DESIGN). *.test.js 가 아니라서 실행기는 이 파일을 직접 돌리지 않는다.
 * 정규식으로 하는 간단한 CSS 읽기라서 @media 같은 중첩 규칙은 지원하지 않는다(안 쓰기로 한다).
 */
const { readFile } = require('../helpers/harness');

/** <style> 안 글자만 꺼낸다(여러 개면 이어 붙임) */
function styleText(html) {
  const out = [];
  html.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, function (_, css) { out.push(css); return ''; });
  return out.join('\n');
}

/** 주석을 지운다 */
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

/** → [{selectors:[...], decls:{prop:value}}] (@로 시작하는 규칙은 건너뜀) */
function parseRules(css) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(stripComments(css)))) {
    const sel = m[1].trim();
    if (!sel || sel[0] === '@') continue;
    const decls = {};
    m[2].split(';').forEach(function (d) {
      const i = d.indexOf(':');
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    });
    rules.push({ selectors: sel.split(',').map(function (s) { return s.trim(); }), decls: decls });
  }
  return rules;
}

/** :root 토큰 {'--bg':'#f6f7f9', …} */
function rootTokens(rules) {
  const t = {};
  rules.forEach(function (r) {
    if (r.selectors.indexOf(':root') >= 0) Object.keys(r.decls).forEach(function (k) { if (k.indexOf('--') === 0) t[k] = r.decls[k]; });
  });
  return t;
}

/** var(--x) 를 토큰 값으로 바꾼다(한 단계 중첩까지) */
function resolveVars(value, tokens) {
  let v = value;
  for (let i = 0; i < 3; i++) v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, function (_, n) { return tokens[n] !== undefined ? tokens[n] : 'var(' + n + ')'; });
  return v;
}

/** 규칙에서 선택자가 정확히 sel 인 선언들을 합친다(뒤에 나온 것이 이김) */
function declsFor(rules, sel) {
  const out = {};
  rules.forEach(function (r) { if (r.selectors.indexOf(sel) >= 0) Object.assign(out, r.decls); });
  return out;
}

/** 'rgb' 문자열 → [r,g,b] (#rgb, #rrggbb, white/black) */
function parseColor(s) {
  s = String(s).trim().toLowerCase();
  if (s === 'white') return [255, 255, 255];
  if (s === 'black') return [0, 0, 0];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return m[1].split('').map(function (c) { return parseInt(c + c, 16); });
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); });
  return null;
}

function luminance(rgb) {
  const c = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG 대비 비율(1~21) */
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** px 값 읽기: '48px' → 48, 'var(--tap)'은 토큰으로 풀어서 */
function px(value, tokens) {
  const m = /^(-?[\d.]+)px$/.exec(resolveVars(String(value || ''), tokens || {}).trim());
  return m ? Number(m[1]) : null;
}

/** 파일 안에서 쓰는 class 이름들(정적인 것만): class="a b", class: 'a b' */
function usedClasses(html) {
  const found = new Set();
  const add = function (str) {
    if (str.indexOf('<?') >= 0 || str.indexOf('+') >= 0) { // 동적으로 이어 붙이는 값은 정적 낱말만
      str = str.replace(/<\?[\s\S]*?\?>/g, ' ').replace(/['"+]/g, ' ');
    }
    str.split(/\s+/).forEach(function (c) { if (/^[A-Za-z][\w-]*$/.test(c)) found.add(c); });
  };
  let m;
  const a = /\bclass\s*=\s*"([^"]*)"/g;
  while ((m = a.exec(html))) add(m[1]);
  const b = /\bclass\s*:\s*'([^']*)'/g;
  while ((m = b.exec(html))) add(m[1]);
  return found;
}

/** CSS 선택자 안에 나오는 .클래스 이름들 */
function definedClasses(rules) {
  const found = new Set();
  rules.forEach(function (r) {
    r.selectors.forEach(function (s) { s.replace(/\.([A-Za-z][\w-]*)/g, function (_, c) { found.add(c); return ''; }); });
  });
  return found;
}

module.exports = {
  readFile, styleText, parseRules, rootTokens, resolveVars, declsFor, parseColor, contrast, px,
  usedClasses, definedClasses
};
