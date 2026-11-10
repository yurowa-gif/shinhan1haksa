/**
 * T2 끝까지 ③(stage2.md 7절): 2OUT은 면담 기록 전 퇴실 확정이 막히고, 기록 후 F6 학사 퇴실 신청이 미리 채워진다.
 * 지금은 시나리오와 단언 목록만 둔다. C12(OUT 입력·알림 #94)·C13(면담·관문 #90)·C20(2OUT 퇴실 확정)이 병합되고,
 * T1b(#97, 2027-03 직접 OUT 2건 학생)가 병합된 뒤 test()로 채운다. 가짜 데이터만.
 *
 * 준비: setup → seedFakeData → seedFakeStage1 → seedFakeStage2(생활 기록 포함). 지금 2027-03-12(금).
 *   S2 = buildFakeStage2Life_ 의 out2Id(직접 OUT 2건: 3/4 휴대폰, 3/11 지시 불이행 → 퇴실 대상), S1 = out1Id(1건).
 *   담당교사 = S2 등록의 teacher_email, 관리자 = owner, 근무교사 = 3/12 실제 근무자(필요하면 근무 칸을 편성해 둔다).
 *
 * 흐름과 단언(이름은 병합된 함수 이름으로 고친다):
 *  1. 관리자 confirmOutDismissal(S2) → {ok:false, reason:'면담 기록 필요'}. S1 → '퇴실 대상 아님'.
 *  2. 그 상태로 관리자 saveMove(outDismissal: S2) → 거부(면담 없음), status_changes 행 수 그대로.
 *  3. 담당교사 saveOutMeeting(S2, 날짜 3/12, 대상 학부모, 연결 OUT = 둘째 OUT) → ok.
 *     - 둘째 OUT(3/11)보다 앞선 날짜(3/10) 면담은 인정하지 않는다(결정 51) — 한 번 넣어 보고 여전히 '면담 기록 필요'.
 *  4. 관리자 confirmOutDismissal(S2) → {ok:true, prefill}: 학생 = S2, 유형은 미리 고르지 않음(결정 50, 빈 값),
 *     사유 '2OUT 퇴실', 적용일 기본값 = 확정 다음 날(3/13), 신청 일시 = 지금, 서류 미제출, 면담 날짜·내용 없음.
 *  5. 담당교사 saveMove(outDismissal) → 거부 + audit denied:out.dismiss.
 *  6. 유형을 고르지 않은 관리자 saveMove → 저장 안 됨(필수 선택). 유형 '학사 퇴실'(비기숙) 또는 '학사 및 기숙사 퇴실'(기숙)로 저장 →
 *     학사 퇴실 대표 행(reason '2OUT 퇴실', memo '[2OUT] out:<id> note:<id>', 서류 FALSE) + 조식·석식 정리 연결 행(movePlan_과 같은 날짜).
 *     다시 confirmOutDismissal → '이미 퇴실'.
 *  7. 새는 곳 없음:
 *     - 운영 DB audit_log 전체에 면담 내용 글자가 없다(상담 파일은 별도, 결정 42).
 *     - 위 응답 JSON 어디에도 면담 내용이 없다.
 *     - 근무교사 계정의 listStudentStatus 응답에 면담 표식·면담 날짜가 없다.
 *  8. 그날(3/12) getAttendanceSheet 모델에 OUT 표시가 없다(결정 36).
 *  9. 면담과 연결한 OUT을 관리자가 취소하면 → 다른 2건이 남아도 '면담 기록 필요'(결정 51). (6 전에 별도 env로)
 */

/** 시험 도구에 skip이 없어 이름만 남긴다(세지 않음). 병합되면 test()로 바꾼다 */
const pending = (name) => console.log('  - (보류) ' + name);

pending('끝까지 ③: 2OUT 면담 전 퇴실 확정 막힘 → 면담 기록 → prefill → 관리자만 저장 → 퇴실·급식 정리, 면담 내용 새지 않음(C12·C13·C20·T1b 병합 뒤)');
