const test = require('node:test');
const assert = require('node:assert/strict');

const { computeMonthlyBaseAndAbsence } = require('../src/services/payrollMath');

test('monthly complete + day_based: full base salary with explicit absence deduction', () => {
  const basicSalary = 14000;
  const dailyRate = basicSalary / 31;

  const result = computeMonthlyBaseAndAbsence({
    isMonthComplete: true,
    attendanceMode: 'day_based',
    basicSalary,
    dailyRate,
    presentDays: 22,
    paidLeaveDaysAllowed: 0,
    absenceDays: 4,
  });

  assert.equal(result.earnedBasic, basicSalary);
  assert.equal(result.absenceDeduction, dailyRate * 4);
});

test('monthly complete + shift_based: full base salary with explicit absence deduction', () => {
  const basicSalary = 15000;
  const dailyRate = basicSalary / 30;

  const result = computeMonthlyBaseAndAbsence({
    isMonthComplete: true,
    attendanceMode: 'shift_based',
    basicSalary,
    dailyRate,
    presentDays: 25,
    paidLeaveDaysAllowed: 0,
    absenceDays: 2,
  });

  assert.equal(result.earnedBasic, basicSalary);
  assert.equal(result.absenceDeduction, dailyRate * 2);
});

test('monthly complete + hours_based: earned basic uses present + paid leave and separate absence deduction', () => {
  const basicSalary = 12000;
  const dailyRate = basicSalary / 30;

  const result = computeMonthlyBaseAndAbsence({
    isMonthComplete: true,
    attendanceMode: 'hours_based',
    basicSalary,
    dailyRate,
    presentDays: 20.5,
    paidLeaveDaysAllowed: 2,
    absenceDays: 3,
  });

  assert.equal(result.earnedBasic, dailyRate * (20.5 + 2));
  assert.equal(result.absenceDeduction, dailyRate * 3);
});

test('monthly partial + day_based: MTD earned basic only, no explicit absence deduction', () => {
  const basicSalary = 14000;
  const dailyRate = basicSalary / 31;

  const result = computeMonthlyBaseAndAbsence({
    isMonthComplete: false,
    attendanceMode: 'day_based',
    basicSalary,
    dailyRate,
    presentDays: 10,
    paidLeaveDaysAllowed: 0,
    absenceDays: 2,
  });

  assert.equal(result.earnedBasic, dailyRate * 10);
  assert.equal(result.absenceDeduction, 0);
});

test('monthly partial + hours_based: MTD earned basic and explicit absence deduction', () => {
  const basicSalary = 10000;
  const dailyRate = basicSalary / 30;

  const result = computeMonthlyBaseAndAbsence({
    isMonthComplete: false,
    attendanceMode: 'hours_based',
    basicSalary,
    dailyRate,
    presentDays: 8.5,
    paidLeaveDaysAllowed: 1,
    absenceDays: 1.5,
  });

  assert.equal(result.earnedBasic, dailyRate * 8.5);
  assert.equal(result.absenceDeduction, dailyRate * 1.5);
});

