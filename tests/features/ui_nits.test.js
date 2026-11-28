/** 5단계 확인표에서 찾은 표시 문제 둘: 결과 시트 '출석부 칸' 줄, 권한 없음 안내 문구. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

test('권한 없음 문구: 이메일 없음 = 로그인 안내, 등록 안 된 계정 = 등록 요청, 등록된 계정이 권한 밖 화면 = 역할 안내(서버 판정은 그대로)', () => {
  const env = createGasEnv({ now: '2027-03-10T20:00:00' });
  const t = (e, r) => env.asOwner((c) => c.noAccessText_(e, r));
  assert.ok(t('', false).includes('로그인'));
  assert.ok(t('x@y.z', false).includes('등록되어 있지 않습니다'));
  const reg = t('x@y.z', true);
  assert.ok(reg.includes('볼 수 있는 역할이 아닙니다') && !reg.includes('등록되어 있지 않습니다'), reg);
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'NoAccess.html'), 'utf8');
  assert.ok(html.includes('<?= message ?>') && !html.includes('등록되어 있지 않습니다'), '문구는 서버가 정한 message로만');
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Code.gs'), 'utf8');
  assert.ok(/screen\.' \+ String\(p\.page\)[\s\S]{0,160}noAccessText_\(user\.email, true\)/.test(code), '화면 거부만 registered=true');
  assert.ok(/등록되지 않은 계정[\s\S]{0,160}noAccessText_\(user\.email, false\)/.test(code), '미등록은 false');
});

test('결과 시트 출석부 칸 줄: NONE은 빼고, 전부 비면 "출석(특이사항 없음)"', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'screen_results.html'), 'utf8');
  const m = /function marksText\(marks\) \{[\s\S]*?\n    \}/.exec(html);
  assert.ok(m, 'marksText 함수');
  const fn = vm.runInNewContext('(' + m[0].replace('function marksText', 'function') + ')');
  assert.strictEqual(fn([{ code: 'NONE', text: '' }, { code: 'NONE', text: '' }]), '출석(특이사항 없음)');
  assert.strictEqual(fn([]), '출석(특이사항 없음)');
  assert.strictEqual(fn([{ code: 'NONE', text: '' }, { code: 'EXC', text: '학' }, { code: 'FIXED', text: '가' }]), '학 · 가');
  assert.ok(/marksText\(c\.marks\)/.test(html) && !html.includes('c.marks.map'), '쓰는 자리');
});

test('화면 파일: 줄 끝 // 주석 뒤에 .then·.catch 코드가 붙어 주석이 되어 버린 곳이 없다', () => {
  const dir = path.join(__dirname, '..', '..', 'src', 'ui');
  const bad = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.html')).forEach((f) => {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      let q = '';
      for (let k = 0; k < line.length - 1; k++) {
        const ch = line[k];
        if (q) { if (ch === '\\') k++; else if (ch === q) q = ''; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
        if (ch === '/' && line[k + 1] === '/' && line[k - 1] !== ':') {   // 문자열 밖의 // = 주석 시작
          if (/\)\s*\.(then|catch|finally)\s*\(/.test(line.slice(k))) bad.push(f + ':' + (i + 1));
          break;
        }
      }
    });
  });
  assert.deepStrictEqual(bad, [], '주석 뒤에 코드가 붙은 줄: ' + bad.join(', '));
});

test('시설 일지 누적표: 관리자가 아닌 교사가 열면 서버 거부 뒤 화면이 멈추지 않고 안내를 낸다(.catch가 살아 있다)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'screen_facility_day.html'), 'utf8');
  const line = html.split('\n').filter((l) => l.includes("call('getFacilityReport'") || /^\s*\.catch\(function \(err\) \{ clear\(body\); drawHead\(\)/.test(l)).join('\n');
  assert.ok(/getFacilityReport[\s\S]*\.catch\(function \(err\)[\s\S]*관리자 선생님만 볼 수 있습니다/.test(line), '누적표 .catch와 안내 문구');
});

test('시설 일지 시작·끝 시각 두 칸: flex가 아니라 grid minmax(0,1fr)이고 칸 안 input은 width 100%·min-width 0(고유 너비 때문에 카드 밖으로 나가지 않게)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'screen_facility.html'), 'utf8');
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const rule = (sel) => { const m = new RegExp(sel.replace(/[.\s]/g, (c) => '\\' + c) + '\\s*\\{([^}]*)\\}').exec(css); return m ? m[1] : ''; };
  assert.ok(/display:\s*grid/.test(rule('.fc-times')) && /minmax\(0,\s*1fr\)/.test(rule('.fc-times')), '.fc-times grid minmax(0, 1fr)');
  assert.ok(/min-width:\s*0/.test(rule('.fc-times .field')), '.fc-times .field min-width 0');
  assert.ok(/width:\s*100%/.test(rule('.fc-times .field input')) && /min-width:\s*0/.test(rule('.fc-times .field input')), 'input width 100%·min-width 0');
});

test('C41 학생·학부모 화면 문구: 저장 값 → 학부모 표기는 ptlFoodLabel 한 곳, 퇴실 대상·자녀·시설 일지 취소 문구', () => {
  const ui = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', f), 'utf8');
  const portal = ui('Portal.html');
  const m = /function ptlFoodLabel\(item, value\) \{[\s\S]*?\n  \}/.exec(portal);
  assert.ok(m, 'ptlFoodLabel 함수');
  const f = vm.runInNewContext('(' + m[0].replace('function ptlFoodLabel', 'function') + ')');
  const cases = [['기숙사', '입실', '입실'], ['기숙사', '퇴실', '퇴실'], ['기숙사', '', '신청 안 함'], ['조식', '실시', '먹음'], ['조식', '미실시', '먹지 않음'], ['조식', '', '신청 안 함'],
    ['석식', '학사 석식', '학사 석식'], ['석식', '일반 석식', '일반 석식'], ['석식', '미실시', '먹지 않음'], ['석식', '', '신청 안 함'], ['중식', '실시', '먹음'], ['중식', '미실시', '먹지 않음']];
  cases.forEach(([i, v, w]) => assert.strictEqual(f(i, v), w, i + ' ' + v));
  assert.ok(!/st\['(기숙사|조식|석식|중식)'\]\)\)?[,\]]/.test(portal.replace(/ptlFoodLabel\('[^']+', st\['[^']+'\]\)/g, '')), '저장 값을 그대로 보이는 곳 없음');
  assert.ok(portal.includes("c.dateKo + '부터 ' + c.item + ': ' + ptlFoodLabel(c.item, c.value)"), '바뀌는 것 한 줄 형식');
  assert.ok(portal.includes('퇴실 대상이 되었습니다') && portal.includes('관리자 선생님이 퇴실을 정합니다') && !portal.includes('학교를 나가야'), '퇴실 대상 안내');
  assert.ok(portal.includes("'자녀가 ' + td.monthKo") && !portal.includes("s.name + ' 학생이 '"), '동의 카드는 자녀');
  const tt = ui('screen_timetable.html');
  assert.ok(tt.includes('시간표가 자녀에게 돌아갔습니다. 자녀가 고쳐서 다시 내면 다시 동의해 주세요.') && tt.includes('자녀에게 돌려보내기'), '학부모 반려 문구');
  assert.ok(!/kid\.name \+ ' 학생/.test(tt), '학부모 화면 제목에 "학생" 없음');
  const fc = ui('screen_facility.html');
  assert.ok(fc.includes("title: '일지 취소 처리'") && fc.includes("confirmText: '취소 처리', cancelText: '돌아가기'") && fc.includes('기록은 지워지지 않고 \\"취소\\"로 남습니다. 다시 쓰려면 새로 써 주세요.'.replace(/\\"/g, '"')), '시설 일지 취소 시트');
});

test('C47 결과 정리 화면: 휴대폰 [학생별] 보기(학생 1줄·예외 학생 위로·예외 날짜 + 이유 한 줄)와 PC [정상 칸 비우기] 기본 켬', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'screen_results.html'), 'utf8');
  assert.ok(/mode: 'date', stu: null, hideNormal: true/.test(html), '기본: 날짜별, 정상 칸 비우기 켬');
  assert.ok(/function isPhone\(\) \{ return window\.innerWidth < 840; \}/.test(html), '휴대폰 기준 840px');
  assert.ok(/label: '묶음'[\s\S]{0,200}'학생별'/.test(html) && /정상 칸 비우기/.test(html), '묶음·정상 칸 비우기 컨트롤');
  assert.ok(/getResultTotals', arg/.test(html) && !/\bgetResultOuts?\b/.test(html), '누적은 기존 서버 함수(getResultTotals)');
  // 이유 한 줄 도우미를 꺼내 확인한다
  const grab = (name) => new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}').exec(html)[0];
  const pre = /var PRE_WHY = [^\n]*\n/.exec(html)[0];
  const ctx = {};
  vm.runInNewContext('var state = { data: { endLabel: "정상 종료" } };' + pre + grab('preWhy') + grab('preShown') + grab('cellReason') + '\nvar KIND_SHORT = { "×": "결석", "△": "지각", "조": "조퇴" };' + grab('kindsOf') + ';this.preShown = preShown; this.preWhy = preWhy; this.cellReason = cellReason; this.kindsOf = kindsOf;', ctx);
  assert.strictEqual(ctx.preWhy('학'), '학원 일정');
  assert.strictEqual(ctx.preWhy('가'), '가정 일정');
  assert.strictEqual(ctx.preWhy('병결'), '병으로 인한 기록');
  assert.strictEqual(ctx.preWhy('가정'), '가정 사유');
  assert.strictEqual(ctx.preWhy('외부'), '학사 밖 프로그램');
  assert.strictEqual(ctx.preWhy('무지'), '미인정 기록');
  assert.strictEqual(ctx.preWhy('모름'), '모름', '모르는 글자는 그대로');
  assert.strictEqual(ctx.preWhy('학·병결'), '학원 일정, 병으로 인한 기록');
  assert.strictEqual(ctx.cellReason(['', '×', 1]), '미인정이라 자동 1OUT입니다.');
  assert.strictEqual(ctx.cellReason(['학', '', 0]), '학원 일정.');
  assert.strictEqual(ctx.kindsOf('×△'), '결석·지각');
  assert.strictEqual(ctx.preShown(['정상 종료', '', 0]), '', '정상 종료 글자는 예외가 아니다');
  assert.strictEqual(ctx.preShown(['학·정상 종료', '', 0]), '학');
});

test('C49-A 상담 신청 화면: 입력 오류는 틀린 칸에(날짜 칸마다·주제·메모), 확인 시트 전에 화면에서 먼저 거름, 교사 화면은 공통 .ld 부품, 학생 홈에 신청 상태 한 줄', () => {
  const ui = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', f), 'utf8');
  const s = ui('screen_counselreq.html');
  assert.ok(/function check\(\)/.test(s) && /errs\.push\(\{ field: 'date' \+ i/.test(s) && /field: 'topic'/.test(s) && /field: 'memo'/.test(s), '화면 쪽 먼저 거르기(날짜·주제·메모)');
  assert.ok(/state\.errors = check\(\);\s*if \(state\.errors\.length\)/.test(s), '확인 시트 전에 걸러 낸다');
  assert.ok(/f\.setError\(errOf\('date' \+ i\)\)/.test(s) && /class: 'error', text: errOf\('topic'\)/.test(s) && /memoF\.setError/.test(s), '틀린 칸에 안내');
  assert.ok(/class: 'error', role: 'alert'/.test(s), '맨 위 상자는 오류색');
  assert.ok(/kind: d\.canRequest \? 'primary' : 'secondary'/.test(s), '[+ 새 상담 신청]은 켜져 있으면 주 단추');
  assert.ok(s.indexOf("var fixed = open.filter") < s.indexOf("if (d.whyNot && !fixed)"), '날짜가 정해진 칸이 안내보다 위(안내는 확정이 없을 때만)');
  assert.ok(/내 상담 신청/.test(s) && /setTitle\(state\.view === 'form' \? '상담 신청' : '내 상담 신청'\)/.test(s), '머리줄 제목');
  const r = ui('screen_requests.html');
  assert.ok(/class: 'ld'/.test(r) && /ld-pick/.test(r) && !/rq-wrap|rq-row/.test(r), '공통 .ld 부품');
  assert.ok(!/el\('h2', \{ text: '상담 신청 처리' \}\)/.test(r), '머리줄 아래 제목 되풀이 없음');
  assert.ok(/who\(r\) \+ ' · ' \+ r\.topic \+ ' 상담 신청입니다\. ' \+ message/.test(r), '반려·상담 못 함 시트 첫머리에 누구 건인지');
  const h = ui('home_student.html');
  assert.ok(/getCounselRequestsOfStudent', ''\)/.test(h) && /신청 중/.test(h) && /에 상담합니다/.test(h) && /반려되었습니다/.test(h), '학생 홈 신청 상태 한 줄');
});

test('C49-B 화면: 상담일지 쓰기에 합의 사항·참고 프로필 버전·신청 연결, 학생 내 상담 기록(보이기 켜기·끄기 확인 시트), 학부모 포털에 공개된 합의 사항, 학생 홈 링크', () => {
  const ui = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', f), 'utf8');
  const c = ui('screen_counsel.html');
  assert.ok(/합의 사항·다음 할 일 \(선택\)/.test(c) && /학생에게 보입니다\. 학생이 "부모님께 보이기"를 켜면 학부모도 봅니다/.test(c), '합의 사항 칸과 도움말');
  assert.ok(/교사만 봅니다\. 학생·학부모에게 보이지 않습니다/.test(c), '내용 칸 도움말');
  assert.ok(/type !== '진로' && type !== '진학'/.test(c) && /참하지 않음|참고하지 않음/.test(c) && /아직 진로 프로필을 내지 않았습니다/.test(c), '참고한 진로 프로필(진로·진학일 때만)');
  assert.ok(/data\.types\.indexOf\(fr\.topic\) >= 0/.test(c), '신청 주제와 같은 이름의 유형을 미리 고른다');
  assert.ok(/requestId: linkChk && linkChk\.checked \? fr\.id : ''/.test(c) && /fromRequest = \(window\.SCREEN_PARAMS \|\| \{\}\)\.request/.test(c), '신청 연결');
  const m = ui('screen_mynotes.html');
  assert.ok(/UI\.shareCheck\(\{/.test(m) && /confirmOff: true/.test(m) && !/UI\.confirmSheet/.test(m), '공통 UI.shareCheck(끄기 확인 시트 결정 92는 부품이 띄운다)');
  assert.ok(/'부모님께 보입니다\.'/.test(m) && /'부모님께 보이지 않습니다\.'/.test(m) && /이 합의 사항을 부모님께 보이기/.test(m), '켜기·끄기 알림과 체크 문구');
  assert.ok(/적힌 합의 사항이 없습니다/.test(m) && /아직 상담 기록이 없습니다/.test(m) && /학사를 나간 뒤에는 고칠 수 없습니다/.test(m), '빈 상태·학사를 나간 뒤');
  assert.ok(!/content|\.type\b/.test(m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\*.*$/gm, '')), '학생 화면에 상담 내용·유형을 쓰지 않는다');
  const p = ui('Portal.html');
  assert.ok(/if \(c\.agreement\)/.test(p) && /합의 사항·다음 할 일/.test(p), '학부모 포털의 공개된 합의 사항');
  const h = ui('home_student.html');
  assert.ok(/내 상담 기록 보기/.test(h) && /formLink\.parentNode\.removeChild\(formLink\)/.test(h), '학생 홈: 내 상담 기록 링크, 열린 신청이 있으면 [상담 신청하기] 링크를 뺀다');
});

test('C49-B 검토 반영: 두 글 칸 꼬리표(교사만 봄·학생에게 보임)와 저장 전 확인 시트, 학부모 빈 상태, 완료 줄 [상담 기록 보기], 경고는 토스트가 아니라 목록 위 한 줄, 빈 내 상담 기록은 안내 없음', () => {
  const ui = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', f), 'utf8');
  const c = ui('screen_counsel.html');
  assert.ok(/상담 내용 \(교사만\)/.test(c) && /UI\.statusPill\('mute', '교사만 봄'\)/.test(c), '내용 칸: 교사만 봄');
  assert.ok(/합의 사항·다음 할 일 \(학생에게 보임\)/.test(c) && /UI\.statusPill\('requested', '학생에게 보임'\)/.test(c), '합의 사항 칸: 학생에게 보임(주의색)');
  assert.ok(/'합의 사항 ' \+ agrLen\(\) \+ '자가 학생에게 보입니다\.'/.test(c) && /저장한 뒤에는 고칠 수 없고, 고치려면 취소하고 다시 써야 합니다/.test(c) && /if \(!agrLen\(\)\) \{ save\(\); return; \}/.test(c), '합의 사항이 있을 때만 저장 전 확인 시트');
  assert.ok(!/UI\.toast\(r\.warnings/.test(c) && /if \(flash\)/.test(c), '경고는 토스트가 아니라 목록 위 한 줄');
  const p = ui('Portal.html');
  assert.ok(/보여 드릴 상담 기록이 없습니다/.test(p) && /if \(cn\.length\) cnKids\.push\(note\(/.test(p), '학부모 빈 상태: 단정하지 않고 아래 안내 줄 없음');
  const m = ui('screen_mynotes.html');
  assert.ok(/if \(d\.notes\.length\) body\.appendChild\(el\('div', \{ class: 'notice info'/.test(m), '빈 상담 기록에는 맨 위 안내가 없다');
  const r = ui('screen_counselreq.html');
  assert.ok(/page=mynotes', text: '상담 기록 보기'/.test(r), '완료 줄 [상담 기록 보기]');
});

test('C49-B(R24b 뒤): 저장 전 확인 시트가 합의 사항 글을 그대로(앞 세 줄 + …) 보여 주고, 신청한 날이 요청 처리·내 신청에 그려지고, 학생 체크 칸은 응답의 공개 상태로 그린다', () => {
  const ui = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', f), 'utf8');
  const c = ui('screen_counsel.html');
  assert.ok(/lines\.slice\(0, 3\)/.test(c) && /shown\.push\('…'\)/.test(c) && /lines: shown/.test(c), '확인 시트에 합의 사항 글(길면 앞 세 줄 + …)');
  assert.ok(/field\('신청한 날'/.test(ui('screen_requests.html')), '요청 처리 화면 신청한 날');
  assert.ok(/에 신청'/.test(ui('screen_counselreq.html')), '내 상담 신청 지난 신청 줄');
  const m = ui('screen_mynotes.html');
  assert.ok(/n\.agreement_to_parent === undefined/.test(m) && /\(true\|y\|yes\|1\|예\)/.test(m), '체크 칸은 응답의 공개 상태(TRUE·FALSE)로');
});

test('상담일지 참고 프로필 요약: 고른 버전의 진로 희망·목표 진학 두 줄 + [진로 프로필 열기], 기존 getCareerStudent를 쓴다(새 서버 함수 없음), 버전을 바꾸면 다시 그린다', () => {
  const c = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'screen_counsel.html'), 'utf8');
  assert.ok(/call\('getCareerStudent', data\.student\.id, Number\(v\)\)/.test(c), '기존 서버 함수');
  assert.ok(/profLine\('진로 희망'/.test(c) && /profLine\('목표 진학'/.test(c) && /text: '진로 프로필 열기'/.test(c) && /page=career&student=/.test(c), '두 줄 + 링크');
  assert.ok(/sel\.addEventListener\('change', function \(\) \{ profVer = sel\.value; loadSum\(sum\); \}\)/.test(c) && /if \(v !== profVer\) return;/.test(c), '버전을 바꾸면 다시 그리고, 늦게 온 응답은 버린다');
});
