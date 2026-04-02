-- Employee salary type:
-- - monthly: employees.basic_salary is the monthly amount
-- - per_day: employees.basic_salary is the daily amount (used for monthly/weekly payroll)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salary_type VARCHAR(20) NOT NULL DEFAULT 'monthly';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_salary_type_check'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_salary_type_check
      CHECK (salary_type IN ('monthly', 'per_day'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_salary_type
  ON employees (company_id, salary_type);

