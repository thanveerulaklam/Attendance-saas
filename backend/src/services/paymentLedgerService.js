const { pool } = require('../config/database');

function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isPaidStatus(status) {
  return String(status || '').toLowerCase() === 'paid';
}

/**
 * Insert or update a ledger row for a company payment.
 * Unique per (company_id, payment_type, payment_date).
 */
async function upsertPaymentEntry({
  companyId,
  paymentType,
  amount,
  paymentDate,
  planCode = null,
  paymentStatus = 'paid',
  source = 'admin',
  notes = null,
}) {
  const company_id = Number(companyId);
  if (!Number.isInteger(company_id) || company_id <= 0) return null;
  if (!['onetime', 'amc'].includes(paymentType)) return null;

  const dateOnly = toDateOnly(paymentDate);
  if (!dateOnly) return null;

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;

  const result = await pool.query(
    `INSERT INTO company_payment_ledger (
       company_id, payment_type, amount, payment_date, plan_code, payment_status, source, notes
     )
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
     ON CONFLICT (company_id, payment_type, payment_date)
     DO UPDATE SET
       amount = EXCLUDED.amount,
       plan_code = COALESCE(EXCLUDED.plan_code, company_payment_ledger.plan_code),
       payment_status = EXCLUDED.payment_status,
       source = EXCLUDED.source,
       notes = COALESCE(EXCLUDED.notes, company_payment_ledger.notes)
     RETURNING id, company_id, payment_type, amount, payment_date, plan_code, payment_status, source, created_at`,
    [
      company_id,
      paymentType,
      numericAmount,
      dateOnly,
      planCode || null,
      paymentStatus || 'paid',
      source || 'admin',
      notes,
    ]
  );

  return result.rows[0] || null;
}

/**
 * Record ledger rows after billing fields change on a company.
 */
async function recordPaymentsFromBillingChange(before, after, source = 'admin_billing') {
  if (!after?.id) return [];

  const entries = [];
  const planCode = after.plan_code || before?.plan_code || null;

  const onetimePaid =
    isPaidStatus(after.onetime_payment_status) || after.onetime_fee_paid === true;
  const onetimeDate = toDateOnly(after.last_onetime_payment_date);
  const onetimeAmount = Number(
    after.onetime_fee_amount != null ? after.onetime_fee_amount : before?.onetime_fee_amount || 0
  );
  if (onetimePaid && onetimeDate && onetimeAmount > 0) {
    const row = await upsertPaymentEntry({
      companyId: after.id,
      paymentType: 'onetime',
      amount: onetimeAmount,
      paymentDate: onetimeDate,
      planCode,
      paymentStatus: after.onetime_payment_status || 'paid',
      source,
    });
    if (row) entries.push(row);
  }

  const amcPaid = isPaidStatus(after.amc_payment_status);
  const amcDate = toDateOnly(after.last_amc_payment_date);
  const amcAmount = Number(after.amc_amount != null ? after.amc_amount : before?.amc_amount || 0);
  if (amcPaid && amcDate && amcAmount > 0) {
    const row = await upsertPaymentEntry({
      companyId: after.id,
      paymentType: 'amc',
      amount: amcAmount,
      paymentDate: amcDate,
      planCode,
      paymentStatus: after.amc_payment_status || 'paid',
      source,
    });
    if (row) entries.push(row);
  }

  return entries;
}

module.exports = {
  upsertPaymentEntry,
  recordPaymentsFromBillingChange,
  toDateOnly,
};
