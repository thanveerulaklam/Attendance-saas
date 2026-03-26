-- Backfill existing companies into annual subscription model.
-- Safe-by-default:
-- - Never overwrites already-set subscription_start_date/subscription_end_date.
-- - Converts monthly/null billing_cycle to annual.
-- - Fills next_billing_date only when missing.

-- 1) Ensure subscription start date exists.
UPDATE companies
SET subscription_start_date = COALESCE(created_at::date, NOW()::date)
WHERE subscription_start_date IS NULL;

-- 2) Ensure subscription end date exists (1 year from start).
UPDATE companies
SET subscription_end_date = (subscription_start_date + INTERVAL '1 year')::date
WHERE subscription_end_date IS NULL;

-- 3) Enforce annual billing model for legacy rows.
UPDATE companies
SET billing_cycle = 'annual'
WHERE billing_cycle IS NULL OR LOWER(billing_cycle) = 'monthly';

-- 4) Align next billing date with "valid till" date when missing.
UPDATE companies
SET next_billing_date = subscription_end_date
WHERE next_billing_date IS NULL;

