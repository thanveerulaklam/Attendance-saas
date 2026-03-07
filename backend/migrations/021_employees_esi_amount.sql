-- Monthly ESI (Employees' State Insurance) deduction amount. Deducted every month from salary.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS esi_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.esi_amount IS 'Monthly ESI deduction amount; deducted from salary each month.';
