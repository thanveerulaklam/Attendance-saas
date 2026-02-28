const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const {
  validateCreateEmployee,
  validateUpdateEmployee,
} = require('../validators/employeeValidator');

/**
 * Create a new employee for a company.
 * Enforces unique employee_code per company.
 */
async function createEmployee(companyId, data) {
  const payload = validateCreateEmployee(data);

  try {
    const result = await pool.query(
      `INSERT INTO employees (
        company_id,
        name,
        employee_code,
        basic_salary,
        join_date,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, company_id, name, employee_code, basic_salary, join_date, status, created_at`,
      [
        companyId,
        payload.name,
        payload.employee_code,
        payload.basic_salary,
        payload.join_date,
        payload.status,
      ]
    );

    return result.rows[0];
  } catch (err) {
    // Unique violation on indexed (company_id, employee_code)
    if (err.code === '23505') {
      throw new AppError('Employee code already exists for this company', 409);
    }
    throw err;
  }
}

/**
 * Get paginated employees for a company with optional search.
 * Search is applied on indexed fields: name and employee_code.
 */
async function getEmployees(companyId, { page = 1, limit = 10, search } = {}) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const offset = (pageNumber - 1) * pageSize;

  const baseParams = [companyId];
  let whereClause = 'WHERE company_id = $1';

  if (search && String(search).trim() !== '') {
    baseParams.push(`%${String(search).trim()}%`);
    whereClause += ` AND (name ILIKE $2 OR employee_code ILIKE $2)`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total
     FROM employees
     ${whereClause}`,
    baseParams
  );

  const total = Number(countResult.rows[0]?.total || 0);

  const limitIndex = baseParams.length + 1;
  const offsetIndex = baseParams.length + 2;

  const listResult = await pool.query(
    `SELECT
        id,
        company_id,
        name,
        employee_code,
        basic_salary,
        join_date,
        status,
        created_at
     FROM employees
     ${whereClause}
     ORDER BY name ASC
     LIMIT $${limitIndex}
     OFFSET $${offsetIndex}`,
    [...baseParams, pageSize, offset]
  );

  return {
    data: listResult.rows,
    page: pageNumber,
    limit: pageSize,
    total,
  };
}

/**
 * Fetch a single employee by id for a company.
 */
async function getEmployeeById(companyId, id) {
  const result = await pool.query(
    `SELECT
        id,
        company_id,
        name,
        employee_code,
        basic_salary,
        join_date,
        status,
        created_at
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, id]
  );

  if (result.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }

  return result.rows[0];
}

/**
 * Update an employee's fields (all optional) for a company.
 * Enforces uniqueness of employee_code per company when changed.
 */
async function updateEmployee(companyId, id, data) {
  const updates = validateUpdateEmployee(data);

  if (Object.keys(updates).length === 0) {
    // Nothing to update, but ensure the employee exists
    return getEmployeeById(companyId, id);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const fields = [];
    const values = [companyId, id];
    let paramIndex = 3;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex += 1;
    }

    const query = `
      UPDATE employees
      SET ${fields.join(', ')}
      WHERE company_id = $1 AND id = $2
      RETURNING id, company_id, name, employee_code, basic_salary, join_date, status, created_at
    `;

    const result = await client.query(query, values);

    if (result.rowCount === 0) {
      throw new AppError('Employee not found for this company', 404);
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('Employee code already exists for this company', 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deactivate an employee (soft delete) by setting status to 'inactive'.
 */
async function deactivateEmployee(companyId, id) {
  const result = await pool.query(
    `UPDATE employees
     SET status = 'inactive'
     WHERE company_id = $1 AND id = $2
     RETURNING id, company_id, name, employee_code, basic_salary, join_date, status, created_at`,
    [companyId, id]
  );

  if (result.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }

  return result.rows[0];
}

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
};

