-- Company-specific holidays (public holidays, company holidays, weekly offs)

CREATE TABLE IF NOT EXISTS company_holidays (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    name         VARCHAR(255),
    kind         VARCHAR(50) NOT NULL DEFAULT 'public',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT company_holidays_kind_check CHECK (kind IN ('public', 'company', 'weekly_off')),
    CONSTRAINT company_holidays_company_date_unique UNIQUE (company_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_company_holidays_company_date
    ON company_holidays (company_id, holiday_date);

