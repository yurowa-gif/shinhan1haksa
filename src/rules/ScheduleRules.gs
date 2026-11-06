/**
 * 자습 일정 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD 3.3).
 *
 * 순수 함수만 둔다. DateRules.gs의 함수(ymd…·hm…)를 부른다.
 * 시트 행은 Db.gs readAll_이 돌려주는 모양(모든 값이 문자열)을 그대로 받는다.
 *   day_schedules: date, operating, start, end, day_type, memo, status, updated_at …
 *   blocks:        term_type, day_type, seq, start, end, label, status, updated_at …
 */

/** 요일 기본 유형: 월~목 'mon_thu', 금 'fri', 토 'sat', 일 'sun'. */
function baseDayType_(ymd) {
  return ['sun', 'mon_thu', 'mon_thu', 'mon_thu', 'mon_thu', 'fri', 'sat'][ymdWeekday_(ymd)];
}

/** 행이 '취소' 상태인지(앞뒤 공백 무시). */
function schedIsCancelled_(row) {
  return String((row && row.status) || '').trim() === '취소';
}

/**
 * 그 날짜의 day_schedules 행 하나. '취소'는 빼고, 같은 날짜가 여럿이면 updated_at이 가장
 * 늦은 행(같으면 시트에서 더 아래 행)을 고른다. 없으면 null.
 */
function pickDaySchedule_(rows, ymd) {
  var best = null;
  (rows || []).forEach(function (r) {
    if (!r || schedIsCancelled_(r) || String(r.date || '').trim() !== ymd) return;
    if (!best || String(r.updated_at || '') >= String(best.updated_at || '')) best = r;
  });
  return best;
}

/**
 * day_schedules.operating 값 → boolean. 빈칸은 '운영'(true).
 * ASSUMPTION: 시트 입력 값이 정해지지 않아 운영 안 함으로 읽는 값을 넓게 받는다:
 * FALSE·N·NO·X·0·아니오·미운영·운영 안 함·운영안함·휴무(대소문자·앞뒤 공백 무시).
 */
function schedOperatingValue_(v) {
  if (v === false || v === 0) return false;
  var s = String(v === undefined || v === null ? '' : v).trim().toUpperCase().replace(/\s+/g, '');
  return ['FALSE', 'N', 'NO', 'X', '0', '아니오', '미운영', '운영안함', '휴무'].indexOf(s) < 0;
}

/**
 * 블록 행 검사. 반환 [{index, message}](index = 입력 배열 위치, 문제 없으면 빈 배열).
 * '취소' 행은 건너뛴다. (term_type, day_type)이 같은 행끼리 순서 번호 중복·시간 겹침을 본다.
 * 끝이 앞 블록의 시작과 같은 것(20:00–22:00 다음 22:00–24:00)은 겹침이 아니다.
 */
function validateBlocks_(blocks) {
  var errors = [];
  var groups = {};
  (blocks || []).forEach(function (b, i) {
    if (!b || schedIsCancelled_(b)) return;
    var ok = true;
    var seq = String(b.seq === undefined || b.seq === null ? '' : b.seq).trim();
    if (!/^[1-9]\d*$/.test(seq)) {
      errors.push({ index: i, message: '순서는 1 이상의 정수여야 합니다: ' + seq });
      ok = false;
    }
    var start = String(b.start || '').trim(), end = String(b.end || '').trim();
    if (!hmIsValid_(start) || start === '24:00') {
      errors.push({ index: i, message: '시작 시각 형식이 아닙니다(HH:mm): ' + start });
      ok = false;
    }
    if (!hmIsValid_(end)) {
      errors.push({ index: i, message: '끝 시각 형식이 아닙니다(HH:mm, 24:00 허용): ' + end });
      ok = false;
    }
    if (hmIsValid_(start) && hmIsValid_(end) && hmToMin_(start) >= hmToMin_(end)) {
      errors.push({ index: i, message: '시작이 끝보다 앞이어야 합니다: ' + start + '–' + end });
      ok = false;
    }
    var key = String(b.term_type || '').trim() + '|' + String(b.day_type || '').trim();
    (groups[key] = groups[key] || []).push({ index: i, seq: seq, start: start, end: end, ok: ok });
  });

  Object.keys(groups).forEach(function (key) {
    var list = groups[key];
    var seenSeq = {};
    list.forEach(function (x) {
      if (!/^[1-9]\d*$/.test(x.seq)) return;
      if (seenSeq[x.seq] !== undefined) {
        errors.push({ index: x.index, message: '순서 ' + x.seq + '이(가) 겹칩니다(' + (seenSeq[x.seq] + 1) + '번째 행과 같음)' });
      } else {
        seenSeq[x.seq] = x.index;
      }
    });
    var valid = list.filter(function (x) { return x.ok; }).sort(function (a, b) {
      return hmToMin_(a.start) - hmToMin_(b.start) || a.index - b.index;
    });
    for (var v = 1; v < valid.length; v++) {
      if (+valid[v].seq < +valid[v - 1].seq) {
        errors.push({ index: valid[v].index, message: '순서 번호가 시각 순서와 다릅니다: ' + valid[v].seq + '번(' +
          valid[v].start + ')이 ' + valid[v - 1].seq + '번(' + valid[v - 1].start + ')보다 늦게 시작합니다' });
      }
    }
    for (var j = 1; j < valid.length; j++) {
      for (var k = 0; k < j; k++) {
        if (hmToMin_(valid[j].start) < hmToMin_(valid[k].end)) {
          errors.push({ index: valid[j].index, message: '시간이 겹칩니다: ' + valid[k].start + '–' + valid[k].end +
            ' / ' + valid[j].start + '–' + valid[j].end });
          break;
        }
      }
    }
  });
  return errors.sort(function (a, b) { return a.index - b.index; });
}

/** 블록 머리말 표기: '18:00','20:00' → '18–20', '14:00','15:30' → '14–15:30'(정각은 분 생략, 줄표 –). */
function schedBlockLabel_(start, end) {
  function part(hm) { return hm.slice(3) === '00' ? String(+hm.slice(0, 2)) : String(+hm.slice(0, 2)) + hm.slice(2); }
  return part(start) + '–' + part(end);
}

/**
 * 하루 일정 결정.
 * src = {termType:'학기'|'방학', daySchedule:row|null, blocks:rows[],
 *        defaults:{mon_thu:{start,end}, fri:{…}, sat:{…}, sun:{…}}}
 * → {date, operating, dayType, start, end, blocks:[{seq,start,end,label,key}], memo, warnings:[]}
 *
 * - dayType: 날짜별 일정의 day_type이 있으면 그 값, 없으면 baseDayType_.
 * - start·end: 날짜별 일정 값 → defaults[dayType] → (특별 유형이고 기본값이 없으면) 블록의 처음·끝.
 * - 블록: '취소' 제외, term_type·day_type이 맞는 행을 시작 시각 순으로. 같은 순서(seq)가 여럿이면 updated_at 최신 1행.
 *   seq는 1부터 다시 매긴다. 블록 시각은 바꾸지 않는다(key = 원래 'HH:mm-HH:mm').
 * - 종료 시각 이후에 시작하는 블록(시작 >= 종료)은 뺀다(stage1 4절 d). 시작 시각 변경은 블록에 영향이 없다.
 * - 운영 안 하는 날: operating false, blocks [].
 * 잘못된 행은 건너뛰고 warnings에 적는다(출석부 생성이 멈추지 않게).
 */
function resolveDayPlan_(ymd, src) {
  src = src || {};
  if (!ymdIsValid_(ymd)) throw new Error('날짜 형식이 아닙니다(yyyy-MM-dd): ' + ymd);
  var warnings = [];
  var ds = src.daySchedule || null;
  if (ds && schedIsCancelled_(ds)) ds = null;
  var dsType = ds ? String(ds.day_type || '').trim() : '';
  var dayType = dsType || baseDayType_(ymd);
  var operating = ds ? schedOperatingValue_(ds.operating) : true;
  var memo = ds ? String(ds.memo || '') : '';
  var termType = String(src.termType || '학기').trim();

  var rows = schedBlocksFor_(src.blocks, termType, dayType, warnings);
  if (!rows.length && termType === '방학') {
    // ASSUMPTION: 방학 블록을 따로 정하지 않았으면 같은 요일 유형의 학기 블록을 쓴다(stage1 4절 6번).
    rows = schedBlocksFor_(src.blocks, '학기', dayType, warnings);
  }

  var def = (src.defaults || {})[dayType] || null;
  var start = schedPickHm_(ds && ds.start, 'start', warnings) || schedPickHm_(def && def.start, 'default.start', warnings);
  var end = schedPickHm_(ds && ds.end, 'end', warnings) || schedPickHm_(def && def.end, 'default.end', warnings);
  if (!start && rows.length) start = rows[0].start;
  if (!end && rows.length) end = rows.reduce(function (m, r) { return hmToMin_(r.end) > hmToMin_(m) ? r.end : m; }, rows[0].end);
  if (!start || !end) warnings.push('자습 시작·종료 시각을 정할 수 없습니다(요일 유형 ' + dayType + ')');
  if (start && end && hmToMin_(start) >= hmToMin_(end)) {
    warnings.push('시작 ' + start + '이(가) 종료 ' + end + '보다 늦습니다');
  }

  var blocks = [];
  if (operating) {
    if (!rows.length) warnings.push('블록이 없습니다(' + termType + ', ' + dayType + ')');
    var endMin = end ? hmToMin_(end) : 1440;
    rows.forEach(function (r) {
      if (hmToMin_(r.start) >= endMin) return; // 종료 뒤에 시작하는 블록은 뺀다
      blocks.push({
        seq: blocks.length + 1,
        start: r.start,
        end: r.end,
        label: r.label || schedBlockLabel_(r.start, r.end),
        key: r.start + '-' + r.end
      });
    });
  }

  return {
    date: ymd, operating: operating, dayType: dayType,
    start: start || '', end: end || '',
    blocks: blocks, memo: memo, warnings: warnings
  };
}

/** 'HH:mm' 값이면 그대로, 빈칸이면 '', 잘못된 값이면 warnings에 적고 ''. */
function schedPickHm_(v, what, warnings) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '';
  if (hmIsValid_(s)) return s;
  warnings.push(what + ' 시각 형식이 아니라 무시했습니다: ' + s);
  return '';
}

/** 그 기간 유형·요일 유형의 사용할 수 있는 블록 행(시작 순). 잘못된 행은 warnings에 적고 뺀다. */
function schedBlocksFor_(rows, termType, dayType, warnings) {
  var bySeq = {};
  (rows || []).forEach(function (r) {
    if (!r || schedIsCancelled_(r)) return;
    if (String(r.term_type || '').trim() !== termType || String(r.day_type || '').trim() !== dayType) return;
    var seq = String(r.seq === undefined || r.seq === null ? '' : r.seq).trim();
    var start = String(r.start || '').trim(), end = String(r.end || '').trim();
    if (!/^[1-9]\d*$/.test(seq) || !hmIsValid_(start) || start === '24:00' || !hmIsValid_(end) ||
        hmToMin_(start) >= hmToMin_(end)) {
      warnings.push('잘못된 블록을 건너뛰었습니다: ' + termType + ' ' + dayType + ' ' + seq + ' ' + start + '–' + end);
      return;
    }
    var prev = bySeq[seq];
    if (prev) warnings.push('같은 순서의 블록이 둘 이상입니다(최근 수정한 것을 씀): ' + termType + ' ' + dayType + ' ' + seq);
    if (!prev || String(r.updated_at || '') >= String(prev.row.updated_at || '')) {
      bySeq[seq] = { row: r, seq: +seq, start: start, end: end, label: String(r.label || '').trim() };
    }
  });
  return Object.keys(bySeq).map(function (k) { return bySeq[k]; })
    .sort(function (a, b) { return hmToMin_(a.start) - hmToMin_(b.start) || a.seq - b.seq; })
    .map(function (x) { return { seq: x.seq, start: x.start, end: x.end, label: x.label, row: x.row }; });
}
