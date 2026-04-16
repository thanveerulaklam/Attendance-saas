ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS adms_sn VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_adms_sn_unique
  ON devices (adms_sn)
  WHERE adms_sn IS NOT NULL;
