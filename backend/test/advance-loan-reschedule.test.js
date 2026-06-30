const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addCalendarMonths,
  isBeforeMonth,
  isAfterMonth,
  isFlexibleLoan,
} = require('../src/services/advanceLoanService');

test('addCalendarMonths rolls into the next year', () => {
  assert.deepEqual(addCalendarMonths(2026, 12, 1), { year: 2027, month: 1 });
});

test('addCalendarMonths handles multiple month steps', () => {
  assert.deepEqual(addCalendarMonths(2026, 10, 4), { year: 2027, month: 2 });
});

test('isBeforeMonth and isAfterMonth compare calendar months', () => {
  assert.equal(isBeforeMonth(2026, 5, 2026, 6), true);
  assert.equal(isAfterMonth(2026, 7, 2026, 6), true);
  assert.equal(isBeforeMonth(2026, 6, 2026, 6), false);
  assert.equal(isAfterMonth(2026, 6, 2026, 6), false);
});

test('isFlexibleLoan treats single-installment loans as flexible', () => {
  assert.equal(isFlexibleLoan({ total_installments: 1 }), true);
  assert.equal(isFlexibleLoan({ total_installments: 3 }), false);
});
