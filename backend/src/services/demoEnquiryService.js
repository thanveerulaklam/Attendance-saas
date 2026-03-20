const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

function normText(v) {
  if (v == null) return '';
  return String(v).trim();
}

async function createDemoEnquiry(companyIdIgnored, data) {
  // Public endpoint: no companyId and no auth
  const fullName = normText(data.full_name);
  const businessName = normText(data.business_name);
  const phoneNumber = normText(data.phone_number);
  const employeesRange = normText(data.employees_range);
  const notes = data.notes ? normText(data.notes) : null;

  if (!fullName) throw new AppError('Full name is required', 400);
  if (!businessName) throw new AppError('Business name is required', 400);
  if (!phoneNumber) throw new AppError('Phone number is required', 400);
  if (!employeesRange) throw new AppError('Number of employees is required', 400);

  const result = await pool.query(
    `INSERT INTO demo_enquiries (
       full_name, business_name, phone_number, employees_range,
       source, notes
     )
     VALUES ($1, $2, $3, $4, 'landing', $5)
     RETURNING *`,
    [fullName, businessName, phoneNumber, employeesRange, notes]
  );

  return result.rows[0];
}

async function listDemoEnquiries(_companyIdIgnored, { page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM demo_enquiries`
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const result = await pool.query(
    `SELECT id, full_name, business_name, phone_number, employees_range, source, notes, created_at
     FROM demo_enquiries
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limitNum, offset]
  );

  return {
    data: result.rows,
    page: pageNum,
    limit: limitNum,
    total,
  };
}

module.exports = { createDemoEnquiry, listDemoEnquiries };

