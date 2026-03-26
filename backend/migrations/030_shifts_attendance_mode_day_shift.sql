-- Legacy check from 025 only allowed shift_based | hours_based. Allow day_based before data update.
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_attendance_mode_check;

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
