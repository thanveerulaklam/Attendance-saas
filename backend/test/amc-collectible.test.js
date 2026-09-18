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

test('pepm yearly is collectible from access start until paid', () => {
  const company = { plan_code: 'pepm', subscription_start_date: '2026-09-17' };
  assert.equal(computeNextAmcDueDate(company), '2026-09-17');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-17') }), true);
});

test('pepm renewal is one year after last yearly payment', () => {
  const company = {
    plan_code: 'pepm',
    subscription_start_date: '2026-09-17',
    last_amc_payment_date: '2026-09-17',
  };
  assert.equal(computeNextAmcDueDate(company), '2027-09-17');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-18') }), false);
});

test('India yearly is collectible from access start until paid', () => {
  const company = { billing_cycle: 'yearly', plan_code: 'base', subscription_start_date: '2026-09-18' };
  assert.equal(computeNextAmcDueDate(company), '2026-09-18');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-18') }), true);
});

test('India yearly renewal is one year after last subscription payment', () => {
  const company = {
    billing_cycle: 'yearly',
    plan_code: 'base',
    subscription_start_date: '2026-09-18',
    last_amc_payment_date: '2026-09-18',
  };
  assert.equal(computeNextAmcDueDate(company), '2027-09-18');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-19') }), false);
});

test('India 3-year package is collectible from access start', () => {
  const company = { billing_cycle: 'triennial', plan_code: 'base', subscription_start_date: '2026-09-18' };
  assert.equal(computeNextAmcDueDate(company), '2026-09-18');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-18') }), true);
});

test('India 3-year renewal is three years after last subscription payment', () => {
  const company = {
    billing_cycle: 'triennial',
    plan_code: 'base',
    subscription_start_date: '2026-09-18',
    last_amc_payment_date: '2026-09-18',
  };
  assert.equal(computeNextAmcDueDate(company), '2029-09-18');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2027-09-18') }), false);
  assert.equal(isAmcCollectible(company, { asOf: new Date('2029-09-18') }), true);
});

test('legacy India OTC still waits a year after start', () => {
  const company = { billing_cycle: 'otc', plan_code: 'base', subscription_start_date: '2026-09-18' };
  assert.equal(computeNextAmcDueDate(company), '2027-09-18');
  assert.equal(isAmcCollectible(company, { asOf: new Date('2026-09-18') }), false);
});
