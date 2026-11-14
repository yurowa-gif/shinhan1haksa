# 확인서 렌더러 계약 (결정 68, 코딩B ↔ 디자인)

서버(`Meals.gs`·`Moves.gs`)가 모델을 만들고, 디자인 세션이 `src/print/`에 만드는 **순수 함수** 두 개가 HTML을 돌려준다. 서버는 그 HTML을 `sheetMakePdf_`로 PDF로 바꿔 base64로 화면에만 내려주고 **Drive에 남기지 않는다**(학생 이름이 들어감). 양식 구조는 `docs/reference/meal-confirm-form.md`(2025판). 렌더러가 없으면 서버는 `{ok:false, error:'확인서 양식이 아직 준비되지 않았습니다.'}`를 돌려준다(함수 이름이 정의되어 있는지로 판단).

```
printRenderMealConfirm_(model, opts) → HTML 문서 문자열   // 학교급식(미)실시 확인서, A4 세로 1쪽
printRenderMoveConfirm_(model, opts) → HTML 문서 문자열   // 기숙사 및 신한학사 입․퇴실 확인서, A4 세로 1쪽
```
`opts`는 지금 `{}`. Apps Script 서비스·인자 없는 `new Date()` 금지(`src/print` 규칙).

## 급식(미)실시 확인서 모델 (`getMealConfirmPdf` → `foodMealConfirmModel_`)
```
{ form:'meal',
  kind:'실시'|'미실시',                       // 구분 (○표): 급식실시 / 급식미실시
  name, grade:숫자|'', classNo, number,        // 이름 / 학년ㆍ반 (문자열, 숫자 칸은 빈 문자열일 수 있다)
  reasonKind:''|'전입'|'전출'|'장기결석'|'대회출전'|'기타',   // 구분 (○표) — ''이면 어느 것에도 ○하지 않는다
  reasonText:'',                                // reasonKind가 '기타'일 때만 글이 있다: 기타 (          )
  periodFrom:'yyyy-MM-dd',                      // 기간: 적용일 ~ (끝나는 날은 비워 둔다)
  breakfast:{on,off,reason:''}, dinner:{on,off},// 체크칸 ✓ — 신청 하나는 한 항목이라 true는 많아야 하나. breakfast.reason은 지금 늘 '' (종이에 ○)
  date:'yyyy-MM-dd',                            // 표 아래 날짜 = 신청 일시의 날짜
  teacher:'교사 이름'|'' }                      // 확인자 (서명·도장은 종이에)
```
- 학사 석식 ↔ 일반 석식만 바뀌는 신청은 확인서를 만들지 않는다(서버가 거부, 결정 68 ASSUMPTION).

## 입퇴실 확인서 모델 (`getMoveConfirmPdf` → `inoutConfirmModel_`)
```
{ form:'move',
  direction:'입실'|'퇴실',                      // 입․퇴실 (○표)
  hall:bool, dorm:bool,                         // 구분 (○표) 신한학사 / 기숙사 — '학사 및 기숙사 퇴실'이면 둘 다 true
  effectiveDate:'yyyy-MM-dd',                   // 입․퇴실일
  name, grade, classNo, number,
  remark:'',                                    // ★ 비 고 = 사유. 2OUT 퇴실이면 비운다
  date:'yyyy-MM-dd', teacher:'' }               // 날짜(신청일) / 확인자
```

## 서버가 지키는 것
- 첫 줄 `requirePermission_('status.list')`, 이어서 그 학생(적용일이 속한 기간)의 담당교사·관리자만 `status.edit`로 통과(`setDocSubmitted`와 같다). 거부는 `denied:status.edit` 기록.
- 파일 이름에 학생 이름을 넣지 않는다(`급식확인서_<신청일>.pdf`, `입퇴실확인서_<신청일>.pdf`). 시트·`audit_log`에 아무것도 쓰지 않는다.
- 사유 구분은 시트 열을 늘리지 않고 `reason` 글 앞에 `[전입] `처럼 붙여 저장한다(`foodComposeReason_`·`foodReasonParts_`). 어휘(`vocabulary.md`)에는 총괄이 반영한다.
