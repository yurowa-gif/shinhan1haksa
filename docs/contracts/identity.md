# 신원 판정 계약(identity)

> 결정 82(2026-11-19): 0단계 진단 전이라도 학생·학부모 기능을 먼저 만든다. 로그인 방식(PRD 6.1의 1·2·3안)에 따라 달라지는 것은 **"지금 접속한 사람이 누구인가"** 뿐이다. 그 판정은 한 곳에만 둔다.

## 1. 한 곳: `portalWho_()` (`src/Auth.gs`)

```
portalWho_() → {
  email, registered, roles[],
  isStudent, isParent,
  studentId,        // 본인 학생 id (학생 역할이 아니거나 students.email에 없으면 '')
  ownStudentIds[],  // 같은 이메일을 쓰는 모든 학생(보통 1명)
  childIds[]        // 연결된 자녀 id(중복 없음, guardian_links 순서). 학부모 역할이 아니면 []
}
```

- **지금(1안)**: 접속 이메일(`getCurrentUser_` → `Session.getActiveUser().getEmail()`) → `users` 활성 행의 역할 → 역할이 `student`이면 `students.email`이 같은 학생, `parent`이면 `guardian_links.parent_email`이 같은 줄의 `student_id`들.
- 한 실행 안에서 한 번만 계산한다(`_authMemo.portal`). 역할이 없으면 이메일이 같아도 목록은 비어 있다.
- 쓰는 곳:
  - `requirePermission_`(scope `student`) → `studentFacts_`의 `isOwn`·`isGuardian`이 **이 함수에서만** 나온다(`canAccessStudentByFacts_`는 그대로).
  - 학생·학부모 공개 함수(F10 시설 일지, F14 포털 읽기, F9 시간표 제출·동의)는 첫 줄에서 `requirePermission_(키, {studentId})`를 부르고, **무슨 학생을 볼지**는 `portalWho_()`에서 얻는다(`studentId`·`childIds`). 화면이 보낸 학생 id를 믿지 않는다: 학생은 본인 id만, 학부모는 `childIds`에 든 id만 통과한다.
- 학생·학부모 응답에 넣지 않는 것(7단계 원칙): 다른 학생, 전화번호, 상담 내용(학부모는 날짜·교사만), 교사 메모·OUT 입력자 이메일, 감사 기록.

## 2. 안이 바뀌면 바꿀 곳 (이 함수와 `doGet` 진입만)

| 안 | 상황 | 바꿀 곳 |
| --- | --- | --- |
| **1안** (지금) | 개인 gmail에서도 `Session.getActiveUser().getEmail()`이 잡힌다 | 없음 |
| **2안** | 이메일이 안 잡힘 → 학생·학부모용 별도 웹앱("접속한 사용자로 실행", 이메일 확인 권한만 요청) + 신원 토큰 | `getActiveEmail_()`(또는 `portalWho_` 앞단)이 요청에 붙은 **신원 토큰을 검증**해 이메일을 돌려주게 한다(`ScriptApp.getIdentityToken` → 본 웹앱이 서명·`aud`·만료를 검증). `doGet`에서 학생·학부모 웹앱 진입 경로를 하나 더 두고, 검증을 통과한 이메일만 `getCurrentUser_`에 넘긴다. **`portalWho_`의 계산(이메일 → users → students/guardian_links)과 `requirePermission_`·화면 함수·권한 키는 그대로.** 더할 것: 토큰 검증 함수 하나, 학생·학부모 웹앱 배포 안내(`docs/stage0-checklist.md`), 만료·재발급 오류 문구 |
| **3안** | 웹앱 로그인 자체가 안 됨 → 관리자가 발급한 개인 열람 링크(서명·만료) | 신원이 이메일이 아니라 **링크 토큰**이 된다. `doGet`이 `?t=<서명 토큰>`을 검증(HMAC, 비밀키는 `PropertiesService`, 만료·취소 목록)해 `{role, studentId 또는 parent 연결}`을 만들고 `portalWho_`가 그 값을 돌려주게 한다(`getCurrentUser_`의 이메일 경로는 교사용만). 더할 것: 링크 발급·취소 화면(관리자), 토큰 탭(`portal_links`: 새 탭이므로 시트 구조 변경 확인 필요), 링크 화면에서의 동의(F9)와 감사 기록. 쓰는 사람이 이메일을 가지지 않으므로 `facility.write`·`student.view`의 `scope: student` 판정은 `portalWho_`의 id 목록에 맞춰 같은 사실(isOwn·isGuardian)을 만든다 |

어느 안이든 **화면·권한 키·시트 열·기능 함수는 바뀌지 않는다.** 바뀌는 것은 "누구인가"를 만드는 입구뿐이다. 0단계 진단 결과(PRD 열린 질문 "개인 gmail 로그인 진단")가 나오면 이 표에서 해당 줄만 구현한다.

## 3. 시험

- `tests/core/portal_who.test.js`: 학생·학부모·교사·미등록 계정의 `portalWho_`, `studentFacts_` 연결(본인·자녀·다른 학생), `facility.*` 권한 키.
- 이후 학생·학부모 기능(C35·C36·C37, T7)은 유출 감시로 "학생 A가 B를, 학부모가 다른 집 자녀를 못 본다"를 시험한다.
