-- History of basic-salary increases and decreases.
-- employees.basic_salary remains the current amount used by payroll.

CREATE TABLE IF NOT EXISTS employee_salary_increments (
    id               BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id      BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    previous_salary  NUMERIC(12, 2) NOT NULL,
    new_salary       NUMERIC(12, 2) NOT NULL,
    change_amount    NUMERIC(12, 2) NOT NULL,
    effective_date   DATE NOT NULL,
    notes            TEXT,
    source           VARCHAR(32) NOT NULL DEFAULT 'manual',
    created_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT employee_salary_increments_new_salary_check
        CHECK (new_salary > 0),
    CONSTRAINT employee_salary_increments_changed_check
        CHECK (new_salary <> previous_salary),
    CONSTRAINT employee_salary_increments_source_check
        CHECK (source IN ('manual', 'employee_form'))
);

CREATE INDEX IF NOT EXISTS idx_employee_salary_increments_employee
    ON employee_salary_increments (company_id, employee_id, effective_date DESC, created_at DESC);

COMMENT ON TABLE employee_salary_increments IS
    'Log of basic salary increases and decreases. change_amount is new_salary minus previous_salary.';
