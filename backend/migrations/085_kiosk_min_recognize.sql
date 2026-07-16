-- Minimum continuous face recognition time before a kiosk punch is recorded.
ALTER TABLE branch_kiosk_devices
  ADD COLUMN IF NOT EXISTS min_recognize_seconds INTEGER NOT NULL DEFAULT 2
    CHECK (min_recognize_seconds >= 0 AND min_recognize_seconds <= 10);
