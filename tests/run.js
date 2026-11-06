/**
 * 테스트 실행기(소유: 총괄). `npm test` = `node tests/run.js`
 *
 * - tests/ 아래의 *.test.js 를 모두 찾아 경로 이름 순서대로 실행한다.
 * - 기본은 시간대 두 곳(TZ=Asia/Seoul, TZ=UTC)에서 한 번씩 돈다. 자기 자신을 자식
 *   프로세스로 띄워 TZ만 바꾸므로 Windows 명령 프롬프트에서도 `npm test` 그대로 된다.
 * - `node tests/run.js --once`      : 지금 컴퓨터의 시간대로 한 번만
 * - `node tests/run.js rules sheet` : 경로에 'rules' 또는 'sheet'가 들어간 파일만
 * 하나라도 실패하면 종료 코드 1.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, state, listFiles } = require('./helpers/harness');

const TIMEZONES = ['Asia/Seoul', 'UTC'];
const EXPECTED_OFFSET = { 'Asia/Seoul': -540, UTC: 0 }; // getTimezoneOffset() 값(분)

const args = process.argv.slice(2);
const filters = args.filter(function (a) { return a.indexOf('--') !== 0; });
const once = args.indexOf('--once') >= 0;

if (!once) {
  const failedZones = [];
  for (const tz of TIMEZONES) {
    console.log('\n━━━━━━━━ TZ=' + tz + ' ━━━━━━━━');
    const r = spawnSync(process.execPath, [__filename, '--once'].concat(filters), {
      stdio: 'inherit',
      env: Object.assign({}, process.env, { TZ: tz })
    });
    if (r.error) console.log('자식 프로세스를 띄우지 못했습니다: ' + r.error.message);
    if (r.status !== 0) failedZones.push(tz);
  }
  console.log(failedZones.length
    ? '\n실패: TZ=' + failedZones.join(', TZ=')
    : '\n모든 시간대 통과(TZ=' + TIMEZONES.join(', TZ=') + ')');
  process.exit(failedZones.length ? 1 : 0);
}

runOnce();

function runOnce() {
  const tz = process.env.TZ || '';
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log('시간대: ' + (tz ? 'TZ=' + tz : '(TZ 없음)') + ', Node가 인식한 시간대: ' + resolved);
  if (tz && EXPECTED_OFFSET[tz] !== undefined &&
      new Date(Date.UTC(2027, 0, 1)).getTimezoneOffset() !== EXPECTED_OFFSET[tz]) {
    console.log('  ! 경고: TZ=' + tz + ' 가 적용되지 않았습니다. 시간대별 검사가 의미 없을 수 있습니다.');
  }

  const files = listFiles('tests', ['.test.js']).filter(function (f) {
    return !filters.length || filters.some(function (s) { return f.indexOf(s) >= 0; });
  });
  if (!files.length) {
    console.log('실행할 테스트 파일이 없습니다' + (filters.length ? '(거르기: ' + filters.join(', ') + ')' : ''));
    process.exit(1);
  }

  for (const f of files) {
    console.log('\n' + f);
    const before = state.passed + state.failed;
    try {
      require(path.join(ROOT, f));
    } catch (e) {
      state.failed++;
      state.failures.push({ name: f + ' 불러오기', message: e.message });
      console.log('  ✗ 파일을 불러오다 오류가 났습니다\n    ' + String(e.stack || e).split('\n').join('\n    '));
    }
    if (state.passed + state.failed === before) console.log('  (테스트 없음)');
  }

  console.log('\n' + state.passed + ' passed, ' + state.failed + ' failed' +
    ' (파일 ' + files.length + '개, ' + (tz ? 'TZ=' + tz : resolved) + ')');
  if (state.failures.length) {
    console.log('실패 목록:');
    for (const x of state.failures) console.log('  - ' + x.name);
  }
  process.exit(state.failed ? 1 : 0);
}
