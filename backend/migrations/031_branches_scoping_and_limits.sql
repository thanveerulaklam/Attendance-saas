-- Branches under each company; branch_id on employees/devices/attendance_logs;
-- user_branch_assignments for HR visibility; employee_limit_override on companies.

-- 1) Per-company employee cap override (NULL = use plan_code mapping in app)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS employee_limit_override INTEGER;

COMMENT ON COLUMN companies.employee_limit_override IS 'If set, caps active employees for this company; NULL uses plan_code default.';

-- 2) Branches
CREATE TABLE IF NOT EXISTS branches (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    address      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_company_id ON branches (company_id);

-- 3) Nullable branch_id columns (backfilled below)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees (branch_id);
CREATE INDEX IF NOT EXISTS idx_devices_branch_id ON devices (branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_branch_id ON attendance_logs (branch_id);

-- 4) Default branch per company + backfill
INSERT INTO branches (company_id, name, address)
SELECT c.id, 'Main', NULL
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.company_id = c.id);

UPDATE employees e
SET branch_id = (
  SELECT b.id FROM branches b WHERE b.company_id = e.company_id ORDER BY b.id LIMIT 1
)
WHERE e.branch_id IS NULL;

UPDATE devices d
SET branch_id = (
  SELECT b.id FROM branches b WHERE b.company_id = d.company_id ORDER BY b.id LIMIT 1
)
WHERE d.branch_id IS NULL;

UPDATE attendance_logs al
SET branch_id = (
  SELECT e.branch_id FROM employees e WHERE e.id = al.employee_id
)
WHERE al.branch_id IS NULL;

-- Require branch on employees and devices after backfill
ALTER TABLE employees ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE devices ALTER COLUMN branch_id SET NOT NULL;

-- attendance_logs may still have NULL if orphan (should not); set to company default branch
UPDATE attendance_logs al
SET branch_id = (
  SELECT b.id FROM branches b WHERE b.company_id = al.company_id ORDER BY b.id LIMIT 1
)
WHERE al.branch_id IS NULL;

ALTER TABLE attendance_logs ALTER COLUMN branch_id SET NOT NULL;

-- 5) User <-> branch assignments (HR; superadmin-managed)
CREATE TABLE IF NOT EXISTS user_branch_assignments (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id    BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_branch_assignments_user_branch_unique UNIQUE (user_id, branch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_branch_assignments_one_default
  ON user_branch_assignments (user_id)
  WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_branch_assignments_user_id ON user_branch_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_assignments_branch_id ON user_branch_assignments (branch_id);

-- Seed HR users: assign to their company's default branch as default
INSERT INTO user_branch_assignments (user_id, branch_id, is_default)
SELECT u.id, b.id, TRUE
FROM users u
JOIN branches b ON b.company_id = u.company_id
WHERE u.role = 'hr'
  AND NOT EXISTS (
    SELECT 1 FROM user_branch_assignments uba WHERE uba.user_id = u.id
  )
  AND b.id = (SELECT b2.id FROM branches b2 WHERE b2.company_id = u.company_id ORDER BY b2.id LIMIT 1);
