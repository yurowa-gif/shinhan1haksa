/**
 * D20 테마 3벌: shadcn/ui 변수 이름(--background, --primary …)으로 적은 값(tweakcn이 내보내는 것과 같은 꼴, OKLCH).
 * 라이브러리는 쓰지 않는다 — CSS 변수만. 앱의 지금 토큰(--bg, --accent …)으로 잇는 것은 base.css의 '다리' 부분.
 * 주의: shadcn의 --accent(옅은 강조 바탕)와 앱의 --accent(주색)가 이름이 겹친다. 시안에서는 shadcn 쪽을 --accent-sh로 내보낸다(적용 때 앱 쪽을 --primary로 바꿔야 함).
 */
const o = (l, c, h) => `oklch(${l} ${c} ${h})`;
const SEM = {   // 의미 색(세 벌 공통 뼈대: 옅은 바탕 L .955, 글자 L .42 — principles.md C5·C6). shadcn에는 없어서 더한 이름
  success: o(.42, .11, 150), 'success-soft': o(.955, .035, 150), warning: o(.42, .095, 70), 'warning-soft': o(.955, .045, 80), 'destructive-soft': o(.955, .03, 27)
};
const THEMES = {
  t1: {
    name: '1 흑백과 형광펜', line: '흰 종이에 검은 글씨, 각진 선. 색은 형광펜 한 가지 — 지금 처리할 숫자에만 긋습니다. 글꼴 Wanted Sans.',
    fonts: { body: '"Wanted Sans Variable"', head: '"Wanted Sans Variable"' }, use: ['wanted'],
    vars: Object.assign({ background: o(1, 0, 0), foreground: o(.17, 0, 0), card: o(1, 0, 0), 'card-foreground': o(.17, 0, 0), popover: o(1, 0, 0), 'popover-foreground': o(.17, 0, 0),
      primary: o(.17, 0, 0), 'primary-foreground': o(1, 0, 0), secondary: o(.955, 0, 0), 'secondary-foreground': o(.17, 0, 0), muted: o(.955, 0, 0), 'muted-foreground': o(.44, 0, 0),
      'accent-sh': o(.93, 0, 0), 'accent-foreground': o(.17, 0, 0), destructive: o(.50, .19, 27), border: o(.87, 0, 0), input: o(.55, 0, 0), ring: o(.17, 0, 0), radius: '0px',
      point: o(.91, .19, 122), 'point-foreground': o(.17, 0, 0),
      'chart-1': o(.17, 0, 0), 'chart-2': o(.55, 0, 0), 'chart-3': o(.80, .17, 122), 'chart-4': o(.50, .19, 27), 'chart-5': o(.75, 0, 0) }, SEM)
  },
  t2: {
    name: '2 한지와 먹', line: '따뜻한 종이 바탕에 먹색 글씨, 명조 제목. 처리할 건수는 붉은 도장으로 찍습니다. 글꼴 함렛(제목·숫자) + SUIT(본문).',
    fonts: { body: '"SUIT Variable"', head: '"Hahmlet Variable"' }, use: ['suit', 'hahmlet'],
    vars: Object.assign({ background: o(.968, .013, 85), foreground: o(.24, .018, 55), card: o(.988, .008, 85), 'card-foreground': o(.24, .018, 55), popover: o(.988, .008, 85), 'popover-foreground': o(.24, .018, 55),
      primary: o(.27, .02, 55), 'primary-foreground': o(.98, .01, 85), secondary: o(.93, .018, 85), 'secondary-foreground': o(.24, .018, 55), muted: o(.93, .018, 85), 'muted-foreground': o(.45, .025, 60),
      'accent-sh': o(.91, .025, 85), 'accent-foreground': o(.24, .018, 55), destructive: o(.45, .16, 22), border: o(.85, .025, 80), input: o(.58, .03, 70), ring: o(.27, .02, 55), radius: '3px',
      point: o(.53, .19, 33), 'point-foreground': o(.98, .01, 85),
      'chart-1': o(.27, .02, 55), 'chart-2': o(.53, .19, 33), 'chart-3': o(.60, .06, 80), 'chart-4': o(.45, .07, 150), 'chart-5': o(.78, .03, 80) }, SEM)
  },
  t3: {
    name: '3 감색 면', line: '머리줄과 첫 영역을 진한 감색 한 면으로 잇고, 그 위에 큰 숫자를 살구색으로 올립니다. 아래는 조용한 흰 바탕. 글꼴 Pretendard.',
    fonts: { body: '"Pretendard Variable"', head: '"Pretendard Variable"' }, use: ['pretendard'],
    vars: Object.assign({ background: o(.978, .004, 268), foreground: o(.21, .03, 268), card: o(1, 0, 0), 'card-foreground': o(.21, .03, 268), popover: o(1, 0, 0), 'popover-foreground': o(.21, .03, 268),
      primary: o(.30, .095, 268), 'primary-foreground': o(.98, .01, 268), secondary: o(.945, .012, 268), 'secondary-foreground': o(.21, .03, 268), muted: o(.945, .012, 268), 'muted-foreground': o(.45, .03, 268),
      'accent-sh': o(.92, .025, 268), 'accent-foreground': o(.21, .03, 268), destructive: o(.50, .19, 27), border: o(.89, .012, 268), input: o(.58, .025, 268), ring: o(.30, .095, 268), radius: '12px',
      point: o(.85, .125, 68), 'point-foreground': o(.21, .03, 268),
      'chart-1': o(.30, .095, 268), 'chart-2': o(.70, .14, 60), 'chart-3': o(.55, .10, 268), 'chart-4': o(.50, .11, 150), 'chart-5': o(.80, .04, 268) }, SEM)
  }
};
const rootCss = (id) => { const t = THEMES[id]; return ':root {\n' + Object.keys(t.vars).map((k) => `  --${k}: ${t.vars[k]};`).join('\n') + `\n  --font-body: ${t.fonts.body}; --font-head: ${t.fonts.head};\n}\n`; };
module.exports = { THEMES, rootCss };
