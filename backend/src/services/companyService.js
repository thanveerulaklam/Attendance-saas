const { pool } = require('../config/database');

/**
 * Next AMC due date:
 * - After an AMC payment: 1 year from last AMC (annual renewal).
 * - Before any AMC: 1 year from one-time fee payment (first year covered by one-time; AMC starts after).
 * - Fallback: 1 year from access start if one-time date not recorded.
 */
function addOneYearIso(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function computeNextAmcDueDate(company) {
  if (!company) return null;
  if (company.last_amc_payment_date) {
    return addOneYearIso(company.last_amc_payment_date);
  }
  if (company.last_onetime_payment_date) {
    return addOneYearIso(company.last_onetime_payment_date);
  }
  if (company.subscription_start_date) {
    return addOneYearIso(company.subscription_start_date);
  }
  return null;
}

function branchesAllowedTotal(company) {
  if (!company || company.branch_limit_override == null) return null;
  return 1 + Math.max(0, Number(company.branch_limit_override || 0));
}

const COMPANY_SELECT = `id, name, email, phone, address, onboarding_completed_at,
  subscription_start_date, subscription_end_date, is_active, plan_code, billing_cycle,
  next_billing_date, last_payment_date, payment_status, billing_notes,
  employee_limit_override, branch_limit_override,
  onetime_fee_paid, onetime_fee_amount, amc_amount, last_amc_payment_date,
  onetime_payment_status, amc_payment_status, last_onetime_payment_date,
  created_at`;

async function getCompanyById(companyId) {
  const result = await pool.query(
    `SELECT
       c.${COMPANY_SELECT.replace(/,\s*/g, ', c.')}
       ,
       (
         SELECT COUNT(*)::int
         FROM employees e
         WHERE e.company_id = c.id AND e.status = 'active'
       ) AS active_staff_count
     FROM companies c
     WHERE c.id = $1`,
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

async function updateBillingMetadata(companyId, data) {
  const allowedFields = [
    'plan_code',
    'billing_cycle',
    'next_billing_date',
    'last_payment_date',
    'payment_status',
    'onetime_payment_status',
    'amc_payment_status',
    'billing_notes',
    'onetime_fee_paid',
    'onetime_fee_amount',
    'amc_amount',
    'last_amc_payment_date',
    'last_onetime_payment_date',
    // convenience: allow subscription fields to be adjusted from the same admin form
    'subscription_start_date',
    'subscription_end_date',
    'is_active',
  ];

  const rawEntries = Object.entries(data || {});

  // Normalise empty strings for DATE fields to null so Postgres accepts them
  const dateFields = new Set([
    'next_billing_date',
    'last_payment_date',
    'subscription_start_date',
    'subscription_end_date',
    'last_amc_payment_date',
    'last_onetime_payment_date',
  ]);

  const entries = rawEntries
    .map(([key, value]) => {
      if (dateFields.has(key) && value === '') {
        return [key, null];
      }
      return [key, value];
    })
    .filter(([key, value]) => allowedFields.includes(key) && typeof value !== 'undefined');

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
  updateBillingMetadata,
  computeNextAmcDueDate,
  branchesAllowedTotal,
};

