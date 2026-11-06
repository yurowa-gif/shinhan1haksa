# 값 어휘 약속 (시트에 저장하는 글자 값)

2026-11-06 총괄 확정. 코딩(C2~)과 규칙(R2~)이 같은 글자를 쓴다. 바꾸려면 총괄에게 먼저 알린다(이 문서는 총괄 소유).
모든 값은 문자열로 저장한다(Db.gs). 날짜 `yyyy-MM-dd`, 시각 `HH:mm`(`24:00` 허용), 일시 `yyyy-MM-ddTHH:mm:ss`(KST).
참·거짓 열은 `TRUE`/`FALSE`로 쓴다(읽을 때는 `isTruthy_`가 O·Y·예도 받아 준다 — 명단 업로드 호환).

## status_changes (PRD 3.2, F6·F7)

| 열 | 값 |
| --- | --- |
| item | `학사` · `기숙사` · `조식` · `석식` |
| value (학사·기숙사) | `입실` · `퇴실` |
| value (조식) | `실시` · `미실시` |
| value (석식) | `학사 석식` · `일반 석식` · `미실시` |
| status | `유효` · `취소` |
| source | `명단업로드` · `F6` · `F7` |
| doc_submitted | `TRUE` · `FALSE` |

상태 계산은 같은 학생·같은 item에서 status `유효`인 행을 effective_date 순으로 누적한다(같은 날이면 requested_at이 늦은 행). 행이 없으면 값은 `''`.

## exceptions_<기간> (F1)

| 열 | 값 |
| --- | --- |
| status | `요청` · `확정` · `취소` (출석부·자동 1OUT은 `확정`만 쓴다) |
| blocks | `ALL` 또는 `HH:mm-HH:mm;HH:mm-HH:mm` ("15:00부터 귀가" = `15:00-24:00`) |
| type | settings `exception.types`의 값 그대로(약어는 `exception.type_short`) |

## fixed_schedules (F9, 1단계는 가짜 데이터만)

| 열 | 값 |
| --- | --- |
| code | `학` · `가` |
| weekday | `월` `화` `수` `목` `금` `토` `일` |
| status | `제출` · `동의` · `확정` · `반려` · `취소` (출석부는 `확정`만 쓴다) |

## 나머지 1단계 탭

| 탭 | 열 | 값 |
| --- | --- | --- |
| day_schedules | operating | `TRUE` · `FALSE` |
| day_schedules, blocks, spaces, seats | status | `유효` · `취소` |
| blocks | term_type | `학기` · `방학` |
| blocks, day_schedules | day_type | `mon_thu` · `fri` · `sat` · `sun` (특별 코드는 관리자가 추가) |
| spaces | gender | `남` · `여` · `혼성` |
| seats | kind | `좌석` · `기둥` · `비상문` · `창문` |
| seat_assignments | status | `배정` · `취소` |

## 0단계 탭(참고)

| 탭 | 열 | 값 |
| --- | --- | --- |
| enrollments | veritas | `TRUE` · `FALSE` |
| enrollments | commute_type | `일반` · `원거리(관내)` · `원거리(관외)` |
| enrollments | end_type | `23:00` · `23:50` |
| students | gender | `남` · `여` |
| students | track | `문` · `이` · `''` |
| users | roles | `admin` `duty_manager` `attendance` `hall_teacher` `homeroom` `student` `parent` (쉼표로 여러 개) |
