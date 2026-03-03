-- Per-shift no-leave incentive amount (optional).
-- This allows different shifts to have different no-leave incentives.

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS no_leave_incentive NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'shifts_no_leave_incentive_check'
    ) THEN
        ALTER TABLE shifts
            ADD CONSTRAINT shifts_no_leave_incentive_check
            CHECK (no_leave_incentive >= 0);
    END IF;
END;
$$;

