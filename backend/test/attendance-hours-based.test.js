const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeHoursBasedDayStatus,
  getHoursBasedDailyPresence,
} = require('../src/services/attendanceService');

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

test('hours-based daily provisional: last punch IN is present for current date', () => {
  const dayLogs = [
    { punch_time: '2026-01-10T09:00:00.000Z', punch_type: 'in' },
    { punch_time: '2026-01-10T12:00:00.000Z', punch_type: 'out' },
    { punch_time: '2026-01-10T12:45:00.000Z', punch_type: 'in' },
  ];
  const present = getHoursBasedDailyPresence(dayLogs, { present: false }, true);
  assert.equal(present, true);
});

test('hours-based daily provisional: threshold-met day stays present for current date', () => {
  const dayLogs = [
    { punch_time: '2026-01-10T09:00:00.000Z', punch_type: 'in' },
    { punch_time: '2026-01-10T12:00:00.000Z', punch_type: 'out' },
  ];
  const present = getHoursBasedDailyPresence(dayLogs, { present: true }, true);
  assert.equal(present, true);
});

test('hours-based daily provisional: no punches is absent for current date', () => {
  const present = getHoursBasedDailyPresence([], { present: true }, true);
  assert.equal(present, false);
});

test('hours-based daily non-current date: uses computed threshold status', () => {
  const dayLogs = [{ punch_time: '2026-01-10T09:00:00.000Z', punch_type: 'in' }];
  const present = getHoursBasedDailyPresence(dayLogs, { present: true }, false);
  assert.equal(present, true);
});

