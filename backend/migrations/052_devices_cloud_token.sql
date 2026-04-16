ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS cloud_token VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_cloud_token_unique
  ON devices (cloud_token)
  WHERE cloud_token IS NOT NULL;
