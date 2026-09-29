const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveNewSalary } = require('../src/utils/salaryChange');

test('increase by amount raises basic salary', () => {
  const result = resolveNewSalary({ previousSalary: 40000, changeAmount: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.previousSalary, 40000);
  assert.equal(result.newSalary, 45000);
  assert.equal(result.changeAmount, 5000);
});

test('decrease by amount lowers basic salary', () => {
  const result = resolveNewSalary({ previousSalary: '40000.00', changeAmount: -2000 });
  assert.equal(result.newSalary, 38000);
  assert.equal(result.changeAmount, -2000);
});

test('exact new salary stores the difference', () => {
  const result = resolveNewSalary({ previousSalary: 18000, newSalary: 21000.5 });
  assert.equal(result.newSalary, 21000.5);
  assert.equal(result.changeAmount, 3000.5);
});

test('rejects a salary that would drop to zero or below', () => {
  const result = resolveNewSalary({ previousSalary: 1000, changeAmount: -1000 });
  assert.equal(result.code, 'non_positive');
});

test('rejects an unchanged salary', () => {
  const result = resolveNewSalary({ previousSalary: 25000, newSalary: 25000 });
  assert.equal(result.code, 'unchanged');
});

test('rejects missing and conflicting inputs', () => {
  assert.equal(resolveNewSalary({ previousSalary: 1000 }).code, 'missing');
  assert.equal(
    resolveNewSalary({ previousSalary: 1000, newSalary: 1200, changeAmount: 200 }).code,
    'both'
  );
  assert.equal(resolveNewSalary({ previousSalary: 1000, changeAmount: 0 }).code, 'invalid');
});
