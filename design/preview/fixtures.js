/**
 * 출석부 미리보기용 모델 픽스처 4종(평일·금·토·일)을 만든다 → design/fixtures/sheet-model.{mon_thu,fri,sat,sun}.json
 * 실행: node design/preview/fixtures.js   (결과 JSON은 Git에 올린다. 테스트가 이 스크립트와 같은 결과인지 확인한다)
 *
 * 입력은 가짜뿐: FakeSeats.gs 의 buildFakeSeatLayout_()(실제 자리배치도 구조)와 FakeData.gs 가짜 학생 30명.
 * 1층은 146석인데 가짜 학생은 30명이라 같은 이름을 반복해서 채운다(새 가짜 인물을 만들지 않는다).
 * 칸 채우기는 규칙이 아니라 모양 확인용 무늬다(병결·병결 외 1·무지·학·가·정상 종료가 골고루 나온다).
 */
const fs = require('fs');
const path = require('path');
const { loadGs, plain } = require('../../tests/helpers/harness');

const KIND = { 좌석: 'seat', 기둥: 'pillar', 비상문: 'door', 창문: 'window' };
const LEGEND = [
  { mark: '○', text: '출석' }, { mark: '×', text: '결석' }, { mark: '△', text: '지각' },
  { mark: '조', text: '조퇴(사유는 메모 칸에)' }, { mark: '학', text: '학원' }, { mark: '가', text: '가정' }
];
// 블록은 기본값(Schema.gs DEFAULT_BLOCKS·defaultBlockRows_)을 그대로 쓴다. 날짜·요일만 여기서 정한다.
const DAYS = {
  mon_thu: { date: '2027-03-03', weekdayKo: '수' },
  fri: { date: '2027-03-05', weekdayKo: '금' },
  sat: { date: '2027-03-06', weekdayKo: '토' },
  sun: { date: '2027-03-07', weekdayKo: '일' }
};

function defaultBlocks(dayType) {
  const ctx = loadGs(['src/Schema.gs']);
  return plain(ctx.defaultBlockRows_()).filter((r) => r.day_type === dayType)
    .map((r) => ({ seq: Number(r.seq), start: r.start, end: r.end, label: r.label }));
}

function buildModel(dayType) {
  const ctx = loadGs(['src/dev/FakeSeats.gs', 'src/dev/FakeData.gs']);
  const layout = plain(ctx.buildFakeSeatLayout_());
  const people = plain(ctx.buildFakeData_({}).students);
  const day = DAYS[dayType];
  const blocks = defaultBlocks(dayType);
  let n = 0; // 좌석 번호(공간을 넘어 이어짐: 무늬가 공간마다 다르게)
  const spaces = layout.spaces.map((sp) => {
    const cells = layout.seats.filter((s) => s.spaceKey === sp.key).map((s) => {
      const cell = { row: s.row, col: s.col, kind: KIND[s.kind], seatLabel: s.label, occupant: null, vacant: false, marks: [] };
      if (cell.kind !== 'seat') return cell;
      n++;
      if (n % 9 === 0) { // 공석(퇴실·미배정)
        cell.vacant = true;
        cell.marks = blocks.map((b) => ({ seq: b.seq, code: 'NONE', text: '' }));
        return cell;
      }
      const p = people[n % people.length];
      cell.occupant = { grade: Number(p.grade), name: p.name, display: p.grade + '. ' + p.name };
      cell.marks = blocks.map((b) => {
        const last = b.seq === blocks.length;
        if (n % 29 === 0) return { seq: b.seq, code: 'EXC', text: b.seq === 1 ? '병결 외 1' : '병결' };
        if (n % 13 === 0 && b.seq === 1) return { seq: b.seq, code: 'EXC', text: '무지' };
        if (n % 7 === 0 && b.seq === 2) return { seq: b.seq, code: 'FIXED', text: '학' };
        if (n % 11 === 0) return { seq: b.seq, code: 'FIXED', text: '가' };
        if (dayType === 'mon_thu' && last && n % 2 === 0) return { seq: b.seq, code: 'END', text: '정상 종료' };
        return { seq: b.seq, code: 'NONE', text: '' };
      });
      return cell;
    });
    return { id: 'space-' + sp.key, name: sp.name, gender: sp.gender, rows: sp.rows, cols: sp.cols, cells };
  });
  return {
    date: day.date, weekdayKo: day.weekdayKo, dayType, operating: true, title: '신한학사 출석부', dutyNames: [],
    blocks, legend: LEGEND, spaces, unseated: [{ display: '3. 박다솜' }], warnings: [], generatedAt: day.date + 'T17:40:00'
  };
}

function writeAll() {
  const dir = path.join(__dirname, '..', 'fixtures');
  fs.mkdirSync(dir, { recursive: true });
  Object.keys(DAYS).forEach((d) => {
    fs.writeFileSync(path.join(dir, 'sheet-model.' + d + '.json'), JSON.stringify(buildModel(d), null, 1) + '\n');
  });
}

if (require.main === module) { writeAll(); console.log('design/fixtures/sheet-model.{mon_thu,fri,sat,sun}.json 생성'); }
module.exports = { buildModel, DAYS };
