-- Per-day attendance overrides (e.g. mark absent/leave day as on-duty for payroll)

CREATE TABLE IF NOT EXISTS attendance_day_overrides (
    id               BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id      BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_date  DATE NOT NULL,
    override_status  VARCHAR(20) NOT NULL,
    note             TEXT,
    created_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT attendance_day_overrides_status_check
        CHECK (override_status IN ('on_duty')),
    CONSTRAINT attendance_day_overrides_unique
        UNIQUE (company_id, employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_day_overrides_company_employee_date
    ON attendance_day_overrides (company_id, employee_id, attendance_date);
