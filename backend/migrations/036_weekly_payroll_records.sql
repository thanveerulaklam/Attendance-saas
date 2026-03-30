-- Weekly payroll records (Sun–Sat)
CREATE TABLE IF NOT EXISTS weekly_payroll_records (
  id BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,

  week_start_date DATE NOT NULL,
  week_end_date   DATE NOT NULL,

  total_days      NUMERIC(5,2) NOT NULL DEFAULT 0,
  present_days    NUMERIC(5,2) NOT NULL DEFAULT 0,
  overtime_hours  NUMERIC(8,2) NOT NULL DEFAULT 0,

  gross_salary    NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  salary_advance  NUMERIC(12,2) NOT NULL DEFAULT 0,
  no_leave_incentive NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT weekly_payroll_records_unique UNIQUE (company_id, employee_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_payroll_records_company_week
  ON weekly_payroll_records (company_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_weekly_payroll_records_employee
  ON weekly_payroll_records (company_id, employee_id, week_start_date);

