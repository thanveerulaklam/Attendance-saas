CREATE TABLE IF NOT EXISTS employee_advance_loans (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL
    REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL
    REFERENCES employees(id) ON DELETE CASCADE,
  loan_amount NUMERIC(12,2) NOT NULL
    CHECK (loan_amount > 0),
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NULL,
  total_installments INTEGER NOT NULL DEFAULT 1
    CHECK (total_installments > 0),
  monthly_installment NUMERIC(12,2) NOT NULL
    CHECK (monthly_installment > 0),
  total_repaid NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (total_repaid >= 0),
  outstanding_balance NUMERIC(12,2) NOT NULL
    CHECK (outstanding_balance >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cleared', 'waived', 'on_hold')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_loans_company_id
  ON employee_advance_loans(company_id);

CREATE INDEX IF NOT EXISTS idx_advance_loans_employee_id
  ON employee_advance_loans(company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_advance_loans_status
  ON employee_advance_loans(company_id, status);

CREATE TABLE IF NOT EXISTS employee_advance_repayments (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL
    REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL
    REFERENCES employees(id) ON DELETE CASCADE,
  loan_id BIGINT NOT NULL
    REFERENCES employee_advance_loans(id) ON DELETE RESTRICT,
  year SMALLINT NOT NULL
    CHECK (year BETWEEN 2000 AND 2100),
  month SMALLINT NOT NULL
    CHECK (month BETWEEN 1 AND 12),
  repayment_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (repayment_amount >= 0),
  suggested_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_overridden BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'deducted', 'skipped')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (loan_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_advance_repayments_company_year_month
  ON employee_advance_repayments(company_id, year, month);

CREATE INDEX IF NOT EXISTS idx_advance_repayments_loan_id
  ON employee_advance_repayments(loan_id);
