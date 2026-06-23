const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPayrollRulesForCountry,
  india,
  uae,
  generic,
} = require('../src/payroll/rules');

test('India rules apply PF/ESI for configured employees', () => {
  const rules = getPayrollRulesForCountry('IN');
  assert.equal(rules.moduleId, 'india');
  assert.equal(rules.supportsStatutoryDeductions, true);

  const employee = {
    esi_mode: 'fixed',
    esi_amount: 150,
    pf_mode: 'percentage',
    pf_percent: 12,
  };
  const result = rules.resolveStatutoryDeductions(employee, {
    earnedBasic: 10000,
    grossSalary: 12000,
  });
  assert.equal(result.esiDeduction, 150);
  assert.equal(result.pfDeduction, 1200);
});

test('UAE rules never deduct PF/ESI even if employee fields are set', () => {
  const rules = getPayrollRulesForCountry('AE');
  assert.equal(rules.moduleId, 'uae');
  assert.equal(rules.supportsEsiReports, false);

  const employee = {
    esi_mode: 'fixed',
    esi_amount: 150,
    pf_mode: 'percentage',
    pf_percent: 12,
  };
  const result = rules.resolveStatutoryDeductions(employee, {
    earnedBasic: 10000,
    grossSalary: 12000,
  });
  assert.equal(result.esiDeduction, 0);
  assert.equal(result.pfDeduction, 0);
});

test('Generic rules return zero statutory deductions', () => {
  const rules = getPayrollRulesForCountry('GB');
  assert.equal(rules.moduleId, 'generic');

  const result = rules.resolveStatutoryDeductions(
    { esi_amount: 100, pf_amount: 200 },
    { earnedBasic: 5000, grossSalary: 6000 }
  );
  assert.equal(result.esiDeduction, 0);
  assert.equal(result.pfDeduction, 0);
});

test('India weekly statutory gate only on month-end week', () => {
  assert.equal(
    india.shouldDeductStatutoryForWeek('2026-01-31', '2026-01-31'),
    true
  );
  assert.equal(
    india.shouldDeductStatutoryForWeek('2026-01-24', '2026-01-31'),
    false
  );
  assert.equal(uae.shouldDeductStatutoryForWeek('2026-01-31', '2026-01-31'), false);
});
