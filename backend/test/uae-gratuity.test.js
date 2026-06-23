const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeMonthlyGratuityAccrual,
  estimateTotalGratuity,
  yearsOfService,
} = require('../src/payroll/rules/uaeGratuity');
const uaeRules = require('../src/payroll/rules/uae');

test('UAE gratuity accrual is zero before one year of service', () => {
  assert.equal(
    computeMonthlyGratuityAccrual({
      basicSalary: 3000,
      joinDate: '2025-06-01',
      asOfDate: '2025-12-31',
    }),
    0
  );
});

test('UAE monthly gratuity accrual uses 21-day tier for years 1-5', () => {
  const accrual = computeMonthlyGratuityAccrual({
    basicSalary: 3000,
    joinDate: '2024-01-01',
    asOfDate: '2025-06-01',
  });
  // (3000/30) * 21 / 12 = 175
  assert.equal(accrual, 175);
});

test('UAE total gratuity estimate grows with service years', () => {
  const total = estimateTotalGratuity({
    basicSalary: 3000,
    joinDate: '2020-01-01',
    asOfDate: '2025-06-01',
    contractType: 'unlimited',
  });
  assert.ok(total > 0);
  assert.ok(yearsOfService('2020-01-01', '2025-06-01') > 5);
});

test('UAE payroll rules return gratuity accrual and no PF/ESI', () => {
  const result = uaeRules.resolveStatutoryDeductions(
    { basic_salary: 3000, join_date: '2024-01-01', contract_type: 'unlimited' },
    { earnedBasic: 3000, asOfDate: '2025-06-01' }
  );
  assert.equal(result.esiDeduction, 0);
  assert.equal(result.pfDeduction, 0);
  assert.ok(result.gratuityAccrual > 0);
  assert.ok(result.gratuityEstimate > 0);
});
