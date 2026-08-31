/**
 * Shared shift break / late / overtime rules. Pure functions so attendance and payroll stay in sync.
 */

const CHECKOUT_BUFFER_MINUTES = 60;
const ACCIDENTAL_PUNCH_GAP_MINUTES = 5;

function parseTimeToMinutes(value) {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(str);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

function clockMinutesFromMs(ms, shiftStartMs) {
  const deltaMin = Math.round((ms - shiftStartMs) / 60000);
  // Normalize into a 0..48h range relative to shift start so overnight windows work.
  const wrapped = ((deltaMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const startClock = 0; // relative; we compare using absolute minutes-from-shift-start
  return startClock + wrapped;
}

function minutesFromShiftStart(ms, shiftStartMs) {
  return (ms - shiftStartMs) / 60000;
}

/**
 * Whether an OUT time falls in a break window. Windows are clock times on the shift-start day
 * (and may wrap past midnight).
 */
function isMsInBreakWindow(outMs, breakRule, shiftStartMs) {
  const startMin = parseTimeToMinutes(breakRule.windowStart || breakRule.window_start);
  const endMin = parseTimeToMinutes(breakRule.windowEnd || breakRule.window_end);
  if (startMin == null || endMin == null) return false;
  const outMinFromStart = minutesFromShiftStart(outMs, shiftStartMs);
  // Clock minute of OUT relative to midnight of shift-start, using shift start clock as origin.
  // shiftStartMs is the shift start instant; its clock minutes are startHour*60+startMinute.
  // We pass startClockMinutes separately via breakRule._shiftStartClock when available.
  const shiftStartClock = Number(breakRule._shiftStartClock);
  const outClock =
    Number.isFinite(shiftStartClock)
      ? (shiftStartClock + outMinFromStart + 48 * 60) % (24 * 60)
      : ((outMinFromStart % (24 * 60)) + 24 * 60) % (24 * 60);

  if (endMin >= startMin) {
    return outClock >= startMin && outClock <= endMin;
  }
  // Window wraps midnight
  return outClock >= startMin || outClock <= endMin;
}

function normalizeBreak(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const allotted = Number(raw.allotted_minutes ?? raw.allottedMinutes ?? 0);
  const trackingRaw = String(raw.tracking || 'punch').toLowerCase();
  const overModeRaw = String(raw.over_deduction_mode ?? raw.overDeductionMode ?? 'none').toLowerCase();
  const windowStart = raw.window_start ?? raw.windowStart ?? null;
  const windowEnd = raw.window_end ?? raw.windowEnd ?? null;
  return {
    id: raw.id != null ? Number(raw.id) : null,
    name: String(raw.name || 'Break').trim() || 'Break',
    allottedMinutes: Number.isFinite(allotted) && allotted >= 0 ? allotted : 0,
    windowStart: windowStart ? String(windowStart).slice(0, 8) : null,
    windowEnd: windowEnd ? String(windowEnd).slice(0, 8) : null,
    tracking: trackingRaw === 'scheduled' ? 'scheduled' : 'punch',
    paid: raw.paid === true || raw.paid === 'true',
    overDeductionMode:
      overModeRaw === 'per_day' || overModeRaw === 'per_minute' ? overModeRaw : 'none',
    overDeductionAmount: Math.max(0, Number(raw.over_deduction_amount ?? raw.overDeductionAmount ?? 0) || 0),
    overDeductionMinutes: Math.max(0, Number(raw.over_deduction_minutes ?? raw.overDeductionMinutes ?? 0) || 0),
    sortOrder: Number.isFinite(Number(raw.sort_order ?? raw.sortOrder))
      ? Number(raw.sort_order ?? raw.sortOrder)
      : index,
  };
}

function parseBreaksInput(list) {
  if (!Array.isArray(list)) return [];
  return list.map((b, i) => normalizeBreak(b, i)).filter(Boolean);
}

function resolveBreaks(shiftConfig) {
  const parsed = parseBreaksInput(shiftConfig?.breaks);
  if (parsed.length > 0) return parsed;
  const lunch = Number(shiftConfig?.lunchMinutesAllotted);
  if (Number.isFinite(lunch) && lunch >= 0) {
    const overAmt = Number(shiftConfig?.lunchOverDeductionAmount || 0);
    const overMin = Number(shiftConfig?.lunchOverDeductionMinutes || 0);
    return [
      {
        id: null,
        name: 'Lunch',
        allottedMinutes: lunch,
        windowStart: null,
        windowEnd: null,
        tracking: 'punch',
        paid: false,
        overDeductionMode: overAmt > 0 && overMin > 0 ? 'per_day' : 'none',
        overDeductionAmount: overAmt,
        overDeductionMinutes: overMin,
        sortOrder: 0,
      },
    ];
  }
  return [];
}

function attachWindowContext(breaks, shiftConfig) {
  const startClock = Number(shiftConfig.startHour) * 60 + Number(shiftConfig.startMinute);
  return breaks.map((b) => ({ ...b, _shiftStartClock: startClock }));
}

function isCheckoutOut(outMs, shiftEndMs) {
  if (!Number.isFinite(outMs) || !Number.isFinite(shiftEndMs)) return true;
  const bufferMs = CHECKOUT_BUFFER_MINUTES * 60 * 1000;
  return outMs >= shiftEndMs - bufferMs;
}

/** Live "currently on break" only while viewing today and the shift has not ended. */
function isLiveOpenBreakWindow(isCurrentDate, nowMs, shiftEndMs) {
  if (!isCurrentDate) return false;
  if (!Number.isFinite(nowMs) || !Number.isFinite(shiftEndMs)) return true;
  return nowMs < shiftEndMs;
}

function shortestPunchBreakMinutes(breaks) {
  const punch = (breaks || []).filter(
    (b) => b.tracking === 'punch' && Number(b.allottedMinutes) > 0
  );
  if (!punch.length) return ACCIDENTAL_PUNCH_GAP_MINUTES;
  return Math.min(ACCIDENTAL_PUNCH_GAP_MINUTES, ...punch.map((b) => Number(b.allottedMinutes)));
}

/**
 * Pair IN/OUT logs into work segments and OUT→IN gaps.
 */
function pairPunchSegments(sortedLogs, nowMs, isCurrentDate, shiftEndMs) {
  const work = [];
  const gaps = [];
  let currentIn = null;
  let lastOut = null;
  let firstInTime = null;
  let lastOutTime = null;

  for (const log of sortedLogs) {
    const t = new Date(log.punch_time);
    const tMs = t.getTime();
    const type = String(log.punch_type || '').toLowerCase();
    if (type === 'in') {
      if (firstInTime == null) firstInTime = t;
      if (lastOut != null && currentIn == null) {
        gaps.push({ start: lastOut, end: t, startMs: lastOut.getTime(), endMs: tMs });
        lastOut = null;
      }
      currentIn = t;
    } else if (type === 'out') {
      if (currentIn != null) {
        work.push({ start: currentIn, end: t, startMs: currentIn.getTime(), endMs: tMs });
        currentIn = null;
      }
      lastOut = t;
      lastOutTime = t;
    }
  }

  if (
    isCurrentDate &&
    currentIn != null &&
    Number.isFinite(nowMs) &&
    Number.isFinite(shiftEndMs) &&
    nowMs < shiftEndMs
  ) {
    const endMs = Math.min(nowMs, shiftEndMs);
    if (endMs > currentIn.getTime()) {
      work.push({
        start: currentIn,
        end: new Date(endMs),
        startMs: currentIn.getTime(),
        endMs,
        open: true,
      });
    }
  }

  return { work, gaps, currentIn, lastOut, firstInTime, lastOutTime };
}

function matchGapToBreak(gap, breaks, shiftStartMs, usedIds) {
  const withWindow = breaks.filter(
    (b) => b.tracking === 'punch' && (b.windowStart || b.windowEnd)
  );
  for (const b of withWindow) {
    const key = b.id != null ? `id:${b.id}` : `name:${b.name}:${b.sortOrder}`;
    if (usedIds.has(key)) continue;
    if (isMsInBreakWindow(gap.startMs, b, shiftStartMs)) {
      usedIds.add(key);
      return b;
    }
  }
  const noWindow = breaks.filter(
    (b) => b.tracking === 'punch' && !b.windowStart && !b.windowEnd
  );
  for (const b of noWindow) {
    const key = b.id != null ? `id:${b.id}` : `name:${b.name}:${b.sortOrder}`;
    if (usedIds.has(key)) continue;
    usedIds.add(key);
    return b;
  }
  return null;
}

function classifyBreaks({
  sortedLogs,
  shiftConfig,
  shiftStartMs,
  shiftEndMs,
  isCurrentDate,
  nowMs,
}) {
  const breaks = attachWindowContext(resolveBreaks(shiftConfig), shiftConfig);
  const { work, gaps, currentIn, lastOut, firstInTime, lastOutTime } = pairPunchSegments(
    sortedLogs,
    nowMs,
    isCurrentDate,
    shiftEndMs
  );

  let openBreak = null;
  const completedGaps = [...gaps];

  if (lastOut != null && currentIn == null) {
    const outMs = lastOut.getTime();
    const checkout = isCheckoutOut(outMs, shiftEndMs);
    // Past dates and after shift end: last unpaired OUT is leaving, not still on a break.
    if (!checkout && isLiveOpenBreakWindow(isCurrentDate, nowMs, shiftEndMs)) {
      openBreak = {
        start: lastOut,
        end: null,
        startMs: outMs,
        endMs: null,
        open: true,
      };
    }
  }

  const used = new Set();
  const breakResults = breaks.map((b) => ({
    name: b.name,
    minutes: null,
    overMinutes: 0,
    open: false,
    allottedMinutes: b.allottedMinutes,
    tracking: b.tracking,
    paid: b.paid,
    overDeductionMode: b.overDeductionMode,
    overDeductionAmount: b.overDeductionAmount,
    overDeductionMinutes: b.overDeductionMinutes,
    matched: false,
  }));

  const byKey = (b) =>
    breakResults.find((r) => r.name === b.name && r.allottedMinutes === b.allottedMinutes && !r.matched)
    || breakResults.find((r) => r.name === b.name && !r.matched);

  for (const gap of completedGaps) {
    const matched = matchGapToBreak(gap, breaks, shiftStartMs, used);
    if (!matched) continue;
    const minutes = Math.max(0, Math.round((gap.endMs - gap.startMs) / 60000));
    const row = byKey(matched);
    if (!row) continue;
    row.minutes = minutes;
    row.overMinutes = Math.max(0, minutes - Number(matched.allottedMinutes || 0));
    row.matched = true;
  }

  if (openBreak) {
    const fakeGap = { startMs: openBreak.startMs };
    const matched = matchGapToBreak(fakeGap, breaks, shiftStartMs, used);
    // Only mark an open break when the OUT matches a remaining punch window.
    // An unmatched last OUT is checkout / left early — do not fall back to Lunch.
    if (matched) {
      const row = byKey(matched) || breakResults.find((r) => r.name === matched.name);
      if (row) {
        row.open = true;
        row.matched = true;
      } else {
        openBreak = null;
      }
    } else {
      openBreak = null;
    }
  }

  const scheduledUnpaidMs = breaks
    .filter((b) => b.tracking === 'scheduled' && !b.paid && Number(b.allottedMinutes) > 0)
    .filter((b) => {
      const row = breakResults.find((r) => r.name === b.name && r.tracking === 'scheduled');
      return !row || !row.matched;
    })
    .reduce((sum, b) => sum + Number(b.allottedMinutes) * 60000, 0);

  const lunchRow =
    breakResults.find((r) => String(r.name).toLowerCase() === 'lunch') || breakResults[0] || null;
  const openBreakName = breakResults.find((r) => r.open)?.name || null;
  const leftDuringLunch = Boolean(
    openBreakName && String(openBreakName).toLowerCase() === 'lunch'
  );

  return {
    breaks: breakResults.map(({ matched, ...rest }) => rest),
    leftDuringLunch,
    openBreakName,
    lunchMinutes: lunchRow?.minutes ?? null,
    lunchMinutesAllotted: lunchRow?.allottedMinutes ?? (shiftConfig.lunchMinutesAllotted ?? 0),
    lunchOverMinutes: lunchRow?.overMinutes > 0 ? lunchRow.overMinutes : null,
    scheduledUnpaidMs,
    workSegments: work,
    firstInTime,
    lastOutTime,
    currentIn,
  };
}

function clipMs(segStart, segEnd, winStart, winEnd) {
  const a = Math.max(segStart, winStart);
  const b = Math.min(segEnd, winEnd);
  return Math.max(0, b - a);
}

function computeWindowOvertimeMs(workSegments, shiftStartMs, shiftEndMs, overtimeWindow) {
  const window = String(overtimeWindow || 'total_extra').toLowerCase();
  if (window === 'total_extra') return null;
  let before = 0;
  let after = 0;
  for (const seg of workSegments || []) {
    const s = Number(seg.startMs);
    const e = Number(seg.endMs);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    before += clipMs(s, e, Number.NEGATIVE_INFINITY, shiftStartMs);
    after += clipMs(s, e, shiftEndMs, Number.POSITIVE_INFINITY);
  }
  if (window === 'before_start') return before;
  if (window === 'after_end') return after;
  if (window === 'both') return before + after;
  return null;
}

function normalizeLateMode(raw) {
  return String(raw || 'per_day').toLowerCase() === 'per_minute' ? 'per_minute' : 'per_day';
}

function normalizeOvertimePayMode(raw) {
  const v = String(raw || 'per_hour').toLowerCase();
  if (v === 'per_day' || v === 'per_minute') return v;
  return 'per_hour';
}

function normalizeOvertimeWindow(raw) {
  const v = String(raw || 'total_extra').toLowerCase();
  if (v === 'after_end' || v === 'before_start' || v === 'both' || v === 'total_extra') return v;
  return 'total_extra';
}

/**
 * Late deduction. per_day keeps the legacy enable gate (minutes > 0 AND amount > 0).
 * per_minute uses amount × late minutes; minutes field is an optional per-day minimum.
 */
function computeLateDeductionAmount({
  mode,
  lateDays,
  lateMinutes,
  amount,
  thresholdMinutes,
  flexibleHoursMode,
}) {
  if (flexibleHoursMode) return 0;
  const amt = Number(amount || 0);
  if (!(amt > 0)) return 0;
  if (normalizeLateMode(mode) === 'per_minute') {
    const minutes = Number(lateMinutes || 0);
    if (!(minutes > 0)) return 0;
    return roundMoney(minutes * amt);
  }
  if (!(Number(thresholdMinutes || 0) > 0)) return 0;
  const days = Number(lateDays || 0);
  if (!(days > 0)) return 0;
  return roundMoney(days * amt);
}

function computeOverstayDeduction(breakRows) {
  let lunchOverDeduction = 0;
  let other = 0;
  const lines = [];
  for (const b of breakRows || []) {
    const mode = String(b.overDeductionMode || 'none').toLowerCase();
    if (mode === 'none') continue;
    const amount = Number(b.overDeductionAmount || 0);
    if (!(amount > 0)) continue;
    const threshold = Number(b.overDeductionMinutes || 0);
    const overDays = Number(b.overDays || 0);
    const overMinutes = Number(b.overMinutes || 0);
    let value = 0;
    if (mode === 'per_minute') {
      if (overMinutes > 0) value = overMinutes * amount;
    } else if (mode === 'per_day') {
      // Legacy lunch-over gate: minutes > 0 enables a fixed amount per overstay day.
      if (overDays > 0 && threshold > 0) value = overDays * amount;
    }
    value = roundMoney(value);
    if (!(value > 0)) continue;
    lines.push({ name: b.name, amount: value });
    if (String(b.name || '').toLowerCase() === 'lunch') lunchOverDeduction += value;
    else other += value;
  }
  return { lunchOverDeduction, otherBreakOverDeduction: other, lines };
}

function computeOvertimePayAmount({
  includeOvertime,
  allowOvertime,
  payMode,
  rateMode,
  ratePerHour,
  overtimeHours,
  overtimeDays,
  overtimeMinutes,
  dailyRate,
  shiftHours,
}) {
  if (!includeOvertime || !allowOvertime) return 0;
  const mode = normalizeOvertimePayMode(payMode);
  const rate = Number(ratePerHour || 0);
  if (mode === 'per_day') {
    return roundMoney(Number(overtimeDays || 0) * rate);
  }
  if (mode === 'per_minute') {
    return roundMoney(Number(overtimeMinutes || 0) * rate);
  }
  const hourly =
    String(rateMode || 'fixed').toLowerCase() === 'auto'
      ? Number(shiftHours) > 0
        ? Number(dailyRate || 0) / Number(shiftHours)
        : 0
      : rate;
  return roundMoney(Number(overtimeHours || 0) * hourly);
}

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function isLateDayEligible({ minutesLate, mode, thresholdMinutes }) {
  const mins = Number(minutesLate || 0);
  if (!(mins > 0)) return false;
  if (normalizeLateMode(mode) !== 'per_minute') return true;
  const threshold = Number(thresholdMinutes || 0);
  if (threshold > 0 && mins < threshold) return false;
  return true;
}

module.exports = {
  CHECKOUT_BUFFER_MINUTES,
  ACCIDENTAL_PUNCH_GAP_MINUTES,
  parseTimeToMinutes,
  parseBreaksInput,
  normalizeBreak,
  resolveBreaks,
  classifyBreaks,
  computeWindowOvertimeMs,
  pairPunchSegments,
  shortestPunchBreakMinutes,
  normalizeLateMode,
  normalizeOvertimePayMode,
  normalizeOvertimeWindow,
  computeLateDeductionAmount,
  computeOverstayDeduction,
  computeOvertimePayAmount,
  isLateDayEligible,
  isCheckoutOut,
  clockMinutesFromMs,
};
