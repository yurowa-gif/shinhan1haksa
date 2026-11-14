# S4-0 새 탭·열 설계 (결정 75·76) — 총괄 검토용

> 코딩A, 2026-11-14. 코드는 이 설계가 승인된 뒤에 씁니다. 시트 구조 변경은 선생님이 승인하셨습니다(결정 75·76).

## 1. 새 탭

모든 탭 공통: 첫 열 `id`, 끝 `created_at·created_by·updated_at·updated_by`(아래 표는 본문 열만).

| 탭 | 본문 열 | 값·규칙 | 위치 |
| --- | --- | --- | --- |
| `doc_types` | `name`, `description`, `sort_order`, `status` | 서류 종류(입실 동의서·학부모 개인정보 동의·자기소개서·상담·결핵검사·학원 수강증 …). `status` 유효·취소(지우지 않는다). 이름은 유효 행끼리 겹치지 않는다. 관리자만 편집 | db, 기간 무관 |
| `student_docs_<기간>` | `term_id`, `student_id`, `doc_type_id`, `state`, `submitted_date`, `memo` | 학생·서류 종류마다 **최대 1행**. `state` 제출·미제출·해당없음. **행이 없으면 미제출**(학기 초 행을 미리 만들지 않는다). 제출 표시를 되돌리면 같은 행을 `미제출`로 고친다(audit_log에 이전·이후). 서류 종류가 취소돼도 행은 남는다 | **기간별 탭**(`SCHEMA_TERM_TABS`, 학기 초 체크리스트라 학기마다 새로. 새 기간 만들 때 `saveTerm`이 이미 모든 기간별 탭을 만든다) |
| `programs` | `name`, `date`, `blocks`, `memo`, `status` | 프로그램 1개 = 1날짜. 여러 날이면 날짜마다 1행. `blocks`는 특이사항과 같은 표기(`ALL` 또는 `HH:mm-HH:mm;…`). `status` 유효·취소 | db, 기간 무관(날짜가 기간을 정한다) |
| `program_participants` | `program_id`, `student_id`, `exception_id`, `status` | 참가자 1명 = 1행. `exception_id` = 그 참가로 만들어진 사전 특이사항(유형 '학사 내 프로그램', 이미 있는 값) 행 id. `status` 유효·취소. 프로그램을 취소하면 참가자 행과 연결된 특이사항을 같은 락 안에서 함께 '취소'(C28이 구현) | db |

- `student_docs`의 `term_id`는 기간별 탭에도 둔다(`exceptions_<기간>`·`violations_<기간>`과 같은 방식).
- 서류 체크리스트의 담당 판정은 **결정 60과 같은 기간 하나**(그 기간의 담당교사)를 쓴다.

## 2. 새 열 (기존 탭)

| 탭 | 새 열 | 놓을 자리 | 비고 |
| --- | --- | --- | --- |
| `students` | `phone` | `email` 뒤, `memo` 앞 | 학생 전화 |
| `guardian_links` | `name`, `phone` | `relation` 뒤, `memo` 앞 | 보호자 이름·전화(결정 76은 "이름·전화"를 함께 같은 사람에게만 보인다고 했으므로 둘 다 민감 열로 다룬다) |

기존 시트에는 `setup()`이 `setupInsertMissingCols_`로 빈 열을 제자리에 끼운다(2단계 `counsel_notes`와 같은 방식). 값은 일반 텍스트 서식(앞자리 0 보존).

## 3. 권한 키 (`permissions_()`)

| 키 | 역할 | scope | 설명 |
| --- | --- | --- | --- |
| `doc.view` | admin, hall_teacher, attendance | 학생 한 명 조회는 `scope:'student'`(담당·근무·관리자), 목록은 함수 안에서 범위 계산 | 서류 체크리스트 보기. 담임·학생·학부모에게는 내보내지 않는다 |
| `doc.edit` | admin, hall_teacher | `scope:'student'`(담당·그날 근무교사·관리자, 결정 60의 기간) | 제출·미제출·해당없음 표시 |
| `doc.types` | admin | — | 서류 종류 추가·이름·정렬·취소 |
| `program.edit` | admin, attendance | — | 프로그램·참가자 입력·취소(출결 담당이 사전 특이사항을 맡으므로) |
| `contact.view` | admin, hall_teacher | `scope:'student'`(= 그 학생의 담당교사·관리자·**그날 근무교사**, `canAccessStudentByFacts_`의 `isAssigned`·`isOnDuty && isEnrolled`), `dutyWindow` 없음(오늘 근무자만) | 전화번호·보호자 이름 보기. `attendance`·`homeroom`·`duty_manager`는 넣지 않는다 |
| `contact.edit` | admin | — | 명단 올리기로만 받는다(`roster.edit`가 이미 관리자만이라 별도 화면 없음) |

> 학생·학부모가 자기 전화를 보는 일은 6.1 뒤(결정 76). 이번 범위는 아니다.

## 4. 전화번호가 새어 나가지 않게 하는 방법 (핵심)

지금 코드에는 `readAll_('students')` 행을 그대로 응답에 담는 곳이 여러 곳 있다(홈·특이사항·OUT·급식·좌석·방 …). 열을 더하기만 하면 전부 새 열을 같이 내보낸다. 그래서 **함수마다 빼는 방식이 아니라 읽는 곳에서 막는다.**

1. `Db.gs`에 `SENSITIVE_COLS = { students: ['phone'], guardian_links: ['name', 'phone'] }`를 둔다.
2. **`readAll_`는 이 열을 지운 행만 돌려준다**(캐시에도 지운 채 담는다). 기존 코드는 이 열을 볼 수 없으므로 새 화면·출력물·메일이 실수로 담을 수 없다.
3. 값이 필요한 곳은 `readContacts_(sheet)` 하나뿐이다. 이름 끝 `_`(내부 함수)이고 **직접 부르는 서버 함수는 `contact.view`를 첫 줄에서 통과한 뒤 학생별 응답에 그 학생 것만** 담는다. 명단 올리기 비교(바뀐 전화 확인)는 `roster.edit` 안에서만 쓴다.
4. **감사 기록**: `writeAudit_`의 마스크(상담 `content`와 같은 방식)에 민감 열을 더한다 — 모든 `kind`에서 `phone`·보호자 `name` 값은 `(전화 생략)`·`(이름 생략)`으로 쓰고 바꿨다는 사실만 남는다. `updateRecord_`·`bulkUpdateRecords_`의 before/after(`{id:{열:값}}`)도 같은 replacer를 탄다. `bulkAppend_`는 원래 id만 남긴다. 거부 기록의 `detail`은 context만 담아 전화가 들어가지 않는다.
5. **새 행을 쓸 때**(`appendRecord_`·`bulkAppend_`)와 고칠 때는 열 이름 기준이라 그대로 동작한다. 읽기 마스크가 쓰기를 막지 않도록 쓰기 함수는 시트 헤더로 직접 작동한다(지금과 같음).
6. 출력물(PDF·xlsx)·메일 렌더러는 `readAll_` 결과만 받으므로 전화를 받을 수 없다. 렌더러 입력에 `phone`이 있으면 시험이 실패한다.

### 시험 (C29 구현 때 같이, S4-0에서는 읽기 마스크·감사 마스크까지)
- 가짜 전화(`010-FAKE-…` 식 표식) 심어 놓고 **공개 함수 전부**(`tests/public-api` 목록)를 역할마다 불러 응답 JSON에 표식이 없음을 확인(허용 함수 `getContact…` 제외).
- audit_log 전체에 표식 없음(명단 올리기·수정·일괄 수정 뒤).
- 메일 본문(`MailApp` 가짜)·PDF HTML 렌더러 입력·응답에 표식 없음.
- `readAll_('students')`에 `phone` 키가 없다(단위 시험), `readContacts_`는 직접 부를 수 없다(`_` 이름, `npm test`가 검사).
- 담당교사·관리자·그날 근무교사만 통과, 담임·출결 담당·근무표 담당자·다른 학사 교사(비근무)·학생·학부모는 거부 + `denied:contact.view`.

## 5. 이번에 하지 않는 것
- 전화번호 입력 화면(명단 올리기 열은 C29), 서류 체크리스트 화면(C27), 프로그램 화면·특이사항 생성(C28). S4-0은 탭·열·권한 키·읽기/감사 마스크와 그 시험까지.
- 학생·학부모 화면의 본인 전화(6.1 뒤).

## 6. 총괄께 묻는 점
1. `student_docs`를 기간별 탭으로 하는 것(학기 초 서류라 학기마다 새로 시작)에 동의하시는지, 아니면 기간 무관 한 탭에 `term_id` 열로 둘지.
2. `contact.view`에서 보호자 **이름**도 전화와 같이 숨기는 것(위 2절)으로 괜찮은지.
3. `program.edit` 역할에 `hall_teacher`(담당 학생 프로그램)를 더할지(지금은 관리자·출결 담당).
