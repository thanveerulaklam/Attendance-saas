const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const {
  validateCreateEmployee,
  validateUpdateEmployee,
} = require('../validators/employeeValidator');

// Employee limits per plan. Null means "no limit" for that plan.
const PLAN_EMPLOYEE_LIMITS = {
  starter: 50,
  growth: 100,
  business: 250,
  enterprise: 500,
  custom: null,
};

const EMPLOYEE_SELECT_FIELDS = `
        id,
        company_id,
        branch_id,
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
        created_at`;

/**
 * Effective cap: companies.employee_limit_override if set, else plan mapping.
 * @returns {Promise<number|null>} null = no cap
 */
async function getEffectiveEmployeeLimit(companyId) {
  const companyResult = await pool.query(
    `SELECT plan_code, employee_limit_override FROM companies WHERE id = $1`,
    [companyId]
  );

  if (companyResult.rowCount === 0) {
    return null;
  }

  const row = companyResult.rows[0];
  if (row.employee_limit_override != null && row.employee_limit_override !== '') {
    return Number(row.employee_limit_override);
  }

  const planCode = (row.plan_code || 'starter').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PLAN_EMPLOYEE_LIMITS, planCode)) {
    return null;
  }
  return PLAN_EMPLOYEE_LIMITS[planCode];
}

async function assertEmployeeLimitNotExceeded(companyId) {
  const companyResult = await pool.query(
    `SELECT plan_code, employee_limit_override FROM companies WHERE id = $1`,
    [companyId]
  );

  if (companyResult.rowCount === 0) {
    throw new AppError('Company not found', 404);
  }

  const limit = await getEffectiveEmployeeLimit(companyId);

  if (limit == null) {
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
    const planCode = (companyResult.rows[0].plan_code || 'starter').toLowerCase();
    const planName = planCode.charAt(0).toUpperCase() + planCode.slice(1);
    throw new AppError(
      `You have reached the employee limit for your account (${limit} active employees${companyResult.rows[0].employee_limit_override != null ? ', set by provider' : ` — ${planName} plan`}). Please contact support using the WhatsApp help button in the bottom-left corner of the app to upgrade your plan.`,
      403
    );
  }
}

/**
 * @param {object} branchContext
 * @param {string} [branchContext.role]
 * @param {number[]|null} [branchContext.allowedBranchIds] - null = admin (all branches)
 * @param {number|null} [branchContext.defaultBranchId]
 */
async function resolveBranchIdForCreate(companyId, payload, branchContext = {}) {
  const { role, allowedBranchIds, defaultBranchId } = branchContext;
  const requested =
    payload.branch_id != null && payload.branch_id !== '' ? Number(payload.branch_id) : null;

  if (role === 'admin' || allowedBranchIds == null) {
    if (requested) {
      const ok = await pool.query(
        `SELECT id FROM branches WHERE id = $1 AND company_id = $2`,
        [requested, companyId]
      );
      if (ok.rowCount === 0) {
        throw new AppError('Invalid branch_id for this company', 400);
      }
      return requested;
    }
    const first = await pool.query(
      `SELECT id FROM branches WHERE company_id = $1 ORDER BY id ASC LIMIT 1`,
      [companyId]
    );
    if (first.rowCount === 0) {
      throw new AppError('No branch configured for this company', 400);
    }
    return Number(first.rows[0].id);
  }

  const target = requested ?? defaultBranchId;
  if (!target) {
    throw new AppError('branch_id is required', 400);
  }
  if (!allowedBranchIds.includes(Number(target))) {
    throw new AppError('Branch not allowed for your account', 403);
  }
  return Number(target);
}

async function assertEmployeeVisibleToHr(companyId, employeeId, branchContext = {}) {
  const { role, allowedBranchIds } = branchContext;
  if (role !== 'hr' || allowedBranchIds == null) {
    return;
  }
  if (allowedBranchIds.length === 0) {
    throw new AppError('Employee not found for this company', 404);
  }
  const r = await pool.query(
    `SELECT branch_id FROM employees WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  if (r.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }
  const bid = Number(r.rows[0].branch_id);
  if (!allowedBranchIds.includes(bid)) {
    throw new AppError('Employee not found for this company', 404);
  }
}

function branchFilterSql(allowedBranchIds, paramIndex) {
  if (allowedBranchIds == null) {
    return { clause: '', params: [], nextIndex: paramIndex };
  }
  if (allowedBranchIds.length === 0) {
    return { clause: ' AND FALSE', params: [], nextIndex: paramIndex };
  }
  return {
    clause: ` AND branch_id = ANY($${paramIndex}::bigint[])`,
    params: [allowedBranchIds],
    nextIndex: paramIndex + 1,
  };
}

/**
 * Create a new employee for a company.
 * Enforces unique employee_code per company.
 * @param {object} [branchContext] - role, allowedBranchIds, defaultBranchId
 */
async function createEmployee(companyId, data, branchContext = {}) {
  const payload = validateCreateEmployee(data);

  const shiftId = payload.shift_id != null ? payload.shift_id : null;

  const dailyTravelAllowance =
    payload.daily_travel_allowance != null ? payload.daily_travel_allowance : 0;
  const esiAmount = payload.esi_amount != null ? payload.esi_amount : 0;
  const department = payload.department != null ? payload.department : null;
  const phoneNumber = payload.phone_number != null ? payload.phone_number : null;
  const aadharNumber = payload.aadhar_number != null ? payload.aadhar_number : null;
  const esiNumber = payload.esi_number != null ? payload.esi_number : null;

  const branchId = await resolveBranchIdForCreate(companyId, payload, branchContext);

  try {
    if (payload.status === 'active') {
      await assertEmployeeLimitNotExceeded(companyId);
    }

    const result = await pool.query(
      `INSERT INTO employees (
        company_id,
        branch_id,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING ${EMPLOYEE_SELECT_FIELDS}`,
      [
        companyId,
        branchId,
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
    if (err.code === '23505') {
      throw new AppError('Employee code already exists for this company', 409);
    }
    throw err;
  }
}

/**
 * Get paginated employees for a company with optional search.
 * @param {number[]|null} [allowedBranchIds] - null = all branches (admin)
 */
async function getEmployees(
  companyId,
  { page = 1, limit = 10, search } = {},
  allowedBranchIds = null
) {
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const offset = (pageNumber - 1) * pageSize;

  const baseParams = [companyId];
  let whereClause = 'WHERE company_id = $1';

  const bf = branchFilterSql(allowedBranchIds, 2);
  whereClause += bf.clause;
  baseParams.push(...bf.params);
  let p = bf.nextIndex;

  if (search && String(search).trim() !== '') {
    baseParams.push(`%${String(search).trim()}%`);
    whereClause += ` AND (name ILIKE $${p} OR employee_code ILIKE $${p})`;
    p += 1;
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
    `SELECT ${EMPLOYEE_SELECT_FIELDS}
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
async function getEmployeeById(companyId, id, branchContext = {}) {
  const result = await pool.query(
    `SELECT ${EMPLOYEE_SELECT_FIELDS}
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, id]
  );

  if (result.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }

  await assertEmployeeVisibleToHr(companyId, id, branchContext);

  return result.rows[0];
}

/**
 * Update an employee's fields (all optional) for a company.
 */
async function updateEmployee(companyId, id, data, branchContext = {}) {
  await assertEmployeeVisibleToHr(companyId, id, branchContext);

  const updates = validateUpdateEmployee(data);

  if (Object.keys(updates).length === 0) {
    return getEmployeeById(companyId, id, branchContext);
  }

  if (updates.branch_id != null) {
    const bid = Number(updates.branch_id);
    const ok = await pool.query(
      `SELECT id FROM branches WHERE id = $1 AND company_id = $2`,
      [bid, companyId]
    );
    if (ok.rowCount === 0) {
      throw new AppError('Invalid branch_id for this company', 400);
    }
    if (branchContext.role === 'hr' && branchContext.allowedBranchIds != null) {
      if (!branchContext.allowedBranchIds.includes(bid)) {
        throw new AppError('Branch not allowed for your account', 403);
      }
    }
  }

  if (updates.status === 'active') {
    const prev = await pool.query(
      `SELECT status FROM employees WHERE company_id = $1 AND id = $2`,
      [companyId, id]
    );
    if (prev.rowCount > 0 && prev.rows[0].status !== 'active') {
      await assertEmployeeLimitNotExceeded(companyId);
    }
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
      RETURNING ${EMPLOYEE_SELECT_FIELDS}
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
async function deactivateEmployee(companyId, id, branchContext = {}) {
  await assertEmployeeVisibleToHr(companyId, id, branchContext);

  const result = await pool.query(
    `UPDATE employees
     SET status = 'inactive'
     WHERE company_id = $1 AND id = $2
     RETURNING ${EMPLOYEE_SELECT_FIELDS}`,
    [companyId, id]
  );

  if (result.rowCount === 0) {
    throw new AppError('Employee not found for this company', 404);
  }

  return result.rows[0];
}

/**
 * Returns distinct, previously-used departments for the company (or branch scope for HR).
 */
async function getEmployeeDepartments(companyId, allowedBranchIds = null) {
  const params = [companyId];
  let where = 'WHERE company_id = $1';
  const bf = branchFilterSql(allowedBranchIds, 2);
  where += bf.clause;
  params.push(...bf.params);

  const result = await pool.query(
    `SELECT DISTINCT department
     FROM employees
     ${where}
       AND department IS NOT NULL
       AND department <> ''
     ORDER BY department ASC`,
    params
  );

  return result.rows.map((r) => r.department);
}

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
  getEmployeeDepartments,
  getEffectiveEmployeeLimit,
  assertEmployeeLimitNotExceeded,
  PLAN_EMPLOYEE_LIMITS,
};
