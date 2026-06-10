const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

const DEMO_ENQUIRY_STATUSES = [
  'not_contacted',
  'contacted',
  'demo_given',
  'sold',
  'lost',
  'converted',
];

const LEAD_SOURCES = [
  'landing',
  'manual',
  'referral',
  'cold_call',
  'whatsapp',
  'email',
  'event',
  'other',
];

const ENQUIRY_LIST_COLUMNS = `de.id, de.full_name, de.business_name, de.phone_number, de.email,
  de.employees_range, de.source, de.expected_plan, de.notes,
  de.status, de.status_updated_at, de.created_at,
  de.converted_company_id, de.converted_at,
  c.name AS converted_company_name`;

function normText(v) {
  if (v == null) return '';
  return String(v).trim();
}

function enquirySelectFrom() {
  return `FROM demo_enquiries de
          LEFT JOIN companies c ON c.id = de.converted_company_id`;
}

async function createDemoEnquiry(companyIdIgnored, data) {
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

async function createAdminLead(data) {
  const fullName = normText(data.full_name);
  const businessName = normText(data.business_name);
  const phoneNumber = normText(data.phone_number);
  const email = normText(data.email) || null;
  const employeesRange = normText(data.employees_range) || 'Not specified';
  const notes = data.notes ? normText(data.notes) : null;
  const sourceRaw = normText(data.source).toLowerCase() || 'manual';
  const source = LEAD_SOURCES.includes(sourceRaw) ? sourceRaw : 'manual';
  const expectedPlan =
    typeof data.expected_plan === 'string' && data.expected_plan.trim()
      ? data.expected_plan.trim().toLowerCase()
      : null;
  const statusRaw = normText(data.status).toLowerCase() || 'not_contacted';
  const status = DEMO_ENQUIRY_STATUSES.includes(statusRaw) && statusRaw !== 'converted'
    ? statusRaw
    : 'not_contacted';

  if (!fullName) throw new AppError('Contact name is required', 400);
  if (!businessName) throw new AppError('Business name is required', 400);
  if (!phoneNumber) throw new AppError('Phone number is required', 400);

  const result = await pool.query(
    `INSERT INTO demo_enquiries (
       full_name, business_name, phone_number, email, employees_range,
       source, expected_plan, notes, status, status_updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING *`,
    [fullName, businessName, phoneNumber, email, employeesRange, source, expectedPlan, notes, status]
  );

  return getDemoEnquiryById(result.rows[0].id);
}

async function getDemoEnquiryById(enquiryId) {
  const id = Number(enquiryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('enquiry_id (number) is required', 400);
  }

  const result = await pool.query(
    `SELECT ${ENQUIRY_LIST_COLUMNS}
     ${enquirySelectFrom()}
     WHERE de.id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return result.rows[0];
}

async function listDemoEnquiries(
  _companyIdIgnored,
  { page = 1, limit = 20, status = null, q = null, pipeline = null } = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  const normalizedStatus =
    typeof status === 'string' && status.trim() && status.trim() !== 'all'
      ? status.trim().toLowerCase()
      : null;
  if (normalizedStatus) {
    if (!DEMO_ENQUIRY_STATUSES.includes(normalizedStatus)) {
      throw new AppError(`status must be one of: ${DEMO_ENQUIRY_STATUSES.join(', ')}`, 400);
    }
    conditions.push(`de.status = $${paramIndex}`);
    params.push(normalizedStatus);
    paramIndex += 1;
  }

  if (pipeline === 'open') {
    conditions.push(`de.status NOT IN ('lost', 'converted')`);
  }

  const search = typeof q === 'string' ? q.trim() : '';
  if (search) {
    conditions.push(
      `(de.full_name ILIKE $${paramIndex}
        OR de.business_name ILIKE $${paramIndex}
        OR de.phone_number ILIKE $${paramIndex}
        OR COALESCE(de.email, '') ILIKE $${paramIndex}
        OR COALESCE(de.notes, '') ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM demo_enquiries de ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const listParams = [...params, limitNum, offset];
  const result = await pool.query(
    `SELECT ${ENQUIRY_LIST_COLUMNS}
     ${enquirySelectFrom()}
     ${whereClause}
     ORDER BY de.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    listParams
  );

  return {
    data: result.rows,
    page: pageNum,
    limit: limitNum,
    total,
  };
}

async function getDemoEnquiryStats() {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM demo_enquiries
     GROUP BY status`
  );

  const byStatus = {};
  for (const status of DEMO_ENQUIRY_STATUSES) {
    byStatus[status] = 0;
  }
  let total = 0;
  for (const row of result.rows) {
    byStatus[row.status] = Number(row.count || 0);
    total += Number(row.count || 0);
  }

  const open =
    byStatus.not_contacted +
    byStatus.contacted +
    byStatus.demo_given +
    byStatus.sold;

  return {
    total,
    open,
    by_status: byStatus,
    in_progress: byStatus.contacted + byStatus.demo_given,
    hot: byStatus.sold,
    converted: byStatus.converted,
    lost: byStatus.lost,
  };
}

async function updateDemoEnquiryStatus(enquiryId, status) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  if (enquiry.converted_company_id) {
    throw new AppError('Converted leads cannot change status', 400);
  }

  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!DEMO_ENQUIRY_STATUSES.includes(normalizedStatus) || normalizedStatus === 'converted') {
    throw new AppError(`status must be one of: ${DEMO_ENQUIRY_STATUSES.filter((s) => s !== 'converted').join(', ')}`, 400);
  }

  const result = await pool.query(
    `UPDATE demo_enquiries
     SET status = $2,
         status_updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [enquiry.id, normalizedStatus]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return getDemoEnquiryById(enquiry.id);
}

async function updateDemoEnquiryNotes(enquiryId, notes) {
  const id = Number(enquiryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('enquiry_id (number) is required', 400);
  }

  const normalizedNotes = notes == null || notes === '' ? null : normText(notes);

  const result = await pool.query(
    `UPDATE demo_enquiries
     SET notes = $2
     WHERE id = $1
     RETURNING id`,
    [id, normalizedNotes]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return getDemoEnquiryById(id);
}

async function convertEnquiryToCompany(enquiryId, companyPayload) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  if (enquiry.converted_company_id) {
    throw new AppError('This lead is already converted to a company', 400);
  }
  if (enquiry.status === 'lost') {
    throw new AppError('Cannot convert a lost lead. Change status first.', 400);
  }

  const authService = require('./authService');
  const { recordPaymentsFromBillingChange } = require('./paymentLedgerService');

  const provisioned = await authService.createCompanyProvisionedBySuperadmin(companyPayload);

  const updateResult = await pool.query(
    `UPDATE demo_enquiries
     SET status = 'converted',
         converted_company_id = $2,
         converted_at = NOW(),
         status_updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [enquiry.id, provisioned.company.id]
  );

  if (updateResult.rowCount === 0) {
    throw new AppError('Failed to link lead to company', 500);
  }

  const companyFull = await pool.query(
    `SELECT id, plan_code, onetime_fee_amount, amc_amount, onetime_payment_status, amc_payment_status,
            onetime_fee_paid, last_onetime_payment_date, last_amc_payment_date
     FROM companies WHERE id = $1`,
    [provisioned.company.id]
  );
  if (companyFull.rows[0]) {
    await recordPaymentsFromBillingChange(null, companyFull.rows[0], 'lead_conversion');
  }

  const updatedEnquiry = await getDemoEnquiryById(enquiry.id);

  return {
    enquiry: updatedEnquiry,
    company: provisioned.company,
    user: provisioned.user,
    admin_password_plaintext_once: provisioned.admin_password_plaintext_once,
  };
}

module.exports = {
  createDemoEnquiry,
  createAdminLead,
  getDemoEnquiryById,
  listDemoEnquiries,
  getDemoEnquiryStats,
  updateDemoEnquiryStatus,
  updateDemoEnquiryNotes,
  convertEnquiryToCompany,
  DEMO_ENQUIRY_STATUSES,
  LEAD_SOURCES,
};
