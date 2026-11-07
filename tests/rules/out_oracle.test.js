/**
 * R5 OutRules 오라클 + 무작위 시험(시드 고정).
 *
 * 오라클 = PRD F1·F4, 결정 10·22, 총괄 결정(설정 변경은 앞으로만)을 그대로 옮긴 아주 단순한 모델. 규칙 함수와 다르게
 * "단위(학생, 묶음)마다 OUT이 살아 있어야 하는가"만 장부로 들고 다닌다:
 *   - 자격 행 = 확정 + 달력 날짜 + 유형이 지금 자동 대상 + (그 유형을 넓힌 시각 이후 확정)
 *   - 살아 있는 OUT은 그 단위에 "자격 행이거나 만들 때 유형과 같은 확정 행"이 남아 있는 동안 유지, 없으면 사라진다.
 *   - 살아 있는 OUT이 없고 자격 행이 있으면 생긴다. 단 관리자가 직접 취소한 단위는 다시 생기지 않는다.
 * 사건(무작위): 특이사항 입력(하루~사흘 묶음, 확정/요청), 확정, 취소, 요청으로 되돌림, 설정 넓힘·좁힘, 관리자 취소,
 * 사람이 메모 고침, 같은 OUT 중복 저장, 맞추기 실행. 실행마다 (1) 결과를 저장한 뒤 다시 실행하면 0건(수렴) (2) 살아 있는 OUT 단위가 오라클과
 * 같음 (3) 단위마다 OUT은 하나, 학생·기간이 특이사항과 같음 (4) 직접 OUT·사람이 고친 메모는 그대로 를 확인한다.
 */
const assert = require('assert');
const { test, loadGs, plain } = require('../helpers/harness');

const ctx = loadGs(['src/rules/DateRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/OutRules.gs']);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BASE_TYPES = ['미인정지각', '미인정조퇴', '미인정결석'];
const ALL_TYPES = ['미인정결석', '미인정지각', '미인정조퇴', '병결', '기타', '학원(보강 포함)'];
const base = (t) => t.replace(/\s*\(.*\)\s*$/, '').trim();
const iso = (min) => { const d = new Date(Date.UTC(2027, 2, 1, 8, 0) + min * 60000); return d.toISOString().slice(0, 19); };
const ymd = (day) => '2027-03-' + String(day).padStart(2, '0');

function simulate(seed, steps) {
  const R = rng(seed);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  let now = 0, gseq = 0, eseq = 0, vseq = 0;
  const exceptions = [];
  const violations = [{ id: 'direct1', term_id: 'T1', student_id: 's1', source: '직접', status: '유효', memo: '직접 입력', rule_name: '휴대폰' }];
  let autoTypes = BASE_TYPES.slice();
  const since = {};
  const oracle = {};                     // unitKey → {live, createdType, blocked}
  const humanMemo = {};                  // violationId → memo
  const log = [];

  const unitKey = (e) => e.student_id + '|' + e.group_id;
  const sinceOk = (e, t) => !(t in since) || e.confirmed_at >= since[t];
  const eligible = (e) => e.status === '확정' && ctx.ymdIsValid_(e.date) && autoTypes.includes(base(e.type)) && sinceOk(e, base(e.type));
  const opts = () => ({ autoTypes: autoTypes.slice(), autoTypeSince: Object.assign({}, since), ruleName: '무단 지각·결석·이탈',
    dutyByDate: { '2027-03-03': 'duty1@example.com', '2027-03-10': 'duty2@example.com' } });

  function apply(r) {
    for (const c of r.toCancel) Object.assign(violations.find((v) => v.id === c.violationId), { status: '취소', cancel_reason: c.reason });
    for (const c of r.toCreate) violations.push(Object.assign({ id: 'v' + (++vseq) }, c));
    for (const u of r.toUpdate) Object.assign(violations.find((v) => v.id === u.violationId), u.patch);
  }

  function oracleStep() {
    const units = {};
    for (const e of exceptions) (units[unitKey(e)] = units[unitKey(e)] || []).push(e);
    for (const k of Object.keys(units)) {
      const rows = units[k];
      const ent = oracle[k];
      if (ent && ent.live) {
        const keep = rows.filter((e) => e.status === '확정' && ctx.ymdIsValid_(e.date) &&
          (eligible(e) || (base(e.type) === ent.createdType && sinceOk(e, ent.createdType))));
        if (!keep.length) ent.live = false;
      }
      const E = rows.filter(eligible).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
      if ((!ent || !ent.live) && E.length && !(ent && ent.blocked)) oracle[k] = { live: true, createdType: base(E[0].type), blocked: false };
    }
  }

  function check(stepNo) {
    const where = 'seed ' + seed + ' step ' + stepNo + '\n' + log.slice(-8).join('\n');
    const live = violations.filter((v) => v.source === 'F1자동' && (v.status === '유효' || v.status === ''));
    const implKeys = {};
    for (const v of live) {
      const ex = exceptions.find((e) => e.id === v.source_exception_id);
      assert.ok(ex, where + '\n연결된 특이사항 없음 ' + v.id);
      assert.strictEqual(ex.student_id, v.student_id, where);
      assert.strictEqual(ex.status, '확정', where + '\n대표가 확정이 아님');
      const k = unitKey(ex);
      assert.ok(!implKeys[k], where + '\n같은 단위에 OUT 둘: ' + k);
      implKeys[k] = true;
      if (humanMemo[v.id] !== undefined) assert.strictEqual(v.memo, humanMemo[v.id], where + '\n사람 메모가 바뀜');
    }
    const oracleKeys = Object.keys(oracle).filter((k) => oracle[k].live).sort();
    assert.deepStrictEqual(Object.keys(implKeys).sort(), oracleKeys, where);
    assert.deepStrictEqual(violations[0], { id: 'direct1', term_id: 'T1', student_id: 's1', source: '직접', status: '유효', memo: '직접 입력', rule_name: '휴대폰' }, where);
  }

  for (let step = 0; step < steps; step++) {
    now += 1 + Math.floor(R() * 120);
    const x = R();
    if (x < 0.30) {
      const g = 'G' + (++gseq), sid = pick(['s1', 's2', 's3']), type = pick(ALL_TYPES), n = 1 + Math.floor(R() * 3);
      const day = 2 + Math.floor(R() * 20), confirmed = R() < 0.7, bad = R() < 0.05;
      for (let i = 0; i < n; i++) {
        exceptions.push({ id: 'e' + (++eseq), term_id: 'T1', group_id: g, student_id: sid, date: bad ? '2027-02-30' : ymd(day + i),
          blocks: pick(['ALL', '18:00-20:00', '15:00-24:00']), type, status: confirmed ? '확정' : '요청',
          requested_by: 'homeroom@example.com', confirmed_by: confirmed ? 'att@example.com' : '', confirmed_at: confirmed ? iso(now) : '' });
      }
      log.push('입력 ' + g + ' ' + sid + ' ' + type + ' ' + n + '일 ' + (confirmed ? '확정' : '요청'));
    } else if (x < 0.40) {
      const reqs = exceptions.filter((e) => e.status === '요청');
      if (reqs.length) { const e = pick(reqs); Object.assign(e, { status: '확정', confirmed_by: 'att@example.com', confirmed_at: iso(now) }); log.push('확정 ' + e.id); }
    } else if (x < 0.52) {
      const live = exceptions.filter((e) => e.status !== '취소');
      if (live.length) { const e = pick(live); e.status = '취소'; log.push('취소 ' + e.id); }
    } else if (x < 0.55) {
      const c = exceptions.filter((e) => e.status === '확정');
      if (c.length) { const e = pick(c); e.status = '요청'; log.push('요청으로 ' + e.id); }
    } else if (x < 0.62) {
      const t = pick(['기타', '미인정지각']);
      if (autoTypes.includes(t)) { autoTypes = autoTypes.filter((y) => y !== t); log.push('설정 좁힘 -' + t); }
      else { autoTypes.push(t); since[t] = iso(now); log.push('설정 넓힘 +' + t + ' ' + since[t]); }
    } else if (x < 0.67) {
      const live = violations.filter((v) => v.source === 'F1자동' && v.status === '유효');
      if (live.length) {
        // 관리자가 그 단위의 OUT을 취소(중복 저장된 사본이 있으면 함께 — 하나만 지우는 것은 중복 정리와 구별할 수 없다)
        const v = pick(live);
        const k = unitKey(exceptions.find((e) => e.id === v.source_exception_id));
        for (const w of live) {
          if (unitKey(exceptions.find((e) => e.id === w.source_exception_id)) === k) Object.assign(w, { status: '취소', cancel_reason: '관리자 판단' });
        }
        oracle[k] = Object.assign(oracle[k] || {}, { live: false, blocked: true });
        log.push('관리자 취소 ' + v.id + ' ' + k);
      }
    } else if (x < 0.72) {
      const live = violations.filter((v) => v.source === 'F1자동' && v.status === '유효');
      if (live.length) { const v = pick(live); v.memo = '사람 메모 ' + step; humanMemo[v.id] = v.memo; log.push('메모 ' + v.id); }
    } else if (x < 0.74) {
      // 같은 OUT이 두 번 저장된 경우(동시 실행 등) — 다음 맞추기가 하나만 남겨야 한다
      const live = violations.filter((v) => v.source === 'F1자동' && v.status === '유효');
      if (live.length) { const v = pick(live); violations.push(Object.assign({}, v, { id: 'v' + (++vseq) })); log.push('중복 저장 ' + v.id); }
    } else {
      const r = plain(ctx.reconcileAutoOuts_(exceptions, violations, opts()));
      // 새로 만든 OUT의 대표 = 그 단위 자격 행 중 가장 이른 날짜(같으면 id 순), 유형·입력자도 그 행
      for (const c of r.toCreate) {
        const ex = exceptions.find((e) => e.id === c.source_exception_id);
        const E = exceptions.filter((e) => unitKey(e) === unitKey(ex) && eligible(e))
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
        assert.ok(E.length && E[0].id === ex.id, 'seed ' + seed + ' step ' + step + ' 대표가 가장 이른 자격 행이 아님');
        assert.strictEqual(c.rule_name, '무단 지각·결석·이탈(' + base(ex.type) + ')');
        assert.strictEqual(c.entered_by, 'att@example.com');
      }
      apply(r);
      log.push('맞추기 +' + r.toCreate.length + ' -' + r.toCancel.length + ' ~' + r.toUpdate.length);
      const again = plain(ctx.reconcileAutoOuts_(exceptions, violations, opts()));
      assert.deepStrictEqual(again, { toCreate: [], toCancel: [], toUpdate: [] }, 'seed ' + seed + ' step ' + step + ' 수렴 안 함\n' + log.slice(-8).join('\n'));
      oracleStep();
      check(step);
    }
  }
  return { exceptions: exceptions.length, violations: violations.length };
}

test('오라클 무작위 시험 300가지(사건 60개씩): 수렴, 살아 있는 OUT 단위 일치, 단위당 1개, 직접 OUT·사람 메모 보존', () => {
  let total = 0;
  for (let seed = 1; seed <= 300; seed++) total += simulate(seed, 60).violations;
  assert.ok(total > 300, '시험이 OUT을 충분히 만들었는가: ' + total);
});
