-- One-time fee + AMC amounts; default payment_status unpaid for new companies.

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_payment_status_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_payment_status_check
  CHECK (payment_status IN ('trial', 'paid', 'pending', 'overdue', 'unpaid'));

ALTER TABLE companies ALTER COLUMN payment_status SET DEFAULT 'unpaid';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS onetime_fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onetime_fee_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS amc_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS last_amc_payment_date DATE;

COMMENT ON COLUMN companies.onetime_fee_paid IS 'Whether the one-time registration/setup fee has been received.';
COMMENT ON COLUMN companies.onetime_fee_amount IS 'Expected or agreed one-time fee amount (optional).';
COMMENT ON COLUMN companies.amc_amount IS 'Annual maintenance contract amount for the next AMC cycle.';
COMMENT ON COLUMN companies.last_amc_payment_date IS 'Date AMC was last paid; next AMC due is +1 year from this date.';
