-- ESI/PF deduction mode: fixed monthly amount or percentage of wages.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS esi_mode TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS esi_percent NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS pf_mode TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS pf_percent NUMERIC(6,3);

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_esi_mode_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_esi_mode_check CHECK (esi_mode IN ('fixed', 'percentage'));

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_pf_mode_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_pf_mode_check CHECK (pf_mode IN ('fixed', 'percentage'));

COMMENT ON COLUMN employees.esi_mode IS 'ESI deduction: fixed monthly amount or percentage of gross wages.';
COMMENT ON COLUMN employees.esi_percent IS 'Employee ESI rate (%) when esi_mode is percentage, e.g. 0.75.';
COMMENT ON COLUMN employees.pf_mode IS 'PF deduction: fixed monthly amount or percentage of earned basic.';
COMMENT ON COLUMN employees.pf_percent IS 'Employee PF rate (%) when pf_mode is percentage, e.g. 12.';
