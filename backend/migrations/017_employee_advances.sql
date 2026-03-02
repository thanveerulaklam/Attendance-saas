-- Employee salary advances per month

CREATE TABLE IF NOT EXISTS employee_advances (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year         SMALLINT NOT NULL,
    month        SMALLINT NOT NULL,
    amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT employee_advances_month_check CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT employee_advances_year_check CHECK (year BETWEEN 2000 AND 2100),
    CONSTRAINT employee_advances_company_employee_period_unique
        UNIQUE (company_id, employee_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_employee_advances_company_year_month
    ON employee_advances (company_id, year, month);

