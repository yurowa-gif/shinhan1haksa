/**
 * 3단계 가짜 데이터(실제 학생 정보 사용 금지 — CLAUDE.md 1번). docs/plan/stage3.md T3a, 결정 64.
 *
 * buildFakeStage3_(fake, roomRows) : 순수 함수. 같은 입력이면 같은 결과(id도 고정).
 *   - 떨어뜨릴 짝 3쌍(avoid_pairs): scope 좌석 1 · 방 1 · 둘 다 1. 방·둘 다 짝은 같은 성별 기숙사생이라 방 초안에서 뜻이 있다.
 *   - 지난 기간(2026 2학기) 좌석 배정(seat_assignments): 1학기와 다른 자리 — 좌석 초안의 "3학년은 지난 자리 유지" 확인용.
 *   - 2027 1학기 방 배정(room_assignments): 기숙사생(1단계 상태의 기숙사 입실) 전원, 같은 성별 호실에 3명씩, 방 짝은 다른 방.
 *   roomRows = rooms 행(setup의 seedRooms_가 만든 id를 room_id로 쓴다).
 * seedFakeStage3() : 편집기에서 실행. seedFakeData·seedFakeStage1 뒤에. 두 번 실행해도 중복 없음.
 */

var FAKE3_MEMO = '가짜 데이터';

function buildFakeStage3_(fake, roomRows) {
  var stage1 = buildFakeStage1_(fake);
  var prev = fake.terms[0], cur = stage1.term;
  var st = fake.students;
  var enr = function (term, sid) { return fake.enrollments.filter(function (e) { return e.term_id === term.id && e.student_id === sid; })[0]; };
  var dormFrom = {};   // 1학기 기숙사 입실 적용일
  stage1.statusChanges.forEach(function (c) { if (c.item === '기숙사' && c.value === '입실' && c.status === '유효') dormFrom[c.student_id] = c.effective_date; });

  /* 떨어뜨릴 짝 3쌍: 같은 성별, 여섯 명 모두 다르게. 좌석 짝은 비베리타스(1층에서 이웃이 될 수 있게), 방·둘 다 짝은 기숙사생 */
  var used = {};
  var pickPair = function (ok) {
    for (var i = 0; i < st.length; i++) {
      if (used[st[i].id] || !ok(st[i])) continue;
      for (var j = i + 1; j < st.length; j++) {
        if (used[st[j].id] || !ok(st[j]) || st[j].gender !== st[i].gender) continue;
        used[st[i].id] = used[st[j].id] = true;
        return [st[i], st[j]];
      }
    }
    throw new Error('가짜 짝을 고를 학생이 없습니다');
  };
  var nonVeritas = function (s) { return enr(cur, s.id) && enr(cur, s.id).veritas !== 'TRUE'; };
  var dorm = function (s) { return !!dormFrom[s.id]; };
  var avoidPairs = [
    ['좌석', pickPair(nonVeritas), '가짜: 자습 중 잡담'],
    ['방', pickPair(dorm), '가짜: 생활 습관 갈등'],
    ['둘 다', pickPair(function (s) { return dorm(s) && nonVeritas(s); }), '가짜: 학부모 요청']
  ].map(function (x, i) {
    return { id: fakeId_('f9100000', i + 1), student_a: x[1][0].id, student_b: x[1][1].id, scope: x[0], reason: x[2], status: '유효' };
  });

  /* 2026 2학기 좌석 배정: 1학기 배정(1단계)과 다르게 — 학생을 거꾸로 돌며 베리타스는 같은 성별 SA실, 그 밖은 1층 뒤에서부터 */
  var spaceKey = {};
  stage1.spaces.forEach(function (sp) { spaceKey[sp.id] = sp.name === '1층 자습실' ? '1F' : sp.name; });
  var bySpace = {};
  stage1.seats.forEach(function (s) { if (s.kind === '좌석') (bySpace[spaceKey[s.space_id]] = bySpace[spaceKey[s.space_id]] || []).push(s.id); });
  var saOf = function (g) {
    return Object.keys(bySpace).filter(function (k) { return /^SA/.test(k) && stage1.spaces.some(function (sp) { return spaceKey[sp.id] === k && sp.gender === g; }); }).sort();
  };
  var taken = {};
  var take = function (keys, fromEnd) {
    for (var k = 0; k < keys.length; k++) {
      var list = (bySpace[keys[k]] || []).slice();
      if (fromEnd) list.reverse();
      for (var n = 0; n < list.length; n++) if (!taken[list[n]]) { taken[list[n]] = true; return list[n]; }
    }
    return null;
  };
  var prevSeats = [];
  st.slice().reverse().forEach(function (s) {
    var e = enr(prev, s.id);
    if (!e) return;
    var seat = (e.veritas === 'TRUE' && take(saOf(s.gender), true)) || take(['1F'], true);
    prevSeats.push({ id: fakeId_('f9200000', prevSeats.length + 1), term_id: prev.id, seat_id: seat, student_id: s.id,
      valid_from: '', valid_to: '', status: '배정', memo: FAKE3_MEMO });
  });

  /* 2027 1학기 방 배정: 기숙사생을 성별마다 호실 순서로 3명씩. 방 짝(scope 방·둘 다)은 같은 방에 넣지 않는다 */
  var rooms = (roomRows || []).filter(function (r) { return r.status === '유효' || r.status === ''; })
    .sort(function (a, b) { return Number(a.sort_order) - Number(b.sort_order); });
  if (!rooms.length) throw new Error('rooms 탭이 비었습니다(setup을 먼저 실행하세요)');
  var apart = {};
  avoidPairs.forEach(function (p) {
    if (p.scope === '좌석') return;
    apart[p.student_a + '|' + p.student_b] = apart[p.student_b + '|' + p.student_a] = true;
  });
  var roomAssignments = [];
  ['남', '여'].forEach(function (g) {
    var list = rooms.filter(function (r) { return r.gender === g; });
    var members = {};   // room id → 학생 id 목록
    st.filter(function (s) { return s.gender === g && dorm(s); }).forEach(function (s) {
      var room = list.filter(function (r) {
        var m = members[r.id] || [];
        return m.length < Math.min(3, Number(r.capacity) || 0) && !m.some(function (o) { return apart[o + '|' + s.id]; });
      })[0];
      if (!room) throw new Error('가짜 방 배정 자리가 없습니다: ' + g);
      (members[room.id] = members[room.id] || []).push(s.id);
      roomAssignments.push({ id: fakeId_('f9300000', roomAssignments.length + 1), term_id: cur.id, room_id: room.id, student_id: s.id,
        valid_from: dormFrom[s.id] === cur.start_date ? '' : dormFrom[s.id], valid_to: '', status: '배정', memo: FAKE3_MEMO });
    });
  });

  return { prevTerm: prev, term: cur, avoidPairs: avoidPairs, prevSeatAssignments: prevSeats, roomAssignments: roomAssignments };
}

/** 편집기에서 실행. seedFakeData()·seedFakeStage1() 뒤에, 가짜 학생만 있는 DB에서만. 두 번 실행해도 중복 없음. */
function seedFakeStage3() {
  var owner = assertOwnerRun_();
  return withLock_(function () {   // 검사와 쓰기 사이에 다른 저장이 끼지 않게
    var students = readAll_('students');
    if (!fake1DbIsAllFake_(students)) {
      throw new Error('가짜 학생(seedFakeData)만 있는 DB에서만 실행합니다. 실제 데이터가 있는 DB에는 쓰지 않습니다.');
    }
    var fake = buildFakeData_({});
    var termIds = readAll_('terms').map(function (t) { return t.id; });
    if (!fake.terms.every(function (t) { return termIds.indexOf(t.id) >= 0; })) throw new Error('가짜 운영 기간이 없습니다. seedFakeData()를 먼저 실행하세요.');
    var stage1 = buildFakeStage1_(fake);
    if (!readAll_('seats').some(function (r) { return r.id === stage1.seats[0].id; })) throw new Error('1단계 가짜 데이터가 없습니다. seedFakeStage1()을 먼저 실행하세요.');
    var data = buildFakeStage3_(fake, readAll_('rooms'));
    // 이 시드가 쓴 것이 아닌 지난 기간 좌석 배정·이번 기간 방 배정이 있으면 덮지 않는다
    var mine = {};
    data.prevSeatAssignments.concat(data.roomAssignments).forEach(function (r) { mine[r.id] = true; });
    var foreign = readAll_('seat_assignments').filter(function (r) { return r.term_id === data.prevTerm.id && !mine[r.id]; })
      .concat(readAll_('room_assignments').filter(function (r) { return r.term_id === data.term.id && !mine[r.id]; }));
    if (foreign.length) throw new Error('지난 기간 좌석 배정이나 이번 기간 방 배정에 다른 행이 ' + foreign.length + '개 있어 쓰지 않습니다.');
    var lines = [];
    [['avoid_pairs', data.avoidPairs], ['seat_assignments', data.prevSeatAssignments], ['room_assignments', data.roomAssignments]].forEach(function (pair) {
      var fresh = fake1OnlyNew_(pair[1], readAll_(pair[0]));
      bulkAppend_(pair[0], fresh, owner);
      lines.push(pair[0] + ' +' + fresh.length);
    });
    var msg = '가짜 3단계 데이터: ' + lines.join(', ');
    console.log(msg);
    return msg;
  });
}
