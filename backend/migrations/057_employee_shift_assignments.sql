-- Dated shift assignments per employee (used when companies.enable_shift_rotation = true).
CREATE TABLE IF NOT EXISTS employee_shift_assignments (
    id                BIGSERIAL PRIMARY KEY,
    company_id        BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id          BIGINT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    effective_from    DATE NOT NULL,
    effective_to      DATE,
    source            VARCHAR(30) NOT NULL DEFAULT 'manual',
    rotation_group_id BIGINT,
    notes             TEXT,
    created_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT employee_shift_assignments_effective_range_check
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT employee_shift_assignments_source_check
        CHECK (source IN ('manual', 'rotation', 'import', 'initial'))
);

CREATE INDEX IF NOT EXISTS idx_employee_shift_assignments_lookup
    ON employee_shift_assignments (company_id, employee_id, effective_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_shift_assignments_unique_start
    ON employee_shift_assignments (employee_id, effective_from);

COMMENT ON TABLE employee_shift_assignments IS
  'Historical and scheduled shift assignments; only active when enable_shift_rotation is true.';
