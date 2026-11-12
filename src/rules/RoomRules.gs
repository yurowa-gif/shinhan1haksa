/**
 * 기숙사 방 배정 규칙(RULES 세션 소유, R15, docs/plan/stage3.md 1절, PRD F8, 결정 24·64). 순수 함수만 둔다.
 * DateRules.gs(ruleStr_·ruleRowLive_)·StatusRules.gs(statusOn_)·SeatRules.gs(seatAvoidMap_·seatRng_)를 부른다. 아무것도 쓰지 않는다.
 *
 * 입력(시트 행 그대로)
 *   rooms:    [{id, floor, room_no, gender:'남'|'여', capacity, sort_order, status}]        층마다 성별 고정(결정 64 ②)
 *   students: [{id, gender:'남'|'여', grade}]                                             이번 기간 등록생
 *   changes:  status_changes 행(기숙사생 = ymd에 기숙사 '입실')
 *   avoids:   [{student_a, student_b, scope:'좌석'|'방'|'둘 다', status}]                 방에는 '방'·'둘 다'만
 */

/** 살아 있는 방(정원 숫자) — sort_order·층·호 순. */
function roomList_(rooms) {
  return (rooms || []).filter(function (r) { return r && ruleRowLive_(r) && ruleStr_(r.id); }).map(function (r) {
    return { id: ruleStr_(r.id), floor: ruleStr_(r.floor), room_no: ruleStr_(r.room_no), gender: ruleStr_(r.gender),
      capacity: Math.max(0, Math.floor(Number(r.capacity) || 0)), sort: Number(r.sort_order) || 0 };
  }).sort(function (a, b) {
    var ka = [a.sort, Number(a.floor) || 0, Number(a.room_no) || 0, a.id], kb = [b.sort, Number(b.floor) || 0, Number(b.room_no) || 0, b.id];
    for (var i = 0; i < 4; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  });
}

/** 방 성별이 학생을 받는지: 같은 성별만. ASSUMPTION: 성별이 빈 방은 아무도 받지 않는다(층마다 성별 고정, 결정 64 ②). */
function roomGenderOk_(room, student) {
  var g = ruleStr_(room && room.gender);
  return g !== '' && g === ruleStr_(student && student.gender);
}

/**
 * 지금 배정의 규칙 위반(방 화면 빨간 표시). assignments = [{room_id, student_id}](살아 있는 배정).
 * → [{roomId, kind:'정원 초과'|'성별'|'같은 학년'|'떨어뜨릴 짝', studentId}] (방 순)
 * - 정원 초과: 인원 > capacity(studentId ''). 성별: 방 성별과 다른 학생마다(studentId = 그 학생).
 * - 같은 학년: 두 명 이상 있는 방의 모두가 같은 학년(studentId ''). ASSUMPTION: 한 명만 있는 방은 섞을 수 없어 위반이 아니다.
 * - 떨어뜨릴 짝(scope 방·둘 다): 짝마다 한 줄, studentId '' — 누구인지는 서버가 보는 사람 권한에 따라 거른다(결정 64).
 * 없는 방·명단에 없는 학생의 배정은 건너뛴다.
 */
function roomViolations_(rooms, students, assignments, avoids) {
  var list = roomList_(rooms), st = {}, inRoom = {}, out = [];
  (students || []).forEach(function (s) { if (s) st[ruleStr_(s.id)] = s; });
  list.forEach(function (r) { inRoom[r.id] = []; });
  (assignments || []).forEach(function (a) {
    var rid = ruleStr_(a && a.room_id), pid = ruleStr_(a && a.student_id);
    if (inRoom[rid] && st[pid] && inRoom[rid].indexOf(pid) < 0) inRoom[rid].push(pid);
  });
  var avoid = seatAvoidMap_(avoids, ['방', '둘 다']);
  list.forEach(function (r) {
    var ps = inRoom[r.id].slice().sort();
    if (ps.length > r.capacity) out.push({ roomId: r.id, kind: '정원 초과', studentId: '' });
    ps.forEach(function (p) { if (!roomGenderOk_(r, st[p])) out.push({ roomId: r.id, kind: '성별', studentId: p }); });
    if (ps.length >= 2 && ps.every(function (p) { return ruleStr_(st[p].grade) === ruleStr_(st[ps[0]].grade); })) out.push({ roomId: r.id, kind: '같은 학년', studentId: '' });
    ps.forEach(function (p, i) {
      ps.slice(i + 1).forEach(function (q) { if (avoid[p] && avoid[p][q]) out.push({ roomId: r.id, kind: '떨어뜨릴 짝', studentId: '' }); });
    });
  });
  return out;
}

/**
 * 방 초안(R15, 학기마다 전체 재배정 — 지난 배정은 보지 않는다).
 * → {assignments:[{room_id, student_id}], unplaced:[studentId], violations(roomViolations_), warnings}
 * - 대상: 이번 기간 등록생 중 ymd에 기숙사 '입실'인 학생만(statusOn_).
 * - 방 성별(층별 고정)에 맞는 방, 정원을 넘지 않게. 방마다 학년을 섞고(같은 학년만 있는 방 1점), 떨어뜨릴 짝(scope 방·둘 다)을 같은 방에 두지
 *   않는다(10점). seed로 섞은 차례대로 점수가 가장 적게 느는 방(같으면 사람이 적은 방, 그래도 같으면 방 순)에 넣고, 같은 성별 방 사이
 *   맞바꾸기·빈자리로 옮기기로 점수를 줄인다(최대 30회). 자리가 없으면 unplaced + 경고.
 * 같은 입력 + 같은 seed = 같은 결과(입력 행 순서와 무관).
 */
function roomDraft_(rooms, students, changes, avoids, ymd, seed) {
  var day = ruleStr_(ymd);
  if (!ymdIsValid_(day)) throw new Error('날짜 형식이 아닙니다(yyyy-MM-dd): ' + ymd);
  var list = roomList_(rooms), rnd = seatRng_(seed), warnings = [], st = {}, ids = [];
  (students || []).forEach(function (s) {
    var id = ruleStr_(s && s.id);
    if (id && !st[id] && statusOn_(changes, id, '기숙사', day) === '입실') { st[id] = s; ids.push(id); }
  });
  ids.sort();
  for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
  var avoid = seatAvoidMap_(avoids, ['방', '둘 다']);
  var inRoom = {};
  list.forEach(function (r) { inRoom[r.id] = []; });
  var score = function (ps) {   // 방 하나의 점수
    var s = ps.length >= 2 && ps.every(function (p) { return ruleStr_(st[p].grade) === ruleStr_(st[ps[0]].grade); }) ? 1 : 0;
    ps.forEach(function (p, k) { ps.slice(k + 1).forEach(function (q) { if (avoid[p] && avoid[p][q]) s += 10; }); });
    return s;
  };
  var unplaced = [];
  ids.forEach(function (pid) {
    var best = null, bc = Infinity;
    list.forEach(function (r) {
      if (!roomGenderOk_(r, st[pid]) || inRoom[r.id].length >= r.capacity) return;
      var ps = inRoom[r.id], c = (score(ps.concat([pid])) - score(ps)) * 1000 + ps.length;   // 점수 증가 먼저, 같으면 사람이 적은 방
      if (c < bc) { bc = c; best = r; }
    });
    if (!best) { unplaced.push(pid); warnings.push(pid + ' 학생: 들어갈 방이 없습니다(정원)'); return; }
    inRoom[best.id].push(pid);
  });
  // 개선: 학생을 같은 성별 다른 방의 학생과 맞바꾸거나 그 방 빈자리로 옮겨 두 방 점수 합이 줄면 한다(같은 성별 방끼리라 맞바꿔도 성별이 맞다).
  for (var pass = 0; pass < 30; pass++) {
    var changed = false;
    list.forEach(function (a) {
      inRoom[a.id].slice().forEach(function (pa) {
        var bestGain = 0, bestMove = null;
        list.forEach(function (b) {
          if (b === a || !roomGenderOk_(b, st[pa])) return;
          var before = score(inRoom[a.id]) + score(inRoom[b.id]);
          var aWithout = inRoom[a.id].filter(function (x) { return x !== pa; });
          if (inRoom[b.id].length < b.capacity) {   // 옮기기
            var g1 = before - (score(aWithout) + score(inRoom[b.id].concat([pa])));
            if (g1 > bestGain) { bestGain = g1; bestMove = { b: b, pb: null }; }
          }
          inRoom[b.id].forEach(function (pb) {   // 맞바꾸기
            var g2 = before - (score(aWithout.concat([pb])) + score(inRoom[b.id].filter(function (x) { return x !== pb; }).concat([pa])));
            if (g2 > bestGain) { bestGain = g2; bestMove = { b: b, pb: pb }; }
          });
        });
        if (!bestMove) return;
        var b = bestMove.b, pb = bestMove.pb;
        inRoom[a.id] = inRoom[a.id].filter(function (x) { return x !== pa; });
        inRoom[b.id].push(pa);
        if (pb) { inRoom[b.id] = inRoom[b.id].filter(function (x) { return x !== pb; }); inRoom[a.id].push(pb); }
        changed = true;
      });
    });
    if (!changed) break;
  }
  var assignments = [];
  list.forEach(function (r) { inRoom[r.id].slice().sort().forEach(function (p) { assignments.push({ room_id: r.id, student_id: p }); }); });
  return { assignments: assignments, unplaced: unplaced, violations: roomViolations_(rooms, students, assignments, avoids), warnings: warnings };
}

/**
 * 정원 현황판(층·성별·학년별 정원·인원·공석). assignments = 그날 살아 있는 배정.
 * → {rooms:[{roomId, floor, room_no, gender, capacity, count, vacant}],
 *    floors:[{floor, gender, capacity, count, vacant, byGrade:{학년:인원}}],
 *    total:{남|여|'':{capacity, count, vacant, byGrade}}}
 * 공석 = max(0, 정원 − 인원). 정원 초과는 count가 capacity보다 크게 그대로 보인다. 명단에 없는 학생·없는 방의 배정은 세지 않는다.
 */
function roomBoard_(rooms, students, assignments) {
  var list = roomList_(rooms), st = {}, cnt = {};
  (students || []).forEach(function (s) { if (s) st[ruleStr_(s.id)] = s; });
  list.forEach(function (r) { cnt[r.id] = {}; });
  (assignments || []).forEach(function (a) {
    var rid = ruleStr_(a && a.room_id), pid = ruleStr_(a && a.student_id);
    if (cnt[rid] && st[pid]) cnt[rid][pid] = ruleStr_(st[pid].grade);
  });
  var add = function (o, r, n, byG) {
    o.capacity += r.capacity; o.count += n;
    Object.keys(byG).forEach(function (g) { o.byGrade[g] = (o.byGrade[g] || 0) + byG[g]; });
  };
  var floors = {}, floorOrder = [], total = {};
  var out = { rooms: [], floors: [], total: total };
  list.forEach(function (r) {
    var ps = Object.keys(cnt[r.id]), byG = {};
    ps.forEach(function (p) { var g = cnt[r.id][p]; byG[g] = (byG[g] || 0) + 1; });
    out.rooms.push({ roomId: r.id, floor: r.floor, room_no: r.room_no, gender: r.gender, capacity: r.capacity, count: ps.length, vacant: Math.max(0, r.capacity - ps.length) });
    var fk = r.floor + '|' + r.gender;
    if (!floors[fk]) { floors[fk] = { floor: r.floor, gender: r.gender, capacity: 0, count: 0, vacant: 0, byGrade: {} }; floorOrder.push(fk); }
    add(floors[fk], r, ps.length, byG);
    if (!total[r.gender]) total[r.gender] = { capacity: 0, count: 0, vacant: 0, byGrade: {} };
    add(total[r.gender], r, ps.length, byG);
    floors[fk].vacant += Math.max(0, r.capacity - ps.length);
    total[r.gender].vacant += Math.max(0, r.capacity - ps.length);
  });
  out.floors = floorOrder.map(function (k) { return floors[k]; });
  return out;
}
