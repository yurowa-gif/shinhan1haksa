# 신한1학사 관리 웹앱

Google Apps Script 웹앱 + Google Sheets. 요구사항은 [`PRD.md`](PRD.md), 작업 규칙은 [`CLAUDE.md`](CLAUDE.md).

현재 단계: **0단계(기반·로그인 검증)** — 확인 체크리스트는 [`docs/stage0-checklist.md`](docs/stage0-checklist.md).

## 폴더

```
src/                 clasp로 올라가는 코드(rootDir)
  appsscript.json    웹앱 설정: 나로 실행, Google 계정이 있는 모든 사용자
  Code.gs            doGet 라우팅, 역할별 홈 데이터, 접속 진단
  Auth.gs            requirePermission(action, context), 역할·범위 판정
  Db.gs              시트 읽기·쓰기, LockService, audit_log
  Schema.gs          탭·열 정의, 역할 코드, 설정 기본값
  Setup.gs           setup(), addUser() — 편집기에서 소유자만 실행
  dev/FakeData.gs    가짜 학생 30명 생성(seedFakeData)
  ui/                화면(Index + 역할별 home_*.html, Diag, NoAccess)
tests/run.js         순수 함수 단위 테스트 (npm test)
```

## 처음 설치

```bash
npm i -g @google/clasp
clasp login
clasp create --type webapp --title "신한1학사" --rootDir src
git checkout src/appsscript.json   # create가 덮어쓴 설정 파일을 저장소 버전으로 되돌림
clasp push
clasp open                          # 브라우저에서 편집기 열기
```

편집기에서:

1. `setup` 실행 → 권한 승인. 내 드라이브에 스프레드시트 3개(운영DB·상담일지·설정)가 생기고 내 계정이 관리자로 등록된다. **파일은 아무와도 공유하지 않는다.**
2. 프로젝트 설정 → 스크립트 속성에 시험 계정을 넣는다(코드에는 적지 않음).
   - `TEST_STUDENT_EMAIL`, `TEST_PARENT_EMAIL` (필수)
   - `TEST_TEACHER_EMAIL`, `TEST_HOMEROOM_EMAIL` (선택)
3. `seedFakeData` 실행 → 가짜 학생 30명, 운영 기간 2개, 담당·학부모 연결.
4. 배포 → 새 배포 → 웹앱(실행: 나 / 액세스: Google 계정이 있는 모든 사용자) → `/exec` URL 복사.
   - `/dev` 테스트 URL은 편집 권한자만 열 수 있어 학생·학부모 시험 계정으로는 확인할 수 없다.

## 개발

```bash
npm test      # 권한 판정·가짜 데이터·시트 구조 단위 테스트
clasp push    # 코드 올리기 (배포 URL에 반영하려면 배포 관리에서 새 버전 선택)
```
