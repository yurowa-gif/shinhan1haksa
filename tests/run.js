/**
 * 테스트 실행기(소유: 총괄). `npm test` = `node tests/run.js`
 *
 * - tests/ 아래의 *.test.js 를 모두 찾아 경로 이름 순서대로 실행한다.
 * - 기본은 시간대 두 곳(TZ=Asia/Seoul, TZ=UTC)에서 한 번씩 돈다. 자기 자신을 자식
 *   프로세스로 띄워 TZ만 바꾸므로 Windows 명령 프롬프트에서도 `npm test` 그대로 된다.
 * - `node tests/run.js --once`      : 지금 컴퓨터의 시간대로 한 번만
 * - `node tests/run.js rules sheet` : 경로에 'rules' 또는 'sheet'가 들어간 파일만
 * - 시험 파일마다 자식 프로세스 하나(`--file=<경로>`)로 돈다. 한 프로세스에 113개 파일을 모두 올리면
 *   다 쓴 가짜 환경(vm 컨텍스트·시트 배열)이 늦게 치워져 힙이 2GB 한도 근처까지 쌓였다가 가끔
 *   'heap out of memory'로 죽었다. 파일이 끝나면 프로세스와 함께 메모리가 모두 풀린다.
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
const fileArg = (args.filter(function (a) { return a.indexOf('--file=') === 0; })[0] || '').slice(7);
const RESULT = '@@RESULT ';

if (fileArg) runFile(fileArg);

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

else runOnce();

/** 자식: 파일 하나만 불러 돌리고 마지막 줄에 결과(JSON)를 남긴다 */
function runFile(f) {
  try {
    require(path.join(ROOT, f));
  } catch (e) {
    state.failed++;
    state.failures.push({ name: f + ' 불러오기', message: e.message });
    console.log('  ✗ 파일을 불러오다 오류가 났습니다\n    ' + String(e.stack || e).split('\n').join('\n    '));
  }
  console.log(RESULT + JSON.stringify({ passed: state.passed, failed: state.failed, failures: state.failures, rssMB: Math.round(process.resourceUsage().maxRSS / 1024) }));
  process.exit(0);
}

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

  let peak = null;   // 파일별 최대 메모리(RSS) 중 가장 큰 것
  for (const f of files) {
    console.log('\n' + f);
    const r = spawnSync(process.execPath, [__filename, '--file=' + f], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
    const lines = String(r.stdout || '').split('\n');
    const last = lines.filter(function (l) { return l.indexOf(RESULT) === 0; })[0];
    process.stdout.write(lines.filter(function (l) { return l.indexOf(RESULT) !== 0; }).join('\n').replace(/\n+$/, '') + (lines.length > 1 ? '\n' : ''));
    if (r.stderr) process.stderr.write(r.stderr);
    if (!last) {   // 자식이 결과를 남기지 못하고 죽음(메모리 부족 등)
      state.failed++;
      state.failures.push({ name: f + ' 실행', message: '자식 프로세스 종료 코드 ' + r.status + (r.signal ? ', 신호 ' + r.signal : '') });
      console.log('  ✗ 파일 실행이 끝까지 가지 못했습니다(종료 코드 ' + r.status + (r.signal ? ', 신호 ' + r.signal : '') + ')');
      continue;
    }
    const res = JSON.parse(last.slice(RESULT.length));
    if (!peak || res.rssMB > peak.mb) peak = { mb: res.rssMB, file: f };
    state.passed += res.passed; state.failed += res.failed;
    state.failures.push.apply(state.failures, res.failures);
    if (res.passed + res.failed === 0) console.log('  (테스트 없음)');
  }

  console.log('\n' + state.passed + ' passed, ' + state.failed + ' failed' +
    ' (파일 ' + files.length + '개, ' + (tz ? 'TZ=' + tz : resolved) + ')');
  if (peak) console.log('파일별 최대 메모리 중 가장 큰 것: ' + peak.mb + 'MB(' + peak.file + ')');
  if (state.failures.length) {
    console.log('실패 목록:');
    for (const x of state.failures) console.log('  - ' + x.name);
  }
  process.exit(state.failed ? 1 : 0);
}
