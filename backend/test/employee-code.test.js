const test = require('node:test');
const assert = require('node:assert/strict');

const {
  numericEmployeeCodeKey,
  buildEmployeeMapForDeviceCodes,
} = require('../src/utils/employeeCode');

test('numericEmployeeCodeKey strips leading zeros', () => {
  assert.equal(numericEmployeeCodeKey('017'), '17');
  assert.equal(numericEmployeeCodeKey('04'), '4');
  assert.equal(numericEmployeeCodeKey('40'), '40');
  assert.equal(numericEmployeeCodeKey('000'), '0');
  assert.equal(numericEmployeeCodeKey('EMP017'), null);
  assert.equal(numericEmployeeCodeKey(''), null);
});

test('device padded codes map to unpadded PunchPay employees', () => {
  const rows = [
    { id: 1, employee_code: '17', branch_id: 19 },
    { id: 2, employee_code: '4', branch_id: 19 },
    { id: 3, employee_code: '40', branch_id: 19 },
  ];
  const map = buildEmployeeMapForDeviceCodes(rows, ['017', '04', '040', '001']);
  assert.equal(map['017'].id, 1);
  assert.equal(map['04'].id, 2);
  assert.equal(map['040'].id, 3);
  assert.equal(map['001'], undefined);
});

test('exact match wins over a padded sibling code', () => {
  const rows = [
    { id: 1, employee_code: '17', branch_id: 19 },
    { id: 2, employee_code: '017', branch_id: 19 },
  ];
  const map = buildEmployeeMapForDeviceCodes(rows, ['017', '17', '0017']);
  assert.equal(map['017'].id, 2);
  assert.equal(map['17'].id, 1);
  assert.equal(map['0017'], undefined);
});
