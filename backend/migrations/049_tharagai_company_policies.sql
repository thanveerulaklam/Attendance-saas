-- Tharagai-style company policies: optional hours-based-only shifts + paid leave forfeit when absence exceeds a threshold.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS hours_based_shifts_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS paid_leave_forfeit_if_absence_gt SMALLINT NULL;

COMMENT ON COLUMN companies.hours_based_shifts_only IS 'When true, only hours_based attendance_mode is allowed for shifts.';
COMMENT ON COLUMN companies.paid_leave_forfeit_if_absence_gt IS 'If set, paid leave allowance from shift is zero when monthly rawAbsenceDays exceeds this number.';

-- Tharagai Readymades: hours-based shifts only; 3 PL from shift only if absent days <= 6 (enforced in payroll).
UPDATE companies
SET
  hours_based_shifts_only = TRUE,
  paid_leave_forfeit_if_absence_gt = 6
WHERE id = 10;
