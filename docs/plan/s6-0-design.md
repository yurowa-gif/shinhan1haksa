# S6-0 설계 메모 — 6단계 Schema·권한 키·가짜 데이터 (코딩A, 2026-11-27)

근거: `docs/plan/stage6.md`, `docs/plan/stage6-rules-draft.md`(2절 공개 판정표·4절 데이터 모양), 결정 89~101, PRD 5절 F15~F17·7절.
이번 PR은 **구조·권한·가짜 데이터만**이다. 공개 함수는 만들지 않았다(기능은 C49~C53). 아직 승인받지 않은 `curriculum_courses`·권장 이수 과목은 **만들지 않고** 8절에 제안만 적었다.

## 1. 한눈에

| 무엇 | 어디 | 비고 |
| --- | --- | --- |
| 새 탭 4개(운영 DB) | `career_profiles` · `course_plans` · `inquiry_records` · `feedback` | `Schema.gs SCHEMA.db` |
| 새 탭 1개(상담 파일) | `counsel_requests` | `SCHEMA.counsel` |
| 열 추가 | `terms.career_due`, `counsel_notes`에 `agreement`·`agreement_to_parent`·`profile_version`·`request_id` | **setup이 이미 있는 시트에도 제자리에 끼운다** (`setupInsertMissingCols_`, 두 번 돌려도 같은 결과) |
| 권한 키 24개 | `Auth.gs permissions_()` (3절 표) | 출결 담당·근무표 담당은 어느 키에도 없음 |
| audit 글자 수 | `Db.gs AUDIT_TEXT_COLS` | 새 글 칸은 감사 기록에 내용 대신 글자 수만(결정 42) |
| 값 어휘 제안 | `docs/contracts/vocabulary.md` "6단계" 절 | 총괄 검토 |
| 가짜 데이터 | `src/dev/FakeStage6.gs seedFakeStage6()` (편집기) | 가짜 학생 30명 기준, 두 번 돌려도 +0 |

시험: `tests/core/stage6_tabs.test.js`(열·권한 표·실제 `requirePermission_` 판정 · setup 제자리 끼우기 · audit 글자 수), `tests/features/fake_stage6.test.js`(시드). 기존 시험 중 열 목록을 글자로 비교하던 4개(`schema`·`setup_columns`)는 새 열에 맞게 고쳤다.

## 2. 탭·열과 PRD 7절·초안 4절과 다르게 둔 곳

열은 모두 `id` + 아래 열 + 공통 4열(`created_at`·`created_by`·`updated_at`·`updated_by`). 기록은 삭제하지 않고 `status` `취소` + `cancel_reason`.

| 탭 | 열 (id·공통 4열 제외) |
| --- | --- |
| `career_profiles` | term_id, student_id, version, hopes(JSON), targets(JSON), interests, strengths, concerns, parent_fields(`;`), submitted_at, status, cancel_reason |
| `course_plans` | term_id, student_id, entry_year, grade, semester, choice_group, course, state(계획·확정), confirmed_by, confirmed_at, show_to_parent, status, cancel_reason |
| `inquiry_records` | term_id, student_id, source_id, recorded_at, source, standards(`;`), subject, title, question, liked, progress, result_link, memo, file_id, name_mismatch, show_to_parent, status, cancel_reason |
| `feedback` | term_id, student_id, target_kind, target_id, content, teacher_email, status, cancel_reason |
| `counsel_requests` | term_id, student_id, requester_email, wish_dates(`;`), topic, memo, status(신청·확정·완료·반려·취소), decided_date, linked_note_id, cancel_reason |
| `counsel_notes` (순서) | student_id, date, teacher_email, type, target, linked_violation_id, content, **agreement, agreement_to_parent, profile_version, request_id**, show_to_parent, status, cancel_reason |
| `terms` | name, type, start_date, end_date, **career_due**, memo |

PRD 7절·초안과 **다르게 둔 곳과 이유**(코드 주석에도 같은 말):

1. **`term_id`를 `course_plans`·`feedback`·`counsel_requests`에 더했다**(PRD에 없음). 결정 97 "교사는 그 기록이 생긴 기간의 담당"을 판정하려면 모든 기록이 기간을 알아야 한다. 이수 계획은 입학년도 기준이라 기간이 여러 학기에 걸치지만, "누가 담당이었나"는 쓴 때의 기간으로 정한다.
2. **`course_plans`에 `state`(계획·확정)와 `status`(유효·취소)를 따로 뒀다**. PRD의 '상태(계획·확정)'만으로는 결정 99의 "과목 줄마다 취소 + 새 줄"을 표현할 수 없다. 확정 표시는 `confirmed_by`·`confirmed_at`(담당교사 확인).
3. **학부모 공개는 탭마다 모양이 다르다.** 진로 프로필은 열 하나 `parent_fields`(결정 101·초안), 이수 계획·탐구 기록은 줄마다 `show_to_parent` TRUE/FALSE(PRD '학부모 공개' 열). 상담 합의 사항은 `agreement_to_parent`(결정 90). 규칙 R24 `s6ParentFields_`가 세 가지를 같은 모양(공개된 항목 이름 배열)으로 읽는다.
4. **`inquiry_records`에 `subject`(교과)와 `name_mismatch`를 더했다.** 초안의 요약 모양(`subject`)과 결정 93("담당교사 화면에 '이름 다름' 표시")에 필요하다. `standards`는 코드 2개를 `;`로 한 열에 둔다.
5. **`counsel_requests.status`가 PRD의 '상태'**(신청·확정·완료·반려)이고, 결정 95의 '취소'를 더해 다섯 값이다. `cancel_reason`은 반려·취소 사유(반려 사유는 학생에게 보임), `decided_date`는 확정한 상담 날짜, `linked_note_id`는 PRD의 '연결 상담 id'.
6. **`counsel_notes` 새 열은 `content` 바로 뒤에 끼웠다**(지시: 기존 열 순서를 깨지 않게). 읽는 코드는 모두 헤더 이름으로 읽으므로 순서 변경은 안전하고, `setupInsertMissingCols_`가 "남은 열 순서 같음 + 새 열만 추가" 모양이면 데이터 전체를 한 번에 다시 쓴다. 다른 모양(순서 바뀜·모르는 열)이면 이전처럼 **경고만 하고 고치지 않는다**.
7. **`student_id` 등 id 열은 글 열이 아니다.** 글 칸(`AUDIT_TEXT_COLS`): `career_profiles`(hopes·targets·interests·strengths·concerns), `inquiry_records`(title·question·memo), `feedback`(content), `counsel_requests`(memo), `counsel_notes`(content·agreement, 기존). `wish_dates`·`topic`·`status`·`parent_fields` 같은 짧은 값은 그대로 남아 "누가 무엇을 바꿨나"는 감사 기록에서 보인다.

## 3. 권한 키 표 (`Auth.gs`, `tests/core/stage6_tabs.test.js`가 그대로 검사)

범위(scope student)는 `canAccessStudentByFacts_`가 판정한다: 관리자 = 모든 학생, 학사 교사 = 담당 학생(`noDuty` — 근무일 범위·`wideView` 없음), 담임 = 자기 반 + 이번 기간 등록, 학생 = 본인(`portalWho_`), 학부모 = 연결 자녀. ○ = 역할 통과(범위는 위 규칙), — = 거부.

| 키 | 관리자 | 학사 교사 | 담임 | 학생 | 학부모 | 출결·근무표 | 뜻 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `career.view` | ○ | ○ | ○ | ○ | ○ | — | 진로 프로필 보기(칸은 `s6Visible_`가 거름: 학부모는 공개분만) |
| `career.submit` · `career.publish` | — | — | — | ○ | — | — | 제출(버전)·학부모 공개 항목 고르기 |
| `career.list` | ○ | ○ | — | — | — | — | 미제출 목록·홈 배지(역할만, 범위는 함수가 계산) |
| `plan.view` | ○ | ○ | ○ | ○ | ○ | — | 이수 계획 보기 |
| `plan.edit` · `plan.publish` | — | — | — | ○ | — | — | 과목 줄 작성·바꾸기·공개 |
| `plan.confirm` | — | ○ | — | — | — | — | '확정'(담당교사 확인 표시) |
| `inquiry.view` | ○ | ○ | ○ | ○ | ○ | — | 탐구 기록 보기(원본 JSON·`file_id`는 관리자 외 응답에 없음) |
| `inquiry.upload` · `.progress` · `.publish` | — | — | — | ○ | — | — | 학생 본인만(교사가 대신 올리지 않음) |
| `inquiry.cleanup` | ○ | — | — | — | — | — | 졸업·퇴실 1년 뒤 '정리 대상'(결정 100) |
| `feedback.view` | ○ | ○ | ○ | ○ | **—** | — | 학부모에게 보이지 않음(결정 91) |
| `feedback.write` | — | ○ | — | — | — | — | 담당교사만(관리자는 보기만) |
| `feedback.cancel` | — | ○ | — | — | — | — | 행 id만 받는 첫 줄(역할만), 범위는 락 안에서 `feedback.write`로 다시 |
| `counsel.request.create` | — | — | — | ○ | — | — | 신청은 학생만(결정 16) |
| `counsel.request.cancel` | — | — | — | ○ | — | — | 행 id만 받는 첫 줄(역할만), 본인 신청인지는 락 안에서 |
| `counsel.request.view` | ○ | ○ | ○ | ○ | — | — | 신청 보기(담임에게는 메모 칸을 내보내지 않음, 결정 96) |
| `counsel.request.list` | ○ | ○ | — | — | — | — | 홈 배지(역할만) |
| `counsel.request.decide` | — | ○ | — | — | — | — | 확정·반려·완료 |
| `counsel.note.view` | — | — | — | ○ | ○ | — | 학생·학부모가 보는 상담 기록(날짜·교사·공개된 합의 사항, 결정 90·94) |
| `counsel.agreement.publish` | — | — | — | ○ | — | — | 합의 사항을 학부모에게 보이기(건마다, 행 id 첫 줄 = 역할만) |
| `timeline.view` | ○ | ○ | ○ | — | — | — | 학생 타임라인(교사용) |

- 출결 담당(`attendance`)은 어느 키에도 넣지 않았다: 넣으면 `canAccessStudentByFacts_`가 학사생 전체를 허용한다(초안 2절 주). 출결 담당이면서 담당교사인 계정은 `hall_teacher`로 통과한다.
- **결정 97(퇴실·졸업 뒤)은 키가 아니라 기능 함수의 몫이다.** 키는 "지금" 담당·반을 본다. 퇴실·졸업한 학생의 지난 기록은 함수가 **기록의 `term_id` 기간 담당**으로 다시 판정하고(교사), 본인·학부모는 계속 보며, 쓰기는 "지금 학사 입실 상태인 학생만"으로 막아야 한다. 이 규칙은 R24 `s6Visible_`에 viewer.asOfTerm을 넣는 방식을 제안한다(RULES 세션이 결정).
- 잘못 쓰기 쉬운 곳: `homeroom`·`parent`는 쓰기 키에 하나도 없고, `parent`는 보기 키 넷(`career.view`·`plan.view`·`inquiry.view`·`counsel.note.view`)뿐이다(시험으로 못 박음).

## 4. setup 동작 (이미 운영 중인 시트에도 안전)

- 새 탭은 `[탭 생성]`, 기존 탭에 새 열만 빠졌으면 `[열 추가] terms: career_due` 같이 **락 안에서 제자리에** 끼운다(데이터는 제 열 이름 아래 그대로, 새 열은 빈칸). 두 번째 실행은 `[탭 유지]`.
- 헤더 순서가 바뀌었거나 모르는 열이 있으면 `[경고]`만(자동으로 고치지 않음).
- 시드 `seedFakeStage6()`는 6단계 탭이 없으면 "setup()을 먼저 다시 실행하세요"라고 멈춘다.

## 5. 가짜 데이터 (`seedFakeStage6`, 편집기 실행)

`setup()` → `seedFakeData()` → `seedFakeStage1()` 뒤. 2027 1학기 등록생을 학번 순으로 세어 시나리오를 붙인다(판정표에 필요한 경우가 모두 있는지는 `fake_stage6.test.js`가 본다). 글은 모두 `가짜 …`로 시작하고 이메일은 `@example.com`, 대학은 `가짜대학교`, 파일 id는 `fake-drive-file-N`이다.

| 번호 | 진로 프로필 | 이수 계획 | 탐구 | 피드백 | 상담 신청 | 상담일지 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | v1(비공개) → v2(`hopes;targets`) → v3(`hopes`) | 4줄: 계획·확정·바꿔서 취소+새 줄 | 3건: 관심·진행 중·완료(출처 셋) | 프로필·계획·탐구 | 신청(희망 3일) | 합의 비공개, 참고 v3 |
| 1 | v1(3항목 공개) → v2(공개 거둠) | 확정 1줄 | 2건: 이름 다름·취소 | 취소 1건 | 확정 | 학부모 대상 |
| 2 | v1(`targets`) | 계획 1줄 | 1건 | — | **완료**(일지와 서로 연결) | 합의 **학부모 공개**, 참고 v1 |
| 3 | v1 취소 → v2(번호 이어짐) | — | — | — | 반려(사유) | — |
| 4 | v1(`strengths;concerns`) | — | — | — | 취소 | — |
| 5 | 마감 뒤(4/2) 제출 | | | | | |
| 6~ | **미제출**(`terms.career_due` = 2027-03-31) | | | | | |

열린 신청(신청·확정)은 학생마다 1건 이하(결정 95)이고, 시드는 쓸 때 `terms.career_due`가 비어 있을 때만 값을 넣는다.

## 6. 검사

- `npm test` 두 시간대 통과(PR 본문에 개수).
- 새 공개 함수 없음 — `seedFakeStage6`만 편집기용으로 `tests/public-api.d/coding-a.json`에 등록(`assertOwnerRun_`).
- 시트 구조 변경이므로 **배포 전에 소유자가 편집기에서 `setup()`을 한 번 더 실행**해야 한다(새 탭·열). 운영 DB가 이미 있을 때 데이터는 그대로 남는다.

## 7. 총괄이 확인할 것 (선생님께 여쭐 후보 포함)

1. `settings counsel.types`(상담일지 유형 칩)가 PRD F17 유형과 다르다: 지금 `학업,생활,진로,건강,가정,기타`, PRD `생활·학습·진로·진학·2OUT 학부모 면담·기타`. 상담 신청 `topic`은 PRD대로(`생활·학습·진로·진학·기타`) 두었다. 일지 유형 목록을 PRD에 맞출지 정해 주세요(C49에서 필요).
2. 결정 97을 `s6Visible_`에 어떻게 넣을지(3절 끝): `viewer.asOfTerm` 제안.
3. 8절(권장 이수 과목·편제표) 선택.

## 8. 제안만 — `curriculum_courses`(편제표)·권장 이수 과목을 시트에 두는 방식 (승인 전, 만들지 않음)

### 8.1 제안안 A (권장): 설정 스프레드시트에 탭 두 개 + 관리자 '교육과정 올리기'

설정 스프레드시트(`config`)에 탭을 둔다. 다른 탭과 같은 공통 규칙(첫 열 `id`, 끝 공통 4열, 삭제 대신 `status` 취소). 기본은 **비어 있고** setup이 탭만 만든다.

| 탭 | 열(id·공통 4열 제외) | 값 예 |
| --- | --- | --- |
| `curriculum_courses` | entry_year, grade, semester, choice_group, pick_n, course, status | `2027` · `2` · `1` · `선택군 A` · `2` · `화법과 언어` · `유효` (택N = 그 선택군에서 고를 수 있는 과목 수. 필수 과목은 `choice_group`을 비우고 `pick_n` `0`) |
| `course_recommendations` | base_year, university, unit, core_courses, recommended_courses, source_url, source_title, note, status | `2028` · `연세대` · `문과대학 전 모집단위` · `` · `` · `https://…2028_guide.pdf` · `2028학년도 … 가이드라인 안내` · `전공연계과목 미제시…` · `유효` (열 이름은 `data/course_recommendations/course_recommendations.csv`와 같고, 과목 여럿은 `;`) |

- 규모: 권장 과목 약 620줄(지금 CSV), 편제표는 입학년도마다 수십 줄.
- **관리자가 올리는 방법**(명단 올리기와 같은 흐름, C51에서 만들 화면): 관리자 홈 → '교육과정 올리기' → 종류(편제표·권장 과목)를 고르고 구글 시트·CSV를 붙여 넣기 → **미리 보기**(추가 N줄·바꾸는 줄·같은 줄, 표준 과목 이름 표(`standard_courses_2022.csv`)와 다른 과목 이름 경고, 대학·모집단위 중복) → 저장. 저장은 같은 `entry_year`(편제표)·`base_year`(권장 과목)의 기존 유효 줄을 `취소`로 두고 새 줄을 넣는다(삭제 없음, `audit_log`). 오류가 있으면 아무것도 쓰지 않는다.
- 필요한 새 공개 함수(C51): `previewCurriculum`·`saveCurriculum`(관리자만), 읽기는 `plan.view`가 쓰는 서버 내부 함수.
- 장점: 학교가 편제표를 바꿀 때 코드 배포 없이 관리자가 고친다. 권장 과목은 대학이 해마다 새로 내므로 시트가 맞다.
- 단점: 관리자 화면 하나와 올리기 규칙(미리 보기·검사)이 더 든다. 처음 한 번 CSV를 올려야 한다.

### 8.2 대안 B: 코드에 같이 넣기(시트 없음)

`data/course_recommendations/*.csv`를 Apps Script 상수 파일(`src/data/CourseData.gs`, 읽기만)로 변환해 코드에 넣고, 편제표도 같은 방식으로 학교가 정해 준 해마다의 표를 코드로 넣는다.

- 장점: 시트·관리자 화면이 필요 없다(가장 짧은 변경). 시트 구조 변경 승인이 필요 없다.
- 단점: 편제표·권장 과목이 바뀔 때마다 **코드를 고쳐 `clasp push`**(배포 = 새 버전 공개)해야 한다 — 선생님이 직접 못 고친다. 권장 과목 620줄이 코드 용량(파일 한도 6MB 안이지만 읽을 때마다 파싱)에 들어간다.

### 8.3 선생님께 여쭐 것

1. 편제표는 해마다(또는 입학년도마다) 바뀝니까? 누가 고칩니까(관리자 선생님이 직접 시트에 올리기 vs 개발 쪽이 코드로)?
2. 권장 이수 과목 자료(대학별)를 해마다 새로 올려야 하는데, 시트에 올리는 화면(안 A)이 있으면 직접 하시겠습니까?
3. 첫 해에는 B처럼 코드로 넣고 나중에 A로 바꾸는 방법도 있습니다(시트 구조 승인은 그때).
