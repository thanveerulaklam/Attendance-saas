const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPayrollOverviewRange, addMonths } = require('../src/services/payrollOverviewService');

test('last month is the calendar month before today', () => {
  const range = buildPayrollOverviewRange('2026-11-01', 'last_month');
  assert.deepEqual(range.from, { year: 2026, month: 10 });
  assert.deepEqual(range.to, { year: 2026, month: 10 });
});

test('last 6 and last 12 end on the previous month', () => {
  const six = buildPayrollOverviewRange('2026-11-01', 'last_6');
  const twelve = buildPayrollOverviewRange('2026-11-01', 'last_12');
  assert.deepEqual(six.from, { year: 2026, month: 5 });
  assert.deepEqual(six.to, { year: 2026, month: 10 });
  assert.deepEqual(twelve.from, addMonths(2026, 10, -11));
  assert.deepEqual(twelve.to, { year: 2026, month: 10 });
});

test('custom range is the chosen month', () => {
  const range = buildPayrollOverviewRange('2026-11-01', 'custom', 2025, 12);
  assert.deepEqual(range.from, { year: 2025, month: 12 });
  assert.deepEqual(range.to, { year: 2025, month: 12 });
});
