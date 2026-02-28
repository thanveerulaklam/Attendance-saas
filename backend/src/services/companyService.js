const { pool } = require('../config/database');

const COMPANY_SELECT = `id, name, email, phone, address, onboarding_completed_at,
  subscription_start_date, subscription_end_date, is_active, created_at`;

async function getCompanyById(companyId) {
  const result = await pool.query(
    `SELECT ${COMPANY_SELECT}
     FROM companies
     WHERE id = $1`,
    [companyId]
  );

  return result.rows[0] || null;
}

/** Grace period in days after subscription_end_date before blocking. */
const GRACE_DAYS = 7;

/**
 * Get subscription status for a company.
 * @returns {{ active: boolean, expired: boolean, inGrace: boolean, endDate: string|null, graceEndsAt: Date|null, daysLeft: number|null }}
 */
function getSubscriptionStatus(company) {
  if (!company) {
    return { active: false, expired: true, inGrace: false, endDate: null, graceEndsAt: null, daysLeft: null };
  }
  if (company.is_active === false) {
    return { active: false, expired: true, inGrace: false, endDate: company.subscription_end_date, graceEndsAt: null, daysLeft: null };
  }
  const endDate = company.subscription_end_date;
  if (!endDate) {
    return { active: true, expired: false, inGrace: false, endDate: null, graceEndsAt: null, daysLeft: null };
  }
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const graceEnd = new Date(end);
  graceEnd.setDate(graceEnd.getDate() + GRACE_DAYS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today > graceEnd) {
    return { active: false, expired: true, inGrace: false, endDate: endDate, graceEndsAt: graceEnd, daysLeft: 0 };
  }
  if (today > end) {
    const daysLeft = Math.ceil((graceEnd - today) / (24 * 60 * 60 * 1000));
    return { active: false, expired: true, inGrace: true, endDate: endDate, graceEndsAt: graceEnd, daysLeft };
  }
  const daysLeft = Math.ceil((end - today) / (24 * 60 * 60 * 1000));
  return { active: true, expired: false, inGrace: false, endDate: endDate, graceEndsAt: graceEnd, daysLeft };
}

/** Returns true if the company is allowed to use critical features (payroll generate, device push). */
function isSubscriptionAllowed(company) {
  const status = getSubscriptionStatus(company);
  return status.active || status.inGrace;
}

async function updateCompany(companyId, data) {
  const allowedFields = ['name', 'phone', 'address'];
  const entries = Object.entries(data || {}).filter(
    ([key, value]) => allowedFields.includes(key) && typeof value !== 'undefined'
  );

  if (entries.length === 0) {
    return getCompanyById(companyId);
  }

  const fields = [];
  const values = [companyId];
  let paramIndex = 2;

  for (const [key, value] of entries) {
    fields.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex += 1;
  }

  const result = await pool.query(
    `UPDATE companies
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING ${COMPANY_SELECT}`,
    values
  );

  return result.rows[0] || null;
}

async function updateSubscription(companyId, data) {
  const allowedFields = ['subscription_start_date', 'subscription_end_date', 'is_active'];
  const entries = Object.entries(data || {}).filter(
    ([key, value]) => allowedFields.includes(key) && typeof value !== 'undefined'
  );

  if (entries.length === 0) {
    return getCompanyById(companyId);
  }

  const fields = [];
  const values = [companyId];
  let paramIndex = 2;

  for (const [key, value] of entries) {
    fields.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex += 1;
  }

  const result = await pool.query(
    `UPDATE companies
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING ${COMPANY_SELECT}`,
    values
  );

  return result.rows[0] || null;
}

module.exports = {
  getCompanyById,
  getSubscriptionStatus,
  isSubscriptionAllowed,
  updateCompany,
  updateSubscription,
};

