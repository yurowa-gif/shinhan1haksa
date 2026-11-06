/**
 * 날짜·시각 규칙(RULES 세션 소유, docs/contracts/rules-api.md).
 *
 * 순수 함수만 둔다. Apps Script 서비스와 현재 시각 읽기는 쓰지 않는다.
 * - 날짜: 'yyyy-MM-dd' 문자열. 내부 계산은 Date.UTC로만 해서 실행 시간대(TZ)와 무관하다.
 * - 시각: 'HH:mm'(00:00~23:59, 그리고 하루 끝 '24:00').
 * - 일시: 'yyyy-MM-ddTHH:mm:ss'(KST, Db.gs nowIso_와 같은 형식).
 * 잘못된 입력은 조용히 넘기지 않고 Error를 던진다(검사용으로는 ymdIsValid_·hmIsValid_).
 */

/** 'yyyy-MM-dd' 형식이고 달력에 있는 날짜인지(2027-02-29는 false, 2028-02-29는 true). */
function ymdIsValid_(s) {
  if (typeof s !== 'string') return false;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= ymdDaysInMonth_(y, mo);
}

/** 그 달의 날 수(윤년 반영). */
function ymdDaysInMonth_(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 'yyyy-MM-dd' → UTC 자정의 밀리초. 잘못된 날짜면 Error. */
function ymdToUtcMs_(ymd) {
  if (!ymdIsValid_(ymd)) throw new Error('날짜 형식이 아닙니다(yyyy-MM-dd): ' + ymd);
  return Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
}

/** UTC 밀리초 → 'yyyy-MM-dd'. */
function ymdFromUtcMs_(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + ymdPad2_(d.getUTCMonth() + 1) + '-' + ymdPad2_(d.getUTCDate());
}

function ymdPad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** n일 뒤(음수면 앞) 날짜. n은 정수. */
function ymdAddDays_(ymd, n) {
  if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n) {
    throw new Error('더할 날 수는 정수여야 합니다: ' + n);
  }
  var out = ymdFromUtcMs_(ymdToUtcMs_(ymd) + n * 86400000);
  if (!ymdIsValid_(out)) throw new Error('날짜 범위를 벗어났습니다: ' + ymd + ' + ' + n + '일');
  return out;
}

/** 요일 번호: 0=일, 1=월 … 6=토. */
function ymdWeekday_(ymd) {
  return new Date(ymdToUtcMs_(ymd)).getUTCDay();
}

/** 요일 한 글자: '일'·'월'…'토'. */
function ymdWeekdayKo_(ymd) {
  return ['일', '월', '화', '수', '목', '금', '토'][ymdWeekday_(ymd)];
}

/** 월~일을 한 주로 볼 때 그 주의 월요일(일요일이면 6일 전 월요일). */
function ymdMondayOf_(ymd) {
  var w = ymdWeekday_(ymd);
  return ymdAddDays_(ymd, w === 0 ? -6 : 1 - w);
}

/** b - a 날 수(같으면 0, b가 앞이면 음수). */
function ymdDiffDays_(a, b) {
  return Math.round((ymdToUtcMs_(b) - ymdToUtcMs_(a)) / 86400000);
}

/**
 * from부터 to까지 양 끝을 포함한 날짜 배열. from이 to보다 늦으면 빈 배열.
 * 날 수가 maxDays(기본 366)를 넘으면 Error(잘못된 입력으로 수천 행을 만들지 않게).
 * maxDays는 1 이상의 정수만(NaN·'5'·0은 Error — 설정값이 비어 검사가 꺼지는 일이 없게).
 */
function ymdRange_(from, to, maxDays) {
  var max = maxDays === undefined || maxDays === null ? 366 : maxDays;
  if (typeof max !== 'number' || Math.floor(max) !== max || max < 1) {
    throw new Error('최대 날 수는 1 이상의 정수여야 합니다: ' + maxDays);
  }
  var n = ymdDiffDays_(from, to) + 1;
  if (n <= 0) return [];
  if (n > max) throw new Error('기간이 너무 깁니다(' + n + '일, 최대 ' + max + '일): ' + from + ' ~ ' + to);
  var out = [];
  var start = ymdToUtcMs_(from);
  for (var i = 0; i < n; i++) out.push(ymdFromUtcMs_(start + i * 86400000));
  return out;
}

/** 'HH:mm' 형식인지(00:00~23:59, 그리고 '24:00'). '9:00'·'24:01'·'12:60'은 false. */
function hmIsValid_(hm) {
  if (typeof hm !== 'string') return false;
  var m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) return false;
  var h = +m[1], mi = +m[2];
  if (h === 24) return mi === 0;
  return h < 24 && mi < 60;
}

/** 'HH:mm' → 하루 시작부터의 분. '24:00' = 1440. 잘못된 형식이면 Error. */
function hmToMin_(hm) {
  if (!hmIsValid_(hm)) throw new Error('시각 형식이 아닙니다(HH:mm): ' + hm);
  return +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
}

/** 분 → 'HH:mm'. 0~1440 정수만(1440 = '24:00'). */
function minToHm_(min) {
  if (typeof min !== 'number' || Math.floor(min) !== min || min < 0 || min > 1440) {
    throw new Error('분 값은 0~1440 정수여야 합니다: ' + min);
  }
  return ymdPad2_(Math.floor(min / 60)) + ':' + ymdPad2_(min % 60);
}

/**
 * KST 일시 문자열 → {date:'yyyy-MM-dd', min:하루 시작부터 분(초 버림), sec:하루 시작부터 초}.
 * 'yyyy-MM-ddTHH:mm:ss', 'yyyy-MM-ddTHH:mm', 'yyyy-MM-dd HH:mm:ss'를 받는다.
 * 시간대 표시(Z, +09:00)가 붙은 값은 KST 벽시계가 아닐 수 있으므로 거부한다.
 * 11:29:59 → min 689, 11:30:00 → min 690. 마감 비교는 min(또는 sec) >= 마감 분으로 한다.
 */
function isoLocalSplit_(iso) {
  var m = typeof iso === 'string' &&
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(iso);
  if (!m || !ymdIsValid_(m[1])) throw new Error('일시 형식이 아닙니다(yyyy-MM-ddTHH:mm:ss): ' + iso);
  var h = +m[2], mi = +m[3], s = m[4] === undefined ? 0 : +m[4];
  if (h > 23 || mi > 59 || s > 59) throw new Error('일시 형식이 아닙니다(yyyy-MM-ddTHH:mm:ss): ' + iso);
  return { date: m[1], min: h * 60 + mi, sec: (h * 60 + mi) * 60 + s };
}
