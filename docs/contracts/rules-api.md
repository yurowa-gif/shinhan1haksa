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

// src/rules/ScheduleRules.gs
function baseDayType_(ymd)                  // 'mon_thu'|'fri'|'sat'|'sun'
function schedOperatingValue_(v)            // day_schedules.operating 값 → boolean(R1 추가)
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

## 동작 메모(R1, 2026-11-06)

**DateRules**
- 잘못된 날짜·시각을 받거나 결과가 `yyyy-MM-dd` 범위를 벗어나면 조용히 넘기지 않고 `Error`를 던진다. 화면 입력 검사는 `ymdIsValid_`·`hmIsValid_`로 먼저 한다.
- `ymdRange_(from, to, maxDays)`: from이 to보다 늦으면 빈 배열, 날 수가 `maxDays`(기본 366)를 넘으면 Error. `maxDays`는 1 이상의 정수만(NaN·문자열이면 Error — 설정값이 비어 검사가 꺼지지 않게).
- `isoLocalSplit_`: `'yyyy-MM-ddTHH:mm:ss'`, `'yyyy-MM-ddTHH:mm'`, `'yyyy-MM-dd HH:mm:ss'`를 받는다. `Z`·`+09:00`이 붙은 값은 거부한다(KST 벽시계 값만). `min`은 초를 버린 분이라 11:29:59 → 689, 11:30:00 → 690. 마감 비교는 `min >= hmToMin_('11:30')`.
- `hmIsValid_`·`hmToMin_`은 엄격한 `'HH:mm'`만 받는다. 시트 값을 읽을 때의 너그러운 해석은 ScheduleRules가 한다(아래).

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
