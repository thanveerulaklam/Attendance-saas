const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeHoursBasedDayStatus,
  computeHoursInsideForHoursBasedPayroll,
  getHoursBasedDailyPresence,
} = require('../src/services/attendanceService');

test('hours-based: unpaired IN on past date counts no inside time', () => {
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

  const status = computeHoursBasedDayStatus(
    dayLogs,
    shiftConfig,
    '2026-01-10',
    false,
    Date.now()
  );

  assert.equal(status.present, false);
  assert.equal(status.halfDay, false);
  assert.equal(status.fullDay, false);
  assert.equal(status.totalHoursInside, 0);
  assert.equal(status.overtimeHours, 0);
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

test('hours-based payroll: inside hours clip at shift start (completed pair only)', () => {
  const sorted = [
    { punchTime: new Date('2026-01-10T08:00:00+05:30'), punchType: 'in' },
    { punchTime: new Date('2026-01-10T10:00:00+05:30'), punchType: 'out' },
  ];
  const shift = { startHour: 9, startMinute: 0 };
  const h = computeHoursInsideForHoursBasedPayroll(sorted, shift, '2026-01-10', Date.now());
  assert.ok(h >= 0.99 && h <= 1.01);
});

test('hours-based daily non-current date: unpaired IN only is absent', () => {
  const dayLogs = [{ punch_time: '2026-01-10T09:00:00.000Z', punch_type: 'in' }];
  const computed = computeHoursBasedDayStatus(
    dayLogs,
    {
      startHour: 9,
      startMinute: 0,
      graceMs: 0,
      requiredHoursPerDay: 10,
    },
    '2026-01-10',
    false,
    Date.now()
  );
  const present = getHoursBasedDailyPresence(dayLogs, computed, false);
  assert.equal(present, false);
});

