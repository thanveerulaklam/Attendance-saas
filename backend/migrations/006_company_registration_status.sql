-- Company registration requires approval (pending until you approve after payment)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

UPDATE companies SET status = 'active' WHERE status IS NULL OR status = '';

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_status_check CHECK (status IN ('pending', 'active'));
