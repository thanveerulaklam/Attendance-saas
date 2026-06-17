-- Employee salary disbursement ledger (partial/full payments against payroll records).

CREATE TABLE IF NOT EXISTS employee_salary_payments (
    id                      BIGSERIAL PRIMARY KEY,
    company_id              BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id             BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payroll_record_id       BIGINT REFERENCES payroll_records(id) ON DELETE CASCADE,
    weekly_payroll_record_id BIGINT REFERENCES weekly_payroll_records(id) ON DELETE CASCADE,
    amount                  NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_date            DATE NOT NULL,
    payment_mode            VARCHAR(24) NOT NULL,
    reference_number        VARCHAR(128),
    notes                   TEXT,
    created_by              BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT employee_salary_payments_payroll_link_check
        CHECK (num_nonnulls(payroll_record_id, weekly_payroll_record_id) = 1),
    CONSTRAINT employee_salary_payments_payment_mode_check
        CHECK (payment_mode IN ('cash', 'bank_transfer', 'upi', 'cheque', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_employee_salary_payments_company_date
    ON employee_salary_payments (company_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_salary_payments_employee_date
    ON employee_salary_payments (employee_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_salary_payments_payroll_record
    ON employee_salary_payments (payroll_record_id)
    WHERE payroll_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_salary_payments_weekly_payroll_record
    ON employee_salary_payments (weekly_payroll_record_id)
    WHERE weekly_payroll_record_id IS NOT NULL;

COMMENT ON TABLE employee_salary_payments IS 'Salary disbursement history per employee payroll period (supports partial payments).';
