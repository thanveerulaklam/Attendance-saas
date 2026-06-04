-- Automatic shift rotation groups (factory mode only).
CREATE TABLE IF NOT EXISTS shift_rotation_groups (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    shift_a_id          BIGINT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    shift_b_id          BIGINT NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    shift_c_id          BIGINT REFERENCES shifts(id) ON DELETE RESTRICT,
    interval_weeks      INTEGER NOT NULL DEFAULT 2,
    anchor_date         DATE NOT NULL,
    next_rotation_date  DATE NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT shift_rotation_groups_interval_weeks_check CHECK (interval_weeks >= 1)
);

CREATE TABLE IF NOT EXISTS shift_rotation_group_members (
    group_id    BIGINT NOT NULL REFERENCES shift_rotation_groups(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    slot        CHAR(1) NOT NULL,
    PRIMARY KEY (group_id, employee_id),
    CONSTRAINT shift_rotation_group_members_slot_check CHECK (slot IN ('A', 'B', 'C'))
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'employee_shift_assignments_rotation_group_fk'
    ) THEN
        ALTER TABLE employee_shift_assignments
            ADD CONSTRAINT employee_shift_assignments_rotation_group_fk
            FOREIGN KEY (rotation_group_id) REFERENCES shift_rotation_groups(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shift_rotation_groups_next
    ON shift_rotation_groups (company_id, next_rotation_date)
    WHERE is_active = TRUE;
