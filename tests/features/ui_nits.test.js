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
