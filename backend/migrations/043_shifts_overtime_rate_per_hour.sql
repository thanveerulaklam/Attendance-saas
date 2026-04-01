ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS overtime_rate_per_hour NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE shifts
DROP CONSTRAINT IF EXISTS shifts_overtime_rate_per_hour_check;

ALTER TABLE shifts
ADD CONSTRAINT shifts_overtime_rate_per_hour_check
CHECK (overtime_rate_per_hour >= 0);

