-- Permanent 8-character kiosk pairing code per branch (admin-visible).
ALTER TABLE branch_kiosk_devices
  ADD COLUMN IF NOT EXISTS kiosk_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS settings_pin VARCHAR(6);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_kiosk_devices_kiosk_code
  ON branch_kiosk_devices (kiosk_code)
  WHERE kiosk_code IS NOT NULL;
