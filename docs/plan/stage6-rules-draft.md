# 6단계 규칙 설계 초안 — 상담·진로진학(F15~F17)

RULES 세션, 2026-11-12. **설계만**(코드·시트 구조 변경 없음). 학생·학부모 로그인은 0단계 진단(PRD 6.1, PRD 13절의 남은 열린 질문) 뒤라서 학생·학부모 쪽 함수는 그 결과에 따라 연결한다.
근거: PRD 4절 권한표, 5절 F12·F15·F16·F17, 7절 데이터, 9절 개인정보, CLAUDE.md "반드시 지킬 것" 6, 결정 11·14·15·16·17·42, `data/course_recommendations/`.

## 1. 원칙(이미 정해진 것)

- 대상은 학사생만(PRD 1절). 열람은 **학사 담당교사·담임(자기 반)·관리자**만(결정 11, 진로진학부 별도 권한 없음). 다른 학사 교사·출결 담당(담당이 아니면)·근무표 담당자는 보지 못한다.
- 진로 프로필은 **덮어쓰지 않고 버전으로 쌓는다**(F15). 제출 시기는 학기 초 필수 + 수시, 미제출 학생을 담당교사에게 표시(결정 14).
- 진로·탐구 기록의 학부모 공개는 **학생이 항목별로 고르고 기본 비공개**(결정 15).
- 상담 신청은 학생만(결정 16). 학부모는 상담 여부(날짜·교사)만, 내용은 교사만, 합의 사항은 학생에게, 학생이 공개하면 학부모에게도(CLAUDE.md 6, F17).
- 탐구발견 연동은 학생이 파일을 올리는 방식(결정 17). **신원은 파일 속 이름·학급이 아니라 로그인 계정**, 교사가 대신 올리는 기능 없음(F16).
- 상담일지는 별도 스프레드시트, 감사 기록은 content·agreement 글자 수만(결정 42). 상담 글은 제자리에서 고치지 않고 취소 + 새 행.

## 2. 공개 판정표

보는 사람(열) × 기록(행). "공개분" = 학생이 학부모 공개로 고른 항목만. "—" = 보이지 않음(응답에 넣지 않는다).

| 기록 · 칸 | 관리자 | 학사 교사(담당) | 학사 교사(담당 아님)·출결·근무표 | 담임(자기 반) | 학생(본인) | 학부모(연결 자녀) |
|---|---|---|---|---|---|---|
| 진로 프로필 — 모든 버전·모든 칸 | 보기 | 보기 | — | 보기 | 보기(본인 것 전부) | 공개분(가장 최근 제출 버전) |
| 진로 프로필 — 제출 여부·제출일 | 보기 | 보기 | — | 보기 | 보기 | — |
| 선택과목 이수 계획 | 보기 | 보기 | — | 보기 | 보기·작성 | 공개분 |
| 권장 이수 과목(참고 자료) | 보기 | 보기 | — | 보기 | 보기 | — |
| 탐구 기록 요약·진행 상태·결과물 링크·메모 | 보기 | 보기 | — | 보기 | 보기·작성(진행 칸) | 공개분 |
| 탐구 원본 JSON(Drive 파일) | 파일 id만 | — | — | — | — | — |
| 교사 피드백(프로필·계획·탐구) | 보기 | 보기·작성 | — | 보기 | 보기 | — **(질문 Q3)** |
| 상담 신청 — 날짜·주제·상태 | 보기 | 보기·처리 | — | 보기 | 보기·신청·취소 | — |
| 상담 신청 — 학생 메모 | 보기 | 보기 | — | 보기 **(Q8)** | 보기 | — |
| 상담일지 — 날짜·교사·유형 | 보기 | 보기 | — | 보기 | 보기 **(Q6)** | 날짜·교사만(show_to_parent가 TRUE일 때) |
| 상담일지 — 내용 | 보기 | 보기(작성자·담당) | — | 보기 | — | — |
| 상담일지 — 합의 사항·다음 할 일 | 보기 | 보기 | — | 보기 | 보기 | 학생이 공개한 것만 |
| 상담일지 — 참고한 프로필 버전 | 보기 | 보기 | — | 보기 | — | — |
| 학생 타임라인 | 보기 | 보기 | — | 보기 | — | — |

- "학사 교사(담당)" = 그 기간 `enrollments.teacher_email`이 본인. 근무일 범위(isOnDuty)는 6단계 키에 **넣지 않는다**(noDuty — 지금 `counsel.view`와 같음).
- 출결 담당은 지금 `canAccessStudentByFacts_`가 학사생 전체를 허용하므로, 6단계 키의 roles에 `attendance`를 **넣지 않는다**(지금 `counsel.view` 주석과 같은 방식). 출결 담당이면서 학사 교사(담당)인 계정은 hall_teacher로 통과한다.
- 담임은 "자기 반 + 이번 기간 등록"(지금 `inHomeroom`). 지난 기간 기록을 볼 때의 기간 판정은 Q9.

## 3. 규칙 함수(순수, `src/rules/`) — 목록·시그니처

이름 끝 `_`, Apps Script 서비스·인자 없는 `new Date()` 금지. 시트 행을 그대로 받고 아무것도 쓰지 않는다. 파일은 세 개로 나눈다.

### 3.1 `src/rules/CareerRules.gs`(F15)

```js
careerProfileCheck_(input)
  // 제출 입력 검사 → {row:{hopes:[{rank, field, job}], targets:[{university, unit, track}], interests, strengths, concerns}, errors:[]}
  // 희망 1~3순위(순위 중복·빈 1순위 오류), 목표 진학 0개 이상(대학·학과 빈칸 오류), 글자 수 상한(칸 한도 안). 공개 표시는 받지 않는다(별도 함수)
careerNextVersion_(profiles, studentId)
  // → 그 학생의 다음 버전 번호(살아 있는 행·취소 행 모두 세어 max + 1 — 번호를 다시 쓰지 않는다)
careerLatest_(profiles, studentId, opts)
  // → 가장 최근 제출 버전 행 또는 null. opts.termId면 그 기간 안에서, opts.asOf(iso)면 그 시각 이전 제출 중
careerMissing_(students, enrollments, profiles, term, today)
  // → [{studentId, lastSubmittedAt}] 이번 기간 학사생 중 마감일(term.career_due) 이후 이번 기간 제출 버전이 없는 학생.
  //   마감일이 비었거나 오늘이 마감 전이면 []. 학사 '입실' 상태로 거르는지는 Q10
careerPublishPlan_(current, request)
  // 학부모 공개 표시 바꾸기 → {patch, errors}. request = {fields:{hopes:true, targets:false, …}}. 항목 이름은 정해진 목록만(모르는 항목 오류)
coursePlanCheck_(curriculum, entryYear, selections, existing)
  // 이수 계획 검사 → {rows, errors, warnings}. curriculum = curriculum_courses 행(입학년도·학년·학기·선택군·택N·과목).
  //   편제에 없는 과목·학년·학기 오류, 선택군마다 고른 수 > 택N이면 오류(F15 '택N 초과는 막는다'), 같은 과목 두 번 오류
courseRecsFor_(recs, targets, opts)
  // 희망 학과의 권장 이수 과목(참고) → [{university, unit, core:[], recommended:[], baseYear, sourceTitle, sourceUrl, note}]
  //   대학 이름은 정확히, 모집단위는 정확히 같은 것 → 없으면 포함 일치(후보 여러 개면 모두, 판정하지 않음). 기준 연도가 여럿이면 최신만(opts.baseYear로 고정 가능)
```

### 3.2 `src/rules/InquiryRules.gs`(F16)

```js
inquiryParse_(text, opts)
  // 탐구발견 기록 파일 → {meta:{app, schema, exportedAt}, records:[요약], errors:[], warnings:[]}
  //   app !== 'shinhan-discovery' 또는 schema !== 1 → 오류. 12MB(opts.maxBytes) 초과·1,000건(opts.maxRecords) 초과 → 오류.
  //   같은 기록 id가 파일 안에 여럿: 본문(주제·질문·성취기준·출처)이 같으면 반응 이벤트(관심 표시)만 합침, 다르면 오류(F16).
  //   파일 속 이름·학급은 읽기만 하고 신원에 쓰지 않는다(warnings에 "파일 이름이 계정 이름과 다릅니다" 정도만 — Q5).
  //   요약 = {sourceId, recordedAt, source:'ChatGPT'|'연결 예시'|'기본 추천', standards:[코드 2개], subject, title, question, liked}
inquiryMergePlan_(existing, parsed, studentId, fileId)
  // 기존 inquiry_records(그 학생 것)와 합치기 → {toAppend:[행], toUpdate:[{id, patch}], same:n, conflicts:[{sourceId, why}]}
  //   같은 원본 기록 id가 이미 있으면: 본문 같음 → 관심 표시만 갱신(같으면 0건 — 같은 파일 다시 올려도 중복 없음, F16 완료 기준),
  //   본문 다름 → conflicts(덮어쓰지 않음). 학생이 덧붙인 진행 상태·링크·메모·공개 표시는 건드리지 않는다
inquiryProgressCheck_(input)
  // 진행 기록 검사 → {patch, errors}. 상태 '관심'·'진행 중'·'완료', 결과물 링크는 http(s)만, 메모 길이 상한
```

### 3.3 `src/rules/CounselRules.gs`(F12 확장·F17)

```js
counselRequestCheck_(input, today)
  // 학생 상담 신청 검사 → {row, errors}. 희망 날짜 1~3개(오늘 이후, 중복 없음 — 개수 상한은 Q7), 주제 '생활'·'학습'·'진로'·'진학'·'기타', 메모 길이 상한
counselRequestNext_(request, action, actor)
  // 상태 전이 → {patch, errors}. 신청 → 확정(날짜 하나 고름)·반려(사유) / 확정 → 완료(상담일지 id 연결)·반려 / 신청·확정 → 취소(학생 본인).
  //   완료·반려·취소에서 다른 상태로 못 감. actor.role로 누가 무엇을 하는지 판정(학생은 취소만)
counselNoteCheck_(input)
  // 상담일지 검사(유형·대상·날짜·내용·합의 사항) → {row, errors}. 진로·진학 유형이면 profile_version(참고한 버전)을 받는다(없으면 경고)
counselView_(note, viewer)
  // 한 건을 보는 사람에 맞게 줄인다 → 표 2절의 칸만 담은 객체 또는 null(못 봄).
  //   viewer = {kind:'staff'|'student'|'parent', canReadContent}. 학부모: show_to_parent가 TRUE면 {date, teacherName}
  //   + agreement_to_parent가 TRUE면 agreement. 학생: 본인 것만, content는 늘 뺌. staff: canReadContent면 전부
```

### 3.4 공통 `src/rules/Stage6Rules.gs`(또는 위 셋 중 하나에)

```js
s6Visible_(viewer, kind, row)
  // 판정표(2절)를 코드로 — kind 'profile'|'plan'|'inquiry'|'feedback'|'request'|'note' → 보여 줄 칸 이름 배열([]이면 못 봄).
  //   viewer = {role:'admin'|'assigned'|'homeroom'|'student'|'parent'|'none', isSelf, isChild}. 서버는 이 배열의 칸만 응답에 담는다
s6ParentFields_(row, kind)
  // 학부모 공개 표시를 읽어 공개된 항목 이름 배열. 표시가 비었거나 알 수 없는 값이면 [](기본 비공개, 결정 15)
s6Timeline_(sources, studentId, opts)
  // 학생 타임라인 → [{at, kind, title, ref}] 시간 내림차순. sources = {profiles, plans, inquiries, notes, violations, exceptions}
  //   상담은 날짜·교사·합의 사항만(내용 없음), OUT·출결은 요약 한 줄. 보는 사람 거르기는 s6Visible_로 먼저
```

계약(`docs/contracts/rules-api.md`)에는 구현 PR에서 시그니처 블록과 동작 메모를 넣는다.

## 4. 데이터 모양 — 시트 구조 승인이 필요한 곳

PRD 7절에 탭 이름·열 개요가 있지만 아래는 **구현 전에 선생님 승인**(CLAUDE.md "확인 없이 하지 말 것")이 필요하다. 이 초안은 제안만 한다.

- `career_profiles`: 항목별 학부모 공개를 **열 하나**(`parent_fields` = 공개 항목 이름을 `;`로, 예 `hopes;targets`)로 둔다(항목이 늘어도 열이 늘지 않음). 희망·목표는 JSON 문자열 한 칸씩(순위·여러 개).
- `terms`: `career_due`(진로 프로필 제출 마감일) 열 — PRD 7절에 있음, 아직 시트에 없음.
- `counsel_notes`(상담 스프레드시트): `agreement`, `agreement_to_parent`(TRUE·FALSE, 기본 FALSE — Q2), `profile_version`, `request_id` 열 추가. 2단계 열 뒤에 끼운다(Schema.gs 주석 "6단계 열은 그때 setup이 제자리에").
- `counsel_requests`(상담 스프레드시트): PRD 7절 열 그대로 + `status`·`cancel_reason`·`decided_date`.
- `inquiry_records`: 원본 기록 id(`source_id`)는 학생별로 유일. 원본 JSON은 비공유 Drive 폴더에 파일, 시트에는 파일 id만(F16).
- `feedback`: 학생, 대상 종류, 대상 id, 내용, 작성 교사 + `status`·`cancel_reason`(삭제 대신 취소).

## 5. 선생님 질문 후보(정하지 않음 — 총괄 경유)

PRD 13절의 열린 질문은 지금 "0단계 진단 결과"뿐이고, 아래는 PRD·결정에 답이 없어 **구현 전에 여쭐 것**이다. 괄호는 규칙 쪽 기본값 제안(정해질 때까지 `// ASSUMPTION:`으로 쓸 값).

- **Q1. 학부모 공개는 버전마다 다시 고르나?** 새 버전을 낼 때 이전 버전의 공개 항목을 이어받는지. (제안: 이어받고, 제출 화면에 지금 공개 항목을 보여 줌.) 학부모에게 보이는 것은 가장 최근 버전의 공개분만인지, 지난 버전도 보이는지. (제안: 가장 최근만.)
- **Q2. 합의 사항의 학부모 공개 기본값.** 진로·탐구는 기본 비공개(결정 15)인데 합의 사항은 정해지지 않았다. 학생이 건마다 고르나, 한 번에 고르나. (제안: 건마다, 기본 비공개.)
- **Q3. 교사 피드백이 학부모에게 보이나.** F15는 "학생에게 보인다"만 적혀 있다. (제안: 보이지 않음.)
- **Q4. 학생이 공개를 거둬들이면.** 바로 학부모 화면에서 사라지는 것으로 충분한지(이미 본 것은 되돌릴 수 없음을 안내). (제안: 바로 사라짐 + 안내 문구.)
- **Q5. 탐구 파일 속 이름이 계정 학생과 다를 때.** 경고만 하고 받는지, 막는지. 신원은 어차피 계정으로 정한다. (제안: 경고만.)
- **Q6. 학생이 자기 상담일지의 유형(진로·생활 등)을 보나.** 표는 "합의 사항만(본인)". 날짜·교사는 보이는 게 자연스럽지만 유형은 애매하다. (제안: 날짜·교사·합의 사항만, 유형은 안 보임.)
- **Q7. 상담 신청 제한.** 희망 날짜 개수 상한, 처리 안 된 신청이 있을 때 또 신청할 수 있는지, 반려 사유를 학생에게 보이는지. (제안: 날짜 3개, 열린 신청 1건, 반려 사유 보임.)
- **Q8. 담임이 상담 신청 메모를 보나.** 권한표 "상담 신청 보기(자기 반)". 메모에 담임에게 말하기 어려운 내용이 들어갈 수 있다. (제안: 날짜·주제·상태만, 메모는 담당교사만.)
- **Q9. 퇴실·졸업한 학생의 진로·상담 기록.** 학사생이 아니게 된 뒤 담당교사·담임이 계속 보는지(지난 기간 담당 기준). 학생 본인·학부모는 계속 보는지. (제안: 교사는 그 기록이 생긴 기간의 담당 기준, 학생·학부모는 본인 기록 계속.)
- **Q10. 진로 프로필 미제출 목록에 넣는 학생.** 이번 기간 등록생 전체인지, 학사 '입실' 상태인 학생만인지. 마감 뒤 들어온 학생은 언제부터 미제출로 보나. (제안: 마감일에 학사 입실이었던 학생 + 입실 뒤 14일 유예.)
- **Q11. 이수 계획은 버전으로 쌓나.** PRD는 진로 프로필만 "덮어쓰지 않는다"고 하고, 이수 계획은 상태(계획·확정)만 있다. (제안: 행 단위로 취소 + 새 행, 확정은 담당교사 확인 표시로.)
- **Q12. 탐구 원본 파일 보관 기간·삭제.** 학생이 졸업하거나 기록을 지우고 싶을 때(기록은 지우지 않는다 원칙과 개인정보 최소 보관 사이). (제안: 졸업 뒤 1년 보관 후 관리자가 정리 — 정책 결정 필요.)

## 6. 다음 단계(제안)

1. 0단계 진단 결과로 학생·학부모 로그인 방식 확정(PRD 6.1) — 학생·학부모 함수 연결 전제.
2. 위 Q1~Q12 선생님 답 → `docs/decisions.md`.
3. 4절 시트 구조 승인 → Schema 작업(총괄).
4. 규칙 PR 셋(Career·Inquiry·Counsel + 공통 판정) — 각 PR에 판정표 시험(역할 6 × 기록 종류, 응답에 금지 칸이 없는지)과 탐구발견 시험 파일(가짜 학생) 왕복 시험.
