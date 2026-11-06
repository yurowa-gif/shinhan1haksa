# 1단계(출석부 핵심) 병렬 작업 분담안


> 2026-11-06 총괄이 작성(교차 검증 워크플로 결과). 0절의 "CLAUDE.md 급식 줄" 지적은 이미 고쳐져 있다.
>
> **확정(2026-11-06, docs/decisions.md 20~23):** 5절 시트 구조 1~4번 모두 승인(특이사항은 기간별 탭, status_changes는 나누지 않음, settings 행 추가, Drive 권한 추가). 4절 규칙 질문 a·b·c·e·f·g·k와 금요일 18:30 시작은 기본값대로 확정. h·i·j·l은 기본값으로 진행하고 `// ASSUMPTION:` 유지. 자동 1OUT 연결은 권장대로 2단계로 미룬다.
근거: CLAUDE.md, PRD 3·5·6·7·11절, docs/decisions.md, 0단계 코드(`claude/new-session-5xj12p` 브랜치). 코드는 읽기만 했고 `npm test`는 27개 모두 통과한다.

## 0. 시작 전에

**선결 조건**
1. **main은 아직 Initial commit(653cf2f)이다.** 0단계 코드는 PR #1 브랜치에만 있다. 네 세션이 main에서 분기하려면 PR #1을 먼저 병합해야 한다.
2. **S0 골격 PR(총괄)을 병합한 뒤** 네 세션을 연다. S0은 여러 세션이 함께 고치게 될 파일(tests/run.js, Index.html, 계약 문서)을 미리 나눠 둔다. 그래야 병합 충돌이 생기지 않는다.
3. 클라우드 세션에서는 Apps Script를 실행할 수 없다(clasp 로그인이 안 된다). 실제 동작 확인은 모두 선생님이 해야 한다. 그래서 확인 요청은 세 번으로 묶는다: ① 인쇄 스파이크, ② F1 완료 후, ③ F2 완료 후.

**검토하다 찾은 것(총괄이 판단할 일)**
- **CLAUDE.md와 PRD가 서로 다르다.** CLAUDE.md의 급식 줄은 "미실시·**일반 석식 변경**은 월·화 신청 → 다음 주 월요일"이다. 그런데 PRD F7 표와 결정 1번은 "일반 석식으로 변경도 실시와 같은 11:30 규칙"이다. RULES 세션은 PRD와 결정 1번을 따른다. CLAUDE.md는 총괄이 S0에서 고치고 선생님께 알린다.
- **1단계 기능이 2·3단계 탭을 필요로 한다.**
  - F2의 퇴실 공석은 `status_changes`(원래 F6)를 쓴다.
  - F2의 '학'·'가'는 `fixed_schedules`(원래 F9)를 쓴다.
  - F2 머리말의 근무자 이름은 `duty_slots`(원래 F3)를 쓴다.
  - F1의 자동 1OUT은 `violations`(원래 F4)를 쓴다.
  - 처리 방법:
    - `status_changes`와 `fixed_schedules`는 1단계에서 만든다. 명단 업로드의 학사·기숙사·조식·석식 초기값을 저장할 곳도 `status_changes`밖에 없다.
    - 근무자 이름은 F3 전까지 빈칸으로 둔다.
    - 자동 1OUT은 규칙 함수만 먼저 만들고, 실제 연결은 2단계에서 한다(5절 선택 항목).
  - F3 전에는 "근무교사" 범위 판정(`isOnDutyToday_`)이 늘 false다. 그래서 근무교사도 출석부 외에는 자기 담당 학생 기록만 보인다. 안전한 쪽으로 막히는 것이다.
- **`status_changes`를 기간별로 나누지 말자고 제안한다.** PRD 6.2는 "급식 로그"도 기간별 탭으로 나누라고 한다. 하지만 상태는 학기를 넘어 누적해서 계산해야 한다(5절, 확인 필요).
- **학번이 학년마다 바뀐다.** 2027년 2월 명단을 올릴 때 2026년 학생과 같은 사람인지 이어 줄 열이 업로드 양식에 없다. 3학년이 이전 자리를 유지하려면 이 연결이 필요하다. 기본은 학생 구글 계정으로 잇는다(4절 질문 i).
- **가짜 학생은 30명뿐이다(CLAUDE.md 1번).** 그래서 1층 146석 출석부는 대부분 공석으로 나온다. 레이아웃을 확인하는 미리보기에서는 같은 30명 이름을 반복해서 채우고, 새 가짜 인물은 만들지 않는다.

## 1. 파일 소유권

S0 병합 이후 기준이다. "소유"는 그 세션만 그 파일을 고친다는 뜻이다. 다른 세션은 PR 리뷰 댓글로 요청한다.

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| `src/Code.gs`, `src/Auth.gs`(permissions_ 포함), `src/Db.gs`, `src/Schema.gs`, `src/Setup.gs` | CODING | Schema는 5절 승인 후에만 고친다 |
| `src/features/*.gs` | CODING | 기능 하나당 파일 하나(2절의 파일 이름) |
| `src/ui/Index.html`, `src/ui/Client.html`, `src/ui/home_*.html`, `src/ui/screen_*.html` | CODING | Client.html에는 call·el·clear 같은 핵심 도우미만 둔다. 화면별 CSS는 그 화면 파일 안 `<style>`에 쓰고, 색·크기는 토큰 `var(--…)`만 쓴다 |
| `src/dev/*.gs`(FakeData, FakeSeats, PrintSpike) | CODING | FakeSeats는 S0이 처음 만든다 |
| `src/appsscript.json` | CODING | OAuth 범위 추가는 선생님 승인 후(5절) |
| `tests/public-api.json`, `tests/features/**`, `tests/core/{schema,auth,fakedata}.test.js` | CODING | 공개 함수 허용 목록과 첫 줄 권한 검사 대상 |
| `src/ui/Styles.html`, `src/ui/Components.html` | DESIGN | Components.html은 S0이 빈 파일로 만들고 Index에 include해 둔다 |
| `src/print/*.gs` | DESIGN | 출석부 HTML 렌더러. 순수 함수이고 Apps Script 서비스를 부르지 않는다 |
| `docs/design/**`, `design/**`, `tests/design/**` | DESIGN | `design/preview/out/`은 gitignore |
| `src/rules/*.gs`, `tests/rules/**`, `tests/helpers/gas-fakes.js`, `docs/contracts/rules-api.md` | RULES | rules-api.md는 S0이 초안을 쓰고 이후 RULES가 고친다 |
| `data/course_recommendations/**`, `docs/research/**`, `tests/research/**` | RESEARCH | `src/`는 건드리지 않는다 |
| `tests/run.js`, `tests/helpers/harness.js`, `tests/core/security.test.js`, `docs/contracts/sheet-model.md`, `package.json`, `.gitignore`, `CLAUDE.md`, `PRD.md`, `docs/decisions.md` | 총괄 | sheet-model 계약을 바꾸려면 CODING·DESIGN 둘 다 동의한 뒤 총괄이 PR을 연다 |

**충돌을 막는 규칙**
- **공통 컴포넌트가 아직 없을 때:** CODING은 자기 화면 파일 안에 `local…` 이름으로 임시 컴포넌트를 만들어 쓰고, PR 설명에 "DESIGN 이관 후보"라고 적는다. DESIGN이 그것을 Components로 옮기면 CODING이 다음 PR에서 호출하는 곳을 바꾼다. 그래서 디자인 작업이 늦어도 코딩이 멈추지 않는다.
- **화면 개선 요청:** DESIGN은 CODING의 화면 파일을 직접 고치지 않는다. 리뷰 댓글로 남기고, CODING이 다음 PR에서 반영한다.
- **브라우저 쪽 이름 충돌:** Components는 전역 객체 `UI` 하나만 내보낸다. 화면 파일은 `renderHome`/`renderScreen` 말고는 전역 이름을 만들지 않는다(IIFE로 감싼다).
- **서버 쪽 이름 충돌:** Apps Script는 모든 .gs 파일을 하나의 전역 공간에 합치고, 이름이 같으면 경고 없이 덮어쓴다. S0에 "전역 이름 중복 금지" 테스트를 넣는다. 접두어는 다음과 같다:
  - rules: 모듈 접두어(ymd·hm·meal…)
  - print: `print…`
  - features: 기능별 접두어
- **브랜치와 PR:**
  - 브랜치 이름: `stage1/<세션>-<작업>`(예: `stage1/code-c5-exceptions`).
  - PR 하나에 작업 하나.
  - PR을 열기 전에 main에 rebase하고 `npm test`를 통과시킨다.
  - PR 설명에는 "증명 테스트"와 선생님용 체크리스트를 넣는다.

## 2. 세션별 작업 순서

### S0. 골격 PR (총괄, 약 반나절, 다른 모든 PR보다 먼저)
1. **테스트 실행기 정리:** `tests/run.js`를 `tests/**/*.test.js`를 자동으로 찾아 실행하는 형태로 바꾼다. `tests/helpers/harness.js`에 `test()`와 `loadGs(files)`(vm 로더)를 둔다. 기존 테스트는 `tests/core/*.test.js`로 옮기고, `PUBLIC_ALLOWED`와 첫 줄 검사 표는 `tests/public-api.json`으로 뺀다.
2. **새 안전 테스트 세 가지:**
   - src 전체에서 전역 이름 중복 금지.
   - `src/ui/**`·`src/print/**`에서 innerHTML·outerHTML·insertAdjacentHTML·document.write 금지.
   - `src/rules/**`·`src/print/**`에서 Apps Script 서비스(SpreadsheetApp·Utilities·Session 등) 호출 금지.
3. **빈 Components 파일:** `src/ui/Components.html`(`var UI = {}`)을 만들고, `Index.html`에 include 한 줄을 추가한다.
4. **가짜 좌석 배치:** `src/dev/FakeSeats.gs`에 순수 함수 `buildFakeSeatLayout_()`를 만든다.
   - 1층 146석.
   - 남자 SA1 8석, SA2 9석(합계 17). 실제 자리배치도 구조를 따른다(docs/reference/real-layout-2025.md).
   - 여자 SA3 8석, SA4 8석, SA5 9석, SA6 9석(합계 34).
   - 기둥·비상문·창문 칸을 포함하고, 언제 실행해도 같은 결과가 나온다.
   - CODING의 시드, DESIGN의 미리보기, RULES의 테스트가 모두 이 배치를 쓴다.
5. **계약 문서 초안:** `docs/contracts/rules-api.md`(아래 시그니처)와 `docs/contracts/sheet-model.md`(아래 출석부 모델).
6. **CLAUDE.md와 .gitignore:**
   - CLAUDE.md 폴더 구조에 `src/rules/`, `src/print/`, `design/`, `data/`를 추가한다.
   - CLAUDE.md 급식 줄을 PRD F7에 맞게 고친다.
   - `.gitignore`에 `design/preview/out/`을 추가한다.
- **완료 기준:** 기존 27개와 새 안전 테스트가 모두 통과하고, 테스트 수가 줄지 않는다.

**출석부 모델 계약(sheet-model.md 요지)** — CODING이 이 모양으로 만들고, DESIGN이 이 모양을 그린다.
```
{ date:'2027-03-03', weekdayKo:'수', dayType:'mon_thu', operating:true, title:'신한학사 출석부',
  dutyNames:[],                                   // F3 전에는 빈 배열
  blocks:[{seq:1,start:'18:00',end:'20:00',label:'18–20'}],
  legend:[{mark:'○',text:'출석'}, …],
  spaces:[{ id, name:'1층 자습실', gender:'혼성', rows:13, cols:12,
    cells:[{ row, col, kind:'seat'|'pillar'|'door'|'window', seatLabel,
             occupant:null|{grade:1, name, display:'1. 이름'}, vacant:boolean,
             marks:[{seq:1, code:'EXC'|'FIXED'|'END'|'NONE', text:'학'}] }] }],
  unseated:[{display:'2. 이름'}], warnings:[], generatedAt }
```
특이사항의 사유 메모는 모델에 넣지 않는다. 건강 정보 노출을 줄이려는 것이고, 칸에는 유형 약어만 쓴다(ASSUMPTION).

### CODING (Sonnet): 기능 하나당 PR 하나

**모든 PR 공통 완료 기준**
- 새 공개 함수는 `tests/public-api.json`에 등록하고, 첫 줄에서 `requirePermission_`을 부른다.
- 쓰기는 `withLock_` 안에서 한다.
- 취소는 status를 '취소'로 바꾸고 audit_log에 남긴다.
- 아직 확정되지 않은 규칙에는 `// ASSUMPTION:` 주석을 단다.
- R4가 병합된 뒤에는 공개 함수마다 gas-fakes 권한 테스트를 쓴다(허용 1건 이상, 거부 1건 이상).

| # | 작업 | 내용 | 완료 기준 | 증명 테스트 |
| --- | --- | --- | --- | --- |
| C0 | 인쇄 방식 스파이크 | `src/dev/PrintSpike.gs`(편집기 전용). 가짜 1층(146석, 4블록) 출석부 한 장을 두 방식으로 만들어 Drive 테스트 폴더에 저장한다: (A) HTML→PDF `Utilities.newBlob(html).getAs('application/pdf')`, (B) 시트 템플릿에 값 채우기 → PDF 내보내기(A4 가로, 한 장 맞춤). 함께 시험할 것: 휴대폰 전달 방식 2가지(앱이 base64로 내려주기, Drive 링크), 미리보기 `iframe.srcdoc` 표시 | 선생님이 한 번 실행하고 다음을 표로 답한다: A4 가로로 나오는지, 한글 글꼴이 깨지지 않는지, 10초 안에 끝나는지, 휴대폰에서 열리는지. 그 결과로 총괄이 A/B를 정한다 | public-api 등록(assertOwnerRun_), 전역 이름 테스트 |
| C1 | 운영 기간 + 화면 라우팅 골격 | `features/Terms.gs`, `ui/screen_terms.html`. `?page=` 라우팅: 역할을 확인한 뒤 화면 파일을 include한다. 기간 목록·추가·수정은 관리자만. "이전 학기 명단 이어받기"는 RULES의 `carryOverEnrollments_`를 쓴다 | 관리자가 아닌 계정이 saveTerm을 부르면 "권한이 없습니다"가 뜨고 audit_log에 `denied:term.edit`가 남는다. 시작일이 종료일보다 늦으면 거부한다. 방학 기간에는 이어받기가 없다 | `tests/features/terms.test.js`(입력 검증 순수 함수), public-api |
| C2 | 1단계 스키마 + 가짜 데이터 | 5절 승인 후에만 한다. Schema·setup은 새 탭만 추가하고 기존 탭은 그대로 둔다. setup이 모든 기간에 대해 기간별 탭(`termSheetName_`·`ensureTermSheets_`)을 만들고, `blocks`가 비어 있으면 3.3절 기본 블록을 넣는다. `seedFakeStage1()`이 넣는 가짜 데이터: 일정 2건, 특이사항 10건, 고정 일정 8명, 좌석 배치, 초기 상태, 중도 퇴실 1명 | setup을 다시 실행하면 새 탭은 `[탭 생성]`, 기존 탭은 `[탭 유지]`로 나온다. 가짜 시드를 두 번 실행해도 중복이 생기지 않는다 | `tests/core/schema.test.js` 갱신. `tests/features/fake_stage1.test.js`: 좌석 146/17/34, 배정이 성별 구역에 맞는지, 참조 무결성, 실행마다 같은 결과 |
| C3 | 명단 업로드 | `features/Roster.gs`, `ui/screen_roster.html`. 시트에서 복사한 표(TSV)나 CSV를 붙여넣으면 미리보기를 보여 준다(신규·변경·퇴실 후보·오류와 그 줄 번호). 확인을 누르면 students, enrollments, guardian_links, status_changes 초기값을 한 번에 저장한다. 오류가 한 건이라도 있으면 아무것도 쓰지 않는다 | 같은 파일을 두 번 올리면 두 번째는 "변경 없음"이다. 명단에서 빠진 학생은 "퇴실 후보"로 표시만 하고 자동으로 퇴실시키지 않는다 | RULES `roster.test.js`. `tests/features/roster_parse.test.js`(TSV/CSV 구분, 따옴표). gas-fakes: 관리자가 아니면 거부 |
| C4 | 자습 일정·블록 | `features/Schedule.gs`, `ui/screen_schedule.html`. 요일 유형별 블록 편집(`validateBlocks_`로 검사). 월 달력에서 날짜별로 운영 안 함, 시작·종료 변경, 요일 유형 변경, 메모를 넣는다. "이 날 미리보기"는 `resolveDayPlan_`을 쓴다 | 어떤 날을 운영 안 함으로 바꾸면 미리보기가 "운영 안 함"이 된다. 월요일 종료를 22:00으로 당기면 22–24 블록이 사라진다. 되돌리기는 그 행의 status를 '취소'로 바꾸는 것이다 | RULES `schedule.test.js`, gas-fakes(설정은 관리자만) |
| C5 | F1 사전 특이사항 | `features/Exceptions.gs`, `ui/screen_exceptions.html`, 출결 담당·학사 교사·담임 홈 카드. 출결 담당 입력 흐름: 학생 검색 → 하루 또는 기간 → 전체·블록 칩·"HH:MM부터 귀가" → 유형 → 메모 → 저장(바로 확정). 담당교사·담임은 "요청"을 남기고, 출결 담당 홈에 배지가 뜨면 출결 담당이 확정하거나 사유를 적어 취소한다. 학생별 누적 목록과 오늘·내일 목록도 만든다 | PRD F1 완료 기준: 휴대폰에서 학생 1명의 하루 특이사항을 30초 안에 입력한다. 담임은 자기 반 학생에게만 요청할 수 있다(서버가 거부). 취소하면 audit_log에 전후 값이 남는다. 미인정 유형에는 "1OUT 예정" 표시가 뜬다 | RULES `attendance.test.js`·`out.test.js`. gas-fakes: 출결 담당 작성 허용 / 담임이 다른 반 학생 요청 시 거부 / 담당이 아닌 학사 교사 요청 거부 / 학부모·학생은 모두 거부 |
| C6 | F5 좌석 격자·수동 배치 | `features/Seats.gs`, `ui/screen_seats.html`. 공간 관리. 격자 그리기: 칸을 탭할 때마다 좌석→기둥→비상문→창문→빈칸 순으로 바뀐다. 선생님 좌석표 탭을 복사해 붙여넣으면 가져온다(`parseSeatGridTsv_`). 기간별 배정: 미배정 학생 목록(성별·학년·베리타스로 거르기)에서 학생을 탭한 뒤 자리를 탭하면 배정되고, 두 자리를 탭하면 맞바꾼다. 이름은 "1. 이름"으로 표시 | 가짜 배치(1층 146석 + SA 51석)를 그리고 30명을 배정한다. 새로고침해도 유지된다. 맞바꾸기는 두 행 수정이 한 락 안에서 일어난다. 자동 초안과 규칙 위반 빨간 표시는 3단계 | `tests/features/seats.test.js`(`parseSeatGridTsv_`, `planSeatSwap_`). gas-fakes: 학사 교사는 작성 허용, 담임은 보기만 |
| C7 | F2 출석부 PDF | `features/AttendanceSheet.gs`, `ui/screen_sheet.html`. `buildSheetModel_`(순수 함수)는 좌석 정보에 `resolveDayPlan_`·`seatMapOn_`·`resolveStudentDay_`를 조합한다. 미리보기는 A4 한 장 그대로(결정 34), DESIGN 렌더러가 만든 HTML을 `iframe.srcdoc`에 넣는다. PDF는 C0에서 고른 방식으로 만든다. 모델 캐시는 실측 뒤에 정한다(결정 39). PDF 받기는 미리보기와 같은 모델 함수를 쓴다. 근무·예비 감독 이름은 인쇄 화면에서 손으로 넣을 수 있다(4절 l, 저장하지 않음). 홈에 "오늘 출석부" 버튼 | PRD F2 완료 기준: 휴대폰에서 버튼 두 번으로 PDF가 열린다. 평일·금·토·일 가짜 출석부가 1층+SA1~6 전체를 A4 가로 한 장에 담고, 기존 시트의 정보를 모두 담으면서 더 빨리 읽고 표시할 수 있다(결정 33·34, 선생님이 나란히 대조). 퇴실 적용일부터 그 자리가 공석이 된다. 운영 안 하는 날은 PDF 대신 안내가 나온다. 10초 안에 끝난다 | `tests/features/sheet_model.test.js`: 블록 수 3/3/3/4, 칸 우선순위, 공석, 미배정 목록, 머리말. `sheet_model_contract.test.js`: 계약 모양 검사(DESIGN 픽스처도 같은 검사를 통과해야 함). gas-fakes 권한: 관리자·출결 담당·학사 교사만 허용, 담임·학생·학부모는 거부 |

### DESIGN (Sonnet): 코딩을 막지 않는다
DESIGN 결과물이 늦어지면 CODING은 지금의 Styles.html과 `docs/design/rules.md`(있으면)만 따라 계속 진행한다. DESIGN 결과물이 꼭 있어야 하는 것은 C7이 D4를 쓰는 부분뿐이다.

| # | 작업 | 내용 | 완료 기준 | 증명 테스트 |
| --- | --- | --- | --- | --- |
| D1 | 디자인 규칙 + 토큰 | `docs/design/rules.md`에 정리할 것: 휴대폰 세로 기준(가로 360px에서 가로 스크롤 없음, 누름 영역 48px, 기본 글자 18px, 주 버튼은 화면 아래 고정 바, 한 손 조작). 화면 틀: 뒤로·제목·본문·하단 작업 바. 상태 색: 확정·요청·취소, 학·가·병, 1OUT·퇴실 대상 — 색만으로 구분하지 않고 글자·모양을 함께 쓴다. 문구: 버튼은 동사("저장", "취소 처리"), 날짜는 "3월 3일(수)", 시각은 24시간제 "18:30", 오류 문구는 무엇을 하면 되는지 알려 준다. 확인이나 사유 입력이 필요한 동작 목록. Styles.html 토큰도 확장한다 | 기존 홈 화면이 그대로 보인다 | `tests/design/styles.test.js`: 필수 토큰이 있다, 기존 UI가 쓰는 클래스가 모두 정의되어 있다, `.btn` 최소 높이 44px 이상 |
| D2 | 화면 와이어프레임(문서) | `docs/design/screens.md`. 순서: C5(F1) → C7(F2) → C6(F5) → C1·C3·C4. F1은 "30초 입력" 흐름을 탭 수까지 적는다. F2는 "버튼 두 번" 경로(홈 → 오늘 출석부 → PDF 열기)를 적는다. 출결 담당·학사 교사·담임 홈 카드 배치도 포함 | CODING의 해당 PR보다 먼저 main에 있으면 CODING이 그대로 따른다. 늦으면 리뷰 댓글로 반영 | (문서) |
| D3 | 공통 컴포넌트 | `src/ui/Components.html`의 `UI.*`: studentPicker(이름·학번·초성 검색), dateField, rangeField, blockChips, segmented, bottomSheet, confirmWithReason, toast, badge, statusPill, emptyState, actionBar, seatGrid(격자 표시 + 두 칸 선택). 서버를 부르지 않고 데이터와 콜백만 받는다. 시그니처는 `docs/design/components.md`에 적는다. `design/preview/components.html`에서 가짜 `google.script.run`으로 미리 볼 수 있게 한다 | 360px에서 모든 상태가 보인다. 글자는 모두 textContent로 넣는다 | `tests/design/components.test.js`: innerHTML류가 없다, 문서의 API 목록과 실제 `UI` 키가 일치한다 |
| D4 | 출석부 A4 가로 인쇄 레이아웃 | 아래 따로 정리 | 아래 따로 정리 | 아래 따로 정리 |
| D5 | 인쇄 확인표 | `docs/design/print-check.md`: 선생님이 기존 출석부와 나란히 놓고 볼 항목(머리말, 칸 순서, 약어, 범례, 글자 크기) | C7 체크리스트에 들어간다 | (문서) |

**D4 출석부 A4 가로 인쇄 레이아웃 상세**
- **렌더러:** `src/print/AttendanceSheetHtml.gs`의 `printRenderSheet_(model, opts)`가 HTML 문서 문자열을 돌려준다. **모든 공간(1층+SA1~6)을 `<section class="page">` 하나, A4 가로 한 장에** 담는다(결정 34). 오늘 특이사항 목록·미배정 학생은 자리가 없으면 둘째 `<section class="page">`(선택 출력).
- **PDF 변환기 호환:** 표(table) 기반, CSS는 인라인, flex·grid·웹폰트·외부 리소스는 쓰지 않는다. `@page { size: A4 landscape; margin: 8mm }`.
- **좌석 칸 구성:**
  - 1줄: "1. 이름" 또는 "공석".
  - 2줄: 블록 칸들(미리 채운 학·가·병결·정상 종료).
  - 3줄: 사유를 손으로 쓰는 칸('조' 아래 사유).
- **나머지 칸과 머리말:**
  - 기둥은 회색 빗금, 비상문·창문은 글자로 표시한다.
  - 머리말: "신한학사 출석부 · 2027년 3월 3일(수) · 근무: ____".
  - 블록 시간은 칸마다 쓰지 않고 머리말에 한 번만 쓴다(①18–20 ②20–22 …).
  - 흑백으로 인쇄해도 구분되어야 한다.
- **1층 146석 + SA 51석(합 197석):** 한 장에 넣는다(결정 34). 실제 줄 배치(1층 세로 8줄, SA실 방별 배치)는 지킨다. 손으로 표시할 칸·이름 글자의 최소 크기를 정해 지키고(기준안: 표시 칸 4.5mm·이름 6.5pt 이상, 크롬 A4 인쇄로 확인), 그래도 안 들어가면 두 장으로 나누지 말고 총괄에게 알린다. 머리말은 한 줄로 줄인다.
- **미리보기:** `design/preview/build.js`가 `design/fixtures/sheet-model.{mon_thu,fri,sat,sun}.json`(FakeSeats + 가짜 30명 반복)으로 미리보기 파일을 만든다.
- **완료 기준:**
  - 크롬 인쇄 미리보기(배율 100%)에서 1층+SA1~6 전체가 A4 가로 1장으로 나온다(특이사항 목록 둘째 장은 선택).
  - 블록이 4개인 일요일(결정 32)에도 한 장에 들어가고, 표시 칸·이름이 최소 크기 이상이다.
  - C0에서 B안이 정해지면 `docs/design/print-sheet-spec.md`(열 너비·글꼴·테두리)를 추가로 내고, HTML 렌더러는 화면 미리보기용으로 남긴다.
- **증명 테스트:** `tests/design/print.test.js`
  - 픽스처 4종이 모두 렌더된다.
  - 페이지 수 = 공간 수.
  - 좌석 칸마다 블록 칸 수 = blocks.length.
  - `<script>`와 `&`가 이스케이프된다.
  - 공석이 "공석"으로 표기된다.
  - 머리말에 날짜·요일이 들어간다.
  - 픽스처가 sheet-model 모양 검사를 통과한다.

### RULES & TESTS (Opus): 순수 함수 + node 테스트

**공통 규칙**
- `src/rules/*.gs`에서는 다음을 쓰지 않는다: Apps Script 서비스, 인자 없는 `new Date()`, 다른 파일의 전역 값.
- 입출력 형식:
  - 날짜: 'yyyy-MM-dd'
  - 시각: 'HH:mm'('24:00' 허용)
  - 일시: 'yyyy-MM-ddTHH:mm:ss'(KST, `nowIso_`와 같은 형식)
- 내부 계산은 `Date.UTC`로만 한다. 함수 이름은 모두 `_`로 끝낸다.
- 테스트는 표 형식(table-driven)으로 쓰고, `TZ=UTC`와 `TZ=Asia/Seoul`에서 각각 한 번씩 실행해 모두 통과해야 한다.
- 아직 확정되지 않은 규칙은 기본값으로 구현하고 `// ASSUMPTION:`을 달며, 테스트 이름에 "(가정)"을 붙인다.

| # | 작업 | 쓰는 곳 | 완료 기준(테스트가 증명) |
| --- | --- | --- | --- |
| R1 | DateRules + ScheduleRules | C4, C5, C7 | 윤년(2028-02-29)·월말·연말 계산. 요일 유형 판정. 운영 안 하는 날. 날짜별 종료 시각을 당기면 그 뒤 블록이 빠짐. 요일 유형 바꾸기. 방학 블록이 없으면 학기 블록 사용(가정). 블록 겹침·형식 오류 검출 |
| R2 | StatusRules + RosterRules | C1, C3, C6, C7 | 상태: 적용일 순 누적(적용일이 같으면 나중 기록), 취소된 기록 무시, 퇴실 적용일 전날은 자리 있음·당일부터 공석(가정), 재입실, 중도 입실자는 미배정 목록에. 이어받기: 학기→학기만, 방학 제외, 퇴실자 제외. 명단: 열 순서 검사, O/X 정규화, 학번·이메일 중복 검출, 같은 파일 재업로드는 변경 0건, 학년이 올라간 학생을 이메일로 연결, 연결이 안 되면 ambiguous |
| R3 | AttendanceRules(칸 우선순위) | C5, C7 | 우선순위: 확정 특이사항 > 고정 일정 > 23:00 종료 > 빈칸. '요청'·'취소' 특이사항은 무시. 'ALL'과 시각 범위 겹침 판정("15:00부터 귀가" = 15:00–24:00). 23:00 종료는 월~목에만 적용하고 마지막 블록에 "정상 종료", 금요일은 적용 안 함. 한 칸에 확정 특이사항이 2건이면 최근 확정 1건 + more=1(가정). 고정 일정은 확정된 것 중 가장 최근 적용월을 쓴다(F9 "확정 전에는 기존 시간표 유지") |
| R4 | gas-fakes 통합 테스트 도구 | C1 이후 모든 공개 함수 | 메모리 안에서 흉내 내는 서비스: SpreadsheetApp, PropertiesService, LockService, CacheService, Session(접속자 바꾸기 가능), Utilities(getUuid, formatDate KST, base64). src 전체를 vm 하나에 올리고 buildFakeData_로 시트를 채운다. 0단계 함수로 검증: 학부모가 남의 학생으로 getStudentSummary를 부르면 거부되고 audit_log에 `denied:`가 남는다, 학생이 getHomeData('admin')를 부르면 거부된다 |
| R5 | OutRules(자동 1OUT) | C5(선택), 2단계 F4 | `reconcileAutoOuts_`가 확정된 미인정 특이사항으로 OUT 초안을 만든다(입력자 = 확정자, 적발 교사 = dutyByDate[날짜] 또는 빈칸). '요청' 상태는 만들지 않는다. 두 번 실행해도 새로 만드는 것이 0건이다(source_exception_id로 중복 방지). 특이사항이 취소되거나 유형이 바뀌면 연결된 OUT을 취소한다. 교사가 직접 입력한 OUT은 건드리지 않는다. 기간 입력 묶음은 1OUT(가정), per='row' 옵션도 테스트한다. `outLevel_`: 학기마다 초기화, 2개 이상이면 퇴실 대상 |
| R6 | MealRules(급식 적용일) | 2단계 F6·F7 | 아래 표 전부. 11:29:59 신청은 당일, 11:30:00 신청은 다음 날(가정). 연말: 2026-12-31 신청 → 2027-01-01. 미실시는 요일 7개 모두. 기숙사 입실과 함께 조식 실시 = 입실일. 학사 퇴실로 조식 중단 = 퇴실일. `mealChangeKind_` 전환: 학사→일반 = to_general, 일반→학사 = start, 일반→미실시 = stop(가정) |
| R7 | 계약 문서 갱신 | 전체 | `docs/contracts/rules-api.md`가 실제 시그니처와 일치한다(테스트: 문서에 적힌 함수 이름이 src/rules에 모두 있다) |

**미실시 적용일 시험 표(R6)** — 2027-03-01은 월요일이다.

| 신청일 | 요일 | 적용일 |
| --- | --- | --- |
| 2027-03-01 | 월 | 2027-03-08 |
| 2027-03-02 | 화 | 2027-03-08 |
| 2027-03-03 ~ 03-07 | 수~일 | 2027-03-15 |
| 2026-12-30 | 수 | 2027-01-11 |

**함수 시그니처** — CODING이 부르는 이름이다. S0의 `docs/contracts/rules-api.md`에 그대로 넣는다.
```js
// src/rules/DateRules.gs
function ymdIsValid_(s)                     // boolean
function ymdAddDays_(ymd, n)                // 'yyyy-MM-dd'
function ymdWeekday_(ymd)                   // 0=일 … 6=토
function ymdWeekdayKo_(ymd)                 // '월'…'일'
function ymdMondayOf_(ymd)                  // 월~일 주의 월요일
function ymdRange_(from, to, maxDays)       // 양 끝 포함 배열, 기본 최대 366
function hmToMin_(hm)                       // 'HH:mm' → 분, '24:00' = 1440
function minToHm_(min)
function isoLocalSplit_(iso)                // → {date:'yyyy-MM-dd', min:Number}

// src/rules/ScheduleRules.gs
function baseDayType_(ymd)                  // 'mon_thu'|'fri'|'sat'|'sun'
function pickDaySchedule_(rows, ymd)        // 취소 제외, updated_at 최신 1행 또는 null
function validateBlocks_(blocks)            // [{index, message}]
/** src = {termType:'학기'|'방학', daySchedule:row|null, blocks:rows[], defaults:{mon_thu:{start,end}, fri, sat, sun}}
 *  → {date, operating, dayType, start, end, blocks:[{seq,start,end,label,key:'HH:mm-HH:mm'}], memo, warnings:[]} */
function resolveDayPlan_(ymd, src)

// src/rules/AttendanceRules.gs
function parseBlockSpec_(spec)              // 'ALL' | 'HH:mm-HH:mm;…' → {all, ranges:[{start,end}]}
function formatBlockSpec_(parsed)
function blockSpecCovers_(spec, block)      // 겹치면 true
function effectiveFixedRows_(rows, studentId, ymd)
/** c = {block:{seq,start,end}, isLastBlock, dayType, weekdayKo, exceptions:rows[], fixedRows:rows[], endType:'23:00'|'23:50'|'',
 *        opts:{endTypeDayTypes:['mon_thu'], endTime:'23:00', typeShort:{유형:약어}, endLabel:'정상 종료'}}
 *  → {code:'EXC'|'FIXED'|'END'|'NONE', text, exceptionId, more} */
function resolveCell_(c)
function resolveStudentDay_(plan, s, opts)  // s = {exceptions, fixedRows, endType} → 블록 순서대로 marks[]

// src/rules/StatusRules.gs
function statusOn_(changes, studentId, item, ymd)   // item '학사'|'기숙사'|'조식'|'석식' → 값 또는 ''
function isActiveOn_(changes, enrollment, ymd)      // 등록 + 학사 '입실'
function assignmentOn_(assignments, seatId, termId, ymd)
function seatMapOn_(seats, assignments, enrollments, changes, termId, ymd)
        // → {bySeat:{seatId:{studentId|null, vacant, reason:''|'퇴실'|'미배정'}}, unseated:[studentId]}
function carryOverEnrollments_(terms, enrollments, changes, newTerm)  // 직전 '학기'의 재학생 → 새 등록 초안

// src/rules/RosterRules.gs
function parseRosterTable_(rows)            // 2차원 배열(10.2 열 순서) → {records, errors:[{line,column,message}]}
function parseGuardianTable_(rows)
function diffRoster_(records, existing, termId, ymd)
        // existing = {students, enrollments, changes, users}
        // → {createStudents, updateStudents:[{id,patch}], createEnrollments, updateEnrollments,
        //    createChanges, leavingCandidates, ambiguous, warnings}

// src/rules/OutRules.gs
function reconcileAutoOuts_(exceptions, violations, opts)
        // opts = {autoTypes, ruleName:'무단 지각·결석·이탈', per:'group'|'row', dutyByDate:{}}
        // → {toCreate, toCancel:[{violationId, reason}]}
function outLevel_(violations, studentId, termId)   // {count, level:0|1|2, label:''|'1OUT'|'퇴실 대상'}

// src/rules/MealRules.gs
function mealEffectiveDate_(kind, requestedAt, opts)
        // kind 'start'|'to_general'|'stop'|'with_dorm_entry'|'on_leave'
        // opts = {cutoff:'11:30', entryDate, leaveDate} → {date, rule}
function mealChangeKind_(item, fromValue, toValue)
```

### RESEARCH (Opus): F15 권장 이수 과목(6단계용이지만 지금 시작)

**원칙**
- `src/`는 건드리지 않는다.
- 출처는 공식 문서만 쓴다: 대학 입학처, 대학 공동연구, 교육부, 대교협. 학원·블로그는 쓰지 않는다.
- 내려받은 PDF는 저작권과 용량 문제로 커밋하지 않고, 인용 정보만 남긴다.
- 개인정보는 다루지 않는다.

| # | 작업 | 완료 기준 | 증명 테스트 |
| --- | --- | --- | --- |
| RS1 | 범위·방법 문서 `docs/research/course-recs-plan.md` | 대상 대학 후보(선생님 확인 전 대체안: 서울대, 경희·고려·성균관·연세·중앙 공동 가이드 등 — 실제로 발행됐는지 조사해서 확인하고, 확인이 안 되면 뺀다). 학년별 적용 대입 연도: 2025 입학 → 2028 대입, …, 2027 입학 → 2030 대입(모두 2022 개정 교육과정). "기준 연도"는 적용 대입 학년도로 정의하자고 제안. 핵심·권장 구분이 없는 대학은 어떻게 처리할지. 공식 도메인 허용 목록 | (문서) |
| RS2 | 표준 과목명 목록 | `data/course_recommendations/standard_courses_2022.csv`(2022 개정 교육과정 고시 과목명과 출처). 탐구발견 교육과정 자료를 받으면 그것으로 바꾼다 | `tests/research/standard_courses.test.js`: 중복 없음, 출처 있음 |
| RS3 | 대학별 수집 | 아래 따로 정리 | 아래 따로 정리 |
| RS4 | 매년 갱신 절차 | `docs/research/course-recs-update.md`: 관리자가 새 자료를 넣는 순서, 바뀐 행을 확인하는 방법 | (문서) |

**RS3 대학별 수집 상세**
- **본 파일:** `data/course_recommendations/course_recommendations.csv`.
  - 열은 정확히 `base_year,university,unit,core_courses,recommended_courses,source_url,source_title`. PRD 7절 열을 그대로 쓰되, "출처 URL·문서명"은 두 열로 나눴다.
  - 과목은 `;`로 구분한다.
- **보조 파일 두 개:**
  - `sources.csv`: source_title, publisher, url, published_date, retrieved_at, page
  - `course_name_map.csv`: 원문 과목명 → 표준 과목명
- **PR 단위:** 대학 묶음마다 PR 하나.
- **증명 테스트** `tests/research/course_recs.test.js`:
  - 헤더가 정확히 일치한다.
  - 필수 칸이 비어 있지 않다.
  - source_url이 https이고 허용 도메인 목록 안에 있다.
  - (base_year, university, unit) 조합이 중복되지 않는다.
  - 모든 과목명이 표준 목록이나 이름 대응표에 있다.
  - 이메일·전화번호 패턴이 없다.

**네트워크가 막힐 때:** 대학 사이트가 세션 네트워크 정책에 막히면 막힌 호스트 목록을 PR에 적고 총괄에게 알린다. 직접 우회하지 않는다.

## 3. 의존성과 병합 순서

```
PR #1(0단계) → S0 골격 ─┬─ RULES:    R1 → R2 → R3 → R4 → R5 → R6   (R7은 수시)
                       ├─ DESIGN:   D1 → D3 → D4 → D5   (D2는 병행)
                       ├─ CODING:   C0 → C1 → [스키마 승인] C2 → C3 → C4 → C5 → C6 → C7
                       └─ RESEARCH: RS1 → RS2 → RS3(여러 PR) → RS4   (다른 세션과 의존 없음)
```

| 병합할 PR | 그 전에 main에 있어야 하는 것 |
| --- | --- |
| 모든 세션의 첫 PR | PR #1, S0 |
| C0 스파이크 | `appsscript.json` 범위 추가 승인(5절 4번) |
| C1 운영 기간 | R2(`carryOverEnrollments_`). R2가 늦으면 이어받기 버튼만 다음 PR로 미룬다 |
| C2 스키마 | 선생님의 5절 승인 |
| C3 명단 | C2, R2 |
| C4 일정·블록 | C2, R1 |
| C5 F1 | C4, R3, R4(권한 테스트). 자동 1OUT을 1단계에 연결한다면 R5와 violations 탭 승인도 필요 |
| C6 F5 | C2, R2(`seatMapOn_`). 선생님 좌석표가 아직 없으면 가짜 배치로 병합하고, 가져오기는 파일을 받는 대로 확인한다 |
| C7 F2 | C5, C6, R1~R3, D4, C0 결과(A/B 확정) |
| R5·R6 | 없음. 2단계를 1월에 바로 시작하려면 12월 안에 끝낸다 |
| D1·D3 | 없음. CODING PR과 같은 날 올라오면 DESIGN을 먼저 병합한다(CSS 토큰이 먼저 있어야 함) |

**일정** — 1단계는 12월이다. S0을 병합한 주를 W1로 센다.
- **W1:** S0, C0, C1, R1, R2, D1, RS1. 선생님: 스키마 승인, C0 스파이크 실행(확인 ①).
- **W2:** C2, C3, C4, R3, R4, D3, D4 초안, RS2.
- **W3:** C5(F1), R5, R6, D4 마무리, D2. 선생님: 명단 업로드·일정·F1 확인(확인 ②).
- **W4:** C6(F5), C7(F2), D5, RS3. 선생님: 평일·금·토·일 출석부를 기존 시트와 대조(확인 ③ = 1단계 완료 기준).

## 4. 선생님 입력이 필요한 것과 그동안의 대체물

| # | 필요한 것 | 막히는 곳 | 그동안 쓰는 대체물 | 필요 시점 |
| --- | --- | --- | --- | --- |
| 1 | 5절 시트 구조 추가 승인 | C2 이후 전부 | 브랜치에서 제안 구조로 개발하고, 승인 전에는 병합하지 않는다 | W1 |
| 2 | OAuth 범위 추가 승인 + C0 스파이크 1회 실행 | C7의 PDF 방식 | 화면 미리보기(HTML)로 개발 | W1~W2 |
| 3 | 1층·SA1~6 좌석표 탭(이름 지운 것, 10.1 5번) | C6 가져오기, D4 최종 모양, 1단계 완료 기준 | `buildFakeSeatLayout_`(1층 세로 8줄 146석, SA 남 8·9, 여 8·8·9·9 — 실제 배치 구조) | W3 |
| 4 | 기존 출석부 인쇄본 사진 1장(이름 가림). 확인할 것: 칸 안에 무엇을 쓰는지, 1층이 A4 한 장인지, SA실 몇 개를 한 장에 넣는지, 배정 안 된 자리도 "공석"으로 쓰는지 | D4 | ~~공간마다 1장~~ → 결정 34로 1층+SA 전체 한 장. 미배정·퇴실 모두 "공석" | W2 |
| 5 | 특이사항 유형 약어(출석부 칸에 쓰는 글자) | R3의 typeShort, D4 | 병결→병결, 병지각→병지, 병조퇴→병조, 가정사유→가정, 학원→학원, 학사 외 프로그램→외부, 학사 내 프로그램→내부, 미인정지각→무지, 미인정조퇴→무조, 미인정결석→무결, 기타→기타. 설정값이라 나중에 바꿀 수 있다 | W2 |
| 6 | 요일별 블록·자습 시간 확인(10.1 7번): 금요일 시작 시각, 방학 블록 | R1, C2의 기본 블록 | PRD 3.3 그대로. 금요일 18:30–23:00, 방학은 학기 블록과 같게 | W2 |
| 7 | 2027 학사일정(운영 안 하는 날, 10.1 8번) | C4 실제 입력(4단계) | 가짜 날짜 2개(운영 안 함 1개, 종료 22:00 1개) | 2월 |
| 8 | 교사 명단(10.1 9번) | 실제 권한 설정(4단계) | FakeData의 가짜 교사 3명 | 2월 |
| 9 | 0단계 진단 결과 | 학생·학부모 화면(1단계 범위 밖) | 1단계는 교사 화면만 만든다 | — |
| 10 | RESEARCH 대상 대학 목록, 탐구발견 교육과정 자료 파일 | RS3 범위, 과목명 대응 | RS1 후보 목록, 교육부 고시 과목명 | 3월 |

**규칙 질문** — 답을 받기 전까지 아래 기본값으로 구현하고 `// ASSUMPTION:`을 단다.
- **a. 퇴실 적용일 당일**, 그 학생이 출석부에 나오는가? 기본: 적용일부터 공석. 조식이 "퇴실일 즉시 중단"인 것과 같은 해석이다.
- **b. 미인정결석을 여러 날 한 번에 입력하면** 1OUT인가, 날마다 1OUT인가? 기본: 입력 1건 = 1OUT. 자동으로 2OUT·퇴실 대상이 생기지 않게 하려는 것이고, 더 필요하면 교사가 직접 추가한다.
- **c. 한 칸에 특이사항이 둘 이상이면** 최근 확정 1건만 표시하고 "외 1"을 붙인다.
- **d. 날짜별 종료 시각을 당기면** 그 뒤 블록은 출석부에서 뺀다. 시작 시각을 바꾸는 것은 블록에 영향이 없다.
- **e. 23:00 종료는 월~목에만** 적용한다. 금요일은 원래 전원 23:00 귀가다.
- **f. 11:30 정각 신청**은 마감 후로 보아 다음 날부터 적용한다.
- **g. 일반 석식 → 미실시**도 미실시 규칙을 따른다(월·화 신청 → 다음 주 월요일, 수~일 신청 → 다다음 주 월요일).
- **h. 명단 업로드 양식에 종료 유형 열이 없다.** 기본 23:50으로 넣고, F9가 생기기 전까지는 화면에서 고친다.
- **i. 학년도가 바뀔 때 같은 학생을 잇는 키**는 학생 구글 계정이다(기본). 계정이 바뀌는 학생이 있다면 업로드 양식에 "이전 학번" 열을 추가할지 정해야 한다.
- **j. 휴대폰에서 출석부 PDF를 여는 방법.** 기본은 앱이 파일을 직접 내려주는 것(공유 없음). 대안은 Drive 출력 폴더를 학사 교사 계정에만 보기 권한으로 공유하는 것. C0 결과를 보고 정한다.
- **k. 출석부 칸에는 유형 약어만** 쓰고 사유 메모는 넣지 않는다(건강 정보).
- **l. 근무자 이름 머리말**은 F3(2단계) 전까지 빈칸이고, 인쇄 화면에서 직접 입력할 수 있다.

## 5. 1단계 시트 구조 추가안 (선생님 확인 필요)

**원칙**
- **기존 탭(users, terms, students, enrollments, guardian_links, audit_log)의 열은 바꾸지 않는다.** setup()은 헤더가 코드와 다르면 경고만 하고 고치지 않기 때문에, 기존 탭을 바꾸면 따로 마이그레이션해야 한다.
- 새 탭은 모두 첫 열이 `id`이고, 끝 4열이 `created_at, created_by, updated_at, updated_by`다(아래 표에서는 생략).
- 행은 지우지 않고 `status`를 '취소'로 바꾼다.

**운영 DB — 1단계에 만드는 탭**

| 탭 | 열(id·공통 꼬리 제외, 순서대로) | PRD 7절과 다른 점 | 쓰는 곳 |
| --- | --- | --- | --- |
| `status_changes` | student_id, item(학사·기숙사·조식·석식), value, requested_at, effective_date, effective_date_auto, reason, doc_submitted, linked_change_id, source(명단업로드·F6·F7), status(유효·취소), memo | 신청일을 신청 일시(requested_at)로 바꿨다(11:30 규칙에 시각이 필요). 추가 열: effective_date_auto(자동 계산값을 남겨 수정 여부 확인), source, status, memo | C3 초기 상태, C7 공석, 2단계 F6·F7 |
| `day_schedules` | date, operating, start, end, day_type, memo, status | status 추가 | C4, C7 |
| `blocks` | term_type(학기·방학), day_type(mon_thu·fri·sat·sun·특별 코드), seq, start, end, label, status | term_type, status 추가 | C4, C5, C7 |
| `exceptions_<기간 id 앞 8자>` (기간별 탭, PRD 6.2) | term_id, group_id, student_id, date, blocks('ALL' 또는 'HH:mm-HH:mm;…'), type, reason, status(요청·확정·취소), requested_by, requested_at, confirmed_by, confirmed_at, cancel_reason | 추가 열: term_id, group_id, requested_at, confirmed_at, cancel_reason. 기간 입력은 날짜마다 1행으로 쓰고 group_id로 묶는다. 블록은 순서 번호 대신 시각 범위로 쓴다(블록 설정이 바뀌어도 기록의 뜻이 유지된다) | C5, C7 |
| `fixed_schedules` | student_id, month(yyyy-MM), weekday(월~일), blocks(위와 같은 표기), code(학·가), submitted_at, parent_agreed_at, teacher_confirmed_at, status | status 추가. 1단계에서는 가짜 데이터로 출석부 표시에만 쓰고, 입력 화면은 3단계 F9 | C7 |
| `spaces` | name, gender(남·여·혼성), rows, cols, sort_order, status, memo | rows, cols, sort_order, status, memo 추가 | C6, C7 |
| `seats` | space_id, row, col, label, kind(좌석·기둥·비상문·창문), status | status 추가 | C6, C7 |
| `seat_assignments` | term_id, seat_id, student_id, valid_from, valid_to, status(배정·취소), memo | valid_from·valid_to 추가(빈칸이면 기간 전체). 중도 퇴실·입실이 있어도 지난 날짜 출석부를 다시 뽑으면 그날 학생이 나오고, 방학의 날짜별 자리표에도 대비된다. status, memo 추가 | C6, C7 |

**선택 — 자동 1OUT을 1단계 F1에 바로 연결할 때만 필요한 탭**
권장은 2단계로 미루는 것이다. 미루면 2단계 F4에서 `reconcileAutoOuts_`로 그동안 쌓인 미인정 특이사항을 한 번에 OUT으로 만든다. 1단계에는 실제 데이터가 없으니 잃는 것이 없다.

| 탭 | 열 |
| --- | --- |
| `violation_rules` | name, description, active, sort_order |
| `violations_<기간 id 앞 8자>` | term_id, student_id, occurred_at, rule_id, rule_name, memo, detected_by, entered_by, status(유효·취소), source(직접·F1자동), source_exception_id, cancel_reason |

**확인받을 구조 결정**
1. **기간별 탭 이름**은 `exceptions_` + 기간 id 앞 8자로 한다. 기간 이름을 바꿔도 깨지지 않는다. 대안은 `exceptions` 탭 하나에 term_id 열을 두는 것인데, 더 단순하지만 PRD 6.2와 다르다.
2. **`status_changes`는 기간별로 나누지 않는다.** PRD 6.2의 "급식 로그" 분리와 다르다. 상태는 학기를 넘어 이어서 계산해야 하고, 행 수도 적다(학생 180명 × 학기당 몇 건).
3. **설정 스프레드시트 `settings` 탭에 행을 추가한다(열은 바꾸지 않음):** `study.fri.start`(18:30), `study.fri.end`(23:00), `attendance.end_type_day_types`(mon_thu), `attendance.end_label`(정상 종료), `exception.type_short`(4절 5번 약어), `print.title`(신한학사 출석부), `print.vacant_label`(공석).
4. **`src/appsscript.json` OAuth 범위 추가:** PDF 저장·변환을 위한 Drive 권한, B안이면 시트 PDF 내보내기를 위한 `script.external_request`도 필요하다. 추가하면 소유자가 권한을 다시 승인해야 한다.
5. **6단계용(지금은 만들지 않음):** RESEARCH CSV가 맞출 대상인 설정 스프레드시트 `course_recommendations` 탭. 열은 base_year, university, unit, core_courses, recommended_courses, source_url, source_title.