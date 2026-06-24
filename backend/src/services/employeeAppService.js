const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const employeeService = require('./employeeService');

const USER_PUBLIC_FIELDS = `id, company_id, name, email, role, employee_id, created_at`;

async function loadEmployee(companyId, employeeId) {
  return employeeService.getEmployeeById(companyId, employeeId, {});
}

async function getEmployeeAppAccess(companyId, employeeId) {
  const result = await pool.query(
    `SELECT ${USER_PUBLIC_FIELDS}
     FROM users
     WHERE company_id = $1 AND employee_id = $2 AND role = 'employee'
     LIMIT 1`,
    [companyId, employeeId]
  );
  if (result.rowCount === 0) {
    return null;
  }
  return result.rows[0];
}

async function provisionEmployeeAppAccess(companyId, employeeId, body = {}) {
  const emp = await loadEmployee(companyId, employeeId);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || emp.name || '').trim();

  if (!email) {
    throw new AppError('Email is required', 400);
  }
  if (!password || password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  const existing = await pool.query(
    `SELECT id FROM users WHERE company_id = $1 AND employee_id = $2 AND role = 'employee'`,
    [companyId, employeeId]
  );

  const hash = await bcrypt.hash(password, 10);

  if (existing.rowCount > 0) {
    const updated = await pool.query(
      `UPDATE users
       SET email = $1, password = $2, name = $3
       WHERE id = $4
       RETURNING ${USER_PUBLIC_FIELDS}`,
      [email, hash, name, existing.rows[0].id]
    );
    return { created: false, user: updated.rows[0] };
  }

  const inserted = await pool.query(
    `INSERT INTO users (company_id, name, email, password, role, employee_id)
     VALUES ($1, $2, $3, $4, 'employee', $5)
     RETURNING ${USER_PUBLIC_FIELDS}`,
    [companyId, name, email, hash, employeeId]
  );
  return { created: true, user: inserted.rows[0] };
}

async function revokeEmployeeAppAccess(companyId, employeeId) {
  const result = await pool.query(
    `DELETE FROM users
     WHERE company_id = $1 AND employee_id = $2 AND role = 'employee'
     RETURNING email`,
    [companyId, employeeId]
  );
  if (result.rowCount === 0) {
    throw new AppError('No employee app login found', 404);
  }
  return { email: result.rows[0].email };
}

async function getEmployeeAppStatus(companyId, employeeId) {
  const emp = await loadEmployee(companyId, employeeId);
  const companyResult = await pool.query(
    `SELECT id, name, email, phone, address FROM companies WHERE id = $1`,
    [companyId]
  );
  return {
    employee: {
      id: emp.id,
      name: emp.name,
      employee_code: emp.employee_code,
      department: emp.department,
    },
    company: companyResult.rows[0] || null,
  };
}

module.exports = {
  getEmployeeAppAccess,
  provisionEmployeeAppAccess,
  revokeEmployeeAppAccess,
  getEmployeeAppStatus,
};
