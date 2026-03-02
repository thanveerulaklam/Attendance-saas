const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { getMonthlyAttendance } = require('./attendanceService');

/**
 * Escape a value for CSV (wrap in quotes if needed, escape internal quotes).
 */
function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  if (/[,"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build CSV string from header row and data rows (arrays of values).
 */
function toCsv(headerRow, dataRows) {
  const header = headerRow.map(escapeCsvCell).join(',');
  const rows = dataRows.map((row) => row.map(escapeCsvCell).join(','));
  return [header, ...rows].join('\r\n');
}

/**
 * Monthly attendance report CSV.
 * Columns: Employee Code, Name, Year, Month, Present Days, Absent Days, Late Days, Overtime Hours
 */
async function getAttendanceReportCsv(companyId, year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const data = await getMonthlyAttendance(companyId, y, m, null);
  const header = [
    'Employee Code',
    'Name',
    'Year',
    'Month',
    'Present Days',
    'Absent Days',
    'Late Days',
    'Overtime Hours',
  ];
  const rows = (data.employees || []).map((emp) => {
    const lateDays = (emp.days || []).filter((d) => d.late).length;
    return [
      emp.employee_code,
      emp.name,
      data.year,
      data.month,
      emp.summary?.presentDays ?? 0,
      emp.summary?.absenceDays ?? 0,
      lateDays,
      emp.summary?.overtimeHours ?? 0,
    ];
  });
  return toCsv(header, rows);
}

/**
 * Payroll report CSV from payroll_records.
 * Columns: Employee Code, Name, Year, Month, Present Days, Total Days, Overtime Hours, Gross Salary, Deductions, Net Salary
 */
async function getPayrollReportCsv(companyId, year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const result = await pool.query(
    `SELECT
        p.employee_id,
        p.year,
        p.month,
        p.total_days,
        p.present_days,
        p.overtime_hours,
        p.gross_salary,
        p.deductions,
        p.salary_advance,
        p.no_leave_incentive,
        p.net_salary,
        e.name AS employee_name,
        e.employee_code
     FROM payroll_records p
     INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
     WHERE p.company_id = $1 AND p.year = $2 AND p.month = $3
     ORDER BY e.name`,
    [companyId, y, m]
  );

  const header = [
    'Employee Code',
    'Name',
    'Year',
    'Month',
    'Present Days',
    'Total Days',
    'Overtime Hours',
    'Gross Salary',
    'Deductions',
    'No Leave Incentive',
    'Net Salary',
  ];
  const rows = result.rows.map((row) => [
    row.employee_code,
    row.employee_name,
    row.year,
    row.month,
    row.present_days,
    row.total_days,
    row.overtime_hours,
    row.gross_salary,
    row.deductions,
    row.no_leave_incentive ?? 0,
    row.net_salary,
  ]);
  return toCsv(header, rows);
}

/**
 * Overtime summary CSV (from monthly attendance data).
 * Columns: Employee Code, Name, Year, Month, Overtime Hours
 */
async function getOvertimeReportCsv(companyId, year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const data = await getMonthlyAttendance(companyId, y, m, null);
  const header = ['Employee Code', 'Name', 'Year', 'Month', 'Overtime Hours'];
  const rows = (data.employees || []).map((emp) => [
    emp.employee_code,
    emp.name,
    data.year,
    data.month,
    emp.summary?.overtimeHours ?? 0,
  ]);
  return toCsv(header, rows);
}

module.exports = {
  getAttendanceReportCsv,
  getPayrollReportCsv,
  getOvertimeReportCsv,
};
