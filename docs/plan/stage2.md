# 2단계(근무·생활 기록) 병렬 작업 분담안

> 2026-11-07 총괄 초안(영역별 독자 5명 → 종합 → 비평 2명 50건 반영 → 총괄 검토). 작성 기준 main `c7de125`(지금 main은 R7 #48까지 병합, `npm test` 601개).
> **확정 전 초안.** 승인 없이 시작해도 되는 것(3절 "지금" 줄: S2-0a·S2-0c, R8~, D6~, C9a, C16)만 지금 한다. **5절 구조는 2026-11-07 선생님 승인(결정 41)** — S2-0b를 진행한다. 4-1 질문은 T0b에서 하나씩 답을 받는다. 답을 받으면 `docs/decisions.md` 41번부터 적고 이 문서의 "확정 전"을 지운다.
>
> **선생님 답 반영(2026-11-07, 결정 44~47).** 아래 본문보다 이 상자가 앞선다.
> - **Q1 → 결정 44:** 근무표 담당자도 근무표 화면에서 그날 "운영 안 함"을 켜고 끈다(권한 키 `duty.operating`, day_schedules의 operating·memo만). C8a에 넣는다. D6 시안·screens.md를 고친다.
> - **Q2·Q7 → 결정 45:** 보기는 1학사 교사(학사 교사·출결 담당·관리자) = 학사생 전체, 담임 = 자기 반. 그래서 **C8v(새, CODING-A, C8s 앞)**: 보기 키(`student.view`·`exception.view` 목록·`status.view`·`out.view` 목록)에서 학사 교사도 이번 기간 등록 학생 전체를 통과시킨다(규칙 표시 `wideView`). 쓰기 키(`exception.save`·`out.save`·`status.edit`·`counsel.*`)는 그대로 담당·근무·관리자. 면담 칸(`counsel.view`)은 넓히지 않는다. **C8s**는 보기에서 근무교사 판정이 필요 없어져 `out.save`의 `dutyWindow`(발생일 근무자, 다음 날까지)만 남는다. `out.view`·`status.list`·`status.view`에 attendance를 넣었다(S2-0a).
> - **Q3 → 결정 46:** `dutyRecord_`는 예비 지정을 따로 센다(대신 근무한 날은 빼고). R8 기본값을 바꾼다.
> - **Q4 → 결정 47:** 기록표(D7·C14)는 근무 합계를 크게, 조별 횟수는 참고로.
> 근거: CLAUDE.md, PRD §3·4·5(F3·F4·F6·F7·F12)·6·7·8·9·11·13, decisions.md 1~40, `docs/plan/stage1.md`, `docs/plan/followups.md`, `docs/contracts/*`, `docs/design/screens.md` 5-2. 코드는 읽기만 했다.

## 0. 시작 전에

**범위와 완료 기준** (PRD §11 2단계 줄, PRD.md:436)
- 범위: F3 근무표·교대·수당 양식, F4 OUT(F1 자동 1OUT 연결 포함), F6 입퇴실, F7 급식 적용일·식수 집계, F12 최소 기능(2OUT 학부모 면담 기록).
- 완료 기준: ① 1월 근무표로 기록표 출력 ② 급식 적용일 규칙 표의 모든 경우 통과 ③ 2OUT 학생은 면담 기록 전에는 퇴실 확정이 막히고, 기록 후 F6 학사 퇴실 신청이 미리 채워진다. 테스트 대응은 7절에 있다.

**선결 조건**
1. **1단계는 아직 실제 Apps Script에서 돌려 본 적이 없다.** 0단계 설치·진단(`docs/stage0-checklist.md`), C0 `spikeRunAll`, 1단계 출석부 대조(`print-check.md`)가 남아 있다(followups.md:18·21). 2단계의 메일·PDF·xlsx는 실제 배포에서만 확인된다. 그래서 **선생님 확인 ⓪은 ②·③·④의 필수 선행 조건이다.** 코드 작업은 ⓪을 기다리지 않는다. 다만 일정표의 ②~④는 ⓪이 끝난 주를 기준으로 센다.
2. **T0a(선생님 대화, 한 번에):** 5절 구조 승인, CLAUDE.md 8번 해석 동의(아래 4), 시험 계정 표(6절 ①), D6 정적 시안. 승인되면 **W1 안에** S2-0b를 병합한다. 승인 전에는 브랜치에서 제안 구조로 개발할 수 있지만 병합하지 않는다(stage1.md:317과 같다). `schema.test.js:107-117`이 SCHEMA에 없는 탭 이름을 쓰는 PR을 막기 때문이다.
3. **T0b(선생님 대화, 하나씩):** 4-1 질문 10개와 4-4 자료 파일. 답을 기다리지 않고 기본값으로 만든다. 다만 **권한을 넓히는 기본값은 답을 받기 전까지 PRD 그대로의 좁은 값으로 병합한다**(성공 기준 "권한 밖 노출 0건", PRD.md:32).
4. **CLAUDE.md 8번("한 번에 기능 하나") 해석:** 1단계는 CODING 세션 하나가 기능마다 확인을 받았다(stage1.md:12). 2단계는 CODING 세션이 둘이다. 그래서 "세션마다 PR 하나 = 작업 하나, 기능(F3 / F4·F12 / F6 / F7)마다 체크리스트(PR 설명) → 선생님은 묶어서 실행"으로 해석한다. 이 해석에 T0a에서 동의를 받는다.
5. **S2-0a 골격 PR(총괄)을 병합한 뒤 CODING 두 세션을 연다.** TEST는 RULES와 겹치지 않게 따로 세션을 연다.
6. 클라우드 세션은 Apps Script를 실행하지 못한다(stage1.md:14). 실제 확인은 6절 묶음으로만 한다.
7. screens.md 5-2는 "2단계 코딩 전에 선생님 확인을 받아 고친다"(screens.md:215). W1에는 2단계 화면 코드가 없다. 그래서 D6 산출물은 **`design/` 아래 정적 미리보기 HTML로 찍은 시안**으로 정의한다(실제 화면 아님). 실제 화면 사진은 각 CODING PR 설명에 붙인다.

**검토하다 찾은 것(총괄 판단)**

| # | 찾은 것 | 근거 | 처리 |
| --- | --- | --- | --- |
| 1 | **근무교사 범위 구멍.** `isOnDuty`만 참이어도 이번 기간에 등록되지 않은 학생까지 통과한다. 지금은 `isOnDutyToday_`가 늘 false라 드러나지 않았을 뿐이다. 시험도 그 동작을 단언한다 | Auth.gs:176, :128-130, tests/core/auth.test.js:25 | C8s: `isAssigned \|\| (isOnDuty && isEnrolled)`. 시험도 같은 PR에서 고친다 |
| 2 | **근무일 판정에 날짜가 없다.** `isOnDutyToday_(email)`는 날짜를 받지 않는다. `context.ymd`는 기간을 고르는 데만 쓰인다. 그래서 "근무한 날 적발한 OUT"을 판정할 수 없다. 날짜 없이 "오늘·어제 근무했으면 참"으로 만들면, 어제 근무한 교사가 담당이 아닌 학생의 OUT을 아무 날짜로나 넣을 수 있다 | Auth.gs:128, :138, :151 | R8 `dutyIsOn_` + C8s `isOnDutyFor_`(2절). Auth 범위 판정, `excVisibleIds_`, `vioVisibleIds_`가 모두 이 하나를 쓴다 |
| 3 | **상담 내용이 운영 DB로 복사된다.** `writeAudit_`는 kind와 상관없이 운영 DB audit_log에 전후 JSON 전체를 쓴다. 상담일지를 별도 파일에 두는 의미가 사라진다 | Db.gs:186-195, CLAUDE.md 6, PRD §6 | S2-0c: kind `counsel`의 `content`·`agreement`를 `'(내용 생략, N자)'`로 가린다(create·update 모두) |
| 4 | **감사 기록에 "무엇을"이 빠진다.** `bulkAppend_`는 audit_log에 행 수 한 줄만 남긴다. F1 저장과 명단 저장이 이 함수를 쓴다(PRD §9) | Db.gs:220-242, Exceptions.gs:281, Roster.gs:343-352 | S2-0c: bulk_create 감사에 행 id 목록을 넣는다. 2만 자 단위로 나눈다(Db.gs:291-302와 같다) |
| 5 | **명단 초기 행의 `requested_at`이 업로드 시각이다.** 규칙과 오라클은 `''`를 전제한다. 그래서 같은 적용일이면 신청 일시가 업로드보다 이른 F6 퇴실이 진다. 또 업로드 전 날짜의 F7 신청서는 superseded로 저장되지 않는다(2월 이관 때 실제로 생긴다) | Roster.gs:348-350, roster_commit.test.js:92, RosterRules.gs:372, MealRules.gs:168-176 | C16 |
| 6 | 가짜 상태 행이 `doc_submitted 'FALSE'`라 서류 미제출 카드에 30명이 다 뜬다. 29번 퇴실에는 급식 정리 행이 없다 | FakeStage1.gs:74, :87 | T1b |
| 7 | **메일 범위·한도가 없다.** 메일은 소유자 계정에서 나간다(`executeAs USER_DEPLOYING`). `oauthScopes`가 명시되어 있어 `script.send_mail`이 없으면 MailApp이 실패한다. 하루 한도는 받는 사람 기준이다(개인 gmail 100명, Workspace 1500명). 가짜 데이터의 근무표 담당자는 `fake.teacher2@example.com`이다(FakeData.gs:55) | src/appsscript.json | 구조 6번. C9a `notifyMail_`: `MAIL_ENABLED`가 `'true'`일 때만 보내고, `@example.com`은 늘 빼고, 보내기 전에 남은 한도를 본다 |
| 8 | **setup은 헤더가 달라도 경고만 하고 고치지 않는다.** `ensureSheet_`는 락 없이 시트를 고친다 | Setup.gs:101-122 | 구조 7번: 락 안에서 빠진 본문 열만 제자리에 끼운다 |
| 9 | 새 기간을 만들면 exceptions 탭만 생긴다 | Terms.gs:121 | S2-0b에서 모든 기간별 탭을 만든다 |
| 10 | **결정 40이 앱 밖 편집으로 깨진다.** 설정 화면이 없어서 소유자가 설정 시트를 직접 고치면 audit_log가 남지 않는다. 그러면 followups.md:8의 "audit_log에서 넓힌 시각 읽기"를 쓸 수 없다 | followups.md:8, rules-api.md:171 | 앱이 새 유형을 처음 본 시각을 Script Property `AUTO_OUT_SINCE`에 남긴다(R9·C12). 스냅숏 갱신 시각은 **그 저장의 `confirmed_at`과 같은 `now`**이다(Exceptions.gs:279가 먼저 시각을 찍고 :281에서 쓴다). 스냅숏을 잃어버리면 기본 3종을 기준으로 삼는다 |
| 11 | `mealPlanChange_`는 손으로 고친 적용일이나 입실일을 받지 않는다. 그래서 rules-api.md:212의 "고친 뒤 다시 확인"을 할 방법이 없다 | MealRules.gs:135-156 | R10 |
| 12 | **2OUT 관문은 절차 장치일 뿐이다.** 담당교사는 원래 F6 학사 퇴실을 쓸 수 있다. `saveMove`는 `status.edit`(관리자+학사 교사)로 열려 있다 | PRD §4, PRD F4 | "2OUT 퇴실" 경로(`confirmOutDismissal`, `saveMove`의 `outDismissal`)는 서버가 `out.dismiss`와 면담 관문을 모두 판정한다(C13·C20) |
| 13 | **행 id만 받는 공개 함수는 첫 줄 범위 검사를 할 수 없다.** `status.edit`·`counsel.save`는 scope `student`이다. 그래서 studentId 없이 부르면 늘 '학생 없음'으로 거부된다. 그런데 security.test.js는 첫 문장에 `requirePermission_`을 요구한다 | Auth.gs:217-218, security.test.js:37-45 | 2절 공통 규칙: 첫 줄은 scope 없는 키로 역할만 보고, 락 안에서 행을 다시 읽은 뒤 범위 키를 다시 부른다(선례 Exceptions.gs:427·440) |
| 14 | **사유 문장으로 상담 정보가 샌다.** 퇴실 행의 사유에 면담 날짜를 쓰면, status.view(근무교사 포함, 3단계에는 학부모 상태 보기도)로 면담 사실·날짜가 보인다 | PRD.md:130·238·371, CLAUDE.md 6 | 사유는 `2OUT 퇴실`만 쓴다. 연결은 memo의 UUID로만 남기고, `listStudentStatus`는 memo를 내보내지 않는다 |
| 15 | R5는 `rule_name` 머리로 유형을 읽는다. 카탈로그에서 자동 항목 이름을 바꾸면 기존 자동 OUT을 '알 수 없음'으로 읽는다 | OutRules.gs:39, vocabulary.md:49 | 자동 항목 이름은 고정하고, `ruleName`은 상수로 넘긴다 |
| 16 | PRD와 디자인이 다르다: '운영 안 함'을 누가 정하나 | PRD.md:167 vs screens.md:242 | 4-1 Q1 |
| 17 | 양식 템플릿 ID를 둘 곳이 다르다. PRD §7은 설정 스프레드시트, CLAUDE.md 7은 PropertiesService | PRD §7, CLAUDE.md 7 | CLAUDE.md를 따른다(4-3) |
| 18 | PRD §6은 출력물을 "월별 폴더 저장"이라 하지만, C7은 base64로 내려주기만 한다(공유·저장 없음) | PRD §6, AttendanceSheet.gs:230 | 2단계 출력도 C7과 같게 한다(ASSUMPTION, 4-3) |
| 19 | F7 표는 규칙 단위에서 이미 통과한다. 2단계에서는 **저장 함수 끝까지** 증명해야 한다 | tests/rules/meal.test.js:17-69 | C17a·C18a·T2 |
| 20 | `linked_change_id`의 뜻이 정해져 있지 않다 | vocabulary.md:7-19 | 5절 어휘 |
| 21 | **매일 백업(30일)과 18시 전 출석부 미리 만들기는 PRD §11 어느 단계에도 없다.** 2단계부터 실제 기록 탭(OUT·급식·근무)이 생긴다. Script Property(`AUTO_OUT_SINCE`)는 데이터 파일 백업에 들어가지 않는다 | PRD.md:376, PRD §9 | 범위 밖이다. 다만 S2-0a에서 followups.md에 "3·4단계 계획 후보, 2027-03-02 실사용 전 필요"로 적는다 |

**1단계·후속 목록에서 접어 넣은 것**

| 남은 일 | 출처 | 작업 |
| --- | --- | --- |
| F1 → 자동 1OUT 연결, 처음 연결 때 쌓인 미인정 특이사항 일괄 생성 | Exceptions.gs:8, stage1.md:26·363, rules-api.md:171 | C12 |
| 출석부 머리말 근무자 이름(지금은 손 입력) | AttendanceSheet.gs:12·137, sheet-model.md:40-41 | C10 + S2-0d(계약 갱신) |
| 근무교사 범위 판정 | Auth.gs:124-130 | C8s |
| 홈 soon 카드 6개 | home_admin.html:16-17, home_duty_manager.html:13, home_hall_teacher.html:32, home_homeroom.html:44 | C8a·C11b·C13·C14·C17b·C19 |
| 명단 화면 "퇴실은 입퇴실 화면에서" 안내 | screen_roster.html:160 | C18a |
| R5-1 O43 변이 테스트 | followups.md:7 | R9 |
| R5-2 `autoTypeSince` 출처 | followups.md:8 | R9·C12(Script Property 스냅숏으로 바꿈, 찾은 것 10) |
| R5-3·4 알려진 지름길 | followups.md:9-10 | 그대로 둔다(계약에 적혀 있음) |
| R6-3 퇴실 `requested_at` 일시 필수 / R6-1 재입실 규칙 / R6-2 M45 테스트 | followups.md:13-15 | R11a / R11b / R11b, C18a·C18b |
| 출석부 C0·글자 폭 / 손글씨 칸 | followups.md:18·21 / :19 | 확인 ⓪ |
| 머리말 근무자 이름 수 상한 | followups.md:20 | C10 + S2-0d: 근무표 이름은 근무 2명·예비 1명까지, 손 입력은 지금처럼 4명·2명·12자 |

**0단계 진단 전에는 하지 않는 것** (PRD §11 2026-11-06 문단, CLAUDE.md 작업 순서)
- 2단계 권한 키에 `student`·`parent`를 넣지 않는다. PRD §4의 학생·학부모 "보기" 칸은 3단계 F14에서 연다.
- `home_student.html`·`home_parent.html`은 고치지 않는다(soon 카드 유지).
- 학생·학부모에게 메일을 보내지 않는다. `show_to_parent`는 기본값 `TRUE`로 저장만 하고, 화면 입력도 공개 논리도 만들지 않는다.
- F17 상담 신청, F9 제출·동의, 6.1의 2안(신원 토큰·별도 웹앱), `appsscript.json`의 `webapp.executeAs/access` 변경은 하지 않는다.
- 범위 밖: F5 자동 초안, F8, F9, F10, F11, F13. 매일 백업과 18시 전 출석부 미리 만들기는 찾은 것 21대로 넘긴다.

## 1. 파일 소유권

S2-0a 병합 이후 기준이다. "소유"는 그 세션만 그 파일을 고친다는 뜻이다. 1단계 원칙(stage1.md:34)을 그대로 쓴다. CODING이 둘이라 공용 파일은 S2-0a에서 미리 나눈다.

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| `src/Code.gs`, `src/Db.gs`, `src/Schema.gs`, `src/Setup.gs`, `src/appsscript.json`, `src/features/Terms.gs`, `src/ui/Index.html`, `src/ui/Client.html` | 총괄(S2-0a~d) | 그 뒤에 고칠 일이 생기면 PR 댓글로 총괄에게 요청한다 |
| `src/Auth.gs`의 `permissions_()` 표 | 총괄 | 4-1 답에 따라 키를 고치는 것도 총괄이 한다(한 줄 PR) |
| `src/Auth.gs`의 근무교사 판정(`isOnDutyFor_`·`studentFacts_`·`requirePermission_`의 student 범위 부분) | CODING-A | C8s만 |
| `src/features/{Duty,Outs,Counsel,Notify,Exceptions,AttendanceSheet}.gs` | CODING-A | |
| `src/features/{Meals,Moves,Roster}.gs` | CODING-B | |
| `src/ui/screen_{duty,outs,exceptions,sheet}.html` | CODING-A | F12 면담 기록은 `screen_outs`의 탭으로 둔다(새 화면 없음) |
| `src/ui/screen_{moves,mealcount,roster}.html` | CODING-B | `screen_moves` = 입퇴실·급식 변경·학생 기록 탭(PRD §8의 메뉴 하나) |
| `src/ui/home_{admin,hall_teacher,homeroom,duty_manager}.html` | 함수 단위 | S2-0a가 파일마다 `renderStage2A(d, root)`·`renderStage2B(d, root)` 두 함수를 떨어진 자리에 만든다. CODING-A는 A 함수, CODING-B는 B 함수의 몸통만 고친다(붙은 줄 충돌 방지) |
| `src/ui/Styles.html`, `src/ui/Components.html`, `src/print/*.gs`, `docs/design/**`, `design/**`, `tests/design/**` | DESIGN | 새 렌더러: `src/print/DutyRecordHtml.gs`, `src/print/MealCountsHtml.gs` |
| `src/rules/*.gs`, `tests/rules/**`, `tests/helpers/gas-fakes.js`, `docs/contracts/rules-api.md` | RULES | 새 파일: `src/rules/DutyRules.gs`, `src/rules/MoveRules.gs` |
| `src/dev/**`, `tests/acceptance/**`, `tests/features/fake_stage{1,2}.test.js` | TEST | 2단계에서는 가짜 데이터(FakeStage1 고침 포함)를 TEST가 맡는다. T1b가 다른 세션의 시험 기대값을 바꾸면 2절 T1b 규칙을 따른다 |
| `tests/features/{duty,duty_record,notify,outs,counsel_gate,exceptions,sheet_model*}.test.js`, `tests/core/auth.test.js`, `tests/public-api.d/coding-a.json` | CODING-A | |
| `tests/features/{meals,moves,mealcount,roster_commit}.test.js`, `tests/public-api.d/coding-b.json` | CODING-B | |
| `tests/public-api.d/test.json` | TEST | |
| `tests/core/{security,schema,skeleton}.test.js`, `tests/run.js`, `docs/contracts/{vocabulary,sheet-model}.md`, `docs/plan/**`, `docs/decisions.md`, `CLAUDE.md`, `PRD.md`, `README.md` | 총괄 | |

**전역 이름 접두어** (Apps Script는 같은 이름을 경고 없이 덮는다. 전역 이름 중복 테스트가 막는다, stage1.md:55)

| 파일 | 접두어 | 파일 | 접두어 |
| --- | --- | --- | --- |
| rules/DutyRules.gs | `duty…` | features/Duty.gs | `dty…` |
| rules/OutRules.gs | `out…` | features/Outs.gs | `vio…` |
| rules/MoveRules.gs | `move…` | features/Moves.gs | `inout…` |
| rules/MealRules.gs | `meal…` | features/Meals.gs | `food…` |
| print/*.gs | `print…` | features/Counsel.gs · Notify.gs | `cns…` · `notify…` |

**세션 사이에 부르는 내부 함수(이름·인자를 바꾸지 않는다)**
- `sheetMakePdf_(html, name)`(AttendanceSheet.gs:230, A): C14와 C19가 PDF를 만들 때 그대로 부른다.
- `notifyMail_(toEmails, subject, body, actorEmail)` → `{notified, sent, failed}`(Notify.gs, A, C9a): C9·C11a·C12가 쓴다. **락 밖에서만** 부른다.
- `isOnDutyFor_(email, ymd, windowDays)`(Auth.gs, A, C8s): Auth 범위 판정, `excVisibleIds_`, `vioVisibleIds_`, `getOutContext`가 쓴다.
- `cnsGateFor_(studentId, ymd)`(Counsel.gs, A, C13): `outDismissalGate_` 결과를 돌려준다. 상담 내용은 넘기지 않는다. B의 C20이 부른다.
- `foodWrite_(head, linked, cancels, actorEmail)`(Meals.gs, B, C17a): 락 안에서 status_changes에 쓴다. F6(C18a·C18b)도 이 함수로 쓴다.

**PR 규칙:** 1단계와 같다. 브랜치 이름은 `stage2/<세션>-<작업>`이다. PR 하나에 작업 하나만 담는다. main에 rebase한 뒤 `npm test`를 통과시킨다. PR 설명에는 증명 테스트, "어느 화면에서 어떤 역할로 무엇을 누르면 바뀐 것이 보이는지", 화면 사진, 그 기능의 선생님 체크리스트를 넣는다(결정 운영 방식, CLAUDE.md 8). DESIGN과 CODING PR이 같은 날 올라오면 DESIGN을 먼저 병합한다.

## 2. 세션별 작업

**모든 PR 공통 완료 기준**
- 새 공개 함수는 자기 세션의 `tests/public-api.d/*.json`에 등록한다. 첫 줄에서 `requirePermission_`을 부른다(편집기 함수는 `assertOwnerRun_`).
- **행 id만 받는 공개 함수**(`setDocSubmitted`, `cancelMove`, `cancelOutMeeting`): 첫 줄은 scope 없는 키로 역할만 본다(`status.list`, `counsel.cancel`). 락 안에서 행을 다시 읽은 뒤 `requirePermission_('status.edit' 또는 'counsel.save', {studentId: row.student_id, ymd})`를 부른다. 시험: "남의 학생 행 id → `denied:<키>`".
- 쓰기는 `withLock_` 안에서 한다. 저장 직전에 락 안에서 다시 읽고 다시 검사한다(화면 값을 믿지 않는다).
- 취소는 status를 `취소`로 바꾸고 audit_log에 남긴다. 행은 지우지 않는다.
- 공개 함수마다 gas-fakes 권한 시험을 둔다: 허용 1건 이상, 거부 1건 이상(거부는 audit `denied:<키>`).
- 확정되지 않은 규칙에는 `// ASSUMPTION:`을 달고, 테스트 이름에 "(가정)"을 붙인다.
- **메일은 락을 푼 뒤에 보낸다.** 메일이 실패해도 저장은 되돌리지 않는다. 시험은 실행 안에서 `MailApp`을 바꿔 끼운다(선례 sheet_model.test.js:89): `env.as(email, c => { c.MailApp = {sendEmail(){ 호출 시점의 c.LockService.getScriptLock().hasLock() 기록; 필요하면 throw }, getRemainingDailyQuota: () => n}; return c.swapDuty(…) })`. gas-fakes는 고치지 않는다.

### S2-0a. 골격 PR (총괄, 승인 없이 지금, 크기 M)
1. **public-api 나누기:** `tests/core/security.test.js`가 `tests/public-api.json`과 `tests/public-api.d/*.json`을 합쳐 읽게 한다. CLAUDE.md 폴더 구조의 public-api 줄을 "`tests/public-api.json` + `tests/public-api.d/*.json`"으로 고친다.
2. **Auth.gs `permissions_()`에 2단계 키를 모두 넣는다**(아래 표, 학생·학부모 없음). `dutyWindow`는 C8s 전까지 쓰이지 않는다.
3. **Code.gs:**
   - `SCREENS`에 `duty`(근무표, `duty.view`), `outs`(OUT, `out.view`), `moves`(입퇴실·급식, `status.list`), `mealcount`(식수 집계, `meal.count`)를 넣고, 빈 화면 파일을 만든다.
   - `screenParams_` 허용 목록: tab에 `week`·`month`·`record`·`entry`·`term`·`today`·`dismiss`·`rules`·`meal`·`move`·`history`를, `month`(`yyyy-MM`)와 `prefill`(`out2`만)을 더한다.
   - `getHomeData`의 교사 역할에서 `dtyHomeInfo_`·`vioHomeInfo_`·`foodHomeInfo_`(user, role)를 부른다. 지금은 각 기능 파일에 null을 돌려주는 빈 함수로 둔다. 훅마다 걸린 ms를 `base.ms`에 남긴다(확인 ③에서 실측한다. PRD §9 "3초"를 넘으면 카드별 호출로 바꾼다).
4. **홈 파일:** soon 카드를 `renderStage2A`·`renderStage2B` 함수 자리로 바꾼다(1절).
5. **문서:** `vocabulary.md`에 5절 어휘 초안("승인 대기" 표시)과 접두어 표를 넣는다. followups.md에 찾은 것 21을 적는다.
- 완료 기준: 598개와 새 시험이 모두 통과한다. 화면이 지금과 같다(soon 카드 자리는 빈칸).

**2단계 권한 키** (S2-0a가 넣는다. 4-1 답이 오면 총괄이 한 줄씩 고친다)

| 키 | roles | scope | 쓰는 함수 | 근거 |
| --- | --- | --- | --- | --- |
| `duty.view` | admin, duty_manager, hall_teacher, attendance | — | getDutyMonth, getDutyRecord(본인 행) | PRD §4 근무표, PRD.md:119 |
| `duty.edit` | admin, duty_manager | — | saveDutyDay, 대리 교대(예비 대신 근무 포함), 지난 날짜 교대, getDutyRecord 전체 합계·교대 목록 | PRD.md:127·361 (Q5) |
| `duty.swap` | admin, duty_manager, hall_teacher | 함수 안 칸 확인 | swapDuty | PRD.md:127 "본인 근무" |
| `duty.record` | admin | — | getDutyRecordFile | PRD.md:128 (Q5) |
| `out.view` | admin, hall_teacher, homeroom | 함수 안 `vioVisibleIds_` | getOutContext, listOuts | PRD.md:119·126. **attendance는 넣지 않는다**(Q7, 답이 "본다"면 한 줄 추가) |
| `out.save` | admin, hall_teacher | student, ymd = 발생일, `dutyWindow:1` | previewOut, saveOut | PRD.md:126 "작성(적발 건)" (Q2) |
| `out.cancel` · `out.rules` · `out.dismiss` | admin | — | cancelOut · getOutRules/saveOutRule · confirmOutDismissal과 saveMove(outDismissal) 안 두 번째 검사 | PRD F4 |
| `counsel.view` | admin, hall_teacher, homeroom | student, noDuty | listOuts의 면담 칸(학생마다 판정) | PRD F12 "출결 담당은 보지 못함" — attendance를 넣으면 `canAccessStudentByFacts_`가 전체를 허용하므로(Auth.gs:174-175) 빼는 것이 보안 조건 |
| `counsel.save` | hall_teacher | student, noDuty | saveOutMeeting, cancelOutMeeting의 락 안 검사 | PRD.md:135 |
| `counsel.cancel` | hall_teacher | — | cancelOutMeeting 첫 줄(역할만) | 찾은 것 13 |
| `status.list` | admin, hall_teacher, homeroom | — | getMealContext, 화면 열기, setDocSubmitted·cancelMove 첫 줄 | PRD.md:130-131, 찾은 것 13 |
| `status.view` | admin, hall_teacher, homeroom | student | listStudentStatus, getMoveContext | PRD.md:130-131(근무일 "보기" 포함) |
| `status.edit` | admin, hall_teacher | student, noDuty | F6·F7 미리보기·저장, 행 id 함수의 락 안 검사 | PRD.md:130-131, 결정 12 |
| `meal.count` | admin | — | getMealCounts, getMealCountsPdf | PRD §8 관리자 |

근무교사 범위가 켜지면(C8s) 기존 `student.view`(getStudentSummary)와 `status.view`도 근무일에 넓어진다. 둘 다 PRD §4 "학사 교사(근무일) 보기"와 같다. `exception.save`는 noDuty를 유지한다(Auth.gs:38-39).

### S2-0c. 감사 기록 PR (총괄, 승인 없이 지금, 크기 S) — C13 전에 있어야 한다
- Db.gs `writeAudit_`: kind `counsel`이면 before·after의 `content`·`agreement`를 `'(내용 생략, N자)'`로 바꾼다(찾은 것 3). create·update가 모두 이 함수를 지나므로 둘 다 가려진다.
- `bulkAppend_`: bulk_create 감사의 `after`에 행 id 목록을 넣는다. 2만 자를 넘으면 나눈다(찾은 것 4). 행마다 JSON 전체를 남길지는 4-3에서 총괄이 정한다.
- 완료 기준: 상담 kind로 append·update하면 표식 글자('ZZ-면담-표식')가 운영 DB audit_log에 없다. 모든 `bulkAppend_` 호출 경로(Seats.gs:344·515·555, Roster.gs, FakeData 시드)가 넣은 행 id를 모두 audit에 남긴다. 2만 자를 넘는 입력은 여러 줄로 나뉜다.

### S2-0b. 스키마 PR (총괄, T0a 승인 뒤 W1, 크기 S~M)
- Schema.gs: 5절 1~5번. Setup.gs: 7번(락 안에서 빠진 본문 열 끼우기, `[열 추가]`). violation_rules가 비었을 때만 PRD F4 4항목을 넣는다(seedDefaultBlocks_ 방식, Setup.gs:91-99). Terms.gs:121: SCHEMA_TERM_TABS 전체를 돈다. appsscript.json: 6번. vocabulary.md를 확정한다. README에 "재설치하면 `AUTO_OUT_SINCE`가 없어진다 — 기본 3종 밖 유형은 그때부터 자동"을 한 줄 적는다.
- 완료 기준: `tests/core/schema.test.js` — 새 탭은 id + 공통 4열이고, 기존 탭 열은 승인안 외에 바뀌지 않는다. setup을 다시 실행하면 새 탭은 `[탭 생성]`, counsel_notes·status_changes는 `[열 추가]`, 두 번째 실행은 `[탭 유지]`. **데이터 3행이 든 status_changes에 cancel_reason을 끼워도 기존 값이 제 열에 남는다.** 헤더가 섞여 다르면 지금처럼 `[경고]`만 내고 고치지 않는다. saveTerm이 새 기간의 `exceptions_`·`violations_` 탭을 모두 만든다.

### S2-0d. sheet-model.md 갱신 (총괄, C10과 같은 날, 크기 S)
- `dutyNames`·`standbyNames`의 뜻을 "근무표에 그날 칸이 있으면 근무표 이름(근무 2명·예비 1명까지), 하나도 없으면 손 입력(4명·2명·12자)"으로 고친다(sheet-model.md:40-41). 이름의 출처 `dutySource`(`'근무표'`·`'손 입력'`)는 **모델이 아니라 getAttendanceSheet 응답**에 둔다(렌더러는 모른다). CODING-A와 DESIGN의 동의를 PR에서 받는다(sheet-model.md:3).

### RULES (Opus): 순수 함수 + node 테스트, 선생님 답 없이 지금 시작(기본값 + ASSUMPTION)

1단계 공통 규칙(stage1.md:161-169)을 그대로 따른다. 서비스·인자 없는 `new Date()`를 쓰지 않는다. 표 형식으로 쓰고 TZ 두 개에서 돌린다. 순서: **R8 → R10 → R11a → R9 → R11b → R12**(CODING-B의 C17a·C18a가 먼저 기다리므로).

| # | 작업 | 쓰는 곳 | 완료 기준(테스트가 증명) | 크기 |
| --- | --- | --- | --- | --- |
| R8 | DutyRules.gs: `dutySlotsFor_`·`dutyOn_`·`dutyIsOn_`·`dutyRecord_` | C8s·C8a·C10·C12·C14 | `tests/rules/duty.test.js`: 요일 7개와 exam 목·금의 칸 틀, **방학 plan(`termType '방학'`, 종료 시각이 다른 날)**, 종료를 22:00으로 당긴 날은 21:30/22:00, 운영 안 함은 `[]`. 교대 전·후, A→B→C 뒤에는 C, 예비가 단독을 대신 근무한 경우, 취소 행 무시, 같은 칸 중복은 최신 1행과 경고, 이메일 대소문자·공백. `dutyIsOn_`: 그날 실제 근무자만 참, 예비 지정만·교대로 넘긴 원래 근무자는 거짓, `windowDays` 0이면 ymd = today만, 1이면 today ∈ [ymd, ymd+1], ymd가 미래면 거짓, 월말·연말 경계. `dutyRecord_`: **교대 3건(일반·교대의 교대·예비 대신 근무)인 달의 교사별 합계 = 실제 근무자**(PRD F3 완료 기준), 원래 근무자에게는 세지 않음, 예비 지정만은 기본 미포함·옵션이면 포함(Q3), 월 경계(1/31·2/1), 운영 안 하는 날의 행은 세되 경고(ASSUMPTION: 조용히 빼면 실제 근무를 놓친다), 빈 실제 근무자 경고. `contract.test.js`에 이름 | M |
| R10 | MealRules: `mealPlanChange_`에 `opts.effectiveDate`·`opts.effectiveRule`, 결과에 `autoDate` | C17a·C18a | 표: 수동 날짜가 자동보다 이름·늦음·오늘 이전, 신청일보다 이르면 Error, `entry_date`(기숙사 입실 조식). 고친 날짜 기준으로 `toCancel`·`followUps`·`blocked`가 계산된다. 오라클(meal_oracle)에 무작위 수동 적용일 사건을 더한다(의도 적용일 = 수동 날짜). 같은 계획을 바로 다시 세우면 할 일 0. rules-api.md:212 고침 | M |
| R11a | MoveRules.gs `movePlan_`: 퇴실·입실·기숙사 | C18a·T1b | 학사 퇴실 정리 순서(rules-api.md:211)에 일반 석식 선택(**source F7**, linked)·기숙사 입실 조식·기숙사 퇴실 조식·상태 검사(기숙사생의 학사만 퇴실 거부 등, 4-2)·`requested_at` 일시 필수(followups.md:15)를 더한다. 결정 35 예(3/3 수 15:00 신청·3/5 퇴실 → 조식 3/5, 석식 3/15), 월·화 신청 → 3/8, 퇴실일이 더 늦으면 퇴실일. meal.test.js의 `saveLeave` 흉내를 이 함수로 옮긴다(규칙은 한 곳에). 회귀: 명단 행(`requested_at ''`)과 같은 적용일이면 신청 일시가 이른 F6 퇴실이 이긴다, 업로드 전 날짜의 F7 신청서가 superseded되지 않는다. followups R6-3에 `[x]` | M |
| R9 | OutRules 후속 + 관문: O43 회귀, `outAutoSinceNext_`, `outDismissalGate_` | C12·C13 | O43: 같은 묶음의 앞선 자동 OUT이 유형 변경·중복으로 `[자동]` 취소된 상태에서, since 이전 확정 행만 남으면 since 뒤에 만든 OUT도 취소된다. `moved`를 모든 `[자동]` 취소로 넓히는 변이에서는 실패한다(OutRules.gs:161·189). `outAutoSinceNext_` 표: 처음(null) + 지금 = 기본 3종 → since `{}`. **스냅숏 분실(null) + '기타'가 이미 설정됨 → 기타 since = now**. '기타' 넓힘 T1, 좁혀도 T1 유지, 다시 넓히면 T2로 덮음, 그대로면 `changed:false`, '미인정결석(무단)' = '미인정결석', 잘못된 시각 Error. `outDismissalGate_` 표: 면담 전 `면담 기록 필요` / 면담 후 ok / 면담 취소 → 막힘 / **면담 날짜가 연결 OUT 발생일보다 이르면 `면담 기록 필요`** / 연결 OUT이 관리자 취소로 죽고 다른 2건이 남음 → 막힘(Q9) / 다른 학생·다른 유형·지난 기간 OUT에 연결 → 막힘 / OUT 1건 → `퇴실 대상 아님` / 이미 학사 퇴실 → `이미 퇴실`. rules-api.md R5 절의 `autoTypeSince` 출처를 고친다 | M |
| R11b | MoveRules.gs `moveUndoPlan_` + 재입실 | C18b | `moveUndoPlan_(changes, headId, opts)`: 대표·연결 행 취소, `[자동] <headId>`로 취소된 행 중 되살려도 더 새 신청에 덮이지 않는 행만 되살림(꼬리표는 `cancel_reason`, 5절 5번이 승인되지 않으면 `memo`에서 찾는다). 재입실(4-2): 퇴실 전 급식 값을 재입실일부터, 아직 오지 않은 석식 중단 취소. 오라클에 '퇴실 취소'·'재입실' 사건을 더한다. M45(followups.md:14). followups R6-1·R6-2에 `[x]` | M |
| R12 | `mealCountsOn_` | C19·D8 | 단순 오라클과 대조, 합계 줄 = 부분 합, 결정 35 흐름(퇴실 학생은 3/5~3/14 학사 석식에 포함, 3/15부터 빠짐, 조식은 3/5부터 빠짐), 성별·학년이 빈 학생은 `unknownGroup` + 경고, 미등록 학생 제외, 취소 행 무시(4-2 식수 집계 대상) | S |

**함수 시그니처 초안** — RULES가 rules-api.md에 넣는다. CODING은 이 이름을 부른다.
```js
// src/rules/DutyRules.gs (R8)
function dutySlotsFor_(plan)
        // resolveDayPlan_ 결과 → 운영 안 함 [] | mon_thu [{slot:'21:30조',end},{slot:'23:00조',end}] | 금·토·일 [{slot:'단독',end},{slot:'예비',end:''}]
        // end = min('21:30'|'23:00', plan.end), 단독 = plan.end. 특별 요일 유형은 실제 달력 요일로(ASSUMPTION, R3 END와 같은 방식). 방학도 같은 틀(4-2)
function dutyOn_(rows, ymd)
        // → {duty:[{slot, email, end, swappedFrom}], standby:[email], warnings}
        //   취소 제외, (date, slot)마다 updated_at 최신 1행(같으면 아래 행) + 경고, actual_email 기준, 순서 21:30조→23:00조→단독
function dutyIsOn_(rows, email, ymd, today, windowDays)
        // → boolean. dutyOn_(rows, ymd).duty에 email이 있고 ymd ≤ today ≤ ymd + windowDays. 예비 지정만은 거짓
function dutyRecord_(rows, month, opts)
        // opts = {includeStandby:false, operatingByDate:{}}
        // → {teachers:[{email, total, bySlot:{'21:30조','23:00조','단독'}, dates:[{date,slot,end,swappedFrom}]}],
        //    standby:[{email, count}], swaps:[{date, slot, from, to, at, by}], warnings}   금액은 계산하지 않는다(Q4)
        //   swaps = 칸마다 마지막 교대(원래 → 실제). 중간 단계는 audit_log에만 있다(4-2)

// src/rules/OutRules.gs (R9 추가)
function outAutoSinceNext_(snapshot, currentTypes, nowIso, defaultTypes)
        // snapshot = {types:[], since:{유형:iso}} | null → {snapshot, since, changed}
        // null이면 기준 유형 = defaultTypes(설정 기본값 exception.auto_out_types, Schema.gs:87). 기준에 없는 지금 유형은 since = nowIso
        //   (처음 연결 때 설정이 기본 그대로면 since {} → 일괄 생성, rules-api.md:171. 스냅숏을 잃어버려도 넓혔던 유형은 소급하지 않는다)
        // 새로 나타난 유형 → since = nowIso(다시 넓혀도 덮어씀). 빠진 유형의 since는 남긴다. 괄호 설명은 떼고 비교
function outDismissalGate_(violations, notes, changes, studentId, termId, ymd)
        // notes는 id·student_id·type·linked_violation_id·status·date·teacher_email만(내용 없음)
        // → {count, level, triggerOutId, meetingNote:{id,date,teacher_email}|null, alreadyLeft, ok, reason:''|'퇴실 대상 아님'|'면담 기록 필요'|'이미 퇴실'}
        // triggerOutId = 살아 있는 OUT을 occurred_at→created_at→id 순으로 놓았을 때 두 번째. 면담 date < triggerOut 발생일이면 면담 없음으로 본다

// src/rules/MealRules.gs (R10 변경, R12 추가)
//   mealPlanChange_(changes, studentId, item, toValue, requestedAt, opts)의 opts에
//   effectiveDate('yyyy-MM-dd', 선택)·effectiveRule('manual' 기본|'entry_date')를 더하고 → 결과에 autoDate(규칙 계산값)
function mealCountsOn_(students, enrollments, changes, termId, ymd)
        // → {groups:{'여1':{hall, dorm, nonDorm, breakfast, hallDinner, generalDinner}, …, '여 합계','남 합계','1학년'…'전체'},
        //    afterLeaveHallDinner, unknownGroup:[studentId], warnings}
        // 학사·기숙·비기숙은 학사 '입실' 기준, 조식·석식은 학사 상태로 거르지 않는다(결정 35)

// src/rules/MoveRules.gs (R11a·R11b)
function movePlan_(changes, studentId, move, opts)
        // move = {type:'학사 입실'|'학사 퇴실'|'기숙사 입실'|'기숙사 퇴실'|'학사 및 기숙사 퇴실', effectiveDate, requestedAt,
        //         dinner:'중단'|'일반 석식', breakfastWithDorm, breakfastStopWithDorm, meals:{조식, 석식}(재입실, R11b)}
        // opts = {today(필수), cutoff} → {errors, warnings, rows:[{item, value, effective_date, effective_date_auto, requested_at, reason, source, head}], toCancel:[{id, cancel_reason}], summary}
        //   일반 석식 선택 행은 source 'F7'(신청), 퇴실 정리 행은 source 'F6'(MealRules.gs:168·183·261이 F6을 정리 행으로 본다)
function moveUndoPlan_(changes, headId, opts)
        // → {toCancel:[대표·연결 행], toRestore:[cancel_reason(없으면 memo)이 '[자동] <headId>'로 시작하고 되살려도 더 새 신청에 덮이지 않는 행], warnings}
```

### CODING-A (Sonnet): 근무·OUT·상담 줄기

순서: **C9a → C8s → C8a → C9 → C10 → C11a → C11b → C13 → C12 → C14 → C15**(완료 기준 ③과 C20을 막는 C13을 앞에 둔다).

| # | 작업 | 의존 | 완료 기준(증명 테스트) | 크기 |
| --- | --- | --- | --- | --- |
| C9a | **알림 함수.** Notify.gs `notifyMail_(toEmails, subject, body, actorEmail)`: 이메일을 정리·중복 제거하고 `@example.com`은 늘 뺀다. Script Property `MAIL_ENABLED`가 `'true'`가 아니면 보내지 않고 `{notified:false}`(audit 없음). 켜져 있으면 `MailApp.getRemainingDailyQuota()`가 받는 사람 수보다 적을 때 보내지 않고 audit `notify:quota`. `sendEmail`이 오류를 던지면 삼키고 audit `notify:failed`. audit는 logDenied_처럼 짧은 락으로 쓴다(Db.gs:204-217). 본문에 학생 정보를 넣지 않는 것은 부르는 쪽 책임이다(주석) | S2-0a | `tests/features/notify.test.js`(실행 안에서 MailApp 바꿔 끼우기): 꺼짐 → `env.mail` 0통·`notified:false`·audit 0행. 켜짐 → example.com 주소 없음. 한도 0 → 0통 + `notify:quota`. sendEmail 오류 → 예외 없음 + `notify:failed` | S |
| C8s | **근무교사 권한 켜기(보안).** Auth.gs `isOnDutyFor_(email, ymd, windowDays)`: 실행당 `readAll_('duty_slots')` 한 번, 탭이 없으면 false, `dutyIsOn_(rows, email, ymd \|\| today, today, windowDays)`. `studentFacts_`가 `context.ymd`와 규칙의 `dutyWindow`(없으면 0)를 넘긴다. 그래서 **열람 키는 ymd = 오늘의 실제 근무자만**, `out.save`만 발생일의 실제 근무자가 다음 날까지 통과한다. 화면이 보낸 ymd로는 넓어지지 않는다(지난 근무일 ymd는 창 밖). Auth.gs:176 → `isAssigned \|\| (isOnDuty && isEnrolled)`(찾은 것 1). `excVisibleIds_`(Exceptions.gs:145): `listExceptions`에서만 오늘 근무자에게 그날 등록 학생 전체를 준다(PRD §4 "근무일 보기"). 요청 대상 고르기(getExceptionContext, :208)는 담당 학생 그대로 | S2-0a, S2-0b #1, R8 | auth.test.js: 오늘 21:30조 실제 근무자 → 담당이 아닌 등록 학생의 getStudentSummary·listStudentStatus 범위 통과. 미등록 학생, 예비 지정만, 교대로 넘긴 원래 근무자 → 거부. **어제 근무자가 ymd = 어제로 열람 키 → 거부. 오늘 근무가 아닌 교사가 이틀 이상 지난 근무일을 ymd로 out.save → 거부. 어제 근무자가 오늘 날짜(근무 아님) 사건으로 out.save → 거부 + `denied:out.save`**. saveException은 여전히 거부(exceptions.test.js:378 유지). duty_slots 탭이 없어도 오류 없이 거부. auth.test.js:25 갱신. exceptions.test.js: 근무교사 목록에 담당이 아닌 학생이 있고, 요청 고르기에는 없다 | S |
| C8a | **F3 편성·보기.** Duty.gs `getDutyMonth(month)`(duty.view, `calLoadCtx_`·`calMonthPlans_`·`dutySlotsFor_`·`dutyOn_` 재사용. 교사는 users.id·이름만 주고 이메일은 내지 않는다). `saveDutyDay(input{date, slots:{슬롯:userId\|''}, acknowledge})`(duty.edit): 락 안에서 `dtyValidateDay_` — 운영 안 하는 날 거부, 그날 틀 밖 슬롯 거부, 대상은 활성 hall_teacher만, 같은 날 같은 교사가 두 칸이면 경고 후 확인(screens.md:241), 교대된 칸은 편성 저장으로 바꾸지 못하고 교대로 안내한다. 바뀐 칸만 `appendRecord_`/`updateRecord_`로 쓰고, 비우면 status `취소`. 편성 변경에는 메일을 보내지 않는다. `screen_duty.html`(주 목록 기본·월 달력·편성 bottomSheet, D6). 홈(`renderStage2A`): 근무표 담당자 "이번 달 빈 날 N일·교대 N건", 학사 교사 "오늘 내 근무: 21:30조 / 23:00조 / 근무 / 예비 감독 / 없음 · 다음 근무"(PRD §8) | S2-0a, S2-0b #1, R8, D6(F3) | `tests/features/duty.test.js`: 담당자가 저장하면 행과 audit create가 생기고, 같은 내용을 다시 저장하면 0건. 운영 안 하는 날 거부, 같은 교사 두 칸은 확인 없이 경고 응답, 학사 교사 saveDutyDay 거부 + `denied:duty.edit`, 담임·학생·학부모는 getDutyMonth 거부. 응답 JSON에 이메일이 없다 | M |
| C9 | **교대 + 알림.** `swapDuty(slotId, toUserId, acknowledge)`. `dtySwapCheck_`(순수)가 허용하는 경우: 본인 칸, duty.edit의 대리 기록(예비 감독의 대신 근무 포함). **예비 감독 본인이 근무 칸을 가져오는 것은 열지 않는다**(4-2, 권한을 넓히는 쪽이라 답 전에는 좁게). 오늘 이전 날짜는 duty.edit만(4-2). 대상은 활성 hall_teacher이고 지금 근무자와 달라야 한다. 대상이 그날 다른 칸에 있으면 경고 후 확인. 남의 칸이면 `logDenied_`(excDenied_ 선례, Exceptions.gs:197). 락 안에서 다시 읽고 재검사한 뒤 `updateRecord_`(actual_email·swapped_at·swapped_by)로 쓴다. 락 밖에서 `notifyMail_`: 받는 사람 = {이전 근무자, 새 근무자} ∪ 활성 duty_manager(없으면 admin) − 누른 사람. 본문은 날짜·요일·조·이전→새·누른 사람·앱 링크만. `notified:false`나 실패면 화면이 "상대 선생님께 직접 알려 주세요"를 보여 준다. 화면: 내 근무 줄 [교대], 담당자는 [대신 근무 기록], 확인 문구는 rules.md:116 | C8a, C9a | `dtySwapCheck_` 표. gas-fakes: 본인 칸 교대 → 세 칸이 바뀌고 audit update, `env.mail` 수신자가 맞고 호출 시점에 락이 없다. 남의 칸·어제 날짜 거부 + `denied:duty.swap`(담당자는 허용). 예비 본인의 대신 근무 거부(가정), 담당자의 대리 기록 허용. `env.lock.failNext` → "다른 사람이 저장 중". sendEmail이 오류를 던져도 교대는 저장되어 있다 | M |
| C10 | **출석부 머리말 이름.** `sheetLoad_`(AttendanceSheet.gs:127-137)가 duty_slots·users를 읽어 `dutyOn_`으로 dutyNames(21:30조→23:00조 / 근무)·standbyNames를 채운다. 그날 칸이 하나도 없을 때만 손 입력을 쓴다(4-2). 응답에 `dutySource`를 더한다(S2-0d). `screen_sheet.html:41-58`은 근무표 이름을 보여 주고 "근무표에서 고치기"로 잇는다. followups.md:20 닫기 | C8a, S2-0d(같은 날) | `sheet_model*.test.js`: 월~목 두 이름 순서, 금요일 standbyNames, 예비가 대신 근무한 날 중복 없음, 칸이 없으면 손 입력 이름, `sheet_model_contract` 통과 | S |
| C11a | **F4 직접 입력.** Outs.gs `getOutContext(date)`(out.view: 활성 항목, 고를 수 있는 학생 = 담당 + `isOnDutyFor_(email, date, 1)`이면 그날 등록 학생). `previewOut`/`saveOut(input)`: 첫 줄 ymd = `input.occurredAt`의 날짜 부분이고 저장도 같은 값을 쓴다. 검사(`vioValidate_`): 활성 항목, 자동 항목 제외(4-2), 미래 일시 거부, 기간 종료 다음 날이 지나면 거부(4-2), 그 기간 명단·학사 입실(isActiveOn_), 메모 200자, 적발 교사는 활성 교사 또는 빈칸. 경고(`vioDupWarnings_`): 같은 학생·날·항목이 있거나 그날 F1자동 OUT이 있으면 확인. "저장하면 이번 학기 2OUT — 퇴실 대상" 안내. 락 안 `appendRecord_(violations_<기간>)`: source `직접`, entered_by = 접속자. 락 밖 알림(Q6). `screen_outs.html` [기록] 탭 | S2-0b #2·#3, D6(F4), C9a. C8s 없이도 병합할 수 있다(근무교사 경로는 닫힌 채) | `tests/features/outs.test.js`: 담당교사 saveOut 허용. 담당이 아닌 학생 거부 + `denied:out.save`. 담임·학생·학부모·test.duty·test.attendance(역할 하나)는 거부. C8s 뒤: 오늘 근무자·어제 근무자(발생일 = 어제) 허용, 이틀 전 근무자·예비 거부. 입력 검사 표. 같은 기간 2건 → '퇴실 대상', 다음 기간 0건. `env.mail` 본문에 메모 글자가 없다(Q6 기본이면 이름도 없다). sendEmail 오류에도 행이 저장되어 있다 | M |
| C11b | **F4 목록·관리자 취소.** `listOuts(filter{scope:'student'\|'term'\|'today', termId})`: `vioVisibleIds_` = 학생마다 `canAccessStudentByFacts_(roles, facts, out.view roles)`(facts.isOnDuty = 오늘 근무자, 이번 기간에만). excVisibleIds_를 그대로 쓰지 않는다(attendance 전체 허용, Exceptions.gs:150). `cancelOut(termId, id, reason)`(out.cancel): 사유 2~200자, `[자동]`으로 시작하면 거부(vocabulary.md:50), 끝난 기간 거부. 지난 기간은 조회만. `screen_outs` [이번 학기 \| 오늘 현황]("오늘 현황"은 결정 36의 대체). 홈: 학사 교사 OUT 알림, 담임 이름 옆 out1/out2 | C11a | 담당교사는 담당 학생만, `hall_teacher,attendance` 계정(가짜교사3, FakeData.gs:56)도 담당·근무일 범위만 본다, 담임은 자기 반. 취소는 관리자만, `[자동] …` 사유 거부. 지난 기간 저장·취소 거부 | M |
| C13 | **F12 최소 + 퇴실 확정 관문.** Counsel.gs `saveOutMeeting(input{studentId, date, content})`(counsel.save): 락 안에서 `outLevel_` ≥ 2 확인, 면담 날짜는 연결 OUT 발생일 이상·오늘 이하. `linked_violation_id`는 서버가 정한다(`triggerOutId`, 화면 값 아님). type `2OUT 학부모 면담`, target `학부모`, show_to_parent `TRUE`(입력 없음)로 `appendRecord_('counsel_notes', …, 'counsel')`. `cancelOutMeeting(noteId, reason)`: 첫 줄 `counsel.cancel`, 락 안에서 다시 읽고 작성 교사 본인인지 확인(아니면 거부 기록), 그다음 `requirePermission_('counsel.save', {studentId})`. 내부 `cnsGateFor_`. Outs.gs `confirmOutDismissal(studentId)`(out.dismiss): 막히면 `{ok:false, reason}`(업무 차단이라 denied 기록 없음), 통과하면 `{ok:true, prefill}`(Q8, 사유 `2OUT 퇴실`, 면담 날짜는 이 응답의 면담 칸에만). `listOuts`에 면담 칸: 학생마다 `canAccessStudentByFacts_(roles, facts(isOnDuty=false), counsel.view roles)`를 통과할 때만 날짜·교사. `screen_outs` [퇴실 대상] 탭: 면담 필요 / 면담 기록됨 / 퇴실 확정 가능 / 퇴실 처리됨. 담당교사 [학부모 면담 기록], 관리자 [퇴실 확정] → confirmSheet("면담 기록(날짜·교사)을 확인했습니다", rules.md:113) → `?page=moves&student=…&prefill=out2`. 관리자 홈 "2OUT 대상 N명 · 면담 필요 N · 확정 가능 N" | C11b, R9, S2-0b #4, S2-0c | `tests/features/counsel_gate.test.js`: 2건인 학생 → `면담 기록 필요`. 담당교사 saveOutMeeting → `env.rows('counsel_notes','counsel')`에 행(type·target·linked = 둘째 OUT)이 생기고, 운영 DB에는 상담 행이 없으며, 운영 DB audit_log에 표식 글자('ZZ-면담-표식')가 없다. 다시 부르면 ok + prefill. 면담 취소 → 다시 막힘. 둘째 OUT 이전 날짜 면담 → 저장 거부. 1건 → `퇴실 대상 아님`. 담당이 아닌 학사 교사·출결 담당·근무교사·관리자의 saveOutMeeting 거부. 남의 면담 id로 cancelOutMeeting 거부. 학사 교사·담임의 confirmOutDismissal 거부 + `denied:out.dismiss`. **`hall_teacher,attendance` 계정의 listOuts(term)에서 담당이 아닌 2OUT 학생의 면담 칸이 비어 있다.** listOuts·getHomeData·confirmOutDismissal 응답 JSON에 표식 글자가 없다 | M |
| C12 | **F1 → 자동 1OUT.** Outs.gs `vioAutoSince_(autoTypes, now)`: `AUTO_OUT_SINCE` 스냅숏을 `outAutoSinceNext_(snap, autoTypes, now, 기본값 3종)`으로 갱신하고 since를 돌려준다. `saveException`·`confirmException`·`cancelException`은 락 안 **쓰기 전에** `confirmed_at`에 쓰는 바로 그 `now`로 이 함수를 부른다(Exceptions.gs:279·416). 쓰기 뒤 `vioSyncAuto_(term, studentIds, actorEmail, since)`(락 안): 그 기간 exceptions·violations 전체를 읽고(탭이 없으면 `ensureTermSheet_`), `reconcileAutoOuts_(exceptions, violations, opts)`를 부른다. exceptions·violations = 그 기간 모든 행(rules-api.md:167), opts = `{autoTypes: excSettings_().autoOut(Exceptions.gs:39), ruleName:'무단 지각·결석·이탈'(상수), ruleId: 자동 항목 id, per:'group', studentIds, autoTypeSince: since, dutyByDate: 특이사항 날짜와 그 학생 OUT 날짜마다 dutyOn_의 근무자}`. toCreate는 `appendRecord_`, toCancel·toUpdate는 `bulkUpdateRecords_`. 새로 만든 OUT의 알림 목록을 돌려주고, 세 함수는 `withLock_`이 끝난 뒤 `notifyMail_`을 부른다(Q6). 응답에 `out{created, canceled, level}`. 편집기 함수 `syncAutoOutsAll(termId)`(assertOwnerRun_): 같은 스냅숏 since를 쓴다(since `{}`는 스냅숏이 null이고 설정이 기본값일 때뿐), 메일은 보내지 않는다. F3 병합 뒤 detected_by를 채울 때도 쓴다. F1 화면 문구(screen_exceptions.html:151·230·249 "1OUT 예정" → "저장하면 1OUT이 기록됩니다"/"확정되면 1OUT")와 Exceptions.gs:8 주석을 고친다. screens.md:107은 같은 날 DESIGN이 고친다 | C11a, R9, C9a | 출결 담당이 미인정결석을 저장하면 violations 1행(F1자동, 유효, entered_by = 출결 담당, rule_name `무단 지각·결석·이탈(미인정결석)`) + audit create + 담당교사·담임 알림(호출 시점 락 없음, MAIL_ENABLED 꺼짐이면 0통). 다시 실행하면 0건. 요청 상태는 0건이고 확정하면 1건. 묶음 취소 → OUT 취소(`[자동] …`) + audit. 3일 묶음에서 첫날만 취소 → OUT 유지·대표 이동(결정 22). 학생 A를 확정·취소해도 학생 B의 자동 OUT은 그대로. seedFakeStage1 뒤 syncAutoOutsAll → 확정된 2027-03-05 1건만 OUT(FakeStage1.gs:115-116), 메일 0통. 관리자가 취소한 자동 OUT은 다시 생기지 않는다. 결정 40: 설정에 '기타'를 더하면 그 전에 확정된 '기타'에는 OUT이 없고, **넓힌 직후 첫 확정 1건에는 OUT이 생기며 since[기타] === 그 행의 confirmed_at이다.** 다시 빼도 이미 생긴 OUT은 남는다. **스냅숏이 있는 상태에서 기타를 더한 뒤 syncAutoOutsAll을 다시 돌려도 그 전 기타에는 OUT이 없다. 스냅숏을 지우고 돌려도 같다** | M |
| C14 | **월말 근무 기록표 + PDF(임시 양식).** `getDutyRecord(month)`(duty.view): duty.record나 duty.edit 역할이면 교사별 전체 합계와 교대 목록(칸마다 마지막 교대, 이름만), 아니면 본인 행만(PRD.md:128, Q5). generatedAt과 그 달 마지막 updated_at을 함께 준다(출력 뒤 바뀌었는지 확인용). `getDutyRecordFile(month, 'pdf')`(duty.record): `printRenderDutyRecord_` → `sheetMakePdf_` → base64(공유·저장 없음, C7과 같음, 방식은 C0 결과를 따른다). `screen_duty` [기록표] 탭, 관리자 홈 카드 | C8a, R8, D7. PDF 방식 ← C0(⓪) | `tests/features/duty_record.test.js`: 2027-01 가짜 근무표(교대 3건) 합계 = 실제 근무자. 학사 교사는 본인 행만. **근무표 담당자는 전체 합계를 보고 getDutyRecordFile은 거부 + `denied:duty.record`**. 렌더 HTML에 교사별 합계와 교대 3건 | M |
| C15 | **OUT 항목 관리(관리자).** `screen_outs` [항목] 탭. `getOutRules`/`saveOutRule`(out.rules): 추가, 이름·설명·순서 수정, active 켜고 끄기. 자동 항목은 이름을 고칠 수 없고 끌 수도 없다(찾은 것 15). 지우지 않는다. 그동안은 setup이 넣은 PRD F4 4항목으로 버틴다 | C11a | 관리자 허용, 학사 교사 거부. 자동 항목 이름 변경 거부. 비활성 항목은 입력 목록에 나오지 않는다 | S |
| C14b | **학교 양식 출력(xlsx·PDF).** xlsx 양식이면 템플릿 복사 → 값 채우기 → 내보내기(Script Property `DUTY_TEMPLATE_ID`). 임시 사본은 try/finally에서 `setTrashed(true)`(기록 행이 아니라 삭제 금지 규칙과 무관), 절대 공유하지 않는다. 저장 여부는 4-3을 따른다(저장 안 함). 한글·종이 양식이면 같은 칸 순서의 PDF. 순수 함수 `dtyRecordTable_`만 시험한다(UrlFetchApp·xlsx 내보내기는 gas-fakes가 흉내 내지 않는다, gas-fakes.js:411-412) | 자료 1번, C14, D9 | 표 배열 시험. 실제 파일은 확인 ④ | M |

### CODING-B (Sonnet): 상태·급식 줄기 — Exceptions·AttendanceSheet·Duty·Outs·Counsel은 고치지 않는다

순서: **C16 → C17a → C17b → C18a → C18b → C19 → C20**.

| # | 작업 | 의존 | 완료 기준(증명 테스트) | 크기 |
| --- | --- | --- | --- | --- |
| C16 | **명단 초기 행 `requested_at ''`.** Roster.gs:348-350의 `nowIso_` 채우기를 지우고, roster_commit.test.js:92를 고친다(찾은 것 5). 회귀 시험은 R11a | 없음(지금 시작) | roster_commit: 초기 행의 requested_at이 `''`. 기존 시험 통과 | S |
| C17a | **F7 급식 변경 저장.** Meals.gs `getMealContext()`(status.list → now·today·cutoff·칩·쓸 수 있는 학생). `previewMealChange(input)`(status.edit, ymd = 신청일): `foodValidate_` — 칩을 (item, value)로 바꾼다(vocabulary.md:13-14). requested_at은 `yyyy-MM-ddTHH:mm(:ss)`만 받고 Z·오프셋·미래는 거부한다(4-2). 고친 적용일은 신청일 이상, 사유 2자 이상(Q10). 설정 `meal.morning_cutoff`가 잘못되면 기본값으로 바꾸지 않고 오류를 낸다. 계획은 `mealPlanChange_(changes, studentId, item, toValue, requestedAt, {today, cutoff, effectiveDate, effectiveRule})` — **changes = 그 학생의 status_changes 행 전부(취소 포함 그대로, rules-api.md:200)**, cutoff = 설정 `meal.morning_cutoff`(Schema.gs:84). 결과 → 적용일, 이유 한 줄(`foodReasonText_`, screens.md:284), 같이 취소될 행, followUps, expect. `saveMealChange(input, expect)`: 락 안에서 다시 계획하고, expect가 다르면 `{stale:true}`, blocked·superseded면 쓰지 않는다. `foodWrite_`: 신청 행(source F7, effective_date_auto = autoDate), followUps(source F6, linked_change_id = 신청 행, doc_submitted ''), toCancel(status 취소, cancel_reason `[자동] <신청 행 id> 새 신청으로 대체`) — `appendRecord_` 한 행씩 + `bulkUpdateRecords_`. **5절 5번이 승인되지 않으면 같은 꼬리표를 memo 끝에 쓴다**(R11b가 memo에서도 찾는다). `screen_moves.html` [급식 변경](screens.md F7-1) | S2-0a, R10, D6(F7), **S2-0b #5**(없으면 `bulkUpdateRecords_`가 "없는 열입니다"를 던진다, Db.gs:274-275) | `tests/features/meals.test.js`(gas-fakes, strictLock) — **PRD F7 표 1·3·4줄을 저장 끝까지:** 실시·학사 석식·일반 석식 2027-03-03T11:29:59 → 03-03, 11:30:00 → 03-04, 2026-12-31T11:30:00 → 2027-01-01. 미실시 03-01·03-02 → 03-08, 03-03~03-07 각각 → 03-15, 2026-12-30 → 2027-01-11. 적용일 전날 statusOn_은 옛 값, 당일은 새 값. effective_date_auto는 늘 저장되고, 고치면 값이 다르며 사유가 없으면 거부. kind none 저장 → 신청 행 1개 + 대기 행 취소. blocked·superseded → 행 수 그대로. 퇴실 전에 켠 학사 석식 → followUps F6 행이 함께 쓰인다. stale. `env.lock.failNext`. 권한: 담임·담당 아닌 학사 교사·test.attendance·test.duty·학생·학부모 거부 + `denied:status.edit` | M |
| C17b | **F7 학생 기록·서류.** `listStudentStatus(studentId)`(status.view: 오늘 값, 대기 변경, 기록, 비고 문장 "3.3 석식 미실시(3.15~)", real-layout-2025.md:27). **memo는 내보내지 않는다**(찾은 것 14). `setDocSubmitted(changeId)`: 첫 줄 `status.list`, 락 안에서 행을 읽고 `requirePermission_('status.edit', {studentId: row.student_id, ymd: row.effective_date})`, 대표 행만. `screen_moves` [학생 기록](screens.md F7-1). 홈(`renderStage2B`): 학사 교사 "서류 미제출 N건"(입력자가 아니라 담당교사 기준, 대표 행만), 담임 학생별 급식 열람 | C17a | 서류 미제출 → 담당교사 홈 1건(관리자가 입력해도), setDocSubmitted 뒤 0건. 남의 학생 행 id로 서류 표시 → `denied:status.edit`. 응답에 memo 없음 | S |
| C18a | **F6 입퇴실 저장.** Moves.gs `getMoveContext(studentId)`(status.view → 오늘 학사·기숙사·조식·석식 값과 그날 가능한 유형). `previewMove(input)`(status.edit, ymd = 적용일) → `movePlan_(changes, studentId, move, {today, cutoff})` → 적용일, 조식 중단일, 석식 중단일 또는 일반 전환일, 자리 공석 시작일, 취소될 대기 신청, 경고(적용일 < 오늘이면 지난 출석부·식수가 바뀜). `saveMove(input, expect)`: 락 안에서 다시 계획(stale 거부), `inoutRequestedAt_`(일시 전체 필수), 대표 행 + 연결 행(linked_change_id) + toCancel을 `foodWrite_`로 쓴다. 끝난 기간·명단 밖 학생은 오류(excTermErrors_ 문구). 학기 중 신규 학생은 명단에 학사 X로 올린 뒤 여기서 "학사 입실"로 넣는다(4-2). `screen_moves` [입퇴실] 탭: 유형 칩 5개(그날 상태로 가능한 것만), 학사 퇴실 때 석식 "중단 \| 일반 석식으로", 기숙사 입실 "조식도 입실일부터", 기숙사 퇴실 "조식도 미실시"(4-2). confirmSheet에 날짜를 크게(rules.md:114): "3월 5일(금)부터 학사 퇴실 · 자리 공석 · 조식 3월 5일 중단 · 석식 3월 15일(월) 중단". screen_roster.html:160 문구를 입퇴실 링크로 바꾼다 | C17a, R11a, D6(F6) | `tests/features/moves.test.js`: 결정 35 예 → 학사 퇴실@3/5, 조식 미실시@3/5, 석식 미실시@3/15(+ statusOn_ 3/4·3/5~3/14·3/15). 월·화 신청 → 3/8. "일반 석식으로" → 일반 석식@max(11:30 규칙, 퇴실일)(source F7, linked, doc ''), 석식 미실시 행 없음. **기숙사 입실 + 조식 → 조식 실시@입실일(15:00 신청이어도) = F7 표 2줄. 학사 퇴실 조식 = 퇴실일 = 표 5줄.** 학사 및 기숙사 퇴실 → 상태 행 2개(linked) + 같은 정리. 상태 오류(이미 퇴실, 기숙사생의 학사만 퇴실, 학사생 아닌 학생의 기숙사 입실). requested_at `''`·날짜만·미래 → 쓰기 0건, `T15:00` → `:00`. 퇴실 저장 뒤 getAttendanceSheet: 전날은 있고 당일은 공석, getSeatData는 stale. 서류 미제출 1건(정리 행은 세지 않음). 권한 표 | M |
| C18b | **F6 퇴실 취소·재입실.** `cancelMove(headId, reason)`: 첫 줄 `status.list`, 락 안에서 대표 행을 읽고 `requirePermission_('status.edit', {studentId, ymd})`. 적용일이 지났으면 관리자만(4-2). `moveUndoPlan_` → 취소 + 되살림. 재입실 = "학사 입실"(퇴실 전 급식 미리 채움, 4-2). 재입실 확인에 "옛 자리가 넘어갔으면 자리 배정 필요" | C18a, R11b | cancelMove 적용일 전 → 3/1~4/30 매일 statusOn_이 전과 같다. 적용일 뒤에는 학사 교사 거부·관리자 허용. 남의 학생 headId → `denied:status.edit`. 재입실 → 급식이 재입실일부터 이어지고 아직 오지 않은 석식 중단이 취소된다 | S |
| C19 | **식수 집계 + 관리자 홈 인원·공석.** `getMealCounts(date)`(meal.count) → `mealCountsOn_` + 기간 이름 + 자습 운영 여부(참고) + 서류 미제출 수 + "퇴실 후 석식 유지 N명". 캐시는 두지 않는다(PRD.md:31 "입력 즉시 반영"). `getMealCountsPdf(date)` → `printRenderMealCounts_` → `sheetMakePdf_`(방식은 C0 결과). `screen_mealcount.html`(screens.md F7-2). 출력물에 "신청 기준 인원(결석·외박 반영 안 함)"을 적는다(PRD §12). 관리자 홈(`renderStage2B`, home_admin.html:16): 오늘 학사·기숙(남·여)·비기숙·조식·석식(학사/일반) + 자습실·SA 공석(seatMapOn_). 기숙사 정원 대비 공석은 넣지 않는다(4-2, F8) | R12, D8, C17a. PDF 방식 ← C0(⓪) | `tests/features/mealcount.test.js`: 가짜 30명 3개 날짜에서 합계 줄 = 부분 합, 학사 = 기숙 + 비기숙. saveMealChange 직후 다시 부르면 바뀐 수가 나온다. 결정 35 흐름. 미등록 학생은 어느 칸에도 없다. 관리자가 아니면 거부. 렌더 HTML에 표와 머리말 | M |
| C20 | **2OUT → F6 미리 채움.** `screen_moves`는 `prefill=out2`면 `confirmOutDismissal`을 다시 불러 미리 채운 값을 받는다(주소 값을 믿지 않는다). `saveMove(input{…, outDismissal:true})`: 같은 함수 안에서 **`requirePermission_('out.dismiss')`를 한 번 더** 부르고, 같은 락 안에서 `cnsGateFor_`를 다시 확인한다. 통과하지 못하면 거부한다. reason은 `2OUT 퇴실`, memo는 `[2OUT] out:<id> note:<id>`(UUID만) | C13, C18a | 면담 전 outDismissal 저장 거부. **면담 뒤 담당교사의 saveMove(outDismissal) → 거부 + `denied:out.dismiss`, 관리자는 허용.** 저장 → 학사 퇴실 + 급식 정리. 기숙사생은 "학사 및 기숙사 퇴실"로 미리 채워진다. 저장된 행 reason에 날짜가 없다 | S |
| C19b | **급식실 양식 반영** | 자료 2번, D9, C19 | 렌더러 시험 + 확인 ④ | M |

### DESIGN (Sonnet): 코딩을 막지 않는다

| # | 작업 | 완료 기준 | 크기 |
| --- | --- | --- | --- |
| D6 | **screens.md 2단계 갱신 + 정적 시안(T0a용).** F3-1·F3-2 확인(예비 대신 근무는 담당자 기록, 운영 안 함 표시 — screens.md:245를 4-2에 맞춰 고침), F4-1 OUT 기록 30초 흐름(탭 수까지), F4-2 이번 학기·오늘 현황, F4-3 퇴실 대상·면담 기록·퇴실 확정("면담 기록 필요"), F6-1 입퇴실(지금 없음), F7-1·F7-2 확인, 역할별 홈 카드, screens.md:107 문구(C12와 같은 날). 교사 고르기는 6~8명이라 새 컴포넌트 없이 select로 한다(필요하면 `UI.select` 하나만). 시안은 `design/` 아래 정적 미리보기 HTML로 찍는다(실제 화면 아님) | C8a·C11a·C17a·C18a 화면 PR보다 먼저 main에 있다. 늦으면 리뷰 댓글로 반영한다. 360px·1280px 사진 | M |
| D7 | `src/print/DutyRecordHtml.gs` `printRenderDutyRecord_(model, opts)`. 임시 모양: A4 한 장, 교사 × 날짜(칸 `21:30`/`23:00`/`단`), 조별 합계·총계, 교대 목록, 생성 시각과 그 달 마지막 변경 시각 | tests/design: 픽스처 렌더, 이스케이프, 합계 = 칸 수 | S |
| D8 | `src/print/MealCountsHtml.gs` `printRenderMealCounts_(model)`: 행 = 여1·여2·여3·여 합계·남1~3·남 합계·1~3학년·전체, 열 = 학사·기숙·비기숙·조식·석식(학사·일반), "신청 기준 인원"·"퇴실 후 석식 유지 N명" | tests/design | S |
| D9 | 학교 양식 대응 문서 `docs/design/duty-record.md`·`meal-count.md`(칸 대응표) | 양식을 받은 뒤 | S |

### TEST (Opus, RULES와 다른 세션)

| # | 작업 | 의존 | 완료 기준 | 크기 |
| --- | --- | --- | --- | --- |
| T1a | `src/dev/FakeStage2.gs` 근무 부분: 순수 함수 `buildFakeStage2Duty_(fake)`와 편집기 함수 `seedFakeStage2()`(assertOwnerRun_, 두 번 실행해도 중복 없음, seedFakeStage1 패턴). 2027-01 전체 편성(가짜 교사 1~3 + 시험 계정), 교대 3건(일반 1, 교대의 교대 A→B→C 1, 담당자가 기록한 예비 대신 근무 1), 운영 안 함 1일. **한계: 가짜 1월은 "2026 2학기(테스트)"(유형 학기, FakeData.gs:44) 안이다. 실제 1월은 겨울방학이다(PRD.md:64).** 방학 경로는 R8 표가 증명한다. 1단계 시험이 깨지지 않으면 방학 기간·등록을 더해도 된다 | S2-0b #1, R8 | `fake_stage2.test.js`: 참조 무결성, 실행마다 같은 결과, 교대 3건, `dutyRecord_` 합계 = 실제 근무자 | S |
| T1b | FakeStage2 나머지: 2027-03 직접 OUT 2건인 학생 1명(퇴실 대상), 1건인 학생 1명, F7 대기 행, 서류 미제출 2건. 면담 기록은 넣지 않는다(시험이 직접 넣는다). FakeStage1 고침: 명단업로드 행 requested_at `''`·doc_submitted `''`, 29번 퇴실은 `movePlan_` 결과(정리 행 + 서류 FALSE 1건). **PR 설명에 기대값이 바뀌는 다른 세션의 시험 목록을 적는다.** 그 시험은 소유 세션이 같은 날 PR로 고치고, 총괄이 두 PR을 차례로 병합한다(sheet_model 픽스처는 CODING-A가 T1b PR을 리뷰·승인) | T1a, R11a, S2-0b #2·#3·#5 | fake_stage1·fake_stage2 시험 통과, 영향받은 시험 목록과 짝 PR | M |
| T2 | `tests/acceptance/stage2_{duty,meal,out2}.test.js`: 완료 기준 세 가지를 seedFakeStage2 위에서 한 흐름으로(7절) | C12, C13, C14, C17a, C18a, C19, C20 | 7절 | M |

## 3. 순서와 의존

```
지금(선생님 답 없이, 기본값 + ASSUMPTION):
  총괄:     S2-0a → S2-0c
  RULES:    R8 → R10 → R11a → R9 → R11b → R12        (rules-api.md는 작업마다)
  DESIGN:   D6(정적 시안 → T0a) → D7 → D8
  CODING-A: C9a
  CODING-B: C16
T0a(구조 승인) 뒤:
  총괄:     S2-0b(W1), S2-0d(C10과 같은 날)
  CODING-A: C8s → C8a → C9 → C10 → C11a → C11b → C13 → C12 → C14 → C15 ──(양식 1)→ C14b
  CODING-B: C17a → C17b → C18a → C18b → C19 → C20 ──(양식 2)→ C19b
  TEST:     T1a → T1b → T2
```

| 병합할 것 | 그 전에 main에 있어야 하는 것 |
| --- | --- |
| CODING 첫 PR(C9a·C16) | S2-0a |
| C8s | S2-0b #1, R8 |
| C8a | S2-0b #1, R8, D6(F3) |
| C9 | C8a, C9a |
| C10 | C8a, S2-0d(같은 날) |
| C11a | S2-0b #2·#3, D6(F4), C9a |
| C11b / C15 | C11a |
| C13 | C11b, R9, S2-0b #4, S2-0c |
| C12 | C11a, R9, C9a |
| C14 | C8a, R8, D7. PDF 방식 ← C0(⓪) |
| C17a | S2-0a, R10, D6(F7), S2-0b #5 |
| C17b | C17a |
| C18a | C17a, R11a, D6(F6) |
| C18b | C18a, R11b |
| C19 | R12, D8, C17a. PDF 방식 ← C0(⓪) |
| C20 | C13, C18a |
| T1a / T1b / T2 | S2-0b #1·R8 / T1a·R11a·S2-0b #2·#3·#5 / C12·C13·C14·C17a·C18a·C19·C20 |
| C14b / C19b | 자료 1번·D9·C14 / 자료 2번·D9·C19 |
| 확인 ② | **⓪**, C8s, C8a, C9, C10, T1a, S2-0b #6 |
| 확인 ③a / ③b | **⓪**, C11b·C12·C13·C20 / **⓪**, C17b·C18b |
| 확인 ④ | **⓪(C0)**, C14, C19 (양식이 오면 C14b·C19b) |

**선생님 답이 막는 곳:** Q1 → C8a, Q2 → C8s·C11a(dutyWindow 값), Q3 → R8·C14(옵션 하나), Q4 → C14b, Q5 → C14(권한 키), Q6 → C11a·C12, Q7 → `out.view` 한 줄, Q8·Q9 → C13·C20·R9, Q10 → C17a. 답이 늦으면 기본값으로 병합하고 `// ASSUMPTION:`을 남긴다. **예외: 권한을 넓히는 답(Q2의 열람 창, Q7, 4-2의 예비 본인 대신 근무)은 답을 받기 전까지 PRD 그대로의 좁은 값으로 병합한다.** 바뀌면 한두 줄만 고치도록 만든다(권한 키 한 줄, `dutyWindow` 값, 규칙 opts 하나).

**일정** — 1단계가 PRD 일정(12월)보다 일찍 끝났다(2026-11-07). 그래서 2단계를 11~12월에 하면, 실제 2027년 1월 근무표를 앱에서 시범 편성할 수 있다(교사 명단 10.1 9번 필요). S2-0a 병합 주를 W1로 센다. 확인 ②~④는 ⓪이 끝난 주보다 앞당기지 않는다.
- W1: S2-0a, S2-0c, R8, D6, C9a, C16. T0a → S2-0b. T0b 시작.
- W2: R10, R11a 시작, C8s, C8a, D7, T1a.
- W3: R11a, R9, C9, C10 + S2-0d, C11a, C17a, D8. 확인 ②(⓪이 끝났으면).
- W4: R11b, C11b, C13, C17b, C18a, T1b.
- W5: R12, C12, C14, C18b, C19, C20.
- W6: C15, T2, (양식이 오면) D9·C14b·C19b. 확인 ③a·③b·④.

## 4. 규칙 질문

### 4-1. 선생님께 하나씩 여쭐 것 (T0b — 돈·개인정보·완료 기준에 닿는 것만, 기본값 먼저, 각 질문은 따로 읽어도 이해되게)

**Q1. 날짜별 "운영 안 함"(예: 수능 전날)을 근무표 담당자도 정하나요?** — C8a
- 기본(권장): 아니요. 지금처럼 관리자가 "자습 일정"에서만 정하고, 근무표 화면은 그날을 회색 "운영 안 함"으로 보여 주기만 합니다.
- 이유: 운영 여부를 정하는 곳이 한 곳이어야 출석부와 근무표가 어긋나지 않습니다. 기획서(PRD F3)는 "근무표 담당자가 지정"이라 쓰고, 화면 설계는 "자습 일정에서 바꿉니다"라고 써서 서로 다릅니다(PRD.md:167, screens.md:242). 담당자에게도 열어야 하면 "운영 여부와 메모만" 바꾸는 좁은 권한을 더합니다.

**Q2. 근무교사가 담당이 아닌 학생의 기록을 볼 수 있는 시간은 언제까지인가요?** — C8s, C11a
- 기본(권장, 지금 만드는 값): 보기는 근무한 날 당일만입니다. 적발한 OUT 입력만 다음 날까지 됩니다. 그날 실제로 근무한 교사(교대 반영)만 해당하고, 예비 감독으로 지정만 된 교사는 해당하지 않습니다. 그 뒤에는 담당교사가 "전해 들은 건"으로 입력합니다.
- 이유: 기획서에 "근무교사 시간 범위 권한"이라는 말만 있고 범위가 없습니다(PRD §12, PRD.md:477). 밤 23시에 적발하고 다음 날 아침에 입력하는 일이 흔합니다. 보기까지 다음 날로 넓히면 담당 아닌 학생의 기록이 보이는 시간이 늘어납니다(성공 기준 "권한 밖 노출 0건", PRD.md:32). 넓히기로 하시면 설정 한 줄만 바꿉니다.

**Q3. 예비 감독으로 "지정만" 된 날도 월말 근무 기록표(수당)에 넣나요?** (PRD §13 열린 질문) — R8, C14
- 기본(권장): 넣지 않습니다. 예비 감독이 실제로 대신 근무한 날만 교대로 기록되어 들어갑니다. 화면에는 "예비 지정 N회(수당 미포함)"를 참고로만 보여 줍니다.
- 이유: 수당에 바로 영향을 줍니다. 지금은 가정으로 만들어 두었습니다(PRD.md:171, 결정 6 해석). 답이 "넣는다"여도 설정 하나만 바꾸면 됩니다.

**Q4. 21:30조와 23:00조의 수당이 다른가요?** (PRD §13 열린 질문) — C14b
- 기본(권장): 앱은 금액을 계산하지 않습니다. 기록표에 교사마다 21:30조·23:00조·주말 근무 횟수를 따로 적습니다. 학교 양식을 받으면 양식 칸에 맞춥니다.
- 이유: 어느 답이든 저장하는 자료는 같고, 출력 칸만 달라집니다.

**Q5. 월말 근무 기록표 파일을 내려받는 사람은 관리자만인가요?** — C14
- 기본(권장): 파일은 관리자만 받습니다(기획서 권한표). 근무표 담당자는 근무표 화면에서 교사별 합계와 교대 목록(칸마다 원래 → 실제 근무자)을 봅니다. 학사 교사는 본인 기록만 봅니다.
- 이유: 기획서 권한표에는 근무표 담당자 칸이 없습니다(PRD.md:128). 담당자는 이미 근무표 전체를 보므로 합계를 보여 주어도 새로 드러나는 정보는 없습니다(PRD §8 "교대 이력", PRD.md:361). 실제로 수당 서류를 담당자가 만든다면 파일 권한도 넓혀야 합니다.

**Q6. OUT 알림 메일은 누구에게, 무엇을 보내나요?** — C11a, C12
- 기본(권장): 새 OUT이 생기면(직접·자동 모두) 그 학생의 담당교사와 담임에게 보냅니다. 2OUT(퇴실 대상)이 되면 관리자에게도 보냅니다. 메일에는 학생 이름과 상황 메모를 쓰지 않습니다: "담당 학생 1명에게 1OUT이 기록되었습니다 · 3월 5일 · 휴대폰·전자기기" + 앱 링크. 취소와, 처음 연결할 때 한꺼번에 만드는 OUT은 알리지 않습니다.
- 이유: 기획서는 "담당교사·담임 알림"만 말합니다(PRD F4). 메일은 앱 밖에 오래 남고 전달될 수도 있습니다. 하루에 보낼 수 있는 메일 수에도 한도가 있습니다(받는 사람 기준, 개인 gmail 100명).

**Q7. 출결 담당(학사 교사를 겸하지 않는 경우)은 OUT을 볼 수 있나요?** — C11b
- 기본(지금 만드는 값): 보지 못합니다(기획서대로: 출결 담당은 특이사항·출석부·격자 말고는 학사 교사와 같고, 담당 학생이 없으면 볼 학생이 없습니다). 학사 교사를 겸하면 그 범위(담당 학생·근무일)에서 봅니다. 상담(면담) 정보는 어느 쪽이든 보지 못합니다.
- 이유: 출결 담당은 특이사항을 확정해서 자동 OUT을 만드는 사람이라 결과를 보면 편합니다(PRD.md:119). 그러나 열면 담당이 아닌 학생 전체의 OUT이 보입니다. 열기로 하시면 권한 한 줄만 바꿉니다.

**Q8. 2OUT 퇴실을 확정하면 입퇴실 신청서에 무엇을 미리 채우나요?** — C13, C20
- 기본(권장): 적용일은 확정한 날입니다(유예 없음, 화면에서 고칠 수 있음). 기숙사생이면 "학사 및 기숙사 퇴실", 아니면 "학사 퇴실"입니다. 석식(중단 / 일반 석식으로)은 관리자가 고르고, 서류는 "미제출", 사유는 "2OUT 퇴실"로 채웁니다. 면담 날짜와 상담 내용은 넣지 않습니다.
- 이유: 기획서는 "미리 채워진다"고만 하고 값은 정하지 않았습니다(PRD F4). 적용일이 출석부 공석과 급식 중단 날짜를 바로 정합니다. 입퇴실 기록은 근무교사도 보므로(PRD §4), 면담 날짜를 사유에 쓰면 상담 정보가 상담 범위 밖으로 나갑니다(PRD F12).

**Q9. 면담 기록에 연결된 OUT이 나중에 관리자 취소로 없어졌는데, 학생에게 다른 OUT이 2건 남아 여전히 퇴실 대상이면 어떻게 하나요?** — R9, C13
- 기본(권장): 그 면담 기록으로는 퇴실을 확정할 수 없고, 면담을 새로 기록해야 합니다. 둘째 OUT보다 앞선 날짜의 면담도 인정하지 않습니다.
- 이유: 기획서는 면담을 "그 OUT에 연결한다"고 합니다(PRD F12). 연결된 OUT이 없어지면 근거도 없어진다고 보는 쪽이 안전합니다. 대신 같은 면담을 다시 적어야 할 수 있습니다.

**Q10. 자동으로 계산된 급식 적용일을 손으로 고칠 수 있는 범위는 어디까지인가요?** — C17a
- 기본(권장): 입력 권한이 있는 사람(관리자·담당교사)이 고칠 수 있고, 사유를 꼭 적습니다. 신청일보다 이른 날짜는 막습니다. 오늘 이전 날짜는 "지난 날짜의 식수 집계가 바뀝니다", 미실시 규칙보다 이른 날짜는 "급식실 준비 기간보다 이릅니다" 확인을 받은 뒤 허용합니다. 계산된 날짜는 따로 남깁니다.
- 이유: 기획서는 "수정 가능"이라고만 합니다(PRD.md:202). 막으면 "수정 가능"과 어긋나고, 그냥 열면 미실시 준비 기간 규칙이 의미가 없어집니다. 잘못 넣은 급식 신청을 바로잡는 길도 이것입니다(4-2).

### 4-2. 기본값으로 진행할 것 (`// ASSUMPTION:` 유지, 여유가 있으면 확인)
- **근무:** 방학에도 근무 형태는 학기와 같다(월~목 21:30조·23:00조, 금·토·일 근무 + 예비). 끝나는 시각은 그날 자습 종료에 맞추고 빈 칸은 경고만 한다(R8, C8a). 지난 날짜의 교대는 근무표 담당자·관리자만 기록한다(C9). 예비 감독이 대신 근무하면 담당자·관리자가 기록하고, 예비 본인 버튼은 열지 않는다(권한을 넓히는 쪽이라 답 전에는 좁게, screens.md:245는 D6에서 고침). 교대 이력은 칸마다 마지막 교대(원래 → 실제)만 보이고, 중간 단계(A→B→C)는 audit_log에만 있다. 출석부 머리말은 근무표에 그날 칸이 있으면 근무표 이름을, 하나도 없을 때만 손 입력을 쓴다.
- **OUT:** "무단 지각·결석·이탈"은 OUT 화면에서 직접 고르지 못한다. 무단 지각·조퇴·결석은 출결 담당의 미인정 특이사항 → 자동 OUT 길 하나만 둔다(이중 집계로 잘못 2OUT이 되는 것을 막음, C11a). 학기 마지막 날 밤에 적발한 OUT은 기간 종료 다음 날까지 입력할 수 있다(Q2의 입력 창과 같다). 그 뒤에는 관리자도 넣지 못해 기록이 남지 않는다. 2OUT으로 퇴실한 학생이 같은 기간에 다시 입실하면 OUT 누적은 그대로다(기간마다만 초기화). 다시 "퇴실 대상"으로 보이고 "이전 퇴실 처리됨"을 함께 보여 준다.
- **면담(F12 최소):** 2OUT 학부모 면담은 담당교사만 기록하고, 관리자는 보기만 한다(PRD.md:135). 담당교사가 없으면 관리자가 담당교사를 바꾼다. `show_to_parent`는 `TRUE`로 저장만 하고 화면 입력은 없다. 면담 내용을 앱에서 다시 보는 화면은 3단계 이후에 만든다.
- **입퇴실(F6):** 기숙사생의 "학사 퇴실"은 막고 "학사 및 기숙사 퇴실"로 안내한다(기숙사생은 학사생 중 일부, PRD.md:74). 기숙사만 퇴실할 때 "조식도 미실시"를 기본으로 켜고 미실시 규칙을 따른다(real-layout-2025.md:27 "3.9 기숙사 퇴실(3.10~), 조식 미실시(3.17~)"). 재입실하면 퇴실 전 조식·석식 값을 미리 채워 재입실일부터 시작하고, 아직 오지 않은 석식 중단은 취소한다(followups.md:13). 퇴실 취소는 적용일 전에는 담당교사·관리자, 지난 뒤에는 관리자만 한다. 실제로 나갔다가 돌아온 경우는 취소가 아니라 재입실로 넣는다. **학기 중 새로 들어온 학생은 관리자가 명단에 학사 X로 학생·등록을 만든 뒤 F6 "학사 입실"로 넣는다**(PRD F6 "학기 중 신규 … 이 기능으로", PRD.md:194, 등록을 만드는 곳은 명단 저장뿐 Roster.gs:345). 퇴실·입실과 함께 만든 급식 행은 서류 1장으로 보고, 미제출은 대표 행 1건만 센다(10.1 3번 신청서가 한 장인지 모름).
- **급식(F7):** 신청 일시는 신청서를 받은 날짜·시각이다. 화면 기본값은 지금 시각이고, 미래 일시는 막는다(11:29와 11:31로 적용일이 바뀌어 시각까지 필요, followups.md:15). **잘못 넣은 급식 신청을 되돌리는 기능은 2단계에 없다**(PRD F7 요구 없음). 새 신청으로 바로잡고, 필요하면 적용일을 사유와 함께 고친다(Q10). 확인 ③b 뒤 필요하면 `moveUndoPlan_`을 그대로 쓰는 작은 PR을 더한다. 급식 변경과 근무 편성 변경에는 메일을 보내지 않는다(PRD §6 알림 대상은 교대·OUT·요청·동의). 출결 담당만 가진 계정은 입퇴실·급식 기록을 보지 못한다(PRD.md:119). 공석은 출석부에서 본다.
- **식수 집계:** 그날이 속한 운영 기간에 등록된 학생을 상태 그대로 센다. 학사 퇴실한 학생도 석식 중단일 전까지는 학사 석식에 센다(결정 35). 퇴실하면서 일반 석식으로 바꾼 학생은 일반 석식에 센다. 표 아래에 "퇴실 후 석식 유지 N명"을 따로 적는다. 결석·외박은 빼지 않는다(신청 기준 인원). 날짜마다 인원만 계산하고 그날 자습 운영 여부는 참고로만 보여 준다. 식수 집계는 관리자만 본다(PRD §8). 관리자 홈의 기숙사 정원(결정 24) 대비 공석은 F8(3단계, 방 배정)에서 보이고, 2단계는 기숙사 입실 인원(남·여)만 보인다.

### 4-3. 총괄이 정할 것 (선생님께 묻지 않음, 이 문서의 권장)
- 접두어 표와 공용 파일 나누기(1절), public-api 나누기(S2-0a), `permissions_()` 표는 총괄 소유.
- F7을 F6보다 먼저 만든다. F6이 F7의 쓰기 함수(`foodWrite_`)와 R10을 쓰고, F7은 열린 질문이 적다.
- F6·F7 권한 키는 `status.*` 하나로 합친다(PRD §4의 두 줄 권한이 같다). 화면은 `screen_moves` 하나에 탭으로 둔다(PRD §8 메뉴 하나).
- 상담 감사는 운영 DB audit_log에 두되 내용 칸을 가린다. 상담 파일에 audit_log 탭을 따로 만들지 않는다(새 탭 없음).
- **bulk_create 감사는 행 id 목록만 남긴다**(행에 created_at·by가 있고 이후 수정은 전후 값이 남는다). 행마다 JSON 전체를 남기지 않는다(좌석 격자 200행이면 audit_log가 두 배가 된다). decisions.md에 적는다.
- 자동 OUT 넓힌 시각은 Script Property `AUTO_OUT_SINCE`에 둔다. 설정 행을 더하지 않는다. 잃어버리면 기본 3종 기준으로 돌아간다(R9). README에 재설치 안내를 한 줄 적는다.
- 예비 지정의 수당 포함 여부(Q3)는 설정 행이 아니라 규칙 옵션(`includeStandby`)으로 둔다. 답이 바뀌면 한 줄만 고친다.
- 출력물(기록표·식수 집계)은 C7처럼 base64로 내려주고 Drive에 저장·공유하지 않는다. xlsx는 학교 양식을 받은 뒤에만 만들고 임시 사본은 휴지통으로 보낸다(C14b).
- 양식 템플릿 ID는 Script Properties에 둔다(CLAUDE.md 7). PRD §7 문구는 총괄이 고친다.
- 메일은 `MAIL_ENABLED`가 `'true'`일 때만 보내고, `@example.com`은 늘 빼고, 한도를 먼저 본다. 확인 ②에서 선생님이 켠다.

### 4-4. 선생님 자료 (그동안 쓰는 대체물)

| 자료(PRD 10.1) | 막히는 곳 | 그동안 | 필요 시점 |
| --- | --- | --- | --- |
| 1. 월말 근무 기록표 학교 양식(이름 지운 것) | C14b, D9, 완료 기준 ①의 "학교 양식" | 임시 양식 PDF(교사 × 날짜 + 조별 합계 + 교대 목록) | 12월 안(1월 확인) |
| 2. 급식 인원 보고 양식 | C19b, D9 | 현황표 집계 표 모양 PDF(real-layout-2025.md:28) | 1월 |
| 3. 입퇴실·급식 변경 신청서 | 서류 항목 확인(4-2) | 신청서 1장 = 서류 1건 | 1월 |
| 4. 학사 규정(OUT 항목·조치 기준) | violation_rules 첫 항목 | PRD F4 4항목 | 2월 이관 전 |
| 9. 교사 명단 | 실제 1월 시범 편성(선택) | 가짜 교사 3명 + 시험 계정 | 12월(시범을 원하면) |

## 5. 2단계 시트 구조 변경안 (선생님 확인 필요, T0a에서 한 번에)

**원칙:** 1단계와 같다(stage1.md:344-347). 새 탭은 첫 열 `id`, 끝 4열 `created_at, created_by, updated_at, updated_by`(아래 표에서는 생략). 행은 지우지 않고 status를 `취소`로 바꾼다. 날짜·시각 칸은 `'@'` 텍스트다.

| # | 대상 | 열(id·공통 꼬리 제외, 순서대로) / 내용 | PRD 7절과 다른 점, 이유 | 쓰는 곳 |
| --- | --- | --- | --- | --- |
| 1 | **새 탭 `duty_slots`**(운영 DB, 기간별로 나누지 않음) | date, slot, end_time, original_email, actual_email, swapped_at, swapped_by, status, memo | 근무자를 이름이 아니라 이메일로 저장한다(권한 판정·메일에 필요, 이름은 users에서 읽음, enrollments.teacher_email과 같은 방식). swapped_by(누가 눌렀는지)·status(취소 규칙)를 더한다. 기간별로 나누지 않는다: 1년에 약 750행이고, 방학에도 근무하며, 집계 단위가 달이다(결정 20과 같은 판단). 교대 이력 탭은 따로 만들지 않는다 — 칸에는 마지막 교대가 남고, 중간 단계는 audit_log 전후 값에 남는다 | C8s~C10, C12, C14 |
| 2 | **새 탭 `violation_rules`**(운영 DB) | name, description, active, sort_order | sort_order를 더한다. setup은 탭이 비었을 때만 PRD F4 4항목을 넣는다: 무단 지각·결석·이탈 / 휴대폰·전자기기 / 자습 분위기 방해(과도한 수면, 교사 지시 불이행 포함) / 기숙사 생활 위반. 자동 항목 이름은 고정한다(찾은 것 15) | C11a, C12, C15 |
| 3 | **새 기간별 탭 `violations_<기간 id 앞 8자>`**(운영 DB, SCHEMA_TERM_TABS) | term_id, student_id, occurred_at, rule_id, rule_name, memo, detected_by, entered_by, status, source, source_exception_id, cancel_reason | stage1.md:368 선택안 그대로이고 R5 초안 열과 같다(OutRules.gs:228-244). 일시 → occurred_at, 항목 → rule_id + rule_name(그때 이름을 보관), 교사는 이메일, cancel_reason을 더한다. 학기마다 초기화되므로 기간별 탭으로 둔다(PRD §6.2) | C11a~C13 |
| 4 | **열 추가 `counsel_notes`**(상담일지 파일, 지금 비어 있음) | student_id, date, teacher_email, type, **target, linked_violation_id**, content, show_to_parent, status, **cancel_reason** | 2단계에 쓰는 열만 넣는다(상담 대상 PRD F12, OUT 연결, 취소 사유). 6단계(F17)의 합의 사항·공개·프로필 버전·신청 연결 열은 그때 7번 경로로 데이터를 옮기지 않고 끼운다 | C13 |
| 5 | **열 추가 `status_changes.cancel_reason`**(memo 뒤) | 자유 입력. 다른 저장이 자동으로 취소한 행은 `[자동] <원인 행 id> 사유`로 쓴다 | 특이사항·OUT과 같은 방식으로 취소 사유를 행에 남긴다. 퇴실 취소 때 되살릴 행을 정확히 찾는 고리가 된다. C17a의 저장이 이 열을 쓴다. 승인이 안 되면 같은 꼬리표를 memo에 쓴다(사람 칸과 섞여 덜 깨끗하다) | C17a, C18a·b |
| 6 | **OAuth 범위** `https://www.googleapis.com/auth/script.send_mail` 추가 | 교대·OUT 메일(PRD §6) | 추가하면 소유자가 권한을 다시 승인해야 한다(stage1.md:374와 같은 절차). 메일은 소유자 계정에서 나간다. 한도는 소유 계정 종류로 정해진다(⓪에서 확인) | C9, C11a, C12 |
| 7 | **setup 동작** | 시트 헤더가 코드 헤더에서 "새 본문 열만 빠진" 모양(나머지 순서 같음)이면 `withLock_` 안에서 데이터 범위 전체를 읽고, 빈 열을 제자리에 끼운 배열을 한 번에 `setValues`로 다시 쓰고, `[열 추가]`로 알린다. 그 밖에 다르면 지금처럼 `[경고]`만 낸다 | 4·5번을 데이터가 있어도 안전하게 반영한다. 웹앱이 쓰는 도중에 행이 어긋나지 않게 락을 건다(CLAUDE.md "쓰기는 LockService"). 지금 gas-fakes로도 시험할 수 있다(`insertColumnsBefore`가 없어도 됨, gas-fakes.js:158). 앞으로 열을 더할 때도 같은 길을 쓴다 | S2-0b |

**만들지 않는 것:** `duty_swaps`(1번 설명), `meal_counts`(집계는 그때그때 계산 — 저장하면 낡고 PRD.md:31 "입력 즉시 반영"과 어긋난다), `out_dismissals`(퇴실 확정의 기록 = F6 학사 퇴실 행), 상담 파일 audit_log 탭(4-3), settings 새 행.

**Script Properties(구조 변경 아님, 알림만):** `MAIL_ENABLED`(`'true'`일 때만 발송, 기본 없음 = 꺼짐), `AUTO_OUT_SINCE`(앱이 관리하는 JSON, 사람이 고치지 않음, 백업에 들어가지 않음), 양식을 받은 뒤 `DUTY_TEMPLATE_ID`·`MEAL_TEMPLATE_ID`.

**어휘(vocabulary.md, 총괄 소유, 구조 변경 아님)**

| 탭 | 열 | 값 |
| --- | --- | --- |
| duty_slots | slot | `21:30조` · `23:00조` · `단독` · `예비` |
| duty_slots | status | `유효` · `취소` |
| duty_slots | end_time / swapped_at | `HH:mm` / `yyyy-MM-ddTHH:mm:ss`(교대 전에는 빈칸) |
| violation_rules | active | `TRUE` · `FALSE` |
| counsel_notes | type | `생활` · `학습` · `진로` · `진학` · `2OUT 학부모 면담` · `기타` |
| counsel_notes | target | `학생` · `학부모` |
| counsel_notes | show_to_parent / status | `TRUE`(기본, 2단계는 늘 TRUE) · `FALSE` / `유효` · `취소` |
| status_changes | requested_at | source `명단업로드`이면 `''`(C16). F6·F7은 날짜+시각 필수 |
| status_changes | linked_change_id | 한 번의 F6·F7 입력에서 대표 행 id. 대표 행은 `''`. "학사 및 기숙사 퇴실"의 기숙사 행, 퇴실 정리 급식 행, 퇴실과 함께 만든 일반 석식 행, F7 신청의 followUps가 대표를 가리킨다 |
| status_changes | source(연결 행) | 퇴실 정리 급식 행과 F7 followUps는 `F6`. **F6 화면이 퇴실과 함께 만든 일반 석식 행은 `F7`**(신청이다 — MealRules.gs:168·183·261은 F6 행을 정리 행으로 보고 superseded·퇴실 취소 대상에서 뺀다) |
| status_changes | doc_submitted | 대표 행 `TRUE`·`FALSE`. 연결 행(일반 석식 행 포함)과 명단업로드 행은 `''`. 서류 미제출 목록은 `FALSE`만 센다 |
| status_changes | effective_date_auto | 규칙 계산값. effective_date와 다르면 교사가 고친 행(사유는 reason) |
| status_changes | reason(자동) | 퇴실 정리 행 `학사 퇴실 정리`, 2OUT 퇴실 대표 행 `2OUT 퇴실`(날짜·면담 정보 없음) |
| status_changes | memo(자동) | 2OUT 퇴실 대표 행 `[2OUT] out:<OUT id> note:<면담 id>`. 화면에 내보내지 않는다 |
| status_changes | cancel_reason | `[자동] <원인 행 id> …`(규칙이 취소) 또는 사람이 적은 사유(2자 이상) |

## 6. 선생님 확인 묶음

클라우드 세션은 Apps Script를 돌리지 못하므로 확인을 묶는다. 체크리스트는 **기능별(F3 / F4·F12 / F7 / F6)**로 PR 설명에 쓰고, 선생님은 아래 묶음으로 한 번에 실행하신다(0절 4). 체크리스트마다 "node 테스트가 이미 증명한 것"을 적어서, 선생님은 Apps Script에서만 보이는 것(MailApp, Drive, PDF, 실제 로그인)만 보신다. 확인마다 화면·출력물 사진을 붙인다(결정 운영 방식).

| 묶음 | 언제 | 선생님이 할 일 | 시간 |
| --- | --- | --- | --- |
| ⓪ 선행(②~④의 필수 조건) | 지금 | 설치·0단계 진단(stage0-checklist.md A~F), C0 `spikeRunAll`(A4 가로·한글·10초·휴대폰), 1단계 출석부를 기존 시트와 대조(print-check.md). 소유 계정 종류 확인(개인 gmail = 메일 받는 사람 하루 100명 / Workspace = 1500명). PDF가 실제로 되는지 여기서 확인된다(C14·C19가 같은 방식) | 1단계 계획대로 |
| ① T0a / T0b | W1, 코드 실행 없음 | **T0a(한 번에):** 5절 1~7번 승인, 0절 4의 해석 동의, D6 정적 시안 사진, 아래 시험 계정 표. **T0b(하나씩):** 4-1 Q1~Q10, 4-4 자료 파일 | 대화 |
| ② F3(C8s~C10) | W3 이후, ⓪ 뒤 | 시험 계정 준비: `addUser(시험 gmail 1, …, 'hall_teacher,duty_manager')` → `clasp push` → setup 다시 실행([탭 생성] duty_slots·violation_rules·violations_…, [열 추가] counsel_notes·status_changes) → 권한 다시 승인(메일) → Script Property `MAIL_ENABLED=true` → `seedFakeStage2` → 시험 gmail 1로 1월 주 목록·월 달력 보기 → **편성 화면에서 오늘 날짜 칸에 시험 gmail 1 배정** → 시험 gmail 1 홈 "오늘 내 근무"가 보이고, 담당 아닌 학생 요약이 열림 → 오늘 칸에서 빼고 **이틀 전 날짜 칸에 배정하면 막힘** → 소유자 계정으로 내 칸 교대 1건 → 시험 gmail 1에 메일 1통(example.com 주소로는 안 감) → 그날 출석부 머리말에 근무·예비 이름 | 약 25분 |
| ③a F4·F12(C11b·C12·C13·C20) | W6, ⓪ 뒤 | 시험 gmail 2(출결 담당)로 미인정결석 저장 → "1OUT 기록됨" → 취소하면 OUT도 취소 → 시험 gmail 1(담당교사)로 OUT 입력 → 담당교사·담임 메일(이름 없음) → 2OUT 학생 [퇴실 확정]이 "면담 기록 필요"로 막힘 → 담당교사가 면담 기록 → 관리자 퇴실 확정 → 입퇴실 화면이 미리 채워짐(사유 "2OUT 퇴실") → 저장 → 급식 정리 날짜 확인. 관리자 홈이 3초 안에 열리는지(`ms` 값) | 약 40분 |
| ③b F7·F6(C17b·C18b) | W6, ⓪ 뒤 | 급식 변경: 신청 일시 기본값이 지금 시각인지 → 신청 일시를 어제 11:20으로 고치면 적용일 어제, 어제 11:40이면 오늘(실제 시계 대신, 미래 일시는 막히므로 어제로) → 홈 "서류 미제출 1건" → 서류 제출 표시 → 0건. 입퇴실: 학사 퇴실(일반 석식으로) → 다음 날 출석부에 공석 → 적용일 전 취소 → 원래대로 → 식수 집계 숫자가 바로 바뀜 | 약 40분 |
| ④ 출력물·완료 기준(C14·C19, 양식이 오면 C14b·C19b) | W6, ⓪ 뒤 | 1월(교대 3건) 기록표 PDF(·xlsx)를 휴대폰·PC에서 열어 실제 근무자와 대조 → 식수 집계 PDF를 손으로 계산한 한 날짜와 대조 | 약 20분 |

**시험 계정 표(T0a에서 확인)** — 0단계 시험 계정(소유자, 시험 학생·학부모 gmail, 미등록 gmail, stage0-checklist.md:17-22)과 따로 둔다.

| 계정 | 역할(`addUser`) | 쓰는 확인 |
| --- | --- | --- |
| 소유자 | admin, hall_teacher | ②~④ 전체, 관리자 퇴실 확정 |
| 시험 gmail 1(`TEST_TEACHER_EMAIL`) | hall_teacher, duty_manager | ② 편성·근무일 권한·교대 메일, ③a 담당교사(OUT 입력·면담 기록), ③b 입력 |
| 시험 gmail 2(`TEST_HOMEROOM_EMAIL` 또는 새 gmail) | attendance(③a 동안), homeroom(담임 메일 확인 때) | ③a 미인정결석 저장, 담임 OUT 메일 |

## 7. 완료 기준 → 테스트 (PRD §11 2단계)

공통: `npm test`가 TZ=Asia/Seoul·UTC 둘 다 통과하고 테스트 수가 598개보다 줄지 않는다. 새 공개 함수가 모두 public-api(.d)에 있고 첫 줄 검사·전역 이름 중복 검사를 통과한다(security.test.js).

| 완료 기준 | 규칙 테스트 | 기능 테스트(gas-fakes) | 끝까지(T2) | 선생님 확인 |
| --- | --- | --- | --- | --- |
| ① 1월 근무표로 기록표 출력 (+ F3 "교대 3건 달 = 실제 근무자", PRD.md:174) | `rules/duty.test.js`: `dutyRecord_` 교대 3건(일반·교대의 교대·예비 대신 근무) 달의 합계 = 실제 근무자, 원래 근무자 합계와 다름, 예비 지정만 제외(Q3). `dutySlotsFor_` 방학 plan | `features/duty_record.test.js`: 권한(관리자 전체·담당자 전체 합계·학사 교사 본인·담당자 파일 거부), 렌더 HTML에 교사별 합계·교대 3건 | `acceptance/stage2_duty.test.js`: seedFakeStage2 → 교대 1건 더 → getDutyRecord('2027-01') 합계가 실제 근무자 → getDutyRecordFile 모델·HTML. 한계: 가짜 1월은 학기 기간(T1a) | ④ PDF(양식이 오면 xlsx)를 실제 근무자와 대조 |
| ② 급식 적용일 규칙 표의 모든 경우 통과 (PRD.md:204-210 다섯 줄) | `rules/meal.test.js`(이미 통과) + R10 수동 적용일 + R11a 퇴실·입실 표 + 오라클 | `features/meals.test.js`: 1줄(11:29:59/11:30:00, 연말), 3·4줄(미실시 7개 요일, 2026-12-30). `features/moves.test.js`: 2줄(기숙사 입실 조식 = 입실일), 5줄(학사 퇴실 조식 = 퇴실일) + 결정 35 석식. 서류 미제출이어도 적용(결정 3) | `acceptance/stage2_meal.test.js`: 다섯 줄을 화면 함수(preview → save)로 차례로 저장하고, 적용일 전날·당일 statusOn_과 식수 집계 숫자 변화를 확인 | ③b 신청 일시 기본값, 어제 11:20/11:40 저장 |
| ③ 2OUT은 면담 기록 전 퇴실 확정이 막히고, 기록 후 F6 학사 퇴실 신청이 미리 채워진다 | `rules/out.test.js`: `outDismissalGate_` 표(R9, 면담 날짜 < 둘째 OUT 포함) | `features/counsel_gate.test.js`(C13), `features/moves.test.js` outDismissal(C20: 담당교사 거부 `denied:out.dismiss`, 관리자 허용) | `acceptance/stage2_out2.test.js`: 직접 OUT 2건 → confirmOutDismissal `{ok:false, reason:'면담 기록 필요'}` → 그 상태로 관리자 saveMove(outDismissal) 거부 → 담당교사 saveOutMeeting → `{ok:true, prefill}`(학생·유형·사유 `2OUT 퇴실`·신청 일시) → 담당교사 saveMove(outDismissal) 거부 → 관리자 saveMove → 학사 퇴실 행 + 조식·석식 정리 행. 운영 DB audit_log, 응답 JSON, **근무교사 계정의 listStudentStatus 응답**에 면담 표식·면담 날짜 없음. 그날 getAttendanceSheet 모델에 OUT 표시 없음(결정 36) | ③a 화면 흐름 |
