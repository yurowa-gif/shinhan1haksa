# 출석부 모델 계약(sheet-model)

> **소유: 총괄.** 이 모양을 바꾸려면 CODING과 DESIGN이 둘 다 동의한 뒤 총괄이 PR을 연다(`docs/plan/stage1.md` 1절).
>
> - **만드는 쪽:** CODING `buildSheetModel_`(C7, `src/features/AttendanceSheet.gs`). 좌석 정보에 `resolveDayPlan_`·`seatMapOn_`·`resolveStudentDay_`(`docs/contracts/rules-api.md`)를 조합한다.
> - **그리는 쪽:** DESIGN `printRenderSheet_(model, opts)`(D4, `src/print/AttendanceSheetHtml.gs`). 모든 공간을 A4 가로 한 장에(결정 34). 모델 모양은 그대로다.
> - **검사:** `tests/features/sheet_model_contract.test.js`(C7)가 이 모양을 검사하고, DESIGN 픽스처 `design/fixtures/sheet-model.{mon_thu,fri,sat,sun}.json`도 같은 검사를 통과해야 한다.
> - 근거: PRD 3.3~3.5절·F2, `docs/decisions.md` 20~23·32~34번, `docs/plan/stage1.md` 2절(S0)·4절.

## 모양

`docs/plan/stage1.md`의 요지를 그대로 옮긴 것이다.

```
{ date:'2027-03-03', weekdayKo:'수', dayType:'mon_thu', operating:true, title:'신한학사 출석부',
  dutyNames:[],                                   // F3 전에는 빈 배열
  blocks:[{seq:1,start:'18:00',end:'20:00',label:'18–20'}],
  legend:[{mark:'○',text:'출석'}, …],
  spaces:[{ id, name:'1층 자습실', gender:'혼성', rows:13, cols:12,
    cells:[{ row, col, kind:'seat'|'pillar'|'door'|'window', seatLabel,
             occupant:null|{grade:1, name, display:'1. 이름'}, vacant:boolean,
             marks:[{seq:1, code:'EXC'|'FIXED'|'END'|'NONE', text:'학'}] }] }],
  unseated:[{display:'2. 이름'}], warnings:[], generatedAt }
```

모델 전체는 JSON으로 그대로 바꿀 수 있어야 한다(`Date` 객체·함수 없음). `CacheService`에 캐시하고 `google.script.run`으로 화면에 넘기기 때문이다.

## 필드 설명

### 맨 위

| 필드 | 형식 | 뜻 |
| --- | --- | --- |
| `date` | `'yyyy-MM-dd'` | 출석부 날짜 |
| `weekdayKo` | `'월'`…`'일'` | 그 날짜의 요일(`ymdWeekdayKo_`). 머리말 "2027년 3월 3일(수)"에 쓴다 |
| `dayType` | `'mon_thu'`·`'fri'`·`'sat'`·`'sun'` 또는 특별 코드 | 그날 블록을 고른 요일 유형(`resolveDayPlan_`의 `dayType`). 날짜별 일정(`day_schedules.day_type`)으로 바꾼 날은 그 값 |
| `operating` | boolean | `false`면 운영 안 하는 날. CODING은 렌더러를 부르지 않고 "운영 안 하는 날" 안내를 보여 준다(C7). 이때 `blocks`·`spaces`는 빈 배열이다 |
| `title` | 문자열 | 머리말 제목. 설정 `print.title`(기본 `'신한학사 출석부'`) |
| `dutyNames` | 문자열 배열 | 그날 근무교사 이름. **F3(2단계) 전에는 늘 빈 배열**이고, 머리말은 "근무: ____"로 비워 둔다. 인쇄 화면에서 손으로 넣을 수 있다(4절 l, ASSUMPTION) |
| `blocks` | `[{seq, start, end, label}]` | 그날의 블록. `seq`는 1부터 순서대로, `start`·`end`는 `'HH:mm'`(`'24:00'` 허용), `label`은 머리말 표기(`'18–20'`, 줄표는 `–`). 블록 시간은 칸마다 쓰지 않고 머리말에 한 번만 쓴다(D4) |
| `legend` | `[{mark, text}]` | 범례. 기본은 PRD F2 그대로(아래 "기본값") |
| `spaces` | 아래 표 | 사용 중인 공간 전부(`spaces.status`가 '취소'가 아닌 것), `sort_order` 순. 인쇄는 모든 공간을 한 장에(결정 34) |
| `unseated` | `[{display}]` | 그날 학사생인데(`isActiveOn_`) 자리가 없는 학생(중도 입실 등, `seatMapOn_`의 `unseated`). `display`는 `'학년. 이름'`. 정렬은 학년 → 이름 |
| `warnings` | 문자열 배열 | 화면 미리보기에 띄울 문구(예: "이 기간 좌석 배치가 없습니다"). 인쇄물에 넣을지는 DESIGN이 정한다 |
| `generatedAt` | `'yyyy-MM-ddTHH:mm:ss'`(KST) | 모델을 만든 시각(`nowIso_`). 렌더러는 시계를 읽지 않고 이 값을 쓴다 |

### `spaces[]`

| 필드 | 형식 | 뜻 |
| --- | --- | --- |
| `id` | 문자열 | `spaces` 탭의 id |
| `name` | 문자열 | `'1층 자습실'`, `'SA1실'` … |
| `gender` | `'남'`·`'여'`·`'혼성'` | 공간 성별 |
| `rows`, `cols` | 정수 | 격자 크기. 칸 너비는 `cols`로 계산한다(D4) |
| `cells` | 아래 표 | 그 공간의 칸. 행 → 열 순서. **격자 안에 있지만 `cells`에 없는 칸은 빈칸(통로)**이다 |

### `cells[]`

| 필드 | 형식 | 뜻 |
| --- | --- | --- |
| `row`, `col` | 정수, 1부터 | 격자 위치 |
| `kind` | `'seat'`·`'pillar'`·`'door'`·`'window'` | `seats.kind`의 좌석·기둥·비상문·창문을 영어 코드로 바꾼 것 |
| `seatLabel` | 문자열 | 좌석 라벨(`seats.label`). 좌석이 아닌 칸은 `''` |
| `occupant` | `null` 또는 `{grade, name, display}` | 그날 그 자리 학생. `grade`는 숫자 1~3, `display`는 `'학년. 이름'`(예: `'1. 김가온'`). 공석이거나 좌석이 아닌 칸은 `null` |
| `vacant` | boolean | `kind === 'seat'`이고 `occupant === null`일 때만 `true`. 인쇄에는 "공석"으로 쓴다 |
| `marks` | 아래 표 | 블록 칸. `kind === 'seat'`이면 길이가 `blocks.length`이고 `seq` 순서다. 공석 자리는 모두 `NONE`. 좌석이 아닌 칸은 `[]` |

`occupant`에는 학년·이름만 넣는다. 학번·이메일·학생 id·성별·사유는 넣지 않는다(인쇄물이 밖에 놓여도 드러나는 정보를 줄인다).

### `marks[]`

| 필드 | 형식 | 뜻 |
| --- | --- | --- |
| `seq` | 정수 | `blocks[].seq` |
| `code` | `'EXC'`·`'FIXED'`·`'END'`·`'NONE'` | 칸을 채운 이유(`resolveCell_`의 `code`) |
| `text` | 문자열 | 칸에 그대로 찍을 글자. 렌더러는 이 글자를 바꾸지 않고 이스케이프만 한다 |

`code`별 `text`와 우선순위(PRD 3.4·F2, 위가 먼저):

| 순위 | `code` | 언제 | `text` |
| --- | --- | --- | --- |
| 1 | `EXC` | 그 블록과 겹치는 **확정** 사전 특이사항이 있다('요청'·'취소'는 표시하지 않는다) | 유형 약어. 둘 이상이면 가장 최근 확정 1건 + `' 외 N'`(예: `'병결 외 1'`) |
| 2 | `FIXED` | 그 요일·블록에 확정된 고정 일정이 있다 | `'학'` 또는 `'가'` |
| 3 | `END` | 23:00 종료 학생, 월~목(`dayType === 'mon_thu'`), 마지막 블록 | `'정상 종료'`(설정 `attendance.end_label`) |
| 4 | `NONE` | 해당 없음 | `''` — 근무교사가 ○·×·△·조를 손으로 쓰는 칸 |

## 기본값(`docs/decisions.md` 23번, 2026-11-06 승인)

- **공석:** 퇴실 적용일부터 그 자리는 공석이다(적용일 전날까지는 학생이 나온다). 배정되지 않은 자리도 공석이다. 둘 다 "공석"으로만 쓰고 이유는 모델에 넣지 않는다(설정 `print.vacant_label`, 기본 `'공석'`).
- **한 칸에 특이사항이 둘 이상:** 가장 최근에 확정된 1건의 약어를 쓰고 `' 외 N'`을 붙인다(N = 나머지 건수).
- **23:00 종료 표시는 월~목만**(설정 `attendance.end_type_day_types` = `mon_thu`). 금요일은 원래 전원 23:00 귀가라 표시하지 않는다.
- **칸에는 유형 약어만** 쓰고 사유 메모는 쓰지 않는다. 건강 정보가 출석부에 드러나지 않게 하려는 것이라, 사유 메모는 모델에 아예 넣지 않는다.
- **유형 약어**(설정 `exception.type_short`, 관리자가 바꿀 수 있음):

  | 특이사항 유형 | 약어 |
  | --- | --- |
  | 병결 | 병결 |
  | 병지각 | 병지 |
  | 병조퇴 | 병조 |
  | 가정사유 | 가정 |
  | 학원 | 학원 |
  | 학사 외 프로그램 | 외부 |
  | 학사 내 프로그램 | 내부 |
  | 미인정지각 | 무지 |
  | 미인정조퇴 | 무조 |
  | 미인정결석 | 무결 |
  | 기타 | 기타 |

- **범례(`legend`) 기본값**(PRD F2): `○` 출석, `×` 결석, `△` 지각, `조` 조퇴(아래 칸에 질병·가정사유), `학` 학원, `가` 가정.
- **금요일 자습 시작**은 18:30(23번 ⑦). 블록 자체는 PRD 3.3 기본값이다.

## 예시(일부)

2027-03-03(수), 1층 자습실의 앞 몇 칸. 이름은 가짜 학생 명단(`src/dev/FakeData.gs`)에서 가져온 것이다.

```json
{
  "date": "2027-03-03", "weekdayKo": "수", "dayType": "mon_thu", "operating": true,
  "title": "신한학사 출석부", "dutyNames": [],
  "blocks": [
    { "seq": 1, "start": "18:00", "end": "20:00", "label": "18–20" },
    { "seq": 2, "start": "20:00", "end": "22:00", "label": "20–22" },
    { "seq": 3, "start": "22:00", "end": "24:00", "label": "22–24" }
  ],
  "legend": [
    { "mark": "○", "text": "출석" }, { "mark": "×", "text": "결석" }, { "mark": "△", "text": "지각" },
    { "mark": "조", "text": "조퇴(아래 칸에 질병·가정사유)" }, { "mark": "학", "text": "학원" }, { "mark": "가", "text": "가정" }
  ],
  "spaces": [{
    "id": "space-1f", "name": "1층 자습실", "gender": "혼성", "rows": 13, "cols": 12,
    "cells": [
      { "row": 1, "col": 1, "kind": "door", "seatLabel": "", "occupant": null, "vacant": false, "marks": [] },
      { "row": 1, "col": 2, "kind": "seat", "seatLabel": "1",
        "occupant": { "grade": 1, "name": "김가온", "display": "1. 김가온" }, "vacant": false,
        "marks": [
          { "seq": 1, "code": "FIXED", "text": "학" },
          { "seq": 2, "code": "NONE", "text": "" },
          { "seq": 3, "code": "END", "text": "정상 종료" }
        ] },
      { "row": 1, "col": 3, "kind": "seat", "seatLabel": "2",
        "occupant": { "grade": 2, "name": "이나래", "display": "2. 이나래" }, "vacant": false,
        "marks": [
          { "seq": 1, "code": "EXC", "text": "병결 외 1" },
          { "seq": 2, "code": "EXC", "text": "병결" },
          { "seq": 3, "code": "EXC", "text": "병결" }
        ] },
      { "row": 1, "col": 4, "kind": "seat", "seatLabel": "3", "occupant": null, "vacant": true,
        "marks": [
          { "seq": 1, "code": "NONE", "text": "" },
          { "seq": 2, "code": "NONE", "text": "" },
          { "seq": 3, "code": "NONE", "text": "" }
        ] }
    ]
  }],
  "unseated": [{ "display": "3. 박다솜" }],
  "warnings": [],
  "generatedAt": "2027-03-03T17:40:00"
}
```

## 미리보기·테스트용 좌석 배치

실제 좌석표를 받기 전에는 `src/dev/FakeSeats.gs`의 `buildFakeSeatLayout_()`를 쓴다(실제 2025 자리배치도 구조: 1층 20×12 격자에 세로 줄 8개 146석 + 기둥·비상문·창문·통로, SA실은 방마다 5×2에 SA1 8·SA2 9(남), SA3 8·SA4 8·SA5 9·SA6 9(여) — docs/reference/real-layout-2025.md). 가짜 학생은 30명뿐이라 1층은 대부분 공석이다. 레이아웃을 확인하는 미리보기에서는 같은 30명 이름을 반복해서 채우고 새 가짜 인물은 만들지 않는다.
