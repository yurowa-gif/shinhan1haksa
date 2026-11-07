# 규칙 함수 계약(rules-api)

> **소유: RULES 세션.** S0(총괄)이 `docs/plan/stage1.md` 2절의 공통 규칙과 함수 시그니처를 그대로 옮겨 초안을 만들었다. 이후에는 RULES 세션이 고치고, CODING은 여기 적힌 이름과 모양으로 부른다. 시그니처를 바꾸는 PR은 설명에 "계약 변경"이라고 적고 CODING이 확인한다.
>
> R7 완료 기준: 이 문서에 적힌 함수 이름이 `src/rules/`에 모두 있다(테스트로 확인).

## 공통 규칙

- `src/rules/*.gs`에서는 다음을 쓰지 않는다: Apps Script 서비스, 인자 없는 `new Date()`, 다른 파일의 전역 값.
- 입출력 형식:
  - 날짜: 'yyyy-MM-dd'
  - 시각: 'HH:mm'('24:00' 허용)
  - 일시: 'yyyy-MM-ddTHH:mm:ss'(KST, `nowIso_`와 같은 형식)
- 내부 계산은 `Date.UTC`로만 한다. 함수 이름은 모두 `_`로 끝낸다.
- 테스트는 표 형식(table-driven)으로 쓰고, `TZ=UTC`와 `TZ=Asia/Seoul`에서 각각 한 번씩 실행해 모두 통과해야 한다.
- 아직 확정되지 않은 규칙은 기본값으로 구현하고 `// ASSUMPTION:`을 달며, 테스트 이름에 "(가정)"을 붙인다.

`npm test`가 자동으로 검사하는 것(`tests/core/security.test.js`):
- `src/rules/**`에서 Apps Script 서비스 사용(`SpreadsheetApp.`·`Utilities.`·`Session.`처럼 이름 뒤에 `.`·`(`·`[`)과 현재 시각 읽기(인자 없는 `new Date()`, `Date.now()`)를 찾으면 실패한다. 주석도 같이 검사하므로 주석에서는 "Session 서비스"처럼 점 없이 쓴다.
- `src/` 전체에서 최상위 이름(function·var·let·const·class)이 겹치면 실패한다. 규칙 파일은 모듈 접두어(`ymd…`·`hm…`·`meal…` 등)를 쓴다.
- `npm test`는 TZ=Asia/Seoul과 TZ=UTC에서 한 번씩 돈다. 지금 시간대로 한 번만 돌리려면 `node tests/run.js --once`, 일부 파일만 돌리려면 `node tests/run.js rules`.

## 함수 시그니처

```js
// src/rules/DateRules.gs
function ymdIsValid_(s)                     // boolean
function ymdAddDays_(ymd, n)                // 'yyyy-MM-dd'
function ymdWeekday_(ymd)                   // 0=일 … 6=토
function ymdWeekdayKo_(ymd)                 // '월'…'일'
function ymdMondayOf_(ymd)                  // 월~일 주의 월요일
function ymdRange_(from, to, maxDays)       // 양 끝 포함 배열, 기본 최대 366
function ymdDiffDays_(a, b)                  // b - a 날 수(R1 추가)
function ymdDaysInMonth_(year, month)       // 그 달의 날 수, month 1~12(R1 추가)
function hmIsValid_(hm)                     // 'HH:mm'(00:00~23:59, '24:00') 인지(R1 추가)
function hmToMin_(hm)                       // 'HH:mm' → 분, '24:00' = 1440
function minToHm_(min)
function isoLocalSplit_(iso)                // → {date:'yyyy-MM-dd', min:Number, sec:Number}(sec는 R1 추가)
// 모든 규칙 파일이 함께 쓰는 헬퍼(R7 추가 — 파일마다 따로 있던 같은 함수를 합침)
function ruleStr_(v)       // 셀 값 → trim한 문자열(undefined·null은 '')
function ruleIso_(v)       // 일시 비교용: 'yyyy-MM-dd HH:mm:ss' → 'T' 형식
function ruleRowLive_(r)   // status 빈칸·'유효'
function hmNorm_(v)        // 'H:mm'·'HH:mm:00' → 'HH:mm', 빈칸 '', 시각 아님 null(ScheduleRules.schedNormHm_은 features/Schedule.gs가 부르는 같은 함수)

// src/rules/ScheduleRules.gs
function baseDayType_(ymd)                  // 'mon_thu'|'fri'|'sat'|'sun'
function schedOperatingValue_(v)            // day_schedules.operating 값 → boolean(R1 추가)
function pickDaySchedule_(rows, ymd)        // 취소 제외, updated_at 최신 1행 또는 null
function validateBlocks_(blocks)            // [{index, message}]
/** src = {termType:'학기'|'방학', daySchedule:row|null, blocks:rows[], defaults:{mon_thu:{start,end}, fri, sat, sun}}
 *  → {date, operating, dayType, start, end, blocks:[{seq,start,end,label,key:'HH:mm-HH:mm'}], memo, warnings:[]} */
function resolveDayPlan_(ymd, src)

// src/rules/AttendanceRules.gs
function parseBlockSpec_(spec)              // 'ALL' | 'HH:mm-HH:mm;…' → {all, ranges:[{start,end}], errors:[]}(errors는 R3 추가)
function formatBlockSpec_(parsed)
function blockSpecCovers_(spec, block)      // 겹치면 true
function effectiveFixedRows_(rows, studentId, ymd)
/** c = {block:{seq,start,end}, isLastBlock, dayType, weekdayKo, exceptions:rows[], fixedRows:rows[], endType:'23:00'|'23:50'|'', dayEnd:'HH:mm'(R3 추가, 선택),
 *        opts:{endTypeDayTypes:['mon_thu'], endTime:'23:00', typeShort:{유형:약어}, endLabel:'정상 종료'}}
 *  → {code:'EXC'|'FIXED'|'END'|'NONE', text, exceptionId, more} */
function resolveCell_(c)
function resolveStudentDay_(plan, s, opts)  // s = {exceptions, fixedRows, endType} → 블록 순서대로 [{seq, code, text, exceptionId, more}]

// src/rules/StatusRules.gs
function statusOn_(changes, studentId, item, ymd)   // item '학사'|'기숙사'|'조식'|'석식' → 값 또는 ''
function isActiveOn_(changes, enrollment, ymd)      // 등록 + 학사 '입실'
function assignmentOn_(assignments, seatId, termId, ymd)
function seatMapOn_(seats, assignments, enrollments, changes, termId, ymd)
        // → {bySeat:{seatId:{studentId|null, vacant, reason:''|'퇴실'|'미입실'|'미배정'}}, unseated:[studentId], warnings:[]}
        //   ('미입실'·warnings는 R2 추가)
function carryOverEnrollments_(terms, enrollments, changes, newTerm)  // 직전 '학기'의 재학생 → 새 등록 초안

// src/rules/RosterRules.gs
function parseRosterTable_(rows)            // 2차원 배열(10.2 열 순서) → {records, errors:[{line,column,message}]}
function parseGuardianTable_(rows)
function rosterColumns_()                   // 학생 명단 머리글 16열(PRD 10.2, R2 추가)
function rosterGuardianColumns_()           // 학부모 연결 머리글 3열(R2 추가)
function diffRoster_(records, existing, termId, ymd)
        // existing = {students, enrollments, changes, users}
        // → {createStudents, updateStudents:[{id,patch}], createEnrollments, updateEnrollments,
        //    createChanges, leavingCandidates, ambiguous, warnings}

// src/rules/MoveRules.gs (R11a)
function movePlan_(changes, studentId, move, opts)
        // move = {type:'학사 입실'|'학사 퇴실'|'기숙사 입실'|'기숙사 퇴실'|'학사 및 기숙사 퇴실', effectiveDate, requestedAt,
        //         dinner:'중단'|'일반 석식', breakfastWithDorm, breakfastStopWithDorm}, opts = {today(필수), cutoff}
        // → {errors, warnings, rows:[{item, value, effective_date, effective_date_auto, requested_at, reason, source, head}],
        //    toCancel:[{id, cancel_reason}], summary:{date, breakfast:{value,from}|null, dinner:{value,from}|null}}

// src/rules/OutRules.gs
function reconcileAutoOuts_(exceptions, violations, opts)
        // exceptions·violations는 그 기간의 모든 행(일부만 넘기면 다른 학생의 자동 OUT이 취소된다), violations는 created_at 필수
        // opts = {autoTypes, ruleName:'무단 지각·결석·이탈', ruleId, per:'group'|'row', dutyByDate:{}, studentIds:[](선택),
        //         autoTypeSince:{유형:'yyyy-MM-ddTHH:mm:ss'}(선택, 설정을 넓혀 새로 자동 대상이 된 유형과 가장 최근에 넓힌 시각)}
        // → {toCreate, toCancel:[{violationId, reason}], toUpdate:[{violationId, patch}]}
function outLevel_(violations, studentId, termId)   // {count, level:0|1|2, label:''|'1OUT'|'퇴실 대상'}

// src/rules/MealRules.gs
function mealEffectiveDate_(kind, requestedAt, opts)
        // kind 'start'|'to_general'|'stop'|'with_dorm_entry'|'on_leave'|'initial'(R6 추가)
        // opts = {cutoff:'11:30', entryDate, leaveDate} → {date, rule}
function mealChangeKind_(item, fromValue, toValue)
        // → 'none'|'initial'|'start'|'to_general'|'stop'. fromValue = 새 행 적용일에 실제로 적용되는 값(R6)
function mealPlanChange_(changes, studentId, item, toValue, requestedAt, opts)   // F7 신청 하나의 계획(R6 추가)
        // opts = {cutoff, leaveDate, today(필수), effectiveDate, effectiveRule:'manual'|'entry_date'(R10)}
        //   → {kind, date, rule, autoDate(R10), from, blocked, superseded, toCancel:[…], followUps:[…], warnings:[]}
function mealPendingToCancel_(changes, studentId, item, effectiveDate, opts)     // 새 행이 덮어야 할 행(R6 추가)
        // opts = {source:'F7'|'F6', requestedAt, newValue} → [{id, effective_date, value}]
```

## 동작 메모(R1, 2026-11-06)

**DateRules**
- `ymd…`·`hm…`·`isoLocalSplit_`은 잘못된 날짜·시각을 받거나 결과가 `yyyy-MM-dd` 범위를 벗어나면 조용히 넘기지 않고 `Error`를 던진다(공통 헬퍼 `ruleStr_`·`ruleIso_`·`ruleRowLive_`·`hmNorm_`은 던지지 않는다). 화면 입력 검사는 `ymdIsValid_`·`hmIsValid_`로 먼저 한다.
- `ymdRange_(from, to, maxDays)`: from이 to보다 늦으면 빈 배열, 날 수가 `maxDays`(기본 366)를 넘으면 Error. `maxDays`는 1 이상의 정수만(NaN·문자열이면 Error — 설정값이 비어 검사가 꺼지지 않게).
- `isoLocalSplit_`: `'yyyy-MM-ddTHH:mm:ss'`, `'yyyy-MM-ddTHH:mm'`, `'yyyy-MM-dd HH:mm:ss'`를 받는다. `Z`·`+09:00`이 붙은 값은 거부한다(KST 벽시계 값만). `min`은 초를 버린 분이라 11:29:59 → 689, 11:30:00 → 690. 마감 비교는 `min >= hmToMin_('11:30')`.
- `hmIsValid_`·`hmToMin_`은 엄격한 `'HH:mm'`만 받는다. 시트 값을 읽을 때의 너그러운 해석은 `hmNorm_`(DateRules, R7)이 한다: `'9:00'`·`'21:30:00'` → `'HH:mm'`, 빈칸 `''`, 시각이 아니면 `null`(던지지 않음).
- `ruleRowLive_`: status 빈칸·`'유효'`인 행(status_changes·violations처럼 유효·취소를 쓰는 탭).

**ScheduleRules**
- 시트 행은 `readAll_`이 돌려주는 문자열 그대로 받는다. `status`가 `'취소'`(앞뒤 공백 무시)인 행은 모두 무시한다.
- **CODING(C2) 주의:** `blocks.start/end`, `day_schedules.start/end/date` 열은 시트에서 **일반 텍스트(@) 서식**이어야 한다. 시각 서식이면 `getValues()`가 Date를 주고 `cellToString_`이 `'1899-12-30'`으로 바꿔 시각을 잃는다(규칙 함수는 그 행을 건너뛰고 경고한다).
- 시각 열은 `'HH:mm'`과 함께 `'H:mm'`(`9:00`), 초가 00인 `'HH:mm:ss'`(`21:30:00`)도 읽는다. 결과는 늘 `'HH:mm'`.
- `pickDaySchedule_`: 같은 날짜가 여럿이면 `updated_at`이 가장 늦은 행, 같으면 시트에서 더 아래 행.
- `resolveDayPlan_(ymd, src)`:
  - `daySchedule`이 취소 행이면 무시, 다른 날짜 행이면 무시하고 경고.
  - `dayType` = 날짜별 일정의 `day_type` → 없으면 `baseDayType_`.
  - `start`·`end` = 날짜별 일정 값 → `defaults[dayType]` → 블록의 처음 시작·가장 늦은 끝. 기본 유형(mon_thu·fri·sat·sun)인데 `defaults`가 없어 블록 시각을 쓰면 경고. **C7은 `defaults`에 네 유형을 모두 넣는다**(금요일은 `study.fri.*`, 결정 23 ⑦ 18:30).
  - 시작 `'24:00'`은 잘못된 값(블록 시작과 같은 규칙), 종료 `'24:00'`은 허용.
  - 블록 = `term_type`·`day_type`이 맞고 취소되지 않은 행을 **시작 시각 순**으로. 같은 `seq`가 둘 이상이면 `updated_at` 최신 1행(경고). `seq`는 1부터 다시 매긴다. 남은 블록끼리 시간이 겹치면 그대로 내보내되 경고.
  - **종료 시각 이후에 시작하는 블록(시작 ≥ 종료)은 뺀다**(stage1 4절 d). 22–24 블록은 종료 22:00이면 빠지고, 22:01·23:00이면 남는다. 블록 시각 자체는 자르지 않는다(`key`는 원래 `'HH:mm-HH:mm'`).
  - 시작 시각 변경은 블록에 영향이 없다.
  - ASSUMPTION: `termType === '방학'`인데 그 요일 유형의 방학 블록(취소 제외)이 없으면 같은 요일 유형의 학기 블록을 쓴다. 방학 행이 있었는데 모두 잘못된 행이라 학기 블록을 쓴 경우에만 경고한다.
  - 운영 안 하는 날: `operating:false`, `blocks:[]`, `memo`는 그대로, 시작·종료 경고는 내지 않는다.
  - 잘못된 블록 행·시각은 건너뛰고 `warnings`에 적는다(출석부 생성이 멈추지 않게). 잘못된 날짜(`ymd`)만 Error. 운영하는 날인데 `blocks`가 비면 `'블록이 없습니다'` 경고가 있다 — C7은 이때 렌더러를 부르지 말고 경고를 보여 준다.
  - `label` = 블록 행의 `label`, 비어 있으면 정각은 분을 뺀 두 자리 표기(`'18–20'`, `'09–12'`, `'14–15:30'`, 줄표 `–`).
- `schedOperatingValue_`: 운영 = 빈칸·`TRUE`·`Y`·`YES`·`O`·`1`·`예`·`운영`. 운영 안 함 = `FALSE`·`N`·`NO`·`X`·`×`·`0`·`OFF`·`아니오`·`아니요`·`미운영`·`운영 안 함`·`운영X`·`휴무`·`휴일`(대소문자·공백 무시). ASSUMPTION: 둘 다 아닌 값(오타)은 **운영 안 함**으로 보고 `resolveDayPlan_`이 경고한다(잘못된 출석부가 조용히 인쇄되는 것보다 눈에 띄게). C4 화면은 `FALSE`/빈칸으로 쓰면 된다.
- `validateBlocks_`: 취소 행은 건너뛴다. 행마다 `term_type`(학기·방학)·`day_type`(빈칸 불가)·순서(1 이상 정수)·시각 형식(시작은 24:00 불가, 끝은 24:00 허용)·시작<끝. `(term_type, day_type)` 묶음 안에서 같은 순서 중복·시간 겹침(맞닿음은 허용)·순서 번호와 시각 순서 불일치. 순서가 잘못된 행도 시각이 맞으면 겹침 검사에 넣는다.
- 규칙 파일끼리는 함수만 부른다(ScheduleRules → DateRules). 전역 값은 공유하지 않는다. 테스트는 `loadGs(['src/rules/DateRules.gs', 'src/rules/ScheduleRules.gs'])`처럼 함께 올린다.

## 동작 메모(R2, 2026-11-06)

값 글자는 `docs/contracts/vocabulary.md`를 따른다.

**StatusRules**
- `statusOn_`: 같은 학생·item에서 status `유효`(빈칸도 유효로 봄)인 행만, `effective_date <= ymd` 중 가장 늦은 적용일. 같은 적용일이면 `requested_at`이 늦은 행 → `created_at`이 늦은 행 → 시트에서 아래 행. 일시는 `'yyyy-MM-dd HH:mm:ss'`(공백)도 `T` 형식과 같은 순서로 비교한다. `취소`·`요청` 등 다른 status와 날짜 형식이 아닌 적용일은 무시.
- `isActiveOn_`: 등록 행이 있고 학사 `입실`. 기간 날짜 범위 확인은 부르는 쪽이 한다. ASSUMPTION(결정 23 ①): 퇴실 적용일 당일부터 학사생이 아니다.
- `assignmentOn_`: 기간·좌석이 같고 status가 `취소`가 아니며 `valid_from <= ymd <= valid_to`(빈칸 = 기간 전체). 여럿이면 날짜를 좁힌 배정(방학 날짜별 자리표) → `valid_from`이 늦은 것 → `updated_at`이 늦은 것.
- `seatMapOn_`: `bySeat`에는 kind `좌석`이고 취소되지 않은 좌석만. 사유: 배정 없음 `미배정`, 그날 학사 `퇴실` `퇴실`, 이 기간 등록이 없거나 아직 입실 전 `미입실`. 셋 다 공석(`vacant:true`)이고 출석부에는 "공석"으로만 쓴다(sheet-model). 한 학생이 그날 두 자리면 위 우선순위로 하나만 쓰고 경고. `unseated`는 등록 행 순서(정렬은 C7이 학년 → 이름으로).
- `carryOverEnrollments_`: 새 기간이 `학기`일 때만. 직전 학기 = 시작일이 새 기간보다 앞인 `학기` 중 가장 늦은 것(방학은 건너뜀). 새 기간 시작일에 학사 `입실`인 학생만, 이미 새 기간에 등록된 학생은 뺀다(두 번 눌러도 중복 없음). 결과에는 id가 없고 `from_enrollment_id`가 있다. ASSUMPTION: 학년도가 바뀌어도 학년으로 거르지 않는다(졸업생은 명단 업로드의 퇴실 후보로).

**RosterRules**
- 표 나누기(TSV·CSV, 따옴표)는 C3가 한다. 규칙 함수는 2차원 배열을 받는다. 첫 줄은 머리글(`rosterColumns_()` 순서 그대로, BOM·앞뒤 공백·끝 빈칸 허용). 빈 줄은 건너뛰고 `line`은 원래 줄 번호(머리글 = 1).
- O/X: `O ○ 〇 ◯ Ｏ Y YES TRUE` / `X × Ｘ ✕ N NO FALSE`(대소문자 무시). **숫자 0·1은 오류**(글자 O 대신 숫자 0을 친 것을 X로 읽지 않게). 석식: `학사`·`학사 석식` / `일반`·`일반 석식` / `미실시`·`X`.
- 오류(저장 안 함): 형식, 학번·학생 계정 중복(두 줄 모두). 경고: 학번과 학년·반·번호 불일치, 학생 계정·담당교사 빈칸. 통학구분 빈칸은 `일반`, end_type은 `23:50`(ASSUMPTION 4절 h).
- `diffRoster_`:
  - 새 학생은 `ref: 'new:학번'`. `createEnrollments`·`createChanges`의 `student_id`에도 같은 ref가 들어가므로 C3가 새 id로 바꿔 넣는다.
  - 학생 찾기: ① 학생 계정 ② 학번(다른 줄이 계정으로 잡은 학생은 뺌). 학번은 학년도마다 다시 쓰이므로 **학번이 같아도 계정이 서로 다르거나 이름이 다르면 새 학생**(경고). ambiguous(아무것도 만들지 않음)는 학번·이름이 같은데 학년이 다를 때, 같은 학번·이름이 여럿일 때, 명단 두 줄이 같은 학생을 가리킬 때.
  - ASSUMPTION: **상태는 그 항목 기록이 아직 없을 때만 만든다(초기값).** 이미 기록이 있고 명단과 다르면 바꾸지 않고 경고 — 학기 중 변경은 F6·F7(급식 적용일 규칙)로 한다. 그래서 같은 파일을 언제 다시 올려도 상태 변경 0건이다. `ymd`는 보통 기간 시작일, 학기 중 신규 학생을 올리면 그날.
  - 기존 등록의 `end_type`은 바꾸지 않는다. 학생 계정이 비어 있는 명단 줄은 있는 계정을 지우지 않는다.
  - 경고: 담당교사가 users에 없거나 비활성, 학번 재사용으로 새 학생을 만듦, 바뀐 학번이 다른 학생 기록과 겹침, 계정 없는 기존 학생과 이름·성별이 같은 새 학생(학년이 올라간 학생을 잇지 못했을 수 있음).
  - `leavingCandidates`: 이 기간 등록이 있고 ymd에 학사생인데 명단에 없는 학생(ambiguous 후보는 뺌). 표시만 한다.

## 동작 메모(R3, 2026-11-06)

**AttendanceRules**
- 블록 표기: `'ALL'`(대소문자·공백 무시) 또는 `'HH:mm-HH:mm;…'`. "15:00부터 귀가" = `'15:00-24:00'`. 한 자리 시(`9:00`)·`–`·`~`도 읽는다. `parseBlockSpec_`은 범위를 시작 순으로 정렬하고 겹치거나 맞닿은 범위를 합친다. 잘못된 조각은 `errors`에 적고 뺀다(C5 입력 화면은 `errors`가 있으면 저장을 막는다). 저장은 `formatBlockSpec_(parseBlockSpec_(입력))`으로 정규 표기를 쓴다.
- `blockSpecCovers_`: 겹치면 true, 맞닿기만 하면(18:00-20:00 / 20:00-22:00) false. 잘못된 표기는 false.
- `effectiveFixedRows_`(결정 31): 적용월 ≤ 그날의 달 중 **확정 행이 있고 `제출`·`동의` 행이 남아 있지 않은 가장 최근 달**의 확정 `학`·`가` 행. 그 달이 `없음` 행뿐이면 `[]`(앞 달 시간표가 이어지지 않는다). 확정 행이 있는 달이 없으면 `[]`. 한 달의 일부만 확정된 동안은 앞 달을 유지한다(ASSUMPTION, R3). 요일은 `resolveCell_`이 고른다.
- `resolveCell_` 우선순위: 확정 특이사항(EXC) > 확정 고정 일정 `학`·`가`(FIXED) > 23:00 종료(END) > 빈칸(NONE). 특이사항 `요청`·`취소`, 고정 일정 `제출`·`동의`·`반려`·`취소`는 무시.
  - EXC가 여럿이면 가장 최근 확정(`confirmed_at` → `updated_at` → 나중 행) 1건의 약어 + `' 외 N'`, `more = N`, `exceptionId` = 그 건(가정 c).
  - 약어: `opts.typeShort`(설정 `exception.type_short`, 없으면 sheet-model 기본표). 행의 유형 그대로 찾고, 없으면 **양쪽(행의 유형과 약어표 키) 모두 끝의 괄호 설명을 뗀 이름끼리** 비교하고(관리자가 괄호 설명을 고쳐도 옛 행이 약어로 나오게), 그래도 없으면 괄호를 뗀 이름을 그대로 쓴다.
  - FIXED가 여럿이면 `teacher_confirmed_at` → `updated_at` 최신.
  - END: `endType`(`'23:00:00'`도 읽음) `=== opts.endTime`(기본 `'23:00'`), `dayType`이 `opts.endTypeDayTypes`(기본 `['mon_thu']`, 항목 앞뒤 공백 무시)에 있음, 마지막 블록, **그 블록과 그날 종료(`dayEnd`)가 모두 종료 시각보다 늦게 끝남**. ASSUMPTION: 날짜별 종료를 23:00 이하로 당긴 날(22:00·22:30·23:00)은 모두 그 시각에 귀가하므로 표시하지 않는다. ASSUMPTION: 특별 요일 유형(`exam` 등)으로 바꾼 날은 실제 달력 요일의 기본 유형으로 판정한다(목요일 exam → 표시, 금요일 exam → 표시 안 함).
- `resolveStudentDay_`: 운영 안 하는 날은 `[]`. `exceptions`는 `date === plan.date`인 행만 쓴다(**날짜가 빈 행은 쓰지 않는다** — 빈 날짜 하나가 모든 날에 찍히지 않게). `plan.end`를 `dayEnd`로 넘긴다. `fixedRows`는 `effectiveFixedRows_` 결과를 넘긴다. 고정 일정 요일은 요일 유형이 아니라 **실제 달력 요일**(`ymdWeekdayKo_`). C7은 결과에서 `seq·code·text`만 sheet-model `marks`로 옮긴다.

## 동작 메모(R5, 2026-11-07, 총괄 검토 3차 반영)

**OutRules** — violations 탭(`violations_<기간>`)은 2단계 F4에서 만든다. 이 함수는 아무것도 쓰지 않는다. 값 글자는 vocabulary.md violations 절. `tests/rules/out_oracle.test.js`가 단순한 오라클 모델과 무작위 시험(시드 고정 300가지)으로 비교한다.
- **입력 범위:** `exceptions`·`violations`는 **그 기간의 모든 행**. 일부만 넘기면 넘기지 않은 특이사항에 연결된 자동 OUT이 `'[자동] 연결된 특이사항이 없습니다'`로 취소된다. 한 학생만 맞추려면 기간 전체 행을 넘기고 `opts.studentIds`로 좁힌다. `opts.studentIds`는 F1 확정 시 한 학생만 맞출 때 사용한다(2단계).
- **전제:** 특이사항 행의 `student_id`·`term_id`·`date`는 저장 뒤 바뀌지 않는다(vocabulary.md). 바뀌어도 견디지만, `term_id`가 바뀌면 두 기간의 실행이 서로 취소·생성을 되풀이할 수 있다.
- **단위:** `per:'group'`(기본, 결정 22 "입력 1건 = 1OUT")이면 (학생, group_id) 묶음, group_id가 비면 행 하나. `per:'row'`면 행마다.
- **자격 행:** `확정` + 날짜가 달력에 있음(`ymdIsValid_`) + 유형이 `autoTypes`(괄호 설명을 떼고 비교, 비거나 빈 항목뿐이면 기본 3종) + 그 유형이 `opts.autoTypeSince`에 있으면 `confirmed_at >=` 그 시각.
- **설정 변경은 앞으로만(총괄 결정):** 설정 `exception.auto_out_types`를 넓혀 새로 자동 대상이 된 유형은 `autoTypeSince[유형]` = 넓힌 시각(설정 행 `updated_at`, audit_log로 유형별로 구할 수 있음)으로 넘긴다 — 그 전에 확정된 특이사항에는 소급해 OUT을 만들지 않는다. **처음부터 자동 대상이던 유형은 넣지 않는다**(그래서 `[자동]` 취소됐다가 다시 확정된 특이사항의 OUT은 돌아온다). 좁힐 때는 아래 "만들 때 유형"으로 이미 있는 OUT이 유지된다. 2단계 F4 처음 연결 때 쌓인 특이사항을 한꺼번에 만들 때는 넘기지 않는다.
- **새로 만들기:** 살아 있는 자동 OUT이 없는 단위에 자격 행이 있으면. 대표 = 자격 행 중 날짜가 가장 이른 행(같으면 id 순). 초안: `source:'F1자동'`, `status:'유효'`, `source_exception_id` = 대표, `occurred_at` = 대표 날짜 + 첫 블록 시작(`parseBlockSpec_` 기준, `ALL`·잘못된 표기는 `00:00`) + `:00`, `entered_by` = 확정자(없으면 요청자), `detected_by` = `dutyByDate[날짜]`(배열은 쉼표, 없으면 빈칸), **`rule_name` = `ruleName + '(만들 때 유형)'`**, `memo` = `'사전 특이사항 자동: 유형'`(자격 행이 여러 날이면 `' 외 N일'`).
- **유지 행**(이미 있는 OUT 하나에 대해): 자격 행, 또는 확정·날짜 맞음이고 유형이 그 OUT의 `rule_name` 괄호 유형(만들 때 유형)과 같은 행(그 유형의 `autoTypeSince`가 그 OUT의 `created_at` 이전이면 그 시각 이후 확정만 — OUT이 생긴 뒤 다시 넓힌 since로는 거르지 않는다, `created_at`이 비면 거르지 않는다). 유지 행이 있으면 OUT을 유지하고 두 번 실행해도 0건. **설정을 좁혔다가 다시 넓혀도 기존 OUT은 죽지 않는다(결정 40).** 그래서 `violations` 행은 `created_at`까지 넘긴다(필수). 지름길: 다시 넓히면 처음 넓히기 전에 확정된 같은 유형 행도 유지 행이 되어, 대표가 그쪽으로 옮겨질 수 있다(덜 죽일 뿐 거짓 취소는 없음 — 설정이 넓힌 이력을 남기면 고친다).
  - `rule_name`은 vocabulary 형식일 때만 읽는다: 정확히 `ruleName + '(' + 유형 + ')'` — `ruleName` 바로 뒤의 `(`와 짝이 맞는 `)`가 마지막 글자(유형 안의 짝 맞는 괄호 허용). `'… (학부모 통화)'`처럼 덧붙였거나, 유형이 비었거나(`'( )'`), 통째로 괄호에 싸였으면(`'((x))'`) '알 수 없음'. 알 수 없으면 유지 행 = 자격 행만이고, 자격 행이 없어도 확정·날짜 맞는 행이 남아 있으면 **그대로 둔다**(유형으로 취소하지 않고, 대표를 비자동 행으로 옮기지도, 고치지도 않는다).
  - **대표 유지:** 지금 `source_exception_id` 행이 유지 행이면 대표를 옮기지 않는다. 아니면 유지 행 중 가장 이른 행.
- **취소**(`toCancel`, 사유는 `'[자동] '`으로 시작): 특이사항이 모두 취소됨, 확정 행이 없어짐(요청으로 돌아감), 유형이 자동 대상 밖으로 바뀜(만들 때 유형도 아님), 연결된 특이사항 행이 없음, 특이사항의 학생·기간이 바뀜(**바른 쪽에 다시 만든다 — 이때는 지금 설정·`autoTypeSince`와 상관없이**, 그렇게 다시 만든 OUT은 유지 판정에서도 since로 거르지 않는다 — 같은 단위에 이 사유로 취소된 자동 OUT이 있으면), 같은 단위의 두 번째 살아 있는 OUT.
- **고침**(`toUpdate`, 부르는 쪽은 `updateRecord_`로 저장 → audit_log에 전후 값). 사람이 고친 값은 덮지 않는다:
  - 대표가 바뀌거나 대표 날짜와 OUT 날짜가 다르면 `source_exception_id`·`occurred_at`. **특이사항 날짜가 원본** — 사람이 OUT 날짜를 고치면 날짜·시각 모두 생성값으로 되돌린다. 날짜가 같으면 사람이 고친 시각은 둔다(같은 대표·같은 날짜에서 블록만 바뀐 것도 고치지 않는다).
  - `detected_by`: 빈칸인데 그날 근무교사를 알게 되면 채운다. 날짜가 바뀌었고 지금 값이 옛 날짜의 근무교사(생성값)와 같으면 새 날짜 근무교사로, 모르면 빈칸으로. 그래서 `dutyByDate`에는 특이사항 날짜와 OUT들의 지금 `occurred_at` 날짜를 모두 넣는다.
  - `rule_name`: 생성값이고 대표 유형이 다른 자동 유형으로 바뀌었으면 새 유형으로(묶음 안 유형이 하나인 앱에서는 일어나지 않는다). `memo`는 사람 칸이라 고치지 않는다.
- 교사가 직접 입력한 OUT(`source`가 `F1자동`이 아님)은 건드리지 않는다.
- ASSUMPTION: 관리자가 직접 취소한 자동 OUT(`cancel_reason`이 `'[자동] '`으로 시작하지 않음)이 가리키던 특이사항 행, 또는 같은 묶음(**취소된 OUT의 학생** + group_id)의 행이 들어 있는 단위는, 그 OUT과 **학생·기간이 같으면** 다시 만들지 않는다(`per`를 바꿔도 같음).
- ASSUMPTION(결정 22 적용): 같은 학생·같은 날·겹치는 블록에 다른 묶음의 자동 유형 특이사항 두 건이 확정되면 OUT도 두 건(→ 퇴실 대상이 될 수 있다). C5는 저장·확정 때 겹침 경고 후 확인을 받는다(막지는 않음).
- `outLevel_`: 같은 학생·같은 `term_id`(학기마다 초기화)에서 status 빈칸·`유효`인 OUT 수(직접·자동 모두). 2개 이상이면 `level:2`, `'퇴실 대상'`.
- 이 파일은 DateRules(`ymdIsValid_`·`ruleStr_`·`ruleIso_`·`ruleRowLive_`)·AttendanceRules(`attTypeBase_`·`parseBlockSpec_`)를 부른다. 테스트는 세 파일을 함께 올린다.

## 동작 메모(R6, 2026-11-07, 총괄 검토 3차 반영)

**MealRules** — 값 글자는 `docs/contracts/vocabulary.md`. StatusRules의 `statusOn_`을 부른다. `tests/rules/meal_oracle.test.js`가 단순한 오라클 모델과 무작위 시험(시드 고정 400가지, 사건마다 표본 날짜 + 끝에 3/1~4/30 매일, `ORACLE_FULL=1`이면 매 사건 매일)으로 비교한다.

**기준(오라클과 같은 뜻):** 어떤 날의 값 = 적용일이 그날 이전인 신청 중 **신청 일시가 가장 늦은** 신청의 값. 학사생만 받는 값(조식 `실시`·석식 `학사 석식`)은 학사 퇴실 뒤에는 새로 신청할 수 없고, 학사 퇴실 뒤 끝나는 날(조식은 퇴실일, 석식은 결정 35의 중단일)부터는 세지 않는다. status_changes는 "적용일이 가장 늦은 행"으로 읽으므로(`statusOn_`) 저장할 때 `toCancel`·`followUps`로 이 기준과 같게 맞춘다.

- `mealEffectiveDate_(kind, requestedAt, opts)` → `{date, rule}`. `rule`: `same_day`·`next_day`·`next_monday`·`monday_after_next`·`entry_date`·`leave_date`·`initial`.
  - `start`·`to_general`: 신청 일시(KST)가 마감(`opts.cutoff`, 기본 `'11:30'`, `9:30`·`11:30:00` 표기도 읽음) **전**이면 당일, 마감 **정각부터** 다음 날(결정 23 ④).
  - `stop`: 신청일이 월·화면 다음 주 월요일, 수~일이면 다다음 주 월요일. 일반 석식 → 미실시도 이 규칙(결정 23 ⑤).
  - `with_dorm_entry`: `opts.entryDate`, `on_leave`: `opts.leaveDate`. `initial`: 신청일.
  - `start`·`to_general`·`stop`에 `opts.leaveDate`를 주면 적용일이 퇴실일보다 이르면 퇴실일로 미룬다(ASSUMPTION: 퇴실 전에는 학사 석식이 이어진다). 늦은 적용일은 그대로 — **결정 35**.
  - 잘못된 kind(`none` 포함)·일시·마감은 Error.
- `mealChangeKind_(item, from, to)`: 값만 보는 매핑(`none`·`initial`·`start`·`to_general`·`stop`). F7은 `mealPlanChange_`를 쓴다.
- **`mealPlanChange_(changes, studentId, item, toValue, requestedAt, opts)`** — F7 신청 하나의 계획(아무것도 쓰지 않음). `changes` = 그 학생의 status_changes 행(학사·조식·석식, 취소 포함 그대로). `opts.today`(입력하는 날)는 **필수**(없거나 날짜가 아니면 Error).
  - `kind`: 후보 적용일(미실시면 미실시 규칙의 날, 그 밖에는 11:30 규칙의 날)에 실제로 적용되는 값과 비교. 같으면 `none`(상태는 그대로). 미실시인데 그날 먹는 급식이 없으면 `initial`(신청일).
  - **저장:** `blocked`·`superseded`가 아니면 `kind`가 `none`이어도 신청 행(`date`, 값, `requested_at` = 신청서 일시, `source:'F7'`)을 쓴다 — 신청서 기록이고, 나중에 늦게 입력되는 이전 신청서가 이 신청을 덮지 못하게 한다.
  - `blocked`(쓰지 않음): 후보 적용일에 학사 상태가 `퇴실`이면 조식 `실시`는 늘, 석식 `학사 석식`은 그 퇴실 기록(`requested_at`)보다 **뒤에 신청했으면** 켜지 못한다(일반 석식은 된다). 입력 순서가 아니라 신청 일시 순서다: 퇴실 기록보다 먼저 신청한 학사 석식은 늦게 입력해도 결정 35 중단일까지 유지(followUps가 끝낸다). 퇴실 기록의 `requested_at`이 비었거나 형식이 틀리면 이 신청 일시로 본다(지름길).
  - `superseded`(쓰지 않음): 이 신청보다 신청 일시가 늦은 신청 행(퇴실 정리 F6 행은 세지 않음)이 이미 있고 그 적용일이 이 신청의 적용일 이하이면 이 신청은 영영 적용되지 않는다(늦게 입력한 이전 신청서). 경고를 함께 준다.
  - `toCancel`(같은 락 안에서 status `'취소'`, audit_log): ① `mealPendingToCancel_(…, date, {source:'F7', requestedAt, newValue})` — 신청 일시가 이 신청 이전(같으면 먼저 저장된 행이 이전)이고 적용일이 더 늦고 값이 다른 F6 아닌 행(오늘 이전에 이미 적용된 행이어도). ② 뜻이 없어진 퇴실 정리(F6) 행 — 이 신청을 저장한 뒤 그 행이 없어도 그날 값이 학사생 값이 아니고 그 행 값과 다르면(예: 퇴실 뒤 일반 석식 신청).
  - `followUps`(함께 쓰기, `source:'F6'`): 학사생 값 신청이 닿는 학사 퇴실(적용일에 퇴실 상태면 그 퇴실, 아니면 그 뒤 가장 이른 퇴실 — 같은 날 다시 입실한 퇴실은 빼고)이 있고, 중단일에 아직 퇴실 상태(그 전에 다시 입실하지 않음)이며, 저장 뒤 중단일(조식은 퇴실일, 석식은 F6 정리와 같은 `mealEffectiveDate_('stop', 퇴실 행의 requested_at, {leaveDate})` — 입력 순서와 무관, 결정 35)의 값이 학사생 값이면 그날 `미실시` 행. 퇴실 전에 켠 학사 급식이 퇴실 뒤에도 이어지지 않게 한다(`none`이어도 — 이전 미실시 대기 행을 취소한 경우).
  - `warnings`: 남아서 이 신청을 나중에 덮는 행(더 새 신청·퇴실 정리)이 있으면 "X일부터 Y로 바뀌는 행이 있어 이 신청을 덮습니다". ASSUMPTION: 이 신청보다 먼저 적용되는(적용일이 오늘 이후·이 신청 전) 다른 값의 대기 행은 취소하지 않고 경고만 한다(예: 내일부터 `실시` 대기 중에 오늘 `미실시` 신청 → 미실시는 다다음 주 월요일. 미실시 규칙의 준비 기간을 지키려고).
- **`mealPendingToCancel_(changes, studentId, item, effectiveDate, opts)`** → `[{id, effective_date, value}]`(적용일 순). 공통: 같은 학생·같은 항목, status 유효, 적용일이 달력 날짜(`statusOn_`과 같은 검사). 오늘과는 상관없다.
  - `source:'F7'`: 위 ①.
  - `source:'F6'`(퇴실 정리): 적용일이 `effectiveDate`(조식은 퇴실일, 석식은 결정 35 중단일) **이상**인 F6 아닌 행 중 학사생 값 행 전부(신청 일시·오늘과 상관없이 — PRD F6 "퇴실일부터 바로 중단"). 미실시·일반 석식 신청은 남긴다.
- **F6 학사 퇴실 정리 순서**(R11a부터 `movePlan_`이 이 순서로 계획한다): ① 학사 `퇴실` 행(`source:'F6'`) ② 조식(중단일 = 퇴실일)·석식(중단일 = `mealEffectiveDate_('stop', 퇴실 입력 일시, {leaveDate})`)마다 `mealPendingToCancel_(…, 중단일, {source:'F6'})`를 취소 ③ 그 뒤에도 중단일의 값(`statusOn_`)이 학사생 값이면 그날 `미실시` 행을 `source:'F6'`으로 쓴다. 늦게 입력한 퇴실(퇴실일이 오늘 이전)도 같다. 서류 미제출이어도 적용한다(결정 3).
- **고친 적용일(R10):** `opts.effectiveDate`(yyyy-MM-dd)를 주면 그 날을 적용일로 계산한다 — `kind`·`blocked`·`superseded`·`toCancel`·`followUps`·경고 모두 고친 날 기준. `rule` = `opts.effectiveRule`(`'manual'` 기본, 기숙사 입실 조식은 `'entry_date'`). 결과 `autoDate` = 규칙 계산값(고치지 않았으면 `date`와 같다, blocked·superseded여도 들어 있다). F7은 `autoDate`를 `effective_date_auto`에, 쓴 날짜를 `effective_date`에 저장한다(stage2.md 5절). 고친 날짜는 자동보다 이르거나 늦거나 오늘 이전이어도 되지만 신청일보다 이르면 Error, 날짜가 아니거나 모르는 `effectiveRule`도 Error.
- 퇴실 기록보다 먼저 신청한 학사 석식도 고친 적용일이 결정 35 중단일 이후면 `blocked`(F6 정리가 중단일 이후 학사생 값 행을 취소하는 것과 같다).
- StatusRules: `statusOn_`의 적용일 검사는 이제 달력 검사(`2027-02-30` 행 무시)로 `ymdIsValid_`와 같다(R6에서 고침).

## 동작 메모(R11a, 2026-11-07)

**MoveRules** — `movePlan_`은 F6 입퇴실 하나의 계획(아무것도 쓰지 않음). DateRules·StatusRules·MealRules를 부른다.

- `errors`가 있으면 `rows`·`toCancel`은 비어 있다. 검사: 유형, 적용일, **신청 일시는 날짜+시각 전체**(`yyyy-MM-ddTHH:mm(:ss)`, 날짜뿐이면 석식 중단일이 입력 순서를 따르므로 — followups R6-3), 신청 일시가 오늘보다 미래, 상태(적용일 기준: 이미 같은 상태, 학사 입실이 아닌 학생의 퇴실·기숙사 입실, 기숙사생의 `학사 퇴실` → `학사 및 기숙사 퇴실`로 안내, 기숙사 입실이 아닌 학생의 기숙사 퇴실). `today` 없으면 Error. 적용일 < 오늘이면 경고.
- `rows[0]`이 대표 행(`head:true`, source `F6`, 적용일 = `effectiveDate`). `학사 및 기숙사 퇴실`은 학사 퇴실(대표) + 기숙사 퇴실(연결). 저장하는 쪽이 연결 행의 `linked_change_id` = 대표 행 id, `toCancel`의 `cancel_reason` 앞에 `[자동] <대표 행 id> `를 붙인다.
- 학사 퇴실 정리: 위 순서 그대로(조식 퇴실일, 석식 결정 35 중단일, 중단일 이상 학사생 값 취소, 그래도 학사생 값이면 그날 `미실시` F6). 학사생 값이 아니면(일반 석식·조식 미실시) 정리 행이 없다. 석식 `일반 석식`을 고르면 미실시 대신 `mealPlanChange_`로 일반 석식 신청(source `F7`, 11:30 규칙, 퇴실일보다 이르지 않게).
- 기숙사 입실 + 조식: `mealPlanChange_(…, {effectiveDate: 입실일, effectiveRule:'entry_date'})` → 조식 실시@입실일(F7, `effective_date_auto` = 입실일, PRD F7 표 2줄). 기숙사 퇴실 + 조식 미실시: 미실시 규칙(기숙사 퇴실일보다 이르지 않게, F7). ASSUMPTION(4-2): 두 조식 선택은 기본으로 켠다(`false`를 넘기면 끔). 이미 그 값이고 취소할 대기 행도 없으면 급식 행을 쓰지 않는다.
- ASSUMPTION: 학사 입실(재입실 포함)의 급식은 R11b(`moveUndoPlan_`·재입실)에서 정한다 — 지금은 대표 행만.
- 테스트의 F6 퇴실 흉내(`meal.test.js` saveLeave, `meal_oracle.test.js`)는 이 함수를 쓴다(규칙은 한 곳에).
