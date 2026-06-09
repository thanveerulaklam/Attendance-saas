-- Company registration requires approval (pending until you approve after payment)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

UPDATE companies SET status = 'active' WHERE status IS NULL OR status = '';

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;

-- Skip narrow constraint when DB already has declined/locked rows (re-run safe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE status NOT IN ('pending', 'active')) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_status_check CHECK (status IN ('pending', 'active'));
  END IF;
END $$;
