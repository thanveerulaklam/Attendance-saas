-- Protect kiosk employee enrollment and attendance history from floor users.
ALTER TABLE branch_kiosk_devices
  ADD COLUMN IF NOT EXISTS settings_pin_hash VARCHAR(100);

