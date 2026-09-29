const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { todayIstYmd } = require('../utils/istDate');
const { resolveNewSalary } = require('../utils/salaryChange');

const INCREMENT_RETURNING = `
  id,
  employee_id,
  previous_salary,
  new_salary,
  change_amount,
  effective_date::text AS effective_date,
  notes,
  source,
  created_by,
  created_at
`;

function normalizeUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function normalizeNotes(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > 500) {
    throw new AppError('Note must be 500 characters or fewer.', 400);
  }
  return text;
}

function normalizeEffectiveDate(value) {
  if (value == null || String(value).trim() === '') {
    return todayIstYmd();
  }
  const raw = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError('Effective date must be YYYY-MM-DD.', 400);
  }
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new AppError('Effective date is not a valid calendar date.', 400);
  }
  return raw;
}

function assertHrCanSee(employee, branchContext = {}) {
  const { role, allowedBranchIds } = branchContext;
  if (role !== 'hr' || allowedBranchIds == null) return;
  if (!allowedBranchIds.includes(Number(employee.branch_id))) {
    throw new AppError('Employee not found for this company', 404);
  }
}

function parseEmployeeId(value) {
  const employeeId = Number(value);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new AppError('Employee is required.', 400);
  }
  return employeeId;
}

async function insertSalaryIncrement(client, {
  companyId,
  employeeId,
  previousSalary,
  newSalary,
  changeAmount,
  effectiveDate,
  notes,
  source,
  createdBy,
}) {
  const result = await client.query(
    `INSERT INTO employee_salary_increments (
       company_id,
       employee_id,
       previous_salary,
       new_salary,
       change_amount,
       effective_date,
       notes,
       source,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${INCREMENT_RETURNING}`,
    [
      companyId,
      employeeId,
      previousSalary,
      newSalary,
      changeAmount,
      effectiveDate,
      notes,
      source,
      normalizeUserId(createdBy),
    ]
  );
  return result.rows[0];
}

async function listEmployees(companyId, query = {}, allowedBranchIds = null) {
  const pageNumber = Math.max(Number(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query.limit) || 50, 1), 500);
  const offset = (pageNumber - 1) * pageSize;

  const params = [companyId];
  let where = 'WHERE e.company_id = $1';
  let p = 2;

  if (allowedBranchIds != null) {
    if (allowedBranchIds.length === 0) {
      return { data: [], page: pageNumber, limit: pageSize, total: 0 };
    }
    params.push(allowedBranchIds);
    where += ` AND e.branch_id = ANY($${p}::bigint[])`;
    p += 1;
  }

  const status = String(query.status || 'active').trim().toLowerCase();
  if (status && status !== 'all') {
    params.push(status);
    where += ` AND e.status = $${p}`;
    p += 1;
  }

  const search = String(query.search || '').trim();
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (e.name ILIKE $${p} OR e.employee_code ILIKE $${p})`;
    p += 1;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM employees e ${where}`,
    params
  );

  const result = await pool.query(
    `SELECT
       e.id,
       e.name,
       e.employee_code,
       e.department,
       e.status,
       e.salary_type,
       e.basic_salary,
       last.change_amount AS last_change_amount,
       last.effective_date::text AS last_effective_date,
       COALESCE(counts.increment_count, 0)::int AS increment_count
     FROM employees e
     LEFT JOIN LATERAL (
       SELECT change_amount, effective_date
       FROM employee_salary_increments i
       WHERE i.company_id = e.company_id AND i.employee_id = e.id
       ORDER BY i.effective_date DESC, i.created_at DESC, i.id DESC
       LIMIT 1
     ) last ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS increment_count
       FROM employee_salary_increments i
       WHERE i.company_id = e.company_id AND i.employee_id = e.id
     ) counts ON TRUE
     ${where}
     ORDER BY LOWER(TRIM(e.name)) ASC, e.id ASC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...params, pageSize, offset]
  );

  return {
    data: result.rows,
    page: pageNumber,
    limit: pageSize,
    total: countResult.rows[0]?.total || 0,
  };
}

async function getHistory(companyId, employeeId, branchContext = {}) {
  const id = parseEmployeeId(employeeId);
  const employeeResult = await pool.query(
    `SELECT id, branch_id, name, employee_code, department, status, salary_type, basic_salary
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, id]
  );
  if (employeeResult.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }
  const employee = employeeResult.rows[0];
  assertHrCanSee(employee, branchContext);

  const history = await pool.query(
    `SELECT
       i.id,
       i.previous_salary,
       i.new_salary,
       i.change_amount,
       i.effective_date::text AS effective_date,
       i.notes,
       i.source,
       i.created_at,
       u.name AS created_by_name
     FROM employee_salary_increments i
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.company_id = $1 AND i.employee_id = $2
     ORDER BY i.effective_date DESC, i.created_at DESC, i.id DESC`,
    [companyId, id]
  );

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employee_code: employee.employee_code,
      department: employee.department,
      status: employee.status,
      salary_type: employee.salary_type,
      basic_salary: employee.basic_salary,
    },
    increments: history.rows,
  };
}

async function applySalaryChange(companyId, body = {}, branchContext = {}) {
  const employeeId = parseEmployeeId(body.employee_id);
  const effectiveDate = normalizeEffectiveDate(body.effective_date);
  const notes = normalizeNotes(body.notes);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      `SELECT id, branch_id, name, employee_code, department, status, salary_type, basic_salary
       FROM employees
       WHERE company_id = $1 AND id = $2
       FOR UPDATE`,
      [companyId, employeeId]
    );
    if (locked.rowCount === 0) {
      throw new AppError('Employee not found for this company', 404);
    }
    const employee = locked.rows[0];
    assertHrCanSee(employee, branchContext);

    const resolved = resolveNewSalary({
      previousSalary: employee.basic_salary,
      newSalary: body.new_salary,
      changeAmount: body.change_amount,
    });
    if (resolved.error) {
      throw new AppError(resolved.error, 400);
    }

    const updated = await client.query(
      `UPDATE employees
       SET basic_salary = $3
       WHERE company_id = $1 AND id = $2
       RETURNING id, name, employee_code, department, status, salary_type, basic_salary`,
      [companyId, employeeId, resolved.newSalary]
    );

    const increment = await insertSalaryIncrement(client, {
      companyId,
      employeeId,
      previousSalary: resolved.previousSalary,
      newSalary: resolved.newSalary,
      changeAmount: resolved.changeAmount,
      effectiveDate,
      notes,
      source: 'manual',
      createdBy: branchContext.userId,
    });

    await client.query('COMMIT');
    return {
      employee: updated.rows[0],
      increment,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  insertSalaryIncrement,
  listEmployees,
  getHistory,
  applySalaryChange,
};
