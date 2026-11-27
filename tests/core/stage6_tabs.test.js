/**
 * S6-0(결정 89~101): 6단계 탭·열·권한 키·audit 글자 수. 가짜 데이터만.
 */
const assert = require('assert');
const { test, plain, loadGs } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ctx = loadGs(['src/Schema.gs', 'src/Auth.gs']);
const OWNER = 'owner@example.com', PA = 'test.parent@example.com';
const TAIL = ['created_at', 'created_by', 'updated_at', 'updated_by'];

test('새 탭 4+1개와 열 추가가 결정 101·s6-0-design.md 그대로(기존 열은 그대로, 공통 열 규칙)', () => {
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.career_profiles), ['term_id', 'student_id', 'version', 'hopes', 'targets', 'interests', 'strengths', 'concerns', 'parent_fields', 'submitted_at', 'status', 'cancel_reason']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.course_plans), ['term_id', 'student_id', 'entry_year', 'grade', 'semester', 'choice_group', 'course', 'state', 'confirmed_by', 'confirmed_at', 'show_to_parent', 'status', 'cancel_reason']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.inquiry_records), ['term_id', 'student_id', 'source_id', 'recorded_at', 'source', 'standards', 'subject', 'title', 'question', 'liked', 'progress', 'result_link', 'memo', 'file_id', 'name_mismatch', 'show_to_parent', 'status', 'cancel_reason']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.feedback), ['term_id', 'student_id', 'target_kind', 'target_id', 'content', 'teacher_email', 'status', 'cancel_reason']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.counsel.counsel_requests), ['term_id', 'student_id', 'requester_email', 'wish_dates', 'topic', 'memo', 'status', 'decided_date', 'linked_note_id', 'cancel_reason']);
  // 기존 열은 순서 그대로, 새 열만 끼움
  const notes = plain(ctx.SCHEMA.counsel.counsel_notes);
  assert.deepStrictEqual(notes.filter((c) => !['agreement', 'agreement_to_parent', 'profile_version', 'request_id'].includes(c)),
    ['student_id', 'date', 'teacher_email', 'type', 'target', 'linked_violation_id', 'content', 'show_to_parent', 'status', 'cancel_reason']);
  assert.deepStrictEqual(notes.slice(6, 11), ['content', 'agreement', 'agreement_to_parent', 'profile_version', 'request_id']);
  assert.deepStrictEqual(plain(ctx.SCHEMA.db.terms).filter((c) => c !== 'career_due'), ['name', 'type', 'start_date', 'end_date', 'memo']);
  ['career_profiles', 'course_plans', 'inquiry_records', 'feedback'].forEach((t) => {
    const h = plain(ctx.headersFor_('db', t));
    assert.strictEqual(h[0], 'id'); assert.deepStrictEqual(h.slice(-4), TAIL);
  });
  assert.deepStrictEqual(plain(ctx.headersFor_('counsel', 'counsel_requests')).slice(-4), TAIL);
});

const NEW_KEYS = ['career.view', 'career.submit', 'career.publish', 'career.list', 'plan.view', 'plan.edit', 'plan.confirm', 'plan.publish',
  'inquiry.view', 'inquiry.upload', 'inquiry.progress', 'inquiry.publish', 'inquiry.cleanup', 'feedback.view', 'feedback.write', 'feedback.cancel',
  'counsel.request.create', 'counsel.request.cancel', 'counsel.request.view', 'counsel.request.list', 'counsel.request.decide',
  'counsel.note.view', 'counsel.agreement.publish', 'timeline.view'];

test('권한 키: 역할 표가 stage6-rules-draft 2절 그대로 — 출결 담당·근무표 담당은 어느 키에도 없고, 학부모는 보기 키 넷뿐(피드백·상담 신청은 못 봄)', () => {
  const p = plain(ctx.permissions_());
  const roles = (k) => p[k].roles.slice().sort();
  const want = {
    'career.view': ['admin', 'hall_teacher', 'homeroom', 'parent', 'student'], 'career.submit': ['student'], 'career.publish': ['student'], 'career.list': ['admin', 'hall_teacher'],
    'plan.view': ['admin', 'hall_teacher', 'homeroom', 'parent', 'student'], 'plan.edit': ['student'], 'plan.confirm': ['hall_teacher'], 'plan.publish': ['student'],
    'inquiry.view': ['admin', 'hall_teacher', 'homeroom', 'parent', 'student'], 'inquiry.upload': ['student'], 'inquiry.progress': ['student'], 'inquiry.publish': ['student'], 'inquiry.cleanup': ['admin'],
    'feedback.view': ['admin', 'hall_teacher', 'homeroom', 'student'], 'feedback.write': ['hall_teacher'], 'feedback.cancel': ['hall_teacher'],
    'counsel.request.create': ['student'], 'counsel.request.cancel': ['student'], 'counsel.request.view': ['admin', 'hall_teacher', 'homeroom', 'student'],
    'counsel.request.list': ['admin', 'hall_teacher'], 'counsel.request.decide': ['hall_teacher'],
    'counsel.note.view': ['parent', 'student'], 'counsel.agreement.publish': ['student'], 'timeline.view': ['admin', 'hall_teacher', 'homeroom']
  };
  assert.deepStrictEqual(NEW_KEYS.slice().sort(), Object.keys(want).sort());
  NEW_KEYS.forEach((k) => assert.deepStrictEqual(roles(k), want[k], k));
  NEW_KEYS.forEach((k) => ['attendance', 'duty_manager'].forEach((r) => assert.ok(!p[k].roles.includes(r), k + ' ' + r)));
  NEW_KEYS.forEach((k) => assert.ok(!p[k].wideView && !p[k].dutyWindow, k + ': 보기 범위를 넓히거나 근무일 범위를 쓰지 않는다'));
  NEW_KEYS.filter((k) => p[k].scope === 'student').forEach((k) => assert.strictEqual(p[k].noDuty, true, k + ' noDuty'));
  assert.deepStrictEqual(NEW_KEYS.filter((k) => p[k].roles.includes('parent')).sort(), ['career.view', 'counsel.note.view', 'inquiry.view', 'plan.view']);
  NEW_KEYS.filter((k) => /\.(submit|upload|progress|publish|edit|create|cancel|decide|write|confirm)$/.test(k) && k !== 'plan.edit').forEach((k) => assert.ok(!p[k].roles.includes('homeroom') && !p[k].roles.includes('parent'), k + ': 담임·학부모는 쓰지 못한다'));
});

test('setup: 새 탭 5개를 만들고, 옛 시트(terms·counsel_notes)에는 새 열만 제자리에 끼운다 — 두 번 돌려도 [탭 유지]', () => {
  const env = createGasEnv({ owner: OWNER });
  const setup = () => plain(env.asOwner((c) => c.setup())).map((x) => x.trim());
  const line = (r, sheet) => r.filter((l) => new RegExp('^\\[[^\\]]+\\] ' + sheet + '(:|$)').test(l.split('\n')[0]));
  const r0 = setup();
  ['career_profiles', 'course_plans', 'inquiry_records', 'feedback', 'counsel_requests'].forEach((t) => assert.deepStrictEqual(line(r0, t), ['[탭 생성] ' + t]));
  // 6단계 전(2단계 모양) 시트로 되돌리고 행을 넣는다
  const OLD_TERMS = ['id', 'name', 'type', 'start_date', 'end_date', 'memo'].concat(TAIL);
  const OLD_NOTES = ['id', 'student_id', 'date', 'teacher_email', 'type', 'target', 'linked_violation_id', 'content', 'show_to_parent', 'status', 'cancel_reason'].concat(TAIL);
  const write = (kind, name, header) => {
    const sh = env.file(kind).getSheetByName(name); sh.clear();
    const row = header.map((h) => h === 'id' ? 'a1b2c3d4-0000-4000-8000-000000000001' : h + '#1');
    sh.getRange(1, 1, 2, header.length).setNumberFormat('@').setValues([header, row]);
    return row;
  };
  const tRow = write('db', 'terms', OLD_TERMS), nRow = write('counsel', 'counsel_notes', OLD_NOTES);
  const r1 = setup();
  assert.deepStrictEqual(line(r1, 'terms'), ['[열 추가] terms: career_due']);
  assert.deepStrictEqual(line(r1, 'counsel_notes'), ['[열 추가] counsel_notes: agreement, agreement_to_parent, profile_version, request_id']);
  [['db', 'terms', OLD_TERMS, tRow], ['counsel', 'counsel_notes', OLD_NOTES, nRow]].forEach(([kind, name, old, row]) => {
    assert.deepStrictEqual(plain(env.sheetValues(name, kind)[0]), plain(env.asOwner((c) => c.headersFor_(kind, name))), name + ' 헤더');
    const now = env.rows(name, kind)[0];
    old.forEach((h, i) => assert.strictEqual(now[h], row[i], name + ' ' + h));
  });
  assert.strictEqual(env.rows('terms')[0].career_due, '');
  assert.strictEqual(env.rows('counsel_notes', 'counsel')[0].agreement, '');
  const r2 = setup();
  assert.deepStrictEqual(line(r2, 'terms'), ['[탭 유지] terms']); assert.deepStrictEqual(line(r2, 'counsel_notes'), ['[탭 유지] counsel_notes']);
  assert.ok(!r2.some((l) => /^\[(탭 생성|열 추가|경고)\]/.test(l)), JSON.stringify(r2));
});

test('audit_log: 6단계 글 칸은 글자 수만 남고(만들기·고치기·일괄 고치기), 글이 아닌 칸은 그대로', () => {
  const env = createGasEnv({ owner: OWNER });
  env.asOwner((c) => c.setup());
  const MARK = 'ZZ-표식';
  const aud = (sheet) => env.rows('audit_log').filter((a) => a.sheet === sheet);
  const fb = env.asOwner((c) => c.appendRecord_('feedback', { term_id: 't1', student_id: 's1', target_kind: '진로 프로필', target_id: 'p1', content: MARK + ' 피드백 내용', teacher_email: 'x@example.com', status: '유효' }, OWNER));
  env.asOwner((c) => c.updateRecord_('feedback', fb.id, { content: MARK + ' 고친 피드백' }, OWNER));
  env.asOwner((c) => c.bulkUpdateRecords_('feedback', [{ id: fb.id, patch: { content: MARK + ' 일괄 고침' } }], OWNER));
  env.asOwner((c) => c.updateRecord_('feedback', fb.id, { status: '취소', cancel_reason: '잘못 씀' }, OWNER));
  const prof = env.asOwner((c) => c.appendRecord_('career_profiles', { term_id: 't1', student_id: 's1', version: '1', hopes: MARK + '[희망]', targets: MARK + '[목표]', interests: MARK + ' 관심', strengths: MARK + ' 강점', concerns: MARK + ' 고민', parent_fields: 'hopes', submitted_at: '2027-03-05T10:00:00', status: '유효' }, OWNER));
  env.asOwner((c) => c.appendRecord_('inquiry_records', { term_id: 't1', student_id: 's1', source_id: 'src1', title: MARK + ' 제목', question: MARK + ' 질문', memo: MARK + ' 메모', progress: '관심', status: '유효' }, OWNER));
  env.asOwner((c) => c.appendRecord_('counsel_requests', { term_id: 't1', student_id: 's1', requester_email: 'a@example.com', wish_dates: '2027-04-01', topic: '진로', memo: MARK + ' 신청 메모', status: '신청' }, OWNER, 'counsel'));
  const all = env.rows('audit_log').filter((a) => /feedback|career_profiles|inquiry_records|counsel_requests/.test(a.sheet));
  assert.ok(all.length >= 7);
  all.forEach((a) => assert.ok(!(a.before + a.after + a.detail).includes(MARK), a.sheet + ' ' + a.action + ': 글 내용이 audit에 있다'));
  assert.ok(aud('feedback').some((a) => a.action === 'create' && a.after.includes('(내용 생략, ' + (MARK + ' 피드백 내용').length + '자)')));
  assert.ok(aud('feedback').some((a) => a.action === 'update' && a.before.includes('(내용 생략, ' + (MARK + ' 피드백 내용').length + '자)') && a.after.includes('(내용 생략, ' + (MARK + ' 고친 피드백').length + '자)')));
  assert.ok(aud('feedback').some((a) => a.action === 'bulk_update' && a.after.includes('(내용 생략, ' + (MARK + ' 일괄 고침').length + '자)')));
  assert.ok(aud('feedback').some((a) => a.action === 'update' && a.after.includes('"status":"취소"') && a.after.includes('"cancel_reason":"잘못 씀"')), '글이 아닌 칸은 그대로');
  assert.ok(aud('career_profiles')[0].after.includes('"parent_fields":"hopes"') && /"hopes":"\(내용 생략, \d+자\)"/.test(aud('career_profiles')[0].after));
  assert.ok(/"memo":"\(내용 생략, \d+자\)"/.test(aud('counsel/counsel_requests')[0].after) && aud('counsel/counsel_requests')[0].after.includes('"wish_dates":"2027-04-01"'));
  assert.ok(prof.id);
});

test('권한 판정(requirePermission_): 6단계 키 × 역할 — 학생은 본인만, 학부모는 자녀 보기 넷만, 담당교사는 담당 학생만, 담임은 자기 반 보기만, 출결 담당·근무표 담당은 모두 거부', () => {
  const env = createGasEnv({ owner: OWNER });
  env.seedFake();
  const ST = 'test.student@example.com', T1 = 'test.teacher@example.com', HR = 'test.homeroom@example.com',
    AD = 'test.admin@example.com', AT = 'test.attendance@example.com', DU = 'test.duty@example.com';
  env.asOwner((c) => { c.addUser(AD, '시험 관리자', 'admin'); c.addUser(AT, '시험 출결', 'attendance'); c.addUser(DU, '시험 근무표', 'duty_manager'); });
  const students = env.rows('students'), users = env.rows('users');
  const own = students.find((s) => s.email === ST);
  const term = env.rows('terms')[0];
  const enr = env.rows('enrollments').filter((e) => e.term_id === term.id);
  const mineIds = enr.filter((e) => e.teacher_email === T1).map((e) => e.student_id);
  const hrClass = users.find((u) => u.email === HR).homeroom_class;
  const inHr = (s) => (s.grade + '-' + s.class_no) === hrClass;
  assert.ok(own && mineIds.length && hrClass);
  const other = students.find((s) => s.id !== own.id && !mineIds.includes(s.id) && !inHr(s));   // 담당도 아니고 담임 반도 아니고 본인도 아닌 학생
  const mine = students.find((s) => mineIds.includes(s.id)), inClass = students.find(inHr), outClass = students.find((s) => !inHr(s));
  assert.ok(other && mine && inClass && outClass);
  const can = (who, key, sid) => { try { env.as(who, (c) => c.requirePermission_(key, sid ? { studentId: sid } : {})); return true; } catch (e) { return false; } };
  const STUDENT_WRITE = ['career.submit', 'career.publish', 'plan.edit', 'plan.publish', 'inquiry.upload', 'inquiry.progress', 'inquiry.publish', 'counsel.request.create'];
  const VIEW4 = ['career.view', 'plan.view', 'inquiry.view', 'counsel.note.view'];
  // 학생: 본인 학생 키는 허용, 남의 학생은 거부, 교사 키는 거부
  [...STUDENT_WRITE, ...VIEW4, 'feedback.view', 'counsel.request.view'].forEach((k) => { assert.ok(can(ST, k, own.id), 'student own ' + k); assert.ok(!can(ST, k, other.id), 'student other ' + k); });
  ['feedback.write', 'plan.confirm', 'counsel.request.decide', 'timeline.view', 'career.list', 'counsel.request.list', 'inquiry.cleanup'].forEach((k) => assert.ok(!can(ST, k, own.id), 'student ' + k));
  assert.ok(can(ST, 'counsel.request.cancel') && can(ST, 'counsel.agreement.publish'), '행 id만 받는 학생 키는 역할만 본다(본인 확인은 함수 안)');
  // 학부모: 자녀의 보기 키 넷만
  const linked = env.rows('guardian_links').filter((g) => g.parent_email === PA).map((g) => g.student_id);
  const child = students.find((s) => linked.includes(s.id)), stranger = students.find((s) => !linked.includes(s.id));
  assert.ok(child && stranger);
  VIEW4.forEach((k) => { assert.ok(can(PA, k, child.id), 'parent child ' + k); assert.ok(!can(PA, k, stranger.id), 'parent other ' + k); });
  NEW_KEYS.filter((k) => !VIEW4.includes(k)).forEach((k) => assert.ok(!can(PA, k, child.id), 'parent ' + k));
  // 학사 교사: 담당 학생만(보기·피드백·확정·상담 신청 처리·타임라인), 학생 쓰기 키는 거부
  ['career.view', 'plan.view', 'inquiry.view', 'feedback.view', 'feedback.write', 'plan.confirm', 'counsel.request.view', 'counsel.request.decide', 'timeline.view'].forEach((k) => {
    assert.ok(can(T1, k, mine.id), 'teacher assigned ' + k); assert.ok(!can(T1, k, other.id), 'teacher not assigned ' + k);
  });
  [...STUDENT_WRITE, 'counsel.note.view', 'inquiry.cleanup'].forEach((k) => assert.ok(!can(T1, k, mine.id), 'teacher ' + k));
  assert.ok(can(T1, 'career.list') && can(T1, 'counsel.request.list') && can(T1, 'feedback.cancel'));
  // 담임: 자기 반 보기만
  ['career.view', 'plan.view', 'inquiry.view', 'feedback.view', 'counsel.request.view', 'timeline.view'].forEach((k) => {
    assert.ok(can(HR, k, inClass.id), 'homeroom own class ' + k); assert.ok(!can(HR, k, outClass.id), 'homeroom other class ' + k);
  });
  ['feedback.write', 'plan.confirm', 'counsel.request.decide', ...STUDENT_WRITE].forEach((k) => assert.ok(!can(HR, k, inClass.id), 'homeroom ' + k));
  // 관리자: 모든 학생 보기, 학생·담당교사 쓰기는 거부(역할 불일치), 정리 대상은 관리자만
  ['career.view', 'plan.view', 'inquiry.view', 'feedback.view', 'counsel.request.view', 'timeline.view'].forEach((k) => assert.ok(can(AD, k, other.id), 'admin ' + k));
  ['feedback.write', 'plan.confirm', 'counsel.request.decide', ...STUDENT_WRITE].forEach((k) => assert.ok(!can(AD, k, other.id), 'admin ' + k));
  assert.ok(can(AD, 'inquiry.cleanup') && can(AD, 'career.list'));
  // 출결 담당·근무표 담당: 어느 키도 안 된다
  NEW_KEYS.forEach((k) => { assert.ok(!can(AT, k, mine.id), 'attendance ' + k); assert.ok(!can(DU, k, mine.id), 'duty_manager ' + k); });
  // 거부는 audit_log에 남는다
  assert.ok(env.auditActions('denied:career.view').length >= 1);
});
