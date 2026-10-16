-- Sri Sabari Store payroll profile. Null for every other company.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS payroll_profile VARCHAR(40) NULL;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS payroll_profile_config JSONB NULL;

COMMENT ON COLUMN companies.payroll_profile IS 'Named payroll profile. sri_sabari_v1 is store-specific. Null uses standard payroll.';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS week_off_day SMALLINT NULL;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_week_off_day_check;

ALTER TABLE employees
  ADD CONSTRAINT employees_week_off_day_check
  CHECK (week_off_day IS NULL OR (week_off_day >= 0 AND week_off_day <= 6));

COMMENT ON COLUMN employees.week_off_day IS '0=Sunday .. 6=Saturday. Used by the Sri Sabari payroll profile.';

ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS rule_breakdown JSONB NULL;

ALTER TABLE weekly_payroll_records
  ADD COLUMN IF NOT EXISTS rule_breakdown JSONB NULL;

CREATE TABLE IF NOT EXISTS payroll_carry_items (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  source VARCHAR(20) NOT NULL CHECK (source IN ('manual', 'deferred_rule')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
  origin_period VARCHAR(40),
  line_key TEXT,
  applied_payroll_kind VARCHAR(10),
  applied_payroll_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payroll_carry_items_pending
  ON payroll_carry_items (company_id, employee_id, status);
