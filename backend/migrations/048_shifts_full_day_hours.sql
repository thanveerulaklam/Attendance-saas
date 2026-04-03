-- Minimum worked hours (excluding lunch gap) required for a paid full day when the 4-punch pattern is complete.
-- NULL = use (shift end − start in hours) − (allotted lunch in hours).
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS full_day_hours NUMERIC(5, 2);

ALTER TABLE shifts
  DROP CONSTRAINT IF EXISTS shifts_full_day_hours_check;

ALTER TABLE shifts
  ADD CONSTRAINT shifts_full_day_hours_check
  CHECK (full_day_hours IS NULL OR (full_day_hours >= 0 AND full_day_hours <= 24));
