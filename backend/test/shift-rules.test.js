const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyBreaks,
  computeLateDeductionAmount,
  computeOvertimePayAmount,
  computeOverstayDeduction,
  computeWindowOvertimeMs,
  isLateDayEligible,
} = require('../src/utils/shiftRules');
const { computeDayStatus } = require('../src/services/attendanceService');

const day = '2026-03-15';

function punch(time, type) {
  return { punch_time: `${day}T${time}:00+05:30`, punch_type: type };
}

function dayShift(overrides = {}) {
  return {
    startHour: 9,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    shiftMs: 9 * 60 * 60 * 1000,
    graceMs: 0,
    lunchMinutesAllotted: 60,
    halfDayHours: 4,
    fullDayHours: 8,
    overtimeAllowed: true,
    overtimeWindow: 'total_extra',
    ...overrides,
  };
}

function shiftBounds(shift = dayShift()) {
  const startMs = new Date(`${day}T${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}:00+05:30`).getTime();
  return { shiftStartMs: startMs, shiftEndMs: startMs + shift.shiftMs };
}

test('2-punch IN+OUT at shift bounds is checkout, not lunch', () => {
  const shift = dayShift();
  const status = computeDayStatus(
    [punch('09:00', 'in'), punch('18:00', 'out')],
    shift,
    day
  );
  assert.equal(status.leftDuringLunch, false);
  assert.equal(status.openBreakName, null);
  assert.equal(status.present, true);
  assert.equal(status.fullDay, true);
});

test('2-punch OUT inside lunch window is an open lunch break', () => {
  const shift = dayShift({
    breaks: [
      {
        name: 'Lunch',
        allotted_minutes: 60,
        window_start: '12:00',
        window_end: '14:00',
        tracking: 'punch',
        paid: false,
      },
    ],
  });
  const status = computeDayStatus(
    [punch('09:00', 'in'), punch('13:00', 'out')],
    shift,
    day
  );
  assert.equal(status.leftDuringLunch, true);
  assert.equal(status.openBreakName, 'Lunch');
  assert.equal(status.fullDay, false);
});

test('4-punch lunch duration is the OUT→IN gap', () => {
  const shift = dayShift({
    breaks: [
      {
        name: 'Lunch',
        allotted_minutes: 60,
        window_start: '12:00',
        window_end: '14:30',
        tracking: 'punch',
      },
    ],
  });
  const status = computeDayStatus(
    [
      punch('09:00', 'in'),
      punch('13:00', 'out'),
      punch('14:00', 'in'),
      punch('18:00', 'out'),
    ],
    shift,
    day
  );
  assert.equal(status.leftDuringLunch, false);
  assert.equal(status.lunchMinutes, 60);
  assert.equal(status.lunchOverMinutes, null);
  assert.equal(status.fullDay, true);
});

test('tea and lunch windows classify separate punch gaps', () => {
  const shift = dayShift({
    lunchMinutesAllotted: 60,
    breaks: [
      {
        name: 'Tea',
        allotted_minutes: 15,
        window_start: '10:30',
        window_end: '11:00',
        tracking: 'punch',
        sort_order: 0,
      },
      {
        name: 'Lunch',
        allotted_minutes: 60,
        window_start: '13:00',
        window_end: '14:30',
        tracking: 'punch',
        sort_order: 1,
      },
    ],
  });
  const status = computeDayStatus(
    [
      punch('09:00', 'in'),
      punch('10:35', 'out'),
      punch('10:50', 'in'),
      punch('13:05', 'out'),
      punch('14:10', 'in'),
      punch('18:00', 'out'),
    ],
    shift,
    day
  );
  const tea = status.breaks.find((b) => b.name === 'Tea');
  const lunch = status.breaks.find((b) => b.name === 'Lunch');
  assert.equal(tea.minutes, 15);
  assert.equal(tea.overMinutes, 0);
  assert.equal(lunch.minutes, 65);
  assert.equal(lunch.overMinutes, 5);
  assert.equal(status.leftDuringLunch, false);
});

test('scheduled unpaid tea subtracts allotted minutes without extra punches', () => {
  const shift = dayShift({
    lunchMinutesAllotted: 0,
    breaks: [
      {
        name: 'Tea',
        allotted_minutes: 15,
        tracking: 'scheduled',
        paid: false,
      },
    ],
  });
  const { shiftStartMs, shiftEndMs } = shiftBounds(shift);
  const classified = classifyBreaks({
    sortedLogs: [punch('09:00', 'in'), punch('18:00', 'out')],
    shiftConfig: shift,
    shiftStartMs,
    shiftEndMs,
    isCurrentDate: false,
    nowMs: shiftEndMs + 1,
  });
  assert.equal(classified.scheduledUnpaidMs, 15 * 60 * 1000);
  assert.equal(classified.leftDuringLunch, false);
  assert.equal(classified.openBreakName, null);
});

test('late per_day keeps a fixed amount; per_minute uses late minutes', () => {
  const perDay = computeLateDeductionAmount({
    mode: 'per_day',
    lateDays: 2,
    lateMinutes: 40,
    amount: 50,
    thresholdMinutes: 15,
  });
  assert.equal(perDay, 100);

  const perMinute = computeLateDeductionAmount({
    mode: 'per_minute',
    lateDays: 2,
    lateMinutes: 40,
    amount: 1,
    thresholdMinutes: 15,
  });
  assert.equal(perMinute, 40);

  const gatedOff = computeLateDeductionAmount({
    mode: 'per_day',
    lateDays: 2,
    lateMinutes: 40,
    amount: 50,
    thresholdMinutes: 0,
  });
  assert.equal(gatedOff, 0);
});

test('per_minute late skips days below the optional minimum', () => {
  assert.equal(
    isLateDayEligible({ minutesLate: 10, mode: 'per_minute', thresholdMinutes: 15 }),
    false
  );
  assert.equal(
    isLateDayEligible({ minutesLate: 20, mode: 'per_minute', thresholdMinutes: 15 }),
    true
  );
  assert.equal(
    isLateDayEligible({ minutesLate: 2, mode: 'per_day', thresholdMinutes: 15 }),
    true
  );
});

test('overtime pay modes: per hour, per day, per minute', () => {
  const base = {
    includeOvertime: true,
    allowOvertime: true,
    rateMode: 'fixed',
    ratePerHour: 100,
    overtimeHours: 2,
    overtimeDays: 3,
    overtimeMinutes: 90,
    dailyRate: 900,
    shiftHours: 9,
  };
  assert.equal(computeOvertimePayAmount({ ...base, payMode: 'per_hour' }), 200);
  assert.equal(computeOvertimePayAmount({ ...base, payMode: 'per_day' }), 300);
  assert.equal(computeOvertimePayAmount({ ...base, payMode: 'per_minute' }), 9000);
});

test('break overstay: lunch per_day and tea per_minute', () => {
  const result = computeOverstayDeduction([
    {
      name: 'Lunch',
      overDeductionMode: 'per_day',
      overDeductionAmount: 30,
      overDeductionMinutes: 15,
      overDays: 2,
      overMinutes: 40,
    },
    {
      name: 'Tea',
      overDeductionMode: 'per_minute',
      overDeductionAmount: 1,
      overDeductionMinutes: 0,
      overDays: 1,
      overMinutes: 20,
    },
  ]);
  assert.equal(result.lunchOverDeduction, 60);
  assert.equal(result.otherBreakOverDeduction, 20);
});

test('OT windows: before start, after end, both, and total extra', () => {
  const shift = dayShift();
  const earlyAndLate = [punch('08:00', 'in'), punch('19:00', 'out')];

  const after = computeDayStatus(earlyAndLate, { ...shift, overtimeWindow: 'after_end' }, day);
  assert.equal(after.overtimeMinutes, 60);

  const before = computeDayStatus(earlyAndLate, { ...shift, overtimeWindow: 'before_start' }, day);
  assert.equal(before.overtimeMinutes, 60);

  const both = computeDayStatus(earlyAndLate, { ...shift, overtimeWindow: 'both' }, day);
  assert.equal(both.overtimeMinutes, 120);

  const total = computeDayStatus(earlyAndLate, { ...shift, overtimeWindow: 'total_extra' }, day);
  assert.equal(total.overtimeMinutes, 120);
});

test('OT after_end still counts when late-in total hours are about the shift', () => {
  const shift = dayShift();
  const logs = [punch('09:30', 'in'), punch('19:00', 'out')];

  const after = computeDayStatus(logs, { ...shift, overtimeWindow: 'after_end' }, day);
  assert.equal(after.overtimeMinutes, 60);

  const total = computeDayStatus(logs, { ...shift, overtimeWindow: 'total_extra' }, day);
  assert.equal(total.overtimeMinutes, 30);
});

test('computeWindowOvertimeMs returns null for total_extra so callers keep the legacy formula', () => {
  const { shiftStartMs, shiftEndMs } = shiftBounds();
  assert.equal(
    computeWindowOvertimeMs(
      [{ startMs: shiftStartMs - 3600000, endMs: shiftEndMs + 3600000 }],
      shiftStartMs,
      shiftEndMs,
      'total_extra'
    ),
    null
  );
});
