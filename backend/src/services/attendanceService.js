const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const {
  istYmdFromDate,
  istYmdParts,
  istDayBounds,
  todayIstYmd,
  SQL_PUNCH_IST_DATE,
} = require('../utils/istDate');

// Company timezone for shift/late calculations. Server may run in UTC, but punches and shifts are in company local time.
// Set COMPANY_TIMEZONE=Asia/Kolkata for Indian deployments. Defaults to Asia/Kolkata.
const COMPANY_TZ = process.env.COMPANY_TIMEZONE || 'Asia/Kolkata';

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

function rowToShiftConfig(row) {
  const [startHour, startMinute] = row.start_time.split(':').map(Number);
  const [endHour, endMinute] = row.end_time.split(':').map(Number);
  const shiftMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  const shiftMs = shiftMinutes * 60 * 1000;
  const graceMs = Number(row.grace_minutes || 0) * 60 * 1000;
  const lunchMinutesAllotted = Number(row.lunch_minutes) >= 0 ? Number(row.lunch_minutes) : 60;
  const attendanceMode =
    (row.attendance_mode || 'shift_based').toLowerCase() === 'hours_based'
      ? 'hours_based'
      : 'shift_based';
  const requiredHoursPerDay = Number(row.required_hours_per_day || 8);
  const overtimeAllowed = row.allow_overtime === true || row.allow_overtime === 'true';
  return {
    startHour,
    startMinute,
    endHour,
    endMinute,
    shiftMs,
    graceMs,
    lunchMinutesAllotted,
    attendanceMode,
    requiredHoursPerDay,
    overtimeAllowed,
  };
}

/**
 * Get shift config for a company (start/end/grace in ms).
 * Uses same logic as payroll for consistency.
 */
async function getShiftConfig(companyId) {
  const result = await pool.query(
    `SELECT start_time, end_time, grace_minutes, lunch_minutes, attendance_mode, required_hours_per_day, allow_overtime
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
    `SELECT start_time, end_time, grace_minutes, lunch_minutes, attendance_mode, required_hours_per_day, allow_overtime
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
    `SELECT id, start_time, end_time, grace_minutes, lunch_minutes, attendance_mode, required_hours_per_day
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
 * Compute present, late, overtime, full-day, left-during-lunch, and lunch duration for one day's logs.
 * Expects 4-punch pattern: 1=IN, 2=OUT (lunch start), 3=IN (lunch end), 4=OUT (end of day).
 * shiftConfig: { startHour, startMinute, shiftMs, graceMs, lunchMinutesAllotted }
 * calendarDateStr: YYYY-MM-DD attendance day in IST
 */
function computeDayStatus(dayLogs, shiftConfig, calendarDateStr) {
  const empty = {
    present: false,
    late: false,
    overtimeHours: 0,
    fullDay: false,
    leftDuringLunch: false,
    lunchMinutes: null,
    lunchMinutesAllotted: shiftConfig.lunchMinutesAllotted ?? 60,
    lunchOverMinutes: null,
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

  const present = workedMs > 0 || firstInTime != null;
  const punchCount = sorted.length;

  // Full day = 4 punches (IN, OUT, IN, OUT) — completed both sessions and came back from lunch
  const fullDay = punchCount >= 4 && sorted[punchCount - 1].punch_type?.toLowerCase() === 'out';

  // Left during lunch = exactly 2 punches (IN, OUT) — went out for lunch and never punched back IN
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

  // Build shift start on the same calendar day as the first punch, in company timezone (e.g. IST).
  // Server may run in UTC; "9:30" must mean 9:30 AM company local, not UTC.
  let shiftStartMs;
  if (firstInTime != null) {
    const { year: y, month: mo, day: dd } = istYmdParts(firstInTime);
    shiftStartMs = getShiftStartMsForDate(y, mo, dd, shiftConfig.startHour, shiftConfig.startMinute);
  } else {
    const [y, mo, dd] = calendarDateStr.split('-').map(Number);
    shiftStartMs = getShiftStartMsForDate(y, mo, dd, shiftConfig.startHour, shiftConfig.startMinute);
  }
  const late =
    present &&
    firstInTime != null &&
    firstInTime.getTime() > shiftStartMs + shiftConfig.graceMs;

  const overtimeMs = Math.max(
    0,
    workedMs - shiftConfig.shiftMs - shiftConfig.graceMs
  );
  const overtimeHours = overtimeMs / (60 * 60 * 1000);
  const midpointMs = shiftStartMs + (shiftConfig.shiftMs || 0) / 2;

  let halfDay = false;
  if (present && !fullDay && !leftDuringLunch && midpointMs) {
    if (lastOutTime && lastOutTime.getTime() < midpointMs) {
      halfDay = true;
    } else if (firstInTime && firstInTime.getTime() > midpointMs) {
      halfDay = true;
    }
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

function computeHoursBasedDayStatus(dayLogs, shiftConfig, bounds) {
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
    minutesLate: 0,
  };
  if (!dayLogs.length) return empty;

  const sorted = [...dayLogs].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );

  let totalMinutesInside = 0;
  let lastIn = null;
  let firstInTime = null;
  const dayEndMs = bounds.end.getTime();
  const nowMs = Date.now();
  const maxSessionMinutes = 24 * 60;

  for (const log of sorted) {
    const t = new Date(log.punch_time);
    const type = (log.punch_type || '').toLowerCase();
    if (type === 'in') {
      if (!firstInTime) firstInTime = t;
      lastIn = t;
    } else if (type === 'out' && lastIn) {
      const diffMinutes = (t - lastIn) / (60 * 1000);
      if (diffMinutes >= 0 && diffMinutes <= maxSessionMinutes) {
        totalMinutesInside += diffMinutes;
      }
      lastIn = null;
    }
  }

  // If employee is still inside (IN without matching OUT), count ongoing time
  // up to now for today's date, otherwise up to day-end for historical dates.
  if (lastIn) {
    const activeSessionEndMs = Math.min(dayEndMs, nowMs);
    const diffMinutes = (activeSessionEndMs - lastIn.getTime()) / (60 * 1000);
    if (diffMinutes >= 0 && diffMinutes <= maxSessionMinutes) {
      totalMinutesInside += diffMinutes;
    }
  }

  const totalHoursInside = totalMinutesInside / 60;
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
  const sorted = [...dayLogs].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );
  const lastPunch = sorted[sorted.length - 1];
  return String(lastPunch?.punch_type || '').toLowerCase() === 'in';
}

/**
 * Ensure auto OUT punches are inserted for a given date for all employees in the company.
 * This is used so that both daily attendance views and payroll calculations see a closed day
 * when staff forgot to punch OUT.
 *
 * Rules:
 * - For each employee/day where the last punch is an IN and there is no OUT after it, insert
 *   an OUT at shift end time with device_id = 'auto_out'.
 * - Do not insert for today if current time is before shift end time.
 * - If overtime is allowed for the shift, wait until the next calendar day before auto closing.
 */
async function ensureAutoOutForDate(companyId, dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const [, y, m, d] = match;
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const dayNum = parseInt(d, 10);

  const now = new Date();
  const isToday = todayIstYmd() === dateStr;

  const client = await pool.connect();
  try {
    const employeesResult = await client.query(
      `SELECT id, shift_id
       FROM employees
       WHERE company_id = $1 AND status = 'active'`,
      [companyId]
    );
    const employees = employeesResult.rows;
    if (employees.length === 0) {
      return;
    }

    const shiftConfigMap = await getShiftConfigMap(
      companyId,
      employees.map((e) => e.shift_id)
    );

    const employeeIds = employees.map((e) => e.id);
    const logsResult = await client.query(
      `SELECT employee_id, punch_time, punch_type
       FROM attendance_logs
       WHERE company_id = $1
         AND employee_id = ANY($2::bigint[])
         AND ${SQL_PUNCH_IST_DATE} = $3::date
       ORDER BY punch_time ASC`,
      [companyId, employeeIds, dateStr]
    );

    const logsByEmployee = new Map();
    for (const row of logsResult.rows) {
      const eid = row.employee_id;
      if (!logsByEmployee.has(eid)) logsByEmployee.set(eid, []);
      logsByEmployee.get(eid).push({
        punch_time: row.punch_time,
        punch_type: (row.punch_type || '').toLowerCase(),
      });
    }

    for (const emp of employees) {
      const dayLogs = logsByEmployee.get(emp.id) || [];
      if (!dayLogs.length) continue;
      const sorted = [...dayLogs].sort(
        (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
      );
      const last = sorted[sorted.length - 1];
      if ((last.punch_type || '').toLowerCase() !== 'in') {
        continue;
      }

      const shiftConfig =
        shiftConfigMap.get(emp.shift_id) || shiftConfigMap.get(null);

      const shiftStartMs = getShiftStartMsForDate(
        year,
        month,
        dayNum,
        shiftConfig.startHour,
        shiftConfig.startMinute
      );
      const shiftEndMs = shiftStartMs + (shiftConfig.shiftMs || 0);

      if (isToday) {
        const nowMs = now.getTime();
        if (nowMs < shiftEndMs) {
          continue;
        }
        if (shiftConfig.overtimeAllowed) {
          continue;
        }
      } else if (shiftConfig.overtimeAllowed) {
        const todayStr = todayIstYmd();
        if (todayStr <= dateStr) {
          continue;
        }
      }

      const shiftEndDate = new Date(shiftEndMs);
      await client.query(
        `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id)
         VALUES ($1, $2, $3, 'out', 'auto_out')
         ON CONFLICT (employee_id, punch_time) DO NOTHING`,
        [companyId, emp.id, shiftEndDate.toISOString()]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Ensure auto OUT punches exist for the entire month for a specific employee.
 * Used by payroll calculations that operate on a month at a time.
 */
async function ensureAutoOutForMonth(companyId, employeeId, year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // Reuse company-wide helper – it is safe to call multiple times.
    // It will only ever insert missing auto_out punches.
    // We do not currently restrict to one employee to keep query logic simple.
    // (attendance_logs inserts are idempotent via ON CONFLICT.)
    // eslint-disable-next-line no-await-in-loop
    await ensureAutoOutForDate(companyId, dateStr);
  }
}

/**
 * GET daily attendance: per-employee status for one date.
 * @param {number} companyId
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} [employeeId] - optional filter
 * @returns {Promise<Array<{ employee_id, name, employee_code, present, late, overtime_hours }>>}
 */
async function getDailyAttendance(companyId, dateStr, employeeId = null, department = null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const bounds = istDayBounds(dateStr);
  const isCurrentDate = todayIstYmd() === dateStr;

  await ensureAutoOutForDate(companyId, dateStr);

  const client = await pool.connect();
  try {
    let employeesResult;
    const dept = department ? String(department).trim() : null;
    let employeesQuery = `SELECT id, name, employee_code, shift_id
      FROM employees
      WHERE company_id = $1 AND status = 'active'`;
    const params = [companyId];

    if (employeeId) {
      employeesQuery += ` AND id = $${params.length + 1}`;
      params.push(employeeId);
    }

    if (dept) {
      employeesQuery += ` AND department = $${params.length + 1}`;
      params.push(dept);
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

    const logsResult = await client.query(
      `SELECT id, employee_id, punch_time, punch_type, device_id
       FROM attendance_logs
       WHERE company_id = $1
         AND employee_id = ANY($2::bigint[])
         AND ${SQL_PUNCH_IST_DATE} = $3::date
       ORDER BY punch_time ASC`,
      [companyId, ids, dateStr]
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
      const rawDayLogs = logsByEmployee.get(emp.id) || [];
      const dayLogs = normalizePunchTypesByOrder(rawDayLogs);
      const shiftConfig =
        shiftConfigMap.get(emp.shift_id) || shiftConfigMap.get(null);
      const status =
        shiftConfig.attendanceMode === 'hours_based'
          ? computeHoursBasedDayStatus(dayLogs, shiftConfig, bounds)
          : computeDayStatus(dayLogs, shiftConfig, dateStr);
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
      return {
        employee_id: emp.id,
        name: emp.name,
        employee_code: emp.employee_code,
        present: presentForDaily,
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
  department = null
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

    if (employeeId) {
      employeesQuery += ` AND id = $${params.length + 1}`;
      params.push(employeeId);
    }

    if (dept) {
      employeesQuery += ` AND department = $${params.length + 1}`;
      params.push(dept);
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

    const logsResult = await client.query(
       `SELECT employee_id, punch_time, punch_type
       FROM attendance_logs
       WHERE company_id = $1
         AND employee_id = ANY($2::bigint[])
         AND ${SQL_PUNCH_IST_DATE} >= $3::date
         AND ${SQL_PUNCH_IST_DATE} <= $4::date
       ORDER BY punch_time ASC`,
      [companyId, ids, monthFirstStr, monthLastStr]
    );

    const logsByEmployeeAndDay = new Map();
    for (const row of logsResult.rows) {
      const eid = row.employee_id;
      const punchTime = new Date(row.punch_time);
      const key = istYmdFromDate(punchTime);
      if (!logsByEmployeeAndDay.has(eid)) {
        logsByEmployeeAndDay.set(eid, new Map());
      }
      const byDay = logsByEmployeeAndDay.get(eid);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push({ punch_time: row.punch_time, punch_type: row.punch_type });
    }

    const employeesWithDays = [];
    for (const emp of employees) {
      const shiftConfig =
        shiftConfigMap.get(emp.shift_id) || shiftConfigMap.get(null);
      const byDay = logsByEmployeeAndDay.get(emp.id) || new Map();
      const days = [];
      for (let d = 1; d <= daysInMonth; d += 1) {
        const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const rawDayLogs = byDay.get(key) || [];
        const dayLogs = normalizePunchTypesByOrder(rawDayLogs);
        const dayBounds = istDayBounds(key);
        const status =
          shiftConfig.attendanceMode === 'hours_based'
            ? computeHoursBasedDayStatus(dayLogs, shiftConfig, dayBounds)
            : computeDayStatus(dayLogs, shiftConfig, key);
        days.push({
          date: key,
          day: d,
          present: status.present,
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
async function addManualPunch(companyId, { employeeId, punch_time: punchTimeParam, date, time, punchType }) {
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
      `SELECT id FROM employees WHERE company_id = $1 AND id = $2 AND status = 'active'`,
      [companyId, empId]
    );
    if (empCheck.rowCount === 0) {
      throw new AppError('Employee not found or inactive', 404);
    }

    const result = await client.query(
      `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id)
       VALUES ($1, $2, $3, $4, 'manual')
       ON CONFLICT (employee_id, punch_time) DO NOTHING
       RETURNING id, employee_id, punch_time, punch_type`,
      [companyId, empId, punchTime.toISOString(), punchTypeNorm]
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
async function addManualFullDay(companyId, { employeeId, date }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const empId = Number(employeeId);
  if (!empId) {
    throw new AppError('Valid employee_id is required', 400);
  }

  const shiftConfig = await getShiftConfig(companyId);
  const [, y, m, d] = match;
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const dayNum = parseInt(d, 10);

  // Use local time (not UTC) so 9 AM stays 9 AM in display when server is in company timezone
  const inTime = new Date(year, month - 1, dayNum, shiftConfig.startHour, shiftConfig.startMinute, 0);
  const lunchMs = (shiftConfig.lunchMinutesAllotted || 60) * 60 * 1000;
  const workBeforeLunchMs = Math.max(0, shiftConfig.shiftMs - lunchMs) / 2;
  const outLunchTime = new Date(inTime.getTime() + workBeforeLunchMs);
  const inLunchTime = new Date(outLunchTime.getTime() + lunchMs);
  const outTime = new Date(inTime.getTime() + shiftConfig.shiftMs);

  const client = await pool.connect();
  try {
    const empCheck = await client.query(
      `SELECT id FROM employees WHERE company_id = $1 AND id = $2 AND status = 'active'`,
      [companyId, empId]
    );
    if (empCheck.rowCount === 0) {
      throw new AppError('Employee not found or inactive', 404);
    }

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
        `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id)
         VALUES ($1, $2, $3, $4, 'manual')
         ON CONFLICT (employee_id, punch_time) DO NOTHING
         RETURNING id, punch_time, punch_type`,
        [companyId, empId, punchTime.toISOString(), punchType]
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
async function addManualFullDayBulk(companyId, { employeeIds, date }) {
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
      const r = await addManualFullDay(companyId, { employeeId: empId, date });
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
async function updatePunch(companyId, logId, { punch_time: punchTimeParam, punch_type: punchTypeParam }) {
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
async function deletePunch(companyId, logId) {
  const logIdNum = Number(logId);
  if (!logIdNum || logIdNum < 1) {
    throw new AppError('Valid log id is required', 400);
  }

  const client = await pool.connect();
  try {
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
  ensureAutoOutForDate,
  ensureAutoOutForMonth,
  computeDayStatus,
  computeHoursBasedDayStatus,
  getHoursBasedDailyPresence,
};
