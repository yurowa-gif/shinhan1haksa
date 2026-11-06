/**
 * 출석부 모델 모양 검사(docs/contracts/sheet-model.md). 소유: DESIGN. *.test.js 가 아니라서 실행기가 직접 돌리지 않는다.
 * C7의 tests/features/sheet_model_contract.test.js 와 같은 계약을 따로 검사한다(DESIGN 픽스처가 계약을 지키는지 확인용).
 * @return {string[]} 어긋난 곳 목록(없으면 빈 배열)
 */
const HM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['seat', 'pillar', 'door', 'window'];
const CODES = ['EXC', 'FIXED', 'END', 'NONE'];

function validateSheetModel(m) {
  const e = [];
  const add = (msg) => e.push(msg);
  if (!m || typeof m !== 'object') return ['모델이 객체가 아니다'];
  if (!YMD.test(m.date || '')) add('date 형식');
  if (['월', '화', '수', '목', '금', '토', '일'].indexOf(m.weekdayKo) < 0) add('weekdayKo');
  if (typeof m.dayType !== 'string' || !m.dayType) add('dayType');
  if (typeof m.operating !== 'boolean') add('operating');
  if (typeof m.title !== 'string' || !m.title) add('title');
  if (!Array.isArray(m.dutyNames) || m.dutyNames.some((x) => typeof x !== 'string')) add('dutyNames');
  if (!Array.isArray(m.warnings) || m.warnings.some((x) => typeof x !== 'string')) add('warnings');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(m.generatedAt || '')) add('generatedAt 형식');
  if (!Array.isArray(m.legend) || !m.legend.length || m.legend.some((l) => !l || typeof l.mark !== 'string' || typeof l.text !== 'string')) add('legend');
  if (!Array.isArray(m.unseated) || m.unseated.some((u) => !u || typeof u.display !== 'string' || !/^[1-3]\. \S/.test(u.display))) add('unseated');
  if (!Array.isArray(m.blocks)) { add('blocks'); return e; }
  m.blocks.forEach((b, i) => {
    if (b.seq !== i + 1) add('blocks[' + i + '].seq 는 1부터 차례로');
    if (!HM.test(b.start || '') || !HM.test(b.end || '') || b.start >= b.end) add('blocks[' + i + '] 시각');
    if (typeof b.label !== 'string' || !b.label) add('blocks[' + i + '].label');
  });
  if (!m.operating) {
    if (m.blocks.length || (m.spaces || []).length) add('운영 안 하는 날은 blocks·spaces 가 비어야 한다');
    return e;
  }
  if (!m.blocks.length) add('운영하는 날인데 blocks 가 없다');
  if (!Array.isArray(m.spaces) || !m.spaces.length) { add('spaces'); return e; }
  m.spaces.forEach((sp, si) => {
    const w = 'spaces[' + si + ']';
    if (!sp.id || !sp.name) add(w + ' id·name');
    if (['남', '여', '혼성'].indexOf(sp.gender) < 0) add(w + '.gender');
    if (!Number.isInteger(sp.rows) || !Number.isInteger(sp.cols) || sp.rows < 1 || sp.cols < 1) add(w + ' rows·cols');
    const seen = {};
    (sp.cells || []).forEach((c, ci) => {
      const cw = w + '.cells[' + ci + ']';
      if (!(c.row >= 1 && c.row <= sp.rows && c.col >= 1 && c.col <= sp.cols)) add(cw + ' 격자 밖');
      const key = c.row + ',' + c.col;
      if (seen[key]) add(cw + ' 같은 칸이 두 번'); seen[key] = true;
      if (KINDS.indexOf(c.kind) < 0) add(cw + '.kind');
      if (typeof c.seatLabel !== 'string') add(cw + '.seatLabel');
      const seat = c.kind === 'seat';
      if (seat && !c.seatLabel) add(cw + ' 좌석인데 seatLabel 이 없다');
      if (!seat && c.seatLabel !== '') add(cw + ' 좌석이 아닌데 seatLabel');
      if (c.occupant !== null) {
        const o = c.occupant;
        if (!seat) add(cw + ' 좌석이 아닌데 occupant');
        else if (!o || !(o.grade >= 1 && o.grade <= 3) || typeof o.name !== 'string' || o.display !== o.grade + '. ' + o.name) add(cw + '.occupant');
        else if (Object.keys(o).sort().join() !== 'display,grade,name') add(cw + '.occupant 에 학년·이름·display 말고 다른 키(개인정보)');
      }
      if (c.vacant !== (seat && c.occupant === null)) add(cw + '.vacant');
      const need = seat ? m.blocks.length : 0;
      if (!Array.isArray(c.marks) || c.marks.length !== need) { add(cw + '.marks 길이'); return; }
      c.marks.forEach((mk, i) => {
        if (mk.seq !== i + 1) add(cw + '.marks[' + i + '].seq');
        if (CODES.indexOf(mk.code) < 0) add(cw + '.marks[' + i + '].code');
        if (typeof mk.text !== 'string') add(cw + '.marks[' + i + '].text');
        else if ((mk.code === 'NONE') !== (mk.text === '')) add(cw + '.marks[' + i + '] NONE 이면 빈 글자, 아니면 글자가 있어야 한다');
        if (c.vacant && mk.code !== 'NONE') add(cw + ' 공석인데 칸이 채워짐');
      });
    });
  });
  try { if (JSON.stringify(JSON.parse(JSON.stringify(m))) !== JSON.stringify(m)) add('JSON으로 바꿔도 같지 않다'); } catch (x) { add('JSON 변환 실패'); }
  return e;
}

module.exports = { validateSheetModel };
