const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

const DEMO_ENQUIRY_STATUSES = ['not_contacted', 'contacted', 'demo_given', 'sold', 'lost'];

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

async function listDemoEnquiries(_companyIdIgnored, { page = 1, limit = 20, status = null } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const normalizedStatus =
    typeof status === 'string' && status.trim() && status.trim() !== 'all'
      ? status.trim().toLowerCase()
      : null;
  if (normalizedStatus && !DEMO_ENQUIRY_STATUSES.includes(normalizedStatus)) {
    throw new AppError(`status must be one of: ${DEMO_ENQUIRY_STATUSES.join(', ')}`, 400);
  }

  const whereClause = normalizedStatus ? 'WHERE status = $1' : '';
  const countParams = normalizedStatus ? [normalizedStatus] : [];
  const listParams = normalizedStatus ? [normalizedStatus, limitNum, offset] : [limitNum, offset];
  const listLimitOffset = normalizedStatus ? 'LIMIT $2 OFFSET $3' : 'LIMIT $1 OFFSET $2';

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM demo_enquiries ${whereClause}`,
    countParams
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const result = await pool.query(
    `SELECT id, full_name, business_name, phone_number, employees_range, source, notes,
            status, status_updated_at, created_at
     FROM demo_enquiries
     ${whereClause}
     ORDER BY created_at DESC
     ${listLimitOffset}`,
    listParams
  );

  return {
    data: result.rows,
    page: pageNum,
    limit: limitNum,
    total,
  };
}

async function updateDemoEnquiryStatus(enquiryId, status) {
  const id = Number(enquiryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('enquiry_id (number) is required', 400);
  }

  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!DEMO_ENQUIRY_STATUSES.includes(normalizedStatus)) {
    throw new AppError(`status must be one of: ${DEMO_ENQUIRY_STATUSES.join(', ')}`, 400);
  }

  const result = await pool.query(
    `UPDATE demo_enquiries
     SET status = $2,
         status_updated_at = NOW()
     WHERE id = $1
     RETURNING id, full_name, business_name, phone_number, employees_range, source, notes,
               status, status_updated_at, created_at`,
    [id, normalizedStatus]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return result.rows[0];
}

module.exports = {
  createDemoEnquiry,
  listDemoEnquiries,
  updateDemoEnquiryStatus,
  DEMO_ENQUIRY_STATUSES,
};

