const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const {
  validateCreateEmployee,
  validateUpdateEmployee,
} = require('../validators/employeeValidator');

// Employee limits per plan. Null means "no limit" for that plan.
const PLAN_EMPLOYEE_LIMITS = {
  starter: 30,
  growth: 100,
  business: 250,
  enterprise: 500,
  custom: null,
};

async function assertEmployeeLimitNotExceeded(companyId) {
  // Fetch company plan
  const companyResult = await pool.query(
    `SELECT plan_code FROM companies WHERE id = $1`,
    [companyId]
  );

  if (companyResult.rowCount === 0) {
    throw new AppError('Company not found', 404);
  }

  const planCode = (companyResult.rows[0].plan_code || 'starter').toLowerCase();
  const limit = Object.prototype.hasOwnProperty.call(PLAN_EMPLOYEE_LIMITS, planCode)
    ? PLAN_EMPLOYEE_LIMITS[planCode]
    : null;

  if (limit == null) {
    // No limit for this plan (e.g. enterprise)
    return;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) AS active_count
     FROM employees
     WHERE company_id = $1 AND status = 'active'`,
    [companyId]
  );

  const activeCount = Number(countResult.rows[0]?.active_count || 0);
  if (activeCount >= limit) {
    const planName = planCode.charAt(0).toUpperCase() + planCode.slice(1);
    throw new AppError(
      `You have reached the employee limit for your ${planName} plan (${limit} active employees). Please contact support using the WhatsApp help button in the bottom-left corner of the app to upgrade your plan.`,
      403
    );
  }
}

/**
 * Create a new employee for a company.
 * Enforces unique employee_code per company.
 */
async function createEmployee(companyId, data) {
  const payload = validateCreateEmployee(data);

  const shiftId = payload.shift_id != null ? payload.shift_id : null;

  const dailyTravelAllowance =
    payload.daily_travel_allowance != null ? payload.daily_travel_allowance : 0;
  const esiAmount = payload.esi_amount != null ? payload.esi_amount : 0;
  const department = payload.department != null ? payload.department : null;
  const phoneNumber = payload.phone_number != null ? payload.phone_number : null;
  const aadharNumber = payload.aadhar_number != null ? payload.aadhar_number : null;
  const esiNumber = payload.esi_number != null ? payload.esi_number : null;

  try {
    // Enforce per-plan active employee limits before creating a new active employee
    if (payload.status === 'active') {
      await assertEmployeeLimitNotExceeded(companyId);
    }

    const result = await pool.query(
      `INSERT INTO employees (
        company_id,
        name,
        employee_code,
        department,
        phone_number,
        aadhar_number,
        esi_number,
        basic_salary,
        join_date,
        status,
        shift_id,
        daily_travel_allowance,
        esi_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, company_id, name, employee_code, department, phone_number, aadhar_number, esi_number, basic_salary, join_date, status, shift_id, daily_travel_allowance, esi_amount, created_at`,
      [
        companyId,
        payload.name,
        payload.employee_code,
        department,
        phoneNumber,
        aadharNumber,
        esiNumber,
        payload.basic_salary,
        payload.join_date,
        payload.status,
        shiftId,
        dailyTravelAllowance,
        esiAmount,
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
        department,
        phone_number,
        aadhar_number,
        esi_number,
        basic_salary,
        join_date,
        status,
        shift_id,
        daily_travel_allowance,
        esi_amount,
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
        department,
        phone_number,
        aadhar_number,
        esi_number,
        basic_salary,
        join_date,
        status,
        shift_id,
        daily_travel_allowance,
        esi_amount,
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
      RETURNING id, company_id, name, employee_code, department, phone_number, aadhar_number, esi_number, basic_salary, join_date, status, shift_id, daily_travel_allowance, esi_amount, created_at
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
     RETURNING id, company_id, name, employee_code, department, phone_number, aadhar_number, esi_number, basic_salary, join_date, status, shift_id, daily_travel_allowance, esi_amount, created_at`,
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
  getEmployeeDepartments,
};

/**
 * Returns distinct, previously-used departments for the company.
 */
async function getEmployeeDepartments(companyId) {
  const result = await pool.query(
    `SELECT DISTINCT department
     FROM employees
     WHERE company_id = $1
       AND department IS NOT NULL
       AND department <> ''
     ORDER BY department ASC`,
    [companyId]
  );

  return result.rows.map((r) => r.department);
}

