const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeMonthlyBaseAndAbsence,
  computePermissionOffset,
  computePaidLeaveEncashment,
} = require('../src/services/payrollMath');

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

test('permission offset: zero allocation keeps deductions unchanged', () => {
  const result = computePermissionOffset({
    allocatedHours: 0,
    lateMinutes: 40,
    absenceDays: 1,
    hourlyRate: 100,
    deductionsBeforeOffset: 1000,
  });

  assert.equal(result.allocatedHours, 0);
  assert.equal(result.usedMinutes, 0);
  assert.equal(result.offsetAmount, 0);
});

test('permission offset: partial cover uses all allocated minutes', () => {
  const result = computePermissionOffset({
    allocatedHours: 2, // 120 min
    lateMinutes: 30,
    absenceDays: 0.5, // 240 min
    hourlyRate: 100,
    deductionsBeforeOffset: 2000,
  });

  assert.equal(result.usedMinutes, 120);
  assert.equal(result.offsetAmount, 200); // 2h * 100
});

test('permission offset: full cover capped by available deductions', () => {
  const result = computePermissionOffset({
    allocatedHours: 10,
    lateMinutes: 60,
    absenceDays: 0,
    hourlyRate: 200,
    deductionsBeforeOffset: 100,
  });

  assert.equal(result.usedMinutes, 60);
  assert.equal(result.offsetAmount, 100);
});

test('paid leave encashment: complete month + enabled adds unused paid leaves', () => {
  const result = computePaidLeaveEncashment({
    enabled: true,
    isMonthComplete: true,
    paidLeaveDaysAllowed: 4,
    paidLeaveUsed: 3,
    dailyRate: 100,
  });

  assert.equal(result.unusedPaidLeaveDays, 1);
  assert.equal(result.paidLeaveEncashmentAmount, 100);
});

test('paid leave encashment: disabled yields zero', () => {
  const result = computePaidLeaveEncashment({
    enabled: false,
    isMonthComplete: true,
    paidLeaveDaysAllowed: 4,
    paidLeaveUsed: 0,
    dailyRate: 100,
  });

  assert.equal(result.unusedPaidLeaveDays, 0);
  assert.equal(result.paidLeaveEncashmentAmount, 0);
});

test('paid leave encashment: incomplete month yields zero', () => {
  const result = computePaidLeaveEncashment({
    enabled: true,
    isMonthComplete: false,
    paidLeaveDaysAllowed: 4,
    paidLeaveUsed: 1,
    dailyRate: 100,
  });

  assert.equal(result.unusedPaidLeaveDays, 0);
  assert.equal(result.paidLeaveEncashmentAmount, 0);
});

