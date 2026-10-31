-- One-date shop calendar overrides.
-- working: this holiday or weekly off is open (a normal working day).
-- holiday: this working day is a paid holiday.

CREATE TABLE IF NOT EXISTS company_day_overrides (
    id            BIGSERIAL PRIMARY KEY,
    company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    effect        VARCHAR(20) NOT NULL,
    note          VARCHAR(255),
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT company_day_overrides_effect_check
        CHECK (effect IN ('working', 'holiday')),
    CONSTRAINT company_day_overrides_unique
        UNIQUE (company_id, override_date)
);

CREATE INDEX IF NOT EXISTS idx_company_day_overrides_company_date
    ON company_day_overrides (company_id, override_date);
