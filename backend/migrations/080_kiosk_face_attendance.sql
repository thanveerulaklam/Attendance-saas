-- Kiosk face attendance: one tablet per branch, face enrollment per employee.

CREATE TABLE IF NOT EXISTS branch_kiosk_devices (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id    BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  label        VARCHAR(100) NOT NULL DEFAULT 'Reception tablet',
  token_key    VARCHAR(64) NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id),
  UNIQUE (token_key)
);

CREATE INDEX IF NOT EXISTS idx_branch_kiosk_devices_company
  ON branch_kiosk_devices (company_id);

CREATE TABLE IF NOT EXISTS employee_face_enrollments (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  embedding    JSONB NOT NULL,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_face_enrollments_company
  ON employee_face_enrollments (company_id);
