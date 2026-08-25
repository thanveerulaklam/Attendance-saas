-- Per-shift named breaks plus late/overtime pay customization.
-- Existing shifts keep current payroll math until an admin changes the new fields.

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS late_deduction_mode VARCHAR(20) NOT NULL DEFAULT 'per_day',
  ADD COLUMN IF NOT EXISTS overtime_pay_mode VARCHAR(20) NOT NULL DEFAULT 'per_hour',
  ADD COLUMN IF NOT EXISTS overtime_window VARCHAR(20) NOT NULL DEFAULT 'total_extra';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shifts_late_deduction_mode_check'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_late_deduction_mode_check
      CHECK (late_deduction_mode IN ('per_day', 'per_minute'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shifts_overtime_pay_mode_check'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_overtime_pay_mode_check
      CHECK (overtime_pay_mode IN ('per_hour', 'per_day', 'per_minute'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shifts_overtime_window_check'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_overtime_window_check
      CHECK (overtime_window IN ('after_end', 'before_start', 'both', 'total_extra'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shift_breaks (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id BIGINT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  allotted_minutes INTEGER NOT NULL DEFAULT 0,
  window_start TIME NULL,
  window_end TIME NULL,
  tracking VARCHAR(20) NOT NULL DEFAULT 'punch',
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  over_deduction_mode VARCHAR(20) NOT NULL DEFAULT 'none',
  over_deduction_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  over_deduction_minutes INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shift_breaks_allotted_minutes_check CHECK (allotted_minutes >= 0),
  CONSTRAINT shift_breaks_tracking_check CHECK (tracking IN ('punch', 'scheduled')),
  CONSTRAINT shift_breaks_over_deduction_mode_check
    CHECK (over_deduction_mode IN ('none', 'per_day', 'per_minute')),
  CONSTRAINT shift_breaks_over_deduction_amount_check CHECK (over_deduction_amount >= 0),
  CONSTRAINT shift_breaks_over_deduction_minutes_check CHECK (over_deduction_minutes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_shift_breaks_shift_id ON shift_breaks (shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_breaks_company_id ON shift_breaks (company_id);

-- Seed one Lunch break from existing allotted minutes (including 0-minute hours-based lunches).
INSERT INTO shift_breaks (
  company_id,
  shift_id,
  name,
  allotted_minutes,
  tracking,
  paid,
  over_deduction_mode,
  over_deduction_amount,
  over_deduction_minutes,
  sort_order
)
SELECT
  s.company_id,
  s.id,
  'Lunch',
  COALESCE(s.lunch_minutes, 0),
  'punch',
  FALSE,
  CASE
    WHEN COALESCE(s.lunch_over_deduction_minutes, 0) > 0
      AND COALESCE(s.lunch_over_deduction_amount, 0) > 0
    THEN 'per_day'
    ELSE 'none'
  END,
  COALESCE(s.lunch_over_deduction_amount, 0),
  COALESCE(s.lunch_over_deduction_minutes, 0),
  0
FROM shifts s
WHERE NOT EXISTS (
  SELECT 1 FROM shift_breaks b WHERE b.shift_id = s.id
);

COMMENT ON COLUMN shifts.late_deduction_mode IS
  'per_day: lateDays × amount (legacy). per_minute: lateMinutes × amount.';
COMMENT ON COLUMN shifts.overtime_pay_mode IS
  'per_hour: extra hours × rate (legacy). per_day: overtimeDays × amount. per_minute: overtimeMinutes × amount.';
COMMENT ON COLUMN shifts.overtime_window IS
  'total_extra: worked vs shift length (legacy). after_end / before_start / both: clock-window OT.';
COMMENT ON TABLE shift_breaks IS
  'Named breaks (lunch, tea, prayer, dinner) configured per shift.';
