const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAdjacentHolidayAbsentKeys,
  getWorkedHalfPresence,
} = require('../src/utils/holidayAdjacentAbsence');

const shift = {
  startHour: 9,
  startMinute: 30,
  endHour: 18,
  endMinute: 30,
  shiftMs: 9 * 60 * 60 * 1000,
  lunchMinutesAllotted: 60,
};

function logs(day, times) {
  const types = ['in', 'out', 'in', 'out'];
  return times.map((t, i) => ({
    punchTime: new Date(`${day}T${t}:00+05:30`),
    punchType: types[i],
  }));
}

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

test('getWorkedHalfPresence: morning-only punches miss the second half', () => {
  const day = '2026-08-01';
  const halves = getWorkedHalfPresence(logs(day, ['09:41', '14:08']), shift, day);
  assert.equal(halves.firstHalfPresent, true);
  assert.equal(halves.secondHalfPresent, false);
});

test('getWorkedHalfPresence: afternoon-only punches miss the first half', () => {
  const day = '2026-08-03';
  const halves = getWorkedHalfPresence(logs(day, ['14:45', '18:30']), shift, day);
  assert.equal(halves.firstHalfPresent, false);
  assert.equal(halves.secondHalfPresent, true);
});

test('getWorkedHalfPresence: full-day punches cover both halves', () => {
  const day = '2026-08-03';
  const halves = getWorkedHalfPresence(logs(day, ['09:30', '13:30', '14:30', '18:30']), shift, day);
  assert.equal(halves.firstHalfPresent, true);
  assert.equal(halves.secondHalfPresent, true);
});

test('Saturday second-half absence treats Sunday weekly off as absent', () => {
  const holidaySet = new Set(['2026-08-02']);
  const firstHalfPresentKeys = new Set(['2026-08-01', '2026-08-03']);
  const secondHalfPresentKeys = new Set(['2026-08-03']);
  const keys = getAdjacentHolidayAbsentKeys(
    holidaySet,
    { firstHalfPresentKeys, secondHalfPresentKeys },
    '2026-08-01',
    '2026-08-31'
  );
  assert.ok(keys.has('2026-08-02'));
});

test('Saturday first-half absence does not treat Sunday weekly off as absent', () => {
  const holidaySet = new Set(['2026-08-02']);
  const firstHalfPresentKeys = new Set(['2026-08-03']);
  const secondHalfPresentKeys = new Set(['2026-08-01', '2026-08-03']);
  const keys = getAdjacentHolidayAbsentKeys(
    holidaySet,
    { firstHalfPresentKeys, secondHalfPresentKeys },
    '2026-08-01',
    '2026-08-31'
  );
  assert.equal(keys.size, 0);
});

test('Monday first-half absence treats Sunday weekly off as absent', () => {
  const holidaySet = new Set(['2026-08-02']);
  const firstHalfPresentKeys = new Set(['2026-08-01']);
  const secondHalfPresentKeys = new Set(['2026-08-01', '2026-08-03']);
  const keys = getAdjacentHolidayAbsentKeys(
    holidaySet,
    { firstHalfPresentKeys, secondHalfPresentKeys },
    '2026-08-01',
    '2026-08-31'
  );
  assert.ok(keys.has('2026-08-02'));
});

test('Monday second-half absence does not treat Sunday weekly off as absent', () => {
  const holidaySet = new Set(['2026-08-02']);
  const firstHalfPresentKeys = new Set(['2026-08-01', '2026-08-03']);
  const secondHalfPresentKeys = new Set(['2026-08-01']);
  const keys = getAdjacentHolidayAbsentKeys(
    holidaySet,
    { firstHalfPresentKeys, secondHalfPresentKeys },
    '2026-08-01',
    '2026-08-31'
  );
  assert.equal(keys.size, 0);
});
