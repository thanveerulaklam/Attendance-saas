const test = require('node:test');
const assert = require('node:assert/strict');

const { computeFlexibleMonthlySettlement } = require('../src/services/payrollMath');
const {
  computeRawWorkedMsFromPairs,
  computeMonthlyRawWorkedHoursFromLogs,
  computeFlexibleDailyHoursFromLogs,
} = require('../src/services/attendanceService');

test('flexible monthly settlement: surplus on early days offsets shortfall — no absence at month end', () => {
  const result = computeFlexibleMonthlySettlement({
    monthlyWorkedHours: 176,
    monthlyRequiredHours: 176,
    requiredHoursPerDay: 8,
    workingDays: 22,
  });

  assert.equal(result.monthlyBalanceHours, 0);
  assert.equal(result.rawAbsenceHours, 0);
  assert.equal(result.presentDays, 22);
});

test('flexible monthly settlement: month-end shortfall reduces present days', () => {
  const result = computeFlexibleMonthlySettlement({
    monthlyWorkedHours: 160,
    monthlyRequiredHours: 176,
    requiredHoursPerDay: 8,
    workingDays: 22,
  });

  assert.equal(result.rawAbsenceHours, 16);
  assert.equal(result.rawAbsenceDays, 2);
  assert.equal(result.presentDays, 20);
  assert.equal(result.monthlyBalanceHours, -16);
});

test('raw pair hours: cross-midnight IN/OUT counts full session in monthly total', () => {
  const logs = [
    { punch_time: '2026-01-10T22:00:00+05:30', punch_type: 'in' },
    { punch_time: '2026-01-11T06:00:00+05:30', punch_type: 'out' },
  ];
  const hours = computeMonthlyRawWorkedHoursFromLogs(
    logs,
    new Date('2026-01-11T12:00:00+05:30').getTime()
  );
  assert.ok(hours >= 7.99 && hours <= 8.01);
});

test('flexible daily hours: overnight pair split at IST midnight', () => {
  const logs = [
    { punch_time: '2026-01-10T22:00:00+05:30', punch_type: 'in' },
    { punch_time: '2026-01-11T06:00:00+05:30', punch_type: 'out' },
  ];
  const map = computeFlexibleDailyHoursFromLogs(
    logs,
    new Date('2026-01-11T12:00:00+05:30').getTime()
  );
  assert.ok(Math.abs((map.get('2026-01-10') || 0) - 2) < 0.02);
  assert.ok(Math.abs((map.get('2026-01-11') || 0) - 6) < 0.02);
});

test('flexible daily hours: 8pm to 8am splits 4h + 8h across consecutive days', () => {
  const logs = [
    { punch_time: '2026-01-10T20:00:00+05:30', punch_type: 'in' },
    { punch_time: '2026-01-11T08:00:00+05:30', punch_type: 'out' },
  ];
  const map = computeFlexibleDailyHoursFromLogs(
    logs,
    new Date('2026-01-11T12:00:00+05:30').getTime()
  );
  assert.ok(Math.abs((map.get('2026-01-10') || 0) - 4) < 0.02);
  assert.ok(Math.abs((map.get('2026-01-11') || 0) - 8) < 0.02);
  const monthly = computeMonthlyRawWorkedHoursFromLogs(
    logs,
    new Date('2026-01-11T12:00:00+05:30').getTime()
  );
  assert.ok(Math.abs(monthly - 12) < 0.02);
});

test('raw pair hours: unpaired IN on past date contributes zero', () => {
  const ms = computeRawWorkedMsFromPairs(
    [{ punch_time: '2026-01-10T09:00:00+05:30', punch_type: 'in' }],
    false,
    new Date('2026-01-12T12:00:00+05:30').getTime()
  );
  assert.equal(ms, 0);
});

test('flexible compensation scenario: 14h + 6h meets 20h over two days at 10h/day contract', () => {
  const logs = [
    { punch_time: '2026-01-06T08:00:00+05:30', punch_type: 'in' },
    { punch_time: '2026-01-06T22:00:00+05:30', punch_type: 'out' },
    { punch_time: '2026-01-07T10:00:00+05:30', punch_type: 'in' },
    { punch_time: '2026-01-07T16:00:00+05:30', punch_type: 'out' },
  ];
  const worked = computeMonthlyRawWorkedHoursFromLogs(
    logs,
    new Date('2026-01-07T18:00:00+05:30').getTime()
  );
  const settlement = computeFlexibleMonthlySettlement({
    monthlyWorkedHours: worked,
    monthlyRequiredHours: 20,
    requiredHoursPerDay: 10,
    workingDays: 2,
  });
  assert.equal(settlement.rawAbsenceHours, 0);
  assert.equal(settlement.presentDays, 2);
});
