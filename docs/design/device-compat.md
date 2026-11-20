# 기기 호환 점검표 — 윈도우 노트북 Chrome · 아이폰 · 안드로이드 · 카카오톡

> 2026-11-20 자료조사 세션(W2). 선생님 요청: "노트북 윈도우 크롬창으로도 잘 열리고 휴대폰 안드로이드나 아이폰에서도 잘 운용이 되어야 해."
> 각 항목은 **문제 → 우리 앱 영향 → 대응(CSS·안내문·0단계 진단 항목)** 순서. 근거 링크를 달았고, 공식 문서로 확인하지 못한 것은 **미확인**이라고 적었다.
> 문서만이다. 고치는 일은 DESIGN(D15)·코딩 세션이 한다. "지금 상태"는 main `7c2deda`의 `src/ui/Styles.html`·`src/Code.gs` 기준.

## 0. 우선순위 한눈에

| 순위 | 항목 | 왜 | 누가 |
| --- | --- | --- | --- |
| **1** | 카카오톡으로 받은 링크 → Google 로그인 막힘(1절) | 학생·학부모 대부분이 링크를 카톡으로 받는다. 막히면 앱을 아예 못 연다 | 안내문(코딩) + 0단계 진단 |
| **2** | 구글 계정 여러 개 로그인(5.4절) | 학생은 학교·개인 계정이 둘 다 로그인된 휴대폰이 많다. "파일을 열 수 없습니다" | 안내문 + 0단계 진단 |
| 3 | 아이폰 키보드가 아래 고정 바를 가림(2.3절) | 입력이 많은 교사 화면에서 [저장]이 가려질 수 있다 | DESIGN 실기기 확인 |
| 4 | 넓은 노트북 화면에서 720px 한 줄이 휑함(4.5절) | 선생님이 지적한 "PC에서 별로" | DESIGN(D15) |
| 5 | 그 밖의 CSS 항목 | 대부분 이미 맞게 되어 있다(아래 "지금 상태") | DESIGN |

---

## 1. 카카오톡 인앱 브라우저 — 1순위

### 1.1 문제

- 카카오톡 대화방에서 링크를 누르면 카카오톡 **안의 브라우저(인앱 브라우저)**로 열린다.
- Google은 앱 안 웹뷰(embedded webview)에서의 Google 로그인을 막는다. 2021년 9월 30일부터 모든 임베디드 웹뷰를 막는다고 공지했고, 막히면 `403 disallowed_useragent` 오류가 난다. — [Google Developers Blog, 2021-06](https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html)
- 카카오톡 인앱 브라우저에서 Google 로그인이 403으로 막히는 일은 카카오 개발자 포럼에 여러 해 보고되어 있고, 카카오 담당자는 "구글에서 카카오 인앱브라우저의 요청을 차단하는 이슈로 카카오 측 대응이 불가"라고 답했다. — [Kakao DevTalk: disallowed_useragent](https://devtalk.kakao.com/t/disallowed-useragent/30703), [인앱 브라우저 구글 OAuth 403 에러](https://devtalk.kakao.com/t/oauth-403/117012)
- 카카오톡 인앱 브라우저는 User-Agent에 `KAKAOTALK`을 넣는다(카카오 공식 문서가 이것으로 인앱 여부를 확인하라고 안내). — [Kakao Developers: 카카오 로그인 활용](https://developers.kakao.com/docs/latest/ko/kakaologin/utilize)

### 1.2 우리 앱 영향

- 우리 앱은 Apps Script 웹앱이라 처음 열 때 Google 계정 로그인 화면(accounts.google.com)을 거친다. 위 정책은 OAuth 인증 엔드포인트에 대한 것이라 **Apps Script 웹앱 로그인에도 똑같이 적용되는지는 공식 문서로 확인하지 못했다(미확인)**. 다만 같은 Google 로그인 화면을 쓰므로 막힐 가능성이 높다고 본다(추정).
- 이미 Google에 로그인된 상태(쿠키)가 인앱 브라우저에는 없으므로, 카톡에서 처음 여는 학생·학부모는 거의 모두 로그인 화면을 만난다.
- 지금 앱에는 인앱 브라우저를 알아채는 코드가 없다(`KAKAOTALK` 검사 없음).

### 1.3 대응

| 대응 | 무엇 | 비고 |
| --- | --- | --- |
| **0단계 진단 항목에 추가(먼저)** | 아이폰·안드로이드에서 카카오톡 대화방 링크로 앱 열기 → 로그인 되는지, 막히면 화면 사진 | 실제로 막히는지 확인해야 아래 대응 범위가 정해진다 |
| 링크를 보낼 때 안내 | 가정통신문·카톡 공지에 "링크를 길게 눌러 **다른 브라우저로 열기**(아이폰은 Safari, 안드로이드는 Chrome·삼성 인터넷)" 한 줄 | 코드 없이 바로 할 수 있다 |
| 앱 첫 화면 안내 | `doGet`이 요청 정보를 볼 수 없으므로(서버는 User-Agent를 받지 못함 — 미확인) **브라우저 쪽**에서 `navigator.userAgent`에 `KAKAOTALK`이 있으면 "카카오톡 안에서는 로그인이 안 될 수 있습니다. 오른쪽 아래 ⋯ → 다른 브라우저로 열기를 눌러 주세요." 안내 | 단, 로그인 화면이 앱보다 먼저 뜨므로 **이미 막혔다면 이 안내가 보이지 않는다.** 그래서 링크를 보낼 때 안내가 더 중요하다 |
| 자동으로 외부 브라우저 열기 | `kakaotalk://web/openExternal?url=…`로 이동시키는 방법이 개발자들 사이에 쓰인다 | **카카오 공식 문서에서 찾지 못함(미확인).** [커뮤니티 예시(gist)](https://gist.github.com/hongggyelim/934a94c8c61f3e893347f8be12f259cd), [DevTalk 문의](https://devtalk.kakao.com/t/branch/151358). 막히기 전에 쓸 수 있는 곳(로그인 전 랜딩)이 Apps Script에는 없어 효과도 불확실 |
| 링크 자체를 바꾸기 | 학교 홈페이지·QR 코드로 안내(카톡을 거치지 않게) | 학부모용 |

> 제안: 0단계 진단표에 "카카오톡 링크로 열기" 행을 넣고, 결과가 나오기 전까지는 **링크 보낼 때 안내문**으로 대응한다.

---

## 2. 아이폰(Safari, iOS의 모든 브라우저)

iOS에서는 Chrome·삼성 인터넷도 Safari와 같은 WebKit 엔진을 쓴다. — [web.dev: viewport units](https://web.dev/blog/viewport-units)

### 2.1 입력 칸을 누르면 화면이 확대됨

- **문제:** 입력 칸의 글자가 16px보다 작으면 칸을 누를 때 Safari가 화면을 확대한다. — [CSS-Tricks](https://css-tricks.com/?p=339455), [West Wind 블로그](https://weblog.west-wind.com/posts/2023/Apr/17/Preventing-iOS-Textbox-Auto-Zooming-and-ViewPort-Sizing)
- **지금 상태:** `html { font-size: 18px }`, `.field input/select/textarea { font: inherit }` → 기본 18px라 **대부분 괜찮다.** `.chip`·`.seg`도 1rem.
- **확인할 것:** `.field` 밖의 입력 칸(예: 학생 검색 칸, `screen_exceptions.html`의 시각 칸, 시트 안 사유 칸)에 0.9rem처럼 작은 글자를 주면 16.2px 아래로 내려갈 수 있다(18×0.9=16.2는 괜찮지만 .85rem=15.3px은 확대됨). **입력 칸에는 0.9rem 미만을 쓰지 않는다**를 rules에 넣자.
- **하지 말 것:** viewport에 `maximum-scale=1`·`user-scalable=no`를 넣어 막는 방법은 확대 기능을 빼앗아 접근성에 나쁘다. — [HeroUI 이슈 #5326](https://github.com/heroui-inc/heroui/issues/5326)

### 2.2 화면 높이(100vh·dvh)

- **문제:** 휴대폰 주소창이 나타났다 사라지면 `100vh`가 실제 보이는 높이보다 커서 아래가 잘린다. `dvh`(동적 높이)는 Safari 15.4, Chrome 108, 삼성 인터넷 21부터 된다. — [web.dev: The large, small, and dynamic viewport units](https://web.dev/blog/viewport-units)
- **지금 상태:** 바텀 시트 `.sheet { max-height: 85vh }`.
- **대응:** `max-height: 85vh; max-height: 85dvh;`처럼 두 줄로(옛 브라우저는 앞줄을 씀).

### 2.3 키보드가 올라오면 아래 고정 바

- **문제:** iOS Safari는 키보드가 올라와도 레이아웃 높이를 줄이지 않아 `position: fixed; bottom: 0`인 바가 **키보드 뒤에 가려지거나** 엉뚱한 곳에 남는다. Chrome(안드로이드)은 `interactive-widget=resizes-content` 메타로 고를 수 있지만 Safari 지원은 확인하지 못했다(미확인). — [Chrome for Developers: viewport resize behavior](https://developer.chrome.com/blog/viewport-resize-behavior), [WebKit 버그 230225](https://bugs.webkit.org/show_bug.cgi?id=230225)
- **지금 상태:** `.actionbar { position: fixed; bottom: 0 }`, `.toast`도 아래 고정.
- **우리 앱 영향:** 아래 바의 [저장]은 보통 입력을 마친 뒤 누르므로, 키보드를 닫으면 다시 보인다. 큰 문제는 **입력 중에 바가 칸을 가리는 경우**(시트 안 사유 입력 등).
- **대응:** ① 실기기(아이폰)에서 특이사항·OUT·입퇴실 화면의 입력 중 모습을 찍어 본다(DESIGN). ② 가려지면 `window.visualViewport`의 `resize`로 바를 숨기거나 올리는 작은 스크립트(커뮤니티 방법, 공식 권고 아님). ③ 바텀 시트 안에서는 주 버튼을 시트 맨 아래 **본문 흐름 안**에 두면 키보드와 다투지 않는다.

### 2.4 노치·홈 막대(safe-area)

- **지금 상태:** `.actionbar`·`.toast`·`.sheet`가 `env(safe-area-inset-bottom)`을 이미 쓴다.
- **확인할 것:** `env(safe-area-inset-*)`은 viewport 메타에 `viewport-fit=cover`가 있어야 값이 들어오고, 우리 앱은 Apps Script iframe 안에서 돌기 때문에 **iframe 안에서 값이 0으로 나오는지(미확인)**. 0이면 홈 막대와 버튼이 조금 겹칠 수 있으니 아이폰 실기기 사진으로 확인.

### 2.5 날짜·시각 입력

- `input type="date"`·`"time"`은 iOS에서 바퀴(휠) 선택기로 뜬다. 모양을 CSS로 거의 못 바꾸고, 칸 안 글자 정렬이 다른 칸과 다를 수 있다.
- **지금 상태:** `UI` 날짜 칸(`Components.html:180`)·시각 칸(`screen_exceptions.html:116`, `screen_facility.html:63`)이 기본 입력을 쓴다 → 휴대폰에서 고르기는 편하다(유지).
- **대응:** 칸 높이를 `--tap`(48px)으로 맞추고, 빈 칸일 때 무엇을 고르는지 위에 라벨(칸 안 안내글은 iOS에서 안 보일 수 있음 — 미확인).

### 2.6 홈 화면에 추가

- Apps Script 웹앱은 우리 쪽에서 manifest·아이콘을 붙일 수 없어(페이지가 googleusercontent iframe 안), 홈 화면에 추가하면 **일반 바로가기**가 된다(아이콘은 기본 모양). 앱처럼 전체 화면으로 열리지 않는다. 근거 문서는 찾지 못했다(미확인, 실기기로 확인).
- **대응:** 학생·학부모 안내문에 "Safari 공유 버튼 → 홈 화면에 추가" 방법을 넣는 정도. 열릴 때 로그인은 Safari 쿠키를 쓴다.

---

## 3. 안드로이드(Chrome · 삼성 인터넷)

### 3.1 삼성 인터넷

- 한국에서 삼성 인터넷 비중이 높다(기사 제목 기준 국내 약 25% — [스마트투데이](https://www.smarttoday.co.kr/ko-kr/articles/94950), StatCounter 원자료는 확인 못 함, 미확인). 학부모 휴대폰에서 기본 브라우저인 경우가 많다.
- 엔진은 Chromium이라 CSS는 Chrome과 거의 같다. `dvh`는 삼성 인터넷 21부터(2.2절 web.dev).
- **확인할 것:** 삼성 인터넷의 **다크 모드 강제**(웹 페이지 색을 뒤집는 설정)에서 우리 색 대비가 깨지는지, 아래 메뉴 막대와 `.actionbar` 겹침. — 근거 문서 미확인, 0단계 진단 사진으로.

### 3.2 글자 크기 설정

- 안드로이드 시스템·브라우저 글자 크기를 키운 학부모가 많다. `-webkit-text-size-adjust: 100%`(이미 있음)는 자동 글자 키움을 막을 뿐, 사용자가 브라우저에서 고른 글자 크기는 반영된다.
- **대응:** 글자 크기 130%에서 홈·포털이 가로로 넘치지 않는지(360px 기준) 사진 확인. 버튼 글자가 두 줄이 되어도 깨지지 않게 `white-space: nowrap`을 버튼에 쓰지 않는다.

### 3.3 뒤로 가기 버튼

- 우리 앱은 화면을 바꿀 때 `?page=…` 주소로 새로 여는 곳과, 같은 페이지 안에서 그리는 곳(포털의 [← 돌아가기])이 섞여 있다. 안드로이드 뒤로 가기 버튼은 **브라우저 기록**을 따르므로, 같은 페이지 안에서 바꾼 화면은 뒤로 가기로 돌아오지 않고 앱 밖(카톡 등)으로 나갈 수 있다.
- Apps Script는 iframe 안이라 주소창 기록을 직접 바꾸려면 `google.script.history`를 써야 한다(공식 API, 사용 여부·효과는 미확인). — [HTML Service 제한](https://developers.google.com/apps-script/guides/html/restrictions)
- **대응:** 0단계 진단에서 포털 [OUT 자세히] → 뒤로 가기 버튼 동작 확인. 앱 밖으로 나가면 `google.script.history.push`를 검토(코딩 세션).

---

## 4. 윈도우 노트북 Chrome

### 4.1 화면 크기와 배율

| 흔한 설정 | CSS 폭(대략) | 우리 앱에서 |
| --- | --- | --- |
| 1366×768, 배율 100% | 1366px | 넓은 화면 |
| 1920×1080, 배율 125% | 1536px | 넓은 화면 |
| 1920×1080, 배율 150% | 1280px | 넓은 화면, 세로 약 650px |
| 1366×768, 배율 125% | 약 1093px | 세로가 약 500px대로 낮음 — **아래 고정 바 + 머리줄이 세로를 많이 먹는다** |

(CSS 폭 = 해상도 ÷ 배율. 브라우저 막대 높이는 빼야 한다.)

- **대응:** PC 화면 확인 사진은 **1366×768·배율 125%**를 꼭 넣는다(가장 좁은 노트북). 세로가 낮을 때 바텀 시트 `max-height`와 아래 바 높이를 확인.

### 4.2 글꼴(맑은 고딕)

- **지금 상태:** `font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` — Pretendard·Noto Sans KR는 불러오는 코드가 없어(`ui-vocabulary.md` 5절) 윈도우에서는 **맑은 고딕**이 나온다.
- 맑은 고딕은 같은 px에서 글자가 작고 가늘어 보이고, 굵게(700)와 보통(400)만 있어 600 같은 중간 굵기는 700으로 보인다(일반 지식, 미확인).
- **대응:** PC 사진은 윈도우 실기기(맑은 고딕)로 찍는다(맥 화면과 다르다). 굵기는 400·700 두 단계만 쓴다.

### 4.3 스크롤바 폭

- 윈도우는 스크롤바가 화면 폭을 약 15~17px 차지한다. 짧은 화면 ↔ 긴 화면을 오갈 때 가운데 정렬된 본문이 좌우로 흔들린다. `scrollbar-gutter: stable`(Chrome 94+, Safari 17.4+)로 미리 자리를 잡아 둘 수 있다. — [Frontend Masters: scrollbar-gutter](https://frontendmasters.com/blog/the-downsides-of-scrollbar-gutter-stable-and-one-weird-trick/), [bram.us](https://bram.us/?p=28937)
- **대응:** `html { scrollbar-gutter: stable; }` 한 줄(DESIGN 판단). 가로로 스크롤되는 격자(출석부·결과·좌석)에는 아래쪽 가로 스크롤바가 보이도록 표 높이를 화면보다 짧게(6절 references ⑥).

### 4.4 마우스·키보드

- **hover:** 휴대폰에는 hover가 없으므로 hover에만 정보를 숨기지 않는다(제목 풍선 `title`은 보조). `@media (hover: hover)`일 때만 줄 강조.
- **Tab 이동:** 버튼·칩·시트 안 요소에 키보드 초점이 **보여야** 한다(`:focus-visible` 테두리). 시트를 열면 첫 칸으로 초점, 닫으면 연 버튼으로 돌아오기. `Esc`로 시트 닫기.
- **Enter:** 한 칸짜리 검색·사유 입력에서 Enter = 주 동작.

### 4.5 넓은 화면에서 720px 한 줄이 휑함

- **지금 상태:** `main { max-width: 720px }`, 좌석·방 배정만 `main.wide { max-width: 1120px }`.
- **문제:** 1280px 이상 노트북에서 홈·목록이 가운데 좁은 띠로 보이고 양옆이 비어 "휑하다". 선생님 지적("PC에서 별로")의 큰 원인으로 보인다.
- **대응(references ⑦·① 참고):** 넓은 화면에서 ① 홈 카드를 2~3열 격자로, ② 목록 화면은 목록 + 옆 상세(list-detail) 두 칸으로, ③ 왼쪽 메뉴(내비게이션)를 두는 방식. Material 3는 폭 840dp 이상을 "넓은 화면(expanded)"으로 보고 두 칸 배치를 권한다. — [Android Developers: Adaptive layout codelab](https://developer.android.com/codelabs/adaptive-material-guidance)

---

## 5. Apps Script 웹앱 특유

### 5.1 iframe 안에서 돈다

- 우리 화면은 `script.google.com` 페이지 안의 **iframe**(googleusercontent.com)에서 돈다. 샌드박스 허용 항목은 `allow-same-origin, allow-forms, allow-scripts, allow-popups, allow-downloads, allow-modals`이고 `allow-top-navigation`은 없다. 링크는 `target="_top"` 또는 `_blank`여야 한다. — [Apps Script: HTML Service 제한](https://developers.google.com/apps-script/guides/html/restrictions), [IFRAME 샌드박스로 이동](https://developers.google.com/apps-script/migration/iframe)
- **지금 상태:** `Index.html` 등에 `<base target="_top">`이 있어 맞다.
- **영향:** 자바스크립트로 맨 위 창 주소를 바꾸는 방식(자동 이동)은 막힌다 → 사용자가 누르는 링크·버튼으로 한다(문서 권고와 같음).

### 5.2 위쪽 안내 배너

- Apps Script 웹앱 위에는 "Google Apps Script 사용자가 만든 앱입니다" 같은 회색 배너가 뜰 수 있다(배포 계정 종류에 따라 다름 — 근거 문서 못 찾음, 미확인).
- **영향:** 휴대폰 첫 화면 위쪽 약 1줄을 차지하고, 학부모가 낯선 안내로 의심할 수 있다.
- **대응:** 학부모 안내문에 "위쪽 회색 안내는 구글이 띄우는 것으로 정상입니다" 한 줄. 0단계 진단에서 실제로 뜨는지 사진.

### 5.3 viewport 메타

- **지금 상태:** `HtmlService …addMetaTag('viewport', 'width=device-width, initial-scale=1')`(`src/Code.gs:124`). 맞다.
- 2.4절 `viewport-fit=cover`를 더할지는 iframe 안 safe-area 값 확인 뒤 정한다.

### 5.4 구글 계정 여러 개 로그인 — 2순위

- **문제:** 브라우저에 구글 계정이 둘 이상 로그인되어 있으면 Apps Script 웹앱이 "죄송합니다. 지금은 파일을 열 수 없습니다(Sorry, unable to open the file at this time)"를 띄우거나 엉뚱한 계정으로 열린다. 주소에 `/u/1/`이 붙는 경우가 많다. 공식 해결책은 없고 시크릿 창·한 계정만 로그인이 흔한 우회다. — [Apps Script 커뮤니티 정리](https://sites.google.com/view/appsscripts/web-apps/solving-issues-on-mobile), [Glide 커뮤니티: /u/1/](https://community.glideapps.com/t/problem-opening-google-web-app-on-mobile-do-to-u-1-placed-in-url-when-you-have-multiple-accounts/38864), [Google Issue Tracker](https://issuetracker.google.com/issues/407284389)
- **우리 앱 영향:** 학생은 학교 계정 + 개인 gmail이 함께 로그인된 휴대폰이 흔하다. 6.1의 1안(로그인 계정으로 사람 판정)에서는 **엉뚱한 계정으로 열리면 "학생 명단에서 내 계정을 찾지 못했습니다"**가 뜬다.
- **대응:**
  - 안내문: "열리지 않거나 '계정을 찾지 못했습니다'가 나오면, Chrome 시크릿 창(또는 Safari 개인정보 보호 브라우징)에서 학교 계정으로만 로그인해 열어 주세요."
  - 거부 화면(`NoAccess`)에 **지금 로그인된 이메일**을 보여 주고 "이 계정이 아니면 …" 안내(이미 `email`을 넘기고 있다 — 문구는 writing-audit 참고).
  - 0단계 진단 항목: 계정 2개 로그인 휴대폰(아이폰·안드로이드)에서 열기.

### 5.5 새 창·다운로드

- `allow-popups`·`allow-downloads`가 있어 `target="_blank"` 새 창과 `<a download>`는 된다(5.1 문서).
- **지금 상태:** 근무표 xlsx(`screen_duty.html:437`)·식수 파일(`screen_mealcount.html:88`)은 blob 주소 + `download` 속성, 출석부 PDF(`screen_moves.html` 등)도 내려받기.
- **확인할 것:** 아이폰 Safari에서 blob `download`가 파일 저장 대신 미리보기로 열리는지, 카카오톡 인앱 브라우저에서 내려받기가 되는지(미확인). 교사 기능이라 PC Chrome이 기본이면 우선순위는 낮다.

---

## 6. 0단계 진단에 더할 항목(제안)

> 선생님이 따라 할 단계·통과 모습·학부모 안내 문구는 `docs/stage0-checklist.md` E2절에 옮겼다(2026-11-20).

| # | 기기·상황 | 할 일 | 통과 모습 | 사진 |
| --- | --- | --- | --- | --- |
| K1 | 아이폰 카카오톡 | 대화방 링크로 앱 열기 | 로그인 후 홈이 보인다(또는 막히는 화면) | 필수 |
| K2 | 안드로이드 카카오톡 | 같은 것 | 같은 것 | 필수 |
| K3 | 아이폰·안드로이드 | 카톡 링크 → "다른 브라우저로 열기" | 로그인 후 홈 | 필수 |
| M1 | 학교 + 개인 계정이 둘 다 로그인된 휴대폰 | 앱 열기 | 학교 계정으로 홈이 보인다 | 필수 |
| M2 | 같은 휴대폰, 시크릿 창 | 앱 열기 | 학교 계정으로 홈 | |
| I1 | 아이폰 | 특이사항 사유 입력 중 | 화면이 확대되지 않고, [저장]·입력 칸이 키보드에 가려지지 않는다 | 필수 |
| I2 | 아이폰 | 바텀 시트 열기 | 홈 막대와 버튼이 겹치지 않는다 | |
| A1 | 삼성 인터넷 | 홈·포털 열기, 글자 크기 130% | 가로로 넘치지 않는다 | |
| A2 | 안드로이드 | 포털 [OUT 자세히] → 뒤로 가기 버튼 | 포털 홈으로 돌아온다 | |
| W1 | 윈도우 노트북 1366×768·배율 125% Chrome | 출석부·결과·좌석 화면 | 머리줄·아래 바를 빼고 표가 보이고, 가로 스크롤바가 보인다 | 필수 |
| W2 | 같은 노트북 | 키보드 Tab으로 확인 시트까지 | 초점 테두리가 보이고 Esc로 닫힌다 | |
| G1 | 모든 기기 | 첫 화면 위쪽 | 구글 회색 배너가 뜨는지 기록 | |

## 7. 확인 못 한 것(미확인 목록)

- 카카오톡 인앱에서 **Apps Script 웹앱 로그인**이 실제로 막히는지(OAuth 정책은 확인, 웹앱 로그인 적용은 추정) → K1·K2.
- `kakaotalk://web/openExternal` 스킴의 공식 지원 여부.
- iOS Safari의 `interactive-widget` 지원 버전.
- iframe 안에서 `env(safe-area-inset-*)` 값.
- Apps Script 위쪽 배너가 뜨는 조건.
- 홈 화면에 추가했을 때의 아이콘·열림 방식.
- 삼성 인터넷 국내 점유율 원자료, 다크 모드 강제 시 대비.
- 맑은 고딕 굵기 표현(400·700만 있는지).
