const test = require('node:test');
const assert = require('node:assert/strict');
const { addCalendarMonths } = require('../src/services/advanceLoanService');

test('addCalendarMonths rolls into the next year', () => {
  assert.deepEqual(addCalendarMonths(2026, 12, 1), { year: 2027, month: 1 });
});

test('addCalendarMonths handles multiple month steps', () => {
  assert.deepEqual(addCalendarMonths(2026, 10, 4), { year: 2027, month: 2 });
});
