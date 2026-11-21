/**
 * D19 팔레트 계산(principles.md C1·C2): 색상(H)·최대 채도(C)를 주면 OKLCH에서 12단계를 만들어 16진수로 돌려준다.
 * 같은 단계는 색이 달라도 밝기(L)가 같다. sRGB 밖이면 채도만 줄여 안으로 넣는다. 순수 함수(브라우저·서비스 없음).
 * 실행: node design/preview/concepts/palette.js  → 안마다 토큰(:root)과 대비 측정표를 출력
 */
const L_COLOR = [.992, .976, .952, .928, .900, .862, .805, .700, .520, .470, .400, .250];   // 1~12단계 밝기(색 줄)
const C_COLOR = [.05, .10, .19, .27, .36, .46, .60, .80, 1, .97, .86, .42];                 // 최대 채도에 대한 비율
const L_GRAY = [.992, .978, .958, .935, .908, .872, .820, .620, .540, .490, .440, .215];    // 회색 줄: 8단계는 흰 바탕과 3:1(입력칸 테두리), 11단계는 보조 글자
const C_GRAY = [.25, .35, .45, .55, .65, .75, .85, 1, 1, 1, 1, 1.2];

function toLinear(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
}
function hex(L, C, H) {
  let rgb = toLinear(L, C, H);
  while (C > 0 && rgb.some((v) => v < -.0005 || v > 1.0005)) { C -= .002; rgb = toLinear(L, Math.max(C, 0), H); }
  return '#' + rgb.map((v) => { v = Math.min(1, Math.max(0, v)); v = v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055; return Math.round(v * 255).toString(16).padStart(2, '0'); }).join('');
}
const scale = (H, peak, o) => (o && o.gray ? L_GRAY : (o && o.L) || L_COLOR).map((L, i) => hex(L, peak * (o && o.gray ? C_GRAY : C_COLOR)[i], H));

const lin = (c) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgbOf(h).map(lin); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return Math.round((Math.max(x, y) + .05) / (Math.min(x, y) + .05) * 100) / 100; };
function apca(t, bg) {   // APCA 0.0.98G-4g(참고 눈금)
  const y = (h) => { const [r, g, b] = rgbOf(h).map((c) => (c / 255) ** 2.4); const v = .2126729 * r + .7151522 * g + .072175 * b; return v < .022 ? v + (.022 - v) ** 1.414 : v; };
  const Yt = y(t), Yb = y(bg); if (Math.abs(Yb - Yt) < .0005) return 0;
  if (Yb > Yt) { const S = (Yb ** .56 - Yt ** .57) * 1.14; return S < .1 ? 0 : Math.round((S - .027) * 100); }
  const S = (Yb ** .65 - Yt ** .62) * 1.14; return S > -.1 ? 0 : Math.round((S + .027) * 100);
}

/** 세 안: 주색 색상·세기만 다르고, 단계 구조와 의미 색(성공·주의·위험)은 같다 */
const CONCEPTS = {
  a: { accent: [258, .135], gray: [258, .012] },   // 먹남색 + 푸른 기운 회색
  b: { accent: [205, .105], gray: [215, .014] },   // 청록 + 찬 회색
  c: { accent: [152, .125], gray: [120, .010] }    // 숲초록 + 올리브 기운 회색
};
const SEMANTIC = { ok: [150, .13], cau: [72, .135], dan: [27, .17] };   // 성공·주의·위험(세 안 공통)

function build(id) {
  const c = CONCEPTS[id], t = {};
  scale(c.accent[0], c.accent[1]).forEach((v, i) => { t['a' + (i + 1)] = v; });
  scale(c.gray[0], c.gray[1], { gray: true }).forEach((v, i) => { t['g' + (i + 1)] = v; });
  for (const k in SEMANTIC) scale(SEMANTIC[k][0], SEMANTIC[k][1]).forEach((v, i) => { if ([2, 3, 6, 9, 11].includes(i + 1)) t[k + (i + 1)] = v; });
  return t;
}
const rootCss = (id) => { const t = build(id); return ':root {\n' + Object.keys(t).map((k) => `  --${k}: ${t[k]};`).join('\n') + '\n}\n'; };

/** 짝마다 잰 대비: [이름, 글자, 바탕, 통과선] */
function pairs(id) {
  const t = build(id), W = '#ffffff';
  return [
    ['본문 글자(회색12) / 바탕(회색2)', t.g12, t.g2, 4.5], ['본문 글자 / 흰 판', t.g12, W, 4.5], ['보조 글자(회색11) / 바탕(회색2)', t.g11, t.g2, 4.5], ['보조 글자 / 회색3', t.g11, t.g3, 4.5],
    ['색 글자(주색11) / 흰 판', t.a11, W, 4.5], ['색 글자(주색11) / 주색3', t.a11, t.a3, 4.5], ['흰 글자 / 주 버튼(주색9)', W, t.a9, 4.5], ['흰 글자 / 주색12(어두운 면)', W, t.a12, 4.5],
    ['성공 글자(11) / 성공3', t.ok11, t.ok3, 4.5], ['주의 글자(11) / 주의3', t.cau11, t.cau3, 4.5], ['위험 글자(11) / 위험3', t.dan11, t.dan3, 4.5], ['위험 글자(11) / 흰 판', t.dan11, W, 4.5], ['흰 글자 / 위험9', W, t.dan9, 4.5],
    ['입력칸 테두리(회색8) / 흰 판', t.g8, W, 3], ['초점 링(주색11) / 바탕', t.a11, t.g2, 3], ['구분선(회색6) / 흰 판(꾸밈)', t.g6, W, 0]
  ].map(([name, fg, bg, min]) => ({ name, fg, bg, min, wcag: contrast(fg, bg), apca: apca(fg, bg) }));
}

if (require.main === module) for (const id of Object.keys(CONCEPTS)) {
  console.log('== ' + id + '\n' + rootCss(id));
  for (const p of pairs(id)) console.log((p.min && p.wcag < p.min ? '✗ ' : '  ') + p.name.padEnd(30), p.fg, p.bg, p.wcag, 'Lc', p.apca);
}
module.exports = { build, rootCss, pairs, contrast, apca, CONCEPTS, SEMANTIC };
