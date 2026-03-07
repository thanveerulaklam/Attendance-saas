-- Daily travel allowance (per working day when present). Applied only on non-holiday working days.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS daily_travel_allowance NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.daily_travel_allowance IS 'Amount added per working day when employee is present; not applied on holidays.';
