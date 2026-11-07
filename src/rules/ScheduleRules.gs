/**
 * 자습 일정 규칙(RULES 세션 소유, docs/contracts/rules-api.md, PRD 3.3).
 *
 * 순수 함수만 둔다. DateRules.gs의 함수(ymd…·hm…)를 부른다.
 * 시트 행은 Db.gs readAll_이 돌려주는 모양(모든 값이 문자열)을 그대로 받는다.
 *   day_schedules: date, operating, start, end, day_type, memo, status, updated_at …
 *   blocks:        term_type, day_type, seq, start, end, label, status, updated_at …
 * 시각 열은 '일반 텍스트' 서식이어야 한다(시각 서식이면 readAll_이 '1899-12-30'으로 바꿔 시각을 잃는다).
 */

/** 요일 기본 유형: 월~목 'mon_thu', 금 'fri', 토 'sat', 일 'sun'. */
function baseDayType_(ymd) {
  return ['sun', 'mon_thu', 'mon_thu', 'mon_thu', 'mon_thu', 'fri', 'sat'][ymdWeekday_(ymd)];
}

/** 행이 '취소' 상태인지(앞뒤 공백 무시). */
function schedIsCancelled_(row) {
  return String((row && row.status) || '').trim() === '취소';
}

/** features/Schedule.gs가 부르는 이름. 같은 일은 DateRules.gs hmNorm_. */
function schedNormHm_(v) {
  return hmNorm_(v);
}

/**
 * 그 날짜의 day_schedules 행 하나. '취소'는 빼고, 같은 날짜가 여럿이면 updated_at이 가장
 * 늦은 행(같으면 시트에서 더 아래 행)을 고른다. 없으면 null.
 */
function pickDaySchedule_(rows, ymd) {
  var best = null;
  (rows || []).forEach(function (r) {
    if (!r || schedIsCancelled_(r) || ruleStr_(r.date) !== ymd) return;
    if (!best || ruleStr_(r.updated_at) >= ruleStr_(best.updated_at)) best = r;
  });
  return best;
}

/**
 * day_schedules.operating 값 읽기 → {value:boolean, known:boolean}.
 * 운영: 빈칸·TRUE·Y·YES·O·1·예·운영·true.
 * 운영 안 함: FALSE·N·NO·X·×·0·OFF·아니오·아니요·미운영·운영 안 함·운영X·휴무·휴일·false·0.
 * ASSUMPTION: 둘 다 아닌 값(오타)은 운영 안 함으로 보고 known:false(resolveDayPlan_이 경고).
 * 출석부가 안 나오는 쪽이 잘못된 출석부가 조용히 인쇄되는 쪽보다 눈에 잘 띄기 때문이다.
 */
function schedOperatingParse_(v) {
  if (v === true) return { value: true, known: true };
  if (v === false || v === 0) return { value: false, known: true };
  var s = ruleStr_(v).toUpperCase().replace(/\s+/g, '');
  if (['', 'TRUE', 'Y', 'YES', 'O', '1', '예', '운영'].indexOf(s) >= 0) return { value: true, known: true };
  if (['FALSE', 'N', 'NO', 'X', '×', '0', 'OFF', '아니오', '아니요', '미운영', '운영안함', '운영X', '휴무', '휴일']
      .indexOf(s) >= 0) return { value: false, known: true };
  return { value: false, known: false };
}

/** day_schedules.operating 값 → boolean(schedOperatingParse_의 value). */
function schedOperatingValue_(v) {
  return schedOperatingParse_(v).value;
}

/**
 * 블록 행 검사. 반환 [{index, message}](index = 입력 배열 위치, 문제 없으면 빈 배열).
 * '취소' 행은 건너뛴다. term_type은 '학기'·'방학', day_type은 빈칸이 아니어야 한다.
 * (term_type, day_type)이 같은 행끼리 순서 번호 중복·시간 겹침·순서와 시각 순서 불일치를 본다.
 * 끝이 앞 블록의 시작과 같은 것(20:00–22:00 다음 22:00–24:00)은 겹침이 아니다.
 * 시각은 schedNormHm_으로 읽는다('9:00'·'21:30:00'도 통과).
 */
function validateBlocks_(blocks) {
  var errors = [];
  var groups = {};
  (blocks || []).forEach(function (b, i) {
    if (!b || schedIsCancelled_(b)) return;
    var termType = ruleStr_(b.term_type), dayType = ruleStr_(b.day_type);
    if (termType !== '학기' && termType !== '방학') {
      errors.push({ index: i, message: '기간 유형은 학기 또는 방학이어야 합니다: ' + termType });
    }
    if (!dayType) errors.push({ index: i, message: '요일 유형이 비어 있습니다' });
    var seq = ruleStr_(b.seq);
    var seqOk = /^[1-9]\d*$/.test(seq);
    if (!seqOk) errors.push({ index: i, message: '순서는 1 이상의 정수여야 합니다: ' + seq });
    var start = schedNormHm_(b.start), end = schedNormHm_(b.end);
    var timeOk = true;
    if (!start || start === '24:00') {
      errors.push({ index: i, message: '시작 시각 형식이 아닙니다(HH:mm): ' + ruleStr_(b.start) });
      timeOk = false;
    }
    if (!end) {
      errors.push({ index: i, message: '끝 시각 형식이 아닙니다(HH:mm, 24:00 허용): ' + ruleStr_(b.end) });
      timeOk = false;
    }
    if (timeOk && hmToMin_(start) >= hmToMin_(end)) {
      errors.push({ index: i, message: '시작이 끝보다 앞이어야 합니다: ' + start + '–' + end });
      timeOk = false;
    }
    var key = termType + '|' + dayType;
    (groups[key] = groups[key] || []).push({ index: i, seq: seq, seqOk: seqOk, start: start, end: end, timeOk: timeOk });
  });

  Object.keys(groups).forEach(function (key) {
    var list = groups[key];
    var seenSeq = {};
    list.forEach(function (x) {
      if (!x.seqOk) return;
      if (seenSeq[x.seq] !== undefined) {
        errors.push({ index: x.index, message: '순서 ' + x.seq + '이(가) 겹칩니다(' + (seenSeq[x.seq] + 1) + '번째 행과 같음)' });
      } else {
        seenSeq[x.seq] = x.index;
      }
    });
    var timed = list.filter(function (x) { return x.timeOk; }).sort(function (a, b) {
      return hmToMin_(a.start) - hmToMin_(b.start) || a.index - b.index;
    });
    for (var j = 1; j < timed.length; j++) {
      for (var k = 0; k < j; k++) {
        if (hmToMin_(timed[j].start) < hmToMin_(timed[k].end)) {
          errors.push({ index: timed[j].index, message: '시간이 겹칩니다: ' + timed[k].start + '–' + timed[k].end +
            ' / ' + timed[j].start + '–' + timed[j].end });
          break;
        }
      }
    }
    var ordered = timed.filter(function (x) { return x.seqOk; });
    for (var v = 1; v < ordered.length; v++) {
      if (+ordered[v].seq < +ordered[v - 1].seq) {
        errors.push({ index: ordered[v].index, message: '순서 번호가 시각 순서와 다릅니다: ' + ordered[v].seq + '번(' +
          ordered[v].start + ')이 ' + ordered[v - 1].seq + '번(' + ordered[v - 1].start + ')보다 늦게 시작합니다' });
      }
    }
  });
  return errors.sort(function (a, b) { return a.index - b.index; });
}

/** 블록 머리말 표기: '18:00','20:00' → '18–20', '09:00','12:00' → '09–12', '14:00','15:30' → '14–15:30'(정각은 분 생략, 줄표 –). */
function schedBlockLabel_(start, end) {
  function part(hm) { return hm.slice(3) === '00' ? hm.slice(0, 2) : hm; }
  return part(start) + '–' + part(end);
}

/**
 * 하루 일정 결정.
 * src = {termType:'학기'|'방학', daySchedule:row|null, blocks:rows[],
 *        defaults:{mon_thu:{start,end}, fri:{…}, sat:{…}, sun:{…}}}
 * → {date, operating, dayType, start, end, blocks:[{seq,start,end,label,key}], memo, warnings:[]}
 *
 * - daySchedule은 그 날짜 행이어야 한다(다른 날짜·취소 행이면 무시하고 경고).
 * - dayType: 날짜별 일정의 day_type이 있으면 그 값, 없으면 baseDayType_.
 * - start·end: 날짜별 일정 값 → defaults[dayType] → 블록의 처음 시작·가장 늦은 끝.
 *   기본 유형(mon_thu·fri·sat·sun)인데 defaults가 없어 블록 시각을 쓰면 경고.
 * - 블록: '취소' 제외, term_type·day_type이 맞는 행을 시작 시각 순으로. 같은 순서(seq)가 여럿이면 updated_at 최신 1행.
 *   seq는 1부터 다시 매긴다. 블록 시각은 바꾸지 않는다(key = 원래 'HH:mm-HH:mm').
 * - 종료 시각 이후에 시작하는 블록(시작 >= 종료)은 뺀다(stage1 4절 d). 시작 시각 변경은 블록에 영향이 없다.
 * - 운영 안 하는 날: operating false, blocks [].
 * 잘못된 행은 건너뛰고 warnings에 적는다(출석부 생성이 멈추지 않게). 잘못된 ymd만 Error.
 */
function resolveDayPlan_(ymd, src) {
  src = src || {};
  if (!ymdIsValid_(ymd)) throw new Error('날짜 형식이 아닙니다(yyyy-MM-dd): ' + ymd);
  var warnings = [];
  var ds = src.daySchedule || null;
  if (ds && schedIsCancelled_(ds)) ds = null;
  if (ds && ruleStr_(ds.date) !== ymd) {
    warnings.push('다른 날짜(' + ruleStr_(ds.date) + ')의 일정 행이 넘어와 무시했습니다');
    ds = null;
  }
  var dayType = (ds && ruleStr_(ds.day_type)) || baseDayType_(ymd);
  var operating = true;
  if (ds) {
    var op = schedOperatingParse_(ds.operating);
    operating = op.value;
    if (!op.known) warnings.push('운영 여부 값을 알 수 없어 운영 안 함으로 보았습니다: ' + ruleStr_(ds.operating));
  }
  var memo = ds ? String(ds.memo || '') : '';
  var termType = ruleStr_(src.termType) || '학기';

  var rows = schedBlocksFor_(src.blocks, termType, dayType, warnings);
  if (!rows.length && termType === '방학') {
    // ASSUMPTION: 방학 블록을 따로 정하지 않았으면 같은 요일 유형의 학기 블록을 쓴다(stage1 4절 6번).
    var before = warnings.length;
    rows = schedBlocksFor_(src.blocks, '학기', dayType, warnings);
    if (before > 0 && warnings.some(function (w) { return w.indexOf('방학 ' + dayType) >= 0; })) {
      warnings.push('쓸 수 있는 방학 블록이 없어 학기 블록을 썼습니다(' + dayType + ')');
    }
  }

  var def = (src.defaults || {})[dayType] || null;
  var start = schedPickHm_(ds && ds.start, '시작', true, warnings) || schedPickHm_(def && def.start, '기본 시작', true, warnings);
  var end = schedPickHm_(ds && ds.end, '종료', false, warnings) || schedPickHm_(def && def.end, '기본 종료', false, warnings);
  var isBase = ['mon_thu', 'fri', 'sat', 'sun'].indexOf(dayType) >= 0;
  if ((!start || !end) && rows.length) {
    if (isBase && operating) warnings.push('기본 자습 시각이 없어 블록 시각을 썼습니다(' + dayType + ')');
    if (!start) start = rows[0].start;
    if (!end) end = rows.reduce(function (m, r) { return hmToMin_(r.end) > hmToMin_(m) ? r.end : m; }, rows[0].end);
  }
  if (operating) {
    if (!start || !end) warnings.push('자습 시작·종료 시각을 정할 수 없습니다(요일 유형 ' + dayType + ')');
    if (start && end && hmToMin_(start) >= hmToMin_(end)) {
      warnings.push('시작 ' + start + '이(가) 종료 ' + end + '보다 늦습니다');
    }
  }

  var blocks = [];
  if (operating) {
    if (!rows.length) warnings.push('블록이 없습니다(' + termType + ', ' + dayType + ')');
    var endMin = end ? hmToMin_(end) : 1440;
    rows.forEach(function (r) {
      if (hmToMin_(r.start) >= endMin) return; // 종료 뒤에 시작하는 블록은 뺀다
      var prev = blocks[blocks.length - 1];
      if (prev && hmToMin_(r.start) < hmToMin_(prev.end)) {
        warnings.push('블록 시간이 겹칩니다: ' + prev.key + ' / ' + r.start + '-' + r.end);
      }
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

/** 시각 값이면 'HH:mm', 빈칸이면 '', 잘못된 값(시작 '24:00' 포함)이면 warnings에 적고 ''. */
function schedPickHm_(v, what, isStart, warnings) {
  var hm = schedNormHm_(v);
  if (hm === '') return '';
  if (hm && !(isStart && hm === '24:00')) return hm;
  warnings.push(what + ' 시각 형식이 아니라 무시했습니다: ' + ruleStr_(v));
  return '';
}

/** 그 기간 유형·요일 유형의 쓸 수 있는 블록 행(시작 순). 잘못된 행은 warnings에 적고 뺀다. */
function schedBlocksFor_(rows, termType, dayType, warnings) {
  var bySeq = {};
  (rows || []).forEach(function (r) {
    if (!r || schedIsCancelled_(r)) return;
    if (ruleStr_(r.term_type) !== termType || ruleStr_(r.day_type) !== dayType) return;
    var seq = ruleStr_(r.seq);
    var start = schedNormHm_(r.start), end = schedNormHm_(r.end);
    if (!/^[1-9]\d*$/.test(seq) || !start || start === '24:00' || !end || hmToMin_(start) >= hmToMin_(end)) {
      warnings.push('잘못된 블록을 건너뛰었습니다: ' + termType + ' ' + dayType + ' ' + seq + ' ' +
        ruleStr_(r.start) + '–' + ruleStr_(r.end));
      return;
    }
    var prev = bySeq[seq];
    if (prev) warnings.push('같은 순서의 블록이 둘 이상입니다(최근 수정한 것을 씀): ' + termType + ' ' + dayType + ' ' + seq);
    if (!prev || ruleStr_(r.updated_at) >= ruleStr_(prev.row.updated_at)) {
      bySeq[seq] = { row: r, seq: +seq, start: start, end: end, label: ruleStr_(r.label) };
    }
  });
  return Object.keys(bySeq).map(function (k) { return bySeq[k]; })
    .sort(function (a, b) { return hmToMin_(a.start) - hmToMin_(b.start) || a.seq - b.seq; });
}
