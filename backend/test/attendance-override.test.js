const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeAttendanceDateKey } = require('../src/services/attendanceOverrideService');

test('normalizeAttendanceDateKey accepts YYYY-MM-DD strings', () => {
  assert.equal(normalizeAttendanceDateKey('2026-06-05'), '2026-06-05');
});

test('normalizeAttendanceDateKey trims ISO datetime strings', () => {
  assert.equal(normalizeAttendanceDateKey('2026-06-05T00:00:00.000Z'), '2026-06-05');
});

test('normalizeAttendanceDateKey converts UTC Date objects', () => {
  assert.equal(normalizeAttendanceDateKey(new Date('2026-06-05T00:00:00.000Z')), '2026-06-05');
});
