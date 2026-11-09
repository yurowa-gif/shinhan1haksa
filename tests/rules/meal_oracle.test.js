/**
 * R6 MealRules 오라클 + 무작위 시험(시드 고정).
 *
 * 오라클 = PRD F6·F7, 결정 1·2·23·35를 그대로 옮긴 단순한 모델. 규칙 함수(행 = "적용일이 가장 늦은 행이 이긴다"를
 * 취소·대체로 맞춤)와 다른 방식으로 계산한다:
 *   어떤 날의 값 = 적용일이 그날 이전인 신청(의도) 중 **신청 일시가 가장 늦은** 신청의 값.
 *   - 신청의 적용일은 PRD 표(11:30 규칙·미실시 규칙). 같은 값을 다시 신청해도 의도로 센다.
 *   - 학사생 값(조식 '실시'·석식 '학사 석식')은 학사 퇴실 뒤에는 새로 신청할 수 없다(적용일이 퇴실일 이후면 무효). 단 석식은
 *     퇴실 기록보다 **먼저 신청한** 것(늦게 입력한 신청서)이면 이미 있던 것으로 보고 중단일 전까지 유효(입력 순서와 무관).
 *   - 조식: 퇴실일부터 학사생 값은 세지 않는다(PRD F6 즉시 중단). 남는 의도가 없으면 '미실시'.
 *   - 석식: 결정 35 중단일(퇴실 입력일이 월·화면 다음 주 월요일, 수~일이면 다다음 주 월요일, 퇴실일보다 이르면 퇴실일 — 이 파일에서
 *     따로 계산)부터는 중단일 이후에 시작하는 학사 석식 의도를 세지 않고(고친 적용일로 생길 수 있다), 남은 가장 늦은 의도가
 *     학사 석식이면 '미실시', 아니면 그 값. 중단일 전에는 정확히 가장 늦은 의도의 값.
 * 사건(무작위): F7 신청(늦게 입력한 이전 신청서, 교사가 고친 적용일 포함 — R10), 학사 퇴실(미리·당일·늦게 입력). 신청마다 같은 계획을 바로 다시 세우면
 * 할 일이 없어야 한다(수렴). 사건마다 3/1~4/30 모든 날을 비교한다.
 * 사건마다 날짜 7개 중 하나씩 돌아가며(9일 정도) 비교하고, 마지막 사건 뒤에는 모든 날을 비교한다(npm test 시간).
 * 기본 400가지, ORACLE_FULL=1이면 사건 수를 그대로 두고 매 사건 모든 날을 비교한다.
 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs']);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const START = Date.UTC(2027, 2, 1, 8, 0);
const iso = (min) => new Date(START + min * 60000).toISOString().slice(0, 19);
const DAYS = ctx.ymdRange_('2027-03-01', '2027-04-30');
const VALUES = { '조식': ['실시', '미실시'], '석식': ['학사 석식', '일반 석식', '미실시'] };
const isHall = (item, v) => (item === '조식' && v === '실시') || (item === '석식' && v === '학사 석식');
// 결정 35 석식 중단일: 규칙 함수와 따로, 날짜 계산도 Date로 직접
function stop35(t, L) {
  const d = new Date(t.slice(0, 10) + 'T00:00:00Z'), w = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((w + 6) % 7) + (w === 1 || w === 2 ? 7 : 14));
  const s = d.toISOString().slice(0, 10);
  return s < L ? L : s;
}

function simulate(seed, steps) {
  const R = rng(seed);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  let now = 0, seq = 0, rid = 0;
  const init = { '조식': pick(VALUES['조식']), '석식': pick(VALUES['석식']) };
  const rows = [
    { id: 'r' + (++rid), student_id: 's1', item: '학사', value: '입실', effective_date: '2027-03-01', status: '유효', source: '명단업로드', requested_at: '', created_at: '0000' },
    { id: 'r' + (++rid), student_id: 's1', item: '조식', value: init['조식'], effective_date: '2027-03-01', status: '유효', source: '명단업로드', requested_at: '', created_at: '0000' },
    { id: 'r' + (++rid), student_id: 's1', item: '석식', value: init['석식'], effective_date: '2027-03-01', status: '유효', source: '명단업로드', requested_at: '', created_at: '0000' }];
  const intents = [{ item: '조식', value: init['조식'], eff: '2027-03-01', req: '', seq: 0 }, { item: '석식', value: init['석식'], eff: '2027-03-01', req: '', seq: 0 }];
  let leave = null;
  const log = ['초기 조식 ' + init['조식'] + ' 석식 ' + init['석식']];
  const created = () => String(++seq).padStart(6, '0');
  const addRow = (o) => rows.push(Object.assign({ id: 'r' + (++rid), student_id: 's1', status: '유효', created_at: created() }, o));
  const cancel = (list) => list.forEach((c) => { rows.find((r) => r.id === c.id).status = '취소'; });

  function oracleTop(item, d, skip) {
    let top = null;
    for (const i of intents) {
      if (i.item !== item || i.eff > d || (skip && skip(i))) continue;
      if (!top || i.req > top.req || (i.req === top.req && i.seq > top.seq)) top = i;
    }
    return top;
  }

  function check(stepNo, all) {
    const where = 'seed ' + seed + ' step ' + stepNo + '\n' + log.slice(-10).join('\n');
    for (const d of DAYS.filter((x, i) => all || FULL || i % 7 === stepNo % 7)) {
      const b = ctx.statusOn_(rows, 's1', '조식', d);
      const tb = oracleTop('조식', d, leave && d >= leave.L ? (i) => isHall('조식', i.value) : null);
      assert.strictEqual(b, tb ? tb.value : '미실시', where + '\n조식 ' + d);
      // 중단일부터: 중단일 이후에 시작하는 학사 석식 의도는 세지 않고(F6 정리가 취소), 남은 가장 늦은 의도가 학사 석식이면 미실시
      const stop = leave ? stop35(leave.t, leave.L) : null;
      const top = oracleTop('석식', d, stop && d >= stop ? (i) => isHall('석식', i.value) && i.eff >= stop : null).value;
      const want = stop && d >= stop && isHall('석식', top) ? '미실시' : top;
      assert.strictEqual(ctx.statusOn_(rows, 's1', '석식', d), want, where + '\n석식 ' + d);
    }
  }

  for (let step = 0; step < steps; step++) {
    now += 60 + Math.floor(R() * 36 * 60);
    const today = iso(now).slice(0, 10);
    if (today > '2027-04-20') break;
    if (!leave && R() < 0.12) {
      let L = ctx.ymdAddDays_(today, Math.floor(R() * 14) - 3);
      if (L < '2027-03-02') L = '2027-03-02';                 // 기간 시작(입실 3/1) 뒤
      const t = iso(now);
      leave = { L, t };
      addRow({ item: '학사', value: '퇴실', effective_date: L, source: 'F6', requested_at: t });
      for (const item of ['조식', '석식']) {
        const stop = item === '조식' ? L : ctx.mealEffectiveDate_('stop', t, { leaveDate: L }).date;
        cancel(plain(ctx.mealPendingToCancel_(rows, 's1', item, stop, { source: 'F6' })));
        if (isHall(item, ctx.statusOn_(rows, 's1', item, stop))) addRow({ item, value: '미실시', effective_date: stop, source: 'F6', requested_at: t });
      }
      log.push(today + ' 퇴실 입력: 퇴실일 ' + L);
    } else {
      const item = pick(['조식', '석식']), to = pick(VALUES[item]);
      const late = R() < 0.25;
      const reqMin = late ? Math.max(0, now - Math.floor(R() * 4 * 24 * 60)) : now;
      const req = iso(reqMin);
      // R10: 넷에 하나는 교사가 적용일을 고친다(신청일 ~ +20일). 의도 적용일 = 고친 날짜
      const manual = R() < 0.25 ? ctx.ymdAddDays_(req.slice(0, 10), Math.floor(R() * 21)) : undefined;
      const popts = { today, effectiveDate: manual };
      const p = plain(ctx.mealPlanChange_(rows, 's1', item, to, req, popts));
      const kind = to === '미실시' ? 'stop' : to === '일반 석식' ? 'to_general' : 'start';
      const eff = manual || ctx.mealEffectiveDate_(kind, req).date;
      const voidHall = isHall(item, to) && leave && eff >= leave.L && (item === '조식' || req >= leave.t || eff >= stop35(leave.t, leave.L));
      log.push(today + ' 신청 ' + item + '→' + to + ' (신청 ' + req + (late ? ' 늦은 입력' : '') + (manual ? ' 수동 ' + manual : '') + ') → ' + JSON.stringify({ k: p.kind, d: p.date, b: !!p.blocked, s: p.superseded, c: p.toCancel.length, f: p.followUps.length }));
      assert.strictEqual(!!p.blocked, !!voidHall, 'seed ' + seed + ' blocked 판정\n' + log.slice(-6).join('\n'));
      if (!voidHall) intents.push({ item, value: to, eff, req, seq: ++seq });
      if (p.blocked) { check(step); continue; }
      cancel(p.toCancel);
      if (!p.superseded) {
        assert.strictEqual(p.date, eff, 'seed ' + seed + ' 적용일\n' + log.slice(-4).join('\n'));
        addRow({ item, value: to, effective_date: p.date, source: 'F7', requested_at: req });
      }
      for (const f of p.followUps) addRow({ item: f.item, value: f.value, effective_date: f.effective_date, source: 'F6', requested_at: req });
      // 수렴: 같은 신청으로 바로 다시 계획하면 할 일이 없다
      const again = plain(ctx.mealPlanChange_(rows, 's1', item, to, req, popts));
      assert.ok((again.kind === 'none' || again.superseded) && !again.toCancel.length && !again.followUps.length,
        'seed ' + seed + ' 수렴 안 함 ' + JSON.stringify(again) + '\n' + log.slice(-4).join('\n'));
    }
    check(step);
  }
  check('끝', true);
  return { rows: rows.length, leave: !!leave };
}

const FULL = !!process.env.ORACLE_FULL, SEEDS = 400;
test('오라클 무작위 시험 ' + SEEDS + '가지(사건 40개씩, 3/1~4/30 표본 날짜 + 끝에 매일 비교): 조식·석식 값, 결정 35 중단일, 퇴실 처리, 늦은 입력, 수렴', () => {
  let leaves = 0, rows = 0;
  for (let seed = 1; seed <= SEEDS; seed++) { const r = simulate(seed, 40); leaves += r.leave ? 1 : 0; rows += r.rows; }
  assert.ok(leaves > SEEDS / 4 && rows > SEEDS * 10, '시험 폭: 퇴실 ' + leaves + '건, 행 ' + rows + '개');
});
