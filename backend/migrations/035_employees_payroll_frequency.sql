-- Employee payroll frequency configuration: monthly or weekly
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS payroll_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly';

-- Ensure only allowed values are stored
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_payroll_frequency_check'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_payroll_frequency_check
      CHECK (payroll_frequency IN ('monthly', 'weekly'));
  END IF;
END $$;

-- Helpful index for mixed-frequency companies
CREATE INDEX IF NOT EXISTS idx_employees_payroll_frequency
  ON employees (company_id, payroll_frequency);

