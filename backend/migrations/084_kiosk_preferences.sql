-- Per-branch kiosk preferences (duplicate face recognition cooldown).
ALTER TABLE branch_kiosk_devices
  ADD COLUMN IF NOT EXISTS duplicate_punch_seconds INTEGER NOT NULL DEFAULT 90
    CHECK (duplicate_punch_seconds >= 15 AND duplicate_punch_seconds <= 600);
