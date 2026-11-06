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
