-- Recurring weekly off days (e.g. every Sunday) — paid holidays without loss of pay.
-- day_of_week: 0 = Sunday, 1 = Monday, ... 6 = Saturday.

CREATE TABLE IF NOT EXISTS company_weekly_offs (
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    day_of_week  SMALLINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, day_of_week),
    CONSTRAINT company_weekly_offs_day_check CHECK (day_of_week >= 0 AND day_of_week <= 6)
);

CREATE INDEX IF NOT EXISTS idx_company_weekly_offs_company_id
    ON company_weekly_offs (company_id);
