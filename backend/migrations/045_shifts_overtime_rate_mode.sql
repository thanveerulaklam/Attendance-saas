-- Overtime rate source:
-- - fixed: use shifts.overtime_rate_per_hour
-- - auto: compute overtime rate per hour based on employee daily wage and shift configured work hours
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS overtime_rate_mode VARCHAR(20) NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shifts_overtime_rate_mode_check'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_overtime_rate_mode_check
      CHECK (overtime_rate_mode IN ('fixed', 'auto'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shifts_overtime_rate_mode
  ON shifts (company_id, overtime_rate_mode);

