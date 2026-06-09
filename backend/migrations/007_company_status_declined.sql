-- Allow 'declined' status for rejected registrations

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;

-- Skip if locked rows exist; migration 023 adds the full constraint set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE status NOT IN ('pending', 'active', 'declined')) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_status_check CHECK (status IN ('pending', 'active', 'declined'));
  END IF;
END $$;
