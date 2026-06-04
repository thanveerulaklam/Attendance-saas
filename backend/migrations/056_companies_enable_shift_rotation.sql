-- Factory-only: dated shift assignments and rotation groups (opt-in per company).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS enable_shift_rotation BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN companies.enable_shift_rotation IS
  'When true, employees use dated shift assignments and rotation tools; default false for non-factory tenants.';
