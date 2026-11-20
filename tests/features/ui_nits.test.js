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
  assert.ok(/getFacilityReport[\s\S]*\.catch\(function \(err\)[\s\S]*관리자만 볼 수 있습니다/.test(line), '누적표 .catch와 안내 문구');
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
