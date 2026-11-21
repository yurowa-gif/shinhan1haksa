# 정찰 지도: When I Work 요청·승인 함 + 관리자 "오늘의 예외" 화면 (보조: Deputy 타임시트 일괄 승인)

작성일 2026-11-21. 방법: replica-recon + replica-entrepreneur 규칙(공개 자료만, 로그인 없음, 긁어 오기 없음, 코드·번들 없음, 지어내지 않음).
목적: 신한1학사 앱에서 출결 담당 교사가 특이사항 '요청'(결석·외출 통보 등)을 확정·반려하는 화면의 UX 패턴만 빌린다. 이름·문구·그림·색은 가져오지 않는다.

**중요한 한계:** 이 세션의 네트워크는 help.wheniwork.com, help.deputy.com, 리뷰 사이트에 직접 접속할 수 없었다(WebFetch: `getaddrinfo ENOTFOUND help.wheniwork.com`). 아래 내용은 **모두 WebSearch 결과 요약**에서 왔다. 어떤 페이지도 직접 열어 읽지 않았고, 화면 사진도 보지 못했다. 버튼 이름은 검색 요약이 옮긴 표현이며 원문과 글자 단위로 같다고 보장할 수 없다.

---

## 1. 범위

| 항목 | 내용 |
| --- | --- |
| 대상 앱 | When I Work(주), Deputy(보조) |
| 조각 | (a) 관리자의 요청 함: 근무 요청(교대·드롭), 휴가 요청의 승인/거절 (b) 알림 종·알림 패널의 "내 조치가 필요한 것" 묶음 (c) 대시보드(웹·모바일)의 요청 카드 (d) Deputy의 "경고 없는 타임시트만 일괄 승인" |
| 플랫폼 | 웹(컴퓨터), iPhone, Android. 도움말 글이 플랫폼별로 나뉘어 있음 |
| 제외 | 근무표 작성, 출퇴근 기록, 급여, 채팅(WorkChat), 결제 |
| 우리 쪽 대응 | 요청 = 담임·담당교사가 넣는 학생 특이사항, 승인자 = 출결 담당 교사 1~2명, 대상 = 학사생 약 180명 |

## 2. 출처 표

"방식" 열: **직접** = 페이지를 열어 읽음, **검색 요약** = WebSearch 결과 요약에서만 확인. 이번에는 직접 연 페이지가 0개다.

| # | URL | 무엇을 알려 주나 | 방식 |
| --- | --- | --- | --- |
| 1 | https://help.wheniwork.com/articles/processing-shift-requests-computer | 웹 근무 요청 처리: 메뉴에서 Shift Requests, 탭 "Requests I Can Approve"/"All Requests", 승인 불필요 설정이면 첫 탭 없음, 거절 시 선택 코멘트, 드롭 거절 시 근무는 원래 사람에게 남음 | 검색 요약(WebFetch 차단) |
| 2 | https://help.wheniwork.com/articles/processing-shift-requests-iphone | iPhone 처리: (선택) 제안 대상 변경 후 승인/거절, 승인 시 관련자 모두·거절 시 신청자에게 자동 알림, "Require Manager Review for Swaps and Drops" 끄면 승인 불필요 | 검색 요약 |
| 3 | https://help.wheniwork.com/articles/processing-shift-requests-android | Android: Shift Requests 대시보드 카드 → 요청 탭 → 처리. iOS와 단계 같음 | 검색 요약 |
| 4 | https://help.wheniwork.com/articles/processing-time-off-requests-computer | 웹 휴가 요청: 같은 탭 2개, 첫 탭은 Pending Approval 중 내가 처리 가능한 것(내 요청 제외), 설정에서 승인 불필요면 탭 없음, 처리 후 직원 자동 알림, 상세에서 대화·잔여 확인 | 검색 요약 |
| 5 | https://help.wheniwork.com/articles/processing-time-off-requests-iphone | 모바일: Time Off Requests 카드, **내 승인이 필요한 요청이 목록 맨 위로 자동 이동**, Pending Approval 태그 | 검색 요약 |
| 6 | https://help.wheniwork.com/articles/processing-time-off-requests-android | Android: 요청의 대화/활동 버튼에서 수정 이력·메모 | 검색 요약 |
| 7 | https://help.wheniwork.com/articles/exporting-time-off-requests | 내보내기: 오른쪽 위 Export, 시작·종료일, 사용자 선택, 1회 5,000건, 항목(요청 날짜·생성일·유급 시간·상태·승인 정보), 보관 2년 | 검색 요약 |
| 8 | https://help.wheniwork.com/articles/shift-request-statuses | 근무 요청 상태: Pending Approval, Pending Acceptance, Accepted, Canceled(관리자 근무 변경 시 자동 취소 포함), Expired, Declined/Denied | 검색 요약 |
| 9 | https://help.wheniwork.com/articles/statuses-for-openshift-requests | OpenShift 요청: 근무 시작 전 아무도 처리 안 하면 만료 | 검색 요약 |
| 10 | https://help.wheniwork.com/articles/viewing-notifications-computer | 알림 패널 3구역: Things Needing Your Action / Things Awaiting Actions from Others / Notifications. 첫 구역은 휴가·교대·드롭 요청, **마우스를 올려 바로 승인**, 클릭하면 상세 | 검색 요약 |
| 11 | https://help.wheniwork.com/articles/notification-center-ios-devices | iOS 알림 종 위 빨간 원 숫자 배지, 최신→오래된 순 | 검색 요약 |
| 12 | https://help.wheniwork.com/articles/setting-your-alert-preferences | 알림마다 Email/Mobile 따로 켜고 끔, 플랜에 따라 항목 다름, 관리자는 자기 일정 + 관리자 없는 일정의 알림 받음, "Don't Notify Me Between" 방해 금지 시간 | 검색 요약 |
| 13 | https://help.wheniwork.com/articles/setting-alert-preferences-iphoneipad | 모바일 경로: More(오른쪽 아래) → Profile & Settings → Alerts | 검색 요약 |
| 14 | https://help.wheniwork.com/articles/web-app-navigation-reference-for-managers | 웹 상단 바 11개(Notifications, Dashboard, Scheduler, Attendance, Payroll, WorkChat, Reports, Requests, Workplace, Gear, Profile), 감독자에게 Gear 숨김, Dashboard = 작업장 현황 스냅샷 | 검색 요약 |
| 15 | https://help.wheniwork.com/articles/tracking-scheduled-employees/?mode=grid | 모바일 대시보드 "Also Working" 구역: 예정자·출근/퇴근 여부 | 검색 요약 |
| 16 | https://help.deputy.com/hc/en-au/articles/6997348381327 | Deputy 승인: 개별 Approve, Approve & Next, 일괄 "Approve all (X)" vs "Approve all with no issues (X)", 선택 없거나 전체 선택이면 화면의 승인 가능 전부, 일부 선택이면 선택분만, 권한(System Administrator/Location Manager/Supervisor) | 검색 요약 |
| 17 | https://help.deputy.com/hc/en-au/articles/6997363402895 | Approve Timesheets 페이지: Timesheets > Approve Timesheets, 위치·영역·기간 먼저 선택, 왼쪽 팀원 목록, 상태로 거르기 절이 있음(내용 미확인), 올해+지난 2년 | 검색 요약 |
| 18 | https://help.deputy.com/hc/en-au/articles/6997346222735 | 새 타임시트: 상태(어디까지 왔나)와 경고(손봐야 하나)를 따로 표시, 상태 예 "Upcoming" | 검색 요약 |
| 19 | https://help.deputy.com/hc/en-au/articles/4973093941007 | 자동 승인: 경고 없는 타임시트만, 경고는 삼각형 아이콘, 23시간59분 자동 종료·무급 시간 포함 시 경고 | 검색 요약 |
| 20 | https://help.deputy.com/hc/en-au/articles/4689553875471 | 예전(중단 예정) 승인 화면: 직원별 Approve All | 검색 요약 |
| 21 | https://whatsnew.deputy.com/an-improved-timesheets-experience-on-mobile-45UK52 | 모바일에서 날짜·프로필 사진을 눌러 일괄 승인 | 검색 요약 |
| 22 | https://www.capterra.com/p/121248/When-I-Work/reviews/ | 리뷰(알림 지연·과다, 승인자 지정 불가 등). 평점 요약 4.5(1,289) | 검색 요약 |
| 23 | https://www.g2.com/products/when-i-work/reviews | 리뷰 요약: 알림 과다·지연, 버그·느림, 모바일 한계. 4.4/5 약 381~384건 | 검색 요약 |
| 24 | https://www.trustradius.com/products/when-i-work/reviews/all | 승인자·알림 대상이 여럿이면 다루기 어렵다는 리뷰 | 검색 요약 |
| 25 | https://www.capterra.com/p/167811/Deputy/reviews/ | Deputy 리뷰: 승인 시점에야 누락 발견, 단가 변경 시 승인 취소 후 재승인 등. 4.6 약 774건 | 검색 요약 |

## 3. 화면 목록

"본 상태"는 도움말 요약에 언급된 상태만 적었다. 화면 자체를 본 것은 없다.

| ID | 화면 | 가는 길 | 목적 | 주요 부품 | 본 상태 |
| --- | --- | --- | --- | --- | --- |
| S01 | 웹 상단 바 + 알림 종 | 로그인 후 모든 화면 | 어디서나 처리할 일 수 확인 | 상단 바 항목 11개, 알림 종, 숫자 배지 | 채움(배지). 권한: 감독자는 Gear 숨김 |
| S02 | 알림 패널(웹) | S01 종 클릭 | 내 조치 필요한 일 모아 보기·바로 처리 | 3구역 목록(내 조치 필요 / 남의 조치 대기 / 일반 알림), 행 위 마우스 시 승인 버튼, 행 클릭 → 상세 | 채움. 빈 상태 미확인 |
| S03 | 웹 대시보드 | 상단 바 Dashboard | 작업장 현황 스냅샷 | 미확인(카드 구성 근거 없음) | 미확인 |
| S04 | 근무 요청 목록(웹) | 상단 바 Requests → Shift Requests | 교대·드롭 요청 처리 | 탭 2개("내가 승인할 수 있는 요청"/"전체 요청"), 요청 행, 상태 | 채움. 설정에서 승인 불필요면 첫 탭 자체가 없음 |
| S05 | 근무 요청 상세·처리 | S04 행 또는 S02 행 클릭 | 한 건 결정 | 요청 정보, (선택) 제안 대상 바꾸기, 승인/거절 버튼, 거절 시 선택 코멘트 | 채움 |
| S06 | 휴가 요청 목록(웹) | Requests → Time Off Requests | 휴가 요청 처리 | 같은 탭 2개, Pending Approval 태그, 오른쪽 위 Export 버튼 | 채움. 첫 탭은 내 요청 제외. 승인 불필요 설정이면 첫 탭 없음. 관리자가 요청 기능을 끄면 관리자가 대신 입력 |
| S07 | 휴가 요청 상세(웹) | S06 행 클릭 | 결정 전 맥락 확인 | 요청 정보, 대화, 잔여 휴가, 승인/거절 | 채움 |
| S08 | 휴가 요청 내보내기 | S06 Export | 기록 보관용 표 받기 | 시작일·종료일, 사용자 선택, Export 버튼 | 채움. 한도 5,000건 |
| S09 | 모바일 대시보드 | 앱 첫 화면(아래 탭 Dashboard) | 요청·근무 현황 카드 | Shift Requests 카드, Time Off Requests 카드, Also Working 구역, 아래 탭(Dashboard·Schedule·Time Sheets·WorkChat·More, 제3자 리뷰 근거) | 채움. 모바일 |
| S10 | 근무 요청 목록(모바일) | S09 Shift Requests 카드 | 교대·드롭 처리 | 요청 행 | 채움. 모바일 |
| S11 | 휴가 요청 목록(모바일) | S09 Time Off Requests 카드 | 휴가 처리 | 요청 행, Pending Approval 태그, **내 승인 필요 건 맨 위 정렬** | 채움. 모바일 |
| S12 | 요청 상세(모바일) | S10/S11 행 탭 | 한 건 결정 | 승인/거절 버튼, (Android) 대화·활동 버튼 → 수정 이력·메모 | 채움. 모바일 |
| S13 | 알림 센터(iOS) | 알림 종 | 알림 확인 | 종 위 빨간 숫자 배지, 최신순 목록 | 채움. 모바일 |
| S14 | 알림 설정 | 웹: 이름 위 → Profile & Settings / 모바일: More → Profile & Settings → Alerts | 받을 알림 고르기 | 알림 종류 행마다 Email·Mobile 체크, 방해 금지 시간 | 채움. 플랜에 따라 항목 다름 |
| S15 | (Deputy) 타임시트 승인 페이지 | Timesheets > Approve Timesheets | 기간 단위 검토·승인 | 위치·영역·기간 선택, 왼쪽 팀원 목록, 상태 거르기, 경고 삼각형 아이콘 | 채움. "안 보이면 선택 범위부터 확인"(빈 결과 안내). 조회 범위 올해+지난 2년 |
| S16 | (Deputy) 타임시트 한 건 | S15에서 항목 | 한 건 승인 후 다음으로 | Approve, Approve & Next | 채움 |
| S17 | (Deputy) 일괄 승인 | S15 일괄 동작 | 한 번에 여러 건 승인 | "전부 승인(X)"와 "문제 없는 것만 승인(X)" 두 버튼(괄호 안 건수), 선택 체크 | 채움. 권한: 시스템 관리자·지점 관리자·감독자만 |
| S18 | (Deputy) 모바일 일괄 승인 | 모바일 타임시트 | 날짜·사람 단위 일괄 | 날짜 머리글·프로필 사진 탭 | 모바일 |

## 4. 흐름

클릭 수는 도움말 단계 수를 센 것이라 모두 **추정**이다(실제 화면에서 세지 못함).

**F01 웹: 알림 패널에서 바로 승인**
S01 종 → S02 "내 조치 필요" 행에 마우스 → 승인. 추정 2클릭.
예외: 맥락이 더 필요하면 행 클릭 → S05/S07 상세(+1~2). 거절은 패널에서 바로 되는지 미확인.

**F02 웹: 근무 요청 목록에서 승인**
상단 바 Requests → S04 "내가 승인할 수 있는 요청" 탭 → 행 → S05 (선택: 제안 대상 변경) → 승인. 추정 4클릭.
예외: 설정상 승인 불필요 → 탭 없음, 처리할 일 없음 / 관리자가 근무를 바꾸면 요청 자동 취소 / 근무 시작 전 처리 안 하면 만료.

**F03 거절 + 코멘트**
S05 → 거절 → (선택) 코멘트 입력 → 확인. 추정 3클릭+입력.
결과: 신청자에게 자동 알림, 드롭 거절이면 근무는 원래 사람에게 남음.

**F04 웹: 휴가 요청 승인**
Requests → S06 첫 탭 → 행 → S07(대화·잔여 확인) → 승인. 추정 4클릭.
예외: 내 요청은 첫 탭에 안 나옴(자기 승인 방지) / 요청 기능이 꺼져 있으면 관리자가 대신 입력.

**F05 모바일: 대시보드 카드 → 승인**
S09 카드 → S10/S11(내 승인 건이 맨 위) → S12 → 승인. 추정 3탭.
예외: Android는 대화·활동에서 이력 확인 후 결정.

**F06 휴가 요청 내보내기**
S06 → Export → 기간·사용자 → Export. 추정 4클릭.
예외: 5,000건 넘으면 나눠 받아야 함(추정), 2년 넘은 요청은 없음.

**F07 (Deputy) 경고 없는 것만 일괄 승인**
S15 위치·영역·기간 선택 → (선택 없이) "문제 없는 것만 승인(X)" → 확인 여부 미확인. 추정 2~4클릭.
예외: 일부만 체크하면 체크한 것만 대상 / 경고 있는 건은 남아서 하나씩 S16으로 검토 / 원하는 건이 안 보이면 선택 범위 문제.

**F08 (Deputy) 하나씩 검토하며 넘기기**
S15 → 첫 건 → S16 Approve & Next 반복. 건당 1클릭(추정).

**F09 알림 받기 설정**
S14 → 요청 종류 행의 Email/Mobile 체크 → (선택) 방해 금지 시간. 추정 3클릭.

## 5. 부품

| 부품 | 변형 | 상태 | 쓰는 화면 |
| --- | --- | --- | --- |
| 알림 종 + 숫자 배지 | 웹 상단 바 / iOS | 0건(배지 없음, 추정) / n건 | S01, S13 |
| 묶음 목록(구역 머리글) | 내 조치 필요 / 남의 조치 대기 / 일반 | 채움, 빈 구역 미확인 | S02 |
| 행 위 빠른 동작 | 마우스 올리면 승인 | 기본 / 올림 | S02 |
| 탭 2개 | "내가 처리할 것" / "전체" | 첫 탭 숨김(승인 불필요 설정) | S04, S06 |
| 상태 태그 | Pending Approval, Pending Acceptance, Accepted, Canceled, Expired, Denied | 상태별 | S04, S06, S11 |
| 승인/거절 버튼 쌍 | 웹 / 모바일 | 사용 가능 / 권한 없음(추정) | S05, S07, S12 |
| 거절 코멘트 입력 | 선택 입력 | 빈 / 입력 | S05 |
| 대시보드 카드 | 근무 요청 / 휴가 요청 / 함께 근무 중 | 채움 | S09 |
| 대화·활동 이력 | 메모·수정 이력 | | S07, S12 |
| 내보내기 대화상자 | 기간·사람 | | S08 |
| 알림 설정 행 | Email 체크 / Mobile 체크 | 켬/끔, 플랜에 없음 | S14 |
| (Deputy) 범위 선택기 | 위치·영역·기간 | | S15 |
| (Deputy) 경고 아이콘 | 삼각형 | 있음/없음, 상태와 별개 | S15, S16 |
| (Deputy) 건수 붙은 일괄 버튼 | 전부(X) / 문제 없는 것만(X) | 선택 없음·전체 선택 → 화면 전부 / 일부 선택 → 선택분 | S17 |
| (Deputy) 승인 후 다음 | Approve & Next | | S16 |

## 6. 빈 상태·오류 상태 (근거 있는 것만)

| 경우 | 동작 | 출처 |
| --- | --- | --- |
| 승인이 필요 없도록 설정됨 | "내가 승인할 수 있는 요청" 탭이 아예 안 나옴 | #1, #4 |
| 관리자 자신의 요청 | 첫 탭에서 빠짐 | #1, #4 |
| 휴가 요청 기능이 꺼짐 | 직원은 요청 못 하고 관리자가 대신 입력 | #4(검색 요약) |
| 근무가 관리자에 의해 바뀜 | 요청 자동 취소 | #8 |
| 기한 내 아무도 처리 안 함 | Expired | #8, #9 |
| 내보내기 한도 | 1회 5,000건, 보관 2년 | #7 |
| 알림이 안 옴 | 스팸함 확인·발신자 허용 안내, 방해 금지 시간에는 모바일 알림 안 보냄 | #12 |
| (Deputy) 찾는 타임시트가 안 보임 | 위치·영역·기간 선택부터 확인하라는 안내 | #17 |
| (Deputy) 경고 있는 타임시트 | 자동 승인 대상에서 빠짐, 관리자 검토 필요 | #19 |

빈 목록 화면의 문구·그림, 로딩 표시, 네트워크 오류 화면은 근거 없음(미확인).

## 7. 추정 데이터 모델

```
Request (근무 요청)   확신도 중간
  id, type (swap | drop | openshift), requester_user_id, shift_id,
  offered_to (사람 목록, 관리자가 바꿀 수 있음),
  status (pending_approval | pending_acceptance | accepted | canceled | expired | denied),
  manager_comment (거절 시 선택), created_at
  근거: #1, #2, #8, #9

TimeOffRequest (휴가 요청)   확신도 중간
  id, user_id, start/end(날짜), paid_hours, status(pending_approval | approved | denied | canceled 추정),
  approval_details(누가·언제), created_at, conversation(메시지 목록)
  근거: #4, #7(내보내기 항목), #6(대화·활동)
  보관 2년(#7)

Approver 범위   확신도 중간
  관리자는 자기가 속한 일정 + 관리자 없는 일정의 요청을 받음, 자기 요청은 자기 함에서 제외
  근거: #12, #4

Setting   확신도 높음
  require_manager_review_for_swaps_drops (bool), time_off_requires_approval (bool)
  근거: #1, #2, #4

Notification   확신도 중간
  id, recipient_user_id, bucket (needs_your_action | awaiting_others | info), ref_request_id, created_at, read
  근거: #10, #11

AlertPreference   확신도 높음
  user_id, alert_type, email(bool), mobile(bool), quiet_hours(시작·끝)
  근거: #12, #13

ActivityLog(요청 이력)   확신도 낮음
  request_id, actor, action, at, note
  근거: #6 "수정 이력·메모"만 언급, 구조 미확인

(Deputy) Timesheet   확신도 중간
  id, employee_id, location_id, area_id, date, status(… | Upcoming | approved 등),
  warnings[] (자동 종료, 무급 시간 등), approved_by/at
  근거: #16~#19. 상태와 경고는 별개 필드(#18)
```

## 8. 디자인 측정

화면 사진을 보지 못해 **크기·간격·글자 크기·색은 모두 측정 불가**. 색·브랜드는 적지 않는다.
도움말로 알 수 있는 배치·위계만:

- 웹: 알림 종이 상단 바 맨 앞(목록 순서상 첫 항목). 처리 대기 수는 종 위 숫자 배지.
- 알림 패널: 3구역을 "내 조치 필요"가 맨 위에 오도록 쌓음(위계: 내 할 일 > 남의 할 일 > 참고).
- 요청 목록: 탭 2개, 첫 탭이 "내가 처리할 것". 처리할 것이 없게 설정되면 탭 자체를 없앰.
- 모바일 목록: 내 승인이 필요한 건을 맨 위로 정렬하고 Pending Approval 태그를 붙임.
- 모바일: 첫 화면 대시보드에 요청 종류별 카드, 카드 → 목록 → 상세 3단.
- 내보내기 버튼은 목록 화면 오른쪽 위.
- 모바일 설정 진입은 아래 탭 오른쪽 끝 More.
- (Deputy) 범위 선택기가 맨 위, 팀원 목록이 왼쪽, 일괄 버튼에 대상 건수를 괄호로 표시, 경고는 행의 삼각형 아이콘으로 상태와 따로 표시.

## 9. 리뷰 불만 (replica-entrepreneur)

**표본에 대해 정직하게:** 리뷰 원문은 한 건도 직접 열어 읽지 못했다(리뷰 사이트 접속 차단, WebSearch만 사용). 아래는 WebSearch 5회 결과 요약을 묶은 것이다. 그래서 **원문 인용은 없다**. "근거 수"는 그 테마를 언급한 검색 요약 단위의 수이지 리뷰 개수가 아니다. 모든 테마가 "검색 요약"이며, replica-entrepreneur 기준(리뷰 3건 미만 또는 출처 1곳뿐이면 얇음)으로 보면 대부분 얇음이다. 플랫폼 공개 평점(Capterra 4.5/1,289건, G2 4.4/약 381~384건, Deputy Capterra 4.6/약 774건)도 검색 요약 값이다.

| # | 테마 | 근거 수(검색 요약) | 출처 곳 | 링크 | 비고 |
| --- | --- | --- | --- | --- | --- |
| T1 | 알림이 늦거나 빠짐(취소 알림 미발송 사례 포함) | 3 | Capterra, G2 | https://www.capterra.com/p/121248/When-I-Work/reviews/ , https://www.g2.com/products/when-i-work/reviews | 업체가 조사하겠다고 답한 리뷰가 있다는 요약 |
| T2 | 알림이 너무 많고 고르기 어려움(사소한 변경마다 알림) | 3 | G2, Capterra | 위 두 링크 | 업체도 "많거나 놓치기 쉽다"고 인정했다는 요약 |
| T3 | 요청·알림을 받을 승인자를 지정·위임할 수 없음(계정 소유자 이메일로만, 감독자 여럿이면 복잡) | 3 | Capterra, G2, TrustRadius | 위 두 링크 + https://www.trustradius.com/products/when-i-work/reviews/all | 우리 맥락(출결 담당 1~2명 + 담당교사)에 가장 직접 관련 |
| T4 | 열린 근무 요청을 "승인 안 함"으로 치울 방법이 없어 목록에 남음 | 1 | Capterra | https://www.capterra.com/p/121248/When-I-Work/reviews/ | 얇음 |
| T5 | 교대·드롭 기능이 앱 어디 있는지 헷갈림(가끔 쓰는 사람) | 1 | Capterra | 위 링크 | 얇음 |
| T6 | 모바일 버그·느린 로딩·충돌 | 2 | G2, Capterra | 위 링크들 | 요청 처리에 한정된 불만은 아님 |
| T7 | (Deputy) 기록 누락을 승인할 때서야 발견, 단가 바뀌면 승인 취소 후 재승인 | 1(여러 리뷰를 묶은 요약 1건) | Capterra | https://www.capterra.com/p/167811/Deputy/reviews/ | 얇음. 반대로 "예정·실제를 한 칸에서 보니 승인이 쉽다"는 긍정 요약도 있음 |

Reddit·App Store 리뷰는 검색에서 관련 글을 찾지 못했다.

## 10. 우리 앱이 피할 것 / 더 잘할 것

맥락: 출결 담당 교사 1~2명이 학사생 약 180명의 특이사항 요청을 확정·반려, 담임·담당교사가 요청을 넣음, 감사 기록 필수, 삭제 대신 취소, 실시간 없음, 휴대폰 세로 우선.

**빌릴 것**
1. 첫 화면 맨 위에 "확정 대기 n건" 묶음(S02의 "내 조치 필요" 위계). 그 아래 "오늘의 예외"(오늘 날짜에 걸린 확정 특이사항) — 대시보드 카드 → 목록 → 상세 3단을 2단으로 줄인다.
2. 탭 2개: "확정할 것" / "전체". 출결 담당이 아닌 교사에게는 첫 탭을 보이지 않되, **판정은 서버(`requirePermission_`)에서** 한다.
3. 내가 넣은 요청은 내 확정 함에서 뺀다(자기 승인 방지). 출결 담당이 1명뿐인 날은 예외 규칙이 필요 → `// ASSUMPTION:` 대상, 총괄 확인.
4. 확정 대기 건을 맨 위로 정렬 + 상태 글자 태그(색만으로 구분하지 않음).
5. Deputy식 "문제 없는 것만 한꺼번에 확정(n건)": 경고 = 같은 학생 같은 날 기존 고정 일정과 겹침, 이미 지난 날짜, 서류 미제출 표시 등. 버튼에 대상 건수를 적고, 선택이 없으면 화면에 보이는 것 전부·일부 선택이면 그것만이라는 규칙을 버튼 옆에 글로 보여 준다.
6. 반려 시 사유 입력(우리는 **필수**로, 원본은 선택) → 요청한 교사에게 알림.
7. 상태(어디까지 왔나)와 경고(손봐야 하나)를 다른 칸으로(Deputy #18).

**피할 것 / 더 잘할 것**
1. T3 대응: 요청을 받는 사람은 "출결 담당 역할을 가진 교사 전원"으로 시트 설정에서 바꿀 수 있게. 한 사람 이메일에 묶지 않는다.
2. T1·T2 대응: 실시간 알림이 없으니 "알림이 안 와서 놓침"을 화면이 막아야 한다. 첫 화면 숫자 + 오래된 대기 건 표시(예: 하루 넘은 요청 위로). `MailApp` 알림은 하루 묶음 1통 또는 즉시 중 고르게(종류마다 켜고 끔). 사소한 수정마다 메일 보내지 않음.
3. T4 대응: 모든 요청은 확정/반려/취소 중 하나로 끝낼 수 있어야 하고 함에 영원히 남지 않게. 단 **삭제가 아니라 `status` 변경 + `audit_log`**.
4. 원본의 "관리자가 근무를 바꾸면 요청 자동 취소", "시간 지나면 만료"는 우리 규칙상 조용히 바꾸지 않는다. 지난 날짜 요청은 "기한 지남" 경고만 붙이고 사람이 결정(출석부 칸 우선순위가 바뀌므로). 이 정책은 PRD 열린 질문일 수 있어 총괄 확인.
5. 마우스 올려 승인(hover)은 휴대폰에 없다. 행마다 큰 "확정"/"반려" 버튼, 실수 방지로 확정 후 "되돌리기"(= 취소 기록) 제공.
6. T7 대응: 확정 전에 그 학생의 그날 출석부 칸(고정 일정·기존 특이사항)을 같은 화면에 보여 준다(Deputy의 "예정·실제 한 칸" 긍정 요소).
7. 이력: 요청마다 누가 넣고·바꾸고·확정했는지 시간순 목록(Android 대화·활동 버튼 패턴) — 우리는 `audit_log`에서 읽어 보여 준다.
8. 내보내기는 Drive 출력물로. 보관 기간은 우리가 정하지 않음(학교 규정 확인).
9. 새로고침 버튼과 "마지막으로 불러온 시각"을 목록 위에 표시(실시간 없음). 두 담당자가 같은 건을 동시에 처리하면 서버가 `LockService` 안에서 현재 상태를 다시 읽고 이미 처리된 건이면 "다른 선생님이 먼저 처리함"을 돌려준다.

## 11. 확인 못 한 것

- help.wheniwork.com, help.deputy.com, Capterra·G2·TrustRadius 페이지를 직접 열지 못함(네트워크 차단). 모든 사실은 검색 요약 2차 정보.
- 화면 사진 0장: 크기·간격·색·아이콘·빈 상태 문구 전부 미확인.
- 웹 대시보드(S03)의 실제 카드 구성, 관리자용 "오늘의 예외" 카드가 있는지 미확인(검색에서 찾지 못함).
- 알림 패널에서 거절도 바로 되는지, 모바일에서 거절 코멘트가 되는지 미확인.
- 일괄 승인·일괄 거절이 When I Work에 있는지 근거 없음.
- 휴가 요청 상태 값 목록(근무 요청 상태만 확인).
- Deputy "상태로 거르기"의 실제 필터 값, 일괄 승인 전 확인창 유무.
- 리뷰 원문·날짜·별점·정확한 표본 수. Reddit·App Store·Google Play 리뷰 미수집.
- 이용 약관 검토 안 함(공개 도움말만 읽었으므로 계정 약관 문제는 해당 없음).
