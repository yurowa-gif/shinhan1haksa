/**
 * T7 학생·학부모 시험 도구(docs/plan/stage7.md, 결정 82·83). 가짜 데이터만.
 *
 *   portalAccounts(env)
 *     seedFakeData 뒤에 부른다. 가짜 학생 1·2·3번을 학생 계정(A·B·C)으로, 그 보호자 둘을 학부모 계정으로 users에 올린다.
 *     1·2번은 형제라 보호자가 같다 → P1은 자녀 둘(A·B), P2는 자녀 하나(C).
 *     이메일은 가짜 데이터에 이미 있는 것(students.email, guardian_links.parent_email)을 그대로 쓴다.
 *     → {A, B, C: {email, id, name, studentNo}, P1, P2: {email, childIds}, students: [A,B,C], parents: [P1,P2], all: [...] }
 *   visibleIds(acc, email)        그 계정이 볼 수 있는 학생 id(학생: 본인, 학부모: 자녀)
 *   plantPhones(env)              students.phone·guardian_links.phone 칸에 가짜 번호(010-0000-xxxx)를 감사 기록 없이 심는다 → 번호 목록
 *   portalMatrix(env, acc, ctx)   계정 × 화면용 읽기 공개 함수(get·list·preview) × 인자 → [{who, fn, args, outcome, text}]
 *                                 outcome: 'ok' | 'denied'(공통 거부 문구) | 'error'(다른 오류). ctx = {today, termIds}
 *                                 studentId 인자는 모든 학생 id 대신 A·B·C와 가짜 학생 4번(아무와도 연결 안 됨)만 넣는다.
 *   portalLeaks(env, rows, acc, opts)
 *     응답(오류 문구 포함)에서 그 계정이 볼 수 없는 것을 찾는다 → ['누가 함수(인자) → 무엇']
 *       - 다른 학생의 이름·학번·id(본인·자녀는 허용)
 *       - 가짜 전화번호(opts.phones: 본인·자녀 것도 지금은 금지 — 결정 76 학생·학부모 공개는 6.1 뒤)
 *       - opts.markers: 응답에 나오면 안 되는 글(상담 내용 표시 등)
 *   summarize(rows)               {email: {fn: 'ok'|'denied'|'error'|'mixed'}} — 권한 행렬 표
 */
const { plain } = require('./harness');
const { textOf, readFunctions, argSets } = require('./leak-scan');

const PHONE_RE = /010[-. ]?0000[-. ]?(\d{4})/g;

function portalAccounts(env) {
  const byId = Object.fromEntries(env.rows('students').map((x) => [x.id, x]));
  const students = [1, 2, 3, 4].map((n) => byId['bbbbbbbb-0000-4000-8000-' + ('000000000000' + n.toString(16)).slice(-12)]);   // FakeData.gs fakeId_('bbbbbbbb', n)
  const links = env.rows('guardian_links');
  const parentOf = (sid) => links.filter((g) => g.student_id === sid).map((g) => g.parent_email);
  const [s1, s2, s3, s4] = students;
  if (!s1 || !s2 || !s3 || !s4 || parentOf(s1.id)[0] !== parentOf(s2.id)[0] || parentOf(s3.id)[0] === parentOf(s1.id)[0]) {
    throw new Error('[portal] 가짜 학생 1·2번이 형제(같은 보호자), 3번은 다른 보호자여야 합니다: ' + JSON.stringify(students.map((s) => s && [s.id, parentOf(s.id)])));
  }
  const st = (s) => ({ email: s.email, id: s.id, name: s.name, studentNo: s.student_no });
  const acc = { A: st(s1), B: st(s2), C: st(s3), outsider: st(s4) };
  acc.P1 = { email: parentOf(s1.id)[0], childIds: [s1.id, s2.id] };
  acc.P2 = { email: parentOf(s3.id)[0], childIds: [s3.id] };
  acc.students = [acc.A, acc.B, acc.C];
  acc.parents = [acc.P1, acc.P2];
  acc.all = acc.students.concat(acc.parents);
  env.asOwner((c) => {
    acc.students.forEach((s, i) => c.addUser(s.email, '가짜 학생 계정 ' + 'ABC'[i], 'student'));
    acc.parents.forEach((p, i) => c.addUser(p.email, '가짜 학부모 계정 ' + (i + 1), 'parent'));
  });
  return acc;
}

function visibleIds(acc, email) {
  const s = acc.students.find((x) => x.email === email);
  if (s) return [s.id];
  const p = acc.parents.find((x) => x.email === email);
  return p ? p.childIds.slice() : [];
}

function plantPhones(env) {
  const out = [];
  [['students', 1000], ['guardian_links', 2000]].forEach(([tab, base]) => {
    const col = (env.sheetValues(tab)[0] || []).map(String).indexOf('phone') + 1;
    if (!col) return;
    env.asOwner((c) => c.withLock_(() => {
      const sh = c.getSheet_('db', tab);
      c.readAll_(tab).forEach((r, i) => {
        const phone = '010-0000-' + String(base + i);
        sh.getRange(r._row, col).setNumberFormat('@').setValue(phone);
        out.push(phone);
      });
    }));
  });
  return out;
}

function portalMatrix(env, acc, ctx) {
  const ids = acc.students.map((s) => s.id).concat(acc.outsider.id);
  const rows = [];
  for (const who of acc.all.map((x) => x.email)) {
    const roles = acc.parents.some((p) => p.email === who) ? ['parent'] : ['student'];
    for (const fn of readFunctions()) {
      for (const args of argSets(fn, { today: ctx.today, termIds: ctx.termIds, studentIds: ids, roles, headId: 'x', spaceId: 'x' })) {
        let out, outcome = 'ok';
        try { out = plain(env.call(who, fn.name, ...args)); } catch (e) { out = e.message; outcome = e.message === env.ctx.DENIED_MESSAGE ? 'denied' : 'error'; }
        rows.push({ who, fn: fn.name, args, outcome, text: textOf(out) });
      }
    }
  }
  return rows;
}

function portalLeaks(env, rows, acc, opts) {
  opts = opts || {};
  const students = env.rows('students');
  const leaks = [];
  for (const r of rows) {
    const mine = visibleIds(acc, r.who);
    const myNames = new Set(students.filter((s) => mine.includes(s.id)).map((s) => s.name));
    const found = [];
    for (const s of students) {
      if (mine.includes(s.id)) continue;
      if (r.text.includes(s.id)) found.push('id ' + s.id);
      if (s.student_no && r.text.includes(s.student_no)) found.push('학번 ' + s.student_no);
      if (s.name && !myNames.has(s.name) && r.text.includes(s.name)) found.push('이름 ' + s.name);
    }
    for (const m of r.text.matchAll(PHONE_RE)) found.push('전화 010-0000-' + m[1]);
    for (const k of opts.markers || []) if (r.text.includes(k)) found.push('표시 ' + k);
    if (found.length) leaks.push(r.who + ' ' + r.fn + '(' + JSON.stringify(r.args).slice(0, 80) + ') → ' + [...new Set(found)].join(', '));
  }
  return leaks;
}

function summarize(rows) {
  const out = {};
  for (const r of rows) {
    const m = out[r.who] = out[r.who] || {};
    m[r.fn] = m[r.fn] === undefined || m[r.fn] === r.outcome ? r.outcome : 'mixed';
  }
  return out;
}

module.exports = { portalAccounts, visibleIds, plantPhones, portalMatrix, portalLeaks, summarize, PHONE_RE };
