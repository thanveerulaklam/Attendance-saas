const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateAgainstPending } = require('../src/services/advanceLoanService');

test('a partial repayment comes off the oldest pending loan and leaves the rest', () => {
  const result = allocateAgainstPending(
    [
      { id: 1, loan_id: 10, repayment_amount: 57745 },
      { id: 2, loan_id: 11, repayment_amount: 13000 },
    ],
    45000
  );

  assert.equal(result.error, null);
  assert.equal(result.pendingTotal, 70745);
  assert.equal(result.pendingAfter, 25745);
  assert.deepEqual(result.parts, [
    {
      id: 1,
      loan_id: 10,
      employee_id: undefined,
      year: undefined,
      month: undefined,
      pay: 45000,
      remainder: 12745,
      full: false,
    },
  ]);
});

test('a repayment that covers the first loan continues into the next', () => {
  const result = allocateAgainstPending(
    [
      { id: 1, loan_id: 10, repayment_amount: 50000 },
      { id: 2, loan_id: 11, repayment_amount: 20000 },
    ],
    60000
  );

  assert.equal(result.pendingAfter, 10000);
  assert.equal(result.parts[0].full, true);
  assert.equal(result.parts[0].pay, 50000);
  assert.equal(result.parts[1].pay, 10000);
  assert.equal(result.parts[1].remainder, 10000);
});

test('the full pending total clears every loan slice', () => {
  const result = allocateAgainstPending(
    [
      { id: 1, loan_id: 10, repayment_amount: 40000 },
      { id: 2, loan_id: 11, repayment_amount: 30000 },
    ],
    70000
  );

  assert.equal(result.pendingAfter, 0);
  assert.equal(result.parts.every((part) => part.full), true);
});

test('an amount above the pending total is rejected', () => {
  const result = allocateAgainstPending(
    [{ id: 1, loan_id: 10, repayment_amount: 70000 }],
    70001
  );
  assert.equal(result.error, 'exceeds');
  assert.equal(result.parts.length, 0);
});
