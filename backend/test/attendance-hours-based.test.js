const test = require('node:test');
const assert = require('node:assert/strict');

const { computeHoursBasedDayStatus } = require('../src/services/attendanceService');

test('hours-based: open IN session counts until day end for past date', () => {
  const dayStart = new Date('2026-01-10T00:00:00.000Z');
  const dayLogs = [
    {
      punch_time: '2026-01-10T09:00:00.000Z',
      punch_type: 'in',
    },
  ];
  const shiftConfig = {
    startHour: 9,
    startMinute: 0,
    graceMs: 0,
    requiredHoursPerDay: 10,
  };

  const status = computeHoursBasedDayStatus(dayLogs, shiftConfig, dayStart);

  assert.equal(status.present, true);
  assert.equal(status.halfDay, false);
  assert.equal(status.fullDay, true);
  assert.ok(status.totalHoursInside >= 14.9 && status.totalHoursInside <= 15.1);
  assert.ok(status.overtimeHours >= 4.9 && status.overtimeHours <= 5.1);
});

