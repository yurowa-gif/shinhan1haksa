# HR 근태관리 레퍼런스 — 학사 관리를 "인사·총무팀 근태 대시보드"로 보면

> 2026-11-21 자료조사 세션(W3). 선생님 말씀: "이게 학생 기숙사 관리지만 사실 본질적으론 회사의 인사 총무팀을 위한 근태관리 대시보드 관점이란 말이야? 거기서 유명한 앱이나 사이트의 UI UX 레퍼런스로 조사해줘봐"
> 근거는 각 제품의 **공식 도움말·제품 소개**를 웹 검색으로 찾은 것이다. 본문을 직접 열지 못하고 검색 요약으로만 본 것은 **(요약 확인)**, 찾지 못한 것은 **미확인**.
> 이미지·로고는 저장소에 넣지 않는다. 링크만 둔다. 구조·배치 일반 원칙은 `docs/design/references.md`, 기기 문제는 `docs/design/device-compat.md`.

---

## 0. 우리 앱에 바로 옮길 패턴 Top 10

| 순위 | 패턴 | 대상 화면 | 기대 효과 | 난이도 | 근거 |
| --- | --- | --- | --- | --- | --- |
| **1** | **오늘 예외만 보이는 대시보드** — 맨 위 "처리할 것" 숫자 몇 줄(확인 대기 N, 오늘 빠지는 학생 N, 복귀 예정일 지남 N, 서류 미제출 N)과 바로가기. 기능 카드는 아래 목록·PC 왼쪽 메뉴로 내린다 | `home_admin`(지금 카드 약 18장), `home_attendance` | 홈을 열면 할 일이 먼저 보인다. "기능 소개판" → "오늘 처리판" | 중 | flex 근태 대시보드(누락 구성원만 걸러 리마인드), 네이버웍스 출퇴근 현황(지각·조퇴·부재를 일자별 한눈에), Gusto 홈 "Important tasks" |
| **2** | **요청 승인함** — 화면마다 흩어진 "요청"을 한 목록에. 내가 처리할 것이 맨 위, 줄마다 ✓ 확정 / ✕ 반려, 여러 줄 골라 한꺼번에 | 새 화면(가칭 "확인함"): 사전 특이사항 요청, 시간표 확인, 급식·입퇴실 신청 확인 | 출결 담당·담당교사가 여러 화면을 돌지 않는다 | 중상(서버 일괄 처리 API, 줄마다 권한·감사 기록) | When I Work "Requests I Can Approve", BambooHR Inbox·홈 위젯 ✓/✕, Rippling Bulk Approve |
| **3** | **문제 없는 것만 한꺼번에 확정** — "모두 확정"과 별도로 "경고 없는 것만 확정". 확인 시트에 "확정 N건 · 남김 M건(정원 초과 1, 서류 미제출 2)" | 승인함, 출결 결과 정리 | 위험한 줄을 실수로 함께 확정하지 않는다 | 중 | Deputy "Approve all timesheets with no issues" |
| **4** | **타임시트형 월간 격자** — 정상 칸은 비우고 예외(×·△·조·특이사항 약어)만 표시, **이름 열·합계 열 고정**(지각·조퇴·결석·OUT 합) | 출결 결과, 학생별 한 달 보기(PC) | 한 달에 누가 문제인지 한 화면에서 보인다 | 중 | Factorial 타임시트 "알림" 열(오류 4종), Connecteam 문제 있는 날 표시, flex 실제 기록·인정 시간 구분 |
| **5** | **모바일 첫 화면 "내 상태 한 장"** — OUT 0/2 · 이번 주 출결 N건 · 석식 상태 · 다음 할 일(시간표 내기) | 학생·학부모 포털 맨 위 | 학생·학부모가 스크롤 없이 상태를 안다 | 하 | Workday 모바일(유형별 잔여·신청 이력), HiBob 모바일(요청 상태·잔여), 원티드스페이스(출퇴근·잔여 연차·휴가 신청) |
| **6** | **빠진 사람 찾기 + 알림 보내기** — 미제출 학생 목록 옆에 [알림 보내기] | 담당교사·출결 담당 홈(시간표 미제출, 서류 미제출, 6단계 진로 프로필 미제출) | 교사가 하나씩 찾아 연락하지 않는다 | 중(MailApp은 이미 씀) | flex 누락 구성원 리마인드(이메일·앱 알림), Factorial 오류 알림 메일 |
| **7** | **처리할 요청 수 배지** — 홈 카드 제목·PC 왼쪽 메뉴 옆에 "확인 대기 3" | 모든 교사 홈, (PC) 메뉴 | 어디서나 밀린 일을 안다 | 하 | When I Work 알림 종 배지, BambooHR "What's Happening" |
| **8** | **마감·잠금** — 월말 집계를 "마감"하면 이후 변경은 경고 + 사유 | 월말 근무 기록표, 식수 집계, 출결 결과 | 이미 보고한 숫자가 몰래 바뀌지 않는다 | 중(**규칙 결정 필요**) | Homebase·Connecteam 급여 전 타임시트 잠금, 원티드스페이스 근태 집계 마감 기간 |
| **9** | **오늘 누가 빠지나(Who's out)** — 시간대 순 한 줄 목록(학·가·병결) | 근무교사 홈("오늘·내일 특이사항" 다듬기) | 감독 중 출석부와 대조가 빠르다 | 하 | BambooHR Who's Out 위젯, Workday 팀 부재 달력 |
| **10** | **규칙 위반만 결재로** — 조건에 맞는 요청은 바로 확정, 예외만 요청함으로 | 사전 특이사항(예: 고정 일정에 이미 있는 학원은 바로 확정) | 출결 담당이 볼 양이 준다 | 상(**선생님 결정 필요**, PRD 13절 성격) | Personio "규칙 위반 근태만 승인" 워크플로(조건에 안 맞는 제출은 자동 승인) |

> 1~5가 총괄 요청 ①~④에 해당한다(①=1, ②=2·3, ③=4, ④=5). 8·10은 규칙을 바꾸는 일이라 선생님 결정 전에는 화면 시안까지만.

---

## 1. 대응표 — 우리 기능 ↔ HR 근태 개념

| 우리 기능 | HR 근태 개념 | 그쪽 제품이 보통 보여 주는 것 | 우리에게 다른 점 |
| --- | --- | --- | --- |
| 출석부 격자(F2) | 타임시트·출퇴근 기록 | 사람 × 날짜 표, 출근·퇴근 시각, 오류 표시, 합계 | 우리는 **시각이 아니라 칸(교시) 기호**(○×△조). 종이 출석부가 원본이고 앱은 결과 정리 |
| 사전 특이사항·출결 결과(F1·F11) | 휴가·근태 예외 신청과 승인함 | 신청 → 승인/반려, 상태(대기·승인·반려), 승인자 | 신청자가 학생이 아니라 **교사(담임·담당)**, 확정자는 출결 담당 |
| 지각·조퇴·결석 누적, 학습량 | 근태 통계·근무시간 집계 | 기간별 합계, 초과·미달, 리포트 내보내기 | 시간 합계보다 **횟수**가 중요(자동 1OUT 연결) |
| OUT 2회 → 퇴실(F4) | 경고·징계 포인트 | (근태 제품엔 드묾 — 인사 평가·징계 기록 쪽) | 학기마다 초기화, 2OUT = 면담 → 퇴실 확정 |
| 근무표·교대(F3) | 근무 스케줄·교대(스왑) 요청 | 주간 스케줄 격자, 빈 근무, 스왑 요청 → 관리자 승인 | **교대는 승인 없음**(알림만) |
| 급식 신청·식수(F7) | 식대·복리후생 신청 | 신청서·정산 | 적용일 규칙(11:30·수요일 마감)이 복잡. 식수 집계가 급식실 보고로 이어짐 |
| 시간표 제출 → 학부모 동의 → 교사 확인 | 다단계 결재(결재선) | 기안 → 결재자 순서 → 완료, 반려 시 되돌림 | 결재자 중 한 명이 **학교 밖 사람(학부모)** |
| 학생·학부모 포털(F14) | 직원 셀프서비스(ESS) 앱 | 내 근무·잔여 휴가·신청 상태·급여 명세 | 학부모는 **대리인**(자녀 여러 명 전환) |
| 상담일지(F12·F17) | 1:1 면담 기록 | 면담 메모, 다음 할 일 | 상담 내용은 교사만, 합의 사항만 학생에게(CLAUDE.md 6번) |
| 서류 체크리스트 | 입사 서류(온보딩) 체크리스트 | 제출·미제출, 기한, 알림 | 급식·입퇴실 신청마다 서류가 붙음 |
| 감사 기록(audit_log) | 변경 이력 | 누가 언제 무엇을 바꿨는지 | 같다. 우리는 **삭제 대신 취소**(CLAUDE.md 4번) |

---

## 2. 국내 제품

| 제품 | 무엇을 어떻게 보여 주나 | 빌릴 것 | 안 맞는 것 | 근거 |
| --- | --- | --- | --- | --- |
| **flex(플렉스)** | 관리자 **근태 대시보드**: 기간·날짜·근무유형·조직 범위로 "근무 시간 누락·휴가 증빙 누락 구성원"을 걸러 보고 **리마인드**(이메일·앱 알림)를 보낸다. 고정 근무는 출근 시각 기준으로 지각 판정. 구성원 "내 근무"는 일별 타임라인에서 **실제 기록과 인정 근무 시간을 구분** | 누락만 거르는 필터 + 한 번에 알림(Top 6). "실제 vs 인정" 구분 → 우리 "출석부 기호 vs 확정 특이사항" | 근무 시간·초과근무 정산 중심 | [근태 대시보드](https://intercom.help/flex-team-guide/ko/articles/10285299), [내 근무 조회](https://intercom.help/flex-team-guide/ko/articles/10283607), [초과 근무시간](https://intercom.help/flex-team-guide/ko/articles/10289142) |
| **시프티(Shiftee)** | 출퇴근·휴게 기록과 **근태 현황 조회**, 근태·커스텀 **요청 유형별 승인 규칙**, 근태 집계·정산 리포트. 모바일에서 이번 주 총 근로·연장·야간 시간을 한 번에 | 요청 유형마다 승인자·규칙을 따로(우리: 특이사항 유형별 확정자) | 교대 근무·위치 기반 출퇴근 기능은 학교에 불필요. 화면 구성은 도움말 목차만 확인(미확인) | [도움말 센터](https://shiftee.io/ko/help), [근태](https://shiftee.io/ko/help/article/attendance), [앱 소개](https://apps.apple.com/KR/app/id1170002741) |
| **알밤** | 관리자 앱: 근무일정표에 직원 배치, 출퇴근 **실시간 현황**. 직원 앱: 근무기록 확인 → 관리자에게 **수정 요청**. 연장근무 사전 승인 요청(2019년 기사) | "기록 수정 요청" 흐름(우리: 학생·학부모가 출결 기록 이의 → 담당교사) | 대타 요청 기능은 확인 못 함(미확인). 소상공인 시급 정산 중심 | [벤처스퀘어 기사](https://www.venturesquare.net/777556/) (요약 확인), [앱 소개](https://apps.apple.com/kr/app/id6478902206) |
| **네이버웍스** | 관리자 메뉴 → 근태 현황 → **출퇴근 현황·근로 시간 현황**. 부서별로 출퇴근 시각, **지각/조퇴, 의무 근로시간 미준수, 근무 계획 여부, 부재**를 **일자별로 한눈에**. 출퇴근 기록 출처를 "결재(신청서 상신)"·"관리자 등록"으로 구분 | 기록마다 **출처 표시**(우리: 교사 입력 / 자동 1OUT / 명단 업로드). 일자별 예외 한눈에 → Top 4 | 관리자 메뉴가 깊다(관리자 메뉴 → 팝업 → 근태 → 근태 현황) — 우리는 2단계 깊이 | [근태 현황(관리자)](https://help.worksmobile.com/ko/admin-guides/attendance/attendance-status/), [HR팀 가이드북 PDF](https://naver.worksmobile.com/wp-content/uploads/2025/10/251001_Guidebook-for-the-HR-Team.pdf) |
| **원티드스페이스** | 모바일: 버튼 한 번 출퇴근, **팀 근태 현황 한눈에**, 잔여 연차 확인·휴가 신청. 관리자 기능은 PC 웹 대시보드. 근태 집계 **마감 기간** 설정, 엑셀 내려받기(비교 글) | 모바일 = 개인 상태 + 신청, PC = 관리(우리 역할 나눔과 같음). 마감 기간 → Top 8 | 출퇴근 버튼(위치 인증) 불필요 | [앱 소개](https://apps.apple.com/kr/app/id1472331759), [근태 솔루션 비교(flow)](https://platform.flow.team/blog/attendance-management-solution-comparison) (2차 자료) |
| **다우오피스·카카오워크(근태)** | 공개 도움말에서 근태 화면을 찾지 못함 | — | — | **미확인** |

## 3. 해외 제품

| 제품 | 무엇을 어떻게 보여 주나 | 빌릴 것 | 안 맞는 것 | 근거 |
| --- | --- | --- | --- | --- |
| **Deputy** | 타임시트 승인 화면에서 **"모두 승인"(경고 포함)과 "경고 없는 것만 승인"을 따로**. 아무것도 고르지 않으면 지금 보이는 사람들 전체가 대상. 모바일도 전체 선택 → 승인. "모두 승인"은 시스템 관리자가 켜야 보임 | Top 3. "지금 보이는(필터된) 사람 전체"가 일괄 대상이라는 규칙 | 급여 연동 전제 | [Approving your team's timesheets](https://help.deputy.com/hc/en-au/articles/6997348381327), [Approve Timesheets 화면](https://help.deputy.com/hc/en-au/articles/6997363402895), [권한](https://help.deputy.com/hc/en-au/articles/13841429485967) |
| **When I Work** | 웹: 메뉴 → Shift Requests → **"내가 승인할 요청" / "전체 요청"** 두 보기. 왼쪽 위 **알림 종에 개수 배지**. 모바일: Shift Requests 대시보드 카드, **승인이 필요한 요청을 목록 맨 위로**. 설정에서 "교대 승인 필요"를 끄면 승인 없이 처리 | Top 2·7. "승인 필요 여부를 설정으로"는 우리 결정(교대는 승인 없음)과 같은 구조 | 시급·교대 마켓 중심 | [Processing Shift Requests(웹)](https://help.wheniwork.com/articles/processing-shift-requests-computer), [(아이폰)](https://help.wheniwork.com/articles/processing-shift-requests-iphone) |
| **Homebase** | 관리자가 타임시트에서 **누락 타각·예상 밖 초과근무·오류**를 확인 후 승인, 급여 전에 **잠금**. 목록에 직원별 경고(퇴근 누락, 휴게 누락, 일정 초과) 표시. 퇴근할 때 휴게 누락을 직원에게 바로 묻기 | 목록 줄마다 경고 아이콘 + 이유(Top 4). 잠금(Top 8). "입력할 때 바로 묻기"(우리: 저장 전 확인 시트) | 도움말 원문 못 찾음, 제품 소개·용어집 기준(요약 확인) | [Timesheet approval(용어집)](https://www.joinhomebase.com/glossary/timesheet-approval), [타임시트 승인 블로그](https://joinhomebase.com/blog/new-homebase-timesheet-approvals/) |
| **Connecteam** | 타임시트에서 **문제 있는 날에 표시**(issue indicator), 모바일은 표시된 날을 눌러 확인. 승인은 ⋯ 메뉴 → Approve. 자기 타임시트는 스스로 승인 못 하게 막을 수 있음. 승인 뒤 잠금 | 날짜 칸 표시(Top 4). **자기 승인 금지**(우리: 본인이 넣은 요청을 본인이 확정하지 않게 — 결정 필요) | | [Timesheet issues](https://help.connecteam.com/en/articles/9051621-timesheet-issues), [승인 오류 해결](https://help.connecteam.com/en/articles/9545686-troubleshooting-errors-in-timesheet-approval), [승인·잠금](https://help.connecteam.com/en/articles/5439640-approving-employee-timesheets-for-payroll) |
| **BambooHR** | **Inbox** 요약에 내가 승인할 요청, 열어서 승인/반려. 홈 **What's Happening** 위젯에서 ✓ 승인 / ✕ 반려 바로. 알림 메일에도 승인·반려 버튼. **Who's Out** 위젯·달력 | Top 2(목록에서 바로 ✓/✕), Top 9(Who's out) | 메일 안 버튼 승인은 Apps Script에서 링크 서명이 필요해 어렵다(미적용 권장) | [The Inbox](https://bamboohr.screenstepslive.com/m/58956/l/747950-the-inbox), [Approve Time Off](https://bamboohr.screenstepslive.com/m/58956/l/788839-approve-time-off), [Who's Out 위젯](https://bamboohr.screenstepslive.com/m/53917/l/587585-who-s-out-widget) |
| **Gusto** | 요청이 오면 매니저에게 메일 + 홈 **"Important tasks"**에 "Time off requests" 카드. Time off 탭 → My Team's Time Off → **To Review** 거르기 → 요청 상세(잔여도 함께) → 메모(선택) → 승인 | 홈 "중요한 할 일" 카드(Top 1). 승인할 때 **잔여(우리: 이번 학기 특이사항 수·OUT)**를 옆에 보여 주기 | | [Manage employee time off for managers](https://support.gusto.com/article/101980064100000/Manage-employee-time-off-for-managers) |
| **Rippling** | 웹·모바일에서 휴가 요청 승인, **Bulk Approve**로 여러 건. 모바일: HR → Time Off → Approvals 탭 → My team | 일괄 승인(Top 2) | 공식 도움말 원문 못 찾음, 제3자 도움말 기준(요약 확인) | [제3자 도움말(2025-11)](https://finni.help.usepylon.com/articles/1634595385-viewing-and-approving-employee-time-off-requests-and-balances-on-rippling) |
| **Factorial** | 타임시트 오류 **알림 4종**(타각 없음, 퇴근 없음, 휴게 없음, 휴게 부족)을 근태 개요의 **열**로 표시, 직원이 자기 출근 화면에서 고침, 승인자·HR에게 메일. "알림이 있으면 승인 금지"는 강제하지 않고 내부 규칙에 맡김 | Top 4(예외 열). "월말이 아니라 그때그때 고치게" | 강제 없음(우리는 저장할 때 막을지 결정 필요) | [Proactively catch timesheet errors](https://help.factorialhr.com/en_US/proactively-catch-timesheet-errors-with-alerts), [About time tracking alerts](https://help.factorialhr.com/en_US/about-time-tracking-alerts) |
| **Personio** | 관리자가 **승인 워크플로**를 규칙으로 만든다. 대표 템플릿 "**근무 규칙 위반 근태만 승인**". 조건에 안 맞는 제출은 **자동 승인**. 승인자는 Inbox에서 처리 | Top 10 | 규칙 엔진은 Apps Script 규모에 과함 — 조건 몇 개만 | [Set up attendance approval workflows](https://support.personio.de/hc/en-us/articles/20418710205341-Set-up-attendance-approval-workflows) |
| **HiBob** | 모바일: 휴가를 어디서나 요청, **요청 상태·잔여·취소**. 홈에 축하·신규 입사·생일 | Top 5(상태·잔여) | 사내 소셜 요소(생일 등)는 학교 업무 앱에 불필요. 홈 "Who's out" 위젯은 확인 못 함(미확인) | [Bob 모바일 새 기능(공식 블로그)](https://www.hibob.com/blog/new-stuff-bob-mobile) |
| **Workday(모바일 ESS)** | 모바일: 단기 휴가·장기 휴직 신청, **유형별 잔여**, **신청 이력**, 대기·승인된 요청 수정·취소. 팀 부재 달력. 매니저는 앱에서 승인·반려 + 사유 | Top 5·9. 반려할 때 **사유 입력** | 대기업 결재 복잡도 | [Absence tasks in Workday Mobile](https://doc.workday.com/admin-guide/en-us/manage-workday/tenant-configuration/mobile-setup/tasks-in-workday-mobile/reference--absence-management-tasks-in-workday-mob.html) |

---

## 4. 공통으로 안 맞는 점(그대로 가져오면 안 되는 것)

| 근태 제품의 흔한 기능 | 우리 앱에서 | 이유 |
| --- | --- | --- |
| 위치(GPS)·와이파이 출퇴근 인증, 얼굴 인식 | 쓰지 않는다 | 출석은 종이 출석부·근무교사 확인. 학생 위치 수집은 개인정보 부담 |
| 메일 안 버튼으로 바로 승인 | 쓰지 않는다(메일은 "앱에서 확인해 주세요" 링크만) | 메일 링크로 서버 동작을 하려면 서명·만료가 필요(PRD 6.1 3안 수준), 권한은 서버에서만 판정(CLAUDE.md 3번) |
| 실시간 현황(자동 새로고침) | 버튼으로 다시 불러오기 | CLAUDE.md "실시간 기능 없음" |
| 사진 아바타·사내 소셜(생일·칭찬) | 쓰지 않는다 | 학생 사진은 개인정보, 업무 앱 |
| 급여·초과근무 정산 | 근무 수당은 "월말 근무 기록표"로만 | 범위 밖 |
| 규칙 엔진(조건 조합 자유 설정) | 조건 몇 개를 설정 시트 값으로 | Apps Script 규모·관리 부담 |
| 한 화면 수백 명 표 | PC에서만, 휴대폰은 한 명씩 줄 목록 | 학사생 약 180명, 휴대폰 세로 우선 |

## 5. 확인 못 한 것

- 다우오피스·카카오워크 근태 화면(공개 도움말 못 찾음).
- 알밤의 대타 요청·승인 화면, 최신 화면(2019년 기사 기준).
- Homebase·Rippling 공식 도움말 원문(제품 소개·제3자 도움말로 대신).
- HiBob 홈의 Who's out 위젯 여부.
- 시프티 관리자 대시보드의 실제 배치(도움말 목차만).
- 제품 화면 사진은 보지 않았다(텍스트 도움말 기준). 배치의 세부(카드 크기·색)는 이 문서의 범위가 아니다.

---

## 5. 1단계 스크리닝 점수표(실제 제품)

> 2026-11-21 추가(총괄 W3 3단계 계획의 1단계). 기준 5개, 각 1~3점, 합계 15점.
> ⓐ 우리 핵심 조각(예외 승인·월간 격자·스케줄·모바일 본인 화면)과 맞음 · ⓑ 공개 근거 충분(도움말·공식 영상으로 화면 흐름을 다시 그릴 수 있음) · ⓒ 휴대폰 + PC 둘 다 · ⓓ 한국어·학교 같은 비IT 사용자 친화 · ⓔ 우리 규모(학사생 약 180명·교사 8명)에 맞는 단순함.
> 점수는 2~4절의 공개 근거로 매겼다. ⓑ가 1인 제품은 3단계(정밀 replica)에서 화면 흐름을 다시 그리기 어렵다.

| 순위 | 제품 | ⓐ 조각 | ⓑ 근거 | ⓒ 두 기기 | ⓓ 친화 | ⓔ 단순 | **합계** | 강한 조각 | 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Connecteam** | 3 | 3 | 3 | 1 | 3 | **13** | 월간 타임시트(문제 날 표시)·승인·잠금 | 현장 근무자용이라 단순. 영어 |
| 1 | **When I Work** | 3 | 3 | 3 | 1 | 3 | **13** | 요청 승인함·교대 스케줄·모바일 카드 | 소규모 매장용, 승인 필요 여부를 설정으로 |
| 1 | **flex** | 3 | 2 | 3 | 3 | 2 | **13** | 예외(누락) 대시보드·내 근무 | 국내·한국어. 도움말은 기능 설명 위주(흐름 일부만) |
| 1 | **시프티** | 3 | 2 | 3 | 3 | 2 | **13** | 요청 유형별 승인·스케줄·근태 현황 | 국내. 공개 도움말은 목차 수준(ⓑ 약함) |
| 5 | **Deputy** | 3 | 3 | 3 | 1 | 2 | **12** | 타임시트 일괄 승인("경고 없는 것만") | 도움말 상세 |
| 5 | **Factorial** | 3 | 3 | 3 | 1 | 2 | **12** | 월간 타임시트 예외 열·알림 | 오류 4종을 열로 |
| 5 | 네이버웍스 | 2 | 3 | 3 | 3 | 1 | 12 | 일자별 예외 한눈에·기록 출처 | 관리자 메뉴가 깊음(ⓔ 1) |
| 8 | 알밤 | 2 | 1 | 2 | 3 | 3 | 11 | 기록 수정 요청 | 공개 근거 적음 |
| 8 | 원티드스페이스 | 2 | 1 | 3 | 3 | 2 | 11 | 모바일 본인 화면·마감 | 공개 근거 적음 |
| 8 | Homebase | 3 | 1 | 3 | 1 | 3 | 11 | 타임시트 경고·잠금 | 공식 도움말 원문 못 봄 |
| 8 | BambooHR | 2 | 3 | 3 | 1 | 2 | 11 | 승인함(✓/✕)·Who's out | 타임시트보다 휴가 중심 |
| 12 | Workday(모바일 ESS) | 2 | 3 | 3 | 1 | 1 | 10 | 모바일 본인 화면(잔여·이력) | 대기업용 |
| 13 | Gusto | 2 | 2 | 2 | 1 | 2 | 9 | 홈 "중요한 할 일" | 급여 중심 |
| 13 | Personio | 2 | 3 | 2 | 1 | 1 | 9 | 규칙 위반만 결재 | 규칙 엔진은 과함 |
| 15 | Rippling | 2 | 1 | 3 | 1 | 1 | 8 | 일괄 승인 | 공식 도움말 못 봄 |
| 15 | HiBob | 2 | 1 | 3 | 1 | 1 | 8 | 모바일 상태·잔여 | |
| 15 | 다우오피스·카카오워크 | 1 | 1 | 2 | 3 | 1 | 8 | — | 공개 근태 화면 못 찾음(미확인) |

**후보 Top 6**(합계 → 같으면 ⓐ·ⓑ 순): **Connecteam · When I Work · flex · 시프티 · Deputy · Factorial**.
네이버웍스(12)는 ⓐ·ⓔ에서 밀렸지만 "기록 출처 표시"와 한국어 화면 근거가 좋아 2단계에서 보조 레퍼런스로 쓸 만하다.

**2단계에 넘길 메모(조각별 가장 강한 후보)**
- 승인함·예외 대시보드: When I Work(근거 3) / flex(한국어, 예외 필터)
- 월간 타임시트: Connecteam / Factorial / Deputy(일괄 승인)
- 모바일 본인 화면: When I Work·Connecteam(모바일 우선) / 원티드스페이스·Workday(근거 차이 큼)
- 국내 제품(flex·시프티)은 ⓑ가 2라 3단계에서 화면 흐름을 다시 그릴 때 공식 영상·앱스토어 설명으로 보충해야 한다.

## 6. 시안 레퍼런스(Behance·Dribbble) — 실제 제품과 구분

> 선생님이 준 링크: [Behance "HR platform ui design"](https://www.behance.net/search/projects/HR%20platform%20ui%20design?locale=ko_KR), [Dribbble "hr website ui"](https://dribbble.com/search/hr-website-ui).
> **두 검색 페이지는 이 세션 네트워크에서 막혔다**(접속 실패). 그래서 웹 검색(attendance dashboard · time tracking · leave management · shift scheduling · HR mobile app · 근태관리)으로 개별 프로젝트 링크를 찾았다.
> **한계:** 시안은 그림이라 이 세션은 화면을 보지 못했다. 아래 "몇 개에서 봤나"는 **제목·설명 글에 그 요소가 적힌 수**다(그림만 보고 셀 수 있는 수보다 적다). Behance는 검색 색인에 프로젝트가 거의 잡히지 않아(HR360 1건) 같은 작가들이 Contra에 올린 사례 글로 보충했다. 목표였던 "각 15~20개"에는 Behance가 못 미친다.
> 시안은 실제 제품이 아니다. **"실제 제품에도 있나"가 '있음'인 패턴만 우리 화면에 옮길 근거로 쓴다.** 이미지는 저장소에 넣지 않는다.

### 6.1 훑어본 시안(링크만)

| 출처 | 제목 | 글에 적힌 요소 |
| --- | --- | --- |
| Behance | [HR Dashboard Concept — HR360](https://behance.net/gallery/189238867/HR-Dashboard-Concept-HR360) | 급여 계산·출결 추적·보상, 급여 표 |
| Dribbble | [Employee Attendance Dashboard](https://www.dribbble.com/shots/23633181-Employee-Attendance-Dashboard) | 출결 대시보드 |
| Dribbble | [Tables dashboard HR Management](https://dribbble.com/shots/24516318-Tables-dashboard-HR-Management) | 직원 출결 표 |
| Dribbble | [Astrea System — HR Management Dashboard](https://dribbble.com/shots/22946378-Astrea-System-HR-Management-Dashboard) | HR 대시보드 |
| Dribbble | [Dynamics — Dashboard HRIS](https://dribbble.com/shots/24172962-Dynamics-Dashboard-HRIS) | HRIS 대시보드 |
| Dribbble | [iiHuman: Employee Management Dashboard](https://dribbble.com/shots/24084377-iiHuman-Efficient-Employee-Management-Dashboard) | 직원 관리 대시보드 |
| Dribbble | [HRM Dashboard](https://dribbble.com/shots/15565798-HRM-Dashboard) | HRM 대시보드 |
| Dribbble | [HR Dashboard — UI Design](https://dribbble.com/shots/24227366-HR-Dashboard-UI-Design) | HR 대시보드 |
| Dribbble | [HR 컬렉션(Ifeoma Nkemdilim)](https://dribbble.com/ifeomacreates/collections/7725421-HR-Dashboard) | 출결 추적·출결 대시보드 샷 10개 묶음 |
| Dribbble | [Timesheet 컬렉션](https://dribbble.com/rusnikitaa/collections/7149109-Timesheet) | Karyaone HR 출결 대시보드(위치 추적·준수) 등 |
| Dribbble | [Findez 등 Dark 컬렉션](https://dribbble.com/ashikxql/collections/6409776-Dark) | 출결 카드·일정 보기·프로필 |
| Dribbble | [Parcelle(HRMS Dashboard — Attendance)](https://dribbble.com/parcelle) | 도넛 차트·휴가 정책 |
| Dribbble | [HR Attendance App Design](https://www.dribbble.com/shots/23355998-HR-Attendance-App-Design) | 출퇴근 버튼·휴가 신청·출결 이력(모바일) |
| Dribbble | [Cloudforce HR Mobile — Apply and Approve Leaves](https://dribbble.com/shots/18631864-Cloudforce-HR-Mobile-App-Apply-and-Approve-Leaves) | 모바일 휴가 신청·승인 |
| Dribbble | [Nami — HR Management Mobile App](https://dribbble.com/shots/21667286-Nami-HR-Management-Mobile-App) | 출결·휴가 관리(모바일) |
| Dribbble | [Synergie — Payroll & Time Tracking Companion](https://dribbble.com/shots/14527552-Synergie-HR-Payroll-Time-Tracking-Companion-App) | 타임시트·수동 입력·승인 흐름 |
| Dribbble | [Shift scheduling system — Dipendenti in Cloud](https://dribbble.com/shots/19314988-Shift-scheduling-system-Dipendenti-in-Cloud) | 시간축(타임라인) 근무표·게시/임시 저장 |
| Dribbble | [HR Portal Design Concept](https://dribbble.com/shots/23652213-HR-Portal-Design-Concept) | 남은 휴가(연차·병가·가족돌봄) 잔여 |
| Dribbble | [Leave Management App(Synergy Codes)](https://dribbble.com/SynergyCodes/projects/5480860-Leave-Management-App) | 휴가 요청 관리 |
| Dribbble | [Leave Tracker and Sick Leave App 컬렉션](https://dribbble.com/MaramAbuHilal/collections/1925330-Leave-Tracker-and-Sick-Leave-App) | 휴가 홈·달력 |
| Dribbble | [HRMS app UI/UX case study](https://dribbble.com/shots/20651099-HRMS-app-UI-UX-case-study) | HRMS 앱 사례 |
| Dribbble | [Attendance management app 컬렉션](https://dribbble.com/Dhannyyogasukmawan/collections/6123085-Attendance-management-app) | iOS 휴가 신청 화면 |
| Contra(Behance 작가) | [TalentTrack — HR Management Dashboard](https://contra.com/p/UbWrcgUo-talent-track-hr-management-dashboard-design) | 핵심 지표 카드(총원·출근율·급여), 오늘 날짜 머리줄, 알림 |
| Contra(Behance 작가) | [BordUp — HR Management Dashboard](https://contra.com/p/bov2ZlYU-bord-up-hr-management-dashboard) | 휴가 신청·승인·잔여, 온라인 출결 |
| Contra | [TeamHub HR Management Dashboard](https://contra.com/p/PeEMQPPQ-team-hub-hr-management-dashboard-design) | 직원·출결·성과·채용 한 대시보드 |
| Contra | [Employee Self Service Portal](https://contra.com/p/QoeEPqce-employee-self-service-portal-uiux-design) | 직원 셀프서비스 |
| Contra | [Employee Management Dashboard(사례 글)](https://contra.com/community/upawEyoJ-uiux-design-for-employee-management-dashboard) | "휴가 요청·승인을 스프레드시트로 하던 문제" |

### 6.2 패턴별 집계(시안 + 실제 제품)

| 패턴 | 시안 글에서 본 수 | 대표 시안 링크 | 실제 제품에도 있나 | 우리 화면 어디에 |
| --- | --- | --- | --- | --- |
| 상단 요약 지표 카드(총원·출근율·지각·휴가 중) | 6 이상(TalentTrack, HR360, Employee Attendance, Astrea, Dynamics, iiHuman) | [TalentTrack](https://contra.com/p/UbWrcgUo-talent-track-hr-management-dashboard-design), [Employee Attendance](https://www.dribbble.com/shots/23633181-Employee-Attendance-Dashboard) | **있음**(flex 대시보드, 네이버웍스 현황, Gusto 홈 할 일) | 관리자·출결 담당 홈 맨 위 → Top 1. 단 **"처리할 것" 숫자**로(예쁜 통계가 아니라) |
| 출결 표(사람 × 날짜) | 4(Tables dashboard, Timesheet 컬렉션, Karyaone, Synergie) | [Tables dashboard](https://dribbble.com/shots/24516318-Tables-dashboard-HR-Management) | **있음**(Connecteam·Factorial·Deputy 타임시트, 네이버웍스 일자별) | 출결 결과 월간 격자 → Top 4 |
| 휴가(특이사항) 신청 → 승인 흐름 | 6(Cloudforce, HR Attendance App, Nami, Synergie, Leave Mgmt, BordUp) | [Cloudforce](https://dribbble.com/shots/18631864-Cloudforce-HR-Mobile-App-Apply-and-Approve-Leaves), [Leave Mgmt](https://dribbble.com/SynergyCodes/projects/5480860-Leave-Management-App) | **있음**(BambooHR Inbox, When I Work, Rippling, Gusto) | 요청 승인함 → Top 2·3 |
| 잔여·상태 카드(남은 휴가) | 3(HR Portal, BordUp, Leave Tracker) | [HR Portal](https://dribbble.com/shots/23652213-HR-Portal-Design-Concept) | **있음**(Workday, HiBob, 원티드스페이스) | 학생 포털 "내 상태 한 장"(OUT 0/2 등) → Top 5 |
| 모바일 출퇴근 큰 버튼 | 3(HR Attendance App, Findez, AveHR) | [HR Attendance App](https://www.dribbble.com/shots/23355998-HR-Attendance-App-Design) | 있음(원티드스페이스·알밤 등) | **우리는 쓰지 않음**(출석은 종이 출석부·근무교사) |
| 근무 시간축(타임라인) 스케줄 | 1(Dipendenti) | [Dipendenti](https://dribbble.com/shots/19314988-Shift-scheduling-system-Dipendenti-in-Cloud) | 있음(When I Work·Deputy 스케줄) | 근무표 달 화면 — 우리는 하루 2칸(21:30·23:00조)이라 시간축보다 **달력 칸**이 맞음 |
| 달력 보기(휴가·일정) | 2(Leave Tracker, Findez) | [Leave Tracker](https://dribbble.com/MaramAbuHilal/collections/1925330-Leave-Tracker-and-Sick-Leave-App) | 있음(BambooHR Who's Out 달력, Workday 팀 달력) | 월별 일정·근무표(이미 있음) |
| 도넛·원 차트(출근 비율) | 1 이상(Parcelle) | [Parcelle](https://dribbble.com/parcelle) | 드묾(실제 제품 도움말에서 핵심 화면으로 못 봄) | **쓰지 않음 권장** — 비율보다 "누가"가 중요 |
| 위치 추적·지도 | 1(Karyaone) | [Timesheet 컬렉션](https://dribbble.com/rusnikitaa/collections/7149109-Timesheet) | 있음(시프티·알밤 위치 기반 출퇴근) | **쓰지 않음**(개인정보) |
| 한 대시보드에 출결·급여·성과·채용 | 3(TeamHub, HR360, iiHuman) | [TeamHub](https://contra.com/p/PeEMQPPQ-team-hub-hr-management-dashboard-design) | 있음(올인원 HR) | **피함** — 역할별 홈에 그 역할 일만 |

### 6.3 시안에서만 본 스타일(실제 제품 근거 약함 → 참고만)

- 큰 통계 숫자 + 도넛·막대 차트가 화면 대부분을 차지하는 대시보드: 시안에는 흔하지만 실제 근태 제품 도움말의 핵심 화면은 **목록·표·승인함**이다.
- 사진 아바타가 줄마다 있는 직원 목록: 우리는 쓰지 않는다(학생 사진).
- 다크 모드·그라데이션 카드: 색 이야기라 이 문서 범위 밖(D15 몫).

### 6.4 근거 수(빈도)로 다시 정렬한 Top 10

실제 제품(2·3절, 16개) + 시안(6.2)에서 같은 패턴을 본 수를 더했다. 시안 수는 글 기준이라 낮게 잡혔다.

| 순위 | 패턴(0절 번호) | 실제 제품 수 | 시안 수 | 합 |
| --- | --- | --- | --- | --- |
| 1 | 요청 승인함·일괄 확정(②③) | 8(BambooHR·When I Work·Rippling·Gusto·Deputy·Personio·Workday·시프티) | 6 | 14 |
| 2 | 오늘 예외만 보이는 대시보드(①) | 5(flex·네이버웍스·Gusto·Homebase·Factorial) | 6 | 11 |
| 3 | 월간 타임시트 예외 표시·고정 열(④) | 6(Connecteam·Factorial·Deputy·Homebase·네이버웍스·flex) | 4 | 10 |
| 4 | 모바일 내 상태 한 장(⑤) | 5(Workday·HiBob·원티드스페이스·When I Work·flex 내 근무) | 3 | 8 |
| 5 | 처리할 요청 수 배지(⑦) | 3(When I Work·BambooHR·Gusto) | (시안 알림 아이콘 1 이상) | 4 |
| 6 | 마감·잠금(⑧) | 3(Homebase·Connecteam·원티드스페이스) | 0 | 3 |
| 7 | Who's out(⑨) | 2(BambooHR·Workday) | 2(달력) | 4 |
| 8 | 빠진 사람 찾기 + 알림(⑥) | 2(flex·Factorial) | 0 | 2 |
| 9 | 규칙 위반만 결재(⑩) | 1(Personio) | 0 | 1 |
| 10 | 기록 출처 표시(새로) | 1(네이버웍스) | 0 | 1 |

> 빈도로 보면 0절 순서와 거의 같다. 다만 **요청 승인함이 1위**로 올라온다(실제 제품·시안 모두 가장 흔함). Who's out(⑨)은 배지(⑦)와 비슷한 근거 수다.
