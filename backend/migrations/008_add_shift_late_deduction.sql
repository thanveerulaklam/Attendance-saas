-- Add optional late arrival deduction configuration to shifts

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS late_deduction_minutes INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS late_deduction_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'shifts_late_deduction_minutes_check'
    ) THEN
        ALTER TABLE shifts
            ADD CONSTRAINT shifts_late_deduction_minutes_check
            CHECK (late_deduction_minutes >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'shifts_late_deduction_amount_check'
    ) THEN
        ALTER TABLE shifts
            ADD CONSTRAINT shifts_late_deduction_amount_check
            CHECK (late_deduction_amount >= 0);
    END IF;
END;
$$;

