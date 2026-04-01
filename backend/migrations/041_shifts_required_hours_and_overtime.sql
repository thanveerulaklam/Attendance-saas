ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS required_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8;

ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS allow_overtime BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE shifts
DROP CONSTRAINT IF EXISTS shifts_required_hours_per_day_check;

ALTER TABLE shifts
ADD CONSTRAINT shifts_required_hours_per_day_check
CHECK (required_hours_per_day > 0 AND required_hours_per_day <= 24);

