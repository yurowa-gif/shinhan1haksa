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
| doc_submitted | `TRUE` · `FALSE` · `''`(해당 없음 — `명단업로드` 초기값과 2단계 연결 행, 아래 2단계 표. 서류 미제출 표시 대상이 아니다) |

상태 계산은 같은 학생·같은 item에서 status `유효`인 행을 effective_date 순으로 누적한다(같은 날이면 requested_at이 늦은 행). 행이 없으면 값은 `''`.

## exceptions_<기간> (F1)

| 열 | 값 |
| --- | --- |
| status | `요청` · `확정` · `취소` (출석부·자동 1OUT은 `확정`만 쓴다) |
| blocks | `ALL` 또는 `HH:mm-HH:mm;HH:mm-HH:mm` ("15:00부터 귀가" = `15:00-24:00`) |
| type | settings `exception.types`의 값 그대로(약어는 `exception.type_short`) |
| group_id | 여러 날 한 번에 입력한 묶음(결정 22: 묶음 1개 = 1OUT). 묶음 안 하루만 취소해도 묶음은 그대로 하나다 |

행은 고치지 않는다: 잘못 넣은 것은 취소(`취소` + cancel_reason) 뒤 새로 넣는다. 그래서 `student_id`·`term_id`·`date`는 저장 뒤 바뀌지 않는다(R5는 바뀌어도 견디게 만들어져 있지만 앱이 바꾸는 경로는 없다).

## fixed_schedules (F9, 1단계는 가짜 데이터만)

| 열 | 값 |
| --- | --- |
| code | `학` · `가` · `없음`(그 달 확정 시간표에 학·가가 하나도 없음 — weekday·blocks는 빈칸, 학생·달마다 1행) |
| weekday | `월` `화` `수` `목` `금` `토` `일` |
| status | `제출` · `동의` · `확정` · `반려` · `취소` (출석부는 `확정`만 쓴다) |

적용 규칙: 학생마다 **확정 행이 있는 가장 최근 달(적용월 ≤ 그 날짜의 달)** 의 행만 쓴다. 그 달 행이 `없음` 하나뿐이면 고정 일정이 없는 달이다(앞 달 시간표가 이어지지 않는다). 확정 행이 있는 달이 하나도 없으면 고정 일정 없음.

## violations_<기간> (F4, F1 자동 1OUT)

| 열 | 값 |
| --- | --- |
| status | `유효` · `취소` |
| source | `직접`(교사가 F4에서 입력) · `F1자동`(R5 `reconcileAutoOuts_`가 만든 것, 띄어쓰기 없음) |
| source_exception_id | `F1자동`이면 연결된 특이사항 id(묶음이면 대표 행), `직접`이면 `''` |
| rule_name | `직접`이면 F4 항목 이름. `F1자동`이면 **`무단 지각·결석·이탈(<만들 때 특이사항 유형>)`** 형식(R5가 이 괄호 유형으로 "설정 변경은 앞으로만"을 판정한다). F4 화면은 `F1자동` 행의 rule_name을 고치지 못하게 한다 |
| cancel_reason | 자유 입력. 단, 규칙이 자동으로 취소한 행은 **`[자동] `**(대괄호·공백 포함)으로 시작한다. 이 머리말이 없는 `F1자동` 취소 행은 관리자가 직접 취소한 것으로 보고 다시 만들지 않는다(R5) |

## 새 탭·열 어휘 (2단계, 결정 41 승인)

`docs/plan/stage2.md` 5절 구조 변경안 1~7은 2026-11-07 선생님이 모두 승인했다(결정 41). 열은 `src/Schema.gs`(S2-0b)에 있다: 새 탭 `duty_slots`·`violation_rules`·`violations_<기간>`(값은 위 violations 절), `counsel_notes`에 target·linked_violation_id·cancel_reason, `status_changes`에 cancel_reason(memo 뒤).

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
| status_changes | source(연결 행) | 퇴실 정리 급식 행(미실시 중단 행)은 `F6`. F7 신청의 followUps는 **규칙이 준 `source`를 그대로** 쓴다(미실시 중단 행 = `F6`, 재입실 뒤 값 행 = `F7`, rules-api.md R11b). **F6 화면이 퇴실과 함께 만든 일반 석식 행은 `F7`**(신청이다 — MealRules.gs:168·183·261은 F6 행을 정리 행으로 보고 superseded·퇴실 취소 대상에서 뺀다) |
| status_changes | doc_submitted | 대표 행 `TRUE`·`FALSE`. 연결 행(일반 석식 행 포함)과 명단업로드 행은 `''`. 서류 미제출 목록은 `FALSE`만 센다 |
| status_changes | effective_date_auto | 규칙 계산값. effective_date와 다르면 교사가 고친 행(사유는 reason) |
| status_changes | reason(자동) | 퇴실 정리 행 `학사 퇴실 정리`, 2OUT 퇴실 대표 행 `2OUT 퇴실`(날짜·면담 정보 없음) |
| status_changes | memo(자동) | 2OUT 퇴실 대표 행 `[2OUT] out:<OUT id> note:<면담 id>`. 화면에 내보내지 않는다 |
| status_changes | cancel_reason | `[자동] <원인 행 id> …`(규칙이 취소) 또는 사람이 적은 사유(2자 이상) |

### 전역 이름 접두어 (2단계 파일, stage2.md 1절)

Apps Script는 같은 전역 이름을 경고 없이 덮는다. 새 전역 이름은 파일의 접두어로 시작한다(전역 이름 중복은 security.test.js가 막는다).

| 파일 | 접두어 | 파일 | 접두어 |
| --- | --- | --- | --- |
| rules/DutyRules.gs | `duty…` | features/Duty.gs | `dty…` |
| rules/OutRules.gs | `out…` | features/Outs.gs | `vio…` |
| rules/MoveRules.gs | `move…` | features/Moves.gs | `inout…` |
| rules/MealRules.gs | `meal…` | features/Meals.gs | `food…` |
| print/*.gs | `print…` | features/Counsel.gs · Notify.gs | `cns…` · `notify…` |

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
