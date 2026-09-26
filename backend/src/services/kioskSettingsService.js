const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { createEmployee } = require('./employeeService');
const { suggestNextEmployeeCode } = require('../utils/employeeCode');

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

async function listCompanyEmployeeCodes(companyId) {
  const result = await pool.query(
    `SELECT employee_code FROM employees WHERE company_id = $1`,
    [companyId]
  );
  return result.rows.map((row) => row.employee_code);
}

function parseKioskEmployeeBody(body = {}) {
  const name = String(body.name || '').trim();
  const employeeCode = String(body.employee_code || '').trim();
  const salary = Number(body.basic_salary);
  const joinDate = String(body.join_date || '').trim();
  const salaryType = String(body.salary_type || 'monthly').toLowerCase();

  if (name.length < 2) {
    throw new AppError('Name must be at least 2 characters.', 400);
  }
  if (!employeeCode) {
    throw new AppError('Employee code is required.', 400);
  }
  if (employeeCode.length > 50) {
    throw new AppError('Employee code must be 50 characters or fewer.', 400);
  }
  if (!Number.isFinite(salary) || salary <= 0) {
    throw new AppError('Basic salary must be a positive number.', 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinDate) || Number.isNaN(new Date(`${joinDate}T00:00:00`).getTime())) {
    throw new AppError('Join date must be YYYY-MM-DD.', 400);
  }
  if (salaryType !== 'monthly' && salaryType !== 'per_day') {
    throw new AppError('Salary type must be monthly or per day.', 400);
  }

  return { name, employeeCode, salary, joinDate, salaryType };
}

async function createKioskEmployee(kiosk, body) {
  const parsed = parseKioskEmployeeBody(body);
  const shift = await pool.query(
    `SELECT id FROM shifts WHERE company_id = $1 ORDER BY id ASC LIMIT 1`,
    [kiosk.company_id]
  );

  return createEmployee(
    kiosk.company_id,
    {
      name: parsed.name,
      employee_code: parsed.employeeCode,
      basic_salary: parsed.salary,
      join_date: parsed.joinDate,
      status: 'active',
      branch_id: kiosk.branch_id,
      payroll_frequency: 'monthly',
      salary_type: parsed.salaryType,
      ...(shift.rowCount ? { shift_id: Number(shift.rows[0].id) } : {}),
    },
    { role: 'admin' }
  );
}

async function suggestKioskEmployeeCode(companyId) {
  const codes = await listCompanyEmployeeCodes(companyId);
  return suggestNextEmployeeCode(codes);
}

module.exports = {
  assertEmployeeAtKioskBranch,
  listKioskAttendanceLogs,
  createKioskEmployee,
  suggestKioskEmployeeCode,
};
