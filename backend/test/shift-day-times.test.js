const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyShiftConfigForDate,
  parseDayTimeOverrides,
  shiftClockDuration,
} = require('../src/utils/shiftRules');
const { weekdayFromYmd } = require('../src/utils/companyDate');
const { computeDayStatus } = require('../src/services/attendanceService');

const retailShift = {
  startHour: 9,
  startMinute: 30,
  endHour: 20,
  endMinute: 0,
  ...shiftClockDuration(9, 30, 20, 0),
  graceMs: 0,
  lunchMinutesAllotted: 0,
  halfDayHours: 4,
  fullDayHours: 8,
  dayTimeOverrides: parseDayTimeOverrides({
    0: { start_time: '11:00', end_time: '20:00' },
  }),
};

test('weekdayFromYmd: 2026-09-06 is Sunday', () => {
  assert.equal(weekdayFromYmd('2026-09-06'), 0);
  assert.equal(weekdayFromYmd('2026-09-07'), 1);
});

test('applyShiftConfigForDate uses Sunday override start and default on Monday', () => {
  const sunday = applyShiftConfigForDate(retailShift, '2026-09-06');
  assert.equal(sunday.startHour, 11);
  assert.equal(sunday.startMinute, 0);
  assert.equal(sunday.endHour, 20);

  const monday = applyShiftConfigForDate(retailShift, '2026-09-07');
  assert.equal(monday.startHour, 9);
  assert.equal(monday.startMinute, 30);
});

test('applying Sunday then Monday from the original config does not leak Sunday times', () => {
  const sunday = applyShiftConfigForDate(retailShift, '2026-09-06');
  const mondayFromSundayCopy = applyShiftConfigForDate(sunday, '2026-09-07');
  assert.equal(mondayFromSundayCopy.startHour, 9);
  assert.equal(mondayFromSundayCopy.startMinute, 30);
});

test('10:00 IN is on time on Sunday 11:00 start, late on Monday 09:30 start', () => {
  const sundayLogs = [
    { punch_time: '2026-09-06T10:00:00+05:30', punch_type: 'in' },
    { punch_time: '2026-09-06T20:00:00+05:30', punch_type: 'out' },
  ];
  const sunday = computeDayStatus(sundayLogs, retailShift, '2026-09-06');
  assert.equal(sunday.late, false);
  assert.equal(sunday.minutesLate, 0);

  const mondayLogs = [
    { punch_time: '2026-09-07T10:00:00+05:30', punch_type: 'in' },
    { punch_time: '2026-09-07T20:00:00+05:30', punch_type: 'out' },
  ];
  const monday = computeDayStatus(mondayLogs, retailShift, '2026-09-07');
  assert.equal(monday.late, true);
  assert.equal(monday.minutesLate, 30);
});
