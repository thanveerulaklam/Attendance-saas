const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { getMonthlyAttendance, getDailyAttendance } = require('./attendanceService');

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
async function getAttendanceReportCsv(companyId, year, month, allowedBranchIds = null) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const data = await getMonthlyAttendance(companyId, y, m, null, null, allowedBranchIds);
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
async function getPayrollReportCsv(companyId, year, month, allowedBranchIds = null) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
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
    return toCsv(header, []);
  }

  const params = [companyId, y, m];
  let branchClause = '';
  if (allowedBranchIds != null) {
    branchClause = ' AND e.branch_id = ANY($4::bigint[])';
    params.push(allowedBranchIds);
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
     WHERE p.company_id = $1 AND p.year = $2 AND p.month = $3${branchClause}
     ORDER BY e.name`,
    params
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
async function getOvertimeReportCsv(companyId, year, month, allowedBranchIds = null) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  const data = await getMonthlyAttendance(companyId, y, m, null, null, allowedBranchIds);
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

function formatDailyStatus(row) {
  if (!row.present) return 'Absent';
  if (row.full_day) return row.late ? 'Full day (late)' : 'Full day';
  if (row.half_day) return row.late ? 'Half day (late)' : 'Half day';
  if (row.left_during_lunch) return 'Left at lunch';
  return row.late ? 'Present (late)' : 'Present';
}

function formatPunchTimingsForCsv(punches) {
  const list = Array.isArray(punches) ? punches : [];
  if (list.length === 0) return '';
  return list
    .map((p) => {
      const t = p.punch_time ? new Date(p.punch_time) : null;
      const timeLabel =
        t && !Number.isNaN(t.getTime())
          ? t.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : '';
      const typeLabel = String(p.punch_type || '').toLowerCase() === 'out' ? 'OUT' : 'IN';
      return timeLabel ? `${timeLabel} (${typeLabel})` : '';
    })
    .filter(Boolean)
    .join(', ');
}

function formatDailyTotalHours(row) {
  if (row.total_hours_inside != null) return row.total_hours_inside;
  if (row.total_hours_from_shift_start != null) return row.total_hours_from_shift_start;
  return '';
}

/**
 * Daily attendance report CSV for a single date.
 * Columns: Employee Code, Name, Branch, Date, Status, Late, Full Day, Punch Timings, Total Hours, Overtime Hours
 */
async function getDailyReportCsv(companyId, dateStr, department = null, allowedBranchIds = null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) {
    throw new AppError('Valid date (YYYY-MM-DD) is required', 400);
  }

  const dept = department ? String(department).trim() : null;
  const rows = await getDailyAttendance(companyId, dateStr.trim(), null, dept, allowedBranchIds);
  const header = [
    'Employee Code',
    'Name',
    'Branch',
    'Date',
    'Status',
    'Late',
    'Full Day',
    'Punch Timings',
    'Total Hours',
    'Overtime Hours',
  ];
  const dataRows = rows.map((row) => [
    row.employee_code,
    row.name,
    row.branch_name || '',
    dateStr.trim(),
    formatDailyStatus(row),
    row.late ? 'Yes' : 'No',
    row.full_day ? 'Yes' : 'No',
    formatPunchTimingsForCsv(row.punches),
    formatDailyTotalHours(row),
    row.overtime_hours ?? 0,
  ]);
  return toCsv(header, dataRows);
}

module.exports = {
  getAttendanceReportCsv,
  getPayrollReportCsv,
  getOvertimeReportCsv,
  getDailyReportCsv,
};
