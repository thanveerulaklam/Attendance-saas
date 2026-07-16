const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isEmployeeChannelAllowed,
  assertEmployeeMobileEligible,
} = require('../src/services/mobileAttendanceService');

test('isEmployeeChannelAllowed: device only is false', () => {
  assert.equal(isEmployeeChannelAllowed('device'), false);
});

test('isEmployeeChannelAllowed: mobile and both are true', () => {
  assert.equal(isEmployeeChannelAllowed('mobile'), true);
  assert.equal(isEmployeeChannelAllowed('both'), true);
});

test('assertEmployeeMobileEligible rejects when company mobile disabled', () => {
  assert.throws(
    () =>
      assertEmployeeMobileEligible({
        company: { mobile_attendance_enabled: false, is_active: true, subscription_end_date: null },
        employee: { status: 'active', attendance_channel: 'mobile' },
      }),
    (err) => err.code === 'MOBILE_DISABLED'
  );
});

test('assertEmployeeMobileEligible rejects wrong attendance channel', () => {
  assert.throws(
    () =>
      assertEmployeeMobileEligible({
        company: { mobile_attendance_enabled: true, is_active: true, subscription_end_date: null },
        employee: { status: 'active', attendance_channel: 'device' },
      }),
    (err) => err.code === 'EMPLOYEE_CHANNEL_NOT_MOBILE'
  );
});
