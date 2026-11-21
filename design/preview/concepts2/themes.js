/**
 * D20 테마 3벌: **tweakcn 프리셋의 light 값을 그대로** 옮긴 것(지어낸 팔레트 아님).
 *   출처: github.com/jnsahaj/tweakcn (Apache-2.0), utils/theme-presets.ts, 커밋 a3b47b3 — "supabase" · "neo-brutalism" · "vintage-paper".
 *   NOTICE: Copyright tweakcn authors. Licensed under the Apache License, Version 2.0. 바꾼 값은 아래 adjust에 이유와 함께 적는다(Apache-2.0 4조 b: 바꾼 곳 표시).
 * 변수 이름은 shadcn/ui 것 그대로(라이브러리 없이 CSS 변수만). 단, shadcn의 --accent·--muted는 앱의 --accent(주색)·--muted(보조 글자색)와 이름이 겹쳐 --accent-sh·--muted-sh로 내보낸다.
 * 글꼴: 프리셋의 라틴 글꼴(Outfit·DM Sans·Libre Baskerville)을 성격이 같은 한글 글꼴로 바꾼다.
 */
const SEM = { success: '#0f6b35', 'success-soft': '#e4f4e7', warning: '#6b4400', 'warning-soft': '#fbecd6', 'destructive-soft': '#fde9e6' };   // shadcn에 없는 의미 색(principles.md C5): 확정·주의·위험 옅은 바탕
const THEMES = {
  t1: {
    name: '1 Supabase', preset: 'supabase', line: 'tweakcn 프리셋 Supabase — 강의가 "깔끔한 실무용"으로 꼽은 것. 거의 흰 바탕에 민트 한 색, 홈은 벤토(도시락 칸) 배치. 글꼴 Pretendard.',
    fonts: { body: '"Pretendard Variable"', head: '"Pretendard Variable"' }, use: ['pretendard'], presetFont: 'Outfit',
    preset_light: { background: '#fcfcfc', foreground: '#171717', card: '#fcfcfc', 'card-foreground': '#171717', popover: '#fcfcfc', 'popover-foreground': '#525252', primary: '#72e3ad', 'primary-foreground': '#1e2723',
      secondary: '#fdfdfd', 'secondary-foreground': '#171717', muted: '#ededed', 'muted-foreground': '#202020', accent: '#ededed', 'accent-foreground': '#202020', destructive: '#ca3214', 'destructive-foreground': '#fffcfc',
      border: '#dfdfdf', input: '#f6f6f6', ring: '#72e3ad', 'chart-1': '#72e3ad', 'chart-2': '#3b82f6', 'chart-3': '#8b5cf6', 'chart-4': '#f59e0b', 'chart-5': '#10b981', radius: '0.5rem',
      'shadow-color': '#000000', 'shadow-opacity': '0.17', 'shadow-blur': '3px', 'shadow-spread': '0px', 'shadow-offset-x': '0px', 'shadow-offset-y': '1px', 'letter-spacing': '0.025em' },
    adjust: [
      ['field-border', '(없음 → 새로)', '#8a8a8a', '입력칸 테두리: 프리셋 input #f6f6f6은 흰 바탕과 1.07:1 → 3:1 기준(3.36:1)에 맞는 값을 따로 둠'],
      ['focus', 'ring #72e3ad', '#171717 바깥선 + 민트 3px', '초점 링: 민트만으로는 흰 바탕과 1.54:1 → 검은 바깥선을 함께'],
      ['letter-spacing', '0.025em', '0', '한글 본문은 자간 0(principles T1)']
    ]
  },
  t2: {
    name: '2 Neo Brutalism', preset: 'neo-brutalism', line: 'tweakcn 프리셋 Neo Brutalism — 검은 굵은 테두리, 번지지 않는 4px 그림자, 빨강·노랑·파랑 원색, 모서리 0. 글꼴 검은고딕(제목·숫자) + Wanted Sans.',
    fonts: { body: '"Wanted Sans Variable"', head: '"Black Han Sans"' }, use: ['wanted', 'blackhan'], presetFont: 'DM Sans / Space Mono',
    preset_light: { background: '#ffffff', foreground: '#000000', card: '#ffffff', 'card-foreground': '#000000', popover: '#ffffff', 'popover-foreground': '#000000', primary: '#ff3333', 'primary-foreground': '#ffffff',
      secondary: '#ffff00', 'secondary-foreground': '#000000', muted: '#f0f0f0', 'muted-foreground': '#333333', accent: '#0066ff', 'accent-foreground': '#ffffff', destructive: '#000000', 'destructive-foreground': '#ffffff',
      border: '#000000', input: '#000000', ring: '#ff3333', 'chart-1': '#ff3333', 'chart-2': '#ffff00', 'chart-3': '#0066ff', 'chart-4': '#00cc00', 'chart-5': '#cc00cc', radius: '0px',
      'shadow-color': '#000000', 'shadow-opacity': '1', 'shadow-blur': '0px', 'shadow-spread': '0px', 'shadow-offset-x': '4px', 'shadow-offset-y': '4px', 'letter-spacing': '0em' },
    adjust: [
      ['primary-foreground', '#ffffff', '#000000', '빨강 버튼 위 흰 글자는 3.64:1 → 검은 글자 5.77:1(빨강 값은 그대로)'],
      ['field-border', 'input #000000', '#000000', '그대로(21:1)'],
      ['focus', 'ring #ff3333', '#000000 바깥선 + 파랑 3px', '초점 링: 빨강은 흰 바탕과 3.64:1이지만 주 버튼과 같은 색이라 구분이 안 됨 → 프리셋의 accent 파랑을 씀']
    ]
  },
  t3: {
    name: '3 Vintage Paper', preset: 'vintage-paper', line: 'tweakcn 프리셋 Vintage Paper — 누런 종이 바탕, 갈색 잉크, 옆으로 떨어지는 부드러운 그림자, 모서리 4px. 글꼴 함렛(명조) 한 종.',
    fonts: { body: '"Hahmlet Variable"', head: '"Hahmlet Variable"' }, use: ['hahmlet'], presetFont: 'Libre Baskerville / Lora',
    preset_light: { background: '#f5f1e6', foreground: '#4a3f35', card: '#fffcf5', 'card-foreground': '#4a3f35', popover: '#fffcf5', 'popover-foreground': '#4a3f35', primary: '#a67c52', 'primary-foreground': '#ffffff',
      secondary: '#e2d8c3', 'secondary-foreground': '#5c4d3f', muted: '#ece5d8', 'muted-foreground': '#7d6b56', accent: '#d4c8aa', 'accent-foreground': '#4a3f35', destructive: '#b54a35', 'destructive-foreground': '#ffffff',
      border: '#dbd0ba', input: '#dbd0ba', ring: '#a67c52', 'chart-1': '#a67c52', 'chart-2': '#8d6e4c', 'chart-3': '#735a3a', 'chart-4': '#b3906f', 'chart-5': '#c0a080', radius: '0.25rem',
      'shadow-color': '#3a322c', 'shadow-opacity': '0.12', 'shadow-blur': '5px', 'shadow-spread': '0px', 'shadow-offset-x': '2px', 'shadow-offset-y': '3px', 'letter-spacing': '0em' },
    adjust: [
      ['primary', '#a67c52', '#8a6239', '주 버튼 위 흰 글자 3.73:1 → 같은 색상에서 어둡게 5.40:1'],
      ['ring', '#a67c52', '#8a6239', 'primary와 같이'],
      ['muted-foreground', '#7d6b56', '#6b5a47', '보조 글자: 종이 바탕 4.53:1·옅은 바탕(muted) 위 4.5 미만 → 5.85:1 / 5.27:1'],
      ['field-border', 'input #dbd0ba', '#8c7a62', '입력칸 테두리 1.49:1 → 4.04:1(3:1 기준)'],
      ['shadow-color', 'hsl(28 13% 20%)', '#3a322c', '같은 색을 16진수로 적음(값 변화 없음)']
    ]
  }
};
function vars(id) {
  const t = THEMES[id], v = Object.assign({}, t.preset_light, SEM);
  for (const [k, , to] of t.adjust) if (/^#/.test(to) && k !== 'focus') v[k] = to;
  if (!v['field-border']) v['field-border'] = v.input;
  v['focus-ink'] = v.foreground; v['focus-halo'] = id === 't2' ? v.accent : v.ring;
  v['accent-sh'] = v.accent; delete v.accent; v['muted-sh'] = v.muted; delete v.muted;   // 앱 토큰과 이름이 겹치는 둘(--accent 주색, --muted 보조 글자색)은 -sh를 붙여 내보낸다 v['letter-spacing'] = '0';
  // tweakcn의 그림자 계산(utils/shadows.ts)과 같은 식: shadow-xs = 한 겹(불투명도 ½), shadow-sm = 두 겹
  const a = (m) => Math.round(Math.min(1, parseFloat(v['shadow-opacity']) * m) * 100), col = (m) => `color-mix(in srgb, ${v['shadow-color']} ${a(m)}%, transparent)`;
  const base = `${v['shadow-offset-x']} ${v['shadow-offset-y']} ${v['shadow-blur']} ${v['shadow-spread']}`, sp = (parseFloat(v['shadow-spread']) - 1) + 'px';
  v['shadow-xs'] = `${base} ${col(.5)}`; v['shadow-sm'] = `${base} ${col(1)}, ${v['shadow-offset-x']} 1px 2px ${sp} ${col(1)}`; v['shadow-lg'] = `${base} ${col(1)}, ${v['shadow-offset-x']} 4px 6px ${sp} ${col(1)}`;
  return v;
}
const rootCss = (id) => { const t = THEMES[id], v = vars(id); return ':root {\n' + Object.keys(v).map((k) => `  --${k}: ${v[k]};`).join('\n') + `\n  --font-body: ${t.fonts.body}; --font-head: ${t.fonts.head};\n}\n`; };
module.exports = { THEMES, rootCss, vars };
