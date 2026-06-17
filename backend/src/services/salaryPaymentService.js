const { pool } = require('../config/database');

const PAYMENT_MODES = ['cash', 'bank_transfer', 'upi', 'cheque', 'other'];

function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function derivePaymentStatus(totalPaid, netSalary) {
  const paid = Number(totalPaid || 0);
  const net = Number(netSalary || 0);
  if (paid <= 0) return 'unpaid';
  if (paid < net) return 'partial';
  return 'paid';
}

function formatMonthlyPeriodLabel(year, month) {
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function formatWeeklyPeriodLabel(weekStart, weekEnd) {
  return `${String(weekStart).slice(0, 10)} – ${String(weekEnd).slice(0, 10)}`;
}

async function loadPayrollContext(companyId, { payrollRecordId, weeklyPayrollRecordId }) {
  if (payrollRecordId) {
    const result = await pool.query(
      `SELECT p.id, p.company_id, p.employee_id, p.year, p.month, p.net_salary,
              e.name AS employee_name, e.employee_code
       FROM payroll_records p
       INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
       WHERE p.company_id = $1 AND p.id = $2`,
      [companyId, payrollRecordId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      payrollRecordId: row.id,
      weeklyPayrollRecordId: null,
      employeeId: row.employee_id,
      netSalary: Number(row.net_salary || 0),
      periodLabel: formatMonthlyPeriodLabel(row.year, row.month),
      payrollType: 'monthly',
      year: row.year,
      month: row.month,
      employeeName: row.employee_name,
      employeeCode: row.employee_code,
    };
  }

  if (weeklyPayrollRecordId) {
    const result = await pool.query(
      `SELECT w.id, w.company_id, w.employee_id, w.week_start_date, w.week_end_date, w.net_salary,
              e.name AS employee_name, e.employee_code
       FROM weekly_payroll_records w
       INNER JOIN employees e ON e.id = w.employee_id AND e.company_id = w.company_id
       WHERE w.company_id = $1 AND w.id = $2`,
      [companyId, weeklyPayrollRecordId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      payrollRecordId: null,
      weeklyPayrollRecordId: row.id,
      employeeId: row.employee_id,
      netSalary: Number(row.net_salary || 0),
      periodLabel: formatWeeklyPeriodLabel(row.week_start_date, row.week_end_date),
      payrollType: 'weekly',
      weekStartDate: row.week_start_date,
      weekEndDate: row.week_end_date,
      employeeName: row.employee_name,
      employeeCode: row.employee_code,
    };
  }

  return null;
}

async function getTotalPaidForPayroll({ payrollRecordId, weeklyPayrollRecordId }) {
  if (payrollRecordId) {
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM employee_salary_payments
       WHERE payroll_record_id = $1`,
      [payrollRecordId]
    );
    return Number(result.rows[0]?.total_paid || 0);
  }
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_paid
     FROM employee_salary_payments
     WHERE weekly_payroll_record_id = $1`,
    [weeklyPayrollRecordId]
  );
  return Number(result.rows[0]?.total_paid || 0);
}

async function recordPayment({
  companyId,
  employeeId,
  payrollRecordId = null,
  weeklyPayrollRecordId = null,
  amount,
  paymentDate,
  paymentMode,
  referenceNumber = null,
  notes = null,
  userId = null,
}) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    const err = new Error('Amount must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  const mode = String(paymentMode || '').toLowerCase();
  if (!PAYMENT_MODES.includes(mode)) {
    const err = new Error('Invalid payment mode');
    err.statusCode = 400;
    throw err;
  }

  const dateOnly = toDateOnly(paymentDate);
  if (!dateOnly) {
    const err = new Error('Valid payment date is required');
    err.statusCode = 400;
    throw err;
  }

  const ctx = await loadPayrollContext(companyId, { payrollRecordId, weeklyPayrollRecordId });
  if (!ctx) {
    const err = new Error('Payroll record not found');
    err.statusCode = 404;
    throw err;
  }

  if (Number(employeeId) !== Number(ctx.employeeId)) {
    const err = new Error('Employee does not match payroll record');
    err.statusCode = 400;
    throw err;
  }

  const currentPaid = await getTotalPaidForPayroll(ctx);
  const newTotal = currentPaid + numericAmount;
  const overpayment = newTotal > ctx.netSalary;

  const result = await pool.query(
    `INSERT INTO employee_salary_payments (
       company_id, employee_id, payroll_record_id, weekly_payroll_record_id,
       amount, payment_date, payment_mode, reference_number, notes, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10)
     RETURNING *`,
    [
      companyId,
      ctx.employeeId,
      ctx.payrollRecordId,
      ctx.weeklyPayrollRecordId,
      numericAmount,
      dateOnly,
      mode,
      referenceNumber || null,
      notes || null,
      userId || null,
    ]
  );

  const row = result.rows[0];
  return {
    ...row,
    amount: Number(row.amount),
    net_salary: ctx.netSalary,
    total_paid: newTotal,
    balance_due: Math.max(0, ctx.netSalary - newTotal),
    payment_status: derivePaymentStatus(newTotal, ctx.netSalary),
    period_label: ctx.periodLabel,
    employee_name: ctx.employeeName,
    employee_code: ctx.employeeCode,
    overpayment_warning: overpayment,
  };
}

async function listPayments(
  companyId,
  {
    employee_id: employeeId,
    from_date: fromDate,
    to_date: toDate,
    payment_mode: paymentMode,
    payroll_year: payrollYear,
    payroll_month: payrollMonth,
    branch_id: branchId,
    allowedBranchIds = null,
    page = 1,
    limit = 50,
  } = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return { data: [], page: pageNum, limit: limitNum, total: 0 };
  }

  const conditions = ['sp.company_id = $1'];
  const params = [companyId];
  let paramIndex = 2;

  if (employeeId != null && employeeId !== '') {
    conditions.push(`sp.employee_id = $${paramIndex}`);
    params.push(Number(employeeId));
    paramIndex += 1;
  }
  if (fromDate) {
    const d = toDateOnly(fromDate);
    if (d) {
      conditions.push(`sp.payment_date >= $${paramIndex}::date`);
      params.push(d);
      paramIndex += 1;
    }
  }
  if (toDate) {
    const d = toDateOnly(toDate);
    if (d) {
      conditions.push(`sp.payment_date <= $${paramIndex}::date`);
      params.push(d);
      paramIndex += 1;
    }
  }
  if (paymentMode && PAYMENT_MODES.includes(String(paymentMode).toLowerCase())) {
    conditions.push(`sp.payment_mode = $${paramIndex}`);
    params.push(String(paymentMode).toLowerCase());
    paramIndex += 1;
  }
  if (payrollYear != null && payrollYear !== '') {
    conditions.push(`(p.year = $${paramIndex} OR EXTRACT(YEAR FROM w.week_end_date)::int = $${paramIndex})`);
    params.push(Number(payrollYear));
    paramIndex += 1;
  }
  if (payrollMonth != null && payrollMonth !== '') {
    conditions.push(`(p.month = $${paramIndex} OR EXTRACT(MONTH FROM w.week_end_date)::int = $${paramIndex})`);
    params.push(Number(payrollMonth));
    paramIndex += 1;
  }
  if (branchId != null && branchId !== '') {
    conditions.push(`e.branch_id = $${paramIndex}`);
    params.push(Number(branchId));
    paramIndex += 1;
  }
  if (allowedBranchIds != null) {
    conditions.push(`e.branch_id = ANY($${paramIndex}::bigint[])`);
    params.push(allowedBranchIds);
    paramIndex += 1;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total
     FROM employee_salary_payments sp
     INNER JOIN employees e ON e.id = sp.employee_id AND e.company_id = sp.company_id
     LEFT JOIN payroll_records p ON p.id = sp.payroll_record_id
     LEFT JOIN weekly_payroll_records w ON w.id = sp.weekly_payroll_record_id
     WHERE ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const listResult = await pool.query(
    `SELECT
        sp.*,
        e.name AS employee_name,
        e.employee_code,
        p.year AS payroll_year,
        p.month AS payroll_month,
        w.week_start_date,
        w.week_end_date,
        COALESCE(p.net_salary, w.net_salary, 0) AS net_salary,
        CASE
          WHEN sp.payroll_record_id IS NOT NULL THEN
            to_char(make_date(p.year, p.month, 1), 'FMMonth YYYY')
          ELSE
            to_char(w.week_start_date, 'YYYY-MM-DD') || ' – ' || to_char(w.week_end_date, 'YYYY-MM-DD')
        END AS period_label,
        (
          SELECT COALESCE(SUM(sp2.amount), 0)
          FROM employee_salary_payments sp2
          WHERE (sp2.payroll_record_id IS NOT NULL AND sp2.payroll_record_id = sp.payroll_record_id)
             OR (sp2.weekly_payroll_record_id IS NOT NULL AND sp2.weekly_payroll_record_id = sp.weekly_payroll_record_id)
        ) AS payroll_total_paid
     FROM employee_salary_payments sp
     INNER JOIN employees e ON e.id = sp.employee_id AND e.company_id = sp.company_id
     LEFT JOIN payroll_records p ON p.id = sp.payroll_record_id
     LEFT JOIN weekly_payroll_records w ON w.id = sp.weekly_payroll_record_id
     WHERE ${whereClause}
     ORDER BY sp.payment_date DESC, sp.id DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset]
  );

  const data = listResult.rows.map((row) => {
    const net = Number(row.net_salary || 0);
    const payrollTotalPaid = Number(row.payroll_total_paid || 0);
    return {
      ...row,
      amount: Number(row.amount),
      net_salary: net,
      payroll_total_paid: payrollTotalPaid,
      balance_due: Math.max(0, net - payrollTotalPaid),
      payment_status: derivePaymentStatus(payrollTotalPaid, net),
    };
  });

  return { data, page: pageNum, limit: limitNum, total };
}

async function getEmployeeStatement(companyId, employeeId, fromDate, toDate) {
  const conditions = ['sp.company_id = $1', 'sp.employee_id = $2'];
  const params = [companyId, Number(employeeId)];
  let paramIndex = 3;

  if (fromDate) {
    const d = toDateOnly(fromDate);
    if (d) {
      conditions.push(`sp.payment_date >= $${paramIndex}::date`);
      params.push(d);
      paramIndex += 1;
    }
  }
  if (toDate) {
    const d = toDateOnly(toDate);
    if (d) {
      conditions.push(`sp.payment_date <= $${paramIndex}::date`);
      params.push(d);
      paramIndex += 1;
    }
  }

  const result = await pool.query(
    `SELECT
        sp.*,
        e.name AS employee_name,
        e.employee_code,
        CASE
          WHEN sp.payroll_record_id IS NOT NULL THEN
            to_char(make_date(p.year, p.month, 1), 'FMMonth YYYY')
          ELSE
            to_char(w.week_start_date, 'YYYY-MM-DD') || ' – ' || to_char(w.week_end_date, 'YYYY-MM-DD')
        END AS period_label
     FROM employee_salary_payments sp
     INNER JOIN employees e ON e.id = sp.employee_id AND e.company_id = sp.company_id
     LEFT JOIN payroll_records p ON p.id = sp.payroll_record_id
     LEFT JOIN weekly_payroll_records w ON w.id = sp.weekly_payroll_record_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sp.payment_date ASC, sp.id ASC`,
    params
  );

  let runningTotal = 0;
  const data = result.rows.map((row) => {
    runningTotal += Number(row.amount || 0);
    return {
      ...row,
      amount: Number(row.amount),
      running_total: runningTotal,
    };
  });

  return {
    employee_id: Number(employeeId),
    employee_name: data[0]?.employee_name || null,
    employee_code: data[0]?.employee_code || null,
    data,
    total_paid: runningTotal,
  };
}

async function getPayrollPaymentSummary(companyId, { payrollRecordId, weeklyPayrollRecordId }) {
  const ctx = await loadPayrollContext(companyId, { payrollRecordId, weeklyPayrollRecordId });
  if (!ctx) {
    const err = new Error('Payroll record not found');
    err.statusCode = 404;
    throw err;
  }

  const paymentsResult = await pool.query(
    `SELECT sp.*
     FROM employee_salary_payments sp
     WHERE sp.company_id = $1
       AND (
         ($2::bigint IS NOT NULL AND sp.payroll_record_id = $2)
         OR ($3::bigint IS NOT NULL AND sp.weekly_payroll_record_id = $3)
       )
     ORDER BY sp.payment_date ASC, sp.id ASC`,
    [companyId, ctx.payrollRecordId, ctx.weeklyPayrollRecordId]
  );

  const payments = paymentsResult.rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    payroll_record_id: ctx.payrollRecordId,
    weekly_payroll_record_id: ctx.weeklyPayrollRecordId,
    employee_id: ctx.employeeId,
    employee_name: ctx.employeeName,
    employee_code: ctx.employeeCode,
    period_label: ctx.periodLabel,
    net_salary: ctx.netSalary,
    total_paid: totalPaid,
    balance_due: Math.max(0, ctx.netSalary - totalPaid),
    payment_status: derivePaymentStatus(totalPaid, ctx.netSalary),
    payments,
  };
}

async function updatePayment(companyId, paymentId, updates, userId = null) {
  const existing = await pool.query(
    `SELECT * FROM employee_salary_payments WHERE company_id = $1 AND id = $2`,
    [companyId, paymentId]
  );
  const row = existing.rows[0];
  if (!row) {
    const err = new Error('Payment not found');
    err.statusCode = 404;
    throw err;
  }

  const amount = updates.amount != null ? Number(updates.amount) : Number(row.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Amount must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  const paymentMode = updates.payment_mode != null
    ? String(updates.payment_mode).toLowerCase()
    : row.payment_mode;
  if (!PAYMENT_MODES.includes(paymentMode)) {
    const err = new Error('Invalid payment mode');
    err.statusCode = 400;
    throw err;
  }

  const paymentDate = updates.payment_date != null ? toDateOnly(updates.payment_date) : row.payment_date;
  if (!paymentDate) {
    const err = new Error('Valid payment date is required');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(
    `UPDATE employee_salary_payments
     SET amount = $1,
         payment_date = $2::date,
         payment_mode = $3,
         reference_number = COALESCE($4, reference_number),
         notes = COALESCE($5, notes)
     WHERE company_id = $6 AND id = $7
     RETURNING *`,
    [
      amount,
      paymentDate,
      paymentMode,
      updates.reference_number !== undefined ? updates.reference_number : row.reference_number,
      updates.notes !== undefined ? updates.notes : row.notes,
      companyId,
      paymentId,
    ]
  );

  const updated = result.rows[0];
  const ctx = await loadPayrollContext(companyId, {
    payrollRecordId: updated.payroll_record_id,
    weeklyPayrollRecordId: updated.weekly_payroll_record_id,
  });
  const totalPaid = await getTotalPaidForPayroll({
    payrollRecordId: updated.payroll_record_id,
    weeklyPayrollRecordId: updated.weekly_payroll_record_id,
  });

  return {
    ...updated,
    amount: Number(updated.amount),
    net_salary: ctx?.netSalary || 0,
    total_paid: totalPaid,
    balance_due: Math.max(0, (ctx?.netSalary || 0) - totalPaid),
    payment_status: derivePaymentStatus(totalPaid, ctx?.netSalary || 0),
    updated_by: userId,
  };
}

async function voidPayment(companyId, paymentId) {
  const existing = await pool.query(
    `SELECT * FROM employee_salary_payments WHERE company_id = $1 AND id = $2`,
    [companyId, paymentId]
  );
  const row = existing.rows[0];
  if (!row) {
    const err = new Error('Payment not found');
    err.statusCode = 404;
    throw err;
  }

  await pool.query(
    `DELETE FROM employee_salary_payments WHERE company_id = $1 AND id = $2`,
    [companyId, paymentId]
  );

  return row;
}

async function listOutstandingPayrolls(
  companyId,
  {
    year,
    month,
    week_start_date: weekStartDate,
    employee_id: employeeId,
    branch_id: branchId,
    allowedBranchIds = null,
    page = 1,
    limit = 50,
  } = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return { data: [], page: pageNum, limit: limitNum, total: 0 };
  }

  const isWeekly = weekStartDate != null && weekStartDate !== '';

  if (isWeekly) {
    const conditions = ['w.company_id = $1', 'w.week_start_date = $2'];
    const params = [companyId, String(weekStartDate).slice(0, 10)];
    let paramIndex = 3;

    if (employeeId != null && employeeId !== '') {
      conditions.push(`w.employee_id = $${paramIndex}`);
      params.push(Number(employeeId));
      paramIndex += 1;
    }
    if (branchId != null && branchId !== '') {
      conditions.push(`e.branch_id = $${paramIndex}`);
      params.push(Number(branchId));
      paramIndex += 1;
    }
    if (allowedBranchIds != null) {
      conditions.push(`e.branch_id = ANY($${paramIndex}::bigint[])`);
      params.push(allowedBranchIds);
      paramIndex += 1;
    }

    conditions.push(`(
      w.net_salary - COALESCE((
        SELECT SUM(sp.amount) FROM employee_salary_payments sp WHERE sp.weekly_payroll_record_id = w.id
      ), 0)
    ) > 0`);

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM weekly_payroll_records w
       INNER JOIN employees e ON e.id = w.employee_id AND e.company_id = w.company_id
       WHERE ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.total || 0);

    const listResult = await pool.query(
      `SELECT
          w.id,
          w.employee_id,
          w.week_start_date,
          w.week_end_date,
          w.net_salary,
          e.name AS employee_name,
          e.employee_code,
          COALESCE((SELECT SUM(sp.amount) FROM employee_salary_payments sp WHERE sp.weekly_payroll_record_id = w.id), 0) AS total_paid,
          w.net_salary - COALESCE((SELECT SUM(sp.amount) FROM employee_salary_payments sp WHERE sp.weekly_payroll_record_id = w.id), 0) AS balance_due,
          'weekly' AS payroll_type
       FROM weekly_payroll_records w
       INNER JOIN employees e ON e.id = w.employee_id AND e.company_id = w.company_id
       WHERE ${whereClause}
       ORDER BY e.name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offset]
    );

    const data = listResult.rows.map((r) => ({
      ...r,
      net_salary: Number(r.net_salary),
      total_paid: Number(r.total_paid),
      balance_due: Number(r.balance_due),
      payment_status: derivePaymentStatus(r.total_paid, r.net_salary),
      period_label: formatWeeklyPeriodLabel(r.week_start_date, r.week_end_date),
      weekly_payroll_record_id: r.id,
      payroll_record_id: null,
    }));

    return { data, page: pageNum, limit: limitNum, total };
  }

  const conditions = ['p.company_id = $1'];
  const params = [companyId];
  let paramIndex = 2;

  if (year != null && year !== '') {
    conditions.push(`p.year = $${paramIndex}`);
    params.push(Number(year));
    paramIndex += 1;
  }
  if (month != null && month !== '') {
    conditions.push(`p.month = $${paramIndex}`);
    params.push(Number(month));
    paramIndex += 1;
  }
  if (employeeId != null && employeeId !== '') {
    conditions.push(`p.employee_id = $${paramIndex}`);
    params.push(Number(employeeId));
    paramIndex += 1;
  }
  if (branchId != null && branchId !== '') {
    conditions.push(`e.branch_id = $${paramIndex}`);
    params.push(Number(branchId));
    paramIndex += 1;
  }
  if (allowedBranchIds != null) {
    conditions.push(`e.branch_id = ANY($${paramIndex}::bigint[])`);
    params.push(allowedBranchIds);
    paramIndex += 1;
  }

  conditions.push(`(
    p.net_salary - COALESCE((
      SELECT SUM(sp.amount) FROM employee_salary_payments sp WHERE sp.payroll_record_id = p.id
    ), 0)
  ) > 0`);

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total
     FROM payroll_records p
     INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
     WHERE ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const listResult = await pool.query(
    `SELECT
        p.id,
        p.employee_id,
        p.year,
        p.month,
        p.net_salary,
        e.name AS employee_name,
        e.employee_code,
        COALESCE((SELECT SUM(sp.amount) FROM employee_salary_payments sp WHERE sp.payroll_record_id = p.id), 0) AS total_paid,
        p.net_salary - COALESCE((SELECT SUM(sp.amount) FROM employee_salary_payments sp WHERE sp.payroll_record_id = p.id), 0) AS balance_due,
        'monthly' AS payroll_type
     FROM payroll_records p
     INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
     WHERE ${whereClause}
     ORDER BY e.name ASC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset]
  );

  const data = listResult.rows.map((r) => ({
    ...r,
    net_salary: Number(r.net_salary),
    total_paid: Number(r.total_paid),
    balance_due: Number(r.balance_due),
    payment_status: derivePaymentStatus(r.total_paid, r.net_salary),
    period_label: formatMonthlyPeriodLabel(r.year, r.month),
    payroll_record_id: r.id,
    weekly_payroll_record_id: null,
  }));

  return { data, page: pageNum, limit: limitNum, total };
}

async function getMonthlyPaymentSummary(companyId, year, month, allowedBranchIds = null) {
  if (allowedBranchIds != null && allowedBranchIds.length === 0) {
    return { total_net: 0, total_paid: 0, total_outstanding: 0, employee_count: 0 };
  }

  const conditions = ['p.company_id = $1', 'p.year = $2', 'p.month = $3'];
  const params = [companyId, Number(year), Number(month)];
  let paramIndex = 4;

  if (allowedBranchIds != null) {
    conditions.push(`e.branch_id = ANY($${paramIndex}::bigint[])`);
    params.push(allowedBranchIds);
    paramIndex += 1;
  }

  const whereClause = conditions.join(' AND ');

  const result = await pool.query(
    `SELECT
        COUNT(*)::int AS employee_count,
        COALESCE(SUM(p.net_salary), 0) AS total_net,
        COALESCE(SUM(pay.paid), 0) AS total_paid
     FROM payroll_records p
     INNER JOIN employees e ON e.id = p.employee_id AND e.company_id = p.company_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(sp.amount), 0) AS paid
       FROM employee_salary_payments sp
       WHERE sp.payroll_record_id = p.id
     ) pay ON true
     WHERE ${whereClause}`,
    params
  );

  const row = result.rows[0] || {};
  const totalNet = Number(row.total_net || 0);
  const totalPaid = Number(row.total_paid || 0);

  return {
    employee_count: Number(row.employee_count || 0),
    total_net: totalNet,
    total_paid: totalPaid,
    total_outstanding: Math.max(0, totalNet - totalPaid),
  };
}

module.exports = {
  PAYMENT_MODES,
  derivePaymentStatus,
  recordPayment,
  listPayments,
  getEmployeeStatement,
  getPayrollPaymentSummary,
  updatePayment,
  voidPayment,
  listOutstandingPayrolls,
  getMonthlyPaymentSummary,
};
