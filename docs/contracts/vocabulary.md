# 값 어휘 약속 (시트에 저장하는 글자 값)

2026-11-06 총괄 확정. 코딩(C2~)과 규칙(R2~)이 같은 글자를 쓴다. 바꾸려면 총괄에게 먼저 알린다(이 문서는 총괄 소유).
모든 값은 문자열로 저장한다(Db.gs). 날짜 `yyyy-MM-dd`, 시각 `HH:mm`(`24:00` 허용), 일시 `yyyy-MM-ddTHH:mm:ss`(KST).
참·거짓 열은 `TRUE`/`FALSE`로 쓴다(읽을 때는 `isTruthy_`가 O·Y·예도 받아 준다 — 명단 업로드 호환).

## status_changes (PRD 3.2, F6·F7)

| 열 | 값 |
| --- | --- |
| item | `학사` · `기숙사` · `조식` · `중식` · `석식` (`중식`은 방학 기간에만, 결정 73) |
| value (학사·기숙사) | `입실` · `퇴실` |
| value (조식·중식) | `실시` · `미실시` |
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
| counsel_notes | type | 일반 상담 = settings `counsel.types` 값(기본 `학습` · `생활` · `진로` · `진학` · `건강` · `가정` · `기타`(결정 103, C49-B; 2단계 기본값은 `학업`·`진학` 없음), C32), 그리고 예약어 `2OUT 학부모 면담`(OUT 화면 전용, 일반 상담 화면에서 고를 수 없음). 2단계 이전 값 `학습`·`진학`은 옛 행에만 남을 수 있다 |
| counsel_notes | target | `학생` · `학부모` |
| counsel_notes | show_to_parent / status | `TRUE`(기본, 2단계는 늘 TRUE) · `FALSE` / `유효` · `취소` |
| status_changes | requested_at | source `명단업로드`이면 `''`(C16). F6·F7은 날짜+시각 필수 |
| status_changes | linked_change_id | 한 번의 F6·F7 입력에서 대표 행 id. 대표 행은 `''`. "학사 및 기숙사 퇴실"의 기숙사 행, 퇴실 정리 급식 행, 퇴실과 함께 만든 일반 석식 행, F7 신청의 followUps가 대표를 가리킨다 |
| status_changes | source(연결 행) | 퇴실 정리 급식 행(미실시 중단 행)은 `F6`. F7 신청의 followUps는 **규칙이 준 `source`를 그대로** 쓴다(미실시 중단 행 = `F6`, 재입실 뒤 값 행 = `F7`, rules-api.md R11b). **F6 화면이 퇴실과 함께 만든 일반 석식 행은 `F7`**(신청이다 — MealRules.gs:168·183·261은 F6 행을 정리 행으로 보고 superseded·퇴실 취소 대상에서 뺀다) |
| status_changes | doc_submitted | 대표 행 `TRUE`·`FALSE`. 연결 행(일반 석식 행 포함)과 명단업로드 행은 `''`. 서류 미제출 목록은 `FALSE`만 센다 |
| status_changes | effective_date_auto | 규칙 계산값. effective_date와 다르면 교사가 고친 행(사유는 reason) |
| status_changes | reason(자동) | 퇴실 정리 행 `학사 퇴실 조식 중단`·`학사 퇴실 석식 중단`(movePlan_), 2OUT 퇴실 대표 행 `2OUT 퇴실`(날짜·면담 정보 없음). `2OUT 퇴실` 사유와 `[2OUT]`으로 시작하는 memo는 **예약어**다. 일반 입퇴실 입력(관리자 포함)에서는 거부하고, C20(`out.dismiss` + 면담 관문) 서버만 쓴다 |
| status_changes | reason·memo(임시 퇴실, 결정 70·77) | 건강상 임시 퇴실 대표 행: reason `임시 퇴실`, memo `[임시] return:yyyy-MM-dd`(+ 공백 뒤 사람이 쓴 사유). 연결 기숙사 퇴실 행 reason도 `임시 퇴실`. `임시 퇴실` 사유와 `[임시]`로 시작하는 memo는 **예약어**(일반 입력 거부, 임시 퇴실 유형만 쓴다). 둘이 다 있어야 임시 퇴실로 본다(`isTempLeaveRow_`) |
| status_changes | memo(일괄 퇴실, 결정 74①) | 학년 일괄 퇴실 대표 행: `[일괄] <batchId>`(UUID, `moveBatchPlan_`). 한 번에 되돌릴 때(`moveBatchUndoPlan_`) 쓴다. `[일괄]`로 시작하는 memo는 예약어(일반 입력 거부) |
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
| blocks, day_schedules | day_type | `mon_thu` · `fri` · `sat` · `sun` · `holiday`(휴일: 공휴일·재량휴업일, 09:00~21:50, 결정 72) (특별 코드는 관리자가 추가) |
| spaces | gender | `남` · `여` · `혼성` |
| seats | kind | `좌석` · `기둥` · `비상문` · `창문` |
| seat_assignments | status | `배정` · `취소` |
| avoid_pairs | scope | `좌석` · `방` · `둘 다` (결정 64) |
| avoid_pairs, rooms | status | `유효` · `취소` |
| rooms | gender | `남` · `여` |
| room_assignments | status | `배정` · `취소` |

## 0단계 탭(참고)

| 탭 | 열 | 값 |
| --- | --- | --- |
| enrollments | veritas | `TRUE` · `FALSE` |
| enrollments | commute_type | `일반` · `원거리(관내)` · `원거리(관외)` |
| enrollments | end_type | `23:00` · `23:50` |
| students | gender | `남` · `여` |
| students | track | `문` · `이` · `''` |
| events | status | `유효` · `취소` (취소는 `cancel_reason` 필수, 행은 지우지 않는다. 결정 80) |
| events | kind | settings `event.kinds`의 값 그대로(기본 `시험` · `행사` · `특강` · `휴업` · `기타`). 끝날이 비면 시작일 하루 |
| facility_logs_<기간> | status | `유효` · `취소` (취소는 행을 지우지 않는다. 학생 본인 취소는 사유 입력 없이 `cancel_reason` = `본인 취소`, 결정 83·총괄 결정) |
| facility_logs_<기간> | facility | settings `facility.names`의 값 그대로(기본 `특강실` · `원형테이블`). `start`·`end` = `HH:mm`(start < end), `companions` = 함께 쓴 학생 id 쉼표 목록(그 기간 학사생만, 본인 제외) |
| doc_types | status | `유효` · `취소` |
| student_docs_<기간> | state | `제출` · `미제출` · `해당없음` (학생·서류 종류마다 최대 1행, 행이 없으면 미제출) |
| programs | status | `유효` · `취소` (blocks는 exceptions와 같은 표기: `ALL` 또는 `HH:mm-HH:mm;…`) |
| program_participants | status | `유효` · `취소` (exception_id = 그 참가로 만든 '학사 내 프로그램' 사전 특이사항, 프로그램 취소 시 함께 취소) |
| students | phone | 학생 전화(개인 연락처, 결정 76) — `readAll_`에서 빠진다. `readContacts_`와 `contact.view` 통과 함수만 |
| guardian_links | name · phone | 보호자 이름·전화(개인 연락처, 결정 76) — 위와 같다. 감사 기록에는 값을 남기지 않는다 |
| users | roles | `admin` `duty_manager` `attendance` `hall_teacher` `homeroom` `student` `parent` (쉼표로 여러 개) |

## 6단계 (결정 89~101, S6-0 — 총괄이 검토하는 제안. 합의되면 규칙(R24~R26)·코딩(C49~C53)이 이 글자를 그대로 쓴다)

상담·진로진학은 학사생만 대상이다. 새 탭은 모두 첫 열 `id`·끝 공통 4열을 따르고, 삭제하지 않는다(`status` `취소` + `cancel_reason`). `term_id` = 그 기록이 생긴 운영 기간(결정 97: 교사는 그 기간의 담당 기준). 글 칸은 `audit_log`에 글자 수만 남는다(`Db.gs AUDIT_TEXT_COLS`).

| 탭 · 열 | 값 |
| --- | --- |
| terms · career_due | `yyyy-MM-dd` 또는 `''`(비면 진로 프로필 미제출 표시 없음, 결정 98) |
| career_profiles · version | 학생마다 `1`부터 정수 글자. **취소된 행도 번호를 쓴다**(번호를 다시 쓰지 않음) |
| career_profiles · hopes | JSON `[{"rank":1,"field":"…","job":"…"}]` (1~3순위, 순위 중복 없음) |
| career_profiles · targets | JSON `[{"university":"…","unit":"…","track":"…"}]` (0개 이상) |
| career_profiles · parent_fields | 학부모에게 공개한 항목을 `;`로: `hopes` · `targets` · `interests` · `strengths` · `concerns` (빈칸·모르는 값 = 모두 비공개, 결정 89). 학부모는 **가장 최근 유효 버전**의 공개분만 본다 |
| career_profiles · status | `유효` · `취소` |
| course_plans · state | `계획` · `확정`(= 담당교사가 확인함, `confirmed_by`·`confirmed_at`) |
| course_plans · semester | `1` · `2` |
| course_plans · show_to_parent | `TRUE` · `FALSE`(기본 `FALSE`) |
| course_plans · status | `유효` · `취소`(과목 줄마다 취소 + 새 줄, 결정 99) |
| inquiry_records · source | `ChatGPT` · `연결 예시` · `기본 추천`(탐구발견 파일의 출처 값 그대로) |
| inquiry_records · standards | 성취기준 코드 2개를 `;`로(예 `[12가짜01-01];[12가짜01-02]`) |
| inquiry_records · progress | `관심` · `진행 중` · `완료` |
| inquiry_records · result_link | `http://` 또는 `https://`로 시작하는 주소 또는 `''` |
| inquiry_records · liked · name_mismatch · show_to_parent | `TRUE` · `FALSE` (name_mismatch = 파일 속 이름이 계정과 다름, 결정 93) |
| inquiry_records · file_id | 원본 JSON의 Drive 파일 id(비공유 폴더). **관리자 외 응답에 내보내지 않는다** |
| inquiry_records · status | `유효` · `취소`(정리 대상 확인 뒤 원본 파일을 지우면 요약 행은 `취소`, 결정 100) |
| feedback · target_kind | `진로 프로필` · `이수 계획` · `탐구 기록` (target_id = 그 탭의 행 id) |
| feedback · status | `유효` · `취소` |
| counsel_requests · status | `신청` · `확정` · `완료` · `반려` · `취소` (열린 신청 = `신청`·`확정`, 학생마다 1건까지, 결정 95) |
| counsel_requests · topic | `생활` · `학습` · `진로` · `진학` · `기타` |
| counsel_requests · wish_dates | 희망 날짜 1~3개를 `;`로(`yyyy-MM-dd`) |
| counsel_requests · decided_date | 확정한 상담 날짜(`확정`·`완료`), 그 밖에는 `''` |
| counsel_requests · cancel_reason | `반려` 사유(학생에게 보임, 결정 95)·`취소` 사유 |
| counsel_requests · linked_note_id | `완료`일 때 연결한 `counsel_notes.id` |
| counsel_notes · agreement_to_parent | `TRUE` · `FALSE`(건마다 학생이 켬, 기본 `FALSE`, 결정 90). `show_to_parent`(상담했다는 날짜·교사 표시)와 별개 |
| counsel_notes · profile_version | 참고한 진로 프로필 버전(정수 글자) 또는 `''` |
| counsel_notes · request_id | 연결한 `counsel_requests.id` 또는 `''` |
| curriculum_courses *(설정 스프레드시트, S6-1)* · entry_year · grade · semester | `2027`처럼 4자리 입학년도 · `1`~`3` · `1`/`2` |
| curriculum_courses · choice_group · pick_n | 선택군 이름(비면 필수 과목, pick_n `0`) · 선택군이 있으면 `1`~`20`(같은 선택군은 줄마다 같음) |
| curriculum_courses · course | 과목 이름(표준 과목 이름과 같게. 다르면 올릴 때 경고만) |
| course_recommendations *(설정 스프레드시트, S6-1)* · base_year · university · unit | `2028`처럼 4자리 기준 연도 · 대학 · 모집단위(같은 대학·모집단위가 여러 줄일 수 있음) |
| course_recommendations · core_courses · recommended_courses | 과목 이름을 `;`로 구분(공백 앞뒤 무시, 중복 합침) |
| course_recommendations · source_url · source_title · note | `http(s)://` 주소 또는 `''` · 출처 이름 · 비고 |
| curriculum_courses · course_recommendations · status | `유효` · `취소`(관리자가 새 글로 다시 올리면 빠진 줄이 `취소`, 삭제 없음) |

**제안 — 아직 정하지 못한 값(총괄·선생님 확인):** (1) `settings counsel.types` 기본값은 `학업,생활,진로,건강,가정,기타`인데 PRD F17·7절의 유형은 `생활·학습·진로·진학·2OUT 학부모 면담·기타`다(`학업`↔`학습`, `진학`·`건강`·`가정` 차이). 상담 신청 `topic`은 PRD대로 두었다. 일지 유형 목록을 PRD에 맞출지 결정이 필요하다. (2) 공개 항목 이름(`hopes`…`concerns`)은 코드 안의 영문 이름이다 — 화면 이름은 C50이 정한다.

## settings 키(설정 스프레드시트 `settings` 탭)

`key` 열의 이름과 `value` 형식. 앞뒤 공백은 무시한다. **값이 빈칸이거나 행이 없으면 '기본값'대로 동작한다.**
`tests/core/settings_keys.test.js`가 코드가 읽는 키가 이 표에 모두 있는지 검사한다(새 키를 쓰면 여기에 줄을 더한다).
'누가 고치나'가 시트이면 소유자가 설정 시트를 손으로 고친다(데이터 시트가 아니라 설정 시트라 손편집 대상이다). 기본값 행은 `setup()`이 `Schema.gs DEFAULT_SETTINGS`로 처음 한 번 만든다.

| 키 | 값 형식 | 쓰는 곳 | 기본값(없을 때) | 누가 고치나 |
| --- | --- | --- | --- | --- |
| `study.weekday.start` · `study.weekday.end` | `HH:mm` | Schedule.gs `calDefaults_` → `resolveDayPlan_` defaults(월~목) | `18:30` · `23:50` | 시트 |
| `study.fri.start` · `study.fri.end` | `HH:mm` | 같음(금) | `18:30` · `23:00` | 시트 |
| `study.sat.start` · `study.sat.end` | `HH:mm` | 같음(토) | `09:00` · `17:00` | 시트 |
| `study.sun.start` · `study.sun.end` | `HH:mm` | 같음(일) | `14:00` · `22:00` | 시트 |
| `study.holiday.start` · `study.holiday.end` | `HH:mm` | 같음(휴일, 결정 72) | `09:00` · `21:50`(`CAL_HOLIDAY_DEFAULT` — DEFAULT_SETTINGS 행 없음) | 시트 |
| `meal.morning_cutoff` | `HH:mm` | Meals.gs → `mealCutoffHm_`·`mealEffectiveDate_`(실시·일반 석식 당일 마감, 미실시 수요일 마감, 결정 2·71) | `11:30`. 시각이 아니면 오류(다른 마감으로 조용히 계산하지 않음) | 시트 |
| `exception.types` | 유형 이름 쉼표 목록 | Exceptions.gs `excSettings_`(F1 칩), 자동 OUT | DEFAULT_SETTINGS 11개 유형 | 시트 |
| `exception.auto_out_types` | 유형 이름 쉼표 목록 | `excSettings_` → `reconcileAutoOuts_` autoTypes, `AUTO_OUT_SINCE` 넓힘 이력(결정 40) | `미인정지각,미인정조퇴,미인정결석` | 시트 |
| `event.kinds` | 종류 이름 쉼표 목록 | Events.gs `evtKinds_`(월별 일정 등록 화면의 종류 목록) | `시험,행사,특강,휴업,기타`(결정 80) | 시트 |
| `facility.names` | 시설 이름 쉼표 목록 | 시설 사용 일지 시설 목록(F10, C35에서 읽는다) | `특강실,원형테이블`(결정 83) | 시트 |
| `exception.type_short` | `유형:약어` 쉼표 목록 | `excSettings_`·AttendanceSheet.gs `sheetSettings_` → `resolveCell_` typeShort | DEFAULT_SETTINGS 약어표 | 시트 |
| `attendance.end_type_day_types` | 요일 유형 쉼표 목록(`mon_thu`·`holiday` 등) | `sheetSettings_` → `resolveCell_` endTypeDayTypes(R3 END) | `mon_thu` | 시트 |
| `attendance.end_label` | 글자 | `sheetSettings_` → END 칸 글자 | `정상 종료` | 시트 |
| `attendance.legend` | 글자 | (아직 쓰지 않음 — 범례는 PRD F2 기본값) | — | 시트 |
| `print.title` | 글자 | `sheetSettings_` → 출석부 머리말 | `신한학사 출석부` | 시트 |
| `print.vacant_label` | 글자 | `sheetSettings_` → 빈 좌석 표기 | `공석` | 시트 |
| `timetable.submit_start_day` · `timetable.submit_end_day` | 날짜 숫자 · 숫자 또는 `last` | `ttSubmitWindow_`(F9 시간표 제출 기간, R23 — 화면은 C37) | `25` · `last` | 시트 |
| `counsel.types` | 유형 이름 쉼표 목록(`2OUT 학부모 면담`과 겹치는 이름은 무시) | CounselLog.gs `cnlTypes_`(상담일지 유형 칩, C32) | `학습,생활,진로,진학,건강,가정,기타` | 시트 |
| `out.instant_rule_ids` | violation_rules `id` 쉼표 목록 | Outs.gs `vioInstantIds_` → `outInstantNext_`·`vioOutOpts_`(결정 69·78) | 즉시 퇴실 항목 없음 | **화면**(OUT 항목 설정, `setOutInstantRule` — 지정 이력 `OUT_INSTANT_SINCE`와 함께 바뀌므로 시트로 고치지 않는다) |

### 스크립트 속성(Script Properties)

코드가 쓰는 이름 전부. 값이 비밀(파일·폴더 ID, 시험 계정)인 것은 코드·문서·백업 값에 적지 않는다. **백업**은 `Backup.gs BAK_STATE_VALUES`(앱상태.json에 값까지 남김) 여부 — 나머지는 이름만 남는다.

| 이름 | 값 | 쓰는 곳 | 백업 값 |
| --- | --- | --- | --- |
| `DB_ID` · `COUNSEL_ID` · `CONFIG_ID` | 스프레드시트 ID(비밀) | Schema.gs `DB_FILES` → Db.gs·Setup.gs·Backup.gs·RepairIds.gs | 아니오 |
| `AUTO_OUT_SINCE` | JSON `{types, since, widened}` | AutoOuts.gs `vioAutoSince_` ↔ `outAutoSinceNext_`(결정 40) | 예 |
| `OUT_INSTANT_SINCE` | JSON `{ids, periods}` | Outs.gs ↔ `outInstantNext_`(결정 78) | 예 |
| `FAC_HANDLE_SALT` | 무작위 글(UUID) | Facility.gs `facHandle_` — 함께 쓴 학생을 고르는 불투명 표식의 소금(처음 쓸 때 만든다, 지우거나 바꾸면 열려 있는 쓰기 화면의 표식만 무효). 값은 응답·기록에 넣지 않는다 | 아니오 |
| `MAIL_ENABLED` | `true`일 때만 메일 | Notify.gs·AutoOuts.gs·Outs.gs | 예 |
| `DIAG_ENABLED` | `true`일 때만 진단 화면(`diagPing`) | Code.gs·Setup.gs(처음 setup 때 `true`) — 시범 운영 전 `false`(pilot-guide 1절) | 예 |
| `BACKUP_FOLDER_ID` | Drive 폴더 ID(비밀) | Backup.gs | 아니오 |
| `INQUIRY_FOLDER_ID` | Drive 폴더 ID(비밀) — 탐구 원본 파일을 두는 비공유 폴더 '신한1학사_탐구원본'(처음 올릴 때 만들어 저장, 공유되어 있으면 올리지 않는다) | Inquiry.gs(C52) | 아니오 |
| `BACKUP_RUNNING` | 시작 시각(ms) — 겹친 실행 막기, 30분 뒤 저절로 풀림 | Backup.gs | 아니오 |
| `TEST_STUDENT_EMAIL` · `TEST_PARENT_EMAIL` · `TEST_TEACHER_EMAIL` · `TEST_HOMEROOM_EMAIL` | 시험 계정(비밀, 개발용) | src/dev FakeData.gs·FakeStage2.gs | 아니오 |
| `SPIKE_TEMPLATE_ID` | 인쇄 시험 템플릿 ID(개발용) | src/dev PrintSpike.gs | 아니오 |
