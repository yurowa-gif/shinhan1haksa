/**
 * 전화번호 노출 감시(결정 76, T5·S4-0 대비). 가짜 번호는 010-0000-xxxx(실제와 겹치지 않는 형식)만 쓴다.
 * 보이는 사람: 그 학생의 담당교사·관리자·그날 근무교사. 학생·학부모는 자기 것만(6.1 뒤). 그 밖의 역할은 하나도 안 된다.
 * 출력물·메일·감사 기록 상세에는 누구에게도 넣지 않는다.
 *
 * 방법: students.phone·guardian_links.phone 열이 있으면(S4-0 뒤) 학생·보호자마다 다른 가짜 번호를 심고,
 * 모든 역할 × 읽기·미리보기 공개 함수(get·list·preview, 인자는 매개변수 이름으로 채움)의 응답(오류 문구 포함, base64는 풀어서)을
 * 훑어 나온 번호가 그 사람이 볼 수 있는 번호 안에 있는지 본다. 열이 아직 없으면 심을 곳이 없어 응답에 번호가 없음만 확인한다.
 * 저장 함수(save·commit·cancel 등)의 응답은 이 파일이 부르지 않는다(인자를 맞춰야 해서 각 기능 흐름 시험이 맡는다).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');

const ADMIN = 'owner@example.com', HALL = 'test.teacher@example.com', HOMEROOM = 'test.homeroom@example.com';
const STUDENT = 'test.student@example.com', PARENT = 'test.parent@example.com';
const ATT = 'test.attendance@example.com', DUTYM = 'test.duty@example.com', FT2 = 'fake.teacher2@example.com';
const TODAY = '2027-03-09';

/** 가짜 번호 형식(구분자가 없거나 점·빈칸이어도) → '010-0000-1234'로 맞춘 목록 */
const PHONE_RE = /010[-. ]?0000[-. ]?(\d{4})/g;
function phonesIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(PHONE_RE)) out.add('010-0000-' + m[1]);
  return out;
}
/** 응답 전체를 글로: base64 칸은 풀어서(출력물) 함께 */
function textOf(v) {
  const parts = [];
  const walk = (x, key) => {
    if (typeof x === 'string') {
      parts.push(x);
      if (/base64/i.test(key || '') && /^[A-Za-z0-9+/=\s]+$/.test(x)) parts.push(Buffer.from(x, 'base64').toString('utf8'));
    } else if (Array.isArray(x)) x.forEach((y) => walk(y, key));
    else if (x && typeof x === 'object') Object.keys(x).forEach((k) => walk(x[k], k));
  };
  walk(v, '');
  return parts.join('\n');
}

/** 공개 함수 중 화면에서 부르는 읽기·미리보기(get·list·preview)와 그 매개변수 이름 */
function readFunctions() {
  const reg = {};
  const add = (j) => Object.assign(reg, j.functions || {});
  add(JSON.parse(fs.readFileSync(path.join(__dirname, '../public-api.json'), 'utf8')));
  const dir = path.join(__dirname, '../public-api.d');
  fs.readdirSync(dir).filter((f) => f.endsWith('.json')).forEach((f) => add(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
  const sigs = {};
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!p.endsWith('.gs')) return;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/^function ([A-Za-z0-9]+)\(([^)]*)\)/gm)) sigs[m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  });
  walk(path.join(__dirname, '../../src'));
  return Object.keys(reg).filter((n) => reg[n].use === '화면' && /^(get|list|preview)/.test(n) && sigs[n]).map((n) => ({ name: n, params: sigs[n] }));
}

function seededEnv() {
  const env = createGasEnv({ owner: ADMIN, now: TODAY + 'T15:00:00' });
  Object.assign(env.scriptProps, { TEST_TEACHER_EMAIL: HALL, TEST_HOMEROOM_EMAIL: HOMEROOM, TEST_STUDENT_EMAIL: STUDENT, TEST_PARENT_EMAIL: PARENT });
  env.asOwner((c) => c.setup());
  env.asOwner((c) => c.seedFakeData());
  env.asOwner((c) => c.seedFakeStage1());
  env.asOwner((c) => c.seedFakeStage2());
  env.asOwner((c) => c.seedFakeStage3());
  env.asOwner((c) => { c.addUser(ATT, '시험 출결', 'attendance'); c.addUser(DUTYM, '시험 근무표', 'duty_manager'); });
  return env;
}

/**
 * students.phone·guardian_links.phone 열이 있으면 가짜 번호를 칸에 바로 심는다(감사 기록을 남기지 않게 — 감사 검사는 앱이 쓴 줄만 본다)
 * → {student: {id: 번호}, guardian: {linkId: 번호}, planted}
 */
function plantPhones(env) {
  const header = (tab) => (env.sheetValues(tab)[0] || []).map(String);
  const out = { student: {}, guardian: {}, planted: 0 };
  const plant = (tab, base, into) => {
    const col = header(tab).indexOf('phone') + 1;
    if (!col) return;
    env.as(ADMIN, (c) => c.withLock_(() => {
      const sh = c.getSheet_('db', tab);
      c.readAll_(tab).forEach((r, i) => {
        const phone = '010-0000-' + String(base + i);
        sh.getRange(r._row, col).setNumberFormat('@').setValue(phone);
        into[r.id] = phone; out.planted++;
      });
    }));
  };
  plant('students', 1000, out.student);
  plant('guardian_links', 2000, out.guardian);
  return out;
}

/** 이 사람이 볼 수 있는 번호(결정 76) */
function allowedPhones(env, email, phones) {
  const user = env.rows('users').find((u) => u.email === email);
  const roles = user ? String(user.roles).split(',').map((s) => s.trim()) : [];
  const all = new Set(Object.values(phones.student).concat(Object.values(phones.guardian)));
  if (roles.includes('admin')) return all;
  const termId = env.as(ADMIN, (c) => (c.getCurrentTerm_() || {}).id);
  const links = env.rows('guardian_links');
  const ofStudent = (sid) => [phones.student[sid]].concat(links.filter((g) => g.student_id === sid).map((g) => phones.guardian[g.id])).filter(Boolean);
  const ok = new Set();
  if (roles.includes('hall_teacher')) {
    if (env.as(ADMIN, (c) => c.isOnDutyFor_(email, '', 0))) return all;   // 그날 근무교사
    env.rows('enrollments').filter((e) => e.term_id === termId && e.teacher_email === email).forEach((e) => ofStudent(e.student_id).forEach((p) => ok.add(p)));
  }
  const me = env.rows('students').find((s) => s.email === email);   // 학생: 자기 번호와 자기 보호자 번호
  if (me) ofStudent(me.id).forEach((p) => ok.add(p));
  links.filter((g) => g.parent_email === email).forEach((g) => { ok.add(phones.guardian[g.id]); ok.add(phones.student[g.student_id]); });   // 학부모: 자기 자녀
  ok.delete(undefined);
  return ok;
}

/** 매개변수 이름 → 넣어 볼 값 목록(한 함수에 여러 벌) */
function argSets(fn, ctx, roles) {
  const val = {
    date: [TODAY], ymd: [TODAY], month: [TODAY.slice(0, 7), '2027-01'], termId: ctx.termIds, studentId: ctx.studentIds,
    names: [true], role: roles, filter: [{}].concat(ctx.termIds.map((t) => ({ termId: t }))), format: [undefined, 'xlsx'],
    seed: [7], fixedSeatIds: [[]], assignments: [[]], headId: [ctx.headId], spaceId: [ctx.spaceId], cells: [[]],
    input: ctx.studentIds.slice(0, 4).map((s) => ({ studentId: s, date: TODAY, ymd: TODAY, termId: ctx.termIds[0] })),
    text: [''], opts: [{}]
  };
  let sets = [[]];
  fn.params.forEach((p) => {
    const vs = val[p] || [undefined];
    sets = sets.flatMap((s) => vs.map((v) => s.concat([v])));
  });
  return sets.map((s) => { while (s.length && s[s.length - 1] === undefined) s.pop(); return s; });
}

test('가짜 번호 찾기: 010-0000-xxxx를 구분자 없이·점·빈칸으로 써도 찾고, base64로 감싼 출력물 안도 찾는다(감시 도구 자체 확인)', () => {
  assert.deepStrictEqual([...phonesIn('a 010-0000-1234 b 01000001235 c 010.0000.1236 d 010 0000 1237')], ['010-0000-1234', '010-0000-1235', '010-0000-1236', '010-0000-1237']);
  assert.deepStrictEqual([...phonesIn(textOf({ pdf: { base64: Buffer.from('<td>010-0000-1999</td>').toString('base64') } }))], ['010-0000-1999']);
  assert.strictEqual(phonesIn('010-1234-5678 02-0000-1234').size, 0, '실제 형식·다른 국번은 세지 않는다');
});

test('전화번호 노출 감시: 모든 역할 × 읽기·미리보기 공개 함수 응답에 볼 수 없는 번호가 없다(담당교사·관리자·그날 근무교사·본인만), 출력물·메일·감사 상세에는 누구 번호도 없다', () => {
  const env = seededEnv();
  const phones = plantPhones(env);
  const cols = ['students', 'guardian_links'].map((t) => (env.sheetValues(t)[0] || []).map(String).includes('phone'));
  if (cols[0]) assert.strictEqual(Object.keys(phones.student).length, env.rows('students').length, '학생마다 번호를 심었다');
  if (cols[1]) assert.strictEqual(Object.keys(phones.guardian).length, env.rows('guardian_links').length, '보호자 연결마다 번호를 심었다');

  const fns = readFunctions();
  assert.ok(fns.length >= 30, '읽기·미리보기 공개 함수 ' + fns.length);
  const terms = env.rows('terms');
  const ctx = {
    termIds: terms.map((t) => t.id),
    studentIds: env.rows('students').map((s) => s.id),
    headId: (env.rows('status_changes')[0] || {}).id || 'x',
    spaceId: (env.rows('spaces')[0] || {}).id || 'x'
  };
  const people = [ADMIN, HALL, FT2, HOMEROOM, ATT, DUTYM, STUDENT, PARENT, 'nobody@example.com'];
  const seen = {}, leaks = [];
  let calls = 0, answered = 0;
  for (const who of people) {
    const user = env.rows('users').find((u) => u.email === who);
    const roles = user ? String(user.roles).split(',').map((s) => s.trim()) : ['student'];
    const allowed = allowedPhones(env, who, phones);
    for (const fn of fns) {
      for (const args of argSets(fn, ctx, roles)) {
        calls++;
        let out;
        try { out = plain(env.call(who, fn.name, ...args)); answered++; } catch (e) { out = e.message; }
        for (const p of phonesIn(textOf(out))) {
          seen[p] = true;
          if (!allowed.has(p)) leaks.push(who + ' ' + fn.name + '(' + JSON.stringify(args).slice(0, 80) + ') → ' + p);
        }
      }
    }
  }
  assert.ok(answered > 100, '응답을 받은 호출 ' + answered + '/' + calls);
  assert.deepStrictEqual(leaks.slice(0, 20), [], '볼 수 없는 번호가 응답에 나옴(' + leaks.length + '건)');

  // 출력물(PDF·파일 함수)은 관리자에게도 번호 없음: 파일로 만들기 직전의 내용을 잡아 본다(gas-fakes는 Utilities.newBlob을 흉내 내지 않는다)
  const files = fns.filter((f) => /(Pdf|File)$/.test(f.name));
  assert.ok(files.length >= 3, '출력물 함수 ' + files.map((f) => f.name));
  let captured = 0;
  for (const fn of files) {
    for (const args of argSets(fn, ctx, ['admin'])) {
      const cap = [];
      env.as(ADMIN, (c) => {
        const U = c.Utilities;
        c.Utilities = Object.assign(Object.create(U), {
          newBlob: (d) => { cap.push(typeof d === 'string' ? d : Buffer.from(d || []).toString('utf8')); throw new Error('[phone_leak] 잡음'); },
          zip: (blobs) => { (blobs || []).forEach((b) => cap.push(b && b.getDataAsString ? b.getDataAsString() : String(b))); throw new Error('[phone_leak] 잡음'); }
        });
        try { c[fn.name](...args); } catch (e) { /* 잡은 뒤 멈춤 */ }
      });
      captured += cap.length;
      for (const p of phonesIn(cap.join('\n'))) leaks.push('출력물 ' + fn.name + '(' + JSON.stringify(args).slice(0, 60) + ') → ' + p);
    }
  }
  assert.ok(captured >= 3, '잡은 출력물 ' + captured);
  assert.deepStrictEqual(leaks.slice(0, 20), [], '출력물에 번호(' + leaks.length + '건)');

  // 메일·감사 기록 상세에는 아무 번호도 없다(관리자 것도)
  assert.deepStrictEqual([...phonesIn(JSON.stringify(env.mail))], [], '메일에 번호 없음');
  assert.deepStrictEqual([...phonesIn(JSON.stringify(env.rows('audit_log').map((a) => [a.action, a.detail, a.before, a.after])))], [], '감사 기록에 번호 없음');
});
