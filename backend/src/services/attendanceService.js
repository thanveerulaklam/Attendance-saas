const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

/**
 * Get shift config for a company (start/end/grace in ms).
 * Uses same logic as payroll for consistency.
 */
async function getShiftConfig(companyId) {
  const result = await pool.query(
    `SELECT start_time, end_time, grace_minutes, lunch_minutes
     FROM shifts
     WHERE company_id = $1
     ORDER BY id
     LIMIT 1`,
    [companyId]
  );

  if (result.rowCount === 0) {
    throw new AppError('No shift configured for company', 400);
  }

  const row = result.rows[0];
  const [startHour, startMinute] = row.start_time.split(':').map(Number);
  const [endHour, endMinute] = row.end_time.split(':').map(Number);
  const shiftMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  const shiftMs = shiftMinutes * 60 * 1000;
  const graceMs = Number(row.grace_minutes || 0) * 60 * 1000;
  const lunchMinutesAllotted = Number(row.lunch_minutes) >= 0 ? Number(row.lunch_minutes) : 60;

  return {
    startHour,
    startMinute,
    shiftMs,
    graceMs,
    lunchMinutesAllotted,
  };
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
 * dayStart: Date at 00:00:00 UTC for the day
 */
function computeDayStatus(dayLogs, shiftConfig, dayStart) {
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

  const shiftStartMs =
    dayStart.getTime() +
    (shiftConfig.startHour * 60 + shiftConfig.startMinute) * 60 * 1000;
  const late =
    present &&
    firstInTime != null &&
    firstInTime.getTime() > shiftStartMs + shiftConfig.graceMs;

  const overtimeMs = Math.max(
    0,
    workedMs - shiftConfig.shiftMs - shiftConfig.graceMs
  );
  const overtimeHours = overtimeMs / (60 * 60 * 1000);

  return {
    present,
    late,
    overtimeHours,
    fullDay,
    leftDuringLunch,
    lunchMinutes,
    lunchMinutesAllotted: allotted,
    lunchOverMinutes: lunchOverMinutes !== null ? lunchOverMinutes : null,
  };
}

/**
 * GET daily attendance: per-employee status for one date.
 * @param {number} companyId
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} [employeeId] - optional filter
 * @returns {Promise<Array<{ employee_id, name, employee_code, present, late, overtime_hours }>>}
 */
async function getDailyAttendance(companyId, dateStr, employeeId = null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const [, y, m, d] = match;
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const dayNum = parseInt(d, 10);
  const dayStart = new Date(Date.UTC(year, month - 1, dayNum, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, dayNum + 1, 0, 0, 0));

  const client = await pool.connect();
  try {
    const shiftConfig = await getShiftConfig(companyId);

    let employeesResult;
    if (employeeId) {
      employeesResult = await client.query(
        `SELECT id, name, employee_code
         FROM employees
         WHERE company_id = $1 AND id = $2 AND status = 'active'`,
        [companyId, employeeId]
      );
    } else {
      employeesResult = await client.query(
        `SELECT id, name, employee_code
         FROM employees
         WHERE company_id = $1 AND status = 'active'
         ORDER BY name`,
        [companyId]
      );
    }

    const employees = employeesResult.rows;
    if (employees.length === 0) {
      return [];
    }

    const ids = employees.map((e) => e.id);

    const logsResult = await client.query(
      `SELECT employee_id, punch_time, punch_type
       FROM attendance_logs
       WHERE company_id = $1
         AND employee_id = ANY($2::bigint[])
         AND punch_time >= $3
         AND punch_time < $4
       ORDER BY punch_time ASC`,
      [companyId, ids, dayStart.toISOString(), dayEnd.toISOString()]
    );

    const logsByEmployee = new Map();
    for (const row of logsResult.rows) {
      const eid = row.employee_id;
      if (!logsByEmployee.has(eid)) {
        logsByEmployee.set(eid, []);
      }
      logsByEmployee.get(eid).push({
        punch_time: row.punch_time,
        punch_type: row.punch_type,
      });
    }

    return employees.map((emp) => {
      const rawDayLogs = logsByEmployee.get(emp.id) || [];
      const dayLogs = normalizePunchTypesByOrder(rawDayLogs);
      const status = computeDayStatus(dayLogs, shiftConfig, dayStart);
      const punches = dayLogs.map((l) => ({
        punch_time: l.punch_time,
        punch_type: (l.punch_type || '').toLowerCase(),
      }));
      return {
        employee_id: emp.id,
        name: emp.name,
        employee_code: emp.employee_code,
        present: status.present,
        late: status.late,
        overtime_hours: Math.round(status.overtimeHours * 100) / 100,
        full_day: status.fullDay,
        left_during_lunch: status.leftDuringLunch,
        lunch_minutes: status.lunchMinutes,
        lunch_minutes_allotted: status.lunchMinutesAllotted,
        lunch_over_minutes: status.lunchOverMinutes,
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
async function getMonthlyAttendance(companyId, year, month, employeeId = null) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(y, m, 1, 0, 0, 0));

  const client = await pool.connect();
  try {
    const shiftConfig = await getShiftConfig(companyId);

    let employeesResult;
    if (employeeId) {
      employeesResult = await client.query(
        `SELECT id, name, employee_code
         FROM employees
         WHERE company_id = $1 AND id = $2 AND status = 'active'`,
        [companyId, employeeId]
      );
    } else {
      employeesResult = await client.query(
        `SELECT id, name, employee_code
         FROM employees
         WHERE company_id = $1 AND status = 'active'
         ORDER BY name`,
        [companyId]
      );
    }

    const employees = employeesResult.rows;
    if (employees.length === 0) {
      return { year: y, month: m, daysInMonth, employees: [] };
    }

    const ids = employees.map((e) => e.id);

    const logsResult = await client.query(
      `SELECT employee_id, punch_time, punch_type
       FROM attendance_logs
       WHERE company_id = $1
         AND employee_id = ANY($2::bigint[])
         AND punch_time >= $3
         AND punch_time < $4
       ORDER BY punch_time ASC`,
      [companyId, ids, monthStart.toISOString(), monthEnd.toISOString()]
    );

    const logsByEmployeeAndDay = new Map();
    for (const row of logsResult.rows) {
      const eid = row.employee_id;
      const punchTime = new Date(row.punch_time);
      const key = punchTime.toISOString().slice(0, 10);
      if (!logsByEmployeeAndDay.has(eid)) {
        logsByEmployeeAndDay.set(eid, new Map());
      }
      const byDay = logsByEmployeeAndDay.get(eid);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push({ punch_time: row.punch_time, punch_type: row.punch_type });
    }

    const employeesWithDays = [];
    for (const emp of employees) {
      const byDay = logsByEmployeeAndDay.get(emp.id) || new Map();
      const days = [];
      for (let d = 1; d <= daysInMonth; d += 1) {
        const dayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
        const key = dayStart.toISOString().slice(0, 10);
        const rawDayLogs = byDay.get(key) || [];
        const dayLogs = normalizePunchTypesByOrder(rawDayLogs);
        const status = computeDayStatus(dayLogs, shiftConfig, dayStart);
        days.push({
          date: key,
          day: d,
          present: status.present,
          late: status.late,
          overtime_hours: Math.round(status.overtimeHours * 100) / 100,
          full_day: status.fullDay,
          left_during_lunch: status.leftDuringLunch,
          lunch_minutes: status.lunchMinutes,
          lunch_minutes_allotted: status.lunchMinutesAllotted,
          lunch_over_minutes: status.lunchOverMinutes,
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
 * @param {number} companyId
 * @param {object} params - { employeeId, date (YYYY-MM-DD), time (HH:mm), punchType ('in'|'out') }
 * @returns {Promise<{ inserted: number, punch: object }>}
 */
async function addManualPunch(companyId, { employeeId, date, time, punchType }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (!match) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
  }

  const punchTypeNorm = String(punchType || '').toLowerCase();
  if (punchTypeNorm !== 'in' && punchTypeNorm !== 'out') {
    throw new AppError('punch_type must be "in" or "out"', 400);
  }

  const empId = Number(employeeId);
  if (!empId) {
    throw new AppError('Valid employee_id is required', 400);
  }

  // Parse time HH:mm or HH:mm:ss
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time || '').trim());
  if (!timeMatch) {
    throw new AppError('Invalid time format. Use HH:mm (e.g. 09:00)', 400);
  }
  const [, h, m, s = '0'] = timeMatch;
  const punchTime = new Date(
    `${match[1]}-${match[2]}-${match[3]}T${h.padStart(2, '0')}:${m}:${s.padStart(2, '0')}`
  );
  if (isNaN(punchTime.getTime())) {
    throw new AppError('Invalid date/time', 400);
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

module.exports = {
  getDailyAttendance,
  getMonthlyAttendance,
  addManualPunch,
  addManualFullDay,
  addManualFullDayBulk,
};
