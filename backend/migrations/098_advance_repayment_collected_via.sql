-- Cash collected on the Advance page reduces the loan, but it is not a salary deduction.
-- Payroll only deducts rows collected via payroll.

ALTER TABLE employee_advance_repayments
  ADD COLUMN IF NOT EXISTS collected_via VARCHAR(20) NOT NULL DEFAULT 'payroll';

ALTER TABLE employee_advance_repayments
  DROP CONSTRAINT IF EXISTS employee_advance_repayments_collected_via_check;

ALTER TABLE employee_advance_repayments
  ADD CONSTRAINT employee_advance_repayments_collected_via_check
  CHECK (collected_via IN ('payroll', 'cash'));
