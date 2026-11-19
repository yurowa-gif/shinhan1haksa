/**
 * T6 한 달치 결과 정리 가짜 데이터(docs/plan/t6-notes.md 1절). 고정 seed, 학생·날마다 결과 0~1개.
 * ASSUMPTION: 비율은 리허설 크기를 맞추려는 가정이다(실제 운영 비율 아님).
 *   결석 1.0%(병결 0.8·미인정결석 0.2) · 지각 1.2%(병지각 0.5·미인정지각 0.7) · 조퇴 0.7%(병조퇴 0.4·미인정조퇴 0.3)
 *   미인정은 학생마다 최대 1건(넘으면 같은 종류의 인정 유형으로 바꿈), 정한 학생(twoOut명)만 미인정 2건.
 *
 *   monthResults({students, dates, eligible(sid, date), seed, twoOut}) → {cells:[{studentId, date, kind, type}], expect:{sid:{결석:{인정,미인정}, …}}, twoOutIds}
 */
const RATES = [
  [0.008, '결석', '병결'], [0.010, '결석', '미인정결석'],
  [0.015, '지각', '병지각'], [0.022, '지각', '미인정지각'],
  [0.026, '조퇴', '병조퇴'], [0.029, '조퇴', '미인정조퇴']
];
const RECOGNIZED = { '결석': '병결', '지각': '병지각', '조퇴': '병조퇴' };

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const zero = () => ({ '결석': { '인정': 0, '미인정': 0 }, '지각': { '인정': 0, '미인정': 0 }, '조퇴': { '인정': 0, '미인정': 0 } });

function monthResults({ students, dates, eligible, seed, twoOut }) {
  const rand = rng(seed || 2027);
  const cells = [], expect = {}, used = {}, unexcused = {};
  const add = (sid, date, kind, type) => {
    cells.push({ studentId: sid, date, kind, type });
    (expect[sid] = expect[sid] || zero())[kind][type.startsWith('미인정') ? '미인정' : '인정']++;
    used[sid + '|' + date] = true;
    if (type.startsWith('미인정')) unexcused[sid] = (unexcused[sid] || 0) + 1;
  };
  students.forEach((sid) => dates.forEach((date) => {
    if (!eligible(sid, date)) return;
    const r = rand();
    const hit = RATES.find((x) => r < x[0]);
    if (!hit) return;
    let [, kind, type] = hit;
    if (type.startsWith('미인정') && unexcused[sid]) type = RECOGNIZED[kind];   // 미인정은 학생마다 최대 1건
    add(sid, date, kind, type);
  }));
  // 정한 학생 twoOut명: 미인정 2건이 되게 채운다(자동 2OUT → 퇴실 대상 경로)
  const twoOutIds = [];
  for (const sid of students) {
    if (twoOutIds.length >= (twoOut || 0)) break;
    const free = dates.filter((d) => eligible(sid, d) && !used[sid + '|' + d]);
    if (free.length < 2) continue;
    let k = 0;
    while ((unexcused[sid] || 0) < 2 && k < free.length) { add(sid, free[k], '지각', '미인정지각'); k++; }
    twoOutIds.push(sid);
  }
  return { cells, expect, twoOutIds, zero };
}

module.exports = { monthResults, zero };
