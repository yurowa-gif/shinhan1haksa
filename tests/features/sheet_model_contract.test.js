/** C7 출석부 모델 계약 검사(docs/contracts/sheet-model.md): 실제 모델과 DESIGN 픽스처가 같은 검사를 통과한다. 가짜 데이터만. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, plain } = require('../helpers/harness');
const { createGasEnv } = require('../helpers/gas-fakes');
const { validateSheetModel } = require('../design/sheet-model-shape');

const ROOT = path.join(__dirname, '..', '..');
const env = createGasEnv({ now: '2027-03-03T20:00:00' });
env.seedFake({ stage1: true });
const model = (d, names) => plain(env.asOwner((c) => c.sheetModelFor_(d, names))).model;

test('실제 모델: 평일·금·토·일·운영 안 하는 날 모두 계약을 통과하고 standbyNames·dutyNames는 문자열 배열', () => {
  ['2027-03-03', '2027-03-05', '2027-03-06', '2027-03-07', '2027-03-10'].forEach((d) => {
    const m = model(d);
    assert.deepStrictEqual(validateSheetModel(m), [], d + ' ' + JSON.stringify(validateSheetModel(m)));
    assert.deepStrictEqual(m.standbyNames, []); assert.deepStrictEqual(m.dutyNames, []);
  });
});

test('손으로 넣은 이름이 있어도 계약을 통과한다(모델 사본에만 들어가고 저장은 없다)', () => {
  const m = model('2027-03-03', { dutyNames: ['김가짜', '이가짜'], standbyNames: ['박가짜'] });
  assert.deepStrictEqual(validateSheetModel(m), []);
  assert.deepStrictEqual([m.dutyNames, m.standbyNames], [['김가짜', '이가짜'], ['박가짜']]);
  assert.deepStrictEqual(model('2027-03-03').dutyNames, [], '다음 모델에는 남지 않는다');
});

test('DESIGN 픽스처 4종도 같은 검사를 통과하고, 범례의 조퇴 문구는 결정 38대로다', () => {
  ['mon_thu', 'fri', 'sat', 'sun'].forEach((d) => {
    const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/fixtures/sheet-model.' + d + '.json'), 'utf8'));
    assert.deepStrictEqual(validateSheetModel(f), [], d);
  });
  const legend = model('2027-03-03').legend;
  assert.strictEqual(legend.find((l) => l.mark === '조').text, '조퇴(사유는 메모 칸에)');
  assert.deepStrictEqual(legend.map((l) => l.mark), ['○', '×', '△', '조', '학', '가']);
});
