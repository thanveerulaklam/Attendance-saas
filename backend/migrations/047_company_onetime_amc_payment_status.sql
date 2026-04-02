-- Separate payment status for one-time fee vs AMC; last one-time payment date.

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_onetime_payment_status_check;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_amc_payment_status_check;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onetime_payment_status VARCHAR(16) NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS amc_payment_status VARCHAR(16) NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS last_onetime_payment_date DATE;

ALTER TABLE companies
  ADD CONSTRAINT companies_onetime_payment_status_check
  CHECK (onetime_payment_status IN ('trial', 'paid', 'pending', 'overdue', 'unpaid'));

ALTER TABLE companies
  ADD CONSTRAINT companies_amc_payment_status_check
  CHECK (amc_payment_status IN ('trial', 'paid', 'pending', 'overdue', 'unpaid'));

UPDATE companies SET
  onetime_payment_status = CASE WHEN onetime_fee_paid THEN 'paid' ELSE 'unpaid' END,
  amc_payment_status = CASE WHEN last_amc_payment_date IS NOT NULL THEN 'paid' ELSE 'unpaid' END,
  last_onetime_payment_date = CASE
    WHEN onetime_fee_paid AND last_payment_date IS NOT NULL THEN last_payment_date::date
    ELSE NULL
  END;

COMMENT ON COLUMN companies.onetime_payment_status IS 'Payment status for the one-time setup/licence fee.';
COMMENT ON COLUMN companies.amc_payment_status IS 'Payment status for annual maintenance (AMC).';
COMMENT ON COLUMN companies.last_onetime_payment_date IS 'Date the one-time fee was received.';

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON audit_logs (created_at DESC);
