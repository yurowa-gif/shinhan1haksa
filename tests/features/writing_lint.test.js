/** 문구 일괄 적용 1차(C40): writing-audit.md 1절의 공통 문구가 한 곳에서 나오고, 고친 옛 문구가 다시 들어오지 않게 지킨다. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ROOT = path.join(__dirname, '..', '..');
const files = (dir, ext) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(ext)).map((e) => path.join(dir, e.name));
const SRC = files('src', '.gs').concat(files('src/features', '.gs'), files('src/dev', '.gs'), files('src/ui', '.html'));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('공통 문구: 권한 거부는 누구에게 요청하는지 알려 주고, 다른 사람이 먼저 고침은 한 문장이다(Auth.gs 한 곳)', () => {
  const env = createGasEnv({ now: '2027-03-10T10:00:00' });
  const d = plain(env.asOwner((c) => [c.DENIED_MESSAGE, c.STALE_MESSAGE]));
  assert.strictEqual(d[0], '이 기능을 쓸 권한이 없습니다. 필요하면 관리자 선생님께 요청해 주세요.');
  assert.strictEqual(d[1], '그사이 다른 선생님이 이 기록을 고쳤습니다. 새로 불러온 뒤 다시 저장해 주세요.');
  // 저장 쪽 stale 응답이 같은 문구를 쓴다(기능마다 따로 쓰지 않는다)
  for (const f of ['src/features/Meals.gs', 'src/features/Moves.gs', 'src/features/BatchLeave.gs', 'src/features/Results.gs', 'src/features/Docs.gs']) {
    assert.ok(/stale: true, error: STALE_MESSAGE/.test(read(f)), f + '는 STALE_MESSAGE');
  }
});

test('옛 문구 금지: 고친 문구·내부 말이 src에 다시 들어오지 않는다', () => {
  const banned = [
    ["throw new Error('권한이 없습니다.')", '권한 거부는 DENIED_MESSAGE'],
    ['확인한 뒤 다른 변경이 있었습니다', '다른 사람이 먼저 고침은 STALE_MESSAGE'],
    ['새로 고친 뒤', '"새로 불러온 뒤"'],
    ['관문을 통과했습니다', '퇴실 신청서를 저장해 주세요'],
    ["label: '2OUT'", 'OUT 화면 탭 이름은 "퇴실 대상"'],
    ["cancelText: '취소'", '시트 닫기는 기본값(돌아가기), 기록 취소는 "취소 처리"'],
    ["cancelText:'취소'", '시트 닫기는 기본값(돌아가기), 기록 취소는 "취소 처리"'],
    ["text: '미리보기'", '버튼은 "미리 보기"(띄어 씀)'],
    ["text: '확인', onclick: onCheck", '명단 버튼은 "미리 보기"']
  ];
  const hits = [];
  SRC.forEach((f) => { const t = read(f); banned.forEach(([s, why]) => { if (t.includes(s)) hits.push(f + ' → ' + s + '  (' + why + ')'); }); });
  assert.deepStrictEqual(hits, [], '옛 문구');
});

test('화면 이름·가짜 계정: 근무표 담당자 역할 표시는 "근무표 담당"(저장 값 duty_manager는 그대로), 가짜 시험 계정 이름에 직함이 없다', () => {
  const env = createGasEnv({ now: '2027-03-10T10:00:00' });
  assert.strictEqual(plain(env.asOwner((c) => c.ROLE_LABELS.duty_manager)), '근무표 담당');
  assert.ok(plain(env.asOwner((c) => c.ROLES)).includes('duty_manager'), '저장 값은 그대로');
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: 'a.teacher@example.com', TEST_HOMEROOM_EMAIL: 'a.homeroom@example.com', TEST_STUDENT_EMAIL: 'a.student@example.com', TEST_PARENT_EMAIL: 'a.parent@example.com' });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  const names = env.rows('users').filter((u) => u.memo === '시험 계정').map((u) => u.name);
  assert.strictEqual(names.length, 4);
  names.forEach((n) => assert.ok(!/시험|학부모|학사|교사|담임|선생|학생/.test(n), '직함이 들어 있는 이름: ' + n));
});

test('기계 조사 "은(는)·을(를)·이(가)·(으)로"가 화면·서버 문구에 없다(rules는 RULES 세션 몫)', () => {
  const list = SRC.concat(files('src/print', '.gs')).filter((f) => /^src\/(ui|features|print)\//.test(f));
  const hits = [];
  list.forEach((f) => read(f).split('\n').forEach((l, i) => { if (!/^\s*(\/\/|\*|\/\*)/.test(l) && /은\(는\)|을\(를\)|이\(가\)|\(으\)로|와\(과\)/.test(l)) hits.push(f + ':' + (i + 1)); }));
  assert.deepStrictEqual(hits, []);
});
