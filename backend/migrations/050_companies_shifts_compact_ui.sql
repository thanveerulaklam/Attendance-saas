-- When true, Shifts UI omits manual deduction fields (weekly off, late, no-leave incentive, lunch-over deductions)
-- and POST/PUT shifts neutralize those columns (Tharagai Readymades–style hours-based payroll).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS shifts_compact_ui BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN companies.shifts_compact_ui IS 'Simplified shifts UI + neutral legacy shift columns; enabled for Tharagai Readymades (company id 10).';

UPDATE companies
SET shifts_compact_ui = TRUE
WHERE id = 10;
