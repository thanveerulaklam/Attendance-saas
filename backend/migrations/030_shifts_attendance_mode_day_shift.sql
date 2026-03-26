-- Rename legacy "shift_based" (same-calendar-day) to "day_based".
-- New "shift_based" means overnight shifts (end time before start time on clock).
UPDATE shifts
SET attendance_mode = 'day_based'
WHERE attendance_mode IS NULL
   OR attendance_mode = 'shift_based';
