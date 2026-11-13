const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEmployeeMapForDeviceCodes,
  devicePunchBranchAllowed,
} = require('../src/utils/employeeCode');
const { computeDayStatus } = require('../src/services/attendanceService');
const {
  validateCreateEmployee,
  validateUpdateEmployee,
} = require('../src/validators/employeeValidator');

const day = '2026-11-13';
const shift = {
  startHour: 9,
  startMinute: 0,
  endHour: 18,
  endMinute: 0,
  shiftMs: 9 * 60 * 60 * 1000,
  graceMs: 0,
  lunchMinutesAllotted: 0,
  halfDayHours: null,
  fullDayHours: null,
  attendanceMode: 'day_based',
};

function baseEmployee(overrides = {}) {
  return {
    name: 'Asha',
    employee_code: '17',
    basic_salary: 20000,
    join_date: '2026-01-01',
    branch_id: 1,
    ...overrides,
  };
}

test('home branch is always allowed to punch', () => {
  const employee = { id: 1, branch_id: 1, multi_branch_punch: false };
  assert.equal(devicePunchBranchAllowed(employee, 1), true);
  assert.equal(devicePunchBranchAllowed(employee, 2), false);
  assert.equal(devicePunchBranchAllowed(null, 1), false);
});

test('other branch is allowed only when multi-branch punch is on', () => {
  const employee = { id: 1, branch_id: 1, multi_branch_punch: true };
  assert.equal(devicePunchBranchAllowed(employee, 1), true);
  assert.equal(devicePunchBranchAllowed(employee, 2), true);
});

test('device code map keeps the multi-branch flag', () => {
  const map = buildEmployeeMapForDeviceCodes(
    [{ id: 4, employee_code: '17', branch_id: 1, multi_branch_punch: true }],
    ['017']
  );
  assert.equal(map['017'].id, 4);
  assert.equal(map['017'].multi_branch_punch, true);
  assert.equal(devicePunchBranchAllowed(map['017'], 2), true);
});

test('flagged employee punches on two devices count as one home-branch day', () => {
  const employee = { id: 9, branch_id: 1, multi_branch_punch: true, employee_code: '17' };
  const attempts = [
    { deviceBranchId: 1, punchTime: `${day}T09:05:00+05:30` },
    { deviceBranchId: 2, punchTime: `${day}T18:00:00+05:30` },
  ];

  const accepted = [];
  const rejected = [];
  for (const attempt of attempts) {
    if (!devicePunchBranchAllowed(employee, attempt.deviceBranchId)) {
      rejected.push(attempt);
      continue;
    }
    accepted.push({
      employee_id: employee.id,
      home_branch_id: employee.branch_id,
      branch_id: attempt.deviceBranchId,
      punch_time: attempt.punchTime,
      punch_type: accepted.length % 2 === 0 ? 'in' : 'out',
    });
  }

  assert.equal(rejected.length, 0);
  assert.equal(accepted.length, 2);
  assert.deepEqual(
    accepted.map((punch) => punch.home_branch_id),
    [1, 1]
  );
  assert.deepEqual(
    accepted.map((punch) => punch.branch_id),
    [1, 2]
  );
  assert.equal(new Set(accepted.map((punch) => punch.employee_id)).size, 1);

  const status = computeDayStatus(accepted, shift, day);
  assert.equal(status.present, true);
});

test('unflagged employee is rejected on the other branch device', () => {
  const employee = { id: 9, branch_id: 1, multi_branch_punch: false };
  assert.equal(devicePunchBranchAllowed(employee, 1), true);
  assert.equal(devicePunchBranchAllowed(employee, 2), false);
});

test('employee save accepts the multi-branch flag', () => {
  const created = validateCreateEmployee(baseEmployee({ multi_branch_punch: true }));
  assert.equal(created.multi_branch_punch, true);

  const defaultsOff = validateCreateEmployee(baseEmployee());
  assert.equal(defaultsOff.multi_branch_punch, false);

  const updated = validateUpdateEmployee({ multi_branch_punch: 'false' });
  assert.equal(updated.multi_branch_punch, false);

  assert.throws(
    () => validateUpdateEmployee({ multi_branch_punch: 'yes' }),
    (err) => err.statusCode === 400 && Boolean(err.code && err.code.multi_branch_punch)
  );
});
