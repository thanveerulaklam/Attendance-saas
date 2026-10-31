const test = require('node:test');
const assert = require('node:assert/strict');
const { applyHolidayOverrides, ymdFromDb } = require('../src/utils/holidayDayOverrides');

test('calendar date is kept for a local midnight Date', () => {
  const value = new Date(2026, 2, 18);
  assert.equal(ymdFromDb(value), '2026-03-18');
  assert.equal(ymdFromDb('2026-03-18'), '2026-03-18');
});

test('working override opens a holiday and a weekly off', () => {
  const holidays = new Set(['2026-10-20', '2026-10-25']);
  applyHolidayOverrides(holidays, [
    { override_date: '2026-10-20', effect: 'working' },
    { override_date: '2026-10-25', effect: 'working' },
  ]);
  assert.equal(holidays.has('2026-10-20'), false);
  assert.equal(holidays.has('2026-10-25'), false);
});

test('holiday override closes a normal working day', () => {
  const holidays = new Set(['2026-10-25']);
  applyHolidayOverrides(holidays, [
    { override_date: '2026-10-21', effect: 'holiday' },
  ]);
  assert.equal(holidays.has('2026-10-21'), true);
  assert.equal(holidays.has('2026-10-25'), true);
});

test('working wins when a date is also marked holiday in the same pass', () => {
  const holidays = new Set();
  applyHolidayOverrides(holidays, [
    { override_date: '2026-10-21', effect: 'holiday' },
    { override_date: '2026-10-21', effect: 'working' },
  ]);
  assert.equal(holidays.has('2026-10-21'), false);
});
