const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

function parseDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return date;
}

async function assertEmployeeAtKioskBranch(companyId, branchId, employeeId) {
  const result = await pool.query(
    `SELECT id, name, employee_code, status, branch_id
     FROM employees
     WHERE company_id = $1 AND branch_id = $2 AND id = $3`,
    [companyId, branchId, employeeId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Employee not found at this branch', 404);
  }
  return result.rows[0];
}

async function listKioskAttendanceLogs(companyId, branchId, options = {}) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 7);
  defaultFrom.setHours(0, 0, 0, 0);

  const dateFrom = options.dateFrom
    ? parseDate(options.dateFrom, 'date_from')
    : defaultFrom;
  const dateTo = options.dateTo ? parseDate(options.dateTo, 'date_to') : now;
  if (dateFrom > dateTo) {
    throw new AppError('date_from must be before date_to', 400);
  }

  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (dateTo.getTime() - dateFrom.getTime() > maxRangeMs) {
    throw new AppError('Attendance log range cannot exceed 366 days', 400);
  }

  const params = [
    companyId,
    branchId,
    dateFrom.toISOString(),
    dateTo.toISOString(),
  ];
  let employeeFilter = '';
  if (options.employeeId) {
    params.push(Number(options.employeeId));
    employeeFilter = `AND al.employee_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT al.id, al.employee_id, al.punch_time, al.punch_type,
            e.name AS employee_name, e.employee_code
     FROM attendance_logs al
     INNER JOIN employees e
       ON e.id = al.employee_id AND e.company_id = al.company_id
     WHERE al.company_id = $1
       AND al.branch_id = $2
       AND al.device_id = 'kiosk'
       AND al.punch_time >= $3
       AND al.punch_time <= $4
       ${employeeFilter}
     ORDER BY al.punch_time DESC
     LIMIT 1000`,
    params
  );

  return {
    items: result.rows,
    date_from: dateFrom.toISOString(),
    date_to: dateTo.toISOString(),
  };
}

module.exports = {
  assertEmployeeAtKioskBranch,
  listKioskAttendanceLogs,
};
