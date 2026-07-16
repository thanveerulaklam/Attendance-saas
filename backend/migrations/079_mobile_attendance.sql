-- Mobile attendance (QR + geofence) — additive, default off for existing companies.

-- 1) Company-level feature flag
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS mobile_attendance_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN companies.mobile_attendance_enabled IS
  'When false, mobile punch APIs return 403. Existing companies unchanged.';

-- 2) Branch geofence (mobile sites are branch-scoped)
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS mobile_attendance_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN branches.mobile_attendance_enabled IS
  'Per-branch mobile punch toggle; HR can disable one site without turning off company flag.';

-- 3) Per-employee attendance channel
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS attendance_channel VARCHAR(20) NOT NULL DEFAULT 'device';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_attendance_channel_check'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_attendance_channel_check
      CHECK (attendance_channel IN ('device', 'mobile', 'both'));
  END IF;
END $$;

-- 4) Mobile punch metadata on logs (nullable — old rows unaffected)
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS punch_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS qr_nonce VARCHAR(64);

-- Optional clarity backfill for existing rows
UPDATE attendance_logs
SET punch_source = CASE
  WHEN device_id = 'manual' THEN 'manual'
  WHEN device_id IS NOT NULL AND device_id <> 'manual' THEN 'device'
  ELSE punch_source
END
WHERE punch_source IS NULL;

-- 5) Short-lived QR nonces (anti photo-replay)
CREATE TABLE IF NOT EXISTS mobile_qr_nonces (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id    BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  nonce        VARCHAR(64) NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_qr_nonces_lookup
  ON mobile_qr_nonces (nonce, expires_at);

CREATE INDEX IF NOT EXISTS idx_mobile_qr_nonces_branch_active
  ON mobile_qr_nonces (branch_id, expires_at DESC);

-- 6) Punch attempt audit (fraud/debug)
CREATE TABLE IF NOT EXISTS mobile_punch_attempts (
  id                  BIGSERIAL PRIMARY KEY,
  company_id          BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id         BIGINT REFERENCES employees(id) ON DELETE SET NULL,
  branch_id           BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  status              VARCHAR(30) NOT NULL,
  reject_reason       VARCHAR(100),
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  location_accuracy_m DOUBLE PRECISION,
  qr_nonce            VARCHAR(64),
  client_ip           INET,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_punch_attempts_company_created
  ON mobile_punch_attempts (company_id, created_at DESC);
