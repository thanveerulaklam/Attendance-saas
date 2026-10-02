-- Door-to-door Field beat: start/end of day + visit check-ins (no live tracking).

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS field_beat_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN employees.field_beat_enabled IS
  'When true, PunchPay Field uses Start day / Visit / End day instead of assigned-site IN/OUT.';

CREATE TABLE IF NOT EXISTS field_days (
  id                 BIGSERIAL PRIMARY KEY,
  company_id         BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id        BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date          DATE NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ,
  start_latitude     DOUBLE PRECISION NOT NULL,
  start_longitude    DOUBLE PRECISION NOT NULL,
  start_accuracy_m   DOUBLE PRECISION,
  end_latitude       DOUBLE PRECISION,
  end_longitude      DOUBLE PRECISION,
  end_accuracy_m     DOUBLE PRECISION,
  start_punch_id     BIGINT REFERENCES attendance_logs(id) ON DELETE SET NULL,
  end_punch_id       BIGINT REFERENCES attendance_logs(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT field_days_unique_employee_date UNIQUE (company_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_field_days_company_date
  ON field_days (company_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_field_days_employee
  ON field_days (employee_id, work_date DESC);

CREATE TABLE IF NOT EXISTS field_visits (
  id                   BIGSERIAL PRIMARY KEY,
  company_id           BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id          BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  field_day_id         BIGINT NOT NULL REFERENCES field_days(id) ON DELETE CASCADE,
  visited_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude             DOUBLE PRECISION NOT NULL,
  longitude            DOUBLE PRECISION NOT NULL,
  location_accuracy_m  DOUBLE PRECISION,
  label                VARCHAR(120),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_visits_day
  ON field_visits (field_day_id, visited_at ASC);

CREATE INDEX IF NOT EXISTS idx_field_visits_company_date
  ON field_visits (company_id, visited_at DESC);
