const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { normalizeWhatsAppNumber } = require('../utils/whatsappPhone');
const { normalizeWhatsappSendTime } = require('../utils/whatsappSendTime');
const { resolveLocaleFromCountryCode } = require('../config/region');
const {
  clearShiftRotationFlagCache,
  backfillInitialAssignments,
} = require('./shiftRotationPolicyService');

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

/** Align timezone/currency with country_code when legacy rows still use India defaults. */
function normalizeCompanyLocale(row) {
  if (!row) return row;
  const code = String(row.country_code || 'IN').toUpperCase();
  const locale = resolveLocaleFromCountryCode(code);
  const normalized = { ...row };
  if (locale.timezone && normalized.timezone !== locale.timezone) {
    normalized.timezone = locale.timezone;
  }
  if (code === 'AE' && (normalized.currency == null || normalized.currency === 'INR')) {
    normalized.currency = locale.currency || 'AED';
  }
  return normalized;
}

async function isFlexibleHoursMode(companyId) {
  const result = await pool.query(
    `SELECT flexible_hours_mode FROM companies WHERE id = $1`,
    [companyId]
  );
  return result.rows[0]?.flexible_hours_mode === true;
}

/** UAE WPS columns (migration 074) — loaded separately so older DBs still work. */
async function attachWpsCompanyFields(companyId, company) {
  if (!company) return company;
  try {
    const wps = await pool.query(
      `SELECT mol_establishment_id, bank_routing_code FROM companies WHERE id = $1`,
      [companyId]
    );
    if (wps.rows[0]) {
      company.mol_establishment_id = wps.rows[0].mol_establishment_id;
      company.bank_routing_code = wps.rows[0].bank_routing_code;
    }
  } catch (err) {
    if (err.code !== '42703') throw err;
    company.mol_establishment_id = null;
    company.bank_routing_code = null;
  }
  return company;
}

async function getCompanyLocale(companyId) {
  try {
    const result = await pool.query(
      `SELECT country_code, timezone, currency FROM companies WHERE id = $1`,
      [companyId]
    );
    return normalizeCompanyLocale(result.rows[0] || null);
  } catch (err) {
    if (err.code === '42703') {
      return { country_code: 'IN', timezone: 'Asia/Kolkata', currency: 'INR' };
    }
    throw err;
  }
}

async function getCompanyById(companyId) {
  const result = await pool.query(
    `SELECT c.*,
       (
         SELECT COUNT(*)::int
         FROM employees e
         WHERE e.company_id = c.id AND e.status = 'active'
       ) AS active_staff_count
     FROM companies c
     WHERE c.id = $1`,
    [companyId]
  );

  const company = normalizeCompanyLocale(result.rows[0] || null);
  return attachWpsCompanyFields(companyId, company);
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
  const allowedFields = [
    'name',
    'phone',
    'address',
    'paid_leave_forfeit_if_absence_gt',
    'whatsapp_auto_enabled',
    'whatsapp_primary_number',
    'whatsapp_secondary_number',
    'whatsapp_send_time',
    'enable_shift_rotation',
    'flexible_hours_mode',
    'mol_establishment_id',
    'bank_routing_code',
  ];
  const raw = data || {};
  const normalized = { ...raw };

  if (Object.prototype.hasOwnProperty.call(normalized, 'whatsapp_auto_enabled')) {
    normalized.whatsapp_auto_enabled = Boolean(normalized.whatsapp_auto_enabled);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'whatsapp_primary_number')) {
    const v = normalized.whatsapp_primary_number;
    normalized.whatsapp_primary_number =
      v === '' || v == null ? null : normalizeWhatsAppNumber(v) || null;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'whatsapp_secondary_number')) {
    const v = normalized.whatsapp_secondary_number;
    normalized.whatsapp_secondary_number =
      v === '' || v == null ? null : normalizeWhatsAppNumber(v) || null;
  }
  if (
    Object.prototype.hasOwnProperty.call(normalized, 'whatsapp_send_time') &&
    normalized.whatsapp_send_time !== undefined
  ) {
    try {
      normalized.whatsapp_send_time = normalizeWhatsappSendTime(normalized.whatsapp_send_time);
    } catch (err) {
      throw new AppError(err.message, 400);
    }
  }

  if (normalized.whatsapp_auto_enabled === true) {
    const existing = await getCompanyById(companyId);
    const primary =
      normalized.whatsapp_primary_number ??
      (existing?.whatsapp_primary_number
        ? normalizeWhatsAppNumber(existing.whatsapp_primary_number)
        : null) ??
      normalizeWhatsAppNumber(existing?.phone);
    const secondary =
      normalized.whatsapp_secondary_number ??
      (existing?.whatsapp_secondary_number
        ? normalizeWhatsAppNumber(existing.whatsapp_secondary_number)
        : null);
    if (!primary && !secondary) {
      throw new AppError(
        'Add a WhatsApp number (primary or company phone) before enabling auto-send',
        400
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'enable_shift_rotation')) {
    normalized.enable_shift_rotation = Boolean(normalized.enable_shift_rotation);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'flexible_hours_mode')) {
    normalized.flexible_hours_mode = Boolean(normalized.flexible_hours_mode);
  }

  const existingForPolicy = await getCompanyById(companyId);

  const enablingFlexible =
    Object.prototype.hasOwnProperty.call(normalized, 'flexible_hours_mode') &&
    normalized.flexible_hours_mode === true;
  const enablingRotation =
    Object.prototype.hasOwnProperty.call(normalized, 'enable_shift_rotation') &&
    normalized.enable_shift_rotation === true;

  if (enablingFlexible && existingForPolicy?.enable_shift_rotation === true) {
    throw new AppError(
      'Turn off factory shift rotation before enabling flexible hours mode',
      400
    );
  }
  if (enablingRotation && existingForPolicy?.flexible_hours_mode === true) {
    throw new AppError(
      'Turn off flexible hours mode before enabling factory shift rotation',
      400
    );
  }

  if (enablingFlexible) {
    normalized.enable_shift_rotation = false;
    await pool.query(
      `UPDATE companies SET hours_based_shifts_only = TRUE WHERE id = $1`,
      [companyId]
    );
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'paid_leave_forfeit_if_absence_gt')) {
    const v = normalized.paid_leave_forfeit_if_absence_gt;
    if (v === '' || v === null || typeof v === 'undefined') {
      normalized.paid_leave_forfeit_if_absence_gt = null;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 31) {
        throw new AppError('paid_leave_forfeit_if_absence_gt must be between 0 and 31, or empty', 400);
      }
      normalized.paid_leave_forfeit_if_absence_gt = Math.round(n);
    }
  }

  const entries = Object.entries(normalized).filter(
    ([key, value]) => allowedFields.includes(key) && typeof value !== 'undefined'
  );

  if (entries.length === 0) {
    return getCompanyById(companyId);
  }

  if (enablingRotation) {
    await backfillInitialAssignments(companyId);
  }

  const fields = [];
  const values = [companyId];
  let paramIndex = 2;

  for (const [key, value] of entries) {
    fields.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex += 1;
  }

  const runUpdate = (fieldList, vals) =>
    pool.query(
      `UPDATE companies
       SET ${fieldList.join(', ')}
       WHERE id = $1
       RETURNING *`,
      vals
    );

  let result;
  try {
    result = await runUpdate(fields, values);
  } catch (err) {
    const wpsKeys = new Set(['mol_establishment_id', 'bank_routing_code']);
    const hasWpsField = entries.some(([key]) => wpsKeys.has(key));
    if (err.code !== '42703' || !hasWpsField) throw err;
    const safeEntries = entries.filter(([key]) => !wpsKeys.has(key));
    if (safeEntries.length === 0) throw err;
    const safeFields = [];
    const safeValues = [companyId];
    let safeIndex = 2;
    for (const [key, value] of safeEntries) {
      safeFields.push(`${key} = $${safeIndex}`);
      safeValues.push(value);
      safeIndex += 1;
    }
    result = await runUpdate(safeFields, safeValues);
  }

  clearShiftRotationFlagCache(companyId);

  const row = result.rows[0] || null;
  if (!row) return null;
  return attachWpsCompanyFields(companyId, normalizeCompanyLocale(row));
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
     RETURNING *`,
    values
  );

  const row = result.rows[0] || null;
  if (!row) return null;
  return attachWpsCompanyFields(companyId, normalizeCompanyLocale(row));
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
     RETURNING *`,
    values
  );

  const row = result.rows[0] || null;
  if (!row) return null;
  return attachWpsCompanyFields(companyId, normalizeCompanyLocale(row));
}

async function getCompanyTimezone(companyId) {
  try {
    const result = await pool.query(
      `SELECT timezone, country_code, currency FROM companies WHERE id = $1`,
      [companyId]
    );
    return normalizeCompanyLocale(result.rows[0] || null)?.timezone || 'Asia/Kolkata';
  } catch (err) {
    if (err.code === '42703') return 'Asia/Kolkata';
    throw err;
  }
}

async function getCompanyCountryCode(companyId) {
  try {
    const result = await pool.query(
      `SELECT country_code FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rowCount === 0) {
      throw new AppError('Company not found', 404);
    }
    return result.rows[0]?.country_code || 'IN';
  } catch (err) {
    if (err.code === '42703') return 'IN';
    throw err;
  }
}

module.exports = {
  getCompanyById,
  getCompanyLocale,
  getCompanyTimezone,
  getCompanyCountryCode,
  getSubscriptionStatus,
  isSubscriptionAllowed,
  isFlexibleHoursMode,
  updateCompany,
  updateSubscription,
  updateBillingMetadata,
  computeNextAmcDueDate,
  branchesAllowedTotal,
};

