const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { signToken } = require('../middleware/auth');
const { AppError } = require('../utils/AppError');

/**
 * Register a new company and its first admin user.
 * Company is created with status 'pending' — no token returned until you approve.
 * @param {Object} company - { name, email?, phone?, address? }
 * @param {Object} admin - { name, email, password }
 * @returns {Promise<{ company, user, token?, pending }>}
 */
async function registerCompany(company, admin) {
  const { name: companyName, email: companyEmail, phone, address } = company;
  const { name: adminName, email: adminEmail, password } = admin;

  if (!companyName || !adminName || !adminEmail || !password) {
    throw new AppError('Company name, admin name, email and password are required', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query(
      `INSERT INTO companies (name, email, phone, address, status, payment_status)
       VALUES ($1, $2, $3, $4, 'pending', 'unpaid')
       RETURNING id, name, email, phone, address, status, created_at`,
      [companyName, companyEmail || null, phone || null, address || null]
    );
    const companyRow = companyResult.rows[0];
    const companyId = companyRow.id;

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      `INSERT INTO users (company_id, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, company_id, name, email, role, created_at`,
      [companyId, adminName, adminEmail, passwordHash, 'admin']
    );
    const userRow = userResult.rows[0];

    await client.query(
      `INSERT INTO branches (company_id, name) VALUES ($1, 'Main')`,
      [companyId]
    );

    await client.query('COMMIT');

    // No token: company is pending approval. You approve after payment, then they can log in.
    return {
      company: { ...companyRow, status: 'pending' },
      user: {
        id: userRow.id,
        company_id: userRow.company_id,
        name: userRow.name,
        email: userRow.email,
        role: userRow.role,
        created_at: userRow.created_at,
      },
      token: null,
      pending: true,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('Company email or admin email already in use', 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * SuperAdmin: create an active company + admin login (no pending approval).
 * @param {Object} payload
 */
async function createCompanyProvisionedBySuperadmin(payload) {
  const companyIn = payload?.company || {};
  const adminIn = payload?.admin || {};
  const companyName = companyIn.name;
  const companyEmail = companyIn.email;
  const phone = companyIn.phone;
  const address = companyIn.address;
  const adminName = adminIn.name;
  const adminEmail = adminIn.email;
  const password = adminIn.password;

  if (!companyName || !adminName || !adminEmail || !password) {
    throw new AppError('Company name, admin name, email and password are required', 400);
  }
  if (String(password).length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const plan_code = typeof payload.plan_code === 'string' ? payload.plan_code.trim().toLowerCase() : 'starter';
  const allowedPlans = ['starter', 'growth', 'business', 'professional', 'enterprise', 'custom'];
  if (!allowedPlans.includes(plan_code)) {
    throw new AppError(`plan_code must be one of: ${allowedPlans.join(', ')}`, 400);
  }

  const branchesAllowed = Number(payload.branches_allowed);
  const staffsAllowed = Number(payload.staffs_allowed);
  if (!Number.isInteger(branchesAllowed) || branchesAllowed < 1) {
    throw new AppError('branches_allowed must be a positive integer (total branches including Main)', 400);
  }
  if (!Number.isInteger(staffsAllowed) || staffsAllowed < 1) {
    throw new AppError('staffs_allowed must be a positive integer', 400);
  }

  const subscriptionStartRaw = payload.subscription_start_date;
  if (!subscriptionStartRaw) {
    throw new AppError('subscription_start_date is required (YYYY-MM-DD)', 400);
  }
  const startDate = new Date(subscriptionStartRaw);
  if (Number.isNaN(startDate.getTime())) {
    throw new AppError('Invalid subscription_start_date', 400);
  }
  startDate.setHours(0, 0, 0, 0);

  let endDate;
  if (payload.subscription_end_date) {
    endDate = new Date(payload.subscription_end_date);
    if (Number.isNaN(endDate.getTime())) {
      throw new AppError('Invalid subscription_end_date', 400);
    }
    endDate.setHours(0, 0, 0, 0);
  } else {
    endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  let lastAmc = null;
  if (payload.last_amc_payment_date) {
    const d = new Date(payload.last_amc_payment_date);
    if (Number.isNaN(d.getTime())) {
      throw new AppError('Invalid last_amc_payment_date', 400);
    }
    d.setHours(0, 0, 0, 0);
    lastAmc = d;
  }

  const paymentStatus =
    typeof payload.payment_status === 'string' ? payload.payment_status.trim().toLowerCase() : 'unpaid';
  const allowedPay = ['trial', 'paid', 'pending', 'overdue', 'unpaid'];
  if (!allowedPay.includes(paymentStatus)) {
    throw new AppError(`payment_status must be one of: ${allowedPay.join(', ')}`, 400);
  }

  const onetimeFeePaid = payload.onetime_fee_paid === true;
  const onetimeAmt =
    payload.onetime_fee_amount != null && payload.onetime_fee_amount !== ''
      ? Number(payload.onetime_fee_amount)
      : null;
  const amcAmt =
    payload.amc_amount != null && payload.amc_amount !== '' ? Number(payload.amc_amount) : null;
  if (onetimeAmt != null && (!Number.isFinite(onetimeAmt) || onetimeAmt < 0)) {
    throw new AppError('onetime_fee_amount must be a non-negative number', 400);
  }
  if (amcAmt != null && (!Number.isFinite(amcAmt) || amcAmt < 0)) {
    throw new AppError('amc_amount must be a non-negative number', 400);
  }

  const branch_limit_override = Math.max(0, branchesAllowed - 1);
  const employee_limit_override = staffsAllowed;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query(
      `INSERT INTO companies (
         name, email, phone, address, status,
         plan_code, billing_cycle, payment_status,
         subscription_start_date, subscription_end_date, next_billing_date,
         is_active,
         employee_limit_override, branch_limit_override,
         onetime_fee_paid, onetime_fee_amount, amc_amount, last_amc_payment_date
       )
       VALUES (
         $1, $2, $3, $4, 'active',
         $5, 'annual', $6,
         $7::date, $8::date, $8::date,
         TRUE,
         $9, $10,
         $11, $12, $13, $14::date
       )
       RETURNING id, name, email, phone, address, status, created_at,
         plan_code, subscription_start_date, subscription_end_date, payment_status,
         onetime_fee_paid, onetime_fee_amount, amc_amount, last_amc_payment_date`,
      [
        companyName,
        companyEmail || null,
        phone || null,
        address || null,
        plan_code,
        paymentStatus,
        startDate,
        endDate,
        employee_limit_override,
        branch_limit_override,
        onetimeFeePaid,
        onetimeAmt,
        amcAmt,
        lastAmc,
      ]
    );
    const companyRow = companyResult.rows[0];
    const companyId = companyRow.id;

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (company_id, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, company_id, name, email, role, created_at`,
      [companyId, adminName, adminEmail, passwordHash, 'admin']
    );

    await client.query(`INSERT INTO branches (company_id, name) VALUES ($1, 'Main')`, [companyId]);

    await client.query('COMMIT');

    return {
      company: companyRow,
      user: userResult.rows[0],
      admin_password_plaintext_once: password,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError('Company email or admin email already in use', 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Login: email + password only. Finds user by email (if multiple companies, first matching password with active company wins).
 * Rejects if company status is 'pending' or 'declined'.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user, token }>}
 */
async function login(email, password) {
  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const result = await pool.query(
    `SELECT u.id, u.company_id, u.name, u.email, u.password, u.role, u.created_at, c.status AS company_status
     FROM users u
     JOIN companies c ON c.id = u.company_id
     WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1))
     ORDER BY u.id`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  for (const row of result.rows) {
    if (row.company_status === 'pending') {
      throw new AppError(
        'Your company registration is pending approval. You will be notified once it is activated.',
        403
      );
    }
    if (row.company_status === 'locked') {
      throw new AppError(
        'Your company account has been locked. Please contact support or your service provider.',
        403
      );
    }
    if (row.company_status === 'declined') {
      continue; // try next account if any
    }
    const valid = await bcrypt.compare(password, row.password);
    if (valid) {
      const token = signToken({
        user_id: row.id,
        company_id: row.company_id,
        role: row.role,
        email: row.email,
      });
      return {
        user: {
          id: row.id,
          company_id: row.company_id,
          name: row.name,
          email: row.email,
          role: row.role,
          created_at: row.created_at,
        },
        token,
      };
    }
  }

  throw new AppError('Invalid email or password', 401);
}

async function changeAdminPassword(userId, companyId, currentPassword, newPassword) {
  if (!userId || !companyId) {
    throw new AppError('Invalid authenticated user context', 401);
  }
  if (!currentPassword || !newPassword) {
    throw new AppError('Current password and new password are required', 400);
  }
  if (String(newPassword).length < 8) {
    throw new AppError('New password must be at least 8 characters', 400);
  }

  const userResult = await pool.query(
    `SELECT id, company_id, name, email, password, role
     FROM users
     WHERE id = $1 AND company_id = $2 AND role IN ('admin', 'hr')
     LIMIT 1`,
    [userId, companyId]
  );
  if (userResult.rowCount === 0) {
    throw new AppError('User not found or cannot change password for this role', 404);
  }

  const user = userResult.rows[0];
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
  if (isSameAsCurrent) {
    throw new AppError('New password must be different from current password', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    `UPDATE users
     SET password = $1
     WHERE id = $2 AND company_id = $3 AND role IN ('admin', 'hr')`,
    [passwordHash, user.id, user.company_id]
  );

  return {
    id: user.id,
    company_id: user.company_id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

async function superadminResetAdminPassword(companyId, selector, newPassword) {
  if (!companyId) {
    throw new AppError('company_id is required', 400);
  }
  if (!selector || (selector.adminUserId == null && !selector.adminEmail)) {
    throw new AppError('Either admin_user_id or admin_email is required', 400);
  }
  if (!newPassword) {
    throw new AppError('new_password is required', 400);
  }
  if (String(newPassword).length < 8) {
    throw new AppError('new_password must be at least 8 characters', 400);
  }

  const whereClauses = [`company_id = $1`, `role = 'admin'`];
  const params = [companyId];

  if (selector.adminUserId != null) {
    whereClauses.push(`id = $${params.length + 1}`);
    params.push(selector.adminUserId);
  } else {
    whereClauses.push(`LOWER(TRIM(email)) = LOWER(TRIM($${params.length + 1}))`);
    params.push(selector.adminEmail);
  }

  const userResult = await pool.query(
    `SELECT id, company_id, name, email, role
     FROM users
     WHERE ${whereClauses.join(' AND ')}
     LIMIT 1`,
    params
  );
  if (userResult.rowCount === 0) {
    throw new AppError('Admin user not found for this company', 404);
  }

  const user = userResult.rows[0];
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    `UPDATE users
     SET password = $1
     WHERE id = $2 AND company_id = $3 AND role = 'admin'`,
    [passwordHash, user.id, user.company_id]
  );

  return {
    id: user.id,
    company_id: user.company_id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

module.exports = {
  registerCompany,
  createCompanyProvisionedBySuperadmin,
  login,
  changeAdminPassword,
  superadminResetAdminPassword,
};
