-- A month can keep one pending installment and also store the amount already
-- collected against that same month. Only one pending row is allowed per loan.

DO $$
DECLARE
  cons text;
BEGIN
  SELECT c.conname INTO cons
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'employee_advance_repayments'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) ILIKE '%loan_id%'
    AND pg_get_constraintdef(c.oid) ILIKE '%year%'
    AND pg_get_constraintdef(c.oid) ILIKE '%month%';
  IF cons IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employee_advance_repayments DROP CONSTRAINT %I', cons);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employee_advance_repayments_one_pending_month
  ON employee_advance_repayments (loan_id, year, month)
  WHERE status = 'pending';
