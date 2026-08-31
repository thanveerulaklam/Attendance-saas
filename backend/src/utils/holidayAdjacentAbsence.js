const { addDaysYmd, getShiftStartMsForDate } = require('./companyDate');

/** Minimum worked time inside a shift half to count that half as present. */
const MIN_HALF_PRESENCE_MS = 15 * 60 * 1000;

function parseYmd(ymdStr) {
  const [y, m, d] = String(ymdStr).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

function punchMsAndType(log) {
  const raw = log?.punchTime ?? log?.punch_time;
  const t = raw instanceof Date ? raw : new Date(raw);
  const type = String(log?.punchType || log?.punch_type || '').toLowerCase();
  return { tMs: t.getTime(), type };
}

function overlapMs(segStart, segEnd, winStart, winEnd) {
  return Math.max(0, Math.min(segEnd, winEnd) - Math.max(segStart, winStart));
}

/**
 * Split a shift into first/second halves, with allotted lunch sitting in the middle.
 * e.g. 09:30–18:30 with 60 min lunch → first half 09:30–13:30, second half 14:30–18:30.
 */
function getShiftHalfBoundsMs(shiftConfig, dayKey) {
  const { y, m, d } = parseYmd(dayKey);
  const shiftStartMs = getShiftStartMsForDate(
    y,
    m,
    d,
    shiftConfig?.startHour,
    shiftConfig?.startMinute
  );
  const shiftMs = Number(shiftConfig?.shiftMs || 0);
  const shiftEndMs = shiftStartMs + shiftMs;
  const lunchMs = Math.max(0, Number(shiftConfig?.lunchMinutesAllotted || 0) * 60 * 1000);
  const netWorkMs = Math.max(0, shiftMs - lunchMs);
  const firstHalfEndMs = shiftStartMs + netWorkMs / 2;
  const secondHalfStartMs = firstHalfEndMs + lunchMs;
  return { shiftStartMs, shiftEndMs, firstHalfEndMs, secondHalfStartMs };
}

/**
 * Whether punches overlap the first and second halves of the shift.
 * Used for holiday-adjacent absence: missing the second half of the day before a
 * weekly off (or the first half of the day after) treats the weekly off as absent.
 */
function getWorkedHalfPresence(sortedLogs, shiftConfig, dayKey) {
  if (!Array.isArray(sortedLogs) || sortedLogs.length === 0 || !shiftConfig) {
    return { firstHalfPresent: false, secondHalfPresent: false };
  }
  const bounds = getShiftHalfBoundsMs(shiftConfig, dayKey);
  if (!Number.isFinite(bounds.shiftStartMs) || !(bounds.shiftEndMs > bounds.shiftStartMs)) {
    return { firstHalfPresent: false, secondHalfPresent: false };
  }

  let firstMs = 0;
  let secondMs = 0;
  let currentIn = null;
  for (const log of sortedLogs) {
    const { tMs, type } = punchMsAndType(log);
    if (!Number.isFinite(tMs)) continue;
    if (type === 'in') {
      currentIn = tMs;
    } else if (type === 'out' && currentIn != null) {
      firstMs += overlapMs(currentIn, tMs, bounds.shiftStartMs, bounds.firstHalfEndMs);
      secondMs += overlapMs(currentIn, tMs, bounds.secondHalfStartMs, bounds.shiftEndMs);
      currentIn = null;
    }
  }

  return {
    firstHalfPresent: firstMs >= MIN_HALF_PRESENCE_MS,
    secondHalfPresent: secondMs >= MIN_HALF_PRESENCE_MS,
  };
}

function addDayHalfPresence(firstHalfPresentKeys, secondHalfPresentKeys, dayKey, options) {
  const { present, halfDay, sortedLogs, shift } = options;
  if (!present) return;
  if (!halfDay) {
    firstHalfPresentKeys.add(dayKey);
    secondHalfPresentKeys.add(dayKey);
    return;
  }
  const halves = getWorkedHalfPresence(sortedLogs, shift, dayKey);
  if (halves.firstHalfPresent) firstHalfPresentKeys.add(dayKey);
  if (halves.secondHalfPresent) secondHalfPresentKeys.add(dayKey);
}

function markAdjacentWeeklyOffsAbsent(dayDetails, adjacentHolidayAbsentKeys) {
  if (!adjacentHolidayAbsentKeys?.size || !Array.isArray(dayDetails)) return;
  for (const detail of dayDetails) {
    if (adjacentHolidayAbsentKeys.has(detail.date) && detail.status === 'weekly_off') {
      detail.status = 'absent';
    }
  }
}

/**
 * Holidays/weekly-offs adjacent to an absent (or half-absent) working day.
 * Previous day triggers when the second half is missed; next day when the first half is missed.
 * `presence` may be a Set of fully-present day keys (legacy) or
 * `{ firstHalfPresentKeys, secondHalfPresentKeys }`.
 */
function getAdjacentHolidayAbsentKeys(holidaySet, presence, rangeStart, rangeEnd) {
  const firstHalfPresentKeys =
    presence instanceof Set ? presence : presence?.firstHalfPresentKeys || new Set();
  const secondHalfPresentKeys =
    presence instanceof Set ? presence : presence?.secondHalfPresentKeys || new Set();
  const keys = new Set();
  for (const holidayKey of holidaySet) {
    if (holidayKey > rangeEnd) continue;
    const prevKey = addDaysYmd(holidayKey, -1);
    const nextKey = addDaysYmd(holidayKey, 1);
    const absentPrev =
      prevKey >= rangeStart &&
      prevKey <= rangeEnd &&
      !secondHalfPresentKeys.has(prevKey);
    const absentNext =
      nextKey >= rangeStart &&
      nextKey <= rangeEnd &&
      !firstHalfPresentKeys.has(nextKey);
    if (absentPrev || absentNext) {
      keys.add(holidayKey);
    }
  }
  return keys;
}

module.exports = {
  getWorkedHalfPresence,
  addDayHalfPresence,
  markAdjacentWeeklyOffsAbsent,
  getAdjacentHolidayAbsentKeys,
};
