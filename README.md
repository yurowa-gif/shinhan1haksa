# 신한1학사 관리 웹앱

Google Apps Script 웹앱 + Google Sheets. 요구사항은 [`PRD.md`](PRD.md), 작업 규칙은 [`CLAUDE.md`](CLAUDE.md).

현재 단계: 0단계 코드 완료, **선생님 확인(설치·개인 gmail 진단) 대기** — 체크리스트는 [`docs/stage0-checklist.md`](docs/stage0-checklist.md). 1단계(출석부 핵심)는 작업 세션들이 진행 중 — 분담은 [`docs/plan/stage1.md`](docs/plan/stage1.md), 결정 기록은 [`docs/decisions.md`](docs/decisions.md).

## 폴더

```
src/                 clasp로 올라가는 코드(rootDir)
  appsscript.json    웹앱 설정: 나로 실행, Google 계정이 있는 모든 사용자
  Code.gs            doGet 라우팅, 역할별 홈 데이터, 접속 진단
  Auth.gs            requirePermission_(action, context), 역할·범위 판정
  Db.gs              시트 읽기·쓰기, LockService, audit_log
  Schema.gs          탭·열 정의, 역할 코드, 설정 기본값
  Setup.gs           setup(), addUser() — 편집기에서 소유자만 실행
  dev/FakeData.gs    가짜 학생 30명 생성(seedFakeData)
  dev/FakeSeats.gs   가짜 좌석 배치(1층 146석, SA실 남 17·여 34석)
  ui/                화면(Index + 역할별 home_*.html, Diag, NoAccess, 공통 컴포넌트 Components)
tests/               단위 테스트(npm test가 tests/**/*.test.js를 찾아 실행)
docs/contracts/      작업 세션 사이의 약속(규칙 함수 시그니처, 출석부 모델)
.clasp.json          clasp create가 만드는 연결 정보(scriptId). Git에 올리지 않음
.clasp.json.example  .clasp.json 모양 예시
```

## 처음 설치

처음 한 번만 하면 됩니다. ①~⑧을 순서대로 하고, 코드를 고친 뒤에는 ⑨만 합니다.
Windows와 Mac이 다른 곳은 따로 적었습니다.

> **터미널이 처음이라면**: 터미널(Windows는 "명령 프롬프트")은 Colab에서 `!pip install ...`처럼 앞에 `!`를 붙여 쓰던 명령 칸과 같습니다. 차이는 `!` 없이 명령만 적고 **Enter**를 누른다는 것뿐입니다. 아래 회색 상자 안의 줄을 한 줄씩 복사해 붙여 넣고 Enter를 누르면 됩니다.

준비물: 데이터를 소유할 **학교 Google 계정**(학사 부장 또는 학사 공용 계정), 학생·학부모 역할로 시험할 **개인 gmail 1~2개**.

### ① Apps Script API 켜기

이것을 켜지 않으면 ⑤의 `clasp push`가 실패합니다.

1. 브라우저에서 학교 계정으로 로그인한 상태로 <https://script.google.com/home/usersettings> 를 엽니다.
2. "Google Apps Script API" 오른쪽 스위치를 눌러 **사용**(On)으로 바꿉니다.
3. 바꾼 뒤 몇 분 지나야 반영될 수 있습니다.

### ② Node.js 설치와 터미널 열기

clasp(코드를 Apps Script로 올려 주는 도구)는 Node.js 위에서 돌아갑니다.

1. <https://nodejs.org> 에서 **LTS** 라고 적힌 버전을 내려받아 설치합니다. 설치 화면은 모두 기본값으로 "다음(Next)"을 누르면 됩니다.
2. 설치가 끝나면 터미널을 **새로** 엽니다.
   - **Windows**: 화면 아래 시작 버튼 → `cmd` 입력 → **명령 프롬프트** 클릭.
   - **Mac**: `Command(⌘) + Space` → `터미널` (또는 `Terminal`) 입력 → Enter.
     (Finder → 응용 프로그램 → 유틸리티 → 터미널 로도 열 수 있습니다.)
3. 아래를 입력하고 Enter를 누릅니다.
   ```
   node -v
   ```
   `v22.12.0`처럼 `v`로 시작하는 숫자가 나오면 성공입니다.

### ③ 코드 내려받기와 폴더로 이동하기

둘 중 편한 방법 하나만 하면 됩니다. Git을 쓰면 나중에 코드가 바뀌었을 때 받기가 쉽습니다.

**방법 A. Git으로 받기(권장)**

1. Git 설치
   - **Windows**: <https://git-scm.com> → "Download for Windows" → 설치 파일 실행 → 모두 기본값으로 "Next".
   - **Mac**: 터미널에 `git --version` 입력. 설치 안내 창이 뜨면 **설치**(Install)를 누릅니다(명령어 라인 개발자 도구, Command Line Developer Tools).
2. 터미널을 새로 열고, 내려받을 곳(문서 폴더)으로 이동한 뒤 받습니다. `https://github.com/yurowa-gif/shinhan1haksa.git`는 GitHub 저장소 페이지의 초록색 **Code** 버튼을 누르면 나오는 주소(`https://github.com/...git`)로 바꿉니다.
   - **Windows**
     ```
     cd Documents
     git clone https://github.com/yurowa-gif/shinhan1haksa.git
     cd shinhan1haksa
     ```
   - **Mac**
     ```
     cd ~/Documents
     git clone https://github.com/yurowa-gif/shinhan1haksa.git
     cd shinhan1haksa
     ```

**방법 B. ZIP으로 받기(Git 설치 없이)**

1. GitHub 저장소 페이지 → 초록색 **Code** 버튼 → **Download ZIP**.
2. 내려받은 ZIP 파일을 압축 풉니다(Windows: 오른쪽 클릭 → **압축 풀기**(모두 압축 풀기) / Mac: 더블클릭). `shinhan1haksa-main` 같은 폴더가 생깁니다.
3. **ZIP 파일은 지우지 말고 둡니다.** ⑤에서 파일 하나를 다시 꺼내야 합니다.
4. 터미널에서 그 폴더로 이동합니다(아래 "폴더로 이동하는 법").

> 작업이 아직 `main`이 아닌 다른 브랜치에 있다면: Git은 `git clone -b <브랜치이름> https://github.com/yurowa-gif/shinhan1haksa.git`, ZIP은 GitHub에서 왼쪽 위 브랜치 목록에서 브랜치를 먼저 고른 뒤 Download ZIP을 누릅니다.

**폴더로 이동하는 법(`cd`)**

`cd`는 "이 폴더로 들어가기"입니다. Colab에서 `%cd /content/drive/...`를 쓰던 것과 같습니다. 폴더 주소를 직접 치기 어렵다면:

1. 터미널에 `cd` 와 **띄어쓰기 한 칸**까지만 입력합니다(아직 Enter 누르지 않음).
2. 파일 탐색기(Windows)나 Finder(Mac)에서 압축 푼 폴더를 마우스로 끌어 터미널 창에 놓습니다. 폴더 주소가 자동으로 붙습니다.
3. Enter를 누릅니다.

- Windows에서 폴더가 다른 드라이브(예: `D:`)에 있으면 `cd /d ` 다음에 끌어 놓습니다.
- 제대로 들어왔는지 확인: Windows `dir`, Mac `ls` 를 입력했을 때 `README.md`, `src`, `package.json` 이 보이면 맞습니다.

**이후의 모든 명령은 이 폴더 안에서 실행합니다.** 터미널을 닫았다 다시 열면 `cd`부터 다시 합니다.

### ④ clasp 설치와 로그인

1. 설치(Colab의 `!pip install`과 같은 일입니다).
   ```
   npm install -g @google/clasp
   ```
   - **Mac**에서 `EACCES` 또는 `permission denied`가 나오면 `sudo npm install -g @google/clasp` 로 다시 실행합니다. Mac 로그인 비밀번호를 물으면 입력하고 Enter(입력해도 화면에 글자가 보이지 않는 것이 정상입니다).
2. 설치 확인. `3.`으로 시작하는 숫자가 나오면 됩니다.
   ```
   clasp -v
   ```
   `'clasp'은(는) ... 명령이 아닙니다` 또는 `command not found`가 나오면 터미널을 닫고 새로 연 뒤 ③의 `cd`부터 다시 합니다.
3. 로그인
   ```
   clasp login
   ```
   - 브라우저가 열립니다. **학교 계정**을 고릅니다(개인 gmail이 아님).
   - 권한 목록에 체크박스가 있으면 **모두 선택**(Select all)에 체크하고 **허용**(Allow)을 누릅니다.
   - 브라우저에 `Logged in! You may close this page.` 가 나오면 창을 닫고 터미널로 돌아옵니다.

### ⑤ Apps Script 프로젝트 만들고 코드 올리기

1. 프로젝트 만들기
   ```
   clasp create --type standalone --title "신한1학사" --rootDir src
   ```
   `Created new script: https://script.google.com/d/.../edit` 가 나오면 성공입니다. 폴더에 `.clasp.json` 이 생깁니다.
   (웹앱 설정은 `src/appsscript.json`에 이미 들어 있으므로 `--type`은 `standalone`이면 됩니다. clasp 2.x의 `--type webapp`은 clasp 3.0~3.3에서 오류가 납니다.)
2. 방금 명령이 덮어쓴 파일 두 개를 정리합니다. **이 단계를 빼면 다음 `clasp push`가 실패하거나 웹앱 설정이 사라집니다.**
   - 설정 파일 되돌리기
     - Git으로 받은 경우:
       ```
       git checkout src/appsscript.json
       ```
     - ZIP으로 받은 경우: ③에서 둔 ZIP 파일을 다시 열어 `src/appsscript.json` 을 꺼내 지금 폴더의 `src` 안에 **덮어쓰기**합니다.
   - 자동으로 생긴 빈 코드 파일 지우기(`src/Code.gs`와 이름이 겹쳐 오류가 납니다)
     - **Windows**: `del src\Code.js`
     - **Mac**: `rm src/Code.js`
3. 코드 올리기
   ```
   clasp push
   ```
   `Manifest file has been updated. Do you want to push and overwrite?` 라고 물으면 `y` 를 입력하고 Enter. `Pushed 20 files` 처럼 파일 목록이 나오면 성공입니다(파일 수는 버전마다 다릅니다).
4. 편집기 열기
   ```
   clasp open-script
   ```
   브라우저에 Apps Script 편집기가 열립니다. (clasp 2.x라면 `clasp open`. 명령이 안 되면 <https://script.google.com> 에서 "신한1학사" 프로젝트를 눌러도 됩니다.)

### 2단계를 처음 배포한 직후에 한 번: 자동 OUT 맞추기

2단계(F4 OUT)를 연결하기 **전에** 이미 확정해 둔 미인정 특이사항이 있다면, 편집기에서 `syncAutoOutsAll` 함수를 한 번 실행합니다(함수 선택 칸에서 `syncAutoOutsAll` → **실행**, 인자를 비우면 현재 운영 기간). 쌓여 있던 확정 건의 자동 1OUT이 만들어지고 알림 메일은 가지 않습니다. 두 번 실행해도 중복이 생기지 않습니다. 이후에는 특이사항을 저장·확정·취소할 때마다 앱이 알아서 맞춥니다.

**시트를 손으로 고친 뒤 '같은 id' 오류가 나면.** 편집기에서 `repairDuplicateIds`를 인자 없이 실행하면 미리보기만 보여 줍니다(어느 탭 몇 행이 바뀌는지, 아무것도 쓰지 않음). 괜찮으면 `repairDuplicateIds(true)`로 실제 실행합니다. 같은 id가 여러 줄이면 가장 위 줄이 id를 지키고 아래 줄·빈 id 줄에 새 id를 주며, 행은 지우지 않고 audit_log에 `repair_id`로 남습니다.

**매일 백업(O1).** 배포 뒤 편집기에서 `installNightlyBackup`을 한 번 실행합니다(매일 밤 2시대 트리거가 하나만 생기고, 다시 실행해도 늘지 않습니다). 바로 확인하려면 `runBackupNow`를 실행하세요 — Drive의 `신한1학사_백업` 폴더에 `백업 날짜 …` 사본 3개(운영 DB·상담일지·설정)와 `앱상태.json`이 생기고 아무와도 공유되지 않아야 합니다. 30일이 지난 사본은 휴지통으로 갑니다. 실패하면 audit_log에 `backup:failed`가 남고(메일 알림을 켠 경우) 소유자에게 메일이 갑니다. 백업이 며칠 계속 실패하면 그동안의 사본이 없고, 실패한 날에는 오래된 사본도 치우지 않으므로 이미 있는 사본은 그대로 남습니다(실패 메일이 오면 바로 `runBackupNow`로 원인을 확인하세요). 같은 때 두 번 돌지 않도록 실행 중 표시(`BACKUP_RUNNING`)를 쓰고, 30분이 지나면 저절로 풀립니다. 트리거가 부르는 함수는 `nightlyBackup`(소유자만)입니다. 트리거 실행에서 소유자 확인(`assertOwnerRun_`)이 실패하면 앱의 audit_log·메일에는 아무것도 남지 않고 구글이 보내는 '트리거 실패' 메일만 옵니다 — 설치 다음 날 `backup:ok`가 없으면 그 메일을 확인하세요. 백업 트리거를 만들려면 권한 범위(`script.scriptapp`)가 새로 필요해서, **이 버전을 배포한 뒤 편집기에서 처음 함수를 실행할 때 권한 승인 창이 한 번 더 뜹니다**(⑥-4처럼 허용하세요. 웹앱 배포를 새 버전으로 올릴 때도 같은 승인이 필요합니다).

실제 Drive에서만 확인되는 것(가짜로는 시험하지 못함): ① 설치한 다음 날 아침 `audit_log`에 `backup:ok`가 새로 생겼는지(트리거가 실제로 도는지, 시간 트리거에서 소유자 확인이 통과하는지), ② 사본의 소유자가 나로 잡히고 다른 사람에게 열려 있지 않은지, ③ 백업 폴더와 사본에 폴더 공유가 상속되지 않았는지.

### ⑥ 편집기에서 `setup` 실행(데이터 파일 만들기)

1. 왼쪽 **파일**(Files) 목록에서 `Setup.gs` 를 누릅니다.
2. 위쪽 도구 막대에서 **실행**(Run) 버튼 오른쪽의 함수 선택 칸을 눌러 `setup` 을 고릅니다. (열려 있는 파일의 함수만 목록에 나옵니다.)
3. **실행**(Run)을 누릅니다.
4. 처음에는 승인 창이 뜹니다.
   1. **승인 필요**(Authorization required) 창 → **권한 검토**(Review permissions).
   2. 학교 계정을 고릅니다.
   3. "Google에서 확인하지 않은 앱"(Google hasn't verified this app) 화면이 나오면 왼쪽 아래 **고급**(Advanced) → **신한1학사(으)로 이동(안전하지 않음)**(Go to 신한1학사 (unsafe)). 내가 만든 스크립트라서 나오는 경고이며, 학교 계정에서는 이 화면 없이 바로 넘어가기도 합니다.
   4. 권한 목록 → **허용**(Allow).
5. 아래쪽에 **실행 로그**(Execution log)가 자동으로 열립니다. `[생성] 신한1학사_운영DB ...` 같은 줄이 보이고 마지막에 "실행이 완료됨"(Execution completed)이 나오면 성공입니다. 로그 창이 안 보이면 도구 막대의 **실행 로그** 버튼을 누릅니다. 지난 실행 기록은 왼쪽 **실행**(Executions, ≡ 모양 아이콘) 메뉴에서 볼 수 있습니다.

결과: 내 드라이브에 스프레드시트 3개(운영DB·상담일지·설정)가 생기고 내 계정이 관리자로 등록됩니다. **세 파일은 아무와도 공유하지 않습니다.**

### ⑦ 스크립트 속성에 시험 계정 넣고 가짜 데이터 만들기

시험 계정 이메일은 코드에 적지 않고 여기에만 넣습니다.

1. 왼쪽 맨 아래 톱니바퀴 **프로젝트 설정**(Project Settings)을 누릅니다.
2. 화면 맨 아래 **스크립트 속성**(Script Properties) → **스크립트 속성 수정**(Edit script properties) → **스크립트 속성 추가**(Add script property).
3. 왼쪽 칸(속성, Property)에 키, 오른쪽 칸(값, Value)에 이메일을 넣습니다. 한 줄 넣을 때마다 **스크립트 속성 추가**를 다시 누릅니다.

   | 속성(키) | 값(예시) | |
   | --- | --- | --- |
   | `TEST_STUDENT_EMAIL` | `시험학생@gmail.com` | 필수. 가짜 학생 1번이 됩니다 |
   | `TEST_PARENT_EMAIL` | `시험학부모@gmail.com` | 필수. 가짜 학생 1·2번(형제)의 학부모가 됩니다 |
   | `TEST_TEACHER_EMAIL` | `시험교사@학교도메인` | 선택. 학사 교사 |
   | `TEST_HOMEROOM_EMAIL` | `시험담임@학교도메인` | 선택. 학생 1번 반의 담임 |

   `DB_ID`, `COUNSEL_ID`, `CONFIG_ID`, `DIAG_ENABLED` 처럼 `setup`이 이미 넣어 둔 속성은 건드리지 않습니다.
   재설치하면 Script Property `AUTO_OUT_SINCE`가 없어진다 — 기본 3종 밖 자동 OUT 유형은 그때부터 자동(결정 40·stage2 R9).
4. **스크립트 속성 저장**(Save script properties)을 누릅니다.
5. 왼쪽 **편집기**(Editor, `< >` 아이콘)로 돌아가 파일 목록에서 `dev/FakeData.gs` 를 열고, 함수 선택 칸에서 `seedFakeData` → **실행**.
   실행 로그에 `가짜 데이터: 운영 기간 2, 학생 30, ...` 이 나오면 성공입니다.

### ⑧ 웹앱으로 배포하기

1. 편집기 오른쪽 위 파란 **배포**(Deploy) → **새 배포**(New deployment).
2. 왼쪽 "유형 선택"(Select type) 옆 톱니바퀴 → **웹 앱**(Web app).
3. 설정
   - 설명(Description): `0단계 시험` 처럼 아무거나.
   - 다음 사용자 인증 정보로 실행(Execute as): **나**(Me, 내 학교 계정 이메일).
   - 액세스 권한이 있는 사용자(Who has access): **Google 계정이 있는 모든 사용자**(Anyone with Google account).
4. **배포**(Deploy). 승인 창이 다시 뜨면 ⑥-4와 같이 허용합니다.
5. "웹 앱" URL(`https://script.google.com/macros/s/.../exec`)의 **복사**(Copy)를 눌러 메모해 둡니다. 이 `/exec` 주소를 학생·학부모 시험 계정에서 엽니다.

> **꼭 확인**: 3번 목록에 **Google 계정이 있는 모든 사용자**가 없고 "나만", "(학교) 내 모든 사용자"만 보이면 학교 Workspace 정책이 외부 계정을 막고 있는 것입니다. 중요한 검증 결과이므로 화면을 캡처해 알려 주세요([체크리스트 F절](docs/stage0-checklist.md) 참고).

> `/dev`로 끝나는 주소(**배포** → **배포 테스트**(Test deployments)에서 보이는 주소)는 편집 권한이 있는 사람만 열 수 있습니다. 학생·학부모 시험 계정으로는 반드시 `/exec` 주소를 씁니다.

### ⑨ 코드를 고친 뒤 반영하기

1. 터미널에서 프로젝트 폴더로 이동(`cd`)한 뒤
   ```
   clasp push
   ```
   (`Manifest file has been updated...` 라고 물으면 `y`)
2. 편집기 오른쪽 위 **배포** → **배포 관리**(Manage deployments).
3. 왼쪽에서 사용 중인 배포를 고르고, 오른쪽 위 연필 아이콘 **수정**(Edit)을 누릅니다.
4. **버전**(Version) 칸에서 **새 버전**(New version)을 고르고 **배포**(Deploy).

이렇게 하면 `/exec` 주소는 그대로이고 내용만 바뀝니다. **새 배포**를 다시 누르면 주소가 새로 생기므로, 코드 반영에는 쓰지 않습니다.

### 자주 막히는 곳

- **`User has not enabled the Apps Script API`**(Apps Script API를 사용 설정하지 않음): ①을 다시 확인합니다. 켠 직후라면 몇 분 뒤 다시 `clasp push`.
- **`'clasp'은(는) 내부 또는 외부 명령 ... 이 아닙니다` / `command not found: clasp`**: 설치 직후 열려 있던 터미널은 새 프로그램을 모릅니다. 터미널을 닫고 새로 연 뒤 `cd`부터 다시 합니다.
- **Windows PowerShell에서 `이 시스템에서 스크립트를 실행할 수 없으므로`**: PowerShell 대신 ②의 **명령 프롬프트**(cmd)를 씁니다.
- **`Conflicting files found`**: `src/Code.js` 가 남아 있습니다. ⑤-2의 지우기를 합니다.
- **승인 중 "Google에서 확인하지 않은 앱" 경고**: 내가 만든 스크립트라서 나오는 정상 화면입니다. **고급** → **신한1학사(으)로 이동(안전하지 않음)** → **허용**.
- **`clasp login` 중 "액세스 차단됨"(Access blocked) 화면**: 학교 관리자가 외부 앱 접근을 막은 경우입니다. 화면을 캡처해 Workspace 관리자에게 문의합니다.
- **개인 gmail로 `/exec`를 열었는데 학교 계정으로 열리거나 "권한이 없습니다"가 뜸**: 브라우저에 여러 Google 계정이 로그인되어 있으면 다른 계정으로 열릴 수 있습니다. **시크릿 창**(Chrome: Windows `Ctrl+Shift+N`, Mac `⌘+Shift+N`)을 열고 그 계정 하나로만 로그인한 뒤 주소를 붙여 넣습니다. 계정마다 시크릿 창을 따로 엽니다.
- **고친 코드가 `/exec`에 안 보임**: `clasp push`만으로는 `/exec`에 반영되지 않습니다. ⑨의 "새 버전" 배포까지 합니다.

## 개발

```bash
npm test                  # 단위 테스트 전체를 TZ=Asia/Seoul, TZ=UTC에서 한 번씩(Windows 명령 프롬프트도 그대로)
node tests/run.js --once  # 지금 컴퓨터의 시간대로 한 번만
node tests/run.js rules   # 경로에 rules가 들어간 테스트 파일만
clasp push                # 코드 올리기 (/exec에 반영하려면 위 ⑨처럼 배포 관리에서 새 버전)
```
