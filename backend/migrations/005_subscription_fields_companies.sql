-- Subscription and renewal (Phase 3A)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS subscription_start_date DATE,
  ADD COLUMN IF NOT EXISTS subscription_end_date DATE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
