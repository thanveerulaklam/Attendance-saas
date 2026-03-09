-- Allow per-shift paid leave allowance (days per month)

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS paid_leave_days INTEGER NOT NULL DEFAULT 0;

