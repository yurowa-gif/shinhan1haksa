# Connecteam 근무시간 기록표(Time Clock Timesheet) 정찰 지도 (+ Factorial 경고 열)

작성: 2026-11-21. 방법: replica-recon / replica-entrepreneur 규칙(공개 자료만, 로그인·스크래핑·코드 없음, 지어내지 않음).

> **중요한 한계.** 이 컨테이너에서 help.connecteam.com은 접속이 막혔다(WebFetch 1회 시도, DNS 해석 실패). 그래서 **도움말 원문을 한 쪽도 직접 읽지 못했고**, 아래 내용은 모두 WebSearch가 돌려준 **검색 요약**에 기댄다. 검색 요약은 문장이 섞이거나 글끼리 모순될 수 있으므로(실제로 몇 군데 모순이 있었다, 11절) 확신도를 낮게 매겼다. 화면 사진은 하나도 보지 못했다.

---

## 1. 범위

- **앱·플랫폼:** Connecteam(웹 관리자 대시보드 + 휴대폰 앱의 Admin 탭·직원 화면).
- **조각(slice):** Time Clock의 "타임시트" 고리 — 관리자가 기간(급여 주기)을 골라 → 팀원 목록(사람별 1줄, 합계) → 한 사람의 타임시트(날짜별 행)를 열고 → 문제(Issues) 있는 날을 확인·수정 → 승인(=기간 잠금) / 날짜별 잠금 → 다시 열기 → 내보내기. 직원 쪽 제출·휴대폰 보기 포함.
- **보조 참고:** Factorial 근태(Time tracking) 개요 표의 "Alerts(경고)" 열과 4가지 오류 유형.
- **누구를 위해:** 신한1학사 앱. 출결 담당 교사가 학사생 약 180명 × 날짜의 월간 출석 격자(○ × △ 조, 특이사항 메모)를 정리. **UX 패턴만 빌리고 이름·문구·그림은 쓰지 않는다.**
- **빼는 것:** GPS·지오펜스, 급여 계산·초과근무 수당 규칙, 급여 연동(QuickBooks·Gusto), 스케줄러, 채팅·과제 생성.

## 2. 출처 표

"직접"= 원문을 열어 읽음. "검색 요약"= WebSearch 결과 요약만 봄. **직접 연 출처는 0개.**

| # | URL | 무엇 | 읽은 방식 |
|---|---|---|---|
| C1 | https://help.connecteam.com/en/articles/9051621-timesheet-issues | Issues 열: 충돌·대기 중 타임시트 요청·휴가 요청·자동 퇴근·빈 근무일, 날짜마다 느낌표 아이콘, 무시한 문제 되돌리기 권한, 빈 근무일 설정(기본 꺼짐) | WebFetch 실패 → 검색 요약 |
| C2 | https://help.connecteam.com/en/articles/9545686-troubleshooting-errors-in-timesheet-approval | 승인 버튼이 안 보일 때(권한 설정, 사용자 지정 날짜 범위에서는 승인 불가), 기간 끝나기 전 승인 경고 | 검색 요약(부분) |
| C3 | https://help.connecteam.com/en/articles/5439640-approving-employee-timesheets-for-payroll (같은 번호의 "locking-employee-s-timesheets-for-payroll" 주소 포함) | 승인=주기 안 모든 날 잠금, 오른쪽 위 Approve, 날짜 위에 마우스 → 자물쇠, 여러 날 일괄 잠금, 다시 열기 권한, 자기 승인 제한, 대시보드·앱 둘 다 | 검색 요약 |
| C4 | https://help.connecteam.com/en/articles/5449127-timesheet-conflicts | 충돌 3종(겹친 근무·겹친 휴식·겹친 휴가), 타임시트 위 빨간 Conflicts 버튼, 열린 충돌/기록 전환, Expert 요금제부터 | 검색 요약 |
| C5 | https://help.connecteam.com/en/articles/9420509-the-time-clock-s-timesheet-tab | 타임시트 탭: 사람별 1줄, 총시간(정규·초과·유급휴가), 열 선택기, Daily Totals 켜기(요일별 열) | 검색 요약 |
| C6 | https://help.connecteam.com/en/articles/9582636-understanding-your-employees-timesheet | 개인 타임시트 열: Daily total, Weekly total, 초과근무 열, Regular, Issues, 오른쪽 끝 Shift Attachments(메모·첨부), 일 한도 초과 시 빨간 숫자 | 검색 요약 |
| C7 | https://help.connecteam.com/en/articles/6392696-perform-bulk-actions-in-the-timesheets-tab | 일괄 작업: 근무 추가·휴식 추가·내보내기·승인·채팅·과제, 승인/다시 열기 일괄 | 검색 요약 |
| C8 | https://help.connecteam.com/en/articles/8683886-perform-bulk-actions-on-your-employee-s-timesheets | 개인 타임시트 안 일괄 작업(날짜 선택 → 아래 Actions → Lock) | 검색 요약(제목·짧은 요약만) |
| C9 | https://help.connecteam.com/en/articles/9313978-is-it-possible-to-see-the-edit-history-in-an-employee-s-timesheet | 전체 수정 이력은 못 봄, 파란 점(관리자가 만든 항목)·주황 점(수정됨, 마우스 올리면 누가·언제) / 다른 요약은 "감사 기록(audit log) 내보내기" 언급 — 모순 | 검색 요약 |
| C10 | https://help.connecteam.com/en/articles/6653444-how-to-edit-an-employee-s-timesheet | 관리자 타임시트 편집 | 검색 요약(제목·일부) |
| C11 | https://help.connecteam.com/en/articles/10325551-troubleshooting-i-can-t-edit-manager-notes-in-timesheets | 승인·잠금 후에는 관리자 메모도 못 고침, Approve 옆 점 3개 → Reopen, 자물쇠 아이콘 위 마우스로 날짜 잠금 해제, 밤샘 근무는 시작일에서 수정 | 검색 요약 |
| C12 | https://help.connecteam.com/en/articles/9419970-users-can-t-clock-in-because-of-locked-timesheets | 잠긴 날에는 출근 기록도 막힘 | 검색 요약 |
| C13 | https://help.connecteam.com/en/articles/9208433-how-to-submit-timesheets-for-users | 직원 휴대폰: Time Clock → Timesheets(현재 급여 주기 기본) → 점 3개 → 제출, 제출 후 파란 "Submitted", 날짜 범위 탭으로 지난 주기·사용자 지정 | 검색 요약 |
| C14 | https://help.connecteam.com/en/articles/9350561-how-can-employees-download-and-print-their-timesheets | 직원이 PDF로 내려받기 | 검색 요약(짧음) |
| C15 | https://help.connecteam.com/en/articles/6498736-the-admin-s-tab | 휴대폰 Admin 탭(소유자·관리자만), Time Clock 섹션 | 검색 요약 |
| C16 | https://help.connecteam.com/en/articles/8110058-automatically-export-and-share-your-employee-timesheets-and-payroll-reports | 자동 내보내기·공유 | 검색 요약(제목만) |
| C17 | https://connecteam.canny.io/time-clock/p/time-clock-improved-locked-timesheet-overview | 기능 요청 "누가 잠갔는지/승인됐는지 한눈에" → 완료, 타임시트 탭에서 승인 현황 보임 | 검색 요약 |
| C18 | https://developer.connecteam.com/docs/time-clock-timesheet.md | 공개 API: 사용자별·날짜별 총 근무시간, 승인된 타임시트만 거르기 | 검색 요약 |
| F1 | https://help.factorialhr.com/en_US/proactively-catch-timesheet-errors-with-alerts | 4가지 오류(Missing Clocking, Missing Clock-Out, Missing Break, Insufficient Break), 개요 표 Alerts 열(빨간 배지·건수), 유형별 필터·정렬, 경고가 승인을 막지 않음 | 검색 요약 |
| F2 | https://help.factorialhr.com/en_US/about-time-tracking-alerts | 유형 3개로 적힌 판(Missing Clock-In / Clock-Out / Break Time), 유형마다 정책 설정 토글, Alerts 열이 안 보일 때 점검 | 검색 요약 |
| F3 | https://factorial.helpjuice.com/en_US/time-tracking-filters- | 직원 목록 필터(검토 상태 Pending/Approved/In progress, 휴식 부족 등), 왼쪽 위 | 검색 요약 |
| F4 | https://help.factorialhr.com/en_US/activity-log-for-time-tracking | 수정마다 누가·언제 남기는 활동 기록 | 검색 요약 |
| R1 | https://www.g2.com/products/connecteam/ | 리뷰 집계·테마 요약 | 검색 요약 |
| R2 | https://www.capterra.com/p/153140/Connecteam/reviews/ | 리뷰 집계·테마 요약 | 검색 요약 |
| R3 | https://softwareadvice.com/hr/connecteam-profile/ | 리뷰 테마 요약 | 검색 요약 |
| R4 | https://www.getapp.com/sales-software/a/connecteam/ | 리뷰 테마 요약 | 검색 요약 |
| R5 | https://clockify.me/reviews/connecteam-review | 경쟁사가 쓴 리뷰(편향 있음) | 검색 요약 |
| R6 | https://buddypunch.com/blog/connecteam-review/ | 경쟁사 블로그 리뷰(자동 퇴근 경험) | 검색 요약 |

출처 수: Connecteam 18, Factorial 4, 리뷰 6 → **합계 28**(모두 검색 요약). App Store·Reddit은 검색에서 결과가 나오지 않았다.

## 3. 화면 목록

| ID | 화면 | 가는 길 | 목적 | 주요 부품 | 본 상태 |
|---|---|---|---|---|---|
| S01 | 타임시트 탭(팀 요약) | 대시보드 → Time Clock → Timesheets 탭 | 기간 안 모든 사람 합계를 한 표로, 승인 현황 확인 | 기간 선택(급여 주기), 사람별 1줄, 총시간·정규·초과·유급휴가 열, 열 선택기, Daily Totals(요일별 열) 토글, 행 체크박스, 일괄 Actions, 승인 현황(C17) | 채움(검색 요약). 빈·로딩 상태 근거 없음 |
| S02 | 개인 타임시트(기간) | S01에서 행 클릭 | 한 사람의 날짜별 기록 검토·수정 | 날짜별 행, 근무 항목, Daily total·Weekly total, 정규·초과 열, Issues 열(날짜별 느낌표), 오른쪽 끝 메모·첨부, 오른쪽 위 Approve(+점 3개 메뉴: Reopen), 빨간 Conflicts 버튼, 일 한도 초과 빨간 숫자, 파란·주황 점 | 채움, 문제 있음, 잠김/승인됨(근거: C1·C3·C6·C11) |
| S03 | 충돌 패널 | S02 위쪽 빨간 Conflicts 버튼 | 겹친 근무·휴식·휴가 확인·해결 | 열린 충돌 / 기록 탭 전환, 충돌 목록 | 열림·기록(C4). 요금제 제한(Expert부터) |
| S04 | 근무 항목 편집 | S02에서 항목 클릭 / Daily total 칸에 마우스 → 시간 입력 | 출퇴근 시각·메모 수정, 새 항목 추가 | 시각 입력, 메모, 첨부, 저장 | 잠긴 날 편집 불가(C11). 모양은 미확인 |
| S05 | 승인 확인 대화상자 | S02 Approve(기간이 끝나기 전) | 일찍 승인할지 확인 | 경고 문구, 그래도 승인 / 취소 | 경고 존재(C2 검색 요약) |
| S06 | 내보내기 선택 | S02·S01의 Export | 급여 합계·타임시트(Excel/PDF)·근무 보고서·감사 기록 | 형식 고르기, 한 PDF로 합치기/사람별 따로 | 존재(C5·C7·C9). 화면 모양 미확인 |
| S07 | 설정 > Payroll 탭 | Time Clock 설정 → Payroll | 누가 승인·다시 열기 할 수 있나, 자기 승인 제한 | "Who can approve / reopen" 체크박스 | 존재(C2·C3) |
| S08 | 설정 > Timesheet Issues | Time Clock 설정 → Settings | 빈 근무일 문제 켜기(기본 꺼짐) | 토글 | 존재(C1) |
| S09 | 휴대폰 Admin 탭 > Time Clock > Timesheets | 앱 → Admin 탭 → Time Clock → Timesheets → 직원 고르기 | 이동 중 검토·승인·다시 열기·날짜 잠금 해제 | 직원 목록, 개인 타임시트, 승인/다시 열기 | 존재(C3·C15). 배치는 미확인 |
| S10 | 휴대폰 직원 타임시트 | 앱 → Time Clock → Timesheets | 내 기록 보기·제출·PDF·수정 요청 | 현재 급여 주기 기본, 날짜 범위(지난 주기·사용자 지정), 점 3개 → 제출/PDF, 근무 수정 → 메모 → 승인 요청, 문제 표시 | 제출 전/제출 후(파란 Submitted)(C13·C14) |
| S11 | (Factorial) 근태 개요 표 | Time tracking → 개요 | 직원별 기간 요약 + 경고 건수 | 직원 행, Alerts 열(빨간 배지·건수), 정렬, 왼쪽 위 필터(경고 유형, 검토 상태) | 채움(F1·F3). 열이 없을 때 점검 안내(F2) |

화면 수: **11**(Connecteam 10 + Factorial 1).

## 4. 흐름

클릭 수는 도움말에 적힌 단계로 셌다. 실제 화면으로 확인한 것이 아니므로 **모두 '추정'**.

- **F01 관리자가 한 사람의 월(급여 주기)을 검토하고 승인**
  S01(기간 확인) → S02(행 클릭) → 느낌표 있는 날 확인 → S04(수정) → S02 Approve → (기간 전이면 S05)
  행복 경로(문제 없음): 메뉴 Time Clock 1 → Timesheets 탭 1 → 행 1 → Approve 1 = **약 4번(추정)**
  예외: 승인 버튼이 없음(권한 없음 또는 사용자 지정 날짜 범위, C2) / 기간이 안 끝남(경고, C2) / 자기 타임시트(자기 승인 제한, C3) / 승인 뒤 고칠 것 발견 → F04.
- **F02 문제(Issues) 있는 날 처리**
  S02 Issues 열 느낌표 → (충돌이면 S03) → S04에서 퇴근 시각 추가 또는 요청 승인/거절 → 또는 "무시"
  행복 경로: 느낌표 날 1 → 항목 1 → 수정·저장 1~2 = **약 3~4번(추정)**
  예외: 자동 퇴근(실제 시간 아님, C1), 빈 근무일(설정 켰을 때만, C1), 무시한 문제 되돌리기는 승인 권한 필요(C1), 잠긴 날(먼저 해제, C11).
- **F03 날짜 단위 잠금(일부만 확정)**
  S02 날짜 위 마우스 → 자물쇠 1번 / 여러 날: 날짜 선택 → 아래 Actions → Lock
  행복 경로: 1번(단일) / 선택 n + 2번(일괄) **(추정)**
  예외: 잠긴 날은 출근 기록·메모 수정까지 막힘(C11·C12).
- **F04 다시 열기(승인 취소)**
  S02 Approve 옆 점 3개 → Reopen / 날짜는 자물쇠 위 마우스 → 해제
  행복 경로: **2번(추정)**. 예외: reopen 권한 없음(C3). 날짜 해제는 전체 승인 상태를 바꾸지 않음(검색 요약).
- **F05 여러 사람 한꺼번에 승인·내보내기**
  S01 행 체크(또는 전체) → Actions → Approve / Export → S06
  행복 경로: 전체 선택 1 → Actions 1 → Approve 1 = **3번(추정)**
  예외: 일부 사람에 문제가 남아 있음 — 막는지 여부 근거 없음(11절).
- **F06 직원이 휴대폰에서 제출·수정 요청**
  S10 → 점 3개 → Submit / 근무 → 수정 → 메모 → 승인 요청
  행복 경로: Time Clock 1 → Timesheets 1 → 점 3개 1 → 제출 1 = **4번(추정)**
  예외: 승인·잠긴 뒤에는 고칠 수 없음(C12), 고치면 제출이 취소된다는 안내(검색 요약).
- **F07 관리자 휴대폰 승인**
  S09: Admin 탭 → Time Clock → Timesheets → 직원 → 승인 = **약 5번(추정)**. 예외: 자기 승인 제한(C3).
- **F08 (Factorial) 경고 많은 사람부터 보기**
  S11 Alerts 열 정렬 또는 필터(유형) → 직원 행 → 개인 타임시트 = **약 3번(추정)**. 예외: 정책에서 규칙이 꺼져 있으면 열이 비거나 안 보임(F2). 경고가 있어도 승인 가능(F1).

흐름 수: **8**.

## 5. 부품

| 부품 | 변형·상태 | 쓰는 화면 | 근거 |
|---|---|---|---|
| 기간 선택기 | 급여 주기 프리셋 / (휴대폰) 사용자 지정 범위. 웹은 사용자 지정에서 승인 불가 | S01 S02 S09 S10 | C2 C13 |
| 요약 표(사람별 1줄) | 열 선택기로 열 켜고 끄기, Daily Totals 토글 | S01 S11 | C5 F1 |
| 날짜별 타임시트 표 | 날짜 행, 일·주 합계 열, Issues 열 | S02 | C6 |
| 문제 표시(날짜별 느낌표) | 있음/없음, 무시됨 | S02 S10 | C1 |
| 경고 배지(건수) | 빨간 배지 + 숫자, 유형별 필터 | S11 | F1 |
| 한도 초과 숫자 강조 | 일 한도 넘으면 빨간 숫자 | S02 | C6 |
| 수정 표시 점 | 파란(관리자가 만든 항목), 주황(수정됨, 마우스 올리면 누가·언제) | S02 | C9 |
| 자물쇠 아이콘 | 마우스 올리면 나타남 / 잠김 / 해제 | S02 | C3 C11 |
| 승인 버튼 + 더보기(점 3개) | 승인 / 승인됨 / Reopen / 권한 없으면 숨김 | S02 S09 | C3 C11 |
| 제출 버튼 | 제출 전 / 파란 Submitted | S10 | C13 |
| 일괄 작업 바(Actions) | 행·날짜 선택 후 아래쪽 메뉴(문서마다 위치 묘사 다름) | S01 S02 | C7 C8 |
| 충돌 버튼·패널 | 빨간 버튼, 열린/기록 탭 | S02 S03 | C4 |
| 메모·첨부 칸 | 오른쪽 끝, 잠기면 편집 불가 | S02 S04 | C6 C11 |
| 확인 대화상자 | 기간 전 승인 경고 | S05 | C2 |
| 내보내기 형식 선택 | 급여 합계 / 타임시트 Excel·PDF / 근무 보고서 / 감사 기록, 합치기·따로 | S06 | C5 C7 C9 |
| 필터 영역(Factorial) | 왼쪽 위, 검토 상태·경고 유형 | S11 | F3 |

부품 수: 16.

## 6. 빈·오류 상태(근거 있는 것만)

| 상태 | 화면 | 내용(검색 요약) | 출처 |
|---|---|---|---|
| 승인 버튼 없음 | S02 | 권한 설정에서 빠졌거나, 사용자 지정 날짜 범위를 보고 있을 때 | C2 |
| 기간 전 승인 | S05 | 경고 후 그래도 승인 / 취소 | C2 |
| 잠긴 날 편집 시도 | S02 S04 | 메모 포함 모든 수정 불가, 다시 열기·해제 필요 | C11 |
| 잠긴 날 출근 시도(직원) | S10 | 출근 기록 불가 | C12 |
| 자기 승인 제한 | S02 S09 | 다른 관리자가 승인해야 함(소유자 예외) | C3 |
| 자동 퇴근 | S02 | 실제 시간 아닐 가능성 → 문제로 표시 | C1 |
| 빈 근무일 | S02 | 설정 켰을 때만 문제로 표시(기본 꺼짐) | C1 |
| 경고 열이 안 보임(Factorial) | S11 | 근태 기능·정책 규칙 켜졌는지 확인 | F2 |
| 화면 자체가 빈 상태(사람 0명, 기록 0건)·로딩 | — | **근거 없음** | — |

## 7. 추정 데이터 모델

| 엔터티 | 필드(추정) | 근거 | 확신도 |
|---|---|---|---|
| TimeEntry(근무 항목) | id, user_id, date, start_at, end_at, breaks[], job, note(관리자 메모), attachments, created_by_admin(파란 점), edited_by/edited_at(주황 점), auto_clock_out(bool) | C1 C6 C9 C11 | 중 |
| Timesheet(사람×급여 주기) | user_id, period_start, period_end, status(열림/제출됨/승인됨), submitted_at, approved_by, approved_at, reopened_by | C3 C13 C17 | 중 |
| DayLock(날짜 잠금) | user_id, date, locked_by, locked_at — 기간 승인 시 전체 날짜 잠금, 날짜별 해제는 승인 상태와 별개 | C3 C11 | 중(별도 엔터티인지 Timesheet 속성인지는 추정) |
| Issue(문제) | user_id, date, type(conflict / pending_timesheet_request / pending_time_off / auto_clock_out / empty_working_day), status(열림/무시됨) | C1 | 중 |
| Conflict | type(overlapping_shift / overlapping_break / overlapping_time_off), entries[], status(열림/기록) | C4 | 중 |
| TimesheetRequest(수정 요청) | user_id, entry_id, 변경 내용, 메모, status(대기/승인/거절) | C1 C13 | 중 |
| PayrollPermission | approvers[], reopeners[], self_approval_restricted(bool) | C2 C3 | 중 |
| AuditLog | 내보내기로만 확인, 포함 필드 미상 | C9(모순) | 낮음 |
| (Factorial) Alert | employee_id, date, type(missing_clocking / missing_clock_out / missing_break / insufficient_break), 정책 규칙에서 생성, 승인 차단 안 함 | F1 F2 | 중(유형 이름이 문서마다 다름) |

## 8. 디자인 측정

사진·실제 화면을 보지 못했으므로 **크기·간격·글자 크기·열 너비 수치는 모두 측정 불가**. 색·브랜드는 범위에서 뺐다. 도움말 요약으로 알 수 있는 배치·위계만 적는다.

- **요약 표(S01):** 행 = 사람 1명, 열 = 합계들(총시간, 정규, 초과, 유급휴가). 요일별 열은 선택해서 켬(기본은 합계만인 듯 — 추정). 열은 사용자가 고름.
- **개인 타임시트(S02):** 행 = 날짜(하루에 근무 항목 여러 개 가능), 열 = 항목 시간 → Daily total → Weekly total → 정규·초과 → **Issues** → 오른쪽 끝 메모·첨부. 즉 **문제 표시는 날짜 행 안의 전용 열**에, 메모는 맨 오른쪽.
- **합계 위치:** 일 합계는 각 날짜 행에, 주 합계는 주 단위 열에(행 끝 묶음인지 별도 행인지는 미확인). 기간 합계는 S01 요약 행.
- **주요 동작 위치:** 승인은 **오른쪽 위**, 다시 열기는 승인 옆 점 3개 메뉴. 충돌 버튼은 타임시트 **위쪽**. 일괄 작업 메뉴는 선택 뒤 **아래쪽**(한 문서) / "Actions 탭"(다른 문서) — 불일치.
- **문제 강조 방식:** 날짜별 느낌표 아이콘, 한도 초과는 숫자 색, 수정은 작은 점(마우스 올리면 상세). 정보를 칸 안의 작은 기호 + 마우스 올림으로 숨기는 위계.
- **고정 열:** 이름 열·합계 열을 가로 스크롤 때 고정하는지 **근거 없음(측정 불가)**.
- **Factorial(S11):** 직원 행 + Alerts 열에 **건수 배지**, 필터는 **왼쪽 위**. "어느 날"이 아니라 "몇 건"을 사람 단위로 먼저 보여 주고 정렬로 우선순위를 만든다.
- **휴대폰(S09·S10):** 기간 선택이 위, 점 3개 메뉴에 제출·PDF. 날짜 목록 형태로 추정(사진 없음).

## 9. 리뷰 불만 Top (타임시트·승인·잠금 관련)

**표본에 대한 정직한 설명:** 리뷰 원문을 한 건도 직접 읽지 못했다. 아래는 WebSearch가 G2·Capterra·Software Advice·GetApp·경쟁사 리뷰 페이지를 요약한 내용이다. **인용문 없음.** G2·Capterra가 보여 준 "N reviews" 숫자는 그 사이트 AI 요약 테마에 붙은 숫자로, 내가 센 것이 아니다. App Store·Reddit 검색은 관련 결과가 0건이었다. 그러므로 아래는 "테마가 있다는 신호"이지 순위를 믿을 만한 통계가 아니다.

| 순위 | 테마 | 근거(검색 요약) | 근거 출처 수 | 링크 | 두께 |
|---|---|---|---|---|---|
| 1 | 관리자 휴대폰 기능이 데스크톱보다 모자람(권한·관리자/사용자 화면 전환, 일부 기능 없음) | Capterra 개별 리뷰 1건(일정 편집 불가로 이탈), Software Advice·GetApp 테마 요약 | 3 | R2 R3 R4 | 보통 |
| 2 | 타임시트 일괄 수정·되돌리기·**변경 추적이 분명하지 않음** | Software Advice 테마 요약, 도움말 C9(전체 수정 이력 못 봄)과 일치 | 1(+도움말) | R3 C9 | 얇음 |
| 3 | 시간기록 사용성·화면 명료성·급여 예외 처리 개선 필요 | G2 테마 요약(사이트가 약 280건으로 표시) | 1 | R1 | 얇음(한 사이트) |
| 4 | 알림이 늦거나 안 오거나 너무 많음 | Capterra 테마(301건 중 64% 부정으로 표시)·개별 리뷰 요약 | 1 | R2 | 얇음(한 사이트) |
| 5 | 내보내기 서식 문제, 일별 시간 보기 맞춤 제한 | Capterra 타임시트 요약 | 1 | R2 | 얇음 |
| 6 | 자동 퇴근 뒤 직원이 고치고 관리자가 다시 승인하는 수고 / 퇴근 알림 부족 | 경쟁사 블로그 경험담 1건, Capterra 개별 리뷰 1건(교대 길이 넣고 퇴근 알림 받고 싶다) | 2 | R6 R2 | 얇음 |
| 7 | 잠금 후 고칠 수 없음 → 다시 열기 권한자 찾아야 함(직원 출근까지 막힘) | 리뷰가 아니라 **도움말에 문제 해결 글이 따로 있을 만큼 자주 묻는 일**이라는 간접 신호(C11·C12·C2) | 0(리뷰) | C2 C11 C12 | 간접 |

(긍정 쪽도 있다: Capterra·GetApp 요약은 "수정이 쉽고 급여 처리 시간을 줄인다"는 평이 많다고 함. 경쟁사(Clockify) 리뷰는 편향이 있어 테마 근거에서 뺐다.)

테마 수: **7**(이 중 6은 리뷰 근거, 1은 간접).

## 10. 우리 앱이 피할 것 / 더 잘할 것

맥락: 출결 담당 교사 1~2명이 학사생 약 180명 × 그 달 날짜의 격자를 정리. 기호 ○ × △ 조, 특이사항 메모. 합계(지각·조퇴·결석·OUT). PC는 격자, 휴대폰은 학생별 줄 목록. 감사 기록 필수, 삭제 대신 취소, 실시간 없음.

**빌려 올 것**
1. **"문제 있는 날" 전용 표시를 칸 안에.** Connecteam은 날짜 행마다 Issues 표시, Factorial은 사람 행에 **건수 배지**. 우리 격자: 칸에는 기호만, 문제(예: 사전 특이사항과 실제 기호 충돌, 기호 비어 있음, 미인정 지각인데 OUT 미반영)는 칸 모서리 표시 + **학생 행 끝 "확인 필요 n" 열**. 정렬·필터로 "확인 필요 많은 학생부터".
2. **문제 유형을 소수로 고정.** Factorial처럼 4개 안팎의 이름 붙은 유형(예: 기록 없음 / 사전 특이사항과 다름 / 메모 없는 조퇴(결정 38: 사유는 메모 칸) / OUT 자동 반영 대기). 유형 목록은 `docs/contracts/vocabulary.md`에 총괄이 확정해야 함 — 여기서는 제안만.
3. **경고가 확정을 막지 않음(Factorial) vs 막음.** 학교에서는 "확인 필요가 남아 있으면 확정 전 한 번 확인 대화상자"가 맞아 보인다. ASSUMPTION — 총괄 결정 필요.
4. **기간 확정 = 잠금, 다시 열기는 권한자만, 날짜별 잠금도 가능.** 우리: 월(또는 주) 확정 시 그 범위 격자 잠금, 다시 열기는 관리자. 잠금·해제 모두 `audit_log`.
5. **자기 승인 제한 개념.** 기록한 교사와 확정하는 교사를 나눌지 — 6~8명 소규모라 선택 사항(could).
6. **휴대폰은 같은 데이터의 다른 모양.** Connecteam 직원 앱은 기간 + 날짜 목록. 우리: 학생 1명 = 1줄(이름 · 이번 달 지각/조퇴/결석/OUT · 확인 필요 n), 누르면 그 학생의 날짜 목록.

**피할 것 / 더 잘할 것**
1. **수정 이력이 점과 마우스 올림뿐인 것(C9) → 피한다.** 마우스가 없는 휴대폰에서 못 봄. 우리: 칸을 누르면 "누가·언제·무엇을(이전 값 → 새 값)·왜"가 바로 보이는 이력 목록, 원천은 `audit_log`. 취소된 기록도 줄 그어 보이게.
2. **잠긴 뒤 메모조차 못 고치는 것(C11) → 개선 후보.** 확정 후에도 "추가 메모(덧붙임)"는 허용하고 원래 값은 그대로 두는 방식 검토. ASSUMPTION — 총괄 결정.
3. **사용자 지정 범위에서 승인 버튼이 사라지는 것(C2) → 이유 없이 숨기지 않는다.** 버튼은 보이되 비활성 + "확정은 월 단위로만 할 수 있어요" 같은 이유 한 줄. (권한 판정은 서버에서, 화면 숨김은 보안 아님 — CLAUDE.md 3.)
4. **승인=잠금이 한 버튼에 묶여 의도 밖 잠금이 생기는 것 → 버튼 이름에 결과를 쓴다**("이번 달 확정(잠금)"), 확인 대화상자에 잠기는 범위·학생 수 표시.
5. **이름 열·합계 열 고정.** Connecteam 근거 없음 → 우리 쪽 요구로 명시: PC 격자에서 가로 스크롤 시 왼쪽 학생 이름, 오른쪽 지각·조퇴·결석·OUT 합계 고정. 180행이므로 머리글 행도 고정.
6. **삭제 없음.** Connecteam 편집은 값 덮어쓰기로 보임(추정). 우리: 기호 변경은 새 기록 + 이전 기록 `status=취소`, `audit_log`.
7. **일괄 작업은 "확정"과 "내보내기"만.** Connecteam 일괄 메뉴엔 채팅·과제까지 섞임. 우리는 줄인다(ponytail).
8. **실시간 없음 명시.** 다른 교사가 같은 칸을 고쳤으면 저장 시 서버가 충돌을 알리고 새로고침 안내(LockService + 갱신 시각 비교). Connecteam 쪽 근거는 없음 — 우리 요구.
9. **문제 표시를 색에만 기대지 않기.** 빨간 숫자·빨간 배지 대신 기호/글자 + 색(인쇄 출석부·색각 고려).
10. **자동 퇴근에 해당하는 것: 23:00 종료 자동 채움**은 "자동으로 채운 값"임을 칸에 표시(Connecteam이 자동 퇴근을 문제로 띄우는 것과 같은 생각).

## 11. 확인 못 한 것

- **도움말 원문 전부.** help.connecteam.com이 이 세션 네트워크에서 막혀 WebFetch 실패. 모든 Connecteam·Factorial 내용은 검색 요약이다. 원문 확인에는 세션 네트워크 설정에서 help.connecteam.com, help.factorialhr.com 허용이 필요.
- **화면 사진 0장.** 열 순서·너비·고정 열·글자 크기·휴대폰 배치·빈 상태·로딩 상태 모두 미확인.
- **모순:** (a) 수정 이력 — "전체 이력 못 봄(점만)" vs "감사 기록 내보내기 가능"(C9 요약 두 갈래, 시기 차이 추정). (b) Factorial 유형 — 4개(Missing Clocking/Clock-Out/Break/Insufficient Break, F1) vs 3개(Missing Clock-In/Clock-Out/Break Time, F2). (c) Alerts 열이 총 건수인지 유형별인지. (d) 일괄 Actions 위치(아래쪽 vs 탭). (e) 휴대폰 관리자 승인 단계 요약이 섞여 있음(Reopen과 혼동).
- **문제가 남아 있을 때 Connecteam 승인이 막히는지** — 근거 없음(Factorial은 막지 않음).
- **월 단위 보기:** Connecteam은 "급여 주기" 단위. 월 주기 설정 가능 여부, 달력형 월 격자(사람×날짜) 화면 존재 여부는 미확인. Daily Totals 토글이 사람×요일 열이라 가장 가깝다.
- **리뷰 원문·표본 수:** 원문 0건 직접 읽음, App Store·Reddit 결과 0건. G2·Capterra 숫자는 사이트 요약의 숫자.
- **요금제 제한:** 충돌 기능 Expert부터 외에는 미확인.
