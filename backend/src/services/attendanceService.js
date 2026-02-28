const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

/**
 * Get shift config for a company (start/end/grace in ms).
 * Uses same logic as payroll for consistency.
 */
async function getShiftConfig(companyId) {
  const result = await pool.query(
    `SELECT start_time, end_time, grace_minutes
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

  return {
    startHour,
    startMinute,
    shiftMs,
    graceMs,
  };
}

/**
 * Compute present, late, overtime for one day's logs.
 * shiftConfig: { startHour, startMinute, shiftMs, graceMs }
 * dayStart: Date at 00:00:00 UTC for the day
 */
function computeDayStatus(dayLogs, shiftConfig, dayStart) {
  if (!dayLogs.length) {
    return { present: false, late: false, overtimeHours: 0 };
  }

  let workedMs = 0;
  let firstInTime = null;
  let currentIn = null;

  const sorted = [...dayLogs].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );

  for (const log of sorted) {
    const t = new Date(log.punch_time);
    const type = (log.punch_type || '').toLowerCase();
    if (type === 'in') {
      if (firstInTime == null) firstInTime = t;
      currentIn = t;
    } else if (type === 'out') {
      if (currentIn != null) {
        workedMs += Math.max(0, t - currentIn);
      }
      currentIn = null;
    }
  }

  // Present if they have worked time (IN+OUT pair) OR at least one check-in (IN only)
  const present = workedMs > 0 || firstInTime != null;

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

  return { present, late, overtimeHours };
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
      const dayLogs = logsByEmployee.get(emp.id) || [];
      const { present, late, overtimeHours } = computeDayStatus(
        dayLogs,
        shiftConfig,
        dayStart
      );
      return {
        employee_id: emp.id,
        name: emp.name,
        employee_code: emp.employee_code,
        present,
        late,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
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
        const dayLogs = byDay.get(key) || [];
        const { present, late, overtimeHours } = computeDayStatus(
          dayLogs,
          shiftConfig,
          dayStart
        );
        days.push({
          date: key,
          day: d,
          present,
          late,
          overtime_hours: Math.round(overtimeHours * 100) / 100,
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

module.exports = {
  getDailyAttendance,
  getMonthlyAttendance,
};
