-- PunchPay Field (selfie + GPS). Additive; default off for existing companies.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS field_attendance_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN companies.field_attendance_enabled IS
  'When false, PunchPay Field punch APIs return 403. Independent of QR office mobile.';

CREATE TABLE IF NOT EXISTS field_sites (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         VARCHAR(120) NOT NULL,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  radius_m     INTEGER NOT NULL DEFAULT 200,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT field_sites_lat_check CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT field_sites_lng_check CHECK (longitude >= -180 AND longitude <= 180),
  CONSTRAINT field_sites_radius_check CHECK (radius_m >= 50 AND radius_m <= 5000)
);

CREATE INDEX IF NOT EXISTS idx_field_sites_company
  ON field_sites (company_id, name);

CREATE TABLE IF NOT EXISTS employee_field_sites (
  employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  field_site_id BIGINT NOT NULL REFERENCES field_sites(id) ON DELETE CASCADE,
  company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, field_site_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_field_sites_company
  ON employee_field_sites (company_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_field_sites_site
  ON employee_field_sites (field_site_id);

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS field_site_id BIGINT REFERENCES field_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_field_site
  ON attendance_logs (company_id, field_site_id)
  WHERE field_site_id IS NOT NULL;

ALTER TABLE mobile_punch_attempts
  ADD COLUMN IF NOT EXISTS punch_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS field_site_id BIGINT REFERENCES field_sites(id) ON DELETE SET NULL;

UPDATE mobile_punch_attempts
SET punch_source = CASE
  WHEN qr_nonce IS NOT NULL THEN 'mobile'
  WHEN punch_source IS NULL THEN 'kiosk'
  ELSE punch_source
END
WHERE punch_source IS NULL;
