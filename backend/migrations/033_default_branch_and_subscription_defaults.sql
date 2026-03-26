-- Defaults for multi-branch controls:
-- - Default branch_limit_override = 0 (no extra branches allowed unless superadmin increases cap).
-- - subscription timelines are handled at activation time in adminController.

ALTER TABLE companies
  ALTER COLUMN branch_limit_override SET DEFAULT 0;

UPDATE companies
  SET branch_limit_override = 0
  WHERE branch_limit_override IS NULL;

