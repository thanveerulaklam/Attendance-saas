-- Superadmin-controlled branch cap per company.
-- NULL means no explicit cap (unlimited unless business rule changes later).

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS branch_limit_override INTEGER;

COMMENT ON COLUMN companies.branch_limit_override IS
  'If set, caps number of branches this company can create. NULL means no explicit branch cap.';
