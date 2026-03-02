const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

async function listAdvances(companyId, { year, month, employee_id: employeeId } = {}) {
  const conditions = ['a.company_id = $1'];
  const params = [companyId];
  let idx = 2;

  if (year != null && year !== '') {
    conditions.push(`a.year = $${idx}`);
    params.push(Number(year));
    idx += 1;
  }
  if (month != null && month !== '') {
    conditions.push(`a.month = $${idx}`);
    params.push(Number(month));
    idx += 1;
  }
  if (employeeId != null && employeeId !== '') {
    conditions.push(`a.employee_id = $${idx}`);
    params.push(Number(employeeId));
    idx += 1;
  }

  const whereClause = conditions.join(' AND ');

  const result = await pool.query(
    `SELECT
        a.id,
        a.company_id,
        a.employee_id,
        a.year,
        a.month,
        a.amount,
        a.note,
        a.advance_date,
        a.created_at,
        a.updated_at,
        e.name AS employee_name,
        e.employee_code AS employee_code
     FROM employee_advances a
     INNER JOIN employees e ON e.id = a.employee_id AND e.company_id = a.company_id
     WHERE ${whereClause}
     ORDER BY a.year DESC, a.month DESC, e.name ASC`,
    params
  );

  return result.rows;
}

function parseAdvanceDate(input) {
  if (input == null || input === '') return null;
  const str = String(input).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + 'T12:00:00.000Z');
  if (Number.isNaN(d.getTime())) return null;
  return str;
}

async function upsertAdvance(companyId, data) {
  const employeeId = Number(data.employee_id);
  const year = Number(data.year);
  const month = Number(data.month);
  const amountNum = Number(data.amount);
  const note = typeof data.note === 'string' ? data.note.trim() : null;
  const advanceDateInput = parseAdvanceDate(data.advance_date);
  const advanceDate = advanceDateInput || new Date().toISOString().slice(0, 10);

  if (!companyId || !employeeId || !year || !month) {
    throw new AppError('companyId (from token), employee_id, year and month are required', 400);
  }
  if (month < 1 || month > 12) {
    throw new AppError('month must be between 1 and 12', 400);
  }
  if (!Number.isFinite(amountNum) || amountNum < 0) {
    throw new AppError('amount must be a non-negative number', 400);
  }

  const result = await pool.query(
    `INSERT INTO employee_advances (
        company_id,
        employee_id,
        year,
        month,
        amount,
        note,
        advance_date
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (company_id, employee_id, year, month)
     DO UPDATE SET
        amount = EXCLUDED.amount,
        note = EXCLUDED.note,
        advance_date = EXCLUDED.advance_date,
        updated_at = NOW()
     RETURNING
        id,
        company_id,
        employee_id,
        year,
        month,
        amount,
        note,
        advance_date,
        created_at,
        updated_at`,
    [companyId, employeeId, year, month, amountNum, note, advanceDate]
  );

  return result.rows[0];
}

async function getAdvanceForEmployeeMonth(companyId, employeeId, year, month) {
  const result = await pool.query(
    `SELECT amount
     FROM employee_advances
     WHERE company_id = $1
       AND employee_id = $2
       AND year = $3
       AND month = $4`,
    [companyId, employeeId, year, month]
  );

  if (result.rowCount === 0) return 0;
  return Number(result.rows[0].amount || 0);
}

module.exports = {
  listAdvances,
  upsertAdvance,
  getAdvanceForEmployeeMonth,
};

