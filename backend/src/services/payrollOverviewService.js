const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { todayYmd } = require('../utils/companyDate');
const { getCompanyTimezone } = require('./companyService');

const PRESETS = new Set(['last_month', 'last_6', 'last_12', 'custom']);
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function addMonths(year, month, delta) {
  const index = Number(year) * 12 + (Number(month) - 1) + Number(delta);
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

function monthKey(year, month) {
  return Number(year) * 12 + Number(month);
}

function eachMonth(from, to) {
  const months = [];
  let cursor = { year: from.year, month: from.month };
  const endKey = monthKey(to.year, to.month);
  while (monthKey(cursor.year, cursor.month) <= endKey) {
    months.push(cursor);
    cursor = addMonths(cursor.year, cursor.month, 1);
  }
  return months;
}

function monthLabel(year, month, withYear = false) {
  const name = MONTH_LABELS[Number(month) - 1] || '';
  return withYear ? `${name} ${year}` : name;
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function percent(part, whole) {
  const total = Number(whole || 0);
  if (total <= 0) return 0;
  return round1((Number(part || 0) / total) * 100);
}

/**
 * Last month, last 6, and last 12 end on the previous calendar month.
 * Custom is one chosen month.
 */
function buildPayrollOverviewRange(today, preset, year, month) {
  const choice = String(preset || 'last_month');
  if (!PRESETS.has(choice)) {
    throw new AppError('Choose last month, last 6 months, last 12 months, or a custom month', 400);
  }
  const [cy, cm] = String(today).slice(0, 10).split('-').map(Number);
  const last = addMonths(cy, cm, -1);
  if (choice === 'custom') {
    const y = Number(year);
    const m = Number(month);
    if (!y || m < 1 || m > 12) {
      throw new AppError('A valid year and month are required', 400);
    }
    return { preset: choice, from: { year: y, month: m }, to: { year: y, month: m } };
  }
  if (choice === 'last_month') {
    return { preset: choice, from: last, to: last };
  }
  const span = choice === 'last_6' ? 6 : 12;
  return {
    preset: choice,
    from: addMonths(last.year, last.month, -(span - 1)),
    to: last,
  };
}

function rangeLabel(from, to) {
  if (from.year === to.year && from.month === to.month) {
    return monthLabel(from.year, from.month, true);
  }
  return `${monthLabel(from.year, from.month, true)} – ${monthLabel(to.year, to.month, true)}`;
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function resolveBranchIds(allowedBranchIds, branchIdRaw) {
  const requested = branchIdRaw != null && String(branchIdRaw).trim() !== ''
    ? Number(branchIdRaw)
    : null;
  if (requested != null && !Number.isInteger(requested)) {
    throw new AppError('Invalid branch', 400);
  }
  if (allowedBranchIds == null) {
    return requested != null ? [requested] : null;
  }
  if (allowedBranchIds.length === 0) return [];
  if (requested == null) return allowedBranchIds.map(Number);
  if (!allowedBranchIds.map(Number).includes(requested)) return [];
  return [requested];
}

function emptyTotals() {
  return {
    employees: 0,
    records: 0,
    net_salary: 0,
    gross_salary: 0,
    deductions: 0,
    advance: 0,
    incentive: 0,
    overtime_hours: 0,
    paid: 0,
    outstanding: 0,
    present_days: 0,
    absence_days: 0,
    total_days: 0,
    leave_percentage: 0,
    attended_days: 0,
    late_days: 0,
    late_percentage: 0,
  };
}

async function getPayrollOverview(companyId, options = {}) {
  const tz = await getCompanyTimezone(companyId);
  const range = buildPayrollOverviewRange(
    todayYmd(tz),
    options.preset,
    options.year,
    options.month
  );
  const branchIds = resolveBranchIds(options.allowedBranchIds, options.branchId);
  const months = eachMonth(range.from, range.to);

  if (Array.isArray(branchIds) && branchIds.length === 0) {
    return {
      ...range,
      label: rangeLabel(range.from, range.to),
      totals: emptyTotals(),
      months: months.map((item) => ({
        ...item,
        label: monthLabel(item.year, item.month, months.length > 12),
        ...emptyTotals(),
      })),
      top_employees: [],
    };
  }

  const fromKey = monthKey(range.from.year, range.from.month);
  const toKey = monthKey(range.to.year, range.to.month);
  const fromDate = ymd(range.from.year, range.from.month, 1);
  const toDate = ymd(range.to.year, range.to.month, lastDay(range.to.year, range.to.month));

  const payrollParams = [companyId, fromKey, toKey];
  let branchSql = '';
  if (branchIds) {
    payrollParams.push(branchIds);
    branchSql = ` AND e.branch_id = ANY($${payrollParams.length}::bigint[])`;
  }

  const payrollResult = await pool.query(
    `SELECT
        p.year,
        p.month,
        COUNT(*)::int AS records,
        COUNT(DISTINCT p.employee_id)::int AS employees,
        COALESCE(SUM(p.net_salary), 0) AS net_salary,
        COALESCE(SUM(p.gross_salary), 0) AS gross_salary,
        COALESCE(SUM(p.deductions), 0) AS deductions,
        COALESCE(SUM(p.salary_advance), 0) AS advance,
        COALESCE(SUM(p.no_leave_incentive), 0) AS incentive,
        COALESCE(SUM(p.overtime_hours), 0) AS overtime_hours,
        COALESCE(SUM(p.present_days), 0) AS present_days,
        COALESCE(SUM(p.absence_days), 0) AS absence_days,
        COALESCE(SUM(p.total_days), 0) AS total_days,
        COALESCE(SUM(paid.amount), 0) AS paid
     FROM payroll_records p
     INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(sp.amount), 0) AS amount
       FROM employee_salary_payments sp
       WHERE sp.payroll_record_id = p.id
     ) paid ON true
     WHERE p.company_id = $1
       AND (p.year * 12 + p.month) BETWEEN $2 AND $3
       ${branchSql}
     GROUP BY p.year, p.month
     ORDER BY p.year, p.month`,
    payrollParams
  );

  const lateParams = [companyId, tz, fromDate, toDate];
  let lateBranchSql = '';
  if (branchIds) {
    lateParams.push(branchIds);
    lateBranchSql = ` AND e.branch_id = ANY($${lateParams.length}::bigint[])`;
  }

  const lateResult = await pool.query(
    `WITH days AS (
       SELECT
         (al.punch_time AT TIME ZONE $2)::date AS work_date,
         MIN(al.punch_time) FILTER (WHERE al.punch_type = 'in') AS first_in,
         s.start_time,
         COALESCE(s.grace_minutes, 0)::int AS grace_minutes
       FROM attendance_logs al
       INNER JOIN employees e ON e.id = al.employee_id AND e.company_id = al.company_id
       LEFT JOIN shifts s ON s.id = e.shift_id AND s.company_id = e.company_id
       WHERE al.company_id = $1
         AND (al.punch_time AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
         ${lateBranchSql}
       GROUP BY e.id, work_date, s.start_time, s.grace_minutes
     )
     SELECT
       EXTRACT(YEAR FROM work_date)::int AS year,
       EXTRACT(MONTH FROM work_date)::int AS month,
       COUNT(*) FILTER (WHERE first_in IS NOT NULL)::int AS attended_days,
       COUNT(*) FILTER (
         WHERE first_in IS NOT NULL
           AND start_time IS NOT NULL
           AND (first_in AT TIME ZONE $2)::time > (start_time + make_interval(mins => grace_minutes))
       )::int AS late_days
     FROM days
     GROUP BY 1, 2`,
    lateParams
  );

  const topParams = [companyId, fromKey, toKey];
  let topBranchSql = '';
  if (branchIds) {
    topParams.push(branchIds);
    topBranchSql = ` AND e.branch_id = ANY($${topParams.length}::bigint[])`;
  }
  const topResult = await pool.query(
    `SELECT
        e.id AS employee_id,
        e.name AS employee_name,
        e.employee_code,
        COALESCE(SUM(p.net_salary), 0) AS net_salary,
        COALESCE(SUM(p.salary_advance), 0) AS advance,
        COALESCE(SUM(p.absence_days), 0) AS absence_days,
        COALESCE(SUM(p.present_days), 0) AS present_days
     FROM payroll_records p
     INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
     WHERE p.company_id = $1
       AND (p.year * 12 + p.month) BETWEEN $2 AND $3
       ${topBranchSql}
     GROUP BY e.id, e.name, e.employee_code
     ORDER BY SUM(p.net_salary) DESC, e.name ASC
     LIMIT 8`,
    topParams
  );

  const payrollByKey = new Map(
    payrollResult.rows.map((row) => [monthKey(row.year, row.month), row])
  );
  const lateByKey = new Map(
    lateResult.rows.map((row) => [monthKey(row.year, row.month), row])
  );

  const monthRows = months.map((item) => {
    const key = monthKey(item.year, item.month);
    const payroll = payrollByKey.get(key);
    const late = lateByKey.get(key);
    const presentDays = round2(payroll?.present_days);
    const absenceDays = round2(payroll?.absence_days);
    const net = round2(payroll?.net_salary);
    const paid = round2(payroll?.paid);
    const attended = Number(late?.attended_days || 0);
    const lateDays = Number(late?.late_days || 0);
    return {
      year: item.year,
      month: item.month,
      label: monthLabel(item.year, item.month, months.length > 12),
      employees: Number(payroll?.employees || 0),
      records: Number(payroll?.records || 0),
      net_salary: net,
      gross_salary: round2(payroll?.gross_salary),
      deductions: round2(payroll?.deductions),
      advance: round2(payroll?.advance),
      incentive: round2(payroll?.incentive),
      overtime_hours: round2(payroll?.overtime_hours),
      paid,
      outstanding: round2(net - paid),
      present_days: presentDays,
      absence_days: absenceDays,
      total_days: round2(payroll?.total_days),
      leave_percentage: percent(absenceDays, presentDays + absenceDays),
      attended_days: attended,
      late_days: lateDays,
      late_percentage: percent(lateDays, attended),
    };
  });

  const totals = monthRows.reduce((sum, row) => {
    sum.employees = Math.max(sum.employees, row.employees);
    sum.records += row.records;
    sum.net_salary += row.net_salary;
    sum.gross_salary += row.gross_salary;
    sum.deductions += row.deductions;
    sum.advance += row.advance;
    sum.incentive += row.incentive;
    sum.overtime_hours += row.overtime_hours;
    sum.paid += row.paid;
    sum.present_days += row.present_days;
    sum.absence_days += row.absence_days;
    sum.total_days += row.total_days;
    sum.attended_days += row.attended_days;
    sum.late_days += row.late_days;
    return sum;
  }, emptyTotals());

  if (totals.records > 0) {
    const countParams = [companyId, fromKey, toKey];
    let countBranch = '';
    if (branchIds) {
      countParams.push(branchIds);
      countBranch = ` AND e.branch_id = ANY($${countParams.length}::bigint[])`;
    }
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT p.employee_id)::int AS employees
       FROM payroll_records p
       INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
       WHERE p.company_id = $1
         AND (p.year * 12 + p.month) BETWEEN $2 AND $3
         ${countBranch}`,
      countParams
    );
    totals.employees = Number(countResult.rows[0]?.employees || 0);
  }

  totals.net_salary = round2(totals.net_salary);
  totals.gross_salary = round2(totals.gross_salary);
  totals.deductions = round2(totals.deductions);
  totals.advance = round2(totals.advance);
  totals.incentive = round2(totals.incentive);
  totals.overtime_hours = round2(totals.overtime_hours);
  totals.paid = round2(totals.paid);
  totals.outstanding = round2(totals.net_salary - totals.paid);
  totals.present_days = round2(totals.present_days);
  totals.absence_days = round2(totals.absence_days);
  totals.total_days = round2(totals.total_days);
  totals.leave_percentage = percent(
    totals.absence_days,
    totals.present_days + totals.absence_days
  );
  totals.late_percentage = percent(totals.late_days, totals.attended_days);

  return {
    preset: range.preset,
    from: range.from,
    to: range.to,
    label: rangeLabel(range.from, range.to),
    totals,
    months: monthRows,
    top_employees: topResult.rows.map((row) => ({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      employee_code: row.employee_code,
      net_salary: round2(row.net_salary),
      advance: round2(row.advance),
      absence_days: round2(row.absence_days),
      present_days: round2(row.present_days),
      leave_percentage: percent(
        row.absence_days,
        Number(row.present_days) + Number(row.absence_days)
      ),
    })),
  };
}

module.exports = {
  addMonths,
  buildPayrollOverviewRange,
  getPayrollOverview,
};
