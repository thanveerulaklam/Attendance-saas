const test = require('node:test');
const assert = require('node:assert/strict');

const { computeDayStatus } = require('../src/services/attendanceService');

const day = '2026-03-15';
const baseShift = {
  startHour: 9,
  startMinute: 30,
  endHour: 21,
  endMinute: 30,
  shiftMs: 12 * 60 * 60 * 1000,
  graceMs: 0,
  lunchMinutesAllotted: 60,
  halfDayHours: null,
  fullDayHours: null,
};

function punches(times) {
  const types = ['in', 'out', 'in', 'out'];
  return times.map((t, i) => ({
    punch_time: `${day}T${t}:00+05:30`,
    punch_type: types[i],
  }));
}

test('day_based: four punches with enough worked time is full day', () => {
  const status = computeDayStatus(punches(['09:15', '14:30', '15:30', '21:30']), baseShift, day);
  assert.equal(status.fullDay, true);
  assert.equal(status.halfDay, false);
});

test('day_based: four punches but short worked time is half day (auto min = shift − lunch)', () => {
  const status = computeDayStatus(punches(['09:15', '11:30', '13:00', '14:00']), baseShift, day);
  assert.equal(status.fullDay, false);
  assert.equal(status.halfDay, true);
});

test('day_based: full_day_hours 0 restores punch-pattern-only full day', () => {
  const shift = { ...baseShift, fullDayHours: 0 };
  const status = computeDayStatus(punches(['09:15', '11:30', '13:00', '14:00']), shift, day);
  assert.equal(status.fullDay, true);
  assert.equal(status.halfDay, false);
});
