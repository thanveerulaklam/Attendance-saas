const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const {
  istYmdFromDate,
  istYmdParts,
  todayIstYmd,
  addDaysIst,
  istMinutesFromMidnight,
  SQL_PUNCH_IST_DATE,
} = require('../utils/istDate');

// Company timezone for shift/late calculations. Server may run in UTC, but punches and shifts are in company local time.
// Set COMPANY_TIMEZONE=Asia/Kolkata for Indian deployments. Defaults to Asia/Kolkata.
const COMPANY_TZ = process.env.COMPANY_TIMEZONE || 'Asia/Kolkata';

function employeesBranchFilterSql(allowedBranchIds, paramIndex, columnName = 'branch_id') {
  if (allowedBranchIds == null) {
    return { clause: '', params: [], nextIndex: paramIndex };
  }
  if (allowedBranchIds.length === 0) {
    return { clause: ' AND FALSE', params: [], nextIndex: paramIndex };
  }
  return {
    clause: ` AND ${columnName} = ANY($${paramIndex}::bigint[])`,
    params: [allowedBranchIds],
    nextIndex: paramIndex + 1,
  };
}

async function assertEmployeeInAttendanceScope(client, companyId, employeeId, allowedBranchIds) {
  if (allowedBranchIds == null) return;
  const r = await client.query(
    `SELECT branch_id FROM employees WHERE company_id = $1 AND id = $2 AND status = 'active'`,
    [companyId, employeeId]
  );
  if (r.rowCount === 0) {
    throw new AppError('Employee not found or inactive', 404);
  }
  if (allowedBranchIds.length === 0 || !allowedBranchIds.includes(Number(r.rows[0].branch_id))) {
    throw new AppError('Employee not found or inactive', 404);
  }
}

async function assertAttendanceLogInScope(client, companyId, logId, allowedBranchIds) {
  if (allowedBranchIds == null) return;
  const r = await client.query(
    `SELECT branch_id FROM attendance_logs WHERE company_id = $1 AND id = $2`,
    [companyId, logId]
  );
  if (r.rowCount === 0) {
    throw new AppError('Punch record not found', 404);
  }
  if (allowedBranchIds.length === 0 || !allowedBranchIds.includes(Number(r.rows[0].branch_id))) {
    throw new AppError('Punch record not found', 404);
  }
}

const TZ_OFFSETS = {
  'Asia/Kolkata': '+05:30',
  'Asia/Calcutta': '+05:30',
  UTC: 'Z',
  'Etc/UTC': 'Z',
};

/**
 * Get shift start timestamp (ms) for a given date in company timezone.
 * "9:30" must mean 9:30 AM in company local (e.g. IST), not server UTC.
 */
function getShiftStartMsForDate(year, month, day, startHour, startMinute) {
  const offset = TZ_OFFSETS[COMPANY_TZ] ?? '+05:30';
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00${offset === 'Z' ? 'Z' : offset}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date(year, month - 1, day, startHour, startMinute, 0).getTime() : d.getTime();
}

function parseAttendanceMode(row) {
  const raw = String(row.attendance_mode ?? 'day_based').toLowerCase();
  if (raw === 'hours_based') return 'hours_based';
  if (raw === 'shift_based') return 'shift_based';
  return 'day_based';
}

function rowToShiftConfig(row) {
  const [startHour, startMinute] = row.start_time.split(':').map(Number);
  const [endHour, endMinute] = row.end_time.split(':').map(Number);
  const startMin = startHour * 60 + startMinute;
  const endMin = endHour * 60 + endMinute;
  const isOvernightClock = endMin < startMin;
  const shiftMinutes =
    endMin >= startMin ? endMin - startMin : 24 * 60 + endMin - startMin;
  const shiftMs = shiftMinutes * 60 * 1000;
  const graceMs = Number(row.grace_minutes || 0) * 60 * 1000;
  const lunchMinutesAllotted = Number(row.lunch_minutes) >= 0 ? Number(row.lunch_minutes) : 60;
  const attendanceMode = parseAttendanceMode(row);
  const requiredHoursPerDay = Number(row.required_hours_per_day || 8);
  const halfDayHoursRaw = Number(row.half_day_hours);
  const halfDayHours = Number.isFinite(halfDayHoursRaw) ? halfDayHoursRaw : null;
  const fullDayHoursRaw = row.full_day_hours;
  const fullDayHours =
    fullDayHoursRaw === null || fullDayHoursRaw === undefined || fullDayHoursRaw === ''
      ? null
      : Number(fullDayHoursRaw);
  const fullDayHoursResolved =
    Number.isFinite(fullDayHours) && fullDayHours >= 0 ? fullDayHours : null;
  const overtimeAllowed = row.allow_overtime === true || row.allow_overtime === 'true';
  return {
    startHour,
    startMinute,
    endHour,
    endMinute,
    isOvernightClock,
    shiftMs,
    graceMs,
    lunchMinutesAllotted,
    attendanceMode,
    requiredHoursPerDay,
    halfDayHours,
    /** null = derive from shift span − allotted lunch; else minimum worked hours for full day (0 = punch pattern only). */
    fullDayHours: fullDayHoursResolved,
    overtimeAllowed,
  };
}

/**
 * Minimum worked time (ms) for a paid full day.
 * Uses configured fullDayHours when present; falls back for legacy records.
 */
function getFullDayMinimumWorkMs(shiftConfig) {
  const explicit = shiftConfig.fullDayHours;
  if (explicit !== null && explicit !== undefined && Number.isFinite(explicit) && explicit >= 0) {
    return explicit * 60 * 60 * 1000;
  }
  const shiftMs = Number(shiftConfig.shiftMs || 0);
  const lunchMin = Number(shiftConfig.lunchMinutesAllotted ?? 60);
  const shiftHours = shiftMs / (60 * 60 * 1000);
  const lunchHours = Math.max(0, lunchMin) / 60;
  const derivedHours = Math.max(0, shiftHours - lunchHours);
  return derivedHours * 60 * 60 * 1000;
}

/**
 * For overnight shifts (hours_based or legacy shift_based), attribute a punch to shift start date (IST):
 * e.g. 06:00 on day 2 belongs to the shift that started 22:00 on day 1.
 */
function attributedShiftStartDateStr(punchTime, shiftConfig) {
  const istYmd = istYmdFromDate(punchTime);
  const mode = String(shiftConfig.attendanceMode || '').toLowerCase();
  if (
    !shiftConfig.isOvernightClock ||
    (mode !== 'shift_based' && mode !== 'hours_based')
  ) {
    return istYmd;
  }
  const mins = istMinutesFromMidnight(punchTime);
  const startMin = shiftConfig.startHour * 60 + shiftConfig.startMinute;
  const endMin = shiftConfig.endHour * 60 + shiftConfig.endMinute;
  if (mins >= startMin) {
    return istYmd;
  }
  // End boundary belongs to the shift that started previous day as well.
  if (mins <= endMin) {
    return addDaysIst(istYmd, -1);
  }
  return istYmd;
}

/**
 * Get shift config for a company (start/end/grace in ms).
 * Uses same logic as payroll for consistency.
 */
async function getShiftConfig(companyId) {
  const result = await pool.query(
    `SELECT start_time, end_time, grace_minutes, lunch_minutes, attendance_mode, required_hours_per_day, half_day_hours, full_day_hours, allow_overtime
     FROM shifts
     WHERE company_id = $1
     ORDER BY id
     LIMIT 1`,
    [companyId]
  );

  if (result.rowCount === 0) {
    throw new AppError('No shift configured for company', 400);
  }

  return rowToShiftConfig(result.rows[0]);
}

/**
 * Get shift config by shift ID. Returns null if not found.
 */
async function getShiftConfigById(shiftId) {
  if (!shiftId) return null;
  const result = await pool.query(
    `SELECT start_time, end_time, grace_minutes, lunch_minutes, attendance_mode, required_hours_per_day, half_day_hours, full_day_hours, allow_overtime
     FROM shifts WHERE id = $1`,
    [shiftId]
  );
  if (result.rowCount === 0) return null;
  return rowToShiftConfig(result.rows[0]);
}

/**
 * Build a map of shift_id -> config for given shift IDs, plus company default.
 * Used when computing attendance for employees who may have different assigned shifts.
 */
async function getShiftConfigMap(companyId, shiftIds) {
  const defaultConfig = await getShiftConfig(companyId);
  const map = new Map();
  map.set(null, defaultConfig);
  const uniqueIds = [...new Set((shiftIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) return map;
  const result = await pool.query(
    `SELECT id, start_time, end_time, grace_minutes, lunch_minutes, attendance_mode, required_hours_per_day, half_day_hours, full_day_hours
     FROM shifts WHERE id = ANY($1::bigint[])`,
    [uniqueIds]
  );
  for (const row of result.rows) {
    map.set(row.id, rowToShiftConfig(row));
  }
  for (const id of uniqueIds) {
    if (!map.has(id)) map.set(id, defaultConfig);
  }
  return map;
}

/**
 * Normalize punch_type by chronological order: 1st = IN, 2nd = OUT, 3rd = IN, etc.
 * Returns a new array (sorted by punch_time) so display and status use consistent IN/OUT.
 */
function normalizePunchTypesByOrder(dayLogs) {
  if (!dayLogs || dayLogs.length === 0) return dayLogs;
  const sorted = [...dayLogs].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );
  return sorted.map((log, i) => ({
    ...log,
    punch_type: i % 2 === 0 ? 'in' : 'out',
  }));
}

/**
 * Milliseconds worked from completed IN→OUT pairs, counting only time on or after shift start.
 * For the current calendar date, each pair’s end is capped at `now`. Unpaired IN contributes nothing.
 */
function computeWorkedMsFromShiftStartToNow(
  dayLogs,
  shiftConfig,
  calendarDateStr,
  isCurrentDate,
  nowMs
) {
  if (!Array.isArray(dayLogs) || dayLogs.length === 0) return 0;

  const [y, mo, dd] = calendarDateStr.split('-').map(Number);
  const shiftStartMs = getShiftStartMsForDate(
    y,
    mo,
    dd,
    shiftConfig.startHour,
    shiftConfig.startMinute
  );

  const endMs = isCurrentDate ? nowMs : Number.POSITIVE_INFINITY;
  const maxSessionMinutes = 24 * 60; // safety against bad punches
  const maxSessionMs = maxSessionMinutes * 60 * 1000;

  let workedMs = 0;
  let currentInMs = null;

  const sorted = [...dayLogs].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );

  for (const log of sorted) {
    const tMs = new Date(log.punch_time).getTime();
    const type = (log.punch_type || '').toLowerCase();

    if (type === 'in') {
      currentInMs = tMs;
      continue;
    }

    if (type === 'out' && currentInMs != null) {
      const startMs = Math.max(currentInMs, shiftStartMs);
      const endPairMs = Math.min(tMs, endMs);
      const diffMs = endPairMs - startMs;
      if (diffMs > 0 && diffMs <= maxSessionMs) {
        workedMs += diffMs;
      }
      currentInMs = null;
    }
  }

  // Today only, while shift is still in progress: count last unpaired IN through now (capped at shift end).
  // After shift end, do not infer hours from an unpaired IN (missing OUT → incomplete day for metrics).
  if (
    isCurrentDate &&
    currentInMs != null &&
    Number.isFinite(endMs) &&
    endMs < shiftStartMs + shiftConfig.shiftMs
  ) {
    const shiftEndMs = shiftStartMs + shiftConfig.shiftMs;
    const segStart = Math.max(currentInMs, shiftStartMs);
    const segEnd = Math.min(endMs, shiftEndMs);
    const diffMs = segEnd - segStart;
    if (diffMs > 0 && diffMs <= maxSessionMs) {
      workedMs += diffMs;
    }
  }

  return workedMs;
}

/**
 * Hours inside for hours-based payroll / attendance (same rules as daily “Total hours” column).
 * `sortedDayLogs`: `{ punchTime: Date, punchType: 'in'|'out' }[]` sorted ascending.
 */
function computeHoursInsideForHoursBasedPayroll(
  sortedDayLogs,
  shiftConfig,
  calendarDateStr,
  nowMs = Date.now()
) {
  if (!sortedDayLogs || sortedDayLogs.length === 0) return 0;
  const ymd = String(calendarDateStr).slice(0, 10);
  const logsForMs = sortedDayLogs.map((l) => {
    const pt = l.punchTime ?? l.punch_time;
    const ts = pt instanceof Date ? pt.toISOString() : String(pt);
    return {
      punch_time: ts,
      punch_type: String(l.punchType || l.punch_type || 'in').toLowerCase(),
    };
  });
  const isCurrentDate = todayIstYmd() === ymd;
  const workedMs = computeWorkedMsFromShiftStartToNow(
    logsForMs,
    shiftConfig,
    ymd,
    isCurrentDate,
    nowMs
  );
  return workedMs / (60 * 60 * 1000);
}

/**
 * Compute present, late, overtime, full-day, left-during-lunch, and lunch duration for one day's logs.
 * Expects 4-punch pattern: 1=IN, 2=OUT (lunch start), 3=IN (lunch end), 4=OUT (end of day).
 * shiftConfig: { startHour, startMinute, shiftMs, graceMs, lunchMinutesAllotted, halfDayHours, fullDayHours }
 * calendarDateStr: YYYY-MM-DD attendance day in IST
 * @param {boolean} [isCurrentDate] - when true, unpaired IN counts through now (capped at shift end) for thresholds and hours
 * @param {number} [nowMs] - current time for in-progress segments (defaults to Date.now())
 */
function computeDayStatus(
  dayLogs,
  shiftConfig,
  calendarDateStr,
  isCurrentDate = false,
  nowMs = Date.now()
) {
  const empty = {
    present: false,
    late: false,
    overtimeHours: 0,
    fullDay: false,
    leftDuringLunch: false,
    lunchMinutes: null,
    lunchMinutesAllotted: shiftConfig.lunchMinutesAllotted ?? 60,
    lunchOverMinutes: null,
    firstInTime: null,
    lastOutTime: null,
  };

  if (!dayLogs.length) {
    return empty;
  }

  let workedMs = 0;
  let firstInTime = null;
  let currentIn = null;
  let lunchStartTime = null; // time of first OUT (lunch start)
  let lunchEndTime = null;   // time of second IN (lunch end)
  let lastOutTime = null;

  const sorted = [...dayLogs].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );

  for (const log of sorted) {
    const t = new Date(log.punch_time);
    const type = (log.punch_type || '').toLowerCase();
    if (type === 'in') {
      if (firstInTime == null) firstInTime = t;
      // First IN after lunch OUT = end of lunch (do not overwrite on later INs, e.g. 6-punch days)
      if (currentIn == null && lunchStartTime != null && lunchEndTime == null) {
        lunchEndTime = t;
      }
      currentIn = t;
    } else if (type === 'out') {
      if (currentIn != null) {
        workedMs += Math.max(0, t - currentIn);
        if (lunchStartTime == null) {
          lunchStartTime = t; // first OUT = lunch start
        }
      }
      currentIn = null;
      lastOutTime = t;
    }
  }

  // Left during lunch = exactly 2 punches (IN, OUT) — went out for lunch and never punched back IN
  const punchCount = sorted.length;
  const leftDuringLunch = punchCount === 2 &&
    sorted[0].punch_type?.toLowerCase() === 'in' &&
    sorted[1].punch_type?.toLowerCase() === 'out';

  const allotted = shiftConfig.lunchMinutesAllotted ?? 60;
  let lunchMinutes = null;
  let lunchOverMinutes = null;
  if (lunchStartTime != null && lunchEndTime != null) {
    lunchMinutes = Math.round((lunchEndTime - lunchStartTime) / (60 * 1000));
    lunchOverMinutes = Math.max(0, lunchMinutes - allotted);
  }

  // Anchor shift start to the attendance day (shift start date), not the first punch's calendar day.
  // Required for day_based and overnight shift_based so a morning punch on day 2 does not move
  // the expected start to day 2.
  const [y, mo, dd] = calendarDateStr.split('-').map(Number);
  const shiftStartMs = getShiftStartMsForDate(
    y,
    mo,
    dd,
    shiftConfig.startHour,
    shiftConfig.startMinute
  );
  const shiftEndMs = shiftStartMs + shiftConfig.shiftMs;
  const maxOpenSessionMs = 24 * 60 * 60 * 1000;
  if (
    isCurrentDate &&
    currentIn != null &&
    Number.isFinite(nowMs) &&
    nowMs < shiftEndMs
  ) {
    const tIn = currentIn.getTime();
    const segStart = Math.max(tIn, shiftStartMs);
    const segEnd = Math.min(nowMs, shiftEndMs);
    const diffMs = segEnd - segStart;
    if (diffMs > 0 && diffMs <= maxOpenSessionMs) {
      workedMs += diffMs;
    }
  }

  const late =
    (workedMs > 0 || firstInTime != null) &&
    firstInTime != null &&
    firstInTime.getTime() > shiftStartMs + shiftConfig.graceMs;

  const overtimeMs = Math.max(
    0,
    workedMs - shiftConfig.shiftMs - shiftConfig.graceMs
  );
  const overtimeHours = overtimeMs / (60 * 60 * 1000);
  const workedHours = workedMs / (60 * 60 * 1000);
  const fullDayMinHours = Number(shiftConfig.fullDayHours);
  const halfDayMinHours = Number(shiftConfig.halfDayHours);
  const fullDayMinWorkMs = getFullDayMinimumWorkMs(shiftConfig);
  const hasConfiguredThresholds =
    Number.isFinite(fullDayMinHours) &&
    Number.isFinite(halfDayMinHours) &&
    fullDayMinHours > 0 &&
    halfDayMinHours > 0 &&
    fullDayMinHours > halfDayMinHours;

  let present = workedMs > 0 || firstInTime != null;
  let fullDay = false;
  let halfDay = false;

  if (hasConfiguredThresholds) {
    const provisionalPresent =
      isCurrentDate &&
      currentIn != null &&
      Number.isFinite(nowMs) &&
      nowMs < shiftEndMs &&
      !leftDuringLunch;
    if (workedHours + 0.0001 >= fullDayMinHours) {
      present = true;
      fullDay = true;
      halfDay = false;
    } else if (workedHours + 0.0001 >= halfDayMinHours) {
      present = true;
      fullDay = false;
      halfDay = true;
    } else if (provisionalPresent) {
      present = true;
      fullDay = false;
      halfDay = false;
    } else {
      present = false;
      fullDay = false;
      halfDay = false;
    }
  } else {
    // Backward-compatible behavior for legacy shifts without configured thresholds.
    fullDay = workedMs + 0.001 >= fullDayMinWorkMs;
    halfDay = present && !fullDay;
  }

  return {
    present,
    late,
    overtimeHours,
    fullDay,
    leftDuringLunch,
    lunchMinutes,
    lunchMinutesAllotted: allotted,
    lunchOverMinutes: lunchOverMinutes !== null ? lunchOverMinutes : null,
    firstInTime,
    lastOutTime,
    minutesLate:
      present && firstInTime != null && late
        ? Math.max(
            0,
            Math.round(
              (firstInTime.getTime() -
                (shiftStartMs + shiftConfig.graceMs)) /
                (60 * 1000)
            )
          )
        : 0,
    halfDay,
  };
}

function computeHoursBasedDayStatus(
  dayLogs,
  shiftConfig,
  calendarDateStr,
  isCurrentDate,
  nowMs
) {
  const empty = {
    present: false,
    late: false,
    overtimeHours: 0,
    fullDay: false,
    leftDuringLunch: false,
    lunchMinutes: null,
    lunchMinutesAllotted: 0,
    lunchOverMinutes: null,
    totalHoursInside: 0,
    halfDay: false,
    firstInTime: null,
    lastOutTime: null,
    minutesLate: 0,
  };
  if (!dayLogs.length) return empty;

  const sorted = [...dayLogs].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );

  const workedMs = computeWorkedMsFromShiftStartToNow(
    dayLogs,
    shiftConfig,
    calendarDateStr,
    isCurrentDate,
    nowMs
  );
  const totalHoursInside = workedMs / (60 * 60 * 1000);

  let firstInTime = null;
  for (const log of sorted) {
    if (String(log.punch_type || '').toLowerCase() === 'in') {
      firstInTime = new Date(log.punch_time);
      break;
    }
  }

  const required = Number(shiftConfig.requiredHoursPerDay || 8);

  let present = false;
  let halfDay = false;
  let overtimeHours = 0;

  if (totalHoursInside >= required) {
    present = true;
    overtimeHours = totalHoursInside - required;
  } else if (totalHoursInside >= required * 0.5) {
    present = true;
    halfDay = true;
  }

  const fullDay = present && !halfDay;

  // Late detection based on first IN punch vs shift start + grace
  let late = false;
  let minutesLate = 0;
  if (firstInTime) {
    const { year: y, month: mo, day: dd } = istYmdParts(firstInTime);
    const shiftStartMs = getShiftStartMsForDate(
      y,
      mo,
      dd,
      shiftConfig.startHour,
      shiftConfig.startMinute
    );
    const allowedStartMs = shiftStartMs + shiftConfig.graceMs;
    if (firstInTime.getTime() > allowedStartMs) {
      late = true;
      minutesLate = Math.round(
        (firstInTime.getTime() - allowedStartMs) / (60 * 1000)
      );
    }
  }

  let lastOutTime = null;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (String(sorted[i].punch_type || '').toLowerCase() === 'out') {
      lastOutTime = new Date(sorted[i].punch_time);
      break;
    }
  }

  return {
    present,
    late,
    overtimeHours,
    fullDay,
    leftDuringLunch: false,
    lunchMinutes: null,
    lunchMinutesAllotted: 0,
    lunchOverMinutes: null,
    totalHoursInside,
    halfDay,
    firstInTime,
    lastOutTime,
    minutesLate,
  };
}

function getHoursBasedDailyPresence(dayLogs, computedStatus, isCurrentDate) {
  if (!isCurrentDate) {
    return Boolean(computedStatus?.present);
  }
  if (!Array.isArray(dayLogs) || dayLogs.length === 0) {
    return false;
  }
  // If half-day or full-day thresholds are already met, count as present even when the last punch is OUT.
  if (computedStatus?.present) {
    return true;
  }
  // Provisional rule for today's hours-based board:
  // if employee has at least one IN punch today, they are considered present-in-progress
  // even when currently OUT (e.g. lunch break / short exit) until final day closure.
  return dayLogs.some(
    (l) => String(l?.punch_type || '').toLowerCase() === 'in'
  );
}

/**
 * GET daily attendance: per-employee status for one date.
 * @param {number} companyId
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} [employeeId] - optional filter
 * @returns {Promise<Array<{ employee_id, name, employee_code, present, late, overtime_hours }>>}
 * @param {number[]|null} allowedBranchIds - null = all branches (admin)
 */
async function getDailyAttendance(
  companyId,
  dateStr,
  employeeId = null,
  department = null,
  allowedBranchIds = null
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const isCurrentDate = todayIstYmd() === dateStr;
  const nowMs = Date.now();

  const client = await pool.connect();
  try {
    let employeesResult;
    const dept = department ? String(department).trim() : null;
    let employeesQuery = `SELECT e.id, e.name, e.employee_code, e.shift_id, e.branch_id, b.name AS branch_name
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE e.company_id = $1 AND e.status = 'active'`;
    const params = [companyId];

    const bfEmp = employeesBranchFilterSql(allowedBranchIds, 2, 'e.branch_id');
    employeesQuery += bfEmp.clause;
    params.push(...bfEmp.params);
    let nextIdx = bfEmp.nextIndex;

    if (employeeId) {
      employeesQuery += ` AND e.id = $${nextIdx}`;
      params.push(employeeId);
      nextIdx += 1;
    }

    if (dept) {
      employeesQuery += ` AND e.department = $${nextIdx}`;
      params.push(dept);
      nextIdx += 1;
    }

    if (!employeeId) employeesQuery += ' ORDER BY name';

    employeesResult = await client.query(employeesQuery, params);

    const employees = employeesResult.rows;
    if (employees.length === 0) {
      return [];
    }

    const shiftConfigMap = await getShiftConfigMap(
      companyId,
      employees.map((e) => e.shift_id)
    );

    const ids = employees.map((e) => e.id);

    const needOvernightNextDay = Array.from(shiftConfigMap.values()).some(
      (c) =>
        c &&
        c.isOvernightClock &&
        (c.attendanceMode === 'shift_based' || c.attendanceMode === 'hours_based')
    );
    const nextDayStr = addDaysIst(dateStr, 1);

    const logsResult = await client.query(
      needOvernightNextDay
        ? `SELECT id, employee_id, punch_time, punch_type, device_id
           FROM attendance_logs
           WHERE company_id = $1
             AND employee_id = ANY($2::bigint[])
             AND (${SQL_PUNCH_IST_DATE} = $3::date OR ${SQL_PUNCH_IST_DATE} = $4::date)
           ORDER BY punch_time ASC`
        : `SELECT id, employee_id, punch_time, punch_type, device_id
           FROM attendance_logs
           WHERE company_id = $1
             AND employee_id = ANY($2::bigint[])
             AND ${SQL_PUNCH_IST_DATE} = $3::date
           ORDER BY punch_time ASC`,
      needOvernightNextDay ? [companyId, ids, dateStr, nextDayStr] : [companyId, ids, dateStr]
    );

    const logsByEmployee = new Map();
    for (const row of logsResult.rows) {
      const eid = row.employee_id;
      if (!logsByEmployee.has(eid)) {
        logsByEmployee.set(eid, []);
      }
      logsByEmployee.get(eid).push({
        id: row.id,
        punch_time: row.punch_time,
        punch_type: row.punch_type,
        device_id: row.device_id,
      });
    }

    return employees.map((emp) => {
      const shiftConfig =
        shiftConfigMap.get(emp.shift_id) || shiftConfigMap.get(null);
      let rawDayLogs = logsByEmployee.get(emp.id) || [];
      if (
        shiftConfig.isOvernightClock &&
        (shiftConfig.attendanceMode === 'shift_based' || shiftConfig.attendanceMode === 'hours_based')
      ) {
        const [sy, smo, sdd] = dateStr.split('-').map(Number);
        const shiftStartMs = getShiftStartMsForDate(
          sy,
          smo,
          sdd,
          shiftConfig.startHour,
          shiftConfig.startMinute
        );
        const shiftEndMs = shiftStartMs + shiftConfig.shiftMs;
        rawDayLogs = rawDayLogs.filter((l) => {
          const t = new Date(l.punch_time).getTime();
          // Include exact shift end punch (e.g. 09:00 OUT for 21:00-09:00).
          return t >= shiftStartMs && t <= shiftEndMs;
        });
      }
      const dayLogs = normalizePunchTypesByOrder(rawDayLogs);
      const status =
        shiftConfig.attendanceMode === 'hours_based'
          ? computeHoursBasedDayStatus(dayLogs, shiftConfig, dateStr, isCurrentDate, nowMs)
          : computeDayStatus(dayLogs, shiftConfig, dateStr, isCurrentDate, nowMs);
      const isProvisionalHoursBased =
        shiftConfig.attendanceMode === 'hours_based' && isCurrentDate;
      const presentForDaily =
        shiftConfig.attendanceMode === 'hours_based'
          ? getHoursBasedDailyPresence(dayLogs, status, isCurrentDate)
          : status.present;
      const punches = dayLogs.map((l) => ({
        id: l.id,
        punch_time: l.punch_time,
        punch_type: (l.punch_type || '').toLowerCase(),
        device_id: l.device_id || null,
      }));

      const workedMsFromShiftStart = computeWorkedMsFromShiftStartToNow(
        dayLogs,
        shiftConfig,
        dateStr,
        isCurrentDate,
        nowMs
      );
      const total_hours_from_shift_start =
        Math.round((workedMsFromShiftStart / (60 * 60 * 1000)) * 100) / 100;
      return {
        employee_id: emp.id,
        name: emp.name,
        employee_code: emp.employee_code,
        branch_id: emp.branch_id ? Number(emp.branch_id) : null,
        branch_name: emp.branch_name || null,
        present: presentForDaily,
        late: status.late,
        overtime_hours: Math.round(status.overtimeHours * 100) / 100,
        full_day: status.fullDay,
        half_day: status.halfDay || false,
        left_during_lunch: status.leftDuringLunch,
        lunch_minutes: status.lunchMinutes,
        lunch_minutes_allotted: status.lunchMinutesAllotted,
        lunch_over_minutes: status.lunchOverMinutes,
        total_hours_from_shift_start,
        attendance_mode: shiftConfig.attendanceMode,
        required_hours_per_day:
          shiftConfig.attendanceMode === 'hours_based'
            ? shiftConfig.requiredHoursPerDay
            : null,
        total_hours_inside:
          shiftConfig.attendanceMode === 'hours_based'
            ? Math.round((status.totalHoursInside || 0) * 100) / 100
            : null,
        first_in_time: status.firstInTime
          ? status.firstInTime.toISOString()
          : null,
        minutes_late:
          status.minutesLate != null ? Math.round(status.minutesLate) : 0,
        is_provisional: isProvisionalHoursBased,
        punches,
      };
    });
  } finally {
    client.release();
  }
}

/**
 * GET monthly attendance: summary + per-day breakdown per employee.
 * @param {number} companyId
 * @param {number} year
 * @param {number} month
 * @param {number} [employeeId] - optional filter
 */
async function getMonthlyAttendance(
  companyId,
  year,
  month,
  employeeId = null,
  department = null,
  allowedBranchIds = null
) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const daysInMonth = new Date(y, m, 0).getDate();
  const monthFirstStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthLastStr = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const client = await pool.connect();
  try {
    let employeesResult;
    const dept = department ? String(department).trim() : null;
    let employeesQuery = `SELECT id, name, employee_code, shift_id
      FROM employees
      WHERE company_id = $1 AND status = 'active'`;
    const params = [companyId];

    const bfEmpM = employeesBranchFilterSql(allowedBranchIds, 2);
    employeesQuery += bfEmpM.clause;
    params.push(...bfEmpM.params);
    let nextIdxM = bfEmpM.nextIndex;

    if (employeeId) {
      employeesQuery += ` AND id = $${nextIdxM}`;
      params.push(employeeId);
      nextIdxM += 1;
    }

    if (dept) {
      employeesQuery += ` AND department = $${nextIdxM}`;
      params.push(dept);
      nextIdxM += 1;
    }

    if (!employeeId) employeesQuery += ' ORDER BY name';

    employeesResult = await client.query(employeesQuery, params);

    const employees = employeesResult.rows;
    if (employees.length === 0) {
      return { year: y, month: m, daysInMonth, employees: [] };
    }

    const shiftConfigMap = await getShiftConfigMap(
      companyId,
      employees.map((e) => e.shift_id)
    );

    const ids = employees.map((e) => e.id);

    const needOvernightExtension = Array.from(shiftConfigMap.values()).some(
      (c) =>
        c &&
        c.isOvernightClock &&
        (c.attendanceMode === 'shift_based' || c.attendanceMode === 'hours_based')
    );
    const rangeStart = needOvernightExtension
      ? addDaysIst(monthFirstStr, -1)
      : monthFirstStr;
    const rangeEnd = needOvernightExtension
      ? addDaysIst(monthLastStr, 1)
      : monthLastStr;

    const logsResult = await client.query(
      `SELECT employee_id, punch_time, punch_type, device_id
       FROM attendance_logs
       WHERE company_id = $1
         AND employee_id = ANY($2::bigint[])
         AND ${SQL_PUNCH_IST_DATE} >= $3::date
         AND ${SQL_PUNCH_IST_DATE} <= $4::date
       ORDER BY punch_time ASC`,
      [companyId, ids, rangeStart, rangeEnd]
    );

    const empShiftById = new Map(
      employees.map((e) => [
        e.id,
        shiftConfigMap.get(e.shift_id) || shiftConfigMap.get(null),
      ])
    );

    const logsByEmployeeAndDay = new Map();
    for (const row of logsResult.rows) {
      const eid = row.employee_id;
      const punchTime = new Date(row.punch_time);
      const shiftCfg = empShiftById.get(eid);
      const key =
        shiftCfg.isOvernightClock &&
        (shiftCfg.attendanceMode === 'shift_based' || shiftCfg.attendanceMode === 'hours_based')
          ? attributedShiftStartDateStr(punchTime, shiftCfg)
          : istYmdFromDate(punchTime);
      if (key < monthFirstStr || key > monthLastStr) continue;
      if (!logsByEmployeeAndDay.has(eid)) {
        logsByEmployeeAndDay.set(eid, new Map());
      }
      const byDay = logsByEmployeeAndDay.get(eid);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push({
        punch_time: row.punch_time,
        punch_type: row.punch_type,
        device_id: row.device_id || null,
      });
    }

    const employeesWithDays = [];
    for (const emp of employees) {
      const shiftConfig =
        shiftConfigMap.get(emp.shift_id) || shiftConfigMap.get(null);
      const byDay = logsByEmployeeAndDay.get(emp.id) || new Map();
      const days = [];
      const todayStr = todayIstYmd();
      const nowMs = Date.now();
      for (let d = 1; d <= daysInMonth; d += 1) {
        const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const rawDayLogs = byDay.get(key) || [];
        const dayLogs = normalizePunchTypesByOrder(rawDayLogs);
        const isCurrentDate = key === todayStr;
        const status =
          shiftConfig.attendanceMode === 'hours_based'
            ? computeHoursBasedDayStatus(dayLogs, shiftConfig, key, isCurrentDate, nowMs)
            : computeDayStatus(dayLogs, shiftConfig, key, isCurrentDate, nowMs);
        const workedMsFromShiftStart = computeWorkedMsFromShiftStartToNow(
          dayLogs,
          shiftConfig,
          key,
          isCurrentDate,
          nowMs
        );
        const total_hours_from_shift_start = Math.round(
          (workedMsFromShiftStart / (60 * 60 * 1000)) * 100
        ) / 100;
        const presentForDay =
          shiftConfig.attendanceMode === 'hours_based'
            ? getHoursBasedDailyPresence(dayLogs, status, isCurrentDate)
            : status.present;
        days.push({
          date: key,
          day: d,
          present: presentForDay,
          late: status.late,
          overtime_hours: Math.round(status.overtimeHours * 100) / 100,
          full_day: status.fullDay,
          half_day: status.halfDay || false,
          left_during_lunch: status.leftDuringLunch,
          lunch_minutes: status.lunchMinutes,
          lunch_minutes_allotted: status.lunchMinutesAllotted,
          lunch_over_minutes: status.lunchOverMinutes,
          attendance_mode: shiftConfig.attendanceMode,
          required_hours_per_day:
            shiftConfig.attendanceMode === 'hours_based'
              ? shiftConfig.requiredHoursPerDay
              : null,
          total_hours_inside:
            shiftConfig.attendanceMode === 'hours_based'
              ? Math.round((status.totalHoursInside || 0) * 100) / 100
              : null,
          total_hours_from_shift_start,
          first_in_time: status.firstInTime ? status.firstInTime.toISOString() : null,
          last_out_time: status.lastOutTime ? status.lastOutTime.toISOString() : null,
          punches: dayLogs.map((l) => ({
            punch_time: l.punch_time,
            punch_type: (l.punch_type || '').toLowerCase(),
            device_id: l.device_id || null,
          })),
        });
      }
      const presentDays = days.filter((d) => d.present).length;
      const absenceDays = Math.max(0, daysInMonth - presentDays);
      const overtimeHours = Math.round(days.reduce((s, d) => s + (d.overtime_hours || 0), 0) * 100) / 100;
      employeesWithDays.push({
        employee_id: emp.id,
        name: emp.name,
        employee_code: emp.employee_code,
        summary: { presentDays, absenceDays, overtimeHours },
        days,
      });
    }

    return {
      year: y,
      month: m,
      daysInMonth,
      employees: employeesWithDays,
    };
  } finally {
    client.release();
  }
}

/**
 * Add a manual attendance punch (when device is broken/unavailable).
 * Prefer punch_time (ISO string from frontend = user's local time converted to UTC).
 * @param {number} companyId
 * @param {object} params - { employeeId, punch_time? (ISO), date? (YYYY-MM-DD), time? (HH:mm), punchType ('in'|'out') }
 * @returns {Promise<{ inserted: number, punch: object }>}
 */
async function addManualPunch(
  companyId,
  { employeeId, punch_time: punchTimeParam, date, time, punchType },
  allowedBranchIds = null
) {
  const punchTypeNorm = String(punchType || '').toLowerCase();
  if (punchTypeNorm !== 'in' && punchTypeNorm !== 'out') {
    throw new AppError('punch_type must be "in" or "out"', 400);
  }

  const empId = Number(employeeId);
  if (!empId) {
    throw new AppError('Valid employee_id is required', 400);
  }

  let punchTime;
  if (punchTimeParam != null && String(punchTimeParam).trim() !== '') {
    punchTime = new Date(punchTimeParam);
    if (Number.isNaN(punchTime.getTime())) {
      throw new AppError('Invalid punch_time', 400);
    }
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
    if (!match) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }
    const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time || '').trim());
    if (!timeMatch) {
      throw new AppError('Invalid time format. Use HH:mm (e.g. 09:00)', 400);
    }
    const [, h, m, s = '0'] = timeMatch;
    punchTime = new Date(
      `${match[1]}-${match[2]}-${match[3]}T${h.padStart(2, '0')}:${m}:${s.padStart(2, '0')}`
    );
    if (Number.isNaN(punchTime.getTime())) {
      throw new AppError('Invalid date/time', 400);
    }
  }

  const client = await pool.connect();
  try {
    const empCheck = await client.query(
      `SELECT id, branch_id FROM employees WHERE company_id = $1 AND id = $2 AND status = 'active'`,
      [companyId, empId]
    );
    if (empCheck.rowCount === 0) {
      throw new AppError('Employee not found or inactive', 404);
    }
    await assertEmployeeInAttendanceScope(client, companyId, empId, allowedBranchIds);

    const branchId = Number(empCheck.rows[0].branch_id);

    const result = await client.query(
      `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id, branch_id)
       VALUES ($1, $2, $3, $4, 'manual', $5)
       ON CONFLICT (employee_id, punch_time) DO NOTHING
       RETURNING id, employee_id, punch_time, punch_type`,
      [companyId, empId, punchTime.toISOString(), punchTypeNorm, branchId]
    );

    if (result.rowCount === 0) {
      throw new AppError('A punch already exists for this employee at this time', 409);
    }

    return { inserted: 1, punch: result.rows[0] };
  } finally {
    client.release();
  }
}

/**
 * Mark full-day manual attendance.
 * Creates 4 punches so the day is "Full day" (not "Left at lunch"):
 * IN (shift start), OUT (lunch start), IN (lunch end), OUT (shift end).
 * Uses server local time so stored times match company timezone when server runs in same zone.
 * @param {number} companyId
 * @param {object} params - { employeeId, date (YYYY-MM-DD) }
 * @returns {Promise<{ inserted: number, punches: Array }>}
 */
async function addManualFullDay(companyId, { employeeId, date }, allowedBranchIds = null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const empId = Number(employeeId);
  if (!empId) {
    throw new AppError('Valid employee_id is required', 400);
  }
  const [, y, m, d] = match;
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const dayNum = parseInt(d, 10);

  const client = await pool.connect();
  try {
    const empCheck = await client.query(
      `SELECT id, branch_id, shift_id
       FROM employees
       WHERE company_id = $1 AND id = $2 AND status = 'active'`,
      [companyId, empId]
    );
    if (empCheck.rowCount === 0) {
      throw new AppError('Employee not found or inactive', 404);
    }
    await assertEmployeeInAttendanceScope(client, companyId, empId, allowedBranchIds);
    const branchId = Number(empCheck.rows[0].branch_id);
    const employeeShiftId = empCheck.rows[0].shift_id;
    // Use employee's assigned shift timings; fallback to company default shift.
    const shiftConfig = (await getShiftConfigById(employeeShiftId)) || (await getShiftConfig(companyId));

    // Use local time (not UTC) so 9 AM stays 9 AM in display when server is in company timezone.
    const inTime = new Date(year, month - 1, dayNum, shiftConfig.startHour, shiftConfig.startMinute, 0);
    const lunchMs = (shiftConfig.lunchMinutesAllotted || 60) * 60 * 1000;
    const workBeforeLunchMs = Math.max(0, shiftConfig.shiftMs - lunchMs) / 2;
    const outLunchTime = new Date(inTime.getTime() + workBeforeLunchMs);
    const inLunchTime = new Date(outLunchTime.getTime() + lunchMs);
    const outTime = new Date(inTime.getTime() + shiftConfig.shiftMs);

    let inserted = 0;
    const punches = [];

    const toInsert = [
      [inTime, 'in'],
      [outLunchTime, 'out'],
      [inLunchTime, 'in'],
      [outTime, 'out'],
    ];

    for (const [punchTime, punchType] of toInsert) {
      const result = await client.query(
        `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id, branch_id)
         VALUES ($1, $2, $3, $4, 'manual', $5)
         ON CONFLICT (employee_id, punch_time) DO NOTHING
         RETURNING id, punch_time, punch_type`,
        [companyId, empId, punchTime.toISOString(), punchType, branchId]
      );
      if (result.rowCount > 0) {
        inserted += 1;
        punches.push(result.rows[0]);
      }
    }

    return { inserted, punches };
  } finally {
    client.release();
  }
}

/**
 * Mark full-day manual attendance for multiple employees at once.
 * @param {number} companyId
 * @param {object} params - { employeeIds: number[], date (YYYY-MM-DD) }
 * @returns {Promise<{ inserted: number, processed: number, results: Array<{ employee_id, inserted }> }>}
 */
async function addManualFullDayBulk(companyId, { employeeIds, date }, allowedBranchIds = null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const ids = Array.isArray(employeeIds) ? employeeIds.filter(Boolean).map(Number) : [];
  if (ids.length === 0) {
    throw new AppError('At least one employee_id is required', 400);
  }

  const results = [];
  let totalInserted = 0;

  for (const empId of ids) {
    try {
      const r = await addManualFullDay(companyId, { employeeId: empId, date }, allowedBranchIds);
      totalInserted += r.inserted;
      results.push({ employee_id: empId, inserted: r.inserted, success: true });
    } catch (err) {
      results.push({
        employee_id: empId,
        inserted: 0,
        success: false,
        error: err.message || 'Failed',
      });
    }
  }

  return {
    inserted: totalInserted,
    processed: ids.length,
    results,
  };
}

/**
 * Update an existing punch's time and/or type (for editing timings on attendance page).
 * @param {number} companyId
 * @param {number} logId - attendance_logs.id
 * @param {object} params - { punch_time (ISO string), punch_type ('in'|'out')? }
 * @returns {Promise<{ id, punch_time, punch_type }>}
 */
async function updatePunch(
  companyId,
  logId,
  { punch_time: punchTimeParam, punch_type: punchTypeParam },
  allowedBranchIds = null
) {
  const logIdNum = Number(logId);
  if (!logIdNum || logIdNum < 1) {
    throw new AppError('Valid log id is required', 400);
  }

  const punchTypeNorm = punchTypeParam != null ? String(punchTypeParam).toLowerCase() : null;
  if (punchTypeNorm != null && punchTypeNorm !== 'in' && punchTypeNorm !== 'out') {
    throw new AppError('punch_type must be "in" or "out"', 400);
  }

  let punchTime = null;
  if (punchTimeParam != null && punchTimeParam !== '') {
    const d = new Date(punchTimeParam);
    if (Number.isNaN(d.getTime())) {
      throw new AppError('Invalid punch_time', 400);
    }
    punchTime = d;
  }

  if (punchTime == null && punchTypeNorm == null) {
    throw new AppError('Provide punch_time and/or punch_type to update', 400);
  }

  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT id, employee_id, punch_time, punch_type
       FROM attendance_logs
       WHERE company_id = $1 AND id = $2`,
      [companyId, logIdNum]
    );
    if (existing.rowCount === 0) {
      throw new AppError('Punch record not found', 404);
    }
    await assertAttendanceLogInScope(client, companyId, logIdNum, allowedBranchIds);

    const row = existing.rows[0];
    const newPunchTime = punchTime != null ? punchTime.toISOString() : row.punch_time;
    const newPunchType = punchTypeNorm != null ? punchTypeNorm : (row.punch_type || 'in').toLowerCase();

    const result = await client.query(
      `UPDATE attendance_logs
       SET punch_time = $1, punch_type = $2
       WHERE company_id = $3 AND id = $4
       RETURNING id, punch_time, punch_type`,
      [newPunchTime, newPunchType, companyId, logIdNum]
    );

    if (result.rowCount === 0) {
      throw new AppError('Punch record not found', 404);
    }

    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('Another punch already exists for this employee at the new time', 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Delete a punch (used from edit timings modal).
 * @param {number} companyId
 * @param {number} logId - attendance_logs.id
 * @returns {Promise<{ id: number }>}
 */
async function deletePunch(companyId, logId, allowedBranchIds = null) {
  const logIdNum = Number(logId);
  if (!logIdNum || logIdNum < 1) {
    throw new AppError('Valid log id is required', 400);
  }

  const client = await pool.connect();
  try {
    await assertAttendanceLogInScope(client, companyId, logIdNum, allowedBranchIds);

    const result = await client.query(
      `DELETE FROM attendance_logs
       WHERE company_id = $1 AND id = $2
       RETURNING id`,
      [companyId, logIdNum]
    );

    if (result.rowCount === 0) {
      throw new AppError('Punch record not found', 404);
    }

    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  getDailyAttendance,
  getMonthlyAttendance,
  addManualPunch,
  addManualFullDay,
  addManualFullDayBulk,
  updatePunch,
  deletePunch,
  computeDayStatus,
  computeHoursBasedDayStatus,
  computeHoursInsideForHoursBasedPayroll,
  getHoursBasedDailyPresence,
  attributedShiftStartDateStr,
};
