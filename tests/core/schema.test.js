/** 시트 구조(src/Schema.gs) */
const assert = require('assert');
const { test, loadGs } = require('../helpers/harness');

const ctx = loadGs(['src/Schema.gs']);

test('모든 탭: 첫 열 id, 끝 4열 공통, 중복 열 없음', () => {
  for (const kind of Object.keys(ctx.SCHEMA)) {
    for (const sheet of Object.keys(ctx.SCHEMA[kind])) {
      const h = ctx.headersFor_(kind, sheet);
      assert.strictEqual(h[0], 'id', sheet);
      assert.deepStrictEqual(Array.from(h.slice(-4)), ['created_at', 'created_by', 'updated_at', 'updated_by'], sheet);
      assert.strictEqual(new Set(h).size, h.length, sheet + ' 중복 열');
    }
  }
});

test('0단계 탭이 모두 있다', () => {
  for (const t of ['users', 'terms', 'students', 'enrollments', 'guardian_links', 'audit_log']) {
    assert.ok(ctx.SCHEMA.db[t], t);
  }
  assert.ok(ctx.SCHEMA.counsel.counsel_notes);
  assert.ok(ctx.SCHEMA.config.settings);
});

/* ───── 1단계(docs/plan/stage1.md 5절) ───── */

const { plain } = require('../helpers/harness');
const fs = require('fs');
const path = require('path');

const PLAN5 = {
  // cancel_reason은 2단계 승인 추가(결정 41)
  status_changes: ['student_id', 'item', 'value', 'requested_at', 'effective_date', 'effective_date_auto', 'reason', 'doc_submitted', 'linked_change_id', 'source', 'status', 'memo', 'cancel_reason'],
  day_schedules: ['date', 'operating', 'start', 'end', 'day_type', 'memo', 'status'],
  blocks: ['term_type', 'day_type', 'seq', 'start', 'end', 'label', 'status'],
  fixed_schedules: ['student_id', 'month', 'weekday', 'blocks', 'code', 'submitted_at', 'parent_agreed_at', 'teacher_confirmed_at', 'status'],
  spaces: ['name', 'gender', 'rows', 'cols', 'sort_order', 'status', 'memo'],
  seats: ['space_id', 'row', 'col', 'label', 'kind', 'status'],
  seat_assignments: ['term_id', 'seat_id', 'student_id', 'valid_from', 'valid_to', 'status', 'memo']
};

test('1단계 새 탭 7개가 5절 열 그대로 있다(기존 탭 열은 그대로)', () => {
  for (const [tab, cols] of Object.entries(PLAN5)) {
    assert.deepStrictEqual(plain(ctx.SCHEMA.db[tab]), cols, tab);
  }
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.terms), ['name', 'type', 'start_date', 'end_date', 'memo']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.enrollments),
    ['term_id', 'student_id', 'teacher_email', 'veritas', 'commute_type', 'end_type', 'memo']);
});

test('기간별 탭: exceptions_<id 앞 8자>, 열은 5절 그대로, 공통 열 규칙 유지', () => {
  assert.strictEqual(ctx.termSheetName_('exceptions', 'a1b2c3d4-0000-4000-8000-000000000001'), 'exceptions_a1b2c3d4');
  assert.strictEqual(ctx.termTabBase_('exceptions_a1b2c3d4'), 'exceptions');
  assert.strictEqual(ctx.termTabBase_('exceptions_xyz'), '', '8자가 아니면 기간별 탭이 아니다');
  assert.strictEqual(ctx.termTabBase_('seat_assignments'), '');
  const h = plain(ctx.headersFor_('db', 'exceptions_a1b2c3d4'));
  assert.deepStrictEqual(h, ['id', 'term_id', 'group_id', 'student_id', 'date', 'blocks', 'type', 'reason', 'status',
    'requested_by', 'requested_at', 'confirmed_by', 'confirmed_at', 'cancel_reason', 'created_at', 'created_by', 'updated_at', 'updated_by']);
  assert.throws(() => ctx.termSheetName_('students', 'a1b2c3d4-0'), /기간별 탭이 아닙니다/);
  assert.throws(() => ctx.termSheetName_('exceptions', ''), /id가 올바르지 않습니다/);
  assert.throws(() => ctx.headersFor_('db', 'exceptions_'), /정의되지 않은 탭/);
});

test('기본 블록(PRD 3.3): 요일 유형별 3·3·3·4개, 시각 순서·겹침 없음, 학기용', () => {
  const rows = plain(ctx.defaultBlockRows_());
  const by = (d) => rows.filter((r) => r.day_type === d);
  assert.deepStrictEqual(['mon_thu', 'fri', 'sat', 'sun'].map((d) => by(d).length), [3, 3, 3, 4]);
  assert.ok(rows.every((r) => r.term_type === '학기' && r.status === '유효'));
  const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  for (const d of ['mon_thu', 'fri', 'sat', 'sun']) {
    by(d).forEach((r, i) => {
      assert.strictEqual(r.seq, String(i + 1));
      assert.ok(hm(r.start) < hm(r.end), d + ' ' + r.seq);
      if (i > 0) assert.ok(hm(by(d)[i - 1].end) <= hm(r.start), d + ' 겹침');
    });
  }
  assert.deepStrictEqual(by('mon_thu').map((r) => r.label), ['18–20', '20–22', '22–24']);
  assert.deepStrictEqual(by('fri').map((r) => r.label), ['18–19:30', '19:30–22', '22–23']);
  assert.strictEqual(by('fri')[2].end, '23:00', '금요일은 23시 전원 귀가');
});

test('설정 기본값: 키 중복 없음, 1단계 키가 있다(decisions 23)', () => {
  const keys = plain(ctx.DEFAULT_SETTINGS).map((s) => s[0]);
  assert.strictEqual(new Set(keys).size, keys.length);
  for (const k of ['study.fri.start', 'study.fri.end', 'attendance.end_type_day_types', 'attendance.end_label',
    'exception.type_short', 'print.title', 'print.vacant_label']) assert.ok(keys.includes(k), k);
  const get = (k) => plain(ctx.DEFAULT_SETTINGS).find((s) => s[0] === k)[1];
  assert.strictEqual(get('study.fri.start'), '18:30');
  assert.strictEqual(get('attendance.end_type_day_types'), 'mon_thu');
  assert.ok(get('exception.type_short').includes('미인정결석:무결'));
});

test('setup: 기간별 탭을 만들고 id 앞 8자가 겹치면 멈춘다 / 이미 있으면 [탭 유지]', () => {
  const sctx = loadGs(['src/Schema.gs', 'src/Setup.gs']);
  const made = new Set();
  sctx.readAll_ = () => [{ id: 'a1a1a1a1-0000', name: '2026 2학기' }, { id: 'a2a2a2a2-0000', name: '2027 1학기' }];
  sctx.openFile_ = () => ({});
  sctx.ensureSheet_ = (ss, kind, name) => { const had = made.has(name); made.add(name); return (had ? '[탭 유지] ' : '[탭 생성] ') + name; };
  const r1 = []; sctx.ensureTermSheets_(r1);
  assert.deepStrictEqual(r1.map((x) => x.trim()), ['[탭 생성] exceptions_a1a1a1a1', '[탭 생성] violations_a1a1a1a1',
    '[탭 생성] exceptions_a2a2a2a2', '[탭 생성] violations_a2a2a2a2']);
  const r2 = []; sctx.ensureTermSheets_(r2);
  assert.ok(r2.every((x) => x.includes('[탭 유지]')), '두 번째 실행은 유지');
  sctx.readAll_ = () => [{ id: 'aaaaaaaa-0001', name: 'A' }, { id: 'aaaaaaaa-0002', name: 'B' }];
  assert.throws(() => sctx.ensureTermSheets_([]), /탭 이름이 겹칩니다/);
});

/* ───── 2단계(docs/plan/stage2.md 5절, 결정 41) ───── */

const TAIL = ['created_at', 'created_by', 'updated_at', 'updated_by'];
const full = (body) => ['id'].concat(body, TAIL);

test('2단계: 바뀐 탭의 전체 헤더가 5절 승인안 그대로(새 탭 3개, 열 추가 2개)', () => {
  const want = {
    'db/duty_slots': full(['date', 'slot', 'end_time', 'original_email', 'actual_email', 'swapped_at', 'swapped_by', 'status', 'memo']),
    'db/violation_rules': full(['name', 'description', 'active', 'sort_order']),
    'db/violations_a1b2c3d4': full(['term_id', 'student_id', 'occurred_at', 'rule_id', 'rule_name', 'memo', 'detected_by', 'entered_by',
      'status', 'source', 'source_exception_id', 'cancel_reason']),
    'counsel/counsel_notes': full(['student_id', 'date', 'teacher_email', 'type', 'target', 'linked_violation_id', 'content',
      'show_to_parent', 'status', 'cancel_reason']),
    'db/status_changes': full(['student_id', 'item', 'value', 'requested_at', 'effective_date', 'effective_date_auto', 'reason',
      'doc_submitted', 'linked_change_id', 'source', 'status', 'memo', 'cancel_reason'])
  };
  for (const [key, cols] of Object.entries(want)) {
    const [kind, sheet] = key.split('/');
    assert.deepStrictEqual(plain(ctx.headersFor_(kind, sheet)), cols, key);
  }
  assert.strictEqual(ctx.termTabBase_('violations_a1b2c3d4'), 'violations');
  assert.strictEqual(ctx.termTabBase_('violation_rules'), '', 'violation_rules는 기간별 탭이 아니다');
  assert.deepStrictEqual(Object.keys(ctx.SCHEMA_TERM_TABS), ['exceptions', 'violations']);
  // 탭 목록: 2단계에 더한 것은 duty_slots·violation_rules뿐(duty_swaps·meal_counts·out_dismissals는 만들지 않는다). 그 뒤는 3단계 결정 64의 3개(stage3_tabs.test.js)
  assert.deepStrictEqual(Object.keys(ctx.SCHEMA.db), ['users', 'terms', 'students', 'enrollments', 'guardian_links', 'audit_log',
    'status_changes', 'day_schedules', 'blocks', 'fixed_schedules', 'spaces', 'seats', 'seat_assignments', 'duty_slots', 'violation_rules', 'avoid_pairs', 'rooms', 'room_assignments']);
  assert.deepStrictEqual(Object.keys(ctx.SCHEMA.counsel), ['counsel_notes']);
});

test('2단계: 승인안 밖 기존 탭(0단계·설정) 열은 그대로', () => {
  const want = {
    'db/users': full(['email', 'name', 'roles', 'homeroom_class', 'active', 'memo']),
    'db/students': full(['student_no', 'name', 'gender', 'grade', 'class_no', 'number', 'track', 'email', 'memo']),
    'db/guardian_links': full(['parent_email', 'student_id', 'relation', 'memo']),
    'db/audit_log': full(['sheet', 'row_id', 'action', 'before', 'after', 'detail']),
    'config/settings': full(['key', 'value', 'description'])
  };
  for (const [key, cols] of Object.entries(want)) {
    const [kind, sheet] = key.split('/');
    assert.deepStrictEqual(plain(ctx.headersFor_(kind, sheet)), cols, key);
  }
  assert.deepStrictEqual(Object.keys(ctx.SCHEMA.config), ['settings']);
});

test('2단계: violations 열 = R5 초안(outDraft_)이 만드는 행의 열 그대로', () => {
  const rctx = loadGs(['src/rules/DateRules.gs', 'src/rules/AttendanceRules.gs', 'src/rules/OutRules.gs']);
  const draft = plain(rctx.outDraft_({ id: 'e1', term_id: 't', student_id: 's', date: '2027-03-03', blocks: 'ALL', type: '미인정결석' }, 1, {}));
  assert.deepStrictEqual(Object.keys(draft), plain(ctx.SCHEMA_TERM_TABS.violations));
});

test('2단계: violation_rules 기본 항목 = PRD F4 4항목(자동 항목 이름은 R5 기본 이름과 같다)', () => {
  assert.deepStrictEqual(plain(ctx.DEFAULT_VIOLATION_RULES), [
    ['무단 지각·결석·이탈', '미인정 특이사항이 확정되면 자동'],
    ['휴대폰·전자기기', ''],
    ['자습 분위기 방해(과도한 수면, 교사 지시 불이행 포함)', ''],
    ['기숙사 생활 위반', '']
  ]);
});

test('src의 모든 시트 접근은 SCHEMA에 있는 탭 이름만 쓴다(오타 방지)', () => {
  const known = new Set([].concat(...Object.values(ctx.SCHEMA).map((o) => Object.keys(o))));
  const dir = path.join(__dirname, '..', '..', 'src');
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.gs') && files.push(p); } })(dir);
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    for (const m of code.matchAll(/\b(?:readAll_|findById_|appendRecord_|updateRecord_|bulkAppend_)\('([a-z_]+)'/g)) {
      assert.ok(known.has(m[1]) || ctx.termTabBase_(m[1]), path.basename(f) + ': 알 수 없는 탭 ' + m[1]);
    }
  }
});
