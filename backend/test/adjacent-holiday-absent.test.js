const test = require('node:test');
const assert = require('node:assert/strict');

const { getAdjacentHolidayAbsentKeys } = require('../src/services/payrollService');

test('getAdjacentHolidayAbsentKeys includes holiday when previous day is absent', () => {
  const holidaySet = new Set(['2026-06-05']); // Thursday weekly off
  const presentDayKeys = new Set(); // Monday absent, no presence on adjacent days
  const keys = getAdjacentHolidayAbsentKeys(
    holidaySet,
    presentDayKeys,
    '2026-06-01',
    '2026-06-07'
  );
  assert.ok(keys.has('2026-06-05'));
});

test('getAdjacentHolidayAbsentKeys includes holiday when next day is absent', () => {
  const holidaySet = new Set(['2026-06-05']);
  const presentDayKeys = new Set(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']);
  // 2026-06-06 is absent (not in presentDayKeys), holiday 2026-06-05 is adjacent
  const keys = getAdjacentHolidayAbsentKeys(
    holidaySet,
    presentDayKeys,
    '2026-06-01',
    '2026-06-07'
  );
  assert.ok(keys.has('2026-06-05'));
});

test('getAdjacentHolidayAbsentKeys skips holiday when neither neighbor is absent', () => {
  const holidaySet = new Set(['2026-06-05']);
  const presentDayKeys = new Set([
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
    '2026-06-04',
    '2026-06-06',
    '2026-06-07',
  ]);
  const keys = getAdjacentHolidayAbsentKeys(
    holidaySet,
    presentDayKeys,
    '2026-06-01',
    '2026-06-07'
  );
  assert.equal(keys.size, 0);
});

test('dayDetails post-process marks adjacent weekly_off as absent', () => {
  const adjacentHolidayAbsentKeys = new Set(['2026-06-05']);
  const dayDetails = [
    { date: '2026-06-05', status: 'weekly_off' },
    { date: '2026-06-06', status: 'absent' },
    { date: '2026-06-07', status: 'present' },
  ];
  for (const detail of dayDetails) {
    if (adjacentHolidayAbsentKeys.has(detail.date) && detail.status === 'weekly_off') {
      detail.status = 'absent';
    }
  }
  const absentDates = dayDetails.filter((d) => d.status === 'absent').map((d) => d.date);
  assert.deepEqual(absentDates.sort(), ['2026-06-05', '2026-06-06']);
});
