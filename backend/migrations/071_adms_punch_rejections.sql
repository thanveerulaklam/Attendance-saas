CREATE TABLE IF NOT EXISTS adms_punch_rejections (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL,
  adms_sn VARCHAR(64),
  employee_code VARCHAR(64) NOT NULL,
  punch_time TIMESTAMPTZ,
  reason VARCHAR(32) NOT NULL,
  raw_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adms_punch_rejections_company_created
  ON adms_punch_rejections (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adms_punch_rejections_code_created
  ON adms_punch_rejections (employee_code, created_at DESC);
