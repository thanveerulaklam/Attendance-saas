-- Fixed monthly other allowances added to gross salary in payroll.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS other_allowance NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.other_allowance IS 'Fixed monthly other allowances added to gross salary when payroll is calculated.';
