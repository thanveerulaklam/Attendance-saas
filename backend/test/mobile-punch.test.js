const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveTodayStatus } = require('../src/services/mobilePunchService');

test('deriveTodayStatus: no punches', () => {
  assert.equal(deriveTodayStatus([]), 'not_checked_in');
});

test('deriveTodayStatus: last punch in means checked in', () => {
  assert.equal(
    deriveTodayStatus([
      { punch_time: '2026-07-15T09:00:00.000Z', punch_type: 'in' },
    ]),
    'checked_in'
  );
});

test('deriveTodayStatus: last punch out means checked out', () => {
  assert.equal(
    deriveTodayStatus([
      { punch_time: '2026-07-15T09:00:00.000Z', punch_type: 'in' },
      { punch_time: '2026-07-15T18:00:00.000Z', punch_type: 'out' },
    ]),
    'checked_out'
  );
});

test('deriveTodayStatus: odd count ending with in', () => {
  assert.equal(
    deriveTodayStatus([
      { punch_time: '2026-07-15T09:00:00.000Z', punch_type: 'in' },
      { punch_time: '2026-07-15T13:00:00.000Z', punch_type: 'out' },
      { punch_time: '2026-07-15T14:00:00.000Z', punch_type: 'in' },
    ]),
    'checked_in'
  );
});
