const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { getMonthlyAttendance, getDailyAttendance } = require('./attendanceService');
const { getPayrollBreakdown, getWeeklyPayrollBreakdown } = require('./payrollService');
const {
  employeeHasEsiConfigured,
  employeeHasPfConfigured,
  formatStatutoryModeLabel,
} = require('../utils/statutoryDeductions');

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

function getDaysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function formatStatutoryRate(employee, kind) {
  const mode = kind === 'esi' ? employee.esi_mode : employee.pf_mode;
  const percent = kind === 'esi' ? employee.esi_percent : employee.pf_percent;
  const amount = kind === 'esi' ? employee.esi_amount : employee.pf_amount;
  if (String(mode || 'fixed').toLowerCase() === 'percentage') {
    return percent != null ? `${Number(percent)}%` : '';
  }
  return amount != null ? Number(amount) : 0;
}

async function loadStatutoryReportEmployees(companyId, year, month, kind, allowedBranchIds) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return { year: y, month: m, employees: [] };
  }

  const params = [companyId];
  let branchClause = '';
  if (allowedBranchIds != null) {
    branchClause = ' AND e.branch_id = ANY($2::bigint[])';
    params.push(allowedBranchIds);
  }

  const configuredClause =
    kind === 'esi'
      ? `(
          (COALESCE(e.esi_mode, 'fixed') = 'fixed' AND COALESCE(e.esi_amount, 0) > 0)
          OR (e.esi_mode = 'percentage' AND COALESCE(e.esi_percent, 0) > 0)
        )`
      : `(
          (COALESCE(e.pf_mode, 'fixed') = 'fixed' AND COALESCE(e.pf_amount, 0) > 0)
          OR (e.pf_mode = 'percentage' AND COALESCE(e.pf_percent, 0) > 0)
        )`;

  const result = await pool.query(
    `SELECT
        e.id,
        e.employee_code,
        e.name,
        e.esi_number,
        e.esi_mode,
        e.esi_percent,
        e.esi_amount,
        e.pf_mode,
        e.pf_percent,
        e.pf_amount,
        e.payroll_frequency
     FROM employees e
     WHERE e.company_id = $1
       AND e.status = 'active'
       AND ${configuredClause}${branchClause}
     ORDER BY e.name`,
    params
  );

  return { year: y, month: m, employees: result.rows };
}

async function getStatutoryBreakdownForEmployee(companyId, employee, year, month) {
  const monthLastDay = getDaysInMonth(year, month);
  const monthLastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(monthLastDay).padStart(2, '0')}`;

  if (String(employee.payroll_frequency || 'monthly').toLowerCase() === 'weekly') {
    const weekResult = await pool.query(
      `SELECT week_start_date
       FROM weekly_payroll_records
       WHERE company_id = $1
         AND employee_id = $2
         AND week_end_date = $3`,
      [companyId, employee.id, monthLastDayStr]
    );
    if (weekResult.rowCount === 0) return null;
    const weekStart = String(weekResult.rows[0].week_start_date).slice(0, 10);
    return getWeeklyPayrollBreakdown(companyId, employee.id, weekStart);
  }

  const payrollResult = await pool.query(
    `SELECT id
     FROM payroll_records
     WHERE company_id = $1 AND employee_id = $2 AND year = $3 AND month = $4`,
    [companyId, employee.id, year, month]
  );
  if (payrollResult.rowCount === 0) return null;
  return getPayrollBreakdown(companyId, employee.id, year, month);
}

/**
 * Monthly ESI statement CSV.
 */
async function getEsiReportCsv(companyId, year, month, allowedBranchIds = null) {
  const { year: y, month: m, employees } = await loadStatutoryReportEmployees(
    companyId,
    year,
    month,
    'esi',
    allowedBranchIds
  );

  const header = [
    'Name',
    'ESI Number',
    'Gross Wages',
    'ESI Deduction',
  ];
  const rows = [];

  for (const employee of employees) {
    if (!employeeHasEsiConfigured(employee)) continue;
    const breakdown = await getStatutoryBreakdownForEmployee(companyId, employee, y, m);
    if (!breakdown?.breakdown) continue;
    const b = breakdown.breakdown;
    const deduction = Number(b.esiDeduction || 0);
    if (deduction <= 0) continue;
    rows.push([
      employee.name,
      employee.esi_number || '',
      b.grossSalary ?? '',
      deduction,
    ]);
  }

  return toCsv(header, rows);
}

/**
 * Monthly PF statement CSV.
 */
async function getPfReportCsv(companyId, year, month, allowedBranchIds = null) {
  const { year: y, month: m, employees } = await loadStatutoryReportEmployees(
    companyId,
    year,
    month,
    'pf',
    allowedBranchIds
  );

  const header = [
    'Employee Code',
    'Name',
    'Type',
    'Rate',
    'Earned Basic',
    'PF Deduction',
  ];
  const rows = [];

  for (const employee of employees) {
    if (!employeeHasPfConfigured(employee)) continue;
    const breakdown = await getStatutoryBreakdownForEmployee(companyId, employee, y, m);
    if (!breakdown?.breakdown) continue;
    const b = breakdown.breakdown;
    const deduction = Number(b.pfDeduction || 0);
    if (deduction <= 0) continue;
    rows.push([
      employee.employee_code,
      employee.name,
      formatStatutoryModeLabel(employee.pf_mode),
      formatStatutoryRate(employee, 'pf'),
      b.basicSalary ?? '',
      deduction,
    ]);
  }

  return toCsv(header, rows);
}

const PAYMENT_MODE_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  cheque: 'Cheque',
  other: 'Other',
};

/**
 * Salary payment ledger CSV for a month (by payment date within payroll period).
 */
async function getSalaryPaymentsReportCsv(companyId, year, month, allowedBranchIds = null) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    throw new AppError('Valid year and month are required', 400);
  }

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    const header = [
      'Payment Date',
      'Employee Code',
      'Employee Name',
      'Period',
      'Amount',
      'Payment Mode',
      'Reference',
      'Notes',
      'Net Salary',
      'Total Paid (period)',
      'Balance Due',
      'Status',
    ];
    return toCsv(header, []);
  }

  const conditions = ['sp.company_id = $1', '(p.year = $2 AND p.month = $3)'];
  const params = [companyId, y, m];
  let paramIndex = 4;

  if (allowedBranchIds != null) {
    conditions.push(`e.branch_id = ANY($${paramIndex}::bigint[])`);
    params.push(allowedBranchIds);
    paramIndex += 1;
  }

  const result = await pool.query(
    `SELECT
        sp.payment_date,
        e.employee_code,
        e.name AS employee_name,
        to_char(make_date(p.year, p.month, 1), 'FMMonth YYYY') AS period_label,
        sp.amount,
        sp.payment_mode,
        sp.reference_number,
        sp.notes,
        p.net_salary,
        (
          SELECT COALESCE(SUM(sp2.amount), 0)
          FROM employee_salary_payments sp2
          WHERE sp2.payroll_record_id = sp.payroll_record_id
        ) AS payroll_total_paid
     FROM employee_salary_payments sp
     INNER JOIN employees e ON e.id = sp.employee_id AND e.company_id = sp.company_id
     INNER JOIN payroll_records p ON p.id = sp.payroll_record_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sp.payment_date ASC, e.name ASC, sp.id ASC`,
    params
  );

  const header = [
    'Payment Date',
    'Employee Code',
    'Employee Name',
    'Period',
    'Amount',
    'Payment Mode',
    'Reference',
    'Notes',
    'Net Salary',
    'Total Paid (period)',
    'Balance Due',
    'Status',
  ];

  const rows = result.rows.map((row) => {
    const net = Number(row.net_salary || 0);
    const totalPaid = Number(row.payroll_total_paid || 0);
    const balance = Math.max(0, net - totalPaid);
    let status = 'paid';
    if (totalPaid <= 0) status = 'unpaid';
    else if (totalPaid < net) status = 'partial';

    return [
      String(row.payment_date).slice(0, 10),
      row.employee_code,
      row.employee_name,
      row.period_label,
      row.amount,
      PAYMENT_MODE_LABELS[row.payment_mode] || row.payment_mode,
      row.reference_number || '',
      row.notes || '',
      net,
      totalPaid,
      balance,
      status,
    ];
  });

  return toCsv(header, rows);
}

module.exports = {
  getAttendanceReportCsv,
  getPayrollReportCsv,
  getOvertimeReportCsv,
  getDailyReportCsv,
  getEsiReportCsv,
  getPfReportCsv,
  getSalaryPaymentsReportCsv,
};
