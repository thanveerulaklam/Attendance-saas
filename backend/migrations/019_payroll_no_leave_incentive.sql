-- Incentive amount for staff with no leave (only holidays) in the payroll period

ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS no_leave_incentive NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN payroll_records.no_leave_incentive IS 'Incentive added when employee has zero absence days in the period';
