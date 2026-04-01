-- Legacy check from 025 only allowed shift_based | hours_based. Allow day_based before data update.
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_attendance_mode_check;

-- Some databases may not have run the original attendance_mode introduction migration.
-- Make this migration self-contained and idempotent.
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS attendance_mode VARCHAR(20);

-- Rename legacy "shift_based" (same-calendar-day) to "day_based".
-- New "shift_based" means overnight shifts (end time before start time on clock).
UPDATE shifts
SET attendance_mode = 'day_based'
WHERE attendance_mode IS NULL
   OR attendance_mode = 'shift_based';

ALTER TABLE shifts
  ADD CONSTRAINT shifts_attendance_mode_check
  CHECK (
    attendance_mode IS NULL
    OR attendance_mode IN ('day_based', 'shift_based', 'hours_based')
  );
