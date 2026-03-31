ALTER TABLE payroll_records
ADD COLUMN IF NOT EXISTS treat_holiday_adjacent_absence_as_working BOOLEAN NOT NULL DEFAULT FALSE;

