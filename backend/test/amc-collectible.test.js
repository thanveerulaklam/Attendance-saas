const test = require('node:test');
const assert = require('node:assert/strict');
const { isAmcCollectible, computeNextAmcDueDate } = require('../src/services/companyService');

test('AMC is not collectible during the first year after start', () => {
  const company = { subscription_start_date: '2026-02-27' };
  assert.equal(computeNextAmcDueDate(company), '2027-02-27');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-14') }), false);
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-14'), withinDays: 30 }), false);
});

test('AMC becomes collectible on the anniversary', () => {
  const company = { subscription_start_date: '2026-02-27' };
  assert.equal(isAmcCollectible(company, { asOf: new Date('2027-02-27') }), true);
  assert.equal(isAmcCollectible(company, { asOf: new Date('2027-03-01') }), true);
});

test('AMC due-soon window starts 30 days before the anniversary', () => {
  const company = { subscription_start_date: '2026-02-27' };
  assert.equal(isAmcCollectible(company, { asOf: new Date('2027-01-28'), withinDays: 30 }), true);
  assert.equal(isAmcCollectible(company, { asOf: new Date('2027-01-27'), withinDays: 30 }), false);
});

test('first AMC follows one-time payment date when present', () => {
  const company = {
    subscription_start_date: '2026-01-01',
    last_onetime_payment_date: '2026-03-15',
  };
  assert.equal(computeNextAmcDueDate(company), '2027-03-15');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-14') }), false);
});
