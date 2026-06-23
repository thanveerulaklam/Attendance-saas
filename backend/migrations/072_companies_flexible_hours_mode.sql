-- Hospital / flexible hours: daily tracking, monthly hours payroll settlement.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS flexible_hours_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN companies.flexible_hours_mode IS
  'When true, attendance is tracked daily but payroll settles on monthly total hours worked; mutually exclusive with enable_shift_rotation.';
