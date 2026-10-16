const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateSriSabari,
  applyDeferAndCarry,
  isSriSabariProfile,
  mergeSriSabariTotals,
  DEFAULT_CONFIG,
} = require('../src/services/payrollProfiles/sriSabari');

function punch(ymd, hh, mm, type) {
  const iso = `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`;
  return {
    type,
    at: new Date(iso).getTime(),
    ymd,
    minutes: hh * 60 + mm,
  };
}

function shift(ymd, inH, inM, outH, outM) {
  return [punch(ymd, inH, inM, 'in'), punch(ymd, outH, outM, 'out')];
}

function base(overrides) {
  return {
    rangeStart: '2026-09-01',
    rangeEnd: '2026-09-30',
    asOfDate: null,
    gender: 'male',
    weekOffDay: 3,
    hourlyRate: 50,
    config: DEFAULT_CONFIG,
    punches: [],
    ...overrides,
  };
}

test('null profile does not select Sri Sabari payroll', () => {
  const standard = { grossSalary: 12345.5, deductions: 80, salaryAdvance: 10, overtimePay: 40 };
  assert.equal(isSriSabariProfile(null), false);
  assert.equal(isSriSabariProfile(''), false);
  assert.equal(isSriSabariProfile('sri_sabari_v1'), true);
  assert.equal(mergeSriSabariTotals(standard, null), standard);
  const overlaid = mergeSriSabariTotals(standard, {
    grossSalary: 500,
    ruleDeductions: 100,
    otPay: 25,
    overtimeHours: 1,
    presentDays: 6,
    absentDays: 1,
  }, { esiDeduction: 10, pfDeduction: 5 });
  assert.equal(overlaid.grossSalary, 500);
  assert.equal(overlaid.deductions, 115);
  assert.equal(overlaid.netSalary, 375);
  assert.equal(overlaid.noLeaveIncentive, 0);
  assert.equal(standard.grossSalary, 12345.5);
});

test('gent exact 11 hours is paid with no late, short, or overtime', () => {
  const result = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 21, 0),
  }));
  assert.equal(result.hourlyPay, 550);
  assert.equal(result.lateDeduction, 0);
  assert.equal(result.shortDeduction, 0);
  assert.equal(result.otPay, 0);
});

test('one minute late and a short day each deduct 100, and both stack', () => {
  const late = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 1, 21, 1),
  }));
  assert.equal(late.lateDeduction, 100);
  assert.equal(late.shortDeduction, 0);

  const short = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 20, 0),
  }));
  assert.equal(short.hourlyPay, 500);
  assert.equal(short.shortDeduction, 100);

  const both = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 20, 20, 0),
  }));
  const ladyShort = calculateSriSabari(base({
    gender: 'female',
    hourlyRate: 40,
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 19, 59),
  }));
  assert.equal(ladyShort.shortDeduction, 100);
  assert.equal(ladyShort.lateDeduction, 0);
});

test('overtime is a flat amount only after the threshold, including one minute', () => {
  const exact = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 23, 0),
  }));
  assert.equal(exact.otPay, 0);
  assert.equal(exact.hourlyPay, 650);

  const oneMinute = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 23, 1),
  }));
  assert.equal(oneMinute.otPay, 100);
  assert.ok(oneMinute.hourlyPay > 650);

  const ladyExact = calculateSriSabari(base({
    gender: 'female',
    hourlyRate: 40,
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 21, 30),
  }));
  assert.equal(ladyExact.otPay, 0);
  assert.equal(ladyExact.hourlyPay, 460);

  const ladyOver = calculateSriSabari(base({
    gender: 'female',
    hourlyRate: 40,
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 21, 31),
  }));
  assert.equal(ladyOver.otPay, 25);
});

test('lunch punch-out is excluded, and time before 10:00 and after 22:00 still counts', () => {
  const lunch = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: [
      punch('2026-09-28', 10, 0, 'in'),
      punch('2026-09-28', 14, 0, 'out'),
      punch('2026-09-28', 15, 0, 'in'),
      punch('2026-09-28', 21, 0, 'out'),
    ],
  }));
  assert.equal(lunch.hourlyPay, 500);
  assert.equal(lunch.shortDeduction, 100);

  const early = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 9, 0, 20, 0),
  }));
  assert.equal(early.lateDeduction, 0);
  assert.equal(early.hourlyPay, 550);

  const lateNight = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 0, 23, 30),
  }));
  assert.equal(lateNight.otPay, 100);
  assert.equal(lateNight.hourlyPay, 675);
});

test('Sunday bonus needs the minimum hours and no late punch', () => {
  const ok = calculateSriSabari(base({
    rangeStart: '2026-09-27',
    rangeEnd: '2026-09-27',
    punches: shift('2026-09-27', 10, 0, 21, 0),
  }));
  assert.equal(ok.sundayBonus, 300);

  const late = calculateSriSabari(base({
    rangeStart: '2026-09-27',
    rangeEnd: '2026-09-27',
    punches: shift('2026-09-27', 10, 15, 22, 15),
  }));
  assert.equal(late.sundayBonus, 0);
  assert.equal(late.lateDeduction, 100);

  const lady = calculateSriSabari(base({
    gender: 'female',
    rangeStart: '2026-09-27',
    rangeEnd: '2026-09-27',
    punches: shift('2026-09-27', 10, 0, 20, 0),
  }));
  assert.equal(lady.sundayBonus, 200);
});

test('full week pays once in the Saturday month, and a late October day cancels it', () => {
  const days = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03'];
  const punches = days.flatMap((date) => shift(date, 10, 0, 21, 0));
  const september = calculateSriSabari(base({ punches }));
  assert.equal(september.sundayBonus, 300);
  assert.equal(september.weekBonus, 0);
  assert.equal(september.hourlyPay, 550 * 3);

  const october = calculateSriSabari(base({
    rangeStart: '2026-10-01',
    rangeEnd: '2026-10-31',
    punches,
  }));
  assert.equal(october.weekBonus, 300);
  assert.equal(october.sundayBonus, 0);
  assert.equal(october.hourlyPay, 550 * 3);

  const lateOctober = calculateSriSabari(base({
    rangeStart: '2026-10-01',
    rangeEnd: '2026-10-31',
    punches: [
      ...days.filter((d) => d !== '2026-10-01').flatMap((date) => shift(date, 10, 0, 21, 0)),
      ...shift('2026-10-01', 10, 20, 21, 20),
    ],
  }));
  assert.equal(lateOctober.weekBonus, 0);
  assert.equal(lateOctober.lateDeduction, 100);
});

test('empty Sunday–Saturday week is 600 in the Saturday month, Monday–Saturday empty is 300', () => {
  const octoberEmpty = calculateSriSabari(base({
    rangeStart: '2026-10-01',
    rangeEnd: '2026-10-03',
    punches: [],
  }));
  assert.equal(octoberEmpty.absenceDeduction, 600);

  const septemberEmpty = calculateSriSabari(base({ punches: [] }));
  assert.equal(septemberEmpty.absenceDeduction, 2400);

  const sundayWorked = calculateSriSabari(base({
    rangeStart: '2026-09-27',
    rangeEnd: '2026-10-03',
    punches: shift('2026-09-27', 10, 0, 21, 0),
  }));
  assert.equal(sundayWorked.absenceDeduction, 300);
  assert.equal(sundayWorked.sundayBonus, 300);
});

test('a week-off alone is not an absence penalty, and missing gender is blocked', () => {
  const onlyOff = calculateSriSabari(base({
    rangeStart: '2026-09-27',
    rangeEnd: '2026-10-03',
    punches: [
      ...['2026-09-27', '2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03']
        .flatMap((date) => shift(date, 10, 0, 21, 0)),
    ],
  }));
  assert.equal(onlyOff.absenceDeduction, 0);
  assert.equal(onlyOff.weekBonus, 300);

  assert.throws(() => calculateSriSabari(base({ gender: 'other' })), /male or female/);
  assert.throws(() => calculateSriSabari(base({ weekOffDay: null })), /week-off/);
});

test('deferred deductions and manual carry are held or brought forward', () => {
  const result = calculateSriSabari(base({
    rangeStart: '2026-09-28',
    rangeEnd: '2026-09-28',
    punches: shift('2026-09-28', 10, 20, 20, 0),
  }));
  const settled = applyDeferAndCarry(result, {
    deferKeys: ['late:2026-09-28', 'carry:9'],
    pendingCarry: [
      { id: 9, amount: 40 },
      { id: 10, amount: 15 },
    ],
  });
  assert.equal(settled.lateDeduction, 0);
  assert.equal(settled.shortDeduction, 100);
  assert.equal(settled.broughtForward, 15);
  assert.equal(settled.deferredLines.length, 1);
  assert.equal(settled.carryApplied.length, 1);
});
