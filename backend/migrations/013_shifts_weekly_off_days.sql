-- Per-shift weekly off days (paid holidays). 0=Sunday, 6=Saturday.
-- When set, used for payroll/attendance for that shift; else company_weekly_offs is used.

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS weekly_off_days SMALLINT[] DEFAULT '{}';

COMMENT ON COLUMN shifts.weekly_off_days IS 'Day-of-week numbers (0=Sun..6=Sat) that are paid weekly off for this shift';
