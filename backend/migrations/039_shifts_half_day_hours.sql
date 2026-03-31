ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS half_day_hours NUMERIC(4,2);

ALTER TABLE shifts
DROP CONSTRAINT IF EXISTS shifts_half_day_hours_check;

ALTER TABLE shifts
ADD CONSTRAINT shifts_half_day_hours_check
CHECK (half_day_hours IS NULL OR (half_day_hours >= 0 AND half_day_hours <= 24));

