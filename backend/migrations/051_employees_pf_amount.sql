-- Optional employee PF amount deducted in payroll each month.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pf_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.pf_amount IS 'Optional Provident Fund amount deducted from salary each month.';
