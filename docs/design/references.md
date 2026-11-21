# 디자인 레퍼런스 — 구조·배치·상호작용의 근거

> 2026-11-20 자료조사 세션(W2). 선생님 요청: "자료 조사해서 디자이너들 레퍼런스 참고 좀 해서 만들면 좋겠다. … 색 타령만 하지 말고."
> 색이 아니라 **구조·배치·상호작용**의 근거를 모았다. D15 2단계(교사 B · 학생·학부모 C, 결정 85)에 쓴다.
> 그림·코드·자산은 가져오지 않는다. 원칙과 수치만 빌린다(`ui-vocabulary.md` 5절).
> 근거는 웹 검색으로 찾은 공식 문서·공식 블로그 위주다. 공식 페이지 본문을 직접 열지 못하고 검색 요약으로만 본 것은 **(요약 확인)**, 확인하지 못한 수치는 **미확인**이라고 적었다.
> 기기별 문제(카카오톡·아이폰·윈도우)는 `docs/design/device-compat.md`.

## 0. 먼저 결론 — D15가 바로 쓸 다섯 가지

1. **화면 폭에 따라 배치를 바꾼다.** 휴대폰(약 600px 미만)은 한 줄, 넓은 화면(약 840px 이상)은 **목록 + 옆 상세 두 칸**과 **왼쪽 메뉴**. 지금처럼 720px 띠 하나로 두지 않는다(⑦).
2. **확인 단계는 휴대폰 = 바텀 시트, PC = 가운데 대화창(또는 옆 시트).** 넓은 화면에서 화면 폭 전체 바텀 시트는 쓰지 않는다(⑤).
3. **격자(출석부·결과·좌석)는 머리 행과 학생 이름 열을 고정**하고, 가로로 더 있다는 것을 보이게 한다(⑥).
4. **홈은 "오늘 할 일 목록"**이고 항목마다 상태 표시(해야 함·끝남)를 단다. 기능 소개 카드를 늘어놓지 않는다(①).
5. **목록 한 줄은 [앞: 누구] [가운데: 무엇·언제] [끝: 상태 또는 동작 하나]** 순서로 고정한다(②).

---

## ① 역할별 홈 / 오늘 할 일

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [GOV.UK Task list](https://design-system.service.gov.uk/components/task-list) · [여러 일 끝내기 패턴](https://design-system.service.gov.uk/patterns/complete-multiple-tasks) | 할 일을 **한 줄씩 나열하고 오른쪽에 상태 태그**("시작 안 함·진행 중·완료"). 2023년 개정판은 상태 문구·색을 권장안으로 두고 팀이 바꿀 수 있게 했다 — [설계 노트](https://designnotes.blog.gov.uk/2023/12/15/working-as-a-community-to-iterate-the-task-list-pattern/) (요약 확인) | 신청서처럼 한 번에 끝나는 일에 맞춘 패턴. 우리 홈은 매일 새로 생기는 일(오늘 특이사항, 확인 대기)이라 "완료"보다 **숫자(3건)**가 중요 |
| [Material 3 정형 배치(canonical layouts)](https://developer.android.com/codelabs/adaptive-material-guidance) | 목록-상세·보조 패널·피드 세 가지 배치. 넓은 화면에서 **보조 패널**(오늘 일정·알림)을 옆에 둔다 | 앱 전체 틀이라 Apps Script 한 페이지 구조에는 일부만 |
| [아이엠스쿨(학교 앱) 소개](https://apps.apple.com/kr/app/id540665717) | 학교 앱 홈이 공지·가정통신문·학사일정·급식·시간표·출결 알림을 **한 화면 요약**으로 묶는다 — 학부모가 익숙한 구성 | 학부모용 정보 모음이라 교사 업무 홈에는 맞지 않음. 학생·학부모 포털(C안) 참고용 |
| [Atlassian 빈 상태](https://atlassian.design/components/empty-state) | 할 일이 없을 때도 카드를 지우지 말고 "없음 + 다음 행동"을 한 줄로 | ⑧ 참고 |

**우리 앱 적용안**
- 휴대폰: 맨 위 "오늘" 한 줄(날짜·근무자) → **해야 할 일 카드**(숫자 큰 글씨 + 상태 + 주 버튼 하나) → 그 밖의 바로가기는 아래 목록으로(카드 아님).
- PC: 왼쪽 메뉴(⑦) + 가운데 할 일 목록 + 오른쪽 보조 패널(오늘 일정·최근 OUT).
- 홈 카드 설명문은 `writing.md` 4.6절(언제·왜 여는지 한 문장).

## ② 목록 행(학생 한 줄)

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [GitHub Primer ActionList](https://primer.style/components/action-list) | 한 줄을 **앞 표시(leading)·본문·뒤 표시(trailing)·뒤 동작(trailing action)**으로 나눈다. 뒤 표시는 상태·단축키, 뒤 동작은 보조 동작 하나. 쓸 수 없는 줄은 경고 아이콘 + 이유 풍선(요약 확인) | 마우스 기준(풍선·hover). 휴대폰에선 이유를 줄 아래 한 줄 글로 |
| [Material 3 목록](https://m3.material.io/components/lists) | 한 줄 높이 단계(한 줄·두 줄·세 줄), 앞에 아바타·아이콘, 뒤에 메타 글·체크 (이번에 본문 확인 안 함, 일반적 구성) | 사진 아바타를 쓰지 않는다(개인정보). 앞에는 학년 숫자 |
| [Atlassian Lozenge](https://atlassian.design/components/lozenge/lozenge) | 상태는 **글자가 든 작은 라벨**로, 누르는 버튼과 헷갈리지 않게 | ③ 참고 |

**우리 앱 적용안(한 줄 틀)**
```
[1] 김가온           병결 · 3월 31일(수)      [확정]  ›
 앞: 학년·이름        가운데: 무엇 · 언제        끝: 상태 라벨 하나 + (누르면 상세)
```
- 한 줄에 버튼은 하나까지. 둘 이상이면 줄을 누르면 시트(⑤)에서 고른다.
- 줄 전체가 누르는 칸(높이 48px 이상, `--tap`).
- PC에서는 같은 줄을 **표의 한 행**으로 보여 주고 열 머리를 단다(⑥).

## ③ 상태 표시

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [GOV.UK Tag](https://design-system.service.gov.uk/components/tag/) | 태그는 **상태를 알릴 때만** 쓴다(꾸밈·분류에 쓰지 않음) | |
| [Atlassian Lozenge](https://atlassian.design/components/lozenge/lozenge) | 상태를 빨리 알아보게 하는 색 글자 라벨, 진한 것·옅은 것 두 단계 | 색 이름(초록=완료)에만 기대면 색약에 불리 → 글자 함께(이미 `UI.statusPill` 원칙) |
| [HMRC 상태 태그(보관됨)](https://design.tax.service.gov.uk/hmrc-design-patterns/status-tags-in-task-list-pages) | 상태 낱말을 **세 개 안팎으로 고정**하고 뜻을 문서로 정한다 | 2023년 보관(GOV.UK로 통합) |

**우리 앱 적용안**
- 상태 낱말은 `vocabulary.md` 값 그대로(요청·확정·취소, 1OUT·퇴실 대상), 학부모 화면은 `writing.md` 7절 표기.
- 한 줄에 상태 라벨은 하나. 진하게(해야 할 일) / 옅게(끝난 일) 두 단계만.
- 숫자 배지(확인 대기 3)는 홈 카드에만.

## ④ 입력 폼

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [GOV.UK 오류 메시지](https://design-system.service.gov.uk/components/error-message) · [검증 패턴](https://design-system.service.gov.uk/patterns/validation) | 오류는 **그 칸 바로 위·아래에**, 여러 개면 맨 위에 **오류 요약**(각 칸으로 가는 링크). "올바른·잘못된" 대신 무엇을 어떻게 고칠지. 다음 단계로 넘어가려 할 때만 오류를 보인다. 브라우저 기본 검증(`required`) 대신 직접 검증 | 영국 공공 서비스의 긴 신청서 기준. 우리 폼은 대개 칸 3~5개라 오류 요약은 칸이 많은 화면(명단·운영 기간)에만 |
| [GOV.UK 날짜 입력](https://design-system.service.gov.uk/components/date-input) | 생일처럼 아는 날짜는 일·월·년 세 칸 | **우리는 쓰지 않는다.** 근무·특이사항 날짜는 "고르는" 날짜라 휴대폰 날짜 선택기(`type="date"`)가 빠르다(`device-compat.md` 2.5) |
| [KRDS 컴포넌트](https://www.krds.go.kr/html/site/component/component_02_03.html) | 공공 서비스 한글 폼, 접근성 기준(KWCAG 2.2) — [KRDS 개요](https://krds.go.kr/html/eng/outline/outline_02.html) | 세부 수치는 공식 Figma 파일에 있어 이번에 확인 못 함(미확인) |
| [Primer 빈 상태·오류](https://primer.style/ui-patterns/empty-states) | 오류 화면의 그림은 장난스럽지 않게, 경고 아이콘 기본 | |

**우리 앱 적용안**
- 라벨은 칸 **위**(칸 안 안내글만으로 두지 않음). 오류는 그 칸 **아래 한 줄**(`.field .fix`, 이미 있음).
- 학생 고르기는 검색 칸 + 결과 목록(`UI.studentPicker`) — 초성 검색 유지.
- 저장 버튼을 눌렀을 때 한꺼번에 검사하고, 첫 오류 칸으로 스크롤·초점.
- 입력 칸 글자는 16px 이상(`device-compat.md` 2.1).

## ⑤ 확인 단계 — 휴대폰 바텀 시트 ↔ PC 대화창·옆 시트

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [Material 바텀 시트](https://material.io/components/sheets-bottom) | 넓은 화면에서는 **바텀 시트를 옆 시트로 바꿔** 차지하는 공간을 줄이고, **넓은 화면에서 화면 폭 전체 바텀 시트는 쓰지 않는다**. 동작 목록 시트는 넓은 화면에서 메뉴로 바뀔 수 있다(요약 확인) | 안드로이드 앱 기준. 웹에서는 폭 기준(약 840px)으로 바꾸면 된다 |
| [Material 옆 시트](https://material.io/components/sheets-side) | 넓은 화면에서 목록을 가리지 않고 오른쪽에서 열리는 상세·편집 패널 | 옆 시트는 화면이 1100px 이상일 때만(1366×768 배율 125% = 약 1093px은 좁음 — `device-compat.md` 4.1) |
| [Material 대화창(M2)](https://m2.material.io/components/dialogs) | 넓은 화면에서는 대화창을 화면 전체가 아니라 가운데 상자로 | |
| [Apple HIG 시트](https://developer.apple.com/design/human-interface-guidelines/sheets) | 시트 높이 두 단계: 중간(약 절반)·큰(전체). 짧은 확인은 중간, 입력이 있으면 큰. iPad에서는 가운데 뜨는 시트(form sheet) — [WWDC21 10063](https://developer.apple.com/videos/play/wwdc2021/10063/) (요약 확인) | 앱(UIKit)용. 웹 바텀 시트는 끌어서 높이 바꾸기를 하지 않는다(애니메이션 없음 원칙) |
| [GitHub Primer 대화창](https://primer-docs-preview.github.com/product/components/dialog/guidelines) | PC 대화창: 제목·본문·아래 버튼 줄(주 버튼 오른쪽), Esc로 닫기 | |

**우리 앱 적용안**
- **폭 840px 미만:** 지금의 `UI.bottomSheet`·`UI.confirmSheet` 그대로(아래에서 올라옴, 엄지 닿음). 높이는 내용만큼, 최대 85dvh.
- **폭 840px 이상:** 같은 부품이 **가운데 대화창**(폭 480~560px)으로 뜬다. 입력이 긴 편집(입퇴실 신청서 등)은 **오른쪽 옆 시트**(폭 400~480px)를 검토하되, 1100px 미만이면 대화창.
- 버튼 순서: 휴대폰은 위아래로 [주 동작] 위 · [돌아가기] 아래(엄지), PC는 오른쪽 끝 [돌아가기] [주 동작]. 제목·버튼 낱말은 `writing.md` 4.3.
- 공통 동작: 바깥(어두운 막)을 눌러도 입력 중이면 닫지 않는다. Esc = 돌아가기. 열 때 첫 칸에 초점, 닫으면 연 버튼으로 초점(`device-compat.md` 4.4).

## ⑥ PC 표·격자(출석부 격자, 결과 격자, 좌석)

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [Shopify Polaris Data table](https://polaris.shopify.com/components/tables/data-table) | 가로 스크롤 때 **첫 열 고정** 옵션, 세로 스크롤 때 **머리 행 고정** | 상품 표 기준 |
| [Maersk 표](https://designsystem.maersk.com/components/table/) | 표가 넘치면 가로 스크롤 + **줄을 알아보는 열(이름)을 고정** + **오른쪽에 더 있다는 표시** | |
| [Morningstar 반응형 표](https://designsystem.morningstar.com/legacy/v/2.34.0/ux-patterns/responsive-data-tables.html) | 첫 열을 잠가 기준을 잃지 않게. 사용자는 표 안이 가로로 스크롤되는 줄 모르기 쉽다 → 단서를 보인다 | |
| [Carbon 표 이슈 "머리 고정"](https://lightrun.com/answers/carbon-design-system-carbon-data-table-header-should-be-sticky) | 표가 길면 **가로 스크롤바가 화면 밖(맨 아래)**에 있어 안 보인다 → 표 높이를 화면 안으로 제한 | 공식 지침이 아니라 이슈 토론 |
| [Semrush 표](https://developer.semrush.com/intergalactic/table-group/data-table/data-table) | 고정 머리에 스크롤 중 그림자를 넣지 않는다(요약 확인) | |

**우리 앱 적용안**
- 격자를 감싼 상자에 `max-height: calc(100dvh - 머리줄 - 아래 바)` + `overflow: auto` → 가로 스크롤바가 항상 화면 안에 보인다.
- 머리 행 `position: sticky; top: 0`, 학생 이름 열 `position: sticky; left: 0`, **고정 칸에는 불투명 배경**(뒤 칸이 비치지 않게).
- 오른쪽 끝에 옅은 그림자나 "→ 더 있음" 표시(넘칠 때만).
- 1366×768·배율 125%(세로 약 500px대)에서 머리줄·아래 바를 빼고 학생 8줄 이상 보이는지 확인(`device-compat.md` W1).
- 휴대폰에서는 격자를 그대로 줄이지 말고 **학생 한 명씩 줄 목록**(②)으로 바꾼다(지금 출석부 화면 방식 유지).

## ⑦ 내비게이션 — 휴대폰 홈 카드 ↔ PC 왼쪽 메뉴

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [Material 3 창 크기 단계](https://developer.android.com/codelabs/adaptive-material-guidance) | 좁음(600 미만)·중간(600~840)·넓음(840 이상) 세 단계. 좁으면 아래 막대·서랍, 중간이면 왼쪽 레일, 넓으면 레일·서랍 + 두 칸 | 아래 내비게이션 막대는 우리 아래 고정 바(주 버튼)와 겹친다 → **휴대폰에서는 아래 막대를 쓰지 않고 홈 카드 + ← 처음으로** 유지 |
| [Material 3 목록-상세](https://developer.android.com/codelabs/adaptive-material-guidance) | 넓은 화면(840 이상)에서만 목록과 상세를 나란히, 좁으면 한 칸씩 | |
| [KRDS 컴포넌트 분류](https://www.inflearn.com/course/exclusive-reveal-com) | 서비스 구조·내비게이션·입력·액션·데이터 표현·피드백 범주(요약 확인) | 정부 누리집(메뉴가 깊음) 기준. 우리는 2단계 깊이 |

**우리 앱 적용안**
- **휴대폰(840px 미만):** 지금처럼 홈 카드 → 화면, 머리줄 `← 처음으로`. 화면 안 탭은 `UI.segmented`.
- **PC(840px 이상):** 왼쪽에 **역할별 메뉴**(홈 카드와 같은 항목·같은 이름, 폭 200~240px). 지금 화면 이름을 굵게. 홈 카드의 숫자(확인 대기 3)를 메뉴 옆 배지로.
- 메뉴 항목 이름 = 홈 카드 제목 = 화면 머리줄 제목(`writing.md` 3절 "한 동작은 같은 낱말").
- Apps Script는 화면을 `?page=`로 새로 연다. 왼쪽 메뉴는 매 화면에 같이 그린다(서버가 역할별 메뉴 목록을 함께 준다 — 코딩 세션).

## ⑧ 빈 상태·로딩·오류

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| [Atlassian 빈 상태 글쓰기](https://atlassian.design/content/writing-guidelines/empty-state) | 제목은 짧게 "무엇을 할 수 있는지", 본문에 왜 비었는지 + 다음 단계, 버튼은 한두 단어(요약 확인) | 그림을 크게 넣는 방식은 우리 카드 안 빈 상태엔 과함 |
| [Primer 빈 상태](https://primer.style/ui-patterns/empty-states) · [Blankslate](https://primer.style/product/components/blankslate/guidelines) | 왜 내용이 없는지 알려 주는 자리. 오류일 때는 장난스러운 그림 대신 경고 아이콘 | |
| [GOV.UK 검증](https://design-system.service.gov.uk/patterns/validation) | 오류는 고치는 방법과 함께 | |

**우리 앱 적용안**
- 빈 상태: 카드 안 한 줄(`UI.emptyState`) + 다음 행동이 있으면 버튼 하나. 문구는 `writing.md` 4.2.
- 로딩: "불러오는 중…" 한 줄(돌아가는 그림 없음 — 애니메이션 없음 원칙). 3초 넘게 걸리는 작업만 무엇을 하는지.
- 오류: 카드 자리에 그대로(화면 전체를 바꾸지 않음) + [다시 불러오기] 버튼.

## ⑨ 한글 타이포그래피

| 참고처 | 빌릴 것 | 우리 앱에 안 맞는 점 |
| --- | --- | --- |
| KRDS 본문 크기 | 본문 **17px · 줄 간격 150%**, 버튼 높이 48~56px — [디자인 시스템 갤러리 정리](https://www.oppadu.com/tools/design-systems-site/brand/krds.html) (**비공식 자료, 공식 Figma 미확인**). 서체는 Pretendard GOV — [KRDS 자료](https://krds.go.kr/html/eng/resource/resource.html) | 우리는 이미 본문 18px·줄 간격 1.5 — 비슷하거나 조금 크다(유지) |
| [W3C 한국어 조판 요구사항(klreq)](https://www.w3.org/TR/2015/WD-klreq-20150723/) | 한글 줄 바꿈(어절 단위 `word-break: keep-all`), 문장 부호 | 초안 문서 |
| [web.dev 접근성: 타이포그래피](https://web.dev/learn/accessibility/typography?hl=ko) | 글자 크기를 사용자 설정에 맞게 rem으로, 줄 길이 제한 | |

**우리 앱 적용안**
- 크기 단계는 4개로 고정: 큰 숫자 1.5rem(27px) · 제목 1.1rem(약 20px) · 본문 1rem(18px) · 작은 글 0.85rem(약 15px, **입력 칸에는 쓰지 않음**).
- 줄 간격: 본문 1.5, 제목 1.3. 한글 문장은 `word-break: keep-all`(이미 일부 사용 — 전역으로).
- 숫자: 표·격자·시각 열은 `font-variant-numeric: tabular-nums`(자리 맞춤). 날짜·시각 표기는 `writing.md` 5절.
- 굵기는 400·700 두 단계(윈도우 맑은 고딕 — `device-compat.md` 4.2).
- PC에서 본문 한 줄은 40자 안팎에서 끊기게(카드 폭으로 조절).

---

## 참고처별 한 줄 평

| 참고처 | 가장 가까운 점 | 쓰는 곳 |
| --- | --- | --- |
| KRDS | 한글·공공·접근성 | ④⑦⑨ (세부 수치는 공식 Figma로 다시 확인 필요) |
| GOV.UK Design System | 폼·오류·상태·쉬운 말 | ①③④⑧ |
| Material 3 | 화면 폭별 배치, 시트 바꾸기 | ①⑤⑦ |
| Apple HIG | 시트 높이 두 단계 | ⑤ |
| GitHub Primer · Atlassian | 목록 행, 상태 라벨, 빈 상태 | ②③⑧ |
| Shopify Polaris · Maersk · Morningstar | 큰 표 고정 머리·열 | ⑥ |
| 토스 | 모든 문구를 해요체로 통일 — [디지털인사이트 기사](https://ditoday.com/?p=151644)(요약 확인). **우리는 합니다체**(`writing.md` 1절) | 참고만 |
| 당근 SEED | 바텀 시트를 끌어서 닫기·제스처 지원(요약 확인) — [SEED 저장소](https://github.com/daangn/seed-design) | 우리는 애니메이션·제스처를 쓰지 않아 참고만 |
| 학교 앱(아이엠스쿨·하이클래스·클래스팅) | 학부모가 익숙한 정보 묶음(공지·일정·급식·출결 알림) — [하이클래스 앱 소개](https://apps.apple.com/us/app/id1472488819) | 학생·학부모 포털(C안)의 순서 참고. 화면 사진은 가져오지 않음 |

## 확인 못 한 것

- KRDS 공식 수치(본문 크기·줄 간격·모달 규격): krds.go.kr 본문을 열지 못하고 검색 요약·비공식 정리로만 봤다.
- Material 3(m3.material.io) 바텀 시트·옆 시트 최신 문구: 옛 material.io 페이지와 요약으로 봤다.
- 토스 공식 UX 라이팅 원칙 원문, e알리미·리로스쿨 화면 구성.
- Atlassian·Primer의 표(data table) 공식 지침: 검색에 나오지 않아 Polaris·Maersk·Morningstar로 대신했다.
