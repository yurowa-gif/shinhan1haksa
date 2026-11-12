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
 * 사건(무작위): F7 신청(늦게 입력한 이전 신청서, 교사가 고친 적용일 포함 — R10), 학사 퇴실(미리·당일·늦게 입력, movePlan_),
 * 퇴실 취소(moveUndoPlan_ — 퇴실이 없었던 것처럼, 퇴실과 함께 고른 일반 석식도, 재입실 뒤에도 — 결정 59 재입실도 함께 취소)·재입실(movePlan_ 학사 입실 — 재입실일부터 퇴실 전날 값을
 * 새 의도로, 단 퇴실 기록 전 학생 신청 중 살아 있는 것은 남는다, R11b). 퇴실 때 넷에 하나는 석식 '일반 석식으로'(R11a).
 * 퇴실 기록 일시도 넷에 하나는 입력보다 이르다. 퇴실 기록보다 뒤에 신청한 퇴실일 이후 학사 석식은 처음부터 없던 것으로 본다(먼저 입력돼 있어도).
 * 신청이 superseded(더 새 의도가 그 전에 적용)인지도 오라클이 따로 판정한다(퇴실 정리가 끊은 의도는 빼고). superseded 신청서도 '취소' 행으로
 * 저장하고 의도로 남긴다(결정 58 — 가린 의도가 끊기면 다시 보인다). 신청마다 같은 계획을 바로 다시 세우면
 * 할 일이 없어야 한다(수렴). 사건마다 3/1~4/30 모든 날을 비교한다.
 * 사건마다 날짜 7개 중 하나씩 돌아가며(9일 정도) 비교하고, 마지막 사건 뒤에는 모든 날을 비교한다(npm test 시간).
 * 기본 400가지(ORACLE_SEEDS로 늘림), ORACLE_FULL=1이면 사건 수를 그대로 두고 매 사건 모든 날을 비교한다.
 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/StatusRules.gs', 'src/rules/MealRules.gs', 'src/rules/MoveRules.gs']);

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
  const cancel = (list, why) => list.forEach((c) => { Object.assign(rows.find((r) => r.id === c.id), { status: '취소', cancel_reason: why || '' }); });
  // F6 입퇴실 저장: movePlan_ 계획 그대로(대표 행 + 연결 행, 취소 사유 '[자동] <대표>')
  function saveMove(move, today) {
    const mp = plain(ctx.movePlan_(rows, 's1', move, { today }));
    assert.deepStrictEqual(mp.errors, [], 'seed ' + seed + ' 입퇴실 계획 오류 ' + JSON.stringify(move));
    const head = 'r' + (rid + 1);
    mp.toCancel.forEach((c) => cancel([c], /^\[자동\] /.test(c.cancel_reason) ? c.cancel_reason : '[자동] ' + head + ' 입퇴실 정리'));   // 규칙이 준 꼬리표는 그대로
    mp.toRestore.forEach((c) => Object.assign(rows.find((r) => r.id === c.id), { status: '유효', cancel_reason: '' }));
    mp.rows.forEach((r, i) => addRow({ item: r.item, value: r.value, effective_date: r.effective_date, source: r.source, requested_at: move.requestedAt, linked_change_id: i ? head : '' }));
    return head;
  }

  // 그날 값의 의도: 신청 일시가 가장 늦은 의도. 단 재입실 의도(R)는 재입실일 값만 정한다 — R 뒤의 신청이 없으면, 퇴실 기록 전 신청(과 R과 같은 값의 신청)만
  // 본 그날 값(퇴실 정리가 끊은 것 빼고)이 재입실일보다 늦게 적용된 것이면 그 값, 아니면 R(총괄 결정: 학생이 낸 대기 신청은 그대로)
  // 석식 정리(학사 석식을 끊는) 날: 퇴실 때 고른 일반 석식이 아직 그 날의 가장 새 의도면 그 날, 아니면 결정 35 중단일
  function cutDate(lv) {
    const g = lv.general;
    if (g && intents.includes(g) && !intents.some((j) => j !== g && j.item === '석식' && !j.reentry && j.req > g.req && j.eff <= g.eff)) return g.eff;
    return stop35(lv.t, lv.L);
  }
  function oracleTop(item, d, skip) {
    const live = intents.filter((i) => i.item === item && i.eff <= d && !(skip && skip(i)));
    const newest = (list) => list.reduce((t, i) => (!t || i.req > t.req || (i.req === t.req && i.seq > t.seq) ? i : t), null);
    const R = newest(live.filter((i) => i.reentry));
    if (!R) return newest(live);
    // 퇴실 정리가 끊은 학사생 값(결정 56: 재입실이 되살리지 않는다). 재입실을 입력한 뒤에 넣은 재입실일 이후 신청은 끊기지 않았다
    const cut = (i) => isHall(i.item, i.value) && i.eff >= (i.item === '조식' ? R.reentry.L : R.reentry.cutD()) && (i.eff < R.eff || i.seq < R.seq);
    // 퇴실 기록 전에 낸 신청 중 아직 살아 있는 것(다른 값의 더 새 의도가 그 전에 적용되지 않음, 퇴실 정리가 끊지 않음) — 그날까지 적용된 가장 새것
    const alive = (i) => !intents.some((j) => j !== i && j.item === i.item && j.value !== i.value && !j.reentry && !cut(j) && j.req > i.req && j.eff <= i.eff);
    // 재입실일 경계(지름길 Y, 결정 56 보충): 재입실일보다 먼저 적용되는 의도는 신청 일시가 늦어도 재입실 뒤에 R을 이기지 못한다.
    // 그런 의도도 학생 자신의 더 옛 대기 의도는 거둔다(alive — 더 새 신청이 대기 신청을 대체, 재입실일 뒤에 적용되는 것이어도)
    // 알려진 지름길(Y2): 거둔 의도가 나중에 가려지거나 취소돼도 거둔 효과가 남는지는 입력 순서를 따른다(seed 2339·2588·4161·5374)
    const after = newest(live.filter((i) => !i.reentry && i.req > R.req && i.eff >= R.eff && alive(i)));
    if (after) return after;
    // 살아 있는 것끼리는 시트와 같이 적용일이 늦은 것(같으면 신청 일시) — 같은 값 행은 서로 취소하지 않아 신청 순서와 적용일 순서가 다를 수 있다
    // 퇴실 기록 뒤·재입실 전 신청도 재입실 값과 같으면 재입실이 취소하지 않아 남는다(같은 값은 덮을 필요가 없다)
    const pre = live.filter((i) => !i.reentry && (i.req < R.reentry.t || (i.req < R.req && i.value === R.value)) && !cut(i) && alive(i))
      .reduce((t, i) => (!t || i.eff > t.eff || (i.eff === t.eff && i.req > t.req) ? i : t), null);
    return pre && pre.eff > R.eff ? pre : R;
  }

  function check(stepNo, all) {
    const where = 'seed ' + seed + ' step ' + stepNo + '\n' + log.slice(-10).join('\n');
    for (const d of DAYS.filter((x, i) => all || FULL || i % 7 === stepNo % 7)) {
      const b = ctx.statusOn_(rows, 's1', '조식', d);
      const inLeave = leave && d >= leave.L && (!leave.E || d < leave.E);   // 재입실일부터는 퇴실 아님
      const tb = oracleTop('조식', d, inLeave ? (i) => isHall('조식', i.value) : null);
      assert.strictEqual(b, tb ? tb.value : '미실시', where + '\n조식 ' + d);
      // 중단일부터: 중단일 이후에 시작하는 학사 석식 의도는 세지 않고(F6 정리가 취소), 남은 가장 늦은 의도가 학사 석식이면 미실시
      const stop = leave ? cutDate(leave) : null;
      const stopped = stop && d >= stop && (!leave.E || d < leave.E);
      const top = oracleTop('석식', d, stopped ? (i) => isHall('석식', i.value) && i.eff >= stop : null).value;
      const want = stopped && isHall('석식', top) ? '미실시' : top;
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
      const t = iso(R() < 0.25 ? Math.max(0, now - Math.floor(R() * 4 * 24 * 60)) : now);   // 넷에 하나는 늦게 입력한 퇴실 기록
      // F6 학사 퇴실 저장(되살림 포함). 넷에 하나는 석식 '일반 석식으로' — 퇴실 입력 일시의 일반 석식 신청(의도)
      const general = R() < 0.25;
      leave = { L, t, E: null, head: saveMove({ type: '학사 퇴실', effectiveDate: L, requestedAt: t, dinner: general ? '일반 석식' : '중단' }, today) };
      // 퇴실 기록보다 뒤에 신청한 퇴실일 이후 학사 석식은 처음부터 없던 것(먼저 입력돼 있어도 — 입력 순서와 무관). 퇴실을 취소하면 돌아온다
      leave.voided = intents.filter((i) => isHall('석식', i.value) && i.item === '석식' && i.req >= t && i.eff >= L);
      leave.voided.forEach((i) => intents.splice(intents.indexOf(i), 1));
      if (general) intents.push(leave.general = { item: '석식', value: '일반 석식', eff: ctx.mealEffectiveDate_('to_general', t, { leaveDate: L }).date, req: t, seq: ++seq });

      log.push(today + ' 퇴실 입력: 퇴실일 ' + L + (general ? ' 일반 석식으로' : ''));
    } else if (leave && R() < 0.15) {
      if (leave.E || R() < 0.5) {
        // R11b 퇴실 취소: 퇴실이 없었던 것처럼(막힌 신청은 처음부터 쓰이지 않았으므로 그대로 무효). 결정 59: 재입실도 함께 취소
        const u = plain(ctx.moveUndoPlan_(rows, leave.head, { today }));
        u.toCancel.forEach((c) => Object.assign(rows.find((r) => r.id === c.id), { status: '취소', cancel_reason: c.cancel_reason || '[자동] ' + leave.head + ' 퇴실 취소' }));
        u.toRestore.forEach((c) => Object.assign(rows.find((r) => r.id === c.id), { status: '유효', cancel_reason: '' }));
        log.push(today + ' 퇴실 취소(' + leave.L + (leave.E ? ', 재입실 ' + leave.E : '') + ') 취소 ' + u.toCancel.length + ' 되살림 ' + u.toRestore.length);
        const lv = leave;   // 퇴실과 함께 고른 일반 석식·재입실 의도도 없었던 것으로, 처음부터 없던 것으로 본 의도는 돌아온다
        for (let k = intents.length - 1; k >= 0; k--) if (intents[k] === lv.general || (intents[k].reentry && intents[k].reentry.t === lv.t)) intents.splice(k, 1);
        lv.voided.forEach((i) => intents.push(i));
        leave = null;
      } else {
        // R11b 재입실: 재입실일부터 퇴실 전날 값으로 급식을 다시 시작한다(오라클은 그 값을 따로 계산해 의도로 넣는다)
        const E = ctx.ymdAddDays_(leave.L, 1 + Math.floor(R() * 14)), t2 = iso(now);
        const before = ctx.ymdAddDays_(leave.L, -1);
        const pre = { '조식': (oracleTop('조식', before) || { value: '미실시' }).value, '석식': oracleTop('석식', before).value };
        saveMove({ type: '학사 입실', effectiveDate: E, requestedAt: t2 }, today);
        for (const item of ['조식', '석식']) intents.push({ item, value: pre[item], eff: E, req: t2, seq: ++seq, reentry: { t: leave.t, L: leave.L, cutD: ((lv) => () => cutDate(lv))(leave) } });
        if (leave.general && leave.general.eff >= E && intents.includes(leave.general)) intents.splice(intents.indexOf(leave.general), 1);   // 퇴실과 함께 고른 일반 석식은 재입실일부터 뜻이 없다
        leave.E = E;
        log.push(today + ' 재입실 입력: 재입실일 ' + E + ' 급식 ' + pre['조식'] + '/' + pre['석식']);
      }
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
      const voidHall = isHall(item, to) && leave && eff >= leave.L && (!leave.E || eff < leave.E) && (item === '조식' || req >= leave.t || eff >= stop35(leave.t, leave.L));
      log.push(today + ' 신청 ' + item + '→' + to + ' (신청 ' + req + (late ? ' 늦은 입력' : '') + (manual ? ' 수동 ' + manual : '') + ') → ' + JSON.stringify({ k: p.kind, d: p.date, b: !!p.blocked, s: p.superseded, c: p.toCancel.length, f: p.followUps.length }));
      assert.strictEqual(!!p.blocked, !!voidHall, 'seed ' + seed + ' blocked 판정\n' + log.slice(-6).join('\n'));
      // 늦게 입력한 이전 신청서는 더 새 의도가 그 전에 적용되면 영영 적용되지 않는다(오라클이 따로 판정 — 의도로 남기지 않는다)
      const cut = (i) => leave && isHall(i.item, i.value) && i.eff >= (i.item === '조식' ? leave.L : cutDate(leave)) && (!leave.E || i.eff < leave.E);   // 퇴실 정리가 끊은 의도
      // superseded면 정말 뜻이 없어야 한다(더 새 의도가 그 전에 적용). 거꾸로는 묻지 않는다: 같은 값의 더 새 의도에만 가린 신청은 살아 있는 행으로
      // 쓴다(재입실이 그 의도를 덮어도 남아야 하므로) — 날마다 값 비교가 맞는지 본다
      const shadowed = intents.some((i) => i.item === item && i.req > req && i.eff <= eff && !cut(i));
      assert.ok(!p.superseded || (!voidHall && shadowed), 'seed ' + seed + ' superseded 판정\n' + log.slice(-6).join('\n'));
      // 가려진 신청서도 의도로 남긴다(결정 58: 가린 의도가 퇴실 정리로 끊기면 다시 보인다 — 가려진 동안은 더 새 의도가 이긴다)
      if (!voidHall) intents.push({ item, value: to, eff, req, seq: ++seq });
      if (p.blocked) { check(step); continue; }
      cancel(p.toCancel, '[자동] r' + (rid + 1) + ' 새 신청으로 대체');   // 신청 행 id = 다음 addRow
      if (!p.superseded) {
        assert.strictEqual(p.date, eff, 'seed ' + seed + ' 적용일\n' + log.slice(-4).join('\n'));
        addRow({ item, value: to, effective_date: p.date, source: 'F7', requested_at: req });
      } else addRow({ item, value: to, effective_date: eff, source: 'F7', requested_at: req, status: '취소', cancel_reason: '[자동] ' + p.supersededBy[0] + ' 더 새 신청' });   // 결정 58
      for (const f of p.followUps) addRow({ item: f.item, value: f.value, effective_date: f.effective_date, source: f.source, requested_at: req });
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

const FULL = !!process.env.ORACLE_FULL, SEEDS = +process.env.ORACLE_SEEDS || 400;   // 넓게: ORACLE_SEEDS=6000
test('오라클 무작위 시험 ' + SEEDS + '가지(사건 40개씩, 3/1~4/30 표본 날짜 + 끝에 매일 비교): 조식·석식 값, 결정 35 중단일, 퇴실 처리, 늦은 입력, 수렴', () => {
  let leaves = 0, rows = 0;
  for (let seed = 1; seed <= SEEDS; seed++) { const r = simulate(seed, 40); leaves += r.leave ? 1 : 0; rows += r.rows; }
  assert.ok(leaves > SEEDS / 4 && rows > SEEDS * 10, '시험 폭: 퇴실 ' + leaves + '건, 행 ' + rows + '개');
});
