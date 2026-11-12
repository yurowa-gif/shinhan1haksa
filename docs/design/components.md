# 공통 컴포넌트 (D3) — `UI.*`

코드: `src/ui/Components.html`(전역 이름은 `UI` 하나). 화면 파일은 `renderScreen`/`renderHome` 안에서 부른다.
모양·문구 규칙은 `docs/design/rules.md`. 미리보기: `node design/preview/components.js`(360px PNG, `design/preview/out/`).

## 약속

- **서버를 부르지 않는다.** 데이터와 콜백만 받는다. 저장·조회는 화면 파일이 `call()`로 한다.
- **글자는 모두 textContent.** HTML 문자열을 넣는 방법이 없다(`npm test`가 `innerHTML`류를 막는다).
- 반환값은 DOM 노드다(`el()`처럼 `appendChild`로 붙인다). 값을 읽는 컴포넌트는 노드에 `getValue()`를 붙여 돌려준다.
- 값 형식: 날짜 `'yyyy-MM-dd'`, 시각 `'HH:mm'`, 블록 범위 `'ALL'` 또는 `'HH:mm-HH:mm;…'`(`docs/contracts/vocabulary.md`).
- 누르는 칸은 48px 이상. 색만으로 뜻을 전하지 않는다(선택됨 = ✓ 글자 + 굵은 글씨).
- 이 문서의 `### UI.이름` 목록은 실제 `UI` 키와 같아야 한다(`tests/design/components.test.js`가 검사).

## 상태·알림

### UI.statusPill
`UI.statusPill(kind, text?)` → `span.pill`. kind: `confirmed` `requested` `canceled` `hak` `ga` `byung` `out1` `out2` `todo` `mute`. text를 안 주면 기본 낱말(확정·요청·취소·학·가·병결·1OUT·퇴실 대상·확인 필요). 모르는 kind는 오류를 던진다.

### UI.badge
`UI.badge(n)` → `span.count`. 0 이하는 `null`(`el`의 자식으로 넣으면 건너뜀). 100 이상은 `99+`. 스크린리더용 `aria-label="n건"`.

### UI.emptyState
`UI.emptyState(message, action?)` → 안내 상자. `action = {text, onclick, kind?}`면 버튼 하나를 붙인다. 문구는 다음 할 일을 쓴다(rules.md 5절).

### UI.toast
`UI.toast(message, {kind:'ok'|'warn'|'info', ms:3000})` → 아래에 잠깐 뜨는 한 줄(`role="status"`). 저장 성공 같은 확인용이고, 되돌릴 수 없는 일의 확인은 `confirmSheet`를 쓴다.

### UI.actionBar
`UI.actionBar(buttons, {mount:true}?)` → `.actionbar`. `buttons = [{text, onclick(e, btn), kind:'primary'|'secondary'|'danger', disabled}]`. `mount`를 주면 body에 붙이고 `main`에 `has-actionbar`를 표시한다. 주 버튼은 한 화면에 하나.

## 입력

### UI.field
`UI.field(label, controlNode, {hint?, name?})` → `.field`. 라벨↔입력 연결, 힌트, 고칠 점 칸(`.fix`)을 만든다. 노드: `control`, `setError(msg | '')`(오류가 있으면 `.invalid`). 이관 후보였던 `localField`를 대체한다(서버 오류의 `field` 이름은 `name`으로 맞춘다).

### UI.dateField
`UI.dateField({label, value?, min?, max?, name?, shortcuts?:[{label, value}], onchange(value)})` → `.field`. 달력 입력 + "3월 3일(수)" 확인 줄 + 바로가기 칩(오늘·내일 같은 값은 화면이 계산해서 준다). 노드: `getValue()`, `setValue(v)`, `setError(msg)`. 시계를 읽지 않는다.

### UI.rangeField
`UI.rangeField({label?, from?, to?, shortcuts?, onchange({from,to,days,valid})})` → `.card`. 시작일을 고르면 종료일이 비었거나 앞서 있을 때 같은 날로 맞춘다(하루 입력은 시작일만 고르면 된다). 종료일이 앞서면 "종료일이 시작일보다 빠릅니다. 종료일을 같은 날이나 뒤로 고쳐 주세요." 노드: `getValue()`, `setValue(from, to)`.

### UI.blockChips
`UI.blockChips({blocks:[{seq,start,end,label}], value?:{all,seqs}, onchange(value)})` → 칩 줄(전체 + 블록별). 블록을 다 고르면 "전체"로 바뀐다. `getValue()` → `{all, seqs, spec, valid}`: `spec`은 `'ALL'` 또는 `'18:00-20:00;22:00-24:00'`, 아무것도 안 골랐으면 `valid:false`. "15:00부터 귀가"는 화면이 시각 입력으로 따로 받는다(`UI.util.blockSpec`는 블록 칩만 다룬다).

### UI.segmented
`UI.segmented({options:[{value,label}], value?, label?, onchange(value)})`(`value`를 안 주면 첫 칸, `value:''`면 아무것도 고르지 않은 상태 — 꼭 골라야 하는 칸) → 2~4개 중 하나 고르기(`role="radiogroup"`). 노드: `getValue()`, `setValue(v)`. 예: 하루 / 기간.

### UI.studentPicker
`UI.studentPicker({students:[{id,name,grade,classNo,number,studentNo}], onpick(student|null), label?, placeholder?, maxResults?:8})` → 검색 + 결과 목록. 이름 일부·초성(ㄱㄱㅇ)·학번 앞자리로 찾고, 고르면 "1. 김가온 · 1-3 5번 [변경]"으로 바뀐다. 결과가 없으면 다음 할 일을 알려 준다. 노드: `getValue()`, `clear()`. 이메일·성별 같은 값은 화면에 쓰지 않는다.

## 시트(아래에서 올라오는 창)

### UI.bottomSheet
`UI.bottomSheet({title, content:Node, actions:[{text,onclick,kind,disabled}], onclose, initialFocus?:0})` → `{open(), close(), el, buttons}`. 바깥 누르기·Esc로 닫히고, 닫으면 포커스가 원래 자리로 돌아간다. **열린 직후 350ms 동안은 시트 안 버튼 클릭을 무시한다**(화면 아래 바 버튼을 빠르게 두 번 누르면 두 번째 탭이 같은 자리에 막 열린 확인 시트의 버튼을 눌러, 확인창을 보지도 않고 저장되는 것을 막는다. `confirmSheet`·`confirmWithReason` 모두 같다).

### UI.confirmSheet
`UI.confirmSheet({title, lead?, lines?, message?, confirmText?:'확인', cancelText?:'취소', danger?, onconfirm, oncancel})` → 열린 시트. 포커스는 **취소** 쪽. 무엇이 바뀌는지 `message`에 한 줄로 쓴다(rules.md 6절). 적용일처럼 꼭 봐야 할 한 줄은 `lead`(크고 굵게, 예 "3월 5일(금)부터 학사 퇴실"), 그 아래 바뀌는 것 목록은 `lines`(문자열 배열). `lead`·`lines`만 주면 `message`는 없어도 된다.

### UI.confirmWithReason
`UI.confirmWithReason({title, message, reasonLabel?:'사유', confirmText?:'확인', minLength?:2, danger?:true, onconfirm(reason), oncancel})` → 열린 시트. 사유를 `minLength`자 이상 적어야 확인 버튼이 켜진다. `onconfirm`에는 앞뒤 공백을 자른 사유가 온다. 사유 저장·`audit_log`는 서버 몫이다.

## 좌석

### UI.seatGrid
`UI.seatGrid({rows, cols, cells:[{row,col,kind:'seat'|'pillar'|'door'|'window', seatLabel, text, vacant, bad?}], mode?:'single'|'swap', onselect(picked:[{row,col}], done)})` → 격자 상자. `cells`는 `docs/contracts/sheet-model.md`의 `cells[]`와 같은 모양에 `text`(칸에 보일 글자, 예 "1. 김가온")를 더한 것이다. `bad: true`인 칸은 규칙 위반(3단계): 굵은 빨간 테두리 + ⚠ + 읽어 주는 말 "(규칙 위반)"(색만으로 알리지 않음). 좌석 칸만 누를 수 있고, `cells`에 없는 칸은 통로다. `single`은 한 칸, `swap`은 두 칸을 차례로 누르면 `done=true`(같은 칸을 다시 누르면 해제). 격자가 넓으면 상자 안에서만 가로로 밀린다(화면 전체는 안 밀림). 노드: `getSelection()`, `clearSelection()`. 맞바꾸기 확인은 화면이 `confirmSheet`로 받는다.

## 순수 함수

### UI.util
브라우저 없이 `npm test`로 검사하는 함수 모음. 화면 파일도 써도 된다.

| 함수 | 뜻 |
| --- | --- |
| `ymdParse(s)` | `'yyyy-MM-dd'` → `{y,m,d,wd}` 또는 `null`(없는 날짜 거부) |
| `formatDateKo(ymd, withYear?)` | `'3월 3일(수)'`, withYear면 `'2027년 3월 3일(수)'`, 잘못된 값은 `''` |
| `daysBetween(from, to)` | 양 끝 포함 날 수, 틀리면 0 |
| `formatRangeKo(from, to)` | `'3월 3일(수)–3월 5일(금) · 3일'` |
| `chosung(str)` | `'김가온'` → `'ㄱㄱㅇ'` |
| `matchStudent(query, s)` | 이름 일부·초성·학번 앞자리 |
| `studentLabel(s)` | `'1. 김가온'` |
| `seatSelect(state, key, mode)` | 칸 선택 상태기계 → `{picked, done}` |
| `blockSpec(blocks, value)` | 블록 선택 → `'ALL'`·`'HH:mm-HH:mm;…'`·`''` |
| `sheetClickAllowed(openedAt, now)` | 시트 안 버튼 클릭을 받아도 되나(열린 지 `SHEET_GUARD_MS`=350ms 이상일 때만 참, 열기 전 0이면 참) |
