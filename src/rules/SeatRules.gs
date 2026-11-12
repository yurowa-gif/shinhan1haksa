/**
 * 좌석 초안 규칙(RULES 세션 소유, R14, docs/plan/stage3.md 1절, PRD F5, 결정 64). 순수 함수만 둔다.
 * DateRules.gs(ruleStr_·ruleRowLive_)를 부른다. 아무것도 쓰지 않고 배정 목록만 돌려준다.
 *
 * 입력(시트 행 그대로, 문자열이어도 된다)
 *   spaces:   [{id, name, gender:'남'|'여'|'혼성'|'', status}]       이름이 'SA<숫자>'로 시작하면 SA실(베리타스 자리)
 *   seats:    [{id, space_id, row, col, kind:'좌석'|'기둥'|'비상문'|'창문', status}]
 *   students: [{id, gender:'남'|'여', grade, veritas}]                  이번 기간 등록생(veritas는 TRUE·'TRUE'·true)
 *   prev:     [{seat_id, student_id}]                                   지난 기간 배정(3학년 자리 유지용)
 *   fixed:    [{seat_id, student_id}]                                   이미 고정한 자리(그대로 둔다)
 *   avoids:   [{student_a, student_b, scope:'좌석'|'방'|'둘 다', status}] 떨어뜨릴 짝(좌석에는 '좌석'·'둘 다'만)
 */

/** SA실(베리타스 자리)인지: 공간 이름이 'SA<숫자>'로 시작(Seats.gs seatLabelStyle_과 같은 기준). */
function seatIsSa_(space) {
  return /^\s*SA\s*\d/i.test(ruleStr_(space && space.name));
}

/** 공간 성별이 학생을 받는지: 남·여 공간은 같은 성별만, 혼성·빈칸은 누구나. */
function seatGenderOk_(space, student) {
  var g = ruleStr_(space && space.gender);
  return g !== '남' && g !== '여' ? true : g === ruleStr_(student && student.gender);
}

/**
 * 좌석 판(내부): 살아 있는 공간의 살아 있는 '좌석' 칸과 이웃. 이웃 = 같은 공간에서 행 또는 열이 1 차이(다른 하나는 같음)인 좌석 칸 —
 * 기둥·창문·비상문·통로 칸을 사이에 두면 2칸 떨어지므로 이웃이 아니다.
 * → {seats:{id:{id, space, sa}}, order:[id](공간 이름·행·열 순), nb:{id:[id]}}
 */
function seatBoard_(spaces, seats) {
  var sp = {}, board = { seats: {}, order: [], nb: {} }, at = {};
  (spaces || []).forEach(function (s) { if (s && ruleRowLive_(s)) sp[ruleStr_(s.id)] = s; });
  (seats || []).filter(function (t) {
    return t && ruleRowLive_(t) && ruleStr_(t.kind) === '좌석' && sp[ruleStr_(t.space_id)];
  }).sort(function (a, b) {
    var ka = [ruleStr_(sp[ruleStr_(a.space_id)].name), +a.row, +a.col], kb = [ruleStr_(sp[ruleStr_(b.space_id)].name), +b.row, +b.col];
    for (var i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  }).forEach(function (t) {
    var id = ruleStr_(t.id), s = sp[ruleStr_(t.space_id)];
    board.seats[id] = { id: id, space: s, sa: seatIsSa_(s) };
    board.order.push(id);
    at[ruleStr_(t.space_id) + ':' + (+t.row) + ':' + (+t.col)] = id;
  });
  (seats || []).forEach(function (t) {
    var id = ruleStr_(t && t.id);
    if (!board.seats[id]) return;
    var key = function (dr, dc) { return ruleStr_(t.space_id) + ':' + (+t.row + dr) + ':' + (+t.col + dc); };
    board.nb[id] = [key(-1, 0), key(1, 0), key(0, -1), key(0, 1)].map(function (k) { return at[k]; }).filter(Boolean);
  });
  return board;
}

/** 살아 있는 떨어뜨릴 짝(좌석에 쓰는 scope '좌석'·'둘 다') → {학생id: {상대id: true}}. */
function seatAvoidMap_(avoids, scopes) {
  var m = {};
  (avoids || []).forEach(function (p) {
    if (!p || !ruleRowLive_(p) || scopes.indexOf(ruleStr_(p.scope)) < 0) return;
    var a = ruleStr_(p.student_a), b = ruleStr_(p.student_b);
    if (!a || !b || a === b) return;
    (m[a] = m[a] || {})[b] = true;
    (m[b] = m[b] || {})[a] = true;
  });
  return m;
}

/**
 * 지금 배정의 규칙 위반 칸(화면 빨간 표시). assignments = [{seat_id, student_id}](이번 기간 살아 있는 배정).
 * → [{seatId, kind:'같은 학년'|'떨어뜨릴 짝'|'성별', with}] (seatId 순, 같은 칸 안에서는 kind·with 순)
 * - 같은 학년·떨어뜨릴 짝: 이웃(seatBoard_) 두 칸 모두에 한 줄씩, with = 상대 칸 id. 짝 위반은 kind만 뜻이 있다 — 상대 이름·사유는 서버가
 *   보는 사람 권한에 따라 거른다(결정 64).
 * - 성별: 남·여 공간에 다른 성별 학생, with ''.
 * 좌석이 아닌 칸·없는 학생의 배정은 건너뛴다.
 */
function seatViolations_(spaces, seats, students, assignments, avoids) {
  var board = seatBoard_(spaces, seats), st = {}, who = {}, out = [];
  (students || []).forEach(function (s) { if (s) st[ruleStr_(s.id)] = s; });
  (assignments || []).forEach(function (a) {
    var sid = ruleStr_(a && a.seat_id), pid = ruleStr_(a && a.student_id);
    if (board.seats[sid] && st[pid]) who[sid] = pid;
  });
  var avoid = seatAvoidMap_(avoids, ['좌석', '둘 다']);
  board.order.forEach(function (id) {
    var me = who[id];
    if (!me) return;
    if (!seatGenderOk_(board.seats[id].space, st[me])) out.push({ seatId: id, kind: '성별', with: '' });
    board.nb[id].forEach(function (n) {
      var other = who[n];
      if (!other) return;
      if (ruleStr_(st[me].grade) === ruleStr_(st[other].grade)) out.push({ seatId: id, kind: '같은 학년', with: n });
      if (avoid[me] && avoid[me][other]) out.push({ seatId: id, kind: '떨어뜨릴 짝', with: n });
    });
  });
  return out;
}

/** 문자열 seed → 0~1 난수 함수(mulberry32). 같은 seed면 같은 수열. */
function seatRng_(seed) {
  var h = 1779033703, s = ruleStr_(seed);
  for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  var a = h >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 좌석 초안(R14). → {assignments:[{seat_id, student_id}], unplaced:[studentId], violations(seatViolations_와 같은 모양), warnings}
 * 순서(stage3.md 1절):
 *  1. 고정 자리(fixed)는 그대로 둔다(좌석이 없거나 겹치면 경고하고 뺀다).
 *  2. 3학년은 지난 기간 자리(prev)가 이번에도 좌석으로 있고 비어 있으며 성별이 맞으면 그 자리. ASSUMPTION: 베리타스 여부가 바뀌어 구역이
 *     달라졌으면(베리타스인데 1층 자리, 아니면서 SA실 자리) 유지하지 않는다.
 *  3. 베리타스 = 같은 성별 SA실. SA 자리가 모자라면 1층(SA 아닌 공간)으로 넘기고 경고.
 *  4. 나머지를 SA 아닌 공간에 채운다. 이웃(seatBoard_)에 같은 학년·떨어뜨릴 짝이 오지 않게(비용 = 같은 학년 1, 짝 10) seed로 섞은 차례대로
 *     가장 싼 빈자리(같으면 seed로 하나)를 고르고, 맞바꾸기·빈자리로 옮기기로 비용을 줄인다(고정·3학년 유지 자리는 움직이지 않는다).
 *  5. 다 못 지키면 가장 덜 어긴 배치(위 탐색의 결과)와 위반 목록. 자리가 모자라 못 앉힌 학생은 unplaced + 경고.
 * 같은 입력 + 같은 seed = 같은 결과(입력 순서와도 무관 — id 순으로 정렬한 뒤 seed로 섞는다).
 */
function seatDraft_(spaces, seats, students, prev, fixed, avoids, seed) {
  var board = seatBoard_(spaces, seats), rnd = seatRng_(seed), warnings = [];
  var st = {}, list = [];
  (students || []).forEach(function (s) {
    var id = ruleStr_(s && s.id);
    if (id && !st[id]) { st[id] = s; list.push(id); }
  });
  list.sort();
  var avoid = seatAvoidMap_(avoids, ['좌석', '둘 다']);
  var isVer = function (pid) { var v = st[pid].veritas; return v === true || /^true$/i.test(ruleStr_(v)); };
  var who = {}, where = {}, locked = {};
  var put = function (sid, pid, lock) { who[sid] = pid; where[pid] = sid; if (lock) locked[sid] = true; };

  // 1. 고정
  (fixed || []).slice().sort(function (a, b) { return ruleStr_(a.seat_id) < ruleStr_(b.seat_id) ? -1 : 1; }).forEach(function (f) {
    var sid = ruleStr_(f.seat_id), pid = ruleStr_(f.student_id);
    if (!st[pid] || where[pid]) return;
    if (!board.seats[sid] || who[sid]) { warnings.push(pid + ' 학생의 고정 자리(' + sid + ')를 쓸 수 없어 새로 배정합니다'); return; }
    put(sid, pid, true);
  });
  // 2. 3학년 지난 자리
  (prev || []).slice().sort(function (a, b) { return ruleStr_(a.seat_id) < ruleStr_(b.seat_id) ? -1 : 1; }).forEach(function (p) {
    var sid = ruleStr_(p.seat_id), pid = ruleStr_(p.student_id), seat = board.seats[sid];
    if (!st[pid] || where[pid] || !seat || who[sid] || ruleStr_(st[pid].grade) !== '3') return;
    if (!seatGenderOk_(seat.space, st[pid]) || seat.sa !== isVer(pid)) return;
    put(sid, pid, true);
  });

  // 3·4. 나머지: seed로 섞은 차례(베리타스 먼저 — SA가 모자라면 1층으로 넘어가므로)
  var cost = function (sid, pid) {
    var c = 0;
    board.nb[sid].forEach(function (n) {
      var o = who[n];
      if (!o || o === pid) return;
      if (ruleStr_(st[o].grade) === ruleStr_(st[pid].grade)) c += 1;
      if (avoid[pid] && avoid[pid][o]) c += 10;
    });
    return c;
  };
  var pool = function (pid, sa) {   // 그 학생이 앉을 수 있는 빈자리
    return board.order.filter(function (sid) { var s = board.seats[sid]; return !who[sid] && s.sa === sa && seatGenderOk_(s.space, st[pid]); });
  };
  var rest = list.filter(function (pid) { return !where[pid]; });
  for (var i = rest.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
  var orderOf = {};
  rest.forEach(function (pid, k) { orderOf[pid] = k; });
  rest.sort(function (a, b) {   // 베리타스 먼저, 같으면 섞은 차례
    var va = isVer(a) ? 0 : 1, vb = isVer(b) ? 0 : 1;
    return va !== vb ? va - vb : orderOf[a] - orderOf[b];
  });
  var unplaced = [];
  rest.forEach(function (pid) {
    var cands = isVer(pid) ? pool(pid, true) : [];
    if (isVer(pid) && !cands.length) { cands = pool(pid, false); if (cands.length) warnings.push(pid + ' 학생(베리타스): SA실 자리가 모자라 1층에 배정했습니다'); }
    if (!isVer(pid)) cands = pool(pid, false);
    if (!cands.length) { unplaced.push(pid); warnings.push(pid + ' 학생: 앉을 자리가 없습니다'); return; }
    var best = [], bc = Infinity;   // 가장 싼 자리들 중 seed로 하나(같은 값이면 앞자리만 고르지 않게)
    cands.forEach(function (sid) { var c = cost(sid, pid); if (c < bc) { bc = c; best = [sid]; } else if (c === bc) best.push(sid); });
    put(best[Math.floor(rnd() * best.length)], pid, false);
  });

  // 개선: 위반 칸의 학생을 같은 구역(SA 여부·성별 맞음)의 다른 학생과 맞바꾸거나 빈자리로 옮겨 비용이 줄면 한다. 바뀌는 것이 없을 때까지(최대 30회).
  var movable = function (sid) { return who[sid] && !locked[sid]; };
  var fits = function (sid, pid) { var s = board.seats[sid]; return seatGenderOk_(s.space, st[pid]) && s.sa === board.seats[where[pid]].sa; };
  for (var pass = 0; pass < 30; pass++) {
    var changed = false;
    board.order.forEach(function (a) {
      if (!movable(a)) return;
      var pa = who[a];
      if (!cost(a, pa)) return;
      var bestGain = 0, bestB = null;
      board.order.forEach(function (b) {
        if (b === a || locked[b] || !fits(b, pa)) return;
        var pb = who[b];
        if (pb && !fits(a, pb)) return;
        var before = cost(a, pa) + (pb ? cost(b, pb) : 0);
        delete who[a]; if (pb) delete who[b];
        who[b] = pa; if (pb) who[a] = pb;
        var after = cost(b, pa) + (pb ? cost(a, pb) : 0);
        delete who[b]; if (pb) delete who[a];
        who[a] = pa; if (pb) who[b] = pb;
        if (before - after > bestGain) { bestGain = before - after; bestB = b; }
      });
      if (bestB) {
        var pb2 = who[bestB];
        delete who[a]; delete who[bestB];
        put(bestB, pa, false);
        if (pb2) put(a, pb2, false);
        changed = true;
      }
    });
    if (!changed) break;
  }

  var assignments = board.order.filter(function (sid) { return who[sid]; }).map(function (sid) { return { seat_id: sid, student_id: who[sid] }; });
  return { assignments: assignments, unplaced: unplaced, violations: seatViolations_(spaces, seats, students, assignments, avoids), warnings: warnings };
}
