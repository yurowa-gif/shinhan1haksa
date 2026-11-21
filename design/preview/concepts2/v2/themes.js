/**
 * D21 테마 4벌(2차본): **tweakcn 프리셋의 light 값을 그대로** 옮긴 것(지어낸 팔레트 아님).
 *   출처: github.com/jnsahaj/tweakcn (Apache-2.0), utils/theme-presets.ts, 커밋 a3b47b3 — "mono" · "vintage-paper" · "starry-night" · "supabase".
 *   NOTICE: Copyright tweakcn authors. Licensed under the Apache License, Version 2.0. 바꾼 값은 아래 adjust에 이유와 함께 적는다(Apache-2.0 4조 b: 바꾼 곳 표시).
 * 변수 이름은 shadcn/ui 것 그대로(라이브러리 없이 CSS 변수만). 단, shadcn의 --accent·--muted는 앱의 --accent(주색)·--muted(보조 글자색)와 이름이 겹쳐 --accent-sh·--muted-sh로 내보낸다.
 * 글꼴: 프리셋의 라틴 글꼴(Outfit·DM Sans·Libre Baskerville)을 성격이 같은 한글 글꼴로 바꾼다.
 */
const SEM = { success: '#0f6b35', 'success-soft': '#e4f4e7', warning: '#6b4400', 'warning-soft': '#fbecd6', 'destructive-soft': '#fde9e6' };   // shadcn에 없는 의미 색(principles.md C5): 확정·주의·위험 옅은 바탕
const THEMES = {
  m: {
    name: '가 Mono + 형광펜', preset: 'mono', line: 'tweakcn 프리셋 Mono — 흰 바탕·검은 글씨·회색 버튼, 모서리 0, 그림자 없음. 여기에 1차본의 형광펜 한 가지를 더했습니다(지금 처리할 숫자에만). 글꼴 Wanted Sans.',
    fonts: { body: '"Wanted Sans Variable"', head: '"Wanted Sans Variable"' }, use: ['wanted'], presetFont: 'Geist Mono',
    preset_light: { background: '#ffffff', foreground: '#0a0a0a', card: '#ffffff', 'card-foreground': '#0a0a0a', popover: '#ffffff', 'popover-foreground': '#0a0a0a', primary: '#737373', 'primary-foreground': '#fafafa',
      secondary: '#f5f5f5', 'secondary-foreground': '#171717', muted: '#f5f5f5', 'muted-foreground': '#717171', accent: '#f5f5f5', 'accent-foreground': '#171717', destructive: '#e7000b', 'destructive-foreground': '#f5f5f5',
      border: '#e5e5e5', input: '#e5e5e5', ring: '#a1a1a1', 'chart-1': '#737373', 'chart-2': '#737373', 'chart-3': '#737373', 'chart-4': '#737373', 'chart-5': '#737373', radius: '0rem',
      'shadow-color': '#000000', 'shadow-opacity': '0', 'shadow-blur': '0px', 'shadow-spread': '0px', 'shadow-offset-x': '0px', 'shadow-offset-y': '1px', 'letter-spacing': '0em' },
    adjust: [
      ['muted-foreground', '#717171', '#6b6b6b', '보조 글자: 옅은 바탕(muted #f5f5f5) 위 4.48:1 → 4.89:1'],
      ['destructive-foreground', '#f5f5f5', '#ffffff', '위험 버튼 위 글자 4.38:1 → 4.77:1'],
      ['field-border', 'input #e5e5e5', '#8a8a8a', '입력칸 테두리 1.26:1 → 3.5:1(3:1 기준)'],
      ['focus', 'ring #a1a1a1', '#0a0a0a 바깥선 + 회색 3px', '초점 링: 회색만으로는 2.58:1'],
      ['point', '(프리셋에 없음)', '#d6f53a', '더한 값: 1차본의 형광펜. 건수·hero 숫자 뒤에만(검은 글자와 16:1)']
    ]
  },
  p: {
    name: '나 Vintage Paper', preset: 'vintage-paper', line: 'tweakcn 프리셋 Vintage Paper — 누런 종이 바탕, 갈색 잉크, 옆으로 떨어지는 부드러운 그림자, 모서리 4px. 글꼴 함렛(명조) 한 종.',
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
  },
  n: {
    name: '다 Starry Night', preset: 'starry-night', line: 'tweakcn 프리셋 Starry Night — 감색 주색에 호박색 보조색. 머리줄과 hero를 감색 한 면으로 잇고 큰 숫자를 호박색으로 올립니다(1차본 감색 면에 가장 가까운 프리셋). 글꼴 함렛(제목·숫자) + Pretendard(본문).',
    fonts: { body: '"Pretendard Variable"', head: '"Hahmlet Variable"' }, use: ['pretendard', 'hahmlet'], presetFont: 'Libre Baskerville',
    preset_light: { background: '#f5f7fa', foreground: '#1a2238', card: '#e3eaf2', 'card-foreground': '#1a2238', popover: '#fffbe6', 'popover-foreground': '#1a2238', primary: '#3a5ba0', 'primary-foreground': '#fffbe6',
      secondary: '#f7c873', 'secondary-foreground': '#1a2238', muted: '#e5e5df', 'muted-foreground': '#3a5ba0', accent: '#6ea3c1', 'accent-foreground': '#fffbe6', destructive: '#2d1e2f', 'destructive-foreground': '#fffbe6',
      border: '#b0b8c1', input: '#6ea3c1', ring: '#f7c873', 'chart-1': '#3a5ba0', 'chart-2': '#f7c873', 'chart-3': '#6ea3c1', 'chart-4': '#b0b8c1', 'chart-5': '#2d1e2f', radius: '0.5rem',
      'shadow-color': '#000000', 'shadow-opacity': '0.1', 'shadow-blur': '3px', 'shadow-spread': '0px', 'shadow-offset-x': '0', 'shadow-offset-y': '1px', 'letter-spacing': '0em' },
    adjust: [
      ['accent-foreground', '#fffbe6', '#1a2238', '하늘색(accent) 위 크림색 글자 2.63:1 → 감색 글자 5.77:1'],
      ['field-border', 'input #6ea3c1', '#47778f', '입력칸 테두리 2.55:1 → 4.55:1(같은 색상에서 어둡게)'],
      ['focus', 'ring #f7c873', '#1a2238 바깥선 + 호박색 3px', '초점 링: 호박색만으로는 밝은 바탕에서 약함'],
      ['shadow', '(프리셋에 그림자 값 없음)', 'tweakcn 기본값', '프리셋이 그림자를 정하지 않아 tweakcn의 기본 그림자(검정 10%, 1px 3px)를 씀']
    ]
  },
  s: {
    name: '라 Supabase', preset: 'supabase', line: 'tweakcn 프리셋 Supabase — 강의가 "깔끔한 실무용"으로 꼽은 것. 거의 흰 바탕에 민트 한 색, 홈은 벤토(도시락 칸) 배치. 글꼴 Pretendard.',
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
  }
};
function vars(id) {
  const t = THEMES[id], v = Object.assign({}, t.preset_light, SEM);
  for (const [k, , to] of t.adjust) if (/^#/.test(to) && k !== 'focus') v[k] = to;
  if (!v['field-border']) v['field-border'] = v.input;
  v['focus-ink'] = v.foreground; v['focus-halo'] = v.ring; if (!v.point) v.point = v.secondary;
  v['accent-sh'] = v.accent; delete v.accent; v['muted-sh'] = v.muted; delete v.muted;   // 앱 토큰과 이름이 겹치는 둘(--accent 주색, --muted 보조 글자색)은 -sh를 붙여 내보낸다 v['letter-spacing'] = '0';
  // tweakcn의 그림자 계산(utils/shadows.ts)과 같은 식: shadow-xs = 한 겹(불투명도 ½), shadow-sm = 두 겹
  const a = (m) => Math.round(Math.min(1, parseFloat(v['shadow-opacity']) * m) * 100), col = (m) => `color-mix(in srgb, ${v['shadow-color']} ${a(m)}%, transparent)`;
  const base = `${v['shadow-offset-x']} ${v['shadow-offset-y']} ${v['shadow-blur']} ${v['shadow-spread']}`, sp = (parseFloat(v['shadow-spread']) - 1) + 'px';
  v['shadow-xs'] = `${base} ${col(.5)}`; v['shadow-sm'] = `${base} ${col(1)}, ${v['shadow-offset-x']} 1px 2px ${sp} ${col(1)}`; v['shadow-lg'] = `${base} ${col(1)}, ${v['shadow-offset-x']} 4px 6px ${sp} ${col(1)}`;
  return v;
}
const rootCss = (id) => { const t = THEMES[id], v = vars(id); return ':root {\n' + Object.keys(v).map((k) => `  --${k}: ${v[k]};`).join('\n') + `\n  --font-body: ${t.fonts.body}; --font-head: ${t.fonts.head};\n}\n`; };
module.exports = { THEMES, rootCss, vars };
