ALTER TABLE payroll_records
ADD COLUMN IF NOT EXISTS unused_paid_leave_days NUMERIC(6,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_leave_encashment_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

