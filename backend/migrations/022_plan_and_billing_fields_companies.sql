-- Plan and manual billing metadata for companies

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS plan_code VARCHAR(32) NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS next_billing_date DATE,
  ADD COLUMN IF NOT EXISTS last_payment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(16) NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- Existing DBs may have payment_status outside this set (e.g. unpaid from a later migration replay,
-- legacy casing, or manual edits). Normalize before CHECK or ADD CONSTRAINT fails (23514).
UPDATE companies
SET payment_status = 'paid'
WHERE payment_status IS NULL
   OR TRIM(payment_status) = ''
   OR LOWER(TRIM(payment_status)) NOT IN ('trial', 'paid', 'pending', 'overdue');

UPDATE companies
SET billing_cycle = 'monthly'
WHERE billing_cycle IS NULL
   OR TRIM(billing_cycle) = ''
   OR LOWER(TRIM(billing_cycle)) NOT IN ('monthly', 'annual');

-- Constrain enums where reasonable (Postgres CHECK instead of full enum type for flexibility)
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_billing_cycle_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_billing_cycle_check
  CHECK (billing_cycle IN ('monthly', 'annual'));

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_payment_status_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_payment_status_check
  CHECK (payment_status IN ('trial', 'paid', 'pending', 'overdue'));

