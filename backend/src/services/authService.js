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
      `INSERT INTO companies (name, email, phone, address, status)
       VALUES ($1, $2, $3, $4, 'pending')
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

module.exports = { registerCompany, login };
