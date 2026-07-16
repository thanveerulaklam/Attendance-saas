const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Mobile punches use device_id = 'mobile' alongside biometric/manual rows in attendance_logs.
 * Payroll and attendance services read all logs uniformly — this test documents the convention.
 */
test('punch source convention: mobile uses device_id mobile', () => {
  const logs = [
    { device_id: '42', punch_source: 'device' },
    { device_id: 'manual', punch_source: 'manual' },
    { device_id: 'mobile', punch_source: 'mobile' },
  ];
  const sources = logs.map((l) => l.device_id);
  assert.deepEqual(sources, ['42', 'manual', 'mobile']);
});

test('mixed device and mobile punches same day remain separate rows', () => {
  const employeeId = 1;
  const punchTimeDevice = '2026-07-15T09:00:00.000Z';
  const punchTimeMobile = '2026-07-15T09:01:00.000Z';
  const rows = [
    { employee_id: employeeId, punch_time: punchTimeDevice, device_id: '7' },
    { employee_id: employeeId, punch_time: punchTimeMobile, device_id: 'mobile' },
  ];
  const keys = rows.map((r) => `${r.employee_id}|${r.punch_time}`);
  assert.equal(new Set(keys).size, 2);
});
