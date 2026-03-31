const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function parseDateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new AppError('loan_date must be a valid date', 400);
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new AppError('loan_date must be YYYY-MM-DD', 400);
  const parsed = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new AppError('loan_date must be a valid date', 400);
  return str;
}

async function createRepaymentSchedule(client, loan, loanDateStr, installments, monthlyInstallment) {
  const loanDate = new Date(`${loanDateStr}T00:00:00Z`);
  if (Number.isNaN(loanDate.getTime())) {
    throw new AppError('Invalid loan date provided', 400);
  }

  // Repayments start from the same month as the loan date by default.
  let repaymentYear = loanDate.getFullYear();
  let repaymentMonth = loanDate.getMonth() + 1;
  if (repaymentMonth > 12) {
    repaymentMonth = 1;
    repaymentYear += 1;
  }

  for (let i = 0; i < installments; i += 1) {
    let scheduleMonth = repaymentMonth + i;
    let scheduleYear = repaymentYear;
    while (scheduleMonth > 12) {
      scheduleMonth -= 12;
      scheduleYear += 1;
    }

    if (Number.isNaN(scheduleYear) || Number.isNaN(scheduleMonth)) {
      throw new AppError(`Invalid schedule month calculated for installment ${i + 1}`, 400);
    }

    await client.query(
      `INSERT INTO employee_advance_repayments (
         company_id, employee_id, loan_id, year, month,
         repayment_amount, suggested_amount, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [
        loan.company_id,
        loan.employee_id,
        loan.id,
        scheduleYear,
        scheduleMonth,
        monthlyInstallment,
        monthlyInstallment,
      ]
    );
  }
}

async function createAdvanceLoan(companyId, data, opts = {}) {
  const client = opts.client || await pool.connect();
  const ownClient = !opts.client;
  try {
    if (ownClient) await client.query('BEGIN');

    const employeeId = Number(data.employee_id);
    const loanAmountParsed = parseFloat(data.loan_amount);
    const installmentsParsed = parseInt(data.total_installments, 10);
    const monthlyInstallmentParsed = parseFloat(data.monthly_installment);
    const loanAmount = toMoney(loanAmountParsed);
    const totalInstallments = installmentsParsed;
    const monthlyInstallment = toMoney(monthlyInstallmentParsed);
    const loanDate = parseDateOnly(data.loan_date);
    const reason = data.reason ? String(data.reason).trim() : null;
    const notes = data.notes ? String(data.notes).trim() : null;

    if (!employeeId) {
      throw new AppError('employee_id is required', 400);
    }
    if (Number.isNaN(loanAmountParsed) || loanAmount <= 0) {
      throw new AppError('Invalid loan amount', 400);
    }
    if (Number.isNaN(installmentsParsed) || totalInstallments < 1) {
      throw new AppError('Invalid number of installments', 400);
    }
    if (Number.isNaN(monthlyInstallmentParsed) || monthlyInstallment <= 0) {
      throw new AppError('Invalid monthly installment', 400);
    }

    const coverageAmount = toMoney(monthlyInstallment * totalInstallments);

    const loanResult = await client.query(
      `INSERT INTO employee_advance_loans (
         company_id, employee_id, loan_amount, loan_date, reason,
         total_installments, monthly_installment, total_repaid,
         outstanding_balance, status, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $3, 'active', $8)
       RETURNING *`,
      [companyId, employeeId, loanAmount, loanDate, reason, totalInstallments, monthlyInstallment, notes]
    );
    const loan = loanResult.rows[0];

    await createRepaymentSchedule(client, loan, loanDate, totalInstallments, monthlyInstallment);

    if (ownClient) await client.query('COMMIT');

    return {
      ...loan,
      warnings: coverageAmount < loanAmount
        ? [`Monthly installment plan total (${coverageAmount}) is lower than loan amount (${loanAmount}).`]
        : [],
    };
  } catch (err) {
    if (ownClient) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownClient) client.release();
  }
}

async function getCompanyLoans(companyId, filters = {}) {
  const conditions = ['l.company_id = $1'];
  const params = [companyId];
  let idx = 2;

  if (filters.status) {
    conditions.push(`l.status = $${idx}`);
    params.push(filters.status);
    idx += 1;
  }
  if (filters.employee_id) {
    conditions.push(`l.employee_id = $${idx}`);
    params.push(Number(filters.employee_id));
    idx += 1;
  }
  if (filters.year && filters.month) {
    conditions.push(`EXISTS (
      SELECT 1 FROM employee_advance_repayments r2
      WHERE r2.loan_id = l.id AND r2.year = $${idx} AND r2.month = $${idx + 1}
    )`);
    params.push(Number(filters.year), Number(filters.month));
    idx += 2;
  }

  const result = await pool.query(
    `SELECT
       l.*,
       e.name AS employee_name,
       e.employee_code,
       nr.id AS next_repayment_id,
       nr.year AS next_repayment_year,
       nr.month AS next_repayment_month,
       nr.repayment_amount AS next_repayment_amount,
       nr.status AS next_repayment_status
     FROM employee_advance_loans l
     INNER JOIN employees e ON e.id = l.employee_id AND e.company_id = l.company_id
     LEFT JOIN LATERAL (
       SELECT r.id, r.year, r.month, r.repayment_amount, r.status
       FROM employee_advance_repayments r
       WHERE r.loan_id = l.id AND r.status = 'pending'
       ORDER BY r.year ASC, r.month ASC
       LIMIT 1
     ) nr ON true
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN l.status = 'active' THEN 0 ELSE 1 END ASC,
       l.loan_date DESC, l.id DESC`,
    params
  );

  return result.rows;
}

async function getLoanById(companyId, loanId) {
  const loanResult = await pool.query(
    `SELECT l.*, e.name AS employee_name, e.employee_code
     FROM employee_advance_loans l
     INNER JOIN employees e ON e.id = l.employee_id AND e.company_id = l.company_id
     WHERE l.company_id = $1 AND l.id = $2`,
    [companyId, loanId]
  );
  if (loanResult.rowCount === 0) throw new AppError('Loan not found', 404);

  const scheduleResult = await pool.query(
    `SELECT *
     FROM employee_advance_repayments
     WHERE company_id = $1 AND loan_id = $2
     ORDER BY year ASC, month ASC`,
    [companyId, loanId]
  );

  return {
    ...loanResult.rows[0],
    repayments: scheduleResult.rows,
  };
}

async function getEmployeeLoans(companyId, employeeId) {
  const loans = await pool.query(
    `SELECT l.*, e.name AS employee_name, e.employee_code
     FROM employee_advance_loans l
     INNER JOIN employees e ON e.id = l.employee_id AND e.company_id = l.company_id
     WHERE l.company_id = $1 AND l.employee_id = $2
     ORDER BY l.loan_date DESC, l.id DESC`,
    [companyId, Number(employeeId)]
  );
  const loanIds = loans.rows.map((r) => r.id);
  if (loanIds.length === 0) return [];

  const repayments = await pool.query(
    `SELECT *
     FROM employee_advance_repayments
     WHERE company_id = $1 AND loan_id = ANY($2::bigint[])
     ORDER BY year ASC, month ASC`,
    [companyId, loanIds]
  );
  const byLoan = new Map();
  for (const r of repayments.rows) {
    if (!byLoan.has(r.loan_id)) byLoan.set(r.loan_id, []);
    byLoan.get(r.loan_id).push(r);
  }

  return loans.rows.map((loan) => ({ ...loan, repayments: byLoan.get(loan.id) || [] }));
}

async function getMonthlyRepayments(companyId, year, month) {
  const result = await pool.query(
    `SELECT
       r.*,
       l.loan_amount AS original_loan_amount,
       l.loan_date,
       l.total_repaid AS loan_total_repaid,
       l.outstanding_balance AS loan_outstanding_balance,
       l.status AS loan_status,
       e.name AS employee_name,
       e.employee_code
     FROM employee_advance_repayments r
     INNER JOIN employee_advance_loans l ON l.id = r.loan_id AND l.company_id = r.company_id
     INNER JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
     WHERE r.company_id = $1
       AND r.year = $2
       AND r.month = $3
       AND r.status = 'pending'
     ORDER BY e.name ASC, r.id ASC`,
    [companyId, Number(year), Number(month)]
  );
  return result.rows;
}

async function updateRepayment(companyId, repaymentId, data) {
  const current = await pool.query(
    `SELECT *
     FROM employee_advance_repayments
     WHERE company_id = $1 AND id = $2`,
    [companyId, Number(repaymentId)]
  );
  if (current.rowCount === 0) throw new AppError('Repayment not found', 404);
  const row = current.rows[0];

  const updatedAmount = data.repayment_amount != null ? toMoney(data.repayment_amount) : Number(row.repayment_amount);
  const amountChanged = updatedAmount !== Number(row.repayment_amount);
  const status = data.status || row.status;
  const notes = data.notes != null ? String(data.notes).trim() : row.notes;
  const overrideReason = data.override_reason != null ? String(data.override_reason).trim() : row.override_reason;

  const result = await pool.query(
    `UPDATE employee_advance_repayments
     SET repayment_amount = $3,
         status = $4,
         notes = $5,
         override_reason = $6,
         is_overridden = CASE WHEN $7 THEN true ELSE is_overridden END,
         updated_at = NOW()
     WHERE company_id = $1 AND id = $2
     RETURNING *`,
    [companyId, Number(repaymentId), updatedAmount, status, notes, overrideReason, amountChanged]
  );
  return result.rows[0];
}

async function markRepaymentDeducted(companyId, loanId, year, month, actualAmount, opts = {}) {
  const client = opts.client || await pool.connect();
  const ownClient = !opts.client;
  try {
    if (ownClient) await client.query('BEGIN');

    const repaymentResult = await client.query(
      `UPDATE employee_advance_repayments
       SET status = 'deducted',
           repayment_amount = $6,
           updated_at = NOW()
       WHERE company_id = $1
         AND loan_id = $2
         AND year = $3
         AND month = $4
         AND status = 'pending'
       RETURNING *`,
      [companyId, Number(loanId), Number(year), Number(month), 'deducted', toMoney(actualAmount)]
    );
    if (repaymentResult.rowCount === 0) {
      if (ownClient) await client.query('COMMIT');
      return null;
    }
    const repayment = repaymentResult.rows[0];

    const amt = toMoney(actualAmount != null ? actualAmount : repayment.repayment_amount);
    const loanUpdateResult = await client.query(
      `UPDATE employee_advance_loans
       SET total_repaid = ROUND((total_repaid + $3)::numeric, 2),
           outstanding_balance = GREATEST(ROUND((outstanding_balance - $3)::numeric, 2), 0),
           status = CASE WHEN (outstanding_balance - $3) <= 0 THEN 'cleared' ELSE status END,
           updated_at = NOW()
       WHERE company_id = $1 AND id = $2
       RETURNING *`,
      [companyId, Number(loanId), amt]
    );

    if (ownClient) await client.query('COMMIT');
    return { repayment, loan: loanUpdateResult.rows[0] };
  } catch (err) {
    if (ownClient) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownClient) client.release();
  }
}

async function skipRepayment(companyId, repaymentId, reason) {
  const note = reason ? `Skipped: ${String(reason).trim()}` : 'Skipped by admin';
  const result = await pool.query(
    `UPDATE employee_advance_repayments
     SET status = 'skipped',
         notes = CASE WHEN notes IS NULL OR notes = '' THEN $3 ELSE notes || E'\n' || $3 END,
         updated_at = NOW()
     WHERE company_id = $1 AND id = $2
     RETURNING *`,
    [companyId, Number(repaymentId), note]
  );
  if (result.rowCount === 0) throw new AppError('Repayment not found', 404);
  return result.rows[0];
}

async function getEmployeeLoanSummary(companyId, employeeId, year = null, month = null) {
  const activeResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active') AS active_loans_count,
       COALESCE(SUM(outstanding_balance) FILTER (WHERE status = 'active'), 0) AS total_outstanding_balance
     FROM employee_advance_loans
     WHERE company_id = $1 AND employee_id = $2`,
    [companyId, Number(employeeId)]
  );

  let thisMonthRepaymentAmount = 0;
  if (year && month) {
    const monthlyResult = await pool.query(
      `SELECT COALESCE(SUM(repayment_amount), 0) AS amount
       FROM employee_advance_repayments
       WHERE company_id = $1
         AND employee_id = $2
         AND year = $3
         AND month = $4
         AND status = 'pending'`,
      [companyId, Number(employeeId), Number(year), Number(month)]
    );
    thisMonthRepaymentAmount = Number(monthlyResult.rows[0]?.amount || 0);
  }

  const historyResult = await pool.query(
    `SELECT *
     FROM employee_advance_loans
     WHERE company_id = $1
       AND employee_id = $2
       AND status IN ('cleared', 'waived')
     ORDER BY updated_at DESC, id DESC`,
    [companyId, Number(employeeId)]
  );

  return {
    active_loans_count: Number(activeResult.rows[0]?.active_loans_count || 0),
    total_outstanding_balance: Number(activeResult.rows[0]?.total_outstanding_balance || 0),
    this_month_repayment_amount: thisMonthRepaymentAmount,
    loan_history: historyResult.rows,
  };
}

async function addLoanToEmployee(companyId, data) {
  const employeeId = Number(data.employee_id);
  if (!employeeId) throw new AppError('employee_id is required', 400);

  const existingResult = await pool.query(
    `SELECT id, loan_amount, outstanding_balance, loan_date, status
     FROM employee_advance_loans
     WHERE company_id = $1 AND employee_id = $2 AND status = 'active'
     ORDER BY loan_date DESC`,
    [companyId, employeeId]
  );

  const loan = await createAdvanceLoan(companyId, data);
  return {
    ...loan,
    warning: existingResult.rowCount > 0
      ? {
          message: 'Employee already has active loan(s)',
          existing_loans: existingResult.rows,
        }
      : null,
  };
}

async function waiveLoan(companyId, loanId, reason) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const loanResult = await client.query(
      `UPDATE employee_advance_loans
       SET outstanding_balance = 0,
           status = 'waived',
           notes = CASE
             WHEN $3 IS NULL OR $3 = '' THEN notes
             WHEN notes IS NULL OR notes = '' THEN $3
             ELSE notes || E'\n' || $3
           END,
           updated_at = NOW()
       WHERE company_id = $1 AND id = $2
       RETURNING *`,
      [companyId, Number(loanId), reason ? `Waived: ${String(reason).trim()}` : null]
    );
    if (loanResult.rowCount === 0) throw new AppError('Loan not found', 404);

    await client.query(
      `UPDATE employee_advance_repayments
       SET status = 'skipped',
           notes = CASE WHEN notes IS NULL OR notes = '' THEN 'Skipped due to loan waiver' ELSE notes || E'\nSkipped due to loan waiver' END,
           updated_at = NOW()
       WHERE company_id = $1 AND loan_id = $2 AND status = 'pending'`,
      [companyId, Number(loanId)]
    );

    await client.query('COMMIT');
    return loanResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteLoan(companyId, loanId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id
       FROM employee_advance_loans
       WHERE company_id = $1 AND id = $2`,
      [companyId, Number(loanId)]
    );
    if (existing.rowCount === 0) throw new AppError('Loan not found', 404);

    const deducted = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM employee_advance_repayments
       WHERE company_id = $1 AND loan_id = $2 AND status = 'deducted'`,
      [companyId, Number(loanId)]
    );
    if (Number(deducted.rows[0]?.count || 0) > 0) {
      throw new AppError('Cannot delete loan with deducted repayments', 400);
    }

    await client.query(
      `DELETE FROM employee_advance_repayments
       WHERE company_id = $1 AND loan_id = $2`,
      [companyId, Number(loanId)]
    );

    const removed = await client.query(
      `DELETE FROM employee_advance_loans
       WHERE company_id = $1 AND id = $2
       RETURNING id`,
      [companyId, Number(loanId)]
    );

    await client.query('COMMIT');
    return { id: removed.rows[0].id, deleted: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createAdvanceLoan,
  getCompanyLoans,
  getLoanById,
  getEmployeeLoans,
  getMonthlyRepayments,
  updateRepayment,
  markRepaymentDeducted,
  skipRepayment,
  getEmployeeLoanSummary,
  addLoanToEmployee,
  waiveLoan,
  deleteLoan,
};
