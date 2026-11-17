/**
 * 노출 감시 공용 도구(phone_leak·counsel_leak). 공개 함수 목록·인자 만들기·응답을 글로 펴기·시트 전체 글.
 *   readFunctions()                  화면용 get·list·preview 공개 함수와 매개변수 이름
 *   argSets(fn, ctx)                 매개변수 이름으로 넣어 볼 인자 벌(ctx = {today, termIds, studentIds, roles, headId, spaceId})
 *   textOf(v)                        응답을 글 하나로(base64 칸은 풀어서 — 출력물)
 *   sheetText(env, propKey)          스크립트 속성 propKey(DB_ID 등)가 가리키는 스프레드시트의 모든 탭 글
 */
const fs = require('fs');
const path = require('path');

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

function argSets(fn, ctx) {
  const t = ctx.today;
  const val = {
    date: [t], ymd: [t], month: [t.slice(0, 7), '2027-01'], termId: ctx.termIds, studentId: ctx.studentIds,
    names: [true], role: ctx.roles, filter: [{}].concat(ctx.termIds.map((x) => ({ termId: x }))), format: [undefined, 'xlsx'],
    seed: [7], fixedSeatIds: [[]], assignments: [[]], headId: [ctx.headId], spaceId: [ctx.spaceId], cells: [[]],
    input: ctx.studentIds.slice(0, 4).map((s) => ({ studentId: s, date: t, ymd: t, termId: ctx.termIds[0] })),
    text: [''], opts: [{}]
  };
  let sets = [[]];
  fn.params.forEach((p) => {
    const vs = val[p] || [undefined];
    sets = sets.flatMap((s) => vs.map((v) => s.concat([v])));
  });
  return sets.map((s) => { while (s.length && s[s.length - 1] === undefined) s.pop(); return s; });
}

function sheetText(env, propKey) {
  const ss = env.spreadsheets[env.scriptProps[propKey]];
  return ss ? JSON.stringify(ss._sheets.map((s) => [s._name, s._data])) : '';
}

module.exports = { textOf, readFunctions, argSets, sheetText };
